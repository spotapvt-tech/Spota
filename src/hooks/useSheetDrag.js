import { useCallback, useRef } from 'react';

// Drag-to-dismiss for bottom sheets. Attach `handleProps` to the grabber only,
// so the sheet body keeps native scrolling and the map behind keeps its own
// pan/zoom gestures. The sheet follows the finger with a transform (no
// layout), then either dismisses or springs back.
const DISMISS_DISTANCE = 90; // px
const DISMISS_VELOCITY = 0.6; // px/ms

export default function useSheetDrag(onDismiss) {
  const sheetRef = useRef(null);
  const drag = useRef(null);

  const setOffset = (y, animate) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform var(--dur-sheet) var(--ease-settle)' : 'none';
    el.style.transform = y ? `translateY(${y}px)` : '';
  };

  const onPointerDown = useCallback((e) => {
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointer already released */ }
    const el = sheetRef.current;
    if (el) el.style.animation = 'none'; // stop the entrance animation overriding our transform
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const dy = Math.max(0, e.clientY - d.startY); // only downward
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setOffset(dy, false);
  }, []);

  const end = useCallback((e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dy = Math.max(0, e.clientY - d.startY);
    if (dy > DISMISS_DISTANCE || d.v > DISMISS_VELOCITY) {
      onDismiss();
    } else {
      setOffset(0, true);
    }
  }, [onDismiss]);

  return {
    sheetRef,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      style: { touchAction: 'none', cursor: 'grab' },
    },
  };
}
