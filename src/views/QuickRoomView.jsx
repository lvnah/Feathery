import { useState } from 'react';
import { getMe, getUser, kickQuickMember, joinQuickVoice, leaveQuickVoice, leaveQuickRoom, quickRoomOf, sendQuickMessage, setQuickRoomLock, setVoiceMutedRemote } from '../lib/store';
import { Avatar, ErrorLine, Icon, TimeAgo, useStore, useUI } from '../components/ui';
import { RichText } from '../components/Mentions';
import { AdminCrown, RoleBadge } from '../components/PlusBadge';
import { isVoiceMuted, setVoiceMuted, unlockAudio, useSpeaking, useVoiceStatus, voiceStatusLabel } from '../lib/voice';
import { nameStyle } from '../lib/util';
import { run } from './ServerView';

// Salon rapide : vocal et chat privés pour quelques personnes. Le lien suffit pour entrer (il faut être connecté).
export default function QuickRoomView({ roomId }) {
  const s = useStore();
  const { go, toast } = useUI();
  const me = getMe(s);
  const room = quickRoomOf(s, roomId);
  const speaking = useSpeaking();
  const vstatus = useVoiceStatus();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(isVoiceMuted());
  if (!room || !me) {
    return (
      <div className="panel flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-extrabold text-slate-900">Ce salon n’existe plus</p>
        <p className="max-w-sm text-sm text-slate-500">Il a été supprimé car plus personne n’y était.</p>
        <button type="button" onClick={() => go({ name: 'home' })} className="btn-primary">Retour à l’accueil</button>
      </div>
    );
  }

  const isOwner = room.owner_id === me.id;
  const members = room.members.map((id) => getUser(s, id)).filter(Boolean);
  const inVoice = s.voice.some((v) => v.user_id === me.id && v.channel_id === `quick:${room.id}`);
  const voiceUsers = s.voice.filter((v) => v.channel_id === `quick:${room.id}`);
  const messages = (s.quickMessages ?? []).filter((m) => m.room_id === room.id);
  const link = `${window.location.origin}/salon/${room.code}`;

  const copy = () => navigator.clipboard?.writeText(link).then(() => toast('Lien copié'), () => toast('Copie impossible : sélectionnez le lien.'));
  const joinVoice = () => { unlockAudio(); run(toast, () => joinQuickVoice(room.id), 'Vocal rejoint'); };
  const leaveVoice = () => { setVoiceMuted(false); setMuted(false); run(toast, () => leaveQuickVoice()); };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setVoiceMuted(next);
    setVoiceMutedRemote(next).catch(() => {});
  };
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const content = text;
    setText('');
    setError('');
    try {
      await sendQuickMessage(room.id, content);
    } catch (err) {
      setText(content);
      setError(err.message);
    }
  };
  const leave = async () => {
    if (!window.confirm('Quitter ce salon ? Il disparaît s’il n’y a plus personne.')) return;
    const ok = await run(toast, () => leaveQuickRoom(room.id));
    if (ok) go({ name: 'home' });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <header className="panel flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Salon rapide · privé</p>
          <p className="truncate text-lg font-extrabold text-slate-900">{room.name}</p>
          <p className="text-xs font-semibold text-slate-500">{members.length}/5 personnes{room.locked ? ' · verrouillé' : ''}</p>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 sm:w-auto sm:max-w-md">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">{link}</code>
          <button type="button" onClick={copy} className="btn-primary !py-1.5 !text-xs">Copier</button>
        </div>
        <button type="button" onClick={leave} className="btn-danger !py-2">Quitter le salon</button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[18rem_1fr]">
        <aside className="panel flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-3">
            {inVoice ? (
              <>
                <p className={`text-sm font-bold ${vstatus === 'connected' || vstatus === 'alone' ? 'text-emerald-600' : 'text-amber-600'}`}>{voiceStatusLabel(vstatus)}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={toggleMute} className={`btn-ghost !py-2 !text-sm ${muted ? 'text-red-600' : ''}`}>{muted ? 'Micro coupé' : 'Micro ouvert'}</button>
                  <button type="button" onClick={leaveVoice} className="btn-danger !py-2 !text-sm">Quitter</button>
                </div>
              </>
            ) : (
              <button type="button" onClick={joinVoice} className="btn-soft !py-2.5">Rejoindre le vocal</button>
            )}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Membres</p>
          {members.map((u) => {
            const inV = voiceUsers.find((v) => v.user_id === u.id);
            const ring = speaking.has(u.id) && !inV?.muted;
            return (
              <div key={u.id} className="flex items-center gap-3">
                <span className={`flex shrink-0 rounded-full transition ${ring ? 'ring-2 ring-white shadow-[0_0_12px_rgba(255,255,255,0.8)]' : ''}`}>
                  <Avatar user={u} size="sm" showStatus />
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <AdminCrown user={u} />
                  <span className="min-w-0 truncate text-sm font-bold" style={nameStyle(u)}>{u.pseudo}{u.id === me.id ? ' (vous)' : ''}</span>
                  <RoleBadge user={u} />
                </div>
                {inV && <span className="text-[11px] font-semibold text-slate-400">{inV.muted ? 'coupé' : 'vocal'}</span>}
                {isOwner && u.id !== me.id && (
                  <button type="button" onClick={() => window.confirm(`Retirer ${u.pseudo} du salon ?`) && run(toast, () => kickQuickMember(room.id, u.id), 'Membre retiré')} className="rounded-lg px-1.5 py-0.5 text-xs font-bold text-red-600 hover:bg-red-50">Retirer</button>
                )}
              </div>
            );
          })}
          {isOwner && (
            <button type="button" onClick={() => run(toast, () => setQuickRoomLock(room.id, !room.locked), room.locked ? 'Salon déverrouillé' : 'Salon verrouillé')} className="btn-ghost mt-2 !py-2 !text-sm">
              {room.locked ? 'Déverrouiller le salon' : 'Verrouiller le salon'}
            </button>
          )}
        </aside>

        <section className="panel flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="thin-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
            {messages.length === 0 && <p className="m-auto text-sm text-slate-500">Aucun message. Dites bonjour !</p>}
            {messages.map((m) => {
              const author = getUser(s, m.user_id);
              return (
                <div key={m.id} className="flex items-start gap-3 rounded-2xl border-2 border-slate-300 bg-slate-100 px-4 py-3">
                  {author && <Avatar user={author} size="sm" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {author && <AdminCrown user={author} />}
                      <span className="font-bold" style={nameStyle(author)}>{author?.pseudo ?? 'Ancien membre'}</span>
                      {author && <RoleBadge user={author} />}
                      <TimeAgo ts={m.created_at} className="text-xs text-slate-400" />
                    </div>
                    {m.content && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900"><RichText text={m.content} users={new Map()} meName={me.pseudo} links={me.settings?.linksOn !== false} /></p>}
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={send} className="border-t border-slate-100 p-3">
            <div className="flex items-center gap-2">
              <input className="field !rounded-2xl !bg-slate-100 !py-3" placeholder="Écrire dans le salon…" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
              <button type="submit" disabled={!text.trim()} aria-label="Envoyer" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white disabled:opacity-40">
                <Icon name="send" className="h-5 w-5" />
              </button>
            </div>
            <ErrorLine>{error}</ErrorLine>
          </form>
        </section>
      </div>
    </div>
  );
}
