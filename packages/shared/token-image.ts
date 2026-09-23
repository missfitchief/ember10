// Only content-addressed logo paths from the catalogue's approved providers.
// Sharing this validator keeps browser URLs and the read-only relay in agreement.
const cid = '(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})';
const emberPath = new RegExp(`^/img/(${cid})$`);
const ipfsPath = new RegExp(`^/ipfs/(${cid})$`);

export function tokenImageSource(value: string | null): { url: string; cid: string | null } | null {
  if (!value || value.length > 300) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    let match: RegExpExecArray | null = null;
    if (['embercurve.fun', 'www.embercurve.fun'].includes(url.hostname)) {
      match = emberPath.exec(url.pathname);
      if (match) return { url: `https://embercurve.fun/img/${match[1]}`, cid: match[1] };
    }
    if (['ipfs.io', 'gateway.pinata.cloud'].includes(url.hostname)) {
      match = ipfsPath.exec(url.pathname);
      if (match) return { url: url.href, cid: match[1] };
    }
    if (url.hostname === 'arweave.net' && /^\/[A-Za-z0-9_-]{43}$/.test(url.pathname)) return { url: url.href, cid: null };
    return null;
  } catch { return null; }
}

export function tokenImageUrl(value: string | null): string | null {
  const source = tokenImageSource(value);
  return source ? `/api/token-image?source=${encodeURIComponent(source.url)}` : null;
}
