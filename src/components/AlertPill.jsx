/**
 * The warning that matters most right now, sitting under the search bar where
 * a weather app puts a watch or a warning. Dismissing it only hides it until
 * the conditions change.
 */
export default function AlertPill({ warning, onDismiss }) {
  if (!warning) return null;

  return (
    <div className={`pill alert-pill ${warning.level}`}>
      <span className="alert-dot" />
      <span className="alert-text"><b>{warning.title}</b> {warning.detail}</span>
      <button className="alert-x" onClick={onDismiss} aria-label="Dismiss this warning">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
