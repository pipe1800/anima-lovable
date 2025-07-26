import { supabase } from '@/integrations/supabase/client';

export const uploadAvatar = async (file: File, userId: string): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/avatar-${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('character-avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('Error uploading avatar:', error);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('character-avatars')
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading avatar:', error);
    return null;
  }
};

export const uploadBanner = async (file: File, userId: string): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/banner-${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('character-avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('Banner upload error:', error);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('character-avatars')
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (error) {
    console.error('Banner upload error:', error);
    return null;
  }
};
