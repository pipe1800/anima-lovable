export interface CharacterCardData {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  greeting?: string;
  example_dialogue?: string;
  tags?: string[];
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  character_book?: any;
  extensions?: any;
  spec?: string;
  spec_version?: string;
  data?: any;
  // Tavern format
  char_name?: string;
  char_persona?: string;
  world_scenario?: string;
  char_greeting?: string;
  example_dialogues?: Array<{ user: string; character: string }>;
  // SillyTavern format
  avatar?: string;
  chat?: string;
  create_date?: string;
  talkativeness?: string;
  fav?: boolean;
  [key: string]: any;
}

/**
 * Normalizes character data from various formats
 */
function normalizeCharacterData(data: any): CharacterCardData {
  const normalized: CharacterCardData = {};

  // Name - try multiple fields
  normalized.name = data.name || data.char_name || data.data?.name || '';

  // Description - this should be a short tagline
  normalized.description = data.description || data.data?.description || '';

  // Personality - this is the main character definition
  normalized.personality = data.personality || data.char_persona || data.data?.personality || '';

  // Scenario
  normalized.scenario = data.scenario || data.world_scenario || data.data?.scenario || '';

  // Greeting/First Message
  normalized.greeting = data.first_mes || data.greeting || data.char_greeting || 
                       data.data?.first_mes || data.data?.greeting || '';

  // Example dialogue - handle various formats
  const exampleDialogue = data.mes_example || data.example_dialogue || data.example_messages ||
                         data.data?.mes_example || data.data?.example_dialogue || '';
  
  normalized.mes_example = exampleDialogue;

  // Tags
  if (data.tags || data.data?.tags) {
    normalized.tags = Array.isArray(data.tags) ? data.tags : 
                     Array.isArray(data.data?.tags) ? data.data.tags : [];
  }

  // Additional fields that might be useful
  normalized.creator_notes = data.creator_notes || data.data?.creator_notes || '';
  normalized.system_prompt = data.system_prompt || data.data?.system_prompt || '';
  normalized.post_history_instructions = data.post_history_instructions || data.data?.post_history_instructions || '';
  normalized.alternate_greetings = data.alternate_greetings || data.data?.alternate_greetings || [];

  return normalized;
}

/**
 * Parses PNG chunks to find text data
 * @param buffer - The PNG file as ArrayBuffer
 * @returns Object containing text chunks
 */
function parsePNGChunks(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let offset = 8; // Skip PNG signature
  const chunks: { [key: string]: string } = {};

  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset);
    const type = new TextDecoder('utf-8').decode(buffer.slice(offset + 4, offset + 8));
    const data = buffer.slice(offset + 8, offset + 8 + length);
    
    if (type === 'tEXt') {
      const textData = new Uint8Array(data);
      const nullIndex = textData.findIndex(byte => byte === 0);
      if (nullIndex !== -1) {
        const keyword = new TextDecoder('utf-8').decode(textData.slice(0, nullIndex));
        const text = new TextDecoder('utf-8').decode(textData.slice(nullIndex + 1));
        chunks[keyword] = text;
      }
    }
    
    offset += 12 + length; // length + type + data + crc
  }
  
  return chunks;
}

/**
 * Parses a PNG character card file to extract embedded character data
 * @param file - The PNG file containing character card data
 * @returns Promise<CharacterCardData | null> - The parsed character data or null if parsing fails
 */
export async function parseCharacterCard(file: File): Promise<CharacterCardData | null> {
  try {
    // Validate file type
    if (!file.type.includes('png')) {
      console.error('File must be a PNG image');
      return null;
    }

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Parse PNG chunks
    const chunks = parsePNGChunks(arrayBuffer);
    
    // Look for character data in various chunk names
    let characterDataText: string | null = null;
    const possibleChunkNames = ['chara', 'character', 'ccv3', 'tavern', 'silly'];
    
    for (const chunkName of possibleChunkNames) {
      if (chunks[chunkName]) {
        characterDataText = chunks[chunkName];
        console.log(`Found character data in chunk: ${chunkName}`);
        break;
      }
    }

    if (!characterDataText) {
      console.error('No character data found in PNG file. Searched chunks:', Object.keys(chunks));
      return null;
    }

    // First attempt: try to decode from Base64
    let decodedData: string | null = null;
    try {
      decodedData = atob(characterDataText);
    } catch (base64Error) {
      console.log('Base64 decoding failed, trying plain text JSON...');
      decodedData = characterDataText;
    }

    // Parse the JSON
    let characterData: any;
    try {
      characterData = JSON.parse(decodedData);
    } catch (jsonError) {
      console.error('Failed to parse character data as JSON:', jsonError);
      return null;
    }

    // Normalize the data regardless of format
    let normalizedData: CharacterCardData;
    
    // Check if this is a V2 character card with nested data
    if (characterData.spec === 'chara_card_v2' && characterData.data) {
      normalizedData = normalizeCharacterData(characterData.data);
    } else {
      normalizedData = normalizeCharacterData(characterData);
    }

    // Parse example dialogues if they exist
    if (normalizedData.mes_example && typeof normalizedData.mes_example === 'string') {
      normalizedData.example_dialogues = parseExampleDialogue(normalizedData.mes_example);
    }

    console.log('Successfully parsed and normalized character data:', normalizedData);
    return normalizedData;

  } catch (error) {
    console.error("Unexpected error while parsing character card:", error);
    return null;
  }
}

/**
 * Parses raw example dialogue string into structured array
 * Handles multiple formats including {{user}}/{{char}}, <START>, etc.
 */
export function parseExampleDialogue(dialogueString: string | undefined): Array<{ user: string; character: string }> {
  if (!dialogueString || typeof dialogueString !== 'string') return [];

  const dialogues: Array<{ user: string; character: string }> = [];
  
  // Remove <START> tags and normalize line breaks
  const cleanedString = dialogueString
    .replace(/<START>/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  // Split by double newlines or <START> to get conversation blocks
  const blocks = cleanedString.split(/\n\n+/).filter(block => block.trim());

  let currentUser = '';
  let currentChar = '';

  for (const block of blocks) {
    const lines = block.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      // Check for {{user}}: or similar patterns
      if (line.match(/^(\{\{user\}\}|User|You):/i)) {
        if (currentUser && currentChar) {
          dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
          currentChar = '';
        }
        currentUser = line.replace(/^(\{\{user\}\}|User|You):/i, '').trim();
      }
      // Check for {{char}}: or character name patterns
      else if (line.match(/^(\{\{char\}\}|Character|[A-Z][a-zA-Z]+):/)) {
        currentChar = line.replace(/^(\{\{char\}\}|Character|[A-Z][a-zA-Z]+):/, '').trim();
      }
      // If no clear pattern, try to determine based on context
      else if (line.trim()) {
        // If we have a user message but no character response yet
        if (currentUser && !currentChar) {
          currentChar = line.trim();
        }
        // Otherwise, start a new dialogue pair
        else if (currentChar) {
          dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
          currentUser = line.trim();
          currentChar = '';
        }
      }
    }
  }

  // Add any remaining dialogue
  if (currentUser && currentChar) {
    dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
  }

  // If no structured dialogues found, try simple alternating pattern
  if (dialogues.length === 0 && blocks.length >= 2) {
    for (let i = 0; i < blocks.length - 1; i += 2) {
      dialogues.push({
        user: blocks[i].trim(),
        character: blocks[i + 1]?.trim() || ''
      });
    }
  }

  return dialogues;
}