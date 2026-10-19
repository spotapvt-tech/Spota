-- ============================================================
-- SPOTA EXPEDITIONS — PHASE 3 (beta & launch instrumentation)
-- Docs: docs/spota-expeditions-implementation-plan.md §6 Phase 3, §8 Analytics
--
-- Run in the Supabase SQL Editor AFTER supabase_expeditions_phase1_2.sql.
-- Idempotent: safe to re-run. Does not change any Phase 1/2 function.
--
--  * analytics_events: ensured + RLS (users log their own events; admins read)
--  * Server-side events via triggers (can't be faked or lost by the client):
--      attempt_verified / attempt_pending / attempt_rejected / appeal_submitted
--      tier_up
--  * expedition_stats(): admin-only numbers for tuning verification in beta
-- ============================================================

SET search_path = public, extensions;

-- ------------------------------------------------------------
-- 1. analytics_events (exists in supabase_complete_schema.sql; ensure + policies)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id         SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS analytics_events_type_idx      ON public.analytics_events (event_type);
CREATE INDEX IF NOT EXISTS analytics_events_type_time_idx ON public.analytics_events (event_type, created_at);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
-- Supabase grants this by default; explicit so client inserts never fail on the id sequence
GRANT INSERT ON public.analytics_events TO authenticated;
GRANT USAGE ON SEQUENCE public.analytics_events_id_seq TO authenticated;

-- Users may only log events as themselves, with a sane name and payload size.
-- Legacy policies from supabase_complete_schema.sql: anyone (even anon) could insert,
-- and every signed-in user could read every event. Replaced by the two below.
DROP POLICY IF EXISTS "Anyone can log analytics" ON public.analytics_events;
DROP POLICY IF EXISTS "Only authenticated users can read analytics" ON public.analytics_events;
DROP POLICY IF EXISTS "Users log own analytics events" ON public.analytics_events;
CREATE POLICY "Users log own analytics events" ON public.analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND event_type ~ '^[a-z][a-z0-9_]{1,47}$'
    AND pg_column_size(details) < 4096
  );

DROP POLICY IF EXISTS "Admins read analytics events" ON public.analytics_events;
CREATE POLICY "Admins read analytics events" ON public.analytics_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));


-- ------------------------------------------------------------
-- 2. Server-side events
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_attempt_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_type TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_type := CASE
    WHEN OLD.status = 'rejected' AND NEW.status = 'pending' AND NEW.appeal_used THEN 'appeal_submitted'
    WHEN NEW.status IN ('verified', 'pending', 'rejected') THEN 'attempt_' || NEW.status
    ELSE NULL
  END;

  IF v_type IS NOT NULL THEN
    INSERT INTO public.analytics_events (event_type, user_id, details)
    VALUES (v_type, NEW.user_id, jsonb_build_object(
      'attempt_id', NEW.id,
      'adventure_id', NEW.adventure_id,
      'score', NEW.verification_score,
      'from', OLD.status,
      'reviewed', NEW.reviewed_by IS NOT NULL,
      'mock_points', NEW.mock_point_count,
      'guided', NEW.is_guided));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_attempt_status_event ON public.adventure_attempts;
CREATE TRIGGER log_attempt_status_event
  AFTER UPDATE OF status ON public.adventure_attempts
  FOR EACH ROW EXECUTE FUNCTION public.log_attempt_status_event();

CREATE OR REPLACE FUNCTION public.log_tier_up_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier THEN
    INSERT INTO public.analytics_events (event_type, user_id, details)
    VALUES ('tier_up', NEW.id, jsonb_build_object('from', OLD.tier, 'to', NEW.tier, 'total_ap', NEW.total_ap));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_tier_up_event ON public.profiles;
CREATE TRIGGER log_tier_up_event
  AFTER UPDATE OF tier ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_tier_up_event();

REVOKE ALL ON FUNCTION public.log_attempt_status_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_tier_up_event()        FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 3. expedition_stats(): beta tuning dashboard (admins only)
--    Answers: how many attempts verify on their own, which check fails most,
--    how big/old is the review queue, how often admins overturn the auto-check,
--    and the start → complete → verified funnel.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expedition_stats(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_since TIMESTAMPTZ := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 30), 365)));
  v_out   JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  WITH att AS (
    SELECT * FROM public.adventure_attempts WHERE submitted_at >= v_since
  ),
  checks AS (
    SELECT k.key AS check_name, k.max_score,
           round(avg(COALESCE((a.verification_breakdown -> k.key ->> 'score')::numeric, 0)) / k.max_score * 100, 1) AS pass_pct
      FROM att a
      CROSS JOIN (VALUES ('geofence', 35), ('route', 20), ('photo', 20), ('movement', 15), ('elevation', 10)) AS k(key, max_score)
     WHERE a.verification_breakdown IS NOT NULL
     GROUP BY k.key, k.max_score
  ),
  ev AS (
    SELECT event_type, count(*) AS n FROM public.analytics_events
     WHERE created_at >= v_since GROUP BY event_type
  ),
  per_adv AS (
    SELECT ad.name, count(*) AS attempts,
           count(*) FILTER (WHERE a.status = 'verified') AS verified,
           round(avg(a.verification_score), 0) AS avg_score
      FROM att a JOIN public.adventures ad ON ad.id = a.adventure_id
     GROUP BY ad.name ORDER BY count(*) DESC LIMIT 10
  )
  SELECT jsonb_build_object(
    'days', GREATEST(1, LEAST(COALESCE(p_days, 30), 365)),
    'attempts', (SELECT count(*) FROM att),
    'by_status', COALESCE((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM att GROUP BY status) s), '{}'::jsonb),
    -- decided by the auto-check alone (no reviewer)
    'auto_verified_pct', (SELECT round(100.0 * count(*) FILTER (WHERE status = 'verified' AND reviewed_by IS NULL) / NULLIF(count(*), 0), 1) FROM att),
    'avg_score', (SELECT round(avg(verification_score), 1) FROM att),
    'score_buckets', jsonb_build_object(
       'rejected_0_39', (SELECT count(*) FROM att WHERE verification_score < 40),
       'review_40_74',  (SELECT count(*) FROM att WHERE verification_score BETWEEN 40 AND 74),
       'auto_75_100',   (SELECT count(*) FROM att WHERE verification_score >= 75)),
    'check_pass_pct', COALESCE((SELECT jsonb_object_agg(check_name, pass_pct) FROM checks), '{}'::jsonb),
    'flags', jsonb_build_object(
       'mock_location', (SELECT count(*) FROM att WHERE mock_point_count > 0),
       'vehicle_or_jump', (SELECT count(*) FROM att WHERE (verification_breakdown -> 'movement' ->> 'score')::int = 0 AND track_point_count >= 2)),
    'review', jsonb_build_object(
       'pending_now', (SELECT count(*) FROM public.adventure_attempts WHERE status = 'pending'),
       'oldest_pending_hours', (SELECT round(extract(epoch FROM now() - min(submitted_at)) / 3600, 1) FROM public.adventure_attempts WHERE status = 'pending'),
       'reviewed', (SELECT count(*) FROM att WHERE reviewed_by IS NOT NULL),
       'approved_after_review', (SELECT count(*) FROM att WHERE reviewed_by IS NOT NULL AND status = 'verified'),
       'avg_review_hours', (SELECT round(avg(extract(epoch FROM reviewed_at - submitted_at)) / 3600, 1) FROM att WHERE reviewed_at IS NOT NULL),
       'appeals', (SELECT count(*) FROM att WHERE appeal_used)),
    'funnel', jsonb_build_object(
       'started',   COALESCE((SELECT n FROM ev WHERE event_type = 'expedition_started'), 0),
       'completed', COALESCE((SELECT n FROM ev WHERE event_type = 'expedition_completed'), 0),
       'submitted', (SELECT count(*) FROM att),
       'verified',  (SELECT count(*) FROM att WHERE status = 'verified')),
    'engagement', jsonb_build_object(
       'leaderboard_views', COALESCE((SELECT n FROM ev WHERE event_type = 'leaderboard_viewed'), 0),
       'rank_shares',       COALESCE((SELECT n FROM ev WHERE event_type = 'rank_card_shared'), 0),
       'tier_ups',          COALESCE((SELECT n FROM ev WHERE event_type = 'tier_up'), 0),
       'opt_outs',          COALESCE((SELECT n FROM ev WHERE event_type = 'leaderboard_opt_out'), 0),
       'trekkers',          (SELECT count(DISTINCT user_id) FROM att)),
    'top_adventures', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM per_adv p), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.expedition_stats(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expedition_stats(INTEGER) TO authenticated;
