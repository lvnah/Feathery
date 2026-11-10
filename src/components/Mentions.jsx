import { Fragment } from 'react';

// Une mention : @pseudo (lettres, chiffres, _ . -). Seuls les pseudos connus sont mis en valeur.
const MENTION_SPLIT = /(@[\p{L}\p{N}_.-]{2,24})/u;

// Texte d'un message avec les mentions en gras ; la mention de soi-même ressort davantage.
// Un clic sur une mention ouvre le mini-profil du membre. « users » : Map pseudo (minuscules) -> membre.
export function MentionText({ text, users, meName = '', onOpen }) {
  const me = meName.toLowerCase();
  return (
    <>
      {String(text ?? '').split(MENTION_SPLIT).map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const member = users.get(part.slice(1).toLowerCase());
        if (!member) return <Fragment key={i}>{part}</Fragment>;
        const mine = member.pseudo.toLowerCase() === me;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpen?.(member.id)}
            className={`rounded-md px-1 font-extrabold hover:underline ${mine ? 'bg-slate-900 text-white' : 'bg-slate-300/70 text-slate-900'}`}
          >
            {part}
          </button>
        );
      })}
    </>
  );
}

// Suggestions de pseudos quand on tape « @… » dans le champ : la sélection remplace le mot en cours.
export function mentionQuery(text) {
  const m = /@([\p{L}\p{N}_.-]{0,24})$/u.exec(text);
  return m ? m[1] : null;
}

export function MentionSuggest({ candidates, onPick }) {
  if (!candidates.length) return null;
  return (
    <div role="listbox" aria-label="Mentionner un membre" className="panel absolute bottom-full left-0 right-0 mb-2 max-h-56 overflow-y-auto p-1.5 shadow-soft">
      {candidates.map((u) => (
        <button key={u.id} type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(u.pseudo)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-900 hover:bg-slate-200">
          @{u.pseudo}
          <span className="text-xs font-semibold text-slate-400">#{u.tag}</span>
        </button>
      ))}
    </div>
  );
}
