import { useState } from 'react';
import { getMe, getUser, friendshipBetween, isFriend, sendFriendRequest, setStatus, updateProfile } from '../lib/store';
import { useStore, useUI, Avatar, Banner, EmptyState, ErrorLine, Icon } from '../components/ui';
import { BANNER_GRADIENTS, LOGO_CLASSIC, PLUS_BANNER_PRESETS, bannerStyle, fullName, isOnline, statusLabel, statusColor, nameStyle, RAINBOW_GRADIENTS, RAINBOW_LABELS } from '../lib/util';
import { fileToDataUrl, readGif, AVATAR_OPTS, BANNER_OPTS, GIF_MAX_AVATAR, GIF_MAX_BANNER } from '../lib/images';
import { NAME_COLORS_BASIC, NAME_COLORS_PLUS } from '../lib/util';
import PlusBadge, { RoleBadge } from '../components/PlusBadge';
import Flag from '../components/Flag';
import CountrySelect from '../components/CountrySelect';
import { countryName } from '../lib/countries';
import { run } from './ServerView';

// Mon profil : page Paramètres du profil. Autre utilisateur : profil public.
export default function ProfileView({ userId, edit = false, goBack }) {
  const s = useStore();
  const me = getMe(s);
  const user = getUser(s, userId);
  if (!user) return <EmptyState icon="user" title="Profil introuvable">Cet utilisateur n’existe pas.</EmptyState>;
  return user.id === me.id && edit ? <OwnProfile key={me.id} /> : <PublicProfile user={user} goBack={goBack} />;
}

function OwnProfile() {
  const s = useStore();
  const { toast, go } = useUI();
  const me = getMe(s);
  const [pseudo, setPseudo] = useState(me.pseudo);
  const [tag, setTag] = useState(me.tag);
  const [avatar, setAvatar] = useState(me.avatar || '');
  const [bio, setBio] = useState(me.bio || '');
  const [country, setCountry] = useState(me.country || '');
  const [nameColor, setNameColor] = useState(me.name_color || '');
  const [banner, setBanner] = useState(me.banner?.type === 'image' || me.banner?.type === 'preset' ? me.banner : { type: 'gradient', index: me.banner?.index ?? 0 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const preview = { ...me, pseudo: pseudo || me.pseudo, avatar, banner };

  const pick = (setter, opts, asBanner = false) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = file.type === 'image/gif'
        ? await readGif(file, asBanner ? GIF_MAX_BANNER : GIF_MAX_AVATAR, !!me.is_plus)
        : await fileToDataUrl(file, opts);
      setter(asBanner ? { type: 'image', value: data } : data);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await updateProfile({ pseudo, tag: me.is_plus ? tag : undefined, avatar, bio, banner, country, nameColor });
      // Enregistré : retour sur la vue de son profil.
      go({ name: 'profile', userId: me.id });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel thin-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
        <h1 className="text-xl font-extrabold">Paramètres du profil</h1>
        <button onClick={() => go({ name: 'profile', userId: me.id })} className="text-sm font-bold text-red-500 hover:text-red-600">Quitter</button>
      </div>

      <div className="flex justify-center p-8">
        <form onSubmit={save} className="w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-slate-100 bg-surface shadow-soft">
          <div className="relative h-40">
            {/* Cliquer sur la bannière ou la photo ouvre le choix du fichier */}
            <label className="group absolute inset-0 cursor-pointer" style={bannerStyle(preview)} title="Changer la bannière">
              <span className="pointer-events-none absolute inset-0 hidden items-center justify-center border-2 border-dashed border-white/80 bg-black/30 group-hover:flex"><Icon name="camera" className="h-7 w-7 text-white" /></span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={pick(setBanner, BANNER_OPTS, true)} />
            </label>
            <label className="group absolute -bottom-12 left-7 h-24 w-24 cursor-pointer rounded-full ring-2 ring-surface" title="Changer la photo">
              <span className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center rounded-full border-2 border-dashed border-white bg-black/40 group-hover:flex"><Icon name="pencil" className="h-6 w-6 text-white" /></span>
              <Avatar user={preview} size="xl" className="!h-full !w-full" />
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={pick(setAvatar, AVATAR_OPTS)} />
            </label>
          </div>

          <div className="flex flex-col gap-5 px-7 pb-7">
            <div className="flex min-h-12 items-center justify-end pt-3">
              {me.is_plus ? <span className="rounded-full bg-brand-100 px-3 py-1.5 text-xs font-bold text-brand-700">Pass PLUS Actif</span> : null}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Nom d’utilisateur" className="col-span-2">
                <input className="field" value={pseudo} maxLength={24} onChange={(e) => setPseudo(e.target.value)} />
              </Field>
              <Field label="Tag # (4 chiffres)">
                <input className="field font-mono" value={tag} disabled={!me.is_plus} inputMode="numeric" maxLength={4} onChange={(e) => setTag(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </Field>
            </div>

            <Field label="Couleur du pseudo">
              <div className="flex flex-wrap items-center gap-2">
                {[''].concat(me.is_plus ? NAME_COLORS_PLUS : NAME_COLORS_BASIC).map((c) => (
                  <button
                    key={c || 'none'}
                    type="button"
                    aria-label={c || 'Couleur par défaut'}
                    onClick={() => setNameColor(c)}
                    title={RAINBOW_LABELS[c] || c || 'Couleur par défaut'}
                    className={`h-7 w-7 rounded-full border-2 ${nameColor === c ? 'border-brand-600 ring-2 ring-brand-300' : 'border-line'}`}
                    style={{ background: RAINBOW_GRADIENTS[c] || c || 'repeating-linear-gradient(45deg,#e2e8f0 0 4px,#fff 4px 8px)' }}
                  />
                ))}
              </div>
              {!me.is_plus && <span className="text-xs text-slate-400">D’autres couleurs sont réservées aux membres PLUS.</span>}
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Statut">
                <select className="field" value={me.status || 'online'} onChange={(e) => run(toast, () => setStatus(e.target.value))}>
                  <option value="online">En ligne</option>
                  <option value="game">En game</option>
                  <option value="away">Absent</option>
                  <option value="offline">Hors ligne</option>
                </select>
              </Field>
              <Field label="Pays (Europe)">
                <CountrySelect value={country} onChange={setCountry} />
              </Field>
            </div>

            <Field label="Photo de profil">
              <ImportButton onChange={pick(setAvatar, AVATAR_OPTS)} label={avatar ? 'Changer la photo' : 'Importer une photo'} />
            </Field>

            <Field label="Bannières classiques" accent>
              <div className="flex flex-wrap gap-2">
                {LOGO_CLASSIC.map((theme, index) => (
                  <button
                    key={theme.label}
                    type="button"
                    title={theme.label}
                    aria-label={`Bannière ${theme.label}`}
                    onClick={() => setBanner({ type: 'gradient', index })}
                    className={`h-12 w-24 rounded-xl border-2 ${banner.type !== 'image' && banner.type !== 'preset' && (banner.index ?? 0) === index ? 'border-brand-600 ring-2 ring-brand-300' : 'border-line'}`}
                    style={bannerStyle({ banner: { type: 'gradient', index } })}
                  />
                ))}
              </div>
            </Field>

            {(me.is_plus || me.is_admin) && (
              <Field label="Bannières animées PLUS" accent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PLUS_BANNER_PRESETS).filter(([, preset]) => !preset.admin || me.is_admin).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      title={preset.label}
                      aria-label={`Bannière ${preset.label}`}
                      onClick={() => setBanner({ type: 'preset', key })}
                      className={`h-12 w-24 rounded-xl border-2 ${banner.type === 'preset' && banner.key === key ? 'border-brand-600 ring-2 ring-brand-300' : 'border-line'}`}
                      style={bannerStyle({ banner: { type: 'preset', key }, is_plus: true })}
                    />
                  ))}
                </div>
              </Field>
            )}

            <Field label="Bannière (GIF animé : PLUS)" accent>
              <ImportButton
                onChange={pick(setBanner, BANNER_OPTS, true)}
                label={banner.type === 'image' ? 'Changer la bannière' : 'Importer une image de bannière'}
              />
              {banner.type === 'image' && (
                <button type="button" onClick={() => setBanner({ type: 'gradient', index: 0 })} className="self-start text-xs font-bold text-slate-500 hover:text-slate-900">
                  Revenir au dégradé vert
                </button>
              )}
            </Field>

            <Field label={`Bio (${bio.length}/190)`}>
              <textarea className="field min-h-24 resize-none" value={bio} maxLength={190} onChange={(e) => setBio(e.target.value)} />
            </Field>

            <ErrorLine>{error}</ErrorLine>
            <button type="submit" className="btn-soft w-full !rounded-2xl !py-4" disabled={busy}>
              Enregistrer les modifications
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Bouton d'import présenté comme un champ (même hauteur et même fond que les autres champs).
function ImportButton({ onChange, label, disabled = false }) {
  return (
    <label className={`field flex items-center justify-between text-slate-500 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-brand-300'}`}>
      <span>{label}</span>
      <Icon name="arrow" className="h-4 w-4 text-slate-400" />
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={disabled} onChange={onChange} />
    </label>
  );
}

function PublicProfile({ user, goBack }) {
  const s = useStore();
  const { go, openModal, toast } = useUI();
  const me = getMe(s);
  const friend = isFriend(s, me.id, user.id);
  const pending = friendshipBetween(s, me.id, user.id);
  const roles = s.memberships.filter((m) => m.user_id === user.id).length;

  return (
    <div className="panel thin-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
        <h1 className="text-xl font-extrabold">Profil</h1>
        <button onClick={goBack ?? (() => go({ name: 'home' }))} className="text-sm font-bold text-slate-500 hover:text-slate-900">Retour</button>
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-8">
        <div className="overflow-hidden rounded-[2rem] border border-slate-100 shadow-soft">
          <Banner user={user} />
          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="flex flex-col items-start gap-3">
              <Avatar user={user} size="xl" showStatus className="-mt-12 ring-4 ring-surface" />
              <div className="min-w-0">
                <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-2xl font-extrabold">
                  <span className="truncate" style={nameStyle(user)}>{user.pseudo}</span> <span className="text-base font-semibold text-slate-400">#{user.tag}</span>
                  <RoleBadge user={user} />
                  {user.country ? <Flag code={user.country} name={countryName(user.country)} /> : null}
                </h2>
                <p className={`text-sm font-semibold ${isOnline(user) ? 'text-brand-600' : 'text-slate-400'}`}><span style={{ color: statusColor(user) }}>{statusLabel(user)}</span></p>
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">À propos</h3>
              <p className="text-sm text-slate-700">{user.bio || "Cet utilisateur n’a pas encore rédigé de biographie."}</p>
            </div>
            <GamesBlock user={user} editable={user.id === me.id} />
            {(user.spaces ?? []).length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Espaces</span>
                <div className="flex flex-wrap gap-2">
                  {user.spaces.map((sp) => (
                    <span key={sp.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{sp.name}</span>
                  ))}
                </div>
              </div>
            )}
                        {user.id === me.id && (
              <div className="flex gap-2 pt-2">
                <button className="btn-primary" onClick={() => go({ name: 'profile', userId: me.id, edit: true })}>Modifier le profil</button>
              </div>
            )}
            {user.id !== me.id && (
              <div className="flex flex-wrap gap-2 pt-2">
                <button className="btn-primary" onClick={() => go({ name: 'messages', withId: user.id })}>Envoyer un message</button>
                {!friend && (
                  <button className="btn-ghost" disabled={!!pending} onClick={() => run(toast, () => sendFriendRequest(user.id), 'Demande d’ami envoyée')}>
                    {pending ? 'Demande en attente' : 'Ajouter en ami'}
                  </button>
                )}
                <button className="btn-danger" onClick={() => openModal('report', { userId: user.id })}>
                  <Icon name="flag" className="h-4 w-4" />
                  Signaler
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, accent = false, className = '' }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span className={`text-[11px] font-bold uppercase tracking-widest ${accent ? 'text-brand-600' : 'text-slate-400'}`}>{label}</span>
      {children}
    </div>
  );
}

// Mini-statut des jeux (rang, heures) : un clic pour modifier, si c'est son profil.
function GamesBlock({ user, editable }) {
  const { openModal } = useUI();
  const games = user.games ?? [];
  if (!editable && games.length === 0) return null;
  return (
    <button
      type="button"
      disabled={!editable}
      onClick={() => openModal('games')}
      className={`flex w-full flex-col gap-3 rounded-2xl border border-line bg-slate-50 p-4 text-left ${editable ? 'cursor-pointer hover:bg-slate-100' : 'cursor-default'}`}
    >
      <span className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Mes jeux</span>
        {editable && <span className="text-xs font-bold text-brand-600">Modifier</span>}
      </span>
      {games.length === 0 ? (
        <span className="text-sm text-slate-500">Ajoutez vos jeux.</span>
      ) : (
        <span className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {games.map((g) => (
            <span key={g.game} className="flex flex-col rounded-xl bg-surface px-3 py-2 shadow-soft">
              <span className="truncate text-sm font-extrabold">{g.game}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

