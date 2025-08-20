import React, { useState } from 'react';
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
              {contextItems.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {contextItems.map((item) => {
                    const IconComponent = item.icon;
                    const hasContext = item.value !== 'No context yet';
                    
                    return (
                      <div
                        key={item.key}
                        className={`relative overflow-hidden rounded-lg border transition-all duration-200 hover:scale-[1.02] ${
                          hasContext 
                            ? `${item.bgColor} hover:shadow-lg` 
                            : 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600/50'
                        }`}
                      >
                        <div className="p-3">
                          <div className="flex items-start gap-3">
                            <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center ${
                              hasContext 
                                ? `bg-gradient-to-r ${item.gradient}` 
                                : 'bg-slate-700'
                            }`}>
                              <IconComponent className={`w-4 h-4 ${hasContext ? 'text-white' : 'text-slate-400'}`} />
                              {hasContext && (
                                <div className="absolute inset-0 bg-gradient-to-r ${item.gradient} opacity-20 rounded-lg" />
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-sm font-medium ${
                                  hasContext ? 'text-white' : 'text-slate-400'
                                }`}>
                                  {item.label}
                                </span>
                                {hasContext && (
                                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                                )}
                              </div>
                              
                              <p className={`text-sm break-words ${
                                hasContext 
                                  ? 'text-slate-200 font-medium' 
                                  : 'text-slate-500 italic'
                              }`}>
                                {item.value}
                              </p>
                              
                              {item.isHistorical && (
                                <Badge variant="outline" className="mt-1 text-xs bg-orange-500/20 border-orange-500/30 text-orange-300">
                                  Historical
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Subtle gradient overlay for active items */}
                        {hasContext && (
                          <div className={`absolute inset-0 bg-gradient-to-r ${item.gradient} opacity-5 pointer-events-none`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800 flex items-center justify-center">
                    <Eye className="w-6 h-6 text-slate-500" />
                  </div>
                  <p className="text-sm text-slate-400 mb-1">No Context Tracking Enabled</p>
                  <p className="text-xs text-slate-500">Enable addons in settings to start tracking character details</p>
                </div>
              )}
              
              {/* Context Statistics */}
              {contextItems.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-700/50">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-blue-400" />
                        <span className="text-slate-400">
                          {enabledContextCount} tracked
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-green-400" />
                        <span className="text-slate-400">
                          {totalEnabledAddons} enabled
                        </span>
                      </div>
                    </div>
                    
                    {enabledContextCount > 0 && (
                      <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5 animate-pulse" />
                        Active Tracking
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};