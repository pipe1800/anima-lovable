
// Database type definitions for our schema
export interface Profile {
  id: string;
  username: string;
  avatar_url?: string;
  banner_url?: string;
  bio?: string;
  onboarding_completed: boolean;
  onboarding_survey_data?: any;
  timezone?: string | null;
  created_at: string;
  updated_at: string;
  banner_updated_at?: string;
}

export interface Character {
  id: string;
  creator_id: string;
  name: string;
  short_description?: string;
  avatar_url?: string;
  visibility: 'public' | 'unlisted' | 'private';
  interaction_count: number;
  created_at: string;
  updated_at: string;
  // Extended properties for dashboard
  tagline?: string;
  actual_chat_count?: number;
  likes_count?: number;
}

export interface CharacterDefinition {
  character_id: string;
  greeting?: string;
  description?: string;
  personality_summary: string;
  scenario?: any;
  model_id?: string;
}

export interface Plan {
  id: string;
  name: string;
  price_monthly?: number;
  price_yearly?: number;
  monthly_credits_allowance: number;
  features?: any;
  stripe_price_id_monthly?: string;
  stripe_price_id_yearly?: string;
  is_active: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  current_period_end: string;
  stripe_subscription_id?: string;
  created_at: string;
  plan?: Plan;
}

export interface Credits {
  user_id: string;
  balance: number;
}

export interface Chat {
  id: string;
  user_id: string;
  character_id: string;
  title?: string;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
  selected_persona_id?: string;
  context_ceiling_warned?: boolean;
  chat_mode: 'storytelling' | 'companion';
  character?: Character;
}

export interface Message {
  id: string;
  chat_id: string;
  author_id: string;
  is_ai_message: boolean;
  content: string;
  token_cost?: number;
  model_id?: string;
  created_at: string;
  author?: Profile;
}

export interface OnboardingChecklistItem {
  id: number;
  task_key: string;
  title: string;
  description?: string;
  reward_credits: number;
}

export interface UserOnboardingProgress {
  user_id: string;
  task_id: number;
  completed_at?: string;
  task?: OnboardingChecklistItem;
}

export interface Tag {
  id: number;
  name: string;
}

export interface UserCharacterSettings {
  id: string;
  user_id: string;
  character_id: string;
  chat_mode: 'storytelling' | 'companion';
  time_awareness_enabled: boolean;
  created_at: string;
  updated_at: string;
}
