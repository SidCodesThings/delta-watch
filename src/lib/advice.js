// What the numbers actually mean for someone about to walk outside.
//
// Everything here is derived from the same risk model the map uses -- no new
// thresholds, no second opinion. Give it a weather reading and a score and it
// says what to carry, what to watch for, and what is driving the number.

import { signals, SIGNAL_LABELS, deltaT, riskLevel } from './risk.js';
import { compass, distanceMiles, bearing, escapeRoutes } from './spread.js';

const HARD = { gustMph: 25, humidityPct: 15 };

/**
 * @param {Weather} weather   conditions at the spot being asked about
 * @param {number}  score     that spot's 0-100 risk
 * @param {object[]} hotspots every satellite detection we know of
 * @param {{lat:number,lng:number}} at  the spot itself
 */
export function adviseFor(weather, score, hotspots, at) {
  return {
    level: riskLevel(score),
    warnings: warningsFor(weather, score),
    kit: kitFor(weather, score),
    drivers: driversFor(weather),
    nearest: nearestFire(hotspots, at, weather),
  };
}

/** The conditions worth saying out loud, worst first. */
function warningsFor(weather, score) {
  const out = [];
  const delta = deltaT(weather);

  if (weather.windGust >= HARD.gustMph) {
    out.push({
      level: 'stop',
      title: `Gusts ${Math.round(weather.windGust)} mph`,
      detail: `Above ${HARD.gustMph} mph a spark outruns you. No equipment in dry grass.`,
    });
  }
  if (weather.humidity <= HARD.humidityPct) {
    out.push({
      level: 'stop',
      title: `Humidity ${Math.round(weather.humidity)}%`,
      detail: `Below ${HARD.humidityPct}% dead grass lights almost instantly.`,
    });
  }
  if (delta.triggered) {
    out.push({
      level: 'warn',
      title: 'Delta T warning',
      detail: `${delta.tempRise.toFixed(0)}°F hotter and ${delta.humidityDrop.toFixed(0)} points drier than the last three days — the dry-wind pattern.`,
    });
  }
  if (weather.daysSinceRain >= 14) {
    out.push({
      level: 'warn',
      title: `${weather.daysSinceRain}+ days without rain`,
      detail: 'Fine fuels are fully cured. Anything that sparks will take.',
    });
  }
  if (!out.length && score < 40) {
    out.push({ level: 'ok', title: 'No active warnings', detail: 'Conditions are mild for this time of year.' });
  }
  return out;
}

/** What to have on you, scaled to how bad the day is. */
function kitFor(weather, score) {
  const kit = ['Phone, charged', 'Water — more than you think'];

  if (weather.temp >= 90) kit.push('Shade and a hat; heat is the bigger danger today');
  if (weather.humidity < 25) kit.push('Lip balm and eye drops — the air is very dry');
  if (weather.windGust >= 20) kit.push('Eye protection; grit carries in these gusts');
  if (score >= 40) {
    kit.push('Extinguisher and a shovel if you are running equipment');
    kit.push('Long sleeves and boots, not shorts and sneakers');
  }
  if (score >= 55) kit.push('N95 mask in case smoke drifts in');
  if (score >= 70) kit.push('Keys in the vehicle, parked facing out');
  if (score < 40) kit.push('Normal precautions — no parking on dry grass');
  return kit;
}

/** Which of the four signals is actually pushing the number up. */
function driversFor(weather) {
  const parts = signals(weather);
  return Object.entries(parts)
    .map(([key, value]) => ({ key, label: SIGNAL_LABELS[key], share: value }))
    .sort((a, b) => b.share - a.share);
}

/** The closest satellite detection, and which way it would run. */
function nearestFire(hotspots, at, weather) {
  if (!hotspots.length) return null;

  const closest = hotspots.reduce((best, spot) =>
    distanceMiles(at, spot) < distanceMiles(at, best) ? spot : best);

  const heading = (weather.windFromDeg + 180) % 360;
  const [outA, outB] = escapeRoutes(heading);

  return {
    spot: closest,
    miles: distanceMiles(at, closest),
    toward: compass(bearing(at, closest)),
    heading: compass(heading),
    escape: `${outA} or ${outB}`,
  };
}
