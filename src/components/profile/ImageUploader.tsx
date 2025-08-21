import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Uploads, Auth } from '@/data';

interface ImageUploaderProps {
  currentImage?: string;
  onImageChange: (url: string) => void;
  type: 'avatar' | 'banner';
  isEditing: boolean;
  className?: string;
  children: React.ReactNode;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  currentImage,
  onImageChange,
  type,
  isEditing,
  className,
  children
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);

    try {
      const { data: auth } = await Auth.getCurrentUser();
      const user = auth.user;
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${type}_${Date.now()}.${fileExt}`;

      const { publicUrl, error } = await Uploads.uploadToBucket({ bucket: 'profile-images', path: fileName, file, upsert: false });
      if (error) throw error;

      onImageChange(publicUrl || '');
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClick = () => {
    if (isEditing && !isUploading) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className={cn("relative group", className)}>
      {children}
      
      {isEditing && (
        <div
          onClick={handleClick}
          className={cn(
            "absolute inset-0 bg-black/50 flex items-center justify-center",
            "opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer",
            "rounded-full", // For avatar
            type === 'banner' && "rounded-lg" // For banner
          )}
        >
          {isUploading ? (
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          ) : (
            <Camera className="w-6 h-6 text-white" />
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />
    </div>
  );
};
