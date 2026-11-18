// Nhập / xuất dữ liệu: xuất Excel mọi danh sách & báo cáo; nhập dữ liệu thật từ Excel / CSV
// (bảng hàng, khách hàng, hợp đồng cũ + lịch thanh toán, chứng từ thu Bravo, nhân viên); in hợp đồng theo mẫu.
// Nhập liệu chạy qua đúng core.create/update nên cùng luật kiểm tra như nhập tay; mỗi dòng một SAVEPOINT:
// dòng lỗi bị bỏ qua và báo lại, dòng đúng được ghi. «Kiểm tra trước» chạy toàn bộ rồi hoàn tác.
const crypto = require('crypto');
const C = require('./core');
const B = require('./biz');
const M = require('./meta'), { E, VIRT, ROLES } = M;
const { tx, q, one } = require('./db');
const { buildXlsx, readXlsx } = require('./xlsx');
const { bad, deny, can, fmtMoney, dmy } = C;

// ---------- xuất ----------
const cellOf = (v, t) => v == null || v === '' ? '' : t === 'money' || t === 'num' || t === 'int' ? +v : t === 'date' ? dmy(v) : t === 'dt' ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : t === 'bool' ? (v ? 'Có' : '') : typeof v === 'object' ? JSON.stringify(v) : v;
// groups: nhãn nhóm của từng cột (cùng thứ tự cols, '' = không nhóm) → 2 tầng tiêu đề: cột cùng nhóm liền nhau gộp ô nhóm, cột không nhóm gộp dọc 2 dòng
// noNo: bỏ cột STT; dòng có _b: in đậm (dòng nhóm / tổng tòa / tổng cộng của báo cáo phân cấp)
function sheet(title, cols, rows, { sum, note, groups, noNo } = {}) {
  if (noNo) { const out = [[title], [note || ''], [], cols.map(c => c[1])], bold = [0, 3];
    rows.forEach(r => { if (r._b) bold.push(out.length); out.push(cols.map(c => cellOf(r[c[0]], c[2]))); });
    return buildXlsx({ sheet: title.slice(0, 31), rows: out, boldRows: bold, widths: cols.map(c => c[2] === 'money' ? 18 : c[3] || 22) }); }
  groups = Array.isArray(groups) ? cols.map((c, i) => String(groups[i] || '')) : null;
  const g2 = groups?.some(Boolean), merges = [], L = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  const out = [[title], note ? [note] : [`Xuất lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`], []];
  if (g2) {
    out.push(['STT', ...cols.map((c, i) => groups[i] ? (groups[i] !== groups[i - 1] ? groups[i] : '') : c[1])], ['', ...cols.map((c, i) => groups[i] ? c[1] : '')]);
    merges.push('A4:A5');
    cols.forEach((c, i) => {
      if (!groups[i]) merges.push(`${L(i + 1)}4:${L(i + 1)}5`);
      else if (groups[i] !== groups[i - 1]) { let j = i; while (groups[j + 1] === groups[i]) j++; if (j > i) merges.push(`${L(i + 1)}4:${L(j + 1)}4`); }
    });
  } else out.push(['STT', ...cols.map(c => c[1])]);
  const h = out.length;
  rows.forEach((r, i) => out.push([i + 1, ...cols.map(c => cellOf(r[c[0]], c[2]))]));
  if (sum?.length) out.push(['Tổng', ...cols.map(c => sum.includes(c[0]) ? rows.reduce((s, r) => s + (+r[c[0]] || 0), 0) : '')]);
  return buildXlsx({ sheet: title.slice(0, 31), rows: out, merges, boldRows: [0, h - 1, ...(sum?.length ? [out.length - 1] : [])], widths: [6, ...cols.map(c => c[2] === 'money' ? 16 : c[2] ? 12 : 22)],
    ...(g2 ? { styleOf: (ri, ci) => ri === 3 || ri === 4 ? 4 : null, heights: { 4: 45 } } : {}) });
}
async function exportList(entKey, user, qs) {
  const e = E[entKey] || bad('Loại dữ liệu không hợp lệ');
  if (!can(user, e, 'x')) deny('Vai trò của bạn không được xuất dữ liệu này');
  const { rows } = await C.list(entKey, user, qs, { limit: 20000 });
  const L = e.lists?.[qs.group], keys = (qs.cols ? String(qs.cols).split(',') : L?.cols || e.list).flatMap(k => qs.status === 'thanh_ly' && k === 'contract_on' && C.F[entKey].liquidated_on ? ['liquidated_on', 'liquidate_reason', 'liquidate_note'] : [k])   // tab Đã thanh lý
    .concat(qs.status === 'huy' && C.F[entKey].doc_ret ? ['doc_ret', 'doc_ret_on', 'ret_files'] : []);   // tab Đã hủy (phiếu đăng ký): 3 cột trả hồ sơ ở cuối, như trên màn hình
  const cols = [];
  rows.forEach((r, i) => { r.stt = i + 1; if (r.ret_files) r.ret_files = r.ret_files.map(f => f.name).join('; '); });
  for (const k of keys) {
    if (k === 'prints' || k === 'bbgn') continue;
    const f = C.F[entKey][k];
    if (f) cols.push([f.t === 'ref' || f.t === 'refs' || f.t === 'user' ? k + '__l' : k, L?.label?.[k] || f.l, f.t === 'sel' ? null : f.t, f]);
    else if (VIRT[k]) cols.push([k === 'created_by' ? 'created_by__l' : k, L?.label?.[k] || VIRT[k], ['paid', 'actual', 'gap'].includes(k) ? 'money' : null]);
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
// chứng từ thu (Bravo / MISA): tìm hợp đồng đang hiệu lực (không tính HĐ hoàn thiện riêng)
const LIVE_HD = "c.status NOT IN ('huy','thanh_ly') AND c.kind <> 'hoan_thien'";
const upKey = s => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');
async function receiptContract(r, ctx) {
  const key = upKey(r.contract);
  if (key) return (await ctx.db.one(`SELECT c.id FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE (upper(c.number) = $1 OR upper(u.code) = $1) AND ${LIVE_HD} ORDER BY c.id DESC LIMIT 1`, [key]))?.id
    || bad(`Không tìm thấy hợp đồng / căn «${String(r.contract).trim()}»`);
  // số HĐ hoặc mã căn ghi trong diễn giải (VD «Thu đợt 2 căn CTS-O-0101»; gõ cách / gạch dưới thay gạch ngang vẫn nhận).
  // Số HĐ so với diễn giải GỐC (số HĐ có dấu chấm: HDCH.2607-0001); chỉ khi dò mã căn mới đổi «_» «.» thành «-»
  const txt = String(r.content || '').toUpperCase().replace(/[\s_.]+(?=[0-9A-Z])/g, m => /[_.]/.test(m) ? '-' : m);
  if (txt.trim()) {
    ctx.hdKeys ||= await ctx.db.q(`SELECT c.id, upper(c.number) num, upper(u.code) code FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE ${LIVE_HD} ORDER BY c.id DESC`);
    const flat = String(r.content).toUpperCase().replace(/\s+/g, ''), esc =s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const by = (re) => [...new Set(ctx.hdKeys.filter(re).map(k => k.id))];
    let ids = by(k => k.num && k.num.length >= 6 && flat.includes(k.num.replace(/\s+/g, '')));
    if (!ids.length) ids = by(k => k.code && new RegExp(`(^|[^A-Z0-9])${esc(k.code).replace(/-/g, '[-\\s]?')}(?![0-9])`).test(txt));
    if (ids.length === 1) return ids[0];
    if (ids.length > 1) bad(`Diễn giải nhắc tới nhiều hợp đồng / căn — ghi rõ 1 số hợp đồng: «${String(r.content).trim().slice(0, 80)}»`);
  }
  // mã khách hàng (mã đối tượng MISA = mã KH trên app) hoặc tên khách: chỉ nhận khi khách có đúng 1 hợp đồng đang hiệu lực
  const one = async (where, v) => { const xs = await ctx.db.q(`SELECT c.id FROM kd_contract c JOIN kd_customer k ON k.id = c.customer_id WHERE ${where} AND ${LIVE_HD}`, [v]); return xs; };
  const code = upKey(r.cust_code), name = String(r.cust_name || '').trim();
  for (const [where, v, l] of [[`upper(k.code) = $1`, code, `mã khách «${r.cust_code}»`], [`lower(k.full_name) = lower($1)`, name, `khách «${name}»`]]) {
    if (!v) continue;
    const xs = await one(where, v);
    if (xs.length === 1) return xs[0].id;
    if (xs.length > 1) bad(`${l} có ${xs.length} hợp đồng — ghi số hợp đồng hoặc mã căn vào diễn giải`);
  }
  bad(`Không xác định được hợp đồng${r.content ? ` từ diễn giải «${String(r.content).trim().slice(0, 80)}»` : ''}${code || name ? ` / ${code || name}` : ''} — ghi số hợp đồng hoặc mã căn vào diễn giải`);
}
// tệp MISA: thử từng dòng (≤ 20) làm tiêu đề, 1 tầng hoặc 2 tầng (ô gộp tầng trên kéo sang các cột con: «Phát sinh» → «Phát sinh Nợ / Có»,
// «Số tiền» → «Số tiền Thu / Chi / Tồn»); chọn cách khớp có số chứng từ + số tiền và nhiều cột nhất. Nhiều sheet → sheet khớp nhất
function misaParse(sheets) {
  const spec = IMPORTS.misa.spec; let best = null;
  for (const sh of sheets) {
    const rows = sh.rows || [];
    for (let i = 0; i < Math.min(rows.length, 20); i++) for (const two of [false, true]) {
      const top = rows[i] || [], sub = two ? rows[i + 1] || [] : [];
      if (!top.some(c => strip(c)) || (two && (!sub.some(c => strip(c)) || sub.some(c => typeof c === 'number' || /^[\d.,\/ -]{4,}$/.test(String(c ?? '').trim()))))) continue;   // tầng dưới phải là tên cột, không phải dòng số liệu
      let carry = '';
      const head = Array.from({ length: Math.max(top.length, sub.length) }, (_, j) => {
        const t = String(top[j] ?? '').trim(), s = String(sub[j] ?? '').trim();
        if (t) carry = t;
        return two ? (s ? `${t || carry} ${s}` : t) : t;
      });
      let m; try { m = mapRows([head], spec); } catch { continue; }
      if (!m.cols.includes('voucher_no') || !m.cols.includes('amount')) continue;
      if (best && (best.n > m.cols.length || (best.n === m.cols.length && !(two && best.i === i)))) continue;   // bằng điểm ở cùng dòng: 2 tầng cụ thể hơn («Số tiền Thu» thay vì «Số tiền»)
      const start = i + (two ? 2 : 1), body = mapRows([head, ...rows.slice(start)], spec);
      body.rows.forEach(r => { r._line += start - 1; r._raw = rows[r._line - 1] || []; });
      best = { n: m.cols.length, i, rows: body.rows, cols: body.cols };
    }
  }
  if (!best) bad('Không nhận ra dòng tiêu đề của tệp MISA — cần các cột Số chứng từ, Ngày, Số tiền (hoặc Phát sinh Có / Số tiền Thu), Diễn giải.');
  let cur = null;   // mã khách của nhóm đang đọc (sổ chi tiết công nợ theo đối tượng)
  for (const r of best.rows) {
    const raw = r._raw.map(c => String(c ?? '')).join(' ');
    if (!String(r.voucher_no ?? '').trim() && /(khach hang|doi tuong|ma kh)\b/.test(strip(raw))) { const m = /\b([A-Z]{1,5}[0-9]{3,}(?:-[0-9]+)?)\b/.exec(raw.toUpperCase()); cur = m ? m[1] : null; r._group = true; continue; }
    if (cur && !String(r.cust_code ?? '').trim()) r.cust_code = cur;
  }
  best.rows.forEach(r => delete r._raw);
  return { rows: best.rows, cols: best.cols };
}
async function receiptRow(r, ctx) {
  if (r._group) return 'bo_qua';   // dòng tên nhóm khách hàng
  const amt = r.amount == null || String(r.amount).trim() === '' ? 0 : C.parseNum(r.amount, true);
  if (!String(r.voucher_no || '').trim() && (!amt || /^(tong|cong|so du|luy ke|du dau|du cuoi)/.test(strip(r.content || r.cust_name || '')))) return 'bo_qua';
  if (String(r.voucher_no || '').trim() && amt === 0 && ctx.src === 'misa') return 'bo_qua';   // dòng phát sinh Nợ (hóa đơn) / phiếu chi trong sổ — không phải tiền thu
  const no = String(r.voucher_no || '').trim().toUpperCase();
  if (!no) bad('Thiếu số chứng từ');
  if (await ctx.db.one('SELECT 1 FROM kd_receipt WHERE upper(voucher_no) = $1', [no])) return 'trung';
  const cid = await receiptContract(r, ctx);
  const inst = r.installment ? await ctx.db.one('SELECT id FROM kd_installment WHERE contract_id = $1 AND active AND seq = $2', [cid, parseInt(r.installment)]) : null;
  await C.create('receipt', { voucher_no: no, voucher_date: r.voucher_date, contract_id: cid, amount: r.amount, content: r.content, installment_id: inst?.id, src: ctx.src || 'bravo', synced_at: ctx.at }, ctx.user, { db: ctx.db, system: true, demo: ctx.demo });
  return 'them';
}
async function receiptAfter(ctx) { if (!ctx.dry && ctx.res.them) await ctx.db.q("UPDATE kd_setting SET value = jsonb_set(jsonb_set(coalesce(value,'{}'::jsonb), '{last_sync}', to_jsonb($1::text)), '{last_src}', to_jsonb($3::text)), updated_at = now(), updated_by = $2 WHERE key = 'bravo'", [ctx.at, ctx.user.id, ctx.src || 'bravo']); }
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
      const pj = await ctx.db.one('SELECT id FROM kd_project WHERE upper(code) = upper($1) OR lower(name) = lower($1) ORDER BY (upper(code) = upper($1)) DESC LIMIT 1', [String(r.project || '').trim()]) || await ctx.db.one('SELECT id FROM kd_project WHERE upper(code) = $1', [pfx || ''])   // cột dự án: mã hoặc tên dự án (11/11/2026)
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
    spec: { full_name: A('ho ten', 'ten khach hang', 'khach hang', 'ten'), code: A('ma', 'ma khach hang', 'ma kh'), tax_code: A('ma so thue', 'mst'), phone: A('dien thoai', 'so dien thoai', 'sdt'), phone2: A('dien thoai khac', 'sdt 2'), email: A('email'), id_no: A('cccd', 'so cccd', 'giay to dinh danh', 'cmnd'),
      id_date: A('ngay cap'), id_place: A('noi cap'), birth: A('ngay sinh'), address: A('dia chi'), source: A('nguon khach', 'nguon'), interest: A('du an quan tam'), owner: A('nhan vien phu trach', 'phu trach'), stage: A('tinh trang', 'giai doan'), note: A('ghi chu') },   // Tình trạng: để trống = Mới (03 Khách tiềm năng); bước sau mở bán (VD «Đã nộp HSMN») → 02 Danh mục khách hàng
    sample: [['Nguyễn Văn A', 'CTS-O-0101', '', '6508782', '0912345678', '', 'a@example.com', '001234567890', '01/02/2021', 'Cục CS QLHC về TTXH', '12/05/1990', 'Yên Phong, Bắc Ninh', 'Trực tiếp', 'CTS', 'thu.banhang', '']],
    async row(r, ctx) {
      const owner = r.owner ? await ctx.db.one('SELECT id FROM kd_user WHERE lower(username) = lower($1) OR lower(full_name) = lower($1)', [String(r.owner).trim()]) : null;
      if (r.owner && !owner) bad(`Không có nhân viên «${r.owner}»`);
      const pj = r.interest ? await ctx.db.one('SELECT id FROM kd_project WHERE upper(code) = upper($1) OR name ILIKE $1', [String(r.interest).trim()]) : null;
      const code = r.code ? String(r.code).trim() : '';
      if (code && await ctx.db.one('SELECT 1 FROM kd_customer WHERE upper(code) = upper($1)', [code])) bad(`Mã khách hàng «${code}» đã có`);
      let stage;
      if (r.stage != null && String(r.stage).trim()) {
        const o = (await C.optsOf(E.customer.fields.find(f => f.k === 'stage'))).find(o => o[0] === String(r.stage).trim() || strip(o[1]) === strip(r.stage));
        stage = o ? o[0] : bad(`Tình trạng «${r.stage}» không có trong danh mục`);
      }
      await C.create('customer', { ...(stage ? { stage } : {}), code, tax_code: r.tax_code, full_name: r.full_name, phone: r.phone, phone2: r.phone2, email: r.email, id_no: r.id_no, id_date: r.id_date, id_place: r.id_place, birth: r.birth, address: r.address,
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
      const k = await ctx.db.one("SELECT id FROM kd_customer WHERE upper(code) = upper($1) OR ($2 <> '' AND regexp_replace(phone,'\\D','','g') = $2) ORDER BY upper(code) = upper($1) DESC, id LIMIT 1", [ck, dg]) || bad(`Không tìm thấy khách hàng «${ck}» — nhập danh sách khách hàng trước`);
      const owner = r.owner ? await ctx.db.one('SELECT id FROM kd_user WHERE lower(username) = lower($1) OR lower(full_name) = lower($1)', [String(r.owner).trim()]) : null;
      const kindS = strip(r.kind || 'hdmb'); const kind = /hoan thien/.test(kindS) ? 'hoan_thien' : /thue mua/.test(kindS) ? 'thue_mua' : /thue/.test(kindS) ? 'thue' : /vay/.test(kindS) ? 'vay' : 'hdmb';
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
  // phiếu thu / giấy báo có xuất từ MISA (SME hoặc AMIS) — phòng KD tự nhập tệp kế toán gửi (kế toán không dùng app), hoặc app tự nhập từ thư mục chung (MISA_DIR)
  misa: {
    title: 'Phiếu thu / báo có (xuất từ MISA)', roles: ['ke_toan', 'truong_phong'], src: 'misa',
    note: 'Nhận tệp Excel xuất từ MISA (Sổ chi tiết thu tiền / Bảng kê phiếu thu, giấy báo có). Hợp đồng được tìm theo: cột Số hợp đồng / Mã căn (nếu có) → số HĐ hoặc mã căn ghi trong Diễn giải → Mã khách hàng (khách chỉ có 1 HĐ). Phiếu trùng số chứng từ tự bỏ qua; dòng Cộng / Tổng bỏ qua.',
    spec: { voucher_no: A('so chung tu', 'so ct', 'so phieu thu', 'so hieu chung tu thu', 'chung tu so', 'so hieu chung tu', 'so phieu', 'ma chung tu'),
      voucher_date: A('ngay chung tu', 'ngay hach toan', 'ngay ct', 'ngay ht', 'chung tu ngay', 'ngay thu', 'ngay'),
      amount: A('so tien thu', 'phat sinh co', 'so phat sinh co', 'ps co', 'so tien gui vao', 'gui vao', 'thu vao', 'so tien quy doi', 'so tien', 'co'), content: A('dien giai', 'ly do nop', 'ly do thu', 'noi dung', 'ly do'),
      contract: A('so hop dong', 'so hd', 'hop dong', 'ma hop dong', 'hop dong ban', 'ma can', 'can ho'), cust_code: A('ma doi tuong', 'ma khach hang', 'ma kh', 'ma nguoi nop'),
      cust_name: A('ten doi tuong', 'ten khach hang', 'doi tuong', 'nguoi nop', 'ten nguoi nop', 'khach hang'), installment: A('dot', 'ky thu') },
    sample: [['PT00123', '20/10/2026', '100.000.000', 'Thu tiền đợt 2 căn CTS-O-0101 - HĐMB-CTS-O-0101/2026', '', 'KH000123', 'Nguyễn Văn A', '']],
    parse: misaParse, row: receiptRow, after: receiptAfter,
  },
  receipts: {
    title: 'Chứng từ thu tiền (xuất từ Bravo)', roles: ['ke_toan'], src: 'bravo',
    note: 'Chứng từ đã có (trùng số chứng từ) được bỏ qua — nhập lại cùng tệp không bị cộng hai lần.',
    spec: { voucher_no: A('so chung tu', 'ma chung tu', 'so ct'), voucher_date: A('ngay chung tu', 'ngay thu', 'ngay ct', 'ngay'), contract: A('so hop dong', 'so hd', 'ma can'), amount: A('so tien', 'phat sinh co', 'tien thu'), content: A('noi dung', 'dien giai'), installment: A('dot', 'ky thu') },
    sample: [['PT-2026-000123', '20/10/2026', 'HĐMB-CTS-O-0101/2026', '100.000.000', 'Thu tiền đợt 2 căn CTS-O-0101', 2]],
    row: receiptRow, after: receiptAfter,
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
// file MISA thử (bố cục Sổ quỹ tiền mặt: Số phiếu Thu/Chi, Số tiền Thu/Chi/Tồn) theo các hợp đồng THỬ đang nợ — để thử «Nhập phiếu thu MISA»:
// căn quá hạn thứ 1 trả đủ số quá hạn (cảnh báo mất), căn thứ 2 trả một nửa, căn thứ 3 trả đủ số đến hạn tiếp; thêm 1 phiếu không rõ căn, 1 phiếu chi, dòng Cộng.
// Số phiếu theo giờ tải → mỗi lần tải là bộ phiếu mới; nhập lại cùng tệp thì trùng, tự bỏ qua
async function misaSample(user) {
  if (user.role !== 'admin' && !IMPORTS.misa.roles.includes(user.role)) deny('Vai trò của bạn không được nhập phiếu thu MISA');
  const cs = await q(`SELECT c.id, c.number, u.code unit, k.full_name, k.code kh FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id
    WHERE c.is_demo AND c.status = 'da_ky' AND c.kind IN ('hdmb', 'thue_mua') ORDER BY u.code`);
  if (!cs.length) bad('Chưa có hợp đồng thử đã ký — bản demo tự dựng 5 hợp đồng thử khi mở lần đầu (hoặc bấm «Làm mới dữ liệu»)');
  const D = await B.debtOf({ q, one }, cs.map(c => c.id)), day = C.today(), st = new Date(Date.now() + 7 * 3600e3).toISOString().slice(5, 16).replace(/[-T:]/g, '');
  const over = cs.filter(c => D.get(c.id).overdue > 0), rest = cs.filter(c => !(D.get(c.id).overdue > 0) && D.get(c.id).left > 0);
  const rows = []; let n = 0, sum = 0;
  const add = (c, amt, text) => { amt = Math.round(amt / 1000) * 1000; if (!(amt > 0)) return; sum += amt; rows.push([dmy(day), dmy(day), `PT${st}${String(++n).padStart(2, '0')}`, '', text, amt, '', '']); };
  if (over[0]) add(over[0], D.get(over[0].id).overdue + 999, `Thu tiền khách ${over[0].full_name} nộp đủ số quá hạn căn ${over[0].unit}`);
  if (over[1]) add(over[1], D.get(over[1].id).overdue / 2, `Thu một phần căn ${over[1].unit.toLowerCase().replace(/-/g, ' ')}`);
  if (over[2]) add(over[2], D.get(over[2].id).overdue, `Thu tiền theo hợp đồng ${over[2].number}`);
  const nx = rest[0] && D.get(rest[0].id).next; if (nx) add(rest[0], nx.rem, `Khách chuyển khoản trước hạn — ${nx.name} căn ${rest[0].unit}`);
  rows.push([dmy(day), dmy(day), `PT${st}${String(++n).padStart(2, '0')}`, '', 'Thu tiền khách lẻ (không ghi căn)', 5000000, '', '']); sum += 5000000;
  rows.push([dmy(day), dmy(day), '', `PC${st}01`, 'Chi tiếp khách', '', 2000000, '']);
  rows.push(['', '', '', '', 'Cộng phát sinh', sum, 2000000, '']);
  return buildXlsx({ sheet: 'So quy', rows: [['CÔNG TY CP ĐẦU TƯ CÁT TƯỜNG (FILE THỬ — giả lập MISA)'], [], ['SỔ QUỸ TIỀN MẶT'], [`Ngày ${dmy(day)}`],
    ['Ngày hạch toán', 'Ngày chứng từ', 'Số phiếu', '', 'Diễn giải', 'Số tiền', '', ''], ['', '', 'Thu', 'Chi', '', 'Thu', 'Chi', 'Tồn'], ...rows],
    merges: ['C5:D5', 'F5:H5'], boldRows: [0, 2, 4, 5], widths: [14, 14, 16, 14, 60, 16, 14, 12] });
}
async function importFile(kind, file, user, { dry, demo } = {}) {
  const I = IMPORTS[kind] || bad('Loại nhập không hợp lệ');
  if (user.role !== 'admin' && !I.roles.includes(user.role)) deny(`Vai trò của bạn không được nhập «${I.title}»`);
  const sheets = readTable(file);
  // tệp có bố cục riêng (VD Mẫu 4 tiêu đề 2 tầng, mỗi hộ nhiều dòng) → loại nhập tự đọc
  if (I.parse) return importRows(I, I.parse(sheets), file, user, { dry, demo, kind });
  // tệp nhiều sheet (VD bảng giá Bravo: sheet tóm tắt + sheet chi tiết) → lấy sheet khớp nhiều cột nhất
  const tries = sheets.map(sh => { try { return mapRows(sh.rows, I.spec); } catch { return null; } }).filter(Boolean);
  const main = tries.sort((a, b) => b.cols.length - a.cols.length)[0] || mapRows(sheets[0].rows, I.spec);
  const extra = new Map();
  if (I.spec2) {
    const s2 = sheets.find((s, i) => i > 0 && /lich|thanh toan|dot/.test(strip(s.name))) || sheets[1];
    if (s2) for (const r of mapRows(s2.rows, I.spec2).rows) { const k = String(r.number || '').trim().toUpperCase().replace(/\s+/g, ''); if (!k) continue; (extra.get(k) || extra.set(k, []).get(k)).push(r); }
  }
  return importRows(I, main, file, user, { dry, demo, kind, extra });
}
async function importRows(I, main, file, user, { dry, demo, kind, extra = new Map() }) {
  const res = { kind, title: I.title, total: main.rows.length, them: 0, cap_nhat: 0, trung: 0, bo_qua: 0, loi: 0, errors: [], dry: !!dry, cols: main.cols };
  const at = new Date().toISOString();
  await tx(async db => {
    const ctx = { db, user, demo: !!demo, fileName: file.name, extra, at, dry, src: I.src, res };
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
    await C.audit(db, 'import', null, 'nhap_' + kind, null, null, user, `${file.name}: thêm ${res.them}, cập nhật ${res.cap_nhat}, trùng ${res.trung}, bỏ qua ${res.bo_qua}, lỗi ${res.loi}`);
  }).catch(e => { if (!e.dryRun) throw e; });
  return res;
}
const pgNice = async e => e.code === '23505' ? 'Trùng dữ liệu đã có' : e.code === '23514' ? 'Vi phạm quy tắc dữ liệu (' + e.constraint + ')' : e.code === '23503' ? 'Liên kết không hợp lệ' : e.message;
function importTemplate(kind) {
  const I = IMPORTS[kind] || bad('Loại nhập không hợp lệ');
  if (I.template) return I.template();
  const LBL = {
    units: ['Mã dự án', 'Mã tòa', 'Mã căn', 'Tầng', 'Loại sản phẩm', 'Số phòng ngủ', 'Diện tích thông thủy', 'Diện tích xây dựng', 'Hướng', 'Vị trí', 'Đơn giá nền', 'Giá căn hộ sau thuế', 'Phí bảo trì', 'Tổng giá căn hộ', 'Thời gian dự kiến bàn giao', 'Mở bán (x)'],
    customers: ['Họ tên', 'Mã khách hàng', 'Mã số thuế', 'Điện thoại', 'Điện thoại khác', 'Email', 'Số CCCD', 'Ngày cấp', 'Nơi cấp', 'Ngày sinh', 'Địa chỉ', 'Nguồn khách', 'Dự án quan tâm', 'Nhân viên phụ trách', 'Ghi chú', 'Tình trạng'],
    leads: ['Họ tên', 'Điện thoại', 'Email', 'Kênh', 'Dự án quan tâm', 'Nội dung trao đổi', 'Ngày liên hệ', 'Ngày nhắc tiếp', 'Nhân viên phụ trách'],
    contracts: ['Số hợp đồng', 'Loại hợp đồng', 'Mã căn', 'Điện thoại khách hàng', 'Đồng sở hữu', 'Giá trị hợp đồng', 'Ngày ký', 'Nhân viên phụ trách', 'Mã đại lý'],
    receipts: ['Số chứng từ', 'Ngày chứng từ', 'Số hợp đồng', 'Số tiền', 'Nội dung', 'Đợt'],
    misa: ['Số chứng từ', 'Ngày hạch toán', 'Số tiền', 'Diễn giải', 'Số hợp đồng', 'Mã đối tượng', 'Tên đối tượng', 'Đợt'],
    users: ['Tên đăng nhập', 'Họ tên', 'Vai trò', 'Chức danh', 'Điện thoại', 'Email'],
  }[kind];
  const rows = [[`MẪU NHẬP: ${I.title.toUpperCase()}`], [I.note || 'Giữ nguyên dòng tiêu đề. Xóa dòng ví dụ trước khi nhập. Ngày: dd/mm/yyyy. Tiền: số, có thể có dấu chấm ngăn cách.'], LBL, ...I.sample];
  if (!I.spec2) return buildXlsx({ sheet: 'Nhap', rows, boldRows: [0, 2], widths: LBL.map(() => 20) });
  // 2 sheet: tự dựng (buildXlsx chỉ 1 sheet) → xuất sheet 1 kèm hướng dẫn, sheet lịch tách tệp riêng là bất tiện; ghép tay 2 sheet
  return twoSheets(rows, [['LỊCH THANH TOÁN'], ['Mỗi dòng 1 đợt; tổng các đợt = giá trị hợp đồng (nhập Tỷ lệ % hoặc Số tiền)'], ['Số hợp đồng', 'Đợt', 'Tên đợt', 'Ngày đến hạn', 'Tỷ lệ (%)', 'Số tiền'], ...I.sample2]);
}
// 17/11/2026: nhiều sheet trong 1 tệp — mỗi phần tử { name, title, cols, rows, sum, note, groups } dựng như sheet() rồi ghép (chuỗi ghi inline nên ghép an toàn)
function sheets(list) {
  const { zip, unzip } = require('./xlsx');
  const parts = list.map(x => unzip(sheet(String(x.title || x.name || 'Sheet').slice(0, 80), x.cols || [], x.rows || [], { sum: x.sum, note: x.note, groups: x.groups, noNo: x.noNo })));
  const files = Object.entries(parts[0]).filter(([k]) => !/^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  const nm = (s, i) => (String(s || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)) || `Sheet${i + 1}`;
  parts.forEach((p, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, p['xl/worksheets/sheet1.xml']]));
  const set = (k, v) => { const i = files.findIndex(f => f[0] === k); if (i >= 0) files[i][1] = v; else files.push([k, v]); };
  set('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list.map((x, i) => `<sheet name="${escX(nm(x.name, i))}" sheetId="${i + 1}" r:id="rId${i + 10}"/>`).join('')}</sheets></workbook>`);
  set('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${list.map((x, i) => `<Relationship Id="rId${i + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);
  const ct = parts[0]['[Content_Types].xml'].toString().replace(/<Override PartName="\/xl\/worksheets\/sheet\d+\.xml"[^>]*\/>/g, '');
  set('[Content_Types].xml', ct.replace('</Types>', list.map((x, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'));
  return zip(files.map(([k, v]) => [k, Buffer.isBuffer(v) ? v : Buffer.from(v)]));
}
const escX = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
// đọc số tiền thành chữ — giữ dạng mã nguồn (chuỗi) để chèn nguyên văn vào trang in; bản demo nén mã đổi tên hàm nên không dùng fn.toString()
const MONEY_SRC = String.raw`const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function read3(n, full) {
  const h = Math.floor(n / 100), t = Math.floor(n % 100 / 10), u = n % 10, out = [];
  if (h || full) out.push(DIGITS[h], 'trăm');
  if (t > 1) out.push(DIGITS[t], 'mươi'); else if (t === 1) out.push('mười'); else if ((h || full) && u) out.push('linh');
  if (u) out.push(t > 1 && u === 1 ? 'mốt' : t >= 1 && u === 5 ? 'lăm' : t > 1 && u === 4 ? 'tư' : DIGITS[u]);
  return out.join(' ');
}
function moneyWords(n) {
  n = Math.round(+n || 0); if (!n) return 'Không đồng';
  if (n < 0) { const w = moneyWords(-n); return 'Âm ' + w[0].toLowerCase() + w.slice(1); }
  const scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'], groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const parts = [];
  for (let g = groups.length - 1; g >= 0; g--) if (groups[g]) parts.push(read3(groups[g], g < groups.length - 1), scales[g]);
  const s = parts.filter(Boolean).join(' ');
  return s[0].toUpperCase() + s.slice(1) + ' đồng';
}`;
const { moneyWords } = new Function(MONEY_SRC + ';return { moneyWords };')();
const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// trường trộn tiền có cặp «…_chu» → đánh dấu để bản in sửa số thì dòng bằng chữ tự đổi theo (script trong editDoc)
const mergeVal = (map, x) => x + '_chu' in map ? `<span data-so="${x}">${escH(map[x] ?? '')}</span>`
  : x.endsWith('_chu') && x.slice(0, -4) in map ? `<span data-chu="${x.slice(0, -4)}">${escH(map[x] ?? '')}</span>` : escH(map[x] ?? '');
async function printContract(id, user, tplCode) {
  if (!can(user, E.contract, 'r')) deny();
  const c = C.notFound(await one(`SELECT c.*, u.code unit, u.floor, u.area_tt, u.direction, b.code building, p.name project, p.address p_addr, p.investor,
      k.full_name, k.phone, k.id_no, k.id_date, k.id_place, k.address FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_building b ON b.id = u.building_id
      JOIN kd_project p ON p.id = u.project_id JOIN kd_customer k ON k.id = c.customer_id WHERE c.id = $1`, [+id]), 'hợp đồng');
  const tpl = await one(`SELECT * FROM kd_template WHERE active AND ${tplCode ? 'code = $1' : "kind = 'hop_dong' AND coalesce(ent, 'contract') = 'contract' ORDER BY id LIMIT 1"}`, tplCode ? [tplCode] : []);
  if (!tpl) bad('Chưa có mẫu hợp đồng — tạo ở Quản trị › Mẫu biểu');
  const inst = await q('SELECT * FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [c.id]);
  const pii = ['truong_phong', 'lanh_dao', 'ho_so', 'admin'].includes(user.role);
  const map = { so_hd: c.number, ten_kh: c.full_name, dien_thoai: c.phone, cccd: pii ? c.id_no : '(ẩn)', ngay_cap: pii ? dmy(c.id_date) : '', noi_cap: pii ? c.id_place : '', dia_chi: c.address, dong_so_huu: c.co_owner || '',
    ma_can: c.unit, du_an: c.project, dia_diem: c.p_addr, chu_dau_tu: c.investor, toa: c.building, tang: c.floor, dien_tich: String(c.area_tt).replace('.', ','), huong: c.direction,
    gia_tri: fmtMoney(c.value), gia_tri_chu: moneyWords(c.value), ngay: dmy(c.signed_on || C.today()),
    lich_thanh_toan: `<table class="sch"><tr><th>Đợt</th><th>Nội dung</th><th>Hạn thanh toán</th><th>Tỷ lệ</th><th>Số tiền (đồng)</th></tr>${inst.map(i => `<tr><td>${i.seq}</td><td>${escH(i.name)}</td><td>${dmy(i.due_on)}</td><td>${i.pct ?? ''}${i.pct != null ? '%' : ''}</td><td style="text-align:right">${fmtMoney(i.amount)}</td></tr>`).join('')}</table>` };
  // 16/11/2026: HĐ thuê — chi tiết giá thuê theo chính sách cho thuê áp dụng (bản lưu trên HĐ): trường trộn riêng + bảng {chi_tiet_thue};
  // mẫu chưa có {chi_tiet_thue} thì bảng tự đứng trước bảng tiến độ thu ({lich_thanh_toan})
  if (c.kind === 'thue') {
    const m0 = v => v == null || v === '' ? '' : fmtMoney(v);
    Object.assign(map, { chinh_sach_thue: c.rent_policy_txt || '', don_gia_thue: m0(c.rent_unit_price), don_vi_tinh: c.rent_unit_l || '', tien_thue_nha: m0(c.rent_house), tien_thue_noi_that: m0(c.rent_furn ?? (c.rent_house != null ? 0 : null)),
      tong_tien_thue: m0(c.rent), tong_tien_thue_chu: c.rent ? moneyWords(c.rent) : '', tien_dat_coc: m0(c.deposit ?? 0), uu_dai: c.rent_promo_txt || '', chu_ky_thanh_toan: c.rent_cycle_txt || '', cac_khoan_phi: c.rent_fees_txt || '',
      thoi_han_thue: c.term_months ? `${c.term_months} tháng` : '', ngay_bat_dau_thue: dmy(c.eff_on), ngay_ket_thuc_thue: dmy(c.exp_on) });
    const row = (l, v) => v ? `<tr><td>${l}</td><td>${escH(v)}</td></tr>` : '';
    map.chi_tiet_thue = `<table class="sch"><tr><th colspan="2" style="text-align:left">Chi tiết giá thuê${c.rent_policy_txt ? ` — theo chính sách ${escH(c.rent_policy_txt.split(' · ')[0])}` : ''}</th></tr>${
      row('Đơn giá thuê nhà', map.don_gia_thue && `${map.don_gia_thue} ${map.don_vi_tinh}`)}${row('Tiền thuê nhà/tháng', map.tien_thue_nha && map.tien_thue_nha + ' đồng')}${row('Tiền thuê nội thất/tháng', map.tien_thue_noi_that && map.tien_thue_noi_that + ' đồng')}${
      row('Tổng tiền thuê/tháng', map.tong_tien_thue && map.tong_tien_thue + ' đồng')}${row('Tiền đặt cọc', map.tien_dat_coc + ' đồng')}${row('Thời hạn thuê', map.thoi_han_thue && `${map.thoi_han_thue} (từ ${map.ngay_bat_dau_thue} đến ${map.ngay_ket_thuc_thue})`)}${
      row('Chu kỳ thanh toán', map.chu_ky_thanh_toan)}${row('Ưu đãi', map.uu_dai)}${row('Các khoản phí', map.cac_khoan_phi)}</table>`;
    if (!/\{chi_tiet_thue\}/.test(tpl.content)) map.lich_thanh_toan = map.chi_tiet_thue + map.lich_thanh_toan;
  }
  const body = escH(tpl.content).replace(/\n/g, '<br>').replace(/\{(\w+)\}/g, (m, k) => k in map ? (['lich_thanh_toan', 'chi_tiet_thue'].includes(k) ? map[k] : mergeVal(map, k)) : m);
  await C.audit({ q }, 'contract', c.id, 'in_hop_dong', null, null, user, tpl.code);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escH(c.number)}</title><style>
    @page{size:A4;margin:20mm 18mm 20mm 25mm} body{font:13pt/1.5 "Times New Roman",serif;color:#000;max-width:170mm;margin:auto}
    .sch{border-collapse:collapse;width:100%;margin:6pt 0} .sch td,.sch th{border:1px solid #000;padding:3pt 5pt;font-size:12pt}
    ${EDIT_CSS}</style></head><body>${editBar(`Bản in từ mẫu «${escH(tpl.name)}» · ${c.status === 'da_ky' ? 'Hợp đồng đã ký — bản in tham khảo' : 'Dự thảo'}`)}${editDoc(body)}</body></html>`;
}

// ===== Khung trang in (17/11/2026 — làm lại giao diện in ấn): mọi trang /print/… dùng chung =====
// Thanh công cụ cố định trên cùng (In / PDF, Tải Word, Bản gốc, hoàn tác / làm lại, thu phóng, xem trang giấy, ô trống cần điền, khóa sửa),
// mục lục văn bản bên trái khi bản in có nhiều hồ sơ, thanh trạng thái dưới cùng (đã sửa chưa lưu, trang đang xem / tổng số trang).
// Bản in vẫn sửa được trực tiếp trước khi in — chỉ áp dụng cho bản in này, không đổi dữ liệu gốc.
const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  print: SVG('<path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7" rx="1"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>'),
  undo: SVG('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: SVG('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  minus: SVG('<path d="M5 12h14"/>'), plus: SVG('<path d="M5 12h14M12 5v14"/>'),
  page: SVG('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
  pen: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  word: SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
  reset: SVG('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  list: SVG('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  blank: SVG('<path d="M4 7V4h16v3M9 20h6M12 4v16"/>'),
  up: SVG('<path d="m18 15-6-6-6 6"/>'), down: SVG('<path d="m6 9 6 6 6-6"/>'),
  save: SVG('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
};
const EDIT_CSS = `.pt{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;gap:10px;min-height:58px;padding:0 14px;background:#fff;border-bottom:1px solid #dfe5ee;box-shadow:0 1px 10px rgba(20,40,80,.07);font:13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d2a3d;text-align:left;box-sizing:border-box}
    .pt *,.pt-st *,.pt-side *{box-sizing:border-box} .pt [hidden],.pt-st [hidden]{display:none!important}
    .pt-l{display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 180px} .pt-ttl{min-width:0;display:flex;flex-direction:column;gap:1px}
    .pt-name{font-weight:650;font-size:14px;color:#1F3A68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pt-info{font-size:12px;color:#66758a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .pt-info b{color:#3b4a60}
    .pt-c{display:flex;align-items:center;gap:6px;flex:0 1 auto} .pt-r{display:flex;align-items:center;gap:6px;flex:0 0 auto;justify-content:flex-end}
    .pt-g{display:inline-flex;border:1px solid #d5dde8;border-radius:9px;overflow:hidden;background:#fff}
    .pt-b{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;min-width:36px;padding:0 11px;border:1px solid #d5dde8;border-radius:9px;background:#fff;color:#1d2a3d;font:600 13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s}
    .pt-g .pt-b{border:0;border-radius:0;height:34px} .pt-g .pt-b + .pt-b{border-left:1px solid #e6ebf2}
    .pt-b:hover{background:#f1f5fb;border-color:#b9c7da} .pt-b:focus-visible{outline:2px solid #2A4F8A;outline-offset:2px} .pt-b:disabled{opacity:.55;cursor:default}
    .pt-b svg{width:17px;height:17px;flex:none} .pt-b.on{background:#e8eef8;border-color:#9DB3D9;color:#1F3A68}
    .pt-b.pri{background:#2A4F8A;border-color:#2A4F8A;color:#fff;padding:0 16px} .pt-b.pri:hover{background:#1F3A68;border-color:#1F3A68}
    .pt-zl{min-width:54px!important;font-variant-numeric:tabular-nums}
    .pt-bc{display:inline-block;min-width:20px;padding:0 6px;border-radius:10px;background:#F5A623;color:#fff;font-size:11px;line-height:18px;text-align:center}
    .pt-bc.ok{background:#2e9d5b}
    .pt-st{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;gap:14px;align-items:center;height:30px;padding:0 14px;background:#f7f9fc;border-top:1px solid #e1e7ef;font:12px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#66758a;text-align:left}
    .pt-sp{flex:1} .pt-dirty{color:#b45309;font-weight:600;white-space:nowrap} .pt-pg{font-variant-numeric:tabular-nums;white-space:nowrap;color:#3b4a60;font-weight:600}
    .pt-tip{overflow:hidden;white-space:nowrap;text-overflow:ellipsis} .pt-st kbd{font:11px system-ui;border:1px solid #d5dde8;border-bottom-width:2px;border-radius:4px;padding:0 4px;background:#fff;color:#3b4a60}
    .pt-side{position:fixed;top:58px;bottom:30px;left:0;width:264px;z-index:40;background:#fff;border-right:1px solid #dfe5ee;overflow:auto;padding:10px 8px;font:13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left;transform:translateX(-102%);transition:transform .2s ease;box-shadow:2px 0 12px rgba(20,40,80,.06)}
    html.pt-sideon .pt-side{transform:none}
    .pt-sh{padding:4px 8px 8px;font-weight:600;color:#66758a;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    .pt-side button{display:flex;align-items:flex-start;gap:8px;width:100%;text-align:left;padding:7px 8px;margin:1px 0;border:0;border-radius:7px;background:none;font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d2a3d;cursor:pointer}
    .pt-side button i{flex:none;font-style:normal;min-width:22px;height:20px;border-radius:5px;background:#eef2f8;color:#4a5b73;font-size:11px;font-weight:600;display:inline-flex;align-items:center;justify-content:center}
    .pt-side button:hover{background:#f1f5fb} .pt-side button.on{background:#e8eef8;color:#1F3A68;font-weight:600} .pt-side button.on i{background:#2A4F8A;color:#fff}
    .doc{outline:1px dashed #b8c7da;outline-offset:8px;border-radius:2px} .doc:focus{outline:2px solid #f2a65a} .doc *:focus{outline:none} .doc[contenteditable=false]{outline:1px solid #e3e8ef}
    @media screen{body{padding-top:76px!important;padding-bottom:48px!important} section.hs{scroll-margin-top:76px} ::highlight(pt-blank){background-color:#fff0bf} ::highlight(pt-cur){background-color:#ffc94d}}
    @media screen and (min-width:1180px){html.pt-sideon body{padding-left:280px!important}}
    @media screen and (max-width:1180px){.pt-b .t{display:none} .pt-b.pri .t,.pt-b.keep .t{display:inline}}
    @media screen and (max-width:760px){.pt{flex-wrap:wrap;padding:8px 10px;gap:6px} .pt-c{order:3;width:100%;overflow-x:auto;padding-bottom:2px} .pt-info{display:none} .pt-l{flex-basis:120px}
      body{padding-top:118px!important} section.hs{scroll-margin-top:122px} .pt-side{top:110px} .pt-keys,.pt-tip{display:none} .pt-b.pri .t{display:none}}
    @media screen and (max-width:640px){body{padding-left:14px;padding-right:14px} table.kv3 td{display:block;white-space:normal!important} table.b td{padding:3pt 4pt}}
    @media print{.pt,.pt-st,.pt-side,.pvs{display:none!important} body{padding:0!important} .doc,.doc:focus,.doc[contenteditable=false]{outline:none!important} .pvw{zoom:1!important}}
    @media screen{html.pv body{max-width:none!important;margin:0!important;padding-left:0;padding-right:0;background:#d9dee5}
      html.pv .pvw{position:relative;margin:0 auto} html.pv .pvs{position:absolute;inset:0;pointer-events:none;z-index:0}
      html.pv .pvp{position:absolute;left:0;right:0;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.28)}
      html.pv .pvm{position:absolute;white-space:pre;color:#000;line-height:1} html.pv .pvn{position:absolute;left:0;right:0;text-align:center;font:11px system-ui;color:#6b7785}
      html.pv .doc{position:relative;z-index:1;column-fill:auto;column-gap:0;column-wrap:wrap;outline:none!important} html.pv .hs-t{display:none}
      html.pv [data-pvb]{break-before:column} html.pv [data-pva]{break-after:column} html:not(.pv) .pvs{display:none}}`;
// 13/11/2026: «Xem dạng trang giấy» — màn sửa hiện đúng từng tờ A4 như bản in (lề lấy từ @page của trang, ngắt trang = ngắt cột của khối nhiều cột xuống dòng,
// số trang / «Trang HĐ x/y» vẽ ở lề), sửa chữ đến đâu trang tự dàn lại đến đó. Trình duyệt chưa hỗ trợ column-wrap thì giữ màn cũ.
// 17/11/2026: nút bật / tắt chuyển lên thanh công cụ (window.__pv), tính cả mức thu phóng (window.__ptZ).
function pvView() {
  const d = document.querySelector('.doc'), H = document.documentElement; if (!d || !window.CSS || !CSS.supports('column-wrap', 'wrap')) return;
  const MM = (() => { const e = document.createElement('div'); e.style.cssText = 'position:absolute;visibility:hidden;width:100mm'; document.body.append(e); const w = e.getBoundingClientRect().width / 100; e.remove(); return w; })();
  const mm = v => { const e = document.createElement('div'); e.style.cssText = 'position:absolute;visibility:hidden;height:0;width:' + v; document.body.append(e); const w = e.getBoundingClientRect().width; e.remove(); return w / MM; };
  const G = 8, wrap = document.createElement('div'), lay = document.createElement('div'), st = document.createElement('style'), geo = { n: 1, ph: 297 };
  wrap.className = 'pvw'; lay.className = 'pvs'; lay.setAttribute('contenteditable', 'false'); lay.setAttribute('aria-hidden', 'true');
  d.before(wrap); wrap.append(lay, d); document.head.append(st);
  const rules = () => { const o = { mg: [20, 15, 20, 30], land: false, box: {}, first: {} };
    for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch (e) { continue; }
      for (const r of rs) { if (!(r instanceof CSSPageRule)) continue; const sel = r.selectorText || '', s = r.style;
        if (!sel) { if (s.marginTop) o.mg = [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft].map(v => mm(v || '0')); if (s.size) o.land = /landscape/.test(s.size); }
        if (sel && sel !== ':first') continue;
        for (const m of r.cssRules || []) if (m.name && m.style) (sel ? o.first : o.box)[m.name] = { c: m.style.content, f: m.style.font }; } }
    return o; };
  const txt = (c, i, n) => { if (!c || c === 'none' || c === 'normal') return ''; let out = ''; const re = /"([^"]*)"|counter\((pages?)\)/g; let m;
    while ((m = re.exec(c))) out += m[1] != null ? m[1] : m[2] === 'page' ? i + 1 : n; return out; };
  let busy = false;
  const draw = () => { if (busy || !H.classList.contains('pv')) return; busy = true;
    try {
      const Z = window.__ptZ || 1, R = rules(), [t, r, b, l] = R.mg, pw = R.land ? 297 : 210, ph = R.land ? 210 : 297, W = pw - l - r, Hc = ph - t - b, gap = b + G + t;
      st.textContent = '@media screen{html.pv .pvw{width:' + W + 'mm;padding:' + t + 'mm ' + r + 'mm ' + b + 'mm ' + l + 'mm} html.pv .doc{width:' + W + 'mm;column-width:' + W + 'mm;column-height:' + Hc + 'mm;row-gap:' + gap + 'mm}}';
      for (const e of d.querySelectorAll('*')) { const cs = getComputedStyle(e);
        if (cs.breakBefore === 'page' || cs.pageBreakBefore === 'always') e.dataset.pvb = ''; if (cs.breakAfter === 'page' || cs.pageBreakAfter === 'always') e.dataset.pva = ''; }
      const n = Math.max(1, Math.round((d.getBoundingClientRect().height / Z / MM + gap) / (Hc + gap)));
      const top0 = wrap.getBoundingClientRect().top, skip = new Set();   // trang phụ lục / bản vẽ: không in số trang HĐ
      for (const s of d.querySelectorAll('section.pl, .bv-page')) for (const q of s.getClientRects()) skip.add(Math.floor((q.top - top0) / Z / MM / (ph + G)));
      let h = '';
      for (let i = 0; i < n; i++) { const y = i * (ph + G); let mb = '';
        if (!skip.has(i)) for (const k of Object.keys(R.box)) { const bx = (i === 0 && R.first[k]) || R.box[k], v = txt(bx.c, i, n); if (!v) continue;
          const [vp, hp] = k.split('-'), ty = vp === 'top' ? t / 2 : ph - b / 2;
          const pos = hp === 'left' ? 'left:' + l + 'mm' : hp === 'right' ? 'right:' + r + 'mm' : 'left:' + l + 'mm;right:' + r + 'mm;text-align:center';
          mb += '<div class="pvm" style="top:' + ty + 'mm;transform:translateY(-50%);' + pos + ';font:' + (bx.f || '10pt serif') + '">' + String(v).replace(/</g, '&lt;') + '</div>'; }
        h += '<div class="pvp" style="top:' + y + 'mm;height:' + ph + 'mm">' + mb + '</div><div class="pvn" style="top:' + (y + ph + 1) + 'mm">Trang ' + (i + 1) + ' / ' + n + '</div>'; }
      lay.innerHTML = h; geo.n = n; geo.ph = ph;
    } finally { busy = false; dispatchEvent(new Event('pt-pages')); } };
  let tm = 0; const later = () => { clearTimeout(tm); tm = setTimeout(draw, 120); };
  const set = on => { H.classList.toggle('pv', on); try { localStorage.setItem('ctg-pv', on ? '1' : '0'); } catch (e) {} draw(); dispatchEvent(new Event('pt-pages')); };
  // trang đang xem (theo toạ độ y trên màn hình)
  const page = y => Math.min(geo.n, Math.max(1, Math.floor((y - wrap.getBoundingClientRect().top) / (window.__ptZ || 1) / MM / (geo.ph + G)) + 1));
  window.__pv = { draw, set, page, geo, on: () => H.classList.contains('pv') };
  let on = innerWidth >= 900; try { const v = localStorage.getItem('ctg-pv'); if (v) on = v === '1'; } catch (e) {}
  H.classList.toggle('pv', on); draw();
  new ResizeObserver(later).observe(d); d.addEventListener('input', later);
  if (document.fonts) document.fonts.ready.then(() => setTimeout(draw, 300)); addEventListener('load', () => setTimeout(draw, 400));
}
// thanh công cụ + mục lục + thanh trạng thái (chạy sau pvView)
function ptShell() {
  const H = document.documentElement, d = document.querySelector('.doc'), bar = document.querySelector('.pt'); if (!d || !bar) return;
  const B = k => bar.querySelector('[data-pt="' + k + '"]'), Q = s => bar.querySelector(s);
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  Q('.pt-name').textContent = document.title; Q('.pt-info').title = Q('.pt-info').textContent;
  bar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });   // bấm nút không làm mất con trỏ đang ở trong văn bản
  // --- thanh trạng thái, đã sửa / chưa lưu
  const st = document.createElement('div'); st.className = 'pt-st'; st.setAttribute('contenteditable', 'false');
  st.innerHTML = '<span class="pt-dirty" hidden>● Đã sửa — chưa in / lưu</span><span class="pt-tip">✎ Bấm vào chữ để sửa trực tiếp — chỉ áp dụng cho bản in này, không đổi dữ liệu gốc</span><span class="pt-sp"></span><span class="pt-pg"></span><span class="pt-keys"><kbd>F3</kbd> ô trống tiếp · <kbd>Ctrl</kbd>+<kbd>P</kbd> in' + (document.getElementById('hsSave') ? ' · <kbd>Ctrl</kbd>+<kbd>S</kbd> lưu vào kho' : '') + '</span>';
  document.body.append(st);
  let dirty = false, warn = false;
  const setDirty = v => { dirty = v; warn = v; st.querySelector('.pt-dirty').hidden = !v; };
  d.addEventListener('input', () => setDirty(true));
  window.__ptSaved = () => setDirty(false);
  addEventListener('beforeunload', e => { if (warn && !H.dataset.ptLeave) { e.preventDefault(); e.returnValue = ''; } });
  // --- mục lục (bản in có từ 2 hồ sơ trở lên)
  const secs = [...d.querySelectorAll('section.hs')];
  if (secs.length > 1) {
    const sd = document.createElement('nav'); sd.className = 'pt-side'; sd.setAttribute('aria-label', 'Văn bản trong bản in');
    sd.innerHTML = '<div class="pt-sh">Văn bản trong bản in · ' + secs.length + '</div>' + secs.map((s, i) => '<button type="button" data-i="' + i + '"><i>' + (i + 1) + '</i><span>' + esc((s.querySelector('.hs-t') || {}).textContent || s.dataset.code || 'Văn bản ' + (i + 1)) + '</span></button>').join('');
    document.body.append(sd); B('side').hidden = false;
    const wide = () => innerWidth >= 1180, side = on => { H.classList.toggle('pt-sideon', on); B('side').classList.toggle('on', on); if (wide()) ls('ctg-pt-side', on ? '1' : '0'); };
    side(wide() && ls('ctg-pt-side') !== '0');
    B('side').onclick = () => side(!H.classList.contains('pt-sideon'));
    sd.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; secs[+b.dataset.i].scrollIntoView({ block: 'start' }); if (!wide()) side(false); };
    addEventListener('keydown', e => { if (e.key === 'Escape' && !wide()) side(false); });
    const btns = [...sd.querySelectorAll('[data-i]')];
    const act = () => { const y = innerHeight * .35; let k = 0; secs.forEach((s, i) => { if (s.getBoundingClientRect().top <= y) k = i; });
      btns.forEach((b, i) => b.classList.toggle('on', i === k)); };
    addEventListener('scroll', () => requestAnimationFrame(act), { passive: true }); act();
  }
  // --- thu phóng (nhớ theo máy)
  const zEl = () => document.querySelector('.pvw') || d;
  const setZ = (z, keep = true) => { const Z = Math.min(2, Math.max(.3, Math.round(z * 20) / 20)); window.__ptZ = Z; zEl().style.zoom = Z === 1 ? '' : Z;
    Q('.pt-zl').textContent = Math.round(Z * 100) + '%'; if (keep) ls('ctg-pt-zoom', String(Z)); window.__pv && window.__pv.draw(); };
  B('zo').onclick = () => setZ((window.__ptZ || 1) - .1); B('zi').onclick = () => setZ((window.__ptZ || 1) + .1); B('z1').onclick = () => setZ(1);
  // màn hẹp (điện thoại) + xem trang giấy: tự thu nhỏ cho vừa bề ngang tờ giấy
  const fit = () => { const w = document.querySelector('.pvw'); if (innerWidth < 760 && w && window.__pv && window.__pv.on()) setZ(Math.floor((innerWidth - 16) / (w.offsetWidth || 794) * 20) / 20, false); };
  setZ(+ls('ctg-pt-zoom') || 1); fit();
  // --- xem dạng trang giấy + số trang
  const pg = st.querySelector('.pt-pg');
  const pages = () => { const P = window.__pv; if (!P || !P.on()) { pg.textContent = ''; return; } pg.textContent = 'Trang ' + P.page(innerHeight * .4) + ' / ' + P.geo.n; };
  if (window.__pv) { const sync = () => B('pv').classList.toggle('on', window.__pv.on()); B('pv').onclick = () => { window.__pv.set(!window.__pv.on()); sync(); fit(); }; sync(); }
  else B('pv').hidden = true;
  addEventListener('pt-pages', pages); addEventListener('scroll', () => requestAnimationFrame(pages), { passive: true }); pages();
  // --- khóa / mở sửa chữ
  const lockSync = () => { const on = d.isContentEditable; B('lock').classList.toggle('on', on); B('lock').querySelector('.t').textContent = on ? 'Đang sửa' : 'Đã khóa sửa';
    B('lock').title = on ? 'Đang cho sửa chữ trực tiếp — bấm để khóa (tránh gõ nhầm)' : 'Đang khóa — bấm để cho sửa chữ trực tiếp';
    st.querySelector('.pt-tip').textContent = on ? '✎ Bấm vào chữ để sửa trực tiếp — chỉ áp dụng cho bản in này, không đổi dữ liệu gốc' : '🔒 Đang khóa sửa — chỉ xem và in'; B('undo').disabled = B('redo').disabled = !on; };
  B('lock').onclick = () => { d.contentEditable = d.isContentEditable ? 'false' : 'true'; lockSync(); }; lockSync();
  // --- hoàn tác / làm lại
  const cmd = c => { d.focus({ preventScroll: true }); document.execCommand(c); };
  B('undo').onclick = () => cmd('undo'); B('redo').onclick = () => cmd('redo');
  // --- ô trống cần điền («……», «.....»): tô vàng trên màn (không đổi nội dung, không in ra), F3 / nút ▼ nhảy tới ô kế và chọn sẵn để gõ đè
  const HL = window.CSS && CSS.highlights && window.Highlight, RE = /\.{5,}|…{2,}|[.…]{4,}/g;
  let blanks = [], bi = -1, had = false;
  const scan = () => { blanks = []; const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && n.parentElement.closest('.hs-t,.pvs') ? 2 : 1 });
    for (let n; (n = w.nextNode());) { RE.lastIndex = 0; let m; while ((m = RE.exec(n.data))) { const r = new Range(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); blanks.push(r); } }
    if (HL) CSS.highlights.set('pt-blank', new Highlight(...blanks));
    had = had || blanks.length > 0; Q('.pt-blank').hidden = !had;
    const c = Q('.pt-bc'); c.textContent = blanks.length; c.classList.toggle('ok', !blanks.length);
    B('bnext').title = blanks.length ? 'Còn ' + blanks.length + ' chỗ trống «……» — bấm (hoặc F3) để tới chỗ tiếp theo, chữ được chọn sẵn để gõ đè' : 'Đã điền hết chỗ trống'; };
  const go = dir => { scan(); if (!blanks.length) return;
    const sel = getSelection(), cur = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (cur && d.contains(cur.startContainer)) { const i = blanks.findIndex(r => dir > 0 ? r.compareBoundaryPoints(Range.START_TO_START, cur) > 0 : r.compareBoundaryPoints(Range.START_TO_START, cur) < 0);
      bi = dir > 0 ? (i < 0 ? 0 : i) : (() => { let k = -1; blanks.forEach((r, j) => { if (r.compareBoundaryPoints(Range.START_TO_START, cur) < 0) k = j; }); return k < 0 ? blanks.length - 1 : k; })(); }
    else bi = dir > 0 ? (bi + 1) % blanks.length : (bi - 1 + blanks.length) % blanks.length;
    const r = blanks[bi]; if (d.isContentEditable) d.focus({ preventScroll: true }); sel.removeAllRanges(); sel.addRange(r.cloneRange());
    if (HL) CSS.highlights.set('pt-cur', new Highlight(r));
    const box = r.getBoundingClientRect(); if (box.top < 90 || box.bottom > innerHeight - 50) scrollBy({ top: box.top - innerHeight / 3, behavior: 'smooth' }); };
  let stm = 0; d.addEventListener('input', () => { clearTimeout(stm); stm = setTimeout(() => { scan(); if (HL) CSS.highlights.delete('pt-cur'); }, 250); });
  B('bnext').onclick = () => go(1); B('bprev').onclick = () => go(-1);
  addEventListener('beforeprint', () => { if (HL) { CSS.highlights.delete('pt-blank'); CSS.highlights.delete('pt-cur'); } });
  addEventListener('afterprint', () => { warn = false; scan(); });
  scan();
  // --- In / Bản gốc / Word
  B('print').onclick = () => print();
  B('reset').onclick = () => { if (dirty && !confirm('Bỏ mọi chỗ đã sửa trên bản in này và tải lại bản gốc theo dữ liệu?')) return; H.dataset.ptLeave = '1'; location.reload(); };
  const safe = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'ban-in';
  const dl = (blob, name) => { const a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 6e4); };
  const docx = bar.dataset.docx;
  // Word đúng mẫu (máy chủ dựng .docx, có số trang) khi chưa sửa; đã sửa trên bản in thì xuất đúng nội dung đang thấy
  const wordNow = () => { const c = d.cloneNode(true); c.querySelectorAll('.hs-t,.pvs').forEach(x => x.remove()); c.querySelectorAll('[data-pvb],[data-pva]').forEach(x => { x.removeAttribute('data-pvb'); x.removeAttribute('data-pva'); });
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).filter(t => !/\.pt\{|html\.pv/.test(t)).join('\n');
    const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(document.title) + '</title><style>' + css + '</style></head><body>' + c.innerHTML + '</body></html>';
    dl(new Blob(['﻿', html], { type: 'application/msword' }), safe(document.title) + (dirty ? '_da-sua' : '') + '.doc'); warn = false; };
  const wordSrv = async () => {
    if (location.protocol !== 'blob:') { H.dataset.ptLeave = '1'; location.href = docx; setTimeout(() => delete H.dataset.ptLeave, 1000); return; }
    // bản demo (trang blob:) — nhờ tab ứng dụng dựng tệp
    const b = B('word'), t = b.querySelector('.t'), t0 = t.textContent; b.disabled = true; t.textContent = 'Đang dựng…';
    try { const r = await new Promise((ok, no) => { const ch = new BroadcastChannel('ctg-hs'), id = Math.random().toString(36).slice(2);
        const tm = setTimeout(() => { ch.close(); no(new Error('Không kết nối được tab ứng dụng')); }, 60000);
        ch.onmessage = e => { const m = e.data || {}; if (m.t !== 'res' || m.id !== id) return; clearTimeout(tm); ch.close(); m.ok && m.blob ? ok(m) : no(new Error((m.body && m.body.error) || 'Không tải được')); };
        ch.postMessage({ t: 'req', id, url: docx, init: {}, bin: true }); });
      dl(r.blob, r.name || safe(document.title) + '.docx');
    } catch (e) { wordNow(); } finally { b.disabled = false; t.textContent = t0; } };
  B('word').onclick = () => (docx && !dirty ? wordSrv() : wordNow());
  B('word').title = docx ? 'Tải file Word: chưa sửa gì → bản Word chuẩn của mẫu (có số trang); đã sửa → đúng nội dung đang thấy' : 'Tải file Word đúng nội dung đang thấy (kể cả chỗ đã sửa)';
  // --- phím tắt
  addEventListener('keydown', e => {
    if (e.key === 'F3') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
    else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); const s = document.getElementById('hsSave'); s ? s.click() : B('word').click(); }
  });
}
const ptBtn = (k, ico, label, title, cls = '') => `<button type="button" class="pt-b ${cls}" data-pt="${k}" title="${title}">${ICON[ico]}${label ? `<span class="t">${label}</span>` : ''}</button>`;
// info: dòng mô tả dưới tên bản in (HTML). extra: nút riêng của trang (VD «Lưu vào kho»). docx: đường dẫn tải Word chuẩn do máy chủ dựng (nếu có)
const editBar = (info, { extra = '', docx = '' } = {}) => `<div class="pt" contenteditable="false" role="toolbar" aria-label="Công cụ bản in"${docx ? ` data-docx="${escH(docx)}"` : ''}>
  <div class="pt-l">${ptBtn('side', 'list', '', 'Mục lục — các văn bản trong bản in').replace('<button', '<button hidden')}<div class="pt-ttl"><span class="pt-name"></span><span class="pt-info">${info}</span></div></div>
  <div class="pt-c">
    <span class="pt-g">${ptBtn('undo', 'undo', '', 'Hoàn tác (Ctrl+Z)')}${ptBtn('redo', 'redo', '', 'Làm lại (Ctrl+Y)')}</span>
    <span class="pt-g pt-blank" hidden>${ptBtn('bprev', 'up', '', 'Chỗ trống trước (Shift+F3)')}<button type="button" class="pt-b keep" data-pt="bnext">${ICON.blank}<span class="t">Chỗ trống</span><span class="pt-bc">0</span></button></span>
    <span class="pt-g">${ptBtn('zo', 'minus', '', 'Thu nhỏ')}<button type="button" class="pt-b pt-zl" data-pt="z1" title="Về 100%">100%</button>${ptBtn('zi', 'plus', '', 'Phóng to')}</span>
    ${ptBtn('pv', 'page', 'Trang giấy', 'Xem đúng từng tờ A4 như khi in')}${ptBtn('lock', 'pen', 'Đang sửa', '')}
  </div>
  <div class="pt-r">${extra}${ptBtn('word', 'word', 'Word', '')}${ptBtn('reset', 'reset', 'Bản gốc', 'Bỏ mọi chỗ đã sửa, tải lại bản in theo dữ liệu')}${ptBtn('print', 'print', 'In / PDF', 'In hoặc lưu PDF (Ctrl+P)', 'pri')}</div>
</div>`;
const editDoc = body => `<div class="doc" contenteditable="true" spellcheck="false">${body}</div>
<script>(() => { ${MONEY_SRC}
  const d = document.querySelector('.doc');   // sửa số tiền → dòng bằng chữ cùng trường tự đổi
  // xóa hết số rồi gõ lại thì trình duyệt bỏ thẻ đánh dấu → nhớ ô đang sửa (theo đoạn chứa nó) và gắn lại vào phần số mới gõ
  const box = [...d.querySelectorAll('[data-so]')].map(s => ({ k: s.dataset.so, s, blk: s.closest('p,td,li,div') }));
  const at = () => { const n = getSelection().anchorNode; return n?.nodeType === 3 ? n.parentElement : n; };
  let cur = null;
  d.addEventListener('beforeinput', () => { const el = at(); cur = box.find(b => b.s.isConnected && b.s.contains(el)) || (cur && !cur.s.isConnected && cur.blk.contains(el) ? cur : null); });
  d.addEventListener('input', () => { if (!cur) return; const el = at();
    if (!cur.s.isConnected && el && el !== cur.blk && cur.blk.contains(el) && /^[0-9.,\\s]*$/.test(el.textContent)) { el.dataset.so = cur.k; cur.s = el; }
    const v = cur.s.isConnected ? +cur.s.textContent.replace(/[^0-9]/g, '') : 0;
    d.querySelectorAll('[data-chu="' + cur.k + '"]').forEach(w => w.textContent = v ? moneyWords(v) : ''); });
})(); (${pvView.toString()})(); (${ptShell.toString()})()</script>`;

// bản đăng ký căn hộ / nội thất từ phiếu đăng ký (GD-01) — chọn mẫu ở Quản trị › Mẫu biểu
const DOTS = '..............................';     // ô trống trên bản in → để khách / nhân viên điền tay
const PRINT_KIND = { dang_ky_can: 'bản đăng ký căn hộ', dang_ky_noi_that: 'bản đăng ký nội thất' };
// mẫu hợp với căn: đúng loại, phạm vi (mã dự án / tòa) và số phòng ngủ — mẫu ghi rõ phạm vi xếp trước mẫu chung
// ===== mẫu theo dự án / tòa (11/11/2026): ô «Áp dụng cho dự án / tòa» = mã dự án (CTS), dự án-tòa (CTS-O) hoặc tòa (O); trống = mọi căn =====
const scopeKeys = t => String(t.scope || '').split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
// căn / dự án của một bản ghi: { pcode, bcode, pname, bname, bedrooms, unit }
async function recScope(ent, id) {
  const r = id && E[ent] ? await one(`SELECT * FROM ${E[ent].table} WHERE id = $1`, [+id]) : null;
  if (!r) return {};
  let unitId = ent === 'unit' ? r.id : r.unit_id;
  if (!unitId && r.contract_id) unitId = (await one('SELECT unit_id FROM kd_contract WHERE id = $1', [r.contract_id]))?.unit_id;
  if (!unitId && r.reservation_id) unitId = (await one('SELECT unit_id FROM kd_reservation WHERE id = $1', [r.reservation_id]))?.unit_id;
  if (unitId) {
    const u = await one('SELECT u.code, u.bedrooms, b.code bcode, b.name bname, p.code pcode, p.name pname FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project p ON p.id = u.project_id WHERE u.id = $1', [unitId]);
    if (u) return { pcode: u.pcode, bcode: u.bcode, pname: u.pname, bname: u.bname, bedrooms: u.bedrooms, unit: u.code };
  }
  if (r.unit_text) {   // hồ sơ NOXH chưa gắn căn: lấy theo mã căn ghi tay CTS-O-0101
    const [pc, bc] = String(r.unit_text).toUpperCase().split('-');
    const p = pc && await one('SELECT code, name FROM kd_project WHERE upper(code) = $1', [pc]);
    if (p) return { pcode: p.code, bcode: bc || null, pname: p.name, bname: bc ? 'Tòa ' + bc : null, unit: r.unit_text };
  }
  const pid = ent === 'project' ? r.id : r.project_id;
  const p = pid && await one('SELECT code, name FROM kd_project WHERE id = $1', [pid]);
  return p ? { pcode: p.code, pname: p.name } : {};
}
// mẫu hợp với căn / dự án: 2 = đúng tòa, 1 = đúng dự án, 0 = mẫu chung; -1 = mẫu của dự án / tòa khác (không dùng)
function tplFitLevel(t, sc) {
  const ks = scopeKeys(t);
  const bed = !t.bedrooms || !sc.bedrooms || t.bedrooms === sc.bedrooms;
  if (!bed) return -1;
  if (!ks.length) return 0;
  const P = String(sc.pcode || '').toUpperCase(), B = String(sc.bcode || '').toUpperCase();
  if (P && B && (ks.includes(`${P}-${B}`) || ks.includes(B))) return 2;
  if (P && ks.includes(P)) return 1;
  return -1;
}
async function regTemplates(kind, unitId) {
  const ts = await q("SELECT * FROM kd_template WHERE active AND kind = $1 AND coalesce(ent, 'reservation') IN ('reservation', 'noxh_check') ORDER BY id", [kind]);
  if (!unitId) return ts;
  const u = await one('SELECT u.bedrooms, b.code bcode, p.code pcode FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project p ON p.id = u.project_id WHERE u.id = $1', [unitId]);
  if (!u) return ts;
  const keys = [u.pcode, u.bcode, `${u.pcode}-${u.bcode}`].filter(Boolean).map(x => String(x).toUpperCase());
  const fit = t => { const sc = String(t.scope || '').split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
    return (!sc.length || sc.some(x => keys.includes(x))) && (!t.bedrooms || t.bedrooms === u.bedrooms); };
  const rank = t => (t.scope ? 0 : 2) + (t.bedrooms ? 0 : 1);
  return ts.filter(fit).sort((x, y) => rank(x) - rank(y) || x.id - y.id);
}
// «3. Phương thức thanh toán» trên bản đăng ký theo chính sách đang áp cho phiếu (14/11/2026): bản đăng ký căn hộ = Tiến độ thu tiền HĐMB (phí bảo trì
// ghi vào đợt thu phí bảo trì), bản đăng ký nội thất = Tiến độ thu giá trị hoàn thiện. Chính sách không khai tiến độ → null (giữ nội dung của mẫu)
function polPayLines(pol, kind) {
  const pc = v => String(v).replace('.', ','), cut = s => String(s || '').trim().replace(/[.;,\s]+$/, '');
  if (kind === 'dang_ky_noi_that') {
    const fs = (Array.isArray(pol?.fin_sched) ? pol.fin_sched : []).filter(x => +x.pct > 0); if (!fs.length) return null;
    return fs.map((x, i) => { let t = cut(x.name) || `Bên Mua thanh toán cho Bên Bán ${pc(x.pct)}% giá trị gói hoàn thiện`; if (!t.includes('%')) t += ` (${pc(x.pct)}% giá trị gói hoàn thiện)`;
      return (fs.length > 1 && !/^Đợt\s/i.test(t) ? `Đợt ${i + 1}: ${t}` : t) + '.'; });
  }
  const all = Array.isArray(pol?.pay_sched) ? pol.pay_sched : [], ps = all.filter(x => !x.maint && +x.pct > 0), mr = all.find(x => x.maint); if (!ps.length) return null;
  const mp = pc(pol.maint_pct ?? 2), own = mr && mr.days != null && mr.days !== '' && !ps.some(x => x.days != null && +x.days === +mr.days);   // phí bảo trì có hạn riêng → dòng riêng
  const mk = !mr || own ? -1 : mr.days != null && mr.days !== '' ? ps.findIndex(x => x.days != null && +x.days === +mr.days) : Math.min(Math.max(1, +pol.pay_mdot || 3), ps.length) - 1;
  const out = ps.map((x, i) => {
    let t = cut(x.name) || `Bên Mua thanh toán cho Bên Bán ${pc(x.pct)}% giá trị căn hộ`; if (!t.includes('%')) t += ` (${pc(x.pct)}% giá trị căn hộ)`;
    if (i === mk && !/bảo trì/i.test(t)) t += ` và ${mp}% phí bảo trì`;
    return (/^Đợt\s/i.test(t) ? t : `Đợt ${i + 1}: ${t}`) + '.';
  });
  if (own) out.push(`${cut(mr.name) || 'Phí bảo trì'}: thanh toán sau ${mr.days} ngày kể từ ngày ký Hợp đồng mua bán.`);
  return out;
}
// thay các đoạn dưới mục «… Phương thức thanh toán» của mẫu (tới mục đánh số kế tiếp / khung ký) bằng tiến độ của chính sách; mẫu có trường {tien_do_thanh_toan} thì điền vào đó
function payReplace(html, lines) {
  if (!lines?.length) return html.split('{tien_do_thanh_toan}').join('');
  const ps = lines.map(t => `<p class="j">${escH(t)}</p>`).join('\n');
  if (html.includes('{tien_do_thanh_toan}')) return html.split('{tien_do_thanh_toan}').join(ps);
  return html.replace(/(<p[^>]*>(?:\s|<[^>]+>)*\d+\.\s*Phương thức thanh toán[\s\S]*?<\/p>)[\s\S]*?(?=<p[^>]*>(?:\s|<[^>]+>)*\d+\.\s|<table class="sign")/i, (m, h) => `${h}\n${ps}\n`);
}
async function printReservation(id, user, kind, tplCode) {
  if (!can(user, E.reservation, 'r')) deny();
  if (!PRINT_KIND[kind]) bad('Loại bản in không hợp lệ');
  const { row: r } = await C.get('reservation', id, user, { reveal: true });
  const u = await one(`SELECT u.*, b.code building, p.name project, p.address p_addr, p.investor, pk.code pk_code, pk.name pk_name, pk.value pk_value, pk.items pk_items
      FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project p ON p.id = u.project_id LEFT JOIN kd_package pk ON pk.id = u.package_id WHERE u.id = $1`, [r.unit_id]);
  const tpl = tplCode ? await one('SELECT * FROM kd_template WHERE active AND kind = $1 AND code = $2', [kind, tplCode]) : (await regTemplates(kind, r.unit_id))[0];
  if (!tpl) bad(`Chưa có mẫu ${PRINT_KIND[kind]} cho căn ${u.code} — tạo ở Quản trị › Mẫu biểu`);
  const pii = ['truong_phong', 'lanh_dao', 'ho_so', 'admin'].includes(user.role);
  const k = r.customer_id ? await one('SELECT tax_code FROM kd_customer WHERE id = $1', [r.customer_id]) : null;
  const pol = r.policy_id ? await one('SELECT code, version, pay_sched, fin_sched, pay_mdot, maint_pct FROM kd_price_policy WHERE id = $1', [r.policy_id]) : null;
  const lab = (f, v) => E.reservation.fields.find(x => x.k === f).o.find(o => o[0] === v)?.[1] || '';
  // giá trị hoàn thiện (nội thất): chỉ theo chính sách bán hàng (15/11/2026) — chính sách không khai căn này = không có nội thất
  const finish = await B.polFinish({ q, one }, u, r.policy_id, r.reg_date || undefined);
  // bảng giá trên đơn = đúng các cột của căn ở Danh mục sản phẩm (cùng cách tính với prodRow, public/screens.js):
  // căn có số Bravo (đơn giá nền, trước thuế, tiền thuế) thì lấy nguyên; chưa có thì tách từ giá sau thuế theo % thuế (mặc định 5%)
  const vat = u.vat_pct ?? 5;
  const after = u.price_net ?? (u.total_price != null && u.maint_fee != null ? u.total_price - u.maint_fee - (u.finish_value || 0) : null);
  const pretax = u.pretax ?? (after != null ? Math.round(after / (1 + vat / 100)) : null);
  const unitPrice = u.base_price ?? (pretax != null && u.area_tt ? Math.round(pretax / u.area_tt) : null);
  const tax = u.tax_amt ?? (after != null && pretax != null ? after - pretax : null), maint = u.maint_fee;
  // tổng giá trị căn hộ in riêng với nội thất: = sau thuế + bảo trì ở Danh mục sản phẩm (không cộng giá trị hoàn thiện)
  const total = after != null ? after + (maint || 0) : +r.unit_value || r.price;
  const rd = r.reg_at ? new Date(Date.parse(r.reg_at) + 7 * 3600e3) : new Date(r.reg_date || Date.now());
  const map = { ma_phieu: r.code, ngay_dk: r.reg_at ? new Date(Date.parse(r.reg_at) + 7 * 3600e3).toISOString().replace(/^(\d+)-(\d+)-(\d+)T(\d+:\d+).*/, '$4 ngày $3/$2/$1') : dmy(r.reg_date), ten_kh: r.cust_name, dien_thoai: r.phone, cccd: pii ? r.id_no : '(ẩn)', ngay_cap: pii ? dmy(r.id_date) : '', noi_cap: pii ? r.id_place : '', dia_chi: r.address,
    ma_can: u.code, du_an: u.project, dia_diem: u.p_addr, chu_dau_tu: u.investor, toa: u.building, tang: u.floor, dien_tich: String(u.area_tt ?? '').replace('.', ','), huong: u.direction,
    gia_tri: fmtMoney(r.price), gia_tri_chu: moneyWords(r.price), tien_coc: r.deposit ? fmtMoney(r.deposit) : DOTS, trang_thai: lab('reg_state', r.reg_state), tien_trinh: lab('progress', r.progress), ghi_chu: r.note || '',
    goi_hoan_thien: u.pk_name ? `${u.pk_code} · ${u.pk_name}` : DOTS, gia_tri_hoan_thien: finish ? fmtMoney(finish) : DOTS, gia_tri_hoan_thien_chu: finish ? moneyWords(finish) : DOTS, danh_muc_noi_that: u.pk_items || DOTS + DOTS + DOTS, ngay: dmy(C.today()),
    so_don: u.code.split('-').pop(), ky_hieu: u.code.slice(3, 5), ngay_viet: `ngày ${String(rd.getUTCDate()).padStart(2, '0')} tháng ${String(rd.getUTCMonth() + 1).padStart(2, '0')} năm ${rd.getUTCFullYear()}`,
    don_gia: unitPrice ? fmtMoney(unitPrice) : DOTS, gia_truoc_thue: pretax ? fmtMoney(pretax) : DOTS, thue_vat: tax ? fmtMoney(tax) : DOTS, phi_bao_tri: maint ? fmtMoney(maint) : DOTS, tong_gia: fmtMoney(total), tong_gia_chu: moneyWords(total),
    ma_so_thue: pii ? (k?.tax_code || r.id_no || '') : '(ẩn)', chinh_sach: pol ? `${pol.code} v${pol.version}` : '' };
  // nội dung bắt đầu bằng thẻ HTML → in theo HTML (bỏ script / thuộc tính on…); còn lại in nguyên văn
  const html = /^\s*</.test(tpl.content || '');
  const merge = t => t.replace(/\{(\w+)\}/g, (m, x) => x in map ? mergeVal(map, x) : m);
  const body = html
    ? merge(payReplace(tpl.content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ''), polPayLines(pol, kind)))
    : `<div style="white-space:pre-wrap">${merge(escH(tpl.content))}</div>`;
  await C.audit({ q }, 'reservation', r.id, 'in_' + kind, null, null, user, tpl.code);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escH(r.code)} – ${escH(tpl.name)}</title><style>
    @page{size:A4;margin:20mm 15mm 20mm 30mm} body{font:13pt/1.4 "Times New Roman",serif;color:#000;max-width:165mm;margin:auto}
    .qh{text-align:center;font-size:13pt;line-height:1.3} .qh .tn{font-size:14pt;display:inline-block;padding-bottom:2pt;border-bottom:1px solid #000}
    p{margin:3pt 0} h2{text-align:center;font-size:14pt;margin:14pt 0 2pt} .c{text-align:center} .r{text-align:right} .j{text-align:justify} .n{text-align:right;white-space:nowrap} .h{font-weight:bold;margin-top:8pt}
    table{border-collapse:collapse;width:100%;margin:4pt 0} table.b td{border:1px solid #000;padding:3pt 6pt} table.b.sm td{font-size:11.5pt;padding:2pt 4pt} table.b .th td{font-weight:bold;text-align:center} table.b .grp td{background:#f2f2f2}
    tr,table.sign{page-break-inside:avoid} .h{page-break-after:avoid}
    table.kv3{width:auto} table.kv3 td{padding:0 24pt 0 0;vertical-align:top} table.kv3 td:nth-child(-n+2){white-space:nowrap} table.sign{margin-top:14pt} table.sign td{width:50%;text-align:center;vertical-align:top}
    ${EDIT_CSS}</style></head><body>${editBar(`Bản in từ mẫu «${escH(tpl.name)}» · phiếu ${escH(r.code)}`)}${editDoc(body)}</body></html>`;
}

// phiếu đề nghị hủy giao dịch / đổi căn / đổi khách (3 phần + ký: người lập phiếu – bộ phận kiểm tra – người phê duyệt)
// phiếu thanh lý chung (16/11/2026): bảng từng hợp đồng — loại, số HĐ, tiền đã thu, khấu trừ, phải hoàn trả + tổng
function liqLinesHtml(r) {
  const xs = r.kind === 'thanh_ly' && Array.isArray(r.items) ? r.items : []; if (!xs.length) return '';
  const KL = Object.fromEntries(E.contract.fields.find(f => f.k === 'kind').o.map(o => [o[0], o[1]])), t = k => xs.reduce((s, x) => s + (+x[k] || 0), 0), m = v => fmtMoney(+v || 0);
  return `<p>Các hợp đồng thanh lý chung trong phiếu:</p><table class="lq"><tr><th>STT</th><th>Loại hợp đồng</th><th>Số hợp đồng</th><th>Tiền đã thu</th><th>Khấu trừ</th><th>Phải hoàn trả</th></tr>
${xs.map((x, i) => `<tr><td class="c">${i + 1}</td><td>${escH(KL[x.kind] || x.kind || '')}</td><td>${escH(x.number || '')}</td><td class="n">${m(x.collected)}</td><td class="n">${m(x.deduct)}</td><td class="n">${m(x.refund)}</td></tr>`).join('')}
<tr><td></td><td colspan="2"><b>Tổng cộng</b></td><td class="n"><b>${m(t('collected'))}</b></td><td class="n"><b>${m(t('deduct'))}</b></td><td class="n"><b>${m(t('refund'))}</b></td></tr></table>`;
}
async function printCancelReq(id, user) {
  const { row: r } = await C.get('cancel_req', id, user, { reveal: true });
  const x = await one(`SELECT p.name project, u.code unit, c.number contract, s.code res, nu.code new_unit, nk.full_name new_cust, o.full_name maker
    FROM kd_cancel_req t LEFT JOIN kd_project p ON p.id = t.project_id LEFT JOIN kd_unit u ON u.id = t.unit_id LEFT JOIN kd_contract c ON c.id = t.contract_id LEFT JOIN kd_reservation s ON s.id = t.reservation_id
      LEFT JOIN kd_unit nu ON nu.id = t.new_unit_id LEFT JOIN kd_customer nk ON nk.id = t.new_customer_id LEFT JOIN kd_user o ON o.id = t.created_by WHERE t.id = $1`, [r.id]);
  const lab = (k, v) => E.cancel_req.fields.find(f => f.k === k).o.find(o => o[0] === v)?.[1] || '';
  const D = '..............................', v = s => s ? escH(s) : D, box = on => on ? '☒' : '☐';
  const plan = ['hoan_tien', 'chuyen_can_moi', 'khac'].map(k => `${box(r.money_plan === k)} ${lab('money_plan', k)}`).join('&nbsp;&nbsp;&nbsp;') + (r.money_plan === 'khac' && r.money_note ? `: ${escH(r.money_note)}` : '');
  const kind = lab('kind', r.kind) + (r.kind === 'doi_can' && x.new_unit ? ` → căn ${escH(x.new_unit)}` : '') + (r.kind === 'doi_kh' && x.new_cust ? ` → ${escH(x.new_cust)}` : '');
  const rd = new Date(Date.parse(r.created_at || Date.now()) + 7 * 3600e3);
  const body = `<div class="qh"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b class="tn">Độc lập - Tự do - Hạnh phúc</b></div>
<h2>PHIẾU ĐỀ NGHỊ ${escH(lab('kind', r.kind).toUpperCase())}</h2><p class="c">Số: ${escH(r.code)}</p>
<p class="h">1. Thông tin khách hàng</p>
<p>Họ tên khách hàng: <b>${v(r.cust_name)}</b></p><p>Số điện thoại: ${v(r.phone)}</p>
<p>Dự án: ${v(x.project)}&nbsp;&nbsp;&nbsp;&nbsp;Mã căn hộ: <b>${v(x.unit)}</b></p><p>Mã hợp đồng: ${Array.isArray(r.items) && r.items.length > 1 ? escH(r.items.map(i => i.number).join(' + ')) : v(x.contract)}${x.res ? `&nbsp;&nbsp;&nbsp;&nbsp;Phiếu giữ chỗ: ${escH(x.res)}` : ''}</p>
<p class="h">2. Nội dung đề nghị</p>
<p>Loại đề nghị: ${kind}</p><p>Phương án xử lý: ${plan}</p>
${liqLinesHtml(r)}<p>${r.kind === 'thanh_ly' ? 'Tổng số tiền phải hoàn trả' : 'Số tiền đề nghị xử lý'}: <b>${r.pay_amount ? fmtMoney(r.pay_amount) : D}</b> đồng${r.pay_amount ? ` <i>(${moneyWords(r.pay_amount)})</i>` : ''}</p>
<p>Ngày thanh lý: ${r.liquidate_on ? dmy(r.liquidate_on) : '....../....../......'}</p><p>Ngày dự kiến chi trả: ${r.pay_due ? dmy(r.pay_due) : '....../....../......'}${r.wait_days != null && r.liquidate_on ? ` <i>(ngày thanh lý + ${r.wait_days} ngày)</i>` : ''}</p>
${r.reason ? `<p>Lý do: ${escH(r.reason)}</p>` : ''}
<p class="h">3. Chuyển xử lý</p>
<p>Bộ phận tiếp nhận xử lý: ${v(r.handler_dept)}</p><p>Hồ sơ kèm theo: ${v(r.attachments)}</p><p>Ghi chú: ${v(r.note)}</p>
<p class="r"><i>Bắc Ninh, ngày ${String(rd.getUTCDate()).padStart(2, '0')} tháng ${String(rd.getUTCMonth() + 1).padStart(2, '0')} năm ${rd.getUTCFullYear()}</i></p>
<table class="sign3"><tr><td><b>NGƯỜI LẬP PHIẾU</b><br><i>(Ký, ghi rõ họ tên)</i></td><td><b>BỘ PHẬN KIỂM TRA</b><br><i>(Ký, ghi rõ họ tên)</i></td><td><b>NGƯỜI PHÊ DUYỆT</b><br><i>(Ký, ghi rõ họ tên)</i></td></tr>
<tr class="nm"><td>${escH(x.maker || '')}</td><td></td><td></td></tr></table>`;
  await C.audit({ q }, 'cancel_req', r.id, 'in_phieu', null, null, user);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escH(r.code)} – Phiếu đề nghị</title><style>
    @page{size:A4;margin:20mm 15mm 20mm 25mm} body{font:13pt/1.45 "Times New Roman",serif;color:#000;max-width:170mm;margin:auto}
    .qh{text-align:center;line-height:1.3} .qh .tn{display:inline-block;padding-bottom:2pt;border-bottom:1px solid #000} h2{text-align:center;font-size:14pt;margin:14pt 0 2pt}
    p{margin:3pt 0} .c{text-align:center} .r{text-align:right;margin-top:10pt} .h{font-weight:bold;margin-top:9pt}
    table.lq{width:100%;border-collapse:collapse;margin:4pt 0} table.lq th,table.lq td{border:1px solid #000;padding:2pt 5pt;font-size:12pt} table.lq .n{text-align:right;white-space:nowrap}
    table.sign3{width:100%;border-collapse:collapse;margin-top:6pt;page-break-inside:avoid} table.sign3 td{width:33%;text-align:center;vertical-align:top} table.sign3 tr.nm td{padding-top:70pt}
    ${EDIT_CSS}</style></head><body>${editBar(`Phiếu đề nghị ${escH(r.code)}`)}${editDoc(body)}</body></html>`;
}

// thông báo mở bán: «thong_bao» theo mẫu Thông báo (Mẫu biểu, mã TB-MOBAN-…, theo dự án) / «danh_sach» = danh sách căn mở bán (như «DS mở bán đợt 5 CTS.xlsx»)
// 17/11/2026: thông báo cho thuê — mẫu TB-CHOTHUE-… (chưa có mẫu thì dùng mẫu chuẩn), trường trộn thêm giá thuê, thời hạn, kỳ thanh toán, đặt cọc, ưu đãi theo chính sách cho thuê;
// danh sách căn cho thuê kèm tiền thuê/tháng từng căn theo chính sách
async function printSaleNotice(id, user, kind, tplCode) {
  const { row: n } = await C.get('sale_notice', id, user);
  const thue = n.deal === 'thue', W = thue ? 'cho thuê' : 'mở bán', WT = thue ? 'Cho thuê' : 'Mở bán';
  const p = await one('SELECT * FROM kd_project WHERE id = $1', [n.project_id]);
  const seller = M.SELLERS.find(s => s.projects.includes(p.code)) || M.SELLERS[0];
  const g = String(n.unit_group || '').split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
  const units = (await q(`SELECT u.code, u.floor, u.area_tt, u.area_xd, u.position, b.code b FROM kd_unit u JOIN kd_building b ON b.id = u.building_id WHERE u.project_id = $1 ORDER BY b.code, u.floor, u.code`, [p.id]))
    .filter(u => g.includes('*') || g.includes(String(u.b).toUpperCase()) || g.includes(u.code.toUpperCase()));
  const pol = thue && n.policy_id ? await one('SELECT * FROM kd_price_policy WHERE id = $1', [n.policy_id]) : null;
  const RM = thue ? new Map((await B.noticeRent({ q, one }, n.project_id, n.policy_id, units)).map(x => [x.code, x])) : null;   // đơn giá thuê từng căn (chưa có chính sách = Chưa thiết lập)
  const d = n.notice_on ? new Date(n.notice_on + 'T00:00:00Z') : new Date(Date.now() + 7 * 3600e3);
  const dot = String(n.title || '').trim(), DOT = dot ? dot[0].toUpperCase() + dot.slice(1) : '';
  const num = v => v == null ? '' : String(+v).replace('.', ',');
  const CSS = `@page{size:A4;margin:15mm 15mm 15mm 25mm} body{font:13pt/1.45 "Times New Roman",serif;color:#000;max-width:170mm;margin:auto}
    p{margin:3pt 0} .c{text-align:center} .r{text-align:right} .j{text-align:justify} h2{text-align:center;font-size:14pt;margin:10pt 0 2pt}
    table.hd2{width:100%;border-collapse:collapse} table.hd2 td{vertical-align:top} table.hd2 td:first-child{width:42%;padding-right:10pt} table.hd2:first-child{font-size:12pt} table.hd2:first-child b{white-space:nowrap} .tn{display:inline-block;padding-bottom:2pt;border-bottom:1px solid #000}
    table.ds{width:100%;border-collapse:collapse;margin-top:8pt} table.ds th,table.ds td{border:1px solid #000;padding:2pt 6pt} table.ds th{text-align:center} table.ds td.n{text-align:right} table.ds td.ct{text-align:center} tr{page-break-inside:avoid}
    ${EDIT_CSS}`;
  let body;
  if (kind === 'danh_sach') {
    const rc = thue;   // danh sách cho thuê: cột đơn giá thuê + tiền thuê/tháng
    body = `<p class="c"><b>${escH(seller.name.toUpperCase())}</b></p><h2>DANH SÁCH ${W.toUpperCase()} ${escH(DOT.toUpperCase())}</h2><p class="c"><b>Dự án nhà ở xã hội ${escH(p.name)}</b></p>${rc && pol ? `<p class="c"><i>Theo chính sách cho thuê ${escH(pol.code)} v${pol.version}</i></p>` : ''}
<table class="ds"><thead><tr><th>STT</th><th>Mã căn hộ</th><th>Diện tích thông thủy (m²)</th><th>Diện tích xây dựng (m²)</th>${rc ? '<th>Giá thuê nhà/tháng (đồng, đã gồm thuế GTGT)</th><th>Giá thuê nội thất/tháng (đồng)</th><th>Tổng cộng/tháng (đồng, đã gồm thuế GTGT tiền thuê nhà)</th>' : ''}</tr></thead><tbody>
${units.map((u, i) => `<tr><td class="ct">${i + 1}</td><td>${escH(u.code)}</td><td class="n">${num(u.area_tt)}</td><td class="n">${num(u.area_xd)}</td>${rc ? (x => x?.rent_house ? `<td class="n">${C.fmtMoney(x.rent_house)}</td><td class="n">${C.fmtMoney(x.rent_furn || 0)}</td><td class="n">${C.fmtMoney(x.rent_total)}</td>` : '<td class="ct"><i>Chưa thiết lập</i></td><td class="n">0</td><td></td>')(RM.get(u.code)) : ''}</tr>`).join('')}
<tr><td></td><td><b>Tổng cộng: ${units.length} căn</b></td><td class="n"><b>${num(Math.round(units.reduce((s, u) => s + (+u.area_tt || 0), 0) * 10) / 10)}</b></td><td class="n"><b>${num(Math.round(units.reduce((s, u) => s + (+u.area_xd || 0), 0) * 10) / 10)}</b></td>${rc ? '<td></td><td></td><td></td>' : ''}</tr></tbody></table>`;
  } else {
    const pre = thue ? 'TB-CHOTHUE' : 'TB-MOBAN';
    let tpl = tplCode ? await one('SELECT * FROM kd_template WHERE active AND code = $1', [tplCode])
      : (await q(`SELECT * FROM kd_template WHERE active AND kind = 'thong_bao' AND code LIKE '${pre}%' AND coalesce(ent, 'sale_notice') = 'sale_notice' ORDER BY id`)).map(t => [t, tplFitLevel(t, { pcode: p.code })]).filter(x => x[1] >= 0).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!tpl && thue) tpl = require('./mau-mo-ban').MAU_CHO_THUE()[0];   // chưa có mẫu cho thuê trong Mẫu biểu → mẫu chuẩn
    if (!tpl) bad(`Chưa có mẫu Thông báo ${W} — tạo ở Quản trị › Mẫu biểu (loại Thông báo, mã bắt đầu ${pre})`);
    // chính sách cho thuê → các đoạn giá thuê, thời hạn, kỳ thanh toán, đặt cọc, ưu đãi, các khoản phí
    const f0 = v => v == null || v === '' ? '' : C.fmtMoney(+v), pc = v => String(+v).replace('.', ',');
    const RP = !pol ? {} : {
      gia_thue: (pol.rent_mode === 'co_dinh' ? `${f0(pol.rent_fixed)} đồng/căn/tháng` : [`Căn thường: ${f0(pol.rent_price)} đồng/m²/tháng`, +pol.rent_price_goc ? `Căn góc: ${f0(pol.rent_price_goc)} đồng/m²/tháng` : '', +pol.rent_price_thang ? `Căn cạnh thang: ${f0(pol.rent_price_thang)} đồng/m²/tháng` : ''].filter(Boolean).join('; '))
        + (+pol.rent_vat_pct ? ` (chưa gồm thuế GTGT ${pc(pol.rent_vat_pct)}%)` : ''),
      thoi_han_thue: pol.rent_term ? `${pol.rent_term} tháng` : '',
      ky_thanh_toan: `${({ 1: 'Hàng tháng', 3: 'Hàng quý (3 tháng)', 6: '6 tháng/kỳ', 12: 'Hàng năm' })[pol.pay_cycle] || `${pol.pay_cycle_n || ''} tháng/kỳ`}, thanh toán ${pol.pay_when === 'cuoi_ky' ? 'cuối kỳ' : 'đầu kỳ'}${+pol.pay_days ? `, chậm nhất ${pol.pay_days} ngày kể từ ${pol.pay_when === 'cuoi_ky' ? 'ngày cuối kỳ' : 'ngày đầu kỳ'}` : ''}`,
      dat_coc: pol.dep_mode === 'thang' ? `${pc(pol.dep_months)} tháng tiền thuê` : pol.dep_mode === 'so_tien' ? `${f0(pol.dep_amount)} đồng` : 'Không đặt cọc',
      uu_dai: [+pol.free_months ? `Miễn tiền thuê ${pol.free_months} tháng đầu` : '', +pol.disc_pct ? `Giảm ${pc(pol.disc_pct)}% tiền thuê${pol.disc_months ? ` trong ${pol.disc_months} tháng` : ''}` : '', pol.promo_terms || ''].filter(Boolean).join('; ') || 'Không',
      phi: (Array.isArray(pol.rent_fees) ? pol.rent_fees : []).map(x => `${x.name}: ${f0(x.amount)} đồng${x.basis === 'm2' ? '/m²/tháng' : x.basis === 'mot_lan' ? ' (một lần)' : '/tháng'}`).join('; ') || 'Không',
      chinh_sach_thue: `${pol.code} v${pol.version}${pol.name ? ' – ' + pol.name : ''}`,
    };
    const map = { cong_ty: seller.name, cong_ty_hoa: seller.name.toUpperCase(), so_vb: n.doc_no || `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/${d.getUTCFullYear()}/TB-${p.code}`,
      ngay_viet: `ngày ${String(d.getUTCDate()).padStart(2, '0')} tháng ${String(d.getUTCMonth() + 1).padStart(2, '0')} năm ${d.getUTCFullYear()}`, ten_dot: escH(DOT), du_an: escH(p.name),
      ngay_bat_dau: n.open_on ? dmy(n.open_on) : '....../....../......', ngay_ket_thuc: n.close_on ? dmy(n.close_on) : '....../....../......', so_can: String(units.length),
      ...Object.fromEntries(Object.entries(RP).map(([k, v]) => [k, escH(v)])) };
    body = tpl.content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/\{(\w+)\}/g, (m, k) => k in map ? map[k] : m);
  }
  await C.audit({ q }, 'sale_notice', n.id, kind === 'danh_sach' ? 'in_danh_sach' : 'in_thong_bao', null, null, user);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escH(n.code)} – ${kind === 'danh_sach' ? 'Danh sách ' + W : 'Thông báo ' + W}</title><style>${CSS}</style></head>
<body>${editBar(`${kind === 'danh_sach' ? 'Danh sách căn ' + W : 'Thông báo ' + W} ${escH(n.code)} · ${units.length} căn`)}${editDoc(body)}</body></html>`;
}

// ===== Mẫu in chung cho mọi module (11/11/2026) =====
// Mẫu gắn module (kd_template.ent) → nút «In theo mẫu» trên bản ghi của module đó. Trường trộn {ma_truong}: trường của bản ghi + khách hàng, căn hộ, hợp đồng liên quan + chung.
const PII_PRINT = ['truong_phong', 'lanh_dao', 'ho_so', 'admin'];
const REL = {
  kh: ['Khách hàng', [['ten_kh', 'Họ tên khách hàng'], ['ma_kh', 'Mã khách hàng'], ['dien_thoai', 'Điện thoại'], ['email', 'Email'], ['cccd', 'Số CCCD'], ['ngay_cap', 'Ngày cấp CCCD'], ['noi_cap', 'Nơi cấp CCCD'], ['dia_chi', 'Địa chỉ']]],
  can: ['Căn hộ', [['ma_can', 'Mã căn'], ['du_an', 'Dự án'], ['dia_diem', 'Địa điểm dự án'], ['chu_dau_tu', 'Chủ đầu tư'], ['toa', 'Tòa'], ['tang', 'Tầng'], ['dien_tich', 'Diện tích thông thủy (m²)'], ['huong', 'Hướng'], ['phong_ngu', 'Số phòng ngủ']]],
  hd: ['Hợp đồng', [['so_hd', 'Số hợp đồng'], ['ngay_ky', 'Ngày ký hợp đồng'], ['gia_tri', 'Giá trị hợp đồng'], ['gia_tri_chu', 'Giá trị hợp đồng bằng chữ'], ['lich_thanh_toan', 'Bảng lịch thanh toán']]],
  chung: ['Chung', [['ngay', 'Ngày in (dd/mm/yyyy)'], ['ngay_viet', 'Ngày in (ngày … tháng … năm …)'], ['nguoi_lap', 'Người in']]],
};
const SKIP_T = ['json', 'check', 'kenh'];
function tplFields(ent) {
  const e = E[ent]; if (!e) bad('Module không hợp lệ');
  const has = k => e.fields.some(f => f.k === k);
  const own = e.fields.filter(f => !SKIP_T.includes(f.t) && !f.noForm).map(f => [f.k, f.l]);
  for (const f of e.fields) if (f.t === 'money') own.push([f.k + '_chu', f.l + ' (bằng chữ)']);
  const gs = [[e.title, own]];
  if (ent === 'customer' || has('customer_id')) gs.push(REL.kh);
  if (ent === 'unit' || has('unit_id')) gs.push(REL.can);
  if (ent === 'contract' || has('contract_id')) gs.push(REL.hd);
  gs.push(REL.chung);
  return gs.map(([g, items]) => ({ g, items: items.map(([k, l]) => ({ k, l })) }));
}
async function fieldText(f, v, row) {
  if (v == null || v === '') return '';
  if (['ref', 'refs', 'user'].includes(f.t)) return row[f.k + '__l'] ?? '';
  if (f.t === 'sel') return await C.optLabel(f, v) ?? v;
  if (f.t === 'date') return dmy(v);
  if (f.t === 'dt') return dmy(String(v).slice(0, 10)) + ' ' + String(v).slice(11, 16);
  if (f.t === 'money') return fmtMoney(v);
  if (f.t === 'bool') return v ? 'Có' : 'Không';
  if (f.t === 'num') return String(v).replace('.', ',');
  return String(v);
}
async function tplMap(ent, row, user) {
  const e = E[ent], map = {}, pii = PII_PRINT.includes(user.role);
  for (const f of e.fields) {
    if (SKIP_T.includes(f.t)) continue;
    map[f.k] = f.pii && !pii && row[f.k] ? '(ẩn)' : await fieldText(f, row[f.k], row);
    if (f.t === 'money') map[f.k + '_chu'] = +row[f.k] ? moneyWords(+row[f.k]) : '';
  }
  const kid = ent === 'customer' ? row.id : row.customer_id;
  if (kid) {
    const k = await one('SELECT * FROM kd_customer WHERE id = $1', [kid]);
    if (k) Object.assign(map, { ten_kh: k.full_name, ma_kh: k.code, dien_thoai: k.phone, email: k.email, cccd: pii ? k.id_no : (k.id_no ? '(ẩn)' : ''), ngay_cap: pii ? dmy(k.id_date) : '', noi_cap: pii ? k.id_place : '', dia_chi: k.address });
  }
  const cid = ent === 'contract' ? row.id : row.contract_id;
  const c = cid ? await one('SELECT * FROM kd_contract WHERE id = $1', [cid]) : null;
  if (c) {
    const inst = await q('SELECT * FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [c.id]);
    Object.assign(map, { so_hd: c.number, ngay_ky: dmy(c.signed_on || c.contract_on), gia_tri: fmtMoney(c.value), gia_tri_chu: +c.value ? moneyWords(+c.value) : '',
      lich_thanh_toan: inst.length ? `<table class="sch"><tr><th>Đợt</th><th>Nội dung</th><th>Hạn thanh toán</th><th>Tỷ lệ</th><th>Số tiền (đồng)</th></tr>${inst.map(i => `<tr><td>${i.seq}</td><td>${escH(i.name)}</td><td>${dmy(i.due_on)}</td><td>${i.pct ?? ''}${i.pct != null ? '%' : ''}</td><td style="text-align:right">${fmtMoney(i.amount)}</td></tr>`).join('')}</table>` : '' });
  }
  const uid = ent === 'unit' ? row.id : row.unit_id || c?.unit_id;
  if (uid) {
    const u = await one(`SELECT u.*, b.code building, p.name project, p.address p_addr, p.investor FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project p ON p.id = u.project_id WHERE u.id = $1`, [uid]);
    if (u) Object.assign(map, { ma_can: u.code, du_an: u.project, dia_diem: u.p_addr, chu_dau_tu: u.investor, toa: u.building, tang: u.floor, dien_tich: u.area_tt != null ? String(u.area_tt).replace('.', ',') : '', huong: u.direction, phong_ngu: u.bedrooms });
  }
  const d = C.today().split('-');
  Object.assign(map, { ngay: dmy(C.today()), ngay_viet: `ngày ${d[2]} tháng ${d[1]} năm ${d[0]}`, nguoi_lap: user.full_name });
  for (const k of Object.keys(map)) if (map[k] == null) map[k] = '';
  return map;
}
// nội dung mẫu → HTML: bắt đầu bằng thẻ HTML thì giữ (bỏ script / on…), không thì giữ xuống dòng; trường trộn chưa có giá trị in dấu chấm để điền tay
// chỗ để trống ngày lập văn bản «ngày …… tháng …… năm 2026» / «Ngày   tháng   năm 20…» → tự điền ngày hôm nay (12/11/2026)
// chỉ thay khi ngày & tháng còn trống (chấm, dấu …, khoảng trắng); ngày đã ghi số hoặc «ký ngày …/…/…» của giấy tờ khác giữ nguyên
const GAP = String.raw`(?:[\s.…_\u00a0]|&nbsp;)`;
const TODAY_RE = new RegExp(String.raw`(ngày)${GAP}+(tháng)${GAP}+(năm)(?:${GAP}*(?:20\d\d|20${GAP}*[.…]+|[.…]+|20(?!\d)))?`, 'gi');   // 18/11/2026: «năm 20      tại» (mẫu TONG HOP MAU) — bỏ «20» thừa
function fillToday(html, today) {
  const [y, m, d] = String(today || C.today()).split('-');
  return String(html).replace(/(<[^>]*>)|([^<]+)/g, (all, tag, text) => tag ? tag : text.replace(TODAY_RE, (s, a, b, c) => `${a} ${d} ${b} ${m} ${c} ${y}`));
}
function mergeTpl(content, map) {
  const html = /^\s*</.test(content || '');
  const base = html ? String(content).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '') : escH(content).replace(/\n/g, '<br>');
  return fillToday(base.replace(/\{(\w+)\}/g, (m, k) => !(k in map) ? m : k === 'lich_thanh_toan' ? map[k] : map[k] === '' ? '…………………' : mergeVal(map, k)));
}
const GEN_CSS = `@page{size:A4;margin:20mm 15mm 20mm 30mm} body{font:13pt/1.4 "Times New Roman",serif;color:#000;max-width:165mm;margin:auto;text-align:justify}   /* lề theo NĐ 30/2020/NĐ-CP; căn đều 2 bên, chỗ mẫu căn giữa / phải giữ nguyên */
    .sch{border-collapse:collapse;width:100%;margin:6pt 0} .sch td,.sch th{border:1px solid #000;padding:3pt 5pt;font-size:12pt} table{border-collapse:collapse}`;
async function printGeneric(ent, id, user, tplCode, draft) {
  if (!E[ent]) bad('Module không hợp lệ');
  const tpl = draft || await one('SELECT * FROM kd_template WHERE active AND code = $1', [tplCode]);
  if (!tpl) bad('Không tìm thấy mẫu (hoặc mẫu đang tắt)');
  const { row } = await C.get(ent, id, user, { reveal: true });
  const body = mergeTpl(tpl.content, await tplMap(ent, row, user));
  if (!draft) await C.audit({ q }, ent, row.id, 'in_theo_mau', null, null, user, tpl.code);
  const recName = row.code || row.number || '#' + row.id;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escH(tpl.name)} – ${escH(recName)}</title><style>${GEN_CSS}
    ${EDIT_CSS}</style></head><body>${editBar(draft ? `<b>Xem thử</b> mẫu «${escH(tpl.name || 'chưa đặt tên')}» với ${escH(E[ent].one)} ${escH(recName)} — chưa lưu mẫu` : `Bản in từ mẫu «${escH(tpl.name)}» · ${escH(E[ent].one)} ${escH(recName)}`)}${editDoc(body)}</body></html>`;
}
// xem thử khi đang soạn mẫu: lấy bản ghi mới nhất (hoặc bản ghi chọn) của module
async function previewTemplate(b, user) {
  const ent = b.ent; if (!E[ent]) bad('Chọn module hiện mẫu trước');
  let id = +b.rec || null;
  if (!id) id = (await C.list(ent, user, { limit: 1 })).rows?.[0]?.id;
  if (!id) bad(`Module chưa có ${E[ent].one} nào để xem thử — tạo một ${E[ent].one} trước`);
  return printGeneric(ent, id, user, null, { name: b.name, code: b.code, content: b.content || '' });
}

module.exports = { sheets, fillToday, recScope, tplFitLevel, scopeKeys, tplFields, printGeneric, previewTemplate,
  misaSample, printSaleNotice, printCancelReq, EDIT_CSS, ICON, editBar, editDoc, A, strip, mapRows, exportList, sheet, importFile, importTemplate, IMPORTS, createUser, hashPw, checkPw, printContract, printReservation, regTemplates, moneyWords };
