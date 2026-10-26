import { compass, distanceMiles, bearing } from '../lib/spread.js';
import { FIRES, longDate } from '../lib/hindsight.js';
import { nameFor } from '../lib/watch.js';

/**
 * Fires that happened: what the satellite saw in the last day, what you have
 * reported yourself, and the fires this part of the state remembers.
 *
 * Every row is dated. A fire list where some entries are from this afternoon
 * and others from 2018 is only readable if each one says which.
 */
export default function FeatureList({ hotspots, reports, location, onSelectFire, onReplay }) {
  // The satellite feed is national, so only the ones near enough to matter
  // are worth listing. The rest stay on the map.
  const nearest = [...hotspots]
    .sort((a, b) => distanceMiles(location, a) - distanceMiles(location, b))
    .slice(0, 5);

  // Past fires, nearest first. These are the ones the Proof tab can replay.
  const past = FIRES
    .map((fire) => ({ ...fire, miles: Math.round(distanceMiles(location, fire.at)) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, 4);

  return (
    <section className="happened">
      <h3 className="panel-sub">Happened — last 24 hours</h3>

      {nearest.length === 0 && (
        <p className="muted small">No satellite detections within range right now.</p>
      )}

      {nearest.map((spot, i) => (
        <Row
          key={`hot-${i}`}
          dot="#ff3b30"
          title={`Satellite detection ${i + 1}`}
          sub={`${when(spot.detectedAt)} · ${spot.power} MW · ${where(spot)}`}
          right={from(location, spot)}
          onClick={() => onSelectFire({ ...spot, kind: 'hotspot' })}
        />
      ))}

      {hotspots.length > nearest.length && (
        <p className="muted small">
          {hotspots.length - nearest.length} more detections further out, all shown on the map.
        </p>
      )}

      {reports.length > 0 && <h3 className="panel-sub">Your reports</h3>}
      {reports.map((report) => (
        <Row
          key={`rep-${report.id}`}
          dot="#ffb020"
          title="Smoke you reported"
          sub={`${when(report.at ?? report.id)} · ${report.note || 'No note'}`}
          right={from(location, report)}
          onClick={() => onSelectFire({ ...report, kind: 'report' })}
        />
      ))}

      <h3 className="panel-sub">Happened — fires this ground remembers</h3>
      {past.map((fire) => (
        <Row
          key={fire.name}
          dot="#8a6bd1"
          title={fire.name}
          sub={`${longDate(fire.date)} · ${fire.where}`}
          right={`${fire.miles} mi ${compass(bearing(location, fire.at))}`}
          onClick={() => onReplay(fire)}
        />
      ))}
      <p className="muted small">
        Pick one to re-run the map on the weather of the day it started.
      </p>
    </section>
  );
}

function Row({ dot, title, sub, right, onClick }) {
  return (
    <button className="feature-row" onClick={onClick}>
      <span className="swatch" style={{ background: dot }} />
      <span className="grow">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <span className="num">{right}</span>
    </button>
  );
}

/** A detection is hours old at most, so the day plus the clock is enough. */
function when(date) {
  const at = date instanceof Date ? date : new Date(date ?? NaN);
  if (Number.isNaN(+at)) return 'time unknown';
  return at.toLocaleString([], {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

/** The nearest town to a detection, so it is somewhere rather than a number. */
function where(point) {
  const place = nameFor(point);
  if (!place) return `${point.lat.toFixed(2)}, ${point.lng.toFixed(2)}`;
  return place.region ? `${place.name}, ${place.region}` : place.name;
}

/** "4.2 mi NE" -- how far the thing is from wherever the user is standing. */
const from = (location, point) =>
  `${distanceMiles(location, point).toFixed(1)} mi ${compass(bearing(location, point))}`;
