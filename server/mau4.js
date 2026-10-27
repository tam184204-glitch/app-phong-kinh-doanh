'use strict';
// Mẫu 4 — danh sách đối tượng đăng ký mua NOXH nộp Sở Xây dựng (theo file «1. CTS.xlsx», sheet «Mau 4»).
// Mỗi hồ sơ mua NOXH (GD-02) = một hộ: dòng chủ hộ (lấy từ Khách hàng) + các thành viên khai trong hồ sơ.
// Gồm: dữ liệu bảng tổng hợp, xuất Excel đúng bố cục (tiêu đề 2 tầng, gộp ô theo hộ), nhập lại từ file Mẫu 4,
// in biên bản giao nhận hồ sơ (danh mục giấy tờ + số lượng).
const C = require('./core');
const IO = require('./io');
const B = require('./biz');
const { E, PII_ROLES } = require('./meta');
const { q, one } = require('./db');
const { buildXlsx } = require('./xlsx');
const { bad, deny, dmy } = C;

const canSee = u => u.role === 'admin' || PII_ROLES.includes(u.role);
const s = v => v == null ? '' : String(v).trim();
const pad = n => String(n).padStart(2, '0');
// ngày sinh tách 3 cột như Mẫu 4: chủ hộ lưu kiểu ngày (yyyy-mm-dd), thành viên lưu chữ (dd/mm/yyyy hoặc chỉ năm)
function dmyParts(v) {
  v = s(v); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); if (m) return [+m[3], +m[2], +m[1]];
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v); if (m) return [+m[1], +m[2], +m[3]];
  m = /^(\d{4})$/.exec(v); return m ? ['', '', +m[1]] : ['', '', ''];
}

// ---------- dữ liệu bảng tổng hợp ----------
async function data(user, { project } = {}) {
  if (!canSee(user)) deny('Bảng tổng hợp Mẫu 4 có dữ liệu định danh — chỉ trưởng phòng, lãnh đạo, nhân viên hồ sơ được xem');
  const rows = await q(`SELECT n.id, n.received_on, n.reg_kind, n.old_id_no, n.job, n.doi_tuong, n.confirm_org, n.housing, n.income, n.province, n.district, n.commune, n.members, n.status, n.result, n.unit_text, n.unit_area,
      k.full_name, k.phone, k.phone2, k.birth, k.id_no, u.code unit_code, u.area_tt, p.id project_id, p.code project_code, p.name project
    FROM kd_noxh_check n JOIN kd_customer k ON k.id = n.customer_id LEFT JOIN kd_unit u ON u.id = n.unit_id
      LEFT JOIN kd_project p ON p.id = coalesce(u.project_id, (SELECT x.id FROM kd_project x WHERE upper(x.code) = upper(split_part(n.unit_text, '-', 1)) LIMIT 1))   -- căn ngoài danh mục: dự án theo tiền tố mã căn
    WHERE ($1::int IS NULL OR p.id = $1) ORDER BY n.received_on NULLS LAST, n.id`, [project ? +project : null]);
  return rows.map((r, i) => {
    const head = { name: r.full_name, phone: [r.phone, r.phone2].filter(Boolean).join('/ '), birth: dmyParts(r.birth), old_id_no: r.old_id_no, id_no: r.id_no, job: r.job, doi_tuong: r.doi_tuong, confirm_org: r.confirm_org, relation: 'Chủ hộ' };
    const mem = (r.members || []).map(m => ({ ...m, birth: dmyParts(m.birth) }));
    return { id: r.id, tt: i + 1, received_on: r.received_on, project: r.project, project_id: r.project_id, unit_code: r.unit_code || r.unit_text, area: r.unit_area ?? r.area_tt, reg_kind: r.reg_kind, status: r.status, result: r.result,
      housing: r.housing, province: r.province, district: r.district, commune: r.commune, income: r.income, people: [head, ...mem] };
  });
}

// ---------- xuất Excel đúng bố cục Mẫu 4 ----------
const HEAD = ['TT', 'Ngày nộp hồ sơ', 'Tên dự án', 'Họ và Tên', 'Số điện thoại', 'Ngày sinh', 'Tháng sinh', 'Năm sinh', 'Thông tin cư dân', '', 'Nghề nghiệp', 'Đối tượng chính sách được hưởng nhà ở xã hội',
  'Cơ quan xác nhận về đối tượng', 'Điều kiện nhà ở\n(Mô tả đúng hiện trạng nhà ở được VPĐKĐĐ xác nhận)', 'Nơi ở hiện tại (thường xuyên sinh sống)', '', '', 'Điều kiện thu nhập (mô tả theo đúng nội dung Giấy xác nhận)', 'Quan hệ với chủ hộ', 'Thông tin căn hộ dự kiến mua/thuê mua', ''];
const HEAD2 = ['', '', '', '', '', '', '', '', 'Số CMND', 'Số CCCD', '', '', '', '', 'Tỉnh', 'Huyện/ Thành phố', 'Thị trấn/xã', '', '', 'Số căn hộ', 'Diện tích căn hộ (M2)'];
const WIDTHS = [5, 13, 20, 26, 16, 8, 8, 9, 13, 15, 24, 42, 24, 22, 12, 14, 14, 28, 13, 14, 11];
const L = i => String.fromCharCode(65 + i);
// cột gộp theo hộ (giống file gốc): TT, ngày nộp, dự án, SĐT, nhà ở, nơi ở, thu nhập, căn hộ
const HH_MERGE = [0, 1, 2, 4, 13, 14, 15, 16, 17, 19, 20];
async function xlsx(user, qs) {
  const hs = await data(user, qs);
  const pj = qs.project ? hs[0]?.project || (await one('SELECT name FROM kd_project WHERE id = $1', [+qs.project]))?.name : null;
  const out = [[pj ? `DỰ ÁN: ${pj.toUpperCase()}` : 'DANH SÁCH ĐỐI TƯỢNG ĐĂNG KÝ MUA NHÀ Ở XÃ HỘI'], HEAD, HEAD2];
  const merges = ['A1:U1', 'I2:J2', 'O2:Q2', 'T2:U2', ...HEAD2.map((h, i) => !h && ![8, 9, 14, 15, 16, 19, 20].includes(i) ? `${L(i)}2:${L(i)}3` : null).filter(Boolean)];
  for (const h of hs) {
    const r0 = out.length;
    h.people.forEach((p, j) => out.push([j ? '' : h.tt, j ? '' : dmy(h.received_on), j ? '' : h.project || '', p.name, j ? (p.phone || '') : p.phone, ...p.birth, s(p.old_id_no), s(p.id_no), p.job || '', p.doi_tuong || '', p.confirm_org || '',
      j ? '' : h.housing || '', j ? '' : h.province || '', j ? '' : h.district || '', j ? '' : h.commune || '', j ? '' : h.income || '', p.relation || '', j ? '' : h.unit_code || '', j ? '' : h.area != null ? (+h.area).toFixed(2) : '']));
    // SĐT chỉ gộp khi thành viên không ghi số riêng
    if (h.people.length > 1) for (const c of HH_MERGE) if (c !== 4 || h.people.slice(1).every(p => !p.phone)) merges.push(`${L(c)}${r0 + 1}:${L(c)}${r0 + h.people.length}`);
  }
  await C.audit({ q }, 'noxh_check', null, 'xuat_mau4', null, null, user, `${hs.length} hộ${pj ? ' · ' + pj : ''}`);
  return buildXlsx({ sheet: 'Mau 4', rows: out, widths: WIDTHS, merges, heights: { 0: 28, 1: 32, 2: 48 }, styleOf: ri => ri === 0 ? 5 : ri < 3 ? 4 : 3 });
}

// ---------- nhập từ file Mẫu 4 ----------
const A = IO.A;
const SPEC = { tt: A('tt'), submit_on: A('ngay nop ho so'), project: A('ten du an'), name: A('ho va ten', 'ho ten'), phone: A('so dien thoai'), d: A('ngay sinh'), m: A('thang sinh'), y: A('nam sinh'),
  old_id_no: A('so cmnd'), id_no: A('so cccd'), job: A('nghe nghiep'), doi_tuong: A('doi tuong chinh sach duoc huong nha o xa hoi', 'doi tuong'), confirm_org: A('co quan xac nhan ve doi tuong', 'co quan xac nhan'),
  housing: A('dieu kien nha o'), province: A('tinh'), district: A('huyen thanh pho', 'huyen'), commune: A('thi tran xa', 'xa phuong'), income: A('dieu kien thu nhap'), relation: A('quan he voi chu ho'),
  unit: A('so can ho'), area: A('dien tich can ho m2', 'dien tich') };
const excelDay = v => typeof v === 'number' ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10) : s(v) || null;
const IMPORT = {
  title: 'Hồ sơ mua NOXH — file Mẫu 4', roles: ['truong_phong', 'ho_so'],
  note: 'Dùng file Mẫu 4 nộp Sở Xây dựng (sheet «Mau 4»): mỗi hộ một dòng «Chủ hộ» + các dòng thành viên ngay dưới. Chủ hộ khớp khách hàng theo số CCCD (chưa có thì tự tạo khách); căn hộ khớp theo «Số căn hộ». Hộ đã có hồ sơ thì cập nhật thông tin, hồ sơ đang trình / đã duyệt thì bỏ qua.',
  template: () => buildXlsx({ sheet: 'Mau 4', rows: [['DỰ ÁN: …'], HEAD, HEAD2, ['', '', '', 'Nguyễn Văn A', '0912345678', 1, 2, 1990, '', '001090012345', 'Lao động tự do', 'Người thu nhập thấp tại khu vực đô thị', 'Công an xã …', 'Chưa có nhà ở thuộc sở hữu của hộ gia đình', 'Bắc Ninh', '', 'Yên Trung', 'Có thu nhập bình quân hàng tháng thực nhận không quá 25 triệu đồng', 'Chủ hộ', 'CTS-K-0211', '70.00'],
    ['', '', '', 'Trần Thị B', '', 3, 4, 1992, '', '001192012345', 'Lao động tự do', 'Người thu nhập thấp tại khu vực đô thị', 'Công an xã …', '', '', '', '', '', 'Vợ (Chồng)', '', '']],
    widths: WIDTHS, merges: ['A1:U1', 'I2:J2', 'O2:Q2', 'T2:U2'], styleOf: ri => ri === 0 ? 5 : ri < 3 ? 4 : 3 }),
  parse(sheets) {
    const sh = sheets.find(x => /mau 4/.test(IO.strip(x.name))) || sheets[0], rows = sh.rows;
    const h = rows.findIndex(r => (r || []).some(c => IO.strip(c) === 'ho va ten'));
    if (h < 0) bad('Không thấy dòng tiêu đề «Họ và Tên» — dùng đúng file Mẫu 4');
    const head = (rows[h] || []).map((c, j) => s(rows[h + 1]?.[j]) || c);   // tiêu đề 2 tầng: ưu tiên tầng dưới (Số CMND, Tỉnh, Số căn hộ…)
    const m = IO.mapRows([head, ...rows.slice(h + 2)], SPEC);
    const out = []; let cur = null;
    for (const r of m.rows) {
      r._line += h + 1;          // về số dòng thật trong Excel
      if (!s(r.name)) continue;
      const rel = IO.strip(r.relation);
      if (!cur || rel === 'chu ho' || (!rel && (s(r.unit) || s(r.tt)))) { cur = { ...r, _members: [] }; out.push(cur); } else cur._members.push(r);
    }
    return { rows: out, cols: m.cols };
  },
  async row(r, ctx) {
    const db = ctx.db, id_no = s(r.id_no), phones = s(r.phone).split(/[/,;]/).map(x => x.replace(/\s/g, '')).filter(Boolean);
    const birth = r.y && r.d && r.m ? `${r.y}-${pad(r.m)}-${pad(r.d)}` : null;
    const unitCode = s(r.unit).toUpperCase().replace(/\s+/g, '');
    const unit = unitCode ? await db.one('SELECT id FROM kd_unit WHERE upper(code) = $1', [unitCode]) : null;   // căn chưa có trong danh mục → giữ mã + diện tích theo file
    let k = id_no ? await db.one('SELECT id, birth FROM kd_customer WHERE id_no = $1 ORDER BY id LIMIT 1', [id_no]) : null;
    if (!k && phones[0]) k = await db.one('SELECT id, birth FROM kd_customer WHERE phone = $1 AND full_name = $2 ORDER BY id LIMIT 1', [phones[0], s(r.name)]);
    if (!k) {
      if (!phones[0]) bad(`Chủ hộ «${s(r.name)}» chưa có số điện thoại`);
      k = (await C.create('customer', { full_name: s(r.name), phone: phones[0], phone2: phones[1], id_no: id_no || null, birth, address: [r.commune, r.district, r.province].map(s).filter(Boolean).join(', ') || null,
        source: 'truc_tiep', owner_id: ctx.user.id, note: `Nhập từ ${ctx.fileName}` }, ctx.user, { db, demo: ctx.demo })).row;
    } else if (birth && !k.birth) await C.update('customer', k.id, { birth }, ctx.user, { db, system: true, action: 'nhap_excel' });
    const members = r._members.map(x => ({ name: s(x.name), relation: s(x.relation) || 'Vợ (Chồng)', birth: x.y ? (x.d && x.m ? `${pad(x.d)}/${pad(x.m)}/${x.y}` : String(x.y)) : '',
      old_id_no: s(x.old_id_no), id_no: s(x.id_no), phone: s(x.phone), job: s(x.job), doi_tuong: s(x.doi_tuong), confirm_org: s(x.confirm_org) }));
    const area = s(r.area) ? +s(r.area).replace(',', '.') : null;
    const rec = { customer_id: k.id, unit_id: unit?.id ?? null, unit_text: unit ? null : unitCode || null, unit_area: unit ? null : area, old_id_no: s(r.old_id_no) || null, job: s(r.job) || null, doi_tuong: s(r.doi_tuong) || null, confirm_org: s(r.confirm_org) || null,
      housing: s(r.housing) || null, province: s(r.province) || null, district: s(r.district) || null, commune: s(r.commune) || null, income: s(r.income) || null, members };
    if (r.submit_on) rec.received_on = excelDay(r.submit_on);
    const old = await db.one('SELECT id, status FROM kd_noxh_check WHERE customer_id = $1 ORDER BY id DESC LIMIT 1', [k.id]);
    if (old && E.noxh_check.lock.includes(old.status)) return 'trung';
    if (old) { await C.update('noxh_check', old.id, rec, ctx.user, { db, system: true, action: 'nhap_excel' }); return 'cap_nhat'; }
    await C.create('noxh_check', { ...rec, reg_kind: 'mua', received_on: rec.received_on || C.today() }, ctx.user, { db, demo: ctx.demo });
    return 'them';
  },
};
IO.IMPORTS.mau4 = IMPORT;

// ---------- biên bản bàn giao tài liệu hồ sơ mua nhà ----------
// theo mẫu giấy của phòng Kinh doanh: in từ phiếu đăng ký (GD-01) hoặc hồ sơ mua NOXH (GD-02). Nội dung là mẫu «Biên bản giao nhận hồ sơ»
// ở Quản trị › Mẫu biểu — mỗi công ty một mẫu (Cát Tường, Thống Nhất…), phạm vi = mã dự án; bấm In chọn mẫu, mẫu hợp dự án được chọn sẵn.
// danh mục giấy tờ + số lượng lấy ở hồ sơ NOXH của phiếu, chưa lập hồ sơ thì in danh mục mặc định để điền tay
const BB_KIND = 'bien_ban_giao_nhan';
const bbBody = cty => `<table class="hd"><tr><td><b>${cty.name.toUpperCase()}</b></td><td><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b class="tn">Độc lập - Tự do - Hạnh phúc</b><br><i>${cty.place}, ngày {dd} tháng {mm} năm {yyyy}</i></td></tr></table>
<h2>BIÊN BẢN BÀN GIAO TÀI LIỆU</h2>
<h3>HỒ SƠ MUA NHÀ DỰ ÁN {du_an_hoa}</h3>
<p><b>Bên giao:</b></p>
<table class="kv"><tr><td>Họ và tên:</td><td>{ten_kh}</td><td class="r">SĐT: {dien_thoai}</td></tr>
<tr><td>MST CN:</td><td colspan="2">{mst}</td></tr>
<tr><td>TK Ngân hàng:</td><td colspan="2">{tai_khoan}</td></tr>
<tr><td>Mã căn hộ:</td><td colspan="2">{ma_can}</td></tr></table>
<p><b>Bên Nhận: ${cty.name}</b></p>
<p>Người đại diện: {nguoi_dai_dien}</p>
<p>Địa chỉ: ${cty.addr}</p>
<p>Chi tiết tài liệu bàn giao:</p>
{bang_tai_lieu}
<table class="sign"><tr><td><b>BÊN GIAO</b></td><td><b>BÊN NHẬN</b></td></tr></table>`;
const DOT = '……………………………';
const MAU_BIEN_BAN = () => [
  { code: 'BBGN-CT', kind: BB_KIND, name: 'Biên bản giao nhận hồ sơ — Công ty CP Cát Tường', scope: '',
    content: bbBody({ name: 'Công ty cổ phần Cát Tường', addr: 'Tầng 3 tòa CTN, đường Lý Thái Tổ, Phường Tiền Ninh Vệ, TP Bắc Ninh, Tỉnh Bắc Ninh', place: 'Bắc Ninh' }) },
  // tên pháp nhân / địa chỉ bên Thống Nhất chưa có trong dữ liệu → để trống cho phòng Kinh doanh điền ở Quản trị › Mẫu biểu
  { code: 'BBGN-TN', kind: BB_KIND, name: 'Biên bản giao nhận hồ sơ — Thống Nhất', scope: 'TNS,TN',
    content: bbBody({ name: `Công ty ${DOT} Thống Nhất`, addr: DOT + DOT, place: 'Bắc Ninh' }) },
];
async function handoverTemplates(qs) {
  const unitId = qs.reservation ? (await one('SELECT unit_id FROM kd_reservation WHERE id = $1', [+qs.reservation]))?.unit_id
    : qs.noxh ? (await one('SELECT unit_id FROM kd_noxh_check WHERE id = $1', [+qs.noxh]))?.unit_id : null;
  const all = await q('SELECT code, name FROM kd_template WHERE active AND kind = $1 ORDER BY id', [BB_KIND]);
  const fit = (await IO.regTemplates(BB_KIND, unitId)).map(t => t.code);
  return all.map(t => ({ ...t, fit: t.code === fit[0] }));
}
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function printHandover(kind, id, user, tplCode) {
  if (!['reservation', 'noxh'].includes(kind)) bad('Loại bản in không hợp lệ');
  let r = null, n = null;
  if (kind === 'reservation') {
    r = (await C.get('reservation', id, user, { reveal: true })).row;
    const nid = (await one('SELECT id FROM kd_noxh_check WHERE reservation_id = $1 OR (reservation_id IS NULL AND customer_id = $2) ORDER BY (reservation_id = $1) DESC NULLS LAST, id DESC LIMIT 1', [r.id, r.customer_id]))?.id;
    if (nid) n = (await C.get('noxh_check', nid, user, { reveal: true })).row;
  } else {
    n = (await C.get('noxh_check', id, user, { reveal: true })).row;
    if (n.reservation_id) r = (await C.get('reservation', n.reservation_id, user, { reveal: true })).row;
  }
  const pii = canSee(user), hide = v => pii ? v : (v ? '(ẩn)' : '');
  const k = await one('SELECT full_name, phone, tax_code, bank_account FROM kd_customer WHERE id = $1', [r?.customer_id || n?.customer_id]) || {};
  const unitId = r?.unit_id || n?.unit_id;
  const u = unitId ? await one('SELECT u.code, p.name project FROM kd_unit u JOIN kd_project p ON p.id = u.project_id WHERE u.id = $1', [unitId]) : null;
  const pj = u?.project || (n?.unit_text ? (await one("SELECT name FROM kd_project WHERE upper(code) = upper(split_part($1, '-', 1))", [n.unit_text]))?.name : null);
  const tpl = tplCode ? await one('SELECT * FROM kd_template WHERE active AND kind = $1 AND code = $2', [BB_KIND, tplCode]) : (await IO.regTemplates(BB_KIND, unitId))[0];
  const content = tpl?.content || MAU_BIEN_BAN()[0].content;
  const by = await one('SELECT full_name FROM kd_user WHERE id = $1', [n?.owner_id || user.id]);
  const items = n ? (n.items || []).filter(x => x.st !== 'thieu') : await B.defaultList({ q, one }, 'checklist_noxh', '_all');
  const day = String(n?.received_on || C.today()).slice(0, 10).split('-');
  const map = { dd: day[2], mm: day[1], yyyy: day[0], du_an_hoa: pj ? (/nhà ở xã hội/i.test(pj) ? pj : 'Nhà ở xã hội ' + pj).toUpperCase() : DOT,
    ten_kh: r?.cust_name || k.full_name, dien_thoai: r?.phone || k.phone, mst: hide(r?.tax_code || k.tax_code), tai_khoan: hide(r?.bank_account || k.bank_account), ma_can: u?.code || n?.unit_text, nguoi_dai_dien: by?.full_name };
  const bang = `<table class="b"><tr class="th"><td style="width:9%">STT</td><td>Nội dung</td><td style="width:16%">SỐ LƯỢNG</td><td style="width:27%">GHI CHÚ</td></tr>
${items.map((x, i) => `<tr><td class="c">${i + 1}</td><td>${esc(x.n)}</td><td class="c">${x.qty ?? ''}</td><td>${esc(x.note)}</td></tr>`).join('')}</table>`;
  // trường trộn: giá trị được thoát HTML, ô trống in dấu chấm để điền tay; {bang_tai_lieu} chèn nguyên bảng
  const body = content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\{(\w+)\}/g, (m, x) => x === 'bang_tai_lieu' ? bang : x in map ? (map[x] ? esc(map[x]) : DOT) : m);
  await C.audit({ q }, n ? 'noxh_check' : 'reservation', n?.id || r.id, 'in_bien_ban_giao_nhan', null, null, user, tpl?.code);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Biên bản bàn giao tài liệu – ${esc(map.ten_kh)}</title><style>
    @page{size:A4;margin:20mm 15mm 20mm 25mm} body{font:13pt/1.4 "Times New Roman",serif;color:#000;max-width:170mm;margin:auto}
    p{margin:4pt 0} h2{text-align:center;font-size:15pt;margin:16pt 0 2pt} h3{text-align:center;font-size:13.5pt;margin:0 0 10pt} .c{text-align:center} .r{text-align:right}
    table{border-collapse:collapse;width:100%;margin:4pt 0} table.hd td{vertical-align:top;text-align:center;width:42%;font-size:12pt} table.hd td:first-child{white-space:nowrap} table.hd td+td{width:58%} table.hd .tn{display:inline-block;padding-bottom:1pt;border-bottom:1px solid #000}
    table.kv td{padding:2pt 0;vertical-align:top} table.kv td:first-child{width:24%} table.b td{border:1px solid #000;padding:5pt 6pt;vertical-align:middle} table.b .th td{font-weight:bold;text-align:center}
    tr,table.sign{page-break-inside:avoid} table.sign{margin-top:6pt} table.sign td{width:50%;text-align:center;vertical-align:top;height:90pt}
    ${IO.EDIT_CSS}</style></head><body>${IO.editBar(`Bản in từ mẫu «${esc(tpl?.name || 'Biên bản giao nhận hồ sơ')}»${n ? ` · hồ sơ NOXH #${n.id}` : ' · chưa lập hồ sơ NOXH — danh mục mặc định, số lượng điền tay'}`)}${IO.editDoc(body)}</body></html>`;
}

module.exports = { data, xlsx, printHandover, handoverTemplates, MAU_BIEN_BAN };
