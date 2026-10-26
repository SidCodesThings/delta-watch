// CAL FIRE Fire Hazard Severity Zones: the official state map of which ground
// burns worst, rated on slope, fuel and fire history.
//
// The home county ships with the app so it draws the instant you open it;
// everywhere else is pulled from the state's own service as you move the map.
// CAL FIRE only maps California, so there is nothing to draw outside it.

import homeZones from '../data/hazardZones.json';

const SERVICE =
  'https://services.gis.ca.gov/arcgis/rest/services/Environment/Fire_Severity_Zones/MapServer/0/query';

// How much the terrain itself multiplies the danger. CAL FIRE rates these
// zones on slope, fuel and fire history -- a Very High zone turns the same
// weather into a noticeably worse day than flat irrigated farmland does.
export const HAZARD_WEIGHT = { Moderate: 0.85, High: 1.05, 'Very High': 1.25 };

/** Combine the terrain's rating with today's weather score for that spot. */
export const zoneScore = (weatherScore, hazard) =>
  Math.min(100, Math.round(weatherScore * (HAZARD_WEIGHT[hazard] ?? 1)));

/** The county's zones, ready before the first request comes back. */
export const HOME_ZONES = homeZones.features.map((f, i) => ({
  id: `home-${i}`,
  hazard: f.properties.hazard,
  geometry: f.geometry,
  center: centerOf(f.geometry),
}));

/**
 * Zones inside the given map bounds. Shapes are simplified in proportion to
 * how much ground is on screen, so a statewide view stays as quick as a
 * close-up one.
 */
export async function fetchZones(bounds) {
  const [west, south, east, north] = [
    bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
  ];

  // Zoomed out past a few states the zones are thinner than a pixel, so there
  // is nothing to see and no reason to ask for thousands of shapes.
  if (east - west > 24) return [];

  const params = new URLSearchParams({
    geometry: `${west},${south},${east},${north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    where: '1=1',
    outFields: 'HAZ_CLASS',
    returnGeometry: 'true',
    f: 'geojson',
    maxAllowableOffset: String(Math.max(0.0005, (east - west) / 600)),
    resultRecordCount: '400',   // plenty to see; keeps the map quick
  });

  const res = await fetch(`${SERVICE}?${params}`);
  if (!res.ok) throw new Error(`CAL FIRE service returned ${res.status}`);
  const { features = [] } = await res.json();

  // The service occasionally returns a record with no shape; drawing one of
  // those throws inside Leaflet and takes the map down with it.
  return features
    .filter((f) => f.geometry?.coordinates?.length)
    .map((f, i) => ({
      id: `zone-${i}`,
      hazard: f.properties.HAZ_CLASS,
      geometry: f.geometry,
      center: centerOf(f.geometry),
    }));
}

/** Rough middle of a polygon -- good enough to read the risk for the zone. */
function centerOf(geometry) {
  const points = flatten(geometry.coordinates);
  return {
    lat: points.reduce((s, p) => s + p[1], 0) / points.length,
    lng: points.reduce((s, p) => s + p[0], 0) / points.length,
  };
}

// Polygon and MultiPolygon nest coordinates to different depths; dig to the pairs.
function flatten(coords) {
  return typeof coords[0][0] === 'number' ? coords : coords.flatMap(flatten);
}
