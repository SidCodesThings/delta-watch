// The readings the app ships with, so it opens on a coloured map instead of
// a black one.
//
// tools/snapshot.mjs writes src/data/snapshot.json: the country and
// California, scored once and frozen. The app draws it immediately, before a
// single request goes out, and throws it away the moment live readings for
// the same tier arrive. On a cold visit that is the difference between
// colour now and colour in a couple of seconds -- and if the free weather
// tier happens to be exhausted, the difference between a usable map and a
// black one.
//
// Everything built from it carries `stale: true` and the time it was taken,
// because a fire map quietly showing old numbers would be worse than useless.
// Nothing that gives advice uses it: the work verdict, the warnings and the
// assistant all read your own location, which is always fetched live.

import saved from '../data/snapshot.json' with { type: 'json' };
import { NATION_GRID, STATE_GRID } from './grid.js';

/** Turn one packed row back into the reading the risk model expects. */
function unpack(row, at) {
  if (!row) return null;
  const [temp, humidity, wind, windGust, windFromDeg,
         tempMaxToday, tempMaxPrior, humidityToday, humidityPrior, daysSinceRain] = row;
  return {
    temp, humidity, wind, windGust, windFromDeg,
    tempMaxToday, tempMaxPrior, humidityToday, humidityPrior, daysSinceRain,
    observedAt: at.slice(0, 16).replace('T', 'T'),
    hourly: null,
    stale: true,          // every piece of the UI can see this is not live
    takenAt: at,
  };
}

/**
 * Rows are matched to cells by position, so a snapshot built against a
 * different grid would paint real readings onto the wrong squares -- the
 * kind of wrong that looks completely plausible. If the shape recorded in
 * the file does not match the grid in the code, drop it and wait for live.
 */
function build(grid, rows, shape) {
  if (!rows || !shape || shape[0] !== grid.cols || shape[1] !== grid.rows) return [];
  return rows.flatMap((row, i) => {
    const weather = unpack(row, saved.at);
    return weather && grid.cells[i] ? [{ ...grid.cells[i], weather }] : [];
  });
}

export const SNAPSHOT_AT = saved.at;
export const SNAPSHOT_NATION = build(NATION_GRID, saved.nation, saved.shape?.nation);
export const SNAPSHOT_STATE = build(STATE_GRID, saved.state, saved.shape?.state);

/**
 * Is what shipped recent enough to stand in for a live fetch of the fixed
 * tiers?
 *
 * They cost 330 of the free tier's 10,000 daily locations every time the
 * app is opened cold, which is far and away the biggest drain on the
 * allowance -- and running out is what makes the weather "load
 * inconsistently", because every later visitor gets refused.
 *
 * Six hours is the trade. These tiers are the coarse backdrop: squares 60
 * to 170 miles a side, used when you are zoomed out or while the fine grid
 * for your view is still coming. The things anyone acts on -- your own
 * spot, and the squares for whatever is on screen -- are always fetched
 * live, and the app says on screen how old the backdrop is.
 */
export const snapshotIsFresh = (now = Date.now()) =>
  now - new Date(saved.at) < FRESH_MINUTES * 60_000;

// Twelve hours. These squares are 60 to 170 miles across and the app says
// on screen how old they are; refetching them every few hours was spending
// the day's allowance on the one part of the map nobody acts on.
const FRESH_MINUTES = 720;

/** "3 hours ago", "2 days ago" -- for the badge that admits these are not live. */
export function howOld(iso = saved.at, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso)) / 60_000);
  if (minutes < 90) return `${Math.max(1, minutes)} min old`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h old`;
  return `${Math.round(hours / 24)} days old`;
}
