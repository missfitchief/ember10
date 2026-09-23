# EMBER10 Vercel deployment

Project: `plavi/ember5-pilot`. Public URL: https://ember5-pilot.vercel.app. The existing project and URL are retained.

## Runtime boundary

`vercel.json` builds `dist/web` and rewrites `/api/*` to `api/index.ts`. The normal function reads Ember's actual public catalogue through a bounded, cached server-side adapter. It does not import `deploy/hosted-demo.json`, seed a database, sign, broadcast or run a settlement worker. A failed source produces an unavailable state, or a dated last-good observation while the same instance retains one. A cold instance has no invented substitute.

The source exposes reported USD market caps, not a verified circulating-supply contract. Source-flagged suspect entries and conflicting duplicate valuations remain inspectable but do not receive normal ranks. The entire response is processed before the public API paginates its projection. Public coverage records show unresolved completeness and eligibility limitations.

The public host has no configured project mint, funded epoch or authoritative financial ledger. Those values remain unavailable. Synthetic history stays in the explicitly isolated local demo workflow. The frontend's observed ranking, eligibility and funded-basket views are separate.

## Validation and publication

```sh
npm run build
npm test
npm run preview:hosted
```

Check the actual app at `http://127.0.0.1:5180`. Independent review must cover the tested source commit, real-source ranking evidence and desktop/mobile implementation. Deployment then sets `EMBER10_REVISION` to that exact source commit:

```sh
vercel deploy --prod --yes --env EMBER10_REVISION=<tested-commit>
node scripts/verify-public.mjs https://ember5-pilot.vercel.app <tested-commit> <proof-output.json>
```

The deployed `/api/status` and `/api/overview` expose this revision. A successful local build or Vercel READY result alone is not verification of the public issue. Record public HTTP checks and screenshots after the alias points to the new deployment.

For a separately hosted real ledger, the existing server-only `EMBER5_API_ORIGIN` remains compatible. The adapter checks the backend's mode and rejects demo/test status. A failed configured backend returns an error, never synthetic fallback. The external ledger still requires its own PostgreSQL service and durable Node worker; this deployment does not activate either.

Secrets, local databases, runtime keys, logs and Vercel account metadata are excluded from Git and deployment uploads. Tests remain in build inputs because existing development scripts import isolated fixtures during type checking; the production function's dependency graph does not import them. Supplied design references and dated snapshots are review inputs outside the application.

Exact deployment IDs, final revision and verification results belong to the adjacent `EMBER10-review` evidence directory and `docs/deployment.json`.
