import { RISK_COLORS, SIGNAL_LABELS } from '../lib/risk.js';
import { compass } from '../lib/spread.js';
import { adviseFor } from '../lib/advice.js';

/**
 * Everything about one spot, in one place. It follows your cursor across the
 * map, so moving over the hills and back down to the delta rewrites the whole
 * panel; take the cursor off the map and it goes back to wherever you are.
 */
export default function SpotPanel({ weather, score, label, hovering, pinned, hotspots, at }) {
  const advice = adviseFor(weather, score, hotspots, at);
  const color = RISK_COLORS[advice.level];

  return (
    <section className="card glass spot">
      <h2>{pinned ? 'Held on this point' : hovering ? 'Under your cursor' : 'Where you are'}</h2>

      <div className="gauge-row">
        <Gauge score={score} color={color} />
        <div>
          <div className="level" style={{ color }}>{advice.level}</div>
          <div className="where"><b>{label}</b></div>
          <div className="where">
            {Math.round(weather.temp)}&deg;F &middot; {Math.round(weather.humidity)}% humidity
            &middot; gusts {Math.round(weather.windGust)} {compass(weather.windFromDeg)}
          </div>
          {/* The exact spot, not the middle of the square it falls in. */}
          {hovering && (
            <div className="where coords">{at.lat.toFixed(4)}, {at.lng.toFixed(4)}</div>
          )}
        </div>
      </div>

      {hovering && (
        <p className="muted small hold-hint">
          {pinned
            ? 'Held. Double-click the map to let it follow the cursor again.'
            : 'Double-click the map to hold the reading on one point.'}
        </p>
      )}

      {advice.warnings.map((w) => (
        <div className={`alert ${w.level}`} key={w.title}>
          <b>{w.title}</b>
          <span>{w.detail}</span>
        </div>
      ))}

      <h3 className="sub">Why</h3>
      <div className="bars">
        {advice.drivers.map((d) => (
          <div className="bar-row" key={d.key}>
            <span>{d.label}</span>
            <span className="bar">
              <i style={{ width: `${Math.max(2, d.share * 100)}%`, background: color }} />
            </span>
          </div>
        ))}
      </div>
      <p className="muted sub-note">
        {advice.drivers[0].share > 0.05
          ? `${advice.drivers[0].label.toLowerCase()} is doing the most here.`
          : 'Nothing is pushing the risk up right now.'}
      </p>

      <h3 className="sub">Take with you</h3>
      <ul className="rules">
        {advice.kit.map((item) => <li key={item}>{item}</li>)}
      </ul>

      {advice.nearest && (
        <>
          <h3 className="sub">Nearest satellite detection</h3>
          <p className="muted" style={{ margin: 0 }}>
            <b style={{ color: 'var(--ink)' }}>
              {advice.nearest.miles.toFixed(1)} mi {advice.nearest.toward}
            </b>
            {' '}of here. On this wind it would run <b style={{ color: 'var(--ink)' }}>{advice.nearest.heading}</b>.
            If it reaches you, leave {advice.nearest.escape} &mdash; crosswind, never ahead of it.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * A ring that fills in proportion to the score. It is drawn in its own square
 * coordinate space and scaled by CSS, so the ring and the number inside it
 * stay concentric whatever size the panel gives it.
 */
function Gauge({ score, color }) {
  const SIZE = 100;
  const STROKE = 9;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="gauge">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%" aria-hidden="true">
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={radius}
          fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, score) / 100)}
          style={{ transition: 'stroke-dashoffset .45s cubic-bezier(.2,.8,.2,1), stroke .3s' }}
        />
      </svg>
      <div className="gauge-face">
        <b style={{ color }}>{score}</b>
        <span>of 100</span>
      </div>
    </div>
  );
}

export { SIGNAL_LABELS };
