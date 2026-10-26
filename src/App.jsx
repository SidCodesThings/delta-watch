import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_LOCATION, STATE } from './lib/config.js';
import { fetchWeather, fetchHourly, cachedWeather } from './lib/weather.js';
import { fetchHotspots } from './lib/firms.js';
import { viewGrid, cellAt, readingAt, withReadings, covers, NATION_GRID, STATE_GRID } from './lib/grid.js';
import { HOME_ZONES, fetchZones, zoneScore } from './lib/hazard.js';
import { scoreRisk, workVerdict, safeWindow, riskLevel, RISK_COLORS } from './lib/risk.js';
import { adviseFor } from './lib/advice.js';
import { spreadCone, distanceMiles } from './lib/spread.js';
import { watchList, nearestWarning, nameFor } from './lib/watch.js';
import { loadReports } from './lib/reports.js';
import { readLink, linkFor } from './lib/link.js';
import { fetchArchive, longDate, FIRES } from './lib/hindsight.js';
import { SNAPSHOT_NATION, SNAPSHOT_STATE, howOld, snapshotIsFresh } from './lib/snapshot.js';

import MapView from './components/MapView.jsx';
import SearchPill from './components/SearchPill.jsx';
import AlertPill from './components/AlertPill.jsx';
import ControlRail from './components/ControlRail.jsx';
import LayersPanel from './components/LayersPanel.jsx';
import HourStrip from './components/HourStrip.jsx';
import Assistant from './components/Assistant.jsx';
import Sheet from './components/Sheet.jsx';
import SpotPanel from './components/SpotPanel.jsx';
import WorkCard from './components/WorkCard.jsx';
import FeatureList from './components/FeatureList.jsx';
import WatchBoard from './components/WatchBoard.jsx';
import ReportForm from './components/ReportForm.jsx';
import ActionPanel from './components/ActionPanel.jsx';
import HindsightPanel from './components/HindsightPanel.jsx';
import Guide from './components/Guide.jsx';

const ALL_LAYERS = { grid: true, zones: true, hotspots: true, reports: true };

/**
 * Pair each square of a grid with its reading, stamped with the view it was
 * built for. A square with no reading is simply left out, so a partial answer
 * still colours most of the map instead of none of it.
 */
const scoreCells = (grid, rows) => ({
  bbox: String(grid.bbox),
  list: withReadings(grid, rows).cells,
});

/** The mapped hazard zone a spot sits in, or null if none is near enough. */
function nearestZone(zones, at, withinMiles = 3) {
  let best = null;
  for (const zone of zones) {
    const miles = distanceMiles(at, zone.center);
    if (miles <= withinMiles && (!best || miles < best.miles)) best = { ...zone, miles };
  }
  return best;
}

/** How many of a grid's cells actually came back with a reading. */
const known = (cells) => cells.filter((cell) => cell.weather).length;
const MAX_RETRIES = 6;    // about a minute and a half of patience, then stop
const MAX_MARKERS = 140;  // the satellite feed is national; draw what is near
// "Around here" for the watch board: the home county and the ones touching
// it, roughly. Far enough to catch a fire that could reach you, close
// enough that every name on the list is somewhere you know.
const NEAR_MILES = 70;

export default function App() {
  // A link can say where to open. Read once, before anything else, so the
  // first request is already for the right place.
  const opened = useRef(readLink(window.location.search));

  const [location, setLocation] = useState(opened.current.place ?? DEFAULT_LOCATION);
  const [focus, setFocus] = useState(null);        // where the map should fly next
  const [myWeather, setMyWeather] = useState(null);
  const [grid, setGrid] = useState(null);          // the squares currently on screen
  // The scored squares for the current view, stamped with the view they were
  // built for, so the map can tell "these are the squares you are looking at"
  // from "these are the last place's squares, still on screen".
  const [cells, setCells] = useState({ bbox: '', list: [] });
  // The fixed tiers start from the readings that ship with the app, so the
  // first frame is a coloured map rather than a black one. Live readings
  // replace them within a second or two of opening.
  const [nation, setNation] = useState(SNAPSHOT_NATION);
  const [state, setState] = useState(SNAPSHOT_STATE);
  const [hourly, setHourly] = useState({});        // cell id -> today's 24 hours
  const [hour, setHour] = useState(null);          // null = right now
  const [zones, setZones] = useState(HOME_ZONES);  // CAL FIRE, county first then live
  const [hotspots, setHotspots] = useState([]);
  const [reports, setReports] = useState(loadReports);
  const [selected, setSelected] = useState(null);  // the fire we are projecting
  const [fireWind, setFireWind] = useState(null);  // wind at that fire
  const [layers, setLayers] = useState(ALL_LAYERS);
  const [basemap, setBasemap] = useState('plain');   // black ground, like a radar scope
  const [sheetOpen, setSheetOpen] = useState(true);
  const [tab, setTab] = useState('now');
  const [assistOpen, setAssistOpen] = useState(false);
  const [hidden, setHidden] = useState('');   // the warning the user waved away
  const [map, setMap] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [hovered, setHovered] = useState(null);    // square under the cursor
  const [tilted, setTilted] = useState(false);   // 3D is the same map, tilted
  const [replay, setReplay] = useState(null);      // a past fire we are re-running
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const hourlyPending = useRef(false);
  // onViewChange is built once, so it reads the replay through a ref.
  const replaying = useRef(false);
  const retry = useRef({ pending: false, count: 0 });
  const lastView = useRef('');

  /**
   * Several requests can fail at once, so the latch makes them share a single
   * retry. Without it each failure would schedule its own, every retry would
   * restart every request, and the number in flight would double each round.
   */
  function failed(e) {
    setError(e.message);
    if (retry.current.pending || retry.current.count >= MAX_RETRIES) return;
    retry.current.pending = true;
    setTimeout(() => {
      retry.current = { pending: false, count: retry.current.count + 1 };
      setAttempt((n) => n + 1);
    }, 15_000);
  }

  // Ask the browser where we are -- unless the link already said. Someone
  // who was sent a link about the Tracy block means the Tracy block, not
  // wherever the phone happens to be standing.
  useEffect(() => {
    if (opened.current.place) return;
    navigator.geolocation?.getCurrentPosition(
      (pos) => goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Your location' }),
      () => {},
      { timeout: 8000 },
    );
  }, []);

  // Weather for this spot. Drives the score and the work call.
  useEffect(() => {
    const asked = replay ? fetchArchive([location], replay.date) : fetchWeather([location], true);
    asked
      .then(([weather]) => {
        if (!weather) throw new Error('No reading for this spot yet.');
        setMyWeather(weather);
        setError('');
      })
      .catch(failed);
  }, [location, attempt, replay]);

  /**
   * Whenever the map settles, score whatever is now on screen. viewGrid snaps
   * its edges to round numbers, so nudging the map lands on the same grid --
   * and the same cached weather -- until you have genuinely moved somewhere new.
   */
  const onViewChange = useCallback((bounds) => {
    const next = viewGrid(bounds);
    const key = String(next.bbox);
    if (key === lastView.current) return;   // same squares as before; nothing to do
    lastView.current = key;

    setGrid(next);
    // Paint whatever is already cached for this view straight away. Pans
    // usually overlap where you just were, so most squares are already paid
    // for, and waiting on a round trip to redraw them is the difference
    // between the map feeling quick and feeling broken.
    // Not while replaying: the cache holds today's weather, and today has
    // nothing to say about the morning the Camp Fire started.
    const known = replaying.current ? [] : cachedWeather(next.cells.map((cell) => cell.center));
    if (known.some(Boolean)) setCells(scoreCells(next, known));

    setHourly({});          // those hours belonged to the old view
    setHour(null);
    hourlyPending.current = false;
    fetchZones(bounds).then(setZones).catch(() => {});
  }, []);

  useEffect(() => {
    if (!grid) return;
    let stale = false;
    const points = grid.cells.map((cell) => cell.center);

    const asked = replay ? fetchArchive(points, replay.date) : fetchWeather(points);
    asked
      .then((all) => {
        if (stale) return;   // the map moved on while this was in flight
        const scored = scoreCells(grid, all);
        setCells(scored);
        // A fetch can come back entirely empty without throwing -- when the
        // service refuses but something, somewhere, was cached. That used to
        // leave the map blank and the spinner turning with nothing to say.
        const got = known(scored.list);
        if (!got) setError('No readings came back for this view. The free weather service is probably at its daily limit.');
        else if (got === grid.cells.length) setError('');
      })
      .catch(failed);

    return () => { stale = true; };
  }, [grid, attempt, replay]);

  // The two fixed tiers, scored once each. They are fetched SEPARATELY and
  // drawn the moment either one lands, rather than waiting on both: asking
  // for all 330 points together meant no colour at all until the slowest
  // batch came back. California goes out first because that is where the app
  // opens, so the first thing to arrive is the thing on screen.
  useEffect(() => {
    // If what shipped with the app is still recent, that is the fetch. These
    // two tiers cost 330 locations of a 10,000-a-day allowance every cold
    // open, and they describe squares 60 to 170 miles across -- not the sort
    // of thing that changes in an hour.
    if (snapshotIsFresh()) return undefined;

    let alive = true;
    fetchWeather(STATE_GRID.cells.map((cell) => cell.center))
      .then((rows) => alive && setState(withReadings(STATE_GRID, rows).cells))
      .catch(failed);

    fetchWeather(NATION_GRID.cells.map((cell) => cell.center))
      .then((rows) => alive && setNation(withReadings(NATION_GRID, rows).cells))
      // Swallowing this hid a real failure once; say so instead.
      .catch(failed);

    return () => { alive = false; };
  }, [attempt]);

  // Satellite fire detections from the last 24 hours.
  useEffect(() => {
    fetchHotspots().then(setHotspots).catch(() => {});
  }, []);

  /**
   * The scrubber needs 24 readings for every square, as much data again as the
   * map itself. Nobody pays for that until they reach for the scrubber.
   */
  function loadHours() {
    if (!grid || Object.keys(hourly).length || hourlyPending.current) return;
    hourlyPending.current = true;
    fetchHourly(grid.cells.map((cell) => cell.center))
      // Keyed by square, not by position -- a square with no reading is
      // dropped from `cells`, so positions would not line up.
      .then((rows) => setHourly(Object.fromEntries(
        grid.cells.flatMap((cell, i) => (rows[i] ? [[cell.id, rows[i]]] : [])),
      )))
      .catch(() => {})
      .finally(() => { hourlyPending.current = false; });
  }

  /** Look up the wind at the fire itself, not where the user is standing. */
  function selectFire(fire) {
    setSelected(fire);
    setFireWind(null);
    setFocus(fire);
    if (fire) fetchWeather([fire]).then(([w]) => setFireWind(w)).catch(() => {});
  }

  function goTo(place) {
    setLocation(place);
    // Someone who typed a house number means that house: go all the way in.
    // A town or a county is a region, so the current zoom is usually right.
    setFocus(place.address ? { ...place, zoom: 14 } : place);
    retry.current = { pending: false, count: 0 };
  }

  useEffect(() => { replaying.current = !!replay; }, [replay]);

  // Keep the address bar on the spot, so copying it shares what is on
  // screen. replaceState, not push: panning around should not fill up the
  // back button.
  useEffect(() => {
    const url = `${window.location.pathname}${linkFor(location, replay?.name)}`;
    window.history.replaceState(null, '', url);
  }, [location, replay]);

  // A link can also name a fire to replay, which is how the Camp Fire in
  // the demo video is one URL rather than four clicks. Runs once; the
  // handler is rebuilt every render, so it is read through a ref rather
  // than listed as a dependency that would re-run this on every keystroke.
  const begin = useRef(null);
  begin.current = startReplay;
  useEffect(() => {
    const wanted = opened.current.fire;
    if (!wanted) return;
    const fire = FIRES.find((f) => f.name.toLowerCase() === wanted.toLowerCase());
    if (fire) begin.current(fire);
  }, []);

  /**
   * Re-run the whole app on the day a real fire started: fly to where it
   * began, score that spot and the map around it from the archive, and let
   * the number speak for itself. Leaving puts today back exactly as it was.
   */
  function startReplay(fire) {
    setReplay({ ...fire, from: location });
    setLocation({ ...fire.at, label: `${fire.name} — ignition point` });
    setFocus({ ...fire.at, zoom: 9 });
    setCells({ bbox: '', list: [] });
    lastView.current = '';
    setHourly({});
    setHour(null);
  }

  function exitReplay() {
    setLocation(replay?.from ?? DEFAULT_LOCATION);
    setFocus({ ...(replay?.from ?? DEFAULT_LOCATION) });
    setReplay(null);
    setCells({ bbox: '', list: [] });
    lastView.current = '';
  }

  const risk = myWeather && scoreRisk(myWeather);
  const cone = selected && fireWind && spreadCone(selected, fireWind.windFromDeg, fireWind.wind, 1);

  // Three requests fill the map and they finish at different times. Name the
  // one still out rather than showing a spinner that cannot tell you whether
  // the app is working or stuck -- "it is loading" is the one report nobody
  // can act on.
  const waitingOn = [
    !myWeather && 'your location',
    !replay && !nation.length && 'the country',
    !known(cells.list) && 'this view',
  ].filter(Boolean);
  const loading = waitingOn.length > 0;

  // Score every square. Parked on "now" we use the live reading; drag the
  // scrubber and we swap in that hour and score it the very same way.
  const scored = useMemo(
    () =>
      // Dense: a cell with no reading keeps its place and carries no score,
      // so the grid stays the shape cellAt expects.
      cells.list.map((cell) => ({
        ...cell,
        score: cell.weather
          ? scoreRisk(hour === null ? cell.weather : { ...cell.weather, ...hourly[cell.id]?.[hour] }).score
          : null,
      })),
    [cells, hourly, hour],
  );

  const scoredGrid = useMemo(() => grid && { ...grid, cells: scored }, [grid, scored]);

  // The backdrop: the finest fixed tier that covers the whole view. Inside
  // California that is the state grid, anywhere else the country. It is what
  // the map falls back to while the fine squares for a new place are still
  // in the air, so arriving somewhere never lands on bare map.
  const scoreAll = (list) =>
    list.map((cell) => ({ ...cell, score: cell.weather ? scoreRisk(cell.weather).score : null }));
  const scoredNation = useMemo(() => scoreAll(nation), [nation]);
  const scoredState = useMemo(() => scoreAll(state), [state]);

  const inState = grid ? covers(STATE.bbox, grid.bbox) : false;
  // The fixed tiers are today's weather, so they stay out of a replay: a
  // historic grid sitting on today's colour would be a lie by juxtaposition.
  const backdrop = useMemo(
    () => (replay ? [] : (inState && known(scoredState) ? scoredState : scoredNation)),
    [replay, inState, scoredState, scoredNation],
  );

  // That backdrop is whatever shipped with the app until today's readings
  // land. Say so: a fire map quietly showing three-day-old numbers would be
  // worse than one that admits it.
  // Ask a cell that actually has a reading. The first cell of the national
  // grid is a square of the Pacific off Baja with no weather in it, so
  // reaching straight for backdrop[0] crashed the app the moment you zoomed
  // far enough out to switch tiers.
  const sample = backdrop.find((cell) => cell.weather);
  const savedBackdrop = sample?.weather.stale ? howOld(sample.weather.takenAt) : null;
  const backdropGrid = useMemo(
    () => (replay ? { ...NATION_GRID, cells: [] }
      : inState && known(scoredState)
        ? { ...STATE_GRID, cells: scoredState }
        : { ...NATION_GRID, cells: scoredNation }),
    [replay, inState, scoredState, scoredNation],
  );


  // Where the worst of it is, across everything we have scored -- the fine
  // squares on screen plus the coarse tier behind them, so the board still
  // has something to say about the rest of the state when you are zoomed
  // into one field.
  // Two boards, not one. The statewide worst is interesting; the county you
  // farm is the one you act on, and a list sorted purely by score buries it
  // under whatever corner of the desert is hottest today. So the near list
  // comes first and the rest of California follows, with no repeats.
  const scoredAnywhere = useMemo(
    () => [...scored, ...backdrop].filter((cell) => cell.weather),
    [scored, backdrop],
  );
  const nearby = useMemo(
    () => watchList(scoredAnywhere, { from: location, limit: 4, within: NEAR_MILES }),
    [scoredAnywhere, location],
  );
  // Is the person standing in California? If so the second board stays
  // inside the state -- it is headed "elsewhere in California", and a list
  // under that heading full of Florida and Texas is simply wrong. Outside
  // the state we drop the filter and say so in the heading instead.
  const atHome = covers(STATE.bbox, [location.lng, location.lat, location.lng, location.lat]);
  const elsewhere = useMemo(
    () => watchList(
      atHome
        ? scoredAnywhere.filter((cell) =>
            covers(STATE.bbox, [cell.center.lng, cell.center.lat, cell.center.lng, cell.center.lat]))
        : scoredAnywhere,
      { from: location, limit: 4, skip: nearby.map((p) => p.region ?? p.name) },
    ),
    [scoredAnywhere, location, nearby, atHome],
  );
  const watch = useMemo(() => [...nearby, ...elsewhere], [nearby, elsewhere]);
  // The banner is about what is close, which the near list already is.
  const watchWarning = useMemo(() => nearestWarning(nearby), [nearby]);

  // Every fire row says which day it is about. For the forecast half of the
  // Fires tab that day is today, unless we are replaying one that already
  // happened, in which case it is that morning.
  const todayLabel = replay
    ? longDate(replay.date)
    : new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  // Each hazard zone takes the score of the square it sits in, multiplied by
  // how badly that terrain burns.
  const scoredZones = useMemo(
    () => zones.map((zone) => ({
      ...zone,
      score: zoneScore(
        readingAt(scoredGrid, zone.center)?.score ?? readingAt(backdropGrid, zone.center)?.score ?? 0,
        zone.hazard,
      ),
    })),
    [zones, scoredGrid, backdropGrid],
  );

  // The national feed holds thousands of detections; draw the ones on screen.
  // Filtering a national feed of detections against the grid on every render
  // was showing up as a stall while panning.
  const nearbyHotspots = useMemo(
    () => (grid ? hotspots.filter((h) => cellAt(grid, h)).slice(0, MAX_MARKERS) : []),
    [hotspots, grid],
  );

  // 64 squares x 24 hours is over 1,500 scores, so only redo it when the hourly
  // data itself changes -- not on every render.
  const hourlyAverages = useMemo(
    () => {
      const withHours = cells.list.filter((cell) => cell.weather && hourly[cell.id]);
      if (!withHours.length) return [];
      return Array.from({ length: 24 }, (_, h) =>
        Math.round(
          withHours.reduce((sum, cell) => sum + scoreRisk({ ...cell.weather, ...hourly[cell.id][h] }).score, 0) /
            withHours.length,
        ));
    },
    [cells, hourly],
  );

  /**
   * The spot the sidebar is describing: the square under the cursor while you
   * are over the map, and wherever you are the rest of the time.
   */
  const hoveredCell = hovered?.cell?.weather ? hovered.cell : null;
  // The reading belongs to the area, but the place belongs to the point the
  // cursor is actually on -- so the panel names the ground under the arrow,
  // not the middle of the square it happens to sit in.
  const spotPlace = hovered?.at ? nameFor(hovered.at) : null;

  // Where you are, from your own live reading -- or, if that one request has
  // not landed, from the square of the map you are standing in. The panel is
  // the whole app; letting it go blank because a single fetch was refused
  // turned a quota hiccup into a broken product.
  const hereCell = readingAt(scoredGrid, location) ?? readingAt(backdropGrid, location);
  const here = myWeather
    ? { weather: myWeather, score: risk?.score ?? 0, label: location.label, at: location, hovering: false }
    : {
        weather: hereCell?.weather ?? null,
        score: hereCell?.score ?? 0,
        label: location.label,
        at: location,
        hovering: false,
      };
  const spot = hoveredCell
    ? {
        weather: hoveredCell.weather,
        score: hoveredCell.score,
        label: spotPlace
          ? `${spotPlace.name}${spotPlace.region ? `, ${spotPlace.region}` : ''}`
          : `${hovered.at.lat.toFixed(3)}, ${hovered.at.lng.toFixed(3)}`,
        at: hovered.at,
        hovering: true,
        pinned: hovered.pinned,
      }
    : here;

  /** Hand today's call to someone else — a text, an email, whatever they use. */
  function share() {
    const text =
      `DeltaWatch — fire risk at ${location.label} is ${risk.score}/100 (${risk.level}). ` +
      `${Math.round(myWeather.humidity)}% humidity, gusts ${Math.round(myWeather.windGust)} mph. ` +
      `Equipment: ${workVerdict(myWeather, risk.score).call.toUpperCase()}.`;
    // The link matters as much as the sentence: whoever opens it gets the
    // same spot with its own live numbers, not a stale screenshot.
    const url = `${window.location.origin}${window.location.pathname}${linkFor(location, replay?.name)}`;
    if (navigator.share) navigator.share({ text, url }).catch(() => {});
    else navigator.clipboard?.writeText(`${text} ${url}`);
  }

  // Built from the spot the panel is describing, not from your own live
  // reading. Gating it on myWeather meant that when that one request was
  // refused -- or when a replay put historic weather on screen -- the
  // warnings across the top vanished, Delta T among them.
  const advice = spot.weather && adviseFor(spot.weather, spot.score, nearbyHotspots, spot.at);
  // A place near you being close to ignition is worth the same banner as your
  // own conditions being bad -- often more, because it is the thing you
  // cannot see out of the window. It goes first when it is serious.
  const nearbyAlert = watchWarning && {
    level: watchWarning.level === 'extreme' ? 'stop' : 'warn',
    title: `${watchWarning.score} of 100 ${watchWarning.name}`,
    detail: `${watchWarning.miles} mi ${watchWarning.dir} of you, ${watchWarning.driver.toLowerCase()} leading.`,
  };
  const topWarning = [nearbyAlert, ...(advice?.warnings ?? [])]
    .find((w) => w && w.level !== 'ok' && w.title !== hidden)
    ?? advice?.warnings.find((w) => w.title !== hidden);

  // Everything the assistant is allowed to answer from. If it is not in
  // here it cannot say it, which is the whole design.
  const askContext = spot.weather && {
    weather: spot.weather, score: spot.score, label: spot.label,
    hotspots: nearbyHotspots, at: spot.at,
    // The mapped zone closest to the spot, and only if it is genuinely
    // close. Testing the point against every polygon on every render would
    // cost more than the answer is worth, and "the nearest zone, six miles
    // away" would be a misleading thing to call "this ground".
    hazard: nearestZone(scoredZones, spot.at),
    watch, fires: FIRES,
  };

  return (
    <div className="app">
      <MapView
        cells={scored}
        grid={scoredGrid}
        backdrop={backdrop}
        backdropGrid={backdropGrid}
        watch={watch}
        zones={scoredZones}
        hotspots={nearbyHotspots}
        reports={reports}
        location={location}
        cone={cone}
        layers={layers}
        basemap={basemap}
        focus={focus}
        tilted={tilted}
        onSelect={selectFire}
        onViewChange={onViewChange}
        onHover={setHovered}
        onReady={setMap}
        onTrouble={setError}
      />

      <div className="overlay">
        <SearchPill
          location={location}
          weather={spot.weather}
          score={spot.weather ? spot.score : undefined}
          color={RISK_COLORS[riskLevel(spot.score)]}
          onPick={goTo}
          onGuide={() => setGuideOpen(true)}
        />

        <AlertPill warning={topWarning} onDismiss={() => setHidden(topWarning.title)} />

        {!loading && !error && savedBackdrop && (
          <div className="toast quiet">
            Background colour is the saved reading, {savedBackdrop}. Your own spot is live.
          </div>
        )}

        {(loading || error) && (
          <div className="toast">
            {!error && <span className="spinner" />}
            {error || `Reading ${replay ? `${replay.name} weather` : 'live weather'} — waiting on ${waitingOn.join(', ')}…`}
          </div>
        )}

        <ControlRail
          map={map}
          tilted={tilted}
          sheetOpen={sheetOpen}
          onTilt={() => setTilted((on) => !on)}
          onLocate={() => setFocus({ ...location })}
          onSheet={() => setSheetOpen((on) => !on)}
          layersOpen={sheetOpen && tab === 'layers'}
          onLayers={() => { setTab('layers'); setSheetOpen(true); }}
        />

        <Assistant
          context={askContext}
          open={assistOpen}
          onToggle={() => setAssistOpen((on) => !on)}
          onShare={risk ? share : null}
        />

        <Sheet open={sheetOpen} tab={tab} onTab={setTab} onClose={() => setSheetOpen(false)}>
          {!spot.weather && <p className="muted">Loading conditions…</p>}

          {spot.weather && tab === 'now' && (
            <>
              <SpotPanel
                weather={spot.weather}
                score={spot.score}
                label={spot.label}
                hovering={spot.hovering}
                pinned={spot.pinned}
                hotspots={nearbyHotspots}
                at={spot.at}
              />
              {/* The work call and the hour strip are about where you are
                  standing, so they wait for your own live reading. The spot
                  panel does not: it can describe any square on the map. */}
              {/* The work call describes a PLACE, so it follows the spot the
                  panel is describing rather than waiting on a live fix of
                  where you are standing. Gating it on your own location
                  meant the most important answer in the app disappeared
                  whenever that one request was refused. */}
              <WorkCard verdict={workVerdict(spot.weather, spot.score)} window={safeWindow(spot.weather)} />

              {/* The hour strip genuinely needs hour-by-hour readings, which
                  only your own location has. */}
              {spot.weather && (
                <HourStrip
                  hour={hour}
                  nowHour={Number(spot.weather.observedAt.slice(11, 13))}
                  averages={hourlyAverages}
                  onHour={setHour}
                  onOpen={loadHours}
                />
              )}
            </>
          )}

          {tab === 'past' && (
            <HindsightPanel
              replay={replay}
              score={risk?.score}
              level={risk?.level}
              onReplay={startReplay}
              onExit={exitReplay}
            />
          )}

          {tab === 'fires' && (
            <>
              {/* The board runs off the squares, not off your own reading, so
                  it has something to say before -- or instead of -- a live
                  fix on where you are standing. */}
              <WatchBoard
                nearby={nearby}
                elsewhere={elsewhere}
                elsewhereLabel={atHome ? 'Elsewhere in California' : 'Elsewhere in the US'}
                near={NEAR_MILES}
                today={todayLabel}
                onGoTo={(place) => goTo({ ...place.at, label: `${place.name}${place.region ? `, ${place.region}` : ''}` })}
              />
              {cone && (
                <ActionPanel fire={selected} cone={cone} location={location} onClear={() => selectFire(null)} />
              )}
              <FeatureList
                hotspots={nearbyHotspots}
                reports={reports}
                location={location}
                onSelectFire={selectFire}
                onReplay={(fire) => { startReplay(fire); setTab('past'); }}
              />
            </>
          )}

          {tab === 'layers' && (
            <LayersPanel
              layers={layers}
              counts={{
                grid: scored.length + backdrop.length,
                zones: scoredZones.length,
                hotspots: nearbyHotspots.length,
                reports: reports.length,
              }}
              basemap={basemap}
              tilted={tilted}
              onToggle={(key) => setLayers({ ...layers, [key]: !layers[key] })}
              onBasemap={() => setBasemap(basemap === 'satellite' ? 'plain' : 'satellite')}
              onTilt={() => setTilted((on) => !on)}
            />
          )}

          {tab === 'report' && (
            <ReportForm
              location={location}
              reports={reports}
              onReportsChange={setReports}
              onSelect={selectFire}
            />
          )}
        </Sheet>
      </div>

      {guideOpen && <Guide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
