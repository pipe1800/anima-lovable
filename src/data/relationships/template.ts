import { supabase } from '@/db/client';
import { Auth } from '@/data';

/*
 * Relationship goals template data layer
 * NOTE: New tables & RPCs not yet in generated supabase types. Using (supabase as any) casts.
 * TODO: Regenerate types after deploying migration so we can remove casts.
 */

export interface RelationshipGoal {
  id: string;
  order: number;
  label: string;
  threshold: number;
  description?: string;
}

export interface RelationshipGoalsTemplate {
  enabled: boolean;
  version?: number;
  path: RelationshipGoal[];
  metadata?: { created_at?: string; updated_at?: string };
}

export async function getTemplate(characterId: string) {
  const { data, error } = await (supabase as any)
    .from('character_latent_profiles')
    .select('relationship_goals')
    .eq('character_id', characterId)
    .maybeSingle();
  if (error) return { data: null, error };
  let rg = data?.relationship_goals || null;
  if (typeof rg === 'string') {
    try {
      rg = JSON.parse(rg);
    } catch (e) {
      console.warn('Failed to parse relationship_goals JSON string', e);
      rg = null;
    }
  }
  if (rg && typeof rg === 'object') {
    // Fallback: infer enabled if path length >=2 when enabled missing
    if (rg.enabled === undefined && Array.isArray(rg.path) && rg.path.length >= 2) {
      rg.enabled = true;
    }
  }
  return { data: (rg || null) as RelationshipGoalsTemplate | null, error: null };
}

export async function upsertTemplate(characterId: string, template: RelationshipGoalsTemplate) {
  await Auth.requireAuthId();
  const { data, error } = await (supabase as any).rpc('upsert_relationship_goals', {
    p_character_id: characterId,
    p_relationship_goals: template
  });
  return { data: data as RelationshipGoalsTemplate | null, error };
}
