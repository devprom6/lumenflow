import { OfframpCard } from '../../components/offramp-card';

export const metadata = {
  title: 'Offramp | LumenFlow',
  description: 'Convert crypto to local bank currency via Stellar SEPs',
};

export default function OfframpPage() {
  return (
    <div className="py-8 px-4 sm:px-6 max-w-6xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Cash Out to Local Currency
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
          Fast, non-custodial fiat offramps powered by Stellar SEP-10, SEP-12, and SEP-24 anchors.
        </p>
      </div>

      <OfframpCard />
    </div>
  );
}
