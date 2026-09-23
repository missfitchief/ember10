/** Preview the real Vercel read-only entry against the built frontend, without a database or signer. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import adapter from '../api/index.js';

const root = resolve('dist/web');
const port = Number(process.env.PREVIEW_PORT ?? 5180);
const types: Record<string,string> = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.ico':'image/x-icon' };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const result = await adapter.fetch(new Request(url, { method: request.method ?? 'GET' }));
      const headers: Record<string,string> = {};
      result.headers.forEach((value, key) => { headers[key] = value; });
      response.writeHead(result.status, headers);
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + sep)) { response.writeHead(404); response.end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control':'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Read-only hosted preview: http://127.0.0.1:${port}`));
