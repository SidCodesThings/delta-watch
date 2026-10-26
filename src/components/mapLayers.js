// What the map draws, and in what order.
//
// Kept apart from MapView.jsx on purpose. That file is about behaviour --
// what happens when you move, hover, click or tilt. This one is a list of
// layers and the rules for painting them, which is the part you read when
// you want to know why something looks the way it does.

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
// Vector tiles for the plain map. Raster tiles blur the moment you enlarge
// them; vector ones are redrawn at whatever size the screen needs, so roads
// and coastlines stay sharp all the way in. Free, and no key.
export const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/dark';
// Real elevation, free and without a key.
const TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
// Below this a detailed square would span whole states, so only the national
// grid is drawn. One number, used by both the layer and the message about it.
export const DETAIL_ZOOM = 6.2;
// How solid the risk wash is at each score. Calm country stays a faint tint
// you can read the map through; only real risk is allowed to shout.
//
// Which is why the map no longer washes every square in colour. Covering the
// country in blocks meant the eye had to find the dangerous ones inside a
// quilt, and the map was painting thousands of polygons to say "most of
// America is fine today". Now a calm place simply looks like a map, each
// area carries its risk as a number, and heat only appears where there is
// something to be warned about.
const GLOW_FROM = 38;   // below this an area is ordinary, and stays plain

// Transparent until it matters, then amber, orange, red. The first two stops
// are the quiet ones: a heatmap with a hard edge at its threshold looks like
// a coffee stain, so the colour arrives gradually.
const GLOW_RAMP = [
  'interpolate', ['linear'], ['heatmap-density'],
  0.00, 'rgba(0,0,0,0)',
  0.12, 'rgba(255,205,80,0.20)',
  0.30, 'rgba(255,168,48,0.42)',
  0.52, 'rgba(242,112,13,0.60)',
  0.74, 'rgba(226,60,24,0.72)',
  1.00, 'rgba(207,34,34,0.82)',
];

/** How hard one area pushes on the glow: nothing until GLOW_FROM, then up. */
const glowWeight = ['interpolate', ['linear'], ['get', 'score'],
  GLOW_FROM - 1, 0, GLOW_FROM, 0.15, 55, 0.45, 70, 0.75, 85, 1];

export const RISK_LAYERS = ['risk-backdrop', 'risk-fill'];

/**
 * The map. One engine draws both views: flat is the same map with no tilt and
 * the terrain switched off, so every layer, every colour and every click
 * behaves identically whether you are looking straight down or across the
 * hills. Pressing 3D only changes the camera.
 *
 * Layers, from the ground up: imagery, the risk grid, place names, CAL FIRE
 * hazard zones, the spread cone, then the fires and your own position.
 */

const EMPTY = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };

/**
 * Everything we draw, added on top of the vector basemap once it is ready.
 * Order is paint order: the country first, the detailed grid over it, then
 * names, zones, and finally the fires so nothing buries them.
 */
export function addOurLayers(map) {
  for (const id of ['backdrop', 'risk', 'zones', 'cone', 'watch', 'hotspots', 'reports', 'me', 'pin']) {
    map.addSource(id, EMPTY);
  }

  // Slide the risk wash in underneath the basemap's roads and place names,
  // the way a radar sweep sits under the map furniture. Painted over the top
  // it swallows exactly the detail you need to know where you are looking.
  const firstLine = map.getStyle().layers
    .find((l) => l.type === 'line' || l.type === 'symbol')?.id;
  map.addSource('imagery', { type: 'raster', tiles: [IMAGERY], tileSize: 256, maxzoom: 18 });
  // Elevation, for when the 3D button tilts the camera.
  map.addSource('dem', { type: 'raster-dem', tiles: [TERRAIN], tileSize: 256,
                         maxzoom: 13, encoding: 'terrarium' });
  map.addSource('labels', { type: 'raster', tiles: [LABELS], tileSize: 256, maxzoom: 16 });

  map.addLayer({ id: 'base-imagery', type: 'raster', source: 'imagery', layout: { visibility: 'none' } }, firstLine);

  // The heat. Areas below GLOW_FROM contribute nothing at all, so a calm
  // part of the country is left looking like a map. The radius is in screen
  // pixels and the grids space their areas roughly a tenth of the screen
  // apart, so one radius works across the zooms each tier is drawn at.
  // Each tier spaces its areas differently, so each gets its own radius:
  // roughly one and a third times the gap between neighbours, which is what
  // makes a run of hot areas read as one region instead of a row of dots.
  const RADIUS = {
    backdrop: ['interpolate', ['linear'], ['zoom'], 3, 60, 5, 105, 7, 150, 9, 210],
    risk: ['interpolate', ['linear'], ['zoom'], 6, 95, 10, 110, 14, 130],
  };
  for (const [id, source] of [['risk-backdrop', 'backdrop'], ['risk-fill', 'risk']]) {
    map.addLayer({
      id, type: 'heatmap', source,
      paint: {
        'heatmap-weight': glowWeight,
        'heatmap-intensity': 1.25,
        'heatmap-color': GLOW_RAMP,
        'heatmap-radius': RADIUS[source],
        'heatmap-opacity': 0.95,
      },
    }, firstLine);
  }

  // Every area's risk as a plain integer, calm ones included. This is the
  // part that works everywhere: a number needs no legend, survives colour
  // blindness, and says "27" where a wash could only say "greenish".
  for (const [id, source] of [['risk-backdrop-num', 'backdrop'], ['risk-fill-num', 'risk']]) {
    map.addLayer({
      id, type: 'symbol', source,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9.5, 8, 12, 12, 14],
        'text-font': ['Noto Sans Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-allow-overlap': false,
        'text-padding': 2,
      },
      paint: {
        'text-color': ['case', ['>=', ['get', 'score'], GLOW_FROM], '#ffd9b0', 'rgba(203,216,232,.62)'],
        'text-halo-color': 'rgba(8,10,14,.9)',
        'text-halo-width': 1.3,
      },
    });
  }

  // County and state lines with their names, drawn over the risk wash. A
  // radar scope leans on these: without boundaries the colour is just colour,
  // and over farmland the vector basemap alone has very little to say.
  map.addLayer({ id: 'place-names', type: 'raster', source: 'labels',
                 paint: { 'raster-opacity': 0.75 } });

  // Ground that burns, shaded by how badly. A Very High zone in the
  // foothills is dangerous in a way the flat irrigated valley is not, and
  // that is true before today's weather is considered at all -- so it keeps
  // a standing tint, deepened by the risk score where the zone sits.
  map.addLayer({
    id: 'zones-fill', type: 'fill', source: 'zones',
    paint: {
      'fill-color': ['case',
        ['>=', ['get', 'tier'], 3], '#d2561c',
        ['>=', ['get', 'tier'], 2], '#c08a2a',
        '#6f7f52'],
      'fill-opacity': ['interpolate', ['linear'], ['get', 'score'],
        0, 0.07, 30, 0.13, 55, 0.22, 80, 0.32],
    },
  }, firstLine);

  // Thin, dim, and coloured by class. Plain white at full strength turned
  // the Sierra counties into static: hundreds of identical outlines, not one
  // of which said which ground was the dangerous ground.
  map.addLayer({
    id: 'zones-line', type: 'line', source: 'zones',
    paint: {
      'line-color': ['case',
        ['>=', ['get', 'tier'], 3], 'rgba(255,170,120,.8)',
        ['>=', ['get', 'tier'], 2], 'rgba(235,205,150,.55)',
        'rgba(205,220,200,.34)'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 0.9, 14, 1.4],
      'line-dasharray': [3, 2],
    },
  });

  map.addLayer({ id: 'cone-fill', type: 'fill', source: 'cone',
                 paint: { 'fill-color': '#ffb020', 'fill-opacity': 0.3 } });
  map.addLayer({ id: 'cone-line', type: 'line', source: 'cone',
                 paint: { 'line-color': '#ffb020', 'line-width': 2, 'line-dasharray': [3, 2] } });

  // The watch list, pinned. A ranked list in a panel is a list; the same
  // places marked on the map are a picture of where today is dangerous.
  // Hollow rings, so they read as "watch here" rather than "burning here" --
  // the solid dots are reserved for fires that actually exist.
  map.addLayer({
    id: 'watch-ring', type: 'circle', source: 'watch',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 8, 9, 12, 14],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 2,
      'circle-stroke-color': ['get', 'color'],
    },
  });
  map.addLayer({
    id: 'watch-label', type: 'symbol', source: 'watch',
    layout: {
      'text-field': ['get', 'score'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 11, 12, 13],
      'text-font': ['Noto Sans Bold', 'Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': ['get', 'color'],
      'text-halo-color': 'rgba(8,10,14,.85)',
      'text-halo-width': 1.4,
    },
  });

  map.addLayer({
    id: 'reports-dot', type: 'circle', source: 'reports',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.2, 8, 3.6, 13, 6],
      'circle-color': '#ffb020',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 1.2],
      'circle-stroke-color': 'rgba(255,255,255,.85)',
    },
  });
  map.addLayer({
    id: 'hotspots-dot', type: 'circle', source: 'hotspots',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.4, 8, 4, 13, 7],
      'circle-color': '#ff4126',
      'circle-opacity': 0.95,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 1.3],
      'circle-stroke-color': 'rgba(255,220,200,.75)',
    },
  });
  // The held point. Drawn as a ring on the ground rather than on the screen,
  // so it stays on the spot you chose while you pan around it.
  map.addLayer({
    id: 'pin-ring', type: 'circle', source: 'pin',
    paint: {
      'circle-radius': 9,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#eef2f7',
    },
  });
  map.addLayer({
    id: 'pin-dot', type: 'circle', source: 'pin',
    paint: { 'circle-radius': 2.5, 'circle-color': '#eef2f7' },
  });

  map.addLayer({
    id: 'me-dot', type: 'circle', source: 'me',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.4, 10, 5.5],
      'circle-color': '#38bdf8',
      'circle-stroke-width': 1.6, 'circle-stroke-color': '#fff',
    },
  });
}


/** Squares as filled polygons, nudged out so neighbours meet with no seam. */
