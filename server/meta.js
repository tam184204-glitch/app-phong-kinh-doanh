// Định nghĩa nghiệp vụ App Phòng Kinh doanh — một nguồn cho cả CSDL (tự tạo bảng/cột), máy chủ (kiểm tra, quyền, phê duyệt) và giao diện (form, danh sách).
// Căn cứ: «Bản mô tả chức năng chi tiết» (12 phân hệ) + «Bộ mẫu biểu nghiệp vụ» v2.0 26/10/2026 (18 mẫu) + «Cấu trúc App» (ma trận phân quyền).
//
// Trường: { k, l, t, req, o|opt, ref, ro, pii, show, help, def }
//   t: text | long | int | num | money | date | dt | month | sel | ref | user | bool | check (checklist JSON) | json | code (tự sinh)
//   o: [[giá trị, nhãn, màu]] — màu: g xanh lá, b xanh dương, a vàng, r đỏ, s xám, v tím, t xanh ngọc
//   opt: tên danh mục dùng chung (bảng kd_lookup, quản trị sửa được)
//   ro: chỉ hệ thống ghi (tự tính / tự lấy / đồng bộ)
// Quyền: c tạo, u sửa, d xóa, a phê duyệt, x xuất dữ liệu; đọc = r (mặc định mọi vai trò). Quản trị hệ thống luôn có đủ quyền.

const ROLES = [
  ['lanh_dao', 'Chủ tịch / Ban lãnh đạo', 'Dashboard, báo cáo tổng hợp và phê duyệt theo thẩm quyền'],
  ['truong_phong', 'Trưởng phòng Kinh doanh', 'Quản lý nghiệp vụ, giao việc, kiểm soát báo cáo'],
  ['ban_hang', 'Nhân viên bán hàng', 'Khách hàng, giỏ hàng, giao dịch'],
  ['cong_no', 'Nhân viên công nợ', 'Lịch thu, nhắc nợ, kế hoạch dòng thu'],
  ['ho_so', 'Nhân viên quản lý hồ sơ', 'Hồ sơ NOXH, hợp đồng, cấp sổ hồng'],
  ['cskh', 'Nhân viên CSKH', 'Bàn giao, phản ánh, khiếu nại, bảo hành'],
  ['ke_toan', 'Kế toán', 'Đối soát công nợ, xác nhận thu tiền từ Bravo'],
  ['admin', 'Quản trị hệ thống', 'Tài khoản, phân quyền, danh mục, tích hợp'],
];
const ALL = ROLES.map(r => r[0]);
const MGR = ['truong_phong', 'lanh_dao'];
// được xem giấy tờ định danh khách hàng (dữ liệu cá nhân)
const PII_ROLES = ['truong_phong', 'lanh_dao', 'ho_so', 'admin'];

const S = { // bộ trạng thái dùng lại
  duyet: [['nhap', 'Nháp', 's'], ['cho_duyet', 'Chờ duyệt', 'a'], ['da_duyet', 'Đã duyệt', 'g'], ['tu_choi', 'Từ chối', 'r']],
};
const money = (k, l, x = {}) => ({ k, l, t: 'money', ...x });
const owner = (l = 'Nhân viên phụ trách', x = {}) => ({ k: 'owner_id', l, t: 'user', def: 'me', ...x });

const E = {};
const def = (key, o) => { E[key] = { key, table: 'kd_' + key, r: ALL, ...o }; };

// ===================== 02. DỰ ÁN & GIỎ HÀNG =====================
def('project', {
  title: 'Dự án', one: 'dự án', mod: '02', icon: 'fa-city', disp: "t.code||' · '||t.name",
  c: ['truong_phong'], fields: [
    { k: 'code', l: 'Mã dự án', t: 'text', req: 1, uniq: 1, help: 'VD: CTS, TNS' },
    { k: 'name', l: 'Tên dự án', t: 'text', req: 1 },
    { k: 'investor', l: 'Chủ đầu tư', t: 'text' },
    { k: 'kind', l: 'Loại hình', t: 'sel', o: [['noxh', 'Nhà ở xã hội'], ['thuong_mai', 'Nhà ở thương mại'], ['lien_ke', 'Liền kề / thấp tầng'], ['hon_hop', 'Hỗn hợp']] },
    { k: 'address', l: 'Địa điểm', t: 'text' },
    { k: 'units_total', l: 'Tổng số sản phẩm', t: 'int' },
    { k: 'note', l: 'Thông tin quản lý khác', t: 'long' },
  ], list: ['code', 'name', 'investor', 'kind', 'units_total'],
});
def('building', {
  title: 'Tòa / khu', one: 'tòa', mod: '02', icon: 'fa-building', disp: "coalesce(t.name, t.code)",
  c: ['truong_phong'], fields: [
    { k: 'project_id', l: 'Dự án', t: 'ref', ref: 'project', req: 1 },
    { k: 'code', l: 'Mã tòa / khu', t: 'text', req: 1, help: 'P / G / LK' },
    { k: 'name', l: 'Tên tòa', t: 'text' },
    { k: 'kind', l: 'Loại', t: 'sel', o: [['chung_cu', 'Chung cư'], ['lien_ke', 'Liền kề'], ['shophouse', 'Shophouse']] },
    { k: 'floors', l: 'Số tầng', t: 'int' },
    { k: 'units_total', l: 'Số căn', t: 'int' },
    { k: 'note', l: 'Ghi chú', t: 'long' },
  ], list: ['project_id', 'code', 'name', 'kind', 'floors', 'units_total'], uniq: [['project_id', 'code']],
});
// tình trạng giai đoạn tìm khách (03 Khách hàng tiềm năng); các tình trạng còn lại = sau mở bán (02 Danh mục khách hàng)
const PROSPECT_ST = ['moi', 'dang_cham_soc', 'hen_tham_quan', 'quan_tam_cao', 'khong_nhu_cau'];
const UNIT_ST = [['chua_mo_ban', 'Chưa mở bán', 's'], ['con_ban', 'Còn bán', 'g'], ['giu_cho', 'Đang giữ chỗ', 'a'], ['da_coc', 'Đã đặt cọc', 'v'],
  ['da_ky_hd', 'Đã ký hợp đồng', 'b'], ['da_ban_giao', 'Đã bàn giao', 't'], ['tam_khoa', 'Tạm khóa', 'r'], ['ngung_kd', 'Ngừng kinh doanh', 's']];
def('unit', {
  title: 'Căn hộ – liền kề', one: 'căn', code: 'DA-01', mod: '02', icon: 'fa-door-open', disp: 't.code',
  purpose: 'Tạo hồ sơ sản phẩm dùng chung', users: 'Nhân viên quản lý giỏ hàng',
  how: 'Nhập dự án → tòa → căn → kiểm tra trùng → lưu → duyệt kích hoạt',
  rules: 'Không trùng mã căn trong dự án; diện tích > 0; trạng thái bán thay đổi theo giao dịch',
  c: ['truong_phong'], d: [], a: MGR, fields: [
    { k: 'project_id', l: 'Dự án', t: 'ref', ref: 'project', req: 1 },
    { k: 'building_id', l: 'Tòa / khu', t: 'ref', ref: 'building', req: 1, dep: 'project_id' },
    { k: 'code', l: 'Mã căn', t: 'text', req: 1, help: 'CTS-P-0201' },
    { k: 'floor', l: 'Tầng', t: 'int', req: 1 },
    { k: 'kind', l: 'Loại sản phẩm', t: 'sel', req: 1, o: [['studio', 'Studio'], ['1pn', '1PN'], ['2pn', '2PN'], ['3pn', '3PN'], ['lien_ke', 'Liền kề'], ['shophouse', 'Shophouse']] },
    { k: 'area_tt', l: 'Diện tích thông thủy (m²)', t: 'num', req: 1 },
    { k: 'area_xd', l: 'Diện tích xây dựng (m²)', t: 'num' },
    { k: 'area_dat', l: 'Diện tích đất (m²)', t: 'num' },
    { k: 'bedrooms', l: 'Số phòng ngủ', t: 'int' },
    { k: 'direction', l: 'Hướng (cửa chính – ban công)', t: 'text', help: 'TN-ĐB, ĐB-TN…' },
    { k: 'door_dir', l: 'Hướng cửa chính', t: 'text' },
    { k: 'balcony_dir', l: 'Hướng ban công', t: 'text' },
    { k: 'position', l: 'Vị trí', t: 'sel', o: [['thuong', 'Thường'], ['goc', 'Căn góc'], ['thang', 'Cạnh thang']] },
    money('list_price', 'Giá niêm yết (gồm VAT)', { hide: 1 }),   // bỏ khỏi màn căn hộ 28/10/2026 — vẫn tự = Tổng cộng (giá dự phòng khi căn chưa có tổng giá)
    money('base_price', 'Đơn giá nền (đ/m²)', { help: 'Theo bảng giá Bravo — trước thuế, trên m² thông thủy' }),
    money('pretax', 'Tổng tiền trước thuế'),
    { k: 'vat_pct', l: '% thuế', t: 'num' },
    money('tax_amt', 'Tổng tiền thuế'),
    money('price_net', 'Giá căn hộ sau thuế'),
    money('maint_fee', 'Phí bảo trì (2%)'),
    money('finish_value', 'Giá trị hoàn thiện căn hộ'),
    money('total_price', 'Tổng giá căn hộ', { help: 'Giá sau thuế + phí bảo trì + giá trị hoàn thiện — có đơn giá nền thì tự tính, dùng làm giá bán mặc định' }),
    { k: 'handover_plan', l: 'Dự kiến bàn giao', t: 'text', help: 'tháng 3/2028' },
    { k: 'data_src', l: 'Nguồn dữ liệu', t: 'text', ro: 1 },
    { k: 'package_id', l: 'Gói hoàn thiện', t: 'ref', ref: 'package' },
    { k: 'status', l: 'Trạng thái', t: 'sel', o: UNIT_ST, ro: 1, def: 'chua_mo_ban' },
    { k: 'activated', l: 'Đã kích hoạt', t: 'bool', ro: 1, hide: 1 },
    { k: 'lock', l: 'Khóa kinh doanh', t: 'sel', o: [['', 'Không'], ['tam_khoa', 'Tạm khóa'], ['ngung_kd', 'Ngừng kinh doanh']] },
    { k: 'features', l: 'Đặc điểm sản phẩm', t: 'long' },
  ], list: ['code', 'building_id', 'floor', 'kind', 'area_tt', 'direction', 'total_price', 'status'], uniq: [['project_id', 'code']],
  flow: { field: 'status', submit: ['chua_mo_ban'], approve: { ok: 'con_ban' }, submitLabel: 'Trình duyệt kích hoạt' },
});
def('price_policy', {
  title: 'Bảng giá – chính sách bán hàng', one: 'chính sách', code: 'DA-02', mod: '02', icon: 'fa-tags', disp: "t.code||' v'||t.version",
  purpose: 'Quản lý phiên bản giá và ưu đãi', users: 'Trưởng phòng / nhân sự được phân quyền',
  how: 'Tạo nháp → trình duyệt → phát hành → tự áp dụng cho giao dịch mới',
  rules: 'Không sửa phiên bản đã phát hành; chính sách hết hạn không tự áp dụng',
  c: ['truong_phong'], a: ['lanh_dao'], files: [['phe_duyet', 'Quyết định / tờ trình phê duyệt'], ['nguon', 'Tệp nguồn (PDF)']], fields: [
    { k: 'code', l: 'Mã chính sách', t: 'text', req: 1, help: 'CSBH-2026-01' },
    { k: 'version', l: 'Phiên bản', t: 'int', ro: 1, def: 1 },
    { k: 'project_ids', l: 'Dự án', t: 'refs', ref: 'project', req: 1, help: 'Chọn được nhiều dự án cùng áp dụng một chính sách' },
    { k: 'project_id', l: 'Dự án chính', t: 'ref', ref: 'project', hide: 1 },   // = dự án đầu tiên trong project_ids (giữ cho chỗ cần 1 dự án)
    { k: 'mode', l: 'Cách tính giá', t: 'sel', hide: 1, def: 'bang_hang', o: [['bang_hang', 'Theo giá từng căn trên bảng hàng'], ['don_gia', 'Đơn giá × diện tích thông thủy']] },
    money('unit_price', 'Đơn giá (đ/m² thông thủy)', { show: { mode: ['don_gia'] } }),
    { k: 'maint_pct', l: 'Phí bảo trì (%)', t: 'num', def: 2, show: { mode: ['don_gia'] } },
    { k: 'vat_pct', l: 'Thuế GTGT (%)', t: 'num', hide: 1, def: 5 },   // bỏ khỏi form 31/10/2026 — vẫn mặc định 5% để tách giá trong chi tiết bảng giá
    { k: 'src_file', l: 'Tệp nguồn (PDF)', t: 'text', upload: '.pdf', help: 'Chọn tệp PDF chính sách / bảng giá — lưu vào mục Tệp của chính sách' },
    { k: 'content', l: 'Nội dung chính sách bán hàng', t: 'long' },   // gộp 3 ô cũ Ưu đãi, Phương thức thanh toán, Chính sách ngân hàng 31/10/2026 (schema.js PRE chuyển dữ liệu)
    { k: 'discount', l: 'Ưu đãi / chiết khấu', t: 'long', hide: 1 },
    { k: 'pay_method', l: 'Phương thức thanh toán', t: 'long', hide: 1 },
    { k: 'bank_policy', l: 'Chính sách ngân hàng', t: 'long', hide: 1 },
    { k: 'target', l: 'Đối tượng áp dụng', t: 'text' },
    { k: 'start_on', l: 'Ngày bắt đầu', t: 'date', req: 1 },
    { k: 'end_on', l: 'Ngày kết thúc', t: 'date', req: 1 },
    { k: 'unit_group', l: 'Căn hộ áp dụng', t: 'text', req: 1, def: '', pick: 'units', help: 'Chỉ hiện căn còn trong bảng hàng (chưa ký HĐMB / vay / thuê). Bấm Tòa / loại căn để lọc, tích từng căn hoặc cả tòa; «Chọn N căn đang hiện» chọn nhanh theo bộ lọc; «Chọn tất cả» = cả dự án' },
    // tiến độ thu tiền (16/11/2026): HĐMB của các căn đã tích tự lấy «Lần thanh toán» theo đây — hạn = ngày ký HĐMB + số ngày; đợt bàn giao theo thông báo bàn giao
    { k: 'pay_sched', l: 'Tiến độ thu tiền (Lần thanh toán HĐMB)', t: 'json' },
    { k: 'pay_mdot', l: 'Phí bảo trì thu cùng hạn đợt', t: 'int', def: 3, hide: 1, help: 'Phí bảo trì (2% tiền trước thuế) thu ở dòng riêng, cùng hạn với đợt này' },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'nhap', o: [['nhap', 'Nháp', 's'], ['cho_duyet', 'Chờ duyệt', 'a'], ['phat_hanh', 'Đã phát hành', 'g'], ['tu_choi', 'Từ chối', 'r'], ['thay_the', 'Đã thay thế', 's']] },
    { k: 'parent_id', l: 'Phiên bản trước', t: 'ref', ref: 'price_policy', ro: 1 },
  ], list: ['code', 'version', 'project_ids', 'unit_group', 'start_on', 'end_on', 'status'],
  lock: ['phat_hanh', 'thay_the', 'cho_duyet'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'phat_hanh' }, submitLabel: 'Trình duyệt' },
  acts: [{ k: 'new_version', l: 'Tạo phiên bản mới', icon: 'fa-code-branch', from: ['phat_hanh'], roles: ['truong_phong'] },
    { k: 'apply_sched', l: 'Áp tiến độ cho HĐMB chưa trình', icon: 'fa-arrows-rotate', from: ['phat_hanh'], roles: ['truong_phong'] }],
});
def('package', {
  title: 'Gói hoàn thiện – sản phẩm', one: 'gói', mod: '02', icon: 'fa-couch', disp: "t.code||' · '||t.name",
  c: ['truong_phong'], fields: [
    { k: 'code', l: 'Mã gói', t: 'text', req: 1, uniq: 1 },
    { k: 'name', l: 'Tên gói', t: 'text', req: 1 },
    { k: 'project_id', l: 'Dự án', t: 'ref', ref: 'project' },
    money('value', 'Giá trị gói'),
    { k: 'items', l: 'Danh mục nội thất, thiết bị', t: 'long' },
    { k: 'status', l: 'Trạng thái', t: 'sel', def: 'ap_dung', o: [['ap_dung', 'Đang áp dụng', 'g'], ['ngung', 'Ngừng', 's']] },
  ], list: ['code', 'name', 'project_id', 'value', 'status'],
});

// ===================== 03. KHÁCH HÀNG =====================
def('customer', {
  title: 'Khách hàng', one: 'khách hàng', code: 'KH-01', mod: '03', icon: 'fa-user', disp: "t.code||' · '||t.full_name",
  purpose: 'Tạo một hồ sơ khách hàng thống nhất', users: 'Nhân viên kinh doanh / hồ sơ',
  how: 'Tìm khách cũ → nếu chưa có thì tạo → kiểm tra trùng → liên kết giao dịch',
  rules: 'Chỉ người có quyền được xem dữ liệu định danh; cảnh báo trùng điện thoại/giấy tờ',
  c: ['ban_hang', 'truong_phong', 'ho_so', 'cskh'], own: ['ban_hang'], search: ['code', 'full_name', 'phone', 'phone2'], fields: [
    { k: 'code', l: 'Mã khách hàng', t: 'code', prefix: 'KH', pad: 6, manual: 1, help: 'Để trống → hệ thống tự cấp (KH000001…)' },
    { k: 'full_name', l: 'Họ tên', t: 'text', req: 1 },
    { k: 'phone', l: 'Điện thoại', t: 'text', req: 1, help: '09xxxxxxxx' },
    { k: 'phone2', l: 'Điện thoại khác', t: 'text' },
    { k: 'email', l: 'Email', t: 'text' },
    { k: 'tax_code', l: 'Mã số thuế', t: 'text', pii: 1, help: 'MST cá nhân (thường trùng số CCCD)' },
    { k: 'bank_account', l: 'Tài khoản ngân hàng', t: 'text', pii: 1, help: 'Số tài khoản - Ngân hàng (VD 0070101168008 - Ngân hàng MB)' },
    { k: 'kind', l: 'Phân loại', t: 'sel', def: 'tiem_nang', o: [['tiem_nang', 'Tiềm năng', 'a'], ['giao_dich', 'Đã giao dịch', 'g']] },
    { k: 'stage', l: 'Tình trạng', t: 'sel', def: 'moi', o: [['moi', 'Mới', 's'], ['dang_cham_soc', 'Đang chăm sóc', 'b'], ['hen_tham_quan', 'Hẹn tham quan', 'v'], ['quan_tam_cao', 'Quan tâm cao', 'g'], ['khong_nhu_cau', 'Không có nhu cầu', 'r'],
      // sau mở bán: hồ sơ mua nhà → ký HĐMB → thanh toán → bàn giao → thanh lý
      ['da_nop_hsmn', 'Đã nộp HSMN', 'b'], ['sxd_duyet', 'SXD duyệt HS', 't'], ['cho_ky_hdmb', 'Chờ ký HĐMB', 'a'], ['da_ky_hdmb', 'Đã ký HĐMB', 'g'],
      ['tt_dot_2', 'Thanh toán đợt 2', 'g'], ['tt_dot_3', 'Thanh toán đợt 3', 'g'], ['cho_ban_giao', 'Chờ bàn giao', 'a'], ['da_ban_giao', 'Đã bàn giao', 't'],
      ['lam_don_thanh_ly', 'Làm đơn thanh lý', 'r'], ['da_thanh_ly', 'Đã thanh lý', 's'], ['da_nop_hs_so', 'Đã nộp hồ sơ làm sổ', 'v'], ['da_ra_so', 'Đã ra sổ', 'g']] },
    { k: 'source', l: 'Nguồn khách', t: 'sel', opt: 'nguon_khach', req: 1 },
    { k: 'agent_id', l: 'Đại lý / CTV giới thiệu', t: 'ref', ref: 'agent' },
    { k: 'interest_project', l: 'Dự án quan tâm', t: 'ref', ref: 'project' },
    { k: 'need', l: 'Nhu cầu', t: 'long' },
    money('budget', 'Khả năng tài chính'),
    { k: 'id_no', l: 'Số CCCD / hộ chiếu', t: 'text', pii: 1 },
    { k: 'id_date', l: 'Ngày cấp', t: 'date', pii: 1 },
    { k: 'id_place', l: 'Nơi cấp', t: 'text', pii: 1 },
    { k: 'birth', l: 'Ngày sinh', t: 'date', pii: 1 },
    { k: 'address', l: 'Địa chỉ liên hệ', t: 'text' },
    { k: 'noxh_group', l: 'Nhóm đối tượng NOXH', t: 'sel', opt: 'nhom_noxh', noForm: 1 },
    owner(undefined, { noForm: 1 }),   // không hiện trong form tạo / sửa — tự lấy người tạo
    { k: 'note', l: 'Ghi chú', t: 'long' },
  ], list: ['full_name', 'code', 'address', 'phone', 'email', 'tax_code', 'stage'],
});
def('contact_log', {
  title: 'Nhật ký tư vấn – liên hệ', one: 'nhật ký', code: 'KH-02', mod: '03', icon: 'fa-comments', disp: "to_char(t.at,'DD/MM/YYYY HH24:MI')",
  purpose: 'Ghi lại lịch sử tương tác', users: 'Nhân viên phụ trách',
  how: 'Khách từ Website / Messenger / Zalo tự đổ về máy chủ → tự tạo hồ sơ + nhật ký «Chưa liên hệ». Khách gặp trực tiếp / gọi Hotline: bấm «Thêm khách trực tiếp / Hotline» hoặc nhập Excel → gọi lại, ghi kết quả, đặt ngày nhắc',
  rules: 'Không được xóa lịch sử đã chốt; chỉ người được phân quyền sửa',
  c: ['ban_hang', 'truong_phong', 'cong_no', 'cskh', 'ho_so'], u: ['truong_phong'], d: [], own: ['ban_hang'], order: 't.at desc', fields: [
    { k: 'customer_id', l: 'Khách hàng', t: 'ref', ref: 'customer', req: 1 },
    { k: 'unit_id', l: 'Căn liên quan', t: 'ref', ref: 'unit' },
    { k: 'at', l: 'Ngày liên hệ', t: 'dt', req: 1, def: 'now' },
    { k: 'channel', l: 'Kênh', t: 'sel', opt: 'kenh', req: 1 },
    { k: 'content', l: 'Nội dung trao đổi', t: 'long', req: 1 },
    { k: 'result', l: 'Kết quả', t: 'sel', req: 1, o: [['da_lien_he', 'Đã liên hệ', 'g'], ['chua_lien_he', 'Chưa liên hệ được', 'r'], ['hen_lai', 'Hẹn lại', 'a'], ['quan_tam', 'Quan tâm', 'b'], ['tu_choi', 'Từ chối', 's']] },
    { k: 'commitment', l: 'Cam kết của khách', t: 'text' },
    { k: 'next_at', l: 'Ngày nhắc tiếp', t: 'date' },
    owner('Người liên hệ'),
  ], list: ['at', 'customer_id', 'channel', 'content', 'result', 'owner_id'],
});

// ===================== 04. GIAO DỊCH =====================
const RES_ST = [['nhap', 'Nháp', 's'], ['cho_duyet', 'Chờ duyệt', 'a'], ['giu_cho', 'Đang giữ chỗ', 'b'], ['qua_han', 'Quá hạn giữ chỗ', 'r'], ['da_coc', 'Đã đặt cọc', 'v'],
  ['chuyen_hd', 'Đã chuyển hợp đồng', 'g'], ['het_han', 'Hết hạn', 's'], ['tu_choi', 'Từ chối', 'r'], ['huy', 'Đã hủy', 's']];
// phiếu đăng ký căn hộ (lập từ Bảng hàng): trạng thái căn + tiến trình do nhân viên chọn
const REG_ST = [['giu_cho', 'Giữ chỗ', 'a'], ['qua_han', 'Quá hạn giữ chỗ', 'r'], ['ky_hdmb', 'Ký HĐMB', 'g'], ['huy', 'Đã hủy', 'r']];   // giải phóng căn = hủy đăng ký: 1 mục «Đã hủy» (07/11/2026)   // quá hạn: tự đặt khi qua «Hạn giữ chỗ» chưa đặt cọc
const REG_PROG = [['tiep_nhan', 'Đã tiếp nhận hồ sơ', 's'], ['cho_xet_duyet', 'Đã nộp hồ sơ chờ xét duyệt', 'a'], ['du_dk', 'Đủ điều kiện ký HĐMB', 'b'], ['da_ky', 'Đã ký HĐMB', 'g']];
// thông báo mở bán căn hộ: mỗi đợt mở bán (văn bản thông báo, thời gian nhận hồ sơ, căn mở bán) — duyệt thì căn chưa mở bán trong đợt chuyển «Còn bán»
def('sale_notice', {
  title: 'Thông báo mở bán căn hộ', one: 'thông báo', code: 'GD-03', mod: '04', icon: 'fa-bullhorn', disp: "t.code||coalesce(' · '||t.title,'')",
  purpose: 'Theo dõi các đợt thông báo mở bán và tình hình đăng ký theo đợt', users: 'Trưởng phòng / nhân viên kinh doanh',
  how: 'Lập thông báo (dự án, căn mở bán, thời gian nhận hồ sơ, nơi đăng) → trình duyệt → duyệt thì căn chưa mở bán trong đợt tự chuyển «Còn bán» → theo dõi số căn đã đăng ký / còn trống',
  rules: 'Ngày kết thúc nhận hồ sơ phải sau ngày bắt đầu',
  c: ['truong_phong', 'ban_hang'], u: ['truong_phong', 'ban_hang'], d: ['truong_phong', 'ban_hang'], a: MGR, search: ['code', 'title', 'doc_no'], files: [['van_ban', 'Văn bản thông báo mở bán']], fields: [
    { k: 'code', l: 'Mã thông báo', t: 'code', prefix: 'TB-{Y}-', pad: 4 },
    { k: 'project_id', l: 'Dự án', t: 'ref', ref: 'project', req: 1 },
    { k: 'title', l: 'Tên đợt mở bán', t: 'text', req: 1, help: 'VD: Mở bán đợt 2 – tòa O' },
    { k: 'doc_no', l: 'Số văn bản thông báo', t: 'text' },
    { k: 'notice_on', l: 'Ngày thông báo', t: 'date', def: 'today' },
    { k: 'open_on', l: 'Ngày bắt đầu nhận hồ sơ', t: 'date', req: 1 },
    { k: 'close_on', l: 'Ngày kết thúc nhận hồ sơ', t: 'date' },
    { k: 'channels', l: 'Nơi đăng thông báo', t: 'text', sug: ['Website công ty; Cổng thông tin Sở Xây dựng', 'Website công ty', 'Cổng thông tin Sở Xây dựng', 'Bảng tin tại dự án', 'Fanpage / Zalo OA', 'Báo điện tử'] },
    { k: 'unit_group', l: 'Căn hộ mở bán', t: 'text', req: 1, def: '', pick: 'units', help: 'Tích chọn đúng các căn mở bán trong đợt (tích cả tòa = chọn nguyên tòa)' },
    { k: 'note', l: 'Ghi chú', t: 'long' },
    { k: 'status', l: 'Trạng thái', t: 'sel', o: [['nhap', 'Nháp', 's'], ['cho_duyet', 'Chờ duyệt', 'a'], ['da_duyet', 'Đã phát hành', 'g'], ['tu_choi', 'Từ chối', 'r']], ro: 1, def: 'nhap' },
  ], list: ['code', 'project_id', 'title', 'doc_no', 'notice_on', 'open_on', 'close_on', 'n_units', 'n_reg', 'n_free', 'status'],
  lock: ['cho_duyet', 'da_duyet'], lockKeep: ['note', 'close_on', 'channels'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet', no: 'tu_choi' }, submitLabel: 'Trình duyệt' },
  acts: [{ k: 'in_tb', l: 'In thông báo', icon: 'fa-print', from: '*', roles: ALL, url: '/print/sale_notice/:id?kind=thong_bao' },
    { k: 'in_ds', l: 'In danh sách căn', icon: 'fa-list-ol', from: '*', roles: ALL, url: '/print/sale_notice/:id?kind=danh_sach' }],
});
def('reservation', {
  title: 'Đăng ký mua / thuê – giữ chỗ', one: 'phiếu đăng ký', code: 'GD-01', mod: '04', icon: 'fa-hand-holding-hand', disp: "t.code||coalesce(' · '||t.cust_name,'')",
  purpose: 'Ghi nhận khách đăng ký mua căn, giữ căn cho khách', users: 'Nhân viên bán hàng',
  how: 'Bảng hàng → bấm căn Còn bán → lập phiếu đăng ký căn hộ → phiếu tự vào danh sách này, căn chuyển «Đang giữ chỗ» → cập nhật tiến trình → in bản đăng ký căn hộ / nội thất',
  rules: 'Chặn đăng ký trùng căn; khách chưa có hồ sơ thì tự tạo theo CCCD / số điện thoại; hủy đăng ký thì căn trở lại Còn bán, không tự hoàn tiền',
  c: ['ban_hang', 'truong_phong'], a: MGR, own: ['ban_hang'], search: ['code', 'cust_name', 'phone'], direct: 1, listPii: 1, fields: [
    { k: 'code', l: 'Mã phiếu', t: 'code', prefix: 'GD-{Y}-', pad: 4 },
    { k: 'sale_check', l: 'Thông báo mở bán', t: 'text', ro: 1 },   // kiểm tra căn có trong thông báo mở bán đã duyệt gần nhất (cảnh báo, không chặn)
    { k: 'unit_id', l: 'Mã căn hộ', t: 'ref', ref: 'unit', req: 1, filter: 'con_ban,chua_mo_ban', fill: { price: 'total_price', finish_value: 'finish_value' } },
    { k: 'deal', l: 'Hình thức đăng ký', t: 'sel', req: 1, def: 'mua', o: [['mua', 'Đăng ký mua', 'b'], ['thue', 'Đăng ký thuê', 'v']] },
    { k: 'customer_id', l: 'Khách hàng đã có', t: 'ref', ref: 'customer', help: 'Chọn khách có sẵn để điền nhanh — để trống: hệ thống tự khớp theo CCCD / SĐT hoặc tạo khách mới',
      fill: { cust_code: 'code', cust_name: 'full_name', id_no: 'id_no', id_date: 'id_date', id_place: 'id_place', address: 'address', phone: 'phone', tax_code: 'tax_code', bank_account: 'bank_account' } },
    { k: 'cust_code', l: 'Mã khách hàng', t: 'text', help: 'Để trống → lấy mã khách đã có (khớp CCCD / SĐT) hoặc tự cấp mã mới (KH000001…)' },
    { k: 'cust_name', l: 'Họ tên khách hàng', t: 'text', req: 1 },
    { k: 'id_no', l: 'Căn cước công dân', t: 'text', pii: 1 },
    { k: 'id_date', l: 'Ngày cấp', t: 'date', pii: 1 },
    { k: 'id_place', l: 'Nơi cấp', t: 'text', pii: 1 },
    { k: 'address', l: 'Địa chỉ', t: 'text' },
    { k: 'phone', l: 'Số điện thoại', t: 'text', req: 1, help: '09xxxxxxxx' },
    { k: 'tax_code', l: 'Mã số thuế cá nhân', t: 'text', pii: 1, help: 'In trên biên bản bàn giao hồ sơ' },
    { k: 'bank_account', l: 'Tài khoản ngân hàng', t: 'text', pii: 1, help: 'Số tài khoản - Ngân hàng (VD 0070101168008 - Ngân hàng MB)' },
    money('unit_value', 'Giá trị căn hộ', { show: { deal: ['mua'] }, help: 'Giá trị sau thuế + phí bảo trì — tự lấy theo Danh mục sản phẩm khi chọn căn' }),
    money('finish_value', 'Giá trị hoàn thiện nội thất', { show: { deal: ['mua'] } }),
    money('price', 'Tổng giá bán', { show: { deal: ['mua'] }, help: 'Tự tính = Giá trị căn hộ + Giá trị hoàn thiện nội thất' }),
    money('rent', 'Tiền thuê/tháng dự kiến', { show: { deal: ['thue'] }, req: 1, help: 'Chuyển sang hợp đồng thuê khi «Lập hợp đồng»' }),
    { k: 'term_months', l: 'Thời hạn thuê dự kiến (tháng)', t: 'int', show: { deal: ['thue'] } },
    { k: 'reg_state', l: 'Trạng thái căn hộ', t: 'sel', req: 1, def: 'giu_cho', o: REG_ST },
    { k: 'progress', l: 'Tiến trình giao dịch', t: 'sel', req: 1, def: 'tiep_nhan', o: REG_PROG },
    { k: 'policy_id', l: 'Chính sách áp dụng', t: 'ref', ref: 'price_policy', filter: 'phat_hanh', show: { deal: ['mua'] }, help: 'Để trống → tự lấy chính sách bán hàng đang phát hành cho căn' },
    { k: 'note', l: 'Ghi chú', t: 'long' },
    { k: 'reg_at', l: 'Ngày giờ đăng ký', t: 'dt', req: 1, def: 'now', help: 'Tự lấy giờ hiện tại khi mở phiếu — sửa được' },
    { k: 'reg_date', l: 'Ngày đăng ký', t: 'date', hide: 1 },   // = ngày của reg_at (giờ VN), giữ cho giá / hoa hồng / kiểm tra hạn
    { k: 'hold_until', l: 'Hạn giữ chỗ', t: 'dt', help: 'Để trống = giữ đến khi ký HĐMB / hủy đăng ký' },
    money('deposit', 'Số tiền đặt cọc', { hide: 1 }),   // không dùng đặt cọc — giữ cột cho dữ liệu cũ
    { k: 'deposit_on', l: 'Ngày đặt cọc', t: 'date', hide: 1 },   // không dùng đặt cọc — giữ cột cho dữ liệu cũ
    { k: 'docs_deadline', l: 'Hạn hoàn thiện hồ sơ', t: 'date' },
    { k: 'source', l: 'Nguồn bán', t: 'sel', req: 1, def: 'truc_tiep', o: [['truc_tiep', 'Trực tiếp'], ['dai_ly', 'Đại lý / sàn'], ['ctv', 'Cộng tác viên']] },
    { k: 'agent_id', l: 'Đại lý bán hàng', t: 'ref', ref: 'agent', show: { source: ['dai_ly', 'ctv'] } },
    owner('Người thực hiện', { hide: 1 }),   // tự lấy người lập phiếu
    { k: 'status', l: 'Tình trạng phiếu', t: 'sel', o: RES_ST, ro: 1, def: 'nhap' },
    // phiếu đã hủy: theo dõi trả lại hồ sơ cho khách — sửa ngay trên dòng ở tab «Đã hủy»
    { k: 'doc_ret', l: 'Trạng thái trả hồ sơ', t: 'sel', show: { status: ['huy'] }, o: [['chua_tra', 'Chưa trả hồ sơ', 'a'], ['da_tra', 'Đã trả hồ sơ', 'g']] },
    { k: 'doc_ret_on', l: 'Ngày trả hồ sơ', t: 'date', show: { status: ['huy'] } },
  ], list: ['stt', 'unit_id', 'sale_check', 'cust_code', 'cust_name', 'id_no', 'id_date', 'id_place', 'address', 'phone', 'unit_value', 'finish_value', 'price', 'reg_at', 'hold_until', 'reg_state', 'progress', 'source', 'agent_id', 'prints'],
  // tab «Đăng ký thuê» ở danh sách: tiền thuê thay cho giá bán
  lists: { thue: { cols: ['stt', 'unit_id', 'sale_check', 'cust_code', 'cust_name', 'id_no', 'id_date', 'id_place', 'address', 'phone', 'rent', 'term_months', 'reg_at', 'hold_until', 'reg_state', 'progress', 'source', 'agent_id'] } },   // chưa có mẫu in đăng ký thuê → không có cột In
  lock: ['chuyen_hd', 'het_han', 'huy', 'cho_duyet'], lockKeep: ['note', 'progress', 'reg_state', 'doc_ret', 'doc_ret_on'],
  files: [['tai_lieu', 'Tài liệu'], ['tra_ho_so', 'File scan trả hồ sơ']], fileKeep: ['tra_ho_so'],   // fileKeep: loại tệp vẫn xóa được khi phiếu đã khóa
  flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'giu_cho' } },
  acts: [
    // bỏ «Ghi nhận đặt cọc» (03/11/2026: phòng KD không dùng đặt cọc trên phiếu đăng ký)
    { k: 'extend', l: 'Gia hạn giữ chỗ', icon: 'fa-clock-rotate-left', from: ['giu_cho', 'qua_han'], roles: MGR, ask: [{ k: 'hold_until', l: 'Hạn giữ chỗ mới', t: 'dt', req: 1 }, { k: 'reason', l: 'Lý do', t: 'long', req: 1 }] },
    { k: 'release', l: 'Giải phóng / Hủy đăng ký', icon: 'fa-unlock', from: ['giu_cho', 'qua_han'], roles: MGR, danger: 1, ask: [{ k: 'reason', l: 'Lý do / phương án xử lý tiền đã nộp', t: 'long', req: 1 }] },
    { k: 'to_contract', l: 'Lập hợp đồng', icon: 'fa-file-signature', from: ['giu_cho', 'da_coc'], roles: ['ban_hang', 'truong_phong', 'ho_so'], ask: [{ k: 'kind', l: 'Loại hợp đồng', t: 'sel', req: 1, def: 'hdmb', o: [['hdmb', 'Hợp đồng mua bán'], ['thue', 'Hợp đồng thuê'], ['thue_mua', 'Hợp đồng thuê mua']] }, { k: 'number', l: 'Số hợp đồng', t: 'text', req: 1 }, { k: 'plan_sign', l: 'Ngày dự kiến ký', t: 'date' }] },
  ],
});
// Mẫu 4 — danh sách đối tượng mua NOXH nộp Sở Xây dựng (file «1. CTS.xlsx», sheet «Danh mục»): ghi đúng nguyên văn nên là ô chữ có gợi ý
const M4 = {
  hinh_thuc: [['mua', 'Mua'], ['thue', 'Thuê'], ['thue_mua', 'Thuê mua']],
  nghe: ['Người có công với cách mạng', 'Lao động tự do', 'Người lao động làm việc tại doanh nghiệp', 'Người làm việc trong quân nhân chuyên nghiệp, công an, quân đội nhân dân', 'Cán bộ, công chức, viên chức', 'Học sinh, sinh viên'],
  doi_tuong: ['Người có công với cách mạng theo quy định của pháp luật về ưu đãi người có công với cách mạng', 'Người thu nhập thấp tại khu vực đô thị', 'Người thu nhập thấp, hộ nghèo, cận nghèo tại khu vực đô thị',
    'Người lao động đang làm việc tại các doanh nghiệp trong và ngoài khu công nghiệp', 'Sĩ quan, hạ sĩ quan nghiệp vụ, hạ sĩ quan chuyên môn kỹ thuật, quân nhân chuyên nghiệp, công nhân trong cơ quan, đơn vị thuộc công an nhân dân và quân đội nhân dân',
    'Cán bộ, công chức, viên chức theo quy định của pháp luật về cán bộ, công chức, viên chức', 'Các đối tượng đã trả lại nhà ở công vụ theo quy định tại khoản 5 Điều 81 của Luật Nhà ở',
    'Học sinh, sinh viên các học viện, trường đại học, cao đẳng, dạy nghề; học sinh trường dân tộc nội trú công lập được sử dụng nhà ở trong thời gian học tập',
    'Hộ gia đình, cá nhân thuộc diện bị thu hồi đất và phải giải tỏa, phá dỡ nhà ở theo quy định của pháp luật mà chưa được Nhà nước bồi thường bằng nhà ở, đất ở', 'Đối tượng đã được nghỉ hưu theo chế độ'],
  nha_o: ['Chưa có nhà ở thuộc sở hữu của hộ gia đình', 'Có nhà ở nhưng chật chội diện tích bình quân dưới 10m2 sàn/người', 'Có nhà ở nhưng nhà ở bị hư hỏng, dột nát (hư hỏng khung - tường, mái)',
    'Có nhà ở nhưng đã bị hư hỏng khung, tường, mái nhà và diện tích khuôn viên đất của nhà ở thấp hơn tiêu chuẩn diện tích tối thiểu thuộc diện được phép cải tạo, xây dựng theo quy định của UBND cấp tỉnh',
    'Có đất ở tại địa phương nơi đăng ký hộ khẩu thường trú và diện tích khuôn viên đất phù hợp với quy hoạch xây dựng theo quy định của UBND cấp tỉnh', 'Có nhà ở nhưng thuộc diện bị giải tỏa khi Nhà nước thu hồi đất',
    'Có nhà ở gắn liền với đất khi Nhà nước thu hồi phải di chuyển chỗ ở và không còn chỗ ở nào khác trên địa bàn xã, phường, thị trấn nơi có đất thu hồi mà chưa được bồi thường về nhà ở, đất ở tái định cư', 'Khó khăn về nhà ở khác (ghi rõ nội dung)'],
  thu_nhap: ['Có thu nhập bình quân hàng tháng thực nhận không quá 25 triệu đồng', 'Có thu nhập bình quân hàng tháng thực nhận không quá 50 triệu đồng'],
  quan_he: ['Vợ (Chồng)', 'Chồng (Vợ)', 'Con', 'Anh, chị, em', 'Cha (Mẹ)', 'Ông (Bà)', 'Cháu'],
};
// cột khai báo một người trong hộ theo Mẫu 4 — dùng chung cho dòng chủ hộ và thành viên (mỗi lần gọi trả bản mới, không dùng chung đối tượng)
// 99 phường, xã tỉnh Bắc Ninh từ 01/7/2025 (Nghị quyết 1658/NQ-UBTVQH15; bỏ cấp huyện) — gợi ý ô «Thị trấn/xã» khi tỉnh là Bắc Ninh
const BN_PHUONG = ['Kinh Bắc', 'Võ Cường', 'Vũ Ninh', 'Hạp Lĩnh', 'Nam Sơn', 'Từ Sơn', 'Tam Sơn', 'Đồng Nguyên', 'Phù Khê', 'Thuận Thành', 'Mão Điền', 'Trạm Lộ', 'Trí Quả', 'Song Liễu', 'Ninh Xá', 'Quế Võ', 'Phương Liễu', 'Nhân Hòa', 'Đào Viên', 'Bồng Lai', 'Bắc Giang', 'Đa Mai', 'Tiền Phong', 'Tân Tiến', 'Yên Dũng', 'Tân An', 'Cảnh Thụy', 'Việt Yên', 'Nếnh', 'Vân Hà', 'Tự Lạn', 'Chũ', 'Phượng Sơn'];
const BN_XA = ['Chi Lăng', 'Phù Lãng', 'Yên Phong', 'Văn Môn', 'Tam Giang', 'Yên Trung', 'Tam Đa', 'Tiên Du', 'Liên Bão', 'Tân Chi', 'Đại Đồng', 'Phật Tích', 'Gia Bình', 'Nhân Thắng', 'Đại Lai', 'Cao Đức', 'Đông Cứu', 'Lương Tài', 'Lâm Thao', 'Trung Chính', 'Trung Kênh', 'Đồng Việt', 'Hiệp Hòa', 'Xuân Cẩm', 'Hợp Thịnh', 'Hoàng Vân', 'Tân Yên', 'Nhã Nam', 'Quang Trung', 'Phúc Hòa', 'Ngọc Thiện', 'Bố Hạ', 'Yên Thế', 'Xuân Lương', 'Đồng Kỳ', 'Tam Tiến', 'Lạng Giang', 'Tiên Lục', 'Tân Dĩnh', 'Mỹ Thái', 'Kép', 'Biển Động', 'Lục Ngạn', 'Đèo Gia', 'Sơn Hải', 'Tân Sơn', 'Biên Sơn', 'Sa Lý', 'Sơn Động', 'Tây Yên Tử', 'An Lạc', 'Tuấn Đạo', 'Dương Hưu', 'Yên Định', 'Đại Sơn', 'Vân Sơn', 'Kiên Lao', 'Nam Dương', 'Lục Nam', 'Bắc Lũng', 'Bảo Đài', 'Lục Sơn', 'Trường Sơn', 'Cẩm Lý', 'Nghĩa Phương', 'Đông Phú'];
const M4_PERSON = () => [
  { k: 'name', l: 'Họ và Tên', w: 170 }, { k: 'phone', l: 'Số điện thoại', w: 115 }, { k: 'bday', l: 'Ngày sinh', w: 60, pii: 1 }, { k: 'bmonth', l: 'Tháng sinh', w: 60, pii: 1 }, { k: 'byear', l: 'Năm sinh', w: 70, pii: 1 },
  { k: 'old_id_no', l: 'Số CMND', w: 110, pii: 1 }, { k: 'id_no', l: 'Số CCCD', w: 125, pii: 1 }, { k: 'job', l: 'Nghề nghiệp', sug: M4.nghe, w: 170 },
  { k: 'doi_tuong', l: 'Đối tượng chính sách được hưởng nhà ở xã hội', sug: M4.doi_tuong, w: 240 }, { k: 'confirm_org', l: 'Cơ quan xác nhận về đối tượng', w: 180 },
  { k: 'housing', l: 'Điều kiện nhà ở (mô tả đúng hiện trạng nhà ở được VPĐKĐĐ xác nhận)', sug: M4.nha_o, w: 240 },
  { k: 'province', l: 'Tỉnh', w: 100, def: 'Bắc Ninh' }, { k: 'district', l: 'Huyện/ Thành phố', w: 120 }, { k: 'commune', l: 'Thị trấn/xã', w: 150, sug: [...BN_PHUONG.map(x => ['Phường', x]), ...BN_XA.map(x => ['Xã', x])], sugProv: 'Bắc Ninh' },
  { k: 'income', l: 'Điều kiện thu nhập (mô tả theo đúng nội dung Giấy xác nhận)', sug: M4.thu_nhap, w: 240 }];
const SIGN_ST = [['chua_lien_he', 'Chưa liên hệ', 's'], ['da_lien_he', 'Đã liên hệ', 'b'], ['da_hen', 'Đã hẹn', 'v'], ['can_bo_sung', 'Cần bổ sung hồ sơ', 'a'], ['da_ky', 'Đã ký', 'g']];
def('noxh_check', {
  title: 'Hồ sơ mua / thuê NOXH', one: 'hồ sơ', code: 'GD-02', mod: '04', icon: 'fa-list-check', disp: "'NOXH #'||t.id",
  purpose: 'Kiểm tra hồ sơ theo nhóm đối tượng', users: 'Nhân viên quản lý hồ sơ',
  how: 'Tiếp nhận → khai thông tin hộ (chủ hộ + thành viên) theo Mẫu 4 → đối chiếu giấy tờ, ghi số lượng → in biên bản giao nhận → trình xét duyệt → xuất Bảng tổng hợp Mẫu 4',
  rules: 'Checklist phải cập nhật theo quy định hiện hành; không tự kết luận đủ điều kiện pháp lý',
  note: 'App hỗ trợ kiểm tra, quản lý hồ sơ; không thay thế quyết định xét duyệt của cơ quan hoặc người có thẩm quyền.',
  c: ['ho_so', 'truong_phong', 'ban_hang'], u: ['ho_so', 'truong_phong'], a: MGR, fields: [
    // bố cục theo «phiếu hồ sơ mua nhà.xlsx»: 1. thông tin căn hộ → thông tin tài khoản → 2. thông tin khách hàng (chủ hộ 1 dòng như Mẫu 4 + thành viên) → 3. thông tin hồ sơ
    { k: 'project_id', l: 'Tên dự án', t: 'ref', ref: 'project', sec: '1. Thông tin căn hộ', help: 'Chọn căn thì tự lấy theo căn' },
    { k: 'unit_id', l: 'Mã căn hộ', t: 'ref', ref: 'unit', fill: { unit_area: 'area_tt' } },
    { k: 'unit_area', l: 'Diện tích thông thủy (m²)', t: 'num', help: 'Tự cập nhật theo Danh mục sản phẩm' },
    { k: 'sale_check', l: 'Thông báo mở bán', t: 'text', ro: 1 },   // căn có trong thông báo mở bán đã duyệt gần nhất? (cảnh báo, không chặn)
    { k: 'received_on', l: 'Ngày nộp hồ sơ', t: 'date', def: 'today' },
    { k: 'reg_kind', l: 'Hình thức', t: 'sel', def: 'mua', o: M4.hinh_thuc },
    { k: 'unit_text', l: 'Mã căn hộ ngoài danh mục', t: 'text', help: 'Chỉ ghi khi căn chưa có trong Danh mục sản phẩm (VD CTS-L-0511)' },
    { k: 'plan_sign', l: 'Ngày dự kiến ký', t: 'date', sec: 'Lịch ký', help: 'Tự sang hợp đồng và màn Lịch ký hợp đồng' },
    { k: 'sign_place', l: 'Địa điểm ký', t: 'text' },
    { k: 'sign_status', l: 'Tình trạng lịch ký', t: 'sel', def: 'chua_lien_he', o: SIGN_ST },
    { k: 'customer_id', l: 'Khách hàng', t: 'ref', ref: 'customer', sec: 'Thông tin tài khoản', help: 'Để trống → tự khớp theo CCCD / SĐT chủ hộ hoặc tạo khách mới', fill: { bank_account: 'bank_account' } },
    { k: 'reservation_id', l: 'Phiếu giữ chỗ', t: 'ref', ref: 'reservation', fill: { bank_account: 'bank_account' } },
    { k: 'bank_account', l: 'Số tài khoản ngân hàng', t: 'text', pii: 1, help: 'Số tài khoản - Ngân hàng (VD 0070101168008 - Ngân hàng MB). Chọn khách / phiếu → tự điền; sửa ở đây thì khách, phiếu, hợp đồng cập nhật theo' },
    // chủ hộ và thành viên khai cùng các cột Mẫu 4 (03/11/2026: thành viên thêm điều kiện nhà ở, nơi ở, thu nhập); chỉ khác cột Quan hệ với chủ hộ
    { k: 'head', l: '2.1 Thông tin chủ hộ', t: 'json', sec: '2. Thông tin khách hàng', fixed: 1, grid: [...M4_PERSON(), { k: 'relation', l: 'Quan hệ với chủ hộ', w: 90, ro: 1, def: 'Chủ hộ' }] },
    { k: 'members', l: '2.2 Thành viên hộ gia đình (ngoài chủ hộ)', t: 'json', grid: [...M4_PERSON(), { k: 'relation', l: 'Quan hệ với chủ hộ', o: M4.quan_he, w: 120 }] },
    // cột Mẫu 4 của chủ hộ: tự chép từ dòng «2.1 Thông tin chủ hộ» khi lưu (giữ cho bảng tổng hợp / xuất Excel / nhập file Mẫu 4)
    { k: 'old_id_no', l: 'Số CMND cũ (chủ hộ)', t: 'text', pii: 1, noForm: 1 },
    { k: 'job', l: 'Nghề nghiệp (chủ hộ)', t: 'text', noForm: 1 },
    { k: 'doi_tuong', l: 'Đối tượng chính sách được hưởng NOXH', t: 'text', m4: 1, noForm: 1 },
    { k: 'confirm_org', l: 'Cơ quan xác nhận về đối tượng', t: 'text', noForm: 1 },
    { k: 'housing', l: 'Điều kiện nhà ở', t: 'text', m4: 1, noForm: 1 },
    { k: 'income', l: 'Điều kiện thu nhập', t: 'text', m4: 1, noForm: 1 },
    { k: 'province', l: 'Nơi ở hiện tại — Tỉnh', t: 'text', m4: 1, noForm: 1 },
    { k: 'district', l: 'Huyện / Thành phố', t: 'text', noForm: 1 },
    { k: 'commune', l: 'Thị trấn / xã / phường', t: 'text', m4: 1, noForm: 1 },
    { k: 'grp', l: 'Nhóm đối tượng', t: 'sel', opt: 'nhom_noxh', sec: '3. Thông tin hồ sơ', help: 'Để trống → tự suy ra từ đối tượng chính sách' },
    { k: 'items', l: 'Danh mục giấy tờ', t: 'check', src: 'checklist_noxh', srcBy: 'grp', req: 1, qty: 1 },
    { k: 'supplement_note', l: 'Yêu cầu bổ sung', t: 'long' },
    { k: 'supplement_due', l: 'Hạn bổ sung', t: 'date' },
    { k: 'result', l: 'Kết quả kiểm tra', t: 'sel', ro: 1, def: 'chua_kt', o: [['chua_kt', 'Chưa kiểm tra', 's'], ['du', 'Đủ', 'g'], ['can_bo_sung', 'Cần bổ sung', 'a']] },
    { k: 'reviews', l: 'Các bước xét duyệt nội bộ', t: 'json', ro: 1 },
    // 3 bước: Dự thảo → Chờ xét duyệt → Đã duyệt SXD (ghi kết quả được / không được duyệt); chuyển hàng loạt ở màn Hồ sơ mua NOXH
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'nhap', o: [['nhap', 'Dự thảo', 's'], ['cho_duyet', 'Chờ xét duyệt', 'a'], ['da_duyet', 'Đã duyệt SXD', 'g'], ['tu_choi', 'Trả lại', 'r']] },
    { k: 'sxd_submit_on', l: 'Ngày nộp hồ sơ SXD', t: 'date', ro: 1 },
    { k: 'sxd_result', l: 'Kết quả xét duyệt', t: 'sel', ro: 1, o: [['duoc_duyet', 'Đủ điều kiện', 'g'], ['khong_duyet', 'Không đủ điều kiện', 'r']] },
    { k: 'sxd_approved_on', l: 'Ngày được xét duyệt', t: 'date', ro: 1 },
    { k: 'sxd_doc_no', l: 'Số công văn', t: 'text', ro: 1 },
    { k: 'sxd_note', l: 'Ghi chú duyệt SXD', t: 'long', ro: 1 },
    owner('Người tiếp nhận'),
  ], list: ['id', 'received_on', 'customer_id', 'unit_id', 'doi_tuong', 'items', 'result', 'supplement_due', 'status', 'bbgn'],
  lock: ['da_duyet', 'cho_duyet'], lockKeep: ['plan_sign', 'sign_place', 'sign_status'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet', no: 'tu_choi' }, submitLabel: 'Trình xét duyệt', needAll: 'items', custom: 1 },   // custom: không có nút Trình xét duyệt / Duyệt trên hồ sơ — chuyển trạng thái ở màn Hồ sơ mua / thuê NOXH (tick chọn → Chuyển trạng thái)
  acts: [
    { k: 'print_bbgn', l: 'In biên bản giao nhận hồ sơ', icon: 'fa-print', from: '*', roles: ALL, handover: 'noxh' },
    { k: 'review', l: 'Ghi bước kiểm tra', icon: 'fa-clipboard-check', from: ['nhap', 'cho_duyet'], roles: ['ho_so', 'truong_phong'],
    ask: [{ k: 'step', l: 'Bước', t: 'sel', req: 1, o: [['kiem_tra_1', 'Kiểm tra lần 1'], ['kiem_tra_cheo', 'Kiểm tra chéo'], ['doi_chieu_goc', 'Đối chiếu bản gốc']] }, { k: 'conclusion', l: 'Kết luận', t: 'sel', req: 1, o: [['dat', 'Đạt'], ['can_bo_sung', 'Cần bổ sung']] }, { k: 'note', l: 'Ghi chú', t: 'long' }] }],
});
def('cancel_req', {
  title: 'Hủy giao dịch – đổi căn', one: 'đề nghị', mod: '04', icon: 'fa-right-left', disp: 't.code',
  how: 'Lập đề nghị → duyệt → ký thanh lý HĐMB → bàn giao hồ sơ cho kế toán → chi tiền; ngày dự kiến chi trả = ngày ký thanh lý + thời gian chờ, cảnh báo trước 30 ngày',
  c: ['ban_hang', 'truong_phong', 'ho_so'], u: ['ban_hang', 'truong_phong', 'ho_so', 'cong_no', 'ke_toan'], a: MGR, fields: [
    { k: 'code', l: 'Mã đề nghị', t: 'code', prefix: 'HG-{Y}-', pad: 4 },
    // phiếu đề nghị 3 phần: 1. thông tin khách hàng (tự lấy theo hợp đồng / phiếu giữ chỗ) → 2. nội dung đề nghị → 3. chuyển xử lý; ký: người lập – bộ phận kiểm tra – người phê duyệt
    { k: 'unit_id', l: 'Mã căn hộ', t: 'ref', ref: 'unit', sec: '1. Thông tin khách hàng', help: 'Chọn căn → tự lấy hợp đồng / phiếu giữ chỗ đang hiệu lực, khách hàng, dự án, số tiền' },
    { k: 'contract_id', l: 'Mã hợp đồng', t: 'ref', ref: 'contract', help: 'Chọn hợp đồng (hoặc phiếu giữ chỗ) → tự điền khách hàng, dự án, mã căn, số tiền' },
    { k: 'reservation_id', l: 'Phiếu giữ chỗ', t: 'ref', ref: 'reservation', help: 'Khi chưa có hợp đồng' },
    { k: 'cust_name', l: 'Họ tên khách hàng', t: 'text', help: 'Tự lấy theo hợp đồng / phiếu giữ chỗ' },
    { k: 'phone', l: 'Số điện thoại', t: 'text' },
    { k: 'project_id', l: 'Dự án', t: 'ref', ref: 'project' },
    { k: 'kind', l: 'Loại đề nghị', t: 'sel', req: 1, o: [['huy', 'Hủy giao dịch'], ['doi_can', 'Đổi căn'], ['doi_kh', 'Thay đổi khách hàng']], sec: '2. Nội dung đề nghị' },
    { k: 'new_unit_id', l: 'Căn mới', t: 'ref', ref: 'unit', filter: 'con_ban', show: { kind: ['doi_can'] } },
    { k: 'new_customer_id', l: 'Khách hàng mới', t: 'ref', ref: 'customer', show: { kind: ['doi_kh'] } },
    { k: 'money_plan', l: 'Phương án xử lý', t: 'sel', req: 1, def: 'hoan_tien', o: [['hoan_tien', 'Hoàn tiền'], ['chuyen_can_moi', 'Chuyển tiền/bù trừ'], ['khac', 'Khác']] },
    { k: 'money_note', l: 'Diễn giải phương án khác', t: 'text', show: { money_plan: ['khac'] } },
    money('pay_amount', 'Số tiền đề nghị xử lý (đồng)', { help: 'Tự lấy = số tiền khách đã nộp — sửa được' }),
    { k: 'liquidate_on', l: 'Ngày ký thanh lý HĐMB (nếu có)', t: 'date' },
    { k: 'pay_due', l: 'Ngày đề nghị chi trả', t: 'date', help: 'Để trống → ngày ký thanh lý + thời gian chờ chi trả' },
    { k: 'reason', l: 'Lý do', t: 'long' },
    { k: 'handler_dept', l: 'Bộ phận tiếp nhận xử lý', t: 'text', def: 'Phòng Kế toán', sug: ['Phòng Kế toán', 'Phòng Kinh doanh', 'Phòng Pháp chế', 'Ban Giám đốc'], sec: '3. Chuyển xử lý' },
    { k: 'attachments', l: 'Hồ sơ kèm theo', t: 'long', def: 'Đơn đề nghị của khách hàng; bản gốc hợp đồng / phiếu đăng ký; phiếu thu đã nộp' },
    { k: 'note', l: 'Ghi chú', t: 'long' },
    { k: 'wait_days', l: 'Thời gian chờ chi trả (ngày)', t: 'int', def: 30, sec: 'Theo dõi thanh lý & chi trả' },
    { k: 'acct_status', l: 'Tình trạng bàn giao hồ sơ cho kế toán', t: 'sel', def: 'chua', o: [['chua', 'Chưa bàn giao', 'a'], ['da', 'Đã bàn giao', 'g']] },
    { k: 'acct_on', l: 'Ngày bàn giao hồ sơ', t: 'date' },
    { k: 'pay_status', l: 'Tình trạng chi tiền', t: 'sel', def: 'chua_chi', o: [['chua_chi', 'Chưa chi', 'a'], ['mot_phan', 'Chi một phần', 'b'], ['da_chi', 'Đã chi', 'g'], ['khong_chi', 'Không phát sinh chi', 's']] },
    { k: 'paid_on', l: 'Ngày chi tiền thực tế', t: 'date' },
    { k: 'status', l: 'Trạng thái', t: 'sel', o: S.duyet, ro: 1, def: 'nhap' },
  ], list: ['code', 'kind', 'reservation_id', 'contract_id', 'money_plan', 'liquidate_on', 'pay_due', 'pay_amount', 'pay_status', 'status'],
  lock: ['da_duyet', 'cho_duyet'], lockKeep: ['liquidate_on', 'wait_days', 'pay_due', 'pay_amount', 'acct_status', 'acct_on', 'pay_status', 'paid_on', 'note'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet' } },
  acts: [{ k: 'phieu', l: 'In phiếu đề nghị', icon: 'fa-print', from: '*', roles: ALL, url: '/print/cancel_req/:id' }],
  files: [['don_de_nghi', 'Đơn đề nghị của khách', 1]],
});

// ===================== 05. HỒ SƠ & HỢP ĐỒNG =====================
// phân loại theo màn Bravo «Cập nhật hợp đồng căn hộ»: tự lấy theo loại căn (liền kề / shophouse = nhà liền kề)
const HD_PTYPE = [['can_ho', 'Hợp đồng căn hộ chung cư'], ['lien_ke', 'Hợp đồng nhà liền kề']];
const CT_ONLY = { ptype: ['can_ho'] }, LK_ONLY = { ptype: ['lien_ke'] };
// HĐ thuê: ô giá bán ẩn, hiện ô thuê theo BRAVO (ngày bắt đầu / kết thúc, số tháng, đơn giá thuê, số lần thanh toán)
const SALE_K = ['hdmb', 'thue_mua', 'hoan_thien'], CT_SALE = { ptype: ['can_ho'], kind: SALE_K }, LK_SALE = { ptype: ['lien_ke'], kind: SALE_K }, SALE_ONLY = { kind: SALE_K }, RENT_ONLY = { kind: ['thue'] }, RENT_VAY = { kind: ['thue', 'vay'] }, VAY_ONLY = { kind: ['vay'] };
const LIQ_REASON = [['tra_lai', 'Trả lại hẳn'], ['chuyen_ten', 'Chuyển tên hợp đồng']];   // lý do thanh lý hợp đồng
const HD_KIND = [['hdmb', 'HĐ mua bán'], ['vay', 'HĐ vay'], ['thue', 'HĐ thuê'], ['thue_mua', 'HĐ thuê mua'], ['hoan_thien', 'HĐ thỏa thuận hoàn thiện']];
// bên bán (chủ đầu tư) theo BRAVO: chọn Đơn vị / Bên A → tự điền thông tin bên bán (ô trống lấy theo hợp đồng gần nhất cùng Bên A)
// thông tin mặc định bên bán theo bảng phòng Kinh doanh 31/10/2026
const SELLERS = [
  { unit: 'A01: Công ty Cổ phần Cát Tường', name: 'Công ty Cổ phần Cát Tường', addr: 'Tầng 4 tòa Cát Tường New, Đường Lý Thái Tổ, Phường Kinh Bắc, Thành Phố Bắc Ninh', phone: '0829376666', bank_acc: '2567966666', bank_name: 'BIDV - CN Kinh Bắc',
    rep: 'Bà Nguyễn Thị Thanh Dung', title: 'Trưởng phòng Kinh Doanh và Marketing', poa: '05/2026/UQ-CT ký ngày 1/8/2026', projects: [] },
  { unit: 'A02: Công ty Cổ phần TM&ĐTPT Thống Nhất', name: 'Công ty Cổ phần TM&ĐTPT Thống Nhất', addr: 'Tầng 3 tòa Cát Tường New, Đường Lý Thái Tổ, Phường Kinh Bắc, Thành Phố Bắc Ninh', phone: '0829376666', bank_acc: '111653823456', bank_name: 'Vietinbank - CN KCN Quế Võ',
    rep: 'Bà Nguyễn Thị Thanh Dung', title: 'Trưởng phòng Kinh Doanh và Marketing', poa: '06/2026/UQ-TN ký ngày 1/8/2026', projects: ['TNS', 'TN'] },
];
const CHUC_VU = ['Tổng Giám đốc', 'Phó Tổng Giám đốc', 'Giám đốc', 'Phó Giám đốc', 'Trưởng phòng Kinh doanh'];
// danh sách hợp đồng chia nhóm cột như BRAVO «Điều kiện lọc → Xem …» (04/11/2026): [tiêu đề nhóm, [cột], ô tick «Xem …» (bỏ trống = luôn hiện), mặc định hiện]
// cols / head = đủ các nhóm (xuất Excel không gửi cols, máy cũ); màn danh sách tự ghép theo nhóm đang tick
const secList = (secs, more = {}) => ({ secs: secs.map(([h, cols, opt, def]) => ({ h, cols, opt: opt || null, def: def !== false })), cols: secs.flatMap(x => x[1]), head: secs.map(x => [x[0], x[1].length]), ...more });
def('contract', {
  title: 'Sổ theo dõi hợp đồng', one: 'hợp đồng', code: 'HD-01', mod: '05', icon: 'fa-file-contract', disp: "t.number",
  purpose: 'Theo dõi ký kết và lưu hợp đồng', users: 'Nhân viên quản lý hợp đồng',
  how: 'Tạo dự thảo → gửi trình duyệt → duyệt là tự chuyển Đã ký → tải bản ký lưu hồ sơ',
  rules: 'Không thay trực tiếp bản đã ký; số hợp đồng không trùng theo quy tắc',
  c: ['ho_so', 'truong_phong'], a: MGR, search: ['number', 'code'], files: [['ban_ky', 'Bản hợp đồng đã ký'], ['du_thao', 'Dự thảo'], ['giay_to', 'Giấy tờ khách hàng']],
  groups: { can_ho: 'Hợp đồng căn hộ chung cư', lien_ke: 'Hợp đồng nhà liền kề' },
 listPii: 1,
  // danh sách chung cư = bảng BRAVO «Hợp đồng căn hộ.xlsx» (head: tầng tiêu đề trên, [tên, số cột])
  lists: {
    // HĐ thuê (tab riêng ở danh sách chung cư): cột theo BRAVO
    thue: secList([['Hợp đồng', ['number', 'contract_on', 'unit_id']], ['Bên thuê nhà', ['b_name', 'b_id_no', 'b_id_date', 'b_id_place', 'b_addr', 'b_phone', 'b_email'], 'Xem thông tin khách hàng'],
      ['Thông tin căn hộ', ['area_floor', 'area_tt']], ['Thời hạn thuê', ['eff_on', 'exp_on', 'term_months', 'pay_times']], ['Tiền thuê', ['rent_house', 'rent_furn', 'rent'], 'Xem tiền thuê'], ['Giá trị HĐ thuê', ['value', 'deposit']],
      ['Giá trị HĐMB', ['unit_total', 'discount'], 'Xem giá trị HĐMB'], ['', ['nature', 'status']]],
      { dates: [['contract_on', 'Ngày ký'], ['eff_on', 'Ngày bắt đầu thuê'], ['exp_on', 'Ngày kết thúc thuê']], label: { contract_on: 'Ngày ký', unit_id: 'Mã căn hộ', b_name: 'Họ và tên', b_id_no: 'Số CMND / CCCD', b_id_date: 'Ngày cấp', b_id_place: 'Nơi cấp', b_addr: 'Địa chỉ', b_phone: 'Điện thoại', b_email: 'Email', area_floor: 'Diện tích sàn', area_tt: 'Diện tích nền (T.thủy)', value: 'Giá trị HĐ thuê', rent: 'Tổng giá thuê/tháng' } }),
    vay: secList([['Hợp đồng', ['number', 'contract_on', 'unit_id']], ['Bên cho vay (khách hàng)', ['b_name', 'b_id_no', 'b_phone'], 'Xem thông tin khách hàng'], ['Khoản vay', ['value', 'paid', 'loan_recv_on']],
      ['Lãi & gốc', ['eff_on', 'exp_on', 'term_months', 'int_mode', 'loan_rate', 'rent', 'int_period', 'principal_method'], 'Xem lãi & gốc'], ['Liên kết', ['nature', 'link_ids'], 'Xem liên kết', false], ['', ['status']]],
      { dates: [['contract_on', 'Ngày ký'], ['loan_recv_on', 'Ngày nhận tiền vay'], ['exp_on', 'Ngày đáo hạn']], label: { contract_on: 'Ngày ký', unit_id: 'Mã căn hộ', b_name: 'Họ và tên', b_id_no: 'Số CMND / CCCD', b_phone: 'Điện thoại', value: 'Số tiền vay', paid: 'Gốc đã nhận', eff_on: 'Bắt đầu tính lãi', exp_on: 'Ngày đáo hạn', term_months: 'Thời hạn vay (tháng)', rent: 'Tiền thuê/tháng (trả lãi)' } }),
    hoan_thien: secList([['Hợp đồng', ['stt', 'number', 'contract_on', 'unit_id']], ['Thông tin bên mua nhà', ['b_name', 'b_id_no', 'b_id_date', 'b_id_place', 'b_addr', 'b_phone'], 'Xem thông tin khách hàng'],
      ['Giá trị hoàn thiện', ['finish_value', 'discount', 'value']]],   // bên mua: dữ liệu chung với HĐ mua bán cùng căn
      { dates: [['contract_on', 'Ngày ký']], label: { stt: 'STT', number: 'Số HĐ', contract_on: 'Ngày ký', unit_id: 'Mã căn', b_name: 'Họ và tên', b_id_no: 'Số CMND', b_id_date: 'Ngày cấp', b_id_place: 'Nơi cấp', b_addr: 'Địa chỉ', b_phone: 'Điện thoại', finish_value: 'Giá trị trước giảm giá', discount: 'Số giảm giá', value: 'Giá trị sau giảm giá' } }),
    // 13/11/2026 (Tâm): bên mua nhà ngay sau mã căn; bỏ cột Giá trị hoàn thiện (giá HĐMB không gồm hoàn thiện — xem ở tab HĐ hoàn thiện)
    can_ho: secList([['Hợp đồng', ['number', 'kind', 'contract_on']], ['Căn hộ', ['unit_id']], ['Thông tin bên mua nhà', ['b_name', 'b_id_no', 'b_id_date', 'b_id_place', 'b_addr', 'b_phone'], 'Xem thông tin khách hàng'],
      ['Diện tích căn hộ', ['area_tt', 'area_floor']], ['Tiền nhà', ['base_price', 'pretax', 'vat_pct', 'vat_amt', 'after_tax'], 'Xem tiền nhà'],
      ['Hệ số góc', ['corner_amt'], 'Xem tiền hệ số góc', false], ['Phí bảo trì', ['maint_fee'], 'Xem phí bảo trì'],
      ['Giảm giá', ['discount'], 'Xem tiền giảm giá', false], ['Tổng', ['value']],
      ['Hoa hồng', ['commission_amt', 'commission_pct'], 'Xem tiền hoa hồng', false], ['', ['status']]],
      { dates: [['contract_on', 'Ngày ký HĐMB'], ['signed_on', 'Ngày ký thực tế']], label: { contract_on: 'Ngày ký HĐMB', unit_id: 'Mã căn', area_tt: 'Diện tích nền (T.thủy)', area_floor: 'Diện tích sàn', base_price: 'Giá nền (chưa VAT)', value: 'Tổng tiền cả VAT', b_id_no: 'Số CMND', b_addr: 'Địa chỉ', b_phone: 'Điện thoại', status: 'Tình trạng' } }) },
  fields: [
    { k: 'code', l: 'Mã hồ sơ', t: 'code', prefix: 'HS-{Y}-', pad: 4 },
    { k: 'ptype', l: 'Phân loại', t: 'sel', o: HD_PTYPE, def: 'can_ho', sec: 'Chi tiết hợp đồng', help: 'Tự lấy theo loại căn khi chọn căn' },
    { k: 'kind', l: 'Loại hợp đồng', t: 'sel', req: 1, o: HD_KIND, def: 'hdmb' },
    // bản chất giao dịch (khác loại văn bản): HĐ vay / HĐ thuê có thể là bán căn → báo cáo tình trạng căn tính «đã bán»; tiền vay / tiền thuê KHÔNG trừ vào giá mua
    { k: 'nature', l: 'Bản chất giao dịch', t: 'sel', o: [['ban', 'Bán căn hộ', 'g'], ['thue', 'Cho thuê', 'v']], show: { kind: ['thue', 'vay'] }, help: 'Bán căn hộ: căn tính là đã bán ở báo cáo tình trạng căn hộ (văn bản vẫn là HĐ thuê / HĐ vay). Để trống: HĐ thuê = Cho thuê, HĐ vay = Bán' },
    { k: 'contract_on', l: 'Ngày ký hợp đồng mua bán', t: 'date', def: 'today' },
    { k: 'number', l: 'Số hợp đồng', t: 'text', uniq: 1, help: 'Để trống → tự cấp HDCH.YYMM-0001 (chung cư) / HDLK.YYMM-0001 (liền kề)' },
    { k: 'seller_unit', l: 'Đơn vị', t: 'text', def: SELLERS[0].unit, choose: SELLERS.map(s => s.unit), help: 'Chọn căn → tự lấy theo dự án' },
    { k: 'agreement', l: 'Số văn bản thỏa thuận sở hữu chung', t: 'text', help: 'Số VBTT về sở hữu chung của vợ chồng (nếu có) — in vào HĐMB' },
    { k: 'unit_id', l: 'Mã căn hộ', t: 'ref', ref: 'unit', req: 1, dep: 'building_id',
      fill: { area_tt: 'area_tt', base_price: 'base_price', pretax: 'pretax', vat_pct: 'vat_pct', vat_amt: 'tax_amt', after_tax: 'price_net', maint_fee: 'maint_fee', finish_value: 'finish_value', value: 'total_price', area_land: 'area_dat', area_build: 'area_xd' } },
    { k: 'reservation_id', l: 'Phiếu giữ chỗ', t: 'ref', ref: 'reservation', ro: 1 },
    // bên mua nhà ở
    { k: 'customer_id', l: 'Khách hàng (chủ hợp đồng)', t: 'ref', ref: 'customer', req: 1, sec: 'Bên mua nhà ở',
      fill: { b_id_no: 'id_no', b_id_date: 'id_date', b_id_place: 'id_place', b_addr: 'address', b_phone: 'phone', b_email: 'email', b_bank_acc: 'bank_account' } },
    { k: 'b_id_no', l: 'Số CMND / CCCD', t: 'text', pii: 1 },
    { k: 'b_id_date', l: 'Ngày cấp', t: 'date', pii: 1 },
    { k: 'b_id_place', l: 'Nơi cấp', t: 'text', pii: 1 },
    { k: 'b_addr', l: 'Địa chỉ liên hệ', t: 'text' },
    { k: 'b_perm_addr', l: 'Hộ khẩu thường trú', t: 'text' },
    { k: 'b_temp_addr', l: 'Hộ khẩu tạm trú', t: 'text' },
    { k: 'b_phone', l: 'Điện thoại', t: 'text' },
    { k: 'b_email', l: 'Email', t: 'text' },
    { k: 'b_bank_acc', l: 'TK ngân hàng', t: 'text', pii: 1 },
    { k: 'b_bank_name', l: 'Tên ngân hàng', t: 'text' },
    { k: 'request_on', l: 'Ngày đề nghị mua', t: 'date' },
    { k: 'co_owner', l: 'Đồng sở hữu', t: 'text', help: 'Họ tên người đồng sở hữu (nếu có)' },
    // 13/11/2026: giấy tờ người đồng sở hữu (vợ / chồng) + ngày VBTT — nhập 1 lần ở HĐ, bộ hồ sơ tự in (trước luôn in «……»)
    { k: 'co_owner_id_no', l: 'Số CCCD người đồng sở hữu', t: 'text', pii: 1 },
    { k: 'co_owner_id_date', l: 'Ngày cấp (người đồng sở hữu)', t: 'date', pii: 1 },
    { k: 'co_owner_id_place', l: 'Nơi cấp (người đồng sở hữu)', t: 'text', pii: 1 },
    { k: 'agreement_on', l: 'Ngày văn bản thỏa thuận sở hữu chung', t: 'date' },
    // bên bán nhà ở
    { k: 's_name', l: 'Bên A', t: 'text', def: SELLERS[0].name, choose: SELLERS.map(s => s.name), sec: 'Bên bán nhà ở', help: 'Chọn Bên A → tự điền các ô bên bán' },
    { k: 's_addr', l: 'Địa chỉ liên hệ (bên bán)', t: 'text', def: SELLERS[0].addr },
    { k: 's_phone', l: 'Điện thoại (bên bán)', t: 'text' },
    { k: 's_tax', l: 'MST', t: 'text' },
    { k: 's_bank_acc', l: 'TK ngân hàng (bên bán)', t: 'text' },
    { k: 's_bank_name', l: 'Tên ngân hàng (bên bán)', t: 'text' },
    { k: 's_rep', l: 'Người đại diện', t: 'text' },
    { k: 's_title', l: 'Chức vụ', t: 'text', sug: CHUC_VU },
    { k: 's_poa', l: 'Giấy UQ số', t: 'text' },
    money('commission_amt', 'Tiền hoa hồng'),
    { k: 'commission_pct', l: 'Tỷ lệ hoa hồng (%)', t: 'num' },
    money('common_area_amt', 'Tiền diện tích chung'),
    { k: 'all_signed', l: 'Các bên đã ký', t: 'bool' },
    // thông tin chi tiết — chung cư: giá nền × thông thủy / giá sàn; liền kề: đất + xây dựng
    { k: 'building_id', l: 'Số bảng giá', t: 'ref', ref: 'building', show: SALE_ONLY, sec: 'Thông tin chi tiết', help: 'Bảng giá theo tòa trong Danh mục sản phẩm — chọn căn tự ra, chọn tòa trước thì lọc căn' },
    { k: 'price_policy_id', l: 'Chính sách giá', t: 'ref', ref: 'price_policy', hide: 1 },   // máy chủ tự lấy theo phiếu giữ chỗ / chính sách đang phát hành
    money('base_price', 'Giá nền (chưa VAT) đ/m²', { show: CT_SALE }),
    money('base_orig', 'Giá nền gốc trước giảm giá (đ/m²)', { noForm: 1 }),   // có giảm giá: giá nền trên form = giá chia ngược từ tổng sau giảm; giữ giá gốc để sửa tiền giảm vẫn tính đúng
    { k: 'area_tt', l: 'Diện tích nền (thông thủy) m²', t: 'num', show: CT_ONLY },
    money('floor_price', 'Giá sàn đ/m²', { show: CT_ONLY, hide: 1 }),   // bỏ khỏi form 31/10/2026
    { k: 'area_floor', l: 'Diện tích sàn m²', t: 'num', show: CT_ONLY },
    { k: 'area_land', l: 'Diện tích đất m²', t: 'num', show: LK_SALE },
    money('land_price', 'Đơn giá đất đ/m²', { show: LK_SALE }),
    money('land_amt', 'Tiền sử dụng đất', { show: LK_SALE }),
    { k: 'area_build', l: 'Diện tích xây dựng m²', t: 'num', show: LK_SALE },
    money('build_price', 'Đơn giá xây dựng đ/m²', { show: LK_SALE }),
    money('build_amt', 'Giá trị xây dựng', { show: LK_SALE }),
    money('discount', 'Tiền giảm giá', { show: { kind: [...SALE_K, 'thue', 'vay'] }, help: 'Trừ thẳng vào Tổng tiền (giá trị hợp đồng). HĐ mua bán: chia ngược ra giá trước thuế, thuế, bảo trì. HĐ thuê: không trừ vào tiền thuê' }),
    // HĐ thuê (04/11/2026): giá trị căn hộ theo Danh mục sản phẩm − giảm giá — CHỈ ĐỂ THÔNG TIN (tiền thuê, tiến độ thu, công nợ vẫn = tiền thuê/tháng × số tháng)
    money('unit_total', 'Giá trị HĐMB', { show: RENT_VAY, help: 'Giá trị nếu mua căn: tự lấy theo mã căn ở Danh mục sản phẩm (Tổng giá căn hộ = sau thuế + phí bảo trì + hoàn thiện) rồi trừ thẳng Tiền giảm giá; sửa được. Chỉ để thông tin — tiền thuê vẫn tính theo tiền thuê/tháng × số tháng' }),
    money('pretax', 'Tiền trước thuế', { show: SALE_ONLY }),
    { k: 'vat_pct', l: 'Thuế suất %', t: 'num', show: SALE_ONLY },
    money('vat_amt', 'Tiền thuế', { help: 'Để trống → trước thuế × thuế suất', show: SALE_ONLY }),
    money('after_tax', 'Tiền sau thuế', { help: 'Để trống → trước thuế + tiền thuế', show: SALE_ONLY }),
    money('finish_value', 'Giá trị hoàn thiện', { show: SALE_ONLY }),
    money('maint_fee', 'Phí bảo trì', { show: SALE_ONLY }),
    // bỏ khỏi form 03/11/2026: phí bảo trì thu ở dòng riêng cố định trong Lần thanh toán (có hạn riêng); chỉ còn dùng cho lịch cũ cộng phí bảo trì vào đợt (mặc định đợt 3)
    { k: 'maint_dot', l: 'Đợt thu phí bảo trì', t: 'int', def: 3, hide: 1, show: { kind: ['hdmb', 'thue_mua'] } },
    { k: 'late_rate', l: 'Lãi suất quá hạn (%/năm)', t: 'num', show: { kind: ['hdmb'] }, help: 'Lãi chậm thanh toán theo hợp đồng — dùng tính lãi quá hạn ở Theo dõi công nợ. Sửa được cả khi hợp đồng đã ký' },   // điền ở Theo dõi hợp đồng › HĐ mua bán; lãi quá hạn = còn lại × số ngày quá hạn × lãi suất / 365
    { k: 'corner_pct', l: 'Hệ số góc %', t: 'num', show: SALE_ONLY },
    money('corner_amt', 'Tiền hệ số góc', { show: SALE_ONLY }),
    { k: 'eff_on', l: 'Ngày bắt đầu thuê', t: 'date', show: RENT_VAY },   // HĐ vay: ngày bắt đầu tính lãi (bắt buộc với HĐ thuê — kiểm ở biz)
    { k: 'exp_on', l: 'Ngày kết thúc thuê', t: 'date', show: RENT_VAY },   // HĐ vay: ngày đáo hạn
    { k: 'term_months', l: 'Thời hạn thuê (tháng)', t: 'int', show: RENT_VAY, help: 'Tự tính theo ngày bắt đầu – kết thúc' },
    { k: 'pay_times', l: 'Số kỳ thanh toán', t: 'int', show: RENT_ONLY, help: 'Mỗi kỳ thu = số tháng của kỳ × tiền thuê/tháng, hạn thanh toán là ngày đầu mỗi kỳ' },
    // HĐ thuê (04/11/2026): tiền thuê tách tiền thuê nhà + tiền thuê nội thất; Tổng giá thuê/tháng (rent) = 2 khoản cộng lại → tổng tiền thuê = rent × số tháng
    money('rent_house', 'Tiền thuê nhà/tháng', { show: RENT_ONLY }),
    money('rent_furn', 'Tiền thuê nội thất/tháng', { show: RENT_ONLY }),
    money('rent', 'Tiền thuê/tháng', { show: RENT_ONLY, help: 'Giá trị HĐ thuê = tổng giá thuê/tháng × thời hạn thuê' }),
    money('deposit', 'Tiền đặt cọc', { show: RENT_ONLY, help: 'Tiền đặt cọc thuê theo hợp đồng — không cộng vào Giá trị HĐ thuê' }),   // 05/11/2026   // HĐ vay bỏ ô này khỏi form 04/11/2026: lãi theo tiền thuê/tháng của HĐ thuê đi kèm (tick chọn)
    // HĐ vay (công ty vay tiền của khách, bản chất thường là bán căn): giải ngân gốc = các đợt ở bảng Lần thanh toán; lãi trả cho khách theo lịch kd_loan_pay
    { k: 'loan_recv_on', l: 'Ngày nhận tiền vay', t: 'date', show: VAY_ONLY },
    { k: 'loan_tranches', l: 'Số đợt giải ngân gốc', t: 'int', show: VAY_ONLY, help: 'Các đợt khách chuyển tiền gốc nhập ở bảng «Các đợt giải ngân gốc» bên dưới' },
    { k: 'int_mode', l: 'Lãi trả bằng', t: 'sel', o: [['tien_thue', 'Tiền thuê căn hộ (mỗi tháng = 1 tháng tiền thuê)'], ['lai_suat', 'Theo lãi suất %/năm']], show: VAY_ONLY },
    { k: 'loan_rate', l: 'Lãi suất (%/năm)', t: 'num', show: { kind: ['vay'], int_mode: ['lai_suat'] } },
    { k: 'int_period', l: 'Kỳ trả lãi', t: 'sel', o: [['1', 'Hàng tháng'], ['3', 'Hàng quý (3 tháng)'], ['6', '6 tháng'], ['12', 'Hàng năm'], ['0', 'Một lần khi đáo hạn']], show: VAY_ONLY },
    { k: 'principal_method', l: 'Phương thức trả gốc', t: 'sel', o: [['dao_han', 'Trả một lần khi đáo hạn'], ['theo_ky', 'Trả dần theo kỳ trả lãi'], ['thoa_thuan', 'Theo thỏa thuận (không lập lịch)']], show: VAY_ONLY },
    { k: 'int_note', l: 'Cách tính lãi theo hợp đồng', t: 'text', show: VAY_ONLY, help: 'Cơ sở tính lãi, số ngày tính lãi, các điều chỉnh theo phụ lục…' },
    { k: 'link_ids', l: 'Hợp đồng thuê / vay đi kèm', t: 'refs', ref: 'contract', show: RENT_VAY, help: 'HĐ vay tick chọn HĐ thuê đi kèm và ngược lại — chọn ở bên nào bên kia tự cập nhật' },
    money('value', 'Tổng tiền (giá trị hợp đồng)', { req: 1, help: 'Chung cư có giá nền: tự tính = tiền sau thuế + phí bảo trì + giá trị hoàn thiện' }),
    { k: 'closed', l: 'Hợp đồng đóng', t: 'bool', show: RENT_VAY, noForm: 1 },   // HĐMB bỏ ô này (03/11/2026); HĐ thuê / vay bỏ khỏi form 04/11/2026 (giữ cột dữ liệu cũ)
    money('sale_price', 'Giá bán căn hộ', { show: { kind: ['thue', 'vay'], nature: ['ban'] }, help: 'Giá bán của giao dịch (chưa có HĐMB) — để trống: lấy theo Danh mục sản phẩm' }),
    { k: 'plan_hdmb', l: 'Dự kiến ký HĐMB', t: 'date', show: { kind: ['thue', 'vay'], nature: ['ban'] }, noForm: 1 },   // bỏ khỏi form + CN-06 04/11/2026 (giữ cột dữ liệu cũ)
    { k: 'prev_id', l: 'Chuyển tiếp từ hợp đồng', t: 'ref', ref: 'contract', hide: 1,   // bỏ khỏi form (03/11/2026) — máy tự nối khi lưu HĐMB
      help: 'HĐ vay / HĐ thuê (bản chất bán) trước đó của căn — chỉ để nối giao dịch, tiền đã thu theo hợp đồng đó KHÔNG trừ vào giá mua. Để trống: tự nối khi căn có' },
    { k: 'next_id', l: 'Đã chuyển sang hợp đồng', t: 'ref', ref: 'contract', ro: 1, show: { kind: ['thue', 'vay'], nature: ['ban'] } },
    { k: 'cn', l: 'CN', t: 'bool', hide: 1 },   // bỏ khỏi form HĐMB (03/11/2026) — giữ cột cho dữ liệu cũ
    { k: 'vbtt_hold', l: 'Tạm đóng VBTT', t: 'bool', hide: 1 },
    { k: 'new_schedule', l: 'Lần TT · % · Giá trị VND', t: 'json', sec: 'Lần thanh toán', help: 'Nhập tỷ lệ % → giá trị tự tính theo Tổng tiền' },
    // HĐ thuê / HĐ vay bản chất bán căn (07/11/2026): tiến độ khách trả tiền mua nhà theo Giá trị HĐMB → lên Bảng tổng hợp công nợ.
    //  Đã thu = phiếu thu của chính hợp đồng (HĐ vay: gốc khách đã chuyển tính là tiền mua nhà). Khi ký HĐMB thật: thanh lý HĐ thuê / vay, lập HĐMB mới.
    { k: 'sale_on', l: 'Có tiến độ thu tiền HĐMB', t: 'bool', show: RENT_VAY, help: 'Tick khi HĐ thuê / HĐ vay là để bán căn — sổ ra bảng tiến độ thu tiền HĐMB' },   // 07/11/2026
    { k: 'sale_sched', l: 'Đợt · % · Giá trị VND (theo Giá trị HĐMB)', t: 'json', show: { kind: ['thue', 'vay'], sale_on: [true] }, help: 'Nhập tỷ lệ % → giá trị tự tính theo Giá trị HĐMB. Số phải thu lên Bảng tổng hợp ở Theo dõi công nợ; đã thu = phiếu thu của hợp đồng này (HĐ vay: gốc khách đã chuyển)' },
    { k: 'pay_method', l: 'Phương thức thanh toán', t: 'text' },
    { k: 'plan_sign', l: 'Ngày dự kiến ký', t: 'date', show: LK_ONLY },   // chung cư: nhập ở Hồ sơ mua NOXH, tự sang hợp đồng
    { k: 'sign_place', l: 'Địa điểm ký', t: 'text', show: LK_ONLY },
    { k: 'sign_status', l: 'Tình trạng lịch ký', t: 'sel', def: 'chua_lien_he', o: SIGN_ST, show: LK_ONLY },
    { k: 'signed_on', l: 'Ngày ký thực tế', t: 'date', ro: 1 },
    // ghi khi bấm Thanh lý; hợp đồng đã thanh lý vẫn sửa được 3 ô này (lockKeep)
    { k: 'liquidated_on', l: 'Ngày thanh lý', t: 'date', req: 1, show: { status: ['thanh_ly'] } },
    { k: 'liquidate_reason', l: 'Lý do thanh lý', t: 'sel', o: LIQ_REASON, req: 1, show: { status: ['thanh_ly'] } },
    { k: 'liquidate_note', l: 'Ghi chú thanh lý', t: 'long', show: { status: ['thanh_ly'] } },
    { k: 'loan_status', l: 'Tình trạng vay vốn', t: 'sel', show: SALE_ONLY, o: [['co_vay', 'Có vay'], ['khong_vay', 'Không vay']] },
    { k: 'loan_doc3', l: 'Chứng từ 3 bên', t: 'sel', show: { loan_status: ['co_vay'] }, o: [['da_co', 'Đã có'], ['chua_co', 'Chưa có']] },
    { k: 'loan_bank', l: 'Ngân hàng cho vay', t: 'text', show: { loan_status: ['co_vay'] }, req: 0, sug: ['BIDV', 'Vietinbank', 'Vietcombank', 'Agribank', 'MB Bank', 'Techcombank', 'VPBank', 'ACB', 'Sacombank', 'TPBank', 'Ngân hàng Chính sách xã hội'] },
    { k: 'package_id', l: 'Gói hoàn thiện', t: 'ref', ref: 'package', show: { kind: ['hoan_thien'] } },
    { k: 'design_change', l: 'Thay đổi thiết kế', t: 'long', show: { kind: ['hoan_thien'] } },
    { k: 'accept_on', l: 'Ngày nghiệm thu', t: 'date', show: { kind: ['hoan_thien'] } },
    { k: 'pay_period', l: 'Kỳ thanh toán', t: 'sel', o: [['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm']], hide: 1 },
    { k: 'free_months', l: 'Miễn tiền thuê (tháng)', t: 'int', hide: 1 },
    owner('Nhân viên KD'),
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'du_thao', o: [['du_thao', 'Dự thảo', 's'], ['cho_duyet', 'Đang rà soát', 'a'], ['cho_ky', 'Chờ ký', 'b'], ['tu_choi', 'Trả lại dự thảo', 'r'], ['da_ky', 'Đã ký', 'g'], ['thanh_ly', 'Đã thanh lý', 't'], ['huy', 'Đã hủy', 's']] },
  ], list: ['number', 'contract_on', 'kind', 'unit_id', 'customer_id', 'value', 'plan_sign', 'sign_status', 'signed_on', 'status'],
  lock: ['da_ky', 'thanh_ly', 'huy'], lockKeep: ['sign_status', 'sign_place', 'plan_sign', 'owner_id', 'late_rate', 'new_schedule', 'sale_on', 'sale_sched', 'loan_status', 'loan_bank', 'loan_doc3', 'liquidated_on', 'liquidate_reason', 'liquidate_note'],
  // đã trình duyệt / chờ ký: nhân viên chỉ sửa được lần thanh toán (+ lockKeep); quản lý vẫn sửa được
  softLock: { st: ['cho_duyet', 'cho_ky'], keep: ['sign_status', 'sign_place', 'plan_sign', 'new_schedule', 'loan_status', 'loan_bank', 'loan_doc3'], boss: MGR },
  flow: { field: 'status', submit: ['du_thao', 'tu_choi'], approve: { ok: 'da_ky' }, submitLabel: 'Gửi trình duyệt' },
  acts: [
    { k: 'schedule', l: 'Lập lịch thanh toán', icon: 'fa-calendar-days', from: ['du_thao', 'tu_choi'], roles: ['ho_so', 'cong_no', 'truong_phong'], noBtn: 1 },   // bỏ nút 04/11/2026: lịch thanh toán soạn ở «Lần thanh toán» trong form hợp đồng (Sửa)
    { k: 'liquidate', l: 'Thanh lý', icon: 'fa-box-archive', from: ['da_ky'], roles: MGR, ask: [{ k: 'liquidated_on', l: 'Ngày thanh lý', t: 'date', req: 1, def: 'today' }, { k: 'liquidate_reason', l: 'Lý do', t: 'sel', o: LIQ_REASON, req: 1 }, { k: 'liquidate_note', l: 'Ghi chú', t: 'long' }] },
    { k: 'print', l: 'In theo mẫu', icon: 'fa-print', from: '*', roles: ALL },
  ],
});
def('installment', {
  title: 'Lịch thanh toán hợp đồng', one: 'kỳ thu', code: 'CN-02', mod: '06', icon: 'fa-calendar-check', disp: "CASE WHEN coalesce(t.is_maint, false) THEN 'Phí bảo trì' || coalesce(' — ' || nullif(t.name, 'Phí bảo trì'), '') WHEN t.name ~ '^[[:space:]]*(Đợt|đợt|ĐỢT|Kỳ|kỳ|KỲ|Lần|lần|LẦN)[[:space:]]*[0-9]' THEN t.name ELSE 'Đợt ' || (SELECT count(*) FROM kd_installment ix_ WHERE ix_.contract_id = t.contract_id AND ix_.active = t.active AND NOT coalesce(ix_.is_maint, false) AND ix_.seq <= t.seq) || coalesce(' — ' || nullif(t.name, ''), '') END||' · hạn '||to_char(t.due_on,'DD/MM/YYYY')||' · '||replace(to_char(t.amount,'FM999,999,999,999'),',','.')",   // «Đợt 1 — diễn giải · hạn · số tiền» (06/11/2026); tên đã có «Đợt n» thì giữ nguyên
  purpose: 'Quản lý từng kỳ phải thu', users: 'Nhân viên hợp đồng / công nợ',
  how: 'Tạo từ điều khoản → kiểm tra tổng kỳ → phát hành → đối soát thực thu',
  rules: 'Tổng các kỳ khớp nghĩa vụ phải thu; xử lý ngày nghỉ và phụ lục theo quy tắc được duyệt',
  c: [], u: [], d: [], order: 't.contract_id, t.seq', fields: [
    { k: 'contract_id', l: 'Hợp đồng', t: 'ref', ref: 'contract', req: 1 },
    { k: 'seq', l: 'Kỳ thu', t: 'int', req: 1 },
    { k: 'name', l: 'Tên đợt', t: 'text' },
    { k: 'due_on', l: 'Ngày đến hạn', t: 'date', req: 1 },
    { k: 'pct', l: 'Tỷ lệ (%)', t: 'num' },
    money('amount', 'Số tiền', { req: 1 }),
    { k: 'is_maint', l: 'Dòng phí bảo trì', t: 'bool', ro: 1, hide: 1, def: false },
    // đợt bàn giao (13/11/2026): mỗi HĐMB tự chọn đợt nào là đợt thu khi bàn giao (đợt 2, 3, 4… tùy HĐ) + số ngày được nộp kể từ ngày bàn giao (trống = theo thông báo bàn giao)
    { k: 'is_bg', l: 'Đợt bàn giao', t: 'bool', ro: 1, hide: 1, def: false },
    { k: 'bg_days', l: 'Số ngày nộp kể từ bàn giao', t: 'int', ro: 1, hide: 1 },   // HĐMB: phí bảo trì thu ở dòng riêng cố định (không cộng vào đợt nào)
    { k: 'src', l: 'Căn cứ', t: 'sel', ro: 1, def: 'hop_dong', o: [['hop_dong', 'Hợp đồng', 'b'], ['phu_luc', 'Phụ lục', 'v']] },
    { k: 'active', l: 'Hiệu lực', t: 'bool', ro: 1, def: true },
  ], list: ['contract_id', 'seq', 'name', 'due_on', 'pct', 'amount', 'paid', 'pay_status', 'src'],
});
def('loan_pay', {
  title: 'Lịch trả lãi & gốc HĐ vay', one: 'kỳ trả', code: 'CN-07', mod: '06', icon: 'fa-hand-holding-dollar', disp: "CASE WHEN t.kind = 'goc' THEN 'Trả gốc' ELSE 'Lãi kỳ '||t.seq END||' · hạn '||to_char(t.due_on,'DD/MM/YYYY')||' · '||replace(to_char(t.amount,'FM999,999,999,999'),',','.')",
  purpose: 'Theo dõi tiền lãi, tiền gốc công ty phải trả khách theo HĐ vay', users: 'Kế toán / trưởng phòng',
  how: 'Lưu HĐ vay → máy lập lịch theo kỳ trả lãi → đến hạn trả thì ghi nhận ngày trả, số tiền đã trả',
  rules: 'Lãi = 1 tháng tiền thuê / tháng (hoặc theo lãi suất); kỳ đã ghi nhận trả không bị lập lại. Số đã trả lấy từ Phiếu chi (trả lãi / trả gốc) — không ghi tay',
  c: [], u: ['ke_toan', 'truong_phong', 'ho_so'], d: [], order: 't.contract_id, t.due_on, t.kind DESC, t.seq', fields: [
    { k: 'contract_id', l: 'Hợp đồng vay', t: 'ref', ref: 'contract', req: 1, ro: 1 },
    { k: 'seq', l: 'Kỳ', t: 'int', ro: 1 },
    { k: 'kind', l: 'Khoản trả', t: 'sel', ro: 1, o: [['lai', 'Tiền lãi', 'b'], ['goc', 'Trả gốc', 'v']] },
    { k: 'period_from', l: 'Tính từ', t: 'date', ro: 1 },
    { k: 'period_to', l: 'Đến', t: 'date', ro: 1 },
    { k: 'due_on', l: 'Hạn trả', t: 'date', ro: 1 },
    money('amount', 'Phải trả', { ro: 1 }),
    { k: 'paid_on', l: 'Ngày đã trả', t: 'date', ro: 1, help: 'Theo phiếu chi' },
    money('paid_amt', 'Số tiền đã trả', { ro: 1, help: 'Cộng các phiếu chi hợp lệ của kỳ' }),
    { k: 'note', l: 'Ghi chú', t: 'text' },
  ], list: ['contract_id', 'seq', 'kind', 'period_from', 'period_to', 'due_on', 'amount', 'paid_on', 'paid_amt', 'note'],
});
def('contract_change', {
  title: 'Điều chỉnh – phụ lục hợp đồng', one: 'đề nghị', code: 'HD-02', mod: '05', icon: 'fa-file-pen', disp: 't.code',
  purpose: 'Kiểm soát thay đổi sau ký', users: 'Nhân viên phụ trách / Trưởng phòng',
  how: 'Lập đề nghị → rà soát → duyệt → lập phụ lục → ký → cập nhật liên quan',
  rules: 'Không cập nhật công nợ trước khi điều chỉnh có hiệu lực',
  c: ['ho_so', 'cong_no', 'truong_phong', 'ban_hang'], a: MGR, files: [['don_de_nghi', 'Đơn đề nghị', 1], ['phu_luc', 'Phụ lục đã ký']], fields: [
    { k: 'code', l: 'Mã đề nghị', t: 'code', prefix: 'DC-{Y}-', pad: 4 },
    { k: 'contract_id', l: 'Hợp đồng gốc', t: 'ref', ref: 'contract', req: 1, filter: 'da_ky' },
    { k: 'kind', l: 'Nội dung điều chỉnh', t: 'sel', req: 1, o: [['tien_do', 'Tiến độ thanh toán'], ['gia_tri', 'Giá trị hợp đồng'], ['khach_hang', 'Thông tin khách hàng'], ['noi_that', 'Danh mục nội thất'], ['khac', 'Khác']] },
    { k: 'content', l: 'Nội dung đề nghị', t: 'long', req: 1 },
    { k: 'reason', l: 'Lý do', t: 'long', req: 1 },
    money('value_before', 'Giá trị trước', { ro: 1 }),
    money('value_after', 'Giá trị sau', { help: 'Để trống nếu không đổi giá trị' }),
    { k: 'new_schedule', l: 'Tiến độ thanh toán mới', t: 'json', show: { kind: ['tien_do', 'gia_tri'] } },
    { k: 'approver_id', l: 'Cấp phê duyệt', t: 'user', req: 1, roles: MGR },
    { k: 'appendix_no', l: 'Số phụ lục', t: 'text', ro: 1 },
    { k: 'appendix_on', l: 'Ngày ký phụ lục', t: 'date', ro: 1 },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'nhap', o: [...S.duyet, ['hieu_luc', 'Phụ lục có hiệu lực', 't']] },
  ], list: ['code', 'contract_id', 'kind', 'value_before', 'value_after', 'approver_id', 'appendix_no', 'status'],
  lock: ['cho_duyet', 'da_duyet', 'hieu_luc'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet' } },
  acts: [{ k: 'appendix', l: 'Ký phụ lục – cho hiệu lực', icon: 'fa-stamp', from: ['da_duyet'], roles: ['ho_so', 'truong_phong'],
    ask: [{ k: 'appendix_no', l: 'Số phụ lục', t: 'text', req: 1 }, { k: 'appendix_on', l: 'Ngày ký phụ lục', t: 'date', req: 1, def: 'today' }], help: 'Cần tải «Phụ lục đã ký». Sau bước này lịch công nợ mới cập nhật.' }],
});

// ===================== 06. CÔNG NỢ =====================
// nhóm thu của phiếu thu (06/11/2026) — gợi ý theo loại hợp đồng / đợt thu
const RC_GRP = [['tien_can', 'Tiền căn hộ (HĐMB)', 'b'], ['phi_bao_tri', 'Phí bảo trì', 'v'], ['hoan_thien', 'Tiền hoàn thiện', 'a'], ['tien_thue', 'Tiền thuê', 't'], ['dat_coc', 'Tiền đặt cọc', 's'], ['goc_vay', 'Tiền gốc HĐ vay', 'g'], ['khac', 'Khác', 's']];
def('receipt', {
  title: 'Phiếu thu', one: 'phiếu thu', code: 'CN-09', mod: '06', icon: 'fa-receipt', disp: 't.voucher_no',
  note: 'Phòng Kinh doanh tự ghi để theo dõi tiến độ thu tiền theo hợp đồng (không phải chứng từ kế toán): khách đã nộp bao nhiêu, ngày nào, cho đợt nào. HĐ vay: phiếu thu = tiền gốc khách chuyển cho công ty. Có thể nhập tệp Excel. Ghi sai thì hủy phiếu có lý do rồi lập lại.',
  c: ['cong_no', 'ho_so', 'ban_hang', 'truong_phong', 'ke_toan'], u: ['cong_no', 'ho_so', 'truong_phong'], d: [], order: 't.voucher_date desc', search: ['voucher_no', 'content'], fields: [
    { k: 'voucher_no', l: 'Số phiếu thu', t: 'code', prefix: 'PT-{Y}-', pad: 4, manual: 1, help: 'Để trống → tự cấp (PT-2026-0001…)' },
    { k: 'voucher_date', l: 'Ngày thu', t: 'date', req: 1, def: 'today' },
    { k: 'contract_id', l: 'Mã hợp đồng', t: 'ref', ref: 'contract', req: 1, sec: '1. Hợp đồng – khách hàng', help: 'Chọn hợp đồng (hoặc mã căn) → tự điền mã căn, khách hàng, dự án, loại hợp đồng' },
    { k: 'unit_id', l: 'Mã căn hộ', t: 'ref', ref: 'unit', help: 'Chọn căn → tự lấy hợp đồng của căn' },
    { k: 'cust_code', l: 'Mã khách hàng', t: 'text', help: 'Tự lấy theo hợp đồng' },
    { k: 'cust_name', l: 'Họ tên khách hàng', t: 'text', help: 'Tự lấy theo hợp đồng' },
    { k: 'project_name', l: 'Dự án', t: 'text', help: 'Tự lấy theo hợp đồng' },
    { k: 'ct_kind', l: 'Loại hợp đồng', t: 'sel', o: HD_KIND, help: 'Tự lấy theo hợp đồng' },
    { k: 'grp', l: 'Nhóm thu', t: 'sel', sec: '2. Nội dung thu', o: RC_GRP, help: 'Tự gợi ý theo loại hợp đồng / đợt thu — sửa được' },
    { k: 'installment_id', l: 'Đợt thu', t: 'ref', ref: 'installment', dep: 'contract_id', help: 'Chọn đợt → tự điền số tiền còn phải thu của đợt. Để trống = tự phân bổ vào đợt đến hạn sớm nhất' },
    money('amount', 'Số tiền', { req: 1 }),
    { k: 'content', l: 'Nội dung thanh toán', t: 'text' },
    { k: 'src', l: 'Nguồn', t: 'sel', ro: 1, def: 'thu_cong', o: [['bravo', 'Bravo', 'b'], ['misa', 'MISA', 'v'], ['thu_cong', 'Phòng KD nhập', 's']] },
    { k: 'synced_at', l: 'Ngày chốt dữ liệu', t: 'dt', ro: 1 },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'hop_le', o: [['hop_le', 'Hợp lệ', 'g'], ['huy', 'Đã hủy', 'r']] },
    { k: 'void_reason', l: 'Lý do hủy', t: 'text', ro: 1 },
  ], list: ['voucher_no', 'voucher_date', 'contract_id', 'unit_id', 'cust_code', 'cust_name', 'grp', 'installment_id', 'amount', 'content', 'status'],
  acts: [{ k: 'void', l: 'Hủy phiếu thu', icon: 'fa-ban', from: ['hop_le'], roles: ['cong_no', 'ho_so', 'truong_phong'], danger: 1, ask: [{ k: 'reason', l: 'Lý do hủy', t: 'long', req: 1 }] }],
});
// Phiếu chi (06/11/2026): tiền công ty chi ra theo hợp đồng → Theo dõi công nợ tự cập nhật
//  trả lãi / trả gốc HĐ vay → số đã trả của kỳ (kd_loan_pay); hoàn tiền → đề xuất hoàn tiền «Kế toán đã thực hiện»; hoàn cọc HĐ thuê
def('payment', {
  title: 'Phiếu chi', one: 'phiếu chi', code: 'CN-10', mod: '06', icon: 'fa-money-bill-wave', disp: 't.voucher_no',
  note: 'Phòng Kinh doanh tự ghi để theo dõi tiến độ (không phải chứng từ kế toán): tiền công ty đã trả khách theo hợp đồng — trả lãi / gốc HĐ vay, hoàn tiền khách, hoàn tiền đặt cọc HĐ thuê. Lưu phiếu → Theo dõi công nợ tự cập nhật số đã trả / đã chi. Ghi sai thì hủy phiếu có lý do rồi lập lại.',
  c: ['cong_no', 'ho_so', 'ban_hang', 'truong_phong', 'ke_toan'], u: ['cong_no', 'ho_so', 'truong_phong'], d: [], order: 't.voucher_date desc, t.id desc', search: ['voucher_no', 'content', 'receiver'], fields: [
    { k: 'voucher_no', l: 'Số phiếu chi', t: 'code', prefix: 'PC-{Y}-', pad: 4, manual: 1, help: 'Để trống → tự cấp (PC-2026-0001…)' },
    { k: 'voucher_date', l: 'Ngày chi', t: 'date', req: 1, def: 'today' },
    { k: 'contract_id', l: 'Mã hợp đồng', t: 'ref', ref: 'contract', req: 1, sec: '1. Hợp đồng – khách hàng', help: 'Chọn hợp đồng (hoặc mã căn) → tự điền mã căn, khách hàng, dự án, loại hợp đồng' },
    { k: 'unit_id', l: 'Mã căn hộ', t: 'ref', ref: 'unit', help: 'Chọn căn → tự lấy hợp đồng của căn' },
    { k: 'cust_code', l: 'Mã khách hàng', t: 'text', help: 'Tự lấy theo hợp đồng' },
    { k: 'cust_name', l: 'Họ tên khách hàng', t: 'text', help: 'Tự lấy theo hợp đồng' },
    { k: 'project_name', l: 'Dự án', t: 'text', help: 'Tự lấy theo hợp đồng' },
    { k: 'ct_kind', l: 'Loại hợp đồng', t: 'sel', o: HD_KIND, help: 'Tự lấy theo hợp đồng' },
    { k: 'kind', l: 'Nhóm chi', t: 'sel', req: 1, sec: '2. Nội dung chi', o: [['tra_lai', 'Trả lãi HĐ vay', 'b'], ['tra_goc', 'Trả gốc HĐ vay', 'v'], ['hoan_tien', 'Hoàn tiền khách', 'a'], ['hoan_coc', 'Hoàn tiền đặt cọc HĐ thuê', 't'], ['thanh_ly', 'Thanh lý HĐMB', 'r'], ['khac', 'Khác', 's']] },
    { k: 'loan_pay_id', l: 'Đợt chi (kỳ trả HĐ vay)', t: 'ref', ref: 'loan_pay', dep: 'contract_id', show: { kind: ['tra_lai', 'tra_goc'] }, help: 'Chọn kỳ → tự điền số tiền còn phải trả. Để trống = tự trừ vào kỳ chưa trả sớm nhất; trả nhiều hơn 1 kỳ thì phần dư sang kỳ sau' },
    { k: 'refund_id', l: 'Đề xuất hoàn tiền', t: 'ref', ref: 'refund', dep: 'contract_id', filter: 'da_duyet', show: { kind: ['hoan_tien'] }, help: 'Không bắt buộc. Chọn đề xuất đã duyệt thì đề xuất tự chuyển «Đã thực hiện»' },
    money('amount', 'Số tiền', { req: 1 }),
    { k: 'receiver', l: 'Người nhận', t: 'text' },
    { k: 'method', l: 'Hình thức chi', t: 'sel', def: 'chuyen_khoan', o: [['chuyen_khoan', 'Chuyển khoản'], ['tien_mat', 'Tiền mặt'], ['can_tru', 'Cấn trừ']] },
    { k: 'content', l: 'Diễn giải', t: 'text' },
    { k: 'src', l: 'Nguồn', t: 'sel', ro: 1, def: 'thu_cong', o: [['bravo', 'Bravo', 'b'], ['misa', 'MISA', 'v'], ['thu_cong', 'Phòng KD nhập', 's']] },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'hop_le', o: [['hop_le', 'Hợp lệ', 'g'], ['huy', 'Đã hủy', 'r']] },
    { k: 'void_reason', l: 'Lý do hủy', t: 'text', ro: 1 },
  ], list: ['voucher_no', 'voucher_date', 'contract_id', 'unit_id', 'cust_code', 'cust_name', 'kind', 'loan_pay_id', 'amount', 'receiver', 'content', 'status'],
  acts: [{ k: 'void', l: 'Hủy phiếu chi', icon: 'fa-ban', from: ['hop_le'], roles: ['cong_no', 'ho_so', 'truong_phong'], danger: 1, ask: [{ k: 'reason', l: 'Lý do hủy', t: 'long', req: 1 }] }],
});
def('collect_plan', {
  title: 'Kế hoạch dự kiến dòng thu-chi', one: 'dòng kế hoạch', code: 'CN-03', mod: '06', icon: 'fa-chart-line', disp: "t.month||' · #'||t.id",
  purpose: 'Dự báo số tiền có khả năng thu trong kỳ', users: 'Nhân viên công nợ / Trưởng phòng',
  how: 'Lọc công nợ → nhập dự kiến từng căn → Trưởng phòng duyệt → theo dõi thực thu → chốt chênh lệch',
  rules: 'Không dự kiến âm; vượt công nợ phải giải trình; kế hoạch có phiên bản và ngày chốt',
  c: ['cong_no', 'truong_phong'], a: ['truong_phong'], own: [], order: 't.month desc, t.expected_on', bulk: 1, fields: [
    { k: 'month', l: 'Tháng kế hoạch', t: 'month', req: 1 },
    { k: 'contract_id', l: 'Hợp đồng / mã căn', t: 'ref', ref: 'contract', req: 1, filter: 'da_ky' },
    { k: 'unit_id', l: 'Mã căn', t: 'ref', ref: 'unit', ro: 1 },
    { k: 'customer_id', l: 'Khách hàng', t: 'ref', ref: 'customer', ro: 1 },
    money('debt_left', 'Công nợ còn lại', { ro: 1, help: 'Tại ngày lập' }),
    money('expected', 'Số dự kiến thu', { req: 1 }),
    { k: 'expected_on', l: 'Ngày dự kiến thu', t: 'date', req: 1 },
    { k: 'basis', l: 'Căn cứ dự kiến', t: 'sel', req: 1, o: [['cam_ket', 'Cam kết khách hàng'], ['lich_hd', 'Lịch hợp đồng'], ['khac', 'Khác']] },
    { k: 'basis_note', l: 'Ghi chú căn cứ', t: 'text' },
    { k: 'ability', l: 'Khả năng thu', t: 'sel', def: 'vua', o: [['cao', 'Cao', 'g'], ['vua', 'Vừa', 'a'], ['thap', 'Thấp', 'r']] },
    { k: 'explain', l: 'Giải trình (khi vượt công nợ)', t: 'long' },
    owner(),
    { k: 'version', l: 'Phiên bản', t: 'int', ro: 1, def: 1 },
    { k: 'reason_miss', l: 'Nguyên nhân chưa thu được', t: 'long' },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'nhap', o: [...S.duyet, ['thay_the', 'Đã thay thế', 's']] },
  ], list: ['month', 'project', 'building', 'unit_id', 'customer_id', 'debt_left', 'expected', 'expected_on', 'basis', 'ability', 'actual', 'gap', 'owner_id', 'status'],
  lock: ['cho_duyet', 'da_duyet', 'thay_the'], lockKeep: ['reason_miss'],
  flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet' } },
  acts: [{ k: 'revise', l: 'Lập phiên bản mới', icon: 'fa-code-branch', from: ['da_duyet'], roles: ['cong_no', 'truong_phong'] }],
});
def('debt_call', {
  title: 'Nhật ký nhắc nợ – cam kết', one: 'lần gọi', code: 'CN-04', mod: '06', icon: 'fa-phone-volume', disp: "to_char(t.at,'DD/MM/YYYY')",
  purpose: 'Theo dõi cam kết trả tiền', users: 'Nhân viên công nợ',
  how: 'Ghi nhật ký → lưu cam kết → đưa vào gợi ý kế hoạch thu → nhắc trước hạn',
  rules: 'Cam kết không đồng nghĩa thực thu; lịch sử không được ghi đè',
  c: ['cong_no', 'truong_phong'], u: [], d: [], order: 't.at desc', fields: [
    { k: 'contract_id', l: 'Hợp đồng / mã căn', t: 'ref', ref: 'contract', req: 1 },
    { k: 'at', l: 'Ngày gọi', t: 'dt', req: 1, def: 'now' },
    { k: 'contact_person', l: 'Người nghe máy', t: 'text' },
    { k: 'result', l: 'Kết quả liên hệ', t: 'sel', req: 1, o: [['da_trao_doi', 'Đã trao đổi', 'g'], ['khong_nghe', 'Không nghe máy', 'r'], ['hen_goi_lai', 'Hẹn gọi lại', 'a'], ['tu_choi', 'Từ chối thanh toán', 'r'], ['sai_so', 'Sai số', 's']] },
    { k: 'content', l: 'Nội dung', t: 'long', req: 1 },
    money('promise_amount', 'Số cam kết'),
    { k: 'promise_on', l: 'Ngày cam kết', t: 'date' },
    { k: 'next_on', l: 'Lần theo dõi tiếp', t: 'date' },
    owner('Người gọi'),
  ], list: ['at', 'contract_id', 'result', 'content', 'promise_amount', 'promise_on', 'promise_st', 'next_on', 'owner_id'],
});
def('refund', {
  title: 'Đề xuất hoàn tiền – đối trừ', one: 'đề xuất', mod: '06', icon: 'fa-money-bill-transfer', disp: 't.code',
  c: ['cong_no', 'truong_phong', 'ban_hang'], a: MGR, files: [['chung_tu', 'Chứng từ kèm theo', 1]], fields: [
    { k: 'code', l: 'Mã đề xuất', t: 'code', prefix: 'HT-{Y}-', pad: 4 },
    { k: 'kind', l: 'Loại', t: 'sel', req: 1, o: [['hoan_tien', 'Hoàn tiền'], ['doi_tru', 'Đối trừ công nợ'], ['chuyen_khoan', 'Chuyển giữa các khoản phải thu']] },
    { k: 'contract_id', l: 'Hợp đồng', t: 'ref', ref: 'contract', req: 1 },
    { k: 'to_contract_id', l: 'Chuyển sang hợp đồng', t: 'ref', ref: 'contract', show: { kind: ['chuyen_khoan', 'doi_tru'] } },
    money('amount', 'Số tiền', { req: 1 }),
    { k: 'reason', l: 'Lý do', t: 'long', req: 1 },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'nhap', o: [...S.duyet, ['da_thuc_hien', 'Kế toán đã thực hiện', 't']] },
    { k: 'done_voucher', l: 'Chứng từ Bravo', t: 'text', ro: 1 },
    { k: 'done_on', l: 'Ngày thực hiện', t: 'date', ro: 1 },
  ], list: ['code', 'kind', 'contract_id', 'amount', 'reason', 'status', 'done_voucher'],
  lock: ['cho_duyet', 'da_duyet', 'da_thuc_hien'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet' } },
  acts: [{ k: 'execute', l: 'Kế toán xác nhận thực hiện', icon: 'fa-check-double', from: ['da_duyet'], roles: ['ke_toan'], ask: [{ k: 'done_voucher', l: 'Số chứng từ Bravo', t: 'text', req: 1 }, { k: 'done_on', l: 'Ngày thực hiện', t: 'date', req: 1, def: 'today' }] }],
});

// ===================== 07. BÀN GIAO =====================
const BG_ST = [['chua_du_dk', 'Chưa đủ điều kiện', 's'], ['du_dk', 'Đủ điều kiện', 'b'], ['da_moi', 'Đã mời bàn giao', 'v'], ['da_hen', 'Khách đã xác nhận lịch', 'a'],
  ['da_ban_giao', 'Đã bàn giao thực tế', 'g'], ['hoan_tat', 'Hoàn tất (hết tồn tại)', 't']];
def('handover', {
  title: 'Kế hoạch bàn giao', one: 'kế hoạch', code: 'BG-01', mod: '07', icon: 'fa-key', disp: "'BG #'||t.id",
  purpose: 'Sắp lịch bàn giao cho căn đủ điều kiện', users: 'Ban bàn giao / PKD',
  how: 'Kiểm tra điều kiện → hẹn khách → chuẩn bị hồ sơ → bàn giao → cập nhật kết quả',
  rules: 'Không đánh dấu hoàn tất khi thiếu xác nhận và hồ sơ bắt buộc',
  c: ['cskh', 'truong_phong'], fields: [
    { k: 'unit_id', l: 'Mã căn', t: 'ref', ref: 'unit', req: 1, uniqActive: 1 },
    { k: 'contract_id', l: 'Hợp đồng', t: 'ref', ref: 'contract', ro: 1 },
    { k: 'cond_contract', l: 'ĐK hợp đồng (đã ký)', t: 'bool', ro: 1 },
    { k: 'cond_pay', l: 'ĐK thanh toán', t: 'bool', ro: 1 },
    { k: 'cond_tech', l: 'ĐK kỹ thuật (đã nghiệm thu)', t: 'bool' },
    { k: 'plan_at', l: 'Ngày giờ dự kiến', t: 'dt' },
    owner('Người phụ trách', { req: 1 }),
    { k: 'confirm', l: 'Xác nhận khách', t: 'sel', def: 'chua', o: [['chua', 'Chưa xác nhận', 's'], ['da_xac_nhan', 'Đã xác nhận', 'g'], ['hen_lai', 'Xin hẹn lại', 'a']] },
    { k: 'docs', l: 'Hồ sơ bàn giao', t: 'check', src: 'checklist_ban_giao' },
    { k: 'actual_on', l: 'Ngày bàn giao thực tế', t: 'date', ro: 1 },
    { k: 'receiver', l: 'Đơn vị tiếp nhận quản lý', t: 'text' },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'chua_du_dk', o: BG_ST },
    { k: 'note', l: 'Ghi chú', t: 'long' },
  ], list: ['unit_id', 'contract_id', 'cond_contract', 'cond_pay', 'cond_tech', 'plan_at', 'confirm', 'owner_id', 'defects_open', 'status'],
  acts: [
    { k: 'invite', l: 'Mời bàn giao', icon: 'fa-envelope-open-text', from: ['du_dk'], roles: ['cskh', 'truong_phong'], ask: [{ k: 'plan_at', l: 'Ngày giờ hẹn', t: 'dt', req: 1 }] },
    { k: 'confirm', l: 'Khách xác nhận lịch', icon: 'fa-calendar-check', from: ['da_moi'], roles: ['cskh', 'truong_phong'] },
    { k: 'handed', l: 'Ghi nhận đã bàn giao', icon: 'fa-key', from: ['da_moi', 'da_hen'], roles: ['cskh', 'truong_phong'], ask: [{ k: 'actual_on', l: 'Ngày bàn giao thực tế', t: 'date', req: 1, def: 'today' }], help: 'Cần tích «Biên bản bàn giao» trong hồ sơ' },
    { k: 'finish', l: 'Xác nhận hoàn tất', icon: 'fa-flag-checkered', from: ['da_ban_giao'], roles: ['cskh', 'truong_phong'], help: 'Cần đủ hồ sơ bắt buộc, khách xác nhận và không còn tồn tại chưa nghiệm thu' },
  ],
});
def('defect', {
  title: 'Phiếu kiểm tra – tồn tại căn hộ', one: 'tồn tại', code: 'BG-02', mod: '07', icon: 'fa-screwdriver-wrench', disp: "'TT #'||t.id",
  purpose: 'Theo dõi lỗi và khắc phục', users: 'Ban bàn giao / kỹ thuật',
  how: 'Ghi lỗi → giao xử lý → cập nhật ảnh sau → nghiệm thu → đóng tồn tại',
  rules: 'Không xóa lỗi chưa nghiệm thu; phân biệt đã bàn giao và còn tồn tại',
  c: ['cskh', 'truong_phong'], d: [], files: [['truoc', 'Ảnh hiện trạng'], ['sau', 'Ảnh sau khắc phục']], fields: [
    { k: 'unit_id', l: 'Mã căn', t: 'ref', ref: 'unit', req: 1 },
    { k: 'handover_id', l: 'Kế hoạch bàn giao', t: 'ref', ref: 'handover', ro: 1 },
    { k: 'category', l: 'Hạng mục', t: 'sel', opt: 'hang_muc', req: 1 },
    { k: 'descr', l: 'Mô tả lỗi', t: 'long', req: 1 },
    { k: 'contractor', l: 'Đơn vị xử lý', t: 'text', req: 1 },
    { k: 'due_on', l: 'Hạn xử lý', t: 'date', req: 1 },
    { k: 'result', l: 'Kết quả khắc phục', t: 'long' },
    { k: 'customer_ok', l: 'Khách xác nhận', t: 'bool' },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'moi', o: [['moi', 'Mới ghi nhận', 'r'], ['dang_xu_ly', 'Đang xử lý', 'a'], ['da_khac_phuc', 'Đã khắc phục', 'b'], ['da_nghiem_thu', 'Đã nghiệm thu – đóng', 'g']] },
    { k: 'closed_on', l: 'Ngày đóng', t: 'date', ro: 1 },
  ], list: ['id', 'unit_id', 'category', 'descr', 'contractor', 'due_on', 'status'],
  acts: [
    { k: 'assign', l: 'Giao xử lý', icon: 'fa-person-digging', from: ['moi'], roles: ['cskh', 'truong_phong'] },
    { k: 'fixed', l: 'Báo đã khắc phục', icon: 'fa-hammer', from: ['dang_xu_ly'], roles: ['cskh', 'truong_phong'], ask: [{ k: 'result', l: 'Kết quả khắc phục', t: 'long', req: 1 }], help: 'Nên tải «Ảnh sau khắc phục»' },
    { k: 'accept', l: 'Nghiệm thu – đóng', icon: 'fa-circle-check', from: ['da_khac_phuc'], roles: ['cskh', 'truong_phong'], help: 'Cần khách xác nhận' },
    { k: 'reopen', l: 'Chưa đạt – làm lại', icon: 'fa-rotate-left', from: ['da_khac_phuc'], roles: ['cskh', 'truong_phong'], ask: [{ k: 'reason', l: 'Lý do', t: 'long', req: 1 }] },
  ],
});

// Thông báo bàn giao căn hộ (13/11/2026, Tâm): số TB, dự án, tòa, tích căn, ngày bàn giao → tự gợi ý căn có HĐMB đã ký;
// phát hành (duyệt) → hạn thu «đợt bàn giao» của từng HĐMB = ngày bàn giao (+ số ngày); biết tòa bàn giao từ ngày nào
def('handover_notice', {
  title: 'Thông báo bàn giao căn hộ', one: 'thông báo bàn giao', code: 'BG-00', mod: '07', icon: 'fa-bullhorn', disp: "coalesce(t.doc_no, t.code)",
  purpose: 'Chốt ngày bàn giao từng tòa và hạn thu tiền đợt bàn giao của các HĐMB', users: 'Trưởng phòng / nhân viên kinh doanh, công nợ',
  how: 'Chọn dự án, tòa → app tự tích các căn có HĐMB đã ký → điền ngày bàn giao (xem trước hạn thu mới) → trình duyệt → duyệt (phát hành) là hạn thu đợt bàn giao của các HĐMB tự cập nhật',
  rules: 'Mỗi căn chỉ thuộc 1 thông báo bàn giao còn hiệu lực; đợt bàn giao của từng HĐMB = đợt được đánh dấu «Bàn giao» ở Lần thanh toán (chưa đánh dấu thì app tự nhận đợt có nội dung nhắc bàn giao / nhận nhà); sửa đợt / số ngày ở HĐMB sau khi phát hành thì hạn tự tính lại',
  c: ['truong_phong', 'ban_hang', 'cong_no', 'cskh'], u: ['truong_phong', 'ban_hang', 'cong_no', 'cskh'], d: ['truong_phong', 'ban_hang', 'cong_no', 'cskh'], a: MGR,
  search: ['code', 'doc_no'], files: [['van_ban', 'Văn bản thông báo bàn giao']], fields: [
    { k: 'code', l: 'Mã thông báo', t: 'code', prefix: 'TBBG-{Y}-', pad: 4 },
    { k: 'doc_no', l: 'Số thông báo', t: 'text', req: 1, uniq: 1, help: 'Số văn bản thông báo bàn giao, VD 15/2026/TB-CT' },
    { k: 'project_id', l: 'Dự án', t: 'ref', ref: 'project', req: 1 },
    { k: 'building_id', l: 'Mã tòa', t: 'ref', ref: 'building', req: 1, dep: 'project_id' },
    { k: 'notice_on', l: 'Ngày thông báo', t: 'date', def: 'today' },
    { k: 'handover_on', l: 'Ngày bàn giao', t: 'date', req: 1, help: 'Ngày bắt đầu bàn giao căn hộ của tòa' },
    { k: 'pay_from', l: 'Hạn nộp tiền đợt bàn giao tính từ', t: 'sel', def: 'ban_giao', o: [['ban_giao', 'Ngày bàn giao'], ['thong_bao', 'Ngày thông báo']] },
    { k: 'pay_days', l: 'Số ngày được nộp tiền (mặc định)', t: 'int', def: 0, help: 'Hạn nộp tiền đợt bàn giao của HĐMB = ngày bàn giao (hoặc ngày thông báo) + số ngày. Dùng cho HĐMB chưa ghi số ngày riêng; HĐ nào có số ngày riêng (ở bảng căn bên dưới / Lần thanh toán của HĐMB) thì theo HĐ đó. 0 = nộp ngay trong ngày' },
    { k: 'unit_list', l: 'Căn hộ bàn giao', t: 'text', req: 1, def: '', pick: 'bg_units', help: 'Tự tích các căn có HĐMB đã ký của tòa — bỏ tích căn chưa bàn giao đợt này' },
    { k: 'note', l: 'Ghi chú', t: 'long' },
    { k: 'applied', l: 'Hạn thu đã cập nhật', t: 'json', ro: 1, hide: 1 },
    { k: 'status', l: 'Trạng thái', t: 'sel', o: [['nhap', 'Nháp', 's'], ['cho_duyet', 'Chờ duyệt', 'a'], ['da_duyet', 'Đã phát hành', 'g'], ['tu_choi', 'Từ chối', 'r'], ['huy', 'Đã hủy', 's']], ro: 1, def: 'nhap' },
  ], list: ['doc_no', 'project_id', 'building_id', 'notice_on', 'handover_on', 'bg_from', 'n_units', 'n_hd', 'bg_amount', 'status'],
  lock: ['cho_duyet', 'da_duyet', 'huy'], lockKeep: ['note'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet', no: 'tu_choi' }, submitLabel: 'Trình duyệt' },
  acts: [{ k: 'revoke', l: 'Hủy thông báo', icon: 'fa-ban', from: ['da_duyet'], roles: MGR, ask: [{ k: 'reason', l: 'Lý do hủy', t: 'long', req: 1 }], help: 'Trả hạn thu đợt bàn giao về như trước khi phát hành (đợt nào đã bị sửa tay thì giữ nguyên)' }],
});

// ===================== 08. CẤP SỔ HỒNG =====================
const SH_ST = [['cho_ho_so', 'Chờ hồ sơ', 's'], ['thieu', 'Thiếu hồ sơ', 'a'], ['da_nhan_du', 'Đã nhận đủ', 'b'], ['da_nop', 'Đã nộp cơ quan', 'v'],
  ['bo_sung', 'Cơ quan yêu cầu bổ sung', 'r'], ['da_co_kq', 'Đã có kết quả', 'g'], ['da_giao_so', 'Đã bàn giao sổ', 't']];
def('pinkbook', {
  title: 'Hồ sơ cấp sổ hồng', one: 'hồ sơ', code: 'SH-01', mod: '08', icon: 'fa-book', disp: "'SH #'||t.id",
  purpose: 'Theo dõi hồ sơ đến lúc trả kết quả', users: 'Nhân viên hồ sơ sổ hồng',
  how: 'Nhận → kiểm tra → bổ sung → nộp → theo dõi → nhận và giao sổ',
  rules: 'Phân biệt ngày nội bộ và cơ quan; giấy tờ pháp lý theo mẫu hiện hành',
  c: ['ho_so', 'truong_phong'], files: [['phieu_hen', 'Phiếu hẹn'], ['bien_ban', 'Biên bản giao nhận GCN']], fields: [
    { k: 'unit_id', l: 'Mã căn', t: 'ref', ref: 'unit', req: 1, uniqActive: 1 },
    { k: 'contract_id', l: 'Hợp đồng', t: 'ref', ref: 'contract', ro: 1 },
    { k: 'customer_id', l: 'Khách hàng', t: 'ref', ref: 'customer', ro: 1 },
    { k: 'items', l: 'Danh mục giấy tờ', t: 'check', src: 'checklist_so_hong', req: 1 },
    { k: 'received_on', l: 'Ngày nhận hồ sơ', t: 'date' },
    { k: 'supplement_note', l: 'Tài liệu thiếu / yêu cầu bổ sung', t: 'long' },
    { k: 'supplement_due', l: 'Hạn hoàn thiện', t: 'date' },
    { k: 'submit_on', l: 'Ngày nộp cơ quan', t: 'date', ro: 1 },
    { k: 'agency', l: 'Cơ quan tiếp nhận', t: 'text', ro: 1 },
    { k: 'file_no', l: 'Mã hồ sơ / phiếu hẹn', t: 'text', ro: 1 },
    { k: 'appoint_on', l: 'Ngày hẹn trả', t: 'date', ro: 1 },
    { k: 'result_on', l: 'Ngày trả kết quả', t: 'date', ro: 1 },
    { k: 'cert_no', l: 'Số Giấy chứng nhận', t: 'text', ro: 1 },
    { k: 'handed_on', l: 'Ngày giao sổ cho khách', t: 'date', ro: 1 },
    owner('Người tiếp nhận'),
    { k: 'status', l: 'Tình trạng', t: 'sel', ro: 1, def: 'cho_ho_so', o: SH_ST },
  ], list: ['unit_id', 'customer_id', 'items', 'received_on', 'submit_on', 'appoint_on', 'days_in', 'days_out', 'status'],
  acts: [
    { k: 'submit_gov', l: 'Nộp cơ quan', icon: 'fa-building-columns', from: ['da_nhan_du', 'bo_sung'], roles: ['ho_so', 'truong_phong'], ask: [{ k: 'submit_on', l: 'Ngày nộp', t: 'date', req: 1, def: 'today' }, { k: 'agency', l: 'Cơ quan tiếp nhận', t: 'text', req: 1, def: 'VP Đăng ký đất đai' }, { k: 'file_no', l: 'Mã hồ sơ / số phiếu hẹn', t: 'text', req: 1 }, { k: 'appoint_on', l: 'Ngày hẹn trả', t: 'date' }] },
    { k: 'gov_more', l: 'Cơ quan yêu cầu bổ sung', icon: 'fa-triangle-exclamation', from: ['da_nop'], roles: ['ho_so', 'truong_phong'], ask: [{ k: 'supplement_note', l: 'Nội dung yêu cầu', t: 'long', req: 1 }, { k: 'supplement_due', l: 'Hạn bổ sung', t: 'date' }] },
    { k: 'result', l: 'Ghi nhận có kết quả', icon: 'fa-certificate', from: ['da_nop'], roles: ['ho_so', 'truong_phong'], ask: [{ k: 'result_on', l: 'Ngày trả kết quả', t: 'date', req: 1, def: 'today' }, { k: 'cert_no', l: 'Số Giấy chứng nhận', t: 'text', req: 1 }] },
    { k: 'hand', l: 'Bàn giao sổ cho khách', icon: 'fa-handshake', from: ['da_co_kq'], roles: ['ho_so', 'truong_phong'], ask: [{ k: 'handed_on', l: 'Ngày giao', t: 'date', req: 1, def: 'today' }], help: 'Cần tải «Biên bản giao nhận GCN»' },
  ],
});

// ===================== 09. CSKH =====================
def('ticket', {
  title: 'Phản ánh – khiếu nại – bảo hành', one: 'phiếu', code: 'CS-01', mod: '09', icon: 'fa-headset', disp: 't.code',
  purpose: 'Theo dõi trách nhiệm và thời hạn xử lý', users: 'Nhân viên CSKH',
  how: 'Tiếp nhận → phân công → đề xuất → duyệt nếu cần → phản hồi → xác nhận đóng',
  rules: 'Không đóng phiếu chỉ vì đã chuyển bộ phận; cảnh báo quá SLA',
  c: ['cskh', 'truong_phong', 'ban_hang'], u: ['cskh', 'truong_phong'], a: MGR, files: [['hien_trang', 'Ảnh / tài liệu']], fields: [
    { k: 'code', l: 'Mã phiếu', t: 'code', prefix: 'CS', pad: 6 },
    { k: 'customer_id', l: 'Khách hàng', t: 'ref', ref: 'customer', req: 1 },
    { k: 'unit_id', l: 'Mã căn', t: 'ref', ref: 'unit' },
    { k: 'at', l: 'Ngày tiếp nhận', t: 'dt', req: 1, def: 'now' },
    { k: 'channel', l: 'Kênh', t: 'sel', opt: 'kenh', req: 1 },
    { k: 'kind', l: 'Loại', t: 'sel', req: 1, o: [['yeu_cau', 'Yêu cầu'], ['phan_anh', 'Phản ánh'], ['khieu_nai', 'Khiếu nại'], ['bao_hanh', 'Bảo hành'], ['bao_tri', 'Bảo trì']] },
    { k: 'content', l: 'Nội dung', t: 'long', req: 1 },
    { k: 'priority', l: 'Mức ưu tiên', t: 'sel', req: 1, def: 'thuong', o: [['thuong', 'Thường', 's'], ['cao', 'Cao', 'a'], ['khan', 'Khẩn', 'r']] },
    { k: 'dept', l: 'Bộ phận phụ trách', t: 'sel', opt: 'bo_phan' },
    { k: 'assignee_id', l: 'Người xử lý', t: 'user', req: 1 },
    { k: 'due_at', l: 'Hạn phản hồi', t: 'dt', help: 'Để trống = theo SLA (Khẩn 24h, Cao 48h, Thường 72h)' },
    { k: 'solution', l: 'Phương án xử lý', t: 'long' },
    { k: 'result', l: 'Kết quả phản hồi khách', t: 'long' },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'moi', o: [['moi', 'Mới tiếp nhận', 'r'], ['dang_xu_ly', 'Đang xử lý', 'a'], ['cho_duyet', 'Chờ duyệt phương án', 'v'], ['da_duyet', 'Phương án đã duyệt', 'b'], ['tu_choi', 'Phương án bị trả lại', 'r'], ['da_phan_hoi', 'Đã phản hồi khách', 'b'], ['da_dong', 'Đã đóng', 'g']] },
    { k: 'rating', l: 'Mức độ hài lòng (1–5)', t: 'int', ro: 1 },
    { k: 'rating_note', l: 'Ý kiến khách hàng', t: 'text', ro: 1 },
  ], list: ['code', 'customer_id', 'unit_id', 'kind', 'priority', 'assignee_id', 'due_at', 'sla', 'status'],
  flow: { field: 'status', submit: ['dang_xu_ly', 'tu_choi'], approve: { ok: 'da_duyet' }, submitLabel: 'Trình duyệt phương án', need: ['solution'] },
  acts: [
    { k: 'start', l: 'Nhận xử lý', icon: 'fa-play', from: ['moi'], roles: ['cskh', 'truong_phong'] },
    { k: 'reply', l: 'Ghi nhận đã phản hồi khách', icon: 'fa-reply', from: ['dang_xu_ly', 'da_duyet'], roles: ['cskh', 'truong_phong'], ask: [{ k: 'result', l: 'Kết quả phản hồi', t: 'long', req: 1 }] },
    { k: 'close', l: 'Khách xác nhận – đóng phiếu', icon: 'fa-lock', from: ['da_phan_hoi'], roles: ['cskh', 'truong_phong'], ask: [{ k: 'rating', l: 'Mức độ hài lòng', t: 'sel', req: 1, o: [['5', '5 – Rất hài lòng'], ['4', '4 – Hài lòng'], ['3', '3 – Bình thường'], ['2', '2 – Chưa hài lòng'], ['1', '1 – Rất không hài lòng']] }, { k: 'rating_note', l: 'Ý kiến khách hàng', t: 'text' }] },
    { k: 'reopen', l: 'Mở lại', icon: 'fa-rotate-left', from: ['da_phan_hoi', 'da_dong'], roles: ['cskh', 'truong_phong'], ask: [{ k: 'reason', l: 'Lý do', t: 'long', req: 1 }] },
  ],
});
def('notice', {
  title: 'Thông báo khách hàng', one: 'thông báo', mod: '09', icon: 'fa-bullhorn', disp: 't.title',
  note: 'Ghi nhận danh sách và nội dung đã gửi. Gửi tự động qua Zalo OA / SMS / email cần kết nối nhà cung cấp.',
  c: ['cskh', 'truong_phong', 'cong_no', 'ho_so'], fields: [
    { k: 'kind', l: 'Loại thông báo', t: 'sel', req: 1, o: [['ky_hd', 'Ký hợp đồng'], ['thu_tien', 'Thu tiền'], ['ban_giao', 'Bàn giao'], ['bo_sung_hs', 'Bổ sung hồ sơ'], ['cap_so', 'Cấp sổ'], ['khac', 'Khác']] },
    { k: 'title', l: 'Tiêu đề', t: 'text', req: 1 },
    { k: 'content', l: 'Nội dung', t: 'long', req: 1, help: 'Dùng {ten_kh}, {ma_can}, {cong_no} để điền theo từng khách' },
    { k: 'target', l: 'Nhóm khách hàng', t: 'sel', req: 1, o: [['du_an', 'Theo dự án / tòa'], ['qua_han', 'Khách có nợ quá hạn'], ['den_han', 'Khách có kỳ đến hạn trong 7 ngày'], ['cho_ky', 'Hợp đồng chờ ký'], ['du_dk_bg', 'Căn đủ điều kiện bàn giao'], ['so_hong_thieu', 'Hồ sơ sổ hồng còn thiếu']] },
    { k: 'project_id', l: 'Dự án', t: 'ref', ref: 'project' },
    { k: 'building_id', l: 'Tòa', t: 'ref', ref: 'building', dep: 'project_id' },
    { k: 'channel', l: 'Kênh gửi', t: 'sel', req: 1, o: [['zalo', 'Zalo'], ['sms', 'SMS'], ['email', 'Email'], ['thu_giay', 'Thư giấy']] },
    { k: 'recipients', l: 'Số khách nhận', t: 'int', ro: 1 },
    { k: 'recipient_list', l: 'Danh sách nhận', t: 'json', ro: 1, hide: 1 },
    { k: 'sent_at', l: 'Thời điểm gửi', t: 'dt', ro: 1 },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'nhap', o: [['nhap', 'Nháp', 's'], ['da_gui', 'Đã gửi', 'g']] },
  ], list: ['title', 'kind', 'target', 'channel', 'recipients', 'sent_at', 'status'], lock: ['da_gui'],
  acts: [{ k: 'send', l: 'Gửi thông báo', icon: 'fa-paper-plane', from: ['nhap'], roles: ['cskh', 'truong_phong', 'cong_no', 'ho_so'] }],
});

// ===================== 10. ĐẠI LÝ & CTV =====================
def('agent', {
  title: 'Đại lý – cộng tác viên', one: 'đối tác', mod: '10', icon: 'fa-handshake', disp: "t.code||' · '||t.name",
  c: ['truong_phong'], fields: [
    { k: 'code', l: 'Mã đối tác', t: 'text', req: 1, uniq: 1 },
    { k: 'name', l: 'Tên đối tác', t: 'text', req: 1 },
    { k: 'kind', l: 'Loại', t: 'sel', req: 1, o: [['dai_ly', 'Đại lý'], ['san', 'Sàn giao dịch'], ['ctv', 'Cộng tác viên']] },
    { k: 'representative', l: 'Người đại diện', t: 'text' },
    { k: 'phone', l: 'Điện thoại', t: 'text' },
    { k: 'email', l: 'Email', t: 'text' },
    { k: 'contract_no', l: 'Số hợp đồng hợp tác', t: 'text' },
    { k: 'from_on', l: 'Hợp tác từ', t: 'date' },
    { k: 'to_on', l: 'Đến', t: 'date' },
    { k: 'status', l: 'Trạng thái', t: 'sel', def: 'hoat_dong', o: [['hoat_dong', 'Đang hoạt động', 'g'], ['tam_dung', 'Tạm dừng', 'a'], ['het_han', 'Hết hạn', 's']] },
  ], list: ['code', 'name', 'kind', 'representative', 'phone', 'contract_no', 'to_on', 'status'],
});
def('agent_alloc', {
  title: 'Giỏ hàng phân phối', one: 'phân bổ', mod: '10', icon: 'fa-boxes-stacked', disp: "'PB #'||t.id",
  c: ['truong_phong'], fields: [
    { k: 'agent_id', l: 'Đại lý / CTV', t: 'ref', ref: 'agent', req: 1 },
    { k: 'project_id', l: 'Dự án', t: 'ref', ref: 'project', req: 1 },
    { k: 'units', l: 'Sản phẩm phân bổ', t: 'long', help: 'Mã căn hoặc mã tòa, cách nhau dấu phẩy' },
    { k: 'qty', l: 'Số lượng', t: 'int' },
    { k: 'from_on', l: 'Hiệu lực từ', t: 'date', req: 1 },
    { k: 'to_on', l: 'Đến', t: 'date', req: 1 },
    { k: 'policy_id', l: 'Chính sách hoa hồng', t: 'ref', ref: 'commission_policy' },
  ], list: ['agent_id', 'project_id', 'units', 'qty', 'from_on', 'to_on', 'policy_id'],
});
def('commission_policy', {
  title: 'Chính sách hoa hồng', one: 'chính sách', mod: '10', icon: 'fa-percent', disp: "t.code||' · '||t.name",
  c: ['truong_phong'], fields: [
    { k: 'code', l: 'Mã chính sách', t: 'text', req: 1, uniq: 1, help: 'CSHH-…' },
    { k: 'name', l: 'Tên', t: 'text', req: 1 },
    { k: 'rate', l: 'Tỷ lệ (%)', t: 'num' },
    money('fixed', 'Mức cố định / giao dịch'),
    { k: 'pay_pct', l: 'Điều kiện: khách đã thanh toán tối thiểu (%)', t: 'num', def: 30 },
    { k: 'condition', l: 'Điều kiện hưởng khác', t: 'long' },
    { k: 'bonus', l: 'Chương trình thưởng giới thiệu', t: 'long' },
    { k: 'from_on', l: 'Từ ngày', t: 'date' },
    { k: 'to_on', l: 'Đến ngày', t: 'date' },
  ], list: ['code', 'name', 'rate', 'fixed', 'pay_pct', 'from_on', 'to_on'],
});
def('commission', {
  title: 'Đối soát hoa hồng', one: 'dòng hoa hồng', code: 'DL-01', mod: '10', icon: 'fa-scale-balanced', disp: 't.code',
  purpose: 'Tính và đối soát hoa hồng', users: 'Nhân viên phụ trách đại lý / kế toán',
  how: 'Chốt giao dịch → kiểm tra điều kiện → tính → đối soát → duyệt → chi',
  rules: 'Không tính trùng; giao dịch hủy cần điều chỉnh/thu hồi theo chính sách',
  c: [], u: ['truong_phong'], a: MGR, bulk: 1, fields: [
    { k: 'code', l: 'Mã', t: 'code', prefix: 'HH-{Y}-', pad: 4 },
    { k: 'agent_id', l: 'Đại lý / CTV', t: 'ref', ref: 'agent', ro: 1 },
    { k: 'contract_id', l: 'Hợp đồng / căn', t: 'ref', ref: 'contract', ro: 1 },
    { k: 'policy_id', l: 'Chính sách áp dụng', t: 'ref', ref: 'commission_policy', req: 1 },
    money('base', 'Giá trị làm căn cứ', { ro: 1 }),
    money('amount', 'Hoa hồng dự kiến', { ro: 1 }),
    { k: 'cond_contract', l: 'ĐK: đã ký HĐ', t: 'bool', ro: 1 },
    { k: 'cond_pay', l: 'ĐK: đã thu đủ tỷ lệ', t: 'bool', ro: 1 },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'du_kien', o: [['du_kien', 'Dự kiến', 's'], ['nhap', 'Đủ điều kiện', 'b'], ['cho_duyet', 'Chờ duyệt', 'a'], ['da_duyet', 'Đã duyệt', 'g'], ['tu_choi', 'Từ chối', 'r'], ['da_chi', 'Đã chi', 't'], ['thu_hoi', 'Cần thu hồi', 'r'], ['huy', 'Hủy', 's']] },
    { k: 'paid_on', l: 'Ngày chi', t: 'date', ro: 1 },
    { k: 'voucher', l: 'Chứng từ chi', t: 'text', ro: 1 },
    { k: 'note', l: 'Ghi chú', t: 'long' },
  ], list: ['code', 'agent_id', 'contract_id', 'policy_id', 'base', 'amount', 'cond_contract', 'cond_pay', 'status'],
  lock: ['cho_duyet', 'da_duyet', 'da_chi'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet' } },
  acts: [{ k: 'pay', l: 'Kế toán xác nhận đã chi', icon: 'fa-money-check-dollar', from: ['da_duyet'], roles: ['ke_toan'], ask: [{ k: 'paid_on', l: 'Ngày chi', t: 'date', req: 1, def: 'today' }, { k: 'voucher', l: 'Số chứng từ chi', t: 'text', req: 1 }] }],
});

// ===================== 11. BÁO CÁO / CHỈ TIÊU =====================
def('target', {
  title: 'Chỉ tiêu kinh doanh – KPI', one: 'chỉ tiêu', mod: '11', icon: 'fa-bullseye', disp: "t.period",
  c: ['truong_phong', 'lanh_dao'], order: 't.period desc', fields: [
    { k: 'period', l: 'Tháng', t: 'month', req: 1 },
    { k: 'project_id', l: 'Dự án', t: 'ref', ref: 'project', help: 'Để trống = toàn phòng' },
    { k: 'user_id', l: 'Nhân viên', t: 'user', help: 'Để trống = chỉ tiêu dự án / phòng' },
    { k: 'target_units', l: 'Số căn bán', t: 'int' },
    money('target_sales', 'Doanh số ký HĐ'),
    money('target_collect', 'Số tiền thu'),
    { k: 'note', l: 'Ghi chú', t: 'text' },
  ], list: ['period', 'project_id', 'user_id', 'target_units', 'target_sales', 'target_collect'],
});
def('report', {
  title: 'Báo cáo điều hành tháng', one: 'báo cáo', code: 'BC-01', mod: '11', icon: 'fa-file-invoice', disp: "'BC '||t.period",
  purpose: 'Tổng hợp số liệu phục vụ điều hành', users: 'Trưởng phòng / Ban lãnh đạo',
  how: 'Chọn kỳ → tổng hợp → đối chiếu → chốt báo cáo → trình lãnh đạo',
  rules: 'Mỗi chỉ tiêu có nguồn và ngày chốt; cho phép mở danh sách chi tiết',
  c: ['truong_phong'], order: 't.period desc', fields: [
    { k: 'period', l: 'Kỳ báo cáo', t: 'month', req: 1 },
    { k: 'project_id', l: 'Dự án', t: 'ref', ref: 'project', help: 'Để trống = tất cả' },
    { k: 'data', l: 'Số liệu', t: 'json', ro: 1 },
    { k: 'note', l: 'Tồn đọng trọng yếu / ghi chú', t: 'long' },
    { k: 'closed_at', l: 'Ngày chốt', t: 'dt', ro: 1 },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'nhap', o: [['nhap', 'Đang tổng hợp', 's'], ['da_chot', 'Đã chốt số liệu', 'b'], ['da_trinh', 'Đã trình lãnh đạo', 'g']] },
  ], list: ['period', 'project_id', 'closed_at', 'created_by', 'status'], lock: ['da_chot', 'da_trinh'], lockKeep: ['note'],
  acts: [
    { k: 'compute', l: 'Tổng hợp số liệu', icon: 'fa-calculator', from: ['nhap'], roles: ['truong_phong'] },
    { k: 'close', l: 'Chốt báo cáo', icon: 'fa-lock', from: ['nhap'], roles: ['truong_phong'] },
    { k: 'present', l: 'Trình lãnh đạo', icon: 'fa-paper-plane', from: ['da_chot'], roles: ['truong_phong'] },
  ],
});

// ===================== 12. QUẢN TRỊ =====================
def('template', {
  title: 'Mẫu biểu – thông báo', one: 'mẫu', mod: '12', icon: 'fa-file-lines', disp: "t.code||' · '||t.name",
  c: ['admin', 'truong_phong'], d: ['admin', 'truong_phong'], fields: [   // d: trưởng phòng xóa được mẫu ở cây thư mục (12/11/2026)
    { k: 'code', l: 'Mã mẫu', t: 'text', req: 1, uniq: 1 },
    { k: 'name', l: 'Tên mẫu', t: 'text', req: 1 },
    { k: 'kind', l: 'Loại', t: 'sel', req: 1, o: [['hop_dong', 'Hợp đồng'], ['phu_luc', 'Phụ lục'], ['bien_ban', 'Biên bản'], ['de_nghi', 'Phiếu đề nghị'], ['thong_bao', 'Thông báo'], ['bao_cao', 'Báo cáo'], ['dang_ky_can', 'Bản đăng ký căn hộ'], ['dang_ky_noi_that', 'Bản đăng ký nội thất'], ['bien_ban_giao_nhan', 'Biên bản giao nhận hồ sơ'], ['ban_ve', 'Bản vẽ (mô tả căn hộ)']] },
    { k: 'ent', l: 'Hiện ở module', t: 'sel', o: [], help: 'Mẫu hiện ở nút «In theo mẫu» khi mở một bản ghi của màn này. Tạo / sửa mẫu ngay trong từng module: nút «Mẫu biểu» trên đầu danh sách' },   // o: điền sau MENU (TPL_PLACES)
    { k: 'content', l: 'Nội dung mẫu', t: 'long', req: 1, help: 'Trường trộn: {so_hd} {ten_kh} {dien_thoai} {cccd} {dia_chi} {ma_can} {du_an} {toa} {tang} {dien_tich} {gia_tri} {gia_tri_chu} {ngay} {lich_thanh_toan} — bản đăng ký: {ma_phieu} {ngay_dk} {tien_coc} {trang_thai} {tien_trinh} {ghi_chu} {goi_hoan_thien} {gia_tri_hoan_thien} {gia_tri_hoan_thien_chu} {danh_muc_noi_that} {so_don} {ky_hieu} {ngay_viet} {don_gia} {gia_truoc_thue} {thue_vat} {phi_bao_tri} {tong_gia} {tong_gia_chu} {chinh_sach} — nội dung bắt đầu bằng thẻ HTML thì in theo HTML' },
    { k: 'bo', l: 'Thuộc bộ hồ sơ', t: 'sel', o: [['mua_ban', 'HS mua bán'], ['vay', 'HS hợp đồng vay'], ['tl_vay', 'HS thanh lý hợp đồng vay'], ['ban_giao', 'HS bàn giao'], ['tl_mua_ban', 'HS thanh lý mua bán']], help: 'Mẫu thuộc bộ hồ sơ nào ở màn «Bộ hồ sơ theo căn» (05): gõ mã căn → chọn bộ → in cả bộ / tải Word, số liệu tự điền theo căn. Để trống = không thuộc bộ nào' },   // 12/11/2026
    { k: 'scope', l: 'Áp dụng cho dự án / tòa', t: 'text', help: 'Tích chọn dự án / tòa ở khung bên dưới. Không tích = mẫu chung cho mọi dự án. Căn thuộc dự án / tòa nào chỉ thấy mẫu của dự án / tòa đó và mẫu chung' },
    { k: 'bedrooms', l: 'Áp dụng cho căn số phòng ngủ', t: 'int', help: 'Để trống = mọi loại căn' },
    { k: 'active', l: 'Đang dùng', t: 'bool', def: true },
  ], list: ['code', 'name', 'ent', 'bo', 'kind', 'scope', 'bedrooms', 'active'],
});

// menu (12 phân hệ). view = màn tự dựng; ent = danh sách thực thể
const MENU = [
  ['01', 'Tổng quan điều hành', 'fa-gauge-high', [['myday', 'Việc của tôi'], ['dashboard', 'Dashboard'], ['ai', 'Trợ lý AI tra cứu'], ['alerts', 'Cảnh báo tồn đọng'], ['approvals', 'Hộp phê duyệt']]],
  ['02', 'Dự án & giỏ hàng', 'fa-city', [['board', 'Bảng hàng'], ['projects', 'Danh mục dự án'], ['products', 'Danh mục sản phẩm/căn hộ', 'DA-01'], ['customers', 'Danh mục khách hàng', 'KH-01'], ['e:price_policy']]],
  ['03', 'Khách hàng tiềm năng', 'fa-users', [['e:contact_log']]],   // hồ sơ khách tự sinh từ kênh liên hệ (Website, Messenger, Zalo, Hotline, trực tiếp)
  ['04', 'Giao dịch bán hàng', 'fa-handshake-angle', [['e:sale_notice'], ['e:reservation'], ['e:noxh_check'], ['signing', 'Lịch ký hợp đồng'], ['payouts', 'Theo dõi thanh lý & chi trả', 'GD-04']]],
  ['05', 'Hồ sơ & hợp đồng', 'fa-file-contract', [['e:contract?group=can_ho', 'Hợp đồng căn hộ chung cư'], ['e:contract?group=lien_ke', 'Hợp đồng nhà liền kề'], ['loans', 'Theo dõi hợp đồng 3 bên', 'HD-05'], ['e:contract_change'], ['vault', 'Hồ sơ & lưu trữ theo căn', 'HD-06']]],
  ['06', 'Công nợ & kế hoạch thu', 'fa-sack-dollar', [['vouchers', 'Phiếu thu – Phiếu chi', 'CN-09'], ['loantrack', 'Theo dõi công nợ', 'CN-07'], ['unitstatus', 'Tình trạng công nợ đến hạn', 'CN-06'], ['ledger', 'Sổ công nợ căn hộ'], ['e:collect_plan']]],   // bỏ menu Nhật ký nhắc nợ (07/11/2026): ghi ở Tình trạng công nợ đến hạn, tự hiện ở Hồ sơ 360°
  ['07', 'Bàn giao căn hộ', 'fa-key', [['ready', 'Căn đủ điều kiện'], ['e:handover_notice'], ['e:handover'], ['e:defect']]],
  ['08', 'Cấp sổ hồng', 'fa-book', [['e:pinkbook']]],
  ['09', 'Chăm sóc khách hàng', 'fa-headset', [['e:ticket'], ['e:notice']]],
  ['10', 'Đại lý & cộng tác viên', 'fa-people-arrows', [['e:agent'], ['e:agent_alloc'], ['e:commission_policy'], ['e:commission']]],
  ['11', 'Báo cáo quản trị', 'fa-chart-pie', [['reports', 'Báo cáo tổng hợp'], ['e:report'], ['e:target']]],
  ['12', 'Quản trị hệ thống', 'fa-gear', [['users', 'Tài khoản – phân quyền'], ['catalog', 'Danh mục dùng chung'], ['flows', 'Luồng phê duyệt'], ['e:template'], ['audit', 'Nhật ký thao tác'], ['integr', 'Tích hợp MISA / Bravo / BSC']]],
];
// nơi mẫu biểu hiện (11/11/2026): mọi màn danh sách bản ghi trong menu — «04 Giao dịch bán hàng › Đăng ký mua / thuê – giữ chỗ»…
const VIEW_ENT = { products: ['unit'], customers: ['customer'], vouchers: ['receipt', 'payment'] };   // màn tự dựng nhưng mở bản ghi của thực thể
const TPL_PLACES = (() => {
  const out = new Map();
  for (const [code, mod, , items] of MENU) for (const [key, label] of items) {
    const ents = key.startsWith('e:') ? [key.slice(2).split('?')[0]] : VIEW_ENT[key] || [];
    for (const k of ents) {
      if (!E[k] || k === 'template' || out.has(k)) continue;
      const l = k === 'contract' ? 'Hợp đồng (căn hộ chung cư / nhà liền kề)' : ents.length > 1 ? E[k].title : label || E[k].title;
      out.set(k, `${code} ${mod} › ${l}`);
    }
  }
  return [...out];
})();
E.template.fields.find(f => f.k === 'ent').o = TPL_PLACES;
// màn tự dựng chỉ mở cho các vai trò
const VIEW_ROLES = {
  users: ['admin'], mau4: PII_ROLES, catalog: ['admin', 'truong_phong'], audit: ['admin', 'truong_phong', 'lanh_dao'], integr: ['admin', 'ke_toan', 'truong_phong'],
};

// danh mục dùng chung mặc định (quản trị sửa được)
const LOOKUPS = {
  nguon_khach: [['truc_tiep', 'Trực tiếp'], ['website', 'Website'], ['marketing', 'Chiến dịch marketing'], ['dai_ly', 'Đại lý'], ['ctv', 'Cộng tác viên'], ['gioi_thieu', 'Khách giới thiệu'], ['hotline', 'Hotline'], ['messenger', 'Messenger'], ['zalo', 'Zalo']],
  kenh: [['goi_dien', 'Gọi điện'], ['zalo', 'Zalo'], ['sms', 'Tin nhắn'], ['email', 'Email'], ['truc_tiep', 'Gặp trực tiếp'], ['website', 'Website'], ['messenger', 'Messenger'], ['hotline', 'Hotline']],
  nhom_noxh: [['cn_thu_nhap_thap', 'Người thu nhập thấp tại đô thị'], ['cong_nhan', 'Công nhân, người lao động KCN'], ['can_bo', 'Cán bộ, công chức, viên chức'], ['luc_luong_vt', 'Lực lượng vũ trang'], ['ho_ngheo', 'Hộ nghèo, cận nghèo'], ['khac', 'Đối tượng khác theo quy định']],
  hang_muc: [['san', 'Sàn'], ['tuong', 'Tường / sơn'], ['tran', 'Trần'], ['cua', 'Cửa'], ['tu_bep', 'Tủ bếp'], ['ve_sinh', 'Thiết bị vệ sinh'], ['dien', 'Điện'], ['nuoc', 'Cấp thoát nước'], ['khac', 'Khác']],
  bo_phan: [['cskh', 'CSKH'], ['ky_thuat', 'Kỹ thuật'], ['kinh_doanh', 'Kinh doanh'], ['ke_toan', 'Kế toán'], ['ban_quan_ly', 'Ban quản lý tòa nhà']],
};
const SETTINGS = {
  // theo mẫu «Biên bản bàn giao tài liệu hồ sơ mua nhà»: mỗi dòng «Tên giấy tờ | số lượng mặc định»
  checklist_noxh: { _all: ['Đơn đăng ký mua nhà | 1', 'Xác nhận đối tượng mua nhà | 2', 'Xác nhận về điều kiện nhà ở | 2', 'Xác nhận về điều kiện thu nhập | 2', 'Bảng kê lương 12 tháng | 2',
    'CMND/CCCD photo, chứng thực (Vợ và Chồng) | 2', 'Đăng ký kết hôn | 1', 'Xác nhận thông tin cư trú | 2', 'Bản cam kết | 1', 'Giấy khai sinh | 4'] },
  checklist_noxh_cu: { _all: ['Đơn đăng ký mua NOXH (mẫu hiện hành)', 'CCCD người đứng đơn và vợ/chồng', 'Giấy xác nhận đối tượng', 'Giấy xác nhận thực trạng nhà ở', 'Giấy xác nhận thu nhập', 'Giấy đăng ký kết hôn / xác nhận độc thân', 'Xác nhận cư trú'] },   // danh mục trước 27/10 — chỉ để nhận ra dữ liệu chưa sửa khi nâng cấp
  checklist_so_hong: ['Đơn đăng ký cấp GCN (mẫu hiện hành)', 'Hợp đồng mua bán bản chính', 'Biên bản bàn giao căn hộ', 'Biên bản thanh lý / xác nhận hoàn thành nghĩa vụ tài chính', 'CCCD chủ hợp đồng (và đồng sở hữu)', 'Giấy tờ hôn nhân', 'Tờ khai lệ phí trước bạ', 'Tờ khai thuế TNCN (nếu có)'],
  checklist_ban_giao: ['Biên bản bàn giao (bắt buộc)', 'Phiếu kiểm tra hiện trạng (bắt buộc)', 'Tài liệu hướng dẫn sử dụng', 'Chìa khóa', 'Thẻ từ / thẻ cư dân', 'Khách ký xác nhận hoàn tất (bắt buộc)'],
  sla_hours: { khan: 24, cao: 48, thuong: 72 },
  handover_pay_pct: 95,
  // nội dung các đợt thanh toán theo hợp đồng mua bán: chọn đợt ở form → gợi ý nội dung, tỷ lệ, hạn (sửa được). days = số ngày sau ngày ký; null = theo sự kiện, người nhập tự ghi ngày dự kiến
  schedule_contents: [
    { dot: 'Đợt 1', pct: 30, days: 0, name: 'Sau khi ký hợp đồng, Bên Mua thanh toán cho Bên Bán 30% giá trị căn hộ' },
    { dot: 'Đợt 2', pct: 40, days: 60, name: 'Sau 60 ngày kể từ ngày ký hợp đồng mua bán, Bên Mua thanh toán cho Bên Bán 40% giá trị căn hộ' },
    { dot: 'Đợt 3', pct: 25, days: null, name: 'Trong vòng 10 (mười) ngày kể từ ngày Bên Bán phát hành thông báo bàn giao Căn hộ gửi Bên Mua, Bên Mua thanh toán cho Bên Bán 25% giá trị căn hộ' },
    { dot: 'Đợt 4', pct: 5, days: null, name: 'Chậm nhất 15 (mười lăm) ngày kể từ ngày Bên Mua nhận được thông báo nhận bàn giao Giấy chứng nhận quyền sở hữu căn hộ, Bên Mua thanh toán cho Bên Bán 5% giá trị căn hộ còn lại' },
  ],
  schedule_presets: [
    { name: 'NOXH – 3 đợt', rows: [['Đợt 1 – ký HĐ', 30, 0], ['Đợt 2 – theo tiến độ', 40, 90], ['Đợt 3 – bàn giao', 25, 180], ['Đợt 4 – nhận GCN', 5, 365]] },
    { name: 'Thương mại – 5 đợt', rows: [['Đợt 1', 20, 0], ['Đợt 2', 20, 60], ['Đợt 3', 20, 120], ['Đợt 4', 35, 210], ['Đợt 5 – GCN', 5, 365]] },
  ],
  bravo: { last_sync: null, mode: 'Nhập tệp Excel xuất từ Bravo (chưa có API trực tiếp)' },
  bsc: { connected: false, note: 'Chưa thống nhất cơ chế tích hợp BSC' },
};

// cột tự tính (không lưu CSDL) — máy chủ điền khi trả danh sách
const VIRT = {
  id: 'Số', created_by: 'Người lập', created_at: 'Ngày lập', stage: 'Tiến trình giao dịch', paid: 'Đã thu', pay_status: 'Tình trạng kỳ thu',
  actual: 'Thực thu', gap: 'Chênh lệch', promise_st: 'Tình trạng cam kết', defects_open: 'Tồn tại chưa đóng', days_in: 'Ngày xử lý nội bộ',
  b_name: 'Họ và tên', days_out: 'Ngày tại cơ quan', sla: 'SLA', n_units: 'Số căn', n_hd: 'Căn có HĐMB', bg_amount: 'Tiền đợt bàn giao', bg_from: 'Tòa bàn giao từ ngày', n_reg: 'Đã đăng ký / giữ chỗ', n_free: 'Còn trống', project: 'Dự án', building: 'Tòa', stt: 'STT', prints: 'In bản đăng ký', ret_files: 'File scan trả hồ sơ', bbgn: 'In biên bản giao nhận',
};

module.exports = { M4, SELLERS, PROSPECT_ST, VIRT,  ROLES, ALL, MGR, PII_ROLES, E, MENU, VIEW_ROLES, LOOKUPS, SETTINGS, UNIT_ST, TPL_PLACES };
