import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import './DirectMessageView.css';

export default function DirectMessageView({ chat, partner, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);

  // Scroll to bottom helper
  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Fetch initial message history
  useEffect(() => {
    async function loadMessages() {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('chat_id', chat.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setMessages(data || []);
      } catch (err) {
        console.error('Failed to load chat history:', err);
      } finally {
        setLoading(false);
        // Instant scroll on load
        setTimeout(() => scrollToBottom('auto'), 50);
      }
    }

    loadMessages();
  }, [chat.id]);

  // Subscribe to real-time message inserts for this specific chat ID
  useEffect(() => {
    const channelName = `chat_room_${chat.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `chat_id=eq.${chat.id}`
        },
        (payload) => {
          setMessages((prev) => {
            // Avoid duplicate additions if the sender already added it optimistically
            if (prev.some(m => m.id === payload.new.id || (m.tempId && m.tempId === payload.new.tempId))) {
              return prev;
            }
            return [...prev, payload.new];
          });
          // Scroll down on new message
          setTimeout(() => scrollToBottom('smooth'), 50);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [chat.id]);

  // Scroll when messages array changes
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('smooth');
    }
  }, [messages.length]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const messageText = inputText.trim();
    setInputText('');
    setIsSending(true);

    const tempId = Date.now().toString();
    const optimisticMessage = {
      id: tempId,
      tempId: tempId,
      chat_id: chat.id,
      sender_id: user.id,
      content: messageText,
      created_at: new Date().toISOString(),
      sending: true
    };

    // Append optimistically to improve UI responsiveness
    setMessages(prev => [...prev, optimisticMessage]);
    setTimeout(() => scrollToBottom('smooth'), 10);

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          chat_id: chat.id,
          sender_id: user.id,
          content: messageText
        })
        .select()
        .single();

      if (error) throw error;

      // Replace optimistic message with actual DB response
      setMessages(prev =>
        prev.map(msg => (msg.id === tempId ? data : msg))
      );
    } catch (err) {
      console.error('Failed to send message:', err);
      // Mark message as failed
      setMessages(prev =>
        prev.map(msg => (msg.id === tempId ? { ...msg, error: true, sending: false } : msg))
      );
    } finally {
      setIsSending(false);
    }
  };

  // Format message time (e.g. 10:42 AM)
  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="dm-overlay glass-panel animate-slide-in-right">
      {/* DM Header */}
      <div className="dm-header">
        <button className="dm-back-btn" onClick={onClose}>
          <ArrowLeft size={20} />
        </button>
        <div 
          className="dm-user-profile" 
          style={{ cursor: 'pointer' }} 
          onClick={() => navigate('/profile', { state: { userId: partner.id, collaborator: partner } })}
        >
          {partner?.avatar_url ? (
            <img src={partner.avatar_url} alt={partner.username} className="dm-header-avatar" />
          ) : (
            <div className="dm-header-avatar-placeholder">
              {partner?.username ? partner.username.charAt(0).toUpperCase() : 'U'}
            </div>
          )}
          <div>
            <h3>{partner?.username || 'Spota User'}</h3>
            <span className="dm-status">Direct Message</span>
          </div>
        </div>
      </div>

      {/* DM Messages Body */}
      <div className="dm-body">
        {loading ? (
          <div className="dm-loader">
            <Loader2 className="animate-spin" size={24} />
            <span>Loading vibes history...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="dm-empty">
            <p>No messages here yet. Say hi to start the conversation! 👋</p>
          </div>
        ) : (
          <div className="dm-messages-list">
            {messages.map((msg) => {
              const isMine = msg.sender_id === user.id;
              return (
                <div 
                  key={msg.id} 
                  className={`dm-bubble-wrapper ${isMine ? 'mine' : 'theirs'} ${msg.sending ? 'sending' : ''} ${msg.error ? 'failed' : ''}`}
                >
                  <div className="dm-bubble">
                    <p className="dm-text">{msg.content}</p>
                    <span className="dm-time">
                      {formatTime(msg.created_at)}
                      {msg.sending && ' · Sending...'}
                      {msg.error && ' · Send failed'}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* DM Input Footer */}
      <form className="dm-input-bar" onSubmit={handleSend}>
        <input
          type="text"
          placeholder={`Message @${partner?.username}...`}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="dm-send-btn" disabled={!inputText.trim() || loading}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
