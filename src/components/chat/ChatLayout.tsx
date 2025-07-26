import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, Settings, Search, Heart, Star, MessageCircle, Info, Edit, User, Plus, Upload, X, ChevronDown, Trash2, Zap, Brain, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getUserChats, getCharacterDetails } from '@/lib/supabase-queries';
import { getUserPersonas, createPersona, deletePersona, type Persona } from '@/lib/persona-operations';
import { useUserGlobalChatSettings } from '@/queries/chatSettingsQueries';
import { getUserCharacterSettings, upsertUserCharacterSettings } from '@/queries/userCharacterSettingsQueries';
import { getBrowserTimezone } from '@/utils/timezone';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import AppSidebar from '@/components/dashboard/AppSidebar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { toast } from 'sonner';
import { useTutorial } from '@/contexts/TutorialContext';
import { ChatConfigurationTab } from './ChatConfigurationTab';
import { MemoriesDialog } from './MemoriesDialog';
import { useCharacterMemories } from '@/hooks/useCharacterMemories';
import { calculateMemoryCreditCost, getMemoryCostExplanation } from '@/lib/memory-cost-calculator';
import { CharacterChatModeToggle } from '@/components/character-creator/CharacterChatModeToggle';
import { ChatModeMismatchModal } from '@/components/character-creator/ChatModeMismatchModal';
import { ChatModeChangeModal } from '@/components/character-creator/ChatModeChangeModal';
import type { TrackedContext, Character } from '@/types/chat';
import { getChatSelectedPersona } from '@/lib/chat-persona-operations';
import { getBestPersonaForNewChat } from '@/lib/user-preferences';

interface ChatLayoutProps {
  character: Character;
  children: React.ReactNode;
  currentChatId?: string;
  trackedContext?: TrackedContext;
  onContextUpdate?: (context: TrackedContext) => void;
  onPersonaChange?: (personaId: string | null) => void;
  onWorldInfoChange?: (worldInfoId: string | null) => void;
  creditsBalance?: number;
}

export const ChatLayout = ({ character, children, currentChatId, trackedContext, onContextUpdate, onPersonaChange, onWorldInfoChange, creditsBalance }: ChatLayoutProps) => {
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
  const [showEditPersonaModal, setShowEditPersonaModal] = useState(false);
  const [personaToEdit, setPersonaToEdit] = useState<Persona | null>(null);
  const [currentPersona, setCurrentPersona] = useState({
    name: '',
    bio: '',
    lore: '',
    avatar_url: null as string | null
  });
  const [isCreatingPersona, setIsCreatingPersona] = useState(false);
  
  // Tutorial state
  const { handleStepAction, worldInfoDropdownVisible, disableInteractions, startTutorial, isActive, currentStep } = useTutorial();
  const [selectedWorldInfoId, setSelectedWorldInfoId] = useState<string | null>(null);
  
  // Enhanced Memory state
  const { data: globalSettings } = useUserGlobalChatSettings();
  const [isCreatingMemory, setIsCreatingMemory] = useState(false);
  const [currentChatMessageCount, setCurrentChatMessageCount] = useState(0);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  
  // Memories Dialog state
  const [showMemoriesDialog, setShowMemoriesDialog] = useState(false);
  const { memories, loading: memoriesLoading, error: memoriesError, refreshMemories } = useCharacterMemories(
    character.id,
    currentUser?.id
  );
  
  // Chat mode state
  const [chatMode, setChatMode] = useState<'storytelling' | 'companion'>('storytelling');
  const [chatModeLoading, setChatModeLoading] = useState(false);
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [pendingChatMode, setPendingChatMode] = useState<'storytelling' | 'companion' | null>(null);
  const [currentChat, setCurrentChat] = useState<any>(null);
  
  // Time awareness state
  const [timeAwarenessEnabled, setTimeAwarenessEnabled] = useState(false);
  const [timeAwarenessLoading, setTimeAwarenessLoading] = useState(false);
  const [userTimezone, setUserTimezone] = useState<string>('UTC');
  
  // Debug Enhanced Memory detection
  useEffect(() => {
    console.log('🧠 Enhanced Memory Debug:', {
      globalSettings,
      enhancedMemoryEnabled: globalSettings?.enhanced_memory,
      currentChatId,
      shouldShowButton: globalSettings?.enhanced_memory && currentChatId
    });
  }, [globalSettings, currentChatId]);

  // Debug Tutorial - Memories Button
  useEffect(() => {
    console.log('🧠 Tutorial Debug - Memories Button:', {
      isActive,
      currentStep,
      globalSettings,
      enhancedMemory: globalSettings?.enhanced_memory,
      shouldShowButton: (globalSettings?.enhanced_memory || (isActive && currentStep === 4))
    });
  }, [isActive, currentStep, globalSettings]);

  // Auto-close right panel when tutorial completes
  const prevIsActive = useRef(isActive);
  useEffect(() => {
    // Only close if tutorial just became inactive (was active, now it's not)
    if (prevIsActive.current && !isActive && rightPanelOpen) {
      console.log('🎓 Tutorial just completed, closing right panel');
      setRightPanelOpen(false);
    }
    prevIsActive.current = isActive;
  }, [isActive, rightPanelOpen]);
  
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);

        // Set user timezone
        setUserTimezone(getBrowserTimezone());

        if (user) {
          const { data: chats } = await getUserChats(user.id);
          setChatHistory(chats || []);
          setFilteredChatHistory(chats || []);
          
          // Load user personas
          const userPersonas = await getUserPersonas();
          setPersonas(userPersonas);
          
          // Load selected persona for current chat (if currentChatId exists)
          if (currentChatId) {
            try {
              const chatPersonaData = await getChatSelectedPersona(currentChatId);
              if (chatPersonaData.personas) {
                setSelectedPersona(chatPersonaData.personas as Persona);
              } else {
                // No persona explicitly set for this chat, use best persona
                const bestPersonaId = await getBestPersonaForNewChat(user.id);
                const bestPersona = bestPersonaId ? userPersonas.find(p => p.id === bestPersonaId) : null;
                setSelectedPersona(bestPersona || null);
              }
            } catch (error) {
              console.error('Error loading chat persona:', error);
              // Error loading, use best persona
              const bestPersonaId = await getBestPersonaForNewChat(user.id);
              const bestPersona = bestPersonaId ? userPersonas.find(p => p.id === bestPersonaId) : null;
              setSelectedPersona(bestPersona || null);
            }
          } else {
            // No chat ID, use best persona for new chat
            const bestPersonaId = await getBestPersonaForNewChat(user.id);
            const bestPersona = bestPersonaId ? userPersonas.find(p => p.id === bestPersonaId) : null;
            setSelectedPersona(bestPersona || null);
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
        
        // Get message count for current chat (for memory cost calculation)
        if (currentChatId && user) {
          try {
            const { count, error } = await supabase
              .from('messages')
              .select('*', { count: 'exact', head: true })
              .eq('chat_id', currentChatId);
            if (error) {
              console.error('Error fetching message count:', error);
              setCurrentChatMessageCount(0);
            } else {
              setCurrentChatMessageCount(count || 0);
            }
          } catch (error) {
            console.error('Error fetching message count:', error);
            setCurrentChatMessageCount(0);
          }
        } else {
          setCurrentChatMessageCount(0);
        }
        
        // Load user's world info selection for this character
        if (user) {
          try {
            const { getUserCharacterWorldInfo } = await import('@/lib/user-world-info-operations');
            const result = await getUserCharacterWorldInfo(user.id, character.id);
            console.log('🌍 ChatLayout: Loading world info selection:', {
              userId: user.id,
              characterId: character.id,
              result: result
            });
            if (result.worldInfoId) {
              setSelectedWorldInfoId(result.worldInfoId);
              
              // Notify parent component
              if (onWorldInfoChange) {
                console.log('📤 ChatLayout: Notifying parent of loaded world info:', result.worldInfoId);
                onWorldInfoChange(result.worldInfoId);
              }
            } else {
              console.log('📝 ChatLayout: No world info selection found for this character');
              
              // Notify parent that no world info is selected
              if (onWorldInfoChange) {
                console.log('📤 ChatLayout: Notifying parent of no world info selection');
                onWorldInfoChange(null);
              }
            }
          } catch (error) {
            console.error('❌ ChatLayout: Error loading user world info selection:', error);
          }
        }
        
        // Load user character settings (chat mode and time awareness)
        if (user) {
          try {
            const settings = await getUserCharacterSettings(user.id, character.id);
            if (settings) {
              setChatMode(settings.chat_mode);
              setTimeAwarenessEnabled(settings.time_awareness_enabled || false);
            }
          } catch (error) {
            console.error('Error loading user character settings:', error);
          }
        }
        
        // Load current chat data to check for mode mismatch
        if (currentChatId && user) {
          try {
            const { data: chatData } = await supabase
              .from('chats')
              .select('chat_mode')
              .eq('id', currentChatId)
              .eq('user_id', user.id)
              .single();
            
            if (chatData) {
              setCurrentChat(chatData);
              
              // Check for mode mismatch
              const settings = await getUserCharacterSettings(user.id, character.id);
              const userCharMode = settings?.chat_mode || 'storytelling';
              
              if (chatData.chat_mode && chatData.chat_mode !== userCharMode) {
                setShowMismatchModal(true);
              }
            }
          } catch (error) {
            console.error('Error loading current chat:', error);
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

  // Notify parent when persona changes
  useEffect(() => {
    if (onPersonaChange) {
      console.log('🎭 ChatLayout: Notifying parent of persona change:', selectedPersona?.id);
      onPersonaChange(selectedPersona?.id || null);
    }
  }, [selectedPersona, onPersonaChange]);

  // Reload persona data for current chat
  const handlePersonaSaved = async () => {
    if (!currentChatId || !currentUser) return;
    
    console.log('🔄 Reloading persona data after save for chat:', currentChatId);
    try {
      const chatPersonaData = await getChatSelectedPersona(currentChatId);
      if (chatPersonaData.personas) {
        console.log('💾 Loaded persona from DB:', chatPersonaData.personas.name);
        setSelectedPersona(chatPersonaData.personas as Persona);
      } else {
        console.log('💾 No persona found in DB, setting to null');
        setSelectedPersona(null);
      }
    } catch (error) {
      console.error('Error reloading persona after save:', error);
    }
  };

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

  const handleRightPanelToggle = useCallback(() => {
    console.log('🔧 Right panel toggle clicked:', { isActive, currentStep, rightPanelOpen });
    
    setRightPanelOpen(prev => {
      const newState = !prev;
      // Only notify tutorial if tutorial is active
      if (newState && currentStep === 1 && isActive) {
        console.log('🔧 Notifying tutorial of right panel toggle');
        handleStepAction('right-panel-toggled');
      }
      return newState;
    });
  }, [currentStep, isActive, handleStepAction]);

    const handleWorldInfoSelect = async (worldInfo: { id: string; name: string } | null) => {
    console.log('🌍 ChatLayout: World info selection changed:', worldInfo);
    setSelectedWorldInfoId(worldInfo?.id || null);
    
    // Notify parent component
    if (onWorldInfoChange) {
      console.log('📤 ChatLayout: Notifying parent of world info change:', worldInfo?.id || null);
      onWorldInfoChange(worldInfo?.id || null);
    }
    
    if (!currentUser || !character?.id) {
      console.warn('⚠️ ChatLayout: Missing user or character for world info save');
      return;
    }

    try {
      const { saveUserCharacterWorldInfo, removeUserCharacterWorldInfo } = await import('@/lib/user-world-info-operations');
      
      if (worldInfo) {
        const result = await saveUserCharacterWorldInfo(currentUser.id, character.id, worldInfo.id);
        console.log('💾 ChatLayout: Save world info selection result:', result);
      } else {
        const result = await removeUserCharacterWorldInfo(currentUser.id, character.id);
        console.log('🗑️ ChatLayout: Remove world info selection result:', result);
      }
    } catch (error) {
      console.error('❌ ChatLayout: Error saving world info selection:', error);
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

  // Handle chat mode changes
  const handleChatModeChange = async (mode: 'storytelling' | 'companion') => {
    // Show modal before making any changes
    setPendingChatMode(mode);
    setShowChangeModal(true);
  };

  // Handle confirming chat mode change
  const handleConfirmChatModeChange = async () => {
    if (!currentUser || !pendingChatMode) return;
    
    setChatModeLoading(true);
    
    try {
      // Update user character settings
      await upsertUserCharacterSettings(currentUser.id, character.id, {
        chat_mode: pendingChatMode
      });
      
      setChatMode(pendingChatMode);
      
      // Create new chat with the new mode by triggering the start new chat function
      await handleStartNewChat();
      
      toast.success(`Chat mode updated to ${pendingChatMode}`, {
        description: 'A new chat has been created with the updated mode'
      });
    } catch (error) {
      console.error('Error updating chat mode:', error);
      toast.error('Failed to update chat mode');
    } finally {
      setChatModeLoading(false);
      setShowChangeModal(false);
      setPendingChatMode(null);
    }
  };

  // Handle time awareness toggle
  const handleTimeAwarenessChange = async (enabled: boolean) => {
    if (!currentUser) return;
    
    setTimeAwarenessLoading(true);
    
    try {
      // Update user character settings
      await upsertUserCharacterSettings(currentUser.id, character.id, {
        time_awareness_enabled: enabled
      });
      
      setTimeAwarenessEnabled(enabled);
      
      toast.success(`Time awareness ${enabled ? 'enabled' : 'disabled'}`, {
        description: enabled 
          ? 'The character will now react to response delays based on their personality'
          : 'The character will no longer react to response delays'
      });
    } catch (error) {
      console.error('Error updating time awareness:', error);
      toast.error('Failed to update time awareness setting');
    } finally {
      setTimeAwarenessLoading(false);
    }
  };

  // Handle creating new chat for mode mismatch
  const handleCreateNewChatForMode = async () => {
    if (!currentUser) return;
    
    try {
      // Create new chat with current character mode
      await handleStartNewChat();
      setShowMismatchModal(false);
    } catch (error) {
      console.error('Error creating new chat:', error);
      toast.error('Failed to create new chat');
    }
  };

  // Handle changing character mode to match chat
  const handleChangeCharacterMode = async () => {
    if (!currentChat || !currentUser) return;
    
    try {
      await upsertUserCharacterSettings(currentUser.id, character.id, {
        chat_mode: currentChat.chat_mode
      });
      
      setChatMode(currentChat.chat_mode);
      setShowMismatchModal(false);
      
      toast.success(`Character mode changed to ${currentChat.chat_mode}`, {
        description: 'Mode updated to match this chat'
      });
    } catch (error) {
      console.error('Error changing character mode:', error);
      toast.error('Failed to change character mode');
    }
  };

  // Start new chat function
  const handleStartNewChat = async () => {
    if (!currentUser || isCreatingNewChat) return;
    
    setIsCreatingNewChat(true);
    
    try {
      console.log('🎯 ChatLayout: Creating new chat for character:', character.id);
      
      const response = await supabase.functions.invoke('chat-management', {
        body: { 
          operation: 'create-with-greeting',
          charactersData: [{
            id: character.id,
            name: character.name
          }],
          selectedPersonaId: selectedPersona?.id || null
          // Don't pass chatMode - let backend fetch from user settings
        }
      });
      
      if (response.error) throw response.error;
      
      const { chat_id } = response.data;
      console.log('✅ ChatLayout: Chat created successfully:', chat_id);
      navigate(`/chat/${character.id}/${chat_id}`);
    } catch (error) {
      console.error('Error creating new chat:', error);
      toast.error('Failed to start new chat');
    } finally {
      setIsCreatingNewChat(false);
    }
  };

  // Enhanced Memory handler
  const handleCreateMemory = async () => {
    if (!currentUser || !currentChatId || isCreatingMemory) return;
    
    setIsCreatingMemory(true);
    
    try {
      const response = await supabase.functions.invoke('chat-management', {
        body: {
          operation: 'create-memory',
          chatId: currentChatId,
          characterId: character.id
        }
      });
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to create memory');
      }
      
      // The backend returns { success: true, message: '...', data: {...} }
      if (response.data?.success) {
        const creditCost = response.data.data?.creditCost || 0;
        toast.success('Memory created successfully! 🧠', {
          description: `Conversation summarized with ${response.data.data?.messageCount || 0} messages processed. ${creditCost} credits deducted.`,
        });
      } else {
        throw new Error(response.data?.message || response.data?.error || 'Failed to create memory');
      }
    } catch (error) {
      console.error('Error creating memory:', error);
      toast.error('Failed to create memory', {
        description: error.message || 'Please try again later.',
      });
    } finally {
      setIsCreatingMemory(false);
    }
  };

  const isCharacterOwner = currentUser && characterDetails && currentUser.id === characterDetails.creator_id;

  return (
    <div className="flex h-screen w-full bg-[#121212]">
      {/* Left Sidebar */}
      <AppSidebar />
      
      {/* Main Chat Area - Remove the fixed ml-64 */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <header className="bg-[#1a1a2e] border-b border-gray-700/50 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <SidebarTrigger 
              className="text-gray-400 hover:text-white" 
              data-tutorial="sidebar-trigger"
            />
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
            {/* Credits Balance */}
            {creditsBalance !== undefined && (
              <div 
                className="flex items-center space-x-2 px-3 py-1.5 bg-[#0f0f0f] border border-gray-700/50 rounded-lg"
                data-tutorial="credits-display"
              >
                <Zap className="w-3 h-3 text-[#FF7A00]" />
                <span className="text-sm font-medium text-white">{creditsBalance.toLocaleString()}</span>
                <span className="text-xs text-gray-400">credits</span>
              </div>
            )}
            
            {/* DEV: Test Tutorial Button */}
            {process.env.NODE_ENV === 'development' && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  console.log('🎯 Manual tutorial trigger - forcing start');
                  
                  // Reset the tutorial completion in profiles table
                  if (currentUser?.id) {
                    const { error } = await supabase
                      .from('profiles')
                      .update({ onboarding_completed: false })
                      .eq('id', currentUser.id);
                    
                    if (!error) {
                      console.log('🎯 Tutorial completion reset in profiles');
                    }
                  }
                  
                  // Start the tutorial
                  startTutorial();
                }}
                className="bg-[#0f0f0f] border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 hover:border-blue-400 transition-all duration-200"
                title="Start tutorial (dev only)"
              >
                📚 Tutorial
              </Button>
            )}
            
            {/* Create Memory Button */}
            {currentChatId && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isCreatingMemory}
                    className="bg-[#0f0f0f] border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 hover:border-purple-400 transition-all duration-200"
                    title="Create memory from this conversation"
                    data-tutorial="create-memory"
                  >
                    {isCreatingMemory ? (
                      <>
                        <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mr-2" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Brain className="w-3 h-3 mr-2" />
                        Create Memory
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-400" />
                      Create Character Memory
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-gray-300">
                      This will use AI to summarize your current conversation with {character.name} and save it as a memory. 
                      The memory will help the character remember important details from your interactions.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  
                  {/* Credit Cost Information - Outside of AlertDialogDescription to avoid nesting issues */}
                  <div className="bg-purple-900/20 border border-purple-500/30 rounded-md p-3 mb-4">
                    <div className="flex items-center gap-2 text-purple-300 text-sm">
                      <Zap className="w-4 h-4" />
                      <span className="font-medium">Credit Cost:</span>
                    </div>
                    <div className="text-sm text-gray-300 mt-1">
                      {currentChatMessageCount > 0 ? (
                        <>
                          <strong className="text-white">{getMemoryCostExplanation(currentChatMessageCount)}</strong>
                          <br />
                          <span className="text-xs text-gray-400 mt-1">
                            Based on {currentChatMessageCount} message{currentChatMessageCount !== 1 ? 's' : ''} in this conversation
                          </span>
                        </>
                      ) : (
                        <span className="text-yellow-300">Loading message count...</span>
                      )}
                    </div>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-gray-700 text-white hover:bg-gray-600">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleCreateMemory}
                      className="bg-purple-600 text-white hover:bg-purple-700"
                    >
                      Create Memory
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            
            {/* Settings Menu */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRightPanelToggle}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
              data-tutorial="right-panel-toggle"
              style={{ position: 'relative', zIndex: isActive ? 1000002 : 'auto' }}
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
          {/* Backdrop removed to prevent dimming overlay confusion with tutorial */}
          
          {/* Panel - Low z-index to stay under tutorial */}
          <div 
            className="fixed right-0 top-0 h-full w-[544px] bg-[#0f0f0f] border-l border-gray-700/50 flex flex-col animate-slide-in-right"
            style={{ zIndex: 41 }}
            data-tutorial="right-panel"
          >
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
              <div className="flex space-x-1 bg-[#1a1a2e] p-1 rounded-lg" data-tutorial="right-panel-tabs">
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
                  onClick={() => {
                    setActiveTab('config');
                    handleStepAction('config-tab-clicked');
                  }}
                  data-tutorial="config-tab"
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
                            disabled={isCreatingNewChat}
                            className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white disabled:opacity-50"
                          >
                            <MessageCircle className="w-4 h-4 mr-2" />
                            {isCreatingNewChat ? 'Creating...' : 'Start New Chat'}
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
                          {/* View Memories Button - Show if Enhanced Memory is enabled OR tutorial is active on step 5 */}
                          {(globalSettings?.enhanced_memory || (isActive && currentStep === 4)) && (
                            <Button
                              data-tutorial="memories-button"
                              onClick={() => setShowMemoriesDialog(true)}
                              variant="outline"
                              className="w-full bg-transparent border-[#FF7A00]/50 hover:bg-[#FF7A00]/10 hover:text-[#FF7A00] text-[#FF7A00] border-[#FF7A00]/30"
                            >
                              <Brain className="w-4 h-4 mr-2" />
                              View Memories ({memories.length})
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
                      
                      {/* Chat Mode Settings - Only show if user is logged in */}
                      {currentUser && (
                        <div>
                          <h3 className="text-white font-semibold mb-3">Chat Settings</h3>
                          <div className="space-y-4">
                            <CharacterChatModeToggle
                              chatMode={chatMode}
                              onChange={handleChatModeChange}
                              showWarning={false}
                              disabled={chatModeLoading}
                            />
                            
                            {/* Time Awareness Toggle */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Clock className="w-4 h-4 text-[#FF7A00]" />
                                  <span className="text-white text-sm font-medium">Time Awareness</span>
                                </div>
                                <Switch
                                  checked={timeAwarenessEnabled}
                                  onCheckedChange={handleTimeAwarenessChange}
                                  disabled={timeAwarenessLoading}
                                  className="data-[state=checked]:bg-[#FF7A00]"
                                />
                              </div>
                              <p className="text-gray-400 text-xs leading-relaxed">
                                When enabled, the character will react to how long you take to respond based on their personality. 
                                Patient characters stay calm with delays, while impatient ones may show frustration.
                              </p>
                              {timeAwarenessEnabled && (
                                <p className="text-gray-400 text-xs mt-2">
                                  <Clock className="w-3 h-3 inline mr-1" />
                                  Your timezone: {userTimezone}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
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
                  setShowEditPersonaModal={setShowEditPersonaModal}
                  setPersonaToEdit={setPersonaToEdit}
                  worldInfoDropdownVisible={worldInfoDropdownVisible}
                  onWorldInfoSelect={handleWorldInfoSelect}
                  currentChatId={currentChatId}
                  selectedWorldInfoId={selectedWorldInfoId}
                  onPersonaSaved={handlePersonaSaved}
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

      {/* Edit Persona Modal */}
      <Dialog open={showEditPersonaModal} onOpenChange={setShowEditPersonaModal}>
        <DialogContent className="bg-[#1a1a2e] border-gray-700/50 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Persona</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-blue-200 text-sm text-center">
                Edit your persona details. Changes will apply to future conversations.
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
                    className="hidden"
                    id="edit-persona-avatar"
                    disabled={isCreatingPersona}
                  />
                  <label 
                    htmlFor="edit-persona-avatar"
                    className="cursor-pointer inline-block"
                  >
                    <Avatar className="w-20 h-20 mx-auto">
                      <AvatarImage 
                        src={personaToEdit?.avatar_url || undefined} 
                        alt="Persona" 
                      />
                      <AvatarFallback className="bg-[#FF7A00] text-white text-lg">
                        {personaToEdit?.name?.split(' ').map(n => n[0]).join('') || 'P'}
                      </AvatarFallback>
                    </Avatar>
                  </label>
                  <div className="mt-2 text-xs text-gray-400">
                    Click to upload avatar
                  </div>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Name
                  </label>
                  <Input
                    placeholder="Enter persona name..."
                    value={personaToEdit?.name || ''}
                    onChange={(e) => setPersonaToEdit(prev => prev ? { ...prev, name: e.target.value } : null)}
                    maxLength={50}
                    className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20"
                    disabled={isCreatingPersona}
                  />
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Bio
                  </label>
                  <Textarea
                    placeholder="Brief description of this persona..."
                    value={personaToEdit?.bio || ''}
                    onChange={(e) => setPersonaToEdit(prev => prev ? { ...prev, bio: e.target.value } : null)}
                    maxLength={200}
                    className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
                    rows={3}
                    disabled={isCreatingPersona}
                  />
                  <p className="text-xs text-gray-500 mt-1 text-right">
                    {(personaToEdit?.bio || '').length}/200 characters
                  </p>
                </div>
              </div>
            </div>

            {/* Background & Lore */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Background & Lore
              </label>
              <Textarea
                placeholder="Detailed background, personality traits, history..."
                value={personaToEdit?.lore || ''}
                onChange={(e) => setPersonaToEdit(prev => prev ? { ...prev, lore: e.target.value } : null)}
                maxLength={500}
                className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
                rows={4}
                disabled={isCreatingPersona}
              />
              <p className="text-xs text-gray-500 mt-1 text-right">
                {(personaToEdit?.lore || '').length}/500 characters
              </p>
            </div>

            <div className="flex space-x-3">
              <Button
                onClick={() => {
                  setShowEditPersonaModal(false);
                  setPersonaToEdit(null);
                }}
                variant="outline"
                className="flex-1 bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-gray-300"
                disabled={isCreatingPersona}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!personaToEdit?.name.trim()) return;
                  
                  try {
                    setIsCreatingPersona(true);
                    const { updatePersona } = await import('@/lib/persona-operations');
                    
                    const updatedPersona = await updatePersona(personaToEdit.id, {
                      name: personaToEdit.name,
                      bio: personaToEdit.bio,
                      lore: personaToEdit.lore,
                    });

                    // Update local state
                    setPersonas(prev => prev.map(p => p.id === updatedPersona.id ? updatedPersona : p));
                    if (selectedPersona?.id === updatedPersona.id) {
                      setSelectedPersona(updatedPersona);
                    }

                    setShowEditPersonaModal(false);
                    setPersonaToEdit(null);
                    toast.success('Persona updated successfully!');
                  } catch (error) {
                    console.error('Error updating persona:', error);
                    toast.error('Failed to update persona');
                  } finally {
                    setIsCreatingPersona(false);
                  }
                }}
                className="flex-1 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold"
                disabled={isCreatingPersona || !personaToEdit?.name.trim()}
              >
                {isCreatingPersona ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  'Update Persona'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Memories Dialog */}
      <MemoriesDialog
        open={showMemoriesDialog}
        onOpenChange={setShowMemoriesDialog}
        memories={memories}
        loading={memoriesLoading}
        error={memoriesError}
        characterName={character.name}
        onRefresh={refreshMemories}
      />

      {/* Chat Mode Mismatch Modal */}
      <ChatModeMismatchModal
        isOpen={showMismatchModal}
        onClose={() => setShowMismatchModal(false)}
        chatMode={currentChat?.chat_mode || 'storytelling'}
        characterMode={chatMode}
        onCreateNewChat={handleCreateNewChatForMode}
        onChangeCharacterMode={handleChangeCharacterMode}
      />

      {/* Chat Mode Change Modal */}
      <ChatModeChangeModal
        isOpen={showChangeModal}
        onClose={() => {
          setShowChangeModal(false);
          setPendingChatMode(null);
        }}
        newMode={pendingChatMode || 'storytelling'}
        onConfirm={handleConfirmChatModeChange}
      />
    </div>
  );
};