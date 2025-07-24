import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Plus, 
  Search, 
  Filter,
  BookOpen,
  TrendingUp,
  Clock,
  User,
  Globe,
  SortAsc,
  SortDesc,
  Download,
  Upload,
  Loader2
} from 'lucide-react';
import WorldInfoCard from '@/components/world-info/WorldInfoCard';
import { useWorldInfoQueries } from '@/queries/worldInfoQueries';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export default function WorldInfoList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('my-world-info');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Query hooks
  const { data: userWorldInfos = [], isLoading: isLoadingUser } = useWorldInfoQueries.useUserWorldInfos(
    { enabled: !!user }
  );
  
  const { data: publicWorldInfos = [], isLoading: isLoadingPublic } = useWorldInfoQueries.useWorldInfoCollection(
    'public',
    { enabled: activeTab === 'discover' }
  );
  
  const { data: allTags = [] } = useWorldInfoQueries.useAllTags();

  // Filter and sort logic
  const filteredAndSortedWorldInfos = useMemo(() => {
    const worldInfos = activeTab === 'my-world-info' ? userWorldInfos : publicWorldInfos;
    
    let filtered = worldInfos.filter(worldInfo => {
      const matchesSearch = !searchQuery || 
        worldInfo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (worldInfo.description && worldInfo.description.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesTag = !selectedTag || worldInfo.tags?.includes(selectedTag);
      
      return matchesSearch && matchesTag;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'created_at':
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
        case 'updated_at':
          aValue = new Date(a.updated_at);
          bValue = new Date(b.updated_at);
          break;
        case 'like_count':
          aValue = a.like_count || 0;
          bValue = b.like_count || 0;
          break;
        default:
          aValue = new Date(a.updated_at);
          bValue = new Date(b.updated_at);
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [userWorldInfos, publicWorldInfos, activeTab, searchQuery, selectedTag, sortBy, sortOrder]);

  // Handlers
  const handleEdit = (id: string) => {
    navigate(`/world-info/${id}/edit`);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const handleDeleteConfirm = async () => {
    if (deleteId) {
      // TODO: Implement delete functionality
      console.log('Delete world info:', deleteId);
      setDeleteId(null);
    }
  };

  const handleDuplicate = (id: string) => {
    // TODO: Implement duplicate functionality
    console.log('Duplicate world info:', id);
  };

  const handleShare = (id: string) => {
    // TODO: Implement share functionality
    console.log('Share world info:', id);
  };

  const handleExport = (id: string) => {
    // TODO: Implement export functionality
    console.log('Export world info:', id);
  };

  const handleLike = (id: string) => {
    // TODO: Implement like functionality
    console.log('Like world info:', id);
  };

  const isLoading = isLoadingUser || (activeTab === 'discover' && isLoadingPublic);
  const isEmpty = filteredAndSortedWorldInfos.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F0F23] via-[#1a1a2e] to-[#16213e]">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">World Info</h1>
            <p className="text-gray-400 mt-1">Create and manage your lorebooks</p>
          </div>
          
          <Link to="/world-info/create">
            <Button className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Create New
            </Button>
          </Link>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-gray-800/50 border border-gray-700">
            <TabsTrigger 
              value="my-world-info"
              className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white"
            >
              <User className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">My World Info</span>
              <span className="sm:hidden">Mine</span>
            </TabsTrigger>
            <TabsTrigger 
              value="discover"
              className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white"
            >
              <Globe className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Discover</span>
              <span className="sm:hidden">Public</span>
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
                onClick={() => setShowFilters(!showFilters)}
                className="sm:hidden border-gray-600 text-white"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
            </div>

            {/* Filters */}
            <div className={cn(
              "grid grid-cols-1 sm:grid-cols-3 gap-3 transition-all duration-200",
              showFilters ? "block" : "hidden sm:grid"
            )}>
              <Select value={selectedTag} onValueChange={setSelectedTag}>
                <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="">All tags</SelectItem>
                  {allTags.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="updated_at">Last Modified</SelectItem>
                  <SelectItem value="created_at">Date Created</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  {activeTab === 'discover' && (
                    <SelectItem value="like_count">Popularity</SelectItem>
                  )}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="border-gray-600 text-white"
              >
                {sortOrder === 'asc' ? (
                  <SortAsc className="w-4 h-4 mr-2" />
                ) : (
                  <SortDesc className="w-4 h-4 mr-2" />
                )}
                {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              </Button>
            </div>
          </div>

          {/* Content */}
          <TabsContent value="my-world-info" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
                <span className="ml-3 text-white">Loading...</span>
              </div>
            ) : isEmpty ? (
              <div className="text-center py-12">
                <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400 opacity-50" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  {searchQuery || selectedTag ? 'No matching world info found' : 'No world info yet'}
                </h3>
                <p className="text-gray-400 mb-6 max-w-md mx-auto">
                  {searchQuery || selectedTag 
                    ? 'Try adjusting your search or filters to find what you\'re looking for.'
                    : 'Create your first world info to start building your story universe.'
                  }
                </p>
                {!searchQuery && !selectedTag && (
                  <Link to="/world-info/create">
                    <Button className="bg-[#FF7A00] hover:bg-[#FF7A00]/80">
                      <Plus className="w-4 h-4 mr-2" />
                      Create World Info
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredAndSortedWorldInfos.map(worldInfo => (
                  <WorldInfoCard
                    key={worldInfo.id}
                    worldInfo={worldInfo}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    onExport={handleExport}
                    isOwner={true}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="discover" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
                <span className="ml-3 text-white">Loading...</span>
              </div>
            ) : isEmpty ? (
              <div className="text-center py-12">
                <Globe className="w-16 h-16 mx-auto mb-4 text-gray-400 opacity-50" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  {searchQuery || selectedTag ? 'No matching world info found' : 'No public world info available'}
                </h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  {searchQuery || selectedTag 
                    ? 'Try adjusting your search or filters.'
                    : 'Be the first to share your world info with the community!'
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredAndSortedWorldInfos.map(worldInfo => (
                  <WorldInfoCard
                    key={worldInfo.id}
                    worldInfo={worldInfo}
                    onDuplicate={handleDuplicate}
                    onShare={handleShare}
                    onExport={handleExport}
                    onLike={handleLike}
                    isOwner={worldInfo.user_id === user?.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete World Info</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete this world info? This will also delete all associated entries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
