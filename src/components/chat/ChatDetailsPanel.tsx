import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircle, Edit, Brain, Heart, Star, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ChatDetailsPanelProps {
  loading: boolean;
  character: any;
  characterDetails: any;
  isCharacterOwner: boolean;
  onStartNewChat: () => void;
  isCreatingNewChat: boolean;
  onEditCharacter: () => void;
  showMemoriesButton: boolean;
  memoriesCount: number;
  onOpenMemories: () => void;
  isLiked: boolean;
  onLike: () => void;
  isFavorited: boolean;
  onFavorite: () => void;
}

const ChatDetailsPanel: React.FC<ChatDetailsPanelProps> = ({
  loading,
  character,
  characterDetails,
  isCharacterOwner,
  onStartNewChat,
  isCreatingNewChat,
  onEditCharacter,
  showMemoriesButton,
  memoriesCount,
  onOpenMemories,
  isLiked,
  onLike,
  isFavorited,
  onFavorite,
}) => {
  const navigate = useNavigate();

  if (loading) {
    return <div className="p-4 text-gray-400 text-center py-4">Loading character details...</div>;
  }

  // Safely extract definition fields
  const defs = characterDetails?.character_definitions || characterDetails?.definition?.[0] || null;
  const parseJson = (val: any) => {
    if (!val || typeof val !== 'string') return null;
    try { return JSON.parse(val); } catch { return null; }
  };

  // Short Summary
  let shortSummary: string | null = null;
  const personality = parseJson(defs?.personality_summary) || defs?.personality_summary;
  if (personality) {
    if (typeof personality === 'string') shortSummary = personality;
    else shortSummary = personality.title || personality.summary || personality.overview || null;
  }
  if (!shortSummary) shortSummary = characterDetails?.short_description || null;

  // Scenario
  let scenarioText: string | null = null;
  const scenario = parseJson(defs?.scenario) || defs?.scenario;
  if (scenario) {
    if (typeof scenario === 'string') scenarioText = scenario;
    else scenarioText = [scenario.title, scenario.description].filter(Boolean).join(': ');
  }

  // Greeting
  const greetingText: string | null = defs?.greeting || null;

  return (
    <div className="p-4 space-y-6">
      {/* Character Info */}
      <div>
        <h3 className="text-white font-semibold mb-3 text-sm sm:text-base">Character Info</h3>
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Avatar className="w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0">
              <AvatarImage src={character.avatar || characterDetails?.avatar_url} alt={character.name} className="object-cover" />
              <AvatarFallback className="bg-[#FF7A00] text-white font-bold text-sm sm:text-base">
                {character.fallback}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h4 className="text-white font-medium text-sm sm:text-base truncate">{character.name}</h4>
              <p className="text-gray-400 text-xs sm:text-sm line-clamp-2">{character.tagline}</p>
            </div>
          </div>
          {characterDetails?.tags && characterDetails.tags.length > 0 && (
            <div>
              <h4 className="text-white font-medium mb-2 text-sm">Tags</h4>
              <div className="flex flex-wrap gap-2">
                {characterDetails.tags.map((tagItem: any, index: number) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="bg-[#1a1a2e] text-gray-300 border border-gray-600/50 text-xs"
                  >
                    {tagItem.tag?.name || tagItem.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div>
            <h4 className="text-white font-medium mb-1 text-sm">Creator</h4>
            <p className="text-gray-400 text-xs sm:text-sm">
              @{characterDetails?.profiles?.username || characterDetails?.creator?.username || 'Unknown'}
            </p>
          </div>
        </div>
      </div>

      {/* Definition Details */}
      {(shortSummary || scenarioText || greetingText) && (
        <div>
          <h3 className="text-white font-semibold mb-3 text-sm sm:text-base">About</h3>
          <div className="space-y-3">
            {shortSummary && (
              <div>
                <h4 className="text-white font-medium text-xs sm:text-sm mb-1">Short Summary</h4>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{shortSummary}</p>
              </div>
            )}
            {scenarioText && (
              <div>
                <h4 className="text-white font-medium text-xs sm:text-sm mb-1">Scenario</h4>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{scenarioText}</p>
              </div>
            )}
            {greetingText && (
              <div>
                <h4 className="text-white font-medium text-xs sm:text-sm mb-1">Greeting</h4>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{greetingText}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div>
        <h3 className="text-white font-semibold mb-3 text-sm sm:text-base">Actions</h3>
        <div className="space-y-3">
          <Button
            onClick={onStartNewChat}
            disabled={isCreatingNewChat}
            className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white disabled:opacity-50 text-sm"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            {isCreatingNewChat ? 'Creating...' : 'Start New Chat'}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/characters/${character.id}`)}
            className="w-full bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-gray-300 text-sm"
          >
            <Eye className="w-4 h-4 mr-2" />
            View Public Profile
          </Button>
          {isCharacterOwner && (
            <Button
              onClick={onEditCharacter}
              variant="outline"
              className="w-full bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-gray-300 text-sm"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Character
            </Button>
          )}
          {/* Always show Memories button; disable when not enabled */}
          <Button
            data-tutorial="memories-button"
            onClick={onOpenMemories}
            variant="outline"
            disabled={!showMemoriesButton}
            className={`w-full border-[#FF7A00]/50 text-sm ${
              !showMemoriesButton
                ? 'text-gray-500 border-gray-600/50 cursor-not-allowed'
                : 'bg-transparent hover:bg-[#FF7A00]/10 hover:text-[#FF7A00] text-[#FF7A00] border-[#FF7A00]/30'
            }`}
            title={showMemoriesButton ? 'View memories' : 'Enable Enhanced Memory to view'}
          >
            <Brain className="w-4 h-4 mr-2" />
            View Memories ({memoriesCount})
          </Button>
          <div className="flex space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onLike}
              className={`flex-1 bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-xs sm:text-sm ${
                isLiked ? 'text-red-400 border-red-400' : 'text-gray-300'
              }`}
            >
              <Heart className={`w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 ${isLiked ? 'fill-current' : ''}`} />
              {isLiked ? 'Liked' : 'Like'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onFavorite}
              className={`flex-1 bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-xs sm:text-sm ${
                isFavorited ? 'text-yellow-400 border-yellow-400' : 'text-gray-300'
              }`}
            >
              <Star className={`w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 ${isFavorited ? 'fill-current' : ''}`} />
              {isFavorited ? 'Favorited' : 'Favorite'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChatDetailsPanel);
