// Dependency-free viewport culling + grid clustering for the Explore map.
// Every pin is a DOM OverlayView that repositions on each pan/zoom frame, so
// the cost of a frame grows with the number of mounted pins. We mount only
// pins inside the (padded) viewport, and above a threshold bucket them into
// screen-space grid cells at the current zoom.

const TILE = 256;

// Web Mercator world-pixel coordinates at `zoom` (same projection as Google Maps).
export function projectToWorld(lat, lng, zoom) {
  const scale = TILE * 2 ** zoom;
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

// bounds: { north, south, east, west } (no antimeridian wrap — fine for our regions)
export function padBounds(bounds, ratio = 0.2) {
  const dLat = (bounds.north - bounds.south) * ratio;
  const dLng = (bounds.east - bounds.west) * ratio;
  return {
    north: bounds.north + dLat,
    south: bounds.south - dLat,
    east: bounds.east + dLng,
    west: bounds.west - dLng,
  };
}

export function inBounds(lat, lng, b) {
  return lat <= b.north && lat >= b.south && lng <= b.east && lng >= b.west;
}

/**
 * spots → render items:
 *   { type: 'spot', spot }
 *   { type: 'cluster', id, lat, lng, count, bounds }
 * `keepIds` (e.g. the selected pin) are never culled or clustered.
 */
export function buildMapItems(spots, viewport, {
  threshold = 60,
  cellPx = 72,
  maxClusterZoom = 16,
  keepIds = [],
} = {}) {
  const keep = new Set(keepIds.filter((id) => id != null));
  if (!viewport) return spots.map((spot) => ({ type: 'spot', spot }));

  const padded = padBounds(viewport.bounds);
  const kept = [];
  const candidates = [];
  for (const spot of spots) {
    if (keep.has(spot.id)) kept.push(spot);
    else if (inBounds(spot.latitude, spot.longitude, padded)) candidates.push(spot);
  }

  if (candidates.length + kept.length <= threshold || viewport.zoom > maxClusterZoom) {
    return [...candidates, ...kept].map((spot) => ({ type: 'spot', spot }));
  }

  const cells = new Map();
  for (const spot of candidates) {
    const p = projectToWorld(spot.latitude, spot.longitude, viewport.zoom);
    const key = `${Math.floor(p.x / cellPx)}:${Math.floor(p.y / cellPx)}`;
    let cell = cells.get(key);
    if (!cell) { cell = []; cells.set(key, cell); }
    cell.push(spot);
  }

  const items = kept.map((spot) => ({ type: 'spot', spot }));
  for (const [key, members] of cells) {
    if (members.length === 1) {
      items.push({ type: 'spot', spot: members[0] });
      continue;
    }
    let lat = 0, lng = 0;
    const b = { north: -90, south: 90, east: -180, west: 180 };
    for (const m of members) {
      lat += m.latitude;
      lng += m.longitude;
      b.north = Math.max(b.north, m.latitude);
      b.south = Math.min(b.south, m.latitude);
      b.east = Math.max(b.east, m.longitude);
      b.west = Math.min(b.west, m.longitude);
    }
    items.push({
      type: 'cluster',
      id: `c${viewport.zoom}:${key}`,
      lat: lat / members.length,
      lng: lng / members.length,
      count: members.length,
      bounds: b,
    });
  }
  return items;
}
