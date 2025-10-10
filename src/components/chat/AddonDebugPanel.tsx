import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info } from 'lucide-react';
import type { AddonToggleState } from '@/types/chatSettings';

interface AddonDebugPanelProps {
  addonSettings?: AddonToggleState | null;
  characterId: string;
  userId: string;
  userPlan: string;
}

const STATEFUL_ADDONS: Array<keyof AddonToggleState> = [
  'moodTracking',
  'clothingInventory',
  'locationTracking',
  'timeAndWeather',
  'relationshipStatus',
];

export const AddonDebugPanel = ({ addonSettings, characterId, userId, userPlan }: AddonDebugPanelProps) => {
  const [isVisible, setIsVisible] = React.useState(false);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const resolvedSettings: AddonToggleState | null = addonSettings ?? null;
  const addonKeys = resolvedSettings
    ? (Object.keys(resolvedSettings) as Array<keyof AddonToggleState>)
    : [];

  const activeAddons = addonKeys.filter((key) => !!resolvedSettings?.[key]);

  const activeStatefulCount = STATEFUL_ADDONS.filter((key) => !!resolvedSettings?.[key]).length;
  const addonEntries = addonKeys.map((key) => ({ key, value: !!resolvedSettings?.[key] }));

  return (
    <Card className="bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800">
      <div className="p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsVisible(!isVisible)}
          className="w-full justify-between text-yellow-700 dark:text-yellow-300"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">Debug: Addon Settings</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {activeAddons.length} active
          </Badge>
        </Button>

        {isVisible && (
          <div className="mt-3 space-y-2 border-t border-yellow-200 dark:border-yellow-800 pt-3">
            <div className="text-xs space-y-1">
              <div><strong>User Plan:</strong> {userPlan}</div>
              <div><strong>Character ID:</strong> {characterId}</div>
              <div><strong>User ID:</strong> {userId}</div>
              <div><strong>Active Stateful Addons:</strong> {activeStatefulCount}/2 (Guest Pass limit)</div>
            </div>
            
            <div className="text-xs space-y-1">
              <strong>Addon States:</strong>
              <div className="grid grid-cols-2 gap-1">
                {addonEntries.map(({ key, value }) => (
                  <div key={key} className="flex justify-between">
                    <span className="truncate">{key}:</span>
                    <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                      {value ? 'ON' : 'OFF'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded">
              <Info className="w-3 h-3 inline mr-1" />
              This debug panel only appears in development mode
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};