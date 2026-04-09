-- Create the push tokens table
create table public.user_push_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  user_name text not null,
  expo_push_token text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Prevent duplicate tokens for the same user
  unique(user_id, expo_push_token)
);

-- Enable Row Level Security
alter table public.user_push_tokens enable row level security;

-- Create policies for management
create policy "Authenticated users can manage their own push tokens"
  on public.user_push_tokens
  for all
  using (true)
  with check (true);

-- Indices for performance
create index idx_push_tokens_user_id on public.user_push_tokens(user_id);
create index idx_push_tokens_token on public.user_push_tokens(expo_push_token);
