import React, { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useNavigate } from 'react-router-dom';
import { useDashboardData, useUserChatsPaginated, useDashboardMutations } from '@/hooks/useDashboard';
import { deleteChat, deleteMultipleChats } from '@/lib/supabase-queries';
import { toast } from 'sonner';
import { format } from 'date-fns';

const RecentChatCard = ({ chat, onNavigate, isSelected, onSelect, isSelecting }) => {
  const lastMessage = chat.last_message;
  const characterName = chat.character_name || 'Unknown Character';
  const characterAvatar = chat.character_avatar;

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow relative">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {isSelecting && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={onSelect}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <Avatar className="h-10 w-10">
              <AvatarImage src={characterAvatar} alt={characterName} />
              <AvatarFallback>{characterName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-sm">{characterName}</CardTitle>
              <CardDescription className="text-xs">
                {format(new Date(chat.created_at), 'MMM d, yyyy')}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent 
        className="pt-0"
        onClick={() => onNavigate(chat.id)}
      >
        {lastMessage && (
          <div className="text-sm text-gray-600 line-clamp-2 mb-2">
            <span className="font-medium">
              {lastMessage.sender === 'user' ? 'You: ' : `${characterName}: `}
            </span>
            {lastMessage.content}
          </div>
        )}
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>{chat.message_count || 0} messages</span>
          <span>{format(new Date(chat.updated_at), 'h:mm a')}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const RecentChats = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedChats, setSelectedChats] = useState(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { invalidateDashboard } = useDashboardMutations();
  
  const { data: chatsData, isLoading, error, refetch } = useUserChatsPaginated(currentPage, 10);
  
  const chats = chatsData?.data || [];
  const totalPages = chatsData?.totalPages || 1;
  const totalChats = chatsData?.totalCount || 0;

  const handleNavigateToChat = useCallback((chatId) => {
    if (isSelecting) return;
    navigate(`/chat/${chatId}`);
  }, [navigate, isSelecting]);

  const handleSelectChat = useCallback((chatId, checked) => {
    setSelectedChats(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(chatId);
      } else {
        newSet.delete(chatId);
      }
      return newSet;
    });
  }, []);

  const toggleSelecting = useCallback(() => {
    setIsSelecting(prev => !prev);
    setSelectedChats(new Set());
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedChats.size === 0) return;
    
    setIsDeleting(true);
    
    try {
      const chatIds = Array.from(selectedChats);
      
      if (chatIds.length === 1) {
        const result = await deleteChat(chatIds[0]);
        if (result.error) throw result.error;
      } else {
        const result = await deleteMultipleChats(chatIds);
        if (result.error) throw result.error;
      }

      toast.success(`Successfully deleted ${chatIds.length} chat${chatIds.length > 1 ? 's' : ''}`);
      
      // Reset selection state
      setSelectedChats(new Set());
      setIsSelecting(false);
      setShowDeleteDialog(false);
      
      // Refresh data
      await refetch();
      invalidateDashboard();
      
    } catch (error) {
      console.error('Error deleting chats:', error);
      toast.error('Failed to delete chats. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }, [selectedChats, refetch, invalidateDashboard]);

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
    setSelectedChats(new Set());
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Chats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading chats...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Chats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">
            Failed to load chats. Please try again.
            <Button variant="outline" onClick={() => refetch()} className="ml-2">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent Chats</CardTitle>
            <CardDescription>
              {totalChats} total chats
              {currentPage > 1 && ` • Page ${currentPage} of ${totalPages}`}
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            {chats.length > 0 && (
              <>
                <Button
                  variant={isSelecting ? "default" : "outline"}
                  size="sm"
                  onClick={toggleSelecting}
                >
                  {isSelecting ? 'Cancel' : 'Select'}
                </Button>
                {isSelecting && selectedChats.size > 0 && (
                  <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        Delete ({selectedChats.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Chats</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete {selectedChats.size} chat{selectedChats.size > 1 ? 's' : ''}? 
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteSelected}
                          disabled={isDeleting}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chats.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No chats yet. Start a conversation with a character!
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {chats.map((chat) => (
                <RecentChatCard
                  key={chat.id}
                  chat={chat}
                  onNavigate={handleNavigateToChat}
                  isSelected={selectedChats.has(chat.id)}
                  onSelect={(checked) => handleSelectChat(chat.id, checked)}
                  isSelecting={isSelecting}
                />
              ))}
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center space-x-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const CharacterCard = ({ character }) => {
  const navigate = useNavigate();
  
  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/character/${character.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center space-x-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={character.avatar_url} alt={character.name} />
            <AvatarFallback>{character.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-base">{character.name}</CardTitle>
            <CardDescription className="text-sm line-clamp-2">
              {character.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex justify-between items-center text-xs text-gray-500">
          <Badge variant="secondary" className="text-xs">
            {character.chat_count || 0} chats
          </Badge>
          <span>{format(new Date(character.created_at), 'MMM d, yyyy')}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const FavoriteCard = ({ favorite }) => {
  const navigate = useNavigate();
  
  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/character/${favorite.character_id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center space-x-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={favorite.character_avatar} alt={favorite.character_name} />
            <AvatarFallback>{favorite.character_name?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-sm">{favorite.character_name}</CardTitle>
            <CardDescription className="text-xs">
              Added {format(new Date(favorite.created_at), 'MMM d, yyyy')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

const DashboardContent = () => {
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useDashboardData();

  if (dashboardLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-red-500">Failed to load dashboard data</div>
      </div>
    );
  }

  const { characters, favorites, credits, subscription, creditsUsed } = dashboardData || {};

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{credits || 0}</div>
            <p className="text-sm text-gray-600">Available credits</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Characters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{characters?.length || 0}</div>
            <p className="text-sm text-gray-600">Your characters</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{creditsUsed || 0}</div>
            <p className="text-sm text-gray-600">Credits used</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="chats" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="chats">Recent Chats</TabsTrigger>
          <TabsTrigger value="characters">Characters</TabsTrigger>
          <TabsTrigger value="favorites">Favorites</TabsTrigger>
        </TabsList>
        
        <TabsContent value="chats" className="mt-6">
          <RecentChats />
        </TabsContent>
        
        <TabsContent value="characters" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Characters</CardTitle>
              <CardDescription>
                {characters?.length || 0} characters created
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!characters || characters.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No characters yet. Create your first character!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {characters.map((character) => (
                    <CharacterCard key={character.id} character={character} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="favorites" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Favorite Characters</CardTitle>
              <CardDescription>
                {favorites?.length || 0} favorites saved
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!favorites || favorites.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No favorites yet. Add some characters to your favorites!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {favorites.map((favorite) => (
                    <FavoriteCard key={favorite.id} favorite={favorite} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DashboardContent;
