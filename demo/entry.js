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
    const cs = await q(`SELECT c.id FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE c.kind NOT IN ('hoan_thien', 'thue') AND c.status NOT IN ('huy', 'thanh_ly')
      AND u.price_net IS NOT NULL AND coalesce(c.discount, 0) = 0 AND c.value IS DISTINCT FROM u.price_net + coalesce(u.maint_fee, 0)`);   // HĐ có giảm giá: giá đã chia lại theo tiền giảm — không đưa về giá danh mục
    if (cs.length) await tx(async db => { for (const c of cs) await B.syncContractValue(db, c.id, u); });
    await tx(db => B.fixRentValue(db, u));
    await tx(db => B.fixBaseDiscount(db));   // giá nền chia lại theo tiền giảm giá (1 lần)   // HĐ thuê đã bị ghi giá bán ở bản trước
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
  // dữ liệu demo đã lưu: thêm 1 hợp đồng thử quá hạn ký để thấy cảnh báo (làm 1 lần trên mỗi trình duyệt)
  try { if (!localStorage.getItem('ctg-kd-demo-quahan')) { await q("UPDATE kd_contract SET plan_sign = CURRENT_DATE - 3 WHERE id = (SELECT id FROM kd_contract WHERE is_demo AND status = 'cho_duyet' ORDER BY id LIMIT 1)"); localStorage.setItem('ctg-kd-demo-quahan', '1'); } } catch (e) { console.warn('quá hạn ký', e); }
  // hợp đồng thử cần ký hôm nay để xem màn Lịch ký: 8 dự thảo trên căn còn trống (5 CTS, 3 TNS), tạo 1 lần, mỗi lần mở dời ngày về hôm nay
  const HD_THU = 'Thử lịch ký hôm nay';
  try {
    if (!localStorage.getItem('ctg-kd-demo-kyhomnay')) {
      const C = require('../server/core'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      const can = await q(`SELECT x.* FROM (SELECT u.id, u.total_price, p.code, row_number() OVER (PARTITION BY p.code ORDER BY u.code) n FROM kd_unit u JOIN kd_project p ON p.id = u.project_id
        WHERE p.code IN ('CTS', 'TNS') AND u.status IN ('con_ban', 'chua_mo_ban') AND NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.unit_id = u.id)) x WHERE x.n <= CASE x.code WHEN 'CTS' THEN 5 ELSE 3 END`);
      const kh = await q('SELECT k.id FROM kd_customer k WHERE NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.customer_id = k.id) ORDER BY k.id LIMIT 8');
      await tx(async db => { for (const [i, x] of can.entries()) if (kh[i]) await C.create('contract', { kind: 'hdmb', unit_id: x.id, customer_id: kh[i].id, value: +x.total_price || 1e9, sign_place: HD_THU, plan_sign: await (await db.one('SELECT CURRENT_DATE::text d')).d }, u, { db, system: true, demo: true }); });
      localStorage.setItem('ctg-kd-demo-kyhomnay', '1');
    }
    await q("UPDATE kd_contract SET plan_sign = CURRENT_DATE WHERE sign_place = $1 AND status = 'du_thao'", [HD_THU]);
  } catch (e) { console.warn('hợp đồng thử ký hôm nay', e); }
  // hợp đồng hoàn thiện thử (dữ liệu giả, 1 lần trên mỗi trình duyệt): 2 dự thảo, 2 đang rà soát, 2 đã ký, trên căn đã ký HĐ mua bán
  try {
    if (!localStorage.getItem('ctg-kd-demo-hoanthien')) {
      const C = require('../server/core'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      const cs = await q("SELECT c.unit_id, c.customer_id, c.owner_id FROM kd_contract c WHERE c.kind = 'hdmb' AND c.ptype = 'can_ho' AND c.status = 'da_ky' AND NOT EXISTS (SELECT 1 FROM kd_contract h WHERE h.unit_id = c.unit_id AND h.kind = 'hoan_thien') ORDER BY c.id LIMIT 6");
      const gia = [[320e6, 0], [380e6, 20e6], [320e6, 10e6], [280e6, 0], [380e6, 30e6], [320e6, 20e6]];
      for (const [i, c] of cs.entries()) {
        const r = await C.create('contract', { kind: 'hoan_thien', ptype: 'can_ho', ...c, finish_value: gia[i][0], discount: gia[i][1] || null, new_schedule: [{ name: 'Đợt 1 – sau khi ký hợp đồng', due_on: new Date(Date.now() + 864e6).toISOString().slice(0, 10), pct: 50 }, { name: 'Đợt 2 – trước khi bàn giao', due_on: new Date(Date.now() + 7776e6).toISOString().slice(0, 10), pct: 50 }] }, u, { demo: true });
        if (i >= 2) await C.submit('contract', r.row.id, u, {});
        if (i >= 4) await C.approve('contract', r.row.id, u, { ok: true });
      }
      localStorage.setItem('ctg-kd-demo-hoanthien', '1');
    }
  } catch (e) { console.warn('hợp đồng hoàn thiện thử', e); }
  // hợp đồng thuê thử (dữ liệu giả, 1 lần trên mỗi trình duyệt): 6 căn còn trống — 2 dự thảo, 1 chờ duyệt, 3 đã ký; lần thanh toán chia đều theo kỳ
  try {
    if (!localStorage.getItem('ctg-kd-demo-thue')) {
      const C = require('../server/core'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      const can = await q(`SELECT u.id FROM kd_unit u JOIN kd_project p ON p.id = u.project_id WHERE p.code IN ('CTS', 'TNS') AND u.status IN ('con_ban', 'chua_mo_ban')
        AND NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.unit_id = u.id) AND NOT EXISTS (SELECT 1 FROM kd_reservation r WHERE r.unit_id = u.id) ORDER BY p.code DESC, u.code DESC LIMIT 6`);
      const kh = await q('SELECT k.id FROM kd_customer k WHERE NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.customer_id = k.id) ORDER BY k.id DESC LIMIT 6');
      const addMon = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); };
      const ago = m => addMon(new Date().toISOString().slice(0, 8) + '05', -m);
      // [bắt đầu thuê, số tháng, số lần thanh toán, đơn giá thuê / tháng]
      const ds = [[ago(-1), 12, 4, 4.5e6], [ago(0), 24, 8, 5.2e6], [ago(1), 36, 12, 6e6], [ago(10), 60, 12, 4.8e6], [ago(6), 12, 12, 7.2e6], [ago(3), 24, 4, 5.5e6]];
      for (const [i, x] of can.entries()) {
        if (!kh[i]) break;
        const [a, n, p, rent] = ds[i], tot = rent * n, off = k => Math.round(k * n / p);
        const sched = Array.from({ length: p }, (_, k) => { const m1 = off(k) + 1, m2 = off(k + 1); return { name: `Tiền thuê kỳ ${k + 1}/${p} (tháng ${m1 === m2 ? m1 : `${m1}–${m2}`})`, due_on: addMon(a, off(k)), amount: (off(k + 1) - off(k)) * rent }; });   // mỗi kỳ = số tháng của kỳ × tiền thuê/tháng
        const r = await C.create('contract', { kind: 'thue', ptype: 'can_ho', unit_id: x.id, customer_id: kh[i].id, contract_on: a, eff_on: a, exp_on: new Date(Date.parse(addMon(a, n) + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10), term_months: n, pay_times: p, rent, value: tot, new_schedule: sched }, u, { system: true, demo: true });
        if (i >= 2) await C.submit('contract', r.row.id, u, {});
        if (i >= 3) await C.approve('contract', r.row.id, u, { ok: true });
      }
      localStorage.setItem('ctg-kd-demo-thue', '1');
    }
  } catch (e) { console.warn('hợp đồng thuê thử', e); }
  // phiếu thu tiền thuê thử (dữ liệu giả, 1 lần): HĐ thuê đã ký thu đủ các kỳ đã đến hạn — trừ 1 kỳ quá hạn và 1 kỳ thu một phần để thấy Tiến độ thu tiền
  try {
    if (!localStorage.getItem('ctg-kd-demo-thue-thu')) {
      const C = require('../server/core'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      const cs = await q("SELECT id FROM kd_contract WHERE kind = 'thue' AND status = 'da_ky' AND is_demo ORDER BY id");
      for (const [j, c] of cs.entries()) {
        const ins = await q("SELECT id, due_on::text d, amount FROM kd_installment WHERE contract_id = $1 AND active AND due_on < CURRENT_DATE ORDER BY seq", [c.id]);
        for (const [k, i] of ins.entries()) {
          const last = k === ins.length - 1; if (j === 0 && last) continue;
          await C.create('receipt', { voucher_no: `PT-THUE-${c.id}-${k + 1}`, voucher_date: i.d, contract_id: c.id, installment_id: i.id, amount: j === 1 && last ? Math.round(+i.amount / 2000) * 1000 : +i.amount, content: `Thu tiền thuê kỳ ${k + 1}` }, u, { system: true, demo: true });
        }
      }
      localStorage.setItem('ctg-kd-demo-thue-thu', '1');
    }
  } catch (e) { console.warn('phiếu thu tiền thuê thử', e); }
  // đăng ký thuê + hồ sơ thuê NOXH thử (dữ liệu giả: tên, SĐT, CCCD 999… không có thật), 1 lần trên mỗi trình duyệt
  try {
    if (!localStorage.getItem('ctg-kd-demo-dk-thue')) {
      const C = require('../server/core'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      const ten = ['Trần Minh Khôi', 'Nguyễn Thu Hà', 'Lê Quang Vinh', 'Phạm Ngọc Ánh', 'Đỗ Hải Nam', 'Vũ Thanh Tâm', 'Bùi Phương Linh', 'Hoàng Đức Anh', 'Ngô Bảo Trâm'];
      const fake = i => ({ phone: `09${String(81000000 + i * 1371917 % 18999999).padStart(8, '0')}`, id_no: `999${String(200000000 + i * 7919311 % 799999999)}` });
      const can = await q(`SELECT u.id, u.project_id, u.area_tt FROM kd_unit u JOIN kd_project p ON p.id = u.project_id WHERE p.code = 'TNS' AND u.status = 'con_ban'
        AND NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.unit_id = u.id) AND NOT EXISTS (SELECT 1 FROM kd_reservation r WHERE r.unit_id = u.id) ORDER BY u.code DESC LIMIT 4`);
      // [tiền thuê/tháng, thời hạn, tiến trình]
      const dk = [[4.8e6, 12, 'tiep_nhan'], [5.2e6, 24, 'cho_xet_duyet'], [5.5e6, 36, 'du_dk'], [6e6, 60, 'tiep_nhan']];
      for (const [i, x] of can.entries()) {
        const r = await C.create('reservation', { deal: 'thue', unit_id: x.id, cust_name: ten[i], ...fake(i), id_date: '2021-06-1' + i, id_place: 'Cục Cảnh sát QLHC về TTXH', address: ['Từ Sơn', 'Yên Phong', 'Tiên Du', 'Quế Võ'][i] + ', Bắc Ninh',
          rent: dk[i][0], term_months: dk[i][1], progress: dk[i][2], reg_state: 'giu_cho', source: 'truc_tiep', note: 'Dữ liệu thử — đăng ký thuê' }, u, { system: true, demo: true });
        await C.submit('reservation', r.row.id, u, { demo: true }); await C.approve('reservation', r.row.id, u, { ok: true });
      }
      // hồ sơ thuê NOXH: 2 dự thảo, 2 chờ xét duyệt (đã nộp SXD), 1 đã duyệt SXD
      const tns = await one("SELECT id FROM kd_project WHERE code = 'TNS'"), un = await q("SELECT c.unit_id, u.area_tt FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE c.kind = 'thue' AND c.is_demo ORDER BY c.id LIMIT 5");
      const dt = ['Người thu nhập thấp tại khu vực đô thị', 'Người lao động đang làm việc tại các doanh nghiệp trong và ngoài khu công nghiệp', 'Cán bộ, công chức, viên chức theo quy định của pháp luật về cán bộ, công chức, viên chức'];
      const d0 = await (await one("SELECT (CURRENT_DATE - 40)::text d")).d, plus = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
      for (let i = 0; i < 5; i++) {
        const k = i + 4, f = fake(k), rec = un[i] || {};
        const r = await C.create('noxh_check', { reg_kind: 'thue', project_id: tns.id, unit_id: rec.unit_id ?? null, unit_area: rec.area_tt ?? null, received_on: plus(d0, i * 6),
          head: [{ name: ten[k] || ten[i], phone: f.phone, bday: 10 + i, bmonth: 1 + i, byear: 1988 + i, id_no: f.id_no, job: 'Người lao động làm việc tại doanh nghiệp', doi_tuong: dt[i % 3], confirm_org: 'UBND phường Đình Bảng',
            housing: 'Chưa có nhà ở thuộc sở hữu của hộ gia đình', province: 'Bắc Ninh', district: 'Từ Sơn', commune: 'Đình Bảng', income: 'Có thu nhập bình quân hàng tháng thực nhận không quá 25 triệu đồng', relation: 'Chủ hộ' }],
          members: i % 2 ? [{ name: 'Nguyễn Văn Bình', relation: 'Vợ (Chồng)', byear: 1990 + i }] : [], note: 'Dữ liệu thử — hồ sơ thuê' }, u, { system: true, demo: true });
        const id = r.row.id;
        if (i >= 2) await q("UPDATE kd_noxh_check SET status = 'cho_duyet', sxd_submit_on = $2 WHERE id = $1", [id, plus(d0, i * 6 + 5)]);
        if (i === 4) await q("UPDATE kd_noxh_check SET status = 'da_duyet', sxd_result = 'duoc_duyet', sxd_approved_on = $2, sxd_doc_no = '1234/SXD-QLN' WHERE id = $1", [id, plus(d0, 38)]);
      }
      localStorage.setItem('ctg-kd-demo-dk-thue', '1');
    }
  } catch (e) { console.warn('đăng ký thuê / hồ sơ thuê thử', e); }
  // HĐ thuê thử ở CTS (tòa K, O — dữ liệu giả, 1 lần): đang thuê, dự thảo, và 1 căn ĐÃ HẾT HẠN THUÊ có khách đăng ký mua (hết kỳ thuê căn bán tiếp được)
  try {
    if (!localStorage.getItem('ctg-kd-demo-thue-cts')) {
      const C = require('../server/core'), B = require('../server/biz'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      const free = (b, n) => q(`SELECT u.id FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project p ON p.id = u.project_id WHERE p.code = 'CTS' AND b.code = $1 AND u.status IN ('con_ban', 'chua_mo_ban')
        AND NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.unit_id = u.id) AND NOT EXISTS (SELECT 1 FROM kd_reservation r WHERE r.unit_id = u.id) ORDER BY u.floor DESC, u.code LIMIT $2`, [b, n]);
      const can = [...await free('K', 4), ...await free('O', 2)];
      const kh = await q('SELECT k.id FROM kd_customer k WHERE NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.customer_id = k.id) AND NOT EXISTS (SELECT 1 FROM kd_reservation r WHERE r.customer_id = k.id) ORDER BY k.id LIMIT 7');
      const addMon = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); };
      const ago = m => addMon(new Date().toISOString().slice(0, 8) + '10', -m);
      // [bắt đầu thuê, số tháng, số kỳ, tiền thuê/tháng, đã ký?] — dòng 4 (tòa K): thuê 12 tháng từ 15 tháng trước → đã hết hạn
      const ds = [[ago(4), 12, 4, 5e6, 1], [ago(1), 24, 8, 5.5e6, 1], [ago(-1), 12, 12, 4.8e6, 0], [ago(15), 12, 4, 4.5e6, 1], [ago(7), 12, 12, 6e6, 1], [ago(2), 36, 12, 6.5e6, 1]];
      let ended = null;
      for (const [i, x] of can.entries()) {
        if (!kh[i]) break;
        const [a, n, p, rent, signed] = ds[i], off = k => Math.round(k * n / p);
        const sched = Array.from({ length: p }, (_, k) => { const m1 = off(k) + 1, m2 = off(k + 1); return { name: `Tiền thuê kỳ ${k + 1}/${p} (tháng ${m1 === m2 ? m1 : `${m1}–${m2}`})`, due_on: addMon(a, off(k)), amount: (off(k + 1) - off(k)) * rent }; });
        const r = await C.create('contract', { kind: 'thue', ptype: 'can_ho', unit_id: x.id, customer_id: kh[i].id, contract_on: a, eff_on: a, exp_on: new Date(Date.parse(addMon(a, n) + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10), term_months: n, pay_times: p, rent, value: rent * n, new_schedule: sched }, u, { system: true, demo: true });
        if (signed) { await C.submit('contract', r.row.id, u, {}); await C.approve('contract', r.row.id, u, { ok: true }); }
        if (signed) for (const [k, it] of (await q("SELECT id, due_on::text d, amount FROM kd_installment WHERE contract_id = $1 AND active AND due_on < CURRENT_DATE ORDER BY seq", [r.row.id])).entries())
          await C.create('receipt', { voucher_no: `PT-THUE-${r.row.id}-${k + 1}`, voucher_date: it.d, contract_id: r.row.id, installment_id: it.id, amount: +it.amount, content: `Thu tiền thuê kỳ ${k + 1}` }, u, { system: true, demo: true });
        if (i === 3) ended = x.id;
      }
      // căn đã hết hạn thuê: trở lại trống → có khách đăng ký MUA
      if (ended && kh[6]) {
        await tx(db => B.recomputeUnit(db, ended, u));
        const rs = await C.create('reservation', { deal: 'mua', unit_id: ended, customer_id: kh[6].id, source: 'truc_tiep', note: 'Dữ liệu thử — căn đã hết hạn thuê, khách đăng ký mua' }, u, { system: true, demo: true });
        await C.submit('reservation', rs.row.id, u, { demo: true }); await C.approve('reservation', rs.row.id, u, { ok: true });
      }
      // hồ sơ thuê thử chưa có danh mục giấy tờ → điền danh mục bản thuê (đã nhận đủ)
      const ck = (await B.defaultList({ q, one }, 'checklist_noxh', '_all')).map(x => ({ ...x, n: B.rentWord(x.n), st: 'da_nhan', note: '' }));
      await q("UPDATE kd_noxh_check SET items = $1 WHERE reg_kind = 'thue' AND is_demo AND (items IS NULL OR items::text IN ('[]', 'null'))", [JSON.stringify(ck)]);
      localStorage.setItem('ctg-kd-demo-thue-cts', '1');
    }
  } catch (e) { console.warn('HĐ thuê thử CTS', e); }
  // bản chất giao dịch thử (dữ liệu giả, 1 lần) — CTS tòa K: (1) HĐ vay bán căn chưa ký HĐMB, (2) HĐ vay → HĐMB đã ký (nối giao dịch), (3) HĐ thuê bản chất bán
  try {
    if (!localStorage.getItem('ctg-kd-demo-ban-chat')) {
      const C = require('../server/core'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      const can = await q(`SELECT u.id, u.total_price FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project p ON p.id = u.project_id WHERE p.code = 'CTS' AND b.code = 'K' AND u.status IN ('con_ban', 'chua_mo_ban')
        AND NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.unit_id = u.id) AND NOT EXISTS (SELECT 1 FROM kd_reservation r WHERE r.unit_id = u.id) ORDER BY u.floor DESC, u.code LIMIT 3 OFFSET 8`);
      const kh = await q('SELECT k.id FROM kd_customer k WHERE NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.customer_id = k.id) AND NOT EXISTS (SELECT 1 FROM kd_reservation r WHERE r.customer_id = k.id) ORDER BY k.id DESC LIMIT 3');
      const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
      const sign = async id => { await C.submit('contract', id, u, {}); await C.approve('contract', id, u, { ok: true }); };
      const pay = async (id, upto) => { for (const [k, it] of (await q('SELECT id, due_on::text d, amount FROM kd_installment WHERE contract_id = $1 AND active AND due_on <= $2 ORDER BY seq', [id, upto])).entries())
        await C.create('receipt', { voucher_no: `PT-${id}-${k + 1}`, voucher_date: it.d, contract_id: id, installment_id: it.id, amount: +it.amount, content: `Thu theo hợp đồng — kỳ ${k + 1}` }, u, { system: true, demo: true }); };
      if (can.length === 3 && kh.length === 3) {
        await q('UPDATE kd_unit SET activated = true WHERE id = ANY($1)', [can.map(x => x.id)]);   // căn đã giao dịch = đã mở bán
        // (1) HĐ vay bán căn, chưa ký HĐMB
        const v1 = (await C.create('contract', { kind: 'vay', nature: 'ban', ptype: 'can_ho', unit_id: can[0].id, customer_id: kh[0].id, contract_on: day(-60), value: 300e6, plan_hdmb: day(45), rent: 5e6,
          new_schedule: [{ name: 'Đợt 1 – khi ký HĐ vay', due_on: day(-60), amount: 150e6 }, { name: 'Đợt 2', due_on: day(-10), amount: 150e6 }] }, u, { system: true, demo: true })).row;
        await sign(v1.id); await pay(v1.id, day(-30));
        // (2) HĐ vay → HĐMB (tự nối vì cùng căn) — tiền vay không trừ vào giá mua
        const v2 = (await C.create('contract', { kind: 'vay', nature: 'ban', ptype: 'can_ho', unit_id: can[1].id, customer_id: kh[1].id, contract_on: day(-150), value: 200e6, rent: 5e6,
          new_schedule: [{ name: 'Đợt 1 – khi ký HĐ vay', due_on: day(-150), amount: 200e6 }] }, u, { system: true, demo: true })).row;
        await sign(v2.id); await pay(v2.id, day(0));
        const price = +can[1].total_price || 1.2e9;
        const m2 = (await C.create('contract', { kind: 'hdmb', ptype: 'can_ho', unit_id: can[1].id, customer_id: kh[1].id, contract_on: day(-20), value: price,
          new_schedule: [{ name: 'Đợt 1 – khi ký HĐMB', due_on: day(-20), pct: 30 }, { name: 'Đợt 2 – khi bàn giao', due_on: day(120), pct: 70 }] }, u, { system: true, demo: true })).row;
        await sign(m2.id); await pay(m2.id, day(0));
        // (3) HĐ thuê bản chất bán: thuê trước, ký HĐMB sau
        const t3 = (await C.create('contract', { kind: 'thue', nature: 'ban', ptype: 'can_ho', unit_id: can[2].id, customer_id: kh[2].id, contract_on: day(-90), eff_on: day(-90), exp_on: day(275), term_months: 12, pay_times: 4, rent: 5e6, value: 60e6, plan_hdmb: day(90),
          new_schedule: [0, 3, 6, 9].map((m, k) => ({ name: `Tiền thuê kỳ ${k + 1}/4 (tháng ${m + 1}–${m + 3})`, due_on: day(-90 + m * 30), amount: 15e6 })) }, u, { system: true, demo: true })).row;
        await sign(t3.id); await pay(t3.id, day(0));
      }
      localStorage.setItem('ctg-kd-demo-ban-chat', '1');
    }
  } catch (e) { console.warn('bản chất giao dịch thử', e); }
  // HĐ vay thử — lãi & gốc (dữ liệu giả, 1 lần): HĐ vay K-0913 trả lãi bằng tiền thuê 1 tháng / tháng, tick chọn HĐ thuê đi kèm; HĐ vay K-0801 lãi suất 8%/năm trả theo quý
  try {
    if (!localStorage.getItem('ctg-kd-demo-vay-lai')) {
      const C = require('../server/core'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      const vs = await q("SELECT * FROM kd_contract WHERE kind = 'vay' AND is_demo ORDER BY id LIMIT 2");
      const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
      if (vs.length === 2) {
        const [v1, v2] = vs, kh = await one('SELECT k.id FROM kd_customer k WHERE NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.customer_id = k.id) AND NOT EXISTS (SELECT 1 FROM kd_reservation r WHERE r.customer_id = k.id) ORDER BY k.id LIMIT 1');
        // HĐ thuê đi kèm HĐ vay 1 (cùng căn): tiền thuê 5,5 tr/tháng = tiền lãi trả khách mỗi tháng
        const a1 = v1.contract_on;
        const t = (await C.create('contract', { kind: 'thue', nature: 'thue', ptype: 'can_ho', unit_id: v1.unit_id, customer_id: kh?.id || v1.customer_id, contract_on: a1, eff_on: a1, exp_on: new Date(Date.parse(a1 + 'T00:00:00Z') + 364 * 864e5).toISOString().slice(0, 10), term_months: 12, pay_times: 12, rent: 5.5e6, value: 66e6, link_ids: [v1.id],
          new_schedule: Array.from({ length: 12 }, (_, k) => ({ name: `Tiền thuê kỳ ${k + 1}/12 (tháng ${k + 1})`, due_on: new Date(Date.parse(a1 + 'T00:00:00Z') + k * 30.4 * 864e5).toISOString().slice(0, 10), amount: 5.5e6 })) }, u, { system: true, demo: true })).row;
        await C.submit('contract', t.id, u, {}); await C.approve('contract', t.id, u, { ok: true });
        await C.update('contract', v1.id, { loan_recv_on: a1, loan_tranches: 2, eff_on: a1, term_months: 12, exp_on: null, int_mode: 'tien_thue', int_period: '1', principal_method: 'dao_han', rent: null, link_ids: [t.id], int_note: 'Lãi trả cuối mỗi tháng = 1 tháng tiền thuê căn hộ theo HĐ thuê đi kèm' }, u, { system: true, demo: true });
        await C.update('contract', v2.id, { loan_recv_on: v2.contract_on, loan_tranches: 1, eff_on: v2.contract_on, term_months: 12, exp_on: null, int_mode: 'lai_suat', loan_rate: 8, int_period: '3', principal_method: 'dao_han', int_note: 'Lãi 8%/năm trên số tiền vay, trả cuối mỗi quý' }, u, { system: true, demo: true });
        // đã trả lãi các kỳ đã đến hạn — HĐ vay 1 chừa kỳ gần nhất (quá hạn chưa trả)
        for (const v of [v1, v2]) {
          const ls = await q("SELECT id, due_on::text d, amount FROM kd_loan_pay WHERE contract_id = $1 AND kind = 'lai' AND due_on < $2 ORDER BY seq", [v.id, day(0)]);
          for (const [k, x] of ls.entries()) if (!(v === v1 && k === ls.length - 1)) await q('UPDATE kd_loan_pay SET paid_on = $2, paid_amt = $3, note = $4 WHERE id = $1', [x.id, x.d, x.amount, 'Chuyển khoản']);
        }
      }
      localStorage.setItem('ctg-kd-demo-vay-lai', '1');
    }
  } catch (e) { console.warn('HĐ vay lãi & gốc thử', e); }
  // phiếu đăng ký thử đã hủy để xem tab Đã hủy (trạng thái / ngày trả hồ sơ, file scan): dữ liệu chưa có phiếu hủy nào thì hủy 3 phiếu mua thử chưa lập hợp đồng
  // (không đụng phiếu của các kịch bản thuê / hết hạn thuê ở trên), 1 phiếu ghi đã trả hồ sơ
  try {
    if (!(await one("SELECT 1 AS x FROM kd_reservation WHERE status = 'huy' LIMIT 1"))) {
      const C = require('../server/core'), u = await one("SELECT * FROM kd_user WHERE role = 'truong_phong' AND active ORDER BY id LIMIT 1");
      const rs = await q("SELECT id FROM kd_reservation WHERE is_demo AND coalesce(deal, 'mua') = 'mua' AND status IN ('qua_han', 'giu_cho', 'da_coc') AND coalesce(note, '') NOT LIKE 'Dữ liệu thử%' ORDER BY id LIMIT 3");
      for (const r of rs) await C.update('reservation', r.id, { reg_state: 'huy', note: 'Khách xin hủy đăng ký (dữ liệu thử)' }, u);
      if (rs[0]) await C.update('reservation', rs[0].id, { doc_ret: 'da_tra', doc_ret_on: await (await one('SELECT CURRENT_DATE::text d')).d }, u);
    }
  } catch (e) { console.warn('phiếu hủy thử', e); }
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
