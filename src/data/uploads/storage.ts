import { supabase } from '@/db/client';

// Unified media upload kinds
export type MediaKind =
  | 'character-avatar'
  | 'character-banner'
  | 'world-info-avatar'
  | 'profile-avatar'
  | 'profile-banner'
  | 'chat-background';

interface MediaConfig {
  bucket: string;
  upsert: boolean;
  pattern: (userId: string, ext: string) => string;
}

const MEDIA_CONFIG: Record<MediaKind, MediaConfig> = {
  'character-avatar': {
    bucket: 'character-avatars',
    upsert: false,
    pattern: (u, ext) => `${u}/avatar-${Date.now()}.${ext}`
  },
  'character-banner': {
    bucket: 'character-avatars',
    upsert: false,
    pattern: (u, ext) => `${u}/banner-${Date.now()}.${ext}`
  },
  'world-info-avatar': {
    bucket: 'character-avatars',
    upsert: false,
    pattern: (u, ext) => `${u}/world-info-${Date.now()}.${ext}`
  },
  'profile-avatar': {
    bucket: 'profile-images',
    upsert: false,
    pattern: (u, ext) => `${u}/avatar-${Date.now()}.${ext}`
  },
  'profile-banner': {
    bucket: 'profile-images',
    upsert: false,
    pattern: (u, ext) => `${u}/banner-${Date.now()}.${ext}`
  },
  'chat-background': {
    bucket: 'user-style',
    upsert: true, // stable deterministic path
    pattern: (u, ext) => `backgrounds/${u}.${ext}`
  }
};

/** Low-level generic bucket upload (still exported for rare custom cases). */
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

/** Unified high-level media uploader */
export async function uploadMedia(params: {
  kind: MediaKind;
  userId: string;
  file: File | Blob;
  overwrite?: boolean; // overrides config upsert
  cacheControlSeconds?: number;
  pathOverride?: string; // deterministic custom path
}): Promise<{ publicUrl: string | null; error: Error | null; path?: string }> {
  const { kind, userId, file, overwrite, cacheControlSeconds, pathOverride } = params;
  const cfg = MEDIA_CONFIG[kind];
  const name = (file instanceof File && file.name) ? file.name : 'upload.bin';
  const ext = name.includes('.') ? name.split('.').pop() || 'bin' : 'bin';
  const path = pathOverride || cfg.pattern(userId, ext);
  return uploadToBucket({ bucket: cfg.bucket, path, file, upsert: overwrite ?? cfg.upsert, cacheControlSeconds });
}

/** Provision a default avatar (idempotent: always upserts same path) */
export async function ensureDefaultAvatar(userId: string) {
  try {
    const response = await fetch('/default_avatar.jpg');
    const blob = await response.blob();
    const file = new File([blob], 'default_avatar.jpg', { type: blob.type });
    const { publicUrl } = await uploadMedia({
      kind: 'profile-avatar',
      userId,
      file,
      overwrite: true,
      pathOverride: `${userId}/avatar-default.jpg`
    });
    return publicUrl || '/default_avatar.jpg';
  } catch (e) {
    return '/default_avatar.jpg';
  }
}
