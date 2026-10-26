import { useRef, useState } from 'react';

const TABS = [
  { id: 'now', label: 'Now' },
  { id: 'fires', label: 'Fires' },
  { id: 'layers', label: 'Layers' },
  { id: 'report', label: 'Report' },
  { id: 'past', label: 'Proof' },
];

const MIN = { w: 260, h: 220 };
const MAX = { w: 620, h: 1400 };

/**
 * The detail drawer. Drag it anywhere by its header and pull the bottom-right
 * corner to resize it, so it never has to sit on top of the part of the map
 * you are reading.
 */
export default function Sheet({ open, tab, onTab, onClose, children }) {
  const [moved, setMoved] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 330, h: 540 });
  const from = useRef(null);

  function startMove(e) {
    if (e.target.closest('button')) return;   // tabs and close stay clickable
    from.current = { kind: 'move', x: e.clientX - moved.x, y: e.clientY - moved.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function startResize(e) {
    from.current = { kind: 'size', x: e.clientX - size.w, y: e.clientY - size.h };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function drag(e) {
    const grab = from.current;
    if (!grab) return;
    if (grab.kind === 'move') {
      setMoved({ x: e.clientX - grab.x, y: e.clientY - grab.y });
    } else {
      setSize({
        w: clamp(e.clientX - grab.x, MIN.w, MAX.w),
        h: clamp(e.clientY - grab.y, MIN.h, MAX.h),
      });
    }
  }

  const release = () => { from.current = null; };

  return (
    <aside
      className={`sheet ${open ? 'open' : ''}`}
      aria-hidden={!open}
      style={{ transform: `translate(${moved.x}px, ${moved.y}px)`, width: size.w, height: size.h }}
    >
      <header
        className="sheet-head"
        onPointerDown={startMove}
        onPointerMove={drag}
        onPointerUp={release}
      >
        <span className="sheet-grab" />
        <nav className="sheet-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'on' : ''}
              onClick={() => onTab(t.id)}
              aria-pressed={tab === t.id}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button className="sheet-x" onClick={onClose} aria-label="Hide the details">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      <div className="sheet-body">{children}</div>

      <span
        className="sheet-resize"
        onPointerDown={startResize}
        onPointerMove={drag}
        onPointerUp={release}
        title="Drag to resize"
        aria-hidden="true"
      />
    </aside>
  );
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
