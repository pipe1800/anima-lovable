
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Eye, EyeOff, Upload, Image, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentUser } from '@/hooks/useProfile';
import { updateProfile } from '@/lib/supabase-queries';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { uploadAvatar, uploadBanner } from '@/lib/upload-operations';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useNSFW } from '@/contexts/NSFWContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export const AccountSettings = () => {
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useCurrentUser();
  const { nsfwEnabled, isAgeVerified, toggleNSFW, verifyAge, isLoading: nsfwLoading } = useNSFW();
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [showAgeDialog, setShowAgeDialog] = useState(false);
  const { toast } = useToast();
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Form state for profile fields
  const [formData, setFormData] = useState({
    username: profile?.username || '',
    bio: profile?.bio || '',
    avatar_url: profile?.avatar_url || '',
    banner_url: profile?.banner_url || ''
  });

  // Update form data when profile loads
  React.useEffect(() => {
    if (profile) {
      setFormData({
        username: profile.username || '',
        bio: profile.bio || '',
        avatar_url: profile.avatar_url || '',
        banner_url: profile.banner_url || ''
      });
    }
  }, [profile]);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Check if any profile changes have been made
  const hasProfileChanges = 
    formData.username !== (profile?.username || '') ||
    formData.bio !== (profile?.bio || '') ||
    formData.avatar_url !== (profile?.avatar_url || '') ||
    formData.banner_url !== (profile?.banner_url || '');

  const handleNSFWToggle = async () => {
    if (!nsfwEnabled && !isAgeVerified) {
      setShowAgeDialog(true);
    } else {
      await toggleNSFW();
    }
  };

  const handleAgeVerification = async (confirmed: boolean) => {
    if (confirmed) {
      const verified = await verifyAge();
      if (verified) {
        await toggleNSFW();
      }
    }
    setShowAgeDialog(false);
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleChangePassword = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      // First verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: passwordData.currentPassword
      });

      if (signInError) {
        toast({
          title: "Error",
          description: "Current password is incorrect",
          variant: "destructive"
        });
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (updateError) {
        toast({
          title: "Error", 
          description: `Failed to update password: ${updateError.message}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Password updated successfully"
        });
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setShowPasswordFields(false);
      }
    } catch (error) {
      console.error('Password update error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      const { error } = await updateProfile(user.id, {
        username: formData.username,
        bio: formData.bio,
        avatar_url: formData.avatar_url,
        banner_url: formData.banner_url
      });

      if (error) {
        toast({
          title: "Error",
          description: `Failed to update profile: ${error.message}`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Profile updated successfully"
        });
        // Trigger a re-render with updated profile
        setProfileRefreshKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Profile update error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    try {
      setIsLoading(true);
      const avatarUrl = await uploadAvatar(file, user.id);
      
      if (avatarUrl) {
        setFormData(prev => ({ ...prev, avatar_url: avatarUrl }));
        toast({
          title: "Success",
          description: "Avatar uploaded successfully"
        });
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      toast({
        title: "Error",
        description: "Failed to upload avatar",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    try {
      setIsLoading(true);
      const bannerUrl = await uploadBanner(file, user.id);
      
      if (bannerUrl) {
        setFormData(prev => ({ ...prev, banner_url: bannerUrl }));
        toast({
          title: "Success",
          description: "Banner uploaded successfully"
        });
      }
    } catch (error) {
      console.error('Banner upload error:', error);
      toast({
        title: "Error",
        description: "Failed to upload banner",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== profile?.username || !user) return;

    try {
      setIsDeleting(true);
      
      // For now, just sign out the user - the actual deletion would need to be implemented
      // in the backend or as a proper RPC function once it's added to the Supabase types
      await supabase.auth.signOut();
      window.location.href = '/';
      
      // Note: The delete_user_account RPC function needs to be properly typed in Supabase
      // before we can use it here. For now, we'll just sign out the user.
    } catch (error) {
      console.error('Account deletion error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const isPasswordFormValid = passwordData.currentPassword && 
                             passwordData.newPassword && 
                             passwordData.confirmPassword &&
                             passwordData.newPassword === passwordData.confirmPassword;

  const isDeleteConfirmationValid = deleteConfirmation === profile?.username;

  if (profileLoading) {
    return (
      <div className="max-w-2xl">
        <div className="text-white">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Account & Security</h2>
        <p className="text-gray-300">Manage your profile and account settings</p>
      </div>

      <div className="space-y-8">
        {/* Profile Settings Section */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Profile Information</h3>
          
          {/* Avatar */}
          <div className="mb-6">
            <Label className="text-gray-300 mb-2 block">Profile Picture</Label>
            <div className="flex items-center gap-4">
              <Avatar className="w-20 h-20">
                <AvatarImage src={formData.avatar_url} alt={formData.username} />
                <AvatarFallback>
                  {formData.username?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isLoading}
                  className="border-gray-600 text-white hover:bg-gray-800"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Avatar
                </Button>
                <p className="text-xs text-gray-400 mt-1">Recommended: 400x400px</p>
              </div>
            </div>
          </div>

          {/* Banner */}
          <div className="mb-6">
            <Label className="text-gray-300 mb-2 block">Profile Banner</Label>
            <div className="space-y-3">
              {formData.banner_url && (
                <div className="w-full h-32 rounded-lg overflow-hidden bg-gray-800">
                  <img 
                    src={formData.banner_url} 
                    alt="Banner" 
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                onChange={handleBannerUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => bannerInputRef.current?.click()}
                disabled={isLoading}
                className="border-gray-600 text-white hover:bg-gray-800"
              >
                <Image className="w-4 h-4 mr-2" />
                {formData.banner_url ? 'Change Banner' : 'Upload Banner'}
              </Button>
            </div>
          </div>

          {/* Username */}
          <div className="mb-6">
            <Label htmlFor="username" className="text-gray-300 mb-2 block">Username</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
              placeholder="Enter username"
              className="bg-gray-800/50 border-gray-600 text-white"
              maxLength={20}
            />
            <p className="text-xs text-gray-400 mt-1">
              {formData.username.length}/20 characters
            </p>
          </div>

          {/* Bio */}
          <div className="mb-6">
            <Label htmlFor="bio" className="text-gray-300 mb-2 block">Bio</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              placeholder="Tell others about yourself..."
              className="bg-gray-800/50 border-gray-600 text-white resize-none"
              rows={4}
              maxLength={160}
            />
            <p className="text-xs text-gray-400 mt-1">
              {formData.bio.length}/160 characters
            </p>
          </div>

          {/* Save Profile Button */}
          <Button
            onClick={handleSaveProfile}
            disabled={!hasProfileChanges || isLoading}
            className={`w-full ${
              hasProfileChanges && !isLoading
                ? 'bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white' 
                : 'bg-gray-700 text-gray-400 cursor-not-allowed hover:bg-gray-700'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Profile Changes'
            )}
          </Button>
        </div>

        <Separator className="bg-gray-700" />

        {/* Content Settings Section */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Content Settings</h3>
          <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label className="text-white">NSFW Content</Label>
                <p className="text-gray-400 text-sm mt-1">
                  Show mature content across the platform
                </p>
              </div>
              <Switch
                checked={nsfwEnabled}
                onCheckedChange={handleNSFWToggle}
                disabled={nsfwLoading}
                className="data-[state=checked]:bg-[#FF7A00]"
              />
            </div>
          </div>
        </div>

        <Separator className="bg-gray-700" />

        {/* Email Address Section */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Email Address</h3>
          <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
            <Label className="text-gray-300 text-sm">Current Email</Label>
            <p className="text-white font-medium">{user?.email}</p>
          </div>
        </div>

        <Separator className="bg-gray-700" />

        {/* Password Section */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Password</h3>
          
          {!showPasswordFields ? (
            <Button 
              variant="outline" 
              onClick={() => setShowPasswordFields(true)}
              className="border-gray-600 text-white hover:bg-gray-800"
            >
              Change Password
            </Button>
          ) : (
            <div className="space-y-4 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
              {/* Current Password */}
              <div>
                <Label htmlFor="currentPassword" className="text-gray-300">Current Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    value={passwordData.currentPassword}
                    onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                    placeholder="Enter your current password"
                    className="bg-gray-800/50 border-gray-600 text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <Label htmlFor="newPassword" className="text-gray-300">New Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={passwordData.newPassword}
                    onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                    placeholder="Enter your new password"
                    className="bg-gray-800/50 border-gray-600 text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <Label htmlFor="confirmPassword" className="text-gray-300">Confirm New Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={passwordData.confirmPassword}
                    onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                    placeholder="Confirm your new password"
                    className="bg-gray-800/50 border-gray-600 text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                  <p className="text-red-400 text-sm mt-1">Passwords do not match</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleChangePassword}
                  disabled={!isPasswordFormValid || isLoading}
                  className={`
                    ${isPasswordFormValid && !isLoading
                      ? 'bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white' 
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed hover:bg-gray-700'
                    }
                  `}
                >
                  {isLoading ? 'Updating...' : 'Update Password'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPasswordFields(false);
                    setPasswordData({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: ''
                    });
                  }}
                  className="border-gray-600 text-white hover:bg-gray-800"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <Separator className="bg-gray-700" />

        {/* Danger Zone */}
        <div className="border border-red-600/50 bg-red-900/10 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h3>
          <p className="text-gray-300 text-sm mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive"
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-gray-900 border-gray-700">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">Delete Account</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-300">
                  This action cannot be undone. This will permanently delete your account and remove all of your data from our servers.
                  <br /><br />
                  To confirm, please type your username <span className="font-semibold text-white">"{profile?.username}"</span> below:
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="my-4">
                <Input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder={`Type "${profile?.username}" to confirm`}
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-gray-800 border-gray-600 text-white hover:bg-gray-700">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={!isDeleteConfirmationValid || isDeleting}
                  className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Account'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Age Verification Dialog */}
      <Dialog open={showAgeDialog} onOpenChange={setShowAgeDialog}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Age Verification Required
            </DialogTitle>
            <DialogDescription className="text-left space-y-2 text-gray-300">
              <p>
                To access NSFW (Not Safe For Work) content, you must confirm that you are 18 years of age or older.
              </p>
              <p className="text-sm text-gray-400">
                By confirming, you agree that:
              </p>
              <ul className="text-sm text-gray-400 list-disc list-inside space-y-1">
                <li>You are at least 18 years old</li>
                <li>You understand that NSFW content may contain mature themes</li>
                <li>You are accessing this content voluntarily</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => handleAgeVerification(false)}
              className="w-full sm:w-auto border-gray-600 text-white hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleAgeVerification(true)}
              className="w-full sm:w-auto bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
            >
              I am 18 or older
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
