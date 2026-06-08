-- Create the push tokens table
create table if not exists public.user_push_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  user_name text not null,
  expo_push_token text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  -- Prevent duplicate tokens for the same user
  unique(user_id, expo_push_token)
);

-- Enable Row Level Security (idempotent: no-op if already on, and this table
-- lives in "public" — owned by the migration role, unlike storage.objects)
alter table public.user_push_tokens enable row level security;

-- Create policies for management (drop first so re-running this script doesn't
-- fail with "policy already exists" — schema.sql is meant to be idempotent)
drop policy if exists "Authenticated users can manage their own push tokens" on public.user_push_tokens;
create policy "Authenticated users can manage their own push tokens"
  on public.user_push_tokens
  for all
  using (true)
  with check (true);

-- Indices for performance
create index if not exists idx_push_tokens_user_id on public.user_push_tokens(user_id);
create index if not exists idx_push_tokens_token on public.user_push_tokens(expo_push_token);

-- syncPushToken (lib/push-notifications.ts) inserts/updates an `updated_at`
-- on every login/logout, but the CREATE TABLE above never declared it — the
-- live table only has it because someone added it by hand. Without this, a
-- fresh project rejects every row on import with "Could not find the
-- 'updated_at' column of 'user_push_tokens' in the schema cache" (PostgREST
-- reflecting the missing column), and the app's own writes would 400 too.
alter table public.user_push_tokens add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());
