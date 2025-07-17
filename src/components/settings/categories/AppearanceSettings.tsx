
import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const AppearanceSettings = () => {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Appearance Settings</h2>
        <p className="text-gray-300">Customize how the interface looks and behaves</p>
      </div>

      <div className="space-y-6">
        {/* Theme Selection */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Theme</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300 mb-2 block">Color Theme</Label>
              <Select defaultValue="dark">
                <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="dark">Dark Mode</SelectItem>
                  <SelectItem value="light">Light Mode</SelectItem>
                  <SelectItem value="auto">Auto (System)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Display Options */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Display Options</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Compact Mode</Label>
                <p className="text-sm text-gray-400">Use less spacing for a denser layout</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Show Animations</Label>
                <p className="text-sm text-gray-400">Enable smooth transitions and animations</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">High Contrast</Label>
                <p className="text-sm text-gray-400">Increase contrast for better accessibility</p>
              </div>
              <Switch />
            </div>
          </div>
        </div>

        {/* Font Settings */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Typography</h3>
          <div>
            <Label className="text-gray-300 mb-2 block">Font Size</Label>
            <Select defaultValue="medium">
              <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
};
