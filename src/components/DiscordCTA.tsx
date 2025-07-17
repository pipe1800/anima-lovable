
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle } from 'lucide-react';

const DiscordCTA = () => {
  const handleDiscordClick = () => {
    // Replace with actual Discord invite link
    window.open('https://discord.gg/your-server', '_blank');
  };

  return (
    <Card className="bg-gray-800 border-gray-700/50 w-full">
      <CardContent className="p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Left side - Content */}
          <div className="text-center md:text-left flex-1">
            <h3 className="text-2xl font-bold text-white mb-3">
              Join the Live Conversation
            </h3>
            <p className="text-gray-300 text-lg leading-relaxed max-w-2xl">
              Connect with other creators, share your best characters, and get real-time feedback on our official Discord server.
            </p>
          </div>
          
          {/* Right side - CTA Button */}
          <div className="flex-shrink-0">
            <Button
              onClick={handleDiscordClick}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white px-8 py-4 text-lg font-semibold h-auto min-w-[180px]"
            >
              <MessageCircle className="w-6 h-6 mr-3" />
              Join the Discord
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DiscordCTA;
