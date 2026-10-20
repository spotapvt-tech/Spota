import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Vitest compiles JSX with the classic runtime here; components need React in scope.
globalThis.React = React;

vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', isGuest: false } }) }));
vi.mock('../../lib/adventureCatalog', () => ({
  fetchAdventures: vi.fn(async () => ({
    items: [
      { id: 'a', state: 'Himachal Pradesh', terrainRegion: 'Kullu' },
      { id: 'b', state: 'Himachal Pradesh', terrainRegion: 'Dhauladhar' },
      { id: 'c', state: 'Uttarakhand', terrainRegion: 'Garhwal' }
    ],
    fromCache: false
  }))
}));

import { supabase } from '../../lib/supabaseClient';
import LeaderboardView from '../LeaderboardView';

const board = (over = {}) => ({
  lens: 'home', level: 'global', scope: null, window: 'all', needs_scope: false, total: 3,
  entries: [
    { rank: 1, username: 'other', tier: 'trailblazer', ap: 764, is_me: false },
    { rank: 2, username: 'rahul', tier: 'wanderer', ap: 157, is_me: true },
    { rank: 3, username: 'cara', tier: 'wanderer', ap: 108, is_me: false }
  ],
  me: { rank: 2, ap: 157, tier: 'wanderer', username: 'rahul' },
  around_me: [],
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
});

const renderView = () => render(<MemoryRouter><LeaderboardView /></MemoryRouter>);

describe('LeaderboardView', () => {
  it('shows the global home board with my row highlighted and my rank card', async () => {
    supabase.rpc.mockResolvedValue({ data: board(), error: null });
    renderView();
    expect(await screen.findByText('other')).toBeInTheDocument();
    expect(supabase.rpc).toHaveBeenCalledWith('get_leaderboard', { p_lens: 'home', p_level: 'global', p_scope: null, p_window: 'all', p_limit: 50 });
    expect(screen.getByText('rahul (you)').closest('li')).toHaveClass('is-me');
    expect(screen.getByText('🥇')).toBeInTheDocument();
    expect(screen.getByText('#2', { selector: '.lb-me-rank' })).toBeInTheDocument();
  });

  it('terrain lens + state level sends the chosen state, defaulting to the first in the catalog', async () => {
    supabase.rpc.mockResolvedValue({ data: board({ lens: 'terrain', level: 'state', scope: 'Himachal Pradesh' }), error: null });
    renderView();
    await screen.findByText('other');
    fireEvent.click(screen.getByRole('tab', { name: 'Where I trekked' }));
    fireEvent.click(screen.getByRole('tab', { name: 'State' }));
    await waitFor(() => expect(supabase.rpc).toHaveBeenLastCalledWith('get_leaderboard', expect.objectContaining({ p_lens: 'terrain', p_level: 'state', p_scope: 'Himachal Pradesh' })));

    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Uttarakhand' } });
    await waitFor(() => expect(supabase.rpc).toHaveBeenLastCalledWith('get_leaderboard', expect.objectContaining({ p_scope: 'Uttarakhand' })));

    fireEvent.click(screen.getByRole('tab', { name: 'Region' }));
    await waitFor(() => expect(supabase.rpc).toHaveBeenLastCalledWith('get_leaderboard', expect.objectContaining({ p_level: 'region', p_scope: 'Dhauladhar' })));
  });

  it('home lens without a home location asks the user to set it', async () => {
    supabase.rpc.mockResolvedValue({ data: board({ level: 'state', needs_scope: true, entries: [], me: null, total: 0 }), error: null });
    renderView();
    expect(await screen.findByText(/Set your home state and city/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set home location' })).toBeInTheDocument();
  });

  it('season toggle requests the season window', async () => {
    supabase.rpc.mockResolvedValue({ data: board(), error: null });
    renderView();
    await screen.findByText('other');
    fireEvent.click(screen.getByRole('button', { name: 'This season' }));
    await waitFor(() => expect(supabase.rpc).toHaveBeenLastCalledWith('get_leaderboard', expect.objectContaining({ p_window: 'season' })));
  });

  it('offline: serves the last cached board with a notice', async () => {
    supabase.rpc.mockResolvedValue({ data: board(), error: null });
    const { unmount } = renderView();
    await screen.findByText('other');
    unmount();

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    supabase.rpc.mockClear();
    renderView();
    expect(await screen.findByText(/Offline: showing the last saved board/)).toBeInTheDocument();
    expect(screen.getByText('other')).toBeInTheDocument();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
