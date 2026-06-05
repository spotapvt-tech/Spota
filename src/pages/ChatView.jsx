import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Search, MessageSquare, Plus, Loader2, LogIn } from 'lucide-react';
import DirectMessageView from '../components/chat/DirectMessageView';
import './ChatView.css';

export default function ChatView() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const [lastMessages, setLastMessages] = useState({});

  // Auto-start chat from routing state (e.g. from SpotDetails or Profile DMs)
  useEffect(() => {
    if (user && !user.isGuest && location.state?.startChatWith) {
      handleStartChat(location.state.startChatWith);
      // Clean state to avoid re-triggering on reload
      window.history.replaceState({}, document.title);
    }
  }, [user, location.state]);

  // Fetch all chats for the user
  const fetchChats = useCallback(async () => {
    if (!user || user.isGuest) return;
    try {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          id,
          user1_id,
          user2_id,
          created_at,
          user1:profiles!user1_id (id, username, avatar_url),
          user2:profiles!user2_id (id, username, avatar_url)
        `)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setChats(data || []);

      // If we have chats, fetch the latest message for each
      if (data && data.length > 0) {
        const chatIds = data.map(c => c.id);
        const { data: messages, error: msgError } = await supabase
          .from('chat_messages')
          .select('chat_id, content, created_at')
          .in('chat_id', chatIds)
          .order('created_at', { ascending: true });

        if (!msgError && messages) {
          const lastMsgMap = {};
          messages.forEach(msg => {
            lastMsgMap[msg.chat_id] = msg;
          });
          setLastMessages(lastMsgMap);
        }
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchChats();

    // Subscribe to new messages globally to update the preview snippet in real time
    if (!user || user.isGuest) return;
    
    const channel = supabase
      .channel('global_chat_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setLastMessages(prev => ({
            ...prev,
            [payload.new.chat_id]: payload.new
          }));
          // Refresh the list order if a new message comes in
          fetchChats();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user, fetchChats]);

  // Search users to start a new chat
  const handleSearch = async (val) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .neq('id', user.id)
        .ilike('username', `%${val}%`)
        .limit(8);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Start or open a chat room with a specific user
  const handleStartChat = async (targetUser) => {
    if (!user || user.isGuest) return;
    
    // Sort IDs to comply with the DB ordering check constraint user1_id < user2_id
    const u1 = user.id < targetUser.id ? user.id : targetUser.id;
    const u2 = user.id < targetUser.id ? targetUser.id : user.id;

    try {
      setLoading(true);
      // 1. Check if chat already exists
      const { data: existingChat, error: findError } = await supabase
        .from('chats')
        .select(`
          id,
          user1_id,
          user2_id,
          created_at,
          user1:profiles!user1_id (id, username, avatar_url),
          user2:profiles!user2_id (id, username, avatar_url)
        `)
        .eq('user1_id', u1)
        .eq('user2_id', u2)
        .maybeSingle();

      if (findError) throw findError;

      if (existingChat) {
        setActiveChat(existingChat);
        setSearchQuery('');
        setSearchResults([]);
        return;
      }

      // 2. Otherwise create a new chat
      const { data: insertData, error: insertError } = await supabase
        .from('chats')
        .insert({ user1_id: u1, user2_id: u2 })
        .select()
        .single();

      if (insertError) throw insertError;

      // Enrich the newly inserted chat with profile details
      const newChatObj = {
        ...insertData,
        user1: u1 === user.id ? { id: user.id, username: user.user_metadata?.username || 'You', avatar_url: user.user_metadata?.avatar_url } : targetUser,
        user2: u2 === user.id ? { id: user.id, username: user.user_metadata?.username || 'You', avatar_url: user.user_metadata?.avatar_url } : targetUser
      };

      setChats(prev => [newChatObj, ...prev]);
      setActiveChat(newChatObj);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      console.error('Failed to start chat:', err);
      alert('Failed to initialize conversation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getChatPartner = (chat) => {
    return chat.user1_id === user.id ? chat.user2 : chat.user1;
  };

  // If user is a Guest, show login CTA
  if (user?.isGuest) {
    return (
      <div className="chat-guest-wrapper glass-panel animate-fade-in">
        <div className="chat-guest-content">
          <div className="guest-chat-icon-wrapper">
            <MessageSquare size={48} color="var(--color-accent)" />
          </div>
          <h2>Unlock Live Chat</h2>
          <p>Sign up or log in to connect directly with spot curators, coordinate vibe checks, and direct-message other Spota explorers!</p>
          <button className="guest-login-btn" onClick={signOut}>
            <LogIn size={18} />
            <span>Login or Register</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Chats</h2>
        <div className="chat-search-bar">
          <Search size={18} className="search-icon-inside" />
          <input
            type="text"
            placeholder="Search users by username to chat..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="chat-body-content">
        {/* Search Results Dropdown Overlay */}
        {searchQuery.trim() && (
          <div className="search-results-overlay glass-panel">
            <h4>Search Results</h4>
            {isSearching ? (
              <div className="search-loading">
                <Loader2 className="animate-spin" size={20} />
                <span>Searching profiles...</span>
              </div>
            ) : searchResults.length === 0 ? (
              <p className="no-results">No profiles found for "{searchQuery}"</p>
            ) : (
              <div className="results-list">
                {searchResults.map((p) => (
                  <div key={p.id} className="search-result-item clickable" onClick={() => handleStartChat(p)}>
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.username} className="user-avatar-sm" />
                    ) : (
                      <div className="user-avatar-placeholder">{p.username.charAt(0).toUpperCase()}</div>
                    )}
                    <span>{p.username}</span>
                    <Plus size={16} color="var(--color-accent)" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chats List */}
        {loading ? (
          <div className="chat-loader">
            <Loader2 className="animate-spin" size={28} />
            <span>Loading conversations...</span>
          </div>
        ) : chats.length === 0 ? (
          <div className="empty-chats">
            <div className="empty-icon-wrapper">
              <MessageSquare size={36} />
            </div>
            <h3>No conversations yet</h3>
            <p>Search for a user using the search bar above to start direct messaging!</p>
          </div>
        ) : (
          <div className="chats-list">
            {chats.map((c) => {
              const partner = getChatPartner(c);
              const lastMsg = lastMessages[c.id];
              return (
                <div key={c.id} className="chat-list-card clickable" onClick={() => setActiveChat(c)}>
                  {partner?.avatar_url ? (
                    <img src={partner.avatar_url} alt={partner.username} className="chat-card-avatar" />
                  ) : (
                    <div className="chat-card-avatar-placeholder">
                      {partner?.username ? partner.username.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <div className="chat-card-details">
                    <div className="chat-card-header">
                      <h4>{partner?.username || 'Spota User'}</h4>
                      {lastMsg && (
                        <span className="chat-time">
                          {new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="chat-snippet">
                      {lastMsg ? lastMsg.content : 'No messages in this chat yet'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Direct Message Slide-Over Overlay */}
      {activeChat && (
        <DirectMessageView
          chat={activeChat}
          partner={getChatPartner(activeChat)}
          onClose={() => {
            setActiveChat(null);
            fetchChats(); // Refresh messages and list order when returning
          }}
        />
      )}
    </div>
  );
}
