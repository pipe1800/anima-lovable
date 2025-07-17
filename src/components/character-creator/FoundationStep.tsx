import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, User, Sparkles, Loader2 } from 'lucide-react';
import { ImageCropper } from '@/components/ui/image-cropper';
import { uploadAvatar } from '@/lib/avatar-upload';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface FoundationStepProps {
  data: any;
  onUpdate: (data: any) => void;
  onNext: () => void;
  onFileChange?: (file: File) => Promise<void>;
  isParsingCard?: boolean;
}

const FoundationStep = ({ data, onUpdate, onNext, onFileChange, isParsingCard = false }: FoundationStepProps) => {
  const [formData, setFormData] = useState({
    name: data.name || '',
    avatar: data.avatar || '',
    title: data.title || '',
    description: data.description || ''
  });

  // Update form data when character data is loaded
  useEffect(() => {
    if (data) {
      setFormData({
        name: data.name || '',
        avatar: data.avatar || '',
        title: data.title || '',
        description: data.description || ''
      });
    }
  }, [data]);
  const [isUploading, setIsUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
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

    // Create temporary URL for cropping
    const imageUrl = URL.createObjectURL(file);
    setTempImageUrl(imageUrl);
    setShowCropper(true);
  };

  const handleCropComplete = async (croppedImageUrl: string) => {
    try {
      setIsUploading(true);
      setShowCropper(false);
      
      // Convert data URL to blob
      const response = await fetch(croppedImageUrl);
      const blob = await response.blob();
      
      // Create file from blob
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      
      const avatarUrl = await uploadAvatar(file, user!.id);
      
      if (avatarUrl) {
        handleInputChange('avatar', avatarUrl);
        toast({
          title: "Upload Successful",
          description: "Avatar uploaded and cropped successfully!",
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
      cleanupTempImage();
      resetFileInput();
    }
  };

  const handleCropCancel = () => {
    setShowCropper(false);
    cleanupTempImage();
    resetFileInput();
  };

  const cleanupTempImage = () => {
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
      setTempImageUrl('');
    }
  };

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleNext = () => {
    onUpdate(formData);
    onNext();
  };

  const isValid = formData.name.trim() && formData.description.trim();

  return (
    <div className="flex-1 overflow-auto bg-[#121212]">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Mobile: Stack vertically, Desktop: Side by side */}
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 lg:gap-12 min-h-[calc(100vh-200px)]">
          
          {/* Avatar Upload Section */}
          <div className="flex flex-col items-center justify-center space-y-4 md:space-y-6 order-1 lg:order-none">
            <div className="text-center mb-4 md:mb-8">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Avatar</h2>
              <p className="text-gray-400 text-sm md:text-base">Give your character a face</p>
            </div>

            {/* Avatar Display - Smaller on mobile */}
            <div className="relative group">
              <div className="w-32 h-32 md:w-48 md:h-48 lg:w-56 lg:h-56 rounded-full border-4 border-[#FF7A00]/30 bg-gradient-to-br from-[#FF7A00]/20 to-transparent backdrop-blur-sm flex items-center justify-center overflow-hidden">
                {formData.avatar ? (
                  <img 
                    src={formData.avatar} 
                    alt="Character Avatar" 
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-[#FF7A00]/60">
                    <User className="w-12 h-12 md:w-16 md:h-16 mb-2" />
                  </div>
                )}
              </div>
            </div>

            {/* File input (hidden) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Upload Buttons - Responsive width */}
            <div className="flex flex-col space-y-3 w-full max-w-xs">
              <Button 
                className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white font-semibold py-2.5 md:py-3 px-4 md:px-6 rounded-xl shadow-lg text-sm md:text-base"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 md:w-5 md:h-5 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                )}
                <span className="hidden sm:inline">{isUploading ? 'Processing...' : 'Upload & Crop Image'}</span>
                <span className="sm:hidden">{isUploading ? 'Processing...' : 'Upload Image'}</span>
              </Button>
              
              {/* PNG Character Card Upload */}
              <div className="space-y-2 md:space-y-3">
                <Label className="text-gray-300 text-xs md:text-sm font-medium">
                  Upload PNG Character Card
                </Label>
                
                {/* Hidden file input */}
                <input
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
                  ref={(input) => {
                    if (input) {
                      (window as any).characterCardInput = input;
                    }
                  }}
                />
                
                {/* Styled button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const input = (window as any).characterCardInput;
                    if (input) input.click();
                  }}
                  disabled={isParsingCard}
                  className="border-primary/50 text-primary hover:bg-primary/10 w-full text-xs md:text-sm py-2"
                >
                  <Upload className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                  Choose PNG File
                </Button>
                
                {isParsingCard && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Parsing character card...
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Core Details Section - Order first on mobile */}
          <div className="flex flex-col justify-center space-y-4 md:space-y-6 order-0 lg:order-none">
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
                  Short Description *
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

      {/* Image Cropper Modal */}
      {showCropper && (
        <ImageCropper
          imageUrl={tempImageUrl}
          isOpen={showCropper}
          onClose={handleCropCancel}
          onCrop={handleCropComplete}
        />
      )}
    </div>
  );
};

export default FoundationStep;
