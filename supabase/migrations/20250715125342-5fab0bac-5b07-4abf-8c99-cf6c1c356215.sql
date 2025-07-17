-- Create message_context table to store context updates per message
CREATE TABLE public.message_context (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  character_id UUID NOT NULL,
  chat_id UUID NOT NULL,
  context_updates JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.message_context ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own message context" 
ON public.message_context 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own message context" 
ON public.message_context 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own message context" 
ON public.message_context 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own message context" 
ON public.message_context 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for efficient queries
CREATE INDEX idx_message_context_message_id ON public.message_context(message_id);
CREATE INDEX idx_message_context_chat_id ON public.message_context(chat_id);
CREATE INDEX idx_message_context_user_id ON public.message_context(user_id);