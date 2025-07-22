-- Enable RLS on chat_context table
ALTER TABLE public.chat_context ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own context data
CREATE POLICY "Users can read their own chat context" ON public.chat_context
FOR SELECT USING (
  auth.uid() = user_id
);

-- Create policy to allow users to insert their own context data
CREATE POLICY "Users can insert their own chat context" ON public.chat_context
FOR INSERT WITH CHECK (
  auth.uid() = user_id
);

-- Create policy to allow users to update their own context data
CREATE POLICY "Users can update their own chat context" ON public.chat_context
FOR UPDATE USING (
  auth.uid() = user_id
) WITH CHECK (
  auth.uid() = user_id
);

-- Create policy to allow users to delete their own context data
CREATE POLICY "Users can delete their own chat context" ON public.chat_context
FOR DELETE USING (
  auth.uid() = user_id
);

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_context TO authenticated;

-- Verify the policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'chat_context';
