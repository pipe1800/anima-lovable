export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      character_definitions: {
        Row: {
          character_id: string
          description: string | null
          greeting: string | null
          model_id: string | null
          personality_summary: string
          scenario: Json | null
        }
        Insert: {
          character_id: string
          description?: string | null
          greeting?: string | null
          model_id?: string | null
          personality_summary: string
          scenario?: Json | null
        }
        Update: {
          character_id?: string
          description?: string | null
          greeting?: string | null
          model_id?: string | null
          personality_summary?: string
          scenario?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "character_definitions_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: true
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_favorites: {
        Row: {
          character_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_favorites_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_likes: {
        Row: {
          character_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_likes_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_tags: {
        Row: {
          character_id: string
          tag_id: number
        }
        Insert: {
          character_id: string
          tag_id: number
        }
        Update: {
          character_id?: string
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "character_tags_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      character_world_info_link: {
        Row: {
          character_id: string
          created_at: string
          id: string
          world_info_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          world_info_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          world_info_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_world_info_link_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_world_info_link_world_info_id_fkey"
            columns: ["world_info_id"]
            isOneToOne: false
            referencedRelation: "world_infos"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          avatar_url: string | null
          created_at: string
          creator_id: string
          default_persona_id: string | null
          id: string
          interaction_count: number
          name: string
          short_description: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          creator_id: string
          default_persona_id?: string | null
          id?: string
          interaction_count?: number
          name: string
          short_description?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          creator_id?: string
          default_persona_id?: string | null
          id?: string
          interaction_count?: number
          name?: string
          short_description?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_characters_default_persona"
            columns: ["default_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          character_id: string
          created_at: string
          id: string
          last_message_at: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_pack_purchases: {
        Row: {
          amount_paid: number
          created_at: string
          credit_pack_id: string
          credits_granted: number
          id: string
          paypal_order_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount_paid: number
          created_at?: string
          credit_pack_id: string
          credits_granted: number
          id?: string
          paypal_order_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          credit_pack_id?: string
          credits_granted?: number
          id?: string
          paypal_order_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_pack_purchases_credit_pack_id_fkey"
            columns: ["credit_pack_id"]
            isOneToOne: false
            referencedRelation: "credit_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packs: {
        Row: {
          created_at: string
          credits_granted: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
        }
        Insert: {
          created_at?: string
          credits_granted: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price: number
        }
        Update: {
          created_at?: string
          credits_granted?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
        }
        Relationships: []
      }
      credits: {
        Row: {
          balance: number
          user_id: string
        }
        Insert: {
          balance?: number
          user_id: string
        }
        Update: {
          balance?: number
          user_id?: string
        }
        Relationships: []
      }
      message_context: {
        Row: {
          character_id: string
          chat_id: string
          context_updates: Json
          created_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          character_id: string
          chat_id: string
          context_updates?: Json
          created_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          character_id?: string
          chat_id?: string
          context_updates?: Json
          created_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_context_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_context_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string
          chat_id: string
          content: string
          created_at: string
          current_context: Json | null
          id: string
          is_ai_message: boolean
          model_id: string | null
          token_cost: number | null
        }
        Insert: {
          author_id: string
          chat_id: string
          content: string
          created_at?: string
          current_context?: Json | null
          id?: string
          is_ai_message?: boolean
          model_id?: string | null
          token_cost?: number | null
        }
        Update: {
          author_id?: string
          chat_id?: string
          content?: string
          created_at?: string
          current_context?: Json | null
          id?: string
          is_ai_message?: boolean
          model_id?: string | null
          token_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          created_at: string
          credit_multiplier: number
          description: string | null
          id: string
          is_active: boolean
          is_nsfw_compatible: boolean
          min_plan_id: string | null
          tier_name: string
        }
        Insert: {
          created_at?: string
          credit_multiplier?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_nsfw_compatible?: boolean
          min_plan_id?: string | null
          tier_name: string
        }
        Update: {
          created_at?: string
          credit_multiplier?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_nsfw_compatible?: boolean
          min_plan_id?: string | null
          tier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "models_min_plan_id_fkey"
            columns: ["min_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_checklist_items: {
        Row: {
          description: string | null
          id: number
          reward_credits: number
          task_key: string
          title: string
        }
        Insert: {
          description?: string | null
          id?: number
          reward_credits?: number
          task_key: string
          title: string
        }
        Update: {
          description?: string | null
          id?: number
          reward_credits?: number
          task_key?: string
          title?: string
        }
        Relationships: []
      }
      personas: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          lore: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          lore?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          lore?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          features: Json | null
          id: string
          is_active: boolean
          monthly_credits_allowance: number
          name: string
          paypal_subscription_id: string | null
          price_monthly: number | null
        }
        Insert: {
          features?: Json | null
          id?: string
          is_active?: boolean
          monthly_credits_allowance?: number
          name: string
          paypal_subscription_id?: string | null
          price_monthly?: number | null
        }
        Update: {
          features?: Json | null
          id?: string
          is_active?: boolean
          monthly_credits_allowance?: number
          name?: string
          paypal_subscription_id?: string | null
          price_monthly?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          onboarding_completed: boolean
          onboarding_survey_data: Json | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id: string
          onboarding_completed?: boolean
          onboarding_survey_data?: Json | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          onboarding_completed?: boolean
          onboarding_survey_data?: Json | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      public_app_settings: {
        Row: {
          setting_key: string
          setting_value: string
        }
        Insert: {
          setting_key: string
          setting_value: string
        }
        Update: {
          setting_key?: string
          setting_value?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          id: string
          paypal_subscription_id: string | null
          plan_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end: string
          id?: string
          paypal_subscription_id?: string | null
          plan_id: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          id?: string
          paypal_subscription_id?: string | null
          plan_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      user_character_addons: {
        Row: {
          addon_settings: Json
          character_id: string
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          addon_settings?: Json
          character_id: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          addon_settings?: Json
          character_id?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_character_addons_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      user_character_world_info_settings: {
        Row: {
          character_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
          world_info_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          world_info_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          world_info_id?: string
        }
        Relationships: []
      }
      user_chat_context: {
        Row: {
          character_id: string
          chat_id: string
          context_type: string
          created_at: string
          current_context: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          chat_id: string
          context_type: string
          created_at?: string
          current_context?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          chat_id?: string
          context_type?: string
          created_at?: string
          current_context?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_onboarding_progress: {
        Row: {
          completed_at: string | null
          task_id: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          task_id: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          task_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_onboarding_progress_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "onboarding_checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      world_info_entries: {
        Row: {
          created_at: string
          entry_text: string
          id: string
          keywords: string[]
          updated_at: string
          world_info_id: string
        }
        Insert: {
          created_at?: string
          entry_text: string
          id?: string
          keywords: string[]
          updated_at?: string
          world_info_id: string
        }
        Update: {
          created_at?: string
          entry_text?: string
          id?: string
          keywords?: string[]
          updated_at?: string
          world_info_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_info_entries_world_info_id_fkey"
            columns: ["world_info_id"]
            isOneToOne: false
            referencedRelation: "world_infos"
            referencedColumns: ["id"]
          },
        ]
      }
      world_info_favorites: {
        Row: {
          created_at: string
          id: string
          user_id: string
          world_info_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          world_info_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          world_info_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_info_favorites_world_info_id_fkey"
            columns: ["world_info_id"]
            isOneToOne: false
            referencedRelation: "world_infos"
            referencedColumns: ["id"]
          },
        ]
      }
      world_info_likes: {
        Row: {
          created_at: string
          id: string
          user_id: string
          world_info_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          world_info_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          world_info_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_info_likes_world_info_id_fkey"
            columns: ["world_info_id"]
            isOneToOne: false
            referencedRelation: "world_infos"
            referencedColumns: ["id"]
          },
        ]
      }
      world_info_tags: {
        Row: {
          tag_id: number
          world_info_id: string
        }
        Insert: {
          tag_id: number
          world_info_id: string
        }
        Update: {
          tag_id?: number
          world_info_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_info_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_info_tags_world_info_id_fkey"
            columns: ["world_info_id"]
            isOneToOne: false
            referencedRelation: "world_infos"
            referencedColumns: ["id"]
          },
        ]
      }
      world_info_users: {
        Row: {
          created_at: string
          id: string
          user_id: string
          world_info_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          world_info_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          world_info_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_info_users_world_info_id_fkey"
            columns: ["world_info_id"]
            isOneToOne: false
            referencedRelation: "world_infos"
            referencedColumns: ["id"]
          },
        ]
      }
      world_infos: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          interaction_count: number
          name: string
          short_description: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          interaction_count?: number
          name: string
          short_description?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          interaction_count?: number
          name?: string
          short_description?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_monthly_credits: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_disabled_addon_context: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      consume_credits: {
        Args: { user_id_param: string; credits_to_consume: number }
        Returns: boolean
      }
      get_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
