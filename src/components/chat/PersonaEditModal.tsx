import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Upload } from 'lucide-react';

interface PersonaEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personaToEdit: any | null;
  setPersonaToEdit: (p: any | null) => void;
  isSaving: boolean;
  onSave: () => Promise<void> | void;
}

export default function PersonaEditModal({ open, onOpenChange, personaToEdit, setPersonaToEdit, isSaving, onSave }: PersonaEditModalProps) {
  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPersonaToEdit(personaToEdit ? { ...personaToEdit, avatar_url: e.target?.result as string } : null);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a2e] border-gray-700/50 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Persona</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Avatar */}
            <div className="text-center">
              <label className="block text-sm font-medium text-gray-300 mb-3 mt-[25px]" >Persona Avatar</label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                  id="persona-avatar-upload-edit"
                />
                <label
                  htmlFor="persona-avatar-upload-edit"
                  className="cursor-pointer block w-20 h-20 mx-auto rounded-full border-2 border-dashed border-gray-600 hover:border-[#FF7A00] transition-colors duration-300 flex items-center justify-center overflow-hidden"
                >
                  {personaToEdit?.avatar_url ? (
                    <img
                      src={personaToEdit.avatar_url}
                      alt="Persona avatar preview"
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <div className="text-center">
                      <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                      <span className="text-xs text-gray-400">Upload</span>
                    </div>
                  )}
                </label>
                {/* Fallback initials under the upload UI if no image yet (for a11y/SSR) */}
                <div className="sr-only">
                  <Avatar className="w-20 h-20 mx-auto">
                    <AvatarImage src={personaToEdit?.avatar_url || undefined} alt="Persona" className="object-cover" />
                    <AvatarFallback className="bg-[#FF7A00] text-white text-lg">
                      {personaToEdit?.name?.split(' ').map((n: string) => n[0]).join('') || 'P'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
                <Input
                  placeholder="Enter persona name..."
                  value={personaToEdit?.name || ''}
                  onChange={(e) => setPersonaToEdit(personaToEdit ? { ...personaToEdit, name: e.target.value } : null)}
                  maxLength={50}
                  className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20"
                  disabled={isSaving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Bio</label>
                <Textarea
                  placeholder="Brief description of this persona..."
                  value={personaToEdit?.bio || ''}
                  onChange={(e) => setPersonaToEdit(personaToEdit ? { ...personaToEdit, bio: e.target.value } : null)}
                  maxLength={200}
                  className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
                  rows={3}
                  disabled={isSaving}
                />
                <p className="text-xs text-gray-500 mt-1 text-right">{(personaToEdit?.bio || '').length}/200 characters</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Background & Lore</label>
            <Textarea
              placeholder="Detailed background, personality traits, history..."
              value={personaToEdit?.lore || ''}
              onChange={(e) => setPersonaToEdit(personaToEdit ? { ...personaToEdit, lore: e.target.value } : null)}
              maxLength={500}
              className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
              rows={4}
              disabled={isSaving}
            />
            <p className="text-xs text-gray-500 mt-1 text-right">{(personaToEdit?.lore || '').length}/500 characters</p>
          </div>

          <div className="flex space-x-3">
            <Button onClick={() => onOpenChange(false)} variant="outline" className="flex-1 bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-gray-300" disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={onSave} className="flex-1 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold" disabled={isSaving || !personaToEdit?.name?.trim()}>
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                'Update Persona'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
