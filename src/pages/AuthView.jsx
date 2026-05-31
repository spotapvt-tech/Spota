import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, Sparkles, UserCheck } from 'lucide-react';
import './AuthView.css';

export default function AuthView() {
  const { signIn, signUp, signInAnonymous } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: ''
  });
  const [guestName, setGuestName] = useState('');
  const [showGuestInput, setShowGuestInput] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(formData.email, formData.password, formData.username);
        alert('Check your email for the confirmation link or try logging in!');
      } else {
        await signIn(formData.email, formData.password);
      }
    } catch (err) {
      console.error('Auth error:', err);
      alert(`Auth failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSubmit = (e) => {
    e.preventDefault();
    signInAnonymous(guestName.trim() || 'Guest Explorer');
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-panel">
        <div className="auth-header">
          <div className="brand">
            <span className="brand-dot animate-pulse"></span>
            <h1>Spota</h1>
          </div>
          <p className="auth-subtitle">Discover and share hidden local gems</p>
        </div>

        {!showGuestInput ? (
          <>
            <form onSubmit={handleSubmit} className="auth-form">
              {isSignUp && (
                <div className="form-group-icon">
                  <User size={18} className="input-icon" />
                  <input
                    type="text"
                    placeholder="Username"
                    className="zen-input-auth"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
              )}

              <div className="form-group-icon">
                <Mail size={18} className="input-icon" />
                <input
                  type="email"
                  placeholder="Email"
                  className="zen-input-auth"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group-icon">
                <Lock size={18} className="input-icon" />
                <input
                  type="password"
                  placeholder="Password"
                  className="zen-input-auth"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>

              <button type="submit" className="submit-auth-btn" disabled={loading}>
                {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <div className="auth-toggle">
              <span>{isSignUp ? 'Already have an account?' : "Don't have an account?"}</span>
              <button className="toggle-mode-btn" onClick={() => setIsSignUp(!isSignUp)}>
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </div>

            <div className="divider">
              <span>or</span>
            </div>

            <button className="guest-action-btn" onClick={() => setShowGuestInput(true)}>
              <Sparkles size={16} />
              Continue as Guest
            </button>
          </>
        ) : (
          <form onSubmit={handleGuestSubmit} className="auth-form animate-fade-in">
            <p className="guest-prompt">Choose a nickname for your guest explorer profile:</p>
            <div className="form-group-icon">
              <UserCheck size={18} className="input-icon" />
              <input
                type="text"
                placeholder="e.g. ZenExplorer"
                className="zen-input-auth"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                maxLength={20}
                required
              />
            </div>
            <button type="submit" className="submit-auth-btn">
              Explore Now
            </button>
            <button type="button" className="toggle-mode-btn back-btn" onClick={() => setShowGuestInput(false)}>
              Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
