// 'fs' → tệp mẫu gói sẵn (data/seed) + tệp người dùng tải lên lưu trong IndexedDB «ctg-kd-files».
const SEED = {
  'du-an.json': JSON.stringify(require('../../data/seed/du-an.json')),
  'bang-hang-cts-tns-2026-09-10.json': JSON.stringify(require('../../data/seed/bang-hang-cts-tns-2026-09-10.json')),
};
const mem = new Map();
let idb = null;
const open = () => new Promise((ok, fail) => { const r = indexedDB.open('ctg-kd-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
async function loadFiles() {
  try {
    idb = await open();
    await new Promise(done => { const c = idb.transaction('f').objectStore('f').openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return done(); mem.set(x.key, Buffer.from(x.value)); x.continue(); }; c.onerror = () => done(); });
  } catch {}
}
const put = (k, v) => { try { idb && idb.transaction('f', 'readwrite').objectStore('f').put(v, k); } catch {} };
const del = k => { try { idb && idb.transaction('f', 'readwrite').objectStore('f').delete(k); } catch {} };
const norm = p => String(p).replace(/\\/g, '/');
function readFileSync(p, enc) {
  p = norm(p); const name = p.split('/').pop();
  if (SEED[name] && p.includes('/data/seed/')) return enc ? SEED[name] : Buffer.from(SEED[name]);
  if (!mem.has(p)) { const e = new Error('ENOENT: không tìm thấy tệp (bản demo) ' + name); e.code = 'ENOENT'; throw e; }
  const b = mem.get(p); return enc ? b.toString(enc) : b;
}
function writeFileSync(p, data) { p = norm(p); const b = Buffer.isBuffer(data) ? data : Buffer.from(data); mem.set(p, b); put(p, new Uint8Array(b)); }
function unlinkSync(p) { p = norm(p); mem.delete(p); del(p); }
const existsSync = p => mem.has(norm(p));
function readFile(p, a, b) { const cb = typeof a === 'function' ? a : b; try { cb(null, readFileSync(p)); } catch (e) { cb(e); } }
module.exports = { readFileSync, writeFileSync, unlinkSync, existsSync, readFile, mkdirSync() {}, loadFiles };
