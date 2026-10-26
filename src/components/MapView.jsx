import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre does its tile maths on a background thread and ships that worker as
// a separate file, so the bundler has to be told where the built copy lives.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

import { COUNTY, PAN_BOUNDS, MIN_ZOOM } from '../lib/config.js';
import { readingAt } from '../lib/grid.js';
import { RISK_COLORS } from '../lib/risk.js';
import { addOurLayers, DETAIL_ZOOM, VECTOR_STYLE, RISK_LAYERS } from './mapLayers.js';

setWorkerUrl(workerUrl);

export default function MapView({
  cells, grid, backdrop, backdropGrid, zones, hotspots, reports, watch, location, cone,
  layers, basemap, focus, tilted, onSelect, onViewChange, onHover, onReady, onTrouble,
}) {
  const holder = useRef(null);
  const [map, setMap] = useState(null);
  const [coarse, setCoarse] = useState(false);

  // Handlers change on every render; the map is built once. A box that is
  // refreshed after each render lets the one-time listeners read the newest
  // ones without being torn down and rebuilt.
  const latest = useRef({ onViewChange, onHover, onSelect, onReady, onTrouble, grid, backdropGrid });
  useEffect(() => {
    latest.current = { onViewChange, onHover, onSelect, onReady, onTrouble, grid, backdropGrid };
  });
  const lastHovered = useRef(null);
  const lastPoint = useRef(null);
  const pinned = useRef(null);          // the held point, read by map handlers
  const [pin, setPin] = useState(null); // the same thing, for rendering

  useEffect(() => {
    const instance = new MapLibreMap({
      container: holder.current,
      center: [COUNTY.center[1], COUNTY.center[0]],
      zoom: window.innerWidth >= 900 ? COUNTY.zoom + 1 : COUNTY.zoom,
      minZoom: MIN_ZOOM,
      maxPitch: 75,
      maxBounds: [[PAN_BOUNDS[0][1], PAN_BOUNDS[0][0]], [PAN_BOUNDS[1][1], PAN_BOUNDS[1][0]]],
      attributionControl: false,
      // A vector basemap, so roads and coastlines are redrawn crisply at any
      // size instead of being enlarged from a fixed image.
      style: VECTOR_STYLE,
    });

    // 'style.load', not 'load'. The browser does not paint a surface it
    // believes is hidden, and 'load' waits for that first painted frame --
    // so a map built while the window is covered or in a background tab sits
    // black forever with none of our layers on it. The style being parsed is
    // all we actually need to add them.
    // A map that has lost its graphics context draws nothing at all, and a
    // black rectangle with no explanation is the worst thing this app could
    // show. Ask the browser to give it back, and say so either way.
    instance.on('webglcontextlost', () => latest.current.onTrouble?.(
      'The map lost its graphics context. Trying to restore it…'));
    instance.on('webglcontextrestored', () => latest.current.onTrouble?.(''));

    instance.on('style.load', () => {
      addOurLayers(instance);
      setMap(instance);
      latest.current.onReady?.(instance);
      // Report the opening view as well as every later one. Without this
      // first call nothing is requested until the user happens to move the
      // map, and the app sits on "reading live data" forever.
      latest.current.onViewChange(toBounds(instance));
    });

    // Follow the pointer. The panel wants the area it is over -- that is
    // where the reading comes from -- but the readout wants the exact spot,
    // because "the square north of Lodi" and "this corner of my field" are
    // not the same answer to someone standing in it.
    instance.on('mousemove', (e) => {
      if (pinned.current) return;              // frozen: the point is held
      const at = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      // The detailed grid where it reaches, the coarser one everywhere else.
      // A fine cell whose reading has not arrived is not an answer, so the
      // coarser tier gets its turn rather than the panel going blank.
      const cell = readingAt(latest.current.grid, at) ?? readingAt(latest.current.backdropGrid, at);
      tellPanel(cell, at);
    });
    instance.on('mouseout', () => {
      if (pinned.current) return;
      lastHovered.current = null;
      latest.current.onHover(null);
    });

    // Double-click holds the readout on one point, so you can take your hand
    // off the mouse and read it, or walk away and come back to it. Double
    // click again to let go. The map's own double-click zoom is turned off,
    // or every pin would also jump the camera.
    instance.doubleClickZoom.disable();
    instance.on('dblclick', (e) => {
      const at = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      if (pinned.current) {
        pinned.current = null;
        setPin(null);
        tellPanel(readingAt(latest.current.grid, at) ?? readingAt(latest.current.backdropGrid, at), at);
        return;
      }
      const cell = readingAt(latest.current.grid, at) ?? readingAt(latest.current.backdropGrid, at);
      pinned.current = at;
      setPin(at);
      lastHovered.current = null;              // force the panel to refresh
      tellPanel(cell, at, true);
    });

    function tellPanel(cell, at, force = false) {
      const id = cell?.id ?? null;
      // The square only changes every so often; the point changes constantly,
      // and the readout needs both, so this fires on either one moving.
      if (!force && id === lastHovered.current && same(at, lastPoint.current)) return;
      lastHovered.current = id;
      lastPoint.current = at;
      latest.current.onHover({ cell: cell ?? null, at, pinned: !!pinned.current });
    }

    // A trackpad's two-finger swipe arrives as a wheel event, and the map
    // reads every wheel event as zoom -- so swiping sideways did nothing at
    // all. Sideways-dominant scrolls now pan, the way they do in every other
    // map, while a plain vertical wheel still zooms for mouse users.
    instance.getCanvasContainer().addEventListener('wheel', (e) => {
      if (e.ctrlKey) return;                                  // pinch: let it zoom
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // vertical: let it zoom
      e.preventDefault();
      e.stopPropagation();
      instance.panBy([e.deltaX, 0], { duration: 0 }, { around: 'center' });
    }, { passive: false, capture: true });

    // Smaller steps per notch, so zooming glides instead of jumping.
    instance.scrollZoom.setZoomRate(1 / 180);
    instance.scrollZoom.setWheelZoomRate(1 / 700);

    // Dragging fires moveend over and over, and each one can start a grid
    // request and a several-hundred-shape zone query. Waiting for the map to
    // settle turns a burst of those into one, which is the difference between
    // a smooth pan and a stuttering one. Short, though: this delay is dead
    // time before the new squares are even asked for.
    let settle;
    const report = () => {
      clearTimeout(settle);
      settle = setTimeout(() => latest.current.onViewChange(toBounds(instance)), 200);
    };
    instance.on('moveend', report);
    // A window resize changes what is on screen just as much as a pan does.
    // Without this the grid keeps covering whatever the window used to be,
    // which shows up as a block of colour that stops short of the edges.
    instance.on('resize', report);
    instance.on('zoomend', report);

    // Clicking a fire picks it, exactly as it did on the flat map.
    for (const [layer, kind] of [['hotspots-dot', 'hotspot'], ['reports-dot', 'report']]) {
      instance.on('click', layer, (e) => {
        const f = e.features?.[0];
        if (f) latest.current.onSelect({ ...JSON.parse(f.properties.data), kind });
      });
      instance.on('mouseenter', layer, () => { instance.getCanvas().style.cursor = 'pointer'; });
      instance.on('mouseleave', layer, () => { instance.getCanvas().style.cursor = ''; });
    }

    return () => { clearTimeout(settle); instance.remove(); };
  }, []);

  // --- what gets drawn ----------------------------------------------------
  // Each layer's shapes are rebuilt only when its own data changes, then
  // handed to the map in one pass.

  const riskData = useMemo(() => scores(layers.grid ? cells : []), [cells, layers.grid]);
  // The coarser tier underneath -- California inside California, the country
  // anywhere else. It carries the colour whenever the fine squares cannot:
  // zoomed too far out for them to mean anything, or not back from the
  // service yet. Only ever one of the two is drawn; stacked, two translucent
  // fills show their overlap as a bright block.
  const backdropData = useMemo(() => scores(layers.grid ? backdrop : []), [backdrop, layers.grid]);

  const zoneData = useMemo(() => ({
    type: 'FeatureCollection',
    features: (layers.zones ? zones : []).map((zone) => ({
      type: 'Feature',
      properties: {
        // How badly this ground burns, and what today's weather does to it.
        tier: zone.hazard === 'Very High' ? 3 : zone.hazard === 'High' ? 2 : 1,
        score: zone.score ?? 0,
      },
      geometry: zone.geometry,
    })),
  }), [zones, layers.zones]);

  const coneData = useMemo(() => ({
    type: 'FeatureCollection',
    features: cone
      ? [{ type: 'Feature', properties: {},
           geometry: { type: 'Polygon', coordinates: [cone.polygon.map(([lat, lng]) => [lng, lat])] } }]
      : [],
  }), [cone]);

  // Each watched place carries its own colour and score, so the ring and the
  // number are drawn straight from the data with no second lookup.
  const watchData = useMemo(() => ({
    type: 'FeatureCollection',
    features: (layers.grid ? watch : []).map((place) => ({
      type: 'Feature',
      properties: { score: String(place.score), color: RISK_COLORS[place.level] },
      geometry: { type: 'Point', coordinates: [place.at.lng, place.at.lat] },
    })),
  }), [watch, layers.grid]);

  const hotspotData = useMemo(() => points(layers.hotspots ? hotspots : []), [hotspots, layers.hotspots]);
  const reportData = useMemo(() => points(layers.reports ? reports : []), [reports, layers.reports]);
  const meData = useMemo(() => points([location]), [location]);
  const pinData = useMemo(() => ({
    type: 'FeatureCollection',
    features: pin ? [{ type: 'Feature', properties: {},
                       geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] } }] : [],
  }), [pin]);

  useEffect(() => {
    if (!map) return;
    const drawn = { risk: riskData, backdrop: backdropData, zones: zoneData, cone: coneData,
                    watch: watchData, hotspots: hotspotData, reports: reportData,
                    me: meData, pin: pinData };
    for (const [id, data] of Object.entries(drawn)) map.getSource(id)?.setData(data);
  }, [map, riskData, backdropData, zoneData, coneData, watchData, hotspotData, reportData, meData, pinData]);

  // --- camera and style ---------------------------------------------------

  useEffect(() => {
    if (!map) return;
    map.setLayoutProperty('base-imagery', 'visibility', basemap === 'satellite' ? 'visible' : 'none');
    // Photographs are busier than the drawn map, so the heat is pushed a
    // little harder over them to stay legible.
    for (const id of RISK_LAYERS) {
      map.setPaintProperty(id, 'heatmap-intensity', basemap === 'satellite' ? 1.6 : 1.25);
    }
  }, [map, basemap]);

  // The whole of 3D: lift the camera and switch the ground model on.
  //
  // The order matters. Elevation arrives as its own tiles, and until they
  // are in, the map will not place a single label on the terrain -- so
  // tilting first dropped every risk number for as long as the download
  // took, which looked exactly like the data had fallen over. Instead the
  // ground model goes on, we wait for the map to go quiet, and only then
  // does the camera move. Pressing 3D now pauses for a beat and tilts into
  // a complete map, rather than tilting instantly into an empty one.
  useEffect(() => {
    if (!map) return undefined;
    const lift = () => map.easeTo({ pitch: tilted ? 62 : 0, bearing: 0, duration: 450 });

    if (!tilted) {
      // Coming back down needs nothing loaded, so it can start straight away.
      lift();
      const done = setTimeout(() => map.setTerrain(null), 500);
      return () => clearTimeout(done);
    }

    map.setTerrain({ source: 'dem', exaggeration: 1.5 });
    let waiting = true;
    const go = () => { if (waiting) { waiting = false; lift(); } };
    map.once('idle', go);
    // Never hold the button hostage to a slow network: tilt anyway.
    const fallback = setTimeout(go, 2500);
    return () => { waiting = false; clearTimeout(fallback); map.off('idle', go); };
  }, [map, tilted]);

  // The one rule about the two risk layers: draw the fine squares when they
  // cover what you are looking at, otherwise the coarser tier underneath.
  // It is decided on every movement rather than when new data arrives --
  // the instant the view leaves the squares we hold, the backdrop has to be
  // there already, or a fast pan lands on a frame of bare map. Zoomed out
  // past DETAIL_ZOOM a fine square would span whole states and one reading
  // could not honestly speak for it, so the backdrop takes over there too.
  useEffect(() => {
    if (!map) return;
    const box = spanOf(cells);
    let showing = null;

    const decide = () => {
      const b = map.getBounds();
      const fine = !!box && map.getZoom() >= DETAIL_ZOOM
        && b.getWest() >= box[0] && b.getSouth() >= box[1]
        && b.getEast() <= box[2] && b.getNorth() <= box[3];
      if (fine === showing) return;     // only touch the style when it changes
      showing = fine;
      for (const id of ['risk-fill', 'risk-fill-num']) {
        map.setLayoutProperty(id, 'visibility', fine ? 'visible' : 'none');
      }
      for (const id of ['risk-backdrop', 'risk-backdrop-num']) {
        map.setLayoutProperty(id, 'visibility', fine ? 'none' : 'visible');
      }
    };

    decide();
    map.on('move', decide);
    return () => map.off('move', decide);
  }, [map, cells]);

  // Watch the zoom so the app can say why the grid has gone quiet.
  useEffect(() => {
    if (!map) return;
    const check = () => setCoarse(map.getZoom() < DETAIL_ZOOM);
    check();
    map.on('zoomend', check);
    return () => map.off('zoomend', check);
  }, [map]);

  useEffect(() => {
    if (!map || !focus) return;
    // A focus can ask for a zoom -- a street address wants to land on the
    // street, not on the county. Otherwise keep whatever the user had, as
    // long as it is close enough to see anything.
    // Fly, always: watching the map travel is how you learn where a place is
    // in relation to where you were. The long ones get a little more time
    // and a flatter arc, which keeps the swoop from feeling flung.
    const from = map.getCenter();
    const away = Math.max(Math.abs(focus.lat - from.lat), Math.abs(focus.lng - from.lng));
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? Math.max(map.getZoom(), 10),
      duration: away > 1.2 ? 2200 : 1400,
      curve: away > 1.2 ? 1.3 : 1.42,
      essential: true,
    });
  }, [map, focus]);

  return (
    <>
      <div ref={holder} className="maplibre-canvas" />
      {coarse && layers.grid && (
        <div className="zoomhint">Nationwide view · zoom in for detail</div>
      )}
    </>
  );
}

/**
 * One point per scored area, carrying its number. Both the glow and the
 * labels are drawn from this: the heat is the same data as the digits, so
 * they can never disagree.
 */
const scores = (cells) => ({
  type: 'FeatureCollection',
  features: cells.filter((cell) => cell.score !== null && cell.score !== undefined).map((cell) => ({
    type: 'Feature',
    properties: { score: cell.score, label: String(cell.score) },
    geometry: { type: 'Point', coordinates: [cell.center.lng, cell.center.lat] },
  })),
});

/** Two points close enough that the readout would say the same thing. */
const same = (a, b) => !!a && !!b
  && Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5;

/** The box a set of squares covers, as [West, South, East, North]. */
function spanOf(all) {
  // Only cells with a reading count: an empty grid covers nothing, however
  // many placeholders it holds.
  const cells = all.filter((cell) => cell.weather);
  if (!cells.length) return null;
  const box = [180, 90, -180, -90];
  for (const { bounds: [[s, w], [n, e]] } of cells) {
    box[0] = Math.min(box[0], w); box[1] = Math.min(box[1], s);
    box[2] = Math.max(box[2], e); box[3] = Math.max(box[3], n);
  }
  return box;
}

/** Points carry their own record so a click can hand it straight back. */
const points = (list) => ({
  type: 'FeatureCollection',
  features: list.map((item) => ({
    type: 'Feature',
    properties: { data: JSON.stringify(item) },
    geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
  })),
});

const toBounds = (map) => {
  const b = map.getBounds();
  return { getWest: () => b.getWest(), getEast: () => b.getEast(),
           getSouth: () => b.getSouth(), getNorth: () => b.getNorth() };
};
