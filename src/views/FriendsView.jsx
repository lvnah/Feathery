import { useState } from 'react';
import { friendsOf, getMe, getUser, pendingReceived, pendingSent, removeFriend, respondFriendRequest, sendFriendRequestByTag } from '../lib/store';
import { useStore, useUI, Avatar, ErrorLine, Icon } from '../components/ui';
import { fullName, isOnline, statusLabel, nameStyle } from '../lib/util';
import { run } from './ServerView';
import PageBanner from '../components/PageBanner';

export default function FriendsView() {
  const s = useStore();
  const { go, toast } = useUI();
  const me = getMe(s);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const received = pendingReceived(s, me.id).map((f) => ({ f, user: getUser(s, f.from) })).filter((x) => x.user);
  const sent = pendingSent(s, me.id).map((f) => ({ f, user: getUser(s, f.to) })).filter((x) => x.user);
  const friends = friendsOf(s, me.id).sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.pseudo.localeCompare(b.pseudo));

  const add = async (e) => {
    e.preventDefault();
    setError('');
    if (!/#/.test(query)) {
      setError('Format attendu : Pseudo#1234');
      return;
    }
    if (await run(toast, () => sendFriendRequestByTag(query), 'Demande envoyée')) setQuery('');
  };

  const confirmRemove = (user) => {
    if (window.confirm(`Supprimer ${user.pseudo} de vos amis ?`)) run(toast, () => removeFriend(user.id), 'Ami supprimé');
  };

  const row = (user, actions, sub) => (
    <div key={user.id} className="panel flex items-center gap-4 p-4">
      <button onClick={() => go({ name: 'profile', userId: user.id })} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <Avatar user={user} size="md" showStatus />
        <span className="min-w-0">
          <span className="block truncate font-bold" style={nameStyle(user)}>{fullName(user)}</span>
          <span className="block text-xs text-slate-500">{sub}</span>
        </span>
      </button>
      {actions}
    </div>
  );

  return (
    <div className="thin-scroll flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto pb-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <PageBanner icon="users" title="Amis" subtitle="Ajoutez vos amis, répondez aux demandes et discutez avec eux." />

        <section className="panel p-6">
          <h2 className="font-bold">Ajouter un ami</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">Entrez son pseudo et son tag exact, par exemple Lina#4821.</p>
          <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row">
            <input className="field" placeholder="Pseudo#1234" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="submit" className="btn-primary" disabled={!query.trim()}>Envoyer la demande</button>
          </form>
          <ErrorLine>{error}</ErrorLine>
        </section>

        {received.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Demandes en attente ({received.length})</h2>
            {received.map(({ f, user }) =>
              row(user,
                <div key="a" className="flex gap-2">
                  <button className="btn-primary !py-2" onClick={() => run(toast, () => respondFriendRequest(f.id, true), 'Ami ajouté')}>Accepter</button>
                  <button className="btn-ghost !py-2" onClick={() => run(toast, () => respondFriendRequest(f.id, false))}>Refuser</button>
                </div>,
                'souhaite être votre ami')
            )}
          </section>
        )}

        {sent.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Demandes envoyées · {sent.length}</h2>
            {sent.map(({ f, user }) =>
              row(user,
                <button key="c" className="btn-ghost !py-2" onClick={() => run(toast, () => respondFriendRequest(f.id, false), 'Demande annulée')}>Annuler</button>,
                'en attente')
            )}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Mes amis ({friends.length})</h2>
          {friends.length === 0 && <p className="text-sm text-slate-500">Vous n’avez pas encore d’amis. Explorez les espaces et faites de nouvelles rencontres !</p>}
          {friends.map((u) =>
            row(u,
              <div key="b" className="flex gap-1">
                <button title="Envoyer un message" onClick={() => go({ name: 'messages', withId: u.id })} className="rounded-2xl p-2.5 text-slate-600 hover:bg-slate-300">
                  <Icon name="chat" className="h-5 w-5" />
                </button>
                <button title="Supprimer l’ami" onClick={() => confirmRemove(u)} className="rounded-2xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Icon name="trash" className="h-5 w-5" />
                </button>
              </div>,
              statusLabel(u))
          )}
        </section>
      </div>
    </div>
  );
}
