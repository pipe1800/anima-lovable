import { supabase } from '@/db/client';
import { Auth } from '@/data';

// Progress & signal operations (temporary any casts until Supabase types regenerated)
export interface RelationshipProgressState {
  active_order: number;
  current_score: number;
  reached?: Record<string, string>;
  decay_per_hour?: number;
  pending_regression?: boolean;
  regression_candidate_order?: number | null;
  negative_streak?: number;
  last_eval_at?: string;
}

export async function getProgress(characterId: string, userId?: string) {
  const uid = userId || await Auth.requireAuthId();
  const { data, error } = await (supabase as any)
    .from('user_character_relationship_progress')
    .select('state')
    .eq('user_id', uid)
    .eq('character_id', characterId)
    .maybeSingle();
  if (error) return { data: null, error };
  return { data: (data?.state || null) as RelationshipProgressState | null, error: null };
}

export async function evaluate(characterId: string, userId?: string) {
  const uid = userId || await Auth.requireAuthId();
  const { data, error } = await (supabase as any).rpc('evaluate_relationship_progress', {
    p_user_id: uid,
    p_character_id: characterId
  });
  return { data: data as RelationshipProgressState | null, error };
}

export async function confirmRegression(characterId: string, userId?: string) {
  const uid = userId || await Auth.requireAuthId();
  const { data, error } = await (supabase as any).rpc('confirm_relationship_regression', {
    p_user_id: uid,
    p_character_id: characterId
  });
  return { data: data as RelationshipProgressState | null, error };
}

export async function recordSignal(characterId: string, kind: string, weight: number, polarity: 1 | -1, sourceMessageId?: string, userId?: string) {
  const uid = userId || await Auth.requireAuthId();
  const { data, error } = await (supabase as any).rpc('record_relationship_signal', {
    p_user_id: uid,
    p_character_id: characterId,
    p_kind: kind,
    p_weight: weight,
    p_polarity: polarity,
    p_source_message_id: sourceMessageId || null
  });
  return { data, error };
}
