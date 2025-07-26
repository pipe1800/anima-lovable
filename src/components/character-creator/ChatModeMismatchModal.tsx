import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

interface ChatModeMismatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatMode: 'storytelling' | 'companion';
  characterMode: 'storytelling' | 'companion';
  onCreateNewChat: () => void;
  onChangeCharacterMode: () => void;
}

export function ChatModeMismatchModal({
  isOpen,
  onClose,
  chatMode,
  characterMode,
  onCreateNewChat,
  onChangeCharacterMode
}: ChatModeMismatchModalProps) {
  const getModeLabel = (mode: 'storytelling' | 'companion') => 
    mode === 'storytelling' ? 'Storytelling' : 'Companion';

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="bg-[#1a1a2e] border-gray-700/50 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Chat Mode Mismatch</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-gray-300">
            <p>The chat mode settings don't match:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">This chat was created in:</span>
                <Badge variant="outline" className="border-[#FF7A00]/50 text-[#FF7A00]">
                  {getModeLabel(chatMode)} Mode
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Character is currently set to:</span>
                <Badge variant="outline" className="border-blue-500/50 text-blue-400">
                  {getModeLabel(characterMode)} Mode
                </Badge>
              </div>
            </div>
            <p className="pt-2">What would you like to do?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-gray-600/50 hover:bg-gray-700/50 text-gray-300">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onChangeCharacterMode}
            className="bg-transparent border border-[#FF7A00]/50 hover:bg-[#FF7A00]/10 text-[#FF7A00]"
          >
            Change to {getModeLabel(chatMode)} Mode
          </AlertDialogAction>
          <AlertDialogAction 
            onClick={onCreateNewChat}
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
          >
            Create New Chat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
