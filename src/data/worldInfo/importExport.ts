import { supabase } from '@/db/client';
import { addWorldInfoEntry, createWorldInfo } from './mutations';

export const importWorldInfo = async (jsonData: any) => {
  const name = jsonData?.name || jsonData?.data?.name || `Imported World Info ${new Date().toISOString()}`;
  const description = jsonData?.description || jsonData?.data?.description || '';
  const { data: created, error } = await createWorldInfo({ name, short_description: description, visibility: 'private' });
  if (error || !created) return { data: null, error: error || new Error('Failed to create world info') };
  const rawEntries = jsonData?.entries || jsonData?.data?.entries || [];
  let entriesArray: any[] = [];
  if (Array.isArray(rawEntries)) entriesArray = rawEntries; else if (rawEntries && typeof rawEntries === 'object') {
    entriesArray = Object.entries(rawEntries).map(([k, v]: [string, any]) => ({
      keywords: v?.keys || v?.key || v?.keywords || [k],
      entry_text: v?.entry_text || v?.content || v?.entry || v?.text || ''
    }));
  }
  for (const entry of entriesArray) {
    const rawKeywords = entry.keywords || entry.keys || entry.key;
    const keywords = Array.isArray(rawKeywords) ? rawKeywords : rawKeywords ? [rawKeywords] : [];
    const entryText = entry.entry_text || entry.content || entry.text || entry.entry || '';
    if (keywords.length > 0 && entryText) {
      await addWorldInfoEntry(created.id, { keywords: keywords.filter((k: string) => k && k.trim()), entry_text: entryText });
    }
  }
  return { data: created, error: null };
};

export const exportWorldInfo = (worldInfo: { name: string; short_description?: string | null; entries: Array<{ keywords: string[]; entry_text: string }> }) => {
  const data = { name: worldInfo.name, description: worldInfo.short_description || '', entries: worldInfo.entries };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${worldInfo.name.replace(/[^a-z0-9-_]/gi, '_') || 'world_info'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
