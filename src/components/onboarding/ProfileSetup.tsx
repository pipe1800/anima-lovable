
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Upload, User } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useProfile';
import { updateProfile } from '@/lib/supabase-queries';
import { toast } from 'sonner';

interface ProfileSetupProps {
  onComplete: () => void;
  onSkip: () => void;
}

const ProfileSetup = ({ onComplete, onSkip }: ProfileSetupProps) => {
  const { user, profile } = useCurrentUser();
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatar(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAndContinue = async () => {
    if (!user) {
      toast.error('You must be logged in to update your profile');
      return;
    }

    setIsLoading(true);
    try {
      // For now, we'll just save the bio. In a real app, you'd upload the avatar to storage first
      const avatarUrl = avatarPreview || profile?.avatar_url || '';
      
      const { error } = await updateProfile(user.id, {
        bio: bio.trim() || undefined,
        avatar_url: avatarUrl || undefined
      });

      if (error) {
        toast.error('Failed to save profile: ' + error.message);
      } else {
        console.log('Profile updated successfully');
        onComplete();
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-2 sm:px-4">
      <Card className="bg-[#1a1a2e]/90 backdrop-blur-sm border border-gray-700/50 p-4 sm:p-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 text-center">
          Step 2: Your Account Profile
        </h2>
        <p className="text-gray-400 text-center mb-4 text-sm sm:text-base">
          Personalize your profile (optional)
        </p>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 mb-6">
          <p className="text-orange-200 text-sm text-center">
            <strong>Note:</strong> This profile information is for your account only and won't be shared with AI characters. 
            In the next step, you'll create personas that the AI will interact with during conversations.
          </p>
        </div>

        <div className="space-y-6">
          {/* Avatar Upload */}
          <div className="text-center">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Upload Avatar
            </label>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
                id="avatar-upload"
              />
              <label
                htmlFor="avatar-upload"
                className="cursor-pointer block w-24 h-24 mx-auto rounded-full border-2 border-dashed border-gray-600 hover:border-[#FF7A00] transition-colors duration-300 flex items-center justify-center overflow-hidden"
              >
                {avatarPreview ? (
                  <img 
                    src={avatarPreview} 
                    alt="Avatar preview" 
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <div className="text-center">
                    <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <span className="text-xs text-gray-400">Upload</span>
                  </div>
                )}
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Recommended: 400x400px
            </p>
          </div>

          {/* Bio */}
          <div>
            <Textarea
              placeholder="Tell us a bit about yourself..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={150}
              className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
              rows={4}
            />
            <p className="text-xs text-gray-500 mt-1 text-right">
              {bio.length}/150 characters
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-8 space-y-3">
          <Button
            onClick={handleSaveAndContinue}
            disabled={isLoading}
            className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-[#FF7A00]/25 transition-all duration-300"
          >
            {isLoading ? 'Saving...' : 'Save & Continue'}
          </Button>
          
          <button
            onClick={onSkip}
            disabled={isLoading}
            className="w-full text-gray-400 hover:text-[#FF7A00] transition-colors duration-300 text-sm underline-offset-4 hover:underline disabled:opacity-50"
          >
            I'll do this later
          </button>
        </div>
      </Card>
    </div>
  );
};

export default ProfileSetup;
