// Luật nghiệp vụ riêng từng mẫu biểu (gắn vào core qua hooks).
// Nguyên tắc: một mã căn là một hồ sơ xuyên suốt — trạng thái căn luôn tính lại từ giao dịch, hợp đồng, bàn giao;
// công nợ tính từ lịch thanh toán hiệu lực + chứng từ thu (Bravo), không ai sửa tay số thực thu.
const C = require('./core');
const { ACTIVE_RES } = require('./schema');
const { PROSPECT_ST, E } = require('./meta');
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
const FREE_UNIT = ['con_ban', 'chua_mo_ban'];   // căn còn trống — lập phiếu đăng ký được
async function recomputeUnit(db, unitId, user) {
  const u = unitId && await raw(db, 'unit', unitId); if (!u) return;
  let st;
  if (u.lock) st = u.lock;
  else if (!u.activated) st = 'chua_mo_ban';
  else {
    const c = await db.one("SELECT id, status FROM kd_contract WHERE unit_id = $1 AND kind IN ('hdmb','thue','thue_mua') AND status NOT IN ('huy','thanh_ly')", [unitId]);
    const r = await db.one(`SELECT status, deposit, reg_state FROM kd_reservation WHERE unit_id = $1 AND status IN ${ACTIVE_RES}`, [unitId]);
    const h = await db.one('SELECT status FROM kd_handover WHERE unit_id = $1', [unitId]);
    if (c && h && ['da_ban_giao', 'hoan_tat'].includes(h.status)) st = 'da_ban_giao';
    else if (c?.status === 'da_ky' || r?.reg_state === 'ky_hdmb') st = 'da_ky_hd';
    else if (c) st = r?.deposit > 0 || r?.status === 'da_coc' ? 'da_coc' : 'giu_cho';
    else if (r) st = r.status === 'da_coc' || r.deposit > 0 ? 'da_coc' : 'giu_cho';
    else st = 'con_ban';
  }
  if (st !== u.status) await sys(db, 'unit', u.id, { status: st }, user, 'cap_nhat_trang_thai');
}

// ======================= GIÁ =======================
async function pricing(db, unit, on = today()) {
  const b = await db.one('SELECT code FROM kd_building WHERE id = $1', [unit.building_id]);
  const pols = await db.q("SELECT * FROM kd_price_policy WHERE status = 'phat_hanh' AND $1 = ANY(project_ids) AND start_on <= $2 AND end_on >= $2 ORDER BY start_on DESC, version DESC", [unit.project_id, on]);
  const pol = pols.find(p => { const g = String(p.unit_group || '*').split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean); return g.includes('*') || g.includes(String(b?.code).toUpperCase()) || g.includes(String(unit.code).toUpperCase()); });
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

// tiền hợp đồng chung cư (như BRAVO, cùng công thức Danh mục sản phẩm): F = giá nền × DT thông thủy + giá sàn × DT sàn + tiền hệ số góc − giảm giá;
// thuế = F × thuế suất; sau thuế = ROUND(F + thuế, -3); bảo trì = ROUND(F × 2%, -3); tổng = sau thuế + bảo trì + giá trị hoàn thiện
function contractPrice(r) {
  const r3 = v => Math.round(v / 1000) * 1000, F0 = +r.base_price * +r.area_tt + (+r.floor_price || 0) * (+r.area_floor || 0);
  const corner_amt = r.corner_pct != null && r.corner_pct !== '' ? Math.round(F0 * +r.corner_pct / 100) : +r.corner_amt || 0;
  const F = F0 + corner_amt - (+r.discount || 0), vat = r.vat_pct ?? 5, H = F * vat / 100, after_tax = r3(F + H), maint_fee = r3(F * 0.02);
  return { corner_amt: corner_amt || null, pretax: Math.round(F), vat_pct: vat, vat_amt: Math.round(H), after_tax, maint_fee, value: after_tax + maint_fee + (+r.finish_value || 0) };
}

// số hợp đồng kế tiếp: HDCH.YYMM-0001 (chung cư) / HDLK.YYMM-0001 (liền kề)
async function nextContractNo(db, ptype, on) {
  const d = String(on || today()), pre = `${ptype === 'lien_ke' ? 'HDLK' : 'HDCH'}.${d.slice(2, 4)}${d.slice(5, 7)}-`;
  const last = await db.one("SELECT max(substring(number from '\\d+$')::int) n FROM kd_contract WHERE number LIKE $1", [pre + '%']);
  return pre + String((last?.n || 0) + 1).padStart(4, '0');
}
// form hợp đồng: chọn căn → lấy theo phiếu giữ chỗ đang hiệu lực (khách, ngày đề nghị mua, chính sách, hoàn thiện, nhân viên); chưa có chính sách thì lấy bảng giá đang phát hành của dự án
async function contractPrefill(db, unitId, on = today()) {
  const u = await raw(db, 'unit', unitId); if (!u) return {};
  const res = await db.one(`SELECT r.customer_id, r.reg_date, r.policy_id, r.finish_value, r.owner_id, k.code || ' · ' || k.full_name customer_label FROM kd_reservation r
    LEFT JOIN kd_customer k ON k.id = r.customer_id WHERE r.unit_id = $1 AND r.status IN ${ACTIVE_RES} ORDER BY r.id DESC LIMIT 1`, [unitId]);
  const pol = await db.one(`SELECT id, code || ' v' || version label FROM kd_price_policy WHERE ${res?.policy_id ? 'id = $1' : "status = 'phat_hanh' AND $1 = ANY(project_ids) AND start_on <= $2 AND end_on >= $2 ORDER BY start_on DESC, version DESC LIMIT 1"}`, res?.policy_id ? [res.policy_id] : [u.project_id, on]);
  return { customer_id: res?.customer_id ?? null, customer_label: res?.customer_label ?? null, request_on: res?.reg_date ?? null, finish_value: res?.finish_value ?? null, owner_id: res?.owner_id ?? null, policy_id: pol?.id ?? null, policy_label: pol?.label ?? null };
}

// giá trị hợp đồng căn hộ theo Danh mục sản phẩm (sau thuế + bảo trì): cập nhật các ô giá + tính lại từng đợt theo tỷ lệ / ngày đến hạn cũ.
// Phiếu thu đã có giữ nguyên (công nợ tự tính lại theo lịch mới). Trả về true nếu có đổi.
async function syncContractValue(db, contractId, user, note = 'Đồng bộ giá trị theo Danh mục sản phẩm') {
  const c = await raw(db, 'contract', contractId);
  const u = c && c.kind !== 'hoan_thien' && await raw(db, 'unit', c.unit_id);
  if (!u || u.price_net == null) return false;
  const value = +u.price_net + (+u.maint_fee || 0);
  if (+c.value === value) return false;
  const patch = { value, pretax: u.pretax, vat_pct: u.vat_pct, vat_amt: u.tax_amt, after_tax: u.price_net, maint_fee: u.maint_fee, base_price: u.base_price };
  for (const k of Object.keys(patch)) if (patch[k] == null || !C.F.contract[k]) delete patch[k];
  const sets = Object.keys(patch);
  await db.q(`UPDATE kd_contract SET ${sets.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${sets.length + 1}`, [...sets.map(k => patch[k]), c.id]);
  await C.audit(db, 'contract', c.id, 'sua', { value: c.value }, { value }, user, note, c.is_demo);
  const inst = await db.q('SELECT name, due_on, pct, amount, src FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [c.id]);
  if (inst.length) {
    const rows = inst.map(i => ({ name: i.name, due_on: i.due_on, pct: i.pct, amount: i.pct != null ? null : Math.round(+i.amount * value / +c.value) }));
    await writeSchedule(db, c.id, await normSchedule(db, rows, value), inst[0].src || 'hop_dong', user, c.is_demo);
  }
  await refreshCommission(db, c.id, user, c.is_demo);
  return true;
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
// dòng danh mục «Tên giấy tờ | 2» → { n, qty }
const ckItem = s => { const m = /^(.*?)\s*\|\s*(\d+)\s*$/.exec(String(s)); return m ? { n: m[1].trim(), qty: +m[2] } : { n: String(s).trim() }; };
async function defaultList(db, key, by) {
  const v = await setting(key, db);
  const arr = Array.isArray(v) ? v : (v?.[by] || v?._all || []);
  return arr.map(s => ({ ...ckItem(s), st: '', note: '' }));
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
    // có đơn giá nền → tính lại theo công thức «DM bảng hàng và sản phẩm»: F = đơn giá × DT thông thủy; H = F × %thuế;
    // I (sau thuế) = ROUND(F+H, -3); J (bảo trì) = ROUND(F×2%, -3); L (tổng cộng) = I + J + K (giá trị hoàn thiện)
    if (+r.base_price > 0 && +r.area_tt > 0) {
      const r3 = v => Math.round(v / 1000) * 1000, F = +r.base_price * +r.area_tt, H = F * (r.vat_pct ?? 5) / 100;
      Object.assign(r, { pretax: Math.round(F), tax_amt: Math.round(H), price_net: r3(F + H), maint_fee: r3(F * 0.02) });
      r.total_price = r.price_net + r.maint_fee + (+r.finish_value || 0);
    }
    if (r.total_price == null && r.price_net != null) r.total_price = r.price_net + (r.maint_fee || 0);
    if (r.total_price != null) r.list_price = r.total_price;   // giá niêm yết = Tổng cộng ở Danh mục sản phẩm
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
    r.project_id = r.project_ids?.[0] ?? null;   // dự án chính = dự án chọn đầu tiên
  },
  async afterApprove(r, ok, { db, user }) { if (ok && r.parent_id) await sys(db, 'price_policy', r.parent_id, { status: 'thay_the' }, user, 'thay_the', `Thay bằng phiên bản ${r.version}`); },
  acts: {
    async new_version(r, d, { db, user, demo }) {
      const keep = ['code', 'project_ids', 'unit_group', 'mode', 'unit_price', 'maint_pct', 'discount', 'pay_method', 'bank_policy', 'target', 'start_on', 'end_on', 'src_file'];
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
    if (r.code != null) r.code = String(r.code).trim().toUpperCase() || null;
    if (r.code && r.code !== old?.code) {
      const d = await db.one('SELECT code, full_name FROM kd_customer WHERE id <> $1 AND upper(code) = $2', [id, r.code]);
      if (d) bad(`Mã khách hàng ${r.code} đã có (khách ${d.full_name}) — nhập mã khác hoặc để trống để hệ thống tự cấp`);
    }
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
    if (!old && c?.stage === 'moi' && r.result !== 'chua_lien_he') await sys(db, 'customer', c.id, { stage: r.result === 'tu_choi' ? 'khong_nhu_cau' : 'dang_cham_soc' }, user, 'cap_nhat_trang_thai');
  },
};

// Khách tự sinh từ kênh liên hệ: tìm hồ sơ theo số điện thoại, chưa có thì tạo (nguồn = kênh), rồi ghi một dòng nhật ký tư vấn.
// Website / Messenger / Zalo đổ về qua /api/leads; gặp trực tiếp / Hotline do nhân viên thêm tay hoặc nhập Excel.
const LEAD_CH = { website: 'Website', messenger: 'Messenger', zalo: 'Zalo', hotline: 'Hotline', truc_tiep: 'Gặp trực tiếp' };
async function intakeLead(db, b, user, { demo } = {}) {
  const ch = LEAD_CH[b.channel] ? b.channel : bad(`Kênh không hợp lệ (${Object.keys(LEAD_CH).join(', ')})`);
  const phone = digits(b.phone).replace(/^84(?=\d{9}$)/, '0') || bad('Thiếu số điện thoại khách');
  const pj = b.interest_project ? +b.interest_project : b.project ? (await db.one('SELECT id FROM kd_project WHERE upper(code) = upper($1) OR name ILIKE $1', [String(b.project).trim()]))?.id : null;
  const owner_id = b.owner_id || user.id || null;
  let k = await db.one("SELECT id, owner_id FROM kd_customer WHERE $1 IN (regexp_replace(phone,'\\D','','g'), regexp_replace(coalesce(phone2,''),'\\D','','g'))", [phone]);
  const isNew = !k;
  if (!k) k = (await create('customer', { full_name: String(b.full_name || '').trim() || `Khách ${LEAD_CH[ch]} …${phone.slice(-3)}`, phone, email: b.email || null, source: ch,
    interest_project: pj, need: b.need || null, owner_id }, user, { db, system: true, demo })).row;
  const log = (await create('contact_log', { customer_id: k.id, at: b.at || new Date().toISOString(), channel: ch, content: String(b.content || '').trim() || `Khách để lại thông tin qua ${LEAD_CH[ch]}`,
    result: b.result || 'chua_lien_he', commitment: b.commitment || null, next_at: b.next_at || null, owner_id: owner_id || k.owner_id }, user, { db, system: true, demo })).row;
  return { customer_id: k.id, log_id: log.id, new_customer: isNew };
}

// mã căn phải có trong thông báo mở bán đã duyệt gần nhất của dự án — không có thì cảnh báo, vẫn cho lưu / trình duyệt
async function saleCheck(db, unitId, cache = new Map()) {   // cache: theo dự án (đợt gần nhất + id căn trong đợt) khi kiểm nhiều dòng
  const u = unitId && await raw(db, 'unit', unitId); if (!u) return null;
  if (!cache.has(u.project_id)) {
    const n = await db.one("SELECT * FROM kd_sale_notice WHERE project_id = $1 AND status = 'da_duyet' ORDER BY notice_on DESC NULLS LAST, id DESC LIMIT 1", [u.project_id]);
    cache.set(u.project_id, { n, ids: n ? new Set((await noticeUnits(db, n)).map(x => x.id)) : null });
  }
  const { n, ids } = cache.get(u.project_id);
  if (!n) return { ok: false, text: `⚠ Dự án chưa có thông báo mở bán được duyệt (căn ${u.code})` };
  return ids.has(u.id) ? { ok: true, text: `✓ Có trong ${n.code} · ${n.title}` } : { ok: false, text: `⚠ Căn ${u.code} không có trong thông báo mở bán gần nhất (${n.code} · ${n.title})` };
}
const saleWarn = async (db, r, warn) => { const sc = await saleCheck(db, r.unit_id); r.sale_check = sc?.text ?? null; if (sc && !sc.ok) warn.push(sc.text.slice(2)); };
const saleLive = async (db, rows) => { const c = new Map(); for (const r of rows) if (r.unit_id) r.sale_check = (await saleCheck(db, r.unit_id, c))?.text ?? r.sale_check; };   // danh sách / chi tiết: theo thông báo hiện tại

H.reservation = {
  async beforeSave(r, old, { db, warn, opts, user, demo }) {
    const changedUnit = !old || old.unit_id !== r.unit_id;
    const u = await raw(db, 'unit', r.unit_id);
    await saleWarn(db, r, warn);
    // ngày giờ đăng ký (reg_at) → ngày đăng ký (reg_date, giờ VN); phiếu hệ thống tạo chỉ có ngày thì suy ra giờ
    const vnDay = iso => new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(0, 10);
    if (!old && r.reg_date && (!r.reg_at || vnDay(r.reg_at) !== r.reg_date)) r.reg_at = new Date(r.reg_date === today() ? Date.now() : Date.parse(r.reg_date + 'T09:00:00+07:00')).toISOString();
    if (!r.reg_at) r.reg_at = new Date().toISOString();
    r.reg_date = vnDay(r.reg_at);
    // phiếu đăng ký căn hộ: trạng thái căn + tiến trình đi cùng nhau, tình trạng phiếu theo trạng thái căn (không qua duyệt)
    if (old && old.status !== r.status && ['huy', 'het_han'].includes(r.status)) r.reg_state = 'huy';     // hủy / giải phóng từ nơi khác
    if (old && !opts.system && old.reg_state !== r.reg_state) {
      if (old.reg_state === 'huy' || ['huy', 'het_han'].includes(old.status)) bad('Phiếu đã hủy đăng ký — lập phiếu mới cho khách');
      if (r.reg_state === 'huy' && old.status === 'chuyen_hd') bad('Phiếu đã lập hợp đồng — hủy qua «Hủy giao dịch – đổi căn»');
    }
    if (r.progress === 'da_ky' && r.reg_state === 'giu_cho') r.reg_state = 'ky_hdmb';
    if (r.reg_state === 'ky_hdmb' && (!old || old.reg_state !== 'ky_hdmb')) r.progress = 'da_ky';
    if (r.reg_state === 'huy') { if (!['huy', 'het_han'].includes(r.status)) r.status = 'huy'; }
    else if (!opts.system && (!r.status || ['nhap', 'tu_choi'].includes(r.status))) r.status = r.deposit > 0 ? 'da_coc' : 'giu_cho';
    // qua «Hạn giữ chỗ» mà chưa đặt cọc → «Quá hạn giữ chỗ»; gia hạn sang ngày sau → về lại «Giữ chỗ»
    const expired = !!r.hold_until && Date.parse(r.hold_until) < Date.now() && !(+r.deposit > 0);
    if (expired && r.reg_state === 'giu_cho') { r.reg_state = 'qua_han'; if (r.status === 'giu_cho') r.status = 'qua_han'; }
    else if (!expired && (r.reg_state === 'qua_han' || r.status === 'qua_han')) { if (r.reg_state === 'qua_han') r.reg_state = 'giu_cho'; if (r.status === 'qua_han') r.status = +r.deposit > 0 ? 'da_coc' : 'giu_cho'; }
    await linkCustomer(db, r, old, user, opts, demo);
    // MST / tài khoản ghi ở phiếu mà hồ sơ khách còn trống → bổ sung cho khách
    if (r.customer_id && !opts.check && (r.tax_code || r.bank_account)) {
      const c = await raw(db, 'customer', r.customer_id), up = {};
      for (const f of ['tax_code', 'bank_account']) if (r[f] && !c[f]) up[f] = r[f];
      if (Object.keys(up).length) await sys(db, 'customer', c.id, up, user, 'cap_nhat_tu_phieu_dang_ky');
    }
    if (changedUnit && !opts.system) {
      // căn còn trống (Còn bán / Chưa mở bán) mới lập phiếu được — căn chưa mở bán tự mở bán khi lưu phiếu
      if (!FREE_UNIT.includes(u.status)) bad(`Căn ${u.code} đang «${await C.optLabel(C.F.unit.status, u.status)}» — không giữ chỗ được`);
    }
    if (r.hold_until && r.reg_date && !opts.system && new Date(Date.parse(r.hold_until) + 7 * 3600e3).toISOString().slice(0, 10) < r.reg_date) bad('Hạn giữ chỗ phải sau ngày đăng ký');
    if (!old && r.hold_until && Date.parse(r.hold_until) < Date.now() && !opts.system) bad('Hạn giữ chỗ đã qua');
    if (['dai_ly', 'ctv'].includes(r.source) && !r.agent_id) {
      const c = await raw(db, 'customer', r.customer_id); if (c?.agent_id) r.agent_id = c.agent_id; else bad('Nguồn bán đại lý / CTV cần chọn đối tác');
    }
    if (r.source === 'truc_tiep') r.agent_id = null;
    if (changedUnit && old && ['huy', 'het_han'].includes(r.status)) bad('Phiếu đã hủy — không đổi căn được');
    if (changedUnit || r.price == null || !r.policy_id) {
      const p = await pricing(db, u, r.reg_date);
      // giá theo mã căn ở Danh mục sản phẩm: giá trị căn hộ = sau thuế + bảo trì; hoàn thiện = giá trị hoàn thiện căn
      if (r.unit_value == null || (old && changedUnit)) r.unit_value = u.price_net != null ? +u.price_net + (+u.maint_fee || 0) : u.total_price != null ? +u.total_price - (+u.finish_value || 0) : p.price;
      if (old ? changedUnit : r.finish_value == null) r.finish_value = u.finish_value;
      if (!r.policy_id) r.policy_id = p.policy?.id ?? null;   // nhân viên chọn chính sách thì giữ, để trống thì tự lấy
      if (!p.policy && !r.policy_id) warn.push('Không có chính sách bán hàng đang phát hành cho căn này — giá lấy theo bảng hàng');
    }
    if (r.unit_value != null) r.price = +r.unit_value + (+r.finish_value || 0);   // Tổng giá bán = giá trị căn hộ + hoàn thiện nội thất
    if (r.price == null) bad('Chưa có giá bán: nhập giá hoặc phát hành bảng giá cho dự án');
    if (r.deposit > r.price) bad('Tiền đặt cọc lớn hơn giá bán');
  },
  async onSubmit(r, { db }) {
    const u = await raw(db, 'unit', r.unit_id);
    if (!FREE_UNIT.includes(u.status)) bad(`Căn ${u.code} không còn trống (${await C.optLabel(C.F.unit.status, u.status)})`);
  },
  async onApprove(r, ok) { return ok ? { status: r.deposit > 0 ? 'da_coc' : 'giu_cho' } : null; },
  async afterApprove(r, ok, { db, user }) { await recomputeUnit(db, r.unit_id, user); if (ok) await markCustomer(db, r.customer_id, user); },
  async afterSave(r, old, { db, user }) {
    if (!old || old.unit_id !== r.unit_id) {
      const u = await raw(db, 'unit', r.unit_id);
      if (u && !u.activated && !u.lock) await sys(db, 'unit', u.id, { activated: true }, user, 'kich_hoat', 'Mở bán khi lập phiếu đăng ký căn hộ');
    }
    if (!old || old.status !== r.status || old.unit_id !== r.unit_id || old.deposit !== r.deposit || old.reg_state !== r.reg_state) await recomputeUnit(db, r.unit_id, user);
    if (r.customer_id && ['giu_cho', 'da_coc', 'chuyen_hd'].includes(r.status)) await markCustomer(db, r.customer_id, user);
    if (old && old.unit_id !== r.unit_id) await recomputeUnit(db, old.unit_id, user);
  },
  async decorate(rows, { db }) { await stageOf(db, rows); await saleLive(db, rows); },
  acts: {
    async deposit(r, d) { if (d.deposit > r.price) bad('Tiền đặt cọc lớn hơn giá bán'); return { patch: { deposit: d.deposit, deposit_on: d.deposit_on, status: 'da_coc' } }; },
    async extend(r, d) { if (Date.parse(d.hold_until) <= Date.now()) bad('Hạn mới phải sau thời điểm hiện tại'); return { patch: { hold_until: d.hold_until, status: r.deposit > 0 ? 'da_coc' : 'giu_cho' } }; },
    async release(r, d) { return { patch: { status: 'het_han' }, msg: r.deposit > 0 ? `Đã giải phóng căn. Khách đã cọc ${fmtMoney(r.deposit)}đ — xử lý theo chính sách (lập «Đề xuất hoàn tiền» nếu cần), hệ thống không tự hoàn tiền.` : 'Đã giải phóng căn' }; },
    async to_contract(r, d, { db, user, demo }) {
      const c = (await create('contract', { kind: d.kind, number: d.number, plan_sign: d.plan_sign, unit_id: r.unit_id, customer_id: r.customer_id, value: r.price, owner_id: r.owner_id || user.id, reservation_id: r.id },
        user, { db, system: true, demo })).row;
      await markCustomer(db, r.customer_id, user);
      return { patch: { status: 'chuyen_hd' }, open: ['contract', c.id], msg: `Đã lập dự thảo hợp đồng ${c.number}. Bước tiếp: lập lịch thanh toán → gửi trình duyệt.` };
    },
  },
};
const REG_ORDER = ['tiep_nhan', 'cho_xet_duyet', 'du_dk', 'da_ky'];
// khách trên phiếu: chọn sẵn → điền ô trống từ hồ sơ; chưa chọn → khớp theo CCCD rồi SĐT, không có thì tạo hồ sơ khách mới
async function linkCustomer(db, r, old, user, opts, demo) {
  const K = ['cust_name', 'id_no', 'id_date', 'id_place', 'address', 'phone', 'tax_code', 'bank_account'], CK = { cust_name: 'full_name' };
  if (r.customer_id && (!old || old.customer_id !== r.customer_id)) {
    const c = await raw(db, 'customer', r.customer_id);
    if (c) for (const k of K) if (r[k] == null || r[k] === '') r[k] = c[CK[k] || k];
  }
  if (r.cust_code) r.cust_code = String(r.cust_code).trim().toUpperCase() || null;
  if (!r.customer_id && r.cust_code && !opts.check) {   // gõ mã khách → dùng khách có mã đó
    const k = await db.one('SELECT id FROM kd_customer WHERE upper(code) = $1', [r.cust_code]);
    if (k) { r.customer_id = k.id; const c = await raw(db, 'customer', k.id); for (const f of K) if (r[f] == null || r[f] === '') r[f] = c[CK[f] || f]; }
  }
  if (r.customer_id) r.cust_code = (await raw(db, 'customer', r.customer_id))?.code ?? r.cust_code;
  if (r.phone) r.phone = String(r.phone).replace(/[\s.]/g, '');
  if (r.customer_id || opts.check || !r.cust_name || !r.phone) return;
  const c = (r.id_no && await db.one('SELECT id FROM kd_customer WHERE upper(id_no) = upper($1) ORDER BY id LIMIT 1', [r.id_no]))
    || await db.one("SELECT id FROM kd_customer WHERE regexp_replace($1,'\\D','','g') IN (regexp_replace(phone,'\\D','','g'), regexp_replace(coalesce(phone2,''),'\\D','','g')) ORDER BY id LIMIT 1", [r.phone]);
  if (c) { r.customer_id = c.id; const k = await raw(db, 'customer', c.id); for (const f of K) if (r[f] == null || r[f] === '') r[f] = k[CK[f] || f]; r.cust_code = k.code; return; }
  const nk = (await create('customer', { code: r.cust_code || undefined, full_name: r.cust_name, phone: r.phone, id_no: r.id_no, id_date: r.id_date, id_place: r.id_place, address: r.address, tax_code: r.tax_code, bank_account: r.bank_account,
    kind: 'giao_dich', source: r.source === 'dai_ly' ? 'dai_ly' : r.source === 'ctv' ? 'ctv' : 'truc_tiep', agent_id: r.agent_id, owner_id: r.owner_id || user?.id },
    user, { db, system: true, demo, note: 'Tự tạo từ phiếu đăng ký căn hộ' })).row;
  r.customer_id = nk.id; r.cust_code = nk.code;
}
async function markCustomer(db, id, user) { const c = await raw(db, 'customer', id); if (c && c.kind !== 'giao_dich') await sys(db, 'customer', id, { kind: 'giao_dich' }, user, 'cap_nhat_trang_thai'); }

// đối tượng chính sách (nguyên văn Mẫu 4) → nhóm đối tượng dùng cho danh mục giấy tờ
const grpOf = t => { const s = String(t || '').toLowerCase(); if (!s.trim()) return null;
  return /thu nhập thấp|nghèo/.test(s) ? 'cn_thu_nhap_thap' : /sĩ quan|quân nhân|công an|quân đội/.test(s) ? 'luc_luong_vt' : /doanh nghiệp|khu công nghiệp|công nhân/.test(s) ? 'cong_nhan' : /cán bộ|công chức|viên chức/.test(s) ? 'can_bo' : 'khac'; };
// hồ sơ NOXH: dòng «2.1 Thông tin chủ hộ» (cột như Mẫu 4) ↔ cột Mẫu 4 của hồ sơ + hồ sơ khách hàng (họ tên, SĐT, ngày sinh, CCCD)
const HEAD_COLS = ['old_id_no', 'job', 'doi_tuong', 'confirm_org', 'housing', 'province', 'district', 'commune', 'income'];
async function noxhHead(db, r, old, user, demo) {
  const h = Array.isArray(r.head) ? r.head[0] : null, t = v => String(v ?? '').trim();
  const k = r.customer_id ? await raw(db, 'customer', r.customer_id) : null;
  if (!h || !(t(h.name) || t(h.phone) || t(h.id_no))) {   // hồ sơ cũ / nhập file Mẫu 4: dựng dòng chủ hộ từ dữ liệu đang có
    const [y, m, d] = String(k?.birth || '').split('-');
    r.head = [{ name: k?.full_name || '', phone: [k?.phone, k?.phone2].filter(Boolean).join('/ '), bday: d ? String(+d) : '', bmonth: m ? String(+m) : '', byear: y || '', id_no: k?.id_no || '',
      ...Object.fromEntries(HEAD_COLS.map(c => [c, r[c] || ''])), relation: 'Chủ hộ' }];
    return;
  }
  const oh = Array.isArray(old?.head) ? old.head[0] || {} : {};   // ô định danh bị che (•••) với người không có quyền xem → giữ số cũ
  for (const [c, v] of Object.entries(h)) if (String(v ?? '').startsWith('•')) h[c] = oh[c] ?? (c === 'old_id_no' ? old?.old_id_no : '') ?? '';
  for (const c of HEAD_COLS) r[c] = t(h[c]) || null;
  h.relation = 'Chủ hộ';
  const dd = +h.bday, mm = +h.bmonth, yy = +h.byear;
  if (t(h.bday) && !(dd >= 1 && dd <= 31)) bad('Chủ hộ: ngày sinh phải từ 1 đến 31');
  if (t(h.bmonth) && !(mm >= 1 && mm <= 12)) bad('Chủ hộ: tháng sinh phải từ 1 đến 12');
  if (t(h.byear) && !(yy >= 1900 && yy <= 2100)) bad('Chủ hộ: năm sinh không hợp lệ');
  const birth = dd && mm && yy ? `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` : null;
  const [phone, phone2] = t(h.phone).split(/\s*[\/;,]\s*/).map(x => x.replace(/[\s.]/g, '')).filter(Boolean);
  const patch = { full_name: t(h.name) || undefined, phone, phone2, id_no: t(h.id_no) || undefined, birth: birth || undefined };
  for (const x of Object.keys(patch)) if (patch[x] === undefined) delete patch[x];
  if (!r.customer_id) {   // chưa chọn khách: khớp theo CCCD rồi SĐT, không có thì tạo khách mới
    const c = (patch.id_no && await db.one('SELECT id FROM kd_customer WHERE upper(id_no) = upper($1) ORDER BY id LIMIT 1', [patch.id_no]))
      || (phone && await db.one("SELECT id FROM kd_customer WHERE regexp_replace($1,'[^0-9]','','g') IN (regexp_replace(phone,'[^0-9]','','g'), regexp_replace(coalesce(phone2,''),'[^0-9]','','g')) ORDER BY id LIMIT 1", [phone]));
    if (c) r.customer_id = c.id;
    else {
      if (!patch.full_name || !phone) bad('Chủ hộ: cần họ tên và số điện thoại (hoặc chọn khách hàng)');
      r.customer_id = (await create('customer', { ...patch, address: [r.commune, r.district, r.province].filter(Boolean).join(', ') || null, kind: 'giao_dich', source: 'truc_tiep', owner_id: r.owner_id || user?.id },
        user, { db, system: true, demo, note: 'Tự tạo từ hồ sơ mua NOXH' })).row.id;
      return;
    }
  }
  const cur = await raw(db, 'customer', r.customer_id), diff = {};
  for (const [x, v] of Object.entries(patch)) if (String(cur[x] ?? '') !== String(v)) diff[x] = v;
  if (Object.keys(diff).length) await sys(db, 'customer', cur.id, diff, user, 'sua', `Theo hồ sơ mua NOXH${r.id ? ' #' + r.id : ''}`);
}

H.noxh_check = {
  async decorate(rows, { db, one }) { if (one) await saleLive(db, rows); },
  async beforeSave(r, old, { db, warn, user, opts, demo }) {
    if (r.reservation_id && (!old || old.reservation_id !== r.reservation_id)) { const s = await raw(db, 'reservation', r.reservation_id); r.customer_id = s.customer_id; r.unit_id = s.unit_id; }
    if (!opts?.check) await noxhHead(db, r, old, user, demo);
    if (!r.customer_id) bad('Nhập thông tin chủ hộ hoặc chọn khách hàng');
    if (r.unit_id) { const u = await raw(db, 'unit', r.unit_id); r.project_id = u.project_id; r.unit_area = u.area_tt; }   // diện tích theo Danh mục sản phẩm
    await saleWarn(db, r, warn);
    // hồ sơ lập xong → gắn vào phiếu đăng ký đang hiệu lực của khách (cùng căn nếu đã chọn căn) để in biên bản / cập nhật tiến trình từ phiếu
    if (!r.reservation_id && r.customer_id) r.reservation_id = (await db.one(`SELECT id FROM kd_reservation WHERE customer_id = $1 AND status IN ('cho_duyet','giu_cho','qua_han','da_coc','chuyen_hd')
      AND ($2::int IS NULL OR unit_id = $2) ORDER BY id DESC LIMIT 1`, [r.customer_id, r.unit_id ?? null]))?.id ?? null;
    if (r.reservation_id) { const s = await raw(db, 'reservation', r.reservation_id); r.customer_id = s.customer_id; r.unit_id = s.unit_id; }
    if (!r.reg_kind) r.reg_kind = 'mua';
    if (!r.grp) r.grp = grpOf(r.doi_tuong) || bad('Chọn nhóm đối tượng hoặc ghi đối tượng chính sách');
    const rel = (r.members || []).filter(m => !m.relation); if (rel.length) bad(`Thành viên hộ «${rel[0].name || '(chưa có tên)'}»: chọn quan hệ với chủ hộ`);
    for (const m of r.members || []) {
      const who = `Thành viên hộ «${m.name || '(chưa có tên)'}»`, dd = +m.bday, mm = +m.bmonth, yy = +m.byear;   // ô bị che (•••) đã được khôi phục trước khi vào đây
      if (m.bday && !(dd >= 1 && dd <= 31)) bad(`${who}: ngày sinh phải từ 1 đến 31`);
      if (m.bmonth && !(mm >= 1 && mm <= 12)) bad(`${who}: tháng sinh phải từ 1 đến 12`);
      if (m.byear && !(yy >= 1900 && yy <= 2100)) bad(`${who}: năm sinh không hợp lệ`);
    }
    if ((!r.items || !r.items.length) && r.grp) r.items = await defaultList(db, 'checklist_noxh', r.grp);
    const it = r.items || [];
    r.result = it.length && it.every(x => x.st === 'da_nhan') ? 'du' : it.some(x => ['thieu', 'can_sua'].includes(x.st)) ? 'can_bo_sung' : 'chua_kt';
    if (r.result === 'can_bo_sung' && !r.supplement_due) warn.push('Hồ sơ cần bổ sung nhưng chưa đặt hạn bổ sung');
  },
  // trình xét duyệt: phải khai đủ các cột của Mẫu 4 (nháp thì lưu thiếu được)
  async onSubmit(r) {
    const miss = E.noxh_check.fields.filter(f => f.m4 && !String(r[f.k] ?? '').trim()).map(f => f.l);
    if (miss.length) bad('Chưa khai đủ thông tin Mẫu 4: ' + miss.join(', '));
  },
  async afterSave(r, old, { db, user }) {
    // lịch ký nhập ở hồ sơ → sang hợp đồng chưa duyệt của khách (cùng căn nếu hồ sơ đã chọn căn)
    if (['plan_sign', 'sign_place', 'sign_status'].some(k => String(old?.[k] ?? '') !== String(r[k] ?? '')))
      await db.q(`UPDATE kd_contract SET plan_sign = $1, sign_place = $2, sign_status = coalesce($3, sign_status), updated_at = now() WHERE customer_id = $4 AND ($5::int IS NULL OR unit_id = $5) AND status IN ('du_thao', 'cho_duyet', 'tu_choi')`,
        [r.plan_sign ?? null, r.sign_place ?? null, r.sign_status ?? null, r.customer_id, r.unit_id ?? null]);
    if (!r.reservation_id || old?.status === r.status) return;
    const s = await raw(db, 'reservation', r.reservation_id), to = { cho_duyet: 'cho_xet_duyet', da_duyet: 'du_dk' }[r.status];
    if (s && to && REG_ORDER.indexOf(to) > REG_ORDER.indexOf(s.progress)) await sys(db, 'reservation', s.id, { progress: to }, user, 'cap_nhat_tien_trinh', `Theo hồ sơ NOXH #${r.id}`);
  },
  acts: {
    async review(r, d, { user }) {
      const reviews = [...(r.reviews || []), { step: d.step, conclusion: d.conclusion, note: d.note || '', by: user.full_name, at: new Date().toISOString() }];
      return { patch: { reviews, ...(d.conclusion === 'can_bo_sung' ? { result: 'can_bo_sung' } : {}) } };
    },
  },
};

// phiếu đề nghị hủy / đổi: chọn hợp đồng hoặc phiếu giữ chỗ → khách hàng, SĐT, dự án, mã căn, số tiền khách đã nộp
async function cancelPrefill(db, { contract_id, reservation_id, unit_id }) {
  if (unit_id && !contract_id && !reservation_id) {   // chọn căn → hợp đồng / phiếu giữ chỗ đang hiệu lực của căn
    contract_id = (await db.one("SELECT id FROM kd_contract WHERE unit_id = $1 AND kind <> 'hoan_thien' AND status NOT IN ('huy','thanh_ly') ORDER BY id DESC LIMIT 1", [+unit_id]))?.id;
    if (!contract_id) reservation_id = (await db.one(`SELECT id FROM kd_reservation WHERE unit_id = $1 AND status IN ${ACTIVE_RES} ORDER BY id DESC LIMIT 1`, [+unit_id]))?.id;
    if (!contract_id && !reservation_id) { const u = await raw(db, 'unit', +unit_id), p = u && await raw(db, 'project', u.project_id);
      return { contract_id: null, contract_label: '', reservation_id: null, reservation_label: '', cust_name: '', phone: '', project_id: p?.id ?? null, project_label: p ? `${p.code} · ${p.name}` : '', unit_id: u?.id ?? null, unit_label: u?.code || '', paid: 0 }; }
  }
  const c = contract_id && await raw(db, 'contract', +contract_id), res = (c?.reservation_id || reservation_id) && await raw(db, 'reservation', +(c?.reservation_id || reservation_id));
  const unitId = c?.unit_id || res?.unit_id, custId = c?.customer_id || res?.customer_id;
  const u = unitId && await raw(db, 'unit', unitId), k = custId && await raw(db, 'customer', custId), p = u && await raw(db, 'project', u.project_id);
  const paid = c ? (await debtOf(db, [c.id])).get(c.id).paid : +res?.deposit || 0;
  return { contract_id: c?.id ?? null, contract_label: c?.number || '', reservation_id: res?.id ?? null, reservation_label: res?.code || '', cust_name: k?.full_name || res?.cust_name || '', phone: k?.phone || res?.phone || '',
    project_id: p?.id ?? null, project_label: p ? `${p.code} · ${p.name}` : '', unit_id: u?.id ?? null, unit_label: u?.code || '', paid };
}

// thông báo mở bán: căn thuộc đợt theo «Căn hộ mở bán» (* = cả dự án / mã tòa / mã căn)
async function noticeUnits(db, n) {
  const g = String(n.unit_group || '').split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);   // chỉ các căn / tòa đã tích
  const us = await db.q('SELECT u.id, u.code, u.status, u.activated, u.lock, u.floor, u.area_tt, u.area_xd, b.code b FROM kd_unit u JOIN kd_building b ON b.id = u.building_id WHERE u.project_id = $1 ORDER BY b.code, u.floor, u.code', [n.project_id]);
  return us.filter(u => g.includes('*') || g.includes(String(u.b).toUpperCase()) || g.includes(u.code.toUpperCase()));
}
H.sale_notice = {
  noDelete: r => r.status !== 'nhap' && 'Chỉ xóa được thông báo đang ở bản nháp',
  async beforeSave(r) {
    if (r.close_on && r.open_on && r.close_on < r.open_on) bad('Ngày kết thúc nhận hồ sơ phải sau ngày bắt đầu');
    if (!String(r.unit_group || '').trim()) bad('Tích chọn căn hộ mở bán');
  },
  async onSubmit(r, { db }) { if (!(await noticeUnits(db, r)).length) bad('Đợt mở bán chưa có căn nào'); },
  // duyệt (phát hành): căn trong đợt chưa mở bán → kích hoạt «Còn bán»
  async afterApprove(r, ok, { db, user }) {
    if (!ok) return;
    for (const u of await noticeUnits(db, r)) if (!u.activated && !u.lock) { await sys(db, 'unit', u.id, { activated: true }, user, 'kich_hoat', `Theo thông báo mở bán ${r.code}`); await recomputeUnit(db, u.id, user); }
  },
  // theo dõi: số căn trong đợt, đã đăng ký / giữ chỗ (đã có phiếu đăng ký hoặc hợp đồng), còn trống
  async decorate(rows, { db, one }) {
    for (const r of rows) {
      const us = await noticeUnits(db, r);
      if (one) r._units = us.map(u => ({ code: u.code, area_tt: u.area_tt, area_xd: u.area_xd }));   // màn chi tiết: bảng căn mở bán như «DS mở bán» Excel
      r.n_units = us.length; r.n_free = us.filter(u => u.status === 'con_ban').length;
      r.n_reg = us.filter(u => !['con_ban', 'chua_mo_ban', 'tam_khoa', 'ngung_kd'].includes(u.status)).length;
    }
  },
};

H.cancel_req = {
  async beforeSave(r, old, { db }) {
    // thông tin khách hàng theo hợp đồng / phiếu giữ chỗ (chọn lại thì lấy lại); số tiền đề nghị để trống = số khách đã nộp
    if (r.contract_id || r.reservation_id) {
      const src = !old || old.contract_id !== r.contract_id || old.reservation_id !== r.reservation_id;
      const f = await cancelPrefill(db, r);
      for (const k of ['cust_name', 'phone', 'project_id', 'unit_id']) if (src || r[k] == null || r[k] === '') r[k] = f[k];
      if (r.pay_amount == null) r.pay_amount = f.paid || null;
    }
    // ngày đề nghị chi trả: để trống / đổi ngày thanh lý hoặc thời gian chờ → ngày ký thanh lý + thời gian chờ; ghi ngày thì tự đổi tình trạng
    if (r.wait_days == null) r.wait_days = 30;
    if (r.liquidate_on && (!r.pay_due || (old && (old.liquidate_on !== r.liquidate_on || +old.wait_days !== +r.wait_days) && r.pay_due === old.pay_due))) r.pay_due = C.addDays(r.liquidate_on, +r.wait_days || 0);
    if (r.acct_on && r.acct_status !== 'da') r.acct_status = 'da';
    if (r.paid_on && !['da_chi', 'mot_phan'].includes(r.pay_status)) r.pay_status = 'da_chi';
    if (r.pay_status === 'da_chi' && !r.paid_on) bad('Ghi «Ngày chi tiền thực tế» khi tình trạng là Đã chi');
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

// hợp đồng được duyệt là đã ký: ngày ký thực tế = ngày ký HĐMB trên hợp đồng (ghi ngày tương lai thì lấy hôm nay)
const signedPatch = r => { const d = String(r.contract_on || today()).slice(0, 10); return { status: 'da_ky', signed_on: d > today() ? today() : d, sign_status: 'da_ky' }; };
H.contract = {
  onApprove(r, ok) { if (ok) return { patch: signedPatch(r) }; },
  // danh sách: hợp đồng cũ chưa có thông tin bên mua / chi tiết giá thì hiện theo khách hàng và căn
  async listFill(rows, db) {
    if (!rows.length) return;
    const ks = await db.q('SELECT id, full_name, id_no, id_date, id_place, address, phone FROM kd_customer WHERE id = ANY($1)', [rows.map(r => r.customer_id)]);
    const us = await db.q('SELECT id, area_tt, base_price, pretax, vat_pct, tax_amt, price_net, maint_fee FROM kd_unit WHERE id = ANY($1)', [rows.map(r => r.unit_id)]);
    const K = new Map(ks.map(x => [x.id, x])), U = new Map(us.map(x => [x.id, x]));
    for (const r of rows) {
      const k = K.get(r.customer_id) || {}, u = U.get(r.unit_id) || {};
      r.b_name = k.full_name; r.b_id_no ??= k.id_no; r.b_id_date ??= k.id_date; r.b_id_place ??= k.id_place; r.b_addr ??= k.address; r.b_phone ??= k.phone;
      r.area_tt ??= u.area_tt; r.base_price ??= u.base_price; r.pretax ??= u.pretax; r.vat_pct ??= u.vat_pct; r.vat_amt ??= u.tax_amt; r.after_tax ??= u.price_net; r.maint_fee ??= u.maint_fee;
    }
  },
  // danh sách theo nhóm: ?group=can_ho | lien_ke
  where(qs) { if (['can_ho', 'lien_ke'].includes(qs.group)) return { sql: 't.ptype = $1', params: [qs.group] }; },
  async beforeSave(r, old, ctx) {
    const { db, opts } = ctx;
    r.number = r.number?.trim().toUpperCase().replace(/\s+/g, '') || null;
    // phân loại theo loại căn
    if (!old || old.unit_id !== r.unit_id || !r.ptype) { const u0 = await raw(db, 'unit', r.unit_id); if (u0) r.ptype = ['lien_ke', 'shophouse'].includes(u0.kind) ? 'lien_ke' : 'can_ho'; }
    // số hợp đồng để trống → HDCH.YYMM-0001 / HDLK.YYMM-0001
    if (!r.number) r.number = await nextContractNo(db, r.ptype, r.contract_on);
    if (!old && !r.plan_sign) {   // hợp đồng mới: lấy lịch ký đã nhập ở Hồ sơ mua NOXH
      const n = await db.one('SELECT plan_sign, sign_place, sign_status FROM kd_noxh_check WHERE customer_id = $1 AND plan_sign IS NOT NULL ORDER BY (unit_id = $2) DESC NULLS LAST, id DESC LIMIT 1', [r.customer_id, r.unit_id]);
      if (n) Object.assign(r, n);
    }
    // số bảng giá = tòa của căn (Danh mục sản phẩm); chính sách giá lấy theo phiếu giữ chỗ / chính sách đang phát hành
    r.building_id = (await raw(db, 'unit', r.unit_id))?.building_id ?? null;
    if (!r.price_policy_id) r.price_policy_id = (await contractPrefill(db, r.unit_id, r.contract_on || undefined)).policy_id;
    // chung cư có giá nền: tính như BRAVO / Danh mục sản phẩm — chỉ khi tạo mới hoặc đổi ô giá (hợp đồng cũ giữ nguyên số)
    const PK = ['base_price', 'area_tt', 'floor_price', 'area_floor', 'discount', 'corner_pct', 'vat_pct', 'finish_value', 'unit_id'];
    if (r.ptype !== 'lien_ke' && +r.base_price > 0 && +r.area_tt > 0 && (!old || PK.some(k => String(old[k] ?? '') !== String(r[k] ?? '')))) Object.assign(r, contractPrice(r));
    if (r.pretax > 0 && r.vat_pct != null && r.vat_amt == null) r.vat_amt = Math.round(r.pretax * r.vat_pct / 100);
    if (r.pretax > 0 && r.after_tax == null) r.after_tax = r.pretax + (r.vat_amt || 0);
    if (!(r.value > 0)) bad('Giá trị hợp đồng phải > 0');
    if (r.loan_status === 'co_vay' && !String(r.loan_bank || '').trim()) bad('Có vay: ghi ngân hàng cho vay');
    if (r.loan_status !== 'co_vay') { r.loan_bank = null; r.loan_doc3 = null; }
    // bảng «Lần thanh toán» trên form: kiểm tra khớp Tổng tiền (ghi thành lịch thu ở afterSave)
    // không lưu vào cột (lịch thu nằm ở kd_installment) — chuyển sang afterSave qua ctx
    ctx.sched = Array.isArray(r.new_schedule) && r.new_schedule.length ? await normSchedule(db, r.new_schedule.map(x => x.pct != null ? { ...x, amount: null } : x), r.value, 'Lần thanh toán') : null;
    r.new_schedule = null;
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
    if (r.kind !== 'thue' && !n.n) bad('Chưa lập lịch thanh toán — bấm «Lập lịch thanh toán» trước khi gửi trình duyệt');
    if (n.n && n.s !== r.value) bad(`Tổng lịch thanh toán ${fmtMoney(n.s)} khác giá trị hợp đồng ${fmtMoney(r.value)}`);
  },
  async afterSave(r, old, { db, user, demo, sched }) {
    if (sched?.length && ['du_thao', 'tu_choi', 'cho_duyet', 'cho_ky'].includes(r.status)) {   // ghi lịch thu khi khác lịch đang có
      const cur = await db.q('SELECT name, due_on, pct, amount FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [r.id]);
      const key = xs => JSON.stringify(xs.map(x => [x.name, String(x.due_on).slice(0, 10), x.pct == null ? null : +x.pct, +x.amount]));
      if (key(cur) !== key(sched)) await writeSchedule(db, r.id, sched, 'hop_dong', user, demo);
    }
    if (r.status === 'da_ky' && old?.status !== 'da_ky' && r.reservation_id && r.kind !== 'hoan_thien') {
      const s = await raw(db, 'reservation', r.reservation_id);
      if (s && s.reg_state !== 'ky_hdmb') await sys(db, 'reservation', s.id, { reg_state: 'ky_hdmb', progress: 'da_ky' }, user, 'cap_nhat_tien_trinh', `Đã ký hợp đồng ${r.number}`);
    }
    if (!old || old.status !== r.status || old.unit_id !== r.unit_id) { await recomputeUnit(db, r.unit_id, user); if (old && old.unit_id !== r.unit_id) await recomputeUnit(db, old.unit_id, user); }
    if (old && old.status !== r.status) await refreshCommission(db, r.id, user);
  },
  async decorate(rows, { db, one }) {
    const D = await debtOf(db, rows.map(r => r.id));
    for (const r of rows) { const d = D.get(r.id); r.paid = d.paid; r.left = d.left; r.overdue = d.overdue; if (one) r._debt = d; }
    if (!one) await H.contract.listFill(rows, db);
    if (one && rows[0]) rows[0].new_schedule = (await db.q('SELECT name, due_on, pct, amount FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [rows[0].id]))
      .map(x => ({ name: x.name, due_on: x.due_on, pct: x.pct == null ? null : +x.pct, amount: x.pct == null ? +x.amount : null }));   // form sửa: lịch thu đang có
  },
  acts: {
    async schedule(r, d, { db, user, demo }) {
      const rows = await normSchedule(db, d.rows, r.value);
      await writeSchedule(db, r.id, rows, 'hop_dong', user, demo);
      return { msg: `Đã lập ${rows.length} kỳ thu, tổng ${fmtMoney(r.value)}đ` };
    },
    async liquidate() { return { patch: { status: 'thanh_ly' } }; },
    async print(r) { return { url: `/print/contract/${r.id}` }; },
  },
  noDelete: r => r.status !== 'du_thao' && 'Chỉ xóa được dự thảo chưa gửi trình duyệt',
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
// giữ chỗ quá hạn (chưa đặt cọc) → trạng thái căn hộ + tình trạng phiếu «Quá hạn giữ chỗ» (không tự giải phóng, không tự hoàn tiền)
async function expireHolds(db) {   // chỉ đổi 2 cột trạng thái (không qua kiểm tra phiếu — dữ liệu cũ sai ngày không chặn cả lượt) + ghi nhật ký
  const rows = await db.q(`UPDATE kd_reservation SET reg_state = 'qua_han', status = CASE WHEN status = 'giu_cho' THEN 'qua_han' ELSE status END, updated_at = now()
    WHERE hold_until < now() AND coalesce(deposit, 0) = 0 AND (reg_state = 'giu_cho' OR status = 'giu_cho') AND status IN ('nhap','cho_duyet','giu_cho','qua_han') RETURNING id, status, is_demo`);
  for (const r of rows) await C.audit(db, 'reservation', r.id, 'qua_han_giu_cho', null, { reg_state: 'qua_han', status: r.status }, null, 'Qua hạn giữ chỗ', r.is_demo);
}
async function jobs(db) {
  const t0 = Date.now();
  await expireHolds(db);
  // hợp đồng duyệt trước 31/10/2026 đang «Chờ ký» → chuyển Đã ký như quy trình mới
  for (const c of await db.q("SELECT * FROM kd_contract WHERE status = 'cho_ky'")) await sys(db, 'contract', c.id, signedPatch(c), null, 'tu_dong_da_ky', 'Hợp đồng đã duyệt tự chuyển Đã ký');
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

module.exports = { ckItem, saleCheck, nextContractNo, contractPrefill, syncStages, H, LEAD_CH, intakeLead, debtOf, PAY_ST, recomputeUnit, expireHolds, pricing, normSchedule, writeSchedule, syncContractValue, contractPrice, cancelPrefill, refreshCommission, handoverCond, defaultList, noticeTargets, jobs };
