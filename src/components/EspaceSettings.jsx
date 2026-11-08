import { Fragment, useState } from 'react';
import { deleteRole, deleteServer, getMe, kickMember, membersOf, membership, rolesOf, assignRole, updateInvite, updateRole, updateServerIcon, createRole } from '../lib/store';
import { Avatar, ColorDiamonds, ErrorLine, Modal, ServerIcon, useStore, useUI } from './ui';
import { fileToDataUrl, readGif, ESPACE_BANNER_OPTS, GIF_MAX_BANNER, ICON_OPTS } from '../lib/images';
import { LOGO_CLASSIC, bannerLogoLayer, bannerStyle } from '../lib/util';
import { updateServerName, reorderRoles, setServerBanner, setServerVisibility } from '../lib/store';
import { fullName } from '../lib/util';
import { ROLE_COLORS } from '../lib/util';
import { run } from '../views/ServerView';

const TABS = [
  ['roles', 'Rôles'],
  ['members', 'Gestion membres'],
  ['invite', 'Invitation'],
  ['manage', 'Gestion de l’espace'],
];

// Paramètres de l'espace (propriétaire uniquement), reprend settings de server.php.
export default function EspaceSettingsModal({ serverId, onClose }) {
  const s = useStore();
  const { toast } = useUI();
  const me = getMe(s);
  const server = s.servers.find((x) => x.id === serverId);
  const [tab, setTab] = useState('roles');
  if (!server) return null;
  const isOwner = server.owner_id === me.id;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-8 py-5">
        <div>
          <h2 className="text-xl font-extrabold">Paramètres de l’espace</h2>
          <p className="text-sm text-slate-500">{server.name}</p>
        </div>
        <button onClick={onClose} className="btn-ghost !rounded-full !px-5 !py-2.5">Fermer</button>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        {!isOwner ? (
          <p className="text-sm text-slate-500">Seul le propriétaire de l’espace peut modifier ces paramètres.</p>
        ) : (
          <>
            <nav className="thin-scroll flex gap-2 overflow-x-auto rounded-full bg-slate-100 p-1">
              {TABS.map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${tab === key ? 'bg-ink text-brand-400' : 'text-slate-600 hover:bg-surface'}`}>
                  {label}
                </button>
              ))}
            </nav>
            {tab === 'roles' && <RolesTab serverId={serverId} toast={toast} />}
            {tab === 'members' && <MembersTab serverId={serverId} toast={toast} />}
            {tab === 'invite' && <InviteTab serverId={serverId} toast={toast} />}
            {tab === 'manage' && <ManageTab serverId={serverId} toast={toast} onDeleted={onClose} />}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

function RolesTab({ serverId, toast }) {
  const s = useStore();
  const roles = rolesOf(s, serverId);
  const [name, setName] = useState('');
  const [color, setColor] = useState(ROLE_COLORS[0]);
  const [manage, setManage] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({}); // modifications en attente, par rôle
  const [saving, setSaving] = useState(false);

  const draftOf = (r) => drafts[r.id] ?? { name: r.name, color: r.color, manage: !!r.can_manage_channels };
  const isDirty = (r) => {
    const d = drafts[r.id];
    return !!d && (d.name !== r.name || d.color !== r.color || d.manage !== !!r.can_manage_channels);
  };
  const dirty = roles.filter(isDirty);
  const setDraft = (r, patch) => setDrafts((cur) => ({ ...cur, [r.id]: { ...draftOf(r), ...patch } }));

  // Glisser-déposer pour réordonner : armedId = rôle dont la poignée est saisie, dragId = rôle en cours de déplacement,
  // dropIndex = position d'insertion (0 = tout en haut, roles.length = tout en bas).
  const [armedId, setArmedId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const resetDrag = () => {
    setArmedId(null);
    setDragId(null);
    setDropIndex(null);
  };
  const onRowDragOver = (e, i) => {
    if (!dragId) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
    if (idx !== dropIndex) setDropIndex(idx);
  };
  const onDrop = (e) => {
    e.preventDefault();
    const from = roles.findIndex((r) => r.id === dragId);
    const to = dropIndex;
    resetDrag();
    if (from < 0 || to === null || to === from || to === from + 1) return;
    const ids = roles.map((r) => r.id);
    ids.splice(from, 1);
    ids.splice(to > from ? to - 1 : to, 0, dragId);
    run(toast, () => reorderRoles(serverId, ids));
  };
  const placeholder = <div className="h-14 rounded-2xl border-2 border-dashed border-brand-400 bg-brand-50/60" />;

  // Enregistre tous les rôles modifiés d'un coup.
  const saveAll = async () => {
    setSaving(true);
    try {
      for (const r of dirty) {
        const d = drafts[r.id];
        await updateRole(serverId, r.id, { name: d.name, color: d.color, can_manage_channels: d.manage });
      }
      setDrafts({});
    } catch (err) {
      toast(err.message);
    } finally {
      setSaving(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createRole(serverId, { name, color, can_manage_channels: manage });
      setName('');
      setManage(false);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={create} className="flex flex-col gap-4 rounded-3xl bg-slate-50 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Nouveau rôle</p>
        <input className="field" placeholder="ex. Modérateur" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
        <ColorDiamonds value={color} onChange={setColor} />
        <label className="flex items-center gap-3 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={manage} onChange={(e) => setManage(e.target.checked)} />
          Autoriser à gérer les salons
        </label>
        <ErrorLine>{error}</ErrorLine>
        <button type="submit" className="btn-primary self-end" disabled={!name.trim()}>Ajouter le rôle</button>
      </form>

      <div className="flex flex-col gap-3" onDragOver={(e) => dragId && e.preventDefault()} onDrop={onDrop} onDragEnd={resetDrag}>
        {roles.length === 0 && <p className="text-sm text-slate-500">Aucun rôle pour le moment.</p>}
        {roles.map((r, i) => {
          const d = draftOf(r);
          return (
            <Fragment key={r.id}>
              {dragId && dropIndex === i && placeholder}
              <div
                draggable={armedId === r.id}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', r.id);
                  setDragId(r.id);
                }}
                onDragOver={(e) => onRowDragOver(e, i)}
                className={`flex flex-col gap-3 rounded-2xl border border-slate-100 p-4 transition ${dragId === r.id ? 'opacity-40' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    role="img"
                    aria-label="Glisser pour déplacer le rôle"
                    title="Glisser pour déplacer"
                    onMouseDown={() => setArmedId(r.id)}
                    onMouseUp={() => setArmedId(null)}
                    className="cursor-grab select-none rounded-lg px-1 py-2 text-lg leading-none text-slate-400 hover:bg-slate-300 hover:text-slate-900 active:cursor-grabbing"
                  >
                    ⠿
                  </span>
                  <input className="field !py-2" maxLength={20} value={d.name} onChange={(e) => setDraft(r, { name: e.target.value })} />
                  <button className="btn-danger !py-2" onClick={() => window.confirm(`Supprimer le rôle « ${r.name} » ?`) && run(toast, () => deleteRole(serverId, r.id))}>
                    Suppr.
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ColorDiamonds value={d.color} onChange={(c) => setDraft(r, { color: c })} />
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-brand-500" checked={d.manage} onChange={(e) => setDraft(r, { manage: e.target.checked })} />
                    Gérer salons
                  </label>
                </div>
              </div>
            </Fragment>
          );
        })}
        {dragId && dropIndex === roles.length && placeholder}
      </div>

      {roles.length > 0 && (
        <button className="btn-primary w-full !py-3.5" disabled={dirty.length === 0 || saving} onClick={saveAll}>
          {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
        </button>
      )}
    </div>
  );
}

function MembersTab({ serverId, toast }) {
  const s = useStore();
  const server = s.servers.find((x) => x.id === serverId);
  const roles = rolesOf(s, serverId);
  const members = membersOf(s, serverId);
  if (members.length === 0) return <p className="text-sm text-slate-500">Aucun membre dans cet espace.</p>;
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-slate-50 p-4">
      {members.map((u) => {
        const current = membership(s, serverId, u.id)?.role_ids[0] ?? '';
        return (
          <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3">
            <Avatar user={u} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{fullName(u)}</span>
            <select
              className="field !w-auto !py-2"
              value={current}
              onChange={(e) => run(toast, () => assignRole(serverId, u.id, e.target.value || null), 'Rôle mis à jour')}
            >
              <option value="">Aucun rôle</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {u.id !== server.owner_id && (
              <button className="btn-danger !py-2" onClick={() => window.confirm(`Exclure ${u.pseudo} de l’espace ?`) && run(toast, () => kickMember(serverId, u.id), 'Membre exclu')}>
                Exclure
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InviteTab({ serverId, toast }) {
  const s = useStore();
  const me = getMe(s);
  const server = s.servers.find((x) => x.id === serverId);
  const [code, setCode] = useState(server.invite_code);
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await updateInvite(serverId, code);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <code className="select-all font-mono text-lg font-bold tracking-widest text-brand-700">{server.invite_code}</code>
        <button className="btn-primary !py-2.5" onClick={() => navigator.clipboard?.writeText(server.invite_code)}>Copier</button>
      </div>
      {me.is_plus ? (
        <form onSubmit={save} className="flex flex-col gap-3 border-t border-slate-100 pt-6">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Code personnalisé (réservé PLUS)</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input className="field font-mono uppercase" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="submit" className="btn-primary">Mettre à jour</button>
          </div>
          <ErrorLine>{error}</ErrorLine>
        </form>
      ) : (
        <p className="text-sm text-slate-500">Le code personnalisé est réservé aux membres PLUS.</p>
      )}
    </div>
  );
}

function ManageTab({ serverId, toast, onDeleted }) {
  const s = useStore();
  const { go } = useUI();
  const server = s.servers.find((x) => x.id === serverId);
  const [name, setName] = useState(server.name);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const confirmDeletion = async () => {
    const ok = await run(toast, () => deleteServer(serverId));
    if (ok) {
      setConfirmOpen(false);
      onDeleted();
      go({ name: 'home' });
    }
  };
  const [icon, setIcon] = useState(server.icon || '');
  const [error, setError] = useState('');
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setIcon(await fileToDataUrl(file, ICON_OPTS));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await run(toast, () => updateServerName(serverId, name), 'Nom de l’espace mis à jour');
        }}
        className="flex flex-col gap-3 rounded-3xl bg-slate-50 p-5"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Nom de l’espace</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input className="field" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn-primary" disabled={!name.trim() || name === server.name}>Enregistrer</button>
        </div>
      </form>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await run(toast, () => updateServerIcon(serverId, icon), 'Icône mise à jour');
        }}
        className="flex flex-col gap-4 rounded-3xl bg-slate-50 p-5"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Icône de l’espace</p>
        <div className="flex items-center gap-4">
          <ServerIcon icon={icon} server={server} className="h-20 w-20" />
          <label className="btn-ghost cursor-pointer">
            Importer une image
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={pick} />
          </label>
          <button type="submit" className="btn-primary" disabled={!icon}>Enregistrer</button>
        </div>
        <ErrorLine>{error}</ErrorLine>
      </form>
      <VisibilityForm serverId={serverId} server={server} toast={toast} />
      <BannerForm serverId={serverId} server={server} toast={toast} />

      <div className="flex flex-col gap-3 rounded-3xl border border-red-100 bg-red-50/60 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-red-600">Suppression définitive</p>
        <p className="text-sm text-slate-600">Salons, messages et rôles de cet espace disparaîtront définitivement.</p>
        <button
          className="btn-danger self-start"
          onClick={() => {
            setTyped('');
            setConfirmOpen(true);
          }}
        >
          Supprimer cet espace
        </button>
        <Modal open={confirmOpen} title="Supprimer l’espace" onClose={() => setConfirmOpen(false)} width="max-w-md">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              Cette action est définitive : salons, messages et rôles seront supprimés. Pour confirmer, écrivez le nom de l’espace :
              <span className="ml-1 font-bold text-slate-900">{server.name}</span>
            </p>
            <input className="field" value={typed} placeholder={server.name} onChange={(e) => setTyped(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirmOpen(false)}>Annuler</button>
              <button className="btn-danger" disabled={typed !== server.name} onClick={confirmDeletion}>Supprimer définitivement</button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}

// Bannière de l'espace : image fixe pour tous ; GIF animé seulement si le propriétaire est PLUS.
function BannerForm({ serverId, server, toast }) {
  const s = useStore();
  const me = getMe(s);
  const [error, setError] = useState('');
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = file.type === 'image/gif'
        ? await readGif(file, GIF_MAX_BANNER, !!me.is_plus)
        : await fileToDataUrl(file, ESPACE_BANNER_OPTS);
      setError('');
      await run(toast, () => setServerBanner(serverId, data), 'Bannière de l’espace mise à jour');
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-slate-50 p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Bannière de l’espace</p>
      <div
        className="relative h-28 overflow-hidden rounded-2xl bg-slate-200 bg-cover bg-center"
        style={server.banner ? { backgroundImage: `url("${server.banner}")` } : undefined}
      >
        {!server.banner && <span className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">Aucune bannière</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-ghost cursor-pointer">
          {server.banner ? 'Changer la bannière' : 'Importer une bannière'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={pick} />
        </label>
        {server.banner && (
          <button type="button" className="btn-ghost" onClick={() => run(toast, () => setServerBanner(serverId, ''), 'Bannière retirée')}>
            Retirer
          </button>
        )}
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Bannières de base</p>
      <div className="flex flex-wrap gap-2">
        {LOGO_CLASSIC.map((theme, index) => (
          <button key={theme.label} type="button" title={theme.label} aria-label={`Bannière de base ${theme.label}`} onClick={() => run(toast, () => setServerBanner(serverId, `preset:g${index}`), 'Bannière mise à jour')} className="relative h-12 w-24 overflow-hidden rounded-xl border-2 border-line" style={bannerStyle({ banner: { type: 'gradient', index } })}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={bannerLogoLayer({ banner: { type: 'gradient', index } })} />
          </button>
        ))}
      </div>
      <span className="text-xs text-slate-500">
        {me.is_plus ? 'Vous êtes PLUS : vous pouvez utiliser un GIF animé.' : 'Image fixe uniquement. Les bannières animées (GIF) sont réservées aux membres PLUS.'}
      </span>
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}

// Visibilité de l'espace : publique (visible dans la Communauté) ou privée (sur invitation seulement).
function VisibilityForm({ serverId, server, toast }) {
  const choose = (isPublic) => {
    if (!!server.is_public === isPublic) return;
    run(toast, () => setServerVisibility(serverId, isPublic), isPublic ? 'Espace public' : 'Espace privé');
  };
  const option = (value, label, hint) => (
    <button
      type="button"
      role="radio"
      aria-checked={!!server.is_public === value}
      onClick={() => choose(value)}
      className={`flex min-h-[44px] flex-1 items-start gap-3 rounded-2xl border p-4 text-left transition ${!!server.is_public === value ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-surface hover:border-brand-200'}`}
    >
      <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${!!server.is_public === value ? 'border-brand-600' : 'border-slate-300'}`}>
        {!!server.is_public === value && <span className="h-2 w-2 rounded-full bg-brand-600" />}
      </span>
      <span className="flex flex-col">
        <span className="font-bold text-slate-900">{label}</span>
        <span className="text-xs text-slate-500">{hint}</span>
      </span>
    </button>
  );
  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-slate-50 p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Visibilité</p>
      <div role="radiogroup" className="flex flex-col gap-3 md:flex-row">
        {option(true, 'Publique', 'Visible dans la Communauté, chacun peut la rejoindre.')}
        {option(false, 'Privée', 'Seuls les membres invités peuvent la rejoindre.')}
      </div>
    </div>
  );
}
