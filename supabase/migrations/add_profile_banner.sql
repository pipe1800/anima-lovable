-- Add banner image support to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS banner_url TEXT,
ADD COLUMN IF NOT EXISTS banner_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Update the updated_at trigger to include banner_updated_at
CREATE OR REPLACE FUNCTION update_banner_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.banner_url IS DISTINCT FROM NEW.banner_url THEN
        NEW.banner_updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_banner_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_banner_updated_at();
