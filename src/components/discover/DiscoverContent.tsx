import React, { useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { DiscoverControlBar } from './DiscoverControlBar';
import { CharacterGrid } from './CharacterGrid';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { MobileNavMenu } from '@/components/layout/MobileNavMenu';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardData } from '@/hooks/useDashboard';

export function DiscoverContent() {
  const { user, profile } = useAuth();
  const { data: dashboardData } = useDashboardData();
  const userCredits = dashboardData?.credits || 0;
  const username = profile?.username || user?.email?.split('@')[0] || 'User';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [filterBy, setFilterBy] = useState('all');
  const [advancedFilters, setAdvancedFilters] = useState({
    tags: [] as string[],
    creator: '',
    nsfw: false,
    gender: 'any'
  });
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
    setAdvancedFilters(filters);
    
    // Update active filters display
    const newActiveFilters = [];
    
    if (filters.tags.length > 0) {
      newActiveFilters.push({
        id: 'tags',
        label: `Tags: ${filters.tags.join(', ')}`,
        type: 'tags'
      });
    }
    
    if (filters.creator) {
      newActiveFilters.push({
        id: 'creator',
        label: `Creator: ${filters.creator}`,
        type: 'creator'
      });
    }
    
    if (filters.nsfw) {
      newActiveFilters.push({
        id: 'nsfw',
        label: 'NSFW Content',
        type: 'nsfw'
      });
    }
    
    if (filters.gender !== 'any') {
      newActiveFilters.push({
        id: 'gender',
        label: `Gender: ${filters.gender}`,
        type: 'gender'
      });
    }
    
    setActiveFilters(newActiveFilters);
  };

  const removeFilter = (filterId: string) => {
    setActiveFilters(prev => prev.filter(filter => filter.id !== filterId));
    // Reset the corresponding filter state based on type
    const filterToRemove = activeFilters.find(f => f.id === filterId);
    if (filterToRemove?.type === 'category') {
      setFilterBy('all');
    } else if (filterToRemove?.type === 'tags') {
      setAdvancedFilters(prev => ({ ...prev, tags: [] }));
    } else if (filterToRemove?.type === 'creator') {
      setAdvancedFilters(prev => ({ ...prev, creator: '' }));
    } else if (filterToRemove?.type === 'nsfw') {
      setAdvancedFilters(prev => ({ ...prev, nsfw: false }));
    } else if (filterToRemove?.type === 'gender') {
      setAdvancedFilters(prev => ({ ...prev, gender: 'any' }));
    }
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
    setFilterBy('all');
    setSearchQuery('');
    setAdvancedFilters({
      tags: [],
      creator: '',
      nsfw: false,
      gender: 'any'
    });
  };
  return (
    <div className="min-h-screen bg-[#121212] w-full">
      {/* Header */}
      {/* Header - Desktop Only */}
      <header className="bg-[#1a1a2e] border-b border-gray-700/50 p-3 sm:p-4 hidden md:block">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl sm:text-2xl font-bold">
              <span className="hidden sm:inline">Character Discovery</span>
              <span className="sm:hidden">Characters</span>
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm hidden sm:block">Explore and discover characters</p>
          </div>
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
        <div className="px-3 sm:px-6 pb-4">
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
      <CharacterGrid 
        searchQuery={searchQuery} 
        sortBy={sortBy} 
        filterBy={filterBy} 
        advancedFilters={advancedFilters}
      />
    </div>
  );
}