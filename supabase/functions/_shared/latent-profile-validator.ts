// Lightweight latent profile validator for Edge Functions (duplicate of app logic, keep in sync)
// Avoid importing from src/ to prevent bundler path issues.

export interface LatentCharacterProfile {
  drives?: { motive_core?: string; hidden_agenda?: string; fear_anchor?: string };
  values_framework?: { value_stack?: string[]; moral_flex_point?: string };
  internal_conflict?: { tension_axis?: string; resolution_pull?: string };
  worldview_profile?: { risk_level?: string; authority_posture?: string; time_focus?: string; worldview_note?: string };
  relational_style?: { trust_ramp?: string; attachment_flavor?: string; role_self_frame?: string; orientation?: string; intimacy_drive?: string; flirting_style?: string; boundary_note?: string; kinks?: string[]; turn_ons?: string[]; turn_offs?: string[]; fetishes?: string[] };
  cog_emotional_style?: { thinking_mode?: string; emotional_regulation?: string; escalation_trigger?: string };
  communication_texture?: { verbosity?: string; pacing?: string; humor_style?: string; signature_discourse?: string };
  aesthetic_bias?: { palette?: string; modesty_to_flaunt?: number; practicality_bias?: number };
  constraint_and_secret?: { limiting_factor?: string; hidden_soft_spot?: string };
  growth_arc_anchor?: { growth_vector?: string; resistance_factor?: string };
  memory_schema?: { defining_memory_type?: string; schema_bias?: string };
  meta_control?: { confidence_avg?: number };
}

export interface ValidationResult { valid: boolean; cleaned?: LatentCharacterProfile; populatedDomains: number; confidenceAvg: number; }

const ENUMS = {
  risk_level: ['very_low','low','med','high','very_high'],
  authority_posture: ['defer','challenge','subvert','ignore'],
  time_focus: ['past','present','future','multi'],
  trust_ramp: ['fast','cautious','guarded','transactional'],
  attachment_flavor: ['secure','avoidant','anxious','mixed'],
  role_self_frame: ['caretaker','mentor','disruptor','outsider','strategist','observer'],
  thinking_mode: ['analytical','intuitive','heuristic','methodical'],
  emotional_regulation: ['stable','bursty','suppressed','volatile'],
  verbosity: ['laconic','balanced','expansive'],
  pacing: ['rapid','measured','contemplative'],
  humor_style: ['none','dry','sardonic','absurd','dark','punny','wry'],
  palette: ['minimalist','ornate','gothic','pastoral','neon','naturalistic','utilitarian','elegant'],
  defining_memory_type: ['loss','betrayal','triumph','mentorship','failure','creation'],
  schema_bias: ['betrayal','opportunity','decay','order','providence'],
  orientation: ['heterosexual','homosexual','bisexual','pansexual','asexual','demisexual','queer','questioning','unspecified'],
  intimacy_drive: ['low','moderate','high'],
  flirting_style: ['direct','playful','teasing','reserved','intellectual','subtle']
};

function shortTxt(v: any): string | undefined { if (typeof v !== 'string') return undefined; const s = v.trim().toLowerCase(); return s ? s.slice(0,60) : undefined; }
function enumOk(v: any, list: string[]) { return typeof v === 'string' && list.includes(v) ? v : undefined; }
function intIn(v: any, min: number, max: number) { return Number.isInteger(v) && v>=min && v<=max ? v : undefined; }
function listStr(arr: any, maxItems: number) {
  if (!Array.isArray(arr)) return undefined;
  const out = arr
    .filter(x => typeof x === 'string')
    .map(x => x.trim().toLowerCase())
    .filter(x => x.length > 0)
    .map(x => x.slice(0,40));
  if (!out.length) return undefined;
  return out.slice(0, maxItems);
}

export function validateLatentProfile(raw: any): ValidationResult {
  const cleaned: LatentCharacterProfile = {};
  let populated = 0;
  if (!raw || typeof raw !== 'object') return { valid: false, populatedDomains: 0, confidenceAvg: 0 };

  const tryObj = (o:any, cb:(v:any)=>void) => { if (o && typeof o==='object' && !Array.isArray(o)) cb(o); };

  tryObj(raw.drives, d=> { const o:any={}; o.motive_core=shortTxt(d.motive_core); o.hidden_agenda=shortTxt(d.hidden_agenda); o.fear_anchor=shortTxt(d.fear_anchor); if(Object.values(o).some(Boolean)){cleaned.drives=o;populated++;} });
  tryObj(raw.values_framework, v=> { const o:any={}; if(Array.isArray(v.value_stack)){const vs=v.value_stack.filter((x:any)=>typeof x==='string').map((x:string)=>x.toLowerCase().trim()).filter(Boolean).slice(0,3); if(vs.length>=2)o.value_stack=vs;} o.moral_flex_point=shortTxt(v.moral_flex_point); if(Object.keys(o).length) { cleaned.values_framework=o; populated++; } });
  tryObj(raw.internal_conflict, ic=> { const o:any={}; const t=shortTxt(ic.tension_axis); if(t && t.includes(' vs ')) o.tension_axis=t; const r=shortTxt(ic.resolution_pull); if(r && o.tension_axis && o.tension_axis.split(' vs ').includes(r)) o.resolution_pull=r; if(Object.keys(o).length){cleaned.internal_conflict=o;populated++;} });
  tryObj(raw.worldview_profile, w=> { const o:any={}; o.risk_level=enumOk(w.risk_level,ENUMS.risk_level); o.authority_posture=enumOk(w.authority_posture,ENUMS.authority_posture); o.time_focus=enumOk(w.time_focus,ENUMS.time_focus); o.worldview_note=shortTxt(w.worldview_note); Object.keys(o).forEach(k=>o[k]==null&&delete o[k]); if(Object.keys(o).length){cleaned.worldview_profile=o;populated++;} });
  tryObj(raw.relational_style, r=> { const o:any={}; o.trust_ramp=enumOk(r.trust_ramp,ENUMS.trust_ramp); o.attachment_flavor=enumOk(r.attachment_flavor,ENUMS.attachment_flavor); o.role_self_frame=enumOk(r.role_self_frame,ENUMS.role_self_frame); const orient=enumOk(r.orientation,ENUMS.orientation); if(orient) o.orientation=orient; const idrv=enumOk(r.intimacy_drive,ENUMS.intimacy_drive); if(idrv) o.intimacy_drive=idrv; const fstyle=enumOk(r.flirting_style,ENUMS.flirting_style); if(fstyle) o.flirting_style=fstyle; const bnote=shortTxt(r.boundary_note); if(bnote) o.boundary_note=bnote; const k=listStr(r.kinks,8); if(k) o.kinks=k; const tons=listStr(r.turn_ons,8); if(tons) o.turn_ons=tons; const toffs=listStr(r.turn_offs,8); if(toffs) o.turn_offs=toffs; const fets=listStr(r.fetishes,8); if(fets) o.fetishes=fets; Object.keys(o).forEach(k=>o[k]==null&&delete o[k]); if(Object.keys(o).length){cleaned.relational_style=o;populated++;} });
  tryObj(raw.cog_emotional_style, c=> { const o:any={}; o.thinking_mode=enumOk(c.thinking_mode,ENUMS.thinking_mode); o.emotional_regulation=enumOk(c.emotional_regulation,ENUMS.emotional_regulation); o.escalation_trigger=shortTxt(c.escalation_trigger); Object.keys(o).forEach(k=>o[k]==null&&delete o[k]); if(Object.keys(o).length){cleaned.cog_emotional_style=o;populated++;} });
  tryObj(raw.communication_texture, ct=> { const o:any={}; o.verbosity=enumOk(ct.verbosity,ENUMS.verbosity); o.pacing=enumOk(ct.pacing,ENUMS.pacing); o.humor_style=enumOk(ct.humor_style,ENUMS.humor_style); o.signature_discourse=shortTxt(ct.signature_discourse); Object.keys(o).forEach(k=>o[k]==null&&delete o[k]); if(Object.keys(o).length){cleaned.communication_texture=o;populated++;} });
  tryObj(raw.aesthetic_bias, a=> { const o:any={}; o.palette=enumOk(a.palette,ENUMS.palette); const m=intIn(a.modesty_to_flaunt,0,4); if(m!=null) o.modesty_to_flaunt=m; const p=intIn(a.practicality_bias,0,4); if(p!=null) o.practicality_bias=p; if(Object.keys(o).length){cleaned.aesthetic_bias=o;populated++;} });
  tryObj(raw.constraint_and_secret, cs=> { const o:any={}; o.limiting_factor=shortTxt(cs.limiting_factor); o.hidden_soft_spot=shortTxt(cs.hidden_soft_spot); if(Object.values(o).some(Boolean)){cleaned.constraint_and_secret=o;populated++;} });
  tryObj(raw.growth_arc_anchor, g=> { const o:any={}; o.growth_vector=shortTxt(g.growth_vector); o.resistance_factor=shortTxt(g.resistance_factor); if(Object.values(o).some(Boolean)){cleaned.growth_arc_anchor=o;populated++;} });
  tryObj(raw.memory_schema, ms=> { const o:any={}; o.defining_memory_type=enumOk(ms.defining_memory_type,ENUMS.defining_memory_type); o.schema_bias=enumOk(ms.schema_bias,ENUMS.schema_bias); Object.keys(o).forEach(k=>o[k]==null&&delete o[k]); if(Object.keys(o).length){cleaned.memory_schema=o;populated++;} });
  tryObj(raw.meta_control, mc=> { const c=Number(mc.confidence_avg); if(!Number.isNaN(c) && c>=0 && c<=1) cleaned.meta_control={ confidence_avg: Number(c.toFixed(2)) }; });

  // defaults
  cleaned.worldview_profile = { risk_level: cleaned.worldview_profile?.risk_level || 'med', ...(cleaned.worldview_profile||{}) };
  cleaned.communication_texture = { verbosity: cleaned.communication_texture?.verbosity || 'balanced', pacing: cleaned.communication_texture?.pacing || 'measured', humor_style: cleaned.communication_texture?.humor_style || 'none', ...(cleaned.communication_texture||{}) };
  cleaned.aesthetic_bias = { practicality_bias: cleaned.aesthetic_bias?.practicality_bias ?? 2, modesty_to_flaunt: cleaned.aesthetic_bias?.modesty_to_flaunt ?? 2, ...(cleaned.aesthetic_bias||{}) };

  const confidence = cleaned.meta_control?.confidence_avg ?? Math.min(1, populated / 11);
  return { valid: true, cleaned, populatedDomains: populated, confidenceAvg: confidence };
}
