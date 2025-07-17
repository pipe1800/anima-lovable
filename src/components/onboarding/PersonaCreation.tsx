import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Plus, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { createPersona, getUserPersonas, deletePersona, type Persona } from '@/lib/persona-operations';
import { useCurrentUser } from '@/hooks/useProfile';

interface CurrentPersona {
  name: string;
  bio: string;
  lore: string;
  avatar_url: string | null;
}

interface PersonaCreationProps {
  onComplete: () => void;
  onSkip: () => void;
}

const PersonaCreation = ({ onComplete, onSkip }: PersonaCreationProps) => {
  const { user } = useCurrentUser();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [currentPersona, setCurrentPersona] = useState<CurrentPersona>({
    name: '',
    bio: '',
    lore: '',
    avatar_url: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPersonas, setLoadingPersonas] = useState(true);

  // Load existing personas on component mount
  useEffect(() => {
    const loadPersonas = async () => {
      try {
        const userPersonas = await getUserPersonas();
        setPersonas(userPersonas);
      } catch (error) {
        console.error('Error loading personas:', error);
        toast.error('Failed to load existing personas');
      } finally {
        setLoadingPersonas(false);
      }
    };

    if (user) {
      loadPersonas();
    } else {
      setLoadingPersonas(false);
    }
  }, [user]);

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

  const handleAddPersona = async () => {
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
      const newPersona = await createPersona({
        name: currentPersona.name.trim(),
        bio: currentPersona.bio.trim() || null,
        lore: currentPersona.lore.trim() || null,
        avatar_url: currentPersona.avatar_url
      });

      setPersonas(prev => [newPersona, ...prev]);
      setCurrentPersona({
        name: '',
        bio: '',
        lore: '',
        avatar_url: null
      });
      toast.success('Persona created successfully!');
    } catch (error) {
      console.error('Error creating persona:', error);
      toast.error('Failed to create persona');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePersona = async (id: string) => {
    try {
      await deletePersona(id);
      setPersonas(prev => prev.filter(p => p.id !== id));
      toast.success('Persona removed');
    } catch (error) {
      console.error('Error removing persona:', error);
      toast.error('Failed to remove persona');
    }
  };

  const handleContinue = async () => {
    if (personas.length === 0) {
      toast.error('Please create at least one persona to continue');
      return;
    }

    // Personas are already saved to the database, just continue to next step
    onComplete();
  };

  if (loadingPersonas) {
    return (
      <div className="w-full max-w-4xl mx-auto flex items-center justify-center py-12">
        <div className="text-white">Loading personas...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-2 sm:px-4">
      <Card className="bg-[#1a1a2e]/90 backdrop-blur-sm border border-gray-700/50 p-4 sm:p-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 text-center">
          Step 3: Create Your Personas
        </h2>
        <p className="text-gray-400 text-center mb-4 text-sm sm:text-base">
          Create different personalities that AI characters will interact with
        </p>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4 mb-6">
          <p className="text-blue-200 text-xs sm:text-sm text-center">
            <strong>Personas</strong> are the identities you roleplay as when chatting with AI characters. 
            You can create multiple personas and switch between them during conversations.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          {/* Persona Creation Form */}
          <div className="space-y-6">
            <h3 className="text-lg sm:text-xl font-semibold text-white mb-4">
              Create New Persona
            </h3>

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

            <Button
              onClick={handleAddPersona}
              className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-[#FF7A00]/25 transition-all duration-300"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Persona
            </Button>
          </div>

          {/* Created Personas List */}
          <div className="space-y-4">
            <h3 className="text-lg sm:text-xl font-semibold text-white mb-4">
              Your Personas ({personas.length})
            </h3>
            
            {personas.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No personas created yet</p>
                <p className="text-sm">Create your first persona to get started</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {personas.map((persona) => (
                  <Card key={persona.id} className="bg-[#121212]/80 border border-gray-600 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-700">
                        {persona.avatar_url ? (
                          <img 
                            src={persona.avatar_url} 
                            alt={persona.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-semibold truncate">{persona.name}</h4>
                        {persona.bio && (
                          <p className="text-gray-400 text-sm mt-1 line-clamp-2">{persona.bio}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemovePersona(persona.id)}
                        className="text-gray-400 hover:text-red-400 transition-colors p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="mt-8 space-y-3">
          <Button
            onClick={handleContinue}
            disabled={isLoading || personas.length === 0}
            className="w-full bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-[#FF7A00]/25 transition-all duration-300 disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Continue with Personas'}
          </Button>
          
          <button
            onClick={onSkip}
            disabled={isLoading}
            className="w-full text-gray-400 hover:text-[#FF7A00] transition-colors duration-300 text-sm underline-offset-4 hover:underline disabled:opacity-50"
          >
            I'll create personas later
          </button>
        </div>
      </Card>
    </div>
  );
};

export default PersonaCreation;