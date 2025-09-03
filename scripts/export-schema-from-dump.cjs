#!/usr/bin/env node
/**
 * CLI-based schema exporter (fallback when direct PG connection is blocked).
 * Steps:
 * 1. Runs `supabase db dump` for listed schemas (structure only).
 * 2. Parses dump into:
 *    - supabase/database-context/tables/<schema>__<table>.sql
 *    - supabase/database-context/functions/<schema>__<function>.sql
 *    - supabase/database-context/triggers/<schema>__<table>__<trigger>.sql
 *    - supabase/database-context/enums/<schema>__<type>.sql
 *    - Attaches related RLS (ENABLE/FORCE + CREATE POLICY) to table files.
 *
 * Requires: `npx supabase` logged in (run `npx supabase login` if not already) OR env SUPABASE_ACCESS_TOKEN.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'rclpyipeytqbamiwcuih';
const SCHEMAS = (process.env.EXPORT_SCHEMAS || 'public,billing').split(',').map(s=>s.trim()).filter(Boolean);
const BASE_DIR = path.resolve('supabase','database-context');
const RAW_DIR = path.join(BASE_DIR, 'raw');
const OUT = {
  tables: path.join(BASE_DIR,'tables'),
  functions: path.join(BASE_DIR,'functions'),
  triggers: path.join(BASE_DIR,'triggers'),
  enums: path.join(BASE_DIR,'enums')
};
for (const d of Object.values(OUT)) fs.mkdirSync(d,{recursive:true});
fs.mkdirSync(RAW_DIR,{recursive:true});

function run(cmd, args, opts={}) {
  const r = spawnSync(cmd, args, { stdio:'pipe', encoding:'utf8', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`Command failed (${cmd} ${args.join(' ')}):\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
}

function sanitize(name){return name.replace(/[^A-Za-z0-9_]/g,'_').replace(/__+/g,'_');}

function ensureLinked() {
  // Attempt to link if config not present.
  const configPath = path.join('.','supabase','config.toml');
  if (fs.existsSync(configPath)) return;
  console.log('[link] Attempting to link project', PROJECT_REF);
  try { run('npx',['--yes','supabase','link','--project-ref',PROJECT_REF]); } catch (e) { console.warn('[link] Failed (may already be linked):', e.message); }
}

function dump() {
  ensureLinked();
  const file = path.join(RAW_DIR, 'schema_dump.sql');
  const args = ['--yes','supabase','db','dump'];
  args.push('--schema', SCHEMAS.join(','));
  // Keep structure+data? For context we only need structure; CLI lacks exclude flag version here -> proceed with full then we'll filter.
  args.push('--file', file);
  console.log('[dump] Running Supabase CLI (linked project)...');
  run('npx', args);
  console.log('[dump] Wrote raw dump to', file);
  return file;
}

function split(file) {
  const sql = fs.readFileSync(file,'utf8');
  // Collect statements respecting dollar-quoted function bodies.
  const statements = [];
  let current = '';
  let dollarTag = null; // e.g. $$ or $func$
  let lineCount = 0;
  for (const line of sql.split(/\r?\n/)) {
    lineCount++;
    current += line + '\n';
    // Enter / exit dollar quote
    const tagMatch = line.match(/^\s*\$[a-zA-Z0-9_]*\$/);
    if (tagMatch) {
      const tag = tagMatch[0];
      if (!dollarTag) dollarTag = tag; else if (dollarTag === tag) dollarTag = null;
    }
    if (!dollarTag && /;\s*$/.test(line)) {
      statements.push(current.trim());
      current='';
    }
  }
  // Maps
  const tableContent = {}; // key schema.table -> {ddl, rls:[], policies:[]}
  const functions = [];
  const triggers = [];
  const enums = [];
  let tableMatches = 0;

  const tableCreateRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?\."?([A-Za-z0-9_]+)"?/i;
  const policyRe = /^CREATE\s+POLICY\s+([\w"_]+).*?ON\s+([\w"]+)\.([\w"]+)/i;
  const alterRlsRe = /^ALTER\s+TABLE\s+ONLY\s+([\w"]+)\.([\w"]+)\s+(ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY/i;
  const alterRlsAltRe = /^ALTER\s+TABLE\s+([\w"]+)\.([\w"]+)\s+(ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY/i;
  const funcRe = /^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w"]+)\.([\w".]+)\s*\(/i;
  const triggerRe = /^CREATE\s+TRIGGER\s+([\w"_]+)\s+.*?ON\s+([\w"]+)\.([\w"]+)/is;
  const enumRe = /^CREATE\s+TYPE\s+([\w"]+)\.([\w"]+)\s+AS\s+ENUM\s*\(/i;

  function key(schema, table){return `${schema}.${table}`;}

  for (const stmt of statements) {
    let m;
  if (!m && (m = stmt.match(tableCreateRe))) {
      const schema = m[1].replace(/"/g,'');
      const table = m[2].replace(/"/g,'');
      tableContent[key(schema,table)] = tableContent[key(schema,table)] || { ddl: stmt, rls: [], policies: [] };
      tableMatches++;
      continue;
    }
    if ((m = stmt.match(policyRe))) {
      const schema = m[2].replace(/"/g,'');
      const table = m[3].replace(/"/g,'');
      const k = key(schema,table);
      tableContent[k] = tableContent[k] || { ddl: null, rls: [], policies: [] };
      tableContent[k].policies.push(stmt);
      continue;
    }
    if ((m = stmt.match(alterRlsRe)) || (m = stmt.match(alterRlsAltRe))) {
      const schema = m[1].replace(/"/g,'');
      const table = m[2].replace(/"/g,'');
      const k = key(schema,table);
      tableContent[k] = tableContent[k] || { ddl: null, rls: [], policies: [] };
      tableContent[k].rls.push(stmt);
      continue;
    }
  if (!m && (m = stmt.match(funcRe))) {
      functions.push(stmt);
      continue;
    }
  if (!m && (m = stmt.match(triggerRe))) {
      triggers.push(stmt);
      continue;
    }
  if (!m && (m = stmt.match(enumRe))) {
      enums.push(stmt);
      continue;
    }
  }

  console.log(`[split] Total lines: ${lineCount}`);
  console.log(`[split] Total statements: ${statements.length}`);
  console.log(`[split] Table statements matched: ${tableMatches}`);
  console.log(`[split] Policies matched: ${Object.values(tableContent).reduce((a,o)=>a+o.policies.length,0)}`);
  console.log(`[split] RLS alters matched: ${Object.values(tableContent).reduce((a,o)=>a+o.rls.length,0)}`);
  console.log(`[split] Functions matched: ${functions.length}`);
  console.log(`[split] Triggers matched: ${triggers.length}`);
  console.log(`[split] Enums matched: ${enums.length}`);

  // Fallback: if no tables matched, use broad regex scan like reference script
  if (tableMatches === 0) {
    console.log('[split][fallback] No tables captured with statement splitter. Running broad regex scan...');
    const createTableRegex = /(CREATE\s+TABLE\s+[^;]*?;)/gis;
    let mt, fbCount = 0; const seen = new Set();
    while ((mt = createTableRegex.exec(sql)) !== null) {
      const block = mt[1];
      const nameMatch = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"']+)\.("?[A-Za-z0-9_]+"?)/i.exec(block);
      if (!nameMatch) continue;
      const schema = nameMatch[1].replace(/^['"]|['"]$/g,'');
      const rawTable = nameMatch[2].replace(/^['"]|['"]$/g,'');
      if (!SCHEMAS.includes(schema)) continue;
      const keyId = key(schema, rawTable);
      if (seen.has(keyId)) continue;
      seen.add(keyId);
      tableContent[keyId] = tableContent[keyId] || { ddl: block.trim(), rls: [], policies: [] };
      fbCount++;
    }
    console.log(`[split][fallback] Captured tables: ${fbCount}`);
    // Attach policies / RLS from raw file (simple search)
    if (fbCount) {
      const policyRegex = /CREATE\s+POLICY\s+[^;]*?ON\s+([\w"']+)\.([\w"']+)[^;]*?;/gi;
      let mp;
      while ((mp = policyRegex.exec(sql)) !== null) {
        const schema = mp[1].replace(/"/g,'');
        const table = mp[2].replace(/"/g,'');
        const k = key(schema, table);
        if (tableContent[k]) tableContent[k].policies.push(mp[0].trim());
      }
      const rlsRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?([\w"']+)\.([\w"']+)\s+(ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY;/gi;
      let mr;
      while ((mr = rlsRegex.exec(sql)) !== null) {
        const schema = mr[1].replace(/"/g,'');
        const table = mr[2].replace(/"/g,'');
        const k = key(schema, table);
        if (tableContent[k]) tableContent[k].rls.push(mr[0].trim());
      }
    }
  }

  // Write tables
  for (const [k, obj] of Object.entries(tableContent)) {
    const [schema, table] = k.split('.');
    if (!SCHEMAS.includes(schema)) continue;
    const fn = sanitize(`${schema}__${table}.sql`);
    const parts = [];
    parts.push(`-- Schema: ${schema}`);
    parts.push(`-- Table: ${table}`);
    if (obj.ddl) parts.push(obj.ddl);
    if (obj.rls.length) { parts.push('-- RLS'); parts.push(...obj.rls); }
    if (obj.policies.length) { parts.push('-- POLICIES'); parts.push(...obj.policies); }
    fs.writeFileSync(path.join(OUT.tables, fn), parts.join('\n\n')+'\n');
  }

  // Functions
  for (const stmt of functions) {
    const m = stmt.match(funcRe); if (!m) continue; const schema = m[1].replace(/"/g,''); let fname = m[2].replace(/"/g,''); fname = fname.split('.').pop();
    if (!SCHEMAS.includes(schema)) continue;
    fs.writeFileSync(path.join(OUT.functions, sanitize(`${schema}__${fname}.sql`)), stmt + '\n');
  }
  // Triggers
  for (const stmt of triggers) {
    const m = stmt.match(triggerRe); if (!m) continue; const trigger = m[1].replace(/"/g,''); const schema = m[2].replace(/"/g,''); const table = m[3].replace(/"/g,'');
    if (!SCHEMAS.includes(schema)) continue;
    fs.writeFileSync(path.join(OUT.triggers, sanitize(`${schema}__${table}__${trigger}.sql`)), stmt + '\n');
  }
  // Enums
  for (const stmt of enums) {
    const m = stmt.match(enumRe); if (!m) continue; const schema = m[1].replace(/"/g,''); const name = m[2].replace(/"/g,'');
    if (!SCHEMAS.includes(schema)) continue;
    fs.writeFileSync(path.join(OUT.enums, sanitize(`${schema}__${name}.sql`)), stmt + '\n');
  }
}

(async () => {
  console.log('[export-dump] Project:', PROJECT_REF, 'Schemas:', SCHEMAS.join(','));
  try {
    let file = path.join(RAW_DIR,'schema_dump.sql');
    if (!fs.existsSync(file) || process.argv.includes('--redump')) {
      file = dump();
    } else {
      console.log('[export-dump] Reusing existing dump file:', file);
    }
    split(file);
    console.log('[export-dump] Complete.');
  } catch (e) {
    console.error('[export-dump] Failed:', e.message);
    if (/not logged in/i.test(e.message)) {
      console.error('Run: npx supabase login');
    }
    process.exit(1);
  }
})();
