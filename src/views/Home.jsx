import { useEffect, useState } from 'react';
import { getMe, serversOf, friendsOf, membersOf, myVoice, searchUsers } from '../lib/store';
import { useStore, useUI, Avatar, CountBadge, Icon, ServerIcon } from '../components/ui';
import { serverUnread, leaveServer } from '../lib/store';
import { run } from './ServerView';
import Logo from '../components/Logo';
import SpaceCard from '../components/SpaceCard';
import { fullName, isOnline, statusLabel, statusColor, nameStyle } from '../lib/util';

// Bannière d'accueil : l'accroche apparaît mot par mot, « gamer » bascule vers « communauté »,
// puis le logo arrive, suivi du nom Feathery. Ensuite, le mouvement reste lent et continu.
const HERO_TAGLINE = ['Client', 'léger', 'de', 'discussion', 'pour'];
const PARTICLES = [
  { left: '12%', size: 6, delay: '0s', duration: '14s' },
  { left: '28%', size: 4, delay: '3s', duration: '18s' },
  { left: '48%', size: 5, delay: '7s', duration: '16s' },
  { left: '66%', size: 3, delay: '1.5s', duration: '20s' },
  { left: '82%', size: 6, delay: '5s', duration: '15s' },
  { left: '92%', size: 4, delay: '9s', duration: '19s' },
];

function HeroBanner({ onJoin }) {
  return (
    <section className="hero relative isolate flex min-h-[20rem] items-center justify-center overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-900 via-brand-800 to-[#052e16] p-8 text-white shadow-panel md:min-h-[24rem] md:p-10">
      {/* Lueur en dégradé radial (sans filtre flou : plus fluide à animer) */}
      <div
        aria-hidden="true"
        className="hero-aura pointer-events-none absolute inset-0 m-auto h-[120%] w-[120%] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(52,211,153,0.28), rgba(52,211,153,0) 100%)' }}
      />
      <div className="hero-ring pointer-events-none absolute inset-0 m-auto h-72 w-72 rounded-full border border-white/10 md:h-96 md:w-96">
        <span className="hero-dot absolute -top-1 left-1/2 h-2 w-2 rounded-full bg-brand-300" />
      </div>
      <div className="hero-ring hero-ring-2 pointer-events-none absolute inset-0 m-auto h-[26rem] w-[26rem] rounded-full border border-white/5 md:h-[32rem] md:w-[32rem]">
        <span className="hero-dot hero-dot-2 absolute bottom-6 right-6 h-1.5 w-1.5 rounded-full bg-white/70" />
      </div>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="hero-particle pointer-events-none absolute bottom-0 rounded-full bg-brand-200/60"
          style={{ left: p.left, width: p.size, height: p.size, animationDelay: p.delay, animationDuration: p.duration }}
        />
      ))}

      <div className="relative z-10 grid justify-items-center gap-8 text-center">
        {/* 1. Accroche mot à mot, puis bascule « gamer » → « communauté » */}
        <p className="hero-tag col-start-1 row-start-1 max-w-md text-center text-lg font-semibold leading-relaxed text-white/90 md:text-2xl">
          {HERO_TAGLINE.map((word, i) => (
            <span key={i} className="hero-word inline-block" style={{ animationDelay: `${0.3 + i * 0.6667}s`, animationDuration: '0.6667s' }}>{word}&nbsp;</span>
          ))}
          <span className="inline-grid align-baseline">
            <span className="hero-word-out col-start-1 row-start-1" style={{ animationDelay: '3.6333s', animationDuration: '0.6667s' }}>gamer</span>
            <span className="hero-word-in col-start-1 row-start-1 whitespace-nowrap" style={{ animationDelay: '4.3s', animationDuration: '0.6667s' }}>communauté</span>
          </span>
        </p>

        {/* 2. Logo (sans cadre) puis le nom Feathery, lettre par lettre, avec un reflet blanc/gris */}
        <div className="hero-brand col-start-1 row-start-1 flex flex-col items-center gap-5">
          <div className="hero-logo-wrap flex h-36 w-36 items-center justify-center md:h-44 md:w-44">
            <div className="flex h-full w-full items-center justify-center">
              <Logo className="hero-logo-img h-full w-full" />
            </div>
          </div>
          <p aria-label="Feathery" className="hero-wordmark -my-4 flex px-4 py-4 text-4xl font-extrabold tracking-tight md:text-5xl">
            {'Feathery'.split('').map((ch, i) => (
              <span key={i} aria-hidden="true" className="hero-letter inline-block" style={{ animationDelay: `${5.67 + i * 0.08}s` }}>{ch}</span>
            ))}
          </p>
        </div>

        {/* 3. Bouton d'entrée */}
        <button onClick={onJoin} className="hero-cta btn-soft col-start-1 row-start-2 !rounded-full !px-6">
          Rejoindre un espace
        </button>
      </div>
    </section>
  );
}

export default function Home() {
  const s = useStore();
  const { go, openModal, openMenu, toast } = useUI();
  const me = getMe(s);
  const [q, setQ] = useState('');

  const servers = serversOf(s, me.id);
  // Totaux globaux renvoyés par le serveur (pas seulement les membres visibles).
  const total = s.stats?.total ?? s.users.length;
  const online = s.stats?.online ?? s.users.filter(isOnline).length;
  const percent = total ? Math.round((online / total) * 100) : 0;
  const friends = friendsOf(s, me.id).sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)));
  const onlineFriends = friends.filter(isOnline);

  const query = q.trim().toLowerCase();
  // Recherche de membres côté serveur ; les anciens résultats restent affichés pendant la recherche (pas de clignotement).
  const [remoteUsers, setRemoteUsers] = useState([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRemoteUsers([]); return undefined; }
    let alive = true;
    const id = setTimeout(() => {
      searchUsers(term).then((list) => alive && setRemoteUsers(list)).catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(id); };
  }, [q]);
  const results = query
    ? {
        servers: servers.filter((x) => x.name.toLowerCase().includes(query)),
        users: remoteUsers.filter((u) => u.id !== me.id),
      }
    : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      {/* Barre supérieure */}
      <div className="flex items-center gap-4">
        <div className="relative mx-auto w-full max-w-md">
          <input
            className="w-full rounded-full border border-line bg-surface/80 py-3 pl-12 pr-4 text-sm shadow-soft backdrop-blur focus:outline-none focus:ring-4 focus:ring-brand-500/15"
            placeholder="Rechercher une communauté, un membre..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon name="search" className="h-5 w-5" />
          </span>
          {results && (
            <div className="panel absolute left-0 right-0 top-14 z-20 max-h-80 overflow-y-auto thin-scroll p-2">
              {results.servers.length === 0 && results.users.length === 0 && <p className="p-3 text-sm text-slate-500">Aucun résultat.</p>}
              {results.servers.map((srv) => (
                <button key={srv.id} onClick={() => { setQ(''); go({ name: 'server', serverId: srv.id }); }} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-slate-200">
                  <Icon name="home" className="h-5 w-5 text-brand-600" />
                  <span className="text-sm font-semibold">{srv.name}</span>
                </button>
              ))}
              {results.users.map((u) => (
                <button key={u.id} onClick={() => { setQ(''); go({ name: 'profile', userId: u.id }); }} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-slate-200">
                  <Avatar user={u} size="sm" showStatus />
                  <span className="text-sm font-semibold" style={nameStyle(u)}>{fullName(u)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => go({ name: 'messages' })} className="btn-ghost hidden shrink-0 !rounded-full !bg-surface !py-2.5 shadow-soft sm:flex">
          <Icon name="users" className="h-4 w-4 text-brand-600" />
          Message
        </button>
        <button onClick={() => go({ name: 'profile', userId: me.id })} className="hidden shrink-0 sm:block" aria-label="Mon profil">
          <Avatar user={me} size="md" showStatus />
        </button>
      </div>

      <div className="thin-scroll flex min-h-0 flex-1 gap-4 overflow-y-auto pb-2">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Bannière de bienvenue */}
          <HeroBanner onJoin={() => openModal('join')} />

          {/* Statistiques en direct */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat icon="users" label="Membres inscrits" value={total} />
            <Stat icon="chat" label="Membres en ligne" value={online} />
            <Stat icon="bolt" label="Activité globale" value={`${percent}%`} />
          </section>

          {/* Espaces ou tableau de bord vide */}
          <section className="panel flex min-h-64 flex-1 flex-col p-6">
            {servers.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-50 text-amber-400">
                  <Icon name="bolt" className="h-9 w-9" />
                </div>
                <h2 className="text-xl font-bold">Bienvenue sur votre tableau de bord</h2>
                <p className="max-w-sm text-sm text-slate-500">
                  Sélectionnez un espace dans la colonne de gauche ou rejoignez-en un via un code d’invitation pour accéder aux salons textuels et vocaux de vos communautés.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {servers.map((srv) => (
                  <SpaceCard
                    key={srv.id}
                    server={srv}
                    meta={`${membersOf(s, srv.id).length} membre(s) · ${srv.is_public ? 'Public' : 'Privé'}`}
                    unread={serverUnread(s, srv.id)}
                    badge={myVoice(s)?.serverId === srv.id ? <span className="pill !bg-brand-500 !text-white">En vocal</span> : null}
                    onClick={() => go({ name: 'server', serverId: srv.id })}
                    onContextMenu={(e) => {
                      if (srv.owner_id === me.id) { e.preventDefault(); return; }
                      openMenu(e, [{ label: 'Quitter l’espace', danger: true, onClick: () => { if (window.confirm(`Quitter « ${srv.name} » ?`)) run(toast, () => leaveServer(srv.id)); } }]);
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Panneau de droite */}
        <aside className="hidden w-80 shrink-0 flex-col gap-4 xl:flex">
          <section className="panel p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-bold">Votre profil</h2>
              <button onClick={() => go({ name: 'profile', userId: me.id })} aria-label="Voir mon profil" className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-300">
                <Icon name="settings" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-4">
              <Avatar user={me} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold" style={nameStyle(me)}>{me.pseudo}</p>
                <p className="text-sm font-semibold text-brand-600">{me.is_plus ? 'Membre PLUS' : 'Membre Feathery'}</p>
              </div>
            </div>
          </section>

          <section className="panel flex flex-col gap-3 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Amis en ligne</h2>
              <button onClick={() => go({ name: 'friends' })} className="text-sm font-semibold text-slate-500 hover:text-slate-900">
                Voir tout →
              </button>
            </div>
            {onlineFriends.length === 0 && <p className="text-sm text-slate-500">Aucun ami en ligne pour le moment.</p>}
            {onlineFriends.slice(0, 6).map((f) => (
              <div key={f.id} className="flex items-center gap-3">
                <button onClick={() => go({ name: 'profile', userId: f.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar user={f} size="md" showStatus />
                  <span className="min-w-0">
                    <span className="block truncate font-bold" style={nameStyle(f)}>{f.pseudo}</span>
                    <span className="block text-xs text-slate-500"><span style={{ color: statusColor(f) }}>{statusLabel(f)}</span></span>
                  </span>
                </button>
                <button title="Envoyer un message" onClick={() => go({ name: 'messages', withId: f.id })} className="rounded-2xl bg-slate-100 p-2.5 text-slate-600 hover:bg-slate-200">
                  <Icon name="chat" className="h-4 w-4" />
                </button>
              </div>
            ))}
            {onlineFriends.length > 0 && <p className="text-xs text-slate-400">{onlineFriends.length} ami(s) connecté(s)</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="panel flex items-center gap-4 p-5">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xl font-extrabold">{value}</p>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
      </div>
    </div>
  );
}

