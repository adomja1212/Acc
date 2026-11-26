// Builds www/: the game with three.js, Trystero and the fonts bundled locally,
// so the Android app opens and plays without the internet (online races still need it).
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const out = path.join(root, 'www');
const nm = (p) => path.join(root, 'node_modules', p);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'lib/three/build'), { recursive: true });
fs.copyFileSync(nm('three/build/three.module.js'), path.join(out, 'lib/three/build/three.module.js'));
for (const d of ['objects', 'geometries', 'postprocessing', 'shaders', 'utils']) {
  fs.cpSync(nm('three/examples/jsm/' + d), path.join(out, 'lib/three/examples/jsm', d), { recursive: true });
}

await build({
  entryPoints: [nm('trystero/dist/index.mjs')],
  bundle: true, format: 'esm', platform: 'browser', minify: true,
  outfile: path.join(out, 'lib/trystero.js'),
});

const fontDir = path.join(out, 'fonts');
fs.mkdirSync(path.join(fontDir, 'files'), { recursive: true });
let css = '';
for (const [pkg, weights] of [['@fontsource/lalezar', ['400']], ['@fontsource/cairo', ['400', '600', '800']]]) {
  for (const w of weights) css += fs.readFileSync(nm(`${pkg}/${w}.css`), 'utf8') + '\n';
  for (const f of fs.readdirSync(nm(`${pkg}/files`))) {
    if (f.endsWith('.woff2')) fs.copyFileSync(nm(`${pkg}/files/${f}`), path.join(fontDir, 'files', f));
  }
}
css = css.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, '');
fs.writeFileSync(path.join(fontDir, 'fonts.css'), css);

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error('index.html is missing: ' + from);
  html = html.split(from).join(to);
};
swap('<link rel="preconnect" href="https://fonts.googleapis.com">\n', '');
swap('https://fonts.googleapis.com/css2?family=Lalezar&family=Cairo:wght@400;600;800&display=swap', 'fonts/fonts.css');
swap('https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js', './lib/three/build/three.module.js');
swap('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/', './lib/three/examples/jsm/');
swap('https://cdn.jsdelivr.net/npm/trystero@0.26.0/+esm', './lib/trystero.js');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('www/ ready');
