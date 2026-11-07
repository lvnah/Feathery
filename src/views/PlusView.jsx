import { getMe } from '../lib/store';
import { useStore, Icon } from '../components/ui';
import PlusBadge from '../components/PlusBadge';

// Avantages et tarifs de Feathery PLUS.
const BENEFITS = [
  'Badge PLUS sur votre profil, vos messages et la liste des membres',
  'Changer votre tag #1234 à votre guise',
  'Code d’invitation personnalisé pour vos espaces',
  'Photo de profil et bannière de profil animées (GIF)',
  'Bannière animée pour vos espaces',
  'Couleurs de pseudo arc-en-ciel, exclusives aux membres PLUS',
  'Jusqu’à 5 espaces créés (3 pour les membres classiques)',
];

function PriceCard({ title, price, unit, note, highlight = false }) {
  return (
    <div className={`panel flex flex-col gap-3 p-6 ${highlight ? 'ring-2 ring-brand-300' : ''}`}>
      <div className="flex items-center justify-between">
        <p className="font-bold text-slate-900">{title}</p>
        {highlight && <span className="pill !bg-brand-100 !px-3 !py-1 !text-xs !font-bold !text-brand-700">Économie</span>}
      </div>
      <p className="flex items-baseline gap-2">
        <span className="text-4xl font-extrabold tracking-tight text-slate-900">{price}</span>
        <span className="text-sm font-semibold text-slate-500">{unit}</span>
      </p>
      <p className="text-sm text-slate-600">{note}</p>
    </div>
  );
}

export default function PlusView() {
  const s = useStore();
  const me = getMe(s);
  return (
    <div className="thin-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto pb-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <section className="panel p-8 md:p-10">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <PlusBadge className="!h-7 !w-7" />
              <span className="text-sm font-bold uppercase tracking-widest text-brand-600">Feathery PLUS</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Allez plus loin sur Feathery</h1>
            <p className="max-w-xl text-slate-600">Soutenez l’application et personnalisez votre profil comme vos espaces.</p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <PriceCard title="Mensuel" price="0,99 €" unit="par mois" note="Sans engagement, résiliable à tout moment." />
          <PriceCard title="Annuel" price="10,99 €" unit="par an" note="Soit 0,92 € par mois, une réduction sur l’abonnement mensuel." highlight />
        </section>

        <section className="panel p-6 md:p-8">
          <h2 className="mb-4 font-bold text-slate-900">Ce que vous obtenez</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm text-slate-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Icon name="check" className="h-3 w-3" />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
          {me.is_plus ? (
            <p className="font-bold text-brand-700">Vous êtes déjà membre PLUS. Merci pour votre soutien !</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">Le paiement en ligne n’est pas encore disponible.</p>
              <button type="button" disabled className="btn-primary self-start md:self-auto">Bientôt disponible</button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
