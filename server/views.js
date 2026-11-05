// Các màn tổng hợp (không phải form): Dashboard + truy xuất chi tiết, cảnh báo, hộp phê duyệt, bảng hàng,
// hồ sơ 360°, sổ công nợ, căn đủ điều kiện bàn giao, lịch ký, kho hồ sơ, báo cáo quản trị, báo cáo tháng.
// Mọi số liệu có nguồn: «App» (dữ liệu nghiệp vụ) hoặc «Bravo» (chứng từ thu đã đồng bộ, kèm ngày chốt).
const C = require('./core');
const B = require('./biz');
const { E, MGR, PII_ROLES } = require('./meta');
const { today, addDays, dayDiff, fmtMoney, can, deny, bad } = C;

const STAFF_SCOPE = ['ban_hang', 'cong_no', 'ho_so', 'cskh'];
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
  const push = (cat, lvl, text, ent, id, due, who, unit_id, ownerId) => { if (mineOnly && ownerId && ownerId !== me) return; out.push({ cat, lvl, text, ent, id, due, who, unit_id }); };
  const p = []; const w = uf(f, p);
  for (const a of await approvalsFor(db, user)) push('phe_duyet', 'a', a.title, a.ent, a.rec_id, String(a.requested_at).slice(0, 10), a.requested_by_l);
  for (const r of await db.q(`SELECT r.id, r.code, r.status, r.hold_until, r.owner_id, u.code unit, u.id unit_id, k.full_name, own.full_name who FROM kd_reservation r JOIN kd_unit u ON u.id = r.unit_id JOIN kd_customer k ON k.id = r.customer_id LEFT JOIN kd_user own ON own.id = r.owner_id
    WHERE (r.status = 'qua_han' OR (r.status IN ('giu_cho','da_coc') AND r.hold_until < now() + interval '24 hours')) ${w}`, p))
    push('giu_cho', r.status === 'qua_han' ? 'r' : 'a', `${r.unit} · ${r.full_name} — ${r.status === 'qua_han' ? 'đã quá hạn giữ chỗ, cần gia hạn / giải phóng / lập HĐ' : 'hết hạn giữ chỗ trong 24h'}`, 'reservation', r.id, String(r.hold_until).slice(0, 10), r.who, r.unit_id, r.owner_id);
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
  const cs = await signedContracts(db, f, "AND c.status = 'da_ky'");
  for (const c of cs) {
    if (c.d.overdue > 0) push('no_qua_han', c.d.overdue_days > 30 ? 'r' : 'a', `${c.unit} · ${c.customer} — quá hạn ${fmtMoney(c.d.overdue)}đ (${c.d.overdue_days} ngày)`, 'contract', c.id, c.d.overdue_since, c.owner, c.unit_id, c.owner_id);
    else if (c.d.due7 > 0) push('den_han', 'b', `${c.unit} · ${c.customer} — ${c.d.next?.name || 'kỳ thu'} ${fmtMoney(c.d.due7)}đ đến hạn ${C.dmy(c.d.next?.due_on)}`, 'contract', c.id, c.d.next?.due_on, c.owner, c.unit_id, c.owner_id);
  }
  const calls = await db.q(`SELECT DISTINCT ON (d.contract_id) d.*, u.code unit, u.id unit_id, k.full_name, own.full_name who FROM kd_debt_call d JOIN kd_contract c ON c.id = d.contract_id JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id LEFT JOIN kd_user own ON own.id = d.owner_id
    WHERE (d.promise_on BETWEEN $${p.length + 1}::date - 10 AND $${p.length + 1}::date OR d.next_on <= $${p.length + 1}::date) ${w} ORDER BY d.contract_id, d.at DESC`, [...p, t]);
  await B.H.debt_call.decorate(calls, { db });
  for (const d of calls) {
    if (d.promise_on && d.promise_on <= t && d.promise_st === 'Thất hẹn') push('cam_ket', 'r', `${d.unit} · ${d.full_name} — thất hẹn cam kết ${fmtMoney(d.promise_amount)}đ ngày ${C.dmy(d.promise_on)}`, 'debt_call', d.id, d.promise_on, d.who, d.unit_id, d.owner_id);
    else if (d.promise_on === t) push('cam_ket', 'a', `${d.unit} · ${d.full_name} — hôm nay hẹn thanh toán ${fmtMoney(d.promise_amount)}đ`, 'debt_call', d.id, d.promise_on, d.who, d.unit_id, d.owner_id);
    else if (d.next_on && d.next_on <= t) push('lien_he', 'b', `${d.unit} · ${d.full_name} — đến lịch gọi nhắc nợ lại`, 'debt_call', d.id, d.next_on, d.who, d.unit_id, d.owner_id);
  }
  for (const l of await db.q(`SELECT DISTINCT ON (l.customer_id) l.id, l.next_at, l.owner_id, k.full_name, k.code, own.full_name who FROM kd_contact_log l JOIN kd_customer k ON k.id = l.customer_id LEFT JOIN kd_user own ON own.id = l.owner_id
    WHERE l.next_at <= $1 AND l.next_at >= $1::date - 14 AND NOT EXISTS (SELECT 1 FROM kd_contact_log x WHERE x.customer_id = l.customer_id AND x.at::date >= l.next_at) ORDER BY l.customer_id, l.at DESC`, [t]))
    push('lien_he', 'b', `${l.code} · ${l.full_name} — hẹn liên hệ lại ${C.dmy(l.next_at)}`, 'contact_log', l.id, l.next_at, l.who, null, l.owner_id);
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

// ======================= PHÊ DUYỆT =======================
async function approvalsFor(db, user) {
  return db.q(`SELECT a.*, r.full_name requested_by_l FROM kd_approval a LEFT JOIN kd_user r ON r.id = a.requested_by
    WHERE a.status = 'cho_duyet' AND (a.requested_by IS DISTINCT FROM $1 OR $2 = 'admin') AND (CASE WHEN a.approver_id IS NOT NULL THEN a.approver_id = $1 OR $2 = 'admin' ELSE $2 = ANY(a.roles) OR $2 = 'admin' END)
    ORDER BY a.requested_at`, [user.id, user.role]);
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

// ======================= THEO DÕI HĐ VAY — LÃI & GỐC (CN-07) =======================
// gốc: khách chuyển theo các đợt giải ngân (lịch thu + phiếu thu của HĐ vay); lãi / gốc công ty phải trả khách: kd_loan_pay
const LP_ST = { qua_han: 'Quá hạn trả lãi', sap_toi: 'Đến hạn trong 7 ngày', dao_han: 'Đáo hạn trong 30 ngày', dang: 'Đang vay', xong: 'Đã trả hết' };
async function loanTrack(db, user, f = {}) {
  if (!can(user, E.installment, 'r')) deny();
  const p = [], t = today(), t7 = addDays(t, 7), t30 = addDays(t, 30);
  const cs = await db.q(`SELECT c.id, c.number, c.status, c.value, c.contract_on, c.signed_on, pr.name project_name, c.loan_recv_on, c.eff_on, c.exp_on, c.term_months, c.int_mode, c.loan_rate, c.rent, c.int_period, c.principal_method, c.nature, c.next_id, c.link_ids,
      u.code unit, pr.code project, b.code building, k.full_name customer, coalesce(c.b_phone, k.phone) phone,
      (SELECT string_agg(x.number, ', ') FROM kd_contract x WHERE x.id = ANY(c.link_ids)) links
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id JOIN kd_customer k ON k.id = c.customer_id
    WHERE c.kind = 'vay' AND c.status <> 'huy' ${uf(f, p)}${mine(user, 'c')} ORDER BY c.exp_on NULLS LAST, u.code`, p);
  const ids = cs.map(c => c.id);
  await B.loanRebase(db, ids);   // lãi theo gốc khách đã chuyển (phiếu thu mới / đã hủy)
  const D = await B.debtOf(db, ids);
  const L = await db.q('SELECT * FROM kd_loan_pay WHERE contract_id = ANY($1) ORDER BY due_on, kind DESC, seq', [ids]);
  const rem = x => Math.max(0, +x.amount - (+x.paid_amt || 0)), sum = (xs, fn) => xs.reduce((a, x) => a + fn(x), 0);
  // lãi dồn tích đến hết hôm nay: kỳ đã kết thúc tính đủ, kỳ đang chạy tính theo số ngày đã qua / số ngày của kỳ, kỳ chưa tới = 0
  const accrued = x => !x.period_from || x.period_from > t ? 0 : !x.period_to || x.period_to <= t ? +x.amount : +x.amount * (dayDiff(x.period_from, t) + 1) / (dayDiff(x.period_from, x.period_to) + 1);
  const ML = { tien_thue: 'Tiền thuê 1 tháng / tháng', lai_suat: 'Lãi suất' }, PL = { 1: 'Hàng tháng', 3: 'Hàng quý', 6: '6 tháng', 12: 'Hàng năm', 0: 'Khi đáo hạn' };
  const rows = cs.map(c => {
    const ls = L.filter(x => x.contract_id === c.id), lai = ls.filter(x => x.kind === 'lai'), goc = ls.filter(x => x.kind === 'goc'), next = ls.find(x => rem(x) > 0), d = D.get(c.id);
    const laiQH = sum(lai.filter(x => x.due_on < t), rem), left = sum(ls, rem);
    const state = !ls.length ? 'dang' : !left && d.paid > 0 ? 'xong' : laiQH > 0 ? 'qua_han' : next && next.due_on <= t7 ? 'sap_toi' : c.exp_on && c.exp_on <= t30 ? 'dao_han' : 'dang';
    return { contract_id: c.id, project: c.project, building: c.building, unit: c.unit, customer: c.customer, phone: c.phone, number: c.number, links: c.links || '', nature_l: c.nature === 'ban' ? 'Bán căn hộ' : 'Cho thuê',
      goc_hd: +c.value, goc_nhan: d.paid, goc_cho: d.left, eff_on: c.eff_on, exp_on: c.exp_on, term_months: c.term_months, mode_l: c.int_mode === 'lai_suat' ? `${ML.lai_suat} ${c.loan_rate ?? ''}%/năm` : ML.tien_thue, rent: c.int_mode === 'tien_thue' ? +c.rent : null, period_l: PL[c.int_period] || '',
      project_name: c.project_name, signed_on: c.signed_on || c.contract_on, term_l: c.term_months ? `${c.term_months} tháng` : '',
      rate_l: c.int_mode === 'lai_suat' ? (c.loan_rate != null ? `${String(c.loan_rate).replace('.', ',')}%/năm` : '') : c.rent ? `Bằng tiền thuê ${fmtMoney(+c.rent)}/tháng` : 'Bằng tiền thuê',
      lai_tong: sum(lai, x => +x.amount), lai_tra: sum(lai, x => +x.paid_amt || 0), lai_con: sum(lai, rem), lai_den_nay: Math.max(0, Math.round(sum(lai, accrued) - sum(lai, x => +x.paid_amt || 0))), lai_qua_han: laiQH, goc_tra: sum(goc, x => +x.paid_amt || 0), goc_tra_con: sum(goc, rem),
      next_on: next?.due_on || null, next_amt: next ? rem(next) : null, next_l: next ? (next.kind === 'lai' ? `Lãi kỳ ${next.seq}` : 'Trả gốc') : '', state, state_l: LP_ST[state] };
  });
  return { rows, states: LP_ST };
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
  const c = await db.one('SELECT c.id, c.number, c.kind, c.owner_id, c.created_by, c.late_rate, u.code unit, k.full_name customer FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id WHERE c.id = $1', [+id]);
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
  const asof = isoDay(qs.to) || today(), rate = c.late_rate != null ? +c.late_rate : null;
  const inst = c.kind === 'vay' ? null : instDebt((await B.debtOf(db, [c.id], asof)).get(c.id), asof, rate);
  return { contract: { id: c.id, number: c.number, kind: c.kind, unit: c.unit, customer: c.customer }, thu, chi, thu_sum: s(thu), chi_sum: s(chi), inst, asof, late_rate: rate,
    can_thu: can(user, E.receipt, 'c'), can_chi: can(user, E.payment, 'c') };
}

// ======================= THEO DÕI HỢP ĐỒNG THUÊ / MUA BÁN / HOÀN THIỆN (CN-07) =======================
// công nợ khách phải trả công ty theo lịch thu (kd_installment) + phiếu thu hợp lệ (kd_receipt); HĐ vay xem loanTrack
const CT_KIND = { thue: ['thue', 'thue_mua'], hdmb: ['hdmb'], hoan_thien: ['hoan_thien'] };
const CT_ST = { qua_han: 'Quá hạn thu', sap_toi: 'Đến hạn trong 7 ngày', het_han: 'Hết hạn trong 30 ngày', dang: 'Đang thu', xong: 'Đã thu đủ', chua_lich: 'Chưa có lịch thu' };
async function contractTrack(db, user, f = {}) {
  if (!can(user, E.installment, 'r')) deny();
  const kinds = CT_KIND[f.kind]; if (!kinds) bad('Loại hợp đồng không hợp lệ');
  // HĐ mua bán: chọn «Từ ngày – Đến ngày» — phải thu theo tiến độ = các kỳ có hạn trong khoảng; đã thu / số ngày quá hạn / lãi quá hạn tính đến «Đến ngày»
  // (ngày tương lai: tính như khách chưa trả thêm đến ngày đó)
  const hd = f.kind === 'hdmb', to = (hd && isoDay(f.to)) || today(), from = (hd && isoDay(f.from)) || null;
  if (from && from > to) bad('«Từ ngày» sau «Đến ngày»');
  const p = [kinds], t = to, t30 = addDays(t, 30);
  const cs = await db.q(`SELECT c.id, c.number, c.kind, c.status, c.value, c.rent, c.deposit, c.term_months, c.pay_times, c.contract_on, c.signed_on, c.eff_on, c.exp_on,
      c.maint_fee, c.after_tax, c.finish_value, c.late_rate,
      u.code unit, pr.code project, pr.name project_name, b.code building, b.name building_name, k.full_name customer, coalesce(c.b_phone, k.phone) phone, own.full_name owner,
      (SELECT n.body FROM kd_note n WHERE n.ent = 'contract' AND n.rec_id = c.id ORDER BY n.at DESC, n.id DESC LIMIT 1) note
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id JOIN kd_customer k ON k.id = c.customer_id
      LEFT JOIN kd_user own ON own.id = c.owner_id
    WHERE c.kind = ANY($1) AND c.status <> 'huy' ${uf(f, p)}${mine(user, 'c')} ORDER BY pr.code, u.code, c.id`, p);
  const D = await B.debtOf(db, cs.map(c => c.id), t);
  // phiếu chi hợp lệ (hoàn tiền / hoàn cọc / khác) — số công ty đã trả lại khách
  const PC = new Map((await db.q("SELECT contract_id, sum(amount) s, count(*) n FROM kd_payment WHERE status = 'hop_le' AND contract_id = ANY($1) AND voucher_date <= $2 GROUP BY 1", [cs.map(c => c.id), t])).map(x => [x.contract_id, x]));
  // HĐ mua bán: phiếu thu hợp lệ đến t — tách tiền nhà / phí bảo trì theo đợt thu ghi trên phiếu (đợt phí bảo trì → phí bảo trì, còn lại → tiền nhà); *w = thu trong khoảng «Từ ngày»
  const RC = new Map(hd ? (await db.q(`SELECT r.contract_id, sum(r.amount) FILTER (WHERE NOT coalesce(i.is_maint, false)) h, sum(r.amount) FILTER (WHERE i.is_maint) m,
      sum(r.amount) FILTER (WHERE NOT coalesce(i.is_maint, false) AND r.voucher_date >= $3) hw, sum(r.amount) FILTER (WHERE i.is_maint AND r.voucher_date >= $3) mw
    FROM kd_receipt r LEFT JOIN kd_installment i ON i.id = r.installment_id WHERE r.status = 'hop_le' AND r.contract_id = ANY($1) AND r.voucher_date <= $2 GROUP BY 1`, [cs.map(c => c.id), t, from || '1900-01-01'])).map(x => [x.contract_id, x]) : []);
  const opt = k => Object.fromEntries(E.contract.fields.find(x => x.k === k).o.map(o => [o[0], o[1]])), KL = opt('kind'), SL = opt('status'), t7 = addDays(t, 7);
  const rows = cs.map(c => {
    const d = D.get(c.id), rent = c.kind === 'thue' || c.kind === 'thue_mua';
    const state = !d.inst.length ? 'chua_lich' : d.overdue > 0 ? 'qua_han' : d.left <= 0 ? 'xong' : d.due7 > 0 ? 'sap_toi' : rent && c.exp_on && c.exp_on >= t && c.exp_on <= t30 ? 'het_han' : 'dang';
    const row = { contract_id: c.id, project: c.project, building: c.building, unit: c.unit, customer: c.customer, phone: c.phone, number: c.number, kind_l: KL[c.kind] || c.kind, status_l: SL[c.status] || c.status,
      signed_on: c.signed_on || c.contract_on, rent: rent ? +c.rent || null : null, eff_on: c.eff_on, exp_on: c.exp_on, value: +c.value || 0,
      total: d.total, paid: d.paid, paid_pct: d.paid_pct, left: d.left, overdue: d.overdue, overdue_days: d.overdue_days || null, due7: d.due7,
      next_name: d.next?.name || '', next_on: d.next?.due_on || null, next_amt: d.next?.rem ?? null, last_receipt: d.last_receipt, state, state_l: CT_ST[state] };
    row.chi = +(PC.get(c.id)?.s || 0); row.net = row.paid - row.chi;   // đã chi trả lại khách · thực giữ = đã thu − đã chi
    if (hd) {
      // theo mẫu «Bảng theo dõi hợp đồng mua bán» + công thức phòng KD (05/11/2026), Tổng cộng = Tiền nhà + Phí bảo trì (cộng từng cột):
      //  tiền nhà: giá trị = tiền sau thuế (+ hoàn thiện nếu gộp HĐMB) · phải thu theo tiến độ = các đợt có hạn trong khoảng ngày · đã thu = phiếu thu (có «Từ ngày»: thu trong khoảng)
      //            còn lại theo tiến độ = phải thu − đã thu · còn lại theo hợp đồng = giá trị − tổng đã thu đến t
      //  phí bảo trì: số phải thu = phí bảo trì (không theo hạn đợt) · còn lại = phí bảo trì − tổng đã thu phí bảo trì đến t
      const x = RC.get(c.id) || {}, n = k => +x[k] || 0, from_ = k => from ? n(k + 'w') : n(k), win = i => i.due_on <= to && (!from || i.due_on >= from);
      const hDue = d.inst.filter(i => !i.is_maint && win(i)).reduce((a, i) => a + +i.amount, 0), hPaid = from_('h'), mPaid = from_('m');
      const hv = c.after_tax != null ? +c.after_tax + (+c.finish_value || 0) : row.value - (+c.maint_fee || 0), mv = +c.maint_fee || 0, mLeft = mv - n('m'), rate = c.late_rate != null ? +c.late_rate : null;
      Object.assign(row, { h_value: hv, h_due: hDue, h_paid: hPaid, h_left_due: hDue - hPaid, h_left: hv - n('h'), m_value: mv, m_paid: mPaid, m_left_due: mLeft,
        t_due: hDue + mv, t_paid: hPaid + mPaid, t_left_due: hDue - hPaid + mLeft, t_left: hv + mv - n('h') - n('m'),
        late_rate: rate, late_int: rate ? instDebt(d, t, rate).reduce((a, i) => a + i.late, 0) : null });
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
        deposit: c.deposit != null ? +c.deposit : null, due_sched: due, paid_sched: d.paid, left_sched: left,
        cur_l: cur ? `${cur.name || 'Kỳ ' + seq}${d.inst.length > 1 ? ` (${seq}/${d.inst.length})` : ''}` : '', han_on: han, remind: pay + exp, owner: c.owner || '', note: c.note || '' });
    }
    return row;
  });
  return { rows: from ? rows.filter(r => r.t_due > 0 || r.t_paid > 0) : rows, states: CT_ST, from, to, asof: t, can_rate: hd && canRate(user) };   // có «Từ ngày»: chỉ HĐ có đợt phải thu / có thu trong khoảng
}
// công nợ từng đợt (đã thu chia vào đợt theo B.debtOf, các đợt xếp theo hạn): còn lại = phải thu − đã thu của đợt; số ngày quá hạn = t − hạn (đợt còn nợ)
// số tiền quá hạn lũy kế = cộng dồn phần còn lại chưa thanh toán của các đợt đã quá hạn tới đợt này;
// lãi quá hạn của đợt = số tiền quá hạn lũy kế × số ngày tính lãi (từ hạn đợt này đến hạn đợt sau, đợt quá hạn cuối: đến t) × lãi suất (%/năm) / 365
// → cộng các đợt = Σ còn lại từng đợt × số ngày quá hạn của đợt đó × lãi suất / 365
function instDebt(d, t, rate) {
  let no = 0, cum = 0;
  const I = d.inst;
  return I.map((i, k) => {
    const rem = Math.max(0, i.rem), over = i.due_on < t, days = rem > 0 && over ? dayDiff(i.due_on, t) : 0;
    if (over) cum += rem;
    const nx = I[k + 1], same = nx && nx.due_on === i.due_on;   // nhiều đợt cùng hạn: tính lãi 1 lần ở đợt cuối của nhóm
    const end = over && cum > 0 && !same ? (nx && nx.due_on < t ? nx.due_on : t) : null, ldays = end ? dayDiff(i.due_on, end) : 0;
    return { id: i.id, no: i.is_maint ? null : ++no, name: i.name, due_on: i.due_on, is_maint: !!i.is_maint, amount: +i.amount, paid: +i.paid, rem, days: days || null,
      od: over && cum > 0 ? cum : null, l_from: end ? i.due_on : null, l_to: end, ldays: ldays || null,
      rate: rate || null, late: rate && ldays ? Math.round(cum * ldays * rate / 100 / 365) : 0, st: i.st, st_l: B.PAY_ST[i.st] };
  });
}
// lãi suất quá hạn (%/năm) điền theo từng hợp đồng ở Theo dõi hợp đồng › HĐ mua bán
const canRate = u => can(u, E.contract, 'u') || can(u, E.receipt, 'u');
async function setLateRate(db, user, id, v) {   // db: trong giao dịch (tx)
  if (!canRate(user)) deny();
  const rate = v === '' || v == null ? null : +String(v).replace(',', '.');
  if (rate != null && !(rate >= 0 && rate <= 100)) bad('Lãi suất quá hạn phải từ 0 đến 100 (%/năm)');
  const c = await db.one('SELECT id, owner_id, created_by, late_rate FROM kd_contract WHERE id = $1', [+id]); if (!c) bad('Không tìm thấy hợp đồng');
  if (C.own(user, E.customer) && c.owner_id !== user.id && c.created_by !== user.id) deny();
  await C.sys(db, 'contract', c.id, { late_rate: rate }, user, 'sua_lai_suat_qua_han', `Lãi suất quá hạn: ${c.late_rate ?? 'trống'} → ${rate ?? 'trống'} %/năm`);
  return { ok: true, late_rate: rate };
}

// ======================= CHI TIẾT BẢNG GIÁ THEO CĂN =======================
// Giá sau thuế lấy từ bảng hàng (mode bang_hang) hoặc đơn giá × DT thông thủy (mode don_gia, cùng cách tính với B.pricing);
// tách ngược ra giá trước thuế / tiền thuế theo % VAT của chính sách, đơn giá nền = trước thuế / DT thông thủy.
// bảng theo dõi hủy giao dịch, thanh lý hợp đồng và chi trả tiền (theo file Excel của phòng Kinh doanh)
async function payouts(db, user, f = {}) {
  if (!can(user, E.cancel_req, 'r')) deny();
  const p = []; const w = uf(f, p);
  return db.q(`SELECT t.id, t.code, t.kind, t.status, t.money_plan, t.liquidate_on, t.wait_days, t.pay_due, t.pay_amount, t.acct_status, t.acct_on, t.pay_status, t.paid_on, t.note,
      c.number contract_no, c.status contract_status, u.code unit, pj.code project, coalesce(k.full_name, r.cust_name) customer, coalesce(k.phone, r.phone) phone
    FROM kd_cancel_req t LEFT JOIN kd_reservation r ON r.id = t.reservation_id LEFT JOIN kd_contract c ON c.id = t.contract_id
    LEFT JOIN kd_unit u ON u.id = coalesce(c.unit_id, r.unit_id) LEFT JOIN kd_project pj ON pj.id = u.project_id
    LEFT JOIN kd_customer k ON k.id = coalesce(c.customer_id, r.customer_id) WHERE true ${w} ORDER BY t.pay_due NULLS LAST, t.id DESC`, p);
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
  (contracts || []).forEach(x => { x._debt = D.get(x.id); });
  const out = { customer: c, contracts, reservations: await get('reservation', 't.customer_id = $1', [c.id]), logs: await get('contact_log', 't.customer_id = $1', [c.id], 't.at DESC'),
    tickets: await get('ticket', 't.customer_id = $1', [c.id]), noxh: await get('noxh_check', 't.customer_id = $1', [c.id]), pinkbook: await get('pinkbook', 't.customer_id = $1', [c.id]) };
  if (out.reservations) await B.H.reservation.decorate(out.reservations, { db });
  return out;
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
      out.push({ type: 'customer', id: r.id, title: `${r.code} · ${r.full_name}`, sub: `ĐT ${r.phone}` });
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
// Tách khoản: Tiền nhà (sau thuế, không gồm hệ số góc) · Hệ số lô góc (sau thuế) · Phát sinh (hoàn thiện gộp HĐMB + HĐ hoàn thiện riêng) · Bảo trì.
// Thu không ghi theo khoản → mỗi kỳ thu chia theo cơ cấu của kỳ: kỳ «Đợt thu phí bảo trì» gánh trọn phí bảo trì, phần còn lại chia theo tỷ lệ tiền nhà / góc / hoàn thiện.
const DS_HEAD = [
  ['', [['stt', 'Stt', 'int'], ['unit', 'Mã căn hộ'], ['cust_code', 'Mã khách hàng'], ['customer', 'Họ và tên'], ['address', 'Địa chỉ'], ['contract_on', 'Ngày ký hợp đồng', 'date'], ['vbtt_on', 'Ngày ký VBTT', 'date'], ['phone', 'SĐT'],
    ['area_floor', 'DT sàn', 'num'], ['area_tt', 'DT nền', 'num'], ['base_price', 'Giá nền', 'money'], ['build_price', 'Giá xây dựng', 'money']]],
  ['Tiền nhà', [['n_total', 'Tổng phải thu', 'money'], ['n_due', 'Phải thu theo tiến độ', 'money'], ['n_paid', 'Tổng đã thu', 'money'], ['n_left', 'Còn lại', 'money'], ['n_left_due', 'Còn lại theo tiến độ', 'money']]],
  ['Hệ số lô góc', [['g_total', 'Tổng phải thu', 'money'], ['g_due', 'Phải thu theo tiến độ', 'money'], ['g_paid', 'Tổng đã thu', 'money'], ['g_left', 'Còn lại', 'money']]],
  ['Phát sinh', [['p_total', 'Tổng phải thu', 'money'], ['p_due', 'Phải thu theo tiến độ', 'money'], ['p_paid', 'Tổng đã thu', 'money'], ['p_left', 'Còn lại', 'money'], ['p_left_due', 'Còn lại theo tiến độ', 'money']]],
  ['Bảo trì', [['b_total', 'Tổng phải thu', 'money'], ['b_due', 'Phải thu theo tiến độ', 'money'], ['b_paid', 'Tổng đã thu', 'money'], ['b_left', 'Còn lại', 'money']]],
  ['Tổng hợp', [['value', 'Giá trị hợp đồng', 'money'], ['t_total', 'Tổng phải thu', 'money'], ['t_due', 'Tổng phải thu theo tiến độ', 'money'], ['t_paid', 'Tổng đã thu', 'money'], ['t_left_due', 'Số còn lại theo tiến độ', 'money'], ['t_left', 'Còn lại theo hợp đồng', 'money'], ['pct5', '5 % theo hợp đồng', 'money']]],
  ['Kế toán', [['k_old', 'Thu quá khứ', 'money'], ['k_new', 'Thu phát sinh', 'money'], ['k_paid', 'Tổng đã thu', 'money'], ['k_debt', 'Công nợ còn lại', 'money']]],
  ['', [['common_amt', 'Tiền diện tích sử dụng chung đã chi', 'money'], ['sign_l', 'Ký hợp đồng'], ['tax_code', 'Mã số thuế'], ['id_no', 'CCCD'], ['id_date', 'Ngày cấp', 'date'], ['id_place', 'Nơi cấp'], ['hdv_left', 'Số dư còn lại HĐV', 'money']]],
];
const DS_COLS = DS_HEAD.flatMap(([, cs]) => cs);
const DS_SUM = DS_COLS.filter(c => ['money', 'num'].includes(c[2]) && !['base_price', 'build_price'].includes(c[0])).map(c => c[0]);
const isoDay = v => v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
async function debtSummary(db, user, f = {}) {
  if (!can(user, E.installment, 'r')) deny();
  const t = today(), to = isoDay(f.to) || t, from = isoDay(f.from) || to.slice(0, 7) + '-01';
  if (from > to) bad('«Thu phát sinh từ ngày» sau «Số liệu đến ngày»');
  if (f.sign && !['da_ky', 'chua'].includes(f.sign)) bad('Bộ lọc không hợp lệ');
  const p = [];
  const cs = await db.q(`SELECT c.*, u.code unit, u.project_id, u.building_id, pr.code project, pr.name project_name, b.code building, k.code cust_code, k.full_name customer, k.address k_addr, k.phone k_phone, k.tax_code k_tax, k.id_no k_id_no, k.id_date k_id_date, k.id_place k_id_place,
      (SELECT r.reg_date FROM kd_reservation r WHERE r.id = c.reservation_id) vbtt_on
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id JOIN kd_project pr ON pr.id = u.project_id JOIN kd_building b ON b.id = u.building_id
    WHERE c.kind IN ('hdmb','thue_mua','hoan_thien') AND c.status NOT IN ('huy','thanh_ly') ${f.sign === 'da_ky' ? "AND c.status = 'da_ky'" : f.sign === 'chua' ? "AND c.status <> 'da_ky'" : ''} ${uf(f, p)}${mine(user, 'c')}
    ORDER BY pr.code, b.code, u.floor, u.code, c.id`, p);
  const ids = cs.map(c => c.id), D = await B.debtOf(db, ids, to);
  const RC = new Map((await db.q(`SELECT contract_id, sum(amount) FILTER (WHERE voucher_date < $2) old, sum(amount) FILTER (WHERE voucher_date >= $2 AND voucher_date <= $3) new
    FROM kd_receipt WHERE status = 'hop_le' AND contract_id = ANY($1) GROUP BY 1`, [ids, from, to])).map(r => [r.contract_id, r]));
  // HĐ vay cùng căn (bản chất bán): số dư = gốc khách đã chuyển − gốc công ty đã trả lại
  const unitIds = [...new Set(cs.map(c => c.unit_id))];
  const vays = await db.q("SELECT c.id, c.unit_id FROM kd_contract c WHERE c.kind = 'vay' AND c.status <> 'huy' AND coalesce(c.nature, 'ban') = 'ban' AND c.unit_id = ANY($1)", [unitIds]);
  const DV = await B.debtOf(db, vays.map(v => v.id), to);
  const GT = new Map((await db.q("SELECT contract_id, sum(coalesce(paid_amt, 0)) s FROM kd_loan_pay WHERE kind = 'goc' AND contract_id = ANY($1) AND (paid_on IS NULL OR paid_on <= $2) GROUP BY 1", [vays.map(v => v.id), to])).map(x => [x.contract_id, +x.s]));
  const HDV = new Map(); for (const v of vays) HDV.set(v.unit_id, (HDV.get(v.unit_id) || 0) + (DV.get(v.id)?.paid || 0) - (GT.get(v.id) || 0));
  const pii = PII_ROLES.includes(user.role), mask = v => v == null || v === '' ? '' : pii ? v : '•••••' + String(v).slice(-3);
  const ST_L = Object.fromEntries(C.F.contract.status.o.map(o => [o[0], o[1]]));
  // chia 1 hợp đồng ra các khoản: { n, g, p, b } × { total, due, paid }
  const split = c => {
    const d = D.get(c.id), Z = () => ({ total: 0, due: 0, paid: 0 }), o = { n: Z(), g: Z(), p: Z(), b: Z() };
    const value = +c.value || 0;
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
  // gom theo căn: HĐMB / thuê mua là dòng chính, HĐ hoàn thiện riêng cộng vào «Phát sinh»
  const byU = new Map();
  for (const c of cs) { const g = byU.get(c.unit_id) || byU.set(c.unit_id, { main: null, fin: [] }).get(c.unit_id); if (c.kind === 'hoan_thien') g.fin.push(c); else if (!g.main) g.main = c; else g.fin.push(c); }
  const rows = [];
  for (const [uid, g] of byU) {
    const c = g.main || g.fin[0], all = [...(g.main ? [g.main] : []), ...g.fin];
    const o = { n: { total: 0, due: 0, paid: 0 }, g: { total: 0, due: 0, paid: 0 }, p: { total: 0, due: 0, paid: 0 }, b: { total: 0, due: 0, paid: 0 } };
    for (const x of all) { const s = split(x); for (const k in o) for (const y in o[k]) o[k][y] += s[k][y]; }
    const pos = v => Math.max(0, v), r = {
      unit_id: uid, contract_id: c.id, project: c.project, project_name: c.project_name, building: c.building, unit: c.unit, number: c.number, cust_code: c.cust_code, customer: c.customer,
      address: c.b_addr || c.k_addr || '', contract_on: c.contract_on, vbtt_on: c.vbtt_on, phone: c.b_phone || c.k_phone || '',
      area_floor: c.area_floor ?? c.area_build ?? null, area_tt: c.area_tt ?? c.area_land ?? null, base_price: c.base_price ?? c.land_price ?? null, build_price: c.build_price ?? null,
      common_amt: all.reduce((s, x) => s + (+x.common_area_amt || 0), 0) || null, sign_l: c.status === 'da_ky' ? 'Đã ký hợp đồng' : ST_L[c.status] || c.status, signed: c.status === 'da_ky',
      tax_code: mask(c.k_tax), id_no: mask(c.b_id_no || c.k_id_no), id_date: pii ? (c.b_id_date || c.k_id_date) : null, id_place: pii ? (c.b_id_place || c.k_id_place || '') : '',
      hdv_left: HDV.has(uid) ? HDV.get(uid) : null };
    for (const k of ['n', 'g', 'p', 'b']) { r[k + '_total'] = o[k].total; r[k + '_due'] = o[k].due; r[k + '_paid'] = o[k].paid; r[k + '_left'] = o[k].total - o[k].paid; r[k + '_left_due'] = pos(o[k].due - o[k].paid); }
    r.value = all.reduce((s, x) => s + (+x.value || 0), 0);
    r.t_total = r.n_total + r.g_total + r.p_total + r.b_total; r.t_due = r.n_due + r.g_due + r.p_due + r.b_due; r.t_paid = r.n_paid + r.g_paid + r.p_paid + r.b_paid;
    r.t_left_due = pos(r.t_due - r.t_paid); r.t_left = r.t_total - r.t_paid; r.pct5 = Math.round(r.n_total * 0.05);
    r.k_old = all.reduce((s, x) => s + (+RC.get(x.id)?.old || 0), 0); r.k_new = all.reduce((s, x) => s + (+RC.get(x.id)?.new || 0), 0); r.k_paid = r.k_old + r.k_new; r.k_debt = pos(r.t_due - r.k_paid);
    r.overdue = all.reduce((s, x) => s + (D.get(x.id)?.overdue || 0), 0);
    rows.push(r);
  }
  return { head: DS_HEAD.map(([g, cs]) => [g, cs.map(c => c.slice(0, 3))]), sum: DS_SUM, rows, from, to, pii, bravo_sync: await bravoSync(db) };
}
// xuất Excel đúng bố cục bảng: 2 tầng tiêu đề, dòng mục (1. HỢP ĐỒNG …), dòng cộng từng tòa, dòng Tổng cộng
function debtSummaryXlsx(d, q = '') {
  const { buildXlsx } = require('./xlsx');
  const cols = DS_COLS, n = cols.length, out = [], merges = [], styles = new Map(), L = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  const st = (ri, ci, v) => styles.set(ri + ':' + ci, v);
  const cell = (r, c) => { const v = r[c[0]]; if (v == null || v === '') return ''; return c[2] === 'date' ? C.dmy(v) : ['money', 'num', 'int'].includes(c[2]) ? +v : v; };
  out.push(['BẢNG TỔNG HỢP CÔNG NỢ - KINH DOANH']); merges.push(`A1:${L(n - 1)}1`); st(0, 0, 5);
  out.push([`Số liệu đến ngày ${C.dmy(d.to)} · thu phát sinh từ ${C.dmy(d.from)} · thực thu Bravo${d.bravo_sync ? ' chốt ' + new Date(d.bravo_sync).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''}${q ? ` · lọc «${q}»` : ''}`]); merges.push(`A2:${L(n - 1)}2`);
  out.push([]);
  const h1 = [], h2 = []; let ci = 0;
  for (const [g, cs] of DS_HEAD) {
    if (!g) for (const c of cs) { h1.push(c[1]); h2.push(''); merges.push(`${L(ci)}4:${L(ci)}5`); ci++; }
    else { cs.forEach((c, i) => { h1.push(i ? '' : g); h2.push(c[1]); }); merges.push(`${L(ci)}4:${L(ci + cs.length - 1)}4`); ci += cs.length; }
  }
  out.push(h1, h2); for (let i = 0; i < n; i++) { st(3, i, 4); st(4, i, 4); }
  const sumRow = (label, rs) => { const ri = out.length, row = cols.map(c => d.sum.includes(c[0]) ? rs.reduce((s, r) => s + (+r[c[0]] || 0), 0) : ''); row[1] = label; out.push(row); merges.push(`B${ri + 1}:H${ri + 1}`); for (let i = 0; i < n; i++) st(ri, i, i === 1 ? 9 : 8); };
  const pjs = [...new Set(d.rows.map(r => r.project))];
  pjs.forEach((pj, pi) => {
    const prs = d.rows.filter(r => r.project === pj);
    sumRow(`${pi + 1}. HỢP ĐỒNG CĂN HỘ/NHÀ LIỀN KỀ — ${prs[0].project_name || pj} (${prs.length})`, prs);
    for (const b of [...new Set(prs.map(r => r.building))]) {
      const brs = prs.filter(r => r.building === b); sumRow('Tòa ' + b, brs);
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

module.exports = { debtSummary, debtSummaryXlsx, loanTrack, loanItems, contractVouchers, contractTrack, setLateRate, unitStatus, payouts, loans, finishPay, priceSheet, dashboard, drill, alerts, ALERT_CAT, approvals, approvalsFor, board, unit360, customer360, search, ledger, readyList, signing, vault, report, REPORTS, monthly, signedContracts, period };
