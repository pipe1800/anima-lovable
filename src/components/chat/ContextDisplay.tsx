import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Brain, 
  Shirt, 
  MapPin, 
  CloudSun, 
  Heart, 
  User,
  Sparkles,
  Eye,
  Activity
} from 'lucide-react';
import { capitalizeText, isCharacterRelevantContext, getContextLabel, getAddonKey } from '@/lib/utils/textFormatting';
import { convertDatabaseContextToTrackedContext, hasValidContext } from '@/utils/contextConverter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface TrackedContext {
  moodTracking: string;
  clothingInventory: string;
  locationTracking: string;
  timeAndWeather: string;
  relationshipStatus: string;
  characterPosition: string;
  enchantmentStatus: string; // NEW
  itemInventory: string; // NEW
}

// Database context format (from messages.current_context)
export interface DatabaseContext {
  mood?: string;
  clothing?: string;
  location?: string;
  time_weather?: string;
  relationship?: string;
  character_position?: string;
}

interface ContextDisplayProps {
  context?: TrackedContext;
  contextUpdates?: {
    [key: string]: {
      previous: string;
      current: string;
    };
  };
  currentContext?: TrackedContext | DatabaseContext;
  addonSettings?: {
    moodTracking?: boolean;
    clothingInventory?: boolean;
    locationTracking?: boolean;
    timeAndWeather?: boolean;
    relationshipStatus?: boolean;
    characterPosition?: boolean;
  };
  className?: string;
  // New: optional right-aligned actions to render on the same line as the toggle
  rightActions?: React.ReactNode;
}

interface ContextItem {
  label: string;
  value: string;
  key: string;
  isEnabled: boolean;
  isHistorical: boolean;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  bgColor: string;
}

// Context addon configuration with beautiful styling
const contextAddonConfig = [
  { 
    label: 'Mood Tracking', 
    key: 'moodTracking', 
    addonKey: 'moodTracking',
    icon: Brain,
    gradient: 'from-pink-500 to-violet-500',
    bgColor: 'bg-pink-500/10 border-pink-500/20'
  },
  { 
    label: 'Clothing Inventory', 
    key: 'clothingInventory', 
    addonKey: 'clothingInventory',
    icon: Shirt,
    gradient: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10 border-blue-500/20'
  },
  { 
    label: 'Location Tracking', 
    key: 'locationTracking', 
    addonKey: 'locationTracking',
    icon: MapPin,
    gradient: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10 border-green-500/20'
  },
  { 
    label: 'Time & Weather', 
    key: 'timeAndWeather', 
    addonKey: 'timeAndWeather',
    icon: CloudSun,
    gradient: 'from-orange-500 to-yellow-500',
    bgColor: 'bg-orange-500/10 border-orange-500/20'
  },
  { 
    label: 'Relationship Status', 
    key: 'relationshipStatus', 
    addonKey: 'relationshipStatus',
    icon: Heart,
    gradient: 'from-red-500 to-pink-500',
    bgColor: 'bg-red-500/10 border-red-500/20'
  },
  { 
    label: 'Character Position', 
    key: 'characterPosition', 
    addonKey: 'characterPosition',
    icon: User,
    gradient: 'from-purple-500 to-indigo-500',
    bgColor: 'bg-purple-500/10 border-purple-500/20'
  },
  { 
    label: 'Enchantment Status', 
    key: 'enchantmentStatus', 
    addonKey: 'enchantmentStatus',
    icon: Sparkles,
    gradient: 'from-fuchsia-500 to-pink-500',
    bgColor: 'bg-fuchsia-500/10 border-fuchsia-500/20'
  },
  { 
    label: 'Item Inventory', 
    key: 'itemInventory', 
    addonKey: 'itemInventory',
    icon: Activity,
    gradient: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10 border-amber-500/20'
  },
];

export const ContextDisplay = ({ context, contextUpdates, currentContext, addonSettings, className = '', rightActions }: ContextDisplayProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [relationshipProgress, setRelationshipProgress] = useState<{ percent: number; ready: boolean } | null>(null);
  const [relationshipMeta, setRelationshipMeta] = useState<any>(null);

  // Listen for relationship meta events (both new & legacy)
  useEffect(() => {
    const applyMeta = (incoming: any, source: string) => {
      const meta = incoming?.relationshipMeta ? incoming.relationshipMeta : incoming; // unify shape
      if (!meta || typeof meta !== 'object') return;
      try { console.debug('[ContextDisplay] relationship meta received', { source, meta }); } catch {}
      setRelationshipMeta(meta);
      const pct = typeof meta.stage_progress_percent === 'number'
        ? meta.stage_progress_percent
        : (typeof meta.percent_to_next === 'number' ? meta.percent_to_next : undefined);
      if (typeof pct === 'number') {
        setRelationshipProgress({ percent: Math.max(0, Math.min(1, pct)), ready: !!meta.ready_for_next });
      }
    };
    const handlerNew = (e: any) => applyMeta(e.detail, 'new-event');
    const handlerLegacy = (e: any) => applyMeta(e.detail, 'legacy-event');
    window.addEventListener('relationship-meta-updated', handlerNew);
    window.addEventListener('relationship-meta-updated-legacy', handlerLegacy);
    return () => {
      window.removeEventListener('relationship-meta-updated', handlerNew);
      window.removeEventListener('relationship-meta-updated-legacy', handlerLegacy);
    };
  }, []);

  // Use the most relevant context source
  const effectiveContext = currentContext || context;

  // Process context data into unified format with FIXED KEY MAPPING
  let contextItems: ContextItem[] = [];
  
  // Handle effectiveContext (prioritized) - PRIORITY 1 - UNIVERSAL CONTEXT HANDLING
  if (effectiveContext) {
    // Check if context is already in TrackedContext format or needs conversion
    let workingContext: TrackedContext;
    
    if ('moodTracking' in effectiveContext) {
      // Already in TrackedContext format (from messages.current_context)
      workingContext = effectiveContext as TrackedContext;
    } else {
      // Database format (from chat_context.current_context) - needs conversion
      const convertedContext = convertDatabaseContextToTrackedContext(effectiveContext);
      workingContext = convertedContext || {
        moodTracking: 'No context',
        clothingInventory: 'No context',
        locationTracking: 'No context',
        timeAndWeather: 'No context',
        relationshipStatus: 'No context',
        characterPosition: 'No context',
        enchantmentStatus: 'No context', // NEW
        itemInventory: 'No context' // NEW
      };
    }
    
    contextItems = contextAddonConfig.map(item => {
      const isEnabled = addonSettings ? addonSettings[item.addonKey] : true; // Default to enabled if settings not loaded
      
      // Get context value using both possible formats for maximum compatibility
      let contextValue = null;
      
      if (typeof workingContext === 'object' && workingContext !== null) {
        // Try TrackedContext format first (preferred)
        if ('moodTracking' in workingContext) {
          const trackedContext = workingContext as TrackedContext;
          // Use the key directly since contextAddonConfig keys match TrackedContext properties
          contextValue = (trackedContext as any)[item.key];
        } else {
          // Fallback to raw database format (shouldn't happen after conversion but just in case)
          const dbContext = workingContext as any;
          if (item.key === 'moodTracking') contextValue = dbContext.mood;
          else if (item.key === 'clothingInventory') contextValue = dbContext.clothing;
          else if (item.key === 'locationTracking') contextValue = dbContext.location;
          else if (item.key === 'timeAndWeather') contextValue = dbContext.time_weather;
          else if (item.key === 'relationshipStatus') contextValue = dbContext.relationship;
          else if (item.key === 'characterPosition') contextValue = dbContext.character_position;
        }
      }
      
      // Filter out null, undefined, empty string, and "No context" values
      if (contextValue && contextValue !== 'No context' && contextValue.trim() !== '' && isCharacterRelevantContext(item.addonKey, contextValue)) {
        return {
          label: item.label,
          value: capitalizeText(contextValue),
          key: item.key,
          isEnabled: isEnabled,
          isHistorical: false,
          icon: item.icon,
          gradient: item.gradient,
          bgColor: item.bgColor
        };
      } else if (isEnabled) {
        return {
          label: item.label,
          value: 'No context yet',
          key: item.key,
          isEnabled: true,
          isHistorical: false,
          icon: item.icon,
          gradient: item.gradient,
          bgColor: item.bgColor
        };
      }
      return null as any;
    }).filter(Boolean) as ContextItem[];
  }
  // Handle contextUpdates (from historical messages) - PRIORITY 2
  else if (contextUpdates && Object.keys(contextUpdates).length > 0) {
    contextItems = contextAddonConfig.map(item => {
      const isEnabled = addonSettings ? addonSettings[item.addonKey] : true; // Default to enabled if settings not loaded
      const updateData = (contextUpdates as any)[item.addonKey];
      
      if (updateData && updateData.current !== 'No context' && isCharacterRelevantContext(item.addonKey, updateData.current)) {
        return {
          label: item.label,
          value: capitalizeText(updateData.current),
          key: item.key,
          isEnabled: isEnabled,
          isHistorical: !isEnabled,
          icon: item.icon,
          gradient: item.gradient,
          bgColor: item.bgColor
        };
      } else if (isEnabled) {
        return {
          label: item.label,
          value: 'No context yet',
          key: item.key,
          isEnabled: true,
          isHistorical: false,
          icon: item.icon,
          gradient: item.gradient,
          bgColor: item.bgColor
        };
      }
      return null as any;
    }).filter(Boolean) as ContextItem[];
  }
  // Handle legacy context format - PRIORITY 3
  else if (context) {
    contextItems = contextAddonConfig.map(item => {
      const isEnabled = addonSettings ? addonSettings[item.addonKey] : true; // Default to enabled if settings not loaded
      const contextValue = (context as any)[item.addonKey];
      
      if (contextValue && contextValue !== 'No context' && isCharacterRelevantContext(item.addonKey, contextValue)) {
        return {
          label: item.label,
          value: capitalizeText(contextValue),
          key: item.key,
          isEnabled: isEnabled,
          isHistorical: !isEnabled,
          icon: item.icon,
          gradient: item.gradient,
          bgColor: item.bgColor
        };
      } else if (isEnabled) {
        return {
          label: item.label,
          value: 'No context yet',
          key: item.key,
          isEnabled: true,
          isHistorical: false,
          icon: item.icon,
          gradient: item.gradient,
          bgColor: item.bgColor
        };
      }
      return null as any;
    }).filter(Boolean) as ContextItem[];
  }
  // If no context data but addons are enabled, show all enabled addons with "No context yet"
  else {
    contextItems = contextAddonConfig.map(item => {
      const isEnabled = addonSettings ? addonSettings[item.addonKey] : false;
      if (isEnabled) {
        return {
          label: item.label,
          value: 'No context yet',
          key: item.key,
          isEnabled: true,
          isHistorical: false,
          icon: item.icon,
          gradient: item.gradient,
          bgColor: item.bgColor
        } as ContextItem;
      }
      return null as any;
    }).filter(Boolean) as ContextItem[];
  }

  // Augment contextItems to include progress bar marker for relationshipStatus
  contextItems = contextItems.map(ci => {
    if (ci.key === 'relationshipStatus') {
      return { ...ci, __relationship: true } as any;
    }
    return ci;
  });

  // Check if any stateful addons are enabled (default to true if settings not loaded yet)
  const hasEnabledAddons = !addonSettings || (addonSettings && (
    addonSettings.moodTracking || 
    addonSettings.clothingInventory || 
    addonSettings.locationTracking || 
    addonSettings.timeAndWeather || 
    addonSettings.relationshipStatus ||
    addonSettings.characterPosition
  ));

  // Show context if we have valid context data OR if addons are enabled OR while settings are loading
  const shouldRender = hasEnabledAddons || hasValidContext(effectiveContext) || context || contextUpdates;
  
  // TEMPORARY: Force render if we have any context for debugging
  const hasAnyContext = hasValidContext(effectiveContext) || hasValidContext(context);
  const forceRender = hasAnyContext;
  
  if (!shouldRender && !forceRender) {
    return null;
  }

  // Count enabled context items
  const enabledContextCount = contextItems.filter(item => item.isEnabled && item.value !== 'No context yet').length;
  const totalEnabledAddons = contextItems.filter(item => item.isEnabled).length;

  const renderRelationshipProgress = React.useCallback(() => {
    const pctBase = relationshipMeta && typeof relationshipMeta.stage_progress_percent === 'number'
      ? relationshipMeta.stage_progress_percent
      : (relationshipMeta && typeof relationshipMeta.percent_to_next === 'number'
        ? relationshipMeta.percent_to_next
        : (relationshipProgress ? relationshipProgress.percent : null));
    const ready = relationshipMeta ? !!relationshipMeta.ready_for_next : (relationshipProgress?.ready || false);
    // Show placeholder bar if we have meta but no computed percent yet
    if ((pctBase === null || pctBase === undefined) && !relationshipMeta) return null;
    const pctDisplay = pctBase === null || pctBase === undefined ? 0 : Math.round(Math.max(0, Math.min(1, pctBase)) * 100);
    const barColor = pctDisplay >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-red-500 via-yellow-500 to-green-500';
    return (
      <div className="mt-2">
        <div className="flex justify-between text-[10px] uppercase tracking-wide mb-1 text-slate-400">
          <span>Stage Progress</span>
          <span className={ready ? 'text-green-400' : 'text-slate-400'}>{pctDisplay}%{ready ? ' Ready' : ''}</span>
        </div>
        <div className="h-2 rounded bg-slate-700/60 overflow-hidden relative">
          <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${pctDisplay}%` }} />
          {pctDisplay === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-500 tracking-wide">
              {relationshipMeta ? 'Initializing' : '—'}
            </div>
          )}
        </div>
      </div>
    );
  }, [relationshipProgress, relationshipMeta]);

  return (
    <div className={`${className}`}>
      {/* Modern Context Header */}
      <Card className="bg-gradient-to-r from-slate-900/50 to-slate-800/50 border border-slate-700/50 backdrop-blur-sm">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-3 text-foreground hover:text-blue-400 transition-all duration-200 group"
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Activity className="w-4 h-4 text-white" />
                </div>
                {enabledContextCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-xs text-white font-bold">{enabledContextCount}</span>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">Character Context</span>
                  <Badge variant="outline" className="text-xs bg-blue-500/20 border-blue-500/30 text-blue-300">
                    {enabledContextCount}/{totalEnabledAddons} Active
                  </Badge>
                </div>
                <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                  {enabledContextCount > 0 ? 'AI is tracking character details' : 'Context tracking enabled'}
                </span>
              </div>
              
              <div className="ml-auto flex items-center gap-2">
                {enabledContextCount > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-xs text-green-400">Live</span>
                  </div>
                )}
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>
            
            {rightActions && (
              <div className="flex items-center gap-1 ml-2">{rightActions}</div>
            )}
          </div>

          {/* Expanded Context Items */}
          {isExpanded && (
            <div className="mt-4 space-y-3">
              {contextItems.map(item => (
                <div key={item.key} className={`p-3 rounded-lg border ${item.bgColor} relative transition-all group`}> 
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-md bg-gradient-to-br ${item.gradient} flex items-center justify-center text-white shadow-inner`}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate" title={item.label}>{item.label}</span>
                        {item.isHistorical && (
                          <Badge variant="outline" className="h-4 text-[10px] px-1 py-0 bg-slate-700/40 border-slate-600 text-slate-300">Past</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-300 leading-relaxed whitespace-pre-line break-words">
                        {item.value}
                      </div>
                      {item.key === 'relationshipStatus' && renderRelationshipProgress()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}