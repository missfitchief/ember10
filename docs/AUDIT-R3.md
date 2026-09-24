# R3 public correction and audit evidence

Scope approved by the owner: public fixes and audit evidence only. Financial code, policy, migrations, OPS/DEV rules and execution remain unchanged. No funded pilot is approved. The supplied R3 audit reviewed ad972e7 and the public runtime ed67a05; its findings are evidence about those revisions, not automatic approval of this correction.

## Public corrections

- N-P1: invalidate and abort pending page requests when an actual parent snapshot replacement or explicit default refresh occurs. A response from an old generation must not overwrite the replacement, even if cancellation is ignored.
- N-P2: successful authorized thumbnails use browser max-age=0, CDN s-maxage=300 and stale-while-revalidate=60. Version3 URLs separate the cache policy from prior entries. Origin authorization still precedes cache/conditional responses and upstream work; error responses remain no-store. CDN hits intentionally bypass origin authorization for up to the cache window. Removal is not immediate revocation, and stale last-good catalogue membership can extend availability during a source outage.
- N-P3: a successful parent observation permits failed avatars to retry, without resetting healthy images. Browser regressions cover recovery after exhausting initial retries.
- N-P5: parent source health and query/page request failures are shown separately; a successful search is not mislabeled as a failed search because the background parent poll failed.
- N-P7: an empty eligible selection is described as such, independently of search text.
- N-P8: final independent review must identify the exact committed runtime bytes. Earlier R2 review hashes describe an earlier intermediate tree and are not an attestation of final R2 or R3 bytes.

These implementation claims require the recorded tests and final deployment evidence. See VERIFICATION.md and deployment.json for completed checks.

## Residual public limitations

N-P4 remains open: cross-instance or later pages can have different observation identities. Mismatched pages are rejected; there is no stable server-side snapshot pagination. The 45-second instance cache is not a guaranteed browsing session.

N-P6 remains open/mitigated: the per-instance16-image work cap can still return503 for distinct concurrent misses. CDN caching reduces repeat work, but cold instances, valid unique URLs and high concurrency can still cause upstream load. No global request coordinator, global Ember rate limit or denial-of-service immunity is claimed. Retry success depends on upstream recovery.

Capacity documentation now distinguishes the runtime64MB/50,000-row bounds from the collector's byte-only bound and single20-second request. At2.6KB/row, byte capacity (~24,600rows) is reached first;80% warnings are logs/coverage notes, not externally delivered alerts.

The cache semantics follow [Vercel's Cache-Control documentation](https://vercel.com/docs/caching/cache-control-headers): s-maxage and stale-while-revalidate are consumed by the CDN. Public latency evidence must include actual x-vercel-cache HIT/MISS results; headers alone do not prove caching. First-miss timing remains dependent on catalogue and image upstreams.

## Corrected financial evidence; no remediation

F-5 remains open with corrected mechanism. A real pool produced37 matching keep/payout/WSOL rows; a second pool's signature-less sweep causes the actual strict EmberClient.payouts schema to throw. The previous global-window absence does not establish that attribution can never match. Compact public responses and schema execution are recorded under evidence/r3.

F-3 remains open.25,671,360lamports is a successful-build-only comparison, not a retry-ready fix. At the100,000fee cap, one failed attempt followed by burn leaves4,078,560 against4,178,560 required for the retry. The retry count/reserve policy is undecided, and new holder ATA creation requires separate reserve. No financial implementation changed.

N-M1 through N-M6 are retained in the70-item register. Read-only source assessments are explicitly distinguished from executed race tests. All F-1 through F-14 remain open. Passing public checks does not make the financial service safe to fund.
