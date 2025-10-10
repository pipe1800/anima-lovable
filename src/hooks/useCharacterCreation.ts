import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { createCharacter as createCharacterBasic, deletePrivateCharacter } from '@/data/characters/mutations';
import { CharacterProfileView, CharacterUserSettings } from '@/data';
import type { Tables } from '@/integrations/supabase/types';

// CharacterCreationData (previously from deprecated extendedMutations)
export interface CharacterCreationData {
  name: string;
  avatar?: string;
  title?: string;
  description: string;
  personality: {
    core_personality: string;
    tags: string[];
    knowledge_base?: string;
    scenario_definition?: string;
  };
  dialogue: {
    greeting: string;
    example_dialogues: Array<{ user: string; character: string; } | string>;
    alternate_greetings?: string[];
  };
  addons?: Record<string, boolean>;
  visibility: 'public' | 'unlisted' | 'private';
  nsfw_enabled?: boolean;
  default_persona_id?: string | null;
  time_awareness_enabled?: boolean;
  version?: string;
  notes?: { character_notes?: string; creator_notes?: string; };
  manual_addon_context_enabled?: boolean;
  manual_addon_context?: {
    mood?: string;
    clothing?: string;
    location?: string;
    time_weather?: string;
    relationship?: string;
    character_position?: string;
  } | null;
}

type Tag = { id: number; name: string };

export interface CharacterFormData {
  // Foundation
  name: string;
  avatar: string;
  title: string;
  description: string;
  chatMode: 'storytelling' | 'companion';
  
  // Versioning and notes
  version?: string;
  notes?: {
    character_notes: string; // injected into model context
    creator_notes: string;   // public on profile
  };
  
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
    // Support multiple greetings parsed from cards (e.g., Tavern v2 alternate_greetings)
    alternate_greetings?: string[];
  };
  
  // Settings
  visibility: 'public' | 'unlisted' | 'private';
  nsfw_enabled: boolean;
  default_persona_id?: string | null;
  
  // User-specific settings
  timeAwarenessEnabled?: boolean;

  // Custom initial addon context
  manual_addon_context_enabled?: boolean;
  manual_addon_context?: {
    mood?: string;
    clothing?: string;
    location?: string;
    time_weather?: string;
    relationship?: string;
    character_position?: string;
  } | null;

  // Relationship goals template
  relationshipGoalsTemplate?: {
    enabled: boolean;
    path: { id: string; order: number; label: string; threshold: number; description?: string }[];
  };
}

const INITIAL_CHARACTER_DATA: CharacterFormData = {
  name: '',
  avatar: '',
  title: '',
  description: '',
  chatMode: 'storytelling',
  version: '',
  notes: { character_notes: '', creator_notes: '' },
  personality: {
    core_personality: '',
    tags: [],
    knowledge_base: '',
    scenario_definition: ''
  },
  dialogue: {
    greeting: '',
    example_dialogues: [],
    alternate_greetings: []
  },
  visibility: 'private',
  nsfw_enabled: false,
  default_persona_id: null,
  timeAwarenessEnabled: false,
  manual_addon_context_enabled: false,
  manual_addon_context: null,
  relationshipGoalsTemplate: undefined
};

// Helper to map extended form data to basic createCharacter payload
function mapToBasicCharacterPayload(data: CharacterCreationData) {
  return {
    name: data.name,
    short_description: data.description,
    avatar_url: data.avatar,
    visibility: data.visibility,
    definition: JSON.stringify({
      personality: data.personality,
      dialogue: data.dialogue,
      title: data.title,
      addons: data.addons,
      version: data.version,
      notes: data.notes,
      initial_addon_context_enabled: data.manual_addon_context_enabled && !!data.manual_addon_context && Object.keys(data.manual_addon_context).length > 0,
      initial_addon_context: data.manual_addon_context_enabled ? data.manual_addon_context : null
    }),
    greeting: data.dialogue.greeting,
    long_description: data.personality.core_personality
  };
}

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
  const [originallyPublic, setOriginallyPublic] = useState(false);
  // New: latent profile extraction progress
  const [isLatentExtracting, setIsLatentExtracting] = useState(false);
  // New: hydration status for edit flow
  const [hydrated, setHydrated] = useState(false);

  // Mark hydrated immediately for creation flow (no edit load needed)
  useEffect(() => {
    if (!isEditing && !hydrated) setHydrated(true);
  }, [isEditing, hydrated]);

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
    console.log('🔄 Loading character for editing:', characterId);
    setHydrated(false); // start of async hydration
    try {
      const character = await CharacterProfileView.getCharacterFullProfile(characterId);
      if (!character) {
        console.error('❌ Failed to load character');
        toast({
          title: "Error Loading Character",
          description: "Failed to load character data for editing.",
          variant: "destructive",
        });
        return;
      }

      console.log('✅ Character loaded successfully:', {
        id: character.id,
        name: character.name,
        tagline: character.tagline,
        tagline_is_null: character.tagline === null,
        tagline_is_undefined: character.tagline === undefined,
        tagline_length: character.tagline?.length,
        short_description: character.short_description,
        avatar_url: character.avatar_url,
        visibility: character.visibility
      });

      // Load user character settings
      const userSettings = user ? (await CharacterUserSettings.getUserCharacterSettings(user.id, characterId)).data : null;
      console.log('⚙️ User character settings loaded:', userSettings);

      // Parse personality summary JSON if present
      let definitionData: any = {};
      if (character.character_definitions?.personality_summary) {
        try {
          definitionData = JSON.parse(character.character_definitions.personality_summary);
        } catch (e) {
          console.error('Error parsing character definition:', e);
        }
      }

      const formData: CharacterFormData = {
        name: character.name,
        avatar: character.avatar_url || '',
        title: character.tagline || '',
        description: character.short_description || '',
        chatMode: (userSettings?.chat_mode as 'storytelling' | 'companion') || 'storytelling',
        version: definitionData?.version || '',
        notes: {
          character_notes: definitionData?.notes?.character_notes || '',
          creator_notes: definitionData?.notes?.creator_notes || ''
        },
        personality: {
          core_personality: character.character_definitions?.description || '',
          tags: definitionData.personality?.tags || character.tags?.map((t: any) => t.name) || [],
          knowledge_base: definitionData.personality?.knowledge_base || '',
          scenario_definition: definitionData.personality?.scenario_definition || definitionData.personality?.scenario_definition || ''
        },
        dialogue: {
          greeting: character.character_definitions?.greeting || definitionData.personality?.greeting || definitionData.dialogue?.greeting || '',
          example_dialogues: Array.isArray(definitionData.dialogue?.example_dialogues) ? definitionData.dialogue.example_dialogues.filter((d: any)=>d && typeof d === 'object') : [],
          alternate_greetings: definitionData.dialogue?.alternate_greetings || definitionData.personality?.alternate_greetings || []
        },
        visibility: character.visibility,
        wasPublic: character.was_public || false,
        nsfw_enabled: false,
        default_persona_id: undefined,
      } as any; // Keep casting until form type updated

      // Hydrate relationship goals template (new)
      try {
        const { RelationshipTemplate } = await import('@/data');
        const tplResp = await RelationshipTemplate.getTemplate(characterId);
        console.log('📥 RAW relationship goals template response:', tplResp);
        if (tplResp?.data) {
          const raw: any = tplResp.data;
          // Support possible shapes
            // 1) { path: [...], version? }
            // 2) { enabled: bool, path: [...] }
            // 3) legacy: maybe nested
          const path: any[] = Array.isArray(raw.path)
            ? raw.path
            : Array.isArray(raw?.relationship_goals?.path)
              ? raw.relationship_goals.path
              : [];
          if (path.length >= 2) {
            formData.relationshipGoalsTemplate = {
              enabled: raw.enabled !== false, // treat missing or true as enabled
              path: path
                .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
                .map((g: any, idx: number) => ({
                  id: g.id || crypto.randomUUID(),
                  order: typeof g.order === 'number' ? g.order : idx + 1,
                  label: g.label || `Stage ${typeof g.order === 'number' ? g.order : idx + 1}`,
                  threshold: typeof g.threshold === 'number' ? g.threshold : Number((1 + idx * 0.3).toFixed(2)),
                  description: g.description
                }))
            } as any;
            console.log('🧩 Hydrated relationship goals template (inferred):', formData.relationshipGoalsTemplate);
          } else {
            console.log('ℹ️ Relationship goals template present but path length < 2, skipping hydration (length =', path.length, ')');
          }
        } else {
          console.log('ℹ️ No relationship goals template row found for character');
        }
      } catch (tplErr) {
        console.warn('⚠️ Failed to hydrate relationship goals template (non-blocking):', tplErr);
      }

      setCharacterData(formData);
      setOriginallyPublic(character.was_public || false);
      setSelectedTags(character.tags || []);
      setHydrated(true); // completed hydration
      setIsDirty(false);
    } catch (error) {
      console.error('❌ Error loading character for editing:', error);
      toast({
        title: "Error Loading Character",
        description: "An unexpected error occurred.",
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
      case 1: { // Foundation
        const name = characterData.name?.trim();
        const description = characterData.description?.trim();
        return !!(name && description);
      }
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

  const saveCharacter = async (overrides?: Partial<CharacterFormData>) => {
     console.log('🔄 Starting character save process:', {
       isEditing,
       editingCharacterId,
       characterData: JSON.stringify(characterData, null, 2),
       overrides
     });
    const effective: CharacterFormData = { ...characterData, ...(overrides || {}) } as CharacterFormData;
    if (originallyPublic) {
      effective.visibility = 'public';
    }

     if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to save your character.",
        variant: "destructive",
      });
      return;
    }

    // Validate required fields
    if (!effective.name || 
        !effective.personality?.core_personality || !effective.dialogue?.greeting) {
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
        console.log('📝 Updating existing character:', {
          characterId: editingCharacterId,
          title: effective.title,
          tagline_will_be: effective.title || '',
          timeAwareness: effective.timeAwarenessEnabled,
          updateData: effective,
           selectedTags: selectedTags.map(t => t.name)
         });
         
         // Ensure tags are included in the character data before updating
         const updatedCharacterData = {
          ...effective,
          title: effective.title || '',
          time_awareness_enabled: effective.timeAwarenessEnabled,
           personality: {
            ...effective.personality,
            tags: selectedTags.length > 0 ? selectedTags.map(tag => tag.name) : effective.personality.tags
           }
         };
         
         console.log('📝 Final update data being sent:', {
           title: updatedCharacterData.title,
           name: updatedCharacterData.name,
           description: updatedCharacterData.description,
           visibility: updatedCharacterData.visibility,
           time_awareness_enabled: updatedCharacterData.time_awareness_enabled,
           user_settings_to_save: {
            chat_mode: effective.chatMode,
             time_awareness_enabled: updatedCharacterData.time_awareness_enabled
           }
         });
         
         // Updating existing character: placeholder (extended update removed). Could implement basic field updates via separate mutation.
         // For now, skip calling createCharacterBasic when editing since mutation signature differs.
         // TODO: implement update mapping once basic update mutation exists
         character = (await createCharacterBasic(mapToBasicCharacterPayload(updatedCharacterData)))?.data as any;
         
         console.log('✅ Character updated successfully:', character);
         
         // Save chat mode settings (time awareness is now handled in updateCharacter)
        if (effective.chatMode) {
           console.log('💾 Saving chat mode settings:', {
            chat_mode: effective.chatMode
           });
           
           await CharacterUserSettings.upsertUserCharacterSettings(user.id, editingCharacterId, {
            chat_mode: effective.chatMode
           });
         }
         
         // Ensure selectedTags are properly included in characterData
         if (selectedTags.length > 0) {
           console.log('🏷️ Tags already included in update data:', selectedTags.map(t => t.name));
         } else {
           console.log('📝 No tags selected for this character');
         }
         
         toast({
           title: "Character Updated!",
           description: `${character.name} has been successfully updated.`,
         });
       } else {
         console.log('🆕 Creating new character:', {
          characterData: effective,
           selectedTags: selectedTags.map(t => t.name)
         });
         
         // Ensure tags are included in the character data before creating
         const updatedCharacterData = {
          ...effective,
          time_awareness_enabled: effective.timeAwarenessEnabled,
           personality: {
            ...effective.personality,
            tags: selectedTags.length > 0 ? selectedTags.map(tag => tag.name) : effective.personality.tags
           }
         };
         
         // Map to basic payload expected by createCharacter
         const basicPayload = mapToBasicCharacterPayload({
           name: updatedCharacterData.name,
           avatar: updatedCharacterData.avatar,
           title: updatedCharacterData.title,
           description: updatedCharacterData.description,
           personality: updatedCharacterData.personality as any,
           dialogue: updatedCharacterData.dialogue as any,
           addons: undefined,
           visibility: updatedCharacterData.visibility,
           nsfw_enabled: updatedCharacterData.nsfw_enabled,
           default_persona_id: updatedCharacterData.default_persona_id,
           time_awareness_enabled: updatedCharacterData.timeAwarenessEnabled,
           version: updatedCharacterData.version,
           notes: updatedCharacterData.notes,
           manual_addon_context_enabled: updatedCharacterData.manual_addon_context_enabled,
           manual_addon_context: updatedCharacterData.manual_addon_context,
         } as any);

         const createResp = await createCharacterBasic(basicPayload);
         if (!createResp?.data) {
           throw createResp?.error || new Error('Character creation failed');
         }
         character = createResp.data as any;
       }
      // After base character persisted, trigger latent profile extraction (fire & wait with timeout)
      if (character?.id) {
        // Upsert relationship goals template if provided
        try {
          if (effective.relationshipGoalsTemplate?.enabled && effective.relationshipGoalsTemplate.path?.length >= 2) {
            const { RelationshipTemplate } = await import('@/data');
            await RelationshipTemplate.upsertTemplate(character.id, {
              enabled: true,
              path: effective.relationshipGoalsTemplate.path.map(g => ({ id: g.id, order: g.order, label: g.label.trim(), threshold: g.threshold, description: g.description })),
            } as any);
          }
        } catch (rgErr) {
          console.warn('⚠️ Failed to upsert relationship goals template (non-blocking):', rgErr);
        }
        try {
          setIsLatentExtracting(true);
          // Removed AbortController (not supported in supabase.functions.invoke options)
          try {
            const { CharacterFunctions } = await import('@/data');
            const resp = await CharacterFunctions.extractLatentProfile(character.id);
            if (!resp.ok) {
              console.warn('latent profile invoke error', resp.error);
            }
          } catch (invErr) {
            console.warn('latent profile invoke failed', invErr);
          }
        } catch (e) {
          console.warn('latent extraction failed (non-blocking)', e);
        } finally {
          setIsLatentExtracting(false);
        }
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

  // Diagnostic: log when relationship goals template becomes available post-hydration
  useEffect(() => {
    if (hydrated && characterData.relationshipGoalsTemplate) {
      console.log('✅ useCharacterCreation: relationshipGoalsTemplate hydrated:', characterData.relationshipGoalsTemplate);
    }
  }, [hydrated, characterData.relationshipGoalsTemplate]);

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
    editingCharacterId,
    hydrated
  };
}
