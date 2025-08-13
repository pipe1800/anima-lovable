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

interface FinalizeStepProps {
  data: CharacterFormData;
  onUpdate: (data: Partial<CharacterFormData>) => void;
  onFinalize: () => void;
  onPrevious: () => void;
  isCreating?: boolean;
  isEditing?: boolean;
  selectedTags: { id: number; name: string; }[];
  setSelectedTags: React.Dispatch<React.SetStateAction<{ id: number; name: string; }[]>>;
}

type VisibilityType = 'public' | 'unlisted' | 'private';

const FinalizeStep = ({ data, onUpdate, onFinalize, onPrevious, isCreating = false, isEditing = false, selectedTags, setSelectedTags }: FinalizeStepProps) => {
  const [visibility, setVisibility] = useState<VisibilityType>(data.visibility || 'public');
  const [enableNSFW, setEnableNSFW] = useState<boolean>(!!data.nsfw_enabled);
  const [userPlan, setUserPlan] = useState<string>('Guest Pass');
  const [nsfwTag, setNsfwTag] = useState<{ id: number; name: string } | null>(null);

  // New local states for version & notes
  const [version, setVersion] = useState<string>(data.version || '1.0.0');
  const [characterNotes, setCharacterNotes] = useState<string>(data.notes?.character_notes || '');
  const [creatorNotes, setCreatorNotes] = useState<string>(data.notes?.creator_notes || '');

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
      setVisibility(data.visibility || 'public');
      setEnableNSFW(!!data.nsfw_enabled);
      setVersion(data.version || version || '1.0.0');
      setCharacterNotes(data.notes?.character_notes || '');
      setCreatorNotes(data.notes?.creator_notes || '');
    }
  }, [data]);

  const visibilityOptions = [
    {
      id: 'public' as VisibilityType,
      title: 'Public',
      description: 'Visible to everyone on the Discover page.',
      icon: Globe,
    },
    {
      id: 'private' as VisibilityType,
      title: 'Private',
      description: 'Only you can chat with this character.',
      icon: Lock,
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
    onUpdate({
      visibility,
      nsfw_enabled: enableNSFW,
      version,
      notes: { character_notes: characterNotes, creator_notes: creatorNotes }
    });
    onFinalize();
  };

  const tokenInfo = estimateCreatorTokenUsage(data, userPlan);

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
          <span>Token budget preview</span>
          <span>
            {tokenInfo.totals.totalUsed.toLocaleString()} / {tokenInfo.totals.contextBudget.toLocaleString()} tokens
          </span>
        </div>
        <div className="mt-2 h-2 rounded bg-gray-700 overflow-hidden">
          <div
            className={`h-full ${tokenInfo.totals.overTotal ? 'bg-red-500' : 'bg-[#FF7A00]'}`}
            style={{ width: `${Math.min(100, (tokenInfo.totals.totalUsed / Math.max(1, tokenInfo.totals.contextBudget)) * 100)}%` }}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] md:text-xs text-gray-400">
          <div>
            Permanent: {tokenInfo.totals.permanentUsed.toLocaleString()} / {tokenInfo.totals.permanentBudget.toLocaleString()}
            {tokenInfo.totals.overPermanent && <span className="text-red-400 ml-1">(over)</span>}
          </div>
          <div>
            Reserved for reply: {tokenInfo.totals.reservedForResponse.toLocaleString()} tokens
          </div>
        </div>
        {(tokenInfo.totals.overTotal || tokenInfo.totals.overPermanent) && (
          <p className="mt-2 text-red-400 text-xs md:text-sm">Reduce description/personality/notes or greeting to fit within the limits for your plan.</p>
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
            
            return (
              <button
                key={option.id}
                onClick={() => setVisibility(option.id)}
                className={`p-4 md:p-6 rounded-2xl border-2 transition-all duration-200 text-left hover:bg-gray-800/30 ${
                  isSelected 
                    ? 'border-[#FF7A00] bg-[#FF7A00]/10' 
                    : 'border-gray-600 bg-gray-800/20'
                }`}
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
                  </div>
                </div>
              </button>
            );
          })}
        </div>

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
          className="bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/80 hover:from-[#FF7A00]/90 hover:to-[#FF7A00]/70 text-white px-8 md:px-12 py-2.5 md:py-3 text-base md:text-lg font-bold shadow-lg order-1 sm:order-2"
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
