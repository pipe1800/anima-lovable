export type ChatOperation = 'create-basic' | 'create-with-greeting' | 'extract-context' | 'send-message' | 'create-memory';

export interface BaseChatRequest {
  operation: ChatOperation;
  charactersData: Array<{
    id: string;
    name: string;
    description?: string;
    image_url?: string;
    scenario?: string;
    example_conversations?: string;
    voice_id?: string;
    creator_notes?: string;
    creator_id?: string;
    is_nsfw?: boolean;
    personality?: string;
    first_message?: string;
    message_example?: string;
    context?: string;
    scenario_context?: string;
  }>;
  worldInfos?: Array<{
    id: string;
    name: string;
    content: string;
    keywords: string[];
  }>;
}

export interface CreateBasicChatRequest extends BaseChatRequest {
  operation: 'create-basic';
  selectedPersonaId?: string | null;
}

export interface CreateWithGreetingRequest extends BaseChatRequest {
  operation: 'create-with-greeting';
  greeting?: string;
  selectedPersonaId?: string | null;
  chatMode?: 'storytelling' | 'companion';
}

export interface ExtractContextRequest {
  operation: 'extract-context';
  chatId: string;
  charactersData: Array<{
    id: string;
    name: string;
    description?: string;
    context?: string;
    scenario?: string;
    personality?: string;
    first_message?: string;
    message_example?: string;
    example_conversations?: string;
  }>;
  worldInfos?: Array<{
    id: string;
    name: string;
    content: string;
    keywords: string[];
  }>;
}

export interface SendMessageRequest {
  operation: 'send-message';
  chatId: string;
  message: string;
  characterId: string;
  selectedPersonaId?: string | null;
  selectedWorldInfoId?: string | null;
  addonSettings?: any;
}

export interface CreateMemoryRequest {
  operation: 'create-memory';
  chatId: string;
  characterId: string;
}

export type ChatManagementRequest = CreateBasicChatRequest | CreateWithGreetingRequest | ExtractContextRequest | SendMessageRequest | CreateMemoryRequest;

export interface ChatResponse {
  success: boolean;
  data?: any;
  error?: string;
  chat_id?: string;
  greeting?: string;
  context?: string;
}
