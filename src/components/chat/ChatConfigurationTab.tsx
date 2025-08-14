import React, { useState, useEffect } from 'react';
import { ChevronDown, Plus, Edit, Clock } from 'lucide-react';
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
import { CharacterChatModeToggle } from '@/components/character-creator/CharacterChatModeToggle';

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
  // Moved from Details tab -> now configured here per chat
  chatMode: 'storytelling' | 'companion';
  onChatModeChange: (mode: 'storytelling' | 'companion') => void;
  chatModeLoading: boolean;
  timeAwarenessEnabled: boolean;
  onTimeAwarenessChange: (enabled: boolean) => void;
  timeAwarenessLoading: boolean;
  userTimezone: string;
  onUnsavedChange?: (has: boolean) => void;
  discardSignal?: number;
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
  onPersonaSaved,
  chatMode,
  onChatModeChange,
  chatModeLoading,
  timeAwarenessEnabled,
  onTimeAwarenessChange,
  timeAwarenessLoading,
  userTimezone,
  onUnsavedChange,
  discardSignal,
}: ChatConfigurationTabProps) => {
  const { subscription } = useAuth();
  const queryClient = useQueryClient();
  
  // Use global chat settings instead of character-specific settings
  const { data: globalSettings, isLoading: settingsLoading } = useUserGlobalChatSettings();
  const updateGlobalSettings = useUpdateGlobalChatSettings();
  
  const [saving, setSaving] = useState(false);
  
  // Track pending changes
  const [pendingChanges, setPendingChanges] = useState<Partial<UserGlobalChatSettings>>({});
  const [pendingPersonaId, setPendingPersonaId] = useState<string | null>(null);
  const [hasPersonaChange, setHasPersonaChange] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Current effective settings (merging global settings with pending changes)
  const effectiveSettings = globalSettings ? { ...globalSettings, ...pendingChanges } : null;

  // Count active stateful tracking addons for Guest Pass limits (using effective settings)
  const activeStatefulAddons = effectiveSettings ? [
    effectiveSettings.mood_tracking,
    effectiveSettings.clothing_inventory,
    effectiveSettings.location_tracking,
    effectiveSettings.time_and_weather,
    effectiveSettings.relationship_status,
    effectiveSettings.character_position,
  ].filter(Boolean).length : 0;

  // Define which keys are considered stateful tracking addons (for limit checks)
  const STATEFUL_KEYS: Array<keyof UserGlobalChatSettings> = [
    'mood_tracking',
    'clothing_inventory',
    'location_tracking',
    'time_and_weather',
    'relationship_status',
    'character_position',
  ];

  // Display persona shows pending selection or current selection
  const displayPersona = hasPersonaChange
    ? personas.find(p => p.id === pendingPersonaId) || null
    : selectedPersona;

  // Determine user's subscription tier
  const userPlan = subscription?.plan?.name || 'Guest Pass';
  const isGuestPass = userPlan === 'Guest Pass';
  const isTrueFanOrWhale = userPlan === 'True Fan' || userPlan === 'The Whale';

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
        available: isTrueFanOrWhale || effectiveSettings?.clothing_inventory || activeStatefulAddons < 2,
        dynamicCost: null
      },
      location_tracking: { 
        name: 'Location Tracking', 
        cost: 5, 
        description: 'Track current location',
        available: isTrueFanOrWhale || effectiveSettings?.location_tracking || activeStatefulAddons < 2,
        dynamicCost: null
      },
      time_and_weather: { 
        name: 'Time & Weather', 
        cost: 5, 
        description: 'Real-time environment',
        available: isTrueFanOrWhale || effectiveSettings?.time_and_weather || activeStatefulAddons < 2,
        dynamicCost: null
      },
      relationship_status: { 
        name: 'Relationship Status', 
        cost: 5, 
        description: 'Track relationships',
        available: isTrueFanOrWhale || effectiveSettings?.relationship_status || activeStatefulAddons < 2,
        dynamicCost: null
      },
      character_position: { 
        name: 'Character Position', 
        cost: 5, 
        description: "Track character's physical position and body language",
        available: isTrueFanOrWhale || effectiveSettings?.character_position || activeStatefulAddons < 2,
        dynamicCost: null
      },
    },
    'Advanced Prompting Toolkit': {
      chain_of_thought: { 
        name: 'Chain of Thought', 
        cost: 30, 
        description: 'Advanced reasoning capabilities - Coming Soon',
        available: false, 
        dynamicCost: null,
        comingSoon: true 
      },
      few_shot_examples: { 
        name: 'Few Shot Examples', 
        cost: 7, 
        description: 'Better response quality through examples - Coming Soon',
        available: false, 
        dynamicCost: null,
        comingSoon: true 
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

    // Guest Pass safeguard: prevent enabling more than 2 stateful tracking addons
    if (isGuestPass && STATEFUL_KEYS.includes(addonKey)) {
      // If turning ON and this would exceed the limit, block and notify
      const prospectiveCount = activeStatefulAddons + (currentValue ? 0 : 1);
      if (newValue && prospectiveCount > 2) {
        toast.warning('Guest Pass limit reached: Only 2 tracking addons can be active.');
        return;
      }
    }
    
    // Update pending changes
    const newPendingChanges = {
      ...pendingChanges,
      [addonKey]: newValue
    };
    
    setPendingChanges(newPendingChanges);
    setHasUnsavedChanges(true);
  };

  const handlePersonaChange = (personaId: string | null) => {
    setPendingPersonaId(personaId);
    setHasPersonaChange(true);
    setHasUnsavedChanges(true);
  };

  // Pending local-only settings for per-chat values and world info
  const [pendingChatMode, setPendingChatMode] = useState<typeof chatMode>(chatMode);
  const [pendingTimeAwareness, setPendingTimeAwareness] = useState<boolean>(timeAwarenessEnabled);
  const [pendingWorldInfo, setPendingWorldInfo] = useState<any | null>(null);

  useEffect(() => setPendingChatMode(chatMode), [chatMode]);
  useEffect(() => setPendingTimeAwareness(timeAwarenessEnabled), [timeAwarenessEnabled]);

  // Whenever unsaved state changes, notify parent (for navigation guards)
  useEffect(() => {
    onUnsavedChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChange]);

  // Support external discard from parent via signal counter
  useEffect(() => {
    if (discardSignal !== undefined) {
      // noop: on change, discard
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discardSignal]);

  // Override to actually discard when signal changes
  useEffect(() => {
    // If parent increments signal, discard local changes
    // We track last seen value in a ref-less simple state
  }, []);

  // Save all pending changes
  const handleSaveChanges = async () => {
    if (!hasUnsavedChanges || (Object.keys(pendingChanges).length === 0 && !hasPersonaChange && pendingWorldInfo === null && pendingChatMode === chatMode && pendingTimeAwareness === timeAwarenessEnabled)) return;
    
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

      // Apply world info selection if changed (pending set)
      if (pendingWorldInfo !== null) {
        onWorldInfoSelect(pendingWorldInfo);
      }

      // Apply per-chat settings (chat mode, time awareness) if changed
      if (pendingChatMode !== chatMode) {
        onChatModeChange(pendingChatMode);
      }
      if (pendingTimeAwareness !== timeAwarenessEnabled) {
        onTimeAwarenessChange(pendingTimeAwareness);
      }
      
      toast.success('Settings saved successfully');
      setPendingChanges({});
      setPendingPersonaId(null);
      setHasPersonaChange(false);
      setHasUnsavedChanges(false);
      setPendingWorldInfo(null);
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
    setPendingWorldInfo(null);
    setPendingChatMode(chatMode);
    setPendingTimeAwareness(timeAwarenessEnabled);
    toast.info('Changes discarded');
  };

  // React to discardSignal increment to discard locally
  const [lastDiscardSignal, setLastDiscardSignal] = useState<number | undefined>(discardSignal);
  useEffect(() => {
    if (discardSignal !== undefined && discardSignal !== lastDiscardSignal) {
      setLastDiscardSignal(discardSignal);
      handleDiscardChanges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discardSignal]);

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
    <div className="p-4 space-y-6 pb-16">
      {/* Persona Selection */}
      <Card data-tutorial="persona-section" className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm">Persona</h3>
          {/* Removed subscription badge for a cleaner, uniform header */}
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
                    <AvatarImage src={displayPersona?.avatar_url || undefined} alt={displayPersona?.name} className="object-cover" />
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
                  <AvatarImage src={persona.avatar_url || undefined} alt={persona.name} className="object-cover" />
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
          {/* Removed Dynamic badge */}
        </div>
        
        <WorldInfoDropdown 
          isVisible={true}
          onWorldInfoSelect={(wi) => {
            setPendingWorldInfo(wi);
            setHasUnsavedChanges(true);
          }}
          disabled={!effectiveSettings?.dynamic_world_info}
          selectedWorldInfoId={(pendingWorldInfo?.id) || selectedWorldInfoId}
        />
      </Card>

      {/* Chat Settings (per chat) */}
      <Card className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm">Chat Settings</h3>
          {/* Removed Chat pill */}
        </div>
        <div className="space-y-4">
          <CharacterChatModeToggle
            chatMode={pendingChatMode}
            onChange={(m) => { setPendingChatMode(m); setHasUnsavedChanges(true); }}
            showWarning={false}
            disabled={chatModeLoading}
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-[#FF7A00]" />
                <span className="text-white text-xs sm:text-sm font-medium">Time Awareness</span>
              </div>
              <Switch
                checked={pendingTimeAwareness}
                onCheckedChange={(v) => { setPendingTimeAwareness(v); setHasUnsavedChanges(true); }}
                disabled={timeAwarenessLoading}
                className="data-[state=checked]:bg-[#FF7A00]"
              />
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              When enabled, the character will react to how long you take to respond based on their personality. 
              Patient characters stay calm with delays, while impatient ones may show frustration.
            </p>
            {pendingTimeAwareness && (
              <p className="text-gray-400 text-xs mt-2">
                <Clock className="w-3 h-3 inline mr-1" />
                Your timezone: {userTimezone}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Global Addon Settings */}
      <Card data-tutorial="global-addons-section" className="bg-[#1a1a2e] border-gray-700/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium text-sm">Global Addon Settings</h3>
          {/* Removed Applies to all chats pill */}
        </div>

        <div className="space-y-4">
          {Object.entries(addonCategories)
            .filter(([categoryName]) => categoryName !== 'Advanced Prompting Toolkit')
            .map(([categoryName, addons]) => (
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
                      {/* Hide per-addon cost badges */}
                      <div className="flex items-center justify-end h-5"></div>
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

      {/* Sticky footer with actions */}
      <div className="sticky bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-gray-700/50 p-2">
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={handleDiscardChanges}
            disabled={saving || !hasUnsavedChanges}
            className="bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 text-sm"
          >
            Discard
          </Button>
          <Button
            onClick={handleSaveChanges}
            disabled={saving || !hasUnsavedChanges}
            className="bg-[#FF7A00] hover:bg-[#FF8A10] text-white shadow-lg text-sm"
          >
            {saving ? (
              <>
                <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
