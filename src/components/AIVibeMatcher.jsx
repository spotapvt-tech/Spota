import { useState, useEffect, useRef } from 'react';
import { Send, X, Bot, User, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './AIVibeMatcher.css';

export default function AIVibeMatcher({ onClose, onSelectSpot }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: 'Hey Explorer! 🌌 I am your Spota Vibe AI. Tell me what kind of environment or mood you are looking for today in plain English. For example:\n\n• "A quiet, cozy cafe with wifi to get work done"\n• "A scenic mountain viewpoint to watch the sunset"\n• "An aesthetic and colorful neon vibe with great photos"',
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [allSpots, setAllSpots] = useState([]);
  const messagesEndRef = useRef(null);

  // Fetch spots once on load for search matching
  useEffect(() => {
    async function loadSpots() {
      try {
        const { data, error } = await supabase
          .from('spots')
          .select('*')
          .neq('status', 'deleted');
        if (!error && data) {
          setAllSpots(data);
        }
      } catch (err) {
        console.error('Failed to load spots for AI Matcher:', err);
      }
    }
    loadSpots();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userQuery = input.trim();
    const newUserMessage = {
      id: Date.now(), // eslint-disable-line react-hooks/purity
      sender: 'user',
      text: userQuery
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response delay
    setTimeout(() => {
      processAiQuery(userQuery);
    }, 1500);
  };

  const processAiQuery = (query) => {
    const cleanQuery = query.toLowerCase().trim();
    
    // 1. Parse keywords
    const keywords = cleanQuery.split(/[\s,.-]+/);
    
    // 2. Identify Category Intents
    let categoryIntent = null;
    const cafeSynonyms = ['cafe', 'coffee', 'matcha', 'tea', 'latte', 'espresso', 'bakery', 'breakfast', 'brunch', 'food', 'cafes'];
    const viewpointSynonyms = ['view', 'viewpoint', 'sunset', 'sunrise', 'scenic', 'hill', 'mountain', 'nature', 'outdoor', 'park', 'skyline', 'views'];
    const eventSynonyms = ['event', 'live', 'music', 'gigs', 'party', 'concert', 'club', 'social', 'gathering', 'festival', 'events'];

    if (keywords.some(w => cafeSynonyms.includes(w))) {
      categoryIntent = 'cafe';
    } else if (keywords.some(w => viewpointSynonyms.includes(w))) {
      categoryIntent = 'viewpoint';
    } else if (keywords.some(w => eventSynonyms.includes(w))) {
      categoryIntent = 'event';
    }

    // 3. Score Spots
    const scoredSpots = allSpots.map(spot => {
      let score = 0;
      const spotTitle = spot.title?.toLowerCase() || '';
      const spotDesc = spot.description?.toLowerCase() || '';
      const spotCat = spot.category?.toLowerCase() || '';
      const spotTags = (spot.tags || []).map(t => t.toLowerCase());

      // Category match
      if (categoryIntent && spotCat === categoryIntent) {
        score += 8;
      }

      // Keyword matches
      keywords.forEach(word => {
        if (word.length < 3) return; // Ignore small words

        if (spotTitle.includes(word)) score += 4;
        if (spotDesc.includes(word)) score += 3;
        if (spotCat.includes(word)) score += 3;
        if (spotTags.some(t => t.includes(word))) score += 5;
      });

      // Special vibe matches
      if (cleanQuery.includes('cozy') || cleanQuery.includes('warm') || cleanQuery.includes('comfortable')) {
        if (spotDesc.includes('cozy') || spotTags.includes('cozy')) score += 5;
      }
      if (cleanQuery.includes('quiet') || cleanQuery.includes('silent') || cleanQuery.includes('study') || cleanQuery.includes('work') || cleanQuery.includes('wifi')) {
        if (spotDesc.includes('quiet') || spotDesc.includes('work') || spotTags.includes('study') || spotTags.includes('workspace')) score += 5;
      }
      if (cleanQuery.includes('aesthetic') || cleanQuery.includes('neon') || cleanQuery.includes('instagram') || cleanQuery.includes('insta')) {
        if (spotDesc.includes('aesthetic') || spotDesc.includes('neon') || spotTags.includes('insta-worthy') || spotTags.includes('neon')) score += 5;
      }
      if (cleanQuery.includes('lively') || cleanQuery.includes('social') || cleanQuery.includes('fun') || cleanQuery.includes('music')) {
        if (spotDesc.includes('lively') || spotDesc.includes('music') || spotTags.includes('lively')) score += 5;
      }

      return { spot, score };
    });

    // Filter and sort
    const matched = scoredSpots
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(item => item.spot);

    let responseText = '';
    if (matched.length > 0) {
      const topSpot = matched[0];
      responseText = `Aha! I scanned our discovery records and found ${matched.length} spot${matched.length > 1 ? 's' : ''} matching your vibe. I highly recommend checking out "${topSpot.title}" in particular, as it fits your search criteria perfectly!`;
    } else {
      // Return top 3 spots in the database as fallbacks
      const fallbackSpots = [...allSpots]
        .sort((a, b) => {
          const popularityA = (Object.values(a.reactions || {}).reduce((sum, v) => sum + v, 0)) + ((a.share_count || 0) * 2);
          const popularityB = (Object.values(b.reactions || {}).reduce((sum, v) => sum + v, 0)) + ((b.share_count || 0) * 2);
          return popularityB - popularityA;
        })
        .slice(0, 3);
      
      responseText = `I couldn't find any spots matching that exact description, but here are some of the most popular community favorites around right now that you might love exploring:`;
      matched.push(...fallbackSpots);
    }

    setIsTyping(false);
    setMessages(prev => [
      ...prev,
      {
        id: Date.now(),
        sender: 'ai',
        text: responseText,
        spots: matched
      }
    ]);
  };

  return (
    <div className="ai-matcher-overlay glass-panel animate-fade-in">
      <div className="ai-matcher-header">
        <div className="ai-title">
          <div className="ai-avatar-glow">
            <Bot size={20} color="var(--color-bg-primary)" fill="var(--color-bg-primary)" />
          </div>
          <div>
            <h3>Spota Vibe AI</h3>
            <span>Conversational Search Assistant</span>
          </div>
        </div>
        <button className="ai-close-btn" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="ai-chat-body">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.sender}-msg`}>
            <div className="msg-avatar">
              {msg.sender === 'ai' ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div className="msg-content">
              <p className="msg-text">{msg.text}</p>
              
              {/* Spots recommendations carousel */}
              {msg.spots && msg.spots.length > 0 && (
                <div className="ai-spots-carousel">
                  {msg.spots.map((spot) => (
                    <div 
                      key={spot.id} 
                      className="ai-spot-card glass-panel clickable" 
                      onClick={() => onSelectSpot(spot)}
                    >
                      {spot.image_url ? (
                        <img src={spot.image_url} alt={spot.title} className="ai-spot-image" />
                      ) : (
                        <div className="ai-spot-image placeholder-accent"></div>
                      )}
                      <div className="ai-spot-info">
                        <h4>{spot.title}</h4>
                        <span className="ai-spot-category">{spot.category.toUpperCase()}</span>
                        <p className="ai-spot-desc">{spot.description || "No description available."}</p>
                        <div className="ai-spot-action">
                          <span>View Spot</span>
                          <ArrowRight size={14} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="chat-message ai-msg">
            <div className="msg-avatar">
              <Bot size={16} />
            </div>
            <div className="msg-content typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="ai-chat-input-bar" onSubmit={handleSend}>
        <input 
          type="text" 
          placeholder="Ask for a vibe (e.g. cozy sunset viewpoints)..." 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isTyping}
        />
        <button type="submit" className="ai-send-btn" disabled={!input.trim() || isTyping}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
