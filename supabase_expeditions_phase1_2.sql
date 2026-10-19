-- ============================================================
-- SPOTA EXPEDITIONS — PHASE 1 (verification + AP) & PHASE 2 (leaderboards)
-- Docs: docs/spota-expeditions-brd.md, docs/spota-expeditions-implementation-plan.md
--
-- Run in the Supabase SQL Editor AFTER supabase_expeditions_setup.sql.
-- Idempotent: safe to re-run.
--
-- Design notes
-- * Verification runs inside Postgres (PostGIS), called automatically at the
--   end of submit_attempt(). No Edge Function to deploy; the client gets the
--   verdict (verified / pending / rejected + awarded AP) in the same response.
-- * Leaderboards are computed live from ap_ledger by get_leaderboard().
--   Fine to ~100k ledger rows; switch to materialized views + pg_cron
--   (plan §2.8) if it ever gets slow.
-- * award_ap() mirrors src/lib/apFormula.js (BRD FR-4.1). Change both together.
-- ============================================================

SET search_path = public, extensions;

-- ------------------------------------------------------------
-- 0. Columns / indexes
-- ------------------------------------------------------------
ALTER TABLE public.adventure_attempts
  ADD COLUMN IF NOT EXISTS awarded_ap  INTEGER,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS adventure_attempts_status_idx ON public.adventure_attempts (status, submitted_at);
CREATE INDEX IF NOT EXISTS ap_ledger_created_idx         ON public.ap_ledger (created_at);
CREATE INDEX IF NOT EXISTS profiles_home_idx             ON public.profiles (home_country, home_state, home_region);


-- ------------------------------------------------------------
-- 1. Helpers
-- ------------------------------------------------------------
-- Is a timestamp (read in IST) inside an 'MM-DD'..'MM-DD' window? Handles windows that wrap the year.
CREATE OR REPLACE FUNCTION public.in_md_window(p_ts TIMESTAMPTZ, p_start TEXT, p_end TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_ts IS NULL OR p_start IS NULL OR p_end IS NULL THEN FALSE
    WHEN p_start <= p_end THEN to_char(p_ts AT TIME ZONE 'Asia/Kolkata', 'MM-DD') BETWEEN p_start AND p_end
    ELSE to_char(p_ts AT TIME ZONE 'Asia/Kolkata', 'MM-DD') >= p_start
      OR to_char(p_ts AT TIME ZONE 'Asia/Kolkata', 'MM-DD') <= p_end
  END;
$$;


-- ------------------------------------------------------------
-- 2. award_ap(): AP formula v1 → ledger → profile total + tier (internal)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_ap(p_attempt UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  a        public.adventure_attempts;
  adv      public.adventures;
  v_prior  INTEGER;
  v_base   NUMERIC;
  v_dist   NUMERIC;
  v_gain   NUMERIC;
  v_alt    NUMERIC;
  v_season NUMERIC;
  v_repeat NUMERIC;
  v_safety NUMERIC;
  v_points INTEGER;
  v_total  INTEGER;
BEGIN
  SELECT * INTO a FROM public.adventure_attempts WHERE id = p_attempt FOR UPDATE;
  IF NOT FOUND OR a.status <> 'verified' THEN
    RAISE EXCEPTION 'Attempt % is not verified', p_attempt;
  END IF;

  -- Idempotent: one award per attempt
  IF EXISTS (SELECT 1 FROM public.ap_ledger WHERE attempt_id = p_attempt AND reason = 'attempt_verified') THEN
    RETURN a.awarded_ap;
  END IF;

  SELECT * INTO adv FROM public.adventures WHERE id = a.adventure_id;

  SELECT count(*) INTO v_prior
    FROM public.ap_ledger l
    JOIN public.adventure_attempts t ON t.id = l.attempt_id
   WHERE l.user_id = a.user_id
     AND t.adventure_id = a.adventure_id
     AND l.reason = 'attempt_verified';

  v_base   := CASE adv.grade WHEN 1 THEN 50 WHEN 2 THEN 100 WHEN 3 THEN 200 WHEN 4 THEN 400 WHEN 5 THEN 800 ELSE 0 END;
  v_dist   := 1 + adv.distance_km / 50.0;
  v_gain   := 1 + adv.elevation_gain_m / 2000.0;
  v_alt    := CASE WHEN adv.max_altitude_m >= 5000 THEN 1.5 WHEN adv.max_altitude_m >= 4000 THEN 1.25 ELSE 1.0 END;
  v_season := CASE WHEN public.in_md_window(a.completed_at, adv.winter_start_md, adv.winter_end_md) THEN 1.3 ELSE 1.0 END;
  v_repeat := CASE WHEN v_prior = 0 THEN 1.0 WHEN v_prior = 1 THEN 0.5 ELSE 0.2 END;
  v_safety := CASE WHEN a.checkins_on_time IS TRUE THEN 0.1 ELSE 0 END;
  -- BRD D1: guided and self-guided score the same (is_guided is not used)

  v_points := round(v_base * v_dist * v_gain * v_alt * v_season * v_repeat * (1 + v_safety));

  INSERT INTO public.ap_ledger (user_id, attempt_id, points, formula_version, breakdown, reason)
  VALUES (a.user_id, a.id, v_points, 'v1',
          jsonb_build_object('base', v_base, 'distanceF', v_dist, 'gainF', v_gain, 'altitudeF', v_alt,
                             'seasonF', v_season, 'repeatF', v_repeat, 'safety', v_safety, 'priorCompletions', v_prior),
          'attempt_verified');

  UPDATE public.adventure_attempts SET awarded_ap = v_points, updated_at = now() WHERE id = a.id;

  SELECT COALESCE(sum(points), 0) INTO v_total FROM public.ap_ledger WHERE user_id = a.user_id;
  UPDATE public.profiles SET total_ap = v_total, tier = public.compute_tier(v_total) WHERE id = a.user_id;

  RETURN v_points;
END;
$$;

REVOKE ALL ON FUNCTION public.award_ap(UUID) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 3. verify_attempt(): BRD FR-3.2 scoring (internal)
--    geofence 35 · route 20 · photo 20 · movement 15 · elevation 10
--    ≥75 verified (+AP) · 40–74 pending (manual review) · <40 rejected (appealable once)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_attempt(p_attempt UUID)
RETURNS public.adventure_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  a            public.adventure_attempts;
  adv          public.adventures;
  v_n          INTEGER;
  v_ref        extensions.geography;
  v_corridor   INTEGER;
  v_in_fence   BOOLEAN := FALSE;
  v_in_corr    NUMERIC := 0;
  v_fast_secs  NUMERIC := 0;
  v_jump       BOOLEAN := FALSE;
  v_max_alt    NUMERIC;
  v_photo_loc  BOOLEAN := FALSE;
  v_photo_time BOOLEAN := FALSE;
  s_geo INTEGER := 0; s_route INTEGER := 0; s_photo INTEGER := 0; s_move INTEGER := 0; s_elev INTEGER := 0;
  v_score      INTEGER;
  v_status     TEXT;
  v_photo_r    INTEGER;
BEGIN
  SELECT * INTO a FROM public.adventure_attempts WHERE id = p_attempt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown attempt'; END IF;
  IF a.status <> 'submitted' THEN RETURN a; END IF;   -- already judged

  SELECT * INTO adv FROM public.adventures WHERE id = a.adventure_id;

  CREATE TEMP TABLE IF NOT EXISTS _vpts (ord INT, g extensions.geography, alt FLOAT8, t FLOAT8) ON COMMIT DROP;
  TRUNCATE _vpts;
  INSERT INTO _vpts
  SELECT e.ord,
         ST_SetSRID(ST_MakePoint((e.pt->>'lng')::float8, (e.pt->>'lat')::float8), 4326)::geography,
         CASE WHEN jsonb_typeof(e.pt->'alt') = 'number' THEN (e.pt->>'alt')::float8 END,
         CASE WHEN jsonb_typeof(e.pt->'t')   = 'number' THEN (e.pt->>'t')::float8 END
    FROM jsonb_array_elements(a.track_points) WITH ORDINALITY AS e(pt, ord);
  SELECT count(*) INTO v_n FROM _vpts;

  -- Geofence (35): any fix inside the endpoint radius
  SELECT EXISTS (SELECT 1 FROM _vpts WHERE ST_DWithin(g, adv.endpoint, adv.endpoint_radius_m)) INTO v_in_fence;
  IF v_in_fence THEN s_geo := 35; END IF;

  -- Route adherence (20): ≥60% of fixes within the corridor. With no reference
  -- route, the corridor is a 1.5 km buffer around start→endpoint.
  IF v_n >= 2 THEN
    IF adv.route IS NOT NULL THEN
      v_ref := adv.route; v_corridor := 500;
    ELSE
      SELECT ST_MakeLine(g::geometry, adv.endpoint::geometry)::geography INTO v_ref FROM _vpts ORDER BY ord LIMIT 1;
      v_corridor := 1500;
    END IF;
    SELECT avg(CASE WHEN ST_DWithin(g, v_ref, v_corridor) THEN 1 ELSE 0 END) INTO v_in_corr FROM _vpts;
    IF v_in_corr >= 0.6 THEN s_route := 20; END IF;
  END IF;

  -- Movement sanity (15): no >15 km/h sustained over 2 min, no >2 km jump at vehicle speed
  IF v_n >= 2 THEN
    WITH seg AS (
      SELECT ST_Distance(g, lag(g) OVER w) AS d, (t - lag(t) OVER w) / 1000.0 AS dt
        FROM _vpts WINDOW w AS (ORDER BY ord)
    )
    SELECT COALESCE(sum(dt) FILTER (WHERE dt > 0 AND d / dt * 3.6 > 15), 0),
           COALESCE(bool_or(d > 2000 AND (dt IS NULL OR dt <= 0 OR d / dt * 3.6 > 15)), FALSE)
      INTO v_fast_secs, v_jump
      FROM seg WHERE d IS NOT NULL;
    IF v_fast_secs <= 120 AND NOT v_jump THEN s_move := 15; END IF;
  END IF;

  -- Elevation (10): reached ≥90% of the adventure's max altitude; 5 if the device gave no altitude
  SELECT max(alt) INTO v_max_alt FROM _vpts;
  IF v_max_alt IS NULL THEN s_elev := 5;
  ELSIF v_max_alt >= 0.9 * adv.max_altitude_m THEN s_elev := 10;
  END IF;

  -- Summit photo (20): location near the endpoint AND taken during the attempt.
  -- Partial: location only 10, time only 5.
  v_photo_r := GREATEST(300, adv.endpoint_radius_m);
  SELECT COALESCE(bool_or(
           jsonb_typeof(m->'lat') = 'number' AND jsonb_typeof(m->'lng') = 'number'
           AND ST_DWithin(ST_SetSRID(ST_MakePoint((m->>'lng')::float8, (m->>'lat')::float8), 4326)::geography,
                          adv.endpoint, v_photo_r)), FALSE),
         COALESCE(bool_or(
           m->>'taken_at' IS NOT NULL
           AND (m->>'taken_at')::timestamptz BETWEEN a.started_at - interval '10 minutes' AND a.completed_at + interval '2 hours'), FALSE)
    INTO v_photo_loc, v_photo_time
    FROM jsonb_array_elements(a.photo_meta) m;
  s_photo := CASE WHEN v_photo_loc AND v_photo_time THEN 20 WHEN v_photo_loc THEN 10 WHEN v_photo_time THEN 5 ELSE 0 END;

  v_score := s_geo + s_route + s_photo + s_move + s_elev;
  -- Never auto-verify (cap at 74 → pending, a human looks at it) when:
  --  * any fix was flagged as a mock location, or
  --  * the movement check failed (vehicle speed / teleport), e.g. driving up a pass with a road
  IF a.mock_point_count > 0 OR (v_n >= 2 AND s_move = 0) THEN v_score := LEAST(v_score, 74); END IF;

  v_status := CASE WHEN v_score >= 75 THEN 'verified' WHEN v_score >= 40 THEN 'pending' ELSE 'rejected' END;

  UPDATE public.adventure_attempts
     SET status = v_status,
         verification_score = v_score,
         verification_breakdown = jsonb_build_object(
           'version', 'v1',
           'geofence',  jsonb_build_object('score', s_geo,   'reached', v_in_fence),
           'route',     jsonb_build_object('score', s_route, 'in_corridor', round(COALESCE(v_in_corr, 0), 2), 'corridor_m', v_corridor),
           'photo',     jsonb_build_object('score', s_photo, 'location', v_photo_loc, 'time', v_photo_time),
           'movement',  jsonb_build_object('score', s_move,  'fast_seconds', round(v_fast_secs), 'jump', v_jump),
           'elevation', jsonb_build_object('score', s_elev,  'max_alt_m', round(v_max_alt::numeric)),
           'points', v_n,
           'mock_points', a.mock_point_count),
         updated_at = now()
   WHERE id = a.id;

  IF v_status = 'verified' THEN
    PERFORM public.award_ap(a.id);
  END IF;

  SELECT * INTO a FROM public.adventure_attempts WHERE id = p_attempt;
  RETURN a;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_attempt(UUID) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 4. submit_attempt(): unchanged checks + auto-verify at the end
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
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_points) pt
    WHERE jsonb_typeof(pt->'lat') <> 'number' OR jsonb_typeof(pt->'lng') <> 'number'
       OR (pt->>'lat')::float8 NOT BETWEEN -90  AND 90
       OR (pt->>'lng')::float8 NOT BETWEEN -180 AND 180
  ) THEN
    RAISE EXCEPTION 'Track contains invalid coordinates';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_photo_paths) p WHERE split_part(p, '/', 1) <> v_uid::text) THEN
    RAISE EXCEPTION 'Photo path outside user folder';
  END IF;

  SELECT count(*) FILTER (WHERE COALESCE((pt->>'mock')::boolean, FALSE))
    INTO v_mock FROM jsonb_array_elements(p_points) pt;

  IF v_count >= 2 THEN
    SELECT ST_MakeLine(array_agg(ST_SetSRID(ST_MakePoint((pt->>'lng')::float8, (pt->>'lat')::float8), 4326) ORDER BY ord))::geography
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
    track = EXCLUDED.track, track_points = EXCLUDED.track_points,
    track_point_count = EXCLUDED.track_point_count, mock_point_count = EXCLUDED.mock_point_count,
    photo_paths = EXCLUDED.photo_paths, photo_meta = EXCLUDED.photo_meta,
    checkins_on_time = EXCLUDED.checkins_on_time, completed_at = EXCLUDED.completed_at,
    updated_at = now()
  WHERE a.user_id = v_uid AND a.status = 'submitted'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.adventure_attempts
     WHERE client_attempt_id = p_client_attempt_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'client_attempt_id conflict';
    END IF;
  END IF;

  -- Phase 1: judge it now; the client gets the verdict in this response
  IF v_row.status = 'submitted' THEN
    v_row := public.verify_attempt(v_row.id);
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_attempt(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT[], JSONB, BOOLEAN, BOOLEAN, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_attempt(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT[], JSONB, BOOLEAN, BOOLEAN, INTEGER) TO authenticated;


-- ------------------------------------------------------------
-- 5. Admin review + user appeal (BRD FR-3.3 / FR-3.4)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_attempt(p_attempt UUID, p_decision TEXT, p_note TEXT DEFAULT NULL)
RETURNS public.adventure_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  a public.adventure_attempts;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be verified or rejected';
  END IF;

  SELECT * INTO a FROM public.adventure_attempts WHERE id = p_attempt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown attempt'; END IF;
  IF a.status = 'verified' THEN
    RAISE EXCEPTION 'Attempt is already verified (use an admin_adjustment ledger entry to correct AP)';
  END IF;

  UPDATE public.adventure_attempts
     SET status = p_decision, reviewed_by = auth.uid(), review_note = p_note,
         reviewed_at = now(), updated_at = now()
   WHERE id = p_attempt;

  IF p_decision = 'verified' THEN
    PERFORM public.award_ap(p_attempt);
  END IF;

  SELECT * INTO a FROM public.adventure_attempts WHERE id = p_attempt;
  RETURN a;
END;
$$;

REVOKE ALL ON FUNCTION public.review_attempt(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_attempt(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.appeal_attempt(p_attempt UUID)
RETURNS public.adventure_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  a public.adventure_attempts;
BEGIN
  SELECT * INTO a FROM public.adventure_attempts WHERE id = p_attempt AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown attempt'; END IF;
  IF a.status <> 'rejected' THEN RAISE EXCEPTION 'Only rejected attempts can be appealed'; END IF;
  IF a.appeal_used THEN RAISE EXCEPTION 'Appeal already used for this attempt'; END IF;

  UPDATE public.adventure_attempts
     SET status = 'pending', appeal_used = TRUE, updated_at = now()
   WHERE id = p_attempt;
  SELECT * INTO a FROM public.adventure_attempts WHERE id = p_attempt;
  RETURN a;
END;
$$;

REVOKE ALL ON FUNCTION public.appeal_attempt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appeal_attempt(UUID) TO authenticated;


-- ------------------------------------------------------------
-- 6. get_leaderboard() — BRD FR-5
--    lens:   'home' (where the user lives) | 'terrain' (where the adventure was)
--    level:  'global' | 'country' | 'state' | 'region'
--    scope:  value for the level (e.g. 'Himachal Pradesh'); for the home lens it
--            defaults to the caller's own home_country / home_state / home_region
--    window: 'all' | 'season' (current calendar quarter, IST)
--    Users with show_on_leaderboards = false are hidden from everyone else but
--    still see their own rank (BRD D2 / FR-5.6). Ties: earlier to reach the total wins.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_lens   TEXT,
  p_level  TEXT,
  p_scope  TEXT    DEFAULT NULL,
  p_window TEXT    DEFAULT 'all',
  p_limit  INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  me      public.profiles;
  v_scope TEXT := NULLIF(trim(p_scope), '');
  v_since TIMESTAMPTZ;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_out   JSONB;
BEGIN
  IF p_lens NOT IN ('home', 'terrain') THEN RAISE EXCEPTION 'lens must be home or terrain'; END IF;
  IF p_level NOT IN ('global', 'country', 'state', 'region') THEN RAISE EXCEPTION 'level must be global, country, state or region'; END IF;
  IF p_window NOT IN ('all', 'season') THEN RAISE EXCEPTION 'window must be all or season'; END IF;

  v_since := CASE WHEN p_window = 'season'
                  THEN date_trunc('quarter', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
                  ELSE '-infinity'::timestamptz END;

  IF v_uid IS NOT NULL THEN
    SELECT * INTO me FROM public.profiles WHERE id = v_uid;
  END IF;

  IF p_level = 'global' THEN
    v_scope := NULL;
  ELSIF v_scope IS NULL THEN
    v_scope := CASE
      WHEN p_lens = 'home' AND p_level = 'country' THEN me.home_country
      WHEN p_lens = 'home' AND p_level = 'state'   THEN me.home_state
      WHEN p_lens = 'home' AND p_level = 'region'  THEN me.home_region
      WHEN p_lens = 'terrain' AND p_level = 'country' THEN 'IN'
      ELSE NULL END;
    IF v_scope IS NULL THEN
      RETURN jsonb_build_object('lens', p_lens, 'level', p_level, 'scope', NULL, 'window', p_window,
                                'needs_scope', TRUE, 'total', 0, 'entries', '[]'::jsonb, 'me', NULL, 'around_me', '[]'::jsonb);
    END IF;
  END IF;

  WITH scored AS (
    SELECT l.user_id, sum(l.points)::INTEGER AS ap, max(l.created_at) AS reached_at
      FROM public.ap_ledger l
      JOIN public.profiles p ON p.id = l.user_id
      LEFT JOIN public.adventure_attempts t ON t.id = l.attempt_id
      LEFT JOIN public.adventures a ON a.id = t.adventure_id
     WHERE l.created_at >= v_since
       AND (p.show_on_leaderboards OR p.id = v_uid)
       AND (
            p_level = 'global'
         OR (p_lens = 'home' AND (
                (p_level = 'country' AND p.home_country = v_scope)
             OR (p_level = 'state'   AND p.home_state   = v_scope)
             OR (p_level = 'region'  AND p.home_region  = v_scope)))
         OR (p_lens = 'terrain' AND (
                (p_level = 'country' AND a.country        = v_scope)
             OR (p_level = 'state'   AND a.state          = v_scope)
             OR (p_level = 'region'  AND a.terrain_region = v_scope)))
       )
     GROUP BY l.user_id
    HAVING sum(l.points) > 0
  ),
  ranked AS (
    SELECT s.*, RANK() OVER (ORDER BY s.ap DESC, s.reached_at ASC) AS rnk FROM scored s
  ),
  rows AS (
    SELECT r.rnk, r.ap, r.reached_at, r.user_id, p.username, p.avatar_url, p.tier
      FROM ranked r JOIN public.profiles p ON p.id = r.user_id
  ),
  my AS (SELECT * FROM rows WHERE user_id = v_uid)
  SELECT jsonb_build_object(
    'lens', p_lens, 'level', p_level, 'scope', v_scope, 'window', p_window, 'needs_scope', FALSE,
    'total', (SELECT count(*) FROM rows),
    'entries', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('rank', x.rnk, 'username', x.username, 'avatar_url', x.avatar_url,
                                           'tier', x.tier, 'ap', x.ap, 'is_me', x.user_id = v_uid)
                        ORDER BY x.rnk, x.reached_at)
         FROM (SELECT * FROM rows ORDER BY rnk, reached_at LIMIT v_limit) x), '[]'::jsonb),
    'me', (SELECT jsonb_build_object('rank', m.rnk, 'ap', m.ap, 'tier', m.tier, 'username', m.username) FROM my m),
    'around_me', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('rank', x.rnk, 'username', x.username, 'avatar_url', x.avatar_url,
                                           'tier', x.tier, 'ap', x.ap, 'is_me', x.user_id = v_uid)
                        ORDER BY x.rnk, x.reached_at)
         FROM rows x, my m
        WHERE m.rnk > v_limit AND x.rnk BETWEEN m.rnk - 5 AND m.rnk + 5), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT, TEXT, TEXT, TEXT, INTEGER) TO anon, authenticated;
