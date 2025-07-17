
import React, { useState, useRef } from 'react';
import { Camera, Edit3, Plus, Users, MessageSquare, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser, useUpdateProfile } from '@/hooks/useProfile';
import { useNavigate } from 'react-router-dom';
import { uploadAvatar } from '@/lib/avatar-upload';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const ProfileHeader = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const { user, profile, loading } = useCurrentUser();
  const navigate = useNavigate();
  const updateProfileMutation = useUpdateProfile();
  const { toast } = useToast();
  
  // For demo purposes, simulating whether this is the current user's profile
  const [isOwnProfile] = useState(true); // This would come from auth context in real app

  if (loading) {
    return (
      <div className="relative">
        <div className="h-64 bg-gradient-to-r from-[#FF7A00]/20 via-[#FF7A00]/10 to-transparent relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,122,0,0.1)_25%,rgba(255,122,0,0.1)_50%,transparent_50%,transparent_75%,rgba(255,122,0,0.1)_75%)] bg-[length:20px_20px]"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent"></div>
        </div>
        <div className="relative px-8 pb-8">
          <div className="text-white">Loading profile...</div>
        </div>
      </div>
    );
  }

  const displayUsername = profile?.username || user?.email?.split('@')[0] || 'User';
  const displayBio = profile?.bio || 'No bio available';

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    try {
      setIsUploadingAvatar(true);
      
      // Upload avatar using the existing upload function
      const avatarUrl = await uploadAvatar(file, user.id);
      
      if (avatarUrl) {
        // Update profile with new avatar URL
        await updateProfileMutation.mutateAsync({
          avatar_url: avatarUrl
        });
        
        toast({
          title: "Avatar Updated",
          description: "Your profile picture has been updated successfully.",
        });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB max for banner)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload an image smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploadingBanner(true);
      
      // Upload banner to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/banner-${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('character-avatars') // Using same bucket for now
        .upload(fileName, file);

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('character-avatars')
        .getPublicUrl(data.path);

      // For now, we'll show success but not store banner URL since it's not in the profile schema
      toast({
        title: "Banner Uploaded",
        description: "Your banner has been uploaded successfully. Full banner support coming soon!",
      });
      
    } catch (error) {
      console.error('Error uploading banner:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload banner. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingBanner(false);
    }
  };

  return (
    <div className="relative">
      {/* Header Banner */}
      <div className="h-64 bg-gradient-to-r from-[#FF7A00]/20 via-[#FF7A00]/10 to-transparent relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,122,0,0.1)_25%,rgba(255,122,0,0.1)_50%,transparent_50%,transparent_75%,rgba(255,122,0,0.1)_75%)] bg-[length:20px_20px]"></div>
        
        {/* Edit Banner Button */}
        {isOwnProfile && (
          <>
            <input
              ref={bannerFileRef}
              type="file"
              accept="image/*"
              onChange={handleBannerUpload}
              className="hidden"
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 text-white/80 hover:text-white hover:bg-black/20"
              onClick={() => bannerFileRef.current?.click()}
              disabled={isUploadingBanner}
            >
              {isUploadingBanner ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              {isUploadingBanner ? 'Uploading...' : 'Edit Banner'}
            </Button>
          </>
        )}

        {/* Overlay gradient for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent"></div>
      </div>

      {/* Profile Info Section */}
      <div className="relative px-8 pb-8">
        <div className="flex items-start space-x-6">
          {/* Avatar - positioned to overlap banner */}
          <div className="relative -mt-16 flex-shrink-0">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#FF7A00] to-[#FF7A00]/70 p-1">
              {profile?.avatar_url ? (
                <img 
                  src={profile.avatar_url} 
                  alt="Profile avatar"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center text-4xl font-bold text-[#FF7A00]">
                  {displayUsername.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {isOwnProfile && (
              <>
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full p-0 bg-[#FF7A00] hover:bg-[#FF7A00]/80"
                  onClick={() => avatarFileRef.current?.click()}
                  disabled={isUploadingAvatar}
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="h-4 w-4 text-white animate-spin" />
                  ) : (
                    <Edit3 className="h-4 w-4 text-white" />
                  )}
                </Button>
              </>
            )}
          </div>

          {/* User Information */}
          <div className="flex-1 pt-4">
            {/* Username */}
            <h1 className="text-3xl font-bold text-white mb-4">@{displayUsername}</h1>
            
            {/* Stats Row */}
            <div className="flex items-center space-x-8 mb-4">
              <div className="flex items-center space-x-2">
                <Plus className="h-4 w-4 text-[#FF7A00]" />
                <span className="text-white font-medium">0</span>
                <span className="text-muted-foreground text-sm">Creations</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-[#FF7A00]" />
                <span className="text-white font-medium">0</span>
                <span className="text-muted-foreground text-sm">Followers</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4 text-[#FF7A00]" />
                <span className="text-white font-medium">0</span>
                <span className="text-muted-foreground text-sm">Total Chats</span>
              </div>
            </div>
            
            {/* Bio */}
            <p className="text-muted-foreground text-base leading-relaxed max-w-2xl">
              {displayBio}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex-shrink-0">
            {isOwnProfile ? (
              <Button 
                variant="secondary" 
                className="bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
                onClick={() => navigate('/profile/settings')}
              >
                Settings
              </Button>
            ) : (
              <Button className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium px-8">
                Follow
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
