export interface CharacterCardData {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  [key: string]: any;
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
    
    // Look for character data - first try 'chara', then 'character'
    let characterDataText: string | null = null;
    if (chunks.chara) {
      characterDataText = chunks.chara;
    } else if (chunks.character) {
      characterDataText = chunks.character;
    } else {
      console.error('No character data found in PNG file. No "chara" or "character" tEXt chunks found.');
      return null;
    }

    // First attempt: try to decode from Base64
    let decodedData: string | null = null;
    try {
      decodedData = atob(characterDataText);
    } catch (base64Error) {
      console.log('Base64 decoding failed, trying plain text JSON...');
      // Second attempt: try to parse as plain text JSON
      decodedData = characterDataText;
    }

    // Parse the JSON
    let characterData: CharacterCardData;
    try {
      characterData = JSON.parse(decodedData);
    } catch (jsonError) {
      console.error('Failed to parse character data as JSON from both Base64 and plain text:', jsonError);
      return null;
    }

    // Validate that we have some essential character data
    if (!characterData || typeof characterData !== 'object') {
      console.error('Invalid character data format.');
      return null;
    }

    // Check if this is a V2 character card
    let finalCharacterData: CharacterCardData;
    if (characterData.spec === 'chara_card_v2' && characterData.data) {
      finalCharacterData = characterData.data;
    } else {
      // V1 format - use the entire object
      finalCharacterData = characterData;
    }

    // Check if example_dialogue exists and is a string, then parse it
    if (finalCharacterData.example_dialogue && typeof finalCharacterData.example_dialogue === 'string') {
      finalCharacterData.example_dialogue = parseExampleDialogue(finalCharacterData.example_dialogue);
    }

    console.log('Successfully parsed character data:', finalCharacterData);
    return finalCharacterData;

  } catch (error) {
    console.error("Unexpected error while parsing character card:", error);
    return null;
  }
}

/**
 * Parses raw example dialogue string into structured array
 * @param dialogueString - The raw example dialogue string from character card
 * @returns Array of dialogue objects with user and character keys
 */
export function parseExampleDialogue(dialogueString: string | undefined): Array<{ user: string; character: string }> {
  if (!dialogueString || typeof dialogueString !== 'string') {
    return [];
  }

  const lines = dialogueString.split('\n').filter(line => line.trim() !== '' && !line.trim().toUpperCase().includes('START'));
  
  const pairs: Array<{ user: string; character: string }> = [];
  let currentUserMessage = '';

  for (const line of lines) {
    if (line.includes('{{user}}:')) {
      // If we have a pending user message, it means the last turn was just a user message.
      // So we pair it with an empty character response.
      if (currentUserMessage) {
        pairs.push({ user: currentUserMessage, character: '' });
      }
      currentUserMessage = line.replace('{{user}}:', '').trim();
    } else if (line.includes('{{char}}:')) {
      // If we have a pending user message, we can form a complete pair.
      if (currentUserMessage) {
        pairs.push({
          user: currentUserMessage,
          character: line.replace('{{char}}:', '').trim()
        });
        currentUserMessage = ''; // Reset for the next turn
      }
    }
  }

  // If there's a leftover user message at the end, add it with an empty character response.
  if (currentUserMessage) {
    pairs.push({ user: currentUserMessage, character: '' });
  }

  return pairs;
}