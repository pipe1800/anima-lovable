import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Bug, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserCharacterAddonSettings, getAddonStats, validateAddonSettings, type AddonSettings } from '@/lib/user-addon-operations';

interface AddonDebugPanelProps {
  characterId?: string;
  userId?: string;
}

export const AddonDebugPanel = ({ characterId, userId }: AddonDebugPanelProps) => {
  const { user, subscription, refreshSubscription } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [addonSettings, setAddonSettings] = useState<AddonSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshingSubscription, setRefreshingSubscription] = useState(false);

  const userPlan = subscription?.plan?.name || 'Guest Pass';
  const effectiveUserId = userId || user?.id;
  const debugEnabled = process.env.NODE_ENV === 'development';

  // Check for subscription issues
  const hasSubscriptionIssue = user && !subscription;
  const isPlanMismatch = subscription?.plan?.name && !['Guest Pass', 'True Fan', 'The Whale'].includes(subscription.plan.name);

  const loadAddonSettings = async () => {
    if (!effectiveUserId || !characterId) return;
    
    setLoading(true);
    try {
      const settings = await getUserCharacterAddonSettings(effectiveUserId, characterId);
      setAddonSettings(settings);
    } catch (error) {
      console.error('Debug: Failed to load addon settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshSubscription = async () => {
    setRefreshingSubscription(true);
    try {
      await refreshSubscription();
    } catch (error) {
      console.error('Debug: Failed to refresh subscription:', error);
    } finally {
      setRefreshingSubscription(false);
    }
  };

  useEffect(() => {
    if (isOpen && effectiveUserId && characterId) {
      loadAddonSettings();
    }
  }, [isOpen, effectiveUserId, characterId]);

  if (!debugEnabled || !effectiveUserId) {
    return null;
  }

  const stats = addonSettings ? getAddonStats(addonSettings) : null;
  const validation = addonSettings ? validateAddonSettings(addonSettings, userPlan) : null;

  return (
    <Card className="mb-4 border-orange-500/20 bg-orange-950/10">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-orange-950/20 transition-colors">
            <CardTitle className="text-sm flex items-center justify-between text-orange-400">
              <div className="flex items-center space-x-2">
                <Bug className="w-4 h-4" />
                <span>Addon Debug Panel</span>
                <Badge variant="outline" className="border-orange-400 text-orange-400 text-xs">
                  DEV
                </Badge>
                {hasSubscriptionIssue && (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Subscription Issue Warning */}
            {hasSubscriptionIssue && (
              <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 font-medium text-sm">Subscription Loading Issue</span>
                </div>
                <p className="text-red-300 text-xs mt-1">
                  User is authenticated but subscription data failed to load. This causes addon restrictions.
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefreshSubscription}
                  disabled={refreshingSubscription}
                  className="border-red-400 text-red-400 hover:bg-red-400 hover:text-black mt-2"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${refreshingSubscription ? 'animate-spin' : ''}`} />
                  Retry Subscription
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-sm space-y-1">
                <p className="text-gray-300">User ID: <code className="text-orange-400">{effectiveUserId}</code></p>
                <p className="text-gray-300">Character ID: <code className="text-orange-400">{characterId || 'Not selected'}</code></p>
                <p className="text-gray-300">
                  Subscription: 
                  <Badge 
                    variant="outline" 
                    className={hasSubscriptionIssue 
                      ? "border-red-400 text-red-400 ml-2" 
                      : "border-blue-400 text-blue-400 ml-2"
                    }
                  >
                    {userPlan}
                  </Badge>
                </p>
                {subscription && (
                  <>
                    <p className="text-gray-300">Status: <code className="text-green-400">{subscription.status}</code></p>
                    <p className="text-gray-300">Plan ID: <code className="text-gray-400">{subscription.plan_id}</code></p>
                  </>
                )}
              </div>
              <div className="flex flex-col space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadAddonSettings}
                  disabled={loading || !characterId}
                  className="border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-black"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  Refresh Addons
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefreshSubscription}
                  disabled={refreshingSubscription}
                  className="border-blue-400 text-blue-400 hover:bg-blue-400 hover:text-black"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${refreshingSubscription ? 'animate-spin' : ''}`} />
                  Refresh Sub
                </Button>
              </div>
            </div>

            {addonSettings && stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-orange-400">Addon Statistics</h4>
                  <div className="bg-gray-900/50 p-3 rounded-lg text-xs space-y-1">
                    <p>Active Addons: <span className="text-green-400">{stats.activeCount}</span></p>
                    <p>Total Cost: <span className="text-yellow-400">+{stats.totalCost}%</span></p>
                    <p>Stateful Tracking: <span className="text-blue-400">{stats.statefulCount}/5</span></p>
                    <p>Premium Features: <span className={stats.hasPremiumFeatures ? 'text-purple-400' : 'text-gray-500'}>{stats.hasPremiumFeatures ? 'Yes' : 'No'}</span></p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-orange-400">Active Addons</h4>
                  <div className="bg-gray-900/50 p-3 rounded-lg text-xs">
                    {stats.activeAddons.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {stats.activeAddons.map(addon => (
                          <Badge key={addon} variant="outline" className="border-green-400 text-green-400 text-xs">
                            {addon}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">No active addons</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {validation && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-orange-400">Validation</h4>
                <div className="bg-gray-900/50 p-3 rounded-lg text-xs">
                  <p className="flex items-center space-x-2">
                    <span>Status:</span>
                    <Badge 
                      variant="outline" 
                      className={validation.valid 
                        ? 'border-green-400 text-green-400' 
                        : 'border-red-400 text-red-400'
                      }
                    >
                      {validation.valid ? 'Valid' : 'Invalid'}
                    </Badge>
                  </p>
                  {validation.errors.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-red-400">Errors:</p>
                      {validation.errors.map((error, index) => (
                        <p key={index} className="text-red-300 text-xs">• {error}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {characterId && (
              <div className="border-t border-gray-700/50 pt-4">
                <p className="text-xs text-gray-500">
                  This debug panel shows addon state for testing subscription restrictions and cost calculations.
                  Only visible in development mode.
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};