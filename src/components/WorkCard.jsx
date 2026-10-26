import { formatHour } from '../lib/risk.js';

/**
 * The question a farmer actually opens the app for: can I mow, harvest or run
 * equipment today? Equipment sparks start a large share of valley fires.
 */
export default function WorkCard({ verdict, window: safe }) {
  const headline = { go: 'GO', caution: 'CAUTION', stop: 'STOP' }[verdict.call];

  return (
    <section className="card glass">
      <h2>Safe to work today?</h2>

      <div className={`verdict ${verdict.call}`}>
        <span className="pill">{headline}</span>
        <span className="what">mowing &middot; harvesting<br />discing &middot; equipment</span>
      </div>

      <p style={{ margin: '0 0 10px' }}>{verdict.reason}</p>

      <ul className="rules">
        {verdict.rules.map((rule) => <li key={rule}>{rule}</li>)}
      </ul>

      {/* Only worth saying when the answer is not already "go ahead". */}
      {safe && verdict.call !== 'go' && (
        <p className="window-note">
          {safe.none
            ? `No hour left today drops out of the caution range. The mildest is ${formatHour(safe.best.hour)} (${safe.best.score}/100).`
            : `Mildest window left today: ${formatHour(safe.from)} to ${formatHour(safe.to)}.`}
        </p>
      )}
    </section>
  );
}
