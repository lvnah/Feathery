import { changeEmail, changePassword, getMe, logout, updateSettings } from '../lib/store';
import { useState } from 'react';
import { ErrorLine, useStore, useUI } from '../components/ui';
import { canChooseOutput, getAudioPrefs, listAudioDevices, setAudioPrefs } from '../lib/voice';
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

// Micro et haut-parleur utilisés pendant les vocaux.
function AudioCard() {
  const [devices, setDevices] = useState(null);
  const [prefs, setPrefs] = useState(getAudioPrefs());
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    try {
      setDevices(await listAudioDevices());
    } catch (err) {
      setError('Autorisez le micro pour voir vos appareils.');
    }
  };
  const choose = (patch) => {
    setAudioPrefs(patch);
    setPrefs(getAudioPrefs());
  };
  const select = (label, list, key) => (
    <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
      {label}
      <select className="field" value={prefs[key] || ''} onChange={(e) => choose({ [key]: e.target.value })}>
        <option value="">Par défaut</option>
        {list.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || `Appareil ${d.deviceId.slice(0, 6)}`}</option>
        ))}
      </select>
    </label>
  );
  return (
    <Card title="Micro et haut-parleur">
      {!devices ? (
        <button type="button" onClick={load} className="btn-ghost self-start">Afficher mes appareils</button>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {select('Micro (entrée)', devices.inputs, 'input')}
          {canChooseOutput() ? (
            select('Haut-parleur (sortie)', devices.outputs, 'output')
          ) : (
            <p className="text-xs text-slate-500 md:col-span-2">Le choix du haut-parleur n’est pas disponible sur ce navigateur : utilisez le réglage de votre appareil.</p>
          )}
        </div>
      )}
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}

// Informations personnelles : adresse e-mail et mot de passe (l'ancien est toujours demandé).
function PersonalInfo({ me, toast }) {
  const st = me.settings || {};
  const [newEmail, setNewEmail] = useState('');
  const [emailPwd, setEmailPwd] = useState('');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const doEmail = async (e) => {
    e.preventDefault();
    setError('');
    const ok = await run(toast, () => changeEmail(emailPwd, newEmail.trim()), 'Adresse mise à jour. Vérifiez votre boîte mail si la confirmation est activée.');
    if (ok) { setNewEmail(''); setEmailPwd(''); }
  };
  const doPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPwd !== confirmPwd) return setError('Les deux nouveaux mots de passe ne correspondent pas.');
    const ok = await run(toast, () => changePassword(oldPwd, newPwd), 'Mot de passe modifié');
    if (ok) { setOldPwd(''); setNewPwd(''); setConfirmPwd(''); }
  };
  return (
    <Card title="Informations personnelles">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-500">Adresse e-mail :</span>
        <span className="font-bold text-slate-900">{st.email || 'aucune'}</span>
        {st.email && (
          <span className={`pill ${st.emailVerified ? '!bg-brand-100 !text-brand-700' : '!bg-amber-100 !text-amber-800'}`}>
            {st.emailVerified ? 'Confirmée' : 'À confirmer'}
          </span>
        )}
      </div>
      <form onSubmit={doEmail} className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <p className="text-sm font-bold text-slate-900">Changer d’adresse e-mail</p>
        <input type="email" className="field" placeholder="Nouvelle adresse" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <input type="password" className="field" placeholder="Mot de passe actuel" value={emailPwd} onChange={(e) => setEmailPwd(e.target.value)} autoComplete="current-password" />
        <button type="submit" className="btn-ghost self-start" disabled={!newEmail.includes('@') || !emailPwd}>Changer l’adresse</button>
      </form>
      <form onSubmit={doPassword} className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <p className="text-sm font-bold text-slate-900">Changer de mot de passe</p>
        <input type="password" className="field" placeholder="Ancien mot de passe" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} autoComplete="current-password" />
        <input type="password" className="field" placeholder="Nouveau mot de passe (8 caractères minimum)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" />
        <input type="password" className="field" placeholder="Confirmer le nouveau mot de passe" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} autoComplete="new-password" />
        <button type="submit" className="btn-ghost self-start" disabled={!oldPwd || newPwd.length < 8 || !confirmPwd}>Changer le mot de passe</button>
      </form>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}

export default function SettingsView() {
  const s = useStore();
  const { toast } = useUI();
  const me = getMe(s);
  const st = me.settings || {};
  const set = (patch) => updateSettings(patch).catch((err) => toast(err.message));

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

        <AudioCard />

        <PersonalInfo me={me} toast={toast} />

        <Card title="Compte">
          <button type="button" onClick={() => logout()} className="btn-ghost self-start">Se déconnecter</button>
        </Card>
      </div>
    </div>
  );
}
