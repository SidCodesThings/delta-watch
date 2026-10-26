// NASA FIRMS satellite fire detections.
//
// Without a key, NASA publishes an open CSV for the contiguous USA and Hawaii
// -- enough for San Joaquin County, and it needs no sign-up. With a free map
// key in FIRMS_MAP_KEY, we use their worldwide API instead, so hotspots show
// up anywhere on Earth. Get one at firms.modaps.eosdis.nasa.gov/api/map_key
// and set it as an environment variable; nothing else has to change.
//
// Either way the feed sends no CORS headers, so the browser cannot read it
// directly. This endpoint fetches it server-side and passes it on. In
// development, vite.config.js proxies /api/firms to the same place.

const USA_CSV =
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv';

const worldCsv = (key) =>
  `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_NOAA20_NRT/world/1`;

export const FIRMS_CSV_URL = USA_CSV;

export default async function handler(_req, res) {
  const key = process.env.FIRMS_MAP_KEY;
  try {
    const upstream = await fetch(key ? worldCsv(key) : USA_CSV);
    const csv = await upstream.text();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Cache-Control', 's-maxage=600'); // NASA updates a few times an hour
    res.status(upstream.status).send(csv);
  } catch {
    res.status(502).send('Could not reach NASA FIRMS');
  }
}
