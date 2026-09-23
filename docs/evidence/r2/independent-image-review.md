# EMBER10 R2 independent image authorization review

Reviewed 2026-09-23, read-only, by the frontend specialist who did not author the image authorization implementation. This is a separate same-vendor implementation review, not an independent external audit.

## Scope and revision

Reviewed c254b9e43b605056638273de6f1b8689543b72e6 and a076043dc2101f7d6d5db700ac3d42ac789a5265 in the integration worktree. HEAD was a076043dc2101f7d6d5db700ac3d42ac789a5265. Files reviewed:

- apps/api/catalogue.ts: 25e92cf5f5619299d1f44f1cb477c5d42445c66e48804f84a7060a9b4490cff5
- apps/api/token-image.ts: ed131773e76c5ee482a0f54e225d12c52a6553447015fca314e18be5135d17cb
- apps/api/overview.ts: d61dc568d5d9dd847eece3080786056772bcf6446727e5afc642a171afa85edf
- apps/api/backend-overview.ts: 8e002caf93c5bc4e97dda20bafe2356814c5865355e39a1ae79330c27416e8f9
- packages/integrations/market-data.ts: 4b4312a2351e3a3a11d2517b39d7edef2917623b31e741ec54b7ca0bb2f7868a
- packages/shared/token-image.ts: a4663a16a1e9465bae10f948e8d17b471b30abe2b7c49f83e072644161c50292
- tests/token-image.test.ts: 19400398bbe24cfb0c1efc774d8b295083487233de8bfa7ecea038aec83fac22

Also read hosted/native route integration and the unchanged thumbnail consumer contract. No source or test file was edited.

## Findings

No material defect found within the bounded image authorization patch.

- Membership is built from every normalized market in the last validated full catalogue, including excluded, unranked, warming and beyond-first-page rows. It does not depend on financial eligibility or ten-item selection, preserving required token-logo coverage.
- CID identity permits approved aliases, but actual upstream work uses the catalogue's canonical source and same-CID fallback gateways. An arbitrary well-formed but unlisted CID is rejected before image cache access, conditional responses or the 16-image work limit.
- Membership is checked again after image I/O. Removal during an in-flight read denies the completed bytes, and an internally cached result cannot bypass subsequent membership checks.
- Overview, backend overview and image authorization share the API-instance catalogue service. Cold instances bootstrap through its coalesced read; existing last-good logos remain available while a TTL-controlled refresh stalls or fails. This preserves visual availability without asserting current market-data freshness.
- Authorization and image work share a 25-second request deadline. Gateway attempts use at most six seconds and cancel their fetch/body work. Caller cancellation does not abort another caller's coalesced image request. Raster byte/decode/output/cache limits remain enforced.
- Successful responses require revalidation (max-age=0, s-maxage=0, must-revalidate), and generated browser URLs use v=2 to avoid reuse of the previous immutable URL. ETag/HEAD responses still require current last-good membership.

## Executed checks

- Independently ran tests/token-image.test.ts: 22 tests passed in one file. No database suite was run.
- Executed an additional isolated in-memory scenario using the real MarketDataService, catalogue authorizer and image handler: started an authorized image fetch, removed its logo from a newly validated catalogue before releasing image bytes, then confirmed HTTP404 both for the completed request and a subsequent request despite its decoded bytes being cached. Only one image fetch occurred.
- Existing tests exercise cold ten-logo bootstrap, arbitrary-CID concurrency rejection, all-row/partial-catalogue membership, stale last-good behavior, cached/HEAD/304 revocation, shared deadlines, abort isolation, raster validation, bounded body reads, same-CID gateway fallback and hosted rewrite compatibility.

## Limits

Test logos/catalogues were isolated fixtures, so these tests establish routing and authorization behavior, not current token identity or deployed-image correctness. Actual ten-token logo loading and deployed revision verification remain integration/deployment checks. In-process catalogue/image caches are not shared across serverless instances. Known-catalogue image requests can still consume the bounded concurrency allowance; this patch is not general denial-of-service protection. Last-good membership intentionally remains usable during source outages until a new validated catalogue replaces it. Existing pages running the old application bundle are not forcibly refreshed.

No signing, settlement, financial policy or funding path was changed or approved by this review.
