-- SQL Migration: Spota B2B2C Agency Integration
-- Run these statements in the Supabase SQL Editor to update your remote database.

-- 1. Create Agency Profiles Table
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

-- Index for fast user association lookups
create index if not exists agency_profiles_profile_idx on public.agency_profiles(profile_id);

-- 2. Alter Trips Table to support Agency Branding & Template links
alter table public.trips 
  add column if not exists agency_id integer references public.agency_profiles(id) on delete set null,
  add column if not exists is_cobranded boolean default false,
  add column if not exists itinerary_template_id integer;

create index if not exists trips_agency_idx on public.trips(agency_id);

-- 3. Alter Trip Spots Table to support Day Planning & custom booking CTAs
alter table public.trip_spots
  add column if not exists itinerary_day integer default 1,
  add column if not exists schedule_time text, -- text format (e.g. "10:30 AM") for simpler parsing on Capacitor mobile clients
  add column if not exists booking_cta_label text, -- e.g. "Book River Rafting"
  add column if not exists booking_cta_url text;   -- Affiliate or direct booking link

-- 4. Create Agency Leads Table to track click metrics and attribute conversions
create table if not exists public.agency_leads (
  id serial primary key,
  agency_id integer references public.agency_profiles(id) on delete cascade not null,
  visitor_id uuid references public.profiles(id) on delete set null,
  spot_id integer references public.spots(id) on delete set null,
  source_platform text default 'trip_board', -- e.g. 'trip_board', 'spot_details', 'instagram_recap'
  clicked_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists agency_leads_agency_idx on public.agency_leads(agency_id);

-- 5. Enable Row-Level Security (RLS)
alter table public.agency_profiles enable row level security;
alter table public.agency_leads enable row level security;

-- 6. Setup RLS Policies

-- Agency Profiles:
-- Read is public so clients can view agency details.
create policy "Agency profiles are readable by everyone" on public.agency_profiles
  for select using (true);

-- Insert/Update is allowed by the corresponding owner.
create policy "Owners can create their agency profile" on public.agency_profiles
  for insert with check (auth.uid() = profile_id);

create policy "Owners can update their agency profile" on public.agency_profiles
  for update using (auth.uid() = profile_id);

-- Agency Leads:
-- Readable only by the agency owner.
create policy "Agencies can read their own leads" on public.agency_leads
  for select using (
    exists (
      select 1 from public.agency_profiles
      where agency_profiles.id = agency_leads.agency_id and agency_profiles.profile_id = auth.uid()
    )
  );

-- Lead logging is open for insert by anyone (authenticated or anonymous clicks).
create policy "Anyone can insert lead clicks" on public.agency_leads
  for insert with check (true);

-- 7. Add new tables to Real-Time Publication
do $$
begin
  if not exists (
    select 1 
    from pg_publication_rel pr
    join pg_class c on pr.prrelid = c.oid
    join pg_publication p on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime' and c.relname = 'agency_profiles'
  ) then
    alter publication supabase_realtime add table public.agency_profiles;
  end if;

  if not exists (
    select 1 
    from pg_publication_rel pr
    join pg_class c on pr.prrelid = c.oid
    join pg_publication p on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime' and c.relname = 'agency_leads'
  ) then
    alter publication supabase_realtime add table public.agency_leads;
  end if;
end $$;
