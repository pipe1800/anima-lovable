import React from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function PublicNavigation() {
  return (
    <>
      {/* Logo */}
      <div className="flex-shrink-0">
        <img 
          src="/assets/logo.png" 
          alt="Anima AI Chat" 
          className="h-10 w-auto md:h-12"
        />
      </div>
      
      {/* Navigation Links */}
      <div className="flex items-center space-x-2 md:space-x-4">
        <Link to="/">
          <Button 
            variant="ghost" 
            size="sm"
            className="text-white hover:text-[#FF7A00] hover:bg-[#FF7A00]/10 font-medium"
          >
            Home
          </Button>
        </Link>
        <Link to="/characters">
          <Button 
            variant="ghost" 
            size="sm"
            className="text-[#FF7A00] hover:text-white hover:bg-[#FF7A00]/10 font-medium"
          >
            Characters
          </Button>
        </Link>
        <Link to="/auth">
          <Button 
            variant="outline" 
            size="sm"
            className="bg-transparent border-[#FF7A00] text-[#FF7A00] hover:bg-[#FF7A00] hover:text-white transition-colors"
          >
            Login
          </Button>
        </Link>
        <Link to="/auth?mode=signup">
          <Button 
            size="sm"
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-medium transition-colors"
          >
            Sign Up
          </Button>
        </Link>
      </div>
    </>
  );
}
