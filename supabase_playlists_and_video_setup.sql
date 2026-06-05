-- 1. Add video_url column to spots table
alter table public.spots add column if not exists video_url text;

-- 2. Create playlists table
create table if not exists public.playlists (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  is_public boolean default true,
  cover_gradient text default 'linear-gradient(135deg, #FF6B6B, #FF8E53)',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create playlist_spots table
create table if not exists public.playlist_spots (
  playlist_id uuid references public.playlists(id) on delete cascade not null,
  spot_id uuid references public.spots(id) on delete cascade not null,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (playlist_id, spot_id)
);

-- 4. Enable Row Level Security (RLS) on playlists and playlist_spots
alter table public.playlists enable row level security;
alter table public.playlist_spots enable row level security;

-- 5. Create policies for playlists
drop policy if exists "Public playlists are viewable by everyone." on public.playlists;
create policy "Public playlists are viewable by everyone." 
  on public.playlists 
  for select 
  using (is_public = true or auth.uid() = creator_id);

drop policy if exists "Users can create their own playlists." on public.playlists;
create policy "Users can create their own playlists." 
  on public.playlists 
  for insert 
  with check (auth.uid() = creator_id);

drop policy if exists "Creators can update their own playlists." on public.playlists;
create policy "Creators can update their own playlists." 
  on public.playlists 
  for update 
  using (auth.uid() = creator_id);

drop policy if exists "Creators can delete their own playlists." on public.playlists;
create policy "Creators can delete their own playlists." 
  on public.playlists 
  for delete 
  using (auth.uid() = creator_id);

-- 6. Create policies for playlist_spots
drop policy if exists "Playlist spots are viewable by everyone." on public.playlist_spots;
create policy "Playlist spots are viewable by everyone." 
  on public.playlist_spots 
  for select 
  using (
    exists (
      select 1 from public.playlists 
      where playlists.id = playlist_spots.playlist_id 
      and (playlists.is_public = true or playlists.creator_id = auth.uid())
    )
  );

drop policy if exists "Playlist creators can insert spots." on public.playlist_spots;
create policy "Playlist creators can insert spots." 
  on public.playlist_spots 
  for insert 
  with check (
    exists (
      select 1 from public.playlists 
      where playlists.id = playlist_spots.playlist_id 
      and playlists.creator_id = auth.uid()
    )
  );

drop policy if exists "Playlist creators can delete spots." on public.playlist_spots;
create policy "Playlist creators can delete spots." 
  on public.playlist_spots 
  for delete 
  using (
    exists (
      select 1 from public.playlists 
      where playlists.id = playlist_spots.playlist_id 
      and playlists.creator_id = auth.uid()
    )
  );
