
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Eye, EyeOff } from 'lucide-react';

export const AccountSettings = () => {
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  
  // Mock user data - in a real app, this would come from your auth context
  const userEmail = 'user@example.com';
  const maskedEmail = userEmail.replace(/(.{1})(.*)(@.*)/, '$1*****$3');
  const username = 'john_doe'; // This would come from user context

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleChangePassword = () => {
    // Here you would implement the actual password change logic
    console.log('Changing password...', passwordData);
    // Reset form after successful change
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setShowPasswordFields(false);
  };

  const handleChangeEmail = () => {
    // Here you would implement the email change logic
    console.log('Changing email...');
  };

  const handleDeleteAccount = () => {
    if (deleteConfirmation === username) {
      // Here you would implement the account deletion logic
      console.log('Deleting account...');
    }
  };

  const isPasswordFormValid = passwordData.currentPassword && 
                             passwordData.newPassword && 
                             passwordData.confirmPassword &&
                             passwordData.newPassword === passwordData.confirmPassword;

  const isDeleteConfirmationValid = deleteConfirmation === username;

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Account & Security</h2>
        <p className="text-gray-300">Manage your sensitive account information and security settings</p>
      </div>

      <div className="space-y-8">
        {/* Email Address Section */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Email Address</h3>
          <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-700">
            <div>
              <Label className="text-gray-300 text-sm">Current Email</Label>
              <p className="text-white font-medium">{maskedEmail}</p>
            </div>
            <Button 
              variant="outline" 
              onClick={handleChangeEmail}
              className="border-gray-600 text-white hover:bg-gray-800"
            >
              Change Email
            </Button>
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
                  disabled={!isPasswordFormValid}
                  className={`
                    ${isPasswordFormValid 
                      ? 'bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white' 
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed hover:bg-gray-700'
                    }
                  `}
                >
                  Update Password
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
                  To confirm, please type your username <span className="font-semibold text-white">"{username}"</span> below:
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="my-4">
                <Input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder={`Type "${username}" to confirm`}
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel 
                  onClick={() => setDeleteConfirmation('')}
                  className="border-gray-600 text-white hover:bg-gray-800"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={!isDeleteConfirmationValid}
                  className={`
                    ${isDeleteConfirmationValid 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed hover:bg-gray-700'
                    }
                  `}
                >
                  Delete Account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};
