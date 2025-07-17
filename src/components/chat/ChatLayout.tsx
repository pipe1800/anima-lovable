import React, { useState, useEffect } from 'react';
import { ChevronRight, Settings, Search, Heart, Star, MessageCircle, Info, Edit, User, Plus, Upload, X, ChevronDown, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getUserChats, getCharacterDetails } from '@/lib/supabase-queries';
import { getUserPersonas, createPersona, deletePersona, type Persona } from '@/lib/persona-operations';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import AppSidebar from '@/components/dashboard/AppSidebar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { toast } from 'sonner';
import { useTutorial } from '@/contexts/TutorialContext';
import { ChatConfigurationTab } from './ChatConfigurationTab';
import type { TrackedContext } from '@/hooks/useChat';

interface Character {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  fallback: string;
}

interface ChatLayoutProps {
  character: Character;
  children: React.ReactNode;
  currentChatId?: string;
  trackedContext?: TrackedContext;
  onContextUpdate?: (context: TrackedContext) => void;
}

export const ChatLayout = ({ character, children, currentChatId, trackedContext, onContextUpdate }: ChatLayoutProps) => {
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'details' | 'config'>('details');
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [filteredChatHistory, setFilteredChatHistory] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [characterDetails, setCharacterDetails] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  
  // Persona state
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [currentPersona, setCurrentPersona] = useState({
    name: '',
    bio: '',
    lore: '',
    avatar_url: null as string | null
  });
  const [isCreatingPersona, setIsCreatingPersona] = useState(false);
  
  // Tutorial state
  const { handleStepAction, worldInfoDropdownVisible, disableInteractions } = useTutorial();
  const [selectedWorldInfo, setSelectedWorldInfo] = useState<any>(null);
  const [selectedWorldInfoId, setSelectedWorldInfoId] = useState<string | null>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);

        if (user) {
          const { data: chats } = await getUserChats(user.id);
          setChatHistory(chats || []);
          setFilteredChatHistory(chats || []);
          
          // Load user personas
          const userPersonas = await getUserPersonas();
          setPersonas(userPersonas);
          if (userPersonas.length > 0) {
            setSelectedPersona(userPersonas[0]);
          }
          
          // Check if character is liked
          const { data: likes } = await supabase
            .from('character_likes')
            .select('id')
            .eq('character_id', character.id)
            .eq('user_id', user.id)
            .maybeSingle();
          setIsLiked(!!likes);

          // Check if character is favorited
          const { data: favorites } = await supabase
            .from('character_favorites')
            .select('id')
            .eq('character_id', character.id)
            .eq('user_id', user.id)
            .maybeSingle();
          setIsFavorited(!!favorites);
        }

        const { data: charDetails } = await getCharacterDetails(character.id);
        setCharacterDetails(charDetails);
        
        // Load user's world info selection for this character
        if (user) {
          try {
            const { getUserCharacterWorldInfo } = await import('@/lib/user-world-info-operations');
            const result = await getUserCharacterWorldInfo(user.id, character.id);
            if (result.worldInfoId) {
              setSelectedWorldInfoId(result.worldInfoId);
            }
          } catch (error) {
            console.error('Error loading user world info selection:', error);
          }
        }
      } catch (error) {
        console.error('Error loading chat data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [character.id]);

  const handleEditCharacter = () => {
    navigate(`/character-creator?edit=${character.id}`);
  };

  const handleLike = async () => {
    if (!currentUser) return;

    try {
      if (isLiked) {
        // Remove like
        await supabase
          .from('character_likes')
          .delete()
          .eq('character_id', character.id)
          .eq('user_id', currentUser.id);
        setIsLiked(false);
      } else {
        // Add like
        await supabase
          .from('character_likes')
          .insert([{
            character_id: character.id,
            user_id: currentUser.id
          }]);
        setIsLiked(true);
      }
    } catch (error) {
      console.error('Error updating like status:', error);
    }
  };

  const handleFavorite = async () => {
    if (!currentUser) return;

    try {
      if (isFavorited) {
        // Remove favorite
        await supabase
          .from('character_favorites')
          .delete()
          .eq('character_id', character.id)
          .eq('user_id', currentUser.id);
        setIsFavorited(false);
      } else {
        // Add favorite
        await supabase
          .from('character_favorites')
          .insert([{
            character_id: character.id,
            user_id: currentUser.id
          }]);
        setIsFavorited(true);
      }
    } catch (error) {
      console.error('Error updating favorite status:', error);
    }
  };

  const handleRightPanelToggle = () => {
    setRightPanelOpen(!rightPanelOpen);
    handleStepAction('right-panel-toggled');
  };

  const handleWorldInfoSelect = async (worldInfo: any) => {
    setSelectedWorldInfo(worldInfo);
    setSelectedWorldInfoId(worldInfo?.id || null);
    
    // Save user's world info selection to database
    if (!currentUser) return;
    
    try {
      const { saveUserCharacterWorldInfo, removeUserCharacterWorldInfo } = await import('@/lib/user-world-info-operations');
      
      if (worldInfo) {
        const result = await saveUserCharacterWorldInfo(currentUser.id, character.id, worldInfo.id);
        if (!result.success) {
          console.error('Failed to save world info selection:', result.error);
          toast.error('Failed to save world info selection');
        }
      } else {
        const result = await removeUserCharacterWorldInfo(currentUser.id, character.id);
        if (!result.success) {
          console.error('Failed to remove world info selection:', result.error);
          toast.error('Failed to remove world info selection');
        }
      }
    } catch (error) {
      console.error('Error handling world info selection:', error);
      toast.error('Error updating world info selection');
    }
  };

  // Persona handlers
  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setCurrentPersona(prev => ({
          ...prev,
          avatar_url: e.target?.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddPersona = async () => {
    if (!currentPersona.name.trim()) {
      toast.error('Please enter a persona name');
      return;
    }

    if (!currentUser) {
      toast.error('You must be logged in to create personas');
      return;
    }

    setIsCreatingPersona(true);
    try {
      const newPersona = await createPersona({
        name: currentPersona.name.trim(),
        bio: currentPersona.bio.trim() || null,
        lore: currentPersona.lore.trim() || null,
        avatar_url: currentPersona.avatar_url
      });

      setPersonas(prev => [newPersona, ...prev]);
      setCurrentPersona({
        name: '',
        bio: '',
        lore: '',
        avatar_url: null
      });
      setShowPersonaModal(false);
      setSelectedPersona(newPersona);
      toast.success('Persona created successfully!');
    } catch (error) {
      console.error('Error creating persona:', error);
      toast.error('Failed to create persona');
    } finally {
      setIsCreatingPersona(false);
    }
  };

  const handleRemovePersona = async (id: string) => {
    try {
      await deletePersona(id);
      setPersonas(prev => prev.filter(p => p.id !== id));
      if (selectedPersona?.id === id) {
        setSelectedPersona(personas.find(p => p.id !== id) || null);
      }
      toast.success('Persona removed');
    } catch (error) {
      console.error('Error removing persona:', error);
      toast.error('Failed to remove persona');
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!currentUser) return;
    
    try {
      // Delete from database
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId)
        .eq('user_id', currentUser.id);
        
      if (error) throw error;
      
      // Update UI
      const updatedChats = chatHistory.filter(chat => chat.id !== chatId);
      setChatHistory(updatedChats);
      setFilteredChatHistory(updatedChats.filter(chat => 
        chat.character?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chat.title?.toLowerCase().includes(searchQuery.toLowerCase())
      ));
      toast.success('Chat deleted successfully');
      
      // If we deleted the current chat, navigate to character's chat page
      if (chatId === currentChatId) {
        navigate(`/chat/${character.id}`);
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete chat');
    }
  };

  // Handle search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredChatHistory(chatHistory);
    } else {
      const filtered = chatHistory.filter(chat => 
        chat.character?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chat.title?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredChatHistory(filtered);
    }
  }, [searchQuery, chatHistory]);

  // Start new chat function
  const handleStartNewChat = async () => {
    if (!currentUser) return;
    
    try {
      const response = await supabase.functions.invoke('create-chat-with-greeting', {
        body: { characterId: character.id }
      });
      
      if (response.error) throw response.error;
      
      const { chatId } = response.data;
      navigate(`/chat/${character.id}/${chatId}`);
    } catch (error) {
      console.error('Error creating new chat:', error);
      toast.error('Failed to start new chat');
    }
  };

  const isCharacterOwner = currentUser && characterDetails && currentUser.id === characterDetails.creator_id;

  return (
    <div className="flex h-screen w-full bg-[#121212]">
      {/* Left Sidebar */}
      <AppSidebar />
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col ml-64">
        {/* Chat Header */}
        <header className="bg-[#1a1a2e] border-b border-gray-700/50 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <SidebarTrigger className="text-gray-400 hover:text-white" />
            <Avatar className="w-10 h-10 ring-2 ring-[#FF7A00]/50">
              <AvatarImage src={character.avatar || characterDetails?.avatar_url} alt={character.name} />
              <AvatarFallback className="bg-[#FF7A00] text-white font-bold">
                {character.fallback}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-white font-semibold">{character.name}</h1>
              <p className="text-gray-400 text-sm">{character.tagline}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Settings Menu */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRightPanelToggle}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
              data-tutorial="right-panel-toggle"
            >
              <Settings className="w-7 h-7" />
            </Button>
          </div>
        </header>

        {/* Chat Content */}
        <div className="flex-1 overflow-hidden" style={{ pointerEvents: disableInteractions ? 'none' : 'auto' }}>
          {children}
        </div>
      </div>

      {/* Right Panel - Slide in from right */}
      {rightPanelOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setRightPanelOpen(false)}
          />
          
          {/* Panel */}
          <div className="fixed right-0 top-0 h-full w-[544px] bg-[#0f0f0f] border-l border-gray-700/50 z-50 flex flex-col animate-slide-in-right">
            {/* Panel Header */}
            <div className="p-4 border-b border-gray-700/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Panel</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRightPanelOpen(false)}
                  className="text-gray-400 hover:text-white hover:bg-gray-800"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex space-x-1 bg-[#1a1a2e] p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'history'
                      ? 'bg-[#FF7A00] text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Chats</span>
                </button>
                <button
                  onClick={() => setActiveTab('details')}
                  className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'details'
                      ? 'bg-[#FF7A00] text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Info className="w-4 h-4" />
                  <span>Details</span>
                </button>
                <button
                  onClick={() => setActiveTab('config')}
                  className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'config'
                      ? 'bg-[#FF7A00] text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Config</span>
                </button>
              </div>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'history' && (
                <div className="p-4">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search chats..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-[#1a1a2e] border-gray-700/50 text-white placeholder-gray-400 pl-10 focus:ring-[#FF7A00] focus:border-[#FF7A00]"
                    />
                  </div>

                  <div className="space-y-2">
                    {loading ? (
                      <div className="text-gray-400 text-center py-4">Loading chats...</div>
                    ) : filteredChatHistory.length === 0 ? (
                      <div className="text-gray-400 text-center py-4">
                        {searchQuery ? 'No chats match your search' : 'No chat history yet'}
                      </div>
                    ) : (
                      filteredChatHistory.map((chat) => {
                        const isActiveChat = chat.id === currentChatId;
                        
                        return (
                          <div key={chat.id} className="relative group">
                            <div
                              className={`p-3 rounded-lg transition-colors cursor-pointer ${
                                isActiveChat
                                  ? 'bg-[#FF7A00]/30 border border-[#FF7A00]'
                                  : 'bg-[#1a1a2e] border border-transparent hover:border-gray-600'
                              }`}
                              onClick={() => {
                                if (!isActiveChat) {
                                  navigate(`/chat/${chat.character?.id}/${chat.id}`);
                                }
                              }}
                            >
                              <div className="flex items-center space-x-3">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={chat.character?.avatar_url} alt={chat.character?.name} />
                                  <AvatarFallback className="bg-[#FF7A00] text-white text-xs">
                                    {chat.character?.name?.charAt(0) || 'C'}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <h4 className={`font-medium text-sm truncate ${
                                      isActiveChat ? 'text-white' : 'text-gray-300'
                                    }`}>
                                      {chat.character?.name || 'Unknown Character'}
                                    </h4>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="w-6 h-6 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
                                        <AlertDialogHeader>
                                          <AlertDialogTitle className="text-white">Delete Chat</AlertDialogTitle>
                                          <AlertDialogDescription className="text-gray-300">
                                            Are you sure you want to delete this chat? This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel className="bg-gray-600 hover:bg-gray-700 text-white border-gray-600">
                                            Cancel
                                          </AlertDialogCancel>
                                          <AlertDialogAction 
                                            onClick={() => handleDeleteChat(chat.id)}
                                            className="bg-red-600 hover:bg-red-700 text-white"
                                          >
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                  <p className={`text-xs truncate ${
                                    isActiveChat ? 'text-gray-300' : 'text-gray-400'
                                  }`}>
                                    {chat.title || 'New conversation'}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {chat.last_message_at 
                                      ? new Date(chat.last_message_at).toLocaleDateString() 
                                      : new Date(chat.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'details' && (
                <div className="p-4">
                  {loading ? (
                    <div className="text-gray-400 text-center py-4">Loading character details...</div>
                  ) : (
                    <div className="space-y-6">
                      <div className="text-center">
                        <Avatar className="w-24 h-24 mx-auto mb-4 ring-4 ring-[#FF7A00]/30">
                          <AvatarImage src={character.avatar || characterDetails?.avatar_url} alt={character.name} />
                          <AvatarFallback className="bg-[#FF7A00] text-white text-2xl font-bold">
                            {character.fallback}
                          </AvatarFallback>
                        </Avatar>
                        <h2 className="text-xl font-bold text-white">{character.name}</h2>
                      </div>

                      <div>
                        <h3 className="text-white font-semibold mb-2">About</h3>
                        <p className="text-gray-300 text-sm leading-relaxed">
                          {characterDetails?.short_description || character.tagline || 'No description available.'}
                        </p>
                      </div>

                      {characterDetails?.tags && characterDetails.tags.length > 0 && (
                        <div>
                          <h3 className="text-white font-semibold mb-3">Tags</h3>
                          <div className="flex flex-wrap gap-2">
                            {characterDetails.tags.map((tagItem: any, index: number) => (
                              <Badge
                                key={index}
                                variant="secondary"
                                className="bg-[#1a1a2e] text-gray-300 border border-gray-600/50 text-xs"
                              >
                                {tagItem.tag?.name || tagItem.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <h3 className="text-white font-semibold mb-2">Creator</h3>
                        <p className="text-gray-400 text-sm">
                          Created by @{characterDetails?.profiles?.username || characterDetails?.creator?.username || 'Unknown'}
                        </p>
                      </div>

                      <div>
                        <h3 className="text-white font-semibold mb-3">Actions</h3>
                        <div className="space-y-3">
                          <Button
                            onClick={handleStartNewChat}
                            className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
                          >
                            <MessageCircle className="w-4 h-4 mr-2" />
                            Start New Chat
                          </Button>
                          {isCharacterOwner && (
                            <Button
                              onClick={handleEditCharacter}
                              variant="outline"
                              className="w-full bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-gray-300"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit Character
                            </Button>
                          )}
                          <div className="flex space-x-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleLike}
                              className={`flex-1 bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white ${
                                isLiked ? 'text-red-400 border-red-400' : 'text-gray-300'
                              }`}
                            >
                              <Heart className={`w-4 h-4 mr-2 ${isLiked ? 'fill-current' : ''}`} />
                              {isLiked ? 'Liked' : 'Like'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleFavorite}
                              className={`flex-1 bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white ${
                                isFavorited ? 'text-yellow-400 border-yellow-400' : 'text-gray-300'
                              }`}
                            >
                              <Star className={`w-4 h-4 mr-2 ${isFavorited ? 'fill-current' : ''}`} />
                              {isFavorited ? 'Favorited' : 'Favorite'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'config' && currentUser && (
                <ChatConfigurationTab 
                  characterId={character.id}
                  userId={currentUser.id}
                  personas={personas}
                  selectedPersona={selectedPersona}
                  setSelectedPersona={setSelectedPersona}
                  setShowPersonaModal={setShowPersonaModal}
                  worldInfoDropdownVisible={worldInfoDropdownVisible}
                  onWorldInfoSelect={handleWorldInfoSelect}
                  currentChatId={currentChatId}
                  selectedWorldInfoId={selectedWorldInfoId}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Persona Creation Modal */}
      <Dialog open={showPersonaModal} onOpenChange={setShowPersonaModal}>
        <DialogContent className="bg-[#1a1a2e] border-gray-700/50 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Persona</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-blue-200 text-sm text-center">
                <strong>Personas</strong> are the identities you roleplay as when chatting with AI characters. 
                You can create multiple personas and switch between them during conversations.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Avatar Upload */}
              <div className="text-center">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Persona Avatar
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                    id="persona-avatar-upload-modal"
                  />
                  <label
                    htmlFor="persona-avatar-upload-modal"
                    className="cursor-pointer block w-20 h-20 mx-auto rounded-full border-2 border-dashed border-gray-600 hover:border-[#FF7A00] transition-colors duration-300 flex items-center justify-center overflow-hidden"
                  >
                    {currentPersona.avatar_url ? (
                      <img 
                        src={currentPersona.avatar_url} 
                        alt="Persona avatar preview" 
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <div className="text-center">
                        <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                        <span className="text-xs text-gray-400">Upload</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Persona Name *
                </label>
                <Input
                  placeholder="e.g., Alex the Explorer, Sarah the Scholar..."
                  value={currentPersona.name}
                  onChange={(e) => setCurrentPersona(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20"
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Bio
              </label>
              <Textarea
                placeholder="Brief description of this persona..."
                value={currentPersona.bio}
                onChange={(e) => setCurrentPersona(prev => ({ ...prev, bio: e.target.value }))}
                maxLength={200}
                className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1 text-right">
                {currentPersona.bio.length}/200 characters
              </p>
            </div>

            {/* Lore */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Background & Lore
              </label>
              <Textarea
                placeholder="Detailed background, personality traits, history..."
                value={currentPersona.lore}
                onChange={(e) => setCurrentPersona(prev => ({ ...prev, lore: e.target.value }))}
                maxLength={500}
                className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-1 text-right">
                {currentPersona.lore.length}/500 characters
              </p>
            </div>

            <div className="flex space-x-3">
              <Button
                onClick={() => setShowPersonaModal(false)}
                variant="outline"
                className="flex-1 bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddPersona}
                disabled={isCreatingPersona || !currentPersona.name.trim()}
                className="flex-1 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                {isCreatingPersona ? 'Creating...' : 'Create Persona'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};