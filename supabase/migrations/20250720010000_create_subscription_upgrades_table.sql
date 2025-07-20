-- Create subscription_upgrades table for tracking plan upgrades
CREATE TABLE IF NOT EXISTS subscription_upgrades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_plan TEXT NOT NULL,
    to_plan TEXT NOT NULL,
    upgrade_paypal_subscription_id TEXT NOT NULL,
    credits_granted INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscription_upgrades_user_id ON subscription_upgrades(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_upgrades_status ON subscription_upgrades(status);
CREATE INDEX IF NOT EXISTS idx_subscription_upgrades_created_at ON subscription_upgrades(created_at);

-- Add RLS policies
ALTER TABLE subscription_upgrades ENABLE ROW LEVEL SECURITY;

-- Users can only see their own upgrade records
CREATE POLICY "Users can view own upgrade records" ON subscription_upgrades
    FOR SELECT USING (auth.uid() = user_id);

-- Only the service can insert/update upgrade records
CREATE POLICY "Service can manage upgrade records" ON subscription_upgrades
    FOR ALL USING (auth.role() = 'service_role');

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_subscription_upgrades_updated_at 
    BEFORE UPDATE ON subscription_upgrades 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
