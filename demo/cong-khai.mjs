// Chép trang công khai cattuonggroup.ai.vn/gioi-thieu về app:  node demo/cong-khai.mjs [--force]   (rồi node demo/build.mjs)
// Giữ nguyên HTML / CSS / portal.js của trang gốc, chỉ sửa tối thiểu:
//   - toàn bộ tài nguyên /marketing/… (ảnh, ảnh 720°, SVG nền, biểu mẫu, bộ mẫu NOXH) tải về public/marketing/ đúng cấu trúc gốc,
//     đường dẫn đổi thành tương đối (chạy được cả máy chủ app lẫn GitHub Pages thư mục con). --force: tải lại cả tệp đã có
//   - nút «Nội bộ» → index.html (app Phòng Kinh doanh), link bài viết → gioi-thieu.html?blog=…
//   - dữ liệu API công khai chụp vào cong-khai/data/; cong-khai/bridge.js trả lời /api/public/… (máy chủ app thì chuyển tiếp trực tiếp)
//     và chuyển form đăng ký vào Phân hệ 03
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'https://cattuonggroup.ai.vn';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(PUB, 'cong-khai');
const FORCE = process.argv.includes('--force');
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });

async function get(url, bin) {
  const r = await fetch(url.startsWith('http') ? url : HOST + url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return bin ? Buffer.from(await r.arrayBuffer()) : r.text();
}
// /marketing/… → <up>marketing/… (tương đối từ chỗ đặt tệp); /blog/<mã> → gioi-thieu.html?blog=<mã> (trên app, /blog/… rơi vào trang nội bộ)
const rel = (s, up = '') => s.replace(/(^|[^\w.:/-])\/marketing\//g, `$1${up}marketing/`).replace(/(^|["'])\/blog\/([\w-]+)(?=["']|$)/g, '$1gioi-thieu.html?blog=$2');
const relJson = v => typeof v === 'string' ? rel(v) : Array.isArray(v) ? v.map(relJson) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, relJson(x)])) : v;
function must(s, from, to) {   // trang gốc đổi cấu trúc thì dừng hẳn, không lặng lẽ sinh bản hỏng
  if (!(from instanceof RegExp ? from.test(s) : s.includes(from))) throw new Error('Không thấy đoạn cần sửa: ' + from);
  return s.replace(from, to);
}
const texts = [];   // mọi nội dung đã sinh — quét tìm tài nguyên marketing/… cần tải
const save = (f, s) => { texts.push(s); fs.writeFileSync(path.join(OUT, f), s); console.log('  ', f, (Buffer.byteLength(s) / 1024).toFixed(0) + 'KB'); };

console.log('Tải trang gốc…');
let html = await get('/gioi-thieu');
html = must(html, /<link rel="stylesheet" href="\/marketing\/estate-background\.css[^"]*">/, '<link rel="stylesheet" href="cong-khai/estate-background.css">');
html = must(html, /<script src="\/marketing\/portal\.js[^"]*"><\/script>/, '<script src="cong-khai/bridge.js"></script>\n  <script src="cong-khai/portal.js"></script>');
html = must(html, 'href="/login"', 'href="index.html"');
html = must(html, '<head>', `<head>\n  <!-- Bản sao ${HOST}/gioi-thieu — sinh bởi «node demo/cong-khai.mjs», không sửa tay. -->`);
// trang gốc dùng /favicon.ico mặc định của tên miền — GitHub Pages chạy thư mục con nên khai báo rõ
fs.writeFileSync(path.join(PUB, 'favicon.ico'), await get('/favicon.ico', true));
html = must(html, '</title>', '</title>\n  <link rel="icon" href="favicon.ico">');
html = rel(html); texts.push(html);
fs.writeFileSync(path.join(PUB, 'gioi-thieu.html'), html);
console.log('   gioi-thieu.html', (html.length / 1024).toFixed(0) + 'KB');

let js = await get('/marketing/portal.js');
js = must(js, "location.protocol === 'file:' ? `gioi-thieu.html?blog=${slug}` : `/blog/${slug}`", '`gioi-thieu.html?blog=${slug}`');
js = must(js, "location.protocol === 'file:' ? 'gioi-thieu.html' : '/gioi-thieu'", "'gioi-thieu.html'");
js = rel(js);
save('portal.js', js);
save('estate-background.css', rel(await get('/marketing/estate-background.css'), '../'));

console.log('Chụp dữ liệu API công khai…');
const api = async (p, f) => save('data/' + f + '.json', JSON.stringify(relJson(JSON.parse(await get('/api/public' + p)))));
const duAn = JSON.parse(await get('/api/public/du-an')).data;
await api('/du-an', 'du-an');
for (const p of duAn) await api('/du-an/' + encodeURIComponent(p.ma), 'du-an__' + p.ma);
for (const p of ['bieu-mau', 'bang-hang', 'phap-ly']) await api('/' + p, p);
await api('/luot-truy-cap?path=%2Fgioi-thieu', 'luot-truy-cap');
const blogIds = [...js.slice(js.indexOf('const BLOG_BAI_VIET_MAC_DINH'), js.indexOf('const TIN_TUC_NOI_BAT_MAC_DINH')).matchAll(/^ {4}id: '([^']+)'/gm)].map(m => m[1]);
for (const id of blogIds) await api('/blog/' + encodeURIComponent(id), 'blog__' + id).catch(e => console.warn('   bỏ qua bài (trang gốc chỉ cho nội bộ):', id, e.message));
save('data/quy-can-072026.json', JSON.stringify(relJson(JSON.parse(await get('/marketing/data/quy-can-072026.json')))));

// ---- tài nguyên marketing/… : đường dẫn chữ + đường dẫn ghép trong portal.js (hằng …_BASE / …_VERSION, bộ mẫu NOXH)
const consts = Object.fromEntries([...js.matchAll(/^const (\w+) = '([^'\n]*)';/gm)].map(m => [m[1], m[2]]));
const jsResolved = js.replace(/\$\{(\w+)\}/g, (m, k) => k in consts ? consts[k] : m);
const files = new Set();
for (const t of [...texts, jsResolved]) for (const m of t.matchAll(/marketing\/[^'"`\s)<>?#\\]+/g)) if (!m[0].includes('${')) files.add(m[0]);
for (const m of js.matchAll(/file: NOXH_FORMS_RELEASE \+ '([^']+)'/g)) files.add(consts.NOXH_FILE_BASE + consts.NOXH_FORMS_RELEASE + m[1]);
const list = [...files].filter(f => !/\/$/.test(f) && /\.\w{2,5}$/.test(f) && !/^marketing\/(portal\.js|estate-background\.css)$/.test(f)).sort();

console.log(`Tải ${list.length} tài nguyên marketing/…`);
let total = 0, fresh = 0; const missing = [];
for (const f of list) {
  const disk = path.join(PUB, ...decodeURIComponent(f).split('/'));
  if (FORCE || !fs.existsSync(disk)) {
    try {
      const buf = await get('/' + f.split('/').map(s => encodeURIComponent(decodeURIComponent(s))).join('/'), true);
      fs.mkdirSync(path.dirname(disk), { recursive: true }); fs.writeFileSync(disk, buf); fresh++;
    } catch (e) { missing.push(f + ' — ' + e.message); continue; }
  }
  total += fs.statSync(disk).size;
}
console.log(`   ${list.length - missing.length} tệp (${fresh} mới tải), ${(total / 1048576).toFixed(1)} MB trong public/marketing/`);
if (missing.length) console.warn('   Không tải được (trang gốc cũng không có):\n     ' + missing.join('\n     '));
console.log('Xong. Chạy tiếp: node demo/build.mjs');
