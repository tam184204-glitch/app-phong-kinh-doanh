// Dựng bản demo GitHub Pages vào docs/:  node demo/build.mjs
// docs/demo.js = máy chủ gói cho trình duyệt (esbuild + shims), docs/front.js = giao diện public/*.js nối lại.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs');
const S = f => path.join(ROOT, 'demo', 'shims', f);
fs.mkdirSync(OUT, { recursive: true });

// module Node → shim (node-misc.js xuất nhiều shim, tách bằng module ảo)
const misc = { http: 'http', crypto: 'crypto', zlib: 'zlib', busboy: 'busboy', '@anthropic-ai/sdk': 'anthropic' };
const shimPlugin = {
  name: 'node-shims',
  setup(b) {
    b.onResolve({ filter: /^(pg|fs|path)$/ }, a => ({ path: a.path === 'pg' ? S('pg.js') : a.path === 'fs' ? S('fs.js') : path.join(ROOT, 'node_modules/path-browserify/index.js') }));
    b.onResolve({ filter: /^(http|crypto|zlib|busboy|@anthropic-ai\/sdk)$/ }, a => ({ path: a.path, namespace: 'misc' }));
    b.onLoad({ filter: /.*/, namespace: 'misc' }, a => ({ contents: `module.exports = require(${JSON.stringify(S('node-misc.js'))})[${JSON.stringify(misc[a.path])}];`, resolveDir: ROOT, loader: 'js' }));
  },
};
await build({
  entryPoints: [path.join(ROOT, 'demo/entry.js')], outfile: path.join(OUT, 'demo.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, charset: 'ascii',
  inject: [S('process.js')], define: { __dirname: '"/server"' }, plugins: [shimPlugin], logLevel: 'warning',
});

// giao diện: nối ui → screens → ai, đường dẫn ảnh tương đối (Pages chạy trong thư mục con)
const front = ['ui', 'screens', 'ai'].map(f => `// ---- ${f}.js\n` + fs.readFileSync(path.join(ROOT, 'public', f + '.js'), 'utf8').replace(/(["'(])\/logo\.png/g, '$1logo.png')).join('\n');
fs.writeFileSync(path.join(OUT, 'front.js'), front);
for (const [from, to] of [['public/app.css', 'app.css'], ['public/logo.png', 'logo.png'], ['public/gioi-thieu.html', 'gioi-thieu.html'],['demo/index.html', 'index.html'], ['demo/fa.css', 'fa.css']]) fs.copyFileSync(path.join(ROOT, from), path.join(OUT, to));
fs.cpSync(path.join(ROOT, 'public', 'cong-khai'), path.join(OUT, 'cong-khai'), { recursive: true });   // trang công khai (node demo/cong-khai.mjs)
console.log('Đã dựng docs/ —', fs.readdirSync(OUT).map(f => `${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)}KB`).join(', '));
