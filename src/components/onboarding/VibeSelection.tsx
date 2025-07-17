
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Sparkles, Zap, Heart, Gamepad2, Skull, Coffee, Wand2, Sword, Mountain, 
  Drama, Laugh, Theater, Search, Clock, Rabbit, Bot, BookOpen, Code, 
  Dice6, BookMarked, User, Users, Eye, EyeOff 
} from 'lucide-react';

interface VibeSelectionProps {
  selectedVibes: string[];
  setSelectedVibes: (vibes: string[]) => void;
}

const VibeSelection = ({ selectedVibes, setSelectedVibes }: VibeSelectionProps) => {
  const vibes = [
    { id: 'action', name: 'Action', icon: Sword, color: 'from-red-500 to-orange-500' },
    { id: 'adventure', name: 'Adventure', icon: Mountain, color: 'from-green-500 to-teal-500' },
    { id: 'animals', name: 'Animals', icon: Rabbit, color: 'from-green-400 to-emerald-500' },
    { id: 'anime', name: 'Anime', icon: Sparkles, color: 'from-pink-500 to-rose-500' },
    { id: 'assistant', name: 'Assistant', icon: Bot, color: 'from-blue-400 to-indigo-500' },
    { id: 'comedy', name: 'Comedy', icon: Laugh, color: 'from-yellow-500 to-orange-500' },
    { id: 'drama', name: 'Drama', icon: Theater, color: 'from-purple-600 to-indigo-600' },
    { id: 'fantasy', name: 'Fantasy', icon: Wand2, color: 'from-purple-500 to-pink-500' },
    { id: 'female', name: 'Female', icon: User, color: 'from-pink-400 to-rose-500' },
    { id: 'furry', name: 'Furry', icon: Rabbit, color: 'from-orange-400 to-amber-500' },
    { id: 'games', name: 'Games', icon: Gamepad2, color: 'from-green-500 to-teal-500' },
    { id: 'historical', name: 'Historical', icon: BookOpen, color: 'from-amber-600 to-yellow-700' },
    { id: 'horror', name: 'Horror', icon: Skull, color: 'from-gray-700 to-red-900' },
    { id: 'male', name: 'Male', icon: User, color: 'from-blue-400 to-cyan-500' },
    { id: 'multiple-character', name: 'Multiple Character', icon: Users, color: 'from-violet-500 to-purple-600' },
    { id: 'mystery', name: 'Mystery', icon: Search, color: 'from-gray-600 to-gray-800' },
    { id: 'non-binary', name: 'Non-binary', icon: User, color: 'from-yellow-400 to-green-500' },
    { id: 'nsfw', name: 'NSFW', icon: EyeOff, color: 'from-red-500 to-pink-600' },
    { id: 'oc', name: 'OC', icon: Code, color: 'from-cyan-500 to-blue-600' },
    { id: 'romance', name: 'Romance', icon: Heart, color: 'from-red-500 to-pink-500' },
    { id: 'rpg', name: 'RPG', icon: Dice6, color: 'from-purple-500 to-violet-600' },
    { id: 'sci-fi', name: 'Sci-Fi', icon: Zap, color: 'from-blue-500 to-cyan-500' },
    { id: 'slice-of-life', name: 'Slice of Life', icon: Coffee, color: 'from-yellow-500 to-orange-500' },
    { id: 'storytelling', name: 'Storytelling', icon: BookMarked, color: 'from-indigo-500 to-purple-600' },
    { id: 'thriller', name: 'Thriller', icon: Clock, color: 'from-red-600 to-gray-800' }
  ];

  const toggleVibe = (vibeId: string) => {
    if (selectedVibes.includes(vibeId)) {
      setSelectedVibes(selectedVibes.filter(id => id !== vibeId));
    } else {
      setSelectedVibes([...selectedVibes, vibeId]);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto text-center px-2 sm:px-4">
      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
        Choose Your Vibe
      </h1>
      <p className="text-gray-400 text-base sm:text-lg mb-8 max-w-2xl mx-auto">
        What are you in the mood for? Pick a few tags so we can recommend the perfect companions.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2 md:gap-3 mb-8 max-h-[60vh] overflow-y-auto px-1">
        {vibes.map((vibe) => {
          const IconComponent = vibe.icon;
          const isSelected = selectedVibes.includes(vibe.id);
          
          return (
            <Card
              key={vibe.id}
              className={`relative cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                isSelected 
                  ? 'border-[#FF7A00] border-2 shadow-lg shadow-[#FF7A00]/25 bg-[#1a1a2e]' 
                  : 'border-gray-700 hover:border-gray-600 bg-[#1a1a2e]/80'
              }`}
              onClick={() => toggleVibe(vibe.id)}
            >
              <div className="p-2 sm:p-3 text-center">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 rounded-full bg-gradient-to-br ${vibe.color} flex items-center justify-center`}>
                  <IconComponent className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <h3 className="text-xs font-semibold text-white leading-tight">
                  {vibe.name}
                </h3>
                {isSelected && (
                  <div className="absolute top-1 right-1 w-4 h-4 sm:w-5 sm:h-5 bg-[#FF7A00] rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default VibeSelection;
