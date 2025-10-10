import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ComponentType, FC } from 'react';
import {
  Brain,
  Shirt,
  MapPin,
  CloudSun,
  Heart,
  User,
  Sparkles,
  Activity,
  Eye,
  Zap,
  Settings,
  ChevronLeft,
  ChevronRight,
  Box,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { capitalizeText, isCharacterRelevantContext } from '@/lib/utils/textFormatting';
import { convertDatabaseContextToTrackedContext, hasValidContext } from '@/utils/contextConverter';
import { SidebarModeToggle } from './SidebarModeToggle';
import { useAuth } from '@/contexts/AuthContext';
import logger from '@/utils/logger';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface TrackedContext {
  moodTracking: string;
  clothingInventory: string;
  locationTracking: string;
  timeAndWeather: string;
  relationshipStatus: string;
  characterPosition: string;
  enchantmentStatus?: string;
  itemInventory?: string;
}

export interface DatabaseContext {
  mood?: string;
  clothing?: string;
  location?: string;
  time_weather?: string;
  relationship?: string;
  character_position?: string;
  enchantment_status?: string;
  item_inventory?: string;
}

interface ContextUpdateEntry {
  previous: string;
  current: string;
}

type ContextUpdates = Record<string, ContextUpdateEntry>;

interface ContextSidebarProps {
  context?: TrackedContext;
  contextUpdates?: ContextUpdates;
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
    id?: string; // added id for RPCs
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
  icon: ComponentType<{ className?: string }>;
  gradient: string;
  bgColor: string;
  isEmpty: boolean;
  addonKey?: keyof TrackedContext; // added for lookup
}

interface RelationshipGoal {
  order?: number;
  label?: string;
  threshold?: number;
}

interface RelationshipGoalsTemplate {
  enabled?: boolean;
  path?: RelationshipGoal[];
}

interface RelationshipTemplateRow {
  relationship_goals?: RelationshipGoalsTemplate | null;
}

interface RelationshipProgressState {
  active_order?: number;
  current_score?: number;
  invitation_status?: string | null;
  ready_for_next?: boolean;
  next_stage_label?: string | null;
  _next_stage_label?: string | null;
  total_stages?: number;
  path_length?: number;
  pending_regression?: boolean;
  regression_candidate_order?: number | null;
  regression_prompt_asked?: boolean;
  skipped?: boolean;
  state?: {
    invitation_status?: string | null;
    ready_for_next?: boolean;
    [key: string]: unknown;
  };
  _invitationJustIssued?: boolean;
  _invitationAcceptanceProcessed?: boolean;
  relationship?: string | null;
  relationship_line?: string | null;
  [key: string]: unknown;
}

interface RelationshipProgressRow {
  state: RelationshipProgressState | null;
}

type RelationshipMeta = Record<string, unknown>;

// Context addon configuration with beautiful styling
interface ContextAddonDefinition {
  label: string;
  key: keyof TrackedContext;
  addonKey: keyof TrackedContext;
  icon: ComponentType<{ className?: string }>;
  gradient: string;
  bgColor: string;
  description?: string;
}

const contextAddonConfig: ContextAddonDefinition[] = [
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

const ADDON_KEY_ALIASES: Partial<Record<keyof TrackedContext, string[]>> = {
  moodTracking: ['mood_tracking', 'mood'],
  clothingInventory: ['clothing_inventory', 'clothing'],
  locationTracking: ['location_tracking', 'location'],
  timeAndWeather: ['time_and_weather', 'time_weather', 'time'],
  relationshipStatus: ['relationship_status', 'relationship'],
  characterPosition: ['character_position', 'position'],
  enchantmentStatus: ['enchantment_status'],
  itemInventory: ['item_inventory', 'inventory'],
};

export const ContextSidebar = ({
  context,
  contextUpdates,
  currentContext,
  addonSettings,
  character,
  onBackToNav,
  onOpenSettings
}: ContextSidebarProps) => {
  const { user, supabase: authSupabase } = useAuth();
  const log = useMemo(() => logger.scoped('ContextSidebar'), []);

  const safeSetSession = useCallback(
    (key: string, value: string) => {
      if (typeof window === 'undefined') return;
      try {
        sessionStorage.setItem(key, value);
      } catch (error) {
        log.warn(`Failed to persist sessionStorage key ${key}`, error);
      }
    },
    [log],
  );

  const safeGetSession = useCallback(
    (key: string): string | null => {
      if (typeof window === 'undefined') return null;
      try {
        return sessionStorage.getItem(key);
      } catch (error) {
        log.warn(`Failed to read sessionStorage key ${key}`, error);
        return null;
      }
    },
    [log],
  );
  // Restore missing state & helper component
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showHistorical, setShowHistorical] = useState(false);
  const ForceReadyAction: FC<{ meta: RelationshipMeta }> = () => null; // no-op placeholder (real action handled elsewhere)

  // NEW: pre-chat relationship stage label (visual only)
  const [preChatRelationshipLabel, setPreChatRelationshipLabel] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && character?.id) {
      try { return sessionStorage.getItem(`relLabel:${character.id}`) || null; } catch { return null; }
    }
    return null;
  });
  const [relationshipReady, setRelationshipReady] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined' && character?.id) {
      try {
        const v = sessionStorage.getItem(`relReady:${character.id}`);
        if (v === '1') return true; if (v === '0') return false; return null;
      } catch { return null; }
    }
    return null;
  });
  useEffect(() => {
    let cancelled = false;

    const hydrateRelationshipMeta = async () => {
      if (preChatRelationshipLabel && relationshipReady !== null) return;
      if (!character?.id || !user?.id) return;

      try {
        const { data: tmplRow, error: tmplErr } = await authSupabase
          .from('character_latent_profiles')
          .select('relationship_goals')
          .eq('character_id', character.id)
          .maybeSingle();

        if (tmplErr) {
          log.warn('Failed to load relationship template', tmplErr);
          return;
        }

        const template = (tmplRow as RelationshipTemplateRow | null)?.relationship_goals;
        const path = template && Array.isArray(template.path) ? template.path : [];
        if (!path.length) return;

        const { data: progRow } = await authSupabase
          .from('user_character_relationship_progress')
          .select('state')
          .eq('user_id', user.id)
          .eq('character_id', character.id)
          .maybeSingle();

        const progressRow = progRow as RelationshipProgressRow | null;

        let label = preChatRelationshipLabel;
        let readyFlag = relationshipReady;

        if (progressRow?.state) {
          const state = progressRow.state;
          const activeOrder = Number(
            state.active_order ?? (state as Record<string, unknown>).activeOrder ?? 1,
          );
          const goal = path.find(
            (item): item is RelationshipGoal => !!item && (item.order ?? 0) === activeOrder,
          );
          if (!label && goal?.label) label = goal.label;
          if (readyFlag === null && typeof state.ready_for_next === 'boolean') {
            readyFlag = state.ready_for_next;
          }
        } else {
          if (!label) {
            const first = [...path].sort(
              (a, b) => (a?.order ?? 0) - (b?.order ?? 0),
            )[0];
            if (first?.label) label = first.label;
          }
          if (readyFlag === null) readyFlag = false;
        }

        if (!cancelled) {
          if (label && !preChatRelationshipLabel) {
            setPreChatRelationshipLabel(label);
            safeSetSession(`relLabel:${character.id}`, label);
          }
          if (readyFlag !== null && relationshipReady === null) {
            setRelationshipReady(readyFlag);
            safeSetSession(`relReady:${character.id}`, readyFlag ? '1' : '0');
          }
        }
      } catch (error) {
        log.warn('Failed to hydrate relationship metadata', error);
      }
    };

    hydrateRelationshipMeta();

    return () => {
      cancelled = true;
    };
  }, [authSupabase, character?.id, log, preChatRelationshipLabel, relationshipReady, safeSetSession, user?.id]);

  // Listen for relationship meta events (mirrors ContextDisplay)
  useEffect(() => {
    if (!character?.id || !user?.id) return;

    const channel = authSupabase
      .channel(`rel_progress_${user.id}_${character.id}`)
      .on<RelationshipProgressRow>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_character_relationship_progress',
          filter: `user_id=eq.${user.id},character_id=eq.${character.id}`,
        },
        async (payload: RealtimePostgresChangesPayload<RelationshipProgressRow>) => {
          const newRow = (payload.new ?? null) as RelationshipProgressRow | null;
          const newState = newRow?.state ?? null;
          if (!newState) return;

          if (typeof newState.ready_for_next === 'boolean') {
            setRelationshipReady((prev) => {
              if (prev === newState.ready_for_next) return prev;
              safeSetSession(`relReady:${character.id}`, newState.ready_for_next ? '1' : '0');
              return newState.ready_for_next;
            });
          }

          const activeOrder = Number(
            newState.active_order ?? (newState as Record<string, unknown>).activeOrder ?? 1,
          );
          const cachedStage = safeGetSession(`relStageOrder:${character.id}`);
          if (String(activeOrder) === cachedStage) return;

          try {
            const { data: tmplRow } = await authSupabase
              .from('character_latent_profiles')
              .select('relationship_goals')
              .eq('character_id', character.id)
              .maybeSingle();
            const templatePath = (tmplRow as RelationshipTemplateRow | null)?.relationship_goals?.path;
            if (Array.isArray(templatePath)) {
              const goal = templatePath.find(
                (item): item is RelationshipGoal =>
                  !!item && (item.order ?? 0) === activeOrder,
              );
              if (goal?.label) {
                setPreChatRelationshipLabel(goal.label);
                safeSetSession(`relLabel:${character.id}`, goal.label);
                safeSetSession(`relStageOrder:${character.id}`, String(activeOrder));
              }
            }
          } catch (templateError) {
            log.warn('Failed to refresh relationship template', templateError);
          }
        },
      )
      .subscribe();

    return () => {
      try {
        authSupabase.removeChannel(channel);
      } catch (removeError) {
        log.warn('Failed to remove Supabase channel', removeError);
      }
    };
  }, [authSupabase, character?.id, log, safeGetSession, safeSetSession, user?.id]);

  // Use the most relevant context source
  const effectiveContext = currentContext || context;

  // Process context data into unified format
  let contextItems: ContextItem[] = [];
  
  if (effectiveContext) {
    const emptyContext: TrackedContext = {
      moodTracking: 'No context',
      clothingInventory: 'No context',
      locationTracking: 'No context',
      timeAndWeather: 'No context',
      relationshipStatus: 'No context',
      characterPosition: 'No context',
      enchantmentStatus: 'No context',
      itemInventory: 'No context',
    };

    let workingContext: TrackedContext = emptyContext;

    if ('moodTracking' in effectiveContext) {
      const tracked = effectiveContext as TrackedContext & DatabaseContext;
      workingContext = { ...tracked };
      const rawRelationship = tracked.relationship;
      if (
        (!workingContext.relationshipStatus || workingContext.relationshipStatus === 'No context') &&
        typeof rawRelationship === 'string' &&
        rawRelationship.trim()
      ) {
        workingContext = { ...workingContext, relationshipStatus: rawRelationship };
      }
    } else {
      const convertedContext = convertDatabaseContextToTrackedContext(effectiveContext);
      workingContext = convertedContext ?? emptyContext;
    }

    const resolveEnabled = (rawKey: keyof TrackedContext): boolean => {
      if (!addonSettings) return true;
      const snake = rawKey.replace(/([A-Z])/g, '_$1').toLowerCase();
      const aliases = ADDON_KEY_ALIASES[rawKey] ?? [];
      const candidates = [rawKey, snake, ...aliases];
      for (const key of candidates) {
        if (key in addonSettings) {
          const candidateKey = key as keyof TrackedContext;
          return Boolean(addonSettings[candidateKey]);
        }
      }
      return true;
    };

    contextItems = contextAddonConfig.map((item) => {
      const isEnabled = resolveEnabled(item.addonKey);
      let displayValue = workingContext[item.key] ?? 'No context';
      if (
        item.key === 'relationshipStatus' &&
        (!displayValue || displayValue === 'No context' || displayValue.trim() === '') &&
        preChatRelationshipLabel
      ) {
        displayValue = preChatRelationshipLabel;
      }
      const isEmpty = !displayValue || displayValue === 'No context' || displayValue.trim() === '';
      const valueText = isEmpty ? 'No context yet' : capitalizeText(displayValue);
      return {
        label: item.label,
        value: valueText,
        key: item.key,
        isEnabled,
        isHistorical: false,
        icon: item.icon,
        gradient: item.gradient,
        bgColor: item.bgColor,
        isEmpty,
        addonKey: item.addonKey,
      };
    });
  } else {
    const resolveEnabled = (rawKey: keyof TrackedContext): boolean => {
      if (!addonSettings) return true;
      const snake = rawKey.replace(/([A-Z])/g, '_$1').toLowerCase();
      const aliases = ADDON_KEY_ALIASES[rawKey] ?? [];
      const candidates = [rawKey, snake, ...aliases];
      for (const key of candidates) {
        if (key in addonSettings) {
          const candidateKey = key as keyof TrackedContext;
          return Boolean(addonSettings[candidateKey]);
        }
      }
      return true;
    };

    contextItems = contextAddonConfig.map((item) => {
      const isEnabled = resolveEnabled(item.addonKey);
      const valueText =
        item.key === 'relationshipStatus' && preChatRelationshipLabel
          ? preChatRelationshipLabel
          : 'No context yet';
      return {
        label: item.label,
        value: valueText,
        key: item.key,
        isEnabled,
        isHistorical: false,
        icon: item.icon,
        gradient: item.gradient,
        bgColor: item.bgColor,
        isEmpty: !preChatRelationshipLabel || item.key !== 'relationshipStatus',
        addonKey: item.addonKey,
      };
    });
  }

  // Merge live context with updates (latest message deltas) similar to ContextDisplay capabilities
  if (contextUpdates && Object.keys(contextUpdates).length > 0) {
    contextItems = contextItems.map((item) => {
      const update =
        contextUpdates[item.key] ??
        (item.addonKey ? contextUpdates[item.addonKey] : undefined);
      if (update && update.current && update.current !== 'No context') {
        return {
          ...item,
          value: capitalizeText(update.current),
          isHistorical: false,
          isEmpty: false,
        };
      }
      return item;
    });
  }

  // Historical (previous) states list if user toggles
  const historicalItems: ContextItem[] = contextUpdates
    ? Object.entries(contextUpdates).reduce<ContextItem[]>((acc, [rawKey, upd]) => {
        if (!upd.previous || upd.previous === 'No context' || upd.previous === upd.current) {
          return acc;
        }
        const config = contextAddonConfig.find((c) => {
          if (c.key === rawKey) return true;
          if (c.addonKey === rawKey) return true;
          const aliases = ADDON_KEY_ALIASES[c.key] ?? [];
          return aliases.includes(rawKey);
        });
        if (!config) return acc;
        acc.push({
          label: `${config.label} (Previous)`,
          value: capitalizeText(upd.previous),
          key: `${config.key}-historical`,
          isEnabled: true,
          isHistorical: true,
          icon: config.icon,
          gradient: config.gradient,
          bgColor: config.bgColor,
          isEmpty: false,
          addonKey: config.addonKey,
        });
        return acc;
      }, [])
    : [];

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
  // Force relationship card first
  const relIdx = orderedItems.findIndex(i => i.key === 'relationshipStatus');
  if (relIdx > 0) {
    const [relItem] = orderedItems.splice(relIdx, 1);
    orderedItems.unshift(relItem);
  }

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
                  // Added local state hooks for force ready only once (scoped per render via closure guard)
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
                            {/* Relationship progress bar & Force Ready button */}
                            {item.key === 'relationshipStatus' && (
                              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                {relationshipReady === true && (
                                  <div className="text-[11px] font-semibold text-green-400 tracking-wide">Ready for next goal</div>
                                )}
                                {relationshipReady === false && (
                                  <div className="text-[11px] font-semibold text-red-400 tracking-wide">Not ready to advance</div>
                                )}
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



