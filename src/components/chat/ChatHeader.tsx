import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Zap, Brain, Settings } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface ChatHeaderProps {
  character: any;
  characterDetails: any;
  creditsBalance?: number;
  currentUser: any;
  isCreatingMemory: boolean;
  currentChatId?: string;
  onConfirmCreateMemory: () => void;
  onToggleRightPanel: () => void;
  isTutorialActive: boolean;
  currentStep: number;
  startTutorial: () => void;
  isMessageCountLoading: boolean;
  messageCount: number;
  getMemoryCostText: (count: number) => string;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  character,
  characterDetails,
  creditsBalance,
  currentUser,
  isCreatingMemory,
  currentChatId,
  onConfirmCreateMemory,
  onToggleRightPanel,
  isTutorialActive,
  currentStep,
  startTutorial,
  isMessageCountLoading,
  messageCount,
  getMemoryCostText,
}) => {
  return (
    <header className="bg-[#0f0f0f] border-b border-gray-700/50 p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
          <Avatar className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0">
            <AvatarImage src={character.avatar || characterDetails?.avatar_url} alt={character.name} className="object-cover" />
            <AvatarFallback className="bg-[#FF7A00] text-white font-bold text-sm sm:text-base">
              {character.fallback}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-white font-semibold text-sm sm:text-base truncate">{character.name}</h1>
            <p className="text-gray-400 text-xs sm:text-sm truncate">{character.tagline}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
          {creditsBalance !== undefined && (
            <div 
              className="flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-[#0f0f0f] border border-gray-700/50 rounded-lg"
              data-tutorial="credits-display"
            >
              <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-[#FF7A00]" />
              <span className="text-xs sm:text-sm font-medium text-white">{creditsBalance.toLocaleString()}</span>
              <span className="hidden sm:inline text-xs text-gray-400">credits</span>
            </div>
          )}

          {process.env.NODE_ENV === 'development' && (
            <Button
              variant="outline"
              size="sm"
              onClick={startTutorial}
              className="bg-[#0f0f0f] border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 hover:border-blue-400 transition-all duration-200 text-xs sm:text-sm px-2 sm:px-3"
              title="Start tutorial (dev only)"
            >
              <span className="hidden sm:inline">📚 Tutorial</span>
              <span className="sm:hidden">📚</span>
            </Button>
          )}

          {currentChatId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isCreatingMemory}
                  className="bg-[#0f0f0f] border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 hover:border-purple-400 transition-all duration-200 text-xs sm:text-sm px-2 sm:px-3"
                  title="Create memory from this conversation"
                  data-tutorial="create-memory"
                >
                  {isCreatingMemory ? (
                    <>
                      <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Creating...</span>
                    </>
                  ) : (
                    <>
                      <Brain className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                      <span className="hidden sm:inline">Create Memory</span>
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
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-md p-3 mb-4">
                  <div className="flex items-center gap-2 text-purple-300 text-sm">
                    <Zap className="w-4 h-4" />
                    <span className="font-medium">Credit Cost:</span>
                  </div>
                  <div className="text-sm text-gray-300 mt-1">
                    {isMessageCountLoading ? (
                      <span className="text-yellow-300">Loading message count...</span>
                    ) : (
                      <>
                        <strong className="text-white">{getMemoryCostText(messageCount)}</strong>
                        <br />
                        <span className="text-xs text-gray-400 mt-1">
                          Based on {messageCount} message{messageCount !== 1 ? 's' : ''} in this conversation
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-gray-700 text-white hover:bg-gray-600">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={onConfirmCreateMemory}
                    className="bg-purple-600 text-white hover:bg-purple-700"
                  >
                    Create Memory
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleRightPanel}
            className="text-gray-400 hover:text-white hover:bg-gray-800 w-8 h-8 sm:w-10 sm:h-10"
            data-tutorial="right-panel-toggle"
          >
            <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default React.memo(ChatHeader);
