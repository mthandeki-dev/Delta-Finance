import { redirect } from 'next/navigation';
import { LoginCard } from '@/components/LoginCard';
import { Logo } from '@/components/Logo';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const QUESTIONS = [
  { q: 'What is the agent allowed to do?', a: 'You set a daily budget and a per-payment cap in RLUSD.' },
  { q: 'Who can it pay?', a: 'Only suppliers you have approved. Anything else is refused.' },
  { q: 'How do I stop it?', a: 'One switch pauses the agent. Its wallet stops signing immediately.' },
  { q: 'How do I prove what it did?', a: 'Every decision is logged with its reason and its ledger transaction.' },
];

export default async function Home() {
  const user = await getSessionUser().catch(() => null);
  if (user) redirect('/dashboard');

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <span className="badge border-df-yellow text-df-yellow">XRPL Testnet</span>
      </header>

      <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.3fr_1fr]">
        <section>
          <p className="eyebrow">Agentic treasury for cross-border businesses</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Supplier payments on autopilot. <span className="text-df-yellow">Limits your CFO controls.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-neutral-300">
            Delta Finance pays your approved suppliers across Africa in RLUSD on the XRP Ledger. It settles in seconds rather than days. Routine
            payments run on their own; anything large, and all payroll, waits for your signature.
          </p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            {QUESTIONS.map((x) => (
              <div key={x.q} className="border-l-2 border-df-yellow pl-4">
                <dt className="font-semibold text-white">{x.q}</dt>
                <dd className="hint mt-1">{x.a}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="flex justify-center lg:justify-end">
          <LoginCard />
        </div>
      </div>

      <footer className="hint border-t border-df-line pt-4 text-xs">
        Agent wallet by Privy · Settlement through the t54 x402 facilitator · Human approvals with Xaman · Testnet funds have no value
      </footer>
    </main>
  );
}
