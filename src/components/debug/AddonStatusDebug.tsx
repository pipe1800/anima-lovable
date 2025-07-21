import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AddonStatusDebugProps {
  characterId: string;
}

export const AddonStatusDebug = ({ characterId }: AddonStatusDebugProps) => {
  const { user } = useAuth();
  const { data: globalSettings, isLoading } = useUserGlobalChatSettings();

  if (isLoading) {
    return <div>Loading global settings...</div>;
  }

  if (!globalSettings) {
    return <div>No global settings found (using defaults)</div>;
  }

  const addonList = [
    { key: 'mood_tracking', label: 'Mood Tracking' },
    { key: 'clothing_inventory', label: 'Clothing Inventory' },
    { key: 'location_tracking', label: 'Location Tracking' },
    { key: 'time_and_weather', label: 'Time & Weather' },
    { key: 'relationship_status', label: 'Relationship Status' },
    { key: 'character_position', label: 'Character Position' },
    { key: 'dynamic_world_info', label: 'Dynamic World Info' },
    { key: 'enhanced_memory', label: 'Enhanced Memory' },
    { key: 'chain_of_thought', label: 'Chain of Thought' },
    { key: 'few_shot_examples', label: 'Few Shot Examples' },
  ];

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Global Settings Debug</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            Character ID: {characterId} (Note: Now using global settings)
          </div>
          <div className="text-sm text-muted-foreground">
            User ID: {user?.id}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {addonList.map((addon) => (
              <div key={addon.key} className="flex items-center justify-between">
                <span className="text-sm">{addon.label}:</span>
                <Badge variant={globalSettings[addon.key as keyof typeof globalSettings] ? 'default' : 'secondary'}>
                  {globalSettings[addon.key as keyof typeof globalSettings] ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};