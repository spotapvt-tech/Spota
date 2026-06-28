-- ============================================================
-- SPOTA UNIFIED COMPLETE DATABASE SCHEMA SETUP
-- Maintaining Integer Serial IDs for all user tables
-- Run this complete script in the Supabase SQL Editor
-- ============================================================

-- 1. Drop existing tables in reverse dependency order (cascade drops foreign keys safely)
drop table if exists public.trip_spot_votes cascade;
drop table if exists public.trip_spots cascade;
drop table if exists public.trip_members cascade;
drop table if exists public.package_bookings cascade;
drop table if exists public.agency_leads cascade;
drop table if exists public.trips cascade;
drop table if exists public.agency_profiles cascade;
drop table if exists public.chat_messages cascade;
drop table if exists public.chats cascade;
drop table if exists public.comments cascade;
drop table if exists public.playlist_spots cascade;
drop table if exists public.playlists cascade;
drop table if exists public.safe_treks cascade;
drop table if exists public.vibe_ratings cascade;
-- 1. Drop existing tables in reverse dependency order (cascade drops foreign keys safely)
drop table if exists public.trip_spot_votes cascade;
drop table if exists public.trip_spots cascade;
drop table if exists public.trip_members cascade;
drop table if exists public.package_bookings cascade;
drop table if exists public.agency_leads cascade;
drop table if exists public.trips cascade;
drop table if exists public.agency_profiles cascade;
drop table if exists public.chat_messages cascade;
drop table if exists public.chats cascade;
drop table if exists public.comments cascade;
drop table if exists public.playlist_spots cascade;
drop table if exists public.playlists cascade;
drop table if exists public.safe_treks cascade;
drop table if exists public.vibe_ratings cascade;
drop table if exists public.spot_views cascade;
drop table if exists public.spot_checkins cascade;
drop table if exists public.spot_verifications cascade;
drop table if exists public.verification_rules cascade;
drop table if exists public.analytics_events cascade;
drop table if exists public.spots cascade;
drop table if exists public.profiles cascade;

-- 2. Create public user profiles (id matches auth.users UUID)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  updated_at timestamp with time zone,
  username text unique,
  avatar_url text,
  reputation integer default 0,
  is_verified boolean default false,
  constraint username_length check (char_length(username) >= 3)
);

-- Index for profile username searches
create index if not exists profiles_username_idx on public.profiles(username);

-- 3. Create Spots table with integer serial ID
create table if not exists public.spots (
  id serial primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  description text,
  category text not null,
  latitude double precision not null,
  longitude double precision not null,
  image_url text,
  video_url text,
  status text default 'pending' check (status in ('pending', 'approved', 'sandbox', 'rejected', 'deleted', 'flagged')) not null,
  user_id uuid references public.profiles(id) on delete set null,
  reactions jsonb default '{}'::jsonb not null,
  share_count integer default 0 not null,
  report_count integer default 0 not null,
  tags text[] default '{}'::text[] not null,
  address text,
  verification_score integer default 0,
  google_place_id text,
  sandbox_votes_count integer default 0
);

-- 3.1 Create Verification Rules Table
create table if not exists public.verification_rules (
  id varchar primary key default 'default_rule_set',
  is_enabled boolean default true,
  weight_visual numeric(3,2) default 0.25 check (weight_visual >= 0.00 and weight_visual <= 1.00),
  weight_popularity numeric(3,2) default 0.25 check (weight_popularity >= 0.00 and weight_popularity <= 1.00),
  weight_text numeric(3,2) default 0.15 check (weight_text >= 0.00 and weight_text <= 1.00),
  weight_references numeric(3,2) default 0.15 check (weight_references >= 0.00 and weight_references <= 1.00),
  weight_user numeric(3,2) default 0.20 check (weight_user >= 0.00 and weight_user <= 1.00),
  threshold_approved integer default 75,
  threshold_sandbox integer default 40,
  min_reviews integer default 15,
  max_reviews integer default 500,
  max_distance_meters integer default 150,
  min_dwell_seconds integer default 180,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Seed default configuration
insert into public.verification_rules (id) values ('default_rule_set') on conflict (id) do nothing;

-- 3.2 Create Spot Verification Audit Table
create table if not exists public.spot_verifications (
  id serial primary key,
  spot_id integer references public.spots(id) on delete cascade unique not null,
  processed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  score_visual integer not null,
  score_popularity integer not null,
  score_text integer not null,
  score_references integer not null,
  score_user integer not null,
  score_total integer not null,
  ai_feedback text,
  google_reviews_count integer default 0,
  google_rating numeric(2,1),
  debug_logs jsonb default '{}'::jsonb not null
);

-- 3.3 Create Spot Check-ins Table
create table if not exists public.spot_checkins (
  id serial primary key,
  spot_id integer references public.spots(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  checked_in_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_latitude double precision not null,
  user_longitude double precision not null,
  distance_meters double precision not null,
  dwell_time_seconds integer default 0 not null,
  mock_location_detected boolean default false not null,
  network_carrier text,
  status text default 'pending' check (status in ('pending', 'verified', 'flagged')) not null
);

-- Helper function: Converts timestamptz to date in UTC. Explicitly IMMUTABLE for unique index expressions.
create or replace function public.get_date_utc(t timestamp with time zone)
returns date as $$
  select (t at time zone 'UTC')::date;
$$ language sql immutable;

-- Enforce one check-in per user per spot per day using an expression-based unique index
create unique index if not exists unique_user_spot_daily_idx 
  on public.spot_checkins (user_id, spot_id, (public.get_date_utc(checked_in_at)));

create index if not exists spot_checkins_user_idx on public.spot_checkins(user_id);
create index if not exists spot_checkins_spot_idx on public.spot_checkins(spot_id);
create index if not exists spot_checkins_status_idx on public.spot_checkins(status);

-- 3.4 Create Analytics Events Table (to track downloads, clicks)
create table if not exists public.analytics_events (
  id serial primary key,
  event_type text not null, -- 'download', 'spot_click', 'share', etc.
  user_id uuid references public.profiles(id) on delete set null,
  details jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists analytics_events_type_idx on public.analytics_events(event_type);

-- 4. Create Agency Profiles Table
create table if not exists public.agency_profiles (
  id serial primary key,
  profile_id uuid references public.profiles(id) on delete cascade unique not null,
  company_name text not null,
  website_url text,
  logo_url text,
  subscription_tier text default 'free' check (subscription_tier in ('free', 'boutique', 'professional', 'enterprise')),
  subscription_status text default 'inactive' check (subscription_status in ('active', 'inactive')),
  verified_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists agency_profiles_profile_idx on public.agency_profiles(profile_id);

-- 5. Create Trips Table
create table if not exists public.trips (
  id serial primary key,
  name text not null,
  destination text,
  start_date date,
  end_date date,
  invite_code text unique not null,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  agency_id integer references public.agency_profiles(id) on delete set null,
  is_cobranded boolean default false,
  itinerary_template_id integer,
  is_public_package boolean default false,
  package_price numeric default 0.00,
  package_description text,
  slots_total integer default 20,
  slots_booked integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists trips_invite_code_idx on public.trips(invite_code);
create index if not exists trips_agency_idx on public.trips(agency_id);

-- 6. Create Trip Members Table
create table if not exists public.trip_members (
  trip_id integer references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text default 'member' check (role in ('creator', 'member', 'viewer')),
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (trip_id, user_id)
);

create index if not exists trip_members_user_idx on public.trip_members(user_id);

-- 7. Create Trip Spots Table
create table if not exists public.trip_spots (
  trip_id integer references public.trips(id) on delete cascade not null,
  spot_id integer references public.spots(id) on delete cascade not null,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  visited boolean default false not null,
  itinerary_day integer default 1,
  schedule_time text,
  booking_cta_label text,
  booking_cta_url text,
  primary key (trip_id, spot_id)
);

-- 8. Create Trip Spot Votes Table
create table if not exists public.trip_spot_votes (
  trip_id integer not null,
  spot_id integer not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  primary key (trip_id, spot_id, user_id),
  foreign key (trip_id, spot_id) references public.trip_spots(trip_id, spot_id) on delete cascade
);

-- 9. Create Spot Views Table
create table if not exists public.spot_views (
  id serial primary key,
  spot_id integer references public.spots(id) on delete cascade not null,
  viewer_id uuid references public.profiles(id) on delete set null,
  viewed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists spot_views_spot_idx on public.spot_views(spot_id);

-- 10. Create Agency Leads Table
create table if not exists public.agency_leads (
  id serial primary key,
  agency_id integer references public.agency_profiles(id) on delete cascade not null,
  visitor_id uuid references public.profiles(id) on delete set null,
  spot_id integer references public.spots(id) on delete set null,
  source_platform text default 'trip_board',
  clicked_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists agency_leads_agency_idx on public.agency_leads(agency_id);

-- 11. Create Chats Table
create table if not exists public.chats (
  id serial primary key,
  user1_id uuid references public.profiles(id) on delete cascade not null,
  user2_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_users unique (user1_id, user2_id),
  constraint user_ordering check (user1_id < user2_id)
);

-- 12. Create Chat Messages Table
create table if not exists public.chat_messages (
  id serial primary key,
  chat_id integer references public.chats(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 13. Create Comments Table
create table if not exists public.comments (
  id serial primary key,
  spot_id integer references public.spots(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade,
  guest_name text,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 14. Create Package Bookings Table
create table if not exists public.package_bookings (
  id serial primary key,
  trip_id integer references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  amount_paid numeric not null,
  travelers_count integer default 1 not null,
  booking_date timestamp with time zone default timezone('utc'::text, now()) not null,
  status text default 'paid' check (status in ('pending', 'paid', 'cancelled')) not null
);

create index if not exists package_bookings_user_idx on public.package_bookings(user_id);
create index if not exists package_bookings_trip_idx on public.package_bookings(trip_id);

-- 15. Create Playlists Table
create table if not exists public.playlists (
  id serial primary key,
  name text not null,
  description text,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  is_public boolean default true,
  cover_gradient text default 'linear-gradient(135deg, #FF6B6B, #FF8E53)',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 16. Create Playlist Spots Table
create table if not exists public.playlist_spots (
  playlist_id integer references public.playlists(id) on delete cascade not null,
  spot_id integer references public.spots(id) on delete cascade not null,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (playlist_id, spot_id)
);

-- 17. Create Safe Treks Table
create table if not exists public.safe_treks (
  id serial primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  destination_name text not null,
  destination_lat double precision,
  destination_lng double precision,
  emergency_contact_name text not null,
  emergency_contact_phone text,
  emergency_contact_email text,
  check_in_interval_hours integer default 4,
  last_checked_in timestamp with time zone default timezone('utc'::text, now()) not null,
  status text default 'active' check (status in ('active', 'completed', 'overdue')),
  started_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists safe_treks_user_id_idx on public.safe_treks(user_id);

-- 18. Create Vibe Ratings Table
create table if not exists public.vibe_ratings (
  id serial primary key,
  spot_id integer references public.spots(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade,
  cozy int check (cozy >= 1 and cozy <= 5) not null,
  insta_worthy int check (insta_worthy >= 1 and insta_worthy <= 5) not null,
  lively int check (lively >= 1 and lively <= 5) not null,
  zen int check (zen >= 1 and zen <= 5) not null,
  workspace int check (workspace >= 1 and workspace <= 5) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================
-- Row Level Security (RLS) policies
-- ============================================================

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.spots enable row level security;
alter table public.agency_profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_spots enable row level security;
alter table public.trip_spot_votes enable row level security;
alter table public.spot_views enable row level security;
alter table public.agency_leads enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.comments enable row level security;
alter table public.package_bookings enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_spots enable row level security;
alter table public.safe_treks enable row level security;
alter table public.vibe_ratings enable row level security;
alter table public.verification_rules enable row level security;
alter table public.spot_verifications enable row level security;
alter table public.spot_checkins enable row level security;
alter table public.analytics_events enable row level security;

-- Profiles
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile." on public.profiles for update using (auth.uid() = id);

-- Spots
create policy "Spots are viewable by everyone" on public.spots for select using (true);
create policy "Anyone authenticated can insert a spot" on public.spots for insert with check (auth.uid() is not null);
create policy "Allow owners or admins to update spots" on public.spots for update using (auth.uid() = user_id or auth.uid() is not null);
create policy "Allow owners to delete their spots" on public.spots for delete using (auth.uid() = user_id);

-- Agency Profiles
create policy "Agency profiles are readable by everyone" on public.agency_profiles for select using (true);
create policy "Owners can create their agency profile" on public.agency_profiles for insert with check (auth.uid() = profile_id);
create policy "Owners can update their agency profile" on public.agency_profiles for update using (auth.uid() = profile_id);

-- Trips
create policy "Authenticated users can select trips" on public.trips for select using (auth.uid() is not null);
create policy "Users can insert trips" on public.trips for insert with check (auth.uid() = creator_id);
create policy "Creator can update their trips" on public.trips for update using (auth.uid() = creator_id);
create policy "Creator can delete their trips" on public.trips for delete using (auth.uid() = creator_id);

-- Helper function to check trip membership without RLS recursion
create or replace function public.check_is_trip_member(t_id integer, u_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.trip_members
    where trip_members.trip_id = t_id and trip_members.user_id = u_id
  );
end;
$$ language plpgsql security definer;

-- Trip Members
create policy "Members can view membership lists" on public.trip_members for select using (user_id = auth.uid() or public.check_is_trip_member(trip_id, auth.uid()));
create policy "Anyone authenticated can join a membership" on public.trip_members for insert with check (auth.uid() = user_id);
create policy "Creator can update member roles" on public.trip_members for update using (exists (select 1 from public.trips where trips.id = trip_members.trip_id and trips.creator_id = auth.uid()));
create policy "Members can leave or creator can kick members" on public.trip_members for delete using (auth.uid() = user_id or exists (select 1 from public.trips where trips.id = trip_members.trip_id and trips.creator_id = auth.uid()));

-- Trip Spots
create policy "Members can view trip spots or public package spots" on public.trip_spots
  for select using (exists (select 1 from public.trips where trips.id = trip_spots.trip_id and trips.is_public_package = true) or public.check_is_trip_member(trip_id, auth.uid()));
create policy "Members can insert trip spots" on public.trip_spots for insert with check (public.check_is_trip_member(trip_id, auth.uid()));
create policy "Members can update trip spots status" on public.trip_spots for update using (public.check_is_trip_member(trip_id, auth.uid()));
create policy "Members can remove trip spots" on public.trip_spots for delete using (public.check_is_trip_member(trip_id, auth.uid()));

-- Trip Spot Votes
create policy "Members can view trip spots votes" on public.trip_spot_votes for select using (public.check_is_trip_member(trip_id, auth.uid()));
create policy "Members can vote" on public.trip_spot_votes for insert with check (auth.uid() = user_id and public.check_is_trip_member(trip_id, auth.uid()));
create policy "Members can remove vote" on public.trip_spot_votes for delete using (auth.uid() = user_id and public.check_is_trip_member(trip_id, auth.uid()));

-- Spot Views
create policy "Views are readable by everyone" on public.spot_views for select using (true);
create policy "Anyone can log a view" on public.spot_views for insert with check (true);

-- Agency Leads
create policy "Agencies can read their own leads" on public.agency_leads for select using (exists (select 1 from public.agency_profiles where agency_profiles.id = agency_leads.agency_id and agency_profiles.profile_id = auth.uid()));
create policy "Anyone can insert lead clicks" on public.agency_leads for insert with check (true);

-- Chats
create policy "Users can view chats they are part of." on public.chats for select using (auth.uid() = user1_id or auth.uid() = user2_id);
create policy "Users can create chats they are part of." on public.chats for insert with check (auth.uid() = user1_id or auth.uid() = user2_id);

-- Chat Messages
create policy "Users can view messages in their chats." on public.chat_messages for select using (exists (select 1 from public.chats where chats.id = chat_messages.chat_id and (chats.user1_id = auth.uid() or chats.user2_id = auth.uid())));
create policy "Users can send messages in their chats." on public.chat_messages for insert with check (auth.uid() = sender_id and exists (select 1 from public.chats where chats.id = chat_messages.chat_id and (chats.user1_id = auth.uid() or chats.user2_id = auth.uid())));

-- Comments
create policy "Public comments are viewable by everyone." on public.comments for select using (true);
create policy "Anyone can post comments." on public.comments for insert with check ((user_id is null) or (auth.uid() = user_id));
create policy "Users can delete their own comments." on public.comments for delete using (auth.uid() = user_id);

-- Package Bookings
create policy "Users can view their own package bookings" on public.package_bookings for select using (auth.uid() = user_id or exists (select 1 from public.trips join public.agency_profiles on trips.agency_id = agency_profiles.id where trips.id = package_bookings.trip_id and agency_profiles.profile_id = auth.uid()));
create policy "Authenticated users can insert bookings" on public.package_bookings for insert with check (auth.uid() = user_id);

-- Playlists
create policy "Public playlists are viewable by everyone." on public.playlists for select using (is_public = true or auth.uid() = creator_id);
create policy "Users can create their own playlists." on public.playlists for insert with check (auth.uid() = creator_id);
create policy "Creators can update their own playlists." on public.playlists for update using (auth.uid() = creator_id);
create policy "Creators can delete their own playlists." on public.playlists for delete using (auth.uid() = creator_id);

-- Playlist Spots
create policy "Playlist spots are viewable by everyone." on public.playlist_spots for select using (exists (select 1 from public.playlists where playlists.id = playlist_spots.playlist_id and (playlists.is_public = true or playlists.creator_id = auth.uid())));
create policy "Playlist creators can insert spots." on public.playlist_spots for insert with check (exists (select 1 from public.playlists where playlists.id = playlist_spots.playlist_id and playlists.creator_id = auth.uid()));
create policy "Playlist creators can delete spots." on public.playlist_spots for delete using (exists (select 1 from public.playlists where playlists.id = playlist_spots.playlist_id and playlists.creator_id = auth.uid()));

-- Safe Treks
create policy "Users can view their own safe treks" on public.safe_treks for select using (auth.uid() = user_id);
create policy "Users can insert their own safe treks" on public.safe_treks for insert with check (auth.uid() = user_id);
create policy "Users can update their own safe treks" on public.safe_treks for update using (auth.uid() = user_id);
create policy "Users can delete their own safe treks" on public.safe_treks for delete using (auth.uid() = user_id);

-- Vibe Ratings
create policy "Vibe ratings are public." on public.vibe_ratings for select using (true);
create policy "Anyone can rate vibes." on public.vibe_ratings for insert with check ((user_id is null) or (auth.uid() = user_id));

-- Verification Rules
create policy "Verification rules are readable by everyone" on public.verification_rules for select using (true);

-- Spot Verifications
create policy "Spot verifications are readable by authenticated users" on public.spot_verifications for select using (auth.uid() is not null);

-- Spot Check-ins
create policy "Users can view check-ins" on public.spot_checkins for select using (auth.uid() is not null);
create policy "Users can insert their own check-ins" on public.spot_checkins for insert with check (auth.uid() = user_id);
create policy "Users can update their own check-ins" on public.spot_checkins for update using (auth.uid() = user_id);

-- Analytics Events
create policy "Anyone can log analytics" on public.analytics_events for insert with check (true);
create policy "Only authenticated users can read analytics" on public.analytics_events for select using (auth.uid() is not null);

-- ============================================================
-- Profile Trigger Function (Triggers on auth.users signup)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url, reputation, is_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    0,
    false
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Spot Auto-Verification & Trigger Functions
-- ============================================================

-- Enable pg_net if it isn't enabled
create extension if not exists pg_net;

-- Webhook Function for Auto-Verification with Master Bypass Switch
create or replace function public.trigger_spot_verification_webhook()
returns trigger as $$
declare
  is_check_enabled boolean;
begin
  -- 1. Check if verification checks are enabled globally
  select is_enabled into is_check_enabled 
  from public.verification_rules 
  where id = 'default_rule_set';
  
  -- 2. If disabled, bypass and auto-approve instantly
  if is_check_enabled = false then
    update public.spots 
    set status = 'approved', verification_score = 100
    where id = new.id;
  else
    -- Trigger HTTP POST request to the Supabase Edge Function asynchronously
    perform net.http_post(
      url := 'https://your-supabase-project.supabase.co/functions/v1/verify-spot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || 'YOUR_SERVICE_ROLE_KEY'
      ),
      body := json_build_object(
        'spot_id', new.id,
        'title', new.title,
        'description', new.description,
        'latitude', new.latitude,
        'longitude', new.longitude,
        'image_url', new.image_url,
        'user_id', new.user_id
      )::jsonb
    );
  end if;
  
  return new;
end;
$$ language plpgsql security definer;

-- Bind trigger to run AFTER INSERT on public.spots
drop trigger if exists on_spot_inserted_verify on public.spots;
create trigger on_spot_inserted_verify
  after insert on public.spots
  for each row execute procedure public.trigger_spot_verification_webhook();

-- Sandbox Graduation Trigger based on Passive Check-ins
create or replace function public.check_sandbox_graduation()
returns trigger as $$
declare
  current_status text;
  verified_checkins_count integer;
begin
  if new.status = 'verified' then
    select status into current_status
    from public.spots
    where id = new.spot_id;

    if current_status = 'sandbox' then
      select count(*) into verified_checkins_count
      from public.spot_checkins
      where spot_id = new.spot_id and status = 'verified';

      -- Graduate after 3 verified visits
      if verified_checkins_count >= 3 then
        update public.spots 
        set status = 'approved'
        where id = new.spot_id;
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_checkin_verified on public.spot_checkins;
create trigger on_checkin_verified
  after update of status or insert on public.spot_checkins
  for each row execute procedure public.check_sandbox_graduation();

-- ============================================================
-- Real-time Publication setup
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  alter publication supabase_realtime add table public.spots;
  alter publication supabase_realtime add table public.trips;
  alter publication supabase_realtime add table public.trip_members;
  alter publication supabase_realtime add table public.trip_spots;
  alter publication supabase_realtime add table public.trip_spot_votes;
  alter publication supabase_realtime add table public.agency_profiles;
  alter publication supabase_realtime add table public.agency_leads;
  alter publication supabase_realtime add table public.chats;
  alter publication supabase_realtime add table public.chat_messages;
  alter publication supabase_realtime add table public.package_bookings;
  alter publication supabase_realtime add table public.spot_checkins;
  alter publication supabase_realtime add table public.analytics_events;
exception
  when others then null;
end $$;

-- ============================================================
-- Supabase Storage Buckets and Policies Configuration
-- ============================================================

-- 1. Create storage buckets if they do not exist
insert into storage.buckets (id, name, public)
values ('spot-images', 'spot-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('spot-videos', 'spot-videos', true)
on conflict (id) do nothing;

-- 2. Create policies to allow public access for uploads, reads, updates, and deletes

-- Policy for inserting/uploading files into spot-images bucket
drop policy if exists "Allow public uploads to spot-images" on storage.objects;
create policy "Allow public uploads to spot-images"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'spot-images');

-- Policy for reading files from spot-images bucket
drop policy if exists "Allow public reads from spot-images" on storage.objects;
create policy "Allow public reads from spot-images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'spot-images');

-- Policy for updating files in spot-images bucket
drop policy if exists "Allow public updates to spot-images" on storage.objects;
create policy "Allow public updates to spot-images"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'spot-images');

-- Policy for deleting files from spot-images bucket
drop policy if exists "Allow public deletions from spot-images" on storage.objects;
create policy "Allow public deletions from spot-images"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'spot-images');

-- Policy for inserting/uploading files into spot-videos bucket
drop policy if exists "Allow public uploads to spot-videos" on storage.objects;
create policy "Allow public uploads to spot-videos"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'spot-videos');

-- Policy for reading files from spot-videos bucket
drop policy if exists "Allow public reads from spot-videos" on storage.objects;
create policy "Allow public reads from spot-videos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'spot-videos');

-- Policy for updating files in spot-videos bucket
drop policy if exists "Allow public updates to spot-videos" on storage.objects;
create policy "Allow public updates to spot-videos"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'spot-videos');

-- Policy for deleting files from spot-videos bucket
drop policy if exists "Allow public deletions from spot-videos" on storage.objects;
create policy "Allow public deletions from spot-videos"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'spot-videos');

