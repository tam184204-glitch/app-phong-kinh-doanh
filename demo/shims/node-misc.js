// Các module Node còn lại cho bản demo: http (không dùng), crypto, zlib, busboy, @anthropic-ai/sdk (tắt AI).
const { syncScrypt } = require('scrypt-js');
const pako = require('pako');

exports.http = { createServer() { throw new Error('no http'); } };

exports.crypto = {
  randomBytes: n => { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return Buffer.from(a); },
  // N=1024 cho nhanh trong trình duyệt — mật khẩu demo chỉ dùng trong trình duyệt
  scryptSync: (pw, salt, len, o) => Buffer.from(syncScrypt(Buffer.from(pw), Buffer.from(salt), o?.N || 1024, 8, 1, len)),
  timingSafeEqual: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
  randomUUID: () => globalThis.crypto.randomUUID(),
};

exports.zlib = {
  inflateRawSync: b => Buffer.from(pako.inflateRaw(b)),
  deflateRawSync: b => Buffer.from(pako.deflateRaw(b)),
  inflateSync: b => Buffer.from(pako.inflate(b)),
  deflateSync: b => Buffer.from(pako.deflate(b)),
};

// busboy: req.pipe(bb) → bb._run(FormData) phát lại các sự kiện field / file / close
class Em { constructor() { this.h = {}; } on(k, f) { (this.h[k] ||= []).push(f); return this; } emit(k, ...a) { (this.h[k] || []).forEach(f => f(...a)); } }
exports.busboy = function () {
  const bb = new Em();
  bb._run = async fd => {
    try {
      for (const [name, v] of fd.entries()) {
        if (typeof v === 'string') { bb.emit('field', name, v); continue; }
        const s = new Em();
        bb.emit('file', name, s, { filename: v.name, mimeType: v.type || 'application/octet-stream' });
        s.emit('data', Buffer.from(await v.arrayBuffer())); s.emit('end');
      }
      bb.emit('close');
    } catch (e) { bb.emit('error', e); }
  };
  return bb;
};

class NoAI { constructor() { throw new Error('AI không khả dụng trong bản demo'); } }
for (const k of ['AuthenticationError', 'RateLimitError', 'APIConnectionError', 'APIError']) NoAI[k] = class extends Error {};
exports.anthropic = { default: NoAI };
