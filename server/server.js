// Máy chủ App Phòng Kinh doanh — Cát Tường Group.
//   node server/server.js   → http://localhost:3500
// CSDL riêng ctg_kinhdoanh (cấu trúc tự tạo từ server/meta.js khi khởi động). Đăng nhập bằng tài khoản nhân viên;
// quyền theo vai trò (ma trận phân quyền trong «Cấu trúc App Phòng Kinh doanh»).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const { q, one, tx } = require('./db');
const { migrate } = require('./schema');
const M = require('./meta');
const C = require('./core');
const B = require('./biz');
const V = require('./views');
const IO = require('./io');
const M4 = require('./mau4');   // Mẫu 4 hồ sơ mua NOXH (gắn thêm loại nhập «mau4» vào IO.IMPORTS)
const AI = require('./ai');
const { bad, deny, notFound, HttpError, can } = C;

const PORT = +(process.env.PORT || 3500);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC = path.join(__dirname, '..', 'public');
const FILES = path.join(__dirname, '..', 'data', 'files');
const SESSION_H = 12;
const FILE_MAX = 50e6;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.doc': 'application/msword', '.xls': 'application/vnd.ms-excel', '.zip': 'application/zip' };
const INLINE = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);

// ---------- tiện ích http ----------
const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const sendFile = (res, buf, name, mime, inline) => {
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}` });
  res.end(buf);
};
const readJson = req => new Promise((resolve, reject) => {
  const parts = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > 5e6) { reject(new HttpError(413, 'Dữ liệu quá lớn')); req.destroy(); } else parts.push(c); });
  req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { reject(new HttpError(400, 'JSON không hợp lệ')); } });
  req.on('error', reject);
});
const readUpload = req => new Promise((resolve, reject) => {
  const files = [], fields = {}; let failed = null;
  const bb = Busboy({ headers: req.headers, limits: { fileSize: FILE_MAX, files: 30 }, defParamCharset: 'utf8' });
  bb.on('field', (k, v) => { fields[k] = v; });
  bb.on('file', (_n, stream, info) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('limit', () => { failed = new HttpError(413, `Tệp «${info.filename}» vượt ${FILE_MAX / 1e6}MB`); });
    stream.on('end', () => { const b = Buffer.concat(chunks); if (b.length) files.push({ buffer: b, name: info.filename, mime: info.mimeType }); });
  });
  bb.on('close', () => failed ? reject(failed) : resolve({ files, fields }));
  bb.on('error', reject);
  req.pipe(bb);
});
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(a => a[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const safeName = s => String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 150);

// ---------- phiên đăng nhập ----------
// NO_LOGIN=1 (chạy thử): không cần đăng nhập — vào thẳng bằng tài khoản NO_LOGIN_USER (mặc định Trưởng phòng thử),
// đổi vai trò bằng menu tên người dùng. Vận hành thật: bỏ NO_LOGIN trong .env.
const NO_LOGIN = /^(1|true|yes)$/i.test(process.env.NO_LOGIN || '');
const NO_LOGIN_USER = process.env.NO_LOGIN_USER || 'thu.truongphong';
const USER_COLS = 'u.id, u.username, u.full_name, u.role, u.title, u.must_change, u.is_trial, u.status, u.status_msg, u.prefs';
async function userFromReq(req) {
  const sid = cookies(req).kd_sid;
  const u = sid && await one(`SELECT ${USER_COLS} FROM kd_session s JOIN kd_user u ON u.id = s.user_id
    WHERE s.sid = $1 AND s.expires_at > now() AND u.active`, [sid]);
  if (!NO_LOGIN) return u || null;
  const r = u || await one(`SELECT ${USER_COLS} FROM kd_user u WHERE lower(u.username) = lower($1) AND u.active`, [NO_LOGIN_USER])
    || await one(`SELECT ${USER_COLS} FROM kd_user u WHERE u.active AND u.role = 'admin' ORDER BY u.is_trial DESC, u.id LIMIT 1`);
  return r && { ...r, must_change: false };
}
async function newSession(res, uid, body = { ok: true }) {
  const sid = crypto.randomBytes(32).toString('hex');
  await q(`INSERT INTO kd_session (sid, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_H} hours')`, [sid, uid]);
  send(res, 200, body, { 'Set-Cookie': `kd_sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_H * 3600}` });
}
const fails = new Map();
async function login(req, res) {
  const { username, password } = await readJson(req);
  const key = String(username || '').toLowerCase();
  const f = fails.get(key) || { n: 0, t: 0 };
  if (f.n >= 5 && Date.now() - f.t < 5 * 60e3) bad('Sai mật khẩu quá 5 lần — thử lại sau 5 phút');
  const u = await one('SELECT * FROM kd_user WHERE lower(username) = $1', [key]);
  if (!u || !u.active || !IO.checkPw(password || '', u.pw_hash)) {
    fails.set(key, { n: f.n + 1, t: Date.now() });
    await q("INSERT INTO kd_audit (ent, rec_id, action, user_id, note) VALUES ('user', $1, 'dang_nhap_sai', NULL, $2)", [u?.id ?? null, key]);
    bad(!u || !u.active ? 'Tài khoản không tồn tại hoặc đã ngừng hoạt động' : 'Sai mật khẩu');
  }
  fails.delete(key);
  await q('UPDATE kd_user SET last_login = now() WHERE id = $1', [u.id]);
  await q("INSERT INTO kd_audit (ent, rec_id, action, user_id) VALUES ('user', $1, 'dang_nhap', $1)", [u.id]);
  await newSession(res, u.id, { ok: true, must_change: u.must_change });
}

// ---------- meta gửi giao diện ----------
const EXPORT_ROLES = ['lanh_dao', 'truong_phong', 'admin', 'cong_no', 'ke_toan', 'ho_so', 'cskh'];   // được xuất Excel từ màn tổng hợp
async function metaFor(user) {
  const strip = e => ({ ...e, fields: e.fields.filter(f => !f.hide).map(f => ({ ...f })), perm: { r: can(user, e, 'r'), c: can(user, e, 'c'), u: can(user, e, 'u'), d: can(user, e, 'd'), a: can(user, e, 'a'), x: can(user, e, 'x') } });
  const ents = Object.fromEntries(Object.values(M.E).map(e => [e.key, strip(e)]));
  const lk = await C.lookups();
  for (const e of Object.values(ents)) for (const f of [...e.fields, ...(e.acts || []).flatMap(a => a.ask || [])]) if (f.opt) f.o = (lk[f.opt] || []).filter(x => x[2]).map(x => [x[0], x[1]]);
  const viewOk = v => !M.VIEW_ROLES[v] || user.role === 'admin' || M.VIEW_ROLES[v].includes(user.role);
  const menu = M.MENU.map(([no, t, icon, items]) => [no, t, icon, items.map(([id, l, code]) => { const e = id.startsWith('e:') && ents[id.slice(2).split('?')[0]]; return e ? (e.perm.r ? [id, l || e.title, e.icon, e.code] : null) : viewOk(id) ? [id, l, null, code] : null; }).filter(Boolean)]).filter(m => m[3].length);
  const settings = Object.fromEntries((await q("SELECT key, value FROM kd_setting WHERE key IN ('checklist_noxh','checklist_so_hong','checklist_ban_giao','schedule_presets','schedule_contents','sla_hours','handover_pay_pct','bravo','bsc')")).map(r => [r.key, r.value]));
  return {
    me: { ...user, avatar: (await one('SELECT avatar FROM kd_user WHERE id = $1', [user.id]))?.avatar || null }, exportRoles: EXPORT_ROLES, roles: M.ROLES, menu, ents, virt: M.VIRT, piiRoles: M.PII_ROLES, sellers: M.SELLERS, settings, alertCat: V.ALERT_CAT, reports: V.REPORTS,
    misaDir: user.role === 'admin' || user.role === 'truong_phong' ? (process.env.MISA_DIR || '') : (process.env.MISA_DIR ? 'có' : ''),
    imports: Object.fromEntries(Object.entries(IO.IMPORTS).filter(([, i]) => user.role === 'admin' || i.roles.includes(user.role)).map(([k, i]) => [k, { title: i.title, note: i.note }])),
    users: await q('SELECT id, full_name, role, title, active FROM kd_user ORDER BY active DESC, full_name'),
    projects: await q('SELECT id, code, name FROM kd_project ORDER BY code'), buildings: await q('SELECT id, project_id, code, name FROM kd_building ORDER BY code'),
    noLogin: NO_LOGIN, ai: AI.enabled(), today: C.today(), demo: (await one("SELECT (SELECT count(*) FROM kd_contract WHERE is_demo) + (SELECT count(*) FROM kd_customer WHERE is_demo) AS n")).n,
  };
}

// ---------- tệp đính kèm ----------
async function uploadFiles(req, res, user, entKey, id) {
  const e = M.E[entKey] || bad('Loại dữ liệu không hợp lệ');
  const g = await C.get(entKey, id, user);
  if (!g.perm.files) deny('Bạn không được đính kèm tệp cho hồ sơ này');
  const { files, fields } = await readUpload(req);
  if (!files.length) bad('Chưa chọn tệp');
  const kind = fields.kind || (e.files?.[0]?.[0] ?? 'tai_lieu');
  if (e.files && !e.files.some(x => x[0] === kind) && kind !== 'tai_lieu') bad('Loại tệp không hợp lệ');
  const dir = path.join(FILES, entKey, String(g.row.id)); fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase();
    if (['.exe', '.bat', '.cmd', '.js', '.vbs', '.ps1', '.msi', '.html', '.htm'].includes(ext)) bad(`Không nhận tệp ${ext}`);
    const ver = (await one('SELECT coalesce(max(version),0)+1 AS v FROM kd_file WHERE ent = $1 AND rec_id = $2 AND kind = $3 AND name = $4', [entKey, g.row.id, kind, f.name])).v;
    const disk = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${safeName(f.name)}`);
    fs.writeFileSync(disk, f.buffer);
    const r = await one('INSERT INTO kd_file (ent, rec_id, kind, name, mime, size, path, version, uploaded_by, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, name, version',
      [entKey, g.row.id, kind, f.name, MIME[ext] || f.mime || 'application/octet-stream', f.buffer.length, path.relative(FILES, disk), ver, user.id, g.row.is_demo]);
    await C.audit({ q }, entKey, g.row.id, 'tai_tep', null, null, user, `${(e.files || []).find(x => x[0] === kind)?.[1] || kind}: ${f.name}${ver > 1 ? ` (phiên bản ${ver})` : ''}`, g.row.is_demo);
    out.push(r);
  }
  send(res, 200, { files: out });
}
async function fileAccess(user, fid) {
  const f = notFound(await one('SELECT * FROM kd_file WHERE id = $1 AND deleted_at IS NULL', [+fid]), 'tệp');
  const g = await C.get(f.ent, f.rec_id, user);  // kiểm tra quyền xem hồ sơ gốc
  return { f, g };
}

// ---------- định tuyến ----------
const routes = [];
const R = (method, pattern, fn, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, ...opts });
const mgr = u => ['truong_phong', 'lanh_dao', 'admin'].includes(u.role);
const admin = u => { if (u.role !== 'admin') deny('Chỉ Quản trị hệ thống'); };

R('POST', '/api/login', (req, res) => login(req, res), { open: true });
R('POST', '/api/logout', async (req, res) => { const sid = cookies(req).kd_sid; if (sid) await q('DELETE FROM kd_session WHERE sid = $1', [sid]); send(res, 200, { ok: true }, { 'Set-Cookie': 'kd_sid=; Path=/; Max-Age=0' }); }, { open: true });
R('POST', '/api/as/:id', async (req, res, u, p) => {   // chỉ khi NO_LOGIN: đổi sang tài khoản khác không cần mật khẩu
  if (!NO_LOGIN) deny('Chỉ dùng khi chạy thử không đăng nhập (NO_LOGIN)');
  const t = notFound(await one('SELECT id FROM kd_user WHERE id = $1 AND active', [+p.id]), 'tài khoản');
  await q("INSERT INTO kd_audit (ent, rec_id, action, user_id, note) VALUES ('user', $1, 'doi_vai_tro_thu', $1, 'NO_LOGIN')", [t.id]);
  await newSession(res, t.id);
}, { allowMustChange: true });
R('GET', '/api/login-info', async (req, res) => send(res, 200, { noLogin: NO_LOGIN, trial: await q('SELECT username, full_name, role FROM kd_user WHERE active AND is_trial ORDER BY id') }), { open: true });
R('POST', '/api/password', async (req, res, u) => {
  const { old, pw } = await readJson(req);
  const row = await one('SELECT pw_hash FROM kd_user WHERE id = $1', [u.id]);
  if (!IO.checkPw(old || '', row.pw_hash)) bad('Mật khẩu hiện tại không đúng');
  if (!pw || pw.length < 6) bad('Mật khẩu mới tối thiểu 6 ký tự');
  if (pw === old) bad('Mật khẩu mới phải khác mật khẩu cũ');
  await q('UPDATE kd_user SET pw_hash = $1, must_change = false WHERE id = $2', [IO.hashPw(pw), u.id]);
  await C.audit({ q }, 'user', u.id, 'doi_mat_khau', null, null, u);
  send(res, 200, { ok: true });
}, { allowMustChange: true });
R('GET', '/api/meta', async (req, res, u) => send(res, 200, await metaFor(u)), { allowMustChange: true });
// --- tài khoản cá nhân: ai cũng tự sửa được hồ sơ của mình (chức danh / bộ phận / vai trò do Quản trị đặt) ---
const STATUS = ['lam_viec', 'ban', 'hop', 'cong_tac', 'vang', 'nghi'];
const PROFILE_COLS = 'id, username, full_name, role, title, dept, phone, email, bio, status, status_msg, prefs, avatar, cover, last_login, created_at, is_trial';
const IMG = (v, max, l) => { if (v == null || v === '') return null; if (typeof v !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) bad(`${l}: tệp ảnh không hợp lệ`); if (v.length > max) bad(`${l} quá lớn — chọn ảnh khác`); return v; };
R('GET', '/api/profile', async (req, res, u) => send(res, 200, await one(`SELECT ${PROFILE_COLS} FROM kd_user WHERE id = $1`, [u.id])));
R('PUT', '/api/profile', async (req, res, u) => {
  const b = await readJson(req), old = await one(`SELECT ${PROFILE_COLS} FROM kd_user WHERE id = $1`, [u.id]), d = {};
  const txt = (k, max, l) => { if (!(k in b)) return; const v = b[k] == null ? '' : String(b[k]).trim(); if (v.length > max) bad(`${l} tối đa ${max} ký tự`); d[k] = v || null; };
  txt('full_name', 80, 'Họ tên'); if ('full_name' in d && !d.full_name) bad('Họ tên không được để trống');
  txt('phone', 20, 'Điện thoại'); if (d.phone && !/^[0-9 +().-]{8,20}$/.test(d.phone)) bad('Số điện thoại không hợp lệ');
  txt('email', 120, 'Email'); if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) bad('Email không hợp lệ');
  txt('bio', 300, 'Giới thiệu'); txt('status_msg', 120, 'Lời nhắn trạng thái');
  if (u.role === 'admin') { txt('title', 80, 'Chức danh'); txt('dept', 80, 'Bộ phận'); }
  if ('status' in b) { if (b.status && !STATUS.includes(b.status)) bad('Trạng thái không hợp lệ'); d.status = b.status || null; }
  if ('avatar' in b) d.avatar = IMG(b.avatar, 400e3, 'Ảnh đại diện');
  if ('cover' in b) d.cover = IMG(b.cover, 1.6e6, 'Ảnh bìa');
  if ('prefs' in b) { if (b.prefs != null && (typeof b.prefs !== 'object' || Array.isArray(b.prefs))) bad('Cài đặt không hợp lệ'); const s = JSON.stringify(b.prefs || {}); if (s.length > 4000) bad('Cài đặt quá lớn'); d.prefs = s; }
  const keys = Object.keys(d).filter(k => (k === 'prefs' ? JSON.stringify(old.prefs || {}) : old[k] ?? null) !== d[k]);
  if (keys.length) {
    await q(`UPDATE kd_user SET ${keys.map((k, i) => `${k} = $${i + 1}${k === 'prefs' ? '::jsonb' : ''}`).join(', ')} WHERE id = $${keys.length + 1}`, [...keys.map(k => d[k]), u.id]);
    const sh = (k, v) => ['avatar', 'cover'].includes(k) ? (v ? 'ảnh mới' : 'không có') : k === 'prefs' ? '(cài đặt)' : v;   // nhật ký: không chép nguyên ảnh
    await C.audit({ q }, 'user', u.id, 'cap_nhat_ho_so', Object.fromEntries(keys.map(k => [k, sh(k, old[k])])), Object.fromEntries(keys.map(k => [k, sh(k, d[k])])), u);
  }
  send(res, 200, await one(`SELECT ${PROFILE_COLS} FROM kd_user WHERE id = $1`, [u.id]));
});
// phiên bản giao diện = giờ sửa các tệp public: trang đang mở so với số này, khác thì báo «Có bản cập nhật mới» (giao diện chỉ nạp 1 lần khi mở trang)
R('GET', '/api/ver', (req, res) => {
  let v = ''; try { v = ['index.html', 'ui.js', 'screens.js', 'ai.js', 'app.css'].map(f => fs.statSync(path.join(PUBLIC, f)).mtimeMs.toFixed(0)).join('.'); } catch {}   // bản demo không có tệp → bỏ qua
  send(res, 200, { ver: v });
}, { open: true });

// --- dữ liệu chung ---
R('GET', '/api/e/:ent', async (req, res, u, p, qs) => send(res, 200, await C.list(p.ent, u, qs)));
R('GET', '/api/e/:ent/:id', async (req, res, u, p) => send(res, 200, await C.get(p.ent, p.id, u)));
R('POST', '/api/e/:ent', async (req, res, u, p, qs) => { const b = await readJson(req); send(res, 200, await C.create(p.ent, b, u, { check: qs.check === '1', copyOf: +qs.copy_of || 0 })); });
R('PUT', '/api/e/:ent/:id', async (req, res, u, p, qs) => { const b = await readJson(req); send(res, 200, await C.update(p.ent, p.id, b, u, { check: qs.check === '1' })); });
R('DELETE', '/api/e/:ent/:id', async (req, res, u, p) => send(res, 200, await C.remove(p.ent, p.id, u)));
R('POST', '/api/e/:ent/:id/submit', async (req, res, u, p) => { const b = await readJson(req); send(res, 200, await C.submit(p.ent, p.id, u, b)); });
R('POST', '/api/e/:ent/:id/approve', async (req, res, u, p) => { const b = await readJson(req); send(res, 200, await C.approve(p.ent, p.id, u, { ok: !!b.ok, comment: b.comment })); });
R('POST', '/api/e/:ent/:id/act/:act', async (req, res, u, p) => { const b = await readJson(req); send(res, 200, await C.act(p.ent, p.id, p.act, u, b)); });
R('POST', '/api/e/:ent/:id/note', async (req, res, u, p) => { const b = await readJson(req); await C.get(p.ent, p.id, u); await C.addNote(p.ent, p.id, b.body, u); send(res, 200, { ok: true }); });
R('GET', '/api/e/:ent/:id/history', async (req, res, u, p) => {
  await C.get(p.ent, p.id, u);
  send(res, 200, await q('SELECT a.id, a.action, a.before, a.after, a.at, a.note, us.full_name who FROM kd_audit a LEFT JOIN kd_user us ON us.id = a.user_id WHERE a.ent = $1 AND a.rec_id = $2 ORDER BY a.at DESC, a.id DESC', [p.ent, +p.id]));
});
R('GET', '/api/pii/customer/:id', async (req, res, u, p) => {
  if (!M.PII_ROLES.includes(u.role)) deny('Bạn không được xem dữ liệu định danh khách hàng');
  const g = await C.get('customer', p.id, u, { reveal: true });
  await C.audit({ q }, 'customer', g.row.id, 'xem_dinh_danh', null, null, u);
  send(res, 200, Object.fromEntries(M.E.customer.fields.filter(f => f.pii).map(f => [f.k, g.row[f.k]])));
});
// các loại khác có ô định danh (phiếu đăng ký, hồ sơ NOXH — kể cả bảng thành viên hộ)
R('GET', '/api/pii/:ent/:id', async (req, res, u, p) => {
  const e = M.E[p.ent], fs_ = e ? e.fields.filter(f => f.pii || f.grid?.some(c => c.pii)) : [];
  if (!fs_.length) bad('Loại dữ liệu không có thông tin định danh');
  if (!M.PII_ROLES.includes(u.role)) deny('Bạn không được xem dữ liệu định danh khách hàng');
  const g = await C.get(p.ent, p.id, u, { reveal: true });
  await C.audit({ q }, p.ent, g.row.id, 'xem_dinh_danh', null, null, u);
  send(res, 200, Object.fromEntries(fs_.map(f => [f.k, g.row[f.k]])));
});
R('GET', '/api/templates', async (req, res, u, p, qs) => {
  // ?ent=<module> → mẫu của module (nút «Mẫu biểu» / «In theo mẫu»); &active=1 chỉ mẫu đang dùng
  if (qs.ent) {
    const ts = await q(`SELECT id, code, name, kind, ent, scope, bedrooms, active, updated_at FROM kd_template WHERE ent = $1 ${qs.active ? 'AND active' : ''} ORDER BY active DESC, id`, [qs.ent]);
    if (!qs.rec) return send(res, 200, ts);
    // ?rec=<bản ghi> → chỉ mẫu hợp dự án / tòa của bản ghi, mẫu riêng của tòa / dự án xếp trước mẫu chung
    const sc = await IO.recScope(qs.ent, qs.rec);
    return send(res, 200, ts.map(t => ({ ...t, lv: IO.tplFitLevel(t, sc) })).filter(t => t.lv >= 0).sort((a, b) => b.lv - a.lv || a.id - b.id));
  }
  // ?res=<phiếu đăng ký> → chỉ mẫu hợp với căn của phiếu (dự án / tòa / số phòng ngủ)
  if (qs.all && qs.res) {
    const r = await one('SELECT unit_id FROM kd_reservation WHERE id = $1', [+qs.res]);
    const ts = await q("SELECT code, name, kind, scope, bedrooms FROM kd_template WHERE active AND kind IN ('dang_ky_can','dang_ky_noi_that') AND coalesce(ent, 'reservation') = 'reservation' ORDER BY id");
    const sc = await IO.recScope('reservation', qs.res);
    const fit = new Set([...await IO.regTemplates('dang_ky_can', r?.unit_id), ...await IO.regTemplates('dang_ky_noi_that', r?.unit_id)].map(t => t.code));
    const out = new Map();
    for (const t of ts) {
      const key = t.name.replace(/\s*–?\s*hoàn thiện căn hộ \d phòng ngủ$/, '');   // 2PN / 3PN cùng một file → một lựa chọn
      const lv = IO.tplFitLevel(t, sc);
      const o = out.get(key); if (!o || (!o.fit && fit.has(t.code))) out.set(key, { code: t.code, kind: t.kind, label: key === t.name ? t.name : key + ' – hoàn thiện căn hộ', fit: fit.has(t.code), lv: Math.max(lv, o?.lv ?? -1), scope: t.scope });
    }
    return send(res, 200, [...out.values()]);
  }
  if (qs.kind && qs.res) { const r = await one('SELECT unit_id FROM kd_reservation WHERE id = $1', [+qs.res]); return send(res, 200, (await IO.regTemplates(qs.kind, r?.unit_id)).map(t => ({ code: t.code, name: t.name, kind: t.kind }))); }
  send(res, 200, await q('SELECT code, name, kind FROM kd_template WHERE active AND ($1::text IS NULL OR kind = $1) ORDER BY id', [qs.kind || null]));
});
R('POST', '/api/bulk/:ent/:op', async (req, res, u, p) => {
  const { ids = [], ok, comment } = await readJson(req); const out = { ok: 0, errors: [] };
  for (const id of ids.slice(0, 500)) {
    try { if (p.op === 'submit') await C.submit(p.ent, id, u, { comment }); else if (p.op === 'approve') await C.approve(p.ent, id, u, { ok: !!ok, comment }); else bad('Thao tác không hợp lệ'); out.ok++; }
    catch (e) { if (!(e instanceof HttpError)) throw e; out.errors.push({ id, msg: e.message }); }
  }
  send(res, 200, out);
});
R('GET', '/api/opts/:ent', async (req, res, u, p, qs) => {
  const e = M.E[p.ent] || bad('Loại dữ liệu không hợp lệ'); if (!can(u, e, 'r')) return send(res, 200, []);
  const w = [], params = [];
  if (qs.q) { params.push(`%${qs.q}%`); w.push(`(${e.disp}) ILIKE $${params.length}`); }
  if (qs.id) { params.push(+qs.id); w.push(`t.id = $${params.length}`); }
  if (qs.dep && qs.depv && C.F[p.ent][qs.dep]) { params.push(+qs.depv); w.push(`t.${qs.dep} = $${params.length}`); }
  if (qs.filter && C.F[p.ent].status) { params.push(qs.filter.split(',')); w.push(`t.status = ANY($${params.length})`); }
  if (C.own(u, e)) { params.push(u.id); w.push(`(t.${C.F[p.ent].owner_id ? 'owner_id' : 'created_by'} = $${params.length} OR t.created_by = $${params.length})`); }
  const extra = p.ent === 'unit' ? ", t.status, (SELECT code FROM kd_building b WHERE b.id = t.building_id) sub" : p.ent === 'customer' ? ", '…' || right(t.phone, 3) sub" : p.ent === 'contract' ? ", (SELECT code FROM kd_unit u WHERE u.id = t.unit_id) || ' · ' || (SELECT full_name FROM kd_customer k WHERE k.id = t.customer_id) sub" : p.ent === 'reservation' ? ", (SELECT code FROM kd_unit u WHERE u.id = t.unit_id) sub" : '';
  send(res, 200, await q(`SELECT t.id, ${e.disp} AS label ${extra} FROM ${e.table} t ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ${p.ent === 'unit' ? 't.code' : p.ent === 'installment' && qs.dep ? 't.active DESC, t.seq' : p.ent === 'loan_pay' && qs.dep ? 't.due_on, t.kind DESC, t.seq' : 't.id DESC'} LIMIT ${qs.id ? 1 : 30}`, params));
});
R('GET', '/api/export/:ent', async (req, res, u, p, qs) => { const x = await IO.exportList(p.ent, u, qs); sendFile(res, x.buf, x.name, MIME['.xlsx']); });
R('POST', '/api/export-rows', async (req, res, u) => {
  const b = await readJson(req);
  if (!EXPORT_ROLES.includes(u.role)) deny();
  await C.audit({ q }, 'view', null, 'xuat_du_lieu', null, null, u, b.title);
  sendFile(res, IO.sheet(String(b.title || 'Bao cao').slice(0, 80), b.cols || [], b.rows || [], { sum: b.sum, note: b.note, groups: b.groups }), `${safeName(b.file || 'bao-cao')}_${C.today()}.xlsx`, MIME['.xlsx']);
});

// --- tệp ---
R('POST', '/api/files/:ent/:id', (req, res, u, p) => uploadFiles(req, res, u, p.ent, p.id));
R('GET', '/api/file/:id', async (req, res, u, p, qs) => {
  const { f } = await fileAccess(u, p.id);
  const ext = path.extname(f.name).toLowerCase();
  sendFile(res, fs.readFileSync(path.join(FILES, f.path)), f.name, f.mime || 'application/octet-stream', qs.dl !== '1' && INLINE.has(ext));
});
R('DELETE', '/api/file/:id', async (req, res, u, p) => {
  const { f, g } = await fileAccess(u, p.id);
  if (g.perm.locked && !M.E[f.ent]?.fileKeep?.includes(f.kind)) bad('Hồ sơ đã chốt — không xóa tệp (tải phiên bản mới nếu cần)');
  if (f.ent === 'pinkbook' && g.row.status === 'da_giao_so') bad('Đã giao sổ — không xóa tệp của hồ sơ này');
  if (f.uploaded_by !== u.id && !mgr(u)) deny('Chỉ người tải lên hoặc Trưởng phòng được xóa tệp');
  await q('UPDATE kd_file SET deleted_at = now(), deleted_by = $1 WHERE id = $2', [u.id, f.id]);
  await C.audit({ q }, f.ent, f.rec_id, 'xoa_tep', null, null, u, f.name, f.is_demo);
  send(res, 200, { ok: true });
});
R('POST', '/api/file/:id/restore', async (req, res, u, p) => {
  const f = notFound(await one('SELECT * FROM kd_file WHERE id = $1 AND deleted_at IS NOT NULL', [+p.id]), 'tệp');
  await C.get(f.ent, f.rec_id, u);
  if (f.uploaded_by !== u.id && !mgr(u)) deny('Chỉ người tải lên hoặc Trưởng phòng được khôi phục tệp');
  await q('UPDATE kd_file SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', [f.id]);
  await C.audit({ q }, f.ent, f.rec_id, 'khoi_phuc_tep', null, null, u, f.name, f.is_demo);
  send(res, 200, { ok: true });
});
R('POST', '/api/file/:id/star', async (req, res, u, p) => {
  const { f } = await fileAccess(u, p.id), { on } = await readJson(req);
  if (on) await q('INSERT INTO kd_file_star (user_id, file_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [u.id, f.id]);
  else await q('DELETE FROM kd_file_star WHERE user_id = $1 AND file_id = $2', [u.id, f.id]);
  send(res, 200, { ok: true });
});

// --- màn tổng hợp ---
R('GET', '/api/dashboard', async (req, res, u, p, qs) => send(res, 200, await V.dashboard({ q, one }, u, qs)));
R('GET', '/api/drill/:key', async (req, res, u, p, qs) => send(res, 200, await V.drill({ q, one }, u, decodeURIComponent(p.key), qs)));
R('GET', '/api/customer360/:id/ledger', async (req, res, u, p, qs) => send(res, 200, await V.customerLedger({ q, one }, u, p.id, qs)));   // sổ chi tiết công nợ khách hàng
R('GET', '/api/my-day', async (req, res, u) => send(res, 200, await V.myDay({ q, one }, u)));   // màn Việc của tôi
R('GET', '/api/alerts', async (req, res, u, p, qs) => send(res, 200, await V.alerts({ q, one }, u, { all: qs.all === '1' && (mgr(u)), project: qs.project })));
R('GET', '/api/approvals', async (req, res, u) => send(res, 200, await V.approvals({ q, one }, u)));
R('GET', '/api/board', async (req, res, u, p, qs) => send(res, 200, await V.board({ q, one }, u, qs)));
R('GET', '/api/payouts', async (req, res, u, p, qs) => send(res, 200, await V.payouts({ q, one }, u, qs)));
R('GET', '/api/loan-track', async (req, res, u, p, qs) => send(res, 200, await V.loanTrack({ q, one }, u, qs)));
R('GET', '/api/loan-track/:id', async (req, res, u, p) => send(res, 200, await V.loanItems({ q, one }, u, p.id)));
R('GET', '/api/contract-track/:id/vouchers', async (req, res, u, p, qs) => send(res, 200, await V.contractVouchers({ q, one }, u, p.id, qs)));
R('PUT', '/api/contract-track/:id/late-rate', async (req, res, u, p) => { const b = await readJson(req); send(res, 200, await tx(db => V.setLateRate(db, u, p.id, b.rate))); });
R('GET', '/api/vouchers', async (req, res, u, p, qs) => send(res, 200, await V.voucherList({ q, one }, u, qs)));   // Phiếu thu – Phiếu chi (1 màn)
R('GET', '/api/contract-track', async (req, res, u, p, qs) => send(res, 200, await V.contractTrack({ q, one }, u, qs)));
// HĐ vay ↔ HĐ thuê: danh sách để tick chọn (cùng căn hoặc cùng khách, kèm các hợp đồng đang chọn)
R('GET', '/api/contract-links', async (req, res, u, p, qs) => {
  if (!can(u, M.E.contract, 'r')) C.deny();
  const kind = ['thue', 'vay'].includes(qs.kind) ? qs.kind : C.bad('Loại hợp đồng không hợp lệ'), ids = String(qs.ids || '').split(',').map(Number).filter(Boolean);
  send(res, 200, await q(`SELECT c.id, c.number, c.status, c.rent, c.value, c.eff_on, c.exp_on, u.code unit, k.full_name customer FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id
    WHERE c.kind = $1 AND c.id <> $2 AND (c.id = ANY($5) OR (c.status NOT IN ('huy','thanh_ly') AND (c.unit_id = $3 OR c.customer_id = $4))) ORDER BY c.id DESC LIMIT 30`, [kind, +qs.self || 0, +qs.unit || 0, +qs.customer || 0, ids]));
});
R('GET', '/api/debt-status', async (req, res, u, p, qs) => send(res, 200, await V.debtStatus({ q, one }, u, qs)));
R('PUT', '/api/debt-status/days', async (req, res, u) => { const b = await readJson(req); send(res, 200, await tx(db => V.setDebtDays(db, u, b.days))); });
R('PUT', '/api/debt-status/:id/class', async (req, res, u, p) => { const b = await readJson(req); send(res, 200, await tx(db => V.setDebtClass(db, u, p.id, b))); });
R('GET', '/api/unit-status', async (req, res, u, p, qs) => send(res, 200, await V.unitStatus({ q, one }, u, qs)));
R('GET', '/api/finish-pay', async (req, res, u, p, qs) => send(res, 200, await V.finishPay({ q, one }, u, qs)));
R('GET', '/api/loans', async (req, res, u, p, qs) => send(res, 200, await V.loans({ q, one }, u, qs)));
R('GET', '/api/price-sheet/:id', async (req, res, u, p) => send(res, 200, await V.priceSheet({ q, one }, u, p.id)));
R('GET', '/api/contract-number', async (req, res, u, p, qs) => send(res, 200, { number: await B.nextContractNo({ q, one }, qs.ptype, qs.on) }));
R('GET', '/api/customer-code', async (req, res, u, p, qs) => {   // nhập mã khách: báo trùng ngay ở form, cùng nội dung khi lưu
  if (!can(u, M.E.customer, 'c') && !can(u, M.E.customer, 'u')) C.deny();
  if (qs.next) {   // mã kế tiếp (chỉ xem, chưa cấp) — bỏ qua số đã bị mã nhập tay chiếm
    const f = M.E.customer.fields.find(x => x.k === 'code'), c = await one('SELECT n FROM kd_counter WHERE prefix = $1', [f.prefix]);
    for (let n = (c?.n || 0) + 1; ; n++) { const code = f.prefix + String(n).padStart(f.pad, '0'); if (!await one('SELECT 1 AS x FROM kd_customer WHERE upper(code) = $1', [code])) return send(res, 200, { code }); }
  }
  if (qs.copy_of) {   // mã bản sao = mã gốc + -01, -02… (bản sao của bản sao vẫn đánh số theo mã gốc)
    const o = await one('SELECT code FROM kd_customer WHERE id = $1', [+qs.copy_of]); if (!o) C.deny();
    const base = String(o.code).toUpperCase().replace(/-\d+$/, '');
    for (let n = 1; ; n++) { const code = `${base}-${String(n).padStart(2, '0')}`; if (!await one('SELECT 1 AS x FROM kd_customer WHERE upper(code) = $1', [code])) return send(res, 200, { code }); }
  }
  const code = String(qs.code || '').trim().toUpperCase();
  const d = code && await one('SELECT full_name FROM kd_customer WHERE id <> $1 AND upper(code) = $2', [+qs.id || 0, code]);
  send(res, 200, { dup: !!d, msg: d ? `Mã khách hàng ${code} đã có (khách ${d.full_name}) — nhập mã khác hoặc để trống để hệ thống tự cấp` : '' });
});
R('GET', '/api/contract-pair/:unit', async (req, res, u, p) => {   // hợp đồng mua bán + hợp đồng hoàn thiện đang hiệu lực của căn
  if (!can(u, M.E.contract, 'r')) C.deny();
  const rows = await q("SELECT id, kind FROM kd_contract WHERE unit_id = $1 AND status NOT IN ('huy','thanh_ly') ORDER BY id DESC", [+p.unit]);
  send(res, 200, { main: rows.find(r => ['hdmb', 'thue_mua', 'vay', 'thue'].includes(r.kind))?.id || null, finish: rows.find(r => r.kind === 'hoan_thien')?.id || null });
});
R('GET', '/api/contract-prefill/:unit', async (req, res, u, p, qs) => { if (!can(u, M.E.contract, 'c') && !can(u, M.E.contract, 'u')) C.deny(); send(res, 200, await B.contractPrefill({ q, one }, p.unit, qs.on)); });
R('GET', '/api/sale-check/:id', async (req, res, u, p) => send(res, 200, await B.saleCheck({ q, one }, p.id) || {}));
R('GET', '/api/unit360/:id', async (req, res, u, p) => send(res, 200, await V.unit360({ q, one }, u, p.id)));
R('GET', '/api/customer360/:id', async (req, res, u, p) => send(res, 200, await V.customer360({ q, one }, u, p.id)));
R('GET', '/api/search', async (req, res, u, p, qs) => send(res, 200, await V.search({ q, one }, u, qs.q)));
R('GET', '/api/debt-summary', async (req, res, u, p, qs) => send(res, 200, await V.debtSummary({ q, one }, u, qs)));
R('GET', '/api/debt-summary.xlsx', async (req, res, u, p, qs) => {
  if (!EXPORT_ROLES.includes(u.role)) deny();
  const d = await V.debtSummary({ q, one }, u, qs), s = String(qs.q || '').trim().toLowerCase();
  if (s) d.rows = d.rows.filter(r => [r.unit, r.customer, r.cust_code, r.number, r.phone].some(x => String(x || '').toLowerCase().includes(s)));
  await C.audit({ q }, 'view', null, 'xuat_du_lieu', null, null, u, `CN-08 Bảng tổng hợp công nợ · ${d.rows.length} căn`);
  sendFile(res, V.debtSummaryXlsx(d, qs.q, new Set(String(qs.hide || '').split(',').filter(Boolean))), `Bang_tong_hop_cong_no_${d.to}.xlsx`, MIME['.xlsx']);   // hide: cột bỏ tick ở Điều kiện lọc
});
R('GET', '/api/ledger', async (req, res, u, p, qs) => send(res, 200, await V.ledger({ q, one }, u, qs)));
R('GET', '/api/ready', async (req, res, u, p, qs) => { if (!can(u, M.E.handover, 'r')) deny(); send(res, 200, await V.readyList({ q, one }, { ...qs, all: qs.all === '1' })); });
R('GET', '/api/signing', async (req, res, u, p, qs) => { if (!can(u, M.E.contract, 'r')) deny(); send(res, 200, await V.signing({ q, one }, u, qs)); });
R('GET', '/api/vault', async (req, res, u, p, qs) => send(res, 200, await V.vault({ q, one }, u, qs)));
R('GET', '/api/report/:kind', async (req, res, u, p, qs) => send(res, 200, await V.report({ q, one }, u, p.kind, qs)));
R('GET', '/api/contract/:id/debt', async (req, res, u, p) => { const g = await C.get('contract', p.id, u); send(res, 200, g.row._debt); });

// --- trợ lý AI tra cứu (chỉ đọc, theo quyền người hỏi) ---
R('POST', '/api/ai/ask', async (req, res, u) => { const b = await readJson(req); send(res, 200, await AI.ask(u, b)); });

// --- nghiệp vụ hàng loạt ---
R('POST', '/api/collect_plan/suggest', async (req, res, u) => {
  if (!can(u, M.E.collect_plan, 'c')) deny();
  const b = await readJson(req); const m = C.isoMonth(b.month || '') || bad('Chọn tháng kế hoạch');
  send(res, 200, await tx(db => suggestPlan(db, m, u, undefined, { project: b.project, building: b.building })));
});
async function suggestPlan(db, m, u, demo, f = {}) {   // f: dự án / tòa đang lọc trên màn (rà soát 07/11/2026)
  const end = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).toISOString().slice(0, 10), start = m + '-01';
  const cs = await V.signedContracts(db, { project: f.project || '', building: f.building || '' }, "AND c.status = 'da_ky'");
  const hv = await db.q("SELECT contract_id, status FROM kd_collect_plan WHERE month = $1 AND status <> 'thay_the'", [m]);
  const have = new Set(hv.map(r => r.contract_id)), rej = new Set(hv.filter(r => r.status === 'tu_choi').map(r => r.contract_id));
  const calls = await db.q('SELECT DISTINCT ON (contract_id) contract_id, promise_amount, promise_on FROM kd_debt_call WHERE promise_on BETWEEN $1 AND $2 ORDER BY contract_id, at DESC', [start, end]);
  const pm = new Map(calls.map(c => [c.contract_id, c]));
  // nhóm nợ theo CĂN như màn Tình trạng công nợ đến hạn (cộng các HĐ của căn, trừ HĐ vay; số ngày quá hạn lâu nhất)
  const DC = await V.debtCfg(db), GLa = V.debtGrpL(DC.days), GL = { n4: GLa.n4, n5: GLa.n5 }, UG = new Map();
  for (const c of cs) { if (c.kind === 'vay') continue; const g = UG.get(c.unit_id) || { od: 0, days: 0 }; g.od += c.d.overdue; g.days = Math.max(g.days, c.d.overdue_days || 0); UG.set(c.unit_id, g); }
  let n = 0; const skipped = [];
  for (const c of cs) {
    if (rej.has(c.id) && c.d.left > 0) { skipped.push(`${c.unit}: kế hoạch tháng này đã bị từ chối — sửa dòng cũ rồi trình duyệt lại`); continue; }
    if (have.has(c.id) || c.d.left <= 0 || c.kind === 'vay') continue;
    const dueBy = c.d.inst.filter(i => i.rem > 0 && i.due_on <= end).reduce((s, i) => s + i.rem, 0);
    const ug = UG.get(c.unit_id) || { od: 0, days: 0 }, pr = pm.get(c.id), grp = (ug.od > 0 && DC.units[c.unit_id]?.grp) || V.debtGrpOf(ug.od, ug.days, DC.days);
    if (!dueBy && !pr) continue;
    const expected = Math.min(c.d.left, pr ? pr.promise_amount : dueBy);
    const firstDue = c.d.inst.find(i => i.rem > 0 && i.due_on >= start && i.due_on <= end)?.due_on;
    const expected_on = pr ? pr.promise_on : firstDue || (C.today() > start ? C.today().slice(0, 7) === m ? C.today() : end : start);
    try {
      await C.create('collect_plan', { month: m, contract_id: c.id, expected, expected_on: expected_on > end ? end : expected_on < start ? start : expected_on, basis: pr ? 'cam_ket' : 'lich_hd',
        basis_note: (GL[grp] ? GL[grp] + ' — ' : '') + (pr ? `Cam kết ${C.fmtMoney(pr.promise_amount)} ngày ${C.dmy(pr.promise_on)}` : c.d.overdue > 0 ? `Nợ quá hạn ${C.fmtMoney(c.d.overdue)} (${c.d.overdue_days} ngày)` : `Kỳ đến hạn ${C.dmy(firstDue)}`),
        ability: GL[grp] ? 'thap' : pr ? 'cao' : c.d.overdue_days > 60 ? 'thap' : 'vua', owner_id: u.role === 'cong_no' ? u.id : c.owner_id || u.id }, u, { db, system: true, demo });
      n++;
    } catch (e) { if (!(e instanceof HttpError)) throw e; skipped.push(`${c.unit}: ${e.message}`); }
  }
  return { created: n, skipped, month: m };
}
R('POST', '/api/commission/calc', async (req, res, u) => {
  if (!mgr(u)) deny();
  const n = await tx(async db => { let k = 0; for (const c of await db.q("SELECT c.id FROM kd_contract c JOIN kd_reservation r ON r.id = c.reservation_id WHERE r.agent_id IS NOT NULL")) { await B.refreshCommission(db, c.id, u); k++; } return k; });
  send(res, 200, { checked: n });
});
R('POST', '/api/handover/create', async (req, res, u) => {
  if (!can(u, M.E.handover, 'c')) deny();
  const { unit_ids = [], cond_tech = true } = await readJson(req); const out = { ok: 0, errors: [] };
  for (const id of unit_ids) { try { await C.create('handover', { unit_id: id, cond_tech, owner_id: u.id }, u); out.ok++; } catch (e) { if (!(e instanceof HttpError)) throw e; out.errors.push(e.message); } }
  send(res, 200, out);
});

// --- khách tự sinh từ kênh liên hệ ---
// Website / Messenger / Zalo (form, chatbot, Zapier/Make…) gọi máy chủ → máy chủ, kèm mã bí mật LEAD_TOKEN:
//   POST /api/leads   X-Lead-Token: <LEAD_TOKEN>   { channel: 'website'|'messenger'|'zalo', full_name, phone, email, project, content }
R('POST', '/api/leads', async (req, res) => {
  const tok = process.env.LEAD_TOKEN;
  if (!tok || req.headers['x-lead-token'] !== tok) deny('Sai hoặc thiếu mã X-Lead-Token (đặt LEAD_TOKEN trong .env)');
  const b = await readJson(req);
  if (!['website', 'messenger', 'zalo'].includes(b.channel)) bad('Kênh tự động chỉ nhận website, messenger, zalo');
  const lo = process.env.LEAD_OWNER && await one('SELECT id FROM kd_user WHERE lower(username) = lower($1) AND active', [process.env.LEAD_OWNER]);
  send(res, 200, await tx(db => B.intakeLead(db, { ...b, owner_id: lo?.id }, C.SYS)));
}, { open: true });
R('POST', '/api/leads/manual', async (req, res, u) => {   // khách gặp trực tiếp / gọi Hotline — nhân viên thêm tay
  if (!can(u, M.E.contact_log, 'c')) deny();
  const b = await readJson(req);
  if (!['truc_tiep', 'hotline'].includes(b.channel)) bad('Chọn kênh: Gặp trực tiếp hoặc Hotline');
  send(res, 200, await tx(db => B.intakeLead(db, b, u)));
});

// --- nhập dữ liệu ---
R('GET', '/api/import/misa-sample', async (req, res, u) => sendFile(res, await IO.misaSample(u), `File_MISA_thu_${C.today()}.xlsx`, MIME['.xlsx']));
R('GET', '/api/import/template/:kind', async (req, res, u, p) => sendFile(res, IO.importTemplate(p.kind), `Mau_nhap_${p.kind}.xlsx`, MIME['.xlsx']));
R('POST', '/api/import/:kind', async (req, res, u, p, qs) => {
  const { files } = await readUpload(req); if (!files[0]) bad('Chưa chọn tệp');
  const r = await IO.importFile(p.kind, files[0], u, { dry: qs.dry === '1' });
  if (!r.dry) C.lookups(true);
  send(res, 200, r);
});
R('GET', '/api/imports', async (req, res, u) => send(res, 200, await q('SELECT i.*, us.full_name by_l FROM kd_import i LEFT JOIN kd_user us ON us.id = i.by ORDER BY i.at DESC LIMIT 100')));

// --- quản trị ---
R('GET', '/api/users', async (req, res, u) => { admin(u); send(res, 200, await q('SELECT id, username, full_name, role, title, dept, phone, email, active, is_trial, must_change, last_login, created_at FROM kd_user ORDER BY active DESC, role, full_name')); });
R('POST', '/api/users', async (req, res, u) => { admin(u); const b = await readJson(req); send(res, 200, await tx(db => IO.createUser(db, b, u))); });
R('PUT', '/api/users/:id', async (req, res, u, p) => {
  admin(u); const b = await readJson(req); const old = notFound(await one('SELECT * FROM kd_user WHERE id = $1', [+p.id]), 'tài khoản');
  if (old.id === u.id && (b.active === false || (b.role && b.role !== 'admin'))) bad('Không tự khóa / tự hạ quyền tài khoản đang đăng nhập');
  if (b.role && !M.ROLES.some(r => r[0] === b.role)) bad('Vai trò không hợp lệ');
  const keys = ['full_name', 'role', 'title', 'dept', 'phone', 'email', 'active'].filter(k => k in b);
  if (!keys.length) bad('Không có thay đổi');
  const r = await one(`UPDATE kd_user SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING id, username, full_name, role, active`, [...keys.map(k => b[k]), old.id]);
  if (b.active === false) await q('DELETE FROM kd_session WHERE user_id = $1', [old.id]);
  await C.audit({ q }, 'user', old.id, 'sua_tai_khoan', Object.fromEntries(keys.map(k => [k, old[k]])), Object.fromEntries(keys.map(k => [k, b[k]])), u);
  send(res, 200, r);
});
R('POST', '/api/users/:id/reset', async (req, res, u, p) => {
  admin(u); const pw = process.env.DEFAULT_PW || '123456';
  await q('UPDATE kd_user SET pw_hash = $1, must_change = true WHERE id = $2', [IO.hashPw(pw), +p.id]); await q('DELETE FROM kd_session WHERE user_id = $1', [+p.id]);
  await C.audit({ q }, 'user', +p.id, 'dat_lai_mat_khau', null, null, u);
  send(res, 200, { ok: true, pw });
});
R('GET', '/api/lookups', async (req, res, u) => send(res, 200, await q('SELECT * FROM kd_lookup ORDER BY cat, sort, label')));
R('PUT', '/api/lookups/:cat', async (req, res, u, p) => {
  if (!['admin', 'truong_phong'].includes(u.role)) deny();
  if (!M.LOOKUPS[p.cat]) bad('Danh mục không hợp lệ');
  const { rows = [] } = await readJson(req);
  await tx(async db => {
    const used = new Set((await db.q('SELECT value FROM kd_lookup WHERE cat = $1', [p.cat])).map(r => r.value));
    for (const [i, r] of rows.entries()) {
      const v = String(r.value || '').trim(), l = String(r.label || '').trim(); if (!v || !l) bad('Mỗi dòng cần mã và tên');
      await db.q('INSERT INTO kd_lookup (cat, value, label, sort, active) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cat, value) DO UPDATE SET label = $3, sort = $4, active = $5', [p.cat, v, l, i, r.active !== false]);
      used.delete(v);
    }
    for (const v of used) await db.q('UPDATE kd_lookup SET active = false WHERE cat = $1 AND value = $2', [p.cat, v]);   // không xóa mã đã dùng
    await C.audit(db, 'lookup', null, 'sua_danh_muc', null, { cat: p.cat, rows }, u);
  });
  await C.lookups(true);
  send(res, 200, { ok: true });
});
R('PUT', '/api/settings/:key', async (req, res, u, p) => {
  if (!['admin', 'truong_phong'].includes(u.role)) deny();
  if (!(p.key in M.SETTINGS) || ['bravo'].includes(p.key)) bad('Cài đặt không hợp lệ');
  const { value } = await readJson(req);
  const old = await one('SELECT value FROM kd_setting WHERE key = $1', [p.key]);
  await q('UPDATE kd_setting SET value = $1, updated_at = now(), updated_by = $2 WHERE key = $3', [JSON.stringify(value), u.id, p.key]);
  await C.audit({ q }, 'setting', null, 'sua_cai_dat', { [p.key]: old?.value }, { [p.key]: value }, u);
  send(res, 200, { ok: true });
});
R('GET', '/api/audit', async (req, res, u, p, qs) => {
  if (!['admin', 'truong_phong', 'lanh_dao'].includes(u.role)) deny();
  const w = [], pp = [];
  if (qs.ent) { pp.push(qs.ent); w.push(`a.ent = $${pp.length}`); }
  if (qs.user) { pp.push(+qs.user); w.push(`a.user_id = $${pp.length}`); }
  if (qs.action) { pp.push(qs.action + '%'); w.push(`a.action LIKE $${pp.length}`); }
  if (qs.from) { pp.push(qs.from); w.push(`a.at >= $${pp.length}::date`); }
  if (qs.to) { pp.push(qs.to); w.push(`a.at < $${pp.length}::date + 1`); }
  send(res, 200, await q(`SELECT a.*, us.full_name who FROM kd_audit a LEFT JOIN kd_user us ON us.id = a.user_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.at DESC, a.id DESC LIMIT 500`, pp));
});
// khôi phục 1 dòng nhật ký: ghi lại giá trị «trước» của các trường đã đổi (chỉ thao tác sửa / chuyển trạng thái, bản ghi còn tồn tại)
R('POST', '/api/audit/:id/restore', async (req, res, u, p) => {
  if (!['admin', 'truong_phong', 'lanh_dao'].includes(u.role)) deny('Chỉ quản trị, trưởng phòng, lãnh đạo được khôi phục');
  const a = await one('SELECT * FROM kd_audit WHERE id = $1', [+p.id]); if (!a) C.notFound();
  const e = M.E[a.ent];
  if (!e || !a.rec_id || !a.before || !a.after || ['tao', 'xoa'].includes(a.action)) C.bad('Dòng nhật ký này không khôi phục được (chỉ khôi phục thao tác sửa / chuyển trạng thái)');
  const patch = Object.fromEntries(Object.entries(a.before).filter(([k]) => C.F[a.ent][k]));
  if (!Object.keys(patch).length) C.bad('Không có trường nào để khôi phục');
  const r = await tx(async db => { if (!await db.one(`SELECT 1 AS x FROM ${e.table} WHERE id = $1`, [a.rec_id])) C.bad(`${e.one[0].toUpperCase() + e.one.slice(1)} #${a.rec_id} không còn — không khôi phục được`);
    return C.sys(db, a.ent, a.rec_id, patch, u, 'khoi_phuc', `Khôi phục theo nhật ký lúc ${(t => `${C.dmy(t.slice(0, 10))} ${t.slice(11, 16)}`)(new Date(Date.parse(a.at) + 7 * 3600e3).toISOString())}`); });
  send(res, 200, { ok: true, ent: a.ent, id: a.rec_id, fields: Object.keys(patch).length, warnings: r.warnings });
});
R('GET', '/api/perm-matrix', async (req, res, u) => {
  const rows = Object.values(M.E).map(e => ({ ent: e.key, title: e.title, code: e.code, mod: e.mod, roles: Object.fromEntries(M.ROLES.map(([r]) => { const x = { role: r }; return [r, ['r', 'c', 'u', 'a', 'x'].filter(op => can(x, e, op)).join('')]; })) }));
  send(res, 200, rows);
});
R('POST', '/api/admin/clear-demo', async (req, res, u) => { admin(u); const S = require('./seed'); send(res, 200, await S.clearDemo()); });
R('POST', '/api/admin/load-demo', async (req, res, u) => { admin(u); const S = require('./seed'); send(res, 200, await S.loadDemo()); });

// in hợp đồng (trang HTML)
R('GET', '/print/reservation/:id', async (req, res, u, p, qs) => send(res, 200, await IO.printReservation(p.id, u, qs.kind, qs.tpl), { 'Content-Type': 'text/html; charset=utf-8' }), { html: true });
R('GET', '/api/handover-templates', async (req, res, u, p, qs) => send(res, 200, await M4.handoverTemplates(qs)));
R('GET', '/print/handover/:kind/:id', async (req, res, u, p, qs) => send(res, 200, await M4.printHandover(p.kind, p.id, u, qs.tpl), { 'Content-Type': 'text/html; charset=utf-8' }), { html: true });
// phiếu đề nghị hủy / đổi: tự điền theo hợp đồng / phiếu giữ chỗ
R('GET', '/api/voucher-prefill', async (req, res, u, p, qs) => { if (!can(u, M.E.receipt, 'c') && !can(u, M.E.payment, 'c')) C.deny(); send(res, 200, await B.voucherPrefill({ q, one }, qs)); });
R('GET', '/api/cancel_prefill', async (req, res, u, p, qs) => { if (!can(u, M.E.cancel_req, 'c') && !can(u, M.E.cancel_req, 'u')) C.deny(); send(res, 200, await B.cancelPrefill({ q, one }, qs)); });
// bên bán theo tên (Bên A): thông tin mặc định + ô đã ghi ở hợp đồng gần nhất cùng Bên A
// thông tin bên bán: ghi nhớ theo từng Bên A ngay khi nhập (kd_setting.seller_info_v2), không phụ thuộc hợp đồng có lưu được hay không; chưa nhập thì lấy giá trị gần nhất trên hợp đồng
const SELLER_K = ['s_addr', 's_phone', 's_tax', 's_bank_acc', 's_bank_name', 's_rep', 's_title', 's_poa'];
R('GET', '/api/seller', async (req, res, u, p, qs) => {
  const name = String(qs.name || '').trim(), base = M.SELLERS.find(s => s.name === name) || {};
  const last = name ? await one(`SELECT ${[...SELLER_K, 'seller_unit'].map(k => `(array_agg(${k} ORDER BY id DESC) FILTER (WHERE ${k} <> ''))[1] ${k}`).join(', ')} FROM kd_contract WHERE s_name = $1`, [name]) : null;
  const saved = (await one("SELECT value FROM kd_setting WHERE key = 'seller_info_v2'"))?.value?.[name] || {};   // v2: chỉ tính từ khi có bảng thông tin bên bán 31/10/2026
  const def = { s_addr: base.addr, s_phone: base.phone, s_bank_acc: base.bank_acc, s_bank_name: base.bank_name, s_rep: base.rep, s_title: base.title, s_poa: base.poa };   // người dùng đã sửa > bảng mặc định > hợp đồng gần nhất
  send(res, 200, { ...Object.fromEntries(SELLER_K.map(k => [k, saved[k] ?? def[k] ?? last?.[k] ?? ''])), seller_unit: base.unit || last?.seller_unit || '' });
});
R('PUT', '/api/seller', async (req, res, u) => {
  if (!can(u, M.E.contract, 'c') && !can(u, M.E.contract, 'u')) C.deny();
  const b = await readJson(req), name = String(b.name || '').trim();
  if (!name || !SELLER_K.includes(b.k)) bad('Thông tin bên bán không hợp lệ');
  await q(`INSERT INTO kd_setting (key, value, updated_by) VALUES ('seller_info_v2', jsonb_build_object($1::text, jsonb_build_object($2::text, $3::text)), $4)
    ON CONFLICT (key) DO UPDATE SET value = jsonb_set(kd_setting.value, ARRAY[$1::text], coalesce(kd_setting.value -> $1::text, '{}'::jsonb) || jsonb_build_object($2::text, $3::text)), updated_at = now(), updated_by = $4`, [name, b.k, String(b.v ?? '').trim(), u.id]);
  send(res, 200, { ok: true });
});
R('GET', '/api/mau4', async (req, res, u, p, qs) => send(res, 200, await M4.data(u, qs)));
R('POST', '/api/mau4/status', async (req, res, u) => send(res, 200, await M4.bulkStatus(u, await readJson(req))));
R('POST', '/api/mau4/undo', async (req, res, u) => send(res, 200, await M4.bulkUndo(u, await readJson(req))));
R('GET', '/api/mau4/xlsx', async (req, res, u, p, qs) => sendFile(res, await M4.xlsx(u, qs), `Mau4_ho_so_${qs.kind === 'thue' ? 'thue' : 'mua'}_NOXH_${C.today()}.xlsx`, MIME['.xlsx']));
R('GET', '/print/sale_notice/:id', async (req, res, u, p, qs) => send(res, 200, await IO.printSaleNotice(p.id, u, qs.kind, qs.tpl), { 'Content-Type': 'text/html; charset=utf-8' }), { html: true });
R('GET', '/print/cancel_req/:id', async (req, res, u, p, qs) => send(res, 200, await IO.printCancelReq(p.id, u), { 'Content-Type': 'text/html; charset=utf-8' }), { html: true });
R('GET', '/api/template-scope/:ent/:id', async (req, res, u, p) => send(res, 200, await IO.recScope(p.ent, p.id)));
R('GET', '/api/template-fields/:ent', async (req, res, u, p) => send(res, 200, IO.tplFields(p.ent)));
R('POST', '/api/template-preview', async (req, res, u) => send(res, 200, { html: await IO.previewTemplate(await readJson(req), u) }));
// Bộ hồ sơ theo căn (12/11/2026): gõ mã căn → bộ hồ sơ theo bước, in cả bộ / tải Word
const HS = require('./ho-so');
R('GET', '/api/hs', async (req, res, u, p, qs) => send(res, 200, await HS.hsInfo(qs.unit, u)));
R('GET', '/print/hs/:id', async (req, res, u, p, qs) => {
  if (qs.fmt === 'docx') { const x = await HS.wordHs(p.id, qs.tpl, u); return sendFile(res, x.buf, x.name, MIME['.docx']); }
  send(res, 200, await HS.printHs(p.id, qs.tpl, u), { 'Content-Type': 'text/html; charset=utf-8' });
}, { html: true });
R('GET', '/print/tpl/:ent/:id', async (req, res, u, p, qs) => send(res, 200, await IO.printGeneric(p.ent, p.id, u, qs.tpl), { 'Content-Type': 'text/html; charset=utf-8' }), { html: true });
R('GET', '/print/contract/:id', async (req, res, u, p, qs) => send(res, 200, await IO.printContract(p.id, u, qs.tpl), { 'Content-Type': 'text/html; charset=utf-8' }), { html: true });

// ---------- máy chủ ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const pth = decodeURIComponent(url.pathname);
  const qs = Object.fromEntries(url.searchParams);
  if (!pth.startsWith('/api/') && !pth.startsWith('/print/')) {
    const file = path.join(PUBLIC, pth === '/' ? 'index.html' : pth);
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
    fs.readFile(file, (err, buf) => {
      if (err) return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, b2) => e2 ? send(res, 404, 'Not found') : send(res, 200, b2, { 'Content-Type': TYPES['.html'] }));
      send(res, 200, buf, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    });
    return;
  }
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(pth); if (!m) continue;
    try {
      let user = null;
      if (!r.open) {
        user = await userFromReq(req);
        if (!user) return r.html ? send(res, 302, '', { Location: '/' }) : send(res, 401, { error: 'Phiên đăng nhập đã hết — đăng nhập lại' });
        if (user.must_change && !r.allowMustChange) return send(res, 403, { error: 'Cần đổi mật khẩu trước khi làm việc', must_change: true });
      }
      // tình trạng khách hàng tự đồng bộ: trước khi đọc danh sách khách, sau mỗi thao tác ghi
      if (req.method === 'GET' && pth.startsWith('/api/e/customer')) await B.syncStages({ q, one }).catch(e => console.error('syncStages', e.message));   // lỗi đồng bộ không chặn mở danh sách khách
      if (m.groups?.id && !/^\d+$/.test(m.groups.id)) bad('Mã bản ghi không hợp lệ');
      await r.fn(req, res, user, m.groups || {}, qs);
      if (req.method !== 'GET' && user) B.syncStages({ q, one }).catch(e => console.error('syncStages', e.message));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, fields: e.fields });
      console.error(new Date().toISOString(), req.method, pth, e);
      send(res, 500, { error: 'Lỗi máy chủ: ' + e.message });
    }
    return;
  }
  send(res, 404, { error: 'Không có đường dẫn ' + pth });
}

async function start() {
  await tx(db => migrate(db));
  const n = (await one('SELECT count(*) n FROM kd_user')).n;
  if (!n) { console.log('CSDL trống — nạp dữ liệu gốc…'); await require('./seed').seedBase(); }
  await require('./seed').ensureTemplates();
  await B.fixLiquidated({ q, one }).catch(e => console.error('fixLiquidated', e.message));
  await tx(db => B.fixBaseDiscount(db)).catch(e => console.error('fixBaseDiscount', e.message));
  await tx(db => B.loanPayVouchers(db)).catch(e => console.error('loanPayVouchers', e.message));
  await tx(db => B.fillVoucherInfo(db)).catch(e => console.error('fillVoucherInfo', e.message));   // phiếu thu / chi cũ: điền mã căn, khách hàng… theo hợp đồng   // kỳ HĐ vay ghi nhận tay cũ → phiếu chi (1 lần)
  await tx(async db => B.fixRentValue(db, await db.one("SELECT * FROM kd_user WHERE role = 'admin' ORDER BY id LIMIT 1"))).catch(e => console.error('fixRentValue', e.message));
  const srv = http.createServer(handle);
  srv.listen(PORT, HOST, () => console.log(`App Phòng Kinh doanh: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
  const job = async () => { try { await tx(db => B.jobs(db)); await q('DELETE FROM kd_session WHERE expires_at < now()'); } catch (e) { console.error('Việc chạy nền lỗi:', e.message); } };
  if (!process.env.NO_JOBS) { setTimeout(job, 3000); setInterval(job, 2 * 60e3); }
  require('./misa-watch').startMisaWatch();   // MISA_DIR: tự nhập phiếu thu MISA từ thư mục chung
  return srv;
}
if (require.main === module) start().catch(e => { console.error(e); process.exit(1); });
module.exports = { start, suggestPlan, handle };
