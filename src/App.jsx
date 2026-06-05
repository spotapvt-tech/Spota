import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import MapView from './pages/MapView';
import FeedView from './pages/FeedView';
import ProfileView from './pages/ProfileView';
import AddGemView from './pages/AddGemView';
import AuthView from './pages/AuthView';
import AdminView from './pages/AdminView';
import ChatView from './pages/ChatView';
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
          <Route path="feed" element={<FeedView />} />
          <Route path="add" element={<AddGemView />} />
          <Route path="profile" element={<ProfileView />} />
          <Route path="admin" element={<AdminView />} />
          <Route path="chat" element={<ChatView />} />
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
