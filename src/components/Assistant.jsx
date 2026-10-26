import { useState } from 'react';
import { ask, SUGGESTIONS } from '../lib/assistant.js';

/**
 * The Fire Assistant. Ask it something in plain words and it answers from the
 * live numbers for whatever spot you are looking at.
 *
 * It matches your question against the handful of things it actually knows and
 * answers from the same risk model the map draws, so it cannot invent a figure.
 */
export default function Assistant({ context, open, onToggle, onShare }) {
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState('');

  function send(question) {
    const text = question.trim();
    if (!text || !context) return;
    setThread((past) => [...past, { question: text, ...ask(text, context) }].slice(-6));
    setDraft('');
  }

  if (!open) {
    return (
      <button className="assist-bubble" onClick={onToggle} title="Ask the Fire Assistant">
        <Spark />
        <span>Ask about this spot</span>
      </button>
    );
  }

  return (
    <section className="assist">
      <header className="assist-head">
        <Spark />
        <b>Fire Assistant</b>
        <span className="assist-sub">answers from live data</span>
        {onShare && (
          <button className="assist-x" onClick={onShare} aria-label="Share today's conditions">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15V3.5M8.2 7.3 12 3.5l3.8 3.8" /><path d="M5 13v6.5h14V13" />
            </svg>
          </button>
        )}
        <button className="assist-x" onClick={onToggle} aria-label="Close the assistant">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      <div className="assist-thread">
        {thread.length === 0 && (
          <p className="assist-hint">
            Ask about {context?.label ?? 'this spot'} — whether it is safe to work, when it gets
            milder, what to take with you, or where the nearest fire is.
          </p>
        )}

        {thread.map((turn, i) => (
          <div className="assist-turn" key={i}>
            <p className="assist-q">{turn.question}</p>
            <p className="assist-a">{turn.answer}</p>
            {turn.detail && (
              <ul className="assist-detail">
                {turn.detail.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="assist-chips">
        {SUGGESTIONS.map((q) => (
          <button key={q} onClick={() => send(q)}>{q}</button>
        ))}
      </div>

      <form
        className="assist-ask"
        onSubmit={(e) => { e.preventDefault(); send(draft); }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about this spot…"
          aria-label="Ask the Fire Assistant"
        />
        <button type="submit" disabled={!draft.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h13M12 5.5 18.5 12 12 18.5" />
          </svg>
        </button>
      </form>
    </section>
  );
}

const Spark = () => (
  <svg className="spark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5 13.8 9 20 10.8 13.8 12.6 12 19 10.2 12.6 4 10.8 10.2 9 12 2.5Z" />
    <path d="M18.5 15.5 19.4 18.3 22 19.2 19.4 20.1 18.5 23 17.6 20.1 15 19.2 17.6 18.3 18.5 15.5Z" opacity=".65" />
  </svg>
);
