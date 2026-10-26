// Build the name list the watch board uses.
//
//   node tools/places.mjs
//
// A grid square knows its latitude and longitude, which is no use to a farmer
// deciding whether to go out. This turns coordinates into "Butte County" or
// "Nevada" by bundling one point per California county and per state, from
// the Census Bureau's own boundaries, and finding the nearest.
//
// It runs once and writes src/data/places.json. No key, nothing at runtime.

import { writeFileSync } from 'node:fs';

const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer';
const PLACES_SERVICE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer';
const TOWNS = 4;   // 'Incorporated Places' in the places service

/**
 * One point to stand for a whole shape. The centre of the bounding box is
 * the obvious choice and the wrong one: Idaho's box centre sits in the
 * panhandle's mountains and Florida's lands offshore. This takes the area
 * centroid of the biggest ring, which puts the point inside the body of the
 * state where the name belongs.
 */
function middle(rings) {
  const biggest = rings.reduce((best, ring) => (span(ring) > span(best) ? ring : best), rings[0]);
  let [twice, cx, cy] = [0, 0, 0];
  for (let i = 0, j = biggest.length - 1; i < biggest.length; j = i++) {
    const [x1, y1] = biggest[j];
    const [x2, y2] = biggest[i];
    const cross = x1 * y2 - x2 * y1;
    twice += cross; cx += (x1 + x2) * cross; cy += (y1 + y2) * cross;
  }
  if (!twice) return round(biggest[0][1], biggest[0][0]);
  return round(cy / (3 * twice), cx / (3 * twice));
}

/** Rough size of a ring, only ever compared against another ring. */
function span(ring) {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const [lng, lat] of ring) {
    if (lng < w) w = lng; if (lng > e) e = lng;
    if (lat < s) s = lat; if (lat > n) n = lat;
  }
  return (e - w) * (n - s);
}

const round = (lat, lng) => [Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000];

async function layer(id, where, label, { detail = '0.2' } = {}) {
  const params = new URLSearchParams({
    where, outFields: 'BASENAME', returnGeometry: 'true',
    maxAllowableOffset: detail, geometryPrecision: '3', outSR: '4326', f: 'json',
  });
  const body = await (await fetch(`${id === TOWNS ? PLACES_SERVICE : TIGER}/${id}/query?${params}`)).json();
  if (!body.features) throw new Error(body.error?.message ?? 'no features');
  return body.features.map((f) => {
    const [lat, lng] = middle(f.geometry.rings);
    return { name: label(f.attributes), lat, lng, rings: f.geometry.rings };
  });
}

/** Even-odd ray casting across every ring, holes included. */
function inside(rings, lat, lng) {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/**
 * Which county is each town in?
 *
 * Working it out at runtime by nearest county centroid gets it wrong often
 * enough to notice -- it paired Dos Palos, which is in Merced, with San
 * Benito. So it is settled here, once, against the real boundaries: the town
 * ships with its county already attached and the app just reads it.
 */
function placeIn(counties, town) {
  const holding = counties.find((county) => inside(county.rings, town.lat, town.lng));
  if (holding) return holding.name;
  // Coastal towns can fall just outside a generalized boundary; nearest wins.
  return counties.reduce((best, county) => {
    const gap = (county.lat - town.lat) ** 2 + ((county.lng - town.lng) * 0.79) ** 2;
    return gap < best.gap ? { gap, name: county.name } : best;
  }, { gap: Infinity, name: null }).name;
}

// Three lists, coarse to fine. A square in California is named by the town
// nearest it -- "near Oakdale, Stanislaus County" is an address a farmer can
// act on, where a county alone covers a thousand square miles. Outside the
// state a square is 170 miles across and the honest name is the state.
const TERRITORIES = ['Puerto Rico', 'Guam', 'American Samoa',
  'United States Virgin Islands', 'Commonwealth of the Northern Mariana Islands'];
const states = (await layer(0, '1=1', (a) => a.BASENAME))
  .filter((p) => !TERRITORIES.includes(p.name));
// Counties are pulled at finer detail than they are stored, because they are
// used here as boundaries to test towns against, not just as points.
const counties = await layer(1, "STATE='06'", (a) => `${a.BASENAME} County`, { detail: '0.02' });
const towns = await layer(TOWNS, "STATE='06'", (a) => a.BASENAME);

const places = {
  towns: towns.map((t) => ({ name: t.name, lat: t.lat, lng: t.lng, county: placeIn(counties, t) })),
  counties: counties.map(({ name, lat, lng }) => ({ name, lat, lng })),
  states: states.map(({ name, lat, lng }) => ({ name, lat, lng })),
};
writeFileSync(new URL('../src/data/places.json', import.meta.url), JSON.stringify(places));
console.log(`${towns.length} California towns, ${counties.length} counties, ` +
            `${states.length} states — ${(JSON.stringify(places).length / 1024).toFixed(1)} KB`);
