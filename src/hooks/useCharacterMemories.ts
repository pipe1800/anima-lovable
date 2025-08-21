import { useState, useEffect } from 'react';
import { getCharacterMemories } from '@/data/edge';

export interface CharacterMemory {
  id: string;
  chat_id: string;
  name: string; // Added for auto-summary titles
  summary_content: string;
  trigger_keywords: string[];
  message_count: number;
  input_token_cost: number;
  is_auto_summary: boolean; // Added to identify auto-summaries
  created_at: string;
  updated_at: string;
}

export const useCharacterMemories = (characterId: string | null, userId: string | null) => {
  const [memories, setMemories] = useState<CharacterMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMemories = async () => {
    if (!characterId || !userId) {
      setMemories([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🧠 Fetching memories for character:', characterId);

      const { data, error } = await getCharacterMemories({ characterId, userId });

      if (error) {
        console.error('❌ Error fetching memories:', error);
        setError(error.message || 'Failed to fetch memories');
        return;
      }

      if (!data?.success) {
        console.error('❌ Failed to fetch memories:', data?.error);
        setError(data?.error || 'Failed to fetch memories');
        return;
      }

      setMemories(data?.data || []);
    } catch (err) {
      console.error('❌ Unexpected error fetching memories:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch memories');
    } finally {
      setLoading(false);
    }
  };

  const refreshMemories = () => {
    fetchMemories();
  };

  useEffect(() => {
    fetchMemories();
  }, [characterId, userId]);

  return {
    memories,
    loading,
    error,
    refreshMemories,
    fetchMemories, // expose for opening-time fetch
  };
};
