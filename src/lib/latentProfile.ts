// Internal latent character profile schema & validator
// This file defines the TypeScript interface and a runtime validator used before persisting
// Hidden from user surfaces; do NOT expose full profile to clients.

export interface LatentCharacterProfile {
  drives?: { motive_core?: string; hidden_agenda?: string; fear_anchor?: string };
  values_framework?: { value_stack?: string[]; moral_flex_point?: string };
  internal_conflict?: { tension_axis?: string; resolution_pull?: string };
  worldview_profile?: {
    risk_level?: 'very_low'|'low'|'med'|'high'|'very_high';
    authority_posture?: 'defer'|'challenge'|'subvert'|'ignore';
    time_focus?: 'past'|'present'|'future'|'multi';
    worldview_note?: string;
  };
  relational_style?: {
    trust_ramp?: 'fast'|'cautious'|'guarded'|'transactional';
    attachment_flavor?: 'secure'|'avoidant'|'anxious'|'mixed';
    role_self_frame?: 'caretaker'|'mentor'|'disruptor'|'outsider'|'strategist'|'observer';
  };
  cog_emotional_style?: {
    thinking_mode?: 'analytical'|'intuitive'|'heuristic'|'methodical';
    emotional_regulation?: 'stable'|'bursty'|'suppressed'|'volatile';
    escalation_trigger?: string;
  };
  communication_texture?: {
    verbosity?: 'laconic'|'balanced'|'expansive';
    pacing?: 'rapid'|'measured'|'contemplative';
    humor_style?: 'none'|'dry'|'sardonic'|'absurd'|'dark'|'punny'|'wry';
    signature_discourse?: string;
  };
  aesthetic_bias?: {
    palette?: 'minimalist'|'ornate'|'gothic'|'pastoral'|'neon'|'naturalistic'|'utilitarian'|'elegant';
    modesty_to_flaunt?: number; // 0-4
    practicality_bias?: number; // 0-4
  };
  constraint_and_secret?: { limiting_factor?: string; hidden_soft_spot?: string };
  growth_arc_anchor?: { growth_vector?: string; resistance_factor?: string };
  memory_schema?: { defining_memory_type?: 'loss'|'betrayal'|'triumph'|'mentorship'|'failure'|'creation'; schema_bias?: 'betrayal'|'opportunity'|'decay'|'order'|'providence' };
  meta_control?: { confidence_avg?: number };
}

export interface ValidationResult {
  valid: boolean;
  cleaned?: LatentCharacterProfile;
  errors?: string[];
  populatedDomains: number;
  confidenceAvg: number;
}

const DOMAIN_KEYS: (keyof LatentCharacterProfile)[] = [
  'drives','values_framework','internal_conflict','worldview_profile','relational_style','cog_emotional_style','communication_texture','aesthetic_bias','constraint_and_secret','growth_arc_anchor','memory_schema'
];

function isObject(v: any) { return v && typeof v === 'object' && !Array.isArray(v); }

export function validateLatentProfile(raw: any): ValidationResult {
  const errors: string[] = [];
  if (!isObject(raw)) return { valid: false, errors: ['root not object'], populatedDomains: 0, confidenceAvg: 0 };
  const cleaned: LatentCharacterProfile = {};
  let populated = 0;

  function shortTxt(v: any): string | undefined {
    if (typeof v !== 'string') return undefined; const s = v.trim(); if (!s) return undefined; if (s.length > 60) return s.slice(0,60); return s.toLowerCase(); }

  // Helper for enums
  function enumVal<T extends string>(v: any, allowed: readonly T[]): T | undefined { return allowed.includes(v) ? v : undefined; }

  // Drives
  if (isObject(raw.drives)) {
    const o: any = {};
    o.motive_core = shortTxt(raw.drives.motive_core);
    o.hidden_agenda = shortTxt(raw.drives.hidden_agenda);
    o.fear_anchor = shortTxt(raw.drives.fear_anchor);
    if (Object.values(o).some(Boolean)) { cleaned.drives = o; populated++; }
  }
  // Values
  if (isObject(raw.values_framework)) {
    const o: any = {};
    if (Array.isArray(raw.values_framework.value_stack)) {
      const vs = raw.values_framework.value_stack.filter((x: any)=> typeof x==='string').map((x:string)=>x.toLowerCase().trim()).filter(Boolean).slice(0,3);
      if (vs.length>=2) o.value_stack = vs;
    }
    o.moral_flex_point = shortTxt(raw.values_framework.moral_flex_point);
    if (Object.keys(o).length) { cleaned.values_framework = o; populated++; }
  }
  // Internal conflict
  if (isObject(raw.internal_conflict)) {
    const o: any = {};
    const t = shortTxt(raw.internal_conflict.tension_axis);
    if (t && t.includes(' vs ')) o.tension_axis = t;
    const r = shortTxt(raw.internal_conflict.resolution_pull);
    if (r && o.tension_axis && o.tension_axis.split(' vs ').includes(r)) o.resolution_pull = r;
    if (Object.keys(o).length) { cleaned.internal_conflict = o; populated++; }
  }
  // Worldview
  if (isObject(raw.worldview_profile)) {
    const o: any = {};
    const rw = raw.worldview_profile;
    o.risk_level = enumVal(rw.risk_level, ['very_low','low','med','high','very_high']);
    o.authority_posture = enumVal(rw.authority_posture, ['defer','challenge','subvert','ignore']);
    o.time_focus = enumVal(rw.time_focus, ['past','present','future','multi']);
    o.worldview_note = shortTxt(rw.worldview_note);
    Object.keys(o).forEach(k=> o[k]===undefined && delete o[k]);
    if (Object.keys(o).length) { cleaned.worldview_profile = o; populated++; }
  }
  // Relational
  if (isObject(raw.relational_style)) {
    const o: any = {};
    const rr = raw.relational_style;
    o.trust_ramp = enumVal(rr.trust_ramp, ['fast','cautious','guarded','transactional']);
    o.attachment_flavor = enumVal(rr.attachment_flavor, ['secure','avoidant','anxious','mixed']);
    o.role_self_frame = enumVal(rr.role_self_frame, ['caretaker','mentor','disruptor','outsider','strategist','observer']);
    Object.keys(o).forEach(k=> o[k]===undefined && delete o[k]);
    if (Object.keys(o).length) { cleaned.relational_style = o; populated++; }
  }
  // Cog emotional
  if (isObject(raw.cog_emotional_style)) {
    const o: any = {};
    const ce = raw.cog_emotional_style;
    o.thinking_mode = enumVal(ce.thinking_mode, ['analytical','intuitive','heuristic','methodical']);
    o.emotional_regulation = enumVal(ce.emotional_regulation, ['stable','bursty','suppressed','volatile']);
    o.escalation_trigger = shortTxt(ce.escalation_trigger);
    Object.keys(o).forEach(k=> o[k]===undefined && delete o[k]);
    if (Object.keys(o).length) { cleaned.cog_emotional_style = o; populated++; }
  }
  // Communication
  if (isObject(raw.communication_texture)) {
    const o: any = {};
    const ct = raw.communication_texture;
    o.verbosity = enumVal(ct.verbosity, ['laconic','balanced','expansive']);
    o.pacing = enumVal(ct.pacing, ['rapid','measured','contemplative']);
    o.humor_style = enumVal(ct.humor_style, ['none','dry','sardonic','absurd','dark','punny','wry']);
    o.signature_discourse = shortTxt(ct.signature_discourse);
    Object.keys(o).forEach(k=> o[k]===undefined && delete o[k]);
    if (Object.keys(o).length) { cleaned.communication_texture = o; populated++; }
  }
  // Aesthetic
  if (isObject(raw.aesthetic_bias)) {
    const o: any = {};
    const ab = raw.aesthetic_bias;
    o.palette = enumVal(ab.palette, ['minimalist','ornate','gothic','pastoral','neon','naturalistic','utilitarian','elegant']);
    if (Number.isInteger(ab.modesty_to_flaunt) && ab.modesty_to_flaunt>=0 && ab.modesty_to_flaunt<=4) o.modesty_to_flaunt = ab.modesty_to_flaunt;
    if (Number.isInteger(ab.practicality_bias) && ab.practicality_bias>=0 && ab.practicality_bias<=4) o.practicality_bias = ab.practicality_bias;
    Object.keys(o).forEach(k=> o[k]===undefined && delete o[k]);
    if (Object.keys(o).length) { cleaned.aesthetic_bias = o; populated++; }
  }
  // Constraint
  if (isObject(raw.constraint_and_secret)) {
    const o: any = {};
    o.limiting_factor = shortTxt(raw.constraint_and_secret.limiting_factor);
    o.hidden_soft_spot = shortTxt(raw.constraint_and_secret.hidden_soft_spot);
    if (Object.values(o).some(Boolean)) { cleaned.constraint_and_secret = o; populated++; }
  }
  // Growth
  if (isObject(raw.growth_arc_anchor)) {
    const o: any = {};
    o.growth_vector = shortTxt(raw.growth_arc_anchor.growth_vector);
    o.resistance_factor = shortTxt(raw.growth_arc_anchor.resistance_factor);
    if (Object.values(o).some(Boolean)) { cleaned.growth_arc_anchor = o; populated++; }
  }
  // Memory
  if (isObject(raw.memory_schema)) {
    const o: any = {};
    const ms = raw.memory_schema;
    o.defining_memory_type = enumVal(ms.defining_memory_type, ['loss','betrayal','triumph','mentorship','failure','creation']);
    o.schema_bias = enumVal(ms.schema_bias, ['betrayal','opportunity','decay','order','providence']);
    Object.keys(o).forEach(k=> o[k]===undefined && delete o[k]);
    if (Object.keys(o).length) { cleaned.memory_schema = o; populated++; }
  }
  // Meta
  if (isObject(raw.meta_control)) {
    const c = Number(raw.meta_control.confidence_avg);
    if (!Number.isNaN(c) && c>=0 && c<=1) cleaned.meta_control = { confidence_avg: Number(c.toFixed(2)) };
  }

  // Defaults injection (consumer side may still do this)
  if (!cleaned.worldview_profile?.risk_level) cleaned.worldview_profile = { ...(cleaned.worldview_profile||{}), risk_level: 'med' };
  if (!cleaned.communication_texture?.verbosity) cleaned.communication_texture = { ...(cleaned.communication_texture||{}), verbosity: 'balanced' };
  if (!cleaned.communication_texture?.pacing) cleaned.communication_texture!.pacing = 'measured';
  if (!cleaned.communication_texture?.humor_style) cleaned.communication_texture!.humor_style = 'none';
  if (!cleaned.aesthetic_bias?.practicality_bias) cleaned.aesthetic_bias = { ...(cleaned.aesthetic_bias||{}), practicality_bias: 2 };
  if (!cleaned.aesthetic_bias?.modesty_to_flaunt) cleaned.aesthetic_bias!.modesty_to_flaunt = 2;

  const confidence = cleaned.meta_control?.confidence_avg ?? Math.min(1, populated / DOMAIN_KEYS.length);

  return { valid: errors.length===0, cleaned, errors, populatedDomains: populated, confidenceAvg: confidence };
}
