import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
await build({ entryPoints: ['client/wallet.js'], outfile: 'public/assets/wallet.js', bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
  inject: ['client/browser-globals.js'],
  // The upstream Meteor SDK logs generated key objects. Never ship those logs.
  drop: ['console', 'debugger'],
  plugins: [{ name: 'patched-uri-decoder-interop', setup(builder) {
    // query-string 7 is CommonJS; the fixed decoder 0.5.1 is ESM. Preserve its
    // default-function API without retaining the vulnerable legacy decoder.
    builder.onLoad({ filter: /node_modules[\\/]query-string[\\/]index\.js$/ }, async ({ path }) => ({
      contents: (await readFile(path, 'utf8')).replace("require('decode-uri-component')", "require('decode-uri-component').default"), loader: 'js',
    }));
  } }],
});
