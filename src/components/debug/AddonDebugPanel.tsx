import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Bug, RefreshCw, AlertTriangle, MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';
import { supabase } from '@/integrations/supabase/client';

interface AddonDebugPanelProps {
  characterId?: string;
  userId?: string;
  chatId?: string;
}

export const AddonDebugPanel = ({ characterId, userId, chatId }: AddonDebugPanelProps) => {
  const { user, subscription, refreshSubscription } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [refreshingSubscription, setRefreshingSubscription] = useState(false);
  const [messageStats, setMessageStats] = useState<{
    totalMessages: number;
    aiMessages: number;
    lastSummaryAt: number | null;
    nextSummaryAt: number;
  } | null>(null);
  const { data: globalSettings, isLoading, refetch } = useUserGlobalChatSettings();

  const userPlan = subscription?.plan?.name || 'Guest Pass';
  const effectiveUserId = userId || user?.id;
  const debugEnabled = process.env.NODE_ENV === 'development';

  // Fetch message statistics for the current chat
  useEffect(() => {
    const fetchMessageStats = async () => {
      if (!chatId || !debugEnabled) {
        setMessageStats(null);
        return;
      }

      try {
        // Get total message count and AI message count (excluding placeholders)
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('is_ai_message, content, message_order')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: true });

        if (messagesError) {
          console.error('Debug: Failed to fetch messages:', messagesError);
          return;
        }

        const totalMessages = messages?.length || 0;
        
        // FIXED: Match system logic - exclude placeholders and count correctly
        const realAiMessages = messages?.filter(m => 
          m.is_ai_message === true && 
          !m.content.includes('[PLACEHOLDER]')
        ) || [];

        // Get the most recent auto-summary
        const { data: summaries, error: summariesError } = await supabase
          .from('character_memories')
          .select('message_count, is_auto_summary')
          .eq('chat_id', chatId)
          .eq('is_auto_summary', true)
          .order('message_count', { ascending: false })
          .limit(1);

        if (summariesError) {
          console.error('Debug: Failed to fetch summaries:', summariesError);
        }

        const lastSummaryAt = summaries?.[0]?.message_count || 0;
        
        // Count AI messages after last summary (matching system logic)
        const aiMessagesAfterSummary = realAiMessages.filter(m => 
          m.message_order > lastSummaryAt
        );
        
        const currentAiCount = aiMessagesAfterSummary.length;
        const nextSummaryAt = lastSummaryAt + 15; // Next 15 AI messages after last summary

        console.log('🔧 Debug Panel - FIXED Counter:', {
          totalMessages,
          totalAiMessages: realAiMessages.length,
          lastSummaryAt,
          aiMessagesAfterSummary: currentAiCount,
          nextSummaryAt,
          messagesUntilSummary: 15 - currentAiCount
        });

        setMessageStats({
          totalMessages,
          aiMessages: currentAiCount, // Show unsummarized AI messages
          lastSummaryAt,
          nextSummaryAt
        });
      } catch (error) {
        console.error('Debug: Error fetching message stats:', error);
      }
    };

    fetchMessageStats();
  }, [chatId, debugEnabled]);

  // Check for subscription issues
  const hasSubscriptionIssue = user && !subscription;
  const isPlanMismatch = subscription?.plan?.name && !['Guest Pass', 'True Fan', 'The Whale'].includes(subscription.plan.name);

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

  if (!debugEnabled || !effectiveUserId) {
    return null;
  }

  // Calculate global settings stats
  const globalAddonStats = globalSettings ? {
    totalEnabled: Object.values({
      dynamicWorldInfo: globalSettings.dynamic_world_info,
      enhancedMemory: globalSettings.enhanced_memory,
      moodTracking: globalSettings.mood_tracking,
      clothingInventory: globalSettings.clothing_inventory,
      locationTracking: globalSettings.location_tracking,
      timeAndWeather: globalSettings.time_and_weather,
      relationshipStatus: globalSettings.relationship_status,
      characterPosition: globalSettings.character_position,
      chainOfThought: globalSettings.chain_of_thought,
      fewShotExamples: globalSettings.few_shot_examples,
    }).filter(Boolean).length,
    hasPremiumFeatures: globalSettings.enhanced_memory || globalSettings.chain_of_thought,
  } : null;

  return (
    <Card className="mb-4 border-orange-500/20 bg-orange-950/10">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-orange-950/20 transition-colors">
            <CardTitle className="text-sm flex items-center justify-between text-orange-400">
              <div className="flex items-center space-x-2">
                <Bug className="w-4 h-4" />
                <span>Global Settings Debug Panel</span>
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
                  size="sm"
                  variant="outline"
                  onClick={handleRefreshSubscription}
                  disabled={refreshingSubscription}
                  className="mt-2 border-red-400 text-red-400 hover:bg-red-900/30"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${refreshingSubscription ? 'animate-spin' : ''}`} />
                  Refresh Subscription
                </Button>
              </div>
            )}

            {/* Plan Mismatch Warning */}
            {isPlanMismatch && (
              <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-400 font-medium text-sm">Unknown Plan Detected</span>
                </div>
                <p className="text-amber-300 text-xs mt-1">
                  Plan "{subscription?.plan?.name}" is not recognized. Expected: Guest Pass, True Fan, or The Whale.
                </p>
              </div>
            )}

            {/* User Info */}
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-3">
              <h4 className="text-blue-400 font-medium text-sm mb-2">User Information</h4>
              <div className="text-xs space-y-1">
                <div className="text-blue-300">User ID: <span className="text-blue-100">{effectiveUserId}</span></div>
                <div className="text-blue-300">Plan: <span className="text-blue-100">{userPlan}</span></div>
                {characterId && (
                  <div className="text-blue-300">Character ID: <span className="text-blue-100">{characterId}</span></div>
                )}
              </div>
            </div>

            {/* Global Settings */}
            <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-green-400 font-medium text-sm">Global Settings</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetch()}
                  disabled={isLoading}
                  className="border-green-400 text-green-400 hover:bg-green-900/30 h-6 px-2"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              
              {isLoading ? (
                <div className="text-green-300 text-xs">Loading global settings...</div>
              ) : globalSettings ? (
                <div className="text-xs space-y-1">
                  <div className="text-green-300">Settings Loaded: <span className="text-green-100">✓</span></div>
                  {globalAddonStats && (
                    <>
                      <div className="text-green-300">Active Addons: <span className="text-green-100">{globalAddonStats.totalEnabled}</span></div>
                      <div className="text-green-300">Has Premium Features: <span className="text-green-100">{globalAddonStats.hasPremiumFeatures ? 'Yes' : 'No'}</span></div>
                    </>
                  )}
                  <div className="mt-2 pt-2 border-t border-green-700/40">
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className="text-green-300">Dynamic World Info: <span className="text-green-100">{globalSettings.dynamic_world_info ? '✓' : '✗'}</span></div>
                      <div className="text-green-300">Enhanced Memory: <span className="text-green-100">{globalSettings.enhanced_memory ? '✓' : '✗'}</span></div>
                      <div className="text-green-300">Mood Tracking: <span className="text-green-100">{globalSettings.mood_tracking ? '✓' : '✗'}</span></div>
                      <div className="text-green-300">Clothing/Inventory: <span className="text-green-100">{globalSettings.clothing_inventory ? '✓' : '✗'}</span></div>
                      <div className="text-green-300">Location Tracking: <span className="text-green-100">{globalSettings.location_tracking ? '✓' : '✗'}</span></div>
                      <div className="text-green-300">Time & Weather: <span className="text-green-100">{globalSettings.time_and_weather ? '✓' : '✗'}</span></div>
                      <div className="text-green-300">Relationship Status: <span className="text-green-100">{globalSettings.relationship_status ? '✓' : '✗'}</span></div>
                      <div className="text-green-300">Character Position: <span className="text-green-100">{globalSettings.character_position ? '✓' : '✗'}</span></div>
                      <div className="text-green-300">Chain of Thought: <span className="text-green-100">{globalSettings.chain_of_thought ? '✓' : '✗'}</span></div>
                      <div className="text-green-300">Few Shot Examples: <span className="text-green-100">{globalSettings.few_shot_examples ? '✓' : '✗'}</span></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-green-300 text-xs">No global settings found (using defaults)</div>
              )}
            </div>

            {/* Message Count Statistics - Only show if we have a chatId */}
            {chatId && messageStats && (
              <div className="bg-purple-900/20 border border-purple-700/40 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <MessageCircle className="w-4 h-4 text-purple-400" />
                  <h4 className="text-purple-400 font-medium text-sm">Message-Based Auto-Summary Status</h4>
                </div>
                
                <div className="text-xs space-y-1">
                  <div className="text-purple-300">Total Messages: <span className="text-purple-100">{messageStats.totalMessages}</span></div>
                  <div className="text-purple-300">AI Messages After Last Summary: <span className="text-purple-100">{messageStats.aiMessages}</span></div>
                  <div className="text-purple-300">Last Summary At Message: <span className="text-purple-100">{messageStats.lastSummaryAt || 'None'}</span></div>
                  <div className="text-purple-300">Next Summary At Message: <span className="text-purple-100">{messageStats.nextSummaryAt}</span></div>
                  <div className="text-purple-300">AI Messages Until Summary: <span className="text-purple-100">{Math.max(0, 15 - messageStats.aiMessages)}</span></div>
                  
                  <div className="mt-2 pt-2 border-t border-purple-700/40">
                    <div className="text-xs text-purple-300">
                      Auto-summaries trigger every 15 AI responses. Counter shows unsummarized AI messages only.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
