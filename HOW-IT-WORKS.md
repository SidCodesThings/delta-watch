# How DeltaWatch works, in plain words

Written to be read out loud. If a judge asks "what does this file do?", the
answer is one line below.

---

## What it is built with

| Thing | What it is | Why this one |
|---|---|---|
| **React** | Draws the screen and keeps it in step with the data | The standard; nothing exotic to explain |
| **Vite** | Runs it while building, bundles it to ship | One command, no config to speak of |
| **MapLibre GL** | The map itself | Free and open, no account, and it does 2D and 3D with the same code |
| **node --test** | Runs the 47 tests | Built into Node, no test framework to install |
| **oxlint** | Checks the code for mistakes | Fast, zero config |

No database, no server, no login, no paid service, no API keys. The whole app
is files in a browser plus four public data feeds.

## The one idea the whole app rests on

**There is exactly one function that decides how dangerous a day is**, and
everything else asks it.

```
scoreRisk(weather)  ->  a number out of 100
```

The map colours itself with it. The "safe to work?" verdict uses it. The
hour strip uses it. The watch board uses it. The assistant quotes it. The
Proof tab replays real fires through it. The backtest script imports the very
same function.

That is the answer to "is your code repetitive?" — it cannot be, because
there is only one copy of the thinking. Change a weight in `risk.js` and all
seven places change together.

---

## Every file, one line each

### The thinking (`src/lib/`)

| File | What it does |
|---|---|
| `risk.js` | **The heart.** Turns weather into a score, flags Delta T, and gives the go / caution / stop call |
| `grid.js` | Cuts the map into areas and finds which area a point is in |
| `weather.js` | Asks Open-Meteo for the weather, in batches, and remembers answers for 30 minutes |
| `snapshot.js` | The readings that ship with the app, so the first frame has colour |
| `advice.js` | Turns a score into warnings, a kit list, and what is driving it |
| `watch.js` | Ranks the places closest to ignition and gives them names |
| `assistant.js` | Matches a question to a topic and answers from the model |
| `hazard.js` | CAL FIRE's hazard zones, and combining terrain with weather |
| `hindsight.js` | The fourteen real fires, and their weather from the archive |
| `spread.js` | Wind maths: where a fire runs, how far, and which way to leave |
| `geocode.js` | Search: towns from Open-Meteo, street addresses from the Census |
| `firms.js` | NASA's satellite fire detections |
| `reports.js` | Smoke reports, saved in the browser, plus the photo colour check |
| `config.js` | The numbers that describe *where*: the county, the state, the country |
| `useDraggable.js` | Drag-and-resize, shared by the floating panel |
| `link.js` | Reads a shared link, and builds one |

### The screen (`src/components/`)

| File | What it does |
|---|---|
| `MapView.jsx` | The map's behaviour: moving, hovering, clicking, tilting |
| `mapLayers.js` | What the map draws, and in what order |
| `Sheet.jsx` | The floating panel you can drag and resize |
| `SpotPanel.jsx` | Everything about the spot under your cursor |
| `WatchBoard.jsx` | Fires that could happen |
| `FeatureList.jsx` | Fires that did happen |
| `WorkCard.jsx` | Safe to work? |
| `HourStrip.jsx` | Today, hour by hour |
| `ActionPanel.jsx` | 911 script, downwind warning, checklist |
| `HindsightPanel.jsx` | Replay a real fire, and the accuracy numbers |
| `LayersPanel.jsx` | What to show, which ground, 2D or 3D |
| `Assistant.jsx` | The Fire Assistant's column |
| `ReportForm.jsx` | Photo + GPS smoke report |
| `SearchPill.jsx` | The search bar and the live conditions in it |
| `AlertPill.jsx` | Today's one warning, across the top |
| `ControlRail.jsx` | The round buttons down the right |
| `Guide.jsx` | The in-app explainer |
| `Boundary.jsx` | Catches a crash and says so instead of going black |
| `DragHandle.jsx` | The corner you resize from |

---

## How the important functions actually work

**`scoreRisk(weather)`** — Four numbers, each squashed onto a 0–1 scale:
dry air, wind gusts, heat, days since rain. Multiply each by its weight
(0.35, 0.30, 0.20, 0.15), add them up, times 100. If Delta T fires, add 12.
That is the whole model, and it fits on one screen.

**`deltaT(weather)`** — Our own idea. Compare today against the average of
the three days before it. If today is **5°F hotter AND 8 points drier**, the
pattern that precedes offshore wind events is showing, so raise a flag. Both
conditions have to be true; a hot day on its own is not it.

**`workVerdict(weather, score)`** — Two hard limits come first: gusts at or
above 25 mph, or humidity at or below 15%, mean STOP no matter what the
score says. Otherwise 70+ is STOP, 40+ is CAUTION, below that it is GO.

**`safeWindow(weather)`** — Runs `scoreRisk` over every hour left today and
finds the longest run below 40. That is why a STOP is never a dead end: it
becomes "wait until 7 PM".

**`makeGrid(bbox, size)`** — Slices a rectangle into a grid of squares and
gives each one a centre point and a number. `cellAt(grid, point)` then finds
which square a point is in with arithmetic rather than searching: work out
the column from the longitude, the row from the latitude, and index straight
into the list. That is why the list must never have gaps in it.

**`fetchWeather(points)`** — Checks the browser's memory first, asks
Open-Meteo only for what is missing, and sends those in batches of eighty.
Every answer is kept for 30 minutes. The free service counts one call per
location, so this is what keeps the app inside its daily allowance.

**`watchList(cells)`** — Sorts every scored area worst-first, names each one
after the nearest town, keeps one entry per county, and works out how far
away each is. `nearestWarning` then picks the closest serious one for the
banner — closest, not worst, because a 70 next door matters more than an 85
three counties away.

**`spreadCone(fire, windFrom, windSpeed)`** — A grass fire's head runs
downwind at about 20% of the wind speed. Wind direction says where, wind
speed says how far in an hour, and a strong wind makes a narrow cone while a
light one makes a wide one.

**`ask(question, context)`** — The assistant. Scores the question against a
list of topics, counting phrase matches double, and answers the winner from
live data. If nothing matches it says it does not know rather than guessing.

**`fetchArchive(points, date)`** — Hindsight. Same shape as `fetchWeather`
but pointed at Open-Meteo's historical archive, so the map can re-run on the
morning a real fire started.

---

## The three things worth explaining to a judge

1. **One model, seven uses.** There is no second copy of the risk logic
   anywhere — not in the map, not in the assistant, not in the test script.

2. **It has been checked against real fires.** `npm run backtest` scores 14
   real California fires against 1,596 ordinary days at the same places in
   the same season. 13 of 14 began on a day the model rates extreme, against
   41% of ordinary days — 2.3 times likelier.

3. **It says when it does not know.** The assistant refuses to forecast
   tomorrow. The map admits when its background readings are old. The error
   screen admits a crash. In a fire tool, a confident wrong answer is worse
   than no answer.
