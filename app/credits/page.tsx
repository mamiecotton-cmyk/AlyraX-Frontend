'use client';
import { useRouter } from 'next/navigation';

const CREDIT_PACKS = [
  {
    label: 'Starter',
    price: '$10',
    credits: '$10',
    bonus: null,
    solo_mins: '5 min',
    couples_mins: '3.3 min',
    priceId: 'price_starter',
  },
  {
    label: 'Popular',
    price: '$25',
    credits: '$25',
    bonus: null,
    solo_mins: '12.5 min',
    couples_mins: '8.4 min',
    priceId: 'price_popular',
  },
  {
    label: 'Value',
    price: '$50',
    credits: '$60',
    bonus: '+$10 free',
    solo_mins: '30 min',
    couples_mins: '20 min',
    priceId: 'price_value',
    badge: '⭐ Best Value',
  },
  {
    label: 'Power',
    price: '$100',
    credits: '$125',
    bonus: '+$25 free',
    solo_mins: '62.5 min',
    couples_mins: '41.7 min',
    priceId: 'price_power',
  },
  {
    label: 'Whale',
    price: '$250',
    credits: '$325',
    bonus: '+$75 free',
    solo_mins: '163 min',
    couples_mins: '108 min',
    priceId: 'price_whale',
    badge: '👑',
  },
];

export default function CreditsPage() {
  const router = useRouter();

  const handlePurchase = async (priceId: string) => {
    // Stripe checkout — we'll wire this up in Sprint 3
    alert('Payment coming soon! Sprint 3.');
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-500 hover:text-white transition text-sm"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-red-600 tracking-tighter">Add Credits</h1>
        </div>

        {/* Rate info */}
        <div className="bg-zinc-900/50 border border-gray-800 rounded-xl p-4 mb-6">
          <p className="text-xs uppercase text-gray-500 tracking-widest mb-2">Rates</p>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Solo calls</span>
            <span className="text-white font-bold">$1.99/min</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">Couples calls</span>
            <span className="text-white font-bold">$2.99/min</span>
          </div>
        </div>

        {/* Credit packs */}
        <div className="flex flex-col gap-3">
          {CREDIT_PACKS.map(pack => (
            <button
              key={pack.label}
              onClick={() => handlePurchase(pack.priceId)}
              className="w-full text-left border border-gray-700 hover:border-red-500 rounded-xl p-4 transition group"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-lg">{pack.label}</span>
                    {pack.badge && (
                      <span className="text-xs text-yellow-500 border border-yellow-500/30 rounded-full px-2 py-0.5">
                        {pack.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm">
                    Solo: {pack.solo_mins} · Couples: {pack.couples_mins}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold group-hover:text-red-500 transition">
                    {pack.price}
                  </p>
                  {pack.bonus && (
                    <p className="text-xs text-green-400">{pack.bonus}</p>
                  )}
                  {!pack.bonus && (
                    <p className="text-xs text-gray-600">{pack.credits} credits</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* All access subscription */}
        <div className="mt-6 border border-yellow-500/30 rounded-xl p-4 bg-yellow-950/10">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="font-bold">All-Access Pass</p>
              <p className="text-xs text-gray-500 mt-0.5">All personas + all scenario packs</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-yellow-500">$19.99</p>
              <p className="text-xs text-gray-600">/month</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Credits still purchased separately. Unlocks everything else.
          </p>
          <button
            onClick={() => alert('Subscription coming in Sprint 3!')}
            className="w-full bg-yellow-600 text-black py-2 rounded-xl text-sm font-bold hover:bg-yellow-500 transition"
          >
            Subscribe — $19.99/month
          </button>
        </div>

        <p className="text-center text-xs text-gray-700 mt-6 uppercase tracking-widest">
          Discreet Billing: AA Technical Services
        </p>
      </div>
    </main>
  );
}