import { useState } from 'react';
import { Camera, MapPin, UploadCloud, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import './AddGemView.css';

export default function AddGemView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(''); // Holds base64 or public URL
  const [location, setLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    category: 'cafe',
    vibe: ''
  });

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      
      // Load image locally as preview & base64 fallback immediately
      try {
        const base64 = await fileToBase64(file);
        setImageUrl(base64);
      } catch (err) {
        console.error('Failed to read image file:', err);
      }
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImageUrl('');
  };

  const handleGetLocation = () => {
    setIsLocating(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setIsLocating(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          alert('Could not retrieve location. Please allow location permissions.');
          setIsLocating(false);
        }
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

    try {
      // Attempt to upload image to Supabase Storage
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `spot-images/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('spot-images')
          .upload(filePath, imageFile);

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('spot-images')
            .getPublicUrl(filePath);
          
          if (publicUrlData?.publicUrl) {
            finalImageUrl = publicUrlData.publicUrl;
          }
        } else {
          console.warn('Storage upload failed, falling back to base64 URL:', uploadError);
        }
      }

      // Determine status (always approved by default so it goes live instantly for everyone nearby)
      let currentStatus = 'approved';

      // Insert spot record into database
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
            status: currentStatus,
            user_id: user && !user.isGuest ? user.id : null
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
            <label className="image-upload-area">
              <input type="file" accept="image/*" onChange={handleImageChange} hidden />
              <Camera size={32} color="var(--color-text-secondary)" />
              <span>Tap to upload a photo</span>
            </label>
          ) : (
            <div className="image-preview-wrapper">
              <img src={imageUrl} alt="Preview" className="image-preview" />
              <button type="button" className="remove-image-btn glass-panel" onClick={removeImage}>
                <X size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Location Section */}
        <div className="form-group">
          <label>Location</label>
          <div className={`location-picker ${location ? 'has-location' : ''}`} onClick={!location ? handleGetLocation : undefined}>
            <MapPin size={24} color={location ? 'var(--color-accent)' : 'var(--color-text-secondary)'} />
            <div className="location-info">
              {isLocating ? (
                <span>Finding your vibe...</span>
              ) : location ? (
                <span>Location captured! ({location.lat.toFixed(4)}, {location.lng.toFixed(4)})</span>
              ) : (
                <span>Use my current location</span>
              )}
            </div>
          </div>
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

        {/* Vibe */}
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
