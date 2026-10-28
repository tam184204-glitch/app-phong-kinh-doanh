// Lõi nghiệp vụ dùng chung: mọi đường ghi dữ liệu (form, nhập Excel, seed, việc chạy nền) đều đi qua đây,
// nên cùng một bộ kiểm tra: kiểu dữ liệu, bắt buộc, quyền theo vai trò, phạm vi «của tôi», khóa khi đã chốt,
// trình / duyệt (không tự duyệt), sinh mã, nhật ký thao tác trước / sau.
const { E, VIRT, MGR, PII_ROLES } = require('./meta');
const { q, one, tx } = require('./db');

const F = {};
for (const e of Object.values(E)) F[e.key] = Object.fromEntries(e.fields.map(f => [f.k, f]));

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; Object.assign(this, extra || {}); } }
const bad = (msg, extra) => { throw new HttpError(400, msg, extra); };
const deny = msg => { throw new HttpError(403, msg || 'Bạn không có quyền thực hiện thao tác này'); };
const notFound = (x, what = 'bản ghi') => { if (!x) throw new HttpError(404, `Không tìm thấy ${what}`); return x; };
const ent = k => E[k] || notFound(null, 'loại dữ liệu ' + k);

// ---------- ngày giờ (giờ Việt Nam) ----------
const vnNow = () => new Date(Date.now() + 7 * 3600e3);
const today = () => vnNow().toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const dmy = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
const isoDate = v => {
  if (v instanceof Date) return new Date(v.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) { m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); if (m) m = [0, m[3], m[2].padStart(2, '0'), m[1].padStart(2, '0')]; }
  if (!m && /^\d{5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + +s * 864e5).toISOString().slice(0, 10); // số ngày kiểu Excel
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`, d = new Date(iso + 'T00:00:00Z');
  return isNaN(d) || d.toISOString().slice(0, 10) !== iso ? null : iso;
};
const isoDt = v => {
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  let m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/.exec(s);
  if (m) return /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? new Date(s).toISOString() : `${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00+07:00`;
  m = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) { const d = isoDate(m[1]); return d ? `${d}T${(m[2] || '00').padStart(2, '0')}:${m[3] || '00'}:00+07:00` : null; }
  const d = isoDate(s); return d ? `${d}T00:00:00+07:00` : null;
};
const isoMonth = v => {
  const s = String(v).trim(); let m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!m) { m = /^(\d{1,2})[/.-](\d{4})$/.exec(s); if (m) m = [0, m[2], m[1]]; }
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
};
// số kiểu Việt Nam: «1.234.567», «61,6», «1 234 567 đ»
const parseNum = (v, isMoney) => {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v).replace(/[\s₫đ]|VNĐ|vnđ|VND/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{3}(,|$)/.test(s) && isMoney ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (isMoney || /\.\d{3}\./.test(s) || /^\d{1,3}(\.\d{3})+$/.test(s) && isMoney) s = s.replace(/\./g, '');
  return s === '' ? NaN : Number(s);
};
const fmtMoney = n => n == null ? '' : Math.round(n).toLocaleString('vi-VN');

// ---------- quyền ----------
const SYS = { id: null, username: 'he_thong', full_name: 'Hệ thống', role: 'admin', sys: true };
// chạy thử (NO_LOGIN): cho tự duyệt phiếu mình trình để test một mình; vận hành thật (bỏ NO_LOGIN) thì tách nhiệm như cũ
const SELF_OK = /^(1|true|yes)$/i.test(process.env.NO_LOGIN || '');
function can(user, e, op) {
  if (!user) return false;
  if (user.role === 'admin') return op !== 'a' || true;
  const roles = op === 'r' ? (e.r || []) : op === 'c' ? (e.c || []) : op === 'u' ? (e.u || e.c || []) : op === 'd' ? (e.d || []) : op === 'a' ? (e.a || []) :
    op === 'x' ? (e.x || (e.key === 'customer' ? MGR : [...MGR, ...(e.c || [])])) : [];
  if (op === 'r' && user.role === 'lanh_dao') return true;
  return roles.includes(user.role);
}
const own = (user, e) => user && e.own && e.own.includes(user.role);

// ---------- danh mục dùng chung (cache) ----------
let LK = null;
async function lookups(force) {
  if (!LK || force) {
    LK = {};
    for (const r of await q('SELECT cat, value, label, active FROM kd_lookup ORDER BY cat, sort, label')) (LK[r.cat] ||= []).push([r.value, r.label, r.active]);
  }
  return LK;
}
const optsOf = async f => f.o || ((await lookups())[f.opt] || []).map(x => [x[0], x[1]]);
const optLabel = async (f, v) => (await optsOf(f)).find(o => o[0] === v)?.[1] ?? v;
async function setting(key, db = { one }) { return (await db.one('SELECT value FROM kd_setting WHERE key = $1', [key]))?.value; }

// ---------- chuẩn hóa một trường ----------
async function normField(f, v, db, label = f.l) {
  if (v === undefined) return undefined;
  if (v === null || (typeof v === 'string' && v.trim() === '')) return null;
  switch (f.t) {
    case 'text': case 'long': case 'code': return String(v).trim();
    case 'int': { const n = parseNum(v); if (!Number.isInteger(n)) bad(`${label}: phải là số nguyên`); return n; }
    case 'num': { const n = parseNum(v); if (!isFinite(n)) bad(`${label}: không phải số`); return n; }
    case 'money': { const n = parseNum(v, true); if (!isFinite(n)) bad(`${label}: số tiền không hợp lệ`); if (n < 0) bad(`${label}: không được âm`); return Math.round(n); }
    case 'date': { const d = isoDate(v); if (!d) bad(`${label}: ngày không hợp lệ (dd/mm/yyyy)`); return d; }
    case 'dt': { const d = isoDt(v); if (!d || isNaN(Date.parse(d))) bad(`${label}: ngày giờ không hợp lệ (dd/mm/yyyy hh:mm)`); return new Date(d).toISOString(); }
    case 'month': { const m = isoMonth(v); if (!m) bad(`${label}: tháng không hợp lệ (mm/yyyy)`); return m; }
    case 'bool': return v === true || v === 'true' || v === 1 || v === '1' || v === 'x' || v === 'X' || v === 'có' || v === 'Có';
    case 'sel': {
      const s = String(v).trim(), o = await optsOf(f);
      const hit = o.find(x => x[0] === s) || o.find(x => String(x[1]).toLowerCase() === s.toLowerCase());
      if (!hit) bad(`${label}: «${s}» không có trong danh sách (${o.map(x => x[1]).join(', ')})`);
      return hit[0];
    }
    case 'ref': {
      const id = +v; if (!Number.isInteger(id)) bad(`${label}: mã liên kết không hợp lệ`);
      if (!await db.one(`SELECT 1 FROM ${E[f.ref].table} WHERE id = $1`, [id])) bad(`${label}: không tìm thấy ${E[f.ref].one} #${id}`);
      return id;
    }
    case 'refs': {
      const ids = [...new Set((Array.isArray(v) ? v : String(v).split(/[,;]+/)).map(x => +x).filter(Boolean))];
      if (ids.some(id => !Number.isInteger(id))) bad(`${label}: mã liên kết không hợp lệ`);
      const n = ids.length ? (await db.one(`SELECT count(*) n FROM ${E[f.ref].table} WHERE id = ANY($1)`, [ids])).n : 0;
      if (n !== ids.length) bad(`${label}: có ${E[f.ref].one} không tồn tại`);
      return ids.length ? ids : null;
    }
    case 'user': {
      const id = +v; const u = Number.isInteger(id) && await db.one('SELECT id, role, active FROM kd_user WHERE id = $1', [id]);
      if (!u) bad(`${label}: không tìm thấy nhân viên`);
      if (!u.active) bad(`${label}: tài khoản đã ngừng hoạt động`);
      if (f.roles && !f.roles.includes(u.role) && u.role !== 'admin') bad(`${label}: người được chọn không có thẩm quyền`);
      return id;
    }
    case 'check': {
      if (!Array.isArray(v)) bad(`${label}: danh mục không hợp lệ`);
      return v.map(x => {
        const n = String(x.n || '').trim(); if (!n) bad(`${label}: có mục không có tên`);
        if (x.st && !['da_nhan', 'thieu', 'can_sua'].includes(x.st)) bad(`${label}: tình trạng «${x.st}» không hợp lệ`);
        const qty = x.qty === '' || x.qty == null ? null : Math.round(+String(x.qty).replace(',', '.'));
        if (qty != null && !(qty >= 0)) bad(`${label}: số lượng «${x.qty}» không hợp lệ`);
        return { n, st: x.st || '', note: x.note ? String(x.note).trim() : '', on: x.on ? isoDate(x.on) : null, ...(qty != null ? { qty } : {}) };
      });
    }
    case 'json': {
      if (!f.grid) return v;
      // bảng nhiều dòng: chỉ giữ các cột khai báo, bỏ dòng trống
      if (v == null || v === '') return [];
      if (!Array.isArray(v)) bad(`${label}: dữ liệu bảng không hợp lệ`);
      return v.map(x => Object.fromEntries(f.grid.map(c => [c.k, x?.[c.k] == null ? '' : String(x[c.k]).trim()]))).filter(x => Object.values(x).some(Boolean));
    }
  }
  return v;
}
const shown = (f, rec) => !f.show || Object.entries(f.show).every(([k, vals]) => vals.includes(rec[k]));
const defVal = (f, user) => f.def === 'me' ? user?.id ?? null : f.def === 'today' ? today() : f.def === 'now' ? new Date().toISOString() : f.def;

// ---------- sinh mã ----------
async function nextCode(db, f) {
  const prefix = f.prefix.replace('{Y}', today().slice(0, 4));
  const r = await db.one('INSERT INTO kd_counter (prefix, n) VALUES ($1, 1) ON CONFLICT (prefix) DO UPDATE SET n = kd_counter.n + 1 RETURNING n', [prefix]);
  return prefix + String(r.n).padStart(f.pad || 4, '0');
}

// ---------- nhật ký ----------
const SKIP_AUDIT = new Set(['updated_at', 'updated_by']);
async function audit(db, entKey, recId, action, before, after, user, note, demo) {
  let b = null, a = null;
  if (before || after) {
    b = {}; a = {};
    for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
      if (SKIP_AUDIT.has(k) || k.endsWith('__l')) continue;
      const x = before?.[k] ?? null, y = after?.[k] ?? null;
      if (JSON.stringify(x) !== JSON.stringify(y)) { b[k] = x; a[k] = y; }
    }
    if (before && after && !Object.keys(a).length && !note) return;
  }
  await db.q('INSERT INTO kd_audit (ent, rec_id, action, before, after, user_id, note, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [entKey, recId, action, b && before ? b : null, a && after ? a : null, user?.id ?? null, note || null, !!demo]);
}

// ---------- SQL dựng sẵn ----------
const dispOf = (k, alias) => E[k].disp.replace(/\bt\./g, alias + '.');
function labelCols(e) {
  const out = [];
  for (const f of e.fields) {
    if (f.t === 'ref') out.push(`(SELECT ${dispOf(f.ref, 'x')} FROM ${E[f.ref].table} x WHERE x.id = t.${f.k}) AS "${f.k}__l"`);
    if (f.t === 'refs') out.push(`(SELECT string_agg(${dispOf(f.ref, 'x')}, ', ' ORDER BY array_position(t.${f.k}, x.id)) FROM ${E[f.ref].table} x WHERE x.id = ANY(t.${f.k})) AS "${f.k}__l"`);
    if (f.t === 'user') out.push(`(SELECT full_name FROM kd_user x WHERE x.id = t.${f.k}) AS "${f.k}__l"`);
  }
  out.push('(SELECT full_name FROM kd_user x WHERE x.id = t.created_by) AS "created_by__l"');
  return out;
}
// biểu thức SQL lấy dự án / tòa / căn của bản ghi (để lọc theo dự án, tìm theo mã căn)
function unitExpr(e) {
  const fk = F[e.key];
  if (e.key === 'unit') return 't.id';
  if (fk.unit_id) return 't.unit_id';
  if (fk.contract_id) return '(SELECT unit_id FROM kd_contract c WHERE c.id = t.contract_id)';
  if (fk.reservation_id) return '(SELECT unit_id FROM kd_reservation r WHERE r.id = t.reservation_id)';
  return null;
}
function projExpr(e) {
  if (F[e.key].project_id) return 't.project_id';
  const u = unitExpr(e); return u ? `(SELECT project_id FROM kd_unit u WHERE u.id = ${u})` : null;
}
function buildingExpr(e) {
  if (F[e.key].building_id) return 't.building_id';
  const u = unitExpr(e); return u ? `(SELECT building_id FROM kd_unit u WHERE u.id = ${u})` : null;
}

let H = {};          // hook nghiệp vụ từng loại (biz.js gắn vào)
const hooks = h => { H = h; };

function maskPii(e, row, user, reveal) {
  for (const f of e.fields) if (f.grid && Array.isArray(row[f.k]) && !(reveal && PII_ROLES.includes(user.role))) {
    // bảng nhiều dòng (VD thành viên hộ): che từng ô định danh
    row[f.k] = row[f.k].map(x => { const o = { ...x }; for (const c of f.grid) if (c.pii && o[c.k]) { o[c.k] = '•••••' + String(o[c.k]).slice(-3); row._masked = true; } return o; });
  } else if (f.pii && row[f.k] != null && !(reveal && PII_ROLES.includes(user.role))) {
    const s = String(row[f.k]); row[f.k] = f.t === 'date' ? '••/••/••••' : '•••••' + s.slice(-3);
    row._masked = true;
  }
  return row;
}

// ---------- đọc ----------
async function list(entKey, user, qs = {}, { db = { q, one }, limit } = {}) {
  const e = ent(entKey); if (!can(user, e, 'r')) deny();
  const where = [], p = [];
  const add = (sql, ...vals) => { for (const v of vals) p.push(v); where.push(sql.replace(/\$(\d+)/g, (_, i) => '$' + (p.length - vals.length + +i))); };
  if (own(user, e)) add(`(t.${F[entKey].owner_id ? 'owner_id' : 'created_by'} = $1 OR t.created_by = $1)`, user.id);
  if (qs.mine === '1') {
    const k = F[entKey].assignee_id ? 'assignee_id' : F[entKey].owner_id ? 'owner_id' : 'created_by';
    add(`(t.${k} = $1 OR t.created_by = $1)`, user.id);
  }
  if (qs.q) {
    const parts = e.fields.filter(f => ['text', 'code'].includes(f.t) && !f.pii || (e.search || []).includes(f.k)).map(f => `t.${f.k}`);
    for (const f of e.fields) if (f.t === 'ref' && ['unit', 'customer', 'contract', 'agent'].includes(f.ref)) parts.push(`(SELECT ${dispOf(f.ref, 'x')} FROM ${E[f.ref].table} x WHERE x.id = t.${f.k})`);
    const ux = unitExpr(e); if (ux && !F[entKey].unit_id) parts.push(`(SELECT code FROM kd_unit u WHERE u.id = ${ux})`);
    if (F[entKey].contract_id) parts.push('(SELECT k.full_name||\' \'||k.phone FROM kd_contract c JOIN kd_customer k ON k.id = c.customer_id WHERE c.id = t.contract_id)');
    add(`concat_ws(' ', t.id::text, ${parts.join(', ') || "''"}) ILIKE $1`, `%${String(qs.q).trim()}%`);
  }
  const pj = projExpr(e); if (qs.project && F[entKey].project_ids) add('$1 = ANY(t.project_ids)', +qs.project); else if (qs.project && pj) add(`${pj} = $1`, +qs.project);
  const bd = buildingExpr(e); if (qs.building && bd) add(`${bd} = $1`, +qs.building);
  for (const [k, v] of Object.entries(qs)) {
    if (!k.startsWith('f_') || v === '') continue;
    const f = F[entKey][k.slice(2)]; if (!f) continue;
    if (f.t === 'bool') add(`coalesce(t.${f.k}, false) = $1`, v === '1' || v === 'true');
    else if (f.t === 'refs') add(`$1 = ANY(t.${f.k})`, +v);
    else if (f.t === 'ref' || f.t === 'user' || f.t === 'int') add(`t.${f.k} = $1`, +v);
    else add(`t.${f.k} = $1`, v);
  }
  const baseWhere = [...where], baseP = [...p];
  if (qs.status) add(`t.status = ANY($1)`, String(qs.status).split(','));
  if (H[entKey]?.where) { const w = H[entKey].where(qs, user); if (w) add(w.sql, ...(w.params || [])); }
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  let order = e.order || 't.id DESC';
  if (qs.sort) { const k = qs.sort.replace(/^-/, ''); if (F[entKey][k] || ['id', 'created_at'].includes(k)) order = `t.${k} ${qs.sort[0] === '-' ? 'DESC' : 'ASC'} NULLS LAST, t.id DESC`; }
  const lim = Math.min(+(limit || qs.limit) || 300, 20000), off = Math.max(+qs.offset || 0, 0);
  const rows = await db.q(`SELECT t.*, ${labelCols(e).join(', ')} FROM ${e.table} t ${W} ORDER BY ${order} LIMIT ${lim} OFFSET ${off}`, p);
  const total = (await db.one(`SELECT count(*) AS n FROM ${e.table} t ${W}`, p)).n;
  let counts = null;
  if (F[entKey].status) {
    const bw = baseWhere.length ? 'WHERE ' + baseWhere.join(' AND ') : '';
    counts = Object.fromEntries((await db.q(`SELECT t.status, count(*) AS n FROM ${e.table} t ${bw} GROUP BY 1`, baseP)).map(r => [r.status, r.n]));
  }
  if (H[entKey]?.decorate) await H[entKey].decorate(rows, { db, user });
  rows.forEach(r => maskPii(e, r, user, e.listPii));          // listPii: danh sách hiện thẳng định danh cho vai trò được xem
  return { rows, total, counts };
}
async function raw(db, entKey, id, lock) {
  return db.one(`SELECT * FROM ${E[entKey].table} WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
}
async function scopeCheck(db, e, rec, user) {
  if (own(user, e)) { const k = F[e.key].owner_id ? 'owner_id' : 'created_by'; if (rec[k] !== user.id && rec.created_by !== user.id) deny('Bản ghi thuộc phạm vi của nhân viên khác'); }
}
async function get(entKey, id, user, { db = { q, one }, reveal } = {}) {
  const e = ent(entKey); if (!can(user, e, 'r')) deny();
  const row = notFound(await db.one(`SELECT t.*, ${labelCols(e).join(', ')} FROM ${e.table} t WHERE t.id = $1`, [+id]));
  await scopeCheck(db, e, row, user);
  if (H[entKey]?.decorate) await H[entKey].decorate([row], { db, user, one: true });
  maskPii(e, row, user, reveal);
  const files = await db.q('SELECT f.id, f.kind, f.name, f.mime, f.size, f.version, f.uploaded_at, u.full_name AS by FROM kd_file f LEFT JOIN kd_user u ON u.id = f.uploaded_by WHERE f.ent = $1 AND f.rec_id = $2 AND f.deleted_at IS NULL ORDER BY f.uploaded_at DESC', [entKey, row.id]);
  const notes = await db.q('SELECT n.id, n.body, n.at, u.full_name AS by FROM kd_note n LEFT JOIN kd_user u ON u.id = n.by WHERE n.ent = $1 AND n.rec_id = $2 ORDER BY n.at', [entKey, row.id]);
  const approvals = await db.q(`SELECT a.*, r.full_name AS requested_by_l, d.full_name AS decided_by_l, p.full_name AS approver_l FROM kd_approval a
    LEFT JOIN kd_user r ON r.id = a.requested_by LEFT JOIN kd_user d ON d.id = a.decided_by LEFT JOIN kd_user p ON p.id = a.approver_id
    WHERE a.ent = $1 AND a.rec_id = $2 ORDER BY a.requested_at`, [entKey, row.id]);
  return { row, files, notes, approvals, perm: await perms(e, row, user, approvals, db) };
}
// quyền trên một bản ghi cụ thể — giao diện dựa vào đây để hiện nút
async function perms(e, row, user, approvals, db) {
  const locked = !!(e.lock && e.lock.includes(row.status));
  const open = approvals.find(a => a.status === 'cho_duyet');
  const fl = e.flow;
  const out = {
    edit: can(user, e, 'u') && (!locked || !!(e.lockKeep || []).length), locked, lockKeep: locked ? e.lockKeep || [] : null,
    del: can(user, e, 'd') && !(H[e.key]?.noDelete?.(row)),
    submit: !!fl && fl.submit.includes(row[fl.field]) && (can(user, e, 'c') || can(user, e, 'u')),
    approve: !!open && canApprove(e, row, user, open), selfApproval: !!open && open.requested_by === user.id && user.role !== 'admin',
    acts: (e.acts || []).filter(a => (a.from === '*' || a.from.includes(row.status)) && (user.role === 'admin' || a.roles.includes(user.role))).map(a => a.k),
    files: can(user, e, 'u') || can(user, e, 'c') || (e.acts || []).some(a => a.roles.includes(user.role)),
    export: can(user, e, 'x'),
  };
  if (H[e.key]?.perms) Object.assign(out, await H[e.key].perms(row, user, db));
  return out;
}
function canApprove(e, row, user, open) {
  if (open.requested_by === user.id && user.role !== 'admin' && !SELF_OK) return false;          // tách nhiệm: không tự duyệt
  if (open.approver_id) return open.approver_id === user.id || user.role === 'admin';
  return user.role === 'admin' || open.roles.includes(user.role);
}

// ---------- ghi ----------
function ctxOf(db, user, opts = {}) { return { db, user, demo: !!opts.demo, warn: [], opts }; }
async function normalize(e, input, user, db, { creating, old, system } = {}) {
  const out = {};
  for (const f of e.fields) {
    if (f.t === 'code' && !f.manual) continue;
    if ((f.ro || f.hide) && !system) continue;
    if (!(f.k in input)) continue;
    if (f.pii && !creating && !system && !PII_ROLES.includes(user.role) && user.role !== 'admin') {
      if (old?.[f.k] != null) continue;                     // không có quyền xem thì không được sửa dữ liệu định danh đã có
    }
    if (f.pii && typeof input[f.k] === 'string' && input[f.k].startsWith('•')) continue;
    if (f.grid && Array.isArray(input[f.k])) {   // ô định danh đang bị che → giữ giá trị cũ cùng dòng
      const was = old?.[f.k] || [];
      input = { ...input, [f.k]: input[f.k].map((x, i) => Object.fromEntries(Object.entries(x || {}).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('•') ? (was[i]?.[k] ?? '') : v]))) };
    }
    out[f.k] = await normField(f, input[f.k], db);
    if (f.t === 'code' && out[f.k] == null) delete out[f.k];       // mã để trống → tự cấp, không xóa mã cũ
  }
  return out;
}
function requireFields(e, rec) {
  const miss = e.fields.filter(f => f.req && !f.ro && !f.hide && f.t !== 'code' && shown(f, rec) && (rec[f.k] == null || rec[f.k] === '' || (Array.isArray(rec[f.k]) && !rec[f.k].length)));
  if (miss.length) bad('Thiếu thông tin bắt buộc: ' + miss.map(f => f.l).join(', '), { fields: miss.map(f => f.k) });
}
const pgMsg = (err, e) => {
  if (err.code === '23505') {
    const m = /Key \((.+?)\)=\((.+?)\)/.exec(err.detail || '');
    const nice = {
      kd_reservation_one_active: 'Căn này đang có phiếu giữ chỗ / giao dịch còn hiệu lực — không thể giữ trùng',
      kd_contract_one_active: 'Căn này đã có hợp đồng còn hiệu lực',
      kd_commission_one: 'Hợp đồng này đã được tính hoa hồng — không tính trùng',
      kd_collect_plan_one: 'Hợp đồng này đã có dòng kế hoạch thu trong tháng',
      kd_installment_seq: 'Trùng số kỳ thu trong hợp đồng',
      kd_customer_phone: 'Số điện thoại đã thuộc hồ sơ khách hàng khác',
      kd_customer_idno: 'Số giấy tờ định danh đã thuộc hồ sơ khách hàng khác',
      kd_customer_code_uq: 'Mã khách hàng đã tồn tại',
    }[err.constraint];
    return nice || `Trùng dữ liệu${m ? `: ${m[1].replace(/upper\(|\)/g, '')} = ${m[2]}` : ''} (đã có ${e?.one || 'bản ghi'} này)`;
  }
  if (err.code === '23503') return err.message.includes('delete') || err.message.includes('xóa') || /update or delete/.test(err.message) ? 'Không xóa được: bản ghi đang được dùng ở dữ liệu khác' : 'Liên kết không hợp lệ';
  if (err.code === '23514') return 'Dữ liệu vi phạm quy tắc: ' + ({ ck_kd_unit_biz0: 'diện tích phải > 0', ck_kd_reservation_biz0: 'hạn giữ chỗ phải sau ngày đăng ký', ck_kd_price_policy_biz0: 'ngày kết thúc phải sau ngày bắt đầu', ck_kd_collect_plan_biz0: 'số dự kiến thu phải > 0', ck_kd_installment_biz0: 'số tiền kỳ thu phải > 0', ck_kd_receipt_biz0: 'số tiền phải > 0' }[err.constraint] || err.constraint);
  return null;
};
async function guard(e, fn) {
  try { return await fn(); } catch (err) { const m = pgMsg(err, e); if (m) throw new HttpError(400, m); throw err; }
}

async function create(entKey, input, user, opts = {}) {
  const e = ent(entKey);
  if (!opts.system && !can(user, e, 'c')) deny(`Vai trò của bạn không được tạo ${e.one}`);
  const run = async db => {
    const ctx = ctxOf(db, user, opts);
    const data = await normalize(e, input, user, db, { creating: true, system: opts.system });
    const rec = {};
    for (const f of e.fields) if (f.def !== undefined && f.t !== 'code') rec[f.k] = defVal(f, user);
    Object.assign(rec, data);
    if (H[entKey]?.beforeSave) await H[entKey].beforeSave(rec, null, ctx);
    requireFields(e, rec);
    if (opts.check) return { ok: true, warnings: ctx.warn };
    for (const f of e.fields) if (f.t === 'code' && !rec[f.k]) {
      if (input[f.k] && (opts.system || opts.keepCode)) { rec[f.k] = input[f.k]; continue; }
      do rec[f.k] = await nextCode(db, f);                                  // mã nhập tay có thể đã chiếm số kế tiếp
      while (f.manual && await db.one(`SELECT 1 AS x FROM ${e.table} WHERE ${f.k} = $1`, [rec[f.k]]));
    }
    const keys = Object.keys(rec).filter(k => F[entKey][k]);
    const vals = keys.map(k => { const f = F[entKey][k]; return (f.t === 'check' || f.t === 'json') && rec[k] != null ? JSON.stringify(rec[k]) : rec[k]; });
    const row = await db.one(`INSERT INTO ${e.table} (${[...keys, 'created_by', 'is_demo', 'created_at'].join(', ')}) VALUES (${[...keys, 1, 2, 3].map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING *`,
      [...vals, user?.id ?? null, !!opts.demo, opts.at || new Date()]);
    await audit(db, entKey, row.id, 'tao', null, row, user, opts.note, opts.demo);
    if (H[entKey]?.afterSave) await H[entKey].afterSave(row, null, ctx);
    return { row: await raw(db, entKey, row.id), warnings: ctx.warn };
  };
  return guard(e, () => opts.db ? run(opts.db) : tx(run));
}

async function update(entKey, id, input, user, opts = {}) {
  const e = ent(entKey);
  const run = async db => {
    const old = notFound(await raw(db, entKey, +id, true));
    if (!opts.system) {
      if (!can(user, e, 'u')) deny(`Vai trò của bạn không được sửa ${e.one}`);
      await scopeCheck(db, e, old, user);
    }
    const ctx = ctxOf(db, user, opts);
    const data = await normalize(e, input, user, db, { old, system: opts.system });
    for (const k of Object.keys(data)) if (JSON.stringify(data[k]) === JSON.stringify(old[k])) delete data[k];
    if (!opts.system && e.lock && e.lock.includes(old.status)) {
      const blocked = Object.keys(data).filter(k => !(e.lockKeep || []).includes(k));
      if (blocked.length) bad(`${e.one[0].toUpperCase() + e.one.slice(1)} đang ở trạng thái «${await optLabel(F[entKey].status, old.status)}» — không sửa trực tiếp (${blocked.map(k => F[entKey][k].l).join(', ')})${entKey === 'contract' ? '. Mọi thay đổi phải qua «Điều chỉnh – phụ lục hợp đồng».' : ''}`);
    }
    const rec = { ...old, ...data };
    if (H[entKey]?.beforeSave) await H[entKey].beforeSave(rec, old, ctx);
    requireFields(e, rec);
    if (opts.check) return { ok: true, warnings: ctx.warn };
    const keys = Object.keys(rec).filter(k => F[entKey][k] && JSON.stringify(rec[k]) !== JSON.stringify(old[k]));
    if (!keys.length) return { row: old, warnings: ctx.warn };
    const vals = keys.map(k => { const f = F[entKey][k]; return (f.t === 'check' || f.t === 'json') && rec[k] != null ? JSON.stringify(rec[k]) : rec[k]; });
    const row = await db.one(`UPDATE ${e.table} SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_by = $${keys.length + 1}, updated_at = now() WHERE id = $${keys.length + 2} RETURNING *`,
      [...vals, user?.id ?? null, old.id]);
    await audit(db, entKey, row.id, opts.action || 'sua', old, row, user, opts.note, row.is_demo);
    if (H[entKey]?.afterSave) await H[entKey].afterSave(row, old, ctx);
    return { row: await raw(db, entKey, row.id), warnings: ctx.warn };
  };
  return guard(e, () => opts.db ? run(opts.db) : tx(run));
}
// ghi của hệ thống (bỏ qua khóa / quyền) — dùng trong hook, luôn ghi nhật ký
const sys = (db, entKey, id, patch, user, action, note) => update(entKey, id, patch, user || SYS, { db, system: true, action, note });

async function remove(entKey, id, user, opts = {}) {
  const e = ent(entKey);
  return guard(e, () => tx(async db => {
    const old = notFound(await raw(db, entKey, +id, true));
    if (!opts.system) {
      if (!can(user, e, 'd')) deny(`Vai trò của bạn không được xóa ${e.one}`);
      if (e.lock && e.lock.includes(old.status)) bad(`Không xóa ${e.one} đã chốt / đang trình duyệt`);
    }
    const why = H[entKey]?.noDelete?.(old); if (why) bad(why);
    await db.q(`DELETE FROM ${e.table} WHERE id = $1`, [old.id]);
    await db.q("UPDATE kd_approval SET status = 'huy' WHERE ent = $1 AND rec_id = $2 AND status = 'cho_duyet'", [entKey, old.id]);
    await audit(db, entKey, old.id, 'xoa', old, null, user, opts.reason, old.is_demo);
    if (H[entKey]?.afterDelete) await H[entKey].afterDelete(old, ctxOf(db, user));
    return { ok: true };
  }));
}

// ---------- trình duyệt / phê duyệt ----------
async function requiredFiles(db, e, rec) {
  const need = (e.files || []).filter(x => x[2]);
  if (!need.length) return;
  const have = new Set((await db.q('SELECT DISTINCT kind FROM kd_file WHERE ent = $1 AND rec_id = $2 AND deleted_at IS NULL', [e.key, rec.id])).map(r => r.kind));
  const miss = need.filter(x => !have.has(x[0]));
  if (miss.length) bad('Cần tải tệp trước khi trình: ' + miss.map(x => x[1]).join(', '));
}
async function submit(entKey, id, user, { comment, db: outer, demo } = {}) {
  const e = ent(entKey), fl = e.flow || bad('Loại dữ liệu này không có luồng phê duyệt');
  const run = async db => {
    const rec = notFound(await raw(db, entKey, +id, true));
    if (!can(user, e, 'c') && !can(user, e, 'u')) deny();
    await scopeCheck(db, e, rec, user);
    if (!fl.submit.includes(rec[fl.field])) bad(`Không trình được khi đang «${await optLabel(F[entKey][fl.field], rec[fl.field])}»`);
    await requiredFiles(db, e, rec);
    for (const k of fl.need || []) if (!rec[k]) bad(`Cần nhập «${F[entKey][k].l}» trước khi trình`);
    if (fl.needAll) { const items = rec[fl.needAll] || []; const left = items.filter(x => x.st !== 'da_nhan'); if (!items.length || left.length) bad(`Còn ${left.length} giấy tờ chưa nhận đủ: ${left.slice(0, 5).map(x => x.n).join('; ')}`); }
    const ctx = ctxOf(db, user, { demo: demo ?? rec.is_demo });
    if (H[entKey]?.onSubmit) await H[entKey].onSubmit(rec, ctx);
    await sys(db, entKey, rec.id, { [fl.field]: 'cho_duyet' }, user, 'trinh_duyet', comment);
    const title = `${fl.submitLabel || 'Trình duyệt'} ${e.one} ${await labelOf(db, entKey, rec.id)}`;
    await db.q('INSERT INTO kd_approval (ent, rec_id, title, roles, approver_id, requested_by, comment, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [entKey, rec.id, title, e.a || MGR, rec.approver_id || null, user.id, comment || null, !!(demo ?? rec.is_demo)]);
    return { row: await raw(db, entKey, rec.id) };
  };
  return guard(e, () => outer ? run(outer) : tx(run));
}
async function approve(entKey, id, user, { ok, comment, db: outer } = {}) {
  const e = ent(entKey), fl = e.flow || bad('Không có luồng phê duyệt');
  const run = async db => {
    const rec = notFound(await raw(db, entKey, +id, true));
    const open = await db.one("SELECT * FROM kd_approval WHERE ent = $1 AND rec_id = $2 AND status = 'cho_duyet' FOR UPDATE", [entKey, rec.id]);
    if (!open || rec[fl.field] !== 'cho_duyet') bad('Không có đề nghị nào đang chờ duyệt');
    if (open.requested_by === user.id && user.role !== 'admin' && !SELF_OK) deny('Không tự phê duyệt đề nghị do mình trình (tách nhiệm)');
    if (!canApprove(e, rec, user, open)) deny('Bạn không phải cấp phê duyệt của đề nghị này');
    if (!ok && !comment) bad('Từ chối cần ghi rõ lý do');
    const ctx = ctxOf(db, user, { demo: rec.is_demo });
    let to = ok ? fl.approve.ok : (fl.approve.no || 'tu_choi');
    let extra = {};
    if (H[entKey]?.onApprove) { const r = await H[entKey].onApprove(rec, ok, ctx); if (r?.status) to = r.status; if (r?.patch) extra = r.patch; }
    await db.q('UPDATE kd_approval SET status = $1, decided_by = $2, decided_at = now(), comment = coalesce($3, comment) WHERE id = $4', [ok ? 'da_duyet' : 'tu_choi', user.id, comment || null, open.id]);
    await sys(db, entKey, rec.id, { [fl.field]: to, ...extra }, user, ok ? 'phe_duyet' : 'tu_choi', comment);
    const row = await raw(db, entKey, rec.id);
    if (H[entKey]?.afterApprove) await H[entKey].afterApprove(row, ok, ctx);
    return { row: await raw(db, entKey, rec.id) };
  };
  return guard(e, () => outer ? run(outer) : tx(run));
}

// ---------- thao tác nghiệp vụ riêng ----------
async function act(entKey, id, name, user, input = {}, { db: outer, demo } = {}) {
  const e = ent(entKey), a = (e.acts || []).find(x => x.k === name) || bad('Thao tác không tồn tại');
  const fn = H[entKey]?.acts?.[name] || bad('Thao tác chưa được cài đặt');
  const run = async db => {
    const rec = notFound(await raw(db, entKey, +id, true));
    if (user.role !== 'admin' && !a.roles.includes(user.role)) deny(`Vai trò của bạn không được «${a.l}»`);
    await scopeCheck(db, e, rec, user);
    if (a.from !== '*' && !a.from.includes(rec.status)) bad(`Không thực hiện «${a.l}» khi đang «${await optLabel(F[entKey].status, rec.status)}»`);
    const data = {};
    for (const f of a.ask || []) {
      let v = await normField(f, input[f.k], db);
      if (v == null && f.def !== undefined && input[f.k] === undefined) v = defVal(f, user);
      if (f.req && (v == null || v === '')) bad(`Thiếu «${f.l}»`);
      data[f.k] = v;
    }
    for (const [k, v] of Object.entries(input)) if (!(k in data)) data[k] = v;       // dữ liệu phụ (vd. lịch thanh toán)
    const ctx = ctxOf(db, user, { demo: demo ?? rec.is_demo });
    const out = await fn(rec, data, ctx) || {};
    if (out.patch) await sys(db, entKey, rec.id, out.patch, user, 'tt:' + name, data.reason || out.note);
    else await audit(db, entKey, rec.id, 'tt:' + name, null, null, user, data.reason || out.note || a.l, rec.is_demo);
    return { row: await raw(db, entKey, rec.id), ...out, patch: undefined };
  };
  return guard(e, () => outer ? run(outer) : tx(run));
}

async function labelOf(db, entKey, id) {
  if (!id) return '';
  return (await db.one(`SELECT ${E[entKey].disp} AS l FROM ${E[entKey].table} t WHERE t.id = $1`, [id]))?.l || '#' + id;
}
async function addNote(entKey, id, body, user, { db = { q, one }, demo } = {}) {
  if (!String(body || '').trim()) bad('Nội dung trống');
  await db.q('INSERT INTO kd_note (ent, rec_id, body, by, is_demo) VALUES ($1,$2,$3,$4,$5)', [entKey, +id, String(body).trim(), user.id, !!demo]);
}

module.exports = {
  F, E, VIRT, HttpError, bad, deny, notFound, can, own, SYS, hooks, list, get, raw, create, update, sys, remove, submit, approve, act, audit, labelOf, addNote,
  lookups, optsOf, optLabel, setting, normField, today, addDays, dayDiff, dmy, isoDate, isoDt, isoMonth, parseNum, fmtMoney, unitExpr, projExpr, buildingExpr, labelCols, maskPii, perms, requiredFiles,
};
