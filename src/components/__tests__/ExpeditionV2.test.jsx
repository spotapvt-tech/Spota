import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

globalThis.React = React;

vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));

import { supabase } from '../../lib/supabaseClient';
import { track } from '../../lib/analytics';
import ChallengesList from '../ChallengesList';
import { IncomingVouches, VouchRequestForm, VouchStatus } from '../ExpeditionVouches';

const challenge = (over = {}) => ({
  id: 'c1', title: 'Kullu Explorer', description: 'Do a Kullu trek', reward: '10% off a Hampta package',
  scope_type: 'region', scope_region: 'Kullu', min_grade: 2, required_count: 2,
  starts_at: new Date(Date.now() - 86400000).toISOString(), ends_at: new Date(Date.now() + 10 * 86400000).toISOString(),
  agency: 'Kullu Trails', agency_logo: null, participants: 4, joined: false, progress: 0, ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
});

describe('ChallengesList', () => {
  it('shows challenges and joins one', async () => {
    supabase.rpc.mockImplementation(async (fn) => (fn === 'get_challenges' ? { data: [challenge()], error: null } : { data: null, error: null }));
    render(<ChallengesList signedIn />);
    expect(await screen.findByText('Kullu Explorer')).toBeTruthy();
    expect(screen.getByText(/by Kullu Trails/)).toBeTruthy();
    expect(screen.getByText(/2 × Kullu treks, grade 2\+/)).toBeTruthy();
    expect(screen.getByText(/10% off a Hampta package/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Join challenge' }));
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('join_challenge', { p_challenge: 'c1', p_join: true }));
    expect(await screen.findByRole('button', { name: 'Leave' })).toBeTruthy();
    expect(screen.getByText('5 joined')).toBeTruthy();
    expect(screen.getByText('0 / 2 verified')).toBeTruthy();
    expect(track).toHaveBeenCalledWith('challenge_joined', { challenge_id: 'c1' });
  });

  it('shows completion and hides join for guests', async () => {
    supabase.rpc.mockResolvedValue({ data: [challenge({ joined: true, progress: 2 })], error: null });
    const { unmount } = render(<ChallengesList signedIn />);
    expect(await screen.findByText('Completed')).toBeTruthy();
    unmount();
    render(<ChallengesList signedIn={false} />);
    expect(await screen.findByText('Sign in to join.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Join challenge' })).toBeNull();
  });
});

describe('Vouches', () => {
  it('confirms an incoming request', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'v1', status: 'confirmed' }, error: null });
    const onAnswered = vi.fn();
    render(
      <IncomingVouches
        items={[{ id: 'v1', status: 'requested', requester: 'rahul', adventure: 'Hampta Pass', role: 'buddy', completed_at: '2026-10-14T10:00:00Z' }]}
        onAnswered={onAnswered}
      />
    );
    expect(screen.getByText('@rahul')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /I was there/ }));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledWith('v1', 'confirmed'));
    expect(supabase.rpc).toHaveBeenCalledWith('respond_attestation', { p_attestation: 'v1', p_confirm: true, p_note: null });
  });

  it('renders nothing when there are no open requests', () => {
    const { container } = render(<IncomingVouches items={[{ id: 'v1', status: 'confirmed' }]} />);
    expect(container.innerHTML).toBe('');
  });

  it('sends a request and shows server errors', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'No Spota user called ghost' } });
    const onSent = vi.fn();
    render(<VouchRequestForm attemptId="a1" onSent={onSent} />);
    fireEvent.change(screen.getByLabelText('Their username'), { target: { value: '@ghost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('No Spota user called ghost')).toBeTruthy();

    supabase.rpc.mockResolvedValueOnce({ data: { id: 't1', status: 'requested', attempt_id: 'a1' }, error: null });
    fireEvent.change(screen.getByLabelText('Their username'), { target: { value: 'Buddy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', attester: 'Buddy' })));
  });

  it('shows outgoing status chips', () => {
    render(<VouchStatus items={[{ id: 't1', attester: 'Buddy', status: 'confirmed', bonus_applied: true }, { id: 't2', attester: 'g', status: 'requested' }]} />);
    expect(screen.getByText(/@Buddy · vouched · \+15/)).toBeTruthy();
    expect(screen.getByText(/@g · waiting/)).toBeTruthy();
  });
});
