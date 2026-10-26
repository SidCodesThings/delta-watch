// The risk grid: a rectangle of the map sliced into squares, each with its own
// weather reading and its own score.
//
// Two of them are in play. A fixed one covers the whole country so nowhere is
// ever blank, and a finer one follows the map so the place you are actually
// looking at is drawn in detail.

import { GRID_SIZE, NATION, STATE } from './config.js';

/**
 * @param {[number,number,number,number]} bbox  [West, South, East, North]
 * @param {{cols:number, rows:number}} size
 */
export function makeGrid(bbox, size = GRID_SIZE) {
  const [west, south, east, north] = bbox;
  const { cols, rows } = size;
  const cellW = (east - west) / cols;
  const cellH = (north - south) / rows;

  const cells = Array.from({ length: cols * rows }, (_, i) => {
    const w = west + (i % cols) * cellW;
    const s = south + Math.floor(i / cols) * cellH;
    return {
      id: i,
      center: { lat: round(s + cellH / 2), lng: round(w + cellW / 2) },
      bounds: [[s, w], [s + cellH, w + cellW]],
    };
  });

  return { bbox, cols, rows, cells };
}

/** The two fixed tiers, built once. */
export const NATION_GRID = makeGrid(NATION.bbox, NATION.grid);
export const STATE_GRID = makeGrid(STATE.bbox, STATE.grid);

/**
 * Is `inner` wholly inside `outer`? Both are [West, South, East, North].
 * This is what picks the backdrop: the finest fixed tier that covers the
 * whole view, so we never fill half a screen and leave the rest bare.
 */
export function covers(outer, inner) {
  if (!outer || !inner) return false;
  return inner[0] >= outer[0] && inner[1] >= outer[1]
      && inner[2] <= outer[2] && inner[3] <= outer[3];
}

/**
 * A finer grid over what is currently on screen, with a margin so the colour
 * does not stop at the edge of the window.
 *
 * The edges snap to round numbers. That matters: a step worked out from the
 * exact bounds would shift on every pan, so no two views would share a grid
 * and nothing would ever come from the cache.
 */
export function viewGrid(bounds) {
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = Math.max(-84, bounds.getSouth());
  const north = Math.min(84, bounds.getNorth());

  const stepX = niceStep(east - west);
  const stepY = niceStep(north - south);
  const snap = (value, step) => Math.round(value / step) * step;

  return makeGrid([
    Math.max(-180, snap(west, stepX) - stepX),
    Math.max(-84, snap(south, stepY) - stepY),
    Math.min(180, snap(east, stepX) + stepX),
    Math.min(84, snap(north, stepY) + stepY),
  ]);
}

/**
 * Pair a grid's cells with their readings, keeping the grid DENSE.
 *
 * This matters more than it looks. cellAt finds a cell by index arithmetic,
 * so the list has to stay exactly cols x rows long and in order. An earlier
 * version dropped cells whose reading had not arrived, which shifted every
 * later cell by one and ran the last rows off the end of the array -- and
 * because rows are built south to north, that meant hovering southern
 * California worked and the north of the state returned nothing at all.
 * Cells with no reading stay in place carrying null, and the drawing code
 * skips them.
 */
export function withReadings(grid, rows) {
  return {
    ...grid,
    cells: grid.cells.map((cell, i) => ({ ...cell, weather: rows[i] ?? null })),
  };
}

/** The cell under a point, but only if it actually has a reading. */
export function readingAt(grid, point) {
  const cell = cellAt(grid, point);
  return cell?.weather ? cell : null;
}

/**
 * Which cell covers this point? Index arithmetic, no searching.
 * Returns null for anything it cannot answer -- this runs on every pointer
 * move, so it must never be able to throw and blank the screen.
 */
export function cellAt(grid, point) {
  if (!grid?.cells?.length || !point) return null;
  const { lat, lng } = point;
  const [west, south, east, north] = grid.bbox;
  if (lng < west || lng > east || lat < south || lat > north) return null;
  const col = clamp(Math.floor(((lng - west) / (east - west)) * grid.cols), grid.cols - 1);
  const row = clamp(Math.floor(((lat - south) / (north - south)) * grid.rows), grid.rows - 1);
  return grid.cells[row * grid.cols + col] ?? null;
}

/** The nearest round number (1, 2 or 5 times a power of ten) to a quarter span. */
function niceStep(span) {
  const quarter = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(quarter));
  return [1, 2, 5, 10].map((m) => m * magnitude).find((step) => step >= quarter) ?? quarter;
}

function clamp(n, max) {
  return Math.min(max, Math.max(0, n));
}

function round(n) {
  return Math.round(n * 1e4) / 1e4;
}
