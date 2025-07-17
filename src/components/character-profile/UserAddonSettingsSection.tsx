import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Settings, 
  BookOpen, 
  BrainCircuit, 
  Smile, 
  Shirt, 
  MapPin, 
  Cloud, 
  Heart, 
  Lightbulb, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserActiveSubscription } from '@/lib/supabase-queries';
import { useToast } from '@/hooks/use-toast';
import { 
  getUserCharacterAddonSettings, 
  saveUserCharacterAddonSettings, 
  calculateAddonCreditCost,
  type AddonSettings as AddonData 
} from '@/lib/user-addon-operations';


interface UserAddonSettingsSectionProps {
  characterId: string;
  onSettingsChange?: (settings: AddonData) => void;
}


interface AddonItemProps {
  icon: React.ElementType;
  title: string;
  description: string;
  creditCost: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  restricted?: boolean;
}

const AddonItem: React.FC<AddonItemProps> = ({
  icon: Icon,
  title,
  description,
  creditCost,
  enabled,
  onToggle,
  disabled = false,
  restricted = false
}) => {
  return (
    <div className={`flex items-start space-x-4 p-4 rounded-lg border ${
      disabled || restricted ? 'opacity-50 bg-muted/50' : 'bg-card'
    } ${enabled && !disabled && !restricted ? 'border-primary' : 'border-border'}`}>
      <div className="flex-shrink-0 mt-1">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-foreground text-sm">{title}</h4>
          {restricted && (
            <Badge variant="destructive" className="text-xs">
              Premium Only
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-2">{description}</p>
        <p className="text-xs font-medium text-primary">{creditCost}</p>
      </div>
      
      <div className="flex-shrink-0">
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={disabled || restricted}
        />
      </div>
    </div>
  );
};

export const UserAddonSettingsSection: React.FC<UserAddonSettingsSectionProps> = ({
  characterId,
  onSettingsChange
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<AddonData>({} as AddonData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [userPlan, setUserPlan] = useState<string>('Guest Pass');
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch user subscription and addon settings
  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        // Fetch user subscription
        const { data: subscription } = await getUserActiveSubscription(user.id);
        setUserPlan(subscription?.plan?.name || 'Guest Pass');

        // Fetch existing addon settings
        const userSettings = await getUserCharacterAddonSettings(user.id, characterId);
        setSettings(userSettings);
      } catch (error) {
        console.error('Error fetching addon settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, characterId]);

  const isPremiumUser = () => {
    return userPlan === 'True Fan' || userPlan === 'The Whale';
  };

  const getSelectedTrackingCount = () => {
    const trackingAddons = ['moodTracking', 'clothingInventory', 'locationTracking', 'timeAndWeather', 'relationshipStatus'];
    return trackingAddons.filter(addon => settings[addon as keyof AddonData]).length;
  };

  const isTrackingAddon = (key: keyof AddonData) => {
    return ['moodTracking', 'clothingInventory', 'locationTracking', 'timeAndWeather', 'relationshipStatus'].includes(key);
  };

  const saveSettings = async (newSettings: AddonData) => {
    if (!user) return;

    setIsSaving(true);
    const result = await saveUserCharacterAddonSettings(user.id, characterId, newSettings);
    
    if (result.success) {
      onSettingsChange?.(newSettings);
      toast({
        title: "Settings Saved",
        description: "Your addon preferences have been updated.",
      });
    } else {
      toast({
        title: "Save Failed",
        description: result.error || "Failed to save addon settings. Please try again.",
        variant: "destructive",
      });
    }
    
    setIsSaving(false);
  };

  const handleToggle = async (key: keyof AddonData, value: boolean) => {
    // Enhanced Memory restriction - only True Fan and Whale
    if (key === 'enhancedMemory' && value && !isPremiumUser()) {
      toast({
        title: "Premium Feature",
        description: "Enhanced Memory requires a True Fan or Whale subscription.",
        variant: "destructive",
      });
      return;
    }

    // Chain-of-Thought restriction - only True Fan and Whale
    if (key === 'chainOfThought' && value && !isPremiumUser()) {
      toast({
        title: "Premium Feature",
        description: "Chain-of-Thought requires a True Fan or Whale subscription.",
        variant: "destructive",
      });
      return;
    }

    // Stateful Character Tracking restriction for Guest Pass - max 2 addons
    if (isTrackingAddon(key) && value && userPlan === 'Guest Pass') {
      const currentCount = getSelectedTrackingCount();
      if (currentCount >= 2) {
        toast({
          title: "Limit Reached",
          description: "Guest Pass users can only enable 2 tracking addons. Upgrade for unlimited access.",
          variant: "destructive",
        });
        return;
      }
    }

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  const calculateTotalCost = () => calculateAddonCreditCost(settings);

  if (!user) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center">
            <Settings className="w-5 h-5 mr-2 text-primary" />
            Your Addon Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">Sign in to customize addon settings for this character</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center">
            <Settings className="w-5 h-5 mr-2 text-primary" />
            Your Addon Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
            <p className="text-muted-foreground">Loading your settings...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center justify-between">
          <div className="flex items-center">
            <Settings className="w-5 h-5 mr-2 text-primary" />
            Your Addon Settings
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          Current plan: <span className="text-primary font-medium">{userPlan}</span>
          {calculateTotalCost() > 0 && (
            <span className="ml-4">
              Total cost increase: <span className="text-primary font-medium">+{calculateTotalCost()}%</span>
            </span>
          )}
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Core Enhancements */}
          <div>
            <h4 className="font-medium text-foreground mb-3">Core Enhancements</h4>
            <div className="space-y-3">
              <AddonItem
                icon={BookOpen}
                title="Dynamic World Info"
                description="Build a 'lorebook' for your character with automatic context injection."
                creditCost="+10% credit cost"
                enabled={settings.dynamicWorldInfo}
                onToggle={(enabled) => handleToggle('dynamicWorldInfo', enabled)}
                disabled={isSaving}
              />
              <AddonItem
                icon={BrainCircuit}
                title="Enhanced Memory"
                description="Long-term memory through conversation summaries."
                creditCost={isPremiumUser() ? "Dynamic cost" : "Requires True Fan or Whale"}
                enabled={settings.enhancedMemory}
                onToggle={(enabled) => handleToggle('enhancedMemory', enabled)}
                disabled={isSaving}
                restricted={!isPremiumUser()}
              />
            </div>
          </div>

          {/* Stateful Character Tracking */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Stateful Character Tracking</h4>
            {userPlan === 'Guest Pass' && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-md p-3 mb-3">
                <p className="text-sm text-orange-400">
                  ⚠️ Free users limited to 2 tracking addons ({getSelectedTrackingCount()}/2 selected)
                </p>
              </div>
            )}
            <div className="space-y-3">
              <AddonItem
                icon={Smile}
                title="Mood Tracking"
                description="Character's emotional state evolves and is remembered."
                creditCost="+5% credit cost"
                enabled={settings.moodTracking}
                onToggle={(enabled) => handleToggle('moodTracking', enabled)}
                disabled={isSaving || (userPlan === 'Guest Pass' && !settings.moodTracking && getSelectedTrackingCount() >= 2)}
              />
              <AddonItem
                icon={Shirt}
                title="Clothing & Inventory"
                description="Tracks what the character is wearing and carrying."
                creditCost="+5% credit cost"
                enabled={settings.clothingInventory}
                onToggle={(enabled) => handleToggle('clothingInventory', enabled)}
                disabled={isSaving || (userPlan === 'Guest Pass' && !settings.clothingInventory && getSelectedTrackingCount() >= 2)}
              />
              <AddonItem
                icon={MapPin}
                title="Location Tracking"
                description="Remembers current location and environment."
                creditCost="+5% credit cost"
                enabled={settings.locationTracking}
                onToggle={(enabled) => handleToggle('locationTracking', enabled)}
                disabled={isSaving || (userPlan === 'Guest Pass' && !settings.locationTracking && getSelectedTrackingCount() >= 2)}
              />
              <AddonItem
                icon={Cloud}
                title="Time & Weather"
                description="Awareness of in-story time and weather conditions."
                creditCost="+5% credit cost"
                enabled={settings.timeAndWeather}
                onToggle={(enabled) => handleToggle('timeAndWeather', enabled)}
                disabled={isSaving || (userPlan === 'Guest Pass' && !settings.timeAndWeather && getSelectedTrackingCount() >= 2)}
              />
              <AddonItem
                icon={Heart}
                title="Relationship Status"
                description="Tracks evolving relationship dynamics."
                creditCost="+5% credit cost"
                enabled={settings.relationshipStatus}
                onToggle={(enabled) => handleToggle('relationshipStatus', enabled)}
                disabled={isSaving || (userPlan === 'Guest Pass' && !settings.relationshipStatus && getSelectedTrackingCount() >= 2)}
              />
            </div>
          </div>

          {/* Advanced Prompting */}
          <div>
            <h4 className="font-medium text-foreground mb-3">Advanced Prompting</h4>
            <div className="space-y-3">
              <AddonItem
                icon={Lightbulb}
                title="Chain-of-Thought"
                description="Improved logic and reasoning for complex scenarios."
                creditCost={isPremiumUser() ? "+30% credit cost" : "Requires True Fan or Whale"}
                enabled={settings.chainOfThought}
                onToggle={(enabled) => handleToggle('chainOfThought', enabled)}
                disabled={isSaving}
                restricted={!isPremiumUser()}
              />
              <AddonItem
                icon={BookOpen}
                title="Few-Shot Examples"
                description="Provide examples to guide AI tone and style."
                creditCost="+7% credit cost"
                enabled={settings.fewShotExamples}
                onToggle={(enabled) => handleToggle('fewShotExamples', enabled)}
                disabled={isSaving}
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};