import { RISK_COLORS, RISK_RANGES } from '../lib/risk.js';
import { WATCH_SCORE } from '../lib/watch.js';

const LEVEL_WORD = { low: 'Low', moderate: 'Moderate', high: 'High', extreme: 'Extreme' };

/**
 * Fires that could happen: where the worst of it is today.
 *
 * In two parts, and the order is the point. The hottest corner of the state
 * is interesting; the county you farm is the one you act on, and a single
 * list sorted by score buries home under whatever stretch of desert is
 * baking today. So your own ground comes first, the rest of California
 * follows, and no place appears twice.
 *
 * Every row carries the day it describes, because a risk number with no
 * date on it is the kind of thing people screenshot in October and share in
 * July.
 */
export default function WatchBoard({ nearby, elsewhere, elsewhereLabel, near, today, onGoTo }) {
  if (!nearby.length && !elsewhere.length) return null;

  return (
    <section className="watch">
      <header className="watch-head">
        <h3 className="panel-sub">Could happen — within {near} miles</h3>
        <span className="muted small">{today}</span>
      </header>

      {nearby.length === 0 && (
        <p className="muted small">Nothing scored near you yet.</p>
      )}
      {nearby.length > 0 && nearby.every((p) => p.score < WATCH_SCORE) && (
        <p className="muted small">
          Nowhere around here is in the high band today. These are simply the warmest,
          driest places nearby — worth knowing, not worth acting on.
        </p>
      )}
      <Rows list={nearby} onGoTo={onGoTo} />

      {elsewhere.length > 0 && (
        <>
          <h3 className="panel-sub">{elsewhereLabel}</h3>
          <Rows list={elsewhere} onGoTo={onGoTo} />
        </>
      )}
    </section>
  );
}

function Rows({ list, onGoTo }) {
  return (
    <ul className="watch-list">
      {list.map((place) => (
        <li key={place.region ?? place.name}>
          <button type="button" className="watch-row" onClick={() => onGoTo(place)}>
            <span className="watch-score" style={{ color: RISK_COLORS[place.level] }}>
              {place.score}
            </span>
            <span className="watch-where">
              <strong>{place.name}</strong>
              <span className="muted small">
                {place.region ? `${place.region} · ` : ''}
                <span style={{ color: RISK_COLORS[place.level] }}>
                  {LEVEL_WORD[place.level]} ({RISK_RANGES[place.level]})
                </span>
                {place.delta && <em className="delta-flag"> · Delta T</em>}
              </span>
              <span className="muted small">{place.driver} leading</span>
            </span>
            {place.miles !== null && (
              <span className="muted small watch-far">{place.miles} mi<br />{place.dir}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
