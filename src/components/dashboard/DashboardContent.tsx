import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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

import { MobileNavMenu } from '@/components/layout/MobileNavMenu';
import { TopBar } from '@/components/ui/TopBar';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useUserChatsPaginated } from '@/hooks/useDashboard';
import { useDashboardStats, useDashboardCharacters } from '@/hooks/useDashboardProgressive';
import { useChatCreation } from '@/hooks/useChatCreation';
import { 
  StatsCardSkeleton, 
  ChatCardSkeleton, 
  CharacterCardSkeleton, 
  FavoriteCharacterSkeleton 
} from '@/components/dashboard/DashboardSkeletons';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import { supabase } from '@/integrations/supabase/client';
import { deleteChat, deleteMultipleChats, deleteAllUserChats } from '@/lib/supabase-queries';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { StatsCard } from '@/components/ui/stats-card';
import { ChatCard } from '@/components/ui/chat-card';
import { DashboardErrorBoundary } from '@/components/ui/dashboard-error-boundary';
import { formatNumberWithK } from '@/lib/utils/formatting';
import { 
  MessageCircle, 
  Trophy, 
  Zap, 
  Star, 
  TrendingUp,
  Clock,
  Users,
  Sparkles,
  Plus,
  Edit,
  Share,
  CreditCard,
  CheckCircle,
  Crown,
  Heart,
  Loader2,
  Eye,
  Trash2
} from 'lucide-react';

export function DashboardContent() {
  const { user, profile, loading: authLoading, subscription: authSubscription } = useAuth();
  const navigate = useNavigate();
  const { startChat, isCreating } = useChatCreation();
  const queryClient = useQueryClient();
  
  // IMPORTANT: Initialize currentPage from sessionStorage to persist across renders
  const [currentPage, setCurrentPage] = useState(() => {
    const savedPage = sessionStorage.getItem('dashboard-current-page');
    return savedPage ? parseInt(savedPage, 10) : 1;
  });
  
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const chatsPerPage = 10;

  // Save current page to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('dashboard-current-page', currentPage.toString());
  }, [currentPage]);

  // Enable real-time updates
  useRealtimeUpdates(user?.id);
  
  // Use progressive loading hooks for better UX
  const { 
    data: statsData, 
    isLoading: statsLoading, 
    error: statsError,
    refetch: refetchStats
  } = useDashboardStats();

  const { 
    data: charactersData, 
    isLoading: charactersLoading, 
    error: charactersError,
    refetch: refetchCharacters
  } = useDashboardCharacters();

  // Use separate hook for paginated chats
  const {
    data: chatsData,
    isLoading: chatsLoading,
    error: chatsError,
    refetch: refetchChats
  } = useUserChatsPaginated(currentPage, chatsPerPage);

  // Memoize extracted data with fallbacks
  const recentChats = useMemo(() => chatsData?.data || [], [chatsData?.data]);
  const totalChats = useMemo(() => chatsData?.totalCount || 0, [chatsData?.totalCount]);
  const totalPages = useMemo(() => chatsData?.totalPages || 1, [chatsData?.totalPages]);
  const myCharacters = useMemo(() => charactersData?.characters || [], [charactersData?.characters]);
  const favoriteCharacters = useMemo(() => charactersData?.favorites || [], [charactersData?.favorites]);
  const userCredits = useMemo(() => statsData?.credits || 0, [statsData?.credits]);
  
  // Use subscription from AuthContext first, fallback to stats data
  const subscription = useMemo(() => authSubscription || statsData?.subscription, [authSubscription, statsData?.subscription]);
  
  const creditsUsed = useMemo(() => statsData?.creditsUsed || 0, [statsData?.creditsUsed]);
  const monthlyAllowance = useMemo(() => subscription?.plan?.monthly_credits_allowance || 1000, [subscription?.plan?.monthly_credits_allowance]);

  // Get crown icon styling based on plan - MOVED BEFORE CONDITIONAL RETURNS
  const getCrownIconStyle = useMemo(() => {
    if (!subscription || subscription.status !== 'active') {
      return 'text-gray-400';
    }
    
    const planName = subscription.plan?.name?.toLowerCase();
    if (planName?.includes('whale')) {
      return 'text-yellow-500 fill-yellow-500'; // Gold filled crown for Whale
    } else if (planName?.includes('true fan')) {
      return 'text-gray-300 fill-gray-300'; // Silver filled crown for True Fan
    }
    
    return 'text-gray-400'; // Default for other plans
  }, [subscription]);

  // Get the correct subscription tier
  const userTier = useMemo(() => {
    if (!subscription || subscription.status !== 'active') {
      return "Guest Pass";
    }
    return subscription.plan?.name || "Guest Pass";
  }, [subscription]);

  const isGuestPass = userTier === "Guest Pass";
  const username = profile?.username || user?.email?.split('@')[0] || 'User';

  // Memoize formatted data for performance
  const formattedRecentChats = useMemo(() => 
    recentChats.map((chat: any) => ({
      id: chat.id,
      character: {
        id: chat.character?.id,
        name: chat.character?.name || 'Unknown',
        avatar: chat.character?.avatar_url,
        image: chat.character?.avatar_url, // For backwards compatibility
      },
      title: chat.title || `Chat with ${chat.character?.name || 'Unknown'}`,
      message_count: chat.message_count || 0,
      last_message_at: chat.last_message_at || chat.created_at,
      created_at: chat.created_at,
      chat_mode: chat.userSettings?.chat_mode || 'storytelling',
      time_awareness_enabled: chat.userSettings?.time_awareness_enabled || false,
      last_message: chat.messages?.[0]?.content || null,
    })), [recentChats]
  );

  const formattedMyCharacters = useMemo(() => 
    myCharacters.map((character: any) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      avatar: character.name?.charAt(0) || 'C',
      image: character.avatar_url || "/placeholder.svg",
      isPublic: character.visibility === 'public',
      chatCount: character.actual_chat_count || 0,  // Use actual_chat_count
      likeCount: character.likes_count || 0,        // Use likes_count
      tagline: character.tagline || character.short_description || '',
      totalChats: character.actual_chat_count || 0, // Use actual_chat_count
      likesCount: character.likes_count || 0,       // Use likes_count
      originalCharacter: character
    })), [myCharacters]
  );

  const formattedFavoriteCharacters = useMemo(() =>
    favoriteCharacters.map((character: any) => ({
      id: character.id,
      name: character.name,
      tagline: character.tagline || '',
      avatar: character.name.charAt(0),
      image: character.avatar_url || "/placeholder.svg",
      totalChats: character.actual_chat_count || character.interaction_count || 0,
      likesCount: character.likes_count || 0,
      creatorUsername: character.creator?.username || 'Unknown',
      originalCharacter: character
    })), [favoriteCharacters]
  );

  // Refresh data on mount and when user changes
  useEffect(() => {
    if (user) {
      refetchStats();
      refetchCharacters();
      refetchChats();
    }
  }, [user, refetchStats, refetchCharacters, refetchChats]);

  // Clear selections when page changes
  useEffect(() => {
    setSelectedChats(new Set());
  }, [currentPage]);

  // Clear selections when chats data changes (after deletion)
  useEffect(() => {
    if (totalChats === 0) {
      setSelectedChats(new Set());
      setCurrentPage(1);
    }
  }, [totalChats]);

  // Fixed pagination handler
  const handlePageChange = useCallback((newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    
    console.log('Changing page from', currentPage, 'to', newPage);
    setCurrentPage(newPage);
    
    // Scroll to top of chat list
    const chatSection = document.querySelector('[data-chat-section]');
    if (chatSection) {
      chatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPage, totalPages]);

  // Memoized callback functions for better performance
  const handleContinueChat = useCallback((chat: any) => {
    navigate('/chat', { 
      state: { 
        selectedCharacter: chat.character, 
        existingChatId: chat.id 
      } 
    });
  }, [navigate]);

  const handleEditCharacter = useCallback((character: any) => {
    navigate('/character-creator', { 
      state: { 
        editingCharacter: character,
        isEditing: true 
      } 
    });
  }, [navigate]);

  const handleChatSelection = useCallback((chatId: string) => {
    setSelectedChats(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(chatId)) {
        newSelection.delete(chatId);
      } else {
        newSelection.add(chatId);
      }
      return newSelection;
    });
  }, []);

  const handleStartNewChat = useCallback((character: any) => {
    navigate('/chat', { state: { selectedCharacter: character } });
  }, [navigate]);

  const handleDeleteSelectedChats = useCallback(async () => {
    if (selectedChats.size === 0) return;
    
    setIsDeleting(true);
    const chatIdsToDelete = Array.from(selectedChats);
    console.log(`Dashboard: Starting deletion of ${chatIdsToDelete.length} chats:`, chatIdsToDelete);
    
    try {
      // Optimistic update - immediately remove chats from the UI
      queryClient.setQueryData(['user', 'chats', 'paginated', user.id, currentPage, chatsPerPage], (oldData: any) => {
        if (!oldData) return oldData;
        
        const filteredChats = oldData.data.filter((chat: any) => !chatIdsToDelete.includes(chat.id));
        console.log(`Optimistically removed ${chatIdsToDelete.length} chats from UI. Remaining: ${filteredChats.length}`);
        return {
          ...oldData,
          data: filteredChats,
          totalCount: oldData.totalCount - chatIdsToDelete.length,
          totalPages: Math.ceil((oldData.totalCount - chatIdsToDelete.length) / chatsPerPage)
        };
      });
      
      // Clear selection immediately
      setSelectedChats(new Set());
      
      // Perform actual deletions in the background
      const results = await deleteMultipleChats(chatIdsToDelete, user.id);
      console.log('Dashboard: Deletion results:', results);
      
      // Check for any errors and revert optimistic updates if needed
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        console.error('Dashboard: Errors deleting chats:', errors);
        const failedChatIds = errors.map((_, index) => chatIdsToDelete[index]);
        
        // Revert optimistic update for failed deletions
        queryClient.setQueryData(['user', 'chats', 'paginated', user.id, currentPage, chatsPerPage], (oldData: any) => {
          if (!oldData) return oldData;
          
          // We need to refetch to get the actual state, but for now just show error
          toast.error(`Failed to delete ${errors.length} chat(s). Refreshing...`);
          // Force a refresh to get correct state
          setTimeout(() => refetchChats(), 1000);
          return oldData;
        });
        
        return;
      }
      
      const successfulDeletions = chatIdsToDelete.length - errors.length;
      console.log(`Dashboard: Successfully deleted ${successfulDeletions} chats`);
      if (successfulDeletions > 0) {
        toast.success(`Successfully deleted ${successfulDeletions} chat(s)`);
      }
      
      // Refetch to load new chats and maintain 10 visible chats
      await refetchChats();
      
      // If we're on a page that's now empty, go to the previous page
      const newTotalChats = totalChats - successfulDeletions;
      const newTotalPages = Math.ceil(newTotalChats / chatsPerPage);
      if (currentPage > newTotalPages && newTotalPages > 0) {
        setCurrentPage(newTotalPages);
      }
      
    } catch (error) {
      console.error('Dashboard: Error deleting chats:', error);
      toast.error('Failed to delete chats');
      // Revert optimistic updates by refetching
      refetchChats();
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [selectedChats, user, currentPage, chatsPerPage, queryClient, refetchChats]);

  const handleDeleteSingleChat = useCallback(async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // Optimistic update - immediately remove chat from the UI
      queryClient.setQueryData(['user', 'chats', 'paginated', user.id, currentPage, chatsPerPage], (oldData: any) => {
        if (!oldData) return oldData;
        
        const filteredChats = oldData.data.filter((chat: any) => chat.id !== chatId);
        return {
          ...oldData,
          data: filteredChats,
          totalCount: oldData.totalCount - 1,
          totalPages: Math.ceil((oldData.totalCount - 1) / chatsPerPage)
        };
      });
      
      // Remove from selection if it was selected
      if (selectedChats.has(chatId)) {
        const newSelection = new Set(selectedChats);
        newSelection.delete(chatId);
        setSelectedChats(newSelection);
      }
      
      // Perform actual deletion
      const { error } = await deleteChat(chatId, user.id);
        
      if (error) {
        // Revert optimistic update
        toast.error('Failed to delete chat. Refreshing...');
        setTimeout(() => refetchChats(), 1000);
        return;
      }
      
      toast.success('Chat deleted successfully');
      
      // Refetch to load new chats and maintain 10 visible chats
      await refetchChats();
      
      // If we're on a page that's now empty, go to the previous page
      const newTotalChats = totalChats - 1;
      const newTotalPages = Math.ceil(newTotalChats / chatsPerPage);
      if (currentPage > newTotalPages && newTotalPages > 0) {
        setCurrentPage(newTotalPages);
      }
      
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete chat');
      // Revert optimistic updates by refetching
      refetchChats();
    }
  }, [queryClient, user.id, currentPage, chatsPerPage, refetchChats]);

  const handleDeleteAllChats = useCallback(async () => {
    if (totalChats === 0) {
      toast.info('No chats to delete');
      return;
    }
    
    setIsDeletingAll(true);
    console.log(`Dashboard: Starting deletion of all ${totalChats} chats for user ${user.id}`);
    
    try {
      // Optimistic update - clear all chats from the UI immediately
      queryClient.setQueryData(['user', 'chats', 'paginated', user.id, currentPage, chatsPerPage], (oldData: any) => {
        if (!oldData) return oldData;
        
        console.log(`Optimistically cleared all chats from UI`);
        return {
          ...oldData,
          data: [],
          totalCount: 0,
          totalPages: 0
        };
      });
      
      // Clear selections and reset page
      setSelectedChats(new Set());
      setCurrentPage(1);
      
      // Perform actual deletion
      const result = await deleteAllUserChats(user.id);
      console.log('Dashboard: Delete all result:', result);
      
      if (result.error) {
        console.error('Dashboard: Error deleting all chats:', result.error);
        toast.error(`Failed to delete all chats: ${result.error}`);
        // Revert optimistic update by refetching
        setTimeout(() => refetchChats(), 1000);
        return;
      }
      
      const { success, error, deletedCount } = result;
      console.log(`Dashboard: Successfully deleted ${deletedCount} chats`);
      
      if (success && deletedCount > 0) {
        toast.success(`Successfully deleted all ${deletedCount} chat(s)`);
      }
      
      if (!success && error) {
        toast.warning(`Some chats could not be deleted: ${error}`);
      }
      
      // Refetch to get the actual current state
      await refetchChats();
      
    } catch (error) {
      console.error('Dashboard: Error deleting all chats:', error);
      toast.error('Failed to delete all chats');
      // Revert optimistic updates by refetching
      refetchChats();
    } finally {
      setIsDeletingAll(false);
      setShowDeleteAllDialog(false);
    }
  }, [totalChats, user, currentPage, chatsPerPage, queryClient, refetchChats]);

  if (authLoading || statsLoading) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white">Loading your dashboard...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-white">Please sign in to access your ANIMA dashboard.</div>
      </div>
    );
  }

  if (statsError || charactersError || chatsError) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-2">Failed to load dashboard data</div>
          <div className="text-gray-400 text-sm">Please refresh the page to try again</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212]">
      {/* Standardized TopBar */}
      <TopBar
        title={`Welcome back to ANIMA, ${username}`}
        subtitle="Ready to continue your digital adventures?"
        rightContent={
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => navigate(`/profile/${username}`)}
              variant="ghost"
              size="sm"
              className="p-0 hover:ring-2 hover:ring-[#FF7A00]/50 rounded-full transition-all"
            >
              <Avatar className="w-8 h-8 sm:w-12 sm:h-12 ring-2 ring-[#FF7A00]/50 cursor-pointer">
                <AvatarImage 
                  src={profile?.avatar_url || "https://images.unsplash.com/photo-1649972904349-6e44c42644a7?w=150&h=150&fit=crop&crop=face"} 
                  alt={profile?.username || "User"} 
                />
                <AvatarFallback className="bg-[#FF7A00] text-white font-bold text-xs sm:text-base">
                  {profile?.username?.substring(0, 2).toUpperCase() || user.email?.substring(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
            
            {/* Username */}
            <div className="text-right hidden md:block">
              <p className="text-white text-sm sm:text-lg font-bold">
                {username}
              </p>
            </div>
          </div>
        }
      />

      <div className="p-3 sm:p-6 md:p-6 space-y-4 sm:space-y-6">
        {/* Stats cards above Daily Message Limit */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {statsLoading ? (
            // Show skeleton loading for stats
            <>
              {Array.from({ length: 4 }).map((_, index) => (
                <StatsCardSkeleton key={index} />
              ))}
            </>
          ) : (
            <>
              <StatsCard
                title="Active Chats"
                value={formatNumberWithK(totalChats)}
                icon={MessageCircle}
                onClick={() => navigate('/chat')}
              />

              <StatsCard
                title="Characters"
                value={formatNumberWithK(myCharacters.length)}
                icon={Users}
                onClick={() => navigate('/character-creator')}
              />

              <StatsCard
                title="Credits"
                value={userCredits.toLocaleString()}
                icon={Zap}
                onClick={() => navigate('/subscription')}
                largeValue={true}
              />

              <StatsCard
                title="Plan"
                value={userTier}
                icon={Crown}
                iconColor={getCrownIconStyle}
                onClick={() => navigate('/subscription')}
              />
            </>
          )}
        </div>


        {/* Your Dashboard sections - moved above Daily Quest */}
        <Card className="bg-[#1a1a2e] border-gray-700/50 md:mx-0 -mx-3 md:rounded-lg rounded-none border-x-0 md:border-x" style={{ minHeight: 'calc(100vh - 250px)' }}>
          <CardHeader className="pb-2 sm:pb-4 px-3 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-xl sm:text-2xl">Your Dashboard</CardTitle>
              
              <div className="flex items-center space-x-2">
                {/* Delete All Button - Dev Only */}
                {process.env.NODE_ENV === 'development' && totalChats > 0 && (
                  <Button
                    onClick={() => setShowDeleteAllDialog(true)}
                    size="sm"
                    variant="outline"
                    className="bg-transparent border-red-600 text-red-400 hover:bg-red-600 hover:text-white transition-colors"
                    disabled={isDeletingAll || isDeleting}
                  >
                    {isDeletingAll ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Delete All ({totalChats})
                  </Button>
                )}
                
                {/* Bulk Delete Button - Shows when chats are selected */}
                {selectedChats.size > 0 && (
                  <Button
                    onClick={() => setShowDeleteDialog(true)}
                    size="sm"
                    variant="destructive"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    disabled={isDeleting || isDeletingAll}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Delete {selectedChats.size} Chat{selectedChats.size > 1 ? 's' : ''}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
              <Tabs defaultValue="recent-chats" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-[#121212] border border-gray-700/50 h-auto">
                  <TabsTrigger 
                    value="recent-chats" 
                    className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-400 text-xs sm:text-sm py-2"
                  >
                    <span className="hidden sm:inline">Recent Chats</span>
                    <span className="sm:hidden">Chats</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="my-characters" 
                    className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-400 text-xs sm:text-sm py-2"
                  >
                    <span className="hidden sm:inline">My Characters</span>
                    <span className="sm:hidden">Characters</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="favorites" 
                    className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white text-gray-400 text-xs sm:text-sm py-2"
                  >
                    Favorites
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="recent-chats" className="mt-3 sm:mt-6">
                  <div className="space-y-2 sm:space-y-3">
                    {chatsLoading ? (
                      // Show skeleton loading for chats
                      <>
                        {Array.from({ length: 5 }).map((_, index) => (
                          <ChatCardSkeleton key={index} />
                        ))}
                      </>
                    ) : formattedRecentChats.length > 0 ? (
                      <>
                        {formattedRecentChats.map((chat) => (
                          <ChatCard
                            key={chat.id}
                            chat={chat}
                            isSelected={selectedChats.has(chat.id)}
                            onSelect={handleChatSelection}
                            onContinue={handleContinueChat}
                            showSelection={true}
                          />
                        ))}
                        
                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                          <div data-chat-section className="flex justify-center items-center space-x-2 mt-4">
                            <Button
                              onClick={() => handlePageChange(currentPage - 1)}
                              disabled={currentPage === 1}
                              variant="outline"
                              size="sm"
                              className="border-gray-700 text-gray-400 hover:text-white disabled:opacity-50"
                            >
                              Previous
                            </Button>
                            <span className="text-gray-400 text-sm">
                              Page {currentPage} of {totalPages}
                            </span>
                            <Button
                              onClick={() => handlePageChange(currentPage + 1)}
                              disabled={currentPage === totalPages}
                              variant="outline"
                              size="sm"
                              className="border-gray-700 text-gray-400 hover:text-white disabled:opacity-50"
                            >
                              Next
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <MessageCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                        <p className="text-gray-400">No recent chats. Start a conversation!</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="my-characters" className="mt-3 sm:mt-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                    {charactersLoading ? (
                      // Show skeleton loading for characters
                      <>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <CharacterCardSkeleton key={index} />
                        ))}
                      </>
                    ) : formattedMyCharacters.length > 0 ? (
                      formattedMyCharacters.map((character) => (
                        <Card
                          key={character.id}
                          className="bg-[#121212] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF7A00]/20 relative overflow-hidden h-64 sm:h-80 group"
                        >
                          <CardContent className="p-0 relative h-full">
                            <img 
                              src={character.image} 
                              alt={character.name}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                            
                            {/* Middle section with stacked buttons - hidden by default, shown on hover */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <div className="flex flex-col gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 bg-black/40"
                                  onClick={() => navigate(`/character/${character.id}`)}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 bg-black/40"
                                  onClick={() => handleEditCharacter(character.originalCharacter)}
                                >
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={isCreating}
                                  className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white disabled:opacity-50"
                                  onClick={() => startChat(character.originalCharacter as any)}
                                >
                                  <MessageCircle className="w-4 h-4 mr-2" />
                                  {isCreating ? 'Creating...' : 'Start Chat'}
                                </Button>
                              </div>
                            </div>
                            
                            <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                              <h3 className="text-white font-bold text-base sm:text-lg mb-1 truncate" title={character.name}>
                                {character.name}
                              </h3>
                              
                              {character.tagline && (
                                <p className="text-gray-400 text-xs sm:text-sm mb-2 truncate">
                                  {character.tagline}
                                </p>
                              )}
                              
                              <div className="flex items-center justify-center space-x-3 sm:space-x-4 text-xs sm:text-sm">
                                <div className="flex items-center space-x-1 text-gray-300">
                                  <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                                  <span>{formatNumberWithK(character.totalChats)}</span>
                                </div>
                                <div className="flex items-center space-x-1 text-gray-300">
                                  <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
                                  <span>{formatNumberWithK(character.likesCount)}</span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-8">
                        <Users className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                        <p className="text-gray-400 mb-4">No characters created yet.</p>
                        <Button 
                          onClick={() => navigate('/character-creator')}
                          className="bg-[#FF7A00] hover:bg-[#FF7A00]/80"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Create Your First Character
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="favorites" className="mt-3 sm:mt-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                    {charactersLoading ? (
                      // Show skeleton loading for favorite characters
                      <>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <FavoriteCharacterSkeleton key={index} />
                        ))}
                      </>
                    ) : formattedFavoriteCharacters.length > 0 ? (
                      formattedFavoriteCharacters.map((character) => (
                        <Card
                          key={character.id}
                          className="bg-[#121212] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF7A00]/20 relative overflow-hidden h-64 sm:h-80 group"
                        >
                          <CardContent className="p-0 relative h-full">
                            <img 
                              src={character.image} 
                              alt={character.name}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                            
                            {/* Middle section with stacked buttons - hidden by default, shown on hover */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <div className="flex flex-col gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10 bg-black/40"
                                  onClick={() => navigate(`/character/${character.id}`)}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={isCreating}
                                  className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white disabled:opacity-50"
                                  onClick={() => startChat(character.originalCharacter as any)}
                                >
                                  <MessageCircle className="w-4 h-4 mr-2" />
                                  {isCreating ? 'Creating...' : 'Start Chat'}
                                </Button>
                              </div>
                            </div>
                            
                            <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                              <h3 className="text-white font-bold text-base sm:text-lg mb-1 truncate" title={character.name}>
                                {character.name}
                              </h3>
                              
                              {character.tagline && (
                                <p className="text-gray-400 text-xs sm:text-sm mb-2 truncate">
                                  {character.tagline}
                                </p>
                              )}
                              
                              <p className="text-gray-400 text-xs mb-2">
                                by @{character.creatorUsername}
                              </p>
                              
                              <div className="flex items-center justify-center space-x-3 sm:space-x-4 text-xs sm:text-sm">
                                <div className="flex items-center space-x-1 text-gray-300">
                                  <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                                  <span>{formatNumberWithK(character.totalChats)}</span>
                                </div>
                                <div className="flex items-center space-x-1 text-gray-300">
                                  <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
                                  <span>{formatNumberWithK(character.likesCount)}</span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-8">
                        <Star className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                        <p className="text-gray-400">No favorite characters yet. Explore and favorite some characters!</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Selected Chats</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete {selectedChats.size} chat{selectedChats.size > 1 ? 's' : ''}? 
              This will permanently delete all messages, context, and memories associated with {selectedChats.size > 1 ? 'these chats' : 'this chat'}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-600 hover:bg-gray-700 text-white border-gray-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteSelectedChats}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Confirmation Dialog - Dev Only */}
      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center">
              <span className="bg-red-600 text-white text-xs px-2 py-1 rounded mr-2">DEV</span>
              Delete All Chats
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              <div className="space-y-2">
                <p className="font-semibold text-red-400">⚠️ DANGER: This will delete ALL {totalChats} of your chats!</p>
                <p>
                  This will permanently delete all messages, context, and memories associated with every chat in your account.
                  This action cannot be undone and is intended for development purposes only.
                </p>
                <p className="text-sm text-gray-400 italic">
                  This button is only visible in development mode.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-600 hover:bg-gray-700 text-white border-gray-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAllChats}
              disabled={isDeletingAll}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeletingAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting All...
                </>
              ) : (
                `Delete All ${totalChats} Chats`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Memoized version for performance
const MemoizedDashboardContent = React.memo(DashboardContent);

// Wrapped with error boundary
export default function DashboardContentWithErrorBoundary() {
  return (
    <DashboardErrorBoundary>
      <MemoizedDashboardContent />
    </DashboardErrorBoundary>
  );
}
