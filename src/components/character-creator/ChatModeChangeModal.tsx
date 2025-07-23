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
import { Info } from 'lucide-react';

interface ChatModeChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  newMode: 'storytelling' | 'companion';
  onConfirm: () => void;
}

export function ChatModeChangeModal({
  isOpen,
  onClose,
  newMode,
  onConfirm
}: ChatModeChangeModalProps) {
  const getModeLabel = (mode: 'storytelling' | 'companion') => 
    mode === 'storytelling' ? 'Storytelling' : 'Companion';

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="bg-[#1a1a2e] border-gray-700/50 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Change Chat Mode?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-gray-300">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 text-blue-500" />
              <div className="space-y-2">
                <p>
                  Changing to <strong className="text-[#FF7A00]">{getModeLabel(newMode)} Mode</strong> requires creating a new chat 
                  for the changes to take effect.
                </p>
                <p className="text-sm text-gray-400">
                  Don't worry, you can always revert this change and come back to this chat.
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-gray-600/50 hover:bg-gray-700/50 text-gray-300">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white"
          >
            Create New Chat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
