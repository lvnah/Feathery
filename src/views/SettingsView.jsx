import { changeEmail, changePassword, getMe, logout, updateSettings } from '../lib/store';
import { useEffect, useState } from 'react';
import { ErrorLine, useStore, useUI } from '../components/ui';
import { canChooseOutput, getAudioPrefs, grantMicAccess, listAudioDevices, setAudioPrefs, subscribeAudioDevices } from '../lib/voice';
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

// Micro et haut-parleur utilisés pendant les vocaux. La liste se met à jour toute seule (branchement, débranchement).
function AudioCard() {
  const [devices, setDevices] = useState(null);
  const [prefs, setPrefs] = useState(getAudioPrefs());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const scan = async () => {
    try {
      setDevices(await listAudioDevices());
    } catch {
      setDevices({ inputs: [], outputs: [], named: false });
    }
  };
  useEffect(() => {
    scan();
    return subscribeAudioDevices(scan);
  }, []);
  const choose = (patch) => {
    setAudioPrefs(patch);
    setPrefs(getAudioPrefs());
  };
  const allow = async () => {
    setBusy(true);
    setError('');
    try {
      await grantMicAccess();
      await scan();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const inputs = devices?.inputs ?? [];
  const select = (label, list, key) => (
    <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
      {label}
      <select className="field" value={prefs[key] || ''} onChange={(e) => choose({ [key]: e.target.value })}>
        <option value="">Par défaut</option>
        {list.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || `Appareil ${i + 1}`}</option>
        ))}
      </select>
    </label>
  );
  return (
    <Card title="Micro et haut-parleur">
      {devices === null ? (
        <p className="text-sm text-slate-500">Recherche des appareils…</p>
      ) : inputs.length === 0 ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Aucun micro détecté pour l’instant. Branchez-le : la liste se mettra à jour toute seule. Si le micro est branché, vérifiez qu’il n’est pas utilisé par une autre application.
        </p>
      ) : (
        <p className="text-sm font-semibold text-brand-700">
          {inputs.length === 1 ? '1 micro détecté' : `${inputs.length} micros détectés`}
          {!devices.named && ' (autorisez le micro pour voir son nom)'}
        </p>
      )}
      {devices && !devices.named && (
        <button type="button" onClick={allow} disabled={busy} className="btn-ghost self-start">
          {busy ? 'Autorisation…' : 'Autoriser le micro pour voir les noms'}
        </button>
      )}
      {inputs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {select('Micro (entrée)', inputs, 'input')}
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

// Informations personnelles, une partie à la fois : adresse e-mail, ou mot de passe (l'ancien est toujours demandé).
function PersonalInfo({ me, toast, part }) {
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
  if (part === 'password') {
    return (
      <Card title="Mot de passe">
        <form onSubmit={doPassword} className="flex flex-col gap-3">
          <input type="password" className="field" placeholder="Ancien mot de passe" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} autoComplete="current-password" />
          <input type="password" className="field" placeholder="Nouveau mot de passe (8 caractères minimum)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" />
          <input type="password" className="field" placeholder="Confirmer le nouveau mot de passe" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} autoComplete="new-password" />
          <button type="submit" className="btn-ghost self-start" disabled={!oldPwd || newPwd.length < 8 || !confirmPwd}>Changer le mot de passe</button>
        </form>
        <ErrorLine>{error}</ErrorLine>
      </Card>
    );
  }
  return (
    <Card title="Adresse e-mail">
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
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}

const SECTIONS = [
  ['messages', 'Messages privés'],
  ['friends', 'Demandes d’amis'],
  ['audio', 'Micro et son'],
  ['email', 'Adresse e-mail'],
  ['password', 'Mot de passe'],
  ['account', 'Compte'],
];

// Une seule section à la fois : la page ne défile pas, on change de section (liste à gauche ou menu sur téléphone).
export default function SettingsView() {
  const s = useStore();
  const { toast } = useUI();
  const me = getMe(s);
  const st = me.settings || {};
  const set = (patch) => updateSettings(patch).catch((err) => toast(err.message));
  const [section, setSection] = useState('messages');

  let content = null;
  if (section === 'messages') {
    content = (
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
    );
  } else if (section === 'friends') {
    content = (
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
    );
  } else if (section === 'audio') {
    content = <AudioCard />;
  } else if (section === 'email') {
    content = <PersonalInfo me={me} toast={toast} part="email" />;
  } else if (section === 'password') {
    content = <PersonalInfo me={me} toast={toast} part="password" />;
  } else {
    content = (
      <Card title="Compte">
        <button type="button" onClick={() => logout()} className="btn-ghost self-start">Se déconnecter</button>
      </Card>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <PageBanner icon="settings" title="Paramètres" subtitle="Gérez l’application : messages, demandes, audio et compte." />
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <select
          aria-label="Section des paramètres"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="field shrink-0 lg:hidden"
        >
          {SECTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <nav aria-label="Sections des paramètres" className="panel hidden shrink-0 flex-col gap-1 p-2 lg:flex lg:w-60">
          {SECTIONS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={section === key ? 'page' : undefined}
              onClick={() => setSection(key)}
              className={`rounded-2xl px-4 py-2.5 text-left text-sm font-bold transition ${section === key ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden lg:max-w-2xl">{content}</div>
      </div>
    </div>
  );
}
