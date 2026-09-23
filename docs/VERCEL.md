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

Check the actual app at `http://127.0.0.1:5180`. Independent review must cover the tested source commit, real-source ranking evidence and desktop/mobile implementation. Deployment derives `EMBER10_REVISION` from the clean tested checkout and records it as source metadata. It remains an environment marker, not server-code attestation. Publish a candidate before moving the alias:

```sh
vercel deploy --prod --skip-domain --yes --env EMBER10_REVISION=<verified-git-HEAD> --meta sourceRevision=<verified-git-HEAD> --build-env PUBLIC_SITE_URL=https://ember5-pilot.vercel.app
node scripts/verify-public.mjs https://ember5-pilot.vercel.app <tested-commit> <proof-output.json>
node scripts/verify-sharing.mjs https://ember5-pilot.vercel.app https://ember5-pilot.vercel.app <sharing-proof.json>
```

The deployed `/api/status` and `/api/overview` expose this revision. A successful local build, echoed revision or Vercel READY result alone is not verification of the public issue. Byte-compare index HTML and all build assets with `scripts/audit-public.mjs`, inspect the exact candidate, then promote the alias and repeat public checks. No cryptographic server-artifact attestation is claimed. Record public HTTP checks and screenshots after the alias points to the new deployment.

For a separately hosted real ledger, the existing server-only `EMBER5_API_ORIGIN` remains compatible. The adapter checks the backend's mode and rejects demo/test status. A failed configured backend returns an error, never synthetic fallback. The external ledger still requires its own PostgreSQL service and durable Node worker; this deployment does not activate either.

Secrets, local databases, runtime keys, logs and Vercel account metadata are excluded from Git and deployment uploads. Tests remain in build inputs because existing development scripts import isolated fixtures during type checking; the production function's dependency graph does not import them. Supplied design references and dated snapshots are review inputs outside the application.

Current deployment IDs, exact runtime revision and verification results are committed in `docs/deployment.json` and `docs/evidence/r2`. Earlier adjacent review directories are historical work products, not required auditor inputs.

The subsequent warm-light correction evidence is kept separately in `EMBER10-light-review` so the prior verified deployment evidence remains intact. `PUBLIC_SITE_URL` is a build-time setting for canonical and static sharing metadata; it does not configure a project mint or financial backend. The committed share image must be reachable with an image MIME type. Verify the initial response without JavaScript, inspect the card visually and keep social-network cache refresh claims separate from these checks.
