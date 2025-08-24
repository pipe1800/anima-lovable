export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  auth: {
    Tables: {
      audit_log_entries: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string | null
          ip_address: string
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          id: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Relationships: []
      }
      flow_state: {
        Row: {
          auth_code: string
          auth_code_issued_at: string | null
          authentication_method: string
          code_challenge: string
          code_challenge_method: Database["auth"]["Enums"]["code_challenge_method"]
          created_at: string | null
          id: string
          provider_access_token: string | null
          provider_refresh_token: string | null
          provider_type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auth_code: string
          auth_code_issued_at?: string | null
          authentication_method: string
          code_challenge: string
          code_challenge_method: Database["auth"]["Enums"]["code_challenge_method"]
          created_at?: string | null
          id: string
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_code?: string
          auth_code_issued_at?: string | null
          authentication_method?: string
          code_challenge?: string
          code_challenge_method?: Database["auth"]["Enums"]["code_challenge_method"]
          created_at?: string | null
          id?: string
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      identities: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          identity_data: Json
          last_sign_in_at: string | null
          provider: string
          provider_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data: Json
          last_sign_in_at?: string | null
          provider: string
          provider_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data?: Json
          last_sign_in_at?: string | null
          provider?: string
          provider_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          created_at: string | null
          id: string
          raw_base_config: string | null
          updated_at: string | null
          uuid: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Relationships: []
      }
      mfa_amr_claims: {
        Row: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Update: {
          authentication_method?: string
          created_at?: string
          id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_amr_claims_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_challenges: {
        Row: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code: string | null
          verified_at: string | null
          web_authn_session_data: Json | null
        }
        Insert: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Update: {
          created_at?: string
          factor_id?: string
          id?: string
          ip_address?: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_challenges_auth_factor_id_fkey"
            columns: ["factor_id"]
            isOneToOne: false
            referencedRelation: "mfa_factors"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_factors: {
        Row: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name: string | null
          id: string
          last_challenged_at: string | null
          phone: string | null
          secret: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid: string | null
          web_authn_credential: Json | null
        }
        Insert: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id: string
          last_challenged_at?: string | null
          phone?: string | null
          secret?: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Update: {
          created_at?: string
          factor_type?: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id?: string
          last_challenged_at?: string | null
          phone?: string | null
          secret?: string | null
          status?: Database["auth"]["Enums"]["factor_status"]
          updated_at?: string
          user_id?: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      one_time_tokens: {
        Row: {
          created_at: string
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relates_to?: string
          token_hash?: string
          token_type?: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_time_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      refresh_tokens: {
        Row: {
          created_at: string | null
          id: number
          instance_id: string | null
          parent: string | null
          revoked: boolean | null
          session_id: string | null
          token: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refresh_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_providers: {
        Row: {
          attribute_mapping: Json | null
          created_at: string | null
          entity_id: string
          id: string
          metadata_url: string | null
          metadata_xml: string
          name_id_format: string | null
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id: string
          id: string
          metadata_url?: string | null
          metadata_xml: string
          name_id_format?: string | null
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id?: string
          id?: string
          metadata_url?: string | null
          metadata_xml?: string
          name_id_format?: string | null
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_providers_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_relay_states: {
        Row: {
          created_at: string | null
          flow_state_id: string | null
          for_email: string | null
          id: string
          redirect_to: string | null
          request_id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id: string
          redirect_to?: string | null
          request_id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id?: string
          redirect_to?: string | null
          request_id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_relay_states_flow_state_id_fkey"
            columns: ["flow_state_id"]
            isOneToOne: false
            referencedRelation: "flow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saml_relay_states_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          version: string
        }
        Insert: {
          version: string
        }
        Update: {
          version?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          aal: Database["auth"]["Enums"]["aal_level"] | null
          created_at: string | null
          factor_id: string | null
          id: string
          ip: unknown | null
          not_after: string | null
          refreshed_at: string | null
          tag: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id: string
          ip?: unknown | null
          not_after?: string | null
          refreshed_at?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id?: string
          ip?: unknown | null
          not_after?: string | null
          refreshed_at?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sso_domains_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_providers: {
        Row: {
          created_at: string | null
          id: string
          resource_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          aud: string | null
          banned_until: string | null
          confirmation_sent_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          email_change: string | null
          email_change_confirm_status: number | null
          email_change_sent_at: string | null
          email_change_token_current: string | null
          email_change_token_new: string | null
          email_confirmed_at: string | null
          encrypted_password: string | null
          id: string
          instance_id: string | null
          invited_at: string | null
          is_anonymous: boolean
          is_sso_user: boolean
          is_super_admin: boolean | null
          last_sign_in_at: string | null
          phone: string | null
          phone_change: string | null
          phone_change_sent_at: string | null
          phone_change_token: string | null
          phone_confirmed_at: string | null
          raw_app_meta_data: Json | null
          raw_user_meta_data: Json | null
          reauthentication_sent_at: string | null
          reauthentication_token: string | null
          recovery_sent_at: string | null
          recovery_token: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      email: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      jwt: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      uid: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      aal_level: "aal1" | "aal2" | "aal3"
      code_challenge_method: "s256" | "plain"
      factor_status: "unverified" | "verified"
      factor_type: "totp" | "webauthn" | "phone"
      one_time_token_type:
        | "confirmation_token"
        | "reauthentication_token"
        | "recovery_token"
        | "email_change_token_new"
        | "email_change_token_current"
        | "phone_change_token"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  billing: {
    Tables: {
      credit_ledger: {
        Row: {
          change_amount: number
          created_at: string
          description: string | null
          id: number
          related_message_id: string | null
          related_transaction_id: string | null
          transaction_type: Database["billing"]["Enums"]["credit_transaction_type"]
          user_id: string
        }
        Insert: {
          change_amount: number
          created_at?: string
          description?: string | null
          id?: number
          related_message_id?: string | null
          related_transaction_id?: string | null
          transaction_type: Database["billing"]["Enums"]["credit_transaction_type"]
          user_id: string
        }
        Update: {
          change_amount?: number
          created_at?: string
          description?: string | null
          id?: number
          related_message_id?: string | null
          related_transaction_id?: string | null
          transaction_type?: Database["billing"]["Enums"]["credit_transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_pack_purchases: {
        Row: {
          amount_paid_cents: number
          created_at: string
          credit_pack_id: string
          credits_granted: number
          id: string
          paypal_order_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount_paid_cents: number
          created_at?: string
          credit_pack_id: string
          credits_granted: number
          id?: string
          paypal_order_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount_paid_cents?: number
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
          price_cents: number
        }
        Insert: {
          created_at?: string
          credits_granted: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
        }
        Update: {
          created_at?: string
          credits_granted?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
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
      models: {
        Row: {
          id: string
          name: string
          provider_model_id: string
        }
        Insert: {
          id?: string
          name: string
          provider_model_id: string
        }
        Update: {
          id?: string
          name?: string
          provider_model_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          features: Json | null
          id: string
          is_active: boolean
          model_id: string | null
          monthly_credits_allowance: number
          name: string
          paypal_subscription_id: string | null
          price_monthly: number | null
          price_yearly: number | null
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
        }
        Insert: {
          features?: Json | null
          id?: string
          is_active?: boolean
          model_id?: string | null
          monthly_credits_allowance?: number
          name: string
          paypal_subscription_id?: string | null
          price_monthly?: number | null
          price_yearly?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
        }
        Update: {
          features?: Json | null
          id?: string
          is_active?: boolean
          model_id?: string | null
          monthly_credits_allowance?: number
          name?: string
          paypal_subscription_id?: string | null
          price_monthly?: number | null
          price_yearly?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          id: string
          paypal_subscription_id: string | null
          plan_id: string
          status: Database["billing"]["Enums"]["subscription_status"]
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end: string
          id?: string
          paypal_subscription_id?: string | null
          plan_id: string
          status: Database["billing"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          id?: string
          paypal_subscription_id?: string | null
          plan_id?: string
          status?: Database["billing"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string | null
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
      transactions: {
        Row: {
          amount: number
          created_at: string
          credit_pack_purchase_id: string | null
          currency: string
          gateway: Database["billing"]["Enums"]["gateway_type"]
          gateway_transaction_id: string | null
          id: string
          purchase_type:
            | Database["billing"]["Enums"]["transaction_purchase_type"]
            | null
          status: Database["billing"]["Enums"]["transaction_status"]
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credit_pack_purchase_id?: string | null
          currency: string
          gateway: Database["billing"]["Enums"]["gateway_type"]
          gateway_transaction_id?: string | null
          id?: string
          purchase_type?:
            | Database["billing"]["Enums"]["transaction_purchase_type"]
            | null
          status: Database["billing"]["Enums"]["transaction_status"]
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_pack_purchase_id?: string | null
          currency?: string
          gateway?: Database["billing"]["Enums"]["gateway_type"]
          gateway_transaction_id?: string | null
          id?: string
          purchase_type?:
            | Database["billing"]["Enums"]["transaction_purchase_type"]
            | null
          status?: Database["billing"]["Enums"]["transaction_status"]
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_credit_pack_purchase_id_fkey"
            columns: ["credit_pack_purchase_id"]
            isOneToOne: false
            referencedRelation: "credit_pack_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      credit_transaction_type:
        | "initial_grant"
        | "subscription_allowance"
        | "top_up_purchase"
        | "message_cost"
        | "image_gen_cost"
        | "admin_adjustment"
        | "onboarding_reward"
      gateway_type: "stripe" | "paypal"
      model_tier: "standard" | "premium" | "experimental"
      subscription_status: "active" | "past_due" | "canceled" | "trialing"
      transaction_purchase_type: "subscription" | "credit_pack"
      transaction_status: "succeeded" | "pending" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      character_definitions: {
        Row: {
          character_id: string
          description: string | null
          greeting: string | null
          initial_addon_context: Json | null
          initial_addon_context_enabled: boolean
          personality_summary: string
          scenario: Json | null
        }
        Insert: {
          character_id: string
          description?: string | null
          greeting?: string | null
          initial_addon_context?: Json | null
          initial_addon_context_enabled?: boolean
          personality_summary: string
          scenario?: Json | null
        }
        Update: {
          character_id?: string
          description?: string | null
          greeting?: string | null
          initial_addon_context?: Json | null
          initial_addon_context_enabled?: boolean
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
      character_latent_profile_history: {
        Row: {
          character_id: string
          confidence_avg: number | null
          created_at: string
          extraction_version: string
          id: string
          populated_domains: number
          profile: Json
          relationship_goals: Json | null
          source_card_hash: string
          token_cost: number | null
        }
        Insert: {
          character_id: string
          confidence_avg?: number | null
          created_at?: string
          extraction_version: string
          id?: string
          populated_domains: number
          profile: Json
          relationship_goals?: Json | null
          source_card_hash: string
          token_cost?: number | null
        }
        Update: {
          character_id?: string
          confidence_avg?: number | null
          created_at?: string
          extraction_version?: string
          id?: string
          populated_domains?: number
          profile?: Json
          relationship_goals?: Json | null
          source_card_hash?: string
          token_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "character_latent_profile_history_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_latent_profiles: {
        Row: {
          character_id: string
          confidence_avg: number | null
          created_at: string
          extraction_version: string
          populated_domains: number
          profile: Json
          relationship_goals: Json | null
          source_card_hash: string
          token_cost: number | null
          updated_at: string
        }
        Insert: {
          character_id: string
          confidence_avg?: number | null
          created_at?: string
          extraction_version: string
          populated_domains: number
          profile: Json
          relationship_goals?: Json | null
          source_card_hash: string
          token_cost?: number | null
          updated_at?: string
        }
        Update: {
          character_id?: string
          confidence_avg?: number | null
          created_at?: string
          extraction_version?: string
          populated_domains?: number
          profile?: Json
          relationship_goals?: Json | null
          source_card_hash?: string
          token_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_latent_profiles_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: true
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
      character_memories: {
        Row: {
          ai_sequence_end: number | null
          ai_sequence_start: number | null
          character_id: string
          chat_id: string | null
          content_hash: string | null
          created_at: string | null
          embedding: string | null
          id: string
          injection_count: number | null
          input_token_cost: number
          is_auto_summary: boolean | null
          last_injected_at: string | null
          message_count: number
          name: string | null
          summary_content: string
          trigger_keywords: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_sequence_end?: number | null
          ai_sequence_start?: number | null
          character_id: string
          chat_id?: string | null
          content_hash?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          injection_count?: number | null
          input_token_cost: number
          is_auto_summary?: boolean | null
          last_injected_at?: string | null
          message_count: number
          name?: string | null
          summary_content: string
          trigger_keywords: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_sequence_end?: number | null
          ai_sequence_start?: number | null
          character_id?: string
          chat_id?: string | null
          content_hash?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          injection_count?: number | null
          input_token_cost?: number
          is_auto_summary?: boolean | null
          last_injected_at?: string | null
          message_count?: number
          name?: string | null
          summary_content?: string
          trigger_keywords?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_memories_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_memories_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
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
          chats_count: number
          created_at: string
          creator_id: string
          favorites_count: number
          id: string
          interaction_count: number
          likes_count: number
          messages_count: number
          name: string
          short_description: string | null
          tagline: string | null
          updated_at: string
          visibility: string
          was_public: boolean
        }
        Insert: {
          avatar_url?: string | null
          chats_count?: number
          created_at?: string
          creator_id: string
          favorites_count?: number
          id?: string
          interaction_count?: number
          likes_count?: number
          messages_count?: number
          name: string
          short_description?: string | null
          tagline?: string | null
          updated_at?: string
          visibility?: string
          was_public?: boolean
        }
        Update: {
          avatar_url?: string | null
          chats_count?: number
          created_at?: string
          creator_id?: string
          favorites_count?: number
          id?: string
          interaction_count?: number
          likes_count?: number
          messages_count?: number
          name?: string
          short_description?: string | null
          tagline?: string | null
          updated_at?: string
          visibility?: string
          was_public?: boolean
        }
        Relationships: []
      }
      chat_context: {
        Row: {
          character_id: string
          chat_id: string
          created_at: string
          current_context: Json
          enchantment_status: string | null
          id: string
          item_inventory: string | null
          last_updated_by_message_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          chat_id: string
          created_at?: string
          current_context?: Json
          enchantment_status?: string | null
          id?: string
          item_inventory?: string | null
          last_updated_by_message_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          chat_id?: string
          created_at?: string
          current_context?: Json
          enchantment_status?: string | null
          id?: string
          item_inventory?: string | null
          last_updated_by_message_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_context_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_context_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_context_last_updated_by_message_id_fkey"
            columns: ["last_updated_by_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          character_id: string
          chat_mode: string
          context_ceiling_warned: boolean | null
          created_at: string
          id: string
          last_message_at: string | null
          selected_persona_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          chat_mode?: string
          context_ceiling_warned?: boolean | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          selected_persona_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          chat_mode?: string
          context_ceiling_warned?: boolean | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          selected_persona_id?: string | null
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
          {
            foreignKeyName: "fk_chats_selected_persona"
            columns: ["selected_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_sequence_number: number | null
          author_id: string | null
          chat_id: string
          content: string
          created_at: string
          current_context: Json | null
          id: string
          is_ai_message: boolean
          is_placeholder: boolean | null
          message_order: number
          model_id: string | null
          token_cost: number | null
          updated_at: string | null
        }
        Insert: {
          ai_sequence_number?: number | null
          author_id?: string | null
          chat_id: string
          content: string
          created_at?: string
          current_context?: Json | null
          id?: string
          is_ai_message?: boolean
          is_placeholder?: boolean | null
          message_order?: number
          model_id?: string | null
          token_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_sequence_number?: number | null
          author_id?: string | null
          chat_id?: string
          content?: string
          created_at?: string
          current_context?: Json | null
          id?: string
          is_ai_message?: boolean
          is_placeholder?: boolean | null
          message_order?: number
          model_id?: string | null
          token_cost?: number | null
          updated_at?: string | null
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
      parsed_character_cards: {
        Row: {
          avatar_public_url: string | null
          created_at: string
          hash: string
          normalized: Json
          vendor: string | null
          version: string | null
        }
        Insert: {
          avatar_public_url?: string | null
          created_at?: string
          hash: string
          normalized: Json
          vendor?: string | null
          version?: string | null
        }
        Update: {
          avatar_public_url?: string | null
          created_at?: string
          hash?: string
          normalized?: Json
          vendor?: string | null
          version?: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          banner_updated_at: string | null
          banner_url: string | null
          bio: string | null
          created_at: string
          default_persona_id: string | null
          id: string
          onboarding_completed: boolean
          onboarding_survey_data: Json | null
          timezone: string | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          banner_updated_at?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          default_persona_id?: string | null
          id: string
          onboarding_completed?: boolean
          onboarding_survey_data?: Json | null
          timezone?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          banner_updated_at?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          default_persona_id?: string | null
          id?: string
          onboarding_completed?: boolean
          onboarding_survey_data?: Json | null
          timezone?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_default_persona"
            columns: ["default_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
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
      subscription_nonces: {
        Row: {
          created_at: string
          id: string
          provisional_subscription_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          provisional_subscription_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provisional_subscription_id?: string
          user_id?: string
        }
        Relationships: []
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
      user_age_verification: {
        Row: {
          created_at: string
          id: string
          user_id: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          verified_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
      user_character_relationship_progress: {
        Row: {
          character_id: string
          created_at: string
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_character_relationship_signals: {
        Row: {
          character_id: string
          created_at: string
          id: string
          kind: string
          polarity: number
          source_message_id: string | null
          user_id: string
          weight: number
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          kind: string
          polarity: number
          source_message_id?: string | null
          user_id: string
          weight: number
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          kind?: string
          polarity?: number
          source_message_id?: string | null
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      user_character_settings: {
        Row: {
          character_id: string
          chat_mode: string
          created_at: string
          id: string
          time_awareness_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          character_id: string
          chat_mode?: string
          created_at?: string
          id?: string
          time_awareness_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          character_id?: string
          chat_mode?: string
          created_at?: string
          id?: string
          time_awareness_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_character_settings_character_id_fkey"
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
        Relationships: [
          {
            foreignKeyName: "user_character_world_info_settings_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_character_world_info_settings_world_info_id_fkey"
            columns: ["world_info_id"]
            isOneToOne: false
            referencedRelation: "world_infos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_global_chat_settings: {
        Row: {
          action_color: string | null
          ai_bubble_color: string
          ai_bubble_opacity: number
          ai_text_color: string
          avatar_blur_nsfw: boolean | null
          avatar_overlay_color: string | null
          avatar_overlay_opacity: number | null
          avatar_shape: string
          avatar_size: string
          avatar_style: string
          background_image_url: string | null
          banner_tint_from_avatar: boolean | null
          banner_width: string | null
          chain_of_thought: boolean | null
          character_position: boolean | null
          clothing_inventory: boolean | null
          created_at: string | null
          dynamic_world_info: boolean | null
          emphasis_color: string | null
          enchantment_status: boolean | null
          enhanced_memory: boolean | null
          few_shot_examples: boolean | null
          font_size: string | null
          god_mode: boolean
          id: string
          item_inventory: boolean | null
          location_tracking: boolean | null
          mood_tracking: boolean | null
          nsfw_enabled: boolean | null
          parenthetical_color: string | null
          portrait_frame_color: string | null
          portrait_frame_style: string | null
          relationship_status: boolean | null
          semantic_overrides_mode: string
          show_character_avatar: boolean
          show_user_avatar: boolean
          speech_color: string | null
          streaming_mode: string | null
          time_and_weather: boolean | null
          updated_at: string | null
          user_bubble_color: string
          user_bubble_opacity: number
          user_id: string
          user_text_color: string
        }
        Insert: {
          action_color?: string | null
          ai_bubble_color?: string
          ai_bubble_opacity?: number
          ai_text_color?: string
          avatar_blur_nsfw?: boolean | null
          avatar_overlay_color?: string | null
          avatar_overlay_opacity?: number | null
          avatar_shape?: string
          avatar_size?: string
          avatar_style?: string
          background_image_url?: string | null
          banner_tint_from_avatar?: boolean | null
          banner_width?: string | null
          chain_of_thought?: boolean | null
          character_position?: boolean | null
          clothing_inventory?: boolean | null
          created_at?: string | null
          dynamic_world_info?: boolean | null
          emphasis_color?: string | null
          enchantment_status?: boolean | null
          enhanced_memory?: boolean | null
          few_shot_examples?: boolean | null
          font_size?: string | null
          god_mode?: boolean
          id?: string
          item_inventory?: boolean | null
          location_tracking?: boolean | null
          mood_tracking?: boolean | null
          nsfw_enabled?: boolean | null
          parenthetical_color?: string | null
          portrait_frame_color?: string | null
          portrait_frame_style?: string | null
          relationship_status?: boolean | null
          semantic_overrides_mode?: string
          show_character_avatar?: boolean
          show_user_avatar?: boolean
          speech_color?: string | null
          streaming_mode?: string | null
          time_and_weather?: boolean | null
          updated_at?: string | null
          user_bubble_color?: string
          user_bubble_opacity?: number
          user_id: string
          user_text_color?: string
        }
        Update: {
          action_color?: string | null
          ai_bubble_color?: string
          ai_bubble_opacity?: number
          ai_text_color?: string
          avatar_blur_nsfw?: boolean | null
          avatar_overlay_color?: string | null
          avatar_overlay_opacity?: number | null
          avatar_shape?: string
          avatar_size?: string
          avatar_style?: string
          background_image_url?: string | null
          banner_tint_from_avatar?: boolean | null
          banner_width?: string | null
          chain_of_thought?: boolean | null
          character_position?: boolean | null
          clothing_inventory?: boolean | null
          created_at?: string | null
          dynamic_world_info?: boolean | null
          emphasis_color?: string | null
          enchantment_status?: boolean | null
          enhanced_memory?: boolean | null
          few_shot_examples?: boolean | null
          font_size?: string | null
          god_mode?: boolean
          id?: string
          item_inventory?: boolean | null
          location_tracking?: boolean | null
          mood_tracking?: boolean | null
          nsfw_enabled?: boolean | null
          parenthetical_color?: string | null
          portrait_frame_color?: string | null
          portrait_frame_style?: string | null
          relationship_status?: boolean | null
          semantic_overrides_mode?: string
          show_character_avatar?: boolean
          show_user_avatar?: boolean
          speech_color?: string | null
          streaming_mode?: string | null
          time_and_weather?: boolean | null
          updated_at?: string | null
          user_bubble_color?: string
          user_bubble_opacity?: number
          user_id?: string
          user_text_color?: string
        }
        Relationships: []
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
      world_info_user_likes: {
        Row: {
          created_at: string | null
          user_id: string
          world_info_id: string
        }
        Insert: {
          created_at?: string | null
          user_id: string
          world_info_id: string
        }
        Update: {
          created_at?: string | null
          user_id?: string
          world_info_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_info_user_likes_world_info_id_fkey"
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
          likes_count: number
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
          likes_count?: number
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
          likes_count?: number
          name?: string
          short_description?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _assert_self: {
        Args: { p_target: string }
        Returns: undefined
      }
      add_user_credits: {
        Args: {
          p_amount: number
          p_reference_id?: string
          p_transaction_type: string
          p_user_id: string
        }
        Returns: number
      }
      array_all_item_length_lte: {
        Args: { arr: string[]; max_len: number }
        Returns: boolean
      }
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      cancel_subscription: {
        Args: {
          p_cancel_immediately?: boolean
          p_subscription_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      cleanup_disabled_addon_context: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      confirm_relationship_regression: {
        Args: { p_character_id: string; p_user_id: string }
        Returns: Json
      }
      create_chat_with_greeting: {
        Args: {
          p_character_id: string
          p_user_id: string
          p_user_message: string
        }
        Returns: string
      }
      current_user_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      decrement_world_info_interaction_count: {
        Args: { world_info_id: string }
        Returns: undefined
      }
      deduct_user_credits: {
        Args: {
          p_amount: number
          p_description?: string
          p_operation_type?: string
          p_user_id: string
        }
        Returns: number
      }
      delete_chat_complete: {
        Args: { p_chat_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_private_character: {
        Args: { p_character_id: string }
        Returns: undefined
      }
      delete_user_account: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      evaluate_relationship_progress: {
        Args: { p_character_id: string; p_user_id: string }
        Returns: Json
      }
      fetch_world_info_full: {
        Args: { p_world_info_id: string }
        Returns: Json
      }
      get_billing_catalog: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_character_stats: {
        Args: { character_id: string }
        Returns: {
          average_rating: number
          total_chats: number
          total_favorites: number
          total_likes: number
          total_messages: number
          unique_users: number
        }[]
      }
      get_chat_context: {
        Args: { p_character_id: string; p_chat_id: string; p_user_id: string }
        Returns: {
          current_context: Json
        }[]
      }
      get_chat_messages: {
        Args: { p_before_order?: number; p_chat_id: string; p_limit?: number }
        Returns: {
          author_id: string
          chat_id: string
          content: string
          context_updates: Json
          created_at: string
          current_context: Json
          has_more: boolean
          id: string
          is_ai_message: boolean
          message_order: number
        }[]
      }
      get_chat_snapshot: {
        Args: {
          p_before_order?: number
          p_character_id: string
          p_chat_id: string
          p_limit?: number
          p_user_id: string
        }
        Returns: Json
      }
      get_credit_history: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: {
          balance_after: number
          change_amount: number
          created_at: string
          description: string
          id: number
          transaction_type: string
        }[]
      }
      get_public_character_cards: {
        Args: {
          p_creator_username?: string
          p_include_nsfw?: boolean
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
          p_tag_ids?: number[]
        }
        Returns: {
          avatar_url: string
          chats_count: number
          created_at: string
          creator: Json
          creator_id: string
          favorites_count: number
          id: string
          interaction_count: number
          likes_count: number
          name: string
          short_description: string
          tags: Json[]
          total_count: number
        }[]
      }
      get_public_profile_overview: {
        Args: { p_target_user_id: string }
        Returns: Json
      }
      get_user_billing_overview: {
        Args: { p_purchases_limit?: number; p_user_id: string }
        Returns: Json
      }
      get_user_bootstrap: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_user_chats: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          character_avatar_url: string
          character_id: string
          character_name: string
          chat_created_at: string
          chat_id: string
          chat_updated_at: string
          last_message_content: string
          last_message_created_at: string
          last_message_id: string
          last_message_is_ai: boolean
          message_count: number
          total_count: number
        }[]
      }
      get_user_credit_purchases: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: Json
      }
      get_user_credits: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_dashboard_overview: {
        Args: {
          p_chars_limit?: number
          p_favs_limit?: number
          p_user_id: string
        }
        Returns: Json
      }
      get_user_persona_context: {
        Args: {
          p_chat_id?: string
          p_include_list?: boolean
          p_user_id?: string
        }
        Returns: Json
      }
      get_user_subscription_with_plan: {
        Args: { p_user_id: string }
        Returns: Json
      }
      grant_monthly_allowances: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      increment_world_info_interaction_count: {
        Args: { world_info_id: string }
        Returns: undefined
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: string
      }
      list_public_world_infos: {
        Args: {
          p_exclude_nsfw?: boolean
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
          p_tag_ids?: number[]
        }
        Returns: Json
      }
      list_user_world_infos: {
        Args: Record<PropertyKey, never> | { p_user_id: string }
        Returns: Json
      }
      mark_memories_injected: {
        Args: { mem_ids: string[] }
        Returns: undefined
      }
      prune_expired_summary_locks: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      prune_stale_subscription_nonces: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      record_relationship_signal: {
        Args: {
          p_character_id: string
          p_kind: string
          p_polarity: number
          p_source_message_id?: string
          p_user_id: string
          p_weight: number
        }
        Returns: string
      }
      related_characters: {
        Args: { current_character_id: string; tag_ids: number[] }
        Returns: {
          avatar_url: string
          chats_count: number
          creator: Json
          id: string
          likes_count: number
          name: string
          short_description: string
          tags: Json
        }[]
      }
      resolve_tag_names: {
        Args: { p_names: string[] }
        Returns: {
          id: number
          name: string
        }[]
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      toggle_world_info_like: {
        Args: { p_world_info_id: string }
        Returns: Json
      }
      upsert_character_latent_profile: {
        Args: {
          p_character_id: string
          p_confidence_avg: number
          p_extraction_version: string
          p_populated_domains: number
          p_profile: Json
          p_source_card_hash: string
          p_token_cost?: number
        }
        Returns: undefined
      }
      upsert_relationship_goals: {
        Args: { p_character_id: string; p_relationship_goals: Json }
        Returns: Json
      }
      upsert_subscription: {
        Args: {
          p_current_period_end?: string
          p_paypal_subscription_id?: string
          p_plan_id: string
          p_status?: string
          p_stripe_subscription_id?: string
          p_user_id: string
        }
        Returns: string
      }
      user_world_infos_list: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      zz_jsonb_noarg: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      zz_list_user_world_infos: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      zz_test_rpc: {
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
  auth: {
    Enums: {
      aal_level: ["aal1", "aal2", "aal3"],
      code_challenge_method: ["s256", "plain"],
      factor_status: ["unverified", "verified"],
      factor_type: ["totp", "webauthn", "phone"],
      one_time_token_type: [
        "confirmation_token",
        "reauthentication_token",
        "recovery_token",
        "email_change_token_new",
        "email_change_token_current",
        "phone_change_token",
      ],
    },
  },
  billing: {
    Enums: {
      credit_transaction_type: [
        "initial_grant",
        "subscription_allowance",
        "top_up_purchase",
        "message_cost",
        "image_gen_cost",
        "admin_adjustment",
        "onboarding_reward",
      ],
      gateway_type: ["stripe", "paypal"],
      model_tier: ["standard", "premium", "experimental"],
      subscription_status: ["active", "past_due", "canceled", "trialing"],
      transaction_purchase_type: ["subscription", "credit_pack"],
      transaction_status: ["succeeded", "pending", "failed"],
    },
  },
  public: {
    Enums: {},
  },
} as const
