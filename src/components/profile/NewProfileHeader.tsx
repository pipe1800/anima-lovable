import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Calendar, Clock, Edit3 } from 'lucide-react';
import { format } from 'date-fns';
import { EditableField } from './EditableField';
import { ImageUploader } from './ImageUploader';
import { cn } from '@/lib/utils';

interface ProfileHeaderProps {
  profile: any;
  subscription: any;
  isOwnProfile: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
  onProfileUpdate: (field: string, value: string) => Promise<void>;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  profile,
  subscription,
  isOwnProfile,
  isEditing,
  onEditToggle,
  onProfileUpdate
}) => {
  const handleImageUpdate = async (field: 'avatar_url' | 'banner_url', url: string) => {
    await onProfileUpdate(field, url);
  };

  const validateUsername = (value: string) => {
    if (value.length < 3) return 'Username must be at least 3 characters';
    if (value.length > 20) return 'Username must be less than 20 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Username can only contain letters, numbers, and underscores';
    return null;
  };

  const validateBio = (value: string) => {
    if (value.length > 160) return 'Bio must be less than 160 characters';
    return null;
  };

  return (
    <div className="relative">
      {/* Banner Section */}
      <div className="relative h-48 md:h-64 bg-gradient-to-r from-primary/20 to-primary/40 rounded-t-lg overflow-hidden">
        <ImageUploader
          currentImage={profile?.banner_url}
          onImageChange={(url) => handleImageUpdate('banner_url', url)}
          type="banner"
          isEditing={isEditing}
          className="w-full h-full"
        >
          {profile?.banner_url ? (
            <img 
              src={profile.banner_url} 
              alt="Profile banner"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-primary/20 to-primary/40 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="text-white/80">Click to add banner image</div>
                  </div>
                ) : (
                  <div className="text-white/60">No banner image</div>
                )}
              </div>
            </div>
          )}
        </ImageUploader>
      </div>

      {/* Profile Info Section */}
      <div className="relative px-6 pb-6 -mt-16">
        {/* Avatar */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <ImageUploader
              currentImage={profile?.avatar_url}
              onImageChange={(url) => handleImageUpdate('avatar_url', url)}
              type="avatar"
              isEditing={isEditing}
              className="relative z-10"
            >
              <Avatar className="w-32 h-32 border-4 border-background ring-2 ring-border/50">
                <AvatarImage src={profile?.avatar_url} alt={profile?.username} />
                <AvatarFallback className="text-2xl">
                  {profile?.username?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </ImageUploader>

            <div className="flex-1 space-y-2 md:mb-4">
              {/* Username */}
              <div className="flex items-center gap-3">
                <EditableField
                  value={profile?.username || ''}
                  onSave={(value) => onProfileUpdate('username', value)}
                  placeholder="Enter username"
                  disabled={!isOwnProfile}
                  isEditing={isEditing}
                  onEditStart={() => {}}
                  onEditEnd={() => {}}
                  displayClassName="text-2xl md:text-3xl font-bold"
                  validation={validateUsername}
                />
                {subscription && (
                  <Badge variant="secondary" className="h-fit">
                    <Shield className="w-3 h-3 mr-1" />
                    {subscription.plan.name}
                  </Badge>
                )}
              </div>

              {/* Bio */}
              <EditableField
                value={profile?.bio || ''}
                onSave={(value) => onProfileUpdate('bio', value)}
                placeholder="Add a bio to tell others about yourself"
                multiline
                maxLength={160}
                disabled={!isOwnProfile}
                isEditing={isEditing}
                onEditStart={() => {}}
                onEditEnd={() => {}}
                displayClassName="text-muted-foreground max-w-2xl"
                validation={validateBio}
              />

              {/* Profile Meta Info */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pt-2">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Member since {format(new Date(profile?.created_at || Date.now()), 'MMMM yyyy')}
                </span>
                {profile?.timezone && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {profile.timezone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Edit Button */}
        </div>
      </div>
    </div>
  );
};
