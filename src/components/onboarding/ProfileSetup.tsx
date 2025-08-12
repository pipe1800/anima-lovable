import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Upload, User, Loader2, Check, X } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useProfile';
import { updateProfile } from '@/lib/supabase-queries';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProfileSetupProps {
  onComplete: () => void;
  onSkip: () => void;
}

const ProfileSetup = ({ onComplete, onSkip }: ProfileSetupProps) => {
  const { user, profile } = useCurrentUser();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState('');
  
  // Detect if the account was created via social auth (Google/Discord)
  const provider = (user as any)?.app_metadata?.provider || (user as any)?.app_metadata?.providers?.[0];
  const isSocialSignup = provider === 'google' || provider === 'discord';

  // Detect auto-generated username from DB trigger: 'user_' + first 8 chars of id
  const autoUsername = user?.id ? `user_${user.id.slice(0, 8)}` : undefined;
  const isAutoUsername = profile?.username === autoUsername || (!!profile?.username && profile.username.startsWith('user_') && profile.username.length === 13);
  
  // Require a username if it's missing, equals email local-part, or is auto-generated placeholder
  const needsUsername = !profile?.username || profile.username === user?.email?.split('@')[0] || isAutoUsername;

  useEffect(() => {
    // Initialize username: if auto placeholder, suggest email local-part; else use existing; else suggest from email
    if (profile?.username) {
      if (isAutoUsername) {
        if (user?.email) setUsername(user.email.split('@')[0].toLowerCase());
      } else {
        setUsername(profile.username);
      }
    } else if (user?.email) {
      setUsername(user.email.split('@')[0].toLowerCase());
    }
  }, [profile, user?.email, isAutoUsername]);

  // Debounced username check
  useEffect(() => {
    if (!needsUsername) return;
    
    const checkUsername = async () => {
      if (!username || username.length < 3) {
        setUsernameAvailable(null);
        setUsernameError(username.length > 0 ? 'Username must be at least 3 characters' : '');
        return;
      }

      // Username validation
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        setUsernameError('Username can only contain letters, numbers, - and _');
        setUsernameAvailable(false);
        return;
      }

      setCheckingUsername(true);
      setUsernameError('');

      try {
        // Check if username is taken
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username)
          .neq('id', user?.id) // Exclude current user
          .single();

        if (error && (error as any).code === 'PGRST116') {
          // No rows returned means username is available
          setUsernameAvailable(true);
        } else if (data) {
          setUsernameAvailable(false);
          setUsernameError('Username is already taken');
        }
      } catch (error) {
        console.error('Error checking username:', error);
      } finally {
        setCheckingUsername(false);
      }
    };

    const timeoutId = setTimeout(checkUsername, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [username, user?.id, needsUsername]);

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

    // Validate username if needed
    if (needsUsername && (!username || !usernameAvailable)) {
      toast.error('Please choose a valid username');
      return;
    }

    setIsLoading(true);
    try {
      // For now, we'll just save the bio. In a real app, you'd upload the avatar to storage first
      const avatarUrl = avatarPreview || profile?.avatar_url || '';
      
      const { error } = await updateProfile(user.id, {
        username: username.trim() || undefined,
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
          {needsUsername ? 'Choose your username and personalize your profile' : 'Personalize your profile (optional)'}
        </p>

        <div className="space-y-6">
          {/* Username field - only show if needed  */}
          {needsUsername && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username *
              </label>
              <div className="relative">
                <Input
                  placeholder="Choose a unique username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 pr-10"
                  required
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  {checkingUsername && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                  {!checkingUsername && usernameAvailable === true && <Check className="w-4 h-4 text-green-500" />}
                  {!checkingUsername && usernameAvailable === false && <X className="w-4 h-4 text-red-500" />}
                </div>
              </div>
              {usernameError && (
                <p className="text-xs text-red-400 mt-1">{usernameError}</p>
              )}
            </div>
          )}

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
            disabled={isLoading || (needsUsername && (!username || !usernameAvailable))}
            className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-[#FF7A00]/25 transition-all duration-300"
          >
            {isLoading ? 'Saving...' : 'Save & Continue'}
          </Button>
          
          {!needsUsername && (
            <button
              onClick={onSkip}
              disabled={isLoading}
              className="w-full text-gray-400 hover:text-[#FF7A00] transition-colors duration-300 text-sm underline-offset-4 hover:underline disabled:opacity-50"
            >
              I'll do this later
            </button>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ProfileSetup;
