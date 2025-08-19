import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Plus, User, X, Edit } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { createPersona, deletePersona, updatePersona, getPersonaById, type Persona } from '@/lib/persona-operations';
import { useAuth } from '@/contexts/AuthContext';
import { usePersonas, bootstrapActions } from '@/state/bootstrap-store';

export const PersonasTab = () => {
  const { user } = useAuth();
  const { personas } = usePersonas();
  const loadingPersonas = !personas; // bootstrap ensures initial load

  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [currentPersona, setCurrentPersona] = useState({
    name: '',
    bio: '',
    lore: '',
    avatar_url: null as string | null
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setCurrentPersona(prev => ({
          ...prev,
          avatar_url: e.target?.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingPersona(null);
    setCurrentPersona({
      name: '',
      bio: '',
      lore: '',
      avatar_url: null
    });
    setShowPersonaModal(true);
  };

  // Fetch full persona (with bio/lore) before editing since snapshot personas are trimmed
  const handleOpenEditModal = async (persona: { id: string; name: string; avatar_url: string | null; updated_at: string }) => {
    try {
      setIsLoading(true);
      const full = await getPersonaById(persona.id);
      setEditingPersona(full);
      setCurrentPersona({
        name: full.name,
        bio: full.bio || '',
        lore: full.lore || '',
        avatar_url: full.avatar_url
      });
      setShowPersonaModal(true);
    } catch (e) {
      console.error('Failed to load persona details', e);
      toast.error('Failed to load persona details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePersona = async () => {
    if (!currentPersona.name.trim()) {
      toast.error('Please enter a persona name');
      return;
    }

    if (!user) {
      toast.error('You must be logged in to create personas');
      return;
    }

    setIsLoading(true);
    try {
      if (editingPersona) {
        const updatedPersona = await updatePersona(editingPersona.id, {
          name: currentPersona.name.trim(),
          bio: currentPersona.bio.trim() || null,
          lore: currentPersona.lore.trim() || null,
          avatar_url: currentPersona.avatar_url
        });
        bootstrapActions.updatePersona(editingPersona.id, { name: updatedPersona.name, avatar_url: updatedPersona.avatar_url });
        toast.success('Persona updated successfully!');
      } else {
        const newPersona = await createPersona(user.id, {
          name: currentPersona.name.trim(),
          bio: currentPersona.bio.trim() || null,
            lore: currentPersona.lore.trim() || null,
          avatar_url: currentPersona.avatar_url
        } as any);
        bootstrapActions.addPersona({ id: newPersona.id, name: newPersona.name, avatar_url: newPersona.avatar_url, updated_at: newPersona.updated_at });
        toast.success('Persona created successfully!');
      }

      setShowPersonaModal(false);
      setCurrentPersona({
        name: '',
        bio: '',
        lore: '',
        avatar_url: null
      });
    } catch (error) {
      console.error('Error saving persona:', error);
      toast.error('Failed to save persona');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePersona = async (id: string) => {
    try {
      await deletePersona(id);
      bootstrapActions.removePersona(id);
      toast.success('Persona removed');
    } catch (error) {
      console.error('Error removing persona:', error);
      toast.error('Failed to remove persona');
    }
  };

  if (loadingPersonas) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-white">Loading personas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">Your Personas</h3>
        <Button
          onClick={handleOpenCreateModal}
          className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create New Persona
        </Button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <p className="text-blue-200 text-sm">
          <strong>Personas</strong> are the identities you roleplay as when chatting with AI characters. 
          You can create multiple personas and switch between them during conversations.
        </p>
      </div>

      {personas.length === 0 ? (
        <Card className="bg-[#1a1a1a] border-[#333] p-12">
          <div className="text-center">
            <User className="w-16 h-16 mx-auto mb-4 text-gray-400 opacity-50" />
            <h4 className="text-lg font-semibold text-white mb-2">No personas yet</h4>
            <p className="text-gray-400 mb-6">
              Create your first persona to start roleplaying with AI characters
            </p>
            <Button
              onClick={handleOpenCreateModal}
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Persona
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {personas.map((persona) => (
            <Card key={persona.id} className="bg-[#1a1a1a] border-[#333] p-4 hover:bg-[#1a1a1a]/80 transition-colors">
              <div className="flex items-start gap-3">
                <Avatar className="w-12 h-12 flex-shrink-0">
                  <AvatarImage src={persona.avatar_url || undefined} alt={persona.name} />
                  <AvatarFallback className="bg-[#FF7A00] text-white">
                    {persona.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-white font-semibold truncate">{persona.name}</h4>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(persona)}
                        className="text-gray-400 hover:text-[#FF7A00] transition-colors p-1"
                        disabled={isLoading}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemovePersona(persona.id)}
                        className="text-gray-400 hover:text-red-400 transition-colors p-1"
                        disabled={isLoading}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Last updated {new Date(persona.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Persona Creation/Edit Modal */}
      <Dialog open={showPersonaModal} onOpenChange={setShowPersonaModal}>
        <DialogContent className="bg-[#1a1a2e] border-gray-700/50 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingPersona ? 'Edit Persona' : 'Create New Persona'}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {editingPersona ? 'Update your persona details below.' : 'Create a new persona to roleplay with AI characters.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Avatar Upload */}
              <div className="text-center">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Persona Avatar
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                    id="persona-avatar-upload"
                  />
                  <label
                    htmlFor="persona-avatar-upload"
                    className="cursor-pointer block w-20 h-20 mx-auto rounded-full border-2 border-dashed border-gray-600 hover:border-[#FF7A00] transition-colors duration-300 flex items-center justify-center overflow-hidden"
                  >
                    {currentPersona.avatar_url ? (
                      <img 
                        src={currentPersona.avatar_url} 
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
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Persona Name *
                </label>
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
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Bio
              </label>
              <Textarea
                placeholder="Brief description of this persona..."
                value={currentPersona.bio}
                onChange={(e) => setCurrentPersona(prev => ({ ...prev, bio: e.target.value }))}
                maxLength={200}
                className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1 text-right">
                {currentPersona.bio.length}/200 characters
              </p>
            </div>

            {/* Lore */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Background & Lore
              </label>
              <Textarea
                placeholder="Detailed background, personality traits, history..."
                value={currentPersona.lore}
                onChange={(e) => setCurrentPersona(prev => ({ ...prev, lore: e.target.value }))}
                maxLength={500}
                className="bg-[#121212] border-gray-600 text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:ring-[#FF7A00]/20 resize-none"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-1 text-right">
                {currentPersona.lore.length}/500 characters
              </p>
            </div>

            <div className="flex space-x-3">
              <Button
                onClick={() => setShowPersonaModal(false)}
                variant="outline"
                className="flex-1 bg-transparent border-gray-600/50 hover:bg-[#1a1a2e] hover:text-white text-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSavePersona}
                disabled={isLoading || !currentPersona.name.trim()}
                className="flex-1 bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                {isLoading ? 'Saving...' : editingPersona ? 'Update Persona' : 'Create Persona'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};