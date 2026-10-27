// 'pg' → PGlite (PostgreSQL chạy trong trình duyệt). Giao dịch được xếp hàng tuần tự vì PGlite chỉ có một kết nối.
let db = null;
const setDb = p => { db = p; };
let queue = Promise.resolve();
const lock = () => { let release; const held = new Promise(r => (release = r)); const prev = queue; queue = prev.then(() => held); return prev.then(() => release); };
async function run(c, sql, params) {
  try {
    if (!params || !params.length) {
      const all = await c.exec(sql), last = all[all.length - 1] || { rows: [] };
      return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length, fields: last.fields };
    }
    const r = await c.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length, fields: r.fields };
  } catch (e) { console.warn('SQL lỗi:', e.message, String(sql).slice(0, 300)); throw e; }
}
class Pool {
  async query(sql, params) { return run(await db, sql, params); }
  async connect() { const release = await lock(), c = await db; return { query: (s, p) => run(c, s, p), release }; }
  async end() {}
  on() {}
}
module.exports = { Pool, types: { setTypeParser() {} }, setDb };
