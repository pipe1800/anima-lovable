import React, { useState, useEffect } from 'react';
import { 
  Brain, Shirt, MapPin, CloudSun, Heart, User, Sparkles, Activity, Eye, Zap, Settings,
  ChevronLeft, ChevronRight, Box
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { capitalizeText, isCharacterRelevantContext } from '@/lib/utils/textFormatting';
import { convertDatabaseContextToTrackedContext, hasValidContext } from '@/utils/contextConverter';
import { SidebarModeToggle } from './SidebarModeToggle';

export interface TrackedContext {
  moodTracking: string;
  clothingInventory: string;
  locationTracking: string;
  timeAndWeather: string;
  relationshipStatus: string;
  characterPosition: string;
}

export interface DatabaseContext {
  mood?: string;
  clothing?: string;
  location?: string;
  time_weather?: string;
  relationship?: string;
  character_position?: string;
}

interface ContextSidebarProps {
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
  character?: {
    name: string;
    avatar_url?: string;
  };
  onBackToNav: () => void;
  onOpenSettings?: () => void;
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
  isEmpty: boolean;
  addonKey?: string; // added for lookup
}

// Context addon configuration with beautiful styling
const contextAddonConfig = [
  { 
    label: 'Mood & Emotion', 
    key: 'moodTracking', 
    addonKey: 'moodTracking',
    icon: Brain,
    gradient: 'from-pink-500 via-purple-500 to-violet-600',
    bgColor: 'bg-gradient-to-br from-pink-500/10 to-violet-500/10 border-pink-500/20',
    description: 'Current emotional state and feelings'
  },
  { 
    label: 'Clothing & Style', 
    key: 'clothingInventory', 
    addonKey: 'clothingInventory',
    icon: Shirt,
    gradient: 'from-blue-500 via-cyan-500 to-teal-500',
    bgColor: 'bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20',
    description: 'Current outfit and appearance'
  },
  { 
    label: 'Location & Setting', 
    key: 'locationTracking', 
    addonKey: 'locationTracking',
    icon: MapPin,
    gradient: 'from-green-500 via-emerald-500 to-teal-500',
    bgColor: 'bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20',
    description: 'Current location and surroundings'
  },
  { 
    label: 'Time & Weather', 
    key: 'timeAndWeather', 
    addonKey: 'timeAndWeather',
    icon: CloudSun,
    gradient: 'from-orange-500 via-yellow-500 to-amber-500',
    bgColor: 'bg-gradient-to-br from-orange-500/10 to-yellow-500/10 border-orange-500/20',
    description: 'Current time and weather conditions'
  },
  { 
    label: 'Relationship Status', 
    key: 'relationshipStatus', 
    addonKey: 'relationshipStatus',
    icon: Heart,
    gradient: 'from-red-500 via-pink-500 to-rose-500',
    bgColor: 'bg-gradient-to-br from-red-500/10 to-pink-500/10 border-red-500/20',
    description: 'Relationship dynamics and connection'
  },
  { 
    label: 'Physical Position', 
    key: 'characterPosition', 
    addonKey: 'characterPosition',
    icon: User,
    gradient: 'from-purple-500 via-indigo-500 to-blue-600',
    bgColor: 'bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border-purple-500/20',
    description: 'Current posture and physical stance'
  },
  { 
    label: 'Enchantment Status', 
    key: 'enchantmentStatus', 
    addonKey: 'enchantmentStatus',
    icon: Sparkles,
    gradient: 'from-fuchsia-500 via-pink-500 to-red-500',
    bgColor: 'bg-gradient-to-br from-fuchsia-500/10 to-pink-500/10 border-fuchsia-500/20',
    description: 'Active magical effects and enchantments'
  },
  { 
    label: 'Item Inventory', 
    key: 'itemInventory', 
    addonKey: 'itemInventory',
    icon: Box,
    gradient: 'from-amber-500 via-orange-500 to-yellow-500',
    bgColor: 'bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20',
    description: 'Key items currently carried'
  },
];

export const ContextSidebar = ({
  context,
  contextUpdates,
  currentContext,
  addonSettings,
  character,
  onBackToNav,
  onOpenSettings
}: ContextSidebarProps) => {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showHistorical, setShowHistorical] = useState(false);
  
  // Use the most relevant context source
  const effectiveContext = currentContext || context;

  // Process context data into unified format
  let contextItems: ContextItem[] = [];
  
  if (effectiveContext) {
    // Check if context is already in TrackedContext format or needs conversion
    let workingContext: TrackedContext;
    
    if ('moodTracking' in effectiveContext) {
      workingContext = effectiveContext as TrackedContext;
    } else {
      const convertedContext = convertDatabaseContextToTrackedContext(effectiveContext);
      workingContext = convertedContext || {
        moodTracking: 'No context',
        clothingInventory: 'No context',
        locationTracking: 'No context',
        timeAndWeather: 'No context',
        relationshipStatus: 'No context',
        characterPosition: 'No context'
      };
    }

    const resolveEnabled = (rawKey: string) => {
      if (!addonSettings) return true; // default on so user sees placeholders
      const snake = rawKey.replace(/([A-Z])/g, '_$1').toLowerCase();
      // Common alternate names (legacy possibilities)
      const alt: Record<string,string[]> = {
        moodTracking: ['mood_tracking','mood'],
        clothingInventory: ['clothing_inventory','clothing'],
        locationTracking: ['location_tracking','location'],
        timeAndWeather: ['time_and_weather','time_weather','time'],
        relationshipStatus: ['relationship_status','relationship'],
        characterPosition: ['character_position','position']
      };
      const candidates = [rawKey, snake, ...(alt as any)[rawKey] || []];
      for (const k of candidates) {
        if (k in addonSettings) return Boolean((addonSettings as any)[k]);
      }
      return true; // fallback show
    };
    
    contextItems = contextAddonConfig.map(item => {
      const isEnabled = resolveEnabled(item.addonKey);
      const contextValue = (workingContext as any)[item.key];
      const isEmpty = !contextValue || contextValue === 'No context' || (typeof contextValue === 'string' && contextValue.trim() === '');
      return {
        label: item.label,
        value: isEmpty ? 'No context yet' : capitalizeText(contextValue),
        key: item.key,
        isEnabled,
        isHistorical: false,
        icon: item.icon,
        gradient: item.gradient,
        bgColor: item.bgColor,
        isEmpty,
        addonKey: item.addonKey
      };
    });
  } else {
    // Show addons with placeholders using same enabled resolution
    const resolveEnabled = (rawKey: string) => {
      if (!addonSettings) return true;
      const snake = rawKey.replace(/([A-Z])/g, '_$1').toLowerCase();
      const alt: Record<string,string[]> = {
        moodTracking: ['mood_tracking','mood'],
        clothingInventory: ['clothing_inventory','clothing'],
        locationTracking: ['location_tracking','location'],
        timeAndWeather: ['time_and_weather','time_weather','time'],
        relationshipStatus: ['relationship_status','relationship'],
        characterPosition: ['character_position','position']
      };
      const candidates = [rawKey, snake, ...(alt as any)[rawKey] || []];
      for (const k of candidates) {
        if (k in addonSettings) return Boolean((addonSettings as any)[k]);
      }
      return true;
    };
    contextItems = contextAddonConfig.map(item => {
      const isEnabled = resolveEnabled(item.addonKey);
      return {
        label: item.label,
        value: 'No context yet',
        key: item.key,
        isEnabled,
        isHistorical: false,
        icon: item.icon,
        gradient: item.gradient,
        bgColor: item.bgColor,
        isEmpty: true,
        addonKey: item.addonKey
      } as ContextItem;
    });
  }

  // Merge live context with updates (latest message deltas) similar to ContextDisplay capabilities
  if (contextUpdates && Object.keys(contextUpdates).length > 0) {
    contextItems = contextItems.map(item => ({ ...item, addonKey: item.key }));
    contextItems = contextItems.map(item => {
      const update = (contextUpdates as any)[item.key] || (item.addonKey ? (contextUpdates as any)[item.addonKey] : undefined);
      if (update && update.current && update.current !== 'No context') {
        return {
          ...item,
          value: capitalizeText(update.current),
          isHistorical: false,
          isEmpty: false
        };
      }
      return item;
    });
  }

  // Historical (previous) states list if user toggles
  const historicalItems = contextUpdates ? Object.entries(contextUpdates).map(([rawKey, upd]: any) => {
    const config = contextAddonConfig.find(c => c.key === rawKey || c.addonKey === rawKey);
    if (!config) return null;
    if (!upd.previous || upd.previous === 'No context' || upd.previous === upd.current) return null;
    return {
      key: config.key + '_historical',
      label: config.label + ' (Previous)',
      value: capitalizeText(upd.previous),
      icon: config.icon,
      gradient: config.gradient,
      bgColor: config.bgColor,
      isEmpty: false,
      isHistorical: true,
      isEnabled: true,
      addonKey: config.key
    } as ContextItem & { isHistorical: boolean };
  }).filter(Boolean) as any[] : [];

  const hasEnabledAddons = contextItems.length > 0;
  const hasActiveContext = contextItems.some(item => !item.isEmpty);

  // Collapsed state sync with AppSidebar
  const [isCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    const load = () => {
      const saved = localStorage.getItem('sidebarCollapsed');
      if (saved) setIsCollapsed(JSON.parse(saved));
    };
    load();
    const handler = () => load();
    window.addEventListener('sidebarToggled', handler);
    return () => window.removeEventListener('sidebarToggled', handler);
  }, []);

  // Active context count for badge
  const activeContextCount = contextItems.filter(i => !i.isEmpty).length;

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
      window.dispatchEvent(new CustomEvent('sidebarToggled'));
      return newState;
    });
  };

  // Separate enabled vs disabled for ordering; within enabled prioritize those with content
  const enabledItems = contextItems.filter(i => i.isEnabled);
  const disabledItems = contextItems.filter(i => !i.isEnabled);
  enabledItems.sort((a,b) => { const ac = a.isEmpty ? 1 : 0; const bc = b.isEmpty ? 1 : 0; return ac - bc; });
  // Final list for rendering
  const orderedItems = [...enabledItems, ...disabledItems];

  return (
    <div className={`bg-[#1a1a2e] h-full text-white flex flex-col transition-all duration-300 select-none relative z-40 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      <div className="flex flex-col h-full">
        {/* Header with logo (standardized) */}
        <div className="border-b border-gray-700/50 p-4 relative">
          <div className="flex items-center justify-center">
            {isCollapsed ? (
              <img src="/assets/logo_emblem.png" alt="A" className="h-8 w-8" />
            ) : (
              <img src="/assets/logo.png" alt="Anima AI Chat" className="h-16 w-auto" />
            )}
          </div>
          {/* Collapse button (standardized) */}
          <button
            onClick={toggleSidebar}
            className="absolute -right-3 top-1/2 -translate-y-1/2 bg-[#1a1a2e] border border-gray-700 rounded-full p-1 hover:bg-[#FF7A00]/20 transition-colors z-50"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>

        {/* Body */}
        <div className="px-1 py-4 flex-1 flex flex-col overflow-hidden">
          {/* Mode Toggle (shared component) */}
          <SidebarModeToggle
            isCollapsed={isCollapsed}
            activeMode={'context'}
            onSelect={(mode) => {
              if (mode === 'navigation') onBackToNav();
            }}
            contextCount={activeContextCount}
            className="mb-4 mx-1"
          />

          {/* Context Items List */}
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="space-y-2">
              {/* Toggle for historical */}
              {historicalItems.length > 0 && (
                <div className="">
                  <button
                    onClick={() => setShowHistorical(s => !s)}
                    className="w-full text-xs text-left px-3 py-2 rounded-md bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 flex items-center justify-between"
                  >
                    <span className="text-gray-300">{showHistorical ? 'Hide' : 'Show'} Previous States</span>
                    <span className="text-[10px] text-[#FF7A00] font-medium">{historicalItems.length}</span>
                  </button>
                </div>
              )}
              {!hasEnabledAddons ? (
                <div className="text-center py-8">
                  <Eye className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-sm mb-2">No context addons enabled</p>
                  <p className="text-gray-500 text-xs">Enable context tracking in settings to see character state</p>
                  {onOpenSettings && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onOpenSettings}
                      className="mt-3 border-gray-600 text-gray-300 hover:bg-gray-800"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Open Settings
                    </Button>
                  )}
                </div>
              ) : (
                orderedItems.map((item) => {
                  const IconComponent = item.icon;
                  const isExpanded = expandedCard === item.key;
                  const config = contextAddonConfig.find(c => c.key === item.key);
                  const hasContent = !item.isEmpty;
                  const isDisabled = !item.isEnabled;
                  
                  return (
                    <div
                      key={item.key}
                      className={`group relative overflow-hidden rounded-xl border transition-all duration-500 cursor-pointer ${
                        isDisabled
                          ? 'opacity-50 grayscale bg-slate-900/40 border-slate-700/30 hover:border-slate-600/40'
                          : hasContent 
                            ? 'bg-gradient-to-br from-slate-900/60 via-slate-800/40 to-slate-900/60 border-slate-600/40 hover:border-slate-500/60 shadow-lg hover:shadow-xl' 
                            : 'bg-slate-900/30 border-slate-700/30 hover:border-slate-600/50'
                      } ${isExpanded ? 'ring-2 ring-[#FF7A00]/60 shadow-[0_0_30px_rgba(255,122,0,0.3)]' : ''}`}
                      onClick={() => setExpandedCard(isExpanded ? null : item.key)}
                    >
                      {hasContent && !isDisabled && (
                        <div className={`absolute inset-0 opacity-5 bg-gradient-to-br ${item.gradient} group-hover:opacity-10 transition-opacity duration-500`} />
                      )}
                      {hasContent && !isDisabled && (
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      )}
                      <div className="relative p-4">
                        <div className="flex items-start gap-2">
                          <div className={`relative flex-shrink-0 ${
                            hasContent && !isDisabled
                              ? `w-8 h-8 rounded-lg bg-gradient-to-br ${item.gradient} shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all duration-300` 
                              : 'w-7 h-7 rounded-md bg-slate-700/60 group-hover:bg-slate-600/60 transition-colors duration-300'
                          } flex items-center justify-center`}>
                            <IconComponent className={`${hasContent ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-white/90 drop-shadow-sm`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="mb-1">
                              <h3 className={`font-medium ${hasContent ? 'text-white' : 'text-slate-400'} text-xs leading-tight tracking-wide`}>{item.label}</h3>
                            </div>
                            <div className={`text-xs ${
                              hasContent 
                                ? 'text-slate-200 font-medium leading-snug' 
                                : 'text-slate-600 italic'
                            } ${isExpanded ? 'line-clamp-none' : 'line-clamp-2'}`}>
                              {hasContent ? (
                                <span className="relative">
                                  {item.value}
                                  {!isExpanded && item.value.length > 40 && (
                                    <span className="text-slate-400 ml-1">...</span>
                                  )}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Zap className="w-2.5 h-2.5 text-slate-600" />
                                  {isDisabled ? 'Disabled' : 'No data'}
                                </span>
                              )}
                            </div>
                            {isExpanded && hasContent && config && !isDisabled && (
                              <div className="mt-2 pt-2 border-t border-slate-600/30">
                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                  {config.description || 'Character context information'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {showHistorical && historicalItems.length > 0 && (
                <div className="pt-2 border-t border-gray-700/50 space-y-2">
                  {historicalItems.map(item => {
                    const IconComponent = item.icon;
                    return (
                      <div 
                        key={item.key}
                        className="bg-gray-900/40 border border-gray-700/50 rounded-lg p-2"
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${item.gradient} opacity-60 flex items-center justify-center flex-shrink-0`}> 
                            <IconComponent className="w-3 h-3 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="text-xs font-medium text-gray-300 leading-tight">{item.label}</h4>
                              <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/10 border border-orange-500/30 text-orange-300 rounded uppercase tracking-wide">Prev</span>
                            </div>
                            <p className="text-xs text-gray-400 line-clamp-2 leading-snug">
                              {item.value}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
