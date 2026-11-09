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
    <div className={`panel flex flex-col gap-2 p-4 md:gap-3 md:p-6 ${highlight ? 'ring-2 ring-brand-300' : ''}`}>
      <div className="flex items-center justify-between">
        <p className="font-bold text-slate-900">{title}</p>
        {highlight && <span className="pill !bg-brand-100 !px-3 !py-1 !text-xs !font-bold !text-brand-700">Économie</span>}
      </div>
      <p className="flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{price}</span>
        <span className="text-xs font-semibold text-slate-500 md:text-sm">{unit}</span>
      </p>
      <p className="text-xs text-slate-600 md:text-sm">{note}</p>
    </div>
  );
}

export default function PlusView() {
  const s = useStore();
  const me = getMe(s);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden md:gap-6">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-3 md:gap-6">
        <section className="panel p-5 md:p-10">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <PlusBadge className="!h-7 !w-7" />
              <span className="text-sm font-bold uppercase tracking-widest text-brand-600">Feathery PLUS</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-4xl">Allez plus loin sur Feathery</h1>
            <p className="max-w-xl text-sm text-slate-600 md:text-base">Soutenez l’application et personnalisez votre profil comme vos espaces.</p>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:gap-4">
          <PriceCard title="Mensuel" price="0,99 €" unit="par mois" note="Sans engagement, résiliable à tout moment." />
          <PriceCard title="Annuel" price="10,99 €" unit="par an" note="Soit 0,92 € par mois, une réduction sur l’abonnement mensuel." highlight />
        </section>

        <section className="panel p-4 md:p-8">
          <h2 className="mb-3 font-bold text-slate-900 md:mb-4">Ce que vous obtenez</h2>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 text-xs text-slate-700 md:gap-3 md:text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Icon name="check" className="h-3 w-3" />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-6">
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
