import { Routes, Route } from 'react-router-dom';
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
import { NotificationProvider } from './context/NotificationContext';
import { AuthProvider, useAuth } from './context/AuthContext';

function AppContent() {
  const { user } = useAuth();

  if (!user) {
    return <AuthView />;
  }

  return (
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
        </Route>
      </Routes>
    </NotificationProvider>
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
