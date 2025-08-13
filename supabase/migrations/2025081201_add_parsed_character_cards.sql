-- Parsed character cards cache table
create table if not exists public.parsed_character_cards (
  hash text primary key,
  vendor text,
  version text,
  normalized jsonb not null,
  avatar_public_url text,
  created_at timestamptz not null default now()
);

-- Helpful index for created_at if we later want to purge old entries
create index if not exists idx_parsed_character_cards_created_at on public.parsed_character_cards(created_at);
