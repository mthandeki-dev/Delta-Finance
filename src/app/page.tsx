import { redirect } from 'next/navigation';
import { LoginCard } from '@/components/LoginCard';
import { Logo } from '@/components/Logo';
import { PaymentSimulation } from '@/components/PaymentSimulation';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const QUESTIONS = [
  {
    q: 'What is the agent allowed to do?',
    a: 'You set a daily budget and a per-payment cap in RLUSD. Everything outside those bounds is refused — automatically.',
  },
  {
    q: 'Who can it pay?',
    a: 'Only suppliers, payroll recipients, and subscriptions you have explicitly whitelisted. No surprises.',
  },
  {
    q: 'How do I stop it instantly?',
    a: 'One switch pauses the agent. Its Privy wallet stops signing within seconds.',
  },
  {
    q: 'How do I audit every decision?',
    a: 'Every step is logged — the reason, the amount, and the XRPL transaction hash. Full traceability.',
  },
];

export default async function Home() {
  const user = await getSessionUser().catch(() => null);
  if (user) redirect('/dashboard');

  return (
    <main
      id="main"
      className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 overflow-hidden"
    >
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute -top-40 left-1/3 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-[0.14] blur-3xl"
          style={{ background: 'radial-gradient(circle, #00F2FE 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-2/3 right-[-8rem] h-80 w-80 rounded-full opacity-[0.1] blur-3xl"
          style={{ background: 'radial-gradient(circle, #4FACFE 0%, transparent 70%)' }}
        />
      </div>

      <header className="flex items-center justify-between">
        <Logo />
        <span className="badge border-df-yellow text-df-yellow">XRPL Testnet</span>
      </header>

      <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.3fr_1fr]">
        <section>
          <p className="eyebrow">Autonomous treasury for modern businesses</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Your business delegates.{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%)' }}
            >
              Your controls decide.
            </span>{' '}
            XRPL settles.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-neutral-400">
            The governed voice-first financial agent orchestrating suppliers, subscriptions, and cross-border payroll in seconds.
          </p>

          <div className="mt-8">
            <PaymentSimulation />
          </div>

          <dl className="mt-8 grid gap-3 sm:grid-cols-2">
            {QUESTIONS.map((x) => (
              <div
                key={x.q}
                className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <div
                  className="absolute left-0 top-0 h-full w-[2px]"
                  style={{ background: 'linear-gradient(to bottom, #00F2FE80, #4FACFE80)' }}
                  aria-hidden
                />
                <dt className="pl-3 text-sm font-semibold text-white">{x.q}</dt>
                <dd className="pl-3 mt-1 text-xs text-neutral-400">{x.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="relative flex justify-center lg:justify-end">
          <div className="relative">
            {/* Ambient glow above card */}
            <div
              className="pointer-events-none absolute left-1/2 top-0 h-24 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-2xl"
              style={{ background: 'linear-gradient(135deg, #00F2FE, #4FACFE)' }}
              aria-hidden
            />
            {/* Electric gradient border ring */}
            <div
              className="pointer-events-none absolute rounded-xl"
              style={{ inset: '-1px', background: 'linear-gradient(135deg, rgba(0,242,254,0.38) 0%, rgba(79,172,254,0.32) 60%, rgba(0,0,0,0.08) 100%)', zIndex: 0 }}
              aria-hidden
            />
            <div className="relative" style={{ zIndex: 1 }}>
              <LoginCard />
            </div>
          </div>
        </div>
      </div>

      <footer className="hint border-t border-df-line pt-4 text-xs">
        Agent wallet by Privy · Settlement through the t54 x402 facilitator · Human approvals with Xaman · Testnet funds have no value
      </footer>
    </main>
  );
}
