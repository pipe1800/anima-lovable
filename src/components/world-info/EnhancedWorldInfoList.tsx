import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Plus, 
  Search, 
  Filter, 
  SortAsc, 
  SortDesc, 
  X,
  TrendingUp,
  Loader2,
  BookOpen,
  Globe
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/ui/TopBar';
import ImprovedWorldInfoCard from './ImprovedWorldInfoCard';
import { useUserWorldInfos, usePublicWorldInfos } from '@/hooks/useWorldInfos';

export function EnhancedWorldInfoList() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('updated_at');
  const [filterBy, setFilterBy] = useState('all');
  const [activeFilters, setActiveFilters] = useState<Array<{
    id: string;
    label: string;
    type: string;
  }>>([]);

  // Get user's world infos and public world infos
  const { data: userWorldInfos = [], isLoading: userLoading, error: userError } = useUserWorldInfos();
  const { data: publicWorldInfos = [], isLoading: publicLoading, error: publicError } = usePublicWorldInfos();

  const isLoading = userLoading || publicLoading;
  const error = userError || publicError;

  // Filter and sort user world infos
  const filteredUserWorldInfos = userWorldInfos.filter(worldInfo => {
    const matchesSearch = worldInfo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         worldInfo.short_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         false;
    
    const matchesFilter = filterBy === 'all' || 
                         worldInfo.name.toLowerCase().includes(filterBy.toLowerCase());
    
    return matchesSearch && matchesFilter;
  });

  const sortedUserWorldInfos = [...filteredUserWorldInfos].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'created_at':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'updated_at':
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      default:
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }
  });

  // Filter and sort public world infos
  const filteredPublicWorldInfos = publicWorldInfos.filter(worldInfo => {
    const matchesSearch = worldInfo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         worldInfo.short_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         false;
    
    const matchesFilter = filterBy === 'all' || 
                         worldInfo.name.toLowerCase().includes(filterBy.toLowerCase());
    
    return matchesSearch && matchesFilter;
  });

  const sortedPublicWorldInfos = [...filteredPublicWorldInfos].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'popularity':
        return b.usage_count - a.usage_count;
      case 'conversations':
        return b.interaction_count - a.interaction_count;
      default: // relevance
        return b.usage_count - a.usage_count;
    }
  });

  const clearAllFilters = () => {
    setActiveFilters([]);
    setFilterBy('all');
    setSearchQuery('');
  };

  const removeFilter = (filterId: string) => {
    setActiveFilters(prev => prev.filter(filter => filter.id !== filterId));
    const filterToRemove = activeFilters.find(f => f.id === filterId);
    if (filterToRemove?.type === 'category') {
      setFilterBy('all');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#121212] w-full">
        <TopBar title="World Infos" subtitle="Manage and discover world information" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
          <span className="ml-2 text-white">Loading world infos...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#121212] w-full">
        <TopBar title="World Infos" subtitle="Manage and discover world information" />
        <div className="text-center py-16">
          <div className="text-red-400 text-lg mb-2">{error.message}</div>
          <div className="text-gray-500 text-sm">Please try again later</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] w-full">
      <TopBar title="World Infos" subtitle="Manage and discover world information" />
      
      {/* Enhanced Controls Section */}
      <div className="bg-[#1a1a2e] border-b border-gray-700/50 p-3 sm:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => navigate('/world-info/create')}
                className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white flex items-center gap-2 px-4 py-2 font-medium"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Create World Info</span>
                <span className="sm:hidden">Create</span>
              </Button>
            </div>
          </div>

          {/* Search and Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search world infos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-[#121212] border-gray-700/50 text-white placeholder:text-gray-400 focus:border-[#FF7A00]/50"
              />
            </div>

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-[180px] bg-[#121212] border-gray-700/50 text-white">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-gray-700/50">
                <SelectItem value="updated_at">Recently Updated</SelectItem>
                <SelectItem value="created_at">Recently Created</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="popularity">Most Popular</SelectItem>
                <SelectItem value="conversations">Most Used</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter */}
            <Select value={filterBy} onValueChange={setFilterBy}>
              <SelectTrigger className="w-full sm:w-[140px] bg-[#121212] border-gray-700/50 text-white">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-gray-700/50">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="fantasy">Fantasy</SelectItem>
                <SelectItem value="sci-fi">Sci-Fi</SelectItem>
                <SelectItem value="modern">Modern</SelectItem>
                <SelectItem value="historical">Historical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active Filter Pills */}
          {activeFilters.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
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
        </div>
      </div>

      {/* Tabs for My World Infos vs Discover */}
      <Tabs defaultValue="my-worlds" className="w-full">
        <div className="border-b border-gray-700/50 bg-[#1a1a2e]">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2">
            <TabsList className="bg-[#121212] border border-gray-700/50 w-full sm:w-auto">
              <TabsTrigger 
                value="my-worlds" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-400 flex-1 sm:flex-none text-sm flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">My World Infos</span>
                <span className="sm:hidden">My Worlds</span>
              </TabsTrigger>
              <TabsTrigger 
                value="discover" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-400 flex-1 sm:flex-none text-sm flex items-center gap-2"
              >
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">Discover Worlds</span>
                <span className="sm:hidden">Discover</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* My World Infos Tab */}
        <TabsContent value="my-worlds" className="mt-0">
          <div className="max-w-7xl mx-auto p-3 sm:p-6">
            {/* Results Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white text-lg sm:text-xl font-semibold">
                {sortedUserWorldInfos.length} World Info{sortedUserWorldInfos.length !== 1 ? 's' : ''}
              </h2>
            </div>

            {/* World Info Grid */}
            {sortedUserWorldInfos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {sortedUserWorldInfos.map((worldInfo) => (
                  <ImprovedWorldInfoCard
                    key={worldInfo.id}
                    worldInfo={worldInfo}
                    isOwner={true}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-white text-lg font-semibold mb-2">No World Infos Found</h3>
                <p className="text-gray-400 mb-6 max-w-md mx-auto">
                  {searchQuery ? 'Try adjusting your search or filters' : 'Create your first world info to get started'}
                </p>
                <Button
                  onClick={() => navigate('/world-info/create')}
                  className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  Create World Info
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Discover Tab */}
        <TabsContent value="discover" className="mt-0">
          <div className="max-w-7xl mx-auto p-3 sm:p-6">
            {/* Results Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <h2 className="text-white text-lg sm:text-xl font-semibold">
                  {sortedPublicWorldInfos.length} Public World Info{sortedPublicWorldInfos.length !== 1 ? 's' : ''}
                </h2>
                <div className="flex items-center space-x-2 text-gray-400 text-sm">
                  <TrendingUp className="w-4 h-4" />
                  <span className="hidden sm:inline">Updated 2 minutes ago</span>
                  <span className="sm:hidden">Live</span>
                </div>
              </div>
            </div>

            {/* Public World Info Grid */}
            {sortedPublicWorldInfos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
                {sortedPublicWorldInfos.map((worldInfo, index) => (
                  <div
                    key={worldInfo.id}
                    className="bg-[#1a1a2e] border border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-2xl hover:shadow-[#FF7A00]/20 group overflow-hidden hover:scale-105 hover:-translate-y-2 transform rounded-lg cursor-pointer"
                    style={{
                      animation: `fade-in 0.6s ease-out ${index * 0.1}s both`
                    }}
                    onClick={() => navigate(`/world-info-view/${worldInfo.id}`)}
                  >
                    <div className="p-4">
                      {/* World Info Avatar Section */}
                      <div className="relative h-24 bg-gradient-to-br from-[#FF7A00]/10 to-[#FF7A00]/5 flex items-center justify-center mb-4 rounded">
                        <div className="w-16 h-16 bg-gradient-to-br from-[#FF7A00] to-[#FF7A00]/70 rounded-full flex items-center justify-center">
                          <BookOpen className="w-6 h-6 text-white" />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="space-y-3">
                        <h3 className="text-white font-semibold text-lg leading-tight line-clamp-2 group-hover:text-[#FF7A00] transition-colors">
                          {worldInfo.name}
                        </h3>
                        
                        {worldInfo.short_description && (
                          <p className="text-gray-400 text-sm line-clamp-3 leading-relaxed">
                            {worldInfo.short_description}
                          </p>
                        )}

                        {/* Creator Info */}
                        {worldInfo.creator && (
                          <div className="flex items-center space-x-2 text-gray-500 text-xs">
                            <span>by {worldInfo.creator.username}</span>
                          </div>
                        )}

                        {/* Stats */}
                        <div className="flex items-center justify-between text-gray-500 text-xs">
                          <div className="flex items-center space-x-3">
                            <span>{worldInfo.usage_count || 0} uses</span>
                            <span>{worldInfo.likes_count || 0} likes</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <Globe className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-white text-lg font-semibold mb-2">No Public World Infos Found</h3>
                <p className="text-gray-400 mb-6 max-w-md mx-auto">
                  Try adjusting your search or filters to discover world infos
                </p>
              </div>
            )}

            {/* Load More for Public World Infos */}
            {sortedPublicWorldInfos.length > 0 && (
              <div className="flex justify-center mt-12">
                <Button
                  variant="outline"
                  className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 hover:border-[#FF7A00] bg-transparent px-8 py-3 text-base font-medium"
                >
                  Load More World Infos
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
