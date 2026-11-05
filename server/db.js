// Kết nối PostgreSQL dùng chung cho máy chủ và các script (seed, nhập liệu).
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}
const { Pool, types } = require('pg');

types.setTypeParser(1082, v => v);                        // date → 'YYYY-MM-DD' (không lệch múi giờ)
types.setTypeParser(1700, v => v === null ? null : +v);   // numeric → number
types.setTypeParser(1184, v => v === null ? null : new Date(v).toISOString()); // timestamptz → chuỗi ISO (UTC)
types.setTypeParser(20, v => v === null ? null : +v);     // bigint (count) → number

// KD_DB_SCHEMA: chạy trên CSDL chung Khối Home (duan-noxh-ct) → bảng ở schema riêng 'kd', cấu trúc do migration db/migrations/V202+ dựng.
// Không đặt → chạy độc lập như cũ (bảng ở public, app tự dựng cấu trúc khi khởi động).
const SCHEMA = (process.env.KD_DB_SCHEMA || '').trim();
if (SCHEMA && !/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) throw new Error(`KD_DB_SCHEMA không hợp lệ: ${SCHEMA}`);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, ...(SCHEMA ? { options: `-c search_path=${SCHEMA}` } : {}) });
const wrap = c => ({ q: (s, p) => c.query(s, p).then(r => r.rows), one: (s, p) => c.query(s, p).then(r => r.rows[0] || null) });
const { q, one } = wrap(pool);
async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn({ ...wrap(c), inTx: true });   // inTx: biz.safely dùng savepoint
    await c.query('COMMIT');
    return out;
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

module.exports = { pool, q, one, tx, SCHEMA, shared: !!SCHEMA };
