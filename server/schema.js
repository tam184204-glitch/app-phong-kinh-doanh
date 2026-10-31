// Tạo / cập nhật cấu trúc CSDL từ meta.js. Chạy mỗi lần khởi động, chạy lại bao nhiêu lần cũng được:
// bảng thiếu thì tạo, cột thiếu thì thêm; khóa ngoại, CHECK và chỉ mục chống trùng dựng lại theo meta.
// Không bao giờ xóa cột hay bảng đang có dữ liệu.
const { E, ROLES, LOOKUPS, SETTINGS } = require('./meta');

const SQLT = { text: 'text', long: 'text', sel: 'text', month: 'text', code: 'text', int: 'integer', num: 'numeric', money: 'numeric(18,0)',
  date: 'date', dt: 'timestamptz', ref: 'integer', refs: 'integer[]', user: 'integer', bool: 'boolean', check: 'jsonb', json: 'jsonb' };
const lit = v => `'${String(v).replace(/'/g, "''")}'`;
const ACTIVE_RES = "('cho_duyet','giu_cho','qua_han','da_coc','chuyen_hd')";

const BASE = `
CREATE TABLE IF NOT EXISTS kd_user (
  id serial PRIMARY KEY,
  username text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN (${ROLES.map(r => lit(r[0])).join(',')})),
  title text, dept text, phone text, email text,
  active boolean NOT NULL DEFAULT true,
  is_trial boolean NOT NULL DEFAULT false,
  pw_hash text, must_change boolean NOT NULL DEFAULT true,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kd_user_username ON kd_user (lower(username));
CREATE TABLE IF NOT EXISTS kd_session (
  sid text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES kd_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS kd_lookup (
  cat text NOT NULL, value text NOT NULL, label text NOT NULL, sort integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (cat, value)
);
CREATE TABLE IF NOT EXISTS kd_setting (key text PRIMARY KEY, value jsonb, updated_at timestamptz DEFAULT now(), updated_by integer);
CREATE TABLE IF NOT EXISTS kd_counter (prefix text PRIMARY KEY, n integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS kd_file (
  id serial PRIMARY KEY, ent text NOT NULL, rec_id integer NOT NULL, kind text, name text NOT NULL, mime text, size integer,
  path text NOT NULL, version integer NOT NULL DEFAULT 1, uploaded_by integer REFERENCES kd_user(id), uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz, deleted_by integer, is_demo boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS kd_file_rec ON kd_file (ent, rec_id);
CREATE TABLE IF NOT EXISTS kd_note (
  id serial PRIMARY KEY, ent text NOT NULL, rec_id integer NOT NULL, body text NOT NULL,
  by integer REFERENCES kd_user(id), at timestamptz NOT NULL DEFAULT now(), is_demo boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS kd_note_rec ON kd_note (ent, rec_id);
CREATE TABLE IF NOT EXISTS kd_audit (
  id bigserial PRIMARY KEY, ent text NOT NULL, rec_id integer, action text NOT NULL, before jsonb, after jsonb,
  user_id integer REFERENCES kd_user(id), at timestamptz NOT NULL DEFAULT now(), note text, is_demo boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS kd_audit_rec ON kd_audit (ent, rec_id);
CREATE INDEX IF NOT EXISTS kd_audit_at ON kd_audit (at DESC);
CREATE TABLE IF NOT EXISTS kd_approval (
  id serial PRIMARY KEY, ent text NOT NULL, rec_id integer NOT NULL, title text, roles text[] NOT NULL, approver_id integer REFERENCES kd_user(id),
  status text NOT NULL DEFAULT 'cho_duyet' CHECK (status IN ('cho_duyet','da_duyet','tu_choi','huy')),
  requested_by integer REFERENCES kd_user(id), requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by integer REFERENCES kd_user(id), decided_at timestamptz, comment text, is_demo boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS kd_approval_rec ON kd_approval (ent, rec_id);
CREATE UNIQUE INDEX IF NOT EXISTS kd_approval_one_open ON kd_approval (ent, rec_id) WHERE status = 'cho_duyet';
CREATE TABLE IF NOT EXISTS kd_import (
  id serial PRIMARY KEY, kind text NOT NULL, file_name text, by integer REFERENCES kd_user(id), at timestamptz NOT NULL DEFAULT now(),
  total integer, ok integer, failed integer, errors jsonb, is_demo boolean NOT NULL DEFAULT false
);
`;

// chỉ mục nghiệp vụ đặc biệt (chặn trùng ở tầng CSDL, kể cả khi hai người bấm cùng lúc)
const SPECIAL = [
  // 1 căn không đồng thời có 2 phiếu giữ chỗ / bán còn hiệu lực
  `CREATE UNIQUE INDEX IF NOT EXISTS kd_reservation_one_active ON kd_reservation (unit_id) WHERE status IN ${ACTIVE_RES}`,
  // 1 căn chỉ 1 hợp đồng mua bán / thuê / thuê mua còn hiệu lực (HĐ hoàn thiện đi kèm được phép)
  `CREATE UNIQUE INDEX IF NOT EXISTS kd_contract_one_active ON kd_contract (unit_id) WHERE kind IN ('hdmb','thue','thue_mua') AND status NOT IN ('huy','thanh_ly')`,
  // không tính trùng hoa hồng cho 1 hợp đồng
  `CREATE UNIQUE INDEX IF NOT EXISTS kd_commission_one ON kd_commission (contract_id) WHERE status NOT IN ('huy')`,
  // kế hoạch thu: mỗi hợp đồng 1 dòng hiệu lực / tháng
  `CREATE UNIQUE INDEX IF NOT EXISTS kd_collect_plan_one ON kd_collect_plan (month, contract_id) WHERE status <> 'thay_the'`,
  // kỳ thu hiệu lực không trùng số kỳ
  `CREATE UNIQUE INDEX IF NOT EXISTS kd_installment_seq ON kd_installment (contract_id, seq) WHERE active`,
  `CREATE INDEX IF NOT EXISTS kd_installment_c ON kd_installment (contract_id) WHERE active`,
  `CREATE INDEX IF NOT EXISTS kd_receipt_c ON kd_receipt (contract_id) WHERE status = 'hop_le'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS kd_customer_phone ON kd_customer (regexp_replace(phone, '\\D', '', 'g'))`,
  // chính sách giá trước đây chỉ 1 dự án → chép sang danh sách dự án
  `UPDATE kd_price_policy SET project_ids = ARRAY[project_id] WHERE project_ids IS NULL AND project_id IS NOT NULL`,
  // giá niêm yết = Tổng cộng (số cũ từ bảng hàng 10/09/2026 bỏ đi)
  `UPDATE kd_unit SET list_price = total_price WHERE total_price IS NOT NULL AND list_price IS DISTINCT FROM total_price`,
  // hồ sơ NOXH trước khi có dòng «2.1 Thông tin chủ hộ»: dựng từ khách hàng + cột Mẫu 4; dự án theo căn
  `UPDATE kd_noxh_check n SET head = jsonb_build_array(jsonb_build_object('name', coalesce(k.full_name, ''), 'phone', concat_ws('/ ', k.phone, nullif(k.phone2, '')),
      'bday', coalesce(to_char(k.birth, 'FMDD'), ''), 'bmonth', coalesce(to_char(k.birth, 'FMMM'), ''), 'byear', coalesce(to_char(k.birth, 'YYYY'), ''),
      'old_id_no', coalesce(n.old_id_no, ''), 'id_no', coalesce(k.id_no, ''), 'job', coalesce(n.job, ''), 'doi_tuong', coalesce(n.doi_tuong, ''), 'confirm_org', coalesce(n.confirm_org, ''),
      'housing', coalesce(n.housing, ''), 'province', coalesce(n.province, ''), 'district', coalesce(n.district, ''), 'commune', coalesce(n.commune, ''), 'income', coalesce(n.income, ''), 'relation', 'Chủ hộ'))
    FROM kd_customer k WHERE k.id = n.customer_id AND n.head IS NULL`,
  `UPDATE kd_noxh_check n SET project_id = u.project_id, unit_area = coalesce(n.unit_area, u.area_tt) FROM kd_unit u WHERE u.id = n.unit_id AND n.project_id IS NULL`,
  // đề nghị hủy / đổi trước khi có phần «1. Thông tin khách hàng»: lấy theo hợp đồng / phiếu giữ chỗ
  `UPDATE kd_cancel_req t SET cust_name = k.full_name, phone = k.phone, unit_id = u.id, project_id = u.project_id
    FROM kd_cancel_req x LEFT JOIN kd_contract c ON c.id = x.contract_id LEFT JOIN kd_reservation r ON r.id = coalesce(x.reservation_id, c.reservation_id)
      JOIN kd_unit u ON u.id = coalesce(c.unit_id, r.unit_id) JOIN kd_customer k ON k.id = coalesce(c.customer_id, r.customer_id)
    WHERE t.id = x.id AND t.cust_name IS NULL`,
  // phiếu đăng ký có giờ đăng ký lệch ngày đăng ký (dữ liệu thử cũ): đưa giờ về đúng ngày (09:00) — không thì lưu phiếu tính lại ngày, vướng «hạn giữ chỗ phải sau ngày đăng ký»
  `UPDATE kd_reservation SET reg_at = (reg_date + time '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' WHERE reg_at IS NOT NULL AND reg_date IS NOT NULL AND (reg_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <> reg_date`,
  // thành viên hộ trước khi tách ngày / tháng / năm sinh như dòng chủ hộ: birth 'dd/mm/yyyy' (hoặc chỉ năm) → bday, bmonth, byear
  `UPDATE kd_noxh_check n SET members = (SELECT jsonb_agg((e - 'birth') || jsonb_build_object(
      'bday', coalesce(ltrim(substring(e->>'birth' from '^(\\d{1,2})[/.-]\\d{1,2}[/.-]\\d{4}$'), '0'), ''),
      'bmonth', coalesce(ltrim(substring(e->>'birth' from '^\\d{1,2}[/.-](\\d{1,2})[/.-]\\d{4}$'), '0'), ''),
      'byear', coalesce(substring(e->>'birth' from '(\\d{4})$'), '')) ORDER BY o) FROM jsonb_array_elements(n.members) WITH ORDINALITY x(e, o))
    WHERE jsonb_typeof(n.members) = 'array' AND jsonb_path_exists(n.members, '$[*].birth')`,
  // hợp đồng trước khi có «Số bảng giá» theo tòa
  `UPDATE kd_contract c SET building_id = u.building_id FROM kd_unit u WHERE u.id = c.unit_id AND c.building_id IS NULL`,
  // phiếu đăng ký trước khi tách 3 cột giá: Tổng giá bán cũ = Giá trị căn hộ
  `UPDATE kd_reservation SET unit_value = price - coalesce(finish_value, 0) WHERE unit_value IS NULL AND price IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS kd_price_policy_pids ON kd_price_policy USING gin (project_ids)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS kd_customer_code ON kd_customer (upper(code)) WHERE code IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS kd_customer_idno ON kd_customer (upper(id_no)) WHERE id_no IS NOT NULL`,
];
// chạy trước khi dựng lại ràng buộc: đổi giá trị danh sách chọn đã bỏ
const PRE = [
  // phương án xử lý tiền rút gọn (28/10/2026): giữ lại / không phát sinh → Khác
  'ALTER TABLE IF EXISTS kd_cancel_req DROP CONSTRAINT IF EXISTS ck_kd_cancel_req_money_plan',
  `UPDATE kd_cancel_req SET money_note = coalesce(money_note, CASE money_plan WHEN 'giu_lai' THEN 'Giữ lại theo chính sách' ELSE 'Không phát sinh tiền' END), money_plan = 'khac' WHERE money_plan IN ('giu_lai', 'khong_phat_sinh')`,
  // gộp 3 ô chính sách thành Nội dung chính sách bán hàng (31/10/2026): chuyển xong xóa ô cũ để không gộp lại lần sau
  `UPDATE kd_price_policy SET content = concat_ws(E'\\n', nullif(content, ''), 'Ưu đãi / chiết khấu: ' || nullif(discount, ''), 'Phương thức thanh toán: ' || nullif(pay_method, ''), 'Chính sách ngân hàng: ' || nullif(bank_policy, '')), discount = NULL, pay_method = NULL, bank_policy = NULL WHERE coalesce(discount, pay_method, bank_policy) IS NOT NULL`,
];
// CHECK nghiệp vụ thêm (ngoài money ≥ 0 và giá trị danh sách chọn)
const CHECKS = {
  unit: ["area_tt > 0", "floor >= 0"],
  price_policy: ["end_on >= start_on", "mode <> 'don_gia' OR unit_price > 0"],
  reservation: ["hold_until >= reg_date"],
  installment: ["amount > 0", "pct IS NULL OR (pct >= 0 AND pct <= 100)"],
  receipt: ["amount > 0"],
  collect_plan: ["expected > 0", "month ~ '^\\d{4}-(0[1-9]|1[0-2])$'"],
  target: ["period ~ '^\\d{4}-(0[1-9]|1[0-2])$'"],
  report: ["period ~ '^\\d{4}-(0[1-9]|1[0-2])$'"],
  refund: ["amount > 0"],
  ticket: ["rating IS NULL OR rating BETWEEN 1 AND 5"],
  commission_policy: ["rate IS NULL OR (rate >= 0 AND rate <= 100)"],
};

async function migrate(db) {
  await db.q(BASE);
  const cols = new Map();
  for (const r of await db.q("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name LIKE 'kd\\_%'"))
    (cols.get(r.table_name) || cols.set(r.table_name, new Set()).get(r.table_name)).add(r.column_name);

  for (const e of Object.values(E)) {
    const t = e.table, have = cols.get(t);
    const defs = e.fields.map(f => `${f.k} ${SQLT[f.t]}${f.t === 'code' ? ' NOT NULL' : ''}${f.t === 'bool' ? ` DEFAULT ${f.def === true}` : ''}`);
    if (!have) {
      await db.q(`CREATE TABLE ${t} (id serial PRIMARY KEY, ${defs.join(', ')},
        is_demo boolean NOT NULL DEFAULT false, created_by integer, created_at timestamptz NOT NULL DEFAULT now(), updated_by integer, updated_at timestamptz)`);
    } else {
      for (const f of e.fields) if (!have.has(f.k)) await db.q(`ALTER TABLE ${t} ADD COLUMN ${f.k} ${SQLT[f.t]}${f.t === 'bool' ? ` DEFAULT ${f.def === true}` : ''}`);
    }
  }
  // đổi giá trị danh sách chọn trước khi dựng lại CHECK (giá trị cũ không còn trong danh sách)
  for (const s of PRE) await db.q(s);
  // khóa ngoại + CHECK + chỉ mục: dựng lại theo meta (tên cố định → không trùng)
  for (const e of Object.values(E)) {
    const t = e.table;
    const old = await db.q(`SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass AND (conname LIKE 'fk\\_%' OR conname LIKE 'ck\\_%')`, [t]);
    for (const c of old) await db.q(`ALTER TABLE ${t} DROP CONSTRAINT ${c.conname}`);
    const add = [];
    for (const f of e.fields) {
      if (f.t === 'ref') add.push(`ADD CONSTRAINT fk_${t}_${f.k} FOREIGN KEY (${f.k}) REFERENCES ${E[f.ref].table}(id) ON DELETE RESTRICT`);
      if (f.t === 'user') add.push(`ADD CONSTRAINT fk_${t}_${f.k} FOREIGN KEY (${f.k}) REFERENCES kd_user(id) ON DELETE RESTRICT`);
      if (f.t === 'money') add.push(`ADD CONSTRAINT ck_${t}_${f.k} CHECK (${f.k} >= 0)`);
      if (f.t === 'sel' && f.o) add.push(`ADD CONSTRAINT ck_${t}_${f.k} CHECK (${f.k} IS NULL OR ${f.k} IN (${f.o.map(o => lit(o[0])).join(',')}))`);
      if (f.t === 'month') add.push(`ADD CONSTRAINT ck_${t}_${f.k}_fmt CHECK (${f.k} IS NULL OR ${f.k} ~ '^\\d{4}-(0[1-9]|1[0-2])$')`);
    }
    for (const k of ['created_by', 'updated_by']) add.push(`ADD CONSTRAINT fk_${t}_${k} FOREIGN KEY (${k}) REFERENCES kd_user(id) ON DELETE RESTRICT`);
    (CHECKS[e.key] || []).forEach((c, i) => add.push(`ADD CONSTRAINT ck_${t}_biz${i} CHECK (${c})`));
    await db.q(`ALTER TABLE ${t} ${add.join(', ')}`);
    for (const f of e.fields.filter(f => f.uniq)) await db.q(`CREATE UNIQUE INDEX IF NOT EXISTS ${t}_${f.k}_uq ON ${t} (${f.t === 'text' ? `upper(${f.k})` : f.k})`);
    for (const f of e.fields.filter(f => f.t === 'code')) await db.q(`CREATE UNIQUE INDEX IF NOT EXISTS ${t}_${f.k}_uq ON ${t} (${f.k})`);
    for (const f of e.fields.filter(f => f.uniqActive)) await db.q(`CREATE UNIQUE INDEX IF NOT EXISTS ${t}_${f.k}_one ON ${t} (${f.k})`);
    for (const u of e.uniq || []) await db.q(`CREATE UNIQUE INDEX IF NOT EXISTS ${t}_${u.join('_')}_uq ON ${t} (${u.map(k => E[e.key].fields.find(f => f.k === k)?.t === 'text' ? `upper(${k})` : k).join(', ')})`);
    for (const f of e.fields.filter(f => f.t === 'ref' || f.t === 'user' || f.k === 'status')) await db.q(`CREATE INDEX IF NOT EXISTS ${t}_${f.k}_ix ON ${t} (${f.k})`);
  }
  for (const s of SPECIAL) await db.q(s);
  // danh mục + cài đặt mặc định (không ghi đè chỗ quản trị đã sửa)
  for (const [cat, rows] of Object.entries(LOOKUPS))
    for (const [i, [v, l]] of rows.entries()) await db.q('INSERT INTO kd_lookup (cat, value, label, sort) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [cat, v, l, i]);
  for (const [k, v] of Object.entries(SETTINGS)) await db.q('INSERT INTO kd_setting (key, value) VALUES ($1,$2) ON CONFLICT DO NOTHING', [k, JSON.stringify(v)]);
}

module.exports = { migrate, ACTIVE_RES };
