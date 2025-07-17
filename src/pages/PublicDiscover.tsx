import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { DiscoverControlBar } from '@/components/discover/DiscoverControlBar';
import { PublicCharacterGrid } from '@/components/discover/PublicCharacterGrid';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

const PublicDiscover = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [filterBy, setFilterBy] = useState('all');
  const [activeFilters, setActiveFilters] = useState<Array<{
    id: string;
    label: string;
    type: string;
  }>>([]);

  const handleAdvancedFiltersApplied = (filters: {
    tags: string[];
    creator: string;
    nsfw: boolean;
    gender: string;
  }) => {
    // For now, just log - this can be enhanced later for public page
    console.log('Advanced filters applied on public page:', filters);
  };

  const removeFilter = (filterId: string) => {
    setActiveFilters(prev => prev.filter(filter => filter.id !== filterId));
    // Reset the corresponding filter state based on type
    const filterToRemove = activeFilters.find(f => f.id === filterId);
    if (filterToRemove?.type === 'category') {
      setFilterBy('all');
    }
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
    setFilterBy('all');
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#121212] to-[#1a1a2e] text-white">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-gradient-radial from-[#FF7A00]/5 to-transparent opacity-50"></div>
      
      {/* Sticky Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-gray-700/50">
        <div className="flex items-center justify-between h-16 pl-4 pr-4 sm:pr-6 lg:pr-8">
          {/* Logo */}
          <div className="flex-shrink-0">
            <img 
              src="https://rclpyipeytqbamiwcuih.supabase.co/storage/v1/object/sign/images/45d0ba23-cfa2-404a-8527-54e83cb321ef.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9mYmU5OTM4My0yODYxLTQ0N2UtYThmOC1hY2JjNzU3YjQ0YzgiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJpbWFnZXMvNDVkMGJhMjMtY2ZhMi00MDRhLTg1MjctNTRlODNjYjMyMWVmLnBuZyIsImlhdCI6MTc1MjI1MjA4MywiZXhwIjo0OTA1ODUyMDgzfQ.OKhncau8pVPBvcnDrafnifJdihe285oi5jcpp1z3-iM"
              alt="Anima AI Chat" 
              className="h-16 w-auto"
            />
          </div>

          {/* Navigation Links */}
          <div className="flex items-center space-x-4">
            <Link to="/">
              <Button 
                variant="ghost" 
                className="text-white hover:text-[#FF7A00] hover:bg-[#FF7A00]/10 font-medium"
              >
                Home
              </Button>
            </Link>
            <Link to="/characters">
              <Button 
                variant="ghost" 
                className="text-[#FF7A00] hover:text-white hover:bg-[#FF7A00]/10 font-medium"
              >
                Characters
              </Button>
            </Link>
            <Link to="/auth">
              <Button 
                variant="outline" 
                className="bg-transparent border-[#FF7A00] text-[#FF7A00] hover:bg-[#FF7A00] hover:text-white transition-colors"
              >
                Login
              </Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button 
                className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-medium transition-colors"
              >
                Sign Up
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 w-full">
        {/* Header */}
        <header className="pt-8 pb-6 px-4">
          <div className="text-left">
            <h1 className="text-white text-3xl sm:text-4xl lg:text-5xl font-bold mb-2">Character Discovery</h1>
            <p className="text-gray-300 text-lg sm:text-xl">Explore the neural network of legends</p>
          </div>
        </header>

        {/* Control Bar */}
        <DiscoverControlBar 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          sortBy={sortBy} 
          setSortBy={setSortBy} 
          filterBy={filterBy} 
          setFilterBy={setFilterBy} 
          onAdvancedFiltersApplied={handleAdvancedFiltersApplied}
        />

        {/* Active Filter Pills */}
        {activeFilters.length > 0 && (
          <div className="px-6 pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-sm font-medium">Active Filters:</h3>
              <button 
                onClick={clearAllFilters} 
                className="text-gray-400 hover:text-[#FF7A00] text-sm font-medium transition-colors"
              >
                Clear All
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeFilters.map(filter => (
                <Badge 
                  key={filter.id} 
                  variant="outline" 
                  className="bg-[#FF7A00]/20 border-[#FF7A00]/30 text-[#FF7A00] hover:bg-[#FF7A00]/30 px-3 py-1 flex items-center space-x-2"
                >
                  <span>{filter.label}</span>
                  <button 
                    onClick={() => removeFilter(filter.id)} 
                    className="hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Character Grid */}
        <PublicCharacterGrid 
          searchQuery={searchQuery} 
          sortBy={sortBy} 
          filterBy={filterBy} 
        />
      </div>
    </div>
  );
};

export default PublicDiscover;