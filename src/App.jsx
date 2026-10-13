import { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import Layout from './components/layout/Layout';
import MapView from './pages/MapView';
import VibesFeedView from './pages/VibesFeedView';
import ProfileView from './pages/ProfileView';
import AddGemView from './pages/AddGemView';
import AuthView from './pages/AuthView';
import AdminView from './pages/AdminView';
import ChatView from './pages/ChatView';
import MyTripsView from './pages/MyTripsView';
import TripBoardView from './pages/TripBoardView';
import MyGemsView from './pages/MyGemsView';
import SafeTrekView from './pages/SafeTrekView';
import AgencyDashboardView from './pages/AgencyDashboardView';
import TripPackagePreviewView from './pages/TripPackagePreviewView';
import LandingView from './pages/LandingView';
import { NotificationProvider } from './context/NotificationContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { syncPendingGems } from './lib/gemService';
import { runBackInterceptors } from './lib/hardwareBack';

function AppContent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Retry any gem drops that were queued locally (offline, or a failed
  // online submit) as soon as we have connectivity — once on load, and
  // again whenever the browser comes back online.
  useEffect(() => {
    if (!user) return;
    syncPendingGems();
    window.addEventListener('online', syncPendingGems);
    return () => window.removeEventListener('online', syncPendingGems);
  }, [user]);

  // Android hardware back button. Without this, Capacitor's default is to
  // fall through to WebView history, which has no idea a screen like the
  // gem-drop wizard tracks its own step internally rather than via routes —
  // pressing back mid-wizard would jump straight out of the whole flow
  // instead of stepping back one step. Screens that need first refusal
  // (see AddGemView) register through registerBackInterceptor(); anything
  // not claimed falls through to normal router-back / exit-app here.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const listenerPromise = CapacitorApp.addListener('backButton', () => {
      if (runBackInterceptors()) return;
      if (location.pathname === '/' || location.pathname === '') {
        CapacitorApp.exitApp();
      } else {
        navigate(-1);
      }
    });
    return () => { listenerPromise.then(l => l.remove()); };
  }, [navigate, location.pathname]);

  return (
    <Routes>
      {/* Public Marketing/Landing Routes (Full Width) */}
      <Route path="/landing" element={<LandingView />} />
      <Route path="/welcome" element={<LandingView />} />

      {/* App Routes (Mobile-first Wrapped) */}
      <Route
        path="/*"
        element={
          user ? (
            <div className="mobile-app-container">
              <NotificationProvider>
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<MapView />} />
                    <Route path="vibes" element={<VibesFeedView />} />
                    <Route path="add" element={<AddGemView />} />
                    <Route path="profile" element={<ProfileView />} />
                    <Route path="profile/analytics" element={<MyGemsView />} />
                    <Route path="admin" element={<AdminView />} />
                    <Route path="chat" element={<ChatView />} />
                    <Route path="trips" element={<MyTripsView />} />
                    <Route path="trips/:tripId" element={<TripBoardView />} />
                    <Route path="safe-trek" element={<SafeTrekView />} />
                    <Route path="agency-dashboard" element={<AgencyDashboardView />} />
                    <Route path="trips/preview/:packageId" element={<TripPackagePreviewView />} />
                  </Route>
                </Routes>
              </NotificationProvider>
            </div>
          ) : (
            <AuthView />
          )
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
