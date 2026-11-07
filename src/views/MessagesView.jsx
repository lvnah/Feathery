import { useEffect, useRef, useState } from 'react';
import { acceptDM, friendsOf, friendshipBetween, getMe, getUser, markDmRead, refuseDM, respondFriendRequest, sendDM, sendFriendRequest, unreadCount } from '../lib/store';
import { useStore, useUI, Avatar, CountBadge, EmptyState, ErrorLine, Icon } from '../components/ui';
import { formatStamp, isOnline, statusLabel, statusColor, nameStyle } from '../lib/util';
import PlusBadge from '../components/PlusBadge';
import { run } from './ServerView';
import PageBanner from '../components/PageBanner';

// Messages privés. Une personne qui n'est pas amie peut écrire : cela crée une demande de message.
export default function MessagesView({ withId }) {
  const s = useStore();
  const { go, toast, openUser } = useUI();
  const me = getMe(s);
  const unread = unreadCount(s);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef(null);

  const partnerIds = new Set([
    ...friendsOf(s, me.id).map((u) => u.id),
    ...s.dms.flatMap((d) => [d.from, d.to]).filter((id) => id !== me.id),
  ]);
  const lastDmWith = (id) => s.dms.filter((d) => (d.from === me.id && d.to === id) || (d.from === id && d.to === me.id)).at(-1);
  const conversations = [...partnerIds]
    .map((id) => getUser(s, id))
    .filter(Boolean)
    .map((u) => ({ user: u, last: lastDmWith(u.id) }))
    .sort((a, b) => (b.last?.created_at || 0) - (a.last?.created_at || 0) || a.user.pseudo.localeCompare(b.user.pseudo));

  const requests = unread.requests.map((id) => getUser(s, id)).filter(Boolean);
  const partner = withId ? getUser(s, withId) : null;
  const thread = partner
    ? s.dms.filter((d) => (d.from === me.id && d.to === partner.id) || (d.from === partner.id && d.to === me.id)).sort((a, b) => a.created_at - b.created_at)
    : [];
  // Une demande reçue de ce contact : il attend ma réponse.
  const incomingRequest = partner && unread.requests.includes(partner.id);
  const outgoingRequest = partner && thread.some((d) => d.from === me.id && d.status === 'request') && !incomingRequest;
  const hasRequestOnly = partner && thread.length > 0 && thread.every((d) => d.status === 'request');

  // Marquer la conversation comme lue quand on la regarde et qu'elle a des messages non lus.
  const unreadHere = partner ? unread.dms[partner.id] || 0 : 0;
  useEffect(() => {
    if (partner && unreadHere > 0) markDmRead(partner.id).catch(() => {});
  }, [partner?.id, unreadHere]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [thread.length, withId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!partner || !text.trim()) return;
    setError('');
    const content = text;
    setText('');
    try {
      await sendDM(partner.id, content);
    } catch (err) {
      setText(content);
      setError(err.message);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <PageBanner compact icon="message" title="Messages privés" subtitle={`${conversations.length} conversation(s)`} />
    <div className="flex min-h-0 min-w-0 flex-1 gap-4">
      <aside className={`panel thin-scroll w-full flex-col overflow-y-auto p-5 md:flex md:w-80 md:shrink-0 ${withId ? 'hidden' : 'flex'}`}>
        <h2 className="px-2 pb-4 text-xl font-extrabold">Messages privés</h2>

        {requests.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            <p className="px-2 text-[11px] font-bold uppercase tracking-widest text-brand-600">Demandes de messages</p>
            {requests.map((u) => (
              <button key={u.id} onClick={() => go({ name: 'messages', withId: u.id })} className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-3 text-left">
                <Avatar user={u} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{u.pseudo}</span>
                <CountBadge n={unread.dms[u.id] ? 1 : 0} />
              </button>
            ))}
          </div>
        )}

        {conversations.length === 0 && requests.length === 0 && <p className="px-2 text-sm text-slate-500">Aucune conversation active.</p>}
        <div className="flex flex-col gap-1">
          {conversations.map(({ user, last }) => (
            <div key={user.id} role="button" tabIndex={0} onClick={() => go({ name: 'messages', withId: user.id })} className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-slate-200 ${withId === user.id ? 'bg-brand-50' : ''}`}>
              <button type="button" onClick={(e) => { e.stopPropagation(); openUser(user.id); }} className="shrink-0 rounded-full" aria-label={`Profil de ${user.pseudo}`}>
                <Avatar user={user} size="md" showStatus />
              </button>
              <span className="min-w-0 flex-1">
                <span onClick={(e) => { e.stopPropagation(); openUser(user.id); }} className="inline-block max-w-full truncate font-bold hover:underline" style={nameStyle(user)}>{user.pseudo}</span>
                <span className="block truncate text-xs text-slate-500">{last ? last.content : statusLabel(user)}</span>
              </span>
              <CountBadge n={unread.dms[user.id] || 0} />
            </div>
          ))}
        </div>
      </aside>

      <section className={`panel min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${withId ? 'flex' : 'hidden md:flex'}`}>
        {partner ? (
          <>
            <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
              <button onClick={() => go({ name: 'messages' })} className="rounded-xl p-2 hover:bg-slate-300 md:hidden" aria-label="Retour">
                <Icon name="back" className="h-5 w-5" />
              </button>
              <button onClick={() => go({ name: 'profile', userId: partner.id })} className="flex min-w-0 items-center gap-3 text-left">
                <Avatar user={partner} size="sm" showStatus />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-bold"><span className="truncate" style={nameStyle(partner)}>{partner.pseudo}</span>{partner.is_plus ? <PlusBadge /> : null}</span>
                  <span className="block text-xs text-slate-500"><span style={{ color: statusColor(partner) }}>{statusLabel(partner)}</span></span>
                </span>
              </button>
              {partner && (() => {
                const fr = friendshipBetween(s, me.id, partner.id);
                if (fr?.status === 'accepted') return null;
                return (
                  <div className="ml-auto flex shrink-0 gap-2">
                    {!fr && <button className="btn-primary !py-2" onClick={() => run(toast, () => sendFriendRequest(partner.id), 'Demande d’ami envoyée')}>Demander en ami</button>}
                    {fr?.status === 'pending' && fr.from === me.id && <button className="btn-ghost !py-2" disabled>Demande d’ami envoyée</button>}
                    {fr?.status === 'pending' && fr.to === me.id && (
                      <>
                        <button className="btn-ghost !py-2" onClick={() => run(toast, () => respondFriendRequest(fr.id, false))}>Refuser</button>
                        <button className="btn-primary !py-2" onClick={() => run(toast, () => respondFriendRequest(fr.id, true), 'Ami ajouté')}>Accepter la demande d’ami</button>
                      </>
                    )}
                  </div>
                );
              })()}
            </header>

            {incomingRequest && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-brand-50 px-5 py-3">
                <p className="text-sm font-semibold text-brand-800">{partner.pseudo} souhaite vous écrire. Acceptez pour voir la conversation.</p>
                <div className="flex gap-2">
                  <button className="btn-ghost !py-2" onClick={() => run(toast, () => refuseDM(partner.id))}>Refuser</button>
                  <button className="btn-primary !py-2" onClick={() => run(toast, () => acceptDM(partner.id))}>Accepter</button>
                </div>
              </div>
            )}
            {outgoingRequest && (
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm text-slate-600">
                Demande de message envoyée. {partner.pseudo} doit l’accepter pour répondre.
              </div>
            )}

            <div ref={listRef} className="thin-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
              {thread.length === 0 && <p className="m-auto text-sm text-slate-500">Écrivez à {partner.pseudo} pour commencer.</p>}
              {thread.map((d) => {
                const author = d.from === me.id ? me : partner;
                return (
                  <div key={d.id} className="flex items-center gap-4 rounded-3xl border border-slate-100 bg-surface px-5 py-4 shadow-soft">
                    <button type="button" onClick={() => openUser(author.id)} className="shrink-0 rounded-full" aria-label={`Profil de ${author.pseudo}`}>
                      <Avatar user={author} size="md" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span onClick={() => openUser(author.id)} className="cursor-pointer font-bold text-slate-900 hover:underline" style={nameStyle(author)}>{author.pseudo}</span>
                        {author.is_plus ? <PlusBadge /> : null}
                        {d.status === 'request' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">En attente</span>}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{d.content}</p>
                    </div>
                    <span className="hidden shrink-0 text-xs text-slate-400 sm:block">{formatStamp(d.created_at)}</span>
                  </div>
                );
              })}
            </div>

            {!incomingRequest && (
              <form onSubmit={submit} className="border-t border-slate-100 p-4">
                <div className="flex items-center gap-3">
                  <input className="field !rounded-2xl !bg-slate-100 !py-3.5" placeholder={hasRequestOnly || !thread.length ? `Écrire à ${partner.pseudo} (demande de message)` : `Envoyer un message à ${partner.pseudo}...`} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
                  <button type="submit" disabled={!text.trim()} aria-label="Envoyer" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-40">
                    <Icon name="send" className="h-5 w-5" />
                  </button>
                </div>
                <ErrorLine>{error}</ErrorLine>
              </form>
            )}
          </>
        ) : (
          <EmptyState icon="message" title="Sélectionnez une conversation">Vos messages privés apparaîtront ici.</EmptyState>
        )}
      </section>
    </div>
    </div>
  );
}
