import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':{target:process.env.API_PROXY??'http://127.0.0.1:4310'}}},build:{outDir:'../../dist/web',emptyOutDir:true}});
