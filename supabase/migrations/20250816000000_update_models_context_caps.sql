-- Bump default and selected model context caps to align with app (Guest 12k, True Fan 16k, Whale 24k)
-- Uses columns that exist per schema: model_identifier, tier_name, max_context_tokens

begin;

-- Update table default if present
alter table if exists public.models alter column max_context_tokens set default 12000;

-- Align caps for provider models and per-tier override for Whale
update public.models
set max_context_tokens = case
  when model_identifier = 'nousresearch/hermes-3-llama-3.1-70b' and tier_name ilike '%whale%' then 24000
  when model_identifier = 'nousresearch/hermes-3-llama-3.1-70b' then 16000
  when model_identifier = 'mistralai/mistral-small-3.2-24b-instruct' then 12000
  else max_context_tokens
end
where model_identifier in (
  'mistralai/mistral-small-3.2-24b-instruct',
  'nousresearch/hermes-3-llama-3.1-70b'
);

commit;
