'use strict';
// Mẫu in đơn đăng ký theo file Excel của phòng Kinh doanh (27/10/2026):
//   «Đơn đăng ký G.xlsx» (tờ Đơn dky), «Đơn Đăng ký O.xlsx» (tờ Đơn dky), «Đơn đăng ký G (NT).xlsx» (tờ Đki NT 2 ngủ / 3 ngủ).
// Nội dung là HTML có trường trộn {…}; chỉ lấy các dòng đang hiện trong file (dòng ẩn bỏ). Sửa được ở Quản trị › Mẫu biểu.
const { moneyWords } = require('./io');

// thể thức văn bản theo NĐ 30/2020: quốc hiệu in hoa đậm, tiêu ngữ đậm có gạch liền bên dưới
const quoc_hieu = `<div class="qh"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b class="tn">Độc lập - Tự do - Hạnh phúc</b></div>`;
const khach = `<p class="h">1. Thông tin khách hàng</p>
<p>Ông (Bà): <b>{ten_kh}</b></p>
<table class="kv3"><tr><td>Số CC/CCCD: {cccd}</td><td>Ngày cấp: {ngay_cap}</td></tr></table>
<p>Nơi cấp: {noi_cap}</p>
<p>Địa chỉ: {dia_chi}</p>
<p>Số điện thoại: {dien_thoai}</p>`;
const ky = `<table class="sign"><tr><td></td><td><b>Người làm đơn</b><br><i>(Ký, ghi rõ họ tên)</i><br><br><br><br><b>{ten_kh}</b></td></tr></table>`;

function donMua({ cdt, ten, du_an, dot }) {
  return `${quoc_hieu}
<h2>ĐƠN ĐĂNG KÝ MUA CĂN HỘ</h2>
<div class="c">Số: {so_don}/BĐK-KH{ky_hieu}</div>
<p class="c"><b>Kính gửi: ${cdt}</b></p>
<p class="j">Sau khi tìm hiểu đầy đủ thông tin về Dự án ${du_an} do ${ten} làm Chủ Đầu Tư. Tôi/Chúng Tôi có nguyện vọng được đăng ký chọn mua căn hộ tại Dự Án ngay khi Chủ Đầu Tư hoàn thành các điều kiện và thủ tục mở bán theo quy định của pháp luật với nội dung cụ thể sau đây:</p>
<p class="r"><i>Hôm nay, {ngay_viet}</i></p>
${khach}
<p class="h">2. Thông tin căn hộ</p>
<table class="b">
<tr><td>Tên dự án</td><td colspan="2"><b>${du_an}</b></td></tr>
<tr><td>Mã căn hộ</td><td colspan="2"><b>{ma_can}</b></td></tr>
<tr><td>Đơn giá bán căn hộ (m²)</td><td class="n">{don_gia}</td><td>Đ/m²</td></tr>
<tr><td>Diện tích thông thủy</td><td class="n">{dien_tich}</td><td>m²</td></tr>
<tr><td>Giá trị căn hộ trước thuế</td><td class="n">{gia_truoc_thue}</td><td>đồng</td></tr>
<tr><td>Thuế giá trị gia tăng (5%)</td><td class="n">{thue_vat}</td><td>đồng</td></tr>
<tr><td>Phí bảo trì căn hộ (2%)</td><td class="n">{phi_bao_tri}</td><td>đồng</td></tr>
<tr><td><b>Tổng giá trị căn hộ</b></td><td class="n"><b>{tong_gia}</b></td><td>đồng</td></tr>
</table>
<p class="h">3. Phương thức thanh toán</p>
${dot.map(d => `<p class="j">${d}</p>`).join('\n')}
<p class="j">4. Tôi xác nhận đã hiểu rõ tình trạng pháp lý, giá trị căn hộ và thủ tục thanh toán của Dự Án. Bản đăng ký này được nộp trong thời gian tôi hoàn thiện các hồ sơ liên quan đến đối tượng và điều kiện mua Nhà.</p>
<p class="j">5. Tôi đồng ý và xác nhận rằng trường hợp tôi không thực hiện các thủ tục theo quy định của pháp luật và theo thông báo của Quý Công ty để hoàn thành việc ký kết Hợp Đồng Mua Bán Nhà ở với Chủ Đầu Tư như nêu trên thì được hiểu là tôi không còn nguyện vọng mua Nhà ở và Quý Công ty có quyền chào bán cho các bên khác.</p>
${ky}`;
}

const MDF = 'Gỗ MDF chống ẩm phủ Melamine';
// [tên, chất liệu, [dài, cao, sâu], đơn vị]
const KHACH = [['Kệ tivi + vách', MDF, [2.49, 2.6, 0.35], 'bộ'], ['Tủ trang trí + tủ giày (kính)', MDF, [1.87, 2.6, 0.5], 'bộ'], ['Vách sau sofa', MDF, [2.2, 2.6, 0.3], 'cái']];
const BEP = [['Tủ trang trí', MDF, [2.61, 2.6, 0.35], 'cái'], ['Tủ bếp trên', MDF, [2.81, 1.15, 0.35], 'bộ'], ['Tủ bếp dưới', MDF, [2.81, 0.85, 0.6], 'bộ'],
  ['Khối tủ lạnh', MDF, [0.8, 2.6, 0.6], 'cái'], ['Đá bếp + cổ bếp', 'Đá tự nhiên và Tấm nhựa PVC theo thực tế', null, 'bộ'], ['Giá bát', 'Giá bát inox 304', null, 'bộ']];
const ROI = [['Giàn phơi', 'Theo thực tế', null, 'bộ'], ['Bạt che nắng', 'Theo thực tế', null, 'bộ']];
const PN2 = [
  ['PHÒNG KHÁCH', KHACH.slice(0, 2)],            // dòng «Vách sau sofa» đang ẩn trong file 2 ngủ
  ['PHÒNG BẾP', BEP],
  ['PHÒNG MASTER', [['Giường', MDF, [2, 2.754, 0.35], 'cái'], ['Tủ áo', MDF, [2.1, 2.6, 0.6], 'cái'], ['Hệ tủ + bàn đợt trang điểm', MDF, [1.85, 2.6, 0.6], 'bộ']]],
  ['PHÒNG NGỦ CON', [['Giường', MDF, [3.27, 3.25, 0.35], 'cái'], ['Tủ áo', MDF, [2.45, 2.25, 0.55], 'cái'], ['Tủ trang trí + giá sách', MDF, [1.5, 2.6, 0.25], 'bộ'], ['Bàn học', MDF, [1.85, 1.5, 5.6], 'cái']]],
  ['GÓI NỘI THẤT RỜI', ROI],
];
const PN3 = [
  ['PHÒNG KHÁCH', [KHACH[0], ['Tủ trang trí + tủ giày', MDF, [1.87, 2.6, 0.5], 'bộ'], KHACH[2]]],
  ['PHÒNG BẾP', BEP],
  ['PHÒNG MASTER', [['Giường', MDF, [2, 2.754, 0.35], 'cái'], ['Vách đầu giường', MDF, [2.85, 2.6, 0.6], 'cái'], ['Táp', MDF, [0.75, 0.35, 0.45], 'cái'], ['Tủ áo', MDF, [2.1, 2.6, 0.6], 'cái'], ['Hệ tủ + bàn đợt trang điểm', MDF, [1.85, 2.6, 0.6], 'bộ']]],
  ['PHÒNG CON GÁI', [['Giường', MDF, [1.8, 2.25, 0.35], 'cái'], ['Tủ áo', MDF, [1.8, 2.6, 0.55], 'cái'], ['Hộc trang trí', MDF, [1.17, 2.6, 0.2], 'cái'], ['Tủ trang trí + giá sách', MDF, [1.75, 2.6, 0.25], 'bộ'], ['Vách bàn học', MDF, [1.85, 2.6, 0.3], 'cái'], ['Bàn học', MDF, [1.47, 1.5, 0.6], 'cái']]],
  ['PHÒNG CON TRAI', [['Giường', MDF, [3.27, 3.25, 0.35], 'cái'], ['Tủ áo', MDF, [2.45, 2.25, 0.55], 'cái'], ['Tủ trang trí + giá sách', MDF, [1.5, 2.6, 0.25], 'bộ'], ['Bàn học', MDF, [1.85, 1.5, 5.6], 'cái'], ['Vách bàn học + đợt', MDF, [1.8, 2.6, 0.3], 'bộ'], ['Vách đầu giường', MDF, [2.67, 2.25, 0.3], 'cái']]],
  ['GÓI NỘI THẤT RỜI', ROI],
];
const LA = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const so = n => String(n).replace('.', ',');

function donNoiThat({ cdt, ten, du_an, gia, phong }) {
  const rows = phong.map(([ten, items], i) => `<tr class="grp"><td class="c">${LA[i]}</td><td colspan="6"><b>${ten}</b></td></tr>\n` +
    items.map(([t, cl, kt, dv], j) => `<tr><td class="c">${j + 1}</td><td>${t}</td><td>${cl}</td>${kt ? kt.map(x => `<td class="c">${so(x)}</td>`).join('') : '<td></td><td></td><td></td>'}<td class="c">${dv}</td><td class="c">1</td><td></td></tr>`).join('\n')).join('\n');
  return `${quoc_hieu}
<h2>ĐƠN ĐĂNG KÝ HOÀN THIỆN CĂN HỘ</h2>
<div class="c">Số: {so_don}/BĐK-NT{ky_hieu}</div>
<p class="c"><b>Kính gửi: ${cdt}</b></p>
<p class="j">Sau khi tìm hiểu đầy đủ thông tin về Dự án ${du_an} do ${ten} làm Chủ Đầu Tư. Tôi/Chúng Tôi có nguyện vọng đăng ký hoàn thiện căn hộ tại Dự án ${du_an.replace('Khu nhà ở', 'nhà ở')}</p>
<p class="r"><i>Hôm nay, {ngay_viet}</i></p>
${khach}
<p class="h">2. Thông tin gói hoàn thiện căn hộ</p>
<p>Mã căn hộ: <b>{ma_can}</b></p>
<p>Tổng giá trị gói hoàn thiện: <b>${gia.toLocaleString('vi-VN')}</b> đồng <i>(giá đã bao gồm VAT)</i></p>
<p>Bằng chữ: <i>${moneyWords(gia)}</i></p>
<p>Chi tiết gói hoàn thiện:</p>
<table class="b sm">
<tr class="th"><td rowspan="2">STT</td><td rowspan="2">Tên hàng</td><td rowspan="2">Chất liệu gỗ</td><td colspan="3">Kích thước (m)</td><td rowspan="2">Đơn vị tính</td><td rowspan="2">Số lượng</td><td rowspan="2">Ghi chú</td></tr>
<tr class="th"><td>Dài</td><td>Cao</td><td>Sâu</td></tr>
${rows.replace(/<td colspan="6">/g, '<td colspan="8">')}
</table>
<p class="h">3. Phương thức thanh toán</p>
<p class="j">Ngay sau khi ký Hợp Đồng này, Bên Mua sẽ thanh toán cho Bên Bán 100% giá trị gói hoàn thiện.</p>
<p class="h">4. Cam kết của khách hàng</p>
<p class="j">Tôi/Chúng tôi xác nhận việc đăng ký gói nội thất là hoàn toàn tự nguyện, xuất phát từ nhu cầu và sự lựa chọn của mình, sau khi đã được cung cấp thông tin và trực tiếp kiểm tra hiện trạng căn hộ.</p>
<p class="j">Việc đăng ký gói nội thất không phải là điều kiện bắt buộc để mua hoặc nhận bàn giao căn hộ; giá trị gói nội thất độc lập với giá bán căn hộ theo Hợp đồng mua bán đã ký.</p>
<p class="j">Tôi/Chúng tôi đồng ý mua nguyên trạng với danh mục, tình trạng, công năng, chất lượng sản phẩm tại thời điểm kiểm tra và bàn giao. Tên gọi, kích thước, số lượng theo đơn đăng ký này có thể thay đổi theo thực tế.</p>
<p class="j">Tôi/Chúng tôi đồng ý với các nội dung nêu trên và chịu trách nhiệm về quyết định đăng ký của mình.</p>
${ky}`;
}

const TN = { cdt: 'CÔNG TY CỔ PHẦN TM&amp;ĐTPT THỐNG NHẤT', ten: 'Công ty CP TM&amp;ĐTPT Thống Nhất', du_an: 'Khu nhà ở xã hội Thống Nhất Smart City' };
const CT = { cdt: 'CÔNG TY CP CÁT TƯỜNG', ten: 'Công ty CP Cát Tường', du_an: 'Khu nhà ở xã hội Cát Tường Smart City' };
const D1 = 'Đợt 1: Ngay sau khi ký Hợp Đồng này, Bên Mua sẽ thanh toán cho Bên Bán 30% giá trị Căn Hộ.';
const D_CUOI = n => `Đợt ${n}: Chậm nhất 10 ngày kể từ ngày Bên Mua nhận được thông báo nhận bàn giao Giấy chứng nhận quyền sở hữu căn hộ, Bên Mua thanh toán cho Bên Bán 5% giá trị còn lại của Hợp đồng.`;

// scope: mã dự án / mã tòa áp dụng; bedrooms: số phòng ngủ áp dụng (trống = mọi căn)
const MAU_DANG_KY = () => [
  { code: 'DK-MUA-TNS', name: 'Đơn đăng ký G – mua căn hộ (Thống Nhất Smart City)', kind: 'dang_ky_can', scope: 'TNS',
    content: donMua({ ...TN, dot: [D1, 'Đợt 2: Trong vòng 60 ngày kể từ ngày Bên Bán phát hành thông báo bàn giao gửi Bên Mua, Bên Mua có trách nhiệm thanh toán 65% giá trị căn hộ và 2% phí bảo trì.', D_CUOI(3)] }) },
  { code: 'DK-MUA-CTS', name: 'Đơn đăng ký O – mua căn hộ (Cát Tường Smart City)', kind: 'dang_ky_can', scope: 'CTS',
    content: donMua({ ...CT, dot: [D1, 'Đợt 2: Trong vòng 60 ngày kể từ ngày đóng tiền đợt 1, Bên Mua có trách nhiệm thanh toán cho Bên Bán 40% giá trị Căn Hộ.',
      'Đợt 3: Trong vòng 10 ngày kể từ ngày Bên Bán phát hành thông báo bàn giao gửi Bên Mua, Bên Mua có trách nhiệm thanh toán 25% giá trị căn hộ và 2% phí bảo trì.', D_CUOI(4)] }) },
  { code: 'DK-NT-TNS-2PN', name: 'Đơn đăng ký G (NT) – hoàn thiện căn hộ 2 phòng ngủ', kind: 'dang_ky_noi_that', scope: 'TNS', bedrooms: 2,
    content: donNoiThat({ ...TN, gia: 320000000, phong: PN2 }) },
  { code: 'DK-NT-TNS-3PN', name: 'Đơn đăng ký G (NT) – hoàn thiện căn hộ 3 phòng ngủ', kind: 'dang_ky_noi_that', scope: 'TNS', bedrooms: 3,
    content: donNoiThat({ ...TN, gia: 380000000, phong: PN3 }) },
];
const MAU_CU = ['MAU-DKCH-01', 'MAU-DKCH-02', 'MAU-DKNT-01'];   // mẫu khung cũ — tắt khi nạp mẫu chuẩn

module.exports = { MAU_DANG_KY, MAU_CU };
