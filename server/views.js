// Các màn tổng hợp (không phải form): Dashboard + truy xuất chi tiết, cảnh báo, hộp phê duyệt, bảng hàng,
// hồ sơ 360°, sổ công nợ, căn đủ điều kiện bàn giao, lịch ký, kho hồ sơ, báo cáo quản trị, báo cáo tháng.
// Mọi số liệu có nguồn: «App» (dữ liệu nghiệp vụ) hoặc «Bravo» (chứng từ thu đã đồng bộ, kèm ngày chốt).
const C = require('./core');
const B = require('./biz');
const { E, MGR, PII_ROLES } = require('./meta');
const { today, addDays, dayDiff, fmtMoney, can, deny, bad } = C;

const STAFF_SCOPE = ['ban_hang', 'ho_so', 'cskh'];   // công nợ: xem mọi khách chậm trả (người đòi nợ ≠ người bán) — rà soát 07/11/2026
const mon = s => s ? String(s).slice(0, 7) : null;
const monthEnd = m => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
const monthsBetween = (a, b) => { const out = []; let [y, m] = a.split('-').map(Number); const [Y, M] = b.split('-').map(Number); while (y < Y || (y === Y && m <= M)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } if (out.length > 60) break; } return out; };
// điều kiện lọc căn theo dự án / tòa (alias u)
function uf(f, p, alias = 'u') {
  const w = [];
  for (const k of ['project', 'building']) if (f[k] && !/^\d+$/.test(f[k])) bad('Bộ lọc không hợp lệ');
  if (f.project) { p.push(+f.project); w.push(`${alias}.project_id = $${p.length}`); }
  if (f.building) { p.push(+f.building); w.push(`${alias}.building_id = $${p.length}`); }
  return w.length ? ' AND ' + w.join(' AND ') : '';
}
// hồ sơ NOXH chưa gắn căn vẫn thuộc dự án của hồ sơ
const nxw = w => w.replace('u.project_id =', 'coalesce(u.project_id, n.project_id) =');
// nhân viên chỉ xem của mình (bán hàng): chỉ danh sách mình phụ trách / tạo
const mine = (user, a) => C.own(user, E.customer) ? ` AND (${a}.owner_id = ${+user.id} OR ${a}.created_by = ${+user.id})` : '';
const period = f => {
  const t = today();
  const to = mon(f.to) || t.slice(0, 7), from = mon(f.from) || `${to.slice(0, 4)}-01`;
  if (from > to) bad('Kỳ «từ» sau kỳ «đến»');
  return { from, to, d1: from + '-01', d2: monthEnd(to) };
};
async function bravoSync(db) {
  const r = await db.one("SELECT max(synced_at) AS last, count(*) FILTER (WHERE src = 'bravo') AS n FROM kd_receipt");
  return r.last;
}
async function signedContracts(db, f, extra = '') {
  const p = [];
  const rows = await db.q(`SELECT c.*, u.code unit, u.project_id, u.building_id, k.full_name customer, k.phone, pr.code project, b.code building, own.full_name owner
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id
    LEFT JOIN kd_user own ON own.id = c.owner_id
    WHERE c.kind IN ('hdmb','vay','thue','thue_mua','hoan_thien') AND c.status NOT IN ('huy','thanh_ly') ${extra} ${uf(f, p)} ORDER BY u.code`, p);
  const D = await B.debtOf(db, rows.map(r => r.id));
  for (const r of rows) r.d = D.get(r.id);
  return rows;
}

// ======================= DASHBOARD =======================
async function dashboard(db, user, f) {
  const P = period(f), t = today(), m = t.slice(0, 7), p = [];
  const w = uf(f, p);
  const units = await db.q(`SELECT u.status, count(*) n FROM kd_unit u WHERE true ${w} GROUP BY 1`, p);
  const U = Object.fromEntries(units.map(r => [r.status, r.n])), uTotal = units.reduce((s, r) => s + r.n, 0);
  const opened = uTotal - (U.chua_mo_ban || 0) - (U.ngung_kd || 0);
  const sold = (U.da_ky_hd || 0) + (U.da_ban_giao || 0);
  const byB = await db.q(`SELECT pr.code project, b.id building_id, b.code building, count(*) total,
      count(*) FILTER (WHERE u.status = 'con_ban') con_ban, count(*) FILTER (WHERE u.status IN ('giu_cho','da_coc')) giu_cho,
      count(*) FILTER (WHERE u.status = 'da_ky_hd') da_ky, count(*) FILTER (WHERE u.status = 'da_ban_giao') da_ban_giao
    FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project pr ON pr.id = u.project_id WHERE true ${w} GROUP BY 1,2,3 ORDER BY 1,3`, p);
  byB.forEach(r => { r.rate = r.total ? Math.round((r.da_ky + r.da_ban_giao) / r.total * 1000) / 10 : 0; });

  const cs = await signedContracts(db, f);
  const signed = cs.filter(c => c.status === 'da_ky');
  const inP = signed.filter(c => c.signed_on >= P.d1 && c.signed_on <= P.d2 && c.kind !== 'hoan_thien');
  const debt = signed.reduce((a, c) => { a.total += c.d.total; a.paid += c.d.paid; a.left += c.d.left; a.due += c.d.due; a.overdue += c.d.overdue; a.due7 += c.d.due7; if (c.d.overdue > 0) a.late++; return a; }, { total: 0, paid: 0, left: 0, due: 0, overdue: 0, due7: 0, late: 0 });

  const p2 = [P.d1, P.d2]; const w2 = uf(f, p2);
  const rc = await db.q(`SELECT to_char(r.voucher_date,'YYYY-MM') m, sum(r.amount) s FROM kd_receipt r JOIN kd_contract c ON c.id = r.contract_id JOIN kd_unit u ON u.id = c.unit_id
    WHERE r.status = 'hop_le' AND r.voucher_date BETWEEN $1 AND $2 ${w2} GROUP BY 1`, p2);
  const p3 = [P.from, P.to]; const w3 = uf(f, p3);
  const pl = await db.q(`SELECT cp.month m, sum(cp.expected) s FROM kd_collect_plan cp JOIN kd_unit u ON u.id = cp.unit_id WHERE cp.status = 'da_duyet' AND cp.month BETWEEN $1 AND $2 ${w3} GROUP BY 1`, p3);
  const p4 = [P.from, P.to]; if (f.project) p4.push(+f.project);
  const tg = await db.q(`SELECT period m, sum(target_sales) ts, sum(target_collect) tc, sum(target_units) tu FROM kd_target WHERE user_id IS NULL AND period BETWEEN $1 AND $2 ${f.project ? 'AND project_id = $3' : ''} GROUP BY 1`, p4);
  const series = monthsBetween(P.from, P.to).map(mm => ({
    m: mm,
    signed: inP.filter(c => c.signed_on.slice(0, 7) === mm).reduce((s, c) => s + c.value, 0),
    units: inP.filter(c => c.signed_on.slice(0, 7) === mm).length,
    actual: rc.find(x => x.m === mm)?.s || 0, plan: pl.find(x => x.m === mm)?.s || 0,
    target_sales: tg.find(x => x.m === mm)?.ts || 0, target_collect: tg.find(x => x.m === mm)?.tc || 0, target_units: tg.find(x => x.m === mm)?.tu || 0,
  }));
  const sum = k => series.reduce((s, x) => s + x[k], 0);
  // «tháng này» luôn theo tháng hiện tại, không phụ thuộc kỳ đang chọn
  const pn = [m]; const wn = uf(f, pn);
  const cur = {
    plan: +(await db.one(`SELECT coalesce(sum(cp.expected), 0) s FROM kd_collect_plan cp JOIN kd_unit u ON u.id = cp.unit_id WHERE cp.status = 'da_duyet' AND cp.month = $1 ${wn}`, pn)).s,
    actual: +(await db.one(`SELECT coalesce(sum(r.amount), 0) s FROM kd_receipt r JOIN kd_contract c ON c.id = r.contract_id JOIN kd_unit u ON u.id = c.unit_id WHERE r.status = 'hop_le' AND to_char(r.voucher_date, 'YYYY-MM') = $1 ${wn}`, pn)).s,
  };

  const cnt = async (sql, pp = []) => Object.fromEntries((await db.q(sql, pp)).map(r => [r.status, r.n]));
  const p5 = []; const w5 = uf(f, p5);
  const nx = await cnt(`SELECT n.status, count(*) n FROM kd_noxh_check n LEFT JOIN kd_unit u ON u.id = n.unit_id WHERE true ${nxw(w5)} GROUP BY 1`, p5);
  const p6 = []; const w6 = uf(f, p6);
  const ct = await cnt(`SELECT c.status, count(*) n FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE c.kind <> 'hoan_thien' ${w6} GROUP BY 1`, p6);
  const p7 = []; const w7 = uf(f, p7);
  const hv = await cnt(`SELECT h.status, count(*) n FROM kd_handover h JOIN kd_unit u ON u.id = h.unit_id WHERE true ${w7} GROUP BY 1`, p7);
  const ready = (await readyList(db, f)).filter(noPlan).length;

  const al = await alerts(db, user, { all: true, ...f });
  const alertCats = Object.values(al.reduce((a, x) => { (a[x.cat] ||= { cat: x.cat, label: ALERT_CAT[x.cat], n: 0, red: 0 }).n++; if (x.lvl === 'r') a[x.cat].red++; return a; }, {}));
  return {
    period: P, updated_at: new Date().toISOString(), bravo_sync: await bravoSync(db),
    kpi: {
      revenue: sum('signed'), revenue_target: sum('target_sales'), units_sold_period: inP.length, units_target: sum('target_units'),
      collected: sum('actual'), collect_target: sum('target_collect'), collect_plan: sum('plan'),
      units_total: uTotal, units_opened: opened, units_sold: sold, units_left: U.con_ban || 0, units_hold: (U.giu_cho || 0) + (U.da_coc || 0), units_handed: U.da_ban_giao || 0,
      absorption: opened ? Math.round(sold / opened * 1000) / 10 : 0,
      debt_total: debt.total, debt_paid: debt.paid, debt_left: debt.left, debt_due: debt.due, debt_overdue: debt.overdue, debt_due7: debt.due7, late_customers: debt.late,
      month_plan: cur.plan, month_actual: cur.actual,
      backlog: al.length, backlog_red: al.filter(x => x.lvl === 'r').length,
    },
    units: U, byBuilding: byB, series,
    progress: {
      noxh_open: (nx.nhap || 0) + (nx.tu_choi || 0), noxh_review: nx.cho_duyet || 0, noxh_ok: nx.da_duyet || 0,
      ct_draft: (ct.du_thao || 0) + (ct.tu_choi || 0), ct_review: ct.cho_duyet || 0, ct_wait: ct.cho_ky || 0, ct_signed: ct.da_ky || 0,
      ho_ready: ready, ho_invited: (hv.da_moi || 0) + (hv.da_hen || 0), ho_done: (hv.da_ban_giao || 0) + (hv.hoan_tat || 0), ho_closed: hv.hoan_tat || 0,
      ho_not: signed.filter(c => c.kind !== 'hoan_thien').length - (hv.da_ban_giao || 0) - (hv.hoan_tat || 0),
    },
    alerts: alertCats,
  };
}

// truy xuất chi tiết từ một chỉ tiêu Dashboard → danh sách đến từng căn / khách / chứng từ
const COLS = {
  unit: [['unit', 'Mã căn'], ['building', 'Tòa'], ['kind', 'Loại'], ['area', 'DT (m²)', 'num'], ['price', 'Tổng giá', 'money'], ['status_l', 'Trạng thái'], ['customer', 'Khách hàng']],
  debt: [['project', 'Dự án'], ['building', 'Tòa'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['number', 'Số HĐ'], ['total', 'Phải thu', 'money'], ['paid', 'Đã thu', 'money'], ['left', 'Còn phải thu', 'money'], ['due', 'Đến hạn', 'money'], ['overdue', 'Quá hạn', 'money'], ['overdue_days', 'Số ngày quá hạn', 'int'], ['owner', 'Phụ trách']],
};
const shortName = s => { const w = String(s || '').trim().split(/\s+/); return w.map((x, i) => i < w.length - 1 ? x[0] + '.' : x).join(' '); };
async function drill(db, user, key, f) {
  const d = await drillRows(db, user, key, f);
  if (C.own(user, E.customer)) for (const r of d?.rows || []) { if (r.customer) r.customer = shortName(r.customer); delete r.phone; }
  return d;
}
async function drillRows(db, user, key, f) {
  const P = period(f), [k, arg] = key.split(':');
  const unitRows = async (cond, pp = []) => {
    const p = [...pp];
    const rows = await db.q(`SELECT u.id unit_id, u.code unit, b.code building, u.kind, u.area_tt area, u.total_price price, u.status,
      (SELECT k.full_name FROM kd_contract c JOIN kd_customer k ON k.id = c.customer_id WHERE c.unit_id = u.id AND c.status NOT IN ('huy','thanh_ly') AND c.kind <> 'hoan_thien' LIMIT 1) AS c1,
      (SELECT k.full_name FROM kd_reservation r JOIN kd_customer k ON k.id = r.customer_id WHERE r.unit_id = u.id AND r.status IN ('cho_duyet','giu_cho','qua_han','da_coc') LIMIT 1) AS c2
      FROM kd_unit u JOIN kd_building b ON b.id = u.building_id WHERE ${cond} ${uf(f, p)} ORDER BY u.code`, p);
    const st = Object.fromEntries(C.F.unit.status.o.map(o => [o[0], o[1]]));
    rows.forEach(r => { r.status_l = st[r.status]; r.customer = r.c1 || r.c2 || ''; });
    return rows;
  };
  const debtRows = (list, val) => list.map(c => ({ contract_id: c.id, unit_id: c.unit_id, project: c.project, building: c.building, unit: c.unit, customer: c.customer, number: c.number, total: c.d.total, paid: c.d.paid, left: c.d.left, due: c.d.due, overdue: c.d.overdue, overdue_days: c.d.overdue_days, owner: c.owner, _v: val ? val(c) : 0 }));
  switch (k) {
    case 'units': return { title: arg === 'all' ? 'Toàn bộ sản phẩm' : arg === 'sold' ? 'Căn đã bán (đã ký HĐ / bàn giao)' : arg === 'hold' ? 'Căn đang giữ chỗ / đặt cọc' : 'Căn: ' + (C.F.unit.status.o.find(o => o[0] === arg)?.[1] || arg), cols: COLS.unit,
      rows: await unitRows(arg === 'all' ? 'true' : arg === 'sold' ? "u.status IN ('da_ky_hd','da_ban_giao')" : arg === 'hold' ? "u.status IN ('giu_cho','da_coc')" : 'u.status = $1', ['all', 'sold', 'hold'].includes(arg) ? [] : [arg]) };
    case 'building': { f = { ...f, building: arg }; return { title: 'Sản phẩm theo tòa', cols: COLS.unit, rows: await unitRows('true') }; }
    case 'revenue': {
      const cs = (await signedContracts(db, f, "AND c.status = 'da_ky' AND c.kind <> 'hoan_thien'")).filter(c => c.signed_on >= P.d1 && c.signed_on <= P.d2 && (!arg || c.signed_on.slice(0, 7) === arg));
      return { title: `Hợp đồng ký ${arg ? 'tháng ' + arg : `${P.from} → ${P.to}`}`, cols: [['signed_on', 'Ngày ký', 'date'], ['number', 'Số HĐ'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['value', 'Giá trị', 'money'], ['owner', 'Nhân viên']],
        rows: cs.map(c => ({ contract_id: c.id, unit_id: c.unit_id, signed_on: c.signed_on, number: c.number, unit: c.unit, customer: c.customer, value: c.value, owner: c.owner })), sum: ['value'] };
    }
    case 'collected': {
      const p = [P.d1, P.d2]; const w = uf(f, p);
      const rows = await db.q(`SELECT r.voucher_no, r.voucher_date, r.amount, r.content, r.src, u.code unit, u.id unit_id, k.full_name customer, c.number, c.id contract_id
        FROM kd_receipt r JOIN kd_contract c ON c.id = r.contract_id JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id
        WHERE r.status = 'hop_le' AND r.voucher_date BETWEEN $1 AND $2 ${w} ${arg ? `AND to_char(r.voucher_date,'YYYY-MM') = '${arg.replace(/[^\d-]/g, '')}'` : ''} ORDER BY r.voucher_date DESC`, p);
      return { title: `Thực thu (chứng từ Bravo) ${arg || `${P.from} → ${P.to}`}`, cols: [['voucher_date', 'Ngày thu', 'date'], ['voucher_no', 'Chứng từ'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['number', 'Số HĐ'], ['amount', 'Số tiền', 'money'], ['content', 'Nội dung']], rows, sum: ['amount'], src: 'Bravo' };
    }
    case 'debt': {
      const cs = await signedContracts(db, f, "AND c.status = 'da_ky'");
      const pick = { left: c => c.d.left > 0, due: c => c.d.due > 0, overdue: c => c.d.overdue > 0, due7: c => c.d.due7 > 0, total: () => true, paid: c => c.d.paid > 0 }[arg] || (() => true);
      const rows = debtRows(cs.filter(pick)).sort((a, b) => b.overdue - a.overdue || b.left - a.left);
      return { title: { left: 'Công nợ còn phải thu', due: 'Nợ đến hạn chưa thu', overdue: 'Khách hàng chậm thanh toán (quá hạn)', due7: 'Kỳ thu đến hạn trong 7 ngày', total: 'Tổng phải thu theo hợp đồng', paid: 'Đã thu theo hợp đồng' }[arg] || 'Công nợ', cols: COLS.debt, rows, sum: ['total', 'paid', 'left', 'due', 'overdue'] };
    }
    case 'plan': {
      const mm = arg || today().slice(0, 7), p = [mm]; const w = uf(f, p);
      const rows = await db.q(`SELECT cp.id, cp.contract_id, cp.unit_id, u.code unit, b.code building, k.full_name customer, cp.debt_left, cp.expected, cp.expected_on, cp.basis, cp.ability, cp.status, own.full_name owner,
        coalesce((SELECT sum(amount) FROM kd_receipt r WHERE r.contract_id = cp.contract_id AND r.status='hop_le' AND to_char(r.voucher_date,'YYYY-MM') = cp.month),0) actual
        FROM kd_collect_plan cp JOIN kd_unit u ON u.id = cp.unit_id JOIN kd_building b ON b.id = u.building_id JOIN kd_customer k ON k.id = cp.customer_id LEFT JOIN kd_user own ON own.id = cp.owner_id
        WHERE cp.month = $1 AND cp.status = 'da_duyet' ${w} ORDER BY cp.expected_on`, p);
      rows.forEach(r => { r.gap = r.actual - r.expected; r._ent = ['collect_plan', r.id]; });
      return { title: `Kế hoạch thu tháng ${mm} (bản đã duyệt) — dự kiến / thực thu / chênh lệch`, cols: [['building', 'Tòa'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['debt_left', 'Công nợ còn', 'money'], ['expected', 'Dự kiến thu', 'money'], ['expected_on', 'Ngày dự kiến', 'date'], ['actual', 'Thực thu', 'money'], ['gap', 'Chênh lệch', 'money'], ['owner', 'Phụ trách']], rows, sum: ['expected', 'actual', 'gap'] };
    }
    case 'contracts': {
      const p = [arg]; const w = uf(f, p);
      const rows = await db.q(`SELECT c.id, c.unit_id, c.number, u.code unit, k.full_name customer, c.value, c.plan_sign, c.sign_status, c.signed_on FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id WHERE c.status = ANY(string_to_array($1, ',')) AND c.kind <> 'hoan_thien' ${w} ORDER BY c.plan_sign NULLS LAST`, p);
      rows.forEach(r => { r._ent = ['contract', r.id]; r.sign_status = C.F.contract.sign_status.o.find(o => o[0] === r.sign_status)?.[1]; });
      return { title: 'Hợp đồng: ' + arg.split(',').map(s => C.F.contract.status.o.find(o => o[0] === s)?.[1]).join(', '), cols: [['number', 'Số HĐ'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['value', 'Giá trị', 'money'], ['plan_sign', 'Dự kiến ký', 'date'], ['sign_status', 'Lịch ký'], ['signed_on', 'Ngày ký', 'date']], rows, sum: ['value'] };
    }
    case 'noxh': {
      const p = [arg]; const w = uf(f, p);
      const rows = await db.q(`SELECT n.id, n.unit_id, u.code unit, k.full_name customer, n.result, n.supplement_due, n.status FROM kd_noxh_check n JOIN kd_customer k ON k.id = n.customer_id LEFT JOIN kd_unit u ON u.id = n.unit_id WHERE n.status = ANY(string_to_array($1, ',')) ${nxw(w)} ORDER BY n.id`, p);
      rows.forEach(r => { r._ent = ['noxh_check', r.id]; r.result = C.F.noxh_check.result.o.find(o => o[0] === r.result)?.[1]; });
      return { title: 'Hồ sơ NOXH', cols: [['unit', 'Căn'], ['customer', 'Khách hàng'], ['result', 'Kết quả kiểm tra'], ['supplement_due', 'Hạn bổ sung', 'date']], rows };
    }
    case 'handover': {
      if (arg === 'ready') { const rows = (await readyList(db, f)).filter(noPlan); return { title: 'Căn đủ điều kiện, chưa lập lịch bàn giao', cols: [['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['paid_pct', 'Đã thu (%)', 'num'], ['owner', 'Phụ trách']], rows }; }
      if (arg === 'not') { const cs = await signedContracts(db, f, "AND c.status='da_ky' AND c.kind <> 'hoan_thien' AND NOT EXISTS (SELECT 1 FROM kd_handover h WHERE h.unit_id = c.unit_id AND h.status IN ('da_ban_giao','hoan_tat'))"); return { title: 'Căn đã ký HĐ, chưa bàn giao', cols: [['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['paid_pct', 'Đã thu (%)', 'num'], ['owner', 'Phụ trách']], rows: cs.map(c => ({ unit_id: c.unit_id, unit: c.unit, customer: c.customer, paid_pct: c.d.paid_pct, owner: c.owner })) }; }
      const p = [arg]; const w = uf(f, p);
      const rows = await db.q(`SELECT h.id, h.unit_id, u.code unit, h.plan_at, h.actual_on, h.status FROM kd_handover h JOIN kd_unit u ON u.id = h.unit_id WHERE h.status = ANY(string_to_array($1, ',')) ${w} ORDER BY h.plan_at NULLS LAST`, p);
      rows.forEach(r => { r._ent = ['handover', r.id]; r.status = C.F.handover.status.o.find(o => o[0] === r.status)?.[1]; });
      return { title: 'Bàn giao', cols: [['unit', 'Mã căn'], ['plan_at', 'Lịch hẹn', 'dt'], ['actual_on', 'Ngày bàn giao', 'date'], ['status', 'Trạng thái']], rows };
    }
    case 'alerts': {
      const rows = (await alerts(db, user, { all: true, ...f })).filter(a => !arg || a.cat === arg).map(a => ({ ...a, cat_l: ALERT_CAT[a.cat], _ent: a.ent ? [a.ent, a.id] : null }));
      return { title: arg ? ALERT_CAT[arg] : 'Cảnh báo tồn đọng', cols: [['cat_l', 'Nhóm'], ['text', 'Nội dung'], ['due', 'Hạn', 'date'], ['who', 'Phụ trách']], rows };
    }
  }
  bad('Chỉ tiêu không hợp lệ');
}

// ======================= CẢNH BÁO / NHẮC VIỆC =======================
const ALERT_CAT = {
  phe_duyet: 'Chờ tôi phê duyệt', giu_cho: 'Giữ chỗ quá hạn / sắp hết hạn', noxh: 'Hồ sơ NOXH quá hạn bổ sung', ky_hd: 'Hợp đồng chưa ký đúng hẹn',
  no_qua_han: 'Khách hàng chậm thanh toán', den_han: 'Kỳ thu đến hạn ≤ 7 ngày', cam_ket: 'Cam kết thanh toán đến hẹn / thất hẹn', lien_he: 'Lịch liên hệ lại',
  ban_giao: 'Căn chưa bàn giao', ton_tai: 'Tồn tại quá hạn khắc phục', so_hong: 'Hồ sơ cấp sổ tồn đọng', cskh: 'Phản ánh, khiếu nại chưa giải quyết', ke_hoach: 'Kế hoạch thu chưa lập / chưa duyệt',
  chi_tra: 'Đến hạn chi trả thanh lý (báo trước 30 ngày)',
};
async function alerts(db, user, f = {}) {
  const t = today(), out = [];
  const mineOnly = !f.all && STAFF_SCOPE.includes(user.role);
  const me = user.id;
  // mục có truyền người phụ trách (kể cả trống) → chỉ hiện cho đúng người đó khi xem «của tôi»
  const push = (...a) => { const [cat, lvl, text, ent, id, due, who, unit_id] = a; if (mineOnly && a.length > 8 && a[8] !== me) return; out.push({ cat, lvl, text, ent, id, due, who, unit_id }); };
  const p = []; const w = uf(f, p);
  for (const a of await approvalsFor(db, user)) push('phe_duyet', 'a', a.title, a.ent, a.rec_id, String(a.requested_at).slice(0, 10), a.requested_by_l);
  for (const r of await db.q(`SELECT r.id, r.code, r.status, r.hold_until, r.owner_id, u.code unit, u.id unit_id, k.full_name, own.full_name who FROM kd_reservation r JOIN kd_unit u ON u.id = r.unit_id JOIN kd_customer k ON k.id = r.customer_id LEFT JOIN kd_user own ON own.id = r.owner_id
    WHERE (r.status = 'qua_han' OR (r.status IN ('giu_cho','da_coc') AND r.hold_until < now() + interval '24 hours')) ${w}`, p))
    push('giu_cho', r.status === 'qua_han' ? 'r' : 'a', `${r.unit} · ${r.full_name} — ${r.status === 'qua_han' ? 'đã quá hạn giữ chỗ, cần gia hạn / giải phóng / lập HĐ' : 'hết hạn giữ chỗ trong 24h'}`, 'reservation', r.id, new Date(Date.parse(r.hold_until) + 7 * 3600e3).toISOString().slice(0, 10), r.who, r.unit_id, r.owner_id);
  // hủy giao dịch / thanh lý: chưa chi tiền mà ngày dự kiến chi trả còn ≤ 30 ngày hoặc đã qua
  for (const r of await db.q(`SELECT t.id, t.code, t.pay_due, t.pay_amount, u.code unit, u.id unit_id, coalesce(k.full_name, rs.cust_name) full_name, own.full_name who, t.created_by
    FROM kd_cancel_req t LEFT JOIN kd_reservation rs ON rs.id = t.reservation_id LEFT JOIN kd_contract c ON c.id = t.contract_id LEFT JOIN kd_unit u ON u.id = coalesce(c.unit_id, rs.unit_id)
    LEFT JOIN kd_customer k ON k.id = coalesce(c.customer_id, rs.customer_id) LEFT JOIN kd_user own ON own.id = t.created_by
    WHERE t.status <> 'tu_choi' AND coalesce(t.pay_status, 'chua_chi') IN ('chua_chi','mot_phan') AND t.pay_due <= $${p.length + 1}::date + 30 ${w}`, [...p, t])) {
    const late = r.pay_due < t;
    push('chi_tra', late ? 'r' : r.pay_due <= addDays(t, 7) ? 'a' : 'b', `${r.unit || ''} · ${r.full_name || ''} — ${late ? 'quá hạn chi trả' : 'đến hạn chi trả'} ${r.pay_amount ? fmtMoney(r.pay_amount) + 'đ ' : ''}ngày ${C.dmy(r.pay_due)} (${r.code})`, 'cancel_req', r.id, r.pay_due, r.who, r.unit_id, r.created_by);
  }
  for (const r of await db.q(`SELECT n.id, n.supplement_due, n.owner_id, u.code unit, u.id unit_id, k.full_name, own.full_name who FROM kd_noxh_check n JOIN kd_customer k ON k.id = n.customer_id LEFT JOIN kd_unit u ON u.id = n.unit_id LEFT JOIN kd_user own ON own.id = n.owner_id
    WHERE n.status IN ('nhap','tu_choi') AND n.result = 'can_bo_sung' AND n.supplement_due <= $${p.length + 1}::date + 3 ${w}`, [...p, t]))
    push('noxh', r.supplement_due < t ? 'r' : 'a', `${r.unit || ''} · ${r.full_name} — hồ sơ NOXH cần bổ sung, hạn ${C.dmy(r.supplement_due)}`, 'noxh_check', r.id, r.supplement_due, r.who, r.unit_id, r.owner_id);
  for (const r of await db.q(`SELECT c.id, c.number, c.plan_sign, c.owner_id, c.status, u.code unit, u.id unit_id, k.full_name, own.full_name who FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id LEFT JOIN kd_user own ON own.id = c.owner_id
    WHERE c.status IN ('du_thao','cho_duyet','cho_ky','tu_choi') AND c.plan_sign <= $${p.length + 1}::date + 3 ${w}`, [...p, t]))
    push('ky_hd', r.plan_sign < t ? 'r' : 'a', `${r.number} · ${r.unit} · ${r.full_name} — ${r.plan_sign < t ? 'quá ngày dự kiến ký' : 'sắp đến lịch ký'} ${C.dmy(r.plan_sign)}`, 'contract', r.id, r.plan_sign, r.who, r.unit_id, r.owner_id);
  const cs = await signedContracts(db, f, "AND c.status = 'da_ky'"), DK = (await debtCfg(db)).days;
  for (const c of cs) {
    if (c.d.overdue > 0) push('no_qua_han', c.d.overdue_days > DK[0] ? 'r' : 'a', `${c.unit} · ${c.customer} — quá hạn ${fmtMoney(c.d.overdue)}đ (${c.d.overdue_days} ngày)${c.d.overdue_days > DK[2] ? ' · NỢ KHÓ ĐÒI' : ''}`, 'contract', c.id, c.d.overdue_since, c.owner, c.unit_id, c.owner_id);
    else if (c.d.due7 > 0) push('den_han', 'b', `${c.unit} · ${c.customer} — ${c.d.next?.name || 'kỳ thu'} ${fmtMoney(c.d.due7)}đ đến hạn ${C.dmy(c.d.next?.due_on)}`, 'contract', c.id, c.d.next?.due_on, c.owner, c.unit_id, c.owner_id);
  }
  const calls = await db.q(`SELECT DISTINCT ON (d.contract_id) d.*, u.code unit, u.id unit_id, k.full_name, own.full_name who FROM kd_debt_call d JOIN kd_contract c ON c.id = d.contract_id JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id LEFT JOIN kd_user own ON own.id = d.owner_id
    WHERE (d.promise_on BETWEEN $${p.length + 1}::date - 10 AND $${p.length + 1}::date OR d.next_on <= $${p.length + 1}::date) AND c.status NOT IN ('thanh_ly', 'huy') ${w} ORDER BY d.contract_id, d.at DESC`, [...p, t]);   // 17/11/2026: HĐ đã thanh lý đóng công nợ — không nhắc
  await B.H.debt_call.decorate(calls, { db });
  for (const d of calls) {
    if (d.promise_on && d.promise_on <= t && d.promise_st === 'Thất hẹn') push('cam_ket', 'r', `${d.unit} · ${d.full_name} — thất hẹn cam kết ${fmtMoney(d.promise_amount)}đ ngày ${C.dmy(d.promise_on)}`, 'debt_call', d.id, d.promise_on, d.who, d.unit_id, d.owner_id);
    else if (d.promise_on === t) push('cam_ket', 'a', `${d.unit} · ${d.full_name} — hôm nay hẹn thanh toán ${fmtMoney(d.promise_amount)}đ`, 'debt_call', d.id, d.promise_on, d.who, d.unit_id, d.owner_id);
    else if (d.next_on && d.next_on <= t) push('lien_he', 'b', `${d.unit} · ${d.full_name} — đến lịch gọi nhắc nợ lại`, 'debt_call', d.id, d.next_on, d.who, d.unit_id, d.owner_id);
  }
  for (const l of await db.q(`SELECT DISTINCT ON (l.customer_id) l.id, l.next_at, l.owner_id, k.full_name, k.code, own.full_name who FROM kd_contact_log l JOIN kd_customer k ON k.id = l.customer_id LEFT JOIN kd_user own ON own.id = l.owner_id
    WHERE l.next_at <= $1 AND l.next_at >= $1::date - 14 AND NOT EXISTS (SELECT 1 FROM kd_contact_log x WHERE x.customer_id = l.customer_id AND x.at::date >= l.next_at) ORDER BY l.customer_id, l.at DESC`, [t]))
    push('lien_he', 'b', `${l.full_name} — hẹn liên hệ lại ${C.dmy(l.next_at)}`, 'contact_log', l.id, l.next_at, l.who, null, l.owner_id);
  for (const r of (await readyList(db, f)).filter(r => r.eligible && !r.handover_id)) push('ban_giao', 'a', `${r.unit} · ${r.customer} — đủ điều kiện, chưa lập kế hoạch bàn giao`, null, null, null, r.owner, r.unit_id, r.owner_id);
  for (const h of await db.q(`SELECT h.id, h.plan_at, h.status, h.owner_id, u.code unit, u.id unit_id, own.full_name who FROM kd_handover h JOIN kd_unit u ON u.id = h.unit_id LEFT JOIN kd_user own ON own.id = h.owner_id
    WHERE ((h.status IN ('da_moi','da_hen') AND h.plan_at < now() + interval '3 days') OR (h.status = 'da_ban_giao' AND h.actual_on < $${p.length + 1}::date - 30)) ${w}`, [...p, t])) {
    const late = h.status === 'da_ban_giao' || Date.parse(h.plan_at) < Date.now();
    push('ban_giao', late ? 'r' : 'b', `${h.unit} — ${h.status === 'da_ban_giao' ? 'đã bàn giao trên 30 ngày, chưa hoàn tất tồn tại' : late ? 'đã qua lịch hẹn bàn giao, chưa ghi nhận kết quả' : 'lịch bàn giao ' + new Date(h.plan_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`, 'handover', h.id, null, h.who, h.unit_id, h.owner_id);
  }
  for (const d of await db.q(`SELECT d.id, d.due_on, d.category, d.contractor, u.code unit, u.id unit_id, d.created_by FROM kd_defect d JOIN kd_unit u ON u.id = d.unit_id WHERE d.status IN ('moi','dang_xu_ly') AND d.due_on < $${p.length + 1} ${w}`, [...p, t]))
    push('ton_tai', 'r', `${d.unit} — tồn tại quá hạn ${dayDiff(d.due_on, t)} ngày (${d.contractor})`, 'defect', d.id, d.due_on, d.contractor, d.unit_id);
  for (const s of await db.q(`SELECT s.id, s.status, s.supplement_due, s.appoint_on, s.owner_id, u.code unit, u.id unit_id, k.full_name, own.full_name who FROM kd_pinkbook s JOIN kd_unit u ON u.id = s.unit_id JOIN kd_customer k ON k.id = s.customer_id LEFT JOIN kd_user own ON own.id = s.owner_id
    WHERE ((s.status IN ('thieu','bo_sung') AND s.supplement_due < $${p.length + 1}) OR (s.status = 'da_nop' AND s.appoint_on < $${p.length + 1})) ${w}`, [...p, t]))
    push('so_hong', 'r', `${s.unit} · ${s.full_name} — ${s.status === 'da_nop' ? 'quá ngày hẹn trả kết quả ' + C.dmy(s.appoint_on) + ' (thời gian cơ quan)' : 'quá hạn bổ sung hồ sơ ' + C.dmy(s.supplement_due) + ' (thời gian nội bộ)'}`, 'pinkbook', s.id, s.status === 'da_nop' ? s.appoint_on : s.supplement_due, s.who, s.unit_id, s.owner_id);
  for (const k of await db.q(`SELECT t.id, t.code, t.due_at, t.kind, t.assignee_id, own.full_name who, u.code unit, u.id unit_id, c.full_name FROM kd_ticket t JOIN kd_customer c ON c.id = t.customer_id LEFT JOIN kd_unit u ON u.id = t.unit_id LEFT JOIN kd_user own ON own.id = t.assignee_id
    WHERE t.status NOT IN ('da_phan_hoi','da_dong') AND (t.due_at < now() + interval '12 hours' OR t.kind = 'khieu_nai') ${w.replace(/\bu\./g, 'u.')}`, p)) {
    const late = Date.parse(k.due_at) < Date.now();
    push('cskh', late ? 'r' : 'a', `${k.code} · ${k.full_name}${k.unit ? ' · ' + k.unit : ''} — ${late ? 'quá hạn phản hồi (SLA)' : k.kind === 'khieu_nai' ? 'khiếu nại đang xử lý' : 'sắp hết hạn phản hồi'}`, 'ticket', k.id, new Date(k.due_at).toISOString().slice(0, 10), k.who, k.unit_id, k.assignee_id);
  }
  if (['cong_no', 'truong_phong', 'admin'].includes(user.role) || f.all) {
    const next = addDays(t.slice(0, 7) + '-01', 32).slice(0, 7), m = t.slice(0, 7);
    for (const mm of [m, next]) {
      const st = await db.one("SELECT count(*) n, count(*) FILTER (WHERE status='da_duyet') ok, count(*) FILTER (WHERE status IN ('nhap','tu_choi')) draft FROM kd_collect_plan WHERE month = $1", [mm]);
      if (!st.n && (mm === m || t.slice(8) >= '20')) push('ke_hoach', mm === m ? 'r' : 'a', `Chưa lập kế hoạch thu tháng ${mm.split('-').reverse().join('/')}`, null, null, null, null);
      else if (st.draft) push('ke_hoach', 'a', `Kế hoạch thu tháng ${mm.split('-').reverse().join('/')}: ${st.draft} dòng chưa trình duyệt`, null, null, null, null);
    }
  }
  const order = { r: 0, a: 1, b: 2 };
  return out.sort((a, b) => order[a.lvl] - order[b.lvl] || String(a.due || '9').localeCompare(String(b.due || '9')));
}

// ======================= VIỆC CỦA TÔI (màn mở đầu, 06/11/2026) =======================
// việc cần làm = cảnh báo nhắc việc của người dùng (nhân viên: việc mình phụ trách; trưởng phòng / lãnh đạo: toàn phòng) + lịch ký 7 ngày tới
async function myDay(db, user) {
  const t = today(), t7 = addDays(t, 7);
  const al = await alerts(db, user, {});
  const sg = (await signing(db, user, {})).rows.filter(r => r.plan_sign && r.plan_sign >= t && r.plan_sign <= t7)
    .map(r => ({ ent: r.ent || 'contract', id: r.id, number: r.number, plan_sign: r.plan_sign, sign_place: r.sign_place, unit: r.unit, customer: r.customer, project: r.project, owner: r.owner, kind_l: r.kind_l }))
    .sort((a, b) => String(a.plan_sign).localeCompare(String(b.plan_sign)));
  return { today: t, alerts: al, signing: sg, approvals: al.filter(a => a.cat === 'phe_duyet').length };
}

// ======================= PHÊ DUYỆT =======================
async function approvalsFor(db, user) {
  return db.q(`SELECT a.*, r.full_name requested_by_l FROM kd_approval a LEFT JOIN kd_user r ON r.id = a.requested_by
    WHERE a.status = 'cho_duyet' AND (a.requested_by IS DISTINCT FROM $1 OR $2 = 'admin' OR (a.ent = 'contract' AND $3)) AND (CASE WHEN a.approver_id IS NOT NULL THEN a.approver_id = $1 OR $2 = 'admin' ELSE $2 = ANY(a.roles) OR $2 = 'admin' OR (a.ent = 'contract' AND $3) END)
    ORDER BY a.requested_at`, [user.id, user.role, !!user.ct_approve]);   // 16/11/2026: người được duyệt hợp đồng
}
async function approvals(db, user) {
  const mine = await db.q(`SELECT a.*, d.full_name decided_by_l FROM kd_approval a LEFT JOIN kd_user d ON d.id = a.decided_by WHERE a.requested_by = $1 ORDER BY a.requested_at DESC LIMIT 100`, [user.id]);
  const done = await db.q(`SELECT a.*, r.full_name requested_by_l FROM kd_approval a LEFT JOIN kd_user r ON r.id = a.requested_by WHERE a.decided_by = $1 ORDER BY a.decided_at DESC LIMIT 100`, [user.id]);
  return { pending: await approvalsFor(db, user), mine, done };
}

// ======================= BẢNG HÀNG =======================
async function board(db, user, f) {
  const projects = await db.q("SELECT p.id, p.code, p.name, p.kind, (SELECT count(*) FROM kd_unit u WHERE u.project_id = p.id) n FROM kd_project p ORDER BY n DESC, p.code");
  const pid = +f.project || projects.find(p => p.n)?.id; if (!pid) return { projects, buildings: [], units: [] };
  const buildings = await db.q('SELECT b.*, (SELECT count(*) FROM kd_unit u WHERE u.building_id = b.id) n FROM kd_building b WHERE b.project_id = $1 ORDER BY b.code', [pid]);
  const bid = +f.building || buildings.find(b => b.n)?.id;
  const units = bid ? await db.q(`SELECT u.id, u.code, u.floor, u.kind, u.bedrooms, u.area_tt, u.direction, u.position, u.total_price, u.price_net, u.maint_fee, u.finish_value, u.status, u.handover_plan,
      coalesce((SELECT k.full_name FROM kd_contract c JOIN kd_customer k ON k.id = c.customer_id WHERE c.unit_id = u.id AND c.status NOT IN ('huy','thanh_ly') AND c.kind <> 'hoan_thien' AND NOT (c.kind = 'thue' AND coalesce(c.nature, 'thue') <> 'ban' AND coalesce(c.exp_on, 'infinity'::date) < $2) ORDER BY c.id DESC LIMIT 1),   -- HĐ thuê hết hạn: không hiện tên người thuê cũ
               (SELECT k.full_name FROM kd_reservation r JOIN kd_customer k ON k.id = r.customer_id WHERE r.unit_id = u.id AND r.status IN ('cho_duyet','giu_cho','qua_han','da_coc','chuyen_hd') LIMIT 1)) customer,
      (SELECT r.hold_until FROM kd_reservation r WHERE r.unit_id = u.id AND r.status IN ('giu_cho','qua_han','da_coc') LIMIT 1) hold_until,
      EXISTS (SELECT 1 FROM kd_contract c WHERE c.unit_id = u.id AND c.kind = 'thue' AND coalesce(c.nature, 'thue') <> 'ban' AND c.status NOT IN ('huy','thanh_ly') AND coalesce(c.exp_on, 'infinity'::date) >= $2) rent,   -- căn đang cho thuê (còn thời hạn)
      (SELECT c.exp_on FROM kd_contract c WHERE c.unit_id = u.id AND c.kind = 'thue' AND coalesce(c.nature, 'thue') <> 'ban' AND c.status NOT IN ('huy','thanh_ly') AND coalesce(c.exp_on, 'infinity'::date) >= $2 ORDER BY c.id DESC LIMIT 1) rent_to,
      (SELECT c.rent FROM kd_contract c WHERE c.unit_id = u.id AND c.kind = 'thue' AND coalesce(c.nature, 'thue') <> 'ban' AND c.status NOT IN ('huy','thanh_ly') AND coalesce(c.exp_on, 'infinity'::date) >= $2 ORDER BY c.id DESC LIMIT 1) rent_amt,
      (SELECT max(c.exp_on) FROM kd_contract c WHERE c.unit_id = u.id AND c.kind = 'thue' AND coalesce(c.nature, 'thue') <> 'ban' AND c.status NOT IN ('huy','thanh_ly') AND c.exp_on < $2) rent_ended,
      (SELECT c.kind FROM kd_contract c WHERE c.unit_id = u.id AND c.kind IN ('vay','thue') AND c.nature = 'ban' AND c.next_id IS NULL AND c.status NOT IN ('huy','thanh_ly') ORDER BY c.id DESC LIMIT 1) sale_doc,   -- bán qua HĐ vay / HĐ thuê, chưa có HĐMB   -- đã hết hạn thuê: căn trống lại
      (SELECT r.rent FROM kd_reservation r WHERE r.unit_id = u.id AND r.deal = 'thue' AND r.status IN ('cho_duyet','giu_cho','qua_han','da_coc') LIMIT 1) res_rent,   -- căn giữ chỗ theo phiếu đăng ký thuê: tiền thuê/tháng dự kiến
      u.status = 'con_ban' AND EXISTS (SELECT 1 FROM kd_reservation r WHERE r.unit_id = u.id AND r.status IN ('huy','het_han')) cancelled   -- căn trả lại sau khi hủy đăng ký
    FROM kd_unit u WHERE u.building_id = $1 ORDER BY u.floor DESC, u.code`, [bid, today()]) : [];
  // khách hàng: chỉ người có quyền xem khách mới thấy tên
  if (!can(user, E.customer, 'r')) units.forEach(u => { u.customer = u.customer ? '•••' : null; });
  const policy = await db.one("SELECT code, version, start_on, end_on, src_file FROM kd_price_policy WHERE $1 = ANY(project_ids) AND status = 'phat_hanh' AND start_on <= $2 AND end_on >= $2 ORDER BY start_on DESC LIMIT 1", [pid, today()]);
  return { projects, project: pid, buildings, building: bid, units, policy };
}

// ======================= TÌNH TRẠNG CĂN HỘ & CÔNG NỢ (CN-06) =======================
// tình trạng theo BẢN CHẤT giao dịch, không theo loại văn bản: căn bán qua HĐ vay / HĐ thuê (bản chất bán) vẫn là «đã bán»;
// công nợ tách theo từng hợp đồng — tiền vay / tiền thuê không trừ vào giá mua
const US_ST = { da_ban: 'Đã bán (HĐMB)', cho_hdmb: 'Đã bán — chờ ký HĐMB', dang_lap: 'Đang lập hợp đồng', cho_thue: 'Đang cho thuê', giu_cho: 'Giữ chỗ', trong: 'Còn trống', chua_mo_ban: 'Chưa mở bán' };
async function unitStatus(db, user, f = {}) {
  if (!can(user, E.installment, 'r')) deny();
  const p = [], t = today();
  const units = await db.q(`SELECT u.id, u.code, u.status, u.activated, pr.code project, b.code building FROM kd_unit u JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id WHERE true ${uf(f, p)} ORDER BY pr.code, b.code, u.floor DESC, u.code`, p);
  const ids = units.map(u => u.id);
  const cs = await db.q(`SELECT c.id, c.unit_id, c.kind, c.nature, c.number, c.status, c.value, c.sale_price, c.plan_hdmb, c.prev_id, c.next_id, c.rent, c.exp_on, c.owner_id, c.created_by, k.full_name customer
    FROM kd_contract c JOIN kd_customer k ON k.id = c.customer_id WHERE c.unit_id = ANY($1) AND c.status NOT IN ('huy','thanh_ly') ORDER BY c.id`, [ids]);
  const res = new Map((await db.q("SELECT DISTINCT ON (r.unit_id) r.unit_id, r.cust_name, r.deal, r.owner_id, r.created_by FROM kd_reservation r WHERE r.unit_id = ANY($1) AND r.status IN ('cho_duyet','giu_cho','qua_han','da_coc') ORDER BY r.unit_id, r.id DESC", [ids])).map(r => [r.unit_id, r]));
  if (C.own(user, E.customer)) { const me = +user.id; for (const c of cs) if (c.owner_id !== me && c.created_by !== me) c.customer = '•••'; for (const x of res.values()) if (x.owner_id !== me && x.created_by !== me) x.cust_name = '•••'; }   // bán hàng: tên khách người khác che
  const D = await B.debtOf(db, cs.map(c => c.id)), byU = new Map();
  const LI = new Map((await db.q("SELECT contract_id, sum(greatest(amount - coalesce(paid_amt, 0), 0)) s FROM kd_loan_pay WHERE kind = 'lai' AND contract_id = ANY($1) GROUP BY 1", [cs.map(c => c.id)])).map(x => [x.contract_id, +x.s]));
  for (const c of cs) { c.d = D.get(c.id); (byU.get(c.unit_id) || byU.set(c.unit_id, []).get(c.unit_id)).push(c); }
  const KL = { hdmb: 'HĐMB', vay: 'HĐ vay', thue: 'HĐ thuê', thue_mua: 'HĐ thuê mua', hoan_thien: 'HĐ hoàn thiện' };
  const rows = units.map(u => {
    const all = byU.get(u.id) || [];
    const sale = all.filter(c => c.kind !== 'hoan_thien' && (c.nature === 'ban' || ['hdmb', 'thue_mua'].includes(c.kind)) && !c.next_id).pop();
    const rent = all.filter(c => c.kind === 'thue' && c.nature !== 'ban' && (!c.exp_on || c.exp_on >= t)).pop(), fin = all.filter(c => c.kind === 'hoan_thien').pop();
    const chain = []; for (let c = sale; c; c = c.prev_id && all.find(x => x.id === c.prev_id)) chain.unshift(c);
    const hdmb = sale && ['hdmb', 'thue_mua'].includes(sale.kind) ? sale : null, pre = chain.filter(c => ['vay', 'thue'].includes(c.kind));
    const st = sale ? (sale.status === 'da_ky' ? (hdmb ? 'da_ban' : 'cho_hdmb') : chain.some(c => c.status === 'da_ky') ? 'cho_hdmb' : 'dang_lap') : rent ? (rent.status === 'da_ky' ? 'cho_thue' : 'dang_lap') : res.get(u.id) ? 'giu_cho' : u.activated ? 'trong' : 'chua_mo_ban';
    const sumOf = (xs, k) => xs.reduce((s, c) => s + (+c.d?.[k] || 0), 0);
    const vay = pre.filter(c => c.kind === 'vay'), thueBan = pre.filter(c => c.kind === 'thue');
    return { unit_id: u.id, contract_id: (sale || rent || fin)?.id || null, project: u.project, building: u.building, unit: u.code, state: st, state_l: US_ST[st],
      customer: (sale || rent || fin)?.customer || res.get(u.id)?.cust_name || '', docs: [...chain, ...(rent ? [rent] : []), ...(fin ? [fin] : [])].map(c => `${KL[c.kind]} ${c.number || ''}`.trim()).join(' → '),
      sale_price: hdmb ? +hdmb.value : sale ? +(sale.sale_price || 0) : null, plan_hdmb: !hdmb && sale ? sale.plan_hdmb : null,
      sale_paid: hdmb ? hdmb.d.paid : null, sale_left: hdmb ? hdmb.d.left : null, sale_overdue: hdmb ? hdmb.d.overdue : null,
      vay_left: vay.length ? sumOf(vay, 'left') : null, vay_int: vay.length ? vay.reduce((s, c) => s + (LI.get(c.id) || 0), 0) : null, rent_amt: rent ? +rent.rent : thueBan.length ? +thueBan[thueBan.length - 1].rent : null, rent_to: rent?.exp_on || null,
      rent_left: rent || thueBan.length ? sumOf([...(rent ? [rent] : []), ...thueBan], 'left') : null, fin_left: fin ? fin.d.left : null,
      overdue: sumOf([...(hdmb ? [hdmb] : []), ...pre, ...(rent ? [rent] : []), ...(fin ? [fin] : [])], 'overdue') };
  });
  return { rows, states: US_ST, bravo_sync: await bravoSync(db) };
}

// ======================= TÌNH TRẠNG CÔNG NỢ ĐẾN HẠN (CN-06, 07/11/2026) =======================
// Mỗi dòng 1 mã căn: phải thu đến hạn · đã thu · nợ quá hạn của mọi HĐ đã ký trên căn (HĐMB, hoàn thiện, thuê, gốc HĐ vay khách chưa chuyển).
// Nhóm nợ tự động theo số ngày quá hạn lâu nhất (mốc ngày chỉnh được); người dùng có quyền ghi nhắc nợ được chỉnh tay nhóm nợ từng căn (kèm lý do, giữ lịch sử).
// Lưu ở kd_setting key 'debt_class' (không thêm bảng → không phải migrate CSDL): { days: [30, 90, 180], units: { <unit_id>: { grp, reason, by, by_l, at } }, hist: { <unit_id>: [...] } }
const DG_DAYS = [30, 90, 180];
const DG_KEYS = ['n1', 'n2', 'n3', 'n4', 'n5'];
async function debtCfg(db) {
  const v = (await db.one("SELECT value FROM kd_setting WHERE key = 'debt_class'"))?.value || {};
  const ok = Array.isArray(v.days) && v.days.length === 3 && v.days.every((x, i) => Number.isInteger(x) && x > 0 && (!i || x > v.days[i - 1]));
  return { days: ok ? v.days : DG_DAYS, units: v.units || {}, hist: v.hist || {} };
}
const debtGrpOf = (od, days, D) => od <= 0 ? 'n1' : days <= D[0] ? 'n2' : days <= D[1] ? 'n3' : days <= D[2] ? 'n4' : 'n5';
const debtGrpL = D => ({ n1: 'Nhóm 1 · Trong hạn', n2: `Nhóm 2 · Quá hạn ≤ ${D[0]} ngày`, n3: `Nhóm 3 · Quá hạn ${D[0] + 1}–${D[1]} ngày`, n4: `Nhóm 4 · Quá hạn ${D[1] + 1}–${D[2]} ngày`, n5: `Nhóm 5 · Nợ khó đòi (> ${D[2]} ngày)` });
const canDebtClass = u => can(u, E.debt_call, 'c') || u.role === 'admin';
const monthAdd = (m, k) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5) - 1 + k, 1)); return d.toISOString().slice(0, 7); };

async function debtStatus(db, user, f = {}) {
  if (!can(user, E.installment, 'r')) deny();
  if (f.unit != null && f.unit !== '' && !/^\d+$/.test(String(f.unit))) bad('Bộ lọc không hợp lệ');
  const t = today(), m = t.slice(0, 7), t30 = addDays(t, 30), cfg = await debtCfg(db), D = cfg.days, GL = debtGrpL(D);
  const cs = await signedContracts(db, f, "AND c.status = 'da_ky'" + mine(user, 'c') + (f.unit ? ` AND c.unit_id = ${+f.unit}` : ''));   // unit: màn chi tiết 1 căn
  const ids = cs.map(c => c.id), vayIds = cs.filter(c => c.kind === 'vay').map(c => c.id);
  const KL = { hdmb: 'HĐMB', vay: 'HĐ vay', thue: 'HĐ thuê', thue_mua: 'HĐ thuê mua', hoan_thien: 'HĐ hoàn thiện' };
  // lãi / gốc công ty phải trả khách (HĐ vay) — để biết khách «cho công ty vay» thế nào và dòng chi dự kiến
  const LP = await db.q('SELECT contract_id, kind, due_on, amount, paid_amt FROM kd_loan_pay WHERE contract_id = ANY($1)', [vayIds]);
  const lpRem = x => Math.max(0, +x.amount - (+x.paid_amt || 0));
  const calls = await db.q('SELECT DISTINCT ON (contract_id) * FROM kd_debt_call WHERE contract_id = ANY($1) ORDER BY contract_id, at DESC', [ids]);
  await B.H.debt_call.decorate(calls, { db });
  const callOf = new Map(calls.map(x => [x.contract_id, x]));
  // lịch sử nhắc nợ (mọi lần gọi) · lãi chậm trả khách phải trả (HĐMB có lãi suất quá hạn — cùng cách tính màn Công nợ hợp đồng)
  const allCalls = await db.q('SELECT contract_id, at, result, content, promise_amount, promise_on FROM kd_debt_call WHERE contract_id = ANY($1) ORDER BY at DESC', [ids]);
  const RC = await rcpOf(db, cs.filter(c => c.kind === 'hdmb' && c.late_rate != null).map(c => c.id), t);
  const lateOf = c => c.kind === 'hdmb' && c.late_rate != null && +c.late_rate > 0 ? instDebt(c.d.inst, RC.get(c.id) || [], c, t, +c.late_rate).reduce((a, i) => a + i.late, 0) : null;
  const PST = Object.fromEntries(C.F.collect_plan.status.o.map(o => [o[0], o[1]]));
  const plans = await db.q("SELECT contract_id, month, expected, expected_on, status FROM kd_collect_plan WHERE contract_id = ANY($1) AND status <> 'thay_the' AND month BETWEEN $2 AND $3", [ids, m, monthAdd(m, 5)]);
  const RES = Object.fromEntries(C.F.debt_call.result.o.map(o => [o[0], o[1]]));
  const byU = new Map();
  for (const c of cs) (byU.get(c.unit_id) || byU.set(c.unit_id, []).get(c.unit_id)).push(c);
  const rows = [];
  for (const [uid, all] of byU) {
    const main = all.find(c => ['hdmb', 'thue_mua'].includes(c.kind)) || all.find(c => c.kind !== 'vay') || all[0];
    const rc = all.filter(c => c.kind !== 'vay'), sum = fn => rc.reduce((a, c) => a + fn(c), 0);   // HĐ vay = công ty vay của khách, không phải khoản khách nợ (xem cột Vay vốn)
    const dueGross = sum(c => c.d.inst.filter(i => i.due_on && i.due_on <= t).reduce((a, i) => a + i.amount, 0));
    const overdue = sum(c => c.d.overdue), days = Math.max(0, ...rc.map(c => c.d.overdue_days || 0));
    const paidDue = sum(c => c.d.inst.filter(i => i.due_on && i.due_on <= t).reduce((a, i) => a + i.paid, 0));   // đã thu vào các đợt đã đến hạn (cùng cơ sở với phải thu đến hạn)
    const nx = rc.map(c => c.d.next).filter(Boolean).sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)))[0] || null;
    const auto = debtGrpOf(overdue, days, D), man = overdue > 0 ? cfg.units[uid] || null : null, grp = man?.grp || auto;   // hết nợ quá hạn → nhóm chỉnh tay hết hiệu lực
    const vay = all.find(c => c.kind === 'vay');
    let vayInfo = null;
    if (vay) {
      const ls = LP.filter(x => x.contract_id === vay.id), lai = ls.filter(x => x.kind === 'lai');
      vayInfo = { id: vay.id, number: vay.number, goc: +vay.value, goc_nhan: vay.d.paid, goc_cho: vay.d.left, exp_on: vay.exp_on, term: vay.term_months,
        rate_l: vay.int_mode === 'lai_suat' ? (vay.loan_rate != null ? `${String(vay.loan_rate).replace('.', ',')} %/năm` : 'theo lãi suất') : vay.rent ? `bằng tiền thuê ${fmtMoney(+vay.rent)}/tháng` : 'bằng tiền thuê',
        lai_con: lai.reduce((a, x) => a + lpRem(x), 0), lai_qh: lai.filter(x => x.due_on < t).reduce((a, x) => a + lpRem(x), 0), tra_con: ls.reduce((a, x) => a + lpRem(x), 0) };
    }
    const bank = main.loan_status ? { st: main.loan_status, st_l: main.loan_status === 'co_vay' ? 'Có vay ngân hàng' : 'Không vay', bank: main.loan_bank || '', doc3: main.loan_doc3 || '', doc3_l: main.loan_doc3 === 'da_co' ? 'đã có chứng từ 3 bên' : main.loan_doc3 === 'chua_co' ? 'chưa có chứng từ 3 bên' : '' } : null;
    const lc = all.map(c => callOf.get(c.id)).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
    const plAll = plans.filter(p => p.month === m && all.some(c => c.id === p.contract_id)), plX = plAll.filter(p => p.status !== 'tu_choi'), plM = plX.reduce((a, p) => a + +p.expected, 0), plRej = !plX.length && plAll.length > 0;
    const lates = all.map(lateOf), lateInt = lates.some(x => x != null) ? lates.reduce((a, x) => a + (x || 0), 0) : null, rateSet = all.some(c => c.kind === 'hdmb' && c.late_rate != null);
    const callsU = allCalls.filter(x => all.some(c => c.id === x.contract_id));
    const W = [];
    if (grp === 'n5') W.push(['r', `Nợ khó đòi — quá hạn ${days} ngày, cần phương án xử lý`, 'qh']);   // 'qh': bảng CN-06 không hiện dòng này (đã có cột Số ngày quá hạn)
    else if (overdue > 0) W.push([days > D[0] ? 'r' : 'a', `Quá hạn ${days} ngày · ${fmtMoney(overdue)}`, 'qh']);
    if (lc?.promise_st === 'Thất hẹn') W.push(['r', `Thất hẹn cam kết ${fmtMoney(lc.promise_amount)} ngày ${C.dmy(lc.promise_on)}`]);
    else if (lc?.promise_amount && lc.promise_on >= t) W.push(['b', `Hẹn trả ${fmtMoney(lc.promise_amount)} ngày ${C.dmy(lc.promise_on)}`]);
    const due7 = sum(c => c.d.due7);
    if (due7 > 0) W.push(['b', `Sắp đến hạn ${C.dmy(nx?.due_on)} · ${fmtMoney(due7)}`]);
    if ((overdue > 0 || due7 > 0) && !plM) W.push(['a', plRej ? 'Kế hoạch thu tháng này bị từ chối — sửa và trình lại' : 'Chưa có kế hoạch thu tháng này']);
    if (man && DG_KEYS.indexOf(man.grp) < DG_KEYS.indexOf(auto)) W.push(['a', `Đang chỉnh tay nhẹ hơn tự động (${GL[auto].split(' · ')[0]})`]);
    if (bank?.st === 'co_vay' && bank.doc3 === 'chua_co') W.push(['a', 'Vay ngân hàng chưa có chứng từ 3 bên']);
    if (vayInfo?.lai_qh > 0) W.push(['r', `Quá hạn trả lãi HĐ vay cho khách ${fmtMoney(vayInfo.lai_qh)}`]);
    if (vayInfo?.exp_on && vayInfo.exp_on >= t && vayInfo.exp_on <= t30) W.push(['a', `HĐ vay đáo hạn ${C.dmy(vayInfo.exp_on)}`]);
    rows.push({ unit_id: uid, unit: main.unit, project: main.project, building: main.building, contract_id: main.id, customer: main.customer, phone: main.b_phone || main.phone || '', owner: main.owner || '',
      total: sum(c => c.d.total), due: dueGross, paid: paidDue, paid_all: sum(c => c.d.paid), left: sum(c => c.d.left), due_left: sum(c => c.d.due), overdue, days, due7,
      next_on: nx?.due_on || null, next_amt: nx?.rem || null, auto, grp, grp_l: GL[grp], manual: man,
      bank, vay: vayInfo, plan_m: plM || null, plan_on: plX.map(p => p.expected_on).sort()[0] || null, plan_st: plRej ? 'Bị từ chối' : [...new Set(plX.map(p => PST[p.status] || p.status))].join(', '), plan_n: plAll.length,
      late_int: lateInt, late_rate_set: rateSet, calls_n: callsU.length,
      calls: callsU.slice(0, 3).map(x => ({ at: new Date(Date.parse(x.at) + 7 * 3600e3).toISOString().slice(0, 10), result_l: RES[x.result] || '', content: x.content || '', promise: x.promise_amount ? `${fmtMoney(x.promise_amount)} · ${C.dmy(x.promise_on)}` : '' })),
      call: lc ? { at: new Date(Date.parse(lc.at) + 7 * 3600e3).toISOString().slice(0, 10), result_l: RES[lc.result] || '', content: lc.content || '', promise: lc.promise_amount ? `${fmtMoney(lc.promise_amount)} · ${C.dmy(lc.promise_on)}` : '', promise_st: lc.promise_st || '' } : null,
      warns: W, hist: (cfg.hist[uid] || []).slice(-5).reverse(),
      contracts: all.map(c => ({ id: c.id, number: c.number, kind: c.kind, kind_l: KL[c.kind] || c.kind, total: c.d.total, paid: c.d.paid, left: c.d.left, overdue: c.d.overdue, days: c.d.overdue_days || 0, next_on: c.d.next?.due_on || null, next_amt: c.d.next?.rem || null })) });
  }
  rows.sort((a, b) => DG_KEYS.indexOf(b.grp) - DG_KEYS.indexOf(a.grp) || b.overdue - a.overdue || b.due_left - a.due_left || String(a.unit).localeCompare(String(b.unit)));
  rows.forEach((r, i) => { r.stt = i + 1; });
  // dòng thu – chi dự kiến 6 tháng: thu = phần còn phải thu của các đợt đến hạn trong tháng (tháng này cộng cả nợ quá hạn), tách riêng phần của căn nợ khó đòi;
  // chi = lãi / gốc HĐ vay công ty phải trả khách đến hạn trong tháng (tháng này cộng cả phần quá hạn chưa trả); kế hoạch = dòng kế hoạch thu đã lập.
  const grpOfC = new Map(); for (const r of rows) for (const c of r.contracts) grpOfC.set(c.id, r.grp);
  const flow = Array.from({ length: 6 }, (_, k) => ({ m: monthAdd(m, k), thu: 0, thu_kd: 0, chi: 0, plan: 0 }));
  const slot = d => { const mm = String(d || '').slice(0, 7); return mm < m ? flow[0] : flow.find(x => x.m === mm); };
  for (const c of cs) if (c.kind !== 'vay') for (const i of c.d.inst) { if (!(i.rem > 0) || !i.due_on) continue; const s = slot(i.due_on); if (!s) continue; if (grpOfC.get(c.id) === 'n5') s.thu_kd += i.rem; else s.thu += i.rem; }
  for (const x of LP) { const r = lpRem(x); if (!r || !x.due_on) continue; const s = slot(x.due_on); if (s) s.chi += r; }
  for (const p of plans) { if (p.status === 'tu_choi') continue; const s = flow.find(x => x.m === p.month); if (s) s.plan += +p.expected; }
  const groups = DG_KEYS.map(k => { const xs = rows.filter(r => r.grp === k); return { k, l: GL[k], n: xs.length, overdue: xs.reduce((a, r) => a + r.overdue, 0), left: xs.reduce((a, r) => a + r.left, 0) }; });
  return { rows, groups, flow, days: D, labels: GL, month: m, can_class: canDebtClass(user), can_plan: can(user, E.collect_plan, 'c'), can_days: ['truong_phong', 'lanh_dao', 'admin'].includes(user.role), bravo_sync: await bravoSync(db) };
}
// chỉnh tay nhóm nợ 1 căn (grp = 'auto' → trả về tự động); db: trong giao dịch
async function setDebtClass(db, user, unitId, b = {}) {
  if (!canDebtClass(user)) deny();
  const grp = String(b.grp || ''), reason = String(b.reason || '').trim();
  if (grp !== 'auto' && !DG_KEYS.includes(grp)) bad('Chọn nhóm nợ');
  if (reason.length < 3) bad('Ghi lý do cập nhật nhóm nợ');
  if (reason.length > 500) bad('Lý do tối đa 500 ký tự');
  const u = await db.one("SELECT u.id, u.code, u.is_demo FROM kd_unit u WHERE u.id = $1", [+unitId]); if (!u) bad('Không tìm thấy căn hộ');
  if (C.own(user, E.customer) && !(await db.one("SELECT 1 FROM kd_contract WHERE unit_id = $1 AND status = 'da_ky' AND (owner_id = $2 OR created_by = $2)", [u.id, user.id]))) deny();
  await db.q("INSERT INTO kd_setting (key, value) VALUES ('debt_class', '{}'::jsonb) ON CONFLICT (key) DO NOTHING");
  const v = (await db.one("SELECT value FROM kd_setting WHERE key = 'debt_class' FOR UPDATE")).value || {};
  v.units ||= {}; v.hist ||= {};
  const before = v.units[u.id]?.grp || 'auto', at = new Date().toISOString(), D = (await debtCfg(db)).days, GL = debtGrpL(D);
  if (grp === 'auto') delete v.units[u.id]; else v.units[u.id] = { grp, reason, by: user.id, by_l: user.full_name || user.username || '', at };
  (v.hist[u.id] ||= []).push({ from: before, to: grp, reason, by_l: user.full_name || user.username || '', at });
  v.hist[u.id] = v.hist[u.id].slice(-20);
  await db.q("UPDATE kd_setting SET value = $1, updated_at = now(), updated_by = $2 WHERE key = 'debt_class'", [JSON.stringify(v), user.id ?? null]);
  const L = k => k === 'auto' ? 'Theo tự động' : GL[k];
  await C.audit(db, 'unit', u.id, 'phan_loai_no', { debt_grp: before }, { debt_grp: grp }, user, `Nhóm nợ căn ${u.code}: ${L(before)} → ${L(grp)}. Lý do: ${reason}`, u.is_demo);
  return { ok: true, grp };
}
// đổi mốc ngày chia nhóm nợ (trưởng phòng / lãnh đạo)
async function setDebtDays(db, user, days) {
  if (!['truong_phong', 'lanh_dao', 'admin'].includes(user.role)) deny();
  const d = (Array.isArray(days) ? days : []).map(x => +x);
  if (d.length !== 3 || !d.every((x, i) => Number.isInteger(x) && x >= 1 && x <= 3650 && (!i || x > d[i - 1]))) bad('Mốc ngày phải là 3 số nguyên tăng dần (VD 30, 90, 180)');
  await db.q("INSERT INTO kd_setting (key, value) VALUES ('debt_class', '{}'::jsonb) ON CONFLICT (key) DO NOTHING");
  const v = (await db.one("SELECT value FROM kd_setting WHERE key = 'debt_class' FOR UPDATE")).value || {};
  const old = v.days || DG_DAYS; v.days = d;
  await db.q("UPDATE kd_setting SET value = $1, updated_at = now(), updated_by = $2 WHERE key = 'debt_class'", [JSON.stringify(v), user.id ?? null]);
  await C.audit(db, 'unit', 0, 'moc_nhom_no', { days: old.join(',') }, { days: d.join(',') }, user, `Mốc nhóm nợ: ${old.join(' / ')} → ${d.join(' / ')} ngày`);
  return { ok: true, days: d };
}

// ======================= THEO DÕI HĐ VAY — LÃI & GỐC (CN-07) =======================
// gốc: khách chuyển theo các đợt giải ngân (lịch thu + phiếu thu của HĐ vay); lãi / gốc công ty phải trả khách: kd_loan_pay
const LP_ST = { thanh_ly: 'Đã thanh lý', qua_han: 'Quá hạn trả lãi', sap_toi: 'Đến hạn trong 7 ngày', dao_han: 'Đáo hạn trong 30 ngày', dang: 'Đang vay', xong: 'Đã trả hết' };
async function loanTrack(db, user, f = {}) {
  if (!can(user, E.installment, 'r')) deny();
  const p = [], t = isoDay(f.to) || today(), from = isoDay(f.from) || null, t7 = addDays(t, 7), t30 = addDays(t, 30);
  if (from && from > t) bad('«Từ ngày» sau «Đến ngày»');
  const cs = await db.q(`SELECT c.id, c.number, c.status, c.value, c.contract_on, c.signed_on, pr.name project_name, c.loan_recv_on, c.eff_on, c.exp_on, c.term_months, c.int_mode, c.loan_rate, c.rent, c.int_period, c.principal_method, c.nature, c.next_id, c.link_ids,
      u.code unit, pr.code project, b.code building, k.full_name customer, coalesce(c.b_phone, k.phone) phone,
      (SELECT string_agg(x.number, ', ') FROM kd_contract x WHERE x.id = ANY(c.link_ids)) links
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id JOIN kd_customer k ON k.id = c.customer_id
    WHERE c.kind = 'vay' AND c.status = ${f.closed === '1' ? "'thanh_ly'" : "'da_ky'"} ${uf(f, p)}${mine(user, 'c')} ORDER BY c.exp_on NULLS LAST, u.code`, p);   // 17/11/2026: HĐ đã thanh lý đóng công nợ — chỉ xem khi chọn «HĐ đã thanh lý»
  const ids = cs.map(c => c.id);
  await B.loanRebase(db, ids);   // lãi theo gốc khách đã chuyển (phiếu thu mới / đã hủy)
  const D = await B.debtOf(db, ids, t), RC = await rcpOf(db, ids, t), inW = on => !from || on >= from;
  const L = await db.q('SELECT * FROM kd_loan_pay WHERE contract_id = ANY($1) ORDER BY due_on, kind DESC, seq', [ids]);
  // xem theo «Đến ngày» trong quá khứ: số đã trả tính đến ngày đó (phiếu chi gắn kỳ có ngày ≤ Đến ngày), không lấy cả khoản trả sau (rà soát 07/11/2026)
  const PT = t < today() ? new Map((await db.q("SELECT loan_pay_id, sum(amount) s FROM kd_payment WHERE contract_id = ANY($1) AND status = 'hop_le' AND loan_pay_id IS NOT NULL AND voucher_date <= $2 GROUP BY 1", [ids, t])).map(x => [x.loan_pay_id, +x.s])) : null;
  const pd = x => !PT ? (+x.paid_amt || 0) : x.paid_on && x.paid_on <= t ? (+x.paid_amt || 0) : Math.min(+x.paid_amt || 0, PT.get(x.id) || 0);
  const rem = x => Math.max(0, +x.amount - pd(x)), sum = (xs, fn) => xs.reduce((a, x) => a + fn(x), 0);
  // lãi dồn tích đến hết hôm nay: kỳ đã kết thúc tính đủ, kỳ đang chạy tính theo số ngày đã qua / số ngày của kỳ, kỳ chưa tới = 0
  const accrued = x => !x.period_from || x.period_from > t ? 0 : !x.period_to || x.period_to <= t ? +x.amount : +x.amount * (dayDiff(x.period_from, t) + 1) / (dayDiff(x.period_from, x.period_to) + 1);
  const ML = { tien_thue: 'Tiền thuê 1 tháng / tháng', lai_suat: 'Lãi suất' }, PL = { 1: 'Hàng tháng', 3: 'Hàng quý', 6: '6 tháng', 12: 'Hàng năm', 0: 'Khi đáo hạn' };
  const rows = cs.map(c => {
    const ls = L.filter(x => x.contract_id === c.id), lai = ls.filter(x => x.kind === 'lai'), goc = ls.filter(x => x.kind === 'goc'), d = D.get(c.id), tl0 = c.status === 'thanh_ly';
    const next = tl0 ? null : ls.find(x => rem(x) > 0 && x.due_on >= t);   // 16/11/2026: kỳ tới theo «Đến ngày» (kỳ đã quá hạn nằm ở lãi quá hạn); HĐ đã thanh lý không có kỳ tới
    const laiQH = tl0 ? 0 : sum(lai.filter(x => x.due_on < t), rem), left = sum(ls, rem);
    const state = tl0 ? 'thanh_ly' : !ls.length ? 'dang' : !left && d.paid > 0 ? 'xong' : laiQH > 0 ? 'qua_han' : next && next.due_on <= t7 ? 'sap_toi' : c.exp_on && c.exp_on <= t30 ? 'dao_han' : 'dang';
    return { contract_id: c.id, project: c.project, building: c.building, unit: c.unit, customer: c.customer, phone: c.phone, number: c.number, links: c.links || '', nature_l: c.nature === 'ban' ? 'Bán căn hộ' : 'Cho thuê',
      goc_hd: +c.value, goc_nhan: d.paid, goc_cho: d.left, eff_on: c.eff_on, exp_on: c.exp_on, term_months: c.term_months, mode_l: c.int_mode === 'lai_suat' ? `${ML.lai_suat} ${c.loan_rate ?? ''}%/năm` : ML.tien_thue, rent: c.int_mode === 'tien_thue' ? +c.rent : null, period_l: PL[c.int_period] || '',
      project_name: c.project_name, signed_on: c.signed_on || c.contract_on, term_l: c.term_months ? `${c.term_months} tháng` : '',
      rate_l: c.int_mode === 'lai_suat' ? (c.loan_rate != null ? `${String(c.loan_rate).replace('.', ',')}%/năm` : '') : c.rent ? `Bằng tiền thuê ${fmtMoney(+c.rent)}/tháng` : 'Bằng tiền thuê',
      lai_tong: sum(lai, x => +x.amount), lai_tra: sum(lai, pd), lai_con: sum(lai, rem), lai_den_nay: Math.max(0, Math.round(sum(lai, accrued) - sum(lai, pd))), lai_qua_han: laiQH, goc_tra: sum(goc, pd), goc_tra_con: sum(goc, rem),
      next_on: next?.due_on || null, next_amt: next ? rem(next) : null, next_l: next ? (next.kind === 'lai' ? `Lãi kỳ ${next.seq}` : 'Trả gốc') : '', state, state_l: tl0 ? `Đã thanh lý${d.closed_on ? ' ' + C.dmy(d.closed_on) : ''} — đã đóng công nợ` : LP_ST[state],
      goc_nhan_w: (RC.get(c.id) || []).filter(r => inW(r.voucher_date)).reduce((a, r) => a + +r.amount, 0), lai_w: sum(lai.filter(x => x.due_on && x.due_on <= t && inW(x.due_on)), x => +x.amount) };
  });
  return { rows: from ? rows.filter(r => r.goc_nhan_w > 0 || r.lai_w > 0) : rows, states: LP_ST, from, to: t, closed: f.closed === '1' };
}
async function loanItems(db, user, id) {
  if (!can(user, E.installment, 'r')) deny();
  const c = await db.one("SELECT c.id, c.number, c.value, c.int_mode, c.rent, c.loan_rate, u.code unit, k.full_name customer FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id WHERE c.id = $1 AND c.kind = 'vay'", [+id]);
  if (!c) bad('Không tìm thấy HĐ vay');
  await B.loanRebase(db, [c.id]);
  if (C.own(user, E.customer) && !(await db.one('SELECT 1 FROM kd_contract WHERE id = $1 AND (owner_id = $2 OR created_by = $2)', [c.id, user.id]))) deny();
  const items = await db.q('SELECT * FROM kd_loan_pay WHERE contract_id = $1 ORDER BY due_on, kind DESC, seq', [c.id]);
  const pv = await db.q("SELECT loan_pay_id, string_agg(voucher_no, ', ' ORDER BY voucher_date, id) nos FROM kd_payment WHERE contract_id = $1 AND status = 'hop_le' AND loan_pay_id IS NOT NULL GROUP BY 1", [c.id]);
  const m = new Map(pv.map(x => [x.loan_pay_id, x.nos])); for (const x of items) x.vouchers = m.get(x.id) || '';
  return { contract: c, items, can_pay: can(user, E.payment, 'c') };
}

// Theo dõi hợp đồng — bấm 1 dòng: sổ ra phiếu thu (tiền vào công ty) và phiếu chi (tiền công ty trả ra) của hợp đồng (06/11/2026)
// Phiếu thu = kd_receipt, phiếu chi = kd_payment — phòng KD tự ghi để theo dõi tiến độ (không phải chứng từ kế toán).
async function contractVouchers(db, user, id, qs = {}) {
  if (!can(user, E.installment, 'r')) deny();
  const c = await db.one(`SELECT c.id, c.number, c.kind, c.status, c.owner_id, c.created_by, c.late_rate, c.maint_fee, c.after_tax, c.finish_value, c.maint_dot, c.value, c.contract_on, c.signed_on, c.deposit,
      u.code unit, k.code cust_code, k.full_name customer, coalesce(c.b_phone, k.phone) phone, pr.name project, own.full_name owner
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id JOIN kd_project pr ON pr.id = u.project_id LEFT JOIN kd_user own ON own.id = c.owner_id WHERE c.id = $1`, [+id]);
  if (!c) bad('Không tìm thấy hợp đồng');
  if (C.own(user, E.customer) && c.owner_id !== user.id && c.created_by !== user.id) deny();
  const SRC = { bravo: 'Bravo', misa: 'MISA', thu_cong: 'Phòng KD nhập' };
  const thu = (await db.q(`SELECT r.id, r.voucher_no, r.voucher_date, r.amount, r.content, r.src, r.status, r.void_reason, i.name inst
      FROM kd_receipt r LEFT JOIN kd_installment i ON i.id = r.installment_id WHERE r.contract_id = $1 ORDER BY r.voucher_date, r.id`, [c.id]))
    .map(r => ({ ent: 'receipt', id: r.id, no: r.voucher_no, on: r.voucher_date, amount: +r.amount, content: r.content || (r.inst ? 'Thu ' + r.inst : ''), src: SRC[r.src] || r.src, ok: r.status === 'hop_le',
      st: r.status === 'hop_le' ? ['Hợp lệ', 'g'] : ['Đã hủy' + (r.void_reason ? ': ' + r.void_reason : ''), 'r'] }));
  const KND = Object.fromEntries(E.payment.fields.find(f => f.k === 'kind').o.map(o => [o[0], o[1]]));
  const chi = (await db.q(`SELECT p.id, p.voucher_no, p.voucher_date, p.amount, p.kind, p.content, p.receiver, p.status, p.void_reason, l.kind lk, l.seq
      FROM kd_payment p LEFT JOIN kd_loan_pay l ON l.id = p.loan_pay_id WHERE p.contract_id = $1 ORDER BY p.voucher_date, p.id`, [c.id]))
    .map(r => ({ ent: 'payment', id: r.id, no: r.voucher_no, on: r.voucher_date, amount: +r.amount, ok: r.status === 'hop_le',
      content: [KND[r.kind] + (r.lk === 'lai' ? ` kỳ ${r.seq}` : ''), r.content, r.receiver ? 'người nhận: ' + r.receiver : ''].filter(Boolean).join(' — '), src: KND[r.kind],
      st: r.status === 'hop_le' ? ['Hợp lệ', 'g'] : ['Đã hủy' + (r.void_reason ? ': ' + r.void_reason : ''), 'r'] }));
  chi.sort((a, b) => String(a.on).localeCompare(String(b.on)) || a.id - b.id);
  const s = a => a.filter(x => x.ok).reduce((t, x) => t + x.amount, 0);
  // công nợ từng đợt (trừ HĐ vay — xem lịch trả lãi & gốc): tính đến «Đến ngày» đang xem (ngày tương lai: tính như khách chưa trả thêm đến ngày đó)
  const asof = isoDay(qs.to) || today(), D1 = (await B.debtOf(db, [c.id], asof)).get(c.id), closed = !!D1.closed;
  const rate = c.late_rate != null && !closed ? +c.late_rate : null;   // 17/11/2026: HĐ đã thanh lý — đóng công nợ, không tính lãi chậm trả
  const inst = c.kind === 'vay' ? null : instDebt(D1.inst, (await rcpOf(db, [c.id], asof)).get(c.id) || [], c, asof, rate);
  const liq = closed ? await db.one("SELECT id, code FROM kd_cancel_req WHERE kind = 'thanh_ly' AND (contract_id = $1 OR $1 = ANY(coalesce(ct_ids, '{}'::int[]))) AND status NOT IN ('huy', 'tu_choi') ORDER BY id DESC LIMIT 1", [c.id]) : null;
  // mỗi phiếu thu đã được trừ vào đợt nào (theo quy tắc chia phiếu ở payTimeline); phiếu sau ngày xem / đã hủy không tính
  if (inst) {
    const AL = new Map(), add = (rid, lbl, amt) => (AL.get(rid) || AL.set(rid, []).get(rid)).push({ lbl, amt });
    for (const i of inst) for (const p of i.pcs) add(p.rid, i.lbl, p.amt);
    for (const p of inst.extra || []) add(p.rid, 'Thu thừa (vượt lịch thanh toán)', p.amt);
    for (const x of thu) { x.alloc = AL.get(x.id) || []; x.after = String(x.on) > asof; }
    inst.forEach(i => { i.pcs = i.pcs.map(p => ({ on: p.on, amt: p.amt, no: thu.find(x => x.id === p.rid)?.no || '' })); });
  }
  for (const x of chi) x.after = String(x.on) > asof;
  const sa = a => a.filter(x => x.ok && !x.after).reduce((t, x) => t + x.amount, 0);
  const KL = Object.fromEntries(E.contract.fields.find(x => x.k === 'kind').o.map(o => [o[0], o[1]])), SL = Object.fromEntries(E.contract.fields.find(x => x.k === 'status').o.map(o => [o[0], o[1]]));
  return { contract: { id: c.id, number: c.number, kind: c.kind, kind_l: KL[c.kind] || c.kind, status_l: SL[c.status] || c.status, unit: c.unit, cust_code: c.cust_code, customer: c.customer, phone: c.phone, project: c.project, owner: c.owner,
      signed_on: c.signed_on || c.contract_on, value: +c.value || 0, after_tax: c.after_tax != null ? +c.after_tax : null, maint_fee: +c.maint_fee || 0, finish_value: +c.finish_value || 0, deposit: c.deposit != null ? +c.deposit : null },
    thu, chi, thu_sum: s(thu), chi_sum: s(chi), thu_asof: sa(thu), chi_asof: sa(chi), inst, extra: inst?.extra?.reduce((t, p) => t + p.amt, 0) || 0, asof, late_rate: rate,
    closed: closed ? { on: D1.closed_on, left: D1.left_at_close || 0, slip: liq ? { id: liq.id, code: liq.code } : null } : null,
    can_rate: c.kind === 'hdmb' && !['huy', 'thanh_ly'].includes(c.status) && canRate(user),   // gõ lãi suất chậm trả ngay ở màn Công nợ hợp đồng
    can_thu: can(user, E.receipt, 'c'), can_chi: can(user, E.payment, 'c') };
}

// ======================= PHIẾU THU – PHIẾU CHI (1 màn, 06/11/2026) =======================
// gộp kd_receipt (thu) + kd_payment (chi) theo ngày; lọc dự án / tòa, khoảng ngày, loại, trạng thái, tìm số phiếu / HĐ / căn / khách / nội dung
async function voucherList(db, user, f = {}) {
  const rc = can(user, E.receipt, 'r'), pc = can(user, E.payment, 'r');
  if (!rc && !pc) deny();
  const from = isoDay(f.from), to = isoDay(f.to); if (from && to && from > to) bad('«Từ ngày» sau «Đến ngày»');
  const type = ['thu', 'chi'].includes(f.type) ? f.type : '', st = ['hop_le', 'huy'].includes(f.status) ? f.status : '';
  const p = [];
  const w = a => {
    let s = uf(f, p) + mine(user, 'c');
    if (from) { p.push(from); s += ` AND ${a}.voucher_date >= $${p.length}`; }
    if (to) { p.push(to); s += ` AND ${a}.voucher_date <= $${p.length}`; }
    if (st) { p.push(st); s += ` AND ${a}.status = $${p.length}`; }
    const q = String(f.q || '').trim().slice(0, 100);
    if (q) { p.push(`%${q}%`); const n = p.length; s += ` AND (${a}.voucher_no ILIKE $${n} OR c.number ILIKE $${n} OR u.code ILIKE $${n} OR k.full_name ILIKE $${n} OR coalesce(${a}.content, '') ILIKE $${n})`; }
    return s;
  };
  const J = a => `FROM ${a === 'r' ? 'kd_receipt' : 'kd_payment'} ${a} JOIN kd_contract c ON c.id = ${a}.contract_id JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id JOIN kd_project pr ON pr.id = u.project_id`;
  const parts = [];
  if (rc && type !== 'chi') parts.push(`SELECT 'receipt' ent, 'thu' typ, r.id, r.voucher_no, r.voucher_date, r.amount, r.content, r.src, r.status, r.void_reason, r.grp grp, i.name item, NULL receiver,
      c.id contract_id, c.number, c.kind ct_kind, u.code unit, k.full_name customer, pr.code project ${J('r')} LEFT JOIN kd_installment i ON i.id = r.installment_id WHERE true ${w('r')}`);
  if (pc && type !== 'thu') parts.push(`SELECT 'payment' ent, 'chi' typ, t.id, t.voucher_no, t.voucher_date, t.amount, t.content, t.src, t.status, t.void_reason, t.kind grp, CASE WHEN l.id IS NULL THEN NULL WHEN l.kind = 'lai' THEN 'Lãi kỳ ' || l.seq ELSE 'Trả gốc' END item, t.receiver,
      c.id contract_id, c.number, c.kind ct_kind, u.code unit, k.full_name customer, pr.code project ${J('t')} LEFT JOIN kd_loan_pay l ON l.id = t.loan_pay_id WHERE true ${w('t')}`);
  if (!parts.length) return { rows: [], can: { thu: rc && can(user, E.receipt, 'c'), chi: pc && can(user, E.payment, 'c') }, see: { thu: rc, chi: pc } };
  const lim = 3000, list = await db.q(`${parts.join(' UNION ALL ')} ORDER BY voucher_date DESC, ent, id DESC LIMIT ${lim + 1}`, p);
  const opt = (e, k) => Object.fromEntries((E[e].fields.find(x => x.k === k)?.o || []).map(o => [o[0], o[1]])), RG = opt('receipt', 'grp'), PK = opt('payment', 'kind'), CK = opt('contract', 'kind');
  const SRC = { bravo: 'Bravo', misa: 'MISA', thu_cong: 'Phòng KD nhập' };
  const rows = list.slice(0, lim).map(r => {
    const ok = r.status === 'hop_le', amt = +r.amount || 0;
    return { ent: r.ent, id: r.id, type_l: r.typ === 'thu' ? 'Phiếu thu' : 'Phiếu chi', typ: r.typ, voucher_no: r.voucher_no, voucher_date: r.voucher_date, contract_id: r.contract_id, number: r.number, ct_kind_l: CK[r.ct_kind] || r.ct_kind,
      unit: r.unit, customer: r.customer, project: r.project, grp_l: (r.typ === 'thu' ? RG[r.grp] : PK[r.grp]) || '', item: r.item || '', receiver: r.receiver || '',
      thu: r.typ === 'thu' && ok ? amt : null, chi: r.typ === 'chi' && ok ? amt : null, amount: amt, ok, content: r.content || '', src_l: SRC[r.src] || r.src || '',
      status_l: ok ? 'Hợp lệ' : 'Đã hủy' + (r.void_reason ? ': ' + r.void_reason : '') };
  });
  return { rows, more: list.length > lim, can: { thu: rc && can(user, E.receipt, 'c'), chi: pc && can(user, E.payment, 'c') }, see: { thu: rc, chi: pc } };
}

// ======================= THEO DÕI CÔNG NỢ ĐẾN HẠN (CN-11, 17/11/2026) =======================
// mỗi dòng = 1 đợt thu (kể cả phí bảo trì, tiền thuê, hoàn thiện…) của hợp đồng còn hiệu lực (đã ký; HĐ đã thanh lý / hủy không có), hạn ≤ hôm nay, chưa thu đủ.
// Đã thu từng đợt chia theo phiếu thu như B.debtOf (phiếu chọn đợt vào đợt đó trước, còn lại vào đợt hạn sớm nhất) → thu một phần còn số thiếu, thu đủ thì khỏi bảng.
// Tính trực tiếp từ lịch thu hiện hành + phiếu thu hợp lệ mỗi lần xem (không lưu bảng riêng) → đổi hạn / ghi thu là cập nhật, không trùng khoản. HĐ vay (công ty vay khách) không có ở đây
// ======================= BÁO CÁO CÔNG NỢ ĐẾN HẠN TỰ ĐỘNG (CN-11, 17/11/2026) =======================
// Tại ngày chốt: mỗi dòng = 1 khoản đến hạn (hạn ≤ ngày chốt) còn chưa thanh toán đủ của 1 hợp đồng đã ký còn theo dõi (HĐ thanh lý đã đóng công nợ — hoàn trả xem «Theo dõi thanh lý & chi trả»).
//  Phải thu khách: đợt HĐMB / thuê mua (gồm phí bảo trì), kỳ tiền thuê + khoản thu của HĐ thuê, đợt HĐ hoàn thiện, tiến độ HĐMB của HĐ thuê / HĐ vay bán căn (HĐ thuê + HĐ vay đi kèm dùng chung
//  1 tiến độ — tính 1 lần, đã thu = gốc vay còn phải trả khách, chỉ là số liệu liên kết), đợt gốc khách phải chuyển của HĐ vay (HĐ vay không có tiến độ HĐMB).
//  Phải trả khách: gốc + lãi HĐ vay đến hạn chưa trả (lịch trả lãi & gốc). Phải thu / phải trả tách riêng, không bù trừ.
//  Lãi quá hạn: «Lãi suất quá hạn (%/năm)» của hợp đồng × còn nợ × số ngày quá hạn / 365; HĐ không ghi lãi suất → «Chưa đủ thông tin tính lãi».
const DD_GRP = [['den_han', 'Đến hạn hôm nay'], ['qh30', 'Quá hạn 1–30 ngày'], ['qh60', 'Quá hạn 31–60 ngày'], ['qh90', 'Quá hạn 61–90 ngày'], ['qh90p', 'Quá hạn trên 90 ngày']];
const ddGrp = d => d <= 0 ? 'den_han' : d <= 30 ? 'qh30' : d <= 60 ? 'qh60' : d <= 90 ? 'qh90' : 'qh90p';
const ddDay = v => v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null;
async function dueDebt(db, user, f = {}) {
  if (!can(user, E.installment, 'r')) deny();
  const t = isoDay(f.to) || today(), from = isoDay(f.from) || null;
  if (from && from > t) bad('«Từ ngày» sau ngày chốt');
  const opt = (e, k) => Object.fromEntries(E[e].fields.find(x => x.k === k).o.map(o => [o[0], o[1]]));
  const KL = opt('contract', 'kind'), SL = opt('contract', 'status'), LS = opt('contract', 'loan_status'), CR = opt('debt_call', 'result'), PB = opt('collect_plan', 'basis'), PS = opt('collect_plan', 'status');
  const p = [];
  const cs = await db.q(`SELECT c.*, u.code unit, u.project_id, u.building_id, k.code kcode, k.full_name customer, coalesce(c.b_phone, k.phone) phone, pr.code project, b.code building, own.full_name owner
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id
    LEFT JOIN kd_user own ON own.id = c.owner_id
    WHERE c.kind IN ('hdmb','thue_mua','thue','vay','hoan_thien') AND c.status = 'da_ky' ${uf(f, p)}${mine(user, 'c')}${f.unit_id ? ` AND c.unit_id = ${+f.unit_id}` : ''} ORDER BY pr.code, b.code, u.code, c.id`, p);
  const ids = cs.map(c => c.id), D = await B.debtOf(db, ids, t);
  const CALL = new Map((await db.q(`SELECT DISTINCT ON (contract_id) contract_id, at, result, (SELECT count(*) FROM kd_debt_call x WHERE x.contract_id = d.contract_id) n FROM kd_debt_call d WHERE contract_id = ANY($1) ORDER BY contract_id, at DESC, id DESC`, [ids])).map(x => [x.contract_id, x]));
  const PLAN = new Map((await db.q(`SELECT DISTINCT ON (p.contract_id) p.contract_id, p.expected_on, p.expected, p.basis, p.basis_note, p.status, us.full_name owner FROM kd_collect_plan p LEFT JOIN kd_user us ON us.id = p.owner_id
    WHERE p.contract_id = ANY($1) AND p.status NOT IN ('thay_the','dong') ORDER BY p.contract_id, p.expected_on DESC, p.id DESC`, [ids])).map(x => [x.contract_id, x]));
  const LP = await db.q('SELECT * FROM kd_loan_pay WHERE contract_id = ANY($1) AND due_on <= $2 AND coalesce(paid_amt, 0) < amount ORDER BY contract_id, due_on, seq', [ids, t]);
  // HĐ thuê ↔ HĐ vay đi kèm dùng chung tiến độ HĐMB: tiến độ lấy ở HĐ thuê (đã thu = gốc vay còn phải trả khách); bỏ tiến độ + đợt gốc của HĐ vay để không tính trùng
  const hasSale = c => ['thue', 'vay'].includes(c.kind) && c.sale_on && Array.isArray(c.sale_sched) && c.sale_sched.length;
  const vays = cs.filter(c => c.kind === 'vay'), shared = new Set();
  for (const c of cs.filter(c => c.kind === 'thue' && hasSale(c))) for (const v of B.loanPairOf(c, vays)) shared.add(v.id);
  const rows = [];
  const base = c => ({ contract_id: c.id, unit_id: c.unit_id, project: c.project, building: c.building, unit: c.unit, kcode: c.kcode || '', customer: c.customer, phone: c.phone || '',
    kind: c.kind, kind_l: KL[c.kind] || c.kind, number: c.number || '', status_l: SL[c.status] || c.status, owner: c.owner || '',
    loan_l: c.loan_status ? LS[c.loan_status] || c.loan_status : '', bank: c.loan_bank || '', loan_plan: c.loan_status === 'co_vay' ? 'Chưa có thông tin giải ngân' : '' });
  const extra = (r, c) => { const k = CALL.get(c.id), pl = PLAN.get(c.id);
    Object.assign(r, { call_on: k?.at || null, call_l: k ? CR[k.result] || k.result : '', call_n: k ? +k.n : 0,
      plan_on: pl ? ddDay(pl.expected_on) : null, plan_amt: pl ? +pl.expected : null, plan_src: pl ? PB[pl.basis] || pl.basis : '', plan_owner: pl?.owner || '', plan_st: pl ? PS[pl.status] || pl.status : '', plan_note: pl?.basis_note || '' }); };
  const push = (c, o) => {
    o.due_on = ddDay(o.due_on);
    // f.all (Xem chi tiết 1 căn): lấy MỌI đợt — đã thu đủ, đến hạn, quá hạn, chưa đến hạn — cùng nguồn / cùng quy tắc không cộng trùng như bảng chính
    if (f.all ? false : !(o.rem > 0) || !o.due_on || o.due_on > t || (from && o.due_on < from)) return;
    const days = o.rem > 0 && o.due_on ? Math.max(0, dayDiff(o.due_on, t)) : 0, rate = c.late_rate != null && c.late_rate !== '' ? +c.late_rate : null;
    // 17/11/2026: chỉ HĐ mua bán tính lãi chậm trả (theo lãi suất quá hạn ghi trên HĐ; chưa ghi → cảnh báo «Chưa đủ thông tin tính lãi»);
    // HĐ hoàn thiện / thuê / thuê mua / vay (kể cả tiến độ HĐMB trên HĐ thuê / vay): không áp dụng lãi chậm trả — lãi = 0, ghi «Không áp dụng lãi»
    const na = o.dir === 'thu' && days > 0 && c.kind !== 'hdmb';
    const lai = o.dir === 'thu' && days > 0 ? (na ? 0 : rate != null ? Math.round(o.rem * rate / 100 * days / 365) : null) : 0;
    o.st = !(o.rem > 0) ? 'da_thu' : !o.due_on ? 'chua_den_han' : o.due_on < t ? 'qua_han' : o.due_on === t ? 'den_han' : o.paid > 0 ? 'mot_phan' : 'chua_den_han';
    const g = ddGrp(days), r = { ...base(c), ...o, days, grp: g, grp_l: DD_GRP.find(x => x[0] === g)[1], dir_l: o.dir === 'thu' ? 'Phải thu khách hàng' : 'Phải trả khách hàng',
      lai, lai_na: na, lai_l: lai == null ? 'Chưa đủ thông tin tính lãi' : na ? 'Không áp dụng lãi' : '', total_rem: o.rem + (lai || 0) };
    extra(r, c); rows.push(r);
  };
  for (const c of cs) {
    const d = D.get(c.id); if (d.closed) continue;
    const skipInst = c.kind === 'vay' && (hasSale(c) || shared.has(c.id));   // HĐ vay bán căn có tiến độ HĐMB: gốc khách chuyển chính là khoản thu tiến độ HĐMB — không tính 2 lần
    if (!skipInst) {
      const no = new Map(); let k = 0; for (const i of [...d.inst].sort((a, b) => a.seq - b.seq)) if (!i.is_maint) no.set(i.id, ++k);
      for (const i of d.inst) {
        const dot = i.is_maint ? 'Phí bảo trì' : c.kind === 'vay' ? `Đợt gốc ${no.get(i.id)}` : c.kind === 'thue' ? `Kỳ ${no.get(i.id)}` : `Đợt ${no.get(i.id)}`;
        push(c, { dir: 'thu', src: c.kind === 'vay' ? 'goc_vay' : 'lich', inst_id: i.id, dot, content: i.name || '', due_on: i.due_on, amount: +i.amount, paid: +i.paid, rem: +i.rem, maint: !!i.is_maint });
      }
    }
    if (hasSale(c) && !(c.kind === 'vay' && shared.has(c.id))) {   // tiến độ HĐMB của HĐ thuê / HĐ vay bán căn
      const tk = (await B.saleTrack(db, c, t)).sale, lk = c.kind === 'thue' ? B.loanPairOf(c, vays).map(v => v.number).filter(Boolean) : [];
      for (const i of tk.rows) push(c, { dir: 'thu', src: 'hdmb', inst_id: null, dot: i.maint ? 'Phí bảo trì (HĐMB)' : `Đợt HĐMB ${i.seq}`,
        content: (i.name || '') + (lk.length ? ` — đã thu = gốc vay còn phải trả theo HĐ vay ${lk.join(', ')} (liên kết, không tạo phiếu thu)` : ''), due_on: i.due_on, amount: i.amount, paid: i.paid, rem: i.rem, maint: !!i.maint });
    }
  }
  for (const l of LP) {   // HĐ vay: gốc / lãi công ty đến hạn trả khách
    const c = cs.find(x => x.id === l.contract_id); if (!c || D.get(c.id).closed) continue;
    push(c, { dir: 'tra', src: l.kind === 'lai' ? 'lai_vay' : 'tra_goc', inst_id: null, loan_pay_id: l.id, dot: `${l.kind === 'lai' ? 'Lãi' : 'Gốc'} kỳ ${l.seq}`,
      content: l.kind === 'lai' ? `Trả lãi vay${l.period_from ? ` ${C.dmy(l.period_from)} – ${C.dmy(l.period_to)}` : ''}` : 'Trả gốc vay', due_on: l.due_on, amount: +l.amount, paid: +(l.paid_amt || 0), rem: +l.amount - +(l.paid_amt || 0) });
  }
  rows.sort((a, b) => (a.dir === b.dir ? 0 : a.dir === 'thu' ? -1 : 1) || b.days - a.days || String(a.unit).localeCompare(String(b.unit), 'vi', { numeric: true }) || String(a.due_on).localeCompare(String(b.due_on)));
  // kế hoạch trong kỳ (tháng của ngày chốt): dự kiến thu = kế hoạch thu đã lập; dự kiến chi = lãi + gốc HĐ vay đến hạn trong tháng chưa trả
  const m0 = t.slice(0, 8) + '01', m1 = addDays(t.slice(0, 8) + '28', 5).slice(0, 8) + '01', pp = [m0, m1], pq = [m0, m1];
  const planIn = +(await db.one(`SELECT coalesce(sum(p.expected), 0) s FROM kd_collect_plan p JOIN kd_contract c ON c.id = p.contract_id JOIN kd_unit u ON u.id = c.unit_id WHERE p.status NOT IN ('thay_the','dong','tu_choi','da_chot') AND p.expected_on >= $1 AND p.expected_on < $2 ${uf(f, pp)}`, pp)).s;
  const planOut = +(await db.one(`SELECT coalesce(sum(l.amount - coalesce(l.paid_amt, 0)), 0) s FROM kd_loan_pay l JOIN kd_contract c ON c.id = l.contract_id JOIN kd_unit u ON u.id = c.unit_id WHERE c.status = 'da_ky' AND l.due_on >= $1 AND l.due_on < $2 AND coalesce(l.paid_amt, 0) < l.amount ${uf(f, pq)}`, pq)).s;
  return { rows, asof: t, from, synced_at: new Date().toISOString(), kinds: [...new Set(rows.map(r => r.kind))].map(k => [k, KL[k] || k]), grps: DD_GRP,
    banks: [...new Set(rows.map(r => r.bank).filter(Boolean))], owners: [...new Set(rows.map(r => r.owner).filter(Boolean))], plan: { month: t.slice(0, 7), in: planIn, out: planOut }, can_thu: can(user, E.receipt, 'c'),
    planned: Object.fromEntries((await db.q("SELECT id, src_key, month, plan_week, expected FROM kd_collect_plan WHERE src_key LIKE 'dd:%' AND status NOT IN ('thay_the','dong','tu_choi','da_chot') ORDER BY id")).map(x => [x.src_key,
      { id: x.id, month: String(x.month).slice(0, 7), week: +x.plan_week || 0, amt: +x.expected, l: periodL(String(x.month).slice(0, 7), +x.plan_week || 0) }])),
    // 17/11/2026: số lần ghi nhận lịch sử kế hoạch thu theo căn + sheet (nhật ký các khoản kế hoạch, kể cả khoản đã gỡ)
    plan_hist: Object.fromEntries((await db.q(`SELECT coalesce(p.scope, a.after->>'scope', a.before->>'scope', 'ban') sc, coalesce(p.unit_id::text, a.after->>'unit_id', a.before->>'unit_id') uid, count(*) n
      FROM kd_audit a LEFT JOIN kd_collect_plan p ON p.id = a.rec_id WHERE a.ent = 'collect_plan' GROUP BY 1, 2`)).filter(x => x.uid).map(x => [`${x.sc}:${x.uid}`, +x.n])),
    promises: Object.fromEntries((await db.q('SELECT c.unit_id, min(k.promise_on) d FROM kd_debt_call k JOIN kd_contract c ON c.id = k.contract_id WHERE k.promise_on >= $1 GROUP BY c.unit_id', [today()])).map(x => [x.unit_id, ddDay(x.d)])),
    can_call: can(user, E.debt_call, 'c'), can_plan: can(user, E.collect_plan, 'c') };
}

// 17/11/2026: kế hoạch thu theo căn (tab báo cáo công nợ đến hạn) — mọi kế hoạch còn hiệu lực (không gồm bản «Đã thay thế» / đã đóng / bị từ chối) của các HĐ trong phạm vi lọc,
// ngày dự kiến từ «Từ ngày» (trống = đầu tháng của «Đến ngày») trở đi + kế hoạch cũ hơn còn chưa thu đủ. Thực thu = phiếu thu hợp lệ của HĐ (từ ngày lập kế hoạch, đến «Đến ngày»)
// phân bổ lần lượt cho các kế hoạch theo ngày dự kiến (không đếm 1 phiếu 2 lần); giữ nguyên số kế hoạch để đối chiếu. Tuần ISO / tháng theo ngày dự kiến
// 17/11/2026: tuần trong tháng — Thứ 2 → Chủ nhật, cắt theo ranh giới tháng (tuần 1 bắt đầu ngày 01); kỳ kế hoạch = tháng (+ tuần, không bắt buộc)
const monthWeeks = ym => { const [y, m] = ym.split('-').map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate(), W = [];
  for (let d = 1; d <= last;) { const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7, e = Math.min(last, d + 6 - dow); W.push({ n: W.length + 1, from: `${ym}-${String(d).padStart(2, '0')}`, to: `${ym}-${String(e).padStart(2, '0')}` }); d = e + 1; }
  return W; };
const weekIn = (ym, day) => day && day.slice(0, 7) === ym ? (monthWeeks(ym).find(w => w.from <= day && day <= w.to)?.n || 0) : 0;
const periodL = (ym, wk) => { const w = wk ? monthWeeks(ym)[wk - 1] : null, ml = `Tháng ${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
  return w ? `Tuần ${wk} – ${ml}` : `${ml} – Chưa phân bổ tuần`; };
const isoWeek = s => { const d = new Date(s + 'T00:00:00Z'), day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear(), w1 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7), mon = addDays(s, -day); return { key: `${y}-W${String(w).padStart(2, '0')}`, l: `Tuần ${w}/${y} (${C.dmy(mon).slice(0, 5)}–${C.dmy(addDays(mon, 6)).slice(0, 5)})` }; };
async function planRows(db, user, f, t) {
  const from = isoDay(f.from) || t.slice(0, 8) + '01', p = [];
  const ps = await db.q(`SELECT p.*, c.number, c.kind, c.status c_status, u.code unit, u.id unit_id, pr.code project, b.code building, k.full_name customer, us.full_name owner
    FROM kd_collect_plan p JOIN kd_contract c ON c.id = p.contract_id JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id
      JOIN kd_customer k ON k.id = c.customer_id LEFT JOIN kd_user us ON us.id = p.owner_id
    WHERE p.status NOT IN ('thay_the','tu_choi') AND c.status <> 'thanh_ly' ${uf(f, p)}${mine(user, 'c')} ORDER BY p.expected_on, p.id`, p);
  if (!ps.length) return [];
  const ids = [...new Set(ps.map(x => x.contract_id))], RC = await db.q("SELECT contract_id, voucher_date, amount FROM kd_receipt WHERE status = 'hop_le' AND contract_id = ANY($1) AND voucher_date <= $2 ORDER BY voucher_date, id", [ids, t]);
  const PL = Object.fromEntries(E.collect_plan.fields.find(x => x.k === 'fund_src').o.map(o => [o[0], o[1]])), ST = Object.fromEntries(E.collect_plan.fields.find(x => x.k === 'status').o.map(o => [o[0], o[1]]));
  for (const x of ps) { x.expected_on = ddDay(x.expected_on); x.actual = 0; x.from = ddDay(x.created_at); x.until = x.status === 'dong' ? ddDay(x.updated_at) : '9999'; }
  for (const r of RC) { let left = +r.amount; const vd = ddDay(r.voucher_date);
    for (const x of ps.filter(x => x.contract_id === r.contract_id && x.from <= vd && vd <= x.until)) { if (left <= 0) break; const take = Math.min(left, +x.expected - x.actual); if (take > 0) { x.actual += take; left -= take; } } }
  // lịch sử chuyển lịch: chuỗi kế hoạch trước (prev_id)
  const prevIds = ps.map(x => x.prev_id).filter(Boolean), prev = new Map();
  let q = prevIds; while (q.length) { const xs = await db.q('SELECT id, prev_id, expected_on, expected, resched_reason, created_at FROM kd_collect_plan WHERE id = ANY($1)', [q]); xs.forEach(x => prev.set(x.id, x)); q = xs.map(x => x.prev_id).filter(id => id && !prev.has(id)); }
  // bản «Đã đóng» (bỏ tích khi đã có thực thu) chỉ giữ để xem lịch sử: số kế hoạch = phần đã thu, không còn phải thu, không cảnh báo
  for (const x of ps) if (x.status === 'dong') { x.closed = 1; x.expected = x.actual; }
  return ps.filter(x => x.closed ? x.actual > 0 : x.expected_on >= from || x.actual < +x.expected).map(x => { const ym = x.month ? String(x.month).slice(0, 7) : x.expected_on.slice(0, 7),
      wk = x.plan_week == null ? weekIn(ym, x.expected_on) : +x.plan_week || 0, ws = wk ? monthWeeks(ym)[wk - 1] : null,
      w = { key: `${ym}-T${wk}`, l: periodL(ym, wk) + (ws ? ` (${C.dmy(ws.from).slice(0, 5)}–${C.dmy(ws.to).slice(0, 5)})` : '') }, rem = Math.max(0, +x.expected - x.actual), late = x.expected_on < t && rem > 0, hist = [];
    for (let id = x.prev_id; id && prev.get(id); id = prev.get(id).prev_id) hist.push({ on: ddDay(prev.get(id).expected_on), amt: +prev.get(id).expected });
    return { id: x.id, contract_id: x.contract_id, unit_id: x.unit_id, unit: x.unit, project: x.project, building: x.building, customer: x.customer, number: x.number, tab: x.scope || (x.kind === 'thue' ? 'thue' : 'ban'),
      expected_on: x.expected_on, week: w.key, week_l: w.l, plan_week: wk, month: ym, month_l: ym.slice(5, 7) + '/' + ym.slice(0, 4), expected: +x.expected, actual: x.actual, rem, pct: +x.expected ? Math.round(x.actual / +x.expected * 1000) / 10 : 0,
      src_l: PL[x.fund_src] || '', owner: x.owner || '', note: x.basis_note || '', status: x.status, st_l: ST[x.status] || x.status, call_id: x.call_id, version: x.version, resched: x.resched_reason || '',
      hist, warn: late ? `Quá ngày kế hoạch ${C.dmy(x.expected_on)}, chưa thu đủ (còn ${fmtMoney(rem)})` : '' }; });
}

// 17/11/2026: tích «Đưa vào kế hoạch thu» ở Báo cáo công nợ đến hạn — 1 khoản kế hoạch / căn / sheet (khóa src_key = dd:<ban|thue>:<id căn>): số tiền = còn phải thu đến hạn
// của căn trong sheet đến «Đến ngày», ngày dự kiến = ngày cam kết thanh toán gần nhất (từ hôm nay) của các HĐ của căn, chưa có thì ngày đang chọn; HĐ gắn = HĐ còn nợ nhiều nhất.
// Tích lại không tạo trùng; bỏ chọn: chưa có thực thu → gỡ khỏi kế hoạch, đã có thực thu → giữ lịch sử (đóng kế hoạch)
const ddTab = r => r.dir !== 'thu' ? null : r.kind === 'thue' && r.src === 'lich' ? 'thue' : 'ban';
async function ddPlanToggle(db, user, b) {
  if (!can(user, E.collect_plan, 'c')) deny('Bạn không được lập kế hoạch thu');
  const uid = +b.unit_id, tab = b.tab === 'thue' ? 'thue' : 'ban', key = `dd:${tab}:${uid}`, t = isoDay(b.to) || today();
  const ex = await db.q("SELECT * FROM kd_collect_plan WHERE src_key = $1 AND status NOT IN ('thay_the','dong','tu_choi','da_chot') ORDER BY id", [key]);
  if (b.on) {
    // 17/11/2026: kỳ do người dùng chọn ở hộp thoại — tháng (bắt buộc) + tuần trong tháng (không bắt buộc; 0 = chưa phân bổ tuần), số tiền mặc định = còn phải thu đến hạn
    const ym = /^\d{4}-\d{2}$/.test(b.month || '') ? b.month : null, W = ym ? monthWeeks(ym) : [], wk = +b.week || 0;
    if (b.month !== undefined) { if (!ym) bad('Chọn tháng / năm đưa vào kế hoạch thu'); if (wk && !W[wk - 1]) bad('Tuần không thuộc tháng đã chọn'); }
    const amt = b.amount != null && b.amount !== '' ? +b.amount : null; if (amt != null && !(amt > 0)) bad('Số tiền dự kiến thu phải > 0');
    if (ex.length) { if (!ym) return { ok: true, plan_id: ex[0].id, msg: 'Căn đã có trong kế hoạch thu' };
      const lbl = periodL(ym, wk), patch = { month: ym, plan_week: wk, expected_on: wk ? W[wk - 1].to : W[W.length - 1].to, ...(amt ? { expected: amt } : {}) };
      await C.sys(db, 'collect_plan', ex[0].id, patch, user, 'sua_ky', `Sửa kỳ kế hoạch thu: ${lbl}${amt ? ' · ' + fmtMoney(amt) : ''}`);
      return { ok: true, plan_id: ex[0].id, msg: `Đã sửa kỳ kế hoạch thu: ${lbl}${amt ? ' · ' + fmtMoney(amt) + 'đ' : ''}` }; }
    const rows = (await dueDebt(db, user, { to: t })).rows.filter(r => r.unit_id === uid && ddTab(r) === tab), rem = rows.reduce((s, r) => s + (+r.rem || 0), 0);
    if (!(rem > 0)) bad('Căn không còn khoản đến hạn chưa thu trong sheet này');
    const byC = new Map(); for (const r of rows) byC.set(r.contract_id, (byC.get(r.contract_id) || 0) + +r.rem);
    const ct = [...byC.entries()].sort((a, b2) => b2[1] - a[1])[0][0], cids = [...byC.keys()];
    const pr = await db.one('SELECT promise_on, promise_amount FROM kd_debt_call WHERE contract_id = ANY($1) AND promise_on >= $2 ORDER BY promise_on, id DESC LIMIT 1', [cids, today()]);
    const pon = pr?.promise_on ? ddDay(pr.promise_on) : t, m2 = ym || pon.slice(0, 7), W2 = monthWeeks(m2), wk2 = ym ? wk : weekIn(m2, pon), on = wk2 ? W2[wk2 - 1].to : W2[W2.length - 1].to, lbl = periodL(m2, wk2), val = amt || rem;
    const p = (await C.create('collect_plan', { contract_id: ct, src_cts: cids.join(','), scope: tab, month: m2, plan_week: wk2, expected: val, expected_on: on, basis: pr ? 'cam_ket' : 'lich_hd', fund_src: 'khach_tu_tra', src_key: key,
      basis_note: `Từ Báo cáo công nợ đến hạn (${tab === 'thue' ? 'cho thuê' : 'bán hàng'}) · ${lbl}${pr ? ` · khách cam kết ${C.dmy(pon)}` : ''}`, explain: 'Còn phải thu đến hạn của cả căn (có thể gồm nhiều hợp đồng)' }, user, { db, system: true })).row;
    return { ok: true, plan_id: p.id, msg: `Đã đưa căn vào kế hoạch thu: ${lbl} · ${fmtMoney(val)}đ` };
  }
  let del = 0, keep = 0;
  for (const p of ex) {
    const got = +(await db.one("SELECT coalesce(sum(amount), 0) s FROM kd_receipt WHERE status = 'hop_le' AND contract_id = $1 AND voucher_date >= $2::date", [p.contract_id, ddDay(p.created_at)])).s;
    if (got > 0) { await C.sys(db, 'collect_plan', p.id, { status: 'dong' }, user, 'bo_chon', 'Bỏ chọn ở Báo cáo công nợ đến hạn — đã có thực thu, giữ lịch sử'); keep++; }
    else { await db.q('DELETE FROM kd_collect_plan WHERE id = $1', [p.id]); await C.audit(db, 'collect_plan', p.id, 'xoa', p, null, user, 'Bỏ chọn ở Báo cáo công nợ đến hạn — chưa có thực thu, gỡ khỏi kế hoạch'); del++; }
  }
  return { ok: true, msg: keep ? `Đã bỏ chọn — ${keep} khoản đã có thực thu được giữ lịch sử (đóng kế hoạch)` : 'Đã gỡ căn khỏi kế hoạch thu' };
}
// 17/11/2026: kỳ của khoản kế hoạch (tháng + tuần trong tháng; tuần 0 = chỉ theo tháng) và kỳ kế tiếp — tuần cuối tháng → tuần 1 tháng sau; chỉ tháng → tháng sau
const ymAdd = (ym, k) => { const [y, m] = ym.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const pPeriod = x => { const ym = String(x.month || ddDay(x.expected_on)).slice(0, 7), wk = x.plan_week == null ? weekIn(ym, ddDay(x.expected_on)) : +x.plan_week || 0, W = monthWeeks(ym), w = wk ? W[wk - 1] : null;
  return { ym, wk, p_from: w ? w.from : `${ym}-01`, p_to: w ? w.to : W[W.length - 1].to }; };
const nextPeriod = (ym, wk) => !wk ? { ym: ymAdd(ym, 1), wk: 0 } : wk < monthWeeks(ym).length ? { ym, wk: wk + 1 } : { ym: ymAdd(ym, 1), wk: 1 };
const PLAN_LIVE = x => !['thay_the', 'tu_choi', 'dong', 'da_chot'].includes(x.status);
// phân bổ phiếu thu cho các khoản kế hoạch: mỗi khoản chỉ nhận phiếu trong cửa sổ kỳ của nó — khoản gốc: từ ngày lập (hoặc đầu kỳ nếu sớm hơn) đến hết kỳ;
// khoản chuyển tiếp: đúng kỳ mới (tiền thu kỳ sau ghi vào kỳ sau). Khoản «Đã chốt kỳ» chỉ nhận đúng số thực thu đã chốt (không cập nhật ngược). Mỗi phiếu tính 1 lần (lần lượt theo ngày dự kiến).
async function planAlloc(db, all, { from = null, to }) {
  // dòng thu bán mới đã liên kết căn nhưng chưa chọn HĐ: tính phiếu thu mọi HĐ của căn + phiếu thu theo căn chưa gắn HĐ (đặt cọc…); mỗi phiếu vẫn chỉ tính 1 lần cho toàn bộ kế hoạch
  const uIds = [...new Set(all.filter(x => x.scope === 'moi' && x.unit_id && !x.contract_id).map(x => +x.unit_id))];
  const UC = new Map(); if (uIds.length) for (const c of await db.q('SELECT id, unit_id FROM kd_contract WHERE unit_id = ANY($1)', [uIds])) (UC.get(c.unit_id) || UC.set(c.unit_id, []).get(c.unit_id)).push(c.id);
  const pool = x => x.scope === 'moi' && x.unit_id && !x.contract_id ? UC.get(+x.unit_id) || [] : [...new Set([+x.contract_id, ...String(x.src_cts || '').split(',').map(Number)].filter(Boolean))];
  for (const x of all) { Object.assign(x, pPeriod(x)); x.expected_on = ddDay(x.expected_on); x.cts = pool(x); x.ups = x.scope === 'moi' && x.unit_id ? [+x.unit_id] : []; x.actual = 0; x.rc = [];
    const made = ddDay(x.created_at); x.w_from = x.prev_id && x.carry_in != null ? x.p_from : made < x.p_from ? made : x.p_from;
    x.w_to = x.status === 'dong' ? ddDay(x.updated_at) : x.p_to; x.cap = x.status === 'da_chot' ? +x.act_snap || 0 : +x.expected; }
  const ids = [...new Set(all.flatMap(x => x.cts))], ups = [...new Set(all.flatMap(x => x.ups))];
  const RC = ids.length || ups.length ? await db.q(`SELECT r.id, r.contract_id, r.unit_id, r.voucher_date, r.amount, r.voucher_no, coalesce(c.number, 'Thu theo căn') number FROM kd_receipt r LEFT JOIN kd_contract c ON c.id = r.contract_id
    WHERE r.status = 'hop_le' AND (r.contract_id = ANY($1) OR (r.contract_id IS NULL AND r.unit_id = ANY($3))) AND r.voucher_date <= $2 ORDER BY r.voucher_date, r.id`, [ids, to, ups]) : [];
  const ord = [...all].sort((a, b) => (a.status === 'da_chot' ? 0 : 1) - (b.status === 'da_chot' ? 0 : 1) || a.expected_on.localeCompare(b.expected_on) || a.id - b.id);
  for (const r of RC) { let left = +r.amount; const vd = ddDay(r.voucher_date);
    for (const x of ord) { if (left <= 0) break; if (!(r.contract_id ? x.cts.includes(+r.contract_id) : x.ups.includes(+r.unit_id)) || vd < x.w_from || vd > x.w_to) continue;
      if (x.status !== 'da_chot' && from && vd < from) continue;
      const take = Math.min(left, x.cap - x.actual); if (take > 0) { x.actual += take; left -= take; x.rc.push({ id: r.id, no: r.voucher_no || '', on: vd, amt: take, full: +r.amount, number: r.number }); } } }
  for (const x of all) { if (x.status === 'da_chot') x.actual = +x.act_snap || 0; if (x.status === 'dong') x.expected = x.actual; }
  return all;
}
// mọi khoản kế hoạch (kể cả dòng thu bán mới chưa có HĐ / căn — dự án, tòa lấy theo dòng kế hoạch)
const planAll = async (db, f = {}, user = null) => { const p = [], w = [];
  for (const k of ['project', 'building']) if (f[k] && !/^\d+$/.test(f[k])) bad('Bộ lọc không hợp lệ');
  if (f.project) { p.push(+f.project); w.push(`coalesce(u.project_id, x.project_id) = $${p.length}`); }
  if (f.building) { p.push(+f.building); w.push(`coalesce(u.building_id, x.building_id) = $${p.length}`); }
  if (user && C.own(user, E.customer)) w.push(`(coalesce(c.owner_id, x.owner_id) = ${+user.id} OR coalesce(c.created_by, x.created_by) = ${+user.id})`);
  return db.q(`SELECT x.*, c.number, c.kind, u.code unit, u.id unit_id, b.code building, b.id building_id, pr.code project, coalesce(k.full_name, k2.full_name) customer, us.full_name owner
    FROM kd_collect_plan x LEFT JOIN kd_contract c ON c.id = x.contract_id LEFT JOIN kd_unit u ON u.id = coalesce(c.unit_id, x.unit_id) LEFT JOIN kd_building b ON b.id = coalesce(u.building_id, x.building_id)
      LEFT JOIN kd_project pr ON pr.id = coalesce(u.project_id, x.project_id)
      LEFT JOIN kd_customer k ON k.id = c.customer_id LEFT JOIN kd_customer k2 ON k2.id = x.customer_id LEFT JOIN kd_user us ON us.id = x.owner_id
    WHERE x.status NOT IN ('thay_the','tu_choi') ${w.length ? ' AND ' + w.join(' AND ') : ''} ORDER BY x.expected_on, x.id`, p); };
// TỰ ĐỘNG CHUYỂN TIẾP khi hết tuần / tháng: khoản còn hiệu lực đã qua ngày cuối kỳ → chốt kỳ (lưu kế hoạch, thực thu trong kỳ, chưa thu, đã chuyển tiếp — giữ nguyên báo cáo kỳ cũ)
// và tạo khoản kỳ kế tiếp = phần còn thiếu, liên kết kỳ trước (prev_id), ghi «Chuyển tiếp từ …». Chạy nền + trước khi xem báo cáo; khóa để không chạy song song / không tạo trùng.
async function planRollover(db, asOf = today()) {
  await db.q('SELECT pg_advisory_xact_lock(84211)');
  let n = 0;
  for (let guard = 0; guard < 400; guard++) {
    const all = await planAll(db); for (const x of all) Object.assign(x, pPeriod(x));
    const due = all.filter(x => PLAN_LIVE(x) && x.p_to < asOf); if (!due.length) break;
    await planAlloc(db, all, { to: asOf });
    for (const x of due) {
      if (await db.one('SELECT id FROM kd_collect_plan WHERE prev_id = $1 AND carry_in IS NOT NULL LIMIT 1', [x.id])) continue;   // đã chuyển tiếp rồi — không tạo trùng
      const act = Math.min(x.actual, +x.expected), rem = Math.max(0, +x.expected - act), nx = nextPeriod(x.ym, x.wk), lbl = periodL(x.ym, x.wk), lbl2 = periodL(nx.ym, nx.wk);
      await C.sys(db, 'collect_plan', x.id, { status: 'da_chot', act_snap: act, carry_amt: rem, closed_on: x.p_to, carry_to: rem > 0 ? lbl2 : null }, null, 'chot_ky',
        `Chốt ${lbl}: kế hoạch ${fmtMoney(x.expected)}, thực thu ${fmtMoney(act)}, chưa thu ${fmtMoney(rem)}${rem > 0 ? ` → chuyển tiếp sang ${lbl2}` : ' — đã thu đủ'}`);
      if (rem > 0) { const W2 = monthWeeks(nx.ym);
        await C.create('collect_plan', { contract_id: x.contract_id, src_cts: x.src_cts, src_key: x.src_key, scope: x.scope, month: nx.ym,
          project_id: x.project_id, building_id: x.building_id, title: x.title, units_n: x.units_n, unit_price: x.unit_price, rate: x.rate, grp_key: x.grp_key, ...(x.contract_id ? {} : { unit_id: x.unit_id, customer_id: x.customer_id }), plan_week: nx.wk, expected: rem, carry_in: rem,
          expected_on: nx.wk ? W2[nx.wk - 1].to : W2[W2.length - 1].to, basis: x.basis || 'khac', fund_src: x.fund_src, owner_id: x.owner_id, ability: x.ability, prev_id: x.id, carry_from: lbl,
          basis_note: `Chuyển tiếp từ ${lbl}`, explain: `Chuyển tiếp phần chưa thu của ${lbl}` }, C.SYS, { db, system: true }); }
      n++; }
  }
  return n;
}
// BÁO CÁO KẾ HOẠCH THU (tháng / tuần trong tháng) — Nhóm thu → Tòa → Căn hộ, 1 dòng / mã căn. Kế hoạch tuần = số kế hoạch của các khoản thuộc tuần (gốc + chuyển tiếp vào tuần);
// kế hoạch tháng = khoản gốc trong tháng + khoản chuyển tiếp từ tháng trước (+ phần điều chỉnh của khoản chuyển tiếp trong tháng) — không cộng lặp 1 khoản tiền qua nhiều tuần.
// Kỳ đã chốt: thực thu = số đã chốt lúc hết kỳ (tiền thu kỳ sau không cập nhật ngược).
async function planReport(db, user, f) {
  if (!can(user, E.collect_plan, 'r')) deny();
  const by = f.by === 'tuan' ? 'tuan' : 'thang', ym = /^\d{4}-\d{2}$/.test(f.ym || '') ? f.ym : today().slice(0, 7), W = monthWeeks(ym);
  const wk = by === 'tuan' ? (f.week !== undefined && f.week !== '' ? +f.week : weekIn(ym, today()) || 1) : null;
  if (wk && !W[wk - 1]) bad('Tuần không thuộc tháng đã chọn');
  const to = isoDay(f.to) || today(), from = isoDay(f.from) || null;
  const all = await planAlloc(db, await planAll(db, f, user), { from, to }), byId = new Map(all.map(x => [x.id, x]));
  const inP = x => x.ym === ym && (by === 'thang' || x.wk === wk) && (x.status !== 'dong' || x.actual > 0);
  const ps = all.filter(inP), hist = ps.length ? await db.q(`SELECT a.rec_id, a.action, a.at, a.note, u.full_name who FROM kd_audit a LEFT JOIN kd_user u ON u.id = a.user_id
    WHERE a.ent = 'collect_plan' AND a.rec_id = ANY($1) ORDER BY a.at`, [ps.map(x => x.id)]) : [];
  const ST = Object.fromEntries(E.collect_plan.fields.find(x => x.k === 'status').o.map(o => [o[0], o[1]]));
  const rows = ps.map(x => { const pv = x.prev_id ? byId.get(x.prev_id) : null, inMonth = x.carry_in != null && pv && pv.ym === ym;
    // tháng: khoản chuyển tiếp trong cùng tháng chỉ tính phần điều chỉnh thêm / bớt so với số chuyển sang; tuần: tính đủ số kế hoạch của tuần
    const plan_v = by === 'thang' && inMonth ? +x.expected - +x.carry_in : +x.expected;
    // tháng: số chuyển tiếp RA khỏi tháng (khoản chốt mà kỳ kế tiếp thuộc tháng khác); tuần: số chuyển sang tuần sau
    const nx = nextPeriod(x.ym, x.wk), carry = x.status === 'da_chot' && (by === 'tuan' || nx.ym !== ym) ? +x.carry_amt || 0 : 0;
    return { id: x.id, scope: x.scope || (x.kind === 'thue' ? 'thue' : 'ban'), unit_id: x.unit_id, unit: x.unit, building: x.building, building_id: x.building_id, customer: x.customer,
      title: x.title || '', units_n: x.units_n, grp_key: x.grp_key || '', project_id: x.project_id, project: x.project || '', unit_price: x.unit_price != null ? +x.unit_price : null, rate: x.rate != null ? +x.rate : null,
      number: x.number, contract_id: x.contract_id, month: x.ym, week: x.wk, period_l: periodL(x.ym, x.wk), expected_on: x.expected_on, expected: +x.expected, plan_v, actual: x.actual, carry,
      carry_in: x.carry_in != null ? +x.carry_in : 0, cin_m: x.carry_in != null && !inMonth ? +x.carry_in : 0,   // nhận chuyển tiếp (tuần) / nhận chuyển tiếp từ tháng trước (tháng)
      closed: x.status === 'da_chot', act_snap: +x.act_snap || 0, carry_amt: +x.carry_amt || 0, carry_to: x.carry_to || '', carry_from: x.carry_from || '', closed_on: x.closed_on ? ddDay(x.closed_on) : null,
      owner: x.owner || '', owner_id: x.owner_id, status: x.status, st_l: ST[x.status] || x.status, note: x.basis_note || '', src_key: x.src_key || '', rc: x.rc,
      hist: hist.filter(h => h.rec_id === x.id).map(h => ({ at: h.at, action: h.action, who: h.who || '', note: h.note || '' })) }; });
  const ws = wk ? W[wk - 1] : null, pf = ws ? ws.from : `${ym}-01`, pt = ws ? ws.to : W[W.length - 1].to;
  // 17/11/2026: tổng 12 tháng của năm (kế hoạch tháng không cộng lặp chuyển tiếp trong tháng; nhận chuyển tiếp từ tháng trước; chuyển tiếp ra tháng sau) — biểu đồ «theo tháng»
  const yearsum = f.yearsum ? Array.from({ length: 12 }, (_, i) => `${ym.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`).map(m => { const xs = all.filter(x => x.ym === m && (x.status !== 'dong' || x.actual > 0));
    const pv = x => x.prev_id ? byId.get(x.prev_id) : null, inM = x => x.carry_in != null && pv(x) && pv(x).ym === m;
    return { m, plan: xs.reduce((a, x) => a + (inM(x) ? +x.expected - +x.carry_in : +x.expected), 0), act: xs.reduce((a, x) => a + x.actual, 0),
      cin: xs.filter(x => x.carry_in != null && !inM(x)).reduce((a, x) => a + +x.carry_in, 0), cout: xs.filter(x => x.status === 'da_chot' && nextPeriod(x.ym, x.wk).ym !== m).reduce((a, x) => a + (+x.carry_amt || 0), 0), n: xs.length }; }) : undefined;
  return { by, ym, week: wk, weeks: W, from, to, closed: pt < today(), yearsum,
    title: wk === 0 ? `Tháng ${+ym.slice(5)} năm ${ym.slice(0, 4)} — các khoản chưa phân bổ tuần` : `${wk ? `Tuần ${wk} tháng` : 'Tháng'} ${+ym.slice(5)} năm ${ym.slice(0, 4)}, từ ngày ${C.dmy(pf)} đến ngày ${C.dmy(pt)}`,
    rows, users: (await db.q('SELECT id, full_name FROM kd_user WHERE active ORDER BY full_name')).map(u => [u.id, u.full_name]), can_edit: can(user, E.collect_plan, 'u') || can(user, E.collect_plan, 'c') };
}
// 17/11/2026 (bản 3 nguồn): KẾ HOẠCH DÒNG THU NĂM — Tổng kế hoạch năm = Thu công nợ còn lại + Thu bán mới + Thu cho thuê phân bổ vào 12 tháng của năm
//  · Công nợ còn lại (sheet công nợ bán hàng: HĐMB / thuê mua / hoàn thiện; tiến độ HĐMB của HĐ thuê / vay bán căn chỉ 1 lần): kế hoạch từng đợt = số dư tại đầu năm, xếp theo tháng đến hạn
//  · Cho thuê (sheet công nợ cho thuê: kỳ tiền thuê nhà + nội thất, khoản thu theo HĐ thuê; không gồm tiền cọc, gốc / lãi vay phải trả): như trên
//  · Bán mới: khoản kế hoạch thu bán mới theo tháng thu (tỷ lệ × giá trị dự kiến bán); khoản chuyển tiếp trong cùng tháng chỉ tính phần chênh (không cộng lặp)
//  · Quá hạn từ năm trước: xếp vào kỳ dự kiến thu đã chọn (kế hoạch thu tuần/tháng); chưa chọn kỳ / chưa có ngày đến hạn / giá trị bán chưa phân bổ → «Chưa phân bổ kỳ» (không cộng tổng)
//  · Mỗi khoản trả về kế hoạch, thực thu (đã thu trong năm cho khoản đó — bán mới: phiếu thu phân bổ cho khoản kế hoạch), còn lại; HĐ ký sau kế hoạch bán mới của căn tính ở nguồn bán mới
async function planYear(db, user, f) {
  if (!can(user, E.collect_plan, 'r')) deny();
  const y = /^\d{4}$/.test(String(f.year || '')) ? +f.year : +today().slice(0, 4);
  // 17/11/2026: khoảng kế hoạch Từ ngày – Đến ngày (mặc định 01/01 – 31/12 của năm, gồm cả 2 đầu); cột tháng = các tháng trong khoảng
  let Y0 = isoDay(f.from) || `${y}-01-01`, Y1 = isoDay(f.to) || `${y}-12-31`; if (Y0 > Y1) bad('«Từ ngày» sau «Đến ngày»');
  // 17/11/2026: «Số dư công nợ chốt ngày» (mặc định hôm nay) — đã thu / còn phải thu tính theo giao dịch hợp lệ đến hết ngày này, độc lập với kỳ kế hoạch; chỉ tính toán, không ghi gì
  const asof = isoDay(f.asof) || today(), now = asof, M12 = []; for (let m = Y0.slice(0, 7); m <= Y1.slice(0, 7); m = ymAdd(m, 1)) { M12.push(m); if (M12.length > 36) bad('Khoảng thời gian tối đa 36 tháng'); };
  const fo = { project: f.project, building: f.building }, items = [];
  // ---- bán mới
  const PA = await planAlloc(db, await planAll(db, fo, user), { to: now }), byId = new Map(PA.map(x => [x.id, x]));
  const moiUnit = new Map(); for (const x of PA) if (x.scope === 'moi' && x.unit_id) { const c0 = ddDay(x.created_at); if (!moiUnit.has(+x.unit_id) || c0 < moiUnit.get(+x.unit_id)) moiUnit.set(+x.unit_id, c0); }
  const roots = new Map();
  for (const x of PA) { if (x.scope !== 'moi') continue;
    const base = { src: 'moi', project: x.project || '', building: x.building || '', unit: x.unit || x.title || '—', unit_id: x.unit_id || null, customer: x.customer || '', grp: x.grp_key || 'p' + x.id };
    if (x.carry_in == null && x.unit_id && String(x.grp_key || '').startsWith('moiu:')) { const r = roots.get(x.grp_key) || roots.set(x.grp_key, { base, value: +x.unit_price || 0, alloc: 0, sale: x.sale_month || null }).get(x.grp_key); r.alloc += +x.expected; }
    if (x.status === 'dong' && !(x.actual > 0)) continue; const inR = x.expected_on >= Y0 && x.expected_on <= Y1;
    const pv = x.prev_id ? byId.get(x.prev_id) : null, inMonth = x.carry_in != null && pv && pv.ym === x.ym, plan = inMonth ? +x.expected - +x.carry_in : x.status === 'dong' ? x.actual : +x.expected;
    items.push({ ...base, label: x.carry_from ? `Chuyển tiếp từ ${x.carry_from}` : x.unit_id && x.title && x.title !== x.unit ? `${x.title}${x.rate ? ` (${String(x.rate).replace('.', ',')}%)` : ''}` : x.rate ? `Thu ${String(x.rate).replace('.', ',')}% giá trị bán` : (x.title || 'Kế hoạch thu bán mới'), month: inR ? x.ym : null, zone: inR ? 'in' : 'out', due_on: x.expected_on, week_l: periodL(x.ym, x.wk),
      plan, act: x.actual, rem: Math.max(0, +x.expected - x.actual), st: x.status === 'da_chot' ? 'Đã chốt kỳ' : x.status === 'dong' ? 'Đã bỏ chọn' : 'Đang thực hiện', plan_id: x.id,
      contract: x.number || '', sale_month: x.sale_month || null, value: x.unit_price != null ? +x.unit_price : null, rate: x.rate != null ? +x.rate : null, carry_src: x.carry_from ? `Chuyển tiếp từ ${x.carry_from}` : '' }); }
  for (const r of roots.values()) if (r.value > r.alloc && (!r.sale || (r.sale >= Y0.slice(0, 7) && r.sale <= Y1.slice(0, 7))))
    items.push({ ...r.base, label: `Giá trị bán chưa phân bổ tháng thu (${Math.round((r.value - r.alloc) / r.value * 1000) / 10}%)`, month: null, due_on: null, week_l: '', plan: r.value - r.alloc, act: 0, rem: r.value - r.alloc, st: 'Chưa phân bổ kỳ', sale_month: r.sale, value: r.value, carry_src: '' });
  // ---- công nợ còn lại + cho thuê — 17/11/2026 (đối chiếu Bảng tổng hợp công nợ): số còn nợ HIỆN TẠI (tại ngày chốt) của từng đợt / kỳ, đã trừ tiền thu đúng đợt;
  //  vùng: trong năm (tháng đến hạn) · quá hạn chưa thu → «Công nợ chuyển sang» (đã chọn kỳ dự kiến thu trong năm → tháng đó) · đến hạn năm khác → «Ngoài năm» · chưa có ngày → «Chưa phân bổ kỳ»;
  //  công nợ còn lại: tổng của căn = «Còn lại theo hợp đồng» (Bảng tổng hợp công nợ, cùng ngày chốt); phần còn lại theo HĐ chưa có lịch thu → «Chưa phân bổ kỳ» (không bỏ sót)
  const p0 = addDays(Y0, -1) < asof ? addDays(Y0, -1) : asof, [A, S] = await Promise.all([dueDebt(db, user, { ...fo, to: asof, all: 1 }), dueDebt(db, user, { ...fo, to: p0, all: 1 })]);
  const key = r => `${r.contract_id}|${r.src}|${r.inst_id || r.dot}|${r.due_on || ''}`, S0 = new Map(S.rows.map(r => [key(r), r]));
  const sig = new Map((await db.q('SELECT id, signed_on, contract_on FROM kd_contract WHERE id = ANY($1)', [[...new Set(A.rows.map(r => r.contract_id))]])).map(c => [c.id, ddDay(c.signed_on || c.contract_on)]));
  const DDP = new Map((await db.q("SELECT src_key, month, expected_on FROM kd_collect_plan WHERE src_key LIKE 'dd:%' AND status NOT IN ('thay_the','dong','tu_choi','da_chot')")).map(x => [x.src_key, { m: String(x.month).slice(0, 7), on: ddDay(x.expected_on) }]));
  const skipU = new Set(), cnSum = new Map(), cnInfo = new Map();
  for (const r of A.rows) { const tb = ddTab(r); if (!tb) continue;
    if (tb === 'thue' && /c[oọ]c/i.test(`${r.content || ''} ${r.dot || ''}`)) continue;   // tiền cọc không tính vào thu cho thuê
    const mu = moiUnit.get(+r.unit_id); if (tb === 'ban' && mu && (sig.get(r.contract_id) || '') >= mu) { skipU.add(+r.unit_id); continue; }   // HĐ phát sinh từ kế hoạch bán mới → nguồn bán mới
    const rem = Math.max(0, +r.rem || 0); if (!(rem > 0)) continue;
    const s0 = S0.get(key(r)), act = Math.max(0, +r.paid - (s0 ? +s0.paid : 0)), sp = DDP.get(`dd:${tb}:${r.unit_id}`), od = r.due_on && r.due_on < asof, before = r.due_on && r.due_on < Y0;
    const sel = sp && od ? sp.m : null, eff = sel ? sp.on : r.due_on;   // ngày dự kiến thu đã điều chỉnh (đưa vào kế hoạch thu) ưu tiên với khoản quá hạn
    let zone, month = null;
    if (!r.due_on) zone = 'nodate';
    else if (eff >= Y0 && eff <= Y1) { zone = 'in'; month = eff.slice(0, 7); }
    else if (before && (!sel || eff < Y0)) zone = 'carry';   // quá hạn trước Từ ngày, chưa chọn kỳ thu (hoặc kỳ đã chọn cũng trước Từ ngày) → công nợ chuyển sang
    else zone = 'out';
    const src = tb === 'thue' ? 'thue' : 'cn';
    if (src === 'cn') { cnSum.set(+r.unit_id, (cnSum.get(+r.unit_id) || 0) + rem); if (!cnInfo.has(+r.unit_id)) cnInfo.set(+r.unit_id, r); }
    items.push({ src, project: r.project, building: r.building, unit: r.unit, unit_id: r.unit_id, customer: r.customer, contract: r.number, label: `${r.dot}${r.content ? ' — ' + r.content : ''}`,
      month, zone, due_on: r.due_on, carry: !!od, carry_src: od ? `Quá hạn chưa thu (hạn ${C.dmy(r.due_on)})${sel ? ' — đã chọn kỳ thu ' + sel.slice(5) + '/' + sel.slice(0, 4) : ''}` : '', week_l: '', plan: rem, act, rem,
      st: zone === 'nodate' ? 'Chưa có ngày đến hạn — chưa phân bổ kỳ' : zone === 'carry' ? 'Công nợ chuyển sang (quá hạn trước Từ ngày) — chưa chọn kỳ thu' : zone === 'out' ? `Ngoài kỳ (${r.due_on ? C.dmy(r.due_on) : ''}${sel ? ', kỳ thu ' + sel.slice(5) + '/' + sel.slice(0, 4) : ''})` : od ? 'Quá hạn — đã chọn kỳ thu' : r.due_on === asof ? 'Đến hạn hôm nay' : 'Chưa đến hạn' }); }
  // đối chiếu «Còn lại theo hợp đồng» (Bảng tổng hợp công nợ) theo căn — phần chưa có lịch thu → Chưa phân bổ kỳ
  const DS = await debtSummary(db, user, { to: asof }), total_left = {};
  for (const r of DS.rows) { if (skipU.has(+r.unit_id) || (fo.project && +r.project_id && +r.project_id !== +fo.project)) continue;
    const tl = Math.max(0, Math.round(+r.t_left || 0)); total_left[r.unit_id] = tl; const gap = tl - Math.round(cnSum.get(+r.unit_id) || 0);
    if (gap > 0) { const b0 = cnInfo.get(+r.unit_id); items.push({ src: 'cn', project: r.project, building: r.building, unit: r.unit, unit_id: r.unit_id, customer: r.customer, contract: r.number, label: 'Phần còn lại theo hợp đồng chưa có lịch thu / ngày đến hạn',
      month: null, zone: 'gap', due_on: null, carry: false, carry_src: '', week_l: '', plan: gap, act: 0, rem: gap, st: 'Chưa phân bổ kỳ (đối chiếu Bảng tổng hợp công nợ)' }); } }
  const projects = [...new Set(items.map(i => i.project).filter(Boolean))].sort();
  return { year: y, months: M12, from: Y0, to: Y1, asof, items, projects, total_left, can_plan: can(user, E.collect_plan, 'c') };
}
// 17/11/2026: BẢN KẾ HOẠCH DÒNG THU NĂM — lưu thành bản có mã, phiên bản, số liệu cố định (chụp toàn bộ khoản thu 3 nguồn theo tháng, đến từng căn tại thời điểm lưu / trình);
// luồng: Nháp → Chờ duyệt → Đã duyệt / Yêu cầu chỉnh sửa; Nháp / Yêu cầu chỉnh sửa được sửa và cập nhật lại số liệu nguồn; đã trình / đã duyệt không tự ghi đè;
// đã duyệt muốn điều chỉnh → tạo phiên bản mới, trình duyệt lại (bản duyệt cũ chuyển «Đã thay thế» khi bản mới được duyệt); thực thu tính riêng để so sánh, không đổi số kế hoạch
const YP_ST = { nhap: 'Nháp', cho_duyet: 'Chờ duyệt', da_duyet: 'Đã duyệt', yeu_cau_sua: 'Yêu cầu chỉnh sửa', thay_the: 'Đã thay thế' };
const YP_BOSS = ['truong_phong', 'lanh_dao', 'admin'];
const ypH = (user, act, note) => ({ at: new Date().toISOString(), by: user.id, by_name: user.full_name || user.username || '', act, note: note || '' });
const ypEdit = (user, p) => ['nhap', 'yeu_cau_sua'].includes(p.status) && (p.created_by === user.id || YP_BOSS.includes(user.role)) && can(user, E.collect_plan, 'c');
const ypDecider = (user, p) => p.status === 'cho_duyet' && (user.role === 'admin' || user.role === 'lanh_dao' || (+p.approver_id === user.id && YP_BOSS.includes(user.role)));
async function ypCapture(db, user, h) {
  await planRollover(db);
  const pj = h.project_id ? await db.one('SELECT code FROM kd_project WHERE id = $1', [+h.project_id]) : null; if (h.project_id && !pj) bad('Không tìm thấy dự án');
  const r = await planYear(db, user, { year: h.year, from: ddDay(h.from_on), to: ddDay(h.to_on), asof: ddDay(h.asof) });
  const items = pj ? r.items.filter(i => i.project === pj.code) : r.items, cu = new Set(items.filter(i => i.src === 'cn').map(i => String(i.unit_id)));
  const total_left = Object.fromEntries(Object.entries(r.total_left).filter(([k]) => cu.has(String(k))));
  const t = { cn: 0, moi: 0, thue: 0, un: 0 }; for (const i of items) { if (i.month) t[i.src] += +i.plan || 0; else if (i.zone !== 'out' && i.zone !== 'carry') t.un += +i.plan || 0; }
  t.all = t.cn + t.moi + t.thue; t.units = new Set(items.map(i => i.src + '|' + (i.unit_id || i.grp || i.unit))).size; t.items = items.length;
  return { data: { year: r.year, months: r.months, from: r.from, to: r.to, asof: r.asof, items, total_left, can_plan: false, captured_at: new Date().toISOString() }, totals: t };
}
const ypHead = async (db, id) => { const p = await db.one('SELECT * FROM kd_year_plan WHERE id = $1', [+id]); if (!p) bad('Không tìm thấy bản kế hoạch'); return p; };
const ypUsers = async db => (await db.q("SELECT id, full_name, role FROM kd_user WHERE active ORDER BY full_name"));
async function ypList(db, user, f = {}) {
  if (!can(user, E.collect_plan, 'r')) deny();
  const p = [], w = ['true']; if (/^\d{4}$/.test(String(f.year || ''))) { p.push(+f.year); w.push(`y.year = $${p.length}`); } if (YP_ST[f.status]) { p.push(f.status); w.push(`y.status = $${p.length}`); }
  const rows = await db.q(`SELECT y.id, y.code, y.name, y.year, y.from_on, y.to_on, y.asof, y.version, y.root_id, y.status, y.totals, y.note, y.created_at, y.submitted_at, y.decided_at, y.approver_id, y.decide_note,
      pr.code project, pr.name project_name, a.full_name created_name, b.full_name approver_name,
      (SELECT max(z.version) FROM kd_year_plan z WHERE z.root_id = y.root_id) last_ver
    FROM kd_year_plan y LEFT JOIN kd_project pr ON pr.id = y.project_id LEFT JOIN kd_user a ON a.id = y.created_by LEFT JOIN kd_user b ON b.id = y.approver_id
    WHERE ${w.join(' AND ')} ORDER BY y.year DESC, y.code DESC, y.version DESC`, p);
  return { rows: rows.map(r => ({ ...r, from_on: ddDay(r.from_on), to_on: ddDay(r.to_on), asof: ddDay(r.asof), status_l: YP_ST[r.status] })), st: YP_ST,
    approvers: (await ypUsers(db)).filter(u => YP_BOSS.includes(u.role)).map(u => [u.id, u.full_name]), can_c: can(user, E.collect_plan, 'c') };
}
// thực thu (phiếu thu hợp lệ) theo tháng × nguồn của các căn trong bản kế hoạch — cập nhật liên tục, chỉ để so sánh
async function ypActual(db, d) {
  const to = d.to < today() ? d.to : today(); if (d.from > to) return { to, m: {} };
  const units = [...new Set(d.items.filter(i => i.unit_id).map(i => +i.unit_id))], moi = new Set(d.items.filter(i => i.src === 'moi' && i.unit_id).map(i => +i.unit_id));
  if (!units.length) return { to, m: {} };
  const rs = await db.q(`SELECT u.id unit_id, c.kind, coalesce(c.nature, '') nature, to_char(r.voucher_date, 'YYYY-MM') m, r.amount, coalesce(r.content, '') || ' ' || coalesce(i.name, '') txt
    FROM kd_receipt r JOIN kd_contract c ON c.id = r.contract_id JOIN kd_unit u ON u.id = c.unit_id LEFT JOIN kd_installment i ON i.id = r.installment_id
    WHERE r.status = 'hop_le' AND r.voucher_date >= $1 AND r.voucher_date <= $2 AND u.id = ANY($3)`, [d.from, to, units]);
  const m = {}; for (const r of rs) { const th = r.kind === 'thue' && r.nature !== 'ban'; if (th && /c[oọ]c/i.test(r.txt)) continue;
    const s = th ? 'thue' : moi.has(+r.unit_id) ? 'moi' : 'cn'; (m[s] ||= {})[r.m] = (m[s][r.m] || 0) + Math.round(+r.amount || 0); }
  return { to, m };
}
async function ypGet(db, user, id) {
  if (!can(user, E.collect_plan, 'r')) deny();
  const p = await ypHead(db, id), us = new Map((await ypUsers(db)).map(u => [u.id, u.full_name]));
  const pr = p.project_id ? await db.one('SELECT code, name FROM kd_project WHERE id = $1', [p.project_id]) : null;
  const vers = await db.q('SELECT id, version, status, created_at, decided_at FROM kd_year_plan WHERE root_id = $1 ORDER BY version', [p.root_id]);
  const last = Math.max(...vers.map(v => v.version)), open = vers.some(v => ['nhap', 'yeu_cau_sua', 'cho_duyet'].includes(v.status));
  return { plan: { ...p, data: undefined, from_on: ddDay(p.from_on), to_on: ddDay(p.to_on), asof: ddDay(p.asof), status_l: YP_ST[p.status], project: pr?.code || '', project_name: pr?.name || 'Tất cả dự án',
      created_name: us.get(p.created_by) || '', approver_name: us.get(p.approver_id) || '', decided_name: us.get(p.decided_by) || '' },
    data: p.data, actual: ['da_duyet', 'thay_the'].includes(p.status) ? await ypActual(db, p.data) : null,
    versions: vers.map(v => ({ ...v, status_l: YP_ST[v.status] })),
    approvers: (await ypUsers(db)).filter(u => YP_BOSS.includes(u.role)).map(u => [u.id, u.full_name]),
    can: { edit: ypEdit(user, p), decide: ypDecider(user, p), newver: p.status === 'da_duyet' && p.version === last && !open && can(user, E.collect_plan, 'c'), del: p.status === 'nhap' && ypEdit(user, p) && !p.submitted_at, copy: can(user, E.collect_plan, 'c') } };
}
// 17/11/2026 (bản 2): LƯU BẢN KẾ HOẠCH TỪ GIAO DIỆN CHỈNH SỬA — số liệu do giao diện gửi lên (đã lấy từ nguồn / kế thừa bản nguồn / đã chỉnh từng dòng);
// kind: new (bản mới) · copy (bản sao — mã mới, độc lập bản gốc) · ver (phiên bản điều chỉnh của bản đã duyệt — cùng mã, phiên bản +1) · id (sửa bản Nháp / Yêu cầu chỉnh sửa);
// Lưu nháp: vẫn sửa được; Lưu và trình duyệt: chốt số liệu (frozen_at), chuyển Chờ duyệt, khóa sửa. Mã, phiên bản, người lập, ngày lập do hệ thống ghi nhận
async function ypSave(db, user, b) {
  if (!can(user, E.collect_plan, 'c')) deny('Bạn không được lập kế hoạch thu');
  const name = String(b.name || '').trim().slice(0, 200), note = String(b.note || '').trim().slice(0, 2000), asof = isoDay(b.asof), apr = b.approver_id ? +b.approver_id : null, submit = !!b.submit;
  if (!name) bad('Nhập tên kế hoạch'); if (!asof) bad('Nhập ngày chốt công nợ');
  if (apr) { const a = await db.one('SELECT role, active FROM kd_user WHERE id = $1', [apr]); if (!a?.active || !YP_BOSS.includes(a.role)) bad('Người duyệt không có thẩm quyền phê duyệt'); }
  if (submit && !apr) bad('Chọn người duyệt trước khi trình');
  const y = /^\d{4}$/.test(String(b.year || '')) ? +b.year : bad('Chọn năm kế hoạch'), fr = isoDay(b.from), to = isoDay(b.to);
  if (!fr || !to) bad('Nhập Từ ngày – Đến ngày'); if (fr > to) bad('«Từ ngày» phải nhỏ hơn hoặc bằng «Đến ngày»');
  const pid = b.project_id ? +b.project_id : null; if (pid && !await db.one('SELECT id FROM kd_project WHERE id = $1', [pid])) bad('Không tìm thấy dự án');
  const D = b.data; if (!D || !Array.isArray(D.items)) bad('Thiếu số liệu kế hoạch'); if (D.items.length > 30000) bad('Số dòng kế hoạch quá lớn');
  const MS = []; for (let m = fr.slice(0, 7); m <= to.slice(0, 7); m = ymAdd(m, 1)) { MS.push(m); if (MS.length > 36) bad('Khoảng thời gian tối đa 36 tháng'); }
  const n0 = v => Math.round(+v || 0);
  const items = D.items.map(i => { const month = MS.includes(i.month) ? i.month : null, src = ['cn', 'moi', 'thue'].includes(i.src) ? i.src : bad('Dòng kế hoạch sai nguồn thu');
    return { ...i, src, month, zone: month ? 'in' : ['out', 'carry', 'gap', 'nodate'].includes(i.zone) && i.zone !== 'in' ? i.zone : 'nodate', plan: n0(i.plan), act: n0(i.act), rem: n0(i.rem) }; });
  const t = { cn: 0, moi: 0, thue: 0, un: 0 }; for (const i of items) { if (i.month) t[i.src] += i.plan; else if (i.zone !== 'out' && i.zone !== 'carry') t.un += i.plan; }
  t.all = t.cn + t.moi + t.thue; t.units = new Set(items.map(i => i.src + '|' + (i.unit_id || i.grp || i.unit))).size; t.items = items.length; t.edited = items.filter(i => i.edited).length;
  const now = new Date().toISOString(), data = { year: y, months: MS, from: fr, to, asof, items, total_left: D.total_left && typeof D.total_left === 'object' ? D.total_left : {}, can_plan: false, captured_at: D.captured_at || now, saved_at: now, frozen_at: submit ? now : null };
  let p, first = '';
  if (b.id) { p = await ypHead(db, b.id); if (!ypEdit(user, p)) bad(`Bản kế hoạch đang «${YP_ST[p.status]}» — không sửa được${p.status === 'da_duyet' ? ' (tạo phiên bản điều chỉnh)' : ''}`); }
  else if (b.kind === 'ver') { const s0 = await ypHead(db, b.base_id), vs = await db.q('SELECT version, status FROM kd_year_plan WHERE root_id = $1', [s0.root_id]), mx = Math.max(...vs.map(v => v.version));
    if (s0.status !== 'da_duyet' || s0.version !== mx || vs.some(v => ['nhap', 'yeu_cau_sua', 'cho_duyet'].includes(v.status))) bad('Chỉ tạo phiên bản điều chỉnh từ phiên bản đã duyệt mới nhất (không có phiên bản khác đang lập / chờ duyệt)');
    p = await db.one(`INSERT INTO kd_year_plan (code, name, year, from_on, to_on, project_id, asof, version, root_id, status, created_by, hist) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'nhap', $10, '[]') RETURNING *`,
      [s0.code, name, y, fr, to, pid, asof, mx + 1, s0.root_id, user.id]); first = `Tạo phiên bản điều chỉnh từ v${s0.version}`; }
  else { const n = (await db.one(`INSERT INTO kd_counter (prefix, n) VALUES ($1, 1) ON CONFLICT (prefix) DO UPDATE SET n = kd_counter.n + 1 RETURNING n`, ['KHDT-' + y])).n;
    p = await db.one(`INSERT INTO kd_year_plan (code, name, year, from_on, to_on, project_id, asof, version, status, created_by, hist) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'nhap', $8, '[]') RETURNING *`,
      [`KHDT-${y}-${String(n).padStart(3, '0')}`, name, y, fr, to, pid, asof, user.id]);
    await db.q('UPDATE kd_year_plan SET root_id = id WHERE id = $1', [p.id]); p.root_id = p.id;
    if (b.kind === 'copy' && b.base_id) { const s0 = await db.one('SELECT code, version FROM kd_year_plan WHERE id = $1', [+b.base_id]); first = s0 ? `Tạo bản sao từ ${s0.code} v${s0.version}` : ''; } }
  const hist = [...(p.hist || [])], ed = t.edited ? ` · ${t.edited} dòng đã chỉnh` : '';
  if (first) hist.push(ypH(user, first, ''));
  hist.push(ypH(user, submit ? (b.id ? 'Trình duyệt' : 'Lập và trình duyệt') : b.id ? 'Sửa — lưu nháp' : 'Lập — lưu nháp', `Kỳ ${C.dmy(fr)} – ${C.dmy(to)} · chốt công nợ ${C.dmy(asof)} · KH trong kỳ ${Math.round(t.all).toLocaleString('vi-VN')}${ed}${submit ? ' — chốt số liệu' : ''}`));
  const st = submit ? 'cho_duyet' : p.status === 'yeu_cau_sua' ? 'yeu_cau_sua' : 'nhap';
  const x = await db.one(`UPDATE kd_year_plan SET name = $2, note = $3, asof = $4, approver_id = $5, status = $6, hist = $7, updated_by = $8, updated_at = now(), year = $9, from_on = $10, to_on = $11, project_id = $12, data = $13, totals = $14${submit ? ', submitted_by = $8, submitted_at = now()' : ''} WHERE id = $1 RETURNING id, code, version, status`,
    [p.id, name, note, asof, apr, st, JSON.stringify(hist), user.id, y, fr, to, pid, JSON.stringify(data), JSON.stringify(t)]);
  await C.audit(db, 'year_plan', x.id, b.id ? 'update' : 'create', null, { code: x.code, version: x.version, status: st }, user, hist[hist.length - 1].act);
  return { id: x.id, code: x.code, version: x.version, status: st, status_l: YP_ST[st], msg: `Đã lưu ${x.code} · phiên bản ${x.version} · trạng thái «${YP_ST[st]}»${submit ? ' — số liệu đã chốt, chờ duyệt' : ''}` };
}
async function ypDecide(db, user, id, b) {
  const p = await ypHead(db, id); if (!ypDecider(user, p)) bad(p.status === 'cho_duyet' ? 'Bạn không phải người duyệt của bản kế hoạch này' : `Bản kế hoạch đang «${YP_ST[p.status]}»`);
  const ok = !!b.ok, cm = String(b.comment || '').trim().slice(0, 2000); if (!ok && !cm) bad('Nhập ý kiến yêu cầu chỉnh sửa');
  const hist = [...(p.hist || []), ypH(user, ok ? 'Phê duyệt' : 'Yêu cầu chỉnh sửa', cm)];
  await db.q(`UPDATE kd_year_plan SET status = $2, decided_by = $3, decided_at = now(), decide_note = $4, hist = $5, updated_at = now() WHERE id = $1`, [p.id, ok ? 'da_duyet' : 'yeu_cau_sua', user.id, cm, JSON.stringify(hist)]);
  if (ok) for (const o of await db.q("SELECT id, hist FROM kd_year_plan WHERE root_id = $1 AND id <> $2 AND status = 'da_duyet'", [p.root_id, p.id]))
    await db.q("UPDATE kd_year_plan SET status = 'thay_the', hist = $2 WHERE id = $1", [o.id, JSON.stringify([...(o.hist || []), ypH(user, 'Đã thay thế', `Phiên bản v${p.version} được duyệt`)])]);
  await C.audit(db, 'year_plan', p.id, ok ? 'approve' : 'reject', { status: p.status }, { status: ok ? 'da_duyet' : 'yeu_cau_sua' }, user, cm);
  return { msg: `${p.code} v${p.version}: ${ok ? 'đã phê duyệt — là kế hoạch chính thức' : 'đã yêu cầu chỉnh sửa'}` };
}
async function ypNewVer(db, user, id) {
  const p = await ypHead(db, id), g = await ypGet(db, user, id); if (!g.can.newver) bad('Chỉ tạo phiên bản mới từ phiên bản đã duyệt mới nhất (không có phiên bản khác đang lập / chờ duyệt)');
  const v = (await db.one('SELECT max(version) v FROM kd_year_plan WHERE root_id = $1', [p.root_id])).v + 1, cap = await ypCapture(db, user, { ...p, asof: today() });
  const x = await db.one(`INSERT INTO kd_year_plan (code, name, year, from_on, to_on, project_id, asof, version, root_id, status, approver_id, note, data, totals, created_by, hist)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'nhap', $10, $11, $12, $13, $14, $15) RETURNING id`, [p.code, p.name, p.year, p.from_on, p.to_on, p.project_id, today(), v, p.root_id, p.approver_id, p.note,
    JSON.stringify(cap.data), JSON.stringify(cap.totals), user.id, JSON.stringify([ypH(user, `Tạo phiên bản mới từ v${p.version}`, 'Số liệu nguồn lấy lại tại ngày chốt công nợ ' + C.dmy(today()))])]);
  await C.audit(db, 'year_plan', x.id, 'create', null, { code: p.code, version: v }, user, `Phiên bản mới từ v${p.version}`);
  return { id: x.id, msg: `${p.code}: đã tạo phiên bản v${v} (nháp)` };
}
async function ypDel(db, user, id) { const p = await ypHead(db, id); if (!(p.status === 'nhap' && ypEdit(user, p) && !p.submitted_at)) bad('Chỉ xóa được bản nháp chưa trình duyệt');
  await db.q('DELETE FROM kd_year_plan WHERE id = $1', [p.id]); await C.audit(db, 'year_plan', p.id, 'delete', { code: p.code, version: p.version }, null, user, 'Xóa bản nháp'); return { msg: `Đã xóa bản nháp ${p.code} v${p.version}` }; }
// 17/11/2026: CĂN ĐỦ ĐIỀU KIỆN LẬP KẾ HOẠCH BÁN MỚI — chưa có HĐ bán (HĐMB / thuê mua / HĐ thuê – vay bán căn) còn hiệu lực;
// căn trạng thái có thể bán (chưa mở bán / còn bán / giữ chỗ / đặt cọc) hoặc đang cho thuê (ghi «Đang cho thuê – HĐ số …»); căn đã có kế hoạch bán mới còn hiệu lực: báo, không chọn lại
const SALE_LIVE = "c.status NOT IN ('huy','thanh_ly') AND (c.kind IN ('hdmb','thue_mua') OR (c.kind IN ('thue','vay') AND c.nature = 'ban'))";
async function saleUnits(db, user, f) {
  if (!can(user, E.collect_plan, 'r')) deny();
  const p = [], w = [];
  if (f.project) { p.push(+f.project); w.push(`u.project_id = $${p.length}`); } if (f.building) { p.push(+f.building); w.push(`u.building_id = $${p.length}`); }
  if (!w.length) bad('Chọn dự án');
  const us = await db.q(`SELECT u.id, u.code, u.status, u.area_tt, u.total_price, u.list_price, u.maint_fee, u.floor, pr.code project, pr.id project_id, b.code building, b.id building_id,
      (SELECT c.number || ' (' || c.status || ')' FROM kd_contract c WHERE c.unit_id = u.id AND ${SALE_LIVE} ORDER BY c.id DESC LIMIT 1) sale_ct,
      (SELECT c.number FROM kd_contract c WHERE c.unit_id = u.id AND c.kind = 'thue' AND coalesce(c.nature, 'thue') <> 'ban' AND c.status NOT IN ('huy','thanh_ly') AND coalesce(c.exp_on, 'infinity'::date) >= current_date ORDER BY c.id DESC LIMIT 1) rent_ct,
      (SELECT string_agg(DISTINCT x.month, ', ') FROM kd_collect_plan x WHERE x.unit_id = u.id AND x.scope = 'moi' AND x.status NOT IN ('thay_the','dong','tu_choi','da_chot')) moi_plan
    FROM kd_unit u JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id WHERE ${w.join(' AND ')} ORDER BY b.code, u.code`, p);
  const ST = Object.fromEntries(E.unit.fields.find(x => x.k === 'status').o.map(o => [o[0], o[1]]));
  return { units: us.map(u => { const free = ['chua_mo_ban', 'con_ban', 'giu_cho', 'da_coc'].includes(u.status);
    const ok = !u.sale_ct && !u.moi_plan && (free || !!u.rent_ct);
    return { id: u.id, code: u.code, project: u.project, project_id: u.project_id, building: u.building, building_id: u.building_id, area: u.area_tt != null ? +u.area_tt : null, price: +(u.total_price || u.list_price || 0) || null, hd_value: +u.total_price > 0 ? Math.round(+u.total_price) : null, maint: +u.maint_fee > 0 && +u.maint_fee < +u.total_price ? Math.round(+u.maint_fee) : 0,
      status_l: ST[u.status] || u.status, ok, rent: !!u.rent_ct, note: u.sale_ct ? `Đã có HĐ bán ${u.sale_ct}` : u.moi_plan ? `Đã có kế hoạch bán mới (tháng ${u.moi_plan})` : u.rent_ct ? `Đang cho thuê – HĐ số ${u.rent_ct}` : free ? ST[u.status] || '' : `Trạng thái «${ST[u.status] || u.status}» — chưa thể bán` }; }) };
}
// 17/11/2026: LỊCH THU GỢI Ý CỦA 1 CĂN theo chính sách bán đang áp dụng (đã ban hành) — giá trị dự kiến bán, các đợt (nội dung, mốc tính, tỷ lệ, số tiền, tháng thu):
// tiền căn hộ = giá − phí bảo trì − hoàn thiện; đợt «sau ký N ngày» = ngày ký (đầu tháng bán) + N; đợt bàn giao: theo kế hoạch bàn giao của căn (nếu có) + số ngày;
// đợt Giấy chứng nhận / chưa xác định được → «Chưa phân bổ kỳ» (không tự gán tháng); phí bảo trì, hoàn thiện / nội thất là nhóm riêng (không cộng vào cơ sở tính tỷ lệ)
async function saleUnitSched(db, user, f) {
  if (!can(user, E.collect_plan, 'r')) deny();
  const u = await db.one('SELECT * FROM kd_unit WHERE id = $1', [+f.unit_id]); if (!u) bad('Không tìm thấy căn');
  const sm = /^\d{4}-\d{2}$/.test(f.sale_month || '') ? f.sale_month : today().slice(0, 7), sign = `${sm}-01`;
  const pr = await B.pricing(db, u, today()), price = Math.round(+pr.price || +u.total_price || +u.list_price || 0);
  // tiến độ thu: chính sách giá áp cho căn; chưa khai tiến độ thì lấy chính sách bán đã ban hành gần nhất của dự án có khai tiến độ (như khi lập hợp đồng) — ghi rõ nguồn
  let pol = pr.policy, src = pol ? `${pol.code} v${pol.version}` : null;
  if (!pol?.pay_sched?.length) { const alt = await db.one("SELECT * FROM kd_price_policy WHERE status = 'phat_hanh' AND coalesce(pkind, 'ban') = 'ban' AND jsonb_array_length(coalesce(pay_sched, '[]'::jsonb)) > 0 AND $1 = ANY(project_ids) ORDER BY id DESC LIMIT 1", [u.project_id]);
    if (alt) { src = `${alt.code} v${alt.version}${pol ? ` (tiến độ — chính sách giá ${pol.code} v${pol.version} chưa khai tiến độ thu)` : ' (tiến độ)'}`; pol = alt; } }
  const maint = Math.round(+u.maint_fee || 0), fin = Math.round(+u.finish_value || 0), base = Math.max(0, price - maint - fin);
  const rows = [];
  if (pol?.pay_sched?.length) {
    const sr = await B.saleSchedRows(db, pol, u.id, sign), hp = u.handover_plan ? ddDay(u.handover_plan) : null;
    for (const r of sr) {
      let on = r.due_on ? ddDay(r.due_on) : null;
      if (!on && r.bg && hp) on = addDays(hp, +(r.bg_days || 0));
      const mile = r.maint ? 'Cùng đợt thu phí bảo trì theo chính sách' : r.gcn ? 'Cấp Giấy chứng nhận' : r.bg ? 'Bàn giao căn hộ' : r.sign_days ? `Sau ký ${r.sign_days} ngày` : 'Ký hợp đồng';
      rows.push(r.maint ? { name: r.name, grp: 'maint', mile, pct: null, amount: maint, month: on ? on.slice(0, 7) : null }
        : { name: r.name, grp: 'house', mile, pct: r.pct != null ? +r.pct : null, amount: r.pct != null ? Math.round(base * +r.pct / 100) : Math.round(+r.amount || 0), month: on ? on.slice(0, 7) : null });
    }
    if (fin > 0) for (const [i, x] of (Array.isArray(pol.fin_sched) ? pol.fin_sched : []).filter(x => +x.pct > 0).entries()) {
      const has = x.days != null && x.days !== '', on = has || !i ? addDays(sign, +x.days || 0) : null;
      rows.push({ name: x.name || `Đợt hoàn thiện ${i + 1}`, grp: 'fin', mile: has ? (+x.days ? `Sau ký ${+x.days} ngày` : 'Ký hợp đồng') : i ? 'Mốc riêng — chưa xác định' : 'Ký hợp đồng', pct: +x.pct, amount: Math.round(fin * +x.pct / 100), month: on ? on.slice(0, 7) : null });
    }
  }
  return { unit_id: u.id, unit: u.code, area: u.area_tt != null ? +u.area_tt : null, sale_month: sm, policy: src, price, base, maint, fin, rows };
}
// lưu kế hoạch thu bán mới theo căn: mỗi căn = 1 nhóm (grp_key), mỗi tháng thu 1 khoản kế hoạch (tỷ lệ % × giá trị dự kiến bán); phần chưa phân bổ = «Chưa phân bổ kỳ»
async function saleUnitPlan(db, user, b) {
  if (!can(user, E.collect_plan, 'c')) deny('Bạn không được lập kế hoạch thu');
  const L = Array.isArray(b.units) ? b.units : []; if (!L.length) bad('Chọn ít nhất 1 căn');
  const ids = L.map(x => +x.unit_id); if (new Set(ids).size !== ids.length) bad('Một căn được chọn 2 lần');
  const chk = new Map((await saleUnits(db, user, { project: (await db.one('SELECT project_id FROM kd_unit WHERE id = $1', [ids[0]]))?.project_id })).units.map(u => [u.id, u]));
  let n = 0, total = 0;
  for (const [i, x] of L.entries()) {
    const u = chk.get(+x.unit_id) || (await saleUnits(db, user, { project: (await db.one('SELECT project_id FROM kd_unit WHERE id = $1', [+x.unit_id]))?.project_id })).units.find(z => z.id === +x.unit_id);
    if (!u) bad(`Dòng ${i + 1}: không tìm thấy căn`); if (!u.ok) bad(`Căn ${u.code}: ${u.note || 'không đủ điều kiện lập kế hoạch bán mới'}`);
    // 17/11/2026: giá trị dự kiến bán = «Giá trị HĐ» (Tổng giá căn hộ) trong Danh mục sản phẩm — không lấy chính sách bán hàng, thiếu thì không lập (không mặc định 0)
    const value = u.hd_value; if (!(value > 0)) bad(`Căn ${u.code}: chưa có giá trị hợp đồng trong danh mục sản phẩm`);
    // tiền từng đợt: nhập theo số tiền (by = amt) giữ đúng số tiền, tỷ lệ suy ra; nhập theo tỷ lệ → số tiền = Giá trị HĐ × tỷ lệ
    const mt = u.maint || 0, base = value - mt;   // 17/11/2026: phí bảo trì là dòng riêng, không nằm trong cơ sở tính tỷ lệ các đợt
    if (Array.isArray(x.items)) x.items = x.items.map(z => z.grp === 'maint' ? { ...z, amount: mt, pct: null } : z.by === 'amt' && +z.amount > 0 ? { ...z, amount: Math.round(+z.amount), pct: Math.round(+z.amount / base * 1e6) / 1e4 } : z.pct != null && z.pct !== '' ? { ...z, amount: Math.round(base * +z.pct / 100) } : z).filter(z => z.grp !== 'maint' || mt > 0);
    const sm = /^\d{4}-\d{2}$/.test(x.sale_month || '') ? x.sale_month : bad(`Căn ${u.code}: chọn tháng/năm dự kiến bán`);
    // 17/11/2026: lịch thu riêng từng căn theo đợt (items: tên đợt, nhóm, tháng thu | trống = chưa phân bổ kỳ, tỷ lệ, số tiền) — ưu tiên hơn lịch % kiểu cũ
    if (Array.isArray(x.items) && x.items.length) {
      const its = x.items.map(z => { const dt = isoDay(z.date); return { name: String(z.name || '').trim() || 'Đợt thu', grp: z.grp === 'maint' ? 'maint' : 'house', date: dt, month: dt ? dt.slice(0, 7) : /^\d{4}-\d{2}$/.test(z.month || '') ? z.month : null, pct: z.pct != null && z.pct !== '' ? +z.pct : null, amount: Math.round(+z.amount || 0) }; }).filter(z => z.amount > 0);
      { const hs = its.filter(z => z.grp === 'house').reduce((a, z) => a + z.amount, 0); if (hs > base) bad(`Căn ${u.code}: tổng các đợt ${fmtMoney(hs)} vượt giá trị tính tỷ lệ ${fmtMoney(base)}${mt ? ' (Giá trị HĐ trừ phí bảo trì)' : ''}`); }
      for (const z of its) if (z.month && z.month < sm) bad(`Căn ${u.code}: «${z.name.slice(0, 40)}» thu tháng ${z.month.slice(5)}/${z.month.slice(0, 4)} trước tháng dự kiến bán`);
      const tot = its.reduce((a, z) => a + z.amount, 0); if (tot > value) bad(`Căn ${u.code}: tổng các đợt ${fmtMoney(tot)} vượt giá trị dự kiến bán ${fmtMoney(value)}`);
      const grp = `moiu:${u.id}:${Date.now().toString(36)}${i}`, un = its.filter(z => !z.month).reduce((a, z) => a + z.amount, 0) + (value - tot);
      for (const [k, z] of its.entries()) { if (!z.month) continue; const W = monthWeeks(z.month), wk = z.date ? W.find(w => w.from <= z.date && z.date <= w.to) : null;
        await C.create('collect_plan', { scope: 'moi', unit_id: u.id, project_id: u.project_id, building_id: u.building_id, title: z.name.slice(0, 200), units_n: 1, unit_price: value, rate: z.pct, sale_month: sm, month: z.month, plan_week: wk ? wk.n : 0,
          expected: z.amount, expected_on: wk ? wk.to : W[W.length - 1].to, owner_id: b.owner_id ? +b.owner_id : null, basis: 'khac', fund_src: 'khach_tu_tra', basis_note: [z.date ? `Ngày dự kiến thu ${C.dmy(z.date)}` : '', x.policy ? `Theo chính sách ${x.policy}` : '', String(x.note || '').trim(), String(b.note || '').trim()].filter(Boolean).join(' · ') || null,
          explain: 'Kế hoạch thu bán mới', grp_key: grp }, user, { db, system: true, note: `Kế hoạch thu bán mới căn ${u.code} (giá trị dự kiến bán ${fmtMoney(value)}, bán tháng ${sm.slice(5)}/${sm.slice(0, 4)}${x.policy ? ', chính sách ' + x.policy : ''}) — đợt ${k + 1}: ${z.name.slice(0, 80)} · thu tháng ${z.month.slice(5)}/${z.month.slice(0, 4)} · ${fmtMoney(z.amount)}${un > 0 ? ` (chưa phân bổ kỳ của căn ${fmtMoney(un)})` : ''}` }); n++; }
      total += value; continue;
    }
    const sched = (Array.isArray(x.sched) ? x.sched : []).map(z => ({ month: z.month, pct: +z.pct || 0 })).filter(z => z.pct > 0);
    for (const z of sched) { if (!/^\d{4}-\d{2}$/.test(z.month || '')) bad(`Căn ${u.code}: tháng thu không hợp lệ`); if (z.month < sm) bad(`Căn ${u.code}: tháng thu ${z.month.slice(5)}/${z.month.slice(0, 4)} trước tháng dự kiến bán`); }
    if (new Set(sched.map(z => z.month)).size !== sched.length) bad(`Căn ${u.code}: trùng tháng thu`);
    const tp = sched.reduce((s, z) => s + z.pct, 0); if (tp > 100.0001) bad(`Căn ${u.code}: tổng tỷ lệ thu ${tp}% vượt 100%`);
    if (!sched.length) bad(`Căn ${u.code}: thêm ít nhất 1 tháng thu`);
    const grp = `moiu:${u.id}:${Date.now().toString(36)}${i}`;
    for (const z of sched) { const W = monthWeeks(z.month), amt = Math.round(value * z.pct / 100); if (!(amt > 0)) continue;
      await C.create('collect_plan', { scope: 'moi', unit_id: u.id, project_id: u.project_id, building_id: u.building_id, title: u.code, units_n: 1, unit_price: value, rate: z.pct, sale_month: sm, month: z.month, plan_week: 0,
        expected: amt, expected_on: W[W.length - 1].to, owner_id: b.owner_id ? +b.owner_id : null, basis: 'khac', fund_src: 'khach_tu_tra', basis_note: [String(x.note || '').trim(), String(b.note || '').trim()].filter(Boolean).join(' · ') || null,
        explain: 'Kế hoạch thu bán mới', grp_key: grp }, user, { db, system: true, note: `Kế hoạch thu bán mới căn ${u.code}: giá trị dự kiến bán ${fmtMoney(value)}, bán tháng ${sm.slice(5)}/${sm.slice(0, 4)} — thu tháng ${z.month.slice(5)}/${z.month.slice(0, 4)} ${z.pct}% = ${fmtMoney(amt)}${tp < 100 ? ` (chưa phân bổ ${Math.round((100 - tp) * 100) / 100}%)` : ''}` }); n++; }
    total += value;
  }
  return { ok: true, msg: `Đã lập kế hoạch thu bán mới ${L.length} căn · tổng giá trị dự kiến bán ${fmtMoney(total)}đ · ${n} khoản thu theo tháng` };
}
// điều chỉnh kỳ (tháng / tuần), số tiền, người phụ trách ngay tại báo cáo — sửa tại chỗ, nhật ký ghi giá trị cũ → mới + lý do (lịch sử điều chỉnh)
// 17/11/2026: PHÂN BỔ TUẦN cho 1 khoản kế hoạch tháng — chia số tiền ra nhiều tuần của tháng (tổng các tuần = số tiền của khoản); khoản gốc giữ tuần đầu, các tuần còn lại tạo khoản mới
// cùng nhóm (grp_key / căn / HĐ / nguồn); lưu lịch sử phân bổ; tuần và tháng dùng chung dữ liệu, không cộng trùng
async function planSplitWeeks(db, user, id, b) {
  if (!(can(user, E.collect_plan, 'u') || can(user, E.collect_plan, 'c'))) deny();
  const x = await db.one('SELECT * FROM kd_collect_plan WHERE id = $1', [+id]); if (!x) bad('Không tìm thấy khoản kế hoạch');
  if (['thay_the', 'dong', 'tu_choi', 'da_chot'].includes(x.status)) bad('Khoản kế hoạch đã đóng / chốt kỳ — không phân bổ lại');
  const ym = String(x.month).slice(0, 7), W = monthWeeks(ym), tot = Math.round(+x.expected);
  const ws = (Array.isArray(b.weeks) ? b.weeks : []).map(w => ({ n: +w.n, amt: Math.round(+w.amount || 0) })).filter(w => w.amt > 0);
  if (!ws.length) bad('Nhập số tiền cho ít nhất 1 tuần');
  for (const w of ws) if (!W[w.n - 1]) bad(`Tuần ${w.n} không thuộc tháng ${ym.slice(5)}/${ym.slice(0, 4)}`);
  if (new Set(ws.map(w => w.n)).size !== ws.length) bad('Trùng tuần');
  const sum = ws.reduce((a, w) => a + w.amt, 0); if (sum !== tot) bad(`Tổng các tuần (${fmtMoney(sum)}) phải bằng số tiền kế hoạch của tháng (${fmtMoney(tot)})`);
  ws.sort((a, c) => a.n - c.n);
  const lbl = ws.map(w => `${periodL(ym, w.n)}: ${fmtMoney(w.amt)}`).join('; ');
  const [w0, ...rest] = ws;
  await C.sys(db, 'collect_plan', x.id, { plan_week: w0.n, expected: w0.amt, expected_on: W[w0.n - 1].to }, user, 'phan_bo_tuan', `Phân bổ tuần: ${lbl}`);
  const keep = ['contract_id', 'src_cts', 'src_key', 'scope', 'month', 'unit_id', 'customer_id', 'project_id', 'building_id', 'title', 'units_n', 'unit_price', 'rate', 'sale_month', 'grp_key', 'basis', 'basis_note', 'fund_src', 'owner_id', 'ability', 'explain'];
  for (const w of rest) await C.create('collect_plan', { ...Object.fromEntries(keep.map(k => [k, x[k]])), plan_week: w.n, expected: w.amt, expected_on: W[w.n - 1].to, explain: x.explain || 'Phân bổ tuần' }, user,
    { db, system: true, note: `Phân bổ tuần từ khoản #${x.id} (${periodL(ym, x.plan_week || 0)} · ${fmtMoney(tot)}): ${periodL(ym, w.n)} · ${fmtMoney(w.amt)}` });
  return { ok: true, msg: `Đã phân bổ ${fmtMoney(tot)}đ vào ${ws.length} tuần — ${lbl}` };
}
async function planAdjust(db, user, id, b) {
  if (!(can(user, E.collect_plan, 'u') || can(user, E.collect_plan, 'c'))) deny();
  const x = await db.one('SELECT * FROM kd_collect_plan WHERE id = $1', [+id]); if (!x) bad('Không tìm thấy khoản kế hoạch');
  if (['thay_the', 'dong', 'tu_choi', 'da_chot'].includes(x.status)) bad('Khoản kế hoạch đã đóng / thay thế — không điều chỉnh');
  const ym = /^\d{4}-\d{2}$/.test(b.month || '') ? b.month : bad('Chọn tháng / năm'), W = monthWeeks(ym), wk = +b.week || 0; if (wk && !W[wk - 1]) bad('Tuần không thuộc tháng đã chọn');
  const amt = +b.amount; if (!(amt > 0)) bad('Số tiền kế hoạch phải > 0');
  const owner = b.owner_id ? +b.owner_id : null, oldYm = String(x.month).slice(0, 7), oldWk = x.plan_week == null ? weekIn(oldYm, ddDay(x.expected_on)) : +x.plan_week || 0;
  const ch = [];
  if (ym !== oldYm || wk !== oldWk) ch.push(`kỳ ${periodL(oldYm, oldWk)} → ${periodL(ym, wk)}`);
  if (amt !== +x.expected) ch.push(`số tiền ${fmtMoney(x.expected)} → ${fmtMoney(amt)}`);
  if ((owner || null) !== (x.owner_id || null)) { const nm = async i => i ? (await db.one('SELECT full_name FROM kd_user WHERE id = $1', [i]))?.full_name || '#' + i : '(trống)'; ch.push(`người phụ trách ${await nm(x.owner_id)} → ${await nm(owner)}`); }
  if (!ch.length) return { ok: true, msg: 'Không có thay đổi' };
  await C.sys(db, 'collect_plan', x.id, { month: ym, plan_week: wk, expected_on: wk ? W[wk - 1].to : W[W.length - 1].to, expected: amt, owner_id: owner,
    ...(amt > (+x.debt_left || 0) && !x.explain ? { explain: 'Điều chỉnh tại Báo cáo kế hoạch thu' } : {}) }, user, 'dieu_chinh', `Điều chỉnh: ${ch.join('; ')}${b.reason ? ' · Lý do: ' + String(b.reason).slice(0, 300) : ''}`);
  return { ok: true, msg: 'Đã điều chỉnh: ' + ch.join('; ') };
}
// 17/11/2026: LỊCH SỬ THEO CĂN (Báo cáo công nợ đến hạn → Xem chi tiết) — tra theo mã căn, kể cả khi đã thu đủ / HĐ đã thanh lý:
//  · Lịch sử kế hoạch thu: mọi bản ghi nhật ký của các khoản kế hoạch của căn (lập / sửa kỳ / sửa số tiền / điều chỉnh / bỏ chọn / gỡ / chốt kỳ / tự chuyển tiếp) — mỗi lần 1 dòng riêng,
//    có nội dung trước → sau; khoản đã gỡ khỏi kế hoạch vẫn tra được qua nhật ký (bản ghi lập + bản ghi gỡ)
//  · Lịch sử nhắc nợ: mọi lần nhắc của các HĐ của căn (mỗi lần 1 bản ghi, không ghi đè) + các lần chỉnh sửa (trước → sau) nếu có
async function ddUnitHist(db, user, f) {
  if (!can(user, E.installment, 'r')) deny();
  const u = f.unit_id ? await db.one('SELECT id, code FROM kd_unit WHERE id = $1', [+f.unit_id]) : await db.one('SELECT id, code FROM kd_unit WHERE upper(code) = upper($1)', [String(f.code || '').trim()]);
  if (!u) bad('Không tìm thấy mã căn');
  const tab = ['ban', 'thue'].includes(f.tab) ? f.tab : null;
  const opt = (e, k) => Object.fromEntries(E[e].fields.find(x => x.k === k).o.map(o => [o[0], o[1]]));
  const PST = opt('collect_plan', 'status'), CH = opt('debt_call', 'channel'), CR = opt('debt_call', 'result'), KL = opt('contract', 'kind');
  const users = new Map((await db.q('SELECT id, full_name FROM kd_user')).map(x => [x.id, x.full_name]));
  // ---- kế hoạch thu
  const live = await db.q('SELECT id, scope, contract_id FROM kd_collect_plan WHERE unit_id = $1', [u.id]);
  // các khoản kế hoạch của căn: đang có + đã gỡ (nhận ra qua bản ghi lập / gỡ có mã căn) → lấy MỌI bản ghi nhật ký của các khoản đó (kể cả lần sửa kỳ trước khi gỡ)
  const recs = [...new Set([...live.map(x => x.id), ...(await db.q("SELECT DISTINCT rec_id FROM kd_audit WHERE ent = 'collect_plan' AND (after->>'unit_id' = $1 OR before->>'unit_id' = $1)", [String(u.id)])).map(x => x.rec_id)])];
  const aud = recs.length ? await db.q(`SELECT a.*, us.full_name who FROM kd_audit a LEFT JOIN kd_user us ON us.id = a.user_id WHERE a.ent = 'collect_plan' AND a.rec_id = ANY($1) ORDER BY a.at DESC, a.id DESC`, [recs]) : [];
  const meta = new Map(live.map(x => [x.id, { scope: x.scope, contract_id: x.contract_id }]));
  for (const a of [...aud].reverse()) { const j = { ...(a.before || {}), ...(a.after || {}) }; const m = meta.get(a.rec_id) || {}; meta.set(a.rec_id, { scope: m.scope || j.scope || null, contract_id: m.contract_id || j.contract_id || null }); }
  const stt = new Map(), perOf = new Map();   // kỳ của khoản sau mỗi lần ghi nhận (lần theo nhật ký từ cũ đến mới)
  for (const a of [...aud].reverse()) { const s0 = { ...(stt.get(a.rec_id) || {}), ...(a.before || {}) }, s1 = { ...s0, ...(a.after || {}) }; stt.set(a.rec_id, s1); perOf.set(a.id, a.action === 'xoa' ? s0 : s1); }
  const cts = new Map((await db.q('SELECT c.id, c.number, c.kind, c.status, k.full_name customer FROM kd_contract c JOIN kd_customer k ON k.id = c.customer_id WHERE c.unit_id = $1', [u.id])).map(x => [x.id, x]));
  const per = (m, w) => m ? periodL(String(m).slice(0, 7), +w || 0) : '';
  const money = v => v == null || v === '' ? '—' : fmtMoney(v) + 'đ';
  const PF = [['month', 'Tháng kế hoạch', v => v ? `${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '—'], ['plan_week', 'Tuần', v => +v ? 'Tuần ' + v : 'Chưa phân bổ tuần'], ['expected', 'Số tiền kế hoạch', money],
    ['expected_on', 'Ngày dự kiến', v => v ? C.dmy(ddDay(v)) : '—'], ['owner_id', 'Người phụ trách', v => v ? users.get(+v) || '#' + v : '—'], ['status', 'Trạng thái', v => PST[v] || v || '—'],
    ['act_snap', 'Thực thu lúc chốt', money], ['carry_amt', 'Đã chuyển tiếp', money], ['carry_to', 'Chuyển tiếp sang', v => v || '—'], ['basis_note', 'Ghi chú', v => v || '—']];
  const ACT = { tao: 'Đưa vào kế hoạch', sua_ky: 'Sửa kỳ / số tiền', dieu_chinh: 'Điều chỉnh kế hoạch', sua: 'Sửa kế hoạch', bo_chon: 'Bỏ khỏi kế hoạch (giữ phần đã thu)', xoa: 'Bỏ khỏi kế hoạch',
    chot_ky: 'Chốt kỳ — tự động chuyển tiếp', doi_lich: 'Chuyển lịch', lien_ket: 'Liên kết giao dịch bán mới', phan_bo_tuan: 'Phân bổ tuần', trinh_duyet: 'Trình duyệt', phe_duyet: 'Phê duyệt', tu_choi: 'Từ chối' };
  const plans = aud.filter(a => !tab || (meta.get(a.rec_id)?.scope || 'ban') === tab).map(a => { const b = a.before || {}, af = a.after || {}, m = meta.get(a.rec_id) || {}, c = cts.get(+m.contract_id);
    const auto = a.action === 'tao' && af.carry_in != null, full = a.action === 'tao' ? af : a.action === 'xoa' ? b : null;
    const changes = full ? [] : PF.filter(([k]) => k in af || k in b).filter(([k]) => String(b[k] ?? '') !== String(af[k] ?? '')).map(([k, l, fmt]) => ({ l, from: fmt(b[k]), to: fmt(af[k]) }));
    return { id: a.id, plan_id: a.rec_id, at: a.at, who: a.who || 'Hệ thống', act: auto ? 'Tự động chuyển tiếp — tạo kỳ mới' : a.action === 'tao' && af.scope === 'moi' ? 'Tạo dòng thu bán mới' : ACT[a.action] || a.action, action: a.action, scope: m.scope || 'ban',
      amount: full ? +full.expected || 0 : af.expected != null ? +af.expected : null, period: full ? per(full.month, full.plan_week) : per(perOf.get(a.id)?.month, perOf.get(a.id)?.plan_week),
      note: [a.note, full?.basis_note].filter(Boolean).filter((x, i, xs) => xs.indexOf(x) === i).join(' · '), changes, contract: c?.number || '', customer: c?.customer || '' }; });
  // ---- nhắc nợ
  const calls = await db.q(`SELECT d.*, c.number, c.kind, c.status c_status, k.full_name customer, us.full_name who FROM kd_debt_call d JOIN kd_contract c ON c.id = d.contract_id JOIN kd_customer k ON k.id = c.customer_id
    LEFT JOIN kd_user us ON us.id = d.created_by WHERE c.unit_id = $1 ORDER BY d.at DESC, d.id DESC`, [u.id]);
  const ced = calls.length ? await db.q(`SELECT a.*, us.full_name who FROM kd_audit a LEFT JOIN kd_user us ON us.id = a.user_id WHERE a.ent = 'debt_call' AND a.rec_id = ANY($1) AND a.action <> 'tao' ORDER BY a.at DESC`, [calls.map(x => x.id)]) : [];
  const CF = [['at', 'Ngày giờ', v => v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'], ['channel', 'Hình thức', v => CH[v] || v || '—'], ['result', 'Kết quả', v => CR[v] || v || '—'],
    ['content', 'Nội dung', v => v || '—'], ['feedback', 'Phản hồi', v => v || '—'], ['promise_amount', 'Số tiền cam kết', money], ['promise_on', 'Ngày cam kết', v => v ? C.dmy(ddDay(v)) : '—'],
    ['next_on', 'Lịch hẹn tiếp', v => v ? C.dmy(ddDay(v)) : '—'], ['note', 'Ghi chú', v => v || '—']];
  // nhắc nợ: mọi lần nhắc của các HĐ của căn (1 lần nhắc có thể về cả tiến độ HĐMB trên HĐ thuê) — không tách theo sheet, ghi rõ hợp đồng
  const callRows = calls.map(x => ({ id: x.id, at: x.at, who: x.who || 'Hệ thống', channel: CH[x.channel] || x.channel || '', result: CR[x.result] || x.result || '',
    content: x.content || '', feedback: x.feedback || '', contact: x.contact_person || '', promise_amount: x.promise_amount != null ? +x.promise_amount : null, promise_on: x.promise_on ? ddDay(x.promise_on) : null,
    next_on: x.next_on ? ddDay(x.next_on) : null, note: x.note || '', contract: x.number, kind_l: KL[x.kind] || x.kind, customer: x.customer, closed: x.c_status === 'thanh_ly',
    edits: ced.filter(a => a.rec_id === x.id).map(a => ({ at: a.at, who: a.who || 'Hệ thống', changes: CF.filter(([k]) => k in (a.after || {}) || k in (a.before || {})).filter(([k]) => String(a.before?.[k] ?? '') !== String(a.after?.[k] ?? '')).map(([k, l, fmt]) => ({ l, from: fmt(a.before?.[k]), to: fmt(a.after?.[k]) })) })) }));
  return { unit: u.code, unit_id: u.id, tab, plans, calls: callRows, customers: [...new Set([...cts.values()].map(c => c.customer))] };
}
// 17/11/2026: TẠO DÒNG THU BÁN MỚI — tháng, dự án, tòa, nội dung, số căn dự kiến bán, số tiền; phân bổ nhiều tuần (tổng các tuần = kế hoạch tháng) hoặc «Chưa phân bổ tuần» (không tự chia đều);
// mỗi tuần 1 khoản kế hoạch cùng nhóm grp_key → báo cáo tuần / tháng dùng chung dữ liệu, không cộng trùng; chưa cần căn / khách hàng
// 17/11/2026 (bản nhiều dòng): mỗi dòng = dự án, tòa, số căn dự kiến bán, đơn giá bình quân, tỷ lệ dự kiến thu (%), tổng dự kiến thu (= số căn × đơn giá × tỷ lệ, cho sửa theo số thực tế);
// phân bổ tuần nhập cho tổng tháng (tổng các tuần = tổng các dòng) → chia cho từng dòng theo tỷ trọng tổng dự kiến thu của dòng (dòng cuối nhận phần làm tròn); mỗi dòng 1 nhóm grp_key
async function salePlanCreate(db, user, b) {
  if (!can(user, E.collect_plan, 'c')) deny('Bạn không được lập kế hoạch thu');
  const ym = /^\d{4}-\d{2}$/.test(b.month || '') ? b.month : bad('Chọn tháng / năm kế hoạch'), W = monthWeeks(ym), title0 = String(b.title || '').trim();
  const L = (Array.isArray(b.lines) && b.lines.length ? b.lines : [{ project_id: b.project_id, building_id: b.building_id, units_n: b.units_n, amount: b.amount }])
    .map(x => ({ project_id: +x.project_id || null, building_id: +x.building_id || null, units_n: x.units_n ? +x.units_n : null, unit_price: x.unit_price ? +x.unit_price : null, rate: x.rate != null && x.rate !== '' ? +x.rate : null, amount: Math.round(+x.amount || 0) }));
  if (!L.length) bad('Thêm ít nhất 1 dòng kế hoạch');
  for (const [i, x] of L.entries()) { if (!x.project_id) bad(`Dòng ${i + 1}: chọn dự án`); if (!(x.amount > 0)) bad(`Dòng ${i + 1}: tổng dự kiến thu phải > 0`);
    if (x.rate != null && (x.rate <= 0 || x.rate > 100)) bad(`Dòng ${i + 1}: tỷ lệ dự kiến thu phải trong 0 – 100%`);
    if (x.building_id && !(await db.one('SELECT 1 FROM kd_building WHERE id = $1 AND project_id = $2', [x.building_id, x.project_id]))) bad(`Dòng ${i + 1}: tòa không thuộc dự án đã chọn`); }
  const total = L.reduce((t, x) => t + x.amount, 0);
  const ws = (Array.isArray(b.weeks) ? b.weeks : []).map(x => ({ n: +x.n, amt: Math.round(+x.amount || 0) })).filter(x => x.amt > 0);
  for (const x of ws) if (!W[x.n - 1]) bad(`Tuần ${x.n} không thuộc tháng đã chọn`);
  if (ws.length && ws.reduce((t, x) => t + x.amt, 0) !== total) bad(`Tổng phân bổ tuần (${fmtMoney(ws.reduce((t, x) => t + x.amt, 0))}) phải bằng tổng kế hoạch tháng (${fmtMoney(total)})`);
  const PJ = new Map((await db.q('SELECT id, code FROM kd_project')).map(x => [x.id, x.code])), BD = new Map((await db.q('SELECT id, code FROM kd_building')).map(x => [x.id, x.code]));
  // chia tuần cho từng dòng theo tỷ trọng; mỗi tuần: các dòng trước làm tròn xuống, dòng cuối = phần còn lại của tuần → tổng từng tuần và tổng tháng giữ đúng (lệch làm tròn giữa các dòng ≤ vài đồng)
  const split = ws.length ? L.map(() => ws.map(() => 0)) : null;
  if (split) { ws.forEach((w, j) => { let left = w.amt; L.forEach((x, i) => { const v = i === L.length - 1 ? left : Math.floor(w.amt * x.amount / total); split[i][j] = v; left -= v; }); }); }
  let n = 0;
  for (const [i, x] of L.entries()) {
    const grp = `moi:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${i}`, lbl = `${PJ.get(x.project_id) || ''}${x.building_id ? ' · Tòa ' + BD.get(x.building_id) : ''}`;
    const title = `${title0 || 'Thu bán mới'}${x.units_n ? ` — ${x.units_n} căn` : ''}`;
    const base = { scope: 'moi', month: ym, project_id: x.project_id, building_id: x.building_id, title, units_n: x.units_n, unit_price: x.unit_price, rate: x.rate,
      owner_id: b.owner_id ? +b.owner_id : null, basis: 'khac', fund_src: 'khach_tu_tra', basis_note: String(b.note || '').trim() || null, explain: 'Kế hoạch thu bán mới', grp_key: grp };
    const recs = split ? ws.map((w, j) => ({ ...base, plan_week: w.n, expected: split[i][j], expected_on: W[w.n - 1].to })).filter(r => r.expected > 0) : [{ ...base, plan_week: 0, expected: x.amount, expected_on: W[W.length - 1].to }];
    for (const r of recs) { await C.create('collect_plan', r, user, { db, system: true, note: `Tạo dòng thu bán mới «${title}» (${lbl}${x.units_n && x.unit_price ? ` · ${x.units_n} căn × ${fmtMoney(x.unit_price)}${x.rate != null ? ` × ${x.rate}%` : ''}` : ''}) — ${periodL(ym, r.plan_week)} · ${fmtMoney(r.expected)}` }); n++; }
  }
  return { ok: true, msg: `Đã tạo ${L.length} dòng thu bán mới · tổng ${fmtMoney(total)}đ${ws.length ? ` · phân bổ ${ws.length} tuần` : ' · chưa phân bổ tuần'}` };
}
// liên kết dòng thu bán mới với giao dịch thực tế: căn (bắt buộc), hợp đồng (không bắt buộc — có thì khách hàng theo HĐ); áp dụng cho mọi khoản còn hiệu lực cùng nhóm; lưu lịch sử
async function planLink(db, user, id, b) {
  if (!(can(user, E.collect_plan, 'u') || can(user, E.collect_plan, 'c'))) deny();
  const x = await db.one('SELECT * FROM kd_collect_plan WHERE id = $1', [+id]); if (!x) bad('Không tìm thấy khoản kế hoạch'); if (x.scope !== 'moi') bad('Chỉ liên kết được dòng thu bán mới');
  const u = b.unit_id ? await db.one('SELECT id, code, project_id, building_id FROM kd_unit WHERE id = $1', [+b.unit_id]) : await db.one('SELECT id, code, project_id, building_id FROM kd_unit WHERE upper(code) = upper($1)', [String(b.unit_code || '').trim()]);
  if (!u) bad('Không tìm thấy mã căn'); if (x.project_id && u.project_id !== x.project_id) bad('Căn không thuộc dự án của dòng kế hoạch');
  const c = b.contract_id ? await db.one('SELECT id, number, unit_id, customer_id FROM kd_contract WHERE id = $1', [+b.contract_id]) : String(b.contract_number || '').trim() ? (await db.one('SELECT id, number, unit_id, customer_id FROM kd_contract WHERE upper(number) = upper($1) AND unit_id = $2', [String(b.contract_number).trim(), u.id]) || bad('Không tìm thấy hợp đồng này của căn')) : null; if (b.contract_id && (!c || c.unit_id !== u.id)) bad('Hợp đồng không thuộc căn đã chọn');
  const rows = await db.q("SELECT * FROM kd_collect_plan WHERE status NOT IN ('thay_the','dong','tu_choi','da_chot') AND (id = $1 OR (grp_key IS NOT NULL AND grp_key = $2))", [x.id, x.grp_key]);
  for (const r of rows) await C.sys(db, 'collect_plan', r.id, { unit_id: u.id, contract_id: c?.id || null, customer_id: c?.customer_id || (b.customer_id ? +b.customer_id : null), building_id: u.building_id },
    user, 'lien_ket', `Liên kết giao dịch: căn ${u.code}${c ? ' · HĐ ' + c.number : ''}`);
  return { ok: true, msg: `Đã liên kết ${rows.length} khoản kế hoạch với căn ${u.code}${c ? ' · HĐ ' + c.number : ''}` };
}
// 17/11/2026: XEM CHI TIẾT CÔNG NỢ 1 CĂN (Báo cáo công nợ đến hạn) — mỗi hợp đồng 1 khối: thông tin HĐ, tổng quan (phải thu, đã thu, tỷ lệ, còn phải thu, quá hạn, lãi),
// tiến độ đầy đủ mọi đợt (đã thu / đến hạn / quá hạn / chưa đến hạn; phí bảo trì dòng riêng) theo đúng nguồn của báo cáo (tiến độ HĐMB dùng chung HĐ thuê ↔ HĐ vay chỉ 1 lần, ghi nguồn);
// lịch sử thu – chi có phân bổ vào đợt (phiếu chỉ định đợt trước, phần còn lại phân bổ lần lượt theo hạn như cách tính công nợ); danh sách mọi HĐ của căn (kể cả đã thanh lý / hủy)
async function ddUnitDetail(db, user, f) {
  if (!can(user, E.installment, 'r')) deny();
  const uid = +f.unit_id; if (!uid) bad('Thiếu mã căn'); const t = isoDay(f.to) || today(), tab = ['ban', 'thue'].includes(f.tab) ? f.tab : null;
  const dd = await dueDebt(db, user, { unit_id: uid, to: t, all: 1 });
  const opt = (e, k) => Object.fromEntries(E[e].fields.find(x => x.k === k).o.map(o => [o[0], o[1]]));
  const KL = opt('contract', 'kind'), SL = opt('contract', 'status');
  const cs = await db.q(`SELECT c.*, k.full_name customer, coalesce(c.b_phone, k.phone) phone, u.code unit, pr.name project, b.code building, own.full_name owner_l FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id
    JOIN kd_customer k ON k.id = c.customer_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id LEFT JOIN kd_user own ON own.id = c.owner_id WHERE c.unit_id = $1 ORDER BY c.signed_on NULLS LAST, c.id`, [uid]);
  const rowsOf = cid => dd.rows.filter(r => r.contract_id === cid && (r.dir === 'tra' || !tab || ddTab(r) === tab));
  const live = cs.filter(c => rowsOf(c.id).length);
  const D = await B.debtOf(db, live.map(c => c.id), t);
  // phiếu thu: phân bổ vào đợt — phần chỉ định đợt trước, phần còn lại lần lượt theo hạn (giống cách tính công nợ)
  const RC = live.length ? await db.q(`SELECT r.*, i.name inst_name FROM kd_receipt r LEFT JOIN kd_installment i ON i.id = r.installment_id WHERE r.contract_id = ANY($1) ORDER BY r.voucher_date, r.id`, [live.map(c => c.id)]) : [];
  const PM = live.length ? await db.q(`SELECT p.*, l.seq lp_seq, l.kind lp_kind FROM kd_payment p LEFT JOIN kd_loan_pay l ON l.id = p.loan_pay_id WHERE p.contract_id = ANY($1) ORDER BY p.voucher_date, p.id`, [live.map(c => c.id)]) : [];
  const alloc = new Map();
  for (const c of live) { const inst = (D.get(c.id)?.inst || []).map(i => ({ ...i, got: 0 })), no = new Map(); let k0 = 0; for (const i of [...inst].sort((x, y) => x.seq - y.seq)) if (!i.is_maint) no.set(i.id, ++k0);
    const lab = i => i.is_maint ? 'Phí bảo trì' : `${c.kind === 'vay' ? 'Đợt gốc' : c.kind === 'thue' ? 'Kỳ' : 'Đợt'} ${no.get(i.id)}`, out = [];
    const rs = RC.filter(r => r.contract_id === c.id && r.status === 'hop_le' && ddDay(r.voucher_date) <= t);
    for (const r of rs) { const a = []; let rest = +r.amount; const tg = r.installment_id && inst.find(i => i.id === r.installment_id);
      if (tg) { const k = Math.min(rest, +tg.amount - tg.got); if (k > 0) { tg.got += k; rest -= k; a.push([lab(tg), k]); } } out.push([r, a, rest]); }
    for (const [r, a, rest0] of out) { let rest = rest0; for (const i of inst) { if (rest <= 0) break; const k = Math.min(rest, +i.amount - i.got); if (k > 0) { i.got += k; rest -= k; a.push([lab(i), k]); } } if (rest > 0) a.push(['Thu dư (chưa phân bổ)', rest]); alloc.set(r.id, a); } }
  const RST = opt('receipt', 'status'), PST = Object.fromEntries((E.payment?.fields.find(x => x.k === 'status')?.o || []).map(o => [o[0], o[1]]));
  const ST = { da_thu: 'Đã thanh toán', qua_han: 'Quá hạn', den_han: 'Đến hạn hôm nay', mot_phan: 'Thu một phần', chua_den_han: 'Chưa đến hạn' };
  const blocks = live.map(c => { const xs = rowsOf(c.id).sort((a, b) => (a.dir === b.dir ? 0 : a.dir === 'thu' ? -1 : 1) || String(a.due_on).localeCompare(String(b.due_on)) || (a.maint ? 1 : 0) - (b.maint ? 1 : 0));
    const thu = xs.filter(r => r.dir === 'thu'), tra = xs.filter(r => r.dir === 'tra'), sm = (a, k) => a.reduce((s, r) => s + (+r[k] || 0), 0), noLai = thu.filter(r => r.lai == null).length;
    const shared = thu.some(r => r.src === 'hdmb'), rate = c.late_rate != null && c.late_rate !== '' ? +c.late_rate : null;
    return { id: c.id, number: c.number || '', kind: c.kind, kind_l: KL[c.kind] || c.kind, status_l: SL[c.status] || c.status, signed_on: c.signed_on ? ddDay(c.signed_on) : null,
      customer: c.customer, phone: c.phone || '', unit: c.unit, project: c.project, building: c.building, owner: c.owner_l || '',
      apt_value: +(c.sale_unit_val || c.after_tax || c.value || 0) || null, maint_fee: +(c.sale_maint ?? c.maint_fee ?? 0) || null, rent: c.kind === 'thue' ? (+c.rent_house || 0) + (+c.rent_furn || 0) || +c.rent || null : null,
      late_rate: rate, lai_na: c.kind !== 'hdmb', src_note: shared ? 'Gồm tiến độ HĐMB dùng chung với HĐ vay — chỉ tính 1 lần tại hợp đồng này' : c.kind === 'vay' && !thu.length ? 'Tiến độ HĐMB dùng chung tính tại HĐ thuê — không tính lại ở HĐ vay' : '',
      total: sm(thu, 'amount'), paid: sm(thu, 'paid'), rem: sm(thu, 'rem'), overdue: sm(thu.filter(r => r.st === 'qua_han'), 'rem'), lai: sm(thu, 'lai'), noLai,
      rows: thu.map(r => ({ dot: r.dot, due_on: r.due_on, content: r.content, amount: +r.amount, paid: +r.paid, rem: +r.rem, st: r.st, st_l: ST[r.st] || r.st, days: r.days, over: r.st === 'qua_han' ? +r.rem : 0, lai: r.lai, lai_na: !!r.lai_na, maint: !!r.maint, src: r.src, inst_id: r.inst_id })),
      pay_rows: tra.map(r => ({ dot: r.dot, due_on: r.due_on, content: r.content, amount: +r.amount, paid: +r.paid, rem: +r.rem, st: r.st, st_l: ST[r.st] || r.st, days: r.days, loan_pay_id: r.loan_pay_id })) }; });
  const vouchers = [...RC.map(r => ({ type: 'thu', ent: 'receipt', id: r.id, on: ddDay(r.voucher_date), no: r.voucher_no || '', contract: live.find(c => c.id === r.contract_id)?.number || '', thu: +r.amount, chi: 0,
      alloc: (alloc.get(r.id) || []).map(([l, v]) => `${l}: ${fmtMoney(v)}`).join('; ') || (r.status === 'hop_le' ? '' : '—'), content: r.content || '', st_l: RST[r.status] || r.status || '', ok: r.status === 'hop_le' })),
    ...PM.map(p => ({ type: 'chi', ent: 'payment', id: p.id, on: ddDay(p.voucher_date), no: p.voucher_no || '', contract: live.find(c => c.id === p.contract_id)?.number || '', thu: 0, chi: +p.amount,
      alloc: p.lp_seq ? `${p.lp_kind === 'lai' ? 'Lãi' : 'Gốc'} kỳ ${p.lp_seq}` : '', content: p.content || '', st_l: PST[p.status] || p.status || '', ok: p.status === 'hop_le' }))].sort((a, b) => String(b.on).localeCompare(String(a.on)));
  // lịch sử chuyển trạng thái của từng HĐ (nhật ký: các lần đổi trạng thái)
  const CH = cs.length ? await db.q("SELECT a.rec_id, a.at, a.before->>'status' s0, a.after->>'status' s1, a.note, us.full_name who FROM kd_audit a LEFT JOIN kd_user us ON us.id = a.user_id WHERE a.ent = 'contract' AND a.rec_id = ANY($1) AND (a.after ? 'status') ORDER BY a.at", [cs.map(c => c.id)]) : [];
  return { unit_id: uid, unit: cs[0]?.unit || '', customer: [...new Set(live.map(c => c.customer))].join(', '), asof: t, synced_at: new Date().toISOString(), tab, blocks, vouchers,
    contracts: cs.map(c => ({ id: c.id, number: c.number || '(chưa số)', kind_l: KL[c.kind] || c.kind, status: c.status, status_l: SL[c.status] || c.status, signed_on: c.signed_on ? ddDay(c.signed_on) : null, customer: c.customer,
      closed: ['thanh_ly', 'huy'].includes(c.status), liquidated_on: c.liquidated_on ? ddDay(c.liquidated_on) : null,
      hist: CH.filter(h => h.rec_id === c.id).map(h => ({ at: h.at, from: h.s0 ? SL[h.s0] || h.s0 : '', to: SL[h.s1] || h.s1, who: h.who || 'Hệ thống', note: h.note || '' })) })) };
}
async function planList(db, user, f) { if (!can(user, E.collect_plan, 'r')) deny(); const t = isoDay(f.to) || today(); return { rows: await planRows(db, user, f, t), asof: t }; }

// ======================= THEO DÕI HỢP ĐỒNG THUÊ / MUA BÁN / HOÀN THIỆN (CN-07) =======================
// công nợ khách phải trả công ty theo lịch thu (kd_installment) + phiếu thu hợp lệ (kd_receipt); HĐ vay xem loanTrack
const CT_KIND = { thue: ['thue', 'thue_mua'], hdmb: ['hdmb'], hoan_thien: ['hoan_thien'] };
const CT_ST = { thanh_ly: 'Đã thanh lý', qua_han: 'Quá hạn thu', sap_toi: 'Đến hạn trong 7 ngày', het_han: 'Hết hạn trong 30 ngày', dang: 'Đang thu', xong: 'Đã thu đủ', chua_lich: 'Chưa có lịch thu' };
async function contractTrack(db, user, f = {}) {
  if (!can(user, E.installment, 'r')) deny();
  const kinds = CT_KIND[f.kind]; if (!kinds) bad('Loại hợp đồng không hợp lệ');
  // HĐ mua bán: chọn «Từ ngày – Đến ngày» — phải thu theo tiến độ = các kỳ có hạn trong khoảng; đã thu / số ngày quá hạn / lãi quá hạn tính đến «Đến ngày»
  // (ngày tương lai: tính như khách chưa trả thêm đến ngày đó)
  const hd = f.kind === 'hdmb', to = isoDay(f.to) || today(), from = isoDay(f.from) || null;   // mọi loại HĐ lọc Từ ngày – Đến ngày (07/11/2026)
  if (from && from > to) bad('«Từ ngày» sau «Đến ngày»');
  const p = [kinds], t = to, t30 = addDays(t, 30);
  const cs = await db.q(`SELECT c.id, c.number, c.kind, c.status, c.value, c.rent, c.deposit, c.term_months, c.pay_times, c.contract_on, c.signed_on, c.eff_on, c.exp_on,
      c.maint_fee, c.after_tax, c.finish_value, c.late_rate, c.maint_dot,
      u.code unit, pr.code project, pr.name project_name, b.code building, b.name building_name, k.full_name customer, coalesce(c.b_phone, k.phone) phone, own.full_name owner,
      (SELECT n.body FROM kd_note n WHERE n.ent = 'contract' AND n.rec_id = c.id ORDER BY n.at DESC, n.id DESC LIMIT 1) note
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id JOIN kd_customer k ON k.id = c.customer_id
      LEFT JOIN kd_user own ON own.id = c.owner_id
    WHERE c.kind = ANY($1) AND c.status = ${f.closed === '1' ? "'thanh_ly'" : "'da_ky'"} ${uf(f, p)}${mine(user, 'c')} ORDER BY pr.code, u.code, c.id`, p);   // 17/11/2026: đang theo dõi = HĐ đã ký; HĐ đã thanh lý đã đóng công nợ — chỉ hiện khi chọn «HĐ đã thanh lý» (tra cứu lịch sử)
  const D = await B.debtOf(db, cs.map(c => c.id), t);   // HĐ thuê / hoàn thiện: như màn công nợ của hợp đồng (mọi phiếu thu)
  // phiếu chi hợp lệ (hoàn tiền / hoàn cọc / khác) — số công ty đã trả lại khách
  const PC = new Map((await db.q("SELECT contract_id, sum(amount) s, count(*) n FROM kd_payment WHERE status = 'hop_le' AND contract_id = ANY($1) AND ($2::date IS NULL OR voucher_date <= $2) GROUP BY 1", [cs.map(c => c.id), t])).map(x => [x.contract_id, x]));
  // HĐ mua bán: phiếu thu hợp lệ đến t (theo ngày) — chia vào từng đợt đúng như B.debtOf để tách tiền nhà / phí bảo trì và tính lãi chậm trả
  const RC = await rcpOf(db, cs.map(c => c.id), t);
  const opt = k => Object.fromEntries(E.contract.fields.find(x => x.k === k).o.map(o => [o[0], o[1]])), KL = opt('kind'), SL = opt('status'), t7 = addDays(t, 7);
  const rows = cs.map(c => {
    const d = D.get(c.id), rent = c.kind === 'thue' || c.kind === 'thue_mua';
    const tl0 = c.status === 'thanh_ly';   // 16/11/2026: HĐ đã thanh lý — hết nghĩa vụ theo lịch: không quá hạn, không kỳ tới, không lãi chậm trả (thu / chi vẫn hiện)
    if (tl0) c.liq_on = d.closed_on || null;
    if (tl0) Object.assign(d, { overdue: 0, overdue_days: 0, due7: 0 });
    const nx = tl0 ? null : d.inst.find(i => i.rem > 0 && i.due_on >= t);   // kỳ tới = đợt còn nợ đầu tiên có hạn TỪ «Đến ngày» trở đi (16/11/2026: trước lấy đợt nợ sớm nhất, kể cả đã quá hạn → không đổi theo ngày)
    const state = tl0 ? 'thanh_ly' : !d.inst.length ? 'chua_lich' : d.overdue > 0 ? 'qua_han' : d.left <= 0 ? 'xong' : d.due7 > 0 ? 'sap_toi' : rent && c.exp_on && c.exp_on >= t && c.exp_on <= t30 ? 'het_han' : 'dang';
    const row = { contract_id: c.id, project: c.project, building: c.building, unit: c.unit, customer: c.customer, phone: c.phone, number: c.number, kind_l: KL[c.kind] || c.kind, status_l: SL[c.status] || c.status,
      signed_on: c.signed_on || c.contract_on, rent: rent ? +c.rent || null : null, eff_on: c.eff_on, exp_on: c.exp_on, value: +c.value || 0,
      total: d.total, paid: d.paid, paid_pct: d.paid_pct, left: d.left, overdue: d.overdue, overdue_days: d.overdue_days || null, due7: d.due7,
      next_name: nx?.name || '', next_on: nx?.due_on || null, next_amt: nx ? nx.rem : null, last_receipt: d.last_receipt, state, state_l: CT_ST[state], ...(tl0 ? { liq_on: c.liq_on, left_close: d.left_at_close ?? null } : {}) };
    row.chi = +(PC.get(c.id)?.s || 0); row.net = row.paid - row.chi;
    if (tl0) row.state_l = `Đã thanh lý${c.liq_on ? ' ' + C.dmy(c.liq_on) : ''} — đã đóng công nợ`;   // 17/11/2026
    // theo khoảng ngày: phải thu theo tiến độ = các kỳ có hạn trong khoảng; đã thu trong kỳ = phiếu thu trong khoảng (để trống «Từ ngày» = từ đầu HĐ)
    const inW = on => !from || on >= from, due_w = d.inst.filter(i => i.due_on && i.due_on <= t && inW(i.due_on)).reduce((a, i) => a + +i.amount, 0);
    const paid_w = (RC.get(c.id) || []).filter(r => inW(r.voucher_date)).reduce((a, r) => a + +r.amount, 0);
    // left_hd: còn phải thu theo hợp đồng = giá trị HĐ − tổng đã thu đến t (bảng HĐ hoàn thiện 08/11/2026)
    if (!hd) Object.assign(row, { due_w, paid_w, left_w: due_w - paid_w, left_hd: row.value - d.paid, _act: due_w > 0 || paid_w > 0 });   // đã chi trả lại khách · thực giữ = đã thu − đã chi
    if (hd) {
      // theo mẫu «Bảng theo dõi hợp đồng mua bán» + công thức phòng KD (05/11/2026), Tổng cộng = Tiền nhà + Phí bảo trì (cộng từng cột):
      //  tiền nhà: giá trị = tiền sau thuế (+ hoàn thiện nếu gộp HĐMB) · phải thu theo tiến độ = các đợt có hạn trong khoảng ngày · đã thu = phiếu thu (có «Từ ngày»: thu trong khoảng)
      //            còn lại theo tiến độ = phải thu − đã thu · còn lại theo hợp đồng = giá trị − tổng đã thu đến t
      //  phí bảo trì: phải thu theo tiến độ = dòng phí bảo trì đã đến hạn · còn lại theo tiến độ = phải thu − tổng đã thu phí bảo trì đến t
      // phiếu thu chia vào đợt theo ngày (payTimeline): phần vào dòng phí bảo trì → phí bảo trì, còn lại (kể cả thu thừa) → tiền nhà
      //  lịch không có dòng phí bảo trì riêng (nhập file / lịch cũ) → tách phí bảo trì khỏi đợt chứa nó, không cộng 2 lần (06/11/2026)
      const tl = payTimeline(d.inst, RC.get(c.id) || [], c), inW = on => !from || on >= from, win = i => i.due_on <= to && (!from || i.due_on >= from);
      const sumP = (xs, w) => xs.reduce((a, p) => a + (!w || inW(p.on) ? p.amt : 0), 0);
      const pcs = m => tl.I.filter(i => i.is_maint === m).flatMap(i => i.pcs), hP = [...pcs(false), ...tl.extra], mP = pcs(true);
      const hDue = tl.I.filter(i => !i.is_maint && win(i)).reduce((a, i) => a + i.amount, 0), hPaid = sumP(hP, true), hAll = sumP(hP), mAll = sumP(mP), mPaidW = sumP(mP, true);
      const hv = c.after_tax != null ? +c.after_tax + (+c.finish_value || 0) : row.value - (+c.maint_fee || 0), mv = +c.maint_fee || 0, mLeft = mv - mAll, rate = c.late_rate != null ? +c.late_rate : null;
      //  phí bảo trì: số phải thu = phí bảo trì (không theo hạn đợt) nên số đã thu = tổng đã thu phí bảo trì đến t (không lọc «Từ ngày») → phải thu − đã thu = còn lại
      //  13/11/2026: phí bảo trì cũng theo tiến độ — chỉ tính khi dòng phí bảo trì đã đến hạn (≤ «Đến ngày»); lịch không có dòng phí bảo trì → cả phí bảo trì
      const mI = tl.I.filter(i => i.is_maint), mDue = mI.length ? mI.filter(i => i.due_on && i.due_on <= to).reduce((a, i) => a + i.amount, 0) : mv;
      Object.assign(row, { h_value: hv, h_due: hDue, h_paid: hPaid, h_left_due: hDue - hPaid, h_left: hv - hAll, m_value: mv, m_due: mDue, m_paid: mAll, m_left_due: mDue - mAll, m_left: mLeft,
        t_value: hv + mv, t_due: hDue + mDue, t_paid: hPaid + mAll, t_left_due: hDue - hPaid + mDue - mAll, t_left: hv + mv - hAll - mAll,
        late_rate: rate, late_int: rate && !tl0 ? instDebt(d.inst, RC.get(c.id) || [], c, t, rate).reduce((a, i) => a + i.late, 0) : null, _act: hDue > 0 || hPaid > 0 || mPaidW > 0 });
    }
    if (rent) {
      // theo mẫu «Bảng theo dõi hợp đồng thuê căn hộ» (05/11/2026): phải thu theo tiến độ = các kỳ đến hạn tới hôm nay; còn phải thu = phải thu − đã thu (âm = thu thừa)
      const n = +c.term_months || 0, k = +c.pay_times || 0, per = n && k ? n / k : 0;
      const due = d.inst.filter(i => i.due_on <= t).reduce((s, i) => s + +i.amount, 0), left = due - d.paid;
      const open = d.inst.filter(i => i.rem > 0), cur = open.find(i => i.due_on <= t) || open[0];   // kỳ đang nợ sớm nhất, không thì kỳ tới
      const seq = cur ? d.inst.indexOf(cur) + 1 : 0, han = cur?.due_on || null;
      const thanhLy = c.status === 'thanh_ly';
      const pay = thanhLy ? 'Đã thanh lý' : !d.inst.length || (left > 0 && !han) ? 'Thiếu thông tin thu tiền'
        : left > 0 ? (han < t ? 'Quá hạn thanh toán' : han <= t7 ? 'Sắp đến hạn thanh toán' : 'Chưa đến hạn') : left < 0 ? 'Thu thừa - kiểm tra' : open.length && han && han <= t7 ? 'Sắp đến hạn thanh toán' : 'Đã thu đủ';
      const exp = thanhLy ? '' : !c.exp_on ? ' | Thiếu ngày hết hạn' : c.exp_on < t ? ' | Đã hết hạn thuê' : c.exp_on <= t30 ? ' | Sắp hết hạn thuê' : '';
      Object.assign(row, { project_name: c.project_name, building_l: c.building_name || c.building, term_l: n ? `${n} tháng` : '',
        period_l: !per ? (d.inst.length ? `${d.inst.length} kỳ` : '') : per === 1 ? 'Hàng tháng' : per === n ? 'Một lần' : Number.isInteger(per) ? `${per} tháng/kỳ` : `${k} kỳ`,
        deposit: c.deposit != null ? +c.deposit : null, due_sched: due_w, paid_sched: paid_w, left_sched: due_w - paid_w,
        cur_l: cur ? `${cur.name || 'Kỳ ' + seq}${d.inst.length > 1 ? ` (${seq}/${d.inst.length})` : ''}` : '', han_on: han, remind: pay + exp, owner: c.owner || '', note: c.note || '' });
    }
    return row;
  });
  rows.forEach(r => { r._keep = r._act; delete r._act; });
  return { rows: (from ? rows.filter(r => r._keep) : rows).map(({ _keep, ...r }) => r), states: CT_ST, from, to, asof: t, can_rate: hd && canRate(user) && f.closed !== '1', closed: f.closed === '1' };   // có «Từ ngày»: chỉ HĐ có đợt phải thu / có thu trong khoảng
}
// phiếu thu hợp lệ đến t của các hợp đồng, theo thứ tự ngày (như B.debtOf)
async function rcpOf(db, ids, t) {
  const M = new Map();
  for (const r of await db.q("SELECT id, contract_id, installment_id, amount, voucher_date FROM kd_receipt WHERE status = 'hop_le' AND contract_id = ANY($1) AND voucher_date <= $2 ORDER BY voucher_date, id", [ids, t]))
    (M.get(r.contract_id) || M.set(r.contract_id, []).get(r.contract_id)).push(r);
  return M;
}
// chia phiếu thu vào từng đợt, giữ ngày của từng phần tiền — cùng quy tắc B.debtOf (phiếu chọn đợt → vào đợt đó trước; phần dư + phiếu không chọn đợt
// → đợt có hạn sớm nhất còn nợ) nên số đã thu từng đợt khớp B.debtOf. extra = tiền thu thừa ngoài lịch.
// Lịch không có dòng phí bảo trì riêng mà tổng lịch đã gồm phí bảo trì (lịch nhập file / lịch cũ): tách phần phí bảo trì khỏi đợt «Đợt thu phí bảo trì»
// (mặc định 3) thành dòng phí bảo trì cùng hạn — để không tính phí bảo trì 2 lần và chia đúng tiền nhà / phí bảo trì (06/11/2026)
function payTimeline(inst, rcp, c = {}) {
  const I = inst.map(i => ({ id: i.id, name: i.name, due_on: i.due_on, is_maint: !!i.is_maint, amount: +i.amount, paid: 0, pcs: [] }));
  const mv = +c.maint_fee || 0, hv = c.after_tax != null ? +c.after_tax + (+c.finish_value || 0) : null;
  if (mv > 0 && hv != null && I.length && !I.some(i => i.is_maint) && Math.abs(I.reduce((a, i) => a + i.amount, 0) - hv - mv) <= 1000 * I.length) {
    let k = Math.min(Math.max(1, +c.maint_dot || 3), I.length) - 1;
    if (I[k].amount < mv) k = I.findIndex(i => i.amount >= mv);
    if (k >= 0) { const o = I[k]; I.splice(k, 1, { ...o, amount: o.amount - mv, pcs: [], cut: mv, orig: o.amount }, { ...o, name: 'Phí bảo trì', is_maint: true, amount: mv, pcs: [], virt: true, in_no: k + 1 }); }
  }
  const put = (i, amt, on, rid) => { const take = Math.min(amt, i.amount - i.paid); if (take > 0) { i.paid += take; i.pcs.push({ on, amt: take, rid }); return amt - take; } return amt; };
  const pool = [], extra = [];
  for (const r of rcp) {
    let rest = +r.amount;
    if (r.installment_id) for (const i of I.filter(x => x.id === r.installment_id && !x.is_maint).concat(I.filter(x => x.id === r.installment_id && x.is_maint))) rest = put(i, rest, r.voucher_date, r.id);
    if (rest > 0) pool.push({ on: r.voucher_date, amt: rest, rid: r.id });
  }
  for (const p of pool) { let rest = p.amt; for (const i of I) { if (rest <= 0) break; rest = put(i, rest, p.on, p.rid); } if (rest > 0) extra.push({ on: p.on, amt: rest, rid: p.rid }); }
  I.forEach(i => { i.rem = i.amount - i.paid; });
  return { I, extra };
}
// công nợ từng đợt tính đến t: còn lại = phải thu − đã thu của đợt; số ngày quá hạn = t − hạn (đợt còn nợ);
// số tiền quá hạn lũy kế = cộng dồn phần còn lại chưa thanh toán của các đợt đã quá hạn tới đợt này.
// Lãi chậm trả (phòng KD chốt 06/11/2026: tính cả những ngày đã trễ trước khi khách trả):
//   mỗi phần tiền của đợt trả sau hạn: số tiền × (ngày trả − hạn); phần còn nợ: số tiền × (t − hạn); lãi = Σ × lãi suất (%/năm) / 365
function instDebt(inst, rcp, c, t, rate) {
  const { I, extra } = payTimeline(inst, rcp, c), t7 = addDays(t, 7);
  let k0 = 0;
  const LB = I.map(i => i.is_maint ? 'Phí bảo trì' : 'Đợt ' + (++k0));
  // Lãi chậm trả theo SỐ TIỀN QUÁ HẠN LŨY KẾ của cả hợp đồng (phòng KD 06/11/2026):
  //  mốc = ngày hạn của các đợt đã quá hạn + ngày khách trả (sau hạn); giữa 2 mốc liên tiếp số tiền quá hạn lũy kế không đổi
  //  = Σ phần còn nợ (sau các lần trả đến hết ngày đầu khoảng) của mọi đợt có hạn ≤ ngày đầu khoảng. Mỗi khoảng: lũy kế × số ngày × lãi suất %/năm / 365.
  //  Khoảng xếp vào dòng của đợt có hạn gần nhất trước nó. Tổng = cộng lãi riêng từng đợt (cùng kết quả), chỉ trình bày theo lũy kế.
  const dues = I.map((i, k) => ({ i, k })).filter(x => x.i.due_on && x.i.due_on < t);
  const owe = (i, d) => i.amount - i.pcs.filter(p => p.on <= d).reduce((a, p) => a + p.amt, 0);
  const pts = new Set(dues.map(x => x.i.due_on));
  for (const { i } of dues) for (const p of i.pcs) if (p.on > i.due_on && p.on < t) pts.add(p.on);
  const P = [...pts].sort(), ivs = [];
  P.forEach((d, n) => {
    const e = P[n + 1] || t, parts = dues.filter(x => x.i.due_on <= d).map(x => ({ lbl: LB[x.k], rem: owe(x.i, d) })).filter(x => x.rem > 0), amt = parts.reduce((a, x) => a + x.rem, 0);
    if (amt <= 0 || e <= d) return;
    const days = dayDiff(d, e), pay = dues.reduce((a, x) => a + x.i.pcs.filter(q => q.on === d).reduce((s2, q) => s2 + q.amt, 0), 0);
    const ev = [...dues.filter(x => x.i.due_on === d).map(x => LB[x.k] + ' đến hạn'), pay ? 'khách trả ' + fmtMoney(pay) : ''].filter(Boolean).join(' · ');
    const own = dues.filter(x => x.i.due_on <= d).reduce((m, x) => Math.max(m, x.k), -1);
    ivs.push({ own, from: d, to: e, days, amt, parts, ev, open: e === t, late: rate ? Math.round(amt * days * rate / 100 / 365) : 0 });
  });
  let cum = 0;
  const out = I.map((i, k) => {
    const rem = Math.max(0, i.rem), over = !!i.due_on && i.due_on < t, days = rem > 0 && over ? dayDiff(i.due_on, t) : 0;
    if (over) cum += rem;
    const segs = ivs.filter(v => v.own === k);
    const st = rem <= 0 ? 'da_thu' : over ? 'qua_han' : i.due_on === t ? 'den_han' : i.due_on && i.due_on <= t7 ? 'sap_den_han' : i.paid > 0 ? 'mot_phan' : 'chua_den_han';
    const lastOn = i.pcs.reduce((m, p) => (!m || p.on > m ? p.on : m), null), paidLate = rem <= 0 && lastOn && lastOn > i.due_on ? dayDiff(i.due_on, lastOn) : 0;
    return { id: i.id, no: i.is_maint ? null : +LB[k].slice(4), lbl: LB[k], name: i.name, due_on: i.due_on, is_maint: i.is_maint, amount: i.amount, paid: i.paid, rem, days: days || null,
      od: over && cum > 0 ? cum : null, segs, rate: rate || null, late: segs.reduce((a, x) => a + x.late, 0), st, st_l: B.PAY_ST[st],
      paid_on: lastOn, late_paid_days: paidLate || null, pcs: i.pcs, cut: i.cut || null, orig: i.orig || null, virt: !!i.virt, in_no: i.in_no || null };
  });
  out.extra = extra;
  return out;
}
// lãi suất quá hạn (%/năm) điền theo từng hợp đồng ở Theo dõi hợp đồng › HĐ mua bán
const canRate = u => can(u, E.contract, 'u') || can(u, E.receipt, 'u');
async function setLateRate(db, user, id, v) {   // db: trong giao dịch (tx)
  if (!canRate(user)) deny();
  if (v != null && typeof v !== 'string' && typeof v !== 'number') bad('Lãi suất quá hạn không hợp lệ');
  const sv = v == null ? '' : String(v).trim(), rate = sv === '' ? null : +sv.replace(',', '.');
  if (rate != null && !(rate >= 0 && rate <= 100)) bad('Lãi suất quá hạn phải từ 0 đến 100 (%/năm)');
  const c = await db.one('SELECT id, kind, status, owner_id, created_by, late_rate, is_demo FROM kd_contract WHERE id = $1 FOR UPDATE', [+id]); if (!c) bad('Không tìm thấy hợp đồng');
  if (C.own(user, E.customer) && c.owner_id !== user.id && c.created_by !== user.id) deny();
  if (c.kind !== 'hdmb' || c.status === 'huy') bad('Chỉ điền lãi suất quá hạn cho HĐ mua bán chưa hủy');
  // ghi thẳng 1 cột + nhật ký — KHÔNG qua C.sys (sẽ chạy toàn bộ kiểm tra / tự điền khi lưu hợp đồng, có thể báo lỗi không liên quan hoặc sửa ô khác)
  await db.q('UPDATE kd_contract SET late_rate = $1, updated_by = $2, updated_at = now() WHERE id = $3', [rate, user.id ?? null, c.id]);
  await C.audit(db, 'contract', c.id, 'sua_lai_suat_qua_han', { late_rate: c.late_rate == null ? null : +c.late_rate }, { late_rate: rate }, user,
    `Lãi suất quá hạn: ${c.late_rate ?? 'trống'} → ${rate ?? 'trống'} %/năm`, c.is_demo);
  return { ok: true, late_rate: rate };
}

// ======================= CHI TIẾT BẢNG GIÁ THEO CĂN =======================
// Giá sau thuế lấy từ bảng hàng (mode bang_hang) hoặc đơn giá × DT thông thủy (mode don_gia, cùng cách tính với B.pricing);
// tách ngược ra giá trước thuế / tiền thuế theo % VAT của chính sách, đơn giá nền = trước thuế / DT thông thủy.
// bảng theo dõi hủy giao dịch, thanh lý hợp đồng và chi trả tiền (theo file Excel của phòng Kinh doanh)
async function payouts(db, user, f = {}) {
  if (!can(user, E.cancel_req, 'r')) deny();
  const p = []; const w = uf(f, p);
  // 16/11/2026: thêm mã KH, loại / số HĐ, ngày thanh lý, tổng đã thu (phiếu thu của HĐ), khấu trừ, phải hoàn trả, đã chi trả (phiếu chi hoàn tiền / hoàn cọc / thanh lý), còn phải trả
  const rows = await db.q(`SELECT t.id, t.code, t.kind, t.status, t.money_plan, coalesce(t.liquidate_on, c.liquidated_on) liquidate_on, t.wait_days, t.pay_due, t.pay_amount, t.deduct_amount, t.deduct_note,
      t.acct_status, t.acct_on, t.pay_status, t.paid_on, t.note, t.contract_id,
      coalesce((SELECT string_agg(cc.number, ' + ' ORDER BY (cc.kind = 'hdmb') DESC, cc.id) FROM kd_contract cc WHERE cc.id = ANY(t.ct_ids)), c.number) contract_no,
      coalesce((SELECT array_agg(cc.kind ORDER BY (cc.kind = 'hdmb') DESC, cc.id) FROM kd_contract cc WHERE cc.id = ANY(t.ct_ids)), ARRAY[c.kind]) ct_kinds, c.kind ct_kind, c.status contract_status, t.items, u.code unit, pj.code project, k.code cust_code, coalesce(k.full_name, r.cust_name) customer, coalesce(k.phone, r.phone) phone,
      t.edited,   -- ô sửa tay (16/11/2026): hiện số đã sửa, không tính lại
      CASE WHEN t.contract_id IS NOT NULL AND NOT coalesce(t.edited ? 'collected', false) THEN (SELECT coalesce(sum(x.amount), 0) FROM kd_receipt x WHERE x.contract_id = ANY(coalesce(t.ct_ids, ARRAY[t.contract_id])) AND x.status = 'hop_le') ELSE t.collected END collected,
      CASE WHEN t.contract_id IS NOT NULL AND NOT coalesce(t.edited ? 'paid_amount', false) THEN (SELECT coalesce(sum(y.amount), 0) FROM kd_payment y WHERE y.contract_id = ANY(coalesce(t.ct_ids, ARRAY[t.contract_id])) AND y.status = 'hop_le' AND y.kind IN ('hoan_tien','hoan_coc','thanh_ly')) ELSE t.paid_amount END paid_amount
    FROM kd_cancel_req t LEFT JOIN kd_reservation r ON r.id = t.reservation_id LEFT JOIN kd_contract c ON c.id = t.contract_id
    LEFT JOIN kd_unit u ON u.id = coalesce(c.unit_id, r.unit_id) LEFT JOIN kd_project pj ON pj.id = u.project_id
    LEFT JOIN kd_customer k ON k.id = coalesce(c.customer_id, r.customer_id) WHERE true ${w} ORDER BY t.pay_due NULLS LAST, t.id DESC`, p);
  for (const x of rows) x.remain = x.pay_status === 'khong_chi' ? 0 : Math.max(0, (+x.pay_amount || 0) - (+x.paid_amount || 0));
  return rows;
}
// theo dõi vay vốn: hợp đồng căn hộ chung cư + nhà liền kề đã ký tự sổ vào đây (sửa ở hợp đồng là cập nhật)
// tiền hoàn thiện: HĐ hoàn thiện riêng lấy số thu thật; gộp trong HĐMB thì tạm tính theo % đã thu của hợp đồng (thu Bravo không tách khoản hoàn thiện)
async function finishPay(db, user, f = {}) {
  if (!can(user, E.installment, 'r')) deny();
  const cs = await signedContracts(db, f, "AND c.status = 'da_ky'" + mine(user, 'c'));
  const own = new Set(cs.filter(c => c.kind === 'hoan_thien').map(c => c.unit_id));
  const rows = cs.flatMap(c => {
    const separate = c.kind === 'hoan_thien', value = separate ? +c.d.total : +c.finish_value || 0;
    if (!value || (!separate && own.has(c.unit_id))) return [];
    const paid = separate ? +c.d.paid : Math.round(value * Math.min(1, (+c.d.paid || 0) / (+c.d.total || 1))), left = value - paid;
    return [{ contract_id: c.id, project: c.project, building: c.building, unit: c.unit, customer: c.customer, number: c.number, basis: separate ? 'HĐ hoàn thiện riêng' : 'Gộp HĐMB (tạm tính)',
      value, paid, left, paid_pct: Math.round(paid / value * 1000) / 10, overdue: separate ? c.d.overdue : null, next_due: separate ? c.d.next?.due_on || null : null, state: !paid ? 'chua' : left > 0 ? 'dang' : 'du' }];
  });
  return { rows, bravo_sync: await bravoSync(db) };
}

async function loans(db, user, f = {}) {
  if (!can(user, E.contract, 'r')) deny();
  const p = []; const w = uf(f, p);
  return db.q(`SELECT c.id, c.number, c.contract_on, c.value, c.status, c.loan_status, c.loan_bank, c.loan_doc3, c.ptype, u.code unit, pj.code project, k.full_name customer, coalesce(c.b_phone, k.phone) phone
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pj ON pj.id = u.project_id JOIN kd_customer k ON k.id = c.customer_id
    WHERE c.kind <> 'hoan_thien' AND c.status = 'da_ky' ${w} ${mine(user, 'c')} ORDER BY c.id DESC`, p);
}
async function priceSheet(db, user, id) {
  if (!can(user, E.price_policy, 'r')) deny();
  const pol = C.notFound(await db.one(`SELECT t.*, (SELECT string_agg(p.code, ', ' ORDER BY array_position(t.project_ids, p.id)) FROM kd_project p WHERE p.id = ANY(t.project_ids)) project_code FROM kd_price_policy t WHERE t.id = $1`, [+id]), 'chính sách');
  const grp = String(pol.unit_group || '*').split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
  const units = await db.q(`SELECT u.id, u.code, u.floor, u.kind, u.position, u.area_tt, u.area_xd, u.price_net, u.list_price, u.maint_fee, u.total_price, u.base_price, u.pretax, u.vat_pct, u.tax_amt, u.finish_value, u.status, b.code building, coalesce(u.finish_value, k.value) pkg
    FROM kd_unit u JOIN kd_building b ON b.id = u.building_id LEFT JOIN kd_package k ON k.id = u.package_id WHERE u.project_id = ANY($1) ORDER BY b.code, u.floor, u.code`, [pol.project_ids || []]);
  const vat = pol.vat_pct ?? 5, mp = pol.maint_pct ?? 2;
  const rows = units.filter(u => grp.includes('*') || grp.includes(String(u.building).toUpperCase()) || grp.includes(String(u.code).toUpperCase())).map(u => {
    const dg = pol.mode === 'don_gia';
    const after = dg ? (pol.unit_price && u.area_tt ? Math.round(pol.unit_price * u.area_tt) : null) : u.price_net || (u.total_price && u.maint_fee ? u.total_price - u.maint_fee : null);
    const v = !dg && u.vat_pct != null ? u.vat_pct : vat;   // bảng giá Bravo đã có tiền trước thuế / thuế / đơn giá nền thì dùng luôn
    const before = !dg && u.pretax != null ? Math.round(u.pretax) : after != null ? Math.round(after / (1 + v / 100)) : null;
    const maint = dg ? (before != null ? Math.round(before * mp / 100 / 1000) * 1000 : null) : u.maint_fee ?? (before != null ? Math.round(before * mp / 100 / 1000) * 1000 : null);   // phí bảo trì = 2% × tiền trước thuế (làm tròn nghìn)
    const total = (dg || !u.total_price ? (after != null ? after + (maint || 0) : null) : u.total_price);
    return { unit_id: u.id, building: u.building, code: u.code, floor: u.floor, kind: u.kind, status: u.status, area_xd: u.area_xd, area_tt: u.area_tt,
      base: !dg && u.base_price != null ? u.base_price : before != null && u.area_tt ? Math.round(before / u.area_tt) : null, before, vat: v,
      tax: !dg && u.tax_amt != null ? Math.round(u.tax_amt) : after != null ? after - before : null, after, pkg: u.pkg, maint,
      total: total != null ? total + (u.finish_value == null ? +u.pkg || 0 : 0) : null };   // «Tổng cộng» Bravo đã gồm giá trị hoàn thiện
  });
  return { policy: pol, rows };
}

// ======================= HỒ SƠ 360° =======================
async function unit360(db, user, id) {
  const u = C.notFound(await db.one(`SELECT u.*, p.code project_code, p.name project_name, b.code building_code, b.name building_name FROM kd_unit u JOIN kd_project p ON p.id = u.project_id JOIN kd_building b ON b.id = u.building_id WHERE u.id = $1`, [+id]), 'căn');
  const get = async (ent, cond, pp, order = 't.id DESC') => can(user, E[ent], 'r') ? (await db.q(`SELECT t.*, ${C.labelCols(E[ent]).join(', ')} FROM ${E[ent].table} t WHERE ${cond} ORDER BY ${order}`, pp)) : null;
  const contracts = await get('contract', 't.unit_id = $1', [u.id]);
  const cids = (contracts || []).map(c => c.id);
  const D = await B.debtOf(db, cids);
  (contracts || []).forEach(c => { c._debt = D.get(c.id); });
  const out = {
    unit: u,
    reservations: await get('reservation', 't.unit_id = $1', [u.id]),
    contracts,
    receipts: await get('receipt', 't.contract_id = ANY($1)', [cids], 't.voucher_date DESC'),
    changes: await get('contract_change', 't.contract_id = ANY($1)', [cids]),
    plans: await get('collect_plan', 't.contract_id = ANY($1)', [cids], 't.month DESC'),
    calls: await get('debt_call', 't.contract_id = ANY($1)', [cids], 't.at DESC'),
    refunds: await get('refund', 't.contract_id = ANY($1)', [cids]),
    noxh: await get('noxh_check', 't.unit_id = $1', [u.id]),
    handover: await get('handover', 't.unit_id = $1', [u.id]),
    defects: await get('defect', 't.unit_id = $1', [u.id]),
    pinkbook: await get('pinkbook', 't.unit_id = $1', [u.id]),
    tickets: await get('ticket', 't.unit_id = $1', [u.id]),
    commissions: await get('commission', 't.contract_id = ANY($1)', [cids]),
  };
  if (out.calls) await B.H.debt_call.decorate(out.calls, { db });
  if (out.handover) await B.H.handover.decorate(out.handover, { db });
  if (out.tickets) await B.H.ticket.decorate(out.tickets, { db });
  const custIds = [...new Set([...(contracts || []).map(c => c.customer_id), ...(out.reservations || []).map(r => r.customer_id)])];
  out.customers = can(user, E.customer, 'r') ? (await db.q('SELECT id, code, full_name, phone, email, address, kind, owner_id FROM kd_customer WHERE id = ANY($1)', [custIds])) : [];
  if (E.customer.own?.includes(user.role)) out.customers = out.customers.map(c => c.owner_id === user.id ? c : { ...c, phone: '•••' + String(c.phone).slice(-3), email: null, address: null });
  const recs = [['unit', [u.id]], ...Object.entries({ reservation: out.reservations, contract: contracts, contract_change: out.changes, handover: out.handover, defect: out.defects, pinkbook: out.pinkbook, ticket: out.tickets, noxh_check: out.noxh, refund: out.refunds }).map(([k, v]) => [k, (v || []).map(x => x.id)])];
  out.files = [];
  out.timeline = [];
  for (const [ent, ids] of recs) {
    if (!ids.length) continue;
    out.files.push(...await db.q("SELECT f.id, f.ent, f.rec_id, f.kind, f.name, f.version, f.uploaded_at FROM kd_file f WHERE f.ent = $1 AND f.rec_id = ANY($2) AND f.deleted_at IS NULL", [ent, ids]));
    out.timeline.push(...await db.q("SELECT a.ent, a.rec_id, a.action, a.at, a.note, a.after, us.full_name who FROM kd_audit a LEFT JOIN kd_user us ON us.id = a.user_id WHERE a.ent = $1 AND a.rec_id = ANY($2) AND a.action NOT IN ('cap_nhat_dieu_kien')", [ent, ids]));
  }
  out.timeline.sort((a, b) => String(b.at).localeCompare(String(a.at))); out.timeline = out.timeline.slice(0, 80);
  return out;
}
async function customer360(db, user, id) {
  const e = E.customer; if (!can(user, e, 'r')) deny();
  const c = (await C.get('customer', id, user, { db })).row;
  const get = async (ent, cond, pp, order = 't.id DESC') => can(user, E[ent], 'r') ? await db.q(`SELECT t.*, ${C.labelCols(E[ent]).join(', ')} FROM ${E[ent].table} t WHERE ${cond} ORDER BY ${order}`, pp) : null;
  const contracts = await get('contract', 't.customer_id = $1', [c.id]);
  const D = await B.debtOf(db, (contracts || []).map(x => x.id));
  (contracts || []).forEach(x => { x._debt = D.get(x.id); x.paid = x._debt?.paid ?? null; });
  const out = { customer: c, contracts, reservations: await get('reservation', 't.customer_id = $1', [c.id]), logs: await get('contact_log', 't.customer_id = $1', [c.id], 't.at DESC'),
    tickets: await get('ticket', 't.customer_id = $1', [c.id]), noxh: await get('noxh_check', 't.customer_id = $1', [c.id]), pinkbook: await get('pinkbook', 't.customer_id = $1', [c.id]) };
  // nhắc nợ – cam kết + kế hoạch thu của các hợp đồng của khách (ghi ở Tình trạng công nợ đến hạn) — 07/11/2026
  const cids = (contracts || []).map(x => x.id);
  out.calls = await get('debt_call', 't.contract_id = ANY($1)', [cids], 't.at DESC'); out.plans = await get('collect_plan', 't.contract_id = ANY($1)', [cids], 't.month DESC');
  if (out.calls) await B.H.debt_call.decorate(out.calls, { db });
  if (out.reservations) await B.H.reservation.decorate(out.reservations, { db });
  return out;
}

// Sổ chi tiết công nợ của khách hàng (06/11/2026) — mọi hợp đồng khách phải trả (trừ HĐ vay, HĐ đã hủy), theo ngày:
//  Phát sinh Nợ = đợt thu đến hạn (theo lịch thanh toán) + phiếu chi trả lại khách (hoàn tiền / hoàn cọc / thanh lý)
//  Phát sinh Có = phiếu thu hợp lệ · Số dư = Nợ − Có (dương: khách còn nợ đến hạn; âm: khách trả trước)
//  có «Từ ngày»: phát sinh trước đó gộp thành số dư đầu kỳ; các đợt hạn sau «Đến ngày» = chưa đến hạn (không vào số dư)
async function customerLedger(db, user, id, f = {}) {
  if (!can(user, E.customer, 'r') || !can(user, E.installment, 'r')) deny();
  const k = (await C.get('customer', id, user, { db })).row;
  const to = isoDay(f.to) || today(), from = isoDay(f.from) || null;
  if (from && from > to) bad('«Từ ngày» sau «Đến ngày»');
  const cs = await db.q(`SELECT c.id, c.number, c.kind, c.value, c.status, coalesce(c.liquidated_on, CASE WHEN c.status = 'thanh_ly' THEN c.updated_at::date END) liq_on, u.code unit FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id
    WHERE c.customer_id = $1 AND c.kind <> 'vay' AND c.status IN ('da_ky','thanh_ly') ORDER BY c.id`, [k.id]);
  const ids = cs.map(c => c.id), CM = new Map(cs.map(c => [c.id, c])), ev = [];
  const KL = Object.fromEntries(E.contract.fields.find(x => x.k === 'kind').o.map(o => [o[0], o[1]])), PK = Object.fromEntries(E.payment.fields.find(x => x.k === 'kind').o.map(o => [o[0], o[1]]));
  let notDue = 0;
  // đợt thu: đánh số Đợt n như lịch (dòng phí bảo trì riêng: «Phí bảo trì»)
  const inst = await db.q('SELECT id, contract_id, seq, name, due_on, amount, is_maint FROM kd_installment WHERE active AND contract_id = ANY($1) ORDER BY contract_id, seq', [ids]);
  const no = new Map();
  // 17/11/2026: HĐ đã thanh lý (ngày thanh lý ≤ «Đến ngày») — đóng công nợ: đợt có hạn sau ngày thanh lý không còn phải thu; tại ngày thanh lý ghi «hủy các khoản phải thu»
  // (= tổng đã ghi phải thu) + khấu trừ khi thanh lý → số dư HĐ = số phải hoàn trả khách, chi trả theo dõi ở «Theo dõi thanh lý & chi trả» (phiếu chi hoàn trả vẫn hiện ở sổ)
  const LQ = new Map(cs.filter(c => c.status === 'thanh_ly' && c.liq_on && String(c.liq_on).slice(0, 10) <= to).map(c => [c.id, String(c.liq_on).slice(0, 10)])), chg = new Map();
  for (const i of inst) {
    const n = i.is_maint ? null : (no.set(i.contract_id, (no.get(i.contract_id) || 0) + 1), no.get(i.contract_id));
    if (LQ.has(i.contract_id) && (!i.due_on || i.due_on > LQ.get(i.contract_id))) continue;
    if (!i.due_on || i.due_on > to) { notDue += +i.amount; continue; }   // đợt chưa có hạn (chờ thông báo…) = chưa đến hạn
    chg.set(i.contract_id, (chg.get(i.contract_id) || 0) + +i.amount);
    ev.push({ on: i.due_on, ord: 0, cid: i.contract_id, doc: '', what: `Phải thu ${n ? 'Đợt ' + n : 'Phí bảo trì'}${i.name && !/^\s*(đợt|kỳ|lần)\s*\d/i.test(i.name) ? ' — ' + i.name : ''}`, no_: +i.amount, co: 0, ent: 'contract', rid: i.contract_id });
  }
  for (const r of await db.q("SELECT r.id, r.contract_id, r.voucher_no, r.voucher_date, r.amount, r.content, i.name inst FROM kd_receipt r LEFT JOIN kd_installment i ON i.id = r.installment_id WHERE r.status = 'hop_le' AND r.contract_id = ANY($1) AND r.voucher_date <= $2", [ids, to]))
    ev.push({ on: r.voucher_date, ord: 1, cid: r.contract_id, doc: r.voucher_no, what: r.content || `Thu tiền${r.inst ? ' ' + r.inst : ''}`, no_: 0, co: +r.amount, ent: 'receipt', rid: r.id });
  for (const p of await db.q("SELECT p.id, p.contract_id, p.voucher_no, p.voucher_date, p.amount, p.kind, p.content FROM kd_payment p WHERE p.status = 'hop_le' AND p.contract_id = ANY($1) AND p.voucher_date <= $2", [ids, to]))
    ev.push({ on: p.voucher_date, ord: 2, cid: p.contract_id, doc: p.voucher_no, what: [PK[p.kind] || 'Chi trả khách', p.content].filter(Boolean).join(' — '), no_: +p.amount, co: 0, ent: 'payment', rid: p.id });
  if (LQ.size) {
    const SL = await db.q("SELECT id, contract_id, ct_ids, items, deduct_amount, code FROM kd_cancel_req WHERE kind = 'thanh_ly' AND status NOT IN ('huy', 'tu_choi') AND (contract_id = ANY($1) OR ct_ids && $1::int[])", [[...LQ.keys()]]);
    for (const [cid, on] of LQ) {
      const sl = SL.find(x => x.contract_id === cid || (x.ct_ids || []).includes(cid)), it = Array.isArray(sl?.items) ? sl.items.find(y => +y.contract_id === cid) : null;
      const ded = it ? +it.deduct || 0 : sl && sl.contract_id === cid && !(sl.items || []).length ? +sl.deduct_amount || 0 : 0;
      if (chg.get(cid)) ev.push({ on, ord: 3, cid, doc: sl?.code || '', what: 'Thanh lý hợp đồng — đóng công nợ: hủy các khoản phải thu', no_: 0, co: chg.get(cid), ent: sl ? 'cancel_req' : 'contract', rid: sl ? sl.id || cid : cid });
      if (ded) ev.push({ on, ord: 4, cid, doc: sl?.code || '', what: 'Khấu trừ khi thanh lý hợp đồng', no_: ded, co: 0, ent: 'contract', rid: cid });
    }
  }
  ev.sort((a, b) => String(a.on).localeCompare(String(b.on)) || a.ord - b.ord || a.cid - b.cid);
  let open = 0, bal = 0;
  const rows = [];
  for (const e of ev) {
    if (from && e.on < from) { open += e.no_ - e.co; continue; }
    if (!rows.length) bal = open;
    bal += e.no_ - e.co;
    const c = CM.get(e.cid);
    rows.push({ on: e.on, doc: e.doc, contract: c.number, unit: c.unit, what: e.what, no_: e.no_ || null, co: e.co || null, bal, ent: e.ent, id: e.rid, contract_id: e.cid });
  }
  const sum = k2 => rows.reduce((t, r) => t + (+r[k2] || 0), 0);
  return { customer: { id: k.id, code: k.code, name: k.full_name }, from, to, open, rows, no_sum: sum('no_'), co_sum: sum('co'), close: open + sum('no_') - sum('co'), not_due: notDue,
    contracts: cs.map(c => ({ id: c.id, number: c.number, unit: c.unit, kind_l: KL[c.kind] || c.kind, value: +c.value || 0, ...(LQ.has(c.id) ? { closed_on: LQ.get(c.id) } : {}) })) };
}

// tìm kiếm toàn hệ thống (theo quyền)
async function search(db, user, qtext) {
  const s = String(qtext || '').trim(); if (s.length < 2) return [];
  const like = `%${s}%`, dig = s.replace(/\D/g, ''), out = [];
  for (const r of await db.q("SELECT u.id, u.code, u.status, b.code building, p.code project FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project p ON p.id = u.project_id WHERE u.code ILIKE $1 ORDER BY u.code LIMIT 12", [like]))
    out.push({ type: 'unit', id: r.id, title: r.code, sub: `${r.project} · Tòa ${r.building} · ${C.F.unit.status.o.find(o => o[0] === r.status)?.[1]}` });
  if (can(user, E.customer, 'r')) {
    const own = E.customer.own?.includes(user.role);
    const p = [like], cond = ['full_name ILIKE $1', 'code ILIKE $1'];
    if (dig.length >= 4) { p.push(`%${dig}%`); cond.push(`regexp_replace(phone,'\D','','g') LIKE $${p.length}`, `regexp_replace(coalesce(phone2,''),'\D','','g') LIKE $${p.length}`); }
    let sc = ''; if (own) { p.push(user.id); sc = ` AND (owner_id = $${p.length} OR created_by = $${p.length})`; }
    for (const r of await db.q(`SELECT id, code, full_name, phone FROM kd_customer WHERE (${cond.join(' OR ')})${sc} ORDER BY full_name LIMIT 12`, p))
      out.push({ type: 'customer', id: r.id, title: r.full_name, sub: `ĐT ${r.phone}` });
  }
  if (can(user, E.contract, 'r')) for (const r of await db.q("SELECT c.id, c.number, c.code, u.code unit FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE c.number ILIKE $1 OR c.code ILIKE $1 LIMIT 8", [like]))
    out.push({ type: 'contract', id: r.id, title: r.number, sub: `${r.code} · căn ${r.unit}` });
  if (can(user, E.ticket, 'r')) for (const r of await db.q("SELECT id, code, content FROM kd_ticket WHERE code ILIKE $1 LIMIT 5", [like])) out.push({ type: 'ticket', id: r.id, title: r.code, sub: r.content.slice(0, 60) });
  if (can(user, E.reservation, 'r')) for (const r of await db.q("SELECT id, code FROM kd_reservation WHERE code ILIKE $1 LIMIT 5", [like])) out.push({ type: 'reservation', id: r.id, title: r.code, sub: 'Phiếu giữ chỗ' });
  return out;
}

// ======================= SỔ CÔNG NỢ CĂN HỘ (CN-01) =======================
async function ledger(db, user, f) {
  if (!can(user, E.installment, 'r')) deny();
  let extra = "AND c.status = 'da_ky'" + mine(user, 'c');
  if (f.q) extra += ` AND (u.code ILIKE ${pgLit('%' + f.q + '%')} OR k.full_name ILIKE ${pgLit('%' + f.q + '%')} OR c.number ILIKE ${pgLit('%' + f.q + '%')})`;
  if (f.owner) { if (!/^\d+$/.test(f.owner)) bad('Bộ lọc không hợp lệ'); extra += ` AND c.owner_id = ${+f.owner}`; }
  const cs = await signedContracts(db, f, extra);
  const t = today(), m = t.slice(0, 7);
  const ids = cs.map(c => c.id);
  const lastCall = new Map((await db.q('SELECT DISTINCT ON (contract_id) contract_id, at, result, promise_amount, promise_on FROM kd_debt_call WHERE contract_id = ANY($1) ORDER BY contract_id, at DESC', [ids])).map(r => [r.contract_id, r]));
  const plan = new Map((await db.q("SELECT contract_id, expected, expected_on, status FROM kd_collect_plan WHERE contract_id = ANY($1) AND month = $2 AND status <> 'thay_the'", [ids, m])).map(r => [r.contract_id, r]));
  let rows = cs.map(c => {
    const lc = lastCall.get(c.id), pl = plan.get(c.id);
    return { contract_id: c.id, unit_id: c.unit_id, customer_id: c.customer_id, project: c.project, building: c.building, unit: c.unit, customer: c.customer, phone: c.phone, number: c.number, kind: c.kind,
      value: c.value, total: c.d.total, paid: c.d.paid, paid_pct: c.d.paid_pct, left: c.d.left, due: c.d.due, overdue: c.d.overdue, overdue_days: c.d.overdue_days, due7: c.d.due7,
      next_due: c.d.next?.due_on || null, next_amt: c.d.next?.rem || null, owner: c.owner, last_call: lc ? new Date(Date.parse(lc.at) + 7 * 3600e3).toISOString().slice(0, 10) : null, last_result: lc ? C.F.debt_call.result.o.find(o => o[0] === lc.result)?.[1] : null,
      promise: lc?.promise_amount && lc.promise_on >= addDays(t, -10) ? `${fmtMoney(lc.promise_amount)} · ${C.dmy(lc.promise_on)}` : null,
      plan_expected: pl?.expected ?? null, plan_on: pl?.expected_on ?? null, plan_status: pl ? C.F.collect_plan.status.o.find(o => o[0] === pl.status)?.[1] : null, last_receipt: c.d.last_receipt };
  });
  const fl = { overdue: r => r.overdue > 0, due7: r => r.due7 > 0, left: r => r.left > 0, done: r => r.left === 0, noplan: r => r.left > 0 && r.plan_expected == null }[f.filter];
  if (fl) rows = rows.filter(fl);
  rows.sort((a, b) => b.overdue - a.overdue || b.due - a.due || a.unit.localeCompare(b.unit));
  const tot = rows.reduce((s, r) => { for (const k of ['value', 'total', 'paid', 'left', 'due', 'overdue', 'due7']) s[k] = (s[k] || 0) + r[k]; return s; }, {});
  return { rows, totals: tot, bravo_sync: await bravoSync(db), at: new Date().toISOString() };
}
const pgLit = s => `'${String(s).replace(/'/g, "''")}'`;

// ======================= BẢNG TỔNG HỢP CÔNG NỢ (CN-08) =======================
// Theo file «Bảng tổng hợp công nợ - kinh doanh» của phòng KD: mỗi dòng 1 căn (HĐMB / HĐ thuê mua), nhóm theo dự án → tòa có dòng cộng.
// Tách khoản: Tiền nhà (sau thuế, không gồm hệ số góc) · Hệ số lô góc (sau thuế) · Hoàn thiện căn hộ (gộp HĐMB + HĐ hoàn thiện riêng) · Bảo trì.
// Thu không ghi theo khoản → mỗi kỳ thu chia theo cơ cấu của kỳ: kỳ «Đợt thu phí bảo trì» gánh trọn phí bảo trì, phần còn lại chia theo tỷ lệ tiền nhà / góc / hoàn thiện.
const DS_HEAD = [
  ['', [['stt', 'Stt', 'int'], ['unit', 'Mã căn hộ'], ['customer', 'Họ và tên'], ['address', 'Địa chỉ'], ['contract_on', 'Ngày ký hợp đồng', 'date'], ['vbtt_on', 'Ngày ký VBTT', 'date'], ['phone', 'SĐT'],
    ['area_floor', 'DT sàn', 'num'], ['area_tt', 'DT nền', 'num'], ['base_price', 'Giá nền', 'money'], ['build_price', 'Giá xây dựng', 'money']]],
  ['Tiền nhà', [['n_total', 'Tổng phải thu', 'money'], ['n_due', 'Phải thu theo tiến độ', 'money'], ['n_paid', 'Tổng đã thu', 'money'], ['n_left', 'Còn lại', 'money'], ['n_left_due', 'Còn lại theo tiến độ', 'money']]],
  ['Hệ số lô góc', [['g_total', 'Tổng phải thu', 'money'], ['g_due', 'Phải thu theo tiến độ', 'money'], ['g_paid', 'Tổng đã thu', 'money'], ['g_left', 'Còn lại', 'money']]],
  ['Hoàn thiện căn hộ', [['p_total', 'Tổng phải thu', 'money'], ['p_due', 'Phải thu theo tiến độ', 'money'], ['p_paid', 'Tổng đã thu', 'money'], ['p_left', 'Còn lại', 'money'], ['p_left_due', 'Còn lại theo tiến độ', 'money']]],
  ['Bảo trì', [['b_total', 'Tổng phải thu', 'money'], ['b_due', 'Phải thu theo tiến độ', 'money'], ['b_paid', 'Tổng đã thu', 'money'], ['b_left', 'Còn lại', 'money']]],
  ['Tổng hợp', [['value', 'Giá trị hợp đồng', 'money'], ['t_total', 'Tổng phải thu', 'money'], ['t_due', 'Tổng phải thu theo tiến độ', 'money'], ['t_paid', 'Tổng đã thu', 'money'], ['t_left_due', 'Số còn lại theo tiến độ', 'money'], ['t_left', 'Còn lại theo hợp đồng', 'money'], ['pct5', '5 % theo hợp đồng', 'money']]],
  ['', [['sign_l', 'Ký hợp đồng'], ['hdv_left', 'Số dư còn lại HĐV', 'money']]],
];
const DS_COLS = DS_HEAD.flatMap(([, cs]) => cs);
// mục của bảng tổng hợp theo loại hợp đồng (14/11/2026): HĐ thuê / vay có bản chất giao dịch = Bán căn hộ
const DS_GRP = [['mb', 'HỢP ĐỒNG MUA BÁN'], ['vay', 'HỢP ĐỒNG VAY'], ['thue', 'HỢP ĐỒNG THUÊ']];
const DS_FIXED = 8;   // 8 cột đầu (Stt … SĐT) luôn hiện — dòng cộng tòa / dự án ghép ô qua các cột này
const DS_COND = { con_no: ['Còn nợ theo tiến độ (đến hạn chưa thu)', r => r.t_left_due > 0], qua_han: ['Có nợ quá hạn', r => r.overdue > 0], du_tien_do: ['Đã thu đủ theo tiến độ', r => r.t_left_due <= 0],
  con_hd: ['Còn nợ theo hợp đồng', r => r.t_left > 0], du_hd: ['Đã thu đủ hợp đồng', r => r.t_left <= 0] };
// nhóm cột theo ô tick «Điều kiện lọc» (hide = các cột bỏ tick)
const dsHead = hide => DS_HEAD.map(([g, cs], gi) => [g, cs.filter((c, ci) => (gi === 0 && ci < DS_FIXED) || !hide.has(c[0]))]).filter(([, cs]) => cs.length);
const DS_SUM = DS_COLS.filter(c => ['money', 'num'].includes(c[2]) && !['base_price', 'build_price'].includes(c[0])).map(c => c[0]);
const isoDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && (d => !isNaN(d) && d.toISOString().slice(0, 10) === v)(new Date(v + 'T00:00:00Z')) ? v : null;
async function debtSummary(db, user, f = {}) {
  if (!can(user, E.installment, 'r')) deny();
  const to = isoDay(f.to) || today();   // bỏ nhóm cột Kế toán (07/11/2026) → không còn «Thu phát sinh từ ngày»
  const p = [];   // 08/11/2026: như các tab theo dõi từng loại HĐ — chỉ hợp đồng đã duyệt (Đã ký), duyệt xong tự vào bảng; bỏ lọc «Mọi / Đã ký / Chưa ký»
  const cs = await db.q(`SELECT c.*, u.code unit, u.project_id, u.building_id, pr.code project, pr.name project_name, b.code building, k.code cust_code, k.full_name customer, k.address k_addr, k.phone k_phone, k.tax_code k_tax, k.id_no k_id_no, k.id_date k_id_date, k.id_place k_id_place,
      (SELECT r.reg_date FROM kd_reservation r WHERE r.id = c.reservation_id) vbtt_on
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id
    WHERE (c.kind IN ('hdmb','thue_mua','hoan_thien') OR (c.kind IN ('thue','vay') AND ((c.sale_on AND jsonb_array_length(coalesce(c.sale_sched, '[]'::jsonb)) > 0) OR coalesce(c.nature, CASE WHEN c.kind = 'thue' THEN 'thue' ELSE 'ban' END) = 'ban'))) AND c.status = 'da_ky' ${uf(f, p)}${mine(user, 'c')}
    ORDER BY pr.code, b.code, u.floor, u.code, c.id`, p);
  const ids = cs.map(c => c.id), D = await B.debtOf(db, ids, to);
  // căn có cả HĐ thuê và HĐ vay (cùng 1 khách mua — 16/11/2026): 1 dòng; phải thu theo tiến độ HĐMB của HĐ thuê, đã thu = gốc khách đã chuyển của HĐ vay
  const hasMain = new Set(cs.filter(c => ['hdmb', 'thue_mua'].includes(c.kind)).map(c => c.unit_id));
  // 17/11/2026: HĐ vay đi kèm = cùng căn + (cùng khách hàng hoặc đã tick liên kết); đã thu của HĐ thuê = gốc vay còn phải trả khách (gốc đã nhận − gốc đã hoàn trả), không gồm lãi / tiền thuê
  const VY = await db.q("SELECT id, unit_id, number, customer_id, link_ids FROM kd_contract WHERE kind = 'vay' AND status = 'da_ky' AND unit_id = ANY($1) ORDER BY id", [[...new Set(cs.filter(c => c.kind === 'thue').map(c => c.unit_id))]]);
  const pairU = new Map(); for (const c of cs.filter(c => c.kind === 'thue' && !hasMain.has(c.unit_id))) { const ps = B.loanPairOf(c, VY); if (ps.length) pairU.set(c.unit_id, ps); }
  const LNY = await B.loanNet(db, VY.map(v => v.id), to), vPaid = uid => (pairU.get(uid) || []).reduce((s, v) => s + LNY.get(v.id).net, 0);
  // HĐ vay cùng căn (bản chất bán): số dư = gốc khách đã chuyển − gốc công ty đã trả lại
  const unitIds = [...new Set(cs.map(c => c.unit_id))];
  const vays = await db.q("SELECT c.id, c.unit_id FROM kd_contract c WHERE c.kind = 'vay' AND c.status IN ('da_ky','thanh_ly') AND coalesce(c.nature, 'ban') = 'ban' AND c.unit_id = ANY($1)", [unitIds]);
  const LNV = await B.loanNet(db, vays.map(v => v.id), to);   // cùng cách tính: phiếu thu gốc − phiếu chi trả gốc
  const HDV = new Map(); for (const v of vays) HDV.set(v.unit_id, (HDV.get(v.unit_id) || 0) + LNV.get(v.id).net);
  const ST_L = Object.fromEntries(C.F.contract.status.o.map(o => [o[0], o[1]]));
  // chia 1 hợp đồng ra các khoản: { n, g, p, b } × { total, due, paid }
  const split = c => {
    const d = D.get(c.id), Z = () => ({ total: 0, due: 0, paid: 0 }), o = { n: Z(), g: Z(), p: Z(), b: Z() };
    const value = +c.value || 0;
    // HĐ thuê / vay bán căn: tiến độ thu tiền HĐMB nhập trên hợp đồng → tiền nhà; đã thu = phiếu thu của hợp đồng đến ngày xem (HĐ vay: gốc khách đã chuyển)
    if (['thue', 'vay'].includes(c.kind)) {   // tiến độ HĐMB của HĐ thuê / vay: dòng phí bảo trì → Bảo trì (16/11/2026), còn lại → Tiền nhà; đã thu chia theo thứ tự hạn
      let left = c.kind === 'thue' && pairU.has(c.unit_id) ? vPaid(c.unit_id) : +d.paid || 0;   // căn có cả HĐ vay: đã thu = gốc vay khách đã chuyển
      for (const i of [...(c.sale_sched || [])].sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)))) {
        const k = i.maint ? 'b' : 'n', a = +i.amount || 0, take = Math.min(a, left); left -= take;
        o[k].total += a; if (i.due_on <= to) o[k].due += a; o[k].paid += take;
      }
      if (!(c.sale_sched || []).length) o.n.total = Math.max(0, (+c.unit_total || 0) - (+c.maint_fee || 0)), o.b.total = +c.maint_fee || 0;   // chưa khai tiến độ HĐMB: phải thu theo Giá trị HĐMB
      o.n.paid += left; return o;
    }
    if (c.kind === 'hoan_thien') { o.p.total = value; o.p.due = d.inst.filter(i => i.due_on <= to).reduce((s, i) => s + +i.amount, 0); o.p.paid = d.paid; return o; }
    const vat = c.vat_pct ?? 5, maint = +c.maint_fee || 0, fin = +c.finish_value || 0, corner = c.corner_amt ? Math.round(+c.corner_amt * (1 + vat / 100)) : 0;
    const house = Math.max(0, value - maint - fin - corner), nonM = house + corner + fin || 1;
    o.n.total = house; o.g.total = corner; o.p.total = fin; o.b.total = maint;
    const inst = [...d.inst].sort((a, b) => a.seq - b.seq), mo = inst.findIndex(i => i.is_maint), mi = maint > 0 && inst.length ? (mo >= 0 ? mo : Math.min(Math.max(1, +c.maint_dot || 3), inst.length) - 1) : -1;   // dòng phí bảo trì riêng (is_maint); lịch cũ: đợt maint_dot
    inst.forEach((i, ix) => {
      const amt = +i.amount || 0, m = ix === mi ? Math.min(maint, amt) : 0, rest = amt - m, due = i.due_on <= to, pr = amt ? (+i.paid || 0) / amt : 0;
      const parts = { b: m, n: rest * house / nonM, g: rest * corner / nonM, p: rest * fin / nonM };
      for (const k in parts) { if (due) o[k].due += parts[k]; o[k].paid += parts[k] * pr; }
    });
    if (d.credit > 0) { const tot = value || 1; for (const [k, v] of [['n', house], ['g', corner], ['p', fin], ['b', maint]]) o[k].paid += d.credit * v / tot; }   // thu chưa có kỳ (chưa lập lịch / thu trước)
    for (const x of ['due', 'paid']) {   // làm tròn từng khoản, phần lệch dồn vào tiền nhà để tổng khớp số thật
      const exact = Math.round(Object.values(o).reduce((s, v) => s + v[x], 0));
      for (const k in o) o[k][x] = Math.round(o[k][x]);
      o.n[x] += exact - Object.values(o).reduce((s, v) => s + v[x], 0);
    }
    return o;
  };
  // gom theo căn: HĐMB / thuê mua là dòng chính, HĐ hoàn thiện riêng cộng vào «Hoàn thiện căn hộ»
  const byU = new Map();
  // HĐ thuê / vay bán căn chỉ lên bảng khi căn chưa có HĐMB / thuê mua còn hiệu lực (ký HĐMB thật thì thanh lý HĐ thuê / vay)
  for (const c of cs) { if (['thue', 'vay'].includes(c.kind) && hasMain.has(c.unit_id)) continue; if (c.kind === 'vay' && pairU.has(c.unit_id)) continue; /* HĐ vay của căn đã có HĐ thuê: gộp vào dòng HĐ thuê */ const g = byU.get(c.unit_id) || byU.set(c.unit_id, { main: null, fin: [] }).get(c.unit_id); if (c.kind === 'hoan_thien') g.fin.push(c); else if (!g.main) g.main = c; else g.fin.push(c); }
  const rows = [];
  for (const [uid, g] of byU) {
    const c = g.main || g.fin[0], all = [...(g.main ? [g.main] : []), ...g.fin];
    const o = { n: { total: 0, due: 0, paid: 0 }, g: { total: 0, due: 0, paid: 0 }, p: { total: 0, due: 0, paid: 0 }, b: { total: 0, due: 0, paid: 0 } };
    for (const x of all) { const s = split(x); for (const k in o) for (const y in o[k]) o[k][y] += s[k][y]; }
    const pos = v => Math.max(0, v), r = {
      unit_id: uid, contract_id: c.id, project: c.project, project_name: c.project_name, building: c.building, unit: c.unit, number: c.number, cust_code: c.cust_code, customer: c.customer,
      address: c.b_addr || c.k_addr || '', contract_on: c.contract_on, vbtt_on: c.vbtt_on, phone: c.b_phone || c.k_phone || '',
      area_floor: c.area_floor ?? c.area_build ?? null, area_tt: c.area_tt ?? c.area_land ?? null, base_price: c.base_price ?? c.land_price ?? null, build_price: c.build_price ?? null,
      sign_l: c.status === 'da_ky' ? 'Đã ký hợp đồng' : ST_L[c.status] || c.status, signed: c.status === 'da_ky',
      hdv_left: HDV.has(uid) ? HDV.get(uid) : null, grp: ['thue', 'vay'].includes(c.kind) ? c.kind : 'mb' };
    for (const k of ['n', 'g', 'p', 'b']) { r[k + '_total'] = o[k].total; r[k + '_due'] = o[k].due; r[k + '_paid'] = o[k].paid; r[k + '_left'] = o[k].total - o[k].paid; r[k + '_left_due'] = pos(o[k].due - o[k].paid); }
    r.value = all.reduce((s, x) => s + (['thue', 'vay'].includes(x.kind) ? +x.unit_total || 0 : +x.value || 0), 0);   // HĐ thuê / vay bán căn: giá trị = Giá trị HĐMB
    const pv = c.kind === 'thue' ? pairU.get(uid) : null;
    if (['thue', 'vay'].includes(c.kind)) r.sign_l = `${pv ? 'HĐ thuê + HĐ vay' : c.kind === 'vay' ? 'HĐ vay' : 'HĐ thuê'} (bán căn) — ${r.sign_l}`;
    if (pv) r.number = [c.number, ...pv.map(v => v.number)].filter(Boolean).join(' + ');
    r.t_total = r.n_total + r.g_total + r.p_total + r.b_total; r.t_due = r.n_due + r.g_due + r.p_due + r.b_due; r.t_paid = r.n_paid + r.g_paid + r.p_paid + r.b_paid;
    r.t_left_due = pos(r.t_due - r.t_paid); r.t_left = r.t_total - r.t_paid; r.pct5 = Math.round(r.n_total * 0.05);
    r.overdue = all.reduce((s, x) => s + (['thue', 'vay'].includes(x.kind) ? Math.max(0, (x.sale_sched || []).filter(i => i.due_on < to).reduce((a, i) => a + +i.amount, 0) - (x.kind === 'thue' && pv ? vPaid(uid) : D.get(x.id)?.paid || 0)) : D.get(x.id)?.overdue || 0), 0);
    rows.push(r);
  }
  // điều kiện lọc theo tình trạng công nợ (07/11/2026)
  if (f.cond) { const F = DS_COND[f.cond]; if (!F) bad('Điều kiện lọc không hợp lệ'); rows.splice(0, rows.length, ...rows.filter(F[1])); }
  return { grps: DS_GRP, head: DS_HEAD.map(([g, cs]) => [g, cs.map(c => c.slice(0, 3))]), conds: Object.entries(DS_COND).map(([k, v]) => [k, v[0]]), sum: DS_SUM, rows, to, bravo_sync: await bravoSync(db) };
}
// xuất Excel đúng bố cục bảng: 2 tầng tiêu đề, dòng mục (1. HỢP ĐỒNG …), dòng cộng từng tòa, dòng Tổng cộng
function debtSummaryXlsx(d, q = '', hide = new Set()) {
  const { buildXlsx } = require('./xlsx');
  const HEAD = dsHead(hide), cols = HEAD.flatMap(([, cs]) => cs), n = cols.length, out = [], merges = [], styles = new Map(), L = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  const st = (ri, ci, v) => styles.set(ri + ':' + ci, v);
  const cell = (r, c) => { const v = r[c[0]]; if (v == null || v === '') return ''; return c[2] === 'date' ? C.dmy(v) : ['money', 'num', 'int'].includes(c[2]) ? +v : v; };
  out.push(['BẢNG TỔNG HỢP CÔNG NỢ - KINH DOANH']); merges.push(`A1:${L(n - 1)}1`); st(0, 0, 5);
  out.push([`Số liệu đến ngày ${C.dmy(d.to)} · thực thu Bravo${d.bravo_sync ? ' chốt ' + new Date(d.bravo_sync).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''}${q ? ` · lọc «${q}»` : ''}`]); merges.push(`A2:${L(n - 1)}2`);
  out.push([]);
  const h1 = [], h2 = []; let ci = 0;
  for (const [g, cs] of HEAD) {
    if (!g) for (const c of cs) { h1.push(c[1]); h2.push(''); merges.push(`${L(ci)}4:${L(ci)}5`); ci++; }
    else { cs.forEach((c, i) => { h1.push(i ? '' : g); h2.push(c[1]); }); merges.push(`${L(ci)}4:${L(ci + cs.length - 1)}4`); ci += cs.length; }
  }
  out.push(h1, h2); for (let i = 0; i < n; i++) { st(3, i, 4); st(4, i, 4); }
  const sumRow = (label, rs) => { const ri = out.length, row = cols.map(c => d.sum.includes(c[0]) ? rs.reduce((s, r) => s + (+r[c[0]] || 0), 0) : ''); row[1] = label; out.push(row); merges.push(`B${ri + 1}:H${ri + 1}`); for (let i = 0; i < n; i++) st(ri, i, i === 1 ? 9 : 8); };
  const many = new Set(d.rows.map(r => r.project)).size > 1;
  DS_GRP.filter(([g]) => d.rows.some(r => r.grp === g)).forEach(([g, gl], gi) => {
    const grs = d.rows.filter(r => r.grp === g);
    sumRow(`${gi + 1}. ${gl} (${grs.length})`, grs);
    for (const pj of [...new Set(grs.map(r => r.project))]) for (const b of [...new Set(grs.filter(r => r.project === pj).map(r => r.building))]) {
      const brs = grs.filter(r => r.project === pj && r.building === b); sumRow('Tòa ' + b + (many ? ' — ' + (brs[0].project_name || pj) : ''), brs);
      brs.forEach((r, i) => { const ri = out.length; out.push(cols.map(c => c[0] === 'stt' ? i + 1 : cell(r, c))); cols.forEach((c, j) => st(ri, j, c[2] === 'num' ? 10 : ['money', 'int'].includes(c[2]) ? 7 : 6)); });
    }
  });
  sumRow('Tổng cộng:', d.rows);
  const widths = cols.map(c => c[0] === 'stt' ? 6 : c[0] === 'address' ? 34 : c[0] === 'customer' ? 22 : c[2] === 'money' ? 15 : c[2] === 'num' ? 9 : c[2] === 'date' ? 11 : 15);
  return buildXlsx({ sheet: 'Bảng tổng hợp công nợ', rows: out, merges, widths, styleOf: (ri, ci) => styles.get(ri + ':' + ci) || null, heights: { 3: 30, 4: 45 } });
}

// ======================= CĂN ĐỦ ĐIỀU KIỆN BÀN GIAO =======================
const noPlan = r => (r.eligible && !r.handover_id) || r.ho_st === 'du_dk';   // đủ điều kiện, chưa lập lịch bàn giao
async function readyList(db, f = {}) {
  const cs = await signedContracts(db, f, "AND c.status = 'da_ky' AND c.kind IN ('hdmb','thue_mua')");
  const pct = (await C.setting('handover_pay_pct', db)) ?? 95;
  const ho = new Map((await db.q('SELECT id, unit_id, status, cond_tech, plan_at FROM kd_handover')).map(h => [h.unit_id, h]));
  return cs.map(c => {
    const h = ho.get(c.unit_id);
    const payOk = c.d.total > 0 && c.d.paid_pct >= pct && c.d.overdue === 0;
    return { unit_id: c.unit_id, unit: c.unit, project: c.project, building: c.building, customer: c.customer, phone: c.phone, contract_id: c.id, number: c.number, owner: c.owner, owner_id: c.owner_id,
      paid_pct: c.d.paid_pct, overdue: c.d.overdue, cond_contract: true, cond_pay: payOk, cond_tech: h?.cond_tech ?? null, eligible: payOk && (h ? h.cond_tech : true),
      handover_id: h?.id || null, ho_st: h?.status || null, handover_status: h ? C.F.handover.status.o.find(o => o[0] === h.status)?.[1] : null, plan_at: h?.plan_at || null, pct };
  }).filter(r => !r.handover_id || ['chua_du_dk', 'du_dk'].includes(ho.get(r.unit_id)?.status) || f.all);
}

// ======================= LỊCH KÝ =======================
async function signing(db, user, f) {
  const p = []; const w = uf(f, p);
  const rows = await db.q(`SELECT c.id, c.number, c.kind, c.plan_sign, c.sign_place, c.sign_status, c.status, c.value, u.code unit, u.id unit_id, pj.code project, pj.name project_name, k.full_name customer, k.phone, own.full_name owner
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pj ON pj.id = u.project_id JOIN kd_customer k ON k.id = c.customer_id LEFT JOIN kd_user own ON own.id = c.owner_id
    WHERE c.kind <> 'hoan_thien' AND c.status IN ('du_thao','cho_duyet','cho_ky','tu_choi') ${w} ${mine(user, 'c')} ORDER BY c.plan_sign NULLS LAST, c.number`, p);
  // hồ sơ NOXH đã hẹn ký nhưng chưa lập hợp đồng cũng lên lịch
  rows.push(...(await db.q(`SELECT n.id, 'noxh_check' ent, '' number, n.plan_sign, n.sign_place, n.sign_status, 'du_thao' status, coalesce(u.code, n.unit_text, '') unit, coalesce(pj.code, '') project, pj.name project_name, k.full_name customer, k.phone, own.full_name owner
    FROM kd_noxh_check n JOIN kd_customer k ON k.id = n.customer_id LEFT JOIN kd_unit u ON u.id = n.unit_id LEFT JOIN kd_project pj ON pj.id = coalesce(u.project_id, n.project_id) LEFT JOIN kd_user own ON own.id = n.owner_id
    WHERE n.plan_sign IS NOT NULL AND NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.customer_id = n.customer_id AND c.status NOT IN ('huy', 'thanh_ly')) ${nxw(w)} ${mine(user, 'n')}`, p)));
  const recent = await db.q(`SELECT c.id, c.number, c.signed_on, u.code unit, k.full_name customer FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id WHERE c.kind <> 'hoan_thien' AND c.status = 'da_ky' AND c.signed_on >= $${p.length + 1}::date - 30 ${w} ${mine(user, 'c')} ORDER BY c.signed_on DESC`, [...p, today()]);
  const signed = await db.q(`SELECT c.id, c.number, c.kind, c.plan_sign, c.signed_on, c.status, u.code unit, pj.code project, pj.name project_name, k.full_name customer, own.full_name owner, c.sign_place FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pj ON pj.id = u.project_id JOIN kd_customer k ON k.id = c.customer_id LEFT JOIN kd_user own ON own.id = c.owner_id WHERE c.kind <> 'hoan_thien' AND c.status = 'da_ky' AND c.signed_on IS NOT NULL ${w} ${mine(user, 'c')}`, p);
  // nhãn loại hợp đồng (HĐ mua bán / thuê / thuê mua…) cho cột «Loại hợp đồng»
  const KL = Object.fromEntries(E.contract.fields.find(x => x.k === 'kind').o.map(o => [o[0], o[1]]));
  for (const r of [...rows, ...signed]) r.kind_l = r.kind ? KL[r.kind] || r.kind : '';
  return { rows, recent, signed };
}

// ======================= KHO HỒ SƠ PHÁP LÝ =======================
async function vault(db, user, f) {
  const ents = Object.keys(E).filter(k => can(user, E[k], 'r'));
  const rows = await db.q(`SELECT f.id, f.ent, f.rec_id, f.kind, f.name, f.size, f.version, f.uploaded_at, f.deleted_at, us.full_name by, del.full_name deleted_by_name, st.user_id IS NOT NULL star FROM kd_file f LEFT JOIN kd_user us ON us.id = f.uploaded_by LEFT JOIN kd_user del ON del.id = f.deleted_by LEFT JOIN kd_file_star st ON st.file_id = f.id AND st.user_id = $2
    WHERE f.deleted_at IS ${f.trash ? 'NOT ' : ''}NULL AND f.ent = ANY($1) ${f.ent ? 'AND f.ent = $3' : ''} ORDER BY ${f.trash ? 'f.deleted_at' : 'f.uploaded_at'} DESC`, f.ent ? [ents, user.id, f.ent] : [ents, user.id]);
  // gắn mã căn / khách hàng
  const unitOf = {};
  for (const k of [...new Set(rows.map(r => r.ent))]) {
    const ux = C.unitExpr(E[k]), px = C.projExpr(E[k]); const ids = rows.filter(r => r.ent === k).map(r => r.rec_id);
    const cx = C.F[k].customer_id ? 't.customer_id' : C.F[k].contract_id ? '(SELECT customer_id FROM kd_contract c WHERE c.id = t.contract_id)' : 'NULL';
    for (const r of await db.q(`SELECT t.id, ${ux ? `(SELECT code FROM kd_unit u WHERE u.id = ${ux})` : 'NULL'} unit, ${ux || 'NULL'} unit_id, ${px || 'NULL'} project_id, (SELECT full_name FROM kd_customer k WHERE k.id = ${cx}) customer, ${E[k].disp} label FROM ${E[k].table} t WHERE t.id = ANY($1)`, [ids]))
      unitOf[k + r.id] = r;
  }
  let out = rows.map(r => ({ ...r, ...(unitOf[r.ent + r.rec_id] || {}), ent_l: E[r.ent].title, kind_l: (E[r.ent].files || []).find(x => x[0] === r.kind)?.[1] || r.kind || 'Tài liệu', id: r.id }));
  if (f.project) out = out.filter(r => r.project_id === +f.project);
  if (f.q) { const s = f.q.toLowerCase(); out = out.filter(r => [r.name, r.unit, r.customer, r.label].some(x => String(x || '').toLowerCase().includes(s))); }
  return out.slice(0, 2000);
}

// ======================= BÁO CÁO QUẢN TRỊ (11.1 – 11.7) =======================
const REPORTS = {
  sales: 'Báo cáo bán hàng theo dự án', revenue: 'Báo cáo doanh thu – công nợ', cashflow: 'Báo cáo dự kiến dòng tiền', docs: 'Báo cáo hồ sơ – hợp đồng',
  handover: 'Báo cáo bàn giao – cấp sổ', tickets: 'Báo cáo khiếu nại – tồn đọng', kpi: 'Báo cáo KPI nhân viên',
};
async function report(db, user, kind, f) {
  if (!['lanh_dao', 'truong_phong', 'admin'].includes(user.role) && !(kind === 'kpi' && user.role) ) deny('Báo cáo quản trị dành cho Trưởng phòng / Ban lãnh đạo');
  const P = period(f), M = monthsBetween(P.from, P.to);
  const cs = await signedContracts(db, f);
  const signedP = cs.filter(c => c.status === 'da_ky' && c.signed_on >= P.d1 && c.signed_on <= P.d2 && c.kind !== 'hoan_thien');
  const T = REPORTS[kind] || bad('Loại báo cáo không hợp lệ');
  const res = (cols, rows, extra = {}) => ({ title: T, period: P, cols, rows, generated_at: new Date().toISOString(), bravo_sync: null, ...extra });
  if (kind === 'sales') {
    const g = f.group || 'building', p = []; const w = uf(f, p);
    const units = await db.q(`SELECT u.id, u.status, pr.code project, b.code building FROM kd_unit u JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id WHERE true ${w}`, p);
    const resv = await db.q('SELECT id, agent_id, (SELECT name FROM kd_agent a WHERE a.id = r.agent_id) agent FROM kd_reservation r');
    const ag = new Map(resv.map(r => [r.id, r.agent || 'Bán trực tiếp']));
    const keyOf = c => g === 'owner' ? c.owner || '(chưa giao)' : g === 'agent' ? ag.get(c.reservation_id) || 'Bán trực tiếp' : g === 'project' ? c.project : `${c.project} · ${c.building}`;
    const map = new Map();
    const row = k => map.get(k) || map.set(k, { group: k, total: 0, left: 0, new_units: 0, new_value: 0, sold_all: 0 }).get(k);
    if (['building', 'project'].includes(g)) for (const u of units) { const r = row(g === 'project' ? u.project : `${u.project} · ${u.building}`); r.total++; if (u.status === 'con_ban') r.left++; if (['da_ky_hd', 'da_ban_giao'].includes(u.status)) r.sold_all++; }
    for (const c of signedP) { const r = row(keyOf(c)); r.new_units++; r.new_value += c.value; }
    const rows = [...map.values()].map(r => ({ ...r, rate: r.total ? Math.round(r.sold_all / r.total * 1000) / 10 : null }));
    return res([['group', { building: 'Dự án · tòa', project: 'Dự án', owner: 'Nhân viên', agent: 'Đại lý / CTV' }[g]], ['new_units', 'Căn bán mới (ký HĐ trong kỳ)', 'int'], ['new_value', 'Doanh số hợp đồng', 'money'], ['total', 'Tổng sản phẩm', 'int'], ['sold_all', 'Đã bán lũy kế', 'int'], ['left', 'Tồn (còn bán)', 'int'], ['rate', 'Tỷ lệ tiêu thụ (%)', 'num']], rows, { sum: ['new_units', 'new_value', 'total', 'sold_all', 'left'], groups: ['building', 'project', 'owner', 'agent'] });
  }
  if (kind === 'revenue') {
    const p2 = [P.d1, P.d2];
    const rc = await db.q("SELECT contract_id, sum(amount) s FROM kd_receipt WHERE status = 'hop_le' AND voucher_date BETWEEN $1 AND $2 GROUP BY 1", p2);
    const rcm = new Map(rc.map(r => [r.contract_id, r.s]));
    const map = new Map();
    for (const c of cs.filter(c => c.status === 'da_ky')) {
      const k = `${c.project} · ${c.building}`, r = map.get(k) || map.set(k, { group: k, contracts: 0, signed_p: 0, value: 0, total: 0, paid: 0, paid_p: 0, left: 0, due: 0, overdue: 0 }).get(k);
      r.contracts++; r.value += c.value; r.total += c.d.total; r.paid += c.d.paid; r.left += c.d.left; r.due += c.d.due; r.overdue += c.d.overdue; r.paid_p += rcm.get(c.id) || 0;
      if (signedP.includes(c)) r.signed_p += c.value;
    }
    return res([['group', 'Dự án · tòa'], ['contracts', 'Số HĐ hiệu lực', 'int'], ['signed_p', 'Doanh số ký trong kỳ', 'money'], ['total', 'Phải thu theo HĐ', 'money'], ['paid', 'Đã thu lũy kế', 'money'], ['paid_p', 'Thu trong kỳ (Bravo)', 'money'], ['left', 'Còn phải thu', 'money'], ['due', 'Nợ đến hạn', 'money'], ['overdue', 'Nợ quá hạn', 'money']], [...map.values()], { sum: ['contracts', 'signed_p', 'total', 'paid', 'paid_p', 'left', 'due', 'overdue'], bravo_sync: await bravoSync(db) });
  }
  if (kind === 'cashflow') {
    const p = [P.from, P.to]; const w = uf(f, p);
    const plan = await db.q(`SELECT cp.month m, sum(cp.expected) s, count(*) n FROM kd_collect_plan cp JOIN kd_unit u ON u.id = cp.unit_id WHERE cp.status = 'da_duyet' AND cp.month BETWEEN $1 AND $2 ${w} GROUP BY 1`, p);
    const p2 = [P.d1, P.d2]; const w2 = uf(f, p2);
    const act = await db.q(`SELECT to_char(r.voucher_date,'YYYY-MM') m, sum(r.amount) s FROM kd_receipt r JOIN kd_contract c ON c.id = r.contract_id JOIN kd_unit u ON u.id = c.unit_id WHERE r.status='hop_le' AND r.voucher_date BETWEEN $1 AND $2 ${w2} GROUP BY 1`, p2);
    // dự báo: phần chưa thu của các kỳ đến hạn trong tháng (theo lịch HĐ hiệu lực)
    const fc = {}; for (const c of cs.filter(c => c.status === 'da_ky')) for (const i of c.d.inst) if (i.rem > 0) { const mm = i.due_on < today() ? today().slice(0, 7) : i.due_on.slice(0, 7); fc[mm] = (fc[mm] || 0) + i.rem; }
    const miss = await db.q(`SELECT cp.month m, string_agg(DISTINCT cp.reason_miss, '; ') r FROM kd_collect_plan cp WHERE cp.status = 'da_duyet' AND cp.reason_miss IS NOT NULL AND cp.month BETWEEN $1 AND $2 GROUP BY 1`, [P.from, P.to]);
    const rows = M.map(m => { const pl = plan.find(x => x.m === m)?.s || 0, ac = act.find(x => x.m === m)?.s || 0; return { group: m.split('-').reverse().join('/'), schedule: fc[m] || 0, plan: pl, actual: ac, gap: ac - pl, rate: pl ? Math.round(ac / pl * 1000) / 10 : null, reason: miss.find(x => x.m === m)?.r || '' }; });
    return res([['group', 'Tháng'], ['schedule', 'Phải thu theo lịch HĐ (còn lại)', 'money'], ['plan', 'Kế hoạch thu (đã duyệt)', 'money'], ['actual', 'Thực thu (Bravo)', 'money'], ['gap', 'Chênh lệch', 'money'], ['rate', 'Tỷ lệ hoàn thành (%)', 'num'], ['reason', 'Nguyên nhân chưa đạt']], rows, { sum: ['plan', 'actual', 'gap'], bravo_sync: await bravoSync(db) });
  }
  if (kind === 'docs') {
    const p = [P.d1, P.d2]; const w = uf(f, p);
    const nx = await db.q(`SELECT n.status, n.result, count(*) n, count(*) FILTER (WHERE n.created_at::date BETWEEN $1 AND $2) n_p FROM kd_noxh_check n LEFT JOIN kd_unit u ON u.id = n.unit_id WHERE true ${nxw(w)} GROUP BY 1,2`, p);
    const p2 = [P.d1, P.d2]; const w2 = uf(f, p2);
    const ct = await db.q(`SELECT c.status, count(*) n, count(*) FILTER (WHERE c.plan_sign < CURRENT_DATE AND c.status IN ('du_thao','cho_duyet','cho_ky','tu_choi')) late, count(*) FILTER (WHERE c.signed_on BETWEEN $1 AND $2) n_p FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE c.kind <> 'hoan_thien' ${w2} GROUP BY 1`, p2);
    const L = (f, v) => f.o.find(o => o[0] === v)?.[1] || v;
    const rows = [
      ...nx.map(r => ({ group: 'Hồ sơ NOXH', status: `${L(C.F.noxh_check.status, r.status)} · ${L(C.F.noxh_check.result, r.result)}`, n: r.n, n_p: r.n_p, late: null })),
      ...ct.map(r => ({ group: 'Hợp đồng', status: L(C.F.contract.status, r.status), n: r.n, n_p: r.n_p, late: r.late })),
    ];
    return res([['group', 'Nhóm'], ['status', 'Trạng thái'], ['n', 'Số lượng', 'int'], ['n_p', 'Phát sinh trong kỳ', 'int'], ['late', 'Quá hạn dự kiến ký', 'int']], rows);
  }
  if (kind === 'handover') {
    const p = []; const w = uf(f, p);
    const hv = await db.q(`SELECT h.status, count(*) n, (SELECT count(*) FROM kd_defect d WHERE d.unit_id = ANY(array_agg(h.unit_id)) AND d.status <> 'da_nghiem_thu') open FROM kd_handover h JOIN kd_unit u ON u.id = h.unit_id WHERE true ${w} GROUP BY 1`, p);
    const p2 = []; const w2 = uf(f, p2);
    const sh = await db.q(`SELECT s.status, count(*) n, round(avg(CASE WHEN s.received_on IS NOT NULL THEN coalesce(s.submit_on, CURRENT_DATE) - s.received_on END)) d_in, round(avg(CASE WHEN s.submit_on IS NOT NULL THEN coalesce(s.result_on, CURRENT_DATE) - s.submit_on END)) d_out FROM kd_pinkbook s JOIN kd_unit u ON u.id = s.unit_id WHERE true ${w2} GROUP BY 1`, p2);
    const ready = (await readyList(db, f)).filter(r => r.eligible && !r.handover_id).length;
    const rows = [{ group: 'Bàn giao', status: 'Đủ điều kiện, chưa lập kế hoạch', n: ready },
      ...hv.map(r => ({ group: 'Bàn giao', status: C.F.handover.status.o.find(o => o[0] === r.status)?.[1], n: r.n, extra: r.open ? `${r.open} tồn tại mở` : '' })),
      ...sh.map(r => ({ group: 'Cấp sổ hồng', status: C.F.pinkbook.status.o.find(o => o[0] === r.status)?.[1], n: r.n, extra: [r.d_in != null ? `nội bộ TB ${r.d_in} ngày` : '', r.d_out != null ? `cơ quan TB ${r.d_out} ngày` : ''].filter(Boolean).join(' · ') }))];
    return res([['group', 'Nhóm'], ['status', 'Trạng thái'], ['n', 'Số căn', 'int'], ['extra', 'Ghi chú (thời gian xử lý / tồn tại)']], rows);
  }
  if (kind === 'tickets') {
    const p = [P.d1, P.d2];
    const rows = await db.q(`SELECT t.kind, t.dept, count(*) n, count(*) FILTER (WHERE t.status NOT IN ('da_phan_hoi','da_dong')) open,
        count(*) FILTER (WHERE t.status NOT IN ('da_phan_hoi','da_dong') AND t.due_at < now()) late,
        round(avg(EXTRACT(EPOCH FROM (coalesce((SELECT min(a.at) FROM kd_audit a WHERE a.ent = 'ticket' AND a.rec_id = t.id AND a.action = 'tt:reply'), now()) - t.at)) / 3600)) hours,
        round(avg(t.rating), 1) rating
      FROM kd_ticket t WHERE t.at::date BETWEEN $1 AND $2 GROUP BY 1, 2 ORDER BY 1, 2`, p);
    const L = (f, v) => (f.o || []).find(o => o[0] === v)?.[1] || v;
    const lk = (await C.lookups()).bo_phan || [];
    return res([['kind', 'Loại'], ['dept', 'Bộ phận'], ['n', 'Tiếp nhận', 'int'], ['open', 'Chưa giải quyết', 'int'], ['late', 'Quá hạn SLA', 'int'], ['hours', 'Thời gian phản hồi TB (giờ)', 'num'], ['rating', 'Hài lòng TB (1–5)', 'num']],
      rows.map(r => ({ ...r, kind: L(C.F.ticket.kind, r.kind), dept: lk.find(x => x[0] === r.dept)?.[1] || r.dept || '(chưa phân)' })), { sum: ['n', 'open', 'late'] });
  }
  if (kind === 'kpi') {
    const users = await db.q("SELECT id, full_name, role FROM kd_user WHERE active AND role IN ('ban_hang','cong_no','ho_so','cskh','truong_phong') ORDER BY role, full_name");
    const tg = await db.q('SELECT user_id, sum(target_units) tu, sum(target_sales) ts, sum(target_collect) tc FROM kd_target WHERE user_id IS NOT NULL AND period BETWEEN $1 AND $2 GROUP BY 1', [P.from, P.to]);
    const rc = await db.q("SELECT c.owner_id, sum(r.amount) s FROM kd_receipt r JOIN kd_contract c ON c.id = r.contract_id WHERE r.status = 'hop_le' AND r.voucher_date BETWEEN $1 AND $2 GROUP BY 1", [P.d1, P.d2]);
    const pc = await db.q("SELECT owner_id, sum(r.amount) s FROM kd_collect_plan cp JOIN kd_receipt r ON r.contract_id = cp.contract_id AND r.status = 'hop_le' AND to_char(r.voucher_date,'YYYY-MM') = cp.month WHERE cp.status = 'da_duyet' AND cp.month BETWEEN $1 AND $2 GROUP BY 1", [P.from, P.to]);
    const act = await db.q("SELECT owner_id, count(*) FILTER (WHERE t = 'log') logs, count(*) FILTER (WHERE t = 'call') calls FROM (SELECT owner_id, 'log' t FROM kd_contact_log WHERE at::date BETWEEN $1 AND $2 UNION ALL SELECT owner_id, 'call' FROM kd_debt_call WHERE at::date BETWEEN $1 AND $2) x GROUP BY 1", [P.d1, P.d2]);
    const tk = await db.q("SELECT assignee_id, count(*) n, count(*) FILTER (WHERE status IN ('da_phan_hoi','da_dong')) done FROM kd_ticket WHERE at::date BETWEEN $1 AND $2 GROUP BY 1", [P.d1, P.d2]);
    let rows = users.map(u => {
      const t = tg.find(x => x.user_id === u.id) || {}, sp = signedP.filter(c => c.owner_id === u.id);
      const collected = u.role === 'cong_no' ? pc.find(x => x.owner_id === u.id)?.s || 0 : rc.find(x => x.owner_id === u.id)?.s || 0;
      const a = act.find(x => x.owner_id === u.id) || {}, k = tk.find(x => x.assignee_id === u.id) || {};
      const units = sp.length, sales = sp.reduce((s, c) => s + c.value, 0);
      const parts = [t.tu ? units / t.tu : null, t.ts ? sales / t.ts : null, t.tc ? collected / t.tc : null].filter(x => x != null);
      return { group: u.full_name, role: require('./meta').ROLES.find(r => r[0] === u.role)[1], user_id: u.id, t_units: t.tu || null, units, t_sales: t.ts || null, sales, t_collect: t.tc || null, collected,
        rate: parts.length ? Math.round(parts.reduce((s, x) => s + x, 0) / parts.length * 1000) / 10 : null, logs: a.logs || 0, calls: a.calls || 0, tickets: k.n ? `${k.done}/${k.n}` : '' };
    });
    if (!['lanh_dao', 'truong_phong', 'admin'].includes(user.role)) rows = rows.filter(r => r.user_id === user.id);
    return res([['group', 'Nhân viên'], ['role', 'Vị trí'], ['t_units', 'CT số căn', 'int'], ['units', 'TH số căn', 'int'], ['t_sales', 'CT doanh số', 'money'], ['sales', 'TH doanh số', 'money'], ['t_collect', 'CT thu tiền', 'money'], ['collected', 'TH thu tiền', 'money'], ['rate', 'Tỷ lệ hoàn thành (%)', 'num'], ['logs', 'Lượt tư vấn', 'int'], ['calls', 'Lượt nhắc nợ', 'int'], ['tickets', 'Phiếu CSKH xong / nhận']], rows);
  }
}

// báo cáo điều hành tháng (BC-01) — ảnh chụp số liệu tại thời điểm chốt
async function monthly(db, period, projectId) {
  const f = { from: period, to: period, project: projectId || '' };
  const d = await dashboard(db, C.SYS, f);
  const al = await alerts(db, C.SYS, { all: true, project: projectId || '' });
  const cs = (await signedContracts(db, f, "AND c.status = 'da_ky'")).filter(c => c.d.overdue > 0).sort((a, b) => b.d.overdue - a.d.overdue).slice(0, 15);
  return {
    period, project_id: projectId || null, generated_at: new Date().toISOString(), bravo_sync: d.bravo_sync,
    kpi: [
      ['Doanh số ký hợp đồng', d.kpi.revenue, 'money', 'Hợp đồng đã ký trong tháng (App)', 'revenue'],
      ['Chỉ tiêu doanh số', d.kpi.revenue_target, 'money', 'Chỉ tiêu kinh doanh (App)', null],
      ['Số căn bán mới', d.kpi.units_sold_period, 'int', 'Hợp đồng đã ký trong tháng (App)', 'revenue'],
      ['Thực thu', d.kpi.collected, 'money', `Chứng từ Bravo — chốt đến ${d.bravo_sync ? new Date(d.bravo_sync).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'chưa đồng bộ'}`, 'collected'],
      ['Kế hoạch thu', d.kpi.collect_plan, 'money', 'Kế hoạch CN-03 bản đã duyệt', 'plan:' + period],
      ['Chênh lệch thực thu – kế hoạch', d.kpi.collected - d.kpi.collect_plan, 'money', 'Tự tính', null],
      ['Công nợ còn lại', d.kpi.debt_left, 'money', 'Lịch thanh toán HĐ hiệu lực – thực thu', 'debt:left'],
      ['Nợ quá hạn', d.kpi.debt_overdue, 'money', 'Kỳ thu quá ngày đến hạn chưa thu đủ', 'debt:overdue'],
      ['Căn đã bán lũy kế', d.kpi.units_sold, 'int', 'Trạng thái giỏ hàng', 'units:sold'],
      ['Căn còn bán', d.kpi.units_left, 'int', 'Trạng thái giỏ hàng', 'units:con_ban'],
      ['Căn đã bàn giao', d.kpi.units_handed, 'int', 'Trạng thái giỏ hàng', 'units:da_ban_giao'],
      ['Tồn đọng cần xử lý', al.length, 'int', 'Cảnh báo tự động', 'alerts'],
    ],
    byBuilding: d.byBuilding, progress: d.progress,
    backlog: Object.entries(al.reduce((a, x) => { a[x.cat] = (a[x.cat] || 0) + 1; return a; }, {})).map(([k, n]) => [ALERT_CAT[k], n]),
    overdue_top: cs.map(c => ({ unit: c.unit, customer: c.customer, overdue: c.d.overdue, days: c.d.overdue_days, owner: c.owner })),
  };
}

module.exports = { ypList, ypGet, ypSave, ypDecide, ypNewVer, ypDel, dueDebt, ddPlanToggle, ddUnitHist, ddUnitDetail, saleUnits, saleUnitPlan, saleUnitSched, planSplitWeeks, salePlanCreate, planLink, planList, planReport, planAdjust, planRollover, planYear, debtStatus, setDebtClass, setDebtDays, debtCfg, debtGrpOf, debtGrpL, customerLedger, myDay, debtSummary, debtSummaryXlsx, loanTrack, loanItems, contractVouchers, voucherList, contractTrack, setLateRate, unitStatus, payouts, loans, finishPay, priceSheet, dashboard, drill, alerts, ALERT_CAT, approvals, approvalsFor, board, unit360, customer360, search, ledger, readyList, signing, vault, report, REPORTS, monthly, signedContracts, period };
