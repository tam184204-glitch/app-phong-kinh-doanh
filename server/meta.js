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
  title: 'Tòa / khu', one: 'tòa', mod: '02', icon: 'fa-building', disp: "t.code||coalesce(' · '||t.name,'')",
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
  c: ['truong_phong'], a: MGR, fields: [
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
    { k: 'vat_pct', l: 'Thuế GTGT (%)', t: 'num', def: 5, help: 'NOXH 5% — dùng tách giá trước thuế / tiền thuế trong chi tiết bảng giá' },
    { k: 'src_file', l: 'Tệp nguồn (PDF)', t: 'text', upload: '.pdf', help: 'Chọn tệp PDF chính sách / bảng giá — lưu vào mục Tệp của chính sách' },
    { k: 'discount', l: 'Ưu đãi / chiết khấu', t: 'long' },
    { k: 'pay_method', l: 'Phương thức thanh toán', t: 'long' },
    { k: 'bank_policy', l: 'Chính sách ngân hàng', t: 'long' },
    { k: 'target', l: 'Đối tượng áp dụng', t: 'text' },
    { k: 'start_on', l: 'Ngày bắt đầu', t: 'date', req: 1 },
    { k: 'end_on', l: 'Ngày kết thúc', t: 'date', req: 1 },
    { k: 'unit_group', l: 'Căn hộ áp dụng', t: 'text', req: 1, def: '*', pick: 'units', help: 'Tích chọn tòa / từng căn trong bảng — * = cả dự án' },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'nhap', o: [['nhap', 'Nháp', 's'], ['cho_duyet', 'Chờ duyệt', 'a'], ['phat_hanh', 'Đã phát hành', 'g'], ['tu_choi', 'Từ chối', 'r'], ['thay_the', 'Đã thay thế', 's']] },
    { k: 'parent_id', l: 'Phiên bản trước', t: 'ref', ref: 'price_policy', ro: 1 },
  ], list: ['code', 'version', 'project_ids', 'unit_group', 'start_on', 'end_on', 'status'],
  lock: ['phat_hanh', 'thay_the', 'cho_duyet'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'phat_hanh' }, submitLabel: 'Trình duyệt' },
  acts: [{ k: 'new_version', l: 'Tạo phiên bản mới', icon: 'fa-code-branch', from: ['phat_hanh'], roles: ['truong_phong'] }],
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
  ['chuyen_hd', 'Đã chuyển hợp đồng', 'g'], ['het_han', 'Hết hạn / giải phóng', 's'], ['tu_choi', 'Từ chối', 'r'], ['huy', 'Đã hủy', 's']];
// phiếu đăng ký căn hộ (lập từ Bảng hàng): trạng thái căn + tiến trình do nhân viên chọn
const REG_ST = [['giu_cho', 'Giữ chỗ', 'a'], ['ky_hdmb', 'Ký HĐMB', 'g'], ['huy', 'Hủy đăng ký', 'r']];
const REG_PROG = [['tiep_nhan', 'Đã tiếp nhận hồ sơ', 's'], ['cho_xet_duyet', 'Đã nộp hồ sơ chờ xét duyệt', 'a'], ['du_dk', 'Đủ điều kiện ký HĐMB', 'b'], ['da_ky', 'Đã ký HĐMB', 'g']];
def('reservation', {
  title: 'Đăng ký mua – giữ chỗ', one: 'phiếu đăng ký', code: 'GD-01', mod: '04', icon: 'fa-hand-holding-hand', disp: "t.code||coalesce(' · '||t.cust_name,'')",
  purpose: 'Ghi nhận khách đăng ký mua căn, giữ căn cho khách', users: 'Nhân viên bán hàng',
  how: 'Bảng hàng → bấm căn Còn bán → lập phiếu đăng ký căn hộ → phiếu tự vào danh sách này, căn chuyển «Đang giữ chỗ» → cập nhật tiến trình → in bản đăng ký căn hộ / nội thất',
  rules: 'Chặn đăng ký trùng căn; khách chưa có hồ sơ thì tự tạo theo CCCD / số điện thoại; hủy đăng ký thì căn trở lại Còn bán, không tự hoàn tiền',
  c: ['ban_hang', 'truong_phong'], a: MGR, own: ['ban_hang'], search: ['code', 'cust_name', 'phone'], direct: 1, listPii: 1, fields: [
    { k: 'code', l: 'Mã phiếu', t: 'code', prefix: 'GD-{Y}-', pad: 4 },
    { k: 'unit_id', l: 'Mã căn hộ', t: 'ref', ref: 'unit', req: 1, filter: 'con_ban,chua_mo_ban', fill: { price: 'total_price', finish_value: 'finish_value' } },
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
    money('unit_value', 'Giá trị căn hộ', { help: 'Giá trị sau thuế + phí bảo trì — tự lấy theo Danh mục sản phẩm khi chọn căn' }),
    money('finish_value', 'Giá trị hoàn thiện nội thất'),
    money('price', 'Tổng giá bán', { help: 'Tự tính = Giá trị căn hộ + Giá trị hoàn thiện nội thất' }),
    { k: 'reg_state', l: 'Trạng thái căn hộ', t: 'sel', req: 1, def: 'giu_cho', o: REG_ST },
    { k: 'progress', l: 'Tiến trình giao dịch', t: 'sel', req: 1, def: 'tiep_nhan', o: REG_PROG },
    { k: 'policy_id', l: 'Chính sách áp dụng', t: 'ref', ref: 'price_policy', filter: 'phat_hanh', help: 'Để trống → tự lấy chính sách bán hàng đang phát hành cho căn' },
    { k: 'note', l: 'Ghi chú', t: 'long' },
    { k: 'reg_at', l: 'Ngày giờ đăng ký', t: 'dt', req: 1, def: 'now', help: 'Tự lấy giờ hiện tại khi mở phiếu — sửa được' },
    { k: 'reg_date', l: 'Ngày đăng ký', t: 'date', hide: 1 },   // = ngày của reg_at (giờ VN), giữ cho giá / hoa hồng / kiểm tra hạn
    { k: 'hold_until', l: 'Hạn giữ chỗ', t: 'dt', help: 'Để trống = giữ đến khi ký HĐMB / hủy đăng ký' },
    money('deposit', 'Số tiền đặt cọc', { hide: 1 }),   // bỏ khỏi phiếu đăng ký — ghi qua nút «Ghi nhận đặt cọc»
    { k: 'deposit_on', l: 'Ngày đặt cọc', t: 'date' },
    { k: 'docs_deadline', l: 'Hạn hoàn thiện hồ sơ', t: 'date' },
    { k: 'source', l: 'Nguồn bán', t: 'sel', req: 1, def: 'truc_tiep', o: [['truc_tiep', 'Trực tiếp'], ['dai_ly', 'Đại lý / sàn'], ['ctv', 'Cộng tác viên']] },
    { k: 'agent_id', l: 'Đại lý bán hàng', t: 'ref', ref: 'agent', show: { source: ['dai_ly', 'ctv'] } },
    owner('Người thực hiện', { hide: 1 }),   // tự lấy người lập phiếu
    { k: 'status', l: 'Tình trạng phiếu', t: 'sel', o: RES_ST, ro: 1, def: 'nhap' },
  ], list: ['stt', 'unit_id', 'cust_code', 'cust_name', 'id_no', 'id_date', 'id_place', 'address', 'phone', 'unit_value', 'finish_value', 'price', 'reg_at', 'hold_until', 'reg_state', 'progress', 'agent_id', 'note', 'prints'],
  lock: ['chuyen_hd', 'het_han', 'huy', 'cho_duyet'], lockKeep: ['note', 'progress', 'reg_state'],
  flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'giu_cho' } },
  acts: [
    { k: 'deposit', l: 'Ghi nhận đặt cọc', icon: 'fa-money-bill-wave', from: ['giu_cho', 'qua_han'], roles: ['ban_hang', 'truong_phong'], ask: [money('deposit', 'Số tiền đặt cọc', { req: 1 }), { k: 'deposit_on', l: 'Ngày đặt cọc', t: 'date', req: 1, def: 'today' }] },
    { k: 'extend', l: 'Gia hạn giữ chỗ', icon: 'fa-clock-rotate-left', from: ['giu_cho', 'qua_han'], roles: MGR, ask: [{ k: 'hold_until', l: 'Hạn giữ chỗ mới', t: 'dt', req: 1 }, { k: 'reason', l: 'Lý do', t: 'long', req: 1 }] },
    { k: 'release', l: 'Giải phóng căn', icon: 'fa-unlock', from: ['giu_cho', 'qua_han'], roles: MGR, danger: 1, ask: [{ k: 'reason', l: 'Lý do / phương án xử lý tiền đã nộp', t: 'long', req: 1 }] },
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
  quan_he: ['Vợ (Chồng)', 'Con', 'Anh, chị, em', 'Cha (Mẹ)', 'Ông (Bà)', 'Cháu'],
};
def('noxh_check', {
  title: 'Hồ sơ mua NOXH', one: 'hồ sơ', code: 'GD-02', mod: '04', icon: 'fa-list-check', disp: "'NOXH #'||t.id",
  purpose: 'Kiểm tra hồ sơ theo nhóm đối tượng', users: 'Nhân viên quản lý hồ sơ',
  how: 'Tiếp nhận → khai thông tin hộ (chủ hộ + thành viên) theo Mẫu 4 → đối chiếu giấy tờ, ghi số lượng → in biên bản giao nhận → trình xét duyệt → xuất Bảng tổng hợp Mẫu 4',
  rules: 'Checklist phải cập nhật theo quy định hiện hành; không tự kết luận đủ điều kiện pháp lý',
  note: 'App hỗ trợ kiểm tra, quản lý hồ sơ; không thay thế quyết định xét duyệt của cơ quan hoặc người có thẩm quyền.',
  c: ['ho_so', 'truong_phong', 'ban_hang'], u: ['ho_so', 'truong_phong'], a: MGR, fields: [
    // bố cục theo «phiếu hồ sơ mua nhà.xlsx»: 1. thông tin căn hộ → thông tin tài khoản → 2. thông tin khách hàng (chủ hộ 1 dòng như Mẫu 4 + thành viên) → 3. thông tin hồ sơ
    { k: 'project_id', l: 'Tên dự án', t: 'ref', ref: 'project', sec: '1. Thông tin căn hộ', help: 'Chọn căn thì tự lấy theo căn' },
    { k: 'unit_id', l: 'Mã căn hộ', t: 'ref', ref: 'unit', fill: { unit_area: 'area_tt' } },
    { k: 'unit_area', l: 'Diện tích thông thủy (m²)', t: 'num', help: 'Tự cập nhật theo Danh mục sản phẩm' },
    { k: 'received_on', l: 'Ngày nộp hồ sơ', t: 'date', def: 'today' },
    { k: 'reg_kind', l: 'Hình thức mua', t: 'sel', def: 'mua', o: M4.hinh_thuc },
    { k: 'unit_text', l: 'Mã căn hộ ngoài danh mục', t: 'text', help: 'Chỉ ghi khi căn chưa có trong Danh mục sản phẩm (VD CTS-L-0511)' },
    { k: 'customer_id', l: 'Khách hàng', t: 'ref', ref: 'customer', sec: 'Thông tin tài khoản', help: 'Để trống → tự khớp theo CCCD / SĐT chủ hộ hoặc tạo khách mới' },
    { k: 'reservation_id', l: 'Phiếu giữ chỗ', t: 'ref', ref: 'reservation' },
    { k: 'head', l: '2.1 Thông tin chủ hộ', t: 'json', sec: '2. Thông tin khách hàng', fixed: 1, grid: [
      { k: 'name', l: 'Họ và Tên', w: 170 }, { k: 'phone', l: 'Số điện thoại', w: 115 }, { k: 'bday', l: 'Ngày sinh', w: 60, pii: 1 }, { k: 'bmonth', l: 'Tháng sinh', w: 60, pii: 1 }, { k: 'byear', l: 'Năm sinh', w: 70, pii: 1 },
      { k: 'old_id_no', l: 'Số CMND', w: 110, pii: 1 }, { k: 'id_no', l: 'Số CCCD', w: 125, pii: 1 }, { k: 'job', l: 'Nghề nghiệp', sug: M4.nghe, w: 170 },
      { k: 'doi_tuong', l: 'Đối tượng chính sách được hưởng nhà ở xã hội', sug: M4.doi_tuong, w: 240 }, { k: 'confirm_org', l: 'Cơ quan xác nhận về đối tượng', w: 180 },
      { k: 'housing', l: 'Điều kiện nhà ở (mô tả đúng hiện trạng nhà ở được VPĐKĐĐ xác nhận)', sug: M4.nha_o, w: 240 },
      { k: 'province', l: 'Tỉnh', w: 100 }, { k: 'district', l: 'Huyện/ Thành phố', w: 120 }, { k: 'commune', l: 'Thị trấn/xã', w: 120 },
      { k: 'income', l: 'Điều kiện thu nhập (mô tả theo đúng nội dung Giấy xác nhận)', sug: M4.thu_nhap, w: 240 }, { k: 'relation', l: 'Quan hệ với chủ hộ', w: 90, ro: 1, def: 'Chủ hộ' }] },
    { k: 'members', l: '2.2 Thành viên hộ gia đình (ngoài chủ hộ)', t: 'json', grid: [
      { k: 'name', l: 'Họ và Tên', w: 170 }, { k: 'phone', l: 'Số điện thoại', w: 115 }, { k: 'birth', l: 'Ngày sinh', ph: 'dd/mm/yyyy', w: 105, pii: 1 },
      { k: 'old_id_no', l: 'Số CMND', w: 110, pii: 1 }, { k: 'id_no', l: 'Số CCCD', w: 125, pii: 1 }, { k: 'job', l: 'Nghề nghiệp', sug: M4.nghe, w: 170 },
      { k: 'doi_tuong', l: 'Đối tượng chính sách', sug: M4.doi_tuong, w: 220 }, { k: 'confirm_org', l: 'Cơ quan xác nhận', w: 170 }, { k: 'relation', l: 'Quan hệ với chủ hộ', o: M4.quan_he, w: 120 }] },
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
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'nhap', o: [['nhap', 'Đang tiếp nhận', 's'], ['cho_duyet', 'Chờ xét duyệt', 'a'], ['da_duyet', 'Đạt xét duyệt nội bộ', 'g'], ['tu_choi', 'Không đạt / trả lại', 'r']] },
    owner('Người tiếp nhận'),
  ], list: ['id', 'received_on', 'customer_id', 'unit_id', 'doi_tuong', 'items', 'result', 'supplement_due', 'status', 'bbgn'],
  lock: ['da_duyet', 'cho_duyet'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet', no: 'tu_choi' }, submitLabel: 'Trình xét duyệt', needAll: 'items' },
  acts: [{ k: 'print_bbgn', l: 'In biên bản giao nhận hồ sơ', icon: 'fa-print', from: '*', roles: ALL, handover: 'noxh' },
    { k: 'review', l: 'Ghi bước kiểm tra', icon: 'fa-clipboard-check', from: ['nhap', 'cho_duyet'], roles: ['ho_so', 'truong_phong'],
    ask: [{ k: 'step', l: 'Bước', t: 'sel', req: 1, o: [['kiem_tra_1', 'Kiểm tra lần 1'], ['kiem_tra_cheo', 'Kiểm tra chéo'], ['doi_chieu_goc', 'Đối chiếu bản gốc']] }, { k: 'conclusion', l: 'Kết luận', t: 'sel', req: 1, o: [['dat', 'Đạt'], ['can_bo_sung', 'Cần bổ sung']] }, { k: 'note', l: 'Ghi chú', t: 'long' }] }],
});
def('cancel_req', {
  title: 'Hủy giao dịch – đổi căn', one: 'đề nghị', mod: '04', icon: 'fa-right-left', disp: 't.code',
  how: 'Lập đề nghị → duyệt → ký thanh lý HĐMB → bàn giao hồ sơ cho kế toán → chi tiền; ngày dự kiến chi trả = ngày ký thanh lý + thời gian chờ, cảnh báo trước 30 ngày',
  c: ['ban_hang', 'truong_phong', 'ho_so'], u: ['ban_hang', 'truong_phong', 'ho_so', 'cong_no', 'ke_toan'], a: MGR, fields: [
    { k: 'code', l: 'Mã đề nghị', t: 'code', prefix: 'HG-{Y}-', pad: 4 },
    { k: 'kind', l: 'Loại đề nghị', t: 'sel', req: 1, o: [['huy', 'Hủy giao dịch'], ['doi_can', 'Đổi căn'], ['doi_kh', 'Thay đổi khách hàng']] },
    { k: 'reservation_id', l: 'Phiếu giữ chỗ', t: 'ref', ref: 'reservation' },
    { k: 'contract_id', l: 'Hợp đồng', t: 'ref', ref: 'contract' },
    { k: 'new_unit_id', l: 'Căn mới', t: 'ref', ref: 'unit', filter: 'con_ban', show: { kind: ['doi_can'] } },
    { k: 'new_customer_id', l: 'Khách hàng mới', t: 'ref', ref: 'customer', show: { kind: ['doi_kh'] } },
    { k: 'reason', l: 'Lý do', t: 'long', req: 1 },
    { k: 'money_plan', l: 'Phương án xử lý tiền đã nộp', t: 'sel', req: 1, o: [['giu_lai', 'Giữ lại theo chính sách'], ['hoan_tien', 'Hoàn tiền (lập đề nghị hoàn)'], ['chuyen_can_moi', 'Chuyển sang căn / khách mới'], ['khong_phat_sinh', 'Không phát sinh']] },
    { k: 'money_note', l: 'Diễn giải xử lý tiền', t: 'long' },
    { k: 'liquidate_on', l: 'Ngày ký thanh lý HĐMB', t: 'date', sec: 'Thanh lý & chi trả' },
    { k: 'wait_days', l: 'Thời gian chờ chi trả (ngày)', t: 'int', def: 30 },
    { k: 'pay_due', l: 'Ngày dự kiến chi trả', t: 'date', ro: 1, help: 'Ngày ký thanh lý + thời gian chờ chi trả' },
    money('pay_amount', 'Số tiền chi trả (đồng)'),
    { k: 'acct_status', l: 'Tình trạng bàn giao hồ sơ cho kế toán', t: 'sel', def: 'chua', o: [['chua', 'Chưa bàn giao', 'a'], ['da', 'Đã bàn giao', 'g']] },
    { k: 'acct_on', l: 'Ngày bàn giao hồ sơ', t: 'date' },
    { k: 'pay_status', l: 'Tình trạng chi tiền', t: 'sel', def: 'chua_chi', o: [['chua_chi', 'Chưa chi', 'a'], ['mot_phan', 'Chi một phần', 'b'], ['da_chi', 'Đã chi', 'g'], ['khong_chi', 'Không phát sinh chi', 's']] },
    { k: 'paid_on', l: 'Ngày chi tiền thực tế', t: 'date' },
    { k: 'note', l: 'Ghi chú', t: 'long' },
    { k: 'status', l: 'Trạng thái', t: 'sel', o: S.duyet, ro: 1, def: 'nhap' },
  ], list: ['code', 'kind', 'reservation_id', 'contract_id', 'money_plan', 'liquidate_on', 'pay_due', 'pay_amount', 'pay_status', 'status'],
  lock: ['da_duyet', 'cho_duyet'], lockKeep: ['liquidate_on', 'wait_days', 'pay_amount', 'acct_status', 'acct_on', 'pay_status', 'paid_on', 'note'], flow: { field: 'status', submit: ['nhap', 'tu_choi'], approve: { ok: 'da_duyet' } },
  files: [['don_de_nghi', 'Đơn đề nghị của khách', 1]],
});

// ===================== 05. HỒ SƠ & HỢP ĐỒNG =====================
// phân loại theo màn Bravo «Cập nhật hợp đồng căn hộ»: tự lấy theo loại căn (liền kề / shophouse = nhà liền kề)
const HD_PTYPE = [['can_ho', 'Hợp đồng căn hộ chung cư'], ['lien_ke', 'Hợp đồng nhà liền kề']];
const CT_ONLY = { ptype: ['can_ho'] }, LK_ONLY = { ptype: ['lien_ke'] };
const HD_KIND = [['hdmb', 'HĐ mua bán'], ['thue', 'HĐ thuê'], ['thue_mua', 'HĐ thuê mua'], ['hoan_thien', 'HĐ thỏa thuận hoàn thiện']];
// bên bán (chủ đầu tư) theo BRAVO: chọn Đơn vị / Bên A → tự điền thông tin bên bán (ô trống lấy theo hợp đồng gần nhất cùng Bên A)
const SELLERS = [
  { unit: 'A01: Công ty Cổ phần Cát Tường', name: 'Công ty Cổ phần Cát Tường', addr: 'Tầng 3 tòa CTN, đường Lý Thái Tổ, Phường Tiền Ninh Vệ, TP Bắc Ninh, Tỉnh Bắc Ninh', projects: [] },
  { unit: 'A02: Công ty CP TM&ĐTPT Thống Nhất', name: 'Công ty CP TM&ĐTPT Thống Nhất', addr: '', projects: ['TNS', 'TN'] },
];
const CHUC_VU = ['Tổng Giám đốc', 'Phó Tổng Giám đốc', 'Giám đốc', 'Phó Giám đốc', 'Trưởng phòng Kinh doanh'];
def('contract', {
  title: 'Sổ theo dõi hợp đồng', one: 'hợp đồng', code: 'HD-01', mod: '05', icon: 'fa-file-contract', disp: "t.number",
  purpose: 'Theo dõi ký kết và lưu hợp đồng', users: 'Nhân viên quản lý hợp đồng',
  how: 'Tạo dự thảo → rà soát → lịch ký → ký → tải bản ký → chốt dữ liệu',
  rules: 'Không thay trực tiếp bản đã ký; số hợp đồng không trùng theo quy tắc',
  c: ['ho_so', 'truong_phong'], a: MGR, search: ['number', 'code'], files: [['ban_ky', 'Bản hợp đồng đã ký'], ['du_thao', 'Dự thảo'], ['giay_to', 'Giấy tờ khách hàng']],
  groups: { can_ho: 'Hợp đồng căn hộ chung cư', lien_ke: 'Hợp đồng nhà liền kề' }, fields: [
    { k: 'code', l: 'Mã hồ sơ', t: 'code', prefix: 'HS-{Y}-', pad: 4 },
    { k: 'ptype', l: 'Phân loại', t: 'sel', o: HD_PTYPE, def: 'can_ho', sec: 'Chi tiết hợp đồng', help: 'Tự lấy theo loại căn khi chọn căn' },
    { k: 'kind', l: 'Loại hợp đồng', t: 'sel', req: 1, o: HD_KIND, def: 'hdmb' },
    { k: 'contract_on', l: 'Ngày hợp đồng', t: 'date', def: 'today' },
    { k: 'number', l: 'Số hợp đồng', t: 'text', uniq: 1, help: 'Để trống → tự cấp HDCH.YYMM-0001 (chung cư) / HDLK.YYMM-0001 (liền kề)' },
    { k: 'seller_unit', l: 'Đơn vị', t: 'text', def: SELLERS[0].unit, sug: SELLERS.map(s => s.unit), help: 'Chọn căn → tự lấy theo dự án' },
    { k: 'agreement', l: 'Văn bản thỏa thuận', t: 'text' },
    { k: 'unit_id', l: 'Mã căn', t: 'ref', ref: 'unit', req: 1,
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
    // bên bán nhà ở
    { k: 's_name', l: 'Bên A', t: 'text', def: SELLERS[0].name, sug: SELLERS.map(s => s.name), sec: 'Bên bán nhà ở', help: 'Chọn Bên A → tự điền các ô bên bán' },
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
    { k: 'price_policy_id', l: 'Số bảng giá', t: 'ref', ref: 'price_policy', sec: 'Thông tin chi tiết' },
    money('base_price', 'Giá nền (chưa VAT) đ/m²', { show: CT_ONLY }),
    { k: 'area_tt', l: 'Diện tích nền (thông thủy) m²', t: 'num', show: CT_ONLY },
    money('floor_price', 'Giá sàn đ/m²', { show: CT_ONLY }),
    { k: 'area_floor', l: 'Diện tích sàn m²', t: 'num', show: CT_ONLY },
    { k: 'area_land', l: 'Diện tích đất m²', t: 'num', show: LK_ONLY },
    money('land_price', 'Đơn giá đất đ/m²', { show: LK_ONLY }),
    money('land_amt', 'Tiền sử dụng đất', { show: LK_ONLY }),
    { k: 'area_build', l: 'Diện tích xây dựng m²', t: 'num', show: LK_ONLY },
    money('build_price', 'Đơn giá xây dựng đ/m²', { show: LK_ONLY }),
    money('build_amt', 'Giá trị xây dựng', { show: LK_ONLY }),
    money('discount', 'Tiền giảm giá'),
    money('pretax', 'Tiền trước thuế'),
    { k: 'vat_pct', l: 'Thuế suất %', t: 'num' },
    money('vat_amt', 'Tiền thuế', { help: 'Để trống → trước thuế × thuế suất' }),
    money('after_tax', 'Tiền sau thuế', { help: 'Để trống → trước thuế + tiền thuế' }),
    money('finish_value', 'Giá trị hoàn thiện'),
    money('maint_fee', 'Phí bảo trì'),
    { k: 'corner_pct', l: 'Hệ số góc %', t: 'num' },
    money('corner_amt', 'Tiền hệ số góc'),
    money('value', 'Tổng tiền (giá trị hợp đồng)', { req: 1, help: 'Chung cư có giá nền: tự tính = tiền sau thuế + phí bảo trì + giá trị hoàn thiện' }),
    { k: 'closed', l: 'Hợp đồng đóng', t: 'bool' },
    { k: 'cn', l: 'CN', t: 'bool' },
    { k: 'vbtt_hold', l: 'Tạm đóng VBTT', t: 'bool' },
    { k: 'new_schedule', l: 'Lần TT · % · Giá trị VND', t: 'json', sec: 'Lần thanh toán', help: 'Nhập tỷ lệ % → giá trị tự tính theo Tổng tiền' },
    { k: 'pay_method', l: 'Phương thức thanh toán', t: 'text' },
    { k: 'plan_sign', l: 'Ngày dự kiến ký', t: 'date' },
    { k: 'sign_place', l: 'Địa điểm ký', t: 'text' },
    { k: 'sign_status', l: 'Tình trạng lịch ký', t: 'sel', def: 'chua_lien_he', o: [['chua_lien_he', 'Chưa liên hệ', 's'], ['da_lien_he', 'Đã liên hệ', 'b'], ['da_hen', 'Đã hẹn', 'v'], ['can_bo_sung', 'Cần bổ sung hồ sơ', 'a'], ['da_ky', 'Đã ký', 'g']] },
    { k: 'signed_on', l: 'Ngày ký thực tế', t: 'date', ro: 1 },
    { k: 'package_id', l: 'Gói hoàn thiện', t: 'ref', ref: 'package', show: { kind: ['hoan_thien'] } },
    { k: 'design_change', l: 'Thay đổi thiết kế', t: 'long', show: { kind: ['hoan_thien'] } },
    { k: 'accept_on', l: 'Ngày nghiệm thu', t: 'date', show: { kind: ['hoan_thien'] } },
    { k: 'term_months', l: 'Thời hạn (tháng)', t: 'int', show: { kind: ['thue', 'thue_mua'] } },
    money('rent', 'Giá thuê / kỳ', { show: { kind: ['thue', 'thue_mua'] } }),
    { k: 'pay_period', l: 'Kỳ thanh toán', t: 'sel', o: [['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm']], show: { kind: ['thue', 'thue_mua'] } },
    { k: 'free_months', l: 'Miễn tiền thuê (tháng)', t: 'int', show: { kind: ['thue', 'thue_mua'] } },
    { k: 'eff_on', l: 'Ngày hiệu lực', t: 'date', show: { kind: ['thue', 'thue_mua'] } },
    { k: 'exp_on', l: 'Ngày hết hạn', t: 'date', show: { kind: ['thue', 'thue_mua'] } },
    owner('Nhân viên KD'),
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'du_thao', o: [['du_thao', 'Dự thảo', 's'], ['cho_duyet', 'Đang rà soát', 'a'], ['cho_ky', 'Chờ ký', 'b'], ['tu_choi', 'Trả lại dự thảo', 'r'], ['da_ky', 'Đã ký', 'g'], ['thanh_ly', 'Đã thanh lý', 't'], ['huy', 'Đã hủy', 's']] },
  ], list: ['number', 'contract_on', 'kind', 'unit_id', 'customer_id', 'value', 'plan_sign', 'sign_status', 'signed_on', 'status'],
  lock: ['da_ky', 'thanh_ly', 'huy', 'cho_duyet'], lockKeep: ['sign_status', 'sign_place', 'plan_sign', 'owner_id'],
  flow: { field: 'status', submit: ['du_thao', 'tu_choi'], approve: { ok: 'cho_ky' }, submitLabel: 'Gửi rà soát' },
  acts: [
    { k: 'schedule', l: 'Lập lịch thanh toán', icon: 'fa-calendar-days', from: ['du_thao', 'tu_choi'], roles: ['ho_so', 'cong_no', 'truong_phong'] },
    { k: 'sign', l: 'Xác nhận đã ký', icon: 'fa-signature', from: ['cho_ky'], roles: ['ho_so', 'truong_phong'], ask: [{ k: 'signed_on', l: 'Ngày ký thực tế', t: 'date', req: 1, def: 'today' }], help: 'Cần tải «Bản hợp đồng đã ký» trước' },
    { k: 'liquidate', l: 'Thanh lý', icon: 'fa-box-archive', from: ['da_ky'], roles: MGR, ask: [{ k: 'reason', l: 'Căn cứ thanh lý', t: 'long', req: 1 }] },
    { k: 'print', l: 'In theo mẫu', icon: 'fa-print', from: '*', roles: ALL },
  ],
});
def('installment', {
  title: 'Lịch thanh toán hợp đồng', one: 'kỳ thu', code: 'CN-02', mod: '06', icon: 'fa-calendar-check', disp: "t.name",
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
    { k: 'src', l: 'Căn cứ', t: 'sel', ro: 1, def: 'hop_dong', o: [['hop_dong', 'Hợp đồng', 'b'], ['phu_luc', 'Phụ lục', 'v']] },
    { k: 'active', l: 'Hiệu lực', t: 'bool', ro: 1, def: true },
  ], list: ['contract_id', 'seq', 'name', 'due_on', 'pct', 'amount', 'paid', 'pay_status', 'src'],
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
def('receipt', {
  title: 'Thu tiền (đồng bộ Bravo)', one: 'chứng từ', mod: '06', icon: 'fa-receipt', disp: 't.voucher_no',
  note: 'Bravo là nguồn gốc số thực thu. Nhân viên kinh doanh không được sửa; kế toán nhập/đồng bộ và chỉ được hủy chứng từ có lý do.',
  c: ['ke_toan'], u: [], d: [], order: 't.voucher_date desc', search: ['voucher_no', 'content'], fields: [
    { k: 'voucher_no', l: 'Mã chứng từ', t: 'text', req: 1, uniq: 1 },
    { k: 'voucher_date', l: 'Ngày thu', t: 'date', req: 1 },
    { k: 'contract_id', l: 'Hợp đồng', t: 'ref', ref: 'contract', req: 1 },
    money('amount', 'Số tiền', { req: 1 }),
    { k: 'content', l: 'Nội dung thanh toán', t: 'text' },
    { k: 'installment_id', l: 'Khoản phải thu', t: 'ref', ref: 'installment', help: 'Để trống = tự phân bổ vào kỳ đến hạn sớm nhất' },
    { k: 'src', l: 'Nguồn', t: 'sel', ro: 1, def: 'thu_cong', o: [['bravo', 'Bravo', 'b'], ['thu_cong', 'Kế toán nhập', 's']] },
    { k: 'synced_at', l: 'Ngày chốt dữ liệu', t: 'dt', ro: 1 },
    { k: 'status', l: 'Trạng thái', t: 'sel', ro: 1, def: 'hop_le', o: [['hop_le', 'Hợp lệ', 'g'], ['huy', 'Đã hủy', 'r']] },
    { k: 'void_reason', l: 'Lý do hủy', t: 'text', ro: 1 },
  ], list: ['voucher_no', 'voucher_date', 'contract_id', 'amount', 'content', 'src', 'synced_at', 'status'],
  acts: [{ k: 'void', l: 'Hủy chứng từ', icon: 'fa-ban', from: ['hop_le'], roles: ['ke_toan'], danger: 1, ask: [{ k: 'reason', l: 'Lý do hủy', t: 'long', req: 1 }] }],
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
  c: ['admin', 'truong_phong'], fields: [
    { k: 'code', l: 'Mã mẫu', t: 'text', req: 1, uniq: 1 },
    { k: 'name', l: 'Tên mẫu', t: 'text', req: 1 },
    { k: 'kind', l: 'Loại', t: 'sel', req: 1, o: [['hop_dong', 'Hợp đồng'], ['phu_luc', 'Phụ lục'], ['bien_ban', 'Biên bản'], ['de_nghi', 'Phiếu đề nghị'], ['thong_bao', 'Thông báo'], ['bao_cao', 'Báo cáo'], ['dang_ky_can', 'Bản đăng ký căn hộ'], ['dang_ky_noi_that', 'Bản đăng ký nội thất'], ['bien_ban_giao_nhan', 'Biên bản giao nhận hồ sơ']] },
    { k: 'content', l: 'Nội dung mẫu', t: 'long', req: 1, help: 'Trường trộn: {so_hd} {ten_kh} {dien_thoai} {cccd} {dia_chi} {ma_can} {du_an} {toa} {tang} {dien_tich} {gia_tri} {gia_tri_chu} {ngay} {lich_thanh_toan} — bản đăng ký: {ma_phieu} {ngay_dk} {tien_coc} {trang_thai} {tien_trinh} {ghi_chu} {goi_hoan_thien} {gia_tri_hoan_thien} {gia_tri_hoan_thien_chu} {danh_muc_noi_that} {so_don} {ky_hieu} {ngay_viet} {don_gia} {gia_truoc_thue} {thue_vat} {phi_bao_tri} {tong_gia} {tong_gia_chu} {chinh_sach} — nội dung bắt đầu bằng thẻ HTML thì in theo HTML' },
    { k: 'scope', l: 'Áp dụng cho dự án / tòa', t: 'text', help: 'Mã dự án hoặc mã tòa, cách nhau dấu phẩy (TNS, G…) — để trống = mọi căn' },
    { k: 'bedrooms', l: 'Áp dụng cho căn số phòng ngủ', t: 'int', help: 'Để trống = mọi loại căn' },
    { k: 'active', l: 'Đang dùng', t: 'bool', def: true },
  ], list: ['code', 'name', 'kind', 'scope', 'bedrooms', 'active'],
});

// menu (12 phân hệ). view = màn tự dựng; ent = danh sách thực thể
const MENU = [
  ['01', 'Tổng quan điều hành', 'fa-gauge-high', [['dashboard', 'Dashboard'], ['ai', 'Trợ lý AI tra cứu'], ['alerts', 'Cảnh báo tồn đọng'], ['approvals', 'Hộp phê duyệt']]],
  ['02', 'Dự án & giỏ hàng', 'fa-city', [['board', 'Bảng hàng'], ['projects', 'Danh mục dự án'], ['products', 'Danh mục sản phẩm/căn hộ', 'DA-01'], ['customers', 'Danh mục khách hàng', 'KH-01'], ['e:price_policy']]],
  ['03', 'Khách hàng tiềm năng', 'fa-users', [['e:contact_log']]],   // hồ sơ khách tự sinh từ kênh liên hệ (Website, Messenger, Zalo, Hotline, trực tiếp)
  ['04', 'Giao dịch bán hàng', 'fa-handshake-angle', [['e:reservation'], ['e:noxh_check'], ['e:cancel_req'], ['payouts', 'Theo dõi thanh lý & chi trả', 'GD-04']]],
  ['05', 'Hồ sơ & hợp đồng', 'fa-file-contract', [['e:contract?group=can_ho', 'Hợp đồng căn hộ chung cư'], ['e:contract?group=lien_ke', 'Hợp đồng nhà liền kề'], ['signing', 'Lịch ký hợp đồng'], ['e:contract_change'], ['vault', 'Lưu trữ hồ sơ pháp lý']]],
  ['06', 'Công nợ & kế hoạch thu', 'fa-sack-dollar', [['ledger', 'Sổ công nợ căn hộ'], ['e:installment'], ['e:receipt'], ['e:collect_plan'], ['e:debt_call'], ['e:refund']]],
  ['07', 'Bàn giao căn hộ', 'fa-key', [['ready', 'Căn đủ điều kiện'], ['e:handover'], ['e:defect']]],
  ['08', 'Cấp sổ hồng', 'fa-book', [['e:pinkbook']]],
  ['09', 'Chăm sóc khách hàng', 'fa-headset', [['e:ticket'], ['e:notice']]],
  ['10', 'Đại lý & cộng tác viên', 'fa-people-arrows', [['e:agent'], ['e:agent_alloc'], ['e:commission_policy'], ['e:commission']]],
  ['11', 'Báo cáo quản trị', 'fa-chart-pie', [['reports', 'Báo cáo tổng hợp'], ['e:report'], ['e:target']]],
  ['12', 'Quản trị hệ thống', 'fa-gear', [['users', 'Tài khoản – phân quyền'], ['catalog', 'Danh mục dùng chung'], ['flows', 'Luồng phê duyệt'], ['e:template'], ['audit', 'Nhật ký thao tác'], ['integr', 'Tích hợp Bravo / BSC']]],
];
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
  days_out: 'Ngày tại cơ quan', sla: 'SLA', project: 'Dự án', building: 'Tòa', stt: 'STT', prints: 'In bản đăng ký', bbgn: 'In biên bản giao nhận',
};

module.exports = { M4, SELLERS, PROSPECT_ST, VIRT,  ROLES, ALL, MGR, PII_ROLES, E, MENU, VIEW_ROLES, LOOKUPS, SETTINGS, UNIT_ST };
