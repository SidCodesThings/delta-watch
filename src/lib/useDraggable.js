import { useRef, useState } from 'react';

/**
 * Lets a floating panel be dragged out of the way, so neither the toolbar nor
 * the time bar can end up parked over the part of the map you want to read.
 * Both use this, so the behaviour is written once.
 *
 * Returns the style for the panel and the handlers for its grab handle.
 */
export function useDraggable() {
  const [moved, setMoved] = useState({ x: 0, y: 0 });
  const from = useRef(null);

  return {
    style: { transform: `translate(${moved.x}px, ${moved.y}px)` },
    grip: {
      onPointerDown: (e) => {
        from.current = { x: e.clientX - moved.x, y: e.clientY - moved.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e) => {
        if (!from.current) return;
        setMoved({ x: e.clientX - from.current.x, y: e.clientY - from.current.y });
      },
      onPointerUp: () => { from.current = null; },
    },
  };
}
