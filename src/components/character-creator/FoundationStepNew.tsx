import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Upload, User, Sparkles, Loader2, Camera, Image as ImageIcon } from 'lucide-react';
import { ImageCropper } from '@/components/ui/image-cropper';
import { uploadAvatar } from '@/lib/avatar-upload';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CharacterChatModeToggle } from './CharacterChatModeToggle';
import { cn } from '@/lib/utils';

interface FoundationStepProps {
  data: any;
  onUpdate: (data: any) => void;
  onNext: () => void;
  onFileChange?: (file: File) => void;
  isParsingCard?: boolean;
}

export default function FoundationStep({ 
  data, 
  onUpdate, 
  onNext, 
  onFileChange, 
  isParsingCard = false 
}: FoundationStepProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pngInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleInputChange = useCallback((field: string, value: string) => {
    onUpdate({ [field]: value });
  }, [onUpdate]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    const url = URL.createObjectURL(file);
    setTempImageUrl(url);
    setShowCropper(true);
  };

  const handleCropComplete = async (croppedImageUrl: string) => {
    setShowCropper(false);
    setIsUploading(true);

    try {
      const response = await fetch(croppedImageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      
      const avatarUrl = await uploadAvatar(file, user!.id);
      
      if (avatarUrl) {
        handleInputChange('avatar', avatarUrl);
        toast({
          title: "Success",
          description: "Avatar uploaded successfully!",
        });
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
      if (tempImageUrl) {
        URL.revokeObjectURL(tempImageUrl);
        setTempImageUrl('');
      }
    }
  };

  const isValid = data.name?.trim() && data.description?.trim();

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="space-y-6 md:space-y-8">
        {/* Avatar Section */}
        <Card className="bg-[#1a1a2e] border-gray-700/50 p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-center md:items-start space-y-6 md:space-y-0 md:space-x-8">
            {/* Avatar Preview */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative group">
                <div className={cn(
                  "w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden",
                  "border-4 border-[#FF7A00]/30 bg-gradient-to-br from-[#FF7A00]/20 to-transparent",
                  "flex items-center justify-center"
                )}>
                  {data.avatar ? (
                    <img 
                      src={data.avatar} 
                      alt="Character Avatar" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-16 h-16 md:w-20 md:h-20 text-[#FF7A00]/60" />
                  )}
                </div>
                
                {/* Upload overlay */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={cn(
                    "absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100",
                    "flex items-center justify-center transition-opacity cursor-pointer"
                  )}
                >
                  <Camera className="w-8 h-8 text-white" />
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                variant="outline"
                className="border-[#FF7A00]/50 text-[#FF7A00] hover:bg-[#FF7A00]/10"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Upload Avatar
              </Button>
            </div>

            {/* Character Details */}
            <div className="flex-1 w-full space-y-4">
              <div>
                <Label htmlFor="name" className="text-white text-base font-medium">
                  Character Name *
                </Label>
                <Input
                  id="name"
                  value={data.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Enter character name"
                  className={cn(
                    "mt-2 bg-gray-800/50 border-gray-600 text-white",
                    "placeholder-gray-400 h-12 text-lg font-medium"
                  )}
                />
              </div>

              <div>
                <Label htmlFor="title" className="text-white text-base font-medium">
                  Title/Tagline
                </Label>
                <Input
                  id="title"
                  value={data.title || ''}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="e.g., Digital Companion, Story Guide..."
                  className="mt-2 bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label htmlFor="description" className="text-white text-base font-medium">
                    Short Description *
                  </Label>
                  <span className="text-xs text-gray-400">
                    {(data.description || '').length}/150
                  </span>
                </div>
                <Textarea
                  id="description"
                  value={data.description || ''}
                  onChange={(e) => {
                    if (e.target.value.length <= 150) {
                      handleInputChange('description', e.target.value);
                    }
                  }}
                  placeholder="A brief summary for the discovery page..."
                  rows={3}
                  className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Chat Mode */}
        <Card className="bg-[#1a1a2e] border-gray-700/50 p-6">
          <CharacterChatModeToggle
            chatMode={data.chatMode || 'storytelling'}
            onChange={(mode) => handleInputChange('chatMode', mode)}
            showWarning={true}
          />
        </Card>

        {/* PNG Import */}
        <Card className="bg-[#1a1a2e] border-gray-700/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium mb-1">Import Character Card</h3>
              <p className="text-gray-400 text-sm">Import character data from a PNG file</p>
            </div>
            
            <input
              ref={pngInputRef}
              type="file"
              accept=".png"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onFileChange) {
                  onFileChange(file);
                }
              }}
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
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4 mr-2" />
              )}
              Import PNG
            </Button>
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex justify-end">
          <Button
            onClick={onNext}
            disabled={!isValid}
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white px-8 py-3 text-lg font-semibold"
          >
            Next: Personality
            <Sparkles className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>

      {/* Image Cropper Modal */}
      {showCropper && (
        <ImageCropper
          imageUrl={tempImageUrl}
          isOpen={showCropper}
          onClose={() => {
            setShowCropper(false);
            URL.revokeObjectURL(tempImageUrl);
            setTempImageUrl('');
          }}
          onCrop={handleCropComplete}
        />
      )}
    </div>
  );
}
