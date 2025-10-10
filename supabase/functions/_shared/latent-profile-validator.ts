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
  risk_level: ['very_low', 'low', 'med', 'high', 'very_high'] as const,
  authority_posture: ['defer', 'challenge', 'subvert', 'ignore'] as const,
  time_focus: ['past', 'present', 'future', 'multi'] as const,
  trust_ramp: ['fast', 'cautious', 'guarded', 'transactional'] as const,
  attachment_flavor: ['secure', 'avoidant', 'anxious', 'mixed'] as const,
  role_self_frame: ['caretaker', 'mentor', 'disruptor', 'outsider', 'strategist', 'observer'] as const,
  thinking_mode: ['analytical', 'intuitive', 'heuristic', 'methodical'] as const,
  emotional_regulation: ['stable', 'bursty', 'suppressed', 'volatile'] as const,
  verbosity: ['laconic', 'balanced', 'expansive'] as const,
  pacing: ['rapid', 'measured', 'contemplative'] as const,
  humor_style: ['none', 'dry', 'sardonic', 'absurd', 'dark', 'punny', 'wry'] as const,
  palette: ['minimalist', 'ornate', 'gothic', 'pastoral', 'neon', 'naturalistic', 'utilitarian', 'elegant'] as const,
  defining_memory_type: ['loss', 'betrayal', 'triumph', 'mentorship', 'failure', 'creation'] as const,
  schema_bias: ['betrayal', 'opportunity', 'decay', 'order', 'providence'] as const,
  orientation: ['heterosexual', 'homosexual', 'bisexual', 'pansexual', 'asexual', 'demisexual', 'queer', 'questioning', 'unspecified'] as const,
  intimacy_drive: ['low', 'moderate', 'high'] as const,
  flirting_style: ['direct', 'playful', 'teasing', 'reserved', 'intellectual', 'subtle'] as const,
};

type UnknownRecord = Record<string, unknown>;

type NonNullableProperty<T> = Exclude<T, null | undefined>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasMeaningfulValue = (obj: Record<string, unknown>): boolean =>
  Object.values(obj).some((value) => {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  });

function shortTxt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed.slice(0, 60) : undefined;
}

function enumOk<const T extends readonly string[]>(value: unknown, list: T): T[number] | undefined {
  if (typeof value !== 'string') return undefined;
  return list.includes(value as T[number]) ? (value as T[number]) : undefined;
}

function intIn(value: unknown, min: number, max: number): number | undefined {
  if (!Number.isInteger(value)) return undefined;
  const intVal = Number(value);
  return intVal >= min && intVal <= max ? intVal : undefined;
}

function listStr(value: unknown, maxItems: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.slice(0, 40));
  if (!normalized.length) return undefined;
  return normalized.slice(0, maxItems);
}

const withRecord = (value: unknown, cb: (record: UnknownRecord) => void): void => {
  if (isRecord(value)) {
    cb(value);
  }
};

export function validateLatentProfile(raw: unknown): ValidationResult {
  if (!isRecord(raw)) {
    return { valid: false, populatedDomains: 0, confidenceAvg: 0 };
  }

  const cleaned: LatentCharacterProfile = {};
  let populated = 0;

  withRecord(raw['drives'], (drivesRecord) => {
    const drives: Partial<NonNullableProperty<LatentCharacterProfile['drives']>> = {};
    const motiveCore = shortTxt(drivesRecord['motive_core']);
    const hiddenAgenda = shortTxt(drivesRecord['hidden_agenda']);
    const fearAnchor = shortTxt(drivesRecord['fear_anchor']);
    if (motiveCore) drives.motive_core = motiveCore;
    if (hiddenAgenda) drives.hidden_agenda = hiddenAgenda;
    if (fearAnchor) drives.fear_anchor = fearAnchor;
    if (hasMeaningfulValue(drives as Record<string, unknown>)) {
      cleaned.drives = drives;
      populated += 1;
    }
  });

  withRecord(raw['values_framework'], (valuesRecord) => {
    const valuesFramework: Partial<NonNullableProperty<LatentCharacterProfile['values_framework']>> = {};
    const stack = valuesRecord['value_stack'];
    if (Array.isArray(stack)) {
      const normalized = stack
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.toLowerCase().trim())
        .filter((entry) => entry.length > 0)
        .slice(0, 3);
      if (normalized.length >= 2) {
        valuesFramework.value_stack = normalized;
      }
    }
    const moralFlexPoint = shortTxt(valuesRecord['moral_flex_point']);
    if (moralFlexPoint) {
      valuesFramework.moral_flex_point = moralFlexPoint;
    }
    if (Object.keys(valuesFramework).length > 0) {
      cleaned.values_framework = valuesFramework;
      populated += 1;
    }
  });

  withRecord(raw['internal_conflict'], (conflictRecord) => {
    const internalConflict: Partial<NonNullableProperty<LatentCharacterProfile['internal_conflict']>> = {};
    const tensionAxis = shortTxt(conflictRecord['tension_axis']);
    if (tensionAxis && tensionAxis.includes(' vs ')) {
      internalConflict.tension_axis = tensionAxis;
    }
    const resolutionPull = shortTxt(conflictRecord['resolution_pull']);
    if (
      resolutionPull &&
      internalConflict.tension_axis &&
      internalConflict.tension_axis.split(' vs ').includes(resolutionPull)
    ) {
      internalConflict.resolution_pull = resolutionPull;
    }
    if (Object.keys(internalConflict).length > 0) {
      cleaned.internal_conflict = internalConflict;
      populated += 1;
    }
  });

  withRecord(raw['worldview_profile'], (worldviewRecord) => {
    const worldview: Partial<NonNullableProperty<LatentCharacterProfile['worldview_profile']>> = {};
    const risk = enumOk(worldviewRecord['risk_level'], ENUMS.risk_level);
    const authority = enumOk(worldviewRecord['authority_posture'], ENUMS.authority_posture);
    const timeFocus = enumOk(worldviewRecord['time_focus'], ENUMS.time_focus);
    const note = shortTxt(worldviewRecord['worldview_note']);
    if (risk) worldview.risk_level = risk;
    if (authority) worldview.authority_posture = authority;
    if (timeFocus) worldview.time_focus = timeFocus;
    if (note) worldview.worldview_note = note;
    if (Object.keys(worldview).length > 0) {
      cleaned.worldview_profile = worldview;
      populated += 1;
    }
  });

  withRecord(raw['relational_style'], (relationalRecord) => {
    const relational: Partial<NonNullableProperty<LatentCharacterProfile['relational_style']>> = {};
    const trustRamp = enumOk(relationalRecord['trust_ramp'], ENUMS.trust_ramp);
    const attachment = enumOk(relationalRecord['attachment_flavor'], ENUMS.attachment_flavor);
    const roleFrame = enumOk(relationalRecord['role_self_frame'], ENUMS.role_self_frame);
    const orientation = enumOk(relationalRecord['orientation'], ENUMS.orientation);
    const intimacyDrive = enumOk(relationalRecord['intimacy_drive'], ENUMS.intimacy_drive);
    const flirtingStyle = enumOk(relationalRecord['flirting_style'], ENUMS.flirting_style);
    const boundaryNote = shortTxt(relationalRecord['boundary_note']);
    const kinks = listStr(relationalRecord['kinks'], 8);
    const turnOns = listStr(relationalRecord['turn_ons'], 8);
    const turnOffs = listStr(relationalRecord['turn_offs'], 8);
    const fetishes = listStr(relationalRecord['fetishes'], 8);
    if (trustRamp) relational.trust_ramp = trustRamp;
    if (attachment) relational.attachment_flavor = attachment;
    if (roleFrame) relational.role_self_frame = roleFrame;
    if (orientation) relational.orientation = orientation;
    if (intimacyDrive) relational.intimacy_drive = intimacyDrive;
    if (flirtingStyle) relational.flirting_style = flirtingStyle;
    if (boundaryNote) relational.boundary_note = boundaryNote;
    if (kinks) relational.kinks = kinks;
    if (turnOns) relational.turn_ons = turnOns;
    if (turnOffs) relational.turn_offs = turnOffs;
    if (fetishes) relational.fetishes = fetishes;
    if (Object.keys(relational).length > 0) {
      cleaned.relational_style = relational;
      populated += 1;
    }
  });

  withRecord(raw['cog_emotional_style'], (cogRecord) => {
    const cognitive: Partial<NonNullableProperty<LatentCharacterProfile['cog_emotional_style']>> = {};
    const thinkingMode = enumOk(cogRecord['thinking_mode'], ENUMS.thinking_mode);
    const emotionalReg = enumOk(cogRecord['emotional_regulation'], ENUMS.emotional_regulation);
    const escalation = shortTxt(cogRecord['escalation_trigger']);
    if (thinkingMode) cognitive.thinking_mode = thinkingMode;
    if (emotionalReg) cognitive.emotional_regulation = emotionalReg;
    if (escalation) cognitive.escalation_trigger = escalation;
    if (Object.keys(cognitive).length > 0) {
      cleaned.cog_emotional_style = cognitive;
      populated += 1;
    }
  });

  withRecord(raw['communication_texture'], (commRecord) => {
    const communication: Partial<NonNullableProperty<LatentCharacterProfile['communication_texture']>> = {};
    const verbosity = enumOk(commRecord['verbosity'], ENUMS.verbosity);
    const pacing = enumOk(commRecord['pacing'], ENUMS.pacing);
    const humor = enumOk(commRecord['humor_style'], ENUMS.humor_style);
    const discourse = shortTxt(commRecord['signature_discourse']);
    if (verbosity) communication.verbosity = verbosity;
    if (pacing) communication.pacing = pacing;
    if (humor) communication.humor_style = humor;
    if (discourse) communication.signature_discourse = discourse;
    if (Object.keys(communication).length > 0) {
      cleaned.communication_texture = communication;
      populated += 1;
    }
  });

  withRecord(raw['aesthetic_bias'], (aestheticRecord) => {
    const aesthetic: Partial<NonNullableProperty<LatentCharacterProfile['aesthetic_bias']>> = {};
    const palette = enumOk(aestheticRecord['palette'], ENUMS.palette);
    const modesty = intIn(aestheticRecord['modesty_to_flaunt'], 0, 4);
    const practicality = intIn(aestheticRecord['practicality_bias'], 0, 4);
    if (palette) aesthetic.palette = palette;
    if (modesty != null) aesthetic.modesty_to_flaunt = modesty;
    if (practicality != null) aesthetic.practicality_bias = practicality;
    if (Object.keys(aesthetic).length > 0) {
      cleaned.aesthetic_bias = aesthetic;
      populated += 1;
    }
  });

  withRecord(raw['constraint_and_secret'], (constraintRecord) => {
    const constraint: Partial<NonNullableProperty<LatentCharacterProfile['constraint_and_secret']>> = {};
    const limitingFactor = shortTxt(constraintRecord['limiting_factor']);
    const hiddenSoftSpot = shortTxt(constraintRecord['hidden_soft_spot']);
    if (limitingFactor) constraint.limiting_factor = limitingFactor;
    if (hiddenSoftSpot) constraint.hidden_soft_spot = hiddenSoftSpot;
    if (hasMeaningfulValue(constraint as Record<string, unknown>)) {
      cleaned.constraint_and_secret = constraint;
      populated += 1;
    }
  });

  withRecord(raw['growth_arc_anchor'], (growthRecord) => {
    const growth: Partial<NonNullableProperty<LatentCharacterProfile['growth_arc_anchor']>> = {};
    const growthVector = shortTxt(growthRecord['growth_vector']);
    const resistanceFactor = shortTxt(growthRecord['resistance_factor']);
    if (growthVector) growth.growth_vector = growthVector;
    if (resistanceFactor) growth.resistance_factor = resistanceFactor;
    if (hasMeaningfulValue(growth as Record<string, unknown>)) {
      cleaned.growth_arc_anchor = growth;
      populated += 1;
    }
  });

  withRecord(raw['memory_schema'], (memoryRecord) => {
    const memory: Partial<NonNullableProperty<LatentCharacterProfile['memory_schema']>> = {};
    const definingMemory = enumOk(memoryRecord['defining_memory_type'], ENUMS.defining_memory_type);
    const schemaBias = enumOk(memoryRecord['schema_bias'], ENUMS.schema_bias);
    if (definingMemory) memory.defining_memory_type = definingMemory;
    if (schemaBias) memory.schema_bias = schemaBias;
    if (Object.keys(memory).length > 0) {
      cleaned.memory_schema = memory;
      populated += 1;
    }
  });

  withRecord(raw['meta_control'], (metaRecord) => {
    const confidence = Number(metaRecord['confidence_avg']);
    if (!Number.isNaN(confidence) && confidence >= 0 && confidence <= 1) {
      cleaned.meta_control = { confidence_avg: Number(confidence.toFixed(2)) };
    }
  });

  cleaned.worldview_profile = {
    risk_level: cleaned.worldview_profile?.risk_level || 'med',
    ...(cleaned.worldview_profile || {}),
  };
  cleaned.communication_texture = {
    verbosity: cleaned.communication_texture?.verbosity || 'balanced',
    pacing: cleaned.communication_texture?.pacing || 'measured',
    humor_style: cleaned.communication_texture?.humor_style || 'none',
    ...(cleaned.communication_texture || {}),
  };
  cleaned.aesthetic_bias = {
    practicality_bias: cleaned.aesthetic_bias?.practicality_bias ?? 2,
    modesty_to_flaunt: cleaned.aesthetic_bias?.modesty_to_flaunt ?? 2,
    ...(cleaned.aesthetic_bias || {}),
  };

  const confidence = cleaned.meta_control?.confidence_avg ?? Math.min(1, populated / 11);
  return { valid: true, cleaned, populatedDomains: populated, confidenceAvg: confidence };
}
