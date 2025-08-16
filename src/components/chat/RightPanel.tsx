import React, { lazy, Suspense, useRef, useState } from 'react';
import { Settings, Info, MessageCircle, X } from 'lucide-react';
import type { Character } from '@/types/chat';
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

// Lazy loaded tab contents
const ChatHistoryList = lazy(() => import('./ChatHistoryList'));
const ChatDetailsPanel = lazy(() => import('./ChatDetailsPanel'));
const ChatConfigurationTab = lazy(() =>
  import('./ChatConfigurationTab').then(m => ({ default: m.ChatConfigurationTab }))
);
const ChatStyleTab = lazy(() => import('./ChatStyleTab').then(m => ({ default: m.ChatStyleTab })));

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
  const [activeConfigSubtab, setActiveConfigSubtab] = useState<'chat' | 'style'>('chat');

  // Track unsaved changes from subtabs
  const [configHasUnsaved, setConfigHasUnsaved] = useState(false);
  const [styleHasUnsaved, setStyleHasUnsaved] = useState(false);
  const [discardSignal, setDiscardSignal] = useState(0);

  const hasUnsaved = configHasUnsaved || styleHasUnsaved;

  // Close panel on mobile after successful save in child tabs
  const handleChildSaved = () => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        onClose();
      }
    } catch {}
  };

  // Unsaved changes dialog state
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  type PendingAction =
    | { type: 'close' }
    | { type: 'switchTab'; next: 'history' | 'details' | 'config' }
    | { type: 'switchSubtab'; next: 'chat' | 'style' };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Prevent the same click that closes the dialog from triggering the overlay close handler
  const suppressOverlayClickRef = useRef(false);

  // Central guard: if there are unsaved changes, show dialog and store intended action
  const guardOrExecute = (action: PendingAction, execute: () => void) => {
    if (hasUnsaved) {
      setPendingAction(action);
      setShowUnsavedDialog(true);
    } else {
      execute();
    }
  };

  const handleDiscardChanges = () => {
    // Suppress overlay close from this same click
    suppressOverlayClickRef.current = true;
    setShowUnsavedDialog(false);
    // Immediately clear local unsaved flags to avoid re-trigger during the same click
    setConfigHasUnsaved(false);
    setStyleHasUnsaved(false);
    // Tell children to discard
    setDiscardSignal((n) => n + 1);
    // Perform the pending action immediately
    if (pendingAction) {
      const act = pendingAction;
      setPendingAction(null);
      if (act.type === 'close') {
        onClose();
      } else if (act.type === 'switchTab') {
        setActiveTab(act.next);
        if (act.next === 'config') onConfigTabClicked();
      } else if (act.type === 'switchSubtab') {
        setActiveConfigSubtab(act.next);
      }
    }
  };

  const handleKeepEditing = () => {
    // Suppress overlay close from this same click
    suppressOverlayClickRef.current = true;
    // Just close the dialog and keep editing; do not proceed
    setShowUnsavedDialog(false);
    setPendingAction(null);
  };

  const tryClose = () => {
    guardOrExecute({ type: 'close' }, onClose);
  };

  const trySwitchTab = (next: 'history' | 'details' | 'config') => {
    if (activeTab === next) return;
    guardOrExecute({ type: 'switchTab', next }, () => {
      setActiveTab(next);
      if (next === 'config') onConfigTabClicked();
    });
  };

  const trySwitchConfigSubtab = (next: 'chat' | 'style') => {
    if (activeConfigSubtab === next) return;
    guardOrExecute({ type: 'switchSubtab', next }, () => setActiveConfigSubtab(next));
  };

  if (!open) return null;

  return (
    // Wrapper overlay handles outside clicks; panel stops propagation
    <div
      className="fixed inset-0 z-40 bg-black/50 md:bg-black/20"
      onClick={(e) => {
        // Ignore overlay clicks if dialog is open, or if this click originated from dialog buttons
        if (showUnsavedDialog || suppressOverlayClickRef.current) {
          suppressOverlayClickRef.current = false; // reset for next click
          return;
        }
        tryClose();
      }}
    >
      {/* Panel - Full screen on mobile, slide-in on desktop */}
      <div
        className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:h-full w-full md:w-[544px] bg-[#0f0f0f] md:border-l border-gray-700/50 flex flex-col animate-slide-in-right z-[41]"
        data-tutorial="right-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel Header */}
        <div className="px-4 pt-4 border-b border-gray-700/50 relative">
          {/* Close button */}
          <button
            aria-label="Close panel"
            onClick={tryClose}
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
              onClick={() => trySwitchTab('history')}
              className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 rounded-md text-sm sm:text-base font-medium transition-colors ${
                activeTab === 'history' ? 'bg-[#FF7A00] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Chats</span>
            </button>
            <button
              onClick={() => trySwitchTab('details')}
              className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 rounded-md text-sm sm:text-base font-medium transition-colors ${
                activeTab === 'details' ? 'bg-[#FF7A00] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Info className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Details</span>
            </button>
            <button
              onClick={() => trySwitchTab('config')}
              data-tutorial="config-tab"
              className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 rounded-md text-sm sm:text-base font-medium transition-colors ${
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
              <div className="p-0">
                {/* Config subtabs */}
                <div className="px-4 pt-4">
                  <div className="flex space-x-1 bg-[#1a1a2e] p-1 rounded-lg">
                    <button
                      onClick={() => trySwitchConfigSubtab('chat')}
                      data-tutorial="chat-config-subtab"
                      className={`flex-1 px-3 py-2 rounded-md text-sm sm:text-base font-medium transition-colors ${
                        activeConfigSubtab === 'chat' ? 'bg-[#FF7A00] text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Chat Config
                    </button>
                    <button
                      onClick={() => trySwitchConfigSubtab('style')}
                      data-tutorial="chat-style-subtab"
                      className={`flex-1 px-3 py-2 rounded-md text-sm sm:text-base font-medium transition-colors ${
                        activeConfigSubtab === 'style' ? 'bg-[#FF7A00] text-white' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Chat Style
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <Suspense fallback={<div className="p-4 text-gray-400">Loading...</div>}>
                    {activeConfigSubtab === 'chat' ? (
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
                        onUnsavedChange={setConfigHasUnsaved}
                        discardSignal={discardSignal}
                        onSaved={handleChildSaved}
                      />
                    ) : (
                      <ChatStyleTab
                        currentChatId={currentChatId}
                        onUnsavedChange={setStyleHasUnsaved}
                        discardSignal={discardSignal}
                        onSaved={handleChildSaved}
                      />
                    )}
                  </Suspense>
                </div>
              </div>
            )}
          </Suspense>
        </div>
      </div>

      {/* Unsaved changes dialog */}
      <div onClick={(e) => e.stopPropagation()}>
        <AlertDialog open={showUnsavedDialog} onOpenChange={(o) => setShowUnsavedDialog(o)}>
          <AlertDialogContent className="bg-[#1a1a2e] border-gray-700/50 text-white max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Unsaved changes</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-300">
                You have unsaved changes. If you leave this section now, your changes will be discarded.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleKeepEditing} className="bg-transparent border border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-gray-300">
                Keep editing
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDiscardChanges} className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold">
                Discard changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
