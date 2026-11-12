// Bản demo GitHub Pages: chạy nguyên máy chủ (server/*.js) trong trình duyệt trên PGlite,
// chặn fetch('/api/…') của giao diện để gọi thẳng handle() thay vì qua mạng.
const pgShim = require('./shims/pg');
const fsShim = require('./shims/fs');
const say = t => { const el = document.getElementById('bootmsg'); if (el) el.textContent = t; };
const SID_KEY = 'ctg-kd-demo-sid';
let sid = null;
try { sid = localStorage.getItem(SID_KEY); } catch {}

// ===== Mẫu biểu dùng chung qua Git (11/11/2026) =====
// Bản demo không có máy chủ: mẫu biểu sửa ở màn Quản trị › Mẫu biểu chỉ nằm trên trình duyệt người sửa. Quản trị bấm «Đẩy mẫu biểu lên Git»
// → ghi docs/mau-bieu.json vào kho GitHub (GitHub Pages phát lại sau 1–2 phút) → trình duyệt khác mở link thấy «ver» mới thì ghi đè mẫu của mình.
const TPL_FILE = 'mau-bieu.json', TPL_VER = 'ctg-kd-mau-bieu-ver', TPL_COLS = 'code, name, kind, content, scope, bedrooms, active, ent, bo';
const GH = { owner: 'tam184204-glitch', repo: 'app-phong-kinh-doanh', branch: 'main', path: 'docs/' + TPL_FILE, tokenKey: 'ctg-kd-gh-token' };
async function syncTemplatesFromGit(q, one) {
  let cur = null; try { cur = localStorage.getItem(TPL_VER); } catch {}
  const r = await fetch(new URL(`${TPL_FILE}?t=${Date.now()}`, location.href), { cache: 'no-store' });   // ?t= qua bộ đệm 10 phút của Pages
  if (!r.ok) return;
  const d = await r.json().catch(() => null);
  if (!d?.ver || d.ver === cur || !Array.isArray(d.templates) || !d.templates.length) return;
  say('Đang cập nhật mẫu biểu dùng chung…');
  const codes = [];
  for (const t of d.templates) {
    if (!t.code || !t.name || !t.kind) continue;
    codes.push(String(t.code).toUpperCase());
    const v = [t.code, t.name, t.kind, t.content || '', t.scope ?? null, t.bedrooms ?? null, t.active !== false, t.ent ?? null, t.bo ?? null];
    const u = await q('UPDATE kd_template SET name = $2, kind = $3, content = $4, scope = $5, bedrooms = $6, active = $7, ent = $8, bo = coalesce($9, bo), updated_at = now() WHERE upper(code) = upper($1) RETURNING id', v);
    if (!u.length) await q(`INSERT INTO kd_template (${TPL_COLS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, v);
  }
  // mẫu quản trị đã xóa: xóa theo; đang được bản ghi khác trỏ tới thì chỉ tắt
  // bộ MẪU HS TNS có sẵn trong app (12/11/2026): bản đẩy cũ chưa có thì không xóa
  try { await q("DELETE FROM kd_template WHERE NOT (upper(code) = ANY($1)) AND upper(code) NOT LIKE 'TNS-%' AND bo IS NULL", [codes]); }
  catch (e) { console.warn('xóa mẫu cũ', e); await q("UPDATE kd_template SET active = false WHERE NOT (upper(code) = ANY($1)) AND upper(code) NOT LIKE 'TNS-%' AND bo IS NULL", [codes]); }
  await require('../server/biz').fillTplEnt({ q });   // bản đẩy trước 11/11/2026 chưa có module
  try { localStorage.setItem(TPL_VER, d.ver); } catch {}
  console.log(`mẫu biểu từ Git: ${codes.length} mẫu, bản ${d.ver}${d.by ? ' do ' + d.by : ''}`);
}
// Gọi từ giao diện (nút chỉ hiện cho vai trò Quản trị). Mã truy cập GitHub (fine-grained token, quyền Contents: Read and write của kho) lưu trên trình duyệt này.
window.__ctgDemoPublish = async ({ user } = {}) => {
  let token = null; try { token = localStorage.getItem(GH.tokenKey); } catch {}
  if (!token) {
    token = prompt(`Dán mã truy cập GitHub (Personal access token, fine-grained; quyền Contents: Read and write cho kho ${GH.owner}/${GH.repo}).\nMã chỉ lưu trên trình duyệt này, không đưa vào bản demo.`);
    if (!token || !token.trim()) return null;
    token = token.trim();
    try { localStorage.setItem(GH.tokenKey, token); } catch {}
  }
  const { q } = require('../server/db');
  const rows = await q(`SELECT ${TPL_COLS} FROM kd_template ORDER BY id`);
  if (!rows.length) throw new Error('Chưa có mẫu biểu nào để đẩy');
  const ver = new Date().toISOString();
  const body = JSON.stringify({ ver, by: user || '', templates: rows }, null, 1);
  const api = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${GH.path}`;
  const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  const g = await fetch(`${api}?ref=${GH.branch}&t=${Date.now()}`, { headers: H, cache: 'no-store' });
  if (g.status === 401 || g.status === 403) { try { localStorage.removeItem(GH.tokenKey); } catch {} throw new Error('Mã truy cập GitHub sai, hết hạn hoặc thiếu quyền Contents — bấm lại để nhập mã mới'); }
  const sha = g.ok ? (await g.json()).sha : undefined;
  const p = await fetch(api, { method: 'PUT', headers: H, body: JSON.stringify({
    message: `Mẫu biểu: ${rows.length} mẫu — ${user || 'quản trị'} đẩy từ bản demo ${ver.slice(0, 16).replace('T', ' ')}`,
    content: Buffer.from(body, 'utf8').toString('base64'), sha, branch: GH.branch }) });
  if (!p.ok) { const e = await p.json().catch(() => ({})); throw new Error(`GitHub từ chối (${p.status}): ${e.message || ''}`); }
  try { localStorage.setItem(TPL_VER, ver); } catch {}   // trình duyệt này đã là bản mới
  return { n: rows.length, ver };
};
window.__ctgDemoForgetToken = () => { try { localStorage.removeItem(GH.tokenKey); } catch {} };

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

const DEMO_USERS = [
  ['tampm', 'thu.quantri', 'Phạm Minh Tâm', 'admin', 'Quản trị hệ thống'],
  ['dungpt', null, 'Phạm Tiến Dũng', 'lanh_dao', 'Chủ tịch Tập đoàn'],
  ['dungntt', 'thu.truongphong', 'Nguyễn Thị Thanh Dung', 'truong_phong', 'Trưởng phòng Kinh doanh'],
  ['kinhdoanh1', 'thu.banhang', 'Nhân viên kinh doanh 1', 'ban_hang', 'Nhân viên kinh doanh'],
  ['kinhdoanh2', 'thu.banhang2', 'Nhân viên kinh doanh 2', 'ban_hang', 'Nhân viên kinh doanh'],
  ['kinhdoanh3', null, 'Nhân viên kinh doanh 3', 'ban_hang', 'Nhân viên kinh doanh'],
  ['kinhdoanh4', null, 'Nhân viên kinh doanh 4', 'ban_hang', 'Nhân viên kinh doanh'],
];
async function demoAccounts(db) {
  const IO = require('../server/io');
  if (await db.one('SELECT 1 FROM kd_user WHERE lower(username) = $1 AND active', ['tampm']) && (await db.one('SELECT count(*) n FROM kd_user WHERE active')).n === DEMO_USERS.length) return;   // đã đúng
  const keep = [];
  for (const [un, old, name, role, title] of DEMO_USERS) {
    let u = await db.one('SELECT id FROM kd_user WHERE lower(username) = $1', [un]);
    if (!u && old) {
      u = await db.one('SELECT id FROM kd_user WHERE lower(username) = $1', [old]);
      if (u) await db.q('UPDATE kd_user SET username = $2, full_name = $3 WHERE id = $1', [u.id, un, name]);   // họ tên người dùng đã tự sửa thì vẫn đặt lại đúng người
    }
    if (!u) u = await IO.createUser(db, { username: un, full_name: name, role, title }, (await db.one("SELECT * FROM kd_user WHERE role = 'admin' ORDER BY id LIMIT 1")) || require('../server/core').SYS);
    await db.q('UPDATE kd_user SET full_name = $2, role = $3, title = $4, dept = $5, active = true, is_trial = false, must_change = false WHERE id = $1',
      [u.id, name, role, title, role === 'lanh_dao' ? 'Chủ tịch, Ban Giám đốc' : role === 'admin' ? 'Quản trị hệ thống' : 'Phòng Kinh doanh']);
    keep.push(u.id);
  }
  await db.q('UPDATE kd_user SET active = false WHERE NOT (id = ANY($1))', [keep]);
  await db.q('DELETE FROM kd_session WHERE NOT (user_id = ANY($1))', [keep]);
}

async function boot(pgliteUrl) {
  let pg = null;
  // đặt trước mọi bước khởi động: dữ liệu trên trình duyệt hỏng thì màn hình lỗi vẫn gọi được để nạp lại
  window.__ctgReset = async () => {
    if (!confirm('Xóa toàn bộ dữ liệu demo trên trình duyệt này và nạp lại từ đầu?')) return;
    try { if (pg) await pg.close(); } catch (e) { console.warn('đóng CSDL', e); }
    const drop = n => new Promise(ok => { const r = indexedDB.deleteDatabase(n); r.onsuccess = r.onerror = ok; r.onblocked = () => { alert('Hãy đóng các tab khác đang mở bản demo rồi bấm OK.'); }; });
    await drop('/pglite/ctg-kinhdoanh-demo'); await drop('ctg-kd-files');
    try { localStorage.removeItem(SID_KEY); } catch {}
    location.reload();
  };
  // demo: trước khi app tự tải lại trang (đổi vai trò, đăng xuất) đóng CSDL để ghi hết xuống IndexedDB — không mất phiên vừa tạo
  window.__ctgBeforeReload = async () => { try { await pg?.syncToFs(false); } catch (e) { console.warn('ghi CSDL', e); } await new Promise(r => setTimeout(r, 1500)); };   // chờ IndexedDB ghi xong (tải lại ngay thì trình duyệt hủy lệnh ghi đang dở)
  // mỗi lúc chỉ 1 tab dùng CSDL: 2 tab cùng ghi IndexedDB sẽ đè nhau, hỏng chỉ mục hệ thống (lỗi 03/11/2026)
  if (navigator.locks) {
    const LOCK = 'ctg-kd-demo-db', hold = lock => lock && new Promise(() => {});   // giữ khóa tới khi đóng tab
    const lost = () => { try { pg && pg.close(); } catch {} document.body.innerHTML = '<div id="boot"><b>Bản demo đã chuyển sang tab khác</b><span>Tải lại trang này nếu muốn dùng ở đây.</span></div>'; };
    const got = await new Promise(ok => navigator.locks.request(LOCK, { ifAvailable: true }, lock => { ok(!!lock); return hold(lock); }).catch(lost));
    if (!got) {
      say('Bản demo đang mở ở một tab khác — đóng tab đó (dùng chung 1 tab để dữ liệu không bị hỏng), hoặc bấm nút dưới để chuyển sang tab này.');
      await new Promise(ok => {
        const btn = document.createElement('button');
        btn.textContent = 'Dùng ở tab này'; btn.style.cssText = 'padding:8px 16px;font:inherit;cursor:pointer';
        btn.onclick = () => { btn.remove(); navigator.locks.request(LOCK, { steal: true }, lock => { setTimeout(ok, 1500); return hold(lock); }).catch(lost); };   // chờ tab cũ ghi nốt
        document.getElementById('boot').append(btn);
        navigator.locks.request(LOCK, lock => { btn.remove(); ok(); return hold(lock); }).catch(lost);   // tab kia đóng → tự vào
      });
    }
  }
  say('Đang khởi tạo cơ sở dữ liệu trong trình duyệt…');
  const { PGlite } = await import(pgliteUrl);
  const ts = v => v == null ? null : new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString();
  const num = v => v == null ? null : +v;
  pg = await PGlite.create('idb://ctg-kinhdoanh-demo', { relaxedDurability: true, parsers: { 1082: v => v, 1700: num, 1184: ts, 20: num } });
  await pg.exec("SET TIME ZONE 'Asia/Bangkok'");
  pgShim.setDb(Promise.resolve(pg));
  await fsShim.loadFiles();
  const { tx, one, q } = require('../server/db');
  const { migrate } = require('../server/schema');
  const biz = require('../server/biz');
  const { handle } = require('../server/server');
  // chỉ mục hệ thống hỏng (tìm không thấy cột có thật): tải lại trang, phiên mới dựng lại chỉ mục TRƯỚC khi tra gì (phiên cũ nhớ kết quả tra sai)
  const FIX = 'ctg-kd-demo-reindex'; let fix = null;
  try { fix = sessionStorage.getItem(FIX); } catch {}
  if (fix) { say('Đang sửa dữ liệu demo…'); await pg.exec('REINDEX SYSTEM'); }
  try { await tx(db => migrate(db)); }   // thêm bảng / cột mới cho dữ liệu demo đã lưu từ phiên bản trước
  catch (e) {
    let ok = false; try { if (!fix) { sessionStorage.setItem(FIX, '1'); ok = true; } } catch {}
    if (!ok) throw e;
    console.warn('nâng cấp CSDL lỗi → tải lại, dựng lại chỉ mục', e); await pg.close(); location.reload(); return new Promise(() => {});
  }
  try { sessionStorage.removeItem(FIX); } catch {}
  await q("UPDATE kd_project SET code = 'CTN' WHERE code = 'NEW'");   // đổi mã dự án Chung cư Cát Tường New (27/10/2026)
  if (!(await one('SELECT count(*) n FROM kd_user')).n) {
    say('Lần đầu mở: đang nạp dữ liệu mẫu (khoảng 20–60 giây)…');
    const seed = require('../server/seed');
    await seed.seedBase();
  }
  // tài khoản bản demo (Tâm 11/11/2026): 4 nhân viên kinh doanh, trưởng phòng Nguyễn Thị Thanh Dung, quản trị Phạm Minh Tâm, lãnh đạo Phạm Tiến Dũng.
  // Đổi tên tài khoản thử cũ (giữ id → dữ liệu đã nhập vẫn đúng người), tạo tài khoản còn thiếu, ngừng các tài khoản khác. Chạy mỗi lần mở, chỉ sửa khi còn lệch.
  try { await tx(db => demoAccounts(db)); } catch (e) { console.warn('tài khoản demo', e); }
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
    const cs = await q(`SELECT c.id FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE c.kind NOT IN ('hoan_thien', 'thue') AND c.status NOT IN ('huy', 'thanh_ly')
      AND u.price_net IS NOT NULL AND coalesce(c.discount, 0) = 0 AND c.value IS DISTINCT FROM u.price_net + coalesce(u.maint_fee, 0)`);   // HĐ có giảm giá: giá đã chia lại theo tiền giảm — không đưa về giá danh mục
    if (cs.length) await tx(async db => { for (const c of cs) await B.syncContractValue(db, c.id, u); });
    await tx(db => B.fixRentValue(db, u));
    await tx(db => B.fixBaseDiscount(db));   // giá nền chia lại theo tiền giảm giá (1 lần)
    await tx(db => B.loanPayVouchers(db));
    await tx(db => B.fillVoucherInfo(db));   // phiếu thu / chi cũ: điền mã căn, khách hàng theo hợp đồng (06/11/2026)   // kỳ HĐ vay đã ghi nhận trả tay → phiếu chi (1 lần, 06/11/2026)   // HĐ thuê đã bị ghi giá bán ở bản trước
  } catch (e) { console.warn('đồng bộ giá phiếu', e); }
  // mẫu in đơn đăng ký chuẩn (thêm 27/10/2026) — giống máy thật: nạp mẫu còn thiếu, tắt mẫu khung cũ
  try { await require('../server/seed').ensureTemplates(); } catch (e) { console.warn('mẫu in', e); }
  // mẫu biểu dùng chung từ Git (docs/mau-bieu.json, 11/11/2026): quản trị bấm «Đẩy mẫu biểu lên Git» ở màn Mẫu biểu → mọi trình duyệt mở link nhận bản mới
  try { await syncTemplatesFromGit(q, one); } catch (e) { console.warn('mẫu biểu từ Git', e); }
  // 04/11/2026: bỏ 87 hồ sơ NOXH giả (Mẫu 4 demo) — không nạp nữa; trình duyệt đã nạp thì dọn ở bước «dọn dữ liệu thử» bên dưới
  // tòa K dự án CTS (thêm 27/10/2026, chưa có căn)
  if (!(await one("SELECT 1 FROM kd_building b JOIN kd_project p ON p.id = b.project_id WHERE p.code = 'CTS' AND b.code = 'K'")))
    await q("INSERT INTO kd_building (project_id, code, name, kind, created_at) SELECT id, 'K', 'Tòa K', 'chung_cu', now() FROM kd_project WHERE code = 'CTS'");
  // 04/11/2026: bỏ toàn bộ dữ liệu thử (hợp đồng, phiếu giữ chỗ, thu tiền, khách… gắn nhãn «thử») — demo chỉ còn bảng hàng, Mẫu 4 và dữ liệu người dùng tự nhập.
  // Trình duyệt đã lưu dữ liệu thử từ bản trước: xóa 1 lần (bản ghi tự nhập không có dấu thử nên được giữ)
  try {
    if (!localStorage.getItem('ctg-kd-demo-xoa-thu')) {
      say('Đang dọn dữ liệu thử…');
      console.log('đã xóa dữ liệu thử', await require('../server/seed').clearDemo());
      localStorage.setItem('ctg-kd-demo-xoa-thu', '1');
    }
  } catch (e) { console.warn('xóa dữ liệu thử', e); }
  // hồ sơ NOXH + khách giả nạp từ «Mau 4 - demo (du lieu gia).xlsx» (bản trước 04/11/2026): đánh dấu thử rồi xóa 1 lần
  // (chạy trước khi dựng 5 bộ dữ liệu thử; khách / hồ sơ đang được dữ liệu tự nhập dùng tới thì clearDemo giữ lại)
  try {
    if (!localStorage.getItem('ctg-kd-demo-xoa-m4')) {
      const F = 'Mau 4 - demo (du lieu gia).xlsx';
      const ks = (await q("SELECT id FROM kd_customer WHERE note = $1", ['Nhập từ ' + F])).map(r => r.id);
      if (ks.length) {
        say('Đang dọn hồ sơ NOXH mẫu…');
        await q('UPDATE kd_noxh_check SET is_demo = true WHERE customer_id = ANY($1)', [ks]);
        await q('UPDATE kd_customer SET is_demo = true WHERE id = ANY($1)', [ks]);
        await q("UPDATE kd_import SET is_demo = true WHERE file_name = $1", [F]);
        console.log('đã xóa hồ sơ NOXH mẫu', await require('../server/seed').clearDemo());
      }
      localStorage.setItem('ctg-kd-demo-xoa-m4', '1');
    }
  } catch (e) { console.warn('xóa hồ sơ NOXH mẫu', e); }
  // 07/11/2026: bỏ hẳn các bộ dữ liệu thử (5 bộ công nợ HĐMB + HĐ vay lãi 1%/năm) — không dựng nữa; trình duyệt đã có thì xóa 1 lần
  try {
    if (!localStorage.getItem('ctg-kd-demo-xoa-thu-0711')) {
      say('Đang xóa dữ liệu thử…');
      console.log('đã xóa dữ liệu thử', await require('../server/seed').clearDemo());
      localStorage.setItem('ctg-kd-demo-xoa-thu-0711', '1');
    }
  } catch (e) { console.warn('xóa dữ liệu thử', e); }
  // 07/11/2026: xóa hết dữ liệu các phân hệ (khách hàng, giữ chỗ, hợp đồng, thu chi, công nợ, bàn giao, CSKH, đại lý…) để test lại quy trình từ đầu —
  // chỉ giữ danh mục sản phẩm (dự án, tòa, căn hộ, bảng giá, gói hoàn thiện), mẫu in và tài khoản. Chạy 1 lần / trình duyệt; mã chứng từ đếm lại từ 1
  try {
    if (!localStorage.getItem('ctg-kd-demo-chi-dmsp-0711')) {
      say('Đang xóa dữ liệu các phân hệ (giữ danh mục sản phẩm)…');
      const M = require('../server/meta'), B = require('../server/biz'), C = require('../server/core');
      const KEEP = new Set(['project', 'building', 'unit', 'price_policy', 'package', 'template']);
      const dels = Object.values(M.E).filter(e => !KEEP.has(e.key));
      await tx(async db => {
        await db.q('SET LOCAL session_replication_role = replica');   // tắt kiểm tra khóa ngoại trong lúc xóa (các bảng tham chiếu vòng nhau)
        const fks = await db.q(`SELECT c.relname child, a.attname col, p.relname parent FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class p ON p.oid = k.confrelid
          JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1] WHERE k.contype = 'f'`);
        const delT = new Set(dels.map(e => e.table));
        for (const x of fks) if (!delT.has(x.child) && delT.has(x.parent) && x.child.startsWith('kd_') && !['kd_audit', 'kd_note', 'kd_file', 'kd_approval'].includes(x.child))
          await db.q(`UPDATE ${x.child} SET ${x.col} = NULL WHERE ${x.col} IS NOT NULL`);   // danh mục đang trỏ tới bản ghi bị xóa → bỏ liên kết
        for (const e of dels) await db.q(`DELETE FROM ${e.table}`);
        const ks = dels.map(e => e.key);
        for (const t of ['kd_audit', 'kd_note', 'kd_file', 'kd_approval']) await db.q(`DELETE FROM ${t} WHERE ent = ANY($1)`, [ks]);
        await db.q("DELETE FROM kd_audit WHERE ent = 'unit' AND action = 'cap_nhat_trang_thai'");
        await db.q('DELETE FROM kd_file_star WHERE file_id NOT IN (SELECT id FROM kd_file)');
        await db.q("DELETE FROM kd_import WHERE kind <> 'units'");
        for (const e of dels) for (const fd of e.fields.filter(fd => fd.t === 'code' && fd.prefix))
          await db.q('DELETE FROM kd_counter WHERE prefix LIKE $1', [fd.prefix.replace('{Y}', '%')]);
        await db.q('SET LOCAL session_replication_role = origin');
        for (const u of await db.q('SELECT id FROM kd_unit')) await B.recomputeUnit(db, u.id, C.SYS);   // căn về «còn bán» theo bảng hàng
      });
      localStorage.setItem('ctg-kd-demo-chi-dmsp-0711', '1');
    }
  } catch (e) { console.warn('xóa dữ liệu các phân hệ', e); }
  // 07/11/2026: danh mục khách hàng theo căn tòa K (CTS-K-101, 102, 103) — mã khách = mã căn; tên / SĐT / CCCD để người dùng tự điền. Tạo 1 lần / trình duyệt
  try {
    if (!localStorage.getItem('ctg-kd-demo-kh-k101')) {
      const pj = await one("SELECT id FROM kd_project WHERE code = 'CTS'"), u = await one("SELECT id FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      for (const code of ['CTS-K-101', 'CTS-K-102', 'CTS-K-103']) {
        if (await one('SELECT 1 FROM kd_customer WHERE upper(code) = $1', [code])) continue;
        const k = await one(`INSERT INTO kd_customer (code, full_name, stage, source, interest_project, owner_id, note, created_by)
          VALUES ($1, $2, 'da_nop_hsmn', 'truc_tiep', $3, $4, $5, $4) RETURNING id`, [code, 'Khách hàng căn ' + code, pj?.id || null, u?.id || null, 'Khách hàng của căn ' + code + ' — cập nhật họ tên, điện thoại, CCCD']);
        await q("INSERT INTO kd_audit (ent, rec_id, action, user_id, note) VALUES ('customer', $1, 'tao', $2, 'Tạo danh mục khách hàng theo căn')", [k.id, u?.id || null]);
      }
      localStorage.setItem('ctg-kd-demo-kh-k101', '1');
    }
  } catch (e) { console.warn('khách hàng căn tòa K', e); }
  const job = async () => { try { await tx(db => biz.jobs(db)); await q('DELETE FROM kd_session WHERE expires_at < now()'); } catch (e) { console.warn('job', e.message); } };
  await job(); setInterval(job, 2 * 60e3);

  const call = (method, url, headers, body) => new Promise((ok, fail) => { Promise.resolve(handle(fakeReq(method, url, headers, body), fakeRes(ok))).catch(fail); });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isApi(url)) return realFetch(input, init);
    const hd = {}; new Headers(init.headers || {}).forEach((v, k) => { hd[k] = v; });
    const method = (init.method || 'GET').toUpperCase(), res = await call(method, url, hd, init.body);
    if (method !== 'GET') await pg.syncToFs?.(false).catch(() => {});   // false = đợi ghi thật (không theo relaxedDurability)   // ghi xong xuống IndexedDB ngay (relaxedDurability) — tải lại trang không mất dữ liệu / phiên đổi vai trò
    return res;
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
  say('Đang mở giao diện…');
}
window.__ctgBoot = boot;
