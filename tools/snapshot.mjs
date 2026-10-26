// Build the offline snapshot the app opens with.
//
//   node tools/snapshot.mjs
//
// The two fixed tiers -- the country and California -- scored once and
// written to src/data/snapshot.json. The app draws this the instant it opens,
// before a single request goes out, and replaces it the moment live readings
// land. Without it the first thing a new visitor sees is a black map for a
// second or two, and if the free weather tier happens to be exhausted that
// day, a black map for good.
//
// Re-run it before a demo so what ships is recent. The file records when it
// was taken and the app says so on screen.

import { writeFileSync } from 'node:fs';
import { NATION_GRID, STATE_GRID } from '../src/lib/grid.js';

const API = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const BATCH = 80;
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const AFTERNOON = 15;   // 3 PM: when a fire day is at its worst
const round = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

/**
 * Yesterday, when today is out of reach.
 *
 * The free tier is counted per location and a few hundred of them go quickly,
 * so the live call can be refused on exactly the afternoon you are trying to
 * prepare a demo. The archive is a separate allowance, so we fall back to the
 * last complete day's real 3 PM readings -- observations, not invention --
 * and stamp the file with when they were taken. The app shows that age on
 * screen, so nothing is passed off as current.
 */
async function askArchive(points) {
  const end = iso(Date.now() - 2 * DAY);
  const common = {
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lng).join(','),
    end_date: end,
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: 'America/Los_Angeles',
  };
  const get = async (extra) => {
    const res = await fetch(`${ARCHIVE}?${new URLSearchParams({ ...common, ...extra })}`);
    if (!res.ok) throw new Error(`Archive returned ${res.status}`);
    const body = await res.json();
    return Array.isArray(body) ? body : [body];
  };

  const [runUp, afternoon] = await Promise.all([
    get({ start_date: iso(new Date(end) - 14 * DAY),
          daily: 'temperature_2m_max,relative_humidity_2m_mean,precipitation_sum' }),
    get({ start_date: end,
          hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m' }),
  ]);

  // Dress it as a live answer so one shaping function handles both sources.
  return runUp.map((row, i) => {
    const h = afternoon[i]?.hourly;
    if (!h || h.temperature_2m[AFTERNOON] === null) return null;
    return {
      daily: row.daily,
      current: {
        temperature_2m: h.temperature_2m[AFTERNOON],
        relative_humidity_2m: h.relative_humidity_2m[AFTERNOON],
        wind_speed_10m: h.wind_speed_10m[AFTERNOON],
        wind_direction_10m: h.wind_direction_10m[AFTERNOON],
        wind_gusts_10m: h.wind_gusts_10m[AFTERNOON],
        time: `${end}T${String(AFTERNOON).padStart(2, '0')}:00`,
      },
    };
  });
}

async function ask(points) {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lng).join(','),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    daily: 'temperature_2m_max,relative_humidity_2m_mean,precipitation_sum',
    past_days: '14', forecast_days: '1',
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: 'America/Los_Angeles',
  });
  const res = await fetch(`${API}?${params}`);
  if (res.status === 429) { live = false; return askArchive(points); }
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}.`);
  const body = await res.json();
  return Array.isArray(body) ? body : [body];
}

// Flipped by the first refusal, so the file records what it really holds.
let live = true;

// The oldest reading in the file. A run can be part live and part archive --
// the allowance can run out halfway through -- so the file is stamped with
// the oldest thing in it, never the newest. The badge in the app says how old
// that is, and erring young would be the one direction that misleads.
let oldest = Infinity;

/** Only the numbers the risk model actually reads, rounded to keep the file small. */
function squeeze(d) {
  // Open-Meteo answers in the timezone we asked for, so the offset it hands
  // back is what turns its clock reading into a real moment.
  if (d?.current?.time) {
    const at = Date.parse(`${d.current.time}:00Z`) - (d.utc_offset_seconds ?? 0) * 1000;
    if (Number.isFinite(at)) oldest = Math.min(oldest, at);
  }
  if (!d?.current || !d?.daily) return null;
  const last = d.daily.time.length - 1;
  const mean = (ns) => ns.reduce((a, b) => a + b, 0) / ns.length;
  let dry = d.daily.precipitation_sum.length;
  for (let i = d.daily.precipitation_sum.length - 1; i >= 0; i--) {
    if (d.daily.precipitation_sum[i] >= 0.5) { dry = d.daily.precipitation_sum.length - 1 - i; break; }
  }
  return [
    round(d.current.temperature_2m), round(d.current.relative_humidity_2m),
    round(d.current.wind_speed_10m), round(d.current.wind_gusts_10m), Math.round(d.current.wind_direction_10m),
    round(d.daily.temperature_2m_max[last]), round(mean(d.daily.temperature_2m_max.slice(last - 3, last))),
    round(d.daily.relative_humidity_2m_mean[last]), round(mean(d.daily.relative_humidity_2m_mean.slice(last - 3, last))),
    dry,
  ];
}

async function tier(name, grid) {
  const points = grid.cells.map((c) => c.center);
  const rows = [];
  for (let i = 0; i < points.length; i += BATCH) {
    process.stdout.write(`${name}: ${i + 1}-${Math.min(i + BATCH, points.length)} of ${points.length}\r`);
    rows.push(...await ask(points.slice(i, i + BATCH)));
  }
  const out = rows.map(squeeze);
  console.log(`${name}: ${out.filter(Boolean).length} of ${points.length} locations            `);
  return out;
}

const nation = await tier('country', NATION_GRID);
const state = await tier('california', STATE_GRID);

const snapshot = {
  at: new Date(Number.isFinite(oldest) ? oldest : Date.now()).toISOString(),
  live,
  // The rows are matched to grid cells by position, so the file is only
  // valid for the grid it was built from. Record the shape; the app checks
  // it and ignores the snapshot rather than colouring the wrong squares.
  shape: {
    nation: [NATION_GRID.cols, NATION_GRID.rows],
    state: [STATE_GRID.cols, STATE_GRID.rows],
  },
  fields: ['temp', 'humidity', 'wind', 'windGust', 'windFromDeg',
           'tempMaxToday', 'tempMaxPrior', 'humidityToday', 'humidityPrior', 'daysSinceRain'],
  nation,
  state,
};

const path = new URL('../src/data/snapshot.json', import.meta.url);
writeFileSync(path, JSON.stringify(snapshot));
const kb = (JSON.stringify(snapshot).length / 1024).toFixed(1);
const hours = Math.round((Date.now() - Date.parse(snapshot.at)) / 3_600_000);
console.log(`\nwrote src/data/snapshot.json — ${kb} KB, oldest reading ${snapshot.at} (${hours} h ago)` +
  (live ? '' : '\nThe live tier refused part way through, so some of these came from the archive.' +
               '\nRe-run when the allowance resets to ship a wholly live file.'));
