import { supabase } from './supabaseClient';
import { getCachedZones } from './offlineCache';

export const BADGE_DEFS = {
  pioneer: {
    id: 'pioneer',
    name: 'Pioneer',
    emoji: '🛰️',
    description: 'First explorer to drop 5 spots in a newly downloaded/cached offline map grid.',
    target: 5
  },
  gem_hunter: {
    id: 'gem_hunter',
    name: 'Gem Hunter',
    emoji: '💎',
    description: 'Drop 10 approved spots in the community map.',
    target: 10
  },
  trail_blazer: {
    id: 'trail_blazer',
    name: 'Trail Blazer',
    emoji: '🥾',
    description: 'Drop 5 spots in outdoor categories.',
    target: 5
  },
  vibe_lord: {
    id: 'vibe_lord',
    name: 'Vibe Lord',
    emoji: '🔮',
    description: 'Rate the vibe vectors on 15 distinct spots.',
    target: 15
  },
  solo_explorer: {
    id: 'solo_explorer',
    name: 'Solo Explorer',
    emoji: '🛡️',
    description: 'Successfully complete 3 Safe Trek sessions.',
    target: 3
  }
};

// Helper for geographical distance in km
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Check if coordinates lie inside any cached offline zone
function isInsideCachedZones(lat, lng, zones) {
  if (!zones || zones.length === 0) return false;
  return zones.some((zone) => {
    let zLat, zLng;
    if (Array.isArray(zone.center)) {
      zLat = zone.center[0];
      zLng = zone.center[1];
    } else if (zone.center && typeof zone.center === 'object') {
      zLat = zone.center.lat;
      zLng = zone.center.lng;
    } else {
      return false;
    }
    const dist = getDistance(lat, lng, zLat, zLng);
    return dist <= (zone.radius || 10);
  });
}

// Fetch user data from DB and local caches, then evaluate badges progress
export async function getBadgesProgress(user) {
  const progress = {
    pioneer: { current: 0, target: BADGE_DEFS.pioneer.target, earned: false },
    gem_hunter: { current: 0, target: BADGE_DEFS.gem_hunter.target, earned: false },
    trail_blazer: { current: 0, target: BADGE_DEFS.trail_blazer.target, earned: false },
    vibe_lord: { current: 0, target: BADGE_DEFS.vibe_lord.target, earned: false },
    solo_explorer: { current: 0, target: BADGE_DEFS.solo_explorer.target, earned: false }
  };

  // Local Caches
  const localCreated = JSON.parse(localStorage.getItem('spota_created_spots') || '[]');
  const localRated = JSON.parse(localStorage.getItem('spota_rated_spots') || '[]');
  const localCompletedTrekCount = Number(localStorage.getItem('spota_completed_treks_count') || '0');
  const localEarned = JSON.parse(localStorage.getItem('spota_earned_badges') || '[]');

  // Cached Zones from IndexedDB
  let cachedZones = [];
  try {
    cachedZones = await getCachedZones();
  } catch (err) {
    console.warn('IndexedDB unavailable or empty:', err);
  }

  // Database Data
  let dbSpots = [];
  let dbRatings = [];
  let dbTreksCount = 0;
  let dbEarnedBadges = [];

  const isGuest = !user || user.isGuest;

  if (!isGuest) {
    try {
      // 1. Fetch spots
      const { data: spots } = await supabase
        .from('spots')
        .select('id, category, latitude, longitude')
        .eq('user_id', user.id)
        .neq('status', 'deleted');
      if (spots) dbSpots = spots;

      // 2. Fetch ratings
      const { data: ratings } = await supabase
        .from('vibe_ratings')
        .select('id, spot_id')
        .eq('user_id', user.id);
      if (ratings) dbRatings = ratings;

      // 3. Fetch completed treks
      const { count } = await supabase
        .from('safe_treks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed');
      if (count !== null) dbTreksCount = count;

      // 4. Fetch earned badges
      const { data: badges } = await supabase
        .from('user_badges')
        .select('badge_id')
        .eq('user_id', user.id);
      if (badges) dbEarnedBadges = badges.map((b) => b.badge_id);
    } catch (err) {
      console.warn('Database query failed for badges check, falling back to local data:', err);
    }
  }

  // Merge spots
  const mergedSpotsMap = new Map();
  dbSpots.forEach((s) => mergedSpotsMap.set(s.id, s));
  localCreated.forEach((s) => {
    if (s && s.id) {
      mergedSpotsMap.set(s.id, {
        id: s.id,
        category: s.category,
        latitude: s.latitude || s.lat,
        longitude: s.longitude || s.lng
      });
    }
  });
  const mergedSpots = Array.from(mergedSpotsMap.values());

  // Merge rated spots
  const mergedRatedSpotIds = new Set();
  dbRatings.forEach((r) => {
    if (r.spot_id) mergedRatedSpotIds.add(r.spot_id);
  });
  localRated.forEach((spotId) => {
    if (spotId) mergedRatedSpotIds.add(spotId);
  });

  // Merge completed treks count
  const completedTreks = Math.max(dbTreksCount, localCompletedTrekCount);

  // Merge earned badges list
  const earnedBadgeIds = new Set([...dbEarnedBadges, ...localEarned]);

  // Evaluate Badge 1: pioneer (5 spots inside cached offline zone bounds)
  let pioneerCount = 0;
  mergedSpots.forEach((spot) => {
    if (spot.latitude !== undefined && spot.longitude !== undefined) {
      if (isInsideCachedZones(spot.latitude, spot.longitude, cachedZones)) {
        pioneerCount++;
      }
    }
  });
  progress.pioneer.current = pioneerCount;
  progress.pioneer.earned = earnedBadgeIds.has('pioneer') || pioneerCount >= BADGE_DEFS.pioneer.target;

  // Evaluate Badge 2: gem_hunter (10 spots total)
  const totalGems = mergedSpots.length;
  progress.gem_hunter.current = totalGems;
  progress.gem_hunter.earned = earnedBadgeIds.has('gem_hunter') || totalGems >= BADGE_DEFS.gem_hunter.target;

  // Evaluate Badge 3: trail_blazer (5 spots in outdoor categories)
  const outdoorCategories = ['trail', 'campsite', 'waterfall', 'mountain', 'beach', 'lake', 'forest', 'cave'];
  const outdoorCount = mergedSpots.filter((s) => outdoorCategories.includes(s.category)).length;
  progress.trail_blazer.current = outdoorCount;
  progress.trail_blazer.earned = earnedBadgeIds.has('trail_blazer') || outdoorCount >= BADGE_DEFS.trail_blazer.target;

  // Evaluate Badge 4: vibe_lord (15 distinct rated spots)
  const ratedCount = mergedRatedSpotIds.size;
  progress.vibe_lord.current = ratedCount;
  progress.vibe_lord.earned = earnedBadgeIds.has('vibe_lord') || ratedCount >= BADGE_DEFS.vibe_lord.target;

  // Evaluate Badge 5: solo_explorer (3 completed treks)
  progress.solo_explorer.current = completedTreks;
  progress.solo_explorer.earned = earnedBadgeIds.has('solo_explorer') || completedTreks >= BADGE_DEFS.solo_explorer.target;

  return { progress, earnedBadgeIds: Array.from(earnedBadgeIds) };
}

// Check and save newly earned badges, return list of badge objects unlocked in this execution
export async function checkBadges(user) {
  if (!user) return [];

  const { progress, earnedBadgeIds } = await getBadgesProgress(user);
  const newlyUnlocked = [];

  const localEarned = new Set(JSON.parse(localStorage.getItem('spota_earned_badges') || '[]'));
  const isGuest = user.isGuest;

  for (const badgeId of Object.keys(BADGE_DEFS)) {
    const badgeProgress = progress[badgeId];
    // If requirement met but not in already earned badges
    if (badgeProgress.current >= badgeProgress.target && !earnedBadgeIds.includes(badgeId)) {
      newlyUnlocked.push(BADGE_DEFS[badgeId]);

      // Save locally
      localEarned.add(badgeId);
      localStorage.setItem('spota_earned_badges', JSON.stringify(Array.from(localEarned)));

      // Save to Supabase if not guest
      if (!isGuest) {
        try {
          await supabase
            .from('user_badges')
            .insert({
              user_id: user.id,
              badge_id: badgeId
            })
            .maybeSingle();
        } catch (err) {
          console.warn(`Failed to insert badge ${badgeId} to DB offline fallback active:`, err);
        }
      }
    }
  }

  // If new badges were unlocked, trigger celebration!
  if (newlyUnlocked.length > 0) {
    triggerBadgeCelebration(newlyUnlocked);
  }

  return newlyUnlocked;
}

// Trigger celebratory canvas confetti animation overlay
export function triggerBadgeCelebration(badges) {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.zIndex = '999999';
  canvas.style.pointerEvents = 'none';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let animationFrameId;

  // Resize handler
  const resizeCanvas = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Particles config
  const particles = [];
  const colors = [
    '#E07A5F', // Terracotta
    '#F4A261', // Gold/Sand
    '#83C5BE', // Teal
    '#6C8C74', // Sage Green
    '#E9C46A', // Bright Yellow
    '#9B5DE5', // Vivid Purple
    '#FF6B6B'  // Rose Pink
  ];

  class ConfettiParticle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * -canvas.height - 20;
      this.size = Math.random() * 8 + 6;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.speedY = Math.random() * 3 + 2;
      this.speedX = Math.random() * 2 - 1;
      this.rotation = Math.random() * 360;
      this.rotationSpeed = Math.random() * 4 - 2;
      this.opacity = 1;
    }

    update() {
      this.y += this.speedY;
      this.x += this.speedX + Math.sin(this.y / 30) * 0.5;
      this.rotation += this.rotationSpeed;
      if (this.y > canvas.height - 100) {
        this.opacity -= 0.02;
      }
    }

    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate((this.rotation * Math.PI) / 180);
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      // Draw rectangular confetti piece
      ctx.fillRect(-this.size / 2, -this.size / 4, this.size, this.size / 2);
      ctx.restore();
    }
  }

  // Create initial burst
  for (let i = 0; i < 150; i++) {
    particles.push(new ConfettiParticle());
  }

  const startTime = Date.now();
  const duration = 4000; // 4 seconds animation

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update and draw particles
    let alive = false;
    particles.forEach((p) => {
      p.update();
      if (p.opacity > 0 && p.y < canvas.height) {
        p.draw();
        alive = true;
      }
    });

    if (Date.now() - startTime < duration && alive) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      cleanup();
    }
  }

  function cleanup() {
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', resizeCanvas);
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  }

  animate();

  // Create badge unlock alert banner in UI
  const alertBox = document.createElement('div');
  alertBox.className = 'badge-unlock-banner animate-bounce-in';
  alertBox.style.position = 'fixed';
  alertBox.style.top = '32px';
  alertBox.style.left = '50%';
  alertBox.style.transform = 'translateX(-50%)';
  alertBox.style.zIndex = '999999';
  alertBox.style.backgroundColor = 'rgba(28, 38, 32, 0.95)';
  alertBox.style.backdropFilter = 'blur(12px)';
  alertBox.style.border = '1px solid rgba(108, 140, 116, 0.4)';
  alertBox.style.borderRadius = '16px';
  alertBox.style.padding = '16px 24px';
  alertBox.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 0 12px rgba(255,255,255,0.05)';
  alertBox.style.display = 'flex';
  alertBox.style.flexDirection = 'column';
  alertBox.style.alignItems = 'center';
  alertBox.style.gap = '8px';
  alertBox.style.minWidth = '280px';
  alertBox.style.color = '#FFF';
  alertBox.style.fontFamily = "'Outfit', sans-serif";
  alertBox.style.textAlign = 'center';

  // Content
  const title = document.createElement('div');
  title.style.fontSize = '12px';
  title.style.letterSpacing = '2px';
  title.style.color = 'var(--color-accent, #6C8C74)';
  title.style.fontWeight = '700';
  title.innerText = '🏆 BADGE UNLOCKED!';

  const emojiRow = document.createElement('div');
  emojiRow.style.fontSize = '48px';
  emojiRow.style.margin = '4px 0';
  emojiRow.innerText = badges.map(b => b.emoji).join(' ');

  const badgeNames = document.createElement('h4');
  badgeNames.style.margin = '0';
  badgeNames.style.fontSize = '20px';
  badgeNames.style.fontWeight = '800';
  badgeNames.innerText = badges.map(b => b.name).join(' & ');

  const desc = document.createElement('p');
  desc.style.margin = '0';
  desc.style.fontSize = '12px';
  desc.style.color = 'rgba(255,255,255,0.7)';
  desc.style.lineHeight = '1.4';
  desc.innerText = badges.map(b => b.description).join(' ');

  alertBox.appendChild(title);
  alertBox.appendChild(emojiRow);
  alertBox.appendChild(badgeNames);
  alertBox.appendChild(desc);

  document.body.appendChild(alertBox);

  // Slide down & fade out after 3.5s
  setTimeout(() => {
    alertBox.style.transition = 'all 0.5s ease';
    alertBox.style.opacity = '0';
    alertBox.style.transform = 'translate(-50%, -50px)';
    setTimeout(() => {
      if (alertBox.parentNode) {
        alertBox.parentNode.removeChild(alertBox);
      }
    }, 500);
  }, 4000);
}
