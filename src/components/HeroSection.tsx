import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
const HeroSection = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return <section className="min-h-screen bg-gradient-to-b from-[#121212] to-[#1a1a2e] text-white relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-gradient-radial from-[#FF7A00]/5 to-transparent opacity-50"></div>
      
      {/* Sticky Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-gray-700/50">
        <div className="flex items-center justify-between h-16 pl-4 pr-4 sm:pr-6 lg:pr-8">
          {/* Logo */}
          <div className="flex-shrink-0">
            <img 
              src="/assets/logo.png" 
              alt="Anima AI Chat" 
              className="h-10 w-auto"
            />
          </div>

          {/* Desktop Navigation Links */}
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
            <Link to="/auth">
              <Button variant="outline" className="bg-transparent border-[#FF7A00] text-[#FF7A00] hover:bg-[#FF7A00] hover:text-white transition-colors">
                Login
              </Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-medium transition-colors">
                Sign Up
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white hover:text-[#FF7A00] hover:bg-[#FF7A00]/10">
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && <div className="md:hidden border-t border-gray-700/50 bg-[#1a1a2e]/98 backdrop-blur-sm">
            <div className="px-6 py-6 space-y-4">
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
              
              <div className="border-t border-gray-700/30 my-4"></div>
              
              <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                <div className="flex items-center px-4 rounded-lg border border-[#FF7A00]/50 hover:bg-[#FF7A00]/10 transition-colors py-[9px] my-[20px]">
                  <span className="text-[#FF7A00] font-medium text-lg">Login</span>
                </div>
              </Link>
              
              <Link to="/auth?mode=signup" onClick={() => setMobileMenuOpen(false)}>
                <div className="flex items-center px-4 rounded-lg bg-[#FF7A00] hover:bg-[#FF7A00]/90 transition-colors py-[9px]">
                  <span className="text-white font-semibold text-lg">Sign Up</span>
                </div>
              </Link>
            </div>
          </div>}
      </nav>
      
      {/* Content */}
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-4rem)] pt-8 px-4 sm:px-6 mt-4">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-8 items-center">
          {/* Left Column - Video */}
          <div className="relative flex justify-center lg:justify-start">
            <div className="relative w-full max-w-2xl">
              {/* Glowing backdrop effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#FF7A00]/20 via-purple-500/10 to-blue-500/20 rounded-2xl blur-3xl"></div>
              
              {/* Video container with 4:3 aspect ratio to match 1,660 x 1,244 */}
              <div className="relative bg-gradient-to-br from-[#1a1a2e] to-[#121212] rounded-2xl border border-[#FF7A00]/20 overflow-hidden shadow-2xl" style={{
              aspectRatio: '1660/1244'
            }}>
                <video src="/assets/landing_video.mp4" className="w-full h-full object-cover" autoPlay muted loop playsInline preload="auto" />
                
                {/* Subtle overlay for theme integration */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#121212]/10 via-transparent to-[#FF7A00]/5 pointer-events-none"></div>
              </div>

              {/* Floating elements */}
              <div className="absolute -top-4 -left-4 w-8 h-8 bg-[#FF7A00]/20 rounded-full animate-pulse"></div>
              <div className="absolute -bottom-6 -right-6 w-6 h-6 bg-purple-500/20 rounded-full animate-pulse" style={{
              animationDelay: '1s'
            }}></div>
            </div>
          </div>

          {/* Right Column - Text Content */}
          <div className="text-center lg:text-left">
            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6 sm:mb-8 leading-tight">
              Your Waifu Awaits. <span className="text-[#FF7A00]">No Filters.</span> No Judgment.
            </h1>
            
            {/* Subheadline */}
            <p className="text-lg sm:text-xl lg:text-2xl text-gray-300 mb-8 sm:mb-12 max-w-3xl mx-auto lg:mx-0 leading-relaxed">
              Craft your perfect AI companion, explore your wildest fantasies, and dive into conversations that are truly uncensored. Your adventure starts now.
            </p>

            {/* CTA Button */}
            <Link to="/auth?mode=signup">
              <Button size="lg" className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold px-8 sm:px-12 py-4 sm:py-6 text-lg sm:text-xl rounded-lg shadow-2xl hover:shadow-[#FF7A00]/25 transition-all duration-300 transform hover:-translate-y-1 hover:scale-105 border-0 min-w-[200px] h-12 sm:h-auto min-h-[44px]" style={{
              boxShadow: '0 8px 25px rgba(255, 122, 0, 0.3), 0 4px 15px rgba(255, 122, 0, 0.2)'
            }}>
                Unleash My AI
              </Button>
            </Link>

            {/* Trust Indicators */}
            <p className="text-xs sm:text-sm text-gray-400 mt-4 sm:mt-6">
              ✓ Free to Start ✓ No Credit Card Required ✓ Join 100K+ Users
            </p>
          </div>
        </div>
      </div>
    </section>;
};
export default HeroSection;