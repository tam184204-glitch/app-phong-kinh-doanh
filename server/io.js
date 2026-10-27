// Nhập / xuất dữ liệu: xuất Excel mọi danh sách & báo cáo; nhập dữ liệu thật từ Excel / CSV
// (bảng hàng, khách hàng, hợp đồng cũ + lịch thanh toán, chứng từ thu Bravo, nhân viên); in hợp đồng theo mẫu.
// Nhập liệu chạy qua đúng core.create/update nên cùng luật kiểm tra như nhập tay; mỗi dòng một SAVEPOINT:
// dòng lỗi bị bỏ qua và báo lại, dòng đúng được ghi. «Kiểm tra trước» chạy toàn bộ rồi hoàn tác.
const crypto = require('crypto');
const C = require('./core');
const B = require('./biz');
const { E, VIRT, ROLES } = require('./meta');
const { tx, q, one } = require('./db');
const { buildXlsx, readXlsx } = require('./xlsx');
const { bad, deny, can, fmtMoney, dmy } = C;

// ---------- xuất ----------
const cellOf = (v, t) => v == null || v === '' ? '' : t === 'money' || t === 'num' || t === 'int' ? +v : t === 'date' ? dmy(v) : t === 'dt' ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : t === 'bool' ? (v ? 'Có' : '') : typeof v === 'object' ? JSON.stringify(v) : v;
function sheet(title, cols, rows, { sum, note } = {}) {
  const out = [[title], note ? [note] : [`Xuất lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`], [], ['STT', ...cols.map(c => c[1])]];
  rows.forEach((r, i) => out.push([i + 1, ...cols.map(c => cellOf(r[c[0]], c[2]))]));
  if (sum?.length) out.push(['Tổng', ...cols.map(c => sum.includes(c[0]) ? rows.reduce((s, r) => s + (+r[c[0]] || 0), 0) : '')]);
  return buildXlsx({ sheet: title.slice(0, 31), rows: out, boldRows: [0, 3, ...(sum?.length ? [out.length - 1] : [])], widths: [6, ...cols.map(c => c[2] === 'money' ? 16 : c[2] ? 12 : 22)] });
}
async function exportList(entKey, user, qs) {
  const e = E[entKey] || bad('Loại dữ liệu không hợp lệ');
  if (!can(user, e, 'x')) deny('Vai trò của bạn không được xuất dữ liệu này');
  const { rows } = await C.list(entKey, user, qs, { limit: 20000 });
  const keys = qs.cols ? String(qs.cols).split(',') : e.list;
  const cols = [];
  for (const k of keys) {
    const f = C.F[entKey][k];
    if (f) cols.push([f.t === 'ref' || f.t === 'refs' || f.t === 'user' ? k + '__l' : k, f.l, f.t === 'sel' ? null : f.t, f]);
    else if (VIRT[k]) cols.push([k === 'created_by' ? 'created_by__l' : k, VIRT[k], ['paid', 'actual', 'gap'].includes(k) ? 'money' : null]);
  }
  for (const r of rows) for (const c of cols) if (c[3]?.t === 'sel') r[c[0]] = await C.optLabel(c[3], r[c[0]]);
  for (const r of rows) for (const c of cols) if (c[3]?.t === 'check') r[c[0]] = (r[c[0]] || []).filter(x => x.st === 'da_nhan').length + '/' + (r[c[0]] || []).length;
  await q('INSERT INTO kd_audit (ent, action, user_id, note) VALUES ($1, $2, $3, $4)', [entKey, 'xuat_du_lieu', user.id, `${rows.length} dòng · bộ lọc ${JSON.stringify(qs)}`]);
  return { buf: sheet(`${e.code ? e.code + ' ' : ''}${e.title}`, cols, rows, { sum: cols.filter(c => c[2] === 'money').map(c => c[0]) }), name: `${e.code || entKey}_${C.today()}.xlsx` };
}

// ---------- đọc tệp ----------
const strip = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
    else if (ch === '"') inQ = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function readTable(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return [{ name: 'csv', rows: parseCsv(file.buffer.toString('utf8')) }];
  if (name.endsWith('.xlsx')) return readXlsx(file.buffer);
  bad('Chỉ nhận tệp .xlsx hoặc .csv (Excel: Lưu thành → Excel Workbook)');
}
// tìm dòng tiêu đề và ánh xạ cột theo bí danh
function mapRows(sheetRows, spec) {
  let h = -1, map = null;
  for (let i = 0; i < Math.min(sheetRows.length, 15); i++) {
    const cells = (sheetRows[i] || []).map(strip);
    const m = {}; let hit = 0;
    // khớp đúng tên cột trước («Mã» ≠ «Mã số thuế»), sau đó mới khớp phần đầu (bỏ qua tên quá ngắn như «Mã», «ID»)
    // mỗi cột chỉ gán cho một trường; khớp phần đầu theo thứ tự tên gọi khác của trường
    const used = new Set(), take = (k, idx) => { if (idx >= 0) { m[k] = idx; used.add(idx); hit++; } };
    for (const [k, aliases] of Object.entries(spec)) take(k, cells.findIndex((c, j) => c && !used.has(j) && aliases.includes(c)));
    for (const [k, aliases] of Object.entries(spec)) if (m[k] === undefined) for (const a of aliases.filter(a => a.length > 2)) { const j = cells.findIndex((c, j) => c && !used.has(j) && c.startsWith(a)); if (j >= 0) { take(k, j); break; } }
    if (hit >= Math.min(3, Object.keys(spec).length)) { h = i; map = m; break; }
  }
  if (h < 0) bad('Không nhận ra dòng tiêu đề. Hãy dùng tệp mẫu tải từ màn «Nhập dữ liệu».');
  const out = [];
  for (let i = h + 1; i < sheetRows.length; i++) {
    const r = sheetRows[i] || []; if (!r.some(c => String(c ?? '').trim())) continue;
    const o = { _line: i + 1 }; for (const [k, idx] of Object.entries(map)) o[k] = r[idx] === '' ? null : r[idx];
    out.push(o);
  }
  return { rows: out, cols: Object.keys(map) };
}

// ---------- các loại nhập ----------
const A = (...xs) => xs.map(strip);
const IMPORTS = {
  units: {
    title: 'Bảng hàng (dự án / tòa / căn)', roles: ['truong_phong'],
    // nhận cả mẫu App lẫn bảng giá xuất từ Bravo (Mã căn hộ, Đơn giá nền, Tổng tiền trước thuế, % thuế, Hướng cửa chính / ban công…)
    spec: { project: A('ma du an', 'du an'), building: A('ma toa', 'toa', 'khu'), code: A('ma can', 'ma can ho', 'can ho'), floor: A('tang'), kind: A('loai san pham', 'loai can ho', 'loai can', 'loai'), bedrooms: A('so phong ngu', 'phong ngu'),
      area_xd: A('dien tich xay dung', 'dt xay dung'), area_tt: A('dien tich thong thuy', 'dien tich song thuy', 'dt thong thuy', 'dien tich'),
      door_dir: A('huong cua chinh', 'huong cua'), balcony_dir: A('huong ban cong'), direction: A('huong'), position: A('vi tri'),
      base_price: A('don gia nen', 'don gia thong thuy'), pretax: A('tong tien truoc thue'), vat_pct: A('% thue', 'thue suat'), tax_amt: A('tong tien thue'),
      price_net: A('gia can ho sau thue', 'tong gia tri sau thue', 'tien sau thue', 'gia sau thue'), list_price: A('don gia', 'gia niem yet'),
      maint_fee: A('phi bao tri'), finish_value: A('gia tri hoan thien can ho', 'gia tri hoan thien', 'gia hoan thien'), total_price: A('tong gia can ho', 'tong cong', 'tong gia', 'tong tien'),
      handover_plan: A('thoi gian du kien ban giao', 'du kien ban giao'), activate: A('mo ban', 'kich hoat') },
    sample: [['CTS', 'O', 'CTS-O-0101', 1, '2PN', 2, '61,6', '', 'TN-ĐB', 'thường', '1.059.297.000', '1.054.935.000', '20.094.000', '1.075.029.000', 'tháng 3/2028', 'x']],
    async row(r, ctx) {
      // mã dự án / tòa của Bravo (VD «07») khác App → lấy theo mã căn CTS-O-0101 (dự án CTS, tòa O)
      const [pfx, bfx] = String(r.code || '').trim().toUpperCase().split('-');
      const pj = await ctx.db.one('SELECT id FROM kd_project WHERE upper(code) = upper($1)', [String(r.project || '').trim()]) || await ctx.db.one('SELECT id FROM kd_project WHERE upper(code) = $1', [pfx || ''])
        || bad(`Không có dự án «${r.project || pfx}» — tạo dự án trước`);
      const bcode = String(r.building || '').trim().toUpperCase() || bfx || bad('Thiếu mã tòa');
      let b = await ctx.db.one('SELECT id FROM kd_building WHERE project_id = $1 AND upper(code) = $2', [pj.id, bcode]);
      if (!b) b = (await C.create('building', { project_id: pj.id, code: bcode, name: 'Tòa ' + bcode, kind: 'chung_cu' }, ctx.user, { db: ctx.db, system: true })).row;
      const code = String(r.code || '').trim().toUpperCase().replace(/\s+/g, '') || bad('Thiếu mã căn');
      const kindRaw = strip(r.kind || r.bedrooms || ''); const nb = parseInt(String(r.bedrooms ?? kindRaw).replace(/\D/g, '')) || null;
      const kind = /lien ke/.test(kindRaw) ? 'lien_ke' : /shop/.test(kindRaw) ? 'shophouse' : /studio/.test(kindRaw) ? 'studio' : nb ? `${nb}pn` : null;
      const pos = strip(r.position); const position = /goc/.test(pos) ? 'goc' : /thang/.test(pos) ? 'thang' : pos ? 'thuong' : null;
      const no = (code.split('-').pop().match(/\d+/) || [''])[0];   // số căn: 0912 → tầng 9, 101 → tầng 1
      const floor = r.floor != null && String(r.floor).trim() !== '' && +r.floor < 100 ? +r.floor : no.length > 2 ? parseInt(no.slice(0, -2)) : +r.floor;
      const ab = s => s ? String(s).trim().split(/\s+/).map(w => w[0].toUpperCase()).join('') : '';   // Tây Nam → TN
      const vat = r.vat_pct == null || r.vat_pct === '' ? undefined : (n => n < 1 ? n * 100 : n)(+String(r.vat_pct).replace('%', '').replace(',', '.'));
      const data = { project_id: pj.id, building_id: b.id, code, floor, kind, bedrooms: nb, area_tt: r.area_tt, area_xd: r.area_xd, position,
        direction: r.direction || (r.door_dir || r.balcony_dir ? [ab(r.door_dir), ab(r.balcony_dir)].filter(Boolean).join('-') : undefined), door_dir: r.door_dir, balcony_dir: r.balcony_dir,
        list_price: r.list_price, base_price: r.base_price, pretax: r.pretax, vat_pct: vat, tax_amt: r.tax_amt, price_net: r.price_net, maint_fee: r.maint_fee, finish_value: r.finish_value,
        total_price: r.total_price, handover_plan: r.handover_plan, data_src: ctx.fileName };
      for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
      const old = await ctx.db.one('SELECT id, status FROM kd_unit WHERE project_id = $1 AND upper(code) = $2', [pj.id, code]);
      let row;
      if (old) row = (await C.update('unit', old.id, data, ctx.user, { db: ctx.db, system: true, action: 'nhap_excel' })).row;
      else row = (await C.create('unit', data, ctx.user, { db: ctx.db, system: true, demo: ctx.demo })).row;
      if (r.activate && await C.normField({ t: 'bool' }, r.activate) && !row.activated) { await C.sys(ctx.db, 'unit', row.id, { activated: true }, ctx.user, 'kich_hoat', 'Mở bán theo tệp nhập'); await B.recomputeUnit(ctx.db, row.id, ctx.user); }
      return old ? 'cap_nhat' : 'them';
    },
  },
  customers: {
    title: 'Khách hàng', roles: ['truong_phong', 'ho_so'],
    spec: { full_name: A('ho ten', 'ten khach hang', 'khach hang', 'ten'), code: A('ma', 'ma khach hang', 'ma kh'), tax_code: A('ma so thue', 'mst'), bravo_id: A('id', 'id bravo'), phone: A('dien thoai', 'so dien thoai', 'sdt'), phone2: A('dien thoai khac', 'sdt 2'), email: A('email'), id_no: A('cccd', 'so cccd', 'giay to dinh danh', 'cmnd'),
      id_date: A('ngay cap'), id_place: A('noi cap'), birth: A('ngay sinh'), address: A('dia chi'), source: A('nguon khach', 'nguon'), interest: A('du an quan tam'), owner: A('nhan vien phu trach', 'phu trach'), note: A('ghi chu') },
    sample: [['Nguyễn Văn A', 'CTS-O-0101', '', '6508782', '0912345678', '', 'a@example.com', '001234567890', '01/02/2021', 'Cục CS QLHC về TTXH', '12/05/1990', 'Yên Phong, Bắc Ninh', 'Trực tiếp', 'CTS', 'thu.banhang', '']],
    async row(r, ctx) {
      const owner = r.owner ? await ctx.db.one('SELECT id FROM kd_user WHERE lower(username) = lower($1) OR lower(full_name) = lower($1)', [String(r.owner).trim()]) : null;
      if (r.owner && !owner) bad(`Không có nhân viên «${r.owner}»`);
      const pj = r.interest ? await ctx.db.one('SELECT id FROM kd_project WHERE upper(code) = upper($1) OR name ILIKE $1', [String(r.interest).trim()]) : null;
      const code = r.code ? String(r.code).trim() : '';
      if (code && await ctx.db.one('SELECT 1 FROM kd_customer WHERE upper(code) = upper($1)', [code])) bad(`Mã khách hàng «${code}» đã có`);
      await C.create('customer', { code, tax_code: r.tax_code, bravo_id: r.bravo_id, full_name: r.full_name, phone: r.phone, phone2: r.phone2, email: r.email, id_no: r.id_no, id_date: r.id_date, id_place: r.id_place, birth: r.birth, address: r.address,
        source: r.source || 'truc_tiep', interest_project: pj?.id, owner_id: owner?.id || ctx.user.id, note: r.note }, ctx.user, { db: ctx.db, demo: ctx.demo, keepCode: !!code });
      return 'them';
    },
  },
  leads: {
    title: 'Khách gặp trực tiếp / gọi Hotline', roles: ['ban_hang', 'truong_phong', 'cskh', 'ho_so'],
    note: 'Mỗi dòng một lần liên hệ. Số điện thoại đã có hồ sơ thì chỉ ghi thêm nhật ký vào hồ sơ cũ, chưa có thì tự tạo khách hàng mới. Kênh: «Trực tiếp» hoặc «Hotline».',
    spec: { full_name: A('ho ten', 'ten khach hang', 'khach hang', 'ten'), phone: A('dien thoai', 'so dien thoai', 'sdt'), email: A('email'), channel: A('kenh', 'nguon'), interest: A('du an quan tam', 'du an'),
      content: A('noi dung trao doi', 'noi dung', 'nhu cau'), at: A('ngay lien he', 'ngay'), next_at: A('ngay nhac tiep', 'hen lai'), owner: A('nhan vien phu trach', 'phu trach') },
    sample: [['Nguyễn Văn A', '0912345678', 'a@example.com', 'Hotline', 'CTS', 'Hỏi giá căn 2PN, hẹn xem nhà mẫu cuối tuần', '27/10/2026 09:30', '01/11/2026', 'thu.banhang']],
    async row(r, ctx) {
      const owner = r.owner ? await ctx.db.one('SELECT id FROM kd_user WHERE lower(username) = lower($1) OR lower(full_name) = lower($1)', [String(r.owner).trim()]) : null;
      if (r.owner && !owner) bad(`Không có nhân viên «${r.owner}»`);
      const ch = /hotline|goi|dien thoai/.test(strip(r.channel)) ? 'hotline' : 'truc_tiep';
      const at = r.at ? C.isoDt(r.at) || bad(`Sai ngày liên hệ «${r.at}»`) : undefined;
      const out = await B.intakeLead(ctx.db, { channel: ch, full_name: r.full_name, phone: r.phone, email: r.email, project: r.interest, content: r.content, at, next_at: r.next_at,
        result: 'da_lien_he', owner_id: owner?.id }, ctx.user, { demo: ctx.demo });
      return out.new_customer ? 'them' : 'cap_nhat';
    },
  },
  contracts: {
    title: 'Hợp đồng đã ký (dữ liệu lịch sử) + lịch thanh toán', roles: ['truong_phong', 'ho_so'],
    note: 'Sheet 1: hợp đồng. Sheet 2 «Lịch thanh toán»: các đợt theo số HĐ. Hợp đồng nhập vào ở trạng thái «Đã ký»; căn tự chuyển «Đã ký hợp đồng».',
    spec: { number: A('so hop dong', 'so hd'), kind: A('loai hop dong', 'loai hd'), unit: A('ma can'), customer: A('ma khach hang', 'dien thoai khach hang', 'dien thoai kh', 'khach hang'), co_owner: A('dong so huu'),
      value: A('gia tri hop dong', 'gia tri'), signed_on: A('ngay ky'), owner: A('nhan vien phu trach', 'phu trach'), agent: A('dai ly', 'ma dai ly') },
    spec2: { number: A('so hop dong', 'so hd'), seq: A('dot', 'ky thu', 'stt dot'), name: A('ten dot', 'noi dung'), due_on: A('ngay den han', 'han thanh toan'), pct: A('ty le'), amount: A('so tien') },
    sample: [['HĐMB-CTS-O-0101/2026', 'HĐMB', 'CTS-O-0101', '0912345678', '', '1.075.029.000', '15/06/2026', 'thu.banhang', '']],
    sample2: [['HĐMB-CTS-O-0101/2026', 1, 'Đợt 1 – ký HĐ', '15/06/2026', 30, ''], ['HĐMB-CTS-O-0101/2026', 2, 'Đợt 2', '15/09/2026', 40, ''], ['HĐMB-CTS-O-0101/2026', 3, 'Đợt 3 – bàn giao', '15/03/2028', 25, ''], ['HĐMB-CTS-O-0101/2026', 4, 'Đợt 4 – nhận GCN', '15/03/2029', 5, '']],
    async row(r, ctx) {
      const u = await ctx.db.one('SELECT * FROM kd_unit WHERE upper(code) = upper($1)', [String(r.unit || '').trim()]) || bad(`Không có căn «${r.unit}»`);
      const ck = String(r.customer || '').trim(), dg = ck.replace(/\D/g, '');
      const k = await ctx.db.one("SELECT id FROM kd_customer WHERE upper(code) = upper($1) OR ($2 <> '' AND regexp_replace(phone,'\\D','','g') = $2)", [ck, dg]) || bad(`Không tìm thấy khách hàng «${ck}» — nhập danh sách khách hàng trước`);
      const owner = r.owner ? await ctx.db.one('SELECT id FROM kd_user WHERE lower(username) = lower($1) OR lower(full_name) = lower($1)', [String(r.owner).trim()]) : null;
      const kindS = strip(r.kind || 'hdmb'); const kind = /hoan thien/.test(kindS) ? 'hoan_thien' : /thue mua/.test(kindS) ? 'thue_mua' : /thue/.test(kindS) ? 'thue' : 'hdmb';
      if (!u.activated) await C.sys(ctx.db, 'unit', u.id, { activated: true }, ctx.user, 'kich_hoat', 'Nhập hợp đồng lịch sử');
      const sched = (ctx.extra.get(String(r.number).trim().toUpperCase().replace(/\s+/g, '')) || []).sort((a, b) => a.seq - b.seq);
      const c = (await C.create('contract', { number: r.number, kind, unit_id: u.id, customer_id: k.id, co_owner: r.co_owner, value: r.value, owner_id: owner?.id || ctx.user.id }, ctx.user, { db: ctx.db, demo: ctx.demo, system: true })).row;
      if (sched.length) await B.writeSchedule(ctx.db, c.id, await B.normSchedule(ctx.db, sched, c.value, `HĐ ${c.number}`), 'hop_dong', ctx.user, ctx.demo);
      else if (kind !== 'thue') bad(`HĐ ${c.number}: chưa có lịch thanh toán ở sheet 2`);
      const signed = C.isoDate(r.signed_on) || bad('Thiếu / sai ngày ký');
      await C.sys(ctx.db, 'contract', c.id, { status: 'da_ky', sign_status: 'da_ky', signed_on: signed }, ctx.user, 'nhap_lich_su', `Nhập từ tệp ${ctx.fileName}`);
      await B.recomputeUnit(ctx.db, u.id, ctx.user);
      return 'them';
    },
  },
  receipts: {
    title: 'Chứng từ thu tiền (xuất từ Bravo)', roles: ['ke_toan'],
    note: 'Chứng từ đã có (trùng số chứng từ) được bỏ qua — nhập lại cùng tệp không bị cộng hai lần.',
    spec: { voucher_no: A('so chung tu', 'ma chung tu', 'so ct'), voucher_date: A('ngay chung tu', 'ngay thu', 'ngay ct', 'ngay'), contract: A('so hop dong', 'so hd', 'ma can'), amount: A('so tien', 'phat sinh co', 'tien thu'), content: A('noi dung', 'dien giai'), installment: A('dot', 'ky thu') },
    sample: [['PT-2026-000123', '20/10/2026', 'HĐMB-CTS-O-0101/2026', '100.000.000', 'Thu tiền đợt 2 căn CTS-O-0101', 2]],
    async row(r, ctx) {
      const no = String(r.voucher_no || '').trim().toUpperCase() || bad('Thiếu số chứng từ');
      if (await ctx.db.one('SELECT 1 FROM kd_receipt WHERE upper(voucher_no) = $1', [no])) return 'trung';
      const key = String(r.contract || '').trim();
      const c = await ctx.db.one("SELECT c.id FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE (upper(c.number) = upper($1) OR upper(u.code) = upper($1)) AND c.status NOT IN ('huy','thanh_ly') AND c.kind <> 'hoan_thien' ORDER BY c.id DESC LIMIT 1", [key.replace(/\s+/g, '')]) || bad(`Không tìm thấy hợp đồng / căn «${key}»`);
      const inst = r.installment ? await ctx.db.one('SELECT id FROM kd_installment WHERE contract_id = $1 AND active AND seq = $2', [c.id, parseInt(r.installment)]) : null;
      await C.create('receipt', { voucher_no: no, voucher_date: r.voucher_date, contract_id: c.id, amount: r.amount, content: r.content, installment_id: inst?.id, src: 'bravo', synced_at: ctx.at }, ctx.user, { db: ctx.db, system: true, demo: ctx.demo });
      return 'them';
    },
    async after(ctx) { if (!ctx.dry) await ctx.db.q("UPDATE kd_setting SET value = jsonb_set(coalesce(value,'{}'::jsonb), '{last_sync}', to_jsonb($1::text)), updated_at = now(), updated_by = $2 WHERE key = 'bravo'", [ctx.at, ctx.user.id]); },
  },
  users: {
    title: 'Tài khoản nhân viên', roles: ['admin'],
    spec: { username: A('ten dang nhap', 'tai khoan'), full_name: A('ho ten'), role: A('vai tro'), title: A('chuc danh', 'chuc vu'), phone: A('dien thoai'), email: A('email') },
    sample: [['nguyenvana', 'Nguyễn Văn A', 'Nhân viên bán hàng', 'Chuyên viên kinh doanh', '0912345678', 'a@cattuonggroup.vn']],
    async row(r, ctx) {
      const role = ROLES.find(x => x[0] === r.role || strip(x[1]) === strip(r.role))?.[0] || bad(`Vai trò «${r.role}» không hợp lệ (${ROLES.map(x => x[1]).join(', ')})`);
      await createUser(ctx.db, { username: r.username, full_name: r.full_name, role, title: r.title, phone: r.phone, email: r.email }, ctx.user);
      return 'them';
    },
  },
};
async function importFile(kind, file, user, { dry, demo } = {}) {
  const I = IMPORTS[kind] || bad('Loại nhập không hợp lệ');
  if (user.role !== 'admin' && !I.roles.includes(user.role)) deny(`Vai trò của bạn không được nhập «${I.title}»`);
  const sheets = readTable(file);
  // tệp nhiều sheet (VD bảng giá Bravo: sheet tóm tắt + sheet chi tiết) → lấy sheet khớp nhiều cột nhất
  const tries = sheets.map(sh => { try { return mapRows(sh.rows, I.spec); } catch { return null; } }).filter(Boolean);
  const main = tries.sort((a, b) => b.cols.length - a.cols.length)[0] || mapRows(sheets[0].rows, I.spec);
  const extra = new Map();
  if (I.spec2) {
    const s2 = sheets.find((s, i) => i > 0 && /lich|thanh toan|dot/.test(strip(s.name))) || sheets[1];
    if (s2) for (const r of mapRows(s2.rows, I.spec2).rows) { const k = String(r.number || '').trim().toUpperCase().replace(/\s+/g, ''); if (!k) continue; (extra.get(k) || extra.set(k, []).get(k)).push(r); }
  }
  const res = { kind, title: I.title, total: main.rows.length, them: 0, cap_nhat: 0, trung: 0, loi: 0, errors: [], dry: !!dry, cols: main.cols };
  const at = new Date().toISOString();
  await tx(async db => {
    const ctx = { db, user, demo: !!demo, fileName: file.name, extra, at, dry };
    for (const r of main.rows) {
      await db.q('SAVEPOINT r');
      try { const out = await I.row(r, ctx); res[out]++; await db.q('RELEASE SAVEPOINT r'); }
      catch (e) {
        await db.q('ROLLBACK TO SAVEPOINT r');
        if (!(e instanceof C.HttpError) && !e.code) throw e;
        res.loi++; res.errors.push({ line: r._line, msg: e instanceof C.HttpError ? e.message : (await pgNice(e)) });
      }
    }
    if (I.after) await I.after(ctx);
    if (dry) throw Object.assign(new Error('dry'), { dryRun: true });
    await db.q('INSERT INTO kd_import (kind, file_name, by, total, ok, failed, errors, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [kind, file.name, user.id, res.total, res.them + res.cap_nhat, res.loi, JSON.stringify(res.errors.slice(0, 500)), !!demo]);
    await C.audit(db, 'import', null, 'nhap_' + kind, null, null, user, `${file.name}: thêm ${res.them}, cập nhật ${res.cap_nhat}, trùng ${res.trung}, lỗi ${res.loi}`);
  }).catch(e => { if (!e.dryRun) throw e; });
  return res;
}
const pgNice = async e => e.code === '23505' ? 'Trùng dữ liệu đã có' : e.code === '23514' ? 'Vi phạm quy tắc dữ liệu (' + e.constraint + ')' : e.code === '23503' ? 'Liên kết không hợp lệ' : e.message;
function importTemplate(kind) {
  const I = IMPORTS[kind] || bad('Loại nhập không hợp lệ');
  const LBL = {
    units: ['Mã dự án', 'Mã tòa', 'Mã căn', 'Tầng', 'Loại sản phẩm', 'Số phòng ngủ', 'Diện tích thông thủy', 'Diện tích xây dựng', 'Hướng', 'Vị trí', 'Đơn giá', 'Giá căn hộ sau thuế', 'Phí bảo trì', 'Tổng giá căn hộ', 'Thời gian dự kiến bàn giao', 'Mở bán (x)'],
    customers: ['Họ tên', 'Mã khách hàng', 'Mã số thuế', 'ID Bravo', 'Điện thoại', 'Điện thoại khác', 'Email', 'Số CCCD', 'Ngày cấp', 'Nơi cấp', 'Ngày sinh', 'Địa chỉ', 'Nguồn khách', 'Dự án quan tâm', 'Nhân viên phụ trách', 'Ghi chú'],
    leads: ['Họ tên', 'Điện thoại', 'Email', 'Kênh', 'Dự án quan tâm', 'Nội dung trao đổi', 'Ngày liên hệ', 'Ngày nhắc tiếp', 'Nhân viên phụ trách'],
    contracts: ['Số hợp đồng', 'Loại hợp đồng', 'Mã căn', 'Điện thoại khách hàng', 'Đồng sở hữu', 'Giá trị hợp đồng', 'Ngày ký', 'Nhân viên phụ trách', 'Mã đại lý'],
    receipts: ['Số chứng từ', 'Ngày chứng từ', 'Số hợp đồng', 'Số tiền', 'Nội dung', 'Đợt'],
    users: ['Tên đăng nhập', 'Họ tên', 'Vai trò', 'Chức danh', 'Điện thoại', 'Email'],
  }[kind];
  const rows = [[`MẪU NHẬP: ${I.title.toUpperCase()}`], [I.note || 'Giữ nguyên dòng tiêu đề. Xóa dòng ví dụ trước khi nhập. Ngày: dd/mm/yyyy. Tiền: số, có thể có dấu chấm ngăn cách.'], LBL, ...I.sample];
  if (!I.spec2) return buildXlsx({ sheet: 'Nhap', rows, boldRows: [0, 2], widths: LBL.map(() => 20) });
  // 2 sheet: tự dựng (buildXlsx chỉ 1 sheet) → xuất sheet 1 kèm hướng dẫn, sheet lịch tách tệp riêng là bất tiện; ghép tay 2 sheet
  return twoSheets(rows, [['LỊCH THANH TOÁN'], ['Mỗi dòng 1 đợt; tổng các đợt = giá trị hợp đồng (nhập Tỷ lệ % hoặc Số tiền)'], ['Số hợp đồng', 'Đợt', 'Tên đợt', 'Ngày đến hạn', 'Tỷ lệ (%)', 'Số tiền'], ...I.sample2]);
}
function twoSheets(a, b) {
  const { zip } = require('./xlsx');
  const one = rows => buildXlsx({ rows, boldRows: [0, 2] });
  const { unzip } = require('./xlsx');
  const A1 = unzip(one(a)), B1 = unzip(one(b));
  const files = Object.entries(A1).map(([k, v]) => [k, v]);
  const set = (k, v) => { const i = files.findIndex(f => f[0] === k); if (i >= 0) files[i][1] = v; else files.push([k, v]); };
  set('xl/worksheets/sheet2.xml', B1['xl/worksheets/sheet1.xml']);
  set('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hop dong" sheetId="1" r:id="rId1"/><sheet name="Lich thanh toan" sheetId="3" r:id="rId3"/></sheets></workbook>');
  set('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
  set('[Content_Types].xml', A1['[Content_Types].xml'].toString().replace('</Types>', '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'));
  return zip(files.map(([k, v]) => [k, Buffer.isBuffer(v) ? v : Buffer.from(v)]));
}

// ---------- tài khoản ----------
const hashPw = pw => { const salt = crypto.randomBytes(16); return 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync(pw, salt, 32).toString('hex'); };
const checkPw = (pw, h) => { if (!h) return false; const [, s, k] = h.split('$'); return crypto.timingSafeEqual(crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 32), Buffer.from(k, 'hex')); };
async function createUser(db, d, by, { trial, pw } = {}) {
  const username = String(d.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) bad('Tên đăng nhập 3–40 ký tự: chữ không dấu, số, dấu chấm / gạch');
  if (!String(d.full_name || '').trim()) bad('Thiếu họ tên');
  if (!ROLES.some(r => r[0] === d.role)) bad('Vai trò không hợp lệ');
  if (await db.one('SELECT 1 FROM kd_user WHERE lower(username) = $1', [username])) bad(`Tên đăng nhập «${username}» đã có`);
  const u = await db.one('INSERT INTO kd_user (username, full_name, role, title, dept, phone, email, is_trial, pw_hash, must_change) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id, username, full_name, role',
    [username, String(d.full_name).trim(), d.role, d.title || null, d.dept || 'Phòng Kinh doanh', d.phone || null, d.email || null, !!trial, hashPw(pw || process.env.DEFAULT_PW || '123456')]);
  await C.audit(db, 'user', u.id, 'tao_tai_khoan', null, { username, role: d.role }, by);
  return u;
}

// ---------- in hợp đồng theo mẫu ----------
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function read3(n, full) {
  const h = Math.floor(n / 100), t = Math.floor(n % 100 / 10), u = n % 10, out = [];
  if (h || full) out.push(DIGITS[h], 'trăm');
  if (t > 1) out.push(DIGITS[t], 'mươi'); else if (t === 1) out.push('mười'); else if ((h || full) && u) out.push('linh');
  if (u) out.push(t > 1 && u === 1 ? 'mốt' : t >= 1 && u === 5 ? 'lăm' : t > 1 && u === 4 ? 'tư' : DIGITS[u]);
  return out.join(' ');
}
function moneyWords(n) {
  n = Math.round(+n || 0); if (!n) return 'Không đồng';
  const scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'], groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const parts = [];
  for (let g = groups.length - 1; g >= 0; g--) if (groups[g]) parts.push(read3(groups[g], g < groups.length - 1), scales[g]);
  const s = parts.filter(Boolean).join(' ');
  return s[0].toUpperCase() + s.slice(1) + ' đồng';
}
const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function printContract(id, user, tplCode) {
  if (!can(user, E.contract, 'r')) deny();
  const c = C.notFound(await one(`SELECT c.*, u.code unit, u.floor, u.area_tt, u.direction, b.code building, p.name project, p.address p_addr, p.investor,
      k.full_name, k.phone, k.id_no, k.id_date, k.id_place, k.address FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_building b ON b.id = u.building_id
      JOIN kd_project p ON p.id = u.project_id JOIN kd_customer k ON k.id = c.customer_id WHERE c.id = $1`, [+id]), 'hợp đồng');
  const tpl = await one(`SELECT * FROM kd_template WHERE active AND ${tplCode ? 'code = $1' : "kind = 'hop_dong' ORDER BY id LIMIT 1"}`, tplCode ? [tplCode] : []);
  if (!tpl) bad('Chưa có mẫu hợp đồng — tạo ở Quản trị › Mẫu biểu');
  const inst = await q('SELECT * FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [c.id]);
  const pii = ['truong_phong', 'lanh_dao', 'ho_so', 'admin'].includes(user.role);
  const map = { so_hd: c.number, ten_kh: c.full_name, dien_thoai: c.phone, cccd: pii ? c.id_no : '(ẩn)', ngay_cap: pii ? dmy(c.id_date) : '', noi_cap: pii ? c.id_place : '', dia_chi: c.address, dong_so_huu: c.co_owner || '',
    ma_can: c.unit, du_an: c.project, dia_diem: c.p_addr, chu_dau_tu: c.investor, toa: c.building, tang: c.floor, dien_tich: String(c.area_tt).replace('.', ','), huong: c.direction,
    gia_tri: fmtMoney(c.value), gia_tri_chu: moneyWords(c.value), ngay: dmy(c.signed_on || C.today()),
    lich_thanh_toan: `<table class="sch"><tr><th>Đợt</th><th>Nội dung</th><th>Hạn thanh toán</th><th>Tỷ lệ</th><th>Số tiền (đồng)</th></tr>${inst.map(i => `<tr><td>${i.seq}</td><td>${escH(i.name)}</td><td>${dmy(i.due_on)}</td><td>${i.pct ?? ''}${i.pct != null ? '%' : ''}</td><td style="text-align:right">${fmtMoney(i.amount)}</td></tr>`).join('')}</table>` };
  const body = escH(tpl.content).replace(/\n/g, '<br>').replace(/\{(\w+)\}/g, (m, k) => k in map ? (k === 'lich_thanh_toan' ? map[k] : escH(map[k])) : m);
  await C.audit({ q }, 'contract', c.id, 'in_hop_dong', null, null, user, tpl.code);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escH(c.number)}</title><style>
    @page{size:A4;margin:20mm 18mm 20mm 25mm} body{font:13pt/1.5 "Times New Roman",serif;color:#000;max-width:170mm;margin:auto}
    .sch{border-collapse:collapse;width:100%;margin:6pt 0} .sch td,.sch th{border:1px solid #000;padding:3pt 5pt;font-size:12pt} .bar{font:13px system-ui;background:#f5f8fc;border:1px solid #d4deea;padding:8px 12px;border-radius:8px;margin:12px 0;display:flex;gap:8px;align-items:center}
    @media print{.bar{display:none}}</style></head><body><div class="bar">Bản in từ mẫu «${escH(tpl.name)}» · ${c.status === 'da_ky' ? 'Hợp đồng đã ký — bản in tham khảo' : 'Dự thảo'} <button onclick="print()">In / Lưu PDF</button></div>${body}</body></html>`;
}

module.exports = { exportList, sheet, importFile, importTemplate, IMPORTS, createUser, hashPw, checkPw, printContract, moneyWords };
