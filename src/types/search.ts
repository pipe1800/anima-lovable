// Centralized search parameter interface used across character & world info search.
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
