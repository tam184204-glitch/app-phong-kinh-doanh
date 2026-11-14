// Luật nghiệp vụ riêng từng mẫu biểu (gắn vào core qua hooks).
// Nguyên tắc: một mã căn là một hồ sơ xuyên suốt — trạng thái căn luôn tính lại từ giao dịch, hợp đồng, bàn giao;
// công nợ tính từ lịch thanh toán hiệu lực + chứng từ thu (Bravo), không ai sửa tay số thực thu.
const C = require('./core');
const { ACTIVE_RES } = require('./schema');
const { PROSPECT_ST, E } = require('./meta');
const { bad, raw, sys, create, setting, today, addDays, dayDiff, dmy, fmtMoney, labelOf } = C;

// ======================= CÔNG NỢ =======================
// Phân bổ thu: chứng từ chỉ định kỳ thì vào kỳ đó trước, phần còn lại vào kỳ đến hạn sớm nhất (FIFO).
// asOf (YYYY-MM-DD): tính tại ngày đó — chỉ chứng từ thu đến ngày đó, đến hạn / quá hạn so với ngày đó
async function debtOf(db, ids, asOf) {
  ids = [...new Set(ids.filter(Boolean).map(Number))];
  const M = new Map(ids.map(id => [id, { total: 0, paid: 0, left: 0, due: 0, overdue: 0, due7: 0, credit: 0, next: null, overdue_since: null, overdue_days: 0, last_receipt: null, inst: [] }]));
  if (!ids.length) return M;
  const t = asOf || today(), t7 = addDays(t, 7);
  for (const i of await db.q('SELECT id, contract_id, seq, name, due_on, pct, amount, is_maint, src FROM kd_installment WHERE active AND contract_id = ANY($1) ORDER BY contract_id, due_on, seq', [ids]))
    M.get(i.contract_id).inst.push({ ...i, paid: 0 });
  const pool = new Map();
  for (const r of await db.q("SELECT contract_id, installment_id, amount, voucher_date FROM kd_receipt WHERE status = 'hop_le' AND contract_id = ANY($1) AND voucher_date <= coalesce($2::date, voucher_date) ORDER BY voucher_date, id", [ids, asOf || null])) {
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
// hợp đồng đang giữ căn: chưa hủy / thanh lý; HĐ thuê đã quá ngày kết thúc thì không giữ căn nữa (hết kỳ thuê căn bán / cho thuê tiếp được) — $T = hôm nay
const LIVE_CT = (a, T) => `${a}.status NOT IN ('huy','thanh_ly') AND NOT (${a}.kind = 'thue' AND coalesce(${a}.nature, 'thue') <> 'ban' AND coalesce(${a}.exp_on, 'infinity'::date) < ${T})`;
async function recomputeUnit(db, unitId, user) {
  const u = unitId && await raw(db, 'unit', unitId); if (!u) return;
  let st;
  if (u.lock) st = u.lock;
  else {   // căn đã có hợp đồng thì theo hợp đồng (kể cả căn chưa mở bán bán qua HĐ vay / HĐ thuê)
    const c = await db.one(`SELECT c.id, c.status FROM kd_contract c WHERE c.unit_id = $1 AND c.kind IN ('hdmb','vay','thue','thue_mua') AND ${LIVE_CT('c', '$2::date')} ORDER BY (c.status = 'da_ky') DESC, c.id DESC LIMIT 1`, [unitId, today()]);   // có HĐ đã ký thì theo HĐ đó
    let r = await db.one(`SELECT status, deposit, reg_state FROM kd_reservation WHERE unit_id = $1 AND status IN ${ACTIVE_RES}`, [unitId]);
    const h = await db.one('SELECT status FROM kd_handover WHERE unit_id = $1', [unitId]);
    if (!c && r?.status === 'chuyen_hd') r = null;   // phiếu đã chuyển hợp đồng nhưng hợp đồng không còn giữ căn (HĐ thuê hết hạn)
    if (c && h && ['da_ban_giao', 'hoan_tat'].includes(h.status)) st = 'da_ban_giao';   // 13/11/2026: trước bị dòng dưới ghi đè → căn không bao giờ «Đã bàn giao»
    else if (c?.status === 'da_ky' || r?.reg_state === 'ky_hdmb') st = 'da_ky_hd';
    else if (c) st = r?.deposit > 0 || r?.status === 'da_coc' ? 'da_coc' : 'giu_cho';
    else if (r) st = r.status === 'da_coc' || r.deposit > 0 ? 'da_coc' : 'giu_cho';
    else st = u.activated ? 'con_ban' : 'chua_mo_ban';
  }
  if (st !== u.status) await sys(db, 'unit', u.id, { status: st }, user, 'cap_nhat_trang_thai');
}

// HĐ thuê / HĐ vay bán căn (14/11/2026): tra cứu ở tab công nợ của HĐ — tiến độ thu tiền HĐMB (sale_sched) đã thu tới đâu + tình hình thu tiền HĐ vay cùng căn.
// Đã thu HĐMB: HĐ thuê có HĐ vay cùng căn → gốc khách đã chuyển theo HĐ vay; còn lại → phiếu thu của chính hợp đồng (giống Bảng tổng hợp công nợ). Chia theo thứ tự hạn
async function saleTrack(db, c, asOf) {
  const t = asOf || today(), t7 = addDays(t, 7);
  const vays = c.kind === 'vay' ? [c] : await db.q("SELECT * FROM kd_contract WHERE kind = 'vay' AND status NOT IN ('huy','thanh_ly') AND unit_id = $1 ORDER BY id", [c.unit_id]);
  const D = await debtOf(db, [c.id, ...vays.map(v => v.id)], t);
  const pair = c.kind === 'thue' && vays.length, vPaid = vays.reduce((s, v) => s + (+D.get(v.id)?.paid || 0), 0);
  let left = pair ? vPaid : +D.get(c.id)?.paid || 0;
  const st = (i, rem) => rem <= 0 ? 'da_thu' : i.due_on < t ? 'qua_han' : i.due_on === t ? 'den_han' : i.due_on <= t7 ? 'sap_den_han' : i.paid > 0 ? 'mot_phan' : 'chua_den_han';
  const rows = (Array.isArray(c.sale_sched) ? c.sale_sched : []).map((x, k) => ({ seq: k + 1, name: x.name, due_on: String(x.due_on || '').slice(0, 10), pct: x.pct ?? null, amount: +x.amount || 0, maint: !!x.maint }))
    .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.seq - b.seq);
  for (const i of rows) { i.paid = Math.min(i.amount, left); left -= i.paid; i.rem = i.amount - i.paid; i.st = st(i, i.rem); }
  const sum = (xs, k) => xs.reduce((s, x) => s + x[k], 0), total = sum(rows, 'amount'), paid = sum(rows, 'paid'), od = rows.filter(i => i.st === 'qua_han'), nx = rows.find(i => i.rem > 0 && i.due_on >= t);
  const sale = { rows, total, paid, extra: left, left: total - paid, paid_pct: total ? Math.round(paid / total * 1000) / 10 : 0, overdue: sum(od, 'rem'),
    overdue_days: od.length ? Math.round((Date.parse(t) - Date.parse(od[0].due_on)) / 864e5) : 0, next: nx ? { name: nx.name, rem: nx.rem, due_on: nx.due_on } : null, value: +c.unit_total || 0,
    src: pair ? `Đã thu = gốc khách đã chuyển theo HĐ vay ${vays.map(v => v.number).filter(Boolean).join(', ')}` : `Đã thu = phiếu thu của hợp đồng ${c.number || ''}` };
  const ids = vays.map(v => v.id);
  const RC = ids.length ? await db.q("SELECT contract_id, voucher_date, voucher_no, content, amount FROM kd_receipt WHERE status = 'hop_le' AND contract_id = ANY($1) AND voucher_date <= $2 ORDER BY voucher_date, id", [ids, t]) : [];
  const GT = ids.length ? await db.q("SELECT contract_id, sum(coalesce(paid_amt, 0)) s FROM kd_loan_pay WHERE kind = 'goc' AND contract_id = ANY($1) AND (paid_on IS NULL OR paid_on <= $2) GROUP BY 1", [ids, t]) : [];
  const vay = vays.map(v => { const d = D.get(v.id); return { id: v.id, number: v.number, status: v.status, value: +v.value || 0, debt: { ...d, inst: d.inst.map(i => ({ seq: i.seq, name: i.name, due_on: i.due_on, pct: i.pct, amount: +i.amount, paid: i.paid, st: i.st })) },
    receipts: RC.filter(r => r.contract_id === v.id), goc_tra: +(GT.find(g => g.contract_id === v.id)?.s || 0) }; });
  return { as_of: t, kind: c.kind, sale, vay };
}
// ======================= GIÁ =======================
// chính sách áp cho căn: Căn hộ áp dụng có «*», mã tòa hoặc mã căn
const polHas = (p, code, bcode) => { const g = String(p.unit_group || '*').split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean); return g.includes('*') || g.includes(String(bcode).toUpperCase()) || g.includes(String(code).toUpperCase()); };
// đối tượng áp dụng: seller_types (khach_gt/ctv/cbnv/san) khớp «Nguồn bán» của phiếu; seller_ids = chỉ sàn / CTV cụ thể. Trống cả hai = mọi người bán. s undefined = không lọc
const SRC_T = { truc_tiep: 'truc_tiep', dai_ly: 'san', ctv: 'ctv', khach_gt: 'khach_gt', cbnv: 'cbnv' };   // nguồn bán của phiếu → nhóm «Đối tượng áp dụng»
const polFor = (p, s) => {
  if (!s) return true;
  const ty = String(p.seller_types || '').split(',').filter(Boolean), t = SRC_T[s.source];
  if (ty.length && !ty.includes(t)) return false;
  if (p.seller_ids?.length && (t === 'san' || t === 'ctv')) return p.seller_ids.includes(+s.agent_id);
  return ty.length > 0 || !p.seller_ids?.length;
};
async function polWho(db, p) {   // «Khách hàng cũ giới thiệu, Đơn vị sàn phân phối (SAN-01 · …)»
  const ag = p.seller_ids?.length ? (await db.q('SELECT code FROM kd_agent WHERE id = ANY($1::int[]) ORDER BY code', [p.seller_ids])).map(a => a.code).join(', ') : '';
  const ty = String(p.seller_types || '').split(',').filter(Boolean).map(k => C.F.price_policy.seller_types.o.find(o => o[0] === k)?.[1] || k);
  return [...ty, ...(ag ? [`${ty.length ? 'riêng ' : ''}sàn / CTV: ${ag}`] : [])].join(', ');
}
const polFin = (pol, code) => { const v = pol?.finish_vals?.[String(code || '').toUpperCase()]; return v == null || v === '' ? null : +v; };   // giá trị hoàn thiện căn khai ở chính sách
async function pricing(db, unit, on = today(), seller) {
  const b = await db.one('SELECT code FROM kd_building WHERE id = $1', [unit.building_id]);
  // 14/11/2026: chính sách áp dụng = chính sách được DUYỆT GẦN NHẤT (theo ngày duyệt) còn hiệu lực cho căn + người bán — chính sách duyệt trước đó không còn áp cho căn
  const pols = await db.q(`SELECT p.*, (SELECT max(a.decided_at) FROM kd_approval a WHERE a.ent = 'price_policy' AND a.rec_id = p.id AND a.status = 'da_duyet') appr_at FROM kd_price_policy p WHERE p.status = 'phat_hanh' AND $1 = ANY(p.project_ids) AND p.start_on <= $2 AND p.end_on >= $2
    ORDER BY appr_at DESC NULLS LAST, p.start_on DESC, p.version DESC, p.id DESC`, [unit.project_id, on]);
  const pol = pols.find(p => polHas(p, unit.code, b?.code) && polFor(p, seller));
  if (!pol) return { policy: null, price: unit.total_price || null };
  if (pol.mode === 'don_gia') { const after = Math.round(pol.unit_price * unit.area_tt), before = after / (1 + (pol.vat_pct ?? 5) / 100); return { policy: pol, price: after + Math.round(before * (pol.maint_pct ?? 2) / 100 / 1000) * 1000 }; }   // đơn giá đã gồm thuế; bảo trì = 2% × tiền trước thuế
  return { policy: pol, price: unit.total_price || unit.list_price || null };
}

// ======================= LỊCH THANH TOÁN =======================
// HĐMB: % các đợt × tiền sau thuế (= giá trị HĐ − phí bảo trì); phí bảo trì thu riêng, cộng trọn vào đợt «Đợt thu phí bảo trì» (mặc định 3)
// maint > 0 (HĐMB): tỷ lệ % các đợt × tiền sau thuế (= giá trị − phí bảo trì); phí bảo trì thu ở DÒNG RIÊNG cố định (dòng maint: true, số tiền = phí bảo trì,
// tự xếp theo ngày đến hạn). Lịch cũ / nhập file không có dòng riêng: cộng trọn phí bảo trì vào «Đợt thu phí bảo trì» (dot) như trước
async function normSchedule(db, rows, value, label = 'Lịch thanh toán', maint = 0, dot = 3, finish = 0) {
  if (Array.isArray(rows) && !(maint > 0)) rows = rows.filter(r => !r.maint || +r.amount > 0);   // không có phí bảo trì: bỏ dòng bảo trì trống
  // đợt thu giá trị hoàn thiện (fin): % tính trên giá trị hoàn thiện; căn không có hoàn thiện → bỏ các đợt này. Có đợt hoàn thiện thì % các đợt khác tính trên phần còn lại
  if (Array.isArray(rows) && !(+finish > 0)) rows = rows.filter(r => !r.fin);
  const fs = Array.isArray(rows) && rows.some(r => r.fin) ? +finish : 0;
  if (!Array.isArray(rows) || !rows.length) bad(`${label}: chưa có kỳ thu nào`);
  const own = maint > 0 && rows.some(r => r.maint), mi = maint > 0 && !own ? Math.min(Math.max(1, +dot || 3), rows.length) - 1 : -1, base = (maint > 0 ? value - maint : value) - fs;
  const F = C.F.installment;
  let out = [];
  for (const [i, r] of rows.entries()) {
    const m = own && r.maint, at = m ? `${label} — dòng phí bảo trì` : `${label} kỳ ${i + 1}`;
    const due_on = await C.normField(F.due_on, r.due_on, db, `${at} — ngày đến hạn`);
    let amount = m ? maint : await C.normField(F.amount, r.amount, db, `${at} — số tiền`);
    const pct = m || r.pct === '' || r.pct == null ? null : await C.normField(F.pct, r.pct, db, `${at} — tỷ lệ`);
    if (amount == null && pct != null) amount = Math.round((r.fin ? fs : base) * pct / 100) + (i === mi ? maint : 0);
    if (!due_on || !amount) bad(`${at}: cần ngày đến hạn và số tiền (hoặc tỷ lệ)`);
    const bgd = r.bg_days === '' || r.bg_days == null ? null : Math.max(0, parseInt(r.bg_days, 10) || 0);
    out.push({ name: String(r.name || (m ? 'Phí bảo trì' : `Đợt ${i + 1}`)).trim(), due_on, pct, amount, is_maint: !!r.maint, is_bg: !!r.bg, bg_days: r.bg ? bgd : null, is_fin: !!r.fin && !m });   // nhiều đợt gắn bàn giao, kể cả dòng phí bảo trì
  }
  if (own) {   // dòng phí bảo trì: đặt sau các đợt có hạn không muộn hơn hạn của nó
    const mr = out.find(r => r.is_maint), rest = out.filter(r => r !== mr), at = rest.filter(r => r.due_on <= mr.due_on).length;
    out = [...rest.slice(0, at), mr, ...rest.slice(at)];
  }
  if (fs) { const d = r => String(r.due_on); const ms = out.filter(r => r.is_maint); out = out.filter(r => !r.is_maint).map((r, i) => [r, i]).sort((a, b) => d(a[0]) < d(b[0]) ? -1 : d(a[0]) > d(b[0]) ? 1 : a[1] - b[1]).map(x => x[0]);   // đợt hoàn thiện xếp xen theo ngày đến hạn
    for (const mr of ms) { const at = out.filter(r => r.due_on <= mr.due_on).length; out.splice(at, 0, mr); } }
  out.forEach((r, i) => { r.seq = i + 1; });
  for (let i = 1; i < out.length; i++) if (out[i].due_on < out[i - 1].due_on && !out[i].is_bg && !out[i - 1].is_bg) bad(`${label}: ngày đến hạn kỳ ${i + 1} sớm hơn kỳ ${i}`);   // đợt bàn giao: hạn theo thông báo bàn giao, có thể lệch thứ tự
  const sum = out.reduce((s, r) => s + r.amount, 0);
  // làm tròn: dồn chênh lệch nhỏ (≤ 1.000đ / kỳ) vào kỳ cuối (không dồn vào dòng phí bảo trì)
  const li = Math.max(out.map(r => r.is_maint).lastIndexOf(false), 0);
  if (Math.abs(sum - value) <= 1000 * out.length && sum !== value) { out[li].amount += value - sum; }
  else if (sum !== value) bad(`${label}: tổng các kỳ ${fmtMoney(sum)} không khớp nghĩa vụ phải thu ${fmtMoney(value)} (lệch ${fmtMoney(sum - value)})`);
  return out;
}
// ---- tiến độ thu tiền khai ở chính sách bán hàng (16/11/2026) → «Lần thanh toán» HĐMB của các căn đã tích ----
// mỗi đợt: { name, days (số ngày sau ngày ký HĐMB), pct, bg?, bg_days? } — hạn = ngày ký + số ngày; đợt bàn giao: thông báo bàn giao đã phát hành thì
// hạn = ngày bàn giao + số ngày được nộp, chưa có thì tạm theo số ngày sau ngày ký. Phí bảo trì ở dòng riêng cùng hạn đợt pay_mdot
const finTxt = s => String(s ?? '').replace(/giá trị (của )?căn hộ/gi, 'giá trị hoàn thiện nội thất');   // tiến độ nội thất: «giá trị căn hộ» → «giá trị hoàn thiện nội thất» (14/11/2026)
async function policySchedRows(db, pol, c) {
  if (c.kind === 'hoan_thien') {   // 14/11/2026: HĐ hoàn thiện căn hộ (nội thất) theo «Tiến độ thu giá trị hoàn thiện» của chính sách
    const fs = (Array.isArray(pol?.fin_sched) ? pol.fin_sched : []).filter(x => +x.pct > 0);
    if (!fs.length || !(+c.value > 0)) return null;
    const b = d10(c.contract_on || c.plan_sign) || today(), has = x => x.days != null && x.days !== '';
    const rows = fs.map((x, i) => { const due = has(x) || !i ? C.addDays(b, +x.days || 0) : null; if (!due) bad(`Chính sách ${pol.code}: đợt hoàn thiện «${x.name}» chưa có ngày đến hạn cố định — mở HĐ nhập ngày cho đợt này`); return { name: finTxt(x.name), pct: +x.pct, amount: null, due_on: due }; });
    return normSchedule(db, rows, +c.value, `Tiến độ hoàn thiện theo chính sách ${pol.code}`, 0, 1, 0);
  }
  const all = Array.isArray(pol?.pay_sched) ? pol.pay_sched : [], ps = all.filter(x => !x.maint && +x.pct > 0), mr = all.find(x => x.maint);
  if (!ps.length || !(+c.value > 0)) return null;
  const b = d10(c.contract_on || c.plan_sign) || today(), has = x => x.days != null && x.days !== '';
  const n = c.unit_id && ps.some(x => x.bg) ? await bgNoticeOf(db, c.unit_id) : null, b0 = n ? d10(bgBase(n)) : null;
  const rows = ps.map((x, i) => {
    const due = x.bg && b0 ? C.addDays(b0, x.bg_days ?? (+n.pay_days || 0)) : has(x) || !i ? C.addDays(b, +x.days || 0) : null;
    if (!due) bad(`Chính sách ${pol.code}: «${x.name}» chưa có ngày đến hạn cố định — mở HĐ nhập ngày cho đợt này`);
    return { name: x.name, pct: +x.pct, amount: null, due_on: due, ...(x.bg ? { bg: true, bg_days: x.bg_days ?? null } : {}) };
  });
  const fv = +c.finish_value || 0;
  if (fv > 0) for (const [i, x] of (Array.isArray(pol.fin_sched) ? pol.fin_sched : []).filter(x => +x.pct > 0).entries()) {   // căn có hoàn thiện: đợt thu hoàn thiện theo chính sách
    const due = has(x) || !i ? C.addDays(b, +x.days || 0) : null;
    if (!due) bad(`Chính sách ${pol.code}: đợt hoàn thiện «${x.name}» chưa có ngày đến hạn cố định — mở HĐ nhập ngày cho đợt này`);
    rows.push({ name: x.name, pct: +x.pct, amount: null, due_on: due, fin: true });
  }
  const pn = rows.filter(x => !x.fin).length, mf = +c.maint_fee || 0, k = Math.min(Math.max(1, +pol.pay_mdot || 3), pn) - 1;
  if (mf > 0) rows.push({ name: mr?.name || 'Thu phí bảo trì (2% tiền trước thuế)', due_on: mr && has(mr) ? C.addDays(b, +mr.days) : rows[k].due_on, pct: null, amount: null, maint: true, ...(!(mr && has(mr)) && rows[k].bg ? { bg: true, bg_days: rows[k].bg_days } : {}) });
  return normSchedule(db, rows, +c.value, `Tiến độ theo chính sách ${pol.code}`, mf, k + 1, fv);
}
// chính sách có khai tiến độ áp cho HĐ: chính sách ghi trên HĐ, không có tiến độ thì chính sách đang phát hành cho căn
async function schedPolicy(db, c) {
  const p0 = c.price_policy_id ? await raw(db, 'price_policy', c.price_policy_id) : null;
  const ok = p => c.kind === 'hoan_thien' ? p?.fin_sched?.length : p?.pay_sched?.length;
  if (ok(p0)) return p0;
  const u = c.unit_id ? await raw(db, 'unit', c.unit_id) : null, p = u ? (await pricing(db, u, d10(c.contract_on) || today())).policy : null;
  return ok(p) ? p : null;
}
async function policyApplyOne(db, pol, c, user, demo) {
  const rows = await policySchedRows(db, pol, c); if (!rows) return false;
  await writeSchedule(db, c.id, rows, 'hop_dong', user, demo ?? c.is_demo);
  if (c.kind === 'hoan_thien') await db.q('UPDATE kd_contract SET price_policy_id = $2, updated_at = now() WHERE id = $1', [c.id, pol.id]);
  else await db.q('UPDATE kd_contract SET price_policy_id = $2, maint_dot = $3, updated_at = now() WHERE id = $1', [c.id, pol.id, Math.min(Math.max(1, +pol.pay_mdot || 3), pol.pay_sched.filter(x => !x.maint).length)]);
  await C.audit(db, 'contract', c.id, 'tien_do_chinh_sach', null, { policy: pol.code + ' v' + pol.version }, user, `Lần thanh toán lấy theo tiến độ của chính sách ${pol.code} v${pol.version}`, demo ?? c.is_demo);
  return true;
}
// chính sách phát hành: HĐMB chưa trình duyệt (dự thảo / bị từ chối) của các căn đã tích → ghi lại Lần thanh toán. HĐ đã trình / đã ký giữ nguyên
async function policyApply(db, pol, user) {
  if (!pol?.pay_sched?.length && !pol?.fin_sched?.length) return { ok: [], err: [] };
  const cs = await db.q(`SELECT c.*, u.code ucode, b.code bcode FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id LEFT JOIN kd_building b ON b.id = u.building_id
    WHERE c.kind IN (${pol.pay_sched?.length ? "'hdmb','thue_mua'," : ''}'hoan_thien') AND c.status IN ('du_thao','tu_choi') AND u.project_id = ANY($1) ORDER BY c.id`, [pol.project_ids || []]);
  const ok = [], err = [];
  for (const c of cs.filter(c => polHas(pol, c.ucode, c.bcode))) {
    try { if (await policyApplyOne(db, pol, c, user)) ok.push(c.number || c.code || '#' + c.id); } catch (e) { if (e.status !== 400) throw e; err.push(`${c.number || '#' + c.id}: ${e.message}`); }
  }
  if (ok.length || err.length) await C.audit(db, 'price_policy', pol.id, 'ap_tien_do', null, { hd: ok, loi: err }, user, `Áp tiến độ thu tiền cho ${ok.length} HĐMB${ok.length ? ': ' + ok.join(', ') : ''}${err.length ? ` · ${err.length} HĐ không áp được` : ''}`);
  return { ok, err };
}
// 14/11/2026: chính sách mới có hiệu lực (duyệt phát hành, hoặc tới ngày bắt đầu) → căn CHƯA BÁN (chưa có HĐ đã trình / đã ký) mà chính sách này
// là chính sách đang áp (pricing: đúng căn, đúng người bán, mới nhất) tự cập nhật: phiếu đăng ký còn hiệu lực đổi sang chính sách mới;
// HĐMB dự thảo / bị từ chối ghi chính sách mới + Lần thanh toán theo tiến độ mới (nếu chính sách có khai tiến độ)
const RES_OPEN = ['nhap', 'cho_duyet', 'giu_cho', 'qua_han', 'da_coc'];
async function policyRoll(db, pol, user) {
  const out = { res: [], hd: [], err: [] }, on = today();
  if (pol?.status !== 'phat_hanh' || d10(pol.start_on) > on || d10(pol.end_on) < on) return out;
  const lab = `${pol.code} v${pol.version}`;
  const units = (await db.q(`SELECT u.*, b.code bcode FROM kd_unit u JOIN kd_building b ON b.id = u.building_id WHERE u.project_id = ANY($1)
      AND NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.unit_id = u.id AND c.kind IN ('hdmb','thue_mua','vay','thue') AND c.status IN ('cho_duyet','cho_ky','da_ky'))`, [pol.project_ids || []]))
    .filter(u => polHas(pol, u.code, u.bcode));
  const FV = pol.finish_vals || {}, fin = { can: [] };
  for (const u of units) {
    const fv = FV[String(u.code).toUpperCase()];   // giá trị hoàn thiện khai ở chính sách (undefined = giữ nguyên)
    if (fv != null && +(u.finish_value || 0) !== fv && (await pricing(db, u, on)).policy?.id === pol.id) {
      await sys(db, 'unit', u.id, { finish_value: fv, ...(u.price_net != null ? { total_price: +u.price_net + (+u.maint_fee || 0) + fv } : {}) }, user, 'hoan_thien_chinh_sach', `Giá trị hoàn thiện theo chính sách ${lab}`);
      fin.can.push(u.code);
    }
    const rs = await db.q("SELECT * FROM kd_reservation WHERE unit_id = $1 AND status = ANY($2) AND coalesce(deal, 'mua') <> 'thue' ORDER BY id", [u.id, RES_OPEN]);
    for (const r of rs) {
      if ((await pricing(db, u, on, { source: r.source, agent_id: r.agent_id })).policy?.id !== pol.id) continue;
      const pt = { ...(r.policy_id !== pol.id ? { policy_id: pol.id } : {}), ...(fv != null && +(r.finish_value || 0) !== fv ? { finish_value: fv } : {}) };
      if (!Object.keys(pt).length) continue;
      try { await sys(db, 'reservation', r.id, pt, user, 'chinh_sach_moi', `Áp chính sách bán hàng mới ${lab}`); out.res.push(u.code); }
      catch (e) { if (e.status !== 400) throw e; out.err.push(`Phiếu căn ${u.code}: ${e.message}`); }
    }
    const cs = await db.q("SELECT * FROM kd_contract WHERE unit_id = $1 AND kind IN ('hdmb','thue_mua') AND status IN ('du_thao','tu_choi') ORDER BY id", [u.id]);
    for (const c of cs) {
      const r = (c.reservation_id && await raw(db, 'reservation', c.reservation_id)) || rs[rs.length - 1];   // người bán theo phiếu đăng ký của HĐ
      if ((await pricing(db, u, on, r ? { source: r.source, agent_id: r.agent_id } : undefined)).policy?.id !== pol.id) continue;
      const nm = c.number || c.code || '#' + c.id;
      try {
        if (fv != null && +(c.finish_value || 0) !== fv && (c.ptype === 'lien_ke' || +(c.finish_value || 0) > 0)) { await sys(db, 'contract', c.id, { finish_value: fv }, user, 'hoan_thien_chinh_sach', `Giá trị hoàn thiện theo chính sách ${lab}`); await syncContractValue(db, c.id, user, `Giá trị hoàn thiện theo chính sách ${lab}`); if (!pol.pay_sched?.length && c.price_policy_id === pol.id) out.hd.push(nm); Object.assign(c, await raw(db, 'contract', c.id)); }   // đọc lại HĐ (giá trị, phí bảo trì, hoàn thiện mới) trước khi lập Lần thanh toán
        if (pol.pay_sched?.length && await policyApplyOne(db, pol, c, user)) out.hd.push(nm);
        else if (c.price_policy_id !== pol.id) {
          await db.q('UPDATE kd_contract SET price_policy_id = $2, updated_at = now() WHERE id = $1', [c.id, pol.id]);
          await C.audit(db, 'contract', c.id, 'chinh_sach_moi', null, { policy: lab }, user, `Áp chính sách bán hàng mới ${lab}`, c.is_demo); out.hd.push(nm);
        }
      } catch (e) { if (e.status !== 400) throw e; out.err.push(`${nm}: ${e.message}`); }
    }
    // HĐ hoàn thiện căn hộ (nội thất) dự thảo của căn: Lần thanh toán theo «Tiến độ thu giá trị hoàn thiện» của chính sách (14/11/2026)
    if (fv != null || pol.fin_sched?.length) for (let c of await db.q("SELECT * FROM kd_contract WHERE unit_id = $1 AND kind = 'hoan_thien' AND status IN ('du_thao','tu_choi') ORDER BY id", [u.id])) {
      const r = (c.reservation_id && await raw(db, 'reservation', c.reservation_id)) || rs[rs.length - 1];
      if ((await pricing(db, u, on, r ? { source: r.source, agent_id: r.agent_id } : undefined)).policy?.id !== pol.id) continue;
      const nm = c.number || c.code || '#' + c.id;
      try {
        let hit = false;
        if (fv != null && +(c.finish_value || 0) !== fv) { await sys(db, 'contract', c.id, { finish_value: fv }, user, 'hoan_thien_chinh_sach', `Giá trị hoàn thiện theo chính sách ${lab}`); c = await raw(db, 'contract', c.id); hit = true; }
        if (pol.fin_sched?.length && await policyApplyOne(db, pol, c, user)) hit = true;
        if (hit) out.hd.push(nm);
      } catch (e) { if (e.status !== 400) throw e; out.err.push(`${nm}: ${e.message}`); }
    }
  }
  await db.q('UPDATE kd_price_policy SET rolled_at = now() WHERE id = $1', [pol.id]);
  out.can = fin.can;
  if (out.res.length || out.hd.length || out.err.length || out.can.length) await C.audit(db, 'price_policy', pol.id, 'ap_can_chua_ban', null, out, user,
    `Tự áp cho căn chưa bán: ${out.can.length ? `hoàn thiện ${out.can.length} căn, ` : ''}${out.res.length} phiếu đăng ký${out.res.length ? ' (' + [...new Set(out.res)].join(', ') + ')' : ''}, ${out.hd.length} HĐMB dự thảo${out.hd.length ? ' (' + out.hd.join(', ') + ')' : ''}${out.err.length ? ` · ${out.err.length} chỗ không áp được` : ''}`);
  return out;
}
const rollMsg = o => (o.res.length || o.hd.length || o.can?.length ? `Đã áp chính sách cho căn chưa bán: ${o.can?.length ? `giá trị hoàn thiện ${o.can.length} căn, ` : ''}${o.res.length} phiếu đăng ký, ${o.hd.length} HĐMB dự thảo${o.hd.length ? ' (' + o.hd.join(', ') + ')' : ''}` : 'Không có phiếu đăng ký / HĐMB dự thảo nào cần đổi sang chính sách này') + (o.err.length ? ` · Không áp được: ${o.err.join('; ')}` : '');
// căn chọn được khi tạo chính sách bán hàng (16/11/2026): còn trong bảng hàng (không ngừng kinh doanh), chưa ký HĐMB / thuê mua / vay / thuê.
// Kèm chính sách đang phát hành áp cho căn (trừ chính sách đang sửa) và HĐMB dự thảo của căn — để biết căn nào sẽ đổi Lần thanh toán
async function policyUnits(db, qs) {
  const pids = String(qs.project || '').split(',').map(Number).filter(Boolean), self = +qs.self || 0;
  if (!pids.length) return { rows: [], hidden: 0 };
  const all = await db.q(`SELECT u.id, u.code, u.floor, u.kind, u.area_tt, u.price_net, u.maint_fee, u.total_price, u.finish_value, u.status, u.lock, u.project_id, upper(b.code) b,
      EXISTS (SELECT 1 FROM kd_contract c WHERE c.unit_id = u.id AND c.kind IN ('hdmb','thue_mua','vay','thue') AND c.status = 'da_ky') signed,
      (SELECT c.number FROM kd_contract c WHERE c.unit_id = u.id AND c.kind IN ('hdmb','thue_mua') AND c.status IN ('du_thao','tu_choi') ORDER BY c.id DESC LIMIT 1) draft
    FROM kd_unit u JOIN kd_building b ON b.id = u.building_id WHERE u.project_id = ANY($1)`, [pids]);
  const pols = await db.q(`SELECT p.id, p.code, p.version, p.unit_group, p.project_ids, (p.pay_sched IS NOT NULL) td, (SELECT max(a.decided_at) FROM kd_approval a WHERE a.ent = 'price_policy' AND a.rec_id = p.id AND a.status = 'da_duyet') appr_at FROM kd_price_policy p WHERE p.status = 'phat_hanh' AND p.id <> $1 AND p.project_ids && $2::int[] AND p.end_on >= $3
    ORDER BY appr_at DESC NULLS LAST, p.start_on DESC, p.version DESC, p.id DESC`, [self, pids, today()]);   // như pricing: chính sách duyệt gần nhất
  const rows = all.filter(u => !u.signed && u.lock !== 'ngung_kd' && u.status !== 'giu_cho').map(u => {
    const p = pols.find(p => p.project_ids.includes(u.project_id) && polHas(p, u.code, u.b));
    return { ...u, pol: p ? `${p.code} v${p.version}` : null, pol_td: !!p?.td };
  }).sort((a, c) => a.code.localeCompare(c.code, 'vi', { numeric: true }));
  return { rows, hidden: all.length - rows.length };
}
// tiến độ thu tiền HĐMB của HĐ thuê / vay (jsonb): { name, due_on, pct, amount, maint?, bg?, bg_days? } — cùng dạng bảng soạn đợt ở form
const saleOut = rows => rows.map(x => ({ name: x.name, due_on: x.due_on, pct: x.pct, amount: x.amount, ...(x.is_maint ? { maint: true } : {}), ...(x.is_bg ? { bg: true, bg_days: x.bg_days ?? null } : {}) }));
async function writeSchedule(db, contractId, rows, src, user, demo) {
  const prev = await db.q('SELECT id, seq, is_maint FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [contractId]);
  await db.q('UPDATE kd_installment SET active = false, updated_at = now(), updated_by = $2 WHERE contract_id = $1 AND active', [contractId, user?.id ?? null]);
  const made = [];
  for (const r of rows) made.push({ ...(await db.one('INSERT INTO kd_installment (contract_id, seq, name, due_on, pct, amount, is_maint, src, active, created_by, is_demo, is_bg, bg_days, is_fin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12,$13) RETURNING id',
      [contractId, r.seq, r.name, r.due_on, r.pct, r.amount, !!r.is_maint, src, user?.id ?? null, !!demo, !!r.is_bg, r.is_bg ? r.bg_days ?? null : null, !!r.is_fin])), is_maint: !!r.is_maint });
  // phiếu thu đã chọn đợt: dòng phí bảo trì ↔ dòng phí bảo trì, đợt thứ k ↔ đợt thứ k (không có đợt tương ứng → bỏ gắn, chia theo thứ tự hạn)
  const po = prev.filter(x => !x.is_maint), mo = made.filter(x => !x.is_maint), pm = prev.find(x => x.is_maint), mm = made.find(x => x.is_maint);
  const pairs = [...po.map((x, k) => [x.id, mo[k]?.id ?? null]), ...(pm ? [[pm.id, mm?.id ?? null]] : [])];
  for (const [a, b] of pairs) await db.q('UPDATE kd_receipt SET installment_id = $2 WHERE installment_id = $1', [a, b]);
  await C.audit(db, 'contract', contractId, 'lich_thanh_toan', null, { lich: rows }, user, `${rows.length} kỳ · ${src === 'phu_luc' ? 'theo phụ lục' : 'theo hợp đồng'}`, demo);
}

// tiền hợp đồng chung cư (như BRAVO, cùng công thức Danh mục sản phẩm): F = giá nền × DT thông thủy + giá sàn × DT sàn + tiền hệ số góc;
// thuế = F × thuế suất; sau thuế = ROUND(F + thuế, -3); bảo trì = ROUND(F × 2%, -3); tổng = sau thuế + bảo trì + giá trị hoàn thiện
// giảm giá (phòng KD 04/11/2026): tổng giá (sau thuế + bảo trì) − tiền giảm rồi chia ngược ra giá — trước thuế = tổng mới / (1 + thuế suất + 2%),
// bảo trì = ROUND(2% × trước thuế, -3), sau thuế = tổng mới − bảo trì, thuế = sau thuế − trước thuế, giá nền = trước thuế / DT thông thủy.
// base_orig = giá nền gốc (trước giảm) để sửa / xóa tiền giảm vẫn tính lại từ giá gốc; hệ số góc tính trên giá gốc
function contractPrice(r) {
  const r3 = v => Math.round(v / 1000) * 1000, d = +r.discount || 0, b = d > 0 && +r.base_orig > 0 ? +r.base_orig : +r.base_price;
  const F0 = b * +r.area_tt + (+r.floor_price || 0) * (+r.area_floor || 0);
  const corner_amt = r.corner_pct != null && r.corner_pct !== '' ? Math.round(F0 * +r.corner_pct / 100) : +r.corner_amt || 0;
  const F = F0 + corner_amt, vat = r.vat_pct ?? 5, H = F * vat / 100;
  let pretax = Math.round(F), after_tax = r3(F + H), maint_fee = r3(F * 0.02), vat_amt = Math.round(H);
  const out = { corner_amt: corner_amt || null, vat_pct: vat, base_orig: null };
  if (d > 0) {
    const T = after_tax + maint_fee - d, P = T / (1 + vat / 100 + 0.02);
    pretax = Math.round(P); maint_fee = r3(P * 0.02); after_tax = T - maint_fee; vat_amt = after_tax - pretax;
    Object.assign(out, { base_orig: b, base_price: Math.round(P / +r.area_tt) });
  } else out.base_price = b;
  return { ...out, pretax, vat_amt, after_tax, maint_fee, value: after_tax + maint_fee + (+r.finish_value || 0) };
}
// đơn giá nền gốc của căn: số Bravo nếu có; chưa có (VD tòa G) thì suy ra như cột Đơn giá nền ở Danh mục sản phẩm (prodRow, public/screens.js) = tiền trước thuế / DT thông thủy
function unitBase(u) {
  if (!u) return null;
  if (u.base_price != null) return +u.base_price;
  const after = u.price_net ?? (u.total_price != null && u.maint_fee != null ? +u.total_price - +u.maint_fee - (+u.finish_value || 0) : null);
  return after != null && +u.area_tt > 0 ? Math.round((u.pretax ?? Math.round(+after / (1 + (u.vat_pct ?? 5) / 100))) / +u.area_tt) : null;
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
  // chính sách: theo phiếu giữ chỗ; không có thì chính sách đang phát hành đã tích căn này. Tiến độ thu tiền: chính sách trên phiếu không khai thì lấy của chính sách đang áp cho căn
  const cur = (await pricing(db, u, on)).policy, p0 = res?.policy_id ? await raw(db, 'price_policy', res.policy_id) : null, pol = p0 || cur;
  const sp = p0?.pay_sched?.length ? p0 : cur?.pay_sched?.length ? cur : null;
  const fp = p0?.fin_sched?.length ? p0 : cur?.fin_sched?.length ? cur : null;   // tiến độ nội thất (HĐ hoàn thiện) lấy riêng — chính sách không khai tiến độ HĐMB vẫn có (14/11/2026)
  return { customer_id: res?.customer_id ?? null, customer_label: res?.customer_label ?? null, request_on: res?.reg_date ?? null, finish_value: res?.finish_value ?? null, owner_id: res?.owner_id ?? null,
    policy_id: pol?.id ?? null, policy_label: pol ? `${pol.code} v${pol.version}` : null, ...(sp ? { pay_sched: sp.pay_sched, pay_mdot: sp.pay_mdot ?? 3, sched_policy: `${sp.code} v${sp.version}` } : {}),
    ...(fp ? { fin_sched: fp.fin_sched.map(x => ({ ...x, name: finTxt(x.name) })), fin_policy: `${fp.code} v${fp.version}` } : {}) };
}

// giá trị hợp đồng căn hộ theo Danh mục sản phẩm (sau thuế + bảo trì): cập nhật các ô giá + tính lại từng đợt theo tỷ lệ / ngày đến hạn cũ.
// Phiếu thu đã có giữ nguyên (công nợ tự tính lại theo lịch mới). Trả về true nếu có đổi.
async function closeReservations(db, c, user) {
  for (const s of await db.q(`SELECT id FROM kd_reservation WHERE unit_id = $1 AND status IN ${ACTIVE_RES}`, [c.unit_id]))
    await C.sys(db, 'reservation', s.id, { status: 'huy', reg_state: 'huy' }, user, 'huy', `Theo thanh lý hợp đồng ${c.number || ''}`);
}
// hợp đồng đã thanh lý trước khi có closeReservations: căn còn kẹt «Đã ký hợp đồng» thì giải phóng lúc khởi động
async function fixLiquidated(db) {
  const cs = await db.q(`SELECT DISTINCT ON (c.unit_id) c.id, c.unit_id, c.number FROM kd_contract c WHERE c.status = 'thanh_ly' AND c.kind <> 'hoan_thien'
    AND NOT EXISTS (SELECT 1 FROM kd_contract x WHERE x.unit_id = c.unit_id AND x.kind IN ('hdmb','vay','thue','thue_mua') AND x.status NOT IN ('huy','thanh_ly'))
    AND EXISTS (SELECT 1 FROM kd_reservation s WHERE s.unit_id = c.unit_id AND s.status IN ${ACTIVE_RES}) ORDER BY c.unit_id, c.id DESC`);
  for (const c of cs) { await closeReservations(db, c, null); await recomputeUnit(db, c.unit_id, null); }
  return cs.length;
}
// HĐ thuê bị đồng bộ nhầm theo giá bán (bản cũ): tổng tiền về tiền thuê × số tháng, mỗi kỳ = số tháng của kỳ × tiền thuê, giữ hạn từng kỳ
// giấy tờ / tiêu đề viết cho hồ sơ mua → bản hồ sơ thuê («Đơn đăng ký mua nhà» → «Đơn đăng ký thuê nhà»; «thuê mua» giữ nguyên)
const rentWord = t => String(t ?? '').replace(/(?<!thuê )\bmua\b/g, 'thuê').replace(/(?<!THUÊ )\bMUA\b/g, 'THUÊ');
function addMonths(iso, n) { const d = new Date(iso + 'T00:00:00Z'), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); }
// HĐ vay: lịch trả lãi & gốc cho khách — mỗi kỳ (theo «Kỳ trả lãi») lãi = tiền thuê/tháng × số tháng của kỳ, hoặc gốc × lãi suất × số tháng / 12; trả cuối kỳ
function loanPlan(r) {
  const n = +r.term_months || 0, a = r.eff_on, P = +r.int_period || n, V = +r.value || 0;
  if (!a || !(n > 0) || !(P > 0)) return [];
  const cnt = Math.ceil(n / P), out = [], each = Math.floor(V / cnt / 1000) * 1000; let left = V;
  for (let k = 0; k < cnt; k++) {
    const m = Math.min(P, n - k * P), from = addMonths(a, k * P), to = k === cnt - 1 && r.exp_on ? r.exp_on : addDays(addMonths(a, k * P + m), -1);
    out.push({ kind: 'lai', seq: k + 1, period_from: from, period_to: to, due_on: to, amount: r.int_mode === 'lai_suat' ? Math.round(left * (+r.loan_rate || 0) / 100 * m / 12) : Math.round((+r.rent || 0) * m) });
    if (r.principal_method === 'theo_ky' && V > 0) { const g = k === cnt - 1 ? left : each; out.push({ kind: 'goc', seq: k + 1, period_from: from, period_to: to, due_on: to, amount: g }); left -= g; }
  }
  if (r.principal_method === 'dao_han' && V > 0) out.push({ kind: 'goc', seq: cnt, period_from: a, period_to: out.at(-1).period_to, due_on: out.at(-1).due_on, amount: V });
  return out;
}
// lập lại lịch khi lưu HĐ vay — kỳ đã ghi nhận trả giữ nguyên
async function loanSchedule(db, r, user, demo) {
  const plan = r.kind === 'vay' && r.status !== 'huy' ? loanPlan(r) : [];
  const kept = await db.q("SELECT kind, seq, paid_amt FROM kd_loan_pay l WHERE contract_id = $1 AND (coalesce(paid_amt, 0) > 0 OR paid_on IS NOT NULL OR coalesce(note, '') <> '' OR EXISTS (SELECT 1 FROM kd_payment p WHERE p.loan_pay_id = l.id))", [r.id]), keep = new Set(kept.map(x => x.kind + x.seq));
  const gocPaid = kept.filter(x => x.kind === 'goc').reduce((s, x) => s + (+x.paid_amt || 0), 0);
  if (r.principal_method === 'dao_han') for (const x of plan) if (x.kind === 'goc') x.amount = Math.max(0, x.amount - gocPaid);   // đã trả gốc trước (đổi phương thức) → kỳ đáo hạn trả phần còn lại
  await db.q("DELETE FROM kd_loan_pay l WHERE contract_id = $1 AND coalesce(paid_amt, 0) = 0 AND paid_on IS NULL AND coalesce(note, '') = '' AND NOT EXISTS (SELECT 1 FROM kd_payment p WHERE p.loan_pay_id = l.id)", [r.id]);
  for (const x of plan) if (!keep.has(x.kind + x.seq))
    await db.q('INSERT INTO kd_loan_pay (contract_id, seq, kind, period_from, period_to, due_on, amount, created_by, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [r.id, x.seq, x.kind, x.period_from, x.period_to, x.due_on, x.amount, user?.id ?? null, !!(demo || r.is_demo)]);
  await loanRebase(db, [r.id]);   // lãi theo gốc đã nhận thực tế
}
// HĐ vay lãi theo lãi suất: lãi mỗi kỳ = gốc khách ĐÃ CHUYỂN thực tế (phiếu thu hợp lệ của HĐ vay, trừ gốc công ty đã trả lại) × lãi suất × số tháng của kỳ / 12;
// khoản chuyển / trả giữa kỳ tính theo số ngày còn lại của kỳ. Kỳ trả gốc khi đáo hạn = gốc đã nhận − gốc đã trả. Kỳ đã ghi nhận trả giữ nguyên.
// Gọi sau khi lập lịch, khi lưu phiếu thu, và khi mở màn theo dõi (hủy phiếu thu không qua afterSave).
async function loanRebase(db, ids) {
  ids = [...new Set((ids || []).filter(Boolean).map(Number))];
  if (!ids.length) return;
  const cs = await db.q("SELECT id, loan_rate, principal_method FROM kd_contract WHERE id = ANY($1) AND kind = 'vay' AND int_mode = 'lai_suat' AND status <> 'huy'", [ids]);
  if (!cs.length) return;
  const cids = cs.map(c => c.id);
  const rc = await db.q("SELECT contract_id, voucher_date, amount FROM kd_receipt WHERE status = 'hop_le' AND contract_id = ANY($1)", [cids]);
  const lp = await db.q('SELECT id, contract_id, kind, seq, period_from, period_to, amount, paid_amt, paid_on FROM kd_loan_pay WHERE contract_id = ANY($1) ORDER BY due_on, seq', [cids]);
  for (const c of cs) {
    const ls = lp.filter(x => x.contract_id === c.id), rate = +c.loan_rate || 0;
    const ev = [...rc.filter(x => x.contract_id === c.id).map(x => ({ d: x.voucher_date, a: +x.amount })),
      ...ls.filter(x => x.kind === 'goc' && +x.paid_amt > 0 && x.paid_on).map(x => ({ d: x.paid_on, a: -x.paid_amt }))];
    const got = ev.filter(e => e.a > 0).reduce((s, e) => s + e.a, 0), back = ls.filter(x => x.kind === 'goc').reduce((s, x) => s + (+x.paid_amt || 0), 0);
    for (const x of ls) {
      if (+x.paid_amt > 0 || x.paid_on) continue;
      let amt;
      if (x.kind === 'lai') {
        if (!x.period_from || !x.period_to) continue;
        const end = addDays(x.period_to, 1), len = dayDiff(x.period_from, end);
        let m = 0; while (addMonths(x.period_from, m + 1) <= end) m++;   // số tháng tròn của kỳ + phần lẻ theo ngày
        if (addMonths(x.period_from, m) < end) { const a = addMonths(x.period_from, m); m += dayDiff(a, end) / dayDiff(a, addMonths(x.period_from, m + 1)); }
        const base = ev.filter(e => e.d <= x.period_to).reduce((s, e) => s + e.a * Math.min(1, dayDiff(e.d > x.period_from ? e.d : x.period_from, end) / len), 0);
        amt = Math.max(0, Math.round(base * rate / 100 * m / 12));
      } else if (c.principal_method === 'dao_han') amt = Math.max(0, got - back);
      else continue;
      if (amt !== +x.amount) await db.q('UPDATE kd_loan_pay SET amount = $2 WHERE id = $1', [x.id, amt]);
    }
  }
}
// Phiếu chi trả lãi / gốc HĐ vay → số đã trả của từng kỳ (06/11/2026). Phiếu gắn kỳ trừ vào kỳ đó trước; phần dư / phiếu không gắn kỳ
// trừ dần kỳ chưa trả sớm nhất cùng loại (lãi / gốc); trả thừa dồn vào kỳ cuối. Ngày đã trả = ngày phiếu chi cuối cùng của kỳ.
async function loanPaySync(db, ids) {
  ids = [...new Set((ids || []).filter(Boolean).map(Number))];
  if (!ids.length) return;
  for (const c of await db.q("SELECT id FROM kd_contract WHERE id = ANY($1) AND kind = 'vay'", [ids])) {
    const pays = await db.q("SELECT id, kind, loan_pay_id, amount, voucher_date FROM kd_payment WHERE contract_id = $1 AND status = 'hop_le' AND kind IN ('tra_lai', 'tra_goc') ORDER BY voucher_date, id", [c.id]);
    const ls = await db.q('SELECT id, kind, amount, paid_amt, paid_on FROM kd_loan_pay WHERE contract_id = $1 ORDER BY due_on, seq', [c.id]);
    const st = new Map(ls.map(x => [x.id, { paid: 0, on: null }]));
    const put = (x, a, d) => { const s = st.get(x.id); s.paid += a; if (!s.on || d > s.on) s.on = d; };
    for (const p of pays) {
      const k = p.kind === 'tra_lai' ? 'lai' : 'goc', rows = ls.filter(x => x.kind === k);
      let a = +p.amount;
      const own = rows.find(x => x.id === p.loan_pay_id);
      if (own) { const t = Math.min(a, Math.max(0, +own.amount - st.get(own.id).paid)) || 0; if (t) { put(own, t, p.voucher_date); a -= t; } }
      for (const x of rows) { if (a <= 0) break; const room = Math.max(0, +x.amount - st.get(x.id).paid); if (!room) continue; const t = Math.min(room, a); put(x, t, p.voucher_date); a -= t; }
      if (a > 0 && (own || rows.length)) put(own || rows[rows.length - 1], a, p.voucher_date);
    }
    for (const x of ls) {
      const s = st.get(x.id), pa = s.paid || null, on = s.paid ? s.on : null;
      if ((+x.paid_amt || null) !== pa || (x.paid_on || null) !== on) await db.q('UPDATE kd_loan_pay SET paid_amt = $2, paid_on = $3 WHERE id = $1', [x.id, pa, on]);
    }
  }
  await loanRebase(db, ids);
}
// 1 lần: kỳ HĐ vay đã «ghi nhận đã trả» tay (trước khi có Phiếu chi) → lập phiếu chi tương ứng (PC-CU-<id kỳ>) để số đã trả lấy theo phiếu chi
async function loanPayVouchers(db) {
  if (await db.one("SELECT 1 FROM kd_setting WHERE key = 'loan_pay_vouchers'")) return 0;
  const rows = await db.q("SELECT l.*, c.is_demo c_demo FROM kd_loan_pay l JOIN kd_contract c ON c.id = l.contract_id WHERE c.kind = 'vay' AND coalesce(l.paid_amt, 0) > 0 AND NOT EXISTS (SELECT 1 FROM kd_payment p WHERE p.loan_pay_id = l.id)");
  for (const l of rows) await db.q(`INSERT INTO kd_payment (voucher_no, voucher_date, contract_id, kind, loan_pay_id, amount, content, method, src, status, is_demo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'chuyen_khoan', 'thu_cong', 'hop_le', $8) ON CONFLICT DO NOTHING`,
    ['PC-CU-' + l.id, l.paid_on || l.due_on, l.contract_id, l.kind === 'lai' ? 'tra_lai' : 'tra_goc', l.id, l.paid_amt, l.note || 'Chuyển từ ghi nhận đã trả (trước khi có phiếu chi)', !!(l.is_demo || l.c_demo)]);
  await loanPaySync(db, rows.map(r => r.contract_id));
  await db.q("INSERT INTO kd_setting (key, value) VALUES ('loan_pay_vouchers', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify({ at: new Date().toISOString(), n: rows.length })]);
  return rows.length;
}
// 1 lần: HĐ căn hộ cũ có tiền giảm giá (giá nền gốc, giảm trừ riêng) → giá nền chia lại = giá nền − giảm giá / DT thông thủy (tổng tiền không đổi)
async function fixBaseDiscount(db) {
  if ((await db.one("SELECT 1 FROM kd_setting WHERE key = 'base_price_net'"))) return 0;
  const n = (await db.q("UPDATE kd_contract SET base_price = round(base_price - discount / area_tt) WHERE kind NOT IN ('hoan_thien','thue','vay') AND coalesce(ptype, 'can_ho') = 'can_ho' AND discount > 0 AND area_tt > 0 AND base_price > 0 RETURNING id")).length;
  await db.q("INSERT INTO kd_setting (key, value) VALUES ('base_price_net', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify({ at: new Date().toISOString(), n })]);
  return n;
}
// hợp đồng ↔ phiếu đăng ký của căn: nối phiếu (theo phiếu đã gắn, hoặc phiếu còn hiệu lực cùng căn + cùng khách);
// hợp đồng Đã ký → phiếu: Ký HĐMB · Đã ký HĐMB · Đã chuyển hợp đồng
// chạy 1 việc trong savepoint: lỗi SQL của 1 dòng không làm hỏng cả giao dịch (jobs, đồng bộ tình trạng)
async function safely(db, fn, label) {
  const inTx = !!db.inTx; if (inTx) await db.q('SAVEPOINT sp_safe');   // ngoài giao dịch (mỗi câu tự commit) thì không cần savepoint
  try { const v = await fn(); if (inTx) await db.q('RELEASE SAVEPOINT sp_safe'); return v; }
  catch (e) { if (inTx) await db.q('ROLLBACK TO SAVEPOINT sp_safe'); console.warn(label, e.message); }
}
async function resFromContract(db, r, user) {
  if (!r || r.kind === 'hoan_thien' || ['huy', 'thanh_ly'].includes(r.status)) return;
  const s = r.reservation_id ? await raw(db, 'reservation', r.reservation_id)
    : await db.one(`SELECT * FROM kd_reservation WHERE unit_id = $1 AND customer_id = $2 AND status IN ${ACTIVE_RES} ORDER BY id DESC LIMIT 1`, [r.unit_id, r.customer_id]);
  if (!s) return;
  if (!r.reservation_id) await db.q('UPDATE kd_contract SET reservation_id = $1 WHERE id = $2 AND reservation_id IS NULL', [s.id, r.id]);
  if (r.status !== 'da_ky' || ['huy', 'het_han'].includes(s.status)) return;
  const patch = {};
  const sale = ['hdmb', 'thue_mua'].includes(r.kind);
  if (sale && s.reg_state !== 'ky_hdmb') patch.reg_state = 'ky_hdmb';
  if (sale && s.progress !== 'da_ky') patch.progress = 'da_ky';
  if (s.status !== 'chuyen_hd') patch.status = 'chuyen_hd';
  if (Object.keys(patch).length) await sys(db, 'reservation', s.id, patch, user, 'cap_nhat_tien_trinh', `Đã ký hợp đồng ${r.number || ''}`);
}
async function fixRentValue(db, user) {
  const cs = await db.q("SELECT * FROM kd_contract WHERE kind = 'thue' AND rent > 0 AND term_months > 0 AND value IS DISTINCT FROM rent * term_months");
  for (const c of cs) {
    const value = Math.round(+c.rent * +c.term_months), n = +c.term_months;
    await db.q('UPDATE kd_contract SET value = $1, updated_at = now() WHERE id = $2', [value, c.id]);
    await C.audit(db, 'contract', c.id, 'sua', { value: c.value }, { value }, user, 'Giá trị HĐ thuê = tổng giá thuê/tháng × thời hạn thuê', c.is_demo);
    const inst = await db.q('SELECT name, due_on, src FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [c.id]), p = inst.length;
    if (p && p <= n) { const off = k => Math.round(k * n / p); await writeSchedule(db, c.id, inst.map((i, k) => ({ name: i.name, due_on: i.due_on, pct: null, amount: (off(k + 1) - off(k)) * +c.rent })), inst[0].src || 'hop_dong', user, c.is_demo); }
  }
  return cs.length;
}
async function syncContractValue(db, contractId, user, note = 'Đồng bộ giá trị theo Danh mục sản phẩm') {
  const c = await raw(db, 'contract', contractId);
  const u = c && !['hoan_thien', 'thue', 'vay'].includes(c.kind) && await raw(db, 'unit', c.unit_id);   // HĐ thuê: tổng tiền = tiền thuê × số tháng, không theo giá bán
  if (!u || u.price_net == null) return false;
  let patch = { value: +u.price_net + (+u.maint_fee || 0) + (+c.finish_value || 0), pretax: u.pretax, vat_pct: u.vat_pct, vat_amt: u.tax_amt, after_tax: u.price_net, maint_fee: u.maint_fee, base_price: u.base_price };
  // hợp đồng có giảm giá: giữ giảm giá — tổng giá căn mới − tiền giảm, chia ngược ra giá (contractPrice; phí bảo trì = 2% × tiền trước thuế)
  const b = +c.discount > 0 && c.ptype !== 'lien_ke' && +u.area_tt > 0 ? unitBase(u) : null;
  if (b) patch = { ...contractPrice({ ...c, base_price: b, base_orig: b, area_tt: u.area_tt, vat_pct: u.vat_pct ?? c.vat_pct }), area_tt: u.area_tt };
  const value = patch.value;
  if (+c.value === value) return false;
  if ((await debtOf(db, [c.id])).get(c.id)?.paid > value) bad(`Số đã thu lớn hơn giá trị ${fmtMoney(value)}đ của căn mới — cần xử lý hoàn tiền trước`);
  for (const k of Object.keys(patch)) if (patch[k] == null || !C.F.contract[k]) delete patch[k];
  const sets = Object.keys(patch);
  await db.q(`UPDATE kd_contract SET ${sets.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${sets.length + 1}`, [...sets.map(k => patch[k]), c.id]);
  await C.audit(db, 'contract', c.id, 'sua', { value: c.value }, { value }, user, note, c.is_demo);
  const inst = await db.q('SELECT name, due_on, pct, amount, is_maint, is_fin, src FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [c.id]);
  if (inst.length) {   // các đợt theo tỷ lệ cũ; dòng phí bảo trì = phí bảo trì mới
    const sale = ['hdmb', 'thue_mua'].includes(c.kind), mt = sale ? +(patch.maint_fee ?? c.maint_fee) || 0 : 0;
    const rows = inst.map(i => i.is_maint ? { name: i.name, due_on: i.due_on, maint: true, amount: mt ? null : +i.amount } : { name: i.name, due_on: i.due_on, pct: i.pct, amount: i.pct != null ? null : Math.round(+i.amount * value / +c.value), ...(i.is_fin ? { fin: true } : {}) });
    await writeSchedule(db, c.id, await normSchedule(db, rows, value, 'Lịch thanh toán', mt, c.maint_dot, +c.finish_value || 0), inst[0].src || 'hop_dong', user, c.is_demo);
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
  const nx = new Map((await db.q('SELECT DISTINCT ON (reservation_id) reservation_id, status, result, sxd_result FROM kd_noxh_check WHERE reservation_id = ANY($1) ORDER BY reservation_id, id DESC', [ids])).map(r => [r.reservation_id, r]));
  const ct = new Map((await db.q("SELECT reservation_id, status FROM kd_contract WHERE reservation_id = ANY($1) AND kind <> 'hoan_thien'", [ids])).map(r => [r.reservation_id, r]));
  const noxhUnits = new Set((await db.q("SELECT u.id FROM kd_unit u JOIN kd_project p ON p.id = u.project_id WHERE p.kind = 'noxh' AND u.id = ANY($1)", [rows.map(r => r.unit_id)])).map(r => r.id));
  for (const r of rows) {
    const n = nx.get(r.id), c = ct.get(r.id);
    r.stage = { nhap: 'Đăng ký', cho_duyet: 'Chờ duyệt giữ chỗ', huy: 'Đã hủy', het_han: 'Hết hạn', tu_choi: 'Bị từ chối' }[r.status]
      || (r.status === 'chuyen_hd' ? (c?.status === 'da_ky' ? 'Đã ký hợp đồng' : c?.status === 'huy' ? 'Đã hủy' : 'Chờ ký hợp đồng')
      : n ? ({ nhap: n.result === 'can_bo_sung' ? 'Chờ bổ sung hồ sơ' : 'Đang tiếp nhận hồ sơ', cho_duyet: 'Đang xét duyệt', da_duyet: n.sxd_result === 'khong_duyet' ? 'SXD không duyệt' : 'Đủ điều kiện ký HĐ', tu_choi: 'Hồ sơ không đạt' }[n.status])
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
    if (r.finish_vals != null) {   // giá trị hoàn thiện từng căn: { MÃ CĂN: số tiền ≥ 0 }
      if (typeof r.finish_vals !== 'object' || Array.isArray(r.finish_vals)) bad('Giá trị hoàn thiện căn hộ không hợp lệ');
      const o = {}; for (const [k, v] of Object.entries(r.finish_vals)) { if (v === '' || v == null) continue; const n = Math.round(+v); if (!(n >= 0)) bad(`Giá trị hoàn thiện căn ${k} không hợp lệ`); o[String(k).toUpperCase().trim()] = n; }
      r.finish_vals = Object.keys(o).length ? o : null;
    }
    // tiến độ thu tiền (bảng như Lần thanh toán HĐMB): tỷ lệ các đợt đủ 100%; hạn = số ngày sau ngày ký HĐMB (trống = chưa có ngày cố định, nhập ở HĐ), không lùi;
    // dòng phí bảo trì riêng { maint: true, name, days }
    const ps = (Array.isArray(r.pay_sched) ? r.pay_sched : []).filter(x => x.maint || String(x.name || '').trim() || (x.pct != null && x.pct !== ''));
    const L = 'Tiến độ thu tiền', out = [], dOf = v => v === '' || v == null ? null : parseInt(v, 10);
    let k = 0;
    for (const x of ps) {
      const days = dOf(x.days);
      if (days != null && !(days >= 0)) bad(`${L}: «${x.name || 'đợt ' + (k + 1)}» có ngày đến hạn trước ngày ký HĐMB`, { fields: ['pay_sched'] });
      if (x.maint) { out.push({ name: String(x.name || '').trim() || 'Thu phí bảo trì (2% tiền trước thuế)', maint: true, days }); continue; }
      k++; const pct = +x.pct;
      if (!(pct > 0 && pct <= 100)) bad(`${L} đợt ${k}: nhập tỷ lệ % (lớn hơn 0)`, { fields: ['pay_sched'] });
      out.push({ name: String(x.name || '').trim() || `Đợt ${k}`, pct, days: k === 1 ? 0 : days, ...(x.bg ? { bg: true, bg_days: x.bg_days ?? null } : {}) });
    }
    const nb = out.filter(x => !x.maint && !x.bg && x.days != null);
    for (let i = 1; i < nb.length; i++) if (nb[i].days < nb[i - 1].days) bad(`${L}: «${nb[i].name}» có hạn sớm hơn đợt trước`, { fields: ['pay_sched'] });
    const sum = Math.round(out.filter(x => !x.maint).reduce((s, x) => s + x.pct, 0) * 100) / 100;
    if (k && sum !== 100) bad(`${L}: tổng tỷ lệ các đợt phải đủ 100% (đang ${String(sum).replace('.', ',')}%)`, { fields: ['pay_sched'] });
    r.pay_sched = k ? out : null;
    {   // tiến độ thu giá trị hoàn thiện: đủ 100%, số ngày sau ngày ký không lùi
      const L2 = 'Tiến độ thu giá trị hoàn thiện', fo = [];
      for (const x of (Array.isArray(r.fin_sched) ? r.fin_sched : []).filter(x => String(x.name || '').trim() || (x.pct != null && x.pct !== ''))) {
        const days = dOf(x.days), pct = +x.pct, n = fo.length + 1;
        if (days != null && !(days >= 0)) bad(`${L2}: «${x.name || 'đợt ' + n}» có ngày đến hạn trước ngày ký HĐMB`, { fields: ['fin_sched'] });
        if (!(pct > 0 && pct <= 100)) bad(`${L2} đợt ${n}: nhập tỷ lệ % (lớn hơn 0)`, { fields: ['fin_sched'] });
        fo.push({ name: finTxt(String(x.name || '').trim()) || `Hoàn thiện đợt ${n}`, pct, days: n === 1 && days == null ? 0 : days });
      }
      const fsum = Math.round(fo.reduce((s, x) => s + x.pct, 0) * 100) / 100;
      if (fo.length && fsum !== 100) bad(`${L2}: tổng tỷ lệ các đợt phải đủ 100% (đang ${String(fsum).replace('.', ',')}%)`, { fields: ['fin_sched'] });
      r.fin_sched = fo.length ? fo : null;
    }
    const mr = out.find(x => x.maint), mk = mr && mr.days != null ? out.filter(x => !x.maint).findIndex(x => x.days === mr.days) : -1;
    r.pay_mdot = k ? (mk >= 0 ? mk + 1 : Math.min(Math.max(1, parseInt(r.pay_mdot, 10) || 3), k)) : r.pay_mdot ?? 3;
  },
  async afterApprove(r, ok, ctx) {
    const { db, user } = ctx;
    if (ok && r.parent_id) await sys(db, 'price_policy', r.parent_id, { status: 'thay_the' }, user, 'thay_the', `Thay bằng phiên bản ${r.version}`);
    if (ok) { const o = await policyRoll(db, { ...r, status: 'phat_hanh' }, user); if (o.res.length || o.hd.length || o.can.length) ctx.warn?.push?.(rollMsg(o)); }   // có hiệu lực ngay → áp cho căn chưa bán; ngày bắt đầu sau hôm nay → việc nền áp khi tới ngày
  },
  acts: {
    async apply_sched(r, d, { db, user }) {   // áp lại tay: phiếu đăng ký + HĐMB dự thảo của căn chưa bán
      if (d10(r.start_on) > today()) bad(`Chính sách bắt đầu từ ${d10(r.start_on).split('-').reverse().join('/')} — tới ngày app tự áp`);
      if (d10(r.end_on) < today()) bad('Chính sách đã hết hạn');
      return { msg: rollMsg(await policyRoll(db, r, user)) };
    },
    async new_version(r, d, { db, user, demo }) {
      const keep = ['code', 'project_ids', 'unit_group', 'mode', 'unit_price', 'maint_pct', 'vat_pct', 'content', 'target', 'seller_types', 'seller_ids', 'finish_vals', 'start_on', 'end_on', 'src_file', 'pay_sched', 'fin_sched', 'pay_mdot'];
      const n = (await create('price_policy', { ...Object.fromEntries(keep.map(k => [k, r[k]])), version: r.version + 1, parent_id: r.id, status: 'nhap' }, user, { db, system: true, demo })).row;
      return { open: ['price_policy', n.id], msg: `Đã tạo phiên bản ${n.version} (nháp). Phiên bản đang phát hành giữ nguyên tới khi bản mới được duyệt.` };
    },
  },
  // màn chi tiết: «Căn hộ áp dụng» hiện thành bảng cột (14/11/2026) thay chuỗi mã căn
  async decorate(rows, { db, one }) {
    if (!one) return;
    for (const r of rows) {
      const us = await db.q('SELECT u.code, u.floor, u.kind, u.area_tt, u.area_xd, u.total_price, u.price_net, u.maint_fee, u.finish_value, upper(b.code) b FROM kd_unit u JOIN kd_building b ON b.id = u.building_id WHERE u.project_id = ANY($1) ORDER BY b.code, u.floor, u.code', [r.project_ids || []]);
      const fv = r.finish_vals || {};
      // base = giá căn hộ chưa gồm hoàn thiện (như cột «Tổng giá căn hộ» ở form chính sách) → bảng chi tiết cộng thêm «Tổng giá trị căn hộ» = base + hoàn thiện (14/11/2026)
      const base = u => u.price_net != null ? +u.price_net + (+u.maint_fee || 0) : (+u.total_price || 0) - (+u.finish_value || 0);
      r._units = us.filter(u => polHas(r, u.code, u.b)).map(u => ({ code: u.code, b: u.b, floor: u.floor, kind: u.kind, area_tt: u.area_tt, area_xd: u.area_xd, total_price: u.total_price, base: base(u), fin: fv[u.code.toUpperCase()] ?? null })).sort((x, y) => x.code.localeCompare(y.code, 'vi', { numeric: true }));
    }
  },
  noDelete: r => !['nhap', 'tu_choi'].includes(r.status) && 'Chỉ xóa được bản nháp',
};

const digits = s => String(s || '').replace(/\D/g, '');
H.customer = {
  // ?group=tiem_nang → chỉ tình trạng tìm khách; ?group=sau_ban → chỉ tình trạng sau mở bán
  where(qs) { if (qs.group === 'tiem_nang') return { sql: 'coalesce(t.stage, $1) = ANY($2)', params: ['moi', PROSPECT_ST] }; if (qs.group === 'sau_ban') return { sql: 'NOT (coalesce(t.stage, $1) = ANY($2))', params: ['moi', PROSPECT_ST] }; },
  async beforeSave(r, old, { db, warn, opts }) {
    const copy = !old && opts?.copyOf, cw = d => `Bản sao dùng chung SĐT / CCCD với khách ${d.code} · ${d.full_name}`;
    // cùng «họ» mã khách (KH000158, KH000158-01, -02…): bản sao mới, bản sao của bản sao, sửa bản sao — trùng SĐT / CCCD trong họ chỉ cảnh báo
    const fam = c => String(c || '').toUpperCase().replace(/-\d+$/, ''), myFam = fam(copy ? (await db.one('SELECT code FROM kd_customer WHERE id = $1', [copy]))?.code : r.code || old?.code);
    const isFam = d => (copy && d.id === copy) || (myFam && fam(d.code) === myFam && (/-\d+$/.test(String(d.code)) || /-\d+$/.test(String(r.code || old?.code || '')) || copy));
    const dup = (d, msg) => { if (!d) return; if (isFam(d)) { if (!warn.includes(cw(d))) warn.push(cw(d)); } else bad(msg); };
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
    const oldPh = old ? [old.phone, old.phone2].filter(Boolean).map(digits) : [];   // chỉ kiểm trùng số vừa nhập / vừa đổi — sửa ô khác, tự cập nhật tình trạng không bị chặn vì dữ liệu cũ
    for (const ph of [r.phone, r.phone2].filter(Boolean).filter(x => !oldPh.includes(digits(x)))) {
      const d = await db.one("SELECT id, code, full_name FROM kd_customer WHERE id <> $1 AND ($2 IN (regexp_replace(phone,'\\D','','g'), regexp_replace(coalesce(phone2,''),'\\D','','g')))", [id, ph]);
      // cho phép trùng số điện thoại (Tâm 07/11/2026): chỉ nhắc, vẫn lưu
      if (d) warn.push(`Số điện thoại ${ph} đã có ở khách hàng ${d.code} · ${d.full_name} — kiểm tra có phải cùng một người không`);
    }
    if (r.id_no && String(old?.id_no || '').replace(/\s+/g, '').toUpperCase() !== r.id_no) { const d = await db.one('SELECT id, code, full_name FROM kd_customer WHERE id <> $1 AND upper(id_no) = $2', [id, r.id_no]); dup(d, `Trùng giấy tờ định danh với khách hàng ${d?.code} · ${d?.full_name}`); }
    const sim = !old && !copy && r.full_name &&await db.one('SELECT code, phone FROM kd_customer WHERE lower(full_name) = lower($1) LIMIT 1', [r.full_name]);
    if (sim) warn.push(`Đã có khách cùng họ tên: ${sim.code} (ĐT …${String(sim.phone).slice(-3)}) — kiểm tra có phải cùng một người không`);
    if (r.source && ['dai_ly', 'ctv'].includes(r.source) && !r.agent_id) warn.push('Nguồn khách là đại lý / CTV nhưng chưa chọn đối tác giới thiệu');
  },
  async afterSave(r, old, { db }) { if (old && [...CUST_KEYS, 'phone2', 'birth'].some(k => String(old[k] ?? '') !== String(r[k] ?? ''))) await pushCustomer(db, r); },
};

// Hồ sơ khách là gốc: thông tin khách sửa ở màn nào cũng về đây rồi lan sang phiếu đăng ký, hồ sơ NOXH, hợp đồng, đề nghị hủy
const RES_CUST = { full_name: 'cust_name', phone: 'phone', id_no: 'id_no', id_date: 'id_date', id_place: 'id_place', address: 'address', tax_code: 'tax_code', bank_account: 'bank_account' };
const CT_CUST = { phone: 'b_phone', email: 'b_email', id_no: 'b_id_no', id_date: 'b_id_date', id_place: 'b_id_place', address: 'b_addr' };
const CUST_KEYS = [...Object.keys(RES_CUST), 'email'];
const CT_OPEN = ['du_thao', 'cho_duyet', 'cho_ky', 'tu_choi'];   // hợp đồng đã ký chỉ được điền ô trống, không ghi đè
// khách lưu một ô «Số tài khoản - Ngân hàng», hợp đồng tách 2 ô
const bankSplit = s => { const [acc, ...n] = String(s || '').trim().split(/\s+-\s+/); return { acc: acc || null, name: n.join(' - ') || null }; };
const custVals = (r, old, map) => Object.fromEntries(Object.entries(map).filter(([, c]) => !old || String(old[c] ?? '') !== String(r[c] ?? '')).map(([k, c]) => [k, r[c]]));
async function syncCustomer(db, id, vals, user, note) {
  const cur = id && await raw(db, 'customer', id); if (!cur) return;
  const diff = {};
  for (const [k, v] of Object.entries(vals)) if (v != null && v !== '' && !String(v).startsWith('•') && String(cur[k] ?? '') !== String(v)) diff[k] = v;
  if (Object.keys(diff).length) await sys(db, 'customer', id, diff, user, 'sua', note);
}
async function pushCustomer(db, c) {
  const upd = (table, map, wrap, where = 'customer_id = $1') => {
    const ps = [c.id], sets = Object.entries(map).map(([col, v]) => { ps.push(v || null); return `${col} = ${wrap(col, `$${ps.length}::${/_date$/.test(col) ? 'date' : 'text'}`)}`; });
    return db.q(`UPDATE ${table} SET ${sets.join(', ')}, updated_at = now() WHERE ${where}`, ps);
  };
  await upd('kd_reservation', Object.fromEntries(Object.entries(RES_CUST).map(([k, col]) => [col, c[k]])), (col, v) => `coalesce(${v}, ${col})`, "customer_id = $1 AND status NOT IN ('huy', 'het_han')");
  const bk = bankSplit(c.bank_account), blank = col => /_date$/.test(col) ? col : `nullif(${col}, '')`;
  await upd('kd_contract', { ...Object.fromEntries(Object.entries(CT_CUST).map(([k, col]) => [col, c[k]])), b_bank_acc: bk.acc, b_bank_name: bk.name },
    (col, v) => `CASE WHEN status = ANY('{${CT_OPEN}}') THEN coalesce(${v}, ${col}) ELSE coalesce(${blank(col)}, ${v}) END`);
  await upd('kd_cancel_req', { cust_name: c.full_name, phone: c.phone }, (col, v) => `coalesce(${v}, ${col})`, 'contract_id IN (SELECT id FROM kd_contract WHERE customer_id = $1)');
  const [y, m, d] = String(c.birth || '').split('-');
  for (const n of await db.q('SELECT id, head FROM kd_noxh_check WHERE customer_id = $1', [c.id])) {
    const h = Array.isArray(n.head) && n.head[0] ? { ...n.head[0] } : { relation: 'Chủ hộ' };
    Object.assign(h, { name: c.full_name || h.name, phone: [c.phone, c.phone2].filter(Boolean).join('/ ') || h.phone, id_no: c.id_no || h.id_no }, d ? { bday: String(+d), bmonth: String(+m), byear: y } : {});
    await db.q('UPDATE kd_noxh_check SET head = $2::jsonb, bank_account = coalesce($3, bank_account), updated_at = now() WHERE id = $1', [n.id, JSON.stringify([h]), c.bank_account || null]);
  }
}
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
  let k = await db.one("SELECT id, owner_id FROM kd_customer WHERE $1 IN (regexp_replace(phone,'\\D','','g'), regexp_replace(coalesce(phone2,''),'\\D','','g')) ORDER BY id LIMIT 1", [phone]);
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

// form phiếu đăng ký (14/11/2026): chọn căn / đổi nguồn bán → chính sách được duyệt gần nhất + giá trị hoàn thiện theo chính sách
async function resPolicy(db, qs) {
  const u = +qs.unit ? await raw(db, 'unit', +qs.unit) : null; if (!u) return { policy: null };
  const on = /^\d{4}-\d{2}-\d{2}$/.test(qs.date || '') ? qs.date : today();
  const p = (await pricing(db, u, on, { source: qs.source || 'truc_tiep', agent_id: +qs.agent || null })).policy;
  const pf = polFin(p, u.code), uv = u.price_net != null ? +u.price_net + (+u.maint_fee || 0) : u.total_price != null ? +u.total_price - (+u.finish_value || 0) : null;
  // chính sách đã trình nhưng chưa duyệt áp cho căn + người bán này → nhắc trên form (chưa có hiệu lực tới khi được duyệt)
  const b = await db.one('SELECT code FROM kd_building WHERE id = $1', [u.building_id]), seller = { source: qs.source || 'truc_tiep', agent_id: +qs.agent || null };
  const wait = (await db.q("SELECT id, code, version, unit_group, seller_types, seller_ids FROM kd_price_policy WHERE status = 'cho_duyet' AND $1 = ANY(project_ids) AND end_on >= $2 ORDER BY id", [u.project_id, on]))
    .filter(x => polHas(x, u.code, b?.code) && polFor(x, seller)).map(x => `${x.code} v${x.version}`);
  return { policy: p ? { id: p.id, label: `${p.code} v${p.version}` } : null, unit_value: uv, finish_value: pf ?? (u.finish_value != null ? +u.finish_value : null), fin_src: pf != null ? 'policy' : 'unit', wait };
}
H.reservation = {
  where(qs) { if (qs.group === 'thue') return { sql: "t.deal = 'thue'" }; if (qs.group === 'mua') return { sql: "coalesce(t.deal, 'mua') <> 'thue'" }; },   // 2 tab Đăng ký mua / Đăng ký thuê
  async beforeSave(r, old, { db, warn, opts, user, demo }) {
    const changedUnit = !old || old.unit_id !== r.unit_id;
    const u = r.unit_id ? await raw(db, 'unit', r.unit_id) : null;
    if (!u) bad('Chọn mã căn hộ', { fields: ['unit_id'] });   // chưa chọn căn: báo rõ thay vì lỗi máy chủ
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
      if (r.reg_state === 'huy' && old.status === 'chuyen_hd') {   // hợp đồng chưa ký → hủy ngay trên phiếu (hợp đồng tự hủy theo); đã ký → qua Hủy giao dịch
        const signed = await db.one("SELECT number FROM kd_contract WHERE reservation_id = $1 AND status IN ('da_ky', 'thanh_ly') LIMIT 1", [r.id]);
        if (signed) bad(`Phiếu đã ký hợp đồng ${signed.number} — hủy qua «Hủy giao dịch – đổi căn»`);
      }
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
    if (changedUnit && !opts.system) {
      // căn còn trống (Còn bán / Chưa mở bán) mới lập phiếu được — căn chưa mở bán tự mở bán khi lưu phiếu
      if (!FREE_UNIT.includes(u.status)) { await recomputeUnit(db, u.id, user); u.status = (await raw(db, 'unit', u.id)).status; }   // vừa hết hạn thuê → căn trống lại ngay
      if (!FREE_UNIT.includes(u.status)) bad(`Căn ${u.code} đang «${await C.optLabel(C.F.unit.status, u.status)}» — không giữ chỗ được`);
    }
    if (r.hold_until && r.reg_date && !opts.system && new Date(Date.parse(r.hold_until) + 7 * 3600e3).toISOString().slice(0, 10) < r.reg_date) bad('Hạn giữ chỗ phải sau ngày đăng ký');
    if (!old && r.hold_until && Date.parse(r.hold_until) < Date.now() && !opts.system) bad('Hạn giữ chỗ đã qua');
    if (['dai_ly', 'ctv'].includes(r.source) && !r.agent_id) {
      const c = await raw(db, 'customer', r.customer_id); if (c?.agent_id) r.agent_id = c.agent_id; else bad('Nguồn bán đại lý / CTV cần chọn đối tác');
    }
    if (!['dai_ly', 'ctv'].includes(r.source)) r.agent_id = null;
    if (r.source !== 'khach_gt') r.ref_customer_id = null;
    if (r.source !== 'cbnv') r.ref_staff = null;
    if (r.source === 'khach_gt' && !r.ref_customer_id) warn.push('Nguồn bán «Khách hàng cũ giới thiệu» — chưa chọn khách hàng giới thiệu');
    if (r.source === 'cbnv' && !r.ref_staff) warn.push('Nguồn bán «Cán bộ nhân viên» — chưa nhập cán bộ nhân viên giới thiệu');
    if (changedUnit && old && ['huy', 'het_han'].includes(r.status)) bad('Phiếu đã hủy — không đổi căn được');
    if (r.deal === 'thue') {   // đăng ký thuê: không có giá bán — tiền thuê/tháng dự kiến sang hợp đồng thuê
      r.unit_value = r.finish_value = r.price = null;
      if (!(+r.rent > 0)) bad('Nhập tiền thuê/tháng dự kiến', { fields: ['rent'] });
      return;
    }
    const seller = { source: r.source, agent_id: r.agent_id };
    if (r.policy_id && old && (r.source !== old.source || (r.agent_id ?? null) !== (old.agent_id ?? null)) && r.policy_id === old.policy_id) {   // đổi người bán: chính sách cũ không dành cho người bán mới → lấy lại
      const p0 = await raw(db, 'price_policy', r.policy_id);
      if (p0 && !polFor(p0, seller)) { r.policy_id = null; warn.push(`Chính sách ${p0.code} v${p0.version} không dành cho người bán mới — đã bỏ và tự lấy chính sách phù hợp`); }
    }
    // 14/11/2026: phiếu còn hiệu lực (chưa lập HĐ / hủy) luôn theo chính sách được duyệt gần nhất cho căn + người bán; giá trị hoàn thiện theo danh sách
    // «Căn hộ có hoàn thiện» của chính sách đó (căn không có trong danh sách → giữ theo bảng hàng như cũ)
    const live = !old || RES_OPEN.includes(r.status ?? old?.status);
    if (live || changedUnit || r.price == null || !r.policy_id) {
      const p = await pricing(db, u, r.reg_date, seller);
      // giá theo mã căn ở Danh mục sản phẩm: giá trị căn hộ = sau thuế + bảo trì; hoàn thiện = giá trị hoàn thiện căn
      if (r.unit_value == null || (old && changedUnit)) r.unit_value = u.price_net != null ? +u.price_net + (+u.maint_fee || 0) : u.total_price != null ? +u.total_price - (+u.finish_value || 0) : p.price;
      if (old ? changedUnit : r.finish_value == null) r.finish_value = u.finish_value;
      if (live || !r.policy_id) r.policy_id = p.policy?.id ?? null;
      const pf = polFin(p.policy, u.code); if (live && pf != null && r.policy_id === p.policy?.id) r.finish_value = pf;
      if (!p.policy && !r.policy_id) warn.push('Không có chính sách bán hàng đang phát hành cho căn này — giá lấy theo bảng hàng');
    }
    if (r.policy_id) {   // chính sách chỉ dành cho một số đại lý / sàn
      const p0 = await raw(db, 'price_policy', r.policy_id);
      if (p0 && !polFor(p0, seller)) {
        bad(`Chính sách ${p0.code} v${p0.version} chỉ áp dụng cho: ${await polWho(db, p0)} — nguồn bán của phiếu («${await C.optLabel(C.F.reservation.source, r.source)}») không dùng được`, { fields: ['policy_id', 'source'] });
      }
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
    await syncCustomer(db, r.customer_id, custVals(r, old, RES_CUST), user, `Theo phiếu đăng ký ${r.code || ''}`);
    if (!old || old.unit_id !== r.unit_id) {
      const u = await raw(db, 'unit', r.unit_id);
      if (u && !u.activated && !u.lock) await sys(db, 'unit', u.id, { activated: true }, user, 'kich_hoat', 'Mở bán khi lập phiếu đăng ký căn hộ');
    }
    if (r.status === 'huy' && old && old.status !== 'huy') {   // hủy đăng ký khi hợp đồng còn dự thảo / chờ ký → hủy luôn hợp đồng (13/11/2026: cả HĐ lập bằng form tay)
      for (const c of await db.q("SELECT id FROM kd_contract WHERE reservation_id = $1 AND status NOT IN ('da_ky', 'thanh_ly', 'huy')", [r.id])) {
        await sys(db, 'contract', c.id, { status: 'huy' }, user, 'huy', `Hủy theo phiếu đăng ký ${r.code || ''}`);
        await db.q("UPDATE kd_approval SET status = 'huy' WHERE ent = 'contract' AND rec_id = $1 AND status = 'cho_duyet'", [c.id]);
      }
    }
    if (!old || old.status !== r.status || old.unit_id !== r.unit_id || old.deposit !== r.deposit || old.reg_state !== r.reg_state) await recomputeUnit(db, r.unit_id, user);
    if (r.customer_id && ['giu_cho', 'da_coc', 'chuyen_hd'].includes(r.status)) await markCustomer(db, r.customer_id, user);
    if (old && old.unit_id !== r.unit_id) await recomputeUnit(db, old.unit_id, user);
  },
  async decorate(rows, { db }) {
    await stageOf(db, rows); await saleLive(db, rows);
    const ids = rows.filter(r => r.status === 'huy').map(r => r.id);   // tệp scan trả hồ sơ cho cột ở tab «Đã hủy»
    const fs = ids.length ? await db.q("SELECT id, rec_id, name FROM kd_file WHERE ent = 'reservation' AND kind = 'tra_ho_so' AND rec_id = ANY($1) AND deleted_at IS NULL ORDER BY uploaded_at", [ids]) : [];
    for (const r of rows) if (r.status === 'huy') r.ret_files = fs.filter(f => f.rec_id === r.id).map(f => ({ id: f.id, name: f.name }));
  },
  acts: {
    async deposit(r, d) { if (r.price != null && d.deposit > r.price) bad('Tiền đặt cọc lớn hơn giá bán');   // phiếu thuê không có giá bán
      return { patch: { deposit: d.deposit, deposit_on: d.deposit_on, status: 'da_coc' } }; },
    async extend(r, d) { if (Date.parse(d.hold_until) <= Date.now()) bad('Hạn mới phải sau thời điểm hiện tại'); return { patch: { hold_until: d.hold_until, status: r.deposit > 0 ? 'da_coc' : 'giu_cho' } }; },
    // giải phóng căn = hủy đăng ký (07/11/2026): phiếu sang «Đã hủy», trạng thái căn «Hủy đăng ký», căn trả về còn bán
    async release(r, d) { return { patch: { status: 'huy', reg_state: 'huy' }, msg: r.deposit > 0 ? `Đã giải phóng căn — phiếu chuyển sang «Đã hủy». Khách đã cọc ${fmtMoney(r.deposit)}đ — xử lý theo chính sách (lập «Đề xuất hoàn tiền» nếu cần), hệ thống không tự hoàn tiền.` : 'Đã giải phóng căn — phiếu chuyển sang «Đã hủy»' }; },
    async to_contract(r, d, { db, user, demo }) {
      // phiếu đăng ký thuê → hợp đồng thuê: tiền thuê, thời hạn từ phiếu; bắt đầu thuê = ngày dự kiến ký
      if (r.deal !== 'thue' && d.kind === 'thue') bad('Phiếu đăng ký mua không lập hợp đồng thuê — sửa phiếu sang «Đăng ký thuê» và nhập tiền thuê/tháng, hoặc lập phiếu đăng ký thuê mới');
      const kind = r.deal === 'thue' ? 'thue' : d.kind, n = +r.term_months || 12, a = d.plan_sign || today();   // phiếu thuê luôn ra HĐ thuê
      const rent = kind === 'thue' ? { rent: r.rent, term_months: n, eff_on: a, exp_on: addDays(addMonths(a, n), -1), value: Math.round(+r.rent * n) } : { value: r.price };
      const c = (await create('contract', { kind, number: d.number, plan_sign: d.plan_sign, unit_id: r.unit_id, customer_id: r.customer_id, ...rent, owner_id: r.owner_id || user.id, reservation_id: r.id },
        user, { db, system: true, demo })).row;
      await markCustomer(db, r.customer_id, user);
      return { patch: { status: 'chuyen_hd' }, open: ['contract', c.id], msg: kind === 'thue' ? `Đã lập dự thảo hợp đồng thuê ${c.number} (${n} tháng × ${fmtMoney(r.rent)}đ). Bước tiếp: sửa hợp đồng, nhập Số kỳ thanh toán (các kỳ thu tự chia) → gửi trình duyệt.` : `Đã lập dự thảo hợp đồng ${c.number}. Bước tiếp: lập lịch thanh toán → gửi trình duyệt.` };
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
  // gõ / chọn mã khách (ô Mã khách hàng có gợi ý) → dùng khách có mã đó; sửa phiếu đổi sang mã của khách khác → đổi khách
  if (r.cust_code && !opts.check && (!r.customer_id || (old && String(old.cust_code || '').toUpperCase() !== r.cust_code))) {
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
    kind: 'giao_dich', source: r.source === 'dai_ly' ? 'dai_ly' : r.source === 'ctv' ? 'ctv' : r.source === 'khach_gt' ? 'gioi_thieu' : 'truc_tiep', agent_id: r.agent_id, owner_id: r.owner_id || user?.id },
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
  const patch = { full_name: t(h.name) || undefined, phone, phone2, id_no: t(h.id_no) || undefined, birth: birth || undefined, bank_account: t(r.bank_account) || undefined };
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
  if (!t(r.bank_account)) r.bank_account = cur.bank_account;
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
    if ((!r.items || !r.items.length) && r.grp) r.items = (await defaultList(db, 'checklist_noxh', r.grp)).map(x => r.reg_kind === 'thue' ? { ...x, n: rentWord(x.n) } : x);
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
  noDelete: r => !['nhap', 'tu_choi'].includes(r.status) && 'Chỉ xóa được thông báo đang ở bản nháp',
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

// ===== Thông báo bàn giao căn hộ (13/11/2026) =====
// đợt gắn bàn giao của HĐMB = các kỳ thu đánh dấu «Bàn giao» (kể cả phí bảo trì); chưa đánh dấu thì kỳ đầu tiên có chữ «bàn giao / nhận nhà»
const BG_RE = /b[àa]n\s*giao|nh[ậa]n\s*nh[àa]|giao\s*nh[àa]/i;
// «… trong vòng 15 (mười lăm) ngày kể từ ngày nhận thông báo bàn giao» → 15
const bgDaysIn = s => { const m = /(\d+)\s*(?:\([^)]*\)\s*)?ngày[^.;]{0,60}?(?:b[àa]n\s*giao|nh[ậa]n\s*nh[àa]|giao\s*nh[àa])/i.exec(s || ''); return m ? +m[1] : null; };
// các đợt gắn với bàn giao của 1 HĐMB (13/11/2026: nhiều đợt, kể cả dòng phí bảo trì): đợt đã đánh dấu «Bàn giao» → chưa đánh dấu đợt nào thì đợt đầu tiên có nội dung nhắc bàn giao / nhận nhà
const bgPickInst = list => { const m = list.filter(x => x.is_bg); if (m.length) return { items: m, how: 'mark' }; const t = list.find(x => !x.is_maint && BG_RE.test(x.name || '')); return t ? { items: [t], how: 'text' } : { items: [], how: '' }; };
const bgBase = r => r.pay_from === 'thong_bao' ? r.notice_on : r.handover_on;
// thông báo bàn giao đã phát hành (mới nhất) có căn này
async function bgNoticeOf(db, unitId) {
  const u = await db.one('SELECT code, building_id FROM kd_unit WHERE id = $1', [+unitId]); if (!u) return null;
  return (await db.q("SELECT * FROM kd_handover_notice WHERE building_id = $1 AND status = 'da_duyet' ORDER BY handover_on DESC, id DESC", [u.building_id])).find(n => bgCodes(n.unit_list).includes(u.code.toUpperCase())) || null;
}
const bgCodes = v => String(v || '').split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
const bgDue = r => { const b = r.pay_from === 'thong_bao' ? r.notice_on : r.handover_on; return b ? C.addDays(String(b).slice(0, 10), +r.pay_days || 0) : null; };
const d10 = v => v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null;
// mọi căn của tòa + HĐMB đã ký + các đợt gắn bàn giao (hạn hiện tại / hạn mới = ngày bàn giao + số ngày của từng đợt) + căn đã thuộc thông báo khác
async function bgRows(db, r) {
  if (!r.building_id) return [];
  const us = await db.q('SELECT id, code, floor FROM kd_unit WHERE building_id = $1 ORDER BY floor NULLS LAST, code', [+r.building_id]);
  if (!us.length) return [];
  const cts = await db.q(`SELECT DISTINCT ON (c.unit_id) c.id, c.unit_id, c.number, c.contract_on, k.full_name, k.code kcode FROM kd_contract c LEFT JOIN kd_customer k ON k.id = c.customer_id
    WHERE c.unit_id = ANY($1) AND c.kind = 'hdmb' AND c.status = 'da_ky' ORDER BY c.unit_id, c.id DESC`, [us.map(u => u.id)]);
  const ins = cts.length ? await db.q('SELECT id, contract_id, seq, name, due_on, amount, is_maint, is_bg, bg_days FROM kd_installment WHERE contract_id = ANY($1) AND active ORDER BY contract_id, seq', [cts.map(c => c.id)]) : [];
  // 16/11/2026: căn chưa có HĐMB đã ký → HĐ thuê / vay bán căn đã ký có «Tiến độ thu tiền HĐMB»: đợt trong tiến độ đó (sale: true, seq = thứ tự + 1)
  const sales = await db.q(`SELECT DISTINCT ON (c.unit_id) c.id, c.unit_id, c.number, c.contract_on, c.sale_sched, k.full_name, k.code kcode FROM kd_contract c LEFT JOIN kd_customer k ON k.id = c.customer_id
    WHERE c.unit_id = ANY($1) AND c.kind IN ('thue', 'vay') AND c.status = 'da_ky' AND c.sale_on AND jsonb_array_length(coalesce(c.sale_sched, '[]'::jsonb)) > 0 ORDER BY c.unit_id, c.id DESC`, [us.filter(u => !cts.some(c => c.unit_id === u.id)).map(u => u.id)]);
  for (const c of sales) { c.sale = true; cts.push(c); (c.sale_sched || []).forEach((x, k) => ins.push({ id: null, contract_id: c.id, seq: k + 1, name: x.name, due_on: x.due_on, amount: +x.amount || 0, is_maint: !!x.maint, is_bg: !!x.bg, bg_days: x.bg_days ?? null, sale: true })); }
  const other = await db.q("SELECT id, code, doc_no, unit_list, handover_on FROM kd_handover_notice WHERE building_id = $1 AND status IN ('nhap', 'cho_duyet', 'da_duyet') AND id <> $2", [+r.building_id, +r.id || 0]);
  const ctOf = new Map(cts.map(c => [c.unit_id, c])), base = d10(bgBase(r)), def = +r.pay_days || 0;
  const lbl = x => x.is_maint ? `Phí bảo trì${x.name ? ' — ' + x.name : ''}` : x.name || `Đợt ${x.seq}`;
  return us.map(u => {
    const c = ctOf.get(u.id), list = c ? ins.filter(x => x.contract_id === c.id) : [], { items: pk, how } = bgPickInst(list), o = other.find(n => bgCodes(n.unit_list).includes(u.code.toUpperCase()));
    const items = pk.map(i => { const own = i.bg_days != null ? +i.bg_days : how === 'text' ? bgDaysIn(i.name) : null, days = own ?? def;   // số ngày riêng của đợt → không có thì theo thông báo
      return { id: i.id, seq: i.seq, name: lbl(i), maint: !!i.is_maint, own, days, amount: +i.amount, due_old: d10(i.due_on), due_new: base ? C.addDays(base, days) : null, ...(i.sale ? { sale: true } : {}) }; });
    const f = items[0];
    return { id: u.id, code: u.code, floor: u.floor, contract_id: c?.id || null, number: c ? `${c.number || ''}${c.sale ? ' (HĐ thuê / vay — tiến độ HĐMB)' : ''}` : '', sale: !!c?.sale, contract_on: c?.contract_on || null, customer: c ? `${c.full_name || ''}${c.kcode ? ' · ' + c.kcode : ''}` : '',
      items, how, inst_id: f?.id || null, inst_seq: f?.seq || null, inst_name: items.map(x => x.name).join(' + '), days: f?.days ?? def, days_own: f?.own ?? null,
      amount: items.length ? items.reduce((s, x) => s + x.amount, 0) : null, due_old: f?.due_old || null, due_new: f?.due_new || null,
      dots: list.map(x => ({ seq: x.seq, name: lbl(x), maint: !!x.is_maint })), other: o ? (o.doc_no || o.code) : '' };
  });
}
async function bgSuggest(db, qs) {
  const r = { id: +qs.id || 0, building_id: +qs.building || 0, handover_on: qs.on || null, notice_on: qs.notice || null, pay_from: qs.from || 'ban_giao', pay_days: +qs.days || 0 };
  const rows = await bgRows(db, r);
  const first = r.building_id ? await db.one("SELECT min(handover_on) d FROM kd_handover_notice WHERE building_id = $1 AND status = 'da_duyet' AND id <> $2", [r.building_id, r.id]) : null;
  return { rows, due: bgDue(r), bg_from: first?.d || null };
}
// chọn các đợt gắn bàn giao + số ngày từng đợt của 1 HĐMB ngay từ bảng căn của thông báo → ghi thẳng vào Lần thanh toán của HĐMB
// b = { contract_id, items: [{ seq, days }] } (days trống = theo thông báo)
async function bgDueSet(db, ct, i, due) {
  if (!i.sale) return db.q('UPDATE kd_installment SET due_on = $1 WHERE id = $2', [due, i.id]);
  const c = await db.one('SELECT sale_sched FROM kd_contract WHERE id = $1', [ct]); const S = Array.isArray(c?.sale_sched) ? c.sale_sched : [];
  if (!S[i.seq - 1]) return; S[i.seq - 1] = { ...S[i.seq - 1], due_on: due };
  await db.q('UPDATE kd_contract SET sale_sched = $1, updated_at = now() WHERE id = $2', [JSON.stringify(S), ct]);
}
async function bgSet(db, user, b) {
  const c = await db.one("SELECT id, kind, status, number, sale_on, sale_sched FROM kd_contract WHERE id = $1", [+b.contract_id]);
  const sale = c && ['thue', 'vay'].includes(c.kind) && c.sale_on && Array.isArray(c.sale_sched) && c.sale_sched.length;   // 16/11/2026: tiến độ HĐMB của HĐ thuê / vay
  if (!c || !(['hdmb', 'thue_mua'].includes(c.kind) || sale)) bad('Không tìm thấy HĐ mua bán');
  if (['thanh_ly', 'huy'].includes(c.status)) bad('Hợp đồng đã thanh lý / hủy — không đổi đợt bàn giao');
  const want = new Map((Array.isArray(b.items) ? b.items : b.seq ? [{ seq: b.seq, days: b.days }] : []).filter(x => +x.seq > 0)
    .map(x => [+x.seq, x.days === '' || x.days == null ? null : Math.max(0, parseInt(x.days, 10) || 0)]));
  const ins = sale ? c.sale_sched.map((x, k) => ({ id: null, seq: k + 1, name: x.name, is_maint: !!x.maint, is_bg: !!x.bg, bg_days: x.bg_days ?? null }))
    : await db.q('SELECT id, seq, name, is_maint, is_bg, bg_days FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [c.id]);
  const bad1 = [...want.keys()].filter(s => !ins.some(x => x.seq === s)); if (bad1.length) bad(`HĐMB không có đợt ${bad1.join(', ')}`);
  const was = ins.filter(x => x.is_bg).map(x => ({ dot: x.seq, so_ngay: x.bg_days }));
  if (sale) await db.q('UPDATE kd_contract SET sale_sched = $1, updated_at = now(), updated_by = $3 WHERE id = $2', [JSON.stringify(c.sale_sched.map((x, k) => { const { bg, bg_days, ...o } = x; return want.has(k + 1) ? { ...o, bg: true, bg_days: want.get(k + 1) } : o; })), c.id, user?.id ?? null]);
  else for (const x of ins) { const on = want.has(x.seq), d = on ? want.get(x.seq) : null;
    if (!!x.is_bg !== on || (x.bg_days ?? null) !== d) await db.q('UPDATE kd_installment SET is_bg = $2, bg_days = $3, updated_at = now(), updated_by = $4 WHERE id = $1', [x.id, on, d, user?.id ?? null]); }
  const now = [...want].map(([s, d]) => ({ dot: s, so_ngay: d }));
  await C.audit(db, 'contract', c.id, 'dot_ban_giao', { dot_ban_giao: was }, { dot_ban_giao: now }, user,
    now.length ? `Đợt gắn bàn giao: ${now.map(x => { const i = ins.find(y => y.seq === x.dot); return `${i?.is_maint ? 'phí bảo trì' : 'đợt ' + x.dot}${x.so_ngay != null ? ` (${x.so_ngay} ngày)` : ''}`; }).join(', ')}` : 'Bỏ đánh dấu đợt bàn giao');
  await bgReapply(db, c.id, user);
  return { ok: true };
}
// HĐMB thuộc thông báo bàn giao đã phát hành: đổi đợt / số ngày → hạn các đợt gắn bàn giao tự tính lại; đợt bỏ đánh dấu (còn đúng hạn do thông báo đặt) trả về hạn trước đó
async function bgReapply(db, contractId, user) {
  const c = await db.one('SELECT id, unit_id FROM kd_contract WHERE id = $1', [+contractId]); if (!c) return;
  const n = await bgNoticeOf(db, c.unit_id); if (!n) return;
  const x = (await bgRows(db, n)).find(y => y.contract_id === c.id), items = x?.items || [];
  const applied = Array.isArray(n.applied) ? n.applied : [], mine = applied.filter(a => a.ct === c.id), next = applied.filter(a => a.ct !== c.id);
  for (const a of mine) if (a.seq && !items.some(i => i.seq === a.seq) && a.old) {
    const o = a.sale ? { sale: true, seq: a.seq, due_on: ((await db.one('SELECT sale_sched FROM kd_contract WHERE id = $1', [c.id]))?.sale_sched || [])[a.seq - 1]?.due_on }
      : await db.one('SELECT id, due_on FROM kd_installment WHERE contract_id = $1 AND seq = $2 AND active', [c.id, a.seq]);
    if (o && o.due_on && d10(o.due_on) === a.new) { await bgDueSet(db, c.id, o, a.old);
      await C.audit(db, 'contract', c.id, 'han_dot_ban_giao', { due_on: a.new }, { due_on: a.old }, user, `Đợt ${a.seq} không còn gắn bàn giao: trả hạn ${a.old}`); }
  }
  for (const i of items) {
    if (!i.due_new) continue;
    if (i.due_old !== i.due_new) {
      await bgDueSet(db, c.id, i, i.due_new);
      await C.audit(db, 'contract', c.id, 'han_dot_ban_giao', { due_on: i.due_old }, { due_on: i.due_new }, user, `${i.name}: hạn thu theo thông báo bàn giao ${n.doc_no || n.code} (${i.days} ngày)`);
    }
    const a = mine.find(y => y.seq === i.seq);
    next.push({ inst: i.id, seq: i.seq, ct: c.id, unit: x.code, old: a ? a.old : i.due_old, new: i.due_new, ...(i.sale ? { sale: true } : {}) });
  }
  await db.q('UPDATE kd_handover_notice SET applied = $1 WHERE id = $2', [JSON.stringify(next), n.id]);
}
H.handover_notice = {
  noDelete: r => !['nhap', 'tu_choi'].includes(r.status) && 'Chỉ xóa được thông báo đang ở bản nháp / bị từ chối',
  async beforeSave(r, old, { db }) {
    const b = r.building_id && await db.one('SELECT project_id FROM kd_building WHERE id = $1', [+r.building_id]);
    if (b && r.project_id && +b.project_id !== +r.project_id) bad('Tòa không thuộc dự án đã chọn');
    if (r.pay_days != null && +r.pay_days < 0) bad('Số ngày được nộp tiền không được âm');
    if (r.unit_list != null) r.unit_list = bgCodes(r.unit_list).join(',');
    if (!r.unit_list) bad('Tích chọn ít nhất 1 căn hộ bàn giao');
    const rows = await bgRows(db, r), pick = new Set(bgCodes(r.unit_list)), dup = rows.filter(x => pick.has(x.code.toUpperCase()) && x.other);
    if (dup.length) bad(`Căn đã có trong thông báo bàn giao khác: ${dup.slice(0, 8).map(x => `${x.code} (${x.other})`).join(', ')}`);
    const bad1 = [...pick].filter(c => !rows.some(x => x.code.toUpperCase() === c));
    if (bad1.length) bad(`Căn không thuộc tòa đã chọn: ${bad1.slice(0, 8).join(', ')}`);
  },
  async onSubmit(r, { db }) { const rows = await bgRows(db, r), pick = new Set(bgCodes(r.unit_list)); if (!rows.some(x => pick.has(x.code.toUpperCase()) && x.items.length)) bad('Chưa căn nào trong thông báo có HĐMB đã ký xác định được đợt gắn bàn giao — chọn đợt cho từng căn ở bảng căn'); },
  // phát hành: hạn mọi đợt gắn bàn giao của từng HĐMB = ngày bàn giao + số ngày của đợt (ghi lại hạn cũ để hủy thông báo thì trả về)
  async afterApprove(r, ok, { db, user }) {
    if (!ok) return;
    const pick = new Set(bgCodes(r.unit_list)), applied = [];
    for (const x of (await bgRows(db, r)).filter(x => pick.has(x.code.toUpperCase()))) for (const i of x.items) {
      if (!i.due_new) continue;
      if (i.due_old !== i.due_new) {
        await bgDueSet(db, x.contract_id, i, i.due_new);
        await C.audit(db, 'contract', x.contract_id, 'han_dot_ban_giao', { due_on: i.due_old }, { due_on: i.due_new }, user, `${i.name}: hạn thu theo thông báo bàn giao ${r.doc_no || r.code} (${i.days} ngày)`);
      }
      applied.push({ inst: i.id, seq: i.seq, ct: x.contract_id, unit: x.code, old: i.due_old, new: i.due_new, ...(i.sale ? { sale: true } : {}) });
    }
    await db.q('UPDATE kd_handover_notice SET applied = $1 WHERE id = $2', [JSON.stringify(applied), r.id]);
  },
  acts: {
    async revoke(r, d, { db, user }) {
      let back = 0;
      for (const a of r.applied || []) {
        if (a.sale) {   // tiến độ HĐMB của HĐ thuê / vay: đợt còn đúng hạn do thông báo đặt → trả hạn cũ
          const c = await db.one('SELECT sale_sched FROM kd_contract WHERE id = $1', [a.ct]), x = (c?.sale_sched || [])[a.seq - 1];
          if (!x || !a.old || d10(x.due_on) !== a.new) continue;
          await bgDueSet(db, a.ct, { sale: true, seq: a.seq }, a.old); back++;
          await C.audit(db, 'contract', a.ct, 'han_dot_ban_giao', { due_on: a.new }, { due_on: a.old }, user, `Hủy thông báo bàn giao ${r.doc_no || r.code}: trả hạn đợt ${a.seq} (tiến độ HĐMB) gắn bàn giao`);
          continue;
        }
        const i = (a.seq ? await db.one('SELECT id, due_on FROM kd_installment WHERE contract_id = $1 AND seq = $2 AND active', [a.ct, a.seq]) : null) || await db.one('SELECT id, due_on FROM kd_installment WHERE id = $1 AND active', [a.inst]);
        if (!i || !a.old || d10(i.due_on) !== a.new) continue;   // đã sửa tay sau khi phát hành → giữ
        await db.q('UPDATE kd_installment SET due_on = $1 WHERE id = $2', [a.old, i.id]); back++;
        await C.audit(db, 'contract', a.ct, 'han_dot_ban_giao', { due_on: a.new }, { due_on: a.old }, user, `Hủy thông báo bàn giao ${r.doc_no || r.code}: trả hạn thu đợt ${a.seq || ''} gắn bàn giao`);
      }
      return { patch: { status: 'huy' }, msg: `Đã hủy thông báo — trả lại hạn của ${back} đợt thu gắn bàn giao` };
    },
  },
  async decorate(rows, { db, one }) {
    if (!rows.length) return;
    const first = new Map((await db.q("SELECT building_id, min(handover_on) d FROM kd_handover_notice WHERE status = 'da_duyet' AND building_id = ANY($1) GROUP BY 1", [[...new Set(rows.map(r => r.building_id).filter(Boolean))]])).map(x => [x.building_id, x.d]));
    for (const r of rows) {
      const pick = new Set(bgCodes(r.unit_list)), bs = (await bgRows(db, r)).filter(x => pick.has(x.code.toUpperCase()));
      r.n_units = bs.length; r.n_hd = bs.filter(x => x.items.length).length; r.bg_amount = bs.reduce((s, x) => s + (+x.amount || 0), 0);
      r.bg_from = first.get(r.building_id) || null;
      if (one) r._bg = bs.map(x => ({ ...x, items: x.items.map(i => { const a = (r.applied || []).find(y => y.ct === x.contract_id && y.seq === i.seq); return a ? { ...i, due_old: a.old, due_new: a.new } : i; }) }));
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
      if (con) { await sys(db, 'contract', con.id, { unit_id: nu.id, finish_value: nu.finish_value }, user, 'doi_can', `Theo đề nghị ${r.code}`); await syncContractValue(db, con.id, user, `Đổi căn theo đề nghị ${r.code}`); }
      await recomputeUnit(db, nu.id, user);
    }
    if (r.kind === 'doi_kh') {
      const nk = await raw(db, 'customer', r.new_customer_id), bk = bankSplit(nk.bank_account);   // ô bên mua theo người mới, không giữ thông tin người cũ
      if (res) await sys(db, 'reservation', res.id, { customer_id: nk.id, cust_name: nk.full_name, id_no: nk.id_no, id_date: nk.id_date, id_place: nk.id_place, address: nk.address, phone: nk.phone, tax_code: nk.tax_code, bank_account: nk.bank_account }, user, 'doi_kh', `Theo đề nghị ${r.code}`);
      if (con) await sys(db, 'contract', con.id, { customer_id: nk.id, b_name: nk.full_name, ...Object.fromEntries(Object.entries(CT_CUST).map(([f, c]) => [c, nk[f]])), b_bank_acc: bk.acc, b_bank_name: bk.name }, user, 'doi_kh', `Theo đề nghị ${r.code}`);
      await markCustomer(db, r.new_customer_id, user);
    }
    for (const id of new Set([res?.unit_id, con?.unit_id].filter(Boolean))) await recomputeUnit(db, id, user);
  },
};

// hợp đồng được duyệt là đã ký: ngày ký thực tế = ngày ký HĐMB trên hợp đồng (ghi ngày tương lai thì lấy hôm nay)
const signedPatch = r => { const d = String(r.contract_on || today()).slice(0, 10); return { status: 'da_ky', signed_on: d > today() ? today() : d, sign_status: 'da_ky' }; };
// số tháng thuê: 14/01/2025 → 13/01/2030 = 60 (ngày kết thúc + 1 ngày, đếm tháng tròn; lẻ ≥ 15 ngày tính 1 tháng)
function rentMonths(a, b) {
  const s = new Date(a + 'T00:00:00Z'), e = new Date(Date.parse(b + 'T00:00:00Z') + 864e5);
  let m = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth();
  if (e.getUTCDate() < s.getUTCDate()) m--;
  const at = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + m, s.getUTCDate())), rest = Math.round((e - at) / 864e5);
  return Math.max(0, m + (rest >= 15 ? 1 : 0));
}
H.contract = {
  onApprove(r, ok) { if (ok) return { patch: signedPatch(r) }; },
  async afterApprove(r, ok, { db, user }) { if (ok) await resFromContract(db, await raw(db, 'contract', r.id), user); },   // duyệt ở Hộp phê duyệt cũng cập nhật phiếu đăng ký
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
  // lọc theo từng trường: cột lấy theo khách hàng / căn khi hợp đồng để trống (cùng cách listFill hiện ra)
  colExpr: {
    b_name: "(SELECT k.full_name FROM kd_customer k WHERE k.id = t.customer_id)",
    b_id_no: "coalesce(t.b_id_no, (SELECT k.id_no FROM kd_customer k WHERE k.id = t.customer_id))",
    b_id_date: "coalesce(t.b_id_date, (SELECT k.id_date FROM kd_customer k WHERE k.id = t.customer_id))",
    b_id_place: "coalesce(t.b_id_place, (SELECT k.id_place FROM kd_customer k WHERE k.id = t.customer_id))",
    b_addr: "coalesce(t.b_addr, (SELECT k.address FROM kd_customer k WHERE k.id = t.customer_id))",
    b_phone: "coalesce(t.b_phone, (SELECT k.phone FROM kd_customer k WHERE k.id = t.customer_id))",
    unit_id: "(SELECT u.code FROM kd_unit u WHERE u.id = t.unit_id)",
    area_tt: "coalesce(t.area_tt, (SELECT u.area_tt FROM kd_unit u WHERE u.id = t.unit_id))",
    base_price: "coalesce(t.base_price, (SELECT u.base_price FROM kd_unit u WHERE u.id = t.unit_id))",
    pretax: "coalesce(t.pretax, (SELECT u.pretax FROM kd_unit u WHERE u.id = t.unit_id))",
    vat_pct: "coalesce(t.vat_pct, (SELECT u.vat_pct FROM kd_unit u WHERE u.id = t.unit_id))",
    vat_amt: "coalesce(t.vat_amt, (SELECT u.tax_amt FROM kd_unit u WHERE u.id = t.unit_id))",
    after_tax: "coalesce(t.after_tax, (SELECT u.price_net FROM kd_unit u WHERE u.id = t.unit_id))",
    maint_fee: "coalesce(t.maint_fee, (SELECT u.maint_fee FROM kd_unit u WHERE u.id = t.unit_id))",
  },
  // danh sách theo nhóm: ?group=can_ho (HĐ mua bán) | hoan_thien (HĐ hoàn thiện căn hộ) | lien_ke
  where(qs) {
    if (qs.group === 'hoan_thien') return { sql: 't.ptype = $1 AND t.kind = $2', params: ['can_ho', 'hoan_thien'] };
    if (qs.group === 'can_ho') return { sql: "t.ptype = $1 AND t.kind NOT IN ('hoan_thien', 'thue', 'vay')", params: ['can_ho'] };
    if (qs.group === 'vay') return { sql: 't.ptype = $1 AND t.kind = $2', params: ['can_ho', 'vay'] };
    if (qs.group === 'thue') return { sql: 't.ptype = $1 AND t.kind = $2', params: ['can_ho', 'thue'] };
    if (qs.group === 'lien_ke') return { sql: 't.ptype = $1', params: [qs.group] };
  },
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
    // bên mua: ô trống lấy theo hồ sơ khách; tài khoản dạng «Số - Ngân hàng» tách 2 ô
    if (!old || old.customer_id !== r.customer_id) {
      const k = await raw(db, 'customer', r.customer_id), b = bankSplit(k?.bank_account);
      if (k) for (const [f, c] of Object.entries(CT_CUST)) if (r[c] == null || r[c] === '') r[c] = k[f];
      r.b_bank_acc ||= b.acc; r.b_bank_name ||= b.name;
    }
    if (/\s-\s/.test(r.b_bank_acc || '')) { const b = bankSplit(r.b_bank_acc); r.b_bank_acc = b.acc; r.b_bank_name = b.name || r.b_bank_name; }
    // số bảng giá = tòa của căn (Danh mục sản phẩm); chính sách giá lấy theo phiếu giữ chỗ / chính sách đang phát hành
    r.building_id = (await raw(db, 'unit', r.unit_id))?.building_id ?? null;
    if (!r.price_policy_id) r.price_policy_id = (await contractPrefill(db, r.unit_id, r.contract_on || undefined)).policy_id;
    // chung cư có giá nền: tính như BRAVO / Danh mục sản phẩm — chỉ khi tạo mới hoặc đổi ô giá (hợp đồng cũ giữ nguyên số)
    const PK = ['base_price', 'base_orig', 'area_tt', 'floor_price', 'area_floor', 'discount', 'corner_pct', 'vat_pct', 'finish_value', 'unit_id'];
    // HĐ thuê (BRAVO): số tháng theo ngày bắt đầu – kết thúc, tổng tiền = đơn giá thuê × số tháng
    if (r.kind !== 'thue') { r.rent_house = null; r.rent_furn = null; }
    if (!['thue', 'vay'].includes(r.kind)) r.unit_total = null;   // HĐ vay bán căn cũng có Giá trị HĐMB (07/11/2026)
    if (['thue', 'vay'].includes(r.kind)) {
      // Tổng tiền (giá trị hợp đồng, chỉ để thông tin) = Tổng giá căn hộ theo Danh mục sản phẩm − Tiền giảm giá (trừ thẳng, như HĐMB)
      const same = old && String(old.unit_total ?? '') === String(r.unit_total ?? '');
      if (r.unit_id && (r.unit_total == null || (old && old.unit_id !== r.unit_id && same))) {   // chưa có / đổi căn → lấy lại theo căn
        const u = await raw(db, 'unit', r.unit_id), t = u?.total_price != null ? +u.total_price : u?.price_net != null ? +u.price_net + (+u.maint_fee || 0) + (+u.finish_value || 0) : null;
        r.unit_total = t != null ? t - (+r.discount || 0) : null;
      } else if (same && r.unit_total != null && String(old.discount ?? '') !== String(r.discount ?? '')) r.unit_total = +old.unit_total + (+old.discount || 0) - (+r.discount || 0);   // chỉ sửa giảm giá
    }
    if (r.kind === 'thue') {
      if (r.area_tt == null || r.area_floor == null) { const u = await raw(db, 'unit', r.unit_id); r.area_tt ??= u?.area_tt ?? null; r.area_floor ??= u?.area_xd ?? null; }   // diện tích theo căn (sàn = diện tích xây dựng / tim tường)
      if (r.eff_on && r.exp_on && r.exp_on >= r.eff_on) r.term_months = rentMonths(r.eff_on, r.exp_on);
      if (r.rent_house != null || r.rent_furn != null) r.rent = (+r.rent_house || 0) + (+r.rent_furn || 0);   // tổng giá thuê/tháng = thuê nhà + thuê nội thất
      if (+r.rent > 0 && +r.term_months > 0) r.value = Math.round(+r.rent * +r.term_months);
      if (+r.pay_times > 0 && +r.term_months > 0 && +r.pay_times > +r.term_months) bad(`Số kỳ thanh toán (${r.pay_times}) không được nhiều hơn thời hạn thuê (${r.term_months} tháng)`, { fields: ['pay_times'] });
    }
    // chưa có giá nền (căn chưa nạp số Bravo, VD tòa G; hoặc lập HĐ không qua form): giá nền gốc theo căn — để giảm giá, phí bảo trì 2% tính được
    // (chỉ khi tạo mới hoặc đổi tiền giảm giá: hợp đồng cũ giữ nguyên số)
    if (!['thue', 'vay', 'hoan_thien'].includes(r.kind) && r.ptype !== 'lien_ke' && !(+r.base_price > 0) && r.unit_id && (!old || String(old.discount ?? '') !== String(r.discount ?? ''))) {
      const u = await raw(db, 'unit', r.unit_id), b = unitBase(u); r.area_tt ??= u?.area_tt ?? null;
      if (b && +r.area_tt > 0) { r.base_price = b; r.base_orig = null; }
    }
    const priceChg = !old || PK.some(k => String(old[k] ?? '') !== String(r[k] ?? ''));
    if (priceChg && !(+r.discount > 0) && old && +old.discount > 0 && +old.base_orig > 0 && String(r.base_price ?? '') === String(old.base_price ?? '')) r.base_price = +old.base_orig;   // xóa tiền giảm → về giá gốc
    // có giảm giá mà chưa có giá nền gốc: HĐ cũ (giá nền đã trừ tiền giảm / DT) → cộng lại; nhập mới qua API → giá nền gửi lên là giá gốc
    if (priceChg && +r.discount > 0 && !(+r.base_orig > 0) && +r.base_price > 0) r.base_orig = old && +old.discount > 0 && !(+old.base_orig > 0) && +old.area_tt > 0 ? Math.round(+old.base_price + +old.discount / +old.area_tt) : +r.base_price;
    if (!['thue', 'vay'].includes(r.kind) && r.ptype !== 'lien_ke' && +r.base_price > 0 && +r.area_tt > 0 && priceChg) Object.assign(r, contractPrice(r));
    if (r.pretax > 0 && r.vat_pct != null && r.vat_amt == null) r.vat_amt = Math.round(r.pretax * r.vat_pct / 100);
    if (r.pretax > 0 && r.after_tax == null) r.after_tax = r.pretax + (r.vat_amt || 0);
    if (r.pretax > 0 && r.maint_fee == null && ['hdmb', 'thue_mua'].includes(r.kind)) r.maint_fee = Math.round(+r.pretax * 0.02 / 1000) * 1000;   // phí bảo trì = 2% × tiền trước thuế
    if (r.kind === 'hoan_thien' && r.finish_value != null) r.value = +r.finish_value - (+r.discount || 0);
    if (!(r.value > 0)) bad('Giá trị hợp đồng phải > 0');
    if (r.status === 'thanh_ly') { { const miss = ['liquidated_on', 'liquidate_reason'].filter(k => !r[k]); if (miss.length) bad('Hợp đồng đã thanh lý: chọn ' + miss.map(k => C.F.contract[k].l).join(' và '), { fields: miss }); } if (r.liquidated_on > today()) bad('Ngày thanh lý không được sau hôm nay'); }
    else { r.liquidated_on = null; r.liquidate_reason = null; r.liquidate_note = null; }
    if (r.loan_status === 'co_vay' && !String(r.loan_bank || '').trim()) bad('Có vay: ghi ngân hàng cho vay');
    if (r.loan_status !== 'co_vay') { r.loan_bank = null; r.loan_doc3 = null; }
    if (r.late_rate != null && r.late_rate !== '' && !(+r.late_rate >= 0 && +r.late_rate <= 100)) bad('Lãi suất quá hạn phải từ 0 đến 100 (%/năm)', { fields: ['late_rate'] });
    if (['hdmb', 'thue_mua'].includes(r.kind)) { if (+r.maint_fee > 0 && r.maint_dot == null) r.maint_dot = 3; if (r.maint_dot != null && !(+r.maint_dot >= 1)) bad('Đợt thu phí bảo trì phải từ 1 trở lên', { fields: ['maint_dot'] }); } else r.maint_dot = null;
    // bảng «Lần thanh toán» trên form: kiểm tra khớp Tổng tiền (ghi thành lịch thu ở afterSave)
    // không lưu vào cột (lịch thu nằm ở kd_installment) — chuyển sang afterSave qua ctx
    ctx.sched = Array.isArray(r.new_schedule) && r.new_schedule.length ? await normSchedule(db, r.new_schedule.map(x => x.pct != null ? { ...x, amount: null } : x), r.value, 'Lần thanh toán', ['hdmb', 'thue_mua'].includes(r.kind) ? +r.maint_fee || 0 : 0, r.maint_dot, ['hdmb', 'thue_mua'].includes(r.kind) ? +r.finish_value || 0 : 0) : null;
    r.new_schedule = null;
    // tiến độ thu tiền HĐMB của HĐ thuê / vay bán căn: tổng các đợt phải khớp Giá trị HĐMB
    if (!['thue', 'vay'].includes(r.kind)) r.sale_on = null;
    if (['thue', 'vay'].includes(r.kind) && r.sale_on && Array.isArray(r.sale_sched) && r.sale_sched.length) {   // tick «Có tiến độ thu tiền HĐMB»
      if (!(+r.unit_total > 0)) bad('Tiến độ thu tiền HĐMB: nhập Giá trị HĐMB trước', { fields: ['unit_total'] });
      // 16/11/2026: như Lần thanh toán HĐMB — phí bảo trì của căn ở dòng riêng (% các đợt tính trên Giá trị HĐMB − phí bảo trì), đánh dấu đợt bàn giao
      const mf = r.unit_id ? +((await db.one('SELECT maint_fee FROM kd_unit WHERE id = $1', [+r.unit_id]))?.maint_fee || 0) : 0;
      const n = r.unit_id && r.status !== 'da_ky' && r.sale_sched.some(x => x.bg) ? await bgNoticeOf(db, r.unit_id) : null   /* HĐ đã ký: bgReapply sau khi lưu (ghi hạn cũ vào thông báo) */, b0 = n ? d10(bgBase(n)) : null;
      const rows0 = r.sale_sched.map(x => ({ ...(x.pct != null && x.pct !== '' ? { ...x, amount: null } : x), ...(x.bg && b0 ? { due_on: C.addDays(b0, x.bg_days === '' || x.bg_days == null ? +n.pay_days || 0 : +x.bg_days) } : {}) }));
      r.sale_sched = saleOut(await normSchedule(db, rows0, +r.unit_total, 'Tiến độ thu tiền HĐMB', mf, 3));
    } else r.sale_sched = null;
    if (!old || old.unit_id !== r.unit_id) {
      const u = r.unit_id ? await raw(db, 'unit', r.unit_id) : null;
      if (!u) bad('Chọn mã căn hộ', { fields: ['unit_id'] });
      if (!u.activated && !opts.system) bad(`Căn ${u.code} chưa được duyệt mở bán`);
      if (r.kind !== 'hoan_thien' && !opts.system) {
        const res = await db.one(`SELECT code, customer_id FROM kd_reservation WHERE unit_id = $1 AND status IN ${ACTIVE_RES}`, [r.unit_id]);
        if (res && res.customer_id !== r.customer_id) bad(`Căn ${u.code} đang được giữ chỗ cho khách khác (${res.code})`);
      }
    }
    if (r.kind === 'hoan_thien') {
      const main = await db.one("SELECT id FROM kd_contract WHERE unit_id = $1 AND kind IN ('hdmb','vay','thue_mua','thue') AND status NOT IN ('huy','thanh_ly') AND id <> $2", [r.unit_id, old?.id || 0]);
      if (!main) bad('HĐ hoàn thiện cần căn đã có hợp đồng mua bán / thuê / thuê mua');
    }
    if (['thue', 'thue_mua'].includes(r.kind) && r.eff_on && r.exp_on && r.exp_on < r.eff_on) bad('Ngày kết thúc thuê phải sau ngày bắt đầu thuê');
    if (r.kind === 'thue') { const miss = [['eff_on', 'Ngày bắt đầu thuê'], ['exp_on', 'Ngày kết thúc thuê']].filter(([k]) => !r[k]); if (miss.length) bad('Thiếu thông tin bắt buộc: ' + miss.map(x => x[1]).join(', '), { fields: miss.map(x => x[0]) }); }
    if (r.kind === 'thue' && !(+r.rent > 0)) bad('Nhập tiền thuê/tháng', { fields: ['rent'] });
    if (['hdmb', 'thue_mua', 'thue'].includes(r.kind) && !['huy', 'thanh_ly'].includes(r.status) && r.unit_id) {
      const rentLive = `c.kind = 'thue' AND coalesce(c.nature, 'thue') <> 'ban' AND ${LIVE_CT('c', '$3::date')}`;   // đang cho thuê, còn hạn
      const q = r.kind === 'thue' && (r.nature || 'thue') !== 'ban' ? `(${rentLive} OR (c.kind IN ('hdmb','thue_mua') AND c.status NOT IN ('huy','thanh_ly')))` : ['hdmb', 'thue_mua'].includes(r.kind) ? rentLive : null;
      const d = q && await db.one(`SELECT c.number FROM kd_contract c WHERE c.unit_id = $1 AND c.id <> $2 AND ${q} LIMIT 1`, [r.unit_id, old?.id || 0, today()]);
      if (d) bad(`Căn này đang có hợp đồng còn hiệu lực (${d.number || 'chưa có số'}) — ${r.kind === 'thue' ? 'không cho thuê trùng' : 'HĐ thuê chưa hết hạn'}`);
    }
    // HĐ vay: ngày bắt đầu tính lãi, đáo hạn, thời hạn tự suy ra nhau; lãi = tiền thuê 1 tháng / tháng (lấy theo HĐ thuê đi kèm nếu để trống) hoặc theo lãi suất
    if (r.kind === 'vay') {
      if (+r.loan_rate > 0) r.int_mode = 'lai_suat';   // nhập % ở «Cách tính lãi theo hợp đồng» → tính theo lãi suất
      r.int_mode ||= 'tien_thue'; r.int_period ??= '1'; r.principal_method ||= 'dao_han'; r.eff_on ||= r.loan_recv_on || r.contract_on;
      if (r.eff_on && +r.term_months > 0 && (!r.exp_on || (old && +old.term_months !== +r.term_months && old.exp_on === r.exp_on))) r.exp_on = addDays(addMonths(r.eff_on, +r.term_months), -1);
      if (r.eff_on && r.exp_on && r.exp_on < r.eff_on) bad('Ngày đáo hạn phải sau ngày bắt đầu tính lãi', { fields: ['exp_on'] });
      if (r.eff_on && r.exp_on && !(+r.term_months > 0)) r.term_months = rentMonths(r.eff_on, r.exp_on);
      // lãi trả bằng tiền thuê: mỗi tháng = tiền thuê/tháng của HĐ thuê đi kèm (ô tiền thuê không còn trên form HĐ vay) — luôn lấy lại theo HĐ thuê
      if (r.int_mode === 'tien_thue' && r.link_ids?.length) { const x = (await db.one("SELECT rent FROM kd_contract WHERE id = ANY($1) AND kind = 'thue' AND rent > 0 ORDER BY id LIMIT 1", [r.link_ids]))?.rent; if (x != null) r.rent = +x; }
      if (r.int_mode === 'tien_thue' && !(+r.rent > 0)) bad('Lãi trả bằng tiền thuê: tick chọn HĐ thuê đi kèm (lãi mỗi tháng = tiền thuê/tháng của HĐ thuê đó), hoặc chọn «Theo lãi suất %/năm»', { fields: ['link_ids'] });
      if (r.int_mode === 'lai_suat' && !(+r.loan_rate > 0)) bad('Nhập lãi suất %/năm', { fields: ['loan_rate'] });
      if (r.int_mode !== 'lai_suat') r.loan_rate = null;
      if (!(+r.term_months > 0) && !r.exp_on) ctx.warn?.push('HĐ vay chưa có Thời hạn vay / Ngày đáo hạn — chưa lập lịch trả lãi');
    } else for (const k of ['loan_recv_on', 'loan_tranches', 'int_mode', 'loan_rate', 'int_period', 'principal_method', 'int_note']) r[k] = null;
    // HĐ vay ↔ HĐ thuê đi kèm (tick chọn 2 chiều)
    if (!['thue', 'vay'].includes(r.kind)) r.link_ids = null;
    else if (r.link_ids?.length) {
      const other = r.kind === 'vay' ? 'thue' : 'vay';
      if ((await db.one('SELECT count(*) n FROM kd_contract WHERE id = ANY($1) AND (kind <> $2 OR id = $3)', [r.link_ids, other, old?.id || 0])).n) bad(`Chỉ tick chọn ${other === 'thue' ? 'HĐ thuê' : 'HĐ vay'}`, { fields: ['link_ids'] });
    }
    // bản chất giao dịch: HĐMB / thuê mua = bán; HĐ vay mặc định bán, HĐ thuê mặc định cho thuê (sửa được)
    if (r.kind === 'hoan_thien') r.nature = null;
    else if (!['thue', 'vay'].includes(r.kind)) r.nature = 'ban';
    else if (!r.nature) r.nature = r.kind === 'thue' ? 'thue' : 'ban';
    if (r.nature === 'ban' && ['thue', 'vay'].includes(r.kind)) { if (r.sale_price == null) { const u = await raw(db, 'unit', r.unit_id); r.sale_price = u?.price_net != null ? +u.price_net + (+u.maint_fee || 0) : u?.total_price ?? null; } }
    else { r.sale_price = null; r.plan_hdmb = null; }
    // HĐMB nối tiếp HĐ vay / HĐ thuê bản chất bán của căn (chỉ để gom giao dịch — tiền đã thu không trừ vào giá mua)
    if (['hdmb', 'thue_mua'].includes(r.kind)) {
      if (!old && !r.prev_id) {
        const p = await db.one("SELECT id, number, kind FROM kd_contract WHERE unit_id = $1 AND kind IN ('vay','thue') AND nature = 'ban' AND next_id IS NULL AND status NOT IN ('huy','thanh_ly') ORDER BY id DESC LIMIT 1", [r.unit_id]);
        if (p) { r.prev_id = p.id; ctx.warn?.push(`Đã nối với ${p.kind === 'vay' ? 'HĐ vay' : 'HĐ thuê'} số ${p.number} của căn (cùng giao dịch bán) — tiền đã thu theo hợp đồng đó không trừ vào giá mua`); }
      }
      if (r.prev_id) {
        const p = await raw(db, 'contract', r.prev_id);
        if (!p || p.unit_id !== r.unit_id) bad('Hợp đồng chuyển tiếp phải cùng mã căn', { fields: ['prev_id'] });
        if (!['vay', 'thue'].includes(p.kind) || p.nature !== 'ban') bad('Chỉ nối được với HĐ vay / HĐ thuê có bản chất «Bán căn hộ»', { fields: ['prev_id'] });
        if (p.next_id && p.next_id !== old?.id) bad(`Hợp đồng ${p.number} đã chuyển sang hợp đồng khác`, { fields: ['prev_id'] });
      }
    } else r.prev_id = null;
  },
  async onSubmit(r, { db }) {
    const n = await db.one('SELECT count(*) n, coalesce(sum(amount),0) s FROM kd_installment WHERE contract_id = $1 AND active', [r.id]);
    if (r.kind !== 'thue' && !n.n) bad('Chưa có lịch thanh toán — bấm «Sửa», nhập «Lần thanh toán» rồi lưu trước khi gửi trình duyệt');
    if (n.n && n.s !== r.value) bad(`Tổng lịch thanh toán ${fmtMoney(n.s)} khác giá trị hợp đồng ${fmtMoney(r.value)}`);
  },
  async afterSave(r, old, { db, user, demo, sched }) {
    // nối giao dịch: hợp đồng trước ghi «Đã chuyển sang hợp đồng»; hủy / thanh lý / bỏ nối thì gỡ
    const live = !['huy', 'thanh_ly'].includes(r.status);
    if (old?.prev_id && (old.prev_id !== r.prev_id || !live)) await db.q('UPDATE kd_contract SET next_id = NULL, updated_at = now() WHERE id = $1 AND next_id = $2', [old.prev_id, r.id]);
    if (r.prev_id && live && (await raw(db, 'contract', r.prev_id))?.next_id !== r.id) await sys(db, 'contract', r.prev_id, { next_id: r.id }, user, 'chuyen_hdmb', `Chuyển tiếp sang hợp đồng ${r.number || ''}`);
    // HĐ vay ↔ HĐ thuê: bên kia tự thêm / bỏ liên kết
    { const nw = r.link_ids || [], od = old?.link_ids || [], add = nw.filter(x => !od.includes(x)), rem = od.filter(x => !nw.includes(x));
      if (add.length) await db.q("UPDATE kd_contract SET link_ids = array_append(coalesce(link_ids, '{}'::int[]), $1::int) WHERE id = ANY($2) AND NOT ($1::int = ANY(coalesce(link_ids, '{}'::int[])))", [r.id, add]);
      if (rem.length) await db.q("UPDATE kd_contract SET link_ids = nullif(array_remove(link_ids, $1::int), '{}'::int[]) WHERE id = ANY($2)", [r.id, rem]); }
    if (r.kind === 'vay' || old?.kind === 'vay') await loanSchedule(db, r, user, demo);
    const cv = custVals(r, old, CT_CUST);
    if (['b_bank_acc', 'b_bank_name'].some(c => !old || old[c] !== r[c])) cv.bank_account = [r.b_bank_acc, r.b_bank_name].filter(Boolean).join(' - ');
    await syncCustomer(db, r.customer_id, cv, user, `Theo hợp đồng ${r.number}`);
    // lịch ký sửa ở hợp đồng (hoặc màn Lịch ký) → về hồ sơ mua NOXH của khách (cùng căn nếu có), để 2 bên luôn khớp
    if (old && r.kind !== 'hoan_thien' && ['plan_sign', 'sign_place', 'sign_status'].some(k => String(old[k] ?? '') !== String(r[k] ?? '')))
      await db.q(`UPDATE kd_noxh_check SET plan_sign = $1, sign_place = $2, sign_status = coalesce($3, sign_status), updated_at = now() WHERE customer_id = $4 AND (unit_id IS NULL OR unit_id = $5)`,
        [r.plan_sign ?? null, r.sign_place ?? null, r.sign_status ?? null, r.customer_id, r.unit_id]);
    if (sched?.length && ['thanh_ly', 'huy'].includes(r.status)) {   // HĐ đã thanh lý / hủy: không đổi lịch thu
      const cur0 = await db.q('SELECT seq, name, due_on, pct, amount, is_maint FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [r.id]);
      const k0 = xs => JSON.stringify(xs.map(x => [x.name, String(x.due_on).slice(0, 10), x.pct == null ? null : +x.pct, +x.amount, !!x.is_maint]));   // HĐ đã thanh lý: chỉ so số liệu, không so đánh dấu bàn giao
      if (k0(cur0) !== k0(sched)) bad('Hợp đồng đã thanh lý / hủy — không sửa Lần thanh toán');
    }
    if (sched?.length && ['du_thao', 'tu_choi', 'cho_duyet', 'cho_ky', 'da_ky'].includes(r.status)) {   // ghi lịch thu khi khác lịch đang có (13/11/2026: HĐ đã ký vẫn sửa được)
      const cur = await db.q('SELECT name, due_on, pct, amount, is_maint, is_bg, bg_days, is_fin FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [r.id]);
      const key = xs => JSON.stringify(xs.map(x => [x.name, String(x.due_on).slice(0, 10), x.pct == null ? null : +x.pct, +x.amount, !!x.is_maint, !!x.is_bg, x.is_bg && x.bg_days != null ? +x.bg_days : null, !!x.is_fin]));
      if (key(cur) !== key(sched)) { await writeSchedule(db, r.id, sched, 'hop_dong', user, demo); if (['hdmb', 'thue_mua'].includes(r.kind) && r.status === 'da_ky') await bgReapply(db, r.id, user); }
    }
    // HĐMB mới chưa nhập Lần thanh toán (VD chuyển từ phiếu giữ chỗ): lấy theo tiến độ thu tiền của chính sách bán hàng áp cho căn (16/11/2026)
    if (!old && !sched?.length && ['hdmb', 'thue_mua', 'hoan_thien'].includes(r.kind) && ['du_thao', 'tu_choi'].includes(r.status)) { const p = await schedPolicy(db, r); if (p) try { await policyApplyOne(db, p, r, user, demo); } catch (e) { if (e.status !== 400) throw e; } }   // đợt chưa có ngày cố định: để HĐ tự nhập
    // HĐ thuê / vay bán căn đã ký, tiến độ HĐMB đổi: đợt gắn bàn giao theo thông báo đã phát hành (ghi vào thông báo để hủy thì trả hạn) — 16/11/2026
    if (['thue', 'vay'].includes(r.kind) && r.status === 'da_ky' && r.sale_on && JSON.stringify(r.sale_sched || null) !== JSON.stringify(old?.sale_sched || null)) await bgReapply(db, r.id, user);
    await resFromContract(db, r, user);
    if (old && old.status !== r.status && ['huy', 'thanh_ly'].includes(r.status) && ['hdmb', 'thue_mua'].includes(r.kind) && r.customer_id)
      for (const h of await db.q("SELECT id, status FROM kd_contract WHERE kind = 'hoan_thien' AND unit_id = $1 AND customer_id = $2 AND status NOT IN ('huy', 'thanh_ly')", [r.unit_id, r.customer_id])) {
        const tl = h.status === 'da_ky';   // HĐ hoàn thiện đã ký → thanh lý cùng ngày; chưa ký → hủy
        await sys(db, 'contract', h.id, tl ? { status: 'thanh_ly', liquidated_on: r.liquidated_on || today(), liquidate_reason: r.liquidate_reason || 'tra_lai' } : { status: 'huy' }, user, tl ? 'thanh_ly' : 'huy', `Theo HĐ mua bán ${r.number || ''} ${r.status === 'huy' ? 'đã hủy' : 'đã thanh lý'}`);
        await db.q("UPDATE kd_approval SET status = 'huy' WHERE ent = 'contract' AND rec_id = $1 AND status = 'cho_duyet'", [h.id]);
      }
    if (!old || old.status !== r.status || old.unit_id !== r.unit_id) { await recomputeUnit(db, r.unit_id, user); if (old && old.unit_id !== r.unit_id) await recomputeUnit(db, old.unit_id, user); }
    if (old && old.status !== r.status) await refreshCommission(db, r.id, user);
  },
  async decorate(rows, { db, one }) {
    const D = await debtOf(db, rows.map(r => r.id));
    for (const r of rows) { const d = D.get(r.id); r.paid = d.paid; r.left = d.left; r.overdue = d.overdue; if (one) r._debt = d; }
    if (one) for (const r of rows) if (r.kind === 'vay') r._loan = await db.q('SELECT * FROM kd_loan_pay WHERE contract_id = $1 ORDER BY due_on, kind DESC, seq', [r.id]);
    if (!one) await H.contract.listFill(rows, db);
    if (one && rows[0]) rows[0].new_schedule = (await db.q('SELECT name, due_on, pct, amount, is_maint, is_bg, bg_days, is_fin FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [rows[0].id]))
      .map(x => ({ name: x.name, due_on: x.due_on, pct: x.pct == null ? null : +x.pct, amount: x.pct == null ? +x.amount : null, ...(x.is_maint ? { maint: true } : {}), ...(x.is_fin ? { fin: true } : {}), ...(x.is_bg ? { bg: true, bg_days: x.bg_days == null ? null : +x.bg_days } : {}) }));
    if (one && rows[0] && ['hdmb', 'thue_mua'].includes(rows[0].kind)) { const n = await bgNoticeOf(db, rows[0].unit_id); if (n) rows[0]._bg_base = { doc: n.doc_no || n.code, on: String(bgBase(n)).slice(0, 10), days: +n.pay_days || 0 }; }   // form sửa: lịch thu đang có (dòng phí bảo trì riêng có maint)
  },
  acts: {
    async schedule(r, d, { db, user, demo }) {
      const rows = await normSchedule(db, d.rows, r.value, 'Lịch thanh toán', ['hdmb', 'thue_mua'].includes(r.kind) ? +r.maint_fee || 0 : 0, r.maint_dot, ['hdmb', 'thue_mua'].includes(r.kind) ? +r.finish_value || 0 : 0);
      await writeSchedule(db, r.id, rows, 'hop_dong', user, demo);
      return { msg: `Đã lập ${rows.length} kỳ thu, tổng ${fmtMoney(r.value)}đ` };
    },
    async liquidate(r, d, { db, user }) {   // đóng phiếu của căn để căn trống lại, bán lại được
      await closeReservations(db, r, user);
      if (d.liquidated_on > today()) bad('Ngày thanh lý không được sau hôm nay');
      const why = C.F.contract.liquidate_reason.o.find(o => o[0] === d.liquidate_reason)?.[1] || d.liquidate_reason;
      return { patch: { status: 'thanh_ly', liquidated_on: d.liquidated_on, liquidate_reason: d.liquidate_reason, liquidate_note: d.liquidate_note || null }, note: [why, d.liquidate_note].filter(Boolean).join(' — ') };
    },
    async print(r) { return { url: `/print/contract/${r.id}` }; },
  },
  noDelete: r => !['du_thao', 'tu_choi'].includes(r.status) && 'Chỉ xóa được hợp đồng đang ở dự thảo',
  async beforeDelete(r, { db }) {   // lịch thu + hoa hồng dự kiến tự sinh theo hợp đồng; phiếu thu thật vẫn chặn xóa
    await db.q('UPDATE kd_contract SET next_id = NULL WHERE next_id = $1', [r.id]);   // gỡ nối giao dịch (HĐ vay / thuê → HĐMB này)
    await db.q("UPDATE kd_contract SET link_ids = nullif(array_remove(link_ids, $1::int), '{}'::int[]) WHERE $1::int = ANY(link_ids)", [r.id]);   // gỡ tick HĐ vay ↔ thuê
    await db.q('DELETE FROM kd_loan_pay WHERE contract_id = $1', [r.id]);
    await db.q("DELETE FROM kd_commission WHERE contract_id = $1 AND status IN ('du_kien', 'nhap', 'tu_choi', 'huy')", [r.id]);
    await db.q('DELETE FROM kd_installment WHERE contract_id = $1', [r.id]);
  },
  async afterDelete(r, { db, user }) {
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

// phiếu thu / phiếu chi: thông tin hợp đồng – khách hàng lấy theo hợp đồng, ghi kèm phiếu để tra cứu, lọc, xuất Excel (06/11/2026)
const RC_GRP_OF = { hdmb: 'tien_can', thue: 'tien_thue', thue_mua: 'tien_thue', vay: 'goc_vay', hoan_thien: 'hoan_thien' };
const VINFO = `SELECT c.id contract_id, c.number, c.kind ct_kind, c.status, c.unit_id, u.code unit_code, k.code cust_code, k.full_name cust_name, pr.name project_name
  FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_customer k ON k.id = c.customer_id`;
async function fillVoucher(db, r, rc) {
  const v = await db.one(VINFO + ' WHERE c.id = $1', [+r.contract_id]); if (!v) bad('Không tìm thấy hợp đồng');
  Object.assign(r, { unit_id: v.unit_id, cust_code: v.cust_code, cust_name: v.cust_name, project_name: v.project_name, ct_kind: v.ct_kind });
  if (rc && !r.grp) r.grp = r.installment_id && (await raw(db, 'installment', r.installment_id))?.is_maint ? 'phi_bao_tri' : RC_GRP_OF[v.ct_kind] || 'khac';
}
// form phiếu: chọn mã căn / mã hợp đồng / đợt → các ô tự điền
async function voucherPrefill(db, { contract_id, unit_id, installment_id, loan_pay_id }) {
  let n = 0;
  if (!contract_id && unit_id) {
    const cs = await db.q("SELECT id FROM kd_contract WHERE unit_id = $1 AND status <> 'huy' ORDER BY (status = 'da_ky') DESC, (kind = 'hdmb') DESC, id DESC", [+unit_id]);
    n = cs.length; contract_id = cs[0]?.id;
    if (!contract_id) { const u = await raw(db, 'unit', +unit_id); return { contract_id: null, unit_id: u?.id ?? null, unit_label: u?.code || '', n: 0 }; }
  }
  const v = await db.one(VINFO + ' WHERE c.id = $1', [+contract_id]); if (!v) bad('Không tìm thấy hợp đồng');
  const out = { ...v, contract_label: v.number, unit_label: v.unit_code, grp: RC_GRP_OF[v.ct_kind] || 'khac', n };
  if (installment_id) {
    const i = (await debtOf(db, [v.contract_id])).get(v.contract_id)?.inst.find(x => x.id === +installment_id), r = await raw(db, 'installment', +installment_id);
    if (i) { out.inst_rem = i.rem; out.inst_name = i.name; }
    if (r?.is_maint) out.grp = 'phi_bao_tri';
  }
  if (loan_pay_id) { const l = await raw(db, 'loan_pay', +loan_pay_id); if (l) { out.lp_rem = Math.max(0, +l.amount - (+l.paid_amt || 0)); out.lp_name = l.kind === 'lai' ? 'Trả lãi kỳ ' + l.seq : 'Trả gốc'; } }
  return out;
}
// phiếu cũ (trước khi có các ô này): điền theo hợp đồng — chạy mỗi lần khởi động, chỉ dòng còn trống
async function fillVoucherInfo(db) {
  const set = `unit_id = c.unit_id, cust_code = k.code, cust_name = k.full_name, project_name = pr.name, ct_kind = c.kind`, from = `FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_customer k ON k.id = c.customer_id`;
  const a = await db.q(`UPDATE kd_receipt t SET ${set}, grp = coalesce(t.grp, CASE WHEN (SELECT i.is_maint FROM kd_installment i WHERE i.id = t.installment_id) THEN 'phi_bao_tri'
      WHEN c.kind = 'hdmb' THEN 'tien_can' WHEN c.kind IN ('thue', 'thue_mua') THEN 'tien_thue' WHEN c.kind = 'vay' THEN 'goc_vay' WHEN c.kind = 'hoan_thien' THEN 'hoan_thien' ELSE 'khac' END)
    ${from} WHERE c.id = t.contract_id AND t.cust_name IS NULL RETURNING t.id`);
  const b = await db.q(`UPDATE kd_payment t SET ${set} ${from} WHERE c.id = t.contract_id AND t.cust_name IS NULL RETURNING t.id`);
  return a.length + b.length;
}

H.receipt = {
  async beforeSave(r, old, { db }) {
    const c = await raw(db, 'contract', r.contract_id);
    await fillVoucher(db, r, true);
    if ((!old || old.contract_id !== r.contract_id) && c.status === 'huy') bad('Hợp đồng đã hủy');   // chỉ chặn khi lập mới / chuyển sang HĐ đã hủy — hủy phiếu cũ vẫn được
    if (r.installment_id) { const i = await raw(db, 'installment', r.installment_id); if (i.contract_id !== r.contract_id) bad('Khoản phải thu không thuộc hợp đồng này'); }
    r.voucher_no = r.voucher_no?.trim().toUpperCase();
    if (!old) { r.synced_at = r.synced_at || new Date().toISOString(); r.src = r.src || 'thu_cong'; }
    if (r.voucher_date > today()) bad('Ngày thu không được sau hôm nay');
  },
  async afterSave(r, old, { db, user }) { await refreshCommission(db, r.contract_id, user); await loanRebase(db, [r.contract_id, old?.contract_id]); },
  acts: { async void(r, d) { return { patch: { status: 'huy', void_reason: d.reason } }; } },
};

H.payment = {
  async beforeSave(r, old, { db }) {
    const c = await raw(db, 'contract', r.contract_id);
    await fillVoucher(db, r);
    if (!old || old.contract_id !== r.contract_id) { if (c.status === 'huy') bad('Hợp đồng đã hủy'); }
    if (r.voucher_date > today()) bad('Ngày chi không được sau hôm nay');
    if (r.voucher_no) r.voucher_no = r.voucher_no.trim().toUpperCase();
    if (!old) { r.src = r.src || 'thu_cong'; r.status = 'hop_le'; }
    const vay = ['tra_lai', 'tra_goc'].includes(r.kind), lk = r.kind === 'tra_lai' ? 'lai' : 'goc';
    if (vay && c.kind !== 'vay') bad('«Trả lãi / trả gốc» chỉ dùng cho HĐ vay');
    if (!vay && c.kind === 'vay' && r.kind !== 'khac') bad('HĐ vay: chọn «Trả lãi HĐ vay» hoặc «Trả gốc HĐ vay»');
    if (r.kind === 'hoan_coc' && !['thue', 'thue_mua'].includes(c.kind)) bad('«Hoàn tiền đặt cọc» chỉ dùng cho HĐ thuê');
    if (r.kind === 'thanh_ly' && c.kind !== 'hdmb') bad('«Thanh lý HĐMB» chỉ dùng cho hợp đồng mua bán');
    if (r.kind === 'hoan_coc' && c.deposit != null && r.amount > +c.deposit) bad(`Số hoàn cọc ${fmtMoney(r.amount)} lớn hơn tiền đặt cọc ${fmtMoney(c.deposit)}`);
    if (!vay) r.loan_pay_id = null;
    if (r.kind !== 'hoan_tien') r.refund_id = null;
    if (vay) {
      if (r.loan_pay_id) { const x = await raw(db, 'loan_pay', r.loan_pay_id); if (x.contract_id !== c.id) bad('Kỳ trả không thuộc hợp đồng này'); if (x.kind !== lk) bad(r.kind === 'tra_lai' ? 'Kỳ đã chọn là kỳ trả gốc' : 'Kỳ đã chọn là kỳ trả lãi'); }
      else r.loan_pay_id = (await db.one('SELECT id FROM kd_loan_pay WHERE contract_id = $1 AND kind = $2 AND coalesce(paid_amt, 0) < amount ORDER BY due_on, seq LIMIT 1', [c.id, lk]))?.id ?? null;
      if (!r.loan_pay_id && !(await db.one('SELECT 1 FROM kd_loan_pay WHERE contract_id = $1 AND kind = $2', [c.id, lk]))) bad(`HĐ vay chưa có lịch ${lk === 'lai' ? 'trả lãi' : 'trả gốc'} — mở HĐ vay, nhập ngày tính lãi / thời hạn / kỳ trả rồi lưu`);
    }
    if (r.kind === 'hoan_tien' && r.refund_id) {
      const f = await raw(db, 'refund', r.refund_id);
      if (f.contract_id !== c.id) bad('Đề xuất hoàn tiền không thuộc hợp đồng này');
      if (f.kind !== 'hoan_tien') bad('Đề xuất đã chọn không phải loại «Hoàn tiền»');
      if ((!old || old.refund_id !== r.refund_id) && f.status !== 'da_duyet') bad('Đề xuất hoàn tiền chưa được duyệt hoặc đã chi');
      if (r.amount > +f.amount) bad(`Số chi ${fmtMoney(r.amount)} lớn hơn số đề xuất ${fmtMoney(f.amount)}`);
    }
  },
  async afterSave(r, old, { db, user }) {
    await loanPaySync(db, [r.contract_id, old?.contract_id]);
    const ok = r.status === 'hop_le';
    if (old?.refund_id && (old.refund_id !== r.refund_id || !ok)) await sys(db, 'refund', old.refund_id, { status: 'da_duyet', done_voucher: null, done_on: null }, user, 'huy_phieu_chi', `Phiếu chi ${r.voucher_no} ${ok ? 'đổi đề xuất' : 'đã hủy'}`);
    if (r.refund_id && ok && (!old || old.refund_id !== r.refund_id)) await sys(db, 'refund', r.refund_id, { status: 'da_thuc_hien', done_voucher: r.voucher_no, done_on: r.voucher_date }, user, 'phieu_chi', `Phiếu chi ${r.voucher_no}`);
  },
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
      const today0 = r.promise_on === t;   // đúng ngày hẹn mà chưa thu đủ: «Đến hẹn hôm nay», chưa phải thất hẹn (rà soát 07/11/2026)
      const from = new Date(Date.parse(r.at) + 7 * 3600e3).toISOString().slice(0, 10);
      const got = (await db.one("SELECT coalesce(sum(amount),0) s FROM kd_receipt WHERE contract_id = $1 AND status = 'hop_le' AND voucher_date BETWEEN $2 AND $3", [r.contract_id, from, addDays(r.promise_on, 3)])).s;
      r.promise_st = got >= r.promise_amount ? 'Đúng hẹn' : today0 ? 'Đến hẹn hôm nay' : got > 0 ? `Thu một phần (${fmtMoney(got)})` : 'Thất hẹn';
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
// mẫu biểu: chưa chọn module thì suy theo loại mẫu (mẫu cũ trước 11/11/2026)
const TPL_ENT_SQL = `CASE WHEN kind = 'hop_dong' THEN 'contract' WHEN kind = 'phu_luc' THEN 'contract_change' WHEN kind = 'bien_ban' THEN 'handover'
  WHEN kind IN ('dang_ky_can', 'dang_ky_noi_that', 'de_nghi') THEN 'reservation' WHEN kind = 'bien_ban_giao_nhan' THEN 'noxh_check'
  WHEN kind = 'thong_bao' AND upper(code) LIKE 'TB-MOBAN%' THEN 'sale_notice' WHEN kind = 'thong_bao' THEN 'notice' WHEN kind = 'bao_cao' THEN 'report' END`;
const tplEntOf = (kind, code) => ({ hop_dong: 'contract', phu_luc: 'contract_change', bien_ban: 'handover', dang_ky_can: 'reservation', dang_ky_noi_that: 'reservation', de_nghi: 'reservation',
  bien_ban_giao_nhan: 'noxh_check', bao_cao: 'report', thong_bao: /^TB-MOBAN/i.test(code || '') ? 'sale_notice' : 'notice' })[kind] || null;
const fillTplEnt = db => db.q(`UPDATE kd_template SET ent = ${TPL_ENT_SQL} WHERE ent IS NULL`);
H.template = {
  async beforeSave(r) { if (!r.ent) r.ent = tplEntOf(r.kind, r.code); if (!r.ent) bad('Chọn module hiện mẫu', { fields: ['ent'] }); },
};
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
    WHERE hold_until < now() AND coalesce(deposit, 0) = 0 AND (reg_state = 'giu_cho' OR status = 'giu_cho') AND status IN ('nhap','cho_duyet','giu_cho','qua_han')
      AND NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.reservation_id = kd_reservation.id AND c.status NOT IN ('huy','thanh_ly')) RETURNING id, status, is_demo`);   // đã lập HĐ từ phiếu → không quá hạn
  for (const r of rows) await C.audit(db, 'reservation', r.id, 'qua_han_giu_cho', null, { reg_state: 'qua_han', status: r.status }, null, 'Qua hạn giữ chỗ', r.is_demo);
}
async function jobs(db) {
  const t0 = Date.now();
  await expireHolds(db);
  // chính sách bán hàng tới ngày bắt đầu (đã phát hành, chưa áp) → tự áp cho căn chưa bán
  for (const p of await db.q("SELECT * FROM kd_price_policy WHERE status = 'phat_hanh' AND rolled_at IS NULL AND start_on <= $1 AND end_on >= $1", [today()])) await safely(db, () => policyRoll(db, p, null), 'policyRoll');
  for (const c of await db.q(`SELECT c.* FROM kd_contract c WHERE c.status = 'da_ky' AND c.kind <> 'hoan_thien' AND EXISTS (SELECT 1 FROM kd_reservation s WHERE (s.id = c.reservation_id OR (c.reservation_id IS NULL AND s.unit_id = c.unit_id AND s.customer_id = c.customer_id))
      AND s.status IN ${ACTIVE_RES} AND (s.status <> 'chuyen_hd' OR (c.kind IN ('hdmb','thue_mua') AND (s.reg_state IS DISTINCT FROM 'ky_hdmb' OR s.progress IS DISTINCT FROM 'da_ky'))))`)) await safely(db, () => resFromContract(db, c, null), 'resFromContract ' + c.id);
  // HĐ thuê (cho thuê) hết hạn: phiếu đăng ký của HĐ đó hết hiệu lực → căn đăng ký mới được
  await db.q(`UPDATE kd_reservation s SET status = 'het_han', updated_at = now() FROM kd_contract c WHERE c.reservation_id = s.id AND s.status = 'chuyen_hd' AND c.kind = 'thue' AND coalesce(c.nature, 'thue') <> 'ban' AND c.status NOT IN ('huy','thanh_ly') AND c.exp_on < $1`, [today()]);
  // HĐ thuê hết hạn: căn trở lại trống (Còn bán / Chưa mở bán) — HĐ thuê vẫn giữ để theo dõi thu tiền / thanh lý
  for (const x of await db.q(`SELECT DISTINCT c.unit_id FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE c.kind = 'thue' AND coalesce(c.nature, 'thue') <> 'ban' AND c.status NOT IN ('huy','thanh_ly') AND c.exp_on < $1 AND u.status NOT IN ('con_ban','chua_mo_ban')`, [today()])) await recomputeUnit(db, x.unit_id, null);
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
  for (const r of await db.q("SELECT customer_id, status, sxd_result FROM kd_noxh_check WHERE status <> 'tu_choi'")) bump(r.customer_id, r.status === 'da_duyet' && r.sxd_result !== 'khong_duyet' ? 'sxd_duyet' : 'da_nop_hsmn');
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
    if (c.stage !== best.get(c.id) && await safely(db, async () => { await sys(db, 'customer', c.id, { stage: best.get(c.id) }, null, 'cap_nhat_trang_thai', 'Tự đồng bộ theo giao dịch'); return 1; }, 'syncStages ' + c.id)) n++;   // 1 khách lỗi không chặn cả danh sách
  return n;
}

module.exports = { saleTrack, policyUnits, resPolicy, bgSet, bgSuggest, fillTplEnt, tplEntOf, fixBaseDiscount, loanPayVouchers, loanPaySync, voucherPrefill, fillVoucherInfo, LIVE_CT, rentWord, loanPlan, loanSchedule, loanRebase, ckItem, saleCheck, nextContractNo, contractPrefill, syncStages, H, LEAD_CH, intakeLead, debtOf, PAY_ST, recomputeUnit, expireHolds, pricing, normSchedule, writeSchedule, syncContractValue, fixRentValue, fixLiquidated, contractPrice, cancelPrefill, refreshCommission, handoverCond, defaultList, noticeTargets, jobs };
