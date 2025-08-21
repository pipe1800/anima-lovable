import { callEdgeFunction } from './core/client';

export interface ExtractAddonContextArgs {
  chatId: string;
  characterId?: string | null;
  addonSettings: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  mode?: 'initial' | 'update';
}

export interface ExtractAddonContextResponse {
  context?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  updates?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  message?: string;
}

export function extractAddonContext(args: ExtractAddonContextArgs) {
  const { chatId, characterId, addonSettings, mode } = args;
  return callEdgeFunction<ExtractAddonContextResponse>('extract-addon-context', {
    chat_id: chatId,
    character_id: characterId,
    addon_settings: addonSettings,
    mode: mode || 'update'
  });
}

export default extractAddonContext;
