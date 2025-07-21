import React, { useState, useEffect } from 'react';
import { Settings, ChevronDown, Plus, Upload, Image, X, Zap, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { WorldInfoDropdown } from './WorldInfoDropdown';
import { useUserGlobalChatSettings, useUpdateGlobalChatSettings } from '@/queries/chatSettingsQueries';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Persona } from '@/lib/persona-operations';
import { useQueryClient } from '@tanstack/react-query';
import { UserGlobalChatSettings } from '@/types/chatSettings';

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
  
  // Use global chat settings instead of character-specific settings
  const { data: globalSettings, isLoading: settingsLoading } = useUserGlobalChatSettings();
  const updateGlobalSettings = useUpdateGlobalChatSettings();
  
  const [saving, setSaving] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  
  // Track pending changes
  const [pendingChanges, setPendingChanges] = useState<Partial<UserGlobalChatSettings>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Current effective settings (merging global settings with pending changes)
  const effectiveSettings = globalSettings ? { ...globalSettings, ...pendingChanges } : null;

  // Determine user's subscription tier
  const userPlan = subscription?.plan?.name || 'Guest Pass';
  const isGuestPass = userPlan === 'Guest Pass';
  const isTrueFanOrWhale = userPlan === 'True Fan' || userPlan === 'The Whale';

  // Count active stateful tracking addons for Guest Pass limits (using effective settings)
  const activeStatefulAddons = effectiveSettings ? [
    effectiveSettings.mood_tracking,
    effectiveSettings.clothing_inventory,
    effectiveSettings.location_tracking,
    effectiveSettings.time_and_weather,
    effectiveSettings.relationship_status,
    effectiveSettings.character_position,
  ].filter(Boolean).length : 0;

  const addonCategories = {
    'Core Enhancements': {
      dynamic_world_info: { 
        name: 'Dynamic World Info', 
        cost: 10, 
        description: 'Enhanced world knowledge',
        available: true,
        dynamicCost: null
      },
      enhanced_memory: { 
        name: 'Enhanced Memory', 
        cost: 0, 
        description: isTrueFanOrWhale 
          ? 'Better conversation memory (Included in your plan)' 
          : 'Better conversation memory - Upgrade to True Fan or Whale to unlock',
        available: true,
        dynamicCost: null
      },
    },
    'Character Tracking': {
      mood_tracking: { 
        name: 'Mood Tracking', 
        cost: 5, 
        description: 'Track character emotions',
        available: isTrueFanOrWhale || effectiveSettings?.mood_tracking || activeStatefulAddons < 2,
        dynamicCost: null
      },
      clothing_inventory: { 
        name: 'Clothing Inventory', 
        cost: 5, 
        description: 'Track character outfits',
        available: isTrueFanOrWhale || globalSettings?.clothing_inventory || activeStatefulAddons < 2,
        dynamicCost: null
      },
      location_tracking: { 
        name: 'Location Tracking', 
        cost: 5, 
        description: 'Track current location',
        available: isTrueFanOrWhale || globalSettings?.location_tracking || activeStatefulAddons < 2,
        dynamicCost: null
      },
      time_and_weather: { 
        name: 'Time & Weather', 
        cost: 5, 
        description: 'Real-time environment',
        available: isTrueFanOrWhale || globalSettings?.time_and_weather || activeStatefulAddons < 2,
        dynamicCost: null
      },
      relationship_status: { 
        name: 'Relationship Status', 
        cost: 5, 
        description: 'Track relationships',
        available: isTrueFanOrWhale || globalSettings?.relationship_status || activeStatefulAddons < 2,
        dynamicCost: null
      },
      character_position: { 
        name: 'Character Position', 
        cost: 5, 
        description: 'Track character\'s physical position and body language',
        available: isTrueFanOrWhale || globalSettings?.character_position || activeStatefulAddons < 2,
        dynamicCost: null
      },
    },
    'Advanced Prompting Toolkit': {
      chain_of_thought: { 
        name: 'Chain of Thought', 
        cost: 30, 
        description: isTrueFanOrWhale 
          ? 'Advanced reasoning' 
          : 'Advanced reasoning - Upgrade to True Fan or Whale to unlock',
        available: isTrueFanOrWhale,
        dynamicCost: null
      },
      few_shot_examples: { 
        name: 'Few Shot Examples', 
        cost: 7, 
        description: 'Better response quality',
        available: true,
        dynamicCost: null
      },
    }
  };

  // Handler functions for global settings - now tracks changes instead of immediately saving
  const handleToggleAddon = (addonKey: keyof Pick<UserGlobalChatSettings, 
    'dynamic_world_info' | 'enhanced_memory' | 'mood_tracking' | 'clothing_inventory' | 
    'location_tracking' | 'time_and_weather' | 'relationship_status' | 'character_position' | 
    'chain_of_thought' | 'few_shot_examples'>) => {
    
    if (!globalSettings) return;

    const currentValue = effectiveSettings?.[addonKey] ?? globalSettings[addonKey];
    const newValue = !currentValue;
    
    // Update pending changes
    const newPendingChanges = {
      ...pendingChanges,
      [addonKey]: newValue
    };
    
    setPendingChanges(newPendingChanges);
    setHasUnsavedChanges(true);
  };

  const handleStreamingModeChange = (mode: 'instant' | 'smooth') => {
    if (!globalSettings) return;
    
    const newPendingChanges = {
      ...pendingChanges,
      streaming_mode: mode
    };
    
    setPendingChanges(newPendingChanges);
    setHasUnsavedChanges(true);
  };

  const handleFontSizeChange = (fontSize: 'small' | 'normal' | 'large') => {
    if (!globalSettings) return;
    
    const newPendingChanges = {
      ...pendingChanges,
      font_size: fontSize
    };
    
    setPendingChanges(newPendingChanges);
    setHasUnsavedChanges(true);
  };

  // Save all pending changes
  const handleSaveChanges = async () => {
    if (!hasUnsavedChanges || Object.keys(pendingChanges).length === 0) return;
    
    try {
      setSaving(true);
      await updateGlobalSettings.mutateAsync(pendingChanges);
      toast.success('Settings saved successfully');
      setPendingChanges({});
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Discard pending changes
  const handleDiscardChanges = () => {
    setPendingChanges({});
    setHasUnsavedChanges(false);
    toast.info('Changes discarded');
  };

  useEffect(() => {
    // Load background image for current chat
    if (currentChatId) {
      const savedBackground = localStorage.getItem(`chat-background-${currentChatId}`);
      if (savedBackground) {
        setBackgroundImage(savedBackground);
      }
    }
  }, [currentChatId]);

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

  if (settingsLoading) {
    return (
      <div className="p-4">
        <div className="text-gray-400 text-center py-8">Loading configuration...</div>
      </div>
    );
  }

  if (!globalSettings) {
    return (
      <div className="p-4">
        <div className="text-gray-400 text-center py-8">Failed to load settings. Please try refreshing the page.</div>
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

      {/* Global Addon Settings */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium text-sm">Global Addon Settings</h3>
          <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
            Applies to all chats
          </Badge>
        </div>

        <div className="space-y-4">
          {Object.entries(addonCategories).map(([categoryName, addons]) => (
            <div key={categoryName} className="space-y-3">
              <h4 className="text-gray-300 font-medium text-sm border-b border-gray-700/30 pb-1">
                {categoryName}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(addons).map(([key, details]) => {
                  const isEnabled = effectiveSettings?.[key as keyof UserGlobalChatSettings] as boolean;
                  return (
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
                          checked={isEnabled}
                          onCheckedChange={() => handleToggleAddon(key as any)}
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
                  );
                })}
              </div>
              
              {/* Limitation notices */}
              {categoryName === 'Character Tracking' && isGuestPass && activeStatefulAddons >= 2 && (
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
      </Card>

      {/* Streaming Settings */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-400" />
            <h3 className="text-white font-medium text-sm">Response Mode</h3>
          </div>
          <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
            Global
          </Badge>
        </div>
        
        <RadioGroup 
          value={effectiveSettings?.streaming_mode || globalSettings?.streaming_mode} 
          onValueChange={handleStreamingModeChange}
          className="flex gap-6"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="instant" id="instant" />
            <Label htmlFor="instant" className="cursor-pointer text-gray-300">
              <div className="flex flex-col">
                <span className="font-medium text-white">Instant</span>
                <span className="text-xs text-gray-400">Complete response at once</span>
              </div>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="smooth" id="smooth" />
            <Label htmlFor="smooth" className="cursor-pointer text-gray-300">
              <div className="flex flex-col">
                <span className="font-medium text-white">Smooth</span>
                <span className="text-xs text-gray-400">Real-time streaming</span>
              </div>
            </Label>
          </div>
        </RadioGroup>
      </Card>

      {/* Font Size Settings */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-green-400" />
            <h3 className="text-white font-medium text-sm">Font Size</h3>
          </div>
          <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
            Global
          </Badge>
        </div>
        
        <RadioGroup 
          value={effectiveSettings?.font_size || globalSettings?.font_size} 
          onValueChange={handleFontSizeChange}
          className="flex gap-6"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="small" id="small" />
            <Label htmlFor="small" className="cursor-pointer text-gray-300">
              <span className="font-medium text-white text-sm">Small</span>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="normal" id="normal" />
            <Label htmlFor="normal" className="cursor-pointer text-gray-300">
              <span className="font-medium text-white">Normal</span>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="large" id="large" />
            <Label htmlFor="large" className="cursor-pointer text-gray-300">
              <span className="font-medium text-white text-lg">Large</span>
            </Label>
          </div>
        </RadioGroup>
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
          disabled={!globalSettings.dynamic_world_info}
          selectedWorldInfoId={selectedWorldInfoId}
        />
      </Card>

      {/* Background Image */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <h3 className="text-white font-medium text-sm mb-3">Chat Background</h3>
        <p className="text-xs text-gray-400 mb-3">Recommended size: 1920x1080px for best display</p>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-300 text-sm">Background Image</span>
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

      {/* Save Button - Fixed Position */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDiscardChanges}
              disabled={saving}
              className="bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Discard
            </Button>
            <Button
              onClick={handleSaveChanges}
              disabled={saving || !hasUnsavedChanges}
              className="bg-[#FF7A00] hover:bg-[#FF8A10] text-white shadow-lg"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
