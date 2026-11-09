import { useEffect, useRef, useState } from 'react';
import { Icon, ErrorLine, Modal } from './ui';
import { api } from '../lib/api';

// Bouton « joindre une photo ou un GIF » : la photo est réduite avant l'envoi (voir lib/images.js).
export function AttachButton({ onPick, disabled }) {
  return (
    <label
      title="Joindre une photo ou un GIF"
      aria-label="Joindre une photo ou un GIF"
      className={`flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 ${disabled ? 'pointer-events-none opacity-40' : ''}`}
    >
      <Icon name="image" className="h-5 w-5" />
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
    </label>
  );
}

// Bouton GIF : ouvre le sélecteur de GIF en ligne.
export function GifButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      title="Ajouter un GIF"
      aria-label="Ajouter un GIF"
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 px-2.5 text-[11px] font-extrabold tracking-wider text-slate-600 transition hover:bg-slate-200 disabled:pointer-events-none disabled:opacity-40"
    >
      GIF
    </button>
  );
}

// Sélecteur de GIF : recherche sur Giphy, le GIF choisi est importé sur le serveur puis envoyé comme une image.
export function GifPicker({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return undefined;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const data = await api(`/api/gifs/search?q=${encodeURIComponent(term)}`);
        setResults(data.results || []);
      } catch (err) {
        setResults([]);
        setError(err.message);
      } finally {
        setBusy(false);
        setSearched(true);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q]);

  const choose = async (gif) => {
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/gifs/import', { method: 'POST', body: { url: gif.url } });
      onPick(data.url);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open title="Choisir un GIF" onClose={onClose} width="max-w-2xl">
      <input className="field" autoFocus maxLength={40} placeholder="Rechercher un GIF…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorLine>{error}</ErrorLine>
      <div className="thin-scroll mt-4 grid max-h-[55dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {results.map((gif) => (
          <button key={gif.id} type="button" onClick={() => choose(gif)} disabled={busy} className="aspect-video overflow-hidden rounded-2xl bg-slate-100 transition hover:ring-2 hover:ring-slate-400 disabled:opacity-60">
            <img src={gif.preview} alt="GIF" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {busy && <p className="mt-3 text-sm text-slate-500">Chargement…</p>}
      {!busy && searched && !error && results.length === 0 && <p className="mt-3 text-sm text-slate-500">Aucun GIF trouvé.</p>}
      <p className="mt-3 text-right text-[11px] font-semibold text-slate-400">Propulsé par GIPHY</p>
    </Modal>
  );
}

// Aperçu de la photo ou du GIF en attente d'envoi, avec un bouton pour le retirer.
export function AttachPreview({ src, onRemove }) {
  if (!src) return null;
  return (
    <div className="relative mb-3 w-fit max-w-full">
      <img src={src} alt="Image à envoyer" className="max-h-40 max-w-full rounded-2xl object-contain" />
      <button type="button" onClick={onRemove} aria-label="Retirer l’image" className="absolute -right-2 -top-2 rounded-full bg-surface p-1.5 text-slate-600 shadow-soft hover:text-slate-900">
        <Icon name="x" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Photo ou GIF d'un message : chargée à la demande, cliquable pour l'ouvrir en grand.
// Le repère GIF s'affiche sur les GIF animés.
export function MessageImage({ src, gif = false }) {
  if (!src) return null;
  const animated = gif || src.startsWith('data:image/gif');
  return (
    <a href={src} target="_blank" rel="noreferrer" className="relative mt-2 block w-fit max-w-full">
      <img src={src} alt={animated ? 'GIF' : 'Image envoyée'} loading="lazy" decoding="async" className="max-h-72 max-w-full rounded-2xl object-contain" />
      {animated && (
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white" />
          GIF
        </span>
      )}
    </a>
  );
}
