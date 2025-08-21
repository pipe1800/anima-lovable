import { supabase } from '@/db/client';

/**
 * Upload a file to a storage bucket and return its public URL.
 */
export async function uploadToBucket(params: {
  bucket: string;
  path: string;
  file: File | Blob;
  upsert?: boolean;
  cacheControlSeconds?: number;
}): Promise<{ publicUrl: string | null; error: Error | null; path?: string } > {
  const { bucket, path, file, upsert = true, cacheControlSeconds = 3600 } = params;
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert, cacheControl: String(cacheControlSeconds) });
  if (error) return { publicUrl: null, error };
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return { publicUrl: pub.publicUrl, error: null, path: data.path };
}

export async function uploadAvatar(userId: string, file: File) {
  const fileExt = file.name.split('.').pop();
  const path = `${userId}/avatar-${Date.now()}.${fileExt}`;
  return uploadToBucket({ bucket: 'character-avatars', path, file });
}

export async function uploadBanner(userId: string, file: File) {
  const fileExt = file.name.split('.').pop();
  const path = `${userId}/banner-${Date.now()}.${fileExt}`;
  return uploadToBucket({ bucket: 'character-avatars', path, file });
}

/**
 * Canonical default avatar provisioning helper (used by auth data layer).
 */
export async function ensureDefaultAvatar(userId: string) {
  const response = await fetch('/default_avatar.jpg');
  const blob = await response.blob();
  const file = new File([blob], 'default_avatar.jpg', { type: blob.type });
  const { publicUrl } = await uploadToBucket({ bucket: 'character-avatars', path: `${userId}/avatar-default.jpg`, file });
  return publicUrl || '/default_avatar.jpg';
}
