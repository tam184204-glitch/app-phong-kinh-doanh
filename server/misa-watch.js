// Tự nhập phiếu thu MISA từ thư mục chung (OneDrive / ổ mạng) — kế toán chỉ cần lưu tệp Excel xuất từ MISA vào thư mục, không phải mở app.
// Bật bằng .env: MISA_DIR=đường dẫn thư mục (VD C:\Users\...\OneDrive - CTY...\MISA - App KD); MISA_EVERY = số phút giữa 2 lần quét (mặc định 5).
// Mỗi tệp .xlsx / .csv mới: nhập như «Nhập phiếu thu MISA» (trùng số chứng từ tự bỏ qua) → chuyển sang «Đã nhập» (hoặc «Lỗi» nếu không đọc được),
// kèm tệp kết quả .txt liệt kê dòng chưa ghép được hợp đồng. Lịch sử nhập hiện ở màn 12 Tích hợp.
const fs = require('fs');
const path = require('path');
const { one } = require('./db');
const IO = require('./io');

const DONE = 'Đã nhập', FAIL = 'Lỗi';
const stamp = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');   // giờ VN, VD 20261104-1530
const moveTo = (dir, sub, f) => { const d = path.join(dir, sub); fs.mkdirSync(d, { recursive: true }); const to = path.join(d, `${stamp()}_${f}`); fs.renameSync(path.join(dir, f), to); return to; };
const report = (to, lines) => { try { fs.writeFileSync(to.replace(/\.[^.]+$/, '') + '_ket-qua.txt', '\ufeff' + lines.join('\r\n'), 'utf8'); } catch (e) { console.error('MISA: ghi kết quả', e.message); } };

let busy = false;
async function scan(dir) {
  if (busy) return; busy = true;
  try {
    let files; try { files = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { console.error(`MISA: không đọc được thư mục ${dir} — ${e.message}`); return; }
    // người nhập = trưởng phòng KD đầu tiên (hoặc quản trị) — để nhật ký ghi rõ; tệp tự nhập ghi «(tự nhập từ thư mục)»
    const user = await one("SELECT id, username, full_name, role FROM kd_user WHERE active AND role IN ('truong_phong', 'admin') ORDER BY (role = 'truong_phong') DESC, id LIMIT 1");
    if (!user) return;
    for (const e of files) {
      const f = e.name;
      if (!e.isFile() || /^~\$|^\./.test(f) || !/\.(xlsx|csv)$/i.test(f)) continue;   // bỏ tệp tạm của Excel (~$…) đang mở
      const full = path.join(dir, f);
      try { if (Date.now() - fs.statSync(full).mtimeMs < 60e3) continue; } catch { continue; }   // tệp vừa lưu / OneDrive đang tải về: đợi lần quét sau
      let buf; try { buf = fs.readFileSync(full); } catch { continue; }   // đang bị khóa (Excel đang mở) → lần sau
      try {
        const r = await IO.importFile('misa', { name: `[tự nhập từ thư mục] ${f}`, buffer: buf }, user);
        const to = moveTo(dir, DONE, f);
        report(to, [`Nhập lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} — ${r.total} dòng: thêm ${r.them}, trùng bỏ qua ${r.trung}, dòng cộng/tổng bỏ qua ${r.bo_qua}, lỗi ${r.loi}`, '',
          ...(r.errors.length ? ['CHƯA NHẬP ĐƯỢC (sửa trong MISA — ghi số hợp đồng hoặc mã căn vào diễn giải — rồi xuất lại; phiếu đã nhập sẽ tự bỏ qua):', ...r.errors.map(x => `  Dòng ${x.line}: ${x.msg}`)] : ['Tất cả phiếu đã nhập.'])]);
        console.log(`MISA: ${f} — thêm ${r.them}, trùng ${r.trung}, lỗi ${r.loi}`);
      } catch (err) {
        console.error(`MISA: ${f} — ${err.message}`);
        try { report(moveTo(dir, FAIL, f), [`Không nhập được tệp: ${err.message}`, '', 'Kiểm tra: tệp Excel (.xlsx) xuất từ MISA, có dòng tiêu đề gồm Số chứng từ, Ngày, Số tiền, Diễn giải.']); } catch (e2) { console.error('MISA: chuyển tệp lỗi', e2.message); }
      }
    }
  } finally { busy = false; }
}
function startMisaWatch() {
  const dir = process.env.MISA_DIR; if (!dir) return;
  const every = Math.max(1, +process.env.MISA_EVERY || 5) * 60e3;
  console.log(`MISA: tự nhập phiếu thu từ «${dir}» mỗi ${every / 60e3} phút`);
  setTimeout(() => scan(dir).catch(e => console.error('MISA', e.message)), 10e3);
  setInterval(() => scan(dir).catch(e => console.error('MISA', e.message)), every);
}
module.exports = { startMisaWatch, scan };
