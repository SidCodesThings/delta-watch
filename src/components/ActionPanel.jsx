import { useState } from 'react';
import { compass, distanceMiles, bearing, escapeRoutes } from '../lib/spread.js';

/**
 * What to do about a specific fire: call it in with the details a dispatcher
 * needs, warn the people downwind, and get clear of the fire's path.
 */
export default function ActionPanel({ fire, cone, location, onClear }) {
  const [done, setDone] = useState('');
  const away = distanceMiles(location, fire);
  const dirToFire = compass(bearing(location, fire));
  const heading = compass(cone.heading);
  const [outA, outB] = escapeRoutes(cone.heading);

  // A fire you are standing next to is, by definition, your problem.
  const atMySpot = away < 0.5;
  const inMyPath = atMySpot || isInPath(bearing(fire, location), cone.heading);
  const whereItIs = atMySpot ? 'right where you are' : `${away.toFixed(1)} mi ${dirToFire} of you`;

  const script =
    `Reporting a fire in San Joaquin County. ` +
    `Location ${fire.lat.toFixed(4)}, ${fire.lng.toFixed(4)} ` +
    `-- ${atMySpot ? 'I am at that spot' : `about ${away.toFixed(1)} miles ${dirToFire} of me`}. ` +
    `Wind is pushing it ${heading} at roughly ${cone.miles.toFixed(1)} miles per hour.`;

  const warning =
    `FIRE WARNING: fire at ${fire.lat.toFixed(4)}, ${fire.lng.toFixed(4)} ` +
    `moving ${heading}, about ${cone.miles.toFixed(1)} mi/hr. ` +
    `If you are ${heading} of that point, get out now. Sent from DeltaWatch.`;

  return (
    <section className="card glass">
      <h2>Act on this fire</h2>

      <p style={{ margin: '0 0 11px' }}>
        {fire.kind === 'hotspot' ? 'Satellite hotspot' : 'Smoke report'} {whereItIs}, heading{' '}
        <b>{heading}</b> at about <span className="num">{cone.miles.toFixed(1)}</span> mi/hr.
      </p>

      {inMyPath && (
        <div className="banner warn">
          <div>
            <strong>You are in its path</strong>
            <div className="body">Leave crosswind — {outA} or {outB}. Never drive ahead of a fire.</div>
          </div>
        </div>
      )}

      <div className="row" style={{ marginBottom: 11 }}>
        <a href="tel:911" style={{ textDecoration: 'none', flex: 1 }}>
          <button className="btn danger wide">Call 911</button>
        </a>
        <button className="btn" onClick={() => setDone(copy(script))}>Copy details</button>
      </div>

      <p className="muted" style={{ margin: '0 0 11px' }}>
        <strong style={{ color: 'var(--ink)' }}>Read this to the dispatcher:</strong> {script}
      </p>

      <div className="row">
        <button className="btn primary grow" onClick={() => setDone(share(warning))}>
          Warn people downwind
        </button>
        <button className="btn" onClick={onClear}>Clear</button>
      </div>

      {done && <p className="muted" style={{ marginBottom: 0, marginTop: 9 }}>{done}</p>}

      <h2 style={{ marginTop: 17 }}>Farmer checklist</h2>
      <ul className="rules">
        <li>Shut down every engine, mower and welder in the area now</li>
        <li>Move tractors and trailers onto bare dirt, away from standing crop</li>
        <li>Open gates so livestock and fire crews can move</li>
        <li>Leave {outA} or {outB} — crosswind, never ahead of the head fire</li>
        <li>Tell your neighbours {heading} of the fire before you leave</li>
      </ul>
    </section>
  );
}

/** Is the fire's projected path pointing at me? */
function isInPath(bearingToMe, heading) {
  const off = Math.abs(((bearingToMe - heading + 540) % 360) - 180);
  return off < 35;
}

function copy(text) {
  navigator.clipboard?.writeText(text);
  return 'Copied to your clipboard.';
}

/** Phones offer a share sheet (text, WhatsApp, email); desktops just get a copy. */
function share(text) {
  if (!navigator.share) return copy(text);
  navigator.share({ text }).catch(() => {});
  return 'Opened your share sheet.';
}
