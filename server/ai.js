// Trợ lý AI tra cứu (Claude) — hỏi bằng tiếng Việt, AI tự gọi các công cụ tra cứu của app.
// Mỗi công cụ gọi đúng hàm mà màn hình đang dùng, với TÀI KHOẢN NGƯỜI HỎI: AI chỉ thấy những gì người đó được xem
// (phân quyền, phạm vi «của tôi», che dữ liệu định danh). AI chỉ đọc — không tạo / sửa / duyệt gì.
const Anthropic = require('@anthropic-ai/sdk').default;
const crypto = require('crypto');
const { q, one } = require('./db');
const M = require('./meta');
const C = require('./core');
const V = require('./views');
const { bad, HttpError } = C;

const MODEL = 'claude-opus-5-5';
const MAX_ROUNDS = 12;            // số lượt gọi công cụ tối đa cho một câu hỏi
const MAX_TURNS = 30;             // số câu hỏi tối đa trong một cuộc trò chuyện
const RESULT_MAX = 40000;         // ký tự tối đa của một kết quả công cụ gửi cho AI
let client = null;
const enabled = () => !!process.env.ANTHROPIC_API_KEY;
const getClient = () => (client ||= new Anthropic());

// ---------- danh mục dữ liệu (đưa vào lời dặn hệ thống — cố định, dùng bộ nhớ đệm) ----------
const SKIP_T = new Set(['file', 'check', 'sched']);
const catalog = () => Object.values(M.E).map(e => {
  const fs = e.fields.filter(f => !f.hide && !f.pii && !SKIP_T.has(f.t)).map(f => {
    let s = `${f.k}(${f.l}`;
    if (f.t === 'sel' && f.o) s += ': ' + f.o.map(o => `${o[0]}=${o[1]}`).join(', ');
    else if (f.t === 'ref') s += ' → ' + f.ref;
    return s + ')';
  });
  return `■ ${e.key} — ${e.title}${e.code ? ` [${e.code}]` : ''}, phân hệ ${e.mod}\n  ${fs.join('; ')}`;
}).join('\n');

const SYSTEM = `Bạn là Trợ lý AI tra cứu của App Quản lý Phòng Kinh doanh — Cát Tường Group (dự án CTS Cát Tường Smart City, TNS Thống Nhất Smart City và các dự án khác).
Người hỏi là nhân viên / lãnh đạo Phòng Kinh doanh. Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào số liệu.

NGUYÊN TẮC
- Chỉ dùng số liệu lấy từ công cụ. Không bịa mã căn, tên khách, số tiền, ngày tháng. Không tìm thấy thì nói rõ là không có trong dữ liệu.
- Công cụ chạy bằng quyền của người hỏi. Công cụ báo «không có quyền» thì nói người hỏi không được xem phần đó — không tìm cách lách.
- Bạn chỉ tra cứu. Người hỏi muốn tạo / sửa / duyệt thì hướng dẫn họ thao tác ở màn hình nào (theo phân hệ và mã mẫu biểu).
- Số thực thu lấy từ Bravo (kế toán xác nhận); kế hoạch thu, cam kết, tình trạng nghiệp vụ là dữ liệu App. Khi nêu số thu tiền, nói rõ nguồn khi cần.
- Câu hỏi mơ hồ (vd «căn 0603» có ở nhiều tòa) thì tra trước, liệt kê các khả năng rồi hỏi lại.
- Gọi nhiều công cụ cùng lúc khi các tra cứu độc lập với nhau.

TRÌNH BÀY
- Tiền: dấu chấm phân cách nghìn + «đ» (1.155.560.000 đ), số lớn có thể ghi thêm «≈ 1,16 tỷ». Ngày: dd/mm/yyyy.
- Danh sách nhiều dòng thì dùng bảng markdown (tối đa ~30 dòng, nhiều hơn thì nêu tổng + gợi ý mở màn hình tương ứng).
- Gắn liên kết để người hỏi bấm mở hồ sơ, đúng các dạng sau (id lấy từ kết quả công cụ):
  căn hộ: [TNS-G-0603](#/v/unit360?id=55) · khách hàng: [Nguyễn Văn A](#/v/cust360?id=115) · bản ghi khác: [HĐMB-…](#open/contract/82) (dạng #open/<loại dữ liệu>/<id>).
- Không dùng tiêu đề lớn; câu trả lời là tin nhắn trong khung trò chuyện.

DANH MỤC DỮ LIỆU (loại dữ liệu — tên, mã mẫu biểu; các trường: mã(tên: giá trị=nhãn …))
${catalog()}`;

// ---------- công cụ ----------
const P_FILTER = {
  project: { type: 'integer', description: 'id dự án (xem danh_muc_du_an)' },
  building: { type: 'integer', description: 'id tòa / khu' },
};
const P_PERIOD = {
  from: { type: 'string', description: 'kỳ từ tháng, YYYY-MM (mặc định tháng 1 năm nay)' },
  to: { type: 'string', description: 'kỳ đến tháng, YYYY-MM (mặc định tháng hiện tại)' },
};
const obj = (props, required = []) => ({ type: 'object', properties: props, required });
const TOOLS = [
  { name: 'tim_kiem', description: 'Tìm nhanh toàn hệ thống theo mã căn, họ tên / mã khách hàng, số điện thoại, số hợp đồng, mã phiếu. Trả về loại + id để tra tiếp.',
    input_schema: obj({ q: { type: 'string', description: 'từ khóa, tối thiểu 2 ký tự' } }, ['q']) },
  { name: 'ho_so_can_ho', description: 'Hồ sơ 360° của một căn: thông tin căn, giữ chỗ, hợp đồng, công nợ, thu tiền Bravo, phụ lục, kế hoạch thu, nhắc nợ, NOXH, bàn giao, tồn tại, sổ hồng, CSKH, hoa hồng, dòng thời gian.',
    input_schema: obj({ code: { type: 'string', description: 'mã căn đầy đủ, vd TNS-G-0603' }, id: { type: 'integer', description: 'id căn (nếu đã biết)' } }) },
  { name: 'ho_so_khach_hang', description: 'Hồ sơ 360° của một khách hàng: thông tin, các căn / giao dịch / hợp đồng, lịch sử liên hệ.',
    input_schema: obj({ id: { type: 'integer', description: 'id khách hàng (lấy từ tim_kiem)' } }, ['id']) },
  { name: 'danh_sach', description: 'Lọc danh sách một loại dữ liệu (xem DANH MỤC DỮ LIỆU). Trả về tổng số, số lượng theo trạng thái và tối đa `limit` dòng.',
    input_schema: obj({
      ent: { type: 'string', enum: Object.keys(M.E), description: 'loại dữ liệu' },
      q: { type: 'string', description: 'từ khóa tìm trong mã, tên, mã căn, khách hàng…' },
      status: { type: 'string', description: 'một hoặc nhiều mã trạng thái, cách nhau dấu phẩy' },
      filters: { type: 'object', description: 'lọc đúng giá trị theo trường, vd {"kind":"hdmb","owner_id":5}', additionalProperties: { type: ['string', 'number', 'boolean'] } },
      sort: { type: 'string', description: 'tên trường sắp xếp, thêm "-" ở đầu để giảm dần, vd "-value"' },
      limit: { type: 'integer', description: 'số dòng trả về, mặc định 30, tối đa 100' },
      ...P_FILTER,
    }, ['ent']) },
  { name: 'so_cong_no', description: 'Sổ công nợ chi tiết theo hợp đồng đã ký (CN-01): phải thu, đã thu (Bravo), còn phải thu, đến hạn, quá hạn, số ngày quá hạn, đến hạn 7 ngày, lần gọi nhắc nợ gần nhất, kế hoạch thu tháng này, nhân viên phụ trách.',
    input_schema: obj({
      q: { type: 'string', description: 'lọc theo mã căn / tên khách / số HĐ' },
      owner: { type: 'integer', description: 'id nhân viên phụ trách' },
      chi_qua_han: { type: 'boolean', description: 'chỉ lấy hợp đồng có nợ quá hạn' },
      sort: { type: 'string', enum: ['left', 'overdue', 'overdue_days', 'due7', 'paid_pct'], description: 'sắp xếp giảm dần theo cột' },
      limit: { type: 'integer', description: 'mặc định 30, tối đa 100' },
      ...P_FILTER,
    }) },
  { name: 'tong_quan', description: 'Số liệu Dashboard: doanh số & chỉ tiêu, giỏ hàng theo trạng thái / tòa, công nợ – dòng thu, tiến độ hợp đồng – bàn giao, tồn đọng.',
    input_schema: obj({ ...P_FILTER, ...P_PERIOD }) },
  { name: 'chi_tiet_chi_tieu', description: 'Danh sách chi tiết tạo nên một chỉ tiêu Dashboard. key: units:all|sold|hold|<mã trạng thái căn>, building:<id tòa>, revenue[:YYYY-MM], collected, debt:all|due|overdue|due7, plan, contracts:<trạng thái>, noxh, handover:<trạng thái>, alerts.',
    input_schema: obj({ key: { type: 'string' }, ...P_FILTER, ...P_PERIOD }, ['key']) },
  { name: 'canh_bao', description: 'Cảnh báo tồn đọng – nhắc việc: hồ sơ quá hạn, HĐ chưa ký, khách chậm thanh toán, giữ chỗ hết hạn, căn chưa bàn giao, khiếu nại quá hạn… (Trưởng phòng / Lãnh đạo thấy toàn phòng).',
    input_schema: obj({ project: P_FILTER.project }) },
  { name: 'bao_cao', description: 'Báo cáo quản trị (Trưởng phòng / Lãnh đạo; KPI thì mọi người): sales=bán hàng theo dự án, revenue=doanh thu – công nợ, cashflow=dự kiến dòng tiền (kế hoạch – thực thu – chênh lệch), docs=hồ sơ – hợp đồng, handover=bàn giao – cấp sổ, tickets=khiếu nại – tồn đọng, kpi=KPI nhân viên.',
    input_schema: obj({ kind: { type: 'string', enum: Object.keys(V.REPORTS) }, group: { type: 'string', description: 'chỉ với sales: building | project | owner | agent' }, ...P_FILTER, ...P_PERIOD }, ['kind']) },
  { name: 'danh_muc_du_an', description: 'Danh sách dự án, tòa / khu (id, mã, tên) và nhân viên (id, họ tên, vai trò) — dùng để đổi tên sang id khi lọc.',
    input_schema: obj({}) },
];

// rút gọn một dòng dữ liệu: bỏ trường rỗng / kỹ thuật, ref → nhãn, mã lựa chọn → nhãn
function compactRow(ent, r) {
  const F = C.F[ent] || {}, out = {};
  for (const [k, v] of Object.entries(r)) {
    if (v == null || v === '' || k.endsWith('__l') || ['is_demo', 'created_by', 'updated_by', 'updated_at'].includes(k)) continue;
    const f = F[k];
    if (f && SKIP_T.has(f.t)) continue;
    if (f && (f.t === 'ref' || f.t === 'user')) { out[k] = r[k + '__l'] ? `${r[k + '__l']} (id ${v})` : v; continue; }
    if (f && f.t === 'sel' && f.o) { out[k] = f.o.find(o => o[0] === v)?.[1] || v; continue; }
    out[k] = typeof v === 'string' && v.length > 400 ? v.slice(0, 400) + '…' : v;
  }
  return out;
}
const clampLimit = n => Math.min(Math.max(+n || 30, 1), 100);
const db = { q, one };

async function runTool(name, x, user) {
  switch (name) {
    case 'tim_kiem': return V.search(db, user, x.q);
    case 'ho_so_can_ho': {
      let id = x.id;
      if (!id && x.code) {
        const u = await one('SELECT id FROM kd_unit WHERE upper(code) = upper($1)', [String(x.code).trim()]);
        if (!u) { const near = await q('SELECT id, code FROM kd_unit WHERE code ILIKE $1 ORDER BY code LIMIT 10', [`%${String(x.code).trim()}%`]); return { error: 'Không có mã căn này', gan_dung: near }; }
        id = u.id;
      }
      if (!id) bad('Cần mã căn hoặc id căn');
      return V.unit360(db, user, id);
    }
    case 'ho_so_khach_hang': return V.customer360(db, user, x.id);
    case 'danh_sach': {
      if (!M.E[x.ent]) bad('Loại dữ liệu không hợp lệ');
      const qs = { limit: clampLimit(x.limit) };
      for (const k of ['q', 'status', 'sort', 'project', 'building']) if (x[k] != null && x[k] !== '') qs[k] = String(x[k]);
      for (const [k, v] of Object.entries(x.filters || {})) qs['f_' + k] = String(v);
      const r = await C.list(x.ent, user, qs);
      const st = C.F[x.ent].status?.o;
      return { total: r.total, theo_trang_thai: r.counts && Object.fromEntries(Object.entries(r.counts).map(([k, n]) => [st?.find(o => o[0] === k)?.[1] || k, n])),
        so_dong_tra_ve: r.rows.length, rows: r.rows.map(row => compactRow(x.ent, row)) };
    }
    case 'so_cong_no': {
      const d = await V.ledger(db, user, { q: x.q, owner: x.owner, project: x.project, building: x.building });
      let rows = d.rows || d;
      if (x.chi_qua_han) rows = rows.filter(r => r.overdue > 0);
      if (x.sort) rows = [...rows].sort((a, b) => (+b[x.sort] || 0) - (+a[x.sort] || 0));
      const sum = k => rows.reduce((s, r) => s + (+r[k] || 0), 0);
      return { so_hop_dong: rows.length, tong: { phai_thu: sum('total'), da_thu: sum('paid'), con_phai_thu: sum('left'), qua_han: sum('overdue'), den_han_7_ngay: sum('due7') },
        bravo_chot: d.bravo_sync ?? null, rows: rows.slice(0, clampLimit(x.limit)) };
    }
    case 'tong_quan': return V.dashboard(db, user, x);
    case 'chi_tiet_chi_tieu': { const d = await V.drill(db, user, x.key, x); return { ...d, total: d.rows?.length, rows: d.rows?.slice(0, 100) }; }
    case 'canh_bao': return V.alerts(db, user, { all: ['truong_phong', 'lanh_dao', 'admin'].includes(user.role), project: x.project });
    case 'bao_cao': return V.report(db, user, x.kind, x);
    case 'danh_muc_du_an': return {
      du_an: await q('SELECT id, code, name FROM kd_project ORDER BY code'),
      toa: await q('SELECT b.id, b.code, b.name, p.code du_an FROM kd_building b JOIN kd_project p ON p.id = b.project_id ORDER BY p.code, b.code'),
      nhan_vien: (await q('SELECT id, full_name, role FROM kd_user WHERE active ORDER BY full_name')).map(u => ({ ...u, role: M.ROLES.find(r => r[0] === u.role)?.[1] || u.role })),
    };
    default: bad('Công cụ không tồn tại: ' + name);
  }
}
const toolLabel = (name, x) => ({
  tim_kiem: `Tìm «${x.q}»`, ho_so_can_ho: `Hồ sơ căn ${x.code || '#' + x.id}`, ho_so_khach_hang: `Hồ sơ khách hàng #${x.id}`,
  danh_sach: `Danh sách ${M.E[x.ent]?.title || x.ent}${x.q ? ` «${x.q}»` : ''}`, so_cong_no: 'Sổ công nợ', tong_quan: 'Số liệu Dashboard',
  chi_tiet_chi_tieu: `Chi tiết chỉ tiêu ${x.key}`, canh_bao: 'Cảnh báo tồn đọng', bao_cao: V.REPORTS[x.kind] || 'Báo cáo', danh_muc_du_an: 'Danh mục dự án / tòa / nhân viên',
}[name] || name);

async function execTool(b, user) {
  try {
    const r = await runTool(b.name, b.input || {}, user);
    let s = JSON.stringify(r ?? null);
    if (s.length > RESULT_MAX) s = s.slice(0, RESULT_MAX) + ' …[kết quả quá dài, đã cắt — hãy lọc hẹp hơn]';
    return { type: 'tool_result', tool_use_id: b.id, content: s };
  } catch (e) {
    if (!(e instanceof HttpError)) console.error('AI công cụ lỗi:', b.name, e);
    const msg = e instanceof HttpError ? (e.status === 403 ? 'Không có quyền: ' : '') + e.message : 'Lỗi tra cứu: ' + e.message;
    return { type: 'tool_result', tool_use_id: b.id, content: msg, is_error: true };
  }
}

// ---------- hội thoại (giữ trên máy chủ, nguyên văn, chỉ nối thêm) ----------
const CONV = new Map();   // id → { user_id, messages, turns, at }
setInterval(() => { const lim = Date.now() - 3 * 3600e3; for (const [k, c] of CONV) if (c.at < lim) CONV.delete(k); }, 10 * 60e3).unref?.();   // ?. — bản demo chạy trong trình duyệt không có unref

async function ask(user, { conv, text }) {
  if (!enabled()) bad('Chưa cấu hình ANTHROPIC_API_KEY trong file .env — Trợ lý AI đang tắt.');
  text = String(text || '').trim();
  if (!text) bad('Nhập câu hỏi');
  if (text.length > 4000) bad('Câu hỏi quá dài (tối đa 4.000 ký tự)');
  let c = conv && CONV.get(conv);
  if (c && c.user_id !== user.id) c = null;
  if (!c) { conv = crypto.randomBytes(12).toString('base64url'); c = { user_id: user.id, messages: [], turns: 0 }; CONV.set(conv, c); }
  if (c.turns >= MAX_TURNS) bad('Cuộc trò chuyện đã dài — bấm «Cuộc trò chuyện mới» để hỏi tiếp');
  c.at = Date.now(); c.turns++;
  // hôm nay + người hỏi đi kèm câu hỏi (không đưa vào lời dặn hệ thống để giữ bộ nhớ đệm)
  const ctx = `[Hôm nay ${C.dmy(C.today())} · người hỏi: ${user.full_name} — ${M.ROLES.find(r => r[0] === user.role)?.[1] || user.role}, id ${user.id}]`;
  const msgs = [...c.messages, { role: 'user', content: `${ctx}\n${text}` }];
  const steps = [];
  let msg;
  for (let round = 0; ; round++) {
    try {
      msg = await getClient().beta.messages.create({
        model: MODEL, max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: SYSTEM, tools: TOOLS, messages: msgs,
      });
    } catch (e) {
      c.turns--;
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(502, 'Khóa ANTHROPIC_API_KEY không hợp lệ — báo Quản trị hệ thống');
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(503, 'AI đang quá tải hoặc hết hạn mức — thử lại sau ít phút');
      if (e instanceof Anthropic.APIConnectionError) throw new HttpError(503, 'Không kết nối được tới máy chủ AI — kiểm tra mạng');
      if (e instanceof Anthropic.APIError) throw new HttpError(502, `AI báo lỗi (${e.status ?? '?'}): ${e.message}`);
      throw e;
    }
    msgs.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'refusal') break;
    if (msg.stop_reason === 'pause_turn') continue;
    const uses = msg.content.filter(b => b.type === 'tool_use');
    if (msg.stop_reason !== 'tool_use' || !uses.length) break;
    if (round >= MAX_ROUNDS) { msgs.pop(); msg = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Câu hỏi cần tra cứu quá nhiều bước. Hãy hỏi cụ thể hơn (theo dự án, tòa, mã căn hoặc khách hàng).' }] }; msgs.push({ role: 'assistant', content: msg.content }); break; }
    for (const b of uses) steps.push(toolLabel(b.name, b.input || {}));
    msgs.push({ role: 'user', content: await Promise.all(uses.map(b => execTool(b, user))) });
  }
  c.messages = msgs;
  let answer = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (msg.stop_reason === 'refusal') answer = 'AI không xử lý được yêu cầu này. Hãy diễn đạt lại câu hỏi.';
  else if (msg.stop_reason === 'max_tokens') answer += '\n\n_(Câu trả lời bị cắt vì quá dài — hãy hỏi hẹp hơn.)_';
  await C.audit({ q }, 'ai', null, 'hoi_ai', null, null, user, text.slice(0, 500));
  return { conv, answer: answer || '(không có câu trả lời)', steps, usage: { in: msg.usage?.input_tokens, cache: msg.usage?.cache_read_input_tokens, out: msg.usage?.output_tokens } };
}

module.exports = { ask, enabled, TOOLS, runTool, SYSTEM };
