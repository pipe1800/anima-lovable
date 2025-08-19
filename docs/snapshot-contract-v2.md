# User Snapshot Contract v2 (Design)

Status: Draft
Purpose: Define consolidated user bootstrap payload to eliminate duplicate per-entity queries on initial load.
Consumer: BootstrapStore (see interface), AuthContext (to be refactored), Chat bootstrap logic, Pricing/Subscription pages.
Delivery: Supabase RPC `get_user_snapshot_v2` (new) OR extend existing `get_user_snapshot` (preferred) with a version field.

## Guiding Principles
- Single network roundtrip after auth resolves for majority of session-scoped data.
- Payload < 200KB uncompressed typical case.
- Omit heavy / rarely used fields (large persona lore, long character descriptions) unless explicitly needed; fetch lazily.
- Include version + generated_at for cache validation.
- Shape is forward extensible with optional sections flagged in `included_sections`.

## Top-Level Shape (TypeScript)
```ts
export interface UserSnapshotV2 {
  version: 2;
  generated_at: string;          // ISO timestamp
  user_id: string;               // Auth user id for sanity checking client side
  included_sections: string[];   // e.g. ['profile','subscription','credits','personas','characters','settings','tags','recent_chats','favorites']

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
      features: any; // JSONB raw
    } | null;
  } | null; // null => treat as free/guest

  credits: {
    balance: number;
    monthly_used?: number; // optional precomputed usage for dashboard
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
    // Heavy fields intentionally excluded: bio, lore
  }>;

  characters: Array<{
    id: string;
    name: string;
    short_description: string | null;
    avatar_url: string | null;
    visibility: 'public' | 'unlisted' | 'private';
    interaction_count: number;
    chats_count: number | null;
    likes_count: number | null;
    updated_at: string;
  }>; // Only user-owned lightweight list

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
  }>; // Derived from batched RPC (limit e.g. 15)

  favorite_character_ids: string[]; // For quick heart icon rendering

  tags: string[]; // Flat list of tag names (or objects if metadata later needed)

  stats: {
    total_chats: number;
    total_characters: number;
    total_personas: number;
    total_favorites: number;
  };
}
```

## Optional Future Sections (not included initially)
- `models`: active AI models (if model picker is common across routes) -> or separate static_catalog RPC.
- `plans`: active plans for pricing modal.
- `credit_packs`: list for one-time purchases.
- `age_verification`: { verified: boolean, verified_at: string }
- `world_info_summary`: counts or ids to lazy load later.

## Server Assembly (Pseudo-SQL / RPC Outline)
1. Validate auth uid (using auth.jwt())
2. Select profile row.
3. Select latest subscription (ORDER BY created_at DESC LIMIT 1) LEFT JOIN plan.
4. Select credits balance (coalesce to 0).
5. Select global chat settings.
6. Select personas lightweight fields.
7. Select user characters lightweight fields.
8. Select recent chats via existing `get_user_chats_batched` RPC then slice limit 15.
9. Select favorite character ids ordered by created_at DESC.
10. Select tag names (active only if there is an is_active column; else all).
11. Compute stats counts (favorites/personas/characters/chats) via simple COUNTs or derived lengths to avoid extra queries.
12. Compose JSON, include version=2 & included_sections keys present.

## Client Usage Flow
- After auth ready, call snapshot RPC (if not already in sessionStorage with same user_id + version).
- Hydrate BootstrapStore with payload.
- Downstream hooks/components read from store synchronously; no additional fetch fired if data present.

## Invalidation Strategy (Snapshot Level)
- Snapshot considered valid for entire session except:
  - Persona CRUD -> mutate store (no refetch) unless > N operations then soft refresh.
  - Character CRUD -> mutate store.
  - Credits consumption -> update store balance from mutation response.
  - Subscription purchase/change -> trigger targeted refetch of subscription sub-object, not whole snapshot.

## Size Considerations
- Estimate (typical): 10 personas * 120 bytes + 15 chats * 160 bytes + 8 characters * 140 bytes + overhead < 20KB.
- Even with tags (<=200) still < 30KB.

## Backwards Compatibility
- Keep existing `get_user_snapshot` until all consumers migrated; implement new RPC name or add `version` field so client can branch.
- If older client receives V2 shape with unknown fields, ignore extras.

## Security / RLS
- Ensure RPC executes with auth uid context; all selects filtered by auth.uid() except public tags.
- No sensitive PII beyond what profile already exposes.

## TODO (Implementation Checklist)
- [ ] Write RPC SQL migration for v2.
- [ ] Add types to `types/snapshot.ts`.
- [ ] Implement `fetchUserSnapshotV2()` in `lib/snapshot.ts` using `supabase.rpc`.
- [ ] Integrate BootstrapStore hydration (next doc).
- [ ] Remove redundant per-entity queries post-migration.
- [ ] Add instrumentation around request suppression.

---

# BootstrapStore Interface (Design)

Purpose: Central in-memory + optional sessionStorage cache for snapshot & related incremental updates, supplying synchronous selectors to React components.

## Technology Choice
- Lightweight custom store with React Context + internal listeners OR Zustand. (Project already uses custom contexts; for minimal dependency, start with simple event emitter pattern; can migrate to Zustand if complexity rises.)
- Provide hooks: `useBootstrap()` for whole object (rare) and granular hooks: `useUserProfile()`, `useCredits()`, etc.

## Store Shape (TypeScript)
```ts
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
  tags: UserSnapshotV2['tags'];
  stats: UserSnapshotV2['stats'];

  // Derived helpers
  defaultPersona: { id: string; name: string; avatar_url: string | null } | null;
}

export interface BootstrapActions {
  hydrate(snapshot: UserSnapshotV2): void;
  setProfile(p: Partial<NonNullable<UserSnapshotV2['profile']>>): void;
  setCredits(balance: number, monthlyUsed?: number): void;
  setSubscription(sub: UserSnapshotV2['subscription'] | null): void;
  updatePersona(id: string, patch: Partial<{ name: string; avatar_url: string }>): void;
  addPersona(p: { id: string; name: string; avatar_url: string | null; updated_at: string }): void;
  removePersona(id: string): void;
  updateCharacter(id: string, patch: Partial<{ name: string; short_description: string | null; avatar_url: string | null; visibility: 'public' | 'unlisted' | 'private'; interaction_count: number; chats_count: number | null; likes_count: number | null; updated_at: string }>): void;
  addCharacter(c: BootstrapState['characters'][number]): void;
  removeCharacter(id: string): void;
  addRecentChat(chat: BootstrapState['recentChats'][number]): void; // Prepend & truncate
  updateRecentChat(id: string, patch: Partial<BootstrapState['recentChats'][number]>): void;
  setFavorites(ids: string[]): void;
  toggleFavorite(id: string, favorited: boolean): void;
  setTags(tags: string[]): void;
  setSettings(patch: Partial<NonNullable<UserSnapshotV2['user_global_chat_settings']>>): void;
  incrementCredits(delta: number): void; // rarely used (positive from grant)
  decrementCredits(delta: number): void; // consumed
  setStats(patch: Partial<UserSnapshotV2['stats']>): void;
  reset(): void; // on signOut
}

export type BootstrapStore = BootstrapState & BootstrapActions;
```

## Persistence Strategy
- Primary source: in-memory singleton.
- Optional sessionStorage caching gate: only store if snapshotVersion matches; key pattern: `bootstrap_snapshot_${userId}_v${version}`.
- On hydrate: compare new generated_at to stored; if newer, overwrite.

## Hook API Examples
```ts
// Returns basic user info & loading state
function useUserProfile(): { profile: BootstrapState['profile']; loading: boolean; refreshProfile: () => Promise<void>; }

// Credits
function useCredits(): { balance: number; monthlyUsed?: number; consume: (n:number)=>void; } // consume calls decrementCredits immediately + server mutation

// Personas list & mutators
function usePersonas(): { personas: BootstrapState['personas']; addPersona(...); updatePersona(...); }
```

## Hydration Flow
1. Auth resolves -> if user id changed, call fetchUserSnapshotV2 (unless cache valid & not expired).
2. `hydrate()` populates state; derive `defaultPersona` by matching `profile.default_persona_id`.
3. AuthContext refactor: remove direct profile/subscription queries; instead rely on BootstrapStore.
4. Chat open: before calling edge chat-management, UI already has personas, credits; skip redundant fetch.

## Duplicate Suppression
- Provide helper `ensureSnapshotLoaded(): Promise<void>` that returns the in-flight hydration promise if already loading.
- Expose `isHydrating` boolean.

## Invalidation Events -> Actions Mapping
| Event | Action |
|-------|--------|
| Persona created | addPersona + stats.total_personas++ |
| Persona updated | updatePersona |
| Persona deleted | removePersona + stats.total_personas-- |
| Character created | addCharacter + stats.total_characters++ |
| Character updated | updateCharacter |
| Character deleted | removeCharacter + stats.total_characters-- |
| Favorite toggled | toggleFavorite + adjust stats.total_favorites |
| Credits consumed | decrementCredits |
| Credits granted | incrementCredits |
| Subscription changed | setSubscription |
| Settings saved | setSettings |

## Concurrency Guard
- Internal `hydratePromise: Promise<void> | null` ensures only one network call; subsequent calls await it.
- After resolve or reject, cleared (unless error -> store error message).

## Error Handling
- Snapshot fetch failure: set `error`, keep `loading=false`, allow retry via `ensureSnapshotLoaded(true)` with force flag.

## Open Questions / Future
- Add event emitter for analytics (on hydrate, on invalidate).
- Consider migrating to Zustand if number of actions grows >25 or if need for middleware (devtools, persistence) increases.

## Implementation Checklist
- [ ] Create `types/snapshot.ts` with `UserSnapshotV2` & store interfaces.
- [ ] Implement `bootstrap-store.ts` in `src/state/` (or `contexts/`).
- [ ] Refactor `AuthContext` to depend on store selectors.
- [ ] Update edge chat-management consumer to use store for personas/credits.
- [ ] Remove redundant queries (profile, subscription, credits) after validation.
