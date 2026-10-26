// Does the score mean anything? Run it and find out.
//
//   node tools/backtest.mjs
//
// For every fire the app can replay, this scores the ignition day and also
// every other day in the two months either side of it, at the same place.
// That control matters: "fires start on hot dry days" is not a finding if
// every day that summer was hot and dry. The question is whether the
// ignition day stands out from its own season.
//
// It imports the same scoreRisk the app draws with and the same fire list
// the Proof tab shows, so these numbers cannot drift away from the product.

import { scoreRisk, riskLevel } from '../src/lib/risk.js';
import { FIRES } from '../src/lib/hindsight.js';

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const WINDOW_DAYS = 60;      // "the same season" either side of the fire
const LEAD_DAYS = 14;        // the run-up dryness and Delta T need
const BLACKOUT_DAYS = 3;     // days around ignition, left out of the control

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const avg = (n) => n.reduce((a, b) => a + b, 0) / n.length;

/** Score every day in a daily series exactly the way the live app scores one. */
function scoreSeries(daily) {
  const out = [];
  for (let i = LEAD_DAYS; i < daily.time.length; i++) {
    const [temp, humidity, gust] = [
      daily.temperature_2m_max[i], daily.relative_humidity_2m_mean[i], daily.wind_gusts_10m_max[i],
    ];
    if ([temp, humidity, gust].some((v) => v === null || v === undefined)) continue;

    const rain = daily.precipitation_sum.slice(0, i + 1);
    let dry = rain.length;
    for (let k = rain.length - 1; k >= 0; k--) if (rain[k] >= 0.5) { dry = rain.length - 1 - k; break; }

    out.push({
      date: daily.time[i],
      score: scoreRisk({
        temp, humidity, windGust: gust,
        tempMaxToday: temp, tempMaxPrior: avg(daily.temperature_2m_max.slice(i - 3, i)),
        humidityToday: humidity, humidityPrior: avg(daily.relative_humidity_2m_mean.slice(i - 3, i)),
        daysSinceRain: Math.min(dry, 30),
      }).score,
    });
  }
  return out;
}

async function season(fire) {
  const at = new Date(`${fire.date}T12:00:00Z`);
  const params = new URLSearchParams({
    latitude: fire.at.lat, longitude: fire.at.lng,
    start_date: iso(+at - (WINDOW_DAYS + LEAD_DAYS) * DAY),
    end_date: iso(Math.min(+at + WINDOW_DAYS * DAY, Date.now() - 3 * DAY)),
    daily: 'temperature_2m_max,relative_humidity_2m_mean,precipitation_sum,wind_gusts_10m_max',
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: 'America/Los_Angeles',
  });
  const body = await (await fetch(`${ARCHIVE}?${params}`)).json();
  if (!body.daily) throw new Error(body.reason ?? 'no data');
  return scoreSeries(body.daily);
}

const ignitions = [];
const ordinary = [];

console.log('fire                 date         score  season median  percentile');
console.log('-'.repeat(68));

for (const fire of FIRES) {
  let days;
  try { days = await season(fire); } catch (e) { console.log(fire.name.padEnd(20), e.message); continue; }

  const onDay = days.find((d) => d.date === fire.date);
  if (!onDay) { console.log(fire.name.padEnd(20), 'ignition day missing from the archive'); continue; }

  const others = days.filter((d) => Math.abs(new Date(d.date) - new Date(fire.date)) > BLACKOUT_DAYS * DAY);
  const median = [...others].sort((a, b) => a.score - b.score)[Math.floor(others.length / 2)].score;
  const percentile = Math.round((others.filter((d) => d.score < onDay.score).length / others.length) * 100);

  ignitions.push(onDay.score);
  ordinary.push(...others.map((d) => d.score));
  console.log(
    fire.name.padEnd(20), fire.date,
    String(onDay.score).padStart(6), String(median).padStart(14), String(percentile).padStart(11) + 'th');
}

const share = (list, test) => Math.round((list.filter(test).length / list.length) * 100);
const extreme = (s) => riskLevel(s) === 'extreme';

console.log('\n' + '='.repeat(68));
console.log(`ignition days                 ${ignitions.length}`);
console.log(`ordinary days, same places    ${ordinary.length}`);
console.log(`rated extreme, ignition days  ${share(ignitions, extreme)}%  (${ignitions.filter(extreme).length} of ${ignitions.length})`);
console.log(`rated extreme, ordinary days  ${share(ordinary, extreme)}%`);
console.log(`mean score, ignition days     ${Math.round(avg(ignitions))}`);
console.log(`mean score, ordinary days     ${Math.round(avg(ordinary))}`);
console.log(`lift                          x${(share(ignitions, extreme) / share(ordinary, extreme)).toFixed(1)}`);
console.log(`
A fire day is that much likelier to be rated extreme than an ordinary day in
the same place and season. The model cannot say a fire WILL start -- that
needs a spark, and nothing forecasts those. It says the day is ready for one.`);
