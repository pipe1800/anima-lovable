
import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export const NotificationSettings = () => {
  const [notifications, setNotifications] = useState({
    emailFeaturesAnnouncements: true,
    emailDailyQuests: false,
    inAppCharacterUpdates: true,
    inAppFollowers: false
  });

  const [hasChanges, setHasChanges] = useState(false);

  const handleToggleChange = (key: string, value: boolean) => {
    setNotifications(prev => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
  };

  const handleSavePreferences = () => {
    // Here you would implement the actual save logic
    console.log('Saving notification preferences...', notifications);
    setHasChanges(false);
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Notification Settings</h2>
        <p className="text-gray-300">Choose what notifications you want to receive</p>
      </div>

      <div className="space-y-6">
        {/* Email Notifications: New Features & Announcements */}
        <div className="flex items-center justify-between py-4 px-6 bg-gray-800/30 rounded-lg border border-gray-700">
          <div className="flex-1">
            <Label className="text-white font-medium">Email Notifications: New Features & Announcements</Label>
          </div>
          <Switch 
            checked={notifications.emailFeaturesAnnouncements}
            onCheckedChange={(checked) => handleToggleChange('emailFeaturesAnnouncements', checked)}
          />
        </div>

        {/* Email Notifications: Daily Quest Reminders */}
        <div className="flex items-center justify-between py-4 px-6 bg-gray-800/30 rounded-lg border border-gray-700">
          <div className="flex-1">
            <Label className="text-white font-medium">Email Notifications: Daily Quest Reminders</Label>
          </div>
          <Switch 
            checked={notifications.emailDailyQuests}
            onCheckedChange={(checked) => handleToggleChange('emailDailyQuests', checked)}
          />
        </div>

        {/* In-App Notifications: A character I follow is updated */}
        <div className="flex items-center justify-between py-4 px-6 bg-gray-800/30 rounded-lg border border-gray-700">
          <div className="flex-1">
            <Label className="text-white font-medium">In-App Notifications: A character I follow is updated</Label>
          </div>
          <Switch 
            checked={notifications.inAppCharacterUpdates}
            onCheckedChange={(checked) => handleToggleChange('inAppCharacterUpdates', checked)}
          />
        </div>

        {/* In-App Notifications: Someone follows me */}
        <div className="flex items-center justify-between py-4 px-6 bg-gray-800/30 rounded-lg border border-gray-700">
          <div className="flex-1">
            <Label className="text-white font-medium">In-App Notifications: Someone follows me</Label>
          </div>
          <Switch 
            checked={notifications.inAppFollowers}
            onCheckedChange={(checked) => handleToggleChange('inAppFollowers', checked)}
          />
        </div>
      </div>

      {/* Save Preferences Button */}
      <div className="mt-8">
        <Button
          onClick={handleSavePreferences}
          disabled={!hasChanges}
          className={`
            ${hasChanges 
              ? 'bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white' 
              : 'bg-gray-700 text-gray-400 cursor-not-allowed hover:bg-gray-700'
            }
          `}
        >
          Save Preferences
        </Button>
      </div>
    </div>
  );
};
