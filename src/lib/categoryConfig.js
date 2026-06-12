export const categories = [
  { id: 'cafe', label: 'Cafe', emoji: '☕', color: '#6C8C74' },
  { id: 'viewpoint', label: 'Viewpoint', emoji: '🌅', color: '#E07A5F' },
  { id: 'street-art', label: 'Street Art', emoji: '🎨', color: '#DDA15E' },
  { id: 'event', label: 'Event', emoji: '🎫', color: '#4A90E2' },
  { id: 'trail', label: 'Trail', emoji: '🥾', color: '#3A5A40' },
  { id: 'campsite', label: 'Campsite', emoji: '⛺', color: '#A3B18A' },
  { id: 'waterfall', label: 'Waterfall', emoji: '💦', color: '#588157' },
  { id: 'mountain', label: 'Mountain', emoji: '🏔️', color: '#344E41' },
  { id: 'beach', label: 'Beach', emoji: '🏖️', color: '#E9C46A' },
  { id: 'lake', label: 'Lake', emoji: '🌊', color: '#264653' },
  { id: 'forest', label: 'Forest', emoji: '🌲', color: '#2A9D8F' },
  { id: 'cave', label: 'Cave', emoji: '🕳️', color: '#F4A261' }
];

export const getCategoryById = (id) => {
  return categories.find(cat => cat.id === id) || { id: 'other', label: 'Other', emoji: '💎', color: '#6C8C74' };
};
