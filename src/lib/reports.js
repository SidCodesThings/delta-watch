// Smoke reports. There is no server behind this app, so reports are kept in the
// browser's own storage -- enough to pin them on the map and hand the details
// to a 911 dispatcher.

const KEY = 'deltawatch.reports';

export const loadReports = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
};

export function saveReport(report) {
  // `at` is the moment it was reported, which the fire list shows. It is a
  // separate field from the id on purpose: an id is for telling two reports
  // apart, and leaning on it to also mean "when" is the sort of shortcut
  // that quietly breaks the day ids stop being timestamps.
  const now = Date.now();
  const all = [{ ...report, id: now, at: now }, ...loadReports()].slice(0, 20);
  localStorage.setItem(KEY, JSON.stringify(all));
  return all;
}

export function clearReports() {
  localStorage.removeItem(KEY);
  return [];
}

// --- "Does this photo actually show smoke?" ---------------------------------
//
// A quick colour check, not a trained model. Smoke is grey or grey-blue: it has
// almost no colour saturation but it is still bright, and it sits in the upper
// part of the frame against the sky. We shrink the photo and count how many
// pixels in the top half look like that.

const SIZE = 64;

export function checkForSmoke(imageDataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE / 2); // top half only
      resolve(judge(smokeFraction(data)));
    };
    img.onerror = () => resolve({ verdict: 'unknown', note: 'Could not read the photo.' });
    img.src = imageDataUrl;
  });
}

function smokeFraction(data) {
  let smokey = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const brightness = max / 255;
    if (saturation < 0.18 && brightness > 0.35 && brightness < 0.97) smokey++;
  }
  return smokey / pixels;
}

function judge(fraction) {
  const pct = Math.round(fraction * 100);
  if (fraction > 0.35) return { verdict: 'likely', note: `${pct}% of the sky area is smoke-coloured.` };
  if (fraction > 0.15) return { verdict: 'maybe', note: `${pct}% of the sky area is smoke-coloured.` };
  return { verdict: 'unlikely', note: `Only ${pct}% of the sky area looks like smoke -- clear sky or haze.` };
}

/** Shrink a camera photo so it fits in browser storage. */
export function toDataUrl(file, maxWidth = 640) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = Object.assign(document.createElement('canvas'), {
          width: img.width * scale,
          height: img.height * scale,
        });
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
