-- Create table for storing user chat context
CREATE TABLE public.user_chat_context (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  character_id UUID NOT NULL,
  chat_id UUID NOT NULL,
  context_type TEXT NOT NULL CHECK (context_type IN ('mood', 'clothing', 'location', 'time_weather', 'relationship')),
  current_context TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, character_id, chat_id, context_type)
);

-- Enable Row Level Security
ALTER TABLE public.user_chat_context ENABLE ROW LEVEL SECURITY;

-- Users can only access their own context
CREATE POLICY "Users can manage their own context" 
ON public.user_chat_context 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_chat_context_updated_at
BEFORE UPDATE ON public.user_chat_context
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();