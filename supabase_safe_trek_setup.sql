-- ============================================================
-- SPOTA PHASE 4: SAFE TREKS SETUP MIGRATION
-- Run this script in the Supabase SQL Editor
-- ============================================================

-- 1. Create Safe Treks Table
CREATE TABLE IF NOT EXISTS public.safe_treks (
  id serial PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  destination_name TEXT NOT NULL,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  emergency_contact_name TEXT NOT NULL,
  emergency_contact_phone TEXT,
  emergency_contact_email TEXT,
  check_in_interval_hours INTEGER DEFAULT 4,
  last_checked_in TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'overdue')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS safe_treks_user_id_idx ON public.safe_treks(user_id);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.safe_treks ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "Users can view their own safe treks" ON public.safe_treks;
CREATE POLICY "Users can view their own safe treks" ON public.safe_treks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own safe treks" ON public.safe_treks;
CREATE POLICY "Users can insert their own safe treks" ON public.safe_treks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own safe treks" ON public.safe_treks;
CREATE POLICY "Users can update their own safe treks" ON public.safe_treks
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own safe treks" ON public.safe_treks;
CREATE POLICY "Users can delete their own safe treks" ON public.safe_treks
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. OPTIONAL: AUTOMATED SERVER-SIDE OVERDUE CRON JOB
-- ============================================================
-- To automatically mark treks as 'overdue' on the server even if the 
-- explorer's phone loses battery/signal, enable the pg_cron extension
-- and schedule a check every 1 minute.
-- Run the following in the SQL Editor:

-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'check-overdue-treks',
--   '* * * * *',
--   $$
--   UPDATE public.safe_treks
--   SET status = 'overdue'
--   WHERE status = 'active'
--   AND last_checked_in + (check_in_interval_hours || ' hours')::interval < timezone('utc'::text, now());
--   $$
-- );
