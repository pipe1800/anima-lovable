BEGIN;

-- ------------------------------------------------------------------
-- 0. Drop dependent views/functions/triggers that reference legacy tables
-- ------------------------------------------------------------------
DROP VIEW IF EXISTS public.character_profile_view;

DROP TRIGGER IF EXISTS trg_characters_likes_count ON public.character_likes;
DROP TRIGGER IF EXISTS trg_characters_favorites_count ON public.character_favorites;
DROP TRIGGER IF EXISTS trg_world_infos_likes_count ON public.world_info_user_likes;

DROP POLICY IF EXISTS characters_delete ON public.characters;
DROP POLICY IF EXISTS characters_insert ON public.characters;
DROP POLICY IF EXISTS characters_select ON public.characters;
DROP POLICY IF EXISTS characters_update ON public.characters;
DROP POLICY IF EXISTS character_def_select ON public.character_definitions;
DROP POLICY IF EXISTS character_tags_select ON public.character_tags;
DROP POLICY IF EXISTS world_infos_select ON public.world_infos;

DROP FUNCTION IF EXISTS public.list_public_world_infos(text, text, integer, integer, boolean, integer[]);
DROP FUNCTION IF EXISTS public.list_user_world_infos();
DROP FUNCTION IF EXISTS public.list_user_world_infos(uuid);
DROP FUNCTION IF EXISTS public.user_world_infos_list();
DROP FUNCTION IF EXISTS public.fetch_world_info_full(uuid);
DROP FUNCTION IF EXISTS public.mark_memories_injected(uuid[]);
DROP FUNCTION IF EXISTS public.delete_chat_complete(uuid, uuid);
DROP FUNCTION IF EXISTS public.delete_private_character(uuid);
DROP FUNCTION IF EXISTS public.get_chat_bootstrap_snapshot(uuid, uuid, uuid, boolean, integer);
DROP FUNCTION IF EXISTS public.get_chat_snapshot(uuid, uuid, uuid, integer, integer);

DROP FUNCTION IF EXISTS public.tg_characters_likes_count();
DROP FUNCTION IF EXISTS public.tg_characters_favorites_count();
DROP FUNCTION IF EXISTS public.tg_world_infos_likes_count();

-- ------------------------------------------------------------------
-- 1. Ensure tables that might be left from a failed prior attempt are gone
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS public.knowledge_embeddings CASCADE;
DROP TABLE IF EXISTS public.knowledge_chunks CASCADE;
DROP TABLE IF EXISTS public.knowledge_entries CASCADE;
DROP TABLE IF EXISTS public.knowledge_spaces CASCADE;
DROP TABLE IF EXISTS public.embedding_models CASCADE;
DROP TABLE IF EXISTS public.knowledge_links CASCADE;
DROP TABLE IF EXISTS public.tag_assignments CASCADE;
DROP TABLE IF EXISTS public.user_reactions CASCADE;
DROP TABLE IF EXISTS public.context_links CASCADE;

-- ------------------------------------------------------------------
-- 2. Replace legacy CHECK constraints with enums
-- ------------------------------------------------------------------
ALTER TABLE public.characters DROP CONSTRAINT IF EXISTS characters_visibility_check;
ALTER TABLE public.world_infos DROP CONSTRAINT IF EXISTS world_infos_visibility_check;
ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_chat_mode_check;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'visibility_enum') THEN
    CREATE TYPE public.visibility_enum AS ENUM ('public','unlisted','private');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'chat_mode_enum') THEN
    CREATE TYPE public.chat_mode_enum AS ENUM ('storytelling','companion');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'knowledge_scope') THEN
    CREATE TYPE public.knowledge_scope AS ENUM ('global','world','character','chat','user');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'knowledge_entry_type') THEN
    CREATE TYPE public.knowledge_entry_type AS ENUM ('world_fact','memory','summary','trait','rule','timeline','note');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'knowledge_link_target') THEN
    CREATE TYPE public.knowledge_link_target AS ENUM ('character','world','chat','persona','user','knowledge_entry','knowledge_space');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'embedding_status') THEN
    CREATE TYPE public.embedding_status AS ENUM ('pending','queued','processing','ready','failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'tag_target_type') THEN
    CREATE TYPE public.tag_target_type AS ENUM ('character','world','knowledge_space','knowledge_entry','persona','chat');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'reaction_target_type') THEN
    CREATE TYPE public.reaction_target_type AS ENUM ('character','world','knowledge_entry','chat','message','knowledge_space');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'reaction_type_enum') THEN
    CREATE TYPE public.reaction_type_enum AS ENUM ('like','favorite','bookmark','upvote','downvote');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'context_link_scope') THEN
    CREATE TYPE public.context_link_scope AS ENUM ('default','user_override','chat_session');
  END IF;
END
$$;

ALTER TABLE public.characters
  ALTER COLUMN visibility DROP DEFAULT,
  ALTER COLUMN visibility TYPE public.visibility_enum USING visibility::public.visibility_enum,
  ALTER COLUMN visibility SET DEFAULT 'private';

ALTER TABLE public.world_infos
  ALTER COLUMN visibility DROP DEFAULT,
  ALTER COLUMN visibility TYPE public.visibility_enum USING visibility::public.visibility_enum,
  ALTER COLUMN visibility SET DEFAULT 'private';

ALTER TABLE public.chats
  ALTER COLUMN chat_mode DROP DEFAULT,
  ALTER COLUMN chat_mode TYPE public.chat_mode_enum USING chat_mode::public.chat_mode_enum,
  ALTER COLUMN chat_mode SET DEFAULT 'storytelling';

CREATE POLICY characters_delete ON public.characters
  FOR DELETE USING ((creator_id = (SELECT auth.uid() AS uid)));

CREATE POLICY characters_insert ON public.characters
  FOR INSERT WITH CHECK ((creator_id = (SELECT auth.uid() AS uid)));

CREATE POLICY characters_select ON public.characters
  FOR SELECT USING (((visibility = 'public'::public.visibility_enum) OR (creator_id = (SELECT auth.uid() AS uid))));

CREATE POLICY characters_update ON public.characters
  FOR UPDATE USING ((creator_id = (SELECT auth.uid() AS uid)))
  WITH CHECK ((creator_id = (SELECT auth.uid() AS uid)));

CREATE POLICY character_def_select ON public.character_definitions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.characters c
      WHERE c.id = character_definitions.character_id
        AND (c.visibility = 'public'::public.visibility_enum OR c.creator_id = (SELECT auth.uid() AS uid))
    )
  );

CREATE POLICY character_tags_select ON public.character_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.characters c
      WHERE c.id = character_tags.character_id
        AND (c.visibility = 'public'::public.visibility_enum OR c.creator_id = (SELECT auth.uid() AS uid))
    )
  );

CREATE POLICY world_infos_select ON public.world_infos
  FOR SELECT USING ((visibility = 'public'::public.visibility_enum) OR (creator_id = (SELECT auth.uid() AS uid)));

-- ------------------------------------------------------------------
-- 3. Create consolidated tables
-- ------------------------------------------------------------------
CREATE TABLE public.embedding_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_name text NOT NULL,
  dimension integer NOT NULL,
  max_tokens integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.embedding_models
  ADD CONSTRAINT embedding_models_provider_model_key UNIQUE (provider, model_name);

CREATE TABLE public.knowledge_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope public.knowledge_scope NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id uuid REFERENCES public.characters(id) ON DELETE CASCADE,
  world_info_id uuid REFERENCES public.world_infos(id) ON DELETE CASCADE,
  chat_id uuid REFERENCES public.chats(id) ON DELETE CASCADE,
  persona_id uuid REFERENCES public.personas(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  visibility public.visibility_enum NOT NULL DEFAULT 'private',
  tags text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_spaces_scope_chk CHECK (
    (scope = 'world'     AND world_info_id IS NOT NULL AND chat_id IS NULL)
 OR (scope = 'chat'      AND chat_id IS NOT NULL)
 OR (scope = 'character' AND character_id IS NOT NULL AND chat_id IS NULL)
 OR (scope = 'user'      AND chat_id IS NULL)
 OR (scope = 'global')
  )
);

CREATE UNIQUE INDEX knowledge_spaces_world_uq ON public.knowledge_spaces(world_info_id) WHERE world_info_id IS NOT NULL;
CREATE UNIQUE INDEX knowledge_spaces_chat_uq ON public.knowledge_spaces(chat_id) WHERE chat_id IS NOT NULL;
CREATE UNIQUE INDEX knowledge_spaces_owner_character_uq
  ON public.knowledge_spaces(owner_user_id, character_id, scope)
  WHERE scope = 'character';

CREATE TABLE public.knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.knowledge_spaces(id) ON DELETE CASCADE,
  entry_type public.knowledge_entry_type NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  legacy_source text,
  legacy_id uuid,
  title text,
  content text NOT NULL,
  short_summary text,
  keywords text[] NOT NULL DEFAULT '{}',
  importance smallint NOT NULL DEFAULT 0,
  message_count integer,
  ai_sequence_start integer,
  ai_sequence_end integer,
  injection_count integer NOT NULL DEFAULT 0,
  last_injected_at timestamptz,
  content_hash text,
  embedding_status public.embedding_status NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX knowledge_entries_legacy_uq
  ON public.knowledge_entries(legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;
CREATE INDEX knowledge_entries_space_idx ON public.knowledge_entries(space_id);
CREATE INDEX knowledge_entries_type_idx ON public.knowledge_entries(entry_type);
CREATE INDEX knowledge_entries_message_count_idx ON public.knowledge_entries(message_count);

CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  chunk_index smallint NOT NULL,
  content text NOT NULL,
  token_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, chunk_index)
);
CREATE INDEX knowledge_chunks_entry_idx ON public.knowledge_chunks(entry_id);

CREATE TABLE public.knowledge_embeddings (
  chunk_id uuid NOT NULL REFERENCES public.knowledge_chunks(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.embedding_models(id) ON DELETE CASCADE,
  vector public.vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, model_id)
);
CREATE INDEX knowledge_embeddings_model_idx ON public.knowledge_embeddings(model_id);

CREATE TABLE public.knowledge_links (
  entry_id uuid NOT NULL REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  target_type public.knowledge_link_target NOT NULL,
  target_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, target_type, target_id)
);

CREATE TABLE public.tag_assignments (
  id bigserial PRIMARY KEY,
  tag_id integer NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  target_type public.tag_target_type NOT NULL,
  target_id uuid NOT NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tag_assignments
  ADD CONSTRAINT tag_assignments_unique UNIQUE (tag_id, target_type, target_id);

CREATE TABLE public.user_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type public.reaction_target_type NOT NULL,
  target_id uuid NOT NULL,
  reaction_type public.reaction_type_enum NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.user_reactions
  ADD CONSTRAINT user_reactions_unique UNIQUE (user_id, target_type, target_id, reaction_type);
CREATE INDEX user_reactions_target_idx ON public.user_reactions(target_type, target_id);

CREATE TABLE public.context_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type public.knowledge_link_target NOT NULL,
  source_id uuid NOT NULL,
  scope public.context_link_scope NOT NULL,
  target_space_id uuid NOT NULL REFERENCES public.knowledge_spaces(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX context_links_unique_idx
  ON public.context_links (
    source_type,
    source_id,
    scope,
    COALESCE(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    target_space_id
  );

-- updated_at triggers
CREATE TRIGGER trg_knowledge_spaces_updated
  BEFORE UPDATE ON public.knowledge_spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_knowledge_entries_updated
  BEFORE UPDATE ON public.knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_context_links_updated
  BEFORE UPDATE ON public.context_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------
-- 4. Backfill knowledge data from legacy tables
-- ------------------------------------------------------------------

-- 4.1 World-level knowledge spaces
CREATE TEMP TABLE tmp_world_spaces(
  world_info_id uuid PRIMARY KEY,
  space_id uuid
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.knowledge_spaces (
    scope,
    owner_user_id,
    world_info_id,
    name,
    description,
    visibility,
    tags,
    metadata,
    created_at,
    updated_at
  )
  SELECT
    'world'::public.knowledge_scope,
    wi.creator_id,
    wi.id,
    wi.name,
    wi.short_description,
    wi.visibility,
    NULL,
    jsonb_build_object('legacy_world_info_id', wi.id),
    wi.created_at,
    wi.updated_at
  FROM public.world_infos wi
  RETURNING id, world_info_id
)
INSERT INTO tmp_world_spaces(world_info_id, space_id)
SELECT world_info_id, id FROM inserted;

-- 4.2 World info entries -> knowledge_entries/chunks
CREATE TEMP TABLE tmp_world_entries(
  legacy_id uuid PRIMARY KEY,
  entry_id uuid
) ON COMMIT DROP;

WITH entry_ins AS (
  INSERT INTO public.knowledge_entries (
    space_id,
    entry_type,
    author_id,
    legacy_source,
    legacy_id,
    title,
    content,
    keywords,
    importance,
    message_count,
    metadata,
    created_at,
    updated_at,
    embedding_status
  )
  SELECT
    tws.space_id,
    'world_fact'::public.knowledge_entry_type,
    wi.creator_id,
    'world_info_entries',
    wie.id,
    NULL,
    wie.entry_text,
    COALESCE(wie.keywords, '{}'::text[]),
    0,
    NULL,
    jsonb_build_object('legacy_world_info_entry_id', wie.id),
    wie.created_at,
    wie.updated_at,
    'pending'::public.embedding_status
  FROM public.world_info_entries wie
  JOIN tmp_world_spaces tws ON tws.world_info_id = wie.world_info_id
  JOIN public.world_infos wi ON wi.id = wie.world_info_id
  RETURNING id, legacy_id
)
INSERT INTO tmp_world_entries(legacy_id, entry_id)
SELECT legacy_id, id FROM entry_ins;

INSERT INTO public.knowledge_chunks (entry_id, chunk_index, content, token_count, created_at)
SELECT
  twe.entry_id,
  0,
  wie.entry_text,
  NULL,
  wie.created_at
FROM tmp_world_entries twe
JOIN public.world_info_entries wie ON wie.id = twe.legacy_id;

-- 4.3 Character/chat memories -> knowledge spaces
CREATE TEMP TABLE tmp_memory_spaces(
  user_id uuid,
  character_id uuid,
  chat_id uuid,
  space_id uuid
) ON COMMIT DROP;

WITH distinct_spaces AS (
  SELECT
    cm.user_id,
    cm.character_id,
    cm.chat_id,
    MIN(cm.created_at) AS first_created_at,
    MAX(cm.updated_at) AS last_updated_at,
    COUNT(*) AS item_count
  FROM public.character_memories cm
  GROUP BY cm.user_id, cm.character_id, cm.chat_id
),
inserted AS (
  INSERT INTO public.knowledge_spaces (
    scope,
    owner_user_id,
    character_id,
    chat_id,
    name,
    description,
    visibility,
    metadata,
    created_at,
    updated_at
  )
  SELECT
    CASE WHEN ds.chat_id IS NULL THEN 'character' ELSE 'chat' END::public.knowledge_scope,
    ds.user_id,
    ds.character_id,
    ds.chat_id,
    COALESCE(
      CASE
        WHEN ds.chat_id IS NULL THEN c.name
        ELSE ch.title
      END,
      CASE WHEN ds.chat_id IS NULL
           THEN 'Character ' || ds.character_id::text
           ELSE 'Chat ' || ds.chat_id::text
      END
    ),
    NULL,
    'private'::public.visibility_enum,
    jsonb_build_object(
      'legacy_source', 'character_memories',
      'legacy_item_count', ds.item_count
    ),
    ds.first_created_at,
    ds.last_updated_at
  FROM distinct_spaces ds
  LEFT JOIN public.characters c ON c.id = ds.character_id
  LEFT JOIN public.chats ch ON ch.id = ds.chat_id
  RETURNING id, owner_user_id, character_id, chat_id
)
INSERT INTO tmp_memory_spaces(user_id, character_id, chat_id, space_id)
SELECT owner_user_id, character_id, chat_id, id FROM inserted;

-- 4.4 Character memories -> entries/chunks
CREATE TEMP TABLE tmp_memory_entries(
  legacy_id uuid PRIMARY KEY,
  entry_id uuid
) ON COMMIT DROP;

WITH entry_ins AS (
  INSERT INTO public.knowledge_entries (
    space_id,
    entry_type,
    author_id,
    legacy_source,
    legacy_id,
    title,
    content,
    keywords,
    importance,
    message_count,
    ai_sequence_start,
    ai_sequence_end,
    injection_count,
    last_injected_at,
    content_hash,
    embedding_status,
    metadata,
    created_at,
    updated_at
  )
  SELECT
    tms.space_id,
    CASE WHEN cm.is_auto_summary THEN 'summary' ELSE 'memory' END::public.knowledge_entry_type,
    cm.user_id,
    'character_memories',
    cm.id,
    cm.name,
    cm.summary_content,
    COALESCE(cm.trigger_keywords, '{}'::text[]),
    GREATEST(0, LEAST(COALESCE(cm.injection_count,0), 32767))::smallint,
    cm.message_count,
    cm.ai_sequence_start,
    cm.ai_sequence_end,
    COALESCE(cm.injection_count,0),
    cm.last_injected_at,
    cm.content_hash,
    CASE WHEN cm.embedding IS NOT NULL THEN 'ready' ELSE 'pending' END::public.embedding_status,
    jsonb_build_object(
      'legacy_message_count', cm.message_count,
      'legacy_chat_id', cm.chat_id,
      'is_auto_summary', cm.is_auto_summary
    ),
    cm.created_at,
    cm.updated_at
  FROM public.character_memories cm
  JOIN tmp_memory_spaces tms
    ON tms.user_id = cm.user_id
   AND tms.character_id = cm.character_id
   AND (
         (tms.chat_id IS NULL AND cm.chat_id IS NULL)
      OR (tms.chat_id IS NOT NULL AND cm.chat_id = tms.chat_id)
       )
  RETURNING id, legacy_id
)
INSERT INTO tmp_memory_entries(legacy_id, entry_id)
SELECT legacy_id, id FROM entry_ins;

CREATE TEMP TABLE tmp_memory_chunks(
  legacy_id uuid PRIMARY KEY,
  chunk_id uuid
) ON COMMIT DROP;

WITH chunk_ins AS (
  INSERT INTO public.knowledge_chunks (entry_id, chunk_index, content, token_count, created_at)
  SELECT
    tme.entry_id,
    0,
    cm.summary_content,
    cm.input_token_cost,
    cm.created_at
  FROM tmp_memory_entries tme
  JOIN public.character_memories cm ON cm.id = tme.legacy_id
  RETURNING id, entry_id
)
INSERT INTO tmp_memory_chunks(legacy_id, chunk_id)
SELECT tme.legacy_id, ci.id
FROM chunk_ins ci
JOIN tmp_memory_entries tme ON tme.entry_id = ci.entry_id;

-- 4.5 Persist legacy embeddings
WITH upsert_model AS (
  INSERT INTO public.embedding_models (provider, model_name, dimension, metadata)
  VALUES ('openai','text-embedding-ada-002',1536,jsonb_build_object('source','legacy'))
  ON CONFLICT (provider, model_name) DO UPDATE
    SET dimension = EXCLUDED.dimension
  RETURNING id
),
model_choice AS (
  SELECT id FROM upsert_model
  UNION ALL
  SELECT id FROM public.embedding_models WHERE provider='openai' AND model_name='text-embedding-ada-002'
  LIMIT 1
)
INSERT INTO public.knowledge_embeddings (chunk_id, model_id, vector, created_at)
SELECT
  tmc.chunk_id,
  mc.id,
  cm.embedding,
  COALESCE(cm.updated_at, now())
FROM tmp_memory_chunks tmc
JOIN public.character_memories cm ON cm.id = tmc.legacy_id
JOIN model_choice mc ON TRUE
WHERE cm.embedding IS NOT NULL;

-- 4.6 Consolidate tag assignments
INSERT INTO public.tag_assignments (tag_id, target_type, target_id, assigned_by, created_at)
SELECT DISTINCT
  ct.tag_id,
  'character'::public.tag_target_type,
  ct.character_id,
  chars.creator_id,
  now()
FROM public.character_tags ct
JOIN public.characters chars ON chars.id = ct.character_id
ON CONFLICT DO NOTHING;

INSERT INTO public.tag_assignments (tag_id, target_type, target_id, assigned_by, created_at)
SELECT DISTINCT
  wit.tag_id,
  'world'::public.tag_target_type,
  wit.world_info_id,
  wi.creator_id,
  now()
FROM public.world_info_tags wit
JOIN public.world_infos wi ON wi.id = wit.world_info_id
ON CONFLICT DO NOTHING;

-- 4.7 Consolidate reactions
INSERT INTO public.user_reactions (id, user_id, target_type, target_id, reaction_type, created_at, metadata)
SELECT
  gen_random_uuid(),
  cl.user_id,
  'character'::public.reaction_target_type,
  cl.character_id,
  'like'::public.reaction_type_enum,
  cl.created_at,
  jsonb_build_object('legacy_character_likes_id', cl.id)
FROM public.character_likes cl
ON CONFLICT DO NOTHING;

INSERT INTO public.user_reactions (id, user_id, target_type, target_id, reaction_type, created_at, metadata)
SELECT
  gen_random_uuid(),
  cf.user_id,
  'character'::public.reaction_target_type,
  cf.character_id,
  'favorite'::public.reaction_type_enum,
  cf.created_at,
  jsonb_build_object('legacy_character_favorites_id', cf.id)
FROM public.character_favorites cf
ON CONFLICT DO NOTHING;

INSERT INTO public.user_reactions (id, user_id, target_type, target_id, reaction_type, created_at, metadata)
SELECT
  gen_random_uuid(),
  wl.user_id,
  'world'::public.reaction_target_type,
  wl.world_info_id,
  'like'::public.reaction_type_enum,
  wl.created_at,
  jsonb_build_object('legacy_world_info_user_likes_id', wl.world_info_id)
FROM public.world_info_user_likes wl
ON CONFLICT DO NOTHING;

-- 4.8 Build context links from legacy world bindings
INSERT INTO public.context_links (source_type, source_id, scope, target_space_id, owner_user_id, metadata, created_at, updated_at)
SELECT
  'character'::public.knowledge_link_target,
  cwl.character_id,
  'default'::public.context_link_scope,
  tws.space_id,
  NULL,
  jsonb_build_object('legacy_character_world_info_link_id', cwl.id),
  COALESCE(cwl.created_at, now()),
  COALESCE(cwl.created_at, now())
FROM public.character_world_info_link cwl
JOIN tmp_world_spaces tws ON tws.world_info_id = cwl.world_info_id
ON CONFLICT DO NOTHING;

INSERT INTO public.context_links (source_type, source_id, scope, target_space_id, owner_user_id, metadata, created_at, updated_at)
SELECT
  'character'::public.knowledge_link_target,
  ucws.character_id,
  'user_override'::public.context_link_scope,
  tws.space_id,
  ucws.user_id,
  jsonb_build_object('legacy_user_character_world_info_settings_id', ucws.id),
  ucws.created_at,
  ucws.updated_at
FROM public.user_character_world_info_settings ucws
JOIN tmp_world_spaces tws ON tws.world_info_id = ucws.world_info_id
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------
-- 5. Recreate dependent RPCs/views against new structure
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_chat_complete(p_chat_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public','auth'
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.chats WHERE id = p_chat_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Chat not found';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM public.knowledge_spaces WHERE chat_id = p_chat_id;
  DELETE FROM public.chat_context WHERE chat_id = p_chat_id;
  DELETE FROM public.messages WHERE chat_id = p_chat_id;
  DELETE FROM public.chats WHERE id = p_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_private_character(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_creator uuid;
  v_was_public boolean;
  v_visibility public.visibility_enum;
  v_chat_id uuid;
BEGIN
  SELECT creator_id, was_public, visibility
    INTO v_creator, v_was_public, v_visibility
  FROM public.characters
  WHERE id = p_character_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  IF v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_was_public THEN
    RAISE EXCEPTION 'Characters that have been public cannot be deleted';
  END IF;

  IF v_visibility = 'public' THEN
    RAISE EXCEPTION 'Public characters cannot be deleted';
  END IF;

  BEGIN
    DELETE FROM public.user_chat_context
    WHERE user_id = auth.uid() AND character_id = p_character_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  DELETE FROM public.knowledge_spaces
  WHERE owner_user_id = auth.uid()
    AND character_id = p_character_id
    AND scope IN ('character','chat');

  FOR v_chat_id IN
    SELECT id FROM public.chats WHERE user_id = auth.uid() AND character_id = p_character_id
  LOOP
    BEGIN
      PERFORM public.delete_chat_complete(v_chat_id, auth.uid());
    EXCEPTION WHEN undefined_function THEN
      DELETE FROM public.chats WHERE id = v_chat_id AND user_id = auth.uid();
    END;
  END LOOP;

  DELETE FROM public.context_links
  WHERE source_type = 'character'
    AND source_id = p_character_id;

  DELETE FROM public.characters
  WHERE id = p_character_id
    AND creator_id = auth.uid()
    AND was_public = false
    AND visibility <> 'public';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character delete failed due to constraints';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_chat_snapshot(
  p_chat_id uuid,
  p_user_id uuid,
  p_character_id uuid,
  p_limit integer DEFAULT 25,
  p_before_order integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public','billing','auth'
AS $$
DECLARE
  v_context jsonb;
  v_mode public.chat_mode_enum;
  v_last_summary int;
  v_ai_after int;
  v_messages jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_effective_limit int;
BEGIN
  PERFORM public._assert_self(p_user_id);

  IF p_chat_id IS NULL OR p_user_id IS NULL OR p_character_id IS NULL THEN
    RAISE EXCEPTION 'Missing required parameters';
  END IF;

  v_effective_limit := LEAST(GREATEST(coalesce(p_limit,25),1),100);

  IF NOT EXISTS (SELECT 1 FROM chats WHERE id = p_chat_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Chat not found or access denied';
  END IF;

  SELECT chat_mode INTO v_mode FROM chats WHERE id = p_chat_id;

  SELECT current_context::jsonb INTO v_context
  FROM chat_context
  WHERE chat_id = p_chat_id
    AND user_id = p_user_id
    AND character_id = p_character_id;

  SELECT ke.message_count INTO v_last_summary
  FROM public.knowledge_entries ke
  JOIN public.knowledge_spaces ks ON ks.id = ke.space_id
  WHERE ks.chat_id = p_chat_id
    AND ke.entry_type = 'summary'
  ORDER BY COALESCE(ke.message_count,0) DESC, ke.created_at DESC
  LIMIT 1;

  WITH ordered AS (
    SELECT id,
           content,
          is_ai_message,
           created_at,
           message_order,
           current_context
    FROM messages
    WHERE chat_id = p_chat_id
      AND (p_before_order IS NULL OR message_order < p_before_order)
    ORDER BY message_order DESC
    LIMIT v_effective_limit + 1
  ), limited AS (
    SELECT * FROM ordered LIMIT v_effective_limit
  )
  SELECT jsonb_agg(to_jsonb(limited) ORDER BY message_order DESC) INTO v_messages FROM limited;

  SELECT (COUNT(*) > v_effective_limit) INTO v_has_more FROM ordered;

  SELECT COUNT(*) INTO v_ai_after
  FROM messages m
  WHERE m.chat_id = p_chat_id
    AND m.is_ai_message IS TRUE
    AND (v_last_summary IS NULL OR m.message_order > v_last_summary)
    AND m.content IS NOT NULL
    AND m.content NOT LIKE '%[PLACEHOLDER]%';

  RETURN jsonb_build_object(
    'chat_id', p_chat_id,
    'chat_mode', v_mode,
    'current_context', coalesce(v_context, '{}'::jsonb),
    'messages', coalesce(v_messages, '[]'::jsonb),
    'has_more', coalesce(v_has_more,false),
    'last_summary_at', coalesce(v_last_summary,0),
    'ai_messages_after_summary', coalesce(v_ai_after,0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_memories_injected(mem_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE public.knowledge_entries
     SET injection_count = COALESCE(injection_count, 0) + 1,
         last_injected_at = now()
   WHERE id = ANY(mem_ids)
      OR (legacy_source = 'character_memories' AND legacy_id = ANY(mem_ids));
$$;

CREATE OR REPLACE FUNCTION public.list_public_world_infos(
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'interactions',
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 20,
  p_exclude_nsfw boolean DEFAULT false,
  p_tag_ids integer[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_items jsonb;
  v_total int;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,20),1),100);
  v_offset int := GREATEST(COALESCE(p_offset,0),0);
BEGIN
  WITH base AS (
    SELECT wi.id,
           wi.name,
           wi.short_description,
           wi.creator_id,
           wi.visibility,
           wi.likes_count,
           wi.interaction_count,
           wi.created_at,
           wi.updated_at,
           ks.id AS space_id,
           COUNT(DISTINCT ke.id) AS entries_count,
           MAX(ke.updated_at) AS entries_updated_at
    FROM public.world_infos wi
    LEFT JOIN public.knowledge_spaces ks ON ks.world_info_id = wi.id
    LEFT JOIN public.knowledge_entries ke ON ke.space_id = ks.id
    WHERE wi.visibility = 'public'
      AND (
        p_search IS NULL OR length(trim(p_search)) = 0 OR
        (
          wi.name ILIKE '%' || replace(p_search,'%','') || '%' OR
          wi.short_description ILIKE '%' || replace(p_search,'%','') || '%' OR
          EXISTS (
            SELECT 1
            FROM public.knowledge_entries ke2
            WHERE ke2.space_id = ks.id
              AND ke2.content ILIKE '%' || replace(p_search,'%','') || '%'
          )
        )
      )
    GROUP BY wi.id, ks.id
  ),
  nsfw_filtered AS (
    SELECT b.*
    FROM base b
    WHERE NOT p_exclude_nsfw
       OR NOT EXISTS (
        SELECT 1
        FROM public.tag_assignments ta
        JOIN public.tags t ON t.id = ta.tag_id
        WHERE ta.target_type = 'world'
          AND ta.target_id = b.id
          AND lower(t.name) = 'nsfw'
       )
  ),
  tag_filtered AS (
    SELECT n.*
    FROM nsfw_filtered n
    WHERE p_tag_ids IS NULL
       OR NOT EXISTS (
          SELECT 1 FROM (
            SELECT UNNEST(p_tag_ids) AS tid
          ) req
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.tag_assignments ta
            WHERE ta.target_type = 'world'
              AND ta.target_id = n.id
              AND ta.tag_id = req.tid
          )
       )
  ),
  ordered AS (
    SELECT tf.*
    FROM tag_filtered tf
    ORDER BY
      CASE
        WHEN p_sort = 'newest' THEN tf.updated_at
        WHEN p_sort = 'likes' THEN tf.likes_count
        WHEN p_sort = 'entries' THEN tf.entries_count
        ELSE tf.interaction_count
      END DESC,
      tf.created_at DESC
    OFFSET v_offset
    LIMIT v_limit
  )
  SELECT jsonb_agg(jsonb_build_object(
           'id', o.id,
           'name', o.name,
           'short_description', o.short_description,
           'creator_id', o.creator_id,
           'visibility', o.visibility,
           'likes_count', o.likes_count,
           'interaction_count', o.interaction_count,
           'entriesCount', COALESCE(o.entries_count,0),
           'created_at', o.created_at,
           'updated_at', o.updated_at,
           'creator', (
             SELECT to_jsonb(pr) - 'id'
             FROM public.profiles pr
             WHERE pr.id = o.creator_id
           ),
           'tags', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
             FROM public.tag_assignments ta
             JOIN public.tags t ON t.id = ta.tag_id
             WHERE ta.target_type = 'world'
               AND ta.target_id = o.id
           ), '[]'::jsonb)
         )),
         (SELECT COUNT(*) FROM tag_filtered)
  INTO v_items, v_total
  FROM ordered o;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total,0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_user_world_infos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_items jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH owned AS (
    SELECT wi.*
    FROM public.world_infos wi
    WHERE wi.creator_id = v_auth
  ),
  collected AS (
    SELECT wi.*
    FROM public.world_infos wi
    JOIN public.user_reactions ur
      ON ur.target_id = wi.id
     AND ur.target_type = 'world'
     AND ur.reaction_type IN ('like','favorite')
    WHERE ur.user_id = v_auth
  ),
  unioned AS (
    SELECT * FROM owned
    UNION
    SELECT * FROM collected
  )
  SELECT jsonb_agg(jsonb_build_object(
           'id', u.id,
           'name', u.name,
           'short_description', u.short_description,
           'creator_id', u.creator_id,
           'visibility', u.visibility,
           'likes_count', u.likes_count,
           'interaction_count', u.interaction_count,
           'entriesCount', COALESCE((
             SELECT COUNT(*)
             FROM public.knowledge_entries ke
             JOIN public.knowledge_spaces ks ON ks.id = ke.space_id
             WHERE ks.world_info_id = u.id
           ),0),
           'created_at', u.created_at,
           'updated_at', u.updated_at
         ))
  INTO v_items
  FROM unioned u;

  RETURN COALESCE(v_items,'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_user_world_infos(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_items jsonb;
BEGIN
  PERFORM public._assert_self(p_user_id);

  WITH owned AS (
    SELECT wi.*
    FROM public.world_infos wi
    WHERE wi.creator_id = p_user_id
  ),
  collected AS (
    SELECT wi.*
    FROM public.world_infos wi
    JOIN public.user_reactions ur
      ON ur.target_id = wi.id
     AND ur.target_type = 'world'
     AND ur.reaction_type IN ('like','favorite')
    WHERE ur.user_id = p_user_id
  ),
  unioned AS (
    SELECT * FROM owned
    UNION
    SELECT * FROM collected
  ),
  enriched AS (
    SELECT
      u.id,
      u.name,
      u.short_description,
      u.creator_id,
      u.visibility,
      u.likes_count,
      u.interaction_count,
      u.created_at,
      u.updated_at,
      (SELECT COUNT(*)
         FROM public.knowledge_entries ke
         JOIN public.knowledge_spaces ks ON ks.id = ke.space_id
        WHERE ks.world_info_id = u.id) AS entries_count,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) ORDER BY t.name), '[]'::jsonb)
         FROM public.tag_assignments ta
         JOIN public.tags t ON t.id = ta.tag_id
        WHERE ta.target_type = 'world'
          AND ta.target_id = u.id) AS tags,
      (SELECT jsonb_build_object('username', pr.username, 'avatar_url', pr.avatar_url)
         FROM public.profiles pr WHERE pr.id = u.creator_id) AS creator
    FROM unioned u
  )
  SELECT jsonb_agg(jsonb_build_object(
           'id', e.id,
           'name', e.name,
           'short_description', e.short_description,
           'creator_id', e.creator_id,
           'visibility', e.visibility,
           'likes_count', e.likes_count,
           'interaction_count', e.interaction_count,
           'entriesCount', COALESCE(e.entries_count,0),
           'created_at', e.created_at,
           'updated_at', e.updated_at,
           'tags', COALESCE(e.tags, '[]'::jsonb),
           'creator', e.creator
         ))
  INTO v_items
  FROM enriched e;

  RETURN COALESCE(v_items,'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.user_world_infos_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_items jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH owned AS (
    SELECT wi.*
    FROM public.world_infos wi
    WHERE wi.creator_id = v_auth
  ),
  collected AS (
    SELECT wi.*
    FROM public.world_infos wi
    JOIN public.user_reactions ur
      ON ur.target_id = wi.id
     AND ur.target_type = 'world'
     AND ur.reaction_type IN ('like','favorite')
    WHERE ur.user_id = v_auth
  ),
  unioned AS (
    SELECT * FROM owned
    UNION
    SELECT * FROM collected
  )
  SELECT jsonb_agg(jsonb_build_object(
           'id', u.id,
           'name', u.name,
           'short_description', u.short_description,
           'creator_id', u.creator_id,
           'visibility', u.visibility,
           'likes_count', u.likes_count,
           'interaction_count', u.interaction_count,
           'entriesCount', COALESCE((
             SELECT COUNT(*)
             FROM public.knowledge_entries ke
             JOIN public.knowledge_spaces ks ON ks.id = ke.space_id
             WHERE ks.world_info_id = u.id
           ),0),
           'created_at', u.created_at,
           'updated_at', u.updated_at
         ))
  INTO v_items
  FROM unioned u;

  RETURN COALESCE(v_items,'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_world_info_full(p_world_info_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
           'id', wi.id,
           'name', wi.name,
           'short_description', wi.short_description,
           'visibility', wi.visibility,
           'creator_id', wi.creator_id,
           'likes_count', wi.likes_count,
           'interaction_count', wi.interaction_count,
           'created_at', wi.created_at,
           'updated_at', wi.updated_at,
           'creator', to_jsonb(pr) - 'id',
           'entries', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', ke.id,
                      'title', ke.title,
                      'keywords', ke.keywords,
                      'entry_text', ke.content,
                      'entry_type', ke.entry_type,
                      'created_at', ke.created_at,
                      'updated_at', ke.updated_at
                    ) ORDER BY ke.created_at DESC)
             FROM public.knowledge_entries ke
             JOIN public.knowledge_spaces ks2 ON ks2.id = ke.space_id
             WHERE ks2.world_info_id = wi.id
           ), '[]'::jsonb),
           'tags', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
             FROM public.tag_assignments ta
             JOIN public.tags t ON t.id = ta.tag_id
             WHERE ta.target_type = 'world'
               AND ta.target_id = wi.id
           ), '[]'::jsonb),
           'is_liked', CASE
             WHEN v_user_id IS NULL THEN false
             ELSE EXISTS (
               SELECT 1
               FROM public.user_reactions ur
               WHERE ur.target_type = 'world'
                 AND ur.target_id = wi.id
                 AND ur.reaction_type IN ('like','favorite')
                 AND ur.user_id = v_user_id
             )
           END,
           'entriesCount', COALESCE((
             SELECT COUNT(*)
             FROM public.knowledge_entries ke
             JOIN public.knowledge_spaces ks3 ON ks3.id = ke.space_id
             WHERE ks3.world_info_id = wi.id
           ),0),
           'is_used', false
         )
  INTO v_result
  FROM public.world_infos wi
  LEFT JOIN public.profiles pr ON pr.id = wi.creator_id
  WHERE wi.id = p_world_info_id
    AND (
         wi.visibility = 'public'
      OR (v_user_id IS NOT NULL AND wi.creator_id = v_user_id)
      OR (v_user_id IS NOT NULL AND EXISTS (
            SELECT 1
            FROM public.user_reactions ur
            WHERE ur.target_type = 'world'
              AND ur.target_id = wi.id
              AND ur.reaction_type IN ('like','favorite')
              AND ur.user_id = v_user_id
          ))
    );

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------
-- 6. Recreate character_profile_view using consolidated structures
-- ------------------------------------------------------------------
CREATE OR REPLACE VIEW public.character_profile_view AS
SELECT
  c.id,
  c.name,
  c.short_description,
  c.avatar_url,
  c.visibility,
  c.was_public,
  c.interaction_count,
  c.created_at,
  c.updated_at,
  c.tagline,
  c.creator_id,
  c.likes_count,
  c.favorites_count,
  c.chats_count,
  c.messages_count,
  jsonb_build_object(
    'greeting', cd.greeting,
    'description', cd.description,
    'personality_summary', cd.personality_summary,
    'scenario', cd.scenario
  ) AS character_definitions,
  jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'avatar_url', p.avatar_url
  ) AS creator,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
    FROM (
      SELECT DISTINCT tg.id, tg.name
      FROM public.tag_assignments ta
      JOIN public.tags tg ON tg.id = ta.tag_id
      WHERE ta.target_type = 'character'
        AND ta.target_id = c.id
    ) s
  ), '[]'::jsonb) AS tags,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'short_description', s.short_description) ORDER BY s.name)
    FROM (
      SELECT DISTINCT wi.id, wi.name, wi.short_description
      FROM public.context_links cl
      JOIN public.knowledge_spaces ks ON ks.id = cl.target_space_id
      JOIN public.world_infos wi ON wi.id = ks.world_info_id
      WHERE cl.source_type = 'character'
        AND cl.source_id = c.id
        AND cl.scope = 'default'
    ) s
  ), '[]'::jsonb) AS world_infos
FROM public.characters c
LEFT JOIN public.character_definitions cd ON cd.character_id = c.id
LEFT JOIN public.profiles p ON p.id = c.creator_id;

-- ------------------------------------------------------------------
-- 7. Triggers to maintain counts from consolidated reactions
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_user_reactions_character_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target uuid;
  v_type public.reaction_target_type;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target := OLD.target_id;
    v_type := OLD.target_type;
  ELSE
    v_target := NEW.target_id;
    v_type := NEW.target_type;
  END IF;

  IF v_type = 'character' THEN
    UPDATE public.characters c
       SET likes_count = COALESCE((
             SELECT COUNT(*) FROM public.user_reactions ur
             WHERE ur.target_type = 'character'
               AND ur.target_id = v_target
               AND ur.reaction_type = 'like'
           ),0),
           favorites_count = COALESCE((
             SELECT COUNT(*) FROM public.user_reactions ur
             WHERE ur.target_type = 'character'
               AND ur.target_id = v_target
               AND ur.reaction_type = 'favorite'
           ),0)
     WHERE c.id = v_target;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_user_reactions_world_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target uuid;
  v_type public.reaction_target_type;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target := OLD.target_id;
    v_type := OLD.target_type;
  ELSE
    v_target := NEW.target_id;
    v_type := NEW.target_type;
  END IF;

  IF v_type = 'world' THEN
    UPDATE public.world_infos wi
       SET likes_count = COALESCE((
             SELECT COUNT(*) FROM public.user_reactions ur
             WHERE ur.target_type = 'world'
               AND ur.target_id = v_target
               AND ur.reaction_type IN ('like','favorite')
           ),0)
     WHERE wi.id = v_target;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_user_reactions_character_counts
AFTER INSERT OR DELETE OR UPDATE OF target_type, target_id, reaction_type ON public.user_reactions
FOR EACH ROW EXECUTE FUNCTION public.tg_user_reactions_character_counts();

CREATE TRIGGER trg_user_reactions_world_counts
AFTER INSERT OR DELETE OR UPDATE OF target_type, target_id, reaction_type ON public.user_reactions
FOR EACH ROW EXECUTE FUNCTION public.tg_user_reactions_world_counts();

-- ------------------------------------------------------------------
-- 8. Row Level Security and Grants
-- ------------------------------------------------------------------
ALTER TABLE public.knowledge_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.context_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_spaces_select_policy ON public.knowledge_spaces
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR owner_user_id = auth.uid()
    OR visibility IN ('public','unlisted')
  );

CREATE POLICY knowledge_spaces_manage_policy ON public.knowledge_spaces
  FOR ALL USING (
    auth.role() = 'service_role'
    OR owner_user_id = auth.uid()
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR owner_user_id = auth.uid()
  );

CREATE POLICY knowledge_entries_select_policy ON public.knowledge_entries
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_spaces ks
      WHERE ks.id = knowledge_entries.space_id
        AND (
          ks.owner_user_id = auth.uid()
          OR ks.visibility IN ('public','unlisted')
          OR auth.role() = 'service_role'
        )
    )
  );

CREATE POLICY knowledge_entries_manage_policy ON public.knowledge_entries
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_spaces ks
      WHERE ks.id = knowledge_entries.space_id
        AND ks.owner_user_id = auth.uid()
    )
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_spaces ks
      WHERE ks.id = knowledge_entries.space_id
        AND ks.owner_user_id = auth.uid()
    )
  );

CREATE POLICY knowledge_chunks_select_policy ON public.knowledge_chunks
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_entries ke
      JOIN public.knowledge_spaces ks ON ks.id = ke.space_id
      WHERE ke.id = knowledge_chunks.entry_id
        AND (
          ks.owner_user_id = auth.uid()
          OR ks.visibility IN ('public','unlisted')
          OR auth.role() = 'service_role'
        )
    )
  );

CREATE POLICY knowledge_chunks_manage_policy ON public.knowledge_chunks
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_entries ke
      JOIN public.knowledge_spaces ks ON ks.id = ke.space_id
      WHERE ke.id = knowledge_chunks.entry_id
        AND ks.owner_user_id = auth.uid()
    )
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_entries ke
      JOIN public.knowledge_spaces ks ON ks.id = ke.space_id
      WHERE ke.id = knowledge_chunks.entry_id
        AND ks.owner_user_id = auth.uid()
    )
  );

CREATE POLICY knowledge_embeddings_select_policy ON public.knowledge_embeddings
  FOR SELECT USING (
    auth.role() = 'service_role'
  );

CREATE POLICY knowledge_embeddings_manage_policy ON public.knowledge_embeddings
  FOR ALL USING (
    auth.role() = 'service_role'
  ) WITH CHECK (
    auth.role() = 'service_role'
  );

CREATE POLICY knowledge_links_select_policy ON public.knowledge_links
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_entries ke
      JOIN public.knowledge_spaces ks ON ks.id = ke.space_id
      WHERE ke.id = knowledge_links.entry_id
        AND (
          ks.owner_user_id = auth.uid()
          OR ks.visibility IN ('public','unlisted')
        )
    )
  );

CREATE POLICY knowledge_links_manage_policy ON public.knowledge_links
  FOR ALL USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_entries ke
      JOIN public.knowledge_spaces ks ON ks.id = ke.space_id
      WHERE ke.id = knowledge_links.entry_id
        AND ks.owner_user_id = auth.uid()
    )
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_entries ke
      JOIN public.knowledge_spaces ks ON ks.id = ke.space_id
      WHERE ke.id = knowledge_links.entry_id
        AND ks.owner_user_id = auth.uid()
    )
  );

CREATE POLICY tag_assignments_select_policy ON public.tag_assignments
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR (
         target_type = 'character'
     AND EXISTS (
        SELECT 1 FROM public.characters c
        WHERE c.id = tag_assignments.target_id
          AND (c.visibility = 'public' OR c.creator_id = auth.uid())
      )
    )
    OR (
         target_type = 'world'
     AND EXISTS (
        SELECT 1 FROM public.world_infos wi
        WHERE wi.id = tag_assignments.target_id
          AND (wi.visibility = 'public' OR wi.creator_id = auth.uid())
      )
    )
  );

CREATE POLICY tag_assignments_manage_policy ON public.tag_assignments
  FOR ALL USING (
    auth.role() = 'service_role'
    OR (
         target_type = 'character'
     AND EXISTS (
        SELECT 1 FROM public.characters c
        WHERE c.id = tag_assignments.target_id
          AND c.creator_id = auth.uid()
      )
    )
    OR (
         target_type = 'world'
     AND EXISTS (
        SELECT 1 FROM public.world_infos wi
        WHERE wi.id = tag_assignments.target_id
          AND wi.creator_id = auth.uid()
      )
    )
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR (
         target_type = 'character'
     AND EXISTS (
        SELECT 1 FROM public.characters c
        WHERE c.id = tag_assignments.target_id
          AND c.creator_id = auth.uid()
      )
    )
    OR (
         target_type = 'world'
     AND EXISTS (
        SELECT 1 FROM public.world_infos wi
        WHERE wi.id = tag_assignments.target_id
          AND wi.creator_id = auth.uid()
      )
    )
  );

CREATE POLICY user_reactions_select_policy ON public.user_reactions
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
  );

CREATE POLICY user_reactions_manage_policy ON public.user_reactions
  FOR ALL USING (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
  );

CREATE POLICY context_links_select_policy ON public.context_links
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR owner_user_id = auth.uid()
    OR (
         source_type = 'character'
     AND EXISTS (
        SELECT 1 FROM public.characters c
        WHERE c.id = context_links.source_id
          AND (c.visibility = 'public' OR c.creator_id = auth.uid())
      )
    )
  );

CREATE POLICY context_links_manage_owner_policy ON public.context_links
  FOR ALL USING (
    auth.role() = 'service_role'
    OR owner_user_id = auth.uid()
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR owner_user_id = auth.uid()
  );

CREATE POLICY context_links_manage_character_policy ON public.context_links
  FOR ALL USING (
    auth.role() = 'service_role'
    OR (
        source_type = 'character'
    AND owner_user_id IS NULL
    AND EXISTS (
        SELECT 1 FROM public.characters c
        WHERE c.id = context_links.source_id
          AND c.creator_id = auth.uid()
      )
    )
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR (
        source_type = 'character'
    AND owner_user_id IS NULL
    AND EXISTS (
        SELECT 1 FROM public.characters c
        WHERE c.id = context_links.source_id
          AND c.creator_id = auth.uid()
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_spaces TO authenticated;
GRANT ALL ON TABLE public.knowledge_spaces TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_entries TO authenticated;
GRANT ALL ON TABLE public.knowledge_entries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_chunks TO authenticated;
GRANT ALL ON TABLE public.knowledge_chunks TO service_role;
GRANT SELECT ON TABLE public.knowledge_embeddings TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.knowledge_embeddings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_links TO authenticated;
GRANT ALL ON TABLE public.knowledge_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tag_assignments TO authenticated;
GRANT ALL ON TABLE public.tag_assignments TO service_role;
GRANT SELECT ON TABLE public.tag_assignments TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_reactions TO authenticated;
GRANT ALL ON TABLE public.user_reactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.context_links TO authenticated;
GRANT ALL ON TABLE public.context_links TO service_role;

GRANT ALL ON SEQUENCE public.tag_assignments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tag_assignments_id_seq TO service_role;

-- ------------------------------------------------------------------
-- 9. Recompute aggregate counts against consolidated reactions
-- ------------------------------------------------------------------
UPDATE public.characters c
SET likes_count = COALESCE((
      SELECT COUNT(*) FROM public.user_reactions ur
      WHERE ur.target_type = 'character'
        AND ur.target_id = c.id
        AND ur.reaction_type = 'like'
    ),0),
    favorites_count = COALESCE((
      SELECT COUNT(*) FROM public.user_reactions ur
      WHERE ur.target_type = 'character'
        AND ur.target_id = c.id
        AND ur.reaction_type = 'favorite'
    ),0);

UPDATE public.world_infos wi
SET likes_count = COALESCE((
      SELECT COUNT(*) FROM public.user_reactions ur
      WHERE ur.target_type = 'world'
        AND ur.target_id = wi.id
        AND ur.reaction_type IN ('like','favorite')
    ),0);

-- ------------------------------------------------------------------
-- 10. Drop legacy tables now that data is migrated
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS public.character_memories CASCADE;
DROP TABLE IF EXISTS public.world_info_entries CASCADE;
DROP TABLE IF EXISTS public.character_tags CASCADE;
DROP TABLE IF EXISTS public.world_info_tags CASCADE;
DROP TABLE IF EXISTS public.character_favorites CASCADE;
DROP TABLE IF EXISTS public.character_likes CASCADE;
DROP TABLE IF EXISTS public.world_info_user_likes CASCADE;
DROP TABLE IF EXISTS public.character_world_info_link CASCADE;
DROP TABLE IF EXISTS public.user_character_world_info_settings CASCADE;

-- ------------------------------------------------------------------
-- 11. Indexes for vector search
-- ------------------------------------------------------------------
CREATE INDEX knowledge_embeddings_vector_cosine_idx
ON public.knowledge_embeddings
USING ivfflat (vector vector_cosine_ops)
WITH (lists = 200);

-- ------------------------------------------------------------------
-- 12. Analyze new tables
-- ------------------------------------------------------------------
ANALYZE public.knowledge_spaces;
ANALYZE public.knowledge_entries;
ANALYZE public.user_reactions;

COMMIT;

