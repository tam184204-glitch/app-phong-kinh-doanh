// Chép trang công khai cattuonggroup.ai.vn/gioi-thieu về app:  node demo/cong-khai.mjs   (chạy lại khi trang gốc cập nhật, rồi node demo/build.mjs)
// Giữ nguyên HTML / CSS / portal.js của trang gốc, chỉ sửa tối thiểu:
//   - ảnh, biểu mẫu /marketing/… → trỏ về tên miền gốc (ảnh 720° tải về cong-khai/720/ vì trình xem 720° cần CORS mà trang gốc không bật)
//   - nút «Nội bộ» → index.html (app Phòng Kinh doanh), link bài viết → gioi-thieu.html?blog=…
//   - dữ liệu API công khai chụp vào cong-khai/data/, cong-khai/bridge.js trả lời /api/public/… từ đó và chuyển form đăng ký vào Phân hệ 03
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'https://cattuonggroup.ai.vn';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'cong-khai');
const PANO = ['cat-tuong-tnt/apartment-tour/tnt-overview-720-ai.png', 'cat-tuong-eco/apartment-tour/eco-single-wide-panorama.jpg',
  'thong-nhat-smart-city/virtual-720.jpg', 'dai-hung-phat/apartment-tour/dhp-overview-720-ai-20260707.png'];
for (const d of ['data', '720']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

async function get(url, bin) {
  const r = await fetch(url.startsWith('http') ? url : HOST + url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return bin ? Buffer.from(await r.arrayBuffer()) : r.text();
}
// đường dẫn gốc /marketing/… → tuyệt đối về trang gốc (không đụng URL đã tuyệt đối)
// link bài viết /blog/<mã> → gioi-thieu.html?blog=<mã> (trên app, /blog/… sẽ rơi vào trang nội bộ)
const abs = s => s.replace(/(^|[^\w.:/-])\/marketing\//g, `$1${HOST}/marketing/`).replace(/(^|["'])\/blog\/([\w-]+)(?=["']|$)/g, '$1gioi-thieu.html?blog=$2');
const absJson = v => typeof v === 'string' ? abs(v) : Array.isArray(v) ? v.map(absJson) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, absJson(x)])) : v;
function must(s, from, to) {   // trang gốc đổi cấu trúc thì dừng hẳn, không lặng lẽ sinh bản hỏng
  if (!(from instanceof RegExp ? from.test(s) : s.includes(from))) throw new Error('Không thấy đoạn cần sửa: ' + from);
  return s.replace(from, to);
}
const save = (f, s) => { fs.writeFileSync(path.join(OUT, f), s); console.log('  ', f, (Buffer.byteLength(s) / 1024).toFixed(0) + 'KB'); };

console.log('Tải trang gốc…');
let html = await get('/gioi-thieu');
html = must(html, /<link rel="stylesheet" href="\/marketing\/estate-background\.css[^"]*">/, '<link rel="stylesheet" href="cong-khai/estate-background.css">');
html = must(html, /<script src="\/marketing\/portal\.js[^"]*"><\/script>/, '<script src="cong-khai/bridge.js"></script>\n  <script src="cong-khai/portal.js"></script>');
html = must(html, 'href="/login"', 'href="index.html"');
html = must(html, '<head>', `<head>\n  <!-- Bản sao ${HOST}/gioi-thieu — sinh bởi «node demo/cong-khai.mjs», không sửa tay. -->`);
fs.writeFileSync(path.join(ROOT, 'public', 'gioi-thieu.html'), abs(html));
console.log('   gioi-thieu.html', (html.length / 1024).toFixed(0) + 'KB');

let js = await get('/marketing/portal.js');
js = must(js, "location.protocol === 'file:' ? `gioi-thieu.html?blog=${slug}` : `/blog/${slug}`", '`gioi-thieu.html?blog=${slug}`');
js = must(js, "location.protocol === 'file:' ? 'gioi-thieu.html' : '/gioi-thieu'", "'gioi-thieu.html'");
save('portal.js', abs(js));
save('estate-background.css', abs(await get('/marketing/estate-background.css')));

console.log('Chụp dữ liệu API công khai…');
const api = async (p, f) => save('data/' + f + '.json', JSON.stringify(absJson(JSON.parse(await get('/api/public' + p)))));
const duAn = JSON.parse(await get('/api/public/du-an')).data;
await api('/du-an', 'du-an');
for (const p of duAn) await api('/du-an/' + encodeURIComponent(p.ma), 'du-an__' + p.ma);
for (const p of ['bieu-mau', 'bang-hang', 'phap-ly']) await api('/' + p, p);
await api('/luot-truy-cap?path=%2Fgioi-thieu', 'luot-truy-cap');
const blogIds = [...js.slice(js.indexOf('const BLOG_BAI_VIET_MAC_DINH'), js.indexOf('const TIN_TUC_NOI_BAT_MAC_DINH')).matchAll(/^ {4}id: '([^']+)'/gm)].map(m => m[1]);
for (const id of blogIds) await api('/blog/' + encodeURIComponent(id), 'blog__' + id).catch(e => console.warn('   bỏ qua bài', id, e.message));
save('data/quy-can-072026.json', JSON.stringify(absJson(JSON.parse(await get('/marketing/data/quy-can-072026.json')))));

console.log('Tải ảnh 720°…');
for (const p of PANO) {
  const f = path.join(OUT, '720', path.basename(p));
  if (!fs.existsSync(f)) fs.writeFileSync(f, await get('/marketing/images/projects/' + p, true));
  console.log('  ', '720/' + path.basename(p), (fs.statSync(f).size / 1024).toFixed(0) + 'KB');
}
console.log('Xong. Chạy tiếp: node demo/build.mjs');
