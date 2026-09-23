# Backend dependency audit and compatibility review

Reviewed 2026-09-23 against the production dependency audit saved as `outputs/EMBER10-backend-review/dependency-audit-before.json`. Source review: `db041a0` plus execution correction `4adbc75`; dependency lock unchanged during this review. The supplied audit contains 17 affected package entries (10 high, 7 moderate). These include inherited findings along dependency chains, not 17 independent exploits.

## Recommended integration candidates

Retain the current direct Solana, Jupiter and Meteora SDK versions. Test this explicit override set in an isolated dependency tree, then commit the resulting lock only after build, RPC contract tests and the complete regression suite pass:

```json
{
  "overrides": {
    "toml": "4.2.0",
    "jayson": "5.0.0",
    "@solana/spl-token-registry": {
      "cross-fetch": "3.2.0"
    }
  }
}
```

Do not run forced audit remediation. The supplied report's suggestions include web3.js `0.0.3`, SPL Token `0.1.8`, and an older Jupiter parser; these would replace the current SDK contract instead of safely repairing the transitive dependency.

`jayson@5.0.0` is a deliberate major-version override requiring validation, not an assumed semver-compatible update. Its published tarball retains web3.js's exact CommonJS import path, `jayson/lib/client/browser`, and the callback request/response contract. It replaces UUID generation with platform Web Crypto and removes both `uuid` and `stream-json` dependencies. Node >=20 is required, within this project's >=22.12 runtime contract. [Maintainer release](https://github.com/tedeh/jayson/releases/tag/v5.0.0).

Do not independently override `stream-json` to the patched `3.5.0` under Jayson 4: that release is ESM with changed exported paths, while Jayson 4 uses CommonJS `stream-json/streamers/StreamValues` and `stream-json/utils/Verifier`. If Jayson 5 fails the complete integration checks, `jayson -> uuid@11.1.1` is a narrower CommonJS-compatible candidate, but it does not remove the stream-json finding.

## Reachability and residual risk

| Root finding | Installed usage and assessment | Proposed treatment |
| --- | --- | --- |
| `toml@3.0.0` recursion/prototype issues | Anchor's workspace helper parses a local `Anchor.toml` only when its workspace proxy is accessed. EMBER10 imports `Program`/SDK clients and has no workspace or TOML parse call in its API or worker source. No public untrusted-TOML input path was found. | Override to 4.2.0, preserving the CommonJS `parse(Buffer)` call. Node >=20. |
| `uuid@8.3.2` buffer bounds | Web3's Jayson browser client calls `v4()` with no external output buffer. The reported vulnerable API paths are v3/v5/v6, so the inspected RPC ID generator does not reach them. | Jayson 5 removes this dependency. Do not blanket-replace every UUID copy; rpc-websockets already uses 14.0.2. |
| `stream-json@1.x` nested path filter complexity | Jayson 4 server utilities reference streamers/verifier. Web3 imports the browser client, which parses complete JSON responses without stream-json. No application `pick`, `ignore`, `filter`, or `replace` pipeline was found. | Jayson 5 removes this dependency. The advisory distinguishes vulnerable path filters from the streamers. |
| registry `cross-fetch@3.0.6 -> node-fetch@2.6.1` credential-forwarding redirect issue | The transitive Solana registry performs fetches to fixed public token-list URLs without authentication headers. EMBER10 uses the Jupiter instruction program decoder, not registry resolution. API key requests use the application's own bounded fetch adapter. No credential-bearing call through this old registry fetch was found. | Scoped cross-fetch 3.2.0 retains the 3.x API and resolves node-fetch ^2.7.0. |
| `bigint-buffer@1.1.5` native overflow | Still reachable indirectly through SPL token account/mint layout decoding. The inspected u64 paths construct fixed-width Buffer slices; application code does not call the unsafe converter directly. This machine reports the native binding unavailable and uses the JavaScript fallback, but that is not a production-wide guarantee. | No published patched version was available. Retain and disclose the residual finding; require deployment-specific native-binding review or separately reviewed replacement before asserting remediation. |

Source advisories: [TOML recursion](https://github.com/advisories/GHSA-82x6-q7mm-w9cf), [TOML prototype pollution](https://github.com/advisories/GHSA-v5mp-jgw5-2x6j), [UUID bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [stream-json filters](https://github.com/advisories/GHSA-528h-pc64-c93x), [node-fetch redirects](https://github.com/advisories/GHSA-r683-j2x4-v87g), [bigint-buffer](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg).

These are source-based reachability assessments, not proofs that the installed package can never be exploited. The native converter remains a recorded dependency risk. Prelaunch API safety must not be generalized to a future funded worker with a different module graph or native build.

## Evidence gathered without changing installed dependencies

Registry metadata was queried with `npm view`. Published `jayson@5.0.0` and `toml@4.2.0` tarballs were retrieved with `npm pack --ignore-scripts` and unpacked into a separate scratch directory. No install, shared node_modules change, lockfile modification, SDK downgrade, or forced remediation occurred in this review.

On Node v24.17.0, direct isolated-package probes passed:

- Jayson old/new browser-client equivalence: explicit request IDs, generated UUIDv4 IDs, custom ID generator, JSON-RPC notifications, parsed responses, and malformed JSON errors.
- TOML 4.2.0 CommonJS `parse(Buffer)` produced the same result as the installed version for an Anchor-style provider/program document.
- The runtime exposes `globalThis.crypto.randomUUID`, used by Jayson 5.

Tarball integrity values returned by npm:

- Jayson 5.0.0: `sha512-FghxOWlJB5ZPsRsuMF1U4GFHjkJfOEYSlIHpI6Wt6MXIzvqWVo0Kpl7/SMfY36vWggA+b+L09zRGP6m4ROVnKg==`
- TOML 4.2.0: `sha512-TvAJjbHZlYmI323+srtqHQFyJsoWy6mI09ppkuj9+iRsqsVKG9fvTcOP7FHF2UCb0QSYtjEavffrKzdd0XgClg==`

The integrator must record the isolated install's actual `npm audit --omit=dev --json` result, confirm intended versions with `npm ls`, exercise real web3 `Connection` request construction against a mocked transport, and run the complete application suite/build. This document does not claim those upgrades are installed or production-remediated.
