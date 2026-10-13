-- ============================================================
-- SPOTA EXPEDITIONS — PHASE 0 MIGRATION
-- Verified real-life adventures + ranked leaderboards
-- Docs: docs/spota-expeditions-brd.md, docs/spota-expeditions-implementation-plan.md
--
-- Run in the Supabase SQL Editor AFTER supabase_safe_trek_setup.sql.
-- Adds profiles.is_admin itself if supabase_p0_security_fixes.sql hasn't run.
-- Idempotent: safe to re-run.
--
-- Scope of this file (Phase 0):
--   extensions, profile columns + guard, adventures catalog,
--   adventure_attempts, ap_ledger, RLS, private photo bucket,
--   compute_tier(), submit_attempt() RPC.
-- NOT here yet: verification (Phase 1), award_ap() (Phase 1),
--   leaderboard materialized views + pg_cron refresh (Phase 2).
-- ============================================================


-- ------------------------------------------------------------
-- 0. Extensions
--    Supabase convention is to install into the `extensions` schema,
--    which is on the default search_path for API + SQL editor roles.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;   -- used from Phase 2 (leaderboard refresh)


-- ------------------------------------------------------------
-- 1. Profile additions
-- ------------------------------------------------------------
-- is_admin normally comes from supabase_p0_security_fixes.sql; added here too
-- (no-op if present) because the admin policies below depend on it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_country TEXT DEFAULT 'IN',
  ADD COLUMN IF NOT EXISTS home_state   TEXT,
  ADD COLUMN IF NOT EXISTS home_region  TEXT,                      -- district / city
  ADD COLUMN IF NOT EXISTS tier         TEXT NOT NULL DEFAULT 'wanderer',
  ADD COLUMN IF NOT EXISTS total_ap     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_on_leaderboards BOOLEAN NOT NULL DEFAULT TRUE;  -- BRD D2: public by default

-- Users can edit their own profile via the existing RLS policy (which has no
-- column restriction), but must never be able to set their own tier / AP or
-- make themselves admin. tier / total_ap are written only by SECURITY DEFINER
-- functions (award_ap, Phase 1); is_admin only from the dashboard / SQL editor.
CREATE OR REPLACE FUNCTION public.guard_profile_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.tier     := OLD.tier;
    NEW.total_ap := OLD.total_ap;
    NEW.is_admin := OLD.is_admin;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_progress ON public.profiles;
CREATE TRIGGER guard_profile_progress
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_progress();


-- ------------------------------------------------------------
-- 2. Adventure catalog
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adventures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  grade             SMALLINT NOT NULL CHECK (grade BETWEEN 1 AND 5),
  distance_km       NUMERIC(6,2) NOT NULL CHECK (distance_km > 0),
  elevation_gain_m  INTEGER NOT NULL CHECK (elevation_gain_m >= 0),
  max_altitude_m    INTEGER NOT NULL CHECK (max_altitude_m > 0),
  typical_days      SMALLINT NOT NULL DEFAULT 1,
  start_point       extensions.geography(POINT, 4326),
  endpoint          extensions.geography(POINT, 4326) NOT NULL,
  endpoint_radius_m INTEGER NOT NULL DEFAULT 150,
  route             extensions.geography(LINESTRING, 4326),   -- optional reference route
  country           TEXT NOT NULL DEFAULT 'IN',
  state             TEXT NOT NULL,
  terrain_region    TEXT NOT NULL,                             -- Kullu, Garhwal, Kumaon…
  winter_start_md   TEXT CHECK (winter_start_md ~ '^\d{2}-\d{2}$'),  -- 'MM-DD'
  winter_end_md     TEXT CHECK (winter_end_md   ~ '^\d{2}-\d{2}$'),
  cover_url         TEXT,
  coords_verified   BOOLEAN NOT NULL DEFAULT FALSE,            -- false = dev/approximate data
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adventures_state_idx    ON public.adventures (country, state, terrain_region);
CREATE INDEX IF NOT EXISTS adventures_endpoint_gix ON public.adventures USING GIST (endpoint);


-- ------------------------------------------------------------
-- 3. Attempts
--    The device records offline and submits ONCE on completion via
--    submit_attempt(). There is no server-side "recording" state, because
--    trailheads usually have no signal.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adventure_attempts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_attempt_id  TEXT UNIQUE NOT NULL,                     -- idempotency key from device
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  adventure_id       UUID NOT NULL REFERENCES public.adventures(id),
  safe_trek_id       INTEGER REFERENCES public.safe_treks(id) ON DELETE SET NULL,
  is_guided          BOOLEAN NOT NULL DEFAULT FALSE,           -- BRD D1: analytics only, no score effect
  started_at         TIMESTAMPTZ NOT NULL,
  completed_at       TIMESTAMPTZ NOT NULL,
  track              extensions.geography(LINESTRING, 4326),   -- 2D line for geofence / route checks
  track_points       JSONB NOT NULL DEFAULT '[]',              -- [{lat,lng,alt,acc,t,mock}] for speed/elevation checks
  track_point_count  INTEGER NOT NULL DEFAULT 0,
  mock_point_count   INTEGER NOT NULL DEFAULT 0,               -- Android mock-location flags
  photo_paths        TEXT[] NOT NULL DEFAULT '{}',
  photo_meta         JSONB NOT NULL DEFAULT '[]',              -- [{path,lat,lng,taken_at}]
  checkins_on_time   BOOLEAN,
  status             TEXT NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('submitted', 'verified', 'pending', 'rejected')),
  verification_score SMALLINT,
  verification_breakdown JSONB,
  reviewed_by        UUID REFERENCES public.profiles(id),
  review_note        TEXT,
  appeal_used        BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (completed_at >= started_at)
);

CREATE INDEX IF NOT EXISTS adventure_attempts_user_idx      ON public.adventure_attempts (user_id);
CREATE INDEX IF NOT EXISTS adventure_attempts_adv_status_idx ON public.adventure_attempts (adventure_id, status);
CREATE INDEX IF NOT EXISTS adventure_attempts_track_gix     ON public.adventure_attempts USING GIST (track);


-- ------------------------------------------------------------
-- 4. AP ledger (append-only). Totals are always derived from here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ap_ledger (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_id      UUID REFERENCES public.adventure_attempts(id) ON DELETE SET NULL,
  points          INTEGER NOT NULL,
  formula_version TEXT NOT NULL DEFAULT 'v1',
  breakdown       JSONB NOT NULL,          -- {base, distanceF, gainF, altitudeF, seasonF, repeatF, safety}
  reason          TEXT NOT NULL DEFAULT 'attempt_verified'
                  CHECK (reason IN ('attempt_verified', 'admin_adjustment', 'recalc')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ap_ledger_user_idx ON public.ap_ledger (user_id);
-- One award per attempt (award_ap must be idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS ap_ledger_one_award_per_attempt
  ON public.ap_ledger (attempt_id) WHERE reason = 'attempt_verified';


-- ------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.adventures         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adventure_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_ledger          ENABLE ROW LEVEL SECURITY;

-- adventures: public read of active rows; admins manage
DROP POLICY IF EXISTS "Anyone can read active adventures" ON public.adventures;
CREATE POLICY "Anyone can read active adventures" ON public.adventures
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins manage adventures" ON public.adventures;
CREATE POLICY "Admins manage adventures" ON public.adventures
  FOR ALL
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

-- attempts: owner + admin can read (tracks are NEVER public, per BRD D2).
-- No direct INSERT/UPDATE for users; writes go through submit_attempt().
DROP POLICY IF EXISTS "Owners and admins read attempts" ON public.adventure_attempts;
CREATE POLICY "Owners and admins read attempts" ON public.adventure_attempts
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
  );

DROP POLICY IF EXISTS "Admins review attempts" ON public.adventure_attempts;
CREATE POLICY "Admins review attempts" ON public.adventure_attempts
  FOR UPDATE
  USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

-- ledger: owner read-only; writes only via SECURITY DEFINER functions
DROP POLICY IF EXISTS "Owners read own ledger" ON public.ap_ledger;
CREATE POLICY "Owners read own ledger" ON public.ap_ledger
  FOR SELECT USING (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 6. Private storage bucket for summit photos
--    Path convention: {user_id}/{client_attempt_id}/{n}.jpg
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('expedition-photos', 'expedition-photos', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own expedition photos" ON storage.objects;
CREATE POLICY "Users upload own expedition photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expedition-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users update own expedition photos" ON storage.objects;
CREATE POLICY "Users update own expedition photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'expedition-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owners and admins read expedition photos" ON storage.objects;
CREATE POLICY "Owners and admins read expedition photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'expedition-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
    )
  );


-- ------------------------------------------------------------
-- 7. compute_tier(ap) — BRD FR-6
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_tier(p_ap INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_ap >= 15000 THEN 'expedition_legend'
    WHEN p_ap >=  6000 THEN 'summiteer'
    WHEN p_ap >=  2000 THEN 'ridge_runner'
    WHEN p_ap >=   500 THEN 'trailblazer'
    ELSE 'wanderer'
  END;
$$;


-- ------------------------------------------------------------
-- 8. submit_attempt() — the only write path for attempts.
--    Called by src/lib/expeditionService.js after the device syncs.
--    Idempotent on client_attempt_id: an offline retry re-submits safely
--    while the attempt is still 'submitted' (not yet judged).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_attempt(
  p_client_attempt_id TEXT,
  p_adventure_id      UUID,
  p_started_at        TIMESTAMPTZ,
  p_completed_at      TIMESTAMPTZ,
  p_points            JSONB,
  p_photo_paths       TEXT[]  DEFAULT '{}',
  p_photo_meta        JSONB   DEFAULT '[]',
  p_checkins_on_time  BOOLEAN DEFAULT NULL,
  p_is_guided         BOOLEAN DEFAULT FALSE,
  p_safe_trek_id      INTEGER DEFAULT NULL
)
RETURNS public.adventure_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_count INTEGER;
  v_mock  INTEGER;
  v_line  extensions.geography;
  v_row   public.adventure_attempts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_client_attempt_id IS NULL OR length(p_client_attempt_id) NOT BETWEEN 8 AND 64 THEN
    RAISE EXCEPTION 'Invalid client_attempt_id';
  END IF;

  IF jsonb_typeof(p_points) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_points must be a JSON array';
  END IF;

  v_count := jsonb_array_length(p_points);
  IF v_count > 20000 THEN
    RAISE EXCEPTION 'Track too large (% points, max 20000)', v_count;
  END IF;

  IF p_completed_at < p_started_at OR p_completed_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'Invalid attempt time window';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.adventures WHERE id = p_adventure_id AND is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive adventure';
  END IF;

  IF p_safe_trek_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.safe_treks WHERE id = p_safe_trek_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Safe trek does not belong to user';
  END IF;

  -- Reject malformed coordinates up-front
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_points) pt
    WHERE jsonb_typeof(pt->'lat') <> 'number' OR jsonb_typeof(pt->'lng') <> 'number'
       OR (pt->>'lat')::float8 NOT BETWEEN -90  AND 90
       OR (pt->>'lng')::float8 NOT BETWEEN -180 AND 180
  ) THEN
    RAISE EXCEPTION 'Track contains invalid coordinates';
  END IF;

  -- Photo paths must live in the caller's own folder
  IF EXISTS (SELECT 1 FROM unnest(p_photo_paths) p WHERE split_part(p, '/', 1) <> v_uid::text) THEN
    RAISE EXCEPTION 'Photo path outside user folder';
  END IF;

  SELECT count(*) FILTER (WHERE COALESCE((pt->>'mock')::boolean, FALSE))
    INTO v_mock
    FROM jsonb_array_elements(p_points) pt;

  IF v_count >= 2 THEN
    SELECT ST_MakeLine(
             array_agg(ST_SetSRID(ST_MakePoint((pt->>'lng')::float8, (pt->>'lat')::float8), 4326)
                       ORDER BY ord)
           )::geography
      INTO v_line
      FROM jsonb_array_elements(p_points) WITH ORDINALITY AS e(pt, ord);
  END IF;

  INSERT INTO public.adventure_attempts AS a (
    client_attempt_id, user_id, adventure_id, safe_trek_id, is_guided,
    started_at, completed_at, track, track_points, track_point_count, mock_point_count,
    photo_paths, photo_meta, checkins_on_time, status
  ) VALUES (
    p_client_attempt_id, v_uid, p_adventure_id, p_safe_trek_id, COALESCE(p_is_guided, FALSE),
    p_started_at, p_completed_at, v_line, p_points, v_count, v_mock,
    COALESCE(p_photo_paths, '{}'), COALESCE(p_photo_meta, '[]'), p_checkins_on_time, 'submitted'
  )
  ON CONFLICT (client_attempt_id) DO UPDATE SET
    track             = EXCLUDED.track,
    track_points      = EXCLUDED.track_points,
    track_point_count = EXCLUDED.track_point_count,
    mock_point_count  = EXCLUDED.mock_point_count,
    photo_paths       = EXCLUDED.photo_paths,
    photo_meta        = EXCLUDED.photo_meta,
    checkins_on_time  = EXCLUDED.checkins_on_time,
    completed_at      = EXCLUDED.completed_at,
    updated_at        = now()
  WHERE a.user_id = v_uid AND a.status = 'submitted'
  RETURNING * INTO v_row;

  -- Conflict but no update: either already judged (return it as-is) or someone else's id
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.adventure_attempts
     WHERE client_attempt_id = p_client_attempt_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'client_attempt_id conflict';
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_attempt(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT[], JSONB, BOOLEAN, BOOLEAN, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_attempt(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT[], JSONB, BOOLEAN, BOOLEAN, INTEGER) TO authenticated;
