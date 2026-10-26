// Where is this fire headed? A grass or brush fire's head runs downwind at
// roughly 20% of the wind speed, so wind direction and speed are enough to
// draw a useful "get out of this area" cone.

const SPREAD_FRACTION = 0.2; // head-fire speed as a share of wind speed
const MILES_PER_DEGREE_LAT = 69;

/**
 * @param {{lat:number,lng:number}} origin  the fire
 * @param {number} windFromDeg  direction the wind is blowing FROM
 * @param {number} windMph
 * @param {number} hours  how far ahead to project
 * @returns {{heading:number, miles:number, polygon:[number,number][]}}
 */
export function spreadCone(origin, windFromDeg, windMph, hours = 1) {
  const heading = (windFromDeg + 180) % 360; // the fire goes where the wind is going
  const miles = Math.max(0.3, windMph * SPREAD_FRACTION * hours);

  // Strong wind pushes a fire in a tight line; light wind lets it fan out.
  const halfAngle = Math.min(40, Math.max(12, 42 - windMph));

  const polygon = [[origin.lat, origin.lng]];
  for (let a = -halfAngle; a <= halfAngle; a += 5) {
    polygon.push(project(origin, heading + a, miles));
  }
  return { heading, miles, polygon };
}

/** Move `miles` from a point along a compass bearing. */
function project({ lat, lng }, bearingDeg, miles) {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (miles * Math.cos(rad)) / MILES_PER_DEGREE_LAT;
  const dLng = (miles * Math.sin(rad)) / (MILES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** 237 -> "WSW". Dispatchers and neighbors think in compass points, not degrees. */
export const compass = (deg) => POINTS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

/** Straight-line miles between two points (flat-earth maths; fine at county scale). */
export function distanceMiles(a, b) {
  const dLat = (b.lat - a.lat) * MILES_PER_DEGREE_LAT;
  const dLng = (b.lng - a.lng) * MILES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** Compass bearing from point a to point b, in degrees. */
export function bearing(a, b) {
  const dLat = b.lat - a.lat;
  const dLng = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  return (((Math.atan2(dLng, dLat) * 180) / Math.PI) + 360) % 360;
}

/** Two crosswind directions -- the safe ways out, since you never run ahead of a fire. */
export const escapeRoutes = (heading) => [compass(heading + 90), compass(heading - 90)];
