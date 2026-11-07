import { useEffect, useState } from 'react';
import { Icon } from './ui';
import {
  getSpotifyState, isSpotifyConnected, playSpotifySearch, spotifyNext, spotifyPrev, spotifyToggle, spotifyVolume,
  startSpotifyPlayer, subscribeSpotify,
} from '../lib/spotify';

const fmt = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// Lecteur Spotify flottant, intégré au thème de l'appli. Visible uniquement si le compte est connecté.
export default function SpotifyPlayer() {
  const [st, setSt] = useState(getSpotifyState());
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(st.position);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => subscribeSpotify(() => setSt(getSpotifyState())), []);
  useEffect(() => { setPos(st.position); }, [st.position]);
  useEffect(() => {
    if (st.paused || !st.duration) return undefined;
    const id = setInterval(() => setPos((p) => Math.min(p + 500, st.duration)), 500);
    return () => clearInterval(id);
  }, [st.paused, st.duration]);
  useEffect(() => {
    if (isSpotifyConnected()) startSpotifyPlayer();
  }, []);

  if (!isSpotifyConnected()) return null;
  const track = st.track;
  const search = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setMsg('');
    try {
      await playSpotifySearch(q.trim());
      setQ('');
    } catch (err) {
      setMsg(err.message);
    }
  };

  return (
    <div className="fixed bottom-24 right-3 z-40 lg:bottom-5 lg:right-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le lecteur Spotify"
          className="panel flex items-center gap-3 rounded-full py-2 pl-2 pr-4 shadow-panel"
        >
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-white">
            {track?.image ? <img src={track.image} alt="" className="h-full w-full object-cover" /> : <Icon name="speaker" className="h-5 w-5" />}
          </span>
          <span className="max-w-[9rem] truncate text-sm font-bold text-slate-900">{track ? track.name : 'Spotify'}</span>
        </button>
      ) : (
        <div className="panel w-[18rem] p-4 shadow-panel">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-600">Lecteur</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Réduire le lecteur" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-200">
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-500 text-white">
              {track?.image ? <img src={track.image} alt="" className="h-full w-full object-cover" /> : <Icon name="speaker" className="h-6 w-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-slate-900">{track ? track.name : 'Aucune lecture'}</p>
              <p className="truncate text-xs text-slate-500">{track ? track.artists : st.status === 'loading' ? 'Connexion au lecteur…' : 'Recherchez un titre ci-dessous'}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: st.duration ? `${(pos / st.duration) * 100}%` : '0%' }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] font-semibold text-slate-500">
              <span>{fmt(pos)}</span>
              <span>{fmt(st.duration)}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-4">
            <button type="button" onClick={spotifyPrev} aria-label="Titre précédent" className="rounded-full p-2 text-slate-700 hover:bg-slate-200">
              <Icon name="back" className="h-5 w-5" />
            </button>
            <button type="button" onClick={spotifyToggle} aria-label={st.paused ? 'Lecture' : 'Pause'} className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-soft hover:bg-brand-600">
              <Icon name={st.paused ? 'play' : 'pause'} className="h-5 w-5" />
            </button>
            <button type="button" onClick={spotifyNext} aria-label="Titre suivant" className="rounded-full p-2 text-slate-700 hover:bg-slate-200">
              <Icon name="arrow" className="h-5 w-5" />
            </button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Icon name="speaker" className="h-4 w-4" />
            <input type="range" min="0" max="1" step="0.01" value={st.volume} onChange={(e) => spotifyVolume(Number(e.target.value))} className="w-full accent-brand-500" aria-label="Volume" />
          </label>
          <form onSubmit={search} className="mt-3 flex gap-2">
            <input className="field !py-2 text-sm" placeholder="Rechercher un titre…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" className="btn-primary !py-2">OK</button>
          </form>
          {(msg || st.error) && <p className="mt-2 text-xs font-semibold text-red-600">{msg || st.error}</p>}
          {st.status === 'ready' && !track && <p className="mt-2 text-[11px] text-slate-400">Lecteur prêt. La lecture complète demande un compte Premium.</p>}
        </div>
      )}
    </div>
  );
}
