import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X, Home, Users, LogIn, UserPlus, Shield, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PublicTopBarProps {
  className?: string;
  showAuthButtons?: boolean;
}

export function PublicTopBar({ className, showAuthButtons = true }: PublicTopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu when clicking outside or on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden'; // Prevent scrolling when menu is open
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  const handleMenuItemClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <>
      <nav className={cn(
        "sticky top-0 z-[70] w-full bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-gray-700/50",
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
              className="md:hidden text-white hover:bg-[#FF7A00]/10 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6 transition-transform duration-200" />
              ) : (
                <Menu className="h-6 w-6 transition-transform duration-200" />
              )}
            </Button>
          </div>
        </div>
      </nav>

      {/* Dark overlay below topbar covering entire viewport (nav sits above due to higher z) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm md:hidden animate-fadeIn"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile menu panel */}
      <div
        className={cn(
          "fixed top-16 left-0 right-0 z-[80] md:hidden bg-[#1a1a2e] backdrop-blur-md border-b border-gray-700/50 shadow-2xl transition-all duration-300 ease-out",
          mobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
        )}
        role="dialog"
        aria-label="Mobile navigation menu"
      >
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-6 py-6 space-y-1">
            {/* Navigation Links */}
            <div className="space-y-1" role="navigation" aria-label="Main navigation">
              <Link to="/" onClick={handleMenuItemClick}>
                <div className="group flex items-center gap-4 p-4 rounded-xl hover:bg-[#FF7A00]/8 active:bg-[#FF7A00]/12 transition-all duration-200 touch-manipulation">
                  <div className="flex-shrink-0 w-10 h-10 bg-[#FF7A00]/10 rounded-lg flex items-center justify-center group-hover:bg-[#FF7A00]/20 transition-colors">
                    <Home className="w-5 h-5 text-[#FF7A00]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-semibold text-lg group-hover:text-[#FF7A00] transition-colors">
                      Home
                    </div>
                    <div className="text-gray-400 text-sm">
                      Back to main page
                    </div>
                  </div>
                </div>
              </Link>
              
              <Link to="/characters" onClick={handleMenuItemClick}>
                <div className="group flex items-center gap-4 p-4 rounded-xl hover:bg-[#FF7A00]/8 active:bg-[#FF7A00]/12 transition-all duration-200 touch-manipulation">
                  <div className="flex-shrink-0 w-10 h-10 bg-gray-700/50 rounded-lg flex items-center justify-center group-hover:bg-[#FF7A00]/20 transition-colors">
                    <Users className="w-5 h-5 text-gray-300 group-hover:text-[#FF7A00] transition-colors" />
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-semibold text-lg group-hover:text-[#FF7A00] transition-colors">
                      Characters
                    </div>
                    <div className="text-gray-400 text-sm">
                      Explore AI companions
                    </div>
                  </div>
                </div>
              </Link>
            </div>
            
            {showAuthButtons && (
              <>
                {/* Separator */}
                <div className="my-6">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-700/40"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-[#1a1a2e] px-3 text-gray-500 font-medium">Authentication</span>
                    </div>
                  </div>
                </div>
                
                {/* Auth Buttons */}
                <div className="space-y-3" role="navigation" aria-label="Authentication">
                  <Link to="/auth" onClick={handleMenuItemClick} className="block">
                    <div className="group flex items-center gap-4 p-4 rounded-xl border border-[#FF7A00]/30 hover:border-[#FF7A00]/60 hover:bg-[#FF7A00]/5 active:bg-[#FF7A00]/10 transition-all duration-200 touch-manipulation">
                      <div className="flex-shrink-0 w-10 h-10 bg-[#FF7A00]/10 rounded-lg flex items-center justify-center group-hover:bg-[#FF7A00]/20 transition-colors">
                        <LogIn className="w-5 h-5 text-[#FF7A00]" />
                      </div>
                      <div className="flex-1">
                        <div className="text-[#FF7A00] font-semibold text-lg">
                          Login
                        </div>
                        <div className="text-gray-400 text-sm">
                          Access your account
                        </div>
                      </div>
                    </div>
                  </Link>
                  
                  <Link to="/auth?mode=signup" onClick={handleMenuItemClick} className="block">
                    <div className="group flex items-center gap-4 p-4 rounded-xl bg-[#FF7A00] hover:bg-[#FF7A00]/90 active:bg-[#FF7A00]/80 transition-all duration-200 shadow-lg touch-manipulation">
                      <div className="flex-shrink-0 w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                        <UserPlus className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-bold text-lg">
                          Sign Up
                        </div>
                        <div className="text-white/80 text-sm">
                          Create your account
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
                
                {/* Footer Links Section */}
                <div className="my-6">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-700/40"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-[#1a1a2e] px-3 text-gray-500 font-medium">Legal</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-1" role="navigation" aria-label="Legal links">
                  <Link to="/privacy" onClick={handleMenuItemClick}>
                    <div className="group flex items-center gap-4 p-3 rounded-lg hover:bg-gray-700/20 active:bg-gray-700/30 transition-all duration-200 touch-manipulation">
                      <div className="flex-shrink-0 w-8 h-8 bg-gray-700/30 rounded-lg flex items-center justify-center group-hover:bg-gray-700/50 transition-colors">
                        <Shield className="w-4 h-4 text-gray-400 group-hover:text-gray-300 transition-colors" />
                      </div>
                      <div className="flex-1">
                        <div className="text-gray-300 font-medium group-hover:text-white transition-colors">
                          Privacy Policy
                        </div>
                      </div>
                    </div>
                  </Link>
                  
                  <Link to="/terms" onClick={handleMenuItemClick}>
                    <div className="group flex items-center gap-4 p-3 rounded-lg hover:bg-gray-700/20 active:bg-gray-700/30 transition-all duration-200 touch-manipulation">
                      <div className="flex-shrink-0 w-8 h-8 bg-gray-700/30 rounded-lg flex items-center justify-center group-hover:bg-gray-700/50 transition-colors">
                        <FileText className="w-4 h-4 text-gray-400 group-hover:text-gray-300 transition-colors" />
                      </div>
                      <div className="flex-1">
                        <div className="text-gray-300 font-medium group-hover:text-white transition-colors">
                          Terms of Use
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              </>
            )}
          </div>
          <div className="h-4 bg-[#1a1a2e]"></div>
        </div>
      </div>
    </>
  );
}
