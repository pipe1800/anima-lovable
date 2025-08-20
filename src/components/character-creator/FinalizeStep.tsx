import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { User, MessageCircle, Heart, Sparkles, Globe, Link, Lock, Loader2 } from 'lucide-react';
import { getUserActiveSubscription } from '@/lib/supabase-queries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { CharacterFormData } from '@/hooks/useCharacterCreation';
import { estimateCreatorTokenUsage } from '@/utils/tokenCounter';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface FinalizeStepProps {
  data: CharacterFormData;
  onUpdate: (data: Partial<CharacterFormData>) => void;
  onFinalize: (overrides?: Partial<CharacterFormData>) => void; // modified to accept overrides
  onPrevious: () => void;
  isCreating?: boolean;
  isEditing?: boolean;
  selectedTags: { id: number; name: string; }[];
  setSelectedTags: React.Dispatch<React.SetStateAction<{ id: number; name: string; }[]>>;
}

type VisibilityType = 'public' | 'unlisted' | 'private';

const FinalizeStep = ({ data, onUpdate, onFinalize, onPrevious, isCreating = false, isEditing = false, selectedTags, setSelectedTags }: FinalizeStepProps) => {
  const [visibility, setVisibility] = useState<VisibilityType>(data.visibility || 'private');
  const [enableNSFW, setEnableNSFW] = useState<boolean>(!!data.nsfw_enabled);
  const [userPlan, setUserPlan] = useState<string>('Guest Pass');
  const [nsfwTag, setNsfwTag] = useState<{ id: number; name: string } | null>(null);

  // New local states for version & notes
  const [version, setVersion] = useState<string>(data.version || '1.0.0');
  const [characterNotes, setCharacterNotes] = useState<string>(data.notes?.character_notes || '');
  const [creatorNotes, setCreatorNotes] = useState<string>(data.notes?.creator_notes || '');
  const [showPublishWarning, setShowPublishWarning] = useState(false);

  // Custom Initial Addon Context state
  const [manualAddonContextEnabled, setManualAddonContextEnabled] = useState<boolean>((data as any)?.manual_addon_context_enabled || false);
  const [manualAddonContext, setManualAddonContext] = useState<any>({
    mood: (data as any)?.manual_addon_context?.mood || '',
    clothing: (data as any)?.manual_addon_context?.clothing || '',
    location: (data as any)?.manual_addon_context?.location || '',
    time_weather: (data as any)?.manual_addon_context?.time_weather || '',
    relationship: (data as any)?.manual_addon_context?.relationship || '',
    character_position: (data as any)?.manual_addon_context?.character_position || ''
  });

  const { user } = useAuth();

  // Check if user is premium (True Fan or Whale)
  const isPremiumUser = () => {
    return userPlan === 'True Fan' || userPlan === 'The Whale';
  };

  // Load user's subscription and NSFW tag
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Fetch user subscription
        if (user) {
          const { data: subscription } = await getUserActiveSubscription(user.id);
          if (subscription?.plan) {
            setUserPlan(subscription.plan.name);
          } else {
            setUserPlan('Guest Pass');
          }
        } else {
          setUserPlan('Guest Pass');
        }

        // Fetch NSFW tag from database
        const { data: tags } = await supabase
          .from('tags')
          .select('*')
          .ilike('name', 'nsfw')
          .limit(1);
        
        if (tags && tags.length > 0) {
          setNsfwTag(tags[0]);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };
    loadUserData();
  }, [user]);

  // Update form data when character data is loaded
  useEffect(() => {
    if (data) {
      setVisibility(data.visibility || 'private');
      setEnableNSFW(!!data.nsfw_enabled);
      setVersion(data.version || version || '1.0.0');
      setCharacterNotes(data.notes?.character_notes || '');
      setCreatorNotes(data.notes?.creator_notes || '');
      setManualAddonContextEnabled((data as any)?.manual_addon_context_enabled || false);
      setManualAddonContext({
        mood: (data as any)?.manual_addon_context?.mood || '',
        clothing: (data as any)?.manual_addon_context?.clothing || '',
        location: (data as any)?.manual_addon_context?.location || '',
        time_weather: (data as any)?.manual_addon_context?.time_weather || '',
        relationship: (data as any)?.manual_addon_context?.relationship || '',
        character_position: (data as any)?.manual_addon_context?.character_position || ''
      });
    }
  }, [data]);

  const visibilityOptions = [
    {
      id: 'private' as VisibilityType,
      title: 'Private',
      description: 'Only you can chat with this character.',
      icon: Lock,
    },
    {
      id: 'public' as VisibilityType,
      title: 'Public',
      description: 'Visible to everyone on the Discover page.',
      icon: Globe,
    },
  ];

  // Handle NSFW toggle with tag synchronization
  const handleNSFWToggle = (checked: boolean) => {
    setEnableNSFW(checked);

    if (!nsfwTag) return; // No NSFW tag found in database

    const nsfwTagIndex = selectedTags.findIndex(tag => tag?.name?.toLowerCase() === 'nsfw');
    
    if (checked && nsfwTagIndex === -1) {
      // Add NSFW tag if switch is turned on and tag doesn't exist
      setSelectedTags([...selectedTags, nsfwTag]);
    } else if (!checked && nsfwTagIndex !== -1) {
      // Remove NSFW tag if switch is turned off and tag exists
      setSelectedTags(selectedTags.filter((_, index) => index !== nsfwTagIndex));
    }
  };

  const handleFinalize = () => {
    const cleanedManualContext = Object.fromEntries(Object.entries(manualAddonContext).filter(([_, v]) => typeof v === 'string' && v.trim()));
    const overrides: Partial<CharacterFormData> = {
      visibility,
      nsfw_enabled: enableNSFW,
      version,
      notes: { character_notes: characterNotes, creator_notes: creatorNotes },
      ...(manualAddonContextEnabled && Object.keys(cleanedManualContext).length > 0 ? {
        manual_addon_context_enabled: true,
        manual_addon_context: cleanedManualContext
      } : {
        manual_addon_context_enabled: false,
        manual_addon_context: null
      })
    };
    console.log('🧪 [FinalizeStep] Submitting finalize overrides:', overrides);
    onFinalize(overrides);
  };

  const tokenInfo = estimateCreatorTokenUsage(data, userPlan);

  // Publish handling: confirm switching to public
  const confirmPublish = () => {
    setShowPublishWarning(false);
    setVisibility('public');
    onUpdate({ visibility: 'public' });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="mb-6 md:mb-8 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 md:mb-4">
          {isEditing ? 'Update Your Character' : 'Unleash Your Creation'}
        </h2>
        <p className="text-gray-400 text-base md:text-lg max-w-2xl mx-auto">
          {isEditing 
            ? 'Review your settings and add notes.'
            : 'Set visibility, version, and notes before launching.'
          }
        </p>
      </div>

      {/* Token Budget Meter */}
      <div className="mb-6 md:mb-8 p-3 md:p-4 rounded-xl border border-gray-700/50 bg-gray-800/30">
        <div className="flex items-center justify-between text-xs md:text-sm text-gray-300">
          <span>Token usage</span>
          <span>
            {tokenInfo.totals.totalUsed.toLocaleString()} / {tokenInfo.totals.maxTokens.toLocaleString()} tokens
          </span>
        </div>
        <div className="mt-2 h-2 rounded bg-gray-700 overflow-hidden">
          <div
            className={`h-full ${tokenInfo.totals.overTotal ? 'bg-red-500' : 'bg-[#FF7A00]'}`}
            style={{ width: `${Math.min(100, (tokenInfo.totals.totalUsed / Math.max(1, tokenInfo.totals.maxTokens)) * 100)}%` }}
          />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] md:text-xs text-gray-400">
          <div>Definition: {(tokenInfo.breakdown.personalitySummary + tokenInfo.breakdown.description).toLocaleString()}</div>
          <div>Scenario+Notes: {(tokenInfo.breakdown.scenario + tokenInfo.breakdown.characterNotes).toLocaleString()}</div>
          <div>Greeting: {tokenInfo.breakdown.greeting.toLocaleString()}</div>
        </div>
        {tokenInfo.totals.overTotal && (
          <p className="mt-2 text-red-400 text-xs md:text-sm">Over 3,500 token limit. Reduce fields before saving.</p>
        )}
      </div>

      {/* Version & Notes */}
      <div className="grid grid-cols-1 gap-6 md:gap-8 mb-6 md:mb-8">
        <div className="space-y-2">
          <Label className="text-white">Version</Label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white"
            placeholder="1.0.0"
          />
          <p className="text-xs text-gray-500">Use semantic versioning to track changes to this character.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-white">Character Notes (sent to model)</Label>
          <textarea
            value={characterNotes}
            onChange={(e) => setCharacterNotes(e.target.value)}
            rows={4}
            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white"
            placeholder="Internal notes to guide the model's behavior."
          />
          <p className="text-xs text-gray-500">These are injected into the prompt context for this character.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-white">Creator Notes (public)</Label>
          <textarea
            value={creatorNotes}
            onChange={(e) => setCreatorNotes(e.target.value)}
            rows={4}
            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white"
            placeholder="Public notes shown on the character profile."
          />
          <p className="text-xs text-gray-500">Visible to everyone on the character's public profile.</p>
        </div>
      </div>

      {/* Visibility Settings */}
      <div className="mb-6 md:mb-8">
        <h3 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6">Visibility Settings</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
          {visibilityOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = visibility === option.id;
            const isDisabled = isEditing && data.visibility === 'public';
            
            return (
              <button
                key={option.id}
                onClick={() => {
                  if (isDisabled) return;
                  if (option.id === 'public' && visibility !== 'public') {
                    setShowPublishWarning(true);
                  } else {
                    setVisibility(option.id);
                    onUpdate({ visibility: option.id });
                  }
                }}
                className={`p-4 md:p-6 rounded-2xl border-2 transition-all duration-200 text-left hover:bg-gray-800/30 ${
                  isSelected 
                    ? 'border-[#FF7A00] bg-[#FF7A00]/10' 
                    : 'border-gray-600 bg-gray-800/20'
                }`}
                disabled={isDisabled}
              >
                <div className="flex flex-col items-center text-center space-y-3 md:space-y-4">
                  <div className={`p-3 md:p-4 rounded-full ${
                    isSelected 
                      ? 'bg-[#FF7A00]/20 text-[#FF7A00]' 
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    <Icon className="w-6 h-6 md:w-8 md:h-8" />
                  </div>
                  
                  <div>
                    <h4 className={`text-lg md:text-xl font-semibold mb-1 md:mb-2 ${
                      isSelected ? 'text-[#FF7A00]' : 'text-white'
                    }`}>
                      {option.title}
                    </h4>
                    <p className="text-gray-400 text-xs md:text-sm">
                      {option.description}
                    </p>
                    {isDisabled && option.id === 'public' && (
                      <p className="text-xs text-gray-500 mt-1">Public status is permanent.</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {/* Publish warning dialog */}
        <Dialog open={showPublishWarning} onOpenChange={setShowPublishWarning}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Make character public?</DialogTitle>
            </DialogHeader>
            <p>Publishing is irreversible: once public, this character cannot be made private or deleted.</p>
            <div className="flex gap-2 justify-end mt-4">
              <Button onClick={() => setShowPublishWarning(false)} variant="outline">Cancel</Button>
              <Button onClick={confirmPublish} className="bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/80 hover:from-[#FF7A00]/90 hover:to-[#FF7A00]/70 text-white">
                Publish
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* NSFW Toggle */}
        <div className="bg-gray-800/30 rounded-xl p-4 md:p-6 border border-gray-700/50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Label className="text-white text-base md:text-lg font-medium block mb-2">
                Enable NSFW Content
              </Label>
              <p className="text-gray-400 text-xs md:text-sm">
                {isPremiumUser() 
                  ? "Allow mature content and conversations with this character"
                  : "NSFW content is only available for True Fan and Whale subscribers"
                }
              </p>
              {!isPremiumUser() && (
                <p className="text-[#FF7A00] text-xs md:text-sm mt-2 font-medium">
                  Upgrade to unlock NSFW features
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              <Switch
                checked={enableNSFW}
                onCheckedChange={isPremiumUser() ? handleNSFWToggle : undefined}
                disabled={!isPremiumUser()}
                className="data-[state=checked]:bg-[#FF7A00] disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Custom Initial Addon Context Section */}
      <div className="mb-6 md:mb-8 border border-gray-700/50 rounded-xl p-4 md:p-6 bg-gray-800/30">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label className="text-white text-base md:text-lg font-medium block mb-2">Custom Initial Addon Context</Label>
            <p className="text-gray-400 text-xs md:text-sm mb-2">Pre-seed selected tracking fields for this character. Blank fields will be auto-extracted on first message. If any field here is set, the initial extraction for those specific fields is skipped.</p>
            <p className="text-gray-500 text-[11px] md:text-xs">Max 160 characters per field.</p>
          </div>
          <div className="flex-shrink-0">
            <Switch checked={manualAddonContextEnabled} onCheckedChange={setManualAddonContextEnabled} className="data-[state=checked]:bg-[#FF7A00]" />
          </div>
        </div>
        {manualAddonContextEnabled && (
          <div className="mt-4 grid md:grid-cols-2 gap-4">
            {[
              { key: 'mood', label: 'Mood' },
              { key: 'clothing', label: 'Clothing / Inventory' },
              { key: 'location', label: 'Location / Setting' },
              { key: 'time_weather', label: 'Time & Weather' },
              { key: 'relationship', label: 'Relationship Status' },
              { key: 'character_position', label: 'Character Position' }
            ].map(f => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-300">{f.label}</label>
                <textarea
                  rows={2}
                  maxLength={160}
                  placeholder="Leave blank to auto-extract"
                  className="bg-[#1e1e1e] border border-gray-700 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
                  value={manualAddonContext[f.key]}
                  onChange={(e) => setManualAddonContext((prev: any) => ({ ...prev, [f.key]: e.target.value }))}
                />
                <div className="flex justify-end text-[10px] text-gray-500">{manualAddonContext[f.key]?.length || 0}/160</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-0">
        <Button
          onClick={onPrevious}
          variant="outline"
          className="border-gray-600 text-gray-300 hover:bg-gray-800/50 px-6 md:px-8 py-2.5 md:py-3 text-sm md:text-base order-2 sm:order-1"
          disabled={isCreating}
        >
          ← Previous
        </Button>
        
        <Button
          onClick={handleFinalize}
          className="bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/80 hover:from-[#FF7A00]/90 hover:to-[#FF7A00]/70 text-white px-8 md:px-12 py-2.5 md:py-3 text-base md:text-lg font-bold order-1 sm:order-2"
          disabled={isCreating}
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 md:w-5 md:h-5 mr-2 animate-spin" />
              <span className="hidden sm:inline">{isEditing ? 'Updating Character...' : 'Creating Character...'}</span>
              <span className="sm:hidden">{isEditing ? 'Updating...' : 'Creating...'}</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">{isEditing ? 'Update Character ✨' : 'Save & Launch Character 🚀'}</span>
              <span className="sm:hidden">{isEditing ? 'Update ✨' : 'Launch 🚀'}</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default FinalizeStep;
