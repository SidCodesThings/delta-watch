import { RISK_COLORS } from '../lib/risk.js';

const LEVELS = ['low', 'moderate', 'high', 'extreme'];

const LAYERS = [
  { key: 'grid', label: 'Risk numbers and heat', note: 'Every area scored, dangerous ones glowing' },
  { key: 'zones', label: 'Hazard zones', note: 'CAL FIRE terrain ratings' },
  { key: 'hotspots', label: 'Hotspots', note: 'NASA satellite detections, 24 h' },
  { key: 'reports', label: 'My reports', note: 'Smoke you have photographed' },
];

/**
 * What the map draws. Everything that can be shown or hidden lives here, with
 * the scale underneath so the colours have a key in the same place.
 */
export default function LayersPanel({ layers, counts, basemap, tilted, onToggle, onBasemap, onTilt }) {
  return (
    <>
      <section className="card">
        <h2>Show on the map</h2>

        {LAYERS.map(({ key, label, note }) => (
          <button
            key={key}
            className={`switch-row ${layers[key] ? 'on' : ''}`}
            onClick={() => onToggle(key)}
            role="switch"
            aria-checked={layers[key]}
          >
            <span className="grow">
              <b>{label}</b>
              <small>{note}</small>
            </span>
            {counts[key] > 0 && <span className="count num">{counts[key]}</span>}
            <span className="toggle" aria-hidden="true"><i /></span>
          </button>
        ))}
      </section>

      <section className="card">
        <h2>Base map</h2>

        <button
          className={`switch-row ${basemap === 'satellite' ? 'on' : ''}`}
          onClick={onBasemap}
          role="switch"
          aria-checked={basemap === 'satellite'}
        >
          <span className="grow">
            <b>Satellite imagery</b>
            <small>Photographs instead of a drawn map</small>
          </span>
          <span className="toggle" aria-hidden="true"><i /></span>
        </button>

        <button
          className={`switch-row ${tilted ? 'on' : ''}`}
          onClick={onTilt}
          role="switch"
          aria-checked={tilted}
        >
          <span className="grow">
            <b>3D terrain</b>
            <small>Tilt onto real elevation</small>
          </span>
          <span className="toggle" aria-hidden="true"><i /></span>
        </button>
      </section>

      <section className="card">
        <h2>Fire Risk Index</h2>
        <div className="rs-scale">
          {LEVELS.map((level) => <i key={level} style={{ background: RISK_COLORS[level] }} />)}
        </div>
        <div className="rs-ticks"><span>0</span><span>40</span><span>55</span><span>70</span><span>100</span></div>
        <p className="muted" style={{ margin: '9px 0 0', fontSize: 12 }}>
          Every area carries its score as a number, calm ones included — each is one
          live weather reading, out of 100. Heat is only painted from 38 upwards, so
          an ordinary day looks like an ordinary map and the places worth worrying
          about are the only ones that glow.
        </p>
      </section>
    </>
  );
}
