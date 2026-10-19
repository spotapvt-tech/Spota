// Discovery categories. `emoji` is kept for legacy surfaces (share cards,
// notifications); new UI renders `icon` (a lucide-react icon name, see
// components/ui/CategoryGlyph.jsx) on a tinted tile using `color`.
// Colours are tuned for the dark "Night Topo" map — each is legible on #121915.
export const categories = [
  { id: 'trail', label: 'Trail', emoji: '🥾', icon: 'Footprints', color: '#C6F36B' },
  { id: 'mountain', label: 'Peak', emoji: '🏔️', icon: 'Mountain', color: '#E9EDE2' },
  { id: 'viewpoint', label: 'Viewpoint', emoji: '🌅', icon: 'Binoculars', color: '#FF9E6B' },
  { id: 'waterfall', label: 'Waterfall', emoji: '💦', icon: 'Droplets', color: '#7FD6FF' },
  { id: 'lake', label: 'Lake', emoji: '🌊', icon: 'Waves', color: '#5BB8E8' },
  { id: 'forest', label: 'Forest', emoji: '🌲', icon: 'TreePine', color: '#5FD39A' },
  { id: 'campsite', label: 'Campsite', emoji: '⛺', icon: 'Tent', color: '#F2C14E' },
  { id: 'cave', label: 'Cave', emoji: '🕳️', icon: 'Flashlight', color: '#C9A27E' },
  { id: 'beach', label: 'Beach', emoji: '🏖️', icon: 'Sun', color: '#FFD166' },
  { id: 'cafe', label: 'Cafe', emoji: '☕', icon: 'Coffee', color: '#D9A47A' },
  { id: 'street-art', label: 'Street Art', emoji: '🎨', icon: 'Palette', color: '#FF7AB6' },
  { id: 'event', label: 'Event', emoji: '🎫', icon: 'Ticket', color: '#B79CFF' }
];

export const getCategoryById = (id) => {
  return categories.find(cat => cat.id === id) || { id: 'other', label: 'Spot', emoji: '💎', icon: 'MapPin', color: '#C6F36B' };
};
