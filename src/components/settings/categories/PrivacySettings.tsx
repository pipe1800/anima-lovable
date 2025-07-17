
import React from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export const PrivacySettings = () => {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Privacy & Security</h2>
        <p className="text-gray-300">Control your privacy and security settings</p>
      </div>

      <div className="space-y-6">
        {/* Privacy Controls */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Privacy Controls</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Profile Visibility</Label>
                <p className="text-sm text-gray-400">Make your profile visible to other users</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Character Sharing</Label>
                <p className="text-sm text-gray-400">Allow others to discover your public characters</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Analytics Tracking</Label>
                <p className="text-sm text-gray-400">Help us improve by sharing usage analytics</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>

        <Separator className="bg-gray-700" />

        {/* Data Management */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Data Management</h3>
          <div className="space-y-3">
            <Button variant="outline" className="border-gray-600 text-white hover:bg-gray-800">
              Download My Data
            </Button>
            <Button variant="outline" className="border-red-600 text-red-400 hover:bg-red-600/10">
              Delete Account
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
