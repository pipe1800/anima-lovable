import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  User, 
  MessageCircle, 
  Heart, 
  Sparkles, 
  Globe, 
  Link, 
  Lock, 
  Loader2, 
  ArrowLeft,
  Eye,
  EyeOff,
  Shield,
  Rocket
} from 'lucide-react';
import { getUserPersonas, type Persona } from '@/lib/persona-operations';
import { getUserActiveSubscription } from '@/lib/supabase-queries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

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

const FinalizeStep = ({ 
  data, 
  onUpdate, 
  onFinalize, 
  onPrevious, 
  isCreating = false, 
  isEditing = false, 
  selectedTags, 
  setSelectedTags 
}: FinalizeStepProps) => {
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
          setUserPlan(subscription?.plan?.name || 'Guest Pass');
        }

        // Fetch NSFW tag
        const { data: tags } = await supabase
          .from('tags')
          .select('*')
          .eq('name', 'NSFW')
          .single();
        
        if (tags) {
          setNsfwTag(tags);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };

    loadUserData();
  }, [user]);

  // Handle NSFW toggle
  useEffect(() => {
    if (enableNSFW && nsfwTag) {
      // Add NSFW tag if not already present
      if (!selectedTags.some(tag => tag.id === nsfwTag.id)) {
        setSelectedTags(prev => [...prev, nsfwTag]);
      }
    } else if (nsfwTag) {
      // Remove NSFW tag if present
      setSelectedTags(prev => prev.filter(tag => tag.id !== nsfwTag.id));
    }
  }, [enableNSFW, nsfwTag, selectedTags, setSelectedTags]);

  // Update parent component when settings change
  useEffect(() => {
    onUpdate({
      visibility,
      nsfw_enabled: enableNSFW,
      default_persona_id: selectedPersonaId === 'none' ? null : selectedPersonaId
    });
  }, [visibility, enableNSFW, selectedPersonaId, onUpdate]);

  const handleFinalize = () => {
    onUpdate({
      visibility,
      nsfw_enabled: enableNSFW,
      default_persona_id: selectedPersonaId === 'none' ? null : selectedPersonaId
    });
    onFinalize();
  };

  const getVisibilityIcon = (type: VisibilityType) => {
    switch (type) {
      case 'public': return <Globe className="w-4 h-4" />;
      case 'unlisted': return <Link className="w-4 h-4" />;
      case 'private': return <Lock className="w-4 h-4" />;
    }
  };

  const getVisibilityDescription = (type: VisibilityType) => {
    switch (type) {
      case 'public': return 'Anyone can discover and chat with this character';
      case 'unlisted': return 'Only people with the link can access this character';
      case 'private': return 'Only you can chat with this character';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            {isEditing ? 'Update Character' : 'Launch Your Character'}
          </h2>
          <p className="text-gray-400 text-sm md:text-base max-w-2xl mx-auto">
            Review your character details and configure privacy settings before {isEditing ? 'updating' : 'launching'}.
          </p>
        </div>

        {/* Character Preview */}
        <Card className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border-[#FF7A00]/20 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#FF7A00]/20 to-transparent p-6 border-b border-[#FF7A00]/20">
            <div className="flex items-center space-x-4">
              <Avatar className="w-16 h-16 md:w-20 md:h-20 border-4 border-[#FF7A00]/50 flex-shrink-0">
                <AvatarImage src={data.avatar} />
                <AvatarFallback className="bg-gray-800 text-gray-400">
                  <User className="w-8 h-8" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl md:text-2xl font-bold text-white mb-2 truncate">{data.name}</h3>
                <p className="text-gray-300 text-sm md:text-base line-clamp-2">{data.description}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Personality */}
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Heart className="w-5 h-5 text-[#FF7A00]" />
                <h4 className="text-lg font-semibold text-white">Personality</h4>
              </div>
              
              <div className="space-y-4">
                {selectedTags.length > 0 && (
                  <div>
                    <Label className="text-gray-400 text-sm mb-2 block">Personality Tags</Label>
                    <div className="flex flex-wrap gap-2">
                      {selectedTags.map((tag) => (
                        <Badge 
                          key={tag.id} 
                          className="bg-[#FF7A00]/20 text-[#FF7A00] border-[#FF7A00]/30 text-xs"
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {data.personality?.core_personality && (
                  <div>
                    <Label className="text-gray-400 text-sm mb-2 block">Core Description</Label>
                    <p className="text-white text-sm bg-gray-800/30 rounded-lg p-3 leading-relaxed">
                      {data.personality.core_personality.substring(0, 200)}
                      {data.personality.core_personality.length > 200 && '...'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Dialogue Preview */}
            {data.dialogue?.greeting && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <MessageCircle className="w-5 h-5 text-[#FF7A00]" />
                  <h4 className="text-lg font-semibold text-white">Opening Greeting</h4>
                </div>
                <div className="bg-gray-800/30 rounded-lg p-4">
                  <p className="text-white text-sm italic">"{data.dialogue.greeting}"</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Visibility Settings */}
          <Card className="bg-[#1a1a2e] border-gray-700/50 p-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Eye className="w-5 h-5 text-[#FF7A00]" />
                <h4 className="text-lg font-semibold text-white">Visibility</h4>
              </div>
              
              <Select value={visibility} onValueChange={(value: VisibilityType) => setVisibility(value)}>
                <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="public" className="text-white hover:bg-gray-700">
                    <div className="flex items-center space-x-2">
                      <Globe className="w-4 h-4" />
                      <span>Public</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="unlisted" className="text-white hover:bg-gray-700">
                    <div className="flex items-center space-x-2">
                      <Link className="w-4 h-4" />
                      <span>Unlisted</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="private" className="text-white hover:bg-gray-700">
                    <div className="flex items-center space-x-2">
                      <Lock className="w-4 h-4" />
                      <span>Private</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              <p className="text-gray-400 text-xs">
                {getVisibilityDescription(visibility)}
              </p>
            </div>
          </Card>

          {/* Content Settings */}
          <Card className="bg-[#1a1a2e] border-gray-700/50 p-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-[#FF7A00]" />
                <h4 className="text-lg font-semibold text-white">Content Settings</h4>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-white text-sm font-medium">NSFW Content</Label>
                  <p className="text-gray-400 text-xs mt-1">
                    Allow mature content in conversations
                  </p>
                </div>
                <Switch
                  checked={enableNSFW}
                  onCheckedChange={setEnableNSFW}
                  className="data-[state=checked]:bg-[#FF7A00]"
                />
              </div>

              {personas.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-white text-sm font-medium">Default Persona</Label>
                  <Select value={selectedPersonaId} onValueChange={setSelectedPersonaId}>
                    <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-600">
                      <SelectItem value="none" className="text-white hover:bg-gray-700">
                        No Default Persona
                      </SelectItem>
                      {personas.map((persona) => (
                        <SelectItem key={persona.id} value={persona.id} className="text-white hover:bg-gray-700">
                          {persona.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Ready to Launch */}
        <Card className="bg-gradient-to-br from-green-900/20 to-blue-900/20 border-green-700/30 p-6 text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Sparkles className="w-6 h-6 text-green-400" />
            <h4 className="text-xl font-bold text-white">
              {isEditing ? 'Ready to Update!' : 'Ready to Launch!'}
            </h4>
            <Rocket className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-gray-400 text-sm">
            {isEditing 
              ? 'Your character updates are ready to be saved!'
              : 'Your character is complete and ready to interact with users. Launch when you\'re ready!'
            }
          </p>
        </Card>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 pt-6 border-t border-gray-700/50">
          <Button
            onClick={onPrevious}
            variant="outline"
            className="border-gray-600 text-gray-300 hover:bg-gray-800/50 px-6 py-3 text-base order-2 sm:order-1"
            disabled={isCreating}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          <Button
            onClick={handleFinalize}
            className={cn(
              "px-8 py-3 text-base font-bold shadow-lg order-1 sm:order-2",
              "bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/80",
              "hover:from-[#FF7A00]/90 hover:to-[#FF7A00]/70",
              "text-white"
            )}
            disabled={isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {isEditing ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                {isEditing ? 'Update Character' : 'Save & Launch'}
                <Sparkles className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FinalizeStep;
