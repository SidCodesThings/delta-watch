// The watch board: which places are closest to ignition right now.
//
// The map answers "how bad is it here". This answers the question a farmer or
// a fire district actually asks first -- "where is the worst of it today, and
// is it coming at me" -- by ranking every square we have scored, naming the
// place it sits in, and saying how far away it is.
//
// Nothing here invents a threshold. It reuses the same scoring and the same
// bands as the map, so a place on this list is red on the map too.

// The import attribute is required by Node, which runs the tests; the
// bundler is happy either way.
import places from '../data/places.json' with { type: 'json' };
import { STATE } from './config.js';
import { signals, scoreRisk, riskLevel, deltaT, SIGNAL_LABELS } from './risk.js';
import { distanceMiles, bearing, compass } from './spread.js';

/** From here up, a place is worth naming out loud. Same band as the legend. */
export const WATCH_SCORE = 55;   // 'high'

/**
 * Where a square is, in words.
 *
 * Inside California: the nearest town, and the county behind it. "Near
 * Oakdale, Stanislaus County" is somewhere a person can picture and drive
 * to; a county on its own covers a thousand square miles. Outside the state
 * a square is 170 miles across, and the honest answer is the state.
 *
 * @returns {{name: string, region: string|null}|null}
 */
export function nameFor(point) {
  if (!point) return null;
  const [west, south, east, north] = STATE.bbox;
  const inState = point.lng >= west && point.lng <= east && point.lat >= south && point.lat <= north;

  if (!inState) {
    const state = nearest(places.states, point);
    return state ? { name: state.name, region: null } : null;
  }

  // The town carries its own county, worked out against the real boundaries
  // when the list was built. Picking the nearest town and the nearest county
  // separately paired Dos Palos with San Benito, which it is not in.
  const town = nearest(places.towns, point);
  if (town) return { name: `near ${town.name}`, region: town.county };

  const county = nearest(places.counties, point);
  return county ? { name: county.name, region: null } : null;
}

/** Closest of a list to a point. Degrees, squared, never square-rooted:
 *  these are only ever compared against each other. */
function nearest(list, point) {
  let best = null;
  let bestGap = Infinity;
  for (const place of list) {
    const gap = (place.lat - point.lat) ** 2 + ((place.lng - point.lng) * 0.79) ** 2;
    if (gap < bestGap) { bestGap = gap; best = place; }
  }
  return best;
}

/**
 * Rank scored squares into a watch list, one entry per place.
 *
 * `within` keeps it to your own corner of the map; `skip` leaves out places
 * another list has already named, so the two boards never say the same thing
 * twice.
 *
 * @param {object[]} cells   scored squares, each with `center` and `weather`
 * @param {{from?: {lat,lng}, limit?: number, within?: number, skip?: string[]}} options
 * @returns {{name, score, level, delta, driver, miles, dir, at}[]}
 */
export function watchList(cells, { from = null, limit = 6, within = null, skip = [] } = {}) {
  const seen = new Map();
  const taken = new Set(skip);

  const ranked = cells
    // A square with no reading has nothing to say, and asking it anyway is
    // how this function would throw.
    .filter((cell) => cell.weather)
    .map((cell) => ({ cell, score: cell.score ?? scoreRisk(cell.weather).score }))
    .filter(({ cell }) => within === null || !from || distanceMiles(from, cell.center) <= within)
    .sort((a, b) => b.score - a.score);

  for (const { cell, score } of ranked) {
    if (seen.size >= limit) break;
    const place = nameFor(cell.center);
    if (!place) continue;

    // One entry per county -- or per state, outside California. Six towns in
    // the same county is a list about one place pretending to be six.
    const key = place.region ?? place.name;
    if (seen.has(key) || taken.has(key)) continue;

    const parts = signals(cell.weather);
    const [driver] = Object.entries(parts).sort((a, b) => b[1] - a[1]);

    seen.set(key, {
      name: place.name,
      region: place.region,
      score,
      level: riskLevel(score),
      delta: deltaT(cell.weather).triggered,
      driver: SIGNAL_LABELS[driver[0]],
      at: cell.center,
      miles: from ? Math.round(distanceMiles(from, cell.center)) : null,
      dir: from ? compass(bearing(from, cell.center)) : null,
    });
  }

  return [...seen.values()];
}

/**
 * The one line worth interrupting someone for: the nearest place at or above
 * the watch level. Returns null when there is nothing to say, which on a mild
 * day is most of the time -- an alert that fires every day is wallpaper.
 */
export function nearestWarning(list, withinMiles = 80) {
  const close = list.filter((p) => p.score >= WATCH_SCORE
    && (p.miles === null || p.miles <= withinMiles));
  if (!close.length) return null;

  // Nearest, not worst: a 70 next door matters more than an 80 three counties away.
  return close.reduce((a, b) => ((b.miles ?? 0) < (a.miles ?? 0) ? b : a));
}
