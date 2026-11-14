// Builds two browser bundles:
//   sealed.js  file encryption, Shamir parts, holder signing with app-created keys, QR codes
//   wallet.js  Meteor Wallet for people using their own NEAR account (loaded only when needed)
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const common = { bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' }, inject: ['client/browser-globals.js'] };
await build({ ...common, entryPoints: ['client/sealed.js'], outfile: 'public/assets/sealed.js', drop: ['debugger'] });
await build({ ...common, entryPoints: ['client/wallet.js'], outfile: 'public/assets/wallet.js',
  // The Meteor SDK logs generated key objects; never ship those logs.
  drop: ['console', 'debugger'],
  plugins: [{ name: 'patched-uri-decoder-interop', setup(b) {
    // query-string 7 is CommonJS; the patched decoder 0.5.1 is ESM. Keep its default-function API.
    b.onLoad({ filter: /node_modules[\\/]query-string[\\/]index\.js$/ }, async ({ path }) => ({
      contents: (await readFile(path, 'utf8')).replace("require('decode-uri-component')", "require('decode-uri-component').default"), loader: 'js' }));
  } }] });
