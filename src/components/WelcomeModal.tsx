import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

const WelcomeModal = ({ isOpen, onClose, username }: WelcomeModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-4xl w-full h-screen max-h-screen bg-[#121212] border-none p-0 overflow-hidden"
      >
        {/* Single close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 z-10 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Main content */}
        <div className="relative h-full flex items-center justify-center">
          {/* Animated background elements */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF7A00]/10 via-transparent to-[#1a1a2e]/30"></div>
            {/* Neural network animation */}
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-[#FF7A00] rounded-full opacity-40 animate-pulse"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${2 + Math.random() * 2}s`
                }}
              />
            ))}
          </div>

          {/* Content */}
          <div className="relative z-10 text-center max-w-2xl mx-auto px-8">
            {/* Headline */}
            <h1 className="text-6xl md:text-7xl font-bold text-white mb-6 leading-tight">
              Welcome to the{' '}
              <span className="text-transparent bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/70 bg-clip-text">
                Simulation
              </span>
            </h1>
            
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-8">
              {username}
            </h2>

            {/* Supporting text */}
            <p className="text-xl text-gray-300 mb-12 leading-relaxed max-w-xl mx-auto">
              Your journey begins now. Personalize your experience and meet your first AI companion.
            </p>
          </div>

          {/* Glitch effect overlay */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="absolute bg-[#FF7A00] h-px"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  width: `${Math.random() * 200 + 100}px`,
                  animation: `glitch ${1 + Math.random() * 2}s infinite`,
                  animationDelay: `${Math.random() * 3}s`
                }}
              />
            ))}
          </div>
        </div>

        <style>{`
          @keyframes glitch {
            0%, 100% { 
              transform: translateX(0) scaleX(1); 
              opacity: 0.1; 
            }
            25% { 
              transform: translateX(-10px) scaleX(1.2); 
              opacity: 0.6; 
            }
            50% { 
              transform: translateX(10px) scaleX(0.8); 
              opacity: 0.3; 
            }
            75% { 
              transform: translateX(-5px) scaleX(1.1); 
              opacity: 0.8; 
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeModal;
