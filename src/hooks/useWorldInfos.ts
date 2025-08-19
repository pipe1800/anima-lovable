import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getWorldInfoSnapshot } from '@/lib/snapshots';
import type { SearchParams } from '@/types/search';

// TODO: Replace client-side world info search filtering with server RPC (get_world_info_search_snapshot) for large datasets/pagination.

export interface WorldInfoWithDetails {
  id: string;
  name: string;
  short_description: string | null;
  visibility: string;
  creator_id: string;
  created_at: string;
  updated_at: string;
  interaction_count: number;
  entriesCount: number;
  likesCount: number;
  tags: Array<{ id: number; name: string }>;
  creator?: {
    username: string;
    avatar_url?: string;
  };
}

// Optimized query to get user world infos with all related data in one go
const fetchUserWorldInfos = async (userId: string): Promise<WorldInfoWithDetails[]> => {
  // Include all visibilities for owner
  const { data: worldInfosWithCounts, error } = await supabase
    .from('world_infos')
    .select(`
      *,
      world_info_entries(id),
      world_info_tags(
        tags(id, name)
      )
    `)
    .eq('creator_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching world infos:', error);
    throw new Error('Failed to fetch world infos');
  }

  // Transform the data to match expected format
  return (worldInfosWithCounts || []).map(worldInfo => ({
    ...worldInfo,
    entriesCount: worldInfo.world_info_entries?.length || 0,
    likesCount: worldInfo.likes_count || 0,
    tags: worldInfo.world_info_tags?.map(wt => wt.tags).filter(Boolean) || []
  }));
};

// Optimized query for user collection
const fetchUserWorldInfoCollection = async (userId: string): Promise<WorldInfoWithDetails[]> => {
  const { data: collectionData, error } = await supabase
    .from('world_info_users')
    .select(`
      world_infos(
        *,
        world_info_entries(id),
        world_info_tags(
          tags(id, name)
        )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user collection:', error);
    throw new Error('Failed to fetch user collection');
  }

  // Get creator profiles separately
  const worldInfos = (collectionData || [])
    .map(item => item.world_infos)
    .filter(Boolean);

  if (worldInfos.length === 0) return [];

  const creatorIds = [...new Set(worldInfos.map(w => w.creator_id))];
  const { data: creators } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', creatorIds);

  const creatorsMap = new Map(creators?.map(c => [c.id, c]) || []);

  return worldInfos.map(worldInfo => ({
    ...worldInfo,
    entriesCount: worldInfo.world_info_entries?.length || 0,
    likesCount: worldInfo.likes_count || 0,
    tags: worldInfo.world_info_tags?.map(wt => wt.tags).filter(Boolean) || [],
    creator: creatorsMap.get(worldInfo.creator_id)
  }));
};

export const useUserWorldInfos = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-world-infos-snapshot', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const snap = await getWorldInfoSnapshot(user.id, 50, 0);
      if (!snap) return [];
      const favorited = new Set((snap.favorited_ids||[]).map((r:any)=>r.id));
      const used = new Set((snap.used_ids||[]).map((r:any)=>r.id));
      // Merge owned with public slice to avoid duplicates
      const publicMap = new Map((snap.public||[]).map(w=>[w.id,w]));
      (snap.owned||[]).forEach(o=>{ if(!publicMap.has(o.id)) publicMap.set(o.id,o); });
      return Array.from(publicMap.values()).map(w=>({
        ...w,
        favorited: favorited.has(w.id),
        used: used.has(w.id),
        tags: (snap.tags && snap.tags[w.id]) || [],
        likes_count: snap.counts?.[w.id]?.likes || 0,
        favorites_count: snap.counts?.[w.id]?.favorites || 0,
        usage_count: snap.counts?.[w.id]?.usage || 0
      }));
    },
    enabled: !!user?.id,
    staleTime: 5*60*1000,
    gcTime: 15*60*1000,
  });
};

export const useUserWorldInfoCollection = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-world-info-collection', user?.id],
    queryFn: () => fetchUserWorldInfoCollection(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

// Single world info with entries
export const useWorldInfoWithEntries = (worldInfoId: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['world-info-with-entries', worldInfoId, user?.id],
    queryFn: async () => {
      if (!worldInfoId) throw new Error('Missing required data');
      const { data: worldInfo, error: worldInfoError } = await supabase
        .from('world_infos')
        .select(`
          *,
          world_info_entries(*)
        `)
        .eq('id', worldInfoId)
        .single();
      if (worldInfoError || !worldInfo) throw new Error('Failed to fetch world info');
      // Enforce visibility: if private and not owner, block
      if (worldInfo.visibility === 'private' && (!user || worldInfo.creator_id !== user.id)) {
        throw new Error('World info not public');
      }
      return { ...worldInfo, entries: worldInfo.world_info_entries || [] };
    },
    enabled: !!worldInfoId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    retry: (failureCount, error) => {
      const msg = (error as any)?.message || '';
      if (msg.includes('not public')) return false;
      return failureCount < 3;
    }
  });
};

// Tags query
export const useAllTags = () => {
  return useQuery({
    queryKey: ['all-tags'],
    queryFn: async () => {
      const { data: tags, error } = await supabase
        .from('tags')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        throw new Error('Failed to fetch tags');
      }

      return tags || [];
    },
    staleTime: 1000 * 60 * 15, // 15 minutes (tags rarely change)
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
};

// Public world infos query
export const usePublicWorldInfos = () => {
  return useQuery({
    queryKey: ['public-world-infos-snapshot'],
    queryFn: async () => {
      const snap = await getWorldInfoSnapshot(null, 50, 0);
      if (!snap) return [];
      return (snap.public||[]).map(w=>({
        ...w,
        tags: (snap.tags && snap.tags[w.id]) || [],
        likes_count: snap.counts?.[w.id]?.likes || 0,
        favorites_count: snap.counts?.[w.id]?.favorites || 0,
        usage_count: snap.counts?.[w.id]?.usage || 0
      }));
    },
    staleTime: 5*60*1000,
    gcTime: 15*60*1000,
  });
};

export const useSearchPublicWorldInfos = (searchParams: SearchParams) => {
  return useQuery({
    queryKey: ['world-infos', 'search-snapshot', searchParams],
    queryFn: async () => {
      // Fetch base snapshot (first page large enough for filtering)
      const snap = await getWorldInfoSnapshot(null, 200, 0);
      if (!snap) return { data: [], total: 0, hasMore: false };
      let list: any[] = snap.public || [];
      const { searchQuery, filters, sortBy, limit, offset } = searchParams;
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(w => (w.name||'').toLowerCase().includes(q) || (w.short_description||'').toLowerCase().includes(q));
      }
      if (filters.creator && filters.creator.trim()) {
        // Need creator usernames; fetch profiles for involved creator_ids once
        const creatorIds = [...new Set(list.map(w=>w.creator_id))];
        const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', creatorIds);
        const profileMap = new Map((profiles||[]).map(p=>[p.id, p.username?.toLowerCase()]));
        const creatorSearch = filters.creator.toLowerCase();
        list = list.filter(w => (profileMap.get(w.creator_id)||'').includes(creatorSearch));
      }
      if (filters.nsfw === false && snap.tags) {
        // Exclude those with nsfw tag id 24
        const nsfwIds = Object.entries(snap.tags).filter(([_, tags]: any) => (tags as any[]).some(t=>t.id===24)).map(([id])=>id);
        const nsfwSet = new Set(nsfwIds);
        list = list.filter(w => !nsfwSet.has(w.id));
      }
      if (filters.tags && filters.tags.length && snap.tags) {
        list = list.filter(w => {
          const wt = snap.tags[w.id] || [];
            return wt.some((t:any)=>filters.tags!.includes(t.name));
        });
      }
      // Augment counts & tags
      list = list.map(w => ({
        ...w,
        tags: (snap.tags && snap.tags[w.id]) || [],
        likes_count: snap.counts?.[w.id]?.likes || 0,
        favorites_count: snap.counts?.[w.id]?.favorites || 0,
        usage_count: snap.counts?.[w.id]?.usage || 0
      }));
      // Sorting
      switch (sortBy) {
        case 'newest':
          list.sort((a,b)=> new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          break;
        case 'conversations':
          list.sort((a,b)=>(b.usage_count||0)-(a.usage_count||0));
          break;
        case 'popular':
        default:
          list.sort((a,b)=>(b.interaction_count||0)-(a.interaction_count||0));
          break;
      }
      const total = list.length;
      const sliced = list.slice(offset, offset+limit);
      const hasMore = offset + limit < total;
      return { data: sliced, total, hasMore };
    },
    enabled: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};

// World info tags query
export const useWorldInfoTags = (worldInfoId: string | null) => {
  return useQuery({
    queryKey: ['world-info-tags', worldInfoId],
    queryFn: async () => {
      if (!worldInfoId) throw new Error('World info ID required');
      
      const { data: worldInfoTags, error } = await supabase
        .from('world_info_tags')
        .select(`
          tags(id, name)
        `)
        .eq('world_info_id', worldInfoId);

      if (error) {
        throw new Error('Failed to fetch world info tags');
      }

      return worldInfoTags?.map(wt => wt.tags).filter(Boolean) || [];
    },
    enabled: !!worldInfoId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};