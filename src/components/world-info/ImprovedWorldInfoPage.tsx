import React, { useState, useMemo, useRef, useEffect } from 'react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { TopBar } from '@/components/ui/TopBar';
import { 
  Plus, 
  Search, 
  Filter,
  BookOpen,
  User,
  Globe,
  Upload,
  Loader2,
  X,
  Sparkles
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useUserWorldInfos, usePublicWorldInfos, useAllTags } from '@/hooks/useWorldInfos';
import { cn } from '@/lib/utils';
import StandardizedWorldInfoCard from './StandardizedWorldInfoCard';

export default function ImprovedWorldInfoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State - Start with discover tab as default
  const [activeTab, setActiveTab] = useState('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('most-used');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Check if desktop on mount and window resize
  useEffect(() => {
    const checkIsDesktop = () => {
      setIsDesktop(window.innerWidth >= 640);
    };

    checkIsDesktop();
    window.addEventListener('resize', checkIsDesktop);
    
    return () => window.removeEventListener('resize', checkIsDesktop);
  }, []);

  // Queries
  const { data: userWorldInfos = [], isLoading: isLoadingUser } = useUserWorldInfos();
  const { data: publicWorldInfos = [], isLoading: isLoadingPublic } = usePublicWorldInfos();
  const { data: allTags = [] } = useAllTags();

  // Filter and sort logic
  const filteredAndSortedWorldInfos = useMemo(() => {
    let worldInfos = activeTab === 'my-world-info' ? userWorldInfos : publicWorldInfos;
    
    // Apply filters
    let filtered = worldInfos.filter((worldInfo: any) => {
      const matchesSearch = !searchQuery || 
        worldInfo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (worldInfo.short_description && worldInfo.short_description.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesTags = selectedTags.length === 0 || 
        (worldInfo.tags && selectedTags.every(tagName => 
          worldInfo.tags.some((tag: any) => 
            typeof tag === 'string' ? tag === tagName : tag.name === tagName
          )
        ));
      
      return matchesSearch && matchesTags;
    });

    // Sort
    filtered.sort((a: any, b: any) => {
      switch (sortBy) {
        case 'a-z':
          return a.name.localeCompare(b.name);
        case 'z-a':
          return b.name.localeCompare(a.name);
        case 'recently-created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'recently-updated':
          return new Date(b.updated_at || b.created_at).getTime() - 
                 new Date(a.updated_at || a.created_at).getTime();
        case 'most-liked':
          const bLikes = b.likesCount || b.likes_count || b.like_count || 0;
          const aLikes = a.likesCount || a.likes_count || a.like_count || 0;
          return bLikes - aLikes;
        case 'most-used':
          return ((b.usage_count || 0) + (b.interaction_count || 0)) - 
                 ((a.usage_count || 0) + (a.interaction_count || 0));
        default:
          return 0;
      }
    });

    return filtered;
  }, [userWorldInfos, publicWorldInfos, activeTab, searchQuery, selectedTags, sortBy]);

  // Handlers
  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      // Note: This would need to be implemented in world-info-operations
      toast({
        title: "Coming Soon",
        description: "Import functionality will be available soon"
      });
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to import world info. Please check the file format.",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags(prev => 
      prev.includes(tagName) 
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
    setSortBy('most-used');
  };

  const isLoading = activeTab === 'my-world-info' ? isLoadingUser : isLoadingPublic;
  const isEmpty = filteredAndSortedWorldInfos.length === 0;
  const hasActiveFilters = searchQuery || selectedTags.length > 0 || sortBy !== 'most-used';

  return (
    <div className="min-h-screen bg-[#121212]">
      <TopBar
        title="World Info"
        subtitle="Discover and manage lorebooks"
        rightContent={
          activeTab === 'my-world-info' && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportFile}
                disabled={importing}
                className="hidden sm:flex border-gray-600 text-gray-300"
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
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
          )
        }
      />

      <div className="container mx-auto px-4 py-6">
        {/* Large, prominent tabs */}
        <div className="mb-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-2 bg-gray-800/50 border border-gray-700 p-1 h-14">
              <TabsTrigger 
                value="discover" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-300 h-full text-base font-medium flex items-center gap-2"
              >
                <Globe className="w-5 h-5" />
                Discover World Info
              </TabsTrigger>
              <TabsTrigger 
                value="my-world-info" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-300 h-full text-base font-medium flex items-center gap-2"
              >
                <User className="w-5 h-5" />
                My World Info
              </TabsTrigger>
            </TabsList>

            {/* Search and Filters */}
            <div className="bg-[#1a1a2e]/50 backdrop-blur-sm border-b border-gray-700/50 px-3 sm:px-6 py-3 sm:py-4">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    type="text"
                    placeholder="Search world info by name or description... (Press Enter to search)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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
                        {allTags.map((tag) => (
                          <div key={tag.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={tag.name}
                              checked={selectedTags.includes(tag.name)}
                              onCheckedChange={() => toggleTag(tag.name)}
                              className="border-gray-600 data-[state=checked]:bg-[#FF7A00] data-[state=checked]:border-[#FF7A00]"
                            />
                            <label
                              htmlFor={tag.name}
                              className="text-sm text-white cursor-pointer"
                            >
                              {tag.name}
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
                    <SelectItem value="most-used" className="text-white hover:bg-gray-700">Most Used</SelectItem>
                    <SelectItem value="most-liked" className="text-white hover:bg-gray-700">Most Liked</SelectItem>
                    <SelectItem value="recently-created" className="text-white hover:bg-gray-700">Recently Created</SelectItem>
                    <SelectItem value="recently-updated" className="text-white hover:bg-gray-700">Recently Updated</SelectItem>
                    <SelectItem value="a-z" className="text-white hover:bg-gray-700">A-Z</SelectItem>
                    <SelectItem value="z-a" className="text-white hover:bg-gray-700">Z-A</SelectItem>
                  </SelectContent>
                </Select>

                {/* Search Button */}
                <Button
                  onClick={() => {}} // No explicit search action needed as filtering is reactive
                  className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-medium"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Search
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
                    onClick={clearFilters}
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
                        onClick={() => toggleTag(tag)} 
                        className="hover:text-white transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Tab Contents */}
            <TabsContent value="discover" className="mt-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
                </div>
              ) : isEmpty ? (
                <div className="text-center py-12">
                  <Globe className="w-16 h-16 mx-auto mb-4 text-gray-400 opacity-50" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {hasActiveFilters ? 'No matching world info' : 'No public world info available'}
                  </h3>
                  <p className="text-gray-400">
                    {hasActiveFilters 
                      ? 'Try adjusting your filters'
                      : 'Be the first to share your world info with the community!'
                    }
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredAndSortedWorldInfos.map((worldInfo: any, index: number) => (
                    <StandardizedWorldInfoCard
                      key={worldInfo.id}
                      worldInfo={worldInfo}
                      isOwner={worldInfo.creator_id === user?.id}
                      showCreator={true}
                      index={index}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="my-world-info" className="mt-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
                </div>
              ) : isEmpty ? (
                <div className="text-center py-12">
                  <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400 opacity-50" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {hasActiveFilters ? 'No matching world info' : 'No world info yet'}
                  </h3>
                  <p className="text-gray-400 mb-6">
                    {hasActiveFilters 
                      ? 'Try adjusting your filters'
                      : 'Create your first world info to get started'
                    }
                  </p>
                  {!hasActiveFilters && (
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
                  {filteredAndSortedWorldInfos.map((worldInfo: any, index: number) => (
                    <StandardizedWorldInfoCard
                      key={worldInfo.id}
                      worldInfo={worldInfo}
                      isOwner={true}
                      showCreator={false}
                      onEdit={(id: string) => navigate(`/world-info/${id}/edit`)}
                      index={index}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileImport}
        className="hidden"
      />
    </div>
  );
}
