/**
 * End-to-end UI test of Expedition mode in SafeTrekView, using the real
 * trackRecorder / expeditionStore (fake-indexeddb) / expeditionService
 * stack. Only the network (Supabase), maps, auth and EXIF are mocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';

// Vitest compiles JSX with the classic runtime here (the app build uses the
// automatic runtime via @vitejs/plugin-react), so components need React in scope.
globalThis.React = React;
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const TRIUND_EWKB = '0101000020E610000018265305A3165340E17A14AE47214040';
const adventureRow = {
  id: 'adv-triund', slug: 'triund', name: 'Triund', grade: 1, distance_km: 18, elevation_gain_m: 875,
  max_altitude_m: 2850, typical_days: 1, endpoint: TRIUND_EWKB, endpoint_radius_m: 300, country: 'IN',
  state: 'Himachal Pradesh', terrain_region: 'Dhauladhar', winter_start_md: '12-15', winter_end_md: '02-28',
  coords_verified: false
};

const calls = { inserts: [], updates: [] };

vi.mock('../../lib/supabaseClient', () => {
  const makeBuilder = (table) => {
    let op = 'select';
    let payload = null;
    const b = {
      select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b, single: () => b,
      insert: (p) => { op = 'insert'; payload = p; return b; },
      update: (p) => { op = 'update'; payload = p; return b; },
      then: (resolve) => {
        if (table === 'adventures') return resolve({ data: [adventureRow], error: null });
        if (op === 'insert') {
          calls.inserts.push({ table, payload });
          return resolve({ data: { ...payload, id: 42 }, error: null });
        }
        if (op === 'update') {
          calls.updates.push({ table, payload });
          return resolve({ data: null, error: null });
        }
        return resolve({ data: [], error: null });
      }
    };
    return b;
  };
  return {
    supabase: {
      from: vi.fn((t) => makeBuilder(t)),
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
      storage: { from: vi.fn(() => ({ upload: vi.fn(async () => ({ data: {}, error: null })) })) },
      rpc: vi.fn(async () => ({ data: { id: 'server-1', status: 'submitted' }, error: null }))
    }
  };
});

const stableUser = { id: 'user-1', isGuest: false };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: stableUser }) }));
vi.mock('../../lib/googleMaps', () => ({ useSpotaGoogleMaps: () => ({ isLoaded: false }), DEFAULT_MAP_OPTIONS: {} }));
vi.mock('@react-google-maps/api', () => ({ GoogleMap: () => null, Marker: () => null }));
vi.mock('../../lib/badgeEngine', () => ({ checkBadges: vi.fn() }));
vi.mock('../../lib/imageUtils', () => ({ compressImage: vi.fn(async (f) => f) }));
vi.mock('../../lib/exifUtils', () => ({
  extractExifMeta: vi.fn(async () => ({ lat: 32.26, lng: 76.3537, takenAt: '2026-10-13T08:00:00.000Z' }))
}));

import { supabase } from '../../lib/supabaseClient';
import SafeTrekView from '../SafeTrekView';
import * as store from '../../lib/expeditionStore';

let watchCallback = null;

beforeEach(async () => {
  calls.inserts.length = 0;
  calls.updates.length = 0;
  vi.clearAllMocks();
  localStorage.clear();
  await store.clearExpeditionStore();
  watchCallback = null;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn((ok) => { watchCallback = ok; return 7; }),
      clearWatch: vi.fn()
    }
  });
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

const T0 = Date.now();
const fixAt = (i) => ({
  coords: { latitude: 32.25 + i * 0.002, longitude: 76.35, altitude: 2100 + i * 50, accuracy: 8 },
  timestamp: T0 + i * 30_000
});

describe('SafeTrekView: Expedition mode', () => {
  it('picks an adventure, records GPS, completes with a summit photo and submits', async () => {
    render(<MemoryRouter><SafeTrekView /></MemoryRouter>);

    // 1. Picker loads the catalog; selecting fills destination + shows AP preview
    const select = await screen.findByLabelText(/Expedition \(earn Adventure Points\)/i);
    await screen.findByRole('option', { name: /Triund · Dhauladhar/ });
    fireEvent.change(select, { target: { value: 'adv-triund' } });

    expect(screen.getByPlaceholderText('e.g. Mount Marcy Summit')).toHaveValue('Triund');
    expect(screen.getByTestId('expedition-summary')).toHaveTextContent('Earn ~108 AP');
    fireEvent.click(screen.getByLabelText(/Guided \/ with an agency/));

    // 2. Start the Safe Trek → recording starts, tracker appears
    fireEvent.change(screen.getByPlaceholderText('e.g. Jane Doe'), { target: { value: 'Mom' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. +1 555-0199'), { target: { value: '+91 99999 00000' } });
    fireEvent.click(screen.getByRole('button', { name: /Start Safe Trek/ }));

    expect(await screen.findByTestId('expedition-tracker')).toHaveTextContent('Expedition: Triund');
    expect(calls.inserts[0]).toMatchObject({ table: 'safe_treks', payload: { destination_name: 'Triund' } });
    expect(navigator.geolocation.watchPosition).toHaveBeenCalled();
    // Web/jsdom has no background plugin → foreground warning shown
    expect(screen.getByText(/Keep Spota open/)).toBeInTheDocument();

    // 3. GPS fixes arrive and are counted live
    await act(async () => { watchCallback(fixAt(0)); });
    await act(async () => { watchCallback(fixAt(1)); });
    await act(async () => { watchCallback(fixAt(2)); });
    await waitFor(() => {
      const grid = screen.getByTestId('expedition-tracker');
      expect(grid).toHaveTextContent('3GPS points');
      expect(grid).toHaveTextContent('100m climb');
    });

    // 4. Complete → modal → photo → EXIF hints → submit
    fireEvent.click(screen.getByRole('button', { name: /Complete Expedition/ }));
    const submitBtn = await screen.findByRole('button', { name: /Submit Expedition & End Trek/ });
    expect(submitBtn).toBeDisabled();

    const photo = new File(['jpeg'], 'summit.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('summit-photo-input'), { target: { files: [photo] } });
    expect(await screen.findByText(/Photo location found/)).toBeInTheDocument();

    fireEvent.click(submitBtn);

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));
    const [fn, args] = supabase.rpc.mock.calls[0];
    expect(fn).toBe('submit_attempt');
    expect(args).toMatchObject({
      p_adventure_id: 'adv-triund',
      p_safe_trek_id: 42,
      p_is_guided: true,
      p_checkins_on_time: true
    });
    expect(args.p_points).toHaveLength(3);
    expect(args.p_photo_paths[0]).toMatch(/^user-1\/.+\/0\.jpg$/);

    // 5. Safe Trek ended, back on setup with a success banner, GPS stopped
    expect(await screen.findByRole('status')).toHaveTextContent('Triund submitted for verification');
    expect(calls.updates).toContainEqual({ table: 'safe_treks', payload: { status: 'completed' } });
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('a plain Safe Trek (no adventure) keeps the original end-trek flow', async () => {
    render(<MemoryRouter><SafeTrekView /></MemoryRouter>);
    await screen.findByRole('option', { name: /Triund · Dhauladhar/ });

    fireEvent.change(screen.getByPlaceholderText('e.g. Mount Marcy Summit'), { target: { value: 'Evening walk' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Jane Doe'), { target: { value: 'Mom' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. +1 555-0199'), { target: { value: '+91 99999 00000' } });
    fireEvent.click(screen.getByRole('button', { name: /Start Safe Trek/ }));

    const endBtn = await screen.findByRole('button', { name: /End Trek Safely/ });
    expect(screen.queryByTestId('expedition-tracker')).toBeNull();
    expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();

    fireEvent.click(endBtn);
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Trek ended safely. Emergency mode deactivated.'));
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('"End without submitting" discards the recording and ends the trek', async () => {
    render(<MemoryRouter><SafeTrekView /></MemoryRouter>);
    const select = await screen.findByLabelText(/Expedition \(earn Adventure Points\)/i);
    await screen.findByRole('option', { name: /Triund · Dhauladhar/ });
    fireEvent.change(select, { target: { value: 'adv-triund' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Jane Doe'), { target: { value: 'Mom' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. +1 555-0199'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Start Safe Trek/ }));
    await screen.findByTestId('expedition-tracker');
    await act(async () => { watchCallback(fixAt(0)); });

    fireEvent.click(screen.getByRole('button', { name: /Complete Expedition/ }));
    fireEvent.click(await screen.findByRole('button', { name: /End without submitting/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm: delete this recording/ }));

    await screen.findByRole('button', { name: /Start Safe Trek/ });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(await store.listAttempts()).toHaveLength(0);
  });
});
