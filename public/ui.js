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
    box.innerHTML = items.length ? items.map((it, i) => `<div data-i="${i}"><span>${esc(it.label)}</span><small>${esc(it.sub || '')}</small></div>`).join('') : `<div class="muted">${multi && ids().length && !txt.value.trim() ? 'Đã chọn hết' : 'Không tìm thấy'}${/con_ban/.test(c.dataset.filter || '') ? ' căn còn trống' : ''}</div>`;
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
