import React, { useState, useEffect } from 'react';
import { WorldInfoGrid } from './WorldInfoGrid';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardData, preloadDashboardData } from '@/hooks/useDashboard';
import { useQueryClient } from '@tanstack/react-query';
import { NSFWToggle } from '@/components/NSFWToggle';
import { useNSFW } from '@/contexts/NSFWContext';
import { usePublicWorldInfos, useSearchPublicWorldInfos } from '@/hooks/useWorldInfos';
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

export function WorldInfoDiscoverContent() {
  const { user, profile } = useAuth();
  const { nsfwEnabled } = useNSFW();
  const { data: dashboardData } = useDashboardData();
  const userCredits = dashboardData?.credits || 0;
  const username = profile?.username || user?.email?.split('@')[0] || 'User';
  const queryClient = useQueryClient();
  
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Build search parameters from current state
  const searchParams: SearchParams = {
    searchQuery: searchInput, // Use searchInput directly 
    sortBy,
    filters: {
      tags: selectedTags,
      creator: '',
      nsfw: nsfwEnabled,
      gender: 'any'
    },
    limit: 20,
    offset: (currentPage - 1) * 20
  };

  // Use search hook with manual refetch
  const { data: searchResults, refetch: executeSearch, isLoading: isSearching } = useSearchPublicWorldInfos(searchParams);
  
  // Fallback to initial load of popular world infos
  const { data: initialWorldInfos = [] } = usePublicWorldInfos();

  // Available filter tags
  const availableTags = [
    'Fantasy', 'Sci-Fi', 'Romance', 'Adventure', 'Mystery', 'Horror',
    'Comedy', 'Drama', 'Historical', 'Modern', 'Anime', 'Realistic',
    'Supernatural', 'Magic', 'School', 'Work', 'Family', 'Friends'
  ];

  // Handle search button click
  const handleSearch = () => {
    setHasSearched(true);
    setCurrentPage(1); // Reset to first page when searching
    executeSearch();
  };

  // Handle search on Enter key
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Update search params and refetch with new page
    executeSearch();
  };

  // Handle tag selection
  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
    // Don't auto-trigger search - user must click search button
  };

  // Remove individual tag
  const removeTag = (tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedTags([]);
    setSearchInput('');
    setCurrentPage(1);
    setHasSearched(false);
  };

  // Handle surprise me - navigate to random world info
  const handleSurpriseMe = async () => {
    const worldInfosToChooseFrom = hasSearched && searchResults?.data ? searchResults.data : initialWorldInfos;
    
    if (!worldInfosToChooseFrom || worldInfosToChooseFrom.length === 0) return;
    
    const randomIndex = Math.floor(Math.random() * worldInfosToChooseFrom.length);
    const randomWorldInfo = worldInfosToChooseFrom[randomIndex];
    
    if (randomWorldInfo) {
      // Navigate to world info details page
      window.location.href = `/world-info/${randomWorldInfo.id}`;
    }
  };

  // Preload dashboard data after discover loads
  useEffect(() => {
    if (user?.id) {
      // Small delay to ensure discovery renders first
      const timer = setTimeout(() => {
        preloadDashboardData(user.id, queryClient);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [user?.id, queryClient]);

  // World infos to display and active filters
  const displayWorldInfos = hasSearched && searchResults?.data ? searchResults.data : initialWorldInfos;
  const activeFilters = selectedTags.length > 0 || searchInput.length > 0;

  return (
    <div className="min-h-screen bg-[#121212] w-full">
      {/* Header - Desktop Only */}
      <header className="bg-[#1a1a2e] border-b border-gray-700/50 p-3 sm:p-4 hidden md:block">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl sm:text-2xl font-bold">
              World Info Discovery
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm">Explore and discover world information</p>
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
              placeholder="Search world info by name or description... (Press Enter to search)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
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
                      <label
                        htmlFor={tag}
                        className="text-sm text-white cursor-pointer"
                      >
                        {tag}
                      </label>
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
              <SelectItem value="conversations" className="text-white hover:bg-gray-700">Most Used</SelectItem>
              <SelectItem value="relevance" className="text-white hover:bg-gray-700">Relevance</SelectItem>
            </SelectContent>
          </Select>

          {/* Search Button */}
          <Button
            onClick={handleSearch}
            disabled={isSearching}
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium"
          >
            <Search className="w-4 h-4 mr-2" />
            {isSearching ? 'Searching...' : 'Search'}
          </Button>

          {/* Surprise Me Button */}
          <Button
            onClick={handleSurpriseMe}
            disabled={hasSearched ? searchResults?.data?.length === 0 : initialWorldInfos.length === 0}
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium"
          >
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
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-gray-400 hover:text-[#FF7A00] text-sm"
            >
              Clear All
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTags.map(tag => (
              <Badge 
                key={tag} 
                variant="outline" 
                className="bg-[#FF7A00]/20 border-[#FF7A00]/30 text-[#FF7A00] hover:bg-[#FF7A00]/30 px-3 py-1 flex items-center gap-2"
              >
                <span>{tag}</span>
                <button 
                  onClick={() => removeTag(tag)} 
                  className="hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* World Info Grid */}
      <WorldInfoGrid 
        worldInfos={displayWorldInfos}
        isLoading={isSearching}
        hasSearched={hasSearched}
        totalCount={searchResults?.total || 0}
        currentPage={currentPage}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
