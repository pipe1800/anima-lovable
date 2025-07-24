import React from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function PublicNavigation() {
  return (
    <>
      {/* Logo */}
      <div className="flex-shrink-0">
        <img 
          src="https://rclpyipeytqbamiwcuih.supabase.co/storage/v1/object/sign/images/45d0ba23-cfa2-404a-8527-54e83cb321ef.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9mYmU5OTM4My0yODYxLTQ0N2UtYThmOC1hY2JjNzU3YjQ0YzgiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJpbWFnZXMvNDVkMGJhMjMtY2ZhMi00MDRhLTg1MjctNTRlODNjYjMyMWVmLnBuZyIsImlhdCI6MTc1MjI1MjA4MywiZXhwIjo0OTA1ODUyMDgzfQ.OKhncau8pVPBvcnDrafnifJdihe285oi5jcpp1z3-iM"
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
