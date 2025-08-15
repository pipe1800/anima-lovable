import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Upload, User, Loader2, Clock, MessageSquare, Image as ImageIcon } from 'lucide-react';
import { uploadAvatar } from '@/lib/avatar-upload';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { CharacterFormData } from '@/hooks/useCharacterCreation';

interface FoundationStepProps {
  data: CharacterFormData;
  onUpdate: (data: Partial<CharacterFormData>) => void;
  onNext: () => void;
  onFileChange?: (file: File) => Promise<void>;
  isParsingCard?: boolean;
  nsfwDetected?: boolean;
  nsfwWarnings?: string[];
}

const FoundationStep = ({ data, onUpdate, onNext, onFileChange, isParsingCard = false, nsfwDetected = false, nsfwWarnings = [] }: FoundationStepProps) => {
  const [formData, setFormData] = useState({
    name: data.name || '',
    avatar: data.avatar || '',
    title: data.title || '',
    description: data.description || '',
    chatMode: (data.chatMode as 'storytelling' | 'companion') || 'storytelling',
    timeAwarenessEnabled: data.timeAwarenessEnabled || false
  });

  // Update form data when character data is loaded
  useEffect(() => {
    if (data) {
      setFormData({
        name: data.name || '',
        avatar: data.avatar || '',
        title: data.title || '',
        description: data.description || '',
        chatMode: (data.chatMode as 'storytelling' | 'companion') || 'storytelling',
        timeAwarenessEnabled: data.timeAwarenessEnabled || false
      });
    }
  }, [data]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pngInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string | boolean) => {
    // Update local state
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Update parent without trimming; validation trims where needed
    onUpdate({ [field]: value } as Partial<CharacterFormData>);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploading(true);
      
      // Upload directly without cropping
      const avatarUrl = await uploadAvatar(file, user.id);
      
      if (avatarUrl) {
        handleInputChange('avatar', avatarUrl);
        toast({
          title: "Upload Successful",
          description: "Avatar uploaded successfully!",
        });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      resetFileInput();
    }
  };

  const handlePNGUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // If it's a PNG character card, handle it via parent only to avoid duplication
    if (file.type === 'image/png' && onFileChange) {
      try {
        await onFileChange(file);
      } finally {
        resetFileInput();
      }
    }
  };

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (pngInputRef.current) {
      pngInputRef.current.value = '';
    }
  };

  const handleNext = () => {
    // Don't update again here - the data is already synced via handleInputChange
    // Just validate and proceed
    if (formData.name.trim() && formData.description.trim()) {
      onNext();
    }
  };

  const isValid = formData.name.trim() && formData.description.trim();

  return (
    <div className="flex-1 overflow-auto bg-[#121212]">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
        {/* NSFW warning banner */}
        {nsfwDetected && (
          <Alert className="mb-4 bg-red-500/10 border-red-500/30">
            <AlertDescription className="text-red-300 text-sm">
              This character may contain NSFW content. {nsfwWarnings?.length ? `(${nsfwWarnings.join(' ')})` : ''}
            </AlertDescription>
          </Alert>
        )}
        {/* Mobile: Stack vertically, Desktop: Side by side */}
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 lg:gap-12 min-h-[calc(100vh-200px)]">
          
          {/* Avatar Upload Section (moved to first on mobile by order-0) */}
          <div className="flex flex-col items-center space-y-4 md:space-y-6 order-0 lg:order-none">
            <div className="text-center mb-4 md:mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Avatar</h2>
              <p className="text-gray-400 text-sm md:text-base">Give your character a face</p>
            </div>

            {/* Avatar Display - Matching character card dimensions (4:5 aspect ratio) */}
            <div className="relative group">
              <div className={cn(
                "relative overflow-hidden rounded-2xl border-4 border-[#FF7A00]/30",
                "bg-gradient-to-br from-[#FF7A00]/20 to-transparent backdrop-blur-sm",
                "w-48 h-60 md:w-64 md:h-80", // 4:5 aspect ratio matching character cards
                "flex items-center justify-center"
              )}>
                {formData.avatar ? (
                  <img 
                    src={formData.avatar} 
                    alt="Character Avatar" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-[#FF7A00]/60">
                    <User className="w-20 h-20 mb-2" />
                    <span className="text-sm text-gray-400">No avatar</span>
                  </div>
                )}
                
                {/* Upload overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    variant="outline"
                    className="border-[#FF7A00]/50 text-white hover:bg-[#FF7A00]/20"
                  >
                    Change Avatar
                  </Button>
                </div>
              </div>
            </div>

            {/* File input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Upload Buttons */}
            <div className="flex flex-col space-y-3 w-full max-w-xs">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                variant="outline"
                className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Avatar
                  </>
                )}
              </Button>
              
              {/* PNG Character Card Upload */}
              <input
                ref={pngInputRef}
                type="file"
                accept=".png"
                onChange={handlePNGUpload}
                disabled={isParsingCard}
                className="hidden"
              />
              
              <Button
                onClick={() => pngInputRef.current?.click()}
                disabled={isParsingCard}
                variant="outline"
                size="sm"
                className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10"
              >
                {isParsingCard ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Parsing character card...
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Import PNG Character Card
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Core Details Section - now second on mobile (order-1) */}
          <div className="flex flex-col justify-center space-y-4 md:space-y-6 order-1 lg:order-none">
            <div className="mb-4 md:mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Core Details</h2>
              <p className="text-gray-400 text-sm md:text-base">Define your character's identity</p>
            </div>

            {/* Character Name */}
            <div className="space-y-2">
              <Label htmlFor="character-name" className="text-white font-medium text-sm md:text-base">
                Name *
              </Label>
              <Input
                id="character-name"
                placeholder="Character's Handle"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 rounded-lg h-10 md:h-12 text-base md:text-lg font-medium"
              />
            </div>

            {/* Title/Tagline */}
            <div className="space-y-2">
              <Label htmlFor="character-title" className="text-white font-medium text-sm md:text-base">
                Title/Tagline
              </Label>
              <Input
                id="character-title"
                placeholder="e.g., Rogue Netrunner..."
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 rounded-lg h-10 md:h-11 text-sm md:text-base"
              />
            </div>

            {/* Short Description */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="character-description" className="text-white font-medium text-sm md:text-base">
                  Short Description
                </Label>
                <span className="text-xs text-gray-400">
                  {formData.description.length}/150
                </span>
              </div>
              <Textarea
                id="character-description"
                placeholder="A brief summary of your character for the discovery page."
                value={formData.description}
                onChange={(e) => {
                  if (e.target.value.length <= 150) {
                    handleInputChange('description', e.target.value);
                  }
                }}
                rows={3}
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 rounded-lg resize-none text-sm md:text-base"
              />
                            <p className="text-xs text-gray-500">
                This is what other users will see at a glance in the discovery page.
              </p>
            </div>

            {/* Time Awareness Toggle - Unified Design */}
            <div className="space-y-4 bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-[#FF7A00]" />
                  <Label htmlFor="time-awareness" className="text-base text-white cursor-pointer">
                    Time Awareness
                  </Label>
                </div>
                <Switch
                  id="time-awareness"
                  checked={formData.timeAwarenessEnabled}
                  onCheckedChange={(checked) => handleInputChange('timeAwarenessEnabled', checked)}
                  className="data-[state=checked]:bg-[#FF7A00]"
                />
              </div>
              
              {formData.timeAwarenessEnabled && (
                <Alert className="bg-blue-500/10 border-blue-500/30">
                  <AlertDescription className="text-sm">
                    Time awareness works best in <strong>Companion Mode</strong>. The character will react to how long you take to respond based on their personality.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Chat Style Toggle - Unified Design */}
            <div className="space-y-4 bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="w-5 h-5 text-[#FF7A00]" />
                  <Label htmlFor="chat-mode" className="text-base text-white cursor-pointer">
                    Chat Style
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={cn(
                    "text-sm transition-colors",
                    formData.chatMode === 'storytelling' ? 'text-[#FF7A00] font-medium' : 'text-gray-400'
                  )}>
                    Storytelling
                  </span>
                  <Switch
                    id="chat-mode"
                    checked={formData.chatMode === 'companion'}
                    onCheckedChange={(checked) => handleInputChange('chatMode', checked ? 'companion' : 'storytelling')}
                    className="data-[state=checked]:bg-[#FF7A00]"
                  />
                  <span className={cn(
                    "text-sm transition-colors",
                    formData.chatMode === 'companion' ? 'text-[#FF7A00] font-medium' : 'text-gray-400'
                  )}>
                    Companion
                  </span>
                </div>
              </div>
              
              <div className="text-sm text-gray-400 space-y-1">
                <p><strong>Storytelling:</strong> Rich descriptions, actions, and narrative elements</p>
                <p><strong>Companion:</strong> Pure dialogue-focused conversations, like texting</p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation - Responsive positioning */}
        <div className="flex justify-end mt-6 md:mt-8 pt-4 md:pt-6 border-t border-gray-700/50">
          <Button
            onClick={handleNext}
            disabled={!isValid}
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white px-6 md:px-8 py-2.5 md:py-3 text-base md:text-lg font-semibold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            <span className="hidden sm:inline">Next: Personality →</span>
            <span className="sm:hidden">Next →</span>
          </Button>
        </div>
      </div>

    </div>
  );
};

export default FoundationStep;
