-- Table to store temporary state nonces for PayPal subscription creation
-- NOTE: Supabase user table lives in schema auth (auth.users), not public.users
create table if not exists public.subscription_nonces (
  id uuid primary key, -- nonce value (state parameter)
  user_id uuid not null references auth.users(id) on delete cascade,
  provisional_subscription_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_nonces_user on public.subscription_nonces(user_id);
create index if not exists idx_subscription_nonces_created_at on public.subscription_nonces(created_at);

alter table public.subscription_nonces enable row level security;
-- Only service role may read/insert/delete (function runs with service key)
create policy subscription_nonces_service_only on public.subscription_nonces for all using (auth.role() = 'service_role');

-- Cleanup function to remove stale nonces (older than 30 minutes)
create or replace function public.prune_stale_subscription_nonces()
returns void as $$
begin
  delete from public.subscription_nonces where created_at < now() - interval '30 minutes';
end;$$ language plpgsql security definer;
