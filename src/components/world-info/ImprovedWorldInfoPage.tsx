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
  X
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
            <div className="mt-6 space-y-4">
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
                
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-full sm:w-48 bg-gray-800/50 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="most-used">Most Used</SelectItem>
                    <SelectItem value="most-liked">Most Liked</SelectItem>
                    <SelectItem value="recently-created">Recently Created</SelectItem>
                    <SelectItem value="recently-updated">Recently Updated</SelectItem>
                    <SelectItem value="a-z">A-Z</SelectItem>
                    <SelectItem value="z-a">Z-A</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="sm:hidden border-gray-600 text-white"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Tags
                </Button>
              </div>

              {/* Tag filters */}
              {(showMobileFilters || isDesktop) && allTags.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-400">Filter by Tags</h3>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="text-[#FF7A00] hover:text-[#FF7A00]/80"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag: any) => (
                      <Badge
                        key={tag.id}
                        variant={selectedTags.includes(tag.name) ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer transition-all",
                          selectedTags.includes(tag.name) 
                            ? "bg-[#FF7A00] text-white border-[#FF7A00]" 
                            : "border-gray-600 text-gray-300 hover:border-[#FF7A00] hover:text-[#FF7A00]"
                        )}
                        onClick={() => toggleTag(tag.name)}
                      >
                        {tag.name}
                        {selectedTags.includes(tag.name) && (
                          <X className="w-3 h-3 ml-1" />
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Active filters display */}
              {selectedTags.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>Active filters:</span>
                  <div className="flex items-center gap-1">
                    {selectedTags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
