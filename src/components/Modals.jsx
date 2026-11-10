import { GAME_CATALOG, PLATFORMS, searchGames } from '../lib/games';
import { useState } from 'react';
import { blockUser, createChannel, createServer, getMe, getUser, joinServer, regenerateInvite, reportUser, updateChannel, setChannelReadonly, setGames } from '../lib/store';
import { Modal, Avatar, Banner, ErrorLine, Icon, ServerIcon, SpaceBanner, useStore, useUI } from './ui';
import { LOGO_CLASSIC, bannerLogoLayer, bannerStyle, fullName, inviteShown, inviteUrl, isOnline, statusLabel, statusColor } from '../lib/util';
import { fileToDataUrl, readGif, ESPACE_BANNER_OPTS, GIF_MAX_BANNER, ICON_OPTS } from '../lib/images';
import PlusBadge, { AdminCrown, RoleBadge } from './PlusBadge';
import Flag from './Flag';
import { countryName } from '../lib/countries';
import { roleColorOf, roleNameOf } from '../lib/store';
import { run } from '../views/ServerView';
import EspaceSettingsModal from './EspaceSettings';

// Hôte unique : ouvre la modale demandée par openModal(name, props).
export function ModalHost({ modal, onClose }) {
  if (!modal) return null;
  const Comp = MODALS[modal.name];
  return Comp ? <Comp {...modal} onClose={onClose} /> : null;
}

// Formulaire de modale : gère l'état d'erreur et d'envoi.
function useSubmit(fn) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, submit, setError };
}

const Label = ({ children }) => <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{children}</span>;

function CreateServerModal({ onClose }) {
  const s = useStore();
  const { go } = useUI();
  const me = getMe(s);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [code, setCode] = useState('');
  // Sans choix, l'espace reçoit la bannière argent de base.
  const [banner, setBanner] = useState('preset:g6');
  const pickBanner = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setBanner(file.type === 'image/gif' ? await readGif(file, GIF_MAX_BANNER, !!me.is_plus) : await fileToDataUrl(file, ESPACE_BANNER_OPTS));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  const { error, busy, submit, setError } = useSubmit(async () => {
    const res = await createServer({ name, icon, isPublic, customCode: code, banner });
    onClose();
    go({ name: 'server', serverId: res.id });
  });

  return (
    <Modal open title="Créer un espace" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2"><Label>Nom de l’espace ({name.length}/16)</Label>
          <input className="field" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="flex flex-col gap-2"><Label>Icône (facultatif)</Label>
          <div className="flex flex-wrap items-center gap-3">
            <ServerIcon icon={icon} server={{ id: name || 'new', name }} className="h-14 w-14" />
            {LOGO_CLASSIC.map((theme, index) => (
              <button key={theme.label} type="button" title={theme.label} aria-label={`Icône ${theme.label}`} onClick={() => setIcon(`preset:i${index}`)} className={`rounded-full p-0.5 ${icon === `preset:i${index}` ? 'ring-2 ring-brand-500' : ''}`}>
                <ServerIcon icon={`preset:i${index}`} className="h-10 w-10" />
              </button>
            ))}
            <label className="btn-ghost cursor-pointer">
              Importer une image
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { setIcon(await fileToDataUrl(f, ICON_OPTS)); } catch (err) { setError(err.message); } } }} />
            </label>
          </div>
        </div>
        <label className="flex flex-col gap-2"><Label>Visibilité</Label>
          <select className="field" value={isPublic ? 'public' : 'private'} onChange={(e) => setIsPublic(e.target.value === 'public')}>
            <option value="public">Public : visible dans la recherche</option>
            <option value="private">Privé : sur invitation uniquement</option>
          </select>
        </label>
        <label className="flex flex-col gap-2"><Label>Code d’invitation personnalisé</Label>
          <input className="field font-mono uppercase disabled:opacity-50" value={code} maxLength={20} disabled={!me.is_plus}
            placeholder={me.is_plus ? 'Vide = code automatique' : 'Réservé aux membres PLUS'} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2"><Label>Bannière (facultatif)</Label>
          {banner ? <SpaceBanner value={banner} className="h-24 rounded-2xl" /> : <div className="flex h-24 items-center justify-center rounded-2xl bg-slate-200 text-sm text-slate-500">Aucune bannière</div>}
          <div className="flex flex-wrap gap-2">
            {LOGO_CLASSIC.map((theme, index) => (
              <button key={theme.label} type="button" title={theme.label} aria-label={`Bannière de base ${theme.label}`} onClick={() => setBanner(`preset:g${index}`)} className={`relative h-12 w-24 overflow-hidden rounded-xl border-2 ${banner === `preset:g${index}` ? 'border-brand-600 ring-2 ring-brand-300' : 'border-line'}`} style={bannerStyle({ banner: { type: 'gradient', index } })}>
                <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={bannerLogoLayer({ banner: { type: 'gradient', index } })} />
              </button>
            ))}
          </div>
          <span className="btn-ghost cursor-pointer self-start">
    Importer une bannière
    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={pickBanner} />
  </span>
        </label>
        <ErrorLine>{error}</ErrorLine>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>Créer</button>
        </div>
      </form>
    </Modal>
  );
}

function JoinServerModal({ onClose }) {
  const { go } = useUI();
  const [code, setCode] = useState('');
  const { error, busy, submit } = useSubmit(async () => {
    const res = await joinServer(code);
    onClose();
    go({ name: 'server', serverId: res.id });
  });
  return (
    <Modal open title="Rejoindre un espace" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2"><Label>Code d’invitation</Label>
          <input className="field font-mono uppercase" placeholder="Code reçu d’un membre" value={code} autoFocus onChange={(e) => setCode(e.target.value)} />
        </label>
        <ErrorLine>{error}</ErrorLine>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={busy || !code.trim()}>Rejoindre</button>
        </div>
      </form>
    </Modal>
  );
}

function InviteModal({ serverId, onClose }) {
  const s = useStore();
  const { toast } = useUI();
  const me = getMe(s);
  const server = s.servers.find((x) => x.id === serverId);
  if (!server) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl(server.invite_code));
      } catch {
      // copie impossible : le lien reste sélectionnable à l'écran
    }
  };
  return (
    <Modal open title={`Inviter sur ${server.name}`} onClose={onClose}>
      <p className="mb-4 text-sm text-slate-500">Partagez ce lien pour que vos amis rejoignent l’espace.</p>
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 pl-5">
        <code className="min-w-0 flex-1 select-all truncate font-mono text-base tracking-wide text-slate-900">{inviteShown(server.invite_code)}</code>
        <button className="btn-primary !py-2.5" onClick={copy}>Copier</button>
      </div>
      {server.owner_id === me.id && (
        <button className="btn-danger mt-4 w-full" onClick={() => run(toast, () => regenerateInvite(serverId), 'Nouveau code généré')}>
          Générer un nouveau code
        </button>
      )}
    </Modal>
  );
}

// Mini-profil : bannière, avatar, rôle sur l'espace, actions.
function MiniProfileModal({ userId, serverId, onClose }) {
  const s = useStore();
  const { go, openModal, toast } = useUI();
  const me = getMe(s);
  const user = getUser(s, userId);
  if (!user) return null;
  const color = roleColorOf(s, serverId, user.id) || '#d4d4d8';
  const roleName = roleNameOf(s, serverId, user.id);

  return (
    <Modal open title="" onClose={onClose} width="max-w-sm">
      <div className="-mx-6 -mt-6 overflow-hidden rounded-t-[2.5rem]">
        <Banner user={user} />
      </div>
      <div className="-mt-12">
        <Avatar user={user} size="lg" showStatus className="ring-2 ring-surface" />
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <button className="btn-primary w-full" onClick={() => go({ name: 'profile', userId: user.id })}>
          Voir profil complet
        </button>
        <div>
          <p className="flex items-center gap-2 text-lg font-extrabold" style={{ color }}><AdminCrown user={user} />{user.pseudo}<RoleBadge user={user} />{user.country ? <Flag code={user.country} name={countryName(user.country)} /> : null}</p>
          <p className="text-sm text-slate-400">#{user.tag} · <span style={{ color: statusColor(user) }}>{statusLabel(user)}</span>{isOnline(user) && user.device === 'mobile' && <Icon name="phone" title="Connecté sur téléphone ou tablette" className="ml-1.5 inline h-3.5 w-3.5 align-[-2px]" />}</p>
        </div>
        <p className="text-sm text-slate-600">{user.bio || 'Aucune biographie.'}</p>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Rôle sur l’espace</p>
          <p className="mt-2 flex items-center gap-2 font-bold" style={{ color }}>
            <span className="h-3 w-3 rounded-full" style={{ background: color }} />
            {roleName ?? 'Aucun rôle'}
          </p>
        </div>
        {user.id !== me.id && (
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => go({ name: 'messages', withId: user.id })}>
              <Icon name="chat" className="h-4 w-4" /> Message
            </button>
            <button className="btn-danger flex-1" onClick={() => openModal('report', { userId: user.id, serverId })}>
              <Icon name="flag" className="h-4 w-4" /> Signaler
            </button>
            <button className="btn-ghost flex-1" onClick={() => run(toast, () => blockUser(user.id), 'Membre bloqué')}>
              Bloquer
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ReportModal({ userId, serverId = null, onClose }) {
  const s = useStore();
  const { toast } = useUI();
  const target = getUser(s, userId);
  const [reason, setReason] = useState('');
  const { error, busy, submit } = useSubmit(async () => {
    await reportUser(userId, reason, serverId);
    onClose();
  });
  if (!target) return null;
  return (
    <Modal open title={`Signaler ${target.pseudo}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2"><Label>Motif</Label>
          <textarea className="field min-h-28 resize-none" maxLength={300} placeholder="Harcèlement, spam, contenu inapproprié…" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <ErrorLine>{error}</ErrorLine>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-danger" disabled={busy || reason.trim().length < 3}>Envoyer le signalement</button>
        </div>
      </form>
    </Modal>
  );
}

function ChannelModal({ serverId, onClose }) {
  const { toast } = useUI();
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const { error, busy, submit } = useSubmit(async () => {
    await createChannel(serverId, name, type);
    onClose();
  });
  return (
    <Modal open title="Créer un salon" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {[['text', '# Texte'], ['voice', 'Vocal']].map(([v, label]) => (
            <button key={v} type="button" onClick={() => setType(v)} className={`rounded-2xl border-2 px-4 py-3 text-sm font-bold transition ${type === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-100 text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-2"><Label>Nom du salon</Label>
          <input className="field" maxLength={16} value={name} autoFocus placeholder="ex. general-chat" onChange={(e) => setName(e.target.value)} />
          <span className="text-xs text-slate-400">Lettres, chiffres et tirets uniquement, 16 caractères max.</span>
        </label>
        <ErrorLine>{error}</ErrorLine>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>Créer</button>
        </div>
      </form>
    </Modal>
  );
}

function RenameChannelModal({ channelId, current, onClose }) {
  const [name, setName] = useState(current);
  const { error, busy, submit } = useSubmit(async () => {
    await updateChannel(channelId, name);
    onClose();
  });
  return (
    <Modal open title="Renommer le salon" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2"><Label>Nouveau nom</Label>
          <input className="field" maxLength={16} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <span className="text-xs text-slate-400">Lettres, chiffres et tirets, 16 caractères max. Deux salons ne peuvent pas porter le même nom.</span>
        <ErrorLine>{error}</ErrorLine>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}

function InstallModal({ platform: os, onClose }) {
  const steps = os === 'mac'
    ? ['Ouvrez Feathery dans Chrome, Edge ou Safari.', 'Chrome / Edge : menu ⋮ ou icône d’installation dans la barre d’adresse, puis « Installer ».', 'Safari : menu Fichier, puis « Ajouter au Dock ».', 'Un raccourci Feathery apparaît dans le Dock ou le Launchpad.']
    : os === 'windows'
      ? ['Ouvrez Feathery dans Chrome ou Edge.', 'Cliquez sur l’icône d’installation dans la barre d’adresse, ou menu ⋮ puis « Installer Feathery ».', 'Un raccourci apparaît sur le bureau et dans le menu Démarrer.']
      : ['Ouvrez Feathery dans Chrome ou Edge.', 'Utilisez le menu du navigateur puis « Installer Feathery » (ou « Ajouter à l’écran d’accueil » sur mobile).'];
  return (
    <Modal open title="Installer Feathery" onClose={onClose}>
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-slate-700">
        {steps.map((st) => <li key={st}>{st}</li>)}
      </ol>
      <p className="mt-4 text-xs text-slate-400">L’application s’ouvre ensuite dans sa propre fenêtre, sans barre d’adresse.</p>
    </Modal>
  );
}

// Mes jeux : recherche dans le catalogue (Steam, Epic, PlayStation…), ou saisie d'un jeu absent du catalogue.
function GamesModal({ onClose }) {
  const s = useStore();
  const me = getMe(s);
  const [rows, setRows] = useState(() => (me.games ?? []).map((g) => ({ game: g.game, platform: g.platform || '', rank: g.rank || '' })));
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const { error, busy, submit } = useSubmit(async () => {
    await setGames(rows.filter((r) => r.game.trim()).map((r) => ({ game: r.game, platform: r.platform, rank: r.rank })));
    onClose();
  });
  const MAX = 6;
  const full = rows.length >= MAX;
  const add = (game, plat) => {
    if (full || rows.some((r) => r.game === game && r.platform === plat)) return;
    setRows((cur) => [...cur, { game, platform: plat, rank: '' }]);
  };
  const results = searchGames(q, platform).slice(0, 30);
  const exact = q.trim() && GAME_CATALOG.some((g) => g.name.toLowerCase() === q.trim().toLowerCase());
  const update = (i, patch) => setRows((cur) => cur.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <Modal open title="Mes jeux" onClose={onClose} width="max-w-xl">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Mes jeux ({rows.length}/{MAX})</Label>
          {rows.length === 0 && <p className="text-sm text-slate-500">Aucun jeu pour le moment.</p>}
          {rows.map((r, i) => (
            <div key={`${r.game}-${r.platform}-${i}`} className="grid grid-cols-1 gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_auto_auto]">
              <div className="min-w-0">
                <p className="break-words font-bold text-slate-900">{r.game}</p>
                <p className="text-xs text-slate-500">{r.platform || 'Plateforme non précisée'}</p>
              </div>
              <input className="field !py-2 sm:w-40" placeholder="Rang (facultatif)" maxLength={24} value={r.rank} onChange={(e) => update(i, { rank: e.target.value })} />
              <button type="button" className="btn-danger !py-2" onClick={() => setRows((cur) => cur.filter((_, k) => k !== i))}>Retirer</button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
          <Label>Rechercher un jeu</Label>
          <input className="field" placeholder="Nom du jeu…" maxLength={40} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {['', ...PLATFORMS].map((p) => (
              <button
                key={p || 'all'}
                type="button"
                onClick={() => setPlatform(p)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${platform === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                {p || 'Toutes'}
              </button>
            ))}
          </div>
          <div className="thin-scroll flex max-h-64 flex-col gap-1 overflow-y-auto">
            {results.map((g) => (
              <div key={g.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-2 hover:bg-slate-100">
                <span className="min-w-0 break-words text-sm font-bold text-slate-900">{g.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {(platform ? [platform] : g.platforms).filter((p) => g.platforms.includes(p)).map((p) => (
                    <button key={p} type="button" disabled={full} onClick={() => add(g.name, p)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40">
                      + {p}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {q.trim() && !exact && (
              <button type="button" disabled={full} onClick={() => { add(q.trim(), ''); setQ(''); }} className="rounded-xl border border-dashed border-slate-300 bg-surface px-3 py-2 text-left text-sm font-bold text-white hover:bg-slate-200 disabled:opacity-40">
                Ajouter « {q.trim()} » (non listé)
              </button>
            )}
            {!q.trim() && results.length === 0 && <p className="text-sm text-slate-500">Tapez le nom d’un jeu pour le trouver.</p>}
          </div>
        </div>
        <span className="text-xs text-slate-400">{full ? `${MAX} jeux maximum : retirez-en un pour en ajouter.` : `${MAX} jeux maximum.`}</span>
        <ErrorLine>{error}</ErrorLine>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={busy}>Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}

function ChannelSettingsModal({ channelId, onClose }) {
  const s = useStore();
  const { toast } = useUI();
  const ch = s.channels.find((c) => c.id === channelId);
  if (!ch) return null;
  const writable = !ch.readonly;
  return (
    <Modal open title="Paramètres du salon" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <Label>Salon</Label>
          <p className="font-bold text-slate-900">#{ch.name}</p>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
          <span className="flex flex-col gap-1">
            <span className="font-bold text-slate-900">Autoriser à écrire</span>
            <span className="text-xs text-slate-500">Désactivé : seuls le propriétaire et les rôles qui gèrent les salons peuvent écrire. Les autres membres voient les messages.</span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-brand-500"
            checked={writable}
            onChange={(e) => run(toast, () => setChannelReadonly(ch.id, !e.target.checked))}
          />
        </label>
      </div>
    </Modal>
  );
}

const MODALS = {
  games: GamesModal,
  install: InstallModal,
  'rename-channel': RenameChannelModal,
  createServer: CreateServerModal,
  join: JoinServerModal,
  invite: InviteModal,
  mini: MiniProfileModal,
  report: ReportModal,
  channel: ChannelModal,
  'espace-settings': EspaceSettingsModal,
  'channel-settings': ChannelSettingsModal,
};
