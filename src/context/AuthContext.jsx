import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to fetch custom profile from the profiles table
  const fetchUserProfile = async (authUser) => {
    if (!authUser || authUser.isGuest) return authUser;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      
      if (!error && data) {
        return { 
          ...authUser, 
          // Inject database fields into the user state
          user_metadata: {
            ...authUser.user_metadata,
            username: data.username || authUser.user_metadata.username,
            reputation: data.reputation ?? authUser.user_metadata.reputation,
            is_verified: data.is_verified ?? authUser.user_metadata.is_verified
          }
        };
      }
    } catch (e) {
      console.warn('Profiles table not queryable, falling back to auth metadata:', e);
    }
    return authUser;
  };

  // Handle Supabase Auth state changes
  useEffect(() => {
    // Check active session on load
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const enrichedUser = await fetchUserProfile(session.user);
        setUser(enrichedUser);
      } else {
        // Fallback to local guest user if stored
        const savedGuest = localStorage.getItem('spota_guest_user');
        if (savedGuest) {
          setUser(JSON.parse(savedGuest));
        }
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const enrichedUser = await fetchUserProfile(session.user);
        setUser(enrichedUser);
        // Clear guest session if real user logs in
        localStorage.removeItem('spota_guest_user');
      } else {
        // Keep guest session if it exists, otherwise null
        const savedGuest = localStorage.getItem('spota_guest_user');
        setUser(savedGuest ? JSON.parse(savedGuest) : null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email, password, username) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username || email.split('@')[0],
            reputation: 0,
            is_verified: false
          }
        }
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const signInAnonymous = useCallback((username = 'Guest Explorer') => {
    const guestUser = {
      id: `guest_${Math.random().toString(36).substr(2, 9)}`,
      email: 'guest@spota.local',
      isGuest: true,
      user_metadata: {
        username: username,
        reputation: 0,
        is_verified: false
      }
    };
    localStorage.setItem('spota_guest_user', JSON.stringify(guestUser));
    setUser(guestUser);
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('spota_guest_user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signUp,
      signIn,
      signInAnonymous,
      signOut
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
