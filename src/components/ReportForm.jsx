import { useRef, useState } from 'react';
import { checkForSmoke, toDataUrl, saveReport, clearReports } from '../lib/reports.js';

const VERDICTS = {
  likely: { label: 'Looks like smoke', color: 'var(--extreme)' },
  maybe: { label: 'Possibly smoke', color: 'var(--moderate)' },
  unlikely: { label: 'Probably not smoke', color: 'var(--low)' },
  unknown: { label: 'Not checked', color: 'var(--ink-3)' },
};

/**
 * Snap a photo, attach the GPS position it was taken at, and run a quick
 * colour check so obvious false alarms get caught before anyone drives out.
 */
export default function ReportForm({ location, reports, onReportsChange, onSelect }) {
  const [photo, setPhoto] = useState(null);
  const [check, setCheck] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  async function pickPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const dataUrl = await toDataUrl(file);
    setPhoto(dataUrl);
    setCheck(await checkForSmoke(dataUrl));
    setBusy(false);
  }

  function submit() {
    onReportsChange(saveReport({ ...location, note, photo, check }));
    setPhoto(null);
    setCheck(null);
    setNote('');
  }

  return (
    <section className="card glass">
      <h2>Report smoke</h2>

      {photo && <img className="thumb" src={photo} alt="Smoke report" />}

      {check && (
        <div className="verdict-line">
          <span className="swatch" style={{ background: VERDICTS[check.verdict].color }} />
          <b style={{ color: VERDICTS[check.verdict].color }}>{VERDICTS[check.verdict].label}</b>
          <span className="muted" style={{ fontSize: 12 }}>{check.note}</span>
        </div>
      )}

      <textarea
        rows={2}
        placeholder="What do you see? Colour, direction, nearest landmark."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="row">
        <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={pickPhoto} />
        <button className="btn grow" onClick={() => fileInput.current.click()} disabled={busy}>
          {busy ? 'Checking photo...' : photo ? 'Retake photo' : 'Take photo'}
        </button>
        <button className="btn primary grow" onClick={submit} disabled={!photo && !note}>
          Save report
        </button>
      </div>

      <p className="muted" style={{ margin: '10px 0 0', fontSize: 12 }}>
        GPS attached: <span className="num">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
      </p>

      {reports.length > 0 && (
        <>
          <h2 style={{ marginTop: 16 }}>Your reports</h2>
          {reports.map((report) => (
            <div className="report-item" key={report.id}>
              {report.photo && <img src={report.photo} alt="" />}
              <div className="grow">
                <div>{new Date(report.id).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                <span className="tag">{VERDICTS[report.check?.verdict ?? 'unknown'].label}</span>
              </div>
              <button className="btn" onClick={() => onSelect({ ...report, kind: 'report' })}>Show</button>
            </div>
          ))}
          <button className="btn wide" style={{ marginTop: 10 }} onClick={() => onReportsChange(clearReports())}>
            Clear all reports
          </button>
        </>
      )}
    </section>
  );
}
