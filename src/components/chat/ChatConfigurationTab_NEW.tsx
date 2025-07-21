import React, { useState, useEffect } from 'react';
import { Settings, ChevronDown, Plus, Upload, Image, X, Zap } from 'lucide-react';
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

  // Determine user's subscription tier
  const userPlan = subscription?.plan?.name || 'Guest Pass';
  const isGuestPass = userPlan === 'Guest Pass';
  const isTrueFanOrWhale = userPlan === 'True Fan' || userPlan === 'The Whale';

  // Count active stateful tracking addons for Guest Pass limits (using global settings)
  const activeStatefulAddons = globalSettings ? [
    globalSettings.mood_tracking,
    globalSettings.clothing_inventory,
    globalSettings.location_tracking,
    globalSettings.time_and_weather,
    globalSettings.relationship_status,
    globalSettings.character_position,
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
          ? 'Advanced conversation memory (Included in your plan)'
          : 'Advanced conversation memory',
        available: true,
        dynamicCost: null
      },
    },
    'Character Tracking': {
      mood_tracking: { 
        name: 'Mood Tracking', 
        cost: 5, 
        description: 'Track character emotions',
        available: isTrueFanOrWhale || globalSettings?.mood_tracking || activeStatefulAddons < 2,
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
    },
    'Advanced Features': {
      time_and_weather: { 
        name: 'Time & Weather', 
        cost: 8, 
        description: 'Real-time environment',
        available: isTrueFanOrWhale || globalSettings?.time_and_weather || activeStatefulAddons < 2,
        dynamicCost: null
      },
      relationship_status: { 
        name: 'Relationship Status', 
        cost: 8, 
        description: 'Track relationships',
        available: isTrueFanOrWhale || globalSettings?.relationship_status || activeStatefulAddons < 2,
        dynamicCost: null
      },
      character_position: { 
        name: 'Character Position', 
        cost: 8, 
        description: 'Track physical position',
        available: isTrueFanOrWhale || globalSettings?.character_position || activeStatefulAddons < 2,
        dynamicCost: null
      },
    },
    'AI Enhancements': {
      chain_of_thought: { 
        name: 'Chain of Thought', 
        cost: 15, 
        description: 'Advanced reasoning',
        available: isTrueFanOrWhale,
        dynamicCost: null
      },
      few_shot_examples: { 
        name: 'Few-Shot Examples', 
        cost: 12, 
        description: 'Better response quality',
        available: isTrueFanOrWhale,
        dynamicCost: null
      },
    }
  };

  // Handler functions for global settings
  const handleToggleAddon = async (addonKey: keyof Pick<UserGlobalChatSettings, 
    'dynamic_world_info' | 'enhanced_memory' | 'mood_tracking' | 'clothing_inventory' | 
    'location_tracking' | 'time_and_weather' | 'relationship_status' | 'character_position' | 
    'chain_of_thought' | 'few_shot_examples'>) => {
    
    if (!globalSettings) return;

    const newValue = !globalSettings[addonKey];
    
    try {
      setSaving(true);
      await updateGlobalSettings.mutateAsync({
        [addonKey]: newValue
      });
      toast.success('Settings updated successfully');
    } catch (error) {
      console.error('Error updating addon setting:', error);
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleStreamingModeChange = async (mode: 'instant' | 'smooth') => {
    if (!globalSettings) return;
    
    try {
      setSaving(true);
      await updateGlobalSettings.mutateAsync({
        streaming_mode: mode
      });
      toast.success('Streaming mode updated');
    } catch (error) {
      console.error('Error updating streaming mode:', error);
      toast.error('Failed to update streaming mode');
    } finally {
      setSaving(false);
    }
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

  const handleBackgroundUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setBackgroundImage(result);
        if (currentChatId) {
          localStorage.setItem(`chat-background-${currentChatId}`, result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearBackground = () => {
    setBackgroundImage(null);
    if (currentChatId) {
      localStorage.removeItem(`chat-background-${currentChatId}`);
    }
  };

  if (settingsLoading) {
    return (
      <div className="space-y-6 p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-20 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!globalSettings) {
    return (
      <div className="space-y-6 p-4">
        <div className="text-center text-gray-500">
          Failed to load settings. Please try refreshing the page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Persona Selection */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">Character Persona</h3>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between h-12 px-4 min-w-[200px]">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={selectedPersona?.avatar_url || ''} />
                    <AvatarFallback>
                      {selectedPersona?.name?.charAt(0) || 'D'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {selectedPersona?.name || 'Default'}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[300px]">
              <DropdownMenuItem onClick={() => setSelectedPersona(null)}>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>D</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium">Default</span>
                    <span className="text-sm text-gray-500">Use your default persona</span>
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {personas.map((persona) => (
                <DropdownMenuItem key={persona.id} onClick={() => setSelectedPersona(persona)}>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={persona.avatar_url || ''} />
                      <AvatarFallback>{persona.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium">{persona.name}</span>
                      <span className="text-sm text-gray-500 truncate max-w-[200px]">
                        {persona.bio || 'No description'}
                      </span>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowPersonaModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create New Persona
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Streaming Settings Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">Streaming Settings</h3>
          <Badge variant="secondary" className="text-xs">Global</Badge>
        </div>
        
        <Card className="p-4 space-y-4">
          {/* Streaming Mode */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Response Mode</Label>
            <RadioGroup 
              value={globalSettings.streaming_mode} 
              onValueChange={handleStreamingModeChange}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="instant" id="instant" />
                <Label htmlFor="instant" className="cursor-pointer">
                  <div className="flex flex-col">
                    <span className="font-medium">Instant</span>
                    <span className="text-xs text-gray-500">Complete response at once</span>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="smooth" id="smooth" />
                <Label htmlFor="smooth" className="cursor-pointer">
                  <div className="flex flex-col">
                    <span className="font-medium">Smooth</span>
                    <span className="text-xs text-gray-500">Real-time streaming</span>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </Card>
      </div>

      {/* Global Addon Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-800">Global Addon Settings</h3>
          <Badge variant="secondary" className="text-xs">Applies to all chats</Badge>
        </div>
        
        {Object.entries(addonCategories).map(([categoryName, addons]) => (
          <Card key={categoryName} className="p-4">
            <h4 className="font-medium text-gray-700 mb-3">{categoryName}</h4>
            <div className="space-y-3">
              {Object.entries(addons).map(([key, addon]) => {
                const isEnabled = globalSettings[key as keyof UserGlobalChatSettings] as boolean;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{addon.name}</span>
                        {addon.cost > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {addon.cost} credits/msg
                          </Badge>
                        )}
                        {!addon.available && (
                          <Badge variant="destructive" className="text-xs">
                            Upgrade Required
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{addon.description}</p>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => handleToggleAddon(key as any)}
                      disabled={!addon.available || saving}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* World Info Selection */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">World Information</h3>
        <WorldInfoDropdown 
          onWorldInfoSelect={onWorldInfoSelect}
          selectedWorldInfoId={selectedWorldInfoId}
        />
      </div>

      {/* Chat Background */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">Chat Background</h3>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Input
              type="file"
              accept="image/*"
              onChange={handleBackgroundUpload}
              className="hidden"
              id="background-upload"
            />
            <Label htmlFor="background-upload">
              <Button variant="outline" className="cursor-pointer" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Background
                </span>
              </Button>
            </Label>
          </div>
          {backgroundImage && (
            <Button variant="outline" size="icon" onClick={clearBackground}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {backgroundImage && (
          <div className="relative w-full h-32 rounded-lg overflow-hidden">
            <img 
              src={backgroundImage} 
              alt="Chat background" 
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Guest Pass Limitations Notice */}
      {isGuestPass && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h4 className="font-medium text-amber-800 mb-2">Guest Pass Limitations</h4>
          <p className="text-sm text-amber-700">
            You can enable up to 2 stateful tracking addons. Currently using {activeStatefulAddons}/2.
            Upgrade to True Fan or The Whale for unlimited access to all features.
          </p>
        </div>
      )}
    </div>
  );
};
