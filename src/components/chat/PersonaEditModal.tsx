import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface PersonaEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personaToEdit: any | null;
  setPersonaToEdit: (p: any | null) => void;
  isSaving: boolean;
  onSave: () => Promise<void> | void;
}

export default function PersonaEditModal({ open, onOpenChange, personaToEdit, setPersonaToEdit, isSaving, onSave }: PersonaEditModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a2e] border-gray-700/50 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Persona</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-blue-200 text-sm text-center">Edit your persona details. Changes will apply to future conversations.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Avatar */}
            <div className="text-center">
              <label className="block text-sm font-medium text-gray-300 mb-3">Persona Avatar</label>
              <div className="relative">
                <Avatar className="w-20 h-20 mx-auto">
                  <AvatarImage src={personaToEdit?.avatar_url || undefined} alt="Persona" />
                  <AvatarFallback className="bg-[#FF7A00] text-white text-lg">
                    {personaToEdit?.name?.split(' ').map((n: string) => n[0]).join('') || 'P'}
                  </AvatarFallback>
                </Avatar>
                <div className="mt-2 text-xs text-gray-400">Avatar upload coming soon</div>
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
