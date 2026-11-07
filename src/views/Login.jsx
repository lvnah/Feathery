import { useState } from 'react';
import { login, register } from '../lib/store';
import { ErrorLine, Icon } from '../components/ui';
import { LeafLogo } from '../components/Layout';

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
    {label}
    {children}
  </label>
);

// Connexion (pseudo#tag ou e-mail) ou création de compte (avec confirmation par e-mail si activée).
export default function Login() {
  const [mode, setMode] = useState('login');
  const [method, setMethod] = useState('handle'); // 'handle' = Pseudo + tag, 'email' = adresse e-mail
  const [pseudo, setPseudo] = useState('');
  const [tag, setTag] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSent(false);
    setBusy(true);
    try {
      if (mode === 'register') {
        const res = await register(pseudo.trim(), password, tag, email.trim());
        if (res.pending) {
          setSent(true);
          setMode('login');
          setMethod('email');
          setPassword('');
        }
      } else {
        await login(method === 'email' ? email.trim() : `${pseudo.trim()}#${tag}`, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    password.length >= 8 &&
    (mode === 'register'
      ? pseudo.trim().length >= 2 && email.includes('@')
      : method === 'email' ? email.includes('@') : pseudo.trim() && tag.length === 4);

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="panel w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface shadow-soft">
            <LeafLogo />
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900">Bienvenue sur Feathery</h1>
          <p className="text-sm text-slate-500">Client web léger de discussion pour gamers et communautés.</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          {[['login', 'Connexion'], ['register', 'Créer un compte']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setMode(key); setError(''); setSent(false); }}
              className={`rounded-xl py-2.5 text-sm font-semibold transition ${mode === key ? 'bg-surface text-slate-900 shadow-soft' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {sent && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-800">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Compte créé. Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous.</p>
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === 'login' ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                {[['handle', 'Pseudo + tag'], ['email', 'E-mail']].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMethod(key)}
                    className={`rounded-xl border py-2 ${method === key ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {method === 'handle' ? (
                <div className="flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                  Pseudo et tag
                  <div className="flex items-center gap-2">
                    <input className="field min-w-0 flex-1 normal-case tracking-normal" placeholder="Ex. Lina" value={pseudo} maxLength={40} autoComplete="username" onChange={(e) => setPseudo(e.target.value)} aria-label="Pseudo" />
                    <span className="text-lg font-extrabold text-slate-400">#</span>
                    <input className="field w-28 shrink-0 normal-case font-mono tracking-normal" placeholder="4821" value={tag} inputMode="numeric" maxLength={4} onChange={(e) => setTag(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Tag" />
                  </div>
                </div>
              ) : (
                <Field label="Adresse e-mail">
                  <input type="email" className="field normal-case tracking-normal" placeholder="vous@exemple.fr" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="Pseudo">
                <input className="field normal-case tracking-normal" placeholder="Votre pseudo (2 à 24 caractères)" value={pseudo} maxLength={40} autoComplete="username" onChange={(e) => setPseudo(e.target.value)} />
              </Field>
              <Field label="Adresse e-mail">
                <input type="email" className="field normal-case tracking-normal" placeholder="vous@exemple.fr" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Tag # (4 chiffres, facultatif)">
                <input className="field normal-case font-mono tracking-normal" placeholder="Laissez vide pour un tag automatique" value={tag} inputMode="numeric" maxLength={4} onChange={(e) => setTag(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </Field>
            </>
          )}
          <Field label="Mot de passe">
            <input type="password" className="field normal-case tracking-normal" placeholder="8 caractères minimum" value={password} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button type="submit" className="btn-primary mt-2" disabled={!canSubmit}>
            <Icon name="arrow" className="h-4 w-4" />
            {mode === 'register' ? 'Créer mon compte' : 'Se connecter'}
          </button>
        </form>
        <ErrorLine>{error}</ErrorLine>
      </div>
    </div>
  );
}
