import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Settings,
  ChevronLeft,
  ChevronRight,
  InfoIcon
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';

interface AddonData {
  // Legacy interface for compatibility
  [key: string]: boolean;
}

interface AddonsStepProps {
  data: {
    addons?: AddonData;
  };
  onUpdate: (data: { addons: AddonData }) => void;
  onNext: () => void;
  onPrevious: () => void;
}

const AddonsStep: React.FC<AddonsStepProps> = ({ data, onUpdate, onNext, onPrevious }) => {
  const { user } = useAuth();
  const { data: globalSettings } = useUserGlobalChatSettings();

  // Legacy compatibility - just return empty addon data since we use global settings now
  const handleNext = () => {
    onUpdate({ addons: {} });
    onNext();
  };

  // Count active global addons for display
  const activeGlobalAddons = globalSettings ? Object.values({
    dynamic_world_info: globalSettings.dynamic_world_info,
    enhanced_memory: globalSettings.enhanced_memory,
    mood_tracking: globalSettings.mood_tracking,
    clothing_inventory: globalSettings.clothing_inventory,
    location_tracking: globalSettings.location_tracking,
    time_and_weather: globalSettings.time_and_weather,
    relationship_status: globalSettings.relationship_status,
    character_position: globalSettings.character_position,
    chain_of_thought: globalSettings.chain_of_thought,
    few_shot_examples: globalSettings.few_shot_examples,
  }).filter(Boolean).length : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1a] to-[#2a1a2a] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Character Add-ons</h2>
          <p className="text-gray-400">
            Add-ons are now managed globally across all your characters for a consistent experience.
          </p>
        </div>

        <div className="space-y-6 mb-20">
          {/* Global Settings Info Card */}
          <Card className="bg-[#1a1a1a] border-blue-500/20">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                Global Add-on Settings
                <Badge variant="outline" className="border-blue-400 text-blue-400">
                  New!
                </Badge>
              </CardTitle>
              <CardDescription className="text-gray-400">
                Your add-on preferences now apply to all characters automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-950/20 border border-blue-500/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <InfoIcon className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="text-white font-medium">Currently Active Add-ons</p>
                      <p className="text-sm text-gray-400">
                        These settings apply to all your characters
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-400">{activeGlobalAddons}</p>
                    <p className="text-sm text-gray-400">enabled</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {globalSettings && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Dynamic World Info:</span>
                        <span className={globalSettings.dynamic_world_info ? "text-green-400" : "text-gray-500"}>
                          {globalSettings.dynamic_world_info ? "✓ Enabled" : "✗ Disabled"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Enhanced Memory:</span>
                        <span className={globalSettings.enhanced_memory ? "text-green-400" : "text-gray-500"}>
                          {globalSettings.enhanced_memory ? "✓ Enabled" : "✗ Disabled"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Mood Tracking:</span>
                        <span className={globalSettings.mood_tracking ? "text-green-400" : "text-gray-500"}>
                          {globalSettings.mood_tracking ? "✓ Enabled" : "✗ Disabled"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Clothing & Inventory:</span>
                        <span className={globalSettings.clothing_inventory ? "text-green-400" : "text-gray-500"}>
                          {globalSettings.clothing_inventory ? "✓ Enabled" : "✗ Disabled"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Location Tracking:</span>
                        <span className={globalSettings.location_tracking ? "text-green-400" : "text-gray-500"}>
                          {globalSettings.location_tracking ? "✓ Enabled" : "✗ Disabled"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Chain of Thought:</span>
                        <span className={globalSettings.chain_of_thought ? "text-green-400" : "text-gray-500"}>
                          {globalSettings.chain_of_thought ? "✓ Enabled" : "✗ Disabled"}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-700">
                  <p className="text-sm text-gray-400 mb-3">
                    Want to customize your add-on settings? You can manage them globally in your settings after character creation.
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full border-blue-500/50 text-blue-400 hover:bg-blue-950/20"
                    onClick={() => window.open('/settings', '_blank')}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Manage Global Add-on Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Benefits Card */}
          <Card className="bg-[#1a1a1a] border-green-500/20">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                ✨ Benefits of Global Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-white font-medium">Consistent Experience</p>
                    <p className="text-gray-400">Same add-ons work across all characters</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-white font-medium">Simplified Management</p>
                    <p className="text-gray-400">Configure once, use everywhere</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-white font-medium">Better Performance</p>
                    <p className="text-gray-400">Optimized for faster loading</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-white font-medium">Account-Wide Settings</p>
                    <p className="text-gray-400">Follows your subscription plan</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/90 backdrop-blur-sm border-t border-gray-800 p-4">
          <div className="max-w-4xl mx-auto flex justify-between">
            <Button
              variant="outline"
              onClick={onPrevious}
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
            <Button
              onClick={handleNext}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddonsStep;
