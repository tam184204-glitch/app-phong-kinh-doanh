// ---- ui.js
// Lõi giao diện: tiện ích, gọi API, hộp thoại, form tự sinh từ meta, danh sách, ngăn chi tiết.
'use strict';
let M = null;                 // meta từ máy chủ (/api/meta)
const ST = { list: {} };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fm = n => n == null || n === '' || isNaN(n) ? '' : Math.round(+n).toLocaleString('vi-VN');
const fmB = n => { n = +n || 0; const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ' : a >= 1e6 ? (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr' : fm(n); };
const fnum = n => n == null || n === '' ? '' : (+n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const dmy = v => v && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '';
const vnParts = v => { const d = new Date(v); if (isNaN(d)) return null; const z = new Date(d.getTime() + 7 * 3600e3).toISOString(); return { d: z.slice(0, 10), t: z.slice(11, 16) }; };
const dmyhm = v => { const p = v && vnParts(v); return p ? `${dmy(p.d)} ${p.t}` : ''; };
const mmy = v => v && /^\d{4}-\d{2}$/.test(v) ? `${v.slice(5)}/${v.slice(0, 4)}` : v || '';
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const roleName = r => M.roles.find(x => x[0] === r)?.[1] || r;
const userName = id => M.users.find(u => u.id === id)?.full_name || '';
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const ico = (n, cls = '') => `<i class="fa-solid ${n} ${cls}"></i>`;

// ---------- API ----------
async function api(method, url, body, { raw } = {}) {
  const opt = { method, headers: {} };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(url, opt);
  if (raw && r.ok) return r;
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (r.status === 401) { if (!location.hash.startsWith('#/login')) { location.hash = '#/login'; location.reload(); } throw new Error(data.error || 'Cần đăng nhập'); }
  if (r.status === 403 && data.must_change) { forcePassword(); throw new Error(data.error); }
  if (!r.ok) { const e = new Error(data.error || data || 'Lỗi'); e.fields = data.fields; e.status = r.status; throw e; }
  return data;
}
async function download(url, body, name) {
  try {
    const r = body ? await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) : await fetch(url);
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Không tải được'); }
    const cd = r.headers.get('content-disposition') || ''; const fn = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(cd) || [])[1] || name || 'tai-ve');
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = fn; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { toast(e.message, true); }
}
let toastT;
function toast(msg, err) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.toggle('err', !!err); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, err ? 6000 : 3500);
}
const run = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };

// ---------- hộp thoại ----------
function modal({ title, body = '', wide, narrow, foot = '', onClose }) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${narrow ? 'narrow' : ''}" role="dialog" aria-modal="true"><div class="mh"><h3>${title}</h3><button class="btn ghost sm x" data-x aria-label="Đóng">${ico('fa-xmark')}</button></div><div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  document.body.append(ov);
  const close = () => { ov.remove(); onClose && onClose(); document.removeEventListener('keydown', kd); };
  const kd = e => { if (e.key === 'Escape' && document.body.lastElementChild === ov) close(); };
  document.addEventListener('keydown', kd);
  ov.addEventListener('mousedown', e => { if (e.target === ov) ov._down = true; });
  ov.addEventListener('mouseup', e => { if (e.target === ov && ov._down) close(); ov._down = false; });
  $$('[data-x]', ov).forEach(b => b.onclick = close);
  setTimeout(() => $('input:not([type=hidden]):not([readonly]),select,textarea', ov)?.focus(), 30);
  return { el: ov, close, body: $('.mb', ov) };
}
function ask(title, msg, { okLabel = 'Đồng ý', danger, reason, reasonLabel = 'Lý do', reasonReq } = {}) {
  return new Promise(res => {
    const m = modal({ title, narrow: true, body: `<p style="margin:0 0 10px">${msg}</p>${reason ? `<div class="fld"><label>${reasonLabel}${reasonReq ? '<span class="req">*</span>' : ''}</label><textarea id="askR"></textarea></div>` : ''}`,
      foot: `<button class="btn" data-x>Hủy</button><button class="btn ${danger ? 'danger' : 'pri'}" id="askOk">${okLabel}</button>`, onClose: () => res(false) });
    $('#askOk', m.el).onclick = () => { const r = reason ? $('#askR', m.el).value.trim() : true; if (reason && reasonReq && !r) { toast('Cần nhập ' + reasonLabel.toLowerCase(), true); return; } m.el.remove(); res(r || true); };
  });
}

// ---------- hiển thị giá trị ----------
const optOf = (f, v) => (f.o || []).find(o => o[0] === v);
function pill(label, color) { return `<span class="pill ${color || ''}">${esc(label)}</span>`; }
function show(f, row, { plain } = {}) {
  const v = row[f.k];
  if (v == null || v === '') return plain ? '' : '<span class="muted">—</span>';
  switch (f.t) {
    case 'money': return fm(v);
    case 'num': return fnum(v);
    case 'int': return String(v);
    case 'date': return dmy(v);
    case 'dt': return dmyhm(v);
    case 'month': return mmy(v);
    case 'bool': return v ? (plain ? 'Có' : `<span style="color:var(--g)">${ico('fa-circle-check')}</span>`) : (plain ? '' : `<span class="muted">${ico('fa-circle-minus')}</span>`);
    case 'sel': { const o = optOf(f, v); return plain ? (o?.[1] ?? v) : o?.[2] ? pill(o[1], o[2]) : esc(o?.[1] ?? v); }
    case 'ref': case 'refs': case 'user': return esc(row[f.k + '__l'] ?? '#' + v);
    case 'check': { const n = v.filter(x => x.st === 'da_nhan').length, bad = v.filter(x => ['thieu', 'can_sua'].includes(x.st)).length; return plain ? `${n}/${v.length}` : `<span class="${bad ? 'neg' : ''}">${n}/${v.length}${bad ? ` · thiếu ${bad}` : ''}</span>`; }
    case 'json': return plain ? JSON.stringify(v) : '<span class="muted">(xem chi tiết)</span>';
    case 'long': return plain ? v : esc(v).replace(/\n/g, '<br>');
    default: return esc(v);
  }
}
const VIRT_MONEY = new Set(['paid', 'actual', 'gap']);
function cell(ent, k, row) {
  const f = M.ents[ent].fields.find(x => x.k === k);
  if (f) return { html: show(f, row), num: ['money', 'num', 'int'].includes(f.t) };
  const v = row[k];
  if (k === 'created_by') return { html: esc(row.created_by__l || '') };
  if (k === 'prints') return { html: `<span class="nowrap"><button type="button" class="btn sm" data-print="dang_ky_can" title="In bản đăng ký căn hộ (chọn mẫu in)">${ico('fa-print')} Căn hộ</button> <button type="button" class="btn sm" data-print="dang_ky_noi_that" title="In bản đăng ký nội thất (chọn mẫu in)">${ico('fa-couch')} Nội thất</button></span>` };
  if (k === 'created_at') return { html: dmy(v) };
  if (VIRT_MONEY.has(k)) return { html: v == null ? '' : `<span class="${k === 'gap' ? (v < 0 ? 'neg' : v > 0 ? 'pos' : '') : ''}">${fm(v)}</span>`, num: true };
  if (k === 'promise_st') return { html: v ? pill(v, /Thất/.test(v) ? 'r' : /Đúng/.test(v) ? 'g' : /một phần/.test(v) ? 'a' : 'b') : '' };
  if (k === 'pay_status') return { html: v ? pill(v, /Quá hạn/.test(v) ? 'r' : /Đã thu/.test(v) ? 'g' : /Đến hạn|Sắp/.test(v) ? 'a' : /Hết hiệu lực/.test(v) ? 's' : 'b') : '' };
  if (k === 'sla') return { html: v ? pill(v, /Quá/.test(v) ? 'r' : /Còn/.test(v) ? 'a' : /phản hồi/.test(v) ? 'g' : 'b') : '' };
  if (k === 'stage') return { html: v ? pill(v, /hủy|từ chối|không đạt|Hết hạn/i.test(v) ? 's' : /Đã ký/.test(v) ? 'g' : /Đủ điều kiện/.test(v) ? 'b' : 'a') : '' };
  if (k === 'defects_open') return { html: v ? `<span class="neg">${v}</span>` : '0', num: true };
  if (k === 'days_in' || k === 'days_out') return { html: v == null ? '' : v + ' ngày', num: true };
  return { html: esc(v ?? '') };
}
const colLabel = (ent, k) => M.ents[ent].fields.find(f => f.k === k)?.l || M.virt[k] || k;

// ---------- ô nhập ----------
const isShown = (f, rec) => !f.show || Object.entries(f.show).every(([k, vals]) => vals.includes(rec[k]));
function parseDmy(s) { s = String(s || '').trim(); if (!s) return ''; let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; return s; }
function parseDt(s) { s = String(s || '').trim(); if (!s) return ''; const m = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s); if (m) return `${parseDmy(m[1])}T${(m[2] || '00').padStart(2, '0')}:${m[3] || '00'}:00+07:00`; return s; }
function parseMonth(s) { s = String(s || '').trim(); const m = /^(\d{1,2})[/.-](\d{4})$/.exec(s); return m ? `${m[2]}-${m[1].padStart(2, '0')}` : s; }
const moneyStr = v => v == null || v === '' ? '' : fm(v);
function input(f, v, rec = {}, { ro, id } = {}) {
  const nm = `name="${f.k}" data-t="${f.t}" id="${id || 'f_' + f.k}"`;
  if (ro) return `<div class="ro">${show(f, rec)}</div>`;
  if (f.upload) return `<div class="upfile"><input type="file" accept="${f.upload}" ${nm}>${v ? `<span class="small muted">Đang có: ${esc(v)} — chọn tệp mới để thay</span>` : ''}</div>`;
  if (f.pick === 'units') return `<div class="upick" data-pick-units><input type="hidden" ${nm} value="${esc(v ?? '*')}"><div class="upick-bd"></div></div>`;
  switch (f.t) {
    case 'long': return `<textarea ${nm} rows="3">${esc(v ?? '')}</textarea>`;
    case 'money': return `<input ${nm} inputmode="numeric" value="${esc(moneyStr(v))}" autocomplete="off">`;
    case 'num': case 'int': return `<input ${nm} inputmode="decimal" value="${esc(v == null ? '' : String(v).replace('.', ','))}" autocomplete="off">`;
    case 'date': return `<div class="dwrap"><input ${nm} value="${esc(dmy(v))}" placeholder="dd/mm/yyyy" autocomplete="off"><button type="button" tabindex="-1" data-pick="date" title="Chọn ngày">${ico('fa-calendar-days')}</button><input type="date" tabindex="-1" aria-hidden="true"></div>`;
    case 'dt': return `<div class="dwrap"><input ${nm} value="${esc(dmyhm(v))}" placeholder="dd/mm/yyyy hh:mm" autocomplete="off"><button type="button" tabindex="-1" data-pick="datetime-local" title="Chọn ngày giờ">${ico('fa-calendar-days')}</button><input type="datetime-local" tabindex="-1" aria-hidden="true"></div>`;
    case 'month': return `<div class="dwrap"><input ${nm} value="${esc(mmy(v))}" placeholder="mm/yyyy" autocomplete="off"><button type="button" tabindex="-1" data-pick="month" title="Chọn tháng">${ico('fa-calendar')}</button><input type="month" tabindex="-1" aria-hidden="true"></div>`;
    case 'sel': return `<select ${nm}><option value="">— chọn —</option>${(f.o || []).map(o => `<option value="${esc(o[0])}" ${o[0] === v ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    case 'bool': return `<label class="chk" style="height:38px"><input type="checkbox" ${nm} ${v ? 'checked' : ''}> Có</label>`;
    case 'user': { const us = M.users.filter(u => (u.active || u.id === v) && (!f.roles || f.roles.includes(u.role) || u.role === 'admin')); return `<select ${nm}><option value="">— chọn —</option>${us.map(u => `<option value="${u.id}" ${u.id === v ? 'selected' : ''}>${esc(u.full_name)} · ${esc(roleName(u.role))}</option>`).join('')}</select>`; }
    case 'ref': return `<div class="combo" data-ref="${f.ref}" ${f.filter ? `data-filter="${f.filter}"` : ''} ${f.dep ? `data-dep="${f.dep}"` : ''}><input type="text" placeholder="Gõ để tìm ${esc(M.ents[f.ref].one)}…" value="${esc(rec[f.k + '__l'] ?? '')}" autocomplete="off" data-combo><input type="hidden" ${nm} value="${esc(v ?? '')}"><button type="button" class="x" tabindex="-1" title="Bỏ chọn">${ico('fa-xmark')}</button></div>`;
    case 'refs': { const ids = v || [], ls = String(rec[f.k + '__l'] ?? '').split(', '), lab = (id, i) => { const p = f.ref === 'project' && M.projects.find(x => x.id === id); return p ? `${p.code} · ${p.name}` : ids.length === ls.length ? ls[i] : '#' + id; };
      return `<div class="combo multi" data-ref="${f.ref}" data-multi><div class="chips">${ids.map((id, i) => `<span class="chip" data-id="${id}">${esc(lab(id, i))}<button type="button" tabindex="-1" title="Bỏ">${ico('fa-xmark')}</button></span>`).join('')}<input type="text" placeholder="${ids.length ? 'Thêm' : 'Gõ để tìm'} ${esc(M.ents[f.ref].one)}…" autocomplete="off" data-combo></div><input type="hidden" ${nm} value="${esc(ids.join(','))}"></div>`; }
    case 'check': return `<div class="cklist" ${nm}>${checkRows(v || [])}</div>`;
    case 'json': return f.k === 'new_schedule' ? `<div data-sched ${nm}></div>` : `<div class="ro">${show(f, rec)}</div>`;
    default: return `<input ${nm} value="${esc(v ?? '')}" autocomplete="off">`;
  }
}
const CK = [['', '— chưa —'], ['da_nhan', 'Đã nhận / đạt'], ['thieu', 'Thiếu'], ['can_sua', 'Cần sửa / bổ sung']];
function checkRows(items) {
  return `<div class="it hd"><div>Giấy tờ / hạng mục</div><div>Tình trạng</div><div>Ghi chú</div></div>` + items.map((x, i) => `<div class="it ${x.st || ''}" data-i="${i}"><div>${esc(x.n)}</div><div><select data-ck="st">${CK.map(o => `<option value="${o[0]}" ${o[0] === (x.st || '') ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div><div><input data-ck="note" value="${esc(x.note || '')}" placeholder="Ghi chú"></div><input type="hidden" data-ck="n" value="${esc(x.n)}"></div>`).join('')
    + `<div class="it"><div class="row"><input data-ck-new placeholder="+ Thêm giấy tờ khác…" style="flex:1"><button type="button" class="btn sm" data-ck-add>Thêm</button></div></div>`;
}
function readCheck(el) { return $$('.it[data-i]', el).map(r => ({ n: $('[data-ck=n]', r).value, st: $('[data-ck=st]', r).value, note: $('[data-ck=note]', r).value })); }
function wireInputs(root, onChange) {
  $$('[data-pick]', root).forEach(b => {
    const wrap = b.parentElement, txt = $('input[name]', wrap), nat = $(`input[type=${b.dataset.pick}]`, wrap);
    b.onclick = () => { const v = txt.dataset.t === 'date' ? parseDmy(txt.value) : txt.dataset.t === 'month' ? parseMonth(txt.value) : parseDt(txt.value).slice(0, 16); try { nat.value = v; } catch { } try { nat.showPicker(); } catch { nat.click(); } };
    nat.onchange = () => { const v = nat.value; if (!v) return; txt.value = txt.dataset.t === 'date' ? dmy(v) : txt.dataset.t === 'month' ? mmy(v) : `${dmy(v.slice(0, 10))} ${v.slice(11, 16)}`; txt.dispatchEvent(new Event('change', { bubbles: true })); };
  });
  $$('input[data-t=money]', root).forEach(i => { i.addEventListener('blur', () => { const n = num(i.value, true); if (i.value.trim() && isFinite(n)) i.value = fm(n); }); });
  $$('input[data-t=date]', root).forEach(i => i.addEventListener('blur', () => { const m = /^(\d{1,2})(\d{2})(\d{4})$/.exec(i.value.trim()); if (m) i.value = `${m[1].padStart(2, '0')}/${m[2]}/${m[3]}`; }));
  $$('.combo', root).forEach(c => combo(c, root, onChange));
  $$('.cklist', root).forEach(el => {
    el.addEventListener('change', e => { const r = e.target.closest('.it[data-i]'); if (r && e.target.dataset.ck === 'st') r.className = 'it ' + e.target.value; });
    el.addEventListener('click', e => { if (!e.target.matches('[data-ck-add]')) return; const inp = $('[data-ck-new]', el); const v = inp.value.trim(); if (!v) return; const items = readCheck(el); items.push({ n: v, st: '', note: '' }); el.innerHTML = checkRows(items); });
  });
  root.addEventListener('change', () => onChange && onChange());
}
function num(s, money) {
  if (typeof s === 'number') return s; s = String(s ?? '').replace(/\s|đ|₫/g, ''); if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (money || /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}
function readField(root, f) {
  const el = $(`[name="${f.k}"]`, root); if (!el) return undefined;
  if (f.upload) return el.files?.[0]?.name || undefined;
  switch (f.t) {
    case 'bool': return el.checked;
    case 'money': { const v = el.value.trim(); return v ? num(v, true) : null; }
    case 'num': case 'int': { const v = el.value.trim(); return v ? num(v) : null; }
    case 'date': return parseDmy(el.value) || null;
    case 'dt': return parseDt(el.value) || null;
    case 'month': return parseMonth(el.value) || null;
    case 'ref': case 'user': return el.value ? +el.value : null;
    case 'refs': return el.value ? el.value.split(',').map(Number) : null;
    case 'check': return readCheck(el);
    case 'json': return el._get ? el._get() : undefined;
    default: return el.value.trim() || null;
  }
}
function combo(c, root, onChange) {
  const txt = $('[data-combo]', c), hid = $('input[type=hidden]', c), ref = c.dataset.ref, multi = 'multi' in c.dataset;
  let box = null, items = [], cur = -1;
  const close = () => { box?.remove(); box = null; };
  // chọn nhiều: mỗi lựa chọn thành 1 thẻ, ô ẩn giữ danh sách id cách nhau dấu phẩy
  const ids = () => hid.value ? hid.value.split(',').map(Number) : [];
  const changed = () => { if (multi) txt.placeholder = `${ids().length ? 'Thêm' : 'Gõ để tìm'} ${M.ents[ref].one}…`; hid.dispatchEvent(new Event('change', { bubbles: true })); onChange && onChange(); };
  const pickIt = it => {
    if (!multi) { hid.value = it.id; txt.value = it.label; close(); changed(); return; }
    if (!ids().includes(it.id)) { hid.value = [...ids(), it.id].join(','); txt.insertAdjacentHTML('beforebegin', `<span class="chip" data-id="${it.id}">${esc(it.label)}<button type="button" tabindex="-1" title="Bỏ">${ico('fa-xmark')}</button></span>`); }
    txt.value = ''; changed(); load();
  };
  const unpick = chip => { hid.value = ids().filter(x => x !== +chip.dataset.id).join(','); chip.remove(); changed(); };
  const load = debounce(async () => {
    const p = new URLSearchParams({ q: txt.value.trim() });
    if (c.dataset.filter) p.set('filter', c.dataset.filter);
    if (c.dataset.dep) { const d = $(`[name="${c.dataset.dep}"]`, root)?.value; if (d) { p.set('dep', c.dataset.dep); p.set('depv', d); } }
    try { items = await api('GET', `/api/opts/${ref}?${p}`); } catch { items = []; }
    if (multi) items = items.filter(it => !ids().includes(it.id));
    if (document.activeElement !== txt) return;
    close(); box = document.createElement('div'); box.className = 'opts'; cur = -1;
    box.innerHTML = items.length ? items.map((it, i) => `<div data-i="${i}"><span>${esc(it.label)}</span><small>${esc(it.sub || '')}</small></div>`).join('') : `<div class="muted">${multi && ids().length && !txt.value.trim() ? 'Đã chọn hết' : 'Không tìm thấy'}${c.dataset.filter === 'con_ban' ? ' căn còn bán' : ''}</div>`;
    box.onmousedown = e => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); pickIt(items[+d.dataset.i]); } };
    c.append(box);
  }, 200);
  txt.addEventListener('focus', load); txt.addEventListener('input', () => { if (!multi) hid.value = ''; load(); });
  txt.addEventListener('blur', () => setTimeout(() => { close(); if (multi || !hid.value) txt.value = ''; }, 150));
  txt.addEventListener('keydown', e => {
    if (!box) return; const ds = $$('[data-i]', box);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, Math.min(ds.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1))); ds.forEach((d, i) => d.classList.toggle('on', i === cur)); ds[cur]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter' && cur >= 0) { e.preventDefault(); pickIt(items[cur]); }
  });
  if (multi) {
    c.addEventListener('mousedown', e => { const b = e.target.closest('.chip button'); if (b) { e.preventDefault(); unpick(b.parentElement); } else if (!e.target.closest('.opts') && e.target !== txt) { e.preventDefault(); txt.focus(); } });
    txt.addEventListener('keydown', e => { if (e.key === 'Backspace' && !txt.value) { const last = $$('.chip', c).pop(); if (last) unpick(last); } });
    return;
  }
  $('.x', c).onclick = () => { hid.value = ''; txt.value = ''; hid.dispatchEvent(new Event('change', { bubbles: true })); onChange && onChange(); txt.focus(); };
}

// lịch thanh toán (soạn các đợt)
function schedEditor(el, rows, { total, base } = {}) {
  let R = (rows || []).map(r => ({ ...r }));
  const totalOf = () => typeof total === 'function' ? total() : total;
  const draw = () => {
    const tot = totalOf() || 0, sum = R.reduce((s, r) => s + (+r.amount || (r.pct ? Math.round(tot * r.pct / 100) : 0)), 0);
    el.innerHTML = `<div class="row mb">${(M.settings.schedule_presets || []).map((p, i) => `<button type="button" class="btn sm" data-pre="${i}">${ico('fa-wand-magic-sparkles')} ${esc(p.name)}</button>`).join('')}<span class="muted small">Mẫu tính ngày từ ngày gốc</span><input class="inp" style="width:120px;height:30px" data-base value="${esc(dmy(base || today()))}"></div>
      <table class="t compact noclick sched"><thead><tr><th>Đợt</th><th>Nội dung</th><th>Ngày đến hạn</th><th class="num">Tỷ lệ %</th><th class="num">Số tiền</th><th></th></tr></thead><tbody>
      ${R.map((r, i) => `<tr data-i="${i}"><td>${i + 1}</td><td><input data-k="name" value="${esc(r.name || '')}"></td><td><input data-k="due_on" value="${esc(dmy(r.due_on) || r.due_on || '')}" placeholder="dd/mm/yyyy" style="width:120px"></td><td><input data-k="pct" value="${r.pct ?? ''}" style="width:70px;text-align:right"></td><td><input data-k="amount" value="${r.amount ? fm(r.amount) : ''}" placeholder="${r.pct && tot ? fm(Math.round(tot * r.pct / 100)) : ''}" style="width:150px;text-align:right"></td><td><button type="button" class="btn ghost sm" data-del="${i}">${ico('fa-trash')}</button></td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="3"><button type="button" class="btn sm" data-add>${ico('fa-plus')} Thêm đợt</button></td><td class="num">${fnum(R.reduce((s, r) => s + (+r.pct || 0), 0))}%</td><td class="num ${tot && Math.abs(sum - tot) > 1000 * R.length ? 'neg' : 'pos'}">${fm(sum)}</td><td></td></tr></tfoot></table>
      <div class="small muted mt">Phải khớp nghĩa vụ phải thu: <b>${fm(tot)}</b> đ. Nhập tỷ lệ % hoặc số tiền; chênh lệch làm tròn (≤ 1.000đ/đợt) dồn vào đợt cuối.</div>`;
  };
  const sync = () => { $$('tbody tr', el).forEach(tr => { const r = R[+tr.dataset.i]; for (const i of $$('input', tr)) { const k = i.dataset.k; r[k] = k === 'pct' ? (i.value.trim() ? num(i.value) : null) : k === 'amount' ? (i.value.trim() ? num(i.value, true) : null) : k === 'due_on' ? parseDmy(i.value) : i.value; } }); };
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; sync();
    if (b.dataset.add !== undefined) R.push({ name: `Đợt ${R.length + 1}`, due_on: '', pct: null, amount: null });
    if (b.dataset.del !== undefined) R.splice(+b.dataset.del, 1);
    if (b.dataset.pre !== undefined) { const p = M.settings.schedule_presets[+b.dataset.pre], bs = parseDmy($('[data-base]', el).value) || today(); R = p.rows.map(([name, pct, off]) => ({ name, pct, due_on: addDays(bs, off), amount: null })); }
    draw();
  });
  el.addEventListener('change', e => { if (e.target.dataset.k === 'pct' || e.target.dataset.k === 'amount') { sync(); draw(); } });
  el._get = () => { sync(); return R.filter(r => r.name || r.due_on || r.pct || r.amount).map(r => ({ name: r.name, due_on: r.due_on, pct: r.pct, amount: r.amount })); };
  el._redraw = draw;
  draw();
}

// ---------- form tạo / sửa ----------
async function openForm(ent, { id, preset = {}, onSaved, title } = {}) {
  const E = M.ents[ent];
  let rec = { ...preset }, perm = null;
  if (id) {
    const g = await api('GET', `/api/e/${ent}/${id}`); rec = g.row; perm = g.perm;
    if (E.fields.some(f => f.pii) && M.piiRoles.includes(M.me.role) && rec._masked) Object.assign(rec, await api('GET', `/api/pii/${ent === 'reservation' ? 'reservation' : 'customer'}/${id}`));
  } else {
    for (const f of E.fields) if (rec[f.k] === undefined && f.def !== undefined && !f.ro) rec[f.k] = f.def === 'me' ? M.me.id : f.def === 'today' ? today() : f.def === 'now' ? new Date().toISOString() : f.def;
  }
  const lockKeep = perm?.locked ? new Set(perm.lockKeep || []) : null;
  const fields = E.fields.filter(f => !(f.ro && !id) && !(f.t === 'code' && !id && !f.manual) && !(f.t === 'json' && f.k !== 'new_schedule'));
  const wide = f => ['long', 'check', 'json'].includes(f.t) || !!f.pick || !!f.upload;
  const body = `${E.note ? `<div class="warnbar">${ico('fa-circle-info')}<span>${esc(E.note)}</span></div>` : ''}${lockKeep ? `<div class="lockbar">${ico('fa-lock')} Bản ghi đã chốt — chỉ sửa được: ${[...lockKeep].map(k => E.fields.find(f => f.k === k)?.l).join(', ')}</div>` : ''}<div id="ferr"></div><form class="form" autocomplete="off">${fields.map(f => {
    const ro = f.ro || (f.t === 'code' && !f.manual) || (lockKeep && !lockKeep.has(f.k)) || (f.pii && id && !M.piiRoles.includes(M.me.role) && rec[f.k]);
    return `<div class="fld ${wide(f) ? 'wide' : ''}" data-f="${f.k}"><label for="f_${f.k}">${esc(f.l)}${f.req && !ro ? '<span class="req">*</span>' : ''}${f.pii ? ` <span class="tag" title="Dữ liệu cá nhân — chỉ người có quyền được xem">${ico('fa-shield-halved')} định danh</span>` : ''}</label>${input(f, rec[f.k], rec, { ro })}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`;
  }).join('')}</form>`;
  const canSubmit = E.flow && !E.direct && !id && E.flow.submit.includes(E.fields.find(f => f.k === E.flow.field)?.def);
  const m = modal({ title: title || (id ? `Sửa ${E.one} ${esc(rec.code || rec.number || '')}` : `${E.code ? `<span class="tag">${E.code}</span> ` : ''}Tạo ${E.one}`), wide: fields.length > 8 || fields.some(wide),
    body, foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="fSave">${ico('fa-floppy-disk')} ${id ? 'Lưu' : E.direct ? `Lưu ${E.one}` : 'Lưu nháp'}</button>${canSubmit ? `<button class="btn amb" id="fSub">${ico('fa-paper-plane')} Lưu & ${esc(E.flow.submitLabel || 'trình duyệt')}</button>` : ''}` });
  const form = $('form', m.el);
  const sch = $('[data-sched]', form);
  if (sch) schedEditor(sch, rec.new_schedule || [], { total: () => readField(form, E.fields.find(f => f.k === 'value_after')) || rec.value_before || 0 });
  const vis = () => { const cur = collect(true); for (const f of fields) { const box = $(`[data-f="${f.k}"]`, form); if (box) box.classList.toggle('hidden', !isShown(f, cur)); } };
  const collect = (all) => { const out = {}; for (const f of fields) { if (f.ro || (f.t === 'code' && !f.manual)) continue; if (lockKeep && !lockKeep.has(f.k)) continue; const v = readField(form, f); if (v !== undefined) out[f.k] = v; } return all ? { ...rec, ...out } : out; };
  // checklist theo nhóm / mẫu
  const ckF = fields.find(f => f.t === 'check' && f.src);
  const fillCheck = () => {
    if (!ckF) return; const el = $(`[name="${ckF.k}"]`, form); const cur = readCheck(el);
    if (cur.some(x => x.st || x.note)) return;
    const s = M.settings[ckF.src]; let list = Array.isArray(s) ? s : s?.[readField(form, fields.find(f => f.k === ckF.srcBy) || {})] || s?._all || [];
    if (list.length && JSON.stringify(list) !== JSON.stringify(cur.map(x => x.n))) el.innerHTML = checkRows(list.map(n => ({ n, st: '', note: '' })));
  };
  wireInputs(form, () => { vis(); });
  // chọn căn / khách → tự điền các ô liên quan (giá theo danh mục sản phẩm, thông tin khách)
  for (const f of fields.filter(f => f.fill)) form.addEventListener('change', async e => {
    if (e.target.name !== f.k || !e.target.value) return;
    try {
      const src = (await api('GET', `/api/e/${f.ref}/${e.target.value}`)).row;
      if (f.ref === 'customer' && src._masked && M.piiRoles.includes(M.me.role)) Object.assign(src, await api('GET', `/api/pii/customer/${src.id}`));
      for (const [to, from] of Object.entries(f.fill)) {
        const el = form.elements[to], tf = fields.find(x => x.k === to), v = src[from];
        if (!el || !tf || v == null || v === '' || String(v).startsWith('•')) continue;
        if (f.ref === 'customer' && el.value) continue;        // thông tin khách đã gõ thì giữ
        el.value = tf.t === 'money' ? moneyStr(v) : tf.t === 'date' ? dmy(v) : v;
      }
    } catch (er) { toast(er.message, true); }
  });
  $$('[data-pick-units]', form).forEach(el => unitPicker(el, form).catch(e => toast(e.message, true)));
  if (ckF && !id) { fillCheck(); form.addEventListener('change', e => { if (e.target.name === ckF.srcBy) fillCheck(); }); }
  vis();
  const errBox = $('#ferr', m.el);
  const showErr = (e) => { errBox.innerHTML = `<div class="errbar">${ico('fa-triangle-exclamation')} ${esc(e.message)}</div>`; $$('.fld.err', form).forEach(x => x.classList.remove('err')); (e.fields || []).forEach(k => $(`[data-f="${k}"]`, form)?.classList.add('err')); errBox.scrollIntoView({ block: 'nearest' }); };
  const showWarn = w => { if (w?.length) errBox.innerHTML = `<div class="warnbar">${ico('fa-circle-exclamation')}<div>${w.map(esc).join('<br>')}</div></div>`; };
  const send = async (check) => {
    const data = collect();
    for (const f of fields) if (!isShown(f, { ...rec, ...data }) && f.k in data && !f.ro) data[f.k] = null;
    return id ? api('PUT', `/api/e/${ent}/${id}${check ? '?check=1' : ''}`, data) : api('POST', `/api/e/${ent}${check ? '?check=1' : ''}`, data);
  };
  const save = async (andSubmit) => {
    const btns = $$('.mf .btn', m.el); btns.forEach(b => b.disabled = true);
    try {
      const r = await send(false);
      // tệp đính kèm chọn ngay trong form (vd. Tệp nguồn PDF) → lưu vào mục Tệp của bản ghi
      for (const f of fields.filter(x => x.upload)) { const file = $(`[name="${f.k}"]`, form)?.files?.[0]; if (!file) continue; const fd = new FormData(); fd.append('kind', 'nguon'); fd.append('file', file, file.name); await api('POST', `/api/files/${ent}/${r.row.id}`, fd); }
      if (andSubmit) await api('POST', `/api/e/${ent}/${r.row.id}/submit`, {});
      m.close(); toast(andSubmit ? 'Đã lưu và trình duyệt' : 'Đã lưu' + (r.warnings?.length ? ' — lưu ý: ' + r.warnings.join('; ') : ''));
      onSaved ? onSaved(r.row) : refresh();
      return r.row;
    } catch (e) { showErr(e); } finally { btns.forEach(b => b.disabled = false); }
  };
  $('#fSave', m.el).onclick = () => save(false);
  $('#fSub', m.el) && ($('#fSub', m.el).onclick = () => save(true));
}

// ---------- bảng chọn căn áp dụng (chính sách giá): giá trị = '*' | mã tòa (cả tòa) | mã căn, cách nhau dấu phẩy ----------
async function unitPicker(el, root) {
  const projEl = $('[name="project_ids"]', root) || $('[name="project_id"]', root), hid = $('input[type=hidden]', el), box = $('.upick-bd', el);
  let units = [], sel = new Set(String(hid.value || '*').toUpperCase().split(/[,;\s]+/).filter(Boolean)), loadedFor = null, q = '';
  const KIND = Object.fromEntries(M.ents.unit.fields.find(f => f.k === 'kind').o);
  const blds = () => [...new Set(units.map(u => u.b))];
  const isOn = u => sel.has('*') || sel.has(u.b) || sel.has(u.code.toUpperCase());
  // tìm căn: mã căn, tòa, tầng, loại, trạng thái — chỉ ẩn/hiện dòng, không vẽ lại để ô tìm giữ con trỏ
  const hit = u => !q || `${u.code} tòa ${u.b} tầng ${u.floor ?? ''} ${KIND[u.kind] || u.kind || ''} ${USTAT[u.status] || u.status || ''}`.toLowerCase().includes(q);
  const applyQ = () => {
    $$('.upick-t tbody tr[data-row]', box).forEach(tr => { tr.hidden = !hit(units.find(u => u.id === +tr.dataset.row)); });
    $$('.upick-t tbody tr.pg', box).forEach(tr => { tr.hidden = !!q && !units.some(u => u.b === tr.dataset.g && hit(u)); });
    const n = units.filter(hit).length, f = $('[data-all="q"]', box), c = $('.upick-n', box);
    if (f) { f.hidden = !q; f.textContent = `Chọn ${n} căn tìm được`; } if (c) c.textContent = q ? `tìm được ${n} căn` : '';
  };
  // chuẩn hóa: chọn đủ cả dự án → '*', đủ cả tòa → mã tòa
  const norm = picked => {
    if (units.length && picked.length === units.length) return '*';
    const out = [];
    for (const b of blds()) { const all = units.filter(u => u.b === b), on = all.filter(u => picked.includes(u)); if (on.length === all.length) out.push(b); else out.push(...on.map(u => u.code.toUpperCase())); }
    return out.join(',');
  };
  const setVal = picked => { hid.value = norm(picked); sel = new Set(hid.value.split(',').filter(Boolean)); draw(); };
  const draw = () => {
    if (!projEl?.value) { box.innerHTML = '<div class="muted small">Chọn dự án trước — danh sách căn hộ của dự án hiện ở đây.</div>'; return; }
    if (!units.length) { box.innerHTML = '<div class="muted small">Dự án đã chọn chưa có căn hộ trong danh mục sản phẩm.</div>'; return; }
    const on = units.filter(isOn), tot = on.reduce((s, u) => s + (+u.total_price || 0), 0);
    box.innerHTML = `<div class="upick-sum"><b>Đã chọn ${on.length}/${units.length} căn</b> · tổng giá ${fm(tot)} đ <span class="grow"></span><div class="search upick-s"><i class="fa-solid fa-magnifying-glass"></i><input type="text" class="upick-q" placeholder="Tìm mã căn, tầng, loại, trạng thái…" value="${esc(q)}"></div><span class="small muted upick-n"></span><button type="button" class="btn sm" data-all="q" hidden></button><button type="button" class="btn sm" data-all="1">Chọn tất cả</button><button type="button" class="btn sm ghost" data-all="0">Bỏ chọn hết</button></div>
      <div class="tbl-wrap upick-t"><table class="t compact noclick"><thead><tr><th style="width:30px"></th><th>Mã căn</th><th>Tòa</th><th class="num">Tầng</th><th>Loại</th><th class="num">DT thông thủy</th><th class="num">Giá sau thuế</th><th class="num">Phí bảo trì</th><th class="num">Tổng giá căn hộ</th><th>Trạng thái</th></tr></thead><tbody>
      ${blds().map(b => { const all = units.filter(u => u.b === b), n = all.filter(isOn).length;
        return `<tr class="pg" data-g="${esc(b)}"><td><input type="checkbox" data-b="${esc(b)}" ${n === all.length ? 'checked' : ''}></td><td colspan="9"><b>Tòa ${esc(b)}</b> <span class="muted">— chọn ${n}/${all.length} căn</span></td></tr>` +
          all.map(u => `<tr data-row="${u.id}"><td><input type="checkbox" data-u="${u.id}" ${isOn(u) ? 'checked' : ''}></td><td>${esc(u.code)}</td><td>${esc(b)}</td><td class="num">${u.floor ?? ''}</td><td>${esc(KIND[u.kind] || u.kind || '')}</td><td class="num">${fnum(u.area_tt)}</td><td class="num">${fm(u.price_net)}</td><td class="num">${fm(u.maint_fee)}</td><td class="num">${fm(u.total_price)}</td><td>${esc(USTAT[u.status] || u.status || '')}</td></tr>`).join(''); }).join('')}
      </tbody></table></div>`;
    $$('.upick-t tbody tr', box).forEach(tr => { const c = $('input', tr); if (c?.dataset.u) tr.classList.toggle('sel', c.checked); });
    applyQ();
  };
  const load = async () => {
    const pid = projEl?.value || ''; if (pid === loadedFor) return draw(); loadedFor = pid; units = [];
    if (pid) { box.innerHTML = '<div class="muted small">Đang tải danh sách căn…</div>'; units = (await Promise.all(pid.split(',').map(p => api('GET', `/api/e/unit?project=${p}&limit=20000`)))).flatMap(r => r.rows).map(u => ({ ...u, b: String(u.building_id__l || '').split(' · ')[0].toUpperCase() })).sort((a, c) => a.code.localeCompare(c.code, 'vi', { numeric: true })); }
    draw();
  };
  box.addEventListener('input', e => { if (!e.target.matches('.upick-q')) return; e.stopPropagation(); q = e.target.value.trim().toLowerCase(); applyQ(); });
  box.addEventListener('keydown', e => { if (e.target.matches('.upick-q') && e.key === 'Enter') e.preventDefault(); });   // Enter không gửi form
  box.addEventListener('change', e => {
    if (e.target.matches('.upick-q')) { e.stopPropagation(); return; }
    const c = e.target; if (c.type !== 'checkbox') return; e.stopPropagation();
    let picked = units.filter(isOn);
    if (c.dataset.b) { const all = units.filter(u => u.b === c.dataset.b); picked = c.checked ? [...new Set([...picked, ...all])] : picked.filter(u => !all.includes(u)); }
    else { const u = units.find(x => x.id === +c.dataset.u); picked = c.checked ? [...picked, u] : picked.filter(x => x !== u); }
    setVal(picked);
  });
  box.addEventListener('click', e => { const a = e.target.closest('[data-all]'); if (a) setVal(a.dataset.all === '1' ? [...units] : a.dataset.all === 'q' ? [...new Set([...units.filter(isOn), ...units.filter(hit)])] : []); });   // «q» = thêm các căn tìm được
  // đổi dự án: giữ các tòa / căn đã chọn còn thuộc dự án đang chọn, không còn gì thì về tất cả
  projEl && projEl.addEventListener('change', async () => {
    if (loadedFor === null || projEl.value === loadedFor) return load();
    await load(); const keep = [...sel].filter(s => s !== '*' && units.some(u => u.b === s || u.code.toUpperCase() === s));
    hid.value = keep.length && !sel.has('*') ? keep.join(',') : '*'; sel = new Set(hid.value.split(',')); draw();
  });
  await load();
}

// ---------- thao tác nghiệp vụ ----------
async function doAct(ent, id, k, after) {
  const E = M.ents[ent], a = E.acts.find(x => x.k === k);
  if (k === 'schedule') return scheduleModal(id, after);
  if (k === 'print') { window.open(`/print/contract/${id}`, '_blank'); return; }
  const go = async data => { const r = await api('POST', `/api/e/${ent}/${id}/act/${k}`, data); toast(r.msg || `Đã ${a.l.toLowerCase()}`); if (r.url) window.open(r.url, '_blank'); after && after(); if (r.open) openDetail(r.open[0], r.open[1]); return r; };
  if (!a.ask?.length) { if (a.danger && !await ask(a.l, 'Xác nhận thực hiện?', { danger: 1, okLabel: a.l })) return; return run(go)({}); }
  const rec = {}; for (const f of a.ask) if (f.def !== undefined) rec[f.k] = f.def === 'today' ? today() : f.def;
  const m = modal({ title: `${ico(a.icon)} ${esc(a.l)}`, narrow: a.ask.length < 3, body: `${a.help ? `<div class="warnbar">${ico('fa-circle-info')}<span>${esc(a.help)}</span></div>` : ''}<div id="aerr"></div><form class="form">${a.ask.map(f => `<div class="fld ${f.t === 'long' || a.ask.length < 2 ? 'wide' : ''}" data-f="${f.k}"><label>${esc(f.l)}${f.req ? '<span class="req">*</span>' : ''}</label>${input(f, rec[f.k], rec)}</div>`).join('')}</form>`,
    foot: `<button class="btn" data-x>Hủy</button><button class="btn ${a.danger ? 'danger' : 'pri'}" id="aOk">${esc(a.l)}</button>` });
  const form = $('form', m.el); wireInputs(form);
  $('#aOk', m.el).onclick = async () => { const data = {}; for (const f of a.ask) data[f.k] = readField(form, f); try { await go(data); m.close(); } catch (e) { $('#aerr', m.el).innerHTML = `<div class="errbar">${esc(e.message)}</div>`; } };
}
async function scheduleModal(contractId, after) {
  const g = await api('GET', `/api/e/contract/${contractId}`); const c = g.row;
  const rows = (c._debt?.inst || []).map(i => ({ name: i.name, due_on: i.due_on, pct: i.pct, amount: i.amount }));
  const m = modal({ title: `${ico('fa-calendar-days')} Lịch thanh toán — ${esc(c.number)}`, wide: true, body: `<div id="serr"></div><div class="small muted mb">Giá trị hợp đồng <b>${fm(c.value)}</b> đ · căn ${esc(c.unit_id__l)} · ${esc(c.customer_id__l)}</div><div id="sch"></div>`,
    foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="sOk">${ico('fa-floppy-disk')} Lưu lịch thanh toán</button>` });
  const el = $('#sch', m.el); schedEditor(el, rows, { total: c.value, base: c.plan_sign || today() });
  $('#sOk', m.el).onclick = async () => { try { const r = await api('POST', `/api/e/contract/${contractId}/act/schedule`, { rows: el._get() }); m.close(); toast(r.msg); after && after(); } catch (e) { $('#serr', m.el).innerHTML = `<div class="errbar">${esc(e.message)}</div>`; } };
}

// in bản đăng ký từ phiếu GD-01: chọn mẫu in (Quản trị › Mẫu biểu, loại «Bản đăng ký căn hộ / nội thất»)
async function printPick(id, kind) {
  const L = { dang_ky_can: 'bản đăng ký căn hộ', dang_ky_noi_that: 'bản đăng ký nội thất' }[kind];
  const ts = await api('GET', `/api/templates?kind=${kind}`);
  if (!ts.length) return toast(`Chưa có mẫu ${L} — tạo ở Quản trị › Mẫu biểu`, true);
  const m = modal({ title: `${ico('fa-print')} In ${L}`, narrow: true, body: `<div class="small muted mb">Chọn mẫu in</div>${ts.map((t, i) => `<label class="chk" style="display:flex;padding:6px 0"><input type="radio" name="tpl" value="${esc(t.code)}" ${i ? '' : 'checked'}> <b>${esc(t.name)}</b>&nbsp;<span class="muted small">${esc(t.code)}</span></label>`).join('')}`,
    foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="pOk">${ico('fa-print')} In</button>` });
  $('#pOk', m.el).onclick = () => { const c = $('input[name=tpl]:checked', m.el).value; m.close(); window.open(`/print/reservation/${id}?kind=${kind}&tpl=${encodeURIComponent(c)}`, '_blank'); };
}

// ---------- ngăn chi tiết ----------
let DR = null;
function closeDetail() { DR?.ov.remove(); DR?.el.remove(); DR = null; }
async function openDetail(ent, id, tab) {
  const E = M.ents[ent]; if (!E) return;
  let g; try { g = await api('GET', `/api/e/${ent}/${id}`); } catch (e) { return toast(e.message, true); }
  closeDetail();
  const ov = document.createElement('div'); ov.className = 'drawer-ov'; ov.onclick = closeDetail;
  const el = document.createElement('aside'); el.className = 'drawer'; el.setAttribute('role', 'dialog');
  document.body.append(ov, el);
  DR = { ov, el, ent, id };
  const reload = async (t) => { const keepTab = t || $('.tabs button.on', el)?.dataset.tab; await openDetail(ent, id, keepTab); refresh(true); };
  const r = g.row, p = g.perm, st = E.fields.find(f => f.k === 'status');
  const title = r.code || r.number || r.voucher_no || r.title || r.full_name || r[E.fields[0].k + '__l'] || `${E.one} #${r.id}`;
  const unitId = ent === 'unit' ? r.id : r.unit_id;
  const acts = (E.acts || []).filter(a => p.acts.includes(a.k));
  const tabs = [['info', 'Thông tin'], ...(ent === 'contract' ? [['debt', 'Lịch thanh toán & công nợ']] : []), ...(ent === 'notice' && r.recipient_list ? [['rcp', `Danh sách nhận (${r.recipients})`]] : []), ...(ent === 'report' && r.data ? [['rep', 'Số liệu báo cáo']] : []), ...(ent === 'price_policy' ? [['sheet', 'Chi tiết bảng giá']] : []),
    ['files', `Tệp (${g.files.length})`], ['notes', `Trao đổi (${g.notes.length})`], ...(E.flow ? [['appr', `Phê duyệt (${g.approvals.length})`]] : []), ['hist', 'Lịch sử']];
  el.innerHTML = `<div class="dh"><div class="t1">${E.code ? `<span class="tag">${E.code}</span>` : ''}<h2>${esc(title)}</h2>${st ? show(st, r) : ''}${r.is_demo ? '<span class="tag demo">dữ liệu thử</span>' : ''}<button class="btn ghost sm" style="margin-left:auto" id="dClose" aria-label="Đóng">${ico('fa-xmark')}</button></div>
    <div class="sub">${esc(E.title)} · lập ${dmyhm(r.created_at)}${r.created_by__l ? ' bởi ' + esc(r.created_by__l) : ''}${r.updated_at ? ` · sửa ${dmyhm(r.updated_at)}` : ''}</div>
    <div class="dacts">
      ${p.edit ? `<button class="btn sm" data-do="edit">${ico('fa-pen')} Sửa</button>` : ''}
      ${p.submit ? `<button class="btn amb sm" data-do="submit">${ico('fa-paper-plane')} ${esc(E.flow.submitLabel || 'Trình duyệt')}</button>` : ''}
      ${p.approve ? `<button class="btn ok sm" data-do="ok">${ico('fa-check')} Duyệt</button><button class="btn danger sm" data-do="no">${ico('fa-xmark')} Từ chối</button>` : ''}
      ${p.selfApproval ? `<span class="small muted">${ico('fa-user-lock')} Đang chờ cấp khác duyệt</span>` : ''}
      ${acts.map(a => `<button class="btn sm ${a.danger ? 'danger' : ''}" data-act="${a.k}">${ico(a.icon)} ${esc(a.l)}</button>`).join('')}
      ${unitId ? `<button class="btn sm ghost" data-do="u360">${ico('fa-building')} Hồ sơ căn 360°</button>` : ''}
      ${ent === 'customer' ? `<button class="btn sm ghost" data-do="c360">${ico('fa-id-card')} Hồ sơ khách 360°</button>` : ''}
      ${ent === 'reservation' ? `<button class="btn sm ghost" data-do="pr_can">${ico('fa-print')} In bản đăng ký căn hộ</button><button class="btn sm ghost" data-do="pr_nt">${ico('fa-couch')} In bản đăng ký nội thất</button>` : ''}
      ${ent === 'customer' ? `<button class="btn sm ghost" data-do="log">${ico('fa-comment-medical')} Ghi tư vấn</button>` : ''}
      ${ent === 'contract' && r.status === 'da_ky' ? `<button class="btn sm ghost" data-do="call">${ico('fa-phone')} Ghi nhắc nợ</button><button class="btn sm ghost" data-do="chg">${ico('fa-file-pen')} Đề nghị điều chỉnh</button>` : ''}
      ${p.del ? `<button class="btn sm ghost danger" data-do="del">${ico('fa-trash')} Xóa</button>` : ''}
    </div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</div></div><div class="db" id="dBody"></div>`;
  const body = $('#dBody', el);
  const T = {
    info: () => {
      const fs = E.fields.filter(f => f.t !== 'json' || f.k === 'reviews' || f.k === 'new_schedule');
      let h = p.locked ? `<div class="lockbar">${ico('fa-lock')} ${E.one[0].toUpperCase() + E.one.slice(1)} đã chốt / đang trình duyệt — không sửa trực tiếp${ent === 'contract' ? '. Thay đổi qua «Điều chỉnh – phụ lục hợp đồng».' : '.'}</div>` : '';
      if (E.note) h += `<div class="warnbar">${ico('fa-circle-info')}<span>${esc(E.note)}</span></div>`;
      h += `<dl class="kv">${fs.filter(f => f.t !== 'check' && f.t !== 'json' && isShown(f, r)).map(f => `<div class="${f.t === 'long' ? 'wide' : ''}"><dt>${esc(f.l)}</dt><dd>${show(f, r)}${f.pii && r._masked && M.piiRoles.includes(M.me.role) ? ` <button class="btn ghost sm" data-do="pii">${ico('fa-eye')} Hiện</button>` : ''}</dd></div>`).join('')}</dl>`;
      for (const f of fs.filter(f => f.t === 'check')) h += `<div class="sec-title">${esc(f.l)}</div><table class="t compact noclick"><thead><tr><th>Giấy tờ</th><th>Tình trạng</th><th>Ghi chú</th></tr></thead><tbody>${(r[f.k] || []).map(x => `<tr><td>${esc(x.n)}</td><td>${x.st ? pill(CK.find(o => o[0] === x.st)[1], x.st === 'da_nhan' ? 'g' : 'r') : '<span class="muted">chưa</span>'}</td><td>${esc(x.note)}</td></tr>`).join('')}</tbody></table>`;
      if (r.reviews?.length) h += `<div class="sec-title">Các bước xét duyệt nội bộ</div><div class="tl">${r.reviews.map(x => `<div><b>${esc({ kiem_tra_1: 'Kiểm tra lần 1', kiem_tra_cheo: 'Kiểm tra chéo', doi_chieu_goc: 'Đối chiếu bản gốc' }[x.step] || x.step)}</b> — ${x.conclusion === 'dat' ? pill('Đạt', 'g') : pill('Cần bổ sung', 'a')}<br><small>${esc(x.by)} · ${dmyhm(x.at)}${x.note ? ' · ' + esc(x.note) : ''}</small></div>`).join('')}</div>`;
      if (r.new_schedule?.length) h += `<div class="sec-title">Tiến độ thanh toán mới</div>${schedTable(r.new_schedule)}`;
      if (ent === 'contract') h += `<div class="sec-title">Công nợ</div>${debtTiles(r._debt)}`;
      body.innerHTML = h;
    },
    debt: () => { const d = r._debt; body.innerHTML = `${debtTiles(d)}<div class="sec-title">Lịch thanh toán hiệu lực</div>${d.inst.length ? schedTable(d.inst, true) : '<div class="empty">Chưa lập lịch thanh toán</div>'}<div class="sec-title">Chứng từ thu (Bravo)</div><div id="rcpt">Đang tải…</div>`;
      api('GET', `/api/e/receipt?f_contract_id=${r.id}`).then(x => { $('#rcpt', body).innerHTML = x.rows.length ? `<table class="t compact noclick"><thead><tr><th>Ngày</th><th>Chứng từ</th><th>Nội dung</th><th class="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>${x.rows.map(z => `<tr><td>${dmy(z.voucher_date)}</td><td>${esc(z.voucher_no)}</td><td>${esc(z.content)}</td><td class="num">${fm(z.amount)}</td><td>${show(M.ents.receipt.fields.find(f => f.k === 'status'), z)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Chưa có chứng từ thu</div>'; }).catch(() => { $('#rcpt', body).innerHTML = '<span class="muted">Không có quyền xem chứng từ</span>'; }); },
    rcp: () => { body.innerHTML = `<table class="t compact noclick"><thead><tr><th>#</th><th>Khách hàng</th><th>Điện thoại</th><th>Căn</th><th>Nội dung gửi</th></tr></thead><tbody>${r.recipient_list.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc(x.phone)}</td><td>${esc(x.unit)}</td><td>${esc(x.text)}</td></tr>`).join('')}</tbody></table>`; },
    rep: () => { body.innerHTML = reportSnapshot(r.data); },
    sheet: async () => { body.innerHTML = 'Đang tải…'; await priceSheetInto(body, id, { full: false }); },
    files: () => {
      const kinds = E.files || [['tai_lieu', 'Tài liệu']];
      body.innerHTML = `${p.files ? `<div class="row mb"><select class="inp" id="fKind">${kinds.map(k => `<option value="${k[0]}">${esc(k[1])}${k[2] ? ' (bắt buộc khi trình)' : ''}</option>`).join('')}</select><button class="btn pri" id="fUp">${ico('fa-upload')} Tải tệp lên</button><span class="small muted">Tải trùng tên = phiên bản mới, bản cũ vẫn lưu.</span></div>` : ''}
        <div class="files">${g.files.length ? g.files.map(f => `<a class="f" href="/api/file/${f.id}" target="_blank" rel="noopener">${ico(/\.pdf$/i.test(f.name) ? 'fa-file-pdf' : /\.(png|jpe?g|webp)$/i.test(f.name) ? 'fa-file-image' : 'fa-file')}<div class="grow"><b>${esc(f.name)}</b>${f.version > 1 ? ` <span class="tag">v${f.version}</span>` : ''}<br><small class="muted">${esc(kinds.find(k => k[0] === f.kind)?.[1] || f.kind || '')} · ${esc(f.by || '')} · ${dmyhm(f.uploaded_at)} · ${(f.size / 1024).toFixed(0)} KB</small></div>${!p.locked ? `<button class="btn ghost sm" data-delf="${f.id}" title="Xóa tệp">${ico('fa-trash')}</button>` : ''}</a>`).join('') : '<div class="empty">' + ico('fa-folder-open') + 'Chưa có tệp</div>'}</div>`;
      $('#fUp', body) && ($('#fUp', body).onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.onchange = run(async () => { const fd = new FormData(); fd.append('kind', $('#fKind', body).value); [...i.files].forEach(f => fd.append('file', f, f.name)); await api('POST', `/api/files/${ent}/${id}`, fd); toast('Đã tải tệp'); reload('files'); }); i.click(); });
      $$('[data-delf]', body).forEach(b => b.onclick = run(async e => { e.preventDefault(); if (!await ask('Xóa tệp', 'Xóa tệp này? (Lịch sử vẫn ghi lại)', { danger: 1, okLabel: 'Xóa' })) return; await api('DELETE', `/api/file/${b.dataset.delf}`); reload('files'); }));
    },
    notes: () => {
      body.innerHTML = `${g.notes.map(n => `<div class="note"><small>${esc(n.by)} · ${dmyhm(n.at)}</small><div>${esc(n.body).replace(/\n/g, '<br>')}</div></div>`).join('') || '<div class="muted mb">Chưa có trao đổi.</div>'}<div class="fld mt"><textarea id="nBody" placeholder="Ghi tiến trình xử lý, trao đổi nội bộ…"></textarea></div><button class="btn pri mt" id="nAdd">${ico('fa-comment')} Gửi</button>`;
      $('#nAdd', body).onclick = run(async () => { await api('POST', `/api/e/${ent}/${id}/note`, { body: $('#nBody', body).value }); reload('notes'); });
    },
    appr: () => { body.innerHTML = g.approvals.length ? `<div class="tl">${g.approvals.map(a => `<div><b>${esc(a.title)}</b> ${pill({ cho_duyet: 'Chờ duyệt', da_duyet: 'Đã duyệt', tu_choi: 'Từ chối', huy: 'Đã hủy' }[a.status], { cho_duyet: 'a', da_duyet: 'g', tu_choi: 'r' }[a.status])}<br><small>Trình: ${esc(a.requested_by_l)} · ${dmyhm(a.requested_at)} · cấp duyệt: ${esc(a.approver_l || a.roles.map(roleName).join(' / '))}</small>${a.decided_at ? `<br><small>Quyết định: ${esc(a.decided_by_l)} · ${dmyhm(a.decided_at)}</small>` : ''}${a.comment ? `<div class="diff">${esc(a.comment)}</div>` : ''}</div>`).join('')}</div>` : '<div class="empty">Chưa trình duyệt</div>'; },
    hist: async () => { body.innerHTML = 'Đang tải…'; const h = await api('GET', `/api/e/${ent}/${id}/history`); body.innerHTML = histHtml(h, ent); },
  };
  const go = k => { $$('.tabs button', el).forEach(b => b.classList.toggle('on', b.dataset.tab === k)); run(T[k])(); };
  $$('.tabs button', el).forEach(b => b.onclick = () => go(b.dataset.tab));
  go(tabs.some(t => t[0] === tab) ? tab : 'info');
  $('#dClose', el).onclick = closeDetail;
  el.addEventListener('click', run(async e => {
    const b = e.target.closest('[data-do],[data-act]'); if (!b) return;
    if (b.dataset.act) return doAct(ent, id, b.dataset.act, () => reload());
    const d = b.dataset.do;
    if (d === 'edit') return openForm(ent, { id, onSaved: () => reload() });
    if (d === 'submit') { const c = await ask(E.flow.submitLabel || 'Trình duyệt', `Trình ${E.one} này lên cấp phê duyệt?`, { reason: 1, reasonLabel: 'Ghi chú cho người duyệt' }); if (!c) return; await api('POST', `/api/e/${ent}/${id}/submit`, { comment: c === true ? null : c }); toast('Đã trình duyệt'); return reload(); }
    if (d === 'ok' || d === 'no') { const c = await ask(d === 'ok' ? 'Phê duyệt' : 'Từ chối', d === 'ok' ? 'Phê duyệt đề nghị này?' : 'Từ chối và trả lại người trình?', { reason: 1, reasonReq: d === 'no', reasonLabel: d === 'ok' ? 'Ý kiến (không bắt buộc)' : 'Lý do từ chối', danger: d === 'no', okLabel: d === 'ok' ? 'Duyệt' : 'Từ chối' }); if (!c) return; await api('POST', `/api/e/${ent}/${id}/approve`, { ok: d === 'ok', comment: c === true ? null : c }); toast(d === 'ok' ? 'Đã duyệt' : 'Đã từ chối'); updateBadges(); return reload(); }
    if (d === 'del') { if (!await ask('Xóa', `Xóa ${E.one} này? Thao tác được ghi nhật ký.`, { danger: 1, okLabel: 'Xóa' })) return; await api('DELETE', `/api/e/${ent}/${id}`); toast('Đã xóa'); closeDetail(); return refresh(); }
    if (d === 'u360') { closeDetail(); location.hash = `#/v/unit360?id=${unitId}`; return; }
    if (d === 'c360') { closeDetail(); location.hash = `#/v/cust360?id=${id}`; return; }
    if (d === 'pr_can' || d === 'pr_nt') return printPick(id, d === 'pr_can' ? 'dang_ky_can' : 'dang_ky_noi_that');
    if (d === 'log') return openForm('contact_log', { preset: { customer_id: r.id, customer_id__l: `${r.code} · ${r.full_name}` }, onSaved: () => toast('Đã ghi nhật ký') });
    if (d === 'call') return openForm('debt_call', { preset: { contract_id: r.id, contract_id__l: r.number }, onSaved: () => reload() });
    if (d === 'chg') return openForm('contract_change', { preset: { contract_id: r.id, contract_id__l: r.number }, onSaved: row => openDetail('contract_change', row.id) });
    if (d === 'pii') { const x = await api('GET', `/api/pii/customer/${id}`); for (const [k, v] of Object.entries(x)) { const dd = $$('.kv dt', body).find(t => t.textContent === E.fields.find(f => f.k === k).l)?.nextElementSibling; if (dd) dd.textContent = E.fields.find(f => f.k === k).t === 'date' ? dmy(v) : v ?? ''; } toast('Đã ghi nhật ký xem dữ liệu định danh'); }
  }));
}
function debtTiles(d) {
  if (!d) return '';
  return `<div class="grid g4">${[['Phải thu theo lịch', d.total], ['Đã thu (Bravo)', d.paid, `${fnum(d.paid_pct)}%`], ['Còn phải thu', d.left], ['Quá hạn', d.overdue, d.overdue_days ? `${d.overdue_days} ngày` : '', d.overdue > 0]].map(([l, v, s, red]) => `<div class="card kpi ${red ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:18px">${fm(v)}</div><div class="s">${s || '&nbsp;'}</div></div>`).join('')}</div>
    ${d.next ? `<div class="small muted mt">${ico('fa-clock')} Kỳ tới: ${esc(d.next.name)} — ${fm(d.next.rem)}đ, hạn ${dmy(d.next.due_on)}</div>` : ''}`;
}
const PAYST = { da_thu: ['Đã thu đủ', 'g'], qua_han: ['Quá hạn', 'r'], den_han: ['Đến hạn hôm nay', 'a'], sap_den_han: ['Sắp đến hạn', 'a'], mot_phan: ['Thu một phần', 'b'], chua_den_han: ['Chưa đến hạn', 's'] };
function schedTable(rows, withPaid) {
  return `<table class="t compact noclick"><thead><tr><th>Đợt</th><th>Nội dung</th><th>Hạn</th><th class="num">Tỷ lệ</th><th class="num">Số tiền</th>${withPaid ? '<th class="num">Đã thu</th><th>Tình trạng</th>' : ''}</tr></thead><tbody>${rows.map((i, k) => `<tr><td>${i.seq || k + 1}</td><td>${esc(i.name)}${i.src === 'phu_luc' ? ' <span class="tag">phụ lục</span>' : ''}</td><td>${dmy(i.due_on)}</td><td class="num">${i.pct != null ? fnum(i.pct) + '%' : ''}</td><td class="num">${fm(i.amount)}</td>${withPaid ? `<td class="num">${fm(i.paid)}</td><td>${pill(...(PAYST[i.st] || ['', 's']))}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}
const ACT_L = { tao: 'Tạo mới', sua: 'Sửa', xoa: 'Xóa', trinh_duyet: 'Trình duyệt', phe_duyet: 'Phê duyệt', tu_choi: 'Từ chối', tai_tep: 'Tải tệp', xoa_tep: 'Xóa tệp', cap_nhat_trang_thai: 'Hệ thống cập nhật trạng thái', cap_nhat_dieu_kien: 'Hệ thống cập nhật điều kiện', lich_thanh_toan: 'Lập lịch thanh toán', xem_dinh_danh: 'Xem dữ liệu định danh', in_hop_dong: 'In hợp đồng', qua_han_giu_cho: 'Hệ thống: quá hạn giữ chỗ', kich_hoat: 'Kích hoạt mở bán', phu_luc: 'Cập nhật theo phụ lục', nhap_lich_su: 'Nhập dữ liệu lịch sử', nhap_excel: 'Cập nhật từ tệp Excel', thay_the: 'Bị thay thế', huy: 'Hủy', doi_can: 'Đổi căn', doi_kh: 'Đổi khách hàng', hoan_tac: 'Hoàn tác', xuat_du_lieu: 'Xuất dữ liệu', dang_nhap: 'Đăng nhập', dang_nhap_sai: 'Đăng nhập sai', doi_mat_khau: 'Đổi mật khẩu' };
function actLabel(a, ent) { if (a.startsWith('tt:')) { const k = a.slice(3); return M.ents[ent]?.acts?.find(x => x.k === k)?.l || k; } return ACT_L[a] || a; }
function fmtVal(ent, k, v) {
  const f = M.ents[ent]?.fields.find(x => x.k === k); if (v == null || v === '') return '∅';
  if (f) { const s = show(f, { [k]: v }, { plain: true }); return typeof s === 'string' ? s.slice(0, 120) : s; }
  return typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 120);
}
function histHtml(h, ent) {
  if (!h.length) return '<div class="empty">Chưa có lịch sử</div>';
  return `<div class="tl">${h.map(a => {
    const keys = Object.keys(a.after || a.before || {});
    const diff = keys.length && a.action !== 'tao' ? `<div class="diff">${keys.map(k => `<div><b>${esc(colLabel(ent, k) || k)}</b>: <s>${esc(fmtVal(ent, k, a.before?.[k]))}</s> → <ins>${esc(fmtVal(ent, k, a.after?.[k]))}</ins></div>`).join('')}</div>` : '';
    return `<div><b>${esc(actLabel(a.action, ent))}</b> <small>· ${esc(a.who || 'Hệ thống')} · ${dmyhm(a.at)}</small>${a.note ? `<div class="small">${esc(a.note)}</div>` : ''}${diff}</div>`;
  }).join('')}</div>`;
}

// ---------- danh sách thực thể ----------
function eyebrow(E) { const mod = M.menu.find(m => m[0] === E.mod); return `<div class="eyebrow">Phân hệ ${E.mod}${mod ? ' · ' + esc(mod[1]) : ''}${E.code ? ` <span class="code">${E.code}</span>` : ''}</div>`; }
function infoBox(E) { const it = [['Người sử dụng', E.users], ['Mục đích', E.purpose], ['Thao tác', E.how], ['Hệ thống tự kiểm tra', E.rules]].filter(x => x[1]); return it.length ? `<div class="info-pop hidden" id="infoBox">${it.map(([k, v]) => `<div><b>${k}</b>${esc(v)}</div>`).join('')}</div>` : ''; }
async function listView(main, ent, params = {}) {
  const E = M.ents[ent];
  const S = ST.list[ent] ||= { q: '', status: '', project: '', mine: '', sort: '', sel: new Set(), limit: 300 };
  Object.assign(S, params); S.group = params.group || '';
  const st = E.fields.find(f => f.k === 'status');
  const projFilter = ['unit', 'building', 'price_policy', 'reservation', 'contract', 'collect_plan', 'handover', 'defect', 'pinkbook', 'debt_call', 'receipt', 'installment', 'noxh_check', 'ticket', 'contract_change', 'commission', 'target', 'agent_alloc', 'refund'].includes(ent);
  const extra = { collect_plan: `<button class="btn" data-x="suggest">${ico('fa-wand-magic-sparkles')} Gợi ý từ công nợ & cam kết</button>`, commission: `<button class="btn" data-x="calc">${ico('fa-calculator')} Tính / cập nhật hoa hồng</button>`,
    receipt: M.imports.receipts ? `<button class="btn amb" data-x="imp" data-k="receipts">${ico('fa-file-import')} Nhập chứng từ Bravo</button>` : '', unit: M.imports.units ? `<button class="btn" data-x="imp" data-k="units">${ico('fa-file-import')} Nhập bảng hàng</button>` : '',
    customer: M.imports.customers ? `<button class="btn" data-x="imp" data-k="customers">${ico('fa-file-import')} Nhập Excel</button>` : '',
    contact_log: `${M.imports.leads ? `<button class="btn" data-x="imp" data-k="leads">${ico('fa-file-import')} Nhập Excel khách</button>` : ''}${E.perm.c ? `<button class="btn amb" data-x="lead">${ico('fa-user-plus')} Thêm khách trực tiếp / Hotline</button>` : ''}`, contract: M.imports.contracts ? `<button class="btn" data-x="imp" data-k="contracts">${ico('fa-file-import')} Nhập HĐ cũ</button>` : '' }[ent] || '';
  main.innerHTML = `<div class="page"><div class="ph"><div>${eyebrow(E)}<h1>${ico(E.icon)} ${esc(S.group === 'tiem_nang' ? E.title + ' tiềm năng' : E.title)}</h1></div><div class="acts">${E.purpose ? `<button class="btn ghost" id="infoBtn">${ico('fa-circle-info')} Quy trình</button>` : ''}${extra}${E.perm.x ? `<button class="btn" id="xls">${ico('fa-file-excel')} Xuất Excel</button>` : ''}<button class="btn" onclick="print()">${ico('fa-print')} In / PDF</button>${E.perm.c && ent !== 'reservation' ? `<button class="btn pri" id="newBtn">${ico('fa-plus')} Tạo ${esc(E.one)}</button>` : ''}</div></div>${infoBox(E)}
    <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="q" placeholder="Tìm mã, tên, mã căn, khách hàng…" value="${esc(S.q)}"></div>
      ${projFilter ? `<select id="pj"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+S.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>` : ''}
      ${E.fields.some(f => ['owner_id', 'assignee_id'].includes(f.k)) ? `<label class="chk"><input type="checkbox" id="mine" ${S.mine ? 'checked' : ''}> Của tôi</label>` : ''}
      <span class="grow"></span><span class="small muted" id="cnt"></span></div>
      ${st ? `<div class="tabs" id="stTabs"></div>` : ''}<div id="bulk"></div><div class="tbl-wrap" id="tb"><div class="empty">Đang tải…</div></div><div class="more" id="more"></div></div></div>`;
  const load = async () => {
    const p = new URLSearchParams(); if (S.q) p.set('q', S.q); if (S.status) p.set('status', S.status); if (S.project) p.set('project', S.project); if (S.mine) p.set('mine', '1'); if (S.sort) p.set('sort', S.sort); p.set('limit', S.limit); if (S.group) p.set('group', S.group);
    for (const [k, v] of Object.entries(S)) if (k.startsWith('f_') && v) p.set(k, v);
    const d = await api('GET', `/api/e/${ent}?${p}`);
    $('#cnt', main).textContent = `${d.rows.length < d.total ? `${d.rows.length} / ` : ''}${d.total} ${E.one}`;
    if (st) { const all = Object.values(d.counts || {}).reduce((a, b) => a + b, 0); $('#stTabs', main).innerHTML = `<button data-s="" class="${!S.status ? 'on' : ''}">Tất cả<span class="c">${all}</span></button>` + st.o.filter(o => d.counts?.[o[0]] || S.status === o[0]).map(o => `<button data-s="${o[0]}" class="${S.status === o[0] ? 'on' : ''}">${esc(o[1])}<span class="c">${d.counts?.[o[0]] || 0}</span></button>`).join(''); }
    const cols = E.list;
    const bulk = E.bulk || (E.flow && E.perm.a);
    $('#tb', main).innerHTML = d.rows.length ? `<table class="t"><thead><tr>${bulk ? '<th style="width:30px"><input type="checkbox" id="selAll"></th>' : ''}${cols.map(k => { const f = E.fields.find(x => x.k === k); const s = S.sort.replace('-', '') === k ? (S.sort[0] === '-' ? ' ↓' : ' ↑') : ''; return `<th class="${f ? 'sort' : ''} ${f && ['money', 'num', 'int'].includes(f.t) || VIRT_MONEY.has(k) ? 'num' : ''}" data-k="${f ? k : ''}">${esc(colLabel(ent, k))}${s}</th>`; }).join('')}</tr></thead>
      <tbody>${d.rows.map((r, i) => `<tr data-id="${r.id}" class="${S.sel.has(r.id) ? 'sel' : ''}">${bulk ? `<td><input type="checkbox" data-sel="${r.id}" ${S.sel.has(r.id) ? 'checked' : ''}></td>` : ''}${cols.map(k => { const c = cell(ent, k, r); const lf = E.fields.find(x => x.k === k); return `<td class="${c.num ? 'num' : ''} ${lf?.t === 'long' ? 'wrap' : ''}">${k === 'id' ? '#' + r.id : k === 'stt' ? i + 1 : c.html}${k === cols[0] && r.is_demo ? ' <span class="tag demo" title="Dữ liệu thử">thử</span>' : ''}</td>`; }).join('')}</tr>`).join('')}</tbody>
      ${cols.some(k => E.fields.find(f => f.k === k)?.t === 'money' || VIRT_MONEY.has(k)) ? `<tfoot><tr>${bulk ? '<td></td>' : ''}${cols.map((k, i) => { const f = E.fields.find(x => x.k === k); return (f?.t === 'money' || VIRT_MONEY.has(k)) ? `<td class="num">${fm(d.rows.reduce((s, r) => s + (+r[k] || 0), 0))}</td>` : `<td>${i === 0 ? 'Tổng' : ''}</td>`; }).join('')}</tr></tfoot>` : ''}</table>`
      : `<div class="empty">${ico(E.icon)}Chưa có ${esc(E.one)} nào${S.q || S.status ? ' khớp bộ lọc' : ''}.${E.perm.c && ent !== 'reservation' ? ' Bấm «Tạo ' + esc(E.one) + '» để bắt đầu.' : ''}</div>`;
    $('#more', main).innerHTML = d.rows.length < d.total ? `<button class="btn" id="moreBtn">Tải thêm (${d.total - d.rows.length} còn lại)</button>` : '';
    $('#moreBtn', main) && ($('#moreBtn', main).onclick = () => { S.limit += 500; load(); });
    drawBulk();
  };
  const drawBulk = () => {
    const n = S.sel.size, b = $('#bulk', main);
    b.innerHTML = n ? `<div class="bulk"><b>Đã chọn ${n}</b>${E.flow ? `<button class="btn sm amb" data-b="submit">${ico('fa-paper-plane')} Trình duyệt</button>` : ''}${E.flow && E.perm.a ? `<button class="btn sm ok" data-b="ok">${ico('fa-check')} Duyệt</button><button class="btn sm danger" data-b="no">${ico('fa-xmark')} Từ chối</button>` : ''}<button class="btn sm ghost" data-b="clr">Bỏ chọn</button></div>` : '';
  };
  ST.reload = load;
  main.onclick = run(async e => {
    const t = e.target;
    if (t.id === 'newBtn' || t.closest('#newBtn')) return openForm(ent, { preset: S.project && E.fields.some(f => f.k === 'project_id') ? { project_id: +S.project } : {} });
    if (t.closest('#infoBtn')) return $('#infoBox', main)?.classList.toggle('hidden');
    if (t.closest('#xls')) { const p = new URLSearchParams(); if (S.q) p.set('q', S.q); if (S.status) p.set('status', S.status); if (S.project) p.set('project', S.project); if (S.mine) p.set('mine', '1'); return download(`/api/export/${ent}?${p}`); }
    const xb = t.closest('[data-x]');
    if (xb?.dataset.x === 'suggest') return suggestModal();
    if (xb?.dataset.x === 'calc') { const r = await api('POST', '/api/commission/calc', {}); toast(`Đã rà soát ${r.checked} hợp đồng có đại lý / CTV`); return load(); }
    if (xb?.dataset.x === 'imp') return importModal(xb.dataset.k, load);
    if (xb?.dataset.x === 'lead') return leadModal(load);
    const tab = t.closest('[data-s]'); if (tab) { S.status = tab.dataset.s; S.sel.clear(); return load(); }
    const th = t.closest('th[data-k]'); if (th?.dataset.k) { const k = th.dataset.k; S.sort = S.sort === k ? '-' + k : k; return load(); }
    if (t.id === 'selAll') { $$('[data-sel]', main).forEach(c => { c.checked = t.checked; t.checked ? S.sel.add(+c.dataset.sel) : S.sel.delete(+c.dataset.sel); c.closest('tr').classList.toggle('sel', t.checked); }); return drawBulk(); }
    if (t.dataset.sel) { const id = +t.dataset.sel; t.checked ? S.sel.add(id) : S.sel.delete(id); t.closest('tr').classList.toggle('sel', t.checked); return drawBulk(); }
    const bb = t.closest('[data-b]');
    if (bb) {
      if (bb.dataset.b === 'clr') { S.sel.clear(); return load(); }
      let comment = null;
      if (bb.dataset.b === 'no') { comment = await ask('Từ chối', `Từ chối ${S.sel.size} bản ghi?`, { reason: 1, reasonReq: 1, danger: 1, okLabel: 'Từ chối' }); if (!comment) return; }
      else if (!await ask(bb.dataset.b === 'ok' ? 'Duyệt hàng loạt' : 'Trình duyệt hàng loạt', `Thực hiện cho ${S.sel.size} bản ghi đã chọn?`)) return;
      const r = await api('POST', `/api/bulk/${ent}/${bb.dataset.b === 'submit' ? 'submit' : 'approve'}`, { ids: [...S.sel], ok: bb.dataset.b === 'ok', comment: comment === true ? null : comment });
      toast(`Thành công ${r.ok}${r.errors.length ? ` · lỗi ${r.errors.length}: ${r.errors.slice(0, 2).map(x => '#' + x.id + ' ' + x.msg).join('; ')}` : ''}`, !!r.errors.length);
      S.sel.clear(); updateBadges(); return load();
    }
    const pb = t.closest('[data-print]'); if (pb) return printPick(+pb.closest('tr[data-id]').dataset.id, pb.dataset.print);
    const tr = t.closest('tbody tr[data-id]'); if (tr && !t.matches('input')) return openDetail(ent, +tr.dataset.id);
  });
  $('#q', main).oninput = debounce(e => { S.q = e.target.value; load(); }, 300);
  $('#pj', main) && ($('#pj', main).onchange = e => { S.project = e.target.value; load(); });
  $('#mine', main) && ($('#mine', main).onchange = e => { S.mine = e.target.checked ? '1' : ''; load(); });
  await load();
}
function refresh(quiet) { if (ST.reload) ST.reload().catch(e => !quiet && toast(e.message, true)); }
// khách gặp trực tiếp / gọi Hotline: số điện thoại đã có hồ sơ thì ghi nhật ký vào hồ sơ cũ, chưa có thì tự tạo khách
async function leadModal(after) {
  const L = M.ents.contact_log.fields, lf = k => L.find(f => f.k === k);
  const fields = [{ k: 'channel', l: 'Kênh', t: 'sel', req: 1, o: [['truc_tiep', 'Gặp trực tiếp'], ['hotline', 'Hotline']] }, { k: 'full_name', l: 'Họ tên', t: 'text', req: 1 }, { k: 'phone', l: 'Điện thoại', t: 'text', req: 1, help: '09xxxxxxxx' },
    { k: 'email', l: 'Email', t: 'text' }, { k: 'interest_project', l: 'Dự án quan tâm', t: 'ref', ref: 'project' }, { ...lf('result') }, { ...lf('content') }, { ...lf('commitment') }, { ...lf('next_at') }];
  const rec = { channel: 'truc_tiep', result: 'da_lien_he' };
  const m = modal({ title: `${ico('fa-user-plus')} Thêm khách trực tiếp / Hotline`, wide: true, body: `<div class="warnbar">${ico('fa-circle-info')}<span>Khách từ Website, Messenger, Zalo tự đổ về — không cần nhập tay. Số điện thoại đã có hồ sơ thì chỉ ghi thêm nhật ký vào hồ sơ cũ.</span></div><div id="lerr"></div>
    <form class="form" autocomplete="off">${fields.map(f => `<div class="fld ${f.t === 'long' ? 'wide' : ''}" data-f="${f.k}"><label>${esc(f.l)}${f.req ? '<span class="req">*</span>' : ''}</label>${input(f, rec[f.k], rec)}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`).join('')}</form>`,
    foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="lOk">${ico('fa-floppy-disk')} Lưu khách & nhật ký</button>` });
  const form = $('form', m.el); wireInputs(form);
  $('#lOk', m.el).onclick = async () => {
    const data = {}; for (const f of fields) data[f.k] = readField(form, f);
    const miss = fields.filter(f => f.req && (data[f.k] == null || data[f.k] === ''));
    if (miss.length) return $('#lerr', m.el).innerHTML = `<div class="errbar">Thiếu thông tin bắt buộc: ${miss.map(f => esc(f.l)).join(', ')}</div>`;
    try { const r = await api('POST', '/api/leads/manual', data); m.close(); toast(r.new_customer ? 'Đã tạo khách hàng mới và ghi nhật ký' : 'Khách đã có hồ sơ — đã ghi thêm nhật ký'); after && after(); }
    catch (e) { $('#lerr', m.el).innerHTML = `<div class="errbar">${esc(e.message)}</div>`; }
  };
}
async function suggestModal() {
  const next = addDays(today().slice(0, 7) + '-01', 32).slice(0, 7);
  const m = modal({ title: `${ico('fa-wand-magic-sparkles')} Gợi ý kế hoạch thu`, narrow: true, body: `<p class="small muted" style="margin-top:0">Tạo dòng kế hoạch (nháp) cho mọi hợp đồng còn nợ có kỳ đến hạn trong tháng hoặc có cam kết thanh toán trong tháng. Số dự kiến = cam kết của khách (nếu có), nếu không = phần chưa thu của các kỳ đến hạn. Hợp đồng đã có dòng trong tháng được bỏ qua.</p><div class="fld"><label>Tháng kế hoạch</label>${input({ k: 'month', t: 'month' }, next)}</div>`,
    foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="sgOk">Tạo gợi ý</button>` });
  wireInputs(m.el);
  $('#sgOk', m.el).onclick = run(async () => { const r = await api('POST', '/api/collect_plan/suggest', { month: parseMonth($('[name=month]', m.el).value) }); m.close(); toast(`Đã tạo ${r.created} dòng kế hoạch tháng ${mmy(r.month)}${r.skipped.length ? ` · bỏ qua ${r.skipped.length}` : ''}`); refresh(); });
}
async function importModal(kind, after) {
  const I = M.imports[kind];
  const m = modal({ title: `${ico('fa-file-import')} Nhập ${esc(I.title)}`, body: `<div class="warnbar">${ico('fa-circle-info')}<div>${esc(I.note || 'Dùng đúng tệp mẫu. Mỗi dòng được kiểm tra theo luật như nhập tay; dòng lỗi bị bỏ qua và báo lại số dòng.')}<br>Bấm <b>Kiểm tra trước</b> để chạy thử (không ghi dữ liệu), rồi <b>Nhập</b>.</div></div>
    <div class="row mb"><button class="btn" id="tpl">${ico('fa-download')} Tải tệp mẫu</button><input type="file" id="ifile" accept=".xlsx,.csv" class="inp" style="padding-top:5px;flex:1"></div><div id="ires"></div>`,
    foot: `<button class="btn" data-x>Đóng</button><button class="btn" id="iDry">${ico('fa-list-check')} Kiểm tra trước</button><button class="btn pri" id="iGo">${ico('fa-file-import')} Nhập</button>` });
  $('#tpl', m.el).onclick = () => download(`/api/import/template/${kind}`);
  const go = dry => run(async () => {
    const f = $('#ifile', m.el).files[0]; if (!f) return toast('Chọn tệp .xlsx / .csv', true);
    const fd = new FormData(); fd.append('file', f, f.name);
    $('#ires', m.el).innerHTML = 'Đang xử lý…';
    const r = await api('POST', `/api/import/${kind}${dry ? '?dry=1' : ''}`, fd);
    $('#ires', m.el).innerHTML = `<div class="${r.loi ? 'warnbar' : 'okbar'}">${dry ? '<b>Kiểm tra (chưa ghi):</b> ' : '<b>Đã nhập:</b> '}${r.total} dòng — thêm ${r.them}${r.cap_nhat ? `, cập nhật ${r.cap_nhat}` : ''}${r.trung ? `, trùng bỏ qua ${r.trung}` : ''}, lỗi ${r.loi}</div>${r.errors.length ? `<table class="t compact noclick"><thead><tr><th>Dòng</th><th>Lỗi</th></tr></thead><tbody>${r.errors.map(x => `<tr><td>${x.line}</td><td>${esc(x.msg)}</td></tr>`).join('')}</tbody></table>` : ''}`;
    if (!dry) { after && after(); }
  });
  $('#iDry', m.el).onclick = go(true); $('#iGo', m.el).onclick = go(false);
}

// ---------- thanh kéo ngang phía trên bảng rộng (đồng bộ với thanh dưới) ----------
function syncTopScroll() {
  $$('.tbl-wrap').forEach(w => {
    let bar = w.previousElementSibling;
    if (!bar?.classList.contains('top-scroll')) {
      bar = document.createElement('div'); bar.className = 'top-scroll'; bar.innerHTML = '<div></div>'; w.before(bar);
      bar.onscroll = () => { if (w.scrollLeft !== bar.scrollLeft) w.scrollLeft = bar.scrollLeft; };
      w.addEventListener('scroll', () => { if (bar.scrollLeft !== w.scrollLeft) bar.scrollLeft = w.scrollLeft; });
    }
    bar.style.display = w.scrollWidth > w.clientWidth + 1 ? '' : 'none';
    bar.firstChild.style.width = w.scrollWidth + 'px';
    bar.scrollLeft = w.scrollLeft;
  });
}
new MutationObserver(debounce(syncTopScroll, 60)).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('resize', debounce(syncTopScroll, 100));

// ---- screens.js
// Khung app, đăng nhập, điều hướng và các màn tổng hợp.
'use strict';
const V = {};
const filt = () => ST.filt ||= { project: '', building: '', from: '', to: '' };

// ---------- đăng nhập ----------
async function loginView() {
  try { const i = await (await fetch('/api/login-info')).json(); if (i.noLogin) { location.hash = '#/v/dashboard'; return boot(); } } catch {}
  document.body.innerHTML = `<div class="login"><div class="hero"><img src="logo.png" alt=""><div class="k">CAT TUONG GROUP</div><h1>Quản lý <span>Phòng Kinh doanh</span></h1><p>Một mã căn — một hồ sơ xuyên suốt: giỏ hàng, khách hàng, giao dịch, hợp đồng, công nợ, bàn giao và cấp sổ hồng.</p></div>
    <div class="box"><form id="lf"><h2>Đăng nhập</h2><p class="muted" style="margin-top:0">Tài khoản nhân viên do Quản trị hệ thống cấp.</p><div id="lerr"></div>
      <div class="fld mb"><label for="lu">Tên đăng nhập</label><input id="lu" autocomplete="username" required></div>
      <div class="fld mb"><label for="lp">Mật khẩu</label><input id="lp" type="password" autocomplete="current-password" required></div>
      <button class="btn pri" style="width:100%;height:42px;justify-content:center">${ico('fa-right-to-bracket')} Đăng nhập</button><div class="trial" id="trial"></div></form></div></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('POST', '/api/login', { username: $('#lu').value.trim(), password: $('#lp').value }); location.hash = '#/v/dashboard'; await boot(r.must_change); }
    catch (er) { $('#lerr').innerHTML = `<div class="errbar">${esc(er.message)}</div>`; }
  };
  try {
    const { trial } = await api('GET', '/api/login-info');
    if (trial.length) {
      $('#trial').innerHTML = `<div class="small muted mb">Tài khoản thử theo vai trò (mật khẩu mặc định — ngừng trước khi vận hành):</div>` + trial.map(t => `<button type="button" data-u="${esc(t.username)}"><span>${esc(t.full_name.replace('Người dùng thử – ', ''))}</span><span class="muted">${esc(t.username)}</span></button>`).join('');
      $$('#trial button').forEach(b => b.onclick = () => { $('#lu').value = b.dataset.u; $('#lp').focus(); });
    }
  } catch { }
  $('#lu').focus();
}
function forcePassword(first) {
  if ($('#pwModal')) return;
  const m = modal({ title: `${ico('fa-key')} ${first ? 'Đổi mật khẩu lần đầu' : 'Đổi mật khẩu'}`, narrow: true, body: `<div id="pwModal"></div>${first ? '<div class="warnbar">Tài khoản đang dùng mật khẩu mặc định — cần đổi trước khi làm việc.</div>' : ''}<div id="perr"></div>
    <div class="fld mb"><label>Mật khẩu hiện tại</label><input type="password" id="p0" autocomplete="current-password"></div><div class="fld mb"><label>Mật khẩu mới (≥ 6 ký tự)</label><input type="password" id="p1" autocomplete="new-password"></div><div class="fld"><label>Nhập lại mật khẩu mới</label><input type="password" id="p2" autocomplete="new-password"></div>`,
    foot: `${first ? '' : '<button class="btn" data-x>Hủy</button>'}<button class="btn pri" id="pOk">Đổi mật khẩu</button>` });
  if (first) $$('[data-x]', m.el).forEach(b => b.remove());
  $('#pOk', m.el).onclick = async () => {
    if ($('#p1', m.el).value !== $('#p2', m.el).value) return $('#perr', m.el).innerHTML = '<div class="errbar">Hai lần nhập không khớp</div>';
    try { await api('POST', '/api/password', { old: $('#p0', m.el).value, pw: $('#p1', m.el).value }); m.el.remove(); toast('Đã đổi mật khẩu'); if (first) boot(); }
    catch (e) { $('#perr', m.el).innerHTML = `<div class="errbar">${esc(e.message)}</div>`; }
  };
}

// ---------- khung ----------
async function boot(mustChange) {
  try { M = await api('GET', '/api/meta'); } catch { return loginView(); }
  if (mustChange || M.me.must_change) { document.body.innerHTML = ''; return forcePassword(true); }
  document.body.innerHTML = `<header class="top"><button class="ibtn burger" id="burger" aria-label="Menu">${ico('fa-bars')}</button><a class="brand" href="#/v/dashboard"><img src="logo.png" alt="Cát Tường"><div><b>CAT TUONG GROUP</b><span>Phòng Kinh doanh</span></div></a>
    <div class="gsearch"><i class="fa-solid fa-magnifying-glass"></i><input id="gs" type="search" placeholder="Tìm mã căn, khách hàng, số điện thoại, số hợp đồng…" autocomplete="off"><div class="gres hidden" id="gr"></div></div>
    <div class="topact"><button class="ibtn ai-btn" id="bAi" title="Trợ lý AI tra cứu">${ico('fa-wand-magic-sparkles')}</button><button class="ibtn" id="bApr" title="Hộp phê duyệt">${ico('fa-stamp')}<span class="dot a hidden" id="nApr"></span></button><button class="ibtn" id="bAl" title="Cảnh báo / nhắc việc">${ico('fa-bell')}<span class="dot hidden" id="nAl"></span></button>
    <div class="me" id="meBtn"><span class="av">${esc(M.me.full_name.split(' ').slice(-1)[0].slice(0, 2).toUpperCase())}</span><div><b>${esc(M.me.full_name)}</b><small>${esc(roleName(M.me.role))}</small></div></div></div></header>
    <nav class="side" id="side"><h6>DANH MỤC PHÂN HỆ</h6>${M.menu.map(([no, t, icon, items]) => items.length === 1   // phân hệ chỉ một màn: bấm thẳng tên phân hệ, không xổ mục con
      ? `<div class="mod" data-mod="${no}"><a class="solo" href="${items[0][0].startsWith('e:') ? '#/e/' + items[0][0].slice(2) : '#/v/' + items[0][0]}" data-nav="${items[0][0]}"><span class="n">${no}</span>${esc(t)}</a></div>`
      : `<div class="mod" data-mod="${no}"><button>${`<span class="n">${no}</span>`}${esc(t)}<i class="fa-solid fa-chevron-right chev"></i></button><div class="items">${items.map(([id, l, , code]) => `<a href="${id.startsWith('e:') ? '#/e/' + id.slice(2) : '#/v/' + id}" data-nav="${id}">${esc(l)}${code ? `<small>${code}</small>` : ''}</a>`).join('')}</div></div>`).join('')}
    <div class="foot">${ico('fa-database')} Bravo: ${M.settings.bravo?.last_sync ? 'đồng bộ ' + dmyhm(M.settings.bravo.last_sync) : 'nhập tệp chứng từ'}${M.demo ? `<br>${ico('fa-flask')} Đang có <b>dữ liệu thử</b>` : ''}</div></nav>
    <main class="main" id="main"></main>`;
  $$('.mod > button').forEach(b => b.onclick = () => b.parentElement.classList.toggle('open'));
  $('#burger').onclick = () => document.body.classList.toggle('nav-open');
  $('#bApr').onclick = () => location.hash = '#/v/approvals';
  $('#bAl').onclick = () => location.hash = '#/v/alerts';
  $('#bAi').onclick = e => { e.stopPropagation(); aiOpen(); };
  $('#meBtn').onclick = e => {
    e.stopPropagation(); if ($('.menu-pop')) return $('.menu-pop').remove();
    const p = document.createElement('div'); p.className = 'menu-pop';
    const who = `<div style="padding:8px 12px"><b>${esc(M.me.full_name)}</b><div class="small muted">${esc(M.me.username)} · ${esc(roleName(M.me.role))}</div></div>`;
    if (M.noLogin) {   // chạy thử không đăng nhập: đổi vai trò bằng một cú bấm
      p.classList.add('as-pop');
      p.innerHTML = `${who}<div class="small muted" style="padding:6px 12px 4px">${ico('fa-user-gear')} Xem app với vai trò</div>${M.users.filter(u => u.active).map(u => `<button data-as="${u.id}" class="${u.id === M.me.id ? 'on' : ''}">${ico(u.id === M.me.id ? 'fa-circle-check' : 'fa-user')} ${esc(u.full_name)}<small class="muted"> · ${esc(roleName(u.role))}</small></button>`).join('')}`;
      document.body.append(p);
      p.onclick = async ev => { const b = ev.target.closest('[data-as]'); if (!b || +b.dataset.as === M.me.id) return; await api('POST', `/api/as/${b.dataset.as}`, {}); location.reload(); };
      return;
    }
    p.innerHTML = `${who}<button id="mPw">${ico('fa-key')} Đổi mật khẩu</button><button id="mOut">${ico('fa-right-from-bracket')} Đăng xuất</button>`;
    document.body.append(p);
    $('#mPw').onclick = () => { p.remove(); forcePassword(); };
    $('#mOut').onclick = async () => { await api('POST', '/api/logout', {}); location.hash = ''; location.reload(); };
  };
  document.addEventListener('click', e => { if (!e.target.closest('.menu-pop')) $('.menu-pop')?.remove(); if (!e.target.closest('.gsearch')) $('#gr')?.classList.add('hidden'); });
  globalSearch();
  window.onhashchange = route;
  route();
  updateBadges(); setInterval(updateBadges, 120e3);
}
async function updateBadges() {
  try {
    const [a, al] = await Promise.all([api('GET', '/api/approvals'), api('GET', '/api/alerts')]);
    const n1 = a.pending.length, n2 = al.filter(x => x.lvl === 'r').length || al.length;
    $('#nApr').textContent = n1; $('#nApr').classList.toggle('hidden', !n1);
    $('#nAl').textContent = n2 > 99 ? '99+' : n2; $('#nAl').classList.toggle('hidden', !n2);
  } catch { }
}
function globalSearch() {
  const inp = $('#gs'), box = $('#gr');
  let res = [], cur = -1;
  const open = r => { box.classList.add('hidden'); inp.value = ''; if (r.type === 'unit') location.hash = `#/v/unit360?id=${r.id}`; else if (r.type === 'customer') location.hash = `#/v/cust360?id=${r.id}`; else openDetail(r.type, r.id); };
  inp.oninput = debounce(async () => {
    if (inp.value.trim().length < 2) return box.classList.add('hidden');
    res = await api('GET', '/api/search?q=' + encodeURIComponent(inp.value.trim())); cur = -1;
    const I = { unit: 'fa-door-open', customer: 'fa-user', contract: 'fa-file-contract', ticket: 'fa-headset', reservation: 'fa-hand-holding-hand' };
    box.innerHTML = res.length ? res.map((r, i) => `<a href="#" data-i="${i}">${ico(I[r.type])}<div><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></div></a>`).join('') : '<div class="empty" style="padding:16px">Không tìm thấy</div>';
    box.classList.remove('hidden');
  }, 250);
  box.onclick = e => { const a = e.target.closest('[data-i]'); if (a) { e.preventDefault(); open(res[+a.dataset.i]); } };
  inp.onkeydown = e => { const as = $$('[data-i]', box); if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, Math.min(as.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1))); as.forEach((a, i) => a.classList.toggle('on', i === cur)); } if (e.key === 'Enter') { e.preventDefault(); if (res[Math.max(cur, 0)]) open(res[Math.max(cur, 0)]); } if (e.key === 'Escape') box.classList.add('hidden'); };
}
async function route() {
  closeDetail(); document.body.classList.remove('nav-open'); ST.reload = null;
  const tok = ST.nav = (ST.nav || 0) + 1;   // màn cũ còn tải dở mà người dùng đã chuyển màn: bỏ qua lỗi của nó
  const h = location.hash.slice(1) || '/v/dashboard';
  const [p, qs] = h.split('?'); const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const [, kind, name] = p.split('/');
  const main = $('#main'); if (!main) return;
  main.onclick = null; main.innerHTML = '<div class="empty">Đang tải…</div>';
  const navId = kind === 'e' ? ({ project: 'projects', building: 'projects', unit: 'products' }[name] || 'e:' + name + (params.group ? '?group=' + params.group : '')) : name === 'unit360' || name === 'cust360' ? 'lookup' : name === 'pricesheet' ? 'e:price_policy' : name;
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navId));
  const on = $(`[data-nav="${navId}"]`); $$('.mod').forEach(m => m.classList.remove('cur'));
  if (on) { on.closest('.mod').classList.add('open', 'cur'); }
  try {
    if (kind === 'e' && M.ents[name]) await listView(main, name, params);
    else if (kind === 'v' && V[name]) await V[name](main, params);
    else main.innerHTML = '<div class="empty">Không có màn hình này</div>';
    if (params.open) { const [e, id] = params.open.split(':'); openDetail(e, +id); }
  } catch (e) { if (tok === ST.nav) main.innerHTML = `<div class="page"><div class="errbar">${esc(e.message)}</div></div>`; }
  if (tok === ST.nav) window.scrollTo(0, 0);
}
const head = (mod, title, icon, acts = '', code) => `<div class="ph"><div><div class="eyebrow">Phân hệ ${mod}${M.menu.find(m => m[0] === mod) ? ' · ' + esc(M.menu.find(m => m[0] === mod)[1]) : ''}${code ? ` <span class="code">${code}</span>` : ''}</div><h1>${ico(icon)} ${title}</h1></div><div class="acts">${acts}</div></div>`;
function filterBar(f, { period = true, building = true } = {}) {
  return `<div class="card mb"><div class="toolbar" style="border:0"><select id="fP"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+f.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>
    ${building ? `<select id="fB"><option value="">Tất cả tòa</option>${M.buildings.filter(b => !f.project || b.project_id === +f.project).map(b => `<option value="${b.id}" ${+f.building === b.id ? 'selected' : ''}>Tòa ${esc(b.code)}</option>`).join('')}</select>` : ''}
    ${period ? `<span class="muted small">Kỳ từ</span><select id="fF" class="mon">${monthOpts(f.from || today().slice(0, 4) + '-01')}</select><span class="muted small">đến</span><select id="fT" class="mon">${monthOpts(f.to || today().slice(0, 7))}</select>` : ''}<span class="grow"></span><span class="src" id="srcLine"></span></div></div>`;
}
function monthOpts(sel) {
  const out = []; let y = 2025, m = 1; const end = addDays(today().slice(0, 7) + '-01', 400).slice(0, 7);
  while (`${y}-${String(m).padStart(2, '0')}` <= end) { const v = `${y}-${String(m).padStart(2, '0')}`; out.push(`<option value="${v}" ${v === sel ? 'selected' : ''}>Tháng ${String(m).padStart(2, '0')}/${y}</option>`); if (++m > 12) { m = 1; y++; } }
  return out.join('');
}
function wireFilter(main, f, reload) {
  $('#fP', main) && ($('#fP', main).onchange = e => { f.project = e.target.value; f.building = ''; reload(); });
  $('#fB', main) && ($('#fB', main).onchange = e => { f.building = e.target.value; reload(); });
  $('#fF', main) && ($('#fF', main).onchange = e => { f.from = e.target.value; reload(); });
  $('#fT', main) && ($('#fT', main).onchange = e => { f.to = e.target.value; reload(); });
}
const qsOf = f => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();

// ---------- biểu đồ cột ----------
function barChart(rows, series, { line, onClick } = {}) {
  const W = 720, H = 220, P = { l: 52, r: 10, t: 12, b: 28 }, n = rows.length || 1;
  const max = Math.max(1, ...rows.flatMap(r => [...series.map(s => r[s.k] || 0), line ? r[line.k] || 0 : 0]));
  const step = (() => { const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
  const top = step * Math.ceil(max / step), y = v => P.t + (H - P.t - P.b) * (1 - v / top);
  const gw = (W - P.l - P.r) / n, bw = Math.min(26, (gw - 8) / series.length);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">`;
  for (let v = 0; v <= top + 1; v += step) s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e7edf4"/><text x="${P.l - 6}" y="${y(v) + 3}" text-anchor="end">${fmB(v)}</text>`;
  rows.forEach((r, i) => {
    const x0 = P.l + gw * i + (gw - bw * series.length) / 2;
    series.forEach((se, j) => { const v = r[se.k] || 0; s += `<rect x="${x0 + j * bw}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, y(0) - y(v))}" rx="3" fill="${se.c}" data-i="${i}" style="cursor:${onClick ? 'pointer' : 'default'}"><title>${esc(se.l)} ${esc(r.label)}: ${fm(v)}</title></rect>`; });
    if (line && r[line.k]) s += `<line x1="${x0 - 3}" x2="${x0 + bw * series.length + 1}" y1="${y(r[line.k])}" y2="${y(r[line.k])}" stroke="${line.c}" stroke-width="2.5" stroke-dasharray="4 3"><title>${esc(line.l)}: ${fm(r[line.k])}</title></line>`;
    s += `<text x="${P.l + gw * i + gw / 2}" y="${H - 9}" text-anchor="middle">${esc(r.label)}</text>`;
  });
  s += '</svg>';
  const legend = `<div class="legend">${series.map(se => `<span><b style="background:${se.c}"></b>${esc(se.l)}</span>`).join('')}${line ? `<span><b style="background:${line.c};height:3px"></b>${esc(line.l)}</span>` : ''}</div>`;
  const wrap = document.createElement('div'); wrap.innerHTML = legend + s;
  if (onClick) wrap.onclick = e => { const r = e.target.closest('rect[data-i]'); if (r) onClick(rows[+r.dataset.i]); };
  return wrap;
}

// ---------- truy xuất chi tiết (drill) ----------
async function drill(key, f = {}) {
  const m = modal({ title: 'Đang tải…', wide: true, body: '<div class="empty">Đang tải…</div>' });
  try {
    const d = await api('GET', `/api/drill/${encodeURIComponent(key)}?${qsOf(f)}`);
    $('.mh h3', m.el).innerHTML = `${ico('fa-magnifying-glass-chart')} ${esc(d.title)} <span class="tag">${d.rows.length}</span>`;
    m.body.innerHTML = rowsTable(d.cols, d.rows, d.sum) + `<div class="src mt">${ico('fa-circle-info')} Nguồn: ${d.src === 'Bravo' ? 'chứng từ thu đồng bộ từ Bravo' : 'dữ liệu nghiệp vụ App'} · bấm một dòng để mở hồ sơ</div>`;
    $('.mb', m.el).insertAdjacentHTML('afterend', `<div class="mf"><button class="btn" id="dx">${ico('fa-file-excel')} Xuất Excel</button><button class="btn pri" data-x>Đóng</button></div>`);
    $('[data-x]', $('.mf', m.el)).onclick = m.close;
    $('#dx', m.el).onclick = () => download('/api/export-rows', { title: d.title, cols: d.cols, rows: d.rows, sum: d.sum, file: key.replace(/\W+/g, '_') });
    m.body.onclick = e => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const r = d.rows[+tr.dataset.i]; m.close(); openRow(r); };
  } catch (e) { m.body.innerHTML = `<div class="errbar">${esc(e.message)}</div>`; }
}
function openRow(r) { if (r._ent) openDetail(r._ent[0], r._ent[1]); else if (r.contract_id) openDetail('contract', r.contract_id, 'debt'); else if (r.unit_id) location.hash = `#/v/unit360?id=${r.unit_id}`; else if (r.ent) openDetail(r.ent, r.id); }
function rowsTable(cols, rows, sum, { click = true } = {}) {
  if (!rows.length) return '<div class="empty">Không có dữ liệu</div>';
  const f = (c, v) => c[2] === 'money' ? fm(v) : c[2] === 'num' ? fnum(v) : c[2] === 'int' ? (v ?? '') : c[2] === 'date' ? dmy(v) : c[2] === 'dt' ? dmyhm(v) : esc(v ?? '');
  const isN = c => ['money', 'num', 'int'].includes(c[2]);
  const WRAP = new Set(['text', 'content', 'reason', 'note', 'extra', 'title', 'descr', 'promise', 'status']);
  return `<div class="tbl-wrap"><table class="t compact ${click ? '' : 'noclick'}"><thead><tr><th>#</th>${cols.map(c => `<th class="${isN(c) ? 'num' : ''}">${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr data-i="${i}"><td class="muted">${i + 1}</td>${cols.map(c => `<td class="${isN(c) ? 'num' : ''} ${WRAP.has(c[0]) ? 'wrap' : ''} ${c[2] === 'money' && c[0] === 'gap' ? (r[c[0]] < 0 ? 'neg' : 'pos') : ''}">${f(c, r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody>
    ${sum?.length ? `<tfoot><tr><td></td>${cols.map((c, i) => `<td class="${isN(c) ? 'num' : ''}">${sum.includes(c[0]) ? (c[2] === 'money' ? fm(rows.reduce((s, r) => s + (+r[c[0]] || 0), 0)) : rows.reduce((s, r) => s + (+r[c[0]] || 0), 0)) : i === 0 ? 'Tổng' : ''}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
}

// ======================= 01. DASHBOARD =======================
V.dashboard = async main => {
  const f = filt();
  const draw = async () => {
    main.innerHTML = `<div class="page">${head('01', 'Tổng quan điều hành', 'fa-gauge-high', `<button class="btn" onclick="print()">${ico('fa-print')} In / PDF</button>`)}${filterBar(f)}<div id="dash"><div class="empty">Đang tổng hợp…</div></div></div>`;
    wireFilter(main, f, draw);
    const d = await api('GET', '/api/dashboard?' + qsOf(f)), k = d.kpi, pct = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
    $('#srcLine', main).innerHTML = `<span>${ico('fa-clock')} Cập nhật ${dmyhm(d.updated_at)}</span><span>${ico('fa-database')} Thực thu: Bravo${d.bravo_sync ? ' — chốt ' + dmyhm(d.bravo_sync) : ''}</span>`;
    const tile = (key, l, icon, v, s, extra = '', cls = '') => `<div class="card kpi ${cls}" data-drill="${key}"><div class="l">${ico(icon)} ${l}</div><div class="v">${v}</div><div class="s">${s}</div>${extra}</div>`;
    $('#dash', main).innerHTML = `
      <div class="grid g4">
        ${tile('revenue', 'Doanh số ký hợp đồng', 'fa-file-signature', fmB(k.revenue), `Chỉ tiêu ${fmB(k.revenue_target)} · ${pct(k.revenue, k.revenue_target)}% · ${k.units_sold_period} căn`, `<div class="bar"><i style="width:${pct(k.revenue, k.revenue_target)}%"></i></div>`)}
        ${tile('collected', 'Đã thu trong kỳ (Bravo)', 'fa-sack-dollar', fmB(k.collected), `Chỉ tiêu ${fmB(k.collect_target)} · KH đã duyệt ${fmB(k.collect_plan)}`, `<div class="bar"><i class="sage" style="width:${pct(k.collected, k.collect_target)}%"></i></div>`, 'green')}
        ${tile('debt:left', 'Công nợ còn phải thu', 'fa-scale-unbalanced', fmB(k.debt_left), `Phải thu ${fmB(k.debt_total)} · đã thu ${fmB(k.debt_paid)}`, `<div class="bar"><i class="amb" style="width:${pct(k.debt_paid, k.debt_total)}%"></i></div>`)}
        ${tile('debt:overdue', 'Nợ quá hạn', 'fa-triangle-exclamation', fmB(k.debt_overdue), `${k.late_customers} khách chậm thanh toán · đến hạn 7 ngày ${fmB(k.debt_due7)}`, '', k.debt_overdue ? 'red' : '')}
      </div>
      <div class="grid g4 mt">
        ${tile('units:sold', 'Căn đã bán', 'fa-door-closed', `${k.units_sold}<small> / ${k.units_opened}</small>`, `Tỷ lệ tiêu thụ ${fnum(k.absorption)}%`, `<div class="bar"><i style="width:${k.absorption}%"></i></div>`)}
        ${tile('units:con_ban', 'Căn còn bán', 'fa-door-open', k.units_left, `Đang giữ chỗ / cọc: <a href="#" data-drill="units:hold">${k.units_hold}</a>`)}
        ${tile('plan:' + today().slice(0, 7), 'Kế hoạch thu tháng này', 'fa-chart-line', fmB(k.month_actual) + `<small> / ${fmB(k.month_plan)}</small>`, `Thực thu / dự kiến (đã duyệt) · ${pct(k.month_actual, k.month_plan)}%`, `<div class="bar"><i class="sage" style="width:${pct(k.month_actual, k.month_plan)}%"></i></div>`)}
        ${tile('alerts', 'Tồn đọng cần xử lý', 'fa-bell', k.backlog, `${k.backlog_red} việc khẩn / quá hạn`, '', k.backlog_red ? 'red' : '')}
      </div>
      <div class="grid g2 mt">
        <div class="card"><div class="hd"><h3>${ico('fa-chart-column')} Doanh số ký HĐ theo tháng</h3><span class="grow"></span><span class="small muted">bấm cột để xem chi tiết</span></div><div class="bd" id="c1"></div></div>
        <div class="card"><div class="hd"><h3>${ico('fa-chart-column')} Thu tiền: kế hoạch – thực thu</h3></div><div class="bd" id="c2"></div></div>
      </div>
      <div class="grid g2 mt">
        <div class="card"><div class="hd"><h3>${ico('fa-building')} Tình trạng giỏ hàng theo tòa</h3><span class="grow"></span><a href="#/v/board">Mở bảng hàng →</a></div><div class="bd">${d.byBuilding.map(b => {
          const segs = [['con_ban', b.con_ban, '#7BAE7F'], ['giu_cho', b.giu_cho, '#F5A623'], ['da_ky', b.da_ky, '#1E4E8C'], ['da_ban_giao', b.da_ban_giao, '#0f766e']];
          return `<div class="mb" data-drill="building:${b.building_id}" style="cursor:pointer"><div class="row"><b>${esc(b.project)} · Tòa ${esc(b.building)}</b><span class="grow"></span><span class="small muted">${b.total} căn · tiêu thụ ${fnum(b.rate)}%</span></div><div class="stack mt">${segs.map(s => `<i style="width:${b.total ? s[1] / b.total * 100 : 0}%;background:${s[2]}" title="${s[1]}"></i>`).join('')}</div><div class="small muted mt">Còn bán ${b.con_ban} · giữ chỗ/cọc ${b.giu_cho} · đã ký ${b.da_ky} · đã bàn giao ${b.da_ban_giao}</div></div>`;
        }).join('') || '<div class="empty">Chưa có sản phẩm</div>'}<div class="legend"><span><b style="background:#7BAE7F"></b>Còn bán</span><span><b style="background:#F5A623"></b>Giữ chỗ / cọc</span><span><b style="background:#1E4E8C"></b>Đã ký HĐ</span><span><b style="background:#0f766e"></b>Đã bàn giao</span></div></div></div>
        <div class="card"><div class="hd"><h3>${ico('fa-list-check')} Tiến độ hồ sơ – hợp đồng – bàn giao</h3></div><div class="bd"><div class="grid g3">
          ${[['noxh:nhap,tu_choi', 'Hồ sơ NOXH đang xử lý', d.progress.noxh_open], ['noxh:cho_duyet', 'Hồ sơ chờ xét duyệt', d.progress.noxh_review], ['noxh:da_duyet', 'Hồ sơ đạt', d.progress.noxh_ok],
             ['contracts:du_thao,tu_choi,cho_duyet', 'HĐ dự thảo / rà soát', d.progress.ct_draft + d.progress.ct_review], ['contracts:cho_ky', 'HĐ chờ ký', d.progress.ct_wait], ['contracts:da_ky', 'HĐ đã ký', d.progress.ct_signed],
             ['handover:ready', 'Đủ ĐK, chưa lập lịch bàn giao', d.progress.ho_ready], ['handover:da_moi,da_hen', 'Đã mời bàn giao', d.progress.ho_invited], ['handover:not', 'Đã ký, chưa bàn giao', d.progress.ho_not],
          ].map(([key, l, v]) => `<div class="cat-tile" data-drill="${key}"><b>${v}</b><span class="small">${l}</span></div>`).join('')}</div></div></div>
      </div>
      <div class="card mt"><div class="hd"><h3>${ico('fa-bell')} Cảnh báo tồn đọng</h3><span class="grow"></span><a href="#/v/alerts">Xem tất cả →</a></div><div class="bd"><div class="grid g4">${d.alerts.sort((a, b) => b.red - a.red || b.n - a.n).map(a => `<div class="cat-tile ${a.red ? 'red' : ''}" data-drill="alerts:${a.cat}"><b>${a.n}</b><span class="small">${esc(a.label)}${a.red ? ` <span class="pill r">${a.red} khẩn</span>` : ''}</span></div>`).join('') || '<div class="muted">Không có tồn đọng</div>'}</div></div></div>`;
    const ser = d.series.map(x => ({ ...x, label: x.m.slice(5) + '/' + x.m.slice(2, 4) }));
    $('#c1', main).append(barChart(ser, [{ k: 'signed', l: 'Doanh số ký', c: '#1E4E8C' }], { line: { k: 'target_sales', l: 'Chỉ tiêu', c: '#F5A623' }, onClick: r => drill('revenue:' + r.m, f) }));
    $('#c2', main).append(barChart(ser, [{ k: 'plan', l: 'Kế hoạch (đã duyệt)', c: '#c9d8ea' }, { k: 'actual', l: 'Thực thu (Bravo)', c: '#7BAE7F' }], { line: { k: 'target_collect', l: 'Chỉ tiêu thu', c: '#F5A623' }, onClick: r => drill('collected:' + r.m, f) }));
    main.onclick = e => { const t = e.target.closest('[data-drill]'); if (t) { e.preventDefault(); drill(t.dataset.drill, f); } };
  };
  await draw();
};

// ======================= CẢNH BÁO / PHÊ DUYỆT =======================
V.alerts = async (main, params) => {
  const mgr = ['truong_phong', 'lanh_dao', 'admin'].includes(M.me.role);
  let all = mgr && params.all !== '0';
  const draw = async () => {
    const al = await api('GET', `/api/alerts?all=${all ? 1 : 0}`);
    const groups = {}; al.forEach(a => (groups[a.cat] ||= []).push(a));
    main.innerHTML = `<div class="page">${head('01', 'Cảnh báo tồn đọng – nhắc việc', 'fa-bell', mgr ? `<label class="chk"><input type="checkbox" id="allT" ${all ? 'checked' : ''}> Toàn phòng</label>` : '')}
      <div class="grid g3">${Object.entries(groups).map(([cat, xs]) => `<div class="card"><div class="hd"><h3>${esc(M.alertCat[cat])}</h3><span class="grow"></span><span class="pill ${xs.some(x => x.lvl === 'r') ? 'r' : 'a'}">${xs.length}</span></div><div>${xs.slice(0, 40).map((a, i) => `<div class="alert-row" data-c="${cat}" data-i="${i}"><span class="lv ${a.lvl}"></span><div class="tx">${esc(a.text)}<small>${a.due ? 'Hạn ' + dmy(a.due) + ' · ' : ''}${esc(a.who || '')}</small></div></div>`).join('')}${xs.length > 40 ? `<div class="more small muted">… và ${xs.length - 40} việc khác</div>` : ''}</div></div>`).join('') || `<div class="card pad span2"><div class="empty">${ico('fa-mug-hot')}Không có việc tồn đọng.</div></div>`}</div></div>`;
    $('#allT', main) && ($('#allT', main).onchange = e => { all = e.target.checked; draw(); });
    main.onclick = e => { const r = e.target.closest('.alert-row'); if (!r) return; const a = groups[r.dataset.c][+r.dataset.i]; if (a.ent) openDetail(a.ent, a.id); else if (a.unit_id) location.hash = `#/v/unit360?id=${a.unit_id}`; else if (a.cat === 'ke_hoach') location.hash = '#/e/collect_plan'; };
  };
  await draw();
};
V.approvals = async main => {
  const d = await api('GET', '/api/approvals');
  let tab = 'pending';
  const ST_ = { cho_duyet: ['Chờ duyệt', 'a'], da_duyet: ['Đã duyệt', 'g'], tu_choi: ['Từ chối', 'r'], huy: ['Đã hủy', 's'] };
  const draw = () => {
    const rows = d[tab];
    main.innerHTML = `<div class="page">${head('01', 'Hộp phê duyệt', 'fa-stamp')}<div class="card"><div class="tabs">${[['pending', 'Chờ tôi duyệt'], ['mine', 'Tôi đã trình'], ['done', 'Tôi đã quyết định']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}<span class="c">${d[k].length}</span></button>`).join('')}</div>
      ${rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Nội dung</th><th>Loại</th><th>${tab === 'pending' ? 'Người trình' : tab === 'mine' ? 'Người quyết định' : 'Người trình'}</th><th>Thời điểm</th><th>Trạng thái</th><th>Ý kiến</th>${tab === 'pending' ? '<th></th>' : ''}</tr></thead><tbody>${rows.map((a, i) => `<tr data-i="${i}"><td><b>${esc(a.title)}</b></td><td>${esc(M.ents[a.ent]?.title || a.ent)}</td><td>${esc(tab === 'mine' ? a.decided_by_l || '' : a.requested_by_l || '')}</td><td>${dmyhm(tab === 'done' ? a.decided_at : a.requested_at)}</td><td>${pill(...ST_[a.status])}</td><td class="small">${esc(a.comment || '')}</td>${tab === 'pending' ? `<td class="nowrap"><button class="btn ok sm" data-ok="${i}">${ico('fa-check')} Duyệt</button> <button class="btn danger sm" data-no="${i}">${ico('fa-xmark')}</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : `<div class="empty">${ico('fa-inbox')}Không có đề nghị nào</div>`}</div></div>`;
  };
  draw();
  main.onclick = run(async e => {
    const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; return draw(); }
    const ok = e.target.closest('[data-ok],[data-no]');
    if (ok) {
      const a = d.pending[+(ok.dataset.ok ?? ok.dataset.no)], yes = ok.dataset.ok !== undefined;
      const c = await ask(yes ? 'Phê duyệt' : 'Từ chối', esc(a.title), { reason: 1, reasonReq: !yes, reasonLabel: yes ? 'Ý kiến (không bắt buộc)' : 'Lý do từ chối', danger: !yes, okLabel: yes ? 'Duyệt' : 'Từ chối' });
      if (!c) return;
      await api('POST', `/api/e/${a.ent}/${a.rec_id}/approve`, { ok: yes, comment: c === true ? null : c }); toast(yes ? 'Đã duyệt' : 'Đã từ chối'); updateBadges();
      Object.assign(d, await api('GET', '/api/approvals')); return draw();
    }
    const tr = e.target.closest('tr[data-i]'); if (tr) { const a = d[tab][+tr.dataset.i]; openDetail(a.ent, a.rec_id, 'appr'); }
  });
};

// ======================= 02. BẢNG HÀNG =======================
const USTAT = { con_ban: 'Còn bán', giu_cho: 'Giữ chỗ', da_coc: 'Đã cọc', da_ky_hd: 'Đã ký HĐ', da_ban_giao: 'Đã bàn giao', chua_mo_ban: 'Chưa mở bán', tam_khoa: 'Tạm khóa', ngung_kd: 'Ngừng KD' };
V.board = async (main, params) => {
  const s = ST.board ||= { project: '', building: '', st: '', kind: '' };
  if (params.project) s.project = params.project;
  const draw = async () => {
    const d = await api('GET', `/api/board?${qsOf({ project: s.project, building: s.building })}`);
    s.project = d.project; s.building = d.building;
    const cnt = {}; d.units.forEach(u => cnt[u.status] = (cnt[u.status] || 0) + 1);
    const floors = [...new Set(d.units.map(u => u.floor))].sort((a, b) => b - a);
    const kinds = [...new Set(d.units.map(u => u.kind))];
    main.innerHTML = `<div class="page">${head('02', 'Bảng hàng', 'fa-table-cells', M.ents.reservation.perm.c ? `<span class="small muted">Bấm căn <b>Còn bán</b> hoặc</span><button class="btn pri" id="bNew">${ico('fa-plus')} Tạo phiếu đăng ký</button>` : '')}
      <div class="card mb"><div class="toolbar" style="border:0"><select id="bp">${d.projects.filter(p => p.n).map(p => `<option value="${p.id}" ${p.id === d.project ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)} (${p.n} căn)</option>`).join('')}</select>
        <select id="bk"><option value="">Mọi loại căn</option>${kinds.map(k => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${esc(M.ents.unit.fields.find(f => f.k === 'kind').o.find(o => o[0] === k)?.[1] || k)}</option>`).join('')}</select>
        <span class="grow"></span>${d.policy ? `<span class="src">${ico('fa-tags')} Chính sách đang áp dụng: <b>${esc(d.policy.code)}</b> (${dmy(d.policy.start_on)} – ${dmy(d.policy.end_on)})${d.policy.src_file ? ' · ' + esc(d.policy.src_file) : ''}</span>` : '<span class="pill a">Chưa có chính sách giá đang phát hành</span>'}</div>
        <div style="padding:0 14px 12px"><div class="towers">${d.buildings.map(b => `<div class="tower ${b.id === d.building ? 'on' : ''}" data-b="${b.id}"><b>${esc(b.name || 'Tòa ' + b.code)}</b><small>${b.n} căn</small></div>`).join('')}</div></div></div>
      <div class="card"><div class="toolbar"><div class="legend">${Object.entries(USTAT).filter(([k]) => cnt[k]).map(([k, l]) => `<span data-st="${k}" style="cursor:pointer;${s.st && s.st !== k ? 'opacity:.4' : ''}"><b class="u ${k}" style="width:12px;height:12px;min-height:0;padding:0;border-radius:3px"></b>${l} <b style="background:none;width:auto;height:auto;color:var(--ink)">${cnt[k]}</b></span>`).join('')}</div>${s.st ? '<button class="btn sm ghost" data-st="">Bỏ lọc</button>' : ''}<span class="grow"></span><span class="small muted">${d.units.length} căn · ${floors.length} tầng</span></div>
      <div class="bd"><div class="floors">${floors.map(fl => `<div class="floor"><div class="fl">Tầng ${fl}</div><div class="us">${d.units.filter(u => u.floor === fl).map(u => `<div class="u ${u.status} ${(s.st && s.st !== u.status) || (s.kind && s.kind !== u.kind) ? 'dim' : ''}" data-u="${u.id}" title="${esc(u.code)} · ${USTAT[u.status]}${u.customer ? ' · ' + esc(u.customer) : ''}">${u.hold_until ? `<span class="hold">${ico('fa-clock')}</span>` : ''}<b>${esc(u.code.split('-').pop())}</b>${u.bedrooms || ''}PN · ${fnum(u.area_tt)}m²<br>${fmB(u.total_price)}<div class="cu">${esc(u.customer || u.direction || '')}</div></div>`).join('')}</div></div>`).join('') || '<div class="empty">Tòa chưa có căn</div>'}</div></div></div></div>`;
    $('#bp', main).onchange = e => { s.project = e.target.value; s.building = ''; draw(); };
    $('#bk', main).onchange = e => { s.kind = e.target.value; draw(); };
    main.onclick = run(async e => {
      if (e.target.closest('#bNew')) return openForm('reservation', { title: `${ico('fa-hand-holding-hand')} Phiếu đăng ký căn hộ`, onSaved: row => { draw(); toast('Đã lưu — phiếu đã vào «Đăng ký mua – giữ chỗ» (04)'); openDetail('reservation', row.id); } });
      const b = e.target.closest('[data-b]'); if (b) { s.building = b.dataset.b; return draw(); }
      const st = e.target.closest('[data-st]'); if (st) { s.st = s.st === st.dataset.st ? '' : st.dataset.st; return draw(); }
      const u = e.target.closest('[data-u]'); if (u) return unitPop(d.units.find(x => x.id === +u.dataset.u), draw);
    });
  };
  await draw();
};
function unitPop(u, after) {
  const canRes = u.status === 'con_ban' && M.ents.reservation.perm.c;
  const m = modal({ title: `${ico('fa-door-open')} Căn ${esc(u.code)} ${pill(USTAT[u.status], { con_ban: 'g', giu_cho: 'a', da_coc: 'v', da_ky_hd: 'b', da_ban_giao: 't', tam_khoa: 'r' }[u.status])}`, narrow: true,
    body: `<dl class="kv"><div><dt>Tầng</dt><dd>${u.floor}</dd></div><div><dt>Loại</dt><dd>${u.bedrooms || ''} phòng ngủ</dd></div><div><dt>Diện tích thông thủy</dt><dd>${fnum(u.area_tt)} m²</dd></div><div><dt>Hướng</dt><dd>${esc(u.direction || '')}</dd></div>
      <div class="wide"><dt>Tổng giá căn hộ</dt><dd><b style="font-size:18px;color:var(--cobalt-d)">${fm(u.total_price)} đ</b></dd></div><div><dt>Dự kiến bàn giao</dt><dd>${esc(u.handover_plan || '')}</dd></div><div><dt>Khách hàng</dt><dd>${esc(u.customer || '—')}</dd></div>${u.hold_until ? `<div class="wide"><dt>Hạn giữ chỗ</dt><dd>${dmyhm(u.hold_until)}</dd></div>` : ''}</dl>`,
    foot: `<button class="btn" data-x>Đóng</button><button class="btn" id="u3">${ico('fa-building')} Hồ sơ 360°</button>${canRes ? `<button class="btn pri" id="ures">${ico('fa-hand-holding-hand')} Lập phiếu đăng ký căn hộ</button>` : ''}` });
  $('#u3', m.el).onclick = () => { m.close(); location.hash = `#/v/unit360?id=${u.id}`; };
  $('#ures', m.el) && ($('#ures', m.el).onclick = () => { m.close(); openForm('reservation', { title: `${ico('fa-hand-holding-hand')} Phiếu đăng ký căn hộ — ${esc(u.code)}`, preset: { unit_id: u.id, unit_id__l: u.code, price: u.total_price ?? undefined },
    onSaved: row => { after(); toast('Đã lưu — phiếu đã vào «Đăng ký mua – giữ chỗ» (04)'); openDetail('reservation', row.id); } }); });
}

// ======================= 02. DANH MỤC DỰ ÁN / SẢN PHẨM =======================
const UST_C = { con_ban: 'g', giu_cho: 'a', da_coc: 'v', da_ky_hd: 'b', da_ban_giao: 't', tam_khoa: 'r' };
const SOLD = new Set(['giu_cho', 'da_coc', 'da_ky_hd', 'da_ban_giao']);
const optL = (ent, k, v) => M.ents[ent].fields.find(f => f.k === k)?.o?.find(o => o[0] === v)?.[1] || v || '';
async function catalogData() {
  const [p, b, u] = await Promise.all(['project', 'building', 'unit'].map(e => api('GET', `/api/e/${e}?limit=20000&sort=code`)));
  const units = u.rows.sort((a, c) => a.code.localeCompare(c.code, 'vi', { numeric: true }));
  const sum = list => ({ n: list.length, con: list.filter(x => x.status === 'con_ban').length, sold: list.filter(x => SOLD.has(x.status)).length,
    tt: list.reduce((s, x) => s + (+x.area_tt || 0), 0), xd: list.reduce((s, x) => s + (+x.area_xd || 0), 0), dat: list.reduce((s, x) => s + (+x.area_dat || 0), 0), gia: list.reduce((s, x) => s + (+x.total_price || 0), 0) });
  const buildings = b.rows.map(x => { const us = units.filter(v => v.building_id === x.id); return { ...x, units: us, s: sum(us) }; });
  const projects = p.rows.map(x => { const bs = buildings.filter(v => v.project_id === x.id); const us = units.filter(v => v.project_id === x.id); return { ...x, buildings: bs, units: us, s: sum(us) }; });
  return { projects, buildings, units, sum };
}
const bName = b => b.name && b.name.toUpperCase().includes(String(b.code).toUpperCase()) ? b.name : `Tòa ${b.code}${b.name ? ' · ' + b.name : ''}`;
const unitMatch = (u, q) => !q || `${u.code} ${u.direction || ''} ${u.building_id__l || ''}`.toLowerCase().includes(q);

// Danh mục dự án: chỉ dự án — STT · Mã dự án · Tên dự án · Địa chỉ dự án (tòa / căn xem ở Danh mục sản phẩm)
V.projects = async main => {
  const s = ST.cat ||= { q: '' };
  const pe = M.ents.project.perm;
  const draw = async () => {
    const all = (await api('GET', '/api/e/project?limit=20000&sort=code')).rows, q = s.q.trim().toLowerCase();
    const rows = all.filter(p => !q || `${p.code} ${p.name} ${p.address || ''}`.toLowerCase().includes(q));
    main.innerHTML = `<div class="page">${head('02', 'Danh mục dự án', 'fa-sitemap', pe.c ? `<button class="btn pri" id="pjNew">${ico('fa-plus')} Tạo dự án</button>` : '')}
      <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="cq" placeholder="Tìm mã, tên, địa chỉ dự án…" value="${esc(s.q)}"></div><span class="grow"></span><span class="small muted">${rows.length} dự án</span></div>
      <div class="tbl-wrap"><table class="t grid-bravo"><thead><tr><th>STT</th><th>Mã dự án</th><th>Tên dự án</th><th>Địa chỉ dự án</th></tr></thead>
      <tbody>${rows.map((p, i) => `<tr data-p="${p.id}"><td class="stt">${i + 1}</td><td><b>${esc(p.code)}</b></td><td>${esc(p.name)}</td><td class="wrap">${esc(p.address || '')}</td></tr>`).join('') || `<tr><td colspan="4"><div class="empty">${q ? 'Không có dự án khớp' : 'Chưa có dự án'}</div></td></tr>`}</tbody></table></div></div></div>`;
    const inp = $('#cq', main);
    inp.oninput = debounce(() => { s.q = inp.value; draw().then(() => { const i = $('#cq', main); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250);
  };
  ST.reload = draw;
  main.onclick = run(async e => {
    if (e.target.closest('#pjNew')) return openForm('project', { onSaved: () => draw() });
    const tr = e.target.closest('tr[data-p]'); if (tr) return openDetail('project', +tr.dataset.p);
  });
  await draw();
};

// Danh mục sản phẩm/căn hộ: nhóm theo dự án (trái), lưới căn nhóm theo tòa (phải)
// cột Danh mục sản phẩm theo đúng mẫu Excel «DM bảng hàng và sản phẩm» (bảng giá Bravo). Căn chưa có số Bravo → tách từ giá sau thuế (VAT 5%)
const PROD_COLS = [['code', 'Mã căn hộ'], ['name', 'Tên căn hộ'], ['area_xd', 'Diện tích xây dựng', 'num', 1], ['area_tt', 'Diện tích thông thủy', 'num', 1], ['base', 'Đơn giá nền', 'money'],
  ['pretax', 'Tổng tiền trước thuế', 'money', 1], ['vat', '% thuế', 'pct'], ['tax', 'Tổng tiền thuế', 'money', 1], ['after', 'Tổng giá trị sau thuế', 'money', 1], ['maint', 'Phí bảo trì 2%', 'money', 1],
  ['finish', 'Giá trị hoàn thiện căn hộ', 'money', 1], ['total', 'Tổng cộng', 'money', 1], ['project', 'Mã dự án'], ['door', 'Hướng cửa chính'], ['balcony', 'Hướng ban công'], ['kind', 'Loại căn hộ']];
function prodRow(u, pj) {
  const after = u.price_net ?? (u.total_price != null && u.maint_fee != null ? u.total_price - u.maint_fee - (u.finish_value || 0) : null);
  const vat = u.vat_pct ?? 5, pretax = u.pretax ?? (after != null ? Math.round(after / (1 + vat / 100)) : null);
  return { id: u.id, code: u.code, name: 'Căn hộ ' + u.code.split('-').slice(1).join('-'), area_xd: u.area_xd, area_tt: u.area_tt,
    base: u.base_price ?? (pretax != null && u.area_tt ? Math.round(pretax / u.area_tt) : null), pretax, vat, tax: u.tax_amt ?? (after != null && pretax != null ? after - pretax : null), after,
    maint: u.maint_fee, finish: u.finish_value, total: u.total_price, project: pj?.code || '', door: u.door_dir || '', balcony: u.balcony_dir || '',
    kind: u.bedrooms ? `${u.bedrooms} ngủ` : optL('unit', 'kind', u.kind) };
}
const prodCell = (r, [k, , t]) => t === 'money' ? fm(r[k]) : t === 'num' ? fnum(r[k]) : t === 'pct' ? (r[k] != null ? fnum(r[k]) + '%' : '') : esc(r[k] ?? '');
V.products = async (main, params) => {
  const s = ST.prod ||= { project: '', building: '', q: '', st: '', shut: new Set() };
  if (params.project) s.project = params.project;
  const ue = M.ents.unit.perm;
  const draw = async () => {
    const d = await catalogData(), q = s.q.trim().toLowerCase();
    const base = d.units.filter(u => (!s.project || u.project_id === +s.project) && (!s.building || u.building_id === +s.building));
    const us = base.filter(u => unitMatch(u, q) && (!s.st || u.status === s.st));
    const cnt = {}; base.forEach(u => cnt[u.status] = (cnt[u.status] || 0) + 1);
    const groups = d.buildings.filter(b => (!s.project || b.project_id === +s.project) && (!s.building || b.id === +s.building)).map(b => ({ b, pj: d.projects.find(p => p.id === b.project_id), us: us.filter(u => u.building_id === b.id) })).filter(g => g.us.length);
    const all = [];
    const sumTds = rs => PROD_COLS.slice(2).map(c => `<td class="${c[2] ? 'num' : ''}">${c[3] ? prodCell({ [c[0]]: rs.reduce((a, r) => a + (+r[c[0]] || 0), 0) }, c) : ''}</td>`).join('');
    const body = groups.map(({ b, pj, us: gu }) => {
      const rs = gu.map(u => prodRow(u, pj)), shut = s.shut.has(b.id); all.push(...rs);
      return `<tr class="pg" data-g="${b.id}"><td colspan="2"><i class="fa-solid fa-chevron-right tw-chev ${shut ? '' : 'on'}"></i><b>${esc(bName(b))}</b> <span class="muted">— ${esc(pj?.code || '')} · ${gu.length} căn</span></td>${sumTds(rs)}</tr>` +
        (shut ? '' : rs.map(r => `<tr data-u="${r.id}">${PROD_COLS.map((c, i) => `<td class="${c[2] ? 'num' : ''} ${i === 0 ? 'pi' : ''}">${prodCell(r, c)}</td>`).join('')}</tr>`).join(''));
    }).join('');
    main._rows = all;
    main.innerHTML = `<div class="page">${head('02', 'Danh mục sản phẩm/căn hộ', 'fa-door-open', `${M.imports.units ? `<button class="btn" id="pImp">${ico('fa-file-import')} Nhập bảng hàng</button>` : ''}${ue.x ? `<button class="btn" id="pXls">${ico('fa-file-excel')} Xuất Excel</button>` : ''}${ue.c ? `<button class="btn pri" id="pNew">${ico('fa-plus')} Tạo căn</button>` : ''}`, 'DA-01')}
      <div class="prod"><div class="card prod-nav"><div class="hd"><h3>${ico('fa-folder-tree')} Nhóm dữ liệu</h3></div><div class="pn">
        <a data-p="" class="${!s.project ? 'on' : ''}">${ico('fa-folder-open')} Tất cả dự án <small>${d.units.length}</small></a>
        ${d.projects.map(p => `<a data-p="${p.id}" class="${+s.project === p.id && !s.building ? 'on' : ''}">${ico(+s.project === p.id ? 'fa-folder-open' : 'fa-table-list')} ${esc(p.name)} <small>${p.units.length || ''}</small></a>` +
          (+s.project === p.id ? p.buildings.map(b => `<a data-bld="${b.id}" class="sub ${+s.building === b.id ? 'on' : ''}">${ico('fa-building')} ${esc(bName(b))} <small>${b.units.length || ''}</small></a>`).join('') || '<div class="sub muted small">Chưa có tòa</div>' : '')).join('')}</div></div>
      <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="pq" placeholder="Tìm mã căn, hướng, tòa…" value="${esc(s.q)}"></div>
        <select id="pst"><option value="">Mọi trạng thái</option>${Object.entries(USTAT).filter(([k]) => cnt[k]).map(([k, l]) => `<option value="${k}" ${s.st === k ? 'selected' : ''}>${l} (${cnt[k]})</option>`).join('')}</select>
        <span class="grow"></span><span class="small muted">${us.length} căn · ${groups.length} tòa</span></div>
      <div class="tbl-wrap"><table class="t prod-t grid-bravo"><thead><tr>${PROD_COLS.map(c => `<th class="${c[2] ? 'num' : ''}">${c[1]}</th>`).join('')}</tr></thead>
      <tbody>${body || `<tr><td colspan="${PROD_COLS.length}"><div class="empty">Không có căn nào${q || s.st ? ' khớp bộ lọc' : ''}</div></td></tr>`}</tbody>
      <tfoot><tr><td colspan="2">Tổng ${us.length} căn</td>${sumTds(all)}</tr></tfoot></table></div></div></div></div>`;
    const inp = $('#pq', main);
    inp.oninput = debounce(() => { s.q = inp.value; draw().then(() => { const i = $('#pq', main); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250);
    $('#pst', main).onchange = e => { s.st = e.target.value; draw(); };
  };
  ST.reload = draw;
  main.onclick = run(async e => {
    const bl = e.target.closest('[data-bld]'); if (bl) { s.building = s.building === bl.dataset.bld ? '' : bl.dataset.bld; return draw(); }
    const p = e.target.closest('[data-p]'); if (p) { s.building = ''; s.project = s.project === p.dataset.p ? '' : p.dataset.p; return draw(); }
    const g = e.target.closest('tr[data-g]'); if (g) { const id = +g.dataset.g; s.shut.has(id) ? s.shut.delete(id) : s.shut.add(id); return draw(); }
    const u = e.target.closest('tr[data-u]'); if (u) return openDetail('unit', +u.dataset.u);
    if (e.target.closest('#pNew')) return openForm('unit', { preset: { ...(s.project ? { project_id: +s.project } : {}), ...(s.building ? { building_id: +s.building } : {}) }, onSaved: () => draw() });
    if (e.target.closest('#pImp')) return importModal('units', draw);
    // xuất Excel đúng mẫu «DM bảng hàng và sản phẩm»
    if (e.target.closest('#pXls')) return download('/api/export-rows', { title: 'DM bảng hàng và sản phẩm', cols: PROD_COLS.map(c => [c[0], c[1], c[2] === 'pct' ? 'num' : c[2]]), rows: main._rows, sum: PROD_COLS.filter(c => c[3]).map(c => c[0]), file: 'DM_bang_hang_va_san_pham' });
  });
  await draw();
};

// tình trạng khách → màn nghiệp vụ liên quan (lọc sẵn theo tên khách)
// Danh mục khách hàng (kiểu Bravo): nhóm theo dự án (trái) — dự án quan tâm + dự án của căn đã giao dịch; lưới khách hàng (phải)
const PROSPECT = new Set(['moi', 'dang_cham_soc', 'hen_tham_quan', 'quan_tam_cao', 'khong_nhu_cau']);
V.customers = async (main, params) => {
  const s = ST.cust ||= { project: '', q: '', st: '' };
  if (params.project) s.project = params.project;
  const ce = M.ents.customer.perm;
  const CC = [['code', 'Mã'], ['full_name', 'Tên'], ['address', 'Địa chỉ'], ['phone', 'Điện thoại'], ['email', 'Email'], ['tax_code', 'Mã số thuế'], ['stage', 'Tình trạng']];   // như lưới Bravo, mã trước tên
  const draw = async () => {
    const get = async e => M.ents[e]?.perm.r ? (await api('GET', `/api/e/${e}?limit=20000${e === 'customer' ? '&group=sau_ban' : ''}`)).rows : [];   // 02 chỉ khách sau mở bán; khách tiềm năng ở 03
    const [cs, us, hd, gc, pj] = await Promise.all([get('customer'), get('unit'), get('contract'), get('reservation'), get('project')]);
    const unit = new Map(us.map(u => [u.id, u])), link = new Map();
    const add = (cid, uid) => { const u = unit.get(uid); if (!u) return; const l = link.get(cid) || link.set(cid, new Map()).get(cid); l.set(u.id, u); };
    hd.filter(c => !['huy', 'thanh_ly'].includes(c.status)).forEach(c => add(c.customer_id, c.unit_id));
    gc.filter(r => ['cho_duyet', 'giu_cho', 'qua_han', 'da_coc', 'chuyen_hd'].includes(r.status)).forEach(r => add(r.customer_id, r.unit_id));
    const rows = cs.map(c => { const ul = [...(link.get(c.id) || new Map()).values()]; return { ...c, ul, units: ul.map(u => u.code).join(', '), pids: new Set([...ul.map(u => u.project_id), c.interest_project].filter(Boolean)) }; })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));
    const q = s.q.trim().toLowerCase();
    const base = rows.filter(r => !s.project || r.pids.has(+s.project));
    const list = base.filter(r => (!s.st || r.stage === s.st) && (!q || `${r.full_name} ${r.code} ${r.units} ${r.phone || ''} ${r.address || ''} ${r.email || ''}`.toLowerCase().includes(q)));
    const cnt = {}; base.forEach(r => cnt[r.stage] = (cnt[r.stage] || 0) + 1);
    const stO = M.ents.customer.fields.find(f => f.k === 'stage').o.filter(o => !PROSPECT.has(o[0]));
    const cellOf = (r, k) => k === 'stage' ? esc(optL('customer', 'stage', r.stage)) : k === 'full_name' ? `${esc(r.full_name)}${r.is_demo ? ' <span class="tag demo">thử</span>' : ''}` : esc(r[k] || '');
    main.innerHTML = `<div class="page">${head('02', 'Danh mục khách hàng', 'fa-address-book', `${M.imports.customers ? `<button class="btn" id="kImp">${ico('fa-file-import')} Nhập Excel (Bravo)</button>` : ''}${ce.x ? `<button class="btn" id="kXls">${ico('fa-file-excel')} Xuất Excel</button>` : ''}${ce.c ? `<button class="btn pri" id="kNew">${ico('fa-plus')} Tạo khách hàng</button>` : ''}`, 'KH-01')}
      <div class="prod"><div class="card prod-nav"><div class="hd"><h3>${ico('fa-folder-tree')} Nhóm dữ liệu</h3></div><div class="pn">
        <a data-p="" class="${!s.project ? 'on' : ''}">${ico('fa-folder-open')} Tất cả khách hàng <small>${rows.length}</small></a>
        ${pj.map(p => { const n = rows.filter(r => r.pids.has(p.id)).length; return `<a data-p="${p.id}" class="${+s.project === p.id ? 'on' : ''}">${ico('fa-table-list')} ${esc(p.name)} <small>${n || ''}</small></a>`; }).join('')}</div></div>
      <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="kq" placeholder="Tìm tên, mã, căn, điện thoại, địa chỉ…" value="${esc(s.q)}"></div>
        <select id="kst"><option value="">Mọi tình trạng</option>${stO.filter(o => cnt[o[0]]).map(o => `<option value="${o[0]}" ${s.st === o[0] ? 'selected' : ''}>${esc(o[1])} (${cnt[o[0]]})</option>`).join('')}</select>
        <span class="grow"></span><span class="small muted">${list.length} khách hàng</span></div>
      <div class="tbl-wrap"><table class="t cust-t grid-bravo"><thead><tr>${CC.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
      <tbody>${list.map(r => `<tr data-c="${r.id}">${CC.map(([k]) => `<td class="${k === 'address' ? 'wrap' : ''}">${cellOf(r, k)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${CC.length}"><div class="empty">Không có khách hàng nào${q || s.st ? ' khớp bộ lọc' : ''}</div></td></tr>`}</tbody></table></div></div></div></div>`;
    const inp = $('#kq', main);
    inp.oninput = debounce(() => { s.q = inp.value; draw().then(() => { const i = $('#kq', main); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250);
    $('#kst', main).onchange = e => { s.st = e.target.value; draw(); };
    main._list = list;
  };
  ST.reload = draw;
  main.onclick = run(async e => {
    const p = e.target.closest('[data-p]'); if (p) { s.project = p.dataset.p; return draw(); }
    const tr = e.target.closest('tr[data-c]'); if (tr) return openDetail('customer', +tr.dataset.c);
    if (e.target.closest('#kNew')) return openForm('customer', { preset: { stage: 'da_nop_hsmn', ...(s.project ? { interest_project: +s.project } : {}) }, onSaved: row => { draw(); openDetail('customer', row.id); } });
    if (e.target.closest('#kImp')) return importModal('customers', draw);
    if (e.target.closest('#kXls')) return download('/api/export-rows', { title: 'Danh mục khách hàng', cols: CC.map(([k, l]) => [k === 'stage' ? 'stage_l' : k, l]), rows: main._list.map(r => ({ ...r, stage_l: optL('customer', 'stage', r.stage) })), file: 'danh_muc_khach_hang' });
  });
  await draw();
};

// Chi tiết bảng giá theo căn (giống «Chi tiết bảng giá» Bravo): trong ngăn chính sách và màn toàn trang
const SHEET_COLS = [['building', 'Tòa nhà'], ['code', 'Căn hộ'], ['floor', 'Tầng', 'int'], ['kind', 'Loại'], ['base', 'Đơn giá nền (đ/m²)', 'money'], ['area_xd', 'DT xây dựng', 'num'], ['area_tt', 'DT thông thủy', 'num'],
  ['before', 'Tổng tiền trước thuế', 'money'], ['vat', '% thuế', 'num'], ['tax', 'Tổng tiền thuế', 'money'], ['after', 'Tiền sau thuế', 'money'], ['pkg', 'Giá trị hoàn thiện', 'money'], ['maint', 'Phí bảo trì', 'money'], ['total', 'Tổng tiền', 'money'], ['status', 'Trạng thái']];
const SHEET_SUM = ['area_xd', 'area_tt', 'before', 'tax', 'after', 'pkg', 'maint', 'total'];
async function priceSheetInto(box, id, { full }) {
  const d = await api('GET', `/api/price-sheet/${id}`), pol = d.policy;
  const s = { q: '', b: '' }, blds = [...new Set(d.rows.map(r => r.building))];
  const canRes = M.ents.reservation.perm.c;
  const v = (r, [k, , t]) => k === 'kind' ? esc(optL('unit', 'kind', r.kind)) : k === 'status' ? pill(USTAT[r.status] || r.status, UST_C[r.status]) : k === 'vat' ? (r.vat ?? '') + '%' : t === 'money' ? fm(r[k]) : t === 'num' ? fnum(r[k]) : esc(r[k] ?? '');
  const draw = () => {
    const q = s.q.trim().toLowerCase(), rows = d.rows.filter(r => (!s.b || r.building === s.b) && (!q || r.code.toLowerCase().includes(q)));
    $('#shT', box).innerHTML = rows.length ? `<table class="t sheet-t"><thead><tr>${canRes ? '<th>Giữ chỗ</th>' : ''}${SHEET_COLS.map(c => `<th class="${c[2] ? 'num' : ''}">${c[1]}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr data-u="${r.unit_id}">${canRes ? `<td class="center">${r.status === 'con_ban' ? `<button class="btn sm ok" data-res="${r.unit_id}" data-code="${esc(r.code)}" title="Lập phiếu giữ chỗ">${ico('fa-play')}</button>` : ''}</td>` : ''}${SHEET_COLS.map(c => `<td class="${c[2] ? 'num' : ''} ${c[0] === 'vat' || c[0] === 'tax' ? 'tax' : ''}">${v(r, c)}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr>${canRes ? '<td></td>' : ''}${SHEET_COLS.map((c, i) => `<td class="${c[2] ? 'num' : ''}">${i === 0 ? `Tổng ${rows.length} căn` : SHEET_SUM.includes(c[0]) ? (c[2] === 'money' ? fm : fnum)(rows.reduce((a, r) => a + (+r[c[0]] || 0), 0)) : ''}</td>`).join('')}</tr></tfoot></table>`
      : '<div class="empty">Không có căn nào trong phạm vi chính sách</div>';
    $('#shN', box).textContent = `${rows.length} căn`;
    box._rows = rows;
  };
  box.innerHTML = `<div class="toolbar sheet-bar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="shQ" placeholder="Tìm mã căn…"></div>
    ${blds.length > 1 ? `<select id="shB"><option value="">Mọi tòa</option>${blds.map(b => `<option value="${esc(b)}">Tòa ${esc(b)}</option>`).join('')}</select>` : ''}
    <span class="grow"></span><span class="small muted" id="shN"></span>${!full ? `<a class="btn sm" href="#/v/pricesheet?id=${id}">${ico('fa-expand')} Mở toàn màn hình</a>` : ''}<button class="btn sm" id="shX">${ico('fa-file-excel')} Xuất Excel</button></div>
    <div class="src small">${ico('fa-circle-info')} ${esc(pol.project_code)} · nhóm căn ${esc(pol.unit_group || '*')} · ${pol.mode === 'don_gia' ? `đơn giá ${fm(pol.unit_price)} đ/m² thông thủy` : 'giá từng căn theo bảng hàng'} · VAT ${pol.vat_pct ?? 5}% — tiền trước thuế, tiền thuế và đơn giá nền tách ngược từ giá sau thuế</div>
    <div class="tbl-wrap" id="shT"></div>`;
  $('#shQ', box).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  $('#shB', box) && ($('#shB', box).onchange = e => { s.b = e.target.value; draw(); });
  $('#shX', box).onclick = () => download('/api/export-rows', { title: `Chi tiết bảng giá ${pol.code} v${pol.version}`, cols: SHEET_COLS.map(c => c[0] === 'kind' || c[0] === 'status' ? [c[0] + '_l', c[1]] : c),
    rows: box._rows.map(r => ({ ...r, kind_l: optL('unit', 'kind', r.kind), status_l: USTAT[r.status] || r.status })), sum: SHEET_SUM, file: 'bang_gia_' + pol.code });
  box.onclick = run(async e => {
    const b = e.target.closest('[data-res]');
    if (b) { e.stopPropagation(); return openForm('reservation', { title: `${ico('fa-hand-holding-hand')} Phiếu đăng ký căn hộ — ${esc(b.dataset.code)}`, preset: { unit_id: +b.dataset.res, unit_id__l: b.dataset.code }, onSaved: row => openDetail('reservation', row.id) }); }
    const tr = e.target.closest('tr[data-u]'); if (tr && full) location.hash = `#/v/unit360?id=${tr.dataset.u}`;
  });
  draw();
}
V.pricesheet = async (main, params) => {
  const g = await api('GET', `/api/e/price_policy/${params.id}`), r = g.row;
  main.innerHTML = `<div class="page">${head('02', `Chi tiết bảng giá — ${esc(r.code)} v${r.version}`, 'fa-tags', `<button class="btn" data-pol>${ico('fa-file-lines')} Thông tin chính sách</button><a class="btn" href="#/e/price_policy">${ico('fa-arrow-left')} Danh sách chính sách</a>`, 'DA-02')}
    <div class="card"><div id="shBox"><div class="empty">Đang tải…</div></div></div></div>`;
  main.onclick = e => { if (e.target.closest('[data-pol]')) openDetail('price_policy', r.id); };
  await priceSheetInto($('#shBox', main), r.id, { full: true });
};

// ======================= 03. TRA CỨU 360° =======================
V.lookup = async main => {
  main.innerHTML = `<div class="page">${head('03', 'Tra cứu hồ sơ 360°', 'fa-magnifying-glass')}<div class="card pad"><p class="muted" style="margin-top:0">Nhập mã căn, họ tên, số điện thoại, mã khách hàng hoặc số hợp đồng — mở toàn bộ giao dịch, hợp đồng, thanh toán, bàn giao, cấp sổ, CSKH.</p><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="lq" class="inp" style="width:100%;height:46px;font-size:16px" placeholder="VD: TNS-G-0205, 0391…, Nguyễn…"></div><div id="lr" class="mt"></div></div></div>`;
  const inp = $('#lq', main); inp.focus();
  inp.oninput = debounce(async () => {
    if (inp.value.trim().length < 2) return $('#lr', main).innerHTML = '';
    const r = await api('GET', '/api/search?q=' + encodeURIComponent(inp.value.trim()));
    $('#lr', main).innerHTML = r.length ? `<table class="t"><tbody>${r.map((x, i) => `<tr data-i="${i}"><td>${ico({ unit: 'fa-door-open', customer: 'fa-user', contract: 'fa-file-contract', ticket: 'fa-headset', reservation: 'fa-hand-holding-hand' }[x.type])}</td><td><b>${esc(x.title)}</b></td><td class="muted">${esc(x.sub)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Không tìm thấy</div>';
    $('#lr', main).onclick = e => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const x = r[+tr.dataset.i]; if (x.type === 'unit') location.hash = `#/v/unit360?id=${x.id}`; else if (x.type === 'customer') location.hash = `#/v/cust360?id=${x.id}`; else openDetail(x.type, x.id); };
  }, 250);
};
function miniTable(ent, rows, cols) {
  if (rows == null) return '<div class="muted small">Không có quyền xem</div>';
  if (!rows.length) return '<div class="muted small">Chưa có</div>';
  return `<div class="tbl-wrap"><table class="t compact" data-ent="${ent}"><thead><tr>${cols.map(k => `<th>${esc(colLabel(ent, k))}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr data-id="${r.id}">${cols.map(k => { const c = cell(ent, k, r); const lf = M.ents[ent].fields.find(x => x.k === k); return `<td class="${c.num ? 'num' : ''} ${lf?.t === 'long' ? 'wrap' : ''}">${c.html}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function wireMini(main) { main.onclick = e => { const tr = e.target.closest('table[data-ent] tbody tr[data-id]'); if (tr) openDetail(tr.closest('table').dataset.ent, +tr.dataset.id); const c = e.target.closest('[data-cust]'); if (c) location.hash = `#/v/cust360?id=${c.dataset.cust}`; }; }
V.unit360 = async (main, params) => {
  const d = await api('GET', `/api/unit360/${params.id}`), u = d.unit, uf = M.ents.unit.fields;
  const sec = (t, ent, rows, cols, icon) => `<div class="sec-title">${ico(icon)} ${t}${rows?.length ? ` <span class="tag">${rows.length}</span>` : ''}</div>${miniTable(ent, rows, cols)}`;
  const c = (d.contracts || []).find(x => !['huy', 'thanh_ly'].includes(x.status) && x.kind !== 'hoan_thien') || (d.contracts || [])[0];
  main.innerHTML = `<div class="page">${head('03', `Hồ sơ căn 360° — ${esc(u.code)}`, 'fa-building', `<a class="btn" href="#/v/board?project=${u.project_id}">${ico('fa-table-cells')} Bảng hàng</a><button class="btn" onclick="print()">${ico('fa-print')} In</button>`)}
    <div class="box360"><div class="card unit-card"><div class="small muted">${esc(u.project_code)} · ${esc(u.project_name)}</div><div class="big">${esc(u.code)}</div><div class="mb">${show(uf.find(f => f.k === 'status'), u)}${u.is_demo ? ' <span class="tag demo">thử</span>' : ''}</div>
      <dl class="kv" style="grid-template-columns:1fr 1fr"><div><dt>Tòa</dt><dd>${esc(u.building_name || u.building_code)}</dd></div><div><dt>Tầng</dt><dd>${u.floor}</dd></div><div><dt>Phòng ngủ</dt><dd>${u.bedrooms || ''}</dd></div><div><dt>DT thông thủy</dt><dd>${fnum(u.area_tt)} m²</dd></div><div><dt>Hướng</dt><dd>${esc(u.direction || '')}</dd></div><div><dt>Bàn giao dự kiến</dt><dd>${esc(u.handover_plan || '')}</dd></div><div class="wide"><dt>Tổng giá căn hộ</dt><dd><b>${fm(u.total_price)}</b> đ</dd></div></dl>
      <div class="sec-title">${ico('fa-user')} Khách hàng</div>${d.customers.map(k => `<div class="note" data-cust="${k.id}" style="cursor:pointer"><b>${esc(k.code)} · ${esc(k.full_name)}</b><br><small>${esc(k.phone || '')} ${k.email ? '· ' + esc(k.email) : ''}</small></div>`).join('') || '<div class="muted small">Chưa có</div>'}
      ${c?._debt ? `<div class="sec-title">${ico('fa-sack-dollar')} Công nợ ${esc(c.number)}</div><div class="small">Phải thu <b>${fm(c._debt.total)}</b> · đã thu <b>${fm(c._debt.paid)}</b> (${fnum(c._debt.paid_pct)}%)<br>Còn <b>${fm(c._debt.left)}</b>${c._debt.overdue ? ` · <span class="neg">quá hạn ${fm(c._debt.overdue)} (${c._debt.overdue_days} ngày)</span>` : ''}</div><div class="bar"><i class="sage" style="width:${c._debt.paid_pct}%"></i></div>` : ''}
      <div class="sec-title">${ico('fa-folder-open')} Tệp hồ sơ</div>${d.files.length ? d.files.map(f => `<a class="small" style="display:block;padding:3px 0" href="/api/file/${f.id}" target="_blank">${ico('fa-file-pdf')} ${esc(f.name)}</a>`).join('') : '<div class="muted small">Chưa có</div>'}
    </div><div class="card pad">
      ${sec('Giao dịch – giữ chỗ', 'reservation', d.reservations, ['code', 'cust_name', 'reg_at', 'price', 'deposit', 'reg_state', 'progress'], 'fa-hand-holding-hand')}
      ${sec('Hợp đồng', 'contract', d.contracts, ['number', 'kind', 'customer_id', 'value', 'signed_on', 'status'], 'fa-file-contract')}
      ${c?._debt?.inst?.length ? `<div class="sec-title">${ico('fa-calendar-check')} Lịch thanh toán ${esc(c.number)}</div>${schedTable(c._debt.inst, true)}` : ''}
      ${sec('Chứng từ thu (Bravo)', 'receipt', d.receipts, ['voucher_date', 'voucher_no', 'amount', 'content', 'status'], 'fa-receipt')}
      ${sec('Điều chỉnh – phụ lục', 'contract_change', d.changes, ['code', 'kind', 'value_after', 'appendix_no', 'status'], 'fa-file-pen')}
      ${sec('Nhắc nợ – cam kết', 'debt_call', d.calls, ['at', 'result', 'promise_amount', 'promise_on', 'promise_st'], 'fa-phone-volume')}
      ${sec('Kế hoạch thu', 'collect_plan', d.plans, ['month', 'expected', 'expected_on', 'actual', 'gap', 'status'], 'fa-chart-line')}
      ${sec('Hồ sơ NOXH', 'noxh_check', d.noxh, ['customer_id', 'grp', 'items', 'result', 'status'], 'fa-list-check')}
      ${sec('Bàn giao', 'handover', d.handover, ['plan_at', 'confirm', 'defects_open', 'status'], 'fa-key')}
      ${sec('Tồn tại sau bàn giao', 'defect', d.defects, ['category', 'descr', 'contractor', 'due_on', 'status'], 'fa-screwdriver-wrench')}
      ${sec('Cấp sổ hồng', 'pinkbook', d.pinkbook, ['items', 'received_on', 'submit_on', 'days_in', 'days_out', 'status'], 'fa-book')}
      ${sec('CSKH – phản ánh, khiếu nại', 'ticket', d.tickets, ['code', 'kind', 'priority', 'sla', 'status'], 'fa-headset')}
      ${sec('Hoa hồng đại lý', 'commission', d.commissions, ['code', 'agent_id', 'amount', 'status'], 'fa-handshake')}
      <div class="sec-title">${ico('fa-clock-rotate-left')} Dòng thời gian</div><div class="tl">${d.timeline.map(a => `<div><b>${esc(M.ents[a.ent]?.title || a.ent)}</b> — ${esc(actLabel(a.action, a.ent))}<br><small>${esc(a.who || 'Hệ thống')} · ${dmyhm(a.at)}${a.note ? ' · ' + esc(a.note) : ''}</small></div>`).join('')}</div>
    </div></div></div>`;
  wireMini(main);
};
V.cust360 = async (main, params) => {
  const d = await api('GET', `/api/customer360/${params.id}`), k = d.customer, cf = M.ents.customer.fields;
  const sec = (t, ent, rows, cols, icon) => `<div class="sec-title">${ico(icon)} ${t}${rows?.length ? ` <span class="tag">${rows.length}</span>` : ''}</div>${miniTable(ent, rows, cols)}`;
  main.innerHTML = `<div class="page">${head('03', `Hồ sơ khách hàng 360° — ${esc(k.full_name)}`, 'fa-id-card', `<button class="btn" id="kEdit">${ico('fa-pen')} Mở hồ sơ</button><button class="btn pri" id="kLog">${ico('fa-comment-medical')} Ghi tư vấn</button>`)}
    <div class="box360"><div class="card unit-card"><div class="small muted">${esc(k.code)}</div><div class="big" style="font-size:21px">${esc(k.full_name)}</div><div class="mb">${show(cf.find(f => f.k === 'kind'), k)} ${show(cf.find(f => f.k === 'stage'), k)}</div>
      <dl class="kv" style="grid-template-columns:1fr">${['phone', 'email', 'address', 'source', 'id_no', 'owner_id', 'need'].map(x => cf.find(f => f.k === x)).map(f => `<div><dt>${esc(f.l)}</dt><dd>${show(f, k)}</dd></div>`).join('')}</dl></div>
    <div class="card pad">${sec('Hợp đồng', 'contract', d.contracts, ['number', 'unit_id', 'value', 'paid', 'signed_on', 'status'], 'fa-file-contract')}
      ${(d.contracts || []).filter(c => c._debt?.total).map(c => `<div class="small mt">${esc(c.number)}: đã thu ${fm(c._debt.paid)} / ${fm(c._debt.total)} (${fnum(c._debt.paid_pct)}%)${c._debt.overdue ? ` · <span class="neg">quá hạn ${fm(c._debt.overdue)}</span>` : ''}</div>`).join('')}
      ${sec('Giao dịch – giữ chỗ', 'reservation', d.reservations, ['code', 'unit_id', 'reg_at', 'price', 'reg_state', 'progress'], 'fa-hand-holding-hand')}
      ${sec('Lịch sử tư vấn – liên hệ', 'contact_log', d.logs, ['at', 'channel', 'content', 'result', 'next_at', 'owner_id'], 'fa-comments')}
      ${sec('Hồ sơ NOXH', 'noxh_check', d.noxh, ['unit_id', 'grp', 'items', 'result', 'status'], 'fa-list-check')}
      ${sec('Cấp sổ hồng', 'pinkbook', d.pinkbook, ['unit_id', 'items', 'submit_on', 'status'], 'fa-book')}
      ${sec('CSKH', 'ticket', d.tickets, ['code', 'kind', 'content', 'status'], 'fa-headset')}</div></div></div>`;
  wireMini(main);
  $('#kEdit', main).onclick = () => openDetail('customer', k.id);
  $('#kLog', main).onclick = () => openForm('contact_log', { preset: { customer_id: k.id, customer_id__l: `${k.code} · ${k.full_name}` }, onSaved: () => route() });
};

// ======================= 05. LỊCH KÝ / KHO HỒ SƠ =======================
V.signing = async main => {
  const f = filt();
  const draw = async () => {
    const d = await api('GET', '/api/signing?' + qsOf({ project: f.project }));
    const t = today(), groups = {}; d.rows.forEach(r => (groups[r.plan_sign || 'Chưa hẹn'] ||= []).push(r));
    const ss = M.ents.contract.fields.find(x => x.k === 'sign_status'), cs = M.ents.contract.fields.find(x => x.k === 'status');
    main.innerHTML = `<div class="page">${head('05', 'Lịch ký hợp đồng', 'fa-calendar-days', '', '5.5')}${filterBar(f, { period: false, building: false })}
      <div class="grid g3">${Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).map(([dte, rs]) => `<div class="card"><div class="hd"><h3>${ico('fa-calendar-day')} ${dte === 'Chưa hẹn' ? dte : dmy(dte)}</h3><span class="grow"></span>${dte !== 'Chưa hẹn' && dte < t ? pill('Quá ngày dự kiến', 'r') : dte === t ? pill('Hôm nay', 'a') : ''}</div>${rs.map(r => `<div class="alert-row" data-id="${r.id}"><span class="lv ${dte < t ? 'r' : 'b'}"></span><div class="tx"><b>${esc(r.number)}</b> · ${esc(r.unit)} · ${esc(r.customer)}<small>${show(cs, r)} ${show(ss, r)} · ${esc(r.owner || '')} ${r.sign_place ? '· ' + esc(r.sign_place) : ''}</small></div></div>`).join('')}</div>`).join('') || '<div class="card pad"><div class="empty">Không có hợp đồng chờ ký</div></div>'}</div>
      <div class="card mt"><div class="hd"><h3>${ico('fa-signature')} Đã ký 30 ngày gần đây</h3></div>${rowsTable([['signed_on', 'Ngày ký', 'date'], ['number', 'Số HĐ'], ['unit', 'Căn'], ['customer', 'Khách hàng']], d.recent.map(r => ({ ...r, _ent: ['contract', r.id] })))}</div></div>`;
    wireFilter(main, f, draw);
    main.onclick = e => { const r = e.target.closest('[data-id]'); if (r) return openDetail('contract', +r.dataset.id); const tr = e.target.closest('tr[data-i]'); if (tr) openRow(d.recent.map(r => ({ _ent: ['contract', r.id] }))[+tr.dataset.i]); };
  };
  await draw();
};
V.vault = async main => {
  let q = '', ent = '';
  const draw = async () => {
    const rows = await api('GET', '/api/vault?' + qsOf({ q, ent }));
    const ents = [...new Set(['contract', 'contract_change', 'reservation', 'pinkbook', 'handover', 'defect', 'noxh_check', 'refund', 'cancel_req', 'ticket', 'price_policy'])].filter(k => M.ents[k]?.perm.r);
    $('#vt', main).innerHTML = rows.length ? `<table class="t"><thead><tr><th>Tệp</th><th>Loại</th><th>Hồ sơ</th><th>Mã căn</th><th>Khách hàng</th><th>Người tải</th><th>Ngày</th></tr></thead><tbody>${rows.map(r => `<tr data-f="${r.id}" data-e="${r.ent}" data-r="${r.rec_id}"><td>${ico('fa-file-pdf')} ${esc(r.name)}${r.version > 1 ? ` <span class="tag">v${r.version}</span>` : ''}</td><td>${esc(r.kind_l)}</td><td>${esc(r.ent_l)} · ${esc(r.label || '')}</td><td>${esc(r.unit || '')}</td><td>${esc(r.customer || '')}</td><td>${esc(r.by || '')}</td><td>${dmy(r.uploaded_at)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Không có tệp</div>';
    if (!$('#ve', main).options.length) $('#ve', main).innerHTML = '<option value="">Mọi loại hồ sơ</option>' + ents.map(k => `<option value="${k}">${esc(M.ents[k].title)}</option>`).join('');
  };
  main.innerHTML = `<div class="page">${head('05', 'Lưu trữ hồ sơ pháp lý', 'fa-folder-tree', '', '5.6')}<div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="vq" placeholder="Tìm tên tệp, mã căn, khách hàng…"></div><select id="ve"></select><span class="grow"></span><span class="small muted">Bấm dòng để mở hồ sơ gốc · tệp mở trong tab mới</span></div><div class="tbl-wrap" id="vt"></div></div></div>`;
  $('#vq', main).oninput = debounce(e => { q = e.target.value; draw(); }, 300);
  $('#ve', main).onchange = e => { ent = e.target.value; draw(); };
  main.onclick = e => { const tr = e.target.closest('tr[data-f]'); if (!tr) return; if (e.target.closest('td:first-child')) window.open('/api/file/' + tr.dataset.f, '_blank'); else openDetail(tr.dataset.e, +tr.dataset.r, 'files'); };
  await draw();
};

// ======================= 06. SỔ CÔNG NỢ =======================
V.ledger = async main => {
  const f = filt(); const s = ST.ledger ||= { filter: '', q: '' };
  const draw = async () => {
    main.innerHTML = `<div class="page">${head('06', 'Sổ công nợ chi tiết căn hộ', 'fa-book-open', `<button class="btn" id="lx">${ico('fa-file-excel')} Xuất Excel</button><a class="btn" href="#/e/collect_plan">${ico('fa-chart-line')} Kế hoạch thu</a>`, 'CN-01')}${filterBar(f, { period: false })}<div id="lg"><div class="empty">Đang tính công nợ…</div></div></div>`;
    wireFilter(main, f, draw);
    const d = await api('GET', '/api/ledger?' + qsOf({ project: f.project, building: f.building, filter: s.filter, q: s.q }));
    $('#srcLine', main).innerHTML = `<span>${ico('fa-database')} Thực thu đồng bộ Bravo${d.bravo_sync ? ' — chốt ' + dmyhm(d.bravo_sync) : ''}</span><span>Phải thu = lịch thanh toán hiệu lực (gồm phụ lục)</span>`;
    const T = d.totals;
    const cols = [['project', 'Dự án'], ['building', 'Tòa'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['number', 'Số HĐ'], ['total', 'Phải thu', 'money'], ['paid', 'Đã thu', 'money'], ['paid_pct', '% thu', 'num'], ['left', 'Còn phải thu', 'money'], ['due', 'Đến hạn chưa thu', 'money'], ['overdue', 'Quá hạn', 'money'], ['overdue_days', 'Ngày quá hạn', 'int'], ['next_due', 'Kỳ tới', 'date'], ['promise', 'Cam kết'], ['plan_expected', 'KH tháng này', 'money'], ['owner', 'Phụ trách']];
    $('#lg', main).innerHTML = `<div class="grid g5 mb">${[['Phải thu', T.total], ['Đã thu (Bravo)', T.paid], ['Còn phải thu', T.left], ['Nợ quá hạn', T.overdue, 1], ['Đến hạn 7 ngày', T.due7]].map(([l, v, red]) => `<div class="card kpi ${red && v ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:20px">${fmB(v || 0)}</div><div class="s">${fm(v || 0)} đ</div></div>`).join('')}</div>
      <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="lq" placeholder="Mã căn, khách hàng, số HĐ…" value="${esc(s.q)}"></div><span class="grow"></span><span class="small muted">${d.rows.length} hợp đồng</span></div>
      <div class="tabs">${[['', 'Tất cả'], ['overdue', 'Có nợ quá hạn'], ['due7', 'Đến hạn ≤ 7 ngày'], ['noplan', 'Còn nợ, chưa có kế hoạch tháng'], ['left', 'Còn nợ'], ['done', 'Đã thu đủ']].map(([k, l]) => `<button data-fl="${k}" class="${s.filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>${rowsTable(cols, d.rows, ['total', 'paid', 'left', 'due', 'overdue', 'plan_expected'])}</div>`;
    $('#lq', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 400);
    main.onclick = e => { const t = e.target.closest('[data-fl]'); if (t) { s.filter = t.dataset.fl; return draw(); } const tr = e.target.closest('tr[data-i]'); if (tr) ledgerRow(d.rows[+tr.dataset.i]); };
    $('#lx', main).onclick = () => download('/api/export-rows', { title: 'CN-01 Sổ công nợ chi tiết căn hộ', cols, rows: d.rows, sum: ['total', 'paid', 'left', 'due', 'overdue'], note: `Thực thu Bravo chốt ${d.bravo_sync ? dmyhm(d.bravo_sync) : ''} · xuất ${dmyhm(new Date().toISOString())}`, file: 'So_cong_no' });
  };
  await draw();
};
function ledgerRow(r) {
  const m = modal({ title: `${esc(r.unit)} · ${esc(r.customer)}`, narrow: true, body: `<div class="small mb">${esc(r.number)} · còn phải thu <b>${fm(r.left)}</b>${r.overdue ? ` · <span class="neg">quá hạn ${fm(r.overdue)} (${r.overdue_days} ngày)</span>` : ''}<br>Lần gọi gần nhất: ${r.last_call ? dmy(r.last_call) + ' — ' + esc(r.last_result || '') : 'chưa có'}${r.promise ? '<br>Cam kết: ' + esc(r.promise) : ''}</div>
    <div class="col"><button class="btn" data-a="open">${ico('fa-file-contract')} Mở hợp đồng & lịch thanh toán</button>${M.ents.debt_call.perm.c ? `<button class="btn" data-a="call">${ico('fa-phone-volume')} Ghi nhắc nợ / cam kết</button>` : ''}${M.ents.collect_plan.perm.c ? `<button class="btn" data-a="plan">${ico('fa-chart-line')} Thêm vào kế hoạch thu</button>` : ''}<button class="btn" data-a="u360">${ico('fa-building')} Hồ sơ căn 360°</button></div>` });
  m.body.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; m.close();
    if (a === 'open') openDetail('contract', r.contract_id, 'debt');
    if (a === 'call') openForm('debt_call', { preset: { contract_id: r.contract_id, contract_id__l: r.number }, onSaved: () => route() });
    if (a === 'plan') openForm('collect_plan', { preset: { contract_id: r.contract_id, contract_id__l: r.number, month: today().slice(0, 7), expected: r.due || r.next_amt, expected_on: r.next_due && r.next_due.slice(0, 7) === today().slice(0, 7) ? r.next_due : today(), basis: 'lich_hd' }, onSaved: () => route() });
    if (a === 'u360') location.hash = `#/v/unit360?id=${r.unit_id}`;
  };
}

// ======================= 07. CĂN ĐỦ ĐIỀU KIỆN BÀN GIAO =======================
V.ready = async main => {
  const f = filt(); const sel = new Set();
  const draw = async () => {
    const rows = await api('GET', '/api/ready?' + qsOf({ project: f.project, building: f.building }));
    main.innerHTML = `<div class="page">${head('07', 'Căn đủ điều kiện bàn giao', 'fa-clipboard-check', M.ents.handover.perm.c ? `<button class="btn pri" id="mk">${ico('fa-calendar-plus')} Lập kế hoạch bàn giao cho căn đã chọn</button>` : '', '7.1')}${filterBar(f, { period: false })}
      <div class="card"><div class="toolbar"><span class="small muted">Điều kiện: hợp đồng đã ký · đã thu ≥ ${rows[0]?.pct ?? 95}% và không còn nợ quá hạn · kỹ thuật đã nghiệm thu (tích khi lập kế hoạch). Ngưỡng sửa ở Quản trị › Danh mục.</span></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th></th><th>Mã căn</th><th>Khách hàng</th><th>Số HĐ</th><th>ĐK hợp đồng</th><th class="num">Đã thu</th><th>ĐK thanh toán</th><th>Kế hoạch</th><th>Phụ trách</th></tr></thead><tbody>${rows.map(r => `<tr data-u="${r.unit_id}"><td>${!r.handover_id && r.cond_pay ? `<input type="checkbox" data-s="${r.unit_id}">` : ''}</td><td><b>${esc(r.unit)}</b></td><td>${esc(r.customer)}</td><td>${esc(r.number)}</td><td>${pill('Đã ký', 'g')}</td><td class="num">${fnum(r.paid_pct)}%</td><td>${r.cond_pay ? pill('Đạt', 'g') : pill(r.overdue ? `Còn quá hạn ${fmB(r.overdue)}` : 'Chưa đủ tỷ lệ', 'r')}</td><td>${r.handover_id ? pill(r.handover_status, 'b') : r.cond_pay ? pill('Chưa lập', 'a') : '—'}</td><td>${esc(r.owner || '')}</td></tr>`).join('')}</tbody></table></div></div></div>`;
    wireFilter(main, f, draw);
    main.onclick = run(async e => {
      if (e.target.dataset.s) { e.target.checked ? sel.add(+e.target.dataset.s) : sel.delete(+e.target.dataset.s); return; }
      if (e.target.closest('#mk')) { if (!sel.size) return toast('Chọn căn đủ điều kiện', true); const r = await api('POST', '/api/handover/create', { unit_ids: [...sel], cond_tech: true }); toast(`Đã lập ${r.ok} kế hoạch${r.errors.length ? ' · lỗi: ' + r.errors.join('; ') : ''}`, !!r.errors.length); sel.clear(); return draw(); }
      const tr = e.target.closest('tr[data-u]'); if (tr && !e.target.matches('input')) { const r = rows.find(x => x.unit_id === +tr.dataset.u); if (r.handover_id) openDetail('handover', r.handover_id); else location.hash = `#/v/unit360?id=${r.unit_id}`; }
    });
  };
  await draw();
};

// ======================= 11. BÁO CÁO =======================
V.reports = async (main, params) => {
  const f = filt(); let kind = params.k || 'sales', group = 'building';
  const draw = async () => {
    main.innerHTML = `<div class="page">${head('11', 'Báo cáo quản trị', 'fa-chart-pie', `<button class="btn" id="rx">${ico('fa-file-excel')} Xuất Excel</button><button class="btn" onclick="print()">${ico('fa-print')} In / PDF</button>`)}${filterBar(f)}
      <div class="card"><div class="tabs">${Object.entries(M.reports).map(([k, l]) => `<button data-k="${k}" class="${kind === k ? 'on' : ''}">${esc(l.replace('Báo cáo ', ''))}</button>`).join('')}</div><div id="rb" class="bd"><div class="empty">Đang tổng hợp…</div></div></div></div>`;
    wireFilter(main, f, draw);
    const r = await api('GET', `/api/report/${kind}?${qsOf({ ...f, group })}`);
    $('#srcLine', main).innerHTML = `<span>${ico('fa-clock')} Tổng hợp ${dmyhm(r.generated_at)}</span>${r.bravo_sync ? `<span>${ico('fa-database')} Bravo chốt ${dmyhm(r.bravo_sync)}</span>` : ''}`;
    $('#rb', main).innerHTML = `<div class="row mb"><h3>${esc(r.title)}</h3><span class="tag">${mmy(r.period.from)} → ${mmy(r.period.to)}</span>${r.groups ? `<span class="grow"></span><span class="small muted">Nhóm theo</span><select class="inp" id="rg">${r.groups.map(g => `<option value="${g}" ${g === group ? 'selected' : ''}>${{ building: 'Dự án · tòa', project: 'Dự án', owner: 'Nhân viên', agent: 'Đại lý / CTV' }[g]}</option>`).join('')}</select>` : ''}</div>${rowsTable(r.cols, r.rows, r.sum, { click: false })}`;
    $('#rg', main) && ($('#rg', main).onchange = e => { group = e.target.value; draw(); });
    main.onclick = e => { const t = e.target.closest('[data-k]'); if (t) { kind = t.dataset.k; group = 'building'; draw(); } };
    $('#rx', main).onclick = () => download('/api/export-rows', { title: r.title, cols: r.cols, rows: r.rows, sum: r.sum, note: `Kỳ ${mmy(r.period.from)} – ${mmy(r.period.to)} · tổng hợp ${dmyhm(r.generated_at)}`, file: kind });
  };
  await draw();
};
function reportSnapshot(d) {
  return `<div class="src mb">${ico('fa-lock')} Số liệu tại thời điểm tổng hợp ${dmyhm(d.generated_at)} — kỳ ${mmy(d.period)}${d.bravo_sync ? ` · Bravo chốt ${dmyhm(d.bravo_sync)}` : ''}</div>
    <table class="t compact noclick"><thead><tr><th>Chỉ tiêu</th><th class="num">Giá trị</th><th>Nguồn</th></tr></thead><tbody>${d.kpi.map(([l, v, t, src]) => `<tr><td>${esc(l)}</td><td class="num"><b>${t === 'money' ? fm(v) : v}</b></td><td class="small muted">${esc(src)}</td></tr>`).join('')}</tbody></table>
    <div class="sec-title">Theo tòa</div>${rowsTable([['project', 'Dự án'], ['building', 'Tòa'], ['total', 'Tổng', 'int'], ['con_ban', 'Còn bán', 'int'], ['giu_cho', 'Giữ chỗ', 'int'], ['da_ky', 'Đã ký', 'int'], ['da_ban_giao', 'Đã BG', 'int'], ['rate', 'Tiêu thụ %', 'num']], d.byBuilding, null, { click: false })}
    <div class="sec-title">Tồn đọng trọng yếu</div>${rowsTable([['0', 'Nhóm'], ['1', 'Số việc', 'int']], d.backlog.map(x => ({ 0: x[0], 1: x[1] })), null, { click: false })}
    <div class="sec-title">Khách hàng nợ quá hạn lớn nhất</div>${rowsTable([['unit', 'Căn'], ['customer', 'Khách hàng'], ['overdue', 'Quá hạn', 'money'], ['days', 'Số ngày', 'int'], ['owner', 'Phụ trách']], d.overdue_top, ['overdue'], { click: false })}`;
}

// ======================= 12. QUẢN TRỊ =======================
V.users = async main => {
  const draw = async () => {
    const [us, mx] = await Promise.all([api('GET', '/api/users'), api('GET', '/api/perm-matrix')]);
    main.innerHTML = `<div class="page">${head('12', 'Tài khoản – phân quyền', 'fa-users-gear', `${M.imports.users ? `<button class="btn" id="uImp">${ico('fa-file-import')} Nhập danh sách</button>` : ''}<button class="btn pri" id="uNew">${ico('fa-user-plus')} Thêm tài khoản</button>`, '12.1')}
      <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Chức danh</th><th>Điện thoại</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th><th></th></tr></thead><tbody>${us.map(u => `<tr data-id="${u.id}"><td><b>${esc(u.username)}</b>${u.is_trial ? ' <span class="tag demo">thử</span>' : ''}</td><td>${esc(u.full_name)}</td><td>${esc(roleName(u.role))}</td><td class="small">${esc(u.title || '')}</td><td>${esc(u.phone || '')}</td><td>${dmyhm(u.last_login)}</td><td>${u.active ? (u.must_change ? pill('Chờ đổi mật khẩu', 'a') : pill('Hoạt động', 'g')) : pill('Đã khóa', 's')}</td><td class="nowrap"><button class="btn sm" data-e="${u.id}">${ico('fa-pen')}</button> <button class="btn sm" data-r="${u.id}" title="Đặt lại mật khẩu">${ico('fa-key')}</button></td></tr>`).join('')}</tbody></table></div></div>
      ${us.some(u => u.is_trial && u.active) ? `<div class="warnbar mt">${ico('fa-flask')}<span>Đang có ${us.filter(u => u.is_trial && u.active).length} tài khoản thử. Trước khi vận hành thật: tạo tài khoản cho nhân viên, sau đó khóa tài khoản thử. <button class="btn sm" id="offTrial">Khóa tất cả tài khoản thử</button></span></div>` : ''}
      <div class="card mt"><div class="hd"><h3>${ico('fa-table')} Ma trận phân quyền theo vai trò</h3><span class="grow"></span><span class="small muted">R xem · C tạo · U sửa · A phê duyệt · X xuất dữ liệu</span></div><div class="tbl-wrap"><table class="t compact noclick"><thead><tr><th>Phân hệ</th><th>Chức năng</th>${M.roles.map(r => `<th class="center" title="${esc(r[2])}">${esc(r[1].replace('Nhân viên ', 'NV ').replace('Trưởng phòng Kinh doanh', 'TP KD').replace('Chủ tịch / Ban lãnh đạo', 'Lãnh đạo').replace('Quản trị hệ thống', 'Quản trị'))}</th>`).join('')}</tr></thead><tbody>${mx.sort((a, b) => a.mod.localeCompare(b.mod)).map(x => `<tr><td>${x.mod}</td><td>${esc(x.title)}${x.code ? ` <span class="tag">${x.code}</span>` : ''}</td>${M.roles.map(r => `<td class="center mono small">${x.roles[r[0]] ? `<b style="color:var(--cobalt)">${x.roles[r[0]].toUpperCase()}</b>` : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></div>`;
    main.onclick = run(async e => {
      if (e.target.closest('#uNew')) return userForm();
      if (e.target.closest('#uImp')) return importModal('users', draw);
      if (e.target.closest('#offTrial')) { if (!await ask('Khóa tài khoản thử', 'Khóa toàn bộ tài khoản thử? (Không khóa tài khoản đang đăng nhập.)', { danger: 1, okLabel: 'Khóa' })) return; for (const u of us.filter(u => u.is_trial && u.active && u.id !== M.me.id)) await api('PUT', `/api/users/${u.id}`, { active: false }); toast('Đã khóa tài khoản thử'); return draw(); }
      const ed = e.target.closest('[data-e]'); if (ed) return userForm(us.find(u => u.id === +ed.dataset.e));
      const rs = e.target.closest('[data-r]'); if (rs) { if (!await ask('Đặt lại mật khẩu', 'Đặt lại về mật khẩu mặc định? Người dùng phải đổi khi đăng nhập.')) return; const r = await api('POST', `/api/users/${rs.dataset.r}/reset`, {}); toast('Mật khẩu mới: ' + r.pw); }
    });
  };
  const userForm = u => {
    const F = [{ k: 'username', l: 'Tên đăng nhập', t: 'text', req: 1, help: 'chữ không dấu, số, dấu chấm' }, { k: 'full_name', l: 'Họ tên', t: 'text', req: 1 }, { k: 'role', l: 'Vai trò', t: 'sel', req: 1, o: M.roles.map(r => [r[0], r[1]]) }, { k: 'title', l: 'Chức danh', t: 'text' }, { k: 'dept', l: 'Bộ phận', t: 'text' }, { k: 'phone', l: 'Điện thoại', t: 'text' }, { k: 'email', l: 'Email', t: 'text' }, ...(u ? [{ k: 'active', l: 'Đang hoạt động', t: 'bool' }] : [])];
    const m = modal({ title: u ? 'Sửa tài khoản' : 'Thêm tài khoản nhân viên', body: `<div id="uerr"></div><form class="form">${F.map(f => `<div class="fld"><label>${f.l}${f.req ? '<span class="req">*</span>' : ''}</label>${u && f.k === 'username' ? `<div class="ro">${esc(u.username)}</div>` : input(f, u?.[f.k] ?? (f.k === 'dept' ? 'Phòng Kinh doanh' : null))}${f.help ? `<div class="help">${f.help}</div>` : ''}</div>`).join('')}</form>${u ? '' : '<div class="small muted mt">Mật khẩu ban đầu là mật khẩu mặc định; nhân viên phải đổi ở lần đăng nhập đầu.</div>'}`,
      foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="uOk">Lưu</button>` });
    $('#uOk', m.el).onclick = async () => { const form = $('form', m.el), d = {}; for (const f of F) if (!(u && f.k === 'username')) d[f.k] = readField(form, f); try { u ? await api('PUT', `/api/users/${u.id}`, d) : await api('POST', '/api/users', d); m.close(); toast('Đã lưu'); M.users = (await api('GET', '/api/meta')).users; draw(); } catch (e) { $('#uerr', m.el).innerHTML = `<div class="errbar">${esc(e.message)}</div>`; } };
  };
  await draw();
};
V.catalog = async main => {
  const [lk] = await Promise.all([api('GET', '/api/lookups')]);
  const CAT = { nguon_khach: 'Nguồn khách hàng', kenh: 'Kênh liên hệ', nhom_noxh: 'Nhóm đối tượng NOXH', hang_muc: 'Hạng mục tồn tại', bo_phan: 'Bộ phận xử lý' };
  const SETS = [['checklist_noxh', 'Checklist hồ sơ mua NOXH (theo quy định hiện hành)', 'lines_all'], ['checklist_so_hong', 'Checklist hồ sơ cấp sổ', 'lines'], ['checklist_ban_giao', 'Hồ sơ bàn giao (ghi «(bắt buộc)» cho mục bắt buộc)', 'lines'], ['handover_pay_pct', 'Ngưỡng thanh toán đủ điều kiện bàn giao (%)', 'num'], ['sla_hours', 'SLA phản hồi CSKH (giờ) — khẩn / cao / thường', 'sla']];
  main.innerHTML = `<div class="page">${head('12', 'Danh mục dùng chung', 'fa-list', '', '12.2')}<div class="grid g2">
    ${Object.entries(CAT).map(([c, l]) => `<div class="card"><div class="hd"><h3>${esc(l)}</h3><span class="grow"></span><button class="btn sm pri" data-save="${c}">Lưu</button></div><div class="bd"><div class="small muted mb">Mỗi dòng: <b>mã | tên</b>. Bỏ dòng = ngừng dùng (mã đã dùng vẫn giữ trong dữ liệu cũ).</div><textarea class="inp" style="width:100%;height:150px;padding:8px" data-cat="${c}">${lk.filter(x => x.cat === c && x.active).map(x => `${x.value} | ${x.label}`).join('\n')}</textarea></div></div>`).join('')}
    ${SETS.map(([k, l, t]) => { const v = M.settings[k]; const txt = t === 'lines_all' ? (v?._all || []).join('\n') : t === 'lines' ? (v || []).join('\n') : t === 'num' ? v : t === 'sla' ? `${v?.khan ?? 24} / ${v?.cao ?? 48} / ${v?.thuong ?? 72}` : ''; return `<div class="card"><div class="hd"><h3>${esc(l)}</h3><span class="grow"></span><button class="btn sm pri" data-set="${k}" data-t="${t}">Lưu</button></div><div class="bd">${t.startsWith('lines') ? `<textarea class="inp" style="width:100%;height:150px;padding:8px" data-sv="${k}">${esc(txt)}</textarea><div class="small muted">Mỗi dòng một giấy tờ. Áp dụng cho hồ sơ lập mới.</div>` : `<input class="inp" data-sv="${k}" value="${esc(txt)}">`}</div></div>`; }).join('')}
    </div></div>`;
  main.onclick = run(async e => {
    const b = e.target.closest('[data-save]');
    if (b) { const c = b.dataset.save; const rows = $(`[data-cat="${c}"]`, main).value.split('\n').map(s => s.split('|').map(x => x.trim())).filter(x => x[0]).map(([value, label]) => ({ value, label: label || value })); await api('PUT', `/api/lookups/${c}`, { rows }); toast('Đã lưu danh mục'); M = await api('GET', '/api/meta'); return; }
    const s = e.target.closest('[data-set]');
    if (s) { const k = s.dataset.set, t = s.dataset.t, raw = $(`[data-sv="${k}"]`, main).value; const lines = raw.split('\n').map(x => x.trim()).filter(Boolean);
      const value = t === 'lines_all' ? { ...(M.settings[k] || {}), _all: lines } : t === 'lines' ? lines : t === 'num' ? +raw : t === 'sla' ? (([a, b, c]) => ({ khan: +a, cao: +b, thuong: +c }))(raw.split('/').map(x => x.trim())) : raw;
      await api('PUT', `/api/settings/${k}`, { value }); toast('Đã lưu cài đặt'); M = await api('GET', '/api/meta'); }
  });
};
V.flows = async main => {
  const ents = Object.values(M.ents).filter(e => e.flow);
  main.innerHTML = `<div class="page">${head('12', 'Luồng phê duyệt', 'fa-diagram-project', '', '12.3')}<div class="card"><div class="tbl-wrap"><table class="t noclick"><thead><tr><th>Nghiệp vụ</th><th>Người lập / trình</th><th>Trình khi đang</th><th>Cấp phê duyệt</th><th>Duyệt → trạng thái</th><th>Điều kiện trước khi trình</th></tr></thead><tbody>${ents.map(e => { const st = e.fields.find(f => f.k === e.flow.field); const L = v => st.o.find(o => o[0] === v)?.[1] || v; return `<tr><td><b>${esc(e.title)}</b> ${e.code ? `<span class="tag">${e.code}</span>` : ''}</td><td class="small">${(e.c || []).map(roleName).join(', ') || 'Hệ thống'}</td><td class="small">${e.flow.submit.map(L).join(', ')}</td><td class="small">${(e.a || ['truong_phong', 'lanh_dao']).map(roleName).join(' / ')}${e.fields.some(f => f.k === 'approver_id') ? ' (người được chọn)' : ''}</td><td>${pill(L(e.flow.approve.ok), 'g')}</td><td class="small">${[...(e.files || []).filter(x => x[2]).map(x => 'Tệp: ' + x[1]), ...(e.flow.need || []).map(k => 'Nhập: ' + e.fields.find(f => f.k === k).l), e.flow.needAll ? 'Đủ toàn bộ giấy tờ checklist' : '', e.key === 'contract' ? 'Lịch thanh toán khớp giá trị HĐ' : ''].filter(Boolean).join('<br>')}</td></tr>`; }).join('')}</tbody></table></div><div class="bd small muted">${ico('fa-user-lock')} Nguyên tắc tách nhiệm: người trình không tự phê duyệt đề nghị của mình. Từ chối bắt buộc ghi lý do. Mọi lần trình / duyệt lưu trong nhật ký thao tác.</div></div></div>`;
};
V.audit = async main => {
  const f = { ent: '', user: '', from: '', to: '' };
  const draw = async () => {
    const rows = await api('GET', '/api/audit?' + qsOf(f));
    $('#at', main).innerHTML = rows.length ? `<table class="t"><thead><tr><th>Thời điểm</th><th>Người thao tác</th><th>Đối tượng</th><th>Thao tác</th><th>Nội dung thay đổi</th></tr></thead><tbody>${rows.map(a => `<tr data-e="${a.ent}" data-r="${a.rec_id || ''}"><td class="nowrap">${dmyhm(a.at)}</td><td>${esc(a.who || 'Hệ thống')}</td><td>${esc(M.ents[a.ent]?.title || a.ent)}${a.rec_id ? ' #' + a.rec_id : ''}</td><td>${esc(actLabel(a.action, a.ent))}</td><td class="small">${a.note ? esc(a.note) + '<br>' : ''}${a.after && a.action !== 'tao' ? Object.keys(a.after).slice(0, 4).map(k => `<b>${esc(colLabel(a.ent, k) || k)}</b>: ${esc(fmtVal(a.ent, k, a.before?.[k]))} → ${esc(fmtVal(a.ent, k, a.after[k]))}`).join('<br>') : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Không có bản ghi</div>';
  };
  main.innerHTML = `<div class="page">${head('12', 'Nhật ký thao tác', 'fa-clock-rotate-left', '', '12.5')}<div class="card"><div class="toolbar"><select id="ae"><option value="">Mọi đối tượng</option>${Object.values(M.ents).map(e => `<option value="${e.key}">${esc(e.title)}</option>`).join('')}<option value="user">Tài khoản</option></select><select id="au"><option value="">Mọi người dùng</option>${M.users.map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select><span class="small muted">Từ</span><input type="date" id="af" class="inp"><span class="small muted">đến</span><input type="date" id="ato" class="inp"><span class="grow"></span><span class="small muted">500 bản ghi gần nhất</span></div><div class="tbl-wrap" id="at"></div></div></div>`;
  $('#ae', main).onchange = e => { f.ent = e.target.value; draw(); }; $('#au', main).onchange = e => { f.user = e.target.value; draw(); };
  $('#af', main).onchange = e => { f.from = e.target.value; draw(); }; $('#ato', main).onchange = e => { f.to = e.target.value; draw(); };
  main.onclick = e => { const tr = e.target.closest('tr[data-r]'); if (tr?.dataset.r && M.ents[tr.dataset.e]) openDetail(tr.dataset.e, +tr.dataset.r, 'hist'); };
  await draw();
};
V.integr = async main => {
  const imps = await api('GET', '/api/imports');
  const isAdmin = M.me.role === 'admin';
  main.innerHTML = `<div class="page">${head('12', 'Tích hợp Bravo / BSC & nhập dữ liệu', 'fa-plug', '', '12.6')}<div class="grid g2">
    <div class="card"><div class="hd"><h3>${ico('fa-database')} Bravo — chứng từ thu tiền</h3></div><div class="bd"><p class="small" style="margin-top:0"><b>Nguồn gốc số thực thu.</b> App không cho nhân viên kinh doanh sửa số thu; kế toán nhập tệp chứng từ xuất từ Bravo (trùng số chứng từ tự bỏ qua). Công nợ, kế hoạch thu, điều kiện bàn giao và hoa hồng tự cập nhật theo chứng từ.</p>
      <div class="lockbar">${ico('fa-clock')} Lần đồng bộ gần nhất: <b>${M.settings.bravo?.last_sync ? dmyhm(M.settings.bravo.last_sync) : 'chưa có'}</b></div>
      <div class="small muted mb">Chế độ: ${esc(M.settings.bravo?.mode || '')}</div>${M.imports.receipts ? `<button class="btn amb" data-imp="receipts">${ico('fa-file-import')} Nhập chứng từ Bravo</button>` : '<span class="small muted">Chỉ Kế toán / Quản trị nhập chứng từ.</span>'}</div></div>
    <div class="card"><div class="hd"><h3>${ico('fa-diagram-project')} BSC — quản lý mục tiêu & công việc</h3></div><div class="bd"><p class="small" style="margin-top:0">Chưa thống nhất cơ chế tích hợp với BSC. Trong lúc chờ: xuất danh sách việc tồn đọng (theo người phụ trách, hạn) và chỉ tiêu KPI để nhập vào BSC.</p><div class="row"><button class="btn" id="bscA">${ico('fa-file-excel')} Xuất việc tồn đọng</button><button class="btn" id="bscK">${ico('fa-file-excel')} Xuất KPI nhân viên</button></div></div></div>
    <div class="card span2"><div class="hd"><h3>${ico('fa-file-import')} Nhập dữ liệu hiện có (dữ liệu lịch sử)</h3></div><div class="bd"><p class="small" style="margin-top:0">Thứ tự nên nhập: <b>bảng hàng → khách hàng → hợp đồng + lịch thanh toán → chứng từ thu</b>. Mỗi loại có tệp mẫu; «Kiểm tra trước» chạy thử toàn bộ, báo lỗi từng dòng (trùng, thiếu, sai định dạng) mà không ghi dữ liệu.</p><div class="row">${Object.entries(M.imports).map(([k, i]) => `<button class="btn" data-imp="${k}">${ico('fa-upload')} ${esc(i.title)}</button>`).join('')}</div>
      <div class="sec-title">Lịch sử nhập</div>${rowsTable([['at', 'Thời điểm', 'dt'], ['kind', 'Loại'], ['file_name', 'Tệp'], ['by_l', 'Người nhập'], ['total', 'Tổng dòng', 'int'], ['ok', 'Thành công', 'int'], ['failed', 'Lỗi', 'int']], imps.map(x => ({ ...x, kind: M.imports[x.kind]?.title || x.kind })), null, { click: false })}</div></div>
    ${isAdmin ? `<div class="card span2"><div class="hd"><h3>${ico('fa-flask')} Dữ liệu thử</h3></div><div class="bd"><p class="small" style="margin-top:0">Giao dịch thử (đánh dấu <span class="tag demo">thử</span>) phục vụ chạy thử toàn bộ quy trình. Dữ liệu gốc thật — dự án, tòa, căn theo bảng hàng, chính sách giá, mẫu biểu, tài khoản — <b>không bị ảnh hưởng</b>. Trước khi vận hành: xóa dữ liệu thử, khóa tài khoản thử.</p>
      <div class="row"><span>Hiện có: <b>${M.demo}</b> khách hàng / hợp đồng thử</span><span class="grow"></span>${M.demo ? `<button class="btn danger" id="clrDemo">${ico('fa-trash')} Xóa toàn bộ dữ liệu thử</button>` : `<button class="btn" id="ldDemo">${ico('fa-flask')} Nạp lại dữ liệu thử</button>`}</div></div></div>` : ''}
  </div></div>`;
  main.onclick = run(async e => {
    const b = e.target.closest('[data-imp]'); if (b) return importModal(b.dataset.imp, () => route());
    if (e.target.closest('#bscA')) { const al = await api('GET', '/api/alerts?all=1'); return download('/api/export-rows', { title: 'Việc tồn đọng (xuất cho BSC)', cols: [['cat_l', 'Nhóm'], ['text', 'Nội dung'], ['due', 'Hạn', 'date'], ['who', 'Phụ trách'], ['lvl_l', 'Mức độ']], rows: al.map(a => ({ ...a, cat_l: M.alertCat[a.cat], lvl_l: { r: 'Khẩn / quá hạn', a: 'Cần xử lý', b: 'Theo dõi' }[a.lvl] })), file: 'BSC_viec_ton_dong' }); }
    if (e.target.closest('#bscK')) { const r = await api('GET', '/api/report/kpi'); return download('/api/export-rows', { title: r.title, cols: r.cols, rows: r.rows, file: 'BSC_KPI' }); }
    if (e.target.closest('#clrDemo')) { const c = await ask('Xóa dữ liệu thử', 'Xóa toàn bộ giao dịch, khách hàng, hợp đồng, chứng từ… đánh dấu <b>thử</b>? Căn hộ được tính lại trạng thái. Không hoàn tác được.', { danger: 1, okLabel: 'Xóa dữ liệu thử', reason: 1, reasonReq: 1, reasonLabel: 'Gõ XOA để xác nhận' }); if (c !== 'XOA') return c && toast('Cần gõ đúng XOA', true); const r = await api('POST', '/api/admin/clear-demo', {}); toast('Đã xóa: ' + Object.entries(r.removed).map(([k, v]) => `${M.ents[k]?.title || k} ${v}`).join(', ')); M = await api('GET', '/api/meta'); return route(); }
    if (e.target.closest('#ldDemo')) { toast('Đang nạp dữ liệu thử…'); const r = await api('POST', '/api/admin/load-demo', {}); toast(r.skipped || 'Đã nạp dữ liệu thử'); M = await api('GET', '/api/meta'); return route(); }
  });
};

// ---------- khởi động ----------
if (location.hash.startsWith('#/login')) loginView(); else boot();

// ---- ai.js
// Trợ lý AI tra cứu: khung trò chuyện (ngăn bên phải trên mọi màn + màn «Trợ lý AI tra cứu»).
'use strict';
const AI = { conv: null, items: [], busy: false };   // items: { who: 'me'|'ai'|'err', text, steps }

// markdown tối giản và an toàn: thoát HTML trước, chỉ cho liên kết nội bộ (#…)
function mdInline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((#[^)\s]*)\)/g, (_, t, h) => `<a href="${h}" class="ai-link">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, '$1<i>$2</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function md(src) {
  const L = String(src || '').replace(/\r/g, '').split('\n'), out = [];
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  for (let i = 0; i < L.length;) {
    const l = L[i];
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(L[i + 1] || '')) {
      const head = cells(l); i += 2; const rows = [];
      while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) rows.push(cells(L[i++]));
      const isNum = c => /^[-+]?[\d.,]+\s*(đ|tỷ|tr|%)?$/.test(c);
      out.push(`<div class="ai-tw"><table class="t"><thead><tr>${head.map(h => `<th>${mdInline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td class="${isNum(c) ? 'num' : ''}">${mdInline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ol = /^\s*\d/.test(l), items = [];
      while (i < L.length && /^\s*([-*•]|\d+[.)])\s+/.test(L[i])) items.push(L[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      out.push(`<${ol ? 'ol' : 'ul'}>${items.map(x => `<li>${mdInline(x)}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^#{1,6}\s/.test(l)) { out.push(`<p><b>${mdInline(l.replace(/^#+\s/, ''))}</b></p>`); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const para = [];
    while (i < L.length && L[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#{1,6}\s)/.test(L[i])) para.push(L[i++]);
    if (!para.length) para.push(L[i++]);
    out.push(`<p>${para.map(mdInline).join('<br>')}</p>`);
  }
  return out.join('');
}

function aiSuggest() {
  const mgr = ['truong_phong', 'lanh_dao', 'admin'].includes(M.me.role);
  return mgr
    ? ['Tổng công nợ quá hạn hiện nay là bao nhiêu? Top 10 khách nợ nhiều nhất', 'Tiến độ doanh số so với chỉ tiêu năm nay theo từng dự án', 'Căn nào đủ điều kiện bàn giao mà chưa có lịch hẹn?', 'Tóm tắt toàn bộ hồ sơ căn TNS-G-0603']
    : ['Khách nào của tôi sắp đến hạn thanh toán trong 7 ngày tới?', 'Tra cứu căn TNS-G-0603: khách, hợp đồng, công nợ', 'Tòa G còn bao nhiêu căn đang mở bán?', 'Các việc tồn đọng của tôi hôm nay'];
}
function aiBody(full) {
  const list = AI.items.length ? AI.items.map(m => m.who === 'me'
    ? `<div class="ai-msg mine"><div class="bub">${esc(m.text).replace(/\n/g, '<br>')}</div></div>`
    : `<div class="ai-msg ${m.who}"><span class="ai-av">${ico(m.who === 'err' ? 'fa-triangle-exclamation' : 'fa-wand-magic-sparkles')}</span><div class="bub">${m.steps?.length ? `<details class="ai-steps"><summary>${ico('fa-magnifying-glass-chart')} Đã tra cứu ${m.steps.length} nguồn</summary><ul>${m.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}${m.who === 'err' ? esc(m.text) : md(m.text)}</div></div>`).join('')
    : `<div class="ai-hello"><span class="ai-av big">${ico('fa-wand-magic-sparkles')}</span><b>Trợ lý AI tra cứu</b><p class="muted small">Hỏi bằng tiếng Việt về căn hộ, khách hàng, hợp đồng, công nợ, bàn giao, sổ hồng, báo cáo… AI chỉ đọc dữ liệu bạn được quyền xem và không thay đổi gì.</p>
      <div class="ai-sug">${aiSuggest().map(s => `<button data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
  const busy = AI.busy ? `<div class="ai-msg ai"><span class="ai-av">${ico('fa-wand-magic-sparkles')}</span><div class="bub ai-typing"><span></span><span></span><span></span> <small class="muted">Đang tra cứu dữ liệu…</small></div></div>` : '';
  return `<div class="ai-list">${list}${busy}</div>
    <form class="ai-in"><textarea rows="1" placeholder="${M.ai ? 'Hỏi trợ lý… (Enter để gửi, Shift+Enter xuống dòng)' : 'Trợ lý AI đang tắt — chưa cấu hình ANTHROPIC_API_KEY'}" ${M.ai ? '' : 'disabled'}></textarea>
    <button class="btn pri" ${M.ai && !AI.busy ? '' : 'disabled'} title="Gửi">${ico('fa-paper-plane')}</button></form>
    <div class="ai-foot small muted">${full ? '' : `<a href="#/v/ai">${ico('fa-up-right-and-down-left-from-center')} Mở toàn màn hình</a> · `}AI có thể nhầm — đối chiếu số liệu ở hồ sơ gốc trước khi dùng.</div>`;
}
function aiRender() {
  for (const box of $$('.ai-box')) {
    const ta = $('textarea', box), draft = ta?.value || '';
    box.innerHTML = aiBody(box.dataset.full === '1');
    const t2 = $('textarea', box); t2.value = draft; aiGrow(t2);
    const l = $('.ai-list', box); l.scrollTop = l.scrollHeight;
  }
}
const aiGrow = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
async function aiSend(text) {
  text = String(text || '').trim(); if (!text || AI.busy) return;
  AI.items.push({ who: 'me', text }); AI.busy = true;
  $$('.ai-box textarea').forEach(t => { t.value = ''; });
  aiRender();
  try {
    const r = await api('POST', '/api/ai/ask', { conv: AI.conv, text });
    AI.conv = r.conv; AI.items.push({ who: 'ai', text: r.answer, steps: r.steps });
  } catch (e) { AI.items.push({ who: 'err', text: e.message }); }
  AI.busy = false; aiRender();
  $('.ai-box textarea')?.focus();
}
function aiNew() { if (AI.busy) return; AI.conv = null; AI.items = []; aiRender(); }
function aiWire(box) {
  box.addEventListener('submit', e => { e.preventDefault(); aiSend($('textarea', box).value); });
  box.addEventListener('keydown', e => { if (e.target.matches('textarea') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); aiSend(e.target.value); } });
  box.addEventListener('input', e => { if (e.target.matches('textarea')) aiGrow(e.target); });
  box.addEventListener('click', e => {
    const s = e.target.closest('[data-sug]'); if (s) return aiSend(s.dataset.sug);
    const a = e.target.closest('a.ai-link'); if (!a) return;
    const m = /^#open\/(\w+)\/(\d+)/.exec(a.getAttribute('href'));
    if (m) { e.preventDefault(); if (M.ents[m[1]]) openDetail(m[1], +m[2]); }
    if (box.dataset.full !== '1' && window.innerWidth < 900) aiClose();
  });
}
function aiOpen() {
  if ($('.ai-panel')) return aiClose();
  const p = document.createElement('aside'); p.className = 'ai-panel';
  p.innerHTML = `<div class="ai-ph"><span class="ai-av">${ico('fa-wand-magic-sparkles')}</span><b>Trợ lý AI tra cứu</b><span class="grow"></span>
    <button class="ibtn" id="aiNew" title="Cuộc trò chuyện mới">${ico('fa-rotate-right')}</button><button class="ibtn" id="aiX" title="Đóng">${ico('fa-xmark')}</button></div><div class="ai-box" data-full="0"></div>`;
  document.body.append(p);
  $('#aiNew', p).onclick = aiNew; $('#aiX', p).onclick = aiClose;
  aiWire($('.ai-box', p)); aiRender();
  $('textarea', p).focus();
}
function aiClose() { $('.ai-panel')?.remove(); }

// màn toàn trang
V.ai = async main => {
  aiClose();
  main.innerHTML = `<div class="page">${head('01', 'Trợ lý AI tra cứu', 'fa-wand-magic-sparkles', `<button class="btn" id="aiNew2">${ico('fa-rotate-right')} Cuộc trò chuyện mới</button>`)}
    <div class="card ai-page"><div class="ai-box" data-full="1"></div></div></div>`;
  $('#aiNew2', main).onclick = aiNew;
  aiWire($('.ai-box', main)); aiRender();
  $('textarea', main).focus();
};
