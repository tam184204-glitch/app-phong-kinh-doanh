'use strict';
// Tải mẫu biểu lên (13/11/2026): file Word .docx / Excel .xlsx / .html / .txt → nội dung mẫu HTML (giữ căn lề, đậm / nghiêng / gạch chân, cỡ chữ, bảng gộp ô, kẻ khung, ảnh logo, ngắt trang)
// Trường trộn gõ thẳng trong Word: {ten_kh}, {ma_can}… (Word hay tách «{ten_» «kh}» thành nhiều đoạn định dạng → tự nối lại)
const { unzip } = require('./xlsx');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const unx = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');

// ---- XML → cây {n, a, c[], t} (đủ cho document.xml) ----
function parseXml(s) {
  const root = { n: '#root', a: {}, c: [] }, st = [root];
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    const top = st[st.length - 1];
    if (m[6] != null) { if (top.n === 'w:t' || top.n === 'w:instrText') top.c.push({ t: unx(m[6]) }); continue; }
    if (m[5] != null) { top.c.push({ t: m[5] }); continue; }
    if (!m[2]) continue;
    if (m[1]) { while (st.length > 1 && st.pop().n !== m[2]); continue; }
    const a = {}; for (const x of (m[3] || '').matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[x[1]] = unx(x[2] ?? x[3]);
    const el = { n: m[2], a, c: [] }; top.c.push(el); if (!m[4]) st.push(el);
  }
  return root;
}
const kids = (e, n) => (e?.c || []).filter(x => x.n === n);
const kid = (e, n) => (e?.c || []).find(x => x.n === n);
const val = (e, n) => kid(e, n)?.a['w:val'];
const on = (e, n) => { const k = kid(e, n); return !!k && !['0', 'false', 'none'].includes(k.a['w:val']); };
const pt = tw => Math.round(+tw / 20 * 10) / 10;   // twip → pt

function docxToHtml(buf) {
  const z = unzip(buf), txt = k => z[k] ? z[k].toString('utf8') : '';
  const docXml = txt('word/document.xml'); if (!docXml) throw new Error('File Word không có nội dung (word/document.xml)');
  const rels = Object.fromEntries([...txt('word/_rels/document.xml.rels').matchAll(/<Relationship ([^>]*?)\/?>/g)].map(m => [/\bId="([^"]+)"/.exec(m[1])?.[1], /\bTarget="([^"]+)"/.exec(m[1])?.[1]]));
  // kiểu đoạn mặc định (căn lề / đậm theo style) — đủ dùng cho Heading, Title
  const styles = {};
  const sx = parseXml(txt('word/styles.xml'));
  for (const s of kids(kid(sx, 'w:styles'), 'w:style')) styles[s.a['w:styleId']] = { p: kid(s, 'w:pPr'), r: kid(s, 'w:rPr'), base: val(s, 'w:basedOn') };
  const dd = kid(kid(sx, 'w:styles'), 'w:docDefaults'), defR = kid(kid(dd, 'w:rPrDefault'), 'w:rPr');
  const defSz = +val(defR, 'w:sz') || 26;
  const styleChain = id => { const out = []; for (let i = 0; id && styles[id] && i < 8; i++) { out.push(styles[id]); id = styles[id].base; } return out; };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };
  const img = (rid, cx, cy) => { const t = rels[rid]; if (!t) return ''; const p = 'word/' + t.replace(/^\/?word\//, '').replace(/^\.\//, ''), b = z[p], ext = p.split('.').pop().toLowerCase();
    if (!b || !MIME[ext] || b.length > 2e6) return ''; const w = cx ? Math.round(cx / 9525) : 0, h = cy ? Math.round(cy / 9525) : 0;
    return `<img src="data:${MIME[ext]};base64,${Buffer.from(b).toString('base64')}"${w ? ` style="width:${w}px;height:${h}px;max-width:100%"` : ''} alt="">`; };
  // đánh số / gạch đầu dòng tự động (numbering.xml)
  const nx = parseXml(txt('word/numbering.xml')), nroot = kid(nx, 'w:numbering'), abs = {}, nums = {}, cnt = {};
  for (const a of kids(nroot, 'w:abstractNum')) abs[a.a['w:abstractNumId']] = Object.fromEntries(kids(a, 'w:lvl').map(l => [l.a['w:ilvl'], { fmt: val(l, 'w:numFmt') || 'decimal', text: val(l, 'w:lvlText') ?? '', start: +val(l, 'w:start') || 1, font: kid(kid(l, 'w:rPr'), 'w:rFonts')?.a['w:ascii'] || '' }]));
  for (const n of kids(nroot, 'w:num')) { const ov = {}; for (const o of kids(n, 'w:lvlOverride')) { const so = val(o, 'w:startOverride'); if (so) ov[o.a['w:ilvl']] = +so; } nums[n.a['w:numId']] = { abs: val(n, 'w:abstractNumId'), ov }; }
  const roman = n => { let r = ''; for (const [v, c] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) while (n >= v) { r += c; n -= v; } return r; };
  const fmtN = (n, f) => f === 'lowerLetter' ? String.fromCharCode(96 + ((n - 1) % 26) + 1) : f === 'upperLetter' ? String.fromCharCode(64 + ((n - 1) % 26) + 1) : f === 'lowerRoman' ? roman(n) : f === 'upperRoman' ? roman(n).toUpperCase() : String(n);
  const numLabel = (numId, ilvl) => { const N = nums[numId], A = N && abs[N.abs]; if (!A || numId === '0') return ''; const L = A[ilvl]; if (!L || L.fmt === 'none') return '';
    const key = N.abs, c = cnt[key] ||= {};
    for (const k of Object.keys(c)) if (+k > +ilvl) delete c[k];
    c[ilvl] = c[ilvl] == null ? (N.ov[ilvl] ?? L.start) : c[ilvl] + 1;
    if (L.fmt === 'bullet') { const ch = L.text; return (!ch || /[-]/.test(ch) || /symbol|wingdings/i.test(L.font)) ? '•' : ch; }
    return L.text.replace(/%(\d)/g, (_, d) => { const lv = String(+d - 1), LL = A[lv]; return fmtN(c[lv] ?? LL?.start ?? 1, LL?.fmt || 'decimal'); }); };
  const find = (e, n, out = []) => { for (const c of e.c || []) { if (c.n === n) out.push(c); else find(c, n, out); } return out; };

  const runProps = (rPr, pStyle) => {
    const chain = [rPr, ...styleChain(pStyle).map(s => s.r)].filter(Boolean), get = n => chain.find(r => kid(r, n));
    const st = [], b = get('w:b'), i = get('w:i'), u = get('w:u'), sz = chain.map(r => val(r, 'w:sz')).find(Boolean), caps = get('w:caps'), strike = get('w:strike'), color = chain.map(r => val(r, 'w:color')).find(Boolean);
    if (b && on(b, 'w:b')) st.push('font-weight:bold');
    if (i && on(i, 'w:i')) st.push('font-style:italic');
    if (u && val(u, 'w:u') && val(u, 'w:u') !== 'none') st.push('text-decoration:underline');
    if (strike && on(strike, 'w:strike')) st.push('text-decoration:line-through');
    if (caps && on(caps, 'w:caps')) st.push('text-transform:uppercase');
    if (sz && +sz !== defSz) st.push(`font-size:${+sz / 2}pt`);
    if (color && /^[0-9A-F]{6}$/i.test(color) && !/^(000000|auto)$/i.test(color) && !/^FFFFFF$/i.test(color)) st.push(`color:#${color}`);
    if (kid(rPr, 'w:vertAlign')) { const v = val(rPr, 'w:vertAlign'); if (v === 'superscript') st.push('vertical-align:super;font-size:smaller'); if (v === 'subscript') st.push('vertical-align:sub;font-size:smaller'); }
    return st.join(';');
  };
  const runs = (p, pStyle, ctx) => {   // đoạn → [{style, html}] rồi gộp các đoạn cùng định dạng
    const out = [];
    const walk = e => {
      for (const c of e.c || []) {
        if (c.n === 'w:r') {
          const s = runProps(kid(c, 'w:rPr'), pStyle);
          for (const x of c.c) {
            if (x.n === 'w:t') out.push({ s, h: esc(x.c.map(y => y.t || '').join('')) });
            else if (x.n === 'w:tab') out.push({ s, h: '&emsp;&emsp;' });
            else if (x.n === 'w:br') { if (x.a['w:type'] === 'page') ctx.brk = true; else out.push({ s: '', h: '<br>' }); }
            else if (x.n === 'w:noBreakHyphen') out.push({ s, h: '-' });
            else if (x.n === 'w:sym') out.push({ s, h: x.a['w:char'] ? `&#x${x.a['w:char'].replace(/^F0/i, '')};` : '' });
            else if (x.n === 'w:drawing' || x.n === 'w:pict') { const bl = find(x, 'a:blip')[0] || find(x, 'v:imagedata')[0], ex = find(x, 'wp:extent')[0];
              const rid = bl?.a['r:embed'] || bl?.a['r:id']; if (rid) out.push({ s: '', h: img(rid, +ex?.a.cx, +ex?.a.cy) }); }
          }
        } else if (['w:hyperlink', 'w:smartTag', 'w:sdt', 'w:sdtContent', 'w:ins', 'w:fldSimple', 'w:customXml'].includes(c.n)) walk(c);
      }
    };
    walk(p);
    const g = []; for (const r of out) { const l = g[g.length - 1]; if (l && l.s === r.s) l.h += r.h; else g.push({ ...r }); }
    return g.map(r => r.s ? `<span style="${r.s}">${r.h}</span>` : r.h).join('');
  };
  const para = (p, ctx, inCell) => {
    const pPr = kid(p, 'w:pPr'), ps = val(pPr, 'w:pStyle'), chain = [pPr, ...styleChain(ps).map(s => s.p)].filter(Boolean);
    const g = n => chain.map(x => kid(x, n)).find(Boolean);
    const st = [], jc = g('w:jc')?.a['w:val'], ind = g('w:ind'), sp = g('w:spacing');
    if (jc === 'center') st.push('text-align:center'); else if (jc === 'right' || jc === 'end') st.push('text-align:right'); else if (jc === 'both' || jc === 'distribute') st.push('text-align:justify');
    if (ind) { const L = +(ind.a['w:left'] ?? ind.a['w:start'] ?? 0), F = +(ind.a['w:firstLine'] || 0), H = +(ind.a['w:hanging'] || 0);
      const L2 = Math.max(inCell ? 0 : L, H); if (L2) st.push(`padding-left:${pt(L2)}pt`); if (F) st.push(`text-indent:${pt(F)}pt`); if (H) st.push(`text-indent:-${pt(H)}pt`); }
    const bf = +(sp?.a['w:before'] || 0), af = +(sp?.a['w:after'] || 0);
    st.push(`margin:${bf ? pt(bf) + 'pt' : '0'} 0 ${af ? pt(af) + 'pt' : '0'}`);
    if (g('w:pageBreakBefore') && on(chain.find(x => kid(x, 'w:pageBreakBefore')), 'w:pageBreakBefore')) ctx.brk = true;
    const before = ctx.brk ? '<div style="page-break-before:always;break-before:page"></div>' : ''; ctx.brk = false;
    const np = g('w:numPr'), lab = np ? numLabel(val(np, 'w:numId'), val(np, 'w:ilvl') || '0') : '';
    let h = (lab ? esc(lab) + '&nbsp;' : '') + runs(p, ps, ctx);
    const after = ctx.brk ? '<div style="page-break-before:always;break-before:page"></div>' : ''; ctx.brk = false;
    if (kid(pPr, 'w:sectPr')) ctx.brk = true;   // hết một section → trang mới
    if (!h.replace(/<br>/g, '').trim()) h = '&nbsp;';
    return `${before}<p style="${st.join(';')}">${h}</p>${after}`;
  };
  const bordered = tbl => { const b = kid(kid(tbl, 'w:tblPr'), 'w:tblBorders'); let tb = b;
    if (!tb) { const sid = val(kid(tbl, 'w:tblPr'), 'w:tblStyle'); const s = sid && sx && find(sx, 'w:style').find(x => x.a['w:styleId'] === sid); tb = s && find(s, 'w:tblBorders')[0]; }
    return !!tb && (tb.c || []).some(x => x.a['w:val'] && !['nil', 'none'].includes(x.a['w:val'])); };
  const table = (tbl, ctx) => {
    const grid = kids(kid(tbl, 'w:tblGrid'), 'w:gridCol').map(x => +x.a['w:w'] || 0), tot = grid.reduce((a, b) => a + b, 0) || 1;
    const B = bordered(tbl), rows = kids(tbl, 'w:tr');
    // lưới ô: gộp ngang (gridSpan) + gộp dọc (vMerge)
    const M = rows.map(tr => { let col = 0; return kids(tr, 'w:tc').map(tc => { const tp = kid(tc, 'w:tcPr'), span = +val(tp, 'w:gridSpan') || 1, vm = kid(tp, 'w:vMerge');
      const c = { tc, col, span, vm: vm ? (vm.a['w:val'] === 'restart' ? 'r' : 'c') : '', rs: 1 }; col += span; return c; }); });
    for (let r = 0; r < M.length; r++) for (const c of M[r]) if (c.vm === 'r') { for (let k = r + 1; k < M.length; k++) { const d = M[k].find(x => x.col === c.col); if (d?.vm === 'c') { c.rs++; d.skip = true; } else break; } }
    for (const row of M) for (const c of row) if (c.vm === 'c' && !c.skip) c.vm = '';
    const bd = B ? 'border:1px solid #000;' : '';
    const body = M.map((row, r) => `<tr>${row.filter(c => !c.skip).map(c => { const tp = kid(c.tc, 'w:tcPr'), va = val(tp, 'w:vAlign'), sh = kid(tp, 'w:shd')?.a['w:fill'];
      const tcb = kid(tp, 'w:tcBorders'), cb = tcb ? ['top', 'left', 'bottom', 'right'].map(sd => { const x = kid(tcb, 'w:' + sd) || (sd === 'left' ? kid(tcb, 'w:start') : sd === 'right' ? kid(tcb, 'w:end') : null); return x ? `border-${sd}:${['nil', 'none'].includes(x.a['w:val']) ? '0' : '1px solid #000'};` : ''; }).join('') : '';
      const inner = c.tc.c.map(x => x.n === 'w:p' ? para(x, ctx, true) : x.n === 'w:tbl' ? table(x, ctx) : '').join('');
      return `<td${c.span > 1 ? ` colspan="${c.span}"` : ''}${c.rs > 1 ? ` rowspan="${c.rs}"` : ''} style="${bd}${cb}padding:2pt 4pt;vertical-align:${va === 'center' ? 'middle' : va === 'bottom' ? 'bottom' : 'top'}${sh && /^[0-9A-F]{6}$/i.test(sh) && sh.toUpperCase() !== 'FFFFFF' ? `;background:#${sh}` : ''}">${inner}</td>`; }).join('')}</tr>`).join('');
    const cg = grid.length ? `<colgroup>${grid.map(w => `<col style="width:${(w / tot * 100).toFixed(1)}%">`).join('')}</colgroup>` : '';
    return `<table class="xl" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:2pt 0">${cg}<tbody>${body}</tbody></table>`;
  };
  const bodyEl = kid(kid(parseXml(docXml), 'w:document'), 'w:body'); if (!bodyEl) throw new Error('Không đọc được nội dung file Word');
  const ctx = { brk: false };
  const walkBody = e => e.c.map(x => x.n === 'w:p' ? para(x, ctx, false) : x.n === 'w:tbl' ? table(x, ctx) : x.n === 'w:sdt' ? walkBody(kid(x, 'w:sdtContent') || { c: [] }) : '').join('');
  let html = walkBody(bodyEl);
  html = joinFields(html).replace(/(<p style="[^"]*">&nbsp;<\/p>){3,}/g, '$1$1');   // bớt dòng trống liền nhau
  return `<div class="docx" style="font-family:'Times New Roman',serif;font-size:${defSz / 2}pt;line-height:1.25">${html}</div>`;
}
// {ten_<span …>kh</span>} → {ten_kh}
const joinFields = h => h.replace(/\{(?:[^{}<]|<[^>]+>)*\}/g, m => m.replace(/<[^>]+>/g, '') + (m.match(/<[^>]+>/g) || []).join(''));   // chữ trường liền một khối, thẻ định dạng đặt sau

function xlsxToHtml(buf) {
  const { readXlsx } = require('./xlsx');
  const sh = readXlsx(buf).find(s => s.rows.some(r => r.some(c => String(c).trim()))); if (!sh) throw new Error('File Excel trống');
  const rows = sh.rows.filter(r => r.some(c => String(c).trim())), n = Math.max(...rows.map(r => r.length));
  return joinFields(`<table class="xl" style="width:100%;border-collapse:collapse">${rows.map(r => `<tr>${Array.from({ length: n }, (_, i) => `<td style="border:1px solid #000;padding:2pt 4pt">${esc(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</table>`);
}

function fileToHtml(f) {
  const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase(), b = Buffer.from(f.buffer);
  if (ext === 'docx' || ext === 'dotx' || ext === 'docm') return docxToHtml(b);
  if (ext === 'xlsx' || ext === 'xlsm') return xlsxToHtml(b);
  if (ext === 'html' || ext === 'htm') { let s = b.toString('utf8'); const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(s); if (m) { const css = [...s.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map(x => x[0]).join(''); s = css + m[1]; } return s; }
  if (ext === 'txt') return b.toString('utf8').split(/\r?\n/).map(l => `<p style="margin:0">${esc(l) || '&nbsp;'}</p>`).join('');
  if (ext === 'doc' || ext === 'xls') throw new Error(`«${f.name}» là định dạng Office cũ — mở bằng Word / Excel rồi «Lưu thành» .docx / .xlsx và tải lại`);
  throw new Error(`«${f.name}»: chỉ nhận file Word .docx, Excel .xlsx, .html, .txt`);
}
const nameOf = fn => String(fn).replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
const codeOf = fn => 'UP-' + nameOf(fn).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'D').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

module.exports = { docxToHtml, xlsxToHtml, fileToHtml, nameOf, codeOf };
