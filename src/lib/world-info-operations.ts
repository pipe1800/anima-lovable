import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export interface WorldInfoCreationData {
  name: string;
  short_description?: string;
  visibility: 'public' | 'unlisted' | 'private';
}

export interface WorldInfoEntryData {
  keywords: string[];
  entry_text: string;
}

export const createWorldInfo = async (worldInfoData: WorldInfoCreationData) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const worldInfoInsert: TablesInsert<'world_infos'> = {
      creator_id: user.user.id,
      name: worldInfoData.name,
      short_description: worldInfoData.short_description,
      visibility: worldInfoData.visibility
    };

    const { data: worldInfo, error } = await supabase
      .from('world_infos')
      .insert(worldInfoInsert)
      .select()
      .single();

    if (error || !worldInfo) {
      console.error('Error creating world info:', error);
      throw new Error('Failed to create world info');
    }

    return worldInfo;
  } catch (error) {
    console.error('Error in createWorldInfo:', error);
    throw error;
  }
};

export const getWorldInfosByUser = async () => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { data: worldInfos, error } = await supabase
      .from('world_infos')
      .select('*')
      .eq('creator_id', user.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching world infos:', error);
      throw new Error('Failed to fetch world infos');
    }

    if (!worldInfos) return [];

    // Enrich each world info with additional data
    const enrichedWorldInfos = await Promise.all(
      worldInfos.map(async (worldInfo) => {
        // Get entries count
        const { count: entriesCount } = await supabase
          .from('world_info_entries')
          .select('*', { count: 'exact', head: true })
          .eq('world_info_id', worldInfo.id);

        // Get likes count
        const { count: likesCount } = await supabase
          .from('world_info_likes')
          .select('*', { count: 'exact', head: true })
          .eq('world_info_id', worldInfo.id);

        // Get tags
        const { data: worldInfoTags } = await supabase
          .from('world_info_tags')
          .select(`
            tag:tags(id, name)
          `)
          .eq('world_info_id', worldInfo.id);

        const tags = worldInfoTags?.map(wt => wt.tag) || [];

        return {
          ...worldInfo,
          entriesCount: entriesCount || 0,
          likesCount: likesCount || 0,
          tags
        };
      })
    );

    return enrichedWorldInfos;
  } catch (error) {
    console.error('Error in getWorldInfosByUser:', error);
    throw error;
  }
};

export const getUserWorldInfoCollection = async () => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // Get world infos that the user has added to their collection
    const { data: collectionData, error } = await supabase
      .from('world_info_users')
      .select(`
        world_info:world_infos(*)
      `)
      .eq('user_id', user.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user collection:', error);
      throw new Error('Failed to fetch user collection');
    }

    if (!collectionData) return [];

    // Extract world infos and enrich with additional data
    const worldInfos = collectionData.map(item => item.world_info).filter(Boolean);

    const enrichedWorldInfos = await Promise.all(
      worldInfos.map(async (worldInfo) => {
        // Get creator profile
        const { data: creatorData } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', worldInfo.creator_id)
          .maybeSingle();

        // Get entries count
        const { count: entriesCount } = await supabase
          .from('world_info_entries')
          .select('*', { count: 'exact', head: true })
          .eq('world_info_id', worldInfo.id);

        // Get likes count
        const { count: likesCount } = await supabase
          .from('world_info_likes')
          .select('*', { count: 'exact', head: true })
          .eq('world_info_id', worldInfo.id);

        // Get tags
        const { data: worldInfoTags } = await supabase
          .from('world_info_tags')
          .select(`
            tag:tags(id, name)
          `)
          .eq('world_info_id', worldInfo.id);

        const tags = worldInfoTags?.map(wt => wt.tag) || [];

        return {
          ...worldInfo,
          creator: creatorData,
          entriesCount: entriesCount || 0,
          likesCount: likesCount || 0,
          tags
        };
      })
    );

    return enrichedWorldInfos;
  } catch (error) {
    console.error('Error in getUserWorldInfoCollection:', error);
    throw error;
  }
};

export const getWorldInfoWithEntries = async (worldInfoId: string) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // Get world info
    const { data: worldInfo, error: worldInfoError } = await supabase
      .from('world_infos')
      .select('*')
      .eq('id', worldInfoId)
      .single();

    if (worldInfoError || !worldInfo) {
      console.error('Error fetching world info:', worldInfoError);
      throw new Error('Failed to fetch world info');
    }

    // Get entries
    const { data: entries, error: entriesError } = await supabase
      .from('world_info_entries')
      .select('*')
      .eq('world_info_id', worldInfoId)
      .order('created_at', { ascending: false });

    if (entriesError) {
      console.error('Error fetching world info entries:', entriesError);
      throw new Error('Failed to fetch world info entries');
    }

    return {
      ...worldInfo,
      entries: entries || []
    };
  } catch (error) {
    console.error('Error in getWorldInfoWithEntries:', error);
    throw error;
  }
};

export const updateWorldInfo = async (worldInfoId: string, worldInfoData: WorldInfoCreationData) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const worldInfoUpdate: TablesUpdate<'world_infos'> = {
      name: worldInfoData.name,
      short_description: worldInfoData.short_description,
      visibility: worldInfoData.visibility
    };

    const { data: worldInfo, error } = await supabase
      .from('world_infos')
      .update(worldInfoUpdate)
      .eq('id', worldInfoId)
      .eq('creator_id', user.user.id) // Ensure user owns the world info
      .select()
      .single();

    if (error || !worldInfo) {
      console.error('Error updating world info:', error);
      throw new Error('Failed to update world info');
    }

    return worldInfo;
  } catch (error) {
    console.error('Error in updateWorldInfo:', error);
    throw error;
  }
};

export const deleteWorldInfo = async (worldInfoId: string) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('world_infos')
      .delete()
      .eq('id', worldInfoId)
      .eq('creator_id', user.user.id); // Ensure user owns the world info

    if (error) {
      console.error('Error deleting world info:', error);
      throw new Error('Failed to delete world info');
    }

    return true;
  } catch (error) {
    console.error('Error in deleteWorldInfo:', error);
    throw error;
  }
};

export const addWorldInfoEntry = async (worldInfoId: string, entryData: WorldInfoEntryData) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // First verify the user owns the world info
    const { data: worldInfo } = await supabase
      .from('world_infos')
      .select('creator_id')
      .eq('id', worldInfoId)
      .single();

    if (!worldInfo || worldInfo.creator_id !== user.user.id) {
      throw new Error('Unauthorized to add entries to this world info');
    }

    const entryInsert: TablesInsert<'world_info_entries'> = {
      world_info_id: worldInfoId,
      keywords: entryData.keywords,
      entry_text: entryData.entry_text
    };

    const { data: entry, error } = await supabase
      .from('world_info_entries')
      .insert(entryInsert)
      .select()
      .single();

    if (error || !entry) {
      console.error('Error adding world info entry:', error);
      throw new Error('Failed to add world info entry');
    }

    return entry;
  } catch (error) {
    console.error('Error in addWorldInfoEntry:', error);
    throw error;
  }
};

export const updateWorldInfoEntry = async (entryId: string, entryData: WorldInfoEntryData) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // First verify the user owns the world info that contains this entry
    const { data: entry } = await supabase
      .from('world_info_entries')
      .select('world_info_id, world_infos!inner(creator_id)')
      .eq('id', entryId)
      .single();

    if (!entry || entry.world_infos.creator_id !== user.user.id) {
      throw new Error('Unauthorized to update this entry');
    }

    const entryUpdate: TablesUpdate<'world_info_entries'> = {
      keywords: entryData.keywords,
      entry_text: entryData.entry_text
    };

    const { data: updatedEntry, error } = await supabase
      .from('world_info_entries')
      .update(entryUpdate)
      .eq('id', entryId)
      .select()
      .single();

    if (error || !updatedEntry) {
      console.error('Error updating world info entry:', error);
      throw new Error('Failed to update world info entry');
    }

    return updatedEntry;
  } catch (error) {
    console.error('Error in updateWorldInfoEntry:', error);
    throw error;
  }
};

export const deleteWorldInfoEntry = async (entryId: string) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // First verify the user owns the world info that contains this entry
    const { data: entry } = await supabase
      .from('world_info_entries')
      .select('world_info_id, world_infos!inner(creator_id)')
      .eq('id', entryId)
      .single();

    if (!entry || entry.world_infos.creator_id !== user.user.id) {
      throw new Error('Unauthorized to delete this entry');
    }

    const { error } = await supabase
      .from('world_info_entries')
      .delete()
      .eq('id', entryId);

    if (error) {
      console.error('Error deleting world info entry:', error);
      throw new Error('Failed to delete world info entry');
    }

    return true;
  } catch (error) {
    console.error('Error in deleteWorldInfoEntry:', error);
    throw error;
  }
};

// =============================================================================
// TAG MANAGEMENT
// =============================================================================

export const getAllTags = async () => {
  try {
    const { data: tags, error } = await supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching tags:', error);
      throw new Error('Failed to fetch tags');
    }

    return tags || [];
  } catch (error) {
    console.error('Error in getAllTags:', error);
    throw error;
  }
};

export const getWorldInfoTags = async (worldInfoId: string) => {
  try {
    const { data: worldInfoTags, error } = await supabase
      .from('world_info_tags')
      .select(`
        tag:tags(id, name)
      `)
      .eq('world_info_id', worldInfoId);

    if (error) {
      console.error('Error fetching world info tags:', error);
      throw new Error('Failed to fetch world info tags');
    }

    return worldInfoTags?.map(wt => wt.tag) || [];
  } catch (error) {
    console.error('Error in getWorldInfoTags:', error);
    throw error;
  }
};

export const addWorldInfoTag = async (worldInfoId: string, tagId: number) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('world_info_tags')
      .insert({
        world_info_id: worldInfoId,
        tag_id: tagId
      });

    if (error) {
      console.error('Error adding world info tag:', error);
      throw new Error('Failed to add tag to world info');
    }

    return true;
  } catch (error) {
    console.error('Error in addWorldInfoTag:', error);
    throw error;
  }
};

export const removeWorldInfoTag = async (worldInfoId: string, tagId: number) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('world_info_tags')
      .delete()
      .eq('world_info_id', worldInfoId)
      .eq('tag_id', tagId);

    if (error) {
      console.error('Error removing world info tag:', error);
      throw new Error('Failed to remove tag from world info');
    }

    return true;
  } catch (error) {
    console.error('Error in removeWorldInfoTag:', error);
    throw error;
  }
};

// =============================================================================
// PUBLIC WORLD INFO OPERATIONS
// =============================================================================

export const getPublicWorldInfoDetails = async (worldInfoId: string) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    const isAuthenticated = !!user.user;

    // Fetch the world info with creator profile
    const { data: worldInfo, error: worldInfoError } = await supabase
      .from('world_infos')
      .select('*')
      .eq('id', worldInfoId)
      .single();

    // Check if world info is accessible (public or owned by current user)
    if (worldInfoError || !worldInfo) {
      console.error('Error fetching world info:', worldInfoError);
      throw new Error('World info not found');
    }

    const isOwner = isAuthenticated && worldInfo.creator_id === user.user.id;
    if (worldInfo.visibility !== 'public' && !isOwner) {
      throw new Error('World info not found or not public');
    }

    // Fetch creator profile separately
    const { data: creatorData, error: creatorError } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', worldInfo.creator_id)
      .single();

    // Fetch entries
    console.log('🔍 Debug: Fetching entries for world info ID:', worldInfoId);
    const { data: entries, error: entriesError } = await supabase
      .from('world_info_entries')
      .select('*')
      .eq('world_info_id', worldInfoId)
      .order('created_at', { ascending: false });

    console.log('🔍 Debug: Entries query result:', { entries, entriesError });
    console.log('🔍 Debug: Entries count:', entries?.length);

    if (entriesError) {
      console.error('Error fetching entries:', entriesError);
      throw new Error('Failed to fetch entries');
    }

    // Fetch tags
    const { data: worldInfoTags, error: tagsError } = await supabase
      .from('world_info_tags')
      .select(`
        tag:tags(id, name)
      `)
      .eq('world_info_id', worldInfoId);

    if (tagsError) {
      console.error('Error fetching tags:', tagsError);
      throw new Error('Failed to fetch tags');
    }

    const tags = worldInfoTags?.map(wt => wt.tag) || [];

    // Fetch like and favorite status if user is authenticated
    let isLiked = false;
    let isFavorited = false;
    let isUsed = false;
    let likesCount = 0;
    let favoritesCount = 0;

    if (isAuthenticated) {
      // Check if user has liked this world info
      const { data: likeData } = await supabase
        .from('world_info_likes')
        .select('id')
        .eq('world_info_id', worldInfoId)
        .eq('user_id', user.user.id)
        .single();

      isLiked = !!likeData;

      // Check if user has favorited this world info
      const { data: favoriteData } = await supabase
        .from('world_info_favorites')
        .select('id')
        .eq('world_info_id', worldInfoId)
        .eq('user_id', user.user.id)
        .single();

      isFavorited = !!favoriteData;

      // Check if user is using this world info
      const { data: usageData } = await supabase
        .from('world_info_users')
        .select('id')
        .eq('world_info_id', worldInfoId)
        .eq('user_id', user.user.id)
        .single();

      isUsed = !!usageData;
    }

    // Get total likes and favorites count
    const { count: likesCountData } = await supabase
      .from('world_info_likes')
      .select('*', { count: 'exact', head: true })
      .eq('world_info_id', worldInfoId);

    const { count: favoritesCountData } = await supabase
      .from('world_info_favorites')
      .select('*', { count: 'exact', head: true })
      .eq('world_info_id', worldInfoId);

    likesCount = likesCountData || 0;
    favoritesCount = favoritesCountData || 0;

    return {
      ...worldInfo,
      entries: entries || [],
      tags,
      isLiked,
      isFavorited,
      isUsed,
      likesCount,
      favoritesCount,
      creator: creatorData
    };
  } catch (error) {
    console.error('Error in getPublicWorldInfoDetails:', error);
    throw error;
  }
};

// =============================================================================
// LIKES AND COLLECTION MANAGEMENT
// =============================================================================

export const toggleWorldInfoLike = async (worldInfoId: string) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // Check if already liked
    const { data: existingLike } = await supabase
      .from('world_info_likes')
      .select('id')
      .eq('world_info_id', worldInfoId)
      .eq('user_id', user.user.id)
      .single();

    if (existingLike) {
      // Unlike
      const { error } = await supabase
        .from('world_info_likes')
        .delete()
        .eq('id', existingLike.id);

      if (error) {
        console.error('Error removing like:', error);
        throw new Error('Failed to remove like');
      }

      return { isLiked: false };
    } else {
      // Like
      const { error } = await supabase
        .from('world_info_likes')
        .insert({
          world_info_id: worldInfoId,
          user_id: user.user.id
        });

      if (error) {
        console.error('Error adding like:', error);
        throw new Error('Failed to add like');
      }

      return { isLiked: true };
    }
  } catch (error) {
    console.error('Error in toggleWorldInfoLike:', error);
    throw error;
  }
};

export const addWorldInfoToCollection = async (worldInfoId: string) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // Check if already in collection
    const { data: existingUsage } = await supabase
      .from('world_info_users')
      .select('id')
      .eq('world_info_id', worldInfoId)
      .eq('user_id', user.user.id)
      .single();

    if (existingUsage) {
      return { isUsed: true };
    }

    // Add to collection
    const { error } = await supabase
      .from('world_info_users')
      .insert({
        world_info_id: worldInfoId,
        user_id: user.user.id
      });

    if (error) {
      console.error('Error adding to collection:', error);
      throw new Error('Failed to add to collection');
    }

    // Increment usage count
    const { data: currentWorldInfo } = await supabase
      .from('world_infos')
      .select('interaction_count')
      .eq('id', worldInfoId)
      .single();

    const { error: updateError } = await supabase
      .from('world_infos')
      .update({ 
        interaction_count: (currentWorldInfo?.interaction_count || 0) + 1
      })
      .eq('id', worldInfoId);

    if (updateError) {
      console.error('Error updating usage count:', updateError);
    }

    return { isUsed: true };
  } catch (error) {
    console.error('Error in addWorldInfoToCollection:', error);
    throw error;
  }
};

export const removeWorldInfoFromCollection = async (worldInfoId: string) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('world_info_users')
      .delete()
      .eq('world_info_id', worldInfoId)
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Error removing from collection:', error);
      throw new Error('Failed to remove from collection');
    }

    return { isUsed: false };
  } catch (error) {
    console.error('Error in removeWorldInfoFromCollection:', error);
    throw error;
  }
};