# Delta Finance — Netlify deployment

This package is prepared to be committed to a Git repository **with `package.json` and `netlify.toml` at its root**. It is a server-rendered Next.js 15 app with API routes and PostgreSQL; it is **not** an uploadable static `index.html` site.

## 1. Deploy the repository

1. Extract the ZIP and push the **contents** (not the enclosing ZIP) to the root of your GitHub repository. The top of the repo should show `package.json`, `netlify.toml`, `next.config.mjs`, `prisma/`, and `src/`.
2. Netlify: **Add new project → Import an existing project**; connect the repository. If modifying an existing site, use **Project configuration → Build & deploy / Continuous deployment** to connect it and check the configured values. If the repo contains a `delta-finance/` directory rather than root-level project files, set the **Base directory** to `delta-finance` and keep the build/publish settings relative to that directory.
3. Build command: `npm run build`. Publish directory: `.next`. Node.js: 22. Let Netlify use its auto-installed Next.js/OpenNext adapter. **Do not add a generic `/* /index.html 200` redirect**, and do not publish `public/`, repo root, or `out/`.
4. After configuring secrets below, select **Deploys → Trigger deploy → Clear cache and deploy site**. View the build log and confirm both `next build` and Netlify's Next.js adapter ran.

Netlify Drop can recognize some Next.js source projects and run builds in its signed-in workflow, but manual drag-and-drop of unbuilt source files is not a substitute for a correctly configured Git build, especially for server-side API routes.

## 2. Configure site secrets and addresses

Netlify **Project configuration → Environment variables**; for each value include the **Functions/runtime scope** (and Builds too where relevant). **Do not commit real secrets or put them in `netlify.toml`.**

Required for the app and API flow:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL for an accessible hosted Postgres database (e.g. Neon/Supabase/RDS). Do not use `localhost`. |
| `SESSION_SECRET` | Random secret with 32+ characters. |
| `AGENT_API_KEY` | Different long random API key. |
| `APP_URL` | The site's public `https://YOUR-SITE.netlify.app` or custom domain. |
| `INTERNAL_URL` | The **same reachable public HTTPS site URL** on Netlify. `http://127.0.0.1:3000` is for the Docker server and will fail in a Netlify function. |
| `XAMAN_API_KEY` and `XAMAN_API_SECRET` | Xaman developer app credentials. |
| `PRIVY_APP_ID` and `PRIVY_APP_SECRET` | Privy credentials for testnet wallet. |
| `ADMIN_XRPL_ADDRESSES` | Comma-separated authorized XRPL Testnet addresses. |

Optional: `ANTHROPIC_API_KEY` (the app has a deterministic fallback), `ALLOW_REDTEAM_DEMO` (use only on a private testnet demo), `DISPLAY_FX_RATE`, and the Testnet t54/XRPL override variables in `.env.example`.

`DIRECT_URL` is **not** used in this codebase. The build command runs `prisma generate && next build` and **does not** run `prisma db push`.

## 3. Initialize the database — one time, separately

This archive contains a Prisma schema but no migration files. Create an empty hosted PostgreSQL database, then from a trusted local terminal with the source directory and the `DATABASE_URL` configured, execute:

```sh
npm install
npx prisma db push
```

Do not run an unreviewed schema push against a production database containing valuable data. On an established database, review changes and use formal migrations. Netlify runs the frontend/API functions; it does not host PostgreSQL for this project.

## 4. Verify the deployed site

1. Open `https://YOUR-SITE.netlify.app/`. You should see the Delta Finance login page (even before the database/Xaman flow is fully configured).
2. Open `https://YOUR-SITE.netlify.app/api/health`: a healthy database responds `{ "status": "ok" }`; `503` with `database: "unreachable"` means app routing works but the database needs attention.
3. Sign in using Xaman on the XRP Ledger **Testnet**; then check the dashboard and API function logs.
4. If `/` still returns a Netlify-branded 404 after a successful build, inspect the publish directory and Next.js adapter section of the deploy log, not just the overall **Published** badge.

## Runtime caveats and verification status

- The Next.js Netlify adapter supports server-side routes, but **the app's treasury/payment path was originally designed for a single persistent Docker process**. Its in-memory payment queue and concurrent-spend handling are not inherently safe across multiple serverless invocations. Do not treat this package as production-ready for financial settlement without refactoring that portion to use database-backed locks/transactions, reviewing the external wallet APIs, and performing a security audit.
- Xaman, Privy, t54, Postgres and XRPL service integrations have not been tested against live accounts.
- We could structurally check the deployment configuration and code changes, but could not run `npm install` or `next build` in the preparation environment because npm registry networking was unavailable. Review Netlify's actual build log after deploying.
