-- SQL Migration: Update RLS select policies for Trip Invites & Marketplace Packages
-- Run these statements in your Supabase SQL Editor to enable invite code joins and QR code links.

-- 1. Enable select permissions on trips table for authenticated users
-- (Enables other users to look up a trip board by its invite code to join it)
drop policy if exists "Users can select trips they are member of" on public.trips;
drop policy if exists "Users can select trips they are member of or public packages" on public.trips;
drop policy if exists "Authenticated users can select trips" on public.trips;

create policy "Authenticated users can select trips" 
  on public.trips
  for select 
  using (auth.uid() is not null);

-- 2. Update public.trip_spots select policy
-- (Enables previewing spots of a public package route before purchasing it)
drop policy if exists "Members can view trip spots" on public.trip_spots;
drop policy if exists "Members can view trip spots or public package spots" on public.trip_spots;

create policy "Members can view trip spots or public package spots" 
  on public.trip_spots
  for select 
  using (
    exists (
      select 1 from public.trips 
      where trips.id = trip_spots.trip_id and trips.is_public_package = true
    ) or public.check_is_trip_member(trip_id, auth.uid())
  );
