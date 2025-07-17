import React, { useState, useEffect } from 'react';
import { Settings, ChevronDown, Plus, Upload, Image, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorldInfoDropdown } from './WorldInfoDropdown';
import { getUserCharacterAddonSettings, saveUserCharacterAddonSettings, calculateAddonCreditCost, validateAddonSettings, type AddonSettings } from '@/lib/user-addon-operations';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Persona } from '@/lib/persona-operations';
import { useQueryClient } from '@tanstack/react-query';

interface ChatConfigurationTabProps {
  characterId: string;
  userId: string;
  personas: Persona[];
  selectedPersona: Persona | null;
  setSelectedPersona: (persona: Persona | null) => void;
  setShowPersonaModal: (show: boolean) => void;
  worldInfoDropdownVisible: boolean;
  onWorldInfoSelect: (worldInfo: any) => void;
  currentChatId?: string;
  selectedWorldInfoId?: string | null;
}

export const ChatConfigurationTab = ({
  characterId,
  userId,
  personas,
  selectedPersona,
  setSelectedPersona,
  setShowPersonaModal,
  worldInfoDropdownVisible,
  onWorldInfoSelect,
  currentChatId,
  selectedWorldInfoId
}: ChatConfigurationTabProps) => {
  const { subscription } = useAuth();
  const queryClient = useQueryClient();
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
  const [saving, setSaving] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Determine user's subscription tier
  const userPlan = subscription?.plan?.name || 'Guest Pass';
  const isGuestPass = userPlan === 'Guest Pass';
  const isTrueFanOrWhale = userPlan === 'True Fan' || userPlan === 'The Whale';

  // Count active stateful tracking addons for Guest Pass limits
  const activeStatefulAddons = [
    tempAddonSettings.moodTracking,
    tempAddonSettings.clothingInventory,
    tempAddonSettings.locationTracking,
    tempAddonSettings.timeAndWeather,
    tempAddonSettings.relationshipStatus,
    tempAddonSettings.characterPosition,
  ].filter(Boolean).length;

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
        available: isTrueFanOrWhale || tempAddonSettings.moodTracking || activeStatefulAddons < 2,
        dynamicCost: null
      },
      clothingInventory: { 
        name: 'Clothing Inventory', 
        cost: 5, 
        description: 'Track character outfits',
        available: isTrueFanOrWhale || tempAddonSettings.clothingInventory || activeStatefulAddons < 2,
        dynamicCost: null
      },
      locationTracking: { 
        name: 'Location Tracking', 
        cost: 5, 
        description: 'Track current location',
        available: isTrueFanOrWhale || tempAddonSettings.locationTracking || activeStatefulAddons < 2,
        dynamicCost: null
      },
      timeAndWeather: { 
        name: 'Time & Weather', 
        cost: 5, 
        description: 'Real-time environment',
        available: isTrueFanOrWhale || tempAddonSettings.timeAndWeather || activeStatefulAddons < 2,
        dynamicCost: null
      },
      relationshipStatus: { 
        name: 'Relationship Status', 
        cost: 5, 
        description: 'Track relationships',
        available: isTrueFanOrWhale || tempAddonSettings.relationshipStatus || activeStatefulAddons < 2,
        dynamicCost: null
      },
      characterPosition: { 
        name: 'Character Position', 
        cost: 5, 
        description: 'Track character\'s physical position and body language',
        available: isTrueFanOrWhale || tempAddonSettings.characterPosition || activeStatefulAddons < 2,
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
    // Load background image for current chat
    if (currentChatId) {
      const savedBackground = localStorage.getItem(`chat-background-${currentChatId}`);
      if (savedBackground) {
        setBackgroundImage(savedBackground);
      }
    }
  }, [characterId, userId, currentChatId]);

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
  };

  const handleSaveConfiguration = async () => {
    setSaving(true);
    
    try {
      // Optimistic update - apply settings immediately for better UX
      setAddonSettings(tempAddonSettings);
      
      // Invalidate and update the cache immediately with optimistic data
      queryClient.setQueryData(['addon-settings', userId, characterId], tempAddonSettings);
      
      // Save addon settings to database
      const addonResult = await saveUserCharacterAddonSettings(userId, characterId, tempAddonSettings);
      if (!addonResult.success) {
        // Rollback on failure
        setAddonSettings(addonSettings);
        queryClient.setQueryData(['addon-settings', userId, characterId], addonSettings);
        throw new Error(addonResult.error || 'Failed to save addon settings');
      }
      
      // Invalidate cache to ensure fresh data across all components
      await queryClient.invalidateQueries({ 
        queryKey: ['addon-settings', userId, characterId] 
      });

      // Apply background image immediately if there's one set
      if (backgroundImage && currentChatId) {
        // Trigger background update event for ChatMessages component
        window.dispatchEvent(new CustomEvent('background-image-updated', { 
          detail: { chatId: currentChatId, backgroundImage } 
        }));
      }
      
      toast.success('Configuration saved successfully');
    } catch (error) {
      console.error('Error saving configuration:', error);
      toast.error('Failed to save configuration. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBackgroundImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageData = e.target?.result as string;
        setBackgroundImage(imageData);
        // Save to localStorage for the current chat
        if (currentChatId) {
          localStorage.setItem(`chat-background-${currentChatId}`, imageData);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearBackgroundImage = () => {
    setBackgroundImage(null);
    // Remove from localStorage for the current chat
    if (currentChatId) {
      localStorage.removeItem(`chat-background-${currentChatId}`);
    }
  };

  const totalCost = calculateAddonCreditCost(tempAddonSettings);
  const hasUnsavedChanges = JSON.stringify(addonSettings) !== JSON.stringify(tempAddonSettings);

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-gray-400 text-center py-8">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Persona Selection */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm">Persona</h3>
          <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
            {userPlan}
          </Badge>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between text-gray-400 hover:text-white hover:bg-gray-800 px-3 border border-gray-600/50"
            >
              <div className="flex items-center space-x-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={selectedPersona?.avatar_url || undefined} alt={selectedPersona?.name} />
                  <AvatarFallback className="bg-[#FF7A00] text-white text-xs">
                    {selectedPersona?.name?.split(' ').map(n => n[0]).join('') || 'P'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">{selectedPersona?.name || 'Select Persona'}</span>
              </div>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-[#1a1a2e] border-gray-700/50 z-50">
            {personas.map((persona) => (
              <DropdownMenuItem
                key={persona.id}
                onClick={() => setSelectedPersona(persona)}
                className="flex items-center space-x-2 p-3 hover:bg-[#FF7A00]/20 cursor-pointer"
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src={persona.avatar_url || undefined} alt={persona.name} />
                  <AvatarFallback className="bg-[#FF7A00] text-white text-xs">
                    {persona.name?.split(' ').map(n => n[0]).join('') || 'P'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{persona.name}</div>
                  {persona.bio && (
                    <div className="text-gray-400 text-sm truncate">{persona.bio}</div>
                  )}
                </div>
                {selectedPersona?.id === persona.id && (
                  <div className="w-2 h-2 bg-[#FF7A00] rounded-full" />
                )}
              </DropdownMenuItem>
            ))}
            {personas.length > 0 && <DropdownMenuSeparator className="bg-gray-700/50" />}
            <DropdownMenuItem
              onClick={() => setShowPersonaModal(true)}
              className="flex items-center space-x-2 p-3 hover:bg-[#FF7A00]/20 cursor-pointer text-[#FF7A00]"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Persona</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Card>

      {/* World Info Selection */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm">World Info</h3>
          <Badge variant="outline" className="border-[#FF7A00] text-[#FF7A00] text-xs">
            Dynamic
          </Badge>
        </div>
        
        <WorldInfoDropdown 
          isVisible={true}
          onWorldInfoSelect={onWorldInfoSelect}
          disabled={!tempAddonSettings.dynamicWorldInfo}
          selectedWorldInfoId={selectedWorldInfoId}
        />
      </Card>

      {/* Background Image */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <h3 className="text-white font-medium text-sm mb-3">Chat Background</h3>
        <p className="text-xs text-gray-400 mb-3">Recommended size: 1920x1080px for best display</p>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="background-upload" className="text-gray-300 text-sm">
              Custom Background Image
            </Label>
            {backgroundImage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearBackgroundImage}
                className="text-gray-400 hover:text-red-400 p-1"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleBackgroundImageUpload}
              className="hidden"
              id="background-upload"
            />
            <label
              htmlFor="background-upload"
              className="cursor-pointer block w-full h-20 rounded-lg border-2 border-dashed border-gray-600 hover:border-[#FF7A00] transition-colors duration-300 flex items-center justify-center overflow-hidden bg-gray-800/50"
            >
              {backgroundImage ? (
                <div className="relative w-full h-full">
                  <img 
                    src={backgroundImage} 
                    alt="Background preview" 
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-white text-sm font-medium">Change Image</span>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                  <span className="text-sm text-gray-400">Upload background image</span>
                </div>
              )}
            </label>
          </div>
        </div>
      </Card>

      {/* Character Addons */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium text-sm">Character Addons</h3>
          {totalCost > 0 && (
            <Badge variant="outline" className="border-[#FF7A00] text-[#FF7A00]">
              +{totalCost}%
            </Badge>
          )}
        </div>

        <div className="space-y-4">
          {Object.entries(addonCategories).map(([categoryName, addons]) => (
            <div key={categoryName} className="space-y-3">
              <h4 className="text-gray-300 font-medium text-sm border-b border-gray-700/30 pb-1">
                {categoryName}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(addons).map(([key, details]) => (
                  <div key={key} className={`flex flex-col p-3 rounded-lg border ${
                    details.available 
                      ? 'bg-[#0f0f0f] border-gray-700/30' 
                      : 'bg-gray-900/50 border-gray-700/20 opacity-60'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-medium text-sm ${
                        details.available ? 'text-white' : 'text-gray-500'
                      }`}>
                        {details.name}
                      </span>
                      <Switch
                        checked={tempAddonSettings[key as keyof AddonSettings]}
                        onCheckedChange={() => handleToggleAddon(key as keyof AddonSettings)}
                        disabled={saving || !details.available}
                        className="data-[state=checked]:bg-[#FF7A00]"
                      />
                    </div>
                    <p className={`text-xs mb-2 ${
                      details.available ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {details.description}
                    </p>
                    <div className="flex items-center justify-end">
                      {details.dynamicCost ? (
                        <Badge variant="outline" className="text-xs border-blue-400 text-blue-400 h-5">
                          Dynamic
                        </Badge>
                      ) : details.cost > 0 && (
                        <Badge variant="outline" className="text-xs border-[#FF7A00] text-[#FF7A00] h-5">
                          +{details.cost}%
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Limitation notices */}
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
            </div>
          ))}
        </div>

        {totalCost > 0 && (
          <div className="border-t border-gray-700/50 pt-3 mt-4">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-1.5 h-1.5 bg-[#FF7A00] rounded-full"></div>
              <p className="text-gray-400 text-xs text-center">
                Active addons increase message cost by {totalCost}%
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Save Configuration */}
      <Button 
        onClick={handleSaveConfiguration}
        className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
        disabled={saving || !hasUnsavedChanges}
      >
        <Settings className="w-4 h-4 mr-2" />
        {saving ? 'Saving...' : 'Save Configuration'}
      </Button>
    </div>
  );
};