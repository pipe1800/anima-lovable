import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Camera, Image, X, Plus, Globe, Link, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Tag = Tables<'tags'>;

interface WorldInfoBasicFormProps {
  formData: {
    name: string;
    short_description: string;
    avatar_url?: string;
    visibility: 'public' | 'unlisted' | 'private';
  };
  onUpdate: (updates: any) => void;
  onAvatarUpload: (file: File) => void;
  availableTags: Tag[];
  selectedTags: Tag[];
  onAddTag: (tagId: number) => void;
  onRemoveTag: (tagId: number) => void;
}

export default function WorldInfoBasicForm({
  formData,
  onUpdate,
  onAvatarUpload,
  availableTags,
  selectedTags,
  onAddTag,
  onRemoveTag
}: WorldInfoBasicFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    // Create preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    // Upload file
    onAvatarUpload(file);
  };

  const availableTagsFiltered = availableTags.filter(
    tag => !selectedTags.some(selected => selected.id === tag.id)
  );

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'public': return <Globe className="w-4 h-4" />;
      case 'unlisted': return <Link className="w-4 h-4" />;
      case 'private': return <Lock className="w-4 h-4" />;
      default: return <Lock className="w-4 h-4" />;
    }
  };

  const getVisibilityDescription = (visibility: string) => {
    switch (visibility) {
      case 'public': return 'Anyone can discover and use this world info';
      case 'unlisted': return 'Only people with the link can access this world info';
      case 'private': return 'Only you can use this world info';
      default: return 'Only you can use this world info';
    }
  };

  return (
    <Card className="bg-[#1a1a2e] border-gray-700/50">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          World Info Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar Section */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="relative group">
            <Avatar className="w-24 h-24 sm:w-32 sm:h-32 border-4 border-gray-700">
              <AvatarImage 
                src={previewUrl || formData.avatar_url} 
                alt={formData.name}
              />
              <AvatarFallback className="bg-gradient-to-br from-[#FF7A00]/20 to-transparent">
                <BookOpen className="w-8 h-8 sm:w-10 sm:h-10 text-[#FF7A00]/60" />
              </AvatarFallback>
            </Avatar>
            
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100",
                "flex items-center justify-center transition-opacity cursor-pointer"
              )}
            >
              <Camera className="w-8 h-8 text-white" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="flex-1 w-full space-y-4">
            <div>
              <Label htmlFor="name" className="text-white">
                Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="Enter world info name"
                className="mt-1 bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
              />
            </div>

            <div>
              <Label htmlFor="visibility" className="text-white">
                Visibility
              </Label>
              <Select 
                value={formData.visibility} 
                onValueChange={(value: 'public' | 'unlisted' | 'private') => 
                  onUpdate({ visibility: value })
                }
              >
                <SelectTrigger className="mt-1 bg-gray-800/50 border-gray-600 text-white">
                  <div className="flex items-center gap-2">
                    {getVisibilityIcon(formData.visibility)}
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="private" className="text-white hover:bg-gray-700">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      <span>Private</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="unlisted" className="text-white hover:bg-gray-700">
                    <div className="flex items-center gap-2">
                      <Link className="w-4 h-4" />
                      <span>Unlisted</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="public" className="text-white hover:bg-gray-700">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      <span>Public</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {getVisibilityDescription(formData.visibility)}
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <Label htmlFor="description" className="text-white">
              Description
            </Label>
            <span className="text-xs text-gray-400">
              {formData.short_description.length}/500
            </span>
          </div>
          <Textarea
            id="description"
            value={formData.short_description}
            onChange={(e) => {
              if (e.target.value.length <= 500) {
                onUpdate({ short_description: e.target.value });
              }
            }}
            placeholder="Describe your world info..."
            rows={4}
            className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400"
          />
        </div>

        {/* Tags */}
        <div>
          <Label className="text-white mb-2 block">Tags</Label>
          
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedTags.map(tag => (
                <Badge
                  key={tag.id}
                  className="bg-[#FF7A00]/20 text-[#FF7A00] border border-[#FF7A00]/30 pl-3 pr-1 py-1"
                >
                  {tag.name}
                  <button
                    onClick={() => onRemoveTag(tag.id)}
                    className="ml-2 hover:bg-[#FF7A00]/20 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {availableTagsFiltered.length > 0 && (
            <Select onValueChange={(value) => onAddTag(parseInt(value))}>
              <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white">
                <SelectValue placeholder="Add a tag..." />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {availableTagsFiltered.map(tag => (
                  <SelectItem key={tag.id} value={tag.id.toString()} className="text-white hover:bg-gray-700">
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
