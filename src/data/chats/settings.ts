import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { UserGlobalChatSettings, StreamingConfig } from '@/types/chatSettings';

export const globalChatSettingsKeys = {
  all: ['globalChatSettings'] as const,
  user: (userId: string) => ['globalChatSettings', userId] as const,
};

export const defaultGlobalChatSettings: Omit<UserGlobalChatSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  dynamic_world_info: false,
  enhanced_memory: false,
  mood_tracking: false,
  clothing_inventory: false,
  location_tracking: false,
  time_and_weather: false,
  relationship_status: false,
  character_position: false,
  enchantment_status: false,
  item_inventory: false,
  chain_of_thought: false,
  few_shot_examples: false,
  god_mode: false,
  streaming_mode: 'smooth',
  font_size: 'normal',
  ai_text_color: '#E5E7EB',
  user_text_color: '#FFFFFF',
  show_character_avatar: true,
  show_user_avatar: false,
  background_image_url: null,
  ai_bubble_color: '#1f2937',
  ai_bubble_opacity: 0.9,
  user_bubble_color: '#FF7A00',
  user_bubble_opacity: 1,
  semantic_overrides_mode: 'default',
  speech_color: null,
  action_color: null,
  emphasis_color: null,
  parenthetical_color: null,
  avatar_style: 'classic',
  portrait_frame_style: 'clean',
  portrait_frame_color: '#4B5563',
  banner_width: 'md',
  banner_tint_from_avatar: false,
};

export const useUserGlobalChatSettings = (opts?: { enabled?: boolean }) => {
  const { user } = useAuth();
  const finalEnabled = (opts?.enabled ?? true) && !!user?.id;
  return useQuery({
    queryKey: globalChatSettingsKeys.user(user?.id || ''),
    queryFn: async (): Promise<UserGlobalChatSettings> => {
      if (!user?.id) throw new Error('User not authenticated');
      const { data, error } = await supabase
        .from('user_global_chat_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from('user_global_chat_settings')
          .insert({ user_id: user.id, ...defaultGlobalChatSettings })
          .select()
          .single();
        if (insertError) throw insertError;
        return { ...defaultGlobalChatSettings, ...newSettings } as UserGlobalChatSettings;
      }
      return { ...defaultGlobalChatSettings, ...data } as UserGlobalChatSettings;
    },
    enabled: finalEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useUpdateGlobalChatSettings = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<UserGlobalChatSettings>) => {
      if (!user?.id) throw new Error('User not authenticated');
      const { data, error } = await supabase
        .from('user_global_chat_settings')
        .update({ ...settings, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      return { ...defaultGlobalChatSettings, ...data } as UserGlobalChatSettings;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(globalChatSettingsKeys.user(user?.id || ''), data);
      queryClient.invalidateQueries({ queryKey: ['addon-settings'] });
    },
  });
};

export const useAddonSettings = () => {
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
      chainOfThought: false,
      fewShotExamples: false,
      godMode: globalSettings.god_mode,
    } : null,
    isLoading: !globalSettings,
    error: null,
  };
};

export const useStreamingConfig = (): StreamingConfig => {
  const { data: settings } = useUserGlobalChatSettings();
  return { mode: settings?.streaming_mode || 'smooth', enabled: settings?.streaming_mode !== 'instant' };
};

export const useUpdateStreamingMode = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  return useMutation({ mutationFn: (mode: 'instant' | 'smooth' | 'adaptive') => updateSettings.mutateAsync({ streaming_mode: mode }) });
};

export const useUpdateAddonSettings = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  return useMutation({
    mutationFn: (addonSettings: Partial<Record<keyof UserGlobalChatSettings, any>>) => updateSettings.mutateAsync(addonSettings),
  });
};

export const useUpdateAccessibilitySettings = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  return useMutation({ mutationFn: (accessibility: { font_size?: 'small' | 'normal' | 'large' }) => updateSettings.mutateAsync(accessibility) });
};

export const useUpdateTextColor = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  return useMutation({ mutationFn: (colors: { ai_text_color?: string; user_text_color?: string }) => updateSettings.mutateAsync(colors) });
};

export const useUpdateBubbleStyles = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  return useMutation({ mutationFn: (bubbles: { ai_bubble_color?: string; ai_bubble_opacity?: number; user_bubble_color?: string; user_bubble_opacity?: number }) => updateSettings.mutateAsync(bubbles) });
};

export const useUpdateAvatarsSettings = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  return useMutation({ mutationFn: (avatars: { show_character_avatar?: boolean; show_user_avatar?: boolean }) => updateSettings.mutateAsync(avatars) });
};

export const useUpdateBackgroundImage = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  return useMutation({ mutationFn: (url: string | null) => updateSettings.mutateAsync({ background_image_url: url }) });
};

export const useUpdateSemanticHighlighting = () => {
  const updateSettings = useUpdateGlobalChatSettings();
  return useMutation({ mutationFn: (opts: { semantic_overrides_mode?: 'default' | 'custom' | 'disabled'; speech_color?: string | null; action_color?: string | null; emphasis_color?: string | null; parenthetical_color?: string | null }) => updateSettings.mutateAsync(opts) });
};
