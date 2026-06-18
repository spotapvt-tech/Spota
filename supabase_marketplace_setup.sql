-- SQL Migration: Spota B2B2C Booking Marketplace Setup
-- Run these statements in the Supabase SQL Editor to update your remote database.

-- 1. Alter Trips Table to support Marketplace Package parameters
alter table public.trips 
  add column if not exists is_public_package boolean default false,
  add column if not exists package_price numeric default 0.00,
  add column if not exists package_description text,
  add column if not exists slots_total integer default 20,
  add column if not exists slots_booked integer default 0;

-- 2. Create Package Bookings Table to track client ticket sales
create table if not exists public.package_bookings (
  id serial primary key,
  trip_id integer references public.trips(id) on delete cascade not null, -- The master package template
  user_id uuid references public.profiles(id) on delete cascade not null, -- The purchaser client
  amount_paid numeric not null,
  travelers_count integer default 1 not null,
  booking_date timestamp with time zone default timezone('utc'::text, now()) not null,
  status text default 'paid' check (status in ('pending', 'paid', 'cancelled')) not null
);

-- Index for quick lookups on buyer and package trip
create index if not exists package_bookings_user_idx on public.package_bookings(user_id);
create index if not exists package_bookings_trip_idx on public.package_bookings(trip_id);

-- 3. Enable Row-Level Security (RLS)
alter table public.package_bookings enable row level security;

-- 4. Setup RLS Policies

-- Public select of bookings:
-- Allowed if the booking belongs to the active user OR if the active user is the agency owner who created the package.
create policy "Users can view their own package bookings" on public.package_bookings
  for select using (
    auth.uid() = user_id or 
    exists (
      select 1 from public.trips
      join public.agency_profiles on trips.agency_id = agency_profiles.id
      where trips.id = package_bookings.trip_id and agency_profiles.profile_id = auth.uid()
    )
  );

-- Insert policy:
-- Allowed for any logged in user (making a purchase).
create policy "Authenticated users can insert bookings" on public.package_bookings
  for insert with check (auth.uid() = user_id);

-- 5. Add to Real-Time Publication
do $$
begin
  if not exists (
    select 1 
    from pg_publication_rel pr
    join pg_class c on pr.prrelid = c.oid
    join pg_publication p on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime' and c.relname = 'package_bookings'
  ) then
    alter publication supabase_realtime add table public.package_bookings;
  end if;
end $$;
