import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { capitalizeText, isCharacterRelevantContext, getContextLabel, getAddonKey } from '@/lib/utils/textFormatting';
import { convertDatabaseContextToTrackedContext, hasValidContext } from '@/utils/contextConverter';

export interface TrackedContext {
  moodTracking: string;
  clothingInventory: string;
  locationTracking: string;
  timeAndWeather: string;
  relationshipStatus: string;
  characterPosition: string;
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
}

interface ContextItem {
  label: string;
  value: string;
  key: string;
  isEnabled: boolean;
  isHistorical: boolean;
}

export const ContextDisplay = ({ context, contextUpdates, currentContext, addonSettings, className = '' }: ContextDisplayProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Use the most relevant context source
  const effectiveContext = currentContext || context;
  
  // Debug logging
  console.log('🎨 ContextDisplay render:', {
    hasContext: !!context,
    hasContextUpdates: !!contextUpdates,
    hasCurrentContext: !!currentContext,
    hasAddonSettings: !!addonSettings,
    context,
    contextUpdates,
    currentContext,
    addonSettings,
    effectiveContext
  });

  // Create all possible addon items
  const allAddonItems = [
    { label: 'Mood Tracking', key: 'moodTracking', addonKey: 'moodTracking' },
    { label: 'Clothing Inventory', key: 'clothingInventory', addonKey: 'clothingInventory' },
    { label: 'Location Tracking', key: 'locationTracking', addonKey: 'locationTracking' },
    { label: 'Time & Weather', key: 'timeAndWeather', addonKey: 'timeAndWeather' },
    { label: 'Relationship Status', key: 'relationshipStatus', addonKey: 'relationshipStatus' },
    { label: 'Character Position', key: 'characterPosition', addonKey: 'characterPosition' },
  ];

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
        characterPosition: 'No context'
      };
    }
    
    contextItems = allAddonItems.map(item => {
      const isEnabled = addonSettings ? addonSettings[item.addonKey] : true; // Default to enabled if settings not loaded
      
      // Get context value using both possible formats for maximum compatibility
      let contextValue = null;
      
      if (typeof workingContext === 'object' && workingContext !== null) {
        // Try TrackedContext format first (preferred)
        if ('moodTracking' in workingContext) {
          const trackedContext = workingContext as TrackedContext;
          // Use the key directly since allAddonItems keys match TrackedContext properties
          contextValue = trackedContext[item.key as keyof TrackedContext];
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
          isHistorical: false
        };
      } else if (isEnabled) {
        return {
          label: item.label,
          value: 'No context yet',
          key: item.key,
          isEnabled: true,
          isHistorical: false
        };
      }
      return null;
    }).filter(Boolean);
  }
  // Handle contextUpdates (from historical messages) - PRIORITY 2
  else if (contextUpdates && Object.keys(contextUpdates).length > 0) {
    contextItems = allAddonItems.map(item => {
      const isEnabled = addonSettings ? addonSettings[item.addonKey] : true; // Default to enabled if settings not loaded
      const updateData = contextUpdates[item.addonKey];
      
      if (updateData && updateData.current !== 'No context' && isCharacterRelevantContext(item.addonKey, updateData.current)) {
        return {
          label: item.label,
          value: capitalizeText(updateData.current),
          key: item.key,
          isEnabled: isEnabled,
          isHistorical: !isEnabled
        };
      } else if (isEnabled) {
        return {
          label: item.label,
          value: 'No context yet',
          key: item.key,
          isEnabled: true,
          isHistorical: false
        };
      }
      return null;
    }).filter(Boolean);
  }
  // Handle legacy context format - PRIORITY 3
  else if (context) {
    contextItems = allAddonItems.map(item => {
      const isEnabled = addonSettings ? addonSettings[item.addonKey] : true; // Default to enabled if settings not loaded
      const contextValue = context[item.addonKey];
      
      if (contextValue && contextValue !== 'No context' && isCharacterRelevantContext(item.addonKey, contextValue)) {
        return {
          label: item.label,
          value: capitalizeText(contextValue),
          key: item.key,
          isEnabled: isEnabled,
          isHistorical: !isEnabled
        };
      } else if (isEnabled) {
        return {
          label: item.label,
          value: 'No context yet',
          key: item.key,
          isEnabled: true,
          isHistorical: false
        };
      }
      return null;
    }).filter(Boolean);
  }
  // If no context data but addons are enabled, show all enabled addons with "No context yet"
  else {
    contextItems = allAddonItems.map(item => {
      const isEnabled = addonSettings ? addonSettings[item.addonKey] : false;
      if (isEnabled) {
        return {
          label: item.label,
          value: 'No context yet',
          key: item.key,
          isEnabled: true,
          isHistorical: false
        };
      }
      return null;
    }).filter(Boolean);
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

  console.log('🎨 ContextDisplay visibility check:', {
    hasEnabledAddons,
    hasValidContextResult: hasValidContext(effectiveContext),
    hasContext: !!context,
    hasContextUpdates: !!contextUpdates,
    hasCurrentContext: !!currentContext,
    effectiveContext,
    willRender: hasEnabledAddons || hasValidContext(effectiveContext)
  });

  // Show context if we have valid context data OR if addons are enabled OR while settings are loading
  const shouldRender = hasEnabledAddons || hasValidContext(effectiveContext) || context || contextUpdates;
  
  // TEMPORARY: Force render if we have any context for debugging
  const hasAnyContext = hasValidContext(effectiveContext) || hasValidContext(context);
  const forceRender = hasAnyContext;
  
  console.log('🎨 ContextDisplay final render decision:', {
    shouldRender,
    hasAnyContext,
    forceRender,
    finalDecision: shouldRender || forceRender
  });
  
  if (!shouldRender && !forceRender) {
    console.log('🎨 ContextDisplay: Not rendering - no valid conditions met');
    return null;
  }

  return (
    <div className={`${className}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Context</span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-1">
          {contextItems.length > 0 ? (
            contextItems.map((item) => (
              <div key={item.key} className={`text-sm ${item.isHistorical ? 'text-muted-foreground' : 'text-foreground'}`}>
                <span className="font-medium">{item.label}:</span> {item.value}
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">
              No stateful addons are currently enabled.
            </div>
          )}
        </div>
      )}
    </div>
  );
};