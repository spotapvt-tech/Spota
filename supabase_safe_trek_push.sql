-- ============================================================
-- SAFE TREK OVERDUE PUSH ALERTS
-- Run in the Supabase SQL Editor after supabase_safe_trek_setup.sql.
-- Deploy first: supabase functions deploy safe-trek-overdue --no-verify-jwt
-- ============================================================

-- 1. Device tokens (one row per installed app)
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id serial PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  platform TEXT DEFAULT 'android',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx ON public.device_tokens(user_id);
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own device tokens" ON public.device_tokens;
CREATE POLICY "Users manage their own device tokens" ON public.device_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Remember when the overdue push went out so it fires once per missed check-in
ALTER TABLE public.safe_treks ADD COLUMN IF NOT EXISTS overdue_push_sent_at TIMESTAMP WITH TIME ZONE;

-- 3. Run the edge function every minute (it marks treks overdue and sends the push).
--    Replace <PROJECT_REF> and <CRON_SECRET> (same value as the function's CRON_SECRET secret).
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
-- SELECT cron.schedule(
--   'safe-trek-overdue-push',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/safe-trek-overdue',
--     headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
--   );
--   $$
-- );
