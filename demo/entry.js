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
  await q("UPDATE kd_project SET code = 'CTN' WHERE code = 'NEW'");   // đổi mã dự án Chung cư Cát Tường New (27/10/2026)
  if (!(await one('SELECT count(*) n FROM kd_user')).n) {
    say('Lần đầu mở: đang nạp dữ liệu mẫu (khoảng 20–60 giây)…');
    const seed = require('../server/seed');
    await seed.seedBase();
    say('Đang nạp giao dịch thử…');
    try { await seed.loadDemo(); } catch (e) { console.warn('loadDemo', e); }
  }
  // bảng giá Bravo tòa O CTS (94 căn) — nạp như «Nhập bảng hàng» trên máy thật; chạy lại an toàn (cập nhật theo mã căn)
  if ((await one("SELECT count(*) n FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project p ON p.id = u.project_id WHERE p.code = 'CTS' AND b.code IN ('O', 'K')")).n < 206) {
    say('Đang nạp bảng giá tòa O, tòa K…');
    try {
      const IO = require('../server/io'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      await IO.importFile('units', { name: 'DM bảng hàng và sản phẩm - tòa O CTS.xlsx', buffer: Buffer.from(require('../data/seed/DM bảng hàng và sản phẩm - tòa O CTS.xlsx')) }, u);
      await IO.importFile('units', { name: 'Nhà K - tòa K CTS.xlsx', buffer: Buffer.from(require('../data/seed/Nhà K - tòa K CTS.xlsx')) }, u);
    } catch (e) { console.warn('nạp tòa O', e); }
  }
  // giữ chỗ quá hạn → «Quá hạn giữ chỗ» (bản demo tắt việc chạy nền NO_JOBS nên chạy riêng: lúc mở + mỗi 2 phút)
  try { const B = require('../server/biz'); await tx(db => B.expireHolds(db)); setInterval(() => tx(db => B.expireHolds(db)).catch(e => console.warn('quá hạn giữ chỗ', e)), 2 * 60e3); } catch (e) { console.warn('quá hạn giữ chỗ', e); }
  // phiếu thử tạo theo giá bảng hàng 10/09 → giá trị căn hộ theo Danh mục sản phẩm (như máy thật 28/10/2026); chạy mỗi lần mở
  // để cả trình duyệt đã lưu dữ liệu cũ cũng sửa (giá trị hoàn thiện nội thất người dùng nhập vẫn giữ)
  try {
    await q(`UPDATE kd_reservation r SET unit_value = u.price_net + coalesce(u.maint_fee, 0), price = u.price_net + coalesce(u.maint_fee, 0) + coalesce(r.finish_value, 0)
      FROM kd_unit u WHERE u.id = r.unit_id AND u.price_net IS NOT NULL AND r.unit_value IS DISTINCT FROM u.price_net + coalesce(u.maint_fee, 0)`);
    // hợp đồng căn hộ cũng theo Danh mục sản phẩm: giá trị + lịch thanh toán tính lại theo tỷ lệ cũ (như máy thật 28/10/2026)
    const B = require('../server/biz'), u = await one("SELECT * FROM kd_user WHERE role = 'admin' ORDER BY id LIMIT 1");
    const cs = await q(`SELECT c.id FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE c.kind <> 'hoan_thien' AND c.status NOT IN ('huy', 'thanh_ly')
      AND u.price_net IS NOT NULL AND c.value IS DISTINCT FROM u.price_net + coalesce(u.maint_fee, 0)`);
    if (cs.length) await tx(async db => { for (const c of cs) await B.syncContractValue(db, c.id, u); });
  } catch (e) { console.warn('đồng bộ giá phiếu', e); }
  // mẫu in đơn đăng ký chuẩn (thêm 27/10/2026) — giống máy thật: nạp mẫu còn thiếu, tắt mẫu khung cũ
  try { await require('../server/seed').ensureTemplates(); } catch (e) { console.warn('mẫu in', e); }
  // hồ sơ mua NOXH theo Mẫu 4 (87 hộ — họ tên, SĐT, ngày sinh, CMND, CCCD là dữ liệu giả); nạp như «Nhập file Mẫu 4»
  if ((await one('SELECT count(*) n FROM kd_noxh_check WHERE doi_tuong IS NOT NULL')).n < 80) {
    say('Đang nạp hồ sơ mua NOXH (Mẫu 4)…');
    try {
      const IO = require('../server/io'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      await IO.importFile('mau4', { name: 'Mau 4 - demo (du lieu gia).xlsx', buffer: Buffer.from(require('../data/seed/Mau 4 - demo (du lieu gia).xlsx')) }, u);
    } catch (e) { console.warn('nạp Mẫu 4', e); }
  }
  // tòa K dự án CTS (thêm 27/10/2026, chưa có căn)
  if (!(await one("SELECT 1 FROM kd_building b JOIN kd_project p ON p.id = b.project_id WHERE p.code = 'CTS' AND b.code = 'K'")))
    await q("INSERT INTO kd_building (project_id, code, name, kind, created_at) SELECT id, 'K', 'Tòa K', 'chung_cu', now() FROM kd_project WHERE code = 'CTS'");
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
