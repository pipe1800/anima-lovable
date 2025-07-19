export type ChatOperation = 'create-basic' | 'create-with-greeting' | 'extract-context';

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
}

export interface CreateWithGreetingRequest extends BaseChatRequest {
  operation: 'create-with-greeting';
  greeting?: string;
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

export type ChatManagementRequest = CreateBasicChatRequest | CreateWithGreetingRequest | ExtractContextRequest;

export interface ChatResponse {
  success: boolean;
  data?: any;
  error?: string;
  chat_id?: string;
  greeting?: string;
  context?: string;
}
