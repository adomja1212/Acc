// Builds www-war/: Street War on its own (for the separate «حرب شوارع» app), from the bundled www/.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'www'), out = path.join(root, 'www-war');
if (!fs.existsSync(path.join(src, 'war.html'))) throw new Error('run tools/build-www.mjs first');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const d of ['lib', 'fonts', 'assets']) if (fs.existsSync(path.join(src, d))) fs.cpSync(path.join(src, d), path.join(out, d), { recursive: true });
for (const f of ['net.js', 'bgm.js']) fs.copyFileSync(path.join(src, f), path.join(out, f));
let html = fs.readFileSync(path.join(src, 'war.html'), 'utf8');
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<script>window.STANDALONE=1;</script>');
if (!html.includes('window.STANDALONE=1')) throw new Error('could not mark the standalone page');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('www-war/ ready');
