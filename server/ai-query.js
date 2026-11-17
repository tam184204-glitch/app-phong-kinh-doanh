// 17/11/2026: Trợ lý tra cứu — bộ hỏi TỔNG QUÁT trên mọi loại hồ sơ của app (khách hàng, hợp đồng, phiếu đăng ký, hồ sơ NOXH, phiếu thu / chi, căn,
// bàn giao, sổ hồng, phản ánh, nhật ký liên hệ, đại lý, chính sách, thông báo…): đếm · liệt kê · tổng tiền · nhóm «theo …»,
// lọc «của tôi», dự án / tòa, trạng thái / phân loại (khớp theo nhãn), thời gian (hôm nay, tuần này, tháng này, tháng N, năm nay, từ … đến …).
// Dùng đúng C.list (cùng phân quyền / phạm vi xem như màn danh sách) — không truy vấn vượt quyền.
'use strict';
const C = require('./core');
const { q } = require('./db');

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const cell = s => String(s ?? '').replace(/\|/g, '/').replace(/[[\]]/g, '').replace(/\n/g, ' ').trim() || '—';
const link = (ent, id, t) => id ? `[${cell(t)}](#open/${ent}/${id})` : cell(t);
const big = v => { v = +v || 0; const a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' tỷ' : a >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' tr' : C.fmtMoney(Math.round(v)) + 'đ'; };
const table = (head, rows) => rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(x => x == null || x === '' ? '—' : String(x).replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`)].join('\n') : '';
const re = w => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
const hasW = (t, w) => re(w).test(t);

// từ khóa → loại hồ sơ (+ lọc kèm). Cụm dài đặt trước; chỉ cần khớp 1 cụm.
const ENTS = [
  ['contract', ['hop dong mua ban', 'hdmb'], { f_kind: 'hdmb' }],
  ['contract', ['hop dong thue mua', 'hd thue mua', 'thue mua'], { f_kind: 'thue_mua' }],
  ['contract', ['hop dong thue', 'hd thue'], { f_kind: 'thue' }],
  ['contract', ['hop dong vay', 'hd vay'], { f_kind: 'vay' }],
  ['contract', ['hop dong hoan thien', 'hd hoan thien'], { f_kind: 'hoan_thien' }],
  ['contract_change', ['phu luc', 'dieu chinh hop dong']],
  ['cancel_req', ['huy giao dich', 'doi can', 'thanh ly hop dong', 'de nghi huy']],
  ['contract', ['hop dong', 'hd']],
  ['receipt', ['phieu thu', 'tien da thu', 'da thu tien', 'thu tien']],
  ['payment', ['phieu chi', 'tien da chi', 'chi tien']],
  ['refund', ['hoan tien', 'doi tru']],
  ['reservation', ['phieu dang ky', 'phieu giu cho', 'giu cho', 'dang ky mua', 'dang ky thue', 'phieu dk', 'booking']],
  ['noxh_check', ['ho so noxh', 'ho so nha o xa hoi', 'ho so mua', 'ho so thue', 'noxh']],
  ['contact_log', ['nhat ky tu van', 'nhat ky lien he', 'lan lien he', 'cuoc goi tu van', 'lich su lien he']],
  ['debt_call', ['nhac no', 'cam ket thanh toan', 'goi nhac']],
  ['customer', ['khach hang', 'khach']],
  ['handover_notice', ['thong bao ban giao can', 'thong bao ban giao']],
  ['gcn_notice', ['thong bao ban giao gcn', 'thong bao gcn']],
  ['handover', ['ke hoach ban giao', 'lich ban giao', 'bien ban ban giao', 'ban giao']],
  ['defect', ['ton tai', 'loi can ho', 'phieu kiem tra']],
  ['pinkbook', ['so hong', 'cap so', 'giay chung nhan', 'gcn']],
  ['ticket', ['khieu nai', 'phan anh', 'bao hanh', 'phieu cskh']],
  ['notice', ['thong bao khach hang']],
  ['sale_notice', ['thong bao mo ban', 'thong bao cho thue', 'dot mo ban']],
  ['commission', ['hoa hong', 'doi soat']],
  ['commission_policy', ['chinh sach hoa hong']],
  ['agent', ['dai ly', 'cong tac vien', 'ctv', 'san phan phoi', 'doi tac']],
  ['price_policy', ['chinh sach ban hang', 'chinh sach cho thue', 'chinh sach gia', 'chinh sach']],
  ['package', ['goi hoan thien', 'goi noi that']],
  ['installment', ['ky thu', 'dot thu', 'dot thanh toan', 'lich thanh toan']],
  ['loan_pay', ['ky tra lai', 'lich tra lai', 'tra lai']],
  ['collect_plan', ['ke hoach thu', 'ke hoach dong tien']],
  ['target', ['chi tieu kpi']],
  ['unit', ['can ho', 'can lien ke', 'shophouse', 'can']],
  ['building', ['toa nha', 'so toa']],
  ['project', ['du an']],
  ['template', ['mau bieu', 'mau in']],
];
const COUNT_W = ['bao nhieu', 'may', 'so luong', 'tong so', 'dem', 'co tat ca'];
const LIST_W = ['danh sach', 'liet ke', 'nhung', 'cac', 'nao', 'ai', 'xem', 'cho toi', 'list'];
const SUM_W = ['tong tien', 'tong gia tri', 'bao nhieu tien', 'tong cong', 'gia tri', 'so tien', 'doanh thu', 'tong thu', 'tong chi'];
// ngày chính để lọc theo thời gian
const DATE_K = { contract: 'contract_on', receipt: 'voucher_date', payment: 'voucher_date', reservation: 'reg_date', noxh_check: 'received_on', contact_log: 'at', debt_call: 'at',
  ticket: 'at', handover: 'actual_on', installment: 'due_on', loan_pay: 'due_on', defect: 'found_on', agent: 'from_on', price_policy: 'from_on', sale_notice: 'open_on' };
const MONEY_K = { contract: 'value', receipt: 'amount', payment: 'amount', reservation: 'price', installment: 'amount', loan_pay: 'amount', refund: 'amount', commission: 'amount', unit: 'total_price' };

function detectEnt(t) {
  if (/(^|[^a-z])can( ho)?\b.*\b(da|chua) ban giao\b/.test(t)) return { ent: 'unit', w: 'can', extra: {}, at: 0 };   // «căn đã bàn giao» = trạng thái căn
  let best = null;
  for (const [ent, ws, extra] of ENTS) for (const w of ws) {
    const m = re(w).exec(t); if (!m) continue;
    if (!best || w.length > best.w.length) best = { ent, w, extra: extra || {}, at: m.index };
  }
  return best;
}
// thời gian: trả { fr, to, label }
function detectTime(t, T) {
  const d = new Date(T + 'T00:00:00'), iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const add = k => { const x = new Date(d); x.setDate(x.getDate() + k); return iso(x); };
  const dow = (d.getDay() + 6) % 7, y = d.getFullYear(), m = d.getMonth();
  const dm = s => { const r = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/.exec(s); if (!r) return null; const yy = r[3] ? (r[3].length === 2 ? 2000 + +r[3] : +r[3]) : y; return iso(new Date(yy, +r[2] - 1, +r[1])); };
  const rg = /tu (?:ngay )?(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?) den (?:ngay )?(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/.exec(t);
  if (rg) return { fr: dm(rg[1]), to: dm(rg[2]), label: `từ ${C.dmy(dm(rg[1]))} đến ${C.dmy(dm(rg[2]))}` };
  if (hasW(t, 'hom nay')) return { fr: T, to: T, label: 'hôm nay' };
  if (hasW(t, 'hom qua')) return { fr: add(-1), to: add(-1), label: 'hôm qua' };
  if (hasW(t, 'ngay mai')) return { fr: add(1), to: add(1), label: 'ngày mai' };
  if (hasW(t, 'tuan nay')) return { fr: add(-dow), to: add(6 - dow), label: 'tuần này' };
  if (hasW(t, 'tuan truoc')) return { fr: add(-dow - 7), to: add(-dow - 1), label: 'tuần trước' };
  if (hasW(t, 'tuan sau') || hasW(t, 'tuan toi')) return { fr: add(7 - dow), to: add(13 - dow), label: 'tuần sau' };
  const nd = /(\d{1,3}) ngay (qua|truoc|gan day|toi|sap toi)/.exec(t);
  if (nd) return /qua|truoc|gan day/.test(nd[2]) ? { fr: add(-+nd[1]), to: T, label: `${nd[1]} ngày qua` } : { fr: T, to: add(+nd[1]), label: `${nd[1]} ngày tới` };
  if (hasW(t, 'thang nay')) return { fr: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)), label: `tháng ${m + 1}/${y}` };
  if (hasW(t, 'thang truoc')) return { fr: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)), label: `tháng ${new Date(y, m - 1, 1).getMonth() + 1}/${new Date(y, m - 1, 1).getFullYear()}` };
  if (hasW(t, 'thang sau') || hasW(t, 'thang toi')) return { fr: iso(new Date(y, m + 1, 1)), to: iso(new Date(y, m + 2, 0)), label: `tháng ${new Date(y, m + 1, 1).getMonth() + 1}/${new Date(y, m + 1, 1).getFullYear()}` };
  const mo = /thang (\d{1,2})(?:[/ ](?:nam )?(\d{4}))?/.exec(t);
  if (mo && +mo[1] >= 1 && +mo[1] <= 12) { const yy = mo[2] ? +mo[2] : y; return { fr: iso(new Date(yy, +mo[1] - 1, 1)), to: iso(new Date(yy, +mo[1], 0)), label: `tháng ${+mo[1]}/${yy}` }; }
  const q4 = /quy (\d)(?:[/ ](?:nam )?(\d{4}))?/.exec(t);
  if (q4 && +q4[1] >= 1 && +q4[1] <= 4) { const yy = q4[2] ? +q4[2] : y, s = (+q4[1] - 1) * 3; return { fr: iso(new Date(yy, s, 1)), to: iso(new Date(yy, s + 3, 0)), label: `quý ${q4[1]}/${yy}` }; }
  if (hasW(t, 'nam nay')) return { fr: `${y}-01-01`, to: `${y}-12-31`, label: `năm ${y}` };
  if (hasW(t, 'nam ngoai') || hasW(t, 'nam truoc')) return { fr: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: `năm ${y - 1}` };
  const yr = /nam (20\d\d)/.exec(t); if (yr) return { fr: `${yr[1]}-01-01`, to: `${yr[1]}-12-31`, label: `năm ${yr[1]}` };
  const one = /ngay (\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/.exec(t); if (one) return { fr: dm(one[1]), to: dm(one[1]), label: `ngày ${C.dmy(dm(one[1]))}` };
  return null;
}

const UL = u => ({ ty: 'tỷ', trieu: 'triệu', tr: 'triệu', nghin: 'nghìn' })[u] || u;
async function run(c, raw, user) {
  const t = c.t, hit = detectEnt(t); if (!hit) return null;
  const E = C.E[hit.ent]; if (!E) return null;
  if (!C.can(user, E, 'r')) return { steps: [E.title], answer: `Vai trò của bạn không được xem **${E.title.toLowerCase()}**.` };
  const F = C.F[hit.ent], qs = { ...hit.extra }, notes = [];
  // của tôi / tôi đang có / tôi phụ trách
  const mine = /\b(cua toi|cua minh|toi dang co|toi co|minh co|minh dang co|toi phu trach|minh phu trach|toi quan ly|toi tao|toi lap|toi ban)\b/.test(t);
  if (mine) qs.mine = '1';
  if (c.f.project) qs.project = c.f.project;
  if (c.f.building) qs.building = c.f.building;
  // trạng thái / phân loại: khớp nhãn tùy chọn của các ô chọn (nhãn dài khớp trước, bỏ nhãn quá chung)
  const tm = detectTime(t, C.today()), tmTxt = tm ? fold(tm.label) + ' ' + (/(hom nay|hom qua|ngay mai|tuan (nay|truoc|sau|toi)|thang (nay|truoc|sau|toi|\d{1,2})|quy \d|nam (nay|ngoai|truoc|20\d\d))/.exec(t)?.[0] || '') : '';
  const sels = E.fields.filter(f => f.t === 'sel' && !f.noFilter);
  const picks = [];
  for (const f of sels) {
    if (qs['f_' + f.k]) continue;
    const os = (await C.optsOf(f)).map(o => [o[0], o[1], fold(o[1])]).filter(o => o[2].length >= 3 && !['khac', 'moi', 'co', 'khong', 'thang', 'quy', 'nam', 'tuan', 'ngay', 'ky', 'lan', 'dot', 'tong', 'can', 'khach', 'hop dong'].includes(o[2]) && !(tmTxt && tmTxt.includes(o[2]))).sort((a, b) => b[2].length - a[2].length);
    const o = os.find(o => hasW(t, o[2]) && !hasW(hit.w, o[2])); if (o) picks.push({ f, o, len: o[2].length });
  }
  for (const p of picks.sort((a, b) => b.len - a.len)) {
    if (picks.some(x => x !== p && x.len > p.len && x.o[2].includes(p.o[2]))) continue;   // «đã ký HĐMB» trùm «đã ký»
    if (p.f.k === 'status') qs.status = p.o[0]; else qs['f_' + p.f.k] = p.o[0];
    notes.push(`${p.f.l.toLowerCase()}: ${p.o[1]}`);
  }
  // «chưa xử lý / đang mở / chưa xong / còn tồn» → mọi trạng thái chưa đóng
  if (F.status && !qs.status && /\b(chua (duoc )?(xu ly|giai quyet|xong|hoan thanh|hoan tat|dong|ky|duyet|ban giao|thanh toan)|dang mo|con mo|con ton|ton dong|dang xu ly|chua hoan)\b/.test(t)) {
    const CL = /(dong|hoan tat|hoan thanh|da xu ly|da phan hoi|huy|thanh ly|het han|tu choi|da ky|da ban giao|da duyet|da thu|da ra so|ket thuc|ngung)/;
    const os = (await C.optsOf(F.status)).filter(o => !CL.test(fold(o[1]))); if (os.length) { qs.status = os.map(o => o[0]).join(','); notes.push('chưa xong: ' + os.map(o => o[1]).join(' / ')); }
  }
  // người phụ trách theo tên («khách của Thư», «hợp đồng của Nguyễn Thị Thanh Dung»)
  const ok = F.owner_id ? 'owner_id' : F.assignee_id ? 'assignee_id' : null;
  if (ok && !mine) {
    const us = (await q('SELECT id, full_name FROM kd_user')).map(u => { const a = fold(u.full_name).split(/\s[–-]\s/).map(x => x.trim()).filter(Boolean); return { ...u, f: a[0] || '', alt: a }; });
    let who = us.filter(u => u.alt.some(x => x.length > 4 && hasW(t, x)));
    if (who.length > 1) { const L2 = Math.max(...who.map(u => Math.max(...u.alt.filter(x => hasW(t, x)).map(x => x.length)))); who = who.filter(u => u.alt.some(x => x.length === L2 && hasW(t, x))); }
    if (!who.length) { const m = /\b(cua|do|nhan vien|nv|sale|chi|anh|em|ban) ([a-z]+(?: [a-z]+){0,3})/.exec(t); if (m) { const nm = m[2].split(' '); for (let k = nm.length; k >= 1 && !who.length; k--) { const s = nm.slice(0, k).join(' '); if (s.length >= 2 && !['toi', 'minh', 'ban', 'du an', 'toa'].includes(s)) who = us.filter(u => re(s).test(u.f) && u.f.endsWith(s)); } } }
    if (who.length === 1) { qs['f_' + ok] = String(who[0].id); notes.push(`phụ trách: ${who[0].full_name}`); }
    else if (who.length > 1 && who.length <= 6) notes.push(`(có ${who.length} người trùng tên: ${who.map(u => u.full_name).join(', ')} — ghi rõ họ tên)`);
  }
  // ngưỡng tiền: «trên 2 tỷ», «dưới 500 triệu», «từ 1 đến 3 tỷ»
  const mk0 = MONEY_K[hit.ent] && F[MONEY_K[hit.ent]] ? MONEY_K[hit.ent] : null;
  if (mk0) {
    const amt = (n, u) => +String(n).replace(',', '.') * (/^ty/.test(u) ? 1e9 : /^(trieu|tr)/.test(u) ? 1e6 : 1e3);
    const rg = /tu (\d+(?:[.,]\d+)?) (?:den|toi|-) (\d+(?:[.,]\d+)?) ?(ty|trieu|tr|nghin)\b/.exec(t);
    if (rg) { qs['mn_' + mk0] = amt(rg[1], rg[3]); qs['mx_' + mk0] = amt(rg[2], rg[3]); notes.push(`${F[mk0].l.toLowerCase()} ${rg[1]}–${rg[2]} ${UL(rg[3])}`); }
    else {
      const up = /(tren|hon|lon hon|cao hon|tu|it nhat|>=?) (\d+(?:[.,]\d+)?) ?(ty|trieu|tr|nghin)\b/.exec(t), dn = /(duoi|nho hon|thap hon|toi da|<=?) (\d+(?:[.,]\d+)?) ?(ty|trieu|tr|nghin)\b/.exec(t);
      if (up) { qs['mn_' + mk0] = amt(up[2], up[3]); notes.push(`${F[mk0].l.toLowerCase()} ≥ ${up[2]} ${UL(up[3])}`); }
      if (dn) { qs['mx_' + mk0] = amt(dn[2], dn[3]); notes.push(`${F[mk0].l.toLowerCase()} ≤ ${dn[2]} ${UL(dn[3])}`); }
    }
  }
  // căn: tầng, hướng, số phòng ngủ, diện tích
  if (hit.ent === 'unit') {
    const fl = /\btang (\d{1,2})\b/.exec(t); if (fl) { qs.f_floor = fl[1]; notes.push(`tầng ${fl[1]}`); }
    const hg = /hướng ([^\s,?.]+(?: (?:đông|tây|nam|bắc)[^\s,?.]*)?)/i.exec(raw); if (hg) { qs.lk_direction = hg[1]; notes.push(`hướng ${hg[1]}`); }
    const pn = /\b(\d) ?(pn|phong ngu)\b/.exec(t); if (pn && !qs.f_kind) { qs.f_bedrooms = pn[1]; notes.push(`${pn[1]} phòng ngủ`); }
    const dt = /dien tich (tren|duoi|tu) (\d+)/.exec(t); if (dt) { qs[(dt[1] === 'duoi' ? 'mx_' : 'mn_') + 'area_tt'] = dt[2]; notes.push(`diện tích ${dt[1] === 'duoi' ? '≤' : '≥'} ${dt[2]} m²`); }
  }
  // thời gian: theo ngày chính của loại hồ sơ; không có thì theo ngày tạo
  const dk = DATE_K[hit.ent] && F[DATE_K[hit.ent]] ? DATE_K[hit.ent] : null;
  if (tm && dk) { qs['fr_' + dk] = tm.fr; qs['to_' + dk] = tm.to; notes.push(`${(F[dk].l || '').toLowerCase()} ${tm.label}`); }
  // ô tìm còn lại: tên riêng trong ngoặc kép
  const qq = /["«“]([^"»”]{2,60})["»”]/.exec(raw); if (qq) { qs.q = qq[1]; notes.push(`có chứa «${qq[1]}»`); }
  let r;
  try { r = await C.list(hit.ent, user, qs, { limit: 20000 }); } catch (e) { return { steps: [E.title], answer: `Không tra được ${E.title.toLowerCase()}: ${e.message}` }; }
  let rows = r.rows, total = +r.total;
  if (tm && !dk) {   // lọc theo ngày tạo (giờ Việt Nam)
    const vn = x => x ? new Date(new Date(x).getTime() + 7 * 3600e3).toISOString().slice(0, 10) : '';
    rows = rows.filter(x => { const d = vn(x.created_at); return d && d >= tm.fr && d <= tm.to; }); total = rows.length; notes.push(`tạo ${tm.label}`);
    if (r.counts) { const cn = {}; for (const x of rows) cn[x.status] = (cn[x.status] || 0) + 1; r.counts = cn; }
  }
  // xếp hạng: lớn nhất / mới nhất / cũ nhất…
  const sup = /\b(lon nhat|cao nhat|nhieu nhat|nho nhat|thap nhat|it nhat|moi nhat|gan nhat|gan day nhat|cu nhat|lau nhat|dau tien)\b/.exec(t);
  if (sup) {
    const dkey = dk || 'created_at', asc = /nho nhat|thap nhat|it nhat|cu nhat|lau nhat|dau tien/.test(sup[1]), byMoney = /lon|cao|nhieu|nho|thap|it/.test(sup[1]) && mk0;
    const kk = byMoney ? mk0 : dkey, v = x => byMoney ? +x[kk] || 0 : String(x[kk] instanceof Date ? x[kk].toISOString() : x[kk] || '');
    rows = [...rows].sort((a, b) => (v(a) > v(b) ? 1 : v(a) < v(b) ? -1 : 0) * (asc ? 1 : -1));
    notes.push(`xếp theo ${byMoney ? F[mk0].l.toLowerCase() : (F[dkey]?.l || 'ngày tạo').toLowerCase()} ${asc ? 'tăng dần' : 'giảm dần'}`);
  }
  const one = E.one || E.title.toLowerCase(), scopeTxt = [c.p ? c.p.code : '', c.f.bname || ''].filter(Boolean).join(' · ');
  const filt = [mine ? 'của bạn' : '', scopeTxt, ...notes].filter(Boolean).join(' · ');
  const L = [`**${total} ${one}**${filt ? ' — ' + filt : ''}.`];
  // so sánh với toàn phòng khi hỏi «của tôi»
  if (mine && !C.own(user, E)) { const all = await C.list(hit.ent, user, { ...qs, mine: undefined }, { limit: 1 }).catch(() => null); if (all) L[0] += ` Toàn bộ (trong phạm vi bạn được xem): ${all.total}.`; }
  // tổng tiền
  const mk = MONEY_K[hit.ent] && F[MONEY_K[hit.ent]] ? MONEY_K[hit.ent] : null;
  const live = rows.filter(x => !['huy', 'da_huy', 'void'].includes(x.status));
  if (mk && total) L.push(`- ${/^tong/.test(fold(F[mk].l)) ? '' : 'Tổng '}${/^tong/.test(fold(F[mk].l)) ? F[mk].l : F[mk].l.toLowerCase()}: **${big(live.reduce((s, x) => s + (+x[mk] || 0), 0))}**${live.length !== rows.length ? ` (không tính ${rows.length - live.length} bản đã hủy)` : ''}`);
  if (mk && live.length && /\b(trung binh|binh quan)\b/.test(t)) L.push(`- Trung bình: **${big(live.reduce((s, x) => s + (+x[mk] || 0), 0) / live.length)}** / ${one}`);
  // phân bố theo trạng thái (khi chưa lọc trạng thái)
  if (r.counts && !qs.status && Object.keys(r.counts).length > 1) {
    const sf = F.status, ls = [];
    for (const [k, n] of Object.entries(r.counts).sort((a, b) => b[1] - a[1])) ls.push(`${await C.optLabel(sf, k)} ${n}`);
    L.push(`- Theo trạng thái: ${ls.join(' · ')}`);
  }
  // nhóm «theo …»
  const by = /\btheo (du an|toa|nhan vien|nguoi phu trach|phu trach|nguoi tao|nguon|tinh trang|trang thai|loai|phan loai|thang|kenh|dai ly|khach hang|khach|can|hinh thuc|tien do|ket qua|muc uu tien|huong|tang|[a-z]+(?: [a-z]+){0,3})\b/.exec(t);
  let key0 = null;
  if (by && rows.length) {
    let key, lab;
    const fk = { 'du an': ['project_id', 'interest_project'], toa: ['building_id'], 'nhan vien': ['owner_id', 'assignee_id', 'created_by'], 'nguoi phu trach': ['owner_id', 'assignee_id'], 'phu trach': ['owner_id', 'assignee_id'],
      nguon: ['source', 'src'], 'nguoi tao': ['created_by'], 'khach hang': ['customer_id'], khach: ['customer_id'], can: ['unit_id'], 'hinh thuc': ['deal', 'reg_kind', 'method'], 'tien do': ['progress'], 'ket qua': ['result'], 'muc uu tien': ['priority'], huong: ['direction'], tang: ['floor'], 'tinh trang': ['stage', 'status'], 'trang thai': ['status', 'stage'], loai: ['kind', 'ptype'], 'phan loai': ['kind', 'ptype'], kenh: ['channel'], 'dai ly': ['agent_id'] }[by[1]];
    if (by[1] === 'thang' && dk) { key = x => String(x[dk] instanceof Date ? x[dk].toISOString() : x[dk] || '').slice(0, 7) || '—'; lab = 'Tháng'; }
    else if ((by[1] === 'du an' && !F.project_id || by[1] === 'toa' && !F.building_id) && F.unit_id) {   // hồ sơ gắn căn: dự án / tòa lấy theo căn
      const pb = new Map((await q(`SELECT u.id, p.code||' · '||p.name pj, p.code||' · Tòa '||b.code bd FROM kd_unit u JOIN kd_project p ON p.id = u.project_id LEFT JOIN kd_building b ON b.id = u.building_id WHERE u.id = ANY($1::int[])`, [[...new Set(rows.map(x => x.unit_id).filter(Boolean))]])).map(x => [x.id, x]));
      key = x => pb.get(x.unit_id)?.[by[1] === 'toa' ? 'bd' : 'pj'] || '—'; lab = by[1] === 'toa' ? 'Tòa' : 'Dự án';
    }
    else { const k = (fk || []).find(k => F[k] || k === 'created_by') || E.fields.find(f => !f.pii && !['long', 'json', 'grid', 'check'].includes(f.t) && fold(f.l).startsWith(by[1]))?.k; if (k) { const f = F[k]; lab = f?.l || 'Người tạo'; const ol = f?.t === 'sel' ? new Map((await C.optsOf(f)).map(o => [o[0], o[1]])) : null;
      key = x => x[k + '__l'] || (ol ? ol.get(x[k]) : null) || x[k] || '—'; } }
    if (key) {
      key0 = key;
      const g = new Map(); for (const x of rows) { const kk = key(x); const o = g.get(kk) || { n: 0, s: 0 }; o.n++; o.s += mk ? +x[mk] || 0 : 0; g.set(kk, o); }
      const gr = [...g].sort((a, b) => by[1] === 'thang' ? String(a[0]).localeCompare(String(b[0])) : b[1].n - a[1].n);
      L.push('', table([lab, 'Số lượng', ...(mk ? [/^tong/.test(fold(F[mk].l)) ? F[mk].l : 'Tổng ' + F[mk].l.toLowerCase()] : [])], gr.slice(0, 40).map(([k, o]) => [by[1] === 'thang' && /^\d{4}-\d\d$/.test(k) ? `${k.slice(5)}/${k.slice(0, 4)}` : cell(k), String(o.n), ...(mk ? [big(o.s)] : [])])));
    }
  }
  // danh sách: khi hỏi liệt kê, hoặc ít bản ghi
  const wantList = LIST_W.some(w => hasW(t, w)) || total <= 10 || !!sup || /\btop ?\d/.test(t);
  if (rows.length && wantList && !(by && key0)) {
    const n = Math.min(/\btop ?\d|\b\d{1,3} (khach|can|hop dong|hd|phieu|dong)\b/.test(t) || c.n > 10 ? c.n : 15, rows.length);
    const cols = (E.list || E.fields.map(f => f.k)).filter(k => F[k] && !F[k].pii && !['long', 'json', 'check', 'grid'].includes(F[k].t)).slice(0, 5);
    const disp = new Map((await q(`SELECT t.id, ${E.disp || 't.id'} AS d FROM ${E.table} t WHERE t.id = ANY($1::int[])`, [rows.slice(0, n).map(x => x.id)])).map(x => [x.id, x.d]));
    const val = async (x, k) => { const f = F[k], v = x[k]; if (v == null || v === '') return '';
      if (f.t === 'ref') return f.ref && ['unit', 'customer', 'contract', 'reservation'].includes(f.ref) ? link(f.ref, v, x[k + '__l'] || v) : cell(x[k + '__l'] || v);
      if (f.t === 'user' || f.t === 'refs') return cell(x[k + '__l'] || v);
      if (f.t === 'sel') return cell(await C.optLabel(f, v)); if (f.t === 'money') return big(v); if (f.t === 'bool') return v ? 'Có' : '';
      if (f.t === 'date') return C.dmy(String(v instanceof Date ? C.isoDate(v) : v).slice(0, 10)); if (f.t === 'dt') return C.dmy(new Date(v).toISOString().slice(0, 10));
      return cell(v); };
    const head = [E.one ? E.one[0].toUpperCase() + E.one.slice(1) : 'Hồ sơ', ...cols.filter((k, i) => i || !(E.disp || '').includes('t.' + k)).map(k => F[k].l)];
    const keep = cols.filter((k, i) => i || !(E.disp || '').includes('t.' + k));
    const body = []; for (const x of rows.slice(0, n)) body.push([link(hit.ent, x.id, disp.get(x.id) || '#' + x.id), ...(await Promise.all(keep.map(k => val(x, k))))]);
    L.push('', table(head, body));
    if (total > n) L.push(`_…còn ${total - n} ${one} nữa — xem đủ ở [${E.title}](#/e/${hit.ent})._`);
  } else if (total && !key0) L.push(`_Gõ «danh sách ${one}…» để xem từng dòng, hoặc mở [${E.title}](#/e/${hit.ent})._`);
  if (r._masked) L.push('_Dữ liệu định danh được che theo quyền xem._');
  return { steps: [`${E.title}${filt ? ' · ' + filt : ''}`], answer: L.join('\n') };
}
const looksLikeQuery = t => COUNT_W.concat(SUM_W, LIST_W).some(w => hasW(t, w)) || /\b(dang co|hien co|co bao)\b/.test(t);
module.exports = { run, detectEnt, detectTime, looksLikeQuery };
