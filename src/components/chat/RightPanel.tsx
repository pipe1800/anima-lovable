import React, { lazy, Suspense, useState } from 'react';
import { Settings, Info, MessageCircle, X } from 'lucide-react';
import type { Character } from '@/types/chat';

// Lazy loaded tab contents
const ChatHistoryList = lazy(() => import('./ChatHistoryList'));
const ChatDetailsPanel = lazy(() => import('./ChatDetailsPanel'));
const ChatConfigurationTab = lazy(() =>
  import('./ChatConfigurationTab').then(m => ({ default: m.ChatConfigurationTab }))
);

interface RightPanelProps {
  open: boolean;
  onClose: () => void;
  // tutorial hooks
  onConfigTabClicked: () => void;
  // history props
  loading: boolean;
  filteredChatHistory: any[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  currentChatId?: string;
  onSelectChat: (characterId: string, chatId: string) => void;
  onDeleteChat: (chatId: string) => Promise<void> | void;
  // details props
  character: Character;
  characterDetails: any;
  isCharacterOwner: boolean;
  onStartNewChat: () => void;
  isCreatingNewChat: boolean;
  onEditCharacter: () => void;
  showMemoriesButton: boolean;
  memoriesCount: number;
  onOpenMemories: () => void;
  isLiked: boolean;
  onLike: () => void;
  isFavorited: boolean;
  onFavorite: () => void;
  currentUser: any;
  chatMode: 'storytelling' | 'companion';
  onChatModeChange: (mode: 'storytelling' | 'companion') => void;
  chatModeLoading: boolean;
  timeAwarenessEnabled: boolean;
  onTimeAwarenessChange: (enabled: boolean) => void;
  timeAwarenessLoading: boolean;
  userTimezone: string;
  // config props
  worldInfoDropdownVisible: boolean;
  onWorldInfoSelect: (worldInfo: { id: string; name: string } | null) => void;
  selectedWorldInfoId: string | null;
  currentUserId?: string;
  personas: any[];
  selectedPersona: any | null;
  setSelectedPersona: (p: any | null) => void;
  setShowPersonaModal: (open: boolean) => void;
  setShowEditPersonaModal: (open: boolean) => void;
  setPersonaToEdit: (p: any | null) => void;
  onPersonaSaved: () => Promise<void> | void;
}

export default function RightPanel(props: RightPanelProps) {
  const {
    open,
    onClose,
    onConfigTabClicked,
    loading,
    filteredChatHistory,
    searchQuery,
    setSearchQuery,
    currentChatId,
    onSelectChat,
    onDeleteChat,
    character,
    characterDetails,
    isCharacterOwner,
    onStartNewChat,
    isCreatingNewChat,
    onEditCharacter,
    showMemoriesButton,
    memoriesCount,
    onOpenMemories,
    isLiked,
    onLike,
    isFavorited,
    onFavorite,
    currentUser,
    chatMode,
    onChatModeChange,
    chatModeLoading,
    timeAwarenessEnabled,
    onTimeAwarenessChange,
    timeAwarenessLoading,
    userTimezone,
    worldInfoDropdownVisible,
    onWorldInfoSelect,
    selectedWorldInfoId,
    currentUserId,
    personas,
    selectedPersona,
    setSelectedPersona,
    setShowPersonaModal,
    setShowEditPersonaModal,
    setPersonaToEdit,
    onPersonaSaved,
  } = props;

  const [activeTab, setActiveTab] = useState<'history' | 'details' | 'config'>('details');

  if (!open) return null;

  return (
    <>
      {/* Backdrop - Mobile Only */}
      <div
        className="md:hidden fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Panel - Full screen on mobile, slide-in on desktop */}
      <div
        className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:h-full w-full md:w-[544px] bg-[#0f0f0f] md:border-l border-gray-700/50 flex flex-col animate-slide-in-right z-[41]"
        data-tutorial="right-panel"
      >
        {/* Panel Header */}
        <div className="p-4 border-b border-gray-700/50 relative">
          {/* Close button */}
          <button
            aria-label="Close panel"
            onClick={onClose}
            className="absolute right-3 top-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-700/50"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center justify-center mb-4">
            <h2 className="text-white font-semibold">Panel</h2>
          </div>

          {/* Tabs - Mobile Responsive */}
          <div className="flex space-x-1 bg-[#1a1a2e] p-1 rounded-lg" data-tutorial="right-panel-tabs">
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === 'history' ? 'bg-[#FF7A00] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Chats</span>
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === 'details' ? 'bg-[#FF7A00] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Info className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Details</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('config');
                onConfigTabClicked();
              }}
              data-tutorial="config-tab"
              className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === 'config' ? 'bg-[#FF7A00] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Config</span>
            </button>
          </div>
        </div>

        {/* Panel Content - Mobile Responsive */}
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<div className="p-4 text-gray-400">Loading...</div>}>
            {activeTab === 'history' && (
              <ChatHistoryList
                loading={loading}
                filteredChatHistory={filteredChatHistory}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                currentChatId={currentChatId}
                onSelectChat={onSelectChat}
                onDeleteChat={onDeleteChat}
              />
            )}

            {activeTab === 'details' && (
              <ChatDetailsPanel
                loading={loading}
                character={character}
                characterDetails={characterDetails}
                isCharacterOwner={!!isCharacterOwner}
                onStartNewChat={onStartNewChat}
                isCreatingNewChat={isCreatingNewChat}
                onEditCharacter={onEditCharacter}
                showMemoriesButton={showMemoriesButton}
                memoriesCount={memoriesCount}
                onOpenMemories={onOpenMemories}
                isLiked={isLiked}
                onLike={onLike}
                isFavorited={isFavorited}
                onFavorite={onFavorite}
              />
            )}

            {activeTab === 'config' && currentUserId && (
              <ChatConfigurationTab
                characterId={character.id}
                userId={currentUserId}
                personas={personas}
                selectedPersona={selectedPersona}
                setSelectedPersona={setSelectedPersona}
                setShowPersonaModal={setShowPersonaModal}
                setShowEditPersonaModal={setShowEditPersonaModal}
                setPersonaToEdit={setPersonaToEdit}
                worldInfoDropdownVisible={worldInfoDropdownVisible}
                onWorldInfoSelect={onWorldInfoSelect}
                currentChatId={currentChatId}
                selectedWorldInfoId={selectedWorldInfoId}
                onPersonaSaved={onPersonaSaved}
                chatMode={chatMode}
                onChatModeChange={onChatModeChange}
                chatModeLoading={chatModeLoading}
                timeAwarenessEnabled={timeAwarenessEnabled}
                onTimeAwarenessChange={onTimeAwarenessChange}
                timeAwarenessLoading={timeAwarenessLoading}
                userTimezone={userTimezone}
              />
            )}
          </Suspense>
        </div>
      </div>
    </>
  );
}
