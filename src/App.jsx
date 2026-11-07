import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Splash from './components/Splash';
import { getMe, getState, leaveVoice, refresh, setVoiceMutedRemote } from './lib/store';
import { isVoiceMuted, setVoiceErrorHandler, stopVoice, syncVoice } from './lib/voice';
import { playJoin, playLeave } from './lib/sounds';
import { startPresence, stopPresence } from './lib/presence';
import { startEvents, stopEvents } from './lib/events';
import { completeSpotifyLogin, startSpotifyPlayer } from './lib/spotify';
import SpotifyPlayer from './components/SpotifyPlayer';
import { getToken } from './lib/api';
import { ContextMenu, UIContext, useStore } from './components/ui';
import Layout from './components/Layout';
import { ModalHost } from './components/Modals';
import Login from './views/Login';
import PlusView from './views/PlusView';
import SettingsView from './views/SettingsView';
import Home from './views/Home';
import ServerView from './views/ServerView';
import MessagesView from './views/MessagesView';
import FriendsView from './views/FriendsView';
import CommunityView from './views/CommunityView';
import ProfileView from './views/ProfileView';
import AdminView from './views/AdminView';

// Routage par état. La vue « espace » s'affiche plein écran (sans sidebar), comme la capture.
// Chemin d'URL -> vue. Seul /admin change de vue ; le reste est l'accueil (routage par état).
function viewFromPath(pathname) {
  return pathname.startsWith('/admin') ? { name: 'admin' } : { name: 'home' };
}

// Connexions vocales : d'après l'état courant (salon du membre et participants).
// Dernier état vocal vu : sert à jouer les sons d'arrivée et de départ.
let lastVoice = { channelId: null, ids: [] };

function reconcileVoice() {
  const st = getState();
  const me = st && getMe(st);
  if (!me) return stopVoice();
  const mine = st.voice.find((v) => v.user_id === me.id);
  if (!mine) {
    if (lastVoice.channelId) playLeave(); // je quitte le vocal
    lastVoice = { channelId: null, ids: [] };
    return syncVoice(null, me.id, []);
  }
  const participants = st.voice.filter((v) => v.channel_id === mine.channel_id).map((v) => v.user_id);
  if (mine.channel_id !== lastVoice.channelId) {
    playJoin(); // je rejoins un vocal
  } else {
    const joined = participants.some((id) => id !== me.id && !lastVoice.ids.includes(id));
    const left = lastVoice.ids.some((id) => id !== me.id && !participants.includes(id));
    if (joined) playJoin(); // quelqu'un arrive : tout le monde l'entend
    else if (left) playLeave(); // quelqu'un part : tout le monde l'entend
  }
  lastVoice = { channelId: mine.channel_id, ids: participants };
  // Le serveur doit connaître notre micro (il repart ouvert à chaque connexion au salon).
  if (!!mine.muted !== isVoiceMuted()) setVoiceMutedRemote(isVoiceMuted()).catch(() => {});
  return syncVoice(mine.channel_id, me.id, participants);
}

export default function App() {
  const s = useStore();
  const me = s ? getMe(s) : null;
  // Thème clair / sombre choisi dans Paramètres.
  const themeName = me?.settings?.theme === 'dark' ? 'dark' : 'light';
  useEffect(() => { document.documentElement.dataset.theme = themeName; }, [themeName]);
  // Retour de la connexion Spotify (URL /spotify-callback?code=…).
  useEffect(() => {
    if (window.location.pathname !== '/spotify-callback') return;
    const code = new URLSearchParams(window.location.search).get('code');
    window.history.replaceState(null, '', '/');
    if (!code) return;
    completeSpotifyLogin(code)
      .then(() => { toast('Spotify connecté'); startSpotifyPlayer(); })
      .catch((err) => toast(err.message));
  }, []);
  // Présence tant que la page est ouverte (indépendante de la taille de la fenêtre).
  const loggedIn = !!me;
  useEffect(() => {
    if (loggedIn) {
      startPresence(getToken());
      startEvents(() => refresh());
    } else {
      stopPresence();
      stopEvents();
    }
    return undefined;
  }, [loggedIn]);
  // Vocal : recalculé à chaque changement de l'état (clic optimiste, réponse serveur ou synchronisation).
  useEffect(() => { reconcileVoice(); }, [s]);
  const [view, setView] = useState(() => viewFromPath(window.location.pathname));
  const [modal, setModal] = useState(null);
  const [menu, setMenu] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [booting, setBooting] = useState(() => !!getToken());
  const [splash, setSplash] = useState(false);
  const wasLogged = useRef(false);
  const endSplash = useCallback(() => setSplash(false), []);
  const logged = !!me;
  useEffect(() => {
    if (logged && !wasLogged.current) setSplash(true);
    wasLogged.current = logged;
  }, [logged]);

  // Synchronisation toutes les 3 s. Le serveur ne renvoie les données que si elles ont changé.
  // Le vocal est réconcilié à chaque cycle (connexions vers les membres du salon).
  useEffect(() => {
    let alive = true;
    const tick = () => refresh().finally(() => alive && setBooting(false));
    tick();
    const id = setInterval(tick, 3000); // filet de sécurité : le flux d'événements prévient en temps réel
    setVoiceErrorHandler((msg) => {
      toast(msg);
      leaveVoice().catch(() => {});
    });
    return () => {
      alive = false;
      clearInterval(id);
      stopVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rafraîchit l'affichage de la présence toutes les 5 s (sans requête réseau).
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);


  // Clic droit : désactivé partout sauf sur les éléments qui ouvrent un menu de l'application.
  // Dans les champs de saisie, le menu natif (copier / coller) reste disponible.
  useEffect(() => {
    const block = (e) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
    };
    window.addEventListener('contextmenu', block, true);
    return () => window.removeEventListener('contextmenu', block, true);
  }, []);

  // Navigation par URL : /admin ouvre le panel d'administration.
  useEffect(() => {
    const onPop = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);
  const closeModal = useCallback(() => setModal(null), []);
  const toast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 2800);
  }, []);

  const goHome = useCallback(() => setView({ name: 'home' }), []);

  const ui = useMemo(
    () => ({
      view,
      go: (v) => {
        const path = v.name === 'admin' ? '/admin' : '/';
        if (window.location.pathname !== path) window.history.pushState({}, '', path);
        setView(v);
        setModal(null);
      },
      openModal: (name, props = {}) => setModal({ name, ...props }),
      // Clic gauche sur une photo ou un nom : mini-profil dans un espace, profil ailleurs.
      openUser: (userId, serverId = null) => {
        if (serverId && view.name === 'server') setModal({ name: 'mini', userId, serverId });
        else {
          setView({ name: 'profile', userId });
          setModal(null);
        }
      },
      closeModal,
      openMenu: (e, items) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY, items });
      },
      toast,
    }),
    [view, closeModal, toast],
  );

  useEffect(() => {
    if (!me) setView({ name: 'home' });
  }, [me]);

  let content;
  if (booting && !me) {
    content = <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">Chargement…</div>;
  } else if (!me) {
    content = <Login toast={toast} />;
  } else {
    content = (
      <Layout view={view}>
        {view.name === 'server' && <ServerView key={view.serverId} serverId={view.serverId} channelId={view.channelId} goHome={goHome} />}
        {view.name === 'home' && <Home />}
        {view.name === 'messages' && <MessagesView withId={view.withId} />}
        {view.name === 'friends' && <FriendsView />}
        {view.name === 'plus' && <PlusView />}
        {view.name === 'settings' && <SettingsView />}
        {view.name === 'community' && <CommunityView />}
        {view.name === 'admin' && <AdminView />}
        {view.name === 'profile' && <ProfileView key={`${view.userId}-${!!view.edit}`} userId={view.userId} edit={!!view.edit} goBack={goHome} />}
      </Layout>
    );
  }

  return (
    <UIContext.Provider value={ui}>
      {content}
      {me && <SpotifyPlayer />}
      {splash && <Splash onDone={endSplash} />}
      <ModalHost modal={modal} onClose={closeModal} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
      {toastMsg && (
        <div role="status" className="panel fixed right-6 top-6 z-[70] rounded-2xl px-5 py-3 text-sm font-semibold text-slate-800">
          {toastMsg}
        </div>
      )}
    </UIContext.Provider>
  );
}
