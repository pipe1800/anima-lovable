import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Zap, CreditCard, Clock } from 'lucide-react';

interface InsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  onUpgrade: () => void;
}

export function InsufficientCreditsModal({ 
  isOpen, 
  onClose, 
  currentBalance, 
  onUpgrade 
}: InsufficientCreditsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a2e] border-gray-700 text-white max-w-md">
        <DialogHeader className="space-y-4">
          <DialogTitle className="text-xl font-bold text-center flex items-center justify-center gap-2">
            <Zap className="w-6 h-6 text-[#FF7A00]" />
            Insufficient Credits
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="text-center space-y-2">
            <p className="text-gray-300">
              You need credits to send messages. Your current balance is:
            </p>
            <div className="bg-[#121212] p-4 rounded-lg border border-gray-700">
              <div className="flex items-center justify-center gap-2">
                <Zap className="w-5 h-5 text-[#FF7A00]" />
                <span className="text-2xl font-bold text-white">
                  {currentBalance.toLocaleString()}
                </span>
                <span className="text-gray-400">credits</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-[#121212] rounded-lg border border-gray-700">
              <Clock className="w-5 h-5 text-[#FF7A00]" />
              <div>
                <p className="text-sm font-medium">Wait for Monthly Credits</p>
                <p className="text-xs text-gray-400">Guest Pass users get 1,000 credits monthly</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-[#121212] rounded-lg border border-gray-700">
              <CreditCard className="w-5 h-5 text-[#FF7A00]" />
              <div>
                <p className="text-sm font-medium">Upgrade Your Plan</p>
                <p className="text-xs text-gray-400">Get more credits and unlimited features</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Close
            </Button>
            <Button
              onClick={onUpgrade}
              className="flex-1 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
            >
              Upgrade Plan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}