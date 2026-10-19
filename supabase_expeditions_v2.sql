-- ============================================================
-- Spota Expeditions — V2 (buddy/guide attestation, user-submitted routes,
-- agency challenges). Run after supabase_expeditions_phase3.sql.
-- Safe to re-run.
--
--   0. partner_verified_at on agencies (admin-granted; verified_at is self-set).
--   A. Attestations: a Ridge Runner+ buddy or a partner-agency guide vouches
--      for a trek. +15 score once per trek. D6 still applies: mock-GPS or
--      vehicle-speed tracks are capped at 74, so they always reach a human.
--   B. Route submissions: trekkers propose adventures; admins approve them
--      into the catalog.
--   C. Agency challenges: partner agencies run time-boxed challenges
--      ("3 Kullu treks by 31 Dec"); trekkers join and progress is computed
--      from verified attempts.
-- ============================================================

SET search_path = public, extensions;

-- ------------------------------------------------------------
-- 0. Expedition partner flag on agencies (admin-granted)
--    agency_profiles.verified_at is set by the agency itself during the
--    (simulated) checkout, so it cannot be trusted for vouching or challenges.
--    partner_verified_at can only be set by an admin.
-- ------------------------------------------------------------
ALTER TABLE public.agency_profiles
  ADD COLUMN IF NOT EXISTS partner_verified_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.guard_agency_partner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER   -- must run as the caller so current_user is 'authenticated' for app users
SET search_path = public, extensions
AS $$
BEGIN
  -- Signed-in users (incl. the agency itself) can never set it; set_agency_partner()
  -- runs as the function owner, so it is not caught here.
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.partner_verified_at := CASE WHEN TG_OP = 'UPDATE' THEN OLD.partner_verified_at ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_agency_partner() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_agency_partner ON public.agency_profiles;
CREATE TRIGGER guard_agency_partner BEFORE INSERT OR UPDATE ON public.agency_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_agency_partner();

CREATE OR REPLACE FUNCTION public.set_agency_partner(p_agency INTEGER, p_verified BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  UPDATE public.agency_profiles
     SET partner_verified_at = CASE WHEN p_verified THEN now() END
   WHERE id = p_agency;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown agency'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_agency_partner(INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_agency_partner(INTEGER, BOOLEAN) TO authenticated;

-- Admin list of agencies for the partner toggle
CREATE OR REPLACE FUNCTION public.list_agencies_for_admin()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', ag.id, 'company_name', ag.company_name, 'website_url', ag.website_url,
            'username', p.username, 'created_at', ag.created_at,
            'partner', ag.partner_verified_at IS NOT NULL) ORDER BY ag.created_at DESC)
            FROM public.agency_profiles ag JOIN public.profiles p ON p.id = ag.profile_id), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_agencies_for_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_agencies_for_admin() TO authenticated;

-- ------------------------------------------------------------
-- A. Attestations
-- ------------------------------------------------------------
ALTER TABLE public.adventure_attempts
  ADD COLUMN IF NOT EXISTS attestation_bonus SMALLINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.attempt_attestations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id   UUID NOT NULL REFERENCES public.adventure_attempts(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attester_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'buddy' CHECK (role IN ('buddy', 'guide')),
  status       TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'declined')),
  note         TEXT CHECK (char_length(note) <= 280),
  bonus_applied BOOLEAN NOT NULL DEFAULT FALSE,
  flags        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (attempt_id, attester_id),
  CHECK (requester_id <> attester_id)
);
CREATE INDEX IF NOT EXISTS attempt_attestations_attester_idx ON public.attempt_attestations (attester_id, status);
CREATE INDEX IF NOT EXISTS attempt_attestations_requester_idx ON public.attempt_attestations (requester_id);

ALTER TABLE public.attempt_attestations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.attempt_attestations TO authenticated;
DROP POLICY IF EXISTS "Parties and admins read attestations" ON public.attempt_attestations;
CREATE POLICY "Parties and admins read attestations" ON public.attempt_attestations
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR attester_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));
-- No INSERT/UPDATE/DELETE policies: writes go through the RPCs below.

-- Who may vouch: buddies need Ridge Runner+ (BRD FR-6), guides need a verified agency.
CREATE OR REPLACE FUNCTION public.can_attest(p_user UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CASE p_role
    WHEN 'buddy' THEN EXISTS (SELECT 1 FROM public.profiles
                               WHERE id = p_user AND tier IN ('ridge_runner', 'summiteer', 'expedition_legend'))
    WHEN 'guide' THEN EXISTS (SELECT 1 FROM public.agency_profiles
                               WHERE profile_id = p_user AND partner_verified_at IS NOT NULL)
    ELSE FALSE END;
$$;
REVOKE ALL ON FUNCTION public.can_attest(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_attestation(p_attempt UUID, p_username TEXT, p_role TEXT DEFAULT 'buddy')
RETURNS public.attempt_attestations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  a        public.adventure_attempts;
  v_target UUID;
  r        public.attempt_attestations;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501'; END IF;
  IF p_role NOT IN ('buddy', 'guide') THEN RAISE EXCEPTION 'Role must be buddy or guide'; END IF;

  SELECT * INTO a FROM public.adventure_attempts WHERE id = p_attempt AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown attempt'; END IF;
  IF a.status NOT IN ('pending', 'rejected') OR a.reviewed_by IS NOT NULL THEN
    RAISE EXCEPTION 'Only treks still waiting for a decision can be vouched for';
  END IF;
  IF a.completed_at < now() - interval '14 days' THEN
    RAISE EXCEPTION 'Vouches must be requested within 14 days of the trek';
  END IF;
  IF (SELECT count(*) FROM public.attempt_attestations WHERE attempt_id = p_attempt) >= 3 THEN
    RAISE EXCEPTION 'Up to 3 vouch requests per trek';
  END IF;

  SELECT id INTO v_target FROM public.profiles WHERE lower(username) = lower(trim(p_username));
  IF v_target IS NULL THEN RAISE EXCEPTION 'No Spota user called %', p_username; END IF;
  IF v_target = auth.uid() THEN RAISE EXCEPTION 'You cannot vouch for yourself'; END IF;
  IF NOT public.can_attest(v_target, p_role) THEN
    RAISE EXCEPTION '%', CASE p_role WHEN 'buddy' THEN 'Buddies need to be Ridge Runner tier or higher'
                                     ELSE 'Guides need a Spota partner agency account' END;
  END IF;

  INSERT INTO public.attempt_attestations (attempt_id, requester_id, attester_id, role)
  VALUES (p_attempt, auth.uid(), v_target, p_role)
  ON CONFLICT (attempt_id, attester_id) DO NOTHING
  RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'You already asked this person'; END IF;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.request_attestation(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_attestation(UUID, TEXT, TEXT) TO authenticated;

-- Apply the +15 once per attempt. D6 cap and admin decisions are respected.
CREATE OR REPLACE FUNCTION public.apply_attestation_bonus(p_attestation UUID)
RETURNS public.adventure_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  t        public.attempt_attestations;
  a        public.adventure_attempts;
  v_score  INTEGER;
  v_status TEXT;
  v_name   TEXT;
BEGIN
  SELECT * INTO t FROM public.attempt_attestations WHERE id = p_attestation;
  SELECT * INTO a FROM public.adventure_attempts WHERE id = t.attempt_id FOR UPDATE;
  IF a.attestation_bonus > 0 OR a.reviewed_by IS NOT NULL OR a.status NOT IN ('pending', 'rejected') THEN
    RETURN a;
  END IF;

  v_score := LEAST(100, COALESCE(a.verification_score, 0) + 15);
  IF a.mock_point_count > 0
     OR (COALESCE((a.verification_breakdown ->> 'points')::int, 0) >= 2
         AND COALESCE((a.verification_breakdown -> 'movement' ->> 'score')::int, 0) = 0) THEN
    v_score := LEAST(v_score, 74);
  END IF;
  v_status := CASE WHEN v_score >= 75 THEN 'verified' WHEN v_score >= 40 THEN 'pending' ELSE 'rejected' END;
  SELECT username INTO v_name FROM public.profiles WHERE id = t.attester_id;

  UPDATE public.adventure_attempts
     SET attestation_bonus = 15,
         verification_score = v_score,
         status = v_status,
         verification_breakdown = COALESCE(verification_breakdown, '{}'::jsonb) || jsonb_build_object(
           'attestation', jsonb_build_object('score', 15, 'role', t.role, 'by', v_name, 'flags', t.flags)),
         updated_at = now()
   WHERE id = a.id;
  UPDATE public.attempt_attestations SET bonus_applied = TRUE WHERE id = t.id;

  IF v_status = 'verified' THEN PERFORM public.award_ap(a.id); END IF;
  SELECT * INTO a FROM public.adventure_attempts WHERE id = t.attempt_id;
  RETURN a;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_attestation_bonus(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.respond_attestation(p_attestation UUID, p_confirm BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS public.attempt_attestations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  t           public.attempt_attestations;
  a           public.adventure_attempts;
  v_recent    INTEGER;
  v_recip     BOOLEAN;
  v_cotracked BOOLEAN;
BEGIN
  SELECT * INTO t FROM public.attempt_attestations
   WHERE id = p_attestation AND attester_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown vouch request'; END IF;
  IF t.status <> 'requested' THEN RAISE EXCEPTION 'Already answered'; END IF;

  IF NOT p_confirm THEN
    UPDATE public.attempt_attestations SET status = 'declined', responded_at = now(), note = p_note
     WHERE id = t.id RETURNING * INTO t;
    RETURN t;
  END IF;

  IF NOT public.can_attest(auth.uid(), t.role) THEN
    RAISE EXCEPTION 'You are no longer eligible to vouch as a %', t.role;
  END IF;
  SELECT count(*) INTO v_recent FROM public.attempt_attestations
   WHERE attester_id = auth.uid() AND status = 'confirmed' AND responded_at > now() - interval '30 days';
  IF v_recent >= 10 THEN RAISE EXCEPTION 'Vouch limit reached (10 per 30 days)'; END IF;

  SELECT * INTO a FROM public.adventure_attempts WHERE id = t.attempt_id;
  -- Collusion signal: the two users vouched for each other in the last 30 days → no bonus.
  SELECT EXISTS (SELECT 1 FROM public.attempt_attestations
                  WHERE attester_id = t.requester_id AND requester_id = auth.uid()
                    AND status = 'confirmed' AND responded_at > now() - interval '30 days') INTO v_recip;
  -- Helpful signal for admins: the attester recorded the same adventure the same day.
  SELECT EXISTS (SELECT 1 FROM public.adventure_attempts o
                  WHERE o.user_id = auth.uid() AND o.adventure_id = a.adventure_id
                    AND o.started_at < a.completed_at + interval '12 hours'
                    AND o.completed_at > a.started_at - interval '12 hours') INTO v_cotracked;

  UPDATE public.attempt_attestations
     SET status = 'confirmed', responded_at = now(), note = p_note,
         flags = jsonb_build_object('reciprocal', v_recip, 'co_tracked', v_cotracked)
   WHERE id = t.id RETURNING * INTO t;

  IF NOT v_recip THEN PERFORM public.apply_attestation_bonus(t.id); END IF;
  SELECT * INTO t FROM public.attempt_attestations WHERE id = t.id;
  RETURN t;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_attestation(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_attestation(UUID, BOOLEAN, TEXT) TO authenticated;

-- Incoming + outgoing vouches for the caller, with names (attempts themselves stay private).
CREATE OR REPLACE FUNCTION public.list_attestations()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT jsonb_build_object(
    'incoming', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'role', t.role, 'status', t.status, 'created_at', t.created_at,
        'requester', p.username, 'adventure', ad.name, 'completed_at', a.completed_at)
        ORDER BY t.created_at DESC)
      FROM public.attempt_attestations t
      JOIN public.profiles p ON p.id = t.requester_id
      JOIN public.adventure_attempts a ON a.id = t.attempt_id
      JOIN public.adventures ad ON ad.id = a.adventure_id
     WHERE t.attester_id = auth.uid() AND t.created_at > now() - interval '60 days'), '[]'::jsonb),
    'outgoing', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'attempt_id', t.attempt_id, 'role', t.role, 'status', t.status,
        'attester', p.username, 'bonus_applied', t.bonus_applied)
        ORDER BY t.created_at DESC)
      FROM public.attempt_attestations t
      JOIN public.profiles p ON p.id = t.attester_id
     WHERE t.requester_id = auth.uid() AND t.created_at > now() - interval '60 days'), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.list_attestations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_attestations() TO authenticated;


-- ------------------------------------------------------------
-- B. User-submitted routes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.adventure_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name             TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  state            TEXT NOT NULL CHECK (char_length(state) BETWEEN 2 AND 60),
  terrain_region   TEXT NOT NULL CHECK (char_length(terrain_region) BETWEEN 2 AND 60),
  grade            SMALLINT NOT NULL CHECK (grade BETWEEN 1 AND 5),
  distance_km      NUMERIC(6,2) NOT NULL CHECK (distance_km > 0 AND distance_km <= 500),
  elevation_gain_m INTEGER NOT NULL CHECK (elevation_gain_m BETWEEN 0 AND 10000),
  max_altitude_m   INTEGER NOT NULL CHECK (max_altitude_m BETWEEN 1 AND 9000),
  typical_days     SMALLINT NOT NULL DEFAULT 1 CHECK (typical_days BETWEEN 1 AND 30),
  endpoint         extensions.geography(Point, 4326) NOT NULL,
  start_point      extensions.geography(Point, 4326),
  notes            TEXT CHECK (char_length(notes) <= 1000),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note      TEXT,
  reviewed_by      UUID REFERENCES public.profiles(id),
  reviewed_at      TIMESTAMPTZ,
  adventure_id     UUID REFERENCES public.adventures(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adventure_submissions_status_idx ON public.adventure_submissions (status, created_at);
CREATE INDEX IF NOT EXISTS adventure_submissions_user_idx ON public.adventure_submissions (submitted_by);

ALTER TABLE public.adventure_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.adventure_submissions TO authenticated;
DROP POLICY IF EXISTS "Owners and admins read submissions" ON public.adventure_submissions;
CREATE POLICY "Owners and admins read submissions" ON public.adventure_submissions
  FOR SELECT TO authenticated
  USING (submitted_by = auth.uid()
         OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

CREATE OR REPLACE FUNCTION public.submit_adventure(
  p_name TEXT, p_state TEXT, p_region TEXT, p_grade SMALLINT,
  p_distance_km NUMERIC, p_gain_m INTEGER, p_max_alt_m INTEGER, p_days SMALLINT,
  p_end_lat DOUBLE PRECISION, p_end_lng DOUBLE PRECISION,
  p_start_lat DOUBLE PRECISION DEFAULT NULL, p_start_lng DOUBLE PRECISION DEFAULT NULL,
  p_notes TEXT DEFAULT NULL)
RETURNS public.adventure_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_end   extensions.geography;
  v_dup   TEXT;
  r       public.adventure_submissions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501'; END IF;
  IF p_end_lat IS NULL OR p_end_lng IS NULL OR p_end_lat NOT BETWEEN -90 AND 90 OR p_end_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'A valid summit / endpoint location is required';
  END IF;
  IF (SELECT count(*) FROM public.adventure_submissions WHERE submitted_by = auth.uid() AND status = 'pending') >= 5 THEN
    RAISE EXCEPTION 'You already have 5 routes waiting for review';
  END IF;

  v_end := ST_SetSRID(ST_MakePoint(p_end_lng, p_end_lat), 4326)::geography;
  SELECT name INTO v_dup FROM public.adventures
   WHERE is_active AND ST_DWithin(endpoint, v_end, 300) LIMIT 1;
  IF v_dup IS NOT NULL THEN RAISE EXCEPTION '"%" already ends here', v_dup; END IF;
  SELECT name INTO v_dup FROM public.adventure_submissions
   WHERE status = 'pending' AND ST_DWithin(endpoint, v_end, 300) LIMIT 1;
  IF v_dup IS NOT NULL THEN RAISE EXCEPTION '"%" was already suggested for this spot', v_dup; END IF;

  INSERT INTO public.adventure_submissions
    (submitted_by, name, state, terrain_region, grade, distance_km, elevation_gain_m, max_altitude_m,
     typical_days, endpoint, start_point, notes)
  VALUES (auth.uid(), trim(p_name), trim(p_state), trim(p_region), p_grade, p_distance_km, p_gain_m, p_max_alt_m,
          COALESCE(p_days, 1), v_end,
          CASE WHEN p_start_lat IS NOT NULL AND p_start_lng IS NOT NULL
               THEN ST_SetSRID(ST_MakePoint(p_start_lng, p_start_lat), 4326)::geography END,
          NULLIF(trim(p_notes), ''))
  RETURNING * INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_adventure(TEXT, TEXT, TEXT, SMALLINT, NUMERIC, INTEGER, INTEGER, SMALLINT,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_adventure(TEXT, TEXT, TEXT, SMALLINT, NUMERIC, INTEGER, INTEGER, SMALLINT,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_adventure_submission(
  p_submission UUID, p_decision TEXT, p_note TEXT DEFAULT NULL,
  p_coords_verified BOOLEAN DEFAULT FALSE, p_radius_m INTEGER DEFAULT 150)
RETURNS public.adventure_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  s      public.adventure_submissions;
  v_slug TEXT;
  v_n    INTEGER := 1;
  v_adv  UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Decision must be approved or rejected'; END IF;

  SELECT * INTO s FROM public.adventure_submissions WHERE id = p_submission FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown submission'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;

  IF p_decision = 'approved' THEN
    v_slug := trim(BOTH '-' FROM regexp_replace(lower(s.name), '[^a-z0-9]+', '-', 'g'));
    IF v_slug = '' THEN v_slug := 'adventure'; END IF;
    WHILE EXISTS (SELECT 1 FROM public.adventures WHERE slug = CASE WHEN v_n = 1 THEN v_slug ELSE v_slug || '-' || v_n END) LOOP
      v_n := v_n + 1;
    END LOOP;
    IF v_n > 1 THEN v_slug := v_slug || '-' || v_n; END IF;

    INSERT INTO public.adventures (slug, name, description, grade, distance_km, elevation_gain_m, max_altitude_m,
                                   typical_days, start_point, endpoint, endpoint_radius_m, state, terrain_region,
                                   coords_verified, is_active)
    VALUES (v_slug, s.name, s.notes, s.grade, s.distance_km, s.elevation_gain_m, s.max_altitude_m,
            s.typical_days, s.start_point, s.endpoint, GREATEST(50, LEAST(COALESCE(p_radius_m, 150), 1000)),
            s.state, s.terrain_region, COALESCE(p_coords_verified, FALSE), TRUE)
    RETURNING id INTO v_adv;
  END IF;

  UPDATE public.adventure_submissions
     SET status = p_decision, review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(), adventure_id = v_adv
   WHERE id = p_submission RETURNING * INTO s;
  RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION public.review_adventure_submission(UUID, TEXT, TEXT, BOOLEAN, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_adventure_submission(UUID, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;


-- ------------------------------------------------------------
-- C. Agency challenges
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      INTEGER REFERENCES public.agency_profiles(id) ON DELETE CASCADE,
  created_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title          TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  description    TEXT CHECK (char_length(description) <= 500),
  reward         TEXT CHECK (char_length(reward) <= 200),
  scope_type     TEXT NOT NULL DEFAULT 'any' CHECK (scope_type IN ('any', 'state', 'region', 'adventures')),
  scope_state    TEXT,
  scope_region   TEXT,
  adventure_ids  UUID[] NOT NULL DEFAULT '{}',
  min_grade      SMALLINT NOT NULL DEFAULT 1 CHECK (min_grade BETWEEN 1 AND 5),
  required_count SMALLINT NOT NULL CHECK (required_count BETWEEN 1 AND 50),
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '181 days')
);
CREATE INDEX IF NOT EXISTS challenges_active_idx ON public.challenges (is_active, ends_at);

CREATE TABLE IF NOT EXISTS public.challenge_participants (
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id)
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.challenges TO anon, authenticated;
GRANT SELECT ON public.challenge_participants TO authenticated;
DROP POLICY IF EXISTS "Anyone reads active challenges" ON public.challenges;
CREATE POLICY "Anyone reads active challenges" ON public.challenges
  FOR SELECT USING (is_active OR created_by = auth.uid());
DROP POLICY IF EXISTS "Users read own participation" ON public.challenge_participants;
CREATE POLICY "Users read own participation" ON public.challenge_participants
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Distinct verified adventures in scope, completed inside the challenge window.
CREATE OR REPLACE FUNCTION public.challenge_progress(p_challenge UUID, p_user UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT count(DISTINCT a.adventure_id)::int
    FROM public.challenges c
    JOIN public.adventure_attempts a ON a.user_id = p_user AND a.status = 'verified'
                                    AND a.completed_at BETWEEN c.starts_at AND c.ends_at
    JOIN public.adventures ad ON ad.id = a.adventure_id AND ad.grade >= c.min_grade
   WHERE c.id = p_challenge
     AND CASE c.scope_type
           WHEN 'state'      THEN ad.state = c.scope_state
           WHEN 'region'     THEN ad.terrain_region = c.scope_region
           WHEN 'adventures' THEN ad.id = ANY (c.adventure_ids)
           ELSE TRUE END;
$$;
REVOKE ALL ON FUNCTION public.challenge_progress(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_challenge(
  p_title TEXT, p_description TEXT, p_reward TEXT, p_scope_type TEXT,
  p_scope_state TEXT, p_scope_region TEXT, p_adventure_ids UUID[],
  p_min_grade SMALLINT, p_required_count SMALLINT, p_starts_at TIMESTAMPTZ, p_ends_at TIMESTAMPTZ)
RETURNS public.challenges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_agency  INTEGER;
  v_admin   BOOLEAN;
  r         public.challenges;
BEGIN
  SELECT id INTO v_agency FROM public.agency_profiles WHERE profile_id = auth.uid() AND partner_verified_at IS NOT NULL;
  SELECT COALESCE(is_admin, FALSE) INTO v_admin FROM public.profiles WHERE id = auth.uid();
  IF v_agency IS NULL AND NOT COALESCE(v_admin, FALSE) THEN
    RAISE EXCEPTION 'Only Spota partner agencies can run challenges' USING ERRCODE = '42501';
  END IF;
  IF v_agency IS NOT NULL AND (SELECT count(*) FROM public.challenges
                                WHERE agency_id = v_agency AND is_active AND ends_at > now()) >= 5 THEN
    RAISE EXCEPTION 'Up to 5 live challenges per agency';
  END IF;
  IF p_scope_type = 'state' AND COALESCE(trim(p_scope_state), '') = '' THEN RAISE EXCEPTION 'Pick a state'; END IF;
  IF p_scope_type = 'region' AND COALESCE(trim(p_scope_region), '') = '' THEN RAISE EXCEPTION 'Pick a region'; END IF;
  IF p_scope_type = 'adventures' AND COALESCE(cardinality(p_adventure_ids), 0) = 0 THEN RAISE EXCEPTION 'Pick at least one adventure'; END IF;
  IF p_scope_type = 'adventures' AND p_required_count > cardinality(p_adventure_ids) THEN
    RAISE EXCEPTION 'Required treks cannot exceed the number of adventures picked';
  END IF;
  IF p_ends_at <= now() THEN RAISE EXCEPTION 'End date must be in the future'; END IF;

  INSERT INTO public.challenges (agency_id, created_by, title, description, reward, scope_type, scope_state, scope_region,
                                 adventure_ids, min_grade, required_count, starts_at, ends_at)
  VALUES (v_agency, auth.uid(), trim(p_title), NULLIF(trim(p_description), ''), NULLIF(trim(p_reward), ''),
          COALESCE(p_scope_type, 'any'),
          CASE WHEN p_scope_type = 'state' THEN trim(p_scope_state) END,
          CASE WHEN p_scope_type = 'region' THEN trim(p_scope_region) END,
          CASE WHEN p_scope_type = 'adventures' THEN p_adventure_ids ELSE '{}' END,
          COALESCE(p_min_grade, 1), p_required_count, p_starts_at, p_ends_at)
  RETURNING * INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.create_challenge(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID[], SMALLINT, SMALLINT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_challenge(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID[], SMALLINT, SMALLINT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_challenge_active(p_challenge UUID, p_active BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.challenges SET is_active = p_active
   WHERE id = p_challenge
     AND (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown challenge'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_challenge_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_challenge_active(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_challenge(p_challenge UUID, p_join BOOLEAN DEFAULT TRUE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501'; END IF;
  IF p_join THEN
    IF NOT EXISTS (SELECT 1 FROM public.challenges WHERE id = p_challenge AND is_active AND ends_at > now()) THEN
      RAISE EXCEPTION 'This challenge has ended';
    END IF;
    INSERT INTO public.challenge_participants (challenge_id, user_id) VALUES (p_challenge, auth.uid())
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.challenge_participants WHERE challenge_id = p_challenge AND user_id = auth.uid();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.join_challenge(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_challenge(UUID, BOOLEAN) TO authenticated;

-- Live + upcoming challenges with the caller's progress (anon sees the list without progress).
CREATE OR REPLACE FUNCTION public.get_challenges()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'ends_at')), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'title', c.title, 'description', c.description, 'reward', c.reward,
      'scope_type', c.scope_type, 'scope_state', c.scope_state, 'scope_region', c.scope_region,
      'adventures', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ad.id, 'name', ad.name)), '[]'::jsonb)
                       FROM public.adventures ad WHERE ad.id = ANY (c.adventure_ids)),
      'min_grade', c.min_grade, 'required_count', c.required_count,
      'starts_at', c.starts_at, 'ends_at', c.ends_at,
      'agency', COALESCE(ag.company_name, 'Spota'), 'agency_logo', ag.logo_url,
      'participants', (SELECT count(*) FROM public.challenge_participants cp WHERE cp.challenge_id = c.id),
      'joined', EXISTS (SELECT 1 FROM public.challenge_participants cp WHERE cp.challenge_id = c.id AND cp.user_id = auth.uid()),
      'progress', CASE WHEN auth.uid() IS NULL THEN 0 ELSE public.challenge_progress(c.id, auth.uid()) END) AS x
      FROM public.challenges c
      LEFT JOIN public.agency_profiles ag ON ag.id = c.agency_id
     WHERE c.is_active AND c.ends_at > now()
  ) s;
$$;
REVOKE ALL ON FUNCTION public.get_challenges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_challenges() TO anon, authenticated;

-- Agency view: its challenges with participant progress (only people who joined).
CREATE OR REPLACE FUNCTION public.get_my_challenges()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'title', c.title, 'reward', c.reward, 'scope_type', c.scope_type,
      'scope_state', c.scope_state, 'scope_region', c.scope_region, 'min_grade', c.min_grade,
      'required_count', c.required_count, 'starts_at', c.starts_at, 'ends_at', c.ends_at, 'is_active', c.is_active,
      'participants', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                         'username', p.username, 'tier', p.tier, 'joined_at', cp.joined_at,
                         'progress', public.challenge_progress(c.id, cp.user_id),
                         'completed', public.challenge_progress(c.id, cp.user_id) >= c.required_count)
                         ORDER BY public.challenge_progress(c.id, cp.user_id) DESC, cp.joined_at), '[]'::jsonb)
                         FROM public.challenge_participants cp JOIN public.profiles p ON p.id = cp.user_id
                        WHERE cp.challenge_id = c.id))
      ORDER BY c.created_at DESC), '[]'::jsonb)
    FROM public.challenges c
   WHERE c.created_by = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_challenges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_challenges() TO authenticated;


-- ------------------------------------------------------------
-- D. Analytics (server-side, cannot be faked): route approvals, vouches
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_v2_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_TABLE_NAME = 'attempt_attestations' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'confirmed' THEN
    INSERT INTO public.analytics_events (event_type, user_id, details)
    VALUES ('attestation_confirmed', NEW.attester_id,
            jsonb_build_object('attempt_id', NEW.attempt_id, 'role', NEW.role, 'flags', NEW.flags));
  ELSIF TG_TABLE_NAME = 'adventure_submissions' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.analytics_events (event_type, user_id, details)
    VALUES ('route_' || NEW.status, NEW.submitted_by, jsonb_build_object('submission_id', NEW.id, 'adventure_id', NEW.adventure_id));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.log_v2_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS log_attestation_event ON public.attempt_attestations;
CREATE TRIGGER log_attestation_event AFTER UPDATE OF status ON public.attempt_attestations
  FOR EACH ROW EXECUTE FUNCTION public.log_v2_event();
DROP TRIGGER IF EXISTS log_submission_event ON public.adventure_submissions;
CREATE TRIGGER log_submission_event AFTER UPDATE OF status ON public.adventure_submissions
  FOR EACH ROW EXECUTE FUNCTION public.log_v2_event();
