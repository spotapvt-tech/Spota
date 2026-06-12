import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  Users, 
  Shield, 
  CheckCircle, 
  CreditCard, 
  Sparkles, 
  AlertCircle, 
  Compass,
  ArrowRight,
  TrendingUp,
  Clock
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './TripPackagePreviewView.css';

// Fix for default Leaflet markers
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom numbering marker icons for day itinerary route
const createNumMarker = (num) => {
  return L.divIcon({
    className: 'custom-number-marker',
    html: `<div class="marker-badge">${num}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30]
  });
};

function MapCenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom());
    }
  }, [position, map]);
  return null;
}

export default function TripPackagePreviewView() {
  const { packageId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [packageData, setPackageData] = useState(null);
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('itinerary'); // 'itinerary' | 'details'
  
  // Booking Form States
  const [travelersCount, setTravelersCount] = useState(1);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState('form'); // 'form' | 'processing' | 'success'
  const [paymentForm, setPaymentForm] = useState({
    cardName: '',
    cardNumber: '',
    expiry: '',
    cvv: '',
    billingAddress: ''
  });
  const [paymentError, setPaymentError] = useState('');
  
  const [mapCenter, setMapCenter] = useState([32.0112, 77.3188]); // Default Kasol center
  const [clonedTripId, setClonedTripId] = useState(null);

  // Seeding mock data self-healer
  const seedMockDataIfNeeded = useCallback(() => {
    const agencyId = 'agency-himalayan-escapes';
    const mockPackageId = 'package-kasol-wilderness';
    
    // 1. Seed agency profile
    const agencyKey = `spota_agency_${agencyId}`;
    if (!localStorage.getItem(agencyKey)) {
      localStorage.setItem(agencyKey, JSON.stringify({
        id: agencyId,
        company_name: 'Himalayan Escapes Ltd.',
        logo_url: 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=100&h=100&fit=crop'
      }));
    }
    
    // 2. Seed agency trips
    const tripsKey = `spota_agency_trips_${agencyId}`;
    const existingTrips = JSON.parse(localStorage.getItem(tripsKey) || '[]');
    if (!existingTrips.some(t => t.id === mockPackageId)) {
      const mockTrip = {
        id: mockPackageId,
        name: 'Kasol Wilderness Exploration',
        destination: 'Kasol, Parvati Valley',
        package_price: 199.00,
        package_description: 'Embark on a breathtaking 3-day trek through the mystical Parvati Valley. Discover hidden hot springs in Kheerganga, explore the ancient village of Malana, and experience the vibrant local culture in Kasol. Curated by our certified mountain guides for an unforgettable alpine escape.',
        is_public_package: true,
        agency_id: agencyId,
        creator_id: 'agency-owner-id',
        slots_total: 20,
        slots_booked: 3,
        start_date: '2026-06-15',
        end_date: '2026-06-18'
      };
      localStorage.setItem(tripsKey, JSON.stringify([mockTrip, ...existingTrips]));
    }
    
    // 3. Seed trip spots
    const spotsKey = `spota_trip_spots_${mockPackageId}`;
    if (!localStorage.getItem(spotsKey)) {
      const mockSpots = [
        {
          id: 'spot-chalal',
          spot_id: 'spot-chalal',
          title: 'Chalal Nature Trail',
          description: 'A scenic walk along the roaring Parvati River, shaded by towering pine trees.',
          latitude: 32.0112,
          longitude: 77.3188,
          category: 'trail',
          image_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=400&fit=crop',
          itinerary_day: 1,
          schedule_time: '09:30 AM',
          booking_cta_label: 'Book River Guide',
          booking_cta_url: 'https://spota.co/bookings/chalal'
        },
        {
          id: 'spot-kheerganga',
          spot_id: 'spot-kheerganga',
          title: 'Kheerganga Hot Springs',
          description: 'Natural hot water springs situated at the top of a 12km trek, surrounded by snow-capped mountains.',
          latitude: 31.9904,
          longitude: 77.3912,
          category: 'viewpoint',
          image_url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=400&fit=crop',
          itinerary_day: 2,
          schedule_time: '11:00 AM',
          booking_cta_label: 'Book Pool Access',
          booking_cta_url: 'https://spota.co/bookings/kheerganga'
        },
        {
          id: 'spot-tosh',
          spot_id: 'spot-tosh',
          title: 'Tosh Alpine Village',
          description: 'A quiet hamlet perched on a hillside at the far end of Parvati Valley, famous for apple orchards and panoramic vistas.',
          latitude: 32.0150,
          longitude: 77.3488,
          category: 'campsite',
          image_url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&h=400&fit=crop',
          itinerary_day: 3,
          schedule_time: '02:00 PM',
          booking_cta_label: 'Book Homestay',
          booking_cta_url: 'https://spota.co/bookings/tosh'
        }
      ];
      localStorage.setItem(spotsKey, JSON.stringify(mockSpots));
    }
  }, []);

  // Fetch package details and its spots
  const loadPackageDetails = useCallback(async () => {
    setLoading(true);
    // Always seed mock details first to ensure mock fallback matches
    seedMockDataIfNeeded();
    
    try {
      // 1. Fetch trip package
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('*')
        .eq('id', packageId)
        .single();
      
      if (tripError) throw tripError;

      // Fetch agency details
      let agencyProfile = null;
      if (tripData.agency_id) {
        try {
          const { data: agencyData } = await supabase
            .from('agency_profiles')
            .select('*')
            .eq('id', tripData.agency_id)
            .single();
          if (agencyData) agencyProfile = agencyData;
        } catch (err) {}

        if (!agencyProfile) {
          const localKeys = Object.keys(localStorage);
          for (const key of localKeys) {
            if (key.startsWith('spota_agency_')) {
              const val = JSON.parse(localStorage.getItem(key));
              if (val && val.id === tripData.agency_id) {
                agencyProfile = val;
                break;
              }
            }
          }
        }
      }

      // Fetch spots
      let fetchedSpots = [];
      try {
        const { data: spotsData, error: spotsError } = await supabase
          .from('trip_spots')
          .select(`
            trip_id,
            spot_id,
            added_by,
            visited,
            added_at,
            itinerary_day,
            schedule_time,
            booking_cta_label,
            booking_cta_url,
            spots:spot_id (
              id,
              title,
              description,
              latitude,
              longitude,
              image_url,
              category
            )
          `)
          .eq('trip_id', packageId);
        
        if (!spotsError && spotsData) {
          fetchedSpots = spotsData.filter(s => s.spots !== null);
        }
      } catch (err) {}

      setPackageData({
        ...tripData,
        agency_profiles: agencyProfile
      });
      setSpots(fetchedSpots);

      if (fetchedSpots.length > 0) {
        const firstSpot = fetchedSpots[0].spots;
        setMapCenter([parseFloat(firstSpot.latitude), parseFloat(firstSpot.longitude)]);
      }

    } catch (err) {
      console.warn('DB package preview load failed, falling back to LocalStorage sandbox cache');
      
      // Sandbox cache fallback
      let localTrip = null;
      let localSpots = [];
      
      // Search all agency profiles
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('spota_agency_trips_')) {
          const trips = JSON.parse(localStorage.getItem(key) || '[]');
          const match = trips.find(t => t.id === packageId);
          if (match) {
            localTrip = match;
            break;
          }
        }
      }

      if (localTrip) {
        // Hydrate agency details
        let agencyProfile = null;
        if (localTrip.agency_id) {
          const agencyStr = localStorage.getItem(`spota_agency_${localTrip.agency_id}`) || localStorage.getItem(`spota_agency_${localTrip.creator_id}`);
          if (agencyStr) {
            agencyProfile = JSON.parse(agencyStr);
          }
        }
        
        // Hydrate spots
        const spotsStr = localStorage.getItem(`spota_trip_spots_${packageId}`);
        if (spotsStr) {
          const parsedSpots = JSON.parse(spotsStr);
          localSpots = parsedSpots.map(s => ({
            trip_id: packageId,
            spot_id: s.id || s.spot_id,
            itinerary_day: s.itinerary_day || 1,
            schedule_time: s.schedule_time || '',
            booking_cta_label: s.booking_cta_label || 'Book Spot',
            booking_cta_url: s.booking_cta_url || '',
            spots: {
              id: s.id || s.spot_id,
              title: s.title || s.spots?.title || 'Adventure Spot',
              description: s.description || s.spots?.description || '',
              latitude: parseFloat(s.latitude || s.spots?.latitude || 32.0112),
              longitude: parseFloat(s.longitude || s.spots?.longitude || 77.3188),
              image_url: s.image_url || s.spots?.image_url || '',
              category: s.category || s.spots?.category || 'trail'
            }
          }));
        }

        setPackageData({
          ...localTrip,
          agency_profiles: agencyProfile
        });
        setSpots(localSpots);

        if (localSpots.length > 0) {
          const firstSpot = localSpots[0].spots;
          setMapCenter([firstSpot.latitude, firstSpot.longitude]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [packageId, seedMockDataIfNeeded]);

  useEffect(() => {
    loadPackageDetails();
  }, [loadPackageDetails]);

  // Handle travelers increment/decrement
  const changeTravelers = (val) => {
    const nextVal = travelersCount + val;
    const maxSlots = (packageData?.slots_total - packageData?.slots_booked) || 15;
    if (nextVal >= 1 && nextVal <= maxSlots) {
      setTravelersCount(nextVal);
    }
  };

  // Live total pricing calculation
  const getSubtotal = () => {
    const price = parseFloat(packageData?.package_price) || 0.00;
    return price * travelersCount;
  };

  // Card input change formatter
  const handlePaymentInputChange = (e) => {
    const { name, value } = e.target;
    let formattedVal = value;
    if (name === 'cardNumber') {
      formattedVal = value.replace(/\D/g, '').substring(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
    } else if (name === 'expiry') {
      formattedVal = value.replace(/\D/g, '').substring(0, 4);
      if (formattedVal.length > 2) {
        formattedVal = `${formattedVal.substring(0, 2)}/${formattedVal.substring(2)}`;
      }
    } else if (name === 'cvv') {
      formattedVal = value.replace(/\D/g, '').substring(0, 3);
    }
    setPaymentForm(prev => ({ ...prev, [name]: formattedVal }));
  };

  // Execute checkout simulator & clone itinerary board
  const executeBookingCheckout = async (e) => {
    e.preventDefault();
    if (!paymentForm.cardName.trim() || !paymentForm.cardNumber || !paymentForm.expiry || !paymentForm.cvv) {
      setPaymentError('Please fill in all credit card payment details.');
      return;
    }
    setPaymentError('');
    setCheckoutStep('processing');

    const totalPaid = getSubtotal();
    const agencyId = packageData?.agency_id || 'agency-himalayan-escapes';
    const newTripId = 'cloned_' + Math.random().toString(36).substring(2, 15);
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    try {
      // 1. Simulate server verification delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. Write booking to Supabase
      let bookingWritten = false;
      try {
        const { error: bookingError } = await supabase
          .from('package_bookings')
          .insert({
            trip_id: packageData.id,
            user_id: user.id,
            amount_paid: totalPaid,
            travelers_count: travelersCount,
            status: 'paid'
          });
        if (!bookingError) bookingWritten = true;
      } catch (dbErr) {
        console.warn('DB booking insert skipped or failed, relying on local sync fallback');
      }

      // 3. Sync to LocalStorage bookings ledger for agency views
      const localBookingsKey = `spota_agency_bookings_${agencyId}`;
      const existingBookings = JSON.parse(localStorage.getItem(localBookingsKey) || '[]');
      const localBookingRecord = {
        id: 'b_' + Math.random().toString(36).substring(2, 9),
        booking_date: new Date().toISOString(),
        travelers_count: travelersCount,
        amount_paid: totalPaid,
        status: 'paid',
        buyer_name: user?.username || user?.email || 'Spota Explorer',
        package_name: packageData.name
      };
      localStorage.setItem(localBookingsKey, JSON.stringify([localBookingRecord, ...existingBookings]));

      // 4. Create active copy of collaborative trip board in database
      let liveClonedTrip = null;
      try {
        const { data: newTrip, error: tripError } = await supabase
          .from('trips')
          .insert({
            name: `${packageData.name} - My Tour`,
            destination: packageData.destination || null,
            start_date: packageData.start_date || null,
            end_date: packageData.end_date || null,
            invite_code: inviteCode,
            creator_id: user.id,
            agency_id: agencyId,
            is_cobranded: true,
            is_public_package: false
          })
          .select()
          .single();

        if (!tripError && newTrip) {
          liveClonedTrip = newTrip;
          
          // Join traveller as creator
          await supabase
            .from('trip_members')
            .insert({
              trip_id: newTrip.id,
              user_id: user.id,
              role: 'creator'
            });

          // Insert spots
          if (spots.length > 0) {
            const spotsToInsert = spots.map(s => ({
              trip_id: newTrip.id,
              spot_id: s.spot_id,
              added_by: user.id,
              visited: false,
              itinerary_day: s.itinerary_day,
              schedule_time: s.schedule_time,
              booking_cta_label: s.booking_cta_label,
              booking_cta_url: s.booking_cta_url
            }));
            await supabase.from('trip_spots').insert(spotsToInsert);
          }
        }
      } catch (cloneDbErr) {
        console.warn('DB cloning failed, writing mock cloned board to LocalStorage caches:', cloneDbErr);
      }

      // 5. Local Storage sync fallback for active board
      const localClonedTrip = {
        id: liveClonedTrip?.id || newTripId,
        name: `${packageData.name} - My Tour`,
        destination: packageData.destination,
        start_date: packageData.start_date,
        end_date: packageData.end_date,
        invite_code: inviteCode,
        creator_id: user.id,
        agency_id: agencyId,
        is_cobranded: true
      };

      // Set spots cache
      const localClonedSpotsKey = `spota_trip_spots_${localClonedTrip.id}`;
      const clonedSpotsData = spots.map(s => ({
        id: s.spot_id,
        spot_id: s.spot_id,
        title: s.spots?.title,
        description: s.spots?.description,
        latitude: s.spots?.latitude,
        longitude: s.spots?.longitude,
        category: s.spots?.category,
        image_url: s.spots?.image_url,
        itinerary_day: s.itinerary_day,
        schedule_time: s.schedule_time,
        booking_cta_label: s.booking_cta_label,
        booking_cta_url: s.booking_cta_url,
        visited: false
      }));
      localStorage.setItem(localClonedSpotsKey, JSON.stringify(clonedSpotsData));

      // Save cloned trip details & membership locally
      localStorage.setItem(`spota_trip_${localClonedTrip.id}`, JSON.stringify(localClonedTrip));
      localStorage.setItem(`spota_trip_members_${localClonedTrip.id}`, JSON.stringify([
        { user_id: user.id, role: 'creator', profiles: { username: user.username || user.email || 'Explorer' } }
      ]));

      // Update agency package slot usage counter
      let keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('spota_agency_trips_')) {
          const agencyTripsList = JSON.parse(localStorage.getItem(key) || '[]');
          const updatedList = agencyTripsList.map(t => {
            if (t.id === packageData.id) {
              return { ...t, slots_booked: (t.slots_booked || 0) + travelersCount };
            }
            return t;
          });
          localStorage.setItem(key, JSON.stringify(updatedList));
        }
      }

      setClonedTripId(localClonedTrip.id);
      setCheckoutStep('success');

    } catch (err) {
      console.error('Checkout processing error:', err);
      setPaymentError('An error occurred during booking. Please try again.');
      setCheckoutStep('form');
    }
  };

  const getSpotCategoryColor = (category) => {
    switch (category) {
      case 'trail': return '#2ecc71';
      case 'viewpoint': return '#e67e22';
      case 'cafe': return '#e74c3c';
      case 'campsite': return '#9b59b6';
      default: return '#3498db';
    }
  };

  const groupSpotsByDay = () => {
    const grouped = {};
    spots.forEach(s => {
      const day = s.itinerary_day || 1;
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(s);
    });
    return grouped;
  };

  if (loading) {
    return (
      <div className="preview-view-loading">
        <Compass size={40} className="loading-spinner" />
        <p>Loading package details & route preview...</p>
      </div>
    );
  }

  if (!packageData) {
    return (
      <div className="preview-view-error">
        <AlertCircle size={48} className="error-icon" />
        <h3>Package Not Found</h3>
        <p>The travel package itinerary details could not be retrieved from the database.</p>
        <button onClick={() => navigate('/trips')} className="back-btn-action">
          <ArrowLeft size={16} /> Return to Directory
        </button>
      </div>
    );
  }

  const groupedSpots = groupSpotsByDay();
  const sortedDays = Object.keys(groupedSpots).sort((a, b) => parseInt(a) - parseInt(b));
  
  // Sort polyline sequential path
  const sortedPathCoords = [...spots]
    .sort((a, b) => {
      if (a.itinerary_day !== b.itinerary_day) {
        return a.itinerary_day - b.itinerary_day;
      }
      return (a.schedule_time || '').localeCompare(b.schedule_time || '');
    })
    .map(s => [parseFloat(s.spots.latitude), parseFloat(s.spots.longitude)]);

  const remainingSlots = packageData.slots_total - packageData.slots_booked;

  return (
    <div className="package-preview-container animate-fade-in">
      {/* Top Banner Row */}
      <div className="preview-navbar glass-panel">
        <button className="nav-back-circle" onClick={() => navigate('/trips')}>
          <ArrowLeft size={20} />
        </button>
        <div className="navbar-meta">
          <span className="badge-verified">👑 Verified Agency Itinerary</span>
          <h1>{packageData.name}</h1>
          <div className="meta-row">
            <span className="meta-item"><MapPin size={14} /> {packageData.destination}</span>
            <span className="meta-item"><Calendar size={14} /> {sortedDays.length} Days Itinerary</span>
            <span className="meta-item"><Users size={14} /> {remainingSlots} slots available</span>
          </div>
        </div>
      </div>

      <div className="preview-dashboard-body">
        {/* Left column: Itinerary info */}
        <div className="preview-sidebar-info">
          {/* Tabs */}
          <div className="sidebar-tabs">
            <button 
              className={`tab-link ${activeTab === 'itinerary' ? 'active' : ''}`}
              onClick={() => setActiveTab('itinerary')}
            >
              Overview & Day Plan
            </button>
            <button 
              className={`tab-link ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              Operator Details
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'itinerary' ? (
              <div className="tab-pane-fade">
                {/* Description Pitch */}
                <div className="pitch-card glass-panel">
                  <TrendingUp size={20} className="pitch-icon" />
                  <p>{packageData.package_description || 'No detailed description available. Enjoy a curated trek route mapped out by local guides.'}</p>
                </div>

                {/* Day schedules */}
                <div className="itinerary-timeline">
                  {sortedDays.length === 0 ? (
                    <div className="empty-spots-notice">
                      <Compass size={24} />
                      <p>No itinerary locations mapped to this package yet.</p>
                    </div>
                  ) : (
                    sortedDays.map((dayNum, idx) => (
                      <div key={dayNum} className="timeline-day-block">
                        <div className="day-heading">
                          <span className="day-bubble">Day {dayNum}</span>
                          <span className="day-summary">
                            {groupedSpots[dayNum].length} spot{groupedSpots[dayNum].length > 1 ? 's' : ''} mapped
                          </span>
                        </div>
                        <div className="day-spots-list">
                          {groupedSpots[dayNum]
                            .sort((a, b) => (a.schedule_time || '').localeCompare(b.schedule_time || ''))
                            .map((ts, sIdx) => (
                              <div 
                                key={ts.spot_id} 
                                className="timeline-spot-item glass-panel"
                                onClick={() => setMapCenter([parseFloat(ts.spots.latitude), parseFloat(ts.spots.longitude)])}
                              >
                                {ts.spots.image_url && (
                                  <img 
                                    src={ts.spots.image_url} 
                                    alt={ts.spots.title} 
                                    className="spot-thumb"
                                  />
                                )}
                                <div className="spot-meta-details">
                                  <div className="spot-heading-row">
                                    <h4>{ts.spots.title}</h4>
                                    {ts.schedule_time && (
                                      <span className="time-badge">
                                        <Clock size={10} /> {ts.schedule_time}
                                      </span>
                                    )}
                                  </div>
                                  <p>{ts.spots.description || 'Stunning destination on the tour route.'}</p>
                                  
                                  <div className="spot-tags-row">
                                    <span 
                                      className="category-pill"
                                      style={{ backgroundColor: `${getSpotCategoryColor(ts.spots.category)}1A`, color: getSpotCategoryColor(ts.spots.category) }}
                                    >
                                      {ts.spots.category.toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="tab-pane-fade details-pane">
                {/* Agency Details */}
                <div className="agency-details-card glass-panel">
                  <div className="agency-branding-row">
                    {packageData.agency_profiles?.logo_url ? (
                      <img src={packageData.agency_profiles.logo_url} alt="Agency logo" className="agency-logo-img" />
                    ) : (
                      <div className="agency-avatar-fallback">👑</div>
                    )}
                    <div>
                      <h3>{packageData.agency_profiles?.company_name || 'Verified Tour Operator'}</h3>
                      <p className="partner-verify">Spota Certified Travel Partner</p>
                    </div>
                  </div>
                  
                  <div className="agency-pitch-bullets">
                    <div className="bullet-row">
                      <Shield size={16} className="bullet-ico" />
                      <div>
                        <strong>Buyer Protection escrow</strong>
                        <p>Funds are held securely by Spota and only disbursed 24 hours after your trip begins.</p>
                      </div>
                    </div>
                    <div className="bullet-row">
                      <CheckCircle size={16} className="bullet-ico" />
                      <div>
                        <strong>Curated Board copy</strong>
                        <p>Unlock access to the live collaborative planning board, complete with pre-planned routes, tips, and chat.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Map route & Purchase Card */}
        <div className="preview-sidebar-map-checkout">
          {/* Leaflet Map Preview */}
          <div className="preview-map-card glass-panel">
            <div className="map-card-header">
              <h3>Route Map</h3>
              <span>Click items to focus</span>
            </div>
            <div className="map-view-wrapper">
              <MapContainer 
                center={mapCenter} 
                zoom={12} 
                scrollWheelZoom={true} 
                zoomControl={false}
                className="preview-leaflet"
              >
                <MapCenter position={mapCenter} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                />

                {spots.map((ts, idx) => (
                  <Marker 
                    key={ts.spot_id} 
                    position={[parseFloat(ts.spots.latitude), parseFloat(ts.spots.longitude)]}
                    icon={createNumMarker(ts.itinerary_day || 1)}
                  >
                    <Popup>
                      <div className="map-popup-details">
                        <strong>Day {ts.itinerary_day} - {ts.spots.title}</strong>
                        <p>{ts.spots.description}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {sortedPathCoords.length > 1 && (
                  <Polyline 
                    positions={sortedPathCoords}
                    color="#8e44ad"
                    weight={4}
                    dashArray="6, 6"
                  />
                )}
              </MapContainer>
            </div>
          </div>

          {/* Pricing Book Box */}
          <div className="checkout-sticky-card glass-panel">
            <div className="price-label-row">
              <div>
                <span className="sub-label">Price per traveler</span>
                <span className="price-big">${packageData.package_price}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="sub-label">Status</span>
                <span className="badge-live-payout">Instant Access</span>
              </div>
            </div>

            <div className="checkout-widget-fields">
              <label>Select Headcount</label>
              <div className="qty-picker">
                <button className="qty-btn" onClick={() => changeTravelers(-1)}>-</button>
                <span className="qty-val">{travelersCount}</span>
                <button className="qty-btn" onClick={() => changeTravelers(1)}>+</button>
              </div>

              <div className="checkout-breakdown">
                <div className="breakdown-row">
                  <span>Subtotal ({travelersCount} traveler{travelersCount > 1 ? 's' : ''})</span>
                  <span>${getSubtotal().toFixed(2)}</span>
                </div>
                <div className="breakdown-row fee">
                  <span>Spota Booking Fee (5%)</span>
                  <span>Included</span>
                </div>
                <div className="breakdown-row total">
                  <span>Total Due</span>
                  <span>${getSubtotal().toFixed(2)}</span>
                </div>
              </div>

              <button className="btn-checkout-submit" onClick={() => setShowCheckoutModal(true)}>
                <span>Book Now & Unlock Board</span>
                <ArrowRight size={16} />
              </button>

              <div className="trust-notice">
                <Shield size={12} />
                <span>Simulated secure sandbox billing checkout</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* STRIPE CHECKOUT SIMULATOR MODAL */}
      {showCheckoutModal && (
        <div className="checkout-modal-backdrop">
          <div className="checkout-modal glass-panel animate-fade-in">
            {checkoutStep === 'form' && (
              <>
                <div className="checkout-modal-header">
                  <div className="header-badge"><CreditCard size={16} /> Stripe Sandbox</div>
                  <h3>Complete Your Booking</h3>
                  <button className="close-btn" onClick={() => setShowCheckoutModal(false)}>×</button>
                </div>

                <form onSubmit={executeBookingCheckout} className="checkout-form">
                  <div className="modal-payment-summary">
                    <div>
                      <strong>{packageData.name}</strong>
                      <p>{travelersCount} traveler{travelersCount > 1 ? 's' : ''} • Mapped Itinerary</p>
                    </div>
                    <span className="price-tag">${getSubtotal().toFixed(2)}</span>
                  </div>

                  {paymentError && (
                    <div className="payment-error-alert">
                      <AlertCircle size={16} />
                      <span>{paymentError}</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Cardholder Name</label>
                    <input 
                      type="text" 
                      name="cardName"
                      placeholder="e.g. David Miller"
                      value={paymentForm.cardName}
                      onChange={handlePaymentInputChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Card Number</label>
                    <input 
                      type="text" 
                      name="cardNumber"
                      placeholder="4242 4242 4242 4242"
                      value={paymentForm.cardNumber}
                      onChange={handlePaymentInputChange}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Expiration</label>
                      <input 
                        type="text" 
                        name="expiry"
                        placeholder="MM/YY"
                        value={paymentForm.expiry}
                        onChange={handlePaymentInputChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>CVC</label>
                      <input 
                        type="password" 
                        name="cvv"
                        placeholder="123"
                        value={paymentForm.cvv}
                        onChange={handlePaymentInputChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Billing Address</label>
                    <input 
                      type="text" 
                      name="billingAddress"
                      placeholder="e.g. 123 Alpine Way, Seattle"
                      value={paymentForm.billingAddress}
                      onChange={handlePaymentInputChange}
                      required
                    />
                  </div>

                  <button type="submit" className="payment-submit-btn">
                    Authorize & Secure Payouts (${getSubtotal().toFixed(2)})
                  </button>

                  <p className="payment-escrow-subtext">
                    This is a secure Stripe Sandbox transaction. Your funds are secured in escrow.
                  </p>
                </form>
              </>
            )}

            {checkoutStep === 'processing' && (
              <div className="checkout-processing-view">
                <div className="stripe-loading-ring">
                  <div></div><div></div><div></div><div></div>
                </div>
                <h3>Authorizing Sandbox Payment</h3>
                <p>Establishing escrow channel and verifying ledger allocations...</p>
                <div className="processing-steps">
                  <span className="step-label active">✓ Card Verification</span>
                  <span className="step-label active">⌛ Securing Funds in Escrow</span>
                  <span className="step-label">⌛ Generating Live Trip Board Copy</span>
                </div>
              </div>
            )}

            {checkoutStep === 'success' && (
              <div className="checkout-success-view">
                <CheckCircle size={64} className="success-icon-badge" />
                <h3>Booking Confirmed!</h3>
                <p className="booking-congrats">
                  Awesome! Your transaction was successfully authorized. 95% of your payment has been allocated to the local operator's ledger and 5% marketplace cut has been verified.
                </p>

                <div className="receipt-summary glass-panel">
                  <div className="receipt-row">
                    <span>Package Booked</span>
                    <strong>{packageData.name}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Travelers</span>
                    <strong>{travelersCount} Headcount</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Charged via Sandbox</span>
                    <strong>${getSubtotal().toFixed(2)}</strong>
                  </div>
                  <div className="receipt-row">
                    <span>Active Copied Board ID</span>
                    <code className="cloned-id">{clonedTripId || 'Cloning Board...'}</code>
                  </div>
                </div>

                <div className="success-actions">
                  <button 
                    className="open-board-btn"
                    onClick={() => {
                      setShowCheckoutModal(false);
                      if (clonedTripId) navigate(`/trips/${clonedTripId}`);
                    }}
                  >
                    <span>Enter Live Copied Board</span>
                    <Sparkles size={16} />
                  </button>
                  <button 
                    className="exit-btn"
                    onClick={() => {
                      setShowCheckoutModal(false);
                      navigate('/trips');
                    }}
                  >
                    Return to Directory
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
