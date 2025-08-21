import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  createWorldInfo as createWorldInfoData,
  updateWorldInfoCore,
  cascadeDeleteWorldInfo,
  addWorldInfoEntry as addWorldInfoEntryData,
  updateWorldInfoEntry as updateWorldInfoEntryData,
  deleteWorldInfoEntry as deleteWorldInfoEntryData,
  addWorldInfoTag,
  removeWorldInfoTag
} from '@/data/worldInfo/mutations';
import { uploadAvatar } from '@/data/uploads/storage';
import type { Tables } from '@/integrations/supabase/types';

type Tag = Tables<'tags'>;
type WorldInfoEntry = Tables<'world_info_entries'>;

export interface WorldInfoCreationData {
  name: string;
  short_description?: string;
  visibility: 'public' | 'unlisted' | 'private';
  avatar_url?: string;
}

export interface WorldInfoEntryData { keywords: string[]; entry_text: string; }

export interface WorldInfoFormData {
  name: string;
  short_description: string;
  avatar_url?: string;
  visibility: 'public' | 'unlisted' | 'private';
  entries: WorldInfoEntry[];
  tags: Tag[];
}

interface UseWorldInfoOptions {
  worldInfoId?: string;
  onSuccess?: () => void;
}

export function useWorldInfo(options: UseWorldInfoOptions = {}) {
  const { worldInfoId, onSuccess } = options;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<WorldInfoFormData>({
    name: '',
    short_description: '',
    avatar_url: '',
    visibility: 'private',
    entries: [],
    tags: []
  });

  // Load existing world info for editing
  useEffect(() => {
    if (worldInfoId) {
      loadWorldInfo(worldInfoId);
    }
  }, [worldInfoId]);

  const loadWorldInfo = async (id: string) => {
    setIsLoading(true);
    try {
      const [worldInfoData, entriesData, tagsData] = await Promise.all([
        queryClient.fetchQuery<any>({
          queryKey: ['world-info', id],
          staleTime: 5 * 60 * 1000,
        }),
        queryClient.fetchQuery<WorldInfoEntry[]>({
          queryKey: ['world-info-entries', id],
          staleTime: 5 * 60 * 1000,
        }),
        queryClient.fetchQuery<Tag[]>({
          queryKey: ['world-info-tags', id],
          staleTime: 5 * 60 * 1000,
        })
      ]);

      setFormData({
        name: worldInfoData?.name || '',
        short_description: worldInfoData?.short_description || '',
        avatar_url: (worldInfoData as any)?.avatar_url || '',
        visibility: (worldInfoData?.visibility as any) || 'private',
        entries: entriesData || [],
        tags: tagsData || []
      });
    } catch (error) {
      console.error('Error loading world info:', error);
      toast({
        title: "Error",
        description: "Failed to load world info",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateFormData = useCallback((updates: Partial<WorldInfoFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const saveWorldInfo = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to save",
        variant: "destructive"
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter a name",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const worldInfoData: WorldInfoCreationData = {
        name: formData.name.trim(),
        short_description: formData.short_description.trim(),
        visibility: formData.visibility,
        avatar_url: formData.avatar_url
      };

      let savedWorldInfoId = worldInfoId;

      if (worldInfoId) {
        // Update existing
        await updateWorldInfoCore(worldInfoId, worldInfoData as any);
        toast({
          title: "Success",
          description: "World info updated successfully"
        });
      } else {
        // Create new
        const { data: newWorldInfo } = await createWorldInfoData(worldInfoData as any);
        if (!newWorldInfo) throw new Error('Create failed');
        savedWorldInfoId = newWorldInfo.id;

        // Add tags to new world info
        for (const tag of formData.tags) {
          await addWorldInfoTag(savedWorldInfoId, tag.id);
        }

        toast({
          title: "Success", 
          description: "World info created successfully"
        });
      }

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ['user-world-infos'] });
      if (savedWorldInfoId) {
        await queryClient.invalidateQueries({ queryKey: ['world-info', savedWorldInfoId] });
      }

      onSuccess?.();
      navigate(`/world-info-view/${savedWorldInfoId}`);
    } catch (error) {
      console.error('Error saving world info:', error);
      toast({
        title: "Error",
        description: worldInfoId ? "Failed to update world info" : "Failed to create world info",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const uploadAvatarImage = async (file: File) => {
    if (!user) return;

    try {
      const { publicUrl, error } = await uploadAvatar(user.id, file);
      if (error) throw error;
      if (publicUrl) {
        updateFormData({ avatar_url: publicUrl });
        toast({
          title: 'Success',
          description: 'Avatar uploaded successfully'
        });
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload avatar",
        variant: "destructive"
      });
    }
  };

  // Entry management
  const addEntry = async (entry: WorldInfoEntryData) => {
    if (!worldInfoId) {
      toast({
        title: "Save First",
        description: "Please save the world info before adding entries",
        variant: "destructive"
      });
      return;
    }

    try {
      await addWorldInfoEntryData(worldInfoId, entry);
      await queryClient.invalidateQueries({ queryKey: ['world-info-entries', worldInfoId] });
      toast({
        title: "Success",
        description: "Entry added successfully"
      });
    } catch (error) {
      console.error('Error adding entry:', error);
      toast({
        title: "Error",
        description: "Failed to add entry",
        variant: "destructive"
      });
    }
  };

  const updateEntry = async (entryId: string, entry: WorldInfoEntryData) => {
    try {
      await updateWorldInfoEntryData(entryId, entry);
      await queryClient.invalidateQueries({ queryKey: ['world-info-entries', worldInfoId] });
      toast({
        title: "Success",
        description: "Entry updated successfully"
      });
    } catch (error) {
      console.error('Error updating entry:', error);
      toast({
        title: "Error",
        description: "Failed to update entry",
        variant: "destructive"
      });
    }
  };

  const deleteEntry = async (entryId: string) => {
    try {
      await deleteWorldInfoEntryData(entryId);
      await queryClient.invalidateQueries({ queryKey: ['world-info-entries', worldInfoId] });
      toast({
        title: "Success",
        description: "Entry deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast({
        title: "Error",
        description: "Failed to delete entry",
        variant: "destructive"
      });
    }
  };

  // Tag management
  const addTag = async (tagId: number) => {
    if (!worldInfoId) return;

    try {
      await addWorldInfoTag(worldInfoId, tagId);
      await queryClient.invalidateQueries({ queryKey: ['world-info-tags', worldInfoId] });
    } catch (error) {
      console.error('Error adding tag:', error);
    }
  };

  const removeTag = async (tagId: number) => {
    if (!worldInfoId) return;

    try {
      await removeWorldInfoTag(worldInfoId, tagId);
      await queryClient.invalidateQueries({ queryKey: ['world-info-tags', worldInfoId] });
    } catch (error) {
      console.error('Error removing tag:', error);
    }
  };

  return {
    formData,
    updateFormData,
    saveWorldInfo,
    uploadAvatarImage,
    addEntry,
    updateEntry,
    deleteEntry,
    addTag,
    removeTag,
    isLoading,
    isSaving,
    isEditing: !!worldInfoId
  };
}
