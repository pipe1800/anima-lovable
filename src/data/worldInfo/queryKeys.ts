// Query key factory for world info domain
export const worldInfoQueryKeys = {
  all: ['world-info'] as const,
  allTags: ['tags'] as const,
  userWorldInfos: (userId?: string | null) => ['user-world-infos', userId] as const,
  userWorldInfoCollection: (userId?: string | null) => ['user-world-info-collection', userId] as const,
  worldInfo: (id: string) => ['world-info', id] as const,
  entries: (id: string) => ['world-info-entries', id] as const,
  tags: (id: string) => ['world-info-tags', id] as const,
  public: ['public-world-infos'] as const,
};

export type WorldInfoQueryKeyFactory = typeof worldInfoQueryKeys;
