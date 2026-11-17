// Trợ lý tra cứu NỘI SINH (17/11/2026): hiểu câu hỏi tiếng Việt bằng luật (không gọi AI bên ngoài, không cần ANTHROPIC_API_KEY,
// chạy được cả bản demo trong trình duyệt) → gọi đúng hàm tra cứu sẵn có của app (cùng quyền xem của người hỏi) → trả lời dạng bảng / danh sách có liên kết mở hồ sơ.
// Có khóa API thì ai.js dùng Claude như cũ; không có thì dùng trợ lý này.
'use strict';
const { q, one } = require('./db');
const C = require('./core');
const V = require('./views');
const M = require('./meta');
const AQ = require('./ai-query');   // 17/11/2026: hỏi tổng quát trên mọi loại hồ sơ

const db = { q, one };
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const has = (t, ...ws) => ws.some(w => t.includes(w));
const money = v => C.fmtMoney(Math.round(+v || 0)) + 'đ';
const big = v => { v = +v || 0; const a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' tỷ' : a >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' tr' : C.fmtMoney(Math.round(v)) + 'đ'; };
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) + '%' : '—';
const cell = s => String(s ?? '').replace(/\|/g, '/').replace(/[[\]]/g, '').replace(/\n/g, ' ').trim() || '—';
const link = (ent, id, t) => id ? `[${cell(t)}](#open/${ent}/${id})` : cell(t);
const table = (head, rows) => rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(x => x == null || x === '' ? '—' : String(x).replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`)].join('\n') : '';
const dmy = v => v ? C.dmy(String(v).slice(0, 10)) : '—';
const MGR = ['truong_phong', 'lanh_dao', 'admin'];

// ---------- nhận biết ngữ cảnh: dự án, tòa, top N, «của tôi»
async function context(raw, user) {
  const t = fold(raw), f = {};
  const ps = await q('SELECT id, code, name FROM kd_project ORDER BY code');
  const p = ps.find(p => new RegExp(`\\b${fold(p.code)}\\b`).test(t) || (p.name && t.includes(fold(p.name).replace(/^(du an|khu nha o xa hoi)\s+/, ''))));
  if (p) f.project = String(p.id);
  const tw = /\btoa\s+([a-z0-9]{1,3})\b/.exec(t);
  if (tw) {
    const bs = await q('SELECT b.id, b.code, b.project_id, p.code pcode FROM kd_building b JOIN kd_project p ON p.id = b.project_id WHERE lower(b.code) = $1' + (p ? ' AND b.project_id = $2' : ''), p ? [tw[1], p.id] : [tw[1]]);
    if (bs.length === 1) { f.building = String(bs[0].id); f.project ||= String(bs[0].project_id); f.bname = `${bs[0].pcode} · Tòa ${bs[0].code}`; }
  }
  const n = /\btop\s*(\d{1,3})\b/.exec(t) || /\b(\d{1,3})\s*(khach|can|hop dong|hd|dong)\b/.exec(t);
  const mine = /\bcua toi\b|\btoi phu trach\b|\bminh phu trach\b/.test(t) || !MGR.includes(user.role) && /\bcua toi\b/.test(t);
  return { t, f, p, ps, n: n ? Math.min(100, Math.max(1, +n[1])) : 10, mine };
}
const scope = c => [c.p ? c.p.code : '', c.f.bname || ''].filter(Boolean).join(' · ');

// ---------- các loại câu hỏi
const INTENTS = [
  // hồ sơ 1 căn theo mã (CTS-O-0104, TNS-G-0603…)
  { key: 'can', test: (c, raw) => /\b[A-Za-z]{2,5}-[A-Za-z0-9]{1,3}-\d{3,4}\b/.test(raw), async run(c, raw, user) {
    const code = /\b([A-Za-z]{2,5}-[A-Za-z0-9]{1,3}-\d{3,4})\b/.exec(raw)[1].toUpperCase();
    const u = await one('SELECT id FROM kd_unit WHERE upper(code) = $1', [code]);
    if (!u) { const near = await q('SELECT id, code FROM kd_unit WHERE code ILIKE $1 ORDER BY code LIMIT 8', [`%${code.split('-').pop()}%`]); return { steps: [`Hồ sơ căn ${code}`], answer: `Không có căn **${code}**.${near.length ? ` Mã gần giống: ${near.map(x => link('unit', x.id, x.code)).join(', ')}` : ''}` }; }
    const x = await V.unit360(db, user, u.id), un = x.unit;
    const st = await C.optLabel(C.F.unit.status, un.status);
    const live = (x.contracts || []).filter(k => !['huy', 'thanh_ly'].includes(k.status));
    const L = [`**Căn ${link('unit', un.id, un.code)}** · ${st}${un.area_tt ? ` · ${String(un.area_tt).replace('.', ',')} m²` : ''}${un.bedrooms ? ` · ${un.bedrooms}PN` : ''}${un.total_price ? ` · giá ${big(un.total_price)}` : ''}`];
    if (x.customers?.length) L.push(`- Khách: ${x.customers.map(k => `${link('customer', k.id, k.full_name)} (${k.code}${k.phone ? ' · ' + k.phone : ''})`).join('; ')}`);
    const res = (x.reservations || []).filter(r => !['huy', 'het_han'].includes(r.status));
    if (res.length) L.push(`- Phiếu đăng ký: ${res.map(r => `${link('reservation', r.id, r.code)} (${r.deal === 'thue' ? 'thuê' : 'mua'}${r.hold_until ? ', hạn giữ chỗ ' + dmy(r.hold_until) : ''})`).join('; ')}`);
    if (live.length) {
      const D = await V.ledger(db, user, { q: un.code }), byC = new Map((D.rows || []).map(r => [r.contract_id, r]));
      L.push('', table(['Hợp đồng', 'Loại', 'Giá trị', 'Đã thu', 'Còn phải thu', 'Quá hạn'], live.map(k => { const d = byC.get(k.id) || {}; return [link('contract', k.id, k.number || k.code), ({ hdmb: 'Mua bán', thue: 'Thuê', vay: 'Vay', thue_mua: 'Thuê mua', hoan_thien: 'Hoàn thiện' })[k.kind] || k.kind, big(k.value), d.paid != null ? big(d.paid) : '—', d.left != null ? big(d.left) : '—', d.overdue ? `${big(d.overdue)} (${d.overdue_days} ngày)` : '0']; })));
    } else L.push('- Chưa có hợp đồng còn hiệu lực.');
    if (x.handover?.length) L.push(`- Bàn giao: ${x.handover.map(h => `${link('handover', h.id, h.code || 'biên bản #' + h.id)} — ${h.status}${h.actual_on ? ', ngày ' + dmy(h.actual_on) : ''}`).join('; ')}`);
    if (x.pinkbook?.length) L.push(`- Sổ hồng: ${x.pinkbook.map(s => `${link('pinkbook', s.id, '#' + s.id)} — ${s.status}`).join('; ')}`);
    const call = (x.calls || [])[0]; if (call) L.push(`- Nhắc nợ gần nhất ${dmy(call.at)}: ${cell(call.content)}${call.next_on ? ` · hẹn gọi lại ${dmy(call.next_on)}` : ''}`);
    if (x.tickets?.length) L.push(`- Phản ánh / khiếu nại: ${x.tickets.length} phiếu`);
    return { steps: [`Hồ sơ căn ${un.code}`, 'Sổ công nợ'], answer: L.join('\n') };
  } },
  // hồ sơ khách theo mã KH
  { key: 'khach', test: (c, raw) => /\bKH\d{4,}\b/i.test(raw), async run(c, raw, user) {
    const code = /\b(KH\d{4,}(?:-\d+)?)\b/i.exec(raw)[1].toUpperCase();
    const k = await one('SELECT id FROM kd_customer WHERE upper(code) = $1', [code]);
    if (!k) return { steps: [`Khách ${code}`], answer: `Không có khách hàng **${code}**.` };
    const x = await V.customer360(db, user, k.id), cu = x.customer || x;
    const cts = x.contracts || [];
    return { steps: [`Hồ sơ khách ${code}`], answer: [`**${link('customer', k.id, cu.full_name || code)}** (${code})${cu.phone ? ' · ' + cu.phone : ''}`,
      cts.length ? table(['Hợp đồng', 'Căn', 'Trạng thái', 'Giá trị'], cts.map(h => [link('contract', h.id, h.number || h.code), h.unit || h.unit_code || '', h.status, big(h.value)])) : '- Chưa có hợp đồng.'].join('\n') };
  } },
  // 17/11/2026: hỏi tổng quát — đếm / liệt kê / tổng tiền / nhóm «theo …» trên mọi loại hồ sơ (khách hàng, hợp đồng, phiếu thu…), lọc của tôi · dự án · tòa · trạng thái · thời gian
  { key: 'tong_quat', test: c => { const h = AQ.detectEnt(c.t); if (!h) return false;
      if (has(c.t, 'qua han', 'den han', 'cong no', 'no kho doi', 'cham thanh toan', 'doanh so', 'chi tieu', 'du dieu kien', 'cho toi duyet', 'ton dong', 'canh bao', 'sap het han', 'lich ky', 'hen ky')) return false;
      if (h.ent === 'unit' && !/ban giao|\d ?pn|phong ngu|studio|huong|tang \d|dien tich|lien ke|shophouse|lon nhat|nho nhat|trung binh|theo |tren \d|duoi \d/.test(c.t)) return false;   // giỏ hàng có trả lời riêng
      if (h.ent === 'unit' || h.ent === 'handover') return true;
      return AQ.looksLikeQuery(c.t) || !!AQ.detectTime(c.t, C.today()) || /\b(cua toi|cua minh|toi dang co|toi phu trach)\b/.test(c.t); },
    run: (c, raw, user) => AQ.run(c, raw, user) },
  // kỳ thu sắp đến hạn
  { key: 'den_han', test: c => has(c.t, 'den han', 'sap toi han', 'sap den', 'phai thu tuan', '7 ngay toi') && !has(c.t, 'qua han'), async run(c, raw, user) {
    const D = await V.ledger(db, user, { project: c.f.project, building: c.f.building, owner: c.mine ? user.id : undefined });
    const rows = (D.rows || []).filter(r => r.due7 > 0).sort((a, b) => String(a.next_due).localeCompare(String(b.next_due)));
    if (!rows.length) return { steps: ['Sổ công nợ'], answer: `Không có kỳ thu nào đến hạn trong 7 ngày tới${scope(c) ? ' (' + scope(c) + ')' : ''}.` };
    return { steps: ['Sổ công nợ — kỳ thu đến hạn ≤ 7 ngày'], answer: [`**${rows.length} hợp đồng** có kỳ thu đến hạn trong 7 ngày tới${c.mine ? ' (khách của bạn)' : ''}${scope(c) ? ' · ' + scope(c) : ''} — tổng **${money(rows.reduce((s, r) => s + r.due7, 0))}**:`,
      table(['Căn', 'Khách hàng', 'Hạn', 'Số tiền', 'Điện thoại'], rows.slice(0, c.n).map(r => [link('unit', r.unit_id, r.unit), link('customer', r.customer_id, r.customer), dmy(r.next_due), money(r.next_amt || r.due7), r.phone || ''])),
      rows.length > c.n ? `_…còn ${rows.length - c.n} hợp đồng — xem đủ ở [Theo dõi công nợ đến hạn](#/v/duedebt)._` : ''].join('\n') };
  } },
  // công nợ / nợ quá hạn
  { key: 'no', test: c => has(c.t, 'cong no', 'qua han', 'no nhieu', 'cham thanh toan', 'cham tra', 'no kho doi', 'con no', 'khach no'), async run(c, raw, user) {
    const D = await V.ledger(db, user, { project: c.f.project, building: c.f.building, owner: c.mine ? user.id : undefined });
    const all = D.rows || [], od = all.filter(r => r.overdue > 0).sort((a, b) => b.overdue - a.overdue);
    const sum = (rs, k) => rs.reduce((s, r) => s + (+r[k] || 0), 0);
    const L = [`**Công nợ${scope(c) ? ' · ' + scope(c) : ''}${c.mine ? ' (khách của bạn)' : ''}** — ${all.length} hợp đồng đã ký: phải thu ${big(sum(all, 'total'))}, đã thu ${big(sum(all, 'paid'))} (${pct(sum(all, 'paid'), sum(all, 'total'))}), còn phải thu **${big(sum(all, 'left'))}**.`,
      `- Quá hạn: **${big(sum(od, 'overdue'))}** · ${od.length} hợp đồng · ${new Set(od.map(r => r.customer_id)).size} khách${od.filter(r => r.overdue_days > 90).length ? ` · ${od.filter(r => r.overdue_days > 90).length} HĐ quá hạn trên 90 ngày` : ''}`,
      `- Đến hạn trong 7 ngày: ${big(sum(all, 'due7'))}`];
    if (od.length) L.push('', `Top ${Math.min(c.n, od.length)} nợ quá hạn nhiều nhất:`, table(['#', 'Căn', 'Khách hàng', 'Quá hạn', 'Số ngày', 'Phụ trách'], od.slice(0, c.n).map((r, i) => [String(i + 1), link('unit', r.unit_id, r.unit), link('customer', r.customer_id, r.customer), money(r.overdue), String(r.overdue_days), r.owner || ''])));
    if (D.bravo_sync) L.push(`_Đã thu theo Bravo, chốt ${dmy(D.bravo_sync)}._`);
    return { steps: ['Sổ công nợ'], answer: L.join('\n') };
  } },
  // doanh số / chỉ tiêu
  { key: 'doanh_so', test: c => has(c.t, 'doanh so', 'chi tieu', 'doanh thu', 'ban duoc', 'tien do ban', 'kpi'), async run(c, raw, user) {
    const ps = c.p ? [c.p] : c.ps, rows = [];
    for (const p of ps) { const d = await V.dashboard(db, user, { project: String(p.id) }), k = d.kpi || {}; rows.push([p, k, d.period]); }
    const T = (await V.dashboard(db, user, {})), K = T.kpi || {};
    const L = [`**Doanh số ký hợp đồng ${T.period ? `${T.period.from.split('-').reverse().join('/')} – ${T.period.to.split('-').reverse().join('/')}` : 'năm nay'}**: ${big(K.revenue)} / chỉ tiêu ${big(K.revenue_target)} (**${pct(K.revenue, K.revenue_target)}**) · ${K.units_sold_period ?? 0}/${K.units_target ?? 0} căn · đã thu ${big(K.collected)} / ${big(K.collect_target)} (${pct(K.collected, K.collect_target)}).`];
    if (!c.p && rows.length > 1) L.push('', table(['Dự án', 'Doanh số ký', 'Chỉ tiêu', '% đạt', 'Căn ký', 'Đã thu'], rows.filter(([, k]) => +k.revenue || +k.revenue_target || +k.collected).map(([p, k]) => [p.code + ' · ' + p.name, big(k.revenue), big(k.revenue_target), pct(k.revenue, k.revenue_target), `${k.units_sold_period ?? 0}/${k.units_target ?? 0}`, big(k.collected)])));
    L.push(`_Chi tiết theo tháng ở [Dashboard](#/v/dashboard)._`);
    return { steps: ['Số liệu Dashboard'], answer: L.join('\n') };
  } },
  // bàn giao đủ điều kiện
  { key: 'ban_giao', test: c => has(c.t, 'du dieu kien') || c.t.includes('ban giao') && has(c.t, 'chua co lich', 'chua co ke hoach', 'chua len lich', 'chua hen'), async run(c, raw, user) {
    const rs = (await V.readyList(db, { project: c.f.project, building: c.f.building })).filter(r => r.eligible);
    const no = rs.filter(r => !r.handover_id), yes = rs.length - no.length;
    if (!rs.length) return { steps: ['Căn đủ điều kiện bàn giao'], answer: 'Chưa có căn nào đủ điều kiện bàn giao.' };
    return { steps: ['Căn đủ điều kiện bàn giao'], answer: [`**${rs.length} căn đủ điều kiện bàn giao**${scope(c) ? ' · ' + scope(c) : ''}: ${yes} căn đã có kế hoạch / lịch, **${no.length} căn chưa có lịch hẹn**.`,
      no.length ? table(['Căn', 'Khách hàng', 'Phụ trách'], no.slice(0, c.n * 3).map(r => [link('unit', r.unit_id, r.unit), cell(r.customer), r.owner || ''])) : '',
      `_Lập kế hoạch ở [Căn đủ điều kiện](#/v/ready)._`].join('\n') };
  } },
  // giỏ hàng: còn bao nhiêu căn
  { key: 'gio_hang', test: c => has(c.t, 'con ban', 'con trong', 'mo ban', 'gio hang', 'bao nhieu can', 'con bao nhieu', 'chua ban', 'da ban'), async run(c, raw, user) {
    const d = await V.dashboard(db, user, { project: c.f.project }), bb = (d.byBuilding || []).filter(b => !c.f.building || String(b.building_id) === c.f.building);
    const U = d.units || {}, lab = { con_ban: 'Còn bán', giu_cho: 'Đang giữ chỗ', da_coc: 'Đã cọc', da_ky_hd: 'Đã ký HĐ', da_ban_giao: 'Đã bàn giao', chua_mo_ban: 'Chưa mở bán' };
    const L = [];
    if (c.f.building && bb[0]) { const b = bb[0]; L.push(`**${c.f.bname}**: ${b.total} căn — còn bán **${b.con_ban}**, giữ chỗ ${b.giu_cho}, đã ký ${b.da_ky}, đã bàn giao ${b.da_ban_giao} · tiêu thụ ${Math.round((b.rate || 0) * (b.rate <= 1 ? 100 : 1))}%.`); }
    else {
      L.push(`**Giỏ hàng${c.p ? ' · ' + c.p.code : ''}**: ${Object.entries(lab).filter(([k]) => U[k] != null).map(([k, l]) => `${l} ${k === 'con_ban' ? '**' + U[k] + '**' : U[k]}`).join(' · ')}.`);
      if (bb.length) L.push('', table(['Tòa', 'Tổng', 'Còn bán', 'Giữ chỗ', 'Đã ký', 'Đã bàn giao'], bb.map(b => [`${b.project} · ${b.building}`, String(b.total), String(b.con_ban), String(b.giu_cho), String(b.da_ky), String(b.da_ban_giao)])));
    }
    L.push(`_Xem căn cụ thể ở [Bảng hàng](#/v/board)._`);
    return { steps: ['Giỏ hàng theo tòa'], answer: L.join('\n') };
  } },
  // chờ duyệt
  { key: 'duyet', test: c => has(c.t, 'phe duyet', 'cho duyet', 'cho toi duyet', 'can duyet', 'hop phe'), async run(c, raw, user) {
    const xs = await V.approvalsFor(db, user);
    return { steps: ['Hộp phê duyệt'], answer: !xs.length ? 'Không có hồ sơ nào chờ bạn duyệt.' : [`**${xs.length} hồ sơ chờ bạn duyệt:**`, table(['Hồ sơ', 'Người trình', 'Ngày trình'], xs.slice(0, 30).map(a => [link(a.ent, a.rec_id, a.title), a.requested_by_l || '', dmy(a.requested_at)])), `_Duyệt ở [Hộp phê duyệt](#/v/approvals)._`].join('\n') };
  } },
  // lịch ký
  { key: 'lich_ky', test: c => has(c.t, 'lich ky', 'hen ky', 'sap ky', 'ky hop dong'), async run(c, raw, user) {
    const t = C.today(), t14 = C.addDays(t, 14);
    const rs = ((await V.signing(db, user, {})).rows || []).filter(r => r.plan_sign && r.plan_sign >= t && r.plan_sign <= t14).sort((a, b) => String(a.plan_sign).localeCompare(String(b.plan_sign)));
    return { steps: ['Lịch ký hợp đồng'], answer: !rs.length ? 'Không có lịch ký trong 14 ngày tới.' : [`**${rs.length} lịch ký trong 14 ngày tới:**`, table(['Ngày', 'Hợp đồng', 'Căn', 'Khách hàng', 'Nơi ký'], rs.map(r => [dmy(r.plan_sign), link(r.ent || 'contract', r.id, r.number || '#' + r.id), r.unit || '', r.customer || '', r.sign_place || ''])), `_[Lịch ký hợp đồng](#/v/signing)._`].join('\n') };
  } },
  // cảnh báo / việc cần làm (giữ chỗ, HĐ thuê hết hạn, chính sách, tồn đọng…)
  { key: 'canh_bao', test: c => has(c.t, 'canh bao', 'ton dong', 'viec', 'can lam', 'nhac', 'giu cho', 'het han', 'hom nay', 'can xu ly', 'tre han'), async run(c, raw, user) {
    const al = await V.alerts(db, user, { all: MGR.includes(user.role) && !c.mine, project: c.f.project });
    const pick = c.t.includes('giu cho') ? ['giu_cho'] : has(c.t, 'thue') && c.t.includes('het han') ? ['thue_het_han'] : c.t.includes('chinh sach') ? ['chinh_sach'] : c.t.includes('ho so') ? ['ho_so', 'noxh'] : null;
    const xs = pick ? al.filter(a => pick.includes(a.cat)) : al;
    if (!xs.length) return { steps: ['Cảnh báo tồn đọng'], answer: pick ? 'Không có cảnh báo nào thuộc loại này.' : 'Không có việc tồn đọng nào — tốt lắm!' };
    const by = new Map(); for (const a of xs) (by.get(a.cat) || by.set(a.cat, []).get(a.cat)).push(a);
    const L = [`**${xs.length} việc cần xử lý**${c.mine ? ' của bạn' : ''} · ${xs.filter(a => a.lvl === 'r').length} việc gấp (đỏ):`];
    for (const [cat, as] of by) {
      L.push('', `**${V.ALERT_CAT[cat] || cat}** — ${as.length}`);
      for (const a of as.slice(0, pick ? 30 : 5)) L.push(`- ${a.lvl === 'r' ? '**Gấp** · ' : a.lvl === 'a' ? '_Sắp tới_ · ' : ''}${a.ent && a.id ? link(a.ent, a.id, a.text) : cell(a.text)}`);
      if (!pick && as.length > 5) L.push(`- _…và ${as.length - 5} việc nữa_`);
    }
    L.push('', `_Đủ danh sách ở [Cảnh báo tồn đọng](#/v/alerts)._`);
    return { steps: ['Cảnh báo tồn đọng'], answer: L.join('\n') };
  } },
];

// ---------- tìm tự do (tên khách, SĐT, số HĐ, mã phiếu…) khi không khớp loại câu hỏi nào
const STOP = /\b(tra cuu|tim|cho toi|xem|thong tin|ho so|khach hang|khach|cua|ve|la|ai|nao|bao nhieu|co|khong|gi|o dau|hien nay|hay|giup|toi|minh|can ho|can)\b/g;
async function freeSearch(raw, user) {
  const kw = fold(raw).replace(/[?.,!:;]/g, ' ').replace(STOP, ' ').replace(/\s+/g, ' ').trim();
  const words = String(raw).replace(/[?.,!:;]/g, ' ').split(/\s+/).filter(w => fold(w) && kw.split(' ').includes(fold(w)));
  const term = words.join(' ').trim();
  if (term.length < 2) return null;
  const hits = await V.search(db, user, term);
  if (!hits?.length) return null;
  const ENT = { unit: 'unit', customer: 'customer', contract: 'contract', reservation: 'reservation' };
  return { steps: [`Tìm «${term}»`], answer: [`Kết quả tìm **«${term}»** (${hits.length}):`, ...hits.slice(0, 15).map(h => `- ${link(ENT[h.type] || h.type, h.id, h.title)} — ${cell(h.sub)}`)].join('\n') };
}
const HELP = `Tôi là trợ lý tra cứu **chạy ngay trong app** (không gửi dữ liệu ra ngoài). Hỏi tôi theo các mẫu:
- **Hồ sơ căn**: «Tóm tắt căn TNS-G-0603» · **Khách**: «KH000141»
- **Công nợ**: «Công nợ quá hạn top 10» · «Công nợ tòa G» · «Khách của tôi sắp đến hạn 7 ngày tới»
- **Doanh số**: «Doanh số so với chỉ tiêu theo dự án»
- **Giỏ hàng**: «Tòa O còn bao nhiêu căn đang bán?»
- **Bàn giao**: «Căn nào đủ điều kiện bàn giao mà chưa có lịch?»
- **Việc cần làm**: «Việc tồn đọng của tôi hôm nay» · «Giữ chỗ sắp hết hạn» · «HĐ thuê sắp hết hạn» · «Chính sách sắp hết hiệu lực»
- **Duyệt / lịch ký**: «Hồ sơ chờ tôi duyệt» · «Lịch ký tuần này»
- **Đếm / liệt kê mọi hồ sơ**: «Tôi đang có bao nhiêu khách hàng?» · «Khách hàng tiềm năng theo nguồn» · «Hợp đồng thuê ký tháng này» · «Tổng tiền phiếu thu tuần này» · «Danh sách phiếu đăng ký đang giữ chỗ tòa G» · «Hồ sơ NOXH theo trạng thái» · «Phản ánh chưa xử lý» · «Căn đã bàn giao»
- Hoặc gõ **tên khách, số điện thoại, số hợp đồng** để tìm.`;

async function answer(user, text) {
  const c = await context(text, user);
  for (const it of INTENTS) if (it.test(c, text)) return { ...(await it.run(c, text, user)), intent: it.key };
  const fs = await freeSearch(text, user); if (fs) return fs;
  if (AQ.detectEnt(c.t)) return { ...(await AQ.run(c, text, user)), intent: 'tong_quat' };
  if (String(text).trim().split(/\s+/).length <= 6 && !/\?/.test(text)) return { steps: [`Tìm «${cell(text)}»`], answer: `Không tìm thấy căn / khách hàng / hợp đồng / phiếu nào khớp **«${cell(text)}»**. Thử gõ mã căn, mã KH, số điện thoại hoặc số hợp đồng.\n\n${HELP}`, intent: 'search_none' };
  return { steps: [], answer: `Tôi chưa hiểu câu hỏi «${cell(text)}».\n\n${HELP}`, intent: 'help' };
}

async function ask(user, { conv, text }) {
  text = String(text || '').trim();
  if (!text) C.bad('Nhập câu hỏi');
  if (text.length > 2000) C.bad('Câu hỏi quá dài (tối đa 2.000 ký tự)');
  const r = await answer(user, text);
  await C.audit(db, 'ai', null, 'hoi_ai', null, { intent: r.intent }, user, text.slice(0, 500)).catch(() => {});
  return { conv: conv || 'local', answer: r.answer, steps: r.steps, local: true };
}
module.exports = { ask, answer, HELP };
