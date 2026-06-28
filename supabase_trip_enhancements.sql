-- ============================================================
-- SPOTA TRIP FEATURE & COLLABORATION BACKEND ENHANCEMENTS
-- Run this script in the Supabase SQL Editor to migrate
-- ============================================================

-- 1. Alter trips to support ancestral package lineage
alter table public.trips 
  add column if not exists parent_package_id integer references public.trips(id) on delete set null;

-- 2. Alter trip_spots to support chronological sorting and custom index positioning
alter table public.trip_spots
  add column if not exists sort_order integer default 0;

-- 3. Enhance package_bookings for transaction audit capability
alter table public.package_bookings
  add column if not exists stripe_payment_intent_id text unique,
  add column if not exists stripe_session_id text unique,
  add column if not exists booking_code text unique not null default substring(md5(random()::text), 1, 8),
  add column if not exists base_price numeric default 0.00,
  add column if not exists commission_paid numeric default 0.00;

-- Create indexes to optimize itinerary day sorting and lookup speeds
create index if not exists trip_spots_itinerary_sort_idx on public.trip_spots(trip_id, itinerary_day, sort_order);


-- ============================================================
-- TRIGGERS FOR SLOTS MANAGEMENT & OVERBOOKING PROTECTION
-- ============================================================

-- Create function to enforce overbooking checks and increment booked counters
create or replace function public.check_and_increment_package_slots()
returns trigger as $$
declare
  v_slots_total integer;
  v_slots_booked integer;
begin
  -- Fetch current slots parameters from trips table
  select slots_total, slots_booked
  into v_slots_total, v_slots_booked
  from public.trips
  where id = new.trip_id;
  
  -- Prevent transactions on private or non-package trips
  if v_slots_total is null then
    raise exception 'Target trip is not configured as a bookable travel package.';
  end if;

  -- Enforce strict overbooking guardrail
  if (v_slots_booked + new.travelers_count) > v_slots_total then
    raise exception 'Overbooking blocked. Only % slots remaining, requested %.', 
      (v_slots_total - v_slots_booked), new.travelers_count;
  end if;

  -- Atomically increment slot count
  update public.trips
  set slots_booked = slots_booked + new.travelers_count
  where id = new.trip_id;

  return new;
end;
$$ language plpgsql security definer;

-- Drop and recreate slots trigger
drop trigger if exists package_booking_slots_trigger on public.package_bookings;
create trigger package_booking_slots_trigger
  before insert on public.package_bookings
  for each row execute function public.check_and_increment_package_slots();


-- ============================================================
-- SECURITY DEFINER RPC FUNCTIONS
-- ============================================================

-- RPC 1: Join Trip Board using invite code securely (bypasses select RLS blocks)
create or replace function public.join_trip_with_code(
  p_invite_code text,
  p_user_id uuid
)
returns table (
  trip_id integer,
  trip_name text,
  destination text,
  start_date date,
  end_date date,
  invite_code text
) as $$
declare
  v_trip_id integer;
  v_trip_name text;
  v_destination text;
  v_start_date date;
  v_end_date date;
  v_invite_code text;
begin
  -- Retrieve trip details matching invite_code
  select id, name, destination, start_date, end_date, invite_code
  into v_trip_id, v_trip_name, v_destination, v_start_date, v_end_date, v_invite_code
  from public.trips
  where invite_code = p_invite_code;

  if v_trip_id is null then
    raise exception 'Invalid invite code. Board does not exist.';
  end if;

  -- Insert membership record for this user
  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, p_user_id, 'member')
  on conflict (trip_id, user_id) do nothing;

  return query
  select v_trip_id, v_trip_name, v_destination, v_start_date, v_end_date, v_invite_code;
end;
$$ language plpgsql security definer;


-- RPC 2: Atomic package booking & itinerary cloning
create or replace function public.book_and_clone_itinerary(
  p_package_id integer,
  p_user_id uuid,
  p_travelers_count integer,
  p_amount_paid numeric,
  p_payment_intent_id text,
  p_session_id text
)
returns table (
  new_trip_id integer,
  new_invite_code text
) as $$
declare
  v_package_name text;
  v_package_dest text;
  v_package_creator uuid;
  v_new_trip_id integer;
  v_new_invite_code text;
  v_base_price numeric;
begin
  -- 1. Get package template info
  select name, destination, creator_id, package_price
  into v_package_name, v_package_dest, v_package_creator, v_base_price
  from public.trips
  where id = p_package_id and is_public_package = true;

  if v_package_name is null then
    raise exception 'Target package template does not exist or is not public.';
  end if;

  -- 2. Insert package booking (will fire check_and_increment_package_slots trigger)
  insert into public.package_bookings (
    trip_id,
    user_id,
    amount_paid,
    travelers_count,
    stripe_payment_intent_id,
    stripe_session_id,
    base_price
  ) values (
    p_package_id,
    p_user_id,
    p_amount_paid,
    p_travelers_count,
    p_payment_intent_id,
    p_session_id,
    v_base_price
  );

  -- 3. Generate secure invite code for cloned board
  v_new_invite_code := substring(md5(random()::text), 1, 8);

  -- 4. Create cloned board row
  insert into public.trips (
    name,
    destination,
    invite_code,
    creator_id,
    parent_package_id,
    is_public_package
  ) values (
    'cloned_' || v_package_name,
    v_package_dest,
    v_new_invite_code,
    p_user_id,
    p_package_id,
    false
  ) returning id into v_new_trip_id;

  -- 5. Add creator as member of cloned board
  insert into public.trip_members (trip_id, user_id, role)
  values (v_new_trip_id, p_user_id, 'creator');

  -- 6. Clone all itinerary spots
  insert into public.trip_spots (
    trip_id,
    spot_id,
    added_by,
    added_at,
    visited,
    itinerary_day,
    schedule_time,
    booking_cta_label,
    booking_cta_url,
    sort_order
  )
  select 
    v_new_trip_id,
    spot_id,
    p_user_id,
    now(),
    false,
    itinerary_day,
    schedule_time,
    booking_cta_label,
    booking_cta_url,
    sort_order
  from public.trip_spots
  where trip_id = p_package_id;

  return query
  select v_new_trip_id, v_new_invite_code;
end;
$$ language plpgsql security definer;
