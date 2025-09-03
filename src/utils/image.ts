// Utilities for building optimized image URLs (Supabase Storage transformations)
export const getThumbUrl = (
  url?: string | null,
  opts?: { width?: number; quality?: number; format?: 'webp' | 'jpg' | 'png' }
) => {
  if (!url) return '/placeholder.svg';

  const enableTransforms = (import.meta as any)?.env?.VITE_SUPABASE_IMG_TRANSFORM === 'true';
  if (!enableTransforms) return url; // Safe default to avoid broken images if transforms are disabled

  const width = opts?.width ?? 512;
  const quality = opts?.quality ?? 75;
  const format = opts?.format ?? 'webp';

  try {
    const objectSegment = '/storage/v1/object/public/';
    const renderSegment = '/storage/v1/render/image/public/';

    // Absolute or relative object URL
    if (url.includes(objectSegment)) {
      const [base, after] = url.split(objectSegment);
      const path = after; // bucket/path
      const prefix = base || '';
      return `${prefix}${renderSegment}${path}?width=${width}&quality=${quality}&format=${format}`;
    }

    // Already a render URL
    if (url.includes('/storage/v1/render/image/public/')) {
      const u = new URL(url, window.location.origin);
      u.searchParams.set('width', String(width));
      u.searchParams.set('quality', String(quality));
      u.searchParams.set('format', format);
      return u.toString();
    }

    // Other CDNs that accept width/quality/format
    try {
      const u = new URL(url, window.location.origin);
      u.searchParams.set('width', String(width));
      u.searchParams.set('quality', String(quality));
      u.searchParams.set('format', format);
      return u.toString();
    } catch {
      return url;
    }
  } catch {
    return url;
  }
};

// Preload optimized images
export const preloadImage = (url: string, opts?: { width?: number; quality?: number; format?: 'webp' | 'jpg' | 'png' }) => {
  const optimizedUrl = getThumbUrl(url, opts);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = optimizedUrl;
  });
};

// Batch preload images
export const preloadImages = async (urls: string[], opts?: { width?: number; quality?: number; format?: 'webp' | 'jpg' | 'png' }) => {
  const promises = urls.map(url => preloadImage(url, opts).catch(() => null)); // Ignore errors
  return Promise.allSettled(promises);
};
