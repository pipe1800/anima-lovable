export interface SearchParams {
  searchQuery?: string;
  sortBy: string;
  filters: {
    tags?: string[];
    creator?: string;
    nsfw?: boolean;
    gender?: string;
  };
  limit: number;
  offset: number;
}

export interface SearchResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  error?: unknown;
}
