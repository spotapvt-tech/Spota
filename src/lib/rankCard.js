/**
 * rankCard.js — shareable rank image (1080×1350, Instagram portrait) drawn on a
 * canvas, for the launch campaign ("#3 in Himachal this season").
 * No external assets, so it works offline.
 */

import { tierById } from './tiers';

const W = 1080;
const H = 1350;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draw the card onto a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{rank:number, ap:number, tier:string, username:string, boardLabel:string, windowLabel:string}} d
 */
export function drawRankCard(canvas, { rank, ap, tier, username, boardLabel, windowLabel }) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const t = tierById(tier);

  // Sky → ridge background (brand sage)
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#dfe9e2');
  sky.addColorStop(0.55, '#a9c2b0');
  sky.addColorStop(1, '#3f5a48');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Layered ridges
  const ridge = (pts, color) => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  ridge([[0, 980], [180, 860], [360, 940], [560, 780], [760, 900], [920, 820], [1080, 880]], 'rgba(62, 107, 79,0.55)');
  ridge([[0, 1100], [220, 1010], [430, 1080], [640, 960], [860, 1060], [1080, 1000]], 'rgba(63,90,72,0.85)');
  // Glass card
  roundRect(ctx, 90, 150, W - 180, 620, 48);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#5B615C';
  ctx.font = '600 40px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(`${boardLabel} · ${windowLabel}`.toUpperCase(), W / 2, 250);

  ctx.fillStyle = '#2C3531';
  ctx.font = '800 260px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(`#${rank}`, W / 2, 500);

  ctx.fillStyle = '#3E6B4F';
  ctx.font = '700 64px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(`${Number(ap).toLocaleString('en-IN')} AP`, W / 2, 600);

  ctx.fillStyle = '#2C3531';
  ctx.font = '600 48px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(`${t.emoji} ${t.name}  ·  @${username || 'explorer'}`, W / 2, 690);

  // Footer brand
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 72px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('Spota Expeditions', W / 2, 1210);
  ctx.font = '500 38px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Verified treks. Real ranks.', W / 2, 1270);
  return canvas;
}

/** @returns {Promise<Blob>} PNG of the rank card */
export function rankCardBlob(data) {
  const canvas = drawRankCard(document.createElement('canvas'), data);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render rank card'))), 'image/png');
  });
}

/**
 * Share the card via the native share sheet when files are supported,
 * otherwise download it. Returns 'shared' | 'downloaded' | 'cancelled'.
 */
export async function shareRankCard(data, text) {
  const blob = await rankCardBlob(data);
  const file = new File([blob], `spota-rank-${data.rank}.png`, { type: 'image/png' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
