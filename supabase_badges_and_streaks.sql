-- 1. USER BADGES TABLE
CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);

-- Enable RLS on user_badges
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_badges
CREATE POLICY "Anyone can read user badges"
ON public.user_badges FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own badges"
ON public.user_badges FOR INSERT
WITH CHECK (auth.uid() = user_id);


-- 2. DAILY VIBE STREAKS TABLE
CREATE TABLE IF NOT EXISTS public.daily_vibe_streaks (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    streak_count INTEGER DEFAULT 0,
    last_scratch_date DATE,
    bonus_scratches_earned INTEGER DEFAULT 0,
    bonus_scratches_used INTEGER DEFAULT 0
);

-- Enable RLS on daily_vibe_streaks
ALTER TABLE public.daily_vibe_streaks ENABLE ROW LEVEL SECURITY;

-- RLS policies for daily_vibe_streaks
CREATE POLICY "Users can read own daily streak"
ON public.daily_vibe_streaks FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own daily streak"
ON public.daily_vibe_streaks FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- 3. ENABLE RLS ON SPOT VIEWS & ADD SELECT/INSERT POLICIES
ALTER TABLE public.spot_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read spot views"
ON public.spot_views FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert spot views"
ON public.spot_views FOR INSERT
WITH CHECK (true);
