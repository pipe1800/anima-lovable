import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { createCharacter, updateCharacter } from '@/lib/character-operations';
import { getCharacterDetails } from '@/lib/supabase-queries';
import { upsertUserCharacterSettings } from '@/queries/userCharacterSettingsQueries';
import type { CharacterCreationData } from '@/lib/character-operations';
import type { Tables } from '@/integrations/supabase/types';

type Tag = Tables<'tags'>;

export interface CharacterFormData {
  // Foundation
  name: string;
  avatar: string;
  title: string;
  description: string;
  chatMode: 'storytelling' | 'companion';
  
  // Personality
  personality: {
    core_personality: string;
    tags: string[];
    knowledge_base: string;
    scenario_definition: string;
  };
  
  // Dialogue
  dialogue: {
    greeting: string;
    example_dialogues: Array<{ user: string; character: string; }>;
  };
  
  // Settings
  visibility: 'public' | 'unlisted' | 'private';
  nsfw_enabled: boolean;
  default_persona_id?: string | null;
}

const INITIAL_CHARACTER_DATA: CharacterFormData = {
  name: '',
  avatar: '',
  title: '',
  description: '',
  chatMode: 'storytelling',
  personality: {
    core_personality: '',
    tags: [],
    knowledge_base: '',
    scenario_definition: ''
  },
  dialogue: {
    greeting: '',
    example_dialogues: []
  },
  visibility: 'public',
  nsfw_enabled: false,
  default_persona_id: null
};

export function useCharacterCreation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [characterData, setCharacterData] = useState<CharacterFormData>(INITIAL_CHARACTER_DATA);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Load character for editing
  useEffect(() => {
    const state = location.state as any;
    if (state?.isEditing && state?.editingCharacter) {
      setIsEditing(true);
      setEditingCharacterId(state.editingCharacter.id);
      loadCharacterForEditing(state.editingCharacter.id);
    }
  }, [location.state]);

  const loadCharacterForEditing = async (characterId: string) => {
    try {
      const { data: character, error } = await getCharacterDetails(characterId);
      if (error || !character) {
        toast({
          title: "Error Loading Character",
          description: "Failed to load character data for editing.",
          variant: "destructive",
        });
        return;
      }

      // Parse the definition JSON to extract personality and dialogue data
      let definitionData: any = {};
      if (character.definition?.[0]?.personality_summary) {
        try {
          definitionData = JSON.parse(character.definition[0].personality_summary);
        } catch (e) {
          console.error('Error parsing character definition:', e);
        }
      }

      // Map character data to form structure
      const formData: CharacterFormData = {
        name: character.name,
        avatar: character.avatar_url || '',
        title: character.tagline || '',
        description: character.short_description || '',
        chatMode: (character.definition?.[0]?.chat_mode as 'storytelling' | 'companion') || 'storytelling',
        personality: {
          core_personality: character.definition?.[0]?.description || '',
          tags: definitionData.personality?.tags || character.tags?.map((t: any) => t.name) || [],
          knowledge_base: definitionData.personality?.knowledge_base || '',
          scenario_definition: definitionData.personality?.scenario_definition || ''
        },
        dialogue: {
          greeting: character.definition?.[0]?.greeting || '',
          example_dialogues: definitionData.dialogue?.example_dialogues || []
        },
        visibility: character.visibility || 'public',
        nsfw_enabled: character.nsfw_enabled || false,
        default_persona_id: character.default_persona_id
      };

      setCharacterData(formData);
      // Set selectedTags with the proper tag objects from the character's tags
      if (character.tags && Array.isArray(character.tags)) {
        setSelectedTags(character.tags);
      } else {
        setSelectedTags([]);
      }
    } catch (error) {
      console.error('Error loading character:', error);
      toast({
        title: "Error",
        description: "Failed to load character data.",
        variant: "destructive",
      });
    }
  };

  const updateCharacterData = useCallback((stepData: Partial<CharacterFormData>) => {
    setCharacterData(prev => ({
      ...prev,
      ...stepData
    }));
    setIsDirty(true);
  }, []);

  const validateStep = useCallback((step: number): boolean => {
    switch (step) {
      case 1: // Foundation
        return !!(
          characterData.name?.trim()
          // Removed description requirement
        );
      case 2: // Personality
        return !!(
          characterData.personality?.core_personality &&
          characterData.personality.core_personality.length >= 50
        );
      case 3: // Dialogue
        return !!(
          characterData.dialogue?.greeting?.trim()
        );
      case 4: // Finalize
        return true;
      default:
        return false;
    }
  }, [characterData]);

  const saveCharacter = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to save your character.",
        variant: "destructive",
      });
      return;
    }

    // Validate required fields
    if (!characterData.name || 
        !characterData.personality?.core_personality || !characterData.dialogue?.greeting) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    
    try {
      let character;
      if (isEditing && editingCharacterId) {
        character = await updateCharacter(editingCharacterId, characterData as CharacterCreationData);
        
        // Save chat mode settings
        if (characterData.chatMode) {
          await upsertUserCharacterSettings(user.id, editingCharacterId, {
            chat_mode: characterData.chatMode
          });
        }
        
        toast({
          title: "Character Updated!",
          description: `${character.name} has been successfully updated.`,
        });
      } else {
        character = await createCharacter(characterData as CharacterCreationData);
        
        // Save chat mode settings
        if (characterData.chatMode && character.id) {
          await upsertUserCharacterSettings(user.id, character.id, {
            chat_mode: characterData.chatMode
          });
        }
        
        toast({
          title: "Character Created!",
          description: `${character.name} has been successfully created.`,
        });
      }
      
      setIsDirty(false);
      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving character:', error);
      toast({
        title: isEditing ? "Update Failed" : "Creation Failed",
        description: `Failed to ${isEditing ? 'update' : 'create'} character. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return {
    currentStep,
    setCurrentStep,
    characterData,
    updateCharacterData,
    selectedTags,
    setSelectedTags,
    isCreating,
    isEditing,
    isDirty,
    saveCharacter,
    validateStep,
    editingCharacterId
  };
}
