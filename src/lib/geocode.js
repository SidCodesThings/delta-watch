// Search, so anyone can type where they care about and see the risk there.
//
// Two sources, because people type two different things. Open-Meteo's
// geocoder knows towns and regions; the Census Bureau's knows United States
// street addresses, which is what a farmer types when they mean their own
// land. Both are free and need no key. They are asked at the same time and
// the address matches come first, because someone who typed a house number
// meant a house.

const PLACES = 'https://geocoding-api.open-meteo.com/v1/search';
const ADDRESSES = '/api/geocode';            // the Census geocoder, proxied

/** Does this look like a street address rather than a place name? */
const looksLikeAddress = (query) => /\d/.test(query) && query.trim().length > 6;

export async function searchPlaces(query) {
  const [addresses, places] = await Promise.all([
    looksLikeAddress(query) ? findAddresses(query) : [],
    findPlaces(query),
  ]);
  return [...addresses, ...places].slice(0, 7);
}

async function findPlaces(query) {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' });
  const res = await fetch(`${PLACES}?${params}`);
  if (!res.ok) throw new Error('Place search is unavailable right now');
  const { results = [] } = await res.json();

  return results.map((place) => ({
    lat: place.latitude,
    lng: place.longitude,
    label: place.name,
    detail: [place.admin2, place.admin1, place.country_code].filter(Boolean).join(', '),
  }));
}

/**
 * Street addresses. A failure here is quiet on purpose: the place results
 * are already on their way, and a dead address lookup should not take the
 * search box down with it.
 */
async function findAddresses(query) {
  try {
    const res = await fetch(`${ADDRESSES}?address=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const body = await res.json();

    // Two shapes, one meaning. In production our own function has already
    // trimmed the Census answer down to {matches}; the development proxy
    // passes the Census response through untouched.
    const matches = body.matches
      ?? (body.result?.addressMatches ?? []).map((m) => ({
        label: m.matchedAddress, lat: m.coordinates.y, lng: m.coordinates.x,
      }));

    return matches.slice(0, 3).map((m) => ({
      lat: m.lat,
      lng: m.lng,
      label: titleCase(m.label),
      detail: 'Address',
      address: true,
    }));
  } catch {
    return [];
  }
}

/** The Census shouts its addresses back in capitals. */
function titleCase(text) {
  return text.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Nw|Ne|Sw|Se|Us|Ca)\b/g, (c) => c.toUpperCase());
}
