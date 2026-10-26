# DeltaWatch

**Wildfire prevention and response for San Joaquin County.**

Most fire apps tell you about a fire after it starts. DeltaWatch predicts where
fires are likely *today*, tells farmers whether it is safe to run equipment, and
helps people report a fire faster and get out of its way.

Built for farmers and landowners in the valley, where equipment sparks on dry
grass start a large share of fires.

---

## What it does

| # | Feature | Where the code lives |
|---|---------|----------------------|
| 1 | **Risk numbers and heat** - every area scored as an integer; only dangerous ones glow | `lib/grid.js`, `lib/risk.js`, `components/MapView.jsx` |
| 2 | **Delta T warning** - flags the sudden heat-up + humidity-drop pattern | `lib/risk.js` (`deltaT`) |
| 3 | **Safe to work today?** - go / caution / stop for mowing and equipment | `lib/risk.js` (`workVerdict`), `components/WorkCard.jsx` |
| 4 | **Search by town or street address** - check the risk on your own land, not just your county | `lib/geocode.js`, `api/geocode.js` |
| 5 | **CAL FIRE hazard zones** - the official terrain ratings, fetched live for wherever you are looking | `lib/hazard.js` |
| 6 | **Live hotspots** - NASA satellite fire detections from the last 24 hours | `lib/firms.js`, `api/firms.js` |
| 7 | **Report smoke** - photo + GPS, with an automatic colour check | `lib/reports.js`, `components/ReportForm.jsx` |
| 8 | **Spread prediction** - a cone showing where the wind is pushing a fire | `lib/spread.js` |
| 9 | **Act** - one-tap 911 with a dispatcher script, downwind alert, checklist | `components/ActionPanel.jsx` |
| 10 | **Today, hour by hour** - the risk for each hour ahead, and the mildest window left | `components/HourStrip.jsx`, `lib/weather.js` (`fetchHourly`) |
| 11 | **Layer controls** - every layer on or off, plain or satellite ground, 2D or 3D | `components/LayersPanel.jsx` |
| 12 | **Fire Assistant** - eighteen topics, answered out of the live model, and it says so when a question is outside them | `lib/assistant.js`, `components/Assistant.jsx` |
| 13 | **A panel you can move** - drag it anywhere, resize it, or close it | `components/Sheet.jsx`, `lib/useDraggable.js` |
| 14 | **Fires tab** - what could happen (ranked, named, pinned on the map) and what did (detections and past fires, all dated) | `lib/watch.js`, `components/WatchBoard.jsx`, `components/FeatureList.jsx` |
| 15 | **Hindsight** - replay the day a real fire started and see what the app would have said | `lib/hindsight.js`, `components/HindsightPanel.jsx`, `tools/backtest.mjs` |
| 16 | **In-app guide** - every feature explained inside the app itself | `components/Guide.jsx` |

---

## Does the number mean anything?

A fire-risk model that has never been checked against a real fire is a colour
scheme. So the app can replay one.

Open the **Proof** tab, pick the Camp Fire, and the whole map re-runs on the
weather of 8 November 2018 at Paradise. Same `scoreRisk`, same four signals,
nothing tuned for the occasion - only the weather is historical, from
Open-Meteo's free archive. It reads **75, extreme**, and the hard limit fires
at 58 mph gusts. A model that only knew about heat would have missed that
morning entirely: it was 63 F.

Then the harder question, because "fires start on hot dry days" is not a
finding if every day that summer was hot and dry. `tools/backtest.mjs` scores
all fourteen ignition days **and every other day in the two months either side
of each one, at the same place** - 1,596 ordinary days as the control:

```
rated extreme, ignition days   93%   (13 of 14)
rated extreme, ordinary days   41%
mean score, ignition days      79
mean score, ordinary days      63
lift                           x2.3
```

Run it yourself with `node tools/backtest.mjs`; it reads the same fire list
the app shows and the same model the map draws, so the numbers cannot drift
away from the product.

What the honest version of that claim sounds like: **a fire day is 2.3 times
likelier to be rated extreme than an ordinary day in the same place and
season.** Not every extreme day has a fire - 41% of fire-season days are
extreme in these places, and most of them pass quietly. The model cannot tell
you a fire *will* start, because that needs a spark and nothing forecasts
those. It tells you the day is ready for one.

The one that does not fit is worth saying out loud too: the **Carr Fire** sat
at the 32nd percentile of its own season. It scored 75 - extreme - but that
July was *consistently* extreme around Whiskeytown, so the day it started was
not unusual there. That is the model being honest rather than lucky.

---

## The risk model, in one page

This is the part to explain first. It is four numbers, four weights, and one
original idea.

### Four signals

Each is scaled from 0 (harmless) to 1 (worst case). The **top** of each scale
is a red-flag condition, the numbers CAL FIRE warns on. The **bottom** is the
point where the signal stops being irrelevant -- not the warning threshold
itself:

| Signal | 0 at | 1 at | Weight |
|--------|------|------|--------|
| Dry air (relative humidity) | 55% | 15% | **0.35** |
| Wind gusts | 5 mph | 30 mph | **0.30** |
| Heat | 55 F | 95 F | **0.20** |
| Days since rain | rained today | 14 dry days | **0.15** |

That second column is a correction worth explaining. The first version started
every scale at the red-flag threshold, which sounds rigorous and is useless:
on an ordinary October day three of the four signals read exactly 0.00 for the
entire country, so every square scored the same low number and the map was one
flat colour. A scale that only moves during the worst week of the year cannot
say anything about the other fifty. Today the same live readings spread from
11 (Seattle) through 27 (Stockton) and 34 (the Sierra foothills) to 43 in the
Nevada desert -- still a low-risk day everywhere, but a *readable* one.

Multiply, add, multiply by 100 -> a score from 0 to 100.

### Delta T (our idea)

A single hot day is not what burns the valley down. What burns it down is a
*sudden change*: the temperature jumping while humidity falls away. That is the
fingerprint of a dry offshore wind event.

So we compare **today against the average of the three days before it**:

```
temperature rise  >= 5 F      AND      humidity drop >= 8 points
```

When both are true we raise a **Delta T warning** and add 12 points to the score.
No other consumer fire app we found looks at the *change*; they all look at
today's numbers alone.

### The panel that follows your cursor

Hovering a square rewrites the whole left panel for that spot: its score, the
warnings that apply there, which signal is driving the number, what to carry
outside, and the nearest satellite detection with the crosswind way out. Move
off the map and it describes where you are instead.

All of it comes out of `lib/advice.js`, which reads the same model the map
does - there is no second set of thresholds anywhere.

### The Fire Assistant is not a language model

It matches your question against a short list of things it genuinely knows -
whether it is safe to work, when today gets milder, what to carry, where the
nearest fire is, why the score is what it is - and answers each from the same
risk model the map draws. That is a deliberate choice, not a shortcut: it
cannot invent a number, every answer traces back to live weather, and it needs
no API key, no account and no running cost. A language model could phrase
things more freely; it could also make something up, which in a fire tool is
worse than saying nothing.

### Why 3D, and why it is the same map

Fire runs uphill several times faster than it runs on the flat, so the shape of
the ground matters as much as the weather does. Pressing 3D tilts the camera
and switches on a terrain model built from free AWS elevation tiles - that is
the whole change. One engine (MapLibre) draws both views, so every layer,
colour, click and hover behaves identically whether you are looking straight
down or across the hills, and there is no second copy of the drawing code to
keep in step.

### The risk grid - risk everywhere, not just where a fire is

Three grids are in play, and only ever one of them is on screen.

**The country.** A fixed 23 x 10 grid over the lower 48 - 230 squares, about
170 miles a side - scored the moment the app opens, so there is colour
everywhere from the first second.

**The state.** California at 10 x 10, about 60 miles a side, also scored once
at startup. This is the tier that makes the map feel instant: a national
square says almost nothing about a county, and without something in between,
jumping across the state landed on bare map until the fine squares arrived.

**Where you are looking.** Past zoom 6.2 the view itself is cut into a 10 x 10
grid, each square with its own live weather. Panning to the next county
re-scores what you moved to.

The rule for which one draws is one line of geometry: **the fine squares when
they cover what is on screen, otherwise the tier underneath.** It is checked
on every movement rather than when new data arrives, so the moment the view
leaves the squares we hold, the coarser colour is already there. The two never
draw together - stacked, two translucent fills show their overlap as a bright
block.

Nothing is ever waited on twice. The grid's edges snap to round numbers, so
small movements land on the same squares, and whatever is already cached is
painted *before* the request goes out - an overlapping pan repaints with no
round trip at all. Measured on a cold cache, jumping between Redding, San
Diego, Bishop and Palm Springs: colour on screen in the first frame every
time, fine squares about a third of a second later.

Colour is reserved for trouble. Every area prints its score on the map as a
plain integer, calm ones included, and heat is only painted from **38**
upwards: amber, then orange, then red. Below that the map is left alone.

An earlier version washed every square in colour. It meant hunting for the
dangerous areas inside a quilt, and it painted thousands of polygons to say
"most of the country is fine today" - which is what made the map slow to
settle. A number needs no legend, survives colour blindness and says *27*
where a wash could only say *greenish*; the glow is there to catch your eye
from across the room. Over satellite photographs the heat is pushed harder,
because imagery is already busy.

### Two crashes from the same mistake

Both came from assuming a square has a reading in it.

The first: pairing cells with readings used to drop the gaps, which shifted
every later cell and silenced the north of the state (below). The second:
the badge that says how old the shipped readings are reached straight for
`backdrop[0].weather` — and the first square of the national grid is a patch
of the Pacific off Baja with no weather in it, so zooming far enough out to
switch tiers took the whole app down.

The rule the code now follows: **never assume a square has a reading, and
never assume the first one does.** `readingAt` returns a cell only when it
has data, `watchList` filters before it ranks, and anything that needs a
sample finds one rather than taking index zero. Both are pinned by tests.

### Why the north of the state went quiet

Worth recording, because the symptom pointed nowhere near the cause.
Hovering southern California gave a full readout; the north of the state
gave nothing at all.

`cellAt` finds a cell by index arithmetic - row times columns plus column -
so the list has to be exactly as long as the grid and in order. The code
that paired cells with their readings used a `flatMap` that **dropped** any
cell whose reading had not arrived. Every later cell shifted down by one,
and the last rows ran off the end of the array entirely. Rows are built
south to north, so the south answered and the north returned nothing.

Grids are now dense: a cell with no reading keeps its place and carries
null, and the drawing code skips it. `readingAt` is the lookup to use when
an answer is only useful if it has data behind it - it falls through to the
coarser tier instead of leaving the panel blank. A test pins the far corner
of a grid with holes in it.

### A link to a place

The address bar carries whatever is on screen, so copying it shares the spot
rather than a screenshot: whoever opens it gets the same ground with its own
live numbers. `?at=37.9577,-121.2908&label=Tracy%20block` opens there, and
`?fire=Camp%20Fire` opens straight into that replay — which is how the demo
video starts on one URL instead of four clicks. Junk in the query string is
ignored rather than obeyed, which is a test.

### Holding a reading

The panel follows the cursor and names the exact point under it - nearest
town, its county, and the coordinates to four decimal places - rather than
the middle of the area the reading came from.

**Double-click holds it there.** The reading freezes, a ring marks the spot on
the ground, and you can take your hand off the mouse, pan around it, or fetch
someone to look at it. Double-click again to release. The map's own
double-click zoom is switched off, so holding a point never moves the camera.

### Colour before the network answers

The two fixed tiers also ship *with* the app. `tools/snapshot.mjs` writes
`src/data/snapshot.json` -- the country and California, about 13 KB of packed
numbers -- and the first frame is drawn from it, before a single request goes
out. A new visitor sees a coloured map immediately instead of a black one for
a second or two, and if the free weather allowance happens to be spent that
day they still get a usable map rather than nothing.

Nothing is passed off as current. Every reading from the file is flagged
`stale`, the app shows how old it is (*"Background colour is the saved
reading, 3 days old. Your own spot is live."*), and it is thrown away the
moment live readings for that tier arrive. Nothing that gives advice uses it:
the work verdict, the warnings and the assistant all read your own location,
which is always fetched live.

The file records the grid it was built for. Change the grid and the app drops
the snapshot rather than painting real readings onto the wrong squares --
the kind of wrong that looks entirely plausible.

**And when it is recent, it replaces the request entirely.** The two fixed
tiers cost 330 of the free tier's 10,000 daily locations on every cold open,
and they describe squares 60 to 170 miles across - not something that changes
in an hour. So when the shipped file is under 90 minutes old the app skips
that fetch and simply draws it. A cold open went from seven requests to
**three**: your own spot, and the fine grid for what is on screen.

Re-run `npm run snapshot` before a demo so what ships is recent. The tool
falls back to the archive's last complete 3 PM readings if the live tier
refuses part way through, and stamps the file with the **oldest** reading in
it, never the newest.

### The watch board - where the worst of it is

The map answers "how bad is it here". The first question people actually ask
is "where is the worst of it, and is it coming at me", so the Fires tab opens
with a ranked list of the places closest to ignition: the score, the signal
driving it, and how far away it is.

Squares do not have names, so `tools/places.mjs` bundles 483 California towns
with the county each one is actually in, plus a point per county and per
state, from the Census Bureau's own boundaries (42 KB). The nearest town
names the square: *"near Oakdale, Stanislaus County"* is somewhere a person
can picture and drive to, where a county alone covers a thousand square
miles. Outside California a square is 170 miles across and the honest name is
the state.

Each town's county is settled at build time by testing the town against the
real county boundaries, not by finding the nearest county centre -- that
shortcut put Dos Palos in San Benito, which it is not in. It is pinned by a
test.

The list is ranked worst first, one entry per county, and every entry is
**pinned on the map** as a hollow ring with its score in it: hollow because a
solid dot means a fire that exists, and these are fires that do not.

The board comes in two parts, and the order is the point: **within 70 miles**
first, then the rest of California. The hottest corner of the state is
interesting, but the county you farm is the one you act on, and a single
list sorted by score buries home under whatever stretch of desert is baking
today. No place appears in both halves.

When somewhere within 80 miles reaches the high band, it becomes the banner
under the search bar: *"68 of 100 in Amador County -- 59 mi NNE of you, days
since rain leading."* The nearest serious place wins, not the worst one: a 70
next door matters more than an 85 three counties away.

### Fires that happened

The other half of the Fires tab is the record: every satellite detection in
the last 24 hours with the time it was seen and the nearest town, your own
smoke reports with the time you made them, and the fires this ground
remembers with the date each one started. Picking one of those replays it.

Every row in the tab carries a date, deliberately. A risk number with no date
on it is the kind of thing that gets screenshotted in October and shared in
July.

### Ground that burns, as well as weather that does

The risk numbers are weather. The CAL FIRE zones are the other half: ground
that burns badly whatever the forecast says. They are drawn as tinted
regions now, coloured by class and deepened by the score where each zone
sits - so the foothills read as hazardous country even on a calm day, and
the flat irrigated valley does not.

They used to be identical white dashed outlines at full strength, which in
the Sierra counties meant several hundred of them turning the map into
static with no indication of which ground was the dangerous ground.

### From the grid to the hazard zones

CAL FIRE already rates terrain as Moderate, High or Very High hazard. Those
zones are queried live from the state's own GIS service for whatever is on
screen, so they cover all of California rather than one county. Each zone reads
the score out of the grid square it sits in, then multiplies:

```
zone risk = that square's score x { Moderate 0.85, High 1.05, Very High 1.25 }
```

So the same weather produces a worse day in the Tracy hills than on flat
irrigated farmland. The squares show today's weather; the dashed white outlines
show the ground underneath it.

### From score to a go/stop call

Two hard limits override everything, because a spark behaves differently past
them: **gusts at or above 25 mph**, or **humidity at or below 15%** -> STOP.
Otherwise 70+ is STOP, 40+ is CAUTION, below 40 is GO.

The app then runs **the same scoring function on each remaining hour of the day**
to find the mildest window still ahead - so a STOP is never a dead end, it is
"wait until 7 PM".

### Today, hour by hour

A second request brings back each square's 24 hourly readings for today. The
hour strip runs **the same `scoreRisk` function** over whichever hour you pick,
so the whole view re-colours, and each of its bands is the average risk for
that hour. On a normal autumn day it runs green overnight, climbs through
yellow by mid afternoon and falls back by dark.

### Spread cone

A grass fire's head runs downwind at roughly **20% of the wind speed**. We look
up the wind at the fire itself, not where the user is standing. Wind direction
tells us where; wind speed tells us how far in an hour. Strong wind makes a
narrow cone, light wind a wide one.

---

## Where the data comes from

All free, all public, no API keys, no hardware.

| Data | Source | How |
|------|--------|-----|
| Weather, past and present | [Open-Meteo](https://open-meteo.com) | Live. A cold start costs 331 locations (230 country + 100 California + 1 your spot) and then 100 per new view. Points are sent in batches of 80 -- 230 of them in one URL took the better part of a minute, the same points in batches come back in about a second. Every location is cached for 30 minutes, because the free tier counts one call per location, not per request. |
| Place search | Open-Meteo geocoding | Live, as you type. |
| Street addresses | [Census Bureau geocoder](https://geocoding.geo.census.gov) | Live. Free, no key, authoritative for US addresses, and the only country this app covers. It sends no CORS headers, so `api/geocode.js` fetches it for the browser. Typing a house number zooms the map to the street. |
| County, town and state names | Census TIGERweb | Fetched once by `npm run places` and bundled; nothing at runtime. |
| Fire hazard zones | CAL FIRE, via `services.gis.ca.gov` | Live for whatever is on screen. The home county also ships with the app (`src/data/hazardZones.json`, 31 KB) so it draws the instant you open it, before the first query returns. CAL FIRE only maps California. |
| Satellite fire detections | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov) | Live, VIIRS on NOAA-20, 375 m, last 24 h. The open CSV feed needs no sign-up and covers the USA. Set a free `FIRMS_MAP_KEY` to switch to worldwide coverage. The feed sends no CORS headers, so `api/firms.js` fetches it for the browser. |
| Satellite imagery and labels | Esri World Imagery | Live tiles. |
| Historic weather, for Hindsight | [Open-Meteo archive](https://open-meteo.com/en/docs/historical-weather-api) | Same service, different address, still no key. A replay asks for the fifteen days up to the fire so the dryness and Delta T signals have their run-up. |

Smoke reports are stored in the browser itself, so the app needs no server
and no account.

### About the smoke check

`checkForSmoke` is an honest colour test, **not a trained model**: it shrinks the
photo, looks at the top half, and counts pixels that are bright but almost
colourless - which is what grey and grey-blue smoke looks like against sky.
It catches obvious false alarms. Swapping in a real image classifier later
means replacing one function.

### About the colours

The green / yellow / orange / red scale was checked with a palette validator for
colour-blind separation and for contrast against the dark satellite map, so the
four levels stay distinguishable for everyone. Every colour is also paired with
a word and a number, never used alone.

---

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

```bash
npm test          # 41 unit tests, no browser, no framework (node --test)
npm run lint      # oxlint
npm run build     # production build into dist/
npm run preview   # serve that build locally

npm run backtest  # score 14 real fires against 1,596 ordinary days
npm run snapshot  # refresh the readings the app opens with
npm run places    # rebuild the county and state name list
```

The tests cover the parts that would be embarrassing to get wrong: the risk
model's boundaries, Delta T needing *both* of its conditions, the hard limits
overriding the score rather than the other way round, the safe window, the
grid's coverage and lookup, the spread geometry, and the assistant never
inventing a number it was not given.

Deploys to Vercel as-is: `api/firms.js` becomes the serverless endpoint and
`vite.config.js` stands in for it while developing.

### Optional: worldwide satellite hotspots

Out of the box the satellite layer uses NASA's open feed for the United States,
which needs no account. For fire detections anywhere on Earth, get a free map
key at <https://firms.modaps.eosdis.nasa.gov/api/map_key> and set it:

```bash
FIRMS_MAP_KEY=your-key npm run dev      # or add it in Vercel's env settings
```

Nothing else changes - `api/firms.js` picks the worldwide API when the key is
there and falls back to the open feed when it is not.

---

## The whole codebase

The interface borrows its shape from the radar apps storm chasers use -- a
full-bleed dark scope, a floating panel you can drag anywhere and resize, a
control rail down the edge, and an assistant in its own column -- and adds the
things a fire app needs that a radar app has no reason to: a live risk grid,
the hour strip, and a readout that tells you the fire risk under your pointer.

About thirty small files, roughly 3,300 lines including the tests, do the work
-- and nothing is duplicated: the hourly "safe window" calls the same
`scoreRisk` the map grid does, the hazard zones read their scores out of that
same grid, the assistant answers out of the same `advice`, and the map, the
dispatcher script and the escape directions all come from the same
`spreadCone`.

```
src/
  lib/
    config.js      where the county is, how far the map may pan, how finely we grid it
    grid.js        the two risk grids, and looking up the square under any point
    weather.js     Open-Meteo, batched, cached, normalised into the few numbers we need
    risk.js        the risk model, Delta T, and the go/stop call
    advice.js      warnings, what to take outside, what is driving the score
    assistant.js   the Fire Assistant's questions and answers
    hazard.js      CAL FIRE zones + combining terrain with weather
    firms.js       NASA satellite hotspots
    spread.js      wind cone, distance, bearing, escape directions
    reports.js     smoke reports and the photo colour check
    hindsight.js   the fires we can replay, and their weather from the archive
    watch.js       which places are closest to ignition, and naming them
    geocode.js     search: towns from Open-Meteo, addresses from the Census
    snapshot.js    the readings that ship with the app, for the first frame
    useDraggable.js  drag and resize, shared by the panel
  components/
    MapView.jsx     the map: ground, risk grids, zones, fires, cone, and the 3D tilt
    ControlRail.jsx 3D, assistant, layers, locate, nationwide, zoom, home
    SearchPill.jsx  search a town or a street address, conditions beside it
    AlertPill.jsx   today's warning, across the top
    Sheet.jsx       the floating panel: drag it, resize it, Now / Fires / Layers / Report
    SpotPanel.jsx   the spot under your cursor: score, warnings, kit, nearest fire
    WorkCard.jsx    safe to work?
    HourStrip.jsx   today hour by hour, and the mildest window left
    FeatureList.jsx fires that happened: detections, your reports, past fires
    LayersPanel.jsx every layer on or off, the ground, 3D, and the colour key
    ReportForm.jsx  photo + GPS report
    ActionPanel.jsx 911, downwind warning, farmer checklist
    Assistant.jsx   the Fire Assistant, in its own column
    HindsightPanel.jsx  replay a real fire, and how the model scored on all of them
    WatchBoard.jsx  fires that could happen: ranked, named, dated
    DragHandle.jsx  the corner you resize from
    Guide.jsx       the in-app explainer
  data/
    hazardZones.json   CAL FIRE hazard zones for our county
    snapshot.json      the readings the app opens with, before any request
    places.json        one point per California county and per state
  App.jsx         loads the data and wires the pieces together
test/
  model.test.js   41 tests over the model, the grid, the geometry and the assistant
tools/
  backtest.mjs    the accuracy check, run from the command line
  snapshot.mjs    rebuilds the readings the app ships with
  places.mjs      rebuilds the name list from Census boundaries
api/
  firms.js        passes NASA's CSV feed through to the browser
  geocode.js      passes the Census address geocoder through to the browser
```

---

DeltaWatch is a planning aid built by a student. It is not an official warning
system. In an emergency, call 911.
