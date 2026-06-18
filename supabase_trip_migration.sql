-- 1. Create Trips Table
create table if not exists public.trips (
  id serial primary key,
  name text not null,
  destination text,
  start_date date,
  end_date date,
  invite_code text unique not null,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for fast invite code lookups
create index if not exists trips_invite_code_idx on public.trips(invite_code);

-- 2. Create Trip Members Table
create table if not exists public.trip_members (
  trip_id integer references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text default 'member' check (role in ('creator', 'member', 'viewer')),
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (trip_id, user_id)
);

-- Index for user lookups
create index if not exists trip_members_user_idx on public.trip_members(user_id);

-- 3. Create Trip Spots Table
create table if not exists public.trip_spots (
  trip_id integer references public.trips(id) on delete cascade not null,
  spot_id integer references public.spots(id) on delete cascade not null,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  visited boolean default false not null,
  primary key (trip_id, spot_id)
);

-- 4. Create Trip Spot Votes Table
create table if not exists public.trip_spot_votes (
  trip_id integer not null,
  spot_id integer not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  primary key (trip_id, spot_id, user_id),
  foreign key (trip_id, spot_id) references public.trip_spots(trip_id, spot_id) on delete cascade
);

-- 5. Create Spot Views Table
create table if not exists public.spot_views (
  id serial primary key,
  spot_id integer references public.spots(id) on delete cascade not null,
  viewer_id uuid references public.profiles(id) on delete set null,
  viewed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists spot_views_spot_idx on public.spot_views(spot_id);

-- Enable Row Level Security (RLS)
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_spots enable row level security;
alter table public.trip_spot_votes enable row level security;
alter table public.spot_views enable row level security;

-- 6. Helper function to check trip membership without RLS recursion
-- 'security definer' runs this function with database owner privileges, bypassing RLS checks on trip_members
create or replace function public.check_is_trip_member(t_id integer, u_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.trip_members
    where trip_members.trip_id = t_id and trip_members.user_id = u_id
  );
end;
$$ language plpgsql security definer;

-- Drop existing policies
drop policy if exists "Users can select trips they are member of" on public.trips;
drop policy if exists "Users can insert trips" on public.trips;
drop policy if exists "Creator can update their trips" on public.trips;
drop policy if exists "Creator can delete their trips" on public.trips;

drop policy if exists "Members can view membership lists" on public.trip_members;
drop policy if exists "Anyone authenticated can join a membership" on public.trip_members;
drop policy if exists "Creator can update member roles" on public.trip_members;
drop policy if exists "Members can leave or creator can kick members" on public.trip_members;

drop policy if exists "Members can view trip spots" on public.trip_spots;
drop policy if exists "Members can insert trip spots" on public.trip_spots;
drop policy if exists "Members can update trip spots status" on public.trip_spots;
drop policy if exists "Members can remove trip spots" on public.trip_spots;

drop policy if exists "Members can view trip spots votes" on public.trip_spot_votes;
drop policy if exists "Members can vote" on public.trip_spot_votes;
drop policy if exists "Members can remove vote" on public.trip_spot_votes;

drop policy if exists "Views are readable by everyone" on public.spot_views;
drop policy if exists "Anyone can log a view" on public.spot_views;

-- RLS Policies Setup

-- Trips
create policy "Users can select trips they are member of" on public.trips
  for select using (
    creator_id = auth.uid() or public.check_is_trip_member(id, auth.uid())
  );

create policy "Users can insert trips" on public.trips
  for insert with check (auth.uid() = creator_id);

create policy "Creator can update their trips" on public.trips
  for update using (auth.uid() = creator_id);

create policy "Creator can delete their trips" on public.trips
  for delete using (auth.uid() = creator_id);

-- Trip Members
create policy "Members can view membership lists" on public.trip_members
  for select using (
    user_id = auth.uid() or public.check_is_trip_member(trip_id, auth.uid())
  );

create policy "Anyone authenticated can join a membership" on public.trip_members
  for insert with check (auth.uid() = user_id);

create policy "Creator can update member roles" on public.trip_members
  for update using (
    exists (
      select 1 from public.trips 
      where trips.id = trip_members.trip_id and trips.creator_id = auth.uid()
    )
  );

create policy "Members can leave or creator can kick members" on public.trip_members
  for delete using (
    auth.uid() = user_id or 
    exists (
      select 1 from public.trips 
      where trips.id = trip_members.trip_id and trips.creator_id = auth.uid()
    )
  );

-- Trip Spots
create policy "Members can view trip spots" on public.trip_spots
  for select using (
    public.check_is_trip_member(trip_id, auth.uid())
  );

create policy "Members can insert trip spots" on public.trip_spots
  for insert with check (
    public.check_is_trip_member(trip_id, auth.uid())
  );

create policy "Members can update trip spots status" on public.trip_spots
  for update using (
    public.check_is_trip_member(trip_id, auth.uid())
  );

create policy "Members can remove trip spots" on public.trip_spots
  for delete using (
    public.check_is_trip_member(trip_id, auth.uid())
  );

-- Trip Spot Votes
create policy "Members can view trip spots votes" on public.trip_spot_votes
  for select using (
    public.check_is_trip_member(trip_id, auth.uid())
  );

create policy "Members can vote" on public.trip_spot_votes
  for insert with check (
    auth.uid() = user_id and public.check_is_trip_member(trip_id, auth.uid())
  );

-- Members can delete their own votes
create policy "Members can remove vote" on public.trip_spot_votes
  for delete using (
    auth.uid() = user_id and public.check_is_trip_member(trip_id, auth.uid())
  );

-- Spot Views
create policy "Views are readable by everyone" on public.spot_views
  for select using (true);

create policy "Anyone can log a view" on public.spot_views
  for insert with check (true);

-- Enable real-time replication for trips, trip_spots, trip_spot_votes, and trip_members
do $$
begin
  -- Ensure publication exists
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  -- Add public.trips
  if not exists (
    select 1 
    from pg_publication_rel pr
    join pg_class c on pr.prrelid = c.oid
    join pg_publication p on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime' and c.relname = 'trips'
  ) then
    alter publication supabase_realtime add table public.trips;
  end if;

  -- Add public.trip_members
  if not exists (
    select 1 
    from pg_publication_rel pr
    join pg_class c on pr.prrelid = c.oid
    join pg_publication p on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime' and c.relname = 'trip_members'
  ) then
    alter publication supabase_realtime add table public.trip_members;
  end if;

  -- Add public.trip_spots
  if not exists (
    select 1 
    from pg_publication_rel pr
    join pg_class c on pr.prrelid = c.oid
    join pg_publication p on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime' and c.relname = 'trip_spots'
  ) then
    alter publication supabase_realtime add table public.trip_spots;
  end if;

  -- Add public.trip_spot_votes
  if not exists (
    select 1 
    from pg_publication_rel pr
    join pg_class c on pr.prrelid = c.oid
    join pg_publication p on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime' and c.relname = 'trip_spot_votes'
  ) then
    alter publication supabase_realtime add table public.trip_spot_votes;
  end if;
end $$;
