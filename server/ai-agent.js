// 17/11/2026: CHẾ ĐỘ AGENT của trợ lý (chạy trong app, không cần AI bên ngoài) — hiểu LỆNH tiếng Việt diễn đạt tự do (có / không dấu, đảo thứ tự),
// tự tìm hồ sơ (mã căn, mã KH, số HĐ, mã phiếu, «nó / hồ sơ vừa rồi», tên khách), thiếu thông tin thì hỏi lại, LUÔN hiện bảng xác nhận rồi mới làm,
// làm qua đúng hàm nghiệp vụ của app (C.update / C.act / C.submit / C.approve / C.create / C.addNote / C.remove) → cùng phân quyền, khóa trạng thái, quy trình duyệt, nhật ký.
// Nhóm lệnh: sửa một ô bất kỳ · gán / giao phụ trách · chuyển trạng thái / thao tác nghiệp vụ (gia hạn giữ chỗ, giải phóng, mời bàn giao, thanh lý…) ·
// trình / duyệt / từ chối · ghi chú · hẹn gọi lại / nhắc nợ · tạo mới (mở form điền sẵn) · xóa bản nháp · làm hàng loạt trên kết quả vừa tra · hoàn tác.
'use strict';
const C = require('./core');
const { q, one } = require('./db');
const V = require('./views');
const AQ = require('./ai-query');

const db = { q, one };
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const cell = s => String(s ?? '').replace(/\|/g, '/').replace(/[[\]]/g, '').replace(/\n/g, ' ').trim() || '—';
const link = (ent, id, t) => id ? `[${cell(t)}](#open/${ent}/${id})` : cell(t);
const big = v => C.fmtMoney(Math.round(+v || 0)) + 'đ';
const wre = w => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
const hasW = (t, w) => wre(w).test(t);
const MAXN = 200;

const PEND = new Map();   // user.id → { plan, at } — lệnh chờ xác nhận / chờ bổ sung thông tin
const LAST = new Map();   // user.id → { label, undo: [async fn] } — hoàn tác lần làm gần nhất
const CTX = new Map();    // user.id → { ent, id } — hồ sơ vừa nhắc tới («nó», «hồ sơ này»)
const fresh = m => { const lim = Date.now() - 30 * 60e3; for (const [k, v] of m) if (v.at < lim) m.delete(k); };

// ---------- ngày giờ / tiền ----------
const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const pd = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
function parseDate(t, base = C.today()) {
  const b = pd(base), add = k => { const x = new Date(b); x.setDate(x.getDate() + k); return iso(x); };
  let m = /(?:^|\s)(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=$|[\s,.;:)?!])/.exec(t);   // ngày đứng riêng — không lấy số trong mã HĐ / mã căn
  if (m && (+m[1] < 1 || +m[1] > 31 || +m[2] < 1 || +m[2] > 12)) m = null;
  if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : b.getFullYear(); return iso(new Date(y, +m[2] - 1, +m[1])); }
  if (hasW(t, 'hom nay') || hasW(t, 'bay gio')) return add(0);
  if (hasW(t, 'ngay kia') || hasW(t, 'ngay mot')) return add(2);
  if (hasW(t, 'ngay mai') || hasW(t, 'mai')) return add(1);
  m = /(?:sau|them|nua|toi) (\d{1,3}) ngay|(\d{1,3}) ngay (?:nua|toi|sau)/.exec(t); if (m) return add(+(m[1] || m[2]));
  m = /(?:sau|them) (\d{1,2}) tuan|(\d{1,2}) tuan (?:nua|toi|sau)/.exec(t); if (m) return add(7 * +(m[1] || m[2]));
  const DW = { 'chu nhat': 0, cn: 0, 'thu hai': 1, 'thu 2': 1, 'thu ba': 2, 'thu 3': 2, 'thu tu': 3, 'thu 4': 3, 'thu nam': 4, 'thu 5': 4, 'thu sau': 5, 'thu 6': 5, 'thu bay': 6, 'thu 7': 6 };
  for (const [k, v] of Object.entries(DW)) if (hasW(t, k)) { let d = (v - b.getDay() + 7) % 7 || 7; if (hasW(t, 'tuan sau') && d < 7) d += 7; return add(d); }
  if (hasW(t, 'tuan sau') || hasW(t, 'tuan toi')) return add((8 - b.getDay()) % 7 || 7);
  if (hasW(t, 'cuoi thang')) return iso(new Date(b.getFullYear(), b.getMonth() + 1, 0));
  return null;
}
const parseTime = t => { const m = /(\d{1,2}) ?(?:h|gio|:)(\d{2})?\b/.exec(t); return m && +m[1] < 24 ? `${String(+m[1]).padStart(2, '0')}:${m[2] || '00'}` : null; };
function parseMoney(t) {
  const m = /(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?) ?(ty|trieu|tr|nghin|ngan|k|d|dong|vnd)?\b/.exec(t); if (!m) return null;
  let n = /^\d{1,3}(\.\d{3})+$/.test(m[1]) ? +m[1].replace(/\./g, '') : +m[1].replace(',', '.');
  const u = m[2] || ''; n *= /^ty/.test(u) ? 1e9 : /^(trieu|tr)$/.test(u) ? 1e6 : /^(nghin|ngan|k)$/.test(u) ? 1e3 : 1;
  return isFinite(n) ? Math.round(n) : null;
}

// ---------- nhận diện hồ sơ trong câu ----------
const CODE_COLS = [['unit', ['code']], ['customer', ['code']], ['reservation', ['code']], ['contract', ['number', 'code']], ['receipt', ['voucher_no']], ['payment', ['voucher_no']],
  ['ticket', ['code']], ['cancel_req', ['code']], ['refund', ['code']], ['commission', ['code']], ['contract_change', ['code']], ['sale_notice', ['code']], ['handover_notice', ['doc_no', 'code']],
  ['gcn_notice', ['doc_no', 'code']], ['price_policy', ['code']], ['agent', ['code']], ['project', ['code']]];
async function findRefs(raw, user) {
  const out = [], seen = new Set(), push = (ent, id) => { const k = ent + ':' + id; if (!seen.has(k)) { seen.add(k); out.push({ ent, id }); } };
  const toks = [...new Set(String(raw).split(/[\s,;()«»"“”]+/).map(x => x.replace(/[.?!:]+$/, '')).filter(x => /\d/.test(x) && x.length >= 3 && !/^\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?$/.test(x) && !/^0\d{9,10}$/.test(x)))];
  for (const tk of toks) for (const [ent, cols] of CODE_COLS) {
    if (!C.E[ent] || !C.can(user, C.E[ent], 'r')) continue;
    const r = await one(`SELECT id FROM ${C.E[ent].table} WHERE ${cols.map(c => `upper(${c}) = upper($1)`).join(' OR ')} LIMIT 1`, [tk]).catch(() => null);
    if (r) push(ent, r.id);
  }
  // «#12», «hồ sơ 12», «phiếu 0104» kèm tên loại hồ sơ
  const t = fold(raw), h = AQ.detectEnt(t);
  for (const m of t.matchAll(/#(\d{1,7})\b/g)) if (h && C.E[h.ent]) { const r = await one(`SELECT id FROM ${C.E[h.ent].table} WHERE id = $1`, [+m[1]]); if (r) push(h.ent, r.id); }
  if (!out.length && h && C.E[h.ent]?.fields.some(f => f.k === 'code')) { const m = new RegExp(`${h.w.replace(/ /g, '\\s+')}\\s+(\\d{2,6})\\b`).exec(t);
    if (m) { const rs = await q(`SELECT id FROM ${C.E[h.ent].table} WHERE code LIKE '%' || $1 ORDER BY id DESC LIMIT 2`, [m[1]]); if (rs.length === 1) push(h.ent, rs[0].id); } }
  // khách theo tên: «khách Nguyễn Ngọc Hằng», «khách hàng Hằng»
  if (!out.some(r => r.ent === 'customer')) {
    const m = /khách(?: hàng)?\s+((?:[A-ZÀ-ỸĐ][^\s,.;:?!]*\s*){1,5})/u.exec(raw);
    if (m) { const nm = m[1].trim(); const rs = await q("SELECT id FROM kd_customer WHERE unaccent_ci(full_name) LIKE '%' || unaccent_ci($1) LIMIT 6", [nm]).catch(async () => q('SELECT id FROM kd_customer WHERE full_name ILIKE $1 LIMIT 6', ['%' + nm]));
      if (rs.length === 1) push('customer', rs[0].id); else if (rs.length > 1) out.push({ ent: 'customer', many: rs.map(r => r.id), name: nm }); }
  }
  // «nó», «hồ sơ này», «vừa rồi»
  if (!out.length && /\b(no|ho so nay|phieu nay|hop dong nay|khach nay|can nay|vua roi|vua tra|o tren)\b/.test(t) && CTX.get(user.id)) out.push({ ...CTX.get(user.id) });
  return out;
}
// hồ sơ đích theo loại: có sẵn → dùng; chỉ có căn / khách / HĐ → tìm hồ sơ đang hiệu lực gắn với nó
const CLOSED = ['huy', 'het_han', 'thanh_ly', 'da_dong', 'chuyen_hd', 'hoan_tat', 'da_chi', 'da_thuc_hien'];
async function targetOf(ent, refs, t) {
  const d = refs.find(r => r.ent === ent && r.id); if (d) return [d.id];
  const many = refs.find(r => r.ent === ent && r.many); if (many) return many.many;
  const F = C.F[ent] || {}, E = C.E[ent]; if (!E) return [];
  const kindW = ent === 'contract' ? (hasW(t, 'hdmb') || hasW(t, 'mua ban') ? 'hdmb' : hasW(t, 'thue mua') ? 'thue_mua' : hasW(t, 'thue') ? 'thue' : hasW(t, 'vay') ? 'vay' : hasW(t, 'hoan thien') ? 'hoan_thien' : null) : null;
  for (const [rk, col] of [['contract', 'contract_id'], ['unit', 'unit_id'], ['customer', 'customer_id'], ['reservation', 'reservation_id']]) {
    const r = refs.find(x => x.ent === rk && x.id); if (!r || !F[col]) continue;
    const rows = await q(`SELECT id, ${F.status ? 'status' : 'NULL AS status'} FROM ${E.table} WHERE ${col} = $1${kindW ? ` AND kind = '${kindW}'` : ''} ORDER BY id DESC LIMIT 20`, [r.id]);
    const open = rows.filter(x => !CLOSED.includes(x.status));
    if (open.length) return ent === 'contract' && !kindW && open.length > 1 ? open.filter(x => true).map(x => x.id) : open.map(x => x.id).slice(0, ent === 'contract' ? 6 : 1);
    if (rows.length) return [rows[0].id];
  }
  // căn → khách đang giao dịch (HĐ còn hiệu lực, không thì phiếu đăng ký)
  const un = refs.find(x => x.ent === 'unit' && x.id);
  if (un && ent === 'customer') { const c = await one("SELECT customer_id FROM kd_contract WHERE unit_id = $1 AND status NOT IN ('huy','thanh_ly') AND kind <> 'hoan_thien' AND customer_id IS NOT NULL ORDER BY id DESC LIMIT 1", [un.id]) || await one("SELECT customer_id FROM kd_reservation WHERE unit_id = $1 AND status NOT IN ('huy','het_han') AND customer_id IS NOT NULL ORDER BY id DESC LIMIT 1", [un.id]); if (c) return [c.customer_id]; }
  // HĐ → khách / căn của HĐ
  const k = refs.find(x => x.ent === 'contract' && x.id);
  if (k && (ent === 'customer' || ent === 'unit')) { const c = await one('SELECT customer_id, unit_id FROM kd_contract WHERE id = $1', [k.id]); return [c?.[ent + '_id']].filter(Boolean); }
  const rv = refs.find(x => x.ent === 'reservation' && x.id);
  if (rv && (ent === 'customer' || ent === 'unit')) { const c = await one('SELECT customer_id, unit_id FROM kd_reservation WHERE id = $1', [rv.id]); return [c?.[ent + '_id']].filter(Boolean); }
  return [];
}
const lab = (ent, id) => C.labelOf(db, ent, id);
async function labels(ent, ids, n = 8) { const L = []; for (const id of ids.slice(0, n)) L.push(link(ent, id, await lab(ent, id))); return L.join(', ') + (ids.length > n ? ` … và ${ids.length - n} hồ sơ khác` : ''); }

// ---------- giá trị cho một ô ----------
async function valueFor(f, rawVal, ent) {
  const v = String(rawVal || '').trim().replace(/[.。]+$/, ''), t = fold(v);
  if (!v) return { err: `Chưa có giá trị mới cho «${f.l}»` };
  switch (f.t) {
    case 'sel': { const os = await C.optsOf(f); const o = os.find(o => fold(o[1]) === t) || os.filter(o => t.includes(fold(o[1])) || fold(o[1]).includes(t)).sort((a, b) => b[1].length - a[1].length)[0];
      return o ? { v: o[0], show: o[1] } : { err: `«${v}» không có trong danh sách ${f.l}: ${os.map(o => o[1]).join(', ')}` }; }
    case 'user': { const us = await q('SELECT id, full_name FROM kd_user WHERE coalesce(active, true)'); const hit = us.filter(u => fold(u.full_name).includes(t) || fold(u.full_name).split(/\s[–-]\s/)[0].endsWith(t));
      return hit.length === 1 ? { v: hit[0].id, show: hit[0].full_name } : { err: hit.length ? `Có ${hit.length} người khớp «${v}»: ${hit.map(u => u.full_name).join(', ')} — ghi rõ họ tên` : `Không có nhân viên «${v}»` }; }
    case 'ref': { const E = C.E[f.ref]; const cols = (CODE_COLS.find(x => x[0] === f.ref) || [, ['code']])[1];
      let r = await one(`SELECT id FROM ${E.table} t WHERE ${cols.map(c => `upper(t.${c}) = upper($1)`).join(' OR ')} LIMIT 1`, [v]).catch(() => null);
      if (!r) { const rs = await q(`SELECT t.id FROM ${E.table} t WHERE (${E.disp}) ILIKE $1 LIMIT 3`, ['%' + v + '%']).catch(() => []); if (rs.length === 1) r = rs[0]; else return { err: rs.length ? `Có nhiều ${E.one} khớp «${v}» — ghi mã` : `Không tìm thấy ${E.one} «${v}»` }; }
      return { v: r.id, show: await lab(f.ref, r.id) }; }
    case 'date': { const d = C.isoDate(v) || parseDate(t); return d ? { v: d, show: C.dmy(d) } : { err: `«${v}» không phải ngày (dd/mm/yyyy)` }; }
    case 'dt': { const d = C.isoDate(v.split(/\s+/)[0]) || parseDate(t); if (!d) return { err: `«${v}» không phải ngày giờ` }; const tm = parseTime(t) || '17:00'; return { v: `${d} ${tm}`, show: `${C.dmy(d)} ${tm}` }; }
    case 'money': { const n = parseMoney(t); return n != null ? { v: n, show: big(n) } : { err: `«${v}» không phải số tiền` }; }
    case 'int': case 'num': { const n = +v.replace(',', '.').replace(/[^\d.-]/g, ''); return isFinite(n) && v.match(/\d/) ? { v: n, show: String(n) } : { err: `«${v}» không phải số` }; }
    case 'bool': return { v: /^(co|dung|bat|yes|true|1|x)/.test(t), show: /^(co|dung|bat|yes|true|1|x)/.test(t) ? 'Có' : 'Không' };
    case 'refs': case 'json': case 'check': case 'grid': return { err: `Ô «${f.l}» cần sửa trên form` };
    default: return { v, show: v };
  }
}
const SYN = { phone: ['sdt', 'so dien thoai', 'dien thoai', 'so dt', 'dt'], phone2: ['sdt 2', 'so phu', 'dien thoai khac'], email: ['email', 'mail', 'thu dien tu'], address: ['dia chi'],
  owner_id: ['nguoi phu trach', 'phu trach', 'nhan vien phu trach', 'nv phu trach', 'sale', 'nhan vien'], assignee_id: ['nguoi xu ly', 'xu ly'], note: ['ghi chu'], full_name: ['ho ten', 'ten khach', 'ho va ten'],
  hold_until: ['han giu cho'], plan_sign: ['ngay ky du kien', 'lich ky', 'ngay hen ky', 'hen ky'], sign_place: ['noi ky', 'dia diem ky'], stage: ['tinh trang'], source: ['nguon khach', 'nguon'],
  next_at: ['ngay nhac', 'nhac tiep'], due_at: ['han phan hoi'], priority: ['muc uu tien', 'uu tien'], contract_on: ['ngay ky'], tax_code: ['mst', 'ma so thue'], bank_account: ['so tai khoan', 'stk', 'tai khoan ngan hang'],
  id_no: ['cccd', 'can cuoc', 'cmnd'], birth: ['ngay sinh'], interest_project: ['du an quan tam'], value: ['gia tri hop dong', 'gia tri'], status: ['trang thai'] };
function fieldOf(E, t) {
  const fs = E.fields.filter(f => !['json', 'grid', 'check'].includes(f.t)), cand = [];
  for (const f of fs) { for (const w of [fold(f.l), ...(SYN[f.k] || [])]) if (w.length >= 2 && hasW(t, w)) cand.push({ f, n: w.length }); }
  cand.sort((a, b) => b.n - a.n); return cand[0]?.f || null;
}
const splitVal = raw => { const m = /^(.*?)\s+(?:thành|thanh|sang|là|la|=|->|→|bằng|bang|thay bằng|lại thành)\s+(.+)$/i.exec(String(raw).trim()); return m ? [m[1], m[2]] : [raw, null]; };

// ---------- câu lệnh ----------
const PRE = /^(?:(?:hay|giup|giup (?:toi|minh|em|anh|chi)|nho|nho (?:ban|em)|lam on|vui long|cho (?:toi|minh|em)|ban oi|tro ly oi|em oi|oi|ok|e|a)[ ,]+)+/;
const strip = t => t.replace(/[!.]+$/, '').replace(PRE, '').trim();
const isQuestion = t => /\?\s*$/.test(t) || /\b(bao nhieu|co phai|khong nhi|duoc khong|the nao|lam sao|o dau|la gi)\b/.test(t);
const VERBS = [
  ['undo', /^(hoan tac|undo|quay lai buoc truoc|tra lai nhu cu)\b/],
  ['extend', /^(gia han|keo dai)\b/],
  ['release', /^(giai phong|huy giu cho|huy dang ky|huy phieu dang ky|bo giu cho)\b/],
  ['submit', /^(trinh duyet|trinh ky|trinh|gui trinh duyet|gui duyet|gui trinh)\b/],
  ['reject', /^(tu choi|tra lai|khong duyet|bac)\b/],
  ['approve', /^(phe duyet|duyet)\b/],
  ['note', /^(ghi chu|them ghi chu|ghi lai|note)\b/],
  ['call', /^(hen goi lai|nhac goi|nhac (?:toi |minh |em )?goi|dat lich goi|hen lien he|nhac lien he|nhac no|tao lich nhac no|tao nhac no|ghi nhac no|len lich goi|nhac (?:toi |minh )?lien he)\b/],
  ['assign', /^(gan|giao|chuyen giao|phan cong|chia)\b/],
  ['create', /^(tao|lap|them|nhap moi|mo form|tao moi|lap moi|them moi)\b/],
  ['remove', /^(xoa|xoa bo)\b/],
  ['update', /^(sua|doi|cap nhat|chinh|chinh sua|dat lai|chuyen|ghi nhan)\b/],
];
function verbOf(t) { for (const [k, r] of VERBS) if (r.test(t)) return k; return null; }

async function batchIds(t, user) {
  if (!/\b(tat ca|het|toan bo|ca danh sach|so nay|danh sach nay|danh sach tren|ket qua (?:tren|vua roi|nay)|cac ho so (?:nay|tren)|nhung (?:ho so|khach|hop dong|phieu) (?:nay|tren))\b/.test(t)) return null;
  const L = AQ.LASTQ?.get(user.id); if (!L || Date.now() - L.at > 30 * 60e3) return { err: 'Chưa có danh sách nào vừa tra — hãy hỏi trước (VD «khách quá hạn trên 90 ngày», «danh sách phiếu đang giữ chỗ») rồi ra lệnh cho «tất cả».' };
  return { ent: L.ent, ids: L.ids, label: L.label };
}

// lập kế hoạch từ câu lệnh → { ent, ids, kind, … desc } hoặc { ask } (hỏi lại) hoặc { err }
async function plan(raw, user) {
  const t0 = fold(raw).trim(), t = strip(t0), verb = verbOf(t);
  if (isQuestion(t0) && verb !== 'undo') return null;
  if (!verb) {   // lệnh nghiệp vụ theo tên thao tác, có nêu hồ sơ: «mời bàn giao căn …», «thanh lý HĐ …», «nhận xử lý phiếu CS…»
    const refs0 = await findRefs(raw, user), b0 = await batchIds(t, user); if (!refs0.some(r => r.id) && !(b0 && !b0.err)) return null;
    return actOf(t, refs0, AQ.detectEnt(t), b0 && !b0.err ? b0 : null);
  }
  if (verb === 'undo') return { kind: 'undo' };
  const refs = await findRefs(raw, user), hit = AQ.detectEnt(t), batch = await batchIds(t, user);
  if (batch?.err) return { err: batch.err };
  const pickEnt = (...pref) => pref.find(Boolean);
  // --- thao tác theo luồng / nghiệp vụ
  if (verb === 'extend' || verb === 'release') {
    const ids = batch?.ent === 'reservation' ? batch.ids : await targetOf('reservation', refs, t);
    if (!ids.length) return { ask: 'Gia hạn / giải phóng phiếu giữ chỗ nào? Gõ mã phiếu (GD-…) hoặc mã căn.', need: 'ref', raw };
    const reason = /(?:ly do|vi|do)[: ]+(.+)$/i.exec(raw)?.[1] || `Theo lệnh trợ lý: ${raw}`;
    if (verb === 'release') return { kind: 'act', ent: 'reservation', ids, act: 'release', data: { reason }, desc: `Giải phóng / hủy đăng ký giữ chỗ — lý do: ${reason}` };
    const tt = fold(raw);
    return { kind: 'act', ent: 'reservation', ids, act: 'extend', reason, extend: { abs: /\b(den|toi|het) (ngay )?\d|\b(den|toi) (thu|cuoi|ngay mai|mai)/.test(tt) ? parseDate(tt) : null, add: /(them|nua) (\d+) ?(ngay|tuan|gio|h)\b/.exec(tt), time: parseTime(tt) } };
  }
  if (verb === 'submit' || verb === 'approve' || verb === 'reject') {
    let ent = hit?.ent, ids = [];
    if (verb !== 'submit' && /\b(tat ca|het|toan bo|moi|cac)\b.*\b(cho (toi )?duyet|dang cho|ho so cho)|\bho so cho (toi )?duyet\b/.test(t)) {   // hộp phê duyệt của tôi
      const xs = await V.approvalsFor(db, user); if (!xs.length) return { err: 'Không có hồ sơ nào đang chờ bạn duyệt.' };
      return { kind: verb, multi: xs.map(a => ({ ent: a.ent, id: a.rec_id })), comment: /(?:ly do|vi|y kien)[: ]+(.+)$/i.exec(raw)?.[1] || '' };
    }
    if (batch) ({ ent, ids } = batch);
    else { const r = refs.find(x => x.id && (!ent || x.ent === ent)) || refs.find(x => x.id); if (r && (!ent || ent === r.ent)) { ent = r.ent; ids = [r.id]; } else if (ent) ids = await targetOf(ent, refs, t); }
    if (!ent || !ids.length) return { ask: `${verb === 'submit' ? 'Trình duyệt' : verb === 'approve' ? 'Duyệt' : 'Từ chối'} hồ sơ nào? Gõ mã / số hồ sơ (VD số HĐ, mã phiếu).`, need: 'ref', raw };
    if (!C.E[ent]?.flow) return { err: `${C.E[ent]?.title || ent} không có luồng trình duyệt.` };
    const comment = /(?:ly do|vi|y kien|ghi chu)[: ]+(.+)$/i.exec(raw)?.[1] || '';
    if (verb === 'reject' && !comment) return { ask: 'Lý do từ chối / trả lại là gì?', need: 'reason', base: { kind: 'reject', ent, ids }, raw };
    return { kind: verb, ent, ids, comment };
  }
  if (verb === 'note') {
    const body = (/[:：]\s*(.+)$/.exec(raw)?.[1] || raw.replace(/^\s*(?:\S+\s+){0,3}?(?:ghi chú|ghi chu|ghi lại|ghi lai|note)\s*/i, '').replace(/\b(?:cho|vào|vao)\s+\S+\s*/i, '')).trim();
    const ids = batch ? batch.ids : null; const ent = batch ? batch.ent : (refs.find(x => x.id) || {}).ent;
    const tgt = batch ? ids : refs.filter(x => x.id).slice(0, 1).map(x => x.id);
    if (!ent || !tgt.length) return { ask: 'Ghi chú vào hồ sơ nào? Gõ mã căn / mã KH / số HĐ / mã phiếu.', need: 'ref', raw };
    if (!body) return { ask: 'Nội dung ghi chú là gì?', need: 'body', base: { kind: 'note', ent, ids: tgt }, raw };
    return { kind: 'note', ent, ids: tgt, body };
  }
  if (verb === 'call') {
    const day = parseDate(t) || C.addDays(C.today(), 1), content = /[:：]\s*(.+)$/.exec(raw)?.[1] || /(?:noi dung|ve viec|de)\s+(.+)$/i.exec(raw)?.[1] || 'Hẹn gọi lại (lập từ trợ lý)';
    const debt = /\bno\b|thanh toan|cong no|dot thu/.test(t) || refs.some(r => r.ent === 'contract');
    if (batch) {
      if (debt || batch.ent === 'contract') { const cids = batch.ent === 'contract' ? batch.ids : (await q(`SELECT DISTINCT ON (${batch.ent === 'customer' ? 'customer_id' : 'unit_id'}) id FROM kd_contract WHERE ${batch.ent === 'customer' ? 'customer_id' : 'unit_id'} = ANY($1::int[]) AND status = 'da_ky' AND kind <> 'hoan_thien' ORDER BY ${batch.ent === 'customer' ? 'customer_id' : 'unit_id'}, id DESC`, [batch.ids])).map(x => x.id);
        return { kind: 'call', ent: 'debt_call', tent: 'contract', ids: cids, day, content }; }
      const cus = batch.ent === 'customer' ? batch.ids : [];
      return cus.length ? { kind: 'call', ent: 'contact_log', tent: 'customer', ids: cus, day, content } : { err: 'Danh sách vừa tra không phải khách hàng / hợp đồng.' };
    }
    if (debt) { const ids = await targetOf('contract', refs, t); if (ids.length) return { kind: 'call', ent: 'debt_call', tent: 'contract', ids: ids.slice(0, 1), day, content }; }
    const cid = await targetOf('customer', refs, t); if (cid.length) return { kind: 'call', ent: 'contact_log', tent: 'customer', ids: cid.slice(0, 1), day, content, unit: refs.find(r => r.ent === 'unit')?.id };
    return { ask: 'Hẹn gọi lại khách nào? Gõ mã KH, mã căn hoặc số HĐ.', need: 'ref', raw };
  }
  if (verb === 'create') {
    const ent = hit?.ent; if (!ent) return { ask: 'Tạo loại hồ sơ nào? (khách hàng, phiếu đăng ký, phiếu thu, hợp đồng, phản ánh, nhật ký liên hệ…)', need: 'ent', raw };
    const E = C.E[ent]; if (!C.can(user, E, 'c')) return { err: `Vai trò của bạn không được tạo ${E.one}.` };
    const preset = {}, shown = [], F = C.F[ent];
    for (const r of refs) { const col = r.ent + '_id'; if (r.id && F[col]) { preset[col] = r.id; shown.push(`${F[col].l}: ${await lab(r.ent, r.id)}`); } }
    if (refs.some(r => r.ent === 'unit' && r.id) && F.project_id && !preset.project_id) { const u = await one('SELECT project_id, building_id FROM kd_unit WHERE id = $1', [refs.find(r => r.ent === 'unit').id]); preset.project_id = u.project_id; if (F.building_id) preset.building_id = u.building_id; }
    const ph = /\b(0\d{9,10})\b/.exec(raw); if (ph) for (const k of ['phone', 'b_phone']) if (F[k]) { preset[k] = ph[1]; shown.push(`${F[k].l}: ${ph[1]}`); break; }
    const em = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(raw); if (em) for (const k of ['email', 'b_email']) if (F[k]) { preset[k] = em[0]; shown.push(`${F[k].l}: ${em[0]}`); break; }
    const nm = /(?:tên|ten|khách|khach|cho anh|cho chị|cho chi|anh|chị)\s+((?:[A-ZÀ-ỸĐ][^\s,.;:?!0-9]*\s*){2,5})/u.exec(raw); if (nm) for (const k of ['full_name', 'cust_name', 'name']) if (F[k]) { preset[k] = nm[1].trim(); shown.push(`${F[k].l}: ${preset[k]}`); break; }
    const mk = { receipt: 'amount', payment: 'amount', reservation: 'price', contract: 'value', refund: 'amount' }[ent]; const mo = /\d.*?(ty|trieu|tr|nghin|k|dong|d)\b/.test(t) ? parseMoney(t) : null; if (mk && F[mk] && mo) { preset[mk] = mo; shown.push(`${F[mk].l}: ${big(mo)}`); }
    const dk = { receipt: 'voucher_date', payment: 'voucher_date', reservation: 'reg_date', contract: 'contract_on', contact_log: 'at', ticket: 'at' }[ent]; const dd = parseDate(t); if (dk && F[dk] && dd) { preset[dk] = dd; shown.push(`${F[dk].l}: ${C.dmy(dd)}`); }
    for (const f of E.fields.filter(f => f.t === 'sel' && !preset[f.k])) { const os = await C.optsOf(f); const o = os.filter(o => fold(o[1]).length >= 4 && hasW(t, fold(o[1]))).sort((a, b) => b[1].length - a[1].length)[0]; if (o) { preset[f.k] = o[0]; shown.push(`${f.l}: ${o[1]}`); } }
    if (hit.extra) Object.assign(preset, Object.fromEntries(Object.entries(hit.extra).map(([k, v]) => [k.replace(/^f_/, ''), v])));
    const note = /(?:ghi chú|ghi chu|nội dung|noi dung)[: ]+(.+)$/i.exec(raw)?.[1]; if (note) for (const k of ['note', 'content']) if (F[k]) { preset[k] = note; shown.push(`${F[k].l}: ${note}`); break; }
    return { kind: 'form', ent, preset, shown };
  }
  if (verb === 'remove') {
    const r = refs.find(x => x.id); if (!r) return { ask: 'Xóa hồ sơ nào? Gõ mã / số hồ sơ.', need: 'ref', raw };
    return { kind: 'remove', ent: r.ent, ids: [r.id], danger: true };
  }
  // --- gán / giao phụ trách
  if (verb === 'assign') {
    const who = /\b(?:cho|sang)\s+(.+?)\s*(?:phụ trách|phu trach|xử lý|xu ly|quản lý|quan ly|chăm sóc|cham soc)?\s*[.!]?$/i.exec(raw)?.[1];
    let ent = batch?.ent || hit?.ent || refs.find(x => x.id)?.ent, ids = batch ? batch.ids : [];
    if (!batch && ent) ids = refs.some(x => x.ent === ent && x.id) ? refs.filter(x => x.ent === ent && x.id).map(x => x.id) : await targetOf(ent, refs, t);
    if (!ent || !ids.length) return { ask: 'Giao hồ sơ nào? Gõ mã KH / mã căn / số HĐ, hoặc tra một danh sách rồi gõ «giao tất cả cho …».', need: 'ref', raw };
    const F = C.F[ent], f = F.owner_id || F.assignee_id; if (!f) return { err: `${C.E[ent].title} không có ô người phụ trách.` };
    if (!who) return { ask: 'Giao cho ai? Gõ tên nhân viên.', need: 'value', base: { kind: 'update', ent, ids, field: f.k }, raw };
    const v = await valueFor(f, who.replace(/^(anh|chị|chi|em|bạn|ban|nhân viên|nhan vien)\s+/i, ''), ent); if (v.err) return { err: v.err };
    return { kind: 'update', ent, ids, field: f.k, value: v.v, show: v.show };
  }
  // --- sửa / đổi / chuyển một ô; hoặc thao tác nghiệp vụ theo tên (mời bàn giao, thanh lý, nhận xử lý…)
  const actHit = await actOf(t, refs, hit, batch);
  if (actHit) return actHit;
  if (verb === 'update') {
    const [lhs, rhs] = splitVal(raw);
    let ent = batch?.ent || hit?.ent, ids = batch ? batch.ids : [];
    const r0 = refs.find(x => x.id && (!ent || x.ent === ent));
    if (!batch) { if (r0 && (!ent || ent === r0.ent || !hit)) { ent = r0.ent; ids = [r0.id]; } else if (ent) ids = await targetOf(ent, refs, t); }
    if (!ent || !ids.length) return { ask: 'Sửa hồ sơ nào? Gõ mã căn / mã KH / số HĐ / mã phiếu.', need: 'ref', raw };
    const E = C.E[ent]; let f = fieldOf(E, fold(lhs));
    // «chuyển … sang <trạng thái>»: không nêu ô → thử ô trạng thái / tình trạng
    if (!f && rhs) for (const k of ['status', 'stage', 'sign_status', 'progress', 'confirm']) { const ff = C.F[ent][k]; if (ff?.t === 'sel') { const v = await valueFor(ff, rhs, ent); if (!v.err) { f = ff; break; } } }
    if (!f) return { ask: `Sửa ô nào của ${E.one}? (VD ${E.fields.filter(x => !['json', 'grid', 'check'].includes(x.t)).slice(0, 6).map(x => '«' + x.l + '»').join(', ')} …)`, need: 'field', base: { kind: 'update', ent, ids }, raw };
    if (f.k === 'status' && E.flow) { const v = await valueFor(f, rhs || '', ent); if (!v.err && (v.v === E.flow.approve?.ok)) return { err: `Không đổi thẳng sang «${v.show}» — dùng «trình duyệt» / «duyệt» để đi đúng quy trình.` }; }
    if (!rhs) return { ask: `Giá trị mới của «${f.l}» là gì?`, need: 'value', base: { kind: 'update', ent, ids, field: f.k }, raw };
    const v = await valueFor(f, rhs, ent); if (v.err) return { err: v.err };
    return { kind: 'update', ent, ids, field: f.k, value: v.v, show: v.show };
  }
  return null;
}
// thao tác nghiệp vụ có tên (acts của từng loại hồ sơ): «mời bàn giao căn X», «thanh lý HĐ …», «nhận xử lý phiếu CS…», «đóng phiếu …»
async function actOf(t, refs, hit, batch) {
  const cands = [];
  for (const [ent, E] of Object.entries(C.E)) for (const a of E.acts || []) {
    if (a.url) continue; const al = fold(a.l).replace(/\s*[–-].*$/, '').replace(/\s*\/.*$/, '');
    if (al.length >= 4 && hasW(t, al)) cands.push({ ent, a, n: al.length + (hit?.ent === ent ? 50 : 0) + (refs.some(r => r.ent === ent) ? 30 : 0) + (batch?.ent === ent ? 40 : 0) });
  }
  if (!cands.length) return null;
  const { ent, a } = cands.sort((x, y) => y.n - x.n)[0];
  const ids = batch?.ent === ent ? batch.ids : await targetOf(ent, refs, t);
  if (!ids.length && refs.some(r => r.id)) return { err: `${(await Promise.all(refs.filter(r => r.id).slice(0, 2).map(r => lab(r.ent, r.id)))).join(', ')} chưa có ${C.E[ent].one} nào (${C.E[ent].title}) để «${a.l}» — lập ${C.E[ent].one} trước.` };
  if (!ids.length) return { ask: `«${a.l}» cho ${C.E[ent].one} nào? Gõ mã / số hồ sơ.`, need: 'ref', raw: t };
  return { kind: 'act', ent, ids, act: a.k, data: {} };
}

// điền các ô hỏi thêm của thao tác (ask) từ câu lệnh; thiếu ô bắt buộc → hỏi lại
async function fillAsk(p, raw) {
  const a = (C.E[p.ent].acts || []).find(x => x.k === p.act), t = fold(raw), miss = [];
  for (const f of a.ask || []) {
    if (p.data[f.k] != null && p.data[f.k] !== '') continue;
    if (f.k === 'reason' || f.t === 'long') { const m = /(?:ly do|vi|noi dung|ghi chu)[: ]+(.+)$/i.exec(raw); if (m) { p.data[f.k] = m[1]; continue; } if (f.k === 'reason') { p.data[f.k] = `Theo lệnh trợ lý: ${raw}`; continue; } }
    if (f.t === 'date' || f.t === 'dt') { const d = parseDate(t); if (d) { p.data[f.k] = f.t === 'dt' ? `${d} ${parseTime(t) || '17:00'}` : d; continue; } if (f.def === 'today') { p.data[f.k] = C.today(); continue; } }
    if (f.t === 'sel') { const os = f.o || await C.optsOf(f); const o = os.find(o => hasW(t, fold(o[1]))) || (f.def ? os.find(o => o[0] === f.def) : null); if (o) { p.data[f.k] = o[0]; continue; } }
    if (f.t === 'money') { const n = /\d.*?(ty|trieu|tr|nghin|k)\b/.test(t) ? parseMoney(t) : null; if (n) { p.data[f.k] = n; continue; } }
    if (f.req) miss.push(f);
  }
  return miss;
}

// ---------- mô tả + thực hiện ----------
async function describe(p, user) {
  const E = C.E[p.ent], L = [];
  if (p.kind === 'multi' || p.multi) { L.push(`**${p.kind === 'approve' ? 'Duyệt' : 'Từ chối'} ${p.multi.length} hồ sơ đang chờ bạn:**`); for (const x of p.multi.slice(0, 10)) L.push(`- ${link(x.ent, x.id, await lab(x.ent, x.id))}`); if (p.multi.length > 10) L.push(`- … và ${p.multi.length - 10} hồ sơ`); return L.join('\n'); }
  const TE = p.tent || p.ent, who = await labels(TE, p.ids), n = p.ids.length, many = n > 1 ? ` (${n} ${C.E[TE].one})` : '';
  if (p.kind === 'update') L.push(`**Sửa «${C.F[p.ent][p.field].l}»** của ${who}${many} → **${cell(p.show)}**`);
  if (p.kind === 'act') { const a = E.acts.find(x => x.k === p.act); L.push(`**${a.l}**: ${who}${many}`); for (const f of a.ask || []) if (p.data[f.k] != null) L.push(`- ${f.l}: ${f.t === 'dt' ? C.dmy(String(p.data[f.k]).slice(0, 10)) + ' ' + String(p.data[f.k]).slice(11, 16) : f.t === 'date' ? C.dmy(p.data[f.k]) : f.t === 'sel' ? await C.optLabel(f, p.data[f.k]) : f.t === 'money' ? big(p.data[f.k]) : cell(p.data[f.k])}`); }
  if (p.kind === 'submit') L.push(`**Trình duyệt** ${who}${many}`);
  if (p.kind === 'approve') L.push(`**Duyệt** ${who}${many}${p.comment ? ` — ý kiến: ${cell(p.comment)}` : ''}`);
  if (p.kind === 'reject') L.push(`**Từ chối / trả lại** ${who}${many} — lý do: ${cell(p.comment)}`);
  if (p.kind === 'note') L.push(`**Ghi chú** vào ${who}${many}: «${cell(p.body)}»`);
  if (p.kind === 'call') L.push(`**Hẹn gọi lại ngày ${C.dmy(p.day)}** — ${p.ent === 'debt_call' ? 'nhật ký nhắc nợ' : 'nhật ký liên hệ'} cho ${who}${many}: «${cell(p.content)}»`);
  if (p.kind === 'remove') L.push(`**Xóa** ${who} — chỉ xóa được bản nháp / chưa duyệt, không khôi phục được.`);
  if (p.warn?.length) L.push('', ...p.warn.map(w => `- ⚠ ${cell(w)}`));
  return L.join('\n');
}
async function prepare(p, user, raw) {   // tính nốt giá trị phụ thuộc hồ sơ (gia hạn: hạn mới theo hạn cũ) + kiểm tra trước (không ghi)
  p.warn = [];
  if (p.act === 'extend' && p.extend) {
    const r = await one('SELECT hold_until FROM kd_reservation WHERE id = $1', [p.ids[0]]), now = new Date();
    let base = r?.hold_until && new Date(r.hold_until) > now ? new Date(r.hold_until) : now, d;
    if (p.extend.abs) d = `${p.extend.abs} ${p.extend.time || '17:00'}`;
    else if (p.extend.add) { const k = +p.extend.add[2], u = p.extend.add[3]; base = new Date(base.getTime() + (u === 'tuan' ? 7 * 864e5 * k : /^(gio|h)$/.test(u) ? 3600e3 * k : 864e5 * k)); const vn = new Date(base.getTime() + 7 * 3600e3).toISOString(); d = `${vn.slice(0, 10)} ${p.extend.time || vn.slice(11, 16)}`; }
    else { const t = fold(raw), dd = parseDate(t); if (dd) d = `${dd} ${p.extend.time || '17:00'}`; }
    if (!d) return { ask: 'Gia hạn đến ngày nào, hoặc thêm bao nhiêu ngày? (VD «đến 21/11», «thêm 3 ngày»)', need: 'value' };
    p.data = { hold_until: d, reason: p.reason };
    if (p.ids.length > 1) p.warn.push(`Áp cùng hạn mới cho ${p.ids.length} phiếu`);
  }
  if (p.kind === 'act') { const miss = await fillAsk(p, raw); if (miss.length) return { ask: `Cần thêm: ${miss.map(f => `«${f.l}»`).join(', ')} — gõ giá trị (VD «${miss[0].t === 'date' ? '20/11/2026' : miss[0].t === 'text' ? 'số chứng từ …' : '…'}»).`, need: 'askf', fields: miss.map(f => f.k) }; }
  if (p.ids && p.ids.length > MAXN) return { err: `Một lần làm tối đa ${MAXN} hồ sơ (danh sách có ${p.ids.length}) — lọc hẹp hơn.` };
  if (p.kind === 'update' && p.ids.length === 1) { try { const r = await C.update(p.ent, p.ids[0], { [p.field]: p.value }, user, { check: true }); for (const w of r.warnings || []) p.warn.push(w); } catch (e) { return { err: e.message }; } }
  return null;
}
async function execute(p, user) {
  const ok = [], fail = [], undo = [];
  const items = p.multi || p.ids.map(id => ({ ent: p.tent || p.ent, id }));
  for (const { ent, id } of items) {
    const L = await lab(ent, id);
    try {
      if (p.kind === 'update') { const old = await one(`SELECT ${p.field} AS v FROM ${C.E[ent].table} WHERE id = $1`, [id]); const r = await C.update(ent, id, { [p.field]: p.value }, user); undo.push(() => C.update(ent, id, { [p.field]: old?.v ?? null }, user)); ok.push([ent, id, L, r.warnings]); }
      else if (p.kind === 'act') { const r = await C.act(ent, id, p.act, user, { ...p.data }); ok.push([ent, id, L, r.warnings]); }
      else if (p.kind === 'submit') { await C.submit(ent, id, user, { comment: p.comment }); ok.push([ent, id, L]); }
      else if (p.kind === 'approve' || p.kind === 'reject') { await C.approve(ent, id, user, { ok: p.kind === 'approve', comment: p.comment || (p.kind === 'approve' ? 'Duyệt qua trợ lý' : '') }); ok.push([ent, id, L]); }
      else if (p.kind === 'note') { await C.get(ent, id, user); await C.addNote(ent, id, p.body, user); const n = await one('SELECT max(id) AS id FROM kd_note WHERE ent = $1 AND rec_id = $2 AND by = $3', [ent, id, user.id]); undo.push(() => q('DELETE FROM kd_note WHERE id = $1', [n.id])); ok.push([ent, id, L]); }
      else if (p.kind === 'call') {
        let r;
        if (p.ent === 'debt_call') r = await C.create('debt_call', { contract_id: id, at: new Date().toISOString(), result: 'hen_goi_lai', content: p.content, next_on: p.day }, user);
        else { const ch = (await C.optsOf(C.F.contact_log.channel)); const o = ch.find(o => /dien thoai|goi/.test(fold(o[1]))) || ch[0];
          r = await C.create('contact_log', { customer_id: id, unit_id: p.unit || null, at: new Date().toISOString(), channel: o?.[0], result: 'hen_lai', content: p.content, next_at: p.day }, user); }
        undo.push(() => C.remove(p.ent, r.row.id, user)); ok.push([ent, id, L]);
      }
      else if (p.kind === 'remove') { await C.remove(ent, id, user); ok.push([ent, id, L]); }
    } catch (e) { fail.push([ent, id, L, e.message]); }
  }
  if (undo.length) LAST.set(user.id, { at: Date.now(), label: `${ok.length} hồ sơ`, undo }); else LAST.delete(user.id);
  if (ok.length === 1) CTX.set(user.id, { ent: ok[0][0], id: ok[0][1], at: Date.now() });
  const out = [`**Đã xong ${ok.length}/${items.length}.**`];
  for (const [ent, id, L, w] of ok.slice(0, 15)) out.push(`- ✔ ${link(ent, id, L)}${w?.length ? ` — lưu ý: ${cell(w.join('; '))}` : ''}`);
  if (ok.length > 15) out.push(`- … và ${ok.length - 15} hồ sơ khác`);
  for (const [ent, id, L, m] of fail.slice(0, 15)) out.push(`- ✖ ${link(ent, id, L)}: ${cell(m)}`);
  if (fail.length > 15) out.push(`- … ${fail.length - 15} hồ sơ khác không làm được`);
  if (undo.length) out.push('', '[↶ Hoàn tác](#ai/undo)');
  await C.audit(db, 'ai', null, 'ai_agent', null, { kind: p.kind, ent: p.ent, n: ok.length, fail: fail.length }, user, (p.raw || '').slice(0, 500)).catch(() => {});
  return { answer: out.join('\n'), changed: ok.length > 0 };
}

// ---------- vào ----------
const YES0 = /^(xac nhan|dong y|ok|oke|okay|co|lam di|thuc hien|chay di|yes|uh|u|duoc|chot|dung roi|lam luon)\b/, NO0 = /^(huy|thoi|khong|bo qua|no|dung lai|khong lam|huy bo)\b/;
const YES = { test: t => t.length <= 24 && YES0.test(t) && !t.includes('?') }, NO = { test: t => t.length <= 24 && NO0.test(t) };   // chỉ nhận khi là cả câu ngắn
const confirmMsg = async (p, user) => `${await describe(p, user)}\n\n${p.danger ? '⚠ Thao tác không hoàn tác được. ' : ''}Bấm để thực hiện:\n\n[✔ Thực hiện](#ai/ok) · [✖ Hủy](#ai/no)`;
async function finishPlan(p, user, raw) {
  if (p.err) { PEND.delete(user.id); return { answer: p.err, steps: ['Trợ lý thao tác'], intent: 'agent' }; }
  if (p.ask) { PEND.set(user.id, { at: Date.now(), wait: p }); return { answer: p.ask, steps: ['Trợ lý thao tác'], intent: 'agent' }; }
  if (p.kind === 'undo') {
    const L = LAST.get(user.id); if (!L) return { answer: 'Không có thao tác nào để hoàn tác (chỉ hoàn tác được lần sửa / ghi chú / hẹn gọi gần nhất trong 30 phút).', intent: 'agent' };
    LAST.delete(user.id); let ok = 0; const er = [];
    for (const f of L.undo.reverse()) { try { await f(); ok++; } catch (e) { er.push(e.message); } }
    return { answer: `**Đã hoàn tác ${ok}/${L.undo.length}.**${er.length ? '\n' + er.slice(0, 5).map(e => '- ✖ ' + cell(e)).join('\n') : ''}`, intent: 'agent', changed: ok > 0 };
  }
  if (p.kind === 'form') {
    const E = C.E[p.ent], js = JSON.stringify(p.preset), b = (typeof Buffer !== 'undefined' ? Buffer.from(js).toString('base64') : btoa(unescape(encodeURIComponent(js)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return { answer: `Mở form **${E.title}** đã điền sẵn${p.shown.length ? ':\n' + p.shown.map(s => '- ' + cell(s)).join('\n') : ' (chưa nhận ra thông tin nào — điền trên form).'}\n\nKiểm tra lại rồi bấm Lưu:\n\n[📝 Mở form điền sẵn](#form/${p.ent}/${b})`, steps: ['Trợ lý thao tác'], intent: 'agent', form: { ent: p.ent, preset: p.preset } };
  }
  const pre = await prepare(p, user, raw); if (pre) { if (pre.ask) { PEND.set(user.id, { at: Date.now(), wait: { ...pre, base: p, raw } }); return { answer: pre.ask, steps: ['Trợ lý thao tác'], intent: 'agent' }; } return { answer: pre.err, intent: 'agent' }; }
  p.raw = raw; PEND.set(user.id, { at: Date.now(), plan: p });
  return { answer: await confirmMsg(p, user), steps: ['Trợ lý thao tác — chờ xác nhận'], intent: 'agent' };
}
async function handle(user, text) {
  fresh(PEND); fresh(LAST);
  const raw = String(text || '').trim(), t = strip(fold(raw)), pend = PEND.get(user.id);
  if (pend?.plan) {
    if (YES.test(t)) { PEND.delete(user.id); return { ...(await execute(pend.plan, user)), steps: ['Trợ lý thao tác — đã thực hiện'], intent: 'agent' }; }
    if (NO.test(t)) { PEND.delete(user.id); return { answer: 'Đã hủy, không thay đổi gì.', intent: 'agent' }; }
    PEND.delete(user.id);   // hỏi / ra lệnh khác → bỏ lệnh đang chờ
  }
  if (pend?.wait && !verbOf(t) && !NO.test(t)) {   // đang chờ bổ sung thông tin
    const w = pend.wait; PEND.delete(user.id);
    if (w.need === 'ref' || w.need === 'ent') return finishPlan(await plan(`${w.raw} ${raw}`, user) || { err: 'Chưa hiểu — gõ lại cả câu lệnh.' }, user, `${w.raw} ${raw}`);
    const b = { ...w.base };
    if (w.need === 'reason') b.comment = raw;
    if (w.need === 'body') b.body = raw;
    if (w.need === 'field') { const f = fieldOf(C.E[b.ent], fold(splitVal(raw)[0])); if (!f) return finishPlan({ err: `Không có ô «${raw}».` }, user, raw); b.field = f.k; const rv = splitVal(raw)[1]; if (!rv) return finishPlan({ ask: `Giá trị mới của «${f.l}» là gì?`, need: 'value', base: b, raw: w.raw }, user, raw); const v = await valueFor(f, rv, b.ent); if (v.err) return finishPlan({ err: v.err }, user, raw); Object.assign(b, { value: v.v, show: v.show }); }
    if (w.need === 'value' && b.kind === 'update') { const v = await valueFor(C.F[b.ent][b.field], raw, b.ent); if (v.err) return finishPlan({ err: v.err }, user, raw); Object.assign(b, { value: v.v, show: v.show }); }
    if (w.need === 'value' && b.act === 'extend') b.extend = { abs: parseDate(fold(raw)), add: /(them|nua)? ?(\d+) ?(ngay|tuan|gio|h)\b/.exec(fold(raw)), time: parseTime(fold(raw)) };
    if (w.need === 'askf') { b.data = { ...b.data }; const f = (C.E[b.ent].acts.find(x => x.k === b.act).ask || []).find(x => x.k === w.fields[0]); const v = await valueFor(f, raw, b.ent); if (v.err) return finishPlan({ err: v.err }, user, raw); b.data[f.k] = v.v; }
    return finishPlan(b, user, `${w.raw || ''} ${raw}`.trim());
  }
  if (pend?.wait && NO.test(t)) { PEND.delete(user.id); return { answer: 'Đã hủy.', intent: 'agent' }; }
  const p = await plan(raw, user); if (!p) return null;
  return finishPlan(p, user, raw);
}
module.exports = { handle, plan, parseDate, parseMoney };
