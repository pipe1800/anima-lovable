import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  createWorldInfo,
  updateWorldInfo,
  deleteWorldInfo,
  addWorldInfoEntry,
  updateWorldInfoEntry,
  deleteWorldInfoEntry,
  addWorldInfoTag,
  removeWorldInfoTag,
  type WorldInfoCreationData,
  type WorldInfoEntryData
} from '@/lib/world-info-operations';
import { uploadAvatar } from '@/lib/avatar-upload';
import type { Tables } from '@/integrations/supabase/types';

type Tag = Tables<'tags'>;
type WorldInfoEntry = Tables<'world_info_entries'>;

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
      // Fetch world info details with entries and tags
      const [worldInfoData, entriesData, tagsData] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: ['world-info', id],
          staleTime: 5 * 60 * 1000, // 5 minutes
        }),
        queryClient.fetchQuery({
          queryKey: ['world-info-entries', id],
          staleTime: 5 * 60 * 1000,
        }),
        queryClient.fetchQuery({
          queryKey: ['world-info-tags', id],
          staleTime: 5 * 60 * 1000,
        })
      ]);

      setFormData({
        name: worldInfoData.name,
        short_description: worldInfoData.short_description || '',
        avatar_url: worldInfoData.avatar_url || '',
        visibility: worldInfoData.visibility,
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
        await updateWorldInfo(worldInfoId, worldInfoData);
        toast({
          title: "Success",
          description: "World info updated successfully"
        });
      } else {
        // Create new
        const newWorldInfo = await createWorldInfo(worldInfoData);
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
      const avatarUrl = await uploadAvatar(file, user.id);
      if (avatarUrl) {
        updateFormData({ avatar_url: avatarUrl });
        toast({
          title: "Success",
          description: "Avatar uploaded successfully"
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
      await addWorldInfoEntry(worldInfoId, entry);
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
      await updateWorldInfoEntry(entryId, entry);
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
      await deleteWorldInfoEntry(entryId);
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
