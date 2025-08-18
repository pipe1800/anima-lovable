import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase, SUPABASE_API_URL } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/chatQueries';

interface BootstrapData {
  profile: any | null;
  globalSettings: any | null;
  character: any | null;
  selectedPersona: any | null;
  personas: any[];
  chatId: string | null;
  characterId: string | null;
  messages: any[];
  context: any;
  latestAutoSummary: any | null;
  creditsBalance: number;
  now: string;
  featureFlags: { debugPanel: boolean };
  userCharacterSettings?: any | null;
}

interface ChatBootstrapContextValue extends BootstrapData {
  loading: boolean;
  error: string | null;
  hydrated: boolean;
  refresh: () => Promise<void>;
}

const ChatBootstrapContext = createContext<ChatBootstrapContextValue | undefined>(undefined);

export const useChatBootstrap = () => {
  const ctx = useContext(ChatBootstrapContext);
  if (!ctx) throw new Error('useChatBootstrap must be used within ChatBootstrapProvider');
  return ctx;
};

export const useOptionalChatBootstrap = () => useContext(ChatBootstrapContext);

interface ProviderProps {
  chatId?: string;
  characterId?: string;
  children: React.ReactNode;
  enable: boolean; // allow toggling while migrating
  includeMessages?: boolean;
  messageLimit?: number;
}

export const ChatBootstrapProvider: React.FC<ProviderProps> = ({ chatId, characterId, children, enable, includeMessages = true, messageLimit = 30 }) => {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState<boolean>(enable);
  const [error, setError] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const qc = useQueryClient();

  const seedCaches = useCallback((payload: BootstrapData) => {
    if (hydratedRef.current) return;
    const cid = payload.chatId || chatId;
    // Seed messages
    if (payload.messages && cid) {
      qc.setQueryData(queryKeys.chat.messages(cid), {
        pages: [{ messages: payload.messages.map((m, idx) => ({
          id: m.id || m.message_id || `bootstrap-${idx}`,
          ...m,
          isUser: m.is_ai_message ? false : (m.isUser ?? !m.is_ai_message),
          timestamp: (() => { const raw = m.created_at || m.timestamp; try { return raw ? new Date(raw) : new Date(); } catch { return new Date(); } })()
        })), hasMore: payload.messages.length === messageLimit, oldestMessageOrder: payload.messages[0]?.message_order || null }],
        pageParams: [undefined]
      });
    }
    if (payload.creditsBalance !== undefined && payload.profile?.id) {
      qc.setQueryData(queryKeys.user.credits(payload.profile.id), payload.creditsBalance);
    }
    // Global settings cache
    if (payload.globalSettings && payload.profile?.id) {
      qc.setQueryData(['globalChatSettings', payload.profile.id], payload.globalSettings);
    }
    if (payload.character?.id) {
      qc.setQueryData(queryKeys.character.details(payload.character.id), { data: payload.character });
    }
    if (payload.userCharacterSettings?.character_id && payload.profile?.id) {
      qc.setQueryData(['user','character-settings', payload.profile.id, payload.userCharacterSettings.character_id], payload.userCharacterSettings);
    }
    if (payload.context && cid) {
      qc.setQueryData(queryKeys.chat.context(cid, payload.characterId || ''), payload.context);
    }
    // Personas
    if (payload.profile?.id && Array.isArray(payload.personas)) {
      qc.setQueryData(queryKeys.personas.list(payload.profile.id), payload.personas);
      payload.personas.forEach(p => {
        if (p?.id) qc.setQueryData(queryKeys.personas.byId(p.id), p);
      });
      if (payload.selectedPersona?.id) {
        qc.setQueryData(queryKeys.personas.byId(payload.selectedPersona.id), payload.selectedPersona);
      }
    }
    hydratedRef.current = true;
  }, [qc, messageLimit, chatId]);

  const fetchBootstrap = useCallback(async () => {
    if (!enable) return;
    setLoading(true); setError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) throw new Error('Auth');
      const token = sessionData.session.access_token;
      const resp = await fetch(`${SUPABASE_API_URL}/functions/v1/chat-management`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ operation: 'bootstrap', chatId, characterId, includeMessages, messageLimit })
      });
      if (!resp.ok) throw new Error(`Bootstrap failed ${resp.status}`);
      const json = await resp.json();
      setData(json);
      seedCaches(json);
    } catch (e: any) {
      setError(e.message || 'Bootstrap failed');
    } finally {
      setLoading(false);
    }
  }, [chatId, characterId, enable, includeMessages, messageLimit, seedCaches]);

  useEffect(() => { fetchBootstrap(); }, [fetchBootstrap]);

  return (
    <ChatBootstrapContext.Provider value={{
      profile: data?.profile || null,
      globalSettings: data?.globalSettings || null,
      character: data?.character || null,
      selectedPersona: data?.selectedPersona || null,
      personas: data?.personas || [],
      chatId: data?.chatId || null,
      characterId: data?.characterId || null,
      messages: data?.messages || [],
      context: data?.context || {},
      latestAutoSummary: data?.latestAutoSummary || null,
      creditsBalance: data?.creditsBalance || 0,
      now: data?.now || new Date().toISOString(),
      featureFlags: data?.featureFlags || { debugPanel: false },
      loading,
      error,
      hydrated: hydratedRef.current,
      refresh: fetchBootstrap,
      userCharacterSettings: data?.userCharacterSettings || null,
    }}>
      {children}
    </ChatBootstrapContext.Provider>
  );
};
