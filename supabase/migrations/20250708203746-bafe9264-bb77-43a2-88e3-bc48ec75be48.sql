-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Plans are publicly viewable." ON plans;

-- Create a new policy that allows public access
CREATE POLICY "Plans are publicly viewable" ON plans
  FOR SELECT 
  TO public, anon, authenticated
  USING (is_active = true);