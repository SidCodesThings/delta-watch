// Live weather from Open-Meteo (free, no API key, no sign-up).
//
// The service bills one call per location, and a grid is a hundred of them, so
// the cache here is the difference between the app working all day and running
// out by lunchtime. Every location is remembered on its own: slide the map a
// little and nearly every square is already known, so only the handful of new
// ones are actually requested.

const API = 'https://api.open-meteo.com/v1/forecast';

const CURRENT = 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const DAILY = 'temperature_2m_max,relative_humidity_2m_mean,precipitation_sum';
const HOURLY = 'temperature_2m,relative_humidity_2m,wind_gusts_10m';

const CACHE_MINUTES = 30;

// Long enough for a slow batch of eighty locations, short enough that a
// request which has silently died does not hold the whole map hostage.
const TIMEOUT_MS = 20_000;

// Open-Meteo slows down sharply past roughly a hundred locations in one URL:
// 230 points in a single request took the better part of a minute, while the
// same points split into batches come back in about a second. So we split.
//
// Not smaller than this, though. Halving the batch size halves nothing --
// the service bills per location either way -- but it doubles the number of
// requests, and the free tier limits those too. Eighty is the balance.
const BATCH = 80;

/**
 * @param {{lat:number, lng:number}[]} points
 * @param {boolean} withHourly  also return hour-by-hour numbers for today
 * @returns {Promise<(Weather|null)[]>} one entry per point, in the same order.
 *   An entry is null when that location is neither cached nor reachable.
 */
export async function fetchWeather(points, withHourly = false) {
  const kind = withHourly ? 'full' : 'base';
  const answers = points.map((p) => recall(key(p, kind)));
  const missing = points.flatMap((p, i) => (answers[i] ? [] : [{ point: p, at: i }]));

  if (missing.length) {
    try {
      const rows = await askInBatches(missing.map((m) => m.point), { withHourly });
      missing.forEach(({ at }, k) => {
        if (!rows[k]) return;
        remember(key(points[at], kind), rows[k]);
        answers[at] = rows[k];
      });
    } catch (e) {
      // Nothing cached and nothing fetched means there is simply no answer.
      if (!answers.some(Boolean)) throw e;
    }
  }

  return answers.map((raw) => (raw ? normalize(raw) : null));
}

/**
 * Whatever is already in the cache for these points, with no network call at
 * all. The map draws this the instant you arrive somewhere, then redraws when
 * the real answer lands: a pan usually overlaps where you just were, and
 * waiting on the network to repaint squares we have already paid for is the
 * difference between the map feeling quick and feeling broken.
 */
export function cachedWeather(points) {
  return points.map((p) => {
    const hit = recall(key(p, 'base'));
    return hit ? normalize(hit) : null;
  });
}

/**
 * Just today's 24 hours for each point. Asking for these alongside the two
 * weeks of history would return ten times the data, so the time scrubber
 * fetches them separately, and only when someone reaches for it.
 */
export async function fetchHourly(points) {
  const answers = points.map((p) => recall(key(p, 'hours')));
  const missing = points.flatMap((p, i) => (answers[i] ? [] : [{ point: p, at: i }]));

  if (missing.length) {
    const rows = await askInBatches(missing.map((m) => m.point), { hourlyOnly: true });
    missing.forEach(({ at }, k) => {
      if (!rows[k]) return;
      remember(key(points[at], 'hours'), rows[k]);
      answers[at] = rows[k];
    });
  }

  return answers.map((d) => (d ? normalizeHourly(d.hourly, d.hourly.time[0].slice(0, 10)) : null));
}

/** Ask for a long list of points as several short requests, run together. */
async function askInBatches(points, options) {
  return askBatched(API, points, (chunk) => describe(chunk, options));
}

/**
 * The shared plumbing: split points into batches, ask for each in parallel,
 * hand back one row per point in the original order. Exported because the
 * hindsight replay talks to Open-Meteo's archive instead of its forecast, and
 * the only thing that differs is the address and the parameters.
 */
export async function askBatched(url, points, build) {
  const chunks = [];
  for (let i = 0; i < points.length; i += BATCH) chunks.push(points.slice(i, i + BATCH));
  const answers = await Promise.all(chunks.map((chunk) => ask(build(chunk), url)));
  return answers.flat();
}

/** Build the query for a batch of points. */
function describe(points, { withHourly = false, hourlyOnly = false } = {}) {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lng).join(','),
    forecast_days: '1',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'America/Los_Angeles',
  });

  if (hourlyOnly) {
    params.set('hourly', HOURLY);
    params.set('past_days', '0');
  } else {
    params.set('current', CURRENT);
    params.set('daily', DAILY);
    params.set('past_days', '14');
    if (withHourly) params.set('hourly', HOURLY);
  }
  return params;
}

/**
 * Ask the service, retrying the failures that clear on their own.
 * 429 = we asked too fast or too often, 5xx = their server is busy.
 */
async function ask(params, url = API) {
  const WORTH_RETRYING = [429, 502, 503, 504];

  for (let attempt = 0; attempt < 3; attempt++) {
    // A request that never answers is worse than one that fails outright: the
    // app would sit on its spinner forever with nothing to report. Cut it off
    // and let the retry below treat it like any other hiccup.
    let res;
    try {
      res = await fetch(`${url}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (attempt === 2) throw new Error(`Weather service did not answer (${e.name}).`);
      continue;
    }
    if (res.ok) {
      const body = await res.json();
      return Array.isArray(body) ? body : [body];
    }
    if (!WORTH_RETRYING.includes(res.status) || attempt === 2) {
      // Name the status either way. "It is not working" is the one report
      // that cannot be acted on, and 429 (our own quota) and 500 (theirs)
      // call for completely different responses.
      throw new Error(WORTH_RETRYING.includes(res.status)
        ? `Weather service is at its limit (${res.status}) — showing what is already loaded.`
        : `Weather service returned ${res.status}.`);
    }
    await new Promise((done) => setTimeout(done, 2000 * (attempt + 1)));
  }
}

// --- the per-location cache ------------------------------------------------

const key = (point, kind) => `w:${kind}:${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;

function recall(k) {
  try {
    const hit = JSON.parse(localStorage.getItem(k));
    if (hit && Date.now() - hit.at < CACHE_MINUTES * 60_000) return hit.body;
    if (hit) localStorage.removeItem(k);
  } catch {
    // Storage can be unavailable (private windows); just fetch instead.
  }
  return null;
}

function remember(k, body) {
  try {
    localStorage.setItem(k, JSON.stringify({ at: Date.now(), body }));
  } catch {
    // Either the store is full or it is unavailable altogether (a private
    // window, or storage blocked). Try to make room; if even that fails,
    // carry on without a cache rather than taking the app down.
    try {
      Object.keys(localStorage)
        .filter((n) => n.startsWith('w:'))
        .slice(0, 200)
        .forEach((n) => localStorage.removeItem(n));
    } catch {
      // No storage at all. Fine -- every lookup just goes to the network.
    }
  }
}

// --- shaping ---------------------------------------------------------------

/** Flatten one Open-Meteo response into the handful of numbers we need. */
function normalize(d) {
  const daily = d.daily;
  const last = daily.time.length - 1; // index of today

  return {
    temp: d.current.temperature_2m,
    humidity: d.current.relative_humidity_2m,
    wind: d.current.wind_speed_10m,
    windGust: d.current.wind_gusts_10m,
    windFromDeg: d.current.wind_direction_10m,
    observedAt: d.current.time,

    // Today vs. the days before it -- what the Delta T warning compares.
    tempMaxToday: daily.temperature_2m_max[last],
    tempMaxPrior: average(daily.temperature_2m_max.slice(last - 3, last)),
    humidityToday: daily.relative_humidity_2m_mean[last],
    humidityPrior: average(daily.relative_humidity_2m_mean.slice(last - 3, last)),
    daysSinceRain: daysSinceRain(daily.precipitation_sum),

    hourly: d.hourly ? normalizeHourly(d.hourly, daily.time[last]) : null,
  };
}

/** Keep only today's hours, as plain {hour, temp, humidity, windGust} rows. */
function normalizeHourly(h, today) {
  return h.time
    .map((t, i) => ({
      date: t.slice(0, 10),
      hour: Number(t.slice(11, 13)),
      temp: h.temperature_2m[i],
      humidity: h.relative_humidity_2m[i],
      windGust: h.wind_gusts_10m[i],
    }))
    .filter((row) => row.date === today);
}

/** Walk backwards from today until we hit a day with measurable rain. */
function daysSinceRain(precip, wetMm = 0.5) {
  for (let i = precip.length - 1; i >= 0; i--) {
    if (precip[i] >= wetMm) return precip.length - 1 - i;
  }
  return precip.length; // no rain anywhere in the window we asked for
}

const average = (nums) => nums.reduce((a, b) => a + b, 0) / nums.length;
