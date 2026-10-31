// Nạp dữ liệu.
//   node server/seed.js               → dữ liệu gốc THẬT (giữ khi vận hành): tài khoản, 8 dự án, tòa O (CTS) + G (TNS),
//                                        147 căn theo bảng hàng công khai 10/09/2026 (CHÍNH SÁCH MUA HÀNG T9), chính sách giá, mẫu biểu.
//   node server/seed.js --demo        → thêm GIAO DỊCH THỬ (đánh dấu is_demo) để chạy thử đủ quy trình.
//   node server/seed.js --clear-demo  → xóa toàn bộ dữ liệu thử, tính lại trạng thái từng căn — dùng trước khi vận hành thật.
// Giao dịch thử được tạo qua đúng các bước nghiệp vụ (trình → duyệt → ký → thu tiền Bravo…), nên cũng là một bài kiểm tra luật.
const fs = require('fs');
const path = require('path');
const { q, one, tx, pool } = require('./db');
const { migrate } = require('./schema');
const C = require('./core');
const B = require('./biz');
const IO = require('./io');
const { MAU_DANG_KY, MAU_CU } = require('./mau-dang-ky');

const SEED = path.join(__dirname, '..', 'data', 'seed');
const FILES = path.join(__dirname, '..', 'data', 'files');
const num = s => s == null || s === '' ? null : +String(s).replace(/\./g, '').replace(',', '.');

// ======================= DỮ LIỆU GỐC =======================
const USERS = [
  // tài khoản người thật (đã có trong hệ thống QLDA của Tập đoàn) — bắt buộc đổi mật khẩu lần đầu
  { username: 'datmm', full_name: 'Mai Minh Đạt', role: 'admin', title: 'Trưởng ban Chuyển đổi số', dept: 'Ban Chuyển đổi số' },
  { username: 'dungpt', full_name: 'Phạm Tiến Dũng', role: 'lanh_dao', title: 'Chủ tịch Tập đoàn', dept: 'Chủ tịch, Ban Giám đốc' },
  // tài khoản thử theo vai trò — ngừng trước khi vận hành (Quản trị › Tài khoản)
  { username: 'thu.lanhdao', full_name: 'Người dùng thử – Lãnh đạo', role: 'lanh_dao', title: 'Tài khoản thử — ngừng trước vận hành', trial: 1 },
  { username: 'thu.truongphong', full_name: 'Người dùng thử – Trưởng phòng KD', role: 'truong_phong', title: 'Tài khoản thử — ngừng trước vận hành', trial: 1 },
  { username: 'thu.banhang', full_name: 'Người dùng thử – Bán hàng 1', role: 'ban_hang', title: 'Tài khoản thử — ngừng trước vận hành', trial: 1 },
  { username: 'thu.banhang2', full_name: 'Người dùng thử – Bán hàng 2', role: 'ban_hang', title: 'Tài khoản thử — ngừng trước vận hành', trial: 1 },
  { username: 'thu.congno', full_name: 'Người dùng thử – Công nợ', role: 'cong_no', title: 'Tài khoản thử — ngừng trước vận hành', trial: 1 },
  { username: 'thu.hoso', full_name: 'Người dùng thử – Quản lý hồ sơ', role: 'ho_so', title: 'Tài khoản thử — ngừng trước vận hành', trial: 1 },
  { username: 'thu.cskh', full_name: 'Người dùng thử – CSKH', role: 'cskh', title: 'Tài khoản thử — ngừng trước vận hành', trial: 1 },
  { username: 'thu.ketoan', full_name: 'Người dùng thử – Kế toán', role: 'ke_toan', title: 'Tài khoản thử — ngừng trước vận hành', trial: 1 },
  { username: 'thu.quantri', full_name: 'Người dùng thử – Quản trị', role: 'admin', title: 'Tài khoản thử — ngừng trước vận hành', trial: 1 },
];
const PROJECT_MAP = { 'CT-SMART': ['CTS', 'hon_hop'], 'TNS-SMART': ['TNS', 'hon_hop'], 'CT-TNT': ['TNT', 'noxh'], 'CT-ECO': ['ECO', 'noxh'], 'CT-TN': ['TN', 'noxh'], 'CT-NEW': ['CTN', 'thuong_mai'], 'DHP': ['DHP', 'hon_hop'], 'VDL-CT': ['VDL', 'hon_hop'] };
const TEMPLATES = [
  { code: 'MAU-HDMB-01', name: 'Khung hợp đồng mua bán căn hộ', kind: 'hop_dong', content: `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập – Tự do – Hạnh phúc

HỢP ĐỒNG MUA BÁN CĂN HỘ
Số: {so_hd}

(Khung trộn dữ liệu — Pháp chế thay nội dung điều khoản bằng mẫu hợp đồng chính thức đang áp dụng.)

BÊN BÁN (Chủ đầu tư): {chu_dau_tu}
BÊN MUA: {ten_kh}
Số CCCD: {cccd}   cấp ngày {ngay_cap}   tại {noi_cap}
Địa chỉ liên hệ: {dia_chi}   Điện thoại: {dien_thoai}
Đồng sở hữu: {dong_so_huu}

ĐIỀU 1. CĂN HỘ MUA BÁN
Căn hộ số {ma_can}, tầng {tang}, tòa {toa}, dự án {du_an} ({dia_diem}).
Diện tích sử dụng (thông thủy): {dien_tich} m². Hướng: {huong}.

ĐIỀU 2. GIÁ BÁN
Tổng giá trị hợp đồng: {gia_tri} đồng (Bằng chữ: {gia_tri_chu}).

ĐIỀU 3. TIẾN ĐỘ THANH TOÁN
{lich_thanh_toan}

Ngày {ngay}

ĐẠI DIỆN BÊN BÁN                                   BÊN MUA` },
  { code: 'MAU-TB-NO', name: 'Thông báo nhắc thanh toán', kind: 'thong_bao', content: 'Kính gửi Quý khách {ten_kh},\nCăn hộ {ma_can} hiện còn khoản thanh toán {cong_no} đồng đã đến hạn. Kính đề nghị Quý khách thanh toán theo tiến độ hợp đồng. Trân trọng!' },
  { code: 'MAU-BBBG', name: 'Biên bản bàn giao căn hộ (khung)', kind: 'bien_ban', content: 'BIÊN BẢN BÀN GIAO CĂN HỘ {ma_can}\nBên nhận: {ten_kh}\nHợp đồng số: {so_hd}\n(Khung — thay bằng mẫu biên bản đang áp dụng.)' },
  ...REG_TEMPLATES(),
];
// mẫu in từ phiếu đăng ký căn hộ (GD-01) — Trưởng phòng sửa / thêm mẫu ở Quản trị › Mẫu biểu
function REG_TEMPLATES() {
  const head = `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập – Tự do – Hạnh phúc
`;
  const kh = `Họ và tên: {ten_kh}
Số CCCD: {cccd}   cấp ngày {ngay_cap}   tại {noi_cap}
Địa chỉ: {dia_chi}
Điện thoại: {dien_thoai}`;
  const can = `Dự án: {du_an} — {dia_diem}
Mã căn hộ: {ma_can}   Tòa: {toa}   Tầng: {tang}
Diện tích thông thủy: {dien_tich} m²   Hướng: {huong}`;
  return [
    { code: 'MAU-DKCH-01', name: 'Phiếu đăng ký mua căn hộ', kind: 'dang_ky_can', content: `${head}
PHIẾU ĐĂNG KÝ MUA CĂN HỘ
Số phiếu: {ma_phieu}   Ngày đăng ký: {ngay_dk}

Kính gửi: {chu_dau_tu}

I. THÔNG TIN KHÁCH HÀNG ĐĂNG KÝ
${kh}

II. CĂN HỘ ĐĂNG KÝ MUA
${can}
Tổng giá bán căn hộ: {gia_tri} đồng (Bằng chữ: {gia_tri_chu}).
Số tiền đặt cọc / giữ chỗ: {tien_coc} đồng.

III. CAM KẾT
Tôi đã được tư vấn đầy đủ thông tin về dự án, căn hộ và chính sách bán hàng; cam kết các thông tin kê khai trên là đúng sự thật và thực hiện thủ tục ký Hợp đồng mua bán theo hướng dẫn của Chủ đầu tư.
Ghi chú: {ghi_chu}

Ngày {ngay}

NHÂN VIÊN KINH DOANH                                   KHÁCH HÀNG ĐĂNG KÝ
(Ký, ghi rõ họ tên)                                   (Ký, ghi rõ họ tên)` },
    { code: 'MAU-DKCH-02', name: 'Phiếu xác nhận giữ chỗ căn hộ', kind: 'dang_ky_can', content: `${head}
PHIẾU XÁC NHẬN GIỮ CHỖ CĂN HỘ
Số phiếu: {ma_phieu}

Bên giữ chỗ:
${kh}

Căn hộ được giữ chỗ:
${can}
Giá bán căn hộ (tạm tính): {gia_tri} đồng (Bằng chữ: {gia_tri_chu}).
Tiền giữ chỗ đã nộp: {tien_coc} đồng.
Trạng thái: {trang_thai} — Tiến trình: {tien_trinh}

Việc giữ chỗ không thay thế Hợp đồng mua bán. Xử lý tiền giữ chỗ khi hủy đăng ký theo chính sách bán hàng hiện hành.

Ngày {ngay}

ĐẠI DIỆN PHÒNG KINH DOANH                                   KHÁCH HÀNG
(Ký, ghi rõ họ tên)                                   (Ký, ghi rõ họ tên)` },
    { code: 'MAU-DKNT-01', name: 'Phiếu đăng ký gói nội thất – hoàn thiện', kind: 'dang_ky_noi_that', content: `${head}
PHIẾU ĐĂNG KÝ NỘI THẤT CĂN HỘ
Kèm phiếu đăng ký mua căn hộ số: {ma_phieu}

I. KHÁCH HÀNG
${kh}

II. CĂN HỘ
${can}

III. GÓI NỘI THẤT / HOÀN THIỆN ĐĂNG KÝ
Gói: {goi_hoan_thien}
Giá trị hoàn thiện: {gia_tri_hoan_thien} đồng (Bằng chữ: {gia_tri_hoan_thien_chu}).
Danh mục nội thất, thiết bị:
{danh_muc_noi_that}

Khách hàng đề nghị thay đổi (nếu có): ......................................................................
..............................................................................................................

Ngày {ngay}

NHÂN VIÊN KINH DOANH                                   KHÁCH HÀNG ĐĂNG KÝ
(Ký, ghi rõ họ tên)                                   (Ký, ghi rõ họ tên)` },
  ];
}
// khi khởi động: thêm mẫu mặc định còn thiếu (không đè mẫu đã sửa) + bổ sung dữ liệu phiếu cũ
async function ensureTemplates() {
  await tx(async db => {
    const sysU = await db.one("SELECT * FROM kd_user WHERE role = 'admin' ORDER BY id LIMIT 1") || C.SYS;
    for (const t of REG_TEMPLATES()) if (!await db.one('SELECT 1 FROM kd_template WHERE code = $1', [t.code])) await C.create('template', { ...t, active: true }, sysU, { db, system: true });
    // mẫu chuẩn theo file Excel phòng Kinh doanh: lần đầu nạp thì tắt các mẫu khung cũ
    let moi = 0;
    for (const t of require('./mau-mo-ban').MAU_MO_BAN()) if (!await db.one('SELECT 1 FROM kd_template WHERE code = $1', [t.code])) await C.create('template', { ...t, active: true }, sysU, { db, system: true });
    for (const t of require('./mau4').MAU_BIEN_BAN()) if (!await db.one('SELECT 1 FROM kd_template WHERE code = $1', [t.code])) await C.create('template', { ...t, active: true }, sysU, { db, system: true });
    for (const [code, cu, moi2] of require('./mau4').BB_CU()) await db.q('UPDATE kd_template SET content = replace(content, $1, $2) WHERE code = $3 AND strpos(content, $1) > 0', [cu, moi2, code]);
    for (const t of MAU_DANG_KY()) {
      if (await db.one('SELECT 1 FROM kd_template WHERE code = $1', [t.code])) continue;
      if (t.kind === 'dang_ky_noi_that' && await db.one('SELECT 1 FROM kd_template WHERE kind = $1 AND name = $2', [t.kind, t.name])) continue;   // đã tự tạo mẫu cùng tên
      await C.create('template', { ...t, active: true }, sysU, { db, system: true }); moi++;
    }
    if (moi) await db.q('UPDATE kd_template SET active = false WHERE code = ANY($1)', [MAU_CU]);
    // nội thất chỉ giữ một mẫu «Đơn đăng ký G (NT) – hoàn thiện căn hộ»: tắt 2 mẫu tách theo 2 / 3 phòng ngủ
    await db.q('UPDATE kd_template SET active = false WHERE active AND code = ANY($1)', [require('./mau-dang-ky').NT_CU]);
    // mẫu đã nạp trước 27/10: đổi quốc hiệu «o0o» sang thể thức NĐ 30 + tách «Nơi cấp» xuống dòng (chỉ thay đúng đoạn cũ, giữ phần đã sửa tay)
    // mẫu G (NT) nạp trước 27/10 ghi cứng giá gói → đổi sang trường trộn (giá theo Danh mục sản phẩm)
    for (const [code, gia] of Object.entries(require('./mau-dang-ky').NT_GIA)) {
      const a = `<b>${gia.toLocaleString('vi-VN')}</b>`, w = `<i>${require('./io').moneyWords(gia)}</i>`;
      await db.q('UPDATE kd_template SET content = replace(replace(content, $1, $2), $3, $4) WHERE code = $5 AND strpos(content, $1) > 0', [a, '<b>{gia_tri_hoan_thien}</b>', w, '<i>{gia_tri_hoan_thien_chu}</i>', code]);
    }
    const qhCu = '<div class="c"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b>Độc lập – Tự do – Hạnh phúc</b><br>-------o0o------</div>';
    const qhMoi = '<div class="qh"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b class="tn">Độc lập - Tự do - Hạnh phúc</b></div>';
    const cccdCu = '<td>Ngày cấp: {ngay_cap}</td><td>Nơi cấp: {noi_cap}</td></tr></table>', cccdMoi = '<td>Ngày cấp: {ngay_cap}</td></tr></table>\n<p>Nơi cấp: {noi_cap}</p>';
    await db.q('UPDATE kd_template SET content = replace(replace(content, $1, $2), $3, $4) WHERE strpos(content, $1) > 0 OR strpos(content, $3) > 0', [qhCu, qhMoi, cccdCu, cccdMoi]);
    // danh mục giấy tờ NOXH theo mẫu biên bản bàn giao (có số lượng): đổi danh mục mặc định cũ + hồ sơ chưa đụng tới danh mục
    const { checklist_noxh_cu: ckCu, checklist_noxh: ckMoi } = require('./meta').SETTINGS;
    if (JSON.stringify((await db.one("SELECT value FROM kd_setting WHERE key = 'checklist_noxh'"))?.value) === JSON.stringify(ckCu))
      await db.q("UPDATE kd_setting SET value = $1 WHERE key = 'checklist_noxh'", [JSON.stringify(ckMoi)]);
    const itemsMoi = JSON.stringify(ckMoi._all.map(s => ({ ...B.ckItem(s), st: '', note: '', on: null })));
    for (const n of await db.q('SELECT id, items FROM kd_noxh_check'))
      if (Array.isArray(n.items) && n.items.length === ckCu._all.length && n.items.every((x, i) => x.n === ckCu._all[i] && !x.st && !x.note && x.qty == null))
        await db.q('UPDATE kd_noxh_check SET items = $1 WHERE id = $2', [itemsMoi, n.id]);
    // hợp đồng có trước khi chia 2 loại: phân loại theo loại căn
    await db.q("UPDATE kd_contract c SET ptype = CASE WHEN u.kind IN ('lien_ke','shophouse') THEN 'lien_ke' ELSE 'can_ho' END FROM kd_unit u WHERE u.id = c.unit_id AND c.ptype IS NULL");
    await db.q("UPDATE kd_cancel_req SET wait_days = 30 WHERE wait_days IS NULL");
    await db.q("UPDATE kd_reservation SET reg_at = coalesce(created_at, reg_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') WHERE reg_at IS NULL");
    // phiếu lập trước khi có mẫu «Phiếu đăng ký căn hộ»: chép thông tin khách + suy ra trạng thái căn / tiến trình
    await db.q(`UPDATE kd_reservation r SET cust_name = k.full_name, id_no = k.id_no, id_date = k.id_date, id_place = k.id_place, address = k.address, phone = k.phone
      FROM kd_customer k WHERE k.id = r.customer_id AND r.cust_name IS NULL`);
    await db.q('UPDATE kd_reservation r SET cust_code = k.code FROM kd_customer k WHERE k.id = r.customer_id AND r.cust_code IS NULL');
    await db.q(`UPDATE kd_reservation r SET reg_state = CASE WHEN r.status IN ('huy','het_han','tu_choi') THEN 'huy'
      WHEN EXISTS (SELECT 1 FROM kd_contract c WHERE c.reservation_id = r.id AND c.status = 'da_ky') THEN 'ky_hdmb' ELSE 'giu_cho' END WHERE r.reg_state IS NULL`);
    await db.q(`UPDATE kd_reservation r SET progress = CASE WHEN r.reg_state = 'ky_hdmb' THEN 'da_ky'
      WHEN r.status = 'chuyen_hd' OR EXISTS (SELECT 1 FROM kd_noxh_check n WHERE n.reservation_id = r.id AND n.status = 'da_duyet') THEN 'du_dk'
      WHEN EXISTS (SELECT 1 FROM kd_noxh_check n WHERE n.reservation_id = r.id AND n.status = 'cho_duyet') THEN 'cho_xet_duyet' ELSE 'tiep_nhan' END WHERE r.progress IS NULL`);
  });
}

async function seedBase() {
  await tx(async db => {
    await migrate(db);
    let admin = await db.one("SELECT id, username, full_name, role FROM kd_user WHERE role = 'admin' ORDER BY id LIMIT 1");
    for (const u of USERS) {
      if (await db.one('SELECT 1 FROM kd_user WHERE lower(username) = $1', [u.username])) continue;
      const r = await IO.createUser(db, u, admin || C.SYS, { trial: u.trial });
      if (u.trial) await db.q('UPDATE kd_user SET must_change = false WHERE id = $1', [r.id]);   // tài khoản thử vào dùng ngay
      if (!admin && u.role === 'admin') admin = r;
    }
    const sysU = { ...admin, sys: true };
    // dự án (trang công khai cattuonggroup.ai.vn/api/public/du-an)
    const DA = JSON.parse(fs.readFileSync(path.join(SEED, 'du-an.json'), 'utf8')).data;
    for (const p of DA) {
      const [code, kind] = PROJECT_MAP[p.ma] || [p.ma, 'hon_hop'];
      if (await db.one('SELECT 1 FROM kd_project WHERE upper(code) = $1', [code])) continue;
      await C.create('project', { code, name: p.ten, kind, address: p.viTri, investor: 'Cát Tường Group', note: [p.loaiHinh, p.quyMo, p.trangThai, p.giaHienThi].filter(Boolean).join(' · ') }, sysU, { db, system: true });
    }
    // bảng hàng 10/09/2026
    const BH = JSON.parse(fs.readFileSync(path.join(SEED, 'bang-hang-cts-tns-2026-09-10.json'), 'utf8')).data;
    const src = `Bảng hàng ${BH.capNhat.split('-').reverse().join('/')} — ${BH.fileNguon}`;
    for (const t of BH.toa) {
      const pj = await db.one('SELECT id FROM kd_project WHERE code = $1', [t.maDuAn]);
      let b = await db.one('SELECT id FROM kd_building WHERE project_id = $1 AND code = $2', [pj.id, t.maToa]);
      if (!b) b = (await C.create('building', { project_id: pj.id, code: t.maToa, name: t.tenToa, kind: 'chung_cu', units_total: t.soCan, note: `Nguồn: ${src}` }, sysU, { db, system: true })).row;
      for (const x of t.canHo) {
        if (await db.one('SELECT 1 FROM kd_unit WHERE project_id = $1 AND code = $2', [pj.id, x.maCan])) continue;
        const nb = parseInt(x.soPhongNgu) || null;
        const u = (await C.create('unit', {
          project_id: pj.id, building_id: b.id, code: x.maCan, floor: parseInt(x.maCan.slice(-4, -2)), kind: nb ? `${nb}pn` : '2pn', bedrooms: nb, area_tt: num(x.dienTich),
          direction: x.huong || null, position: x.viTri === 'góc' ? 'goc' : x.viTri === 'thang' ? 'thang' : x.viTri === 'thường' ? 'thuong' : null,
          list_price: num(x.donGia), price_net: num(x.giaCanHoSauThue), maint_fee: num(x.phiBaoTri), total_price: num(x.tongGiaCanHo), handover_plan: x.thoiGianDuKienBanGiao, data_src: src,
        }, sysU, { db, system: true })).row;
        if (/mở bán/i.test(x.tinhTrangMoBan)) { await C.sys(db, 'unit', u.id, { activated: true }, sysU, 'kich_hoat', 'Đang mở bán theo bảng hàng'); await B.recomputeUnit(db, u.id, sysU); }
      }
      if (!await db.one('SELECT 1 FROM kd_price_policy WHERE $1 = ANY(project_ids)', [pj.id]))
        await C.create('price_policy', { code: `CSBH-T9-2026-${t.maDuAn}`, version: 1, project_ids: [pj.id], unit_group: '*', mode: 'bang_hang', start_on: BH.capNhat, end_on: '2026-12-31', status: 'phat_hanh',
          src_file: BH.fileNguon, target: 'Khách hàng mua căn hộ', discount: 'Theo chính sách mua hàng T9/2026', pay_method: 'Theo tiến độ hợp đồng',
          bank_policy: 'Ngày kết thúc hiệu lực 31/12/2026 là giả định — Trưởng phòng xác nhận lại theo văn bản chính sách' }, sysU, { db, system: true });
      await db.q('UPDATE kd_project SET units_total = (SELECT count(*) FROM kd_unit WHERE project_id = $1) WHERE id = $1', [pj.id]);
    }
    for (const t of TEMPLATES) if (!await db.one('SELECT 1 FROM kd_template WHERE code = $1', [t.code])) await C.create('template', { ...t, active: true }, sysU, { db, system: true });
  });
  const s = await one("SELECT (SELECT count(*) FROM kd_user) u, (SELECT count(*) FROM kd_project) p, (SELECT count(*) FROM kd_building) b, (SELECT count(*) FROM kd_unit) n, (SELECT count(*) FROM kd_unit WHERE status = 'con_ban') con_ban");
  return s;
}

// ======================= GIAO DỊCH THỬ =======================
const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý', 'Phan', 'Trịnh', 'Đinh'];
const DEM_NAM = ['Văn', 'Đức', 'Minh', 'Quang', 'Hữu', 'Tiến', 'Xuân', 'Ngọc'], DEM_NU = ['Thị', 'Thu', 'Thanh', 'Ngọc', 'Phương', 'Thùy'];
const TEN_NAM = ['Hùng', 'Dũng', 'Tuấn', 'Hải', 'Long', 'Nam', 'Sơn', 'Thắng', 'Việt', 'Khánh', 'Phong', 'Trung', 'Hiếu', 'Cường', 'Đạt'];
const TEN_NU = ['Hương', 'Lan', 'Mai', 'Hằng', 'Trang', 'Linh', 'Thảo', 'Ngân', 'Hà', 'Yến', 'Nhung', 'Huyền', 'Oanh', 'Quỳnh'];
const XA = ['Yên Phong', 'Tam Đa', 'Yên Trung', 'Thụy Hòa', 'Võ Cường', 'Ninh Xá', 'Kinh Bắc', 'Từ Sơn', 'Tiên Du', 'Quế Võ', 'Đông Ngàn', 'Vân Dương'];
let seedN = 7;
const rnd = () => { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; };
const pick = a => a[Math.floor(rnd() * a.length)];
const T = C.today();
const D = n => C.addDays(T, n);
const at = (d, h = 9) => `${d}T${String(h).padStart(2, '0')}:00:00+07:00`;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 70>>stream\nBT /F1 16 Tf 60 780 Td (BAN SCAN THU - DU LIEU MAU, KHONG CO GIA TRI) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

async function demoFile(db, ent, recId, kind, name, user) {
  const dir = path.join(FILES, ent, String(recId)); fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${Date.now()}-demo-${name}`); fs.writeFileSync(p, PDF);
  await db.q('INSERT INTO kd_file (ent, rec_id, kind, name, mime, size, path, uploaded_by, is_demo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)', [ent, recId, kind, name, 'application/pdf', PDF.length, path.relative(FILES, p), user.id]);
}

async function loadDemo() {
  if ((await one('SELECT count(*) n FROM kd_customer WHERE is_demo')).n) return { skipped: 'Đã có dữ liệu thử — xóa trước khi nạp lại' };
  const U = Object.fromEntries((await q('SELECT id, username, full_name, role FROM kd_user')).map(u => [u.username, u]));
  const need = ['thu.truongphong', 'thu.banhang', 'thu.banhang2', 'thu.congno', 'thu.hoso', 'thu.cskh', 'thu.ketoan'];
  for (const k of need) if (!U[k]) throw new Error('Thiếu tài khoản thử ' + k + ' — chạy node server/seed.js trước');
  const tp = U['thu.truongphong'], bh1 = U['thu.banhang'], bh2 = U['thu.banhang2'], cn = U['thu.congno'], hs = U['thu.hoso'], cs = U['thu.cskh'], kt = U['thu.ketoan'];
  const pj = Object.fromEntries((await q('SELECT id, code FROM kd_project')).map(p => [p.code, p.id]));
  const units = await q("SELECT u.*, b.code bcode FROM kd_unit u JOIN kd_building b ON b.id = u.building_id WHERE u.status = 'con_ban' ORDER BY u.code");
  const G = units.filter(u => u.bcode === 'G'), O = units.filter(u => u.bcode === 'O');
  if (G.length < 70 || O.length < 30) throw new Error('Không đủ căn còn bán để nạp dữ liệu thử');
  const O_ = { demo: true };
  const stats = {};
  const inc = k => { stats[k] = (stats[k] || 0) + 1; };
  let voucher = 1;

  await tx(async db => {
    const o = (x = {}) => ({ db, demo: true, ...x });
    // --- đối tác & hoa hồng ---
    const ag1 = (await C.create('agent', { code: 'DL-THU-01', name: 'Sàn giao dịch BĐS Kinh Bắc (thử)', kind: 'san', representative: 'Nguyễn Văn Sàn', phone: '0390000901', contract_no: 'HTPP-01/2026', from_on: '2026-01-01', to_on: '2026-12-31' }, tp, o())).row;
    const ag2 = (await C.create('agent', { code: 'CTV-THU-01', name: 'CTV Trần Thị Giới Thiệu (thử)', kind: 'ctv', phone: '0390000902', from_on: '2026-01-01', to_on: '2026-12-31' }, tp, o())).row;
    const pol = (await C.create('commission_policy', { code: 'CSHH-THU-2026', name: 'Hoa hồng phân phối 2026 (thử)', rate: 1.5, fixed: 0, pay_pct: 30, condition: 'Khách ký HĐMB và thanh toán ≥ 30%', from_on: '2025-01-01', to_on: '2026-12-31' }, tp, o())).row;
    const pol2 = (await C.create('commission_policy', { code: 'CSHH-CTV-2026', name: 'Thưởng giới thiệu CTV (thử)', rate: 0, fixed: 10000000, pay_pct: 20, condition: 'Khách ký HĐMB', from_on: '2025-01-01', to_on: '2026-12-31' }, tp, o())).row;
    await C.create('agent_alloc', { agent_id: ag1.id, project_id: pj.TNS, units: 'G', qty: 30, from_on: '2025-01-01', to_on: '2026-12-31', policy_id: pol.id }, tp, o());
    await C.create('agent_alloc', { agent_id: ag1.id, project_id: pj.CTS, units: 'O', qty: 15, from_on: '2026-01-01', to_on: '2026-12-31', policy_id: pol.id }, tp, o());
    await C.create('agent_alloc', { agent_id: ag2.id, project_id: pj.CTS, units: 'O', qty: 5, from_on: '2026-01-01', to_on: '2026-12-31', policy_id: pol2.id }, tp, o());
    await C.create('package', { code: 'GHT-CB', name: 'Gói hoàn thiện cơ bản (thử)', project_id: pj.CTS, value: 85000000, items: 'Sàn gỗ phòng ngủ, tủ bếp trên dưới, thiết bị vệ sinh, điều hòa 2 phòng' }, tp, o());

    // --- khách hàng ---
    let ci = 0;
    const mkCustomer = async (by, x = {}) => {
      ci++; const nu = rnd() < 0.45;
      const name = `${pick(HO)} ${pick(nu ? DEM_NU : DEM_NAM)} ${pick(nu ? TEN_NU : TEN_NAM)}`;
      const r = (await C.create('customer', { full_name: name, phone: `039${String(1000000 + ci * 7919 % 8999999).padStart(7, '0')}`, email: rnd() < 0.4 ? `khachthu${ci}@example.com` : null,
        id_no: `999${String(100000000 + ci * 104729 % 899999999)}`, id_date: `20${String(15 + ci % 9).padStart(2, '0')}-0${1 + ci % 9}-1${ci % 9}`, id_place: 'Cục Cảnh sát QLHC về TTXH', birth: `19${70 + ci % 28}-0${1 + ci % 9}-2${ci % 8}`,
        address: `${pick(XA)}, Bắc Ninh`, source: x.source || pick(['truc_tiep', 'truc_tiep', 'website', 'marketing', 'gioi_thieu', 'hotline']), agent_id: x.agent_id, interest_project: x.project || pj.CTS,
        need: x.need || pick(['Căn 2PN cho gia đình trẻ', 'Căn 3PN, ưu tiên tầng trung', 'Mua để ở, cần vay ngân hàng 70%', 'Căn góc, hướng Đông Nam']), budget: x.budget || pick([1.0e9, 1.2e9, 1.5e9, 1.8e9]),
        owner_id: by.id, stage: x.stage || 'moi', note: 'Dữ liệu thử' }, by, o({ at: x.at }))).row;
      inc('Khách hàng'); return r;
    };
    // --- 1 giao dịch trọn vẹn: giữ chỗ → duyệt → cọc → HĐ → lịch → rà soát → ký → thu ---
    const sale = async ({ unit, by, regDate, signDate, schedule, paidSeqs = [], partial, agent, number, stopAt }) => {
      const cust = await mkCustomer(by, { source: agent ? (agent.kind === 'ctv' ? 'ctv' : 'dai_ly') : undefined, agent_id: agent?.id, project: unit.project_id, at: at(regDate) });
      const res = (await C.create('reservation', { customer_id: cust.id, unit_id: unit.id, reg_date: regDate, hold_until: at(C.addDays(regDate, 3), 17), source: agent ? (agent.kind === 'ctv' ? 'ctv' : 'dai_ly') : 'truc_tiep', agent_id: agent?.id, owner_id: by.id }, by, o({ system: true, at: at(regDate) }))).row;
      await C.submit('reservation', res.id, by, { db, demo: true });
      await C.approve('reservation', res.id, tp, { ok: true, db });
      if (stopAt === 'giu_cho') return { cust, res };
      await C.act('reservation', res.id, 'deposit', by, { deposit: 50000000, deposit_on: C.addDays(regDate, 1) }, { db, demo: true });
      if (stopAt === 'da_coc') return { cust, res };
      const r2 = await C.act('reservation', res.id, 'to_contract', by, { kind: 'hdmb', number, plan_sign: signDate }, { db, demo: true });
      const cid = r2.open[1];
      const c = await C.raw(db, 'contract', cid);
      const rows = schedule.map(([name, pct, due]) => ({ name, pct, due_on: due }));
      await C.act('contract', cid, 'schedule', hs, { rows }, { db, demo: true });
      if (stopAt === 'du_thao') return { cust, res, c };
      await C.submit('contract', cid, hs, { db, demo: true });
      if (stopAt === 'cho_duyet') return { cust, res, c };
      await C.approve('contract', cid, tp, { ok: true, db });
      await db.q("UPDATE kd_contract SET sign_place = 'Văn phòng bán hàng dự án', signed_on = $1 WHERE id = $2", [signDate > T ? T : signDate, cid]);
      if (stopAt === 'cho_ky') return { cust, res, c };
      await demoFile(db, 'contract', cid, 'ban_ky', `${number.replace(/\W+/g, '_')}_ban_ky.pdf`, hs);
      inc('Hợp đồng đã ký');
      // thu tiền (Bravo): cọc được trừ vào đợt 1
      const inst = await db.q('SELECT * FROM kd_installment WHERE contract_id = $1 AND active ORDER BY seq', [cid]);
      for (const i of inst) {
        if (!paidSeqs.includes(i.seq)) continue;
        const amt = partial && i.seq === paidSeqs[paidSeqs.length - 1] ? Math.round(i.amount * partial / 1e6) * 1e6 : i.amount;
        const vd = i.due_on > T ? C.addDays(T, -1) : C.addDays(i.due_on, Math.floor(rnd() * 6) - 2);
        await C.create('receipt', { voucher_no: `PT-THU-${String(voucher++).padStart(5, '0')}`, voucher_date: vd > T ? T : vd, contract_id: cid, amount: amt, content: `Thu tiền ${i.name} căn ${unit.code}`, installment_id: i.id, src: 'bravo', synced_at: at(T, 7) }, kt, o({ system: true }));
        inc('Chứng từ thu');
      }
      return { cust, res, c: await C.raw(db, 'contract', cid) };
    };

    // ===== TNS tòa G — bàn giao dự kiến 10/2026: đợt 3 (25%) đến hạn khi bàn giao =====
    const tnsSched = s => [['Đợt 1 – ký HĐMB', 30, s], ['Đợt 2 – theo tiến độ xây dựng', 40, C.addDays(s, 150)], ['Đợt 3 – nhận bàn giao căn hộ', 25, '2026-10-10'], ['Đợt 4 – nhận Giấy chứng nhận', 5, '2027-06-30']];
    const tnsDeals = [];
    for (let i = 0; i < 62; i++) {
      const u = G[i]; const sign = C.addDays('2025-03-10', i * 5 + Math.floor(rnd() * 4));
      const grp = i < 24 ? 'A' : i < 50 ? 'B' : 'C';
      const paid = grp === 'A' ? [1, 2, 3] : grp === 'B' ? [1, 2] : [1, 2];
      const deal = await sale({ unit: u, by: i % 2 ? bh2 : bh1, regDate: C.addDays(sign, -7), signDate: sign, schedule: tnsSched(sign), paidSeqs: paid, partial: grp === 'C' ? 0.5 + rnd() * 0.3 : null,
        agent: i % 5 === 0 ? ag1 : null, number: `HĐMB-${u.code}/${sign.slice(0, 4)}` });
      tnsDeals.push({ ...deal, unit: u, grp });
    }
    // ===== CTS tòa O — bàn giao dự kiến 3/2028, 5 đợt =====
    const ctsSched = s => [['Đợt 1 – ký HĐMB', 20, s], ['Đợt 2', 20, C.addDays(s, 60)], ['Đợt 3', 20, C.addDays(s, 120)], ['Đợt 4 – bàn giao', 35, '2028-03-15'], ['Đợt 5 – nhận GCN', 5, '2028-12-31']];
    const ctsDeals = [];
    for (let i = 0; i < 16; i++) {
      const u = O[i]; const sign = C.addDays('2026-06-05', i * 8);
      const due2 = C.addDays(sign, 60), due3 = C.addDays(sign, 120);
      const paid = [1, ...(due2 < D(-5) && i % 4 !== 1 ? [2] : []), ...(due3 < D(-5) && i % 3 === 0 ? [3] : [])];
      const agent = i % 4 === 0 ? ag1 : i === 5 ? ag2 : null;
      ctsDeals.push({ ...(await sale({ unit: u, by: i % 2 ? bh1 : bh2, regDate: C.addDays(sign, -6), signDate: sign, schedule: ctsSched(sign), paidSeqs: paid, agent, number: `HĐMB-${u.code}/2026` })), unit: u });
    }
    // giao dịch đang chạy ở CTS
    const pipe = [
      { stopAt: 'cho_ky', sign: D(2) }, { stopAt: 'cho_ky', sign: D(-2) }, { stopAt: 'cho_duyet', sign: D(-3) }, { stopAt: 'du_thao', sign: D(7) },
      { stopAt: 'da_coc', sign: D(10) }, { stopAt: 'da_coc', sign: D(12) }, { stopAt: 'giu_cho', sign: D(14) }, { stopAt: 'giu_cho', sign: D(14) },
    ];
    for (const [k, p] of pipe.entries()) {
      const u = O[16 + k];
      const reg = p.stopAt === 'giu_cho' ? T : D(-4 - k);
      const r = await sale({ unit: u, by: k % 2 ? bh1 : bh2, regDate: reg, signDate: p.sign, schedule: ctsSched(p.sign), number: `HĐMB-${u.code}/2026`, stopAt: p.stopAt, agent: k === 4 ? ag1 : null });
      if (p.stopAt === 'giu_cho') await C.sys(db, 'reservation', r.res.id, { hold_until: at(D(k === 7 ? 0 : 2), k === 7 ? 23 : 17) }, tp, 'tt:extend', 'Dữ liệu thử');
      inc('Giao dịch đang xử lý');
    }
    // phiếu giữ chỗ quá hạn (cần xử lý) + phiếu chờ duyệt + phiếu nháp
    { const c = await mkCustomer(bh1, { stage: 'quan_tam_cao' }); const r = (await C.create('reservation', { customer_id: c.id, unit_id: O[24].id, reg_date: D(-5), hold_until: at(D(-1), 17), source: 'truc_tiep', owner_id: bh1.id }, bh1, o({ system: true }))).row;
      await C.submit('reservation', r.id, bh1, { db, demo: true }); await C.approve('reservation', r.id, tp, { ok: true, db }); await C.sys(db, 'reservation', r.id, { status: 'qua_han' }, null, 'qua_han_giu_cho');
      await C.create('cancel_req', { kind: 'huy', reservation_id: r.id, reason: 'Khách không thu xếp được tài chính, xin hủy giữ chỗ', money_plan: 'khac', money_note: 'Không phát sinh tiền' }, bh1, o());
      inc('Giữ chỗ quá hạn'); }
    { const c = await mkCustomer(bh2, { stage: 'quan_tam_cao' }); const r = (await C.create('reservation', { customer_id: c.id, unit_id: O[25].id, reg_date: T, hold_until: at(D(3), 17), source: 'dai_ly', agent_id: ag1.id, owner_id: bh2.id }, bh2, o({ system: true }))).row;
      await C.submit('reservation', r.id, bh2, { db, demo: true }); inc('Giữ chỗ chờ duyệt'); }
    { const c = await mkCustomer(bh1); await C.create('reservation', { customer_id: c.id, unit_id: O[26].id, reg_date: T, hold_until: at(D(2), 17), source: 'truc_tiep', owner_id: bh1.id }, bh1, o({ system: true })); }
    // khách tiềm năng + nhật ký tư vấn
    const leads = [];
    for (let i = 0; i < 22; i++) leads.push(await mkCustomer(i % 2 ? bh1 : bh2, { stage: pick(['moi', 'dang_cham_soc', 'hen_tham_quan', 'quan_tam_cao', 'khong_nhu_cau']), project: rnd() < 0.7 ? pj.CTS : pj.TNS }));
    const allCust = [...leads, ...tnsDeals.slice(0, 10).map(d => d.cust), ...ctsDeals.map(d => d.cust)];
    for (let i = 0; i < 70; i++) {
      const c = allCust[i % allCust.length], dd = D(-Math.floor(rnd() * 40));
      const owner = await C.raw(db, 'customer', c.id);
      await C.create('contact_log', { customer_id: c.id, at: at(dd, 8 + i % 9), channel: pick(['goi_dien', 'zalo', 'zalo', 'truc_tiep', 'sms']), content: pick(['Tư vấn bảng giá tòa O, gửi mặt bằng căn', 'Khách hỏi tiến độ thanh toán và hỗ trợ vay', 'Hẹn khách tham quan nhà mẫu cuối tuần', 'Khách hỏi lịch ký hợp đồng', 'Gửi chính sách T9 qua Zalo', 'Khách hỏi thời gian bàn giao tòa G']),
        result: pick(['da_lien_he', 'da_lien_he', 'quan_tam', 'hen_lai', 'chua_lien_he']), next_at: i % 4 === 0 ? D(-(i % 3)) : i % 4 === 1 ? D(3 + i % 5) : null, owner_id: owner.owner_id }, U[owner.owner_id === bh1.id ? 'thu.banhang' : 'thu.banhang2'], o());
      inc('Nhật ký tư vấn');
    }
    // hồ sơ NOXH (checklist)
    const ck = (await C.setting('checklist_noxh', db))._all.map(s => B.ckItem(s).n);
    const mkNoxh = async (d, sts, extra = {}) => (await C.create('noxh_check', { reservation_id: d.res.id, grp: 'cong_nhan', items: ck.map((n, i) => ({ n, st: sts[i] ?? 'da_nhan', note: '' })), received_on: D(-10), doi_tuong: 'Người lao động đang làm việc tại các doanh nghiệp trong và ngoài khu công nghiệp', confirm_org: 'Công ty TNHH Samsung Display Việt Nam',
      housing: 'Chưa có nhà ở thuộc sở hữu của hộ gia đình', income: 'Có thu nhập bình quân hàng tháng thực nhận không quá 25 triệu đồng', province: 'Bắc Ninh', commune: 'Yên Trung', job: 'Người lao động làm việc tại doanh nghiệp', ...extra }, hs, o())).row;
    { const n = await mkNoxh(ctsDeals[14], []); await C.act('noxh_check', n.id, 'review', hs, { step: 'kiem_tra_1', conclusion: 'dat', note: 'Đủ giấy tờ' }, { db, demo: true }); await C.submit('noxh_check', n.id, hs, { db, demo: true }); await C.approve('noxh_check', n.id, tp, { ok: true, db }); }
    { const n = await mkNoxh(ctsDeals[15], []); await C.act('noxh_check', n.id, 'review', hs, { step: 'kiem_tra_1', conclusion: 'dat' }, { db, demo: true }); await C.submit('noxh_check', n.id, hs, { db, demo: true }); }
    await mkNoxh({ res: (await db.one("SELECT id FROM kd_reservation WHERE status = 'da_coc' AND is_demo ORDER BY id LIMIT 1")) }, ['da_nhan', 'da_nhan', 'thieu', 'da_nhan', 'can_sua', 'da_nhan', 'da_nhan'], { supplement_note: 'Thiếu giấy xác nhận đối tượng; giấy xác nhận thu nhập cần đóng dấu lại', supplement_due: D(-2) });
    await mkNoxh({ res: (await db.one("SELECT id FROM kd_reservation WHERE status = 'da_coc' AND is_demo ORDER BY id DESC LIMIT 1")) }, ['da_nhan', 'da_nhan', 'da_nhan', '', '', '', '']);
    inc('Hồ sơ NOXH'); inc('Hồ sơ NOXH'); inc('Hồ sơ NOXH'); inc('Hồ sơ NOXH');

    // ===== điều chỉnh hợp đồng =====
    { // phụ lục có hiệu lực: giãn đợt 2 thành 2 phần cho 1 khách nhóm C
      const d = tnsDeals[52], c = d.c, s = c.signed_on;
      const sched = [['Đợt 1 – ký HĐMB', 30, s], ['Đợt 2a – theo tiến độ', 20, C.addDays(s, 150)], ['Đợt 2b – giãn theo phụ lục', 20, D(20)], ['Đợt 3 – nhận bàn giao căn hộ', 25, '2026-11-30'], ['Đợt 4 – nhận Giấy chứng nhận', 5, '2027-06-30']]
        .map(([name, pct, due_on]) => ({ name, pct, due_on }));
      const ch = (await C.create('contract_change', { contract_id: c.id, kind: 'tien_do', content: 'Giãn 50% đợt 2 sang tháng 11/2026, lùi đợt 3 tới 30/11/2026', reason: 'Khách đề nghị do chờ giải ngân khoản vay', new_schedule: sched, approver_id: tp.id }, cn, o())).row;
      await demoFile(db, 'contract_change', ch.id, 'don_de_nghi', 'don_de_nghi_gian_tien_do.pdf', cn);
      await C.submit('contract_change', ch.id, cn, { db, demo: true }); await C.approve('contract_change', ch.id, tp, { ok: true, db });
      await demoFile(db, 'contract_change', ch.id, 'phu_luc', 'phu_luc_01_da_ky.pdf', hs);
      await C.act('contract_change', ch.id, 'appendix', hs, { appendix_no: `PL01/${c.number}`, appendix_on: D(-8) }, { db, demo: true });
      inc('Phụ lục hiệu lực');
    }
    { // đề nghị đang chờ duyệt
      const c = tnsDeals[55].c;
      const ch = (await C.create('contract_change', { contract_id: c.id, kind: 'khach_hang', content: 'Bổ sung đồng sở hữu là vợ: Nguyễn Thị Thử', reason: 'Khách đăng ký kết hôn sau khi ký HĐ', approver_id: tp.id }, hs, o())).row;
      await demoFile(db, 'contract_change', ch.id, 'don_de_nghi', 'don_bo_sung_dong_so_huu.pdf', hs);
      await C.submit('contract_change', ch.id, hs, { db, demo: true }); inc('Điều chỉnh chờ duyệt');
    }
    // đề xuất đối trừ chờ duyệt
    await C.create('refund', { kind: 'doi_tru', contract_id: tnsDeals[3].c.id, to_contract_id: null, amount: 5000000, reason: 'Đối trừ tiền phí bảo trì nộp thừa vào đợt 4' }, cn, o())
      .then(async r => { await demoFile(db, 'refund', r.row.id, 'chung_tu', 'giay_de_nghi_doi_tru.pdf', cn); await C.submit('refund', r.row.id, cn, { db, demo: true }); });

    // ===== nhắc nợ / cam kết =====
    for (const [i, d] of tnsDeals.filter(x => x.grp !== 'A').entries()) {
      const c = d.c, dd = D(-(3 + i % 12));
      const kept = i % 3 === 0, broken = i % 3 === 1;
      const promise = i % 3 !== 2 ? { promise_amount: Math.round(c.value * 0.25 / 1e6) * 1e6, promise_on: kept || broken ? D(-1 - i % 4) : D(2 + i % 10) } : {};
      await C.create('debt_call', { contract_id: c.id, at: at(dd, 10), contact_person: 'Chủ hợp đồng', result: i % 7 === 3 ? 'khong_nghe' : 'da_trao_doi', content: i % 7 === 3 ? 'Gọi 2 lần không nghe máy' : 'Nhắc thanh toán đợt 3 trước khi nhận bàn giao', ...(i % 7 === 3 ? {} : promise), next_on: D(i % 5 - 1), owner_id: cn.id }, cn, o());
      if (kept && promise.promise_on) {
        const inst = await db.one('SELECT * FROM kd_installment WHERE contract_id = $1 AND active AND seq = 3', [c.id]);
        await C.create('receipt', { voucher_no: `PT-THU-${String(voucher++).padStart(5, '0')}`, voucher_date: promise.promise_on, contract_id: c.id, amount: promise.promise_amount, content: `Thu tiền đợt 3 căn ${d.unit.code}`, installment_id: inst?.id, src: 'bravo', synced_at: at(T, 7) }, kt, o({ system: true }));
        inc('Chứng từ thu');
      }
      inc('Nhật ký nhắc nợ');
    }

    // ===== bàn giao TNS-G (nhóm A đủ điều kiện thanh toán) =====
    const bgDocs = (await C.setting('checklist_ban_giao', db)).map(n => ({ n, st: '', note: '' }));
    const A = tnsDeals.filter(x => x.grp === 'A');
    for (const [i, d] of A.entries()) {
      if (i >= 18) break;   // 6 căn còn lại: đủ điều kiện, chưa lập kế hoạch → cảnh báo
      const h = (await C.create('handover', { unit_id: d.unit.id, cond_tech: true, owner_id: cs.id, docs: bgDocs }, cs, o())).row;
      if (h.status !== 'du_dk') throw new Error(`Căn ${d.unit.code} chưa đủ điều kiện bàn giao (${h.cond_contract}/${h.cond_pay})`);
      if (i < 4) continue;                                       // đủ ĐK, chưa mời
      await C.act('handover', h.id, 'invite', cs, { plan_at: at(i < 8 ? D(i - 5) : D(-20 + i), 9 + i % 6) }, { db, demo: true }).catch(async e => { if (/đã qua/.test(e.message)) { await C.sys(db, 'handover', h.id, { plan_at: at(D(-15 + i), 9), status: 'da_moi' }, cs, 'tt:invite'); } else throw e; });
      if (i < 6) continue;                                       // đã mời, chờ khách xác nhận
      await C.act('handover', h.id, 'confirm', cs, {}, { db, demo: true });
      if (i < 9) continue;                                       // đã hẹn
      const docs = bgDocs.map(x => ({ ...x, st: i < 13 && /hoàn tất/.test(x.n) ? '' : 'da_nhan' }));
      await C.update('handover', h.id, { docs }, cs, { db });
      await C.act('handover', h.id, 'handed', cs, { actual_on: D(-14 + (i - 9)) }, { db, demo: true });
      if (i < 13) {                                              // đã bàn giao, còn tồn tại
        for (const [k, cat] of ['cua', 'tu_bep', 've_sinh'].slice(0, 1 + i % 3).entries()) {
          const df = (await C.create('defect', { unit_id: d.unit.id, category: cat, descr: pick(['Cánh tủ bếp lệch, bản lề kêu', 'Cửa ban công khó đóng', 'Vòi lavabo rò nước', 'Ổ cắm phòng ngủ không có điện']), contractor: pick(['Nhà thầu hoàn thiện A (thử)', 'Đội kỹ thuật tòa nhà']), due_on: k ? D(5) : D(-3) }, cs, o())).row;
          await demoFile(db, 'defect', df.id, 'truoc', `anh_hien_trang_${df.id}.pdf`, cs);
          if (k === 0 && i % 2) await C.act('defect', df.id, 'assign', cs, {}, { db, demo: true });
          inc('Tồn tại');
        }
        continue;
      }
      const df = (await C.create('defect', { unit_id: d.unit.id, category: 'tuong', descr: 'Vết nứt chân chim tường phòng khách', contractor: 'Nhà thầu hoàn thiện A (thử)', due_on: D(-6) }, cs, o())).row;
      await C.act('defect', df.id, 'assign', cs, {}, { db, demo: true });
      await C.act('defect', df.id, 'fixed', cs, { result: 'Đã xử lý bả, sơn lại' }, { db, demo: true });
      await C.update('defect', df.id, { customer_ok: true }, cs, { db });
      await C.act('defect', df.id, 'accept', cs, {}, { db, demo: true });
      await C.act('handover', h.id, 'finish', cs, {}, { db, demo: true });
      inc('Bàn giao hoàn tất');
    }
    // ===== cấp sổ hồng (căn đã bàn giao hoàn tất) =====
    const sh = (await C.setting('checklist_so_hong', db));
    const done = await db.q("SELECT h.unit_id FROM kd_handover h WHERE h.status = 'hoan_tat' AND h.is_demo ORDER BY h.id");
    for (const [i, h] of done.entries()) {
      const items = sh.map((n, k) => ({ n, st: i === 0 ? (k < 3 ? 'da_nhan' : '') : i === 1 ? (k === 4 ? 'thieu' : 'da_nhan') : 'da_nhan', note: '' }));
      const p = (await C.create('pinkbook', { unit_id: h.unit_id, items, supplement_note: i === 1 ? 'Thiếu CCCD đồng sở hữu' : null, supplement_due: i === 1 ? D(-1) : null, owner_id: hs.id }, hs, o())).row;
      if (i >= 2) await C.act('pinkbook', p.id, 'submit_gov', hs, { submit_on: D(-30 + i), agency: 'Văn phòng Đăng ký đất đai tỉnh Bắc Ninh', file_no: `HS-THU-${1000 + i}`, appoint_on: D(i === 2 ? -2 : 10) }, { db, demo: true });
      inc('Hồ sơ sổ hồng');
    }

    // ===== CSKH =====
    const tk = [
      ['khieu_nai', 'khan', 'Khách phản ánh chậm bàn giao so với thông báo, đề nghị giải thích', -2, 'moi'],
      ['bao_hanh', 'cao', 'Thấm nước trần nhà vệ sinh sau mưa', -4, 'dang_xu_ly'],
      ['phan_anh', 'thuong', 'Thang máy tòa G dừng đột ngột giờ cao điểm', -6, 'da_phan_hoi'],
      ['yeu_cau', 'thuong', 'Xin bản sao hợp đồng và lịch thanh toán', -10, 'da_dong'],
      ['khieu_nai', 'cao', 'Không đồng ý số tiền phí bảo trì trên thông báo', -1, 'cho_duyet'],
      ['bao_hanh', 'thuong', 'Bình nóng lạnh không hoạt động', -3, 'dang_xu_ly'],
    ];
    for (const [i, [kind, pr, content, ago, st]] of tk.entries()) {
      const d = A[i];
      const t = (await C.create('ticket', { customer_id: d.cust.id, unit_id: d.unit.id, at: at(D(ago), 9 + i), channel: pick(['goi_dien', 'zalo', 'truc_tiep']), kind, content, priority: pr, dept: kind === 'bao_hanh' ? 'ky_thuat' : 'cskh', assignee_id: cs.id }, cs, o())).row;
      if (st === 'moi') continue;
      await C.act('ticket', t.id, 'start', cs, {}, { db, demo: true });
      if (st === 'dang_xu_ly') continue;
      if (st === 'cho_duyet') { await C.update('ticket', t.id, { solution: 'Giải trình cách tính phí bảo trì 2% theo giá bán trước thuế; đề xuất gặp trực tiếp khách' }, cs, { db }); await C.submit('ticket', t.id, cs, { db, demo: true }); continue; }
      await C.act('ticket', t.id, 'reply', cs, { result: 'Đã kiểm tra và phản hồi khách qua điện thoại' }, { db, demo: true });
      if (st === 'da_dong') await C.act('ticket', t.id, 'close', cs, { rating: '4', rating_note: 'Xử lý nhanh' }, { db, demo: true });
      inc('Phiếu CSKH');
    }
    // thông báo
    const nt = (await C.create('notice', { kind: 'thu_tien', title: 'Nhắc thanh toán đợt 3 – nhận bàn giao tòa G', content: 'Kính gửi Quý khách {ten_kh}, căn {ma_can} còn {cong_no} đồng đã quá hạn. Kính đề nghị Quý khách thanh toán để nhận bàn giao.', target: 'qua_han', project_id: pj.TNS, channel: 'zalo' }, cn, o())).row;
    await C.act('notice', nt.id, 'send', cn, {}, { db, demo: true });
    await C.create('notice', { kind: 'ban_giao', title: 'Mời nhận bàn giao căn hộ tòa G', content: 'Kính mời Quý khách {ten_kh} nhận bàn giao căn {ma_can}.', target: 'du_dk_bg', project_id: pj.TNS, channel: 'zalo' }, cs, o());

    // ===== chỉ tiêu =====
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']) {
      await C.create('target', { period: m, project_id: pj.CTS, target_units: 4, target_sales: 4.4e9, target_collect: 3.0e9 }, tp, o());
      await C.create('target', { period: m, project_id: pj.TNS, target_units: 2, target_sales: 2.1e9, target_collect: 9.0e9 }, tp, o());
      await C.create('target', { period: m, user_id: bh1.id, target_units: 2, target_sales: 2.2e9 }, tp, o());
      await C.create('target', { period: m, user_id: bh2.id, target_units: 2, target_sales: 2.2e9 }, tp, o());
      await C.create('target', { period: m, user_id: cn.id, target_collect: 8.0e9 }, tp, o());
    }
  });

  // ===== kế hoạch thu tháng này (đã duyệt) + tháng sau (nháp) — gợi ý từ công nợ & cam kết =====
  const { suggestPlan } = require('./server');
  const cnU = { ...U['thu.congno'] }, tpU = U['thu.truongphong'];
  const m = T.slice(0, 7), next = C.addDays(m + '-01', 32).slice(0, 7);
  await tx(async db => {
    const r1 = await suggestPlan(db, m, cnU, true);
    stats['Kế hoạch thu tháng này'] = r1.created;
    for (const p of await db.q("SELECT id FROM kd_collect_plan WHERE month = $1 AND is_demo", [m])) { await C.submit('collect_plan', p.id, cnU, { db, demo: true }); await C.approve('collect_plan', p.id, tpU, { ok: true, db }); }
    for (const p of await db.q("SELECT p.id, p.expected FROM kd_collect_plan p WHERE month = $1 AND is_demo ORDER BY id LIMIT 6", [m]))
      await C.update('collect_plan', p.id, { reason_miss: 'Khách chờ giải ngân ngân hàng' }, cnU, { db });
    const r2 = await suggestPlan(db, next, cnU, true);
    stats['Kế hoạch thu tháng sau (nháp)'] = r2.created;
    await B.jobs(db);
    // báo cáo tháng trước đã chốt
    const prev = C.addDays(m + '-01', -1).slice(0, 7);
    const rp = (await C.create('report', { period: prev, note: 'Dữ liệu thử — báo cáo tháng trước đã chốt' }, tpU, { db, demo: true })).row;
    await C.act('report', rp.id, 'compute', tpU, {}, { db, demo: true });
    await C.act('report', rp.id, 'close', tpU, {}, { db, demo: true });
  });
  const s = await one("SELECT (SELECT count(*) FROM kd_unit WHERE status='con_ban') con_ban, (SELECT count(*) FROM kd_unit WHERE status IN ('giu_cho','da_coc')) giu, (SELECT count(*) FROM kd_unit WHERE status='da_ky_hd') da_ky, (SELECT count(*) FROM kd_unit WHERE status='da_ban_giao') ban_giao, (SELECT count(*) FROM kd_commission) hh");
  return { ...stats, 'Căn còn bán': s.con_ban, 'Căn giữ chỗ / cọc': s.giu, 'Căn đã ký HĐ': s.da_ky, 'Căn đã bàn giao': s.ban_giao, 'Dòng hoa hồng': s.hh };
}

// ======================= XÓA DỮ LIỆU THỬ =======================
const ORDER = ['commission', 'collect_plan', 'debt_call', 'refund', 'cancel_req', 'receipt', 'contract_change', 'defect', 'pinkbook', 'handover', 'ticket', 'notice', 'noxh_check', 'contact_log', 'installment', 'contract', 'reservation',
  'report', 'target', 'agent_alloc', 'commission', 'customer', 'commission_policy', 'agent', 'package'];
async function clearDemo() {
  const out = {};
  const touched = await tx(async db => {
    const units = new Set([
      ...(await db.q('SELECT unit_id FROM kd_reservation WHERE is_demo')).map(r => r.unit_id),
      ...(await db.q('SELECT unit_id FROM kd_contract WHERE is_demo')).map(r => r.unit_id),
      ...(await db.q('SELECT unit_id FROM kd_handover WHERE is_demo')).map(r => r.unit_id),
    ]);
    await db.q('UPDATE kd_contract SET reservation_id = NULL WHERE is_demo');
    for (const k of ORDER) {
      const t = 'kd_' + k;
      const ids = (await db.q(`SELECT id FROM ${t} WHERE is_demo`)).map(r => r.id); if (!ids.length) continue;
      await db.q(`DELETE FROM ${t} WHERE id = ANY($1)`, [ids]);
      await db.q('DELETE FROM kd_audit WHERE ent = $1 AND rec_id = ANY($2)', [k, ids]);
      await db.q('DELETE FROM kd_approval WHERE ent = $1 AND rec_id = ANY($2)', [k, ids]);
      await db.q('DELETE FROM kd_note WHERE ent = $1 AND rec_id = ANY($2)', [k, ids]);
      out[k] = (out[k] || 0) + ids.length;
    }
    for (const f of await db.q('SELECT path FROM kd_file WHERE is_demo')) try { fs.unlinkSync(path.join(FILES, f.path)); } catch {}
    out.files = (await db.q('DELETE FROM kd_file WHERE is_demo RETURNING id')).length;
    for (const t of ['kd_audit', 'kd_approval', 'kd_note', 'kd_import']) await db.q(`DELETE FROM ${t} WHERE is_demo`);
    await db.q("DELETE FROM kd_audit WHERE ent = 'unit' AND rec_id = ANY($1) AND action = 'cap_nhat_trang_thai'", [[...units]]);
    for (const id of units) await B.recomputeUnit(db, id, C.SYS);
    // không đặt lại bộ đếm mã: mã đã cấp (KH…, GD-…) không dùng lại, tránh trùng với dữ liệu thật đã phát sinh
    return units.size;
  });
  return { removed: out, units_recomputed: touched };
}

module.exports = { seedBase, loadDemo, clearDemo, ensureTemplates };

if (require.main === module) {
  (async () => {
    const a = process.argv.slice(2);
    if (a.includes('--clear-demo')) console.log('Đã xóa dữ liệu thử:', await clearDemo());
    else {
      console.log('Dữ liệu gốc:', await seedBase());
      if (a.includes('--demo')) console.log('Giao dịch thử:', await loadDemo());
    }
    await pool.end();
  })().catch(async e => { console.error(e.message, e.stack?.split('\n').slice(1, 4).join('\n')); await pool.end(); process.exit(1); });
}
