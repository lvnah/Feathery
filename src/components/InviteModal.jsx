import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { joinServer } from '../lib/store';
import { Modal, ServerIcon, useUI } from './ui';

// Fenêtre affichée à l'ouverture d'un lien d'invitation : infos de l'espace, puis Rejoindre ou Refuser.
export default function InviteModal({ code, onDone }) {
  const { go } = useUI();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/invite/${encodeURIComponent(code)}`, { auth: false })
      .then((r) => setInfo(r.server))
      .catch((err) => setError(err.message));
  }, [code]);

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await joinServer(code);
      onDone();
      go({ name: 'server', serverId: res.id });
    } catch (err) {
      setBusy(false);
      setError(err.message);
    }
  };

  return (
    <Modal open title="" onClose={onDone} width="max-w-md">
      {!info ? (
        <p className="py-10 text-center text-sm text-slate-500">{error || 'Chargement de l’invitation…'}</p>
      ) : (
        <div className="-mx-6 -mt-6 flex flex-col">
          <div className="relative h-32 w-full overflow-hidden rounded-t-[2.5rem] bg-gradient-to-br from-brand-700 via-brand-600 to-brand-400">
            {info.banner && <img src={info.banner} alt="" draggable={false} className="absolute inset-0 h-full w-full scale-105 object-cover object-center blur-[2px]" />}
          </div>
          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="-mt-10 flex items-end gap-4">
              <span className="rounded-full ring-4 ring-surface shadow-soft"><ServerIcon server={info} className="h-20 w-20" /></span>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Invitation à rejoindre</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{info.name}</p>
              <p className="text-sm text-slate-500">{info.members} membre(s) · créé par {info.owner_pseudo}</p>
            </div>
            <p className="text-sm text-slate-600">Vous pourrez écrire dans les salons de cet espace et y rejoindre les vocaux.</p>
            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={onDone} className="btn-ghost min-h-[48px]" disabled={busy}>Refuser</button>
              <button type="button" onClick={join} className="btn-primary min-h-[48px]" disabled={busy}>{busy ? 'Connexion…' : 'Rejoindre'}</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
