# App Quản lý Phòng Kinh doanh — Cát Tường Group

Số hóa hoạt động Phòng Kinh doanh theo nguyên tắc **một mã căn — một hồ sơ xuyên suốt**: giỏ hàng, khách hàng, giao dịch, hợp đồng, công nợ & kế hoạch thu, bàn giao, cấp sổ hồng, CSKH, đại lý – CTV, báo cáo quản trị.

- 12 phân hệ, 18 mẫu biểu nghiệp vụ (KH-01 … SH-01), phân quyền theo vai trò, luồng trình – duyệt, nhật ký thao tác.
- Hồ sơ căn hộ / khách hàng 360°, sổ công nợ đối chiếu thực thu Bravo, Dashboard truy xuất đến từng căn.
- **Trợ lý AI tra cứu** (Claude): hỏi bằng tiếng Việt, AI tra dữ liệu theo đúng quyền của người hỏi, chỉ đọc.
- Xuất Excel / in PDF, nhập dữ liệu thật từ Excel (bảng hàng, khách hàng, hợp đồng cũ, chứng từ Bravo).

## Chạy trên máy

Cần Node.js 22+ và PostgreSQL 15+.

```bash
npm install
cp .env.example .env        # điền DATABASE_URL (CSDL trống), ANTHROPIC_API_KEY nếu dùng AI
npm run seed                # dữ liệu gốc: dự án, tòa, 147 căn theo bảng hàng 10/09/2026, tài khoản
npm run seed:demo           # (tuỳ chọn) giao dịch thử để chạy đủ quy trình
npm start                   # http://localhost:3500
```

Đặt `NO_LOGIN=1` để vào thẳng không cần đăng nhập (đổi vai trò ở menu tên người dùng góc phải). Khi vận hành thật: bỏ `NO_LOGIN`, chạy `npm run clear-demo` để xóa dữ liệu thử.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `server/meta.js` | Định nghĩa 12 phân hệ, các loại dữ liệu, trường, trạng thái, quyền, luồng duyệt |
| `server/core.js`, `biz.js` | Đọc / ghi theo quyền, luật nghiệp vụ (chặn bán trùng, công nợ, hoa hồng…) |
| `server/views.js` | Dashboard, hồ sơ 360°, sổ công nợ, báo cáo quản trị |
| `server/ai.js` | Trợ lý AI tra cứu (công cụ chỉ đọc, chạy bằng quyền người hỏi) |
| `server/io.js` | Xuất / nhập Excel, in hợp đồng |
| `public/` | Giao diện (HTML/CSS/JS thuần) |
| `data/seed/` | Bảng hàng và danh mục dự án dùng để nạp dữ liệu gốc |
