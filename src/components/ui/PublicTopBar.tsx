import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PublicTopBarProps {
  className?: string;
  showAuthButtons?: boolean;
}

export function PublicTopBar({ className, showAuthButtons = true }: PublicTopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className={cn(
      "sticky top-0 z-50 w-full bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-gray-700/50",
      className
    )}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <img 
              src="/assets/logo.png" 
              alt="Anima AI Chat" 
              className="h-16 w-auto"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            <Link to="/">
              <Button variant="ghost" className="text-[#FF7A00] hover:text-white hover:bg-[#FF7A00]/10 font-medium">
                Home
              </Button>
            </Link>
            <Link to="/characters">
              <Button variant="ghost" className="text-white hover:text-[#FF7A00] hover:bg-[#FF7A00]/10">
                Characters
              </Button>
            </Link>
            
            {showAuthButtons && (
              <>
                <Link to="/auth">
                  <Button variant="outline" className="bg-transparent border-[#FF7A00] text-[#FF7A00] hover:bg-[#FF7A00] hover:text-white transition-colors">
                    Login
                  </Button>
                </Link>
                <Link to="/auth?mode=signup">
                  <Button className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white">
                    Sign Up
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#1a1a2e] border-t border-gray-700/50">
          <div className="px-4 py-4 space-y-2">
            <Link to="/" onClick={() => setMobileMenuOpen(false)}>
              <div className="flex items-center py-3 px-4 rounded-lg hover:bg-[#FF7A00]/10 transition-colors">
                <span className="text-[#FF7A00] font-medium text-lg">Home</span>
              </div>
            </Link>
            
            <Link to="/characters" onClick={() => setMobileMenuOpen(false)}>
              <div className="flex items-center py-3 px-4 rounded-lg hover:bg-[#FF7A00]/10 transition-colors">
                <span className="text-white font-medium text-lg">Characters</span>
              </div>
            </Link>
            
            {showAuthButtons && (
              <>
                <div className="border-t border-gray-700/30 my-4"></div>
                
                <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                  <div className="flex items-center px-4 rounded-lg border border-[#FF7A00]/50 hover:bg-[#FF7A00]/10 transition-colors py-[9px]">
                    <span className="text-[#FF7A00] font-medium text-lg">Login</span>
                  </div>
                </Link>
                
                <Link to="/auth?mode=signup" onClick={() => setMobileMenuOpen(false)}>
                  <div className="flex items-center px-4 rounded-lg bg-[#FF7A00] hover:bg-[#FF7A00]/90 transition-colors py-[9px]">
                    <span className="text-white font-semibold text-lg">Sign Up</span>
                  </div>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
