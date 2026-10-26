// Hindsight: run today's model over a day that has already happened.
//
// A fire-risk model that has never been checked against a real fire is a
// colour scheme. This replays the weather of a day California remembers,
// feeds it to the same scoreRisk the live map uses -- not a special version,
// not a tuned one -- and shows what the app would have said that morning.
//
// Open-Meteo's archive is the same service as the forecast, at a different
// address, so the request plumbing is shared with weather.js.

import { askBatched } from './weather.js';

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

// Daily values, because an archive has no "right now". The model wants the
// day's peak heat, its mean humidity, its strongest gust, and two weeks of
// rain behind it to know how cured the fuel is.
const DAILY = 'temperature_2m_max,relative_humidity_2m_mean,precipitation_sum,wind_gusts_10m_max';
const LEAD_DAYS = 14;   // the run-up the dryness and Delta T signals need

/**
 * Fires with a before and an after. Dates and ignition points come from the
 * CAL FIRE incident reports; `note` is what the day is remembered for.
 *
 * This list is also the test set: tools/backtest.mjs reads it from here, so
 * the fires in the app and the fires behind the accuracy numbers can never
 * drift apart.
 */
export const FIRES = [
  { name: 'Park Fire', date: '2024-07-24', at: { lat: 39.80, lng: -121.63 },
    where: 'Chico, Butte County', note: '429,000 acres — the fourth largest in state history.' },
  { name: 'Dixie Fire', date: '2021-07-13', at: { lat: 39.87, lng: -121.38 },
    where: 'Feather River Canyon', note: 'Burned for three months and erased the town of Greenville.' },
  { name: 'Caldor Fire', date: '2021-08-14', at: { lat: 38.68, lng: -120.35 },
    where: 'Grizzly Flats, El Dorado County', note: 'Crossed the Sierra crest and emptied South Lake Tahoe.' },
  { name: 'Glass Fire', date: '2020-09-27', at: { lat: 38.55, lng: -122.49 },
    where: 'Napa Valley', note: 'Ran through wine country in a single night.' },
  { name: 'Creek Fire', date: '2020-09-04', at: { lat: 37.19, lng: -119.26 },
    where: 'Big Creek, Fresno County', note: 'Trapped 200 campers; the Army flew them out.' },
  { name: 'North Complex', date: '2020-08-17', at: { lat: 39.77, lng: -121.00 },
    where: 'Plumas National Forest', note: 'Lightning on a dry storm front; 15 people died at Berry Creek.' },
  { name: 'SCU Lightning Complex', date: '2020-08-16', at: { lat: 37.42, lng: -121.48 },
    where: 'Diablo Range, east of us', note: 'Lightning lit twenty fires at once on our own doorstep.' },
  { name: 'Kincade Fire', date: '2019-10-23', at: { lat: 38.79, lng: -122.78 },
    where: 'Geyserville, Sonoma County', note: 'Started under a transmission line in an offshore wind event.' },
  { name: 'Camp Fire', date: '2018-11-08', at: { lat: 39.81, lng: -121.44 },
    where: 'Paradise, Butte County', note: '85 deaths. The deadliest fire in California history.' },
  { name: 'Woolsey Fire', date: '2018-11-08', at: { lat: 34.23, lng: -118.72 },
    where: 'Simi Hills, Ventura County', note: 'Same day as the Camp Fire, 500 miles south.' },
  { name: 'Mendocino Complex', date: '2018-07-27', at: { lat: 39.24, lng: -122.98 },
    where: 'Lake County', note: 'The largest California fire on record at the time.' },
  { name: 'Carr Fire', date: '2018-07-23', at: { lat: 40.65, lng: -122.63 },
    where: 'Whiskeytown, Shasta County', note: 'A trailer tyre threw sparks; it later spun a fire tornado.' },
  { name: 'Thomas Fire', date: '2017-12-04', at: { lat: 34.42, lng: -119.03 },
    where: 'Santa Paula, Ventura County', note: 'A December fire, driven by Santa Ana winds.' },
  { name: 'Tubbs Fire', date: '2017-10-08', at: { lat: 38.63, lng: -122.73 },
    where: 'Calistoga to Santa Rosa', note: 'Reached a city of 175,000 in the dark.' },
];

/**
 * Weather for a list of points on one past day, shaped exactly like the live
 * readings so every function downstream cannot tell the difference.
 * @returns {Promise<(object|null)[]>} one entry per point, in the same order.
 */
export async function fetchArchive(points, date) {
  const end = new Date(`${date}T12:00:00Z`);
  const start = new Date(end - LEAD_DAYS * 86_400_000);

  const rows = await askBatched(ARCHIVE, points, (chunk) => new URLSearchParams({
    latitude: chunk.map((p) => p.lat).join(','),
    longitude: chunk.map((p) => p.lng).join(','),
    start_date: start.toISOString().slice(0, 10),
    end_date: date,
    daily: DAILY,
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'America/Los_Angeles',
  }));

  return rows.map((row) => (row?.daily ? shape(row.daily) : null));
}

/**
 * One archive answer, flattened into the same few numbers a live reading
 * carries. The day's high temperature stands in for "now": a fire starts in
 * the afternoon, not at dawn.
 */
function shape(daily) {
  const today = daily.time.length - 1;
  if (daily.temperature_2m_max[today] === null) return null;

  return {
    temp: daily.temperature_2m_max[today],
    humidity: daily.relative_humidity_2m_mean[today],
    wind: daily.wind_gusts_10m_max[today],
    windGust: daily.wind_gusts_10m_max[today],
    windFromDeg: 0,                       // the archive's daily set has no direction
    observedAt: `${daily.time[today]}T15:00`,

    tempMaxToday: daily.temperature_2m_max[today],
    tempMaxPrior: average(daily.temperature_2m_max.slice(today - 3, today)),
    humidityToday: daily.relative_humidity_2m_mean[today],
    humidityPrior: average(daily.relative_humidity_2m_mean.slice(today - 3, today)),
    daysSinceRain: daysSinceRain(daily.precipitation_sum),

    hourly: null,                         // the hour strip is a today-only tool
    historic: true,
  };
}

/** Walk backwards from the day in question until we hit measurable rain. */
function daysSinceRain(precip, wetMm = 0.5) {
  for (let i = precip.length - 1; i >= 0; i--) {
    if (precip[i] >= wetMm) return precip.length - 1 - i;
  }
  return precip.length;
}

const average = (nums) => nums.reduce((a, b) => a + b, 0) / nums.length;

/** "2024-07-24" -> "24 July 2024", for a label a person can read. */
export function longDate(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}
