import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';

// Vitest compiles JSX with the classic runtime here, so components need React in scope.
globalThis.React = React;
import { render, screen, act } from '@testing-library/react';
import ARView from '../ARView';

const me = [28.6139, 77.209];
const spots = [
  { id: 'n', title: 'North Cafe', category: 'cafe', latitude: 28.6239, longitude: 77.209 },
  { id: 'e', title: 'East View', category: 'viewpoint', latitude: 28.6139, longitude: 77.219 },
  { id: 'far', title: 'Mumbai Spot', category: 'cafe', latitude: 19.07, longitude: 72.87 },
];

let stopTrack;
let rafCallbacks;

function flushFrames(n = 40) {
  act(() => {
    for (let i = 0; i < n; i += 1) {
      const cbs = rafCallbacks;
      rafCallbacks = [];
      cbs.forEach((cb) => cb(performance.now()));
    }
  });
}

beforeEach(() => {
  stopTrack = vi.fn();
  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafCallbacks.push(cb); return rafCallbacks.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { rafCallbacks = []; });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
  });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() },
  });
  window.ondeviceorientationabsolute = null; // jsdom: pretend the absolute event exists
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.ondeviceorientationabsolute;
});

function orient(alpha) {
  const e = new Event('deviceorientationabsolute');
  Object.assign(e, { alpha, beta: 90, gamma: 0 });
  act(() => { window.dispatchEvent(e); });
}

describe('ARView', () => {
  it('stops the camera tracks when closed (no stale-closure leak)', async () => {
    const { unmount } = render(<ARView spots={spots} userLocation={me} onClose={() => {}} onSelectSpot={() => {}} />);
    await act(async () => {});
    unmount();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('only mounts spots within the AR radius', () => {
    render(<ARView spots={spots} userLocation={me} onClose={() => {}} onSelectSpot={() => {}} />);
    expect(screen.getByText('North Cafe')).toBeTruthy();
    expect(screen.getByText('East View')).toBeTruthy();
    expect(screen.queryByText('Mumbai Spot')).toBeNull();
  });

  it('shows the spot ahead and hides the one off to the side', () => {
    render(<ARView spots={spots} userLocation={me} onClose={() => {}} onSelectSpot={() => {}} />);
    orient(0); // facing north
    flushFrames();
    const north = screen.getByText('North Cafe').closest('.ar-spot-marker');
    const east = screen.getByText('East View').closest('.ar-spot-marker');
    expect(north.style.visibility).toBe('visible');
    expect(north.style.transform).toContain('translate3d');
    expect(east.style.visibility).toBe('hidden');

    orient(270); // alpha 270 → camera faces east
    flushFrames(80);
    expect(east.style.visibility).toBe('visible');
    expect(north.style.visibility).toBe('hidden');
  });

  it('waits for GPS instead of falling back to Delhi', () => {
    render(<ARView spots={spots} userLocation={null} onClose={() => {}} onSelectSpot={() => {}} />);
    expect(screen.getByText(/Waiting for GPS/)).toBeTruthy();
    expect(screen.queryByText('North Cafe')).toBeNull();
  });
});
