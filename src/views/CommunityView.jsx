import { useState } from 'react';
import { getMe, joinPublicServer } from '../lib/store';
import { useStore, useUI, Modal, ServerIcon, EmptyState } from '../components/ui';
import PageBanner from '../components/PageBanner';
import SpaceCard from '../components/SpaceCard';
import SpaceHero from '../components/SpaceHero';
import { formatStamp } from '../lib/util';
import { run } from './ServerView';
import { fullName } from '../lib/util';

// Communauté : liste des espaces publics, visibles par tous. Les espaces privés n'apparaissent jamais ici.
export default function CommunityView() {
  const s = useStore();
  const { go, toast, openModal } = useUI();
  const me = getMe(s);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState('');
  const list = s.communities ?? [];
  const shown = list.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="thin-scroll flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto pb-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <PageBanner icon="search" title="Communauté" subtitle={`${list.length} espace(s) public(s) à découvrir`}>
          <button onClick={() => openModal('join')} className="btn-ghost !rounded-full !py-2.5">Rejoindre un espace</button>
          <button onClick={() => openModal('createServer')} className="btn-primary !rounded-full !py-2.5">Créer un espace</button>
        </PageBanner>
        <input className="field" placeholder="Rechercher un espace public…" value={q} onChange={(e) => setQ(e.target.value)} />

        {list.length === 0 && (
          <EmptyState icon="users" title="Aucun espace public">Les espaces créés en mode public apparaîtront ici.</EmptyState>
        )}

        {list.length > 0 && shown.length === 0 && <p className="text-sm text-slate-500">Aucun espace ne correspond à « {q} ».</p>}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <SpaceCard
              key={c.id}
              server={c}
              meta={`${c.members} membre(s) · par ${c.owner_pseudo}`}
              badge={c.is_member ? <span className="pill !bg-brand-100 !text-brand-700">Membre</span> : null}
              onClick={() => setSelected(c.id)}
            />
          ))}
        </div>
      </div>

      {selected && (() => {
        const c = list.find((x) => x.id === selected);
        if (!c) return null;
        return (
          <Modal open title="" onClose={() => setSelected(null)} width="max-w-md">
            <div className="flex flex-col items-center gap-4 text-center">
              <SpaceHero server={c} className="h-36 w-full" />
              <p className="text-sm text-slate-500">Créé par {c.owner_pseudo} · {formatStamp(c.created_at).slice(0, 10)}</p>
              <div className="grid w-full grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xl font-extrabold">{c.members}</p>
                  <p className="text-xs font-semibold text-slate-500">Membres</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xl font-extrabold">Public</p>
                  <p className="text-xs font-semibold text-slate-500">Visibilité</p>
                </div>
              </div>
              {c.is_member ? (
                <button className="btn-primary w-full" onClick={() => { setSelected(null); go({ name: 'server', serverId: c.id }); }}>Ouvrir l’espace</button>
              ) : (
                <button
                  className="btn-primary w-full"
                  onClick={async () => {
                    const ok = await run(toast, () => joinPublicServer(c.id));
                    if (ok) {
                      setSelected(null);
                      go({ name: 'server', serverId: c.id });
                    }
                  }}
                >
                  Rejoindre
                </button>
              )}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
