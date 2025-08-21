// Temporary augmentation for missing tables/views until codegen updated
// This file augments the Database interface with world_info_users, world_info_user_likes, character_profile_view, user_onboarding_progress
// so we can remove 'any' casts progressively.

import type { Database as GeneratedDatabase } from '@/integrations/supabase/types';

declare module '@/integrations/supabase/types' {
  interface Database extends GeneratedDatabase {
    public: GeneratedDatabase['public'] & {
      Tables: GeneratedDatabase['public']['Tables'] & {
        world_info_users?: {
          Row: { id: string; user_id: string; world_info_id: string; created_at: string };
          Insert: { id?: string; user_id: string; world_info_id: string; created_at?: string };
          Update: { id?: string; user_id?: string; world_info_id?: string; created_at?: string };
          Relationships: any[];
        };
        world_info_user_likes?: {
          Row: { id: string; user_id: string; world_info_id: string; created_at: string };
          Insert: { id?: string; user_id: string; world_info_id: string; created_at?: string };
          Update: { id?: string; user_id?: string; world_info_id?: string; created_at?: string };
          Relationships: any[];
        };
        user_onboarding_progress?: {
          Row: { user_id: string; task_id: number; created_at: string };
          Insert: { user_id: string; task_id: number; created_at?: string };
          Update: { user_id?: string; task_id?: number; created_at?: string };
          Relationships: any[];
        };
      };
      Views: GeneratedDatabase['public']['Views'] & {
        character_profile_view?: {
          Row: any; // refine later
        };
      };
    };
  }
}

export {};
