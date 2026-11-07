import { getMe, logout, updateSettings } from '../lib/store';
import { useStore, useUI } from '../components/ui';
import PageBanner from '../components/PageBanner';
import { run } from './ServerView';

function Card({ title, children }) {
  return (
    <section className="panel flex flex-col gap-4 p-6">
      <h2 className="font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

// Choix exclusif (boutons radio stylés).
function Choice({ value, options, onChange }) {
  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      {options.map(([key, label, hint]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={`flex min-h-[44px] items-start gap-3 rounded-2xl border p-4 text-left transition ${
            value === key ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-surface hover:border-brand-200'
          }`}
        >
          <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${value === key ? 'border-brand-600' : 'border-slate-300'}`}>
            {value === key && <span className="h-2 w-2 rounded-full bg-brand-600" />}
          </span>
          <span className="flex flex-col">
            <span className="font-bold text-slate-900">{label}</span>
            {hint && <span className="text-xs text-slate-500">{hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4">
      <span className="flex flex-col">
        <span className="font-bold text-slate-900">{label}</span>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </span>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-brand-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function SettingsView() {
  const s = useStore();
  const { toast } = useUI();
  const me = getMe(s);
  const st = me.settings || {};
  const set = (patch) => run(toast, () => updateSettings(patch));

  return (
    <div className="thin-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto pb-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <PageBanner icon="settings" title="Paramètres" subtitle="Gérez l’application : apparence, messages et demandes." />

        <Card title="Apparence">
          <Choice
            value={st.theme === 'dark' ? 'dark' : 'light'}
            onChange={(v) => set({ theme: v })}
            options={[['light', 'Clair', 'Fond blanc, le thème d’origine'], ['dark', 'Sombre', 'Fond sombre, plus doux pour les yeux']]}
          />
        </Card>

        <Card title="Messages privés">
          <Choice
            value={st.dmOpen ? 'open' : 'request'}
            onChange={(v) => set({ dmOpen: v === 'open' })}
            options={[
              ['request', 'Demande de message', 'Une personne qui n’est pas amie doit d’abord envoyer une demande, que vous acceptez.'],
              ['open', 'Tout le monde peut m’écrire', 'Les messages arrivent directement, sans demande, même sans être amis.'],
            ]}
          />
        </Card>

        <Card title="Demandes d’amis">
          <Choice
            value={st.acceptFriendRequests === false ? 'refuse' : 'accept'}
            onChange={(v) => set({ acceptFriendRequests: v === 'accept' })}
            options={[
              ['accept', 'Accepter les demandes d’ami', 'Les personnes peuvent vous envoyer une demande d’ami.'],
              ['refuse', 'Refuser les demandes d’ami', 'Personne ne peut vous envoyer de demande d’ami.'],
            ]}
          />
        </Card>

        <Card title="Compte">
          <button type="button" onClick={() => logout()} className="btn-ghost self-start">Se déconnecter</button>
        </Card>
      </div>
    </div>
  );
}
