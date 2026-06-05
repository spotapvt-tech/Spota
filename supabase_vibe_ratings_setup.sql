-- 1. Create vibe_ratings table
create table if not exists public.vibe_ratings (
  id uuid default gen_random_uuid() primary key,
  spot_id uuid references public.spots(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade, -- Nullable to allow guests
  cozy int check (cozy >= 1 and cozy <= 5) not null,
  insta_worthy int check (insta_worthy >= 1 and insta_worthy <= 5) not null,
  lively int check (lively >= 1 and lively <= 5) not null,
  zen int check (zen >= 1 and zen <= 5) not null,
  workspace int check (workspace >= 1 and workspace <= 5) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS) on vibe_ratings
alter table public.vibe_ratings enable row level security;

-- 3. Create policies for vibe_ratings
drop policy if exists "Vibe ratings are public." on public.vibe_ratings;
create policy "Vibe ratings are public." 
  on public.vibe_ratings 
  for select 
  using (true);

drop policy if exists "Anyone can rate vibes." on public.vibe_ratings;
create policy "Anyone can rate vibes." 
  on public.vibe_ratings 
  for insert 
  with check (
    (user_id is null) or (auth.uid() = user_id)
  );
