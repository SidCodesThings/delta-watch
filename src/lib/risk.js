// The fire-risk model. This is the heart of the app and it is deliberately
// simple: four weather signals, each scaled 0-1, combined with fixed weights.

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Each signal answers "how much does this push risk up?" on a 0-1 scale.
 *
 * The top of each scale is a red-flag condition: the numbers CAL FIRE warns
 * on. The bottom is deliberately NOT. An earlier version started each scale
 * at the red-flag threshold itself -- humidity worth nothing until 40%, wind
 * nothing until 10 mph -- and on any ordinary day three of the four signals
 * read exactly 0.00 across the whole country, so every square scored the same
 * low number and the map was one flat colour. A scale that only moves during
 * the worst week of the year cannot tell you anything about the other fifty.
 * So each one starts where the signal stops being irrelevant, not where it
 * becomes an emergency.
 */
export function signals(w) {
  return {
    humidity: clamp01((55 - w.humidity) / 40),   // 55% RH -> 0 ... 15% RH -> 1
    wind: clamp01((w.windGust - 5) / 25),        // 5 mph gusts -> 0 ... 30 mph -> 1
    temp: clamp01((w.temp - 55) / 40),           // 55 F -> 0 ... 95 F -> 1
    dryness: clamp01(w.daysSinceRain / 14),      // rain today -> 0 ... 14 dry days -> 1
  };
}

const WEIGHTS = { humidity: 0.35, wind: 0.3, temp: 0.2, dryness: 0.15 };

export const SIGNAL_LABELS = {
  humidity: 'Dry air',
  wind: 'Wind gusts',
  temp: 'Heat',
  dryness: 'Days since rain',
};

/**
 * Delta T: our own early-warning idea. A sharp jump in temperature paired with
 * a drop in humidity is the signature of an offshore wind event -- the setup
 * behind most of the valley's worst fire days. We look for it by comparing
 * today against the average of the three days before it.
 */
export function deltaT(w) {
  const tempRise = w.tempMaxToday - w.tempMaxPrior;
  const humidityDrop = w.humidityPrior - w.humidityToday;
  return {
    tempRise,
    humidityDrop,
    triggered: tempRise >= 5 && humidityDrop >= 8,
  };
}

const DELTA_T_PENALTY = 12; // points added to the score when the pattern shows up

/**
 * Turn a weather reading into a 0-100 score plus the pieces that explain it.
 * @returns {{score:number, level:string, parts:object, delta:object}}
 */
export function scoreRisk(w) {
  const parts = signals(w);
  const base = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + parts[key] * weight, 0) * 100;
  const delta = deltaT(w);
  const score = Math.round(Math.min(100, base + (delta.triggered ? DELTA_T_PENALTY : 0)));
  return { score, level: riskLevel(score), parts, delta };
}

export function riskLevel(score) {
  if (score >= 70) return 'extreme';
  if (score >= 55) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

// Checked for colour-blind separation and for contrast against the dark map,
// so the four levels stay apart for everyone looking at them.
export const RISK_COLORS = {
  low: '#2bb14f',
  moderate: '#ffd429',
  high: '#f2700d',
  extreme: '#cf2222',
};

export const RISK_RANGES = { low: '0-39', moderate: '40-54', high: '55-69', extreme: '70-100' };

// --- "Safe to work today?" --------------------------------------------------

// Hard limits that stop equipment work no matter what the overall score says.
const HARD_STOP = { gustMph: 25, humidityPct: 15 };

/**
 * Go / caution / stop call for mowing, harvesting or running equipment.
 * Equipment sparks start a large share of valley fires, so this is the
 * answer most farmers actually want from the app.
 */
export function workVerdict(w, score) {
  if (w.windGust >= HARD_STOP.gustMph)
    return stop(`Gusts are ${Math.round(w.windGust)} mph. A spark can outrun you above ${HARD_STOP.gustMph} mph.`);
  if (w.humidity <= HARD_STOP.humidityPct)
    return stop(`Humidity is ${Math.round(w.humidity)}%. Dead grass ignites almost instantly below ${HARD_STOP.humidityPct}%.`);
  if (score >= 70)
    return stop('Today scores in the extreme range. Park the equipment.');
  if (score >= 40)
    return {
      call: 'caution',
      reason: 'Workable, but treat every spark as a fire start.',
      rules: [
        'Keep a charged extinguisher and 5 gallons of water on the machine',
        'Carry a shovel and a cell phone with you',
        'Walk the field 30 minutes after you finish to check for smoke',
      ],
    };
  return {
    call: 'go',
    reason: 'Conditions are mild for this time of year.',
    rules: ['Normal precautions: extinguisher on board, no parking on dry grass'],
  };
}

const stop = (reason) => ({
  call: 'stop',
  reason,
  rules: [
    'No mowing, discing, welding or grinding in or near dry vegetation',
    'Move equipment onto bare dirt or gravel',
    'If you must run equipment, wait for the safe window below',
  ],
});

/**
 * Find the mildest stretch of the day still ahead, by running the same scoring
 * function on each remaining hour. Reusing scoreRisk keeps one model, not two.
 */
export function safeWindow(w) {
  if (!w.hourly) return null;
  const nowHour = Number(w.observedAt.slice(11, 13)); // local time, straight from the forecast
  const hours = w.hourly
    .filter((h) => h.hour >= nowHour)
    .map((h) => ({ hour: h.hour, score: scoreRisk({ ...w, ...h }).score }));
  if (!hours.length) return null;

  // Longest unbroken run of hours that score below the caution threshold.
  let best = null;
  let run = null;
  for (const h of hours) {
    if (h.score < 40) {
      run = run ? { from: run.from, to: h.hour + 1 } : { from: h.hour, to: h.hour + 1 };
      if (!best || run.to - run.from > best.to - best.from) best = run;
    } else {
      run = null;
    }
  }
  if (best) return { ...best, none: false };
  return { none: true, best: hours.reduce((a, b) => (b.score < a.score ? b : a)) };
}

export const formatHour = (h) => {
  const hour = h % 24; // a window can end at 24, which is midnight
  return `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;
};
