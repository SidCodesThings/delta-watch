import { COUNTY, US_BOUNDS } from '../lib/config.js';

/** The stack of round buttons down the right edge of the map. */
export default function ControlRail({ map, tilted, sheetOpen, layersOpen, onTilt, onLocate, onSheet, onLayers }) {
  if (!map) return null;

  return (
    <div className="rail-right">
      <Round on={tilted} label={tilted ? 'Back to the flat map' : 'Tilt onto the real terrain'} onClick={onTilt}>
        <svg viewBox="0 0 24 24" {...s}><path d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7L12 2.8Z" /><path d="M3.5 7 12 11.4 20.5 7M12 11.4V21.2" /></svg>
      </Round>

      <Round on={sheetOpen} label="Show the details" onClick={onSheet}>
        <svg viewBox="0 0 24 24" {...s}><path d="M4 7h16M4 12h16M4 17h10" /></svg>
      </Round>

      <Round on={layersOpen} label="Layers" onClick={onLayers}>
        <svg viewBox="0 0 24 24" {...s}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3.5 12.5 8.5 4.7 8.5-4.7" /></svg>
      </Round>

      <Round label="Go to my location" onClick={onLocate}>
        <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="3.4" /><circle cx="12" cy="12" r="8.4" opacity=".45" /><path d="M12 1.6v2.6M12 19.8v2.6M1.6 12h2.6M19.8 12h2.6" /></svg>
      </Round>

      <Round label="The whole country" onClick={() => map.fitBounds([[US_BOUNDS[0][1], US_BOUNDS[0][0]], [US_BOUNDS[1][1], US_BOUNDS[1][0]]], { padding: 40 })}>
        <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 2.6 15 0 18-2.6-3-2.6-15.4 0-18Z" /></svg>
      </Round>

      <div className="round-pair">
        <button onClick={() => map.zoomIn()} aria-label="Zoom in">
          <svg viewBox="0 0 24 24" {...s}><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button onClick={() => map.zoomOut()} aria-label="Zoom out">
          <svg viewBox="0 0 24 24" {...s}><path d="M5 12h14" /></svg>
        </button>
      </div>

      <Round label="Back to the home county" onClick={() => map.easeTo({ center: [COUNTY.center[1], COUNTY.center[0]], zoom: COUNTY.zoom + 1 })}>
        <svg viewBox="0 0 24 24" {...s}><path d="M4 11.2 12 4l8 7.2" /><path d="M6.4 10v9.2h11.2V10" /></svg>
      </Round>
    </div>
  );
}

const Round = ({ on, label, onClick, children }) => (
  <button className={`round ${on ? 'on' : ''}`} onClick={onClick} title={label} aria-label={label} aria-pressed={on}>
    {children}
  </button>
);

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' };
