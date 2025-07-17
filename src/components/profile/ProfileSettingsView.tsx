import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettings } from '@/components/settings/categories/ProfileSettings';
import { AccountSettings } from '@/components/settings/categories/AccountSettings';
import { NotificationSettings } from '@/components/settings/categories/NotificationSettings';
import { BillingSettings } from '@/components/settings/categories/BillingSettings';

export const ProfileSettingsView = () => {
  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="px-6 py-8 border-b border-gray-700/30">
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-300">Manage your account preferences and configuration</p>
        </div>

        {/* Horizontal Tabs Layout */}
        <div className="px-6">
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-gray-800/50 p-1 rounded-lg mb-8 mt-6">
              <TabsTrigger 
                value="profile" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-300"
              >
                Profile
              </TabsTrigger>
              <TabsTrigger 
                value="account" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-300"
              >
                Account & Security
              </TabsTrigger>
              <TabsTrigger 
                value="billing" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-300"
              >
                Subscription & Billing
              </TabsTrigger>
              <TabsTrigger 
                value="notifications" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-300"
              >
                Notifications
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="profile" className="space-y-6">
              <ProfileSettings />
            </TabsContent>
            
            <TabsContent value="account" className="space-y-6">
              <AccountSettings />
            </TabsContent>
            
            <TabsContent value="billing" className="space-y-6">
              <BillingSettings />
            </TabsContent>
            
            <TabsContent value="notifications" className="space-y-6">
              <NotificationSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};