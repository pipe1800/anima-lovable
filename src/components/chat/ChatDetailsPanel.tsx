import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircle, Edit, Brain, Heart, Star, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';

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

  // Read more toggles
  const [expandSummary, setExpandSummary] = useState(false);
  const [expandScenario, setExpandScenario] = useState(false);
  const [expandGreeting, setExpandGreeting] = useState(false);
  const shouldClamp = (text?: string | null, limit = 240) => !!text && text.length > limit;

  return (
    <div className="p-4 space-y-6">
      {/* Character Header Card */}
      <div className="relative overflow-hidden rounded-xl border border-gray-700/50 bg-gradient-to-br from-[#141414] via-[#101018] to-[#0b0b10]">
        <div className="p-4 sm:p-5 flex items-start gap-3">
          <Avatar className="w-14 h-14 sm:w-16 sm:h-16 ring-1 ring-gray-700/60">
            <AvatarImage src={character.avatar || characterDetails?.avatar_url} alt={character.name} className="object-cover" />
            <AvatarFallback className="bg-[#FF7A00] text-white font-bold">
              {character.fallback}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-white font-semibold text-base sm:text-lg truncate max-w-full" title={character.name}>{character.name}</h2>
                <p className="text-gray-300/90 text-xs sm:text-sm line-clamp-2">
                  {character.tagline}
                </p>
              </div>
              <div className="hidden sm:flex gap-2">
                <Badge className="bg-[#1a1a2e] text-gray-200 border border-gray-700/50">Chat</Badge>
                <Badge variant="secondary" className="bg-gray-800/70 text-gray-300 border border-gray-700/50">Details</Badge>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/20 border border-gray-800/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Active
              </span>
              {characterDetails?.creator && (
                <span className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-black/20 border border-gray-800/60">
                  <span className="text-gray-500">by</span> @{characterDetails.creator.username}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#FF7A00]/10 blur-2xl" />
      </div>

      {/* Tags */}
      {characterDetails?.tags && characterDetails.tags.length > 0 && (
        <div>
          <h3 className="text-white font-semibold mb-2 text-sm">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {characterDetails.tags.map((tagItem: any, index: number) => (
              <span
                key={index}
                className="px-2.5 py-1 rounded-md text-xs bg-[#11111a] text-gray-200 border border-gray-700/60 hover:border-gray-600/60 transition-colors"
              >
                {tagItem.tag?.name || tagItem.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* About Section */}
      {(shortSummary || scenarioText || greetingText) && (
        <div className="rounded-xl border border-gray-700/50 bg-[#0f0f12] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm sm:text-base">About</h3>
          </div>
          <div className="p-4 space-y-4">
            {shortSummary && (
              <div className="rounded-lg border border-gray-700/50 bg-[#0b0b10] p-3">
                <h4 className="text-white/90 font-medium text-xs sm:text-sm mb-1">Short Summary</h4>
                <p className={`text-gray-300 text-sm leading-relaxed whitespace-pre-wrap ${!expandSummary && shouldClamp(shortSummary, 280) ? 'line-clamp-4' : ''}`}>
                  {shortSummary}
                </p>
                {shouldClamp(shortSummary, 280) && (
                  <button
                    type="button"
                    onClick={() => setExpandSummary((v) => !v)}
                    className="mt-1 text-xs text-[#FF7A00] hover:underline"
                  >
                    {expandSummary ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
            {scenarioText && (
              <div className="rounded-lg border border-gray-700/50 bg-[#0b0b10] p-3">
                <h4 className="text-white/90 font-medium text-xs sm:text-sm mb-1">Scenario</h4>
                <p className={`text-gray-300 text-sm leading-relaxed whitespace-pre-wrap ${!expandScenario && shouldClamp(scenarioText, 280) ? 'line-clamp-4' : ''}`}>
                  {scenarioText}
                </p>
                {shouldClamp(scenarioText, 280) && (
                  <button
                    type="button"
                    onClick={() => setExpandScenario((v) => !v)}
                    className="mt-1 text-xs text-[#FF7A00] hover:underline"
                  >
                    {expandScenario ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
            {greetingText && (
              <div className="rounded-lg border border-gray-700/50 bg-[#0b0b10] p-3">
                <h4 className="text-white/90 font-medium text-xs sm:text-sm mb-1">Greeting</h4>
                <p className={`text-gray-300 text-sm leading-relaxed whitespace-pre-wrap ${!expandGreeting && shouldClamp(greetingText, 200) ? 'line-clamp-4' : ''}`}>
                  {greetingText}
                </p>
                {shouldClamp(greetingText, 200) && (
                  <button
                    type="button"
                    onClick={() => setExpandGreeting((v) => !v)}
                    className="mt-1 text-xs text-[#FF7A00] hover:underline"
                  >
                    {expandGreeting ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="rounded-xl border border-gray-700/50 bg-[#0f0f12] overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700/50">
          <h3 className="text-white font-semibold text-sm sm:text-base">Actions</h3>
        </div>
        <div className="p-4 space-y-3">
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
