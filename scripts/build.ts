import { context, type BuildOptions } from 'esbuild';
import { copyFile, cp, rm } from 'node:fs/promises';

// - Unminified with external sourcemaps so add-on reviewers can read the bundles.
// - Content scripts cannot be ES modules, so the display script is an IIFE;
//   everything else (module background, module worker, options page) is ESM.
const common: BuildOptions = {
  bundle: true,
  minify: false,
  sourcemap: 'linked',
  target: 'firefox128',
  outdir: 'dist',
  logLevel: 'info',
};

const builds: BuildOptions[] = [
  { ...common, format: 'esm', entryPoints: { background: 'src/entries/background.ts' } },
  { ...common, format: 'esm', entryPoints: { 'scanner-worker': 'src/entries/scanner-worker.ts' } },
  { ...common, format: 'iife', entryPoints: { display: 'src/entries/display.ts' } },
];

const watch = process.argv.includes('--watch');

await rm('dist', { recursive: true, force: true });
await cp('static', 'dist', { recursive: true });
await copyFile('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm', 'dist/zxing_reader.wasm');
// pdf.js is shipped verbatim (not re-bundled) so reviewers can diff it against
// the npm package; the worker imports it on the first PDF.
await cp('node_modules/pdfjs-dist/legacy/build/pdf.mjs', 'dist/pdfjs/pdf.mjs');
await cp('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'dist/pdfjs/pdf.worker.mjs');
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(`node_modules/pdfjs-dist/${dir}`, `dist/pdfjs/${dir}`, { recursive: true });
}

const contexts = await Promise.all(builds.map(b => context(b)));
if (watch) {
  // Static assets are copied once; restart watch after changing static/.
  await Promise.all(contexts.map(c => c.watch()));
} else {
  await Promise.all(contexts.map(c => c.rebuild()));
  await Promise.all(contexts.map(c => c.dispose()));
}
