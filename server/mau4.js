'use strict';
// Mẫu 4 — danh sách đối tượng đăng ký mua NOXH nộp Sở Xây dựng (theo file «1. CTS.xlsx», sheet «Mau 4»).
// Mỗi hồ sơ mua NOXH (GD-02) = một hộ: dòng chủ hộ (lấy từ Khách hàng) + các thành viên khai trong hồ sơ.
// Gồm: dữ liệu bảng tổng hợp, xuất Excel đúng bố cục (tiêu đề 2 tầng, gộp ô theo hộ), nhập lại từ file Mẫu 4,
// in biên bản giao nhận hồ sơ (danh mục giấy tờ + số lượng).
const C = require('./core');
const IO = require('./io');
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

// ---------- biên bản giao nhận hồ sơ ----------
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function printHandover(id, user) {
  const { row: n } = await C.get('noxh_check', id, user, { reveal: true });
  const pii = canSee(user);
  const k = await one('SELECT full_name, phone, id_no, id_date, id_place, address FROM kd_customer WHERE id = $1', [n.customer_id]);
  const u = n.unit_id ? await one('SELECT u.code, p.name project, p.investor FROM kd_unit u JOIN kd_project p ON p.id = u.project_id WHERE u.id = $1', [n.unit_id]) : null;
  const by = await one('SELECT full_name FROM kd_user WHERE id = $1', [n.owner_id || user.id]);
  const items = (n.items || []).filter(x => x.st !== 'thieu');
  const total = items.reduce((a, x) => a + (+x.qty || 0), 0);
  const d = new Date(Date.now() + 7 * 3600e3);
  const DOTS = '……………………';
  const body = `<div class="qh"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b class="tn">Độc lập - Tự do - Hạnh phúc</b></div>
<h2>BIÊN BẢN GIAO NHẬN HỒ SƠ</h2><div class="c"><i>(Hồ sơ đăng ký ${n.reg_kind === 'thue' ? 'thuê' : n.reg_kind === 'thue_mua' ? 'thuê mua' : 'mua'} nhà ở xã hội${u ? ` — ${esc(u.project)}` : ''})</i></div>
<p>Hôm nay, ngày ${pad(d.getUTCDate())} tháng ${pad(d.getUTCMonth() + 1)} năm ${d.getUTCFullYear()}, chúng tôi gồm:</p>
<p class="h">BÊN GIAO HỒ SƠ (Người đăng ký):</p>
<p>Ông (Bà): <b>${esc(k.full_name)}</b></p>
<table class="kv3"><tr><td>Số CCCD: ${pii ? esc(k.id_no) || DOTS : '(ẩn)'}</td><td>Ngày cấp: ${pii && k.id_date ? dmy(k.id_date) : DOTS}</td></tr></table>
<p>Địa chỉ: ${esc(k.address) || DOTS}</p><p>Số điện thoại: ${esc(k.phone)}</p>
${u || n.unit_text ? `<p>Căn hộ đăng ký: <b>${esc(u?.code || n.unit_text)}</b></p>` : ''}
<p class="h">BÊN NHẬN HỒ SƠ:</p>
<p>${esc(u?.investor || 'Công ty CP Cát Tường')}</p><p>Người nhận: <b>${esc(by?.full_name || '')}</b> — Phòng Kinh doanh</p>
<p>Bên giao đã bàn giao cho Bên nhận các hồ sơ, giấy tờ sau:</p>
<table class="b"><tr class="th"><td style="width:10%">STT</td><td>Tên giấy tờ / hồ sơ</td><td style="width:14%">Số lượng (bản)</td><td style="width:26%">Ghi chú</td></tr>
${items.map((x, i) => `<tr><td class="c">${i + 1}</td><td>${esc(x.n)}</td><td class="c">${x.qty ?? ''}</td><td>${esc(x.note)}${x.st === 'can_sua' ? `${x.note ? '; ' : ''}cần bổ sung / sửa` : ''}</td></tr>`).join('')}
<tr><td></td><td><b>Tổng cộng</b></td><td class="c"><b>${total || ''}</b></td><td></td></tr></table>
<p class="j">Bên nhận đã kiểm tra số lượng hồ sơ nêu trên. Việc giao nhận hồ sơ không thay thế kết quả xét duyệt của cơ quan có thẩm quyền. Biên bản được lập thành 02 bản có giá trị như nhau, mỗi bên giữ 01 bản.</p>
<table class="sign"><tr><td><b>BÊN GIAO</b><br><i>(Ký, ghi rõ họ tên)</i><br><br><br><br><b>${esc(k.full_name)}</b></td><td><b>BÊN NHẬN</b><br><i>(Ký, ghi rõ họ tên)</i><br><br><br><br><b>${esc(by?.full_name || '')}</b></td></tr></table>`;
  await C.audit({ q }, 'noxh_check', n.id, 'in_bien_ban_giao_nhan', null, null, user);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Biên bản giao nhận hồ sơ – ${esc(k.full_name)}</title><style>
    @page{size:A4;margin:20mm 15mm 20mm 30mm} body{font:13pt/1.4 "Times New Roman",serif;color:#000;max-width:165mm;margin:auto}
    .qh{text-align:center;font-size:13pt;line-height:1.3} .qh .tn{font-size:14pt;display:inline-block;padding-bottom:2pt;border-bottom:1px solid #000}
    p{margin:3pt 0} h2{text-align:center;font-size:14pt;margin:14pt 0 2pt} .c{text-align:center} .j{text-align:justify} .h{font-weight:bold;margin-top:8pt}
    table{border-collapse:collapse;width:100%;margin:4pt 0} table.b td{border:1px solid #000;padding:3pt 6pt} table.b .th td{font-weight:bold;text-align:center}
    table.kv3{width:auto} table.kv3 td{padding:0 24pt 0 0} tr,table.sign{page-break-inside:avoid} table.sign{margin-top:14pt} table.sign td{width:50%;text-align:center;vertical-align:top}
    ${IO.EDIT_CSS}</style></head><body>${IO.editBar(`Biên bản giao nhận hồ sơ NOXH #${n.id}`)}${IO.editDoc(body)}</body></html>`;
}

module.exports = { data, xlsx, printHandover };
