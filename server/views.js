// Các màn tổng hợp (không phải form): Dashboard + truy xuất chi tiết, cảnh báo, hộp phê duyệt, bảng hàng,
// hồ sơ 360°, sổ công nợ, căn đủ điều kiện bàn giao, lịch ký, kho hồ sơ, báo cáo quản trị, báo cáo tháng.
// Mọi số liệu có nguồn: «App» (dữ liệu nghiệp vụ) hoặc «Bravo» (chứng từ thu đã đồng bộ, kèm ngày chốt).
const C = require('./core');
const B = require('./biz');
const { E, MGR } = require('./meta');
const { today, addDays, dayDiff, fmtMoney, can, deny, bad } = C;

const STAFF_SCOPE = ['ban_hang', 'cong_no', 'ho_so', 'cskh'];
const mon = s => s ? String(s).slice(0, 7) : null;
const monthEnd = m => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
const monthsBetween = (a, b) => { const out = []; let [y, m] = a.split('-').map(Number); const [Y, M] = b.split('-').map(Number); while (y < Y || (y === Y && m <= M)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } if (out.length > 60) break; } return out; };
// điều kiện lọc căn theo dự án / tòa (alias u)
function uf(f, p, alias = 'u') {
  const w = [];
  if (f.project) { p.push(+f.project); w.push(`${alias}.project_id = $${p.length}`); }
  if (f.building) { p.push(+f.building); w.push(`${alias}.building_id = $${p.length}`); }
  return w.length ? ' AND ' + w.join(' AND ') : '';
}
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
    WHERE c.kind IN ('hdmb','thue','thue_mua','hoan_thien') AND c.status NOT IN ('huy','thanh_ly') ${extra} ${uf(f, p)} ORDER BY u.code`, p);
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
  const cur = series.find(x => x.m === m) || { plan: 0, actual: 0 };

  const cnt = async (sql, pp = []) => Object.fromEntries((await db.q(sql, pp)).map(r => [r.status, r.n]));
  const p5 = []; const w5 = uf(f, p5);
  const nx = await cnt(`SELECT n.status, count(*) n FROM kd_noxh_check n LEFT JOIN kd_unit u ON u.id = n.unit_id WHERE true ${w5} GROUP BY 1`, p5);
  const p6 = []; const w6 = uf(f, p6);
  const ct = await cnt(`SELECT c.status, count(*) n FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id WHERE c.kind <> 'hoan_thien' ${w6} GROUP BY 1`, p6);
  const p7 = []; const w7 = uf(f, p7);
  const hv = await cnt(`SELECT h.status, count(*) n FROM kd_handover h JOIN kd_unit u ON u.id = h.unit_id WHERE true ${w7} GROUP BY 1`, p7);
  const ready = (await readyList(db, f)).filter(r => r.eligible && !r.handover_id).length;

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
      noxh_open: (nx.nhap || 0), noxh_review: nx.cho_duyet || 0, noxh_ok: nx.da_duyet || 0,
      ct_draft: (ct.du_thao || 0) + (ct.tu_choi || 0), ct_review: ct.cho_duyet || 0, ct_wait: ct.cho_ky || 0, ct_signed: ct.da_ky || 0,
      ho_ready: ready + (hv.du_dk || 0), ho_invited: (hv.da_moi || 0) + (hv.da_hen || 0), ho_done: (hv.da_ban_giao || 0) + (hv.hoan_tat || 0), ho_closed: hv.hoan_tat || 0,
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
async function drill(db, user, key, f) {
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
      const rows = await db.q(`SELECT n.id, n.unit_id, u.code unit, k.full_name customer, n.result, n.supplement_due, n.status FROM kd_noxh_check n JOIN kd_customer k ON k.id = n.customer_id LEFT JOIN kd_unit u ON u.id = n.unit_id WHERE n.status = ANY(string_to_array($1, ',')) ${w} ORDER BY n.id`, p);
      rows.forEach(r => { r._ent = ['noxh_check', r.id]; r.result = C.F.noxh_check.result.o.find(o => o[0] === r.result)?.[1]; });
      return { title: 'Hồ sơ NOXH', cols: [['unit', 'Căn'], ['customer', 'Khách hàng'], ['result', 'Kết quả kiểm tra'], ['supplement_due', 'Hạn bổ sung', 'date']], rows };
    }
    case 'handover': {
      if (arg === 'ready') { const rows = (await readyList(db, f)).filter(r => r.eligible && !r.handover_id); return { title: 'Căn đủ điều kiện, chưa lập lịch bàn giao', cols: [['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['paid_pct', 'Đã thu (%)', 'num'], ['owner', 'Phụ trách']], rows }; }
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
    WHERE (h.status IN ('da_moi','da_hen') AND h.plan_at < now() + interval '3 days') OR (h.status = 'da_ban_giao' AND h.actual_on < $${p.length + 1}::date - 30) ${w}`, [...p, t])) {
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
      coalesce((SELECT k.full_name FROM kd_contract c JOIN kd_customer k ON k.id = c.customer_id WHERE c.unit_id = u.id AND c.status NOT IN ('huy','thanh_ly') AND c.kind <> 'hoan_thien' LIMIT 1),
               (SELECT k.full_name FROM kd_reservation r JOIN kd_customer k ON k.id = r.customer_id WHERE r.unit_id = u.id AND r.status IN ('cho_duyet','giu_cho','qua_han','da_coc','chuyen_hd') LIMIT 1)) customer,
      (SELECT r.hold_until FROM kd_reservation r WHERE r.unit_id = u.id AND r.status IN ('giu_cho','qua_han','da_coc') LIMIT 1) hold_until,
      u.status = 'con_ban' AND EXISTS (SELECT 1 FROM kd_reservation r WHERE r.unit_id = u.id AND r.status IN ('huy','het_han')) cancelled   -- căn trả lại sau khi hủy đăng ký
    FROM kd_unit u WHERE u.building_id = $1 ORDER BY u.floor DESC, u.code`, [bid]) : [];
  // khách hàng: chỉ người có quyền xem khách mới thấy tên
  if (!can(user, E.customer, 'r')) units.forEach(u => { u.customer = u.customer ? '•••' : null; });
  const policy = await db.one("SELECT code, version, start_on, end_on, src_file FROM kd_price_policy WHERE $1 = ANY(project_ids) AND status = 'phat_hanh' AND start_on <= $2 AND end_on >= $2 ORDER BY start_on DESC LIMIT 1", [pid, today()]);
  return { projects, project: pid, buildings, building: bid, units, policy };
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
// theo dõi vay vốn: đọc thẳng từ hợp đồng căn hộ chung cư + nhà liền kề còn hiệu lực (sửa ở hợp đồng là cập nhật)
async function loans(db, user, f = {}) {
  if (!can(user, E.contract, 'r')) deny();
  const p = []; const w = uf(f, p);
  return db.q(`SELECT c.id, c.number, c.contract_on, c.value, c.status, c.loan_status, c.loan_bank, c.loan_doc3, c.ptype, u.code unit, pj.code project, k.full_name customer, coalesce(c.b_phone, k.phone) phone
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pj ON pj.id = u.project_id JOIN kd_customer k ON k.id = c.customer_id
    WHERE c.kind <> 'hoan_thien' AND c.status NOT IN ('huy', 'thanh_ly') ${w} ORDER BY c.id DESC`, p);
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
    const maint = dg ? (after != null ? Math.round(after * mp / 100) : null) : u.maint_fee ?? (before != null ? Math.round(before * mp / 100) : null);
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
  let extra = "AND c.status = 'da_ky'";
  if (f.q) extra += ` AND (u.code ILIKE ${pgLit('%' + f.q + '%')} OR k.full_name ILIKE ${pgLit('%' + f.q + '%')} OR c.number ILIKE ${pgLit('%' + f.q + '%')})`;
  if (f.owner) extra += ` AND c.owner_id = ${+f.owner}`;
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

// ======================= CĂN ĐỦ ĐIỀU KIỆN BÀN GIAO =======================
async function readyList(db, f = {}) {
  const cs = await signedContracts(db, f, "AND c.status = 'da_ky' AND c.kind IN ('hdmb','thue_mua')");
  const pct = (await C.setting('handover_pay_pct', db)) ?? 95;
  const ho = new Map((await db.q('SELECT id, unit_id, status, cond_tech, plan_at FROM kd_handover')).map(h => [h.unit_id, h]));
  return cs.map(c => {
    const h = ho.get(c.unit_id);
    const payOk = c.d.total > 0 && c.d.paid_pct >= pct && c.d.overdue === 0;
    return { unit_id: c.unit_id, unit: c.unit, project: c.project, building: c.building, customer: c.customer, phone: c.phone, contract_id: c.id, number: c.number, owner: c.owner, owner_id: c.owner_id,
      paid_pct: c.d.paid_pct, overdue: c.d.overdue, cond_contract: true, cond_pay: payOk, cond_tech: h?.cond_tech ?? null, eligible: payOk && (h ? h.cond_tech : true),
      handover_id: h?.id || null, handover_status: h ? C.F.handover.status.o.find(o => o[0] === h.status)?.[1] : null, plan_at: h?.plan_at || null, pct };
  }).filter(r => !r.handover_id || ['chua_du_dk', 'du_dk'].includes(ho.get(r.unit_id)?.status) || f.all);
}

// ======================= LỊCH KÝ =======================
async function signing(db, user, f) {
  const p = []; const w = uf(f, p);
  const rows = await db.q(`SELECT c.id, c.number, c.kind, c.plan_sign, c.sign_place, c.sign_status, c.status, c.value, u.code unit, u.id unit_id, pj.code project, k.full_name customer, k.phone, own.full_name owner
    FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pj ON pj.id = u.project_id JOIN kd_customer k ON k.id = c.customer_id LEFT JOIN kd_user own ON own.id = c.owner_id
    WHERE c.status IN ('du_thao','cho_duyet','cho_ky','tu_choi') ${w} ORDER BY c.plan_sign NULLS LAST, c.number`, p);
  // hồ sơ NOXH đã hẹn ký nhưng chưa lập hợp đồng cũng lên lịch
  rows.push(...(await db.q(`SELECT n.id, 'noxh_check' ent, '' number, n.plan_sign, n.sign_place, n.sign_status, 'du_thao' status, coalesce(u.code, n.unit_text, '') unit, coalesce(pj.code, '') project, k.full_name customer, k.phone, own.full_name owner
    FROM kd_noxh_check n JOIN kd_customer k ON k.id = n.customer_id LEFT JOIN kd_unit u ON u.id = n.unit_id LEFT JOIN kd_project pj ON pj.id = coalesce(u.project_id, n.project_id) LEFT JOIN kd_user own ON own.id = n.owner_id
    WHERE n.plan_sign IS NOT NULL AND NOT EXISTS (SELECT 1 FROM kd_contract c WHERE c.customer_id = n.customer_id AND c.status NOT IN ('huy', 'thanh_ly')) ${w}`, p)));
  const recent = await db.q(`SELECT c.id, c.number, c.signed_on, u.code unit, k.full_name customer FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_customer k ON k.id = c.customer_id WHERE c.status = 'da_ky' AND c.signed_on >= $${p.length + 1}::date - 30 ${w} ORDER BY c.signed_on DESC`, [...p, today()]);
  const signed = await db.q(`SELECT c.id, c.number, c.plan_sign, c.signed_on, c.status, u.code unit, pj.code project, k.full_name customer, own.full_name owner, c.sign_place FROM kd_contract c JOIN kd_unit u ON u.id = c.unit_id JOIN kd_project pj ON pj.id = u.project_id JOIN kd_customer k ON k.id = c.customer_id LEFT JOIN kd_user own ON own.id = c.owner_id WHERE c.status = 'da_ky' AND c.signed_on IS NOT NULL ${w}`, p);
  return { rows, recent, signed };
}

// ======================= KHO HỒ SƠ PHÁP LÝ =======================
async function vault(db, user, f) {
  const ents = Object.keys(E).filter(k => can(user, E[k], 'r'));
  const rows = await db.q(`SELECT f.id, f.ent, f.rec_id, f.kind, f.name, f.size, f.version, f.uploaded_at, us.full_name by FROM kd_file f LEFT JOIN kd_user us ON us.id = f.uploaded_by
    WHERE f.deleted_at IS NULL AND f.ent = ANY($1) ${f.ent ? 'AND f.ent = $2' : ''} ORDER BY f.uploaded_at DESC LIMIT 2000`, f.ent ? [ents, f.ent] : [ents]);
  // gắn mã căn / khách hàng
  const unitOf = {};
  for (const k of [...new Set(rows.map(r => r.ent))]) {
    const ux = C.unitExpr(E[k]); const ids = rows.filter(r => r.ent === k).map(r => r.rec_id);
    const cx = C.F[k].customer_id ? 't.customer_id' : C.F[k].contract_id ? '(SELECT customer_id FROM kd_contract c WHERE c.id = t.contract_id)' : 'NULL';
    for (const r of await db.q(`SELECT t.id, ${ux ? `(SELECT code FROM kd_unit u WHERE u.id = ${ux})` : 'NULL'} unit, ${ux || 'NULL'} unit_id, (SELECT full_name FROM kd_customer k WHERE k.id = ${cx}) customer, ${E[k].disp} label FROM ${E[k].table} t WHERE t.id = ANY($1)`, [ids]))
      unitOf[k + r.id] = r;
  }
  let out = rows.map(r => ({ ...r, ...(unitOf[r.ent + r.rec_id] || {}), ent_l: E[r.ent].title, kind_l: (E[r.ent].files || []).find(x => x[0] === r.kind)?.[1] || r.kind || 'Tài liệu', id: r.id }));
  if (f.q) { const s = f.q.toLowerCase(); out = out.filter(r => [r.name, r.unit, r.customer, r.label].some(x => String(x || '').toLowerCase().includes(s))); }
  return out;
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
    const nx = await db.q(`SELECT n.status, n.result, count(*) n, count(*) FILTER (WHERE n.created_at::date BETWEEN $1 AND $2) n_p FROM kd_noxh_check n LEFT JOIN kd_unit u ON u.id = n.unit_id WHERE true ${w} GROUP BY 1,2`, p);
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

module.exports = { payouts, loans, priceSheet, dashboard, drill, alerts, ALERT_CAT, approvals, approvalsFor, board, unit360, customer360, search, ledger, readyList, signing, vault, report, REPORTS, monthly, signedContracts, period };
