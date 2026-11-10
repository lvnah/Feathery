import { useEffect, useRef, useState } from 'react';
import {
  roleOf, canManageChannels, deleteChannel, friendshipBetween, getMe, getUser, isFriend, isMember, joinVoice, kickMember,
  leaveVoice, membersOf, membership, roleColorOf, roleNameOf, roleRank, rolesOf, sendFriendRequest, sendMessage,
  assignRole, deleteMessage,
} from '../lib/store';
import { useStore, useUI, Avatar, CountBadge, EmptyState, ErrorLine, Icon, ServerIcon, Modal, SpaceBanner, TimeAgo } from '../components/ui';
import PlusBadge, { AdminCrown, RoleBadge } from '../components/PlusBadge';
import SpaceHero from '../components/SpaceHero';
import VoiceScreen from '../components/VoiceScreen';
import { AttachButton, AttachPreview, GifButton, GifPicker, MessageImage } from '../components/ChatAttach';
import { chatImageFromFile } from '../lib/images';
import { isVoiceMuted, setVoiceMuted, unlockAudio, useSpeaking, useVoiceStatus, voiceStatusLabel } from '../lib/voice';
import { markChannelRead, unreadCount, leaveServer, setVoiceMutedRemote } from '../lib/store';
import { playMute, playUnmute } from '../lib/sounds';
import { isOnline } from '../lib/util';
import { RichText, MentionSuggest, mentionQuery } from '../components/Mentions';

// Exécute une action async et affiche le résultat dans un toast.
export async function run(toast, fn, okMessage) {
  try {
    await fn();
    // Les succès ne déclenchent plus de notification : seules les erreurs sont affichées.
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
}

// Menu contextuel d'un membre (chat et liste des membres).
export function memberMenuItems({ s, me, serverId, userId, go, openModal, toast }) {
  const target = getUser(s, userId);
  if (!target) return [];
  const srv = s.servers.find((x) => x.id === serverId);
  const items = [{ label: 'Voir le profil', onClick: () => go({ name: 'profile', userId }) }];
  if (userId !== me.id) {
    items.push({ label: 'Envoyer un message', onClick: () => go({ name: 'messages', withId: userId }) });
    if (!isFriend(s, me.id, userId)) {
      const pending = friendshipBetween(s, me.id, userId);
      items.push({
        label: pending ? 'Demande en attente' : 'Ajouter en ami',
        disabled: !!pending,
        onClick: () => run(toast, () => sendFriendRequest(userId), 'Demande d’ami envoyée'),
      });
    }
    items.push({ label: 'Signaler', danger: true, onClick: () => openModal('report', { userId, serverId }) });
  }
  if (srv?.owner_id === me.id) {
    const current = membership(s, serverId, userId)?.role_ids[0] ?? null;
    items.push({ separator: true }, { header: 'Rôles' });
    items.push({ label: 'Aucun rôle', checked: current === null, onClick: () => run(toast, () => assignRole(serverId, userId, null), 'Rôle retiré') });
    rolesOf(s, serverId).forEach((r) =>
      items.push({ label: r.name, checked: current === r.id, onClick: () => run(toast, () => assignRole(serverId, userId, r.id), 'Rôle modifié') }),
    );
    if (userId !== me.id) {
      items.push({ separator: true }, { label: 'Expulser de l’espace', danger: true, onClick: () => run(toast, () => kickMember(serverId, userId), 'Membre expulsé') });
    }
  }
  return items;
}

export default function ServerView({ serverId, channelId, goHome }) {
  const s = useStore();
  const { go, openModal, openMenu, toast } = useUI();
  const me = getMe(s);
  const server = s.servers.find((x) => x.id === serverId);
  const allowed = !!server && isMember(s, serverId, me.id);

  const channels = s.channels.filter((c) => c.server_id === serverId);
  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');
  const current = textChannels.find((c) => c.id === channelId) || textChannels[0];
  const messages = current ? s.messages.filter((m) => m.channel_id === current.id) : [];

  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [gifOpen, setGifOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [, setVoiceTick] = useState(0);
  // Salon ouvert : on le marque comme lu dès qu'il a des messages non lus.
  const unreadHere = current ? (unreadCount(s).channels[current.id] || 0) : 0;
  useEffect(() => {
    if (current && unreadHere > 0) markChannelRead(current.id).catch(() => {});
  }, [current?.id, unreadHere]); // eslint-disable-line react-hooks/exhaustive-deps
  const listRef = useRef(null);
  // Membres qui parlent en ce moment : un anneau blanc entoure leur photo.
  const speaking = useSpeaking();
  const vstatus = useVoiceStatus();
  // Le fil reste collé au bas tant qu'on y est : une photo qui finit de charger ne fait pas sauter la vue,
  // et on ne force pas le défilement quand on relit les anciens messages.
  const stuck = useRef(true);
  const stick = () => {
    const el = listRef.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  };
  const onListScroll = () => {
    const el = listRef.current;
    if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => { stuck.current = true; stick(); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { stick(); }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pseudos = new Map(s.users.map((u) => [u.pseudo.toLowerCase(), u]));
  const mention = mentionQuery(text);
  const mentionCandidates = mention === null
    ? []
    : membersOf(s, serverId).filter((u) => u.id !== me.id && u.pseudo.toLowerCase().startsWith(mention.toLowerCase())).slice(0, 6);

  // Rejoindre un vocal ouvre directement la vue « En vocal » (téléphone).
  // Calculé avant tout retour anticipé : l'ordre des hooks doit rester identique à chaque rendu.
  const voiceId = channels.find((c) => c.id === s.voice.find((v) => v.user_id === me.id)?.channel_id)?.id ?? null;
  const prevVoiceId = useRef(null);
  useEffect(() => {
    if (voiceId && voiceId !== prevVoiceId.current) setVoiceOpen(true);
    prevVoiceId.current = voiceId;
  }, [voiceId]);

  if (!allowed) {
    return (
      <div className="panel flex flex-1">
        <EmptyState icon="bolt" title="Espace introuvable">
          Cet espace n’existe pas ou vous n’en êtes pas membre. Utilisez un code d’invitation pour le rejoindre.
        </EmptyState>
      </div>
    );
  }

  const isOwner = server.owner_id === me.id;
  const canManage = canManageChannels(s, serverId, me.id);
  const myVoice = s.voice.find((v) => v.user_id === me.id);
  const myVoiceChannel = channels.find((c) => c.id === myVoice?.channel_id);
  const members = membersOf(s, serverId).sort(
    (a, b) => roleRank(s, serverId, a.id) - roleRank(s, serverId, b.id) || a.pseudo.localeCompare(b.pseudo),
  );
  const onlineMembers = members.filter(isOnline);
  // Salon vocal où se trouve chaque membre (affiché sous son tag).
  const voiceChannelOf = (userId) => {
    const v = s.voice.find((x) => x.user_id === userId && channels.some((c) => c.id === x.channel_id));
    return v ? channels.find((c) => c.id === v.channel_id) : null;
  };
  const offlineMembers = members.filter((u) => !isOnline(u));
  // Micro de chaque membre : visible par tout le monde dans le salon vocal.
  const voiceMuted = (userId) => !!s.voice.find((v) => v.user_id === userId)?.muted;
  const toggleMute = () => {
    const next = !isVoiceMuted();
    setVoiceMuted(next);
    setVoiceTick((t) => t + 1);
    if (next) playMute(); else playUnmute();
    setVoiceMutedRemote(next).catch(() => {});
  };
  const voiceUsers = (c) => s.voice.filter((v) => v.channel_id === c.id).map((v) => getUser(s, v.user_id)).filter(Boolean);

  const pickImage = async (file) => {
    try {
      setImage(await chatImageFromFile(file));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!current || (!text.trim() && !image)) return;
    stuck.current = true; // mon propre message : on le voit en entier
    // Le message part tout de suite : le champ est vidé avant la réponse du serveur.
    const content = text;
    const picture = image;
    setText('');
    setImage('');
    setError('');
    try {
      await sendMessage(current.id, content, picture);
    } catch (err) {
      setText(content);
      setImage(picture);
      setError(err.message);
    }
  };

  const channelMenu = (e, channel) => {
    if (!canManage) {
      e.preventDefault();
      return;
    }
    openMenu(e, [
      ...(channel.type === 'text' ? [{ label: 'Paramètres du salon', onClick: () => openModal('channel-settings', { channelId: channel.id }) }] : []),
      { label: 'Renommer le salon', onClick: () => openModal('rename-channel', { channelId: channel.id, current: channel.name }) },
      // Le dernier salon d'un espace ne peut pas être supprimé.
      ...(channels.length > 1 ? [{ separator: true }, { label: 'Supprimer le salon', danger: true, onClick: () => run(toast, () => deleteChannel(channel.id)) }] : []),
    ]);
  };

  const memberMenu = (e, userId) =>
    openMenu(e, memberMenuItems({ s, me, serverId, userId, go, openModal, toast }));

  // Une ligne de membre (liste de droite).
  const memberRow = (u) => {
    const color = roleColorOf(s, serverId, u.id) || '#d4d4d8';
    const online = isOnline(u);
    return (
      <button
        key={u.id}
        onClick={() => openModal('mini', { userId: u.id, serverId })}
        onContextMenu={(e) => memberMenu(e, u.id)}
        className={`flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-surface p-2.5 text-left transition hover:shadow-soft ${online ? '' : 'opacity-50'}`}
      >
        <Avatar user={u} size="sm" showStatus />
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5"><AdminCrown user={u} /><span className="truncate text-sm font-bold" style={{ color }}>{u.pseudo}</span><RoleBadge user={u} /></span>
          <span className="block truncate text-xs font-semibold text-slate-500">#{u.tag}</span>
          {voiceChannelOf(u.id) && (
            <span className="flex items-center gap-1 truncate text-xs font-bold text-brand-600">
              <Icon name={voiceMuted(u.id) ? 'micOff' : 'mic'} className="h-3 w-3 shrink-0" />
              Vocal · {voiceChannelOf(u.id).name}
            </span>
          )}
        </span>
      </button>
    );
  };

  // Groupes en ligne par rôle (ex. « OWNER — 1 »), puis hors ligne.
  // Un groupe par rôle (dans l'ordre des rôles), les membres sans rôle en dernier.
  const onlineGroups = [];
  onlineMembers.forEach((u) => {
    const role = roleOf(s, serverId, u.id);
    const key = role?.id ?? 'none';
    let group = onlineGroups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: role ? role.name.toUpperCase() : null, color: role?.color ?? '#64748b', users: [] };
      onlineGroups.push(group);
    }
    group.users.push(u);
  });
  onlineGroups.sort((a, b) => (a.key === 'none') - (b.key === 'none'));

  const membersPanel = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-600">En ligne — {onlineMembers.length}</p>
        {onlineGroups.map((g) => (
          <div key={g.label} className="flex flex-col gap-2">
            {g.label && (
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: g.color }}>
                {g.label} — {g.users.length}
              </p>
            )}
            {g.users.map((u) => memberRow(u))}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Hors ligne — {offlineMembers.length}</p>
        {offlineMembers.map((u) => memberRow(u))}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      {/* Barre d'en-tête de l'espace */}
      <SpaceHero
        server={server}
        className="h-28 shrink-0 max-lg:h-20"
        onContextMenu={(e) => {
          if (isOwner) { e.preventDefault(); return; }
          openMenu(e, [{ label: 'Quitter l’espace', danger: true, onClick: () => { if (window.confirm(`Quitter « ${server.name} » ?`)) run(toast, () => leaveServer(serverId)).then((ok) => ok && goHome()); } }]);
        }}
        actions={(
          <>
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Menu de l’espace" className="hidden rounded-2xl bg-white/90 px-4 py-2 text-sm font-bold text-slate-900 max-lg:block">
              Menu
            </button>
            {!isOwner && (
              <button onClick={() => { if (window.confirm(`Quitter « ${server.name} » ?`)) run(toast, () => leaveServer(serverId)).then((ok) => ok && goHome()); }} className="btn-danger !rounded-full !py-2.5 max-lg:hidden">
                Quitter
              </button>
            )}
            {isOwner && (
              <button onClick={() => openModal('espace-settings', { serverId })} className="btn-ghost !rounded-full !py-2.5 max-lg:hidden">
                <Icon name="settings" className="h-4 w-4" />
                Paramètres
              </button>
            )}
            <button onClick={() => openModal('invite', { serverId })} className="btn-soft !rounded-full !py-2.5 max-lg:hidden">
              Inviter
            </button>
          </>
        )}
      >
        <span className="pill !bg-white/15 !text-white max-lg:hidden">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Hub Communautaire Actif
        </span>
      </SpaceHero>

      {/* Salons : tuiles toujours visibles. Un vocal montre qui est dedans (photos) et sa capacité. */}
      <nav className="panel thin-scroll flex items-stretch gap-3 overflow-x-auto p-3 max-lg:gap-2 max-lg:p-1.5">
        {textChannels.map((c) => {
          const active = current?.id === c.id;
          const n = unreadCount(s).channels[c.id] || 0;
          return (
            <button
              key={c.id}
              onClick={() => go({ name: 'server', serverId, channelId: c.id })}
              onContextMenu={(e) => channelMenu(e, c)}
              className={`flex min-w-[9rem] shrink-0 flex-col justify-between gap-3 rounded-3xl px-4 py-3 text-left transition max-lg:min-w-[6.5rem] max-lg:flex-row max-lg:items-center max-lg:gap-2 max-lg:rounded-2xl max-lg:px-3 max-lg:py-2 ${
                active ? 'border-2 border-brand-500 bg-brand-600 text-white shadow-soft' : 'border-2 border-slate-300 bg-surface text-slate-900 shadow-soft'
              }`}
            >
              <span className="flex items-center justify-between">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${active ? 'bg-surface/10 text-brand-400' : 'bg-brand-50 text-brand-600'}`}>
                  <Icon name="hash" className="h-4 w-4" />
                </span>
                <CountBadge n={active ? 0 : n} />
              </span>
              <span className="truncate text-sm font-bold">{c.name}</span>
              <span className={`text-[11px] font-semibold max-lg:hidden ${active ? 'text-white/60' : 'text-slate-400'}`}>Texte</span>
            </button>
          );
        })}
        {voiceChannels.map((c) => {
          const users = voiceUsers(c);
          const inside = myVoice?.channel_id === c.id;
          return (
            <button
              key={c.id}
              onClick={() => { unlockAudio(); run(toast, () => joinVoice(c.id), `Connecté à ${c.name}`); }}
              onContextMenu={(e) => channelMenu(e, c)}
              className={`flex min-w-[12rem] shrink-0 flex-col justify-between gap-3 rounded-3xl px-4 py-3 text-left transition max-lg:min-w-[8rem] max-lg:gap-1 max-lg:rounded-2xl max-lg:px-3 max-lg:py-2 ${
                inside ? 'bg-brand-500 text-white shadow-[0_12px_30px_-12px_rgba(120,120,128,0.8)]' : 'border-2 border-slate-300 bg-surface text-slate-900 shadow-soft'
              }`}
            >
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${inside ? 'bg-surface/15' : 'bg-brand-50 text-brand-600'}`}>
                    <Icon name="speaker" className="h-4 w-4" />
                  </span>
                  {c.name}
                  {inside && <Icon name={isVoiceMuted() ? 'micOff' : 'mic'} className="h-4 w-4 opacity-90" />}
                </span>
                <span className={`text-[11px] font-bold ${inside ? 'text-white/80' : 'text-slate-400'}`}>{users.length}/5</span>
              </span>
              <span className="flex min-h-7 items-center">
                {users.length === 0 ? (
                  <span className={`text-xs ${inside ? 'text-white/70' : 'text-slate-400'}`}>Vide</span>
                ) : (
                  <span className="flex -space-x-2">
                    {users.slice(0, 5).map((u) => (
                      <span key={u.id} className="relative">
                        <Avatar user={u} size="xs" className={`ring-2 transition ${speaking.has(u.id) ? 'ring-white shadow-[0_0_10px_rgba(255,255,255,0.85)]' : 'ring-surface'}`} />
                        <MicBadge muted={voiceMuted(u.id)} />
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {canManage && (
          <button onClick={() => openModal('channel', { serverId })} className="flex min-w-[8rem] shrink-0 flex-col items-center justify-center gap-1 rounded-3xl border-2 border-dashed border-brand-200 text-sm font-bold text-brand-700 hover:bg-brand-50">
            <Icon name="plus" className="h-5 w-5" />
            Nouveau salon
          </button>
        )}
      </nav>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Chat */}
        <section className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
            <span className="pill !bg-brand-100 !px-3 !py-1 !text-sm !font-bold !text-brand-700">Salon #{current?.name ?? '—'}</span>
            {/* Membres : sur téléphone et tablette, la liste s'ouvre dans une fenêtre */}
            <button type="button" onClick={() => setMembersOpen(true)} className="ml-auto rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 hidden">
              Membres
            </button>
            <Modal open={membersOpen} title="Membres" onClose={() => setMembersOpen(false)}>
              {membersPanel}
            </Modal>
          </div>

          {myVoiceChannel && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-brand-100 bg-brand-50 px-4 py-3 sm:px-5 max-lg:hidden">
              <span className="flex items-center gap-2 text-sm font-bold text-brand-800">
                <span className={`h-2.5 w-2.5 rounded-full ${vstatus === 'connected' || vstatus === 'alone' ? 'bg-emerald-500' : 'animate-pulse bg-amber-400'}`} />
                {voiceStatusLabel(vstatus)} · {myVoiceChannel.name}
                <span className="font-semibold text-brand-600">{voiceUsers(myVoiceChannel).length}/5</span>
              </span>
              <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
                <button onClick={toggleMute} className={`btn-ghost !py-2 ${isVoiceMuted() ? 'text-red-600' : 'text-brand-700'}`} aria-label={isVoiceMuted() ? 'Activer le micro' : 'Couper le micro'}>
                  <Icon name={isVoiceMuted() ? 'micOff' : 'mic'} className="h-4 w-4" />
                  {isVoiceMuted() ? 'Micro coupé' : 'Micro ouvert'}
                </button>
                {!voiceOpen && (
                  <button onClick={() => setVoiceOpen(true)} className="btn-soft !py-2 max-sm:flex-1">Retourner au vocal</button>
                )}
                <button onClick={() => run(toast, () => leaveVoice())} className="btn-danger !py-2 max-sm:flex-1">Quitter</button>
              </div>
            </div>
          )}
          {myVoiceChannel && (
            <button
              type="button"
              onClick={() => setVoiceOpen(true)}
              className="flex items-center gap-3 border-b border-brand-100 bg-brand-50 px-4 py-2.5 text-left text-sm font-bold text-brand-800 lg:hidden"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${vstatus === 'connected' || vstatus === 'alone' ? 'bg-emerald-500' : 'animate-pulse bg-amber-400'}`} />
              <span className="min-w-0 truncate">{voiceStatusLabel(vstatus)} · {myVoiceChannel.name} · {voiceUsers(myVoiceChannel).length}/5</span>
              <span className="ml-auto shrink-0 text-brand-600">Retourner au vocal</span>
            </button>
          )}
          <Modal open={menuOpen} title={server.name} onClose={() => setMenuOpen(false)}>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => { setMenuOpen(false); openModal('invite', { serverId }); }} className="btn-primary min-h-[48px] justify-start">Inviter des membres</button>
              <button type="button" onClick={() => { setMenuOpen(false); setMembersOpen(true); }} className="btn-ghost min-h-[48px] justify-start">Voir les membres</button>
              {isOwner && <button type="button" onClick={() => { setMenuOpen(false); openModal('espace-settings', { serverId }); }} className="btn-ghost min-h-[48px] justify-start">Paramètres de l’espace</button>}
              {!isOwner && <button type="button" onClick={() => { setMenuOpen(false); if (window.confirm(`Quitter « ${server.name} » ?`)) run(toast, () => leaveServer(serverId)).then((ok) => ok && goHome()); }} className="btn-danger min-h-[48px] justify-start">Quitter l’espace</button>}
            </div>
          </Modal>
          {voiceOpen && myVoiceChannel && (
            <VoiceScreen
              status={vstatus}
              channelName={myVoiceChannel.name}
              users={voiceUsers(myVoiceChannel)}
              selfId={me.id}
              isMuted={isVoiceMuted()}
              voiceMuted={voiceMuted}
              onToggleMute={toggleMute}
              onLeave={() => { setVoiceOpen(false); run(toast, () => leaveVoice()); }}
              onClose={() => setVoiceOpen(false)}
            />
          )}
          {current ? (
            <>
              <div ref={listRef} onScroll={onListScroll} className="thin-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
                {messages.length === 0 && <p className="m-auto text-sm text-slate-500">Aucun message dans #{current.name}. Lancez la discussion !</p>}
                {messages.map((m) => {
                  const author = getUser(s, m.user_id);
                  if (!author) return null;
                  const color = roleColorOf(s, serverId, author.id) || '#d4d4d8';
                  return (
                    // Chaque message est une cellule distincte : bordure marquée, fond propre, espace entre les cellules.
                    <div key={m.id} className="group flex items-start gap-3 rounded-2xl border-2 border-slate-300 bg-slate-100 px-4 py-3 shadow-soft">
                      <button onClick={() => openModal('mini', { userId: author.id, serverId })} onContextMenu={(e) => memberMenu(e, author.id)} aria-label={`Profil de ${author.pseudo}`}>
                        <Avatar user={author} size="md" showStatus />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <AdminCrown user={author} /><button onClick={() => openModal('mini', { userId: author.id, serverId })} onContextMenu={(e) => memberMenu(e, author.id)} className="font-bold hover:underline" style={{ color }}>
                            {author.pseudo}
                          </button>
                          <RoleBadge user={author} />
                        </div>
                        {m.content && <p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold text-slate-900"><RichText text={m.content} users={pseudos} meName={me.pseudo} links={me.settings?.linksOn !== false} onOpen={(id) => openModal('mini', { userId: id, serverId })} /></p>}
                        <MessageImage src={m.image} gif={m.gif} onLoad={stick} />
                      </div>
                      <TimeAgo ts={m.created_at} className="hidden shrink-0 whitespace-nowrap text-xs text-slate-400 sm:block" />
                      {(isOwner || author.id === me.id) && (
                        <button
                          title="Supprimer le message"
                          aria-label="Supprimer le message"
                          onClick={() => run(toast, () => deleteMessage(m.id), 'Message supprimé')}
                          className="shrink-0 rounded-xl p-2 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <form onSubmit={submit} className="border-t border-slate-100 p-4">
                <AttachPreview src={image} onRemove={() => setImage('')} />
                <div className="flex items-center gap-3">
                  <AttachButton onPick={pickImage} disabled={current.readonly && !canManage} />
                  <GifButton onClick={() => setGifOpen(true)} disabled={current.readonly && !canManage} />
                  <div className="relative min-w-0 flex-1">
                    {mentionCandidates.length > 0 && (
                      <MentionSuggest candidates={mentionCandidates} onPick={(pseudo) => setText(text.replace(/@[\p{L}\p{N}_.-]{0,24}$/u, `@${pseudo} `))} />
                    )}
                    <input
                      className="field !rounded-2xl !bg-slate-100 !py-3.5"
                      disabled={current.readonly && !canManage}
                      placeholder={current.readonly && !canManage ? 'Salon en lecture seule' : `Partager quelque chose dans #${current.name}...`}
                      value={text}
                      maxLength={2000}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </div>
                  <button type="submit" disabled={(!text.trim() && !image) || (current.readonly && !canManage)} aria-label="Envoyer" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(120,120,128,0.8)] transition hover:bg-brand-600 disabled:opacity-40">
                    <Icon name="send" className="h-5 w-5" />
                  </button>
                </div>
                <ErrorLine>{error}</ErrorLine>
              </form>
              {gifOpen && <GifPicker onPick={setImage} onClose={() => setGifOpen(false)} />}
            </>
          ) : (
            <EmptyState icon="hash" title="Aucun salon texte">Demandez à un membre disposant de la permission « gérer les salons » d’en créer un.</EmptyState>
          )}
        </section>

        {/* Membres (desktop) */}
        <aside className="panel thin-scroll hidden w-72 shrink-0 overflow-y-auto p-5 lg:block">{membersPanel}</aside>
      </div>
    </div>
  );
}

// Petit badge micro (ouvert / coupé) posé sur l'avatar d'un membre du vocal.
function MicBadge({ muted }) {
  return (
    <span className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface shadow-soft ${muted ? 'text-red-500' : 'text-brand-600'}`} title={muted ? 'Micro coupé' : 'Micro ouvert'}>
      <Icon name={muted ? 'micOff' : 'mic'} className="h-2.5 w-2.5" />
    </span>
  );
}
