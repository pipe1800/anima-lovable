
-- 1. Create a function that updates the 'updated_at' column
CREATE OR REPLACE FUNCTION public.handle_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create a trigger that fires before every update on the 'profiles' table
CREATE OR REPLACE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_update();

-- 3. Add columns for subscription tier, credits, and profile details
ALTER TABLE public.profiles
ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'guest_pass',
ADD COLUMN credits INTEGER NOT NULL DEFAULT 0,
ADD COLUMN avatar_url TEXT,
ADD COLUMN bio TEXT;

-- 4. Add a policy to allow public read access to non-sensitive profile data
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- 5. Add constraints to the username for length and character set
ALTER TABLE public.profiles
ADD CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20),
ADD CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]+$');

-- 6. Create an enum for subscription tiers to ensure data consistency
CREATE TYPE public.subscription_tier_type AS ENUM ('guest_pass', 'true_fan', 'the_whale');

-- 7. Update the subscription_tier column to use the enum
ALTER TABLE public.profiles 
ALTER COLUMN subscription_tier TYPE subscription_tier_type 
USING subscription_tier::subscription_tier_type;
