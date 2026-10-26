// Street addresses, from the Census Bureau's own geocoder.
//
// Open-Meteo's geocoder knows towns; it does not know "4820 E Highway 12".
// The Census Bureau publishes a geocoder for exactly that -- free, no key,
// no sign-up, and authoritative for United States addresses, which is the
// only country this app covers.
//
// It sends no CORS headers, so the browser cannot call it directly. This
// endpoint fetches it server-side and passes the matches on. In development,
// vite.config.js proxies /api/geocode to the same place.

export const CENSUS_GEOCODER =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

/** The query string the geocoder wants, built from a plain address. */
export function censusQuery(address) {
  return new URLSearchParams({
    address,
    benchmark: 'Public_AR_Current',
    format: 'json',
  }).toString();
}

export default async function handler(req, res) {
  const address = new URL(req.url, 'http://x').searchParams.get('address');
  if (!address) return res.status(400).json({ matches: [] });

  try {
    const upstream = await fetch(`${CENSUS_GEOCODER}?${censusQuery(address)}`);
    const body = await upstream.json();
    const matches = (body?.result?.addressMatches ?? []).map((m) => ({
      label: m.matchedAddress,
      lat: m.coordinates.y,
      lng: m.coordinates.x,
    }));
    res.setHeader('Cache-Control', 's-maxage=86400');   // an address does not move
    res.status(200).json({ matches });
  } catch {
    res.status(502).json({ matches: [] });
  }
}
