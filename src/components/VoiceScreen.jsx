import { Avatar, Icon } from './ui';
import { useSpeaking, voiceStatusLabel } from '../lib/voice';

// Vue vocale plein écran (téléphone) : qui est là, micro, quitter. Le chat reste accessible via « Retour au chat ».
export default function VoiceScreen({ channelName, users, isMuted, voiceMuted, onToggleMute, onLeave, onClose, selfId, status, title = 'En vocal', closeLabel = 'Retour au chat', speaking: speakingProp }) {
  const liveSpeaking = useSpeaking();
  const speaking = speakingProp ?? liveSpeaking;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label="Vocal">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-widest ${status === 'connected' || status === 'alone' ? 'text-emerald-600' : 'text-amber-600'}`}>{status ? voiceStatusLabel(status) : title}</p>
          <p className="truncate text-lg font-extrabold text-slate-900">{channelName}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">
          {closeLabel}
        </button>
      </header>

      <div className="thin-scroll grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-5">
        {users.map((u) => {
          const muted = u.id === selfId ? isMuted : voiceMuted(u.id);
          return (
            <div key={u.id} className="flex flex-col items-center gap-2 rounded-3xl border border-slate-100 bg-surface p-4 shadow-soft">
              <span className={`rounded-full transition ${speaking.has(u.id) && !(u.id === selfId ? isMuted : voiceMuted(u.id)) ? 'ring-4 ring-white shadow-[0_0_18px_rgba(255,255,255,0.7)]' : ''}`}>
                <Avatar user={u} size="lg" showStatus />
              </span>
              <p className="w-full truncate text-center text-sm font-bold text-slate-900">{u.pseudo}{u.id === selfId ? ' (vous)' : ''}</p>
              <span className={`flex items-center gap-1 text-xs font-semibold ${muted ? 'text-red-600' : 'text-brand-700'}`}>
                <Icon name={muted ? 'micOff' : 'mic'} className="h-3.5 w-3.5" />
                {muted ? 'Micro coupé' : speaking.has(u.id) ? 'Parle' : 'Silencieux'}
              </span>
            </div>
          );
        })}
      </div>

      <footer className="grid grid-cols-2 gap-3 border-t border-slate-100 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={isMuted ? 'Activer le micro' : 'Couper le micro'}
          className={`flex min-h-[56px] items-center justify-center gap-2 rounded-2xl text-base font-bold ${isMuted ? 'bg-red-50 text-red-700' : 'bg-brand-100 text-brand-800'}`}
        >
          <Icon name={isMuted ? 'micOff' : 'mic'} className="h-5 w-5" />
          {isMuted ? 'Micro coupé' : 'Micro ouvert'}
        </button>
        <button type="button" onClick={onLeave} className="btn-danger min-h-[56px] !text-base">
          Quitter le vocal
        </button>
      </footer>
    </div>
  );
}
