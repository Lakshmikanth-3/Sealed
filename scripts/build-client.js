// Builds the browser bundle: file encryption, Shamir parts, holder signing and QR codes.
import { build } from 'esbuild';
await build({ entryPoints: ['client/sealed.js'], outfile: 'public/assets/sealed.js', bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
  inject: ['client/browser-globals.js'], drop: ['debugger'] });
