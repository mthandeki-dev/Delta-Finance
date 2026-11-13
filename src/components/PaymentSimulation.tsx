export function PaymentSimulation() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/60 backdrop-blur-sm">
      {/* Terminal chrome */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" aria-hidden />
        <span className="ml-3 font-mono text-xs text-neutral-600">delta-agent · live</span>
      </div>

      {/* Animation stage — fixed height so the loop never causes layout shift */}
      <div className="relative h-[172px] overflow-hidden px-5 py-4 font-mono text-sm">

        {/* Natural-language prompt */}
        <div className="sim-prompt flex items-center gap-2 opacity-0">
          <span className="select-none text-df-cyan/50">❯</span>
          <span className="text-white">Pay Gogo&apos;s flour supplier R450</span>
          <span className="sim-cursor text-df-cyan" aria-hidden />
        </div>

        {/* Policy checks */}
        <div className="mt-3 space-y-1.5 pl-5">
          <div className="sim-check-1 flex items-center gap-2 text-xs opacity-0">
            <span className="text-green-400">✓</span>
            <span className="text-neutral-400">
              Vendor <span className="text-white">Gogo&apos;s Flour Mill</span> approved
            </span>
          </div>
          <div className="sim-check-2 flex items-center gap-2 text-xs opacity-0">
            <span className="text-green-400">✓</span>
            <span className="text-neutral-400">
              Within daily limit — <span className="text-white">R2,840 remaining</span>
            </span>
          </div>
          <div className="sim-check-3 flex items-center gap-2 text-xs opacity-0">
            <span className="text-green-400">✓</span>
            <span className="text-neutral-400">
              Per-tx cap clear — <span className="text-white">R500 ceiling</span>
            </span>
          </div>
        </div>

        {/* On-ledger settlement card */}
        <div className="sim-settle mt-4 rounded-lg border border-green-500/30 bg-green-500/[0.07] px-4 py-3 opacity-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-400/20 text-green-400 text-xs" aria-hidden>✓</span>
              <span className="text-sm font-semibold text-white">Settled on XRPL</span>
            </div>
            <span className="font-mono text-xs text-green-400">0.3s</span>
          </div>
          <p className="mt-1 font-mono text-xs text-neutral-500">
            tx: rGHk…3fQp · 450 RLUSD · Testnet
          </p>
        </div>
      </div>
    </div>
  );
}
