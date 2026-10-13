-- ============================================================
-- SPOTA EXPEDITIONS — DEV SEED (10 adventures + 1 local test loop)
-- Run AFTER supabase_expeditions_setup.sql.
--
-- ⚠ DEV DATA ONLY. Endpoint coordinates / altitudes are APPROXIMATE and
--   flagged coords_verified = FALSE. A wider 300 m geofence is used to absorb the error.
--   Replace with the curated 50-adventure sheet (open item #2) before beta.
-- Idempotent: upserts on slug.
-- ============================================================

SET search_path = public, extensions;  -- PostGIS lives in `extensions` on Supabase

INSERT INTO public.adventures
  (slug, name, grade, distance_km, elevation_gain_m, max_altitude_m, typical_days,
   endpoint, endpoint_radius_m, country, state, terrain_region,
   winter_start_md, winter_end_md, coords_verified)
VALUES
  -- Himachal Pradesh
  ('triund',          'Triund',                1, 18, 875,  2850, 1,
   ST_SetSRID(ST_MakePoint(76.3537, 32.2600), 4326)::geography, 300, 'IN', 'Himachal Pradesh', 'Dhauladhar', '12-15', '02-28', FALSE),
  ('kareri-lake',     'Kareri Lake',           2, 26, 1100, 2934, 2,
   ST_SetSRID(ST_MakePoint(76.2700, 32.3300), 4326)::geography, 300, 'IN', 'Himachal Pradesh', 'Dhauladhar', NULL, NULL, FALSE),
  ('kheerganga',      'Kheerganga',            1, 24, 1000, 2960, 2,
   ST_SetSRID(ST_MakePoint(77.5100, 31.9900), 4326)::geography, 300, 'IN', 'Himachal Pradesh', 'Parvati Valley', NULL, NULL, FALSE),
  ('beas-kund',       'Beas Kund',             2, 18, 1400, 3700, 3,
   ST_SetSRID(ST_MakePoint(77.0800, 32.3600), 4326)::geography, 300, 'IN', 'Himachal Pradesh', 'Kullu', NULL, NULL, FALSE),
  ('bhrigu-lake',     'Bhrigu Lake',           3, 24, 1400, 4235, 3,
   ST_SetSRID(ST_MakePoint(77.2300, 32.2850), 4326)::geography, 300, 'IN', 'Himachal Pradesh', 'Kullu', NULL, NULL, FALSE),
  ('hampta-pass',     'Hampta Pass',           3, 35, 1270, 4270, 5,
   ST_SetSRID(ST_MakePoint(77.3700, 32.2700), 4326)::geography, 300, 'IN', 'Himachal Pradesh', 'Kullu', NULL, NULL, FALSE),

  -- Uttarakhand
  ('kedarkantha',     'Kedarkantha',           2, 20, 1860, 3810, 4,
   ST_SetSRID(ST_MakePoint(78.1772, 31.0219), 4326)::geography, 300, 'IN', 'Uttarakhand', 'Garhwal', '12-01', '03-15', FALSE),
  ('brahmatal',       'Brahmatal',             2, 24, 1500, 3734, 5,
   ST_SetSRID(ST_MakePoint(79.5550, 30.1400), 4326)::geography, 300, 'IN', 'Uttarakhand', 'Garhwal', '12-01', '03-15', FALSE),
  ('har-ki-dun',      'Har Ki Dun',            2, 47, 1600, 3566, 6,
   ST_SetSRID(ST_MakePoint(78.4300, 31.1500), 4326)::geography, 300, 'IN', 'Uttarakhand', 'Garhwal', NULL, NULL, FALSE),
  ('pindari-glacier', 'Pindari Glacier (Zero Point)', 3, 90, 1900, 3660, 6,
   ST_SetSRID(ST_MakePoint(80.0000, 30.2700), 4326)::geography, 300, 'IN', 'Uttarakhand', 'Kumaon', NULL, NULL, FALSE),

  -- Local test loop for Phase 0 field testing (deactivate before beta)
  ('dev-aravalli-test-loop', '[DEV] Aravalli Biodiversity Park Test Loop', 1, 4, 30, 300, 1,
   ST_SetSRID(ST_MakePoint(77.1064, 28.4744), 4326)::geography, 300, 'IN', 'Haryana', 'Aravalli', NULL, NULL, FALSE)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  grade             = EXCLUDED.grade,
  distance_km       = EXCLUDED.distance_km,
  elevation_gain_m  = EXCLUDED.elevation_gain_m,
  max_altitude_m    = EXCLUDED.max_altitude_m,
  typical_days      = EXCLUDED.typical_days,
  endpoint          = EXCLUDED.endpoint,
  endpoint_radius_m = EXCLUDED.endpoint_radius_m,
  state             = EXCLUDED.state,
  terrain_region    = EXCLUDED.terrain_region,
  winter_start_md   = EXCLUDED.winter_start_md,
  winter_end_md     = EXCLUDED.winter_end_md,
  coords_verified   = EXCLUDED.coords_verified;
