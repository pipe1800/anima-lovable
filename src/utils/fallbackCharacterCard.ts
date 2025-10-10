import { parseExampleDialogue } from '@/lib/dialogue';

// Minimal client-side fallback PNG parser (tEXt only, no zTXt/iTXt) to normalize into form shape
export async function parseCharacterCardToForm(file: File): Promise<any | null> {
  try {
    if (!file || file.type !== 'image/png') return null;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // PNG signature
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;

    // Extract tEXt
    let offset = 8;
    const chunks: Array<{ keyword: string; text: string }> = [];
    while (offset + 8 <= bytes.length) {
      const length = readUint32(bytes, offset);
      const type = readType(bytes, offset + 4);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd + 4 > bytes.length) break;
      if (type === 'tEXt') {
        const chunk = bytes.slice(dataStart, dataEnd);
        const nullPos = chunk.indexOf(0);
        if (nullPos > 0) {
          const keyword = new TextDecoder().decode(chunk.slice(0, nullPos));
          const text = new TextDecoder().decode(chunk.slice(nullPos + 1));
          chunks.push({ keyword, text });
        }
      }
      offset = dataEnd + 4;
      if (type === 'IEND') break;
    }

    // Find candidate
    let raw: any = null;
    for (const { keyword, text } of chunks) {
      const trimmed = text.trim();
      if (
        /chara|character|json|metadata|ccv3|tavern|silly|card|data/i.test(keyword) ||
        trimmed.startsWith('{') ||
        trimmed.startsWith('[')
      ) {
        try {
          let payload = trimmed;
          if (!payload.startsWith('{') && !payload.startsWith('[')) {
            try { payload = atob(payload); } catch { /* ignore */ }
          }
          raw = JSON.parse(payload);
          break;
        } catch { /* try next */ }
      }
    }
    if (!raw) return null;

    const normalized = normalizeToFormShape(raw);

    // Attach avatar as Data URL for immediate preview
    const avatar = await toDataUrl(file);
    if (avatar) normalized.formData.avatar = avatar;

    return normalized.formData;
  } catch {
    return null;
  }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}
function readType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function normalizeToFormShape(raw: any) {
  const data = (raw && raw.spec === 'chara_card_v2' && raw.data) ? raw.data : raw;
  const name = data.name || data.char_name || data.character?.name || '';

  // Original long description (often the detailed definition block)
  const longDescription = data.description || data.data?.description || '';
  // Personality summary (shorter free-form summary in many cards)
  const personalitySummary = data.personality || data.char_persona || data.data?.personality || '';

  // Short description candidates (explicit short fields). If none, derive from personality summary, else from long description.
  const candidateShorts: Array<string | undefined> = [
    data.short_description,
    data.tagline,
    data.title,
    data.data?.short_description,
    data.data?.tagline,
    data.data?.title,
  ];
  let shortDescription = (candidateShorts.find(v => typeof v === 'string' && v.trim()) || '') as string;
  if (!shortDescription) {
    const source = personalitySummary || longDescription;
    shortDescription = source ? source.replace(/\s+/g, ' ').trim().slice(0, 150) : '';
  }

  // Map: core_personality gets the full long description (fallback to personality summary if missing)
  const corePersonality = longDescription || personalitySummary || '';
  // Map: knowledge_base (shown as Personality summary in UI) gets the personality summary text
  const knowledgeBase = personalitySummary || '';

  const scenario = data.scenario || data.world_scenario || data.data?.scenario || '';
  const greeting = data.first_mes || data.greeting || data.char_greeting || data.data?.first_mes || data.data?.greeting || '';
  const tags = Array.isArray(data.tags) ? data.tags : Array.isArray(data.data?.tags) ? data.data.tags : [];
  const knowledge = data.creator_notes || data.data?.creator_notes || '';
  const mes_example = data.mes_example || data.example_dialogue || data.example_messages || data.data?.mes_example || data.data?.example_dialogue || '';
  const example_dialogues = typeof mes_example === 'string' ? parseExampleDialogue(mes_example) : Array.isArray(data.example_dialogues) ? data.example_dialogues : [];
  const alternate_greetings: string[] = Array.isArray(data.alternate_greetings)
    ? data.alternate_greetings.filter((g: unknown) => typeof g === 'string')
    : Array.isArray(data.data?.alternate_greetings)
      ? (data.data.alternate_greetings as unknown[]).filter((g: unknown) => typeof g === 'string') as string[]
      : [];

  return {
    formData: {
      name,
      avatar: '',
      title: '',
      description: shortDescription,
      chatMode: 'storytelling',
      personality: {
        core_personality: corePersonality,
        tags,
        knowledge_base: knowledgeBase, // personality summary
        scenario_definition: scenario,
      },
      dialogue: { greeting, example_dialogues, alternate_greetings },
      visibility: 'public',
      nsfw_enabled: false,
      default_persona_id: null,
      timeAwarenessEnabled: false,
    }
  };
}

function toDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
