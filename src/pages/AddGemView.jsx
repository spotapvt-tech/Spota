import { useState, useEffect, useRef } from 'react';
import { Camera, MapPin, UploadCloud, X, Video, Sparkles, Award, Bot, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import './AddGemView.css';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { categories, getCategoryById } from '../lib/categoryConfig';
import { checkBadges } from '../lib/badgeEngine';

// Fix for default Leaflet marker icons in React
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper component to center map dynamically
function MapCenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom());
    }
  }, [position, map]);
  return null;
}

// AI Vibe description suggestions mapping
const AI_SUGGESTIONS_MAP = {
  cafe: {
    warm: "A super cozy, wood-paneled escape with warm lighting, rustic decor, and a calm workspace vibe. Perfect for sipping a slow pour-over and getting lost in a good book. ☕️📖",
    bright: "A gorgeous, sun-drenched minimalist cafe with clean white walls and aesthetic indoor plants. High grid-worthiness and an amazing matcha latte selection! 🍵✨",
    dark: "An intimate, low-lit coffee lounge with a moody jazz aesthetic. Perfect for quiet evening conversations or winding down with a smooth cold brew. ☕️🌙",
    neutral: "A hidden gem cafe with an incredible espresso bar, cozy corners, and a super welcoming local community feel. ☕️🍃"
  },
  trail: {
    green: "A lush, emerald canopy path winding deep into the quiet woods. Surrounded by ferns, birdsong, and the grounding scent of pine. A perfect forest bath. 🌲🚶‍♂️",
    neutral: "A rugged, scenic hiking path offering a raw connection with the wilderness. Grounding, fresh, and beautiful at every twist. 🥾🍂"
  },
  waterfall: {
    blue: "A hidden pool of cascading mountain water, shimmering in deep turquoise and blue shades. The air is crisp, misty, and carries a gentle roar. 💦🌀",
    neutral: "A breathtaking waterfall hidden behind a wall of green foliage. The cool mist and steady rush of water make it a perfect place to recharge. 🌊⛰️"
  },
  campsite: {
    dark: "A secluded pitch under a breathtaking starry night sky, far away from city glow. Absolute peace with nothing but the crackle of a campfire. ⛺️🔥✨",
    green: "A peaceful forest camp site nestled in a quiet clearing. Waking up to fresh pine breeze and morning mist. 🌲🏕️",
    neutral: "A dream wilderness camping spot surrounded by nature's sounds. Remote, peaceful, and perfect for stargazing. ⛺️🌌"
  },
  viewpoint: {
    sunset: "An absolute front-row seat to golden hour. Warm pink and golden gradients spreading across the endless horizon. Breathtaking. 🌅🧡",
    blue: "A high-altitude clearing offering vast, panoramic blue sky vistas over the mountain range. Floating above the clouds. ⛰️☁️",
    neutral: "An incredible vantage point showing off panoramic vistas of the landscape. The perfect spot to pause and take in the scale of nature. 📍🏔️"
  },
  hostel: {
    warm: "A warm, high-vibe boutique hostel with cozy common rooms, local art, and open social spaces. Woven rugs and fairy lights make it feel like home. 🎒✨",
    neutral: "A vibrant social hub filled with friendly explorers, map walls, and positive travel energy. 🎒🗺️"
  },
  homestay: {
    warm: "A charming, family-run cottage homestay surrounded by apple orchards. Warm hospitality, home-cooked food, and a traditional fireplace. 🏡🔥",
    neutral: "A peaceful retreat offering local hospitality, stunning garden views, and a slow, relaxing mountain lifestyle. 🏡🌸"
  },
  default: "A magical hidden gem tucked away from the main trails. Incredible atmosphere, positive vibes, and a must-visit for any traveller looking for a unique spot! 💎✨"
};

// Quick Vibe Presets for one-click rating setup
const VIBE_PRESETS = {
  work_cafe: {
    label: 'Work Cafe',
    emoji: '💻',
    ratings: { cozy: 4, insta_worthy: 3, lively: 2, zen: 4, workspace: 5 }
  },
  social_hub: {
    label: 'Social Hub',
    emoji: '🤝',
    ratings: { cozy: 3, insta_worthy: 4, lively: 5, zen: 2, workspace: 2 }
  },
  insta_spot: {
    label: 'Insta Spot',
    emoji: '📸',
    ratings: { cozy: 3, insta_worthy: 5, lively: 4, zen: 2, workspace: 2 }
  },
  zen_escape: {
    label: 'Zen Escape',
    emoji: '🧘',
    ratings: { cozy: 5, insta_worthy: 4, lively: 1, zen: 5, workspace: 3 }
  }
};

// Category-specific tag suggestions
const RECOMMENDED_TAGS_MAP = {
  cafe: ['matcha', 'wifi', 'workspace', 'brunch', 'aesthetic', 'cozy', 'vinyl', 'pastries'],
  viewpoint: ['sunset', 'sunrise', 'citylights', 'panorama', 'goldenhour', 'scenic', 'peaceful'],
  'street-art': ['murals', 'graffiti', 'indie', 'neon', 'aesthetic', 'colorful', 'hiddenalley', 'insta_worthy'],
  event: ['livemusic', 'popupshop', 'vibes', 'social', 'nightlife', 'indie', 'market', 'festival'],
  trail: ['trek', 'hiking', 'forestbath', 'nature', 'summit', 'scenic', 'adventure'],
  campsite: ['stargazing', 'campfire', 'secluded', 'wilderness', 'outdoor', 'hammock', 'peaceful'],
  waterfall: ['misty', 'refreshing', 'hike', 'nature', 'swimming', 'hidden', 'photogenic'],
  mountain: ['summit', 'snow', 'climbing', 'views', 'cold', 'alpine', 'adventure'],
  beach: ['sunset', 'sandy', 'waves', 'surfing', 'sunbathing', 'bonfire', 'coastal'],
  lake: ['paddleboarding', 'kayaking', 'peaceful', 'reflection', 'swimming', 'cabinvibes'],
  forest: ['pine', 'greenery', 'foraging', 'birds', 'shade', 'mystical', 'quiet'],
  cave: ['underground', 'exploring', 'stalactites', 'cool_air', 'dark', 'adventure'],
  default: ['aesthetic', 'hiddengem', 'localspot', 'peaceful', 'photogenic']
};

// Client-side image analyzer helper (analyzes image colors and brightness offscreen)
const analyzeImageColor = (imageSrc) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ brightness: 'neutral', dominant: 'neutral' });
          return;
        }
        ctx.drawImage(img, 0, 0, 10, 10);
        const imgData = ctx.getImageData(0, 0, 10, 10).data;
        
        let totalR = 0, totalG = 0, totalB = 0;
        let pixelCount = 0;
        for (let i = 0; i < imgData.length; i += 4) {
          totalR += imgData[i];
          totalG += imgData[i+1];
          totalB += imgData[i+2];
          pixelCount++;
        }
        
        const avgR = totalR / pixelCount;
        const avgG = totalG / pixelCount;
        const avgB = totalB / pixelCount;
        const brightness = (avgR * 299 + avgG * 587 + avgB * 114) / 1000;
        
        let dominant = 'neutral';
        if (avgG > avgR + 10 && avgG > avgB + 10) {
          dominant = 'green';
        } else if (avgB > avgR + 10 && avgB > avgG + 10) {
          dominant = 'blue';
        } else if (avgR > avgG + 10 && avgR > avgB + 10) {
          if (avgR > 170 && avgG < 140) {
            dominant = 'sunset';
          } else {
            dominant = 'warm';
          }
        }
        
        let brightnessType = 'neutral';
        if (brightness < 70) {
          brightnessType = 'dark';
        } else if (brightness > 190) {
          brightnessType = 'bright';
        }
        
        resolve({ brightness: brightnessType, dominant });
      } catch (err) {
        console.warn('Canvas image analysis failed:', err);
        resolve({ brightness: 'neutral', dominant: 'neutral' });
      }
    };
    img.onerror = () => {
      resolve({ brightness: 'neutral', dominant: 'neutral' });
    };
    img.src = imageSrc;
  });
};

const getSuggestedDescription = (category, profile) => {
  if (!profile) return AI_SUGGESTIONS_MAP.default;
  const cat = category || 'default';
  const dominant = profile.dominant || 'neutral';
  const brightness = profile.brightness || 'neutral';
  
  let desc = null;
  if (AI_SUGGESTIONS_MAP[cat]) {
    if (AI_SUGGESTIONS_MAP[cat][dominant]) {
      desc = AI_SUGGESTIONS_MAP[cat][dominant];
    } else if (AI_SUGGESTIONS_MAP[cat][brightness]) {
      desc = AI_SUGGESTIONS_MAP[cat][brightness];
    } else if (AI_SUGGESTIONS_MAP[cat].neutral) {
      desc = AI_SUGGESTIONS_MAP[cat].neutral;
    }
  }
  return desc || AI_SUGGESTIONS_MAP.default;
};

// Marker component that handles click-to-place and dragging
function LocationMarker({ position, setPosition }) {
  // eslint-disable-next-line no-unused-vars
  const map = useMapEvents({
    click(e) {
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return position === null ? null : (
    <Marker 
      position={[position.lat, position.lng]} 
      draggable={true}
      eventHandlers={{
        dragend(e) {
          const marker = e.target;
          const pos = marker.getLatLng();
          setPosition({ lat: pos.lat, lng: pos.lng });
        }
      }}
    />
  );
}

export default function AddGemView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(''); // Holds base64 or public URL
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(''); // Holds preview video URL
  const [location, setLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagsText, setTagsText] = useState('');
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [address, setAddress] = useState('');
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [cameraBase64, setCameraBase64] = useState(null); // Holds camera raw base64 string
  const [successSpot, setSuccessSpot] = useState(null);
  
  // Default map center: New York or user location on load
  const [mapCenter, setMapCenter] = useState([40.7128, -74.0060]);

  // Autocomplete Geocoding & Dropdown state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchContainerRef = useRef(null);
  const isTypingRef = useRef(false);

  const [formData, setFormData] = useState({
    title: '',
    category: 'cafe',
    vibe: ''
  });

  const [activeTab, setActiveTab] = useState('form'); // 'form' | 'preview'
  const [badgeMilestone, setBadgeMilestone] = useState(null);
  const [pioneerAlert, setPioneerAlert] = useState(false);
  const [vibeRatings, setVibeRatings] = useState({
    cozy: 3,
    insta_worthy: 3,
    lively: 3,
    zen: 3,
    workspace: 3
  });
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [imageColorProfile, setImageColorProfile] = useState(null);

  const vibeLabels = {
    cozy: ['Cold / Drafty 🥶', 'Chilly 🌬️', 'Decent', 'Comfy 😊', 'Super Warm & Snuggly 🧸'],
    insta_worthy: ['Basic / Bland 🥱', 'Average', 'Nice Angle 📐', 'Aesthetic ✨', 'Visual Masterpiece 📸'],
    lively: ['Ghost Town 🤫', 'Quiet / Chill', 'Social / Cool 🤝', 'Buzzing', 'Electric Energy 🔥'],
    zen: ['Loud / Chaotic 📢', 'Noisy', 'Relaxed', 'Peaceful 🍃', 'Dead Silent Sanctuary 🧘'],
    workspace: ['No Power/Wifi 🔌', 'Hard Seats', 'Decent Coffee ☕', 'Great Desk 💻', 'Nomad Heaven 🎒']
  };

  // Trigger client-side AI image analysis when image changes
  useEffect(() => {
    if (!imageUrl) {
      return;
    }

    // Defer to prevent blocking the UI thread during previews
    const timer = setTimeout(async () => {
      setIsAiAnalyzing(true);
      try {
        const profile = await analyzeImageColor(imageUrl);
        setImageColorProfile(profile);
        // Calculate description suggestion asynchronously in timeout to avoid sync setState warnings
        const suggestion = getSuggestedDescription(formData.category, profile);
        setAiSuggestion(suggestion);
      } catch (err) {
        console.warn('AI Image Analysis error:', err);
      } finally {
        setIsAiAnalyzing(false);
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Pioneer check hook
  useEffect(() => {
    const checkPioneerZone = async () => {
      if (!location) return;
      try {
        const { getCachedZones } = await import('../lib/offlineCache');
        const zones = await getCachedZones();
        if (zones && zones.length > 0) {
          const isInside = zones.some(zone => {
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
            const R = 6371; // km
            const dLat = ((location.lat - zLat) * Math.PI) / 180;
            const dLon = ((location.lng - zLng) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos((zLat * Math.PI) / 180) *
                Math.cos((location.lat * Math.PI) / 180) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const dist = R * c;
            return dist <= (zone.radius || 10);
          });
          setPioneerAlert(isInside);
        } else {
          setPioneerAlert(false);
        }
      } catch (err) {
        console.warn('Error checking offline zones for Pioneer badge:', err);
      }
    };
    checkPioneerZone();
  }, [location]);

  // Try to find user location on mount to center the map
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
          (position) => {
            const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
            setLocation(coords);
            setMapCenter([coords.lat, coords.lng]);
          },
          (error) => console.log('Geolocation on mount bypassed:', error),
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
      );
    }
  }, []);

  // Geocoding Autocomplete effect with debouncing & AbortController cancellation
  useEffect(() => {
    if (!isTypingRef.current || searchQuery.trim().length < 3) {
      setSearchError('');
      return;
    }

    const abortController = new AbortController();

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      setSearchError('');

      // Offline resilience check
      if (!navigator.onLine) {
        setSearchError('Offline: Search is unavailable. Use manual map pin-drop instead! 📍');
        setSearchResults([]);
        setShowDropdown(true);
        setIsSearching(false);
        return;
      }

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`,
          {
            signal: abortController.signal,
            headers: {
              'User-Agent': 'SpotaApp/1.0'
            }
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (!abortController.signal.aborted) {
            setSearchResults(data);
            if (data.length === 0) {
              setSearchError('No matching places found. Try another query or drop a pin manually! 🗺️');
            }
            setShowDropdown(true);
          }
        } else {
          if (!abortController.signal.aborted) {
            setSearchError('Search failed. Please try again or drop a pin manually.');
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          return; // Ignore abort errors
        }
        console.error('Error fetching autocomplete geocoding:', err);
        if (!abortController.signal.aborted) {
          setSearchError('Error connecting to search service. Drop a pin manually instead! 📍');
          setSearchResults([]);
          setShowDropdown(true);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 450);

    return () => {
      clearTimeout(delayDebounceFn);
      abortController.abort();
    };
  }, [searchQuery]);

  // Click outside to close geocoding dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelectResult = (item) => {
    isTypingRef.current = false;
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    
    // Validate coordinates to prevent map rendering crashes
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn('Invalid geocoding coordinates received:', item);
      setSearchError('Invalid coordinates received for this location.');
      return;
    }
    
    const coords = { lat, lng };
    
    setLocation(coords);
    setMapCenter([lat, lng]);
    setAddress(item.display_name || '');
    
    // Auto-fill title with the first segment of the name
    if (item.display_name) {
      const parts = item.display_name.split(',');
      const placeName = parts[0].trim();
      setFormData(prev => ({ ...prev, title: placeName }));
    }
    
    setShowDropdown(false);
    setSearchQuery(item.display_name);
    setSearchResults([]);
    setSearchError('');
  };

  const handleCategoryChange = (catId) => {
    setFormData(prev => ({ ...prev, category: catId }));
    
    // Update badge milestone dynamically
    const outdoorCategories = ['trail', 'campsite', 'waterfall', 'mountain', 'beach', 'lake', 'forest', 'cave'];
    if (outdoorCategories.includes(catId)) {
      const localCreated = JSON.parse(localStorage.getItem('spota_created_spots') || '[]');
      const categoryCount = localCreated.filter(s => outdoorCategories.includes(s.category)).length;
      if (categoryCount < 5) {
        setBadgeMilestone({
          badge: 'Trail Blazer',
          text: `🌲 Adventure Milestone: You have dropped ${categoryCount} outdoor spots. Dropping this will bring you ${categoryCount + 1} of 5 to the Trail Blazer Badge (+10 Reputation Points)!`
        });
      } else {
        setBadgeMilestone(null);
      }
    } else {
      setBadgeMilestone(null);
    }

    // Recalculate description suggestion dynamically
    if (imageColorProfile) {
      const suggestion = getSuggestedDescription(catId, imageColorProfile);
      setAiSuggestion(suggestion);
    }
  };

  const handleApplyVibePreset = (presetRatings) => {
    setVibeRatings(presetRatings);
  };

  const isPresetActive = (presetRatings) => {
    return Object.keys(presetRatings).every(key => vibeRatings[key] === presetRatings[key]);
  };

  const handleToggleTag = (tag) => {
    const currentTags = tagsText
      .split(',')
      .map(t => t.replace(/#/g, '').trim().toLowerCase())
      .filter(Boolean);
    
    let updatedTags;
    if (currentTags.includes(tag.toLowerCase())) {
      updatedTags = currentTags.filter(t => t !== tag.toLowerCase());
    } else {
      updatedTags = [...currentTags, tag.toLowerCase()];
    }
    setTagsText(updatedTags.join(', '));
  };

  const isTagActive = (tag) => {
    return tagsText
      .split(',')
      .map(t => t.replace(/#/g, '').trim().toLowerCase())
      .filter(Boolean)
      .includes(tag.toLowerCase());
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      } catch (err) {
        reject(err);
      }
    });
  };

  const fetchAddress = async (lat, lng) => {
    setIsReverseGeocoding(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          headers: {
            'User-Agent': 'SpotaApp/1.0'
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        setAddress(data.display_name || '');
      }
    } catch (error) {
      console.error('Error reverse geocoding location:', error);
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  useEffect(() => {
    if (location) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAddress(location.lat, location.lng);
    }
  }, [location]);

  // Clean up object URLs to prevent memory leaks when page changes
  useEffect(() => {
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [imageUrl, videoUrl]);

  const compressImage = (file) => {
    return new Promise((resolve) => {
      // Proactively skip compression for small files to speed up processing
      if (file.size < 300 * 1024) {
        resolve(file);
        return;
      }

      // 3-second safety timeout: resolve with original file if canvas load hangs
      const timeoutId = setTimeout(() => {
        console.warn('Image compression timed out, resolving with original file');
        resolve(file);
      }, 3000);

      try {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = objectUrl;
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
              try {
                clearTimeout(timeoutId);
                URL.revokeObjectURL(objectUrl);
                if (!blob) {
                  resolve(file);
                  return;
                }
                let compressedFile;
                const baseName = file.name ? file.name.replace(/\.[^/.]+$/, "") : `image-${Date.now()}`;
                const fileName = baseName + ".jpg";
                try {
                  compressedFile = new File([blob], fileName, { type: 'image/jpeg' });
                } catch (err) {
                  console.warn('File constructor failed, falling back to Blob', err);
                  compressedFile = blob;
                  try {
                    Object.defineProperty(compressedFile, 'name', {
                      value: fileName,
                      writable: true,
                      configurable: true,
                      enumerable: true
                    });
                  } catch {
                    compressedFile.name = fileName;
                  }
                }
                resolve(compressedFile);
              } catch (e) {
                clearTimeout(timeoutId);
                console.error('Error in toBlob callback:', e);
                resolve(file);
              }
            }, 'image/jpeg', 0.6);
          } catch (e) {
            clearTimeout(timeoutId);
            URL.revokeObjectURL(objectUrl);
            console.error('Error setting up canvas:', e);
            resolve(file);
          }
        };
        img.onerror = () => {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(objectUrl);
          resolve(file);
        };
      } catch (e) {
        clearTimeout(timeoutId);
        console.error('Error creating object URL:', e);
        resolve(file);
      }
    });
  };

  const handleImageChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsSubmitting(true);
      setCameraBase64(null); // Reset native camera base64 reference
      try {
        if (imageUrl && imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(imageUrl);
        }
        const compressed = await compressImage(file);
        setImageFile(compressed);
        const previewUrl = URL.createObjectURL(compressed);
        setImageUrl(previewUrl);
      } catch (err) {
        console.error('Failed to compress image file:', err);
        setImageFile(file);
        const previewUrl = URL.createObjectURL(file);
        setImageUrl(previewUrl);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const takeNativePhoto = async (source) => {
    try {
      // Step 1: Request permissions explicitly before attempting capture
      const perms = await CapCamera.requestPermissions({
        permissions: source === CameraSource.Camera
          ? ['camera']
          : ['photos']
      });

      const permKey = source === CameraSource.Camera ? 'camera' : 'photos';
      if (perms[permKey] === 'denied') {
        alert(
          source === CameraSource.Camera
            ? 'Camera permission denied. Please enable it in your device settings.'
            : 'Photo library permission denied. Please enable it in your device settings.'
        );
        return;
      }

      // Step 2: Capture — use Base64 result type (most reliable across Android versions)
      const photo = await CapCamera.getPhoto({
        quality: 60,
        width: 800,
        height: 800,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: source
      });

      if (photo && photo.base64String) {
        setIsSubmitting(true);
        // Clean the base64 string to prevent any unexpected whitespace characters from breaking atob()
        const cleanedBase64 = photo.base64String.replace(/[\s\r\n]+/g, '');
        setCameraBase64(cleanedBase64); // Keep raw base64 string for direct fallback
        if (imageUrl && imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(imageUrl);
        }

        // Step 3: Convert base64 → Blob (avoids unreliable fetch(webPath) on Android)
        const format = photo.format || 'jpeg';
        const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`;
        const byteCharacters = atob(cleanedBase64);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArray[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: mimeType });

        const fileName = `camera-${Date.now()}.${format}`;
        try {
          Object.defineProperty(blob, 'name', {
            value: fileName,
            writable: true,
            configurable: true,
            enumerable: true
          });
        } catch {
          blob.name = fileName;
        }

        // Since the Capacitor Camera plugin already resized the image to 800x800 and 
        // compressed it to 60% quality, we do NOT run compressImage again.
        // This avoids canvas bugs and hangs in mobile webviews.
        setImageFile(blob);
        
        // Show preview instantly using direct base64 data URL
        const dataUrl = `data:${mimeType};base64,${cleanedBase64}`;
        setImageUrl(dataUrl);
      }
    } catch (err) {
      console.error('Failed to take native photo:', err);
      const msg = err?.message || String(err);
      if (!msg.includes('cancelled') && msg !== 'User cancelled photos app') {
        alert(`Camera error: ${msg}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerCameraUpload = () => {
    if (Capacitor.isNativePlatform()) {
      takeNativePhoto(CameraSource.Camera);
    } else {
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      }
    }
  };

  const triggerGalleryUpload = () => {
    if (Capacitor.isNativePlatform()) {
      takeNativePhoto(CameraSource.Photos);
    } else {
      if (galleryInputRef.current) {
        galleryInputRef.current.click();
      }
    }
  };

  const removeImage = () => {
    if (imageUrl && imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageFile(null);
    setImageUrl('');
    setCameraBase64(null); // Reset native camera base64 reference
    setImageColorProfile(null);
    setAiSuggestion('');
  };

  const handleVideoChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 20 * 1024 * 1024) {
        alert('Video file is too large! Please choose a video under 20MB.');
        return;
      }
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
      setVideoFile(file);
      const preview = URL.createObjectURL(file);
      setVideoUrl(preview);
    }
  };

  const triggerVideoUpload = () => {
    if (videoInputRef.current) {
      videoInputRef.current.click();
    }
  };

  const removeVideo = () => {
    if (videoUrl && videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoFile(null);
    setVideoUrl('');
  };

  const handleGetLocation = () => {
    setIsLocating(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setLocation(coords);
          setMapCenter([coords.lat, coords.lng]);
          setIsLocating(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          alert('Could not retrieve location. Please allow location permissions.');
          setIsLocating(false);
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
      );
    } else {
      alert('Geolocation not supported by this browser.');
      setIsLocating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!imageUrl) {
      alert('Please select or capture a photo for your gem! 📸');
      return;
    }
    
    if (!location) {
      alert('Please drop a pin on the map to set your gem\'s location! 📍');
      return;
    }
    
    if (!formData.title || !formData.title.trim()) {
      alert('Please provide a title for your gem! 🏷️');
      return;
    }

    setIsSubmitting(true);
    let finalImageUrl = imageUrl;
    const parsedTags = tagsText
      .split(',')
      .map(tag => tag.replace(/#/g, '').trim().toLowerCase())
      .filter(tag => tag.length > 0);

    try {
      if (imageFile) {
        const fileExt = (imageFile && imageFile.name) ? imageFile.name.split('.').pop() : 'jpg';
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `spot-images/${fileName}`;

        let uploadError = null;
        try {
          const uploadPromise = supabase.storage
            .from('spot-images')
            .upload(filePath, imageFile);

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Storage upload timeout')), 30000)
          );

          const result = await Promise.race([uploadPromise, timeoutPromise]);
          if (result && result.error) {
            uploadError = result.error;
          } else if (!result || !result.data) {
            uploadError = new Error('Empty upload response');
          }
        } catch (storageErr) {
          uploadError = storageErr;
        }

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('spot-images')
            .getPublicUrl(filePath);

          if (publicUrlData?.publicUrl) {
            finalImageUrl = publicUrlData.publicUrl;
          }
        } else {
          console.warn('Storage upload failed or timed out, attempting base64 fallback:', uploadError);
          if (cameraBase64) {
            // Direct native base64 fallback (extremely reliable and bypasses FileReader)
            const format = fileExt || 'jpeg';
            finalImageUrl = `data:image/${format === 'jpg' ? 'jpeg' : format};base64,${cameraBase64}`;
          } else if (imageFile && imageFile.size < 1.5 * 1024 * 1024) {
            // Standard web FileReader fallback
            const base64Promise = fileToBase64(imageFile);
            const base64Timeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Base64 conversion timeout. Please try taking the photo again or use a smaller image.')), 10000)
            );
            finalImageUrl = await Promise.race([base64Promise, base64Timeout]);
          } else {
            alert('Upload failed: Supabase Storage bucket is unconfigured and the image is too large for database storage. Please upload an image under 1.5MB or configure the storage bucket.');
            setIsSubmitting(false);
            return;
          }
        }
      }

      let finalVideoUrl = '';
      if (videoFile) {
        const fileExt = (videoFile && videoFile.name) ? videoFile.name.split('.').pop() : 'mp4';
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `spot-videos/${fileName}`;

        let uploadError = null;
        try {
          const uploadPromise = supabase.storage
            .from('spot-videos')
            .upload(filePath, videoFile);

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Storage video upload timeout')), 60000)
          );

          const result = await Promise.race([uploadPromise, timeoutPromise]);
          if (result && result.error) {
            uploadError = result.error;
          } else if (!result || !result.data) {
            uploadError = new Error('Empty upload response');
          }
        } catch (storageErr) {
          uploadError = storageErr;
        }

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('spot-videos')
            .getPublicUrl(filePath);

          if (publicUrlData?.publicUrl) {
            finalVideoUrl = publicUrlData.publicUrl;
          }
        } else {
          console.warn('Storage video upload failed, falling back to photo:', uploadError);
          finalVideoUrl = '';
        }
      }

      let currentStatus = 'approved';

      const { data: insertedData, error } = await supabase
        .from('spots')
        .insert([
          {
            title: formData.title,
            category: formData.category,
            description: formData.vibe,
            latitude: location.lat,
            longitude: location.lng,
            image_url: finalImageUrl,
            video_url: finalVideoUrl,
            status: currentStatus,
            user_id: user && !user.isGuest ? user.id : null,
            tags: parsedTags,
            address: address
          }
        ])
        .select();

      if (error) throw error;

      if (insertedData && insertedData[0]) {
        // Insert initial vibe ratings
        try {
          await supabase
            .from('vibe_ratings')
            .insert([
              {
                spot_id: insertedData[0].id,
                user_id: user && !user.isGuest ? user.id : null,
                cozy: vibeRatings.cozy,
                insta_worthy: vibeRatings.insta_worthy,
                lively: vibeRatings.lively,
                zen: vibeRatings.zen,
                workspace: vibeRatings.workspace
              }
            ]);
        } catch (ratingErr) {
          console.warn('DB error inserting initial vibe ratings, offline fallback active:', ratingErr);
        }

        const localCreated = JSON.parse(localStorage.getItem('spota_created_spots') || '[]');
        localCreated.push({
          id: insertedData[0].id,
          category: insertedData[0].category,
          latitude: insertedData[0].latitude,
          longitude: insertedData[0].longitude
        });
        localStorage.setItem('spota_created_spots', JSON.stringify(localCreated));
      }

      const newSpot = {
        title: formData.title,
        category: formData.category,
        description: formData.vibe,
        image_url: finalImageUrl
      };
      setSuccessSpot(newSpot);

      // Trigger badge check after a short delay
      setTimeout(() => {
        if (user) {
          checkBadges(user);
        }
      }, 600);
    } catch (err) {
      console.error('Error dropping gem:', err);
      alert(`Error dropping gem: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportShareCard = () => {
    if (!successSpot) return;
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 1200);
    gradient.addColorStop(0, '#2C3531');
    gradient.addColorStop(1, '#111714');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 1200);

    ctx.fillStyle = 'rgba(108, 140, 116, 0.15)'; 
    ctx.beginPath();
    ctx.arc(100, 200, 150, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(224, 122, 95, 0.1)'; 
    ctx.beginPath();
    ctx.arc(700, 900, 200, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = "bold 32px 'Outfit', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('💎 S P O T A', 400, 80);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = "500 16px 'Outfit', sans-serif";
    ctx.fillText('ZEN SOCIAL DISCOVERY', 400, 115);

    const drawDetails = () => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      
      const x = 80, y = 620, w = 640, h = 480, r = 24;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.font = "bold 38px 'Outfit', sans-serif";
      ctx.fillText(successSpot.title || 'New Gem', 120, 685, 560);

      const catInfo = getCategoryById(successSpot.category);
      const catText = `${catInfo.emoji} ${catInfo.label}`.toUpperCase();
      ctx.fillStyle = catInfo.color;
      const pillWidth = ctx.measureText(catText).width + 24;
      ctx.beginPath();
      ctx.roundRect(120, 715, pillWidth, 32, 16);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = "bold 13px 'Outfit', sans-serif";
      ctx.fillText(catText, 132, 736);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = "italic 20px 'Outfit', sans-serif";
      const descText = `"${successSpot.description || 'No description provided.'}"`;
      
      const words = descText.split(' ');
      let line = '';
      let lineY = 790;
      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > 520 && n > 0) {
          ctx.fillText(line, 120, lineY);
          line = words[n] + ' ';
          lineY += 28;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, 120, lineY);

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(590, 715, 80, 80, 8);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.fillRect(600, 725, 20, 20);
      ctx.fillRect(640, 725, 20, 20);
      ctx.fillRect(600, 765, 20, 20);
      ctx.fillRect(625, 745, 10, 10);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = "500 12px 'Outfit', sans-serif";
      ctx.fillText('SCAN TO EXPLORE', 560, 815);

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spota_${successSpot.title.toLowerCase().replace(/\s+/g, '_')}_card.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    };

    if (successSpot.image_url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = successSpot.image_url;
      img.onload = () => {
        ctx.save();
        const rx = 80, ry = 150, rw = 640, rh = 440, rr = 24;
        ctx.beginPath();
        ctx.moveTo(rx + rr, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
        ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
        ctx.arcTo(rx, ry + rh, rx, ry, rr);
        ctx.arcTo(rx, ry, rx + rw, ry, rr);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, rx, ry, rw, rh);
        ctx.restore();
        drawDetails();
      };
      img.onerror = () => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(80, 150, 640, 440);
        drawDetails();
      };
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(80, 150, 640, 440);
      drawDetails();
    }
  };

  const catInfo = getCategoryById(formData.category);
  const tagList = tagsText.split(',').map(t => t.replace(/#/g, '').trim().toLowerCase()).filter(Boolean);

  const renderLiveCardPreview = () => {
    return (
      <div className="live-share-card-container">
        <div className="live-share-card-inner">
          <div className="live-card-badge">💎 S P O T A  ·  PREVIEW</div>
          
          <div className="live-card-image-box">
            {imageUrl ? (
              <img src={imageUrl} alt="Card preview" className="live-card-img" />
            ) : (
              <div className="live-card-placeholder">
                <span>Snaps preview will show here 📸</span>
              </div>
            )}
            <span className="live-card-category-badge" style={{ backgroundColor: catInfo.color }}>
              {catInfo.emoji} {catInfo.label.toUpperCase()}
            </span>
          </div>

          <div className="live-card-info-box">
            <h4 className="live-card-title">{formData.title || 'Secret Spot'}</h4>
            <div className="live-card-coords">
              📍 {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : '0.0000, 0.0000'}
            </div>
            <p className="live-card-description">
              "{formData.vibe || 'Describe the atmosphere to write the vibe check...'}"
            </p>
          </div>

          {/* Vibe Grid in Preview Card */}
          <div className="live-card-vibe-grid">
            {Object.entries(vibeRatings).map(([key, val]) => (
              <div key={key} className="live-card-vibe-row">
                <span className="live-card-vibe-name">{key.replace('_', ' ')}</span>
                <div className="live-card-vibe-dots">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <span
                      key={num}
                      className="live-card-vibe-dot"
                      style={{
                        backgroundColor: num <= val ? catInfo.color : 'rgba(255, 255, 255, 0.12)'
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="live-card-tags-row">
            {tagList.map((tag, idx) => (
              <span key={idx} className="live-card-tag-pill">#{tag}</span>
            ))}
          </div>
          
          <div className="live-card-footer">
            <span>DISCOVER GEMS WITH FRIENDS</span>
            <div className="live-card-qr-mock">
              <div className="qr-dot" />
              <div className="qr-dot" />
              <div className="qr-dot" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="add-gem-outer-wrapper">
      {/* Mobile view tabs */}
      <div className="form-preview-tabs-mobile">
        <button 
          type="button" 
          className={`tab-select-btn ${activeTab === 'form' ? 'active' : ''}`}
          onClick={() => setActiveTab('form')}
        >
          ✍️ Edit Info
        </button>
        <button 
          type="button" 
          className={`tab-select-btn ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          ✨ Share Preview
        </button>
      </div>

      <div className={`add-gem-split-layout active-tab-${activeTab}`}>
        {/* Panel 1: Input Form */}
        <div className="add-gem-form-panel glass-panel">
          <div className="add-gem-header">
            <h2>Drop a Gem 💎</h2>
            <p>Tell the community where the vibe is at.</p>
          </div>

          {pioneerAlert && (
            <div className="milestone-alert-banner pioneer animate-fade-in">
              <Sparkles size={16} />
              <span><strong>Pioneer Spot!</strong> Dropping a gem in this cache zone will trigger double Reputation Points!</span>
            </div>
          )}
          {badgeMilestone && (
            <div className="milestone-alert-banner milestone animate-fade-in">
              <Award size={16} />
              <span>{badgeMilestone.text}</span>
            </div>
          )}

          <form className="add-gem-form" onSubmit={handleSubmit}>
            {/* Image Upload Section */}
            <div className="form-group">
              <label>Snaps or it didn't happen 📸</label>
              {!imageUrl ? (
                <div className="photo-source-selector">
                  <button type="button" className="photo-source-card" onClick={triggerCameraUpload}>
                    <div className="icon-container">
                      <Camera size={22} />
                    </div>
                    <span>Take Photo</span>
                  </button>
                  <button type="button" className="photo-source-card" onClick={triggerGalleryUpload}>
                    <div className="icon-container">
                      <UploadCloud size={22} />
                    </div>
                    <span>Local Storage</span>
                  </button>
                  {/* Hidden file inputs for Web/Mobile Web */}
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    ref={cameraInputRef} 
                    onChange={handleImageChange} 
                    style={{ display: 'none' }} 
                  />
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={galleryInputRef} 
                    onChange={handleImageChange} 
                    style={{ display: 'none' }} 
                  />
                </div>
              ) : (
                <div className="image-preview-wrapper">
                  <img src={imageUrl} alt="Preview" className="image-preview" />
                  <div className="preview-badge">Selected Photo</div>
                  <button type="button" className="remove-image-btn" onClick={removeImage} aria-label="Remove image">
                    <X size={18} />
                  </button>
                </div>
              )}
            </div>

            {/* Video Vibe Upload Section */}
            <div className="form-group">
              <label>Upload a Video Vibe 🎥 (Optional 15s Clip)</label>
              {!videoUrl ? (
                <div className="photo-source-selector video-source-selector">
                  <button type="button" className="photo-source-card" onClick={triggerVideoUpload}>
                    <div className="icon-container">
                      <Video size={22} />
                    </div>
                    <span>Record / Upload Video</span>
                  </button>
                  <input 
                    type="file" 
                    accept="video/*" 
                    ref={videoInputRef} 
                    onChange={handleVideoChange} 
                    style={{ display: 'none' }} 
                  />
                </div>
              ) : (
                <div className="image-preview-wrapper video-preview-wrapper">
                  <video src={videoUrl} controls className="image-preview" />
                  <div className="preview-badge">Vibe Clip</div>
                  <button type="button" className="remove-image-btn" onClick={removeVideo} aria-label="Remove video">
                    <X size={18} />
                  </button>
                </div>
              )}
            </div>

            {/* Location Section */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Pin the Coordinates 📍</label>
                <button 
                  type="button" 
                  className={`get-location-btn ${isLocating ? 'locating' : ''}`}
                  onClick={handleGetLocation}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-accent)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <MapPin size={14} />
                  {isLocating ? 'Pinpointing...' : 'Use My Current Location'}
                </button>
              </div>

              {/* Location Search Bar with Autocomplete Dropdown */}
              <div className="location-search-container" ref={searchContainerRef}>
                <div className="search-input-wrapper">
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search locations or addresses..."
                    className="zen-input search-input"
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      isTypingRef.current = true;
                      setSearchQuery(val);
                      if (val.trim().length < 3) {
                        setSearchResults([]);
                        setSearchError('');
                      } else {
                        setShowDropdown(true);
                      }
                    }}
                    onFocus={() => setShowDropdown(true)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="clear-search-btn"
                      onClick={() => {
                        isTypingRef.current = false;
                        setSearchQuery('');
                        setSearchResults([]);
                        setSearchError('');
                        setShowDropdown(false);
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {showDropdown && (searchResults.length > 0 || isSearching || searchError) && (
                  <div className="search-results-dropdown glass-panel">
                    {isSearching ? (
                      <div className="search-loading">Searching places... 🗺️</div>
                    ) : searchError ? (
                      <div className="search-loading" style={{ color: 'var(--color-accent-hover, #e07a5f)', padding: '12px 16px', fontSize: '13px' }}>{searchError}</div>
                    ) : (
                      searchResults.map((item, index) => {
                        const parts = item.display_name.split(',');
                        const mainText = parts[0];
                        const secondaryText = parts.slice(1).join(',').trim();
                        return (
                          <div
                            key={item.place_id || index}
                            className="search-result-item"
                            onClick={() => handleSelectResult(item)}
                          >
                            <MapPin size={14} className="result-icon" />
                            <div className="result-details">
                              <span className="result-title">{mainText}</span>
                              {secondaryText && <span className="result-address">{secondaryText}</span>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="add-gem-map-wrapper" style={{ height: '220px', width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)', position: 'relative', zIndex: 1 }}>
                <MapContainer 
                  center={location ? [location.lat, location.lng] : mapCenter} 
                  zoom={14} 
                  scrollWheelZoom={true}
                  style={{ height: '100%', width: '100%' }}
                >
                  <MapCenter position={location ? [location.lat, location.lng] : mapCenter} />
                  <TileLayer
                    attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  />
                  <LocationMarker position={location} setPosition={setLocation} />
                </MapContainer>
              </div>
              
              {location && (
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: '4px', display: 'block' }}>
                  📍 Pin dropped at {location.lat.toFixed(5)}, {location.lng.toFixed(5)}. Click map or drag pin to adjust.
                </span>
              )}
            </div>

            {/* Address */}
            <div className="form-group">
              <label>Address</label>
              <textarea 
                placeholder={isReverseGeocoding ? "Fetching address..." : "Address will load automatically when location is chosen"} 
                className="zen-textarea"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={isReverseGeocoding}
              />
            </div>

            {/* Title */}
            <div className="form-group">
              <label>Give it a Name 🏷️</label>
              <input 
                type="text" 
                placeholder="e.g. Secret Matcha Sanctuary" 
                className="zen-input"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            {/* Category */}
            <div className="form-group">
              <label>What's the Vibe Category? 💫</label>
              <div className="category-chips">
                {categories.map((cat) => {
                  const isActive = formData.category === cat.id;
                  return (
                    <button 
                      type="button" 
                      key={cat.id}
                      className={`cat-chip ${isActive ? 'active' : ''}`}
                      onClick={() => handleCategoryChange(cat.id)}
                      style={{
                        borderColor: isActive ? cat.color : 'var(--color-border)',
                        backgroundColor: isActive ? `${cat.color}26` : 'var(--color-bg-secondary)',
                        color: isActive ? cat.color : 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: isActive ? 600 : 500
                      }}
                    >
                      <span>{cat.emoji}</span>
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vibe Ratings Sliders */}
            <div className="form-group">
              <label>Rate the Atmosphere 📊</label>
              
              {/* Quick Vibe Presets */}
              <div className="vibe-presets-container">
                <div className="vibe-presets-list">
                  {Object.entries(VIBE_PRESETS).map(([key, preset]) => {
                    const active = isPresetActive(preset.ratings);
                    return (
                      <button
                        type="button"
                        key={key}
                        className={`preset-chip ${active ? 'active' : ''}`}
                        onClick={() => handleApplyVibePreset(preset.ratings)}
                      >
                        <span className="preset-emoji">{preset.emoji}</span>
                        <span className="preset-name">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="vibe-sliders-grid">
                {Object.keys(vibeRatings).map((key) => (
                  <div key={key} className="vibe-slider-row">
                    <div className="vibe-slider-header">
                      <span className="vibe-slider-name">
                        {key.replace('_', ' ')}
                      </span>
                      <span className="vibe-slider-label">
                        {vibeLabels[key][vibeRatings[key] - 1]}
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="5" 
                      value={vibeRatings[key]} 
                      onChange={(e) => setVibeRatings({ ...vibeRatings, [key]: parseInt(e.target.value) })}
                      className="vibe-slider-input"
                      style={{ '--accent-color': catInfo.color }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Vibe description */}
            <div className="form-group">
              <label>Write the Vibe Check ✍️</label>
              
              {isAiAnalyzing && (
                <div className="ai-suggestion-bubble analyzing animate-fade-in">
                  <Sparkles size={14} className="spin-icon" />
                  <span>Vibe checking photo elements... 🤖✨</span>
                </div>
              )}
              
              {!isAiAnalyzing && aiSuggestion && (
                <div 
                  className="ai-suggestion-bubble animate-fade-in" 
                  onClick={() => {
                    setFormData(prev => ({ ...prev, vibe: aiSuggestion }));
                    setAiSuggestion(''); // Clear suggestion once applied
                  }}
                  title="Click to apply this vibe check review suggestion"
                >
                  <Bot size={14} className="pulse-icon" />
                  <span><strong>AI Vibe Suggestion:</strong> "{aiSuggestion}" <span className="apply-link">(Tap to apply)</span></span>
                </div>
              )}

              <textarea 
                placeholder="What makes this place magical? Write a short, aesthetic review..." 
                className="zen-textarea"
                rows={3}
                value={formData.vibe}
                onChange={(e) => setFormData({ ...formData, vibe: e.target.value })}
              />
            </div>

            {/* Vibe Tags */}
            <div className="form-group">
              <label>Aesthetic Tags 🏷️ (comma-separated)</label>
              <input 
                type="text" 
                placeholder="e.g. cozy, neon, matcha, sunset" 
                className="zen-input"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
              />
              
              {/* Tap-to-add tag suggestions */}
              <div className="suggested-tags-wrapper">
                <span className="suggested-tags-label">Tap to add:</span>
                <div className="suggested-tags-list">
                  {(RECOMMENDED_TAGS_MAP[formData.category] || RECOMMENDED_TAGS_MAP.default).map((tag) => {
                    const active = isTagActive(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        className={`suggested-tag-chip ${active ? 'active' : ''}`}
                        onClick={() => handleToggleTag(tag)}
                        style={{
                          '--tag-color': catInfo.color
                        }}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {tagsText.trim() && (
                <div className="tag-preview-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {tagsText.split(',').map((t, idx) => {
                    const cleaned = t.replace(/#/g, '').trim();
                    return cleaned ? (
                      <span key={idx} className="tag-pill" style={{ backgroundColor: 'rgba(108,140,116,0.1)', color: 'var(--color-accent)', padding: '4px 10px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 600 }}>
                        #{cleaned}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            <button type="submit" className="submit-gem-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Dropping...' : (
                <>
                  <UploadCloud size={20} />
                  Drop the Gem 💎
                </>
              )}
            </button>
            <div className="mobile-scroll-spacer" />
          </form>
        </div>

        {/* Panel 2: Live Preview Card (visible side-by-side on desktop) */}
        <div className="add-gem-preview-panel glass-panel">
          <div className="add-gem-header">
            <h2>Share Card Preview ✨</h2>
            <p>This is what your friends will see on Instagram Stories.</p>
          </div>
          {renderLiveCardPreview()}
          <button 
            type="button" 
            className="submit-gem-btn preview-submit-btn" 
            onClick={handleSubmit} 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Dropping...' : (
              <>
                <UploadCloud size={20} />
                Drop the Gem 💎
              </>
            )}
          </button>
          <div className="mobile-scroll-spacer" />
        </div>
      </div>

      {successSpot && (
        <div className="success-modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="success-modal glass-panel animate-fade-in" style={{ padding: '24px', borderRadius: 'var(--radius-md)', maxWidth: '400px', width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>💎 Gem Dropped Successfully!</h3>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Your spot is live. Download your personalized share card to post on Instagram and WhatsApp stories.
            </p>
            <div className="success-modal-actions" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              <button className="submit-trip-btn" onClick={handleExportShareCard} style={{ margin: 0, backgroundColor: 'var(--color-accent)' }}>
                Download Share Card
              </button>
              <button className="submit-trip-btn" onClick={() => navigate('/vibes')} style={{ margin: 0, backgroundColor: 'rgba(44, 53, 49, 0.08)', color: 'var(--color-text-primary)' }}>
                Go to Vibes Feed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
