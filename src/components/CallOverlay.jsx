import { useEffect, useState } from 'react';
import { callOf, declineCall, getMe, getUser, joinCall, leaveCall } from '../lib/store';
import { useStore, useUI, Avatar, Icon } from './ui';
import VoiceScreen from './VoiceScreen';
import { isVoiceMuted, setVoiceMuted, unlockAudio, useSpeaking, useVoiceStatus, voiceStatusLabel } from '../lib/voice';
import { setVoiceMutedRemote } from '../lib/store';
import { startRing } from '../lib/sounds';
import { run } from '../views/ServerView';

// Appel privé visible partout : écran plein comme le vocal, appel entrant avec Rejoindre / Refuser, réduction en barre.
export default function CallOverlay() {
  const s = useStore();
  const { toast } = useUI();
  const me = getMe(s);
  const call = callOf(s);
  const [minimized, setMinimized] = useState(false);
  const [muted, setMuted] = useState(isVoiceMuted());
  const status = useVoiceStatus();
  const speaking = useSpeaking();

  // Sonnerie : un appel sortant sonne toujours ; un appel entrant sonne sauf si l'on est « en game » (silencieux).
  const silentIncoming = call?.state === 'incoming' && me?.status === 'game';
  useEffect(() => {
    if (!call || silentIncoming || call.state === 'active') return undefined;
    unlockAudio();
    return startRing();
  }, [call?.room, call?.state, silentIncoming]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setMinimized(false), [call?.room]);

  if (!call || !me) return null;
  const partner = getUser(s, call.partnerId);
  if (!partner) return null;

  const join = () => { unlockAudio(); run(toast, () => joinCall(partner.id), 'Appel rejoint'); };
  const hangUp = () => run(toast, () => leaveCall(), 'Appel terminé');
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setVoiceMuted(next);
    setVoiceMutedRemote(next).catch(() => {});
  };

  // En game : appel discret, sans écran ni son, en petite carte qui ne couvre pas la page.
  if (call.state === 'incoming' && silentIncoming) {
    return (
      <div className="fixed bottom-4 right-4 z-[55] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-3 shadow-soft" role="status" aria-label="Appel entrant discret">
        <Avatar user={partner} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-slate-900">{partner.pseudo} vous appelle</p>
          <p className="text-[11px] font-semibold text-slate-500">Vous êtes en game : sans son</p>
        </div>
        <button type="button" onClick={() => run(toast, () => declineCall(partner.id), 'Appel refusé')} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">Refuser</button>
        <button type="button" onClick={join} className="rounded-full bg-slate-900 px-3 py-2 text-xs font-bold text-white">Rejoindre</button>
      </div>
    );
  }

  if (call.state === 'incoming') {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 bg-[rgba(9,9,11,0.96)] p-6 text-center" role="alertdialog" aria-label="Appel entrant">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Appel entrant</p>
        <div className="relative">
          <span className="absolute -inset-3 animate-ping rounded-full bg-white/20" aria-hidden="true" />
          <Avatar user={partner} size="xl" className="relative ring-4 ring-white" />
        </div>
        <p className="text-2xl font-extrabold text-slate-900">{partner.pseudo} vous appelle</p>
        {silentIncoming && <p className="text-sm text-slate-500">Vous êtes en game : l’appel arrive sans sonnerie.</p>}
        <div className="grid w-full max-w-sm grid-cols-2 gap-3">
          <button type="button" onClick={() => run(toast, () => declineCall(partner.id), 'Appel refusé')} className="btn-danger min-h-[56px] !text-base">Refuser</button>
          <button type="button" onClick={join} className="btn-soft min-h-[56px] !text-base">Rejoindre</button>
        </div>
      </div>
    );
  }

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[55] flex items-center gap-3 rounded-full border border-slate-200 bg-surface py-2 pl-2 pr-2 shadow-soft">
        <Avatar user={partner} size="sm" />
        <div className="min-w-0 pr-1">
          <p className="max-w-[9rem] truncate text-sm font-extrabold text-slate-900">{partner.pseudo}</p>
          <p className="text-[11px] font-semibold text-slate-500">{call.state === 'outgoing' ? 'Ça sonne…' : voiceStatusLabel(status)}</p>
        </div>
        <button type="button" onClick={() => setMinimized(false)} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">Ouvrir</button>
        <button type="button" onClick={hangUp} aria-label="Raccrocher" className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const outgoing = call.state === 'outgoing';
  const users = outgoing ? [me] : [me, partner];
  return (
    <VoiceScreen
      title={outgoing ? 'Ça sonne…' : 'Appel privé'}
      status={outgoing ? null : status}
      channelName={`Avec ${partner.pseudo}`}
      users={users}
      selfId={me.id}
      isMuted={muted}
      voiceMuted={(id) => !!s.voice.find((v) => v.user_id === id)?.muted}
      speaking={speaking}
      onToggleMute={toggleMute}
      onLeave={hangUp}
      onClose={() => setMinimized(true)}
      closeLabel="Réduire"
    />
  );
}
