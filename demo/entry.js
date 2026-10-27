// Bản demo GitHub Pages: chạy nguyên máy chủ (server/*.js) trong trình duyệt trên PGlite,
// chặn fetch('/api/…') của giao diện để gọi thẳng handle() thay vì qua mạng.
const pgShim = require('./shims/pg');
const fsShim = require('./shims/fs');
const say = t => { const el = document.getElementById('bootmsg'); if (el) el.textContent = t; };
const SID_KEY = 'ctg-kd-demo-sid';
let sid = null;
try { sid = localStorage.getItem(SID_KEY); } catch {}

// req giả: đủ cho readJson (on data/end) và upload (pipe → busboy shim)
function fakeReq(method, url, headers, body) {
  const h = {}; let fired = false;
  const req = {
    method, url, headers: { ...headers, cookie: sid ? `kd_sid=${sid}` : '' },
    on(ev, fn) {
      (h[ev] ||= []).push(fn);
      if (ev === 'end' && !fired) {
        fired = true;
        setTimeout(() => { if (typeof body === 'string' && body.length) (h.data || []).forEach(f => f(Buffer.from(body, 'utf8'))); (h.end || []).forEach(f => f()); }, 0);
      }
      return req;
    },
    pipe(bb) { bb._run(body instanceof FormData ? body : new FormData()); return bb; },
    destroy() {},
  };
  return req;
}
function fakeRes(done) {
  let status = 200, head = {};
  return {
    writeHead(s, hd = {}) { status = s; head = hd; },
    setHeader(k, v) { head[k] = v; },
    end(body) {
      const ck = head['Set-Cookie'];
      if (ck) { const m = /kd_sid=([^;]*)/.exec(ck); sid = m && m[1] ? m[1] : null; try { sid ? localStorage.setItem(SID_KEY, sid) : localStorage.removeItem(SID_KEY); } catch {} }
      const hs = new Headers();
      for (const [k, v] of Object.entries(head)) if (k !== 'Set-Cookie') hs.set(k, String(v));
      const b = body == null || body === '' ? null : typeof body === 'string' ? body : new Uint8Array(body);
      done(new Response([204, 304].includes(status) ? null : b, { status, headers: hs }));
    },
  };
}
const isApi = u => typeof u === 'string' && (u.startsWith('/api/') || u.startsWith('/print/'));

async function boot(pgliteUrl) {
  say('Đang khởi tạo cơ sở dữ liệu trong trình duyệt…');
  const { PGlite } = await import(pgliteUrl);
  const ts = v => v == null ? null : new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString();
  const num = v => v == null ? null : +v;
  const pg = await PGlite.create('idb://ctg-kinhdoanh-demo', { relaxedDurability: true, parsers: { 1082: v => v, 1700: num, 1184: ts, 20: num } });
  await pg.exec("SET TIME ZONE 'Asia/Bangkok'");
  pgShim.setDb(Promise.resolve(pg));
  await fsShim.loadFiles();
  const { tx, one, q } = require('../server/db');
  const { migrate } = require('../server/schema');
  const biz = require('../server/biz');
  const { handle } = require('../server/server');
  await tx(db => migrate(db));   // thêm bảng / cột mới cho dữ liệu demo đã lưu từ phiên bản trước
  if (!(await one('SELECT count(*) n FROM kd_user')).n) {
    say('Lần đầu mở: đang nạp dữ liệu mẫu (khoảng 20–60 giây)…');
    const seed = require('../server/seed');
    await seed.seedBase();
    say('Đang nạp giao dịch thử…');
    try { await seed.loadDemo(); } catch (e) { console.warn('loadDemo', e); }
  }
  // bảng giá Bravo tòa O CTS (94 căn) — nạp như «Nhập bảng hàng» trên máy thật; chạy lại an toàn (cập nhật theo mã căn)
  if ((await one("SELECT count(*) n FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project p ON p.id = u.project_id WHERE p.code = 'CTS' AND b.code = 'O'")).n < 94) {
    say('Đang nạp bảng giá tòa O…');
    try {
      const IO = require('../server/io'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      await IO.importFile('units', { name: 'DM bảng hàng và sản phẩm - tòa O CTS.xlsx', buffer: Buffer.from(require('../data/seed/DM bảng hàng và sản phẩm - tòa O CTS.xlsx')) }, u);
    } catch (e) { console.warn('nạp tòa O', e); }
  }
  const job = async () => { try { await tx(db => biz.jobs(db)); await q('DELETE FROM kd_session WHERE expires_at < now()'); } catch (e) { console.warn('job', e.message); } };
  await job(); setInterval(job, 2 * 60e3);

  const call = (method, url, headers, body) => new Promise((ok, fail) => { Promise.resolve(handle(fakeReq(method, url, headers, body), fakeRes(ok))).catch(fail); });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isApi(url)) return realFetch(input, init);
    const hd = {}; new Headers(init.headers || {}).forEach((v, k) => { hd[k] = v; });
    return call((init.method || 'GET').toUpperCase(), url, hd, init.body);
  };
  // mở / tải tệp từ /api/… (in, tải tệp đính kèm, xuất Excel qua link)
  const openBlob = async (url, win, dlName) => {
    try {
      const r = await window.fetch(url);
      if (r.status === 302) { win && win.close(); return; }
      const href = URL.createObjectURL(await r.blob());
      if (dlName) { const a = document.createElement('a'); a.href = href; a.download = dlName; document.body.append(a); a.click(); a.remove(); win && win.close(); }
      else if (win) win.location.href = href; else location.href = href;
      setTimeout(() => URL.revokeObjectURL(href), 12e4);
    } catch (e) { win && win.close(); alert(e.message); }
  };
  const realOpen = window.open.bind(window);
  window.open = (url, target, feat) => { if (!isApi(url)) return realOpen(url, target, feat); const w = realOpen('about:blank', target || '_blank', feat); openBlob(url, w); return w; };
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href'); if (!isApi(href)) return;
    e.preventDefault();
    if (a.hasAttribute('download') || /[?&]dl=1/.test(href)) openBlob(href, null, a.getAttribute('download') || 'tep-tai-ve');
    else openBlob(href, a.target === '_blank' || !a.target ? realOpen('about:blank', '_blank') : null);
  }, true);
  window.__ctgReset = async () => {
    if (!confirm('Xóa toàn bộ dữ liệu demo trên trình duyệt này và nạp lại từ đầu?')) return;
    await pg.close();
    indexedDB.deleteDatabase('/pglite/ctg-kinhdoanh-demo'); indexedDB.deleteDatabase('ctg-kd-files');
    try { localStorage.removeItem(SID_KEY); } catch {}
    setTimeout(() => location.reload(), 500);
  };
  say('Đang mở giao diện…');
}
window.__ctgBoot = boot;
