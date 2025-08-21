import React, { useState, useEffect, useMemo } from 'react';
import { PublicTopBar } from '@/components/ui/PublicTopBar';
import { CharacterGrid } from '@/components/discover/CharacterGrid';
import { usePublicCharacters, useSearchPublicCharacters } from '@/hooks/useCharacters';
import { SearchParams } from '@/data';
import { Search, Sparkles, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';

const PublicDiscover = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Memoized search params
  const searchParams: SearchParams = useMemo(() => ({
    searchQuery: searchInput,
    sortBy,
    filters: {
      tags: selectedTags,
      creator: '',
      nsfw: false, // Always false for public pages
      gender: 'any'
    },
    limit: 20,
    offset: (currentPage - 1) * 20
  }), [searchInput, sortBy, selectedTags, currentPage]);

  // Use search hook with manual refetch
  const { data: searchResults, refetch: executeSearch, isLoading: isSearching } = useSearchPublicCharacters(searchParams);
  
  // Fallback to initial load of popular characters
  const { data: initialCharacters = [], isLoading: isInitialLoading } = usePublicCharacters(20, 0);

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

  // Handle enter key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Handle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const removeTag = (tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSortBy('popular');
    setSelectedTags([]);
    setCurrentPage(1);
    setHasSearched(false);
  };

  // Handle surprise me - navigate to random character
  const handleSurpriseMe = () => {
    const charactersToChooseFrom = hasSearched && searchResults?.data ? searchResults.data : initialCharacters;
    if (!charactersToChooseFrom || charactersToChooseFrom.length === 0) return;
    const randomIndex = Math.floor(Math.random() * charactersToChooseFrom.length);
    const randomCharacter = charactersToChooseFrom[randomIndex];
    if (randomCharacter) {
      navigate(`/characters/${randomCharacter.id}`);
    }
  };

  // Characters to display and active filters
  const displayCharacters = hasSearched && searchResults?.data ? searchResults.data : initialCharacters;
  const activeFilters = selectedTags.length > 0 || searchInput.length > 0;

  return (
    <div className="min-h-screen bg-[#121212] w-full">
      {/* Background effects */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#1a1a2e] to-[#121212] opacity-50 z-0"></div>
      <div className="absolute inset-0 bg-gradient-radial from-[#FF7A00]/5 to-transparent opacity-50"></div>
      
      {/* Public Top Bar */}
      <PublicTopBar />

      {/* Main Content */}
      <div className="relative z-10 w-full">
        {/* Header */}
    

        {/* Search and Controls Bar */}
        <div className="bg-[#1a1a2e]/50 border-b border-gray-700/50 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              {/* Search Input */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search characters by name or description..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-10 bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-[#FF7A00] text-sm sm:text-base"
                />
              </div>

              {/* Sort Dropdown */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-[140px] bg-gray-800/50 border-gray-600 text-white">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="popular" className="text-white hover:bg-gray-700">Most Popular</SelectItem>
                  <SelectItem value="newest" className="text-white hover:bg-gray-700">Newest</SelectItem>
                  <SelectItem value="conversations" className="text-white hover:bg-gray-700">Most Chats</SelectItem>
                </SelectContent>
              </Select>

              {/* Tags Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700 text-sm sm:text-base"
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Tags</span>
                    {selectedTags.length > 0 && (
                      <Badge className="ml-2 bg-[#FF7A00] text-white">{selectedTags.length}</Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 bg-gray-800 border-gray-700 p-4">
                  <div className="space-y-4">
                    <h4 className="font-medium text-white">Filter by Tags</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {availableTags.map(tag => (
                        <div key={tag} className="flex items-center space-x-2">
                          <Checkbox
                            id={tag}
                            checked={selectedTags.includes(tag)}
                            onCheckedChange={() => toggleTag(tag)}
                            className="border-gray-600 data-[state=checked]:bg-[#FF7A00] data-[state=checked]:border-[#FF7A00]"
                          />
                          <Label 
                            htmlFor={tag} 
                            className="text-sm text-gray-300 hover:text-white cursor-pointer"
                          >
                            {tag}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button 
                  onClick={handleSearch}
                  className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium text-sm sm:text-base"
                >
                  <Search className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Search</span>
                </Button>
                
              </div>
            </div>
          </div>
        </div>

        {/* Active Filters */}
        {activeFilters && (
          <div className="bg-[#1a1a2e]/30 px-3 sm:px-6 py-2 sm:py-3 border-b border-gray-700/30">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2">
              <span className="text-gray-400 text-sm sm:text-base">Active filters:</span>
              {searchInput && (
                <Badge 
                  variant="outline" 
                  className="bg-[#FF7A00]/20 border-[#FF7A00]/30 text-[#FF7A00] hover:bg-[#FF7A00]/30 px-2 sm:px-3 py-0.5 sm:py-1 text-sm sm:text-base"
                >
                  Search: {searchInput}
                  <button 
                    onClick={() => setSearchInput('')} 
                    className="ml-2 hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {selectedTags.map(tag => (
                <Badge 
                  key={tag} 
                  variant="outline" 
                  className="bg-[#FF7A00]/20 border-[#FF7A00]/30 text-[#FF7A00] hover:bg-[#FF7A00]/30 px-2 sm:px-3 py-0.5 sm:py-1 text-sm sm:text-base"
                >
                  {tag}
                  <button 
                    onClick={() => removeTag(tag)} 
                    className="ml-2 hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              <Button
                onClick={handleClearFilters}
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white text-sm sm:text-base"
              >
                Clear all
              </Button>
            </div>
          </div>
        )}

        {/* Character Grid - Reuse existing component */}
        <div className="max-w-7xl mx-auto">
          <CharacterGrid 
            characters={displayCharacters}
            isLoading={hasSearched ? isSearching : isInitialLoading}
            hasSearched={hasSearched}
            totalCount={searchResults?.total || 0}
            currentPage={currentPage}
            onPageChange={handlePageChange}
          />
        </div>

        {/* Call to Action for Sign Up */}
        {!hasSearched && displayCharacters.length > 0 && (
          <div className="max-w-4xl mx-auto px-4 py-12 text-center">
            <Card className="bg-gradient-to-br from-[#FF7A00]/20 to-[#FF7A00]/10 border-[#FF7A00]/30">
              <CardContent className="p-8">
                <h2 className="text-2xl font-bold text-white mb-4">
                  Ready to start chatting?
                </h2>
                <p className="text-gray-300 mb-6">
                  Join thousands of users creating amazing conversations with AI characters.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    onClick={() => navigate('/auth?mode=signup')}
                    className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-bold px-8 py-3"
                  >
                    Sign Up Free
                  </Button>
                  <Button
                    onClick={() => navigate('/auth')}
                    variant="outline"
                    className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10"
                  >
                    Login
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicDiscover;