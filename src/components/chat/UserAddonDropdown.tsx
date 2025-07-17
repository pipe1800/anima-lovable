import React, { useState, useEffect } from 'react';
import { Settings, ChevronDown, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { getUserCharacterAddonSettings, saveUserCharacterAddonSettings, calculateAddonCreditCost, validateAddonSettings, type AddonSettings } from '@/lib/user-addon-operations';
import { useAuth } from '@/contexts/AuthContext';
import { useTutorial } from '@/contexts/TutorialContext';
import { toast } from 'sonner';

interface UserAddonDropdownProps {
  characterId: string;
  userId: string;
}

export const UserAddonDropdown = ({ characterId, userId }: UserAddonDropdownProps) => {
  const { user, subscription } = useAuth();
  const { handleStepAction } = useTutorial();
  const [addonSettings, setAddonSettings] = useState<AddonSettings>({
    dynamicWorldInfo: false,
    enhancedMemory: false,
    moodTracking: false,
    clothingInventory: false,
    locationTracking: false,
    timeAndWeather: false,
    relationshipStatus: false,
    characterPosition: false,
    chainOfThought: false,
    fewShotExamples: false,
  });
  const [tempAddonSettings, setTempAddonSettings] = useState<AddonSettings>({
    dynamicWorldInfo: false,
    enhancedMemory: false,
    moodTracking: false,
    clothingInventory: false,
    locationTracking: false,
    timeAndWeather: false,
    relationshipStatus: false,
    characterPosition: false,
    chainOfThought: false,
    fewShotExamples: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Determine user's subscription tier
  const userPlan = subscription?.plan?.name || 'Guest Pass';
  const isGuestPass = userPlan === 'Guest Pass';
  const isTrueFanOrWhale = userPlan === 'True Fan' || userPlan === 'The Whale';

  // Check for subscription issues
  const hasSubscriptionIssue = user && !subscription;

  // Debug subscription state in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 Subscription Debug:', {
      subscription,
      userPlan,
      isGuestPass,
      isTrueFanOrWhale,
      subscriptionExists: !!subscription,
      planExists: !!subscription?.plan,
      planName: subscription?.plan?.name,
      hasSubscriptionIssue
    });
  }

  // Count active stateful tracking addons for Guest Pass limits (using temp settings for validation)
  const activeStatefulAddons = [
    tempAddonSettings.moodTracking,
    tempAddonSettings.clothingInventory,
    tempAddonSettings.locationTracking,
    tempAddonSettings.timeAndWeather,
    tempAddonSettings.relationshipStatus,
    tempAddonSettings.characterPosition,
  ].filter(Boolean).length;

  // The Whale gets unlimited access to everything
  const isWhale = userPlan === 'The Whale';

  const addonCategories = {
    'Core Enhancements': {
      dynamicWorldInfo: { 
        name: 'Dynamic World Info', 
        cost: 10, 
        description: 'Enhanced world knowledge',
        available: true,
        dynamicCost: null
      },
      enhancedMemory: { 
        name: 'Enhanced Memory', 
        cost: 0, 
        description: isTrueFanOrWhale 
          ? 'Better conversation memory' 
          : 'Upgrade to True Fan or Whale to unlock',
        available: isTrueFanOrWhale,
        dynamicCost: isTrueFanOrWhale ? 'Cost calculated per chat' : null
      },
    },
    'Stateful Character Tracking': {
      moodTracking: { 
        name: 'Mood Tracking', 
        cost: 5, 
        description: 'Track character emotions',
        available: !isGuestPass || tempAddonSettings.moodTracking || (!tempAddonSettings.moodTracking && activeStatefulAddons < 2),
        dynamicCost: null
      },
      clothingInventory: { 
        name: 'Clothing Inventory', 
        cost: 5, 
        description: 'Track character outfits',
        available: !isGuestPass || tempAddonSettings.clothingInventory || (!tempAddonSettings.clothingInventory && activeStatefulAddons < 2),
        dynamicCost: null
      },
      locationTracking: { 
        name: 'Location Tracking', 
        cost: 5, 
        description: 'Track current location',
        available: !isGuestPass || tempAddonSettings.locationTracking || (!tempAddonSettings.locationTracking && activeStatefulAddons < 2),
        dynamicCost: null
      },
      timeAndWeather: { 
        name: 'Time & Weather', 
        cost: 5, 
        description: 'Real-time environment',
        available: !isGuestPass || tempAddonSettings.timeAndWeather || (!tempAddonSettings.timeAndWeather && activeStatefulAddons < 2),
        dynamicCost: null
      },
      relationshipStatus: { 
        name: 'Relationship Status', 
        cost: 5, 
        description: 'Track relationships',
        available: !isGuestPass || tempAddonSettings.relationshipStatus || (!tempAddonSettings.relationshipStatus && activeStatefulAddons < 2),
        dynamicCost: null
      },
      characterPosition: { 
        name: 'Character Position', 
        cost: 5, 
        description: 'Track character\'s physical position and body language',
        available: !isGuestPass || tempAddonSettings.characterPosition || (!tempAddonSettings.characterPosition && activeStatefulAddons < 2),
        dynamicCost: null
      },
    },
    'Advanced Prompting Toolkit': {
      chainOfThought: { 
        name: 'Chain of Thought', 
        cost: 30, 
        description: isTrueFanOrWhale 
          ? 'Advanced reasoning' 
          : 'Upgrade to True Fan or Whale to unlock',
        available: isTrueFanOrWhale,
        dynamicCost: null
      },
      fewShotExamples: { 
        name: 'Few Shot Examples', 
        cost: 7, 
        description: 'Better response quality',
        available: true,
        dynamicCost: null
      },
    }
  };

  useEffect(() => {
    loadAddonSettings();
  }, [characterId, userId]);

  const loadAddonSettings = async () => {
    try {
      const settings = await getUserCharacterAddonSettings(userId, characterId);
      setAddonSettings(settings);
      setTempAddonSettings(settings);
    } catch (error) {
      console.error('Error loading addon settings:', error);
      toast.error('Failed to load addon settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAddon = (addonKey: keyof AddonSettings) => {
    // Validate addon settings before attempting to update temp settings
    const newSettings = {
      ...tempAddonSettings,
      [addonKey]: !tempAddonSettings[addonKey]
    };

    const validation = validateAddonSettings(newSettings, userPlan);
    if (!validation.valid) {
      const error = validation.errors[0];
      if (error.includes('Enhanced Memory') || error.includes('Chain of Thought')) {
        toast.error('This addon requires True Fan or Whale subscription. Upgrade to unlock advanced features!');
      } else if (error.includes('stateful tracking')) {
        toast.error('Guest Pass users are limited to 2 stateful tracking addons. Upgrade for unlimited access!');
      } else {
        toast.error(error);
      }
      return;
    }

    setTempAddonSettings(newSettings);
    
    // Handle tutorial progression for Dynamic World Info toggle
    if (addonKey === 'dynamicWorldInfo') {
      handleStepAction('dynamic-world-info-toggled');
    }
  };

  const handleSaveAddons = async () => {
    setSaving(true);
    
    try {
      const result = await saveUserCharacterAddonSettings(userId, characterId, tempAddonSettings);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save addon settings');
      }
      
      setAddonSettings(tempAddonSettings);
      setShowConfirmDialog(false);
      toast.success('Addon settings saved successfully');
      
      // Handle tutorial progression for addon save
      handleStepAction('addons-saved');
    } catch (error) {
      console.error('Error saving addon settings:', error);
      toast.error('Failed to save addon settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelChanges = () => {
    setTempAddonSettings(addonSettings);
    setShowConfirmDialog(false);
  };

  const totalCost = calculateAddonCreditCost(tempAddonSettings);
  const activeAddons = Object.values(addonSettings).filter(Boolean).length;
  const hasUnsavedChanges = JSON.stringify(addonSettings) !== JSON.stringify(tempAddonSettings);

  if (loading) {
    return (
      <Button variant="ghost" className="text-gray-400 px-3" disabled>
        <Settings className="w-4 h-4 mr-2 animate-spin" />
        <span className="text-sm">Loading addons...</span>
      </Button>
    );
  }

  // Show loading state if user exists but subscription is still loading (not failed)
  if (user && subscription === null && !hasSubscriptionIssue) {
    return (
      <Button variant="ghost" className="text-gray-400 px-3" disabled>
        <Settings className="w-4 h-4 mr-2 animate-spin" />
        <span className="text-sm">Loading subscription...</span>
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex items-center space-x-2">
        {activeAddons > 0 && (
          <Badge variant="secondary" className="bg-[#FF7A00] text-white text-xs">
            {activeAddons}
          </Badge>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="text-gray-400 hover:text-white hover:bg-gray-800 px-3"
              disabled={saving}
              data-tutorial="addons-dropdown"
              onClick={() => handleStepAction('addons-dropdown-clicked')}
            >
              <div className="flex items-center space-x-2">
                <Settings className="w-4 h-4" />
                <span className="text-sm">Addons</span>
                <ChevronDown className="w-4 h-4" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[500px] bg-[#1a1a2e] border-gray-700/50 z-50 p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-700/50 pb-3">
                <div className="flex items-center space-x-2">
                  <h3 className="text-white font-medium">Character Addons</h3>
                  <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                    {userPlan}
                  </Badge>
                </div>
                {totalCost > 0 && (
                  <Badge variant="outline" className="border-[#FF7A00] text-[#FF7A00]">
                    +{totalCost}%
                  </Badge>
                )}
              </div>

              <div className="space-y-4 max-h-80 overflow-y-auto">
                {Object.entries(addonCategories).map(([categoryName, addons]) => (
                  <div key={categoryName} className="space-y-3">
                    <h4 className="text-gray-300 font-medium text-sm border-b border-gray-700/30 pb-1">
                      {categoryName}
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(addons).map(([key, details]) => (
                        <div key={key} className={`flex items-center justify-between p-3 rounded-lg border ${
                          details.available 
                            ? 'bg-[#0f0f0f] border-gray-700/30' 
                            : 'bg-gray-900/50 border-gray-700/20 opacity-60'
                        }`}
                        data-tutorial={key === 'dynamicWorldInfo' ? 'dynamic-world-info-addon' : undefined}
                        >
                          <div className="flex-1 min-w-0 pr-3">
                            <div className="flex items-center">
                              <span className={`font-medium text-sm ${
                                details.available ? 'text-white' : 'text-gray-500'
                              }`}>
                                {details.name}
                              </span>
                            </div>
                            <p className={`text-xs mt-1 ${
                              details.available ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              {details.description}
                            </p>
                          </div>
                          
                          <div className="flex items-center space-x-3 shrink-0">
                            {details.dynamicCost ? (
                              <Badge variant="outline" className="text-xs border-blue-400 text-blue-400 h-5">
                                Dynamic
                              </Badge>
                            ) : details.cost > 0 && (
                              <Badge variant="outline" className="text-xs border-[#FF7A00] text-[#FF7A00] h-5 min-w-[45px] justify-center">
                                +{details.cost}%
                              </Badge>
                            )}
                            <Switch
                              checked={tempAddonSettings[key as keyof AddonSettings]}
                              onCheckedChange={() => handleToggleAddon(key as keyof AddonSettings)}
                              disabled={saving || !details.available}
                              className="data-[state=checked]:bg-[#FF7A00]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Guest Pass restriction notice for Stateful Character Tracking */}
                    {categoryName === 'Stateful Character Tracking' && isGuestPass && activeStatefulAddons >= 2 && (
                      <div className="mt-2 p-3 bg-yellow-900/20 border border-yellow-700/40 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                          <p className="text-yellow-400 text-xs font-medium">
                            Guest Pass Limit Reached
                          </p>
                        </div>
                        <p className="text-yellow-300 text-xs mt-1">
                          You've activated the maximum number of tracking addons. Upgrade to True Fan or Whale for unlimited access.
                        </p>
                      </div>
                    )}

                    {/* Upgrade prompts for locked features */}
                    {categoryName === 'Core Enhancements' && isGuestPass && (
                      <div className="mt-2 p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                          <p className="text-blue-400 text-xs font-medium">
                            Enhanced Memory Available with Upgrade
                          </p>
                        </div>
                        <p className="text-blue-300 text-xs mt-1">
                          Unlock Enhanced Memory and other premium features with True Fan or Whale subscription.
                        </p>
                      </div>
                    )}

                    {categoryName === 'Advanced Prompting Toolkit' && isGuestPass && (
                      <div className="mt-2 p-3 bg-purple-900/20 border border-purple-700/40 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                          <p className="text-purple-400 text-xs font-medium">
                            Advanced Features Available
                          </p>
                        </div>
                        <p className="text-purple-300 text-xs mt-1">
                          Chain-of-Thought reasoning requires True Fan or Whale subscription for enhanced AI capabilities.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {totalCost > 0 && (
                <div className="border-t border-gray-700/50 pt-3">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-1.5 h-1.5 bg-[#FF7A00] rounded-full"></div>
                    <p className="text-gray-400 text-xs text-center">
                      Active addons increase message cost by {totalCost}%
                    </p>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-700/50 pt-3 mt-4">
                <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                  <AlertDialogTrigger asChild>
                    <Button 
                      className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
                      disabled={saving || !hasUnsavedChanges}
                      data-tutorial="save-addons-button"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white">Confirm Addon Changes</AlertDialogTitle>
                      <AlertDialogDescription className="text-gray-300">
                        {totalCost > 0 ? (
                          <>Your active addons will increase message credits by <span className="text-[#FF7A00] font-semibold">{totalCost}%</span>. This means each message will cost more credits based on the addons you've enabled.</>
                        ) : (
                          <>You have no active addons selected. Your messages will use the standard credit cost.</>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel 
                        onClick={handleCancelChanges}
                        className="bg-gray-600 hover:bg-gray-700 text-white border-gray-600"
                      >
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleSaveAddons}
                        disabled={saving}
                        className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
                      >
                        {saving ? 'Saving...' : 'Accept Changes'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
};