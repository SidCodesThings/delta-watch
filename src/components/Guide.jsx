import { SIGNAL_LABELS } from '../lib/risk.js';

/**
 * The in-app guide. Anyone -- a farmer, a judge, a neighbour -- should be able
 * to open this and understand every part of the screen without being told.
 */
export default function Guide({ onClose }) {
  return (
    <aside className="guide-panel glass">
      <header className="guide-head">
        <h2>How DeltaWatch works</h2>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </header>

      <div className="guide-body">
        <p className="muted" style={{ marginTop: 0 }}>
          Most fire apps tell you about a fire after it starts. DeltaWatch predicts where fires
          are likely <em>today</em>, tells you whether it is safe to run equipment, and helps you
          report a fire and get out of its way. Everything below runs on free public data.
        </p>

        {ITEMS.map((item, i) => (
          <section className="guide-item" key={item.title}>
            <span className="guide-num">{i + 1}</span>
            <div>
              <h3>{item.title}</h3>
              {item.body}
            </div>
          </section>
        ))}

        <p className="muted" style={{ marginTop: 20 }}>
          Weather from Open-Meteo &middot; hazard zones from CAL FIRE &middot; hotspots from NASA
          FIRMS &middot; imagery from Esri. DeltaWatch is a planning aid, not an official warning
          system. In an emergency, call 911.
        </p>
      </div>
    </aside>
  );
}

const ITEMS = [
  {
    title: 'The numbers, and the glow',
    body: (
      <>
        <p>
          Whatever part of the map you are looking at is cut into a hundred areas. Each one gets
          its own live weather reading and its own score out of 100, printed on the map as a
          plain number — calm areas included.
        </p>
        <p>
          Colour is reserved for trouble. From <b>38</b> upwards an area starts to glow amber,
          then orange, then red; below that it is left alone and the map looks like a map. An
          earlier version washed every square in colour, which meant hunting for the dangerous
          ones inside a quilt and painting thousands of shapes to say &ldquo;most of the country
          is fine today&rdquo;. A number needs no legend and works for colour-blind readers; the
          glow is there to catch your eye from across the room.
        </p>
        <p>
          The grid follows the map: pan to the next county and it re-scores what you moved to.
          Underneath it sit two coarser grids that never move — California, and the whole country
          — scored the moment the app opens. That is why there is colour the instant you arrive
          somewhere instead of a second later. You always see the finest one that covers your
          screen, never two at once.
        </p>
        <p>
          The map stays over the United States, which is where the satellite feed and the hazard
          zones exist. It opens on San Joaquin County because that is who it is built for.
        </p>
      </>
    ),
  },
  {
    title: 'What goes into the score',
    body: (
      <>
        <p>Four things about the weather, weighted by how much each one actually matters:</p>
        <div className="guide-formula">
          <div><span>{SIGNAL_LABELS.humidity} — the single biggest driver</span><b>35%</b></div>
          <div><span>{SIGNAL_LABELS.wind} — how fast a spark can run</span><b>30%</b></div>
          <div><span>{SIGNAL_LABELS.temp}</span><b>20%</b></div>
          <div><span>{SIGNAL_LABELS.dryness} — how dry the fuel is</span><b>15%</b></div>
        </div>
        <p>The bars in the sidebar show how much each one is contributing right now.</p>
      </>
    ),
  },
  {
    title: 'The Delta T warning — our own idea',
    body: (
      <>
        <p>
          One hot day is not what burns the valley down. A sudden <em>change</em> is: the
          temperature jumping while the humidity falls away. That is the fingerprint of a dry
          offshore wind event, the setup behind the worst fire days.
        </p>
        <p>
          So we compare today against the average of the three days before it. If it is
          <code>5&deg;F hotter</code> and <code>8 points drier</code>, we raise a Delta T warning and
          add 12 points to the score. Other fire apps look at today's numbers; we look at the change.
        </p>
      </>
    ),
  },
  {
    title: 'Safe to work today?',
    body: (
      <>
        <p>
          Equipment sparks start a large share of valley fires, so this is the answer most farmers
          actually need. You get one word — <b>GO</b>, <b>CAUTION</b> or <b>STOP</b> — for mowing,
          harvesting and running machinery, plus the precautions that go with it.
        </p>
        <p>
          Two conditions stop work no matter what the overall score says: gusts at or above
          <code>25 mph</code>, or humidity at or below <code>15%</code>.
        </p>
        <p>
          A STOP is never a dead end. We re-run the same scoring on every remaining hour of the day
          and tell you the mildest window still ahead.
        </p>
      </>
    ),
  },
  {
    title: 'The white outlines — CAL FIRE hazard zones',
    body: (
      <>
        <p>
          These are the official state-mapped areas where terrain, slope and fuel make fires worst —
          mostly the hills on either side of the valley. Hover one to see its rating and the
          combined risk there. The squares show today&rsquo;s weather; the outlines show the ground
          underneath it.
        </p>
        <p>
          They are pulled live from CAL FIRE as you move the map, so you see them for everywhere in
          California, not only our county. CAL FIRE only maps California, so outside the state
          there are no zones to draw — the risk squares still work anywhere.
        </p>
      </>
    ),
  },
  {
    title: 'Red dots — live satellite hotspots',
    body: (
      <p>
        NASA satellites scan for heat twice a day. Every red dot is a heat signature detected in
        the last 24 hours, straight from the NASA FIRMS feed. Click one to project where the wind
        is pushing it. The no-sign-up feed covers the United States; adding a free NASA map key
        switches it to worldwide coverage.
      </p>
    ),
  },
  {
    title: 'The spread cone',
    body: (
      <p>
        A grass fire&rsquo;s head runs downwind at roughly <code>20%</code> of the wind speed. We
        look up the wind at the fire itself — not where you are standing — and draw a cone showing
        how far it could travel in the next hour. Strong wind makes a narrow cone; light wind lets
        it fan out.
      </p>
    ),
  },
  {
    title: 'Report smoke',
    body: (
      <>
        <p>
          Take a photo and your GPS position is attached automatically. The app runs a quick check
          on the picture — smoke is bright but almost colourless against the sky — so obvious false
          alarms get caught before anyone drives out.
        </p>
        <p>
          It is an honest colour test, not a trained model. Reports stay on your own phone; the app
          needs no account and no server.
        </p>
      </>
    ),
  },
  {
    title: 'Acting on a fire',
    body: (
      <p>
        Pick any fire and you get a one-tap 911 call with a script to read out — exact coordinates,
        how far it is from you, and which way it is heading — plus a message you can send to the
        neighbours downwind and a checklist: kill the engines, move the machinery onto bare dirt,
        and leave <em>crosswind</em>, never ahead of the head fire.
      </p>
    ),
  },
  {
    title: 'Today, hour by hour',
    body: (
      <>
        <p>
          At the bottom of the <code>Now</code> tab is today, midnight to midnight. Touch an hour
          and the whole map re-colours for it, so you can watch the afternoon heat build and see
          when the evening brings it back down.
        </p>
        <p>
          The strip is also a chart: each of the 24 bands is the average risk on screen for that
          hour. Press <code>Now</code> to come back to live conditions.
        </p>
      </>
    ),
  },
  {
    title: 'The Layers tab',
    body: (
      <p>
        The <code>Layers</code> tab switches each layer on and off — the risk squares, the hazard
        zones, the satellite hotspots and your own reports — and the number beside each one says
        how many are on the map right now. Underneath it you can swap the plain dark map for
        satellite photographs, tilt into 3D, and read the colour scale.
      </p>
    ),
  },
  {
    title: 'Proof — would it have called a real fire?',
    body: (
      <>
        <p>
          The <code>Proof</code> tab lists fourteen fires California remembers. Pick one and the
          whole map re-runs on the weather of the day it started — the same score, the same four
          signals, only the weather is historical. The Camp Fire morning reads <strong>75,
          extreme</strong>, on gusts of 58 mph at just 63&deg;F.
        </p>
        <p>
          Underneath are the numbers behind that claim. We scored all fourteen ignition days and
          1,596 ordinary days at the same places in the same season: 13 of 14 fires began on a day
          we rate extreme, against 41% of ordinary days. A fire day is 2.3 times likelier to be
          rated extreme. It cannot tell you a fire <em>will</em> start — that needs a spark — only
          that the day is ready for one.
        </p>
      </>
    ),
  },
  {
    title: 'Moving the panel',
    body: (
      <p>
        Drag this panel by its tab bar to put it wherever you like, and pull the bottom-right
        corner to resize it. On a phone it sits along the bottom instead. The map keeps working
        underneath it.
      </p>
    ),
  },
  {
    title: 'The panel follows your cursor — and can be held',
    body: (
      <>
        <p>
          Move the pointer across the map and the whole left panel rewrites itself for whatever
          square you are over: its score, the warnings that apply there, what is driving the
          number, what to take outside, and the nearest satellite detection with the crosswind way
          out. Move off the map and it goes back to describing where you are.
        </p>
        <p>
          It names the exact point under the arrow — the nearest town and its county — and prints
          the coordinates to four decimal places, so it is describing the spot you are pointing
          at rather than the middle of the area it falls in.
        </p>
        <p>
          <b>Double-click to hold it there.</b> The reading freezes on that point, a ring marks it
          on the ground, and you can take your hand off the mouse, pan around it, or go and get
          someone to look. Double-click again to let it follow the cursor once more. The map&rsquo;s
          own double-click zoom is switched off so holding a point never moves the camera.
        </p>
      </>
    ),
  },
  {
    title: 'The 3D terrain view',
    body: (
      <p>
        Fire runs uphill several times faster than it runs on the flat, so the shape of the ground
        matters as much as the weather. The <b>3D</b> button tilts the map onto real elevation
        data. Nothing else changes: the same risk squares, hazard zones, fires and spread cone are
        all still there, the panel still follows your cursor, and pressing it again lies the map
        flat. Drag to turn, right-drag to change the angle.
      </p>
    ),
  },
  {
    title: 'The Fire Assistant',
    body: (
      <>
        <p>
          The button in the corner opens an assistant you can ask about this spot: whether it is
          safe to work, when today gets milder, what to take with you, where the nearest fire is,
          or why the score is what it is.
        </p>
        <p>
          It is deliberately <strong>not</strong> a language model. It matches your question
          against the handful of things it genuinely knows and answers each from the same live
          readings the map is drawn from. It cannot invent a number, it needs no account and it
          costs nothing to run. A chatbot could phrase things more freely; it could also make
          something up, which in a fire tool is worse than saying nothing.
        </p>
      </>
    ),
  },
  {
    title: 'The search box — towns and street addresses',
    body: (
      <>
        <p>
          Type a town, a city or an area and the map flies there, with every number in the panel
          recalculated for that spot.
        </p>
        <p>
          Type a <b>street address</b> — <code>445 W Weber Ave, Stockton CA</code> — and the map
          goes all the way in to the street itself. Addresses come from the Census Bureau&rsquo;s
          own geocoder, which is free, needs no account and is authoritative for the United
          States. It is the difference between checking &ldquo;my county&rdquo; and checking
          &ldquo;my field&rdquo;.
        </p>
      </>
    ),
  },
  {
    title: 'The Fires tab — what happened and what could',
    body: (
      <>
        <p>
          <b>Could happen</b> ranks the places closest to ignition right now: the score, the town
          and county, how serious it is in words as well as numbers, which signal is driving it,
          and how far away it is. Each of those places is also ringed on the map with its score,
          so the list and the map say the same thing. Anything within 80 miles that reaches the
          high band becomes the banner under the search bar.
        </p>
        <p>
          <b>Happened</b> is what is already out there: every satellite detection in the last 24
          hours with the time it was seen and the nearest town, your own smoke reports, and the
          fires this ground remembers — Tubbs, Camp, Caldor and the rest, each with the date it
          started. Pick one of those and the map re-runs on that day&rsquo;s weather.
        </p>
        <p>
          Everything in the tab carries a date. A risk number with no date on it is the kind of
          thing that gets screenshotted in October and shared in July.
        </p>
      </>
    ),
  },
];
