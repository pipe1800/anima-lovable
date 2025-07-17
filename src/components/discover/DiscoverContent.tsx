import React, { useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DiscoverControlBar } from './DiscoverControlBar';
import { CharacterGrid } from './CharacterGrid';
import { WorldInfoGrid } from './WorldInfoGrid';
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
  
  // Check URL params for default tab
  const urlParams = new URLSearchParams(window.location.search);
  const defaultTab = urlParams.get('tab') === 'world-infos' ? 'world-infos' : 'characters';
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
              <span className="hidden sm:inline">Discovery Hub</span>
              <span className="sm:hidden">Discover</span>
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm hidden sm:block">Explore characters and world infos</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <Tabs defaultValue={defaultTab} className="w-full">
        <div className="border-b border-gray-700/50 bg-[#1a1a2e]">
          <div className="px-3 sm:px-6 py-2">
            <TabsList className="bg-[#121212] border border-gray-700/50 w-full sm:w-auto">
              <TabsTrigger 
                value="characters" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-400 flex-1 sm:flex-none text-sm"
              >
                Characters
              </TabsTrigger>
              <TabsTrigger 
                value="world-infos" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-400 flex-1 sm:flex-none text-sm"
              >
                <span className="hidden sm:inline">World Infos</span>
                <span className="sm:hidden">Worlds</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

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

        {/* Tab Content */}
        <TabsContent value="characters" className="mt-0">
          <CharacterGrid 
            searchQuery={searchQuery} 
            sortBy={sortBy} 
            filterBy={filterBy} 
            advancedFilters={advancedFilters}
          />
        </TabsContent>

        <TabsContent value="world-infos" className="mt-0">
          <WorldInfoGrid 
            searchQuery={searchQuery} 
            sortBy={sortBy} 
            filterBy={filterBy} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}