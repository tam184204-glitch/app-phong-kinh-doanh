// Ghi tệp .xlsx tối giản (1 sheet, chuỗi inline + số), nén ZIP kiểu STORE; đọc .xlsx / .docx (giải nén DEFLATE bằng zlib) — không cần thư viện ngoài.
const zlib = require('zlib');
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const [name, text] of files) {
    const data = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8'), fn = Buffer.from(name, 'utf8'), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(fn.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(fn.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, fn, data); central.push(c, fn); off += 30 + fn.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const col = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };

// rows: mảng các dòng; ô là chuỗi/số/null. boldRows: chỉ số dòng in đậm. widths: độ rộng cột.
function buildXlsx({ sheet = 'Sheet1', rows, boldRows = [], widths = [] }) {
  const sd = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    if (v === null || v === undefined || v === '') return '';
    const ref = col(ci) + (ri + 1), s = boldRows.includes(ri) ? ' s="1"' : ' s="2"';
    return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${x(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" applyFont="1"><alignment vertical="top" wrapText="1"/></xf><xf applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sd}</sheetData></worksheet>`],
  ]);
}

// ---------- đọc ----------
function unzip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Tệp không phải định dạng ZIP/Office Open XML');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = {};
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), fl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + fl).toString('utf8');
    const lh = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), data = buf.slice(lh, lh + csize);
    out[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    p += 46 + fl + xl + cl;
  }
  return out;
}
const unx = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const c of m[1]) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
// trả về [{name, rows:[[ô...]]}] — ô là chuỗi hoặc số
function readXlsx(buf) {
  const z = unzip(buf), txt = k => z[k] ? z[k].toString('utf8') : '';
  const ss = [...txt('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => unx([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
  const rels = Object.fromEntries([...txt('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
  const sheets = [...txt('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(m => ({ name: unx(m[1]), file: 'xl/' + (rels[m[2]] || '').replace(/^\/?xl\//, '') }));
  return sheets.map(sh => {
    const rows = [];
    for (const rm of txt(sh.file).matchAll(/<row [^>]*?r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = []; const ri = +rm[1] - 1;
      for (const cm of (rm[2] || '').matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = cm[1], ref = /r="([A-Z]+\d+)"/.exec(a)?.[1], t = /t="(\w+)"/.exec(a)?.[1], inner = cm[2] || '';
        let v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (t === 's') v = ss[+v]; else if (t === 'inlineStr') v = unx([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
        else if (t === 'str' || t === 'e') v = v != null ? unx(v) : ''; else if (v != null) v = isFinite(+v) ? +v : v;
        if (ref) r[colIdx(ref)] = v ?? '';
      }
      rows[ri] = r;
    }
    return { name: sh.name, rows: Array.from(rows, r => Array.from(r || [], c => c ?? '')) };
  });
}
// chữ trong .docx (đoạn cách nhau xuống dòng)
function docxText(buf) {
  const x = unzip(buf)['word/document.xml']; if (!x) return '';
  return x.toString('utf8').split(/<\/w:p>/).map(p => unx([...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map(m => m[1] ?? '\t').join(''))).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { buildXlsx, zip, unzip, readXlsx, docxText };
