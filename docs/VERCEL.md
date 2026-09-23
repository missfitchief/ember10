# Vercel dashboard deployment

Project: `plavi/ember5-pilot`. Production dashboard: **https://ember5-pilot.vercel.app**. This is a regular authenticated account deployment; no temporary claim is required.

The Vercel project hosts the React dashboard and a read-only function. By default it serves a **recorded synthetic demo**, captured from the separate PostgreSQL demo ledger by `node scripts/prepare-hosted-demo.mjs`. It does not run the financial worker, sign, broadcast, or invent new ledger activity. The visible banner and status endpoint identify this explicitly. Wallet lookup and JSON/CSV exports use the original public records.

`vercel.json` builds `dist/web` and routes `/api/*` into the single public function. `.vercelignore` excludes local databases, test keys, environment files, logs and dependencies from source upload. No operator route is exposed.

```sh
npm run build
npm test -- tests/hosted.test.ts
npx vercel@59.25.4 deploy --prod --yes
```

Vercel CLI 59.25.4 supports a temporary deployment without account login. Use the returned claim link to move it into your Vercel account before its stated expiry. For an authenticated permanent deployment, use `vercel login` followed by `vercel deploy --prod`.

To connect the real public API later, set the server-side `EMBER5_API_ORIGIN` to its HTTPS origin. Only approved GET endpoints are forwarded; no caller cookies, authorization headers, operator routes or arbitrary URLs are accepted. If that configured backend fails, the function returns an unavailable error rather than substituting demo values.

The settlement service still requires PostgreSQL and a persistent Node worker on its own host. Vercel request handlers do not become the authoritative ledger. See `RUNBOOK.md` and `READINESS.md` for the separate funded-pilot requirements. Publishing this dashboard does not enable mainnet execution.

Primary deployment references checked 23 September 2026: https://vercel.com/docs/frameworks/frontend/vite and https://vercel.com/docs/functions/runtimes/node-js. Temporary deployment support was verified in the installed CLI's `deploy --help` output.
