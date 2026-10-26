import { RISK_COLORS, riskLevel, formatHour } from '../lib/risk.js';

/**
 * Today, hour by hour, inside the panel rather than across the whole screen.
 * Dragging it re-colours the map so you can watch the afternoon build.
 */
export default function HourStrip({ hour, nowHour, averages, onHour, onOpen }) {
  const ready = averages.length > 0;
  const shown = hour ?? nowHour;

  const track = ready
    ? `linear-gradient(to right, ${averages
        .flatMap((score, i) => {
          const color = RISK_COLORS[riskLevel(score)];
          return [`${color} ${(i / 24) * 100}%`, `${color} ${((i + 1) / 24) * 100}%`];
        })
        .join(', ')})`
    : 'rgba(255,255,255,.1)';

  return (
    <section className="card">
      <h2>Through today</h2>

      <div className="hour-head">
        <span>Map shows <b>{hour === null ? 'now' : formatHour(shown)}</b></span>
        <span className="num">{ready ? `${averages[shown]}/100` : 'drag to load'}</span>
      </div>

      <div className="scrub-track" style={{ background: track }}>
        <input
          type="range" min="0" max="23" value={shown}
          onPointerDown={onOpen}
          onFocus={onOpen}
          onChange={(e) => ready && onHour(Number(e.target.value))}
          aria-label="Hour of today shown on the map"
        />
      </div>

      <div className="scrub-ticks"><span>12 AM</span><span>6 AM</span><span>Noon</span><span>6 PM</span><span>11 PM</span></div>

      {hour !== null && (
        <button className="btn wide" style={{ marginTop: 10 }} onClick={() => onHour(null)}>
          Back to now
        </button>
      )}
    </section>
  );
}
