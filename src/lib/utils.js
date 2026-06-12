// Utility functions for the app
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in km
}

export function adjustOverlappingCoordinates(spotsList) {
  if (!spotsList || spotsList.length === 0) return [];
  
  const adjustedSpots = [];
  const coordCounts = {};
  
  // Grid size of 0.00008 degrees (approx 8-10 meters)
  const GRID_SIZE = 0.00008;

  spotsList.forEach((spot) => {
    const gridLat = Math.round(spot.latitude / GRID_SIZE);
    const gridLng = Math.round(spot.longitude / GRID_SIZE);
    const key = `${gridLat},${gridLng}`;

    if (!coordCounts[key]) {
      coordCounts[key] = [];
    }
    coordCounts[key].push(spot);
  });

  Object.keys(coordCounts).forEach((key) => {
    const group = coordCounts[key];
    if (group.length === 1) {
      adjustedSpots.push(group[0]);
    } else {
      const count = group.length;
      group.forEach((spot, index) => {
        // Displace overlapping points in a clean circle around the center point
        // Using a radius of 0.00006 degrees (~6 meters)
        const angle = (index * 2 * Math.PI) / count;
        const radius = 0.00006;
        
        adjustedSpots.push({
          ...spot,
          latitude: spot.latitude + Math.cos(angle) * radius,
          longitude: spot.longitude + Math.sin(angle) * radius,
          isDisplaced: true
        });
      });
    }
  });

  return adjustedSpots;
}
