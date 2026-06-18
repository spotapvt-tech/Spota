-- 1. Add tags column to spots table
alter table public.spots add column if not exists tags text[] default '{}';

-- 2. Drop existing comments table to clean up schema cache
drop table if exists public.comments;

-- 3. Create comments table supporting both registered and guest users
create table public.comments (
  id serial primary key,
  spot_id integer references public.spots(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade, -- Nullable to support guests
  guest_name text, -- Nickname for guest commenters
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Enable Row Level Security (RLS) on comments
alter table public.comments enable row level security;

-- 5. Create policies for comments
drop policy if exists "Public comments are viewable by everyone." on public.comments;
create policy "Public comments are viewable by everyone." 
  on public.comments 
  for select 
  using (true);

drop policy if exists "Anyone can post comments." on public.comments;
create policy "Anyone can post comments." 
  on public.comments 
  for insert 
  with check (
    (user_id is null) or (auth.uid() = user_id)
  );

drop policy if exists "Users can delete their own comments." on public.comments;
create policy "Users can delete their own comments." 
  on public.comments 
  for delete 
  using (
    (auth.uid() = user_id)
  );
