// The Fire Assistant.
//
// It is not a language model and does not pretend to be one: it matches a
// question against the things it genuinely knows, then answers from the same
// risk model the map draws. That means it can never invent a number, and
// every answer traces back to live weather.
//
// The price of that honesty is that it has to actually cover the ground
// people ask about -- wind, dryness, hazard class, what to do if something
// starts, where the worst of it is today -- and say plainly when a question
// is outside what it knows rather than guessing. Adding a topic is adding a
// row to TOPICS and a case below; nothing else changes.

import { workVerdict, safeWindow, formatHour, riskLevel, deltaT, signals } from './risk.js';
import { adviseFor } from './advice.js';
import { compass, distanceMiles, bearing } from './spread.js';

/** The questions it offers as taps, so nobody has to guess what it knows. */
export const SUGGESTIONS = [
  'Is it safe to work right now?',
  'When is the safest time today?',
  'What should I take outside?',
  'Where is the closest fire?',
  'Why is the risk what it is?',
  'How windy is it?',
  'When did it last rain?',
  'Is this a hazard zone?',
  'Where is the worst risk today?',
  'What do I do if a fire starts?',
];

// Order matters only for ties; the topic with the most matched words wins.
const TOPICS = [
  { id: 'work',    words: ['safe to work', 'safe', 'work', 'mow', 'mowing', 'harvest', 'equipment', 'tractor', 'disc', 'weld', 'grind', 'machinery'] },
  { id: 'window',  words: ['when', 'window', 'later', 'tonight', 'evening', 'morning', 'safest', 'wait', 'what time'] },
  { id: 'kit',     words: ['bring', 'take', 'wear', 'carry', 'pack', 'kit', 'supplies'] },
  { id: 'fire',    words: ['closest fire', 'nearest fire', 'closest', 'nearest', 'hotspot', 'detection', 'burning', 'active fire'] },
  { id: 'why',     words: ['why', 'reason', 'driving', 'cause', 'because', 'explain', 'what makes'] },
  { id: 'wind',    words: ['wind', 'windy', 'gust', 'gusty', 'breeze', 'blowing', 'direction'] },
  // Phrases earn more than single words, which is how "when did it last
  // rain" lands on dryness instead of on the safe-window question.
  { id: 'dry',     words: ['last rain', 'did it rain', 'rain', 'rained', 'dry', 'dryness', 'humidity', 'humid', 'moisture', 'fuel'] },
  { id: 'heat',    words: ['hot', 'heat', 'temperature', 'degrees', 'warm', 'cold'] },
  { id: 'delta',   words: ['delta', 'change', 'changed', 'spike', 'sudden', 'unusual', 'normal'] },
  { id: 'hazard',  words: ['hazard', 'zone', 'cal fire', 'terrain', 'slope', 'ground', 'severity'] },
  { id: 'worst',   words: ['worst', 'highest', 'most dangerous', 'riskiest', 'worst risk', 'which county', 'anywhere'] },
  { id: 'escape',  words: ['do if', 'emergency', 'evacuate', 'evacuation', 'escape', 'leave', 'starts', '911', 'call'] },
  { id: 'past',    words: ['history', 'before', 'past', 'previous', 'happened', 'ever burned', 'historical'] },
  { id: 'report',  words: ['report', 'photo', 'picture', 'tell someone', 'saw smoke'] },
  { id: 'future',  words: ['tomorrow', 'next week', 'forecast', 'weekend', 'predict'] },
  { id: 'sources', words: ['data', 'source', 'where do you get', 'accurate', 'how do you know', 'model'] },
  { id: 'help',    words: ['help', 'what can you', 'options', 'hello', 'hi there'] },
  { id: 'score',   words: ['risk', 'score', 'how bad', 'rating', 'level', 'number'] },
];

/**
 * @param {string} question  what the person typed or tapped
 * @param {object} ctx  { weather, score, label, hotspots, at, hazard, watch, fires }
 * @returns {{answer: string, detail?: string[], topic: string}}
 */
export function ask(question, ctx) {
  const topic = pick(question);
  const { weather, score, label, hotspots, at, hazard = null, watch = [], fires = [] } = ctx;
  const advice = adviseFor(weather, score, hotspots, at);

  switch (topic) {
    case 'work': {
      const verdict = workVerdict(weather, score);
      return { topic, answer: `${verdict.call.toUpperCase()} — ${verdict.reason}`, detail: verdict.rules };
    }

    case 'window': {
      const safe = safeWindow(weather);
      if (!safe) return { topic, answer: 'I only have hour-by-hour numbers for your own location, not for a spot you are hovering.' };
      if (safe.none) {
        return {
          topic,
          answer: `Nothing today drops out of the caution range. The mildest hour left is ${formatHour(safe.best.hour)}, at ${safe.best.score} out of 100.`,
        };
      }
      return {
        topic,
        answer: `${formatHour(safe.from)} to ${formatHour(safe.to)} is the mildest stretch left today.`,
        detail: ['Humidity climbs back after sundown', 'Walk the ground 30 minutes after you finish'],
      };
    }

    case 'kit':
      return { topic, answer: `For ${label}, at ${score} out of 100:`, detail: advice.kit };

    case 'fire':
      if (!advice.nearest) return { topic, answer: 'No satellite detections anywhere near here in the last 24 hours.' };
      return {
        topic,
        answer: `${advice.nearest.miles.toFixed(1)} miles ${advice.nearest.toward} of here, detected by satellite in the last 24 hours.`,
        detail: [
          `On this wind it would run ${advice.nearest.heading}`,
          `If it reaches you, leave ${advice.nearest.escape} — crosswind, never ahead of it`,
        ],
      };

    case 'why': {
      const top = advice.drivers[0];
      return {
        topic,
        answer: top.share > 0.05
          ? `${top.label} is doing the most here — it alone accounts for ${Math.round(top.share * 100)}% of what the model watches.`
          : 'Nothing is pushing the risk up right now.',
        detail: advice.drivers.map((d) => `${d.label}: ${Math.round(d.share * 100)}%`),
      };
    }

    case 'wind': {
      const gust = Math.round(weather.windGust);
      const from = compass(weather.windFromDeg);
      return {
        topic,
        answer: `Gusting ${gust} mph from the ${from}${gust >= 25 ? ' — above the 25 mph line where a spark outruns you.' : '.'}`,
        detail: [
          `Steady wind ${Math.round(weather.wind)} mph`,
          `A fire here would run ${compass((weather.windFromDeg + 180) % 360)}, at roughly ${(gust * 0.2).toFixed(1)} mph`,
          `Wind is ${Math.round(signals(weather).wind * 100)}% of the way to its worst case in the model`,
        ],
      };
    }

    case 'dry': {
      const days = weather.daysSinceRain;
      return {
        topic,
        answer: days >= 14
          ? `${days}+ days since measurable rain, and humidity is ${Math.round(weather.humidity)}%. Fine fuels are fully cured — anything that sparks will take.`
          : `${days} ${days === 1 ? 'day' : 'days'} since measurable rain. Humidity is ${Math.round(weather.humidity)}%.`,
        detail: [
          `Dry air is ${Math.round(signals(weather).humidity * 100)}% of the way to its worst case`,
          'Below 15% humidity the app stops equipment work whatever the overall score says',
        ],
      };
    }

    case 'heat':
      return {
        topic,
        answer: `${Math.round(weather.temp)}°F at ${label}.`,
        detail: [
          `Heat is ${Math.round(signals(weather).temp * 100)}% of the way to its worst case`,
          'Heat carries 20% of the score — dry air and wind matter more',
        ],
      };

    case 'delta': {
      const delta = deltaT(weather);
      return {
        topic,
        answer: delta.triggered
          ? `Yes — today jumped ${Math.round(delta.tempRise)}°F hotter and ${Math.round(delta.humidityDrop)} points drier than the three days before it. That pattern adds 12 points to the score.`
          : 'No. Today is close to the three days before it, so the Delta T warning is not firing.',
        detail: [
          `Temperature against the last three days: ${delta.tempRise >= 0 ? '+' : ''}${Math.round(delta.tempRise)}°F (needs +5)`,
          `Humidity against the last three days: ${delta.humidityDrop >= 0 ? '-' : '+'}${Math.abs(Math.round(delta.humidityDrop))} points (needs -8)`,
          'Both have to be true at once — a hot day alone is not the pattern',
        ],
      };
    }

    case 'hazard':
      if (!hazard) {
        return {
          topic,
          answer: 'This spot is not inside a mapped CAL FIRE hazard zone. Those cover wildland terrain, so flat irrigated farmland usually falls outside them.',
          detail: ['The zones are the dashed, tinted areas on the map', 'CAL FIRE maps California only'],
        };
      }
      return {
        topic,
        answer: `CAL FIRE rates this ground ${hazard.hazard} hazard. With today's weather that works out at ${hazard.score} out of 100 here.`,
        detail: [
          'The rating is about the terrain and what grows on it, not today',
          'Moderate multiplies the weather score by 0.85, High by 1.05, Very High by 1.25',
        ],
      };

    case 'worst': {
      if (!watch.length) return { topic, answer: 'I do not have the state-wide board loaded yet.' };
      const [first, ...rest] = watch;
      return {
        topic,
        answer: `${first.name}${first.region ? `, ${first.region}` : ''} — ${first.score} out of 100, ${riskLevel(first.score)}${first.miles !== null ? `, ${first.miles} miles ${first.dir} of you` : ''}.`,
        detail: rest.slice(0, 4).map((p) => `${p.score} · ${p.name}${p.region ? `, ${p.region}` : ''}`),
      };
    }

    case 'escape': {
      const lines = [
        'Call 911 first — the Fires tab has a script with your coordinates in it',
        'Move crosswind, never ahead of the head of the fire',
        'Shut down engines and get machinery onto bare dirt or gravel',
      ];
      if (advice.nearest) lines.push(`Nearest detection is ${advice.nearest.miles.toFixed(1)} mi ${advice.nearest.toward}; leave ${advice.nearest.escape}`);
      return { topic, answer: 'If something starts near you:', detail: lines };
    }

    case 'past': {
      if (!fires.length) return { topic, answer: 'I do not have the historical fire list loaded.' };
      const near = [...fires]
        .map((fire) => ({ ...fire, miles: Math.round(distanceMiles(at, fire.at)) }))
        .sort((a, b) => a.miles - b.miles)
        .slice(0, 3);
      return {
        topic,
        answer: `The nearest fire in our records is the ${near[0].name}, ${near[0].miles} miles ${compass(bearing(at, near[0].at))} of here.`,
        detail: near.map((f) => `${f.name} — ${f.where}, ${f.miles} mi away`),
      };
    }

    case 'report':
      return {
        topic,
        answer: 'Use the Report tab: it takes a photo, attaches your coordinates, and runs a colour check for smoke.',
        detail: [
          'It is stored in your browser, not sent anywhere — there is no server behind this app',
          'For an actual fire, call 911 first and report it here afterwards',
        ],
      };

    case 'future':
      return {
        topic,
        answer: 'I only answer for today. The model runs on current conditions and the last two weeks of rain, so a forecast for tomorrow would be me making something up.',
        detail: ['The hour strip in the Now tab does cover the rest of today'],
      };

    case 'sources':
      return {
        topic,
        answer: 'Four live weather numbers, weighted: dry air 35%, wind gusts 30%, heat 20%, days since rain 15%.',
        detail: [
          'Weather from Open-Meteo, satellite detections from NASA FIRMS, hazard zones from CAL FIRE',
          'All free and public, no accounts, no keys',
          'The Proof tab replays real fires so you can check the model against days we already know the end of',
        ],
      };

    case 'help':
      return {
        topic,
        answer: 'Ask me about this spot — whether it is safe to work, the wind, how dry it is, the hazard zone, the nearest fire, or where the worst of it is today.',
        detail: SUGGESTIONS.slice(0, 6),
      };

    case 'score':
      return {
        topic,
        answer: `${label} is at ${score} out of 100 — ${riskLevel(score)}.`,
        detail: [
          `${Math.round(weather.temp)}°F, ${Math.round(weather.humidity)}% humidity`,
          `Gusting ${Math.round(weather.windGust)} mph from the ${compass(weather.windFromDeg)}`,
          `${weather.daysSinceRain} days since measurable rain`,
        ],
      };

    default:
      // Nothing matched. Saying so beats answering a question nobody asked.
      return {
        topic: 'unknown',
        answer: 'I do not know that one. I only answer from the live readings behind this map, so I would rather say so than guess.',
        detail: SUGGESTIONS.slice(0, 6),
      };
  }
}

/**
 * Score each topic by the words it matches, longer phrases counting for
 * more -- "safe to work" should beat a stray "work". No match at all means
 * no answer, which is the point.
 */
function pick(question) {
  const text = ` ${question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `;
  let best = { id: null, weight: 0 };

  for (const topic of TOPICS) {
    let weight = 0;
    for (const word of topic.words) {
      if (text.includes(word.includes(' ') ? ` ${word} ` : ` ${word} `)) weight += word.split(' ').length * 2;
      else if (text.includes(word)) weight += 1;
    }
    if (weight > best.weight) best = { id: topic.id, weight };
  }
  return best.id;
}
