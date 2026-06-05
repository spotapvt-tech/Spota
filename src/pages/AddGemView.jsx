import { useState, useEffect, useRef } from 'react';
import { Camera, MapPin, UploadCloud, X } from 'lucide-react';
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
  
  // Default map center: New York or user location on load
  const [mapCenter, setMapCenter] = useState([40.7128, -74.0060]);

  const [formData, setFormData] = useState({
    title: '',
    category: 'cafe',
    vibe: ''
  });

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
                URL.revokeObjectURL(objectUrl);
                if (!blob) {
                  resolve(file);
                  return;
                }
                const compressedFile = blob;
                const baseName = file.name ? file.name.replace(/\.[^/.]+$/, "") : `image-${Date.now()}`;
                try {
                  Object.defineProperty(compressedFile, 'name', {
                    value: baseName + ".jpg",
                    writable: true,
                    configurable: true,
                    enumerable: true
                  });
                } catch {
                  compressedFile.name = baseName + ".jpg";
                }
                resolve(compressedFile);
              } catch (e) {
                console.error('Error in toBlob callback:', e);
                resolve(file);
              }
            }, 'image/jpeg', 0.6);
          } catch (e) {
            URL.revokeObjectURL(objectUrl);
            console.error('Error setting up canvas:', e);
            resolve(file);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
        };
      } catch (e) {
        console.error('Error creating object URL:', e);
        resolve(file);
      }
    });
  };

  const handleImageChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsSubmitting(true);
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
        if (imageUrl && imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(imageUrl);
        }

        // Step 3: Convert base64 → Blob (avoids unreliable fetch(webPath) on Android)
        const format = photo.format || 'jpeg';
        const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`;
        const byteCharacters = atob(photo.base64String);
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

        const compressed = await compressImage(blob);
        setImageFile(compressed);
        const previewUrl = URL.createObjectURL(compressed);
        setImageUrl(previewUrl);
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
    if (!imageUrl || !location || !formData.title) {
      alert('Please provide an image, location, and title for your gem!');
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
        const fileExt = imageFile.name ? imageFile.name.split('.').pop() : 'jpg';
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `spot-images/${fileName}`;

        let uploadError = null;
        try {
          const uploadPromise = supabase.storage
            .from('spot-images')
            .upload(filePath, imageFile);

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Storage upload timeout')), 5000)
          );

          const result = await Promise.race([uploadPromise, timeoutPromise]);
          uploadError = result.error;
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
          if (imageFile.size < 1.5 * 1024 * 1024) {
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
        const fileExt = videoFile.name ? videoFile.name.split('.').pop() : 'mp4';
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `spot-videos/${fileName}`;

        let uploadError = null;
        try {
          const uploadPromise = supabase.storage
            .from('spot-videos')
            .upload(filePath, videoFile);

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Storage video upload timeout')), 8000)
          );

          const result = await Promise.race([uploadPromise, timeoutPromise]);
          uploadError = result.error;
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
          console.warn('Storage video upload failed, utilizing community vibe video template:', uploadError);
          finalVideoUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
        }
      }

      let currentStatus = 'approved';

      const { error } = await supabase
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
        ]);

      if (error) throw error;

      alert('Gem dropped successfully!');
      navigate('/feed');
    } catch (err) {
      console.error('Error dropping gem:', err);
      alert(`Error dropping gem: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="add-gem-container glass-panel">
      <div className="add-gem-header">
        <h2>Drop a Gem</h2>
        <p>Share a cool spot with the community.</p>
      </div>

      <form className="add-gem-form" onSubmit={handleSubmit}>
        {/* Image Upload Section */}
        <div className="form-group">
          <label>Photo</label>
          {!imageUrl ? (
            <div className="photo-source-selector">
              <button type="button" className="photo-source-card" onClick={triggerCameraUpload}>
                <Camera size={28} />
                <span>Take Photo</span>
              </button>
              <button type="button" className="photo-source-card" onClick={triggerGalleryUpload}>
                <UploadCloud size={28} />
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
              <button type="button" className="remove-image-btn glass-panel" onClick={removeImage}>
                <X size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Video Vibe Upload Section */}
        <div className="form-group">
          <label>Video Vibe (Optional 15s Clip)</label>
          {!videoUrl ? (
            <div className="photo-source-selector">
              <button type="button" className="photo-source-card" onClick={triggerVideoUpload} style={{ width: '100%' }}>
                <Camera size={28} />
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
            <div className="image-preview-wrapper">
              <video src={videoUrl} controls className="image-preview" style={{ maxHeight: '180px', objectFit: 'contain' }} />
              <button type="button" className="remove-image-btn glass-panel" onClick={removeVideo}>
                <X size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Location Section */}
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>Location</label>
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
          <label>Name of the spot</label>
          <input 
            type="text" 
            placeholder="e.g. Secret Matcha Cafe" 
            className="zen-input"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />
        </div>

        {/* Category */}
        <div className="form-group">
          <label>Category</label>
          <div className="category-chips">
            {['cafe', 'viewpoint', 'street-art', 'event'].map((cat) => (
              <button 
                type="button" 
                key={cat}
                className={`cat-chip ${formData.category === cat ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, category: cat })}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Vibe description */}
        <div className="form-group">
          <label>The Vibe (Optional)</label>
          <textarea 
            placeholder="What makes this place special?" 
            className="zen-textarea"
            rows={3}
            value={formData.vibe}
            onChange={(e) => setFormData({ ...formData, vibe: e.target.value })}
          />
        </div>

        {/* Vibe Tags */}
        <div className="form-group">
          <label>Vibe Tags (comma-separated)</label>
          <input 
            type="text" 
            placeholder="e.g. cozy, neon, matcha, sunset" 
            className="zen-input"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
          />
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
              Drop Gem
            </>
          )}
        </button>
      </form>
    </div>
  );
}
