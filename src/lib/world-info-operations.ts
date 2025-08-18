import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export interface WorldInfoCreationData {
  name: string;
  short_description?: string;
  visibility: 'public' | 'unlisted' | 'private';
  avatar_url?: string | null; // allow passing avatar when creating/updating
}

export interface WorldInfoEntryData {
  keywords: string[];
  entry_text: string;
}

export const createWorldInfo = async (userId: string, worldInfoData: WorldInfoCreationData) => {
  try {
    if (!userId) throw new Error('Not authenticated');

    const worldInfoInsert: TablesInsert<'world_infos'> = {
      creator_id: userId,
      name: worldInfoData.name,
      short_description: worldInfoData.short_description,
      visibility: worldInfoData.visibility,
      // avatar_url removed (not in table type)
    } as any;

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

export const getWorldInfosByUser = async (userId: string) => {
  try {
    if (!userId) throw new Error('Not authenticated');

    const { data: worldInfos, error } = await supabase
      .from('world_infos')
      .select('*')
      .eq('creator_id', userId)
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
          .from('world_info_user_likes')
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

export const getUserWorldInfoCollection = async (userId: string) => {
  try {
    if (!userId) throw new Error('Not authenticated');

    // Get world infos that the user has added to their collection
    const { data: collectionData, error } = await supabase
      .from('world_info_users')
      .select(`
        world_info:world_infos(*)
      `)
      .eq('user_id', userId)
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
          .from('world_info_user_likes')
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

export const getWorldInfoWithEntries = async (userId: string, worldInfoId: string) => {
  try {
    if (!userId) throw new Error('Not authenticated');

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

export const updateWorldInfo = async (userId: string, worldInfoId: string, worldInfoData: WorldInfoCreationData) => {
  try {
    if (!userId) throw new Error('Not authenticated');
    const worldInfoUpdate: TablesUpdate<'world_infos'> = {
      name: worldInfoData.name,
      short_description: worldInfoData.short_description,
      visibility: worldInfoData.visibility,
      // avatar_url removed (not in table type)
    } as any;
    const { data: worldInfo, error } = await supabase
      .from('world_infos')
      .update(worldInfoUpdate)
      .eq('id', worldInfoId)
      .eq('creator_id', userId)
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

export const deleteWorldInfo = async (userId: string, worldInfoId: string) => {
  try {
    if (!userId) throw new Error('Not authenticated');

    // Ensure ownership
    const { data: worldInfo } = await supabase
      .from('world_infos')
      .select('id, creator_id')
      .eq('id', worldInfoId)
      .single();

    if (!worldInfo || worldInfo.creator_id !== userId) {
      throw new Error('Not authorized to delete');
    }

    // Delete dependent rows first (entries, tags links, likes, users collection)
    await supabase.from('world_info_entries').delete().eq('world_info_id', worldInfoId);
    await supabase.from('world_info_tags').delete().eq('world_info_id', worldInfoId);
    await supabase.from('world_info_user_likes').delete().eq('world_info_id', worldInfoId);
    await supabase.from('world_info_users').delete().eq('world_info_id', worldInfoId);

    const { error } = await supabase.from('world_infos').delete().eq('id', worldInfoId);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error deleting world info:', error);
    throw error;
  }
};

export const addWorldInfoEntry = async (userId: string, worldInfoId: string, entryData: WorldInfoEntryData) => {
  try {
    if (!userId) throw new Error('Not authenticated');

    // First verify the user owns the world info
    const { data: worldInfo } = await supabase
      .from('world_infos')
      .select('creator_id')
      .eq('id', worldInfoId)
      .single();

    if (!worldInfo || worldInfo.creator_id !== userId) {
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

export const updateWorldInfoEntry = async (userId: string, entryId: string, entryData: WorldInfoEntryData) => {
  try {
    if (!userId) throw new Error('Not authenticated');

    // First verify the user owns the world info that contains this entry
    const { data: entry } = await supabase
      .from('world_info_entries')
      .select('world_info_id, world_infos!inner(creator_id)')
      .eq('id', entryId)
      .single();

    if (!entry || entry.world_infos.creator_id !== userId) {
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

export const deleteWorldInfoEntry = async (userId: string, entryId: string) => {
  try {
    if (!userId) throw new Error('Not authenticated');

    // First verify the user owns the world info that contains this entry
    const { data: entry } = await supabase
      .from('world_info_entries')
      .select('world_info_id, world_infos!inner(creator_id)')
      .eq('id', entryId)
      .single();

    if (!entry || entry.world_infos.creator_id !== userId) {
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

export const addWorldInfoTag = async (userId: string, worldInfoId: string, tagId: number) => {
  try { if (!userId) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('world_info_tags')
      .insert({ world_info_id: worldInfoId, tag_id: tagId });
    if (error) { console.error('Error adding world info tag:', error); throw new Error('Failed to add tag to world info'); }
    return true;
  } catch (error) { console.error('Error in addWorldInfoTag:', error); throw error; }
};

export const removeWorldInfoTag = async (userId: string, worldInfoId: string, tagId: number) => {
  try { if (!userId) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('world_info_tags')
      .delete()
      .eq('world_info_id', worldInfoId)
      .eq('tag_id', tagId);
    if (error) { console.error('Error removing world info tag:', error); throw new Error('Failed to remove tag from world info'); }
    return true;
  } catch (error) { console.error('Error in removeWorldInfoTag:', error); throw error; }
};

// =============================================================================
// PUBLIC WORLD INFO OPERATIONS
// =============================================================================

export const getPublicWorldInfoDetails = async (userId: string | null, worldInfoId: string) => {
  try {
    const isAuthenticated = !!userId;

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

    const isOwner = isAuthenticated && worldInfo.creator_id === userId;
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
    const { data: entries, error: entriesError } = await supabase
      .from('world_info_entries')
      .select('*')
      .eq('world_info_id', worldInfoId)
      .order('created_at', { ascending: false });


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

    // Fetch like status if user is authenticated
    let isLiked = false;
    let isUsed = false;

    if (isAuthenticated) {
      // Check if user has liked this world info - only select what we need
      const { data: likeData, error: likeError } = await supabase
        .from('world_info_user_likes')
        .select('user_id')
        .eq('world_info_id', worldInfoId)
        .eq('user_id', userId!)
        .maybeSingle();

      // Ignore errors for likes check, just default to false
      isLiked = !likeError && !!likeData;

      // Check if user is using this world info
      const { data: usageData } = await supabase
        .from('world_info_users')
        .select('id')
        .eq('world_info_id', worldInfoId)
        .eq('user_id', userId!)
        .maybeSingle();

      isUsed = !!usageData;
    }

    // Get total likes count - use the likes_count column from world_infos table
    const likesCount = worldInfo.likes_count || 0;

    return {
      ...worldInfo,
      entries: entries || [],
      tags,
      isLiked,
      isUsed,
      likesCount,
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

export const toggleWorldInfoLike = async (userId: string, worldInfoId: string) => {
  try { if (!userId) throw new Error('Not authenticated');
    const { data: existingLike } = await supabase
      .from('world_info_user_likes')
      .select('*')
      .eq('world_info_id', worldInfoId)
      .eq('user_id', userId)
      .single();
    if (existingLike) {
      const { error } = await supabase
        .from('world_info_user_likes')
        .delete()
        .eq('world_info_id', worldInfoId)
        .eq('user_id', userId);
      if (error) { console.error('Error removing like:', error); throw new Error('Failed to remove like'); }
      const { data: currentData } = await supabase
        .from('world_infos')
        .select('likes_count')
        .eq('id', worldInfoId)
        .single();
      if (currentData) {
        await supabase
          .from('world_infos')
          .update({ likes_count: Math.max(currentData.likes_count - 1, 0) })
          .eq('id', worldInfoId);
      }
      return { isLiked: false };
    } else {
      const { error } = await supabase
        .from('world_info_user_likes')
        .insert({ world_info_id: worldInfoId, user_id: userId });
      if (error) { console.error('Error adding like:', error); throw new Error('Failed to add like'); }
      const { data: currentData } = await supabase
        .from('world_infos')
        .select('likes_count')
        .eq('id', worldInfoId)
        .single();
      if (currentData) {
        await supabase
          .from('world_infos')
          .update({ likes_count: currentData.likes_count + 1 })
          .eq('id', worldInfoId);
      }
      return { isLiked: true };
    }
  } catch (error) { console.error('Error in toggleWorldInfoLike:', error); throw error; }
};

export const addWorldInfoToCollection = async (userId: string, worldInfoId: string) => {
  try { if (!userId) throw new Error('Not authenticated');
    const { data: existingUsage } = await supabase
      .from('world_info_users')
      .select('id')
      .eq('world_info_id', worldInfoId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingUsage) { return { isUsed: true }; }
    const { error } = await supabase
      .from('world_info_users')
      .insert({ world_info_id: worldInfoId, user_id: userId });
    if (error) { console.error('Error adding to collection:', error); throw new Error('Failed to add to collection'); }
    const { data: beforeData } = await supabase
      .from('world_infos')
      .select('interaction_count')
      .eq('id', worldInfoId)
      .single();
    const { error: rpcError } = await supabase.rpc('increment_world_info_interaction_count', { world_info_id: worldInfoId });
    if (rpcError) {
      const { data: updateData, error: updateError } = await supabase
        .from('world_infos')
        .update({ interaction_count: (beforeData?.interaction_count || 0) + 1 })
        .eq('id', worldInfoId)
        .select('interaction_count')
        .single();
      if (updateError) { console.error('Direct UPDATE also failed:', updateError); }
    }
    return { isUsed: true };
  } catch (error) { console.error('Error in addWorldInfoToCollection:', error); throw error; }
};

export const removeWorldInfoFromCollection = async (userId: string, worldInfoId: string) => {
  try { if (!userId) throw new Error('Not authenticated');
    const { data: existingUsage } = await supabase
      .from('world_info_users')
      .select('id')
      .eq('world_info_id', worldInfoId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existingUsage) { return { isUsed: false }; }
    const { error } = await supabase
      .from('world_info_users')
      .delete()
      .eq('world_info_id', worldInfoId)
      .eq('user_id', userId);
    if (error) { console.error('Error removing from collection:', error); throw new Error('Failed to remove from collection'); }
    const { error: rpcError } = await supabase.rpc('decrement_world_info_interaction_count', { world_info_id: worldInfoId });
    if (rpcError) { console.error('Error decrementing interaction count:', rpcError); }
    return { isUsed: false };
  } catch (error) { console.error('Error in removeWorldInfoFromCollection:', error); throw error; }
};

export const importWorldInfo = async (jsonData: any, userId: string) => {
  try {
    // Be permissive: only require syntactically valid JSON. Name & entries optional.
    const worldInfoName: string =
      jsonData?.name ||
      jsonData?.data?.name ||
      `Imported World Info ${new Date().toISOString()}`;

    // Support multiple possible locations / shapes for entries
    const rawEntries = jsonData?.entries || jsonData?.data?.entries || [];

    // Create the world info first (user can edit later)
    const worldInfo = await createWorldInfo(userId, {
      name: worldInfoName,
      short_description: jsonData?.description || jsonData?.data?.description || '',
      visibility: 'private'
    });

    // Normalize entries into an array of objects with keywords + entry_text
    let entriesArray: any[] = [];
    if (Array.isArray(rawEntries)) {
      entriesArray = rawEntries;
    } else if (rawEntries && typeof rawEntries === 'object') {
      entriesArray = Object.entries(rawEntries).map(([k, v]: [string, any]) => ({
        keywords: v?.keys || v?.key || v?.keywords || [k],
        entry_text: v?.entry_text || v?.content || v?.entry || v?.text || ''
      }));
    }

    for (const entry of entriesArray) {
      // Accept keywords / keys / key (string or array)
      const rawKeywords = entry.keywords || entry.keys || entry.key;
      const keywords = Array.isArray(rawKeywords) ? rawKeywords : rawKeywords ? [rawKeywords] : [];
      const entryText = entry.entry_text || entry.content || entry.text || entry.entry || '';

      if (keywords.length > 0 && entryText) {
        await addWorldInfoEntry(userId, worldInfo.id, {
          keywords: keywords.filter((k: string) => k && k.trim()),
            entry_text: entryText
        });
      }
    }

    return worldInfo;
  } catch (error) {
    console.error('Error importing world info:', error);
    throw error;
  }
};

export const exportWorldInfo = (worldInfo: { name: string; short_description?: string | null; entries: Array<{ keywords: string[]; entry_text: string }> }) => {
  const data = { name: worldInfo.name, description: worldInfo.short_description || '', entries: worldInfo.entries };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${worldInfo.name.replace(/[^a-z0-9-_]/gi, '_') || 'world_info'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};