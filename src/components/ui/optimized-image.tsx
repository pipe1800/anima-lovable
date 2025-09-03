import React, { useState, useRef, useEffect } from 'react';
import { getThumbUrl } from '@/utils/image';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpg' | 'png';
  lazy?: boolean;
  fallback?: string;
  objectPosition?: 'top' | 'center' | 'bottom';
  onLoad?: () => void;
  onError?: () => void;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  width = 400,
  height,
  quality = 75,
  format = 'webp',
  lazy = true,
  fallback = '/placeholder.svg',
  objectPosition = 'top',
  onLoad,
  onError,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isVisible, setIsVisible] = useState(!lazy);
  const imgRef = useRef<HTMLImageElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazy || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '50px',
        threshold: 0.1,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [lazy, isVisible]);

  const optimizedSrc = getThumbUrl(src, {
    width,
    quality,
    format,
  });

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setIsError(true);
    onError?.();
  };

  const imageStyle = {
    height: height ? `${height}px` : undefined,
    opacity: isLoaded ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out',
  };

  const objectPositionClass = {
    top: 'object-top',
    center: 'object-center', 
    bottom: 'object-bottom'
  }[objectPosition];

  return (
    <div className={`relative overflow-hidden ${className}`} ref={imgRef}>
      {/* Loading placeholder */}
      {!isLoaded && !isError && (
        <div 
          className="absolute inset-0 bg-gray-800 animate-pulse flex items-center justify-center"
          style={{ height: height ? `${height}px` : '100%' }}
        >
          <div className="w-8 h-8 border-2 border-gray-600 border-t-[#FF7A00] rounded-full animate-spin" />
        </div>
      )}

      {/* Main image */}
      {isVisible && (
        <img
          src={isError ? fallback : optimizedSrc}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          style={imageStyle}
          className={`w-full h-full object-cover ${objectPositionClass} ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          {...props}
        />
      )}
    </div>
  );
};
