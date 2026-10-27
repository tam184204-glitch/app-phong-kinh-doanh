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
const USER_COLS = 'u.id, u.username, u.full_name, u.role, u.title, u.must_change, u.is_trial';
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
  const sid = crypto.randomBytes(32).toString('base64url');
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
async function metaFor(user) {
  const strip = e => ({ ...e, fields: e.fields.filter(f => !f.hide).map(f => ({ ...f })), perm: { r: can(user, e, 'r'), c: can(user, e, 'c'), u: can(user, e, 'u'), d: can(user, e, 'd'), a: can(user, e, 'a'), x: can(user, e, 'x') } });
  const ents = Object.fromEntries(Object.values(M.E).map(e => [e.key, strip(e)]));
  const lk = await C.lookups();
  for (const e of Object.values(ents)) for (const f of [...e.fields, ...(e.acts || []).flatMap(a => a.ask || [])]) if (f.opt) f.o = (lk[f.opt] || []).filter(x => x[2]).map(x => [x[0], x[1]]);
  const viewOk = v => !M.VIEW_ROLES[v] || user.role === 'admin' || M.VIEW_ROLES[v].includes(user.role);
  const menu = M.MENU.map(([no, t, icon, items]) => [no, t, icon, items.map(([id, l, code]) => { const e = id.startsWith('e:') && ents[id.slice(2).split('?')[0]]; return e ? (e.perm.r ? [id, l || e.title, e.icon, e.code] : null) : viewOk(id) ? [id, l, null, code] : null; }).filter(Boolean)]).filter(m => m[3].length);
  const settings = Object.fromEntries((await q("SELECT key, value FROM kd_setting WHERE key IN ('checklist_noxh','checklist_so_hong','checklist_ban_giao','schedule_presets','sla_hours','handover_pay_pct','bravo','bsc')")).map(r => [r.key, r.value]));
  return {
    me: user, roles: M.ROLES, menu, ents, virt: M.VIRT, piiRoles: M.PII_ROLES, settings, alertCat: V.ALERT_CAT, reports: V.REPORTS,
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

// --- dữ liệu chung ---
R('GET', '/api/e/:ent', async (req, res, u, p, qs) => send(res, 200, await C.list(p.ent, u, qs)));
R('GET', '/api/e/:ent/:id', async (req, res, u, p) => send(res, 200, await C.get(p.ent, p.id, u)));
R('POST', '/api/e/:ent', async (req, res, u, p, qs) => { const b = await readJson(req); send(res, 200, await C.create(p.ent, b, u, { check: qs.check === '1' })); });
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
  // ?res=<phiếu đăng ký> → chỉ mẫu hợp với căn của phiếu (dự án / tòa / số phòng ngủ)
  if (qs.all && qs.res) {
    const r = await one('SELECT unit_id FROM kd_reservation WHERE id = $1', [+qs.res]);
    const ts = await q("SELECT code, name, kind, scope, bedrooms FROM kd_template WHERE active AND kind IN ('dang_ky_can','dang_ky_noi_that') ORDER BY id");
    const fit = new Set([...await IO.regTemplates('dang_ky_can', r?.unit_id), ...await IO.regTemplates('dang_ky_noi_that', r?.unit_id)].map(t => t.code));
    const out = new Map();
    for (const t of ts) {
      const key = t.name.replace(/\s*–?\s*hoàn thiện căn hộ \d phòng ngủ$/, '');   // 2PN / 3PN cùng một file → một lựa chọn
      const o = out.get(key); if (!o || (!o.fit && fit.has(t.code))) out.set(key, { code: t.code, kind: t.kind, label: key === t.name ? t.name : key + ' – hoàn thiện căn hộ', fit: fit.has(t.code) });
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
  send(res, 200, await q(`SELECT t.id, ${e.disp} AS label ${extra} FROM ${e.table} t ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ${p.ent === 'unit' ? 't.code' : 't.id DESC'} LIMIT ${qs.id ? 1 : 30}`, params));
});
R('GET', '/api/export/:ent', async (req, res, u, p, qs) => { const x = await IO.exportList(p.ent, u, qs); sendFile(res, x.buf, x.name, MIME['.xlsx']); });
R('POST', '/api/export-rows', async (req, res, u) => {
  const b = await readJson(req);
  if (!['lanh_dao', 'truong_phong', 'admin', 'cong_no', 'ke_toan', 'ho_so', 'cskh'].includes(u.role)) deny();
  await C.audit({ q }, 'view', null, 'xuat_du_lieu', null, null, u, b.title);
  sendFile(res, IO.sheet(String(b.title || 'Bao cao').slice(0, 80), b.cols || [], b.rows || [], { sum: b.sum, note: b.note }), `${safeName(b.file || 'bao-cao')}_${C.today()}.xlsx`, MIME['.xlsx']);
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
  if (g.perm.locked) bad('Hồ sơ đã chốt — không xóa tệp (tải phiên bản mới nếu cần)');
  if (f.uploaded_by !== u.id && !mgr(u)) deny('Chỉ người tải lên hoặc Trưởng phòng được xóa tệp');
  await q('UPDATE kd_file SET deleted_at = now(), deleted_by = $1 WHERE id = $2', [u.id, f.id]);
  await C.audit({ q }, f.ent, f.rec_id, 'xoa_tep', null, null, u, f.name, f.is_demo);
  send(res, 200, { ok: true });
});

// --- màn tổng hợp ---
R('GET', '/api/dashboard', async (req, res, u, p, qs) => send(res, 200, await V.dashboard({ q, one }, u, qs)));
R('GET', '/api/drill/:key', async (req, res, u, p, qs) => send(res, 200, await V.drill({ q, one }, u, decodeURIComponent(p.key), qs)));
R('GET', '/api/alerts', async (req, res, u, p, qs) => send(res, 200, await V.alerts({ q, one }, u, { all: qs.all === '1' && (mgr(u)), project: qs.project })));
R('GET', '/api/approvals', async (req, res, u) => send(res, 200, await V.approvals({ q, one }, u)));
R('GET', '/api/board', async (req, res, u, p, qs) => send(res, 200, await V.board({ q, one }, u, qs)));
R('GET', '/api/payouts', async (req, res, u, p, qs) => send(res, 200, await V.payouts({ q, one }, u, qs)));
R('GET', '/api/price-sheet/:id', async (req, res, u, p) => send(res, 200, await V.priceSheet({ q, one }, u, p.id)));
R('GET', '/api/unit360/:id', async (req, res, u, p) => send(res, 200, await V.unit360({ q, one }, u, p.id)));
R('GET', '/api/customer360/:id', async (req, res, u, p) => send(res, 200, await V.customer360({ q, one }, u, p.id)));
R('GET', '/api/search', async (req, res, u, p, qs) => send(res, 200, await V.search({ q, one }, u, qs.q)));
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
  const { month } = await readJson(req); const m = C.isoMonth(month || '') || bad('Chọn tháng kế hoạch');
  send(res, 200, await tx(db => suggestPlan(db, m, u)));
});
async function suggestPlan(db, m, u, demo) {
  const end = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).toISOString().slice(0, 10), start = m + '-01';
  const cs = await V.signedContracts(db, {}, "AND c.status = 'da_ky'");
  const have = new Set((await db.q("SELECT contract_id FROM kd_collect_plan WHERE month = $1 AND status <> 'thay_the'", [m])).map(r => r.contract_id));
  const calls = await db.q('SELECT DISTINCT ON (contract_id) contract_id, promise_amount, promise_on FROM kd_debt_call WHERE promise_on BETWEEN $1 AND $2 ORDER BY contract_id, at DESC', [start, end]);
  const pm = new Map(calls.map(c => [c.contract_id, c]));
  let n = 0; const skipped = [];
  for (const c of cs) {
    if (have.has(c.id) || c.d.left <= 0) continue;
    const dueBy = c.d.inst.filter(i => i.rem > 0 && i.due_on <= end).reduce((s, i) => s + i.rem, 0);
    const pr = pm.get(c.id);
    if (!dueBy && !pr) continue;
    const expected = Math.min(c.d.left, pr ? pr.promise_amount : dueBy);
    const firstDue = c.d.inst.find(i => i.rem > 0 && i.due_on >= start && i.due_on <= end)?.due_on;
    const expected_on = pr ? pr.promise_on : firstDue || (C.today() > start ? C.today().slice(0, 7) === m ? C.today() : end : start);
    try {
      await C.create('collect_plan', { month: m, contract_id: c.id, expected, expected_on: expected_on > end ? end : expected_on < start ? start : expected_on, basis: pr ? 'cam_ket' : 'lich_hd',
        basis_note: pr ? `Cam kết ${C.fmtMoney(pr.promise_amount)} ngày ${C.dmy(pr.promise_on)}` : c.d.overdue > 0 ? `Nợ quá hạn ${C.fmtMoney(c.d.overdue)} (${c.d.overdue_days} ngày)` : `Kỳ đến hạn ${C.dmy(firstDue)}`,
        ability: pr ? 'cao' : c.d.overdue_days > 60 ? 'thap' : 'vua', owner_id: u.role === 'cong_no' ? u.id : c.owner_id || u.id }, u, { db, system: true, demo });
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
R('GET', '/api/mau4', async (req, res, u, p, qs) => send(res, 200, await M4.data(u, qs)));
R('GET', '/api/mau4/xlsx', async (req, res, u, p, qs) => sendFile(res, await M4.xlsx(u, qs), `Mau4_ho_so_mua_NOXH_${C.today()}.xlsx`, MIME['.xlsx']));
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
      if (req.method === 'GET' && pth.startsWith('/api/e/customer')) await B.syncStages({ q, one });
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
  const srv = http.createServer(handle);
  srv.listen(PORT, HOST, () => console.log(`App Phòng Kinh doanh: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
  const job = async () => { try { await tx(db => B.jobs(db)); await q('DELETE FROM kd_session WHERE expires_at < now()'); } catch (e) { console.error('Việc chạy nền lỗi:', e.message); } };
  if (!process.env.NO_JOBS) { setTimeout(job, 3000); setInterval(job, 2 * 60e3); }
  return srv;
}
if (require.main === module) start().catch(e => { console.error(e); process.exit(1); });
module.exports = { start, suggestPlan, handle };
