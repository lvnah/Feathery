import { Icon } from './ui';

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

// Aperçu de la photo en attente d'envoi, avec un bouton pour la retirer.
export function AttachPreview({ src, onRemove }) {
  if (!src) return null;
  return (
    <div className="relative mb-3 w-fit max-w-full">
      <img src={src} alt="Photo à envoyer" className="max-h-40 max-w-full rounded-2xl object-contain" />
      <button type="button" onClick={onRemove} aria-label="Retirer la photo" className="absolute -right-2 -top-2 rounded-full bg-surface p-1.5 text-slate-600 shadow-soft hover:text-slate-900">
        <Icon name="x" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Photo ou GIF d'un message : chargée à la demande, cliquable pour l'ouvrir en grand.
export function MessageImage({ src }) {
  if (!src) return null;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="mt-2 block w-fit max-w-full">
      <img src={src} alt="Image envoyée" loading="lazy" decoding="async" className="max-h-72 max-w-full rounded-2xl object-contain" />
    </a>
  );
}
