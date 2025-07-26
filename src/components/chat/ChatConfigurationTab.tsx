import React, { useState, useEffect } from 'react';
import { Settings, ChevronDown, Plus, Upload, Image, X, Zap, Type, Edit } from 'lucide-react';
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
import { updateChatSelectedPersona } from '@/lib/chat-persona-operations';
import { updateUserDefaultPersona } from '@/lib/character-persona-operations';

interface ChatConfigurationTabProps {
  characterId: string;
  userId: string;
  personas: Persona[];
  selectedPersona: Persona | null;
  setSelectedPersona: (persona: Persona | null) => void;
  onPersonaSaved?: () => void; // Callback to notify parent that persona was saved
  setShowPersonaModal: (show: boolean) => void;
  setShowEditPersonaModal?: (show: boolean) => void;
  setPersonaToEdit?: (persona: Persona | null) => void;
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
  setShowEditPersonaModal,
  setPersonaToEdit,
  worldInfoDropdownVisible,
  onWorldInfoSelect,
  currentChatId,
  selectedWorldInfoId,
  onPersonaSaved
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
  const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null);
  const [hasPersonaChange, setHasPersonaChange] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Current effective settings (merging global settings with pending changes)
  const effectiveSettings = globalSettings ? { ...globalSettings, ...pendingChanges } : null;
  
  // Calculate total addon cost percentage
  const calculateTotalAddonCost = () => {
    if (!effectiveSettings) return 0;
    
    let totalCost = 0;
    if (effectiveSettings.dynamic_world_info) totalCost += 10;
    // Enhanced Memory is 0% for True Fan/Whale, not included in cost calculation
    if (effectiveSettings.mood_tracking) totalCost += 5;
    if (effectiveSettings.clothing_inventory) totalCost += 5;
    if (effectiveSettings.location_tracking) totalCost += 5;
    if (effectiveSettings.time_and_weather) totalCost += 5;
    if (effectiveSettings.relationship_status) totalCost += 5;
    if (effectiveSettings.character_position) totalCost += 5;
    if (effectiveSettings.chain_of_thought) totalCost += 30;
    if (effectiveSettings.few_shot_examples) totalCost += 7;
    
    return totalCost;
  };
  
  const totalAddonCost = calculateTotalAddonCost();
  
  // Display persona shows pending selection or current selection
  const displayPersona = hasPersonaChange
    ? personas.find(p => p.id === pendingPersonaId) || null
    : selectedPersona;

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
        description: 'Advanced reasoning capabilities - Coming Soon',
        available: false, // Disabled for now
        dynamicCost: null,
        comingSoon: true // New property to indicate coming soon status
      },
      few_shot_examples: { 
        name: 'Few Shot Examples', 
        cost: 7, 
        description: 'Better response quality through examples - Coming Soon',
        available: false, // Disabled for now
        dynamicCost: null,
        comingSoon: true // New property to indicate coming soon status
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

  const handlePersonaChange = (personaId: string | null) => {
    setPendingPersonaId(personaId);
    setHasPersonaChange(true);
    setHasUnsavedChanges(true);
  };

  // Save all pending changes
  const handleSaveChanges = async () => {
    if (!hasUnsavedChanges || (Object.keys(pendingChanges).length === 0 && !hasPersonaChange)) return;
    
    try {
      setSaving(true);
      
      // Save global settings if there are any changes
      if (Object.keys(pendingChanges).length > 0) {
        await updateGlobalSettings.mutateAsync(pendingChanges);
      }
      
      // Apply persona change if there is one
      if (hasPersonaChange) {
        console.log('💾 Persona change detected. Current chat ID:', currentChatId);
        if (currentChatId) {
          console.log('💾 Saving persona change:', pendingPersonaId);
          
          // Save persona to database for this chat (can be null to clear persona)
          await updateChatSelectedPersona(currentChatId, pendingPersonaId);
          
          // Also update the user's default persona for future chats
          await updateUserDefaultPersona(userId, pendingPersonaId);
          
          // Update local state immediately to prevent flicker
          const newPersona = pendingPersonaId 
            ? personas.find(p => p.id === pendingPersonaId) || null 
            : null;
          setSelectedPersona(newPersona);
          
          // Notify parent to reload persona data (but local state is already updated)
          if (onPersonaSaved) {
            onPersonaSaved();
          }
        }
      }
      
      toast.success('Settings saved successfully');
      setPendingChanges({});
      setPendingPersonaId(null);
      setHasPersonaChange(false);
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
    setPendingPersonaId(null);
    setHasPersonaChange(false);
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
      <Card data-tutorial="persona-section" className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm">Persona</h3>
          <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
            {userPlan}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="flex-1 justify-between text-gray-400 hover:text-white hover:bg-gray-800 px-3 border border-gray-600/50"
                data-tutorial="persona-dropdown"
              >
                <div className="flex items-center space-x-2">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={displayPersona?.avatar_url || undefined} alt={displayPersona?.name} />
                    <AvatarFallback className="bg-[#FF7A00] text-white text-xs">
                      {displayPersona?.name?.split(' ').map(n => n[0]).join('') || '-'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{displayPersona?.name || 'No Persona'}</span>
                </div>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-[#1a1a2e] border-gray-700/50 z-50">
            <DropdownMenuItem
              onClick={() => handlePersonaChange(null)}
              className="flex items-center space-x-2 p-3 hover:bg-[#FF7A00]/20 cursor-pointer"
            >
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-gray-600 text-white text-xs">
                  -
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium">No Persona</div>
                <div className="text-gray-400 text-sm">Use default user context</div>
              </div>
              {!displayPersona && (
                <div className="w-2 h-2 bg-[#FF7A00] rounded-full" />
              )}
            </DropdownMenuItem>
            {personas.length > 0 && <DropdownMenuSeparator className="bg-gray-700/50" />}
            {personas.map((persona) => (
              <DropdownMenuItem
                key={persona.id}
                onClick={() => handlePersonaChange(persona.id)}
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
                {displayPersona?.id === persona.id && (
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
        
        {/* Edit Persona Button */}
        {displayPersona && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (setPersonaToEdit && setShowEditPersonaModal) {
                setPersonaToEdit(displayPersona);
                setShowEditPersonaModal(true);
              }
            }}
            className="text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-600/50"
            title="Edit Persona"
          >
            <Edit className="w-4 h-4" />
          </Button>
        )}
      </div>
      </Card>

      {/* World Info Selection */}
      <Card data-tutorial="world-info-section" className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm">World Info</h3>
          <Badge variant="outline" className="border-[#FF7A00] text-[#FF7A00] text-xs">
            Dynamic
          </Badge>
        </div>
        
        <WorldInfoDropdown 
          isVisible={true}
          onWorldInfoSelect={onWorldInfoSelect}
          disabled={!effectiveSettings?.dynamic_world_info}
          selectedWorldInfoId={selectedWorldInfoId}
        />
      </Card>

      {/* Global Addon Settings */}
      <Card data-tutorial="global-addons-section" className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium text-sm">Global Addon Settings</h3>
          <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
            Applies to all chats
          </Badge>
        </div>

        <div className="space-y-4">
          {Object.entries(addonCategories).map(([categoryName, addons]) => (
            <div 
              key={categoryName} 
              className="space-y-3"
              data-tutorial={categoryName === 'Core Enhancements' ? 'core-enhancements' : categoryName === 'Character Tracking' ? 'character-tracking' : undefined}
            >
              <h4 className="text-gray-300 font-medium text-sm border-b border-gray-700/30 pb-1">
                {categoryName}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(addons).map(([key, details]) => {
                  const isEnabled = effectiveSettings?.[key as keyof UserGlobalChatSettings] as boolean;
                  const isComingSoon = (details as any).comingSoon;
                  return (
                    <div key={key} className={`flex flex-col p-3 rounded-lg border ${
                      details.available && !isComingSoon
                        ? 'bg-[#0f0f0f] border-gray-700/30' 
                        : 'bg-gray-900/50 border-gray-700/20 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`font-medium text-sm ${
                          details.available && !isComingSoon ? 'text-white' : 'text-gray-500'
                        }`}>
                          {details.name}
                        </span>
                        {isComingSoon ? (
                          <div className="relative overflow-hidden">
                            <div className="flex items-center justify-center px-3 py-1.5 bg-gradient-to-r from-indigo-600/10 to-blue-600/10 border border-indigo-400/30 rounded-lg backdrop-blur-sm">
                              <div className="flex items-center space-x-1">
                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse"></div>
                                <span className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider">
                                  Coming Soon
                                </span>
                              </div>
                            </div>
                            {/* Subtle shimmer effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"></div>
                          </div>
                        ) : (
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => handleToggleAddon(key as any)}
                            disabled={saving || !details.available}
                            className="data-[state=checked]:bg-[#FF7A00]"
                          />
                        )}
                      </div>
                      <p className={`text-xs mb-2 ${
                        details.available && !isComingSoon ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {details.description}
                      </p>
                      <div className="flex items-center justify-end">
                        {!isComingSoon && (
                          <>
                            {details.dynamicCost ? (
                              <Badge variant="outline" className="text-xs border-blue-400 text-blue-400 h-5">
                                Dynamic
                              </Badge>
                            ) : details.cost > 0 && (
                              <Badge variant="outline" className="text-xs border-[#FF7A00] text-[#FF7A00] h-5">
                                +{details.cost}%
                              </Badge>
                            )}
                          </>
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

      {/* Total Cost Indicator */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#FF7A00]" />
            <h3 className="text-white font-medium text-sm">Message Cost</h3>
          </div>
          <Badge 
            variant="outline" 
            className={`border-gray-600 text-xs ${
              totalAddonCost > 0 ? 'text-[#FF7A00] border-[#FF7A00]' : 'text-gray-400'
            }`}
          >
            Total: +{totalAddonCost}%
          </Badge>
        </div>
        
        <div className="text-sm text-gray-300">
          <p className="mb-2">
            Base message cost varies by subscription plan
          </p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Addon increase:</span>
            <span className={`font-medium ${totalAddonCost > 0 ? 'text-[#FF7A00]' : 'text-gray-400'}`}>
              {totalAddonCost > 0 ? `+${totalAddonCost}%` : 'None'}
            </span>
          </div>
          {totalAddonCost > 0 && (
            <div className="mt-2 p-2 bg-[#FF7A00]/10 border border-[#FF7A00]/20 rounded text-xs text-[#FF7A00]">
              💡 Active addons will increase your message costs
            </div>
          )}
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
