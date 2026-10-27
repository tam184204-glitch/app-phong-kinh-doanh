// Thêm khách hàng thử (đánh dấu «thử») cho đủ các tình trạng: khách tiềm năng (03) và khách sau mở bán (02).
// Chạy: node server/seed-khach-thu.js — chạy lại được (mỗi lần thêm một lượt khách tiềm năng mới).
const { q, one, tx } = require('./db');
const C = require('./core');
const B = require('./biz');

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô'];
const DEM = ['Văn', 'Thị', 'Minh', 'Thu', 'Đức', 'Ngọc', 'Hữu', 'Thanh'];
const TEN = ['An', 'Bình', 'Châu', 'Dương', 'Giang', 'Hà', 'Khánh', 'Lan', 'Nam', 'Phúc', 'Quân', 'Trang', 'Tuấn', 'Vy'];
const NOI = ['Võ Cường, Bắc Ninh', 'Yên Phong, Bắc Ninh', 'Từ Sơn, Bắc Ninh', 'Quế Võ, Bắc Ninh', 'Tiên Du, Bắc Ninh', 'Kinh Bắc, Bắc Ninh'];
const pick = a => a[Math.floor(Math.random() * a.length)];

(async () => {
  const by = await one("SELECT * FROM kd_user WHERE role = 'ban_hang' AND active ORDER BY id LIMIT 1") || await one("SELECT * FROM kd_user WHERE role = 'admin' LIMIT 1");
  const pj = await one("SELECT id FROM kd_project WHERE code = 'TNS'");
  const opt = { system: true, demo: true };
  const mk = (db, stage) => C.create('customer', {
    full_name: `${pick(HO)} ${pick(DEM)} ${pick(TEN)}`, phone: '038' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0'), address: pick(NOI),
    source: pick(['truc_tiep', 'website', 'gioi_thieu', 'hotline']), interest_project: pj?.id, stage, owner_id: by.id, note: 'Khách thử',
  }, by, { db, ...opt }).then(r => r.row);
  const out = [];
  await tx(async db => {
    // 03 — khách tiềm năng
    for (const st of ['moi', 'moi', 'dang_cham_soc', 'dang_cham_soc', 'hen_tham_quan', 'hen_tham_quan', 'quan_tam_cao', 'quan_tam_cao', 'khong_nhu_cau', 'moi']) out.push([(await mk(db, st)).full_name, st]);
    // 02 — nộp hồ sơ mua NOXH: 2 khách đã được SXD duyệt, 1 khách đang chờ duyệt
    for (const ok of [true, true, false]) {
      const c = await mk(db, 'moi');
      const n = (await C.create('noxh_check', { customer_id: c.id, grp: 'cn_thu_nhap_thap', received_on: C.today(), owner_id: by.id }, by, { db, ...opt })).row;
      await C.sys(db, 'noxh_check', n.id, ok ? { status: 'da_duyet', result: 'du' } : { status: 'cho_duyet' }, by, 'thu');
      out.push([c.full_name, ok ? 'SXD duyệt HS' : 'Đã nộp HSMN']);
    }
    // khách đang có HĐ: 1 làm đơn thanh lý, 1 đã thanh lý; hồ sơ sổ đã nộp → đã ra sổ
    const hd = await db.q("SELECT c.id, k.full_name FROM kd_contract c JOIN kd_customer k ON k.id = c.customer_id WHERE c.status = 'da_ky' AND c.kind = 'hdmb' AND c.is_demo AND NOT EXISTS (SELECT 1 FROM kd_cancel_req x WHERE x.contract_id = c.id) ORDER BY c.id DESC LIMIT 2");
    if (hd[0]) { await C.create('cancel_req', { kind: 'huy', contract_id: hd[0].id, reason: 'Khách xin thanh lý hợp đồng (thử)', money_plan: 'hoan_tien' }, by, { db, ...opt }); out.push([hd[0].full_name, 'Làm đơn thanh lý']); }
    if (hd[1]) { await C.sys(db, 'contract', hd[1].id, { status: 'thanh_ly' }, by, 'thu', 'Thanh lý (dữ liệu thử)'); out.push([hd[1].full_name, 'Đã thanh lý']); }
    for (const p of await db.q("SELECT p.id FROM kd_pinkbook p WHERE p.status = 'da_nop' AND p.is_demo ORDER BY p.id LIMIT 2")) await C.sys(db, 'pinkbook', p.id, { status: 'da_giao_so' }, by, 'thu', 'Đã ra sổ (dữ liệu thử)');
    await B.syncStages(db);
  });
  console.table(out);
  console.table(await q("SELECT stage, count(*)::int n FROM kd_customer GROUP BY 1 ORDER BY 2 DESC"));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
