import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CharacterGrid } from './CharacterGrid';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardData, preloadDashboardData } from '@/hooks/useDashboard';
import { useQueryClient } from '@tanstack/react-query';
import { NSFWToggle } from '@/components/NSFWToggle';
import { useNSFW } from '@/contexts/NSFWContext';
import { useChatCreation } from '@/hooks/useChatCreation';
import { usePublicCharacters, useSearchPublicCharacters } from '@/hooks/useCharacters';
import { SearchParams } from '@/lib/supabase-queries';
import { Search, Sparkles, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate, useLocation } from 'react-router-dom';

export function DiscoverContent() {
  const { user, profile } = useAuth();
  const { nsfwEnabled } = useNSFW();
  const { data: dashboardData } = useDashboardData();
  const queryClient = useQueryClient();
  const { startChat, isCreating } = useChatCreation();
  const navigate = useNavigate();
  const location = useLocation();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const prefetchNextRef = useRef<boolean>(false);
  const hasIncrementedRef = useRef(false);
  const [autoLoadEnabled, setAutoLoadEnabled] = useState(false);
  
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [initialAccumulated, setInitialAccumulated] = useState<any[]>([]);

  // Hydrate filters from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    const s = params.get('sort') || 'popular';
    const t = params.get('tags');
    const p = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
    const searched = params.get('searched') === '1';
    setSearchInput(q);
    setSortBy(s);
    setSelectedTags(t ? t.split(',').filter(Boolean) : []);
    setCurrentPage(p);
    setHasSearched(searched);
    hasIncrementedRef.current = false; // reset increment guard on navigation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Persist filters to URL (avoid defaults)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (searchInput) params.set('q', searchInput); else params.delete('q');
    if (sortBy && sortBy !== 'popular') params.set('sort', sortBy); else params.delete('sort');
    if (selectedTags.length) params.set('tags', selectedTags.join(',')); else params.delete('tags');
    if (currentPage > 1) params.set('page', String(currentPage)); else params.delete('page');
    if (hasSearched) params.set('searched', '1'); else params.delete('searched');
    const query = params.toString();
    const next = `${location.pathname}${query ? `?${query}` : ''}`;
    if (next !== `${location.pathname}${location.search}`) {
      navigate(next, { replace: true });
    }
  }, [searchInput, sortBy, selectedTags, currentPage, hasSearched, navigate, location.pathname, location.search]);

  // Debounced auto-search
  useEffect(() => {
    if (!hasSearched) return; // only auto-search in search mode
    const id = setTimeout(() => {
      setCurrentPage(1);
      executeSearch();
    }, 300);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, sortBy, selectedTags]);

  // Memoized params
  const searchParams: SearchParams = useMemo(() => ({
    searchQuery: searchInput,
    sortBy,
    filters: {
      tags: selectedTags,
      creator: '',
      nsfw: nsfwEnabled,
      gender: 'any'
    },
    limit: 20,
    offset: (currentPage - 1) * 20
  }), [searchInput, sortBy, selectedTags, nsfwEnabled, currentPage]);

  const { data: searchResults, refetch: executeSearch, isFetching: isSearchFetching } = useSearchPublicCharacters(searchParams);

  // Initial characters with offset
  const initialOffset = hasSearched ? 0 : (currentPage - 1) * 20;
  const { 
    data: initialCharacters = [], 
    isLoading: isInitialLoading,
    isFetching: isInitialFetching,
    isPlaceholderData: isInitialPlaceholder,
  } = usePublicCharacters(20, initialOffset);

  // Accumulate initial characters
  useEffect(() => {
    if (hasSearched) return;
    if (currentPage === 1) setInitialAccumulated(initialCharacters);
    else if (initialCharacters?.length) {
      setInitialAccumulated(prev => {
        const ids = new Set(prev.map((c: any) => c.id));
        const merged = [...prev];
        initialCharacters.forEach((c: any) => { if (!ids.has(c.id)) merged.push(c); });
        return merged;
      });
    }
  }, [initialCharacters, currentPage, hasSearched]);

  // Manual refetch after state settles for search
  useEffect(() => {
    if (hasSearched) executeSearch();
  }, [hasSearched, executeSearch, searchParams]);

  // Infinite scroll for initial mode, but only after user enables via click
  useEffect(() => {
    if (hasSearched) return;
    if (!autoLoadEnabled) return; // disabled until user clicks
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting) {
        if (!hasIncrementedRef.current) {
          setCurrentPage((p) => p + 1);
          hasIncrementedRef.current = true;
        }
      } else {
        hasIncrementedRef.current = false;
      }
    }, { rootMargin: '0px 0px 40% 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasSearched, autoLoadEnabled]);

  // When clearing filters or exiting search, reset page to 1
  useEffect(() => {
    if (!hasSearched) {
      setCurrentPage((p) => (p < 1 ? 1 : p));
    }
  }, [hasSearched]);

  // Available filter tags
  const availableTags = [
    'Fantasy', 'Sci-Fi', 'Romance', 'Adventure', 'Mystery', 'Horror',
    'Comedy', 'Drama', 'Historical', 'Modern', 'Anime', 'Realistic',
    'Supernatural', 'Magic', 'School', 'Work', 'Family', 'Friends'
  ];

  // Handle search button click
  const handleSearch = () => {
    setHasSearched(true);
    setCurrentPage(1);
    executeSearch();
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    // If user manually asks for next page, enable auto-load
    if (page > currentPage && !autoLoadEnabled) setAutoLoadEnabled(true);
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle tag selection
  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  // Remove individual tag
  const removeTag = (tag: string) => setSelectedTags(prev => prev.filter(t => t !== tag));

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedTags([]);
    setSearchInput('');
    setCurrentPage(1);
    setHasSearched(false);
  };

  // Handle surprise me - open chat with random character or view if logged out
  const handleSurpriseMe = async () => {
    const charactersToChooseFrom = hasSearched && searchResults?.data ? searchResults.data : initialAccumulated.length ? initialAccumulated : initialCharacters;
    if (!charactersToChooseFrom?.length) return;
    const randomCharacter = charactersToChooseFrom[Math.floor(Math.random() * charactersToChooseFrom.length)];
    if (randomCharacter) await startChat(randomCharacter);
  };

  // Defer dashboard preload so discover paints first
  useEffect(() => {
    if (!user?.id) return;
    const run = () => preloadDashboardData(user.id, queryClient);
    const win: any = window as any;
    const id = win.requestIdleCallback ? win.requestIdleCallback(run, { timeout: 1500 }) : setTimeout(run, 800);
    return () => {
      if (win.cancelIdleCallback && id) win.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [user?.id, queryClient]);

  // Display data
  const displayCharacters = hasSearched && searchResults?.data ? searchResults.data : (initialAccumulated.length ? initialAccumulated : initialCharacters);

  // Determine grid loading state: show skeletons when fetching and nothing to display yet
  const isGridLoading = hasSearched
    ? (isSearchFetching && displayCharacters.length === 0)
    : ((isInitialLoading || isInitialFetching) && displayCharacters.length === 0);

  return (
    <div className="min-h-screen bg-[#121212] w-full">
      {/* Header - Desktop Only */}
      <header className="bg-[#1a1a2e] border-b border-gray-700/50 p-3 sm:p-4 hidden md:block">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl sm:text-2xl font-bold">
              Character Discovery
            </h1>
            <p className="text-gray-400 text-sm sm:text-base">Explore and discover characters</p>
          </div>
          <div className="flex items-center">
            <NSFWToggle />
          </div>
        </div>
      </header>

      {/* Search and Controls Bar */}
      <div className="bg-[#1a1a2e]/50 backdrop-blur-sm border-b border-gray-700/50 px-3 sm:px-6 py-3 sm:py-4 sticky top-0 z-10">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search characters by name or description... (Press Enter to search)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if ((e as any).key === 'Enter') handleSearch(); }}
              className="pl-9 bg-[#121212] border-gray-700 text-white placeholder-gray-400 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20"
            />
          </div>

          {/* Filter Dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto bg-[#121212] border-gray-700 text-white hover:bg-gray-700">
                <Filter className="w-4 h-4 mr-2" />
                Categories
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-[#1a1a2e] border-gray-700 p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-white">Filter by Tags</h4>
                  {selectedTags.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTags([])}
                      className="text-gray-400 hover:text-white"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {availableTags.map((tag) => (
                    <div key={tag} className="flex items-center space-x-2">
                      <Checkbox
                        id={tag}
                        checked={selectedTags.includes(tag)}
                        onCheckedChange={() => handleTagToggle(tag)}
                        className="border-gray-600 data-[state=checked]:bg-[#FF7A00] data-[state=checked]:border-[#FF7A00]"
                      />
                      <label htmlFor={tag} className="text-sm text-white cursor-pointer">{tag}</label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Sort Dropdown */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-[180px] bg-[#121212] border-gray-700 text-white">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a2e] border-gray-700">
              <SelectItem value="popular" className="text-white hover:bg-gray-700">Most Popular</SelectItem>
              <SelectItem value="newest" className="text-white hover:bg-gray-700">Newest First</SelectItem>
              <SelectItem value="conversations" className="text-white hover:bg-gray-700">Most Conversations</SelectItem>
              <SelectItem value="relevance" className="text-white hover:bg-gray-700">Relevance</SelectItem>
            </SelectContent>
          </Select>

          {/* Search Button */}
          <Button onClick={handleSearch} disabled={isSearchFetching} className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium">
            <Search className="w-4 h-4 mr-2" />
            {isSearchFetching ? 'Searching...' : 'Search'}
          </Button>

          {/* Surprise Me Button */}
          <Button onClick={handleSurpriseMe} disabled={isCreating || (hasSearched ? (searchResults?.data?.length === 0) : (displayCharacters.length === 0))} className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium">
            <Sparkles className="w-4 h-4 mr-2" />
            Surprise Me!
          </Button>
        </div>
      </div>

      {/* Active Filter Pills */}
      {selectedTags.length > 0 && (
        <div className="px-3 sm:px-6 py-3 border-b border-gray-700/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-sm font-medium">Active Filters:</h3>
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-gray-400 hover:text-[#FF7A00] text-sm">Clear All</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTags.map(tag => (
              <Badge key={tag} variant="outline" className="bg-[#FF7A00]/20 border-[#FF7A00]/30 text-[#FF7A00] hover:bg-[#FF7A00]/30 px-3 py-1 flex items-center gap-2">
                <span>{tag}</span>
                <button onClick={() => removeTag(tag)} className="hover:text-white transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Character Grid */}
      <CharacterGrid 
        characters={displayCharacters}
        isLoading={isGridLoading}
        hasSearched={hasSearched}
        totalCount={searchResults?.total || 0}
        currentPage={currentPage}
        onPageChange={handlePageChange}
      />
      {/* Sentinel for infinite scroll in initial mode - only when enabled by user */}
      {!hasSearched && autoLoadEnabled && (
        <div ref={sentinelRef} className="h-8" />
      )}
    </div>
  );
}