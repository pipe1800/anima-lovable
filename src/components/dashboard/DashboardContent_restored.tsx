import React, { useState, useEffect } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboard';
import { useChatCreation } from '@/hooks/useChatCreation';
import { supabase } from '@/integrations/supabase/client';
import { deleteChat, deleteMultipleChats } from '@/lib/supabase-queries';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
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
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { startChat, isCreating } = useChatCreation();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const chatsPerPage = 10;
  
  // Use React Query hook for dashboard data
  const { 
    data: dashboardData, 
    isLoading: dataLoading, 
    error: dashboardError,
    refetch
  } = useDashboardData();

  // Extract data with fallbacks
  const recentChats = dashboardData?.chats || [];
  const myCharacters = dashboardData?.characters || [];
  const favoriteCharacters = dashboardData?.favorites || [];
  const userCredits = dashboardData?.credits || 0;
  const subscription = dashboardData?.subscription;
  const creditsUsed = dashboardData?.creditsUsed || 0;
  const monthlyAllowance = subscription?.plan?.monthly_credits_allowance || 1000;

  // Calculate pagination values early for use in useEffect
  const totalChats = recentChats.length;
  const totalPages = Math.max(1, Math.ceil(totalChats / chatsPerPage));

  // Refresh data on mount and when user changes
  useEffect(() => {
    if (user) {
      refetch();
    }
  }, [user, refetch]);

  // Clear selections when page changes
  useEffect(() => {
    setSelectedChats(new Set());
  }, [currentPage]);

  // Clear selections when chats data changes (after deletion)
  useEffect(() => {
    if (recentChats.length === 0) {
      setSelectedChats(new Set());
      setCurrentPage(1);
    }
  }, [recentChats.length]);

  // Update current page if it's invalid (this can happen after deletions)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleContinueChat = (chat: any) => {
    navigate('/chat', { 
      state: { 
        selectedCharacter: chat.character, 
        existingChatId: chat.id 
      } 
    });
  };

  const handleEditCharacter = (character: any) => {
    navigate('/character-creator', { 
      state: { 
        editingCharacter: character,
        isEditing: true 
      } 
    });
  };

  const handleChatSelection = (chatId: string) => {
    const newSelection = new Set(selectedChats);
    if (newSelection.has(chatId)) {
      newSelection.delete(chatId);
    } else {
      newSelection.add(chatId);
    }
    setSelectedChats(newSelection);
  };

  const handleDeleteSelectedChats = async () => {
    if (selectedChats.size === 0) return;
    
    setIsDeleting(true);
    try {
      // Optimistically update the UI by removing selected chats from the display
      const chatIdsToDelete = Array.from(selectedChats);
      
      // Delete each selected chat using the safe delete function
      const results = await deleteMultipleChats(chatIdsToDelete, user.id);
      
      // Check for any errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        console.error('Errors deleting chats:', errors);
        toast.error(`Failed to delete ${errors.length} chat(s)`);
      }
      
      const successfulDeletions = chatIdsToDelete.length - errors.length;
      if (successfulDeletions > 0) {
        toast.success(`Successfully deleted ${successfulDeletions} chat(s)`);
      }
      
      // Clear selection
      setSelectedChats(new Set());
      
      // Force invalidate and refetch the dashboard data
      queryClient.removeQueries({ queryKey: ['dashboard', 'overview', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview', user.id] });
      
      // Reset to page 1 if current page would be empty after deletion
      const remainingChats = recentChats.length - successfulDeletions;
      const maxPages = Math.ceil(remainingChats / chatsPerPage);
      if (currentPage > maxPages && maxPages > 0) {
        setCurrentPage(Math.max(1, maxPages));
      }
      
    } catch (error) {
      console.error('Error deleting chats:', error);
      toast.error('Failed to delete chats');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleDeleteSingleChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const { error } = await deleteChat(chatId, user.id);
        
      if (error) throw error;
      
      toast.success('Chat deleted successfully');
      
      // Remove from selection if it was selected
      if (selectedChats.has(chatId)) {
        const newSelection = new Set(selectedChats);
        newSelection.delete(chatId);
        setSelectedChats(newSelection);
      }
      
      // Force invalidate and refetch the dashboard data
      queryClient.removeQueries({ queryKey: ['dashboard', 'overview', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview', user.id] });
      
      // Reset to page 1 if current page would be empty after deletion
      const remainingChats = recentChats.length - 1;
      const maxPages = Math.ceil(remainingChats / chatsPerPage);
      if (currentPage > maxPages && maxPages > 0) {
        setCurrentPage(Math.max(1, maxPages));
      }
      
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete chat');
    }
  };

  if (authLoading || dataLoading) {
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

  if (dashboardError) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-2">Failed to load dashboard data</div>
          <div className="text-gray-400 text-sm">Please refresh the page to try again</div>
        </div>
      </div>
    );
  }

  const userTier = subscription?.plan?.name || "Guest Pass";
  const isGuestPass = userTier === "Guest Pass";
  const username = profile?.username || user.email?.split('@')[0] || 'User';

  // Calculate pagination for recent chats with better handling
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * chatsPerPage;
  const endIndex = startIndex + chatsPerPage;
  const paginatedChats = recentChats.slice(startIndex, endIndex);

  const formattedRecentChats = paginatedChats.map((chat: any) => ({
    id: chat.id,
    character: {
      id: chat.character?.id,
      name: chat.character?.name || 'Unknown',
      avatar: chat.character?.name?.charAt(0) || 'U',
      image: chat.character?.avatar_url || "/placeholder.svg",
      tagline: chat.character?.tagline || ''
    },
    lastMessage: chat.lastMessage || "No messages yet",
    lastMessageIsAI: chat.lastMessageIsAI || false,
    timestamp: new Date(chat.last_message_at || chat.created_at).toLocaleDateString(),
    chatMode: chat.userSettings?.chat_mode || 'storytelling',
    timeAwareness: chat.userSettings?.time_awareness_enabled || false,
    originalChat: chat
  }));

  const formattedMyCharacters = myCharacters.map((character: any) => ({
    id: character.id,
    name: character.name,
    tagline: character.tagline || '',
    avatar: character.name.charAt(0),
    image: character.avatar_url || "/placeholder.svg",
    totalChats: character.actual_chat_count || character.interaction_count || 0,
    likesCount: character.likes_count || 0,
    originalCharacter: character
  }));

  const formattedFavoriteCharacters = favoriteCharacters.map((character: any) => ({
    id: character.id,
    name: character.name,
    tagline: character.tagline || '',
    avatar: character.name.charAt(0),
    image: character.avatar_url || "/placeholder.svg",
    totalChats: character.actual_chat_count || character.interaction_count || 0,
    likesCount: character.likes_count || 0,
    creatorUsername: character.creator?.username || 'Unknown',
    originalCharacter: character
  }));

  return (
    <div className="min-h-screen bg-[#121212]">
      {/* Header - Desktop Only */}
      <header className="bg-[#1a1a2e] border-b border-gray-700/50 p-3 sm:p-6 sticky top-0 z-10 hidden md:block">
        <div className="flex items-center justify-between">
          {/* Title */}
          <div>
            <h1 className="text-white text-xl sm:text-2xl md:text-3xl font-bold">
              <span className="hidden sm:inline">Welcome back to ANIMA, {username}</span>
              <span className="sm:hidden">ANIMA Dashboard</span>
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-1 hidden sm:block">Ready to continue your digital adventures?</p>
          </div>
          
          {/* User Info - responsive */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Credits - always visible */}
            <div className="flex items-center space-x-1 sm:space-x-2">
              <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-[#FF7A00]" />
              <span className="text-[#FF7A00] text-xs sm:text-sm font-bold">{userCredits.toLocaleString()}</span>
            </div>
            
            {/* User Avatar - hidden on small screens */}
            <div className="hidden sm:flex items-center space-x-4">
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
          </div>
        </div>
      </header>

      <div className="p-3 sm:p-6 md:p-6 space-y-4 sm:space-y-6">
        {/* Stats cards above Daily Message Limit */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-colors">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-xs sm:text-sm">Active Chats</p>
                  <p className="text-white text-lg sm:text-2xl font-bold">{recentChats.length}</p>
                </div>
                <MessageCircle className="w-6 h-6 sm:w-8 sm:h-8 text-[#FF7A00]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-colors">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-xs sm:text-sm">Characters</p>
                  <p className="text-white text-lg sm:text-2xl font-bold">{myCharacters.length}</p>
                </div>
                <Users className="w-6 h-6 sm:w-8 sm:h-8 text-[#FF7A00]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-colors">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-xs sm:text-sm">Credits</p>
                  <p className="text-white text-lg sm:text-2xl font-bold">{userCredits.toLocaleString()}</p>
                </div>
                <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-[#FF7A00]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a2e] border-gray-700/50 hover:border-[#FF7A00]/50 transition-colors">
            <CardContent className="p-3 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-xs sm:text-sm">Plan</p>
                  <p className="text-white text-sm sm:text-lg font-bold">{userTier}</p>
                </div>
                <Crown className="w-6 h-6 sm:w-8 sm:h-8 text-[#FF7A00]" />
              </div>
            </CardContent>
          </Card>
        </div>


        {/* Your Dashboard sections - moved above Daily Quest */}
        <Card className="bg-[#1a1a2e] border-gray-700/50 md:mx-0 -mx-3 md:rounded-lg rounded-none border-x-0 md:border-x" style={{ minHeight: 'calc(100vh - 250px)' }}>
          <CardHeader className="pb-2 sm:pb-4 px-3 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-xl sm:text-2xl">Your Dashboard</CardTitle>
              
              {/* Bulk Delete Button - Shows when chats are selected */}
              {selectedChats.size > 0 && (
                <Button
                  onClick={() => setShowDeleteDialog(true)}
                  size="sm"
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={isDeleting}
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
                    {formattedRecentChats.length > 0 ? (
                      <>
                        {formattedRecentChats.map((chat) => (
                          <Card
                            key={chat.id}
                            className="bg-[#121212] border-gray-700/50 hover:border-[#FF7A00]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#FF7A00]/20"
                          >
                            <CardContent className="p-3 sm:p-4">
                              <div className="flex items-start space-x-3 sm:space-x-4">
                                {/* Checkbox for selection */}
                                <Checkbox
                                  checked={selectedChats.has(chat.id)}
                                  onCheckedChange={() => handleChatSelection(chat.id)}
                                  className="mt-4 border-gray-600 data-[state=checked]:bg-[#FF7A00] data-[state=checked]:border-[#FF7A00]"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                
                                <Avatar className="w-12 h-12 sm:w-14 sm:h-14 ring-2 ring-[#FF7A00]/50 flex-shrink-0">
                                  <AvatarImage 
                                    src={chat.character.image} 
                                    alt={chat.character.name}
                                    className="object-cover"
                                  />
                                  <AvatarFallback className="bg-[#FF7A00] text-white font-bold text-sm">
                                    {chat.character.avatar}
                                  </AvatarFallback>
                                </Avatar>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between mb-2">
                                    <div>
                                      <h3 className="text-white font-bold text-base sm:text-lg truncate">
                                        {chat.character.name}
                                      </h3>
                                      {chat.character.tagline && (
                                        <p className="text-gray-400 text-xs sm:text-sm truncate mb-2">
                                          {chat.character.tagline}
                                        </p>
                                      )}
                                      {/* Chat Settings Badges */}
                                      <div className="flex gap-1 sm:gap-2 mb-2">
                                        <Badge 
                                          variant="outline" 
                                          className="text-xs bg-[#FF7A00]/10 border-[#FF7A00]/30 text-[#FF7A00]"
                                        >
                                          {chat.chatMode === 'companion' ? 'Companion' : 'Storytelling'}
                                        </Badge>
                                        <Badge 
                                          variant="outline" 
                                          className={`text-xs ${
                                            chat.timeAwareness 
                                              ? 'bg-green-500/10 border-green-500/30 text-green-400' 
                                              : 'bg-gray-500/10 border-gray-500/30 text-gray-400'
                                          }`}
                                        >
                                          Time Awareness: {chat.timeAwareness ? 'ON' : 'OFF'}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <p className="text-gray-500 text-xs sm:text-sm flex-shrink-0">
                                        {chat.timestamp}
                                      </p>
                                      {/* Single Delete Button */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-400 hover:bg-red-400/10"
                                        onClick={(e) => handleDeleteSingleChat(chat.id, e)}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    {chat.lastMessage !== "No messages yet" ? (
                                      <p className="text-gray-300 text-xs sm:text-sm leading-relaxed line-clamp-2 flex-1">
                                        <span className={chat.lastMessageIsAI ? "text-[#FF7A00]" : "text-blue-400"}>
                                          {chat.lastMessageIsAI ? chat.character.name : 'You'}:
                                        </span>
                                        {' '}{chat.lastMessage}
                                      </p>
                                    ) : (
                                      <p className="text-gray-400 text-xs sm:text-sm flex-1">No messages yet</p>
                                    )}
                                    <Button
                                      onClick={() => handleContinueChat(chat.originalChat)}
                                      size="sm"
                                      className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white flex-shrink-0 text-xs sm:text-sm"
                                    >
                                      <span className="hidden sm:inline">Continue Chat</span>
                                      <span className="sm:hidden">Continue</span>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        
                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                          <div className="flex justify-center items-center space-x-2 mt-4">
                            <Button
                              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={validCurrentPage === 1}
                              variant="outline"
                              size="sm"
                              className="border-gray-700 text-gray-400 hover:text-white"
                            >
                              Previous
                            </Button>
                            <span className="text-gray-400 text-sm">
                              Page {validCurrentPage} of {totalPages}
                            </span>
                            <Button
                              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={validCurrentPage === totalPages}
                              variant="outline"
                              size="sm"
                              className="border-gray-700 text-gray-400 hover:text-white"
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
                    {formattedMyCharacters.length > 0 ? (
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
                                  <span>{character.totalChats}</span>
                                </div>
                                <div className="flex items-center space-x-1 text-gray-300">
                                  <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
                                  <span>{character.likesCount}</span>
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
                    {formattedFavoriteCharacters.length > 0 ? (
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
                                  <span>{character.totalChats}</span>
                                </div>
                                <div className="flex items-center space-x-1 text-gray-300">
                                  <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
                                  <span>{character.likesCount}</span>
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
    </div>
  );
}
