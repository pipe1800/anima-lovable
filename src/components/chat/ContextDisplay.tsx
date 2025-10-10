import React, { useState, useMemo, useCallback } from 'react';
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
import { capitalizeText, isCharacterRelevantContext } from '@/lib/utils/textFormatting';
import { convertDatabaseContextToTrackedContext, hasValidContext, DatabaseContext } from '@/utils/contextConverter';
import type { TrackedContext as ChatTrackedContext } from '@/types/chat';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type ContextAddonKey = keyof Pick<
  ChatTrackedContext,
  | 'moodTracking'
  | 'clothingInventory'
  | 'locationTracking'
  | 'timeAndWeather'
  | 'relationshipStatus'
  | 'characterPosition'
  | 'enchantmentStatus'
  | 'itemInventory'
>;

type ContextUpdates = Partial<Record<ContextAddonKey, { previous: string; current: string }>>;
type AddonSettings = Partial<Record<ContextAddonKey, boolean>>;

interface ContextDisplayProps {
  context?: ChatTrackedContext;
  contextUpdates?: ContextUpdates;
  currentContext?: ChatTrackedContext | DatabaseContext;
  addonSettings?: AddonSettings;
  className?: string;
  // New: optional right-aligned actions to render on the same line as the toggle
  rightActions?: React.ReactNode;
}

interface ContextItem {
  label: string;
  value: string;
  key: ContextAddonKey;
  isEnabled: boolean;
  isHistorical: boolean;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  bgColor: string;
  relationshipStage?: RelationshipStageMeta;
}

interface RelationshipStageMeta {
  percent?: number | null;
  ready?: boolean;
}

// Context addon configuration with beautiful styling
const contextAddonConfig: Array<{
  label: string;
  key: ContextAddonKey;
  addonKey: ContextAddonKey;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  bgColor: string;
}> = [
  {
    label: 'Mood Tracking',
    key: 'moodTracking',
    addonKey: 'moodTracking',
    icon: Brain,
    gradient: 'from-pink-500 to-violet-500',
    bgColor: 'bg-pink-500/10 border-pink-500/20',
  },
  {
    label: 'Clothing Inventory',
    key: 'clothingInventory',
    addonKey: 'clothingInventory',
    icon: Shirt,
    gradient: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    label: 'Location Tracking',
    key: 'locationTracking',
    addonKey: 'locationTracking',
    icon: MapPin,
    gradient: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10 border-green-500/20',
  },
  {
    label: 'Time & Weather',
    key: 'timeAndWeather',
    addonKey: 'timeAndWeather',
    icon: CloudSun,
    gradient: 'from-orange-500 to-yellow-500',
    bgColor: 'bg-orange-500/10 border-orange-500/20',
  },
  {
    label: 'Relationship Status',
    key: 'relationshipStatus',
    addonKey: 'relationshipStatus',
    icon: Heart,
    gradient: 'from-red-500 to-pink-500',
    bgColor: 'bg-red-500/10 border-red-500/20',
  },
  {
    label: 'Character Position',
    key: 'characterPosition',
    addonKey: 'characterPosition',
    icon: User,
    gradient: 'from-purple-500 to-indigo-500',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
  },
  {
    label: 'Enchantment Status',
    key: 'enchantmentStatus',
    addonKey: 'enchantmentStatus',
    icon: Sparkles,
    gradient: 'from-fuchsia-500 to-pink-500',
    bgColor: 'bg-fuchsia-500/10 border-fuchsia-500/20',
  },
  {
    label: 'Item Inventory',
    key: 'itemInventory',
    addonKey: 'itemInventory',
    icon: Activity,
    gradient: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
  },
];

const DEFAULT_TRACKED_CONTEXT: ChatTrackedContext = {
  moodTracking: 'No context',
  clothingInventory: 'No context',
  locationTracking: 'No context',
  timeAndWeather: 'No context',
  relationshipStatus: 'No context',
  characterPosition: 'No context',
  enchantmentStatus: 'No context',
  itemInventory: 'No context',
};

const getAddonEnabled = (settings: AddonSettings | undefined, key: ContextAddonKey): boolean => {
  if (!settings) return true;
  return Boolean(settings[key]);
};

const sanitizeValue = (value: string | null | undefined): string | null => {
  if (!value || value === 'No context') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const ContextDisplay: React.FC<ContextDisplayProps> = ({
  context,
  contextUpdates,
  currentContext,
  addonSettings,
  className = '',
  rightActions,
}) => {
  const [relationshipProgress] = useState<RelationshipStageMeta | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const effectiveContext = currentContext ?? context ?? null;

  const normalizedEffective = useMemo<ChatTrackedContext | null>(() => {
    if (!effectiveContext) return null;
    return convertDatabaseContextToTrackedContext(effectiveContext) ?? DEFAULT_TRACKED_CONTEXT;
  }, [effectiveContext]);

  const contextItems = useMemo<ContextItem[]>(() => {
    const toItem = (
      config: (typeof contextAddonConfig)[number],
      rawValue: string | null | undefined,
      isEnabled: boolean,
      markHistorical: boolean,
    ): ContextItem | null => {
      const usable = sanitizeValue(rawValue);

      if (usable && isCharacterRelevantContext(config.addonKey, usable)) {
        return {
          label: config.label,
          value: capitalizeText(usable),
          key: config.key,
          isEnabled,
          isHistorical: markHistorical && !isEnabled,
          icon: config.icon,
          gradient: config.gradient,
          bgColor: config.bgColor,
        };
      }

      if (isEnabled) {
        return {
          label: config.label,
          value: 'No context yet',
          key: config.key,
          isEnabled: true,
          isHistorical: false,
          icon: config.icon,
          gradient: config.gradient,
          bgColor: config.bgColor,
        };
      }

      return null;
    };

    const items: ContextItem[] = [];

    if (normalizedEffective) {
      for (const config of contextAddonConfig) {
        const enabled = getAddonEnabled(addonSettings, config.addonKey);
        const rawValue = normalizedEffective[config.key];
        const item = toItem(config, rawValue, enabled, false);
        if (item) items.push(item);
      }
      return items.map((item) =>
        item.key === 'relationshipStatus'
          ? {
              ...item,
              relationshipStage: relationshipProgress ?? undefined,
            }
          : item,
      );
    }

    if (contextUpdates && Object.keys(contextUpdates).length > 0) {
      for (const config of contextAddonConfig) {
        const enabled = getAddonEnabled(addonSettings, config.addonKey);
        const update = contextUpdates[config.addonKey];
  const item = toItem(config, update?.current, enabled, true);
        if (item) items.push(item);
      }
      return items;
    }

    if (context) {
      for (const config of contextAddonConfig) {
        const enabled = getAddonEnabled(addonSettings, config.addonKey);
        const rawValue = context[config.addonKey];
  const item = toItem(config, rawValue, enabled, true);
        if (item) items.push(item);
      }
      return items;
    }

    if (addonSettings) {
      for (const config of contextAddonConfig) {
        if (getAddonEnabled(addonSettings, config.addonKey)) {
          items.push({
            label: config.label,
            value: 'No context yet',
            key: config.key,
            isEnabled: true,
            isHistorical: false,
            icon: config.icon,
            gradient: config.gradient,
            bgColor: config.bgColor,
          });
        }
      }
    }

    return items;
  }, [addonSettings, context, contextUpdates, normalizedEffective, relationshipProgress]);

  const hasEnabledAddons = useMemo(() => {
    if (!addonSettings) return true;
    return contextAddonConfig.some((config) => getAddonEnabled(addonSettings, config.addonKey));
  }, [addonSettings]);

  const shouldRender = hasEnabledAddons || hasValidContext(effectiveContext) || hasValidContext(context) || Boolean(contextUpdates && Object.keys(contextUpdates).length);

  const renderRelationshipProgress = useCallback((stage?: RelationshipStageMeta) => {
    const pctBase = stage?.percent ?? null;
    if (pctBase === null || pctBase === undefined) return null;

    const pctDisplay = Math.round(Math.max(0, Math.min(1, pctBase)) * 100);
    const ready = stage?.ready ?? false;
    const barColor = pctDisplay >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-red-500 via-yellow-500 to-green-500';

    return (
      <div className="mt-2">
        <div className="flex justify-between text-[10px] uppercase tracking-wide mb-1 text-slate-400">
          <span>Stage Progress</span>
          <span className={ready ? 'text-green-400' : 'text-slate-400'}>
            {pctDisplay}%{ready ? ' Ready' : ''}
          </span>
        </div>
        <div className="h-2 rounded bg-slate-700/60 overflow-hidden relative">
          <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${pctDisplay}%` }} />
          {pctDisplay === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-500 tracking-wide">
              —
            </div>
          )}
        </div>
      </div>
    );
  }, []);

  if (!shouldRender) {
    return null;
  }

  const enabledContextCount = contextItems.filter((item) => item.isEnabled && item.value !== 'No context yet').length;
  const totalEnabledAddons = contextItems.filter((item) => item.isEnabled).length;

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
