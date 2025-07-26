import React, { useState, useEffect } from 'react';
import { CharacterGrid } from '@/components/discover/CharacterGrid';
import { CharacterFilterBar } from '@/components/discover/CharacterFilterBar';
import { CharacterFilters } from '@/types/character';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/ui/TopBar';
import { PublicNavigation } from '@/components/ui/PublicNavigation';
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
      
      {/* Standardized TopBar */}
      <TopBar
        title="Discover Characters"
        subtitle="Explore amazing AI characters created by the community"
        leftContent={<PublicNavigation />}
        className="bg-[#1a1a2e]/95 backdrop-blur-sm"
      />

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