// Lõi giao diện: tiện ích, gọi API, hộp thoại, form tự sinh từ meta, danh sách, ngăn chi tiết.
'use strict';
let M = null;                 // meta từ máy chủ (/api/meta)
const ST = { list: {} };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// 13/11/2026: trang in /print/… mở tab tách riêng (noopener) — hộp «In» của Chrome tạm dừng mọi tab dính opener, tab app bị đơ nút tới khi đóng tab in
{ const o = window.open.bind(window); window.open = (u, t, f) => typeof u === 'string' && u.startsWith('/print/') && !/[?&]fmt=docx/.test(u) ? (o(u, t || '_blank', f ? f + ',noopener' : 'noopener'), null) : o(u, t, f); }
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
// bảng căn mở bán (chi tiết Thông báo mở bán) — như file «DS mở bán đợt … .xlsx»
const unitsTable = us => { const d1 = v => v == null ? '' : (+v).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `<div class="small muted mb">${us.length} căn</div><div class="tbl-wrap ds-can"><table class="t compact noclick"><thead><tr><th class="center">STT</th><th class="center">Mã căn hộ</th><th class="center">Diện tích thông thủy</th><th class="center">Diện tích xây dựng</th></tr></thead>
    <tbody>${us.map((u, i) => `<tr><td class="center">${i + 1}</td><td class="center">${esc(u.code)}</td><td class="center">${d1(u.area_tt)}</td><td class="center">${d1(u.area_xd)}</td></tr>`).join('')}</tbody></table></div>`; };

// ---------- Thông báo bàn giao (13/11/2026): bảng căn của tòa + HĐMB đã ký + đợt bàn giao, hạn hiện tại → hạn mới ----------
const bgTable = (rs, { pick, sel } = {}) => {
  const d = v => v ? dmy(String(v).slice(0, 10)) : '';
  return `<div class="tbl-wrap bg-t"><table class="t compact noclick"><thead><tr>${pick ? '<th style="width:30px"></th>' : ''}<th>Mã căn</th><th>Khách hàng</th><th>Số HĐMB</th><th>Ngày ký</th><th>Đợt bàn giao</th><th>Số ngày</th><th class="num">Số tiền</th><th>Hạn hiện tại</th><th>Hạn thu mới</th><th>Ghi chú</th></tr></thead><tbody>
    ${rs.map(x => { const on = pick && sel.has(x.code.toUpperCase()), chg = x.due_new && String(x.due_old || '').slice(0, 10) !== x.due_new;
      return `<tr${on ? ' class="sel"' : ''}>${pick ? `<td><input type="checkbox" data-bgu="${esc(x.code)}" ${on ? 'checked' : ''} ${x.other ? 'disabled' : ''}></td>` : ''}<td>${esc(x.code)}</td><td>${esc(x.customer || '')}</td><td>${esc(x.number || '')}</td><td>${d(x.contract_on)}</td>
        <td class="bg-dot">${!x.contract_id ? '<span class="muted">Chưa có HĐMB đã ký</span>' : pick && x.dots?.length
          ? `<select data-bgd="${x.contract_id}" class="${x.inst_seq ? '' : 'bg-none'}" title="${esc(x.inst_name || '')}"><option value="">${x.inst_seq ? '— bỏ đánh dấu —' : '— Chưa rõ đợt — chọn —'}</option>${x.dots.map(o => { const nm = String(o.name || '').slice(0, 55); return `<option value="${o.seq}" ${o.seq === x.inst_seq ? 'selected' : ''}>${esc(/^đợt\s*\d/i.test(nm) ? nm : `Đợt ${o.seq} · ${nm}`)}</option>`; }).join('')}</select>${x.how === 'text' ? '<div class="small muted">tự nhận theo nội dung — chọn lại nếu sai</div>' : ''}`
          : x.inst_seq ? esc(/^đợt\s*\d/i.test(x.inst_name || '') ? String(x.inst_name).slice(0, 60) : `Đợt ${x.inst_seq} · ${String(x.inst_name || '').slice(0, 60)}`) : '<span class="hs-miss">Chưa rõ đợt bàn giao</span>'}</td>
        <td>${pick && x.inst_seq ? `<input data-bgn="${x.contract_id}" data-seq="${x.inst_seq}" value="${x.days_own ?? ''}" placeholder="${x.days}" inputmode="numeric" style="width:54px;text-align:right" title="Số ngày riêng của HĐ này — để trống = theo ô «Số ngày được nộp tiền (mặc định)»">` : x.inst_seq ? `${x.days}${x.days_own == null ? ' <span class="muted small">(mặc định)</span>' : ''}` : ''}</td><td class="num">${x.amount != null ? fm(x.amount) : ''}</td>
        <td>${d(x.due_old)}</td><td>${x.due_new ? `<b${chg ? ' style="color:var(--cobalt)"' : ''}>${d(x.due_new)}</b>` : ''}</td><td class="small">${x.other ? `<span class="hs-miss">Đã có trong TB ${esc(x.other)}</span>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>`;
};
async function bgPicker(el, form) {
  const hid = $('input[type=hidden]', el), box = $('.upick-bd', el), F = k => M.ents.handover_notice.fields.find(f => f.k === k);
  const val = k => readField(form, F(k));
  let rows = [], key = '', auto = !hid.value, sel = new Set(String(hid.value).toUpperCase().split(/[,;\s]+/).filter(Boolean)), first = null;
  const draw = () => {
    if (!val('building_id')) { box.innerHTML = '<div class="muted small">Chọn dự án và mã tòa — app tự hiện các căn có HĐMB đã ký để tích.</div>'; return; }
    if (!rows.length) { box.innerHTML = '<div class="muted small">Tòa này chưa có căn hộ.</div>'; return; }
    box.innerHTML = `<div class="upick-sum">${sumHtml()}</div>
      ${val('handover_on') ? '' : '<div class="small hs-miss">Điền «Ngày bàn giao» để xem hạn thu mới của đợt bàn giao.</div>'}${bgTable(rows, { pick: true, sel })}`;
  };
  const sumHtml = () => { const on = rows.filter(x => sel.has(x.code.toUpperCase())), hd = on.filter(x => x.inst_id), tot = hd.reduce((s, x) => s + (+x.amount || 0), 0);
    const unk = on.filter(x => x.contract_id && !x.inst_id).length;
    return `<b>Đã chọn ${on.length}/${rows.length} căn</b> · ${hd.length} HĐMB có đợt bàn giao · tiền đợt bàn giao ${fm(tot)} đ${unk ? ` · <span class="hs-miss">${unk} HĐ chưa rõ đợt bàn giao — chọn ở cột «Đợt bàn giao»</span>` : ''}
      ${first ? ` · <span class="hs-ok">tòa đã bàn giao từ ${dmy(String(first).slice(0, 10))}</span>` : ''}<span class="grow"></span>
      <button type="button" class="btn sm" data-bga="hd">Chọn căn có HĐMB đã ký</button><button type="button" class="btn sm" data-bga="1">Chọn tất cả</button><button type="button" class="btn sm ghost" data-bga="0">Bỏ chọn hết</button>`; };
  const setHid = () => { hid.value = rows.filter(x => sel.has(x.code.toUpperCase())).map(x => x.code).join(','); };
  const setSel = s => { sel = s; setHid(); draw(); };
  const load = async () => {
    const qs = new URLSearchParams({ id: form.dataset.id || '', building: val('building_id') || '', on: val('handover_on') || '', notice: val('notice_on') || '', from: val('pay_from') || 'ban_giao', days: val('pay_days') ?? 0 });
    if (qs.toString() === key) return; const bChanged = !key.includes(`building=${qs.get('building')}&`); key = qs.toString();
    if (!qs.get('building')) { rows = []; draw(); return; }
    const r = await api('GET', '/api/handover-notice/suggest?' + qs); rows = r.rows; first = r.bg_from;
    if (bChanged && (auto || !rows.some(x => sel.has(x.code.toUpperCase())))) { auto = true; setSel(new Set(rows.filter(x => x.inst_id && !x.other).map(x => x.code.toUpperCase()))); } else draw();
  };
  let tm = 0; const soon = () => { clearTimeout(tm); tm = setTimeout(() => load().catch(e => toast(e.message, true)), 250); };
  form.addEventListener('change', e => { if (['project_id', 'building_id', 'handover_on', 'notice_on', 'pay_from', 'pay_days'].includes(e.target.name)) soon(); });
  form.addEventListener('input', e => { if (['handover_on', 'notice_on', 'pay_days'].includes(e.target.name)) soon(); });
  // tích 1 căn: chỉ cập nhật dòng + dòng tổng (không vẽ lại bảng → giữ chỗ đang cuộn)
  box.addEventListener('change', e => { const c = e.target; if (!c.dataset.bgu) return; e.stopPropagation(); auto = false; const k = c.dataset.bgu.toUpperCase(); c.checked ? sel.add(k) : sel.delete(k);
    setHid(); c.closest('tr').classList.toggle('sel', c.checked); $('.upick-sum', box).innerHTML = sumHtml(); });
  // đổi đợt bàn giao / số ngày của 1 HĐ: ghi thẳng vào Lần thanh toán của HĐMB (lần sau mọi thông báo đều nhận đúng)
  box.addEventListener('change', run(async e => { const c = e.target, d = c.dataset; if (!d.bgd && !d.bgn) return; e.stopPropagation();
    const body = d.bgd ? { contract_id: +d.bgd, seq: +c.value || 0, days: rows.find(x => x.contract_id === +d.bgd)?.days_own ?? null } : { contract_id: +d.bgn, seq: +d.seq, days: c.value.trim() };
    c.disabled = true; try { await api('POST', '/api/handover-notice/set-bg', body); toast(d.bgd ? (body.seq ? `Đã đặt đợt ${body.seq} là đợt bàn giao của HĐMB` : 'Đã bỏ đánh dấu đợt bàn giao') : 'Đã lưu số ngày vào HĐMB'); key = ''; await load(); } finally { c.disabled = false; } }));
  box.addEventListener('click', e => { const b = e.target.closest('[data-bga]'); if (!b) return; auto = false;
    setSel(new Set(rows.filter(x => !x.other && (b.dataset.bga === '1' || (b.dataset.bga === 'hd' && x.inst_id))).map(x => x.code.toUpperCase()))); });
  await load();
}
function show(f, row, { plain } = {}) {
  if (f.pick === 'units' && Array.isArray(row._units) && !plain) return unitsTable(row._units);
  if (f.pick === 'bg_units' && Array.isArray(row._bg) && !plain) return `<div class="small muted mb">${row._bg.length} căn · hạn thu đợt bàn giao ${row.status === 'da_duyet' ? 'đã cập nhật vào HĐMB' : 'sẽ cập nhật khi phát hành'}</div>` + bgTable(row._bg);
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
    case 'json': if (f.grid && Array.isArray(v)) {
      if (!v.length) return plain ? '' : '<span class="muted">—</span>';
      if (plain) return v.map(x => x.name + (x.relation ? ` (${x.relation})` : '')).join('; ');
      return `<div class="tbl-wrap"><table class="t compact noclick"><thead><tr>${f.grid.map(c => `<th>${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${v.map(x => `<tr>${f.grid.map(c => `<td>${esc(x[c.k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
      return plain ? JSON.stringify(v) : '<span class="muted">(xem chi tiết)</span>';
    case 'long': return plain ? v : esc(v).replace(/\n/g, '<br>');
    default: return esc(v);
  }
}
// tab «Đã hủy» của phiếu đăng ký: trả lại hồ sơ cho khách — chọn / nhập / đính kèm ngay trên dòng
const RET_COLS = ['doc_ret', 'doc_ret_on', 'ret_files'];
function retCell(k, r) {
  if (k === 'doc_ret') return `<select class="ret-st ${r.doc_ret === 'da_tra' ? 'g' : 'a'}" data-ret="doc_ret">${[['chua_tra', 'Chưa trả hồ sơ'], ['da_tra', 'Đã trả hồ sơ']].map(([v, l]) => `<option value="${v}" ${(r.doc_ret || 'chua_tra') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  if (k === 'doc_ret_on') return `<input type="date" class="ret-d" data-ret="doc_ret_on" value="${esc(r.doc_ret_on || '')}" min="1900-01-01" max="2100-12-31">`;
  const fs = r.ret_files || [];
  return `<div class="ret-f">${fs.map(f => `<span class="ret-fi"><a href="/api/file/${f.id}" target="_blank" rel="noopener" title="${esc(f.name)}">${ico(/\.pdf$/i.test(f.name) ? 'fa-file-pdf' : /\.(png|jpe?g|webp)$/i.test(f.name) ? 'fa-file-image' : 'fa-file')} ${esc(f.name)}</a><button type="button" data-retdel="${f.id}" title="Xóa tệp">×</button></span>`).join('')}<button type="button" class="btn sm" data-retup>${ico('fa-paperclip')} ${fs.length ? 'Thêm' : 'Đính kèm'}</button></div>`;
}
const VIRT_MONEY = new Set(['paid', 'actual', 'gap', 'bg_amount']), VIRT_NUM = new Set(['n_units', 'n_reg', 'n_free', 'n_hd']);
function cell(ent, k, row) {
  const f = M.ents[ent].fields.find(x => x.k === k);
  if (ent === 'reservation' && RET_COLS.includes(k)) return { html: retCell(k, row) };
  if (k === 'sale_check') { const v = row[k]; if (!v) return { html: '' };   // cảnh báo mở bán: đỏ = ngoài đợt mở bán đã duyệt gần nhất
    return { html: v.startsWith('⚠') ? `<span style="color:var(--r-c);font-weight:600" title="${esc(v)}">${ico('fa-triangle-exclamation')} Ngoài đợt mở bán</span>` : `<span style="color:var(--g)" title="${esc(v)}">${ico('fa-check')} ${esc(v.slice(2).replace(/^Có trong /, ''))}</span>` }; }
  if (f) return { html: show(f, row), num: ['money', 'num', 'int'].includes(f.t) };
  const v = row[k];
  if (k === 'created_by') return { html: esc(row.created_by__l || '') };
  if (k === 'prints') return { html: `<span class="nowrap"><button type="button" class="btn sm" data-print="dang_ky_can" title="In bản đăng ký căn hộ (chọn mẫu in)">${ico('fa-print')} Căn hộ</button> <button type="button" class="btn sm" data-print="dang_ky_noi_that" title="In bản đăng ký nội thất (chọn mẫu in)">${ico('fa-couch')} Nội thất</button></span>` };
  if (k === 'bbgn') return { html: `<button type="button" class="btn sm" data-bbgn title="In biên bản bàn giao tài liệu hồ sơ mua nhà (chọn mẫu Cát Tường / Thống Nhất)">${ico('fa-file-signature')} Biên bản</button>` };
  if (k === 'created_at') return { html: dmy(v) };
  if (k === 'bg_from') return { html: v ? `<b>${dmy(String(v).slice(0, 10))}</b>` : '' };
  if (VIRT_NUM.has(k)) return { html: v == null ? '' : fnum(v), num: true };
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
// ---------- ô ngày 3 phần dd / mm / yyyy (máy nào cũng hiện đúng dd/mm/yyyy, sửa riêng từng phần) ----------
// segDate(id, 'yyyy-mm-dd') → html; wireSegDate(root) gắn xử lý; segVal(el) → 'yyyy-mm-dd' | '' ; el phát sự kiện 'sdchange' khi đủ ngày hoặc xóa trắng
function segDate(id, v = '') {
  const [y, m, d] = /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-') : ['', '', ''];
  const box = (k, val, ph, n) => `<input class="sd-p" data-p="${k}" value="${val}" placeholder="${ph}" maxlength="${n}" inputmode="numeric" autocomplete="off" size="${n}">`;
  return `<span class="sdate" id="${id}">${box('d', d, 'dd', 2)}<i>/</i>${box('m', m, 'mm', 2)}<i>/</i>${box('y', y, 'yyyy', 4)}<button type="button" tabindex="-1" data-sdpick title="Chọn ngày">${ico('fa-calendar-days')}</button><input type="date" tabindex="-1" aria-hidden="true"></span>`;
}
function segVal(el) {
  const g = k => $(`[data-p="${k}"]`, el).value, d = +g('d'), m = +g('m'), y = +g('y');
  if (!g('d') && !g('m') && !g('y')) return '';
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate())) return null;   // chưa đủ / sai ngày
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function segSet(el, v) {
  const [y, m, d] = /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-') : ['', '', ''];
  $('[data-p="d"]', el).value = d; $('[data-p="m"]', el).value = m; $('[data-p="y"]', el).value = y;
}
function wireSegDate(root) {
  $$('.sdate', root).forEach(el => {
    if (el._sd) return; el._sd = 1;
    const ps = $$('.sd-p', el), nat = $('input[type=date]', el);
    let last = segVal(el);
    const fire = () => { const v = segVal(el); el.classList.toggle('bad', v === null); if (v !== null && v !== last) { last = v; el.dispatchEvent(new Event('sdchange', { bubbles: true })); } };
    ps.forEach((p, i) => {
      p.addEventListener('input', () => {
        p.value = p.value.replace(/\D/g, '').slice(0, +p.maxLength);
        if (p.value.length === +p.maxLength && ps[i + 1]) { ps[i + 1].focus(); ps[i + 1].select(); }
        fire();
      });
      p.addEventListener('keydown', e => {
        if (/^\d$/.test(e.key) && p.value.length >= +p.maxLength && p.selectionStart === p.selectionEnd) p.value = '';   // ô đã đủ số: gõ số mới thì thay cả phần đó
        if (e.key === 'Backspace' && !p.value && ps[i - 1]) { e.preventDefault(); ps[i - 1].focus(); ps[i - 1].select(); }   // ô trống: lùi về phần trước
        else if (['/', '.', '-'].includes(e.key) || (e.key === 'ArrowRight' && p.selectionStart === p.value.length)) { e.preventDefault(); if (ps[i + 1]) { ps[i + 1].focus(); ps[i + 1].select(); } }
        else if (e.key === 'ArrowLeft' && p.selectionStart === 0 && ps[i - 1]) { e.preventDefault(); ps[i - 1].focus(); }
      });
      p.addEventListener('focus', () => p.select());
      p.addEventListener('mouseup', e => { if (p.selectionStart === p.selectionEnd) e.preventDefault(); p.select(); });   // bấm vào phần nào thì chọn cả phần đó
      p.addEventListener('blur', () => { if (p.value.length === 1 && p.dataset.p !== 'y') { p.value = '0' + p.value; fire(); } });
    });
    el.addEventListener('mousedown', e => { if (e.target === el || e.target.tagName === 'I') { e.preventDefault(); (ps.find(p => !p.value) || ps[0]).focus(); } });
    $('[data-sdpick]', el).onclick = () => { try { nat.value = segVal(el) || ''; } catch { } try { nat.showPicker(); } catch { nat.click(); } };
    nat.oninput = nat.onchange = () => { segSet(el, nat.value || ''); fire(); };   // chọn ngày / «Hôm nay» / «Xoá» trên bảng lịch
  });
}
function parseMonth(s) { s = String(s || '').trim(); const m = /^(\d{1,2})[/.-](\d{4})$/.exec(s); return m ? `${m[2]}-${m[1].padStart(2, '0')}` : s; }
const moneyStr = v => v == null || v === '' ? '' : fm(v);
function input(f, v, rec = {}, { ro, id } = {}) {
  const nm = `name="${f.k}" data-t="${f.t}" id="${id || 'f_' + f.k}"`;
  if (ro) return `<div class="ro">${show(f, rec)}</div>`;
  if (f.upload) return `<div class="upfile"><input type="file" accept="${f.upload}" ${nm}>${v ? `<span class="small muted">Đang có: ${esc(v)} — chọn tệp mới để thay</span>` : ''}</div>`;
  if (f.pick === 'bg_units') return `<div class="upick" data-pick-bg><input type="hidden" ${nm} value="${esc(v ?? '')}"><div class="upick-bd"></div></div>`;
  if (f.pick === 'units') return `<div class="upick" data-pick-units><input type="hidden" ${nm} value="${esc(v ?? f.def ?? '*')}"${f.def === '' ? ' data-none' : ''}><div class="upick-bd"></div></div>`;   // def '' = chưa chọn căn nào
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
    case 'check': return `<div class="cklist${f.qty ? ' qty' : ''}" ${nm} ${f.qty ? 'data-qty' : ''}>${checkRows(v || [], f.qty)}</div>`;
    case 'json': return f.k === 'new_schedule' ? `<div data-sched ${nm}></div>` : f.k === 'sale_sched' ? `<div data-ssched ${nm}></div>` : f.grid ? `<div class="gridin" ${nm}>${gridRows(f, v || [])}</div>` : `<div class="ro">${show(f, rec)}</div>`;
    default: if (f.choose) return `<select ${nm}>${[...new Set([...f.choose, ...(v ? [v] : [])])].map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;   // ô chữ nhưng chọn trong danh sách (giữ giá trị cũ ngoài danh sách)
      if (f.sugRef) return `<input ${nm} value="${esc(v ?? '')}" autocomplete="off" list="dl_${f.k}" placeholder="Gõ mã hoặc tên để tìm ${esc(M.ents[f.sugRef].one)} đã có…"><datalist id="dl_${f.k}"></datalist>`;   // gợi ý động: xem openForm
      return `<input ${nm} value="${esc(v ?? '')}" autocomplete="off"${f.sug ? ` list="dl_${f.k}"` : ''}>${f.sug ? sugList('dl_' + f.k, f.sug) : ''}`;
  }
}
const CK = [['', '— chưa —'], ['da_nhan', 'Đã nhận / đạt'], ['thieu', 'Thiếu'], ['can_sua', 'Cần sửa / bổ sung']];
// qty: thêm cột «Số lượng» (bản) — dùng in biên bản giao nhận hồ sơ
function checkRows(items, qty) {
  const nOk = items.filter(x => x.st === 'da_nhan').length;
  return `<div class="ck-bar"><span class="ck-sum">Đã nhận <b>${nOk}</b>/${items.length}</span><button type="button" class="btn sm ok" data-ck-all="da_nhan" title="Đánh dấu tất cả giấy tờ «Đã nhận / đạt»">${ico('fa-check-double')} Đủ hết hồ sơ</button><button type="button" class="btn sm ghost" data-ck-all="" title="Xóa tình trạng tất cả giấy tờ">${ico('fa-rotate-left')} Xóa đánh dấu</button><span class="muted small">Bấm tên giấy tờ để đánh dấu / bỏ «Đã nhận»</span></div>`
    + `<div class="it hd"><div>Giấy tờ / hạng mục</div>${qty ? '<div>Số lượng</div>' : ''}<div>Tình trạng</div><div>Ghi chú</div><div></div></div>` + items.map((x, i) => `<div class="it ${x.st || ''}" data-i="${i}"><div class="ck-n">${esc(x.n)}</div>${qty ? `<div><input data-ck="qty" inputmode="numeric" value="${esc(x.qty ?? '')}" placeholder="0"></div>` : ''}<div><select data-ck="st">${CK.map(o => `<option value="${o[0]}" ${o[0] === (x.st || '') ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div><div><input data-ck="note" value="${esc(x.note || '')}" placeholder="Ghi chú (không bắt buộc)"></div><div class="ck-act"><button type="button" class="btn sm ghost" data-ck-ed title="Sửa tên giấy tờ">${ico('fa-pen')}</button><button type="button" class="btn sm ghost danger" data-ck-del title="Xóa giấy tờ này khỏi hồ sơ">${ico('fa-trash')}</button></div><input type="hidden" data-ck="n" value="${esc(x.n)}"></div>`).join('')
    + `<div class="it"><div class="row"><input data-ck-new placeholder="+ Thêm giấy tờ khác…" style="flex:1"><button type="button" class="btn sm" data-ck-add>Thêm</button></div></div>`;
}
function readCheck(el) { return $$('.it[data-i]', el).map(r => { const q = $('[data-ck=qty]', r); return { n: $('[data-ck=n]', r).value, st: $('[data-ck=st]', r).value, note: $('[data-ck=note]', r).value, ...(q ? { qty: q.value.trim() } : {}) }; }); }
const ckItem = s => { const m = /^(.*?)\s*\|\s*(\d+)\s*$/.exec(String(s)); return m ? { n: m[1].trim(), qty: +m[2] } : { n: String(s).trim() }; };
const sugList = (id, xs) => `<datalist id="${id}">${xs.map(x => Array.isArray(x) ? `<option value="${esc(x[1])}">${esc(x[0] + ' ' + x[1])}</option>` : `<option value="${esc(x)}">`).join('')}</datalist>`;   // [loại, tên] → hiện «Xã Yên Trung», ghi «Yên Trung»
// bảng nhập nhiều dòng (VD thành viên hộ gia đình): mỗi cột là ô chữ / ô chọn / ô chữ có gợi ý; fixed = đúng 1 dòng (VD chủ hộ), cột ro = giá trị cố định
function gridRows(f, rows) {
  if (f.fixed) rows = [rows[0] || {}];
  const cell = (c, v) => c.ro ? `<input data-gc="${c.k}" value="${esc(v || c.def || '')}" readonly tabindex="-1">` : c.o ? `<select data-gc="${c.k}"><option value="">— chọn —</option>${c.o.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : `<input data-gc="${c.k}" value="${esc(v ?? c.def ?? '')}"${c.ph ? ` placeholder="${esc(c.ph)}"` : ''}${c.sug && !c.sugProv ? ` list="dl_${f.k}_${c.k}"` : ''}${c.sugProv ? ` data-sugprov="${esc(c.sugProv)}" data-sugid="dl_${f.k}_${c.k}" placeholder="Chọn hoặc gõ"` : ''}${DOB[c.k] ? ` inputmode="numeric" placeholder="${DOB[c.k].ph}"` : ''} autocomplete="off">`;
  return `<div class="tbl-wrap"><table class="t compact noclick gridt"><thead><tr><th>#</th>${f.grid.map(c => `<th style="min-width:${c.w || 120}px">${esc(c.l)}</th>`).join('')}${f.fixed ? '' : '<th></th>'}</tr></thead>
    <tbody>${rows.map((x, i) => `<tr data-gr><td class="center">${i + 1}</td>${f.grid.map(c => `<td>${cell(c, x[c.k])}</td>`).join('')}${f.fixed ? '' : `<td><button type="button" class="btn sm" data-gdel title="Bỏ dòng">${ico('fa-xmark')}</button></td>`}</tr>`).join('')}</tbody></table></div>
    ${f.fixed ? '' : `<button type="button" class="btn sm mt" data-gadd>${ico('fa-plus')} Thêm thành viên</button>`}${f.grid.filter(c => c.sug).map(c => sugList(`dl_${f.k}_${c.k}`, c.sug)).join('')}`;
}
// ===== ngày / tháng / năm sinh trong bảng hộ gia đình (11/11/2026) =====
// gõ đủ số → tự nhảy ô sau (ngày → tháng → năm → cột tiếp); gõ «/ . -» hoặc khoảng trắng cũng sang ô; dán / gõ «12/05/1990» vào ô Ngày → tự tách 3 ô; sai thì ô đỏ ngay
const DOB = { bday: { max: 2, ph: 'dd' }, bmonth: { max: 2, ph: 'mm' }, byear: { max: 4, ph: 'yyyy' } };
const dobNext = el => { const xs = $$('input:not([readonly]),select', el.closest('tr')), i = xs.indexOf(el); const n = xs[i + 1]; if (n) { n.focus(); n.select?.(); } };
function dobCheck(tr) {
  const g = k => $(`[data-gc="${k}"]`, tr), d = g('bday'), m = g('bmonth'), y = g('byear'); if (!d || !m || !y) return;
  const masked = [d, m, y].some(x => x.value.startsWith('•')); if (masked) return;
  const dv = +d.value, mv = +m.value, yv = +y.value, now = new Date().getFullYear();
  const bd = d.value !== '' && !(dv >= 1 && dv <= 31), bm = m.value !== '' && !(mv >= 1 && mv <= 12), by = y.value !== '' && (y.value.length === 4 ? !(yv >= 1900 && yv <= now) : document.activeElement !== y);
  const all = !bd && !bm && !by && d.value && m.value && y.value.length === 4 && new Date(yv, mv - 1, dv).getDate() !== dv;   // VD 31/02
  d.classList.toggle('bad', bd || all); m.classList.toggle('bad', bm || all); y.classList.toggle('bad', by || all);
  d.title = bd ? 'Ngày phải từ 1 đến 31' : all ? 'Ngày không có trong tháng này' : ''; m.title = bm ? 'Tháng phải từ 1 đến 12' : ''; y.title = by ? `Năm sinh từ 1900 đến ${now}` : '';
}
function dobSplit(el, txt) {   // «12/05/1990», «12-5-1990», «12.05.1990», «12 05 1990»
  const m = /^\s*(\d{1,2})\s*[\/.\- ]\s*(\d{1,2})\s*[\/.\- ]\s*(\d{4})\s*$/.exec(txt || ''); if (!m) return false;
  const tr = el.closest('tr'), set = (k, v) => { const x = $(`[data-gc="${k}"]`, tr); if (x) x.value = v; };
  set('bday', String(+m[1])); set('bmonth', String(+m[2])); set('byear', m[3]);
  dobCheck(tr); dobNext($('[data-gc="byear"]', tr)); return true;
}
document.addEventListener('paste', e => { const el = e.target.closest?.('input[data-gc]'); if (!el || !DOB[el.dataset.gc]) return;
  if (dobSplit(el, e.clipboardData?.getData('text'))) e.preventDefault(); });
document.addEventListener('input', e => {
  const el = e.target.closest?.('input[data-gc]'); const D = el && DOB[el.dataset.gc]; if (!D) return;
  if (el.dataset.gc === 'bday' && /[\/.\- ]\d/.test(el.value) && dobSplit(el, el.value)) return;   // gõ cả ngày tháng năm vào ô Ngày
  const sep = /[\/.\- ]$/.test(el.value);
  el.value = el.value.replace(/\D/g, '').slice(0, D.max);
  dobCheck(el.closest('tr'));
  const v = el.value, first = +v[0];
  const full = v.length >= D.max || (v.length === 1 && ((el.dataset.gc === 'bday' && first > 3) || (el.dataset.gc === 'bmonth' && first > 1)));   // 5 → ngày 5, không thể là 2 chữ số
  if (v && (full || sep)) dobNext(el);
});
document.addEventListener('focusout', e => { const el = e.target.closest?.('input[data-gc]'); if (el && DOB[el.dataset.gc]) dobCheck(el.closest('tr')); });
// ô «Thị trấn/xã»: danh sách phường, xã chỉ hiện khi Tỉnh của dòng đó là Bắc Ninh (tỉnh khác gõ tay)
const noAcc = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/^(tinh|thanh pho|tp\.?)\s+/, '').trim();
document.addEventListener('focusin', e => {
  const el = e.target.closest?.('input[data-sugprov]'); if (!el) return;
  const prov = $('[data-gc="province"]', el.closest('tr'))?.value;
  if (noAcc(prov) === noAcc(el.dataset.sugprov)) el.setAttribute('list', el.dataset.sugid); else el.removeAttribute('list');
});
const gridVals = (el, f) => $$('tr[data-gr]', el).map(tr => Object.fromEntries(f.grid.map(c => [c.k, $(`[data-gc="${c.k}"]`, tr).value.trim()])));
const readGrid = (el, f) => gridVals(el, f).filter(x => f.grid.some(c => !c.ro && x[c.k] && x[c.k] !== c.def));   // dòng chỉ có giá trị mặc định (VD Tỉnh = Bắc Ninh) = dòng trống
function wireInputs(root, onChange) {
  $$('[data-pick]', root).forEach(b => {
    const wrap = b.parentElement, txt = $('input[name]', wrap), nat = $(`input[type=${b.dataset.pick}]`, wrap);
    b.onclick = () => { const v = txt.dataset.t === 'date' ? parseDmy(txt.value) : txt.dataset.t === 'month' ? parseMonth(txt.value) : parseDt(txt.value).slice(0, 16); try { nat.value = v; } catch { } try { nat.showPicker(); } catch { nat.click(); } };
    nat.oninput = nat.onchange = () => { const v = nat.value; if (!v) { txt.value = ''; txt.dispatchEvent(new Event('change', { bubbles: true })); return; } txt.value = txt.dataset.t === 'date' ? dmy(v) : txt.dataset.t === 'month' ? mmy(v) : `${dmy(v.slice(0, 10))} ${v.slice(11, 16)}`; txt.dispatchEvent(new Event('change', { bubbles: true })); };
  });
  $$('input[data-t=money]', root).forEach(i => { i.addEventListener('blur', () => { const n = num(i.value, true); if (i.value.trim() && isFinite(n)) i.value = fm(n); }); });
  $$('input[data-t=date]', root).forEach(i => i.addEventListener('blur', () => { const m = /^(\d{1,2})(\d{2})(\d{4})$/.exec(i.value.trim()); if (m) i.value = `${m[1].padStart(2, '0')}/${m[2]}/${m[3]}`; }));
  $$('.combo', root).forEach(c => combo(c, root, onChange));
  $$('.gridin', root).forEach(el => {
    const f = Object.values(M.ents).flatMap(e => e.fields).find(x => x.k === el.getAttribute('name') && x.grid);
    el._get = () => readGrid(el, f);
    el.addEventListener('click', e => {
      if (e.target.closest('[data-gadd]')) { el.innerHTML = gridRows(f, [...gridVals(el, f), {}]); $$('tr[data-gr]', el).pop()?.querySelector('input,select')?.focus(); }
      const d = e.target.closest('[data-gdel]'); if (d) { const i = $$('tr[data-gr]', el).indexOf(d.closest('tr')); el.innerHTML = gridRows(f, gridVals(el, f).filter((x, j) => j !== i)); }
    });
  });
  $$('.cklist', root).forEach(el => {
    const ckSum = () => { const b = $('.ck-sum b', el); if (b) b.textContent = $$('[data-ck=st]', el).filter(x => x.value === 'da_nhan').length; };
    const ckSet = (r, v) => { const sel = $('[data-ck=st]', r); if (!sel) return; sel.value = v; r.className = 'it ' + v; };
    el.addEventListener('change', e => { const r = e.target.closest('.it[data-i]'); if (r && e.target.dataset.ck === 'st') r.className = 'it ' + e.target.value; ckSum(); });
    // điền nhanh (11/11/2026): Đủ hết hồ sơ / còn lại là thiếu / xóa đánh dấu; bấm tên giấy tờ = bật / tắt «Đã nhận»
    el.addEventListener('click', e => {
      const all = e.target.closest('[data-ck-all]');
      if (all) { const v = all.dataset.ckAll; $$('.it[data-i]', el).forEach(r => { const cur = $('[data-ck=st]', r)?.value; if (v === 'thieu' ? !cur : true) ckSet(r, v); }); ckSum(); el.dispatchEvent(new Event('change', { bubbles: true })); return; }
      const nm = e.target.closest('.ck-n'); const r = nm && nm.closest('.it[data-i]');
      if (r && !$('input', nm)) { ckSet(r, $('[data-ck=st]', r).value === 'da_nhan' ? '' : 'da_nhan'); ckSum(); el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    el.addEventListener('click', e => { if (!e.target.matches('[data-ck-add]')) return; const inp = $('[data-ck-new]', el); const v = inp.value.trim(); if (!v) return; const items = readCheck(el); items.push({ n: v, st: '', note: '' }); el.innerHTML = checkRows(items, 'qty' in el.dataset); });
    // sửa tên / xóa từng giấy tờ (lưu khi bấm Lưu form)
    el.addEventListener('click', e => {
      const row = e.target.closest('.it[data-i]'); if (!row) return;
      if (e.target.closest('[data-ck-del]')) { const i = +row.dataset.i; el.innerHTML = checkRows(readCheck(el).filter((_, j) => j !== i), 'qty' in el.dataset); el.dispatchEvent(new Event('change', { bubbles: true })); return; }
      if (e.target.closest('[data-ck-ed]')) {
        const cell = $('.ck-n', row), hid = $('[data-ck=n]', row); if ($('input', cell)) return;
        cell.innerHTML = `<input data-ck-nm value="${esc(hid.value)}">`; const inp = $('input', cell); inp.focus(); inp.select();
        const done = keep => { const v = inp.value.trim(); if (keep && v) hid.value = v; cell.textContent = hid.value; el.dispatchEvent(new Event('change', { bubbles: true })); };
        inp.addEventListener('keydown', k => { if (k.key === 'Enter') { k.preventDefault(); inp.blur(); } else if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); inp.value = hid.value; inp.blur(); } });
        inp.addEventListener('blur', () => done(true), { once: true });
      }
    });
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
function schedEditor(el, rows, { total, base, first, maint, mdot, bgBase } = {}) {   // bgBase(): { doc, on, days } — căn đã có thông báo bàn giao phát hành   // maint(): phí bảo trì, mdot(): đợt mặc định cho hạn phí bảo trì   // first(): ngày cố định của đợt 1 (hợp đồng: ngày ký HĐMB)
  let R = (rows || []).map(r => ({ ...r }));
  // HĐMB: phí bảo trì là DÒNG RIÊNG cố định cuối bảng (không xóa, số tiền = phí bảo trì); hạn tự theo đợt thu phí bảo trì cho đến khi sửa tay —
  // đợt có nội dung nhắc «bảo trì» (mẫu: «… và 2% phí bảo trì»), không có thì đợt mặc định (3)
  const mIdx = () => { const k = R.findIndex(r => /bảo trì/i.test(r.name || '')); return k >= 0 ? k : Math.max(1, +(mdot?.() || 3)) - 1; };
  let MR = maint ? R.find(r => r.maint) || null : null;
  if (maint) { R = R.filter(r => !r.maint); if (MR) MR = { name: MR.name, due_on: MR.due_on, auto: !MR.due_on || MR.due_on === R[mIdx()]?.due_on }; }
  // đợt bàn giao (13/11/2026): HĐMB tự chọn đợt nào là đợt bàn giao (đợt 2 / 3 / 4… tùy HĐ) + số ngày được nộp kể từ ngày bàn giao.
  // Chưa đánh dấu thì tự nhận đợt có nội dung nhắc «bàn giao / nhận nhà» (số ngày lấy từ câu «… 15 ngày kể từ ngày bàn giao»)
  const BG_T = /b[àa]n\s*giao|nh[ậa]n\s*nh[àa]|giao\s*nh[àa]/i;
  const bgDaysIn = s => { const m = /(\d+)\s*(?:\([^)]*\)\s*)?ngày[^.;]{0,60}?(?:b[àa]n\s*giao|nh[ậa]n\s*nh[àa]|giao\s*nh[àa])/i.exec(s || ''); return m ? +m[1] : null; };
  if (maint && maint() != null && !R.some(r => r.bg)) { const k = R.findIndex(r => BG_T.test(r.name || '')); if (k >= 0) { R[k].bg = true; R[k]._bgAuto = true; R[k].bg_days ??= bgDaysIn(R[k].name); } }
  const totalOf = () => typeof total === 'function' ? total() : total;
  const C = first ? M.settings.schedule_contents || [] : [];   // gợi ý nội dung từng đợt (hợp đồng)
  // «Sau 60 ngày…», «Trong 60 ngày…», «Trong vòng 60 (sáu mươi) ngày…» = số ngày sau ngày ký; «… ngày kể từ ngày Bên Bán…» theo sự kiện khác nên không tính
  const nDays = s => +(/(?:sau|trong)(?:\s+vòng)?\s+(\d+)(?:\s*\([^)]*\))?\s+ngày(?!\s+kể từ ngày\s+(?!ký))/i.exec(s || '')?.[1] || 0);
  // tỷ lệ thanh toán ghi trong nội dung («… thanh toán 30% giá trị căn hộ»): số % đầu tiên KHÔNG thuộc phí bảo trì / thuế
  // (bỏ «2% phí bảo trì», «thuế VAT 10%», «10% thuế»); trả { v, at, len } để đổi ngược khi sửa ô Tỷ lệ
  const pctIn = s0 => {
    const s = String(s0 || '');
    for (const m of s.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g)) {
      const before = s.slice(Math.max(0, m.index - 14), m.index).toLowerCase(), after = s.slice(m.index + m[0].length, m.index + m[0].length + 22).toLowerCase();
      if (/(phí\s*)?bảo\s*trì|thuế|vat|gtgt/.test(after) || /thuế|vat|gtgt|lãi/.test(before)) continue;
      const v = +m[1].replace(',', '.'); if (v > 0 && v <= 100) return { v, at: m.index, len: m[1].length };
    }
    return null;
  };
  const useC = (r, c) => { const d = first?.(); Object.assign(r, { name: c.name, pct: c.pct, amount: null, _days: c.days || 0, due_on: c.days && d ? addDays(d, c.days) : c.days === 0 ? r.due_on || d : '' }); };
  if (first?.()) for (const r of R) { const n = nDays(r.name); if (n && addDays(first(), n) === r.due_on) r._days = n; }   // lịch đã lưu: hạn đúng «Sau N ngày» thì vẫn đi theo ngày ký
  const draw = () => {
    const f1 = first?.(), d1 = /^\d{4}-\d{2}-\d{2}$/.test(f1 || '') ? f1 : null; if (d1 && R[0]) R[0].due_on = d1;   // ngày đang gõ dở thì giữ ngày trước
    if (d1) R.forEach((r, i) => { if (i && r._days) r.due_on = addDays(d1, r._days); });   // đợt tính theo ngày ký đi theo ngày ký
    // tỷ lệ % các đợt × tiền sau thuế (= tổng − phí bảo trì); phí bảo trì ở dòng riêng cố định
    // maint() = null: không áp dụng (HĐ thuê, vay…); số (kể cả 0 khi chưa chọn căn): HĐMB — luôn có dòng phí bảo trì
    const tot = totalOf() || 0, mv = maint?.(), on = mv != null, mt = +(mv || 0), hasM = mt > 0, mi = on ? mIdx() : -1, base = hasM ? tot - mt : tot;
    const bgB = on ? bgBase?.() : null;   // đã phát hành thông báo bàn giao: hạn đợt bàn giao = ngày bàn giao + số ngày
    if (bgB?.on) R.forEach(r => { if (r.bg) r.due_on = addDays(bgB.on, r.bg_days ?? bgB.days ?? 0); });
    if (on) { MR ||= { name: 'Thu phí bảo trì (2% tiền trước thuế)', due_on: '', auto: true }; if (MR.auto) MR.due_on = R[mi]?.due_on || ''; }
    const pa = r => r.pct ? Math.round(base * r.pct / 100) : 0, sum = R.reduce((s, r) => s + (+r.amount || pa(r)), 0) + (hasM ? mt : 0);
    const mRow = on ? `<tr data-m class="sched-m"><td><b>Phí bảo trì</b></td><td><input data-mk="name" value="${esc(MR.name || '')}" style="width:100%"></td><td><input data-mk="due_on" value="${esc(dmy(MR.due_on) || '')}" placeholder="dd/mm/yyyy" style="width:120px" title="Tự theo hạn đợt ${mi + 1} (đợt có nội dung nhắc phí bảo trì, không có thì đợt 3) — sửa được; xóa trống thì lại tự theo"></td><td class="num muted">—</td><td><input value="${mt ? fm(mt) : ''}" placeholder="chọn căn để tính" readonly style="width:150px;text-align:right" title="Phí bảo trì = 2% tiền trước thuế — tự tính khi chọn căn / nhập giá"></td><td></td><td></td></tr>` : '';
    el.innerHTML = `<div class="row mb">${(M.settings.schedule_presets || []).map((p, i) => `<button type="button" class="btn sm" data-pre="${i}">${ico('fa-wand-magic-sparkles')} ${esc(p.name)}</button>`).join('')}<span class="muted small">Mẫu tính ngày từ ngày gốc</span><input class="inp" style="width:120px;height:30px" data-base value="${esc(dmy(d1 || base || today()))}"></div>
      <table class="t compact noclick sched ${C.length ? 'pick' : ''}"><thead><tr><th>Đợt</th><th>Nội dung</th><th>Ngày đến hạn</th><th class="num">Tỷ lệ %</th><th class="num">Số tiền</th>${on ? `<th title="Tích đợt thu khi bàn giao nhà (đợt 2, 3, 4… tùy hợp đồng) — Thông báo bàn giao phát hành thì hạn đợt này = ngày bàn giao + số ngày">Đợt bàn giao</th>` : ''}<th></th></tr></thead><tbody>
      ${R.map((r, i) => `<tr data-i="${i}"><td>${C.length ? `<select data-sug="${i}" title="Chọn đợt để gợi ý nội dung, tỷ lệ, hạn"><option value="">Đợt ${i + 1}</option>${C.map((c, j) => `<option value="${j}" ${c.name === r.name ? 'selected' : ''}>${esc(c.dot)}</option>`).join('')}</select>` : i + 1}</td><td>${C.length ? `<textarea data-k="name" rows="2" placeholder="Chọn đợt để gợi ý hoặc tự ghi nội dung">${esc(r.name || '')}</textarea>` : `<input data-k="name" value="${esc(r.name || '')}">`}</td><td><input data-k="due_on" value="${esc(dmy(r.due_on) || r.due_on || '')}" placeholder="dd/mm/yyyy" style="width:120px"${d1 && !i ? ' readonly title="Tự theo ngày ký hợp đồng mua bán"' : r.bg && bgB?.on ? ` readonly title="Theo thông báo bàn giao ${esc(bgB.doc || '')}: ngày bàn giao ${dmy(bgB.on)} + ${r.bg_days ?? bgB.days ?? 0} ngày"` : ''}></td><td><input data-k="pct" value="${r.pct ?? ''}" style="width:70px;text-align:right"></td><td><input data-k="amount" value="${r.amount ? fm(r.amount) : ''}" placeholder="${r.pct && tot ? fm(pa(r)) : ''}" style="width:150px;text-align:right"></td>${on ? `<td class="sched-bg"><label class="chk small"><input type="checkbox" data-bg="${i}" ${r.bg ? 'checked' : ''}> Bàn giao</label>${r.bg ? `<div class="small nowrap"><input data-k="bg_days" value="${r.bg_days ?? ''}" placeholder="${bgB?.days ?? 0}" inputmode="numeric" style="width:46px;text-align:right" title="Số ngày được nộp kể từ ngày bàn giao — để trống = theo thông báo bàn giao"> ngày${r._bgAuto ? ' <span class="muted" title="App tự nhận theo nội dung đợt — bỏ tích nếu sai">· tự nhận</span>' : ''}</div>${bgB?.on ? `<div class="small hs-ok" title="Thông báo bàn giao ${esc(bgB.doc || '')}">BG ${dmy(bgB.on)}</div>` : ''}` : ''}</td>` : ''}<td><div class="sched-acts"><button type="button" class="btn ghost sm" data-del="${i}" title="Xóa đợt">${ico('fa-trash')}</button></div></td></tr>`).join('')}<tr class="sched-add"><td colspan="${on ? 7 : 6}"><button type="button" class="btn sm" data-add>${ico('fa-plus')} Thêm đợt</button></td></tr>${mRow}
      </tbody><tfoot><tr><td colspan="3"><b>Tổng</b></td><td class="num">${fnum(R.reduce((s, r) => s + (+r.pct || 0), 0))}%</td><td class="num ${tot && Math.abs(sum - tot) > 1000 * (R.length + 1) ? 'neg' : 'pos'}">${fm(sum)}</td>${on ? '<td></td>' : ''}<td></td></tr></tfoot></table>
      <div class="small muted mt">Phải khớp nghĩa vụ phải thu: <b>${fm(tot)}</b> đ.${hasM ? ` Tỷ lệ % các đợt tính trên tiền sau thuế <b>${fm(base)}</b> đ; phí bảo trì <b>${fm(mt)}</b> đ thu ở dòng riêng${R[mi] ? `, cùng hạn đợt ${mi + 1}` : ''}.` : ''} Nhập tỷ lệ % hoặc số tiền; chênh lệch làm tròn (≤ 1.000đ/đợt) dồn vào đợt cuối.</div>`;
  };
  const sync = () => {
    $$('tbody tr[data-i]', el).forEach(tr => { const r = R[+tr.dataset.i]; for (const i of $$('input[data-k],textarea[data-k]', tr)) { const k = i.dataset.k; r[k] = k === 'bg_days' ? (i.value.trim() === '' ? null : Math.max(0, parseInt(i.value, 10) || 0)) : k === 'pct' ? (i.value.trim() ? num(i.value) : null) : k === 'amount' ? (i.value.trim() ? num(i.value, true) : null) : k === 'due_on' ? parseDmy(i.value) : i.value; } });
    const mr = $('tbody tr[data-m]', el);   // dòng phí bảo trì: sửa hạn thì thôi tự theo đợt; xóa trống thì lại tự theo
    if (mr && MR) { MR.name = $('[data-mk=name]', mr).value; const d = parseDmy($('[data-mk=due_on]', mr).value); if (d !== MR.due_on) { MR.due_on = d; MR.auto = !d; } }
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; sync();
    if (b.dataset.add !== undefined) { const r = { name: C.length ? '' : `Đợt ${R.length + 1}`, due_on: '', pct: null, amount: null }; if (C[R.length]) useC(r, C[R.length]); R.push(r); }
    if (b.dataset.del !== undefined) R.splice(+b.dataset.del, 1);
    if (b.dataset.pre !== undefined) { const p = M.settings.schedule_presets[+b.dataset.pre], bs = parseDmy($('[data-base]', el).value) || today(); R = p.rows.map(([name, pct, off]) => ({ name, pct, due_on: addDays(bs, off), amount: null })); }
    draw();
  });
  el.addEventListener('change', e => {
    const d = e.target.dataset;
    if (d.sug !== undefined) { sync(); if (e.target.value) useC(R[+d.sug], C[+e.target.value]); draw(); }
    if (d.bg !== undefined) { sync(); const k = +d.bg; R.forEach((r, j) => { delete r._bgAuto; if (j === k && e.target.checked) { r.bg = true; r.bg_days ??= bgDaysIn(r.name); } else { r.bg = false; r.bg_days = null; } }); draw(); }   // chỉ 1 đợt bàn giao
    if (d.k === 'bg_days') { sync(); draw(); }
    if (d.k === 'due_on') { sync(); delete R[+e.target.closest('tr').dataset.i]._days; }   // sửa tay hạn đợt thì không còn tự theo ngày ký
    if (d.k === 'pct') {   // sửa ô Tỷ lệ → số % trong nội dung đổi theo (nội dung có ghi tỷ lệ)
      const i = +e.target.closest('tr').dataset.i, old = R[i]?.name; sync();
      const f = pctIn(old), v = R[i].pct; if (f && v != null && v !== f.v) R[i].name = old.slice(0, f.at) + fnum(v) + old.slice(f.at + f.len);
      R[i].amount = null; draw();
    }
    if (d.k === 'amount') { sync(); draw(); }
  });
  // sửa «Sau 60 ngày» thành «Sau 65 ngày» trong nội dung → hạn đổi ngay theo ngày ký
  el.addEventListener('input', e => {
    if (e.target.dataset.k === 'name') {   // «… thanh toán 30% …» → sửa thành 100% thì Tỷ lệ = 100, Số tiền tính lại
      const tr = e.target.closest('tr'), r = R[+tr.dataset.i], f = pctIn(e.target.value);
      if (r && f && f.v !== r.pct) {
        r.pct = f.v; r.amount = null; $('[data-k="pct"]', tr).value = fnum(f.v);
        const tot = totalOf() || 0, mt = +(maint?.() || 0), a = $('[data-k="amount"]', tr);
        a.value = ''; a.placeholder = tot ? fm(Math.round((mt > 0 ? tot - mt : tot) * f.v / 100)) : '';
        // dòng Tổng cập nhật tại chỗ (không vẽ lại bảng: đang gõ, và bấm nút ngay sau khi rời ô không bị mất)
        const base = mt > 0 ? tot - mt : tot, sum = R.reduce((x, q) => x + (+q.amount || (q.pct ? Math.round(base * q.pct / 100) : 0)), 0) + (mt > 0 ? mt : 0), ft = $$('tfoot td.num', el), lech = !!tot && Math.abs(sum - tot) > 1000 * (R.length + 1);
        if (ft[0]) ft[0].textContent = fnum(R.reduce((x, q) => x + (+q.pct || 0), 0)) + '%';
        if (ft[1]) { ft[1].textContent = fm(sum); ft[1].classList.toggle('neg', lech); ft[1].classList.toggle('pos', !lech); }
      }
    }
    if (e.target.dataset.k !== 'name' || !first) return;
    const tr = e.target.closest('tr'), i = +tr.dataset.i, n = nDays(e.target.value), d = first();
    if (!i || !/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return;
    if (n) { R[i]._days = n; $('[data-k="due_on"]', tr).value = dmy(addDays(d, n)); }
    else if (R[i]._days) { delete R[i]._days; R[i].due_on = ''; $('[data-k="due_on"]', tr).value = ''; }   // nội dung không còn theo ngày ký: bỏ hạn đã tự sổ
  });
  el._set = rows => { R = rows.map(r => ({ ...r })); draw(); };   // điền sẵn các đợt (HĐ thuê tự chia kỳ)
  el._get = () => {
    sync(); const out = R.filter(r => r.name || r.due_on || r.pct || r.amount).map(r => ({ name: r.name, due_on: r.due_on, pct: r.pct, amount: r.amount, ...(r.bg ? { bg: true, bg_days: r.bg_days ?? null } : {}) }));
    if (MR && +(maint?.() || 0) > 0) {
      if (MR.auto) MR.due_on = R[mIdx()]?.due_on || '';
      out.push({ name: MR.name, due_on: MR.due_on, pct: null, amount: null, maint: true });   // máy chủ tự xếp dòng này theo ngày đến hạn
    }
    return out;
  };
  el._redraw = () => { sync(); draw(); };
  draw();
}

// ---------- form tạo / sửa ----------
// form hợp đồng bố cục như BRAVO «Cập nhật hợp đồng căn hộ»: dòng đầu → bên mua | bên bán → thông tin chi tiết → lần thanh toán. Mỗi mảng con = 1 dòng; trường không liệt kê xuống «Thông tin khác»
const HD_LAYOUT = [
  { rows: [['unit_id', 'seller_unit']], cols: 2 },   // dùng chung cho HĐ mua bán và HĐ hoàn thiện
  { side: [
    { t: 'Bên mua nhà ở', rows: [['customer_id'], ['b_id_no'], ['b_id_date'], ['b_id_place'], ['b_addr'], ['b_perm_addr'], ['b_temp_addr'], ['b_phone', 'b_email'], ['b_bank_acc'], ['b_bank_name'], ['request_on'],
      ['co_owner'], ['co_owner_id_no'], ['co_owner_id_date', 'co_owner_id_place'], ['agreement', 'agreement_on']] },   // người đồng sở hữu (vợ / chồng) + VBTT sở hữu chung (13/11/2026)
    { t: 'Bên bán nhà ở', rows: [['s_name'], ['s_addr'], ['s_phone', 's_tax'], ['s_bank_acc'], ['s_bank_name'], ['s_rep'], ['s_title'], ['s_poa'], ['owner_id'], ['commission_amt', 'commission_pct'], ['common_area_amt', 'all_signed']] }] },
  { t: 'Thông tin chi tiết', cols: 4, rows: [['number', 'contract_on'], ['ptype', 'building_id', 'kind', 'nature'], ['base_price', 'area_tt', 'area_floor'], ['area_land', 'land_price', 'land_amt'], ['area_build', 'build_price', 'build_amt'],
    ['pretax', 'vat_pct', 'vat_amt', 'after_tax'], ['finish_value', 'maint_fee', 'corner_pct', 'corner_amt'],
    ['unit_total', 'discount', 'late_rate'],   // late_rate: lãi suất quá hạn HĐMB (sau ô Tổng tiền) · giảm giá cạnh tổng tiền: HĐMB ô Tổng tiền (value) được đưa về cạnh ô này (hdPair.view); HĐ thuê: Tổng tiền (giá trị căn hộ) − giảm giá
    ['loan_recv_on', 'loan_tranches', 'int_mode', 'loan_rate'],   // HĐ vay
    ['eff_on', 'exp_on', 'term_months', 'pay_times'],   // HĐ thuê (BRAVO) · HĐ vay: bắt đầu tính lãi / đáo hạn / thời hạn vay
    ['int_period', 'principal_method', 'int_note'], ['link_ids'],
    ['rent_house', 'rent_furn', 'rent', 'value', 'deposit', 'cn', 'vbtt_hold'], ['sale_price', 'plan_hdmb', 'prev_id', 'next_id']] },   // bán qua HĐ vay / HĐ thuê; HĐMB nối tiếp   // HĐ thuê: tiền thuê/tháng cạnh tổng tiền thuê; mua bán không có ô tiền thuê
  { t: 'Lần thanh toán', rows: [['new_schedule'], ['pay_method']] },
  { t: 'Tiến độ thu tiền HĐMB', rows: [['sale_on'], ['sale_sched']] },   // tick «Có tiến độ thu tiền HĐMB» → sổ ra bảng   // HĐ thuê / vay bán căn (07/11/2026)
  { t: 'Lịch ký', cols: 4, rows: [['plan_sign', 'sign_place', 'sign_status', 'signed_on']] },
  { t: 'Tình trạng vay vốn', cols: 4, rows: [['loan_status', 'loan_bank', 'loan_doc3']] },
];
// mỗi căn 2 hợp đồng riêng: mua bán (tab đầu) và hoàn thiện (kind hoan_thien, tab gọn); Mã căn hộ, bên mua, bên bán chung ở trên 2 tab
function hdPair(form, { ht, locked, tab, draft, oldFinish, kind, debt, rec0 }) {   // oldFinish: hợp đồng cũ đã gộp tiền hoàn thiện, giữ ô để xem / tách
  const secs = [...form.children], rest = secs.slice(secs.findIndex(x => $(':scope > .fsec', x)?.textContent === 'Thông tin chi tiết'));   // phần trên dùng chung, từ Thông tin chi tiết thuộc tab mua bán
  const v = { number: ht?.number, on: ht?.contract_on || today(), finish: ht?.finish_value ?? ht?.value, disc: ht?.discount, sched: ht?.new_schedule || [], ...draft };
  const fld = (k, l, t, val) => `<div class="fld"><label for="f_${k}">${l}</label>${input({ k, t }, val, {}, {})}</div>`;
  const nav = document.createElement('div'); nav.className = 'tabs hd-tabs';
  nav.innerHTML = `<button type="button" data-p="mb">${ico('fa-file-contract')} Hợp đồng mua bán</button><button type="button" data-p="thue">${ico('fa-key')} Hợp đồng thuê</button><button type="button" data-p="vay">${ico('fa-hand-holding-dollar')} Hợp đồng vay</button><button type="button" data-p="ht">${ico('fa-couch')} Hoàn thiện căn hộ</button>`;
  const mb = document.createElement('div'), hp = document.createElement('fieldset');
  hp.className = 'hd-ht'; hp.disabled = !!locked; mb.append(...rest);
  // chỉ lập HĐ hoàn thiện khi người dùng điền tab này (giá trị tự chép từ căn không tính) — ô đánh dấu tự bật khi gõ vào tab
  hp.innerHTML = `<section class="bv-sec"><div class="fsec">Hợp đồng hoàn thiện căn hộ</div><label class="chk ht-on"><input type="checkbox" name="ht_make" ${ht?.id || draft ? 'checked' : ''} ${ht?.id ? 'disabled' : ''}> Lập hợp đồng hoàn thiện căn hộ <span class="small muted">(số hợp đồng riêng, cùng khách hàng và mã căn)</span></label><div class="bv-row" style="--n:2">${fld('ht_number', 'Số hợp đồng', 'text', v.number)}${fld('ht_on', 'Ngày ký hợp đồng', 'date', v.on)}</div>
    <div class="bv-row" style="--n:3">${fld('ht_finish', 'Giá trị hoàn thiện căn hộ', 'money', v.finish)}${fld('ht_disc', 'Giảm giá', 'money', v.disc)}${fld('ht_value', 'Giá trị sau giảm giá', 'money', null)}</div></section>
    <section class="bv-sec"><div class="fsec">Lần thanh toán</div><div class="fld wide"><div data-sched2></div></div></section>`;
  form.append(nav, mb, hp);
  $('[name=ht_number]', hp).placeholder = 'Để trống → tự cấp số'; $('[name=ht_value]', hp).readOnly = true;
  const rd = (k, t) => readField(form, { k, t }), val = () => Math.max(0, (rd('ht_finish', 'money') || 0) - (rd('ht_disc', 'money') || 0));
  const el = $('[data-sched2]', hp);
  schedEditor(el, v.sched, { total: val, first: () => rd('ht_on', 'date') });
  const calc = () => { $('[name=ht_value]', hp).value = val() ? moneyStr(val()) : ''; el._redraw(); };
  const mk = () => $('[name=ht_make]', hp);
  const touch = e => { if (e.isTrusted && e.target.name !== 'ht_make' && !mk().checked) { mk().checked = true; nav.classList.add('ht-has'); } };
  hp.addEventListener('input', e => { touch(e); if (['ht_finish', 'ht_disc'].includes(e.target.name)) calc(); });
  hp.addEventListener('click', e => { if (e.target.closest('[data-sched2] button')) touch(e); });
  hp.addEventListener('change', e => { if (e.target.name === 'ht_make') nav.classList.toggle('ht-has', e.target.checked); });
  hp.addEventListener('change', e => { if (e.target.name === 'ht_on') calc(); });
  // tab Hợp đồng mua bán / Hợp đồng thuê = cùng 1 hợp đồng, đổi Loại hợp đồng; HĐ hoàn thiện đi kèm cả 2
  const kindSel = $('[name=kind]', form), isRent = () => (kindSel ? kindSel.value : kind) === 'thue';   // hợp đồng đã chốt không có ô Loại — theo bản ghi
  const isVay = () => (kindSel ? kindSel.value : kind) === 'vay', grpOf = () => isRent() ? 'thue' : isVay() ? 'vay' : 'mb';
  const setKind = k => { if (kindSel && kindSel.value !== k && !kindSel.disabled) { kindSel.value = k; kindSel.dispatchEvent(new Event('change', { bubbles: true })); } };
  if (!kindSel || kindSel.disabled) for (const p of ['mb', 'thue', 'vay']) if (p !== grpOf()) $(`[data-p="${p}"]`, nav).hidden = true;   // hợp đồng đã chốt không đổi loại được → ẩn tab loại khác
  const valLabel = $('[data-f=value] label', form)?.firstChild?.textContent || '';
  // HĐ thuê: «Tiến độ thu tiền» thay bảng Lần thanh toán (theo mẫu Màn hình quản lý thu tiền thuê) — kỳ do máy chia, đã thu lấy theo phiếu thu
  const rentMeta = document.createElement('div'), rp = document.createElement('div');
  rentMeta.className = 'bv-row rent-meta'; rentMeta.style.setProperty('--n', 3); rp.className = 'rent-prog';
  $('[data-f=rent]', form)?.closest('.bv-row')?.after(rentMeta);
  const PAY_T = { thue: 'Tiến độ thu tiền', vay: 'Các đợt giải ngân gốc (khách chuyển tiền)', mb: 'Lần thanh toán' };
  const paySec = () => $$('.bv-sec', form).find(s => Object.values(PAY_T).includes($(':scope > .fsec', s)?.textContent));
  const saved0 = JSON.stringify((debt?.inst || []).map(i => [i.due_on, +i.amount]));
  const rentDraw = () => {
    const on = isRent(), sec = paySec(), sch = $('[data-sched]', form), t = sec && $(':scope > .fsec', sec);
    rentMeta.style.display = rp.style.display = on ? '' : 'none'; const sf = $('[data-f=new_schedule]', form); if (sf) sf.style.display = on ? 'none' : '';
    if (t) { t.textContent = PAY_T[grpOf()]; if (!rp.isConnected) t.after(rp); }
    if (!on) return;
    const rd2 = k => { const x = readField(form, { k, t: k.endsWith('_on') ? 'date' : 'int' }); return x === undefined ? rec0?.[k] : x; }, n = +rd2('term_months') || 0, p = +rd2('pay_times') || 0, T = today();   // ô bị khóa (không có ô nhập) → theo bản ghi
    const cell = (l, v) => `<div class="fld"><label>${l}</label><div class="ro">${v}</div></div>`;
    const len = [...new Set(Array.from({ length: p }, (_, k) => Math.round((k + 1) * n / p) - Math.round(k * n / p)))].sort((a, b) => a - b), over = n > 0 && p > n;
    rentMeta.innerHTML = cell('Phân bổ thanh toán', over ? `<span class="neg">Số kỳ (${p}) nhiều hơn số tháng thuê (${n})</span>` : n > 0 && p > 0 ? (len.length > 1 ? `${len[0]}–${len[len.length - 1]} tháng/kỳ (chia đều theo tháng)` : `${len[0]} tháng/kỳ`) : '—') + cell('Hạn thanh toán', 'Ngày đầu mỗi kỳ') + cell('Ngày đối chiếu', dmy(T));
    const cur = sch?._get ? sch._get() : debt?.inst || [], same = debt?.inst?.length && JSON.stringify(cur.map(i => [i.due_on, +i.amount])) === saved0;
    const end = rd2('exp_on'); let tot = 0, got = 0, late = 0, lateAmt = 0;
    const rows = cur.map((r, k) => {
      const amt = +r.amount || 0, paid = same ? +debt.inst[k].paid || 0 : 0, rem = amt - paid, nx = cur[k + 1]?.due_on, to = nx ? addDays(nx, -1) : end, isLate = r.due_on && r.due_on < T && rem > 0;
      tot += amt; got += paid; if (isLate) { late++; lateAmt += rem; }
      const st = amt > 0 && rem <= 0 ? pill('Đã thu đủ', 'g') : isLate ? pill('Quá hạn', 'r') : paid > 0 ? pill('Đã thu một phần', 'b') : pill('Chưa đến hạn', 's');
      return `<tr><td>${k + 1}</td><td>${r.due_on ? dmy(r.due_on) : '…'} – ${to ? dmy(to) : '…'}</td><td>${r.due_on ? dmy(r.due_on) : ''}</td><td class="num">${fm(amt)}</td><td class="num">${paid ? fm(paid) : '<span class="muted">Chưa thu</span>'}</td><td class="num">${fm(rem)}</td><td>${st}</td></tr>`;
    });
    const vt = readField(form, { k: 'value', t: 'money' }), all = (vt === undefined ? +rec0?.value : vt) || tot;   // tổng = ô Tổng tiền thuê (tiền thuê × số tháng), chưa chia kỳ vẫn thấy
    rp.innerHTML = `<div class="grid g3 mb">${[['Giá trị HĐ thuê', all, 'Toàn bộ thời hạn hợp đồng'], ['Đã thu', got, 'Theo phiếu thu đã ghi nhận'], ['Còn phải thu', all - got, 'Gồm đến hạn và chưa đến hạn']].map(([l, v, s]) => `<div class="card kpi" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:18px">${fm(v)} đ</div><div class="s">${s}</div></div>`).join('')}</div>
      ${rows.length ? `<div class="${late ? 'warnbar' : 'okbar'} mb">${ico(late ? 'fa-triangle-exclamation' : 'fa-circle-check')} ${late ? `${late} kỳ còn tiền quá hạn · ${fm(lateAmt)} đồng cần đối chiếu thu tiền` : 'Không có khoản thu quá hạn'}</div>
      <table class="t compact noclick"><thead><tr><th>Kỳ</th><th>Thời gian tính tiền</th><th>Hạn thanh toán</th><th class="num">Phải thu</th><th class="num">Đã thu</th><th class="num">Còn lại</th><th>Tình trạng</th></tr></thead><tbody>${rows.join('')}</tbody><tfoot><tr><td colspan="3"><b>Cộng ${rows.length} kỳ</b></td><td class="num ${Math.abs(tot - all) > 1000 ? 'neg' : ''}"><b>${fm(tot)}</b></td><td class="num"><b>${fm(got)}</b></td><td class="num"><b>${fm(tot - got)}</b></td><td></td></tr></tfoot></table>
      ${Math.abs(tot - all) > 1000 ? `<div class="warnbar mt">${ico('fa-triangle-exclamation')} Cộng các kỳ ${fm(tot)} đ khác Giá trị HĐ thuê ${fm(all)} đ — nhập lại Số kỳ thanh toán để chia lại.</div>` : ''}`
      : `<div class="empty">${over ? `Số kỳ thanh toán (${p}) không được nhiều hơn thời hạn thuê (${n} tháng) — mỗi kỳ ít nhất 1 tháng.` : 'Nhập Ngày bắt đầu thuê, Thời hạn thuê, Tiền thuê/tháng và Số kỳ thanh toán — các kỳ thu tự chia.'}</div>`}`;
  };
  // ô Tổng tiền (value): HĐ mua bán đứng cạnh Tiền giảm giá (giảm giá trừ thẳng vào tổng tiền); HĐ thuê / vay về chỗ cũ cạnh Tiền thuê/tháng
  const valF = $('[data-f=value]', form), valHome = valF && { row: valF.parentElement, next: valF.nextElementSibling }, dcF = $('[data-f=discount]', form);
  const placeVal = () => { if (!valF || !dcF) return; if (grpOf() === 'mb') { if (dcF.nextElementSibling !== valF) dcF.after(valF); } else if (valF.parentElement !== valHome.row) valHome.row.insertBefore(valF, valHome.next); };
  const view = p => {   // chỉ đổi khung đang xem
    placeVal();
    const at = p === 'ht' ? 'ht' : grpOf();
    $$('button', nav).forEach(b => b.classList.toggle('on', b.dataset.p === at)); mb.classList.toggle('hidden', at === 'ht'); hp.classList.toggle('hidden', at !== 'ht');
    const vay = isVay();
    const lb = $('[data-f=contract_on] label', form); if (lb) lb.textContent = isRent() ? 'Ngày ký hợp đồng thuê' : vay ? 'Ngày ký hợp đồng vay' : 'Ngày ký hợp đồng mua bán';
    $$('.bv-side .fsec', form).forEach(x => { x.dataset.t ??= x.textContent; x.textContent = isRent() ? x.dataset.t.replace('Bên mua nhà ở', 'Bên thuê nhà ở').replace('Bên bán nhà ở', 'Bên cho thuê nhà ở') : vay ? x.dataset.t.replace('Bên mua nhà ở', 'Bên cho vay (khách hàng)').replace('Bên bán nhà ở', 'Bên vay') : x.dataset.t; });
    for (const [k, l] of Object.entries({ eff_on: 'Ngày bắt đầu tính lãi', exp_on: 'Ngày đáo hạn', term_months: 'Thời hạn vay (tháng)', rent: 'Tiền thuê/tháng (trả lãi)' })) { const x = $(`[data-f=${k}] label`, form)?.firstChild; if (x?.nodeType === 3) { x._t ??= x.textContent; x.textContent = vay ? l : k === 'rent' && isRent() ? 'Tổng giá thuê/tháng' : x._t; } }
    const lkl = $('[data-f=link_ids] label', form)?.firstChild; if (lkl?.nodeType === 3) lkl.textContent = vay ? 'HĐ thuê đi kèm (tick chọn)' : 'HĐ vay đi kèm (tick chọn)';
    for (const x of [$('[data-f=request_on] label', form), ...$$('.bv-side .fld > label', form)].map(l => l?.firstChild)) if (x?.nodeType === 3) { x._t ??= x.textContent; x.textContent = isRent() ? x._t.replace('Ngày đề nghị mua', 'Ngày đề nghị thuê').replace('(bên bán)', '(bên cho thuê)') : vay ? x._t.replace('Ngày đề nghị mua', 'Ngày đề nghị').replace('(bên bán)', '(bên vay)') : x._t; }
    const vl = $('[data-f=value] label', form)?.firstChild; if (vl?.nodeType === 3) vl.textContent = isRent() ? 'Giá trị HĐ thuê' : vay ? 'Số tiền vay (gốc)' : valLabel;
    rentDraw(); loanDraw(); linkDraw();
  };
  // HĐ vay: lịch trả lãi & gốc cho khách — cùng công thức máy chủ (biz.loanPlan); kỳ đã trả theo lịch đã lưu
  const loanSec = document.createElement('section'); loanSec.className = 'bv-sec loan-sec'; loanSec.innerHTML = '<div class="fsec">Lịch trả lãi & gốc cho khách</div><div class="loan-prog"></div>';
  const loanPlanOf = r => {
    const n = +r.term_months || 0, a = r.eff_on, P = +r.int_period || n, V = +r.value || 0; if (!a || !(n > 0) || !(P > 0)) return [];
    const cnt = Math.ceil(n / P), out = [], each = Math.floor(V / cnt / 1000) * 1000; let left = V;
    for (let k = 0; k < cnt; k++) {
      const m = Math.min(P, n - k * P), from = addMon(a, k * P), to = k === cnt - 1 && r.exp_on ? r.exp_on : addDays(addMon(a, k * P + m), -1);
      out.push({ kind: 'lai', seq: k + 1, period_from: from, period_to: to, due_on: to, amount: r.int_mode === 'lai_suat' ? Math.round(left * (+r.loan_rate || 0) / 100 * m / 12) : Math.round((+r.rent || 0) * m) });
      if (r.principal_method === 'theo_ky' && V > 0) { const g = k === cnt - 1 ? left : each; out.push({ kind: 'goc', seq: k + 1, period_from: from, period_to: to, due_on: to, amount: g }); left -= g; }
    }
    if (r.principal_method === 'dao_han' && V > 0) out.push({ kind: 'goc', seq: cnt, period_from: a, period_to: out.at(-1).period_to, due_on: out.at(-1).due_on, amount: V });
    return out;
  };
  const loanDraw = () => {
    const on = isVay(); loanSec.style.display = on ? '' : 'none'; if (!on) return;
    const ps = paySec(); if (ps && ps.nextElementSibling !== loanSec) ps.after(loanSec); else if (!loanSec.isConnected) $$('.bv-sec', mb).pop()?.after(loanSec);   // ngay sau các đợt giải ngân
    const sf = $('[data-f=new_schedule]', form);   // hợp đồng đã chốt: các đợt giải ngân + số khách đã chuyển
    if (sf && !$('[data-sched]', sf) && debt?.inst?.length && !sf.dataset.vt) { sf.dataset.vt = 1; const ro = $('.ro', sf); if (ro) ro.outerHTML = `<div style="flex:1">${schedTable(debt.inst, true)}</div>`; }
    const rv = (k, t) => readField(form, { k, t }) ?? rec0?.[k];
    const r = { term_months: rv('term_months', 'int'), eff_on: rv('eff_on', 'date'), exp_on: rv('exp_on', 'date'), int_period: rv('int_period', 'sel') ?? '1', int_mode: rv('int_mode', 'sel') || 'tien_thue', rent: rv('rent', 'money'), loan_rate: rv('loan_rate', 'num'), value: rv('value', 'money'), principal_method: rv('principal_method', 'sel') || 'dao_han' };
    if (r.int_mode === 'tien_thue') { const on = $$('[data-lk]:checked', lkBox).map(x => +x.dataset.lk), lr = lkList.find(x => on.includes(x.id) && +x.rent > 0)?.rent; if (lr != null) r.rent = +lr; }   // lãi = tiền thuê/tháng của HĐ thuê đi kèm
    const saved = new Map((rec0?._loan || []).map(x => [x.kind + x.seq, x])), T = today();
    const plan = loanPlanOf(r).map(x => { const s = saved.get(x.kind + x.seq), paid = s && (+s.paid_amt || s.paid_on) ? s : null; return paid ? { ...x, amount: +s.amount, paid_amt: +s.paid_amt || 0, paid_on: s.paid_on } : { ...x, paid_amt: 0 }; });
    const lai = plan.filter(x => x.kind === 'lai'), sum = (xs, k) => xs.reduce((a, x) => a + (+x[k] || 0), 0);
    const st = x => x.paid_amt >= x.amount && x.amount > 0 ? pill('Đã trả', 'g') : x.due_on < T ? pill('Quá hạn trả', 'r') : x.paid_amt > 0 ? pill('Trả một phần', 'b') : pill('Chưa đến hạn', 's');
    $('.loan-prog', loanSec).innerHTML = plan.length ? `<div class="grid g4 mb">${[['Gốc vay', r.value, 'theo hợp đồng'], ['Lãi phải trả cả kỳ', sum(lai, 'amount'), r.int_mode === 'lai_suat' ? `lãi suất ${fnum(r.loan_rate)}%/năm` : `${fm(r.rent)} đ tiền thuê / tháng`], ['Đã trả lãi', sum(lai, 'paid_amt'), 'theo ghi nhận đã trả'], ['Còn phải trả (lãi + gốc)', sum(plan, 'amount') - sum(plan, 'paid_amt'), 'cho khách']].map(([l, v, s]) => `<div class="card kpi" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:18px">${fm(v)} đ</div><div class="s">${s}</div></div>`).join('')}</div>
      <table class="t compact noclick"><thead><tr><th>Kỳ</th><th>Khoản</th><th>Thời gian tính lãi</th><th>Ngày trả</th><th class="num">Phải trả</th><th class="num">Đã trả</th><th>Tình trạng</th></tr></thead><tbody>${plan.map(x => `<tr><td>${x.seq}</td><td>${x.kind === 'lai' ? 'Tiền lãi' : '<b>Trả gốc</b>'}</td><td>${dmy(x.period_from)} – ${dmy(x.period_to)}</td><td>${dmy(x.due_on)}</td><td class="num">${fm(x.amount)}</td><td class="num">${x.paid_amt ? fm(x.paid_amt) : '<span class="muted">Chưa trả</span>'}</td><td>${st(x)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4"><b>Cộng</b></td><td class="num"><b>${fm(sum(plan, 'amount'))}</b></td><td class="num"><b>${fm(sum(plan, 'paid_amt'))}</b></td><td></td></tr></tfoot></table>
      <div class="small muted mt">Lãi trả cuối mỗi kỳ. Ghi nhận đã trả ở menu 06 › Theo dõi công nợ › HĐ vay. Tiền vay không trừ vào giá mua căn hộ.</div>`
      : '<div class="empty">Nhập Ngày bắt đầu tính lãi, Thời hạn vay, Kỳ trả lãi và tiền thuê/tháng (hoặc lãi suất) — lịch trả lãi tự lập.</div>';
  };
  const loanCalc = e => {
    if (!isVay()) return;
    const a = readField(form, { k: 'eff_on', t: 'date' }), x = $('[name=exp_on]', form);
    // ngày nhận tiền vay → ngày bắt đầu tính lãi: chỉ chép khi đã gõ đủ ngày (gõ dở «0» không chép); ô bắt đầu chưa sửa tay (trống / đang = số chép lần trước) thì chép tiếp theo
    if (e?.target?.name === 'loan_recv_on') { const ef = $('[name=eff_on]', form), v = readField(form, { k: 'loan_recv_on', t: 'date' });
      if (ef && /^\d{4}-\d{2}-\d{2}$/.test(v || '') && (!a || !ef.value.trim() || ef.value === form._effAuto || !/^\d{4}-\d{2}-\d{2}$/.test(a))) { ef.value = e.target.value; form._effAuto = ef.value; } }
    if (e?.target?.name === 'term_months' && (a || readField(form, { k: 'eff_on', t: 'date' })) && +e.target.value > 0 && x) x.value = dmy(addDays(addMon(a || readField(form, { k: 'eff_on', t: 'date' }), +e.target.value), -1));
    loanDraw();
  };
  for (const k of ['loan_recv_on', 'eff_on', 'exp_on', 'term_months', 'rent', 'loan_rate', 'int_mode', 'int_period', 'principal_method', 'value']) { const el = $(`[name=${k}]`, form); el?.addEventListener('change', loanCalc); el?.addEventListener('input', loanCalc); }
  // HĐ vay ↔ HĐ thuê: tick chọn hợp đồng loại kia (cùng căn / cùng khách), lưu vào ô link_ids — bên kia tự cập nhật khi lưu
  const lkF = $('[data-f=link_ids]', form), lkBox = document.createElement('div'); lkBox.className = 'link-ticks';
  if (lkF) { lkF.append(lkBox); const cb = $('.combo', lkF); if (cb) cb.style.display = 'none'; }
  let lkList = [];   // HĐ thuê / vay có thể đi kèm (kèm tiền thuê/tháng — HĐ vay tính lãi theo tiền thuê của HĐ thuê đã tick)
  const linkDraw = async () => {
    const g = grpOf(); if (!lkF || !['thue', 'vay'].includes(g)) return;
    const hid = $('[name=link_ids]', lkF), cur = hid ? (hid.value ? hid.value.split(',').map(Number) : []) : rec0?.link_ids || [], other = g === 'vay' ? 'thue' : 'vay';
    const list = lkList = await api('GET', '/api/contract-links?' + new URLSearchParams({ kind: other, self: rec0?.id || '', unit: form.elements.unit_id?.value || rec0?.unit_id || '', customer: form.elements.customer_id?.value || rec0?.customer_id || '', ids: cur.join(',') })).catch(() => []);
    const ro = $(':scope > .ro', lkF); if (ro) ro.style.display = 'none';
    lkBox.innerHTML = list.length ? list.map(x => `<label class="chk"><input type="checkbox" data-lk="${x.id}" ${cur.includes(x.id) ? 'checked' : ''} ${hid ? '' : 'disabled'}> <b>${esc(x.number || '#' + x.id)}</b> · ${esc(x.unit)} · ${esc(x.customer)}${other === 'thue' && x.rent ? ` · ${fm(x.rent)} đ/tháng` : x.value ? ` · ${fm(x.value)} đ` : ''}${x.exp_on ? ` · đến ${dmy(x.exp_on)}` : ''}</label>`).join('')
      : `<span class="small muted">Chưa có ${other === 'thue' ? 'HĐ thuê' : 'HĐ vay'} cùng căn / cùng khách hàng — chọn Mã căn, Khách hàng trước</span>`;
  };
  lkBox.addEventListener('change', e => { if (!e.target.dataset.lk) return; const hid = $('[name=link_ids]', lkF); if (hid) hid.value = $$('[data-lk]:checked', lkBox).map(x => x.dataset.lk).join(','); loanDraw(); });
  form.addEventListener('change', e => { if (['unit_id', 'customer_id'].includes(e.target.name)) linkDraw(); });
  // HĐ thuê: số tháng + tổng tiền tự tính khi gõ (máy chủ tính lại khi lưu, cùng công thức)
  const addMon = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); };
  const rentSched = () => {
    const el = $('[data-sched]', form); if (!el?._set) return;
    const a = readField(form, { k: 'eff_on', t: 'date' }), n = +readField(form, { k: 'term_months', t: 'int' }) || 0, p = +readField(form, { k: 'pay_times', t: 'int' }) || 0, tot = readField(form, { k: 'value', t: 'money' }) || 0, rent = readField(form, { k: 'rent', t: 'money' }) || 0;
    if (!a || !(n > 0)) return;
    if (!(p > 0) || p > n) { if (el._get().length) el._set([]); return; }   // chưa có / sai số kỳ: bỏ các kỳ đã chia theo số cũ
    const off = k => Math.round(k * n / p), each = Math.floor(tot / p / 1000) * 1000, byRent = rent > 0 && rent * n === tot;
    const rows = Array.from({ length: p }, (_, k) => {
      const m1 = off(k) + 1, m2 = off(k + 1);
      return { name: `Tiền thuê kỳ ${k + 1}/${p} (tháng ${m1 === m2 ? m1 : `${m1}–${m2}`})`, due_on: addMon(a, off(k)), pct: null, amount: byRent ? (off(k + 1) - off(k)) * rent : tot ? (k === p - 1 ? tot - each * (p - 1) : each) : null };
    });
    el._set(rows); rentDraw();
  };
  const rentCalc = e => {
    if (!isRent()) return;
    const a = readField(form, { k: 'eff_on', t: 'date' }), r = readField(form, { k: 'rent', t: 'money' });
    // gõ Số tháng: có ngày bắt đầu thì tự ra ngày kết thúc (bắt đầu + số tháng − 1 ngày)
    if (e?.target?.name === 'term_months' && a && +e.target.value > 0) { const x = $('[name=exp_on]', form); if (x) x.value = dmy(addDays(addMon(a, +e.target.value), -1)); }
    const b = readField(form, { k: 'exp_on', t: 'date' });
    let n = e?.target?.name === 'term_months' ? +e.target.value || null : null;
    if (n == null && a && b && b >= a) { const s0 = new Date(a + 'T00:00:00Z'), e = new Date(Date.parse(b + 'T00:00:00Z') + 864e5); n = (e.getUTCFullYear() - s0.getUTCFullYear()) * 12 + e.getUTCMonth() - s0.getUTCMonth(); if (e.getUTCDate() < s0.getUTCDate()) n--;
      const at = new Date(Date.UTC(s0.getUTCFullYear(), s0.getUTCMonth() + n, s0.getUTCDate())); n = Math.max(0, n + (Math.round((e - at) / 864e5) >= 15 ? 1 : 0)); }
    const tm = $('[name=term_months]', form), v = $('[name=value]', form);
    if (tm && n != null) tm.value = n;
    if (v && n && r > 0) { v.value = moneyStr(Math.round(r * n)); v.dispatchEvent(new Event('input', { bubbles: true })); }
    rentSched(); rentDraw();
  };
  for (const k of ['eff_on', 'exp_on', 'rent', 'term_months', 'pay_times']) { const el = $(`[name=${k}]`, form); el?.addEventListener('change', rentCalc); el?.addEventListener('input', rentCalc); }
  // Tổng giá thuê/tháng = Tiền thuê nhà + Tiền thuê nội thất (có nhập 1 trong 2 thì ô tổng tự cộng, không gõ tay; HĐ cũ chưa tách vẫn gõ thẳng ô tổng)
  const rH = $('[name=rent_house]', form), rF = $('[name=rent_furn]', form), rT = $('[name=rent]', form);
  const rentSum = fire => {
    if (!rT || !(rH || rF)) return;
    const h = rH?.value.trim() ? readField(form, { k: 'rent_house', t: 'money' }) : null, f = rF?.value.trim() ? readField(form, { k: 'rent_furn', t: 'money' }) : null, on = isRent() && (h != null || f != null);
    rT.readOnly = on; rT.title = on ? 'Tự cộng: tiền thuê nhà + tiền thuê nội thất' : '';
    if (on) { const v = moneyStr((+h || 0) + (+f || 0)); if (rT.value !== v) { rT.value = v; if (fire) rT.dispatchEvent(new Event('input', { bubbles: true })); } }
  };
  for (const el of [rH, rF]) el?.addEventListener('input', () => rentSum(true));
  rentSum(false);
  // chọn căn ở HĐ thuê: ô Tổng tiền bị điền giá bán căn → về tiền thuê × số tháng (chưa có tiền thuê thì để trống)
  const loanSched = () => {
    const n = parseInt(form.elements.loan_tranches?.value, 10), sch = $('[data-sched]', form);
    if (!isVay() || !(n > 0) || n > 60 || !sch?._set) return;
    const V = readField(form, { k: 'value', t: 'money' }) || 0, d0 = readField(form, { k: 'loan_recv_on', t: 'date' }) || readField(form, { k: 'contract_on', t: 'date' }) || today();
    const cur = (sch._get?.() || []).filter(r => !/Bên Mua thanh toán/i.test(r.name || ''));   // bỏ nội dung mẫu của HĐMB
    const each = Math.floor(V / n / 1000) * 1000;
    sch._set(Array.from({ length: n }, (_, k) => ({ name: cur[k]?.name || `Đợt ${k + 1}: khách chuyển tiền gốc`, due_on: cur[k]?.due_on || addMon(d0, k), pct: null, amount: V ? (k === n - 1 ? V - each * (n - 1) : each) : null })));
    loanDraw();
  };
  form.elements.loan_tranches?.addEventListener('change', loanSched);
  form.addEventListener('change', e => { if (e.target.closest?.('[data-f=loan_recv_on]') && isVay()) $('[data-sched]', form)?._redraw?.(); });   // đợt 1 theo ngày nhận tiền vay
  form.elements.value?.addEventListener('change', () => { if (isVay() && +form.elements.loan_tranches?.value > 0) loanSched(); });   // đổi số tiền vay → chia lại các đợt
  const rentValue = () => { if (!isRent()) return; const v = $('[name=value]', form); if (v) v.value = ''; rentCalc(); };
  // đổi Mua bán / Thuê / Vay: cất tổng tiền + lịch thu của loại đang xem, quay lại thì trả về — không mang giá bán sang HĐ thuê / HĐ vay hay ngược lại
  let wasG = grpOf(); const stash = {};
  const swap = () => {
    const g = grpOf(); if (g === wasG) return;
    const sch = $('[data-sched]', form), v = $('[name=value]', form); if (!sch?._get || !v) { wasG = g; return; }
    stash[wasG] = { value: v.value, sched: sch._get() }; wasG = g;
    const back = stash[g];
    if (back) { v.value = back.value; sch._set(back.sched); rentDraw(); loanDraw(); return; }
    v.value = ''; sch._set([]);
    const u = form.elements.unit_id?.value;   // mua bán: giá theo căn (giá trị hoàn thiện thuộc HĐ hoàn thiện, như khi chọn căn)
    if (g === 'thue') { rentSum(true); rentCalc(); } else if (rT) rT.readOnly = false;
    else if (u) api('GET', `/api/e/unit/${u}`).then(({ row: x }) => { const t = +x.total_price || 0, f = +x.finish_value || 0, pr = f > 0 && t > f ? t - f : t; if (!pr) return;
      if (g === 'mb' && !v.value) { v.value = moneyStr(pr); v.dispatchEvent(new Event('input', { bubbles: true })); }
      if (g === 'vay' && form.elements.sale_price && !form.elements.sale_price.value) form.elements.sale_price.value = moneyStr(pr); }).catch(() => {});
    loanDraw();
  };
  const show = p => { if (p === 'thue') setKind('thue'); else if (p === 'vay') setKind('vay'); else if (p === 'mb' && grpOf() !== 'mb') setKind('hdmb'); view(p); };   // người dùng bấm tab
  const natSel = $('[name=nature]', form), natDef = () => { if (natSel && kindSel) natSel.value = kindSel.value === 'thue' ? 'thue' : 'ban'; };   // HĐ thuê = cho thuê, HĐ vay = bán (sửa được)
  if (natSel && !natSel.value) natDef();
  kindSel?.addEventListener('change', () => { natDef(); swap(); view(grpOf()); });
  nav.onclick = e => { const b = e.target.closest('[data-p]'); if (b) show(b.dataset.p); };
  show(tab === 'ht' ? 'ht' : tab === 'thue' || isRent() ? 'thue' : tab === 'vay' || isVay() ? 'vay' : 'mb'); calc(); nav.classList.toggle('ht-has', mk().checked);
  const snap = () => ({ number: rd('ht_number', 'text') || null, contract_on: rd('ht_on', 'date'), finish_value: rd('ht_finish', 'money'), discount: rd('ht_disc', 'money'), value: val(), new_schedule: el._get() });
  const first = JSON.stringify(snap());
  return {
    id: ht?.id, status: ht?.status, snap, show, rentDraw, rentValue, loanDraw,
    sync(on) { nav.classList.toggle('hidden', !on); if (!on) view('mb'); $('[data-f=finish_value]', form)?.classList.toggle('hidden', on && !oldFinish); },
    finish(n) { if (!rd('ht_finish', 'money')) { $('[name=ht_finish]', hp).value = moneyStr(n); calc(); } },
    changed: () => !locked && (ht?.id ? JSON.stringify(snap()) !== first : mk().checked),
    filled: () => (ht?.id || mk().checked) && val() > 0,
  };
}
function bravoLayout(form, layout) {
  const take = k => { const el = $(`:scope > [data-f="${k}"]`, form); el?.classList.remove('wide'); return el; };
  const block = s => {
    const sec = document.createElement('section'); sec.className = 'bv-sec';
    if (s.t) sec.innerHTML = `<div class="fsec">${esc(s.t)}</div>`;
    for (const row of s.rows) {
      const line = document.createElement('div'); line.className = 'bv-row'; line.style.setProperty('--n', s.cols || row.length);
      for (const k of row) { const el = take(k); if (el) line.append(el); }
      if (line.children.length) sec.append(line);
    }
    return sec;
  };
  const out = layout.map(s => {
    if (!s.side) return block(s);
    const w = document.createElement('div'); w.className = 'bv-side'; w.append(...s.side.map(block)); return w;
  });
  $$(':scope > .fsec', form).forEach(x => x.remove());
  const rest = $$(':scope > .fld', form);
  if (rest.length) { const sec = block({ t: 'Thông tin khác', rows: [] }), line = document.createElement('div'); line.className = 'bv-row'; line.style.setProperty('--n', 4); rest.forEach(x => { x.classList.remove('wide'); line.append(x); }); sec.append(line); out.push(sec); }
  form.classList.add('bv'); form.append(...out);
  // nhập như BRAVO: Enter sang ô kế tiếp; ô chọn gõ mã rồi Enter / Tab là lấy dòng đầu danh sách
  form.addEventListener('keydown', e => {
    if ((e.key !== 'Enter' && e.key !== 'Tab') || e.shiftKey || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    const first = e.target.closest('.combo')?.querySelector('.opts [data-i]');
    if (first && e.target.value.trim()) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const list = $$('input:not([type=hidden]):not([readonly]):not([disabled]),select:not([disabled]),textarea:not([readonly])', form).filter(x => x.offsetParent);
    list[list.indexOf(e.target) + 1]?.focus();
  });
}

// bản sao khách hàng: chép toàn bộ thông tin, mã khách = mã gốc + -01, -02… (vd KH000158-01)
async function copyCustomer(id) {
  const E = M.ents.customer, g = await api('GET', `/api/e/customer/${id}`), r = g.row;
  if (r._masked && M.piiRoles.includes(M.me.role)) Object.assign(r, await api('GET', `/api/pii/customer/${id}`), { _masked: 0 });
  const preset = {};
  for (const f of E.fields) if (f.k !== 'code' && !f.hide && r[f.k] != null && !(f.pii && r._masked)) { preset[f.k] = r[f.k]; if (r[f.k + '__l'] != null) preset[f.k + '__l'] = r[f.k + '__l']; }
  preset.code = (await api('GET', `/api/customer-code?copy_of=${id}`)).code;
  return openForm('customer', { preset, copyOf: id, title: `Bản sao của ${r.full_name}`, onSaved: row => { toast(`Đã tạo khách hàng ${row.full_name}`); openDetail('customer', row.id); } });
}
function rowMenu(ent, id, x, y) {   // chuột phải vào dòng danh sách
  $('.vt-ctx')?.remove();
  const items = [['open', 'fa-arrow-up-right-from-square', 'Mở hồ sơ'], ...(ent === 'customer' && M.ents.customer.perm.c ? [['copy', 'fa-copy', 'Tạo bản sao mới']] : [])];
  const c = document.createElement('div'); c.className = 'vt-ctx'; c.setAttribute('role', 'menu');
  c.innerHTML = items.map(i => `<button role="menuitem" data-a="${i[0]}">${ico(i[1])} ${i[2]}</button>`).join('');
  document.body.append(c);
  c.style.left = Math.max(8, Math.min(x, innerWidth - c.offsetWidth - 8)) + 'px'; c.style.top = Math.max(8, Math.min(y, innerHeight - c.offsetHeight - 8)) + 'px';
  const off = ev => { if (!c.contains(ev.target)) { c.remove(); document.removeEventListener('mousedown', off, true); } };
  document.addEventListener('mousedown', off, true);
  c.onclick = run(async e => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; c.remove(); if (a === 'open') return openDetail(ent, id); if (a === 'copy') return copyCustomer(id); });
}
async function openForm(ent, { id, preset = {}, onSaved, title, skip = [], tab, htDraft, copyOf } = {}) {   // skip: trường không hiện trong form (vẫn gửi giá trị preset / mặc định)
  const E = M.ents[ent];
  let rec = { ...preset }, perm = null, trace = null;
  if (id) {
    const g = await api('GET', `/api/e/${ent}/${id}`); rec = g.row; perm = g.perm; trace = g.trace;
    if (E.fields.some(f => f.pii || f.grid?.some(c => c.pii)) && M.piiRoles.includes(M.me.role) && rec._masked) Object.assign(rec, await api('GET', `/api/pii/${ent}/${id}`));
  } else {
    for (const f of E.fields) if (rec[f.k] === undefined && f.def !== undefined && !f.ro) rec[f.k] = f.def === 'me' ? M.me.id : f.def === 'today' ? today() : f.def === 'now' ? new Date().toISOString() : f.def;
  }
  // hợp đồng: mở bản hoàn thiện cũng vào form của hợp đồng mua bán cùng căn, tab Hoàn thiện
  let htRec = null, htLocked = false;
  if (ent === 'contract' && id && rec.unit_id) {
    const pair = await api('GET', `/api/contract-pair/${rec.unit_id}`);
    if (rec.kind === 'hoan_thien' && pair.main) return openForm(ent, { id: pair.main, tab: 'ht', onSaved, title });
    if (rec.kind !== 'hoan_thien' && pair.finish) { const g = await api('GET', `/api/e/contract/${pair.finish}`); htRec = g.row; htLocked = !!g.perm.locked; }
  }
  const lockKeep = perm?.locked ? new Set(perm.lockKeep || []) : null;
  // khách đã ở giai đoạn sau mở bán (02 Danh mục khách hàng): Tình trạng chỉ chọn các bước sau mở bán — chọn lại «Mới»… thì khách chuyển sang 03 Tiềm năng, mất khỏi danh mục (PROSPECT ở screens.js)
  const postSale = ent === 'customer' && rec.stage && !PROSPECT.has(rec.stage);
  const fields = E.fields.filter(f => !skip.includes(f.k) && !f.noForm && !(f.ro && !id) && !(f.t === 'code' && !id && !f.manual) && !(f.t === 'json' && f.k !== 'new_schedule' && f.k !== 'sale_sched' && !f.grid))
    .map(f => postSale && f.k === 'stage' ? { ...f, o: f.o.filter(o => !PROSPECT.has(o[0])) } : f);
  const wide = f => ['long', 'check', 'json'].includes(f.t) || !!f.pick || !!f.upload;
  const body = `${E.note ? `<div class="warnbar">${ico('fa-circle-info')}<span>${esc(E.note)}</span></div>` : ''}${lockKeep ? `<div class="lockbar">${ico('fa-lock')} Bản ghi đã chốt — chỉ sửa được: ${[...lockKeep].filter(k => { const f = E.fields.find(x => x.k === k), sh = d => isShown(E.fields.find(x => x.k === d) || {}, rec); return !f?.show || isShown(f, rec) || Object.keys(f.show).every(d => lockKeep.has(d) && sh(d)); }).map(k => k === 'new_schedule' ? 'Lần thanh toán' : E.fields.find(f => f.k === k)?.l).join(', ')}</div>` : ''}${perm?.softOpen ? `<div class="warnbar">${ico('fa-unlock')}<span>Hợp đồng đã trình duyệt: nhân viên đã bị khóa, chỉ sửa được Lần thanh toán. Quản lý vẫn sửa được toàn bộ.</span></div>` : ''}<div id="ferr"></div><form class="form" autocomplete="off">${fields.map(f => {
    const ro = f.ro || (f.t === 'code' && !f.manual) || (lockKeep && !lockKeep.has(f.k)) || (f.pii && id && !M.piiRoles.includes(M.me.role) && rec[f.k]);
    return `${f.sec ? `<div class="fsec">${esc(f.sec)}</div>` : ''}<div class="fld ${wide(f) ? 'wide' : ''}" data-f="${f.k}"><label for="f_${f.k}">${esc(f.l)}${f.req && !ro ? '<span class="req">*</span>' : ''}${f.pii ? ` <span class="tag" title="Dữ liệu cá nhân — chỉ người có quyền được xem">${ico('fa-shield-halved')} định danh</span>` : ''}</label>${input(f, rec[f.k], rec, { ro })}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`;
  }).join('')}</form>`;
  const canSubmit = E.flow && !E.flow.custom && !E.flow.saveOnly && !E.direct && !id && E.flow.submit.includes(E.fields.find(f => f.k === E.flow.field)?.def);
  const m = modal({ title: title || (id ? `Sửa ${E.one} ${esc(rec.code || rec.number || '')}` : `${E.code ? `<span class="tag">${E.code}</span> ` : ''}Tạo ${E.one}`), wide: fields.length > 8 || fields.some(wide),
    body, foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="fSave">${ico('fa-floppy-disk')} ${id ? 'Lưu' : E.direct ? `Lưu ${E.one}` : E.flow?.saveOnly ? 'Lưu dự thảo' : 'Lưu nháp'}</button>${canSubmit ? `<button class="btn amb" id="fSub">${ico('fa-paper-plane')} Lưu và ${esc((E.flow.submitLabel || 'trình duyệt').toLowerCase())}</button>` : ''}` });
  const form = $('form', m.el); if (id) form.dataset.id = id;   // id bản ghi cho bảng chọn căn (thông báo bàn giao)
  $('.mf', m.el).insertAdjacentHTML('afterend', traceLine(trace));
  for (const ev of ['click', 'focusin']) form.addEventListener(ev, e => { const d = e.target.closest('.fld[data-f]'); if (d) traceField($('.trace', m.el), trace, d.dataset.f, E.fields.find(f => f.k === d.dataset.f)?.l || ''); });
  let htp = null;
  if (ent === 'handover_notice') $('.modal', m.el).classList.add('full');   // bảng căn bàn giao nhiều cột
  if (ent === 'contract') { bravoLayout(form, HD_LAYOUT); $('.modal', m.el).classList.add('full'); if (rec.kind !== 'hoan_thien') htp = hdPair(form, { ht: htRec, locked: htLocked, tab, draft: htDraft, oldFinish: +rec.finish_value > 0, kind: rec.kind, debt: rec._debt, rec0: rec }); }
  const sch = $('[data-sched]', form);
  if (sch) schedEditor(sch, rec.new_schedule || [], { bgBase: () => rec._bg_base, mdot: () => rec.maint_dot ?? 3, maint: () => ent === 'contract' && ['hdmb', 'thue_mua'].includes(form.elements.kind?.value ?? rec.kind) ? (form.elements.maint_fee ? readField(form, E.fields.find(f => f.k === 'maint_fee')) : rec.maint_fee) || 0 : null, total: () => ent === 'contract' ? (form.elements.value ? readField(form, E.fields.find(f => f.k === 'value')) : rec.value) || 0 : readField(form, E.fields.find(f => f.k === 'value_after')) || rec.value_before || 0, first: ent === 'contract' ? () => { const kd = $('[name=kind]', form)?.value ?? rec.kind; const fk = kd === 'thue' ? 'eff_on' : kd === 'vay' && form.elements.loan_recv_on?.value ? 'loan_recv_on' : 'contract_on'; return form.elements[fk] ? readField(form, E.fields.find(f => f.k === fk)) : rec[fk]; } : null });
  const ssch = $('[data-ssched]', form);   // tiến độ thu tiền HĐMB của HĐ thuê / vay bán căn: % theo Giá trị HĐMB
  if (ssch) schedEditor(ssch, rec.sale_sched || [], { total: () => { const v = readField(form, E.fields.find(f => f.k === 'unit_total')); return v === undefined ? +rec.unit_total || 0 : +v || 0; } });
  htp?.rentDraw(); htp?.loanDraw?.();
  if (ent === 'template') tplHelper(form, m);
  const vis = () => { const cur = collect(true); for (const f of fields) { const box = $(`[data-f="${f.k}"]`, form); if (box) box.classList.toggle('hidden', !isShown(f, cur)); } $$('.bv-row, .bv-sec:not(.loan-sec)', form).forEach(x => x.classList.toggle('hidden', !$('.fld:not(.hidden)', x))); htp?.sync(cur.ptype !== 'lien_ke' && ['hdmb', 'thue_mua', 'thue', 'vay'].includes(cur.kind)); };
  const collect = (all) => { const out = {}; for (const f of fields) { if (f.ro || (f.t === 'code' && !f.manual)) continue; if (lockKeep && !lockKeep.has(f.k)) continue; const v = readField(form, f); if (v !== undefined) out[f.k] = v; }
    if (form._b0 && !lockKeep && 'discount' in out) out.base_orig = +out.discount > 0 ? form._b0() : null;   // hợp đồng: giá nền gốc trước giảm giá (máy chủ tính lại từ giá này)
    return all ? { ...rec, ...out } : out; };
  // checklist theo nhóm / mẫu
  const ckF = fields.find(f => f.t === 'check' && f.src);
  const fillCheck = () => {
    if (!ckF) return; const el = $(`[name="${ckF.k}"]`, form); const cur = readCheck(el);
    if (cur.some(x => x.st || x.note)) return;
    const s = M.settings[ckF.src]; let list = Array.isArray(s) ? s : s?.[readField(form, fields.find(f => f.k === ckF.srcBy) || {})] || s?._all || [];
    list = list.map(ckItem);   // «Tên giấy tờ | 2» → số lượng mặc định
    if ($('[name=reg_kind]', form)?.value === 'thue') list = list.map(x => ({ ...x, n: x.n.replace(/(?<!thuê )\bmua\b/g, 'thuê') }));   // hồ sơ thuê: «Đơn đăng ký mua nhà» → «… thuê nhà»
    if (list.length && JSON.stringify(list.map(x => x.n)) !== JSON.stringify(cur.map(x => x.n))) el.innerHTML = checkRows(list.map(x => ({ ...x, st: '', note: '' })), 'qty' in el.dataset);
  };
  wireInputs(form, () => { vis(); });
  // mã khách hàng: Enter hoặc rời ô → báo trùng ngay dưới ô
  const codeEl = ent === 'customer' && form.elements.code;
  if (codeEl) {
    const box = document.createElement('div'), fld = codeEl.closest('.fld'); box.className = 'code-dup'; box.setAttribute('role', 'alert'); codeEl.after(box);
    let seq = 0;
    const check = run(async () => {
      const n = ++seq, v = codeEl.value.trim(), d = v ? await api('GET', `/api/customer-code?${new URLSearchParams({ code: v, id: id || '' })}`) : { dup: false };
      if (n !== seq) return;
      box.innerHTML = d.dup ? `${ico('fa-triangle-exclamation')} ${esc(d.msg)}` : ''; fld.classList.toggle('err', d.dup);
    });
    codeEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
    codeEl.addEventListener('change', check);
    codeEl.addEventListener('input', () => { seq++; box.innerHTML = ''; fld.classList.remove('err'); });
  }
  // chọn căn → cảnh báo ngay nếu căn / dự án ngoài thông báo mở bán đã duyệt gần nhất (chưa cần lưu; vẫn cho lưu như cũ)
  const unitCombo = E.fields.some(f => f.k === 'sale_check') && form.elements.unit_id?.closest?.('.combo');
  if (unitCombo) {
    const box = document.createElement('div'); unitCombo.after(box);
    let seq = 0;
    const check = async () => {
      const n = ++seq, v = form.elements.unit_id.value; box.innerHTML = ''; if (!v) return;
      const sc = await api('GET', `/api/sale-check/${v}`).catch(() => null);
      if (n === seq && sc && !sc.ok) box.innerHTML = `<div class="warnbar mt">${ico('fa-triangle-exclamation')}<div><b>Cảnh báo mở bán:</b> ${esc(sc.text.slice(2))}</div></div>`;
    };
    form.addEventListener('change', e => { if (e.target.name === 'unit_id') check(); });
    unitCombo.addEventListener('input', () => { seq++; box.innerHTML = ''; });   // đang gõ lại mã căn
    check();
  }
  // hồ sơ NOXH: chọn khách / phiếu → điền dòng chủ hộ và số tài khoản còn trống
  const fillHead = async k => {
    if (typeof k !== 'object') k = k ? (await api('GET', `/api/e/customer/${k}`)).row : null;
    if (!k) return;
    if (k._masked && M.piiRoles.includes(M.me.role)) Object.assign(k, await api('GET', `/api/pii/customer/${k.id}`));
    const [y, m, d] = String(k.birth || '').split('-'), tr = $('.gridin[name="head"] tr[data-gr]', form);
    const v = { name: k.full_name, phone: [k.phone, k.phone2].filter(Boolean).join('/ '), id_no: k.id_no, bday: d && String(+d), bmonth: m && String(+m), byear: y };
    for (const [c, x] of Object.entries(v)) { const el = tr && $(`[data-gc="${c}"]`, tr); if (el && !el.value && x && !String(x).startsWith('•')) el.value = x; }
    const ba = form.elements.bank_account; if (ba && !ba.value && k.bank_account && !String(k.bank_account).startsWith('•')) ba.value = k.bank_account;
  };
  // ô chữ có gợi ý từ danh mục (VD Mã khách hàng trên phiếu đăng ký): gõ mã / tên → sổ các mã đã có; chọn đúng 1 mã → điền thông tin theo sugFill
  for (const f of fields.filter(f => f.sugRef)) {
    const el = form.elements[f.k], dl = el && $('#dl_' + f.k, form); if (!el || !dl) continue;
    let opts = [];
    const code = o => String(o.label || '').split(' · ')[0];
    const load = debounce(async () => {
      opts = await api('GET', `/api/opts/${f.sugRef}?` + new URLSearchParams(el.value.trim() ? { q: el.value.trim() } : {}));
      dl.innerHTML = opts.map(o => `<option value="${esc(code(o))}">${esc(o.label)}${o.sub ? ' · ' + esc(o.sub) : ''}</option>`).join('');
    }, 200);
    el.addEventListener('focus', load); el.addEventListener('input', load);
    el.addEventListener('change', run(async () => {
      const o = opts.find(x => code(x).toUpperCase() === el.value.trim().toUpperCase()); if (!o) return;   // mã mới → để máy chủ tự cấp / tự khớp
      const src = (await api('GET', `/api/e/${f.sugRef}/${o.id}`)).row;
      if (src._masked && M.piiRoles.includes(M.me.role)) Object.assign(src, await api('GET', `/api/pii/${f.sugRef}/${src.id}`));
      el.value = src.code || el.value;
      for (const [to, from] of Object.entries(f.sugFill || {})) {   // đã chọn khách → lấy thông tin theo hồ sơ khách
        const t = form.elements[to], tf = fields.find(x => x.k === to), v = src[from];
        if (!t || !tf || v == null || v === '' || String(v).startsWith('•')) continue;
        t.value = tf.t === 'money' ? moneyStr(v) : tf.t === 'date' ? dmy(v) : v;
      }
    }));
  }
  // hồ sơ NOXH (11/11/2026): chọn mã căn / đổi Hình thức → tìm phiếu Đăng ký mua / thuê đang hiệu lực của căn → điền phiếu, khách, chủ hộ, số tài khoản
  if (ent === 'noxh_check' && !id) {
    const setRef = (k, v, label) => { const h = form.elements[k]; if (!h) return; h.value = v ?? ''; const t = h.closest('.combo')?.querySelector('[data-combo]'); if (t) t.value = label || ''; };
    const LIVE = ['cho_duyet', 'giu_cho', 'qua_han', 'da_coc', 'chuyen_hd', 'nhap'];
    let last = null;
    const fromUnit = async () => {
      const uid = form.elements.unit_id?.value; if (!uid) return;
      const want = form.elements.reg_kind?.value || 'mua';
      const rs = (await api('GET', `/api/e/reservation?f_unit_id=${uid}&limit=50`)).rows.filter(r => LIVE.includes(r.status))
        .sort((a, b) => (a.status === 'nhap') - (b.status === 'nhap') || b.id - a.id);   // phiếu đã giữ chỗ / đặt cọc trước phiếu mới đăng ký
      const r = rs.find(x => (x.deal || 'mua') === want) || rs[0];
      if (!r) { toast('Căn này chưa có phiếu Đăng ký mua / thuê đang hiệu lực — nhập thông tin khách bằng tay'); return; }
      if (last && last !== r.customer_id) $('.gridin[name="head"] tr[data-gr] [data-gc]', form).forEach(el => { if (!el.readOnly) el.value = ''; });   // đổi sang căn của khách khác: xóa chủ hộ đã tự điền
      setRef('reservation_id', r.id, [r.code, r.cust_name].filter(Boolean).join(' · '));
      setRef('customer_id', r.customer_id, r.customer_id__l || r.cust_name);
      if (form.elements.reg_kind && r.deal && form.elements.reg_kind.value !== r.deal) form.elements.reg_kind.value = r.deal;
      const ba = form.elements.bank_account; if (ba && last && last !== r.customer_id) ba.value = '';
      last = r.customer_id;
      await fillHead(r.customer_id);
      toast(`Đã lấy thông tin khách theo phiếu ${r.code || '#' + r.id} (${r.deal === 'thue' ? 'đăng ký thuê' : 'đăng ký mua'})`);
    };
    form.addEventListener('change', e => { if (['unit_id', 'reg_kind'].includes(e.target.name)) fromUnit().catch(err => toast(err.message, true)); });
  }
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
      if (ent === 'noxh_check') await fillHead(f.ref === 'customer' ? src : src.customer_id);
      if (ent === 'contract' && f.ref === 'unit' && !id && tab === 'ht') {   // tạo HĐ hoàn thiện cho căn đã có HĐ mua bán: mở form của căn đó
        const pair = await api('GET', `/api/contract-pair/${src.id}`);
        if (pair.main) { m.close(); return openForm(ent, { id: pair.main, tab: 'ht', onSaved }); }
      }
      if (ent === 'contract' && f.ref === 'unit') {   // như BRAVO: dự án của căn → Đơn vị / Bên A → thông tin bên bán
        const pc = M.projects.find(p => p.id === src.project_id)?.code, s = (M.sellers || []).find(x => x.projects.includes(pc)) || (M.sellers || [])[0];
        if (s && form.elements.s_name) { form.elements.seller_unit.value = s.unit; form.elements.s_name.value = s.name; await fillSeller(); }
        form.elements.ptype.value = ['lien_ke', 'shophouse'].includes(src.kind) ? 'lien_ke' : 'can_ho'; vis(); contractNo();
        const bh = form.elements.building_id, bt = bh?.closest('.combo')?.querySelector('[data-combo]'); if (bh) { bh.value = src.building_id ?? ''; if (bt) bt.value = src.building_id__l || ''; }   // số bảng giá = tòa của căn
        await contractPrefill(src.id);
        // giá nền gốc theo căn; căn chưa có đơn giá nền (chưa nạp số Bravo, VD tòa G) thì suy ra như cột Đơn giá nền ở Danh mục sản phẩm — để giảm giá, phí bảo trì 2% tính được
        const after = src.price_net ?? (src.total_price != null && src.maint_fee != null ? src.total_price - src.maint_fee - (src.finish_value || 0) : null);
        form._unitBase?.(src.base_price ?? (after != null && +src.area_tt > 0 ? Math.round((src.pretax ?? Math.round(after / (1 + (src.vat_pct ?? 5) / 100))) / src.area_tt) : null));
        // giá trị hoàn thiện theo căn thuộc hợp đồng hoàn thiện, không cộng vào hợp đồng mua bán
        const fv = readField(form, fields.find(x => x.k === 'finish_value') || {});
        if (htp && fv > 0 && form.elements.ptype.value !== 'lien_ke') { htp.finish(fv); form.elements.finish_value.value = ''; const tv = readField(form, fields.find(x => x.k === 'value')); if (tv > fv) form.elements.value.value = moneyStr(tv - fv); }
        contractCalc();
        form._ut0?.(src.total_price != null ? +src.total_price : src.price_net != null ? +src.price_net + (+src.maint_fee || 0) + (+src.finish_value || 0) : null);   // HĐ thuê: giá trị căn hộ theo danh mục − giảm giá (thông tin)
        const kd = form.elements.kind?.value; if (['vay', 'thue'].includes(kd) && form.elements.sale_price) { form.elements.sale_price.value = form.elements.value.value; if (kd === 'vay') form.elements.value.value = ''; }
        htp?.rentValue();
      }
      if (ent === 'reservation' && f.ref === 'unit' && form.elements.unit_value) {   // giá trị căn hộ = sau thuế + bảo trì; hoàn thiện theo căn
        const uv = src.price_net != null ? +src.price_net + (+src.maint_fee || 0) : src.total_price != null ? +src.total_price - (+src.finish_value || 0) : null;
        form.elements.unit_value.value = moneyStr(uv); form.elements.finish_value.value = moneyStr(src.finish_value); sumRes();
      }
    } catch (er) { toast(er.message, true); }
  });
  // hợp đồng (như BRAVO): chọn Bên A → điền thông tin bên bán; sửa ô giá → tính lại tiền (cùng công thức máy chủ) + bảng Lần thanh toán
  const fillSeller = async () => {
    const n = form.elements.s_name?.value.trim(); if (!n) return;
    const d = await api('GET', '/api/seller?name=' + encodeURIComponent(n));
    for (const [k, v] of Object.entries(d)) if (form.elements[k] && (v || k !== 'seller_unit')) form.elements[k].value = v;
  };
  // giá hợp đồng chung cư — cùng công thức máy chủ (contractPrice, server/biz.js): giá nền gốc (form._b0) × DT → trước thuế, thuế, sau thuế, bảo trì 2%;
  // có giảm giá: tổng giá − tiền giảm rồi chia ngược ra giá (trước thuế = tổng mới / (1 + thuế + 2%), giá nền = trước thuế / DT). keepBase: đang gõ ô giá nền thì không ghi đè ô đó
  const contractCalc = keepBase => {
    if (ent !== 'contract' || !form.elements.base_price) return;
    const rd = k => readField(form, fields.find(f => f.k === k) || {}), base = form._b0?.() ?? +rd('base_price'), area = +rd('area_tt'), d = +rd('discount') || 0;
    if (base > 0 && area > 0 && readField(form, fields.find(f => f.k === 'ptype')) !== 'lien_ke' && !['thue', 'vay'].includes(form.elements.kind?.value ?? rec.kind)) {   // HĐ thuê: tổng tiền = tiền thuê × số tháng, không tính theo giá nền
      const r3 = v => Math.round(v / 1000) * 1000, F0 = base * area + (+rd('floor_price') || 0) * (+rd('area_floor') || 0), cp = rd('corner_pct');
      const corner = cp != null ? Math.round(F0 * cp / 100) : +rd('corner_amt') || 0, F = F0 + corner, vat = rd('vat_pct') ?? 5;
      let P = F, after = r3(F * (1 + vat / 100)), maint = r3(F * 0.02);
      if (d > 0) { const T = after + maint - d; P = T / (1 + vat / 100 + 0.02); maint = r3(P * 0.02); after = T - maint; }
      const out = { corner_amt: corner || null, pretax: Math.round(P), vat_amt: d > 0 ? after - Math.round(P) : Math.round(F * vat / 100), after_tax: after, maint_fee: maint };
      if (!keepBase) out.base_price = d > 0 ? Math.round(P / area) : base;
      out.value = after + maint + (+rd('finish_value') || 0);
      for (const [k, v] of Object.entries(out)) if (form.elements[k]) form.elements[k].value = moneyStr(v);
    }
    const pct = readField(form, fields.find(f => f.k === 'commission_pct') || {}), val = readField(form, fields.find(f => f.k === 'value') || {});
    if (pct != null && val > 0 && form.elements.commission_amt) form.elements.commission_amt.value = moneyStr(Math.round(val * pct / 100));
    sch?._redraw?.();
  };
  // ô chọn (combo): đặt giá trị + nhãn rồi báo thay đổi để chạy tự điền theo ô đó
  const pickRef = (k, val, label) => { const h = form.elements[k]; if (!h || h.value || !val) return; h.value = val; const t = h.closest('.combo')?.querySelector('[data-combo]'); if (t) t.value = label; h.dispatchEvent(new Event('change', { bubbles: true })); };
  // chọn căn → theo phiếu giữ chỗ đang hiệu lực: khách (điền cả bên mua), ngày đề nghị mua, số bảng giá, giá trị hoàn thiện, nhân viên KD
  const contractPrefill = async unit => {
    const d = await api('GET', `/api/contract-prefill/${unit}`);
    pickRef('customer_id', d.customer_id, d.customer_label);
    if (d.request_on && form.elements.request_on && !form.elements.request_on.value) form.elements.request_on.value = dmy(d.request_on);
    if (d.finish_value != null && form.elements.finish_value) form.elements.finish_value.value = moneyStr(d.finish_value);
    const o = form.elements.owner_id; if (d.owner_id && o?.tagName === 'SELECT' && [...o.options].some(x => x.value === String(d.owner_id))) o.value = d.owner_id;
  };
  // số hợp đồng để trống → máy chủ cấp khi lưu; hiện sẵn số sẽ cấp ở ô (như BRAVO)
  const contractNo = () => { const el = form.elements.number; if (!el || id) return; api('GET', `/api/contract-number?ptype=${form.elements.ptype?.value || 'can_ho'}&on=${readField(form, fields.find(f => f.k === 'contract_on')) || ''}`).then(d => { el.placeholder = d.number; }).catch(() => {}); };
  if (ent === 'contract') {
    contractNo();
    if (!id) fillSeller().catch(() => {});   // form mới: sổ sẵn bên bán đã lưu
    // b0 = giá nền gốc (trước giảm giá): theo căn khi chọn căn, hoặc giá gõ tay vào ô giá nền; HĐ đã lưu: base_orig (HĐ cũ: giá nền + tiền giảm / DT).
    // Ô giá nền hiện giá đã chia ngược khi có giảm giá; xóa tiền giảm → về giá gốc
    const rdn = k => readField(form, fields.find(f => f.k === k) || {});
    // HĐ thuê: Giá trị HĐMB (unit_total) = Tổng giá căn hộ theo danh mục − Tiền giảm giá (trừ thẳng, như HĐMB) — chỉ để thông tin, không đổi tiền thuê.
    // ut0 = giá trước giảm: theo căn khi chọn căn; HĐ đã lưu = tổng tiền + giảm giá; sửa tay ô Tổng tiền thì lấy số đó cộng lại giảm giá
    let ut0 = form.elements.unit_total && rec.unit_total != null ? +rec.unit_total + (+rec.discount || 0) : null;
    form._ut0 = v => { ut0 = v; if (form.elements.unit_total) form.elements.unit_total.value = moneyStr(v != null ? v - (+rdn('discount') || 0) : null); };
    if (form.elements.unit_total) form.addEventListener('input', e => {
      if (e.target.name === 'unit_total') ut0 = rdn('unit_total') != null ? +rdn('unit_total') + (+rdn('discount') || 0) : null;
      if (e.target.name === 'discount' && ut0 != null) form.elements.unit_total.value = moneyStr(ut0 - (+rdn('discount') || 0));
    });
    let b0 = +rec.base_orig > 0 ? +rec.base_orig : +rec.base_price > 0 ? +rec.base_price + (+rec.discount > 0 && +rec.area_tt > 0 ? +rec.discount / +rec.area_tt : 0) : null;
    form._b0 = () => b0;
    form._unitBase = b => { if (!(b > 0) || form.elements.ptype?.value === 'lien_ke') { b0 = +rdn('base_price') || null; return; } b0 = b; form.elements.base_price.value = moneyStr(b); };   // chọn căn: giá gốc theo căn
    form.addEventListener('input', e => { if (e.target.name === 'base_price') { b0 = +rdn('base_price') || null; contractCalc(true); } });   // gõ giá nền = sửa giá gốc
    form.addEventListener('change', e => { if (e.target.name === 'base_price') contractCalc(); });   // rời ô giá nền: hiện giá đã chia ngược nếu có giảm giá
    form.addEventListener('input', e => { if (['area_tt', 'floor_price', 'area_floor', 'discount', 'corner_pct', 'vat_pct', 'finish_value', 'commission_pct', 'value'].includes(e.target.name)) contractCalc(); if (e.target.name === 'maint_fee') sch?._redraw?.(); });
    // không có giá nền: gõ Tiền trước thuế → tiền thuế, sau thuế, phí bảo trì (= 2% × tiền trước thuế, làm tròn nghìn), tổng tiền
    form.addEventListener('input', e => {
      if (!['pretax', 'vat_pct'].includes(e.target.name) || +rdn('base_price') > 0 || ['thue', 'vay', 'hoan_thien'].includes(form.elements.kind?.value ?? rec.kind)) return;
      const F = +rdn('pretax') || 0; if (!(F > 0)) return;
      const r3 = v => Math.round(v / 1000) * 1000, H = F * (rdn('vat_pct') ?? 5) / 100, out = { vat_amt: Math.round(H), after_tax: r3(F + H), maint_fee: r3(F * 0.02) };
      out.value = out.after_tax + out.maint_fee + (+rdn('finish_value') || 0);
      for (const [k, v] of Object.entries(out)) if (form.elements[k]) form.elements[k].value = moneyStr(v);
      sch?._redraw?.();
    });
    form.addEventListener('input', e => { if (e.target.name === 'contract_on') sch?._redraw?.(); if (e.target.name === 's_name' && (M.sellers || []).some(x => x.name === e.target.value)) fillSeller().catch(er => toast(er.message, true)); });
    // nhập xong ô bên bán là ghi nhớ luôn cho Bên A đó (kể cả khi hợp đồng chưa lưu được)
    form.addEventListener('change', e => { if (/^s_/.test(e.target.name) && e.target.name !== 's_name' && form.elements.s_name.value.trim()) api('PUT', '/api/seller', { name: form.elements.s_name.value, k: e.target.name, v: e.target.value }).catch(() => {}); });
    form.addEventListener('change', e => { if (e.target.name === 'contract_on') sch?._redraw?.(); if (e.target.name === 'building_id' && form.elements.unit_id.value) { form.elements.unit_id.value = ''; const t = form.elements.unit_id.closest('.combo')?.querySelector('[data-combo]'); if (t) t.value = ''; }   /* đổi tòa → chọn lại căn */ if (['contract_on', 'ptype'].includes(e.target.name)) contractNo(); if (e.target.name === 's_name') fillSeller().catch(er => toast(er.message, true)); if (e.target.name === 'seller_unit') { const s = (M.sellers || []).find(x => x.unit === e.target.value); if (s) { form.elements.s_name.value = s.name; fillSeller().catch(er => toast(er.message, true)); } } });
  }
  // phiếu thu / phiếu chi (06/11/2026): chọn mã hợp đồng hoặc mã căn → mã căn, mã KH, họ tên KH, dự án, loại HĐ, nhóm thu;
  // chọn đợt thu / kỳ trả → số tiền còn phải thu / phải trả của đợt
  if (ent === 'receipt' || ent === 'payment') {
    const inst = ent === 'receipt' ? 'installment_id' : 'loan_pay_id';
    const setRef = (k, v, label) => { const h = form.elements[k]; if (!h) return; h.value = v ?? ''; const t = h.closest('.combo')?.querySelector('[data-combo]'); if (t) t.value = v ? label : ''; };
    const set = (k, v) => { const el = form.elements[k]; if (el && v != null) el.value = v; };
    const empty = k => !form.elements[k] || !String(form.elements[k].value || '').trim();
    form.addEventListener('change', async e => {
      const k = e.target.name; if (!['contract_id', 'unit_id', inst].includes(k) || !e.target.value) return;
      try {
        const q = new URLSearchParams({ [k]: e.target.value }); if (k === inst && form.elements.contract_id.value) q.set('contract_id', form.elements.contract_id.value);
        const d = await api('GET', '/api/voucher-prefill?' + q);
        if (k !== inst) {
          if (k === 'unit_id') { if (!d.contract_id) return toast('Căn chưa có hợp đồng', true); setRef('contract_id', d.contract_id, d.contract_label); if (d.n > 1) toast(`Căn có ${d.n} hợp đồng — đã chọn ${d.contract_label}, kiểm tra lại ô Mã hợp đồng`); }
          else setRef('unit_id', d.unit_id, d.unit_label);
          set('cust_code', d.cust_code); set('cust_name', d.cust_name); set('project_name', d.project_name); set('ct_kind', d.ct_kind);
          if (ent === 'receipt') set('grp', d.grp);
          if (ent === 'payment' && empty('receiver')) set('receiver', d.cust_name);
          if (!e._init) setRef(inst, null, '');   // đổi hợp đồng: bỏ đợt của hợp đồng cũ
        } else {
          if (ent === 'receipt' && d.grp) set('grp', d.grp);
          const rem = ent === 'receipt' ? d.inst_rem : d.lp_rem; if (rem > 0 && empty('amount')) form.elements.amount.value = moneyStr(rem); else if (rem === 0) toast(ent === 'receipt' ? 'Đợt này đã thu đủ' : 'Kỳ này đã trả đủ');
          if (empty('content')) set('content', ent === 'receipt' ? `Thu tiền ${d.inst_name || ''} căn ${d.unit_code}` : `${d.lp_name} — HĐ ${d.number}`);
        }
      } catch (er) { toast(er.message, true); }
    });
    // mở form đã có sẵn hợp đồng (từ Theo dõi hợp đồng): điền luôn thông tin khách hàng
    if (!id && form.elements.contract_id?.value && empty('cust_name')) { const ev = new Event('change', { bubbles: true }); ev._init = true; form.elements.contract_id.dispatchEvent(ev); }
  }
  // phiếu đề nghị hủy / đổi: chọn hợp đồng hoặc phiếu giữ chỗ → khách hàng, SĐT, dự án, mã căn, số tiền khách đã nộp
  if (ent === 'cancel_req') form.addEventListener('change', async e => {
    if (!['unit_id', 'contract_id', 'reservation_id'].includes(e.target.name) || !e.target.value) return;
    const setRef = (k, id, label) => { const h = form.elements[k]; if (!h) return; h.value = id ?? ''; const t = h.closest('.combo')?.querySelector('[data-combo]'); if (t) t.value = id ? label : ''; };
    try {
      const d = await api('GET', `/api/cancel_prefill?${e.target.name}=${e.target.value}`);
      if (e.target.name === 'unit_id') { setRef('contract_id', d.contract_id, d.contract_label); setRef('reservation_id', d.reservation_id, d.reservation_label); if (!d.contract_id && !d.reservation_id) toast('Căn chưa có hợp đồng / phiếu giữ chỗ đang hiệu lực', true); }
      form.elements.cust_name.value = d.cust_name; form.elements.phone.value = d.phone;
      setRef('project_id', d.project_id, d.project_label); setRef('unit_id', d.unit_id, d.unit_label);
      if (e.target.name === 'contract_id' && d.reservation_id) setRef('reservation_id', d.reservation_id, d.reservation_label);
      if (form.elements.pay_amount && !form.elements.pay_amount.value && d.paid) form.elements.pay_amount.value = moneyStr(d.paid);
    } catch (er) { toast(er.message, true); }
  });
  // phiếu đăng ký: Tổng giá bán = Giá trị căn hộ + Giá trị hoàn thiện nội thất
  const sumRes = () => { const rd = k => readField(form, fields.find(f => f.k === k) || {}), uv = rd('unit_value'); if (uv != null && form.elements.price) form.elements.price.value = moneyStr(uv + (rd('finish_value') || 0)); };
  if (ent === 'reservation') form.addEventListener('input', e => { if (['unit_value', 'finish_value'].includes(e.target.name)) sumRes(); });
  // căn hộ: sửa đơn giá nền / diện tích / % thuế / giá trị hoàn thiện → tự tính lại giá theo công thức Danh mục sản phẩm (máy chủ tính lại khi lưu)
  if (ent === 'unit') form.addEventListener('input', e => {
    if (!['base_price', 'area_tt', 'vat_pct', 'finish_value'].includes(e.target.name)) return;
    const rd = k => readField(form, fields.find(f => f.k === k) || {}), base = +rd('base_price'), area = +rd('area_tt');
    if (!(base > 0 && area > 0)) return;
    const r3 = v => Math.round(v / 1000) * 1000, F = base * area, H = F * (rd('vat_pct') ?? 5) / 100, I = r3(F + H), J = r3(F * 0.02);
    const out = { pretax: Math.round(F), tax_amt: Math.round(H), price_net: I, maint_fee: J, total_price: I + J + (+rd('finish_value') || 0) };
    for (const [k, v] of Object.entries(out)) if (form.elements[k]) form.elements[k].value = moneyStr(v);
  });
  $$('[data-pick-units]', form).forEach(el => unitPicker(el, form).catch(e => toast(e.message, true)));
  $$('[data-pick-bg]', form).forEach(el => bgPicker(el, form).catch(e => toast(e.message, true)));
  if (ckF && !id) { fillCheck(); form.addEventListener('change', e => { if (e.target.name === ckF.srcBy || e.target.name === 'reg_kind') fillCheck(); }); }
  vis();
  const errBox = $('#ferr', m.el);
  const showErr = (e) => { errBox.innerHTML = `<div class="errbar">${ico('fa-triangle-exclamation')} ${esc(e.message)}</div>`; $$('.fld.err', form).forEach(x => x.classList.remove('err')); (e.fields || []).forEach(k => $(`[data-f="${k}"]`, form)?.classList.add('err')); errBox.scrollIntoView({ block: 'nearest' }); };
  const showWarn = w => { if (w?.length) errBox.innerHTML = `<div class="warnbar">${ico('fa-circle-exclamation')}<div>${w.map(esc).join('<br>')}</div></div>`; };
  const send = async (check) => {
    const data = collect();
    for (const k of skip) if (rec[k] !== undefined && !(k in data)) data[k] = rec[k];
    for (const f of fields) if (!isShown(f, { ...rec, ...data }) && f.k in data && !f.ro) data[f.k] = null;
    return id ? api('PUT', `/api/e/${ent}/${id}${check ? '?check=1' : ''}`, data) : api('POST', `/api/e/${ent}?${check ? 'check=1&' : ''}${copyOf ? 'copy_of=' + copyOf : ''}`, data);
  };
  const save = async (andSubmit) => {
    if (htp?.filled() && +readField(form, fields.find(x => x.k === 'finish_value') || {}) > 0) { htp.show('mb'); return showErr(new Error('Giá trị hoàn thiện đã nhập ở tab Hoàn thiện căn hộ — để trống ô này ở hợp đồng mua bán')); }
    const btns = $$('.mf .btn', m.el); btns.forEach(b => b.disabled = true);
    try {
      const r = await send(false);
      if (htp) try {   // hợp đồng mua bán đã lưu: hoàn thiện lỗi thì mở lại form đúng bản vừa lưu, giữ số vừa nhập
        const h = htp.snap(), c = r.row;
        let hid = htp.id;
        // phần trên 2 tab dùng chung: lưu là cập nhật cả hợp đồng hoàn thiện (trừ tiền hoa hồng, diện tích chung tính riêng từng hợp đồng)
        const shared = Object.fromEntries(Object.entries(collect()).filter(([k]) => /^(customer_id|owner_id|b_|s_|seller_unit|agreement|request_on|co_owner|all_signed)/.test(k)));
        const stale = hid && ['du_thao', 'tu_choi'].includes(htp.status) && Object.entries(shared).some(([k, x]) => String(htRec[k] ?? '') !== String(x ?? ''));
        if (htp.changed() || stale) {
          const base = { kind: 'hoan_thien', ptype: c.ptype, unit_id: c.unit_id, reservation_id: c.reservation_id };
          hid = (await (hid ? api('PUT', `/api/e/contract/${hid}`, { ...(stale ? shared : {}), ...h }) : api('POST', '/api/e/contract', { customer_id: c.customer_id, owner_id: c.owner_id, ...base, ...shared, ...h }))).row.id;
        }
        if (andSubmit && hid && ['du_thao', 'tu_choi', undefined].includes(htp.status)) await api('POST', `/api/e/contract/${hid}/submit`, {});
      } catch (e2) {
        if (andSubmit) await api('POST', `/api/e/${ent}/${r.row.id}/submit`, {}).catch(() => {});
        m.close(); refresh(); toast('Hợp đồng mua bán đã lưu; hợp đồng hoàn thiện chưa lưu: ' + e2.message, true);
        openForm(ent, { id: r.row.id, tab: 'ht', onSaved, htDraft: (({ number, contract_on: on, finish_value: finish, discount: disc, new_schedule: sched }) => ({ number, on, finish, disc, sched }))(htp.snap()) });
        return r.row;
      }
      // tệp đính kèm chọn ngay trong form (vd. Tệp nguồn PDF) → lưu vào mục Tệp của bản ghi
      for (const f of fields.filter(x => x.upload)) { const file = $(`[name="${f.k}"]`, form)?.files?.[0]; if (!file) continue; const fd = new FormData(); fd.append('kind', 'nguon'); fd.append('file', file, file.name); await api('POST', `/api/files/${ent}/${r.row.id}`, fd); }
      if (andSubmit) await api('POST', `/api/e/${ent}/${r.row.id}/submit`, {});
      m.close(); toast((andSubmit ? 'Đã lưu và trình duyệt' : 'Đã lưu') + (r.warnings?.length ? ' — lưu ý: ' + r.warnings.join('; ') : ''), !!r.warnings?.some(w => /thông báo mở bán/.test(w)));
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
  let units = [], sel = new Set(String(hid.value).toUpperCase().split(/[,;\s]+/).filter(Boolean)), loadedFor = null, q = '';
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
    hid.value = keep.length && !sel.has('*') ? keep.join(',') : 'none' in hid.dataset ? '' : '*'; sel = new Set(hid.value.split(',').filter(Boolean)); draw();   // data-none: đổi dự án thì bỏ chọn hết
  });
  await load();
}

// ---------- Mẫu biểu theo từng module (11/11/2026) ----------
// Mẫu gắn module (ô «Hiện ở module») → nút «Mẫu biểu» ở danh sách module đó (tạo / sửa / xem thử) và nút «In theo mẫu» trên từng bản ghi.
const tplPlaces = () => M.ents.template?.fields.find(f => f.k === 'ent')?.o || [];
const tplOn = ent => tplPlaces().some(o => o[0] === ent);
const tplPlace = ent => tplPlaces().find(o => o[0] === ent)?.[1] || ent;
// loại mẫu mặc định khi tạo trong module (loại = bộ in riêng cũ của hợp đồng, đơn đăng ký, biên bản giao nhận, thông báo mở bán)
const TPL_KIND0 = { contract: 'hop_dong', contract_change: 'phu_luc', handover: 'bien_ban', defect: 'bien_ban', reservation: 'de_nghi', noxh_check: 'bien_ban_giao_nhan', sale_notice: 'thong_bao', handover_notice: 'thong_bao', notice: 'thong_bao', report: 'bao_cao', target: 'bao_cao', receipt: 'de_nghi', payment: 'de_nghi', pinkbook: 'de_nghi' };
// mẫu dùng bộ in riêng (trường trộn riêng, xem chú thích ô Nội dung mẫu) — còn lại in bằng bộ in chung
const tplSpecial = t => (t.ent === 'reservation' && ['dang_ky_can', 'dang_ky_noi_that'].includes(t.kind)) || (['reservation', 'noxh_check'].includes(t.ent) && t.kind === 'bien_ban_giao_nhan') || (t.ent === 'sale_notice' && t.kind === 'thong_bao' && /^TB-MOBAN/i.test(t.code || ''));
function tplUrl(ent, id, t) {
  const c = encodeURIComponent(t.code);
  if (ent === 'reservation' && ['dang_ky_can', 'dang_ky_noi_that'].includes(t.kind)) return `/print/reservation/${id}?kind=${t.kind}&tpl=${c}`;
  if (['reservation', 'noxh_check'].includes(ent) && t.kind === 'bien_ban_giao_nhan') return `/print/handover/${ent === 'reservation' ? 'reservation' : 'noxh'}/${id}?tpl=${c}`;
  if (ent === 'sale_notice' && t.kind === 'thong_bao' && /^TB-MOBAN/i.test(t.code)) return `/print/sale_notice/${id}?kind=thong_bao&tpl=${c}`;
  return `/print/tpl/${ent}/${id}?tpl=${c}`;
}
// --- mẫu theo dự án / tòa: dòng «căn … thuộc …», danh sách chọn, nút «Tạo mẫu riêng cho tòa / dự án này» (điền sẵn phạm vi)
const scLabel = sc => sc?.pcode ? `${sc.pname || sc.pcode}${sc.bcode ? ' › ' + (sc.bname || 'Tòa ' + sc.bcode) : ''}` : '';
const tplScopeBar = sc => sc?.pcode ? `<div class="tplsc">${ico('fa-location-dot')} ${sc.unit ? `Căn <b>${esc(sc.unit)}</b> · ` : ''}${esc(scLabel(sc))} — chỉ hiện mẫu của dự án / tòa này và mẫu chung</div>` : '';
const LV_L = { 2: 'mẫu riêng của tòa', 1: 'mẫu riêng của dự án', 0: 'mẫu chung' };
const tplRadios = (ts, pre) => ts.map(t => `<label class="chk tplr"><input type="radio" name="tpl" value="${esc(t.code)}" ${t === pre ? 'checked' : ''}><span><b>${esc(t.name)}</b> <span class="muted small">${esc(t.code)}${t.lv != null ? ' · ' + LV_L[t.lv] : ''}</span></span></label>`).join('');
const tplNewBtn = sc => M.ents.template?.perm?.c && sc?.pcode ? `<button class="btn" id="pNew" title="Tạo mẫu mới, tự gắn với ${esc(scLabel(sc))}">${ico('fa-plus')} Tạo mẫu cho ${esc(sc.bcode ? (sc.bname || 'tòa ' + sc.bcode) : (sc.pname || sc.pcode))}</button>` : '';
function tplNewWire(m, sc, ent, kind, reopen) {
  const b = $('#pNew', m.el); if (!b) return;
  b.onclick = () => { m.close(); openForm('template', { preset: { ent, kind, active: true, scope: sc.bcode ? `${sc.pcode}-${sc.bcode}` : sc.pcode, code: `${({ dang_ky_can: 'DK', dang_ky_noi_that: 'DK-NT', bien_ban_giao_nhan: 'BBGN', hop_dong: 'HD' })[kind] || 'MAU'}-${sc.pcode}${sc.bcode ? '-' + sc.bcode : ''}`.toUpperCase(), name: `Mẫu – ${scLabel(sc)}` }, title: `Tạo mẫu · ${esc(scLabel(sc))}`, onSaved: () => reopen() }); };
}
document.addEventListener('click', e => { const b = e.target.closest('[data-tpls]'); if (b) tplManager(b.dataset.tpls); });   // nút «Mẫu biểu» ở màn tự dựng (khách hàng, sản phẩm)
async function tplPrint(ent, id) {
  const [ts, sc] = await Promise.all([api('GET', `/api/templates?ent=${ent}&active=1&rec=${id}`), api('GET', `/api/template-scope/${ent}/${id}`)]);
  const m = modal({ title: `${ico('fa-print')} In theo mẫu`, narrow: true, body: `${tplScopeBar(sc)}${ts.length ? `<div class="small muted mb">Chọn mẫu in</div>${tplRadios(ts, ts[0])}` : `<div class="empty">Chưa có mẫu cho ${esc(scLabel(sc) || tplPlace(ent))}.</div>`}`,
    foot: `<button class="btn" data-x>Hủy</button>${tplNewBtn(sc)}${ts.length ? `<button class="btn pri" id="pOk">${ico('fa-print')} In</button>` : ''}` });
  tplNewWire(m, sc, ent, TPL_KIND0[ent] || 'thong_bao', () => tplPrint(ent, id));
  $('#pOk', m.el) && ($('#pOk', m.el).onclick = () => { const c = $('input[name=tpl]:checked', m.el).value; m.close(); window.open(tplUrl(ent, id, ts.find(t => t.code === c)), '_blank'); });
}
async function tplManager(ent) {
  const E = M.ents[ent], TE = M.ents.template, canC = !!TE.perm?.c;
  const kindL = Object.fromEntries(TE.fields.find(f => f.k === 'kind').o);
  const m = modal({ title: `${ico('fa-file-lines')} Mẫu biểu · ${esc(E.title)}`, wide: true, body: `<div class="warnbar">${ico('fa-circle-info')}<span>Mẫu ở đây hiện ở nút <b>«In theo mẫu»</b> khi mở một ${esc(E.one)} — <b>${esc(tplPlace(ent))}</b>. Bấm một mẫu để sửa; trong form có danh sách trường trộn bấm để chèn và nút Xem thử.</span></div><div id="tmL"><div class="empty">Đang tải…</div></div>`,
    foot: `<button class="btn" data-x>Đóng</button>${canC ? `<button class="btn pri" id="tmNew">${ico('fa-plus')} Tạo mẫu mới cho màn này</button>` : ''}` });
  const load = async () => {
    const ts = await api('GET', `/api/templates?ent=${ent}`);
    $('#tmL', m.el).innerHTML = ts.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Mã mẫu</th><th>Tên mẫu</th><th>Loại</th><th>Áp dụng cho</th><th>Đang dùng</th><th></th></tr></thead><tbody>${ts.map(t => `<tr data-id="${t.id}" style="cursor:pointer"><td>${esc(t.code)}</td><td><b>${esc(t.name)}</b></td><td>${esc(kindL[t.kind] || t.kind)}</td><td>${t.scope ? esc(t.scope) : '<span class="muted">mẫu chung</span>'}${t.bedrooms ? ' · ' + t.bedrooms + ' PN' : ''}</td><td>${t.active ? `<span class="tag ok">Đang dùng</span>` : '<span class="tag">Tắt</span>'}</td><td style="text-align:right"><button class="btn sm ghost" data-ed="${t.id}">${ico('fa-pen')} ${canC ? 'Sửa' : 'Xem'}</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">Chưa có mẫu nào cho màn này.${canC ? ' Bấm «Tạo mẫu mới cho màn này».' : ''}</div>`;
  };
  $('#tmL', m.el).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) openForm('template', { id: +tr.dataset.id, onSaved: load }); };
  $('#tmNew', m.el) && ($('#tmNew', m.el).onclick = () => openForm('template', { preset: { ent, kind: TPL_KIND0[ent] || 'thong_bao', active: true }, title: `Tạo mẫu · ${esc(E.title)}`, onSaved: load }));
  await load();
}
// form mẫu: tích dự án / tòa áp dụng → ghi vào ô «Áp dụng cho dự án / tòa» (CTS = cả dự án, CTS-O = tòa O)
async function tplScopePick(form) {
  const inp = form.elements.scope; if (!inp) return;
  const [ps, bs] = await Promise.all([api('GET', '/api/e/project?limit=500&sort=code'), api('GET', '/api/e/building?limit=5000&sort=code')]);
  const box = document.createElement('div'); box.className = 'fld wide tplsp';
  const keys = () => new Set(String(inp.value || '').split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean));
  const draw = () => { const k = keys();
    box.innerHTML = `<label>Tích dự án / tòa dùng mẫu này <span class="muted small">— không tích = mẫu chung cho mọi dự án</span></label><div class="tplsp-l">${ps.rows.map(p => { const P = p.code.toUpperCase(), tb = bs.rows.filter(b => b.project_id === p.id);
      return `<div class="tplsp-p"><label class="chk"><input type="checkbox" data-sk="${esc(P)}" ${k.has(P) ? 'checked' : ''}> <b>${esc(p.name)}</b> <span class="muted small">${esc(p.code)}</span></label>${tb.length ? `<span class="tplsp-b">${tb.map(b => { const K = `${P}-${b.code.toUpperCase()}`; return `<label class="chk"><input type="checkbox" data-sk="${esc(K)}" ${k.has(K) || k.has(P) ? 'checked' : ''} ${k.has(P) ? 'disabled' : ''}> ${esc(b.name || 'Tòa ' + b.code)}</label>`; }).join('')}</span>` : ''}</div>`; }).join('')}</div>`; };
  box.onchange = e => { const c = e.target.closest('[data-sk]'); if (!c) return; const k = keys(), K = c.dataset.sk;
    if (c.checked) { k.add(K); if (!K.includes('-')) for (const x of [...k]) if (x.startsWith(K + '-')) k.delete(x); } else k.delete(K);   // tích cả dự án thì bỏ từng tòa của dự án đó
    inp.value = [...k].join(', '); inp.dispatchEvent(new Event('input', { bubbles: true })); draw(); };
  inp.readOnly = true; inp.placeholder = 'Mẫu chung — mọi dự án (tích chọn ở khung bên dưới)';   // chỉ chọn theo dự án / tòa hiện có, không gõ tay (Tâm 11/11/2026)
  inp.closest('.fld').after(box); draw();
}
// form mẫu: dòng «Mẫu này hiện ở…», trường trộn theo module (bấm để chèn vào chỗ con trỏ), Xem thử với bản ghi mới nhất
function tplHelper(form, m) {
  const ta = form.elements.content, sel = form.elements.ent; if (!ta || !sel) return;
  const box = document.createElement('div'); box.className = 'fld wide tplh';
  box.innerHTML = `<div class="tplh-where" id="thW"></div><label>Trường trộn — bấm để chèn vào nội dung</label><div id="thC" class="tplh-chips"></div>
    <div class="tplh-foot"><button type="button" class="btn sm" id="thP">${ico('fa-eye')} Xem thử với dữ liệu thật</button><span class="small muted" id="thN"></span></div>`;
  ta.closest('.fld').after(box);
  let pos = null; ta.addEventListener('blur', () => { pos = [ta.selectionStart, ta.selectionEnd]; });
  const put = txt => { const [a, b] = pos || [ta.value.length, ta.value.length]; ta.value = ta.value.slice(0, a) + txt + ta.value.slice(b); ta.focus(); ta.selectionStart = ta.selectionEnd = a + txt.length; pos = [a + txt.length, a + txt.length]; ta.dispatchEvent(new Event('input', { bubbles: true })); };
  const draw = async () => {
    const ent = sel.value, kind = form.elements.kind?.value, code = form.elements.code?.value || '';
    $('#thW', box).innerHTML = ent ? `${ico('fa-location-dot')} Mẫu này hiện ở <b>${esc(tplPlace(ent))}</b> — nút «In theo mẫu» khi mở một ${esc(M.ents[ent]?.one || 'bản ghi')}` : `${ico('fa-circle-info')} Chọn <b>Hiện ở module</b> để xem trường trộn`;
    $('#thN', box).textContent = ent && tplSpecial({ ent, kind, code }) ? 'Loại mẫu này in bằng bộ in riêng — trường trộn riêng xem ở chú thích ô Nội dung mẫu' : '';
    if (!ent) { $('#thC', box).innerHTML = ''; return; }
    const gs = await api('GET', `/api/template-fields/${ent}`);
    $('#thC', box).innerHTML = gs.map(g => `<div class="tplh-g"><b>${esc(g.g)}</b>${g.items.map(x => `<button type="button" class="tplh-chip" data-k="${esc(x.k)}" title="{${esc(x.k)}}">${esc(x.l)}</button>`).join('')}</div>`).join('');
  };
  $('#thC', box).onclick = e => { const b = e.target.closest('[data-k]'); if (b) put(`{${b.dataset.k}}`); };
  tplScopePick(form);
  sel.addEventListener('change', draw); form.elements.kind?.addEventListener('change', draw);
  $('#thP', box).onclick = async () => {
    const w = window.open('', '_blank');   // mở cửa sổ trước (sau khi chờ máy chủ trình duyệt chặn cửa sổ bật lên)
    try {
      const r = await api('POST', '/api/template-preview', { ent: sel.value, content: ta.value, name: form.elements.name?.value, code: form.elements.code?.value });
      w.document.open(); w.document.write(r.html); w.document.close();
    } catch (e) { w && w.close(); toast(e.message, true); }
  };
  draw();
}

// ---------- thao tác nghiệp vụ ----------
// 13/11/2026 (Tâm): hợp đồng chuyển trạng thái (VD «Đã ký», thanh lý) → thẻ gợi ý bộ hồ sơ của bước tiếp theo + dữ liệu còn thiếu,
// bấm mở bộ hồ sơ / in cả bộ / điền dữ liệu thiếu ngay — không phải tự nhớ bước nào và tự mở từng hồ sơ
async function hsNextHint(id, before) {
  try {
    const c = (await api('GET', `/api/e/contract/${id}`)).row; if (!c || !c.unit_id || c.status === before) return;
    const d = await api('GET', `/api/hs?unit=${c.unit_id}&cust=${c.customer_id || ''}`), bo = d.bos.find(b => b.k === d.step); if (!bo || !bo.tpls.length) return;
    const miss = [...new Set(bo.tpls.flatMap(t => t.missing || []))], codes = bo.tpls.map(t => t.code).join(',');
    const st = M.ents.contract.fields.find(f => f.k === 'status')?.o?.find(o => o[0] === c.status)?.[1] || c.status;
    $('#hsNext')?.remove();
    const el = document.createElement('div'); el.id = 'hsNext'; el.setAttribute('role', 'dialog');
    el.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9000;width:min(420px,calc(100vw - 32px));background:var(--card,#fff);color:inherit;border:1px solid var(--line,#d4deea);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.22);padding:14px 16px;font-size:13px';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><b style="font-size:14px">${ico('fa-lightbulb')} Gợi ý bước hồ sơ tiếp theo</b><button class="btn sm" data-n="x" title="Để sau">✕</button></div>
      <div style="margin:6px 0;color:var(--muted,#5b6b7f)">Căn <b>${esc(d.unit.code)}</b>${d.customer ? ` · ${esc(d.customer.name)}` : ''} — hợp đồng ${esc(c.number || '#' + c.id)} vừa chuyển «${esc(st)}»</div>
      <div style="margin:8px 0">Bộ hồ sơ cần làm: <b>${esc(bo.l)}</b> · ${bo.tpls.length} hồ sơ</div>
      ${miss.length ? `<div class="warnbar" style="margin:6px 0">${ico('fa-triangle-exclamation')}<span>Còn thiếu ${miss.length} dữ liệu: ${esc(miss.slice(0, 8).join(', '))}${miss.length > 8 ? '…' : ''}</span></div>` : `<div style="color:#1d7a46;margin:6px 0">${ico('fa-circle-check')} Đủ dữ liệu — in được ngay</div>`}
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px"><button class="btn pri sm" data-n="open">${ico('fa-folder-open')} Mở bộ hồ sơ</button><button class="btn sm" data-n="print">${ico('fa-print')} In cả bộ</button>${miss.length ? `<button class="btn sm" data-n="fill">${ico('fa-pen')} Điền dữ liệu thiếu</button>` : ''}</div>`;
    document.body.append(el);
    el.onclick = e => { const n = e.target.closest('[data-n]')?.dataset.n; if (!n) return; el.remove();
      if (n === 'open') location.hash = `#/v/vault?tab=bo&unit=${encodeURIComponent(d.unit.code)}&bo=${bo.k}&cust=${d.cust || ''}`;
      if (n === 'print') window.open(`/print/hs/${d.unit.id}?bo=${bo.k}&cust=${d.cust || ''}&tpl=${encodeURIComponent(codes)}`, '_blank');
      if (n === 'fill') openForm('contract', { id: c.id }); };
  } catch (e) { console.warn('gợi ý hồ sơ', e); }
}
async function doAct(ent, id, k, after, row) {
  const E = M.ents[ent], a0 = E.acts.find(x => x.k === k);
  // Lập hợp đồng từ phiếu: phiếu đăng ký thuê → chỉ HĐ thuê; phiếu đăng ký mua → không có HĐ thuê
  const a = ent === 'reservation' && k === 'to_contract' && a0 ? { ...a0, ask: a0.ask.map(f => f.k !== 'kind' ? f : row?.deal === 'thue' ? { ...f, def: 'thue', o: f.o.filter(o => o[0] === 'thue') } : { ...f, o: f.o.filter(o => o[0] !== 'thue') }) } : a0;
  if (k === 'schedule') return scheduleModal(id, after);
  if (k === 'print') { window.open(`/print/contract/${id}`, '_blank'); return; }
  if (a?.url) { window.open(a.url.replace(':id', id), '_blank'); return; }
  if (a?.handover) return handoverPick(a.handover, id);
  const go = async data => { const before = ent === 'contract' ? (row?.status ?? (await api('GET', `/api/e/contract/${id}`).catch(() => null))?.row?.status) : undefined;
    const r = await api('POST', `/api/e/${ent}/${id}/act/${k}`, data); toast(r.msg || `Đã ${a.l.toLowerCase()}`); if (r.url) window.open(r.url, '_blank'); after && after(); if (r.open) openDetail(r.open[0], r.open[1]);
    if (ent === 'contract') hsNextHint(id, before);   // HĐ đổi trạng thái → gợi ý bộ hồ sơ bước tiếp theo
    return r; };
  if (!a.ask?.length) { if (a.danger && !await ask(a.l, 'Xác nhận thực hiện?', { danger: 1, okLabel: a.l })) return; return run(go)({}); }
  const rec = {}; for (const f of a.ask) if (f.def !== undefined) rec[f.k] = f.def === 'today' ? today() : f.def;
  const m = modal({ title: `${ico(a.icon)} ${esc(a.l)}`, narrow: a.ask.length < 3, body: `${a.help ? `<div class="warnbar">${ico('fa-circle-info')}<span>${esc(a.help)}</span></div>` : ''}<div id="aerr"></div><form class="form">${a.ask.map(f => `<div class="fld ${f.t === 'long' || a.ask.length < 2 ? 'wide' : ''}" data-f="${f.k}"><label>${esc(f.l)}${f.req ? '<span class="req">*</span>' : ''}</label>${input(f, rec[f.k], rec)}</div>`).join('')}</form>`,
    foot: `<button class="btn" data-x>Hủy</button><button class="btn ${a.danger ? 'danger' : 'pri'}" id="aOk">${esc(a.l)}</button>` });
  const form = $('form', m.el); wireInputs(form);
  $('#aOk', m.el).onclick = async () => { const data = {}; for (const f of a.ask) data[f.k] = readField(form, f); try { await go(data); m.close(); } catch (e) { $('#aerr', m.el).innerHTML = `<div class="errbar">${esc(e.message)}</div>`; } };
}
async function scheduleModal(contractId, after) {
  const g = await api('GET', `/api/e/contract/${contractId}`); const c = g.row;
  const rows = (c._debt?.inst || []).map(i => ({ name: i.name, due_on: i.due_on, pct: i.pct, amount: i.amount, ...(i.is_maint ? { maint: true } : {}) }));   // giữ dòng phí bảo trì riêng (không thì thành đợt thường + thêm dòng bảo trì mới = tính 2 lần)
  const m = modal({ title: `${ico('fa-calendar-days')} Lịch thanh toán — ${esc(c.number)}`, wide: true, body: `<div id="serr"></div><div class="small muted mb">Giá trị hợp đồng <b>${fm(c.value)}</b> đ · căn ${esc(c.unit_id__l)} · ${esc(c.customer_id__l)}</div><div id="sch"></div>`,
    foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="sOk">${ico('fa-floppy-disk')} Lưu lịch thanh toán</button>` });
  const el = $('#sch', m.el), sale = ['hdmb', 'thue_mua'].includes(c.kind); schedEditor(el, rows, { total: c.value, base: c.plan_sign || today(), maint: () => sale ? +c.maint_fee || 0 : null, mdot: () => c.maint_dot ?? 3 });
  $('#sOk', m.el).onclick = async () => { try { const r = await api('POST', `/api/e/contract/${contractId}/act/schedule`, { rows: el._get() }); m.close(); toast(r.msg); after && after(); } catch (e) { $('#serr', m.el).innerHTML = `<div class="errbar">${esc(e.message)}</div>`; } };
}

// in bản đăng ký từ phiếu GD-01: chọn mẫu in (Quản trị › Mẫu biểu, loại «Bản đăng ký căn hộ / nội thất»)
async function printPick(id, kind) {   // bấm In → chọn 1 trong các mẫu đơn đăng ký (mẫu hợp với căn được chọn sẵn)
  const nt = kind === 'dang_ky_noi_that';   // nút Nội thất: mẫu có chữ «hoàn thiện căn hộ»; nút Căn hộ: các mẫu còn lại
  const [all, sc] = await Promise.all([api('GET', `/api/templates?all=1&res=${id}`), api('GET', `/api/template-scope/reservation/${id}`)]);
  const ts = all.filter(t => (t.kind === 'dang_ky_noi_that' || /hoàn thiện căn hộ/i.test(t.label)) === nt && t.lv >= 0).sort((a, b) => b.lv - a.lv);   // chỉ mẫu của đúng dự án / tòa và mẫu chung
  const pre = ts.find(t => t.fit) || ts[0];
  const m = modal({ title: `${ico('fa-print')} In đơn đăng ký`, narrow: true, body: `${tplScopeBar(sc)}${ts.length ? `<div class="small muted mb">Chọn mẫu in</div>${tplRadios(ts.map(t => ({ ...t, name: t.label })), pre)}` : `<div class="empty">Chưa có mẫu đơn đăng ký cho ${esc(scLabel(sc))}.</div>`}`,
    foot: `<button class="btn" data-x>Hủy</button>${tplNewBtn(sc)}${ts.length ? `<button class="btn pri" id="pOk">${ico('fa-print')} In</button>` : ''}` });
  tplNewWire(m, sc, 'reservation', kind, () => printPick(id, kind));
  $('#pOk', m.el) && ($('#pOk', m.el).onclick = () => { const c = $('input[name=tpl]:checked', m.el); const t = ts.find(x => x.code === c.value); m.close(); window.open(`/print/reservation/${id}?kind=${t.kind}&tpl=${encodeURIComponent(t.code)}`, '_blank'); });
}

// in biên bản giao nhận hồ sơ (từ phiếu đăng ký / hồ sơ NOXH): chọn mẫu theo công ty — Cát Tường, Thống Nhất… (Quản trị › Mẫu biểu)
async function handoverPick(kind, id) {
  const ent = kind === 'reservation' ? 'reservation' : 'noxh_check';
  const [all, sc] = await Promise.all([api('GET', `/api/handover-templates?${kind}=${id}`), api('GET', `/api/template-scope/${ent}/${id}`)]);
  const go = code => window.open(`/print/handover/${kind}/${id}${code ? '?tpl=' + encodeURIComponent(code) : ''}`, '_blank');
  const ts = all.filter(t => t.fit).sort((a, b) => b.lv - a.lv);   // chỉ mẫu của đúng dự án / tòa và mẫu chung
  const pre = ts.find(t => t.best) || ts[0];
  const m = modal({ title: `${ico('fa-file-signature')} In biên bản giao nhận hồ sơ`, narrow: true, body: `${tplScopeBar(sc)}${ts.length ? `<div class="small muted mb">Chọn mẫu in</div>${tplRadios(ts, pre)}` : `<div class="empty">Chưa có mẫu biên bản cho ${esc(scLabel(sc))}.</div>`}`,
    foot: `<button class="btn" data-x>Hủy</button>${tplNewBtn(sc)}${ts.length ? `<button class="btn pri" id="pOk">${ico('fa-print')} In</button>` : ''}` });
  tplNewWire(m, sc, ent, 'bien_ban_giao_nhan', () => handoverPick(kind, id));
  $('#pOk', m.el) && ($('#pOk', m.el).onclick = () => { const c = $('input[name=tpl]:checked', m.el); m.close(); go(c.value); });
}

// ---------- ngăn chi tiết ----------
let DR = null;
function closeDetail() { DR?.ov.remove(); DR?.el.remove(); DR = null; }
// như BRAVO: Đã tạo … | Đã sửa … (người sửa)
const traceLine = t => !t?.created_at ? '' : `<div class="trace">Đã tạo: ${dmyhm(t.created_at)}${t.created_by ? ` (${esc(t.created_by)})` : ''}${t.updated_at ? ` | Đã sửa: ${dmyhm(t.updated_at)}${t.updated_by ? ` (${esc(t.updated_by)})` : ''}` : ''}</div>`;
// bấm vào một ô: dòng nhỏ đổi sang ai lập, ai sửa đúng ô đó
function traceField(box, t, k, label) {
  if (!box || !t) return;
  const e = t.fields?.[k === 'new_schedule' ? 'lich' : k];
  box.innerHTML = `<b>${esc(label)}</b>: lập ${dmyhm(t.created_at)}${t.created_by ? ` (${esc(t.created_by)})` : ''} | ${e ? `sửa gần nhất ${dmyhm(e.at)} (${esc(e.who)})` : 'chưa ai sửa'}`;
}
async function openDetail(ent, id, tab, plain) {   // plain: chỉ xem (mở từ Lịch ký) — không hàng nút, không dòng báo chốt, ẩn ô trống
  const E = M.ents[ent]; if (!E) return;
  let g; try { g = await api('GET', `/api/e/${ent}/${id}`); } catch (e) { return toast(e.message, true); }
  closeDetail();
  const ov = document.createElement('div'); ov.className = 'drawer-ov'; ov.onclick = closeDetail;
  const el = document.createElement('aside'); el.className = `drawer ${plain ? 'plain' : ''}`; el.setAttribute('role', 'dialog');
  document.body.append(ov, el);
  DR = { ov, el, ent, id };
  const reload = async (t) => { const keepTab = t || $('.tabs button.on', el)?.dataset.tab; await openDetail(ent, id, keepTab, plain); refresh(true); };
  const r = g.row, p = g.perm, st = E.fields.find(f => f.k === 'status');
  const title = r.code || r.number || r.voucher_no || r.title || r.full_name || r[E.fields[0].k + '__l'] || `${E.one} #${r.id}`;
  const unitId = ent === 'unit' ? r.id : r.unit_id;
  const acts = (E.acts || []).filter(a => p.acts.includes(a.k) && !a.noBtn);   // noBtn: thao tác không hiện thành nút (VD Lập lịch thanh toán — soạn ở form)   // phiếu đăng ký thuê: ẩn nút In bản đăng ký (các mẫu in hiện có đều là đơn đăng ký mua)
  const tabs = [['info', 'Thông tin'], ...(ent === 'contract' ? [['debt', 'Lịch thanh toán & công nợ']] : []), ...(ent === 'notice' && r.recipient_list ? [['rcp', `Danh sách nhận (${r.recipients})`]] : []), ...(ent === 'report' && r.data ? [['rep', 'Số liệu báo cáo']] : []), ...(ent === 'price_policy' ? [['sheet', 'Chi tiết bảng giá']] : []),
    ['files', `Tệp (${g.files.length})`], ['notes', `Trao đổi (${g.notes.length})`], ...(E.flow ? [['appr', `Phê duyệt (${g.approvals.length})`]] : []), ['hist', 'Lịch sử']];
  el.innerHTML = `<div class="dh"><div class="t1">${E.code ? `<span class="tag">${E.code}</span>` : ''}<h2>${esc(title)}</h2>${st ? show(st, r) : ''}${r.is_demo ? '<span class="tag demo">dữ liệu thử</span>' : ''}<button class="btn ghost sm" style="margin-left:auto" id="dClose" aria-label="Đóng">${ico('fa-xmark')}</button></div>
    <div class="sub">${esc(E.title)} · lập ${dmyhm(r.created_at)}${r.created_by__l ? ' bởi ' + esc(r.created_by__l) : ''}${r.updated_at ? ` · sửa ${dmyhm(r.updated_at)}` : ''}</div>
    <div class="dacts">
      ${p.edit ? `<button class="btn sm" data-do="edit">${ico('fa-pen')} Sửa</button>` : ''}
      ${p.submit && !E.flow.custom ? `<button class="btn amb sm" data-do="submit">${ico('fa-paper-plane')} ${esc(E.flow.submitLabel || 'Trình duyệt')}</button>` : ''}
      ${p.approve && !E.flow.custom ? `<button class="btn ok sm" data-do="ok">${ico('fa-check')} Duyệt</button><button class="btn danger sm" data-do="no">${ico('fa-xmark')} Từ chối</button>` : ''}
      ${p.selfApproval ? `<span class="small muted">${ico('fa-user-lock')} Đang chờ cấp khác duyệt</span>` : ''}
      ${acts.map(a => `<button class="btn sm ${a.danger ? 'danger' : ''}" data-act="${a.k}">${ico(a.icon)} ${esc(a.l)}</button>`).join('')}
      ${tplOn(ent) ? `<button class="btn sm ghost" data-do="tplprint">${ico('fa-print')} In theo mẫu</button>` : ''}
      ${unitId ? `<button class="btn sm ghost" data-do="u360">${ico('fa-building')} Hồ sơ căn 360°</button>` : ''}
      ${ent === 'customer' ? `<button class="btn sm ghost" data-do="c360">${ico('fa-id-card')} Hồ sơ khách 360°</button>` : ''}
      ${ent === 'reservation' && r.deal !== 'thue' ? `<button class="btn sm ghost" data-do="pr_can">${ico('fa-print')} In bản đăng ký căn hộ</button><button class="btn sm ghost" data-do="pr_nt">${ico('fa-couch')} In bản đăng ký nội thất</button>` : ''}
      ${ent === 'customer' && E.perm.c ? `<button class="btn sm ghost" data-do="copy">${ico('fa-copy')} Tạo bản sao mới</button>` : ''}
      ${ent === 'customer' ? `<button class="btn sm ghost" data-do="log">${ico('fa-comment-medical')} Ghi tư vấn</button>` : ''}
      ${ent === 'contract' && r.status === 'da_ky' ? `<button class="btn sm ghost" data-do="call">${ico('fa-phone')} Ghi nhắc nợ</button><button class="btn sm ghost" data-do="chg">${ico('fa-file-pen')} Đề nghị điều chỉnh</button>` : ''}
      ${p.del ? `<button class="btn sm ghost danger" data-do="del">${ico('fa-trash')} Xóa</button>` : ''}
    </div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</div></div><div class="db" id="dBody"></div>${traceLine(g.trace)}`;
  el.addEventListener('click', ev => { const d = ev.target.closest('[data-fk]'); if (d) traceField($('.trace', el), g.trace, d.dataset.fk, E.fields.find(f => f.k === d.dataset.fk)?.l || ''); });
  const body = $('#dBody', el);
  const T = {
    info: () => {
      const fs = E.fields.filter(f => f.t !== 'json' || f.k === 'reviews' || f.k === 'new_schedule');
      let h = !plain && p.locked ? `<div class="lockbar">${ico('fa-lock')} ${E.one[0].toUpperCase() + E.one.slice(1)} đã chốt / đang trình duyệt — ${ent === 'contract' && E.softLock?.st.includes(r.status) ? 'nhân viên chỉ sửa được Lần thanh toán, nội dung khác do quản lý sửa.' : `không sửa trực tiếp${ent === 'contract' ? '. Thay đổi qua «Điều chỉnh – phụ lục hợp đồng».' : '.'}`}</div>` : '';
      if (E.note) h += `<div class="warnbar">${ico('fa-circle-info')}<span>${esc(E.note)}</span></div>`;
      if (String(r.sale_check || '').startsWith('⚠')) h += `<div class="warnbar">${ico('fa-triangle-exclamation')} <div><b>Cảnh báo mở bán:</b> ${esc(r.sale_check.slice(2))}</div></div>`;   // căn ngoài thông báo mở bán đã duyệt gần nhất
      h += `<dl class="kv">${fs.filter(f => f.t !== 'check' && (f.t !== 'json' || f.grid) && isShown(f, r) && (!plain || (r[f.k] != null && r[f.k] !== '' && r[f.k] !== false && !(Array.isArray(r[f.k]) && !r[f.k].length)))).map(f => `<div data-fk="${f.k}" class="${f.t === 'long' || f.grid || (f.pick && r._units) ? 'wide' : ''}"><dt>${esc(f.l)}</dt><dd>${show(f, r)}${(f.pii || f.grid?.some(c => c.pii)) && r._masked && M.piiRoles.includes(M.me.role) ? ` <button class="btn ghost sm" data-do="pii">${ico('fa-eye')} Hiện</button>` : ''}</dd></div>`).join('')}</dl>`;
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
    if (b.dataset.act) return doAct(ent, id, b.dataset.act, () => reload(), r);
    const d = b.dataset.do;
    if (d === 'edit') return openForm(ent, { id, onSaved: () => reload() });
    if (d === 'submit') { const c = await ask(E.flow.submitLabel || 'Trình duyệt', `Trình ${E.one} này lên cấp phê duyệt?`, { reason: 1, reasonLabel: 'Ghi chú cho người duyệt' }); if (!c) return; await api('POST', `/api/e/${ent}/${id}/submit`, { comment: c === true ? null : c }); toast('Đã trình duyệt'); return reload(); }
    if (d === 'ok' || d === 'no') { const c = await ask(d === 'ok' ? 'Phê duyệt' : 'Từ chối', d === 'ok' ? 'Phê duyệt đề nghị này?' : 'Từ chối và trả lại người trình?', { reason: 1, reasonReq: d === 'no', reasonLabel: d === 'ok' ? 'Ý kiến (không bắt buộc)' : 'Lý do từ chối', danger: d === 'no', okLabel: d === 'ok' ? 'Duyệt' : 'Từ chối' }); if (!c) return; await api('POST', `/api/e/${ent}/${id}/approve`, { ok: d === 'ok', comment: c === true ? null : c }); toast(d === 'ok' ? 'Đã duyệt' : 'Đã từ chối'); updateBadges(); return reload(); }
    if (d === 'del') { if (!await ask('Xóa', `Xóa ${E.one} này? Thao tác được ghi nhật ký.`, { danger: 1, okLabel: 'Xóa' })) return; await api('DELETE', `/api/e/${ent}/${id}`); toast('Đã xóa'); closeDetail(); return refresh(); }
    if (d === 'u360') { closeDetail(); location.hash = `#/v/unit360?id=${unitId}`; return; }
    if (d === 'c360') { closeDetail(); location.hash = `#/v/cust360?id=${id}`; return; }
    if (d === 'pr_can' || d === 'pr_nt') return printPick(id, d === 'pr_can' ? 'dang_ky_can' : 'dang_ky_noi_that');
    if (d === 'copy') return copyCustomer(r.id);
    if (d === 'tplprint') return tplPrint(ent, id);
    if (d === 'log') return openForm('contact_log', { preset: { customer_id: r.id, customer_id__l: `${r.code} · ${r.full_name}` }, onSaved: () => toast('Đã ghi nhật ký') });
    if (d === 'call') return openForm('debt_call', { preset: { contract_id: r.id, contract_id__l: r.number }, onSaved: () => reload() });
    if (d === 'chg') return openForm('contract_change', { preset: { contract_id: r.id, contract_id__l: r.number }, onSaved: row => openDetail('contract_change', row.id) });
    if (d === 'pii') { const x = await api('GET', `/api/pii/${ent}/${id}`); for (const [k, v] of Object.entries(x)) { const f = E.fields.find(f => f.k === k), dd = $$('.kv dt', body).find(t => t.textContent === f.l)?.nextElementSibling; if (dd) dd.innerHTML = show(f, { [k]: v }); } toast('Đã ghi nhật ký xem dữ liệu định danh'); }
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
const ACT_L = { chuyen_hdmb: 'Chuyển tiếp sang HĐMB', tao: 'Tạo mới', sua: 'Sửa', xoa: 'Xóa', khoi_phuc: 'Khôi phục', trinh_duyet: 'Trình duyệt', phe_duyet: 'Phê duyệt', tu_choi: 'Từ chối', tai_tep: 'Tải tệp', xoa_tep: 'Xóa tệp', khoi_phuc_tep: 'Khôi phục tệp', cap_nhat_trang_thai: 'Hệ thống cập nhật trạng thái', cap_nhat_dieu_kien: 'Hệ thống cập nhật điều kiện', lich_thanh_toan: 'Lập lịch thanh toán', xem_dinh_danh: 'Xem dữ liệu định danh', in_hop_dong: 'In hợp đồng', qua_han_giu_cho: 'Hệ thống: quá hạn giữ chỗ', kich_hoat: 'Kích hoạt mở bán', phu_luc: 'Cập nhật theo phụ lục', nhap_lich_su: 'Nhập dữ liệu lịch sử', nhap_excel: 'Cập nhật từ tệp Excel', thay_the: 'Bị thay thế', huy: 'Hủy', doi_can: 'Đổi căn', doi_kh: 'Đổi khách hàng', hoan_tac: 'Hoàn tác', xuat_du_lieu: 'Xuất dữ liệu', dang_nhap: 'Đăng nhập', dang_nhap_sai: 'Đăng nhập sai', doi_mat_khau: 'Đổi mật khẩu', cap_nhat_ho_so: 'Cập nhật hồ sơ cá nhân', chuyen_tt: 'Chuyển trạng thái' };
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
// tab Đã thanh lý: ngày ký → ngày thanh lý, kèm lý do và ghi chú ngay sau (nhóm tiêu đề chứa cột đó rộng thêm 2)
function liqCols(cols, head, status) {
  const i = cols.indexOf('contract_on');
  if (status !== 'thanh_ly' || i < 0) return { cols, head };
  let at = 0;
  return { cols: [...cols.slice(0, i), 'liquidated_on', 'liquidate_reason', 'liquidate_note', ...cols.slice(i + 1)], head: head?.map(([t, n]) => { const s = at; at += n; return i >= s && i < s + n ? [t, n + 2] : [t, n]; }) };
}
async function listView(main, ent, params = {}) {
  const E = M.ents[ent];
  const S = ST.list[ent] ||= { q: '', status: '', project: '', mine: '', sort: '', sel: new Set(), limit: 300 };
  Object.assign(S, params); S.group = params.group || '';
  const st = E.fields.find(f => f.k === 'status');
  const hdKinds = ent === 'contract' && S.group === 'can_ho';   // 2 loại hợp đồng, mỗi loại danh sách và trạng thái riêng
  const rsKinds = ent === 'reservation';   // phiếu đăng ký: Đăng ký mua / Đăng ký thuê
  const grp = () => rsKinds ? (S.ht === 't' ? 'thue' : 'mua') : hdKinds && S.ht ? ({ t: 'thue', v: 'vay' }[S.ht] || 'hoan_thien') : S.group;
  // Điều kiện lọc (như BRAVO) ở danh sách Hợp đồng căn hộ chung cư: lọc ngày theo ô chọn, dự án, phân loại (tòa); «Xem …» bật / tắt nhóm cột — theo từng loại HĐ
  const FV = 'ctg-kd-hd-cot';   // cột đang tick theo loại HĐ (localStorage)
  if (hdKinds && !S.flt) { let view = {}; try { view = JSON.parse(localStorage.getItem(FV) || '{}') || {}; } catch { } S.flt = { v: {}, view, hide: false }; }   // v[loại HĐ] = { lk_/fr_/to_/mn_/mx_/f_<trường>: giá trị }
  const colOn = (k, sec) => { const v = S.flt?.view[grp()]?.[k]; return v == null ? sec.def : !!v; };
  const visSecs = () => { const L = E.lists?.[grp()]; return hdKinds && L?.secs ? L.secs.map(x => ({ ...x, cols: x.cols.filter(k => colOn(k, x)) })).filter(x => x.cols.length) : null; };
  const fltV = () => (S.flt.v[grp()] ||= {});
  const fltParams = () => {};   // ô Điều kiện lọc chỉ tick chọn trường hiện (user 04/11/2026: không lọc Từ – Đến)
  const projFilter = ['unit', 'building', 'price_policy', 'reservation', 'contract', 'collect_plan', 'handover', 'defect', 'pinkbook', 'debt_call', 'receipt', 'installment', 'noxh_check', 'ticket', 'contract_change', 'commission', 'target', 'agent_alloc', 'refund'].includes(ent);
  const extra = { collect_plan: `<button class="btn" data-x="suggest">${ico('fa-wand-magic-sparkles')} Gợi ý từ công nợ & cam kết</button>`, commission: `<button class="btn" data-x="calc">${ico('fa-calculator')} Tính / cập nhật hoa hồng</button>`,
    receipt: (M.imports.misa ? `<button class="btn amb" data-x="imp" data-k="misa">${ico('fa-file-import')} Nhập file MISA</button>` : '') + (M.imports.receipts ? `<button class="btn" data-x="imp" data-k="receipts">${ico('fa-file-import')} Nhập file Bravo</button>` : ''), unit: M.imports.units ? `<button class="btn" data-x="imp" data-k="units">${ico('fa-file-import')} Nhập file</button>` : '',
    customer: M.imports.customers ? `<button class="btn" data-x="imp" data-k="customers">${ico('fa-file-import')} Nhập file</button>` : '',
    contact_log: `${M.imports.leads ? `<button class="btn" data-x="imp" data-k="leads">${ico('fa-file-import')} Nhập file</button>` : ''}${E.perm.c ? `<button class="btn amb" data-x="lead">${ico('fa-user-plus')} Thêm khách trực tiếp / Hotline</button>` : ''}`, contract: M.imports.contracts ? `<button class="btn" data-x="imp" data-k="contracts">${ico('fa-file-import')} Nhập file</button>` : '',
    // bản demo (không máy chủ): quản trị đẩy toàn bộ mẫu biểu lên Git → mọi người mở link dùng chung (demo/entry.js)
    template: `<a class="btn" href="#/e/template">${ico('fa-folder-tree')} Dạng cây thư mục</a>` + (window.__ctgDemoPublish && M.me.role === 'admin' ? `<button class="btn amb" data-x="gitpub" title="Ghi toàn bộ mẫu biểu trên trình duyệt này vào kho GitHub — bản demo của mọi người cập nhật sau 1–2 phút">${ico('fa-cloud-arrow-up')} Đẩy mẫu biểu lên Git</button>` : '') }[ent] || '';
  main.innerHTML = `<div class="page"><div class="ph"><div>${eyebrow(E)}<h1>${ico(E.icon)} ${esc(S.group === 'tiem_nang' ? E.title + ' tiềm năng' : E.groups?.[S.group] || E.title)}</h1></div><div class="acts">${E.purpose ? `<button class="btn ghost" id="infoBtn">${ico('fa-circle-info')} Quy trình</button>` : ''}${extra}${tplOn(ent) ? `<button class="btn" data-x="tpls" title="Mẫu in của màn này — tạo, sửa, xem thử">${ico('fa-file-lines')} Mẫu biểu</button>` : ''}${E.perm.x ? `<button class="btn" id="xls">${ico('fa-file-excel')} Xuất file</button>` : ''}<button class="btn" onclick="print()">${ico('fa-print')} In / PDF</button>${E.perm.c ? `<button class="btn pri" id="newBtn">${ico('fa-plus')} ${ent === 'reservation' ? 'Tạo phiếu đăng ký' : `Tạo ${esc(E.one)}`}</button>` : ''}</div></div>${infoBox(E)}
    <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="q" placeholder="Tìm mã, tên, mã căn, khách hàng…" value="${esc(S.q)}"></div>
      ${projFilter ? `<select id="pj"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+S.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>` : ''}
      ${hdKinds ? `<button class="btn sm" id="fltT">${ico('fa-filter')} Điều kiện lọc</button>` : ''}${E.fields.some(f => ['owner_id', 'assignee_id'].includes(f.k)) ? `<label class="chk"><input type="checkbox" id="mine" ${S.mine ? 'checked' : ''}> Của tôi</label>` : ''}
      <span class="grow"></span><span class="small muted" id="cnt"></span></div>
      ${hdKinds ? `<div class="tabs hd-tabs hd-kinds" id="hdK"><button data-ck="" class="${S.ht ? '' : 'on'}">${ico('fa-file-contract')} HĐ mua bán</button><button data-ck="1" class="${S.ht === '1' ? 'on' : ''}">${ico('fa-couch')} HĐ hoàn thiện căn hộ</button><button data-ck="t" class="${S.ht === 't' ? 'on' : ''}">${ico('fa-key')} HĐ thuê</button><button data-ck="v" class="${S.ht === 'v' ? 'on' : ''}">${ico('fa-hand-holding-dollar')} HĐ vay</button></div>` : ''}${rsKinds ? `<div class="tabs hd-tabs hd-kinds" id="hdK"><button data-ck="" class="${S.ht ? '' : 'on'}">${ico('fa-hand-holding-hand')} Đăng ký mua</button><button data-ck="t" class="${S.ht === 't' ? 'on' : ''}">${ico('fa-key')} Đăng ký thuê</button></div>` : ''}${st ? `<div class="tabs" id="stTabs"></div>` : ''}${hdKinds ? `<div class="flt-wrap ${S.flt.hide ? 'flt-off' : ''}"><aside class="flt" id="flt"></aside><div class="flt-main">` : ''}<div id="bulk"></div><div class="tbl-wrap" id="tb"><div class="empty">Đang tải…</div></div><div class="more" id="more"></div>${hdKinds ? '</div></div>' : ''}</div></div>`;
  const load = async () => {
    const p = new URLSearchParams(); if (S.q) p.set('q', S.q); if (S.status) p.set('status', S.status); if (S.project) p.set('project', S.project); if (S.mine) p.set('mine', '1'); if (S.sort) p.set('sort', S.sort); p.set('limit', S.limit); if (grp()) p.set('group', grp()); fltParams(p);
    for (const [k, v] of Object.entries(S)) if (k.startsWith('f_') && v) p.set(k, v);
    const d = await api('GET', `/api/e/${ent}?${p}`);
    S.rowSt = new Map(d.rows.map(r => [r.id, r.status]));   // trạng thái từng dòng: nút Xóa hàng loạt chỉ cho bản dự thảo
    $('#cnt', main).textContent = `${d.rows.length < d.total ? `${d.rows.length} / ` : ''}${d.total} ${E.one}`;
    if (st) { const all = Object.values(d.counts || {}).reduce((a, b) => a + b, 0); $('#stTabs', main).innerHTML = `<button data-s="" class="${!S.status ? 'on' : ''}">Tất cả<span class="c">${all}</span></button>` + st.o.filter(o => !({ contract: ['cho_duyet'], reservation: ['da_coc'] })[ent]?.includes(o[0]) && (d.counts?.[o[0]] || S.status === o[0] || (hdKinds && ['du_thao', 'da_ky'].includes(o[0])) || (ent === 'reservation' && o[0] === 'huy'))).map(o => `<button data-s="${o[0]}" class="${S.status === o[0] ? 'on' : ''}">${esc(o[1])}<span class="c">${d.counts?.[o[0]] || 0}</span></button>`).join(''); }
    const LV = E.lists?.[grp()], vs = visSecs(), { cols: cols0, head } = liqCols(vs ? vs.flatMap(x => x.cols) : LV?.cols || E.list, vs ? vs.map(x => [x.h, x.cols.length]) : LV?.head, S.status), headL = k => LV?.label?.[k] || colLabel(ent, k);
    const cols = ent === 'reservation' && S.status === 'huy' ? [...cols0, 'doc_ret', 'doc_ret_on', 'ret_files'] : cols0;
    const bulk = E.bulk || (E.flow && (E.perm.a || E.perm.d));
    $('#tb', main).innerHTML = d.rows.length ? `<table class="t ${LV ? 'grid-bravo hd2' : ''}"><thead>${head ? `<tr class="h1">${bulk ? '<th></th>' : ''}${head.map(([t, n]) => `<th colspan="${n}">${esc(t)}</th>`).join('')}</tr>` : ''}<tr>${bulk ? '<th style="width:30px"><input type="checkbox" id="selAll"></th>' : ''}${cols.map(k => { const f = E.fields.find(x => x.k === k); const s = S.sort.replace('-', '') === k ? (S.sort[0] === '-' ? ' ↓' : ' ↑') : ''; return `<th class="${f ? 'sort' : ''} ${f && ['money', 'num', 'int'].includes(f.t) || VIRT_MONEY.has(k) ? 'num' : ''}" data-k="${f ? k : ''}">${esc(headL(k))}${s}</th>`; }).join('')}</tr></thead>
      <tbody>${d.rows.map((r, i) => `<tr data-id="${r.id}" class="${S.sel.has(r.id) ? 'sel' : ''}">${bulk ? `<td><input type="checkbox" data-sel="${r.id}" ${S.sel.has(r.id) ? 'checked' : ''}></td>` : ''}${cols.map(k => { const c = cell(ent, k, r); const lf = E.fields.find(x => x.k === k); return `<td class="${c.num ? 'num' : ''} ${lf?.t === 'long' ? 'wrap' : ''}">${k === 'id' ? '#' + r.id : k === 'stt' ? i + 1 : c.html}${k === cols[0] && r.is_demo ? ' <span class="tag demo" title="Dữ liệu thử">thử</span>' : ''}</td>`; }).join('')}</tr>`).join('')}</tbody>
      ${cols.some(k => E.fields.find(f => f.k === k)?.t === 'money' || VIRT_MONEY.has(k)) ? `<tfoot><tr>${bulk ? '<td></td>' : ''}${cols.map((k, i) => { const f = E.fields.find(x => x.k === k); return (f?.t === 'money' || VIRT_MONEY.has(k)) ? `<td class="num">${fm(d.rows.reduce((s, r) => s + (+r[k] || 0), 0))}</td>` : `<td>${i === 0 ? 'Tổng' : ''}</td>`; }).join('')}</tr></tfoot>` : ''}</table>`
      : `<div class="empty">${ico(E.icon)}Chưa có ${esc(E.one)} nào${S.q || S.status ? ' khớp bộ lọc' : ''}.${E.perm.c && ent !== 'reservation' ? ' Bấm «Tạo ' + esc(E.one) + '» để bắt đầu.' : ''}</div>`;
    $('#more', main).innerHTML = d.rows.length < d.total ? `<button class="btn" id="moreBtn">Tải thêm (${d.total - d.rows.length} còn lại)</button>` : '';
    $('#moreBtn', main) && ($('#moreBtn', main).onclick = () => { S.limit += 500; load(); });
    drawBulk();
  };
  const drawBulk = () => {
    const n = S.sel.size, b = $('#bulk', main);
    b.innerHTML = n ? `<div class="bulk"><b>Đã chọn ${n}</b>${E.flow ? `<button class="btn sm amb" data-b="submit">${ico('fa-paper-plane')} Trình duyệt</button>` : ''}${E.flow && E.perm.a ? `<button class="btn sm ok" data-b="ok">${ico('fa-check')} Duyệt</button><button class="btn sm danger" data-b="no">${ico('fa-xmark')} Từ chối</button>` : ''}${E.perm.d ? `<button class="btn sm danger" data-b="del">${ico('fa-trash')} Xóa</button>` : ''}<button class="btn sm ghost" data-b="clr">Bỏ chọn</button></div>` : '';
  };
  const drawFlt = () => {
    const box = $('#flt', main); if (!box) return;
    const L = E.lists?.[grp()], lab = k => L?.label?.[k] || colLabel(ent, k); let i = 0;
    const secs = (L?.secs || []).map(x => ({ ...x, ks: x.cols.filter(k => !['stt'].includes(k)) })).filter(x => x.ks.length);
    const nOn = secs.reduce((a, x) => a + x.ks.filter(k => colOn(k, x)).length, 0), nAll = secs.reduce((a, x) => a + x.ks.length, 0);
    box.innerHTML = `<div class="flt-hd"><b>${ico('fa-filter')} Điều kiện lọc</b><button type="button" class="btn ghost sm" data-fx="hide" title="Ẩn">${ico('fa-xmark')}</button></div>
      <div class="search flt-q"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="fltQ" placeholder="Tra cứu trường…" value="${esc(S.flt.q || '')}" autocomplete="off"></div>
      <div class="flt-ft row" style="margin:0 0 6px;gap:6px"><button type="button" class="btn sm" data-fx="all">${ico('fa-square-check')} Chọn tất cả</button><button type="button" class="btn sm ghost" data-fx="none">Bỏ chọn</button><span class="small muted">${nOn}/${nAll}</span></div>
      ${secs.map(x => `<div data-sg>${x.h ? `<div class="flt-sec">${esc(x.h)}</div>` : ''}${x.ks.map(k => `<label class="chk flt-v" data-l="${esc(fNorm(lab(k) + ' ' + (x.h || '')))}"><input type="checkbox" data-fc="${k}" ${colOn(k, x) ? 'checked' : ''}> <span class="n">${++i}.</span> ${esc(lab(k))}</label>`).join('')}</div>`).join('')}
      <div class="small muted flt-none" hidden>Không có trường nào khớp</div>`;
    fltQ();
  };
  // tra cứu trường trong ô Điều kiện lọc: không phân biệt dấu / hoa thường; tìm theo tên trường hoặc tên nhóm
  const fNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
  const fltQ = () => {
    const box = $('#flt', main); if (!box) return; const q = fNorm(S.flt.q); let any = false;
    $$('[data-sg]', box).forEach(g => { let n = 0; $$('[data-l]', g).forEach(l => { const on = !q || l.dataset.l.includes(q); l.hidden = !on; if (on) n++; }); g.hidden = !n; if (n) any = true; });
    const no = $('.flt-none', box); if (no) no.hidden = any;
  };
  if (hdKinds) {
    drawFlt();
    const box = $('#flt', main);
    box.addEventListener('input', e => { if (e.target.id === 'fltQ') { S.flt.q = e.target.value; fltQ(); } });   // tra cứu: lọc danh sách tại chỗ (không vẽ lại để không mất con trỏ)
    box.addEventListener('keydown', e => { if (e.target.id === 'fltQ' && e.key === 'Escape') { e.target.value = S.flt.q = ''; fltQ(); } });
    box.addEventListener('change', run(async e => {
      const k = e.target.dataset?.fc; if (!k) return;
      (S.flt.view[grp()] ||= {})[k] = e.target.checked; try { localStorage.setItem(FV, JSON.stringify(S.flt.view)); } catch { }
      drawFlt(); return load();
    }));
  }
  ST.reload = load;
  main.oncontextmenu = e => { const tr = e.target.closest('tbody tr[data-id]'); if (!tr || ent !== 'customer') return; e.preventDefault(); rowMenu(ent, +tr.dataset.id, e.clientX, e.clientY); };
  main.onclick = run(async e => {
    const t = e.target;
    if ((t.id === 'newBtn' || t.closest('#newBtn')) && ent === 'reservation')   // phiếu đăng ký căn hộ (chuyển từ Bảng hàng sang đây 28/10/2026)
      return openForm('reservation', { title: S.ht === 't' ? `${ico('fa-key')} Phiếu đăng ký thuê căn hộ` : `${ico('fa-hand-holding-hand')} Phiếu đăng ký căn hộ`, preset: S.ht === 't' ? { deal: 'thue' } : undefined, onSaved: row => { load(); updateBadges(); openDetail('reservation', row.id); } });
    if (t.id === 'newBtn' || t.closest('#newBtn')) return openForm(ent, { tab: hdKinds && S.ht ? ({ t: 'thue', v: 'vay' }[S.ht] || 'ht') : undefined, preset: { ...(hdKinds && S.ht === 't' ? { kind: 'thue' } : hdKinds && S.ht === 'v' ? { kind: 'vay', nature: 'ban' } : {}), ...(S.project && E.fields.some(f => f.k === 'project_id') ? { project_id: +S.project } : {}), ...(E.groups?.[S.group] ? { ptype: S.group } : {}) } });
    if (t.closest('#infoBtn')) return $('#infoBox', main)?.classList.toggle('hidden');
    if (t.closest('#xls')) { const p = new URLSearchParams(); if (S.q) p.set('q', S.q); if (S.status) p.set('status', S.status); if (S.project) p.set('project', S.project); if (S.mine) p.set('mine', '1'); if (grp()) p.set('group', grp()); fltParams(p); const vs = visSecs(); if (vs) p.set('cols', vs.flatMap(x => x.cols).join(',')); return download(`/api/export/${ent}?${p}`); }
    const xb = t.closest('[data-x]');
    if (xb?.dataset.x === 'suggest') return suggestModal();
    if (xb?.dataset.x === 'calc') { const r = await api('POST', '/api/commission/calc', {}); toast(`Đã rà soát ${r.checked} hợp đồng có đại lý / CTV`); return load(); }
    if (xb?.dataset.x === 'imp') return importModal(xb.dataset.k, load);
    if (xb?.dataset.x === 'lead') return leadModal(load);
    if (xb?.dataset.x === 'tpls') return tplManager(ent);
    if (xb?.dataset.x === 'gitpub') {   // bản demo: đẩy mẫu biểu lên kho GitHub (demo/entry.js)
      if (!confirm('Đẩy toàn bộ mẫu biểu đang có trên trình duyệt này lên Git?\nMọi người mở link demo sẽ nhận đúng bộ mẫu này (sau 1–2 phút).')) return;
      xb.disabled = true;
      try { const r = await window.__ctgDemoPublish({ user: M.me.username }); if (r) toast(`Đã đẩy ${r.n} mẫu lên Git — bản demo của mọi người cập nhật sau 1–2 phút`); }
      catch (e) { toast(e.message, true); } finally { xb.disabled = false; }
      return;
    }
    const ck = t.closest('[data-ck]'); if (ck) { S.ht = ck.dataset.ck; S.status = ''; S.sort = ''; S.sel.clear(); $$('button', ck.parentElement).forEach(b => b.classList.toggle('on', b === ck)); drawFlt(); return load(); }
    if (t.closest('#fltT') || t.closest('[data-fx=hide]')) { S.flt.hide = !S.flt.hide; $('.flt-wrap', main)?.classList.toggle('flt-off', S.flt.hide); return; }
    if (t.closest('[data-fx=all]') || t.closest('[data-fx=none]')) {   // đang tra cứu: chỉ chọn / bỏ các trường đang hiện trong kết quả tra cứu
      const on = !!t.closest('[data-fx=all]'), L = E.lists?.[grp()], v = S.flt.view[grp()] ||= {};
      const ks = S.flt.q ? $$('#flt [data-l]:not([hidden]) [data-fc]', main).map(c => c.dataset.fc) : (L?.cols || []);
      for (const k of ks) v[k] = on; try { localStorage.setItem(FV, JSON.stringify(S.flt.view)); } catch { } drawFlt(); return load();
    }
    const tab = t.closest('[data-s]'); if (tab) { S.status = tab.dataset.s; S.sel.clear(); return load(); }
    const th = t.closest('th[data-k]'); if (th?.dataset.k) { const k = th.dataset.k; S.sort = S.sort === k ? '-' + k : k; return load(); }
    if (t.id === 'selAll') { $$('[data-sel]', main).forEach(c => { c.checked = t.checked; t.checked ? S.sel.add(+c.dataset.sel) : S.sel.delete(+c.dataset.sel); c.closest('tr').classList.toggle('sel', t.checked); }); return drawBulk(); }
    if (t.dataset.sel) { const id = +t.dataset.sel; t.checked ? S.sel.add(id) : S.sel.delete(id); t.closest('tr').classList.toggle('sel', t.checked); return drawBulk(); }
    const bb = t.closest('[data-b]');
    if (bb) {
      if (bb.dataset.b === 'clr') { S.sel.clear(); return load(); }
      if (bb.dataset.b === 'del') {   // chỉ xóa các dòng còn ở dự thảo (chưa duyệt), dòng khác bỏ qua
        const draft = new Set(E.flow ? E.flow.submit : ['nhap']), ids = [...S.sel].filter(id => draft.has(S.rowSt?.get(id) ?? 'nhap')), skip = S.sel.size - ids.length;
        if (!ids.length) return toast(`Không có ${E.one} nào đang ở dự thảo trong ${S.sel.size} dòng đã chọn — chỉ xóa được bản chưa duyệt`, true);
        if (!await ask('Xóa bản dự thảo', `Xóa ${ids.length} ${E.one} đang ở dự thảo?${skip ? ` (${skip} dòng đã gửi duyệt / đã duyệt sẽ giữ nguyên)` : ''} Không khôi phục được.`, { danger: 1, okLabel: 'Xóa' })) return;
        let ok = 0; const errs = [];
        for (const id of ids) { try { await api('DELETE', `/api/e/${ent}/${id}`); ok++; } catch (er) { errs.push(`#${id} ${er.message}`); } }
        toast(`Đã xóa ${ok}${errs.length ? ` · lỗi ${errs.length}: ${errs.slice(0, 2).join('; ')}` : ''}`, !!errs.length);
        S.sel.clear(); updateBadges(); return load();
      }
      let comment = null;
      if (bb.dataset.b === 'no') { comment = await ask('Từ chối', `Từ chối ${S.sel.size} bản ghi?`, { reason: 1, reasonReq: 1, danger: 1, okLabel: 'Từ chối' }); if (!comment) return; }
      else if (!await ask(bb.dataset.b === 'ok' ? 'Duyệt hàng loạt' : 'Trình duyệt hàng loạt', `Thực hiện cho ${S.sel.size} bản ghi đã chọn?`)) return;
      const r = await api('POST', `/api/bulk/${ent}/${bb.dataset.b === 'submit' ? 'submit' : 'approve'}`, { ids: [...S.sel], ok: bb.dataset.b === 'ok', comment: comment === true ? null : comment });
      toast(`Thành công ${r.ok}${r.errors.length ? ` · lỗi ${r.errors.length}: ${r.errors.slice(0, 2).map(x => '#' + x.id + ' ' + x.msg).join('; ')}` : ''}`, !!r.errors.length);
      S.sel.clear(); updateBadges(); return load();
    }
    if (t.closest('[data-ret], .ret-fi a')) return;
    const ru = t.closest('[data-retup]'), rd = t.closest('[data-retdel]');
    if (ru) { const id = +ru.closest('tr[data-id]').dataset.id, i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.pdf,.png,.jpg,.jpeg,.webp'; i.onchange = run(async () => { const fd = new FormData(); fd.append('kind', 'tra_ho_so'); [...i.files].forEach(f => fd.append('file', f, f.name)); await api('POST', `/api/files/reservation/${id}`, fd); toast('Đã đính kèm file scan trả hồ sơ'); load(); }); return i.click(); }
    if (rd) { if (!await ask('Xóa tệp', 'Xóa file scan này? (Lịch sử vẫn ghi lại)', { danger: 1, okLabel: 'Xóa' })) return; await api('DELETE', `/api/file/${rd.dataset.retdel}`); return load(); }
    const pb = t.closest('[data-print]');
    const bbg = t.closest('[data-bbgn]'); if (bbg) return handoverPick('noxh', +bbg.closest('tr[data-id]').dataset.id);
    if (pb) return printPick(+pb.closest('tr[data-id]').dataset.id, pb.dataset.print);
    const tr = t.closest('tbody tr[data-id]'); if (tr && !t.matches('input')) return openDetail(ent, +tr.dataset.id);
  });
  main.onchange = run(async e => {
    const t = e.target.closest('[data-ret]'); if (!t) return;
    const k = t.dataset.ret, v = t.value || null;
    if (k === 'doc_ret') t.className = `ret-st ${v === 'da_tra' ? 'g' : 'a'}`;
    const patch = { [k]: v };
    if (k === 'doc_ret' && v === 'da_tra' && !t.closest('tr').querySelector('[data-ret=doc_ret_on]').value) patch.doc_ret_on = today();   // chọn Đã trả mà chưa có ngày → lấy hôm nay
    try { await api('PUT', `/api/e/reservation/${t.closest('tr[data-id]').dataset.id}`, patch); toast('Đã lưu'); if (patch.doc_ret_on) load(); }
    catch (er) { toast(er.message, true); load(); }
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
    <div class="row mb"><button class="btn" id="tpl">${ico('fa-download')} Tải tệp mẫu</button>${kind === 'misa' ? `<button class="btn" id="tplT" title="File giả lập sổ quỹ MISA theo các hợp đồng thử đang nợ — tải về rồi chọn lại để thử nhập">${ico('fa-flask')} Tải file MISA thử</button>` : ''}<input type="file" id="ifile" accept=".xlsx,.csv" class="inp" style="padding-top:5px;flex:1"></div><div id="ires"></div>`,
    foot: `<button class="btn" data-x>Đóng</button><button class="btn" id="iDry">${ico('fa-list-check')} Kiểm tra trước</button><button class="btn pri" id="iGo">${ico('fa-file-import')} Nhập</button>` });
  $('#tpl', m.el).onclick = () => download(`/api/import/template/${kind}`);
  if ($('#tplT', m.el)) $('#tplT', m.el).onclick = run(() => download('/api/import/misa-sample'));
  const go = dry => run(async () => {
    const f = $('#ifile', m.el).files[0]; if (!f) return toast('Chọn tệp .xlsx / .csv', true);
    const fd = new FormData(); fd.append('file', f, f.name);
    $('#ires', m.el).innerHTML = 'Đang xử lý…';
    const r = await api('POST', `/api/import/${kind}${dry ? '?dry=1' : ''}`, fd);
    $('#ires', m.el).innerHTML = `<div class="${r.loi ? 'warnbar' : 'okbar'}">${dry ? '<b>Kiểm tra (chưa ghi):</b> ' : '<b>Đã nhập:</b> '}${r.total} dòng — thêm ${r.them}${r.cap_nhat ? `, cập nhật ${r.cap_nhat}` : ''}${r.trung ? `, trùng bỏ qua ${r.trung}` : ''}${r.bo_qua ? `, bỏ qua ${r.bo_qua} dòng cộng / số dư / không phải tiền thu` : ''}, lỗi ${r.loi}</div>${r.errors.length ? `<table class="t compact noclick"><thead><tr><th>Dòng</th><th>Lỗi</th></tr></thead><tbody>${r.errors.map(x => `<tr><td>${x.line}</td><td style="white-space:normal">${esc(x.msg)}</td></tr>`).join('')}</tbody></table>` : ''}`;
    if (!dry) { after && after(); }
  });
  $('#iDry', m.el).onclick = go(true); $('#iGo', m.el).onclick = go(false);
}

// ---------- thanh kéo ngang phía trên bảng rộng (đồng bộ với thanh dưới) ----------
// chỉ bên đang được kéo mới điều khiển bên kia (không «giành nhau» gây giật); quãng kéo hai thanh bằng nhau
function syncTopScroll() {
  $$('.tbl-wrap').forEach(w => {
    let bar = w.previousElementSibling;
    if (!bar?.classList.contains('top-scroll')) {
      bar = document.createElement('div'); bar.className = 'top-scroll'; bar.innerHTML = '<div></div>'; w.before(bar);
      let lead = null, t = 0;
      const follow = (src, dst) => () => {
        if (lead && lead !== src) return;
        lead = src; clearTimeout(t); t = setTimeout(() => { lead = null; }, 120);
        if (Math.abs(dst.scrollLeft - src.scrollLeft) > 0.5) dst.scrollLeft = src.scrollLeft;
      };
      bar.addEventListener('scroll', follow(bar, w), { passive: true });
      w.addEventListener('scroll', follow(w, bar), { passive: true });
    }
    const range = w.scrollWidth - w.clientWidth;
    bar.style.display = range > 1 ? '' : 'none';
    const inner = range + bar.clientWidth + 'px';
    if (bar.firstChild.style.width !== inner) bar.firstChild.style.width = inner;
    if (Math.abs(bar.scrollLeft - w.scrollLeft) > 0.5) bar.scrollLeft = w.scrollLeft;
  });
}
// chỉ dựng lại khi nội dung trang đổi — bỏ qua thay đổi bên trong chính thanh kéo
new MutationObserver(debounce(syncTopScroll, 80)).observe($('#app') || document.body, { childList: true, subtree: true });
window.addEventListener('resize', debounce(syncTopScroll, 100));
