// Tests for the parts that decide things: the risk model, the grid maths, the
// spread geometry and the advice. These are pure functions, so they can be
// checked exactly -- no network, no browser, no map.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreRisk, riskLevel, deltaT, workVerdict, safeWindow, formatHour, signals,
} from '../src/lib/risk.js';
import { makeGrid, viewGrid, cellAt, covers, withReadings, readingAt, NATION_GRID, STATE_GRID } from '../src/lib/grid.js';
import { STATE, NATION } from '../src/lib/config.js';
import { compass, distanceMiles, bearing, spreadCone, escapeRoutes } from '../src/lib/spread.js';
import { adviseFor } from '../src/lib/advice.js';
import { FIRES, longDate } from '../src/lib/hindsight.js';
import { nameFor, watchList, nearestWarning, WATCH_SCORE } from '../src/lib/watch.js';
import { snapshotIsFresh, howOld, SNAPSHOT_AT, SNAPSHOT_STATE, SNAPSHOT_NATION } from '../src/lib/snapshot.js';
import { readLink, linkFor } from '../src/lib/link.js';
import { ask, SUGGESTIONS } from '../src/lib/assistant.js';

/** A weather reading with sensible defaults, so each test states only what it cares about. */
const weather = (over = {}) => ({
  // A genuinely calm day: every signal sits at the bottom of its scale, so
  // this reading scores 0 and any test can raise exactly one number.
  temp: 55, humidity: 55, wind: 3, windGust: 5, windFromDeg: 0,
  observedAt: '2026-10-20T12:00',
  tempMaxToday: 60, tempMaxPrior: 60,
  humidityToday: 55, humidityPrior: 55,
  daysSinceRain: 0, hourly: null,
  ...over,
});

const box = (w, s, e, n) => ({ getWest: () => w, getEast: () => e, getSouth: () => s, getNorth: () => n });

// --- the risk model --------------------------------------------------------

test('the hard limits override the score, not the other way round', () => {
  // Bone-dry air on its own only scores 35, which reads as "low" -- but it is
  // still a stop, because below 15% humidity grass lights regardless of what
  // the other three signals are doing. Pinned because it is the case where
  // the headline number and the advice deliberately disagree.
  const bone = weather({ humidity: 8 });
  assert.equal(scoreRisk(bone).score, 35);
  assert.equal(riskLevel(35), 'low');
  assert.equal(workVerdict(bone, 35).call, 'stop');

  assert.equal(scoreRisk(weather({ temp: 100, humidity: 8, windGust: 30 })).score, 85);
});

test('a mild day scores near zero and a brutal one near the top', () => {
  assert.equal(scoreRisk(weather()).score, 0);

  const worst = scoreRisk(weather({
    temp: 110, humidity: 5, windGust: 45, daysSinceRain: 30,
  })).score;
  assert.equal(worst, 100);
});

test('ordinary days still separate -- the scales do not bottom out', () => {
  // The flat-green bug, pinned. These are real October readings from the
  // valley, the Sierra foothills and the Nevada desert. Under the old scales
  // -- which gave humidity nothing above 40%, wind nothing below 10 mph and
  // heat nothing below 70 F -- all three scored exactly 15 and the map was
  // one colour coast to coast. They are different days and must read as such.
  const valley = scoreRisk(weather({ temp: 63, humidity: 50, windGust: 8, daysSinceRain: 15 })).score;
  const foothill = scoreRisk(weather({ temp: 66, humidity: 40, windGust: 3, daysSinceRain: 15 })).score;
  const desert = scoreRisk(weather({ temp: 77, humidity: 31, windGust: 6, daysSinceRain: 9 })).score;

  assert.ok(valley < foothill && foothill < desert, `${valley}, ${foothill}, ${desert} should climb`);
  assert.equal(riskLevel(valley), 'low');
  assert.equal(riskLevel(desert), 'moderate');
});

test('each signal is clamped to its own 0-1 range', () => {
  const parts = signals(weather({ temp: 200, humidity: -5, windGust: 500, daysSinceRain: 900 }));
  for (const [name, value] of Object.entries(parts)) {
    assert.ok(value >= 0 && value <= 1, `${name} escaped 0-1: ${value}`);
  }
});

test('humidity carries more weight than heat', () => {
  const dry = scoreRisk(weather({ humidity: 10 })).score;   // 0.35 weight
  const hot = scoreRisk(weather({ temp: 100 })).score;      // 0.20 weight
  assert.ok(dry > hot, `dry ${dry} should outweigh hot ${hot}`);
});

test('risk levels sit on the boundaries the legend advertises', () => {
  assert.equal(riskLevel(39), 'low');
  assert.equal(riskLevel(40), 'moderate');
  assert.equal(riskLevel(54), 'moderate');
  assert.equal(riskLevel(55), 'high');
  assert.equal(riskLevel(69), 'high');
  assert.equal(riskLevel(70), 'extreme');
});

test('Delta T needs both the heat jump and the humidity drop', () => {
  const both = deltaT(weather({ tempMaxToday: 90, tempMaxPrior: 80, humidityToday: 20, humidityPrior: 40 }));
  assert.equal(both.triggered, true);

  const heatOnly = deltaT(weather({ tempMaxToday: 90, tempMaxPrior: 80, humidityToday: 40, humidityPrior: 40 }));
  assert.equal(heatOnly.triggered, false);

  const dropOnly = deltaT(weather({ tempMaxToday: 80, tempMaxPrior: 80, humidityToday: 20, humidityPrior: 40 }));
  assert.equal(dropOnly.triggered, false);
});

test('Delta T adds to the score only when it fires', () => {
  const base = weather({ temp: 85, humidity: 25, daysSinceRain: 7 });
  const quiet = scoreRisk(base).score;
  const spiking = scoreRisk({
    ...base, tempMaxToday: 95, tempMaxPrior: 85, humidityToday: 20, humidityPrior: 40,
  }).score;
  assert.equal(spiking - quiet, 12);
});

// --- the work call ---------------------------------------------------------

test('hard limits stop work however mild the overall score', () => {
  const gusty = workVerdict(weather({ windGust: 25 }), 0);
  assert.equal(gusty.call, 'stop');
  assert.match(gusty.reason, /25 mph/);

  const parched = workVerdict(weather({ humidity: 15 }), 0);
  assert.equal(parched.call, 'stop');
  assert.match(parched.reason, /15%/);
});

test('the verdict follows the score between those limits', () => {
  assert.equal(workVerdict(weather(), 20).call, 'go');
  assert.equal(workVerdict(weather(), 40).call, 'caution');
  assert.equal(workVerdict(weather(), 70).call, 'stop');
});

test('every verdict carries something to actually do', () => {
  for (const score of [10, 45, 80]) {
    assert.ok(workVerdict(weather(), score).rules.length > 0);
  }
});

// --- the safe window -------------------------------------------------------

// Dry air alone only reaches 35 of 100, which is still "go" -- a genuinely
// dangerous hour needs heat and wind with it. Getting that wrong is what two
// earlier versions of these tests tripped over.
const CALM = { temp: 65, humidity: 60, windGust: 5 };
const DANGEROUS = { temp: 100, humidity: 8, windGust: 30 };

const hours = (pick) => Array.from({ length: 24 }, (_, hour) => ({
  date: '2026-10-20', hour, ...pick(hour),
}));

test('the safe window only looks at hours still ahead', () => {
  // Calm all morning, dangerous all afternoon; asking at 14:00.
  const w = weather({
    observedAt: '2026-10-20T14:00',
    hourly: hours((h) => (h < 12 ? CALM : DANGEROUS)),
  });
  const window = safeWindow(w);
  assert.equal(window.none, true, 'nothing left today should be calm');
});

test('the safe window reports the longest calm stretch ahead', () => {
  const w = weather({
    observedAt: '2026-10-20T00:00',
    hourly: hours((h) => (h >= 6 && h < 10 ? CALM : DANGEROUS)),
  });
  const window = safeWindow(w);
  assert.equal(window.none, false);
  assert.equal(window.from, 6);
  assert.equal(window.to, 10);
});

test('midnight reads as 12 AM at both ends of the day', () => {
  assert.equal(formatHour(0), '12 AM');
  assert.equal(formatHour(24), '12 AM');
  assert.equal(formatHour(12), '12 PM');
  assert.equal(formatHour(13), '1 PM');
});

// --- the grid --------------------------------------------------------------

test('a grid covers its whole box with no gaps', () => {
  const grid = makeGrid([-10, 0, 10, 10], { cols: 4, rows: 5 });
  assert.equal(grid.cells.length, 20);

  const [[s0, w0]] = grid.cells[0].bounds;
  const [, [n9, e9]] = grid.cells[19].bounds;
  assert.equal(w0, -10);
  assert.equal(s0, 0);
  assert.ok(Math.abs(e9 - 10) < 1e-9);
  assert.ok(Math.abs(n9 - 10) < 1e-9);
});

test('every point inside the box lands in exactly one cell', () => {
  const grid = makeGrid([-10, 0, 10, 10], { cols: 4, rows: 5 });
  for (const cell of grid.cells) {
    assert.equal(cellAt(grid, cell.center)?.id, cell.id);
  }
});

test('a point outside the box belongs to no cell', () => {
  const grid = makeGrid([-10, 0, 10, 10], { cols: 4, rows: 5 });
  assert.equal(cellAt(grid, { lat: 50, lng: 0 }), null);
  assert.equal(cellAt(grid, { lat: 5, lng: -80 }), null);
});

test('cellAt never throws on nonsense, because it runs on every mouse move', () => {
  assert.equal(cellAt(null, { lat: 1, lng: 1 }), null);
  assert.equal(cellAt({ cells: [] }, { lat: 1, lng: 1 }), null);
  assert.equal(cellAt(makeGrid([-1, -1, 1, 1]), null), null);
  assert.equal(cellAt(undefined, undefined), null);
});

test('the view grid is stable across small pans, or nothing would ever cache', () => {
  const a = viewGrid(box(-121.9, 37.2, -120.6, 38.6));
  const b = viewGrid(box(-121.86, 37.24, -120.56, 38.64));
  assert.deepEqual(a.bbox, b.bbox);
});

test('the view grid does move once you have gone somewhere else', () => {
  const here = viewGrid(box(-121.9, 37.2, -120.6, 38.6));
  const away = viewGrid(box(-118.5, 33.5, -117.2, 34.9));
  assert.notDeepEqual(here.bbox, away.bbox);
});

test('the national grid reaches the corners of the country', () => {
  for (const [name, at] of Object.entries({
    seattle: { lat: 47.6, lng: -122.3 },
    miami: { lat: 25.8, lng: -80.2 },
    maine: { lat: 45.2, lng: -69.0 },
    sanDiego: { lat: 32.7, lng: -117.2 },
  })) {
    assert.ok(cellAt(NATION_GRID, at), `${name} is not covered`);
  }
});

test('the state grid reaches every corner of California, and is finer', () => {
  for (const [name, at] of Object.entries({
    crescentCity: { lat: 41.8, lng: -124.2 },
    sanDiego: { lat: 32.7, lng: -117.2 },
    needles: { lat: 34.8, lng: -114.6 },
    stockton: { lat: 37.9, lng: -121.3 },
  })) {
    assert.ok(cellAt(STATE_GRID, at), `${name} is not covered`);
  }

  const span = (g) => (g.bbox[2] - g.bbox[0]) / g.cols;
  assert.ok(span(STATE_GRID) < span(NATION_GRID) / 2,
    'the state tier has to be meaningfully finer than the country, or it earns nothing');
});

test('the backdrop is the finest fixed tier that covers the whole view', () => {
  const county = [-121.6, 37.4, -120.9, 38.4];        // inside California
  const colorado = [-104.0, 39.0, -103.0, 40.0];      // not
  const straddling = [-120.0, 38.0, -113.0, 40.0];    // half in, half out

  assert.equal(covers(STATE.bbox, county), true);
  assert.equal(covers(STATE.bbox, colorado), false);
  assert.equal(covers(NATION.bbox, colorado), true);
  // Half a screen of colour is worse than a coarser screen of it.
  assert.equal(covers(STATE.bbox, straddling), false);
});

// --- hindsight -------------------------------------------------------------

test('every replayable fire is a real, scoreable day in California', () => {
  assert.ok(FIRES.length >= 10, 'the backtest needs a decent sample');
  for (const fire of FIRES) {
    assert.match(fire.date, /^\d{4}-\d{2}-\d{2}$/, `${fire.name} has a malformed date`);
    assert.ok(new Date(fire.date) < new Date(), `${fire.name} has not happened yet`);
    // Inside California, or the archive request is pointed at the wrong place.
    assert.ok(cellAt(STATE_GRID, fire.at), `${fire.name} is outside the state grid`);
    assert.ok(fire.where && fire.note, `${fire.name} needs a place and a line about it`);
  }
  // The same day twice would quietly double-count in the backtest.
  const stamps = FIRES.map((f) => `${f.date}@${f.at.lat},${f.at.lng}`);
  assert.equal(new Set(stamps).size, stamps.length, 'two entries are the same fire');
});

test('a replay date reads as a date a person would say', () => {
  assert.equal(longDate('2018-11-08'), '8 November 2018');
  assert.equal(longDate('2024-07-24'), '24 July 2024');
});

// --- the readings that ship with the app -----------------------------------

test('the snapshot fills both fixed tiers and knows its own age', () => {
  assert.equal(SNAPSHOT_NATION.length, 230, 'the country tier should be complete');
  assert.equal(SNAPSHOT_STATE.length, 100, 'the California tier should be complete');
  for (const cell of [SNAPSHOT_NATION[0], SNAPSHOT_STATE[0]]) {
    assert.equal(cell.weather.stale, true, 'shipped readings must admit they are not live');
    assert.ok(Number.isFinite(cell.weather.temp));
    assert.ok(Number.isFinite(cell.weather.humidity));
  }

  const at = new Date(SNAPSHOT_AT);
  assert.ok(!Number.isNaN(+at), 'the snapshot must carry a real timestamp');
  assert.ok(at <= new Date(), 'a reading from the future is a bug, not a forecast');
});

test('a fresh snapshot stands in for the fetch, a stale one does not', () => {
  const at = +new Date(SNAPSHOT_AT);
  assert.equal(snapshotIsFresh(at + 60 * 60_000), true, 'an hour old is still worth drawing');
  assert.equal(snapshotIsFresh(at + 26 * 60 * 60_000), false, 'a day old must be refetched');
  assert.match(howOld(SNAPSHOT_AT, at + 3 * 60 * 60_000), /3 h old/);
  assert.match(howOld(SNAPSHOT_AT, at + 3 * 24 * 60 * 60_000), /3 days old/);
});

test('an empty square never takes the app down with it', () => {
  // The crash this pins: zooming out switched to the national grid, whose
  // first square is a patch of the Pacific with no reading in it. Anything
  // that reaches for cell.weather without checking died there, and because
  // the app is a dark map, dying looked exactly like a black screen.
  const grid = makeGrid([-124, 32, -114, 42], { cols: 3, rows: 3 });
  const rows = grid.cells.map((cell, i) => (i === 0 ? null : weather({ humidity: 20 + i })));
  const cells = withReadings(grid, rows).cells;

  assert.equal(cells[0].weather, null, 'the first square is the empty one');
  assert.doesNotThrow(() => watchList(cells, { from: { lat: 37, lng: -120 } }));

  const list = watchList(cells, { from: { lat: 37, lng: -120 } });
  assert.ok(list.length > 0, 'the squares that do have readings still rank');

  // The badge that broke: find a cell with a reading, never assume the first.
  const sample = cells.find((cell) => cell.weather);
  assert.ok(sample && sample.weather, 'there is always one to ask, if you look');
});

// --- sharing a place -------------------------------------------------------

test('a shared link carries the spot there and back', () => {
  const spot = { lat: 37.9577, lng: -121.2908, label: 'Tracy block' };
  const link = linkFor(spot);
  const read = readLink(link);

  assert.ok(Math.abs(read.place.lat - spot.lat) < 1e-4);
  assert.ok(Math.abs(read.place.lng - spot.lng) < 1e-4);
  assert.equal(read.place.label, 'Tracy block');
  assert.equal(read.fire, null);

  assert.equal(readLink(linkFor(spot, 'Camp Fire')).fire, 'Camp Fire');
});

test('a junk link is ignored rather than obeyed', () => {
  for (const bad of ['', '?at=', '?at=nonsense', '?at=200,400', '?at=37.9', '?label=nowhere']) {
    assert.equal(readLink(bad).place, null, `"${bad}" should not resolve to a place`);
  }
  assert.equal(linkFor({}), '');
  assert.equal(linkFor({ lat: 1 }), '');
});

// --- the watch board -------------------------------------------------------

const square = (lat, lng, over) => ({
  id: `${lat},${lng}`, center: { lat, lng },
  bounds: [[lat - 0.1, lng - 0.1], [lat + 0.1, lng + 0.1]],
  weather: weather(over),
});

test('a place is named by town and county in California, by state outside it', () => {
  assert.deepEqual(nameFor({ lat: 37.96, lng: -121.29 }), { name: 'near Stockton', region: 'San Joaquin County' });
  assert.deepEqual(nameFor({ lat: 39.75, lng: -121.84 }), { name: 'near Chico', region: 'Butte County' });

  const la = nameFor({ lat: 34.05, lng: -118.24 });
  assert.equal(la.region, 'Los Angeles County');
  assert.match(la.name, /^near /);

  // A town is paired with the county it is actually in, not the nearest
  // county centroid -- that pairing used to put Dos Palos in San Benito.
  assert.deepEqual(nameFor({ lat: 36.986, lng: -120.63 }), { name: 'near Dos Palos', region: 'Merced County' });

  assert.deepEqual(nameFor({ lat: 39.74, lng: -104.99 }), { name: 'Colorado', region: null });
  assert.deepEqual(nameFor({ lat: 30.27, lng: -97.74 }), { name: 'Texas', region: null });
  assert.equal(nameFor(null), null);
});

test('the watch board ranks places worst first, one entry each', () => {
  const list = watchList([
    square(39.81, -121.44, { humidity: 10, windGust: 28, temp: 95 }),   // Butte, severe
    square(39.75, -121.50, { humidity: 12, windGust: 26, temp: 93 }),   // Butte again, also bad
    square(34.05, -118.24, { humidity: 30, temp: 80 }),                 // Los Angeles, milder
  ], { from: { lat: 37.93, lng: -121.27 } });

  assert.equal(list.length, 2, 'two squares in one county must collapse to one entry');
  assert.ok(list[0].score > list[1].score, 'worst first');
  assert.equal(list[0].region, 'Butte County');
  assert.match(list[0].name, /^near /);
  assert.equal(list[0].driver, 'Dry air');
  assert.ok(list[0].miles > 100 && list[0].miles < 200, `Stockton to Butte came out ${list[0].miles} mi`);
  assert.equal(list[0].dir, 'N');
});

test('the watch board can be held to your own corner, with no repeats', () => {
  const home = { lat: 37.93, lng: -121.27 };          // Stockton
  const all = [
    square(37.99, -121.35, { humidity: 24, windGust: 20, temp: 88 }),  // San Joaquin, close
    square(37.66, -120.99, { humidity: 26, windGust: 18, temp: 86 }),  // Stanislaus, close
    square(32.80, -115.56, { humidity: 8, windGust: 30, temp: 100 }),  // Imperial, far and worse
  ];

  const nearby = watchList(all, { from: home, limit: 4, within: 70 });
  assert.equal(nearby.length, 2, 'only the two nearby counties belong on the near board');
  for (const place of nearby) assert.ok(place.miles <= 70, `${place.name} is ${place.miles} mi away`);
  assert.ok(!nearby.some((p) => p.region === 'Imperial County'), 'the desert is not nearby');

  const elsewhere = watchList(all, { from: home, limit: 4, skip: nearby.map((p) => p.region) });
  assert.equal(elsewhere.length, 1);
  assert.equal(elsewhere[0].region, 'Imperial County');
  assert.ok(elsewhere[0].score > nearby[0].score, 'and it really is the worse one');
});

test('the watch board honours its limit and still says something on a calm day', () => {
  const calm = Array.from({ length: 12 }, (_, i) => square(34 + i * 0.4, -118 - i * 0.9));
  const list = watchList(calm, { limit: 4 });
  assert.equal(list.length, 4);
  for (const place of list) assert.ok(place.score < WATCH_SCORE, 'a calm day should not reach the watch level');
});

test('an alert fires for the nearest serious place, not the worst far one', () => {
  const near = { name: 'Stanislaus County', score: 72, level: 'extreme', miles: 20, dir: 'SE' };
  const far = { name: 'Butte County', score: 88, level: 'extreme', miles: 140, dir: 'N' };
  assert.equal(nearestWarning([far, near]).name, 'Stanislaus County');

  // Far away is not an alert, and a mild day is not an alert at all.
  assert.equal(nearestWarning([far]), null);
  assert.equal(nearestWarning([{ name: 'X', score: 30, level: 'low', miles: 5, dir: 'N' }]), null);
  assert.equal(nearestWarning([]), null);
});

test('a grid with missing readings still finds its northern cells', () => {
  // The bug this pins: readings used to be paired with a flatMap that
  // dropped the gaps, which shifted every later cell and ran the top rows
  // off the end of the array. Rows are built south to north, so southern
  // California answered and the north of the state went silent.
  const grid = makeGrid([-124, 32, -114, 42], { cols: 4, rows: 4 });
  const rows = grid.cells.map((cell, i) => (i % 3 === 0 ? null : { temp: 70 + i }));
  const filled = withReadings(grid, rows);

  assert.equal(filled.cells.length, 16, 'the grid has to stay its full size');

  const topRight = { lat: 41.5, lng: -114.5 };
  const found = cellAt(filled, topRight);
  assert.ok(found, 'the north-east corner must resolve to a cell');
  assert.ok(found.center.lat > 38 && found.center.lng > -118,
    `expected a northern cell, got ${JSON.stringify(found.center)}`);
  assert.deepEqual(found, cellAt(grid, topRight) && filled.cells[grid.cells.indexOf(cellAt(grid, topRight))]);

  // A cell with no reading is found, but does not pretend to have one.
  const gap = filled.cells[0];
  assert.equal(gap.weather, null);
  assert.equal(readingAt(filled, gap.center), null);
  assert.ok(readingAt(filled, filled.cells[1].center));
});

// --- spread geometry -------------------------------------------------------

test('a fire runs with the wind, not into it', () => {
  // Wind FROM the north means the fire heads south.
  assert.equal(compass(spreadCone({ lat: 38, lng: -121 }, 0, 20).heading), 'S');
  assert.equal(compass(spreadCone({ lat: 38, lng: -121 }, 90, 20).heading), 'W');
});

test('a stronger wind drives the head further', () => {
  const light = spreadCone({ lat: 38, lng: -121 }, 0, 5).miles;
  const strong = spreadCone({ lat: 38, lng: -121 }, 0, 30).miles;
  assert.ok(strong > light, `${strong} should beat ${light}`);
});

test('escape routes are across the wind, never ahead of the fire', () => {
  const [a, b] = escapeRoutes(0);          // fire heading north
  assert.deepEqual([a, b], ['E', 'W']);
});

test('compass points round to the right quadrant', () => {
  assert.equal(compass(0), 'N');
  assert.equal(compass(90), 'E');
  assert.equal(compass(180), 'S');
  assert.equal(compass(270), 'W');
  assert.equal(compass(359), 'N');
});

test('distance and bearing agree with a known pair', () => {
  const stockton = { lat: 37.93, lng: -121.27 };
  const tracy = { lat: 37.74, lng: -121.43 };
  const miles = distanceMiles(stockton, tracy);
  assert.ok(miles > 13 && miles < 18, `Stockton to Tracy came out ${miles.toFixed(1)} mi`);
  assert.equal(compass(bearing(stockton, tracy)), 'SSW');
});

// --- advice and the assistant ---------------------------------------------

test('advice names the signal that is actually driving the score', () => {
  const windy = adviseFor(weather({ windGust: 34 }), 40, [], { lat: 38, lng: -121 });
  assert.equal(windy.drivers[0].key, 'wind');

  const parched = adviseFor(weather({ humidity: 10 }), 40, [], { lat: 38, lng: -121 });
  assert.equal(parched.drivers[0].key, 'humidity');
});

test('a dangerous day asks you to carry more than a calm one', () => {
  const calm = adviseFor(weather(), 10, [], { lat: 38, lng: -121 }).kit;
  const bad = adviseFor(weather({ temp: 95, humidity: 12, windGust: 28 }), 85, [], { lat: 38, lng: -121 }).kit;
  assert.ok(bad.length > calm.length, `${bad.length} items should beat ${calm.length}`);
});

test('the nearest fire is the nearest one, and comes with a way out', () => {
  const at = { lat: 38, lng: -121 };
  const near = adviseFor(weather(), 30, [
    { lat: 39.5, lng: -121 },
    { lat: 38.1, lng: -121 },
    { lat: 36, lng: -121 },
  ], at).nearest;
  assert.ok(Math.abs(near.spot.lat - 38.1) < 1e-9);
  assert.ok(near.miles < 10);
  assert.ok(near.escape.includes(' or '));
});

test('no detections means no nearest-fire claim', () => {
  assert.equal(adviseFor(weather(), 30, [], { lat: 38, lng: -121 }).nearest, null);
});

test('the assistant answers every question it offers', () => {
  const context = {
    weather: weather({ hourly: hours(() => CALM) }),
    score: 45, label: 'Test field',
    hotspots: [{ lat: 38.1, lng: -121 }], at: { lat: 38, lng: -121 },
  };
  for (const question of SUGGESTIONS) {
    const reply = ask(question, context);
    assert.ok(reply.answer && reply.answer.length > 10, `weak answer to "${question}"`);
  }
});

test('the assistant covers the questions people actually type', () => {
  const context = {
    weather: weather({ temp: 88, humidity: 22, windGust: 27, wind: 14, windFromDeg: 45, daysSinceRain: 12 }),
    score: 61, label: 'Test field',
    hotspots: [{ lat: 38.1, lng: -121 }], at: { lat: 38, lng: -121 },
    hazard: { hazard: 'Very High', score: 76 },
    watch: [{ name: 'near Chico', region: 'Butte County', score: 78, miles: 125, dir: 'NNW' }],
    fires: FIRES,
  };

  const cases = {
    'how windy is it': 'wind',
    'which way is the wind blowing': 'wind',
    'when did it last rain': 'dry',
    'how dry is it out there': 'dry',
    'how hot is it': 'heat',
    'is today unusual compared to normal': 'delta',
    'what is delta t': 'delta',
    'am i in a hazard zone': 'hazard',
    'where is the worst risk today': 'worst',
    'what do i do if a fire starts': 'escape',
    'has anything burned near here before': 'past',
    'how do i report smoke': 'report',
    'what about tomorrow': 'future',
    'where does your data come from': 'sources',
    'what can you help with': 'help',
  };

  for (const [question, expected] of Object.entries(cases)) {
    const reply = ask(question, context);
    assert.equal(reply.topic, expected, `"${question}" went to ${reply.topic}`);
    assert.ok(reply.answer.length > 15, `weak answer to "${question}"`);
  }
});

test('the assistant says so when it does not know', () => {
  const context = {
    weather: weather(), score: 20, label: 'Test field',
    hotspots: [], at: { lat: 38, lng: -121 },
  };
  const reply = ask('who won the world series', context);
  assert.equal(reply.topic, 'unknown');
  assert.match(reply.answer, /do not know/i);
  assert.ok(reply.detail.length > 0, 'it should offer what it can answer instead');
});

test('the assistant will not promise a forecast it cannot make', () => {
  const context = {
    weather: weather(), score: 20, label: 'Test field', hotspots: [], at: { lat: 38, lng: -121 },
  };
  const reply = ask('what will the risk be tomorrow', context);
  assert.equal(reply.topic, 'future');
  assert.match(reply.answer, /only answer for today/i);
});

test('the assistant routes a question to the right topic', () => {
  const context = {
    weather: weather(), score: 30, label: 'Test field',
    hotspots: [{ lat: 38.1, lng: -121 }], at: { lat: 38, lng: -121 },
  };
  assert.equal(ask('can I mow today', context).topic, 'work');
  assert.equal(ask('where is the closest fire', context).topic, 'fire');
  assert.equal(ask('what should I bring outside', context).topic, 'kit');
  assert.equal(ask('why is it so high', context).topic, 'why');
});

test('the assistant never invents a number it was not given', () => {
  const context = {
    weather: weather({ temp: 88, humidity: 22, windGust: 19, daysSinceRain: 9 }),
    score: 52, label: 'Test field', hotspots: [], at: { lat: 38, lng: -121 },
  };
  const reply = ask('what is the risk', context);
  assert.match(reply.answer, /52/);
  assert.ok(reply.detail.some((line) => line.includes('88')));
  assert.ok(reply.detail.some((line) => line.includes('9 days')));
});
