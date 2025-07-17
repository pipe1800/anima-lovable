
-- Add UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========= SECTION 1: SCHEMA ORGANIZATION =========
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS moderation;

-- ========= SECTION 2: USER & ONBOARDING =========

-- Types
CREATE TYPE core.visibility_status AS ENUM ('public', 'unlisted', 'private');

-- Tables
CREATE TABLE core.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL CHECK (char_length(username) >= 3 AND char_length(username) <= 20),
  avatar_url TEXT,
  bio TEXT CHECK (char_length(bio) <= 250),
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  onboarding_survey_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE core.profiles IS 'Public user profiles, linked to auth.users.';

CREATE TABLE core.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  email_notifications JSONB DEFAULT '{"new_followers": true, "chat_mentions": true, "product_updates": true}',
  language VARCHAR(10) NOT NULL DEFAULT 'en'
);
COMMENT ON TABLE core.user_settings IS 'User-specific private settings.';

CREATE TABLE core.onboarding_checklist_items (
  id SERIAL PRIMARY KEY,
  task_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  reward_credits INTEGER DEFAULT 0
);
COMMENT ON TABLE core.onboarding_checklist_items IS 'Defines the tasks for the new user onboarding checklist.';

CREATE TABLE core.user_onboarding_progress (
  user_id UUID NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES core.onboarding_checklist_items(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, task_id)
);
COMMENT ON TABLE core.user_onboarding_progress IS 'Tracks user completion of onboarding tasks.';

-- Add user roles table for proper role management
CREATE TABLE core.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'moderator', 'admin')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
COMMENT ON TABLE core.user_roles IS 'Manages user roles for authorization.';

-- RLS Policies for User & Onboarding
ALTER TABLE core.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone." ON core.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile." ON core.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

ALTER TABLE core.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own settings." ON core.user_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE core.onboarding_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Checklist items are viewable by authenticated users." ON core.onboarding_checklist_items FOR SELECT TO authenticated USING (true);

ALTER TABLE core.user_onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own onboarding progress." ON core.user_onboarding_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE core.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own roles." ON core.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles." ON core.user_roles FOR ALL USING (EXISTS(SELECT 1 FROM core.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ========= SECTION 3: CHARACTERS & DISCOVERY =========

-- Tables
CREATE TABLE core.characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 50),
  short_description TEXT CHECK (char_length(short_description) <= 200),
  avatar_url TEXT,
  visibility core.visibility_status NOT NULL DEFAULT 'private',
  interaction_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE core.characters IS 'Stores public metadata for AI characters.';

CREATE TABLE core.character_definitions (
  character_id UUID PRIMARY KEY REFERENCES core.characters(id) ON DELETE CASCADE,
  greeting TEXT,
  long_description TEXT,
  definition TEXT NOT NULL,
  contextual_data JSONB,
  model_id UUID -- Will reference billing.models later
);
COMMENT ON TABLE core.character_definitions IS 'Stores the detailed AI definition and personality for a character.';

CREATE TABLE core.tags (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
COMMENT ON TABLE core.tags IS 'A list of available tags for categorizing characters.';

CREATE TABLE core.character_tags (
  character_id UUID NOT NULL REFERENCES core.characters(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES core.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (character_id, tag_id)
);
COMMENT ON TABLE core.character_tags IS 'Join table for character tags.';

-- Performance indexes
CREATE INDEX idx_characters_creator_visibility ON core.characters(creator_id, visibility);
CREATE INDEX idx_characters_visibility_created ON core.characters(visibility, created_at DESC) WHERE visibility = 'public';

-- RLS Policies for Characters
ALTER TABLE core.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Characters are viewable based on visibility." ON core.characters FOR SELECT USING ((visibility = 'public') OR (creator_id = auth.uid()));
CREATE POLICY "Users can create characters." ON core.characters FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owners can update their own characters." ON core.characters FOR UPDATE USING (creator_id = auth.uid());
CREATE POLICY "Owners can delete their own characters." ON core.characters FOR DELETE USING (creator_id = auth.uid());

ALTER TABLE core.character_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Definitions are accessible if the character is viewable." ON core.character_definitions FOR SELECT USING (character_id IN (SELECT id FROM core.characters));
CREATE POLICY "Owners can update character definitions." ON core.character_definitions FOR UPDATE USING ((SELECT creator_id FROM core.characters WHERE id = character_id) = auth.uid());

ALTER TABLE core.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tags are public." ON core.tags FOR SELECT USING (true);

ALTER TABLE core.character_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Character tags are public." ON core.character_tags FOR SELECT USING (true);
CREATE POLICY "Owners can manage their character tags." ON core.character_tags FOR INSERT WITH CHECK ((SELECT creator_id FROM core.characters WHERE id = character_id) = auth.uid());
CREATE POLICY "Owners can delete their character tags." ON core.character_tags FOR DELETE USING ((SELECT creator_id FROM core.characters WHERE id = character_id) = auth.uid());

-- ========= SECTION 4: REAL-TIME CHAT SYSTEM =========

-- Tables
CREATE TABLE core.chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES core.characters(id) ON DELETE CASCADE,
  title TEXT,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE core.chats IS 'Represents a single conversation session.';

CREATE TABLE core.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES core.chats(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES core.profiles(id),
  is_ai_message BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  token_cost INTEGER,
  model_id UUID, -- Will reference billing.models later
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_messages_chat_id ON core.messages(chat_id);
CREATE INDEX idx_chats_user_updated ON core.chats(user_id, updated_at DESC);
COMMENT ON TABLE core.messages IS 'Stores individual messages within a chat session.';

-- RLS Policies for Chat
ALTER TABLE core.chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own chats." ON core.chats FOR ALL USING (user_id = auth.uid());

ALTER TABLE core.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only view messages in their own chats." ON core.messages FOR SELECT USING (chat_id IN (SELECT id FROM core.chats WHERE user_id = auth.uid()));
CREATE POLICY "Users can only insert messages into their own chats." ON core.messages FOR INSERT WITH CHECK (chat_id IN (SELECT id FROM core.chats WHERE user_id = auth.uid()));

-- ========= SECTION 5: MONETIZATION & BILLING =========

-- Types
CREATE TYPE billing.model_tier AS ENUM ('standard', 'premium', 'experimental');
CREATE TYPE billing.subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing');
CREATE TYPE billing.credit_transaction_type AS ENUM ('initial_grant', 'subscription_allowance', 'top_up_purchase', 'message_cost', 'image_gen_cost', 'admin_adjustment', 'onboarding_reward');
CREATE TYPE billing.gateway_type AS ENUM ('stripe', 'paypal');
CREATE TYPE billing.transaction_status AS ENUM ('succeeded', 'pending', 'failed');

-- Tables
CREATE TABLE billing.plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  price_monthly INTEGER,
  price_yearly INTEGER,
  monthly_credits_allowance INTEGER NOT NULL DEFAULT 0,
  features JSONB,
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);
COMMENT ON TABLE billing.plans IS 'Stores subscription plan details and features.';

CREATE TABLE billing.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES billing.plans(id),
  status billing.subscription_status NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE billing.subscriptions IS 'Tracks user subscriptions and their status.';

CREATE TABLE billing.credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0)
);
COMMENT ON TABLE billing.credits IS 'Stores the current credit balance for each user.';

CREATE TABLE billing.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gateway billing.gateway_type NOT NULL,
  gateway_transaction_id TEXT UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status billing.transaction_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE billing.transactions IS 'Logs all payment gateway transactions.';

CREATE TABLE billing.credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_amount INTEGER NOT NULL,
  transaction_type billing.credit_transaction_type NOT NULL,
  description TEXT,
  related_transaction_id UUID REFERENCES billing.transactions(id),
  related_message_id UUID REFERENCES core.messages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE billing.credit_ledger IS 'Immutable ledger of all credit transactions for auditing.';

CREATE TABLE billing.models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  provider_model_id TEXT UNIQUE NOT NULL,
  input_cost_per_million_tokens NUMERIC(10, 4) NOT NULL,
  output_cost_per_million_tokens NUMERIC(10, 4) NOT NULL,
  tier billing.model_tier NOT NULL DEFAULT 'standard'
);
COMMENT ON TABLE billing.models IS 'Stores details and pricing for available AI models.';

-- Add Foreign Key constraints after tables are created
ALTER TABLE core.character_definitions ADD CONSTRAINT fk_model_id FOREIGN KEY (model_id) REFERENCES billing.models(id);
ALTER TABLE core.messages ADD CONSTRAINT fk_model_id FOREIGN KEY (model_id) REFERENCES billing.models(id);

-- RLS Policies for Billing
ALTER TABLE billing.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are publicly viewable." ON billing.plans FOR SELECT USING (is_active = true);

ALTER TABLE billing.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own subscriptions." ON billing.subscriptions FOR ALL USING (user_id = auth.uid());

ALTER TABLE billing.credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own credit balance." ON billing.credits FOR SELECT USING (user_id = auth.uid());

ALTER TABLE billing.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own credit ledger." ON billing.credit_ledger FOR SELECT USING (user_id = auth.uid());

ALTER TABLE billing.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own transactions." ON billing.transactions FOR SELECT USING (user_id = auth.uid());

ALTER TABLE billing.models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Models are publicly viewable." ON billing.models FOR SELECT USING (true);

-- ========= SECTION 6: CONTENT MODERATION =========

-- Types
CREATE TYPE moderation.report_content_type AS ENUM ('message', 'character', 'profile');
CREATE TYPE moderation.report_status AS ENUM ('pending', 'in_review', 'resolved', 'dismissed');
CREATE TYPE moderation.moderator_action AS ENUM ('warn_user', 'mute_user_from_chat', 'ban_user', 'delete_message', 'hide_character', 'dismiss_report');
CREATE TYPE moderation.filter_rule_type AS ENUM ('keyword', 'regex', 'ai_theme');
CREATE TYPE moderation.filter_action AS ENUM ('flag', 'block');

-- Tables
CREATE TABLE moderation.reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  content_type moderation.report_content_type NOT NULL,
  content_id TEXT NOT NULL,
  reason TEXT,
  status moderation.report_status NOT NULL DEFAULT 'pending',
  moderator_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
COMMENT ON TABLE moderation.reports IS 'Stores user-submitted reports for content violations.';

CREATE TABLE moderation.action_logs (
  id BIGSERIAL PRIMARY KEY,
  moderator_id UUID NOT NULL REFERENCES auth.users(id),
  target_user_id UUID REFERENCES auth.users(id),
  target_content_type moderation.report_content_type,
  target_content_id TEXT,
  action_type moderation.moderator_action NOT NULL,
  reason TEXT,
  related_report_id BIGINT REFERENCES moderation.reports(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE moderation.action_logs IS 'Immutable log of all actions taken by moderators.';

CREATE TABLE moderation.filter_rules (
  id SERIAL PRIMARY KEY,
  rule_type moderation.filter_rule_type NOT NULL,
  pattern TEXT NOT NULL,
  action moderation.filter_action NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE moderation.filter_rules IS 'Defines rules for the automated content moderation system.';

-- RLS Policies for Moderation (requires user roles)
ALTER TABLE moderation.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can create reports." ON moderation.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "Moderators can manage reports." ON moderation.reports FOR ALL USING (public.get_user_role() IN ('moderator', 'admin'));

ALTER TABLE moderation.action_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Moderators can access action logs." ON moderation.action_logs FOR ALL USING (public.get_user_role() IN ('moderator', 'admin'));

ALTER TABLE moderation.filter_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage filter rules." ON moderation.filter_rules FOR ALL USING (public.get_user_role() = 'admin');

-- ========= SECTION 7: FUNCTIONS & TRIGGERS =========

-- Function to get user role from database
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM core.user_roles WHERE user_id = auth.uid() ORDER BY 
    CASE role 
      WHEN 'admin' THEN 1 
      WHEN 'moderator' THEN 2 
      WHEN 'user' THEN 3 
    END 
  LIMIT 1;
$$;

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, core, billing
AS $$
BEGIN
  INSERT INTO core.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)));

  INSERT INTO core.user_settings (user_id)
  VALUES (NEW.id);

  INSERT INTO billing.credits (user_id, balance)
  VALUES (NEW.id, 50); -- Give new users 50 credits to start

  -- Give all new users the 'user' role
  INSERT INTO core.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

-- Trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Generic function to update 'updated_at' timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the updated_at trigger to relevant tables
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON core.profiles FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON core.characters FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON core.chats FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- ========= SECTION 8: SEED DATA =========

-- Insert default billing plans
INSERT INTO billing.plans (name, price_monthly, price_yearly, monthly_credits_allowance, features, is_active) VALUES
('Guest Pass', 0, 0, 75, '{"daily_chat_limit": 75, "character_creation": false, "advanced_models": false}', true),
('True Fan', 999, 9990, 2000, '{"daily_chat_limit": null, "character_creation": true, "advanced_models": false, "priority_support": true}', true),
('The Whale', 2999, 29990, 10000, '{"daily_chat_limit": null, "character_creation": true, "advanced_models": true, "priority_support": true, "beta_features": true}', true);

-- Insert common tags
INSERT INTO core.tags (name) VALUES
('Fantasy'), ('Sci-Fi'), ('Romance'), ('Mystery'), ('Horror'), ('Comedy'), 
('Adventure'), ('Historical'), ('Modern'), ('Anime'), ('Realistic'), ('Supernatural'),
('Magic'), ('Space'), ('Medieval'), ('Victorian'), ('Cyberpunk'), ('Steampunk');

-- Insert default AI models
INSERT INTO billing.models (name, provider_model_id, input_cost_per_million_tokens, output_cost_per_million_tokens, tier) VALUES
('GPT-3.5 Turbo', 'gpt-3.5-turbo', 0.5000, 1.5000, 'standard'),
('GPT-4', 'gpt-4', 30.0000, 60.0000, 'premium'),
('GPT-4 Turbo', 'gpt-4-turbo', 10.0000, 30.0000, 'premium'),
('Claude 3 Haiku', 'claude-3-haiku', 0.2500, 1.2500, 'standard'),
('Claude 3 Sonnet', 'claude-3-sonnet', 3.0000, 15.0000, 'premium');

-- Insert onboarding checklist items
INSERT INTO core.onboarding_checklist_items (task_key, title, description, reward_credits) VALUES
('complete_profile', 'Complete Your Profile', 'Add a profile picture and bio to help others discover you', 25),
('create_first_character', 'Create Your First Character', 'Design and publish your first AI character', 50),
('have_first_chat', 'Start Your First Conversation', 'Chat with any character for at least 5 messages', 25),
('join_discord', 'Join Our Community', 'Connect with other creators on our Discord server', 10),
('explore_discover', 'Explore the Discover Page', 'Browse and favorite 3 different characters', 15);
