-- Drop the existing restrictive policy on world_info_entries
DROP POLICY IF EXISTS "World info entries follow world info permissions" ON public.world_info_entries;

-- Create explicit policies for world info entries
-- Policy 1: Allow public access to entries from public world infos
CREATE POLICY "Public can view entries from public world infos" 
ON public.world_info_entries
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.world_infos 
    WHERE world_infos.id = world_info_entries.world_info_id 
    AND world_infos.visibility = 'public'
  )
);

-- Policy 2: Allow creators to manage their own world info entries
CREATE POLICY "Creators can manage their own world info entries" 
ON public.world_info_entries
FOR ALL 
USING (
  EXISTS (
    SELECT 1 
    FROM public.world_infos 
    WHERE world_infos.id = world_info_entries.world_info_id 
    AND world_infos.creator_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.world_infos 
    WHERE world_infos.id = world_info_entries.world_info_id 
    AND world_infos.creator_id = auth.uid()
  )
);