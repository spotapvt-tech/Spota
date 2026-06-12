/**
 * Helper utilities for Safe Trek Mode countdowns and local state sync
 */

export function calculateTimeRemaining(lastCheckedIn, intervalHours) {
  if (!lastCheckedIn || !intervalHours) return 0;
  
  const lastCheckedInTime = new Date(lastCheckedIn).getTime();
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const targetTime = lastCheckedInTime + intervalMs;
  
  const diffMs = targetTime - Date.now();
  return Math.max(0, Math.floor(diffMs / 1000));
}

export function formatCountdown(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds <= 0) {
    return '00:00:00';
  }
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  const pad = (num) => String(num).padStart(2, '0');
  
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function isNearDeadline(totalSeconds) {
  // Near deadline is defined as less than or equal to 30 minutes remaining (1800 seconds)
  return totalSeconds > 0 && totalSeconds <= 1800;
}

export function saveActiveTrekLocal(trek) {
  if (!trek) return;
  try {
    localStorage.setItem('spota_active_trek', JSON.stringify(trek));
  } catch (e) {
    console.error('Failed to save active trek locally:', e);
  }
}

export function getActiveTrekLocal() {
  try {
    const data = localStorage.getItem('spota_active_trek');
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Failed to parse local active trek:', e);
    return null;
  }
}

export function clearActiveTrekLocal() {
  try {
    localStorage.removeItem('spota_active_trek');
  } catch (e) {
    console.error('Failed to clear active trek locally:', e);
  }
}
