
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { parseExampleDialogue } from '@/lib/utils/characterCard';

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
    };

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

    // Only include addons if any are enabled (master switch is ON)
    const hasEnabledAddons = characterData.addons && Object.values(characterData.addons).some(value => value === true);
    if (hasEnabledAddons) {
      definition.addons = characterData.addons;
    }

    const { error: definitionError } = await supabase
      .from('character_definitions')
      .insert({
        character_id: character.id,
        personality_summary: JSON.stringify(definition),
        greeting: characterData.dialogue.greeting,
        description: characterData.personality.core_personality,
        scenario: characterData.personality.scenario_definition || null
      });

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

    return character;
  } catch (error) {
    console.error('Error in createCharacter:', error);
    throw error;
  }
};

export const updateCharacter = async (characterId: string, characterData: CharacterCreationData) => {
  console.log('🔄 updateCharacter called with:', {
    characterId,
    characterData: JSON.stringify(characterData, null, 2)
  });

  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    // Update character record
    const characterUpdate: TablesUpdate<'characters'> = {
      name: characterData.name,
      short_description: characterData.description, // ✅ Map description to short_description
      avatar_url: characterData.avatar,
      tagline: characterData.title, // ✅ Map title to tagline
      visibility: characterData.visibility
    };

    console.log('📝 Sending character update to database:', characterUpdate);

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

    console.log('✅ Character record updated successfully:', character);

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

    // Update character definition
    const definition: any = {
      personality: characterData.personality,
      dialogue: processedDialogue,
      title: characterData.title
    };

    // Only include addons if any are enabled (master switch is ON)
    const hasEnabledAddons = characterData.addons && Object.values(characterData.addons).some(value => value === true);
    if (hasEnabledAddons) {
      definition.addons = characterData.addons;
    }

    console.log('📝 Updating character definition with:', {
      characterId,
      definition: JSON.stringify(definition, null, 2)
    });

    const { error: definitionError } = await supabase
      .from('character_definitions')
      .update({
        personality_summary: JSON.stringify(definition),
        greeting: characterData.dialogue.greeting,
        description: characterData.personality.core_personality,
        scenario: characterData.personality.scenario_definition || null
      })
      .eq('character_id', characterId);

    if (definitionError) {
      console.error('❌ Error updating character definition:', definitionError);
      throw new Error(`Failed to update character definition: ${definitionError.message}`);
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
