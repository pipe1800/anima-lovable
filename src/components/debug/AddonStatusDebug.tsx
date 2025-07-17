import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAddonSettings } from '@/components/chat/useAddonSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AddonStatusDebugProps {
  characterId: string;
}

export const AddonStatusDebug = ({ characterId }: AddonStatusDebugProps) => {
  const { user } = useAuth();
  const { data: addonSettings, isLoading } = useAddonSettings(characterId);

  if (isLoading) {
    return <div>Loading addon settings...</div>;
  }

  if (!addonSettings) {
    return <div>No addon settings found</div>;
  }

  const addonList = [
    { key: 'moodTracking', label: 'Mood Tracking' },
    { key: 'clothingInventory', label: 'Clothing Inventory' },
    { key: 'locationTracking', label: 'Location Tracking' },
    { key: 'timeAndWeather', label: 'Time & Weather' },
    { key: 'relationshipStatus', label: 'Relationship Status' },
    { key: 'characterPosition', label: 'Character Position' },
    { key: 'dynamicWorldInfo', label: 'Dynamic World Info' },
    { key: 'chainOfThought', label: 'Chain of Thought' },
    { key: 'fewShotExamples', label: 'Few Shot Examples' },
  ];

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Addon Status Debug</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            Character ID: {characterId}
          </div>
          <div className="text-sm text-muted-foreground">
            User ID: {user?.id}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {addonList.map((addon) => (
              <div key={addon.key} className="flex items-center justify-between">
                <span className="text-sm">{addon.label}:</span>
                <Badge variant={addonSettings[addon.key as keyof typeof addonSettings] ? 'default' : 'secondary'}>
                  {addonSettings[addon.key as keyof typeof addonSettings] ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};