import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TopBar } from '@/components/ui/TopBar';
import { 
  Plus, 
  Search, 
  Filter,
  BookOpen,
  User,
  Globe,
  Upload,
  Loader2
} from 'lucide-react';
import WorldInfoCard from '@/components/world-info/ImprovedWorldInfoCard';
import { useAuth } from '@/contexts/AuthContext';
import { useUserWorldInfos, useAllTags } from '@/hooks/useWorldInfos';
import { cn } from '@/lib/utils';

export default function ImprovedWorldInfoList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // State
  const [activeTab, setActiveTab] = useState('my-world-info');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState('updated_at');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Queries
  const { data: userWorldInfos = [], isLoading: isLoadingUser } = useUserWorldInfos();
  const { data: allTags = [] } = useAllTags();

  // Filter and sort
  const filteredAndSortedWorldInfos = useMemo(() => {
    const worldInfos = userWorldInfos; // For now, only showing user's world infos
    
    let filtered = worldInfos.filter(worldInfo => {
      const matchesSearch = !searchQuery || 
        worldInfo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (worldInfo.short_description && worldInfo.short_description.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesTag = !selectedTag || selectedTag === 'all' || worldInfo.tags?.some(tag => tag.name === selectedTag);
      
      return matchesSearch && matchesTag;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created_at':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'updated_at':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case 'like_count':
          return (b.likesCount || 0) - (a.likesCount || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [userWorldInfos, searchQuery, selectedTag, sortBy]);

  const isLoading = isLoadingUser;
  const isEmpty = filteredAndSortedWorldInfos.length === 0;

  return (
    <div className="min-h-screen bg-[#121212]">
      <TopBar
        title="World Info"
        subtitle="Create and manage your lorebooks"
        rightContent={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/world-info/import')}
              className="hidden sm:flex border-gray-600 text-gray-300"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <Button
              onClick={() => navigate('/world-info/create')}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/80"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Create New</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        }
      />

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800/50">
              <TabsTrigger value="my-world-info" className="data-[state=active]:bg-[#FF7A00]">
                <User className="w-4 h-4 mr-2" />
                My World Info
              </TabsTrigger>
              <TabsTrigger value="discover" className="data-[state=active]:bg-[#FF7A00]">
                <Globe className="w-4 h-4 mr-2" />
                Discover
              </TabsTrigger>
            </TabsList>

            {/* Search and Filters */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <Input
                    placeholder="Search world info..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-gray-800/50 border-gray-600 text-white"
                  />
                </div>
                
                <Button
                  variant="outline"
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="sm:hidden border-gray-600 text-white"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Filters {showMobileFilters ? '−' : '+'}
                </Button>
              </div>

              {/* Filters - Desktop always visible, mobile toggleable */}
              <div className={cn(
                "grid grid-cols-1 sm:grid-cols-3 gap-3",
                !showMobileFilters && "hidden sm:grid"
              )}>
                <Select value={selectedTag} onValueChange={setSelectedTag}>
                  <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                    <SelectValue placeholder="All tags" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tags</SelectItem>
                    {allTags.map(tag => (
                      <SelectItem key={tag.id} value={tag.name}>
                        {tag.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated_at">Last Updated</SelectItem>
                    <SelectItem value="created_at">Date Created</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    {activeTab === 'discover' && (
                      <SelectItem value="like_count">Popularity</SelectItem>
                    )}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedTag('all');
                    setSortBy('updated_at');
                  }}
                  className="border-gray-600 text-gray-300"
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <TabsContent value="my-world-info" className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
              </div>
            ) : isEmpty ? (
              <div className="text-center py-12">
                <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400 opacity-50" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  {searchQuery || (selectedTag && selectedTag !== 'all') ? 'No matching world info' : 'No world info yet'}
                </h3>
                <p className="text-gray-400 mb-6">
                  {searchQuery || (selectedTag && selectedTag !== 'all')
                    ? 'Try adjusting your filters'
                    : 'Create your first world info to get started'
                  }
                </p>
                {!searchQuery && (!selectedTag || selectedTag === 'all') && (
                  <Button
                    onClick={() => navigate('/world-info/create')}
                    className="bg-[#FF7A00] hover:bg-[#FF7A00]/80"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create World Info
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredAndSortedWorldInfos.map(worldInfo => (
                  <WorldInfoCard
                    key={worldInfo.id}
                    worldInfo={worldInfo}
                    onEdit={(id) => navigate(`/world-info/${id}/edit`)}
                    isOwner={true}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="discover" className="mt-6">
            <div className="text-center py-12">
              <Globe className="w-16 h-16 mx-auto mb-4 text-gray-400 opacity-50" />
              <h3 className="text-xl font-semibold text-white mb-2">
                Coming Soon
              </h3>
              <p className="text-gray-400">
                Public world info discovery will be available soon!
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
