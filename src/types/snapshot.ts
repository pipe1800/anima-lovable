// Snapshot v2 Type Definitions
// Generated from docs/snapshot-contract-v2.md

export interface UserSnapshotV2 {
  version: 2; // TODO: update to 3 in a follow-up alignment PR
  generated_at: string;
  user_id: string;
  included_sections: string[];
  profile: {
    id: string;
    username: string;
    avatar_url: string | null;
    banner_url: string | null;
    bio: string | null;
    timezone: string | null;
    default_persona_id: string | null;
    onboarding_completed: boolean;
  } | null;
  subscription: {
    id: string;
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    plan_id: string;
    current_period_end: string;
    plan: {
      id: string;
      name: string;
      price_monthly: number | null;
      monthly_credits_allowance: number;
      features: any;
    } | null;
  } | null;
  credits: {
    balance: number;
    monthly_used?: number;
  } | null;
  user_global_chat_settings: {
    dynamic_world_info: boolean;
    enhanced_memory: boolean;
    mood_tracking: boolean;
    clothing_inventory: boolean;
    location_tracking: boolean;
    time_and_weather: boolean;
    relationship_status: boolean;
    character_position: boolean;
    chain_of_thought: boolean;
    few_shot_examples: boolean;
    streaming_mode: 'instant' | 'smooth';
    font_size: 'small' | 'normal' | 'large';
    nsfw_enabled: boolean;
    ai_text_color: string;
    user_text_color: string;
    show_character_avatar: boolean;
    show_user_avatar: boolean;
    avatar_shape: 'circle' | 'rounded';
    avatar_size: 'sm' | 'md' | 'lg';
    background_image_url: string | null;
    ai_bubble_color: string;
    ai_bubble_opacity: number;
    user_bubble_color: string;
    user_bubble_opacity: number;
    semantic_overrides_mode: 'default' | 'custom' | 'disabled';
    speech_color: string | null;
    action_color: string | null;
    emphasis_color: string | null;
    parenthetical_color: string | null;
    avatar_style: 'classic' | 'bubble-bg' | 'portrait' | 'side-banner';
    avatar_overlay_opacity: number | null;
    avatar_overlay_color: string | null;
    avatar_blur_nsfw: boolean | null;
    portrait_frame_style: 'clean' | 'polaroid' | 'foil' | null;
    portrait_frame_color: string | null;
    banner_width: 'sm' | 'md' | 'lg' | null;
    banner_tint_from_avatar: boolean | null;
  } | null;
  personas: Array<{
    id: string;
    name: string;
    avatar_url: string | null;
    updated_at: string;
  }>;
  characters: Array<{
    id: string;
    name: string;
    short_description: string | null;
    tagline?: string | null;
    avatar_url: string | null;
    visibility: 'public' | 'unlisted' | 'private';
    interaction_count: number;
    chats_count: number | null;
    messages_count?: number | null;
    likes_count: number | null;
    favorites_count?: number | null;
    was_public?: boolean | null;
    created_at?: string; // newly exposed in enriched snapshot
    updated_at: string;
    character_definitions?: any; // enriched for owned characters
    tags?: Array<{ id: number; name: string }>;
  }>;
  recent_chats: Array<{
    id: string;
    title: string | null;
    last_message_at: string | null;
    character_id: string | null;
    character_name: string | null;
    character_avatar_url: string | null;
    last_message: string | null;
    last_message_is_ai: boolean | null;
    message_count: number | null;
  }>;
  favorite_character_ids: string[];
  favorites_full?: Array<{
    id: string;
    name: string;
    short_description: string | null;
    tagline?: string | null;
    avatar_url: string | null;
    visibility: 'public' | 'unlisted' | 'private';
    interaction_count: number;
    chats_count: number | null;
    messages_count?: number | null;
    likes_count: number | null;
    favorites_count?: number | null;
    updated_at: string;
    created_at?: string;
    creator_username: string | null;
    character_definitions?: any;
    tags?: Array<{ id: number; name: string }>;
  }>;
  liked_character_ids?: string[];
  tags: string[];
  stats: {
    total_chats: number;
    total_characters: number;
    total_personas: number;
    total_favorites: number;
  };
  debug?: {
    plan_source?: string;
    credits_source?: string;
    subscription_fallback_used?: boolean;
    legacy_subscription_found?: boolean;
    legacy_credits_found?: boolean;
    [k: string]: any;
  };
}

// Bootstrap Store Interfaces
export interface BootstrapState {
  snapshotVersion: number | null;
  generatedAt: string | null;
  userId: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  profile: UserSnapshotV2['profile'];
  subscription: UserSnapshotV2['subscription'];
  credits: UserSnapshotV2['credits'];
  settings: UserSnapshotV2['user_global_chat_settings'];
  personas: UserSnapshotV2['personas'];
  characters: UserSnapshotV2['characters'];
  recentChats: UserSnapshotV2['recent_chats'];
  favoriteCharacterIds: string[];
  likedCharacterIds?: string[]; // new liked ids from snapshot
  tags: UserSnapshotV2['tags'];
  stats: UserSnapshotV2['stats'];
  defaultPersona: { id: string; name: string; avatar_url: string | null } | null;
  debug?: UserSnapshotV2['debug'];
  favoritesFull?: NonNullable<UserSnapshotV2['favorites_full']>;
  // segment version counters for granular invalidation
  creditsVersion?: number;
  subscriptionVersion?: number;
  profileVersion?: number;
  settingsVersion?: number;
  personasVersion?: number;
  charactersVersion?: number;
  favoritesVersion?: number;
  chatsVersion?: number;
  tagsVersion?: number;
  creditMetrics?: { calls: number; lastDuration: number; totalDuration: number } | null;
}

export interface BootstrapActions {
  hydrate(snapshot: UserSnapshotV2): void;
  setProfile(p: Partial<NonNullable<UserSnapshotV2['profile']>>): void;
  setCredits(balance: number, monthlyUsed?: number): void;
  setSubscription(sub: UserSnapshotV2['subscription'] | null): void;
  updatePersona(id: string, patch: Partial<{ name: string; avatar_url: string }>): void;
  addPersona(p: { id: string; name: string; avatar_url: string | null; updated_at: string }): void;
  removePersona(id: string): void;
  updateCharacter(id: string, patch: Partial<{ name: string; short_description: string | null; tagline?: string | null; avatar_url: string | null; visibility: 'public' | 'unlisted' | 'private'; interaction_count: number; chats_count: number | null; messages_count?: number | null; likes_count: number | null; favorites_count?: number | null; updated_at: string; was_public?: boolean | null; character_definitions?: any; tags?: Array<{ id: number; name: string }> }>): void;
  addCharacter(c: BootstrapState['characters'][number]): void;
  removeCharacter(id: string): void;
  addRecentChat(chat: BootstrapState['recentChats'][number]): void;
  updateRecentChat(id: string, patch: Partial<BootstrapState['recentChats'][number]>): void;
  removeRecentChat?(id: string): void;
  setFavorites(ids: string[]): void;
  toggleFavorite(id: string, favorited: boolean): void;
  toggleLike?(id: string, liked: boolean): void;
  setTags(tags: string[]): void;
  setSettings(patch: Partial<NonNullable<UserSnapshotV2['user_global_chat_settings']>>): void;
  incrementCredits(delta: number): void;
  decrementCredits(delta: number): void;
  setStats(patch: Partial<UserSnapshotV2['stats']>): void;
  reset(): void;
  addFavoriteFull?(entry: any): void;
  updateFavoriteFull?(id: string, patch: any): void;
  removeFavoriteFull?(id: string): void;
}

export type BootstrapStore = BootstrapState & BootstrapActions;
