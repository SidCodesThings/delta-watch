import { FIRES, longDate } from '../lib/hindsight.js';
import { RISK_COLORS } from '../lib/risk.js';

/**
 * Hindsight: pick a fire California remembers and the whole map re-runs on
 * that day's weather. The claim an app like this has to answer is "does your
 * number mean anything", and the only honest answer is to point it at days
 * where we already know what happened.
 */
export default function HindsightPanel({ replay, score, level, onReplay, onExit }) {
  return (
    <section className="hindsight">
      <h3 className="panel-title">Would it have called it?</h3>
      <p className="muted small">
        Pick a day California remembers. The map re-runs on that day&apos;s real weather,
        through the same model it uses for today — nothing tuned, nothing hand-picked.
      </p>

      {replay && (
        <div className="replay-card">
          <div className="replay-head">
            <span className="replay-flag">REPLAYING</span>
            <button type="button" className="link" onClick={onExit}>Back to today</button>
          </div>
          <strong>{replay.name}</strong>
          <div className="muted small">{longDate(replay.date)} · {replay.where}</div>
          {score !== undefined && score !== null && (
            <p className="verdict-line">
              On the morning it started, DeltaWatch would have read{' '}
              <strong style={{ color: RISK_COLORS[level] }}>{score} — {level}</strong>.
            </p>
          )}
          <p className="muted small">{replay.note}</p>
        </div>
      )}

      <ul className="fire-list">
        {FIRES.map((fire) => (
          <li key={fire.name}>
            <button
              type="button"
              className={`fire-row ${replay?.name === fire.name ? 'on' : ''}`}
              onClick={() => onReplay(fire)}
            >
              <span className="fire-name">{fire.name}</span>
              <span className="muted small">{longDate(fire.date)} · {fire.where}</span>
            </button>
          </li>
        ))}
      </ul>

      <h4 className="panel-sub">How we know it is not luck</h4>
      <p className="muted small">
        We scored all fourteen ignition days, plus every other day in the two months
        either side of each one — 1,596 ordinary days, same places, same season, same
        model. Run it yourself: <code>node tools/backtest.mjs</code>.
      </p>
      <dl className="score-table">
        <div><dt>Ignition days rated extreme</dt><dd>13 of 14</dd></div>
        <div><dt>Ordinary days rated extreme</dt><dd>41%</dd></div>
        <div><dt>Average score, ignition days</dt><dd>79</dd></div>
        <div><dt>Average score, ordinary days</dt><dd>63</dd></div>
      </dl>
      <p className="muted small">
        A fire day is <strong>2.3&times;</strong> more likely to be rated extreme than an
        ordinary day in the same place and season. The model cannot tell you a fire
        <em> will</em> start — that needs a spark, and no weather service predicts those.
        It tells you the day is ready for one.
      </p>
    </section>
  );
}
