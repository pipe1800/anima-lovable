import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { UserGlobalChatSettings, StreamingConfig } from '@/types/chatSettings';

// Query key factory
export const globalChatSettingsKeys = {
  all: ['globalChatSettings'] as const,
  user: (userId: string) => [...globalChatSettingsKeys.all, userId] as const,
};

// Default global settings (includes ALL chat settings: addons, streaming, accessibility)
export const defaultGlobalChatSettings: Omit<UserGlobalChatSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  // Addon settings (global defaults)
  dynamic_world_info: false,
  enhanced_memory: false,
  mood_tracking: true,
  clothing_inventory: true,
  location_tracking: true,
  time_and_weather: false,
  relationship_status: false,
  character_position: false,
  chain_of_thought: false,
  few_shot_examples: false,
  
  // Streaming settings
  streaming_mode: 'smooth',
  
  // Accessibility settings
  font_size: 'normal',
};

// Get user's global chat settings (includes ALL settings)
export const useUserGlobalChatSettings = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: globalChatSettingsKeys.user(user?.id || ''),
    queryFn: async (): Promise<UserGlobalChatSettings> => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('user_global_chat_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }
      
      // If no settings exist, create default settings
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from('user_global_chat_settings')
          .insert({
            user_id: user.id,
            ...defaultGlobalChatSettings,
          })
          .select()
          .single();
        
        if (insertError) throw insertError;
        return newSettings;
      }
      
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Update user's global chat settings (handles ALL settings)
export const useUpdateGlobalChatSettings = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (settings: Partial<UserGlobalChatSettings>) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('user_global_chat_settings')
        .update({
          ...settings,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Update the cache
      queryClient.setQueryData(
        globalChatSettingsKeys.user(user?.id || ''),
        data
      );
      
      // Since global settings affect ALL chats, invalidate all addon-related queries
      queryClient.invalidateQueries({ queryKey: ['addon-settings'] });
    },
    onError: (error) => {
      console.error('Failed to update global chat settings:', error);
    },
  });
};

// Legacy hook for backward compatibility (now uses global settings)
export const useAddonSettings = (characterId?: string) => {
  const { data: globalSettings } = useUserGlobalChatSettings();
  
  return {
    data: globalSettings ? {
      dynamicWorldInfo: globalSettings.dynamic_world_info,
      enhancedMemory: globalSettings.enhanced_memory,
      moodTracking: globalSettings.mood_tracking,
      clothingInventory: globalSettings.clothing_inventory,
      locationTracking: globalSettings.location_tracking,
      timeAndWeather: globalSettings.time_and_weather,
      relationshipStatus: globalSettings.relationship_status,
      characterPosition: globalSettings.character_position,
      chainOfThought: false, // Temporarily disabled - coming soon
      fewShotExamples: false, // Temporarily disabled - coming soon
    } : null,
    isLoading: !globalSettings,
    error: null,
  };
};

// Streaming configuration hook (derived from global settings)
export const useStreamingConfig = (): StreamingConfig => {
  const { data: settings } = useUserGlobalChatSettings();
  
  return {
    mode: settings?.streaming_mode || 'smooth',
    enabled: settings?.streaming_mode !== 'instant',
  };
};

// Quick update hooks for specific global settings
export const useUpdateStreamingMode = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  
  return useMutation({
    mutationFn: (mode: 'instant' | 'smooth' | 'adaptive') => {
      return updateSettings.mutateAsync({ streaming_mode: mode });
    },
  });
};

export const useUpdateAddonSettings = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  
  return useMutation({
    mutationFn: (addonSettings: {
      dynamic_world_info?: boolean;
      enhanced_memory?: boolean;
      mood_tracking?: boolean;
      clothing_inventory?: boolean;
      location_tracking?: boolean;
      time_and_weather?: boolean;
      relationship_status?: boolean;
      character_position?: boolean;
      chain_of_thought?: boolean;
      few_shot_examples?: boolean;
    }) => {
      return updateSettings.mutateAsync(addonSettings);
    },
  });
};

export const useUpdateAccessibilitySettings = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  
  return useMutation({
    mutationFn: (accessibility: {
      font_size?: 'small' | 'normal' | 'large';
    }) => {
      return updateSettings.mutateAsync(accessibility);
    },
  });
};
