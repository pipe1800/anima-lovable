-- Create table for durable summary locks
-- Provides unique chat-level mutual exclusion with TTL semantics.
-- High-risk mitigation: replaces unreliable in-memory lock across serverless instances.

create table if not exists public.summary_locks (
  chat_id uuid primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Index to allow quick cleanup of expired locks
create index if not exists idx_summary_locks_expires_at on public.summary_locks (expires_at);

-- RLS (optional) - only service role should manipulate; disable for safety then rely on service key.
alter table public.summary_locks enable row level security;
create policy summary_locks_service_only on public.summary_locks for all using (auth.role() = 'service_role');

-- Cleanup function (optional) to prune stale locks (can be scheduled)
create or replace function public.prune_expired_summary_locks()
returns void as $$
begin
  delete from public.summary_locks where expires_at < now();
end;$$ language plpgsql security definer;

-- Optional: schedule via pg_cron if available (commented out)
-- select cron.schedule('*/5 * * * *', $$select public.prune_expired_summary_locks();$$);
