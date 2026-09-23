import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const publicSite = new URL(process.env.PUBLIC_SITE_URL ?? 'https://ember5-pilot.vercel.app');
if (publicSite.protocol !== 'https:' || publicSite.username || publicSite.password || publicSite.pathname !== '/' || publicSite.search || publicSite.hash) {
  throw new Error('PUBLIC_SITE_URL must be an HTTPS origin without credentials, path, query or fragment.');
}
export default defineConfig({
  root:fileURLToPath(new URL('.',import.meta.url)),
  plugins:[{name:'public-sharing-metadata',transformIndexHtml:html=>html.replaceAll('__PUBLIC_SITE_URL__',publicSite.origin)}],
  server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':{target:process.env.API_PROXY??'http://127.0.0.1:4310'}}},
  build:{outDir:'../../dist/web',emptyOutDir:true}
});
