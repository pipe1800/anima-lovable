
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, MessageCircle, Heart, Sparkles, Globe, Link, Lock, Loader2 } from 'lucide-react';
import { getUserPersonas, type Persona } from '@/lib/persona-operations';
import { getUserActiveSubscription } from '@/lib/supabase-queries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface FinalizeStepProps {
  data: any;
  onUpdate: (data: any) => void;
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
  const [enableNSFW, setEnableNSFW] = useState(data.nsfw_enabled || false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(data.default_persona_id || 'none');
  const [userPlan, setUserPlan] = useState<string>('Guest Pass');
  const [nsfwTag, setNsfwTag] = useState<{ id: number; name: string } | null>(null);

  const { user } = useAuth();

  // Check if user is premium (True Fan or Whale)
  const isPremiumUser = () => {
    return userPlan === 'True Fan' || userPlan === 'The Whale';
  };

  // Load user's personas, subscription, and NSFW tag
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userPersonas = await getUserPersonas();
        setPersonas(userPersonas);

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
      setSelectedPersonaId(data.default_persona_id || 'none');
      
      // Check if NSFW tag exists in selected tags to determine initial NSFW state
      const hasNSFWTag = selectedTags.some(tag => tag.name.toLowerCase() === 'nsfw');
      setEnableNSFW(data.nsfw_enabled || hasNSFWTag);
    }
  }, [data, selectedTags]);

  const visibilityOptions = [
    {
      id: 'public' as VisibilityType,
      title: 'Public',
      description: 'Visible to everyone on the Discover page.',
      icon: Globe,
    },
    {
      id: 'unlisted' as VisibilityType,
      title: 'Unlisted',
      description: 'Only accessible with a direct link.',
      icon: Link,
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

    const nsfwTagIndex = selectedTags.findIndex(tag => tag.name.toLowerCase() === 'nsfw');
    
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
      default_persona_id: selectedPersonaId === 'none' ? null : selectedPersonaId
    });
    onFinalize();
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="mb-6 md:mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 md:mb-4">
          {isEditing ? 'Update Your Character' : 'Unleash Your Creation'}
        </h2>
        <p className="text-gray-400 text-base md:text-lg">
          {isEditing 
            ? 'Review your changes and update your character!'
            : 'Configure your character\'s visibility and launch them into the world!'
          }
        </p>
      </div>

      {/* Character Summary Card */}
      <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl border border-[#FF7A00]/20 overflow-hidden mb-6 md:mb-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#FF7A00]/20 to-transparent p-4 md:p-6 border-b border-[#FF7A00]/20">
          <div className="flex items-center space-x-3 md:space-x-4">
            <Avatar className="w-16 h-16 md:w-20 md:h-20 border-4 border-[#FF7A00]/50 flex-shrink-0">
              <AvatarImage src={data.avatar} />
              <AvatarFallback className="bg-gray-800 text-gray-400">
                <User className="w-6 h-6 md:w-8 md:h-8" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-2 truncate">{data.name}</h3>
              <p className="text-gray-300 text-sm md:text-base line-clamp-2">{data.description}</p>
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="p-4 md:p-6 space-y-6 md:space-y-8">
          {/* Personality Section */}
          <div>
            <div className="flex items-center space-x-2 mb-3 md:mb-4">
              <Heart className="w-4 h-4 md:w-5 md:h-5 text-[#FF7A00]" />
              <h4 className="text-lg md:text-xl font-semibold text-white">Personality</h4>
            </div>
            
            <div className="space-y-3 md:space-y-4">
              {data.personality?.tags?.length > 0 && (
                <div>
                  <Label className="text-gray-400 text-xs md:text-sm mb-2 block">Personality Tags</Label>
                  <div className="flex flex-wrap gap-1.5 md:gap-2">
                    {data.personality.tags.map((tag: string) => (
                      <Badge key={tag} className="bg-[#FF7A00]/20 text-[#FF7A00] border border-[#FF7A00]/30 text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {data.personality?.core_personality && (
                <div>
                  <Label className="text-gray-400 text-xs md:text-sm mb-2 block">Core Personality</Label>
                  <p className="text-white text-xs md:text-sm bg-gray-800/30 rounded-lg p-3 leading-relaxed">
                    {data.personality.core_personality.substring(0, 150)}
                    {data.personality.core_personality.length > 150 && '...'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Dialogue Section */}
          <div>
            <div className="flex items-center space-x-2 mb-3 md:mb-4">
              <MessageCircle className="w-4 h-4 md:w-5 md:h-5 text-[#FF7A00]" />
              <h4 className="text-lg md:text-xl font-semibold text-white">Dialogue & Voice</h4>
            </div>
            
            <div className="space-y-3 md:space-y-4">
              <div>
                <Label className="text-gray-400 text-xs md:text-sm mb-2 block">Opening Greeting</Label>
                <div className="bg-gray-800/30 rounded-lg p-3 md:p-4 border-l-4 border-[#FF7A00]">
                  <p className="text-white italic text-xs md:text-sm leading-relaxed">"{data.dialogue?.greeting}"</p>
                </div>
              </div>
              
              {data.dialogue?.example_dialogues?.length > 0 && (
                <div>
                  <Label className="text-gray-400 text-xs md:text-sm mb-2 block">Example Dialogues</Label>
                  <div className="space-y-3">
                    {data.dialogue.example_dialogues.slice(0, 1).map((dialogue: any, index: number) => (
                      <div key={index} className="space-y-2">
                        <div className="bg-blue-500/10 rounded-lg p-2.5 md:p-3 border border-blue-500/20">
                          <p className="text-blue-400 text-xs font-medium mb-1">User:</p>
                          <p className="text-white text-xs md:text-sm">"{dialogue.user}"</p>
                        </div>
                        <div className="bg-[#FF7A00]/10 rounded-lg p-2.5 md:p-3 border border-[#FF7A00]/20">
                          <p className="text-[#FF7A00] text-xs font-medium mb-1">Character:</p>
                          <p className="text-white text-xs md:text-sm">"{dialogue.character}"</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
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

        {/* Default Persona */}
        <div className="bg-gray-800/30 rounded-xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
          <div>
            <Label className="text-white text-base md:text-lg font-medium block mb-2">
              Default Persona
            </Label>
            <p className="text-gray-400 text-xs md:text-sm mb-3 md:mb-4">
              Choose a persona that users will interact with by default when chatting with this character
            </p>
            <Select value={selectedPersonaId} onValueChange={setSelectedPersonaId}>
              <SelectTrigger className="w-full bg-gray-700/50 border-gray-600 text-white h-9 md:h-10">
                <SelectValue placeholder="Select a persona (optional)" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="none" className="text-gray-300">No default persona</SelectItem>
                {personas.map((persona) => (
                  <SelectItem key={persona.id} value={persona.id} className="text-white">
                    {persona.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

      {/* Success Message */}
      <div className="text-center mb-6 md:mb-8">
        <div className="inline-flex items-center space-x-2 text-[#FF7A00] mb-3 md:mb-4">
          <Sparkles className="w-5 h-5 md:w-6 md:h-6" />
          <span className="text-lg md:text-xl font-semibold">
            {isEditing ? 'Ready to Update!' : 'Ready to Launch!'}
          </span>
          <Sparkles className="w-5 h-5 md:w-6 md:h-6" />
        </div>
        <p className="text-gray-400 text-sm md:text-base">
          {isEditing 
            ? 'Your character updates are ready to be saved!'
            : 'Your character is complete and ready to interact with users. Launch when you\'re ready!'
          }
        </p>
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
