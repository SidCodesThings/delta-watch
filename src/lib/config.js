// Everything about "where we are looking" lives here.

// The home county: what the app opens on, and what the project is built for.
export const COUNTY = {
  name: 'San Joaquin County, CA',
  center: [37.93, -121.27],      // Stockton
  zoom: 9,
  bbox: [-121.65, 37.45, -120.88, 38.32],   // [West, South, East, North]
};

// The risk grid covers whatever is on screen, at the same detail everywhere.
// Ten by ten shows structure rather than blobs while keeping a new view to a
// hundred readings, which comes back in about a second -- the difference
// between arriving somewhere and waiting to find out about it. Each square is
// cached by its own position, so sliding the map only pays for what is new.
export const GRID_SIZE = { cols: 10, rows: 10 };

// A fixed grid over the whole country, always drawn, so every place in the US
// carries a rating whether or not you have zoomed to it. It never moves, so
// one request covers it and the answer is reused for everything afterwards.
export const NATION = {
  bbox: [-125, 24.5, -66.5, 49.5],          // the contiguous states
  grid: { cols: 23, rows: 10 },             // about 170 miles a side
};

// The home state at a middle resolution, scored once at startup. Without it
// there is a hole between the tiers: a 170-mile national square says almost
// nothing about a county, and the fine grid takes a moment to arrive, so
// jumping across California used to land on bare map. This covers the gap.
export const STATE = {
  name: 'California',
  bbox: [-124.5, 32.4, -114.0, 42.1],
  grid: { cols: 10, rows: 10 },             // about 60 miles a side
};

// The map stays over the United States. That is where our data lives: NASA's
// no-key satellite feed is national, CAL FIRE's zones are Californian, and a
// fire-risk map of the open ocean helps nobody.
export const US_BOUNDS = [[24.0, -125.5], [49.5, -66.5]];   // [[S,W],[N,E]]

// The wall the map will not pan past. Deliberately far wider than the country
// itself: clamped right at the coastline, dragging west feels like the map is
// stuck rather than bounded, which reads as a broken control.
export const PAN_BOUNDS = [[10.0, -172.0], [72.0, -50.0]];
export const MIN_ZOOM = 3.4;

export const DEFAULT_LOCATION = { lat: 37.93, lng: -121.27, label: 'Stockton (county center)' };
