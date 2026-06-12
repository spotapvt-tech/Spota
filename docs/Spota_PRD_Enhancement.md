















💎

SPOTA

Product Requirements Document

Enhancement Roadmap v1.0



June 2026

Rahul — Senior Product Manager

Somiya — Gen Z Explorer Advisor













CONFIDENTIAL  |  INTERNAL USE ONLY





Table of Contents







1. Executive Summary



Spota is a traveller's hidden gem discovery platform built on React, Capacitor, and Supabase. Users explore spots on an interactive map, drop location-tagged gems (cafes, viewpoints, trails), rate vibes, and connect with other travellers.



This PRD defines the 9 enhancement features agreed upon during a product discovery session between Rahul (Senior PM) and Somiya (Gen Z Trekker). These features address three core problems: offline usability, post-trip retention, and social virality.



Goal: Transform Spota from a trip tool into a traveller's lifetime companion.

Horizon: 6-month roadmap — June 2026 to December 2026

Stack: React 19, Capacitor 8, Supabase (Postgres + Storage + Edge Functions)



2. Product Overview



2.1 Current App Structure

Screen

Purpose

MapView

Interactive Leaflet map with range filters and spot pins

FeedView

Scrollable feed of recently added community spots

AddGemView

Form to drop a new gem with photo, location, tags

ARView

Augmented reality camera overlay showing nearby spots

ProfileView

User's gems, saved spots, vibe ratings, achievements

AIVibeMatcher

Describe mood in plain English → AI finds matching spots

DailyVibeDrop

Scratch-card reveal of a curated spot of the day



2.2 Technology Stack

Layer

Technology

Frontend

React 19 + React Router 7 + Leaflet

Mobile

Capacitor 8 (Android / iOS)

Backend

Supabase (Postgres, Auth, Storage, Edge Functions)

Styling

Custom CSS with glassmorphism design system

Maps

react-leaflet + CartoDB tiles

Camera

@capacitor/camera plugin



3. User Personas



Persona 1: Rahul — The Organised Explorer

Role

Senior Product Manager, 31 years old

Travel Style

Weekend city breaks, curated food & culture experiences

Pain Points

Loses track of recommendations; wants data on what worked

Goals

Plan trips efficiently; measure the impact of shared spots

Quote

"If I drop a gem and nobody reacts, why would I do it again?"



Persona 2: Somiya — The Adventure Seeker

Role

Gen Z solo trekker & city explorer, 24 years old

Travel Style

Solo mountain treks, off-beat destinations, no-signal zones

Pain Points

App dies without internet; categories too urban-focused; safety concerns

Goals

Use app offline on treks; share aesthetic spots; trek safely

Quote

"The moment I enter Rohtang Pass, the whole app becomes useless."



4. Problem Statement



Problem 1 — Offline Failure: Travellers lose app access in remote areas (mountains, rural zones) where it is needed most. Zero data = zero value.



Problem 2 — Broken Reward Loop: Users drop gems but receive no feedback on impact. No views counter, no visitor notifications, no social proof. Contribution feels thankless.



Problem 3 — Urban Bias in Categories: Existing categories (cafe, viewpoint, street-art, event) exclude the fastest-growing user segment: adventure and outdoor travellers.



Problem 4 — No Group Travel Support: Friend groups planning trips together have no collaborative workspace. They fall back to WhatsApp, losing all travel data from Spota.



Problem 5 — No Virality Mechanic: There is no easy way to share discoveries outside the app, limiting organic growth and new user acquisition.



5. Feature Specifications



PHASE 1 — FOUNDATION  |  Month 1–2





1. Offline Zone Download

Phase: Phase 1 — Foundation (Month 1)

Overview: Users select a geographic area on the map while connected to WiFi. The app caches all spot data, images, and map tiles to IndexedDB. When the device goes offline (e.g. mountain trek), the full map and spot details remain accessible.



User Story





User Flow

User opens MapView on WiFi

Taps "Save Area for Offline" button (top-right of map)

OfflineModal opens — user selects radius: 5 km / 10 km / 25 km

App fetches all spots within bounds from Supabase

Spot data + compressed images saved to IndexedDB

Success toast: "Kasol Area — 47 spots saved offline"

Device goes offline — app detects via navigator.onLine

Offline banner shown: "Offline Mode — 47 cached spots"

User browses map and spot details normally from cache

On reconnect, cache syncs any new spots automatically



Functional Requirements

Download button visible on MapView when online

Radius selector: 5 km, 10 km, 25 km options

Progress indicator during download

Offline banner automatically shown when navigator.onLine = false

All spot fields (title, category, description, tags, image_url, lat/lng) cached

Cache metadata stored: zone name, radius, download timestamp

One-tap "Clear Cache" option in settings

Cache auto-expires after 7 days with prompt to refresh



Non-Functional Requirements

Offline load time under 2 seconds for up to 500 spots

Cache size must not exceed 50 MB per zone

IndexedDB used (compatible with Capacitor WebView on Android/iOS)

Graceful degradation: if cache fails, show friendly error not crash



Success Metrics

Metric

Target

Zone downloads before trips

60% of active users

Offline load time

< 2 seconds

Cache success rate

> 98%

Retention (users who downloaded vs not)

+40% 30-day retention



Database Schema (Supabase)

















Files to Create / Modify

File

Purpose

src/lib/offlineCache.js

NEW — IndexedDB open/read/write/clear helpers

src/hooks/useOfflineSpots.js

NEW — Hook: checks cache first, falls back to Supabase

src/components/OfflineModal.jsx

NEW — Radius selector modal UI

src/pages/MapView.jsx

MODIFY — Add download button, offline banner, cache-aware fetch



2. Expanded Outdoor Categories

Phase: Phase 1 — Foundation (Month 1)

Overview: Add 8 new spot categories specifically designed for adventure and outdoor travellers. Replace the hardcoded category array with a centralised categoryConfig.js file used across all components.



User Story





User Flow

User taps "+ Drop a Gem" in AddGemView

Category selector shows all 12 categories with emoji icons

User selects "Waterfall" for their discovered spot

Gem is saved with category = "waterfall"

MapView filter chips include all 12 categories

User filters map by "Trail" — only trail spots shown

SpotDetailsModal shows correct category icon and colour badge



Functional Requirements

All 12 categories available in AddGemView chip selector

Category chips in MapView filter bar include all 12

Each category has: id, label, emoji icon, hex colour

SpotDetailsModal category badge uses correct colour per category

Existing spots with old categories remain unaffected

Category config imported from single source file: categoryConfig.js



Non-Functional Requirements

No database schema change required (category is a TEXT field)

Backward-compatible: existing category values still valid

Category chips must scroll horizontally on small screens



Success Metrics

Metric

Target

New gems using outdoor categories

40% within 30 days

Trail/campsite/waterfall drops per week

> 50 per week by Month 2

Adventure user segment growth

+30% new user registrations



Database Schema (Supabase)













Files to Create / Modify

File

Purpose

src/lib/categoryConfig.js

NEW — All 12 category definitions (id, label, icon, color)

src/pages/AddGemView.jsx

MODIFY — Import from categoryConfig, render all 12 chips

src/pages/MapView.jsx

MODIFY — Category filter chips from categoryConfig

src/components/SpotDetailsModal.jsx

MODIFY — Category badge colour from categoryConfig



PHASE 2 — ENGAGEMENT LOOP  |  Month 2–3





3. Collaborative Trip Boards

Phase: Phase 2 — Engagement Loop (Month 2)

Overview: Users create named trips (e.g. "Spiti Valley 2026"), invite friends via a shareable link or 8-character code, and collectively build a shared gem map. Real-time updates via Supabase Realtime channels ensure all members see new gems instantly.



User Story





User Flow

User opens Profile → taps "My Trips" tab

Taps "+ New Trip" → enters trip name, destination, dates

Trip created — unique invite link and 8-char code generated

User shares invite link via WhatsApp/SMS

Friends click link → join trip (or enter code in app)

Trip Board opens: tabs for Map | Gems | Members

Any member taps "+ Add to Trip" → opens AddGemView pre-linked to trip

New gem appears on all members' trip maps in real time

Members swipe left on a gem to mark it "Visited"

Members double-tap a gem to upvote it

Trip ends → Recap generated (see Feature 6)



Functional Requirements

Create trip with: name, description, start/end date, cover image

Unique 8-character invite code per trip

Shareable deep-link: spota.app/trip/join/{code}

Real-time gem updates via Supabase channel subscription

Members list with role: owner / member

Mark spots as visited (per-member tracking)

Upvote spots — aggregate vote count shown

Owner can remove members or delete trip

Trip map shows all member gems colour-coded by contributor



Non-Functional Requirements

Real-time latency under 1 second for gem updates

Support up to 20 members per trip

Trip data persists for 12 months after end date

Invite links expire after 30 days



Success Metrics

Metric

Target

Users who create or join a trip

35% of active users

Average members per trip

3.2

Trip session duration

> 6 minutes avg

7-day retention after joining a trip

+55% vs baseline



Database Schema (Supabase)





























































Files to Create / Modify

File

Purpose

src/pages/MyTripsView.jsx

NEW — List of user's trips + create trip button

src/pages/TripBoardView.jsx

NEW — Trip map, gem list, members tab

src/components/TripInviteModal.jsx

NEW — Share link + QR code + invite code UI

src/components/TripGemCard.jsx

NEW — Gem card with visited/vote controls

src/App.jsx

MODIFY — Add /trips and /trips/:tripId routes



4. Gem Impact Dashboard

Phase: Phase 2 — Engagement Loop (Month 3)

Overview: Gem droppers see real-time analytics on their spots: total views, saves, shares, and reactions. A push notification fires when someone opens their spot. This closes the broken reward loop that causes contributor churn.



User Story





User Flow

User opens SpotDetailsModal for their own gem

GemImpactCard visible at top (only for spot owner)

Shows: Views, Saves, Shares, Reactions in 4 stat tiles

User taps "See Full Stats" → opens MyGemsView

MyGemsView shows all their gems ranked by impact score

Each gem row shows 7-day sparkline of view trend

Notification received: "Someone found your gem! A traveller just visited Secret Matcha Cafe"



Functional Requirements

Log a view record when SpotDetailsModal opens for any user

GemImpactCard visible only to the spot owner

Stats: Views (all-time), Saves (all-time), Shares, Total Reactions

MyGemsView accessible from Profile tab

Gems sorted by impact score (views x 1 + saves x 2 + reactions x 3)

Push notification to owner on new view (max 1 per hour per spot)

Supabase Edge Function handles notification dispatch



Non-Functional Requirements

View logging must not block UI (fire-and-forget)

Stats query must complete in < 500ms

Notifications require Capacitor Push Notifications plugin on native



Success Metrics

Metric

Target

Gem droppers checking stats weekly

70%

Increase in gem drops after launch

+25%

Notification open rate

> 35%

30-day gem dropper retention

+40% vs baseline



Database Schema (Supabase)





















Files to Create / Modify

File

Purpose

src/components/GemImpactCard.jsx

NEW — 4-stat tile card shown to spot owner

src/pages/MyGemsView.jsx

NEW — Full gem analytics dashboard in Profile

src/components/SpotDetailsModal.jsx

MODIFY — Log view on open, render GemImpactCard



PHASE 3 — VIRALITY & SOCIAL  |  Month 3–4





5. Swipeable Video Spot Feed (Vibes Feed)

Phase: Phase 3 — Virality & Social (Month 3)

Overview: A TikTok-style full-screen vertical feed where each card shows a spot's vibe video or photo. Swipe up for next spot, swipe down for previous, double-tap to fire react, swipe right to save. Videos autoplay when the card is active.



User Story





User Flow

User taps "Vibes" tab in bottom navigation

VibesFeedView loads — first spot shown full-screen

Video autoplays (muted) if spot has video_url

Photo shown if no video available

Swipe up → next spot with smooth scroll transition

Swipe down → previous spot

Double-tap → fire reaction with animation + haptic

Tap save icon (right side) → spot added to saved list

Tap share icon → ShareCard generated + native share sheet

Tap directions icon → opens Google Maps with spot coordinates

Tap spot title → SpotDetailsModal opens for full details



Functional Requirements

Full-screen vertical card layout (100vh per card)

Touch gesture detection: swipe up/down (60px threshold)

Double-tap detection (< 300ms between taps)

Video autoplay when card is active, pause when offscreen

Preload next 2 cards for smooth transitions

Right-side action bar: react, save, share, directions

Category chip + tags shown as overlays

Lazy load images/videos with skeleton loading state



Non-Functional Requirements

Card transition animation under 200ms

Video must not autoplay with sound (muted default)

Preload strategy limited to 2 cards to control memory usage

Feed fetches next 20 spots when 5 remain



Success Metrics

Metric

Target

Average session duration on Vibes tab

> 4 minutes

Users swiping 5+ spots per session

60%

Double-tap reaction rate per session

> 25%

Daily active users on Vibes tab

50% of DAU



Database Schema (Supabase)









Files to Create / Modify

File

Purpose

src/pages/VibesFeedView.jsx

NEW — Full-screen swipeable feed container

src/components/SpotVibeCard.jsx

NEW — Individual full-screen spot card

src/components/layout/Layout.jsx

MODIFY — Add Vibes tab to navigation

src/App.jsx

MODIFY — Add /vibes route



6. Trip Recap (Wrapped-Style)

Phase: Phase 3 — Virality & Social (Month 4)

Overview: When a trip's end date passes, Spota auto-generates a beautiful Instagram Stories-sized (1080x1920) canvas image summarising the trip. Shows trip name, gems dropped, places visited, days explored, categories discovered, and top contributor.



User Story





User Flow

Trip end date is reached (or user manually triggers recap)

TripRecapModal appears with animation

Recap shows: trip name, hero image, stats grid, member avatars

Stats displayed: Gems Dropped, Places Visited, Days Explored, Categories

Top Gem (most reactions) featured with full photo

Top Contributor (most gems added) highlighted

User taps "Download Recap" → 1080x1920 PNG exported

User taps "Share" → native share sheet opens (Capacitor) or image downloads (web)



Functional Requirements

Auto-trigger when trip end_date passes (checked on app open)

Manual trigger: "Generate Recap" button in TripBoardView

Canvas rendered at 1080x1920 (Instagram Stories ratio)

Recap includes: trip name, hero image, 4 stats, top gem, top contributor, Spota branding

Export as PNG via canvas.toDataURL()

Native share via Capacitor Share API

Web fallback: auto-download PNG file



Non-Functional Requirements

Canvas render must complete in under 3 seconds

Output image must be under 2 MB

Works offline if trip data already cached



Success Metrics

Metric

Target

Completed trips generating recap

40%

Recap shared externally

20% of generated recaps

New installs attributable to shared recaps

> 200/month by Month 5



Database Schema (Supabase)







Files to Create / Modify

File

Purpose

src/components/TripRecapModal.jsx

NEW — Recap display modal with share CTA

src/lib/recapGenerator.js

NEW — Canvas drawing functions for recap image

src/pages/TripBoardView.jsx

MODIFY — Add "Generate Recap" trigger button



7. Share Gem Card to Instagram

Phase: Phase 3 — Virality & Social (Month 4)

Overview: Enhance the existing share card generator in SpotDetailsModal to be a prominent, one-tap experience. After dropping a gem, users are immediately prompted to share a beautiful branded card. Uses Capacitor Share API on native, image download on web.



User Story





User Flow

User submits AddGemView — gem saved successfully

Full-screen share prompt appears: "Your gem is live! Share it with the world"

Card preview rendered: spot photo, title, coordinates, tags, Spota logo

User taps "Share to Instagram" (or "Download Card")

Native: Capacitor Share sheet opens with image + caption

Web: PNG auto-downloads as "{spot-name}-spota.png"

Share event logged for impact dashboard stats



Functional Requirements

Share prompt shown immediately after successful gem drop

Card design: spot hero image, title, category emoji, top 3 tags, coordinates, Spota branding

Card dimensions: 1080x1920 (Stories) and 1080x1080 (square) — user selects

Capacitor Share API used on native platforms

Browser download fallback for web users

Share count incremented in spots table on each share

"Share Later" option to dismiss and share from SpotDetailsModal



Non-Functional Requirements

Card generation must complete under 1.5 seconds

Must work offline (uses locally cached image data)



Success Metrics

Metric

Target

Gem drops resulting in a share

15%

Organic installs from shared cards per month

500+ by Month 5

Share card click-through to App Store

> 8%



Database Schema (Supabase)









Files to Create / Modify

File

Purpose

src/components/SpotDetailsModal.jsx

MODIFY — Enhanced share card, post-drop share prompt

src/pages/AddGemView.jsx

MODIFY — Trigger share prompt after successful submit



PHASE 4 — SAFETY & TRUST  |  Month 4–5





8. Safe Trek Mode

Phase: Phase 4 — Safety & Trust (Month 5)

Overview: Users starting a solo trek set a destination, an emergency contact (name + phone/email), and a check-in interval (2/4/6/8 hours). If they miss a check-in, a Supabase Edge Function sends an SMS/email alert to the emergency contact with the user's last known location.



User Story





User Flow

User opens Profile → taps "Safe Trek" button

SafeTrekView opens — no active trek shown

Taps "Start Trek" → SetupTrekForm opens

Enters: destination name, emergency contact name, phone/email

Selects check-in interval: 2h / 4h / 6h / 8h

Confirms → trek starts, countdown timer begins

Every interval: push notification + in-app CheckInModal appears

User taps "I'm Safe — Check In" → timer resets

If timer reaches 0 without check-in → Edge Function fires alert to emergency contact

Alert includes: user name, destination, last known location, trek start time

User taps "End Trek Safely" → trek marked completed



Functional Requirements

Trek setup form: destination, emergency contact name + phone/email, interval

Countdown timer shown prominently on active trek screen

Push notification reminder 30 minutes before check-in deadline

In-app CheckInModal on check-in due

Supabase Edge Function: triggered by check-in overdue event, sends SMS via Twilio or email via Resend

Alert message includes user name, destination, last GPS coordinates, trek start time

Trek history stored (last 10 treks visible in profile)

Emergency contact does NOT need the app installed



Non-Functional Requirements

Alert delivery reliability: 100% (no missed alerts)

Edge Function must respond within 5 seconds of trigger

Local countdown timer continues even if network is lost

Personal data (emergency contact) encrypted at rest in Supabase



Success Metrics

Metric

Target

Solo trekkers activating Safe Trek Mode

25% of trekker segment

Alert delivery success rate

100%

App installs driven by safety feature awareness

> 150/month

User retention among Safe Trek users vs non-users

+60%



Database Schema (Supabase)































Files to Create / Modify

File

Purpose

src/pages/SafeTrekView.jsx

NEW — Trek setup + active trek countdown screen

src/components/CheckInModal.jsx

NEW — Check-in confirmation dialog

src/lib/safeTrekTimer.js

NEW — Countdown logic + overdue detection

src/pages/ProfileView.jsx

MODIFY — Add Safe Trek entry point



PHASE 5 — GAMIFICATION  |  Month 5–6





9. Pioneer Badges & Gamification

Phase: Phase 5 — Gamification (Month 6)

Overview: Award achievement badges to users for meaningful contributions. Badges are checked server-side when relevant events occur (gem drop, check-in, reaction received) and displayed on the user profile. First-time badge unlocks trigger celebratory animations.



User Story





User Flow

User drops their 10th gem → badgeEngine.check("gem_hunter", userId) called

Badge not previously earned → insert into user_badges

Confetti animation plays + "You earned Gem Hunter!" toast shown

Badge appears on Profile with glow effect

Other users can see badges on profiles they visit

Badge shelf shows: earned badges (coloured) + locked badges (greyed out)

Tapping a locked badge shows requirement: "Drop 5 trail spots to unlock Trail Blazer"



Functional Requirements

5 launch badges: Pioneer, Gem Hunter, Trail Blazer, Vibe Lord, Solo Explorer

Badge checks triggered by relevant events (gem insert, reaction update, trek complete)

UNIQUE constraint on user_badges prevents duplicate awards

Profile shows badge shelf: earned + locked with progress indicators

Confetti/celebration animation on first badge unlock

Push notification: "You just unlocked a new badge!"

Locked badges show progress: "3 of 5 trail spots added"



Non-Functional Requirements

Badge check must complete asynchronously — must not block gem submit flow

Badge evaluation logic centralised in badgeEngine.js (easy to extend)

Animation must respect device motion sensitivity settings



Success Metrics

Metric

Target

Users earning at least 1 badge

50%

Increase in gem drops after badge launch

+30%

Profile visits per user per week

+2x vs pre-badge

Pioneer badge earners (strong signal of new area discovery)

> 200 users/month



Database Schema (Supabase)

















Files to Create / Modify

File

Purpose

src/lib/badgeEngine.js

NEW — Badge definitions + async check functions

src/components/BadgeDisplay.jsx

NEW — Badge shelf component (earned + locked)

src/pages/ProfileView.jsx

MODIFY — Render BadgeDisplay in profile

src/pages/AddGemView.jsx

MODIFY — Trigger badge check on gem submit success



6. Navigation Restructure



The bottom navigation will expand from 4 to 5 tabs to accommodate the new Vibes Feed and Trips features.



Current (4 tabs)

Map  |  Feed  |  + Add  |  Profile

New (5 tabs)

Explore  |  Vibes  |  + Add (FAB)  |  Trips  |  Profile



New Routes

Route

Component

/vibes

VibesFeedView — swipeable video feed

/trips

MyTripsView — list of user trips

/trips/:tripId

TripBoardView — collaborative trip map

/safe-trek

SafeTrekView — trek safety mode



7. 6-Month Sprint Timeline



Month

Phase

Deliverables

Month 1

Phase 1: Foundation

Offline Zone Download + New Categories + Navigation Restructure

Month 2

Phase 2: Engagement

Collaborative Trip Boards (core — create, invite, real-time gems)

Month 3

Phase 2+3: Engagement

Gem Impact Dashboard + Swipeable Video Vibes Feed

Month 4

Phase 3: Virality

Trip Recap Generator + Share Gem Card to Instagram

Month 5

Phase 4: Safety

Safe Trek Mode + Emergency Alert Edge Function

Month 6

Phase 5: Polish

Pioneer Badges + Performance + Full QA + Soft Launch



8. New Files Summary



8.1 New Files to Create

File Path

Type

Purpose

src/lib/offlineCache.js

Library

IndexedDB cache helpers

src/lib/categoryConfig.js

Library

All 12 category definitions

src/lib/badgeEngine.js

Library

Badge check logic

src/lib/recapGenerator.js

Library

Canvas trip recap generator

src/lib/safeTrekTimer.js

Library

Trek countdown + overdue logic

src/hooks/useOfflineSpots.js

Hook

Cache-first spot fetching

src/pages/VibesFeedView.jsx

Page

TikTok-style swipeable feed

src/pages/MyTripsView.jsx

Page

User trip list

src/pages/TripBoardView.jsx

Page

Collaborative trip map + gems

src/pages/SafeTrekView.jsx

Page

Safety trek setup + countdown

src/components/GemImpactCard.jsx

Component

Spot stats card for owners

src/components/TripRecapModal.jsx

Component

Trip wrapped-style recap

src/components/BadgeDisplay.jsx

Component

Badge shelf (earned + locked)

src/components/OfflineModal.jsx

Component

Offline zone download selector

src/components/TripInviteModal.jsx

Component

Invite link + QR code UI

src/components/SpotVibeCard.jsx

Component

Full-screen spot card for feed

src/components/CheckInModal.jsx

Component

Trek check-in confirmation

src/pages/MyGemsView.jsx

Page

Gem analytics dashboard

src/components/TripGemCard.jsx

Component

Trip gem with visited/vote



8.2 Files to Modify

File

What Changes

src/App.jsx

Add 4 new routes: /vibes, /trips, /trips/:tripId, /safe-trek

src/components/layout/Layout.jsx

Expand nav from 4 to 5 tabs

src/pages/MapView.jsx

Offline banner, download button, cache-aware fetch

src/pages/AddGemView.jsx

New categories, post-submit share prompt, badge trigger

src/components/SpotDetailsModal.jsx

View logging, GemImpactCard, enhanced share card

src/pages/ProfileView.jsx

Add BadgeDisplay, Safe Trek button, My Gems link, My Trips tab

src/pages/TripBoardView.jsx

Add Recap trigger button



Appendix — Full Supabase Migration Script



Run the following SQL in the Supabase SQL Editor to create all required tables for this enhancement roadmap.



-- ============================================================

-- SPOTA ENHANCEMENT MIGRATION v1.0

-- Run in Supabase SQL Editor

-- ============================================================



-- 1. SPOT VIEWS

CREATE TABLE IF NOT EXISTS spot_views (

id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

spot_id UUID REFERENCES spots(id) ON DELETE CASCADE,

viewer_id UUID,

viewed_at TIMESTAMPTZ DEFAULT NOW()

);

CREATE INDEX IF NOT EXISTS idx_spot_views_spot_id ON spot_views(spot_id);



-- 2. TRIPS

CREATE TABLE IF NOT EXISTS trips (

id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

name TEXT NOT NULL,

description TEXT,

cover_image_url TEXT,

created_by UUID REFERENCES auth.users(id),

start_date DATE,

end_date DATE,

invite_code TEXT UNIQUE DEFAULT substr(md5(random()::text),1,8),

created_at TIMESTAMPTZ DEFAULT NOW()

);



-- 3. TRIP MEMBERS

CREATE TABLE IF NOT EXISTS trip_members (

id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,

user_id UUID REFERENCES auth.users(id),

role TEXT DEFAULT 'member',

joined_at TIMESTAMPTZ DEFAULT NOW()

);



-- 4. TRIP SPOTS

CREATE TABLE IF NOT EXISTS trip_spots (

id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,

spot_id UUID REFERENCES spots(id),

added_by UUID REFERENCES auth.users(id),

is_visited BOOLEAN DEFAULT FALSE,

votes INTEGER DEFAULT 0,

added_at TIMESTAMPTZ DEFAULT NOW()

);



-- 5. SAFE TREKS

CREATE TABLE IF NOT EXISTS safe_treks (

id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

user_id UUID REFERENCES auth.users(id),

destination_name TEXT,

destination_lat FLOAT,

destination_lng FLOAT,

emergency_contact_name TEXT,

emergency_contact_phone TEXT,

emergency_contact_email TEXT,

check_in_interval_hours INTEGER DEFAULT 4,

last_checked_in TIMESTAMPTZ DEFAULT NOW(),

status TEXT DEFAULT 'active',

started_at TIMESTAMPTZ DEFAULT NOW()

);



-- 6. USER BADGES

CREATE TABLE IF NOT EXISTS user_badges (

id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

user_id UUID REFERENCES auth.users(id),

badge_id TEXT NOT NULL,

earned_at TIMESTAMPTZ DEFAULT NOW(),

UNIQUE(user_id, badge_id)

);



-- 7. ENABLE ROW LEVEL SECURITY

ALTER TABLE spot_views   ENABLE ROW LEVEL SECURITY;

ALTER TABLE trips         ENABLE ROW LEVEL SECURITY;

ALTER TABLE trip_members  ENABLE ROW LEVEL SECURITY;

ALTER TABLE trip_spots    ENABLE ROW LEVEL SECURITY;

ALTER TABLE safe_treks    ENABLE ROW LEVEL SECURITY;

ALTER TABLE user_badges   ENABLE ROW LEVEL SECURITY;



-- 8. DROP CATEGORY CONSTRAINT (if exists)

ALTER TABLE spots DROP CONSTRAINT IF EXISTS spots_category_check;



End of Document — Spota PRD Enhancement Roadmap v1.0 | June 2026

