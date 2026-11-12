// ===== Bộ hồ sơ theo căn (12/11/2026) =====
// Bộ «MẪU HS TNS» của phòng KD (Excel tra sheet CSDL theo mã căn) đã chuyển thành mẫu HTML có trường trộn (server/mau-tns.json, sinh bằng bộ chuyển đổi).
// Gõ mã căn → chọn bộ hồ sơ (mua bán / HĐ vay / thanh lý HĐ vay / bàn giao / thanh lý mua bán) → in cả bộ hoặc tải Word, số liệu lấy từ dữ liệu đã khai báo.
// Trường trộn: {ten_kh} … ; biểu thức tiền {=round(don_gia*1.05*dt_tt,-3)}, bằng chữ {=chu(...)} hoặc {<trường tiền>_chu}.
const C = require('./core');
const { q, one } = require('./db');
const { E } = require('./meta');
const { zip } = require('./xlsx');
const { bad, deny, can, fmtMoney, dmy } = C;

const BO = [['mua_ban', 'HS mua bán'], ['vay', 'HS hợp đồng vay'], ['tl_vay', 'HS thanh lý hợp đồng vay'], ['ban_giao', 'HS bàn giao'], ['tl_mua_ban', 'HS thanh lý mua bán']];
const MAU_TNS = () => require('./mau-tns.json').map(t => ({ code: t.code, name: t.name, kind: t.kind, bo: t.bo, scope: t.scope, ent: 'unit', content: t.content }));
const PII_PRINT = ['truong_phong', 'lanh_dao', 'ho_so', 'admin'];

// tên trường cho dòng «Thiếu dữ liệu»
const LABEL = {
  ten_kh: 'Họ tên khách', ten_kh_hoa: 'Họ tên khách', cccd: 'Số CCCD', ngay_cap: 'Ngày cấp CCCD', noi_cap: 'Nơi cấp CCCD', ngay_sinh: 'Ngày sinh', thuong_tru: 'Địa chỉ thường trú', dia_chi: 'Địa chỉ liên hệ',
  dien_thoai: 'Điện thoại', email: 'Email', mst: 'Mã số thuế', stk: 'Tài khoản ngân hàng', vc_ten: 'Họ tên vợ / chồng', vc_cccd: 'CCCD vợ / chồng', vc_ngay_cap: 'Ngày cấp CCCD vợ / chồng', vc_noi_cap: 'Nơi cấp CCCD vợ / chồng',
  dt_tt: 'Diện tích thông thủy', dt_san: 'Diện tích sàn', don_gia: 'Đơn giá nền', ngay_don: 'Ngày đơn đề nghị mua', gia_truoc_thue: 'Giá trước thuế', thue_vat: 'Thuế VAT', phi_bao_tri: 'Phí bảo trì',
  gia_sau_thue: 'Giá sau thuế', tong_gia: 'Tổng giá căn hộ', so_hdmb: 'Số HĐ mua bán', ngay_hdmb: 'Ngày ký HĐ mua bán', gia_tri_hdmb: 'Giá trị HĐ mua bán', so_hdtt: 'Số HĐ thỏa thuận hoàn thiện',
  ngay_hdtt: 'Ngày ký HĐ thỏa thuận', gia_tri_ht: 'Giá trị hoàn thiện', so_hdv: 'Số HĐ vay', ngay_hdv: 'Ngày ký HĐ vay', tien_vay: 'Số tiền vay', vay_dot1: 'Giải ngân đợt 1 (HĐ vay)', vay_dot2: 'Giải ngân đợt 2 (HĐ vay)',
  vay_dot3: 'Giải ngân đợt 3 (HĐ vay)', vay_dot4: 'Giải ngân đợt 4 (HĐ vay)', da_tt: 'Số tiền đã thanh toán HĐMB', da_tt_ht: 'Số tiền đã thanh toán HĐ thỏa thuận', dot: 'Đợt thu tiền', phai_nop: 'Số tiền phải nộp',
  da_nop: 'Số tiền đã nộp', con_nop: 'Số tiền còn phải nộp', tong_phai_nop: 'Tổng số tiền phải nộp', so_vbtt_sc: 'Số VBTT sở hữu chung', ngay_vbtt_sc: 'Ngày VBTT sở hữu chung', tien_s_chung: 'Tiền sở hữu chung',
};
const MONEY = ['gia_truoc_thue', 'thue_vat', 'phi_bao_tri', 'gia_sau_thue', 'tong_gia', 'gia_tri_hdmb', 'gia_tri_ht', 'tien_vay', 'vay_dot1', 'vay_dot2', 'vay_dot3', 'vay_dot4', 'da_tt', 'da_tt_ht',
  'phai_nop', 'da_nop', 'con_nop', 'con_tien_nha', 'con_hoan_thien', 'tong_phai_nop', 'tien_s_chung'];

const live = r => r && !['huy', 'thanh_ly'].includes(r.status);
const pick = (cts, kind) => cts.find(c => c.kind === kind && live(c)) || cts.find(c => c.kind === kind);
const num = v => v == null || v === '' ? null : +v;
const area = v => v == null || v === '' ? '' : String(+v).replace('.', ',');

// dữ liệu một căn → { map: trường → chữ, nums: trường → số, ctx: bản ghi gốc }
async function hsData(unitId, user, custId) {
  const u = await one(`SELECT u.*, b.code bcode, b.name bname, p.code pcode, p.name pname FROM kd_unit u JOIN kd_building b ON b.id = u.building_id JOIN kd_project p ON p.id = u.project_id WHERE u.id = $1`, [+unitId]);
  if (!u) bad('Không tìm thấy căn hộ');
  const all = await q(`SELECT c.* FROM kd_contract c WHERE c.unit_id = $1 ORDER BY (c.status IN ('huy', 'thanh_ly')), coalesce(c.contract_on, c.created_at::date) DESC, c.id DESC`, [u.id]);
  // một căn có thể qua nhiều khách (thanh lý / hủy rồi bán lại): custId = khách đang xem — chỉ lấy HĐ, phiếu của khách đó (12/11/2026)
  const cid0 = +custId || (await custHistory(u.id)).find(h => h.current)?.id || null;
  const cts = cid0 ? all.filter(c => c.customer_id === cid0) : all;
  const hdmb = pick(cts, 'hdmb') || pick(cts, 'thue_mua'), ht = pick(cts, 'hoan_thien'), vay = pick(cts, 'vay');
  const res = await one(`SELECT * FROM kd_reservation WHERE unit_id = $1 ${cid0 ? 'AND customer_id = $2' : ''} ORDER BY (status IN ('huy', 'het_han')), id DESC LIMIT 1`, cid0 ? [u.id, cid0] : [u.id]);
  const main = hdmb || vay || ht;
  const kid = cid0 || main?.customer_id || res?.customer_id;
  const k = kid ? await one('SELECT * FROM kd_customer WHERE id = $1', [kid]) : null;
  const nx = await one(`SELECT * FROM kd_noxh_check WHERE unit_id = $1 ${kid ? 'OR customer_id = $2' : ''} ORDER BY ${kid ? '(customer_id = $2) DESC, ' : ''}(unit_id = $1) DESC, id DESC LIMIT 1`, kid ? [u.id, kid] : [u.id]);
  const pii = PII_PRINT.includes(user.role);
  const P = v => v == null || v === '' ? '' : pii ? String(v) : '(ẩn)';
  // vợ / chồng: thành viên hộ «Vợ (Chồng)» ở hồ sơ NOXH; không có thì lấy ô Đồng sở hữu của HĐ
  const mem = (() => { try { const m = typeof nx?.members === 'string' ? JSON.parse(nx.members) : nx?.members; return (m || []).find(x => /vợ|chồng/i.test(x.relation || '')); } catch { return null; } })();
  const c = main || {};
  const bday = k?.birth ? dmy(k.birth) : '';
  const S = {
    ten_kh: k?.full_name || res?.cust_name || '', cccd: P(c.b_id_no || k?.id_no || res?.id_no), ngay_cap: P(dmy(c.b_id_date || k?.id_date || res?.id_date)), noi_cap: P(c.b_id_place || k?.id_place || res?.id_place),
    ngay_sinh: P(bday), thuong_tru: c.b_perm_addr || c.b_addr || k?.address || res?.address || '', dia_chi: c.b_addr || k?.address || res?.address || '', dien_thoai: c.b_phone || k?.phone || res?.phone || '',
    email: c.b_email || k?.email || '', mst: P(k?.tax_code || res?.tax_code), stk: P([c.b_bank_acc || k?.bank_account || res?.bank_account, c.b_bank_name && 'Ngân hàng ' + c.b_bank_name].filter(Boolean).join(' - ')),
    vc_ten: mem?.name || c.co_owner || '', vc_cccd: P(mem?.id_no), vc_ngay_cap: '', vc_noi_cap: '',
    ma_can: u.code, du_an: u.pname, toa: u.code.slice(4, 5), tang: u.code.slice(6, 8), can_so: u.code.slice(-2), so_can4: u.code.slice(-4), ma_can6: u.code.slice(-6), toa_ky: u.code.slice(3, 5),
    so_hdmb: hdmb?.number || '', ngay_hdmb: dmy(hdmb?.contract_on), ngay_don: dmy(hdmb?.request_on || res?.reg_date),
    so_hdtt: ht?.number || '', ngay_hdtt: dmy(ht?.contract_on), so_hdv: vay?.number || '', ngay_hdv: dmy(vay?.contract_on || vay?.loan_recv_on),
    so_vbtt_sc: hdmb?.agreement || '', ngay_vbtt_sc: '',
  };
  S.ten_kh_hoa = S.ten_kh.toUpperCase();
  S.cccd_dai_dien = P((typeof process !== 'undefined' && process.env?.CCCD_DAI_DIEN) || '');   // CCCD người đại diện công ty ký — đặt ở .env máy chủ
  const N = {
    dt_tt: num(hdmb?.area_tt ?? vay?.area_tt ?? u.area_tt), dt_san: num(hdmb?.area_floor ?? u.area_xd), don_gia: num(hdmb?.base_price ?? vay?.base_price ?? u.base_price),
    gia_truoc_thue: num(hdmb?.pretax ?? u.pretax), thue_vat: num(hdmb?.vat_amt ?? u.tax_amt), phi_bao_tri: num(hdmb?.maint_fee ?? u.maint_fee), gia_sau_thue: num(hdmb?.after_tax ?? vay?.unit_total ?? u.price_net),
    tong_gia: num(hdmb?.value ?? u.total_price), gia_tri_hdmb: num(hdmb?.value), gia_tri_ht: num(ht?.value ?? hdmb?.finish_value ?? u.finish_value), tien_vay: num(vay?.value), tien_s_chung: num(hdmb?.common_area_amt),
  };
  // HĐ chưa lưu sẵn giá trước thuế / VAT / bảo trì: tính theo đơn giá × diện tích như file Excel (VAT 5%, bảo trì 2%)
  if (N.don_gia && N.dt_tt) {
    const pre = Math.round(N.don_gia * N.dt_tt / 1000) * 1000;
    N.gia_truoc_thue ??= pre; N.thue_vat ??= pre * 0.05; N.phi_bao_tri ??= Math.round(pre * 0.02 / 1000) * 1000;
    N.gia_sau_thue ??= Math.round(pre * 1.05 / 1000) * 1000; N.tong_gia ??= N.gia_sau_thue + N.phi_bao_tri;
  }
  // tiền đã thu (phiếu thu hợp lệ) & lịch thu
  const paid = async ct => ct ? +(await one("SELECT coalesce(sum(amount), 0) s FROM kd_receipt WHERE contract_id = $1 AND status <> 'huy'", [ct.id])).s : null;
  const sched = async ct => ct ? await q('SELECT * FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [ct.id]) : [];
  N.da_tt = await paid(hdmb); N.da_tt_ht = await paid(ht);
  const iv = await sched(vay); [1, 2, 3, 4].forEach(i => { N['vay_dot' + i] = iv[i - 1] ? +iv[i - 1].amount : null; });
  // thông báo nộp tiền: đợt đang phải thu = đợt đầu tiên mà lũy kế phải nộp vượt số đã nộp
  const im = await sched(hdmb), ih = await sched(ht);
  if (im.length) {
    const daNha = N.da_tt || 0, daHt = N.da_tt_ht || 0;
    let cum = 0, cumHt = 0, dot = im[im.length - 1];
    for (const i of im) { cum += +i.amount; if (cum > daNha + 0.5) { dot = i; break; } }
    cum = im.filter(i => i.seq <= dot.seq).reduce((s, i) => s + +i.amount, 0);
    cumHt = ih.filter(i => i.seq <= dot.seq).reduce((s, i) => s + +i.amount, 0);
    Object.assign(N, { phai_nop: cum + cumHt, da_nop: daNha + daHt, con_nop: Math.max(0, cum + cumHt - daNha - daHt), con_tien_nha: Math.max(0, cum - daNha), con_hoan_thien: Math.max(0, cumHt - daHt),
      tong_phai_nop: im.reduce((s, i) => s + +i.amount, 0) + ih.reduce((s, i) => s + +i.amount, 0) });
    S.dot = String(dot.seq);
  } else S.dot = '';
  const { moneyWords } = require('./io');
  for (const [key, v] of Object.entries(N)) {
    if (MONEY.includes(key)) { S[key] = v == null ? '' : fmtMoney(v); S[key + '_chu'] = v ? moneyWords(v) : ''; }
    else S[key] = key === 'don_gia' ? (v == null ? '' : fmtMoney(v)) : area(v);
  }
  const d = C.today().split('-');
  Object.assign(S, { ngay: dmy(C.today()), ngay_viet: `ngày ${d[2]} tháng ${d[1]} năm ${d[0]}`, nguoi_lap: user.full_name || '' });
  return { map: S, nums: N, ctx: { u, hdmb, ht, vay, res, k, nx, cts } };
}

// ---- biểu thức {=…}: số, trường số, + - * / ( ), round(x, n), chu(x) — không dùng eval ----
function evalExpr(src, N, miss) {
  const t = src.match(/\d+(?:\.\d+)?|[a-z_][a-z_0-9]*|[-+*/(),]/gi) || []; let i = 0;
  const peek = () => t[i], take = () => t[i++];
  const atom = () => {
    const x = take();
    if (x === '(') { const v = add(); take(); return v; }
    if (x === '-') return -atom();
    if (x === '+') return atom();
    if (/^\d/.test(x)) return +x;
    if (peek() === '(') {
      take(); const a = [add()]; while (peek() === ',') { take(); a.push(add()); } take();
      if (x === 'round') { const f = 10 ** (a[1] || 0); return Math.round(a[0] * f) / f; }
      if (x === 'chu') return { chu: a[0] };
      throw new Error('hàm ' + x);
    }
    if (N[x] == null) { miss.add(x); return 0; }
    return +N[x];
  };
  const mul = () => { let v = atom(); while (peek() === '*' || peek() === '/') { const o = take(), b = atom(); v = o === '*' ? v * b : v / b; } return v; };
  const add = () => { let v = mul(); while (peek() === '+' || peek() === '-') { const o = take(), b = mul(); v = o === '+' ? v + b : v - b; } return v; };
  return add();
}
const NO_MISS = new Set(['cccd_dai_dien']);   // để trống thì in «……» nhưng không báo thiếu
const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DOTS = '…………………';
// trộn mẫu với dữ liệu căn; miss = trường còn trống
function merge(content, D, miss = new Set()) {
  const { moneyWords, fillToday } = require('./io');
  return fillToday(String(content || '').replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\{=([^{}]+)\}/g, (m, ex) => {
      const before = miss.size; let v;
      try { v = evalExpr(ex, D.nums, miss); } catch { return m; }
      if (miss.size > before) return DOTS;
      if (v && typeof v === 'object') return escH(v.chu ? moneyWords(Math.round(v.chu)) : '');
      return escH(fmtMoney(Math.round(v)));
    })
    .replace(/\{(\w+)\}/g, (m, k) => {
      if (!(k in D.map)) return m;
      const v = D.map[k];
      if (v === '' || v == null) { if (!NO_MISS.has(k)) miss.add(k.replace(/_chu$|_hoa$/, '')); return DOTS; }
      return escH(v);
    }));
}
const missOf = (content, D) => { const s = new Set(); merge(content, D, s); return [...s].map(k => LABEL[k] || k); };

// bước hiện tại của căn (gợi ý bộ hồ sơ)
function stepOf(ctx) {
  const { hdmb, vay, ht, cts } = ctx;
  if (cts.some(c => ['hdmb', 'hoan_thien'].includes(c.kind) && c.status === 'thanh_ly')) return 'tl_mua_ban';
  if (vay && (vay.status === 'thanh_ly' || vay.closed)) return 'tl_vay';
  if (hdmb && hdmb.status === 'da_ky' && ht) return 'ban_giao';
  if (vay && !hdmb) return 'vay';
  return 'mua_ban';
}

async function unitTemplates(unitId) {
  const IO = require('./io');
  const sc = await IO.recScope('unit', unitId);
  const ts = await q('SELECT id, code, name, kind, bo, scope, bedrooms, content FROM kd_template WHERE active AND bo IS NOT NULL ORDER BY code');
  return ts.filter(t => IO.tplFitLevel(t, sc) >= 0);
}
// dự án chưa có mẫu cho bộ hồ sơ nào → tự chép bộ mẫu chuẩn (MẪU HS TNS) thành mẫu riêng của dự án đó (12/11/2026, Tâm: «thêm tự động tất cả các mẫu đã có»)
// mỗi dự án vẫn dùng mẫu của mình (sửa mẫu dự án này không ảnh hưởng dự án khác); mẫu tách theo tòa của TNS chỉ lấy 1 bản (D-E-F-G / D-E)
async function autoProjectTemplates(unitId, user) {
  const IO = require('./io');
  const sc = await IO.recScope('unit', unitId); if (!sc.pcode) return 0;
  const have = (await q('SELECT bo, scope, bedrooms FROM kd_template WHERE active AND bo IS NOT NULL')).filter(t => IO.tplFitLevel(t, sc) >= 0);
  const P = String(sc.pcode).toUpperCase(), base = MAU_TNS(), done = new Set(); let n = 0;
  const sysU = await one("SELECT * FROM kd_user WHERE role = 'admin' AND active ORDER BY id LIMIT 1") || C.SYS;
  for (const [bo] of BO) {
    if (have.some(t => t.bo === bo)) continue;
    for (const t of base.filter(x => x.bo === bo)) {
      const key = t.code.replace(/-(DEFG|HIJ|DE|FG)$/, ''); if (done.has(key)) continue; done.add(key);
      const code = key.replace(/^TNS-/, P + '-');
      if (await one('SELECT 1 FROM kd_template WHERE upper(code) = upper($1)', [code])) continue;
      await C.create('template', { code, name: t.name.replace(/\s*\(tòa [^)]*\)$/, ''), kind: t.kind, bo, ent: 'unit', scope: P, content: t.content, active: true }, sysU, { system: true });
      n++;
    }
  }
  return n;
}
// căn của khách: theo hợp đồng, phiếu đăng ký, hồ sơ NOXH (mới nhất trước)
async function unitsOfCustomer(kid) {
  return q(`SELECT u.id, u.code FROM kd_unit u WHERE u.id IN (
      SELECT unit_id FROM kd_contract WHERE customer_id = $1 UNION SELECT unit_id FROM kd_reservation WHERE customer_id = $1 UNION SELECT unit_id FROM kd_noxh_check WHERE customer_id = $1)
    ORDER BY u.code`, [kid]);
}
// ô tìm nhận mã căn, mã khách hàng, SĐT hoặc CCCD của khách (12/11/2026) → { id, cust, units }
async function findUnit(key) {
  const s = String(key || '').trim(); if (!s) bad('Nhập mã căn hộ hoặc mã khách hàng');
  const u = /^\d+$/.test(s) && s.length < 8 ? await one('SELECT id FROM kd_unit WHERE id = $1', [+s]) : await one('SELECT id FROM kd_unit WHERE upper(code) = upper($1)', [s]);
  if (u) return { id: u.id };
  const k = await one(`SELECT id, code, full_name FROM kd_customer WHERE upper(code) = upper($1) OR regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g') AND length(regexp_replace($1, '\\D', '', 'g')) >= 9
    OR (id_no = $1 AND length($1) >= 9) ORDER BY (upper(code) = upper($1)) DESC, id DESC LIMIT 1`, [s]);
  if (!k) bad(`Không tìm thấy căn hoặc khách hàng «${s}»`);
  const units = await unitsOfCustomer(k.id);
  if (!units.length) bad(`Khách ${k.code} · ${k.full_name} chưa gắn với căn nào (chưa có phiếu đăng ký / hợp đồng / hồ sơ NOXH)`);
  return { id: units[0].id, cust: k, units };
}
// lịch sử khách của căn: mọi khách từng có HĐ / phiếu đăng ký / hồ sơ NOXH với căn, kèm trạng thái (đang giao dịch, đã thanh lý, đã hủy…)
const CT_KIND = { hdmb: 'HĐMB', thue_mua: 'HĐ thuê mua', hoan_thien: 'HĐ thỏa thuận', vay: 'HĐ vay', thue: 'HĐ thuê' };
const CT_ST = { du_thao: 'Dự thảo', cho_duyet: 'Đang rà soát', cho_ky: 'Chờ ký', tu_choi: 'Trả lại', da_ky: 'Đã ký', thanh_ly: 'Đã thanh lý', huy: 'Đã hủy' };
const RS_ST = { nhap: 'Nháp', cho_duyet: 'Chờ duyệt', giu_cho: 'Đang giữ chỗ', qua_han: 'Quá hạn giữ chỗ', da_coc: 'Đã đặt cọc', chuyen_hd: 'Đã chuyển hợp đồng', het_han: 'Hết hạn', tu_choi: 'Từ chối', huy: 'Đã hủy' };
const NX_ST = { nhap: 'Dự thảo', cho_duyet: 'Chờ xét duyệt', da_duyet: 'Đã duyệt SXD', tu_choi: 'Trả lại' };
async function custHistory(unitId) {
  const cts = await q('SELECT id, customer_id, kind, number, status, contract_on, created_at FROM kd_contract WHERE unit_id = $1 AND customer_id IS NOT NULL', [+unitId]);
  const rs = await q('SELECT id, customer_id, code, status, reg_date, created_at FROM kd_reservation WHERE unit_id = $1 AND customer_id IS NOT NULL', [+unitId]);
  const nx = await q('SELECT id, customer_id, status, received_on, created_at FROM kd_noxh_check WHERE unit_id = $1 AND customer_id IS NOT NULL', [+unitId]);
  const ids = [...new Set([...cts, ...rs, ...nx].map(r => r.customer_id))]; if (!ids.length) return [];
  const ks = await q('SELECT id, code, full_name, phone FROM kd_customer WHERE id = ANY($1)', [ids]);
  const day = r => String(r.contract_on || r.reg_date || r.received_on || r.created_at || '').slice(0, 10);
  const out = ks.map(k => {
    const c = cts.filter(x => x.customer_id === k.id), r = rs.filter(x => x.customer_id === k.id), n = nx.filter(x => x.customer_id === k.id);
    const liveC = c.filter(x => !['huy', 'thanh_ly'].includes(x.status)), liveR = r.filter(x => !['huy', 'het_han', 'tu_choi', 'qua_han', 'chuyen_hd'].includes(x.status));
    let st, tone;
    if (liveC.length) { st = 'Đang giao dịch'; tone = 'ok'; }
    else if (c.some(x => x.status === 'thanh_ly')) { st = 'Đã thanh lý'; tone = 'tl'; }
    else if (c.length) { st = 'Đã hủy hợp đồng'; tone = 'huy'; }
    else if (liveR.length) { st = 'Đang đăng ký · ' + (RS_ST[liveR[0].status] || liveR[0].status); tone = 'ok'; }
    else if (r.length) { st = 'Đăng ký ' + (RS_ST[r[0].status] || r[0].status).toLowerCase(); tone = 'huy'; }
    else { st = 'Hồ sơ NOXH · ' + (NX_ST[n[0].status] || n[0].status); tone = 'nx'; }
    const items = [...c.map(x => ({ t: CT_KIND[x.kind] || 'HĐ', no: x.number || '#' + x.id, st: CT_ST[x.status] || x.status, d: day(x), ent: 'contract', id: x.id })),
      ...r.map(x => ({ t: 'Phiếu đăng ký', no: x.code || '#' + x.id, st: RS_ST[x.status] || x.status, d: day(x), ent: 'reservation', id: x.id })),
      ...n.map(x => ({ t: 'Hồ sơ NOXH', no: '#' + x.id, st: NX_ST[x.status] || x.status, d: day(x), ent: 'noxh_check', id: x.id }))].sort((a, b) => a.d.localeCompare(b.d));
    const ds = items.map(x => x.d).filter(Boolean);
    return { id: k.id, code: k.code, name: k.full_name, phone: k.phone, st, tone, current: !!(liveC.length || liveR.length), from: dmy(ds[0]), to: dmy(ds[ds.length - 1]), last: ds[ds.length - 1] || '', items };
  });
  return out.sort((a, b) => (b.current - a.current) || b.last.localeCompare(a.last));
}
// màn Bộ hồ sơ theo căn
async function hsInfo(key, user, custId) {
  if (!can(user, E.unit, 'r')) deny();
  const f = await findUnit(key), id = f.id, hist = await custHistory(id);
  const cid = +custId || f.cust?.id || hist.find(h => h.current)?.id || hist[0]?.id || null;
  const D = await hsData(id, user, cid), x = D.ctx;
  const others = f.units || (x.k ? await unitsOfCustomer(x.k.id) : []);
  const added = await autoProjectTemplates(id, user);
  const ts = await unitTemplates(id);
  const ctInfo = c => c && { id: c.id, number: c.number, status: c.status, on: dmy(c.contract_on), value: c.value };
  return {
    unit: { id: x.u.id, code: x.u.code, project: x.u.pname, building: x.u.bname || 'Tòa ' + x.u.bcode, area: x.u.area_tt, status: x.u.status },
    customer: x.k && { id: x.k.id, code: x.k.code, name: x.k.full_name, phone: x.k.phone },
    hdmb: ctInfo(x.hdmb), ht: ctInfo(x.ht), vay: ctInfo(x.vay), reservation: x.res && { id: x.res.id, code: x.res.code, status: x.res.status }, noxh: x.nx && { id: x.nx.id },
    history: hist, cust: cid,
    units: others.length > 1 ? others.map(r => r.code) : [], byCustomer: f.cust ? f.cust.code : null,
    step: stepOf(x), added, demoFill: demoFillOn(),
    bos: BO.map(([k, l]) => ({ k, l, tpls: ts.filter(t => t.bo === k).map(t => ({ code: t.code, name: t.name, kind: t.kind, missing: missOf(t.content, D) })) })),
  };
}

// thể thức theo NĐ 30/2020/NĐ-CP Phụ lục I: A4, lề trên / dưới 20 mm, trái 30 mm, phải 15 mm; Times New Roman cỡ 13; giãn dòng ~1,3
const HS_CSS = `@page{size:A4;margin:20mm 15mm 20mm 30mm} body{font:13pt/1.3 "Times New Roman",serif;color:#000;max-width:165mm;margin:auto}
  table.xl{width:100%;border-collapse:collapse;table-layout:fixed} table.xl td{padding:1.5pt 2pt;vertical-align:top;overflow-wrap:break-word}
  .wd p{margin:0 0 4pt} table.bd{width:100%;border-collapse:collapse;margin:4pt 0} table.bd td{border:1px solid #000;padding:2pt 4pt;vertical-align:top} table.bd p{margin:0}
  section.hs + section.hs{page-break-before:always;break-before:page} .hs-t{font:600 12px system-ui;color:#5b6b7f;margin:18px 0 6px}
  @media print{.hs-t{display:none}}`;
async function hsDocs(unitId, codes, user, custId) {
  if (!can(user, E.unit, 'r')) deny();
  const ts = await unitTemplates(unitId), want = String(codes || '').split(',').map(s => s.trim()).filter(Boolean);
  const pickT = want.length ? want.map(c => ts.find(t => t.code === c)).filter(Boolean) : ts;
  if (!pickT.length) bad('Chưa chọn hồ sơ (hoặc mẫu không áp dụng cho căn này)');
  const D = await hsData(unitId, user, custId);
  return { D, docs: pickT.map(t => ({ t, html: merge(t.content, D) })) };
}
// in cả bộ: 1 trang HTML, mỗi hồ sơ một trang mới, sửa được trực tiếp trước khi in
async function printHs(unitId, codes, user, bo, custId) {
  const IO = require('./io');
  const { D, docs } = await hsDocs(unitId, codes, user, custId);
  await C.audit({ q }, 'unit', +unitId, 'in_bo_ho_so', null, null, user, docs.map(d => d.t.code).join(', '));
  const body = docs.map(d => `<section class="hs" data-code="${escH(d.t.code)}"><div class="hs-t" contenteditable="false">${escH(d.t.name)}</div>${d.html}</section>`).join('');
  // nút «Lưu bản đã sửa vào kho»: gửi đúng nội dung đang thấy (kể cả chữ đã sửa tay) → file Word trong Kho, gắn vào HĐ của căn (12/11/2026)
  const saveBtn = `<button id="hsSave" title="Lưu đúng bản đang thấy (kể cả chỗ đã sửa) thành file Word trong Kho hồ sơ của căn — mở lại lúc nào cũng còn">💾 Lưu bản đã sửa vào kho</button>`;
  const saveJs = `<script>(() => { const b = document.getElementById('hsSave'); if (!b) return;
    b.onclick = async () => { b.disabled = true; const t = b.textContent; b.textContent = 'Đang lưu…';
      try { const secs = [...document.querySelectorAll('section.hs')].map(s => { const c = s.cloneNode(true); c.querySelectorAll('.hs-t').forEach(x => x.remove()); return { code: s.dataset.code, html: c.innerHTML }; });
        const f = (window.opener && !window.opener.closed && window.opener.fetch) ? window.opener.fetch.bind(window.opener) : fetch;   // bản demo: máy chủ chạy trong tab gốc
        const r = await f('/api/hs/${+unitId}/save-html', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bo: ${JSON.stringify(bo || '')}, cust: ${+custId || 0}, docs: secs }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Không lưu được');
        b.textContent = '✓ Đã lưu «' + j.file.name + '»'; try { window.opener && window.opener.__ctgHsSaved && window.opener.__ctgHsSaved(); } catch (e) {}
        setTimeout(() => { b.textContent = t; b.disabled = false; }, 4000);
      } catch (e) { alert(e.message); b.textContent = t; b.disabled = false; } };
  })()</` + `script>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Hồ sơ ${escH(D.map.ma_can)}</title><style>${HS_CSS}
    ${IO.EDIT_CSS}</style></head><body>${IO.editBar(`Bộ hồ sơ căn <b>${escH(D.map.ma_can)}</b> · ${docs.length} hồ sơ — số liệu lấy theo dữ liệu đã khai báo; chỗ «${DOTS}» là dữ liệu còn trống`)}${IO.editDoc(body)}${saveJs}</body></html>`.replace('<button class="pri" onclick="print()">', saveBtn + '<button class="pri" onclick="print()">');
}
// bản đã sửa trên trang in → Word (bỏ script / thuộc tính on…, contenteditable)
async function wordFromHtml(unitId, docs, user) {
  if (!Array.isArray(docs) || !docs.length) bad('Không có nội dung để lưu');
  const u = await one('SELECT code FROM kd_unit WHERE id = $1', [+unitId]); if (!u) bad('Không tìm thấy căn');
  const clean = h => String(h || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/\scontenteditable="[^"]*"/gi, '');
  const names = await q('SELECT code, name FROM kd_template WHERE code = ANY($1)', [docs.map(d => String(d.code || ''))]);
  const safe = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
  const one1 = docs.length === 1 && names.find(n => n.code === docs[0].code);
  const name = `${one1 ? safe(one1.name) : 'Bo_ho_so'}_${u.code}_da-sua.docx`;
  return { buf: docxOf(docs.map(d => clean(d.html)), name), name };
}
// Word: tệp .docx nhúng HTML (altChunk) — Word mở và sửa như văn bản thường
function docxOf(htmls, title) {
  const css = HS_CSS.replace(/section\.hs \+ section\.hs\{[^}]*\}/, '') + ` body,td,p{font-family:"Times New Roman",serif;font-size:13pt} td{mso-line-height-rule:exactly}`;
  // Word không vẽ border của <span>: gạch chân tiêu ngữ đổi sang underline
  const page = h => `<!doctype html><html><head><meta charset="utf-8"><title>${escH(title)}</title><style>${css}</style></head><body>${h.split("border-bottom:1px solid #000;padding-bottom:1px").join("text-decoration:underline")}</body></html>`;
  const CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="htm" ContentType="text/html"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>';
  // font mặc định Times New Roman 13 (HTML nhúng không tự lấy font của trang)
  const STY = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
  const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  // mỗi hồ sơ một khối HTML (altChunk), giữa các hồ sơ là ngắt trang của Word
  const brk = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  // số trang ở giữa lề trên, cỡ 13, không hiện ở trang đầu (NĐ 30/2020)
  const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:t>2</w:t></w:r><w:r><w:rPr><w:sz w:val="26"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>';
  const HDR0 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:hdr>';
  const DOC = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'
    + htmls.map((h, i) => `<w:altChunk r:id="hc${i + 1}"/>`).join(brk)
    + '<w:sectPr><w:headerReference w:type="default" r:id="rHd"/><w:headerReference w:type="first" r:id="rHd0"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1701" w:header="567" w:footer="567" w:gutter="0"/><w:titlePg/></w:sectPr></w:body></w:document>';
  const DREL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + htmls.map((h, i) => `<Relationship Id="hc${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="hs${i + 1}.htm"/>`).join('') + '<Relationship Id="rSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rHd" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rHd0" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/></Relationships>';
  return zip([['[Content_Types].xml', CT], ['_rels/.rels', RELS], ['word/document.xml', DOC], ['word/_rels/document.xml.rels', DREL], ['word/styles.xml', STY], ['word/header1.xml', HDR], ['word/header2.xml', HDR0], ...htmls.map((h, i) => [`word/hs${i + 1}.htm`, page(h)])]);
}
async function wordHs(unitId, codes, user, custId) {
  const { D, docs } = await hsDocs(unitId, codes, user, custId);
  await C.audit({ q }, 'unit', +unitId, 'tai_word_ho_so', null, null, user, docs.map(d => d.t.code).join(', '));
  const safe = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
  const name = docs.length === 1 ? `${safe(docs[0].t.name)}_${D.map.ma_can}.docx` : `Bo_ho_so_${D.map.ma_can}.docx`;
  return { buf: docxOf(docs.map(d => d.html), name), name };
}

// lưu bản Word của bộ hồ sơ vào Kho hồ sơ: gắn vào HĐ của bộ (vay / thanh lý vay → HĐ vay; còn lại → HĐMB, không có thì HĐ khác của căn), loại «Dự thảo»
async function saveTarget(unitId, bo, custId) {
  const cts = (await q("SELECT id, kind, status, customer_id FROM kd_contract WHERE unit_id = $1 ORDER BY (status IN ('huy', 'thanh_ly')), id DESC", [+unitId])).filter(c => !+custId || c.customer_id === +custId);
  const want = ['vay', 'tl_vay'].includes(bo) ? ['vay'] : ['hdmb', 'thue_mua'];
  const c = cts.find(x => want.includes(x.kind)) || cts[0];
  if (c) return { ent: 'contract', id: c.id, kind: 'du_thao', what: 'HĐ' };
  // căn chưa có hợp đồng (đang soạn hồ sơ trước khi ký): gắn vào phiếu đăng ký của căn, chưa có phiếu thì gắn thẳng vào căn hộ (12/11/2026)
  const r = await one(`SELECT id FROM kd_reservation WHERE unit_id = $1 ${+custId ? 'AND customer_id = $2' : ''} ORDER BY (status IN ('huy', 'het_han')), id DESC LIMIT 1`, +custId ? [+unitId, +custId] : [+unitId]);
  if (r) return { ent: 'reservation', id: r.id, kind: 'tai_lieu', what: 'phiếu đăng ký' };
  return { ent: 'unit', id: +unitId, kind: 'tai_lieu', what: 'căn' };
}
// ---- dữ liệu thử cho bộ hồ sơ (CHỈ bản demo / máy thử có HS_DEMO_FILL=1) — dựa trên khách, căn, HĐ đã lưu của căn: chỉ điền chỗ còn trống, tạo thêm thứ còn thiếu ----
const demoFillOn = () => (typeof process !== 'undefined' && (process.platform === 'browser' || process.env?.HS_DEMO_FILL === '1'));
async function demoFill(unitId, user) {
  if (!demoFillOn()) deny('Chỉ dùng trên bản demo');
  const sysU = await one("SELECT * FROM kd_user WHERE role = 'admin' AND active ORDER BY id LIMIT 1") || C.SYS;
  const u = await one('SELECT * FROM kd_unit WHERE id = $1', [+unitId]); if (!u) bad('Không tìm thấy căn');
  const did = [], seed = [...u.code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7), dig = n => String(seed * 7919 % 10 ** n).padStart(n, '0');
  const today = C.today(), addD = n => C.addDays(today, n), tower = u.code.split('-')[1] || 'A', so4 = u.code.slice(-4);
  const setBlank = async (table, id, vals) => {
    const ks = [], r = await one(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    for (const [k, v] of Object.entries(vals)) if (k in r && (r[k] == null || r[k] === '' || r[k] === 0 || r[k] === '0')) { await q(`UPDATE ${table} SET ${k} = $2 WHERE id = $1`, [id, v]); ks.push(k); }
    return ks;
  };
  const cts = await q("SELECT * FROM kd_contract WHERE unit_id = $1 AND status NOT IN ('huy', 'thanh_ly') ORDER BY id", [u.id]);
  let hd = cts.find(c => c.kind === 'hdmb' || c.kind === 'thue_mua');
  const res = await one('SELECT * FROM kd_reservation WHERE unit_id = $1 ORDER BY id DESC LIMIT 1', [u.id]);
  let kid = hd?.customer_id || cts[0]?.customer_id || res?.customer_id;
  if (!kid) {
    kid = (await C.create('customer', { full_name: 'Nguyễn Văn Thử', phone: '09' + dig(8), source: 'truc_tiep' }, sysU, { system: true })).row.id;
    did.push('khách hàng mới «Nguyễn Văn Thử»');
  }
  const k = await one('SELECT * FROM kd_customer WHERE id = $1', [kid]);
  const ck = await setBlank('kd_customer', k.id, { id_no: '0272' + dig(8), id_date: '2021-04-25', id_place: 'Cục Cảnh sát QLHC về TTXH', birth: '1990-06-03',
    address: 'Thôn Ngô Xá, Xã Yên Phong, Tỉnh Bắc Ninh', tax_code: '0272' + dig(8), bank_account: '1903' + dig(10), email: 'khach' + dig(3) + '@example.com', phone: '09' + dig(8) });
  if (ck.length) did.push(`khách ${k.full_name}: điền ${ck.length} thông tin còn trống`);
  const area = +u.area_tt || 60, price = +u.base_price || 15990253, pre = Math.round(price * area / 1000) * 1000;
  if (!hd) {
    hd = (await C.create('contract', { ptype: 'can_ho', kind: 'hdmb', unit_id: u.id, customer_id: kid, contract_on: addD(-30), base_price: price, area_tt: area, value: Math.round(pre * 1.05 / 1000) * 1000 + Math.round(pre * 0.02 / 1000) * 1000 }, sysU, { system: true })).row;
    did.push('HĐ mua bán');
  }
  const hk = await setBlank('kd_contract', hd.id, { number: `${so4}/${today.slice(0, 4)}/HĐMB-${u.code.split('-').slice(0, 2).join('-')}`, contract_on: addD(-30), request_on: addD(-40),
    base_price: price, area_tt: area, area_floor: Math.round(area * 1.07 * 10) / 10, pretax: pre, vat_pct: 5, vat_amt: pre * 0.05, after_tax: Math.round(pre * 1.05 / 1000) * 1000,
    maint_fee: Math.round(pre * 0.02 / 1000) * 1000, b_perm_addr: k.address || 'Thôn Ngô Xá, Xã Yên Phong, Tỉnh Bắc Ninh', co_owner: 'Trần Thị Thử (vợ)',
    agreement: `${so4}/VBTT-SC`, common_area_amt: 10000000 });
  await q('UPDATE kd_contract SET value = after_tax + coalesce(maint_fee, 0) WHERE id = $1 AND (value IS NULL OR value = 0)', [hd.id]);
  hd = await one('SELECT * FROM kd_contract WHERE id = $1', [hd.id]);
  if (hk.length) did.push(`HĐ mua bán ${hd.number}: điền ${hk.length} thông tin còn trống`);
  const sched = async (cid, parts) => {
    if ((await one('SELECT count(*) n FROM kd_installment WHERE contract_id = $1 AND active', [cid])).n > 0) return false;
    for (const [i, [name, amt, due]] of parts.entries()) await q('INSERT INTO kd_installment (contract_id, seq, name, due_on, amount, active) VALUES ($1, $2, $3, $4, $5, true)', [cid, i + 1, name, due, Math.round(amt)]);
    return true;
  };
  const v = +hd.after_tax || +hd.value;
  if (await sched(hd.id, [['Đợt 1 – 30% sau khi ký HĐ', v * 0.3, addD(-25)], ['Đợt 2 – 65% khi bàn giao', v * 0.65, addD(20)], ['Đợt 3 – 5% khi nhận sổ hồng', v * 0.05, addD(200)]])) did.push('lịch thu HĐ mua bán 3 đợt');
  let ht = cts.find(c => c.kind === 'hoan_thien');
  if (!ht) {
    ht = (await C.create('contract', { ptype: 'can_ho', kind: 'hoan_thien', unit_id: u.id, customer_id: kid, contract_on: addD(-30), number: `${so4}/HĐTT/KH-${tower}`, value: +u.finish_value || 120000000 }, sysU, { system: true })).row;
    did.push('HĐ thỏa thuận hoàn thiện');
  }
  if (await sched(ht.id, [['Đợt 1 – 50% gói hoàn thiện', +ht.value * 0.5, addD(-25)], ['Đợt 2 – 50% khi bàn giao', +ht.value * 0.5, addD(20)]])) did.push('lịch thu HĐ thỏa thuận');
  let vay = cts.find(c => c.kind === 'vay');
  if (!vay) {
    vay = (await C.create('contract', { ptype: 'can_ho', kind: 'vay', unit_id: u.id, customer_id: kid, contract_on: addD(-30), loan_recv_on: addD(-29), term_months: 18, int_mode: 'lai_suat', loan_rate: 1,
      number: `${so4}/HĐV/KH-${tower}`, value: Math.round(v * 0.7 / 1e6) * 1e6 }, sysU, { system: true })).row;
    did.push('HĐ vay');
    await q('DELETE FROM kd_installment WHERE contract_id = $1', [vay.id]);   // lịch tự lập khi tạo HĐ vay → thay bằng 4 đợt giải ngân
  }
  const tv = +vay.value;
  if (await sched(vay.id, [['Giải ngân đợt 1', tv * 0.5, addD(-29)], ['Giải ngân đợt 2', tv * 0.25, addD(31)], ['Giải ngân đợt 3', tv * 0.15, addD(91)], ['Giải ngân đợt 4', tv * 0.1, addD(150)]])) did.push('4 đợt giải ngân HĐ vay');
  const rc = async (ct, amt, no) => {
    if (await one("SELECT 1 FROM kd_receipt WHERE contract_id = $1 AND status <> 'huy'", [ct.id])) return false;
    await q("INSERT INTO kd_receipt (voucher_no, voucher_date, contract_id, unit_id, cust_code, cust_name, amount, content, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'hop_le')",
      [no, addD(-24), ct.id, u.id, k.code, k.full_name, Math.round(amt), 'Thu đợt 1 (dữ liệu thử)']);
    return true;
  };
  if (await rc(hd, v * 0.3, `PT-THU-${u.code}`)) did.push('phiếu thu đợt 1 HĐ mua bán');
  if (await rc(ht, +ht.value * 0.5, `PT-THU-HT-${u.code}`)) did.push('phiếu thu đợt 1 HĐ thỏa thuận');
  await C.audit({ q }, 'unit', u.id, 'du_lieu_thu_ho_so', null, null, user, did.join('; ') || 'đã đủ');
  return { did };
}
module.exports = { custHistory, wordFromHtml, demoFill, demoFillOn, saveTarget, BO, MAU_TNS, hsData, hsInfo, printHs, wordHs, merge, evalExpr };
