-- Phase 3: Prepare for semantic retrieval (pgvector + columns)

-- 1) Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Add embeddings column (1536 dims default; adjust to model used)
DO $$ BEGIN
  ALTER TABLE public.character_memories
    ADD COLUMN IF NOT EXISTS embedding vector(1536);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Add embedding column skipped: %', SQLERRM;
END $$;

-- 3) Create IVFFlat index for faster ANN search (requires lists param)
-- Note: index cannot be created until at least one row exists; wrap in DO block
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_character_memories_embedding
    ON public.character_memories USING ivfflat (embedding vector_cosine) WITH (lists = 100);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'idx_character_memories_embedding skipped: %', SQLERRM;
END $$;

-- 4) Helper function to upsert embedding (optional RPC could call this from server)
-- Skipped in this migration; embeddings will be computed app-side for now.
