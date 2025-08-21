import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

// =============================================================================
// DATABASE TYPE IMPORTS
// =============================================================================
// Explicitly import from the generated types, including billing schema
import type { Database } from '@/integrations/supabase/types';

// Public Schema Types
type PublicTables = Database['public']['Tables'];
export type Profile = PublicTables['profiles']['Row'];
export type Character = PublicTables['characters']['Row'];
export type Chat = PublicTables['chats']['Row'];
export type Message = PublicTables['messages']['Row'];
export type OnboardingChecklistItem = PublicTables['onboarding_checklist_items']['Row'];
export type UserOnboardingProgress = PublicTables['user_onboarding_progress']['Row'];

// Billing Schema Types
type BillingTables = Database['billing']['Tables'];
export type Plan = BillingTables['plans']['Row'];
export type Subscription = BillingTables['subscriptions']['Row'];
export type Credits = BillingTables['credits']['Row'];
export type CreditPack = BillingTables['credit_packs']['Row'];
export type CreditPackPurchase = BillingTables['credit_pack_purchases']['Row'];


// =============================================================================
// SEARCH INTERFACES
// =============================================================================
