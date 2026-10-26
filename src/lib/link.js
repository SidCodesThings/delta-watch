// Sharing a place, not just a screenshot.
//
// "Check the risk on the Tracy block" is a sentence that needs a map
// attached. The address bar carries the spot, so a link opens DeltaWatch
// already looking at it, with every number recalculated live for whoever
// opened it -- a neighbour, the fire district, or a judge following a link
// in a submission.
//
// Two small pure functions, so both can be tested without a browser.

/**
 * Pull a spot out of a query string.
 * @returns {{place: {lat,lng,label}|null, fire: string|null}}
 */
export function readLink(search = '') {
  const q = new URLSearchParams(search);
  const [lat, lng] = (q.get('at') ?? '').split(',').map(Number);

  const sane = Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  return {
    place: sane
      ? { lat, lng, label: q.get('label')?.slice(0, 80) || `${lat.toFixed(3)}, ${lng.toFixed(3)}` }
      : null,
    fire: q.get('fire')?.slice(0, 60) || null,
  };
}

/**
 * The query string for a spot. Coordinates are cut to four decimals --
 * about ten metres, which is as precise as any of this deserves to be.
 */
export function linkFor({ lat, lng, label } = {}, fire = null) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  const q = new URLSearchParams({ at: `${lat.toFixed(4)},${lng.toFixed(4)}` });
  if (label) q.set('label', label);
  if (fire) q.set('fire', fire);
  return `?${q}`;
}
