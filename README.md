# Delta Finance

**Supplier payments on autopilot, with limits your CFO controls.**
An AI agent pays approved suppliers in RLUSD on the XRP Ledger. Routine payments run on their own; large payments and all payroll wait for a human signature; anything outside the mandate is refused by infrastructure the agent cannot reach.

Built for the Node Engine Hackathon 2026, Agentic Finance track (Ripple). XRPL **Testnet**.

---

## The problem and who it is for

A small importer in Johannesburg or Cape Town paying suppliers in Lagos, Nairobi or Accra waits days for a SWIFT transfer and loses margin on FX and fees. RLUSD on the XRP Ledger settles in seconds, but a finance lead will not hand a wallet to an AI agent until four questions are answered. Delta Finance is organised around them:

| The CFO asks | Delta Finance answers |
| --- | --- |
| What is the agent allowed to do? | A daily budget and a per-payment cap in RLUSD, set in the dashboard. |
| Who can it pay? | Only whitelisted vendor addresses. Not even an administrator can approve a payment to another address. |
| How do I stop it? | One "Stop the agent" switch. It also rewrites the wallet policy so the wallet refuses to sign. |
| How do I prove what it did and why? | An append-only audit trail (instruction, decision, reason, enforcing layer, ledger hash) with CSV export. |

**First customer:** cross-border SMEs with repeat supplier payments (payables autopilot). **Why they would switch:** same-day settlement and no prefunded foreign accounts, without giving up the approval controls their bank portal gives them. **Go-to-market:** accountants and bookkeeping firms that already run payables for many SMEs. These are working assumptions for the pitch and still need validating with real users; the numbers behind them are yours to add.

---

## How it meets the MVP checklist

| Requirement | Where |
| --- | --- |
| An autonomous transaction on XRPL Testnet | **Path A**: the agent's Privy wallet signs an RLUSD `Payment`; the t54 x402 facilitator verifies and settles it. |
| Limits enforced where the agent has no control | **Privy's policy engine** holds the whitelist and per-payment cap and evaluates every signing request. **t54's facilitator** checks destination, amount and invoice binding before settlement. |
| A human can set or change limits, outside the agent | Admin dashboard (Xaman sign-in). Each change is written to Postgres and mirrored to the Privy policy. |
| A demo where the agent gets blocked | **Path C**, plus a **stress test** that skips Delta Finance's own checks and shows Privy refusing to sign on its own. |

### The three paths

```
instruction ─▶ LLM ─▶ strict JSON ─▶ grounding ─▶ ROUTER (deterministic, Postgres mandate)
                                                     │
        ┌────────────────────────────────────────────┼─────────────────────────────────────────┐
   Path A  AUTONOMOUS                         Path B  HITL                               Path C  BLOCKED
   under limits, not payroll                  over a limit, or payroll                   not whitelisted, paused,
        │                                            │                                   bad amount/address
   x402 gateway ─ 402 ─▶ Privy signs          admin + one-time code                      logged with the layer
   ─▶ t54 /verify ─▶ t54 /settle              ─▶ Xaman signature on phone                that refused it
   ─▶ validated on ledger                     ─▶ validated on ledger
```

### Five enforcement layers

| # | Layer | Runs | Checks |
| --- | --- | --- | --- |
| 1 | Instruction check | app | Strict JSON schema. Amount and destination must be traceable to the operator's words (anti-hallucination). |
| 2 | Treasury policy | app | Kill switch, whitelist, per-payment cap, daily budget, payroll rule. |
| 3 | Settlement gateway | app (separate request) | Quotes from the database record, never from the agent; re-checks the mandate; inspects the signed blob. |
| 4 | **Privy wallet policy** | **Privy** | Only RLUSD `Payment`s to whitelisted destinations at or under the cap can be signed. |
| 5 | **t54 facilitator** | **t54** | Exact destination, amount, invoice binding, no partial or cross-currency payments; then submits on-ledger. |

What each external layer can and cannot see: Privy enforces the **whitelist, the per-payment cap and the kill switch**. The **daily budget and the payroll rule** depend on history and intent, so they are enforced by layers 2 and 3 and escalate to a human rather than to Privy. If the Privy mirror ever fails to sync, the router stops autonomous payments and sends everything to a human until it is fixed.

---

## Run it locally

Requirements: Node 20+, Docker (for Postgres), a Xaman app on Testnet, a Privy app, optionally an Anthropic API key.

```bash
cp .env.example .env          # fill in the values described below
docker compose up -d          # Postgres
npm install
npx prisma migrate dev --name init
npm run dev                   # http://localhost:3000
npm test                      # router, intent and secret-code unit tests
```

Environment values you must supply:

- `SESSION_SECRET`, `AGENT_API_KEY`: long random strings (`openssl rand -base64 48`).
- `XAMAN_API_KEY`, `XAMAN_API_SECRET`: create an app at apps.xaman.dev.
- `ADMIN_XRPL_ADDRESSES`: your Xaman **Testnet** address. Others sign in read-only.
- `PRIVY_APP_ID`, `PRIVY_APP_SECRET`: from dashboard.privy.io.
- `ANTHROPIC_API_KEY` (optional): without it the built-in deterministic parser is used.
- `DISPLAY_FX_RATE` (optional): an indicative ZAR-per-USD rate shown next to amounts. Display only.

### First-run checklist

1. Sign in with Xaman (switch Xaman to Testnet first).
2. **Set up agent wallet** in the dashboard: creates the Privy wallet, funds it from the Testnet faucet, opens the RLUSD trust line, attaches the policy.
3. Send test RLUSD to the agent address from **tryrlusd.com**. Your own Xaman account also needs RLUSD and a trust line for approvals.
4. Approve a vendor. The vendor address needs an RLUSD trust line too, or payments fail with `tecPATH_DRY`. A second Xaman account works well.

### Demo script (about three minutes)

1. **Routine** — "Pay *Vendor* 5 RLUSD for invoice 1042" → paid autonomously; open the explorer link.
2. **Over the limit** — "Pay *Vendor* 50 RLUSD…" → appears under *Needs your approval* → generate a code → approve → sign in Xaman.
3. **Unknown recipient** — "Pay 5 RLUSD to r…" → blocked by Treasury policy.
4. **Stress test** — tick *skip Delta Finance's own checks* and repeat step 3 → blocked by **Privy wallet policy**. This is the proof that limits live outside the agent.
5. **Stop the agent** → repeat step 1 → blocked. Then **Export audit trail**.

Machine callers use the same endpoint:

```bash
curl -X POST http://localhost:3000/api/agent \
  -H "x-agent-api-key: $AGENT_API_KEY" -H "content-type: application/json" \
  -d '{"prompt":"Pay Lagos Textiles 5 RLUSD for invoice 1042"}'
# 200 EXECUTED · 202 PENDING_HITL · 403 BLOCKED · 502 FAILED
```

---

## Project layout

```
prisma/schema.prisma            User, TreasuryPolicy, Vendor, SecretCode, AgentWallet, TransactionLog, AuditLog
src/lib/policy/router.ts        the deterministic A/B/C router (pure, unit-tested)
src/lib/policy/intent.ts        JSON schema validation, grounding, deterministic parser (pure, unit-tested)
src/services/xrpl.service.ts    Testnet connection, faucet, TrustSet, RLUSD Payment, ledger confirmation
src/services/privy.service.ts   agent wallet, xrpl_signTransaction, mandate → Privy policy
src/services/t54.service.ts     x402 v2 "exact" scheme: buyer flow + facilitator /verify and /settle
src/services/xaman.service.ts   sign-in and HITL payment payloads
src/services/agent.service.ts   orchestration, wallet setup, policy sync, stress test
src/app/api/agent/route.ts      POST /api/agent — the agent endpoint
src/app/api/x402/settle/[txId]  the x402 settlement gateway
src/app/api/transactions/[id]/  approve (secret code → Xaman), status, reject
src/components/                 dashboard UI
```

## Deploying to AWS

- **ECS Fargate**: `docker build -t delta-finance .` → push to ECR → service behind an ALB. Health check: `/api/health`.
- **RDS PostgreSQL**: set `DATABASE_URL`. Run the `migrator` image target as a one-off task before each deploy.
- **CloudFront** in front of the ALB; cache `/_next/static/*` (it can also be synced to S3 as a second origin). The app uses API routes, so it is not a static export.
- Secrets in **Secrets Manager**, injected as task environment. Set `APP_URL` to the public URL and `INTERNAL_URL` to `http://127.0.0.1:3000`.
- Run **one task** for the demo: the payment queue that keeps the daily budget and XRPL sequence numbers consistent is in-process. For several tasks, move it to a Postgres advisory lock.

## What has and has not been verified

This codebase was written without network access to install packages, so read this before demo day.

- **Verified:** the router, intent validation/grounding and secret-code logic (unit tests pass). All source files parse and type-check against stand-in type stubs.
- **Not yet run:** `npm install`, `next build`, and every live call to Xaman, Privy, t54 and the ledger. Expect to fix a few type or API-shape details on first run.
- **Check first against the live services:**
  - `t54.service.ts`: header names, payload shape and error codes follow t54's published scheme page. The `/verify` and `/settle` request bodies follow the standard x402 v2 facilitator shape, which t54's docs do not spell out. If the facilitator answers with something unexpected, set `X402_DIRECT_SUBMIT_FALLBACK=true` to keep the demo alive (the signed transaction is then submitted directly and logged as `DIRECT_FALLBACK`).
  - `privy.service.ts`: wallet creation, `xrpl_signTransaction` and the policy rule format follow Privy's XRPL docs. The policy create/update/attach endpoints and the exact wording of a policy-denial error are from Privy's general API and should be confirmed.
  - `xaman.service.ts`: `force_network: 'TESTNET'` on payment payloads.
- **Why `x402-xrpl` is not a dependency:** its `x402Fetch` buyer client signs with a local seed wallet. The agent deliberately has no local key (Privy signs remotely), so the x402 handshake is implemented directly against the same wire format and the same t54 facilitator.
- **t54 Claw Credit** (owner-signed mandates) is in invite-only beta. With a team code, it can replace layer 3 with a t54-held mandate; the swap point is `payViaX402` in `t54.service.ts`.

## Security notes

- The agent has no private key and no database credentials of its own; the LLM has no tools.
- Admin keys never touch the server: sign-in and approvals are signed in Xaman.
- Approval codes are single-use, expiring, scrypt-hashed, and locked after five wrong attempts.
- Sessions are HMAC-signed, httpOnly, SameSite=Lax cookies; roles are re-read from the database on every request.
- Never commit `.env`. Testnet funds have no value; a mainnet deployment needs KYB with t54, a compliance review and a security audit.
