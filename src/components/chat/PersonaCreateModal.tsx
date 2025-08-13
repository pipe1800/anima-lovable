import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface PersonaCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPersona: { name: string; bio: string; lore: string; avatar_url: string | null };
  setCurrentPersona: React.Dispatch<React.SetStateAction<{ name: string; bio: string; lore: string; avatar_url: string | null }>>;
  isCreating: boolean;
  onCreate: () => Promise<void> | void;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function PersonaCreateModal({ open, onOpenChange, currentPersona, setCurrentPersona, isCreating, onCreate, onAvatarChange }: PersonaCreateModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a2e] border-gray-700/50 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Create New Persona</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-blue-200 text-sm text-center">
              <strong>Personas</strong> are the identities you roleplay as when chatting with AI characters.
              You can create multiple personas and switch between them during conversations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Avatar Upload */}
            <div className="text-center">
              <label className="block text-sm font-medium text-gray-300 mb-3">Persona Avatar</label>
              <div className="relative">
                <input type="file" accept="image/*" onChange={onAvatarChange} className="hidden" id="persona-avatar-upload-modal" />
                <label
                  htmlFor="persona-avatar-upload-modal"
                  className="cursor-pointer block w-20 h-20 mx-auto rounded-full border-2 border-dashed border-gray-600 hover:border-[#FF7A00] transition-colors duration-300 flex items-center justify-center overflow-hidden"
                >
                  {currentPersona.avatar_url ? (
                    <img src={currentPersona.avatar_url} alt="Persona avatar preview" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <div className="text-center">
                      <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                      <span className="text-xs text-gray-400">Upload</span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Persona Name *</label>
              <Input
                placeholder="e.g., Alex the Explorer, Sarah the Scholar..."
                value={currentPersona.name}
                onChange={(e) => setCurrentPersona(prev => ({ ...prev, name: e.target.value }))}
                className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20"
              />
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Bio</label>
            <Textarea
              placeholder="Brief description of this persona..."
              value={currentPersona.bio}
              onChange={(e) => setCurrentPersona(prev => ({ ...prev, bio: e.target.value }))}
              maxLength={200}
              className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
              rows={3}
            />
            <p className="text-xs text-gray-500 mt-1 text-right">{currentPersona.bio.length}/200 characters</p>
          </div>

          {/* Lore */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Background & Lore</label>
            <Textarea
              placeholder="Detailed background, personality traits, history..."
              value={currentPersona.lore}
              onChange={(e) => setCurrentPersona(prev => ({ ...prev, lore: e.target.value }))}
              maxLength={500}
              className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
              rows={4}
            />
            <p className="text-xs text-gray-500 mt-1 text-right">{currentPersona.lore.length}/500 characters</p>
          </div>

          <div className="flex space-x-3">
            <Button onClick={() => onOpenChange(false)} variant="outline" className="flex-1 bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-gray-300">
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={isCreating || !currentPersona.name.trim()} className="flex-1 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white">
              {isCreating ? 'Creating...' : 'Create Persona'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
