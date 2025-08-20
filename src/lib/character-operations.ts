import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { parseExampleDialogue } from '@/lib/dialogue';

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
    example_dialogues: Array<{
      user: string;
      character: string;
    }>;
  };
  addons?: {
    dynamicWorldInfo: boolean;
    enhancedMemory: boolean;
    moodTracking: boolean;
    clothingInventory: boolean;
    locationTracking: boolean;
    timeAndWeather: boolean;
    relationshipStatus: boolean;
    chainOfThought: boolean;
    fewShotExamples: boolean;
  };
  visibility: 'public' | 'unlisted' | 'private';
  nsfw_enabled?: boolean;
  default_persona_id?: string | null;
  time_awareness_enabled?: boolean;
  // New optional fields
  version?: string;
  notes?: {
    character_notes?: string;
    creator_notes?: string;
  };
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

export const createCharacter = async (characterData: CharacterCreationData) => {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // Create character record
    const characterInsert: TablesInsert<'characters'> = {
      creator_id: user.user.id,
      name: characterData.name,
      short_description: characterData.description,
      avatar_url: characterData.avatar,
      tagline: characterData.title,
      visibility: characterData.visibility
    } as any;

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .insert(characterInsert)
      .select()
      .single();

    if (characterError || !character) {
      console.error('Error creating character:', characterError);
      throw new Error('Failed to create character');
    }

    // Process example dialogues to ensure they're in the correct format
    const processedDialogue = {
      ...characterData.dialogue,
      example_dialogues: characterData.dialogue.example_dialogues.map(dialogue => {
        // If the dialogue is a string, parse it; otherwise, keep it as is
        if (typeof dialogue === 'string') {
          return parseExampleDialogue(dialogue);
        }
        return dialogue;
      }).flat() // Flatten in case parseExampleDialogue returns an array
    };

    // Create character definition
    const definition: any = {
      personality: characterData.personality,
      dialogue: processedDialogue,
      title: characterData.title
    };

    // Include version and notes when provided
    if (characterData.version) {
      definition.version = characterData.version;
    }
    if (characterData.notes) {
      definition.notes = {
        character_notes: characterData.notes.character_notes || '',
        creator_notes: characterData.notes.creator_notes || ''
      };
    }

    // Only include addons if any are enabled (master switch is ON)
    const hasEnabledAddons = characterData.addons && Object.values(characterData.addons).some(value => value === true);
    if (hasEnabledAddons) {
      definition.addons = characterData.addons;
    }

    // Persist manual initial addon context if enabled
    if (characterData.manual_addon_context_enabled && characterData.manual_addon_context) {
      definition.initial_addon_context_enabled = true;
      definition.initial_addon_context = characterData.manual_addon_context;
    }

    // Sanitize manual addon context (creation)
    const cleanedManualContextCreate = characterData.manual_addon_context ? Object.fromEntries(
      Object.entries(characterData.manual_addon_context).filter(([_,v]) => typeof v === 'string' && v.trim())
    ) : {};
    const enableInitialAddonCreate = !!characterData.manual_addon_context_enabled;
    console.log('🧪 [create] Manual addon context incoming:', {
      raw_enabled: characterData.manual_addon_context_enabled,
      raw_context: characterData.manual_addon_context,
      cleaned: cleanedManualContextCreate,
      enableInitialAddonCreate
    });

    if (enableInitialAddonCreate) {
      definition.initial_addon_context_enabled = true;
      if (Object.keys(cleanedManualContextCreate).length) {
        definition.initial_addon_context = cleanedManualContextCreate;
      }
    }

    const { error: definitionError } = await supabase
      .from('character_definitions')
      .insert({
        character_id: character.id,
        personality_summary: JSON.stringify(definition),
        greeting: characterData.dialogue.greeting,
        description: characterData.personality.core_personality,
        scenario: characterData.personality.scenario_definition || null,
        initial_addon_context_enabled: !!(characterData.manual_addon_context_enabled && characterData.manual_addon_context && Object.keys(characterData.manual_addon_context).length > 0),
        initial_addon_context: (characterData.manual_addon_context_enabled && characterData.manual_addon_context && Object.keys(characterData.manual_addon_context).length > 0)
          ? characterData.manual_addon_context
          : null
      });
    if (!definitionError) {
      console.log('✅ Created definition with initial addon context columns:', {
        enabled: !!(characterData.manual_addon_context_enabled && characterData.manual_addon_context && Object.keys(characterData.manual_addon_context).length > 0),
        context: characterData.manual_addon_context
      });
    }

    if (definitionError) {
      console.error('Error creating character definition:', definitionError);
      // Cleanup: delete the character if definition creation failed
      await supabase.from('characters').delete().eq('id', character.id);
      throw new Error('Failed to create character definition');
    }

    // Save character tags if any are selected
    if (characterData.personality.tags && characterData.personality.tags.length > 0) {
      // First, get tag IDs from tag names
      const { data: tagData, error: tagError } = await supabase
        .from('tags')
        .select('id, name')
        .in('name', characterData.personality.tags);

      if (tagError) {
        console.error('Error fetching tag IDs:', tagError);
      } else if (tagData) {
        // Insert character_tags relationships
        const characterTagInserts = tagData.map(tag => ({
          character_id: character.id,
          tag_id: tag.id
        }));

        const { error: characterTagsError } = await supabase
          .from('character_tags')
          .insert(characterTagInserts);

        if (characterTagsError) {
          console.error('Error creating character tags:', characterTagsError);
        }
      }
    }

    // ✅ FIX: Handle time awareness setting for new character
    if (characterData.time_awareness_enabled !== undefined) {
      const timeAwarenessValue = characterData.time_awareness_enabled;
      
      console.log('⏰ Setting time awareness for new character:', {
        characterId: character.id,
        userId: user.user.id,
        time_awareness_enabled: timeAwarenessValue
      });

      // Insert user character settings for time awareness
      const { error: settingsError } = await supabase
        .from('user_character_settings')
        .upsert({
          user_id: user.user.id,
          character_id: character.id,
          time_awareness_enabled: timeAwarenessValue,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,character_id'
        });

      if (settingsError) {
        console.error('❌ Failed to set time awareness for new character:', settingsError);
      } else {
        console.log('✅ Time awareness setting created successfully for new character');
      }
    }

    return character;
  } catch (error) {
    console.error('Error in createCharacter:', error);
    throw error;
  }
};

export const updateCharacter = async (characterId: string, characterData: CharacterCreationData) => {
  console.log('🔄 updateCharacter called with:', {
    characterId,
    title_field: characterData.title,
    title_defined: characterData.title !== undefined,
    title_truthy: !!characterData.title,
    characterData: JSON.stringify(characterData, null, 2)
  });

  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // Update character record
    const characterUpdate: TablesUpdate<'characters'> = {
      name: characterData.name,
      short_description: characterData.description,
      avatar_url: characterData.avatar,
      tagline: characterData.title || '',
      visibility: characterData.visibility
    } as any;

    console.log('📝 Sending character update to database:', {
      ...characterUpdate,
      debug_title_mapping: {
        form_title: characterData.title,
        will_become_tagline: characterUpdate.tagline
      }
    });

    const { data: character, error: characterError } = await supabase
      .from('characters')
      .update(characterUpdate)
      .eq('id', characterId)
      .eq('creator_id', user.user.id) // Ensure user owns the character
      .select()
      .single();

    if (characterError) {
      console.error('❌ Database character update error:', characterError);
      throw new Error(`Failed to update character: ${characterError.message}`);
    }
    
    if (!character) {
      console.error('❌ No character returned after update');
      throw new Error('Character update returned no data');
    }

    console.log('✅ Character record updated successfully:', {
      id: character.id,
      name: character.name,
      tagline: character.tagline,
      short_description: character.short_description,
      visibility: character.visibility,
      avatar_url: character.avatar_url
    });

    // ✅ FIX: Handle time awareness setting update
    if (characterData.time_awareness_enabled !== undefined) {
      const timeAwarenessValue = characterData.time_awareness_enabled;
      
      console.log('⏰ Updating time awareness setting:', {
        characterId,
        userId: user.user.id,
        time_awareness_enabled: timeAwarenessValue,
        value_type: typeof timeAwarenessValue
      });

      // Update or insert user character settings for time awareness
      const { error: settingsError } = await supabase
        .from('user_character_settings')
        .upsert({
          user_id: user.user.id,
          character_id: characterId,
          time_awareness_enabled: timeAwarenessValue,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,character_id'
        });

      if (settingsError) {
        console.error('❌ Failed to update time awareness setting:', settingsError);
      } else {
        console.log('✅ Time awareness setting updated successfully');
      }
    }

    // Process example dialogues to ensure they're in the correct format
    const processedDialogue = {
      ...characterData.dialogue,
      example_dialogues: characterData.dialogue.example_dialogues.map(dialogue => {
        // If the dialogue is a string, parse it; otherwise, keep it as is
        if (typeof dialogue === 'string') {
          return parseExampleDialogue(dialogue);
        }
        return dialogue;
      }).flat() // Flatten in case parseExampleDialogue returns an array
    };

    // Before building definition for update, decode existing summary to avoid losing unrelated keys
    let existingSummary: any = {};
    try {
      const existingDefResp: any = await supabase
        .from('character_definitions')
        .select('personality_summary, initial_addon_context_enabled, initial_addon_context')
        .eq('character_id', characterId)
        .maybeSingle();
      const existingDef = existingDefResp?.data || existingDefResp; // adapt to different client return shapes
      if (existingDef && typeof existingDef === 'object' && 'personality_summary' in existingDef && existingDef.personality_summary) {
        try { existingSummary = JSON.parse(existingDef.personality_summary); } catch {}
      }
    } catch (e) {
      console.warn('⚠️ Unable to load existing personality_summary for merge', e);
    }
    // Remove potential stale inline keys to prevent confusion
    delete existingSummary.initial_addon_context_enabled;
    delete existingSummary.initial_addon_context;

    // Update character definition
    const definition: any = {
      ...existingSummary,
      personality: characterData.personality,
      dialogue: processedDialogue,
      title: characterData.title
    };

    // Include version and notes when provided
    if (characterData.version) {
      definition.version = characterData.version;
    }
    if (characterData.notes) {
      definition.notes = {
        character_notes: characterData.notes.character_notes || '',
        creator_notes: characterData.notes.creator_notes || ''
      };
    }

    // Only include addons if any are enabled (master switch is ON)
    const hasEnabledAddons = characterData.addons && Object.values(characterData.addons).some(value => value === true);
    if (hasEnabledAddons) {
      definition.addons = characterData.addons;
    }

    // Persist manual initial addon context if enabled
    if (characterData.manual_addon_context_enabled && characterData.manual_addon_context) {
      definition.initial_addon_context_enabled = true;
      definition.initial_addon_context = characterData.manual_addon_context;
    } else if (characterData.manual_addon_context_enabled === false) {
      definition.initial_addon_context_enabled = false;
      definition.initial_addon_context = null;
    }

    // Sanitize manual addon context (update)
    const cleanedManualContextUpdate = characterData.manual_addon_context ? Object.fromEntries(
      Object.entries(characterData.manual_addon_context).filter(([_,v]) => typeof v === 'string' && v.trim())
    ) : {};
    const enableInitialAddon = !!characterData.manual_addon_context_enabled;
    console.log('🧪 [update] Manual addon context incoming:', {
      raw_enabled: characterData.manual_addon_context_enabled,
      raw_context: characterData.manual_addon_context,
      cleaned: cleanedManualContextUpdate,
      enableInitialAddon
    });

    console.log('🧪 Initial addon context payload about to persist:', {
      manual_enabled_flag: characterData.manual_addon_context_enabled,
      manual_context_object: characterData.manual_addon_context,
      keys: characterData.manual_addon_context ? Object.keys(characterData.manual_addon_context) : [],
      will_enable: !!(characterData.manual_addon_context_enabled && characterData.manual_addon_context && Object.keys(characterData.manual_addon_context).length > 0)
    });

    let defUpdate = {
      personality_summary: JSON.stringify(definition),
      greeting: characterData.dialogue.greeting,
      description: characterData.personality.core_personality,
      scenario: characterData.personality.scenario_definition || null,
      initial_addon_context_enabled: !!(enableInitialAddon && Object.keys(cleanedManualContextUpdate).length > 0),
      initial_addon_context: (enableInitialAddon && Object.keys(cleanedManualContextUpdate).length > 0) ? cleanedManualContextUpdate : null
    } as any;
    console.log('🧪 [update] defUpdate payload:', defUpdate);

    const { data: defAfterUpdate, error: definitionError } = await supabase
      .from('character_definitions')
      .update(defUpdate)
      .eq('character_id', characterId)
      .select('character_id, initial_addon_context_enabled, initial_addon_context');
    const defCount = defAfterUpdate ? defAfterUpdate.length : 0;

    if (definitionError) {
      console.error('❌ Error updating character definition (will attempt insert fallback):', definitionError);
    }

    if ((!defAfterUpdate || defAfterUpdate.length === 0) && !definitionError) {
      console.warn('⚠️ No definition row updated (count=0) — attempting insert fallback');
      const { error: insertFallbackErr, data: insertedDef } = await supabase
        .from('character_definitions')
        .insert({
          character_id: characterId,
          ...defUpdate
        })
        .select('character_id, initial_addon_context_enabled, initial_addon_context')
        .single();
      if (insertFallbackErr) {
        console.error('💥 Fallback insert failed:', insertFallbackErr);
        throw new Error(`Failed to persist character definition: ${insertFallbackErr.message}`);
      } else {
        console.log('✅ Fallback insert succeeded:', insertedDef);
      }
    } else if (defAfterUpdate && defAfterUpdate.length > 0) {
      console.log('✅ Definition update result:', defAfterUpdate[0]);
    }

    console.log('✅ Character definition updated successfully');

    // Update character tags
    // First, delete all existing tags for this character
    console.log('🏷️ Updating character tags for character:', characterId);
    
    const { error: deleteTagsError } = await supabase
      .from('character_tags')
      .delete()
      .eq('character_id', characterId);

    if (deleteTagsError) {
      console.error('❌ Error deleting existing tags:', deleteTagsError);
    } else {
      console.log('✅ Existing tags deleted successfully');
    }

    // Then, save new character tags if any are selected
    if (characterData.personality.tags && characterData.personality.tags.length > 0) {
      console.log('🔄 Adding new tags:', characterData.personality.tags);
      
      // Get tag IDs from tag names
      const { data: tagData, error: tagError } = await supabase
        .from('tags')
        .select('id, name')
        .in('name', characterData.personality.tags);

      if (tagError) {
        console.error('❌ Error fetching tag IDs:', tagError);
      } else if (tagData) {
        console.log('✅ Found matching tags:', tagData);
        
        // Insert character_tags relationships
        const characterTagInserts = tagData.map(tag => ({
          character_id: characterId,
          tag_id: tag.id
        }));

        const { error: characterTagsError } = await supabase
          .from('character_tags')
          .insert(characterTagInserts);

        if (characterTagsError) {
          console.error('❌ Error updating character tags:', characterTagsError);
        } else {
          console.log('✅ Character tags updated successfully');
        }
      }
    } else {
      console.log('📝 No tags to add for this character');
    }

    console.log('✅ Character update completed successfully:', character);
    return character;
  } catch (error) {
    console.error('❌ Error in updateCharacter:', error);
    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`Character update failed: ${error.message}`);
    }
    throw new Error('Character update failed with unknown error');
  }
};
