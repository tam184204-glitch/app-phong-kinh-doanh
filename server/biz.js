// Luật nghiệp vụ riêng từng mẫu biểu (gắn vào core qua hooks).
// Nguyên tắc: một mã căn là một hồ sơ xuyên suốt — trạng thái căn luôn tính lại từ giao dịch, hợp đồng, bàn giao;
// công nợ tính từ lịch thanh toán hiệu lực + chứng từ thu (Bravo), không ai sửa tay số thực thu.
const C = require('./core');
const { ACTIVE_RES } = require('./schema');
const { PROSPECT_ST } = require('./meta');
const { bad, raw, sys, create, setting, today, addDays, dayDiff, dmy, fmtMoney, labelOf } = C;

// ======================= CÔNG NỢ =======================
// Phân bổ thu: chứng từ chỉ định kỳ thì vào kỳ đó trước, phần còn lại vào kỳ đến hạn sớm nhất (FIFO).
async function debtOf(db, ids) {
  ids = [...new Set(ids.filter(Boolean).map(Number))];
  const M = new Map(ids.map(id => [id, { total: 0, paid: 0, left: 0, due: 0, overdue: 0, due7: 0, credit: 0, next: null, overdue_since: null, overdue_days: 0, last_receipt: null, inst: [] }]));
  if (!ids.length) return M;
  const t = today(), t7 = addDays(t, 7);
  for (const i of await db.q('SELECT id, contract_id, seq, name, due_on, pct, amount, src FROM kd_installment WHERE active AND contract_id = ANY($1) ORDER BY contract_id, due_on, seq', [ids]))
    M.get(i.contract_id).inst.push({ ...i, paid: 0 });
  const pool = new Map();
  for (const r of await db.q("SELECT contract_id, installment_id, amount, voucher_date FROM kd_receipt WHERE status = 'hop_le' AND contract_id = ANY($1) ORDER BY voucher_date, id", [ids])) {
    const m = M.get(r.contract_id); m.paid += r.amount; m.last_receipt = r.voucher_date;
    let rest = r.amount;
    const target = r.installment_id && m.inst.find(i => i.id === r.installment_id);
    if (target) { const take = Math.min(rest, target.amount - target.paid); target.paid += take; rest -= take; }
    pool.set(r.contract_id, (pool.get(r.contract_id) || 0) + rest);
  }
  for (const [cid, m] of M) {
    let rest = pool.get(cid) || 0;
    for (const i of m.inst) { const take = Math.min(rest, i.amount - i.paid); if (take > 0) { i.paid += take; rest -= take; } }
    m.credit = rest;
    for (const i of m.inst) {
      m.total += i.amount; const rem = i.amount - i.paid; i.rem = rem;
      i.st = rem <= 0 ? 'da_thu' : i.due_on < t ? 'qua_han' : i.due_on === t ? 'den_han' : i.due_on <= t7 ? 'sap_den_han' : i.paid > 0 ? 'mot_phan' : 'chua_den_han';
      if (rem > 0) {
        if (i.due_on <= t) m.due += rem;
        if (i.due_on < t) { m.overdue += rem; if (!m.overdue_since) m.overdue_since = i.due_on; }
        if (i.due_on >= t && i.due_on <= t7) m.due7 += rem;
        if (!m.next) m.next = { due_on: i.due_on, rem, name: i.name };
      }
    }
    m.left = Math.max(0, m.total - m.paid);
    m.paid_pct = m.total ? Math.round(m.paid / m.total * 1000) / 10 : 0;
    m.overdue_days = m.overdue_since ? dayDiff(m.overdue_since, t) : 0;
  }
  return M;
}
const PAY_ST = { da_thu: 'Đã thu đủ', qua_han: 'Quá hạn', den_han: 'Đến hạn hôm nay', sap_den_han: 'Sắp đến hạn (≤7 ngày)', mot_phan: 'Thu một phần', chua_den_han: 'Chưa đến hạn' };

// ======================= TRẠNG THÁI CĂN =======================
async function recomputeUnit(db, unitId, user) {
  const u = unitId && await raw(db, 'unit', unitId); if (!u) return;
  let st;
  if (u.lock) st = u.lock;
  else if (!u.activated) st = 'chua_mo_ban';
  else {
    const c = await db.one("SELECT id, status FROM kd_contract WHERE unit_id = $1 AND kind IN ('hdmb','thue','thue_mua') AND status NOT IN ('huy','thanh_ly')", [unitId]);
    const r = await db.one(`SELECT status, deposit FROM kd_reservation WHERE unit_id = $1 AND status IN ${ACTIVE_RES}`, [unitId]);
    const h = await db.one('SELECT status FROM kd_handover WHERE unit_id = $1', [unitId]);
    if (c && h && ['da_ban_giao', 'hoan_tat'].includes(h.status)) st = 'da_ban_giao';
    else if (c?.status === 'da_ky') st = 'da_ky_hd';
    else if (c) st = r?.deposit > 0 || r?.status === 'da_coc' ? 'da_coc' : 'giu_cho';
    else if (r) st = r.status === 'da_coc' || r.deposit > 0 ? 'da_coc' : 'giu_cho';
    else st = 'con_ban';
  }
  if (st !== u.status) await sys(db, 'unit', u.id, { status: st }, user, 'cap_nhat_trang_thai');
}

// ======================= GIÁ =======================
async function pricing(db, unit, on = today()) {
  const b = await db.one('SELECT code FROM kd_building WHERE id = $1', [unit.building_id]);
  const pols = await db.q("SELECT * FROM kd_price_policy WHERE status = 'phat_hanh' AND project_id = $1 AND start_on <= $2 AND end_on >= $2 ORDER BY start_on DESC, version DESC", [unit.project_id, on]);
  const pol = pols.find(p => { const g = String(p.unit_group || '*').split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean); return g.includes('*') || g.includes(String(b?.code).toUpperCase()); });
  if (!pol) return { policy: null, price: unit.total_price || null };
  if (pol.mode === 'don_gia') { const base = Math.round(pol.unit_price * unit.area_tt); return { policy: pol, price: base + Math.round(base * (pol.maint_pct ?? 2) / 100) }; }
  return { policy: pol, price: unit.total_price || unit.list_price || null };
}

// ======================= LỊCH THANH TOÁN =======================
async function normSchedule(db, rows, value, label = 'Lịch thanh toán') {
  if (!Array.isArray(rows) || !rows.length) bad(`${label}: chưa có kỳ thu nào`);
  const F = C.F.installment, out = [];
  for (const [i, r] of rows.entries()) {
    const due_on = await C.normField(F.due_on, r.due_on, db, `${label} kỳ ${i + 1} — ngày đến hạn`);
    let amount = await C.normField(F.amount, r.amount, db, `${label} kỳ ${i + 1} — số tiền`);
    const pct = r.pct === '' || r.pct == null ? null : await C.normField(F.pct, r.pct, db, `${label} kỳ ${i + 1} — tỷ lệ`);
    if (amount == null && pct != null) amount = Math.round(value * pct / 100);
    if (!due_on || !amount) bad(`${label} kỳ ${i + 1}: cần ngày đến hạn và số tiền (hoặc tỷ lệ)`);
    out.push({ seq: i + 1, name: String(r.name || `Đợt ${i + 1}`).trim(), due_on, pct, amount });
  }
  for (let i = 1; i < out.length; i++) if (out[i].due_on < out[i - 1].due_on) bad(`${label}: ngày đến hạn kỳ ${i + 1} sớm hơn kỳ ${i}`);
  const sum = out.reduce((s, r) => s + r.amount, 0);
  // làm tròn: dồn chênh lệch nhỏ (≤ 1.000đ / kỳ) vào kỳ cuối
  if (Math.abs(sum - value) <= 1000 * out.length && sum !== value) { out[out.length - 1].amount += value - sum; }
  else if (sum !== value) bad(`${label}: tổng các kỳ ${fmtMoney(sum)} không khớp nghĩa vụ phải thu ${fmtMoney(value)} (lệch ${fmtMoney(sum - value)})`);
  return out;
}
async function writeSchedule(db, contractId, rows, src, user, demo) {
  await db.q('UPDATE kd_installment SET active = false, updated_at = now(), updated_by = $2 WHERE contract_id = $1 AND active', [contractId, user?.id ?? null]);
  for (const r of rows)
    await db.q('INSERT INTO kd_installment (contract_id, seq, name, due_on, pct, amount, src, active, created_by, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9)',
      [contractId, r.seq, r.name, r.due_on, r.pct, r.amount, src, user?.id ?? null, !!demo]);
  await C.audit(db, 'contract', contractId, 'lich_thanh_toan', null, { lich: rows }, user, `${rows.length} kỳ · ${src === 'phu_luc' ? 'theo phụ lục' : 'theo hợp đồng'}`, demo);
}

// ======================= HOA HỒNG =======================
async function refreshCommission(db, contractId, user, demo) {
  const c = await raw(db, 'contract', contractId); if (!c) return;
  const r = c.reservation_id && await raw(db, 'reservation', c.reservation_id);
  const agentId = r?.agent_id;
  let row = await db.one("SELECT * FROM kd_commission WHERE contract_id = $1 AND status <> 'huy'", [contractId]);
  if (['huy', 'thanh_ly'].includes(c.status)) {
    if (row) await sys(db, 'commission', row.id, { status: row.status === 'da_chi' ? 'thu_hoi' : 'huy' }, user, 'tt:dieu_chinh', 'Giao dịch bị hủy / thanh lý');
    return;
  }
  if (!agentId) return;
  if (!row) {
    const u = await raw(db, 'unit', c.unit_id);
    const alloc = await db.one("SELECT policy_id FROM kd_agent_alloc WHERE agent_id = $1 AND project_id = $2 AND policy_id IS NOT NULL AND from_on <= $3 AND to_on >= $3 ORDER BY from_on DESC LIMIT 1", [agentId, u.project_id, r.reg_date]);
    const pol = alloc?.policy_id || (await db.one('SELECT id FROM kd_commission_policy WHERE (from_on IS NULL OR from_on <= $1) AND (to_on IS NULL OR to_on >= $1) ORDER BY id DESC LIMIT 1', [r.reg_date]))?.id;
    if (!pol) return;
    row = (await create('commission', { agent_id: agentId, contract_id: c.id, policy_id: pol }, user || C.SYS, { db, system: true, demo: demo ?? c.is_demo })).row;
  }
  if (!['du_kien', 'nhap'].includes(row.status)) return;
  const pol = await raw(db, 'commission_policy', row.policy_id);
  const d = (await debtOf(db, [c.id])).get(c.id);
  const base = c.value, amount = Math.round(base * (pol.rate || 0) / 100) + (pol.fixed || 0);
  const condC = c.status === 'da_ky', condP = d.total > 0 && d.paid_pct >= (pol.pay_pct ?? 0);
  const st = condC && condP ? 'nhap' : 'du_kien';
  await sys(db, 'commission', row.id, { base, amount, cond_contract: condC, cond_pay: condP, status: st }, user, 'cap_nhat_dieu_kien');
}

// ======================= BÀN GIAO =======================
async function handoverCond(db, unitId) {
  const c = await db.one("SELECT * FROM kd_contract WHERE unit_id = $1 AND kind IN ('hdmb','thue_mua') AND status NOT IN ('huy','thanh_ly') ORDER BY id DESC LIMIT 1", [unitId]);
  const pct = (await setting('handover_pay_pct', db)) ?? 95;
  const d = c ? (await debtOf(db, [c.id])).get(c.id) : null;
  return { contract: c, cond_contract: c?.status === 'da_ky', cond_pay: !!d && d.total > 0 && d.paid_pct >= pct && d.overdue === 0, debt: d, pct };
}
const isReq = n => /bắt buộc/i.test(n);
async function defaultList(db, key, by) {
  const v = await setting(key, db);
  const arr = Array.isArray(v) ? v : (v?.[by] || v?._all || []);
  return arr.map(n => ({ n, st: '', note: '' }));
}

// ======================= HỒ SƠ NOXH / GIAO DỊCH: tiến trình =======================
async function stageOf(db, rows) {
  const ids = rows.map(r => r.id); if (!ids.length) return;
  const nx = new Map((await db.q('SELECT DISTINCT ON (reservation_id) reservation_id, status, result FROM kd_noxh_check WHERE reservation_id = ANY($1) ORDER BY reservation_id, id DESC', [ids])).map(r => [r.reservation_id, r]));
  const ct = new Map((await db.q("SELECT reservation_id, status FROM kd_contract WHERE reservation_id = ANY($1) AND kind <> 'hoan_thien'", [ids])).map(r => [r.reservation_id, r]));
  const noxhUnits = new Set((await db.q("SELECT u.id FROM kd_unit u JOIN kd_project p ON p.id = u.project_id WHERE p.kind = 'noxh' AND u.id = ANY($1)", [rows.map(r => r.unit_id)])).map(r => r.id));
  for (const r of rows) {
    const n = nx.get(r.id), c = ct.get(r.id);
    r.stage = { nhap: 'Đăng ký', cho_duyet: 'Chờ duyệt giữ chỗ', huy: 'Đã hủy', het_han: 'Hết hạn', tu_choi: 'Bị từ chối' }[r.status]
      || (r.status === 'chuyen_hd' ? (c?.status === 'da_ky' ? 'Đã ký hợp đồng' : c?.status === 'huy' ? 'Đã hủy' : 'Chờ ký hợp đồng')
      : n ? ({ nhap: n.result === 'can_bo_sung' ? 'Chờ bổ sung hồ sơ' : 'Đang tiếp nhận hồ sơ', cho_duyet: 'Đang xét duyệt', da_duyet: 'Đủ điều kiện ký HĐ', tu_choi: 'Hồ sơ không đạt' }[n.status])
      : noxhUnits.has(r.unit_id) ? 'Chờ hồ sơ NOXH' : 'Đủ điều kiện ký HĐ');
  }
}

// ======================= HOOKS =======================
const H = {};

H.building = {
  async beforeSave(r) { r.code = r.code?.toUpperCase(); },
};
H.unit = {
  async beforeSave(r, old, { db }) {
    r.code = r.code?.toUpperCase().replace(/\s+/g, '');
    const b = r.building_id && await raw(db, 'building', r.building_id);
    if (b && b.project_id !== r.project_id) bad('Tòa không thuộc dự án đã chọn');
    if (r.area_tt != null && r.area_tt <= 0) bad('Diện tích thông thủy phải > 0');
    if (r.total_price == null && r.price_net != null) r.total_price = r.price_net + (r.maint_fee || 0);
    if (!old) { r.status = 'chua_mo_ban'; r.activated = r.activated ?? false; }
    if (old && r.lock !== old.lock && r.lock) {
      if (!['con_ban', 'chua_mo_ban', 'tam_khoa', 'ngung_kd'].includes(old.status)) bad('Căn đang có giao dịch — không khóa kinh doanh được');
    }
  },
  async afterSave(r, old, { db, user }) { if (!old || r.lock !== old.lock || r.activated !== old.activated) await recomputeUnit(db, r.id, user); },
  async onApprove(r, ok) { return ok ? { status: 'con_ban', patch: { activated: true } } : { status: 'chua_mo_ban' }; },
  async afterApprove(r, ok, { db, user }) { await recomputeUnit(db, r.id, user); },
  noDelete: r => !['chua_mo_ban', 'con_ban', 'tam_khoa', 'ngung_kd'].includes(r.status) && 'Căn đã phát sinh giao dịch — không xóa được, chỉ được khóa kinh doanh',
};

H.price_policy = {
  async beforeSave(r) {
    if (r.start_on && r.end_on && r.end_on < r.start_on) bad('Ngày kết thúc phải sau ngày bắt đầu');
    if (r.mode === 'don_gia' && !(r.unit_price > 0)) bad('Cần đơn giá (đ/m²) khi tính theo đơn giá');
    r.unit_group = r.unit_group ? String(r.unit_group).toUpperCase().replace(/\s+/g, '') : '*';
  },
  async afterApprove(r, ok, { db, user }) { if (ok && r.parent_id) await sys(db, 'price_policy', r.parent_id, { status: 'thay_the' }, user, 'thay_the', `Thay bằng phiên bản ${r.version}`); },
  acts: {
    async new_version(r, d, { db, user, demo }) {
      const keep = ['code', 'project_id', 'unit_group', 'mode', 'unit_price', 'maint_pct', 'discount', 'pay_method', 'bank_policy', 'target', 'start_on', 'end_on', 'src_file'];
      const n = (await create('price_policy', { ...Object.fromEntries(keep.map(k => [k, r[k]])), version: r.version + 1, parent_id: r.id, status: 'nhap' }, user, { db, system: true, demo })).row;
      return { open: ['price_policy', n.id], msg: `Đã tạo phiên bản ${n.version} (nháp). Phiên bản đang phát hành giữ nguyên tới khi bản mới được duyệt.` };
    },
  },
  noDelete: r => r.status !== 'nhap' && 'Chỉ xóa được bản nháp',
};

const digits = s => String(s || '').replace(/\D/g, '');
H.customer = {
  // ?group=tiem_nang → chỉ tình trạng tìm khách; ?group=sau_ban → chỉ tình trạng sau mở bán
  where(qs) { if (qs.group === 'tiem_nang') return { sql: 'coalesce(t.stage, $1) = ANY($2)', params: ['moi', PROSPECT_ST] }; if (qs.group === 'sau_ban') return { sql: 'NOT (coalesce(t.stage, $1) = ANY($2))', params: ['moi', PROSPECT_ST] }; },
  async beforeSave(r, old, { db, warn }) {
    r.full_name = r.full_name?.replace(/\s+/g, ' ').trim();
    if (r.phone) { const p = digits(r.phone); if (p.length < 9 || p.length > 12) bad('Điện thoại không hợp lệ'); r.phone = p.replace(/^84(?=\d{9}$)/, '0'); }
    if (r.phone2) r.phone2 = digits(r.phone2);
    if (r.id_no) r.id_no = String(r.id_no).replace(/\s+/g, '').toUpperCase();
    if (r.email && !/^\S+@\S+\.\S+$/.test(r.email)) bad('Email không hợp lệ');
    const id = old?.id || 0;
    for (const ph of [r.phone, r.phone2].filter(Boolean)) {
      const d = await db.one("SELECT code, full_name FROM kd_customer WHERE id <> $1 AND ($2 IN (regexp_replace(phone,'\\D','','g'), regexp_replace(coalesce(phone2,''),'\\D','','g')))", [id, ph]);
      if (d) bad(`Trùng số điện thoại ${ph} với khách hàng ${d.code} · ${d.full_name}. Hãy mở hồ sơ cũ để liên kết giao dịch, không tạo hồ sơ mới.`);
    }
    if (r.id_no) { const d = await db.one('SELECT code, full_name FROM kd_customer WHERE id <> $1 AND upper(id_no) = $2', [id, r.id_no]); if (d) bad(`Trùng giấy tờ định danh với khách hàng ${d.code} · ${d.full_name}`); }
    const sim = !old && r.full_name && await db.one('SELECT code, phone FROM kd_customer WHERE lower(full_name) = lower($1) LIMIT 1', [r.full_name]);
    if (sim) warn.push(`Đã có khách cùng họ tên: ${sim.code} (ĐT …${String(sim.phone).slice(-3)}) — kiểm tra có phải cùng một người không`);
    if (r.source && ['dai_ly', 'ctv'].includes(r.source) && !r.agent_id) warn.push('Nguồn khách là đại lý / CTV nhưng chưa chọn đối tác giới thiệu');
  },
};
H.contact_log = {
  async afterSave(r, old, { db, user }) {
    const c = await raw(db, 'customer', r.customer_id);
    if (!old && c?.stage === 'moi') await sys(db, 'customer', c.id, { stage: r.result === 'tu_choi' ? 'khong_nhu_cau' : 'dang_cham_soc' }, user, 'cap_nhat_trang_thai');
  },
};

H.reservation = {
  async beforeSave(r, old, { db, warn, opts }) {
    const changedUnit = !old || old.unit_id !== r.unit_id;
    const u = await raw(db, 'unit', r.unit_id);
    if (changedUnit && !opts.system) {
      if (!u.activated) bad(`Căn ${u.code} chưa được duyệt mở bán`);
      if (u.status !== 'con_ban') bad(`Căn ${u.code} đang «${await C.optLabel(C.F.unit.status, u.status)}» — không giữ chỗ được`);
    }
    if (r.hold_until && r.reg_date && new Date(Date.parse(r.hold_until) + 7 * 3600e3).toISOString().slice(0, 10) < r.reg_date) bad('Hạn giữ chỗ phải sau ngày đăng ký');
    if (!old && r.hold_until && Date.parse(r.hold_until) < Date.now() && !opts.system) bad('Hạn giữ chỗ đã qua');
    if (['dai_ly', 'ctv'].includes(r.source) && !r.agent_id) {
      const c = await raw(db, 'customer', r.customer_id); if (c?.agent_id) r.agent_id = c.agent_id; else bad('Nguồn bán đại lý / CTV cần chọn đối tác');
    }
    if (r.source === 'truc_tiep') r.agent_id = null;
    if (changedUnit || r.price == null) {
      const p = await pricing(db, u, r.reg_date);
      if (r.price == null) r.price = p.price;
      r.policy_id = p.policy?.id ?? null;
      if (!p.policy) warn.push('Không có chính sách bán hàng đang phát hành cho căn này — giá lấy theo bảng hàng');
    }
    if (r.price == null) bad('Chưa có giá bán: nhập giá hoặc phát hành bảng giá cho dự án');
    if (r.deposit > r.price) bad('Tiền đặt cọc lớn hơn giá bán');
  },
  async onSubmit(r, { db }) {
    const u = await raw(db, 'unit', r.unit_id);
    if (u.status !== 'con_ban') bad(`Căn ${u.code} không còn trống (${await C.optLabel(C.F.unit.status, u.status)})`);
  },
  async onApprove(r, ok) { return ok ? { status: r.deposit > 0 ? 'da_coc' : 'giu_cho' } : null; },
  async afterApprove(r, ok, { db, user }) { await recomputeUnit(db, r.unit_id, user); if (ok) await markCustomer(db, r.customer_id, user); },
  async afterSave(r, old, { db, user }) {
    if (!old || old.status !== r.status || old.unit_id !== r.unit_id || old.deposit !== r.deposit) await recomputeUnit(db, r.unit_id, user);
    if (old && old.unit_id !== r.unit_id) await recomputeUnit(db, old.unit_id, user);
  },
  async decorate(rows, { db }) { await stageOf(db, rows); },
  acts: {
    async deposit(r, d) { if (d.deposit > r.price) bad('Tiền đặt cọc lớn hơn giá bán'); return { patch: { deposit: d.deposit, deposit_on: d.deposit_on, status: 'da_coc' } }; },
    async extend(r, d) { if (Date.parse(d.hold_until) <= Date.now()) bad('Hạn mới phải sau thời điểm hiện tại'); return { patch: { hold_until: d.hold_until, status: r.deposit > 0 ? 'da_coc' : 'giu_cho' } }; },
    async release(r, d) { return { patch: { status: 'het_han' }, msg: r.deposit > 0 ? `Đã giải phóng căn. Khách đã cọc ${fmtMoney(r.deposit)}đ — xử lý theo chính sách (lập «Đề xuất hoàn tiền» nếu cần), hệ thống không tự hoàn tiền.` : 'Đã giải phóng căn' }; },
    async to_contract(r, d, { db, user, demo }) {
      const c = (await create('contract', { kind: d.kind, number: d.number, plan_sign: d.plan_sign, unit_id: r.unit_id, customer_id: r.customer_id, value: r.price, owner_id: r.owner_id || user.id, reservation_id: r.id },
        user, { db, system: true, demo })).row;
      await markCustomer(db, r.customer_id, user);
      return { patch: { status: 'chuyen_hd' }, open: ['contract', c.id], msg: `Đã lập dự thảo hợp đồng ${c.number}. Bước tiếp: lập lịch thanh toán → gửi rà soát.` };
    },
  },
};
async function markCustomer(db, id, user) { const c = await raw(db, 'customer', id); if (c && c.kind !== 'giao_dich') await sys(db, 'customer', id, { kind: 'giao_dich' }, user, 'cap_nhat_trang_thai'); }

H.noxh_check = {
  async beforeSave(r, old, { db, warn }) {
    if (r.reservation_id) { const s = await raw(db, 'reservation', r.reservation_id); r.customer_id = s.customer_id; r.unit_id = s.unit_id; }
    if ((!r.items || !r.items.length) && r.grp) r.items = await defaultList(db, 'checklist_noxh', r.grp);
    const it = r.items || [];
    r.result = it.length && it.every(x => x.st === 'da_nhan') ? 'du' : it.some(x => ['thieu', 'can_sua'].includes(x.st)) ? 'can_bo_sung' : 'chua_kt';
    if (r.result === 'can_bo_sung' && !r.supplement_due) warn.push('Hồ sơ cần bổ sung nhưng chưa đặt hạn bổ sung');
  },
  acts: {
    async review(r, d, { user }) {
      const reviews = [...(r.reviews || []), { step: d.step, conclusion: d.conclusion, note: d.note || '', by: user.full_name, at: new Date().toISOString() }];
      return { patch: { reviews, ...(d.conclusion === 'can_bo_sung' ? { result: 'can_bo_sung' } : {}) } };
    },
  },
};

H.cancel_req = {
  async beforeSave(r, old, { db }) {
    if (!r.reservation_id && !r.contract_id) bad('Chọn phiếu giữ chỗ hoặc hợp đồng cần xử lý');
    if (r.contract_id && !r.reservation_id) r.reservation_id = (await raw(db, 'contract', r.contract_id)).reservation_id;
    if (r.reservation_id && r.contract_id) { const c = await raw(db, 'contract', r.contract_id); if (c.reservation_id && c.reservation_id !== r.reservation_id) bad('Hợp đồng không thuộc phiếu giữ chỗ đã chọn'); }
    if (r.kind === 'doi_can') {
      if (!r.new_unit_id) bad('Chọn căn mới');
      const u = await raw(db, 'unit', r.new_unit_id); if (u.status !== 'con_ban') bad(`Căn mới ${u.code} không còn trống`);
      if (r.contract_id && (await raw(db, 'contract', r.contract_id)).status === 'da_ky') bad('Hợp đồng đã ký: đổi căn phải thanh lý hợp đồng cũ và lập hợp đồng mới');
    }
    if (r.kind === 'doi_kh' && !r.new_customer_id) bad('Chọn khách hàng mới');
  },
  async afterApprove(r, ok, { db, user, demo }) {
    if (!ok) return;
    const res = r.reservation_id && await raw(db, 'reservation', r.reservation_id);
    const con = r.contract_id && await raw(db, 'contract', r.contract_id);
    if (r.kind === 'huy') {
      if (con) { await sys(db, 'contract', con.id, { status: 'huy' }, user, 'huy', `Theo đề nghị ${r.code}`); await refreshCommission(db, con.id, user); }
      if (res) await sys(db, 'reservation', res.id, { status: 'huy' }, user, 'huy', `Theo đề nghị ${r.code}`);
      if (r.money_plan === 'hoan_tien' && con) {
        const d = (await debtOf(db, [con.id])).get(con.id);
        if (d.paid > 0) await create('refund', { kind: 'hoan_tien', contract_id: con.id, amount: d.paid, reason: `Hủy giao dịch theo ${r.code}: ${r.reason}` }, user, { db, system: true, demo });
      }
    }
    if (r.kind === 'doi_can') {
      const nu = await raw(db, 'unit', r.new_unit_id); if (nu.status !== 'con_ban') bad(`Căn ${nu.code} không còn trống`);
      if (res) await sys(db, 'reservation', res.id, { unit_id: nu.id }, user, 'doi_can', `Theo đề nghị ${r.code}`);
      if (con) await sys(db, 'contract', con.id, { unit_id: nu.id }, user, 'doi_can', `Theo đề nghị ${r.code}`);
      await recomputeUnit(db, nu.id, user);
    }
    if (r.kind === 'doi_kh') {
      if (res) await sys(db, 'reservation', res.id, { customer_id: r.new_customer_id }, user, 'doi_kh', `Theo đề nghị ${r.code}`);
      if (con) await sys(db, 'contract', con.id, { customer_id: r.new_customer_id }, user, 'doi_kh', `Theo đề nghị ${r.code}`);
      await markCustomer(db, r.new_customer_id, user);
    }
    for (const id of new Set([res?.unit_id, con?.unit_id].filter(Boolean))) await recomputeUnit(db, id, user);
  },
};

H.contract = {
  async beforeSave(r, old, { db, opts }) {
    r.number = r.number?.trim().toUpperCase().replace(/\s+/g, '');
    if (!(r.value > 0)) bad('Giá trị hợp đồng phải > 0');
    if (!old || old.unit_id !== r.unit_id) {
      const u = await raw(db, 'unit', r.unit_id);
      if (!u.activated && !opts.system) bad(`Căn ${u.code} chưa được duyệt mở bán`);
      if (r.kind !== 'hoan_thien' && !opts.system) {
        const res = await db.one(`SELECT code, customer_id FROM kd_reservation WHERE unit_id = $1 AND status IN ${ACTIVE_RES}`, [r.unit_id]);
        if (res && res.customer_id !== r.customer_id) bad(`Căn ${u.code} đang được giữ chỗ cho khách khác (${res.code})`);
      }
    }
    if (r.kind === 'hoan_thien') {
      const main = await db.one("SELECT id FROM kd_contract WHERE unit_id = $1 AND kind IN ('hdmb','thue_mua') AND status NOT IN ('huy','thanh_ly') AND id <> $2", [r.unit_id, old?.id || 0]);
      if (!main) bad('HĐ hoàn thiện cần căn đã có hợp đồng mua bán / thuê mua');
    }
    if (['thue', 'thue_mua'].includes(r.kind) && r.eff_on && r.exp_on && r.exp_on < r.eff_on) bad('Ngày hết hạn phải sau ngày hiệu lực');
  },
  async onSubmit(r, { db }) {
    const n = await db.one('SELECT count(*) n, coalesce(sum(amount),0) s FROM kd_installment WHERE contract_id = $1 AND active', [r.id]);
    if (r.kind !== 'thue' && !n.n) bad('Chưa lập lịch thanh toán — bấm «Lập lịch thanh toán» trước khi gửi rà soát');
    if (n.n && n.s !== r.value) bad(`Tổng lịch thanh toán ${fmtMoney(n.s)} khác giá trị hợp đồng ${fmtMoney(r.value)}`);
  },
  async afterSave(r, old, { db, user }) {
    if (!old || old.status !== r.status || old.unit_id !== r.unit_id) { await recomputeUnit(db, r.unit_id, user); if (old && old.unit_id !== r.unit_id) await recomputeUnit(db, old.unit_id, user); }
    if (old && old.status !== r.status) await refreshCommission(db, r.id, user);
  },
  async decorate(rows, { db, one }) {
    const D = await debtOf(db, rows.map(r => r.id));
    for (const r of rows) { const d = D.get(r.id); r.paid = d.paid; r.left = d.left; r.overdue = d.overdue; if (one) r._debt = d; }
  },
  acts: {
    async schedule(r, d, { db, user, demo }) {
      const rows = await normSchedule(db, d.rows, r.value);
      await writeSchedule(db, r.id, rows, 'hop_dong', user, demo);
      return { msg: `Đã lập ${rows.length} kỳ thu, tổng ${fmtMoney(r.value)}đ` };
    },
    async sign(r, d, { db, user }) {
      await C.requiredFiles(db, { key: 'contract', files: [['ban_ky', 'Bản hợp đồng đã ký', 1]] }, r);
      if (d.signed_on > today()) bad('Ngày ký không được sau hôm nay');
      return { patch: { status: 'da_ky', signed_on: d.signed_on, sign_status: 'da_ky' }, msg: 'Đã chốt hợp đồng. Từ nay mọi thay đổi phải qua phụ lục.' };
    },
    async liquidate() { return { patch: { status: 'thanh_ly' } }; },
    async print(r) { return { url: `/print/contract/${r.id}` }; },
  },
  noDelete: r => r.status !== 'du_thao' && 'Chỉ xóa được dự thảo chưa gửi rà soát',
  async afterDelete(r, { db, user }) {
    await db.q('DELETE FROM kd_installment WHERE contract_id = $1', [r.id]);
    if (r.reservation_id) { const s = await raw(db, 'reservation', r.reservation_id); if (s?.status === 'chuyen_hd') await sys(db, 'reservation', s.id, { status: s.deposit > 0 ? 'da_coc' : 'giu_cho' }, user, 'hoan_tac'); }
    await recomputeUnit(db, r.unit_id, user);
  },
};

H.installment = {
  async decorate(rows, { db }) {
    const D = await debtOf(db, rows.map(r => r.contract_id));
    for (const r of rows) {
      const i = D.get(r.contract_id)?.inst.find(x => x.id === r.id);
      r.paid = i?.paid ?? 0; r.pay_status = r.active ? (i ? PAY_ST[i.st] : '') : 'Hết hiệu lực (đã thay bằng phụ lục)';
    }
  },
  where: qs => qs.active === 'all' ? null : { sql: 't.active' },
};

H.receipt = {
  async beforeSave(r, old, { db }) {
    const c = await raw(db, 'contract', r.contract_id);
    if (c.status === 'huy') bad('Hợp đồng đã hủy');
    if (r.installment_id) { const i = await raw(db, 'installment', r.installment_id); if (i.contract_id !== r.contract_id) bad('Khoản phải thu không thuộc hợp đồng này'); }
    r.voucher_no = r.voucher_no?.trim().toUpperCase();
    if (!old) { r.synced_at = r.synced_at || new Date().toISOString(); r.src = r.src || 'thu_cong'; }
    if (r.voucher_date > today()) bad('Ngày thu không được sau hôm nay');
  },
  async afterSave(r, old, { db, user }) { await refreshCommission(db, r.contract_id, user); },
  acts: { async void(r, d) { return { patch: { status: 'huy', void_reason: d.reason } }; } },
};

H.contract_change = {
  async beforeSave(r, old, { db }) {
    const c = await raw(db, 'contract', r.contract_id);
    if (c.status !== 'da_ky') bad('Chỉ điều chỉnh hợp đồng đã ký (dự thảo thì sửa trực tiếp)');
    if (!old || old.contract_id !== r.contract_id) r.value_before = c.value;
    if (['tien_do', 'gia_tri'].includes(r.kind) && r.new_schedule) r.new_schedule = await normSchedule(db, r.new_schedule, r.value_after ?? r.value_before, 'Tiến độ mới');
    if (r.kind === 'gia_tri' && r.value_after == null) bad('Điều chỉnh giá trị cần nhập «Giá trị sau»');
    if (r.kind === 'tien_do' && !r.new_schedule) bad('Điều chỉnh tiến độ cần nhập tiến độ thanh toán mới');
  },
  async onSubmit(r, { db }) {
    const d = (await debtOf(db, [r.contract_id])).get(r.contract_id);
    const target = r.value_after ?? r.value_before;
    if (r.new_schedule && d.paid > target) bad(`Số đã thu ${fmtMoney(d.paid)} lớn hơn giá trị sau điều chỉnh`);
  },
  acts: {
    async appendix(r, d, { db, user, demo }) {
      await C.requiredFiles(db, { key: 'contract_change', files: [['phu_luc', 'Phụ lục đã ký', 1]] }, r);
      const c = await raw(db, 'contract', r.contract_id);
      if (r.value_after != null && r.value_after !== c.value) await sys(db, 'contract', c.id, { value: r.value_after }, user, 'phu_luc', `Phụ lục ${d.appendix_no} (${r.code})`);
      if (r.new_schedule?.length) await writeSchedule(db, c.id, r.new_schedule, 'phu_luc', user, demo);
      else if (r.value_after != null && r.value_after !== c.value) bad('Đổi giá trị hợp đồng cần kèm tiến độ thanh toán mới khớp giá trị sau');
      await refreshCommission(db, c.id, user);
      return { patch: { status: 'hieu_luc', appendix_no: d.appendix_no, appendix_on: d.appendix_on }, msg: 'Phụ lục có hiệu lực — lịch công nợ đã cập nhật' };
    },
  },
};

H.collect_plan = {
  async beforeSave(r, old, { db, warn }) {
    if (!old || old.contract_id !== r.contract_id) {
      const c = await raw(db, 'contract', r.contract_id);
      r.unit_id = c.unit_id; r.customer_id = c.customer_id;
      r.debt_left = (await debtOf(db, [c.id])).get(c.id).left;
    }
    if (!(r.expected > 0)) bad('Số dự kiến thu phải > 0');
    if (r.expected > (r.debt_left || 0) && !r.explain) bad(`Số dự kiến ${fmtMoney(r.expected)} vượt công nợ còn lại ${fmtMoney(r.debt_left)} — cần nhập giải trình`);
    if (r.month && r.expected_on && r.expected_on.slice(0, 7) !== r.month) warn.push('Ngày dự kiến thu không nằm trong tháng kế hoạch');
  },
  async decorate(rows, { db }) {
    if (!rows.length) return;
    const act = await db.q(`SELECT p.id, coalesce((SELECT sum(amount) FROM kd_receipt r WHERE r.contract_id = p.contract_id AND r.status = 'hop_le' AND to_char(r.voucher_date,'YYYY-MM') = p.month),0) AS actual,
      (SELECT pr.code FROM kd_unit u JOIN kd_project pr ON pr.id = u.project_id WHERE u.id = p.unit_id) AS project, (SELECT b.code FROM kd_unit u JOIN kd_building b ON b.id = u.building_id WHERE u.id = p.unit_id) AS building
      FROM kd_collect_plan p WHERE p.id = ANY($1)`, [rows.map(r => r.id)]);
    const m = new Map(act.map(a => [a.id, a]));
    for (const r of rows) { const a = m.get(r.id); r.actual = a.actual; r.gap = a.actual - r.expected; r.project = a.project; r.building = a.building; }
  },
  acts: {
    async revise(r, d, { db, user, demo }) {
      await sys(db, 'collect_plan', r.id, { status: 'thay_the' }, user, 'thay_the', 'Lập phiên bản mới');
      const keep = ['month', 'contract_id', 'expected', 'expected_on', 'basis', 'basis_note', 'ability', 'explain', 'owner_id'];
      const n = (await create('collect_plan', { ...Object.fromEntries(keep.map(k => [k, r[k]])), version: r.version + 1, status: 'nhap' }, user, { db, system: true, demo })).row;
      return { open: ['collect_plan', n.id], msg: `Đã tạo phiên bản ${n.version} để chỉnh và trình duyệt lại` };
    },
  },
};

H.debt_call = {
  async beforeSave(r) { if (r.promise_amount && !r.promise_on) bad('Có số cam kết thì cần ngày cam kết'); },
  async decorate(rows, { db }) {
    const t = today();
    for (const r of rows) {
      if (!r.promise_amount) { r.promise_st = ''; continue; }
      if (r.promise_on > t) { r.promise_st = 'Chờ đến hẹn'; continue; }
      const from = new Date(Date.parse(r.at) + 7 * 3600e3).toISOString().slice(0, 10);
      const got = (await db.one("SELECT coalesce(sum(amount),0) s FROM kd_receipt WHERE contract_id = $1 AND status = 'hop_le' AND voucher_date BETWEEN $2 AND $3", [r.contract_id, from, addDays(r.promise_on, 3)])).s;
      r.promise_st = got >= r.promise_amount ? 'Đúng hẹn' : got > 0 ? `Thu một phần (${fmtMoney(got)})` : 'Thất hẹn';
    }
  },
};

H.refund = {
  async beforeSave(r, old, { db }) {
    const d = (await debtOf(db, [r.contract_id])).get(r.contract_id);
    if (r.kind === 'hoan_tien' && r.amount > d.paid) bad(`Số hoàn ${fmtMoney(r.amount)} lớn hơn số đã thu ${fmtMoney(d.paid)}`);
    if (r.kind === 'chuyen_khoan' && !r.to_contract_id) bad('Chọn hợp đồng nhận khoản chuyển');
    if (r.to_contract_id === r.contract_id) bad('Hợp đồng nhận phải khác hợp đồng gốc');
  },
  acts: { async execute(r, d) { return { patch: { status: 'da_thuc_hien', done_voucher: d.done_voucher, done_on: d.done_on }, msg: 'Đã ghi nhận. Số tiền thực tế được phản ánh khi đồng bộ chứng từ từ Bravo.' }; } },
};

H.handover = {
  async beforeSave(r, old, { db }) {
    const k = await handoverCond(db, r.unit_id);
    if (!k.contract) bad('Căn chưa có hợp đồng mua bán / thuê mua');
    r.contract_id = k.contract.id; r.cond_contract = k.cond_contract; r.cond_pay = k.cond_pay;
    if (!r.docs || !r.docs.length) r.docs = await defaultList(db, 'checklist_ban_giao');
    if (!old || ['chua_du_dk', 'du_dk'].includes(r.status)) r.status = r.cond_contract && r.cond_pay && r.cond_tech ? 'du_dk' : 'chua_du_dk';
  },
  async afterSave(r, old, { db, user }) { if (!old || old.status !== r.status) await recomputeUnit(db, r.unit_id, user); },
  async decorate(rows, { db }) {
    if (!rows.length) return;
    const m = new Map((await db.q("SELECT unit_id, count(*) n FROM kd_defect WHERE unit_id = ANY($1) AND status <> 'da_nghiem_thu' GROUP BY 1", [rows.map(r => r.unit_id)])).map(x => [x.unit_id, x.n]));
    for (const r of rows) r.defects_open = m.get(r.unit_id) || 0;
  },
  acts: {
    async invite(r, d) { if (Date.parse(d.plan_at) < Date.now() - 864e5) bad('Lịch hẹn đã qua'); return { patch: { plan_at: d.plan_at, confirm: 'chua', status: 'da_moi' } }; },
    async confirm() { return { patch: { confirm: 'da_xac_nhan', status: 'da_hen' } }; },
    async handed(r, d) {
      const bb = (r.docs || []).find(x => /^biên bản bàn giao/i.test(x.n));
      if (!bb || bb.st !== 'da_nhan') bad('Cần tích «Biên bản bàn giao» đã ký trong hồ sơ bàn giao');
      if (d.actual_on > today()) bad('Ngày bàn giao không được sau hôm nay');
      return { patch: { actual_on: d.actual_on, status: 'da_ban_giao' }, msg: 'Đã ghi nhận bàn giao thực tế. Căn chỉ «hoàn tất» khi đủ hồ sơ bắt buộc, khách xác nhận và hết tồn tại.' };
    },
    async finish(r, d, { db }) {
      const miss = (r.docs || []).filter(x => isReq(x.n) && x.st !== 'da_nhan');
      if (miss.length) bad('Thiếu hồ sơ bắt buộc: ' + miss.map(x => x.n).join('; '));
      if (r.confirm !== 'da_xac_nhan') bad('Khách chưa xác nhận');
      const open = (await db.one("SELECT count(*) n FROM kd_defect WHERE unit_id = $1 AND status <> 'da_nghiem_thu'", [r.unit_id])).n;
      if (open) bad(`Còn ${open} tồn tại chưa nghiệm thu`);
      return { patch: { status: 'hoan_tat' } };
    },
  },
  noDelete: r => !['chua_du_dk', 'du_dk'].includes(r.status) && 'Kế hoạch đã mời / đã bàn giao — không xóa được',
};

H.defect = {
  async beforeSave(r, old, { db }) { r.handover_id = (await db.one('SELECT id FROM kd_handover WHERE unit_id = $1', [r.unit_id]))?.id ?? null; },
  acts: {
    async assign() { return { patch: { status: 'dang_xu_ly' } }; },
    async fixed(r, d) { return { patch: { result: d.result, status: 'da_khac_phuc' } }; },
    async accept(r) { if (!r.customer_ok) bad('Cần tích «Khách xác nhận» trước khi nghiệm thu'); return { patch: { status: 'da_nghiem_thu', closed_on: today() } }; },
    async reopen() { return { patch: { status: 'dang_xu_ly', customer_ok: false } }; },
  },
  noDelete: r => r.status !== 'da_nghiem_thu' ? 'Không xóa tồn tại chưa nghiệm thu' : null,
};

H.pinkbook = {
  async beforeSave(r, old, { db }) {
    const c = await db.one("SELECT * FROM kd_contract WHERE unit_id = $1 AND kind IN ('hdmb','thue_mua') AND status = 'da_ky' ORDER BY id DESC LIMIT 1", [r.unit_id]);
    if (!c) bad('Căn chưa có hợp đồng mua bán đã ký');
    r.contract_id = c.id; r.customer_id = c.customer_id;
    if (!r.items || !r.items.length) r.items = await defaultList(db, 'checklist_so_hong');
    const it = r.items, got = it.filter(x => x.st === 'da_nhan').length;
    if (got && !r.received_on) r.received_on = today();
    if (!old || ['cho_ho_so', 'thieu', 'da_nhan_du'].includes(r.status)) r.status = got === it.length ? 'da_nhan_du' : got || it.some(x => x.st) ? 'thieu' : 'cho_ho_so';
    if (r.status === 'bo_sung' && got === it.length && old?.status === 'bo_sung' && JSON.stringify(old.items) !== JSON.stringify(r.items)) r.supplement_note = (r.supplement_note || '') + ' [đã nhận bổ sung]';
  },
  async decorate(rows) {
    const t = today();
    for (const r of rows) {
      r.days_in = r.received_on ? dayDiff(r.received_on, r.submit_on || t) : null;
      r.days_out = r.submit_on ? dayDiff(r.submit_on, r.result_on || t) : null;
    }
  },
  acts: {
    async submit_gov(r, d) { return { patch: { submit_on: d.submit_on, agency: d.agency, file_no: d.file_no, appoint_on: d.appoint_on, status: 'da_nop' } }; },
    async gov_more(r, d) { return { patch: { supplement_note: d.supplement_note, supplement_due: d.supplement_due, status: 'bo_sung' } }; },
    async result(r, d) { return { patch: { result_on: d.result_on, cert_no: d.cert_no, status: 'da_co_kq' } }; },
    async hand(r, d, { db }) { await C.requiredFiles(db, { key: 'pinkbook', files: [['bien_ban', 'Biên bản giao nhận GCN', 1]] }, r); return { patch: { handed_on: d.handed_on, status: 'da_giao_so' } }; },
  },
};

H.ticket = {
  async beforeSave(r, old, { db }) {
    if (!old && !r.due_at) { const sla = (await setting('sla_hours', db)) || { khan: 24, cao: 48, thuong: 72 }; r.due_at = new Date(Date.parse(r.at || new Date()) + (sla[r.priority] || 72) * 3600e3).toISOString(); }
    if (r.unit_id && r.customer_id) {
      const link = await db.one("SELECT 1 FROM kd_contract WHERE unit_id = $1 AND customer_id = $2 UNION SELECT 1 FROM kd_reservation WHERE unit_id = $1 AND customer_id = $2", [r.unit_id, r.customer_id]);
      if (!link) bad('Khách hàng không có giao dịch với căn đã chọn');
    }
  },
  async decorate(rows) {
    const now = Date.now();
    for (const r of rows) {
      if (['da_phan_hoi', 'da_dong'].includes(r.status)) { r.sla = 'Đã phản hồi'; continue; }
      const left = (Date.parse(r.due_at) - now) / 3600e3;
      r.sla = left < 0 ? `Quá hạn ${Math.ceil(-left)}h` : left < 12 ? `Còn ${Math.floor(left)}h` : 'Trong hạn';
    }
  },
  acts: {
    async start() { return { patch: { status: 'dang_xu_ly' } }; },
    async reply(r, d) { return { patch: { result: d.result, status: 'da_phan_hoi' } }; },
    async close(r, d) { if (!r.result) bad('Chưa có kết quả phản hồi'); return { patch: { rating: +d.rating, rating_note: d.rating_note, status: 'da_dong' } }; },
    async reopen() { return { patch: { status: 'dang_xu_ly' } }; },
  },
};

async function noticeTargets(db, r) {
  const t = today(), base = `SELECT DISTINCT k.id customer_id, k.full_name, k.phone, u.code unit, c.id contract_id FROM kd_contract c JOIN kd_customer k ON k.id = c.customer_id JOIN kd_unit u ON u.id = c.unit_id WHERE c.status NOT IN ('huy','thanh_ly')`;
  const scope = [r.project_id ? ` AND u.project_id = ${+r.project_id}` : '', r.building_id ? ` AND u.building_id = ${+r.building_id}` : ''].join('');
  let rows;
  if (r.target === 'du_an') rows = await db.q(base + scope);
  else if (r.target === 'cho_ky') rows = await db.q(base + scope + " AND c.status IN ('du_thao','cho_duyet','cho_ky')");
  else if (r.target === 'du_dk_bg') rows = await db.q(base + scope + " AND EXISTS (SELECT 1 FROM kd_handover h WHERE h.unit_id = u.id AND h.status IN ('du_dk','da_moi'))");
  else if (r.target === 'so_hong_thieu') rows = await db.q(base + scope + " AND EXISTS (SELECT 1 FROM kd_pinkbook p WHERE p.unit_id = u.id AND p.status IN ('cho_ho_so','thieu','bo_sung'))");
  else {
    const all = await db.q(base + scope + " AND c.status = 'da_ky'"), D = await debtOf(db, all.map(x => x.contract_id));
    rows = all.filter(x => { const d = D.get(x.contract_id); x.debt = r.target === 'qua_han' ? d.overdue : d.due7; return x.debt > 0; });
  }
  return rows;
}
H.notice = {
  acts: {
    async send(r, d, { db }) {
      const rows = await noticeTargets(db, r);
      if (!rows.length) bad('Không có khách hàng nào thuộc nhóm đã chọn');
      const list = rows.map(x => ({ customer_id: x.customer_id, name: x.full_name, phone: x.phone, unit: x.unit, text: r.content.replace(/\{ten_kh\}/g, x.full_name).replace(/\{ma_can\}/g, x.unit).replace(/\{cong_no\}/g, x.debt != null ? fmtMoney(x.debt) : '') }));
      return { patch: { recipients: list.length, recipient_list: list, sent_at: new Date().toISOString(), status: 'da_gui' }, msg: `Đã lập ${list.length} thông báo (kênh ${r.channel}).` };
    },
  },
};

H.commission = {
  acts: { async pay(r, d) { return { patch: { paid_on: d.paid_on, voucher: d.voucher, status: 'da_chi' } }; } },
  async beforeSave(r, old, { db }) {
    if (old && r.policy_id !== old.policy_id) { const p = await raw(db, 'commission_policy', r.policy_id); r.amount = Math.round((r.base || 0) * (p.rate || 0) / 100) + (p.fixed || 0); }
  },
};

H.report = {
  acts: {
    async compute(r, d, { db }) { const V = require('./views'); return { patch: { data: await V.monthly(db, r.period, r.project_id) }, msg: 'Đã tổng hợp số liệu' }; },
    async close(r) { if (!r.data) bad('Chưa tổng hợp số liệu'); return { patch: { status: 'da_chot', closed_at: new Date().toISOString() }, msg: 'Đã chốt — số liệu lưu cố định để đối chiếu về sau' }; },
    async present() { return { patch: { status: 'da_trinh' } }; },
  },
};

C.hooks(H);

// ---------- việc chạy nền ----------
async function jobs(db) {
  const t0 = Date.now();
  // giữ chỗ quá hạn → cảnh báo (không tự giải phóng, không tự hoàn tiền)
  for (const r of await db.q("SELECT id FROM kd_reservation WHERE status = 'giu_cho' AND hold_until < now()")) await sys(db, 'reservation', r.id, { status: 'qua_han' }, null, 'qua_han_giu_cho');
  // điều kiện bàn giao cập nhật theo thu tiền
  for (const h of await db.q("SELECT id, unit_id, cond_tech, cond_contract, cond_pay, status FROM kd_handover WHERE status IN ('chua_du_dk','du_dk')")) {
    const k = await handoverCond(db, h.unit_id);
    const st = k.cond_contract && k.cond_pay && h.cond_tech ? 'du_dk' : 'chua_du_dk';
    if (k.cond_contract !== h.cond_contract || k.cond_pay !== h.cond_pay || st !== h.status) await sys(db, 'handover', h.id, { cond_contract: k.cond_contract, cond_pay: k.cond_pay, status: st }, null, 'cap_nhat_dieu_kien');
  }
  for (const c of await db.q("SELECT c.id FROM kd_contract c JOIN kd_reservation r ON r.id = c.reservation_id WHERE r.agent_id IS NOT NULL")) await refreshCommission(db, c.id, null);
  await syncStages(db);
  return Date.now() - t0;
}

// ======================= TÌNH TRẠNG KHÁCH HÀNG (tự đồng bộ theo giao dịch) =======================
// Khách chưa có giao dịch giữ nguyên tình trạng tìm khách (03). Có giao dịch → tình trạng sau mở bán cao nhất đạt được:
// HSMN → SXD duyệt → chờ ký → đã ký HĐMB → TT đợt 2/3 → chờ bàn giao → đã bàn giao → thanh lý → nộp hồ sơ sổ → ra sổ
const STAGE_RANK = ['da_nop_hsmn', 'sxd_duyet', 'cho_ky_hdmb', 'da_ky_hdmb', 'tt_dot_2', 'tt_dot_3', 'cho_ban_giao', 'da_ban_giao', 'lam_don_thanh_ly', 'da_thanh_ly', 'da_nop_hs_so', 'da_ra_so'];
let syncing = null;
function syncStages(db) { return syncing ||= doSyncStages(db).finally(() => { syncing = null; }); }
async function doSyncStages(db) {
  const best = new Map(), bump = (cid, st) => { if (cid && STAGE_RANK.indexOf(st) > STAGE_RANK.indexOf(best.get(cid) ?? '')) best.set(cid, st); };
  for (const r of await db.q("SELECT customer_id FROM kd_reservation WHERE status IN ('giu_cho','qua_han','da_coc','chuyen_hd')")) bump(r.customer_id, 'da_nop_hsmn');
  for (const r of await db.q("SELECT customer_id, status FROM kd_noxh_check WHERE status <> 'tu_choi'")) bump(r.customer_id, r.status === 'da_duyet' ? 'sxd_duyet' : 'da_nop_hsmn');
  const cts = await db.q("SELECT id, customer_id, status FROM kd_contract WHERE status NOT IN ('huy','tu_choi') AND kind <> 'hoan_thien'");
  const D = await debtOf(db, cts.filter(c => c.status === 'da_ky').map(c => c.id));
  for (const c of cts) {
    if (c.status === 'thanh_ly') { bump(c.customer_id, 'da_thanh_ly'); continue; }
    if (c.status !== 'da_ky') { bump(c.customer_id, 'cho_ky_hdmb'); continue; }
    const paid = (D.get(c.id)?.inst || []).filter(i => i.amount > 0 && i.paid >= i.amount).length;   // số đợt đã thu đủ
    bump(c.customer_id, paid >= 3 ? 'tt_dot_3' : paid >= 2 ? 'tt_dot_2' : 'da_ky_hdmb');
  }
  const own = new Map(cts.map(c => [c.id, c.customer_id]));
  for (const r of await db.q("SELECT contract_id FROM kd_cancel_req WHERE kind = 'huy' AND status IN ('nhap','cho_duyet','da_duyet')")) bump(own.get(r.contract_id), 'lam_don_thanh_ly');
  for (const h of await db.q("SELECT contract_id, status FROM kd_handover WHERE status <> 'chua_du_dk'")) bump(own.get(h.contract_id), ['da_ban_giao', 'hoan_tat'].includes(h.status) ? 'da_ban_giao' : 'cho_ban_giao');
  for (const p of await db.q("SELECT coalesce(customer_id, (SELECT customer_id FROM kd_contract c WHERE c.id = contract_id)) cid, status FROM kd_pinkbook WHERE status IN ('da_nop','bo_sung','da_co_kq','da_giao_so')"))
    bump(p.cid, ['da_co_kq', 'da_giao_so'].includes(p.status) ? 'da_ra_so' : 'da_nop_hs_so');
  let n = 0;
  for (const c of await db.q('SELECT id, stage FROM kd_customer WHERE id = ANY($1)', [[...best.keys()]]))
    if (c.stage !== best.get(c.id)) { await sys(db, 'customer', c.id, { stage: best.get(c.id) }, null, 'cap_nhat_trang_thai', 'Tự đồng bộ theo giao dịch'); n++; }
  return n;
}

module.exports = { syncStages, H, debtOf, PAY_ST, recomputeUnit, pricing, normSchedule, writeSchedule, refreshCommission, handoverCond, defaultList, noticeTargets, jobs };
