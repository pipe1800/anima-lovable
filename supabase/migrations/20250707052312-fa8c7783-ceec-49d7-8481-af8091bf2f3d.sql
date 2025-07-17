
-- Create storage bucket for character avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('character-avatars', 'character-avatars', true);

-- Create storage policies for character avatars
CREATE POLICY "Anyone can view character avatars" ON storage.objects
FOR SELECT USING (bucket_id = 'character-avatars');

CREATE POLICY "Authenticated users can upload character avatars" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'character-avatars' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update their own character avatars" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'character-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own character avatars" ON storage.objects
FOR DELETE USING (
  bucket_id = 'character-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
