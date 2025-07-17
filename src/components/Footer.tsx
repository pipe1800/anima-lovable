import { MessageCircle, Users } from "lucide-react";
import DiscordCTA from "./DiscordCTA";

const Footer = () => {
  return (
    <footer className="bg-[#1b1b1b] py-6 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Discord CTA Section */}
        <div className="mb-8">
          <DiscordCTA />
        </div>
        
        {/* Existing Footer Content */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Left side - Copyright */}
          <div className="text-sm text-gray-400">
            © 2025 AI Character Chat. All Rights Reserved.
          </div>

          {/* Right side - Links and Social */}
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            {/* Legal Links */}
            <div className="flex gap-4 sm:gap-6">
              <a 
                href="#" 
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Privacy Policy
              </a>
              <a 
                href="#" 
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Terms of Use
              </a>
            </div>

            {/* Community Links */}
            <div className="flex gap-4">
              <a 
                href="#" 
                className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
                aria-label="Join our Discord community"
              >
                <MessageCircle size={20} />
                <span className="text-sm">Discord</span>
              </a>
              <a 
                href="#" 
                className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
                aria-label="Join our Reddit community"
              >
                <Users size={20} />
                <span className="text-sm">Subreddit</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
