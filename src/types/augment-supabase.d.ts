// Temporary augmentation for missing tables/views until codegen updated
// This file augments the Database interface with world_info_users, user_reactions (temporary), character_profile_view, user_onboarding_progress
// so we can remove 'any' casts progressively.

import type { Database as GeneratedDatabase } from '@/integrations/supabase/types';

type SupabaseRelationship = {
  foreignKeyName: string;
  columns: string[];
  referencedRelation: string;
  referencedColumns: string[];
};

// Extend the Functions map via declaration merging
declare module '@/integrations/supabase/types' {
  interface Database extends GeneratedDatabase {
    public: GeneratedDatabase['public'] & {
      Tables: GeneratedDatabase['public']['Tables'] & {
        world_info_users?: {
          Row: { id: string; user_id: string; world_info_id: string; created_at: string };
          Insert: { id?: string; user_id: string; world_info_id: string; created_at?: string };
          Update: { id?: string; user_id?: string; world_info_id?: string; created_at?: string };
          Relationships: SupabaseRelationship[];
        };
        user_reactions?: {
          Row: { id: string; user_id: string; target_type: string; target_id: string; reaction_type: string; created_at: string; metadata: Record<string, unknown> };
          Insert: { id?: string; user_id: string; target_type: string; target_id: string; reaction_type: string; created_at?: string; metadata?: Record<string, unknown> };
          Update: { id?: string; user_id?: string; target_type?: string; target_id?: string; reaction_type?: string; created_at?: string; metadata?: Record<string, unknown> };
          Relationships: Array<
            SupabaseRelationship & {
              referencedRelation: 'profiles' | 'characters' | 'world_infos' | 'world_info_entries';
            }
          >;
        };
        user_onboarding_progress?: {
          Row: { user_id: string; task_id: number; created_at: string };
          Insert: { user_id: string; task_id: number; created_at?: string };
          Update: { user_id?: string; task_id?: number; created_at?: string };
          Relationships: SupabaseRelationship[];
        };
      };
      Views: GeneratedDatabase['public']['Views'] & {
        character_profile_view?: {
          Row: Record<string, unknown>;
        };
      };
      Functions: GeneratedDatabase['public']['Functions'] & {
        fetch_world_info_full: {
          Args: { p_world_info_id: string };
          Returns: unknown; // jsonb -> refined in data layer
        };
        list_public_world_infos: {
          Args: { p_search?: string | null; p_sort?: string; p_offset?: number; p_limit?: number; p_exclude_nsfw?: boolean; p_tag_ids?: number[] | null };
          Returns: unknown; // { items: [...], total: number }
        };
        list_user_world_infos: {
          Args: { p_user_id: string };
          Returns: unknown[]; // array jsonb -> parsed client side
        };
      };
    };
  }
}

export {};
