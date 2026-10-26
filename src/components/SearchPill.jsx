import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../lib/geocode.js';

/**
 * The bar across the top: where you are, the two numbers that matter most
 * right there in the pill, and a search that replaces them when you tap it.
 */
export default function SearchPill({ location, weather, score, color, onPick, onGuide }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try { setResults(await searchPlaces(query.trim())); } catch { setResults([]); }
      setBusy(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const away = (e) => { if (!box.current?.contains(e.target)) { setOpen(false); setResults(null); } };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, []);

  function type(value) {
    const worth = value.trim().length >= 2;
    setQuery(value);
    setBusy(worth);
    if (!worth) setResults(null);
  }

  function choose(place) {
    // `address` travels with the pick: a house number means the map should
    // go all the way in, a town means it should not.
    onPick({ lat: place.lat, lng: place.lng, label: place.label, address: place.address });
    setOpen(false);
    setQuery('');
    setResults(null);
  }

  return (
    <div className="topline" ref={box}>
      <div className={`pill search-pill ${open ? 'open' : ''}`}>
        <Magnifier />

        {open ? (
          <input
            ref={input}
            className="pill-input"
            value={query}
            autoFocus
            onChange={(e) => type(e.target.value)}
            placeholder="Search any town or area"
            aria-label="Search for a place"
          />
        ) : (
          <button className="pill-face" onClick={() => setOpen(true)}>
            <span className="place">{location.label}</span>
            {weather && (
              <>
                <span className="stat"><Thermo /> {Math.round(weather.temp)}&deg;</span>
                <span className="stat"><Gust /> {Math.round(weather.windGust)} <em>mph</em></span>
                <span className="stat"><i className="bead" style={{ background: color }} /> {score}</span>
              </>
            )}
            <Chevron />
          </button>
        )}

        {busy && <span className="pill-spin" />}
      </div>

      <button className="round" onClick={onGuide} title="How DeltaWatch works">
        <Gear />
      </button>

      {open && results && (
        <div className="results-sheet">
          {results.length === 0
            ? <p className="empty">Nothing found for &ldquo;{query}&rdquo;.</p>
            : results.map((place) => (
                <button key={`${place.lat},${place.lng}`} onClick={() => choose(place)}>
                  <b>{place.label}</b>
                  <small>{place.detail}</small>
                </button>
              ))}
        </div>
      )}
    </div>
  );
}

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const Magnifier = () => (
  <svg className="ico" viewBox="0 0 24 24" {...s}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
const Chevron = () => (
  <svg className="ico chev" viewBox="0 0 24 24" {...s}><path d="m6 9 6 6 6-6" /></svg>
);
const Thermo = () => (
  <svg className="ico sm" viewBox="0 0 24 24" {...s}><path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0Z" /></svg>
);
const Gust = () => (
  <svg className="ico sm" viewBox="0 0 24 24" {...s}><path d="M3 8h10a3 3 0 1 0-3-3M3 16h14a3 3 0 1 1-3 3M3 12h18" /></svg>
);
const Gear = () => (
  <svg className="ico" viewBox="0 0 24 24" {...s}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7" />
  </svg>
);
