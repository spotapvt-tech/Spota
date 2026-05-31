import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft, Check, Trash2, Eye } from 'lucide-react';
import SpotDetailsModal from '../components/SpotDetailsModal';
import './AdminView.css';

export default function AdminView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState(null);

  // Security check - redirect if not admin/staff
  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    const isAdmin = user.email?.endsWith('@spota.local') || user.email?.includes('admin');
    if (!isAdmin) {
      alert('Access Denied: Only Admins can access this panel.');
      navigate('/profile');
    }
  }, [user, navigate]);

  const fetchSpots = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('spots')
        .select('*')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setSpots(data);
      }
    } catch (err) {
      console.error('Error fetching admin moderation spots:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  const handleApprove = async (id) => {
    try {
      const { error } = await supabase
        .from('spots')
        .update({ status: 'approved', report_count: 0 })
        .eq('id', id);
      
      if (error) throw error;
      
      // Update local state
      setSpots(prev => prev.map(s => s.id === id ? { ...s, status: 'approved', report_count: 0 } : s));
      alert('Spot approved successfully!');
    } catch (err) {
      console.error('Approval failed:', err);
      alert('Approval failed: ' + err.message);
    }
  };

  const handleReject = async (id) => {
    if (!confirm('Are you sure you want to reject and delete this gem permanently?')) return;
    try {
      const { error } = await supabase
        .from('spots')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Update local state
      setSpots(prev => prev.filter(s => s.id !== id));
      alert('Spot rejected and deleted permanently!');
    } catch (err) {
      console.error('Rejection failed:', err);
      alert('Rejection failed: ' + err.message);
    }
  };

  // Filter items
  const pendingSpots = spots.filter(s => s.status === 'pending');
  const reportedSpots = spots.filter(s => (s.report_count || 0) > 0);

  if (!user) return null;

  return (
    <div className="admin-container animate-fade-in">
      <div className="admin-header">
        <h2>
          <Shield size={22} className="verified-badge" />
          Moderation Panel
        </h2>
        <button className="back-to-profile-btn" onClick={() => navigate('/profile')}>
          <ArrowLeft size={16} />
          Profile
        </button>
      </div>

      <div className="admin-stats-bar">
        <div className="admin-stat-card glass-panel">
          <span className="admin-stat-val">{pendingSpots.length}</span>
          <span className="admin-stat-lbl">Pending Review</span>
        </div>
        <div className="admin-stat-card glass-panel">
          <span className="admin-stat-val">{reportedSpots.length}</span>
          <span className="admin-stat-lbl">Flagged Reports</span>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginTop: '20px' }}>Loading queue...</p>
      ) : (
        <>
          {/* Section 1: Pending */}
          <div className="admin-section">
            <h3>Pending Gems ({pendingSpots.length})</h3>
            <div className="moderation-list">
              {pendingSpots.length === 0 ? (
                <div className="empty-mod glass-panel">🎉 Clean queue! No gems waiting review.</div>
              ) : (
                pendingSpots.map(spot => (
                  <div key={spot.id} className="mod-card glass-panel animate-fade-in">
                    <div className="mod-card-header">
                      {spot.image_url ? (
                        <img src={spot.image_url} alt={spot.title} className="mod-card-img" />
                      ) : (
                        <div className="mod-card-img" style={{ backgroundColor: 'var(--color-accent)' }}></div>
                      )}
                      <div className="mod-card-details">
                        <h4>{spot.title}</h4>
                        <p>{spot.category.toUpperCase()} · {spot.description || "No vibe description"}</p>
                        <span className="mod-meta-badge pending">Pending</span>
                      </div>
                    </div>
                    <div className="mod-actions">
                      <button className="mod-btn approve-btn" onClick={() => handleApprove(spot.id)}>
                        <Check size={16} />
                        Approve
                      </button>
                      <button className="mod-btn" onClick={() => setSelectedSpot(spot)}>
                        <Eye size={16} />
                        Inspect
                      </button>
                      <button className="mod-btn reject-btn" onClick={() => handleReject(spot.id)}>
                        <Trash2 size={16} />
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section 2: Reported */}
          <div className="admin-section" style={{ marginTop: '24px' }}>
            <h3>Flagged Reports ({reportedSpots.length})</h3>
            <div className="moderation-list">
              {reportedSpots.length === 0 ? (
                <div className="empty-mod glass-panel">🛡️ Safe vibes! No reported items found.</div>
              ) : (
                reportedSpots.map(spot => (
                  <div key={spot.id} className="mod-card glass-panel animate-fade-in">
                    <div className="mod-card-header">
                      {spot.image_url ? (
                        <img src={spot.image_url} alt={spot.title} className="mod-card-img" />
                      ) : (
                        <div className="mod-card-img" style={{ backgroundColor: 'var(--color-accent)' }}></div>
                      )}
                      <div className="mod-card-details">
                        <h4>{spot.title}</h4>
                        <p>{spot.category.toUpperCase()} · {spot.description || "No vibe description"}</p>
                        <span className="mod-meta-badge reported">
                          Reported ({spot.report_count} flags)
                        </span>
                      </div>
                    </div>
                    <div className="mod-actions">
                      <button className="mod-btn approve-btn" onClick={() => handleApprove(spot.id)}>
                        <Check size={16} />
                        Keep & Approve
                      </button>
                      <button className="mod-btn" onClick={() => setSelectedSpot(spot)}>
                        <Eye size={16} />
                        Inspect
                      </button>
                      <button className="mod-btn reject-btn" onClick={() => handleReject(spot.id)}>
                        <Trash2 size={16} />
                        Delete Content
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {selectedSpot && (
        <SpotDetailsModal spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
      )}
    </div>
  );
}
