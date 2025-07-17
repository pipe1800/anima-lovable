import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, BookOpen, Users, Zap } from 'lucide-react';

interface TutorialWelcomeModalProps {
  isOpen: boolean;
  onStart: () => void;
  onSkip: () => void;
}

export const TutorialWelcomeModal: React.FC<TutorialWelcomeModalProps> = ({
  isOpen,
  onStart,
  onSkip
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="bg-[#1a1a2e] border-[#FF7A00] border-2 max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-[#FF7A00] rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <DialogTitle className="text-white text-2xl font-bold">
            Welcome to Anima!
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-gray-300 text-center">
            Let's take a quick tour of the basic features to help you get started with your AI chat experience.
          </p>

          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-3 bg-[#0f0f0f] rounded-lg">
              <Zap className="w-5 h-5 text-[#FF7A00]" />
              <div>
                <h4 className="text-white font-medium text-sm">Addons System</h4>
                <p className="text-gray-400 text-xs">Enhance your chats with powerful extensions</p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-[#0f0f0f] rounded-lg">
              <BookOpen className="w-5 h-5 text-[#FF7A00]" />
              <div>
                <h4 className="text-white font-medium text-sm">World Info</h4>
                <p className="text-gray-400 text-xs">Add rich context to your conversations</p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-[#0f0f0f] rounded-lg">
              <Users className="w-5 h-5 text-[#FF7A00]" />
              <div>
                <h4 className="text-white font-medium text-sm">Discovery</h4>
                <p className="text-gray-400 text-xs">Find amazing characters and content</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <Button
              variant="ghost"
              onClick={onSkip}
              className="text-gray-400 hover:text-white"
            >
              Skip for now
            </Button>

            <Button
              onClick={onStart}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white px-6"
            >
              Start Tour
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};