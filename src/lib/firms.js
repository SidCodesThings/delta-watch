// Live satellite fire detections (NASA FIRMS, VIIRS on the NOAA-20 satellite,
// 375 m resolution, last 24 hours). We keep every detection the feed gives us
// and let the map show whichever ones you have scrolled to -- a fire two
// counties upwind still matters.


export async function fetchHotspots() {
  // Same reasoning as the weather calls: a request that hangs leaves the map
  // with no fires on it and no explanation, so give it a deadline.
  const res = await fetch('/api/firms', { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`NASA FIRMS returned ${res.status}`);
  return parseCsv(await res.text());
}

function parseCsv(text) {
  const [header, ...rows] = text.trim().split('\n');
  const cols = header.split(',');
  return rows.map((row) => {
    const values = row.split(',');
    const r = Object.fromEntries(cols.map((c, i) => [c, values[i]]));
    return {
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      confidence: r.confidence,          // low / nominal / high
      power: Number(r.frp),              // fire radiative power in megawatts
      detectedAt: toLocalTime(r.acq_date, r.acq_time),
    };
  });
}

/** FIRMS gives the date plus a UTC time as "HHMM"; show it in local time. */
function toLocalTime(date, hhmm) {
  const t = hhmm.padStart(4, '0');
  return new Date(`${date}T${t.slice(0, 2)}:${t.slice(2)}:00Z`);
}
