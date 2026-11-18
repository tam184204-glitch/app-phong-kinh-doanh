// ---- ui.js
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
// 17/11/2026 (rà soát UX): nút chỉ có biểu tượng → tên đọc được (aria-label = title); «Đang tải…» → khung tải (skeleton);
// cột sắp xếp → aria-sort. Chạy tự động cho mọi màn, không phải sửa từng màn
(() => {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  const fix = root => {
    if (!root.querySelectorAll) return;
    for (const b of root.querySelectorAll('button[title]:not([aria-label]), a[title]:not([aria-label])')) if (!b.textContent.trim()) b.setAttribute('aria-label', b.title);
    for (const e of root.querySelectorAll('.empty')) if (/^\s*Đang tải/.test(e.textContent) && !e.classList.contains('sk')) e.classList.add('sk');
  };
  const go = () => { fix(document.body); new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) fix(n.parentNode || n); }).observe(document.body, { childList: true, subtree: true }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
})();
function toast(msg, err) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.append(t); }
  t.textContent = msg; t.classList.toggle('err', !!err); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, err ? 6000 : 3500);
}
// 17/11/2026: nút được bấm bị khóa + hiện «đang xử lý» tới khi việc xong (chống bấm 2 lần → lưu / duyệt / lập HĐ 2 lần)
const run = fn => async (...a) => {
  const t = a[0]?.target, b = t?.closest?.('button:not([data-nolock]), .btn'), lock = b && !b.disabled && b.isConnected;
  let done = false; const tm = lock ? setTimeout(() => { if (!done && b.isConnected && !document.querySelector('.ov')) {   // đang chờ người dùng trả lời hộp thoại → không quay
       b.disabled = true; b.classList.add('is-busy'); b.setAttribute('aria-busy', 'true'); } }, 120) : 0;   // việc tức thời (đổi tab…) không nháy
  try { return await fn(...a); } catch (e) { toast(e.message, true); }
  finally { done = true; clearTimeout(tm); if (lock && b.classList.contains('is-busy')) { b.disabled = false; b.classList.remove('is-busy'); b.removeAttribute('aria-busy'); } }
};

// ---------- hộp thoại ----------
function modal({ title, body = '', wide, narrow, foot = '', onClose }) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${narrow ? 'narrow' : ''}" role="dialog" aria-modal="true"><div class="mh"><h3>${title}</h3><button class="btn ghost sm x" data-x aria-label="Đóng">${ico('fa-xmark')}</button></div><div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  document.body.append(ov);
  const close = () => { ov.remove(); onClose && onClose(); document.removeEventListener('keydown', kd); };
  const userClose = () => { try { ov._beforeClose?.(); } catch {} close(); };   // 15/11/2026: form đang nhập dở → tự lưu nháp trước khi đóng
  const kd = e => { if (e.key === 'Escape' && document.body.lastElementChild === ov) userClose(); };
  document.addEventListener('keydown', kd);
  ov.addEventListener('mousedown', e => { if (e.target === ov) ov._down = true; });
  ov.addEventListener('mouseup', e => { if (e.target === ov && ov._down) userClose(); ov._down = false; });
  $$('[data-x]', ov).forEach(b => b.onclick = userClose);
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
const unitsTable = us => { if (us.length && 'b' in us[0]) return polUnitsTable(us); const d1 = v => v == null ? '' : (+v).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const R = us.some(u => 'rent_house' in u);   // 17/11/2026: thông báo cho thuê — đơn giá thuê theo chính sách cho thuê áp dụng cho từng căn
  return `<div class="small muted mb">${us.length} căn</div><div class="tbl-wrap ds-can"><table class="t compact noclick"><thead><tr><th class="center">STT</th><th class="center">Mã căn hộ</th><th class="center">Diện tích thông thủy</th><th class="center">Diện tích xây dựng</th>${R ? '<th class="num">Giá thuê nhà/tháng<div class="small muted" style="font-weight:400">đã gồm thuế GTGT</div></th><th class="num">Giá thuê nội thất/tháng</th><th class="num">Tổng cộng/tháng<div class="small muted" style="font-weight:400">đã gồm thuế GTGT tiền thuê nhà</div></th><th>Ghi chú</th>' : ''}</tr></thead>
    <tbody>${us.map((u, i) => `<tr><td class="center">${i + 1}</td><td class="center">${esc(u.code)}</td><td class="center">${d1(u.area_tt)}</td><td class="center">${d1(u.area_xd)}</td>${R ? (u.rent_house ? `<td class="num">${fm(u.rent_house)}</td><td class="num">${fm(u.rent_furn || 0)}</td><td class="num"><b>${fm(u.rent_total)}</b></td>` : '<td class="num muted">Chưa thiết lập</td><td class="num">0</td><td class="num muted">—</td>') + `<td class="small sn-note">${(u.notes || []).map(x => `<div class="sn-${esc(x.k)}">${esc(x.t)}</div>`).join('')}</td>` : ''}</tr>`).join('')}</tbody></table></div>`; };

// chính sách bán hàng (14/11/2026): căn hộ áp dụng dạng cột, gom theo tòa
const polUnitsTable = us => { const KIND = Object.fromEntries(M.ents.unit.fields.find(f => f.k === 'kind').o), fin = us.some(u => u.fin != null), bs = [...new Set(us.map(u => u.b))], R = !!us[0]?.rent;   // R: chính sách cho thuê
  return `<div class="small muted mb">${us.length} căn${bs.length > 1 ? ' · ' + bs.map(b => `Tòa ${esc(b)}: ${us.filter(u => u.b === b).length}`).join(' · ') : ''}</div><div class="tbl-wrap ds-can"><table class="t compact noclick"><thead><tr><th class="center">STT</th><th>Mã căn</th><th>Tòa</th><th class="num">Tầng</th><th>Loại</th><th class="num">DT thông thủy</th><th class="num">${R ? 'Tiền thuê/tháng' : 'Tổng giá căn hộ'}</th>${fin ? `<th class="num">${R ? 'Thuê nội thất/tháng' : 'Giá trị hoàn thiện'}</th>` : ''}<th class="num">${R ? 'Tổng tiền thuê/tháng' : 'Tổng giá trị căn hộ'}</th></tr></thead>
    <tbody>${us.map((u, i) => { const g = u.base ?? +u.total_price ?? 0; return `<tr><td class="center">${i + 1}</td><td>${esc(u.code)}</td><td>${esc(u.b)}</td><td class="num">${u.floor ?? ''}</td><td>${esc(KIND[u.kind] || u.kind || '')}</td><td class="num">${fnum(u.area_tt)}</td><td class="num">${fm(g)}</td>${fin ? `<td class="num">${u.fin != null ? fm(u.fin) : ''}</td>` : ''}<td class="num"><b>${fm(g + (+u.fin || 0))}</b></td></tr>`; }).join('')}</tbody></table></div>`; };   // 14/11/2026: Tổng giá trị căn hộ = tổng giá căn hộ + giá trị hoàn thiện

// ---------- Thông báo bàn giao (13/11/2026): bảng căn của tòa + HĐMB đã ký + đợt bàn giao, hạn hiện tại → hạn mới ----------
const bgTable = (rs, { pick, sel, mode } = {}) => {
  const d = v => v ? dmy(String(v).slice(0, 10)) : '', W = mode === 'gcn' ? 'Giấy chứng nhận' : 'bàn giao', WD = mode === 'gcn' ? 'bàn giao Giấy chứng nhận' : 'bàn giao';   // 17/11/2026: dùng chung cho thông báo bàn giao Giấy chứng nhận
  // mỗi căn: các đợt gắn bàn giao (nhiều đợt, kể cả phí bảo trì) — đợt · số ngày · số tiền · hạn hiện tại → hạn mới
  const items = x => !x.contract_id ? '<span class="muted">Chưa có HĐMB đã ký</span>' : `<div class="bg-its">${x.items.map(i => {
      const chg = i.due_new && i.due_old !== i.due_new;
      return `<div class="bg-it"><span class="bg-n" title="${esc(i.name)}">${pick ? `<button type="button" class="lnk" data-bgx="${x.contract_id}" data-seq="${i.seq}" title="Bỏ gắn đợt này với ${W}">${ico('fa-xmark')}</button> ` : ''}${esc(String(i.name).slice(0, 48))}</span>
        <span class="bg-d">${pick ? `<input data-bgn="${x.contract_id}" data-seq="${i.seq}" value="${i.own ?? ''}" placeholder="${i.days}" inputmode="numeric" title="Số ngày được nộp kể từ ngày ${WD} — để trống = theo ô «Số ngày được nộp tiền (mặc định)»">` : `<b>${i.days}</b>`} ngày${i.own == null ? '<small class="muted"> (mặc định)</small>' : ''}</span>
        <span class="bg-a">${fm(i.amount)}</span><span class="bg-h">${d(i.due_old)}${i.due_new ? ` → <b${chg ? ' style="color:var(--cobalt)"' : ''}>${d(i.due_new)}</b>` : ''}</span></div>`; }).join('')}
    ${!x.items.length ? `<div class="hs-miss small">Chưa rõ đợt gắn ${W} — chọn ở dưới</div>` : x.how === 'text' ? '<div class="small muted">tự nhận theo nội dung đợt — kiểm tra lại</div>' : ''}
    ${pick ? (() => { const rest = x.dots.filter(o => !x.items.some(i => i.seq === o.seq)); return rest.length ? `<select data-bgadd="${x.contract_id}" class="${x.items.length ? '' : 'bg-none'}"><option value="">+ Thêm đợt gắn ${W}…</option>${rest.map(o => `<option value="${o.seq}">${esc(String(o.name).slice(0, 55))}</option>`).join('')}</select>` : ''; })() : ''}</div>`;
  // 17/11/2026: cột Ghi chú = lịch sử thông báo của căn — thông báo đang áp dụng (số · ngày phát hành · Đang áp dụng, ngày bàn giao, hạn nộp), số lần đã thông báo + «Xem lịch sử», bản nháp chưa áp dụng
  const noteOf = x => { const h = x.hist; if (!h) return x.other ? `<span class="hs-miss">Đã có trong thông báo số ${esc(x.other)}</span>` : '';
    const L = [];
    if (h.cur) L.push(`<div class="nowrap"><b>${esc(h.cur.doc)}</b> · ${dmy(h.cur.pub_on)} · <span class="hs-ok"><b>Đang áp dụng</b></span>${h.cur.self ? ' <span class="muted">(thông báo này)</span>' : ''}</div><div class="muted">bàn giao ${dmy(h.cur.handover_on)}${h.cur.due ? ` · hạn nộp ${dmy(h.cur.due)}` : ''}</div>`);
    if (h.n) L.push(`<div>Đã có ${h.n} lần thông báo — <a href="#" data-bghist="${x.id}" data-mode="${mode || ''}">Xem lịch sử</a></div>`);
    for (const dr of h.drafts || []) L.push(`<div class="muted">${esc(dr.doc)} · ${esc(dr.st)} — chưa áp dụng</div>`);
    return L.join('');
  };
  return `<div class="tbl-wrap bg-t"><table class="t compact noclick"><thead><tr>${pick ? '<th style="width:30px"></th>' : ''}<th>Mã căn</th><th>Khách hàng</th><th>Số HĐMB</th><th>Ngày ký</th><th>Các đợt gắn ${W} · số ngày · số tiền · hạn hiện tại → hạn mới</th><th>Ghi chú</th></tr></thead><tbody>
    ${rs.map(x => { const on = pick && sel.has(x.code.toUpperCase());
      return `<tr${on ? ' class="sel"' : ''}>${pick ? `<td><input type="checkbox" data-bgu="${esc(x.code)}" ${on ? 'checked' : ''}></td>` : ''}<td>${esc(x.code)}</td><td>${esc(x.customer || '')}</td><td>${esc(x.number || '')}</td><td>${d(x.contract_on)}</td>
        <td>${items(x)}</td><td class="small bg-note wrap" style="min-width:240px">${noteOf(x)}</td></tr>`; }).join('')}
    </tbody></table></div>`;
};
// «Xem lịch sử» (17/11/2026): mọi lần thông báo của 1 căn — mới nhất trước, trạng thái áp dụng, ngày phát hành, ngày bàn giao, hạn nộp, thay đổi từng đợt, người thực hiện
async function bgHistory(unitId, mode) {
  const d = await api('GET', `/api/notice-history?ent=${mode === 'gcn' ? 'gcn_notice' : 'handover_notice'}&unit=${unitId}`), W = mode === 'gcn' ? 'bàn giao Giấy chứng nhận' : 'bàn giao';
  const C = { dang: 'g', thay: 's', huy: 'r', nhap: 's', cho_duyet: 'a' }, dd = v => v ? dmy(v) : '—';
  const row = x => `<tr${x.st === 'dang' ? ' class="sel"' : ''}><td><b>${esc(x.doc)}</b><div class="small muted">${esc(x.code)}</div></td><td>${pill(x.st_l, C[x.st])}</td>
    <td class="nowrap">TB ${dd(x.notice_on)}<div class="small">phát hành <b>${dd(x.pub_on)}</b></div></td><td class="wrap" style="min-width:150px">${dd(x.handover_on)}<div class="small muted">hạn = ${esc(x.base_l)} + số ngày (mặc định ${x.pay_days})</div></td>
    <td class="wrap">${x.changes.length ? x.changes.map(c => `<div>${esc(c.label)}${c.ct ? ` <span class="muted small">${esc(c.ct)}</span>` : ''}: ${c.old ? dd(c.old) : '<span class="muted">trống</span>'} → <b>${dd(c.new)}</b></div>`).join('') : `<span class="muted">${['nhap', 'cho_duyet'].includes(x.st) ? 'chưa phát hành — chưa đổi hạn' : 'không đổi hạn'}</span>`}</td>
    <td class="small wrap" style="min-width:200px">${x.cr_name ? `Lập: ${esc(x.cr_name)} ${dd(x.created_on)}<br>` : ''}${x.rq_name ? `Trình: ${esc(x.rq_name)} ${dd(x.rq_on)}<br>` : ''}${x.pub_name ? `Phát hành: <b>${esc(x.pub_name)}</b> ${dd(x.pub_on)}<br>` : ''}${x.revoke ? `<span class="neg">Hủy: ${esc(x.revoke.by)} ${dd(x.revoke.on)}${x.revoke.reason ? ' — ' + esc(x.revoke.reason) : ''}</span>` : ''}</td></tr>`;
  modal({ title: `Lịch sử thông báo ${W} — căn ${esc(d.unit)}`, wide: true,
    body: `<div class="small muted mb">${d.n_pub} lần phát hành · mới nhất trước. Thông báo phát hành sau cùng là thông báo <b>đang áp dụng</b> (hạn thu đợt ${W}${mode === 'gcn' ? '' : ' và phí bảo trì'} theo thông báo này); các thông báo trước <b>đã thay thế</b>, giữ để tra cứu. Bản nháp / chờ duyệt chưa thay đổi hạn đang áp dụng.</div>
      ${d.items.length ? `<div class="tbl-wrap"><table class="t compact noclick"><thead><tr><th>Số thông báo</th><th>Trạng thái</th><th>Ngày thông báo / phát hành</th><th>Ngày ${W}</th><th>Hạn nộp tiền (hạn cũ → hạn mới)</th><th>Người thực hiện</th></tr></thead><tbody>${d.items.map(row).join('')}</tbody></table></div>` : '<div class="empty">Căn chưa có thông báo nào</div>'}` });
}
document.addEventListener('click', e => { const a = e.target.closest('[data-bghist]'); if (!a) return; e.preventDefault(); e.stopPropagation(); bgHistory(+a.dataset.bghist, a.dataset.mode).catch(er => toast(er.message, true)); }, true);
async function bgPicker(el, form) {
  const G = el.dataset.mode === 'gcn', W = G ? 'Giấy chứng nhận' : 'bàn giao', AP = G ? '/api/gcn-notice/' : '/api/handover-notice/';
  const hid = $('input[type=hidden]', el), box = $('.upick-bd', el), F = k => M.ents[G ? 'gcn_notice' : 'handover_notice'].fields.find(f => f.k === k);
  const val = k => readField(form, F(k));
  let rows = [], key = '', auto = !hid.value, sel = new Set(String(hid.value).toUpperCase().split(/[,;\s]+/).filter(Boolean)), first = null;
  const draw = () => {
    if (!val('building_id')) { box.innerHTML = '<div class="muted small">Chọn dự án và mã tòa — app tự hiện các căn có HĐMB đã ký để tích.</div>'; return; }
    if (!rows.length) { box.innerHTML = '<div class="muted small">Tòa này chưa có căn hộ.</div>'; return; }
    box.innerHTML = `<div class="upick-sum">${sumHtml()}</div>
      ${val('handover_on') ? '' : `<div class="small hs-miss">Điền «${G ? 'Ngày bàn giao Giấy chứng nhận' : 'Ngày bàn giao'}» để xem hạn thu mới của đợt gắn ${W}.</div>`}${bgTable(rows, { pick: true, sel, mode: G ? 'gcn' : '' })}`;
  };
  const sumHtml = () => { const on = rows.filter(x => sel.has(x.code.toUpperCase())), hd = on.filter(x => x.inst_id), tot = hd.reduce((s, x) => s + (+x.amount || 0), 0);
    const unk = on.filter(x => x.contract_id && !x.inst_id).length;
    return `<b>Đã chọn ${on.length}/${rows.length} căn</b> · ${hd.length} HĐMB có đợt gắn ${W} · tiền các đợt gắn ${W} ${fm(tot)} đ${unk ? ` · <span class="hs-miss">${unk} HĐ chưa rõ đợt — chọn ở cột «Các đợt gắn ${W}»</span>` : ''}
      ${first ? ` · <span class="hs-ok">tòa đã ${G ? 'bàn giao Giấy chứng nhận' : 'bàn giao'} từ ${dmy(String(first).slice(0, 10))}</span>` : ''}<span class="grow"></span>
      <button type="button" class="btn sm" data-bga="hd">Chọn căn có HĐMB đã ký</button><button type="button" class="btn sm" data-bga="1">Chọn tất cả</button><button type="button" class="btn sm ghost" data-bga="0">Bỏ chọn hết</button>`; };
  const setHid = () => { hid.value = rows.filter(x => sel.has(x.code.toUpperCase())).map(x => x.code).join(','); };
  const setSel = s => { sel = s; setHid(); draw(); };
  const load = async () => {
    const qs = new URLSearchParams({ id: form.dataset.id || '', building: val('building_id') || '', on: val('handover_on') || '', notice: val('notice_on') || '', from: val('pay_from') || 'ban_giao', days: val('pay_days') ?? 0 });
    if (qs.toString() === key) return; const bChanged = !key.includes(`building=${qs.get('building')}&`); key = qs.toString();
    if (!qs.get('building')) { rows = []; draw(); return; }
    const r = await api('GET', AP + 'suggest?' + qs); rows = r.rows; first = r.bg_from;
    if (bChanged && (auto || !rows.some(x => sel.has(x.code.toUpperCase())))) { auto = true; setSel(new Set(rows.filter(x => x.inst_id && !x.hist?.cur && !x.hist?.drafts?.length).map(x => x.code.toUpperCase()))); } else draw();
  };
  let tm = 0; const soon = () => { clearTimeout(tm); tm = setTimeout(() => load().catch(e => toast(e.message, true)), 250); };
  form.addEventListener('change', e => { if (['project_id', 'building_id', 'handover_on', 'notice_on', 'pay_from', 'pay_days'].includes(e.target.name)) soon(); });
  form.addEventListener('input', e => { if (['handover_on', 'notice_on', 'pay_days'].includes(e.target.name)) soon(); });
  // tích 1 căn: chỉ cập nhật dòng + dòng tổng (không vẽ lại bảng → giữ chỗ đang cuộn)
  box.addEventListener('change', e => { const c = e.target; if (!c.dataset.bgu) return; e.stopPropagation(); auto = false; const k = c.dataset.bgu.toUpperCase(); c.checked ? sel.add(k) : sel.delete(k);
    setHid(); c.closest('tr').classList.toggle('sel', c.checked); $('.upick-sum', box).innerHTML = sumHtml(); });
  // đổi các đợt gắn bàn giao / số ngày của 1 HĐ: ghi thẳng vào Lần thanh toán của HĐMB (lần sau mọi thông báo đều nhận đúng)
  const saveBg = async (ct, fn, msg) => { const x = rows.find(y => y.contract_id === ct); if (!x) return;
    const its = fn(x.items.map(i => ({ seq: i.seq, days: i.own })));
    await api('POST', AP + (G ? 'set' : 'set-bg'), { contract_id: ct, items: its }); toast(msg); key = ''; await load(); };
  box.addEventListener('change', run(async e => { const c = e.target, d = c.dataset; if (!d.bgadd && !d.bgn) return; e.stopPropagation(); c.disabled = true;
    try { if (d.bgadd && c.value) await saveBg(+d.bgadd, its => [...its, { seq: +c.value, days: null }], `Đã gắn thêm đợt với ${W} (lưu vào HĐMB)`);
      if (d.bgn) await saveBg(+d.bgn, its => its.map(i => i.seq === +d.seq ? { ...i, days: c.value.trim() } : i), 'Đã lưu số ngày vào HĐMB'); } finally { c.disabled = false; } }));
  box.addEventListener('click', run(async e => { const b = e.target.closest('[data-bgx]'); if (!b) return; e.preventDefault();
    await saveBg(+b.dataset.bgx, its => its.filter(i => i.seq !== +b.dataset.seq), `Đã bỏ gắn đợt với ${W} (lưu vào HĐMB)`); }));
  box.addEventListener('click', e => { const b = e.target.closest('[data-bga]'); if (!b) return; auto = false;
    setSel(new Set(rows.filter(x => b.dataset.bga === '1' || (b.dataset.bga === 'hd' && x.inst_id)).map(x => x.code.toUpperCase()))); });   // 17/11/2026: kể cả căn đã có trong thông báo trước
  await load();
}
function show(f, row, { plain } = {}) {
  if (f.pick === 'units' && Array.isArray(row._units) && !plain) return unitsTable(row._units);
  if (f.pick === 'liq' && Array.isArray(row[f.k])) return plain ? row[f.k].map(x => x.number).join(' + ') : liqTable(row[f.k]);   // phiếu thanh lý chung: bảng từng hợp đồng + tổng
  if (f.pick === 'bg_units' && Array.isArray(row._bg) && !plain) return `<div class="small muted mb">${row._bg.length} căn · hạn thu đợt bàn giao ${row.status === 'da_duyet' ? 'đã cập nhật vào HĐMB' : 'sẽ cập nhật khi phát hành'}</div>` + bgTable(row._bg);
  if (f.pick === 'gcn_units' && Array.isArray(row._bg) && !plain) return `<div class="small muted mb">${row._bg.length} căn · hạn thu đợt gắn Giấy chứng nhận ${row.status === 'da_duyet' ? 'đã cập nhật vào HĐMB' : row.status === 'huy' ? 'đã trả về như trước khi phát hành' : 'sẽ cập nhật khi phát hành'}</div>` + bgTable(row._bg, { mode: 'gcn' });
  const v = row[f.k];
  if (f.k === 'fin_sched' && !plain && !(Array.isArray(v) && v.length)) return '<span class="muted">Chưa khai tiến độ riêng — giá trị hoàn thiện thu chung theo tiến độ thu tiền HĐMB ở trên</span>';
  if (v == null || v === '') return plain ? '' : '<span class="muted">—</span>';
  switch (f.t) {
    case 'money': return fm(v);
    case 'num': return fnum(v);
    case 'int': return String(v);
    case 'date': return dmy(v);
    case 'dt': return dmyhm(v);
    case 'month': return mmy(v);
    case 'bool': return v ? (plain ? 'Có' : `<span style="color:var(--g)">${ico('fa-circle-check')}</span>`) : (plain ? '' : `<span class="muted">${ico('fa-circle-minus')}</span>`);
    case 'sel': { const a = [].concat(f.alt || []).find(x => row[x.flag] && v === x.v), o = a ? [v, a.l, a.c] : optOf(f, v); return plain ? (o?.[1] ?? v) : o?.[2] ? pill(o[1], o[2]) : esc(o?.[1] ?? v); }   // alt: nhãn phụ theo cờ (VD HĐ «Dự thảo – Chờ duyệt hồ sơ»)
    case 'tags': { const ls = String(v).split(',').filter(Boolean).map(k => optOf(f, k)?.[1] ?? k); return plain ? ls.join(', ') : ls.map(l => `<span class="tag">${esc(l)}</span>`).join(' '); }
    case 'ref': case 'refs': case 'user': return esc(row[f.k + '__l'] ?? '#' + v);
    case 'check': { const n = v.filter(x => x.st === 'da_nhan').length, bad = v.filter(x => ['thieu', 'can_sua'].includes(x.st)).length; return plain ? `${n}/${v.length}` : `<span class="${bad ? 'neg' : ''}">${n}/${v.length}${bad ? ` · thiếu ${bad}` : ''}</span>`; }
    case 'json': if (f.k === 'finish_vals' && v && typeof v === 'object') { const xs = Object.entries(v).sort((a, b) => a[0].localeCompare(b[0], 'vi', { numeric: true })); return plain ? xs.map(([k, n]) => `${k}: ${fm(n)}`).join('; ') : `<div class="small">${xs.map(([k, n]) => `${esc(k)}: <b>${fm(n)}</b>`).join(' · ')}</div>`; }
      if (f.k === 'fin_sched' && Array.isArray(v)) return plain ? v.map((x, i) => `Đợt ${i + 1}: ${fnum(x.pct)}% sau ${x.days ?? '—'} ngày`).join('; ') : paySchedTable(v.map(x => ({ ...x, name: finTxt(x.name) })), { pay_mdot: 0 });
      if (f.k === 'pay_sched' && Array.isArray(v)) return plain ? v.map((x, i) => x.maint ? `Phí bảo trì: ${x.days ?? '—'} ngày` : `Đợt ${i + 1}: ${fnum(x.pct)}% sau ${x.days ?? '—'} ngày`).join('; ') : paySchedTable(v, row);
      if (f.grid && Array.isArray(v)) {
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
  if (k === 'doc_ret_on') return `<input class="ret-d" data-ret="doc_ret_on" value="${esc(dmy(r.doc_ret_on) || '')}" placeholder="dd/mm/yyyy" maxlength="10" inputmode="numeric" autocomplete="off" title="Ngày trả hồ sơ (dd/mm/yyyy)">`;   // 17/11/2026: dd/mm/yyyy
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
  el._last = segVal(el); el.classList.remove('bad');
}
function wireSegDate(root) {
  $$('.sdate', root).forEach(el => {
    if (el._sd) return; el._sd = 1;
    const ps = $$('.sd-p', el), nat = $('input[type=date]', el);
    el._last = segVal(el);   // giá trị đã phát gần nhất — segSet (đặt bằng chương trình) cũng cập nhật
    const fire = () => { const v = segVal(el); el.classList.toggle('bad', v === null); if (v !== null && v !== el._last) { el._last = v; el.dispatchEvent(new Event('sdchange', { bubbles: true })); } };
    ps.forEach((p, i) => {
      p.addEventListener('input', () => {
        p.value = p.value.replace(/\D/g, '').slice(0, +p.maxLength);
        if (p.value.length === +p.maxLength && ps[i + 1]) { ps[i + 1].focus(); ps[i + 1].select(); }
        fire();
      });
      p.addEventListener('keydown', e => {
        // 17/11/2026: tự xử lý chữ số — thay đúng phần đang bôi đen / ô đã đủ số thì thay cả phần (trước đây chữ số đầu gõ vào phần năm sau khi tự nhảy ô có thể bị mất: «2027» thành «027»)
        if (/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault();
          const a = p.selectionStart ?? p.value.length, b = p.selectionEnd ?? a, full = p.value.length >= +p.maxLength && a === b;
          const v = full ? e.key : (p.value.slice(0, a) + e.key + p.value.slice(b)).slice(0, +p.maxLength), c = full ? 1 : Math.min(a + 1, v.length);
          p.value = v; try { p.setSelectionRange(c, c); } catch {} p.dispatchEvent(new Event('input', { bubbles: true })); return; }
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
  if (f.upload) return `<div class="upfile"><input type="file" accept="${f.upload}" ${f.multi ? 'multiple ' : ''}${nm}>${v ? `<span class="small muted">Đang có: ${esc(v)} — chọn tệp mới để thay</span>` : ''}</div>`;
  if (f.pick === 'bg_units' || f.pick === 'gcn_units') return `<div class="upick" data-pick-bg${f.pick === 'gcn_units' ? ' data-mode="gcn"' : ''}><input type="hidden" ${nm} value="${esc(v ?? '')}"><div class="upick-bd"></div></div>`;
  if (f.pick === 'units') return `<div class="upick" data-pick-units><input type="hidden" ${nm} value="${esc(v ?? f.def ?? '*')}"${f.def === '' ? ' data-none' : ''}><div class="upick-bd"></div></div>`;   // def '' = chưa chọn căn nào
  switch (f.t) {
    case 'long': return `<textarea ${nm} rows="3">${esc(v ?? '')}</textarea>`;
    case 'money': return `<input ${nm} inputmode="numeric" value="${esc(moneyStr(v))}" autocomplete="off">`;
    case 'num': case 'int': return `<input ${nm} inputmode="decimal" value="${esc(v == null ? '' : String(v).replace('.', ','))}" autocomplete="off">`;
    case 'date': return `<div class="dwrap"><input ${nm} value="${esc(dmy(v))}" placeholder="dd/mm/yyyy" autocomplete="off"><button type="button" tabindex="-1" data-pick="date" title="Chọn ngày">${ico('fa-calendar-days')}</button><input type="date" tabindex="-1" aria-hidden="true"></div>`;
    case 'dt': return `<div class="dwrap"><input ${nm} value="${esc(dmyhm(v))}" placeholder="dd/mm/yyyy hh:mm" autocomplete="off"><button type="button" tabindex="-1" data-pick="datetime-local" title="Chọn ngày giờ">${ico('fa-calendar-days')}</button><input type="datetime-local" tabindex="-1" aria-hidden="true"></div>`;
    case 'month': return `<div class="dwrap"><input ${nm} value="${esc(mmy(v))}" placeholder="mm/yyyy" autocomplete="off"><button type="button" tabindex="-1" data-pick="month" title="Chọn tháng">${ico('fa-calendar')}</button><input type="month" tabindex="-1" aria-hidden="true"></div>`;
    case 'sel': return `<select ${nm}><option value="">— chọn —</option>${(f.o || []).map(o => `<option value="${esc(o[0])}" ${o[0] === v ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    case 'tags': { const on = String(v ?? '').split(','); return `<div class="tagpick" ${nm}>${(f.o || []).map(o => `<label class="chk"><input type="checkbox" value="${esc(o[0])}" ${on.includes(o[0]) ? 'checked' : ''}> ${esc(o[1])}</label>`).join('')}</div>`; }
    case 'bool': return `<label class="chk" style="height:38px"><input type="checkbox" ${nm} ${v ? 'checked' : ''}> Có</label>`;
    case 'user': { const us = M.users.filter(u => (u.active || u.id === v) && (!f.roles || f.roles.includes(u.role) || u.role === 'admin')); return `<select ${nm}><option value="">— chọn —</option>${us.map(u => `<option value="${u.id}" ${u.id === v ? 'selected' : ''}>${esc(u.full_name)} · ${esc(roleName(u.role))}</option>`).join('')}</select>`; }
    case 'ref': if (f.auto) return `<div class="ref-auto"><input type="text" readonly tabindex="-1" placeholder="${esc(f.autoPh || 'Tự lấy')}" value="${esc(rec[f.k + '__l'] ?? '')}" style="background:var(--soft, #f4f6f9);cursor:default"><input type="hidden" ${nm} value="${esc(v ?? '')}"></div>`;   // ô tự điền (chỉ đọc)
      return `<div class="combo" data-ref="${f.ref}" ${f.filter ? `data-filter="${f.filter}"` : ''} ${f.dep ? `data-dep="${f.dep}"` : ''} ${f.byUnit ? `data-byunit="${f.byUnit}"` : ''} ${f.unitOpt ? `data-unitopt="${f.unitOpt}"` : ''} ${f.optq ? `data-optq="${f.optq}"` : ''}><input type="text" placeholder="Gõ để tìm ${esc(M.ents[f.ref].one)}…" value="${esc(rec[f.k + '__l'] ?? '')}" autocomplete="off" data-combo><input type="hidden" ${nm} value="${esc(v ?? '')}"><button type="button" class="x" tabindex="-1" title="Bỏ chọn">${ico('fa-xmark')}</button></div>`;
    case 'refs': { const ids = v || [], ls = String(rec[f.k + '__l'] ?? '').split(', '), lab = (id, i) => { const p = f.ref === 'project' && M.projects.find(x => x.id === id); return p ? `${p.code} · ${p.name}` : ids.length === ls.length ? ls[i] : '#' + id; };
      return `<div class="combo multi" data-ref="${f.ref}" data-multi><div class="chips">${ids.map((id, i) => `<span class="chip" data-id="${id}">${esc(lab(id, i))}<button type="button" tabindex="-1" title="Bỏ">${ico('fa-xmark')}</button></span>`).join('')}<input type="text" placeholder="${ids.length ? 'Thêm' : 'Gõ để tìm'} ${esc(M.ents[f.ref].one)}…" autocomplete="off" data-combo></div><input type="hidden" ${nm} value="${esc(ids.join(','))}"></div>`; }
    case 'check': return `<div class="cklist${f.qty ? ' qty' : ''}" ${nm} ${f.qty ? 'data-qty' : ''}>${checkRows(v || [], f.qty)}</div>`;
    case 'json': if (f.pick === 'liq') return `<div class="upick" data-pick-liq><input type="hidden" ${nm} value="${esc(JSON.stringify(Array.isArray(v) ? v : []))}"><div class="upick-bd"></div></div>`;   // phiếu thanh lý chung (16/11/2026)
      if (f.pick === 'finish') return `<div class="upick" data-pick-fin><input type="hidden" ${nm} value="${esc(JSON.stringify(v || {}))}"><div class="upick-bd"></div></div>`;
      return f.k === 'pay_sched' ? `<div data-psched ${nm}></div>` : f.k === 'fin_sched' ? `<div data-fsched ${nm}></div>` : f.k === 'new_schedule' ? `<div data-sched ${nm}></div>` : f.k === 'sale_sched' ? `<div data-ssched ${nm}></div>` : f.grid ? `<div class="gridin" ${nm}>${gridRows(f, v || [])}</div>` : `<div class="ro">${show(f, rec)}</div>`;
    default: if (f.choose) return `<select ${nm}>${[...new Set([...f.choose, ...(v ? [v] : [])])].map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;   // ô chữ nhưng chọn trong danh sách (giữ giá trị cũ ngoài danh sách)
      if (f.sugRef) return `<div class="sugc"><input ${nm} value="${esc(v ?? '')}" autocomplete="off" placeholder="Gõ mã hoặc tên để tìm ${esc(M.ents[f.sugRef].one)} đã có…"><button type="button" class="x" tabindex="-1" title="Xóa">${ico('fa-xmark')}</button></div>`;   // gợi ý động (sổ như ô Mã căn hộ — 18/11/2026): xem openForm
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
    ${f.fixed ? '' : `<button type="button" class="btn sm mt" data-gadd>${ico('fa-plus')} ${esc(f.addLabel || 'Thêm thành viên')}</button>`}${f.grid.filter(c => c.sug).map(c => sugList(`dl_${f.k}_${c.k}`, c.sug)).join('')}`;
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
// 15/11/2026: mọi ô ngày cùng 1 kiểu — gõ dd/mm/yyyy hoặc bấm nút lịch (không dùng ô ngày của trình duyệt: Windows tiếng Anh hiện mm/dd/yyyy)
function addPicker(txt) {
  if (!txt || txt.readOnly || txt.closest('.dwrap')) return;
  const w = document.createElement('span'); w.className = 'dwrap dwrap-in'; txt.before(w); w.append(txt);
  w.insertAdjacentHTML('beforeend', `<button type="button" tabindex="-1" title="Chọn ngày">${ico('fa-calendar-days')}</button><input type="date" tabindex="-1" aria-hidden="true">`);
  const b = $('button', w), nat = $('input[type=date]', w);
  b.onclick = () => { try { nat.value = parseDmy(txt.value) || ''; } catch { } try { nat.showPicker(); } catch { nat.click(); } };
  nat.onchange = () => { txt.value = nat.value ? dmy(nat.value) : ''; txt.dispatchEvent(new Event('input', { bubbles: true })); txt.dispatchEvent(new Event('change', { bubbles: true })); };
  txt.addEventListener('blur', () => { const m = /^(\d{1,2})(\d{2})(\d{4})$/.exec(txt.value.trim()); if (m) txt.value = `${m[1].padStart(2, '0')}/${m[2]}/${m[3]}`; });
}
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
  if (typeof s === 'number') return s; s = String(s ?? '').replace(/\s|đ|₫|%/g, ''); if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (money || /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}
function readField(root, f) {
  const el = $(`[name="${f.k}"]`, root); if (!el) return undefined;
  if (f.upload) return el.files?.length ? [...el.files].map(x => x.name).join('; ') : undefined;
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
    case 'tags': return [...el.querySelectorAll('input:checked')].map(i => i.value).join(',') || null;
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
    // HĐMB (15/11/2026): ô khách hàng chỉ hiện khách gắn với căn đã chọn + tình trạng xét duyệt hồ sơ NOXH; chưa chọn căn thì nhắc chọn căn trước
    const byU = c.dataset.byunit && ($('[name="kind"]', root)?.value || 'hdmb') === 'hdmb', uv = byU ? $(`[name="${c.dataset.byunit}"]`, root)?.value : null;
    if (byU && !uv) { items = []; if (document.activeElement !== txt) return; close(); box = document.createElement('div'); box.className = 'opts'; box.innerHTML = '<div class="muted">Chọn mã căn hộ trước — danh sách khách hàng theo căn đã chọn</div>'; c.append(box); return; }
    if (uv) p.set('unit', uv);
    // phiếu thu / chi (17/11/2026): đã chọn mã căn → chỉ các hợp đồng (phiếu thanh lý) của căn đó; chưa chọn căn thì tìm trong tất cả
    const uo = c.dataset.unitopt ? $(`[name="${c.dataset.unitopt}"]`, root)?.value : null; if (uo) p.set('unit', uo);
    if (c.dataset.optq) new URLSearchParams(c.dataset.optq).forEach((v, k) => p.set(k, v));
    try { items = await api('GET', `/api/opts/${ref}?${p}`); } catch { items = []; }
    if (uo && !items.length && !txt.value.trim() && document.activeElement === txt) { close(); box = document.createElement('div'); box.className = 'opts'; box.innerHTML = `<div class="muted">Căn này chưa có ${esc(M.ents[ref].one)} nào${c.dataset.optq ? '' : ' (trừ HĐ đã hủy)'}</div>`; c.append(box); return; }
    if (uv && !items.length && document.activeElement === txt) { close(); box = document.createElement('div'); box.className = 'opts'; box.innerHTML = '<div class="muted">Căn này chưa có khách hàng đăng ký / hồ sơ NOXH</div>'; c.append(box); return; }
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

// tiến độ thu tiền khai ở chính sách bán hàng (16/11/2026) — xem ở chi tiết chính sách. Đợt: { name, pct, days (số ngày sau ngày ký HĐMB, trống = chưa có ngày cố định) };
// dòng phí bảo trì { maint: true, name, days } (bản cũ không có dòng này: phí bảo trì cùng hạn đợt pay_mdot)
const paySchedTable = (v, row = {}) => {
  const ns = v.filter(x => !x.maint), m = v.find(x => x.maint), md = +(row.pay_mdot || 3);
  const hn = x => x.days == null || x.days === '' ? '<span class="muted">Chưa có ngày cố định — nhập ở HĐ</span>' : !+x.days ? 'Ngày ký HĐMB' : `${x.days} ngày sau ngày ký HĐMB`;
  return `<div class="tbl-wrap"><table class="t compact noclick sched-v"><thead><tr><th>Đợt</th><th>Nội dung</th><th>Hạn</th><th class="num">Tỷ lệ %</th></tr></thead><tbody>
  ${ns.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name || '')}${!m && i + 1 === md ? '<div class="small muted">+ thu phí bảo trì cùng hạn đợt này</div>' : ''}</td><td class="nowrap">${hn(x)}</td><td class="num">${fnum(x.pct)}%</td></tr>`).join('')}
  ${m ? `<tr class="sched-m"><td><b>Phí bảo trì</b></td><td>${esc(m.name || '')}</td><td class="nowrap">${hn(m)}</td><td class="num muted">—</td></tr>` : ''}
  </tbody><tfoot><tr><td colspan="3"><b>Tổng</b></td><td class="num"><b>${fnum(ns.reduce((s, x) => s + (+x.pct || 0), 0))}%</b></td></tr></tfoot></table></div>`;
};
// soạn tiến độ thu tiền ở form chính sách — dùng đúng bảng «Lần thanh toán» của HĐMB (Tâm 16/11/2026: «bê y hệt»): chọn đợt gợi ý nội dung, «Sau N ngày…» tự ra hạn,
// dòng phí bảo trì riêng. Ngày đến hạn tính mẫu theo ngày ký = Ngày bắt đầu chính sách; lưu thành số ngày sau ngày ký → HĐMB thật tính theo ngày ký của từng HĐ
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
// tiến độ nội thất (HĐ hoàn thiện / tiến độ hoàn thiện của chính sách) — 14/11/2026: «giá trị căn hộ» đọc là «giá trị hoàn thiện nội thất»
const finTxt = s => String(s ?? '').replace(/giá trị (của )?căn hộ/gi, 'giá trị hoàn thiện nội thất');
function paySchedEditor(el, rows, form, rec = {}, { fin } = {}) {   // fin: tiến độ thu giá trị hoàn thiện (không có dòng phí bảo trì)
  const sf = { k: 'start_on', t: 'date' }, baseOf = () => (form?.elements.start_on && readField(form, sf)) || rec.start_on || today();
  const b0 = baseOf(), has = x => x.days != null && x.days !== '';
  const R0 = (rows || []).map(x => x.maint ? { name: x.name, due_on: has(x) ? addDays(b0, +x.days) : '', maint: true }
    : { name: x.name, pct: x.pct, amount: null, due_on: has(x) ? addDays(b0, +x.days) : '', ...(has(x) && +x.days ? { _days: +x.days } : {}) });
  schedEditor(el, R0, { total: 0, first: baseOf, maint: fin ? undefined : () => 0, mdot: () => +(rec.pay_mdot || 3), pol: true, fin });
  const get = el._get;
  el._get = () => { const b = baseOf(); return get().map(x => ({ name: x.name, ...(x.maint ? { maint: true } : { pct: x.pct }), days: x.due_on ? dayDiff(x.due_on, b) : null })); };
  form?.addEventListener('change', e => { if (e.target.name === 'start_on') el._redraw?.(); });
}

// lịch thanh toán (soạn các đợt)
// tổng tỷ lệ: đợt tiền nhà và đợt hoàn thiện (mỗi phần đủ 100%) tách riêng
const pctSum = R => { const t = xs => fnum(xs.reduce((s, r) => s + (+r.pct || 0), 0)) + '%', f = R.filter(r => r.fin); return f.length ? `${t(R.filter(r => !r.fin))} · hoàn thiện ${t(f)}` : t(R); };
function schedEditor(el, rows, { total, base, first, maint, mdot, bgBase, pol, fin, finish, nt, tools } = {}) {   // tools: nút riêng đặt đầu hàng nút phía trên bảng (VD «Lấy tiến độ theo chính sách»)   // nt: tiến độ nội thất (HĐ hoàn thiện) — chữ «giá trị căn hộ» → «giá trị hoàn thiện nội thất»   // fin: bảng tiến độ hoàn thiện ở chính sách; finish(): giá trị hoàn thiện của HĐ — dòng r.fin tính % trên hoàn thiện   // pol: bảng tiến độ ở chính sách bán hàng — không có số tiền (tính theo giá từng căn)
    // bgBase(): { doc, on, days } — căn đã có thông báo bàn giao phát hành   // maint(): phí bảo trì, mdot(): đợt mặc định cho hạn phí bảo trì   // first(): ngày cố định của đợt 1 (hợp đồng: ngày ký HĐMB)
  const ntOn = !!(fin || nt), ntR = r => ntOn && !r.maint ? { ...r, name: finTxt(r.name) } : { ...r };
  let R = (rows || []).map(ntR);
  // HĐMB: phí bảo trì là DÒNG RIÊNG cố định cuối bảng (không xóa, số tiền = phí bảo trì); hạn tự theo đợt thu phí bảo trì cho đến khi sửa tay —
  // đợt có nội dung nhắc «bảo trì» (mẫu: «… và 2% phí bảo trì»), không có thì đợt mặc định (3)
  const mIdx = () => { const k = R.findIndex(r => /bảo trì/i.test(r.name || '')); return k >= 0 ? k : Math.max(1, +(mdot?.() || 3)) - 1; };
  let MR = maint ? R.find(r => r.maint) || null : null;
  if (maint) { R = R.filter(r => !r.maint); if (MR) MR = { name: MR.name, due_on: MR.due_on, auto: !MR.bg && (!MR.due_on || MR.due_on === R[mIdx()]?.due_on), bg: !!MR.bg, bg_days: MR.bg_days ?? null }; }
  // đợt bàn giao (13/11/2026): HĐMB tự chọn đợt nào là đợt bàn giao (đợt 2 / 3 / 4… tùy HĐ) + số ngày được nộp kể từ ngày bàn giao.
  // Chưa đánh dấu thì tự nhận đợt có nội dung nhắc «bàn giao / nhận nhà» (số ngày lấy từ câu «… 15 ngày kể từ ngày bàn giao»)
  const BG_T = /b[àa]n\s*giao|nh[ậa]n\s*nh[àa]|giao\s*nh[àa]/i;
  const SBG = false;   // 16/11/2026: bỏ cột «Đợt bàn giao» khỏi bảng (không tự nhận đợt bàn giao nữa); đợt đã đánh dấu trước đây giữ nguyên
  const bgDaysIn = s => { const m = /(\d+)\s*(?:\([^)]*\)\s*)?ngày[^.;]{0,60}?(?:b[àa]n\s*giao|nh[ậa]n\s*nh[àa]|giao\s*nh[àa])/i.exec(s || ''); return m ? +m[1] : null; };
  if (SBG && maint && maint() != null && !R.some(r => r.bg)) { const k = R.findIndex(r => BG_T.test(r.name || '')); if (k >= 0) { R[k].bg = true; R[k]._bgAuto = true; R[k].bg_days ??= bgDaysIn(R[k].name); } }
  const totalOf = () => typeof total === 'function' ? total() : total;
  const C = (first ? M.settings.schedule_contents || [] : []).map(c => ntOn ? { ...c, name: finTxt(c.name) } : c);   // gợi ý nội dung từng đợt (hợp đồng)
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
  { const f0 = first?.() || R[0]?.due_on;   // lịch đã lưu: hạn đúng «Sau N ngày» thì vẫn đi theo ngày ký (15/11/2026: HĐ chưa ghi ngày ký → mốc = hạn kỳ 1, VD HĐ tự lập từ hồ sơ NOXH)
    if (f0) for (const r of R) { const n = +r.sign_days > 0 ? +r.sign_days : nDays(r.name); if (n && addDays(f0, n) === r.due_on) r._days = n; } }
  const draw = () => {
    const f1 = first?.(), d1 = /^\d{4}-\d{2}-\d{2}$/.test(f1 || '') ? f1 : null; if (d1 && R[0] && !R[0]._keep) R[0].due_on = d1;   // ngày đang gõ dở thì giữ ngày trước
    if (d1) R.forEach((r, i) => { if (r._keep) return; if ((i || fin) && r._days) r.due_on = addDays(d1, r._days); if (r._d0) r.due_on = d1; });   // đợt tính theo ngày ký đi theo ngày ký (_keep: kế thừa từ HĐ khác — giữ ngày)
    // tỷ lệ % các đợt × tiền sau thuế (= tổng − phí bảo trì); phí bảo trì ở dòng riêng cố định
    // maint() = null: không áp dụng (HĐ thuê, vay…); số (kể cả 0 khi chưa chọn căn): HĐMB — luôn có dòng phí bảo trì
    const tot = totalOf() || 0, mv = maint?.(), on = mv != null, mt = +(mv || 0), hasM = mt > 0, mi = on ? mIdx() : -1, fs = R.some(r => r.fin) ? +(finish?.() || 0) : 0, base = (hasM ? tot - mt : tot) - fs;
    const bgB = on ? bgBase?.() : null;   // đã phát hành thông báo bàn giao: hạn đợt bàn giao = ngày bàn giao + số ngày
    if (bgB?.on) [...R, ...(MR?.bg ? [MR] : [])].forEach(r => { if (r.bg) { r.due_on = addDays(bgB.on, r.bg_days ?? bgB.days ?? 0); if (r === MR) MR.auto = false; } });
    const bgCell = (r, at) => `<td class="sched-bg"><label class="chk small"><input type="checkbox" ${at} ${r.bg ? 'checked' : ''}> Bàn giao</label>${r.bg ? `<div class="small nowrap"><input data-${at.startsWith('data-bgm') ? 'mk' : 'k'}="bg_days" value="${r.bg_days ?? ''}" placeholder="${bgB?.days ?? 0}" inputmode="numeric" style="width:46px;text-align:right" title="Số ngày được nộp kể từ ngày bàn giao — để trống = theo thông báo bàn giao"> ngày${r._bgAuto ? ' <span class="muted" title="App tự nhận theo nội dung đợt — bỏ tích nếu sai">· tự nhận</span>' : ''}</div>${bgB?.on ? `<div class="small hs-ok" title="Thông báo bàn giao ${esc(bgB.doc || '')}">BG ${dmy(bgB.on)}</div>` : ''}` : ''}</td>`;
    if (on) { MR ||= { name: 'Thu phí bảo trì (2% tiền trước thuế)', due_on: '', auto: true }; if (MR.auto) MR.due_on = R[mi]?.due_on || ''; }
    const pa = r => r.pct ? Math.round((r.fin ? fs : base) * r.pct / 100) : 0, sum = R.reduce((s, r) => s + (+r.amount || pa(r)), 0) + (hasM ? mt : 0);
    const mRow = on ? `<tr data-m class="sched-m"><td><b>Phí bảo trì</b></td><td><input data-mk="name" value="${esc(MR.name || '')}" style="width:100%"></td>${pol ? '' : `<td><input data-mk="due_on" value="${esc(dmy(MR.due_on) || '')}" placeholder="dd/mm/yyyy" style="width:120px" title="Tự theo hạn đợt ${mi + 1} (đợt có nội dung nhắc phí bảo trì, không có thì đợt 3) — sửa được; xóa trống thì lại tự theo"></td>`}<td class="num muted">—</td>${pol ? '' : `<td><input value="${mt ? fm(mt) : ''}" placeholder="${pol ? '2% tiền trước thuế' : 'chọn căn để tính'}" readonly style="width:150px;text-align:right" title="Phí bảo trì = 2% tiền trước thuế — tự tính khi chọn căn / nhập giá"></td>`}${SBG ? bgCell(MR, 'data-bgm="1"') : ''}<td></td></tr>` : '';
    el.innerHTML = `<div class="row mb sched-pre"${pol ? ' style="display:none"' : ''}>${(M.settings.schedule_presets || []).map((p, i) => `<button type="button" class="btn sm" data-pre="${i}">${ico('fa-wand-magic-sparkles')} ${esc(p.name)}</button>`).join('')}<span class="muted small"${pol ? ' hidden' : ''}>Mẫu tính ngày từ ngày gốc</span><input class="inp" style="width:120px;height:30px${pol ? ';display:none' : ''}" data-base value="${esc(dmy(d1 || base || today()))}"></div>
      <table class="t compact noclick sched ${C.length ? 'pick' : ''} ${pol ? 'pol' : ''}"><thead><tr><th>Đợt</th><th>Nội dung</th>${pol ? '' : '<th>Ngày đến hạn</th>'}<th class="num">Tỷ lệ %</th>${pol ? '' : '<th class="num">Số tiền</th>'}${on && SBG ? `<th title="Tích đợt thu khi bàn giao nhà (đợt 2, 3, 4… tùy hợp đồng) — Thông báo bàn giao phát hành thì hạn đợt này = ngày bàn giao + số ngày">Đợt bàn giao</th>` : ''}<th></th></tr></thead><tbody>
      ${R.map((r, i) => `<tr data-i="${i}"><td>${C.length ? `<select data-sug="${i}" title="Chọn đợt để gợi ý nội dung, tỷ lệ, hạn"><option value="">Đợt ${i + 1}</option>${C.map((c, j) => `<option value="${j}" ${c.name === r.name ? 'selected' : ''}>${esc(c.dot)}</option>`).join('')}</select>` : i + 1}${r.fin ? '<div class="small fin-tag">Hoàn thiện</div>' : ''}</td><td>${C.length ? `<textarea data-k="name" rows="${pol ? 3 : 2}" placeholder="Chọn đợt để gợi ý hoặc tự ghi nội dung">${esc(r.name || '')}</textarea>` : `<input data-k="name" value="${esc(r.name || '')}">`}</td>${pol ? '' : `<td><input data-k="due_on" value="${esc(dmy(r.due_on) || r.due_on || '')}" placeholder="dd/mm/yyyy" style="width:120px"${d1 && !i ? ' readonly title="Tự theo ngày ký hợp đồng mua bán"' : r.bg && bgB?.on ? ` readonly title="Theo thông báo bàn giao ${esc(bgB.doc || '')}: ngày bàn giao ${dmy(bgB.on)} + ${r.bg_days ?? bgB.days ?? 0} ngày"` : r._lock ? ` readonly title="${esc(r._lock)}"` : r._wait ? ` title="${esc(r._wait)}"${r.due_on ? '' : ' placeholder="ngày dự kiến"'}` : ''}>${r._lock ? `<div class="small hs-ok sched-ev" title="${esc(r._lock)}">${ico('fa-lock')} theo thông báo</div>` : r._wait ? `<div class="small muted sched-ev" title="${esc(r._wait)}">${r.due_on ? 'ngày dự kiến' : 'chờ thông báo'}</div>` : ''}</td>`}<td><input data-k="pct" value="${r.pct ?? ''}" style="width:70px;text-align:right"></td>${pol ? '' : `<td><input data-k="amount" value="${r.amount && !pol ? fm(r.amount) : ''}" placeholder="${pol ? 'theo giá từng căn' : r.pct && tot ? fm(pa(r)) : ''}"${pol ? ' readonly title="Số tiền = tỷ lệ % × tiền sau thuế của từng căn — tính khi lập HĐMB"' : ''} style="width:150px;text-align:right"></td>`}${on && SBG ? bgCell(r, `data-bg="${i}"`) : ''}<td><div class="sched-acts"><button type="button" class="btn ghost sm" data-del="${i}" title="Xóa đợt">${ico('fa-trash')}</button></div></td></tr>`).join('')}<tr class="sched-add"><td colspan="${(on && SBG ? 7 : 6) - (pol ? 2 : 0)}"><button type="button" class="btn sm" data-add>${ico('fa-plus')} Thêm đợt</button></td></tr>${mRow}
      </tbody><tfoot><tr><td colspan="${pol ? 2 : 3}"><b>Tổng</b></td><td class="num">${pctSum(R)}</td>${pol ? '' : `<td class="num ${tot && Math.abs(sum - tot) > 1000 * (R.length + 1) ? 'neg' : 'pos'}">${fm(sum)}</td>`}${on && SBG ? '<td></td>' : ''}<td></td></tr></tfoot></table>
      ${pol && fin ? `<div class="small muted mt">Tổng tỷ lệ các đợt phải đủ 100% — tính trên <b>giá trị hoàn thiện</b> của từng căn. Chỉ căn có giá trị hoàn thiện (nội thất) mới có các đợt này trong HĐMB; căn không có hoàn thiện bỏ qua. Đợt 1 mặc định thu khi ký HĐMB; nội dung «Sau / Trong (vòng) N ngày…» = N ngày sau ngày ký.</div>` : pol ? `<div class="small muted mt">Tổng tỷ lệ các đợt phải đủ 100% (tính trên tiền sau thuế của từng căn); phí bảo trì thu ở dòng riêng${R[mi] ? `, mặc định cùng hạn đợt ${mi + 1}` : ''}. Không nhập ngày đến hạn / số tiền ở chính sách: HĐMB tự tính — đợt 1 = ngày ký HĐMB, nội dung «Sau / Trong (vòng) N ngày…» = N ngày sau ngày ký; đợt theo sự kiện khác (VD thông báo bàn giao) nhập hạn ở HĐ hoặc theo thông báo bàn giao. Số tiền = tỷ lệ % × tiền sau thuế của từng căn.<br>Chính sách được duyệt phát hành → HĐMB <b>dự thảo / bị từ chối</b> của các căn đã tích tự cập nhật Lần thanh toán; lập HĐMB mới, chọn mã căn → Lần thanh toán tự điền theo chính sách (vẫn sửa được). HĐ đã trình duyệt / đã ký giữ nguyên.</div>` : `<div class="small muted mt">Phải khớp nghĩa vụ phải thu: <b>${fm(tot)}</b> đ.${hasM ? ` Tỷ lệ % các đợt tính trên tiền sau thuế <b>${fm(base)}</b> đ; phí bảo trì <b>${fm(mt)}</b> đ thu ở dòng riêng${R[mi] ? `, cùng hạn đợt ${mi + 1}` : ''}.` : ''} Nhập tỷ lệ % hoặc số tiền; chênh lệch làm tròn (≤ 1.000đ/đợt) dồn vào đợt cuối.</div>`}`;
    $$('input[data-k=due_on], input[data-mk=due_on]', el).forEach(addPicker);   // 15/11/2026: hạn các đợt có nút lịch
    if (tools) $('.row.mb', el)?.prepend(tools);   // vẽ lại bảng: nút riêng vẫn đứng đầu hàng nút (giữ nguyên sự kiện)
  };
  const sync = () => {
    $$('tbody tr[data-i]', el).forEach(tr => { const r = R[+tr.dataset.i]; for (const i of $$('input[data-k],textarea[data-k]', tr)) { const k = i.dataset.k; r[k] = k === 'bg_days' ? (i.value.trim() === '' ? null : Math.max(0, parseInt(i.value, 10) || 0)) : k === 'pct' ? (i.value.trim() ? num(i.value) : null) : k === 'amount' ? (i.value.trim() ? num(i.value, true) : null) : k === 'due_on' ? parseDmy(i.value) : i.value; } });
    const mr = $('tbody tr[data-m]', el);   // dòng phí bảo trì: sửa hạn thì thôi tự theo đợt; xóa trống thì lại tự theo
    if (mr && MR) { MR.name = $('[data-mk=name]', mr).value; const md = $('[data-mk=due_on]', mr), d = md ? parseDmy(md.value) : MR.due_on; if (d !== MR.due_on && !MR.bg) { MR.due_on = d; MR.auto = !d; }
      const bd = $('[data-mk=bg_days]', mr); if (bd) MR.bg_days = bd.value.trim() === '' ? null : Math.max(0, parseInt(bd.value, 10) || 0); }
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || tools?.contains(b)) return; sync();
    if (b.dataset.add !== undefined) { const r = { name: C.length ? '' : `Đợt ${R.length + 1}`, due_on: '', pct: null, amount: null }; if (C[R.length]) useC(r, C[R.length]); R.push(r); }
    if (b.dataset.del !== undefined) R.splice(+b.dataset.del, 1);
    if (b.dataset.pre !== undefined) { const p = M.settings.schedule_presets[+b.dataset.pre], bs = parseDmy($('[data-base]', el).value) || today(); R = p.rows.map(([name, pct, off]) => ({ name, pct, due_on: addDays(bs, off), amount: null })); }
    draw();
  });
  el.addEventListener('change', e => {
    const d = e.target.dataset;
    if (d.sug !== undefined) { sync(); if (e.target.value) useC(R[+d.sug], C[+e.target.value]); draw(); }
    if (d.bg !== undefined) { sync(); R.forEach(r => delete r._bgAuto); const r = R[+d.bg]; r.bg = e.target.checked; r.bg_days = r.bg ? r.bg_days ?? bgDaysIn(r.name) : null; draw(); }   // nhiều đợt gắn bàn giao
    if (d.bgm !== undefined) { sync(); R.forEach(r => delete r._bgAuto); MR.bg = e.target.checked; if (MR.bg) MR.auto = false; else { MR.bg_days = null; MR.auto = true; } draw(); }   // phí bảo trì nộp theo ngày bàn giao
    if (d.k === 'bg_days' || d.mk === 'bg_days') { sync(); draw(); }
    if (d.k === 'due_on') { sync(); const i = +e.target.closest('tr').dataset.i; delete R[i]._days; maintFollow(i); }   // sửa tay hạn đợt thì không còn tự theo ngày ký; phí bảo trì theo đợt thu phí bảo trì
    if (d.k === 'pct') {   // sửa ô Tỷ lệ → số % trong nội dung đổi theo (nội dung có ghi tỷ lệ)
      const i = +e.target.closest('tr').dataset.i, old = R[i]?.name; sync();
      const f = pctIn(old), v = R[i].pct; if (f && v != null && v !== f.v) R[i].name = old.slice(0, f.at) + fnum(v) + old.slice(f.at + f.len);
      R[i].amount = null; draw();
    }
    if (d.k === 'amount') { sync(); draw(); }
  });
  // 17/11/2026: sửa hạn đợt thu phí bảo trì (VD đợt 3 — đợt bàn giao) → ngày thu phí bảo trì đổi ngay cùng ngày (trừ phí bảo trì gắn bàn giao riêng)
  const maintFollow = i => {
    if (!MR || MR.bg || i !== mIdx()) return;
    MR.auto = true; MR.due_on = R[i]?.due_on || '';
    const mi = $('tbody tr[data-m] [data-mk="due_on"]', el); if (mi) mi.value = dmy(MR.due_on) || '';
  };
  // sửa «Sau 60 ngày» thành «Sau 65 ngày» trong nội dung → hạn đổi ngay theo ngày ký
  el.addEventListener('input', e => {
    if (e.target.dataset.k === 'due_on') {   // đang gõ hạn đợt: đủ ngày hợp lệ thì phí bảo trì theo ngay
      const i = +e.target.closest('tr').dataset.i, v = parseDmy(e.target.value);
      if (v && R[i]) { R[i].due_on = v; maintFollow(i); }
      return;
    }
    if (e.target.dataset.k === 'name') {   // «… thanh toán 30% …» → sửa thành 100% thì Tỷ lệ = 100, Số tiền tính lại
      const tr = e.target.closest('tr'), r = R[+tr.dataset.i], f = pctIn(e.target.value);
      if (r && f && f.v !== r.pct) {
        r.pct = f.v; r.amount = null; $('[data-k="pct"]', tr).value = fnum(f.v);
        const tot = totalOf() || 0, mt = +(maint?.() || 0), a = $('[data-k="amount"]', tr);
        const fs0 = R.some(q => q.fin) ? +(finish?.() || 0) : 0;
        if (a) a.value = ''; if (a) a.placeholder = tot ? fm(Math.round((r.fin ? fs0 : (mt > 0 ? tot - mt : tot) - fs0) * f.v / 100)) : '';
        // dòng Tổng cập nhật tại chỗ (không vẽ lại bảng: đang gõ, và bấm nút ngay sau khi rời ô không bị mất)
        const base = (mt > 0 ? tot - mt : tot) - fs0, sum = R.reduce((x, q) => x + (+q.amount || (q.pct ? Math.round((q.fin ? fs0 : base) * q.pct / 100) : 0)), 0) + (mt > 0 ? mt : 0), ft = $$('tfoot td.num', el), lech = !!tot && Math.abs(sum - tot) > 1000 * (R.length + 1);
        if (ft[0]) ft[0].textContent = pctSum(R);
        if (ft[1]) { ft[1].textContent = fm(sum); ft[1].classList.toggle('neg', lech); ft[1].classList.toggle('pos', !lech); }
      }
    }
    if (e.target.dataset.k !== 'name' || !first) return;
    const tr = e.target.closest('tr'), i = +tr.dataset.i, n = nDays(e.target.value), d = first();
    if (!i || !/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return;
    const dI = $('[data-k="due_on"]', tr);   // chính sách: không có ô ngày — hạn giữ trong R
    if (n) { R[i]._days = n; R[i].due_on = addDays(d, n); if (dI) dI.value = dmy(R[i].due_on); }
    else if (R[i]._days) { delete R[i]._days; R[i].due_on = ''; if (dI) dI.value = ''; }   // nội dung không còn theo ngày ký: bỏ hạn đã tự sổ
  });
  el._set = rows => {   // điền sẵn các đợt (HĐ thuê tự chia kỳ; HĐMB theo tiến độ chính sách — có dòng phí bảo trì thì lấy tên, hạn tự theo đợt)
    R = rows.map(ntR); R.forEach(r => { if (+r.sign_days > 0) r._days = +r.sign_days; });   // đợt «Sau N ngày» (máy chủ ghi sign_days) đi theo ngày ký khi sửa ngày ký
    if (maint) { const m = R.find(r => r.maint); R = R.filter(r => !r.maint); if (m) MR = { name: m.name, due_on: m.due_on || '', auto: !m.due_on || m.due_on === R[mIdx()]?.due_on }; }
    draw();
  };   // điền sẵn các đợt (HĐ thuê tự chia kỳ)
  el._get = () => {
    sync(); const out = R.filter(r => r.name || r.due_on || r.pct || r.amount).map(r => ({ name: r.name, due_on: r.due_on, pct: r.pct, amount: r.amount, ...(r.bg ? { bg: true, bg_days: r.bg_days ?? null } : {}), ...(r.gcn ? { gcn: true, gcn_days: r.gcn_days ?? null } : {}), ...(r.fin ? { fin: true } : {}) }));
    if (MR && (pol || +(maint?.() || 0) > 0)) {
      if (MR.auto) MR.due_on = R[mIdx()]?.due_on || '';
      out.push({ name: MR.name, due_on: MR.due_on, pct: null, amount: null, maint: true, ...(MR.bg ? { bg: true, bg_days: MR.bg_days ?? null } : {}) });   // máy chủ tự xếp dòng này theo ngày đến hạn
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
      ['co_owner_vc'], ['co_owner'], ['co_owner_id_no'], ['co_owner_id_date', 'co_owner_id_place'], ['agreement', 'agreement_on']] },   // người đồng sở hữu (vợ / chồng) + VBTT sở hữu chung (13/11/2026)
    { t: 'Bên bán nhà ở', rows: [['s_name'], ['s_addr'], ['s_phone', 's_tax'], ['s_bank_acc'], ['s_bank_name'], ['s_rep'], ['s_title'], ['s_poa'], ['owner_id'], ['commission_amt', 'commission_pct'], ['common_area_amt', 'all_signed']] }] },
  { t: 'Thông tin chi tiết', cols: 4, rows: [['number', 'contract_on'], ['ptype', 'building_id', 'kind', 'nature'], ['base_price', 'area_tt', 'area_floor'], ['area_land', 'land_price', 'land_amt'], ['area_build', 'build_price', 'build_amt'],
    ['pretax', 'vat_pct', 'vat_amt', 'after_tax'], ['finish_value', 'maint_fee', 'corner_pct', 'corner_amt'],
    ['sale_unit_val', 'sale_maint', 'sale_finish'],   // 17/11/2026: HĐ vay / thuê bán căn — thành phần giá theo chính sách bán
    ['unit_total', 'discount', 'late_rate'],   // late_rate: lãi suất quá hạn HĐMB (sau ô Tổng tiền) · giảm giá cạnh tổng tiền: HĐMB ô Tổng tiền (value) được đưa về cạnh ô này (hdPair.view); HĐ thuê: Tổng tiền (giá trị căn hộ) − giảm giá
    ['loan_recv_on', 'loan_tranches', 'int_mode'],   // HĐ vay
    ['eff_on', 'exp_on', 'term_months', 'pay_times'],   // HĐ thuê (BRAVO) · HĐ vay: bắt đầu tính lãi / đáo hạn / thời hạn vay
    ['int_period', 'principal_method', 'loan_rate'], ['link_ids'],   // loan_rate = «Cách tính lãi theo hợp đồng (%/năm)»
    ['rent_unit_price', 'rent_unit_l', 'rent_cycle_txt'], ['rent_promo_txt', 'rent_fees_txt'],   // 16/11/2026: HĐ thuê — chi tiết giá thuê theo chính sách cho thuê (chỉ xem)
    ['rent_house', 'rent_furn', 'rent', 'value', 'deposit', 'cn', 'vbtt_hold'], ['sale_price', 'plan_hdmb', 'prev_id', 'next_id']] },   // bán qua HĐ vay / HĐ thuê; HĐMB nối tiếp   // HĐ thuê: tiền thuê/tháng cạnh tổng tiền thuê; mua bán không có ô tiền thuê
  { t: 'Lần thanh toán', rows: [['new_schedule'], ['pay_method']] },
  { t: 'Tiến độ thu tiền HĐMB', rows: [['sale_on', 'sale_policy_txt'], ['sale_sched']] },   // tick «Có tiến độ thu tiền HĐMB» → sổ ra bảng   // HĐ thuê / vay bán căn (07/11/2026)
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
    <section class="bv-sec"><div class="fsec">Lần thanh toán</div><div class="row ht-pol" hidden style="margin:6px 0"><button type="button" class="btn sm" data-htpol>${ico('fa-wand-magic-sparkles')} Lấy tiến độ nội thất theo chính sách</button><span class="small muted ht-pol-l"></span></div><div class="fld wide"><div data-sched2></div></div></section>`;
  form.append(nav, mb, hp);
  $('[name=ht_number]', hp).placeholder = 'Để trống → tự cấp số'; $('[name=ht_value]', hp).readOnly = true;
  const rd = (k, t) => readField(form, { k, t }), val = () => Math.max(0, (rd('ht_finish', 'money') || 0) - (rd('ht_disc', 'money') || 0));
  const el = $('[data-sched2]', hp);
  schedEditor(el, v.sched, { total: val, first: () => rd('ht_on', 'date'), nt: true });
  const calc = () => { $('[name=ht_value]', hp).value = val() ? moneyStr(val()) : ''; el._redraw(); };
  let polRows = null;
  hp.addEventListener('click', e => { if (!e.target.closest('[data-htpol]') || !polRows) return; if (el._get().length && !el._pol && !confirm('Thay các đợt đang nhập bằng tiến độ nội thất của chính sách?')) return; el._set(polRows); el._pol = 1; if (!mk().checked) { mk().checked = true; nav.classList.add('ht-has'); } calc(); });
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
    rentMeta.innerHTML = rec0?.rent_terms ? cell('Chính sách cho thuê áp dụng', esc(rec0.rent_policy_txt || '')) + cell('Lần thanh toán', 'Theo chính sách — sửa ngày bắt đầu / thời hạn / tiền thuê rồi lưu là tự tính lại') + cell('Ngày đối chiếu', dmy(T)) : cell('Phân bổ thanh toán', over ? `<span class="neg">Số kỳ (${p}) nhiều hơn số tháng thuê (${n})</span>` : n > 0 && p > 0 ? (len.length > 1 ? `${len[0]}–${len[len.length - 1]} tháng/kỳ (chia đều theo tháng)` : `${len[0]} tháng/kỳ`) : '—') + cell('Hạn thanh toán', 'Ngày đầu mỗi kỳ') + cell('Ngày đối chiếu', dmy(T));
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
  lkBox.addEventListener('change', e => { if (!e.target.dataset.lk) return; const hid = $('[name=link_ids]', lkF); if (hid) { hid.value = $$('[data-lk]:checked', lkBox).map(x => x.dataset.lk).join(','); hid.dispatchEvent(new CustomEvent('linkchange', { bubbles: true, detail: { added: e.target.checked ? +e.target.dataset.lk : null } })); } loanDraw(); });   // 17/11/2026: báo cho mục Tiến độ thu tiền HĐMB (HĐ vay kế thừa từ HĐ thuê đi kèm)
  form.addEventListener('change', e => { if (['unit_id', 'customer_id'].includes(e.target.name)) linkDraw(); });
  // HĐ thuê: số tháng + tổng tiền tự tính khi gõ (máy chủ tính lại khi lưu, cùng công thức)
  const addMon = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); };
  const rentSched = () => {
    const el = $('[data-sched]', form); if (!el?._set) return;
    if (rec0?.rent_terms) return;   // 17/11/2026: HĐ theo chính sách cho thuê — Lần thanh toán do máy chủ lập theo chính sách (đổi ngày / thời hạn / tiền thuê thì lưu là tính lại)
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
    }).catch(() => {});   // HĐ vay: Giá bán căn hộ tính theo thành phần (svCalc)
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
    // 15/11/2026: căn không có nội thất (chính sách không khai giá trị hoàn thiện) — HĐ hoàn thiện chưa lưu thì bỏ tích, xóa số / đợt của căn chọn trước
    noFin() { if (locked || ht?.id) return; $('[name=ht_finish]', hp).value = ''; el._set([]); el._pol = 0; if (mk()) mk().checked = false; nav.classList.remove('ht-has'); calc(); },
    // 14/11/2026: tiến độ thu giá trị hoàn thiện (nội thất) của chính sách → Lần thanh toán của HĐ hoàn thiện (không vào HĐMB); đã tự nhập đợt thì giữ
    // nhớ tiến độ của chính sách (nút «Lấy tiến độ nội thất theo chính sách»); bảng đang trống / do chính sách điền thì điền luôn
    finSched(rows, lab) {
      if (locked || !rows?.length) return false;
      polRows = rows;   // 14/11/2026 Tâm: «tự động chạy từ chính sách, không phải ấn nút» — HĐ hoàn thiện chưa trình duyệt luôn theo tiến độ nội thất của chính sách
      if (ht?.id && !['du_thao', 'tu_choi'].includes(ht.status)) return false;
      el._set(rows); el._pol = 1; if (!mk().checked) { mk().checked = true; nav.classList.add('ht-has'); } calc(); return true;
    },
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
    for (const f of E.fields) if (rec[f.k] === undefined && f.uiDef !== undefined) rec[f.k] = f.uiDef;   // mặc định chỉ ở form mới (API / nhập file không tự điền)
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
  const fields = E.fields.filter(f => !skip.includes(f.k) && !f.noForm && !(f.ro && !id) && !(f.t === 'code' && !id && !f.manual) && !(f.t === 'json' && !f.pick && !['new_schedule', 'sale_sched', 'pay_sched', 'fin_sched', 'finish_vals'].includes(f.k) && !f.grid))
    .map(f => postSale && f.k === 'stage' ? { ...f, o: f.o.filter(o => !PROSPECT.has(o[0])) } : f);
  const wide = f => ['long', 'check', 'json'].includes(f.t) || !!f.pick || !!f.upload;
  const body = `${E.note ? `<div class="warnbar">${ico('fa-circle-info')}<span>${esc(E.note)}</span></div>` : ''}${ent === 'contract' ? noxhFailBar(rec) : ''}${lockKeep ? `<div class="lockbar">${ico('fa-lock')} Bản ghi đã chốt — chỉ sửa được: ${[...lockKeep].filter(k => { const f = E.fields.find(x => x.k === k), sh = d => isShown(E.fields.find(x => x.k === d) || {}, rec); return !f?.show || isShown(f, rec) || Object.keys(f.show).every(d => lockKeep.has(d) && sh(d)); }).map(k => k === 'new_schedule' ? 'Lần thanh toán' : E.fields.find(f => f.k === k)?.l).join(', ')}</div>` : ''}${perm?.softOpen ? `<div class="warnbar">${ico('fa-unlock')}<span>Hợp đồng đã trình duyệt: nhân viên đã bị khóa, chỉ sửa được Lần thanh toán. Quản lý vẫn sửa được toàn bộ.</span></div>` : ''}<div id="ferr"></div><form class="form" autocomplete="off">${fields.map(f => {
    const ro = f.ro || (f.t === 'code' && !f.manual) || (lockKeep && !lockKeep.has(f.k)) || (f.pii && id && !M.piiRoles.includes(M.me.role) && rec[f.k]);
    return `${f.sec ? `<div class="fsec">${esc(f.sec)}</div>` : ''}<div class="fld ${wide(f) ? 'wide' : ''}" data-f="${f.k}"><label for="f_${f.k}">${esc(f.l)}${f.req && !ro ? '<span class="req">*</span>' : ''}${f.pii ? ` <span class="tag" title="Dữ liệu cá nhân — chỉ người có quyền được xem">${ico('fa-shield-halved')} định danh</span>` : ''}${f.help ? ` <span class="hint" tabindex="0" role="note" data-tip="${esc(f.help)}" aria-label="Hướng dẫn: ${esc(f.help)}">${ico('fa-circle-info')}</span>` : ''}</label>${input(f, rec[f.k], rec, { ro })}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`;
  }).join('')}</form>`;
  const canSubmit = E.flow && !E.flow.custom && !E.flow.saveOnly && !E.direct && !id && E.flow.submit.includes(E.fields.find(f => f.k === E.flow.field)?.def);
  const m = modal({ title: title || (id ? `Sửa ${E.one} ${esc(rec.code || rec.number || '')}` : `${E.code ? `<span class="tag">${E.code}</span> ` : ''}Tạo ${E.one}`), wide: fields.length > 8 || fields.some(wide),
    body, foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="fSave">${ico('fa-floppy-disk')} ${id ? 'Lưu' : E.direct ? `Lưu ${E.one}` : E.flow?.saveOnly ? 'Lưu dự thảo' : 'Lưu nháp'}</button>${canSubmit ? `<button class="btn amb" id="fSub">${ico('fa-paper-plane')} Lưu và ${esc((E.flow.submitLabel || 'trình duyệt').toLowerCase())}</button>` : ''}` });
  const form = $('form', m.el); if (id) form.dataset.id = id;   // id bản ghi cho bảng chọn căn (thông báo bàn giao)
  $('.mf', m.el).insertAdjacentHTML('afterend', traceLine(trace));
  for (const ev of ['click', 'focusin']) form.addEventListener(ev, e => { const d = e.target.closest('.fld[data-f]'); if (d) traceField($('.trace', m.el), trace, d.dataset.f, E.fields.find(f => f.k === d.dataset.f)?.l || ''); });
  let htp = null;
  if (ent === 'handover_notice' || ent === 'gcn_notice') $('.modal', m.el).classList.add('full');
  if (ent === 'price_policy') $('.modal', m.el).classList.add('full');   // bảng tiến độ thu tiền rộng như Lần thanh toán HĐMB   // bảng căn bàn giao nhiều cột
  if (ent === 'contract') { bravoLayout(form, HD_LAYOUT); $('.modal', m.el).classList.add('full'); if (rec.kind !== 'hoan_thien') htp = hdPair(form, { ht: htRec, locked: htLocked, tab, draft: htDraft, oldFinish: +rec.finish_value > 0, kind: rec.kind, debt: rec._debt, rec0: rec }); }
  const sch = $('[data-sched]', form);
  { const ps = $('[data-psched]', form); if (ps) paySchedEditor(ps, rec.pay_sched || [], form, rec); }
  { const fs = $('[data-fsched]', form); if (fs) paySchedEditor(fs, rec.fin_sched || [], form, rec, { fin: true }); }
  if (sch) schedEditor(sch, rec.new_schedule || [], { nt: rec.kind === 'hoan_thien' || preset.kind === 'hoan_thien', finish: () => ent === 'contract' ? (form.elements.finish_value ? readField(form, E.fields.find(f => f.k === 'finish_value')) : rec.finish_value) || 0 : 0, bgBase: () => rec._bg_base, mdot: () => form._mdot ?? rec.maint_dot ?? 3, maint: () => ent === 'contract' && ['hdmb', 'thue_mua'].includes(form.elements.kind?.value ?? rec.kind) ? (form.elements.maint_fee ? readField(form, E.fields.find(f => f.k === 'maint_fee')) : rec.maint_fee) || 0 : null, total: () => ent === 'contract' ? (form.elements.value ? readField(form, E.fields.find(f => f.k === 'value')) : rec.value) || 0 : readField(form, E.fields.find(f => f.k === 'value_after')) || rec.value_before || 0, first: ent === 'contract' ? () => { const kd = $('[name=kind]', form)?.value ?? rec.kind; const fk = kd === 'thue' ? 'eff_on' : kd === 'vay' && form.elements.loan_recv_on?.value ? 'loan_recv_on' : 'contract_on'; return form.elements[fk] ? readField(form, E.fields.find(f => f.k === fk)) : rec[fk]; } : null });
  // 17/11/2026: HĐ vay / thuê bán căn — Giá trị HĐMB = Giá trị căn hộ + Phí bảo trì − Tiền giảm giá; Giá bán căn hộ = Giá trị HĐMB + Giá trị hoàn thiện (tính lại ngay khi sửa);
  // chọn / đổi căn → thành phần theo chính sách bán đang áp dụng cho căn
  if (ent === 'contract' && form.elements.sale_unit_val) {
    const mv = k => +(readField(form, { k, t: 'money' }) || 0), sv = (k, v) => { const el = form.elements[k]; if (el) el.value = v == null ? '' : moneyStr(v); };
    const svCalc = () => { if (!form.elements.sale_unit_val.value.trim() && !form.elements.sale_maint?.value.trim()) return; const t = Math.max(0, mv('sale_unit_val') + mv('sale_maint') - mv('discount'));
      sv('unit_total', t); sv('sale_price', t + mv('sale_finish')); form.elements.unit_total?.dispatchEvent(new Event('change', { bubbles: true })); };
    const svLoad = async () => { const u = form.elements.unit_id?.value; if (!u) return; const d = await api('GET', `/api/sale-values/${u}`).catch(() => null); if (!d) return;
      sv('sale_unit_val', d.sale_unit_val); sv('sale_maint', d.sale_maint); sv('sale_finish', d.sale_finish); svCalc(); };
    form.addEventListener('input', e => { if (['sale_unit_val', 'sale_maint', 'sale_finish', 'discount'].includes(e.target.name)) svCalc(); });
    form.addEventListener('change', e => { if (e.target.name === 'unit_id' || (e.target.name === 'nature' && e.target.value === 'ban' && !form.elements.sale_unit_val.value.trim())) svLoad(); });
    if (!id && form.elements.unit_id?.value && !form.elements.sale_unit_val.value.trim()) svLoad();
  }
  const ssch = $('[data-ssched]', form);   // tiến độ thu tiền HĐMB của HĐ thuê / vay bán căn: % theo Giá trị HĐMB
  if (ssch) {   // 16/11/2026: như «Lần thanh toán» HĐMB — chọn đợt gợi ý nội dung, hạn theo ngày ký HĐ, dòng phí bảo trì (theo căn), cột đợt bàn giao
    let sm = null, ut = null;
    const getM = async () => { const u = form.elements.unit_id?.value || rec.unit_id, row = u ? (await api('GET', `/api/e/unit/${u}`)).row : null; sm = +(row?.maint_fee || 0); ut = row?.price_net != null ? +row.price_net + (+row.maint_fee || 0) : row?.total_price != null ? +row.total_price - (+row.finish_value || 0) : null; /* 17/11/2026: Giá trị HĐMB không gồm hoàn thiện */ utFill(); ssch._redraw?.(); };
    // 16/11/2026: bật «Có tiến độ thu tiền HĐMB» mà Giá trị HĐMB còn trống (HĐ thuê thuần không mang giá bán) → điền theo Tổng giá căn hộ − tiền giảm giá
    const utFill = () => { const on = form.elements.sale_on ? form.elements.sale_on.checked : rec.sale_on, el = form.elements.unit_total;
      if (on && el && !el.value.trim() && ut > 0) { el.value = fm(ut - (+readField(form, { k: 'discount', t: 'money' }) || 0)); ssch._redraw?.(); } };
    // 16/11/2026: nút «Lấy tiến độ theo chính sách» nằm cùng hàng với các nút mẫu và «Ngày gốc», phía trên bảng (không tách sang cột trái)
    const bar = document.createElement('div'); bar.className = 'ss-pol'; bar.hidden = true;
    bar.innerHTML = `<button type="button" class="btn sm">${ico('fa-wand-magic-sparkles')} Lấy tiến độ theo chính sách</button><span class="small muted"></span>`;
    schedEditor(ssch, rec.sale_sched || [], { total: () => { const v = readField(form, E.fields.find(f => f.k === 'unit_total')); return v === undefined ? +rec.unit_total || 0 : +v || 0; },
      maint: () => sm ?? 0, mdot: () => 3, bgBase: () => rec._bg_base, tools: bar,
      first: () => form.elements.contract_on ? readField(form, E.fields.find(f => f.k === 'contract_on')) : rec.contract_on });
    getM().catch(() => {});
    form.addEventListener('change', e => { if (e.target.name === 'unit_id') getM().catch(() => {}); else if (['contract_on', 'unit_total', 'discount'].includes(e.target.name)) ssch._redraw?.(); });
    form.addEventListener('input', e => { if (e.target.name === 'contract_on') ssch._redraw?.(); });
    // 14/11/2026: HĐ thuê / vay bán căn — tiến độ thu tiền HĐMB sổ theo tiến độ của chính sách BÁN đã ban hành áp cho căn (bảng trống thì tự điền; nút để lấy lại).
    // 16/11/2026: máy chủ trả sẵn các đợt (hạn theo ngày ký, đợt bàn giao / Giấy chứng nhận theo thông báo đã phát hành, phí bảo trì); không có chính sách → cảnh báo, không dùng mẫu mặc định
    let sp = null, auto = false;
    const polBox = () => $('[data-f="sale_policy_txt"] .ro', form);
    const ssFill = (force) => {
      if (!sp?.rows?.length || (id && !['du_thao', 'tu_choi'].includes(rec.status))) return;
      if (!force && ssch._get().some(x => !x.maint)) return;   // đã có đợt (đã lưu / đang nhập): giữ nguyên — muốn lấy lại thì bấm nút
      ssch._set(sp.rows); auto = true; if (polBox()) polBox().textContent = sp.policy; toast(`Tiến độ thu tiền HĐMB lấy theo chính sách bán hàng ${sp.policy}`);
    };
    const ssLoad = async () => {
      const u = form.elements.unit_id?.value || rec.unit_id, k = form.elements.kind?.value ?? rec.kind, span = $('span', bar), btn = $('button', bar); sp = null;
      if (!u || !['thue', 'vay'].includes(k)) { span.textContent = ''; return; }
      const on0 = form.elements.contract_on ? readField(form, E.fields.find(f => f.k === 'contract_on')) : rec.contract_on;
      const d = await api('GET', `/api/sale-sched/${u}?on=${on0 || ''}&res=${form.elements.reservation_id?.value || rec.reservation_id || ''}`);
      btn.disabled = !d.rows?.length; span.classList.toggle('neg', !d.rows?.length);
      if (!d.rows?.length) { span.textContent = 'Chưa có chính sách bán hàng đã ban hành có tiến độ thu tiền cho căn — không tự dùng mẫu mặc định'; return; }
      sp = d; span.textContent = `Chính sách bán hàng ${d.policy}: ${d.rows.filter(x => !x.maint).length} đợt`;
      const on = form.elements.sale_on ? form.elements.sale_on.checked : rec.sale_on; if (on) ssFill(false);
    };
    $('button', bar).onclick = () => { if (ssch._get().some(x => !x.maint) && !auto && !confirm('Thay các đợt đang nhập bằng tiến độ của chính sách?')) return; ssFill(true); };
    form.addEventListener('change', e => { if (['unit_id', 'kind'].includes(e.target.name)) ssLoad().catch(() => {}); else if (e.target.name === 'sale_on' && e.target.checked) { utFill(); ssFill(false); } });
    // 17/11/2026: HĐ vay — tick «HĐ thuê đi kèm» cùng căn → kế thừa ngay tiến độ thu tiền HĐMB đang lưu trong HĐ thuê (đợt, nội dung, ngày đến hạn, %, số tiền, phí bảo trì,
    // đợt bàn giao / Giấy chứng nhận) + Giá trị HĐMB, tự bật «Có tiến độ thu tiền HĐMB»; HĐ thuê chưa có tiến độ HĐMB → theo chính sách bán; không có chính sách → cảnh báo
    form.addEventListener('linkchange', async e => {
      const lid = e.detail?.added; if (!lid || (form.elements.kind?.value ?? rec.kind) !== 'vay' || (id && !['du_thao', 'tu_choi'].includes(rec.status))) return;
      let t; try { t = (await api('GET', `/api/e/contract/${lid}`)).row; } catch (er) { return toast(er.message, true); }
      if (t?.kind !== 'thue' || String(t.unit_id) !== String(form.elements.unit_id?.value || rec.unit_id)) return;
      const so = form.elements.sale_on, tick = () => { if (so && !so.checked) { so.checked = true; so.dispatchEvent(new Event('change', { bubbles: true })); } };
      if (t.sale_on && t.sale_sched?.length) {
        if (ssch._get().some(x => !x.maint) && !auto && !confirm(`Thay các đợt đang nhập bằng tiến độ thu tiền HĐMB của HĐ thuê ${t.number}?`)) return;
        const ut = form.elements.unit_total; if (ut && +t.unit_total > 0) ut.value = fm(+t.unit_total);
        ssch._set(t.sale_sched.map(x => ({ ...(x.pct != null && x.pct !== '' && !x.maint ? { ...x, amount: null } : x), _keep: true })));   // _keep: giữ đúng ngày đến hạn của HĐ thuê
        auto = true; tick();
        const src = `Theo HĐ thuê đi kèm ${t.number}${t.sale_policy_txt ? ' · ' + t.sale_policy_txt : ''}`;
        if (polBox()) polBox().textContent = src; const sp0 = $('span', bar); if (sp0) { sp0.classList.remove('neg'); sp0.textContent = `${src}: ${t.sale_sched.filter(x => !x.maint).length} đợt`; }
        toast(`Tiến độ thu tiền HĐMB lấy theo HĐ thuê đi kèm ${t.number}: ${t.sale_sched.filter(x => !x.maint).length} đợt`);
      } else {
        tick();
        if (sp?.rows?.length) { ssFill(false); toast(`HĐ thuê ${t.number} chưa có tiến độ thu tiền HĐMB — lấy theo chính sách bán hàng ${sp.policy}`); }
        else toast(`HĐ thuê ${t.number} chưa có tiến độ thu tiền HĐMB và căn chưa có chính sách bán hàng đã ban hành — bổ sung chính sách bán hàng hoặc nhập tiến độ`, true);
      }
    });
    ssLoad().catch(() => {});
  }
  htp?.rentDraw(); htp?.loanDraw?.();
  if (ent === 'template') tplHelper(form, m);
  const vis = () => { const cur = collect(true); for (const f of fields) { const box = $(`[data-f="${f.k}"]`, form); if (box) box.classList.toggle('hidden', !isShown(f, cur)); } $$('.bv-row, .bv-sec:not(.loan-sec)', form).forEach(x => x.classList.toggle('hidden', !$('.fld:not(.hidden)', x)));
    $$(':scope > .fsec', form).forEach(s => { let n = s.nextElementSibling, any = false; while (n && !n.classList.contains('fsec')) { if (n.classList.contains('fld') && !n.classList.contains('hidden')) { any = true; break; } n = n.nextElementSibling; } s.classList.toggle('hidden', !any); });   /* 17/11/2026: tiêu đề nhóm ẩn khi cả nhóm ô ẩn */ htp?.sync(cur.ptype !== 'lien_ke' && ['hdmb', 'thue_mua', 'thue', 'vay'].includes(cur.kind)); };
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
  // 15/11/2026: tự lưu nháp — đã gõ / chọn gì mà đóng form không lưu (Esc, bấm ra ngoài, X, Hủy) thì giữ bản nháp trên máy này 7 ngày;
  // mở lại đúng form đó (cùng bản ghi / cùng loại tạo mới) → thanh «Khôi phục / Bỏ nháp». Lưu thành công thì xóa nháp
  {
    const dKey = `ctg-kd-nhap:${ent}:${id || 'moi:' + (preset.kind || rec.kind || '')}`;
    const lsGet = () => { try { const d = JSON.parse(localStorage.getItem(dKey) || 'null'); return d && Date.now() - d.at < 7 * 864e5 ? d : null; } catch { return null; } };
    const lsDel = () => { try { localStorage.removeItem(dKey); } catch {} };
    let touched = false;
    for (const ev of ['input', 'change']) form.addEventListener(ev, e => { if (e.isTrusted) touched = true; }, true);
    const snapD = () => {
      const v = {}, lab = {}, js = {};
      for (const el of form.elements) { if (!el.name || el.type === 'file' || el.type === 'button' || el.type === 'submit') continue; v[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'radio' ? (el.checked ? el.value : v[el.name]) : el.value; }
      $$('.combo:not([data-multi])', form).forEach(c => { const h = $('input[type=hidden]', c), t = $('[data-combo],input[type=text]', c); if (h?.name && t) lab[h.name] = t.value; });
      for (const f of fields.filter(f => f.t === 'json')) { const el = $(`[name="${f.k}"]`, form); if (el?._get && !(el instanceof HTMLInputElement)) { try { js[f.k] = el._get(); } catch {} } }
      return { at: Date.now(), v, lab, js };
    };
    m.el._beforeClose = () => { if (!touched) return; try { localStorage.setItem(dKey, JSON.stringify(snapD())); toast('Đã lưu nháp trên máy này — mở lại form này để khôi phục'); } catch {} };
    form._clearDraft = lsDel;
    const d0 = lsGet();
    if (d0) {
      const bar = document.createElement('div'); bar.className = 'warnbar draft-bar';
      const t = new Date(d0.at), hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} ${dmy(new Date(d0.at - t.getTimezoneOffset() * 6e4).toISOString())}`;
      bar.innerHTML = `${ico('fa-floppy-disk')}<span>Có bản nháp chưa lưu lúc <b>${hm}</b> (form bị đóng khi đang nhập).</span><button type="button" class="btn sm pri" data-dr>Khôi phục</button><button type="button" class="btn sm ghost" data-dd>Bỏ nháp</button>`;
      form.prepend(bar);
      $('[data-dd]', bar).onclick = () => { lsDel(); bar.remove(); };
      $('[data-dr]', bar).onclick = () => {
        for (const el of form.elements) {
          if (!el.name || !(el.name in d0.v) || el.type === 'file') continue; const x = d0.v[el.name];
          if (el.type === 'checkbox') el.checked = !!x; else if (el.type === 'radio') el.checked = el.value === x; else if (!el.disabled && !el.readOnly || el.type === 'hidden') el.value = x ?? '';
        }
        $$('.combo:not([data-multi])', form).forEach(c => { const h = $('input[type=hidden]', c), t = $('[data-combo],input[type=text]', c); if (h?.name && t && h.name in d0.lab) t.value = d0.lab[h.name]; });
        for (const [k, x] of Object.entries(d0.js || {})) { const el = $(`[name="${k}"]`, form); if (el?._set && Array.isArray(x)) { try { el._set(x); } catch {} } }
        try { vis(); } catch {}
        touched = true; bar.remove(); toast('Đã khôi phục bản nháp — kiểm tra lại rồi bấm Lưu');
      };
    }
  }
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
      const dl = form.elements.deal?.value === 'thue' || form.elements.reg_kind?.value === 'thue' ? 'thue' : 'ban';
      const sc = await api('GET', `/api/sale-check/${v}?deal=${dl}`).catch(() => null);
      if (n === seq && sc && !sc.ok) box.innerHTML = `<div class="warnbar mt">${ico('fa-triangle-exclamation')}<div><b>Cảnh báo ${dl === 'thue' ? 'cho thuê' : 'mở bán'}:</b> ${esc(sc.text.slice(2))}</div></div>`;
    };
    form.addEventListener('change', e => { if (['unit_id', 'deal', 'reg_kind'].includes(e.target.name)) check(); });
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
    const el = form.elements[f.k], wrap = el && el.closest('.sugc'); if (!el || !wrap) continue;
    let opts = [], box = null, cur = -1;
    const code = o => String(o.label || '').split(' · ')[0];
    const close = () => { if (box) box.remove(); box = null; };
    const pick = o => { el.value = code(o); close(); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const load = debounce(async () => {
      try { opts = await api('GET', `/api/opts/${f.sugRef}?` + new URLSearchParams(el.value.trim() ? { q: el.value.trim() } : {})); } catch { opts = []; }
      if (document.activeElement !== el) return;
      close(); box = document.createElement('div'); box.className = 'opts'; cur = -1;
      box.innerHTML = opts.length ? opts.map((o, i) => `<div data-i="${i}"><span>${esc(o.label)}</span><small>${esc(o.sub || '')}</small></div>`).join('') : '<div class="muted">Không tìm thấy — để mã mới, hệ thống tự cấp / tự khớp</div>';
      box.onmousedown = e => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); pick(opts[+d.dataset.i]); } };
      wrap.append(box);
    }, 200);
    el.addEventListener('focus', load); el.addEventListener('input', load);
    el.addEventListener('blur', () => setTimeout(close, 150));
    el.addEventListener('keydown', e => {
      if (!box) return; const ds = $$('[data-i]', box);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, Math.min(ds.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1))); ds.forEach((d, i) => d.classList.toggle('on', i === cur)); ds[cur]?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && cur >= 0) { e.preventDefault(); pick(opts[cur]); }
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    $('.x', wrap).onclick = () => { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); el.focus(); };
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
        if (htp && !(fv > 0)) htp.noFin();
        if (htp && fv > 0 && form.elements.ptype.value !== 'lien_ke') { htp.finish(fv); form.elements.finish_value.value = ''; const tv = readField(form, fields.find(x => x.k === 'value')); if (tv > fv) form.elements.value.value = moneyStr(tv - fv); }
        contractCalc();
        const kd = form.elements.kind?.value, svOn = ['vay', 'thue'].includes(kd) && form.elements.sale_unit_val && (form.elements.nature?.value || (kd === 'vay' ? 'ban' : '')) === 'ban';   // 17/11/2026: bán căn — Giá trị HĐMB / Giá bán căn hộ theo thành phần (svCalc)
        if (!svOn) form._ut0?.(src.total_price != null ? +src.total_price : src.price_net != null ? +src.price_net + (+src.maint_fee || 0) + (+src.finish_value || 0) : null);   // HĐ thuê: giá trị căn hộ theo danh mục − giảm giá (thông tin)
        if (['vay', 'thue'].includes(kd) && form.elements.sale_price) { if (!svOn) form.elements.sale_price.value = form.elements.value.value; if (kd === 'vay') form.elements.value.value = ''; }
        htp?.rentValue();
      }
      if (ent === 'reservation' && f.ref === 'unit' && form.elements.unit_value) {   // giá trị căn hộ = sau thuế + bảo trì; hoàn thiện theo chính sách được duyệt gần nhất (không có thì theo căn)
        const uv = src.price_net != null ? +src.price_net + (+src.maint_fee || 0) : src.total_price != null ? +src.total_price - (+src.finish_value || 0) : null;
        form.elements.unit_value.value = moneyStr(uv); form.elements.finish_value.value = moneyStr(src.finish_value); sumRes();
        await resPol(src.id);
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
  // tiến độ nội thất của chính sách → tab Hoàn thiện căn hộ (chung cư; liền kề gộp hoàn thiện vào HĐMB) — 14/11/2026
  const htFin = d => {
    if (!htp || form.elements.ptype?.value === 'lien_ke' || !d?.fin_sched?.length || !(+d.finish_value > 0)) return;   // căn không có nội thất (chính sách không khai giá trị hoàn thiện) → không lập HĐ hoàn thiện (15/11/2026)
    if ((form.elements.kind?.value ?? rec.kind) === 'thue' && (form.elements.nature?.value ?? rec.nature) !== 'ban') return;   // 16/11/2026: HĐ thuê thuần — không điền tiến độ nội thất của chính sách bán
    const has = x => x.days != null && x.days !== '';
    if (htp.finSched(d.fin_sched.map(x => ({ name: x.name, pct: x.pct, amount: null, due_on: '', ...(has(x) && +x.days ? { _days: +x.days } : { _d0: true }) })), d.fin_policy)) toast(`Tiến độ nội thất điền ở tab Hoàn thiện căn hộ theo chính sách ${d.fin_policy}`);
  };
  if (ent === 'contract' && htp && id && rec.unit_id && !htLocked) api('GET', `/api/contract-prefill/${rec.unit_id}`).then(d => { if (+d.finish_value > 0 && form.elements.ptype?.value !== 'lien_ke') htp.finish(d.finish_value); htFin(d); }).catch(() => {});   // + giá trị hoàn thiện theo chính sách nếu tab còn trống (15/11/2026)   // HĐ đã lưu: nút lấy tiến độ nội thất / điền nếu tab trống
  // 15/11/2026: chọn khách / căn, tích «Đồng sở hữu là vợ / chồng» → ô trống lấy theo HĐ trước của khách (hộ khẩu, đồng sở hữu, VBTT);
  // có tích thì đồng sở hữu = vợ / chồng ở hồ sơ NOXH (sửa ở đây → lưu sẽ ghi sang NOXH)
  if (ent === 'contract' && form.elements.co_owner_vc) {
    const buyerFill = async (force) => {
      const k = form.elements.customer_id?.value || rec.customer_id; if (!k) return;
      const d = await api('GET', `/api/contract-buyer/${k}?unit=${form.elements.unit_id?.value || rec.unit_id || ''}&id=${id || ''}`);
      const put = (n, v) => { const el = form.elements[n], f = E.fields.find(x => x.k === n); if (!el || !f || v == null || v === '') return; if (f.t === 'bool') { if (!id) el.checked = !!v; return; } el.value = f.t === 'date' ? dmy(v) : v; };
      for (const [n, v] of Object.entries(d.carry || {})) if (n === 'co_owner_vc' ? !id : !form.elements[n]?.value) put(n, v);
      if (form.elements.co_owner_vc.checked && d.spouse && (force || !form.elements.co_owner.value)) for (const [n, v] of Object.entries(d.spouse)) { const el = form.elements[n]; if (el) el.value = v == null ? '' : E.fields.find(x => x.k === n)?.t === 'date' ? dmy(v) : v; }
    };
    form.addEventListener('change', e => { if (['customer_id', 'unit_id'].includes(e.target.name)) buyerFill(false).catch(() => {}); else if (e.target.name === 'co_owner_vc' && e.target.checked) buyerFill(true).catch(() => {}); });
    if (!id && (form.elements.customer_id?.value || rec.customer_id)) buyerFill(false).catch(() => {});
  }
  const contractPrefill = async unit => {
    const d = await api('GET', `/api/contract-prefill/${unit}`);
    if ((form.elements.kind?.value ?? rec.kind) !== 'hdmb') pickRef('customer_id', d.customer_id, d.customer_label);   // HĐMB (15/11/2026): không tự điền khách — chọn ở ô Mã khách hàng (khách gắn với căn + tình trạng hồ sơ)
    if (d.request_on && form.elements.request_on && !form.elements.request_on.value) form.elements.request_on.value = dmy(d.request_on);
    if (form.elements.finish_value) form.elements.finish_value.value = +d.finish_value > 0 ? moneyStr(d.finish_value) : '';   // hoàn thiện (nội thất) chỉ theo chính sách — căn không khai = không có nội thất
    const o = form.elements.owner_id; if (d.owner_id && o?.tagName === 'SELECT' && [...o.options].some(x => x.value === String(d.owner_id))) o.value = d.owner_id;
    // chính sách bán hàng có khai tiến độ thu tiền (16/11/2026): Lần thanh toán điền theo chính sách — hạn = ngày ký HĐMB + số ngày; đã tự nhập các đợt thì giữ
    const sc = $('[data-sched]', form);
    if (d.pay_sched?.length && sc?._set && ['hdmb', 'thue_mua'].includes(form.elements.kind?.value ?? rec.kind) && (form._polSched || !sc._get().some(x => !x.maint))) {
      const ns = d.pay_sched.filter(x => !x.maint), m = d.pay_sched.find(x => x.maint), has = x => x.days != null && x.days !== '';
      const mk = m && has(m) ? ns.findIndex(x => has(x) && +x.days === +m.days) : -1;
      form._mdot = mk >= 0 ? mk + 1 : d.pay_mdot; form._polSched = 1;
      const fr = (d.fin_sched || []).map(x => ({ name: x.name, pct: x.pct, amount: null, due_on: '', fin: true, ...(has(x) && +x.days ? { _days: +x.days } : { _d0: true }) }));   // đợt thu hoàn thiện — căn không có hoàn thiện thì máy chủ bỏ
      const htOn = htp && form.elements.ptype?.value !== 'lien_ke';   // chung cư: hoàn thiện (nội thất) là HĐ hoàn thiện riêng → đợt hoàn thiện sang tab Hoàn thiện căn hộ
      sc._set([...ns.map(x => ({ name: x.name, pct: x.pct, amount: null, due_on: '', ...(has(x) && +x.days ? { _days: +x.days } : {}), ...(x.bg ? { bg: true, bg_days: x.bg_days ?? null } : {}) })), ...(!htOn && (d.finish_value > 0 || +readField(form, E.fields.find(f => f.k === 'finish_value')) > 0) ? fr : []), ...(m ? [{ name: m.name, maint: true }] : [])]);
      toast(`Lần thanh toán điền theo tiến độ của chính sách ${d.sched_policy}`);
    }
    htFin(d);
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
      if (e.target.name === 'discount' && ut0 != null && !form.elements.sale_unit_val?.value.trim()) form.elements.unit_total.value = moneyStr(ut0 - (+rdn('discount') || 0));
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
    const clr = k => { const el = form.elements[k]; if (el) el.value = ''; };
    const liqKind = () => ent === 'payment' && ['thanh_ly', 'hoan_tien'].includes(form.elements.kind?.value);
    // 17/11/2026: chọn / đổi mã căn → bỏ hợp đồng (đợt, phiếu thanh lý) đang chọn, mở danh sách hợp đồng của căn để người dùng chọn — không tự điền 1 hợp đồng bất kỳ
    form.addEventListener('change', async e => {
      if (e.target.name !== 'unit_id' || e._init) return;
      setRef('contract_id', null, ''); setRef(inst, null, ''); setRef('cancel_req_id', null, ''); ['cust_code', 'cust_name', 'project_name', 'ct_kind'].forEach(clr);
      if (!e.target.value) return;
      try {
        const d = await api('GET', '/api/voucher-prefill?' + new URLSearchParams({ unit_id: e.target.value }));
        if (!d.n) return toast('Căn chưa có hợp đồng (trừ HĐ đã hủy)', true);
        toast(`Căn ${d.unit_label} có ${d.n} hợp đồng — chọn hợp đồng trong danh sách ô «Mã hợp đồng»`);
        const t = form.elements.contract_id?.closest('.combo')?.querySelector('[data-combo]'); if (t) setTimeout(() => { t.focus(); t.dispatchEvent(new Event('focus')); }, 50);   // mở danh sách hợp đồng của căn
      } catch (er) { toast(er.message, true); }
    });
    // phiếu chi: đổi nhóm chi sang hoàn tiền thanh lý → gợi ý phiếu thanh lý của hợp đồng đang chọn
    if (ent === 'payment') form.addEventListener('change', async e => {
      if (e.target.name !== 'kind' || !liqKind() || !form.elements.contract_id.value || form.elements.cancel_req_id?.value) return;
      try { const d = await api('GET', '/api/voucher-prefill?' + new URLSearchParams({ contract_id: form.elements.contract_id.value })); if (d.slip_id) { setRef('cancel_req_id', d.slip_id, d.slip_label); if (empty('amount') && d.slip_rem > 0) form.elements.amount.value = moneyStr(d.slip_rem); } } catch (er) { toast(er.message, true); }
    });
    form.addEventListener('change', async e => {
      const k = e.target.name; if (!['contract_id', 'cancel_req_id', inst].includes(k) || !e.target.value) return;
      try {
        const q = new URLSearchParams({ [k]: e.target.value }); if ((k === inst || k === 'cancel_req_id') && form.elements.contract_id.value) q.set('contract_id', form.elements.contract_id.value);
        const d = await api('GET', '/api/voucher-prefill?' + q);
        if (k !== inst) {
          const ctChanged = k === 'cancel_req_id' && String(d.contract_id) !== String(form.elements.contract_id.value);
          if (k === 'cancel_req_id') setRef('contract_id', d.contract_id, d.contract_label);   // phiếu thanh lý (chung) → hợp đồng của phiếu
          setRef('unit_id', d.unit_id, d.unit_label);
          set('cust_code', d.cust_code); set('cust_name', d.cust_name); set('project_name', d.project_name); set('ct_kind', d.ct_kind);
          if (ent === 'receipt') set('grp', d.grp);
          if (ent === 'payment' && empty('receiver')) set('receiver', d.cust_name);
          if (!e._init && (k === 'contract_id' || ctChanged)) setRef(inst, null, '');   // đổi hợp đồng: bỏ đợt của hợp đồng cũ
          if (ent === 'payment') {   // HĐ đã thanh lý / thuộc phiếu thanh lý: nhóm chi hoàn tiền thanh lý + phiếu thanh lý + số còn phải trả
            if (k === 'contract_id' && d.status === 'thanh_ly' && !form.elements.kind.value) { form.elements.kind.value = 'thanh_ly'; form.elements.kind.dispatchEvent(new Event('change', { bubbles: true })); }
            if (k === 'contract_id') setRef('cancel_req_id', liqKind() && d.slip_id ? d.slip_id : null, d.slip_label || '');
            if (liqKind() && d.slip_id) { if (empty('amount') && d.slip_rem > 0) form.elements.amount.value = moneyStr(d.slip_rem); if (empty('content')) set('content', `Chi trả hoàn tiền thanh lý theo phiếu ${d.slip_code}`); }
          }
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
  // 16/11/2026: phiếu hủy / thanh lý — Ngày dự kiến chi trả = Ngày thanh lý + Số ngày chi trả tiền, tính lại ngay khi đổi 1 trong 2 ô (máy chủ cũng tính khi lưu)
  if (ent === 'cancel_req') {
    const payDue = () => { const lo = parseDmy(form.elements.liquidate_on?.value || ''), w = String(form.elements.wait_days?.value ?? '').replace(/\D/g, ''); if (!lo || !form.elements.pay_due) return; form.elements.pay_due.value = dmy(addDays(lo, w === '' ? 0 : +w)); };
    for (const ev of ['input', 'change']) form.addEventListener(ev, e => { if (['wait_days', 'liquidate_on'].includes(e.target.name)) payDue(); });
  }
  // HĐMB (15/11/2026): chọn khách chưa có hồ sơ NOXH đủ điều kiện tại căn → báo ngay (vẫn lưu dự thảo; máy chủ chặn gửi trình duyệt / duyệt)
  if (ent === 'contract') form.addEventListener('change', async e => {
    if (e.target.name !== 'customer_id' || !e.target.value || (form.elements.kind?.value ?? rec.kind) !== 'hdmb' || !form.elements.unit_id?.value) return;
    try { const it = (await api('GET', `/api/opts/customer?unit=${form.elements.unit_id.value}`)).find(x => x.id === +e.target.value);
      if (it && !it.ok) toast(`Khách hàng ${it.label} chưa được Sở Xây dựng xét duyệt đủ điều kiện mua nhà ở xã hội tại căn này (${it.sub.replace(/^[✓✗]\s*/, '')}) — vẫn lưu dự thảo được, nhưng chưa gửi trình duyệt hợp đồng được`, true); } catch { }
  });
  // phiếu đăng ký (14/11/2026): chọn căn / đổi nguồn bán / đại lý → chính sách được duyệt gần nhất cho căn + người bán, giá trị hoàn thiện theo danh sách của chính sách
  const resPol = async uid => {
    uid = uid || form.elements.unit_id?.value; if (!uid) return;
    if (form.elements.deal?.value === 'thue') {   // 17/11/2026: đăng ký thuê — chính sách cho thuê được duyệt gần nhất cho căn + người bán, tiền thuê/tháng, thời hạn
      const d = await api('GET', '/api/res-policy?' + new URLSearchParams({ unit: uid, deal: 'thue', source: form.elements.source?.value || '', agent: form.elements.agent_id?.value || '' }));
      if (d.rent && form.elements.rent) form.elements.rent.value = moneyStr(d.rent);
      if (d.term_months && form.elements.term_months) form.elements.term_months.value = d.term_months;
      const h = form.elements.policy_id; if (h) { h.value = d.policy?.id ?? ''; const t = h.parentElement.querySelector('input[type=text]'); if (t) t.value = d.policy?.label || 'Chưa có chính sách cho thuê được duyệt cho căn này'; const w = h.parentElement.querySelector('.pol-wait'); if (w) w.innerHTML = ''; }
      return;
    }
    if (!form.elements.unit_value) return;
    const d = await api('GET', '/api/res-policy?' + new URLSearchParams({ unit: uid, source: form.elements.source?.value || '', agent: form.elements.agent_id?.value || '' }));
    if (d.unit_value != null) form.elements.unit_value.value = moneyStr(d.unit_value);
    if (form.elements.finish_value) form.elements.finish_value.value = d.finish_value != null ? moneyStr(d.finish_value) : '';
    const h = form.elements.policy_id; if (h) { h.value = d.policy?.id ?? ''; const t = h.parentElement.querySelector('input[type=text]'); if (t) t.value = d.policy?.label || 'Không có chính sách được duyệt cho căn này';
      let w = h.parentElement.querySelector('.pol-wait'); if (!w) { w = document.createElement('div'); w.className = 'small pol-wait'; w.style.cssText = 'color:var(--amber-d, #a15c00);margin-top:4px'; h.parentElement.append(w); }
      w.innerHTML = d.wait?.length ? `${ico('fa-hourglass-half')} ${esc(d.wait.join(', '))} đang chờ duyệt — duyệt xong phiếu tự đổi sang chính sách này` : ''; }
    sumRes();
  };
  if (ent === 'reservation') form.addEventListener('change', e => { if (['source', 'agent_id', 'deal'].includes(e.target.name)) resPol().catch(er => toast(er.message, true)); });
  // mở form đã có căn (tạo từ Bảng hàng / sửa phiếu còn hiệu lực) → lấy ngay chính sách được duyệt gần nhất (máy chủ cũng tự cập nhật khi lưu)
  if (ent === 'reservation' && form.elements.unit_id?.value && (!id || ['nhap', 'cho_duyet', 'giu_cho', 'qua_han', 'da_coc'].includes(rec.status))) resPol().catch(er => toast(er.message, true));
  // căn hộ: sửa đơn giá nền / diện tích / % thuế / giá trị hoàn thiện → tự tính lại giá theo công thức Danh mục sản phẩm (máy chủ tính lại khi lưu)
  if (ent === 'unit') form.addEventListener('input', e => {
    if (!['base_price', 'area_tt', 'vat_pct', 'finish_value'].includes(e.target.name)) return;
    const rd = k => readField(form, fields.find(f => f.k === k) || {}), base = +rd('base_price'), area = +rd('area_tt');
    if (!(base > 0 && area > 0)) return;
    const r3 = v => Math.round(v / 1000) * 1000, F = base * area, H = F * (rd('vat_pct') ?? 5) / 100, I = r3(F + H), J = r3(F * 0.02);
    const out = { pretax: Math.round(F), tax_amt: Math.round(H), price_net: I, maint_fee: J, total_price: I + J + (+rd('finish_value') || 0) };
    for (const [k, v] of Object.entries(out)) if (form.elements[k]) form.elements[k].value = moneyStr(v);
  });
  $$('[data-pick-units]', form).forEach(el => unitPicker(el, form, ent === 'price_policy' ? { policy: true, self: id || 0 } : {}).catch(e => toast(e.message, true)));
  $$('[data-pick-fin]', form).forEach(el => finishPicker(el, form, { self: id || 0 }));
  $$('[data-pick-liq]', form).forEach(el => liqPicker(el, form, { self: id || 0 }));   // phiếu thanh lý chung (16/11/2026)
  if (ent === 'price_policy') policyTabs(form);
  $$('[data-pick-bg]', form).forEach(el => bgPicker(el, form).catch(e => toast(e.message, true)));
  if (ckF && !id) { fillCheck(); form.addEventListener('change', e => { if (e.target.name === ckF.srcBy || e.target.name === 'reg_kind') fillCheck(); }); }
  vis();
  const errBox = $('#ferr', m.el);
  const showErr = (e) => { errBox.innerHTML = `<div class="errbar">${ico('fa-triangle-exclamation')} ${esc(e.message)}</div>`; $$('.fld.err', form).forEach(x => x.classList.remove('err')); let ef = e.fields || [];
    if (!ef.length && e.message) {   // 15/11/2026: lỗi không chỉ ô → dò tên ô có trong câu báo lỗi (tên dài nhất trước), chỉ ô đang hiện
      const msg = e.message.toLowerCase(), hit = fields.filter(f => f.l && f.l.length >= 4 && $(`[data-f="${f.k}"]`, form) && msg.includes(f.l.toLowerCase().replace(/\s*\(.*\)$/, ''))).sort((a, b) => b.l.length - a.l.length)[0];
      if (hit) ef = [hit.k];
    }
    ef.forEach(k => $(`[data-f="${k}"]`, form)?.classList.add('err')); errBox.scrollIntoView({ block: 'nearest' });
    // 15/11/2026: ô lỗi nằm ở tab khác / cuối form → chuyển tab, cuộn tới ô đầu tiên bị lỗi và đặt con trỏ vào đó
    const f0 = $('.fld.err', form); if (!f0) return;
    if (f0.offsetParent === null) { const nv = $('.hd-tabs', m.el), b = nv && (f0.closest('fieldset') ? $('[data-p="ht"]', nv) : [...$$('[data-p]', nv)].find(x => x.dataset.p !== 'ht' && !x.hidden)); b?.click(); }
    setTimeout(() => { if (f0.offsetParent === null) return; f0.scrollIntoView({ block: 'center', behavior: 'smooth' }); $('input:not([type=hidden]),select,textarea', f0)?.focus({ preventScroll: true }); }, 60); };
  const showWarn = w => { if (w?.length) errBox.innerHTML = `<div class="warnbar">${ico('fa-circle-exclamation')}<div>${w.map(esc).join('<br>')}</div></div>`; };
  const send = async (check, sub) => {   // sub: lưu + trình duyệt trong cùng 1 giao dịch (trình lỗi thì không lưu)
    const data = collect();
    for (const k of skip) if (rec[k] !== undefined && !(k in data)) data[k] = rec[k];
    for (const f of fields) if (!isShown(f, { ...rec, ...data }) && f.k in data && !f.ro) data[f.k] = null;
    const qp = [check && 'check=1', sub && 'submit=1', !id && copyOf && 'copy_of=' + copyOf].filter(Boolean).join('&');
    return id ? api('PUT', `/api/e/${ent}/${id}${qp ? '?' + qp : ''}`, data) : api('POST', `/api/e/${ent}?${qp}`, data);
  };
  const save = async (andSubmit) => {
    if (htp?.filled() && +readField(form, fields.find(x => x.k === 'finish_value') || {}) > 0) { htp.show('mb'); return showErr(new Error('Giá trị hoàn thiện đã nhập ở tab Hoàn thiện căn hộ — để trống ô này ở hợp đồng mua bán')); }
    const btns = $$('.mf .btn', m.el); btns.forEach(b => b.disabled = true);
    // 16/11/2026: «Lưu và trình duyệt» = lưu + tạo đề nghị duyệt cùng lúc (thiếu điều kiện trình thì báo lỗi, KHÔNG để lại bản nháp);
    // hợp đồng có tab hoàn thiện / form có tệp đính kèm chọn ngay trên form thì vẫn lưu trước rồi mới trình (tệp phải có trước khi trình)
    const atomic = andSubmit && !htp && !fields.some(f => f.upload && $(`[name="${f.k}"]`, form)?.files?.length);
    try {
      const r = await send(false, atomic);
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
        form._clearDraft?.(); m.close(); refresh(); toast('Hợp đồng mua bán đã lưu; hợp đồng hoàn thiện chưa lưu: ' + e2.message, true);
        openForm(ent, { id: r.row.id, tab: 'ht', onSaved, htDraft: (({ number, contract_on: on, finish_value: finish, discount: disc, new_schedule: sched }) => ({ number, on, finish, disc, sched }))(htp.snap()) });
        return r.row;
      }
      // tệp đính kèm chọn ngay trong form (vd. Tệp nguồn PDF) → lưu vào mục Tệp của bản ghi
      for (const f of fields.filter(x => x.upload)) for (const file of $(`[name="${f.k}"]`, form)?.files || []) { const fd = new FormData(); fd.append('kind', 'nguon'); fd.append('file', file, file.name); await api('POST', `/api/files/${ent}/${r.row.id}`, fd); }
      if (andSubmit && !atomic) try { await api('POST', `/api/e/${ent}/${r.row.id}/submit`, {}); }
        catch (e3) { m.close(); onSaved ? onSaved(r.row) : refresh(); toast(`Đã lưu ${E.one} (bản nháp) nhưng chưa trình duyệt được: ${e3.message}`, true); return r.row; }   // đã lưu rồi: đóng form để không bấm lại tạo trùng
      form._clearDraft?.(); m.close(); toast((andSubmit ? 'Đã lưu và trình duyệt' : 'Đã lưu') + (r.warnings?.length ? ' — lưu ý: ' + r.warnings.join('; ') : ''), !!r.warnings?.some(w => /thông báo mở bán/.test(w)));
      onSaved ? onSaved(r.row) : refresh();
      return r.row;
    } catch (e) { showErr(e); } finally { btns.forEach(b => b.disabled = false); }
  };
  $('#fSave', m.el).onclick = () => save(false);
  $('#fSub', m.el) && ($('#fSub', m.el).onclick = () => save(true));
}

// ---------- bảng chọn căn áp dụng (chính sách giá): giá trị = '*' | mã tòa (cả tòa) | mã căn, cách nhau dấu phẩy ----------
// policy (chính sách bán hàng, 16/11/2026): chỉ căn còn trong bảng hàng, chưa giữ chỗ / ký HĐMB / vay / thuê; lọc nhanh theo tòa (14/11/2026 bỏ lọc loại căn, HĐMB dự thảo);
// mỗi căn ghi chính sách đang áp + HĐMB dự thảo sẽ đổi Lần thanh toán khi chính sách phát hành
// tab «2. Hoàn thiện căn hộ» của chính sách (14/11/2026): trong các căn đã chọn ở tab 1, nhập giá trị hoàn thiện (nội thất) từng căn, hoặc TÍCH chọn nhiều căn
// rồi nhập 1 lần → «Áp cho căn đã tích». Căn CÓ SỐ = có hoàn thiện (lưu); ô trống = không khai (giữ hoàn thiện đang có trong bảng hàng). Ghi vào ô ẩn finish_vals { MÃ CĂN: số tiền }
// 14/11/2026 (sửa lỗi mất giá trị): ô tích chỉ để CHỌN căn áp giá — bỏ tích không xóa giá trị đã nhập; áp xong tự bỏ tích để lần tích sau không đè căn vừa áp;
// bỏ hoàn thiện của căn = xóa số ở ô của căn, hoặc tích rồi bấm «Bỏ hoàn thiện căn đã tích»
// ===== phiếu thanh lý chung (16/11/2026): nhiều hợp đồng cùng căn, cùng khách (HĐ mua bán + HĐ hoàn thiện…) — từng HĐ + tổng chung =====
const ctOpt = (k, v) => M.ents.contract.fields.find(f => f.k === k)?.o?.find(o => o[0] === v) || null;
function liqTable(items) {
  const t = k => items.reduce((s, x) => s + (+x[k] || 0), 0);
  return `<div class="tbl-wrap"><table class="t compact noclick"><thead><tr><th>Loại hợp đồng</th><th>Số hợp đồng</th><th>Tình trạng</th><th class="num">Tiền đã thu</th><th class="num">Khấu trừ</th><th class="num">Phải hoàn trả</th><th>Ghi chú</th></tr></thead><tbody>
    ${items.map(x => { const st = ctOpt('status', x.status); return `<tr><td>${esc(ctOpt('kind', x.kind)?.[1] || x.kind || '')}</td><td><a href="#" data-open-ct="${x.contract_id}">${esc(x.number || '#' + x.contract_id)}</a></td><td>${st ? pill(st[1], st[2]) : ''}</td><td class="num">${fm(x.collected || 0)}</td><td class="num">${fm(x.deduct || 0)}</td><td class="num"><b>${fm(x.refund || 0)}</b></td><td>${esc(x.note || '')}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td colspan="3"><b>Tổng ${items.length} hợp đồng</b></td><td class="num"><b>${fm(t('collected'))}</b></td><td class="num"><b>${fm(t('deduct'))}</b></td><td class="num"><b>${fm(t('refund'))}</b></td><td></td></tr></tfoot></table></div>`;
}
document.addEventListener('click', e => { const a = e.target.closest('[data-open-ct]'); if (a) { e.preventDefault(); openDetail('contract', +a.dataset.openCt); } });
// form phiếu thanh lý: tích các hợp đồng của căn / khách — tiền đã thu theo phiếu thu, khấu trừ, phải hoàn trả (= đã thu − khấu trừ, gõ số thì giữ số đã gõ), ghi chú;
// hợp đồng đã nằm trong phiếu khác không tích được. Ghi vào ô ẩn items [{ contract_id, deduct, refund?, refund_edited?, note }] — máy chủ tính lại tiền đã thu
function liqPicker(el, root, { self } = {}) {
  const hid = $('input[type=hidden]', el), box = $('.upick-bd', el);
  let val = []; try { val = JSON.parse(hid.value || '[]') || []; } catch { val = []; }
  const sel = new Map(val.map(x => [+x.contract_id, { deduct: x.deduct ? fm(x.deduct) : '', refund: x.refund_edited && x.refund != null ? fm(x.refund) : '', ed: !!x.refund_edited, note: x.note || '' }]));
  let rows = [], key = null;
  const nm = s => Math.max(0, Math.round(num(s, true)) || 0);
  hid._get = () => [...sel].map(([id, x]) => ({ contract_id: id, deduct: nm(x.deduct), ...(x.ed && x.refund !== '' ? { refund: nm(x.refund), refund_edited: true } : {}), ...(x.note ? { note: x.note } : {}) }));
  const refundOf = (r, x) => x.ed && x.refund !== '' ? nm(x.refund) : Math.max(0, (+r.collected || 0) - nm(x.deduct));
  const totals = () => { const on = rows.filter(r => sel.has(r.id)), t = f => on.reduce((s, r) => s + f(r, sel.get(r.id)), 0);
    return `<b>Tổng ${on.length} hợp đồng</b> · đã thu ${fm(t(r => +r.collected || 0))} · khấu trừ ${fm(t((r, x) => nm(x.deduct)))} · <b>phải hoàn trả ${fm(t(refundOf))}</b>`; };
  const draw = () => {
    if (!rows.length) { box.innerHTML = `<div class="muted small">${root.elements.unit_id?.value || root.elements.contract_id?.value ? 'Căn / khách hàng chưa có hợp đồng' : 'Chọn mã căn hộ hoặc mã hợp đồng ở trên — các hợp đồng của căn hiện ở đây để tích gộp chung 1 phiếu'}</div>`; return; }
    box.innerHTML = `<div class="tbl-wrap"><table class="t compact noclick"><thead><tr><th style="width:30px"></th><th>Loại hợp đồng</th><th>Số hợp đồng</th><th>Khách hàng</th><th>Tình trạng</th><th class="num">Tiền đã thu</th><th class="num">Khấu trừ</th><th class="num">Phải hoàn trả</th><th>Ghi chú</th></tr></thead><tbody>
      ${rows.map(r => { const on = sel.has(r.id), x = sel.get(r.id) || {}, st = ctOpt('status', r.status), dis = !!r.other && !on;
        return `<tr class="${on ? 'sel' : ''}" data-lr="${r.id}"><td><input type="checkbox" data-lt="${r.id}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}></td><td>${esc(ctOpt('kind', r.kind)?.[1] || r.kind)}</td><td>${esc(r.number || '#' + r.id)}${r.other ? ` <span class="tag" title="Hợp đồng đã nằm trong phiếu ${esc(r.other)} — không đưa vào phiếu khác">Đã ở phiếu ${esc(r.other)}</span>` : ''}</td><td class="small">${esc((r.cust_code ? r.cust_code + ' · ' : '') + (r.customer || ''))}</td><td>${st ? pill(st[1], st[2]) : ''}</td><td class="num">${fm(r.collected || 0)}</td>
          <td class="num"><input class="inp" data-lk="deduct" data-id="${r.id}" inputmode="numeric" value="${esc(x.deduct || '')}" placeholder="0" style="width:120px;text-align:right" ${on ? '' : 'disabled'}></td>
          <td class="num"><input class="inp" data-lk="refund" data-id="${r.id}" inputmode="numeric" value="${esc(x.ed ? x.refund : '')}" placeholder="${on ? fm(refundOf(r, x)) : ''}" title="Để trống = đã thu − khấu trừ; gõ số = giữ số đã gõ" style="width:130px;text-align:right" ${on ? '' : 'disabled'}></td>
          <td><input class="inp" data-lk="note" data-id="${r.id}" value="${esc(x.note || '')}" style="min-width:140px" ${on ? '' : 'disabled'}></td></tr>`; }).join('')}</tbody></table></div>
      <div class="small mt liq-tot">${totals()}</div>`;
  };
  const load = async () => {
    const cid = root.elements.contract_id?.value || [...sel.keys()][0], uid = root.elements.unit_id?.value, qs = new URLSearchParams({ self: self || 0 });
    if (cid) { const c = (await api('GET', `/api/e/contract/${cid}`)).row; qs.set('unit', c.unit_id); qs.set('customer', c.customer_id); if (!sel.size && !self) sel.set(+cid, { deduct: '', refund: '', ed: false, note: '' }); }
    else if (uid) qs.set('unit', uid);
    else { rows = []; key = null; return draw(); }
    const k = qs.toString(); if (k !== key) { key = k; rows = (await api('GET', '/api/liq-contracts?' + k)).rows; }
    draw();
  };
  box.addEventListener('change', e => { const t = e.target; if (!t.dataset.lt) return; e.stopPropagation(); const id = +t.dataset.lt; t.checked ? sel.set(id, { deduct: '', refund: '', ed: false, note: '' }) : sel.delete(id); draw(); }, true);
  box.addEventListener('input', e => {
    const t = e.target, k = t.dataset.lk; if (!k) return; e.stopPropagation(); const x = sel.get(+t.dataset.id); if (!x) return;
    if (k === 'refund') { x.refund = t.value.trim(); x.ed = x.refund !== ''; } else x[k] = t.value;
    const r = rows.find(y => y.id === +t.dataset.id), rf = $(`[data-lk="refund"][data-id="${t.dataset.id}"]`, box); if (r && rf && !x.ed) rf.placeholder = fm(refundOf(r, x));
    const tt = $('.liq-tot', box); if (tt) tt.innerHTML = totals();
  }, true);
  root.addEventListener('change', e => { if (['unit_id', 'contract_id', 'kind'].includes(e.target.name)) load().catch(er => toast(er.message, true)); });
  load().catch(er => toast(er.message, true));
}
function finishPicker(el, root, { self } = {}) {
  const hid = $('input[type=hidden]', el), box = $('.upick-bd', el), projEl = $('[name="project_ids"]', root), ugEl = $('[name="unit_group"]', root);
  let val = {}; try { val = JSON.parse(hid.value || '{}') || {}; } catch { val = {}; }
  const sel = new Set(), auto = new Set();   // sel: căn đang tích để áp giá (không lưu); auto: giá trị tự điền lúc tích (bỏ tích thì gỡ lại)
  let units = [], loadedFor = null, bf = '', q = '', bulk = '';
  hid._get = () => { const o = {}; for (const [k, v] of Object.entries(val)) if (v != null && v !== '') o[k] = v; return Object.keys(o).length ? o : null; };
  const KIND = Object.fromEntries(M.ents.unit.fields.find(f => f.k === 'kind').o), K = u => u.code.toUpperCase();
  const gv = u => u.price_net != null ? +u.price_net + (+u.maint_fee || 0) : (+u.total_price || 0) - (+u.finish_value || 0);   // giá căn hộ chưa gồm hoàn thiện
  const has = u => val[K(u)] != null, fvOf = u => +(val[K(u)] || 0), numOf = s => Math.max(0, Math.round(num(s, true)) || 0);
  const inPol = () => { const s = new Set(String(ugEl?.value || '').toUpperCase().split(/[,;\s]+/).filter(Boolean)); return units.filter(u => s.has('*') || s.has(u.b) || s.has(K(u))); };
  const hit = u => !q || `${u.code} tòa ${u.b} tầng ${u.floor ?? ''} ${KIND[u.kind] || u.kind || ''}`.toLowerCase().includes(q);
  const TH = () => $('[name="pkind"]', root)?.value === 'thue';   // 17/11/2026: chính sách cho thuê — số của căn = tiền thuê nội thất/tháng
  const sumTxt = list => { const t = list.filter(has); return TH() ? `<b>Có nội thất cho thuê ${t.length}/${list.length} căn</b> · tổng tiền thuê nội thất ${fm(t.reduce((s, u) => s + fvOf(u), 0))} đ/tháng` : `<b>Có hoàn thiện ${t.length}/${list.length} căn</b> · tổng hoàn thiện ${fm(t.reduce((s, u) => s + fvOf(u), 0))} đ`; };
  const draw = () => {
    if (!projEl?.value) { box.innerHTML = '<div class="muted small">Chọn dự án trước.</div>'; return; }
    const list = inPol();
    if (!list.length) { box.innerHTML = '<div class="muted small">Chưa chọn căn hộ áp dụng — tích căn ở tab «1. Căn hộ áp dụng & tiến độ thu tiền HĐMB» trước.</div>'; return; }
    const blds = [...new Set(list.map(u => u.b))]; if (bf && !blds.includes(bf)) bf = '';
    const view = list.filter(u => !bf || u.b === bf), nSel = view.filter(u => sel.has(K(u))).length;
    const chip = (v, l, n, sub) => `<button type="button" class="upick-c${bf === v ? ' on' : ''}" data-fb="${esc(v)}">${l} <b>${n}</b>${sub ? ` <span class="muted">· có HT ${sub}</span>` : ''}</button>`;
    box.innerHTML = `<div class="upick-f"><span class="upick-l">${ico('fa-building')} Tòa</span>${chip('', 'Tất cả', list.length)}${blds.map(b => chip(b, 'Tòa ' + esc(b), list.filter(u => u.b === b).length, list.filter(u => u.b === b && has(u)).length)).join('')}</div>
      <div class="upick-sum"><span class="fin-sum">${sumTxt(list)}</span> <span class="grow"></span><div class="search upick-s"><i class="fa-solid fa-magnifying-glass"></i><input type="text" class="fin-q" placeholder="Tìm mã căn, tầng, loại…" value="${esc(q)}"></div>
        <button type="button" class="btn sm" data-ft="1">${bf ? `Tích tất cả tòa ${esc(bf)}` : 'Tích tất cả'}</button><button type="button" class="btn sm ghost" data-ft="0">${bf ? `Bỏ tích tòa ${esc(bf)}` : 'Bỏ tích hết'}</button></div>
      <div class="upick-fall row">${ico('fa-couch')} <span>${TH() ? 'Tiền thuê nội thất/tháng' : 'Giá trị hoàn thiện'} cho ${nSel} căn đã tích${bf ? ` của tòa ${esc(bf)}` : ''}</span><input class="inp fin-all" inputmode="numeric" placeholder="${TH() ? 'VD 500.000' : 'VD 120.000.000'}" value="${esc(bulk)}" style="width:160px;text-align:right"><button type="button" class="btn sm" data-fall>Áp cho căn đã tích</button>${nSel ? `<button type="button" class="btn sm ghost" data-fclr>Bỏ hoàn thiện căn đã tích</button>` : ''}<span class="small muted">Bỏ tích không xóa giá trị đã nhập — muốn bỏ hoàn thiện của căn thì xóa số ở ô của căn</span></div>
      <div class="tbl-wrap upick-t"><table class="t compact noclick"${TH() ? ' style="table-layout:fixed;width:100%"' : ''}>${TH() ? '<colgroup><col style="width:44px"><col style="width:20%"><col style="width:13%"><col style="width:12%"><col style="width:15%"><col style="width:17%"><col style="width:23%"></colgroup>' : ''}<thead><tr><th style="width:30px"><input type="checkbox" data-fv-all ${nSel && nSel === view.length ? 'checked' : ''} title="Tích / bỏ tích các căn đang xem"></th><th>Mã căn</th><th>Tòa</th><th class="num">Tầng</th><th>Loại</th><th class="num">DT thông thủy</th>${TH() ? '<th class="num">Tiền thuê nội thất/tháng</th>' : '<th class="num">Tổng giá căn hộ</th><th class="num">Giá trị hoàn thiện</th><th class="num">Tổng cộng</th>'}</tr></thead><tbody>
      ${view.map(u => { const k = K(u), t = sel.has(k); return `<tr data-row="${esc(k)}" class="${has(u) ? 'sel' : ''}"${hit(u) ? '' : ' hidden'}><td><input type="checkbox" data-fv-t="${esc(k)}" ${t ? 'checked' : ''}></td><td>${esc(u.code)}</td><td>${esc(u.b)}</td><td class="num">${u.floor ?? ''}</td><td>${esc(KIND[u.kind] || u.kind || '')}</td><td class="num">${fnum(u.area_tt)}</td>${TH() ? '' : `<td class="num">${fm(gv(u))}</td>`}
        <td class="num"><input class="inp fin-v" data-fv="${esc(k)}" inputmode="numeric" value="${val[k] != null ? fm(val[k]) : ''}" placeholder="—" title="Gõ số = căn có hoàn thiện; xóa số = bỏ hoàn thiện của căn" style="width:140px;height:30px;text-align:right"></td>${TH() ? '' : `<td class="num fin-tc"><b>${fm(gv(u) + fvOf(u))}</b></td>`}</tr>`; }).join('')}
      </tbody></table></div>`;
  };
  const load = async () => {
    const pid = projEl?.value || '';
    if (pid && pid !== loadedFor) { loadedFor = pid; box.innerHTML = '<div class="muted small">Đang tải căn hộ…</div>'; units = (await api('GET', `/api/policy-units?project=${pid}&self=${self || 0}`)).rows; }
    if (!pid) { loadedFor = null; units = []; }
    draw();
  };
  // tích: chọn căn để áp giá; căn chưa có giá trị thì tự điền số đang nhập ở ô «Giá trị hoàn thiện cho … căn» (hoặc hoàn thiện của bảng hàng) — bỏ tích thì gỡ số tự điền đó
  const tick = (list, yes) => { for (const u of list) { const k = K(u);
    if (yes) { sel.add(k); if (val[k] == null) { const v = bulk ? numOf(bulk) : +u.finish_value > 0 ? +u.finish_value : null; if (v != null) { val[k] = v; auto.add(k); } } }
    else { sel.delete(k); if (auto.has(k)) { delete val[k]; auto.delete(k); } } } draw(); };
  const viewList = () => inPol().filter(u => (!bf || u.b === bf) && hit(u));
  box.addEventListener('change', e => {
    e.stopPropagation(); const t = e.target;
    if (t.dataset.fvT) { const u = units.find(x => K(x) === t.dataset.fvT); if (u) tick([u], t.checked); }
    else if (t.dataset.fvAll !== undefined) tick(viewList(), t.checked);
    else if (t.matches('.fin-v')) t.value = val[t.dataset.fv] != null ? fm(val[t.dataset.fv]) : '';
    else if (t.matches('.fin-all') && bulk) { bulk = fm(numOf(bulk)); t.value = bulk; }
  }, true);
  box.addEventListener('input', e => {
    e.stopPropagation(); const t = e.target;
    if (t.matches('.fin-all')) { bulk = t.value.trim(); return; }   // giữ số khi bảng vẽ lại; tích căn mới tự nhận số này
    if (t.matches('.fin-q')) { q = t.value.trim().toLowerCase(); $$('tbody tr[data-row]', box).forEach(tr => { const u = units.find(x => K(x) === tr.dataset.row); tr.hidden = !(u && hit(u)); }); return; }
    if (!t.matches('.fin-v')) return;
    const k = t.dataset.fv, s = t.value.trim(); if (s) val[k] = numOf(s); else delete val[k];
    auto.delete(k);   // số gõ tay → bỏ tích không gỡ
    const tr = t.closest('tr'); tr.classList.toggle('sel', !!s);
    const u = units.find(x => K(x) === k), tc = $('.fin-tc', tr); if (u && tc) tc.innerHTML = TH() ? '' : `<b>${fm(gv(u) + fvOf(u))}</b>`;
    const sm = $('.fin-sum', box); if (sm) sm.innerHTML = sumTxt(inPol());
  }, true);
  box.addEventListener('keydown', e => { if (e.target.matches('.fin-v, .fin-all, .fin-q') && e.key === 'Enter') { e.preventDefault(); if (e.target.matches('.fin-all')) $('[data-fall]', box)?.click(); } });
  box.addEventListener('click', e => {
    const c = e.target.closest('[data-fb]'); if (c) { bf = c.dataset.fb; return draw(); }
    const ft = e.target.closest('[data-ft]'); if (ft) return tick(inPol().filter(u => !bf || u.b === bf), ft.dataset.ft === '1');
    const picked = () => inPol().filter(u => (!bf || u.b === bf) && sel.has(K(u)));
    if (e.target.closest('[data-fall]')) {   // áp cho đúng các căn đang tích, xong bỏ tích — căn không tích giữ nguyên giá trị
      if (!bulk) return toast('Nhập giá trị hoàn thiện', true);
      const list = picked(); if (!list.length) return toast('Tích chọn các căn cần áp giá trị hoàn thiện', true);
      const n = numOf(bulk); for (const u of list) { val[K(u)] = n; auto.delete(K(u)); sel.delete(K(u)); }
      draw(); return toast(`Đã áp ${fm(n)} đ cho ${list.length} căn — các căn khác giữ nguyên giá trị`);
    }
    if (e.target.closest('[data-fclr]')) {
      const list = picked(); if (!list.length) return;
      if (list.some(has) && !confirm(`Bỏ hoàn thiện (xóa giá trị) của ${list.length} căn đã tích?`)) return;
      for (const u of list) { delete val[K(u)]; auto.delete(K(u)); sel.delete(K(u)); }
      draw(); return toast(`Đã bỏ hoàn thiện ${list.length} căn`);
    }
  });
  projEl?.addEventListener('change', () => { if (el.offsetParent) load().catch(e => toast(e.message, true)); });
  el._refresh = () => load().catch(e => toast(e.message, true));
  draw();
}
// form chính sách: 2 tab — «1. Căn hộ áp dụng & tiến độ thu tiền HĐMB» và «2. Hoàn thiện căn hộ» (14/11/2026)
// 17/11/2026: loại «Cho thuê» → «1. Căn hộ áp dụng & tiến độ thu tiền thuê» (kỳ thu, đầu / cuối kỳ, số ngày đến hạn, các khoản phí) và «2. Nội thất cho thuê (nếu có)»
function policyTabs(form) {
  const bx = k => $(`[data-f="${k}"]`, form), A = ['unit_group', 'pay_sched', 'pay_cycle', 'pay_cycle_n', 'pay_when', 'pay_days', 'rent_fees'].map(bx).filter(Boolean), B = ['finish_vals', 'fin_sched'].map(bx).filter(Boolean);
  if (!A.length || !B.length) return;
  const bar = document.createElement('div'); bar.className = 'ptabs';
  let cur = 'a';
  const lab = () => { const t = $('[name="pkind"]', form)?.value === 'thue';
    bar.innerHTML = `<button type="button" data-pt="a">${ico(t ? 'fa-key' : 'fa-file-invoice-dollar')} 1. Căn hộ áp dụng &amp; tiến độ thu tiền ${t ? 'thuê' : 'HĐMB'}</button><button type="button" data-pt="b">${ico('fa-couch')} 2. ${t ? 'Nội thất cho thuê (nếu có)' : 'Hoàn thiện căn hộ'}</button>`; };
  lab(); A[0].before(bar);
  const show = t => { cur = t; A.forEach(x => { x.style.display = t === 'a' ? '' : 'none'; }); B.forEach(x => { x.style.display = t === 'b' ? '' : 'none'; }); $$('[data-pt]', bar).forEach(b => b.classList.toggle('on', b.dataset.pt === t)); if (t === 'b') $('[data-pick-fin]', form)?._refresh?.(); };
  bar.addEventListener('click', e => { const b = e.target.closest('[data-pt]'); if (b) show(b.dataset.pt); });
  form.addEventListener('change', e => { if (e.target.name !== 'pkind') return; lab(); show(cur); $('[data-pick-units]', form)?._reload?.(); $('[data-pick-fin]', form)?._refresh?.(); });
  form._ptab = show; show('a');
}
async function unitPicker(el, root, { policy, self } = {}) {
  const projEl = $('[name="project_ids"]', root) || $('[name="project_id"]', root), hid = $('input[type=hidden]', el), box = $('.upick-bd', el);
  let units = [], sel = new Set(String(hid.value).toUpperCase().split(/[,;\s]+/).filter(Boolean)), loadedFor = null, q = '', bf = '', kf = '', df = false, hidden = 0;
  const KIND = Object.fromEntries(M.ents.unit.fields.find(f => f.k === 'kind').o);
  const blds = () => [...new Set(units.map(u => u.b))];
  const isOn = u => sel.has('*') || sel.has(u.b) || sel.has(u.code.toUpperCase());
  // 17/11/2026: chính sách loại «Cho thuê» — cột giá chỉ còn «Đơn giá cho thuê» (theo ô giá thuê đang nhập trên form: đ/m²/tháng theo vị trí căn, hoặc đ/căn/tháng), trạng thái «Còn cho thuê»
  const RT = () => !!policy && $('[name="pkind"]', root)?.value === 'thue';
  const rv = k => { const x = readField(root, { k, t: 'money' }); return x == null || x === '' ? null : +x; };
  const rMode = () => $('[name="rent_mode"]', root)?.value === 'co_dinh' ? 'co_dinh' : 'don_gia';
  const rUnit = () => rMode() === 'co_dinh' ? 'đồng/căn/tháng' : 'đồng/m²/tháng';
  const rPrice = u => rMode() === 'co_dinh' ? rv('rent_fixed') : (u.position === 'goc' && rv('rent_price_goc')) || (u.position === 'thang' && rv('rent_price_thang')) || rv('rent_price');
  // 17/11/2026: form thông báo loại «Cho thuê» — cột «Đơn giá thuê» theo chính sách cho thuê áp dụng cho từng căn (chưa có = Chưa thiết lập, không lấy giá bán)
  const RN = () => !policy && $('[name="deal"]', root)?.value === 'thue';
  let rentMap = new Map(), rentKey = '', allU = null;
  const loadRent = async () => { if (policy) return; const pid = projEl?.value || '', deal = RN() ? 'thue' : 'ban', pol = RN() ? $('[name="policy_id"]', root)?.value || '' : '', op = readField(root, { k: 'open_on', t: 'date' }) || '', k = [pid, deal, pol, op].join(':'); if (!pid || k === rentKey) return; rentKey = k;
    rentMap = new Map((await api('GET', `/api/rent-prices?project=${pid}&deal=${deal}&policy=${pol}&open=${op}&self=${root.dataset.id || ''}`)).rows.map(x => [x.id, x])); };
  // 16/11/2026: form thông báo — cột «Ghi chú» = trạng thái hiện tại của căn (đang mở bán / cho thuê, đăng ký, hồ sơ, hợp đồng, thanh lý…), theo hợp đồng còn hiệu lực:
  // căn đã ký HĐ bán (HĐMB…) không hiện trong gợi ý (mở bán và cho thuê); HĐ thuê còn hiệu lực: mở bán vẫn chọn được, cho thuê hiện mờ + khóa ô chọn (không lập trùng đợt);
  // căn đang mở bán vẫn cho thuê được. Căn đã tích trước đó mà không còn hợp lệ vẫn hiện để bỏ tích
  const filterRN = () => { if (!allU) allU = units; units = policy ? allU : allU.filter(u => !rentMap.get(u.id)?.hide || isOn(u)); };
  const blk = u => !policy && rentMap.get(u.id)?.ok === false;
  const notesOf = u => rentMap.get(u.id)?.notes || [];
  const stOf = u => (RT() || RN()) && u.status === 'con_ban' ? 'Còn cho thuê' : USTAT[u.status] || u.status || '';
  // tìm căn: mã căn, tòa, tầng, loại, trạng thái — chỉ ẩn/hiện dòng, không vẽ lại để ô tìm giữ con trỏ
  const fOn = () => !!(q || bf || kf || df);
  const hit = u => (!bf || u.b === bf) && (!kf || (u.kind || '') === kf) && (!df || !!u.draft) && (!q || `${u.code} tòa ${u.b} tầng ${u.floor ?? ''} ${KIND[u.kind] || u.kind || ''} ${stOf(u)} ${u.pol || ''} ${u.draft || ''} ${policy ? '' : notesOf(u).map(x => x.t).join(' ')}`.toLowerCase().includes(q));
  const applyQ = () => {
    $$('.upick-t tbody tr[data-row]', box).forEach(tr => { tr.hidden = !hit(units.find(u => u.id === +tr.dataset.row)); });
    $$('.upick-t tbody tr.pg', box).forEach(tr => { tr.hidden = fOn() && !units.some(u => u.b === tr.dataset.g && hit(u)); });
    const n = units.filter(hit).length, f = $('[data-all="q"]', box), c = $('.upick-n', box);
    if (f) { f.hidden = !q; f.style.display = q ? '' : 'none'; f.textContent = `Chọn ${n} căn đang hiện`; }   // chỉ hiện khi đang lọc tòa / tìm (không lọc = trùng «Chọn tất cả») if (c) c.textContent = fOn() ? `đang hiện ${n} căn` : '';
  };
  // chuẩn hóa: chọn đủ cả dự án → '*', đủ cả tòa → mã tòa — so với MỌI căn của dự án (kể cả căn đã ẩn vì đã ký HĐMB): tòa có căn ẩn thì ghi đích danh mã căn
  const norm = picked => {
    if (RN()) return picked.map(u => u.code.toUpperCase()).join(',');   // cho thuê: ghi đúng mã căn (không gộp cả dự án / cả tòa — tránh lẫn căn đang mở bán)
    const full = allU || units;
    if (full.length && picked.length === full.length) return '*';
    const out = [];
    for (const b of [...new Set(full.map(u => u.b))]) { const all = full.filter(u => u.b === b), on = all.filter(u => picked.includes(u)); if (on.length === all.length) out.push(b); else out.push(...on.map(u => u.code.toUpperCase())); }
    return out.join(',');
  };
  const setVal = picked => { hid.value = norm(picked); sel = new Set(hid.value.split(',').filter(Boolean)); draw(); };
  const draw = () => {
    if (!projEl?.value) { box.innerHTML = '<div class="muted small">Chọn dự án trước — danh sách căn hộ của dự án hiện ở đây.</div>'; return; }
    if (!units.length) { box.innerHTML = '<div class="muted small">Dự án đã chọn chưa có căn hộ trong danh mục sản phẩm.</div>'; return; }
    const on = units.filter(isOn), tot = on.reduce((s, u) => s + (+u.total_price || 0), 0), cnt = f => units.filter(f).length;
    const chip = (k, v, cur, l, n, sub) => `<button type="button" class="upick-c${cur === v ? ' on' : ''}" data-${k}="${esc(v)}">${l} <b>${n}</b>${sub ? ` <span class="muted">· chọn ${sub}</span>` : ''}</button>`;
        const fl = policy ? `<div class="upick-f"><span class="upick-l">${ico('fa-building')} Tòa</span>${chip('bf', '', bf, 'Tất cả', units.length)}${blds().map(b => chip('bf', b, bf, 'Tòa ' + esc(b), cnt(u => u.b === b), cnt(u => u.b === b && isOn(u)))).join('')}</div>` : '';   // 14/11/2026: chỉ lọc theo tòa (bỏ lọc loại căn / HĐMB dự thảo); bỏ dòng «Đã ẩn N căn…» (căn đã bán / giữ chỗ vẫn ẩn)
    const rt = RT(), rn = RN();
    box.innerHTML = `${fl}<div class="upick-sum"><b>Đã chọn ${on.length}/${units.length} căn</b>${rt || rn ? '' : ` · tổng giá ${fm(tot)} đ`} <span class="grow"></span><div class="search upick-s"><i class="fa-solid fa-magnifying-glass"></i><input type="text" class="upick-q" placeholder="Tìm mã căn, tầng, loại, trạng thái…" value="${esc(q)}"></div><span class="small muted upick-n"></span><button type="button" class="btn sm" data-all="q" hidden></button><button type="button" class="btn sm" data-all="1">${bf ? `Chọn tất cả tòa ${esc(bf)}` : 'Chọn tất cả'}</button><button type="button" class="btn sm ghost" data-all="0">${bf ? `Bỏ chọn tòa ${esc(bf)}` : 'Bỏ chọn hết'}</button></div>
      <div class="tbl-wrap upick-t"><table class="t compact noclick${policy ? '' : ' upick-rn'}"><thead><tr><th style="width:30px"></th><th>Mã căn</th><th>Tòa</th><th class="num">Tầng</th><th>Loại</th><th class="num">DT thông thủy</th>${rt ? `<th class="num">Đơn giá cho thuê<div class="small muted" style="font-weight:400">${rUnit()}</div></th>` : rn ? '<th class="num">Giá thuê nhà/tháng<div class="small muted" style="font-weight:400">đồng/căn · đã gồm thuế GTGT</div></th><th class="num">Giá thuê nội thất/tháng<div class="small muted" style="font-weight:400">đồng/căn</div></th><th class="num">Tổng cộng/tháng<div class="small muted" style="font-weight:400">đồng/căn · đã gồm thuế GTGT tiền thuê nhà</div></th>' : '<th class="num">Giá sau thuế</th><th class="num">Phí bảo trì</th><th class="num">Tổng giá căn hộ</th>'}<th>Trạng thái</th>${policy ? '' : '<th>Ghi chú</th>'}${policy ? `<th>${rt ? 'Chính sách cho thuê đang áp dụng' : 'Chính sách đang áp dụng cho căn'}</th>` : ''}</tr></thead><tbody>
      ${blds().map(b => { const all = units.filter(u => u.b === b), n = all.filter(isOn).length, can = all.filter(u => !blk(u));
        return `<tr class="pg" data-g="${esc(b)}"><td><input type="checkbox" data-b="${esc(b)}" ${can.length && can.every(isOn) ? 'checked' : ''}${can.length ? '' : ' disabled'}></td><td colspan="${rt ? 8 : 10}"><b>Tòa ${esc(b)}</b> <span class="muted">— chọn ${n}/${all.length} căn</span></td></tr>` +
          all.map(u => `<tr data-row="${u.id}"${blk(u) ? ' class="off"' : ''}><td><input type="checkbox" data-u="${u.id}" ${isOn(u) ? 'checked' : ''}${blk(u) && !isOn(u) ? ` disabled title="Không cho thuê được: ${esc(rentMap.get(u.id).why || '')}"` : ''}></td><td>${esc(u.code)}</td><td>${esc(b)}</td><td class="num">${u.floor ?? ''}</td><td>${esc(KIND[u.kind] || u.kind || '')}</td><td class="num">${fnum(u.area_tt)}</td>${rt ? `<td class="num">${rPrice(u) ? fm(rPrice(u)) : '<span class="muted" title="Nhập đơn giá / tiền thuê ở nhóm «Giá thuê»">—</span>'}</td>` : rn ? (x => x?.house ? `<td class="num" title="${esc(x.pol || '')}${x.unit ? ' · đơn giá ' + fm(x.price) + ' ' + esc(x.unit) : ''}">${fm(x.house)}</td><td class="num">${fm(x.furn || 0)}</td><td class="num"><b>${fm(x.total)}</b></td>` : '<td class="num"><span class="muted" title="Căn chưa có chính sách cho thuê áp dụng">Chưa thiết lập</span></td><td class="num">0</td><td class="num muted">—</td>')(rentMap.get(u.id)) : `<td class="num">${fm(u.price_net)}</td><td class="num">${fm(u.maint_fee)}</td><td class="num">${fm(u.total_price)}</td>`}<td>${esc(stOf(u))}${blk(u) ? `<div class="small neg" title="${esc(rentMap.get(u.id).why || '')}">${rn ? 'Không cho thuê được' : 'Không mở bán được'}${isOn(u) ? ' — bỏ tích' : ''}</div>` : ''}${u.draft && !rt ? `<div class="small" title="HĐMB dự thảo — chính sách phát hành thì Lần thanh toán tự đổi theo tiến độ">${ico('fa-file-pen')} ${esc(u.draft)}</div>` : ''}</td>${policy ? '' : `<td class="small sn-note">${notesOf(u).map(x => `<div class="sn-${esc(x.k)}">${esc(x.t)}</div>`).join('')}</td>`}${policy ? `<td class="small">${u.pol ? `${esc(u.pol)}${isOn(u) ? '<div class="muted" title="Khi chính sách đang soạn được phát hành và tới ngày bắt đầu, căn này chuyển sang áp chính sách đang soạn (chính sách có ngày bắt đầu muộn hơn được ưu tiên)">→ sẽ đổi sang chính sách đang soạn khi phát hành</div>' : ''}` : '<span class="muted">—</span>'}</td>` : ''}</tr>`).join(''); }).join('')}
      </tbody></table></div>`;
    $$('.upick-t tbody tr', box).forEach(tr => { const c = $('input', tr); if (c?.dataset.u) tr.classList.toggle('sel', c.checked); });
    applyQ();
  };
  const load = async () => {
    const pid = projEl?.value || ''; if (pid === loadedFor) return draw(); loadedFor = pid; units = [];
    if (pid && policy) { box.innerHTML = '<div class="muted small">Đang tải các căn còn trong bảng hàng…</div>'; const r = await api('GET', `/api/policy-units?project=${pid}&self=${self || 0}&pkind=${$('[name="pkind"]', root)?.value || 'ban'}`); units = r.rows; hidden = r.hidden; if (bf && !units.some(u => u.b === bf)) bf = ''; }
    else if (pid) { box.innerHTML = '<div class="muted small">Đang tải danh sách căn…</div>'; units = (await Promise.all(pid.split(',').map(p => api('GET', `/api/e/unit?project=${p}&limit=20000`)))).flatMap(r => r.rows).map(u => ({ ...u, b: String(u.building_id__l || '').split(' · ')[0].toUpperCase() })).sort((a, c) => a.code.localeCompare(c.code, 'vi', { numeric: true })); }
    allU = units; await loadRent().catch(() => {}); filterRN();
    draw();
  };
  el._reload = () => { loadedFor = null; load().catch(e => toast(e.message, true)); };
  if (!policy) root.addEventListener('change', e => { if (['deal', 'policy_id', 'open_on'].includes(e.target.name) && (allU || units).length) loadRent().then(() => { filterRN(); draw(); }).catch(er => toast(er.message, true)); });   // đổi loại giao dịch / chính sách cho thuê   // đổi loại chính sách (bán / cho thuê)
  if (policy) root.addEventListener('change', e => { if (RT() && ['rent_mode', 'rent_price', 'rent_price_goc', 'rent_price_thang', 'rent_fixed'].includes(e.target.name) && units.length) draw(); });   // sửa giá thuê → cột đơn giá đổi theo
  box.addEventListener('input', e => { if (!e.target.matches('.upick-q')) return; e.stopPropagation(); q = e.target.value.trim().toLowerCase(); applyQ(); });
  box.addEventListener('keydown', e => { if (e.target.matches('.upick-q') && e.key === 'Enter') e.preventDefault(); });   // Enter không gửi form
  box.addEventListener('change', e => {
    if (e.target.matches('.upick-q')) { e.stopPropagation(); return; }
    const c = e.target; if (c.type !== 'checkbox') return; e.stopPropagation();
    let picked = units.filter(isOn);
    if (c.dataset.b) { const all = units.filter(u => u.b === c.dataset.b); picked = c.checked ? [...new Set([...picked, ...all.filter(u => !blk(u))])] : picked.filter(u => !all.includes(u)); }   // tích cả tòa: bỏ qua căn không cho thuê được
    else { const u = units.find(x => x.id === +c.dataset.u); picked = c.checked ? [...picked, u] : picked.filter(x => x !== u); }
    setVal(picked);
  });
  box.addEventListener('click', e => {   // chip lọc tòa / loại căn / HĐMB dự thảo: chỉ đổi phần đang hiện, không đổi lựa chọn
    const c = e.target.closest('.upick-c'); if (!c) return;
    if (c.dataset.bf !== undefined) bf = c.dataset.bf; if (c.dataset.kf !== undefined) kf = c.dataset.kf; if (c.dataset.df) df = !df; draw();
  });
  box.addEventListener('click', e => {   // 14/11/2026: Chọn tất cả / Bỏ chọn chỉ trong tab tòa đang xem (Tất cả = cả dự án); «q» = thêm các căn tìm được
    const a = e.target.closest('[data-all]'); if (!a) return; const inTab = u => !bf || u.b === bf, on = units.filter(isOn);
    setVal(a.dataset.all === '1' ? [...new Set([...on, ...units.filter(u => inTab(u) && !blk(u))])] : a.dataset.all === 'q' ? [...new Set([...on, ...units.filter(u => hit(u) && !blk(u))])] : on.filter(u => !inTab(u)));
  });   // «q» = thêm các căn tìm được (căn không cho thuê được bỏ qua)
  // thông báo cho thuê: quay lại cửa sổ (VD vừa lập phiếu / ký HĐ ở tab khác) → tải lại trạng thái căn ở cột Ghi chú
  if (!policy) { const onF = () => { if (!document.contains(el)) return window.removeEventListener('focus', onF); if (!(allU || units).length) return; rentKey = ''; loadRent().then(() => { filterRN(); draw(); }).catch(() => {}); }; window.addEventListener('focus', onF); }
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
const TPL_KIND0 = { contract: 'hop_dong', contract_change: 'phu_luc', handover: 'bien_ban', defect: 'bien_ban', reservation: 'de_nghi', noxh_check: 'bien_ban_giao_nhan', sale_notice: 'thong_bao', handover_notice: 'thong_bao', gcn_notice: 'thong_bao', notice: 'thong_bao', report: 'bao_cao', target: 'bao_cao', receipt: 'de_nghi', payment: 'de_nghi', pinkbook: 'de_nghi' };
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
const tplNewBtn = sc => M.ents.template?.perm?.c && sc?.pcode ? `<button class="btn" id="pNew" title="Tạo mẫu mới, tự gắn với ${esc(scLabel(sc))}">${ico('fa-plus')} Tạo mẫu cho ${esc(sc.bcode ? (sc.bname || 'tòa ' + sc.bcode) : (sc.pname || sc.pcode))}</button>` : '';
function tplNewWire(m, sc, ent, kind, reopen) {
  const b = $('#pNew', m.el); if (!b) return;
  b.onclick = () => { m.close(); openForm('template', { preset: { ent, kind, active: true, scope: sc.bcode ? `${sc.pcode}-${sc.bcode}` : sc.pcode, code: `${({ dang_ky_can: 'DK', dang_ky_noi_that: 'DK-NT', bien_ban_giao_nhan: 'BBGN', hop_dong: 'HD' })[kind] || 'MAU'}-${sc.pcode}${sc.bcode ? '-' + sc.bcode : ''}`.toUpperCase(), name: `Mẫu – ${scLabel(sc)}` }, title: `Tạo mẫu · ${esc(scLabel(sc))}`, onSaved: () => reopen() }); };
}
document.addEventListener('click', e => { const b = e.target.closest('[data-tpls]'); if (b) tplManager(b.dataset.tpls); });   // nút «Mẫu biểu» ở màn tự dựng (khách hàng, sản phẩm)
// 17/11/2026: hộp chọn mẫu in dùng chung (In theo mẫu / In đơn đăng ký / In biên bản giao nhận) — mẫu nhóm theo tòa / dự án / chung,
// ô tìm khi nhiều mẫu, tự chọn sẵn mẫu đã in lần trước ở màn đó, bấm đúp hoặc Enter để in ngay
const LV_H = { 2: 'Mẫu riêng của tòa', 1: 'Mẫu riêng của dự án', 0: 'Mẫu chung' };
function tplPickModal({ title, icon = 'fa-print', sc, ts, pre, memo, emptyMsg, onGo, newWire }) {
  const MK = 'ctg-kd-tpl-' + memo; let last = null; try { last = localStorage.getItem(MK); } catch {}
  const p0 = ts.find(t => t.code === last) || pre || ts[0];
  const grp = [2, 1, 0, -9].map(lv => [lv, ts.filter(t => (t.lv ?? -9) === lv)]).filter(([, a]) => a.length);
  const item = t => `<label class="tpk-i" data-q="${esc(`${t.name} ${t.code}`.toLowerCase())}"><input type="radio" name="tpl" value="${esc(t.code)}" ${t === p0 ? 'checked' : ''}><span class="tpk-n"><b>${esc(t.name)}</b><small>${esc(t.code)}</small></span>${t.code === last ? `<span class="tpk-last">${ico('fa-clock-rotate-left')} In lần trước</span>` : ''}</label>`;
  const m = modal({ title: `${ico(icon)} ${esc(title)}`, narrow: true,
    body: `${tplScopeBar(sc)}${ts.length ? `${ts.length > 5 ? `<input class="inp tpk-q" type="search" placeholder="Tìm mẫu theo tên hoặc mã…" autocomplete="off" aria-label="Tìm mẫu">` : ''}
      <div class="tpk" role="radiogroup" aria-label="Chọn mẫu in">${grp.map(([lv, a]) => `${grp.length > 1 && LV_H[lv] ? `<div class="tpk-h">${LV_H[lv]}</div>` : ''}${a.map(item).join('')}`).join('')}</div>
      <div class="tpk-none empty" hidden>Không có mẫu khớp</div><div class="small muted tpk-hint">${ico('fa-keyboard')} Bấm đúp vào mẫu hoặc nhấn Enter để in ngay</div>` : `<div class="empty">${emptyMsg}</div>`}`,
    foot: `<button class="btn" data-x>Hủy</button>${tplNewBtn(sc)}${ts.length ? `<button class="btn pri" id="pOk">${ico('fa-print')} In</button>` : ''}` });
  newWire && newWire(m);
  if (!ts.length) return m;
  const go = () => { const c = $('input[name=tpl]:checked', m.el)?.value, t = ts.find(x => x.code === c); if (!t) return;
    try { localStorage.setItem(MK, c); } catch {} m.close(); onGo(t); };
  $('#pOk', m.el).onclick = go;
  $('.tpk', m.el).ondblclick = e => { if (e.target.closest('.tpk-i')) go(); };
  m.el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.target.closest('.tpk, .tpk-q')) { e.preventDefault(); go(); } });
  const q = $('.tpk-q', m.el);
  if (q) q.oninput = () => { const v = q.value.trim().toLowerCase(); let first = null;
    $$('.tpk-i', m.el).forEach(l => { const on = !v || l.dataset.q.includes(v); l.hidden = !on; if (on && !first) first = l; });
    $$('.tpk-h', m.el).forEach(h => { let n = h.nextElementSibling, any = false; while (n && !n.classList.contains('tpk-h')) { if (!n.hidden) any = true; n = n.nextElementSibling; } h.hidden = !any; });
    if (first && $('input[name=tpl]:checked', m.el)?.closest('.tpk-i')?.hidden) first.querySelector('input').checked = true;
    $('.tpk-none', m.el).hidden = !!first; $('#pOk', m.el).disabled = !first; };
  setTimeout(() => (q || $('input[name=tpl]:checked', m.el))?.focus(), 40);
  return m;
}
async function tplPrint(ent, id) {
  const [ts, sc] = await Promise.all([api('GET', `/api/templates?ent=${ent}&active=1&rec=${id}`), api('GET', `/api/template-scope/${ent}/${id}`)]);
  tplPickModal({ title: 'In theo mẫu', sc, ts, pre: ts[0], memo: ent, emptyMsg: `Chưa có mẫu cho ${esc(scLabel(sc) || tplPlace(ent))}.`,
    onGo: t => window.open(tplUrl(ent, id, t), '_blank'), newWire: m => tplNewWire(m, sc, ent, TPL_KIND0[ent] || 'thong_bao', () => tplPrint(ent, id)) });
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
  const ts = all.filter(t => (t.kind === 'dang_ky_noi_that' || /hoàn thiện căn hộ/i.test(t.label)) === nt && t.lv >= 0).sort((a, b) => b.lv - a.lv).map(t => ({ ...t, name: t.label }));   // chỉ mẫu của đúng dự án / tòa và mẫu chung
  tplPickModal({ title: nt ? 'In đơn đăng ký nội thất' : 'In đơn đăng ký căn hộ', sc, ts, pre: ts.find(t => t.fit) || ts[0], memo: 'res-' + kind, emptyMsg: `Chưa có mẫu đơn đăng ký cho ${esc(scLabel(sc))}.`,
    onGo: t => window.open(`/print/reservation/${id}?kind=${t.kind}&tpl=${encodeURIComponent(t.code)}`, '_blank'), newWire: m => tplNewWire(m, sc, 'reservation', kind, () => printPick(id, kind)) });
}

// in biên bản giao nhận hồ sơ (từ phiếu đăng ký / hồ sơ NOXH): chọn mẫu theo công ty — Cát Tường, Thống Nhất… (Quản trị › Mẫu biểu)
async function handoverPick(kind, id) {
  const ent = kind === 'reservation' ? 'reservation' : 'noxh_check';
  const [all, sc] = await Promise.all([api('GET', `/api/handover-templates?${kind}=${id}`), api('GET', `/api/template-scope/${ent}/${id}`)]);
  const ts = all.filter(t => t.fit).sort((a, b) => b.lv - a.lv);   // chỉ mẫu của đúng dự án / tòa và mẫu chung
  tplPickModal({ title: 'In biên bản giao nhận hồ sơ', icon: 'fa-file-signature', sc, ts, pre: ts.find(t => t.best) || ts[0], memo: 'bbgn-' + kind, emptyMsg: `Chưa có mẫu biên bản cho ${esc(scLabel(sc))}.`,
    onGo: t => window.open(`/print/handover/${kind}/${id}?tpl=${encodeURIComponent(t.code)}`, '_blank'), newWire: m => tplNewWire(m, sc, ent, 'bien_ban_giao_nhan', () => handoverPick(kind, id)) });
}

// ---------- ngăn chi tiết ----------
let DR = null;
function closeDetail() { DR?.ov.remove(); DR?.el.remove(); DR = null; }
// 16/11/2026: quay lại cửa sổ app (VD vừa đổi kết quả xét duyệt hồ sơ ở tab khác) → danh sách, số đếm và màn chi tiết đang mở tự tải lại (không cần F5);
// đang mở form sửa thì không tải lại (giữ dữ liệu đang nhập)
let focusAt = 0;
window.addEventListener('focus', () => {
  if (Date.now() - focusAt < 4000 || document.querySelector('.modal')) return; focusAt = Date.now();
  if (DR?.reload) DR.reload().catch(() => {}); else refresh(true);
});
// như BRAVO: Đã tạo … | Đã sửa … (người sửa)
const traceLine = t => !t?.created_at ? '' : `<div class="trace">Đã tạo: ${dmyhm(t.created_at)}${t.created_by ? ` (${esc(t.created_by)})` : ''}${t.updated_at ? ` | Đã sửa: ${dmyhm(t.updated_at)}${t.updated_by ? ` (${esc(t.updated_by)})` : ''}` : ''}</div>`;
// bấm vào một ô: dòng nhỏ đổi sang ai lập, ai sửa đúng ô đó
function traceField(box, t, k, label) {
  if (!box || !t) return;
  const e = t.fields?.[k === 'new_schedule' ? 'lich' : k];
  box.innerHTML = `<b>${esc(label)}</b>: lập ${dmyhm(t.created_at)}${t.created_by ? ` (${esc(t.created_by)})` : ''} | ${e ? `sửa gần nhất ${dmyhm(e.at)} (${esc(e.who)})` : 'chưa ai sửa'}`;
}
// 16/11/2026: HĐ có hồ sơ NOXH được Sở Xây dựng xét duyệt KHÔNG đủ điều kiện — cảnh báo đỏ + lý do / số văn bản / ngày xét duyệt (form sửa và màn chi tiết)
function noxhFailBar(r) {
  if (!r?.noxh_fail) return '';
  const k = r._noxh_kind || r.kind, w = k === 'thue' ? 'thuê' : k === 'thue_mua' ? 'thuê mua' : 'mua', H = { hdmb: 'Hợp đồng mua bán', thue_mua: 'Hợp đồng thuê mua', thue: 'Hợp đồng thuê', hoan_thien: 'Hợp đồng hoàn thiện căn hộ', vay: 'Hợp đồng vay' };
  return `<div class="errbar" style="margin:8px 0">${ico('fa-triangle-exclamation')}<div><b>Hồ sơ ${w} của khách hàng đã được Sở Xây dựng xét duyệt không đủ điều kiện ${w} nhà ở xã hội. Không thể trình duyệt, duyệt hoặc ký ${H[r.kind] || 'hợp đồng'}.</b>${r.noxh_fail_txt ? `<div class="small" style="margin-top:3px">${esc(r.noxh_fail_txt)}</div>` : ''}</div></div>`;
}
async function openDetail(ent, id, tab, plain) {   // plain: chỉ xem (mở từ Lịch ký) — không hàng nút, không dòng báo chốt, ẩn ô trống
  const E = M.ents[ent]; if (!E) return;
  let g; try { g = await api('GET', `/api/e/${ent}/${id}`); } catch (e) { return toast(e.message, true); }
  closeDetail();
  try { const r0 = g.row || g; if (typeof recentAdd === 'function') recentAdd({ k: 'rec', type: ent, id, title: `${E.one ? E.one[0].toUpperCase() + E.one.slice(1) : E.title} ${r0.number || r0.code || r0.full_name || r0.voucher_no || '#' + id}`, sub: E.title }); } catch { }   // 17/11/2026: «Gần đây»
  const ov = document.createElement('div'); ov.className = 'drawer-ov'; ov.onclick = closeDetail;
  const el = document.createElement('aside'); el.className = `drawer ${plain ? 'plain' : ''}`; el.setAttribute('role', 'dialog');
  document.body.append(ov, el);
  DR = { ov, el, ent, id };
  const reload = async (t) => { const keepTab = t || $('.tabs button.on', el)?.dataset.tab; await openDetail(ent, id, keepTab, plain); refresh(true); };
  DR.reload = reload;
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
    ${ent === 'contract' ? noxhFailBar(r) : ''}
    <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</div></div><div class="db" id="dBody"></div>${traceLine(g.trace)}`;
  el.addEventListener('click', ev => { const d = ev.target.closest('[data-fk]'); if (d) traceField($('.trace', el), g.trace, d.dataset.fk, E.fields.find(f => f.k === d.dataset.fk)?.l || ''); });
  const body = $('#dBody', el);
  const T = {
    info: () => {
      const fs = E.fields.filter(f => f.t !== 'json' || f.k === 'reviews' || f.k === 'new_schedule' || f.k === 'pay_sched' || f.k === 'fin_sched' || f.pick === 'liq');   // liq: bảng hợp đồng của phiếu thanh lý chung (16/11/2026)
      let h = !plain && p.locked ? `<div class="lockbar">${ico('fa-lock')} ${E.one[0].toUpperCase() + E.one.slice(1)} đã chốt / đang trình duyệt — ${ent === 'contract' && E.softLock?.st.includes(r.status) ? 'nhân viên chỉ sửa được Lần thanh toán, nội dung khác do quản lý sửa.' : `không sửa trực tiếp${ent === 'contract' ? '. Thay đổi qua «Điều chỉnh – phụ lục hợp đồng».' : '.'}`}</div>` : '';
      if (E.note) h += `<div class="warnbar">${ico('fa-circle-info')}<span>${esc(E.note)}</span></div>`;
      if (String(r.sale_check || '').startsWith('⚠')) h += `<div class="warnbar">${ico('fa-triangle-exclamation')} <div><b>Cảnh báo mở bán:</b> ${esc(r.sale_check.slice(2))}</div></div>`;   // căn ngoài thông báo mở bán đã duyệt gần nhất
      h += `<dl class="kv">${fs.filter(f => f.t !== 'check' && (f.t !== 'json' || f.grid || f.k === 'pay_sched' || f.k === 'fin_sched' || f.pick === 'liq') && isShown(f, r) && (!plain || (r[f.k] != null && r[f.k] !== '' && r[f.k] !== false && !(Array.isArray(r[f.k]) && !r[f.k].length)))).map(f => `<div data-fk="${f.k}" class="${f.t === 'long' || f.grid || f.k === 'pay_sched' || f.k === 'fin_sched' || f.pick === 'liq' || (f.pick && r._units) ? 'wide' : ''}"><dt>${esc(f.l)}</dt><dd>${show(f, r)}${(f.pii || f.grid?.some(c => c.pii)) && r._masked && M.piiRoles.includes(M.me.role) ? ` <button class="btn ghost sm" data-do="pii">${ico('fa-eye')} Hiện</button>` : ''}</dd></div>`).join('')}</dl>`;
      for (const f of fs.filter(f => f.t === 'check')) h += `<div class="sec-title">${esc(f.l)}</div><table class="t compact noclick"><thead><tr><th>Giấy tờ</th><th>Tình trạng</th><th>Ghi chú</th></tr></thead><tbody>${(r[f.k] || []).map(x => `<tr><td>${esc(x.n)}</td><td>${x.st ? pill(CK.find(o => o[0] === x.st)[1], x.st === 'da_nhan' ? 'g' : 'r') : '<span class="muted">chưa</span>'}</td><td>${esc(x.note)}</td></tr>`).join('')}</tbody></table>`;
      if (r.reviews?.length) h += `<div class="sec-title">Các bước xét duyệt nội bộ</div><div class="tl">${r.reviews.map(x => `<div><b>${esc({ kiem_tra_1: 'Kiểm tra lần 1', kiem_tra_cheo: 'Kiểm tra chéo', doi_chieu_goc: 'Đối chiếu bản gốc' }[x.step] || x.step)}</b> — ${x.conclusion === 'dat' ? pill('Đạt', 'g') : pill('Cần bổ sung', 'a')}<br><small>${esc(x.by)} · ${dmyhm(x.at)}${x.note ? ' · ' + esc(x.note) : ''}</small></div>`).join('')}</div>`;
      if (r.new_schedule?.length) h += `<div class="sec-title">Tiến độ thanh toán mới</div>${schedTable(r.new_schedule)}`;
      if (ent === 'contract') h += `<div class="sec-title">Công nợ</div>${debtTiles(r._debt)}`;
      body.innerHTML = h;
    },
    debt: () => { const d = r._debt, sale = ['thue', 'vay'].includes(r.kind) && r.sale_on && r.sale_sched?.length;   // HĐ thuê / vay bán căn: tiến độ HĐMB + thu tiền HĐ vay ở đầu tab
      const uc = '<div id="unitCts" class="mb">Đang tải các hợp đồng của căn…</div>';   // 16/11/2026: mọi HĐ của căn + trạng thái + công nợ từng HĐ
      if (sale && r.kind === 'vay') { body.innerHTML = uc + '<div id="saleTrk">Đang tải…</div>'; unitCtsInto($('#unitCts', body), r); saleTrackInto($('#saleTrk', body), r); return; }
      body.innerHTML = `${uc}${sale ? '<div id="saleTrk">Đang tải tiến độ HĐMB…</div><div class="sec-title st-big">' + ico('fa-key') + ' Tiền thuê — HĐ thuê ' + esc(r.number || '') + '</div>' : ''}${debtTiles(d)}<div class="sec-title">Lịch thanh toán hiệu lực</div>${d.inst.length ? schedTable(d.inst, true) : '<div class="empty">Chưa lập lịch thanh toán</div>'}<div class="sec-title">Chứng từ thu (Bravo)</div><div id="rcpt">Đang tải…</div>`;
      if (sale) saleTrackInto($('#saleTrk', body), r);
      unitCtsInto($('#unitCts', body), r);
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
// HĐ thuê / vay bán căn: tiến độ thu tiền HĐMB + thu tiền HĐ vay (14/11/2026)
// 16/11/2026: «Các hợp đồng của căn» — mọi HĐ của căn với trạng thái thật, ngày cập nhật, công nợ tách từng HĐ (HĐ thuê / vay bán căn: dòng tiến độ HĐMB riêng);
// HĐ đã thanh lý / hủy ở phần «Đã đóng» (không cộng vào tổng phải thu); bấm số HĐ mở HĐ, nút «Lịch sử» xem các lần chuyển trạng thái (thời gian, người thực hiện, lý do)
const UC_HIST = new Set(['tao', 'trinh_duyet', 'phe_duyet', 'tu_choi', 'ho_so_khong_du_dk', 'ho_so_du_dk', 'cho_ho_so', 'gan_ho_so', 'huy', 'khoi_phuc']);
async function unitCtsInto(el, r) {
  if (!el || !r.unit_id) { if (el) el.innerHTML = ''; return; }
  let d; try { d = await api('GET', `/api/unit-contracts/${r.unit_id}`); } catch (e) { el.innerHTML = `<span class="muted">${esc(e.message)}</span>`; return; }
  const money = (v, cls = '') => `<td class="num ${cls}">${v ? fm(v) : '<span class="muted">0</span>'}</td>`;
  // 1 dòng / HĐ: [Số HĐ + loại] [Khách] [Trạng thái + ngày cập nhật] [Phải thu] [Đã thu] [Còn phải thu] [Quá hạn] [Lịch sử] — vừa khung màn chi tiết, không cuộn ngang
  const row = x => `<tr class="${x.id === r.id ? 'sel' : ''}"><td><a href="#" data-uco="${x.id}"><b>${esc(x.number)}</b></a>${x.id === r.id ? ' <span class="small muted">(đang xem)</span>' : ''}<div class="small muted">${esc(x.kind_l)}${x.nature ? ' · ' + esc(x.nature) : ''}</div></td>
    <td>${esc(x.customer)}${x.kcode ? `<div class="small muted">${esc(x.kcode)}</div>` : ''}</td><td>${pill(x.st_l, x.st_c)}<div class="small muted">${x.closed_txt ? esc(x.closed_txt) + '<br>' : ''}cập nhật ${dmyhm(x.updated_at)}</div></td>
    ${money(x.debt.total)}${money(x.debt.paid)}${x.closed ? `<td class="num muted" title="Còn lại lúc đóng: ${fm(x.debt.left_at_close || 0)}">—</td><td class="num muted">—</td>` : money(x.debt.left) + money(x.debt.overdue, x.debt.overdue ? 'neg' : '')}
    <td class="center"><button type="button" class="btn ghost sm" style="padding:3px 5px" data-uch="${x.id}" data-ucn="${esc(x.number)}" title="Lịch sử chuyển trạng thái (thời gian, người thực hiện, lý do)">${ico('fa-clock-rotate-left')}</button></td></tr>`
    + (x.sale_shared ? `<tr class="uc-sub"><td colspan="8"><span class="muted">↳</span> Tiến độ thu tiền HĐMB dùng chung với HĐ thuê đi kèm ${esc(x.sale_shared)} — xem dòng của HĐ thuê (không tính trùng)</td></tr>` : '')
    + (x.sale ? `<tr class="uc-sub"><td colspan="3"><span class="muted">↳</span> Tiến độ thu tiền HĐMB của ${esc(x.number)}${x.sale.linked ? ` (dùng chung với HĐ vay ${esc(x.sale.linked)})` : ''}${x.sale.policy ? ` · theo ${esc(x.sale.policy)}` : ''}<div class="small muted">${esc(x.sale.src || '')}</div></td>${money(x.sale.total)}${money(x.sale.paid)}${money(x.sale.left)}${money(x.sale.overdue, x.sale.overdue ? 'neg' : '')}<td></td></tr>` : '');
  const open = d.rows.filter(x => !x.closed), shut = d.rows.filter(x => x.closed), T = d.totals;
  const cg = '<colgroup><col style="width:17%"><col style="width:14%"><col style="width:14%"><col style="width:12.5%"><col style="width:12.5%"><col style="width:12.5%"><col style="width:12.5%"><col style="width:5%"></colgroup>';
  const head = `${cg}<thead><tr><th>Hợp đồng</th><th>Khách hàng</th><th>Trạng thái</th><th class="num">Phải thu</th><th class="num">Đã thu</th><th class="num">Còn phải thu</th><th class="num">Quá hạn</th><th></th></tr></thead>`;
  el.innerHTML = `<div class="sec-title st-big">${ico('fa-folder-tree')} Các hợp đồng của căn ${esc(d.unit?.code || '')}</div>
    <div class="tbl-wrap"><table class="t compact noclick uc-t">${head}<tbody>${open.map(row).join('') || '<tr><td colspan="8" class="muted">Không có hợp đồng đang theo dõi</td></tr>'}</tbody>
    <tfoot><tr><td colspan="3"><b>Tổng phải thu hiện tại</b> <span class="small muted">(HĐ đang theo dõi, không gồm HĐ vay)</span></td><td class="num"><b>${fm(T.total)}</b></td><td class="num"><b>${fm(T.paid)}</b></td><td class="num"><b>${fm(T.left)}</b></td><td class="num ${T.overdue ? 'neg' : ''}"><b>${fm(T.overdue)}</b></td><td></td></tr></tfoot></table></div>
    ${shut.length ? `<div class="sec-title">${ico('fa-box-archive')} Hợp đồng đã đóng (lịch sử — không cộng vào tổng phải thu)</div><div class="tbl-wrap"><table class="t compact noclick uc-t">${head}<tbody>${shut.map(row).join('')}</tbody></table></div>` : ''}
    <div class="small muted">HĐ vay: «Phải thu / Đã thu» = tiền gốc khách chuyển cho công ty. Trạng thái và công nợ lấy trực tiếp từ hợp đồng / hồ sơ gốc mỗi lần mở (quay lại cửa sổ là tự cập nhật).</div>`;
  el.onclick = async e => {
    const a = e.target.closest('[data-uco]'); if (a) { e.preventDefault(); if (+a.dataset.uco !== r.id) openDetail('contract', +a.dataset.uco, 'debt'); return; }
    const h = e.target.closest('[data-uch]'); if (!h) return;
    const xs = (await api('GET', `/api/e/contract/${h.dataset.uch}/history`)).filter(x => UC_HIST.has(x.action) || x.action.startsWith('tt:') || ['status', 'noxh_wait', 'noxh_fail'].some(k => k in (x.after || {})));
    modal({ title: `${ico('fa-clock-rotate-left')} Lịch sử trạng thái · ${esc(h.dataset.ucn)}`, body: histHtml(xs, 'contract') });
  };
}
async function saleTrackInto(el, r) {
  try {
    const x = await api('GET', `/api/sale-track/${r.id}`), s = x.sale;
    const rcp = rs => rs.length ? `<table class="t compact noclick"><thead><tr><th>Ngày</th><th>Chứng từ</th><th>Nội dung</th><th class="num">Số tiền</th></tr></thead><tbody>${rs.map(z => `<tr><td>${dmy(z.voucher_date)}</td><td>${esc(z.voucher_no || '')}</td><td>${esc(z.content || '')}</td><td class="num">${fm(z.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3"><b>Cộng</b></td><td class="num"><b>${fm(rs.reduce((a, z) => a + +z.amount, 0))}</b></td></tr></tfoot></table>` : '<div class="empty">Chưa có phiếu thu</div>';
    el.innerHTML = `<div class="sec-title st-big">${ico('fa-file-signature')} Tiến độ thu tiền HĐMB${s.value ? ` — giá trị HĐMB ${fm(s.value)}` : ''}</div>${debtTiles(s)}
      <div class="small muted mt">${ico('fa-circle-info')} ${esc(s.src)}; chia vào các đợt theo thứ tự hạn.${s.extra > 0 ? ` Thu vượt tiến độ ${fm(s.extra)}.` : ''}</div>
      ${schedTable(s.rows.map(i => ({ ...i, name: i.maint && !/bảo trì/i.test(i.name || '') ? `${i.name} (phí bảo trì)` : i.name })), true)}
      ${x.vay.map(v => `<div class="sec-title st-big">${ico('fa-building-columns')} Thu tiền HĐ vay ${esc(v.number || '')}${v.value ? ` — số tiền vay ${fm(v.value)}` : ''}</div>${debtTiles(v.debt)}
        ${v.debt.inst.length ? `<div class="sec-title">Các đợt khách chuyển tiền gốc</div>${schedTable(v.debt.inst, true)}` : ''}
        <div class="sec-title">Phiếu thu HĐ vay (gốc khách đã chuyển)</div>${rcp(v.receipts)}${v.goc_tra ? `<div class="small muted mt">Công ty đã trả lại gốc: <b>${fm(v.goc_tra)}</b> → số dư gốc khách đã chuyển ${fm(v.debt.paid - v.goc_tra)}</div>` : ''}`).join('')}`;
  } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
function debtTiles(d) {
  if (!d) return '';
  if (d.closed) return `<div class="card mb" style="border-left:4px solid #d4a72c;padding:10px 14px">${ico('fa-box-archive')} <b>Hợp đồng đã thanh lý ngày ${dmy(d.closed_on)} — đã đóng theo dõi công nợ.</b> Lịch thu / đã thu chỉ để tra cứu, không tính vào công nợ phải thu, không nhắc thu. Khoản hoàn trả theo dõi tại <a href="#/v/payouts">Theo dõi thanh lý &amp; chi trả</a>.</div>
    <div class="grid g4">${[['Phải thu theo lịch', d.total], ['Đã thu', d.paid, `${fnum(d.paid_pct)}%`], ['Còn phải thu', 0, `đã đóng${d.left_at_close ? ' · chưa thu lúc thanh lý ' + fm(d.left_at_close) : ''}`], ['Quá hạn', 0, 'đã đóng']].map(([l, v, s]) => `<div class="card kpi" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:18px">${fm(v)}</div><div class="s">${s || '&nbsp;'}</div></div>`).join('')}</div>`;   // 17/11/2026
  return `<div class="grid g4">${[['Phải thu theo lịch', d.total], ['Đã thu (Bravo)', d.paid, `${fnum(d.paid_pct)}%`], ['Còn phải thu', d.left], ['Quá hạn', d.overdue, d.overdue_days ? `${d.overdue_days} ngày` : '', d.overdue > 0]].map(([l, v, s, red]) => `<div class="card kpi ${red ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:18px">${fm(v)}</div><div class="s">${s || '&nbsp;'}</div></div>`).join('')}</div>
    ${d.next ? `<div class="small muted mt">${ico('fa-clock')} Kỳ tới: ${esc(d.next.name)} — ${fm(d.next.rem)}đ, hạn ${dmy(d.next.due_on)}</div>` : ''}`;
}
const PAYST = { da_thu: ['Đã thu đủ', 'g'], qua_han: ['Quá hạn', 'r'], den_han: ['Đến hạn hôm nay', 'a'], sap_den_han: ['Sắp đến hạn', 'a'], mot_phan: ['Thu một phần', 'b'], chua_den_han: ['Chưa đến hạn', 's'], dong: ['Đã đóng (HĐ thanh lý)', 's'] };
function schedTable(rows, withPaid) {
  return `<table class="t compact noclick"><thead><tr><th>Đợt</th><th>Nội dung</th><th>Hạn</th><th class="num">Tỷ lệ</th><th class="num">Số tiền</th>${withPaid ? '<th class="num">Đã thu</th><th>Tình trạng</th>' : ''}</tr></thead><tbody>${rows.map((i, k) => `<tr><td>${i.seq || k + 1}</td><td>${esc(i.name)}${i.src === 'phu_luc' ? ' <span class="tag">phụ lục</span>' : ''}</td><td>${dmy(i.due_on)}</td><td class="num">${i.pct != null ? fnum(i.pct) + '%' : ''}</td><td class="num">${fm(i.amount)}</td>${withPaid ? `<td class="num">${fm(i.paid)}</td><td>${pill(...(PAYST[i.st] || ['', 's']))}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}
const ACT_L = { chuyen_hdmb: 'Chuyển tiếp sang HĐMB', thanh_ly: 'Thanh lý', tu_lap_hd: 'Tự lập hợp đồng', ho_so_khong_du_dk: 'Hồ sơ NOXH không đủ điều kiện', ho_so_du_dk: 'Hồ sơ NOXH đủ điều kiện', cho_ho_so: 'Chờ duyệt hồ sơ NOXH', gan_ho_so: 'Gắn hồ sơ NOXH', bo_sung_gia_thue: 'Bổ sung chi tiết giá thuê', tu_chon_chinh_sach: 'Tự chọn chính sách', tao: 'Tạo mới', sua: 'Sửa', xoa: 'Xóa', khoi_phuc: 'Khôi phục', trinh_duyet: 'Trình duyệt', phe_duyet: 'Phê duyệt', tu_choi: 'Từ chối', tai_tep: 'Tải tệp', xoa_tep: 'Xóa tệp', khoi_phuc_tep: 'Khôi phục tệp', cap_nhat_trang_thai: 'Hệ thống cập nhật trạng thái', cap_nhat_dieu_kien: 'Hệ thống cập nhật điều kiện', lich_thanh_toan: 'Lập lịch thanh toán', han_dot_ban_giao: 'Hạn đợt theo thông báo bàn giao', dot_ban_giao: 'Gắn đợt thu với bàn giao', han_dot_gcn: 'Hạn đợt theo thông báo bàn giao Giấy chứng nhận', dot_gcn: 'Gắn đợt thu với Giấy chứng nhận', han_theo_ngay_ky: 'Hạn đợt theo ngày ký', dong_cong_no: 'Đóng theo dõi công nợ (thanh lý)', xem_dinh_danh: 'Xem dữ liệu định danh', in_hop_dong: 'In hợp đồng', qua_han_giu_cho: 'Hệ thống: quá hạn giữ chỗ', kich_hoat: 'Kích hoạt mở bán', phu_luc: 'Cập nhật theo phụ lục', nhap_lich_su: 'Nhập dữ liệu lịch sử', nhap_excel: 'Cập nhật từ tệp Excel', thay_the: 'Bị thay thế', huy: 'Hủy', doi_can: 'Đổi căn', doi_kh: 'Đổi khách hàng', hoan_tac: 'Hoàn tác', xuat_du_lieu: 'Xuất dữ liệu', dang_nhap: 'Đăng nhập', dang_nhap_sai: 'Đăng nhập sai', doi_mat_khau: 'Đổi mật khẩu', cap_nhat_ho_so: 'Cập nhật hồ sơ cá nhân', chuyen_tt: 'Chuyển trạng thái' };
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
  // 17/11/2026: thông báo mở bán / cho thuê, chính sách bán / cho thuê, hồ sơ mua / thuê — tab lọc theo loại
  const KN = { sale_notice: [['b', 'Mở bán', 'fa-bullhorn'], ['t', 'Cho thuê', 'fa-key']],   // 17/11/2026 (Tâm): bỏ tab «Tất cả» — mặc định Mở bán price_policy: [['', 'Tất cả', 'fa-layer-group'], ['b', 'Chính sách bán', 'fa-tags'], ['t', 'Chính sách cho thuê', 'fa-key']],
    noxh_check: [['', 'Tất cả', 'fa-layer-group'], ['m', 'Hồ sơ mua', 'fa-house'], ['t', 'Hồ sơ thuê', 'fa-key']] }[ent];
  if (KN && !KN.some(k => k[0] === (S.ht || ''))) S.ht = KN[0][0];   // tab đang nhớ không còn (VD «Tất cả» đã bỏ) → tab đầu
  const grp = () => KN ? ({ b: 'ban', m: 'mua', t: 'thue' }[S.ht] || '') : rsKinds ? (S.ht === 't' ? 'thue' : 'mua') : hdKinds && S.ht ? ({ t: 'thue', v: 'vay' }[S.ht] || 'hoan_thien') : S.group;
  // Điều kiện lọc (như BRAVO) ở danh sách Hợp đồng căn hộ chung cư: lọc ngày theo ô chọn, dự án, phân loại (tòa); «Xem …» bật / tắt nhóm cột — theo từng loại HĐ
  const FV = 'ctg-kd-hd-cot';   // cột đang tick theo loại HĐ (localStorage)
  if (hdKinds && !S.flt) { let view = {}; try { view = JSON.parse(localStorage.getItem(FV) || '{}') || {}; } catch { } S.flt = { v: {}, view, hide: true }; }   // 17/11/2026 (Tâm): khung Điều kiện lọc mặc định thu gọn — bấm nút «Điều kiện lọc» mới mở   // v[loại HĐ] = { lk_/fr_/to_/mn_/mx_/f_<trường>: giá trị }
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
      ${hdKinds ? `<div class="tabs hd-tabs hd-kinds" id="hdK"><button data-ck="" class="${S.ht ? '' : 'on'}">${ico('fa-file-contract')} HĐ mua bán</button><button data-ck="1" class="${S.ht === '1' ? 'on' : ''}">${ico('fa-couch')} HĐ hoàn thiện căn hộ</button><button data-ck="t" class="${S.ht === 't' ? 'on' : ''}">${ico('fa-key')} HĐ thuê</button><button data-ck="v" class="${S.ht === 'v' ? 'on' : ''}">${ico('fa-hand-holding-dollar')} HĐ vay</button></div>` : ''}${rsKinds ? `<div class="tabs hd-tabs hd-kinds" id="hdK"><button data-ck="" class="${S.ht ? '' : 'on'}">${ico('fa-hand-holding-hand')} Đăng ký mua</button><button data-ck="t" class="${S.ht === 't' ? 'on' : ''}">${ico('fa-key')} Đăng ký thuê</button></div>` : ''}${KN ? `<div class="tabs hd-tabs hd-kinds" id="hdK">${KN.map(([v, l, ic]) => `<button data-ck="${v}" class="${(S.ht || '') === v ? 'on' : ''}">${ico(ic)} ${l}</button>`).join('')}</div>` : ''}${st ? `<div class="tabs" id="stTabs"></div>` : ''}${hdKinds ? `<div class="flt-wrap ${S.flt.hide ? 'flt-off' : ''}"><aside class="flt" id="flt"></aside><div class="flt-main">` : ''}<div id="bulk"></div><div class="tbl-wrap" id="tb"><div class="empty">Đang tải…</div></div><div class="more" id="more"></div>${hdKinds ? '</div></div>' : ''}</div></div>`;
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
      ${cols.some(k => E.fields.find(f => f.k === k)?.t === 'money' || VIRT_MONEY.has(k)) ? `<tfoot><tr>${bulk ? '<td></td>' : ''}${cols.map((k, i) => { const f = E.fields.find(x => x.k === k); return (f?.t === 'money' || VIRT_MONEY.has(k)) ? `<td class="num" data-sum="${k}">${fm(d.rows.reduce((s, r) => s + (+r[k] || 0), 0))}</td>` : `<td${i === 0 ? ' data-sumlab' : ''}>${i === 0 ? (d.rows.length < d.total ? 'Tổng <span class="muted small">(đang tính…)</span>' : 'Tổng') : ''}</td>`; }).join('')}</tr></tfoot>` : ''}</table>`
      : `<div class="empty">${ico(E.icon)}Chưa có ${esc(E.one)} nào${S.q || S.status ? ' khớp bộ lọc' : ''}.${E.perm.c && ent !== 'reservation' ? ' Bấm «Tạo ' + esc(E.one) + '» để bắt đầu.' : ''}</div>`;
    $$('input[data-dp]', main).forEach(addPicker);
    $('#more', main).innerHTML = d.rows.length < d.total ? `<button class="btn" id="moreBtn">Tải thêm (${d.total - d.rows.length} còn lại)</button>` : '';
    // 15/11/2026: dòng «Tổng» = tổng TOÀN BỘ bản ghi khớp bộ lọc, không chỉ các dòng đang hiện (danh sách chỉ tải 300 dòng đầu)
    if (d.rows.length < d.total && $('[data-sum]', main)) {
      const seq = (S._sumSeq = (S._sumSeq || 0) + 1), pa = new URLSearchParams(p); pa.set('limit', d.total);
      api('GET', `/api/e/${ent}?${pa}`).then(all => {
        if (seq !== S._sumSeq) return;
        $$('[data-sum]', main).forEach(td => { const k = td.dataset.sum; td.textContent = fm(all.rows.reduce((s, r) => s + (+r[k] || 0), 0)); });
        const l = $('[data-sumlab]', main); if (l) l.innerHTML = `Tổng <span class="muted small">(tất cả ${all.rows.length} dòng)</span>`;
      }).catch(() => { const l = $('[data-sumlab]', main); if (l) l.innerHTML = `Tổng <span class="muted small">(${d.rows.length} dòng đang hiện)</span>`; });
    }
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
    if (t.id === 'newBtn' || t.closest('#newBtn')) return openForm(ent, { tab: hdKinds && S.ht ? ({ t: 'thue', v: 'vay' }[S.ht] || 'ht') : undefined, preset: { ...(KN && S.ht ? { sale_notice: { deal: S.ht === 't' ? 'thue' : 'ban' }, noxh_check: { reg_kind: S.ht === 't' ? 'thue' : 'mua' }, price_policy: { pkind: S.ht === 't' ? 'thue' : 'ban' } }[ent] : {}), ...(hdKinds && S.ht === 't' ? { kind: 'thue' } : hdKinds && S.ht === 'v' ? { kind: 'vay', nature: 'ban' } : {}), ...(S.project && E.fields.some(f => f.k === 'project_id') ? { project_id: +S.project } : {}), ...(E.groups?.[S.group] ? { ptype: S.group } : {}) } });
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
      // 16/11/2026: theo trạng thái từng dòng — Duyệt / Từ chối chỉ cho bản đang chờ duyệt (bản nháp: báo «chưa được trình duyệt»), Trình duyệt chỉ cho bản nháp / bị trả lại
      const One = E.one.charAt(0).toUpperCase() + E.one.slice(1), stOf = id => S.rowSt?.get(id), sub = bb.dataset.b === 'submit';
      const direct = bb.dataset.b === 'ok' && (E.acts || []).some(a => a.k === 'approve_direct');   // hợp đồng: dự thảo được «Duyệt hợp đồng» trực tiếp
      const okSt = s => s === undefined || (sub ? E.flow.submit.includes(s) : s === 'cho_duyet' || (direct && E.flow.submit.includes(s)));
      const ids = [...S.sel].filter(id => okSt(stOf(id))), drafts = [...S.sel].filter(id => E.flow.submit.includes(stOf(id))).length, skip = S.sel.size - ids.length;
      if (!ids.length) return toast(sub ? `${S.sel.size} ${E.one} đã chọn đều đã trình / đã duyệt — không cần trình lại` : drafts ? `${One} chưa được trình duyệt. Vui lòng trình duyệt trước.` : `Không có ${E.one} nào đang chờ duyệt trong các dòng đã chọn`, true);
      const note = skip ? ` (bỏ qua ${skip} dòng ${sub ? 'đã trình / đã duyệt' : drafts ? 'chưa được trình duyệt' : 'không ở trạng thái chờ duyệt'})` : '';
      let comment = null;
      if (bb.dataset.b === 'no') { comment = await ask('Từ chối', `Từ chối ${ids.length} bản ghi?${note}`, { reason: 1, reasonReq: 1, danger: 1, okLabel: 'Từ chối' }); if (!comment) return; }
      else if (!await ask(bb.dataset.b === 'ok' ? 'Duyệt hàng loạt' : 'Trình duyệt hàng loạt', `Thực hiện cho ${ids.length} bản ghi${note}?`)) return;
      const r = await api('POST', `/api/bulk/${ent}/${sub ? 'submit' : 'approve'}`, { ids, ok: bb.dataset.b === 'ok', comment: comment === true ? null : comment });
      toast(`Thành công ${r.ok}${r.errors.length ? ` · lỗi ${r.errors.length}: ${r.errors.slice(0, 2).map(x => '#' + x.id + ' ' + x.msg).join('; ')}` : ''}${note}`, !!r.errors.length);
      S.sel.clear(); updateBadges(); return load();
    }
    if (t.closest('[data-ret], .ret-fi a, .dwrap-in')) return;
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
    const k = t.dataset.ret; let v = t.value || null;
    if (k === 'doc_ret_on' && v) { v = parseDmy(v); if (!v) return toast('Ngày trả hồ sơ nhập theo dd/mm/yyyy', true); t.value = dmy(v); }   // 17/11/2026: ô ngày dd/mm/yyyy
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
function refresh(quiet) { if (ST.reload) ST.reload().catch(e => !quiet && toast(e.message, true)); if (typeof updateBadges === 'function') Promise.resolve().then(updateBadges).catch(() => {}); }   // sau lưu / trình / duyệt: danh sách + số đếm tab + số chờ duyệt ở menu cập nhật ngay
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
    <div class="row mb"><button class="btn" id="tpl">${ico('fa-download')} Tải tệp mẫu</button>${kind === 'misa' && M.testTools ? `<button class="btn" id="tplT" title="File giả lập sổ quỹ MISA theo các hợp đồng thử đang nợ — tải về rồi chọn lại để thử nhập">${ico('fa-flask')} Tải file MISA thử</button>` : ''}<input type="file" id="ifile" accept=".xlsx,.csv" class="inp" style="padding-top:5px;flex:1"></div><div id="ires"></div>`,
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

// ---- screens.js
// Khung app, đăng nhập, điều hướng và các màn tổng hợp.
'use strict';
const V = {};
const filt = () => ST.filt ||= { project: '', building: '', from: '', to: '' };

// ---------- đăng nhập ----------
async function loginView() {
  try { const i = await (await fetch('/api/login-info')).json(); if (i.noLogin) { history.replaceState(null, '', location.pathname + location.search); return boot(); } } catch {}
  document.body.innerHTML = `<div class="login"><div class="hero"><img src="logo.png" alt=""><div class="k">CAT TUONG GROUP</div><h1>Quản lý <span>Phòng Kinh doanh</span></h1><p>Một mã căn — một hồ sơ xuyên suốt: giỏ hàng, khách hàng, giao dịch, hợp đồng, công nợ, bàn giao và cấp sổ hồng.</p></div>
    <div class="box"><form id="lf"><h2>Đăng nhập</h2><p class="muted" style="margin-top:0">Tài khoản nhân viên do Quản trị hệ thống cấp.</p><div id="lerr"></div>
      <div class="fld mb"><label for="lu">Tên đăng nhập</label><input id="lu" autocomplete="username" required></div>
      <div class="fld mb"><label for="lp">Mật khẩu</label><input id="lp" type="password" autocomplete="current-password" required></div>
      <button class="btn pri" style="width:100%;height:42px;justify-content:center">${ico('fa-right-to-bracket')} Đăng nhập</button><div class="trial" id="trial"></div></form></div></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('POST', '/api/login', { username: $('#lu').value.trim(), password: $('#lp').value }); history.replaceState(null, '', location.pathname + location.search); await boot(r.must_change); }
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
  document.body.classList.toggle('no-xr', !M.exportRoles.includes(M.me.role));
  applyPrefs();
  document.body.innerHTML = `<header class="top"><button class="ibtn burger" id="burger" aria-label="Menu">${ico('fa-bars')}</button><a class="brand" href="${homeHash()}"><img src="logo.png" alt="Cát Tường"><div><b>CAT TUONG GROUP</b><span>Phòng Kinh doanh</span></div></a>
    <div class="gsearch"><i class="fa-solid fa-magnifying-glass"></i><input id="gs" type="search" placeholder="Tìm mã căn, khách hàng, số điện thoại, số hợp đồng…" autocomplete="off"><div class="gres hidden" id="gr"></div></div>
    <div class="topact"><button class="ibtn ai-btn" id="bAi" title="Trợ lý AI tra cứu">${ico('fa-wand-magic-sparkles')}</button><button class="ibtn" id="bApr" title="Hộp phê duyệt">${ico('fa-stamp')}<span class="dot a hidden" id="nApr"></span></button><button class="ibtn" id="bAl" title="Cảnh báo / nhắc việc">${ico('fa-bell')}<span class="dot hidden" id="nAl"></span></button>
    <div class="me" id="meBtn" title="Tài khoản cá nhân">${meInner()}</div></div></header>
    <nav class="side" id="side"><h6>DANH MỤC PHÂN HỆ</h6>${M.menu.map(([no, t, icon, items]) => items.length === 1   // phân hệ chỉ một màn: bấm thẳng tên phân hệ, không xổ mục con
      ? `<div class="mod" data-mod="${no}"><a class="solo" href="${items[0][0].startsWith('e:') ? '#/e/' + items[0][0].slice(2) : '#/v/' + items[0][0]}" data-nav="${items[0][0]}"><span class="n">${no}</span>${esc(t)}</a></div>`
      : `<div class="mod" data-mod="${no}"><button>${`<span class="n">${no}</span>`}${esc(t)}<i class="fa-solid fa-chevron-right chev"></i></button><div class="items">${items.map(([id, l]) => `<a href="${id.startsWith('e:') ? '#/e/' + id.slice(2) : '#/v/' + id}" data-nav="${id}">${esc(l)}</a>`).join('')}</div></div>`).join('')}
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
    const who = `<div class="mp-who">${avHtml(M.me, 'av')}<div><b>${esc(M.me.full_name)}</b><div class="small muted">${esc(M.me.username)} · ${esc(roleName(M.me.role))}</div></div></div>
      <div class="mp-st">${STATUS.map(([k, l, c, i]) => `<button type="button" data-st="${k}" class="${(M.me.status || 'lam_viec') === k ? 'on' : ''}" title="${esc(l)}"><i class="sdot s-${k}"></i>${esc(l.split(' –')[0])}</button>`).join('')}</div>
      <button data-go="#/v/profile">${ico('fa-id-card')} Tài khoản cá nhân</button><button data-go="#/v/profile?tab=set">${ico('fa-sliders')} Cài đặt hệ thống</button>`;
    const pop = async ev => {   // dùng chung 2 kiểu menu: đổi trạng thái nhanh / mở trang cá nhân
      const s = ev.target.closest('[data-st]'), g = ev.target.closest('[data-go]');
      if (g) { p.remove(); location.hash = g.dataset.go; return true; }
      if (s) { try { await saveProfile({ status: s.dataset.st }); toast('Đã đổi trạng thái: ' + STATUS.find(x => x[0] === s.dataset.st)[1]); } catch (x) { toast(x.message, true); } p.remove(); return true; }
    };
    if (M.noLogin) {   // chạy thử không đăng nhập: đổi vai trò bằng một cú bấm
      p.classList.add('as-pop');
      p.innerHTML = `${who}<div class="small muted" style="padding:6px 12px 4px">${ico('fa-user-gear')} Xem app với vai trò</div>${M.users.filter(u => u.active).map(u => `<button data-as="${u.id}" class="${u.id === M.me.id ? 'on' : ''}">${ico(u.id === M.me.id ? 'fa-circle-check' : 'fa-user')} ${esc(u.full_name)}<small class="muted"> · ${esc(roleName(u.role))}</small></button>`).join('')}`;
      document.body.append(p);
      p.onclick = async ev => { if (await pop(ev)) return; const b = ev.target.closest('[data-as]'); if (!b || +b.dataset.as === M.me.id) return; try { await api('POST', `/api/as/${b.dataset.as}`, {}); await window.__ctgBeforeReload?.(); location.reload(); } catch (x) { toast(x.message, true); } };
      return;
    }
    p.innerHTML = `${who}<button id="mPw">${ico('fa-key')} Đổi mật khẩu</button><button id="mOut">${ico('fa-right-from-bracket')} Đăng xuất</button>`;
    document.body.append(p); p.addEventListener('click', pop);
    $('#mPw').onclick = () => { p.remove(); forcePassword(); };
    $('#mOut').onclick = async () => { await api('POST', '/api/logout', {}); await window.__ctgBeforeReload?.(); location.hash = ''; location.reload(); };
  };
  document.addEventListener('click', e => { if (!e.target.closest('.menu-pop')) $('.menu-pop')?.remove(); if (!e.target.closest('.gsearch')) $('#gr')?.classList.add('hidden'); });
  globalSearch();
  window.onhashchange = route; window.addEventListener('beforeunload', e => { if (ST.dirtyMsg) { e.preventDefault(); e.returnValue = ''; } });
  route();
  badgeTimer();
  ST.verT ||= setInterval(checkVer, 60e3);
}
// máy chủ có bản giao diện mới trong lúc trang đang mở (giao diện chỉ nạp 1 lần khi mở trang): báo để người dùng tự tải lại, không tự tải kẻo mất phần đang nhập
let VER0 = null;
async function checkVer() {
  try {
    const { ver } = await api('GET', '/api/ver'); if (!ver) return;   // bản demo: không có
    if (!VER0) { VER0 = ver; return; }
    if (ver === VER0 || $('#updBar')) return;
    const b = document.createElement('div'); b.id = 'updBar'; b.className = 'upd-bar';
    b.innerHTML = `${ico('fa-rotate')}<span>Có bản cập nhật mới của app — lưu phần đang nhập rồi bấm <b>Tải lại</b> để dùng bản mới.</span><button type="button" class="btn sm">Tải lại</button>`;
    b.querySelector('button').onclick = () => location.reload();
    document.body.append(b);
  } catch { }
}
async function updateBadges() {
  try {
    const [a, al] = await Promise.all([api('GET', '/api/approvals'), api('GET', '/api/alerts')]);
    const P = prefs(), n1 = P.badgeApr ? a.pending.length : 0, n2 = P.badgeAl ? al.filter(x => x.lvl === 'r').length || al.length : 0;
    $('#nApr').textContent = n1; $('#nApr').classList.toggle('hidden', !n1);
    $('#nAl').textContent = n2 > 99 ? '99+' : n2; $('#nAl').classList.toggle('hidden', !n2);
  } catch { }
}
// 17/11/2026: ô tìm thông minh — gõ tên MÀN (đi thẳng tới màn), mã / tên / SĐT / số HĐ (hồ sơ), hoặc CÂU HỎI (hỏi Trợ lý tra cứu);
// bấm vào ô khi chưa gõ: «Gần đây» (hồ sơ + màn vừa mở); phím «/» hoặc Ctrl+K nhảy vào ô tìm từ bất kỳ đâu (quy tắc search-accessible, keyboard-shortcuts)
const RECENT_KEY = 'ctg-kd-gan-day';
const recentGet = () => { try { return JSON.parse(lsGet(RECENT_KEY) || '[]'); } catch { return []; } };
function recentAdd(x) {   // x: { k: 'rec', type, id, title, sub } | { k: 'nav', hash, title, sub }
  const key = y => y.k === 'nav' ? 'n:' + y.hash : `r:${y.type}:${y.id}`;
  const L = [x, ...recentGet().filter(y => key(y) !== key(x))].slice(0, 12);
  lsSet(RECENT_KEY, JSON.stringify(L));
}
const navList = () => M.menu.flatMap(([no, mt, , items]) => items.map(([id, l]) => ({ k: 'nav', hash: id.startsWith('e:') ? '#/e/' + id.slice(2) : '#/v/' + id, title: l, sub: `Phân hệ ${no} · ${mt}`, id })));
function globalSearch() {
  const inp = $('#gs'), box = $('#gr');
  const fold = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const I = { unit: 'fa-door-open', customer: 'fa-user', contract: 'fa-file-contract', ticket: 'fa-headset', reservation: 'fa-hand-holding-hand' };
  let items = [], cur = -1, seq = 0;
  inp.placeholder = 'Tìm căn, khách, SĐT, số HĐ, tên màn… hoặc gõ câu hỏi  ( / )';
  const go = x => {
    box.classList.add('hidden'); inp.value = ''; inp.blur();
    if (x.k === 'nav') return void (location.hash = x.hash);
    if (x.k === 'ask') return void (location.hash = '#/v/ai?q=' + encodeURIComponent(x.q));
    recentAdd({ k: 'rec', type: x.type, id: x.id, title: x.title, sub: x.sub });
    if (x.type === 'unit') location.hash = `#/v/unit360?id=${x.id}`; else if (x.type === 'customer') location.hash = `#/v/cust360?id=${x.id}`; else openDetail(x.type, x.id);
  };
  const row = (x, i) => x.h ? `<div class="gs-h">${esc(x.h)}</div>` : `<a href="#" data-i="${i}" class="${x.k === 'ask' ? 'gs-ask' : ''}">${ico(x.k === 'nav' ? 'fa-compass' : x.k === 'ask' ? 'fa-wand-magic-sparkles' : I[x.type] || 'fa-file')}<div><b>${esc(x.title)}</b><small>${esc(x.sub || '')}</small></div>${x.k === 'nav' ? '<em>Mở màn</em>' : ''}</a>`;
  const draw = () => { cur = items.findIndex(x => !x.h); box.innerHTML = items.length ? items.map(row).join('') : '<div class="empty" style="padding:16px">Không tìm thấy — thử gõ ít chữ hơn, hoặc gõ câu hỏi để hỏi trợ lý</div>'; mark(); box.classList.remove('hidden'); };
  const mark = () => $$('[data-i]', box).forEach(a => a.classList.toggle('on', +a.dataset.i === cur));
  const showRecent = () => {
    const R = recentGet(), quick = ['myday', 'board', 'duedebt', 'ai'].map(id => navList().find(n => n.id === id)).filter(Boolean);
    items = [...(R.length ? [{ h: 'Gần đây' }, ...R] : []), { h: 'Mở nhanh' }, ...quick.filter(q => !R.some(r => r.k === 'nav' && r.hash === q.hash))];
    draw();
  };
  inp.onfocus = () => { if (!inp.value.trim()) showRecent(); };
  inp.oninput = debounce(async () => {
    const v = inp.value.trim(), my = ++seq;
    if (!v) return showRecent();
    const f = fold(v), words = f.split(/\s+/).filter(Boolean);
    const navs = v.length >= 2 ? navList().filter(n => { const t = fold(n.title + ' ' + n.sub); return words.every(w => t.includes(w)); }).slice(0, 5) : [];
    const question = /[?]$/.test(v) || /^(bao nhieu|co bao|nhung|liet ke|tong|top|can nao|khach nao|hop dong nao|viec cua|hom nay)/.test(f) || /\b(bao nhieu|top \d+|nao)\b/.test(f) || (words.length >= 4 && !navs.length);   // khớp tên màn → màn lên đầu
    const ask = v.length >= 4 ? [{ k: 'ask', q: v, title: `Hỏi trợ lý: «${v}»`, sub: 'Trả lời bằng số liệu trong app (công nợ, doanh số, giỏ hàng, bàn giao, việc cần làm…)' }] : [];
    items = [...(question ? ask : []), ...(navs.length ? [{ h: 'Màn hình' }, ...navs] : [])];
    if (v.length >= 2) {
      let res = []; try { res = await api('GET', '/api/search?q=' + encodeURIComponent(v)); } catch { }
      if (my !== seq) return;   // đã gõ tiếp
      if (res.length) items.push({ h: 'Hồ sơ' }, ...res.map(r => ({ k: 'rec', ...r })));
    }
    if (!question) items.push(...ask);
    draw();
  }, 200);
  box.onclick = e => { const a = e.target.closest('[data-i]'); if (a) { e.preventDefault(); go(items[+a.dataset.i]); } };
  inp.onkeydown = e => {
    const idx = items.map((x, i) => x.h ? -1 : i).filter(i => i >= 0);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const k = idx.indexOf(cur); cur = idx[Math.max(0, Math.min(idx.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1)))] ?? -1; mark(); $('[data-i].on', box)?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { e.preventDefault(); const x = items[cur] && !items[cur].h ? items[cur] : items.find(y => !y.h); if (x) go(x); }
    if (e.key === 'Escape') { box.classList.add('hidden'); inp.blur(); }
  };
  // phím tắt: «/» hoặc Ctrl+K → ô tìm (không bắt khi đang gõ trong ô nhập khác)
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); inp.focus(); inp.select(); }
  });
}
async function route() {
  if (ST.skipRoute) { ST.skipRoute = 0; return; }   // 17/11/2026: quay lại trang đang sửa sau khi người dùng chọn ở lại
  if (ST.dirtyMsg && location.hash !== ST.dirtyHash) { if (!confirm(ST.dirtyMsg)) { ST.skipRoute = 1; location.hash = ST.dirtyHash; return; } ST.dirtyMsg = null; }
  closeDetail(); document.body.classList.remove('nav-open'); ST.reload = null; checkVer();
  const tok = ST.nav = (ST.nav || 0) + 1;   // màn cũ còn tải dở mà người dùng đã chuyển màn: bỏ qua lỗi của nó
  const h = location.hash.slice(1) || homeHash().slice(1);
  const [p, qs] = h.split('?'); const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const [, kind, name] = p.split('/');
  const main = $('#main'); if (!main) return;
  main.onclick = main.onchange = main.onkeydown = null; main.innerHTML = '<div class="empty">Đang tải…</div>';
  const navId = kind === 'e' ? ({ project: 'projects', building: 'projects', unit: 'products', cancel_req: 'payouts', receipt: 'vouchers', payment: 'vouchers' }[name] || 'e:' + name + (params.group ? '?group=' + params.group : '')) : name === 'unit360' || name === 'cust360' ? 'lookup' : name === 'pricesheet' ? 'e:price_policy' : name === 'hoso' ? 'vault' : name === 'debtsum' || name === 'ctdebt' ? 'loantrack' : name === 'debtunit' || name === 'unitstatus' ? 'duedebt' : name;
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navId));
  { const n = navList().find(x => x.id === navId); if (n && !params.id) recentAdd({ k: 'nav', hash: n.hash, title: n.title, sub: n.sub }); }   // 17/11/2026: «Gần đây» ở ô tìm
  const on = $(`[data-nav="${navId}"]`); $$('.mod').forEach(m => m.classList.remove('cur'));
  if (on) { on.closest('.mod').classList.add('open', 'cur'); }
  try {
    if (kind === 'e' && name === 'noxh_check' && M.piiRoles.includes(M.me.role)) await V.mau4(main, params);
    else if (kind === 'e' && (name === 'receipt' || name === 'payment')) await V.vouchers(main, { ...params, tab: name });   // gộp 1 màn Phiếu thu – Phiếu chi (06/11/2026)
    else if (kind === 'e' && name === 'template' && params.view !== 'list') await V.tpltree(main, params);   // Mẫu biểu = cây thư mục theo module (12/11/2026); ?view=list = bảng cũ
    else if (kind === 'e' && name === 'cancel_req') await V.payouts(main, params);   // bỏ màn «Hủy giao dịch – đổi căn» 28/10/2026 — đề nghị hủy / đổi căn xem ở Theo dõi thanh lý & chi trả   // Hồ sơ mua NOXH hiện theo bảng tổng hợp Mẫu 4
    else if (kind === 'e' && name === 'collect_plan') await planWeek(main);   // 17/11/2026: Kế hoạch thu tuần/tháng — màn riêng (biểu đồ + báo cáo), không còn bảng danh sách
    else if (kind === 'e' && M.ents[name]) { await listView(main, name, params);
      }
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
// ô ngày phát change ngay khi năm mới gõ dở (0002) — chỉ nhận khi năm đã đủ
const okDay = v => /^(20\d\d|2100)-/.test(v);
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
    $('.mb', m.el).insertAdjacentHTML('afterend', `<div class="mf"><button class="btn" id="dx">${ico('fa-file-excel')} Xuất file</button><button class="btn pri" data-x>Đóng</button></div>`);
    $('[data-x]', $('.mf', m.el)).onclick = m.close;
    $('#dx', m.el).onclick = () => download('/api/export-rows', { title: d.title, cols: d.cols, rows: d.rows, sum: d.sum, file: key.replace(/\W+/g, '_') });
    m.body.onclick = e => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const r = d.rows[+tr.dataset.i]; m.close(); openRow(r); };
  } catch (e) { m.body.innerHTML = `<div class="errbar">${esc(e.message)}</div>`; }
}
function openRow(r) { if (r._ent) openDetail(r._ent[0], r._ent[1]); else if (r.contract_id) openDetail('contract', r.contract_id, 'debt'); else if (r.unit_id) location.hash = `#/v/unit360?id=${r.unit_id}`; else if (r.ent) openDetail(r.ent, r.id); }
// groups: nhãn nhóm từng cột ('' = không nhóm) → 2 tầng tiêu đề: cột cùng nhóm liền nhau chung 1 ô nhóm, cột không nhóm gộp dọc
// cell(c, r): trả HTML riêng cho 1 ô (vd. ô nhập), undefined = định dạng thường
function rowsTable(cols, rows, sum, { click = true, no = '#', groups, cell } = {}) {
  if (!rows.length) return '<div class="empty">Không có dữ liệu</div>';
  const f = (c, v) => c[2] === 'money' ? fm(v) : c[2] === 'num' ? fnum(v) : c[2] === 'int' ? (v ?? '') : c[2] === 'date' ? dmy(v) : c[2] === 'dt' ? dmyhm(v) : esc(v ?? '');
  const isN = c => ['money', 'num', 'int'].includes(c[2]);
  const WRAP = new Set(['text', 'content', 'reason', 'note', 'extra', 'title', 'descr', 'promise', 'status']);
  const g2 = groups?.some(Boolean), th = (c, a = '') => `<th ${a} class="${isN(c) ? 'num' : ''}">${esc(c[1])}</th>`, span = i => { let n = 0; while (groups[i + n] === groups[i]) n++; return n; };
  const thead = !g2 ? `<tr><th>${esc(no)}</th>${cols.map(c => th(c)).join('')}</tr>`
    : `<tr class="h1"><th rowspan="2">${esc(no)}</th>${cols.map((c, i) => !groups[i] ? th(c, 'rowspan="2"') : groups[i] !== groups[i - 1] ? `<th colspan="${span(i)}">${esc(groups[i])}</th>` : '').join('')}</tr><tr>${cols.filter((c, i) => groups[i]).map(c => th(c)).join('')}</tr>`;
  return `<div class="tbl-wrap"><table class="t compact ${g2 ? 'hd2 grid-bravo' : ''} ${click ? '' : 'noclick'}"><thead>${thead}</thead><tbody>${rows.map((r, i) => `<tr data-i="${i}"><td class="muted">${i + 1}</td>${cols.map(c => `<td class="${isN(c) ? 'num' : ''} ${WRAP.has(c[0]) ? 'wrap' : ''} ${c[2] === 'money' && c[0] === 'gap' ? (r[c[0]] < 0 ? 'neg' : 'pos') : ''}">${cell?.(c, r) ?? f(c, r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody>
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
          const segs = [['con_ban', b.con_ban, '#7DBF9B'], ['giu_cho', b.giu_cho, '#F5A623'], ['da_ky', b.da_ky, '#2A4F8A'], ['da_ban_giao', b.da_ban_giao, '#0f766e']];
          return `<div class="mb" data-drill="building:${b.building_id}" style="cursor:pointer"><div class="row"><b>${esc(b.project)} · Tòa ${esc(b.building)}</b><span class="grow"></span><span class="small muted">${b.total} căn · tiêu thụ ${fnum(b.rate)}%</span></div><div class="stack mt">${segs.map(s => `<i style="width:${b.total ? s[1] / b.total * 100 : 0}%;background:${s[2]}" title="${s[1]}"></i>`).join('')}</div><div class="small muted mt">Còn bán ${b.con_ban} · giữ chỗ/cọc ${b.giu_cho} · đã ký ${b.da_ky} · đã bàn giao ${b.da_ban_giao}</div></div>`;
        }).join('') || '<div class="empty">Chưa có sản phẩm</div>'}<div class="legend"><span><b style="background:#7DBF9B"></b>Còn bán</span><span><b style="background:#F5A623"></b>Giữ chỗ / cọc</span><span><b style="background:#2A4F8A"></b>Đã ký HĐ</span><span><b style="background:#0f766e"></b>Đã bàn giao</span></div></div></div>
        <div class="card"><div class="hd"><h3>${ico('fa-list-check')} Tiến độ hồ sơ – hợp đồng – bàn giao</h3></div><div class="bd"><div class="grid g3">
          ${[['noxh:nhap,tu_choi', 'Hồ sơ NOXH đang xử lý', d.progress.noxh_open], ['noxh:cho_duyet', 'Hồ sơ chờ xét duyệt', d.progress.noxh_review], ['noxh:da_duyet', 'Hồ sơ đạt', d.progress.noxh_ok],
             ['contracts:du_thao,tu_choi,cho_duyet', 'HĐ dự thảo / rà soát', d.progress.ct_draft + d.progress.ct_review], ['contracts:cho_ky', 'HĐ chờ ký', d.progress.ct_wait], ['contracts:da_ky', 'HĐ đã ký', d.progress.ct_signed],
             ['handover:ready', 'Đủ ĐK, chưa lập lịch bàn giao', d.progress.ho_ready], ['handover:da_moi,da_hen', 'Đã mời bàn giao', d.progress.ho_invited], ['handover:not', 'Đã ký, chưa bàn giao', d.progress.ho_not],
          ].map(([key, l, v]) => `<div class="cat-tile" data-drill="${key}"><b>${v}</b><span class="small">${l}</span></div>`).join('')}</div></div></div>
      </div>
      <div class="card mt"><div class="hd"><h3>${ico('fa-bell')} Cảnh báo tồn đọng</h3><span class="grow"></span><a href="#/v/alerts">Xem tất cả →</a></div><div class="bd"><div class="grid g4">${d.alerts.sort((a, b) => b.red - a.red || b.n - a.n).map(a => `<div class="cat-tile ${a.red ? 'red' : ''}" data-drill="alerts:${a.cat}"><b>${a.n}</b><span class="small">${esc(a.label)}${a.red ? ` <span class="pill r">${a.red} khẩn</span>` : ''}</span></div>`).join('') || '<div class="muted">Không có tồn đọng</div>'}</div></div></div>`;
    const ser = d.series.map(x => ({ ...x, label: x.m.slice(5) + '/' + x.m.slice(2, 4) }));
    $('#c1', main).append(barChart(ser, [{ k: 'signed', l: 'Doanh số ký', c: '#2A4F8A' }], { line: { k: 'target_sales', l: 'Chỉ tiêu', c: '#F5A623' }, onClick: r => drill('revenue:' + r.m, f) }));
    $('#c2', main).append(barChart(ser, [{ k: 'plan', l: 'Kế hoạch (đã duyệt)', c: '#C9D6EB' }, { k: 'actual', l: 'Thực thu (Bravo)', c: '#7DBF9B' }], { line: { k: 'target_collect', l: 'Chỉ tiêu thu', c: '#F5A623' }, onClick: r => drill('collected:' + r.m, f) }));
    main.onclick = e => { const t = e.target.closest('[data-drill]'); if (t) { e.preventDefault(); drill(t.dataset.drill, f); } };
  };
  await draw();
};

// ======================= CẢNH BÁO / PHÊ DUYỆT =======================
// ===== Việc của tôi (06/11/2026): lời chào theo buổi, thời tiết hôm nay, việc cần làm — trang mở đầu mặc định khi mở app =====
const WX_CITY = [['bac_ninh', 'Bắc Ninh', 21.186, 106.076], ['ha_noi', 'Hà Nội', 21.028, 105.854], ['hung_yen', 'Hưng Yên', 20.646, 106.051], ['hai_phong', 'Hải Phòng', 20.845, 106.688],
  ['thai_nguyen', 'Thái Nguyên', 21.594, 105.848], ['vinh_phuc', 'Vĩnh Phúc', 21.309, 105.605], ['da_nang', 'Đà Nẵng', 16.054, 108.202], ['hcm', 'TP Hồ Chí Minh', 10.776, 106.701]];
// mã thời tiết WMO → [mô tả, icon ban ngày, icon ban đêm]
const wxOf = c => c === 0 ? ['Trời quang', 'fa-sun', 'fa-moon'] : c <= 2 ? ['Ít mây', 'fa-cloud-sun', 'fa-cloud-moon'] : c === 3 ? ['Nhiều mây', 'fa-cloud', 'fa-cloud'] : c <= 48 ? ['Sương mù', 'fa-smog', 'fa-smog']
  : c <= 57 ? ['Mưa phùn', 'fa-cloud-rain', 'fa-cloud-rain'] : c <= 65 ? [c >= 65 ? 'Mưa to' : 'Mưa', 'fa-cloud-rain', 'fa-cloud-rain'] : c <= 67 ? ['Mưa lạnh', 'fa-cloud-rain', 'fa-cloud-rain']
  : c <= 77 ? ['Tuyết / mưa đá', 'fa-snowflake', 'fa-snowflake'] : c <= 82 ? [c >= 81 ? 'Mưa rào to' : 'Mưa rào', 'fa-cloud-showers-heavy', 'fa-cloud-showers-heavy'] : c <= 86 ? ['Mưa tuyết', 'fa-snowflake', 'fa-snowflake'] : ['Dông, sét', 'fa-cloud-bolt', 'fa-cloud-bolt'];
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
async function wxLoad(force) {
  const key = lsGet('ctg-kd-wx-city') || 'bac_ninh';
  let at = WX_CITY.find(c => c[0] === key);
  if (key === 'gps') { const g = JSON.parse(lsGet('ctg-kd-wx-gps') || 'null'); at = g ? ['gps', 'Vị trí hiện tại', g[0], g[1]] : WX_CITY[0]; }
  at ||= WX_CITY[0];
  const ck = 'ctg-kd-wx:' + at[0] + ':' + at[2] + ',' + at[3];
  try { const c = JSON.parse(sessionStorage.getItem(ck) || 'null'); if (!force && c && Date.now() - c.t < 30 * 60e3) return { at, d: c.d }; } catch { }
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${at[2]}&longitude=${at[3]}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day`
    + `&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset&timezone=Asia%2FBangkok&forecast_days=2`;
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetch(u, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); const d = await r.json(); try { sessionStorage.setItem(ck, JSON.stringify({ t: Date.now(), d })); } catch { } return { at, d }; }
  finally { clearTimeout(tm); }
}
const wxHtml = ({ at, d }) => {
  const c = d.current, dl = d.daily, [desc, iD, iN] = wxOf(c.weather_code), now = c.time.slice(0, 13);
  const hrs = d.hourly.time.map((t, i) => ({ t, temp: d.hourly.temperature_2m[i], code: d.hourly.weather_code[i], p: d.hourly.precipitation_probability[i] })).filter(h => h.t.slice(0, 13) >= now).filter((h, i) => i % 3 === 0).slice(0, 6);
  const rain = dl.precipitation_probability_max[0] ?? 0, tmax = dl.temperature_2m_max[0], tmin = dl.temperature_2m_min[0], uv = dl.uv_index_max[0];
  const tips = [rain >= 60 ? [`Khả năng mưa ${rain}% — nhớ mang ô khi đi gặp khách / ra dự án`, 'fa-umbrella'] : rain >= 30 ? [`Có thể có mưa (${rain}%)`, 'fa-umbrella'] : null,
    tmax >= 35 ? ['Nắng nóng — uống đủ nước, hạn chế ra công trường buổi trưa', 'fa-temperature-half'] : tmin <= 15 ? ['Trời lạnh — mặc ấm khi ra ngoài', 'fa-temperature-half'] : null,
    uv >= 8 ? [`Chỉ số UV cao (${Math.round(uv)}) — che nắng khi dẫn khách xem nhà mẫu`, 'fa-sun'] : null].filter(Boolean);
  return `<div class="wx-now"><i class="fa-solid ${c.is_day ? iD : iN} wx-ic"></i><div><div class="wx-t">${Math.round(c.temperature_2m)}°</div><div class="wx-d">${esc(desc)}</div></div>
      <div class="wx-meta"><span>${ico('fa-temperature-half')} Cao ${Math.round(tmax)}° · Thấp ${Math.round(tmin)}°</span><span>${ico('fa-droplet')} Độ ẩm ${c.relative_humidity_2m}% · Mưa ${rain}%</span><span>${ico('fa-wind')} Gió ${Math.round(c.wind_speed_10m)} km/h · Cảm giác ${Math.round(c.apparent_temperature)}°</span></div></div>
    <div class="wx-hrs">${hrs.map(h => `<div><small>${h.t.slice(11, 13)}h</small><i class="fa-solid ${wxOf(h.code)[+h.t.slice(11, 13) >= 6 && +h.t.slice(11, 13) < 18 ? 1 : 2]}"></i><b>${Math.round(h.temp)}°</b>${h.p >= 30 ? `<small class="wx-p">${h.p}%</small>` : '<small>&nbsp;</small>'}</div>`).join('')}</div>
    ${tips.length ? `<div class="wx-tips">${tips.map(([t, i]) => `<div>${ico(i)} ${esc(t)}</div>`).join('')}</div>` : ''}
    <div class="wx-src">Nguồn: Open-Meteo · ${esc(at[1])}</div>`;
};
// 17/11/2026: home «Việc của tôi» thiết kế lại theo mẫu dashboard thẻ mềm (lời chào + nút tròn, 4 thẻ KPI có ô biểu tượng, biểu đồ việc theo ngày,
// danh sách việc cần làm kiểu «hoạt động», cột phải: lịch ký · lịch tháng · thời tiết) — giữ màu của app
V.myday = async main => {
  const me = M.me, first = String(me.full_name || '').split(/\s[–-]\s/)[0].trim().split(/\s+/).slice(-1)[0] || '';   // «Nguyễn Thị Thư» → Thư; bỏ phần sau « – »
  const DOW = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const greet = () => { const h = new Date().getHours(); return h < 11 ? ['Chào buổi sáng', 'fa-mug-hot'] : h < 13 ? ['Chào buổi trưa', 'fa-sun'] : h < 18 ? ['Chào buổi chiều', 'fa-cloud-sun'] : ['Chào buổi tối', 'fa-moon']; };
  const clock = () => { const d = new Date(); return `${DOW[d.getDay()]}, ${dmy(today())} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const city = lsGet('ctg-kd-wx-city') || 'bac_ninh';
  const [g, gi] = greet();
  const QUICK = [['vouchers', 'Phiếu thu – Phiếu chi', 'fa-file-invoice-dollar'], ['board', 'Bảng hàng', 'fa-table-cells'], ['loantrack', 'Theo dõi công nợ', 'fa-file-contract'],
    ['signing', 'Lịch ký', 'fa-calendar-check'], ['approvals', 'Hộp phê duyệt', 'fa-inbox'], ['dashboard', 'Dashboard', 'fa-gauge-high'], ['e:customer', 'Khách hàng', 'fa-users']];
  const okNav = new Set(M.menu.flatMap(m => m[3].map(x => x[0])));
  const quick = QUICK.filter(q => okNav.has(q[0]));
  const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const pd = s => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
  const plus = (s, k) => { const x = pd(s); x.setDate(x.getDate() + k); return iso(x); };
  main.innerHTML = `<div class="page hm">
    <div class="hm-top"><div><div class="hm-eb">${ico(gi)} <span id="mdClock">${clock()}</span></div><h1 id="mdGreet">${g}${first ? ', ' + esc(first) : ''}!</h1>
        <div class="hm-sub" id="mdSub">Đang tổng hợp việc hôm nay…</div></div>
      <div class="hm-qa" id="mdQuick">${quick.map(([id, l, ic]) => `<a class="hm-rb" href="${id.startsWith('e:') ? '#/e/' + id.slice(2) : '#/v/' + id}" title="${esc(l)}" aria-label="${esc(l)}" data-q="${id}">${ico(ic)}</a>`).join('')}</div></div>
    <div class="hm-kpis" id="mdK">${'<div class="hm-k sk"></div>'.repeat(4)}</div>
    <div class="hm-grid">
      <div class="hm-main">
        <section class="hm-card hm-chart"><div class="hm-hd"><h3>Việc theo ngày</h3><span class="grow"></span>
            <select id="mdRange" class="hm-sel" aria-label="Khoảng thời gian"><option value="next">7 ngày tới</option><option value="prev">7 ngày qua</option></select></div>
          <div class="hm-leg"><span><i style="background:#2D7DD2"></i>Việc đến hạn</span><span><i style="background:#D4850F"></i>Lịch ký hợp đồng</span></div>
          <div id="mdChart" class="hm-plot"><div class="empty">Đang tải…</div></div></section>
        <section class="hm-card hm-act"><div class="hm-hd"><h3>Việc cần làm</h3><span class="grow"></span><a href="#/v/alerts" class="hm-pill">Xem tất cả</a></div><div id="mdTodo"><div class="empty">Đang tải…</div></div></section>
      </div>
      <aside class="hm-side">
        <section class="hm-card hm-t-rose"><div class="hm-hd"><h3>Lịch ký 7 ngày tới</h3><span class="grow"></span><a href="#/v/signing" class="hm-plus" title="Lịch ký" aria-label="Mở Lịch ký">${ico('fa-arrow-right')}</a></div><div id="mdSign"><div class="empty">Đang tải…</div></div></section>
        <section class="hm-card hm-t-blue"><div class="hm-hd"><h3>Lịch</h3><span class="grow"></span><button type="button" class="hm-pill" id="calToday">Hôm nay</button></div><div id="mdCal"></div><div id="mdDay" class="hm-day"></div></section>
        <section class="hm-card hm-t-amber hm-wx"><div class="hm-hd"><h3>${ico('fa-cloud-sun')} Thời tiết</h3><span class="grow"></span>
            <select id="wxCity" class="hm-sel">${WX_CITY.map(c => `<option value="${c[0]}" ${city === c[0] ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}<option value="gps" ${city === 'gps' ? 'selected' : ''}>Vị trí hiện tại</option></select></div>
          <div id="wxBox"><div class="empty">Đang lấy thời tiết…</div></div></section>
      </aside></div></div>`;
  const tick = setInterval(() => { const el = $('#mdClock'); if (!el || !document.body.contains(el)) return clearInterval(tick); el.textContent = clock(); const [g2] = greet(); $('#mdGreet').textContent = `${g2}${first ? ', ' + first : ''}!`; }, 30e3);
  const wx = async force => { const box = $('#wxBox', main); try { box.innerHTML = wxHtml(await wxLoad(force)); } catch (e) { box.innerHTML = `<div class="empty">Chưa lấy được thời tiết (cần kết nối Internet). <a href="#" id="wxRe">Thử lại</a></div>`; } };
  $('#wxCity', main).onchange = async e => {
    const v = e.target.value;
    if (v === 'gps') {
      if (!navigator.geolocation) { toast('Trình duyệt không hỗ trợ lấy vị trí', true); return; }
      navigator.geolocation.getCurrentPosition(p => { lsSet('ctg-kd-wx-gps', JSON.stringify([+p.coords.latitude.toFixed(3), +p.coords.longitude.toFixed(3)])); lsSet('ctg-kd-wx-city', 'gps'); wx(true); },
        () => { toast('Không lấy được vị trí — chọn tỉnh / thành trong danh sách', true); e.target.value = lsGet('ctg-kd-wx-city') || 'bac_ninh'; }, { timeout: 10000 });
      return;
    }
    lsSet('ctg-kd-wx-city', v); await wx(true);
  };
  let al = [], d = null, calM = today().slice(0, 7), selDay = null;
  const go = a => { if (a.ent) openDetail(a.ent, a.id); else if (a.unit_id) location.hash = `#/v/unit360?id=${a.unit_id}`; else if (a.cat === 'ke_hoach') location.hash = '#/e/collect_plan'; };
  main.onclick = e => {
    if (e.target.closest('#wxRe')) { e.preventDefault(); return wx(true); }
    const r = e.target.closest('[data-ai]'); if (r) return go(al[+r.dataset.ai]);
    const s = e.target.closest('[data-sg]'); if (s) return openDetail(s.dataset.sg.split(':')[0], +s.dataset.sg.split(':')[1]);
    const nv = e.target.closest('[data-cm]'); if (nv) { const [y, m] = calM.split('-').map(Number); calM = iso(new Date(y, m - 1 + +nv.dataset.cm, 1)).slice(0, 7); return cal(); }
    if (e.target.closest('#calToday')) { calM = today().slice(0, 7); selDay = today(); return cal(); }
    const dd = e.target.closest('[data-cd]'); if (dd) { selDay = selDay === dd.dataset.cd ? null : dd.dataset.cd; return cal(); }
  };
  main.onkeydown = e => { if (e.key === 'Enter' && e.target.matches('[data-ai],[data-sg]')) e.target.click(); };
  wx();
  try { d = await api('GET', '/api/my-day'); } catch (e) { $('#mdSub', main).textContent = 'Chưa tải được việc hôm nay: ' + e.message; return; }
  al = d.alerts;
  const T = d.today, n = l => al.filter(a => a.lvl === l).length, todaySign = d.signing.filter(x => x.plan_sign === T).length;
  const dayDiff = x => Math.round((pd(x) - pd(T)) / 864e5);
  $('#mdSub', main).innerHTML = !al.length && !d.signing.length ? 'Hôm nay chưa có việc tồn đọng nào — chúc một ngày làm việc hiệu quả!'
    : `Hôm nay có <b>${n('r')}</b> việc gấp, <b>${n('a')}</b> việc cần làm${d.approvals ? `, <b>${d.approvals}</b> hồ sơ chờ bạn duyệt` : ''}${todaySign ? `, <b>${todaySign}</b> lịch ký hợp đồng` : ''}.`;
  if (d.approvals) { const b = $('[data-q="approvals"]', main); b && b.insertAdjacentHTML('beforeend', `<span class="hm-badge">${d.approvals > 99 ? '99+' : d.approvals}</span>`); }
  // 4 thẻ KPI — ô biểu tượng khối + số + dòng phụ màu theo thẻ
  const tile = (cls, ic, l, v, sub, href) => `<a class="hm-k ${cls}" href="${href}"><span class="hm-ki">${ico(ic)}</span><div><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub}</div></div></a>`;
  $('#mdK', main).innerHTML = tile('k-red', 'fa-fire', 'Việc gấp', n('r'), 'quá hạn, cần xử lý ngay', '#/v/alerts') + tile('k-amber', 'fa-list-check', 'Việc cần làm', n('a'), 'sắp đến hạn', '#/v/alerts')
    + tile('k-blue', 'fa-inbox', 'Chờ tôi duyệt', d.approvals, 'trong Hộp phê duyệt', '#/v/approvals') + tile('k-green', 'fa-calendar-check', 'Lịch ký 7 ngày', d.signing.length, todaySign ? `${todaySign} lịch hôm nay` : 'không có lịch hôm nay', '#/v/signing');
  // biểu đồ đường: số việc đến hạn + số lịch ký theo từng ngày (7 ngày tới / 7 ngày qua)
  const chart = () => {
    const prev = $('#mdRange', main).value === 'prev', days = [...Array(7)].map((_, i) => plus(T, prev ? i - 6 : i));
    const A = days.map(x => al.filter(a => a.due === x).length), S = days.map(x => d.signing.filter(s => s.plan_sign === x).length);
    const box = $('#mdChart', main); if (!box) return; const W = Math.max(300, box.clientWidth || 640), H = 250, L = 34, R = 26, TP = 16, B = 44, top = Math.ceil(Math.max(4, ...A, ...S) / 4) * 4, step = (W - L - R) / 6;
    const X = i => L + i * step, Y = v => TP + (H - TP - B) * (1 - v / top);
    const line = (vs, c) => `<path d="${vs.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      + vs.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="4.5" fill="${c}" stroke="#fff" stroke-width="2"/>`).join('');
    const area = `<path d="M${X(0)},${Y(0)}${A.map((v, i) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}L${X(6)},${Y(0)}Z" fill="url(#hmG)"/>`;
    const dl = x => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][pd(x).getDay()];
    const pk = A.indexOf(Math.max(...A));
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Biểu đồ số việc đến hạn và lịch ký theo ngày"><defs><linearGradient id="hmG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2D7DD2" stop-opacity=".16"/><stop offset="1" stop-color="#2D7DD2" stop-opacity="0"/></linearGradient></defs>
      ${[0, 1, 2, 3, 4].map(k => { const v = top * k / 4; return `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e6ebf2"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" class="hm-ax">${v}</text>`; }).join('')}
      ${days.map((x, i) => `<text x="${X(i)}" y="${H - 22}" text-anchor="middle" class="hm-ax${x === T ? ' on' : ''}">${x === T ? 'Hôm nay' : dl(x)}<tspan x="${X(i)}" dy="15">${x.slice(8)}/${+x.slice(5, 7)}</tspan></text>`).join('')}
      <line class="hm-cross" y1="${TP}" y2="${H - B}" stroke="#94a3b8" stroke-dasharray="3 3" style="display:none"/>
      ${area}${line(S, '#D4850F')}${line(A, '#2D7DD2')}
      ${days.map((x, i) => `<rect x="${X(i) - step / 2}" y="${TP}" width="${step}" height="${H - TP - B}" fill="transparent" data-hi="${i}"/>`).join('')}</svg>
      ${A[pk] > 0 ? `<div class="hm-bub" style="left:${(X(pk) / W * 100).toFixed(1)}%;top:${(Y(A[pk]) / H * 100).toFixed(1)}%">Nhiều việc nhất: ${A[pk]}</div>` : ''}
      ${A.every(v => !v) && S.every(v => !v) ? `<div class="hm-zero">${ico('fa-mug-hot')} Không có việc đến hạn hay lịch ký trong ${prev ? '7 ngày qua' : '7 ngày tới'}</div>` : ''}<div class="hm-tip" hidden></div>`;
    const svg = $('#mdChart svg', main), tip = $('#mdChart .hm-tip', main), cr = $('.hm-cross', svg);
    svg.onmousemove = e => { const r = e.target.closest('[data-hi]'); if (!r) return; const i = +r.dataset.hi;
      cr.style.display = ''; cr.setAttribute('x1', X(i)); cr.setAttribute('x2', X(i));
      tip.hidden = false; tip.style.left = (X(i) / W * 100) + '%'; tip.innerHTML = `<b>${DOW[pd(days[i]).getDay()]}, ${dmy(days[i])}</b><div><i style="background:#2D7DD2"></i>Việc đến hạn <b>${A[i]}</b></div><div><i style="background:#D4850F"></i>Lịch ký <b>${S[i]}</b></div>`; };
    svg.onmouseleave = () => { cr.style.display = 'none'; tip.hidden = true; };
  };
  $('#mdRange', main).onchange = chart; chart();
  if (window.ResizeObserver) { let w0 = 0; const ro = new ResizeObserver(([e]) => { if (!document.body.contains(main.querySelector('#mdChart'))) return ro.disconnect(); const w = Math.round(e.contentRect.width); if (w && Math.abs(w - w0) > 8) { w0 = w; chart(); } }); ro.observe($('#mdChart', main)); }
  // việc cần làm — dạng «hoạt động»: ô biểu tượng theo nhóm, mốc hạn bên phải
  const CI = { phe_duyet: 'fa-inbox', giu_cho: 'fa-hourglass-half', noxh: 'fa-folder-open', ky_hd: 'fa-file-signature', no_qua_han: 'fa-sack-dollar', den_han: 'fa-coins', cam_ket: 'fa-handshake',
    lien_he: 'fa-phone', ban_giao: 'fa-key', ton_tai: 'fa-screwdriver-wrench', so_hong: 'fa-book', cskh: 'fa-comments', ke_hoach: 'fa-clipboard-list' };
  const when = a => { if (!a.due) return ''; const k = dayDiff(a.due); return k < 0 ? `quá ${-k} ngày` : k === 0 ? 'hôm nay' : `còn ${k} ngày`; };
  $('#mdTodo', main).innerHTML = al.length ? `<div class="hm-list">${al.slice(0, 30).map((a, i) => `<div class="hm-row" data-ai="${i}" tabindex="0"><span class="hm-ri l-${a.lvl}">${ico(CI[a.cat] || 'fa-bell')}</span>
      <div class="tx"><div>${esc(a.text)}</div><div class="small muted">${esc(M.alertCat[a.cat] || '')}${a.who ? ' · ' + esc(a.who) : ''}</div></div><span class="hm-when ${a.lvl === 'r' ? 'r' : ''}">${when(a)}</span></div>`).join('')}</div>
      ${al.length > 30 ? `<div class="small muted hm-more">Còn ${al.length - 30} việc nữa — <a href="#/v/alerts">xem tất cả</a></div>` : ''}` : `<div class="empty">${ico('fa-circle-check')} Không có việc tồn đọng</div>`;
  // lịch ký 7 ngày — dạng danh sách ô tích như To-Do
  $('#mdSign', main).innerHTML = d.signing.length ? `<div class="hm-chk">${d.signing.slice(0, 8).map(x => `<div class="hm-ck" data-sg="${x.ent}:${x.id}" tabindex="0"><span class="bx ${x.plan_sign === T ? 'on' : ''}">${x.plan_sign === T ? ico('fa-pen-nib') : ''}</span>
      <div class="tx"><div><b>${x.plan_sign === T ? 'Hôm nay' : dmy(x.plan_sign).slice(0, 5)}</b> · ${esc(x.unit || '')} · ${esc(x.customer || '')}</div><div class="small muted">${esc([x.number, x.kind_l, x.sign_place].filter(Boolean).join(' · '))}</div></div></div>`).join('')}</div>
      ${d.signing.length > 8 ? `<div class="small muted hm-more"><a href="#/v/signing">+${d.signing.length - 8} lịch khác</a></div>` : ''}` : `<div class="hm-none">${ico('fa-calendar')} Không có lịch ký trong 7 ngày tới</div>`;
  // lịch tháng — chấm theo ngày có việc đến hạn / lịch ký; bấm ngày xem việc của ngày đó
  const cal = () => {
    const [y, m] = calM.split('-').map(Number), off = (new Date(y, m - 1, 1).getDay() + 6) % 7, nd = new Date(y, m, 0).getDate();
    const rows = [...Array(Math.ceil((off + nd) / 7) * 7)].map((_, i) => iso(new Date(y, m - 1, i - off + 1)));
    const dot = x => { const a = al.filter(z => z.due === x), s = d.signing.some(z => z.plan_sign === x); return (a.some(z => z.lvl === 'r') ? '<i class="r"></i>' : a.length ? '<i class="a"></i>' : '') + (s ? '<i class="s"></i>' : ''); };
    $('#mdCal', main).innerHTML = `<div class="hm-cm"><button type="button" data-cm="-1" aria-label="Tháng trước">${ico('fa-chevron-left')}</button><b>Tháng ${m}/${y}</b><button type="button" data-cm="1" aria-label="Tháng sau">${ico('fa-chevron-right')}</button></div>
      <div class="hm-cg">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w, i) => `<span class="w${i > 4 ? ' we' : ''}">${w}</span>`).join('')}
      ${rows.map((x, i) => `<button type="button" data-cd="${x}" class="${x.slice(0, 7) !== calM ? 'out' : ''}${i % 7 > 4 ? ' we' : ''}${x === T ? ' tdy' : ''}${x === selDay ? ' sel' : ''}">${+x.slice(8)}<span class="dt">${dot(x)}</span></button>`).join('')}</div>`;
    const box = $('#mdDay', main);
    if (!selDay) { box.innerHTML = '<div class="small muted hm-cl"><span><i class="r"></i>việc gấp</span><span><i class="a"></i>đến hạn</span><span><i class="s"></i>lịch ký</span></div>'; return; }
    const a = al.map((z, i) => [z, i]).filter(([z]) => z.due === selDay), s = d.signing.filter(z => z.plan_sign === selDay);
    box.innerHTML = `<div class="hm-dh">${DOW[pd(selDay).getDay()]}, ${dmy(selDay)}</div>` + (a.length || s.length
      ? s.map(x => `<div class="hm-dr" data-sg="${x.ent}:${x.id}"><i class="s"></i>Ký ${esc(x.number || '')} · ${esc(x.unit || '')} · ${esc(x.customer || '')}</div>`).join('')
        + a.slice(0, 6).map(([z, i]) => `<div class="hm-dr" data-ai="${i}"><i class="${z.lvl === 'r' ? 'r' : 'a'}"></i>${esc(z.text)}</div>`).join('') + (a.length > 6 ? `<div class="small muted">+${a.length - 6} việc khác</div>` : '')
      : '<div class="small muted">Không có việc đến hạn / lịch ký</div>');
  };
  cal();
};
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
// Bảng hàng chỉ hiện 3 nhóm màu: Chưa bán (trắng, căn còn trống — gồm căn trả lại sau thanh lý) · Giữ chỗ (cam) · Đã ký HĐMB (xanh)
const BGRP = { chua_mo_ban: 'trong', con_ban: 'trong', giu_cho: 'giu', da_coc: 'giu', da_ky_hd: 'ky', da_ban_giao: 'ky', tam_khoa: 'tam_khoa', ngung_kd: 'ngung_kd' };
const bgOf = u => u.rent ? 'thue' : BGRP[u.status];   // căn có HĐ thuê còn hiệu lực = nhóm Cho thuê
const BGRP_L = { trong: 'Chưa bán', giu: 'Giữ chỗ', ky: 'Đã bán', thue: 'Cho thuê', tam_khoa: 'Tạm khóa', ngung_kd: 'Ngừng KD' };
const USTAT = { con_ban: 'Còn bán', giu_cho: 'Giữ chỗ', da_coc: 'Đã cọc', da_ky_hd: 'Đã ký HĐ', da_ban_giao: 'Đã bàn giao', chua_mo_ban: 'Chưa mở bán', tam_khoa: 'Tạm khóa', ngung_kd: 'Ngừng KD' };
V.board = async (main, params) => {
  const s = ST.board ||= { project: '', building: '', st: '', kind: '' };
  if (params.project) s.project = params.project;
  // tra cứu căn: mã căn (0905, K-0905, CTS-K-0905) hoặc tên khách — căn khớp sáng viền, căn khác mờ
  const norm = v => String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const hitU = u => { const q = norm(s.q).trim(); return !q || norm(u.code).includes(q) || norm(u.code).replace(/-/g, '').includes(q.replace(/-/g, '')) || norm(u.customer).includes(q); };
  const draw = async () => {
    const d = await api('GET', `/api/board?${qsOf({ project: s.project, building: s.building })}`);
    s.project = d.project; s.building = d.building;
    const cnt = {}; d.units.forEach(u => cnt[bgOf(u)] = (cnt[bgOf(u)] || 0) + 1);
    const floors = [...new Set(d.units.map(u => u.floor))].sort((a, b) => a - b);   // 14/11/2026: trình bày từ tầng 1 lên tầng trên cùng
    const kinds = [...new Set(d.units.map(u => u.kind))];
    main.innerHTML = `<div class="page">${head('02', 'Bảng hàng', 'fa-table-cells', M.ents.reservation.perm.c ? `<span class="small muted">Bấm căn còn trống để lập phiếu đăng ký</span>` : '')}
      <div class="card mb"><div class="toolbar" style="border:0"><select id="bp">${d.projects.filter(p => p.n).map(p => `<option value="${p.id}" ${p.id === d.project ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)} (${p.n} căn)</option>`).join('')}</select>
        <select id="bk"><option value="">Mọi loại căn</option>${kinds.map(k => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${esc(M.ents.unit.fields.find(f => f.k === 'kind').o.find(o => o[0] === k)?.[1] || k)}</option>`).join('')}</select>
        <div class="search" style="max-width:300px"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="bq" placeholder="Tra cứu căn: mã căn, tên khách…" value="${esc(s.q || '')}" autocomplete="off"></div><span class="small muted" id="bqN"></span>
        <span class="grow"></span>${d.policy ? `<span class="src">${ico('fa-tags')} Chính sách đang áp dụng: <b>${esc(d.policy.code)}</b> (${dmy(d.policy.start_on)} – ${dmy(d.policy.end_on)})${d.policy.src_file ? ' · ' + esc(d.policy.src_file) : ''}</span>` : '<span class="pill a">Chưa có chính sách giá đang phát hành</span>'}</div>
        <div style="padding:0 14px 12px"><div class="towers">${d.buildings.map(b => `<div class="tower ${b.id === d.building ? 'on' : ''}" data-b="${b.id}"><b>${esc(b.name || 'Tòa ' + b.code)}</b><small>${b.n} căn</small></div>`).join('')}</div></div></div>
      <div class="card"><div class="toolbar"><div class="legend">${Object.entries(BGRP_L).filter(([k]) => cnt[k]).map(([k, l]) => `<span data-st="${k}" style="cursor:pointer;${s.st && s.st !== k ? 'opacity:.4' : ''}"><b class="u g-${k}" style="width:12px;height:12px;min-height:0;padding:0;border-radius:3px"></b>${l} <b style="background:none;width:auto;height:auto;color:var(--ink)">${cnt[k]}</b></span>`).join('')}</div>${s.st ? '<button class="btn sm ghost" data-st="">Bỏ lọc</button>' : ''}<span class="grow"></span><span class="small muted">${d.units.length} căn · ${floors.length} tầng</span></div>
      <div class="bd"><div class="floors">${floors.map(fl => `<div class="floor"><div class="fl">Tầng ${fl}</div><div class="us">${d.units.filter(u => u.floor === fl).map(u => `<div class="u g-${bgOf(u)} ${(s.st && s.st !== bgOf(u)) || (s.kind && s.kind !== u.kind) || !hitU(u) ? 'dim' : ''}${s.q && hitU(u) ? ' hit' : ''}" data-u="${u.id}" title="${esc(u.code)} · ${BGRP_L[bgOf(u)]}${u.rent && u.rent_to ? ' đến ' + dmy(u.rent_to) : ''}${!u.rent && u.res_rent ? ' (đăng ký thuê)' : ''}${u.sale_doc ? ` (bán qua ${u.sale_doc === 'vay' ? 'HĐ vay' : 'HĐ thuê'} — chờ HĐMB)` : ''}${!u.rent && u.rent_ended ? ' · đã hết hạn thuê ' + dmy(u.rent_ended) + ' — bán / cho thuê tiếp được' : ''}${u.cancelled ? ' · đã hủy đăng ký' : ''}${u.customer ? ' · ' + esc(u.customer) : ''}">${u.hold_until ? `<span class="hold">${ico('fa-clock')}</span>` : ''}<b class="no">${esc(u.code.split('-').pop())}</b><div class="sp">${u.bedrooms || ''}PN · ${fnum(u.area_tt)}m²</div><div class="pr">${u.rent && u.rent_amt ? `${fmB(u.rent_amt)}/tháng` : u.res_rent ? `${fmB(u.res_rent)}/tháng` : fmB(u.total_price)}</div><div class="cu">${esc(u.customer || u.direction || '')}</div></div>`).join('')}</div></div>`).join('') || '<div class="empty">Tòa chưa có căn</div>'}</div></div></div></div>`;
    $('#bp', main).onchange = e => { s.project = e.target.value; s.building = ''; draw(); };
    $('#bk', main).onchange = e => { s.kind = e.target.value; draw(); };
    const applyQ = () => {   // lọc tại chỗ, không tải lại
      const n = d.units.filter(u => s.q && hitU(u)).length;
      for (const el of $$('[data-u]', main)) { const u = d.units.find(x => x.id === +el.dataset.u), h = hitU(u); el.classList.toggle('dim', (s.st && s.st !== bgOf(u)) || (s.kind && s.kind !== u.kind) || !h); el.classList.toggle('hit', !!s.q && h); }
      $('#bqN', main).textContent = s.q ? (n ? `${n} căn khớp` : 'Không có ở tòa này — Enter để tìm cả dự án') : '';
      if (s.q && n) $('[data-u].hit', main)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const bq = $('#bq', main); bq.oninput = debounce(() => { s.q = bq.value; applyQ(); }, 150); applyQ();
    bq.onkeydown = run(async e => {
      if (e.key === 'Escape') { bq.value = s.q = ''; return applyQ(); }
      s.q = bq.value; if (e.key !== 'Enter' || !s.q.trim()) return;
      const hits = d.units.filter(hitU);
      if (hits.length === 1) return unitPop(hits[0], draw);
      if (hits.length) return applyQ();
      // không có ở tòa đang xem: tìm trong cả dự án rồi chuyển sang tòa của căn
      const r = (await api('GET', `/api/e/unit?${qsOf({ q: s.q.trim(), project: s.project, limit: 20 })}`)).rows || [];
      const x = r.find(u => d.buildings.some(b => b.id === u.building_id));
      if (!x) return toast(`Không tìm thấy căn «${s.q.trim()}» trong dự án này`, true);
      s.building = x.building_id; await draw(); $('#bq', main)?.focus();
    });
    main.onclick = run(async e => {
      const b = e.target.closest('[data-b]'); if (b) { s.building = b.dataset.b; return draw(); }
      const st = e.target.closest('[data-st]'); if (st) { s.st = s.st === st.dataset.st ? '' : st.dataset.st; return draw(); }
      const u = e.target.closest('[data-u]'); if (u) return unitPop(d.units.find(x => x.id === +u.dataset.u), draw);
    });
  };
  await draw();
};
function unitPop(u, after) {
  const canRes = ['con_ban', 'chua_mo_ban'].includes(u.status) && M.ents.reservation.perm.c;
  const m = modal({ title: `${ico('fa-door-open')} Căn ${esc(u.code)} ${pill(BGRP_L[bgOf(u)], { giu: 'a', ky: 'g', thue: 'v', tam_khoa: 'r' }[bgOf(u)])}`, narrow: true,
    body: `<dl class="kv"><div><dt>Tầng</dt><dd>${u.floor}</dd></div><div><dt>Loại</dt><dd>${u.bedrooms || ''} phòng ngủ</dd></div><div><dt>Diện tích thông thủy</dt><dd>${fnum(u.area_tt)} m²</dd></div><div><dt>Hướng</dt><dd>${esc(u.direction || '')}</dd></div>
      ${u.rent || u.res_rent ? `<div class="wide"><dt>${u.rent ? 'Tiền thuê/tháng' : 'Tiền thuê/tháng dự kiến (phiếu đăng ký thuê)'}</dt><dd><b style="font-size:18px;color:var(--cobalt-d)">${fm(u.rent ? u.rent_amt : u.res_rent)} đ</b>${u.rent && u.rent_to ? ` <span class="small muted">· thuê đến ${dmy(u.rent_to)}</span>` : ''}</dd></div><div><dt>Giá bán căn hộ</dt><dd>${fm(u.total_price)} đ</dd></div>`   /* căn cho thuê / giữ chỗ thuê: tiền thuê lên đầu */
        : `<div class="wide"><dt>Tổng giá căn hộ</dt><dd><b style="font-size:18px;color:var(--cobalt-d)">${fm(u.total_price)} đ</b></dd></div>`}<div><dt>Dự kiến bàn giao</dt><dd>${esc(u.handover_plan || '')}</dd></div><div><dt>Khách hàng</dt><dd>${esc(u.customer || '—')}</dd></div>${u.hold_until ? `<div class="wide"><dt>Hạn giữ chỗ</dt><dd>${dmyhm(u.hold_until)}</dd></div>` : ''}</dl>`,
    foot: `<button class="btn" data-x>Đóng</button><button class="btn" id="u3">${ico('fa-building')} Hồ sơ 360°</button>${canRes ? `<button class="btn" id="urent">${ico('fa-key')} Đăng ký thuê</button><button class="btn pri" id="ures">${ico('fa-hand-holding-hand')} Đăng ký mua</button>` : ''}` });
  $('#urent', m.el) && ($('#urent', m.el).onclick = () => { m.close(); openForm('reservation', { title: `${ico('fa-key')} Phiếu đăng ký thuê căn hộ — ${esc(u.code)}`, preset: { unit_id: u.id, unit_id__l: u.code, deal: 'thue' },
    onSaved: row => { after(); toast('Đã lưu — phiếu đã vào «Đăng ký mua / thuê – giữ chỗ» › Đăng ký thuê (04)'); openDetail('reservation', row.id); } }); });
  $('#u3', m.el).onclick = () => { m.close(); location.hash = `#/v/unit360?id=${u.id}`; };
  $('#ures', m.el) && ($('#ures', m.el).onclick = () => { m.close(); openForm('reservation', { title: `${ico('fa-hand-holding-hand')} Phiếu đăng ký căn hộ — ${esc(u.code)}`, preset: { unit_id: u.id, unit_id__l: u.code, price: u.total_price ?? undefined, unit_value: u.price_net != null ? u.price_net + (u.maint_fee || 0) : undefined, finish_value: u.finish_value ?? undefined },
    onSaved: row => { after(); toast('Đã lưu — phiếu đã vào «Đăng ký mua / thuê – giữ chỗ» › Đăng ký mua (04)'); openDetail('reservation', row.id); } }); });
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
  let D0 = null;   // 15/11/2026: tải dữ liệu 1 lần — gõ tìm / lọc / mở nhóm chỉ lọc trên máy, không tải lại cả danh mục mỗi phím
  const draw = async (fresh) => {
    if (!D0 || fresh === true) D0 = await catalogData();
    const d = D0, q = s.q.trim().toLowerCase();
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
    main.innerHTML = `<div class="page">${head('02', 'Danh mục sản phẩm/căn hộ', 'fa-door-open', `${tplOn('unit') ? `<button class="btn" data-tpls="unit">${ico('fa-file-lines')} Mẫu biểu</button>` : ''}${M.imports.units ? `<button class="btn" id="pImp">${ico('fa-file-import')} Nhập file</button>` : ''}${ue.x ? `<button class="btn" id="pXls">${ico('fa-file-excel')} Xuất file</button>` : ''}${ue.c ? `<button class="btn pri" id="pNew">${ico('fa-plus')} Tạo căn</button>` : ''}`, 'DA-01')}
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
  ST.reload = () => draw(true);
  main.onclick = run(async e => {
    const bl = e.target.closest('[data-bld]'); if (bl) { s.building = s.building === bl.dataset.bld ? '' : bl.dataset.bld; return draw(); }
    const p = e.target.closest('[data-p]'); if (p) { s.building = ''; s.project = s.project === p.dataset.p ? '' : p.dataset.p; return draw(); }
    const g = e.target.closest('tr[data-g]'); if (g) { const id = +g.dataset.g; s.shut.has(id) ? s.shut.delete(id) : s.shut.add(id); return draw(); }
    const u = e.target.closest('tr[data-u]'); if (u) return openDetail('unit', +u.dataset.u);
    if (e.target.closest('#pNew')) return openForm('unit', { preset: { ...(s.project ? { project_id: +s.project } : {}), ...(s.building ? { building_id: +s.building } : {}) }, onSaved: () => draw(true) });
    if (e.target.closest('#pImp')) return importModal('units', () => draw(true));
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
  // 07/11/2026: lưới hiện đủ thông tin theo phiếu khách hàng (cùng thứ tự các ô trên phiếu)
  const CF = Object.fromEntries(M.ents.customer.fields.map(f => [f.k, f]));
  const CC = ['code', 'full_name', 'phone', 'phone2', 'email', 'tax_code', 'bank_account', 'id_no', 'id_date', 'id_place', 'birth', 'address', 'source', 'agent_id', 'interest_project', 'note']
    .filter(k => CF[k]).map(k => [k, CF[k].l]);   // như lưới Bravo, mã trước tên; bỏ cột Tình trạng (03/11/2026) — vẫn lọc được ở ô «Mọi tình trạng»
  let D1 = null;   // 15/11/2026: tải dữ liệu 1 lần — gõ tìm / lọc chỉ lọc trên máy
  const draw = async (fresh) => {
    const get = async e => M.ents[e]?.perm.r ? (await api('GET', `/api/e/${e}?limit=20000${e === 'customer' ? '&group=sau_ban' : ''}`)).rows : [];   // 02 chỉ khách sau mở bán; khách tiềm năng ở 03
    if (!D1 || fresh === true) D1 = await Promise.all([get('customer'), get('unit'), get('contract'), get('reservation'), get('project')]);
    const [cs, us, hd, gc, pj] = D1;
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
    const cellOf = (r, k) => k === 'full_name' ? `${esc(r.full_name)}${r.is_demo ? ' <span class="tag demo">thử</span>' : ''}` : show(CF[k], r);
    main.innerHTML = `<div class="page">${head('02', 'Danh mục khách hàng', 'fa-address-book', `${tplOn('customer') ? `<button class="btn" data-tpls="customer">${ico('fa-file-lines')} Mẫu biểu</button>` : ''}${M.imports.customers ? `<button class="btn" id="kImp">${ico('fa-file-import')} Nhập file</button>` : ''}${ce.x ? `<button class="btn" id="kXls">${ico('fa-file-excel')} Xuất file</button>` : ''}${ce.c ? `<button class="btn pri" id="kNew">${ico('fa-plus')} Tạo khách hàng</button>` : ''}`, 'KH-01')}
      <div class="prod"><div class="card prod-nav"><div class="hd"><h3>${ico('fa-folder-tree')} Nhóm dữ liệu</h3></div><div class="pn">
        <a data-p="" class="${!s.project ? 'on' : ''}">${ico('fa-folder-open')} Tất cả khách hàng <small>${rows.length}</small></a>
        ${pj.map(p => { const n = rows.filter(r => r.pids.has(p.id)).length; return `<a data-p="${p.id}" class="${+s.project === p.id ? 'on' : ''}">${ico('fa-table-list')} ${esc(p.name)} <small>${n || ''}</small></a>`; }).join('')}</div></div>
      <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="kq" placeholder="Tìm tên, mã, căn, điện thoại, địa chỉ…" value="${esc(s.q)}"></div>
        <select id="kst"><option value="">Mọi tình trạng</option>${stO.filter(o => cnt[o[0]]).map(o => `<option value="${o[0]}" ${s.st === o[0] ? 'selected' : ''}>${esc(o[1])} (${cnt[o[0]]})</option>`).join('')}</select>
        <span class="grow"></span><span class="small muted">${list.length} khách hàng</span></div>
      <div class="tbl-wrap"><table class="t cust-t grid-bravo"><thead><tr>${CC.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
      <tbody>${list.map(r => `<tr data-c="${r.id}">${CC.map(([k]) => `<td class="${['address', 'need', 'note'].includes(k) ? 'wrap' : CF[k]?.t === 'money' ? 'num' : ''}">${cellOf(r, k)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${CC.length}"><div class="empty">Không có khách hàng nào${q || s.st ? ' khớp bộ lọc' : ''}</div></td></tr>`}</tbody></table></div></div></div></div>`;
    const inp = $('#kq', main);
    inp.oninput = debounce(() => { s.q = inp.value; draw().then(() => { const i = $('#kq', main); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250);
    $('#kst', main).onchange = e => { s.st = e.target.value; draw(); };
    main._list = list;
  };
  ST.reload = () => draw(true);
  main.onclick = run(async e => {
    const p = e.target.closest('[data-p]'); if (p) { s.project = p.dataset.p; return draw(); }
    const tr = e.target.closest('tr[data-c]'); if (tr) return openDetail('customer', +tr.dataset.c);
    if (e.target.closest('#kNew')) return openForm('customer', { skip: ['kind', 'stage', 'noxh_group', 'owner_id'], preset: { stage: 'da_nop_hsmn', ...(s.project ? { interest_project: +s.project } : {}) }, onSaved: row => { draw(true); openDetail('customer', row.id); } });
    if (e.target.closest('#kImp')) return importModal('customers', () => draw(true));
    if (e.target.closest('#kXls')) return download('/api/export-rows', { title: 'Danh mục khách hàng', cols: CC, rows: main._list.map(r => Object.fromEntries(CC.map(([k]) => [k, show(CF[k], r, { plain: true })]))), file: 'danh_muc_khach_hang' });
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
      <tbody>${rows.map(r => `<tr data-u="${r.unit_id}">${canRes ? `<td class="center">${['con_ban', 'chua_mo_ban'].includes(r.status) ? `<button class="btn sm ok" data-res="${r.unit_id}" data-code="${esc(r.code)}" title="Lập phiếu giữ chỗ">${ico('fa-play')}</button>` : ''}</td>` : ''}${SHEET_COLS.map(c => `<td class="${c[2] ? 'num' : ''} ${c[0] === 'vat' || c[0] === 'tax' ? 'tax' : ''}">${v(r, c)}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr>${canRes ? '<td></td>' : ''}${SHEET_COLS.map((c, i) => `<td class="${c[2] ? 'num' : ''}">${i === 0 ? `Tổng ${rows.length} căn` : SHEET_SUM.includes(c[0]) ? (c[2] === 'money' ? fm : fnum)(rows.reduce((a, r) => a + (+r[c[0]] || 0), 0)) : ''}</td>`).join('')}</tr></tfoot></table>`
      : '<div class="empty">Không có căn nào trong phạm vi chính sách</div>';
    $('#shN', box).textContent = `${rows.length} căn`;
    box._rows = rows;
  };
  box.innerHTML = `<div class="toolbar sheet-bar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="shQ" placeholder="Tìm mã căn…"></div>
    ${blds.length > 1 ? `<select id="shB"><option value="">Mọi tòa</option>${blds.map(b => `<option value="${esc(b)}">Tòa ${esc(b)}</option>`).join('')}</select>` : ''}
    <span class="grow"></span><span class="small muted" id="shN"></span>${!full ? `<a class="btn sm" href="#/v/pricesheet?id=${id}">${ico('fa-expand')} Mở toàn màn hình</a>` : ''}<button class="btn sm" id="shX">${ico('fa-file-excel')} Xuất file</button></div>
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
  if (!params.id) { location.hash = '#/e/price_policy'; return; }   // vào thẳng không có chính sách → về danh sách
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
      <div class="sec-title">${ico('fa-user')} Khách hàng</div>${d.customers.map(k => `<div class="note" data-cust="${k.id}" style="cursor:pointer"><b>${esc(k.full_name)}</b><br><small>${esc(k.phone || '')} ${k.email ? '· ' + esc(k.email) : ''}</small></div>`).join('') || '<div class="muted small">Chưa có</div>'}
      ${c?._debt ? `<div class="sec-title">${ico('fa-sack-dollar')} Công nợ ${esc(c.number)}</div><div class="small">Phải thu <b>${fm(c._debt.total)}</b> · đã thu <b>${fm(c._debt.paid)}</b> (${fnum(c._debt.paid_pct)}%)<br>Còn <b>${fm(c._debt.left)}</b>${c._debt.overdue ? ` · <span class="neg">quá hạn ${fm(c._debt.overdue)} (${c._debt.overdue_days} ngày)</span>` : ''}</div><div class="bar"><i class="sage" style="width:${c._debt.paid_pct}%"></i></div>` : ''}
      <div class="sec-title">${ico('fa-folder-open')} Tệp hồ sơ</div>${d.files.length ? d.files.map(f => `<a class="small" style="display:block;padding:3px 0" href="/api/file/${f.id}" target="_blank">${ico('fa-file-pdf')} ${esc(f.name)}</a>`).join('') : '<div class="muted small">Chưa có</div>'}
    </div><div class="card pad">
      ${sec('Giao dịch – giữ chỗ', 'reservation', d.reservations, ['code', 'cust_name', 'reg_at', 'price', 'reg_state', 'progress'], 'fa-hand-holding-hand')}
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
    <div class="box360"><div class="card unit-card"><div class="big" style="font-size:21px">${esc(k.full_name)}</div><div class="mb">${show(cf.find(f => f.k === 'kind'), k)} ${show(cf.find(f => f.k === 'stage'), k)}</div>
      <dl class="kv" style="grid-template-columns:1fr">${['phone', 'email', 'address', 'source', 'id_no', 'owner_id', 'need'].map(x => cf.find(f => f.k === x)).map(f => `<div><dt>${esc(f.l)}</dt><dd>${show(f, k)}</dd></div>`).join('')}</dl></div>
    <div class="card pad">${sec('Hợp đồng', 'contract', d.contracts, ['number', 'unit_id', 'value', 'paid', 'signed_on', 'status'], 'fa-file-contract')}
      ${(d.contracts || []).filter(c => c._debt?.total).map(c => `<div class="small mt">${esc(c.number)}: đã thu ${fm(c._debt.paid)} / ${fm(c._debt.total)} (${fnum(c._debt.paid_pct)}%)${c._debt.overdue ? ` · <span class="neg">quá hạn ${fm(c._debt.overdue)}</span>` : ''}${c.kind !== 'vay' ? ` · <a href="#/v/ctdebt?id=${c.id}">xem công nợ hợp đồng ›</a>` : ''}</div>`).join('')}
      ${(d.contracts || []).length && M.ents.installment?.perm.r ? `<div class="sec-title">${ico('fa-book-open')} Sổ chi tiết công nợ</div><div id="kLed"><div class="empty">Đang tải…</div></div>` : ''}
      ${sec('Giao dịch – giữ chỗ', 'reservation', d.reservations, ['code', 'unit_id', 'reg_at', 'price', 'reg_state', 'progress'], 'fa-hand-holding-hand')}
      ${sec('Nhắc nợ – cam kết', 'debt_call', d.calls, ['at', 'contract_id', 'result', 'content', 'promise_amount', 'promise_on', 'promise_st'], 'fa-phone-volume')}
      ${sec('Kế hoạch thu', 'collect_plan', d.plans, ['month', 'unit_id', 'expected', 'expected_on', 'status'], 'fa-chart-line')}
      ${sec('Lịch sử tư vấn – liên hệ', 'contact_log', d.logs, ['at', 'channel', 'content', 'result', 'next_at', 'owner_id'], 'fa-comments')}
      ${sec('Hồ sơ NOXH', 'noxh_check', d.noxh, ['unit_id', 'grp', 'items', 'result', 'status'], 'fa-list-check')}
      ${sec('Cấp sổ hồng', 'pinkbook', d.pinkbook, ['unit_id', 'items', 'submit_on', 'status'], 'fa-book')}
      ${sec('CSKH', 'ticket', d.tickets, ['code', 'kind', 'content', 'status'], 'fa-headset')}</div></div></div>`;
  wireMini(main);
  // sổ chi tiết công nợ của khách (06/11/2026): Nợ = đợt đến hạn + phiếu chi trả khách · Có = phiếu thu · số dư lũy kế
  const ls = ST.kled ||= { from: '', to: '' };
  const led = async () => {
    const box = $('#kLed', main); if (!box) return;
    const L = await api('GET', `/api/customer360/${k.id}/ledger?${qsOf({ from: ls.from, to: ls.to })}`);
    const many = L.contracts.length > 1, hc = many ? '<th>Hợp đồng · căn</th>' : '', ec = many ? '<td></td>' : '';   // 1 hợp đồng: bỏ cột hợp đồng cho gọn
    const balTxt = v => v > 0 ? `<b class="neg">${fm(v)}</b>` : v < 0 ? `<b class="pos">${fm(v)}</b>` : '<b>0</b>';
    box.innerHTML = `<div class="kl-bar"><span class="small muted">Từ ngày</span>${segDate('klFr', ls.from)}<span class="small muted">Đến ngày</span>${segDate('klTo', ls.to || L.to)}<span class="grow"></span>
        ${M.exportRoles.includes(M.me.role) ? `<button class="btn sm" id="klX">${ico('fa-file-excel')} Xuất file</button>` : ''}</div>
      <div class="tbl-wrap"><table class="t compact kl-t"><thead><tr><th>Ngày</th><th>Số chứng từ</th>${hc}<th>Diễn giải</th><th class="num">Phát sinh Nợ<br><small>(phải thu)</small></th><th class="num">Phát sinh Có<br><small>(đã thu)</small></th><th class="num">Số dư</th></tr></thead>
      <tbody><tr class="kl-open"><td>${L.from ? dmy(L.from) : ''}</td><td></td>${ec}<td><b>Số dư đầu kỳ</b></td><td></td><td></td><td class="num">${balTxt(L.open)}</td></tr>
        ${L.rows.map((r, i) => `<tr data-kl="${i}" class="${r.ent === 'contract' ? '' : 'kl-doc'}"><td>${dmy(r.on)}</td><td>${r.doc ? `<b>${esc(r.doc)}</b>` : '<span class="muted small">theo lịch</span>'}</td>${many ? `<td>${esc(r.contract)}<div class="small muted">${esc(r.unit)}</div></td>` : ''}
          <td class="wrap">${esc(r.what)}</td><td class="num">${r.no_ ? fm(r.no_) : ''}</td><td class="num">${r.co ? fm(r.co) : ''}</td><td class="num">${balTxt(r.bal)}</td></tr>`).join('') || '<tr><td colspan="' + (many ? 7 : 6) + '" class="empty">Không có phát sinh trong khoảng ngày này</td></tr>'}</tbody>
      <tfoot><tr><td></td><td></td>${ec}<td>Cộng phát sinh</td><td class="num">${fm(L.no_sum)}</td><td class="num">${fm(L.co_sum)}</td><td></td></tr>
        <tr><td></td><td></td>${ec}<td><b>Số dư cuối kỳ</b> (đến ${dmy(L.to)})</td><td></td><td></td><td class="num">${balTxt(L.close)}</td></tr>
        ${L.not_due ? `<tr><td></td><td></td>${ec}<td>Các đợt chưa đến hạn (sau ${dmy(L.to)})</td><td class="num muted">${fm(L.not_due)}</td><td></td><td class="num muted">${fm(L.close + L.not_due)}</td></tr>` : ''}</tfoot></table></div>
      <div class="small muted mt">Phát sinh Nợ = đợt thu đến hạn theo lịch thanh toán + phiếu chi trả lại khách (hoàn tiền, hoàn cọc, thanh lý). Phát sinh Có = phiếu thu hợp lệ. Số dư = Nợ − Có: <span class="neg">đỏ</span> = khách còn nợ đến hạn, <span class="pos">xanh</span> = khách trả trước. Dòng cuối = số dư nếu tính cả các đợt chưa đến hạn (= còn phải trả theo hợp đồng). Không gồm HĐ vay và hợp đồng đã hủy. Bấm 1 dòng để mở chứng từ / hợp đồng.</div>`;
    wireSegDate(box);
    $('.kl-bar', box).addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (v === null) return; if (e.target.id === 'klFr') ls.from = v; else ls.to = v; await led(); }));
    $('#klX', box) && ($('#klX', box).onclick = () => download('/api/export-rows', { title: `SỔ CHI TIẾT CÔNG NỢ — ${k.full_name}`, file: `So_cong_no_${k.id}`,
      cols: [['on', 'Ngày', 'date'], ['doc', 'Số chứng từ'], ['contract', 'Hợp đồng'], ['unit', 'Căn hộ'], ['what', 'Diễn giải'], ['no_', 'Phát sinh Nợ (phải thu)', 'money'], ['co', 'Phát sinh Có (đã thu)', 'money'], ['bal', 'Số dư', 'money']],
      rows: [{ what: 'Số dư đầu kỳ', bal: L.open, on: L.from }, ...L.rows, { what: `Số dư cuối kỳ (đến ${dmy(L.to)})`, bal: L.close }], sum: ['no_', 'co'],
      note: `Đơn vị tiền: đồng • ${L.from ? 'Từ ' + dmy(L.from) + ' ' : ''}đến ${dmy(L.to)} • Nợ = đợt thu đến hạn + phiếu chi trả khách; Có = phiếu thu; Số dư dương = khách còn nợ${L.not_due ? ` • Chưa đến hạn: ${fm(L.not_due)}` : ''}` }));
    box.onclick = e => { const tr = e.target.closest('tr[data-kl]'); if (!tr) return; const r = L.rows[+tr.dataset.kl]; if (r.ent === 'contract') location.hash = `#/v/ctdebt?id=${r.contract_id}`; else openDetail(r.ent, r.id); };
  };
  led().catch(e => { const b = $('#kLed', main); if (b) b.innerHTML = `<div class="errbar">${esc(e.message)}</div>`; });
  $('#kEdit', main).onclick = () => openDetail('customer', k.id);
  $('#kLog', main).onclick = () => openForm('contact_log', { preset: { customer_id: k.id, customer_id__l: k.full_name }, onSaved: () => route() });
};

// ======================= 05. LỊCH KÝ / KHO HỒ SƠ =======================
// lịch tháng các buổi ký: đỏ = quá ngày dự kiến chưa ký, xanh dương = sắp ký, xanh lá = đã ký (hợp đồng đã duyệt tính là đã ký); bấm ngày xem danh sách, bấm thẻ mở hợp đồng
// style đi cùng màn: app.css cũ trong bộ nhớ đệm không làm vỡ bố cục khi code đã là bản mới
const SC_CSS = `.sc-per { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; padding: 14px 18px; } .sc-per-t { flex: 1 1 280px; min-width: 0; } .sc-per-t h3 { margin: 0 0 2px; font-size: 15px; } .sc-per label { display: flex; flex-direction: column; gap: 3px; } .sc-bad { color: #b13a2c; font-weight: 600; } .sc-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } .sc-tiles .kpi .l .grow { flex: 1; } .sc-tiles .kpi .v .pill { font-size: 11.5px; vertical-align: 3px; -webkit-text-fill-color: initial; } .sc-track { height: 6px; margin-top: 7px; border-radius: 3px; background: #e6edf4; overflow: hidden; } .sc-track b { display: block; height: 100%; background: #2e9e6b; } .sc-d.out { opacity: .3; cursor: default; } .sc-p { align-items: center; } .sc-p .tx b { font-weight: 650; } .sc-av { flex: none; width: 34px; height: 34px; border-radius: 10px; background: #e4eefa; color: var(--cobalt-d); font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; } .sc-over { border-left: 4px solid var(--amber); } .sc-over .hd { background: #fdf5e6; } .sc-ok { display: flex; gap: 12px; align-items: flex-start; padding: 14px 18px; } .sc-foot { padding: 8px 14px; } @media (max-width: 900px) { .sc-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`;
V.signing = async main => {
  const f = filt(), t = today(), ss = M.ents.contract.fields.find(x => x.k === 'sign_status'), cs = M.ents.contract.fields.find(x => x.k === 'status');
  let d = { rows: [], recent: [], signed: [] }, ym = t.slice(0, 7), sel = t, lq = '', ls = '', lf = '', lt = '', tile = '';   // tile: ô thống kê đang mở biểu đồ
  const opt = (fd, v) => fd.o.find(o => o[0] === v)?.[1] || v || '';
  const inP = x => (!lf && !lt) || (!!x && (!lf || x >= lf) && (!lt || x <= lt));   // khoảng thời gian báo cáo, theo ngày dự kiến ký
  const evs = () => [...d.rows.filter(r => r.plan_sign).map(r => { const day = r.plan_sign.slice(0, 10); return { ...r, day, cls: r.status === 'cho_ky' ? 'g' : day < t ? 'r' : 'b' }; }), ...d.signed.map(r => ({ ...r, day: String(r.signed_on).slice(0, 10), cls: 'g' }))].filter(r => inP(r.plan_sign?.slice(0, 10) || r.day));
  const late = r => Math.round((Date.parse(t) - Date.parse(r.day)) / 864e5);
  const ST_TABS = [['III', 'Đã ký'], ['II', 'Chưa ký'], ['I', 'Chưa liên lạc được']];   // tab kiểu màn Hợp đồng, số đếm theo dự án đang lọc
  const capOf = r => r.cls === 'g' ? 'III' : r.sign_status === 'chua_lien_he' ? 'I' : 'II';
  const stName = r => ST_TABS.find(x => x[0] === capOf(r))[1];
  const signSt = r => r.cls === 'r' ? pill(`${stName(r)} · quá hạn ${late(r)} ngày`, 'r') : pill(stName(r), r.cls === 'g' ? 'g' : 's');
  const badge = r => r.cls === 'g' ? pill('Đã ký', 'g') : r.cls === 'r' ? pill(`Quá hạn ${late(r)} ngày`, 'r') : r.sign_status === 'chua_lien_he' ? pill('Cần liên hệ', 'a') : pill('Chưa ký', 's');
  const initials = s => String(s || '').replace(/\(.*?\)/g, ' ').trim().split(/\s+/).slice(-2).map(x => x[0]).join('').toUpperCase();
  const line = r => `<div class="alert-row sc-p" data-id="${r.id}" data-ent="${r.ent || 'contract'}"><span class="sc-av">${esc(initials(r.customer))}</span><div class="tx"><b>${esc(r.customer)}</b><small>${esc(r.unit)}${r.project_name ? ' · ' + esc(r.project_name) : ''}</small></div>${badge(r)}</div>`;   // chi tiết xem khi bấm dòng
  // danh sách theo dõi: mọi hợp đồng đang mở + đã ký; hợp đồng thiếu ngày ở cuối
  const SIGN_COLS = [['project', 'Dự án'], ['unit', 'Mã căn hộ'], ['customer', 'Khách hàng'], ['kind_l', 'Loại hợp đồng'], ['number', 'Số HĐ'], ['plan_d', 'Ngày dự kiến ký', 'date'], ['signed_d', 'Ngày ký', 'date'], ['st_l', 'Tình trạng ký'], ['owner', 'Nhân viên KD']];
  const tracked = () => [...d.rows.map(r => { const day = r.plan_sign ? r.plan_sign.slice(0, 10) : ''; return { ...r, day, plan_d: day, signed_d: '', cls: r.status === 'cho_ky' ? 'g' : day && day < t ? 'r' : 'b' }; }),
    ...d.signed.map(r => ({ ...r, day: String(r.signed_on).slice(0, 10), plan_d: r.plan_sign ? r.plan_sign.slice(0, 10) : '', signed_d: String(r.signed_on).slice(0, 10), cls: 'g' }))]
    .map(r => ({ ...r, stk: capOf(r), st_l: `${stName(r)}${r.cls === 'r' ? ` · quá hạn ${late(r)} ngày` : ''}` }))
    .filter(r => inP(r.plan_d || r.day))
    .sort((a, b) => (a.cls === 'r' ? 0 : 1) - (b.cls === 'r' ? 0 : 1) || (b.day || '').localeCompare(a.day || ''));
  const listed = () => { const q = lq.trim().toLowerCase(); const cq = /^(i{1,3})$/.exec(q)?.[1].toUpperCase();   // gõ I / II / III = tìm theo tình trạng
    return tracked().filter(r => (!ls || r.stk === ls) && (cq ? r.stk === cq : !q || [r.project, r.project_name, r.unit, r.customer, r.number, r.owner, r.kind_l].some(x => String(x ?? '').toLowerCase().includes(q)))); };
  const drawList = () => {
    const rs = listed(), all = tracked(); $('#scN', main).textContent = `Hiển thị ${rs.length} bản ghi`; $('#scTotal', main).textContent = `Tổng ${all.length} căn`;
    $('#scTabs', main).innerHTML = `<button data-s="" class="${!ls ? 'on' : ''}">Tất cả<span class="c">${all.length}</span></button>` + ST_TABS.map(([k, l]) => `<button data-s="${k}" class="${ls === k ? 'on' : ''}">${l}<span class="c">${all.filter(r => r.stk === k).length}</span></button>`).join('');
    $('#scT', main).innerHTML = `<table class="t"><thead><tr><th>Căn hộ / Dự án</th><th>Khách hàng</th><th>Loại hợp đồng</th><th>Ngày dự kiến</th><th>Tình trạng ký</th><th>Ngày ký thực tế</th></tr></thead><tbody>${rs.map(r => `<tr data-id="${r.id}" data-ent="${r.ent || 'contract'}"><td><b>${esc(r.unit)}</b><div class="small muted">${esc(r.project_name || r.project || '')}</div></td><td>${esc(r.customer)}</td><td>${r.kind_l ? esc(r.kind_l) : '—'}</td><td>${r.plan_d ? dmy(r.plan_d) : '—'}</td><td>${pill(r.st_l, r.cls === 'g' ? 'g' : r.cls === 'r' ? 'r' : r.stk === 'I' ? 'a' : 's')}</td><td>${r.signed_d ? dmy(r.signed_d) : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="center muted">Không có hợp đồng phù hợp</td></tr>'}</tbody></table>`;
    syncTopScroll();
  };
  const byProject = es => Object.entries(es.reduce((g, r) => ((g[r.project] ||= []).push(r), g), {})).sort((a, b) => a[0].localeCompare(b[0]));
  const render = () => {
    const [y, m] = ym.split('-').map(Number), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const by = {}; evs().forEach(e => (by[e.day] ||= []).push(e));
    const iso = i => `${ym}-${String(i).padStart(2, '0')}`;
    const cells = [...Array(lead).fill('<div class="sc-d off"></div>'), ...Array.from({ length: n }, (_, i) => { const k = iso(i + 1), es = by[k] || [];
      return `<div class="sc-d ${k === sel ? 'sel' : ''} ${inP(k) ? '' : 'out'}" ${inP(k) ? `data-day="${k}"` : ''}><span class="sc-n ${k === t ? 'now' : ''}">${i + 1}</span>${[['r', 'quá hạn'], ['b', k === t ? 'cần ký' : 'sắp ký'], ['g', 'đã ký']].map(([c, l]) => { const q = es.filter(x => x.cls === c).length; return q ? `<div class="sc-ev ${c}">${q} ${l}</div>` : ''; }).join('')}</div>`; })];
    const noDate = lf || lt ? [] : d.rows.filter(r => !r.plan_sign).map(r => ({ ...r, cls: 'b' })), day = by[sel] || [], all = tracked(), stN = Object.fromEntries(ST_TABS.map(([k]) => [k, 0])), over = evs().filter(r => r.cls === 'r').sort((a, b) => a.day.localeCompare(b.day));
    const fmt = v => v.split('-').reverse().join('/'), period = lf && lt ? `Từ ${fmt(lf)} đến ${fmt(lt)}` : lf ? `Từ ${fmt(lf)}` : lt ? `Đến ${fmt(lt)}` : 'Toàn bộ thời gian', bad = lf && lt && lf > lt;
    all.forEach(r => stN[r.stk]++);
    const pct = all.length ? Math.round(stN.III / all.length * 100) : 0, wd = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'], sd = new Date(sel + 'T00:00:00Z'), dDone = day.filter(x => x.cls === 'g').length;
    main.innerHTML = `<style>${SC_CSS}</style><div class="page">${head('04', 'Lịch ký hợp đồng', 'fa-calendar-days', '', '5.5')}${filterBar(f, { period: false, building: false })}
      <div class="card sc-per"><div class="sc-per-t"><h3>Khoảng thời gian báo cáo</h3><div class="small muted">Áp dụng cho số liệu tổng hợp, lịch ký và danh sách · Theo ngày dự kiến ký</div><div class="small ${bad ? 'sc-bad' : 'muted'} mt">${bad ? 'Ngày kết thúc phải từ ngày bắt đầu trở đi.' : period}</div></div>
        <span id="scDates" style="display:contents"><span class="small muted">Từ ngày</span>${segDate('scF', lf)}<span class="small muted">Đến ngày</span>${segDate('scTo', lt)}</span><button class="btn" id="scAll">Toàn bộ thời gian</button></div>
      <div class="sc-tiles mt">${[['thang', 'fa-copy', 'Tổng hợp đồng', all.length, 'Căn hộ đang theo dõi'],
        ['tong', 'fa-circle-check', 'Đã ký hợp đồng', `${stN.III} ${pill(pct + '%', 'g')}`, `Hoàn thành trên tổng danh sách<div class="sc-track"><b style="width:${pct}%"></b></div>`],
        ['tinh_trang', 'fa-phone-slash', 'Chưa liên lạc được', stN.I, 'Cần tiếp tục liên hệ khách hàng'],
        ['qua_han', 'fa-clock', 'Quá hạn ký', over.length, over.length ? `Lâu nhất ${late(over[0])} ngày` : 'Không có căn quá ngày dự kiến']].map(([k, ic, l, v, sub]) => `<div class="card kpi ${tile === k ? 'on' : ''} ${k === 'qua_han' && over.length ? 'late' : ''}" data-tile="${k}" role="button" tabindex="0"><div class="l">${l}<span class="grow"></span>${ico(ic)}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join('')}</div>
      <div class="sc-wrap mt"><div class="card sc"><div class="sc-h"><select id="scM" aria-label="Tháng">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>Tháng ${i + 1}</option>`).join('')}</select><select id="scY" aria-label="Năm">${[...new Set([...Array.from({ length: 7 }, (_, i) => +t.slice(0, 4) - 3 + i), y])].sort().map(v => `<option ${v === y ? 'selected' : ''}>${v}</option>`).join('')}</select><input type="date" id="scDay" aria-label="Chọn ngày" value="${sel}"><span class="grow"></span><button class="btn sm" data-go="now">Hôm nay</button><button class="btn sm" data-go="-1" aria-label="Tháng trước">‹</button><button class="btn sm" data-go="1" aria-label="Tháng sau">›</button></div>
        <div class="sc-g">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(x => `<div class="sc-w">${x}</div>`).join('')}${cells.join('')}</div>
        <div class="sc-leg"><span class="r">Quá ngày dự kiến</span><span class="b">Có lịch ký</span><span class="g">Đã ký</span></div></div>
      <div><div class="card" id="scP"></div>
        ${noDate.length ? `<div class="card mt"><div class="hd"><h3>${ico('fa-clock')} Chưa hẹn lịch (${noDate.length})</h3></div><div class="sc-list">${noDate.map(line).join('')}</div></div>` : ''}</div></div>
      <div class="card mt sc-over"><div class="hd"><div><h3>${ico('fa-bell')} Nhắc nhở quá hạn ký</h3><div class="small muted">${period} · Theo ngày dự kiến ký</div></div><span class="grow"></span>${pill(`${over.length} căn quá hạn`, over.length ? 'r' : 'a')}</div>
        ${over.length ? `<div class="sc-list">${over.map(line).join('')}</div>` : `<div class="sc-ok">${pill('Đã kiểm tra', 'g')}<div><b>Không có hợp đồng quá hạn ký trong kỳ.</b><div class="small muted">Quá hạn: đã qua ngày dự kiến ký và chưa hoàn tất ký hợp đồng.</div></div></div>`}</div>
      <div class="card mt"><div class="hd"><div><h3>${ico('fa-list-check')} Danh sách theo dõi hợp đồng</h3><div class="small muted">Quản lý tình trạng ký kết theo từng căn hộ</div></div><span class="grow"></span><span class="pill b" id="scTotal"></span><button class="btn sm" id="scX">${ico('fa-file-excel')} Xuất file</button></div>
        <div class="tabs" id="scTabs"></div>
        <div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="scQ" placeholder="Tìm mã căn, tên khách hàng…" value="${esc(lq)}"></div></div>
        <div class="tbl-wrap" id="scT"></div><div class="small muted sc-foot" id="scN"></div></div></div>`;
    wireFilter(main, f, draw);
    // khung dưới 4 ô: mặc định danh sách ngày đang chọn, bấm ô thì hiện biểu đồ của ô đó
    const P = $('#scP', main), hd = (ic, x) => `<div class="hd"><h3>${ico(ic)} ${x}</h3>${tile ? '<span class="grow"></span><button class="btn sm" data-tile="">Về danh sách ngày</button>' : ''}</div>`;
    const bars = (rows, attr = '') => { const mx = Math.max(1, ...rows.map(r => r[1])); return `<div class="sc-bars">${rows.map(([l, n, key]) => `<div class="sc-bar" ${key ? `${attr}="${key}" role="button" tabindex="0"` : ''} title="${esc(l)}: ${n} căn"><span>${esc(l)}</span><i><b style="width:${n / mx * 100}%"></b></i><em>${n}</em></div>`).join('')}</div>`; };
    const groupN = es => byProject(es).map(([pj, x]) => [pj || 'Chưa có dự án', x.length]);
    if (tile === 'thang') {
      const ser = Array.from({ length: 12 }, (_, i) => { const k = `${y}-${String(i + 1).padStart(2, '0')}`, es = evs().filter(e => e.day.startsWith(k)); return { label: 'T' + (i + 1), phai: es.length, da: es.filter(e => e.cls === 'g').length, ym: k }; });
      P.innerHTML = `${hd('fa-chart-column', `Đã ký và phải ký theo tháng năm ${y}`)}<div class="sc-chart"></div><div class="small muted sc-note">Bấm cột để xem tháng đó trên lịch. Phải ký gồm cả căn đã ký trong tháng.</div>`;
      $('.sc-chart', P).append(barChart(ser, [{ k: 'phai', l: 'Phải ký', c: '#2F6DB5' }, { k: 'da', l: 'Đã ký', c: '#2E9E6B' }], { onClick: r => { ym = r.ym; render(); } }));
    } else if (tile === 'tinh_trang') P.innerHTML = `${hd('fa-list-check', 'Tình trạng ký')}${bars(ST_TABS.map(([k, l]) => [l, stN[k], k]), 'data-cap')}<div class="small muted sc-note">Bấm dòng để lọc danh sách theo dõi bên dưới.</div>`;
    else if (tile === 'qua_han') P.innerHTML = `${hd('fa-triangle-exclamation', `Quá hạn ký (${over.length})`)}${over.length ? `${bars(groupN(over))}<div class="sc-list">${over.map(line).join('')}</div>` : '<div class="empty">Không có căn quá hạn</div>'}`;
    else if (tile === 'tong') P.innerHTML = `${hd('fa-signature', `Tổng căn đã ký theo dự án (${stN.III})`)}${bars(groupN(all.filter(r => r.stk === 'III')))}`;
    else if (!inP(sel)) P.innerHTML = `${hd('fa-pen-nib', `${wd[sd.getUTCDay()]}, ${sd.getUTCDate()} tháng ${sd.getUTCMonth() + 1}`)}<div class="empty">Chọn ngày trong khoảng thời gian báo cáo.</div>`;
    else P.innerHTML = `<div class="hd"><div><h3>${wd[sd.getUTCDay()]}, ${sd.getUTCDate()} tháng ${sd.getUTCMonth() + 1}</h3><div class="small muted">${day.length ? `${day.length} lịch ký · ${dDone} đã ký · ${day.length - dDone} cần xử lý` : 'Chưa có lịch ký'}</div></div><span class="grow"></span>${sel === t ? pill('Hôm nay', 'b') : ''}</div><div class="sc-list">${day.length ? day.map(line).join('') : '<div class="empty">Không có lịch hẹn trong ngày này.</div>'}</div>`;
    drawList();
    $('#scQ', main).oninput = debounce(e => { lq = e.target.value; drawList(); }, 200);
    wireSegDate(main); $('#scDates', main).addEventListener('sdchange', e => { const v = segVal(e.target); if (v === null || (v && !okDay(v))) return;   // 17/11/2026: ô ngày dd/mm/yyyy
      if (e.target.id === 'scF') { if (v && lt && v > lt) return toast('Từ ngày phải trước Đến ngày', true); lf = v; } else { if (v && lf && lf > v) return toast('Từ ngày phải trước Đến ngày', true); lt = v; } render(); });
    $('#scAll', main).onclick = () => { lf = lt = ''; render(); };
    const toMonth = () => { ym = `${$('#scY', main).value}-${String($('#scM', main).value).padStart(2, '0')}`; render(); };
    $('#scM', main).onchange = toMonth; $('#scY', main).onchange = toMonth;
    $('#scDay', main).onchange = e => { if (okDay(e.target.value)) { sel = e.target.value; ym = sel.slice(0, 7); render(); } };
    $('#scX', main).onclick = () => download('/api/export-rows', { title: 'DANH SÁCH THEO DÕI KÝ HỢP ĐỒNG', cols: SIGN_COLS, rows: listed(), file: 'theo_doi_ky_hop_dong' });
  };
  const draw = async () => { d = await api('GET', '/api/signing?' + qsOf({ project: f.project, building: f.building })); render(); };
  main.onclick = e => {
    const tl = e.target.closest('[data-tile]'); if (tl) { tile = tile === tl.dataset.tile ? '' : tl.dataset.tile; return render(); }
    const stb = e.target.closest('#scTabs [data-s]'); if (stb) { ls = stb.dataset.s; return drawList(); }
    const cp = e.target.closest('[data-cap]'); if (cp) { ls = cp.dataset.cap; drawList(); $('#scT', main).scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (e.target.closest('[data-late]')) { tile = 'qua_han'; return render(); }
    const go = e.target.closest('[data-go]');
    if (go) { if (go.dataset.go === 'now') { ym = t.slice(0, 7); sel = t; } else { const [y, m] = ym.split('-').map(Number), x = new Date(Date.UTC(y, m - 1 + +go.dataset.go, 1)); ym = x.toISOString().slice(0, 7); } return render(); }
    const r = e.target.closest('[data-id]'); if (r) return openDetail(r.dataset.ent, +r.dataset.id, undefined, true);
    const c = e.target.closest('[data-day]'); if (c) { sel = c.dataset.day; tile = ''; return render(); }
  };
  await draw();
};
// Kho hồ sơ kiểu Drive: thư mục ảo Loại hồ sơ → Hồ sơ → Tệp, tệp vẫn gắn với hồ sơ gốc
const VT_ENTS = ['contract', 'contract_change', 'reservation', 'pinkbook', 'handover', 'defect', 'noxh_check', 'refund', 'cancel_req', 'ticket', 'price_policy'];
const VT_TYPES = { pdf: ['PDF', '#d93025'], doc: ['DOC', '#1a73e8'], docx: ['DOC', '#1a73e8'], xls: ['XLS', '#188038'], xlsx: ['XLS', '#188038'], jpg: ['ẢNH', '#7b5cd6'], jpeg: ['ẢNH', '#7b5cd6'], png: ['ẢNH', '#7b5cd6'], webp: ['ẢNH', '#7b5cd6'], dwg: ['DWG', '#c98210'], zip: ['ZIP', '#64748b'], rar: ['ZIP', '#64748b'] };
const VT_NAV = [['bo', 'fa-file-signature', 'In bộ hồ sơ'], ['all', 'fa-box-archive', 'Hồ sơ dự án'], ['recent', 'fa-clock', 'Gần đây'], ['star', 'fa-star', 'Có gắn sao'], ['trash', 'fa-trash-can', 'Thùng rác']];
const VT_CSS = `.vt { display: grid; grid-template-columns: 232px minmax(0, 1fr); gap: 22px; align-items: start; } .vt-side { position: sticky; top: 84px; display: flex; flex-direction: column; gap: 4px; } .vt-new { display: inline-flex; align-items: center; gap: 10px; align-self: flex-start; padding: 12px 24px 12px 18px; margin-bottom: 10px; border: 1px solid var(--line2); border-radius: 16px; background: var(--card); box-shadow: var(--soft2); font: inherit; font-size: 14px; font-weight: 700; color: var(--ink); cursor: pointer; } .vt-new:hover { box-shadow: var(--soft); } .vt-new:disabled { opacity: .5; cursor: not-allowed; } .vt-nav button { display: flex; align-items: center; gap: 14px; width: 100%; padding: 9px 16px; border: 0; border-radius: 20px; background: none; font: inherit; font-size: 13.5px; color: var(--muted); text-align: left; cursor: pointer; } .vt-nav button i { width: 16px; text-align: center; } .vt-nav button:hover { background: var(--cobalt-50); } .vt-nav button.on { background: var(--cobalt-100); color: var(--cobalt); font-weight: 700; } .vt-use { padding: 14px 16px 0; font-size: 12px; color: var(--muted); } .vt-main { min-width: 0; min-height: calc(100vh - 210px); padding: 16px 24px 30px; border: 1px solid var(--line2); border-radius: 18px; background: var(--card); transition: background .15s; } .vt-main.drop { outline: 2px dashed var(--cobalt-l); outline-offset: -8px; background: var(--cobalt-50); } .vt-q { position: relative; margin-bottom: 12px; } .vt-q i { position: absolute; left: 20px; top: 50%; transform: translateY(-50%); color: var(--muted); } .vt-q input { width: 100%; padding: 12px 18px 12px 46px; border: 1px solid transparent; border-radius: 24px; outline: none; background: var(--paper); font: inherit; font-size: 14.5px; } .vt-q input:focus { border-color: var(--cobalt-l); background: var(--card); } .vt-top { display: flex; align-items: center; gap: 8px; min-height: 44px; } .vt-crumbs { display: flex; align-items: center; flex: 1 1 0; min-width: 0; overflow: hidden; font-size: 19px; } .vt-crumbs i { font-size: 11px; color: var(--muted2); } .vt-crumbs button { max-width: 300px; padding: 4px 10px; border: 0; border-radius: 10px; background: none; font: inherit; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; } .vt-crumbs button:hover { background: var(--cobalt-50); } .vt-crumbs button:last-child { color: var(--ink); font-weight: 600; } .vt-seg { display: inline-flex; border: 1px solid var(--line2); border-radius: 10px; overflow: hidden; } .vt-seg button { padding: 7px 11px; border: 0; background: var(--card); color: var(--muted); cursor: pointer; } .vt-seg button.on { background: var(--cobalt-100); color: var(--cobalt); } .vt-h { margin: 18px 0 10px; font-size: 13px; font-weight: 600; color: var(--muted); } .vt-fgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; } .vt-dgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; } .vt-f { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 14px; border: 1px solid transparent; border-radius: 12px; background: var(--paper); font: inherit; color: inherit; text-align: left; cursor: pointer; } .vt-f:hover { background: var(--cobalt-50); } .vt-f > i { font-size: 18px; color: var(--amber); } .vt-f > span { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .vt-f small { display: block; font-size: 11px; font-weight: 400; color: var(--muted); overflow: hidden; text-overflow: ellipsis; } .vt-d { min-width: 0; padding: 8px 8px 10px; border: 1px solid transparent; border-radius: 12px; background: var(--paper); cursor: pointer; } .vt-d:hover { background: var(--cobalt-50); } .vt-d:focus-visible, .vt-f:focus-visible { outline: 2px solid var(--cobalt-l); } .vt-th { display: grid; place-items: center; aspect-ratio: 4 / 3; border-radius: 8px; background: var(--card); } .vt-ic { --c: #64748b; display: inline-grid; place-items: center; width: 54px; height: 62px; border: 1px solid color-mix(in srgb, var(--c) 25%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--c) 14%, transparent); font-size: 13px; font-weight: 700; color: var(--c); } .vt-ic.sm { width: 30px; height: 26px; border-radius: 5px; font-size: 9.5px; flex: none; } .vt-nm { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 9px 2px 0; font-size: 13px; font-weight: 600; } .vt-tx { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .vt-mt { padding: 2px 2px 0; font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .vt-st { color: var(--amber); font-size: 12px; flex: none; } .vt-more { flex: none; width: 26px; height: 26px; border: 0; border-radius: 7px; background: none; color: var(--muted); cursor: pointer; opacity: 0; } .vt-more:hover { background: var(--line2); } .vt-more:focus-visible, .vt-d:hover .vt-more, tr:hover .vt-more { opacity: 1; } .vt-rn { display: flex; align-items: center; gap: 10px; min-width: 240px; font-weight: 600; } .vt-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 70px 20px; text-align: center; color: var(--muted); } .vt-empty > i { font-size: 44px; opacity: .45; } .vt-empty b { font-size: 16px; font-weight: 600; color: var(--text); } .vt-ctx { position: fixed; z-index: 250; min-width: 210px; padding: 6px; border: 1px solid var(--line2); border-radius: 12px; background: var(--card); box-shadow: var(--deep); } .vt-ctx button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 12px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 13.5px; color: var(--text); text-align: left; cursor: pointer; } .vt-ctx button i { width: 16px; text-align: center; color: var(--muted); } .vt-ctx button:hover { background: var(--cobalt-50); } .vt-ctx button.danger, .vt-ctx button.danger i { color: var(--r-c); } .vt-ctx hr { margin: 5px 0; border: 0; border-top: 1px solid var(--line2); } @media (max-width: 900px) { .vt { grid-template-columns: 1fr; gap: 12px; } .vt-side { position: static; flex-direction: row; flex-wrap: wrap; align-items: center; } .vt-new { margin: 0; } .vt-nav { display: flex; flex-wrap: wrap; gap: 2px; } .vt-use { display: none; } } @media (hover: none) { .vt-more { opacity: 1; } } @media (max-width: 640px) { .vt-main { padding: 12px 12px 24px; } .vt-top { flex-wrap: wrap; } .vt-crumbs { flex-basis: 100%; font-size: 16px; } .vt-dgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .vt-fgrid { grid-template-columns: 1fr; } }`;
const vtSize = n => { n = +n || 0; return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`; };
const vtIcon = (name, sm) => { const ext = String(name).split('.').pop().toLowerCase(), [t, c] = Object.hasOwn(VT_TYPES, ext) ? VT_TYPES[ext] : ['TỆP', '#64748b']; return `<span class="vt-ic ${sm ? 'sm' : ''}" style="--c:${c}">${t}</span>`; };
const vtName = (a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true });
const vtSort = (rows, sort) => [...rows].sort(sort === 'date' ? (a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)) : sort === 'size' ? (a, b) => (b.size || 0) - (a.size || 0) : (a, b) => vtName(a.name, b.name));

V.vault = async (main, params = {}) => {
  const f = filt(), s = ST.vault ||= { tab: 'bo', ent: '', rec: '', sort: 'name', view: 'grid' };
  s.tab = 'bo';   // 17/11/2026 (Tâm): màn chỉ còn «In bộ hồ sơ» — bỏ Hồ sơ dự án / Gần đây / Có gắn sao / Thùng rác (tệp đã lưu vẫn xem ở hợp đồng / khách gắn với tệp)
  let rows = [], q = '';
  const load = async () => { rows = await api('GET', '/api/vault?' + qsOf({ project: f.project, trash: s.tab === 'trash' ? 1 : '' })); };
  const hit = r => [r.name, r.unit, r.customer, r.label].some(x => String(x || '').toLowerCase().includes(q));
  const byId = id => rows.find(r => r.id === +id);
  // thư mục con và tệp của vị trí đang mở; đang tìm hoặc ở mục ngoài Hồ sơ dự án thì chỉ có tệp
  const place = () => {
    if (q) return { files: vtSort(rows.filter(hit), s.sort) };
    if (s.tab === 'recent') return { files: vtSort(rows, 'date').slice(0, 30) };
    if (s.tab === 'star') return { files: vtSort(rows.filter(r => r.star), s.sort) };
    if (s.tab === 'trash') return { files: vtSort(rows, s.sort) };
    if (s.rec) return { files: vtSort(rows.filter(r => r.ent === s.ent && r.rec_id === +s.rec), s.sort) };
    const group = (list, key, name) => { const m = new Map(); for (const r of list) { const k = key(r); (m.get(k) || m.set(k, []).get(k)).push(r); } return [...m].map(([k, v]) => ({ k, name: name(v[0]), rows: v })).sort((a, b) => vtName(a.name, b.name)); };
    if (s.ent) return { recs: group(rows.filter(r => r.ent === s.ent), r => r.rec_id, r => r.label || '#' + r.rec_id), files: [] };
    return { ents: group(rows, r => r.ent, r => r.ent_l), files: [] };
  };
  const crumbs = () => {
    const nav = VT_NAV.find(n => n[0] === s.tab)[2];
    if (q) return `<button>Kết quả tìm «${esc(q)}»</button>`;
    if (s.tab !== 'all') return `<button>${nav}</button>`;
    const sample = rows.find(r => r.ent === s.ent && (!s.rec || r.rec_id === +s.rec)), sep = ico('fa-chevron-right');
    return `<button data-c="root">Kho hồ sơ</button>${s.ent ? `${sep}<button data-c="ent">${esc(sample?.ent_l || M.ents[s.ent]?.title || '')}</button>` : ''}${s.rec ? `${sep}<button data-c="rec">${esc(sample?.label || '#' + s.rec)}</button>` : ''}`;
  };
  const fileCard = r => `<div class="vt-d" data-f="${r.id}" tabindex="0" title="${esc(r.ent_l)} · ${esc(r.label || '')}"><div class="vt-th">${vtIcon(r.name)}</div><div class="vt-nm"><span class="vt-tx">${esc(r.name)}</span>${r.star ? ico('fa-star', 'vt-st') : ''}<button class="vt-more" data-m="${r.id}" aria-label="Thao tác với ${esc(r.name)}">${ico('fa-ellipsis-vertical')}</button></div><div class="vt-mt">${vtSize(r.size)} · ${s.tab === 'trash' ? 'xóa ' + dmy(r.deleted_at) : dmy(r.uploaded_at)}${r.version > 1 ? ` · v${r.version}` : ''}</div></div>`;
  const fileTable = list => `<div class="tbl-wrap"><table class="t"><thead><tr><th>Tên</th><th>Loại</th><th>Hồ sơ</th><th>Mã căn</th><th>Khách hàng</th><th>${s.tab === 'trash' ? 'Người xóa' : 'Người tải'}</th><th>${s.tab === 'trash' ? 'Ngày xóa' : 'Ngày'}</th><th></th></tr></thead><tbody>${list.map(r => `<tr data-f="${r.id}"><td><div class="vt-rn">${vtIcon(r.name, 1)}<span class="vt-tx">${esc(r.name)}</span>${r.version > 1 ? `<span class="tag">v${r.version}</span>` : ''}${r.star ? ico('fa-star', 'vt-st') : ''}</div></td><td>${esc(r.kind_l)}</td><td>${esc(r.ent_l)} · ${esc(r.label || '')}</td><td>${esc(r.unit || '')}</td><td>${esc(r.customer || '')}</td><td>${esc((s.tab === 'trash' ? r.deleted_by_name : r.by) || '')}</td><td>${dmy(s.tab === 'trash' ? r.deleted_at : r.uploaded_at)}</td><td><button class="vt-more" data-m="${r.id}" aria-label="Thao tác với ${esc(r.name)}">${ico('fa-ellipsis-vertical')}</button></td></tr>`).join('')}</tbody></table></div>`;
  const folderCard = (attr, k, name, sub) => `<button class="vt-f" data-${attr}="${esc(k)}">${ico('fa-folder')}<span>${esc(name)}<small>${esc(sub)}</small></span></button>`;
  const body = () => {
    const p = place();
    let h = '';
    if (p.ents?.length) h += `<div class="vt-h">Thư mục</div><div class="vt-fgrid">${p.ents.map(g => folderCard('e', g.k, g.name, `${new Set(g.rows.map(r => r.rec_id)).size} hồ sơ · ${g.rows.length} tệp`)).join('')}</div>`;
    if (p.recs?.length) h += `<div class="vt-h">Thư mục</div><div class="vt-fgrid">${p.recs.map(g => folderCard('r', g.k, g.name, [g.rows[0].unit, g.rows[0].customer].filter(Boolean).join(' · ') || `${g.rows.length} tệp`)).join('')}</div>`;
    if (p.files.length) h += `<div class="vt-h">Tệp${q ? ` · ${p.files.length} kết quả` : ''}</div>${s.view === 'grid' ? `<div class="vt-dgrid">${p.files.map(fileCard).join('')}</div>` : fileTable(p.files)}`;
    if (!h) h = `<div class="vt-empty">${ico(s.tab === 'trash' ? 'fa-trash-can' : s.tab === 'star' ? 'fa-star' : 'fa-folder-open')}<b>${q ? 'Không tìm thấy tệp' : s.tab === 'trash' ? 'Thùng rác trống' : s.tab === 'star' ? 'Chưa gắn sao tệp nào' : 'Chưa có tệp'}</b></div>`;
    return h;
  };
  const draw = () => {
    $('#vtM', main).classList.toggle('vt-bo', s.tab === 'bo');
    for (const id of ['vtN', 'vtUp', 'vtU']) { const el = $('#' + id, main); if (el) el.style.display = s.tab === 'bo' ? 'none' : ''; }   // 17/11/2026: màn in không dùng nút của Kho tệp
    $$('#vtNav button', main).forEach(b => b.classList.toggle('on', b.dataset.tab === s.tab));
    if (s.tab === 'bo') {   // in bộ hồ sơ theo căn → lưu vào kho
      $('#vtC', main).innerHTML = `<button>In bộ hồ sơ</button>`;
      if (!$('#hsHost', main)) { $('#vtB', main).innerHTML = '<div id="hsHost"></div>'; hsTabs($('#hsHost', main), { unit: params.unit || '', bo: params.bo || '', cust: params.cust }); }
      $('#vtU', main).textContent = `${rows.length} tệp trong kho`;
      return;
    }
    $('#vtC', main).innerHTML = crumbs();
    $('#vtB', main).innerHTML = body();
    $$('#vtNav button', main).forEach(b => b.classList.toggle('on', b.dataset.tab === s.tab));
    $$('#vtV button', main).forEach(b => b.classList.toggle('on', b.dataset.v === s.view));
    $('#vtS', main).value = s.sort;
    $('#vtU', main).textContent = s.tab === 'trash' ? `${rows.length} tệp trong thùng rác` : `${rows.length} tệp · ${vtSize(rows.reduce((t, r) => t + (r.size || 0), 0))} ${f.project ? 'trong dự án' : 'toàn bộ dự án'}`;
  };
  const go = async (tab, ent = '', rec = '') => { const reload = (tab === 'trash') !== (s.tab === 'trash'); Object.assign(s, { tab, ent, rec }); q = ''; $('#vtQ', main).value = ''; if (reload) await load(); draw(); };
  const refresh = async () => { await load(); draw(); };
  ST.reload = async () => { if ($('#vtB', main)) await refresh(); };   // tải / xóa tệp trong hồ sơ gốc thì Kho cập nhật theo

  const menu = (r, x, y) => {
    $('.vt-ctx')?.remove();
    const items = s.tab === 'trash' ? [['back', 'fa-rotate-left', 'Khôi phục'], ['rec', 'fa-folder-open', 'Mở hồ sơ gốc']]
      : [['open', 'fa-arrow-up-right-from-square', 'Mở tệp'], ['dl', 'fa-download', 'Tải xuống'], ['rec', 'fa-folder-open', 'Mở hồ sơ gốc'], ['star', 'fa-star', r.star ? 'Bỏ gắn sao' : 'Gắn sao'], null, ['del', 'fa-trash-can', 'Chuyển vào thùng rác', 1]];
    const c = document.createElement('div'); c.className = 'vt-ctx'; c.setAttribute('role', 'menu');
    c.innerHTML = items.map(i => i ? `<button role="menuitem" data-a="${i[0]}" class="${i[3] ? 'danger' : ''}">${ico(i[1])} ${i[2]}</button>` : '<hr>').join('');
    document.body.append(c);
    c.style.left = Math.max(8, Math.min(x, innerWidth - c.offsetWidth - 8)) + 'px'; c.style.top = Math.max(8, Math.min(y, innerHeight - c.offsetHeight - 8)) + 'px';
    c.onclick = run(async e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      c.remove();
      if (a === 'open') window.open('/api/file/' + r.id, '_blank');
      if (a === 'dl') download(`/api/file/${r.id}?dl=1`, null, r.name);
      if (a === 'rec') openDetail(r.ent, r.rec_id, 'files');
      if (a === 'star') { await api('POST', `/api/file/${r.id}/star`, { on: !r.star }); r.star = !r.star; draw(); }
      if (a === 'del') { if (!await ask('Chuyển vào thùng rác', `Chuyển «${esc(r.name)}» vào thùng rác? Có thể khôi phục lại.`, { danger: 1, okLabel: 'Chuyển' })) return; await api('DELETE', `/api/file/${r.id}`); toast('Đã chuyển vào thùng rác'); await refresh(); }
      if (a === 'back') { await api('POST', `/api/file/${r.id}/restore`, {}); toast('Đã khôi phục tệp'); await refresh(); }
    });
    setTimeout(() => document.addEventListener('click', () => c.remove(), { once: true }));
  };

  const upload = (picked = []) => {
    const ents = VT_ENTS.filter(k => M.ents[k]?.perm.r); if (!ents.length) return;
    const here = s.tab === 'all' && ents.includes(s.ent) ? s.ent : ents[0], sample = s.rec && rows.find(r => r.ent === s.ent && r.rec_id === +s.rec);
    const m = modal({ title: 'Tải tệp lên', narrow: true, body: `<div class="col"><div class="fld"><label>Loại hồ sơ</label><select id="uE">${ents.map(k => `<option value="${k}" ${k === here ? 'selected' : ''}>${esc(M.ents[k].title)}</option>`).join('')}</select></div><div class="fld"><label>Hồ sơ<span class="req">*</span></label><div id="uR"></div></div><div class="fld"><label>Loại tệp</label><select id="uK"></select></div><div class="fld"><label>Tệp<span class="req">*</span></label><button type="button" class="btn" id="uP">${ico('fa-paperclip')} Chọn tệp</button><div class="small muted" id="uN"></div></div></div>`, foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="uOk">${ico('fa-upload')} Tải lên</button>` });
    let list = [...picked];
    const names = () => { $('#uN', m.el).textContent = list.map(x => x.name).join(', '); };
    const ent = () => $('#uE', m.el).value;
    const setEnt = (id = '', label = '') => {
      const k = ent();
      $('#uR', m.el).innerHTML = `<div class="combo" data-ref="${k}"><input type="text" placeholder="Gõ để tìm ${esc(M.ents[k].one)}…" value="${esc(label)}" autocomplete="off" data-combo><input type="hidden" name="rec" value="${id}"><button type="button" class="x" tabindex="-1" title="Bỏ chọn">${ico('fa-xmark')}</button></div>`;
      combo($('.combo', m.el), m.el);
      $('#uK', m.el).innerHTML = (M.ents[k].files?.length ? M.ents[k].files : [['tai_lieu', 'Tài liệu']]).map(x => `<option value="${x[0]}">${esc(x[1])}</option>`).join('');
    };
    setEnt(sample ? sample.rec_id : '', sample ? sample.label || '' : '');
    names();
    $('#uE', m.el).onchange = () => setEnt();
    $('#uP', m.el).onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.onchange = () => { list = [...i.files]; names(); }; i.click(); };
    $('#uOk', m.el).onclick = run(async () => {
      const id = $('input[name=rec]', m.el).value;
      if (!id) return toast('Cần chọn hồ sơ để gắn tệp', true);
      if (!list.length) return toast('Chưa chọn tệp', true);
      const fd = new FormData(); fd.append('kind', $('#uK', m.el).value); list.forEach(x => fd.append('file', x, x.name));
      await api('POST', `/api/files/${ent()}/${id}`, fd);
      m.close(); toast('Đã tải tệp'); s.tab === 'trash' ? await go('all') : await refresh();
    });
  };

  main.innerHTML = `<style>${VT_CSS}</style><div class="page">${head('05', 'Hồ sơ & lưu trữ theo căn', 'fa-folder-tree', `<select id="vtP" aria-label="Dự án"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+f.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>`, '5.6')}
    <div class="vt"><aside class="vt-side"><button class="vt-new" id="vtN">${ico('fa-plus')} Mới</button><nav class="vt-nav" id="vtNav">${VT_NAV.map(n => `<button data-tab="${n[0]}">${ico(n[1])} ${n[2]}</button>`).join('')}</nav><div class="vt-use" id="vtU"></div></aside>
    <section class="vt-main" id="vtM"><div class="vt-q">${ico('fa-magnifying-glass')}<input type="text" id="vtQ" aria-label="Tìm trong Kho hồ sơ" placeholder="Tìm tên tệp, mã căn, khách hàng…"></div>
    <div class="vt-top"><div class="vt-crumbs" id="vtC"></div><button class="btn pri" id="vtUp">${ico('fa-upload')} Tải lên</button><select id="vtS" aria-label="Sắp xếp"><option value="name">Tên</option><option value="date">Mới nhất</option><option value="size">Dung lượng</option></select><div class="vt-seg" id="vtV"><button data-v="grid" title="Dạng lưới" aria-label="Dạng lưới">${ico('fa-table-cells-large')}</button><button data-v="list" title="Dạng danh sách" aria-label="Dạng danh sách">${ico('fa-list')}</button></div></div>
    <div id="vtB"></div></section></div></div>`;
  $('.vt', main).classList.add('vt-one'); $('#vtP', main).style.display = 'none';   // chỉ còn In bộ hồ sơ: ẩn menu Kho + ô lọc dự án của Kho (màn in có ô chọn dự án riêng)
  $('#vtP', main).onchange = run(async e => { f.project = e.target.value; Object.assign(s, { ent: '', rec: '' }); await refresh(); });
  $('#vtQ', main).oninput = debounce(e => { q = e.target.value.trim().toLowerCase(); draw(); }, 200);
  $('#vtS', main).onchange = e => { s.sort = e.target.value; draw(); };
  $('#vtN', main).onclick = $('#vtUp', main).onclick = () => upload();
  main.onclick = run(async e => {
    if (e.target.closest('.hsm')) return;   // tab «Bộ hồ sơ theo căn» có nút riêng (data-m = chế độ, …) — không lẫn với menu tệp của Kho (17/11/2026)
    const nav = e.target.closest('[data-tab]'); if (nav) return go(nav.dataset.tab);
    const v = e.target.closest('[data-v]'); if (v) { s.view = v.dataset.v; return draw(); }
    const c = e.target.closest('[data-c]'); if (c) return c.dataset.c === 'root' ? go('all') : c.dataset.c === 'ent' ? go('all', s.ent) : undefined;
    const fe = e.target.closest('[data-e]'); if (fe) return go('all', fe.dataset.e);
    const fr = e.target.closest('[data-r]'); if (fr) return go('all', s.ent, fr.dataset.r);
    const mo = e.target.closest('[data-m]'); if (mo && byId(mo.dataset.m)) { e.stopPropagation(); const b = mo.getBoundingClientRect(); return menu(byId(mo.dataset.m), b.left, b.bottom + 4); }
    const fl = e.target.closest('[data-f]'); if (fl) { if (s.tab === 'trash') return menu(byId(fl.dataset.f), e.clientX, e.clientY); window.open('/api/file/' + fl.dataset.f, '_blank'); }
  });
  main.oncontextmenu = e => { const fl = !e.target.closest('.hsm') && e.target.closest('[data-f]'); if (!fl) return; e.preventDefault(); menu(byId(fl.dataset.f), e.clientX, e.clientY); };
  main.onkeydown = e => { if (e.key === 'Enter' && e.target.matches('.vt-d')) e.target.click(); };
  const box = $('#vtM', main);
  box.ondragover = e => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); box.classList.add('drop'); };
  box.ondragleave = e => { if (!box.contains(e.relatedTarget)) box.classList.remove('drop'); };
  box.ondrop = e => { box.classList.remove('drop'); if (!e.dataTransfer.files.length) return; e.preventDefault(); upload([...e.dataTransfer.files]); };
  await refresh();
};

// ======================= 06. SỔ CÔNG NỢ =======================
V.ledger = async main => {
  const f = filt(); const s = ST.ledger ||= { filter: '', q: '' };
  const draw = async () => {
    main.innerHTML = `<div class="page">${head('06', 'Sổ công nợ chi tiết căn hộ', 'fa-book-open', `<button class="btn" id="lx">${ico('fa-file-excel')} Xuất file</button><a class="btn" href="#/e/collect_plan">${ico('fa-chart-line')} Kế hoạch thu</a>`, 'CN-01')}${filterBar(f, { period: false })}<div id="lg"><div class="empty">Đang tính công nợ…</div></div></div>`;
    wireFilter(main, f, draw);
    const d = await api('GET', '/api/ledger?' + qsOf({ project: f.project, building: f.building, filter: s.filter, q: s.q }));
    $('#srcLine', main).innerHTML = `<span>${ico('fa-database')} Thực thu đồng bộ Bravo${d.bravo_sync ? ' — chốt ' + dmyhm(d.bravo_sync) : ''}</span><span>Phải thu = lịch thanh toán hiệu lực (gồm phụ lục)</span>`;
    const T = d.totals;
    const cols = [['project', 'Dự án'], ['building', 'Tòa'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['number', 'Số HĐ'], ['total', 'Phải thu', 'money'], ['paid', 'Đã thu', 'money'], ['paid_pct', '% thu', 'num'], ['left', 'Còn phải thu', 'money'], ['due', 'Đến hạn chưa thu', 'money'], ['overdue', 'Quá hạn', 'money'], ['overdue_days', 'Ngày quá hạn', 'int'], ['next_due', 'Kỳ tới', 'date'], ['promise', 'Cam kết'], ['plan_expected', 'KH tháng này', 'money'], ['owner', 'Phụ trách']];
    $('#lg', main).innerHTML = `<div class="grid g5 mb">${[['Phải thu', T.total], ['Đã thu', T.paid], ['Còn phải thu', T.left], ['Nợ quá hạn', T.overdue, 1], ['Đến hạn 7 ngày', T.due7]].map(([l, v, red]) => `<div class="card kpi ${red && v ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:20px">${fmB(v || 0)}</div><div class="s">${fm(v || 0)} đ</div></div>`).join('')}</div>
      <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="lq" placeholder="Mã căn, khách hàng, số HĐ…" value="${esc(s.q)}"></div><span class="grow"></span><span class="small muted">${d.rows.length} hợp đồng</span></div>
      <div class="tabs">${[['', 'Tất cả'], ['overdue', 'Có nợ quá hạn'], ['due7', 'Đến hạn ≤ 7 ngày'], ['noplan', 'Còn nợ, chưa có kế hoạch tháng'], ['left', 'Còn nợ'], ['done', 'Đã thu đủ']].map(([k, l]) => `<button data-fl="${k}" class="${s.filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>${rowsTable(cols, d.rows, ['total', 'paid', 'left', 'due', 'overdue', 'plan_expected'])}</div>`;
    $('#lq', main).oninput = debounce(async e => { s.q = e.target.value; await draw(); const q = $('#lq', main); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 400);   // giữ con trỏ trong ô tìm sau khi vẽ lại (rà soát 07/11/2026)
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
  const boss = ['lanh_dao', 'truong_phong', 'admin'].includes(M.me.role);   // vai trò khác chỉ xem được KPI
  const f = filt(); let kind = boss ? params.k || 'sales' : 'kpi', group = 'building';
  const draw = async () => {
    main.innerHTML = `<div class="page">${head('11', 'Báo cáo quản trị', 'fa-chart-pie', `<button class="btn" id="rx">${ico('fa-file-excel')} Xuất file</button><button class="btn" onclick="print()">${ico('fa-print')} In / PDF</button>`)}${filterBar(f)}
      <div class="card"><div class="tabs">${Object.entries(M.reports).filter(([k]) => boss || k === 'kpi').map(([k, l]) => `<button data-k="${k}" class="${kind === k ? 'on' : ''}">${esc(l.replace('Báo cáo ', ''))}</button>`).join('')}</div><div id="rb" class="bd"><div class="empty">Đang tổng hợp…</div></div></div></div>`;
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
    main.innerHTML = `<div class="page">${head('12', 'Tài khoản – phân quyền', 'fa-users-gear', `${M.imports.users ? `<button class="btn" id="uImp">${ico('fa-file-import')} Nhập file</button>` : ''}<button class="btn pri" id="uNew">${ico('fa-user-plus')} Thêm tài khoản</button>`, '12.1')}
      <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Chức danh</th><th>Điện thoại</th><th>Đăng nhập gần nhất</th><th title="Được duyệt hợp đồng mua bán, thuê, hoàn thiện, vay trực tiếp trên hệ thống (không phải thẩm quyền ký)">Duyệt HĐ</th><th>Trạng thái</th><th></th></tr></thead><tbody>${us.map(u => `<tr data-id="${u.id}"><td><b>${esc(u.username)}</b>${u.is_trial ? ' <span class="tag demo">thử</span>' : ''}</td><td>${esc(u.full_name)}</td><td>${esc(roleName(u.role))}</td><td class="small">${esc(u.title || '')}</td><td>${esc(u.phone || '')}</td><td>${dmyhm(u.last_login)}</td><td>${u.ct_approve || ['truong_phong', 'lanh_dao', 'admin'].includes(u.role) ? pill(u.ct_approve ? 'Được duyệt' : 'Theo vai trò', u.ct_approve ? 'g' : 's') : '<span class="muted">—</span>'}</td><td>${u.active ? (u.must_change ? pill('Chờ đổi mật khẩu', 'a') : pill('Hoạt động', 'g')) : pill('Đã khóa', 's')}</td><td class="nowrap"><button class="btn sm" data-e="${u.id}">${ico('fa-pen')}</button> <button class="btn sm" data-r="${u.id}" title="Đặt lại mật khẩu">${ico('fa-key')}</button></td></tr>`).join('')}</tbody></table></div></div>
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
    const F = [{ k: 'username', l: 'Tên đăng nhập', t: 'text', req: 1, help: 'chữ không dấu, số, dấu chấm' }, { k: 'full_name', l: 'Họ tên', t: 'text', req: 1 }, { k: 'role', l: 'Vai trò', t: 'sel', req: 1, o: M.roles.map(r => [r[0], r[1]]) }, { k: 'title', l: 'Chức danh', t: 'text' }, { k: 'dept', l: 'Bộ phận', t: 'text' }, { k: 'phone', l: 'Điện thoại', t: 'text' }, { k: 'email', l: 'Email', t: 'text' }, { k: 'ct_approve', l: 'Được duyệt hợp đồng', t: 'bool', help: 'Duyệt trực tiếp HĐ mua bán, thuê, hoàn thiện, vay trên hệ thống — không bắt buộc trình lãnh đạo. HĐ mua bán / thuê căn hộ NOXH vẫn phải có hồ sơ được Sở Xây dựng duyệt đủ điều kiện. Quyền duyệt trên hệ thống tách với thẩm quyền ký hợp đồng' }, ...(u ? [{ k: 'active', l: 'Đang hoạt động', t: 'bool' }] : [])];   // ct_approve: 16/11/2026
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
// ---------- Bộ hồ sơ theo căn (12/11/2026) ----------
// Gõ mã căn → app gợi ý bộ hồ sơ của bước đang làm (mua bán / HĐ vay / thanh lý HĐ vay / bàn giao / thanh lý mua bán) → tích hồ sơ cần in → In cả bộ (sửa được trước khi in) hoặc tải Word.
// Số liệu tự lấy từ dữ liệu đã khai báo (khách hàng, phiếu đăng ký, hồ sơ NOXH, HĐMB / HĐ thỏa thuận / HĐ vay, phiếu thu); hồ sơ nào thiếu dữ liệu thì ghi rõ thiếu gì.
// gộp vào Kho hồ sơ (12/11/2026, Tâm: «bộ hồ sơ với lưu trữ hồ sơ bản chất là 1») — mục «Bộ hồ sơ theo căn» trong #/v/vault
V.hoso = (main, params = {}) => V.vault(main, { ...params, tab: 'bo' });
async function hosoPanel(main, params = {}) {
  const S = ST.hoso ||= { unit: '', bo: '', off: {}, cust: '' };
  if (params.unit) S.unit = params.unit;
  if (params.unit && params.cust !== undefined) S.cust = +params.cust || '';   // mở từ thẻ gợi ý bước tiếp theo
  if (params.bo) S.bo = params.bo;
  main.innerHTML = `<div class="hs-emb">
    <div class="card hs-find"><form id="hsF" class="hs-q">${ico('fa-magnifying-glass')}<input id="hsQ" list="hsL" placeholder="Gõ mã căn hộ hoặc mã khách hàng (SĐT, CCCD cũng được) — ví dụ TNS-E-0303, KH000235" value="${esc(S.unit)}" autocomplete="off"><datalist id="hsL"></datalist><button class="btn pri">${ico('fa-arrow-right')} Mở bộ hồ sơ</button></form>
      <div class="small muted">Chọn bước đang làm → app sổ ra các hồ sơ của bước đó, đã điền sẵn số liệu đã khai báo. Tích hồ sơ cần in → <b>In cả bộ</b> hoặc <b>Tải Word</b> để sửa tiếp.</div></div>
    <div id="hsB"></div></div>`;
  const box = $('#hsB', main);
  let d = null, tmr = 0;
  const ST_L = { du_thao: 'Dự thảo', cho_duyet: 'Đang rà soát', cho_ky: 'Chờ ký', tu_choi: 'Trả lại', da_ky: 'Đã ký', thanh_ly: 'Đã thanh lý', huy: 'Đã hủy' };
  const ct = (l, c, ent) => c ? `<div class="hs-kv"><span>${l}</span><b><a href="#" data-op="${ent}:${c.id}">${esc(c.number || '#' + c.id)}</a></b><small>${esc(ST_L[c.status] || c.status || '')}${c.on ? ' · ký ' + esc(c.on) : ''}</small></div>` : `<div class="hs-kv off"><span>${l}</span><b class="muted">chưa có</b></div>`;
  const draw = () => {
    if (!d) { box.innerHTML = ''; return; }
    const bo = d.bos.find(b => b.k === S.bo) || d.bos.find(b => b.k === d.step);
    S.bo = bo.k;
    const off = S.off[d.unit.id + bo.k] ||= new Set();
    const sel = bo.tpls.filter(t => !off.has(t.code));
    const miss = [...new Set(sel.flatMap(t => t.missing))];
    box.innerHTML = `<div class="card hs-unit"><div class="hs-u1"><div class="hs-code">${ico('fa-building')} <b>${esc(d.unit.code)}</b></div><div class="muted">${esc(d.unit.project)} · ${esc(d.unit.building)}${d.unit.area ? ' · ' + String(d.unit.area).replace('.', ',') + ' m²' : ''}</div>
        <div class="hs-cust">${d.customer ? `${ico('fa-user')} <a href="#" data-op="customer:${d.customer.id}"><b>${esc(d.customer.name)}</b></a> <span class="muted">· Mã KH: <b>${esc(d.customer.code || '—')}</b>${d.customer.phone ? ' · ' + esc(d.customer.phone) : ''}</span>${d.units.length ? `<div class="hs-units small">Khách có ${d.units.length} căn: ${d.units.map(c => `<button class="tag${c === d.unit.code ? ' ok' : ''}" data-un="${esc(c)}">${esc(c)}</button>`).join(' ')}</div>` : ''}` : `<span class="muted">${ico('fa-user-slash')} Căn chưa có khách hàng</span>`}</div></div>
        <div class="hs-u2">${ct('HĐ mua bán', d.hdmb, 'contract')}${ct('HĐ thỏa thuận hoàn thiện', d.ht, 'contract')}${ct('HĐ vay', d.vay, 'contract')}</div></div>
      ${hist()}
      <div class="hs-steps">${d.bos.map((b, i) => `<button class="hs-step${b.k === bo.k ? ' on' : ''}" data-bo="${b.k}"><span class="n">${i + 1}</span><span class="l">${esc(b.l)}</span><span class="c">${b.tpls.length} hồ sơ</span>${b.k === d.step ? '<span class="tag ok">bước hiện tại</span>' : ''}</button>`).join('')}</div>
      <div class="card hs-list">
        ${bo.tpls.length ? `<div class="hs-lh"><label class="chk"><input type="checkbox" id="hsAll" ${sel.length === bo.tpls.length ? 'checked' : ''}> <b>${esc(bo.l)}</b> — ${sel.length}/${bo.tpls.length} hồ sơ được chọn</label></div>
          ${bo.tpls.map(t => `<div class="hs-row${off.has(t.code) ? ' off' : ''}"><label class="chk"><input type="checkbox" data-ck="${esc(t.code)}" ${off.has(t.code) ? '' : 'checked'}></label>
            <div class="hs-n">${ico(t.kind === 'hop_dong' ? 'fa-file-signature' : t.kind === 'bien_ban' ? 'fa-file-circle-check' : t.kind === 'phu_luc' ? 'fa-file-lines' : 'fa-file-pen')} <b>${esc(t.name)}</b>${t.annex?.length ? `<div class="small muted">${ico('fa-paperclip')} In chung 1 file gồm: Hợp đồng + ${esc(t.annex.join(' + '))}</div>` : ''}${(t.warn || []).map(w => `<div class="small hs-miss">${ico('fa-circle-exclamation')} ${esc(w)}</div>`).join('')}
              <div class="small">${t.missing.length ? `<span class="hs-miss">${ico('fa-triangle-exclamation')} Thiếu: ${esc(t.missing.join(', '))}</span>` : `<span class="hs-ok">${ico('fa-circle-check')} Đủ dữ liệu</span>`}</div></div>
            <div class="hs-a"><button class="btn sm" data-pv="${esc(t.code)}" title="Xem / in riêng hồ sơ này">${ico('fa-print')} In</button><button class="btn sm" data-wd="${esc(t.code)}" title="Tải Word để sửa">${ico('fa-file-word')} Word</button><button class="btn sm" data-sv="${esc(t.code)}" title="Lưu bản Word vào Kho hồ sơ (gắn vào hợp đồng của căn)">${ico('fa-box-archive')} Lưu</button></div></div>`).join('')}
          ${miss.length ? `<div class="warnbar mt">${ico('fa-circle-info')}<span>Hồ sơ đã chọn còn thiếu: <b>${esc(miss.join(', '))}</b>. Chỗ thiếu in ra «…………» để điền tay — hoặc bổ sung ở ${d.customer ? `<a href="#" data-op="customer:${d.customer.id}">khách hàng</a>` : 'khách hàng'}${d.hdmb ? `, <a href="#" data-op="contract:${d.hdmb.id}">HĐ mua bán</a>` : ''}${d.vay ? `, <a href="#" data-op="contract:${d.vay.id}">HĐ vay</a>` : ''} rồi mở lại.</span></div>` : ''}
          <div class="hs-foot"><button class="btn pri" id="hsP" ${sel.length ? '' : 'disabled'}>${ico('fa-print')} In cả bộ (${sel.length})</button><button class="btn" id="hsW" ${sel.length ? '' : 'disabled'}>${ico('fa-file-word')} Tải Word cả bộ</button><button class="btn" id="hsS" ${sel.length ? '' : 'disabled'} title="Lưu bản Word cả bộ vào Kho hồ sơ, gắn vào hợp đồng của căn">${ico('fa-box-archive')} Lưu cả bộ vào kho</button></div>`
        : `<div class="empty">Chưa có mẫu nào cho ${esc(bo.l)} của căn này — thêm ở Quản trị › Mẫu biểu (ô «Thuộc bộ hồ sơ»).</div>`}</div>
      <div class="card hs-saved" id="hsSv"><div class="empty">Đang tải tệp đã lưu…</div></div>`;
    saved();
  };
  // tệp đã lưu trong Kho của căn này (mọi hồ sơ gắn với căn: HĐ, phiếu, biên bản…)
  const saved = async () => {
    const el = $('#hsSv', main); if (!el || !d) return;
    let fs = []; try { fs = (await api('GET', '/api/vault')).filter(r => r.unit === d.unit.code); } catch { }
    el.innerHTML = `<div class="hs-lh"><b>${ico('fa-box-archive')} Đã lưu trong kho của căn ${esc(d.unit.code)}</b> — ${fs.length} tệp</div>${fs.length ? fs.map(r => `<div class="hs-row" data-hf="${r.id}" style="cursor:pointer">${vtIcon(r.name)}<div class="hs-n"><b>${esc(r.name)}</b><div class="small muted">${esc(r.ent_l)} ${esc(r.label || '')} · ${esc(r.kind_l)}${r.version > 1 ? ' · phiên bản ' + r.version : ''} · ${esc(dmyhm(r.uploaded_at))}${r.by ? ' · ' + esc(r.by) : ''}</div></div><div class="hs-a"><button class="btn sm" data-hd="${r.id}" data-n="${esc(r.name)}">${ico('fa-download')} Tải</button></div></div>`).join('') : '<div class="empty">Chưa có tệp nào — in xong bấm «Lưu» để cất bản Word vào đây.</div>'}`;
  };
  // lịch sử khách hàng của căn (mỗi căn có thể qua nhiều khách: thanh lý / hủy rồi bán lại) — bấm khách để xem bộ hồ sơ của khách đó
  const hist = () => d.history.length ? `<div class="card hs-hist"><div class="hs-lh"><b>${ico('fa-clock-rotate-left')} Lịch sử khách hàng của căn ${esc(d.unit.code)}</b> — ${d.history.length} khách · bấm một khách để xem / in bộ hồ sơ của khách đó</div>
    <div class="tbl-wrap"><table class="t hs-ht"><thead><tr><th></th><th>Khách hàng · trạng thái</th><th>Giao dịch với căn</th><th>Thời gian</th></tr></thead><tbody>${d.history.map(h => `<tr data-cu="${h.id}" class="${h.id === d.cust ? 'on' : ''}">
      <td>${h.id === d.cust ? ico('fa-circle-dot') : ico('fa-circle', 'muted')}</td><td><b>${esc(h.name)}</b> <span class="hs-st ${h.tone}">${esc(h.st)}</span>${h.current ? ' <span class="small muted">· khách hiện tại</span>' : ''}<div class="small muted">Mã KH: ${esc(h.code || '—')}${h.phone ? ' · ' + esc(h.phone) : ''}</div></td>
      <td>${h.items.map(x => `<div class="small"><a href="#" data-op="${x.ent}:${x.id}">${esc(x.t)} ${esc(x.no)}</a> · ${esc(x.st)}${x.d ? ' · ' + esc(dmy(x.d)) : ''}</div>`).join('')}</td>
      <td class="small nowrap">${esc(h.from || '')}${h.to && h.to !== h.from ? ' → ' + esc(h.to) : ''}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  const codes = () => { const bo = d.bos.find(b => b.k === S.bo), off = S.off[d.unit.id + bo.k]; return bo.tpls.filter(t => !off.has(t.code)).map(t => t.code); };
  const load = async () => {
    const k = $('#hsQ', main).value.trim(); if (!k) return;
    box.innerHTML = '<div class="empty">Đang tải…</div>';
    try { d = await api('GET', '/api/hs?unit=' + encodeURIComponent(k) + (S.cust ? '&cust=' + S.cust : '')); S.cust = d.cust || ''; S.unit = d.unit.code; if (!d.bos.some(b => b.k === S.bo)) S.bo = ''; if (d.added) toast(`Dự án ${d.unit.project} chưa có mẫu — đã tự thêm ${d.added} mẫu hồ sơ cho dự án (sửa ở Quản trị › Mẫu biểu)`); history.replaceState(null, '', '#/v/vault?tab=bo&unit=' + encodeURIComponent(d.unit.code)); }
    catch (e) { d = null; box.innerHTML = `<div class="empty">${ico('fa-circle-exclamation')} ${esc(e.message)}</div>`; return; }
    draw();
  };
  $('#hsF', main).onsubmit = e => { e.preventDefault(); S.bo = ''; S.cust = ''; load(); };
  $('#hsQ', main).oninput = e => { clearTimeout(tmr); const v = e.target.value.trim(); if (v.length < 2) return;
    tmr = setTimeout(async () => { try { const [r, k] = await Promise.all([api('GET', '/api/e/unit?limit=10&sort=code&q=' + encodeURIComponent(v)), api('GET', '/api/e/customer?limit=8&q=' + encodeURIComponent(v)).catch(() => ({ rows: [] }))]);
      $('#hsL', main).innerHTML = r.rows.map(u => `<option value="${esc(u.code)}">Căn hộ</option>`).join('') + k.rows.filter(c => c.code).map(c => `<option value="${esc(c.code)}">Khách: ${esc(c.full_name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`).join(''); } catch { } }, 250); };
  $('#hsQ', main).onchange = e => { if (/^[A-Z]+-[A-Z0-9]+-\d+$|^KH\d+/i.test(e.target.value.trim())) { S.bo = ''; S.cust = ''; load(); } };
  box.onclick = run(async e => {
    const x = e.target, off = d && S.off[d.unit.id + S.bo];
    const op = x.closest('[data-op]'); if (op) { e.preventDefault(); const [ent, id] = op.dataset.op.split(':'); return openForm(ent, { id: +id, onSaved: load }); }
    const un = x.closest('[data-un]'); if (un) { $('#hsQ', main).value = un.dataset.un; S.bo = ''; S.cust = ''; return load(); }
    const cu = x.closest('tr[data-cu]'); if (cu && !x.closest('a')) { S.cust = +cu.dataset.cu; S.bo = ''; $('#hsQ', main).value = d.unit.code; return load(); }
    const st = x.closest('[data-bo]'); if (st) { S.bo = st.dataset.bo; return draw(); }
    if (x.id === 'hsAll') { const bo = d.bos.find(b => b.k === S.bo); x.checked ? off.clear() : bo.tpls.forEach(t => off.add(t.code)); return draw(); }
    const ck = x.closest('[data-ck]'); if (ck) { ck.checked ? off.delete(ck.dataset.ck) : off.add(ck.dataset.ck); return draw(); }
    const pv = x.closest('[data-pv]'); if (pv) return window.open(`/print/hs/${d.unit.id}?bo=${S.bo}&cust=${d.cust || ''}&tpl=${encodeURIComponent(pv.dataset.pv)}`, '_blank');
    const wd = x.closest('[data-wd]'); if (wd) return download(`/print/hs/${d.unit.id}?fmt=docx&cust=${d.cust || ''}&tpl=${encodeURIComponent(wd.dataset.wd)}`);
    if (x.closest('#hsP')) return window.open(`/print/hs/${d.unit.id}?bo=${S.bo}&cust=${d.cust || ''}&tpl=${encodeURIComponent(codes().join(','))}`, '_blank');
    if (x.closest('#hsW')) return download(`/print/hs/${d.unit.id}?fmt=docx&cust=${d.cust || ''}&tpl=${encodeURIComponent(codes().join(','))}`);
    const sv = x.closest('[data-sv]') || x.closest('#hsS'); if (sv) { sv.disabled = true;
      try { const r = await api('POST', `/api/hs/${d.unit.id}/save`, { tpl: sv.dataset.sv || codes().join(','), bo: S.bo, cust: d.cust }); toast(`Đã lưu «${r.file.name}» vào kho, gắn với ${r.where}`); await saved(); } finally { sv.disabled = false; } return; }
    const hd = x.closest('[data-hd]'); if (hd) return download(`/api/file/${hd.dataset.hd}?dl=1`, null, hd.dataset.n);
    const hf = x.closest('[data-hf]'); if (hf) return window.open('/api/file/' + hf.dataset.hf, '_blank');
  });
  window.__ctgHsSaved = () => { if ($('#hsSv', main)?.isConnected) saved(); };   // trang in vừa «Lưu bản đã sửa vào kho»
  if (!window.__ctgHsCh && window.BroadcastChannel) { window.__ctgHsCh = new BroadcastChannel('ctg-hs'); window.__ctgHsCh.addEventListener('message', e => { if (e.data?.t === 'saved') window.__ctgHsSaved?.(); }); }   // tab in mở tách riêng (noopener) báo về qua kênh
  if (S.unit) await load();
}
// ---------- Bộ hồ sơ: 2 chế độ «In hàng loạt» (mặc định — Tâm dùng nhiều nhất, 13/11/2026) / «Một căn» ----------
const HSB_KEY = 'ctg-hs-batch';
async function hsTabs(main, params = {}) {
  let mode = params.unit ? 'one' : (lsGet('ctg-hs-mode') || 'batch');
  main.innerHTML = `<div class="hsm"><div class="hsm-sw" id="hsmSw"><button data-m="batch">${ico('fa-layer-group')} In hàng loạt</button><button data-m="one">${ico('fa-building')} Một căn</button></div><div id="hsmB"></div></div>`;
  const show = async () => { $$('#hsmSw button', main).forEach(b => b.classList.toggle('on', b.dataset.m === mode)); const host = $('#hsmB', main);
    if (mode === 'one') await hosoPanel(host, params); else await batchPanel(host, { openOne: code => { mode = 'one'; params = { unit: code }; show(); } }); };
  $('#hsmSw', main).onclick = e => { const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === mode) return; mode = b.dataset.m; lsSet('ctg-hs-mode', mode); if (mode === 'batch') params = {}; show(); };
  await show();
}
// ---------- In hàng loạt (13/11/2026): màn chính, tự động hóa tối đa ----------
// · App quét cả dự án: mỗi căn biết khách đang giao dịch, bước hồ sơ đang làm, đã in bộ của bước đó chưa → nút gợi ý «Cần in», «Mới ký HĐMB», theo bước
// · Bước «Tự động»: mỗi căn in đúng bộ của bước căn đó đang làm (căn A bộ mua bán, căn B bộ bàn giao… trong cùng 1 lần in)
// · Kiểm tra thiếu dữ liệu tự chạy khi đổi lựa chọn, có nút «Sửa» mở thẳng HĐ / khách
// · Trên 30 căn tự chia phần để máy không treo; «Lưu vào kho» cả loạt; nhớ dự án / bước / mẫu bỏ chọn theo máy
const HSB_STEPS = [['mua_ban', 'Mua bán', '#2563eb'], ['vay', 'HĐ vay', '#7c3aed'], ['ban_giao', 'Bàn giao', '#059669'], ['tl_vay', 'Thanh lý HĐ vay', '#d97706'], ['tl_mua_ban', 'Thanh lý mua bán', '#dc2626']];
const HSB_PART = 30;
async function batchPanel(main, { openOne } = {}) {
  let saved0 = {}; try { saved0 = JSON.parse(lsGet(HSB_KEY) || '{}'); } catch { }
  const S = ST.hsb ||= { pid: +filt().project || saved0.pid || M.projects[0]?.id || 0, bo: saved0.bo || 'auto', sel: new Set(), cp: new Map(), off: new Set(saved0.off || []), tw: '', info: new Map(), scanned: new Set(), done: new Set(), view: saved0.view || 'khach', q: '' };
  const keep = () => lsSet(HSB_KEY, JSON.stringify({ pid: S.pid, bo: S.bo, off: [...S.off], view: S.view }));
  const canTpl = !!M.ents.template?.perm?.u;   // 17/11/2026: luồng sửa mẫu in ngay từ màn in
  const fold = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();   // tìm không dấu
  let units = [], keys = null, plan = null, kq = 0, pq = 0, tk = 0, tp = 0;
  document.removeEventListener('visibilitychange', window.__ctgHsbBack || (() => {}));   // bỏ cách cũ (mở tab mới)
  const stepL = k => HSB_STEPS.find(s => s[0] === k)?.[1] || '', stepC = k => HSB_STEPS.find(s => s[0] === k)?.[2] || '#94a3b8';
  const dayAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  main.innerHTML = `<div class="hsb">
    <div class="card hsb-top">
      <div class="hsb-r1"><select id="hbP">${M.projects.map(p => `<option value="${p.id}" ${p.id === S.pid ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>
        <div class="hsb-q">${ico('fa-magnifying-glass')}<input id="hbQ" placeholder="Gõ hoặc dán mã căn / mã KH — nhiều mã cách nhau dấu phẩy, xuống dòng (CTS-K-0201*3 = in 3 bản) rồi Enter" autocomplete="off"></div></div>
      <div class="hsb-sug" id="hbSug"></div></div>
    <div class="hsb-main"><div class="card hsb-units" id="hbU"><div class="empty">Đang quét dự án…</div></div>
      <aside class="card hsb-side" id="hbS"></aside></div></div>`;
  const U = $('#hbU', main), SD = $('#hbS', main);
  const list = () => [...S.sel].sort();
  const info = c => S.info.get(c);
  // ---- quét dự án
  const scan = async () => { U.innerHTML = '<div class="empty">Đang quét dự án…</div>';
    const r = await api('GET', '/api/hs-batch/scan?project=' + S.pid); units = r.units; for (const u of units) S.info.set(u.code, u); drawSug(); drawUnits(); };
  // ---- gợi ý nhanh
  const groups = () => {
    const live = units.filter(u => u.cust && u.current);
    return [
      ['need', 'fa-bolt', 'Cần in', 'Căn có khách đang giao dịch mà chưa in bộ hồ sơ của bước đang làm', live.filter(u => !u.printed)],
      ['new', 'fa-pen-nib', 'Mới ký HĐMB 7 ngày', 'HĐMB ký trong 7 ngày qua', live.filter(u => u.signed && u.signed >= dayAgo(7))],
      ...HSB_STEPS.map(([k, l]) => ['st:' + k, 'fa-circle', l, `Căn đang ở bước ${l}`, live.filter(u => u.step === k)]).filter(g => g[4].length) ];
  };
  const drawSug = () => { const gs = groups();
    $('#hbSug', main).innerHTML = `<span class="hsb-lbl">${ico('fa-wand-magic-sparkles')} Chọn nhanh:</span>${gs.filter(g => g[4].length || g[0] === 'need').map(([k, i, l, t, us]) => !us.length ? `<span class="hsb-chip done">${ico('fa-circle-check')} Đã in đủ bộ của bước đang làm</span>` : `<button class="hsb-chip${k === 'need' ? ' hot' : ''}" data-g="${k}" title="${esc(t)} — bấm để chọn ${us.length} căn">${k.startsWith('st:') ? `<span class="dot" style="background:${stepC(k.slice(3))}"></span>` : ico(i)} ${esc(l)} <b>${us.length}</b></button>`).join('')}
      ${S.sel.size ? `<button class="hsb-chip ghost" data-g="clr">${ico('fa-xmark')} Bỏ chọn hết (${S.sel.size})</button>` : ''}`; };
  // ---- lưới căn theo tòa
  // 17/11/2026: lưới gọn — mặc định chỉ căn có khách (căn trống làm rối mắt), xếp theo tầng, gõ ở ô tìm là lọc ngay (mã căn / tên khách / mã KH, không dấu)
  const need = u => u.cust && u.current && !u.printed;
  const hit = u => { const k = fold(S.q).trim(); if (!k) return true; return fold(`${u.code} ${u.cust} ${u.kcode}`).includes(k) || fold(u.code.split('-').pop()).startsWith(k); };
  const inView = u => (S.view === 'all' || (S.view === 'can_in' ? need(u) : !!u.cust)) && hit(u);
  const cell = u => `<button class="hsb-u${S.sel.has(u.code) ? ' on' : ''}${u.cust ? '' : ' off'}${need(u) ? ' need' : ''}" data-u="${esc(u.code)}" style="--c:${stepC(u.step)}" title="${esc(u.code)}${u.cust ? ` · ${u.cust}${u.kcode ? ' (' + u.kcode + ')' : ''} · bước ${stepL(u.step)}${u.printed ? ' · đã in ' + dmy(u.printed) : ' · chưa in'}` : ' · chưa có khách'}"><span class="c">${esc(u.code.split('-').pop())}${u.printed ? ico('fa-check', 'pr') : ''}${(S.cp.get(u.code) || 1) > 1 ? `<em>×${S.cp.get(u.code)}</em>` : ''}</span><span class="n">${esc(u.cust ? u.cust.split(' ').slice(-2).join(' ') : '—')}</span>${u.cust ? (u.printed || !u.current ? `<span class="s">${esc(stepL(u.step) || '')}</span>` : '<span class="s ni">Chưa in</span>') : ''}</button>`;
  const drawUnits = () => {
    if (!units.length) { U.innerHTML = '<div class="empty">Dự án chưa có căn hộ.</div>'; return; }
    const tws = [...new Map(units.map(u => [u.tower, u.tname]))];
    if (S.tw && !tws.some(t => t[0] === S.tw)) S.tw = '';
    const inTw = units.filter(u => !S.tw || u.tower === S.tw), show = inTw.filter(inView), byT = new Map(); for (const u of show) (byT.get(u.tower) || byT.set(u.tower, []).get(u.tower)).push(u);
    const nK = inTw.filter(u => u.cust).length, nN = inTw.filter(need).length;
    const stepN = k => inTw.filter(u => u.cust && u.step === k).length;
    U.innerHTML = `<div class="hsb-bar"><div class="hsb-tws"><button class="${S.tw ? '' : 'on'}" data-tw="">Tất cả tòa</button>${tws.map(([k, n]) => { const c = units.filter(u => u.tower === k && S.sel.has(u.code)).length; return `<button class="${S.tw === k ? 'on' : ''}" data-tw="${esc(k)}">${esc(n)}${c ? ` <b>${c}</b>` : ''}</button>`; }).join('')}</div>
        <div class="hsb-view">${[['khach', 'Có khách', nK], ['can_in', 'Cần in', nN], ['all', 'Tất cả căn', inTw.length]].map(([k, l, n]) => `<button class="${S.view === k ? 'on' : ''}" data-vw="${k}">${l} <b>${n}</b></button>`).join('')}</div></div>
      <div class="hsb-leg">${HSB_STEPS.filter(([k]) => stepN(k)).map(([k, l, c]) => `<span><i style="background:${c}"></i>${l} ${stepN(k)}</span>`).join('')}${S.view === 'all' ? '<span><i style="background:#cbd5e1"></i>Chưa có khách</span>' : ''}<span>${ico('fa-check')} đã in bộ của bước</span><span><i class="need-i"></i>chưa in</span></div>
      ${!show.length ? `<div class="hsb-none">${S.q ? `Không có căn khớp «${esc(S.q)}»${S.view !== 'all' ? ` trong «${S.view === 'can_in' ? 'Cần in' : 'Có khách'}» — <button class="lnk" data-vw="all">tìm trong tất cả căn</button>` : ''}`
          : S.view === 'can_in' ? `${ico('fa-circle-check')} Không còn căn nào cần in — mọi căn có khách đã in bộ của bước đang làm.` : `Chưa có căn nào có khách. <button class="lnk" data-vw="all">Xem tất cả căn</button>`}</div>` : ''}
      ${[...byT].map(([t, us]) => { const all = units.filter(u => u.tower === t), ok = all.filter(u => u.cust), k = ok.filter(u => S.sel.has(u.code)).length, fl = new Map();
        for (const u of us) { const f = u.floor ?? (/(\d{2})\d{2}$/.exec(u.code)?.[1] | 0); (fl.get(f) || fl.set(f, []).get(f)).push(u); }
        return `<div class="hsb-tg"><div class="hsb-th"><b>${esc(us[0].tname)}</b><span class="muted small">${all.length} căn · ${ok.length} có khách${S.view !== 'all' || S.q ? ` · đang hiện ${us.length}` : ''}</span><label class="chk small"><input type="checkbox" data-twall="${esc(t)}" ${ok.length && k === ok.length ? 'checked' : ''}> Chọn cả tòa (${ok.length} căn có khách)</label>${k ? `<span class="small hs-ok">đã chọn ${k}</span>` : ''}</div>
          ${[...fl].sort((x, y) => x[0] - y[0]).map(([f, xs]) => `<div class="hsb-fl"><span class="hsb-fn" title="Tầng ${f}">T${f}</span><div class="hsb-grid">${xs.map(cell).join('')}</div></div>`).join('')}</div>`; }).join('')}`;
  };
  // khung phải lúc chưa chọn: danh sách căn cần in (việc cần làm) — chọn từng căn hoặc cả loạt
  const todo = () => { const xs = units.filter(need), by = new Map(); for (const u of xs) by.set(u.step, (by.get(u.step) || 0) + 1);
    return !xs.length ? `<div class="hsb-empty">${ico('fa-circle-check')}<b>Không có căn nào cần in</b><span>Mọi căn có khách đã in bộ hồ sơ của bước đang làm. Bấm căn trong lưới, hoặc gõ mã căn / tên khách ở ô tìm để in lại.</span></div>`
      : `<div class="hsb-todo"><div class="hsb-fh"><b>${ico('fa-bolt')} Cần in · ${xs.length} căn</b></div>
        <div class="small muted">Có khách đang giao dịch, chưa in bộ hồ sơ của bước đang làm${by.size > 1 ? ' — ' + [...by].map(([k, n]) => `${stepL(k)} ${n}`).join(', ') : ''}.</div>
        <div class="hsb-tl">${xs.slice(0, 12).map(u => `<button data-u="${esc(u.code)}" style="--c:${stepC(u.step)}"><b>${esc(u.code)}</b><span>${esc(u.cust)}</span><em>${esc(stepL(u.step))}</em></button>`).join('')}${xs.length > 12 ? `<div class="small muted">… và ${xs.length - 12} căn nữa</div>` : ''}</div>
        <button class="btn pri" data-g="need">${ico('fa-check-double')} Chọn cả ${xs.length} căn cần in</button>
        <div class="small muted">Hoặc bấm từng căn trong lưới / gõ mã căn, tên khách ở ô tìm.</div></div>`; };
  // ---- khung phải: bước, hồ sơ, kiểm tra, in
  const drawSide = () => {
    const L = list(), by = new Map(), pb = new Map((plan?.units || []).map(u => [u.code, u.bo])); for (const c of L) { const s = S.bo !== 'auto' ? S.bo : info(c)?.step || pb.get(c) || '?'; by.set(s, (by.get(s) || 0) + 1); }
    const nb = L.reduce((s, c) => s + (S.cp.get(c) || 1), 0), parts = Math.ceil(L.length / HSB_PART);
    const other = L.filter(c => !units.some(u => u.code === c));
    const P = plan, ok = P ? P.units.filter(u => !u.error && u.n) : [], miss = ok.filter(u => u.missing.length), skip = P ? P.units.filter(u => u.error || !u.n) : [];
    const kOn = keys ? keys.filter(k => !S.off.has(k.key)) : [];
    SD.innerHTML = !L.length ? todo() : `
      <div class="hsb-sum"><b>${L.length}</b> căn${nb > L.length ? ` · <b>${nb}</b> bản` : ''}<div class="small muted">${[...by].map(([s, n]) => `<span class="hsb-st" style="--c:${stepC(s)}">${esc(stepL(s) || 'chưa rõ bước')} ${n}</span>`).join(' ')}${other.length ? ` · ${other.length} căn dự án khác` : ''}</div></div>
      <label class="hsb-f">Bước hồ sơ<select id="hbBo"><option value="auto" ${S.bo === 'auto' ? 'selected' : ''}>⚡ Tự động — mỗi căn in bộ của bước đang làm</option>${HSB_STEPS.map(([k, l]) => `<option value="${k}" ${S.bo === k ? 'selected' : ''}>Bộ ${l} cho tất cả căn</option>`).join('')}</select></label>
      <div class="hsb-f"><div class="hsb-fh">Hồ sơ sẽ in ${keys ? `<span class="muted small">${kOn.length}/${keys.length}</span><button class="lnk" id="hbKAll">${kOn.length === keys.length ? 'Bỏ hết' : 'Chọn hết'}</button>` : ''}${canTpl ? `<button class="lnk" data-tpl="" title="Mở màn Mẫu biểu (quản lý mọi mẫu in)">${ico('fa-pen-ruler')} Mẫu in</button>` : ''}</div>
        <div class="hsb-keys">${!keys ? '<div class="small muted">Đang lấy danh sách…</div>' : !keys.length ? '<div class="small muted">Chưa có mẫu cho bước này.</div>'
          : keys.map((k, i) => `${S.bo === 'auto' && k.bo !== keys[i - 1]?.bo ? `<div class="hsb-kg" style="--c:${stepC(k.bo)}">${esc(stepL(k.bo))}</div>` : ''}<div class="hsb-kr"><label class="chk"><input type="checkbox" data-k="${esc(k.key)}" ${S.off.has(k.key) ? '' : 'checked'}> ${esc(k.name)}</label></div>`).join('')}</div></div>
      <div class="hsb-f"><div class="hsb-fh">Kiểm tra dữ liệu</div><div id="hbK">${!P ? `<div class="small muted">${ico('fa-spinner fa-spin')} Đang kiểm tra từng căn…</div>`
        : `<div class="hsb-chk"><span class="hs-ok">${ico('fa-circle-check')} ${ok.length - miss.length} đủ</span>${miss.length ? `<span class="hs-miss">${ico('fa-triangle-exclamation')} ${miss.length} thiếu</span>` : ''}${skip.length ? `<span class="muted" title="${esc(skip.map(u => u.code + (u.error ? ': ' + u.error : ': không có mẫu')).join('\n'))}">${ico('fa-ban')} ${skip.length} bỏ qua</span>` : ''}</div>
          ${miss.length ? `<div class="hsb-miss">${miss.slice(0, 80).map(u => `<div><b>${esc(u.code)}</b> <span class="muted">${esc((u.customer || '').split(' · ')[0])}</span><div class="small hs-miss">${esc(u.missing.slice(0, 4).join(', '))}${u.missing.length > 4 ? ` +${u.missing.length - 4}` : ''}</div>
            <div class="hsb-fix">${u.hdmb_id || u.vay_id ? `<button class="lnk" data-fix="contract:${u.hdmb_id || u.vay_id}">${ico('fa-pen')} Sửa HĐ</button>` : ''}${u.cust_id ? `<button class="lnk" data-fix="customer:${u.cust_id}">${ico('fa-user-pen')} Sửa khách</button>` : ''}<button class="lnk" data-one="${esc(u.code)}">${ico('fa-up-right-from-square')} Mở căn</button></div></div>`).join('')}</div>
            <div class="small muted">Chỗ thiếu in ra «……» để điền tay.</div>` : ''}`}</div></div>
      <label class="hsb-f hsb-cp">Số bản mỗi căn <input type="number" id="hbCp" min="1" max="50" value="${new Set(L.map(c => S.cp.get(c) || 1)).size === 1 ? (S.cp.get(L[0]) || 1) : ''}" placeholder="…"></label>
      <div class="hsb-act">${parts <= 1 ? `<button class="btn pri" data-pr="0">${ico('fa-print')} In tất cả (${L.length} căn)</button><button class="btn" data-wd="0">${ico('fa-file-word')} Tải Word</button>`
        : `<div class="small hs-miss">${ico('fa-circle-info')} ${L.length} căn — tự chia ${parts} phần, mỗi phần ${HSB_PART} căn để máy không treo</div>${Array.from({ length: parts }, (_, i) => `<div class="hsb-part${S.done.has(i) ? ' done' : ''}"><span>Phần ${i + 1} · căn ${i * HSB_PART + 1}–${Math.min(L.length, (i + 1) * HSB_PART)}</span><button class="btn sm pri" data-pr="${i}">${ico(S.done.has(i) ? 'fa-check' : 'fa-print')} In</button><button class="btn sm" data-wd="${i}">${ico('fa-file-word')}</button></div>`).join('')}`}
        <button class="btn" id="hbSv" title="Lưu bản Word bộ hồ sơ của từng căn vào Kho, gắn vào hợp đồng của khách">${ico('fa-box-archive')} Lưu cả loạt vào kho</button></div>`;
  };
  const sel = () => S.sel.size ? list() : [];
  const kParam = () => keys && S.off.size && keys.some(k => S.off.has(k.key)) ? keys.filter(k => !S.off.has(k.key)).map(k => k.key).join(',') : '';
  const changed = () => { plan = null; S.done.clear(); drawSug(); drawUnits(); drawSide(); clearTimeout(tk); tk = setTimeout(() => loadKeys().catch(e => toast(e.message, true)), 250); };
  const loadKeys = async () => { const q0 = ++kq; if (!S.sel.size) { keys = null; return drawSide(); }
    const r = await api('POST', '/api/hs-batch/keys', { units: [...new Map(list().map(c => [c.replace(/-[^-]+$/, ''), c])).values()], bo: S.bo }); if (q0 !== kq) return;
    const steps = S.bo === 'auto' && list().every(c => info(c)?.step) ? new Set(list().map(c => info(c).step)) : null;   // có căn chưa rõ bước (dự án khác) → hiện mẫu mọi bước
    keys = r.keys.filter(k => !steps || !steps.size || steps.has(k.bo)); drawSide(); checkSoon(); };
  const checkSoon = () => { plan = null; drawSide(); clearTimeout(tp); tp = setTimeout(() => check().catch(e => toast(e.message, true)), 400); };
  const check = async () => { const q0 = ++pq; const r = await api('POST', '/api/hs-batch/plan', { units: list().slice(0, 200), bo: S.bo, keys: kParam() }); if (q0 !== pq) return; plan = r; drawSide(); };
  const part = i => list().slice(i * HSB_PART, (i + 1) * HSB_PART).map(c => (S.cp.get(c) || 1) > 1 ? `${c}*${S.cp.get(c)}` : c).join(',');
  const url = (i, fmt) => `/print/hs-batch?bo=${S.bo}&keys=${encodeURIComponent(kParam())}&units=${encodeURIComponent(part(i))}${fmt ? '&fmt=' + fmt : ''}`;
  const rescan = () => setTimeout(() => api('GET', '/api/hs-batch/scan?project=' + S.pid).then(r => { units = r.units; for (const u of units) S.info.set(u.code, u); drawSug(); drawUnits(); }).catch(() => { }), 2500);
  // ---- thêm mã căn / mã KH (gõ hoặc dán)
  const addCodes = run(async t => {
    const xs = [...new Set(String(t).split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))]; if (!xs.length) return;
    const bad = [];
    for (const y of xs) { const [, x, n] = /^(.+?)(?:\*(\d+))?$/.exec(y), X = x.toUpperCase();
      let code = units.find(u => u.code.toUpperCase() === X)?.code;
      if (!code) { const k = units.filter(u => u.kcode && u.kcode.toUpperCase() === X); if (k.length) { k.forEach(u => S.sel.add(u.code)); continue; } }
      if (!code) { try { const d = await api('GET', '/api/hs?unit=' + encodeURIComponent(x)); code = d.unit.code; } catch { bad.push(x); continue; } }
      S.sel.add(code); if (n) S.cp.set(code, Math.min(50, +n)); }
    $('#hbQ', main).value = ''; changed(); if (bad.length) toast(`Không tìm thấy: ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? '…' : ''}`, true);
  });
  $('#hbQ', main).oninput = e => { const v = e.target.value; S.q = /[\s,;*]/.test(v.trim()) ? '' : v; drawUnits(); };   // 1 từ khóa → lọc lưới ngay; danh sách mã → chờ Enter
  $('#hbQ', main).onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const v = e.target.value.trim(); if (!v) return;
    const X = v.toUpperCase(), exact = !/[\s,;*]/.test(v) && !units.some(u => u.code.toUpperCase() === X || u.code.toUpperCase().endsWith('-' + X) || (u.kcode || '').toUpperCase() === X);
    const m = exact ? units.filter(u => u.cust && hit(u)) : [];
    if (m.length) { m.forEach(u => S.sel.add(u.code)); e.target.value = ''; S.q = ''; toast(`Đã chọn ${m.length} căn khớp «${v}»`); return changed(); }
    const tail = !/[\s,;]/.test(v) && units.filter(u => u.code.toUpperCase().endsWith('-' + X.replace(/\*\d+$/, '')));   // gõ đuôi mã (0201) → căn đúng 1 tòa
    S.q = ''; addCodes(tail && tail.length === 1 ? tail[0].code + (/\*\d+$/.exec(v)?.[0] || '') : v); };
  $('#hbQ', main).onpaste = e => { const t = e.clipboardData?.getData('text') || ''; if (/[\s,;]/.test(t.trim())) { e.preventDefault(); addCodes(t); } };
  $('#hbP', main).onchange = run(async e => { S.pid = +e.target.value; S.tw = ''; keep(); await scan(); drawSide(); });
  main.onclick = run(async e => { const x = e.target;
    const g = x.closest('[data-g]'); if (g) { if (g.dataset.g === 'clr') { S.sel.clear(); S.cp.clear(); } else { const gr = groups().find(y => y[0] === g.dataset.g); gr?.[4].forEach(u => S.sel.add(u.code)); toast(`Đã chọn ${gr?.[4].length || 0} căn «${gr?.[2]}»`); } return changed(); }
    const tw = x.closest('[data-tw]'); if (tw) { S.tw = tw.dataset.tw; return drawUnits(); }
    const vw = x.closest('[data-vw]'); if (vw) { S.view = vw.dataset.vw; keep(); return drawUnits(); }
    if (x.closest('[data-tpl]')) { location.hash = '#/e/template'; return; }   // «Mẫu in»: sang màn Mẫu biểu (cùng tab — bản demo chỉ chạy 1 tab)
    const u = x.closest('[data-u]'); if (u) { const c = u.dataset.u; S.sel.has(c) ? S.sel.delete(c) : S.sel.add(c); return changed(); }
    const fx = x.closest('[data-fix]'); if (fx) { const [ent, id] = fx.dataset.fix.split(':'); return openForm(ent, { id: +id, onSaved: () => { checkSoon(); rescan(); } }); }
    const one = x.closest('[data-one]'); if (one) return openOne?.(one.dataset.one);
    if (x.closest('#hbKAll')) { const all = keys.every(k => !S.off.has(k.key)); keys.forEach(k => all ? S.off.add(k.key) : S.off.delete(k.key)); keep(); return checkSoon(); }
    const pr = x.closest('[data-pr]'); if (pr) { if (keys && !keys.some(k => !S.off.has(k.key))) return toast('Chọn ít nhất 1 hồ sơ', true); window.open(url(+pr.dataset.pr), '_blank'); S.done.add(+pr.dataset.pr); drawSide(); return rescan(); }
    const wd = x.closest('[data-wd]'); if (wd) { await download(url(+wd.dataset.wd, 'docx')); return rescan(); }
    if (x.closest('#hbSv')) { const b = x.closest('#hbSv'); b.disabled = true; let ok = 0; const err = [];
      try { const L = list(); for (let i = 0; i < L.length; i += 10) { b.innerHTML = `${ico('fa-spinner fa-spin')} Đang lưu ${Math.min(L.length, i + 10)}/${L.length}…`;
          const r = await api('POST', '/api/hs-batch/save', { units: L.slice(i, i + 10).join(','), bo: S.bo, keys: kParam() }); ok += r.ok.length; err.push(...r.err); }
        toast(`Đã lưu bộ hồ sơ của ${ok} căn vào kho${err.length ? ` · ${err.length} căn lỗi: ${err.slice(0, 3).join('; ')}` : ''}`, !!err.length); window.__ctgHsSaved?.(); }
      finally { drawSide(); } }
  });
  main.onchange = e => { const x = e.target;
    if (x.dataset.twall) { for (const u of units.filter(u => u.tower === x.dataset.twall && u.cust)) x.checked ? S.sel.add(u.code) : S.sel.delete(u.code); return changed(); }
    if (x.id === 'hbBo') { S.bo = x.value; keep(); keys = null; return changed(); }
    if (x.dataset.k) { x.checked ? S.off.delete(x.dataset.k) : S.off.add(x.dataset.k); keep(); return checkSoon(); }
    if (x.id === 'hbCp' && x.value) { const v = Math.min(50, Math.max(1, Math.round(+x.value) || 1)); for (const c of S.sel) v > 1 ? S.cp.set(c, v) : S.cp.delete(c); drawUnits(); drawSide(); }
  };
  await scan();
  if (!units.length && !saved0.pid && !+filt().project) for (const p of M.projects) { if (p.id === S.pid) continue;   // lần đầu: tự nhảy sang dự án đầu tiên có căn
    const r = await api('GET', '/api/hs-batch/scan?project=' + p.id); if (r.units.length) { S.pid = p.id; $('#hbP', main).value = p.id; keep(); await scan(); break; } }
  drawSide(); if (S.sel.size) changed();
}
// ---------- Mẫu biểu: cây thư mục theo module (12/11/2026) ----------
// Module 01…12 › màn hiện nút «In theo mẫu» (ô «Hiện ở module») › dự án / tòa áp dụng › mẫu. Bấm mẫu → khung phải: xem trước, sửa, thay nội dung bằng file,
// tải về, bật / tắt, chuyển module, nhân bản, xóa. Tích nhiều mẫu (hoặc tích cả thư mục) → bật / tắt / chuyển / xóa hàng loạt. Bảng cũ: #/e/template?view=list
V.tpltree = async (main, params = {}) => {
  const TE = M.ents.template, canC = !!TE.perm?.c, canU = !!TE.perm?.u, canD = !!TE.perm?.d;
  const S = ST.tpt ||= { open: new Set(), init: false, sel: +params.id || 0, q: '', empty: false, ck: new Set() };
  if (+params.id) { S.sel = +params.id; if (params.q) S.q = String(params.q); }   // 17/11/2026: «Sửa mẫu» từ màn In bộ hồ sơ
  const kindL = Object.fromEntries(TE.fields.find(f => f.k === 'kind').o);
  // mẫu thuộc bộ hồ sơ (ô «Thuộc bộ hồ sơ») xếp ở 05 › Bộ hồ sơ theo căn › <bộ>
  const boL = TE.fields.find(f => f.k === 'bo')?.o || [], places = [...tplPlaces(), ...boL.map(([k, l]) => ['bo:' + k, `05 Hồ sơ & hợp đồng › Bộ hồ sơ theo căn › ${l}`])];
  const placeOf = t => t.bo ? 'bo:' + t.bo : t.ent;
  let ts = [], ps = [], bs = [], fids = {};
  const gitBtn = window.__ctgDemoPublish && M.me.role === 'admin' ? `<button class="btn amb" id="ttGit" title="Ghi toàn bộ mẫu biểu trên trình duyệt này vào kho GitHub — bản demo của mọi người cập nhật sau 1–2 phút">${ico('fa-cloud-arrow-up')} Đẩy mẫu biểu lên Git</button>` : '';
  main.innerHTML = `<div class="page">${head('12', 'Mẫu biểu – thông báo', 'fa-folder-tree', `${gitBtn}<a class="btn" href="#/e/template?view=list">${ico('fa-table-list')} Dạng bảng</a>${canC ? `<button class="btn" id="ttUp" title="Tải file Word / Excel / HTML lên làm mẫu mới">${ico('fa-file-arrow-up')} Tải mẫu lên</button><button class="btn pri" id="ttNew">${ico('fa-plus')} Tạo mẫu</button>` : ''}`)}
    <div class="warnbar">${ico('fa-folder-tree')}<span>Mẫu xếp theo <b>module › màn có nút «In theo mẫu» › dự án / tòa áp dụng</b>. Bấm một mẫu để xem trước và sửa, thay, xóa; nút ${ico('fa-plus')} trên dòng thư mục tạo mẫu mới, nút ${ico('fa-file-arrow-up')} tải file Word / Excel lên làm mẫu ngay đúng chỗ đó. Trong file Word gõ trường trộn dạng <b>{ten_kh}</b>, <b>{ma_can}</b>… để in tự điền.</span></div>
    <div class="tt"><div class="card tt-l"><div class="tt-bar"><input id="ttQ" type="search" placeholder="Tìm mã / tên mẫu…" value="${esc(S.q)}"><label class="chk small"><input type="checkbox" id="ttE" ${S.empty ? 'checked' : ''}> Hiện cả màn chưa có mẫu</label>
      <button class="btn sm ghost" id="ttO" title="Mở hết thư mục">${ico('fa-folder-open')}</button><button class="btn sm ghost" id="ttC" title="Thu gọn hết">${ico('fa-folder-closed')}</button></div>
      <div id="ttBulk"></div><div id="ttTree" class="tt-tree"><div class="empty">Đang tải…</div></div></div>
    <div class="card tt-r" id="ttD"></div></div></div>`;
  // phạm vi «CTS, CTS-O» → «Cát Tường Smart City + Cát Tường Smart City › Tòa O»
  const scKeys = s => [...new Set(String(s || '').split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean))].sort();
  const scOne = K => { const p = ps.find(x => K === x.code.toUpperCase()) || ps.find(x => K.startsWith(x.code.toUpperCase() + '-')); if (!p) return K;
    const bc = K.slice(p.code.length + 1); if (!bc) return p.name; const b = bs.find(x => x.project_id === p.id && x.code.toUpperCase() === bc); return `${p.name} › ${b?.name || 'Tòa ' + bc}`; };
  const scName = s => scKeys(s).map(scOne).join(' + ');
  const tree = () => {
    const q = S.q.trim().toLowerCase(), hit = t => !q || `${t.code} ${t.name}`.toLowerCase().includes(q), by = new Map();
    for (const t of ts) if (hit(t)) { const k = places.some(p => p[0] === placeOf(t)) ? placeOf(t) : ''; if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
    const mods = M.menu.map(([code, name, icon]) => ({ key: 'm' + code, code, name, icon, scr: places.filter(p => p[1].startsWith(code + ' '))
      .map(([ent, l]) => ({ key: 's' + ent, ent, name: l.split(' › ').slice(1).join(' › '), ts: by.get(ent) || [] })).filter(s => s.ts.length || (S.empty && !q)) })).filter(m => m.scr.length);
    if (by.get('')?.length) mods.push({ key: 'mx', code: '—', name: 'Chưa gắn module', icon: 'fa-circle-question', scr: [{ key: 'sx', ent: '', name: 'Mẫu chưa chọn «Hiện ở module» — không hiện ở nút In theo mẫu', ts: by.get('') }] });
    for (const m of mods) for (const s of m.scr) {   // thư mục con theo dự án / tòa; mẫu chung đứng đầu
      const g = new Map(); for (const t of s.ts) { const k = scKeys(t.scope).join(', '); if (!g.has(k)) g.set(k, []); g.get(k).push(t); }
      s.grp = [...g].sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0) || scName(a[0]).localeCompare(scName(b[0]), 'vi')).map(([k, l]) => ({ key: `g${s.ent}|${k}`, sc: k, ts: l.sort((a, b) => b.active - a.active || a.code.localeCompare(b.code)) }));
    }
    return mods;
  };
  const isOpen = k => S.q.trim() ? true : S.open.has(k);
  const fRow = (lv, key, icon, label, ids, acts = '') => { fids[key] = ids; const o = isOpen(key), all = ids.length && ids.every(i => S.ck.has(i));
    return `<div class="tt-row tt-f lv${lv}" data-k="${esc(key)}">${ico(o ? 'fa-caret-down' : 'fa-caret-right', 'tt-car')}${canU || canD ? `<input type="checkbox" data-fk="${esc(key)}" ${all ? 'checked' : ''} ${ids.length ? '' : 'disabled'} title="Chọn cả thư mục">` : ''}${ico(icon || (o ? 'fa-folder-open' : 'fa-folder'), 'tt-ic')}<span class="tt-lb">${label}</span><span class="tt-n">${ids.length}</span><span class="tt-acts">${acts}</span></div>`; };
  const tRow = (lv, t) => `<div class="tt-row tt-t lv${lv}${S.sel === t.id ? ' on' : ''}${t.active ? '' : ' off'}" data-id="${t.id}"><span class="tt-car"></span>${canU || canD ? `<input type="checkbox" data-ck="${t.id}" ${S.ck.has(t.id) ? 'checked' : ''}>` : ''}${ico(/^\s*</.test(t.content || '') ? 'fa-file-code' : 'fa-file-lines', 'tt-ic')}<span class="tt-lb"><b>${esc(t.code)}</b> · ${esc(t.name)}</span>${t.bedrooms ? `<span class="tag">${t.bedrooms} PN</span>` : ''}${t.active ? '' : '<span class="tag">Tắt</span>'}</div>`;
  const plus = (ent, sc) => canC && ent ? `<button class="btn sm ghost" data-up="${esc(ent)}" data-sc="${esc(sc ?? '')}" title="Tải file Word / Excel lên làm mẫu ở thư mục này">${ico('fa-file-arrow-up')}</button><button class="btn sm ghost" data-new="${esc(ent)}" data-sc="${esc(sc ?? '')}" title="Tạo mẫu mới ở thư mục này">${ico('fa-plus')}</button>` : '';
  const draw = () => {
    const mods = tree(); fids = {};
    if (!S.init) { S.init = true; for (const m of mods) { S.open.add(m.key); for (const s of m.scr) { S.open.add(s.key); for (const g of s.grp) S.open.add(g.key); } } }
    $('#ttTree', main).innerHTML = mods.length ? mods.map(m => { const mIds = m.scr.flatMap(s => s.ts.map(t => t.id));
      return fRow(0, m.key, null, `<b>${esc(m.code)}</b> ${esc(m.name)}`, mIds) + (isOpen(m.key) ? m.scr.map(s => fRow(1, s.key, null, esc(s.name), s.ts.map(t => t.id), plus(s.ent, '')) + (isOpen(s.key) ? (s.grp.length ? s.grp.map(g =>
        fRow(2, g.key, g.sc ? 'fa-building' : 'fa-globe', g.sc ? esc(scName(g.sc)) : '<span class="muted">Mẫu chung — mọi dự án</span>', g.ts.map(t => t.id), plus(s.ent, g.sc)) + (isOpen(g.key) ? g.ts.map(t => tRow(3, t)).join('') : '')).join('')
        : `<div class="tt-row tt-none lv2 muted small">Chưa có mẫu</div>`) : '')).join('') : ''); }).join('')
      : `<div class="empty">${S.q ? 'Không có mẫu khớp «' + esc(S.q) + '».' : 'Chưa có mẫu nào.'}</div>`;
    const n = [...S.ck].filter(i => ts.some(t => t.id === i)).length;
    $('#ttBulk', main).innerHTML = n ? `<div class="tt-bulk"><b>Đã chọn ${n} mẫu</b>${canU ? `<button class="btn sm" data-b="on">${ico('fa-toggle-on')} Bật</button><button class="btn sm" data-b="off">${ico('fa-toggle-off')} Tắt</button>
      <select data-b="mv"><option value="">Chuyển sang màn…</option>${places.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select>` : ''}${canD ? `<button class="btn sm danger" data-b="del">${ico('fa-trash')} Xóa</button>` : ''}<button class="btn sm ghost" data-b="clr">Bỏ chọn</button></div>` : '';
  };
  const detail = async () => {
    const d = $('#ttD', main), t = ts.find(x => x.id === S.sel);
    if (!t) { d.innerHTML = `<div class="empty">${ico('fa-hand-pointer')} Chọn một mẫu ở cây bên trái để xem trước, sửa, thay hoặc xóa.</div>`; return; }
    d.innerHTML = `<div class="tt-path small muted">${ico('fa-folder-open')} ${esc(places.find(p => p[0] === placeOf(t))?.[1] || (t.ent ? tplPlace(t.ent) : 'Chưa gắn module'))} › ${t.scope ? esc(scName(t.scope)) : 'Mẫu chung'}</div><h3 class="tt-h">${esc(t.name)}</h3>
      <dl class="tt-dl"><dt>Mã mẫu</dt><dd><b>${esc(t.code)}</b></dd><dt>Loại</dt><dd>${esc(kindL[t.kind] || t.kind || '')}</dd><dt>Áp dụng</dt><dd>${t.scope ? esc(scName(t.scope)) : 'Mẫu chung — mọi dự án'}${t.bedrooms ? ` · căn ${t.bedrooms} phòng ngủ` : ''}</dd>
        <dt>Trạng thái</dt><dd>${t.active ? '<span class="tag ok">Đang dùng</span>' : '<span class="tag">Tắt</span>'}</dd><dt>Cập nhật</dt><dd>${esc(dmyhm(t.updated_at || t.created_at))}</dd>
        ${canU ? `<dt>Hiện ở module</dt><dd><select id="ttMv"><option value="">— Chưa gắn —</option>${places.map(([k, l]) => `<option value="${esc(k)}" ${k === placeOf(t) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></dd>` : ''}</dl>
      <div class="tt-btns">${canU ? `<button class="btn pri sm" data-a="edit">${ico('fa-pen')} Sửa</button><button class="btn sm" data-a="file">${ico('fa-file-arrow-up')} Thay bằng file…</button><button class="btn sm" data-a="tog">${ico(t.active ? 'fa-toggle-off' : 'fa-toggle-on')} ${t.active ? 'Tắt' : 'Bật'}</button>` : `<button class="btn sm" data-a="edit">${ico('fa-eye')} Xem</button>`}
        ${canC ? `<button class="btn sm" data-a="dup">${ico('fa-copy')} Nhân bản</button>` : ''}<button class="btn sm" data-a="dl">${ico('fa-download')} Tải về</button><button class="btn sm" data-a="pv">${ico('fa-up-right-from-square')} Xem toàn trang</button>
        ${canD ? `<button class="btn sm danger" data-a="del">${ico('fa-trash')} Xóa</button>` : ''}<input type="file" id="ttFile" accept=".docx,.xlsx,.html,.htm,.txt" hidden></div>
      <div class="tt-pv"><div class="small muted">Xem trước với dữ liệu thật mới nhất của màn</div><iframe id="ttF" title="Xem trước mẫu"></iframe></div>`;
    const f = $('#ttF', d);
    if (!t.ent) { f.srcdoc = `<pre style="white-space:pre-wrap;font:13px/1.5 system-ui">${esc(t.content)}</pre>`; return; }
    try { f.srcdoc = (await api('POST', '/api/template-preview', { ent: t.ent, content: t.content, name: t.name, code: t.code })).html; }
    catch (e) { f.srcdoc = `<p style="font:13px system-ui;color:#64748b">Chưa xem trước được: ${esc(e.message)}</p><pre style="white-space:pre-wrap;font:12px/1.5 system-ui">${esc(t.content)}</pre>`; }
  };
  const load = async () => {
    const [r, p, b] = await Promise.all([api('GET', '/api/e/template?limit=5000&sort=code'), ps.length ? null : api('GET', '/api/e/project?limit=500&sort=code'), bs.length ? null : api('GET', '/api/e/building?limit=5000&sort=code')]);
    ts = r.rows; if (p) ps = p.rows; if (b) bs = b.rows;
    for (const i of [...S.ck]) if (!ts.some(t => t.id === i)) S.ck.delete(i);
    const t0 = S.sel && ts.find(x => x.id === S.sel);   // mở sẵn thư mục chứa mẫu đang chọn
    if (t0) { const ent = places.some(p => p[0] === placeOf(t0)) ? placeOf(t0) : '', mod = places.find(p => p[0] === ent)?.[1].split(' ')[0]; S.open.add(ent ? 'm' + mod : 'mx'); S.open.add(ent ? 's' + ent : 'sx'); S.open.add(`g${ent}|${scKeys(t0.scope).join(', ')}`); }
    draw(); await detail();
  };
  const put = (id, data) => api('PUT', `/api/e/template/${id}`, data);
  const many = async (ids, fn, verb, tail = '') => { let ok = 0; const errs = []; for (const id of ids) { try { await fn(id); ok++; } catch (e) { errs.push(`${ts.find(t => t.id === id)?.code || id}: ${e.message}`); } }
    toast(`Đã ${verb} ${ok} mẫu${tail}${errs.length ? ` · lỗi ${errs.length}: ${errs.join('; ')}` : ''}`, !!errs.length); await load(); };
  main.onclick = run(async e => {
    const x = e.target;
    if (x.closest('#ttUp')) return upModal('', '');
    const ub = x.closest('[data-up]'); if (ub) return upModal(ub.dataset.up, ub.dataset.sc);
    if (x.closest('#ttNew')) return openForm('template', { preset: { active: true, kind: 'thong_bao' }, onSaved: r => { S.sel = r?.id || S.sel; load(); } });
    if (x.closest('#ttGit')) { const b = x.closest('#ttGit'); if (!confirm('Đẩy toàn bộ mẫu biểu đang có trên trình duyệt này lên Git?\nMọi người mở link demo sẽ nhận đúng bộ mẫu này (sau 1–2 phút).')) return;
      b.disabled = true; try { const r = await window.__ctgDemoPublish({ user: M.me.username }); if (r) toast(`Đã đẩy ${r.n} mẫu lên Git — bản demo của mọi người cập nhật sau 1–2 phút`); } finally { b.disabled = false; } return; }
    if (x.closest('#ttO')) { S.q = ''; for (const k of Object.keys(fids)) S.open.add(k); for (const m of tree()) for (const s of m.scr) { S.open.add(s.key); for (const g of s.grp) S.open.add(g.key); } return draw(); }
    if (x.closest('#ttC')) { S.open.clear(); return draw(); }
    const nb = x.closest('[data-new]'); if (nb) { const ent0 = nb.dataset.new, sc = nb.dataset.sc, bo = ent0.startsWith('bo:') ? ent0.slice(3) : null, ent = bo ? 'unit' : ent0;
      return openForm('template', { preset: { ent, bo, scope: sc, active: true, kind: bo ? 'hop_dong' : TPL_KIND0[ent] || 'thong_bao' }, title: `Tạo mẫu · ${esc(places.find(p => p[0] === ent0)?.[1] || tplPlace(ent))}${sc ? ' · ' + esc(scName(sc)) : ''}`, onSaved: r => { if (r?.id) S.sel = r.id; load(); } }); }
    const fk = x.closest('[data-fk]'); if (fk) { for (const i of fids[fk.dataset.fk] || []) fk.checked ? S.ck.add(i) : S.ck.delete(i); return draw(); }
    const ck = x.closest('[data-ck]'); if (ck) { ck.checked ? S.ck.add(+ck.dataset.ck) : S.ck.delete(+ck.dataset.ck); return draw(); }
    const bb = x.closest('button[data-b]'); if (bb) { const ids = [...S.ck], k = bb.dataset.b;
      if (k === 'clr') { S.ck.clear(); return draw(); }
      if (k === 'on' || k === 'off') return many(ids, id => put(id, { active: k === 'on' }), k === 'on' ? 'bật' : 'tắt');
      if (k === 'del') { if (!await ask('Xóa mẫu', `Xóa ${ids.length} mẫu đã chọn? Thao tác ghi ở Nhật ký thao tác (khôi phục được).`, { danger: 1, okLabel: `Xóa ${ids.length} mẫu` })) return;
        if (ids.includes(S.sel)) S.sel = 0; S.ck.clear(); return many(ids, id => api('DELETE', `/api/e/template/${id}`), 'xóa'); } }
    const fr = x.closest('.tt-f'); if (fr && !x.closest('.tt-acts')) { const k = fr.dataset.k; S.open.has(k) ? S.open.delete(k) : S.open.add(k); if (S.q.trim()) { S.q = ''; $('#ttQ', main).value = ''; } return draw(); }
    const tr = x.closest('.tt-t'); if (tr) { S.sel = +tr.dataset.id; $$('.tt-t.on', main).forEach(r => r.classList.remove('on')); tr.classList.add('on'); return detail(); }
    const ab = x.closest('[data-a]'); if (!ab) return;
    const t = ts.find(y => y.id === S.sel); if (!t) return; const a = ab.dataset.a;
    if (a === 'edit') return openForm('template', { id: t.id, onSaved: load });
    if (a === 'dup') return openForm('template', { preset: { code: t.code + '-SAO', name: t.name + ' (bản sao)', kind: t.kind, ent: t.ent, scope: t.scope, bedrooms: t.bedrooms, content: t.content, active: true }, title: `Nhân bản · ${esc(t.code)}`, onSaved: r => { if (r?.id) S.sel = r.id; load(); } });
    if (a === 'tog') { await put(t.id, { active: !t.active }); toast(t.active ? 'Đã tắt mẫu — không hiện ở nút In theo mẫu' : 'Đã bật mẫu'); return load(); }
    if (a === 'file') return $('#ttFile', main).click();
    if (a === 'dl') { const u = URL.createObjectURL(new Blob([t.content || ''], { type: 'text/html;charset=utf-8' })); Object.assign(document.createElement('a'), { href: u, download: `${t.code}.html` }).click(); setTimeout(() => URL.revokeObjectURL(u), 5000); return; }
    if (a === 'pv') { const w = window.open('', '_blank'); try { const r = t.ent ? (await api('POST', '/api/template-preview', { ent: t.ent, content: t.content, name: t.name, code: t.code })).html : `<pre>${esc(t.content)}</pre>`; w.document.open(); w.document.write(r); w.document.close(); } catch (er) { w && w.close(); throw er; } return; }
    if (a === 'del') { if (!await ask('Xóa mẫu', `Xóa mẫu «${t.code} · ${t.name}»? Thao tác ghi ở Nhật ký thao tác (khôi phục được).`, { danger: 1, okLabel: 'Xóa' })) return;
      await api('DELETE', `/api/e/template/${t.id}`); S.ck.delete(t.id); S.sel = 0; toast('Đã xóa mẫu'); return load(); }
  });
  main.onchange = run(async e => {
    const x = e.target;
    if (x.id === 'ttE') { S.empty = x.checked; return draw(); }
    if (x.id === 'ttMv') { const v = x.value, bo = v.startsWith('bo:') ? v.slice(3) : null; await put(S.sel, { ent: bo ? 'unit' : v || null, bo }); toast(v ? `Đã chuyển sang ${places.find(p => p[0] === v)?.[1] || tplPlace(v)}` : 'Đã bỏ gắn module'); return load(); }
    if (x.matches('select[data-b=mv]') && x.value) { const v = x.value, bo = v.startsWith('bo:') ? v.slice(3) : null; return many([...S.ck], id => put(id, { ent: bo ? 'unit' : v, bo }), 'chuyển', ` sang ${places.find(p => p[0] === v)?.[1] || tplPlace(v)}`); }
    if (x.id === 'ttFile' && x.files[0]) { const file = x.files[0], t = ts.find(y => y.id === S.sel); x.value = ''; if (!t) return;
      if (!file.size) throw new Error('File rỗng');
      if (!await ask('Thay nội dung mẫu', `Thay toàn bộ nội dung mẫu «${t.code}» bằng file «${file.name}» (${Math.max(1, Math.round(file.size / 1024))} KB)? Bản cũ vẫn khôi phục được ở Nhật ký thao tác — hoặc bấm «Tải về» trước để giữ một bản.`, { okLabel: 'Thay nội dung' })) return;
      const fd = new FormData(); fd.append('id', t.id); fd.append('file', file, file.name); await api('POST', '/api/template-upload', fd); toast('Đã thay nội dung mẫu'); return load(); }
  });
  const upModal = (place, sc) => {
    const m = modal({ title: `${ico('fa-file-arrow-up')} Tải mẫu biểu lên`, body: `<div class="warnbar">${ico('fa-circle-info')}<div>Chọn <b>file Word (.docx)</b> — hoặc Excel .xlsx / .html — mỗi file thành 1 mẫu (chọn được nhiều file). Giữ nguyên căn lề, chữ đậm / nghiêng, bảng, logo, ngắt trang.<br>Chỗ cần tự điền khi in: gõ trong Word dạng <b>{ten_kh}</b>, <b>{cccd}</b>, <b>{ma_can}</b>, <b>{ngay_hdmb}</b>… (xem danh sách trường ở nút «Sửa» của mẫu). File .doc cũ: mở Word → Lưu thành .docx.</div></div>
      <div class="form"><label>File mẫu<input type="file" id="uF" multiple accept=".docx,.xlsx,.html,.htm,.txt" class="inp"></label>
      <label>Hiện ở module (nút «In theo mẫu» của màn)<select id="uP"><option value="">— Chưa gắn —</option>${places.map(([k, l]) => `<option value="${esc(k)}" ${k === place ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label>Áp dụng cho dự án / tòa<select id="uS"><option value="">Mẫu chung — mọi dự án</option>${ps.map(p => `<option value="${esc(p.code)}" ${sc === p.code ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>${bs.filter(b => b.project_id === p.id).map(b => { const k = `${p.code}-${b.code}`; return `<option value="${esc(k)}" ${String(sc).toUpperCase() === k.toUpperCase() ? 'selected' : ''}>&nbsp;&nbsp;› ${esc(b.name || 'Tòa ' + b.code)}</option>`; }).join('')}`).join('')}${sc && !ps.some(p => p.code === sc) && !bs.some(b => ps.some(p => p.id === b.project_id && `${p.code}-${b.code}`.toUpperCase() === String(sc).toUpperCase())) ? `<option value="${esc(sc)}" selected>${esc(scName(sc))}</option>` : ''}</select></label>
      <label>Loại<select id="uK">${TE.fields.find(f => f.k === 'kind').o.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></label>
      <div id="uOne" hidden><label>Mã mẫu<input id="uC" class="inp" placeholder="tự đặt theo tên file nếu để trống"></label><label>Tên mẫu<input id="uN" class="inp"></label></div></div><div id="uR"></div>`,
      foot: `<button class="btn" data-x>Đóng</button><button class="btn pri" id="uGo">${ico('fa-file-arrow-up')} Tải lên</button>` });
    const el = m.el, kindOf = p => p.startsWith('bo:') ? 'hop_dong' : TPL_KIND0[p] || 'thong_bao';
    $('#uK', el).value = kindOf(place); $('#uP', el).onchange = e => { $('#uK', el).value = kindOf(e.target.value); };
    $('#uF', el).onchange = e => { const fs = [...e.target.files]; $('#uOne', el).hidden = fs.length !== 1; if (fs.length === 1) $('#uN', el).value = fs[0].name.replace(/\.[^.]+$/, '').replace(/_+/g, ' '); };
    $('#uGo', el).onclick = run(async () => {
      const fs = [...$('#uF', el).files]; if (!fs.length) return toast('Chọn file mẫu', true);
      const p = $('#uP', el).value, fd = new FormData(), bo = p.startsWith('bo:') ? p.slice(3) : '';
      fd.append('ent', bo ? 'unit' : p); fd.append('bo', bo); fd.append('scope', $('#uS', el).value); fd.append('kind', $('#uK', el).value);
      if (fs.length === 1) { fd.append('code', $('#uC', el).value); fd.append('name', $('#uN', el).value); }
      fs.forEach(f => fd.append('file', f, f.name));
      $('#uGo', el).disabled = true; $('#uR', el).innerHTML = '<div class="empty">Đang chuyển file…</div>';
      try { const r = await api('POST', '/api/template-upload', fd);
        $('#uR', el).innerHTML = (r.made.length ? `<div class="okbar">Đã thêm ${r.made.length} mẫu: ${r.made.map(x => `<b>${esc(x.code)}</b>`).join(', ')}</div>` : '') + (r.errors.length ? `<div class="warnbar">${r.errors.map(esc).join('<br>')}</div>` : '');
        if (r.made.length) { S.sel = r.made[0].id; await load(); if (!r.errors.length) { m.close ? m.close() : el.querySelector('[data-x]')?.click(); toast(`Đã tải lên ${r.made.length} mẫu — kiểm tra bản xem trước bên phải`); } }
      } finally { $('#uGo', el).disabled = false; }
    });
  };
  $('#ttQ', main).oninput = e => { S.q = e.target.value; draw(); };
  await load();
};
V.flows = async main => {
  const ents = Object.values(M.ents).filter(e => e.flow);
  main.innerHTML = `<div class="page">${head('12', 'Luồng phê duyệt', 'fa-diagram-project', '', '12.3')}<div class="card"><div class="tbl-wrap"><table class="t noclick"><thead><tr><th>Nghiệp vụ</th><th>Người lập / trình</th><th>Trình khi đang</th><th>Cấp phê duyệt</th><th>Duyệt → trạng thái</th><th>Điều kiện trước khi trình</th></tr></thead><tbody>${ents.map(e => { const st = e.fields.find(f => f.k === e.flow.field); const L = v => st.o.find(o => o[0] === v)?.[1] || v; return `<tr><td><b>${esc(e.title)}</b> ${e.code ? `<span class="tag">${e.code}</span>` : ''}</td><td class="small">${(e.c || []).map(roleName).join(', ') || 'Hệ thống'}</td><td class="small">${e.flow.submit.map(L).join(', ')}</td><td class="small">${(e.a || ['truong_phong', 'lanh_dao']).map(roleName).join(' / ')}${e.fields.some(f => f.k === 'approver_id') ? ' (người được chọn)' : ''}</td><td>${pill(L(e.flow.approve.ok), 'g')}</td><td class="small">${[...(e.files || []).filter(x => x[2]).map(x => 'Tệp: ' + x[1]), ...(e.flow.need || []).map(k => 'Nhập: ' + e.fields.find(f => f.k === k).l), e.flow.needAll ? 'Đủ toàn bộ giấy tờ checklist' : '', e.key === 'contract' ? 'Lịch thanh toán khớp giá trị HĐ' : ''].filter(Boolean).join('<br>')}</td></tr>`; }).join('')}</tbody></table></div><div class="bd small muted">${ico('fa-user-lock')} Nguyên tắc tách nhiệm: người trình không tự phê duyệt đề nghị của mình. Từ chối bắt buộc ghi lý do. Mọi lần trình / duyệt lưu trong nhật ký thao tác.</div></div></div>`;
};
V.audit = async main => {
  const f = { ent: '', user: '', from: '', to: '' };
  let rows = [];
  const draw = async () => {
    rows = await api('GET', '/api/audit?' + qsOf(f));
    $('#at', main).innerHTML = rows.length ? `<table class="t"><thead><tr><th>Thời điểm</th><th>Người thao tác</th><th>Đối tượng</th><th>Thao tác</th><th>Nội dung thay đổi</th></tr></thead><tbody>${rows.map(a => `<tr data-e="${a.ent}" data-r="${a.rec_id || ''}" data-a="${a.id}" class="${a.rec_id && M.ents[a.ent] ? 'clk' : ''}" title="${a.rec_id && M.ents[a.ent] ? 'Bấm để xem chi tiết dữ liệu' : ''}"><td class="nowrap">${dmyhm(a.at)}</td><td>${esc(a.who || 'Hệ thống')}</td><td>${esc(M.ents[a.ent]?.title || a.ent)}${a.rec_id ? ' #' + a.rec_id : ''}</td><td>${esc(actLabel(a.action, a.ent))}${a.rec_id && a.before && a.after && !['tao', 'xoa'].includes(a.action) && M.ents[a.ent] ? `<br><button type="button" class="btn sm" data-restore style="margin-top:6px" title="Đưa các trường trong dòng này về giá trị trước khi đổi">${ico('fa-rotate-left')} Khôi phục</button>` : ''}</td><td class="small">${a.note ? esc(a.note) + '<br>' : ''}${a.after && a.action !== 'tao' ? Object.keys(a.after).slice(0, 4).map(k => `<b>${esc(colLabel(a.ent, k) || k)}</b>: ${esc(fmtVal(a.ent, k, a.before?.[k]))} → ${esc(fmtVal(a.ent, k, a.after[k]))}`).join('<br>') : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Không có bản ghi</div>';
  };
  main.innerHTML = `<div class="page">${head('12', 'Nhật ký thao tác', 'fa-clock-rotate-left', '', '12.5')}<div class="card"><div class="toolbar"><select id="ae"><option value="">Mọi đối tượng</option>${Object.values(M.ents).map(e => `<option value="${e.key}">${esc(e.title)}</option>`).join('')}<option value="user">Tài khoản</option></select><select id="au"><option value="">Mọi người dùng</option>${M.users.map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select><span class="small muted">Từ</span>${segDate('af')}<span class="small muted">đến</span>${segDate('ato')}<span class="grow"></span><span class="small muted">500 bản ghi gần nhất</span></div><div class="tbl-wrap" id="at"></div></div></div>`;
  $('#ae', main).onchange = e => { f.ent = e.target.value; draw(); }; $('#au', main).onchange = e => { f.user = e.target.value; draw(); };
  const auditDay = k => e => { f[k] = segVal(e.currentTarget); if (f.from && f.to && f.from > f.to) return toast('Từ ngày phải trước Đến ngày', true); draw(); };
  wireSegDate(main); $('#af', main).addEventListener('sdchange', auditDay('from')); $('#ato', main).addEventListener('sdchange', auditDay('to'));
  main.onclick = run(async e => {
    const tr = e.target.closest('tr[data-r]'); if (!tr) return;
    if (e.target.closest('[data-restore]')) {
      const a = rows.find(x => x.id === +tr.dataset.a), ch = Object.keys(a.before || {}).map(k => `<li><b>${esc(colLabel(a.ent, k) || k)}</b>: ${esc(fmtVal(a.ent, k, a.after?.[k]))} → <b>${esc(fmtVal(a.ent, k, a.before[k]))}</b></li>`).join('');
      if (!await ask('Khôi phục dữ liệu', `Đưa <b>${esc(M.ents[a.ent].title)} #${a.rec_id}</b> về giá trị trước thao tác «${esc(actLabel(a.action, a.ent))}» lúc ${dmyhm(a.at)}:<ul style="margin:8px 0 0;padding-left:18px">${ch}</ul>`, { okLabel: 'Khôi phục' })) return;
      const r = await api('POST', `/api/audit/${a.id}/restore`, {}); toast(`Đã khôi phục ${r.fields} trường`); return draw();
    }
    if (tr.dataset.r && M.ents[tr.dataset.e]) openDetail(tr.dataset.e, +tr.dataset.r);   // xem chi tiết dữ liệu
  });
  await draw();
};
V.integr = async main => {
  const imps = await api('GET', '/api/imports');
  const isAdmin = M.me.role === 'admin';
  main.innerHTML = `<div class="page">${head('12', 'Tích hợp MISA / Bravo / BSC & nhập dữ liệu', 'fa-plug', '', '12.6')}<div class="grid g2">
    <div class="card span2"><div class="hd"><h3>${ico('fa-file-invoice-dollar')} MISA — phiếu thu / giấy báo có</h3></div><div class="bd"><p class="small" style="margin-top:0"><b>Kế toán không cần dùng app.</b> Kế toán xuất Excel từ MISA (Sổ chi tiết thu tiền / Bảng kê phiếu thu, giấy báo có) rồi gửi phòng KD hoặc lưu vào thư mục chung. App tìm hợp đồng theo <b>số hợp đồng hoặc mã căn ghi trong Diễn giải</b> (VD «Thu đợt 2 căn CTS-O-0101»), không có thì theo mã khách hàng (khách chỉ có 1 hợp đồng). Phiếu trùng số chứng từ tự bỏ qua — xuất lại cả tháng cũng không cộng hai lần.</p>
      <div class="lockbar">${ico('fa-folder-open')} Tự nhập từ thư mục: ${M.misaDir ? `<b>đang bật</b>${M.misaDir !== 'có' ? ` — <code>${esc(M.misaDir)}</code>` : ''} · quét 5 phút/lần, tệp đã nhập chuyển sang thư mục con «Đã nhập» kèm tệp kết quả (phiếu chưa ghép được hợp đồng)` : '<b>chưa bật</b> — đặt <code>MISA_DIR=đường dẫn thư mục</code> trong tệp .env của máy chủ'}</div>
      <div class="lockbar">${ico('fa-clock')} Nhập gần nhất: <b>${M.settings.bravo?.last_sync ? dmyhm(M.settings.bravo.last_sync) + (M.settings.bravo.last_src === 'misa' ? ' (MISA)' : ' (Bravo)') : 'chưa có'}</b></div>
      ${M.imports.misa ? `<button class="btn amb" data-imp="misa">${ico('fa-file-import')} Nhập phiếu thu MISA</button>` : '<span class="small muted">Trưởng phòng KD / Kế toán / Quản trị nhập tệp.</span>'}</div></div>
    <div class="card"><div class="hd"><h3>${ico('fa-database')} Bravo — chứng từ thu tiền</h3></div><div class="bd"><p class="small" style="margin-top:0"><b>Nguồn gốc số thực thu.</b> App không cho nhân viên kinh doanh sửa số thu; kế toán nhập tệp chứng từ xuất từ Bravo (trùng số chứng từ tự bỏ qua). Công nợ, kế hoạch thu, điều kiện bàn giao và hoa hồng tự cập nhật theo chứng từ.</p>
      <div class="lockbar">${ico('fa-clock')} Lần đồng bộ gần nhất: <b>${M.settings.bravo?.last_sync ? dmyhm(M.settings.bravo.last_sync) : 'chưa có'}</b></div>
      <div class="small muted mb">Chế độ: ${esc(M.settings.bravo?.mode || '')}</div>${M.imports.receipts ? `<button class="btn amb" data-imp="receipts">${ico('fa-file-import')} Nhập chứng từ Bravo</button>` : '<span class="small muted">Chỉ Kế toán / Quản trị nhập chứng từ.</span>'}</div></div>
    <div class="card"><div class="hd"><h3>${ico('fa-diagram-project')} BSC — quản lý mục tiêu & công việc</h3></div><div class="bd"><p class="small" style="margin-top:0">Chưa thống nhất cơ chế tích hợp với BSC. Trong lúc chờ: xuất danh sách việc tồn đọng (theo người phụ trách, hạn) và chỉ tiêu KPI để nhập vào BSC.</p><div class="row"><button class="btn" id="bscA">${ico('fa-file-excel')} Xuất việc tồn đọng</button><button class="btn" id="bscK">${ico('fa-file-excel')} Xuất KPI nhân viên</button></div></div></div>
    <div class="card span2"><div class="hd"><h3>${ico('fa-file-import')} Nhập dữ liệu hiện có (dữ liệu lịch sử)</h3></div><div class="bd"><p class="small" style="margin-top:0">Thứ tự nên nhập: <b>bảng hàng → khách hàng → hợp đồng + lịch thanh toán → chứng từ thu</b>. Mỗi loại có tệp mẫu; «Kiểm tra trước» chạy thử toàn bộ, báo lỗi từng dòng (trùng, thiếu, sai định dạng) mà không ghi dữ liệu.</p><div class="row">${Object.entries(M.imports).map(([k, i]) => `<button class="btn" data-imp="${k}">${ico('fa-upload')} ${esc(i.title)}</button>`).join('')}</div>
      <div class="sec-title">Lịch sử nhập</div>${rowsTable([['at', 'Thời điểm', 'dt'], ['kind', 'Loại'], ['file_name', 'Tệp'], ['by_l', 'Người nhập'], ['total', 'Tổng dòng', 'int'], ['ok', 'Thành công', 'int'], ['failed', 'Lỗi', 'int']], imps.map(x => ({ ...x, kind: M.imports[x.kind]?.title || x.kind })), null, { click: false })}</div></div>
    ${isAdmin && (M.testTools || M.demo) ? `<div class="card span2"><div class="hd"><h3>${ico('fa-flask')} Dữ liệu thử</h3></div><div class="bd"><p class="small" style="margin-top:0">Giao dịch thử (đánh dấu <span class="tag demo">thử</span>) phục vụ chạy thử toàn bộ quy trình. Dữ liệu gốc thật — dự án, tòa, căn theo bảng hàng, chính sách giá, mẫu biểu, tài khoản — <b>không bị ảnh hưởng</b>. Trước khi vận hành: xóa dữ liệu thử, khóa tài khoản thử.</p>
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

// ======================= 04. BẢNG TỔNG HỢP HỒ SƠ MUA NHÀ (MẪU 4) =======================
// mỗi hồ sơ mua NOXH = 1 hộ: dòng chủ hộ + thành viên; ô TT, SĐT, nhà ở, nơi ở, thu nhập, căn hộ gộp theo hộ như file nộp Sở Xây dựng
const M4_ST = { nhap: ['Dự thảo', 's'], cho_duyet: ['Chờ xét duyệt', 'a'], da_duyet: ['Đã duyệt SXD', 'g'], tu_choi: ['Trả lại', 'r'] };
// lọc ngày theo tab: [trường, nhãn ô lọc, tham số xuất Excel]
// [các trường theo thứ tự ưu tiên — chưa ghi thì lùi về ngày bước trước, nhãn ô lọc, tham số xuất Excel]
const M4_DAY = { draft: [['received_on'], 'Ngày nộp từ', ''], review: [['sxd_submit_on', 'received_on'], 'Ngày nộp SXD từ', 'sxd'], ok: [['sxd_approved_on', 'sxd_submit_on', 'received_on'], 'Ngày xét duyệt từ', 'duyet'] };
const M4_SXD = { duoc_duyet: ['Đủ điều kiện', 'g'], khong_duyet: ['Không đủ điều kiện', 'r'] };
// 3 tab theo trạng thái; Dự thảo gồm cả hồ sơ bị trả lại (sửa, xóa được). Tick chọn nhiều hồ sơ → chuyển trạng thái hàng loạt
const M4_TAB = { draft: ['Dự thảo', ['nhap', 'tu_choi']], review: ['Chờ xét duyệt', ['cho_duyet']], ok: ['Đã duyệt SXD', ['da_duyet']] }, M4_EDIT = ['nhap', 'tu_choi'];
// hộp xác nhận chuyển trạng thái: sang Chờ xét duyệt → Ngày nộp hồ sơ SXD; sang Đã duyệt SXD → kết quả, ngày được xét duyệt, số công văn, ghi chú
// pre: giá trị điền sẵn (chung của các hồ sơ đã chọn); trả về các trường đã điền hoặc null khi bấm Hủy
const m4Ask = (msg, status, pre) => new Promise(res => {
  const v = k => esc(pre[k] || ''), f = (l, h, req) => `<div class="fld"><label>${l}${req ? '<span class="req">*</span>' : ''}</label>${h}</div>`;
  const body = status === 'cho_duyet' ? f('Ngày nộp hồ sơ SXD', segDate('aS', pre.sxd_submit_on))
    : status === 'da_duyet' ? f('Kết quả xét duyệt', `<select id="aR"><option value="">— Chọn —</option>${Object.entries(M4_SXD).map(([k, x]) => `<option value="${k}" ${pre.sxd_result === k ? 'selected' : ''}>${x[0]}</option>`).join('')}</select>`, 1)
      + f('Ngày được xét duyệt', segDate('aA', pre.sxd_approved_on)) + f('Số công văn', `<input type="text" id="aC" value="${v('sxd_doc_no')}">`) + f('Ghi chú', `<input type="text" id="aG" value="${v('sxd_note')}">`) : '';
  const m = modal({ title: 'Chuyển trạng thái hàng loạt', narrow: true, onClose: () => res(null), body: `<div class="m4ask"><p style="margin:0 0 12px">${msg}</p>${body}</div>`,
    foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="askOk">Chuyển</button>` });
  wireSegDate(m.el);
  const g = id => { const el = $(id, m.el); return !el ? '' : el.classList.contains('sdate') ? segVal(el) : el.value; };
  $('#askOk', m.el).onclick = () => {
    if (status === 'da_duyet' && !g('#aR')) return toast('Chọn kết quả xét duyệt: đủ điều kiện hay không đủ điều kiện', true);
    if (g('#aS') === null || g('#aA') === null) return toast('Ngày chưa đúng — nhập đủ dd/mm/yyyy', true);
    m.el.remove(); res({ sxd_submit_on: g('#aS'), sxd_result: g('#aR'), sxd_approved_on: g('#aA'), sxd_doc_no: g('#aC'), sxd_note: g('#aG') });
  };
});
V.mau4 = async (main, params) => {
  const s = ST.mau4 ||= { project: '', q: '', from: '', to: '', tab: 'draft', kind: 'mua' };
  s.kind ||= 'mua';
  if (params.project) s.project = params.project;
  const canImp = M.imports.mau4, canNew = M.ents.noxh_check.perm.c, canBulk = M.ents.noxh_check.perm.u || M.ents.noxh_check.perm.a;
  const sel = new Set();
  main.innerHTML = `<div class="page">${head('04', 'Hồ sơ mua / thuê NOXH', 'fa-list-check', `${canNew ? `<button class="btn pri" id="m4New">${ico('fa-plus')} Tạo hồ sơ</button>` : ''}${canImp ? `<button class="btn" id="m4Imp">${ico('fa-file-import')} Nhập file Mẫu 4</button>` : ''}<button class="btn" id="m4X">${ico('fa-file-excel')} Xuất file Mẫu 4</button>`, 'GD-02')}
    <div class="card"><div class="tabs hd-tabs hd-kinds" id="m4K"><button data-k="mua">${ico('fa-house-circle-check')} Hồ sơ mua</button><button data-k="thue">${ico('fa-key')} Hồ sơ thuê</button></div><div class="tabs m4tabs" id="m4Tab"></div><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="m4Q" placeholder="Tìm họ tên, SĐT, CCCD, mã căn, số công văn…" value="${esc(s.q)}"></div>
      <select id="m4P"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+s.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>
      <label class="m4day nowrap"><span id="m4FL">Ngày nộp từ</span> ${segDate('m4F', s.from)}</label><label class="m4day nowrap">đến ${segDate('m4To', s.to)}</label>
      <span class="grow"></span><span class="small muted" id="m4N"></span></div>${canBulk ? `<div class="toolbar m4bulk" id="m4B" hidden><b id="m4BN"></b><span class="muted">→ chuyển sang</span>
        <select id="m4BS">${Object.entries(M4_ST).filter(([k]) => k !== 'tu_choi').map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
        <button class="btn pri sm" id="m4BGo">${ico('fa-right-left')} Chuyển trạng thái</button><button class="btn sm ghost" id="m4BX">Bỏ chọn</button></div>
      <div class="toolbar m4undo" id="m4U" hidden><span id="m4UT"></span><button class="btn sm" id="m4UGo">${ico('fa-rotate-left')} Hoàn tác</button><button class="btn sm ghost" id="m4UX" title="Ẩn">${ico('fa-xmark')}</button></div>` : ''}<div class="tbl-wrap" id="m4T"><div class="empty">Đang tải…</div></div></div></div>`;
  let hs = [];
  const load = async () => { $$('#m4K button', main).forEach(b => b.classList.toggle('on', b.dataset.k === s.kind)); hs = await api('GET', '/api/mau4?' + new URLSearchParams({ kind: s.kind, ...(s.project ? { project: s.project } : {}) })); draw(); };
  $('#m4K', main).onclick = e => { const b = e.target.closest('[data-k]'); if (b && b.dataset.k !== s.kind) { s.kind = b.dataset.k; sel.clear(); load(); } };
  const draw = () => {
    const q = s.q.trim().toLowerCase();
    const inDay = (h, t = s.tab) => { const d = M4_DAY[t][0].map(k => h[k]).find(Boolean) || ''; return (!s.from || d >= s.from) && (!s.to || (!!d && d <= s.to)); };
    $('#m4FL', main).textContent = M4_DAY[s.tab][1];
    const inTab = h => M4_TAB[s.tab][1].includes(h.status), draft = s.tab === 'draft', okTab = s.tab === 'ok', sxdDay = s.tab !== 'draft';
    $('#m4Tab', main).innerHTML = Object.entries(M4_TAB).map(([k, [l, st]]) => `<button data-tab="${k}" class="${s.tab === k ? 'on' : ''}">${l}<span class="c">${hs.filter(h => st.includes(h.status) && inDay(h, k)).length}</span></button>`).join('');
    const rows = hs.filter(h => inTab(h) && inDay(h) && (!q || [h.unit_code, h.sxd_doc_no, ...h.people.flatMap(p => [p.name, p.phone, p.id_no, p.old_id_no])].some(x => String(x ?? '').toLowerCase().includes(q))));
    $('#m4N', main).textContent = `${rows.length} hộ · ${rows.reduce((a, h) => a + h.people.length, 0)} người`;
    for (const id of [...sel]) if (!rows.some(h => h.id === id)) sel.delete(id);   // chỉ giữ hồ sơ đang hiện
    drawBulk();
    if (!rows.length) return $('#m4T', main).innerHTML = `<div class="empty">${draft ? 'Chưa có hồ sơ dự thảo — bấm «Tạo hồ sơ» hoặc «Nhập file Mẫu 4»' : `Chưa có hồ sơ «${M4_TAB[s.tab][0]}»`}${s.q || s.from || s.to ? ' khớp bộ lọc' : ''}</div>`;
    const canEd = M.ents.noxh_check.perm.u, canDel = M.ents.noxh_check.perm.d;
    const acts = h => M4_EDIT.includes(h.status) ? `<span class="nowrap">${canEd ? `<button type="button" class="btn sm" data-m4ed title="Sửa hồ sơ">${ico('fa-pen')} Sửa</button> ` : ''}${canDel ? `<button type="button" class="btn sm danger" data-m4del title="Xóa hồ sơ dự thảo">${ico('fa-trash')} Xóa</button>` : ''}</span>` : '<span class="small muted">Đang chờ duyệt</span>';
    const td = (v, n, cls = '') => `<td ${n > 1 ? `rowspan="${n}"` : ''} class="${cls}">${v}</td>`;
    $('#m4T', main).innerHTML = `<table class="t m4t"><thead>
      <tr>${canBulk ? `<th rowspan="2" class="center m4s1"><input type="checkbox" data-ckall title="Chọn tất cả" ${rows.every(h => sel.has(h.id)) ? 'checked' : ''}></th>` : ''}<th rowspan="2">STT</th><th rowspan="2">Ngày nộp hồ sơ</th><th rowspan="2">Họ và tên</th><th rowspan="2">Số điện thoại</th><th rowspan="2">Ngày sinh</th><th rowspan="2">Tháng sinh</th><th rowspan="2">Năm sinh</th><th colspan="2" class="center">Thông tin cư dân</th>
        <th rowspan="2">Nghề nghiệp</th><th rowspan="2">Đối tượng chính sách được hưởng nhà ở xã hội</th><th rowspan="2">Cơ quan xác nhận về đối tượng</th><th rowspan="2">Điều kiện nhà ở</th><th colspan="3" class="center">Nơi ở hiện tại (thường xuyên sinh sống)</th>
        <th rowspan="2">Điều kiện thu nhập</th><th rowspan="2">Quan hệ với chủ hộ</th><th colspan="2" class="center">Thông tin căn hộ dự kiến ${s.kind === 'thue' ? 'thuê' : 'mua/thuê mua'}</th><th rowspan="2">Tình trạng</th>${sxdDay ? '<th rowspan="2">Ngày nộp hồ sơ SXD</th>' : ''}${okTab ? '<th rowspan="2">Kết quả xét duyệt</th><th rowspan="2">Ngày được xét duyệt</th><th rowspan="2">Số công văn</th><th rowspan="2">Ghi chú</th>' : ''}<th rowspan="2">Biên bản</th>${draft ? '<th rowspan="2">Thao tác</th>' : ''}</tr>
      <tr><th>Số CMND</th><th>Số CCCD</th><th>Tỉnh</th><th>Huyện/ Thành phố</th><th>Thị trấn/xã</th><th>Số căn hộ</th><th>Diện tích (m²)</th></tr></thead>
      <tbody>${rows.map((h, i) => { const n = h.people.length, ownPhone = h.people.slice(1).some(p => p.phone);
        // nhà ở, nơi ở, thu nhập: thành viên khai riêng thì mỗi người một ô, không thì gộp theo hộ (như SĐT)
        const own = Object.fromEntries(['housing', 'province', 'district', 'commune', 'income'].map(k => [k, h.people.slice(1).some(p => String(p[k] ?? '').trim())]));
        const hh = (p, j, k, cls = '') => j && !own[k] ? '' : td(esc((j ? p[k] : h[k]) || ''), own[k] ? 1 : n, cls);
        return h.people.map((p, j) => `<tr data-id="${h.id}" class="${j ? 'm4mem' : 'm4head'}">${j ? '' : (canBulk ? td(`<input type="checkbox" data-ck ${sel.has(h.id) ? 'checked' : ''}>`, n, 'center m4ck m4s1') : '') + td(i + 1, n, 'center') + td(dmy(h.received_on), n)}<td>${esc(p.name)}</td>${j && !ownPhone ? '' : td(esc(p.phone || ''), ownPhone ? 1 : n)}
          <td class="center">${p.birth[0]}</td><td class="center">${p.birth[1]}</td><td class="center">${p.birth[2]}</td><td>${esc(p.old_id_no || '')}</td><td>${esc(p.id_no || '')}</td><td class="wrap">${esc(p.job || '')}</td><td class="wrap">${esc(p.doi_tuong || '')}</td><td class="wrap">${esc(p.confirm_org || '')}</td>
          ${hh(p, j, 'housing', 'wrap') + hh(p, j, 'province') + hh(p, j, 'district') + hh(p, j, 'commune') + hh(p, j, 'income', 'wrap')}<td>${esc(p.relation)}</td>
          ${j ? '' : td(`<b>${esc(h.unit_code || '')}</b>`, n) + td(h.area != null ? fnum(h.area) : '', n, 'num') + td(M4_ST[h.status] ? pill(...M4_ST[h.status]) : '', n) + (sxdDay ? td(h.sxd_submit_on ? `<b>${dmy(h.sxd_submit_on)}</b>` : '<span class="small muted">chưa ghi</span>', n, 'center nowrap') : '')
          + (okTab ? td(M4_SXD[h.sxd_result] ? pill(...M4_SXD[h.sxd_result]) : '<span class="small muted">chưa ghi</span>', n, 'nowrap') + td(h.sxd_approved_on ? dmy(h.sxd_approved_on) : '', n, 'center nowrap') + td(esc(h.sxd_doc_no || ''), n, 'nowrap') + td(esc(h.sxd_note || ''), n, 'wrap') : '') + td(`<button type="button" class="btn sm" data-bbgn title="In biên bản bàn giao tài liệu hồ sơ mua nhà">${ico('fa-file-signature')} Biên bản</button>`, n) + (draft ? td(acts(h), n) : '')}</tr>`).join(''); }).join('')}</tbody></table>`;
    syncTopScroll();
  };
  function drawBulk() {
    const b = $('#m4B', main); if (!b) return;
    if (!sel.size) $('#m4BS', main).value = { draft: 'cho_duyet', review: 'da_duyet', ok: 'da_duyet' }[s.tab];   // bước kế tiếp của tab
    b.hidden = !sel.size; $('#m4BN', main).textContent = `Đã chọn ${sel.size} hồ sơ`;
  }
  if (canBulk) {
    $('#m4BX', main).onclick = () => { sel.clear(); draw(); };
    $('#m4BGo', main).onclick = run(async () => {
      const status = $('#m4BS', main).value, picked = hs.filter(h => sel.has(h.id));
      const pre = Object.fromEntries(['sxd_submit_on', 'sxd_result', 'sxd_approved_on', 'sxd_doc_no', 'sxd_note'].map(k => { const vs = new Set(picked.map(h => h[k] || '')); return [k, vs.size === 1 ? [...vs][0] : '']; }));   // điền sẵn khi các hồ sơ giống nhau
      if (status === 'cho_duyet' && !pre.sxd_submit_on) { const vs = new Set(picked.map(h => h.received_on || '')); if (vs.size === 1) pre.sxd_submit_on = [...vs][0]; }   // chưa có ngày nộp SXD → gợi ý theo ngày nộp hồ sơ
      const more = await m4Ask(`Chuyển <b>${sel.size}</b> hồ sơ sang <b>${M4_ST[status][0]}</b>?`, status, pre); if (!more) return;
      const r = await api('POST', '/api/mau4/status', { ids: [...sel], status, ...more });
      toast(`Đã chuyển ${r.n} hồ sơ sang «${M4_ST[status][0]}»`); sel.clear(); await load();
      undo = r.prev; $('#m4UT', main).innerHTML = `Vừa chuyển <b>${r.n}</b> hồ sơ sang <b>${M4_ST[status][0]}</b>.${r.warnings?.length ? `<div class="small" style="margin-top:4px">${r.warnings.map(w => `<div class="${/chưa|thiếu|không/i.test(w) ? 'neg' : ''}">• ${esc(w)}</div>`).join('')}</div>` : ''}`; $('#m4U', main).hidden = false;   // kết quả tự lập hợp đồng / cảnh báo
    });
    // hoàn tác lần chuyển gần nhất (giữ tới khi chuyển lần khác / rời màn hình)
    let undo = null;
    $('#m4UX', main).onclick = () => { undo = null; $('#m4U', main).hidden = true; };
    $('#m4UGo', main).onclick = run(async () => {
      if (!undo) return;
      if (!await ask('Hoàn tác', `Trả <b>${undo.length}</b> hồ sơ về trạng thái và thông tin trước khi chuyển?`, { okLabel: 'Hoàn tác' })) return;
      const r = await api('POST', '/api/mau4/undo', { prev: undo }); undo = null; $('#m4U', main).hidden = true;
      toast(`Đã hoàn tác ${r.n} hồ sơ`); sel.clear(); await load();
    });
  }
  $('#m4Q', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  $('#m4P', main).onchange = run(async e => { s.project = e.target.value; await load(); });
  wireSegDate(main);
  $('#m4F', main).addEventListener('sdchange', e => { s.from = segVal(e.currentTarget); draw(); });
  $('#m4To', main).addEventListener('sdchange', e => { s.to = segVal(e.currentTarget); draw(); });
  $('#m4X', main).onclick = () => download('/api/mau4/xlsx?' + new URLSearchParams(Object.entries({ kind: s.kind, project: s.project, from: s.from, to: s.to, by: s.from || s.to ? M4_DAY[s.tab][2] : '' }).filter(([, v]) => v)));   // xuất theo dự án + ngày đang lọc của tab
  $('#m4Imp', main) && ($('#m4Imp', main).onclick = () => importModal('mau4', load));
  $('#m4New', main) && ($('#m4New', main).onclick = () => openForm('noxh_check', { preset: s.kind === 'thue' ? { reg_kind: 'thue' } : undefined, title: s.kind === 'thue' ? `${ico('fa-key')} Tạo hồ sơ thuê NOXH` : undefined, onSaved: () => load() }));
  $('#m4Tab', main).onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { s.tab = b.dataset.tab; sel.clear(); draw(); } };
  $('#m4T', main).onclick = run(async e => {
    const id = +e.target.closest('tr[data-id]')?.dataset.id;
    if (e.target.matches('[data-ckall]')) { const on = e.target.checked; main.querySelectorAll('tr.m4head[data-id]').forEach(tr => on ? sel.add(+tr.dataset.id) : sel.delete(+tr.dataset.id)); return draw(); }
    if (e.target.matches('[data-ck]')) { e.target.checked ? sel.add(id) : sel.delete(id); const all = $('[data-ckall]', main); if (all) all.checked = [...main.querySelectorAll('[data-ck]')].every(x => x.checked); return drawBulk(); }
    if (e.target.closest('td.m4ck')) return;   // bấm hụt quanh ô tick: không mở hồ sơ
    if (e.target.closest('[data-m4ed]')) return openForm('noxh_check', { id, onSaved: () => load() });
    if (e.target.closest('[data-m4del]')) { const h = hs.find(x => x.id === id); if (!await ask('Xóa hồ sơ dự thảo', `Xóa hồ sơ của hộ <b>${esc(h?.people[0]?.name || '#' + id)}</b>? Không khôi phục được.`, { danger: 1, okLabel: 'Xóa' })) return; await api('DELETE', `/api/e/noxh_check/${id}`); toast('Đã xóa hồ sơ'); return load(); }
    if (e.target.closest('[data-bbgn]')) return handoverPick('noxh', +e.target.closest('tr[data-id]').dataset.id); const tr = e.target.closest('tr[data-id]'); if (tr) openDetail('noxh_check', +tr.dataset.id); });
  await load();
};

// ======================= 04. THEO DÕI HỦY GIAO DỊCH, THANH LÝ HỢP ĐỒNG VÀ CHI TRẢ TIỀN =======================
// theo file «Bang_theo_doi_thanh_ly_va_chi_tra.xlsx»; mỗi dòng = 1 đề nghị hủy / đổi căn / đổi tên; tô màu khi còn ≤ 30 ngày đến hạn chi trả
// 16/11/2026: hợp đồng chuyển «Thanh lý» tự vào bảng (1 dòng / hợp đồng); tổng đã thu, khấu trừ, phải hoàn trả, đã chi trả, còn phải trả, trạng thái chi trả tự cập nhật theo phiếu thu / phiếu chi
const PAY_COLS = [['project', 'Dự án'], ['unit', 'Mã căn hộ'], ['cust_code', 'Mã khách hàng'], ['customer', 'Họ tên khách hàng'], ['phone', 'Số điện thoại'], ['kind_l', 'Loại đề nghị'],
  ['ct_kind_l', 'Loại hợp đồng'], ['contract_no', 'Số hợp đồng'], ['liquidate_on', 'Ngày thanh lý', 'date'], ['contract_status_l', 'Tình trạng hợp đồng'],
  ['collected', 'Tổng tiền đã thu', 'money'], ['deduct_amount', 'Các khoản khấu trừ', 'money'], ['pay_amount', 'Số tiền phải hoàn trả', 'money'], ['paid_amount', 'Số tiền đã chi trả', 'money'], ['remain', 'Số tiền còn phải trả', 'money'],
  ['pay_status_l', 'Trạng thái chi trả'], ['wait_days', 'Số ngày chi trả tiền', 'int'], ['pay_due', 'Ngày dự kiến chi trả', 'date'], ['money_plan_l', 'Phương án xử lý tiền đã nộp'],
  ['acct_status_l', 'Tình trạng bàn giao hồ sơ cho kế toán'], ['acct_on', 'Ngày bàn giao hồ sơ', 'date'], ['paid_on', 'Ngày chi tiền thực tế', 'date'], ['note', 'Ghi chú']];
V.payouts = async (main, params) => {
  const s = ST.pay ||= { project: '', q: '', st: '' };
  s.lf ??= ''; s.lt ??= ''; s.sort ??= '';   // 16/11/2026: lọc «Thanh lý từ ngày … đến ngày …»; sắp xếp theo cột (bấm tiêu đề, bấm lại đảo chiều)
  if (params.project) s.project = params.project;
  const L = (ent, k, v) => M.ents[ent].fields.find(f => f.k === k)?.o?.find(o => o[0] === v)?.[1] || v || '';
  const canNew = M.ents.cancel_req.perm.c;
  main.innerHTML = `<div class="page">${head('04', 'Theo dõi hủy giao dịch, thanh lý hợp đồng và chi trả tiền', 'fa-money-bill-transfer', `${canNew ? `<button class="btn pri" id="pyNew">${ico('fa-plus')} Tạo đề nghị</button>` : ''}<button class="btn" id="pyX">${ico('fa-file-excel')} Xuất file</button>`, 'GD-04')}
    <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="pyQ" placeholder="Tìm mã căn, khách hàng, SĐT, số HĐ…" value="${esc(s.q)}"></div>
      <select id="pyP"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+s.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>
      <select id="pyS"><option value="">Mọi tình trạng chi</option><option value="sap">Đến hạn ≤ 30 ngày / quá hạn</option>${M.ents.cancel_req.fields.find(f => f.k === 'pay_status').o.map(o => `<option value="${o[0]}" ${s.st === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
      <span class="small muted">Thanh lý từ</span>${segDate('pyLF', s.lf)}<span class="small muted">đến</span>${segDate('pyLT', s.lt)}
      <span class="grow"></span><span class="small muted" id="pyN"></span></div><div class="tbl-wrap" id="pyT"><div class="empty">Đang tải…</div></div></div></div>`;
  if (s.st) $('#pyS', main).value = s.st;
  let rows = [];
  const t = today(), t30 = addDays(t, 30);
  const dueCls = r => !r.pay_due || ['da_chi', 'khong_chi'].includes(r.pay_status) ? '' : r.pay_due < t ? 'neg' : r.pay_due <= t30 ? 'warn' : '';
  const load = async () => {
    rows = (await api('GET', '/api/payouts' + (s.project ? '?project=' + s.project : ''))).map(r => ({ ...r, kind_l: L('cancel_req', 'kind', r.kind), contract_status_l: r.contract_status ? L('contract', 'status', r.contract_status) : '', ct_kind_l: (r.ct_kinds || [r.ct_kind]).filter(Boolean).map(k => L('contract', 'kind', k)).join(' + '),   // phiếu thanh lý chung: các loại HĐ trong phiếu
      money_plan_l: L('cancel_req', 'money_plan', r.money_plan), acct_status_l: L('cancel_req', 'acct_status', r.acct_status), pay_status_l: L('cancel_req', 'pay_status', r.pay_status) }));
    draw();
  };
  const shown = () => { const q = s.q.trim().toLowerCase(), lo = d => String(d || '').slice(0, 10);
    const xs = rows.filter(r => (!s.st || (s.st === 'sap' ? !!dueCls(r) : r.pay_status === s.st)) && (!q || [r.unit, r.customer, r.phone, r.contract_no, r.code].some(x => String(x ?? '').toLowerCase().includes(q)))
      && (!s.lf || (r.liquidate_on && lo(r.liquidate_on) >= s.lf)) && (!s.lt || (r.liquidate_on && lo(r.liquidate_on) <= s.lt)));
    if (s.sort) {   // sắp xếp theo cột; ô trống luôn xuống cuối
      const k = s.sort.replace(/^-/, ''), dir = s.sort.startsWith('-') ? -1 : 1, c = PAY_COLS.find(x => x[0] === k), isN = ['money', 'int'].includes(c?.[2]);
      xs.sort((a, b) => { const va = a[k], vb = b[k], ea = va == null || va === '', eb = vb == null || vb === ''; if (ea || eb) return ea - eb;
        return (isN ? (+va - +vb) : String(va).localeCompare(String(vb), 'vi', { numeric: true })) * dir; });
    }
    return xs; };
  const draw = () => {
    const rs = shown();
    $('#pyN', main).textContent = `${rs.length} dòng · phải hoàn trả ${fm(rs.reduce((a, r) => a + (+r.pay_amount || 0), 0))}đ · đã chi ${fm(rs.reduce((a, r) => a + (+r.paid_amount || 0), 0))}đ · còn phải trả ${fm(rs.reduce((a, r) => a + (+r.remain || 0), 0))}đ`;
    $('#pyT', main).innerHTML = rs.length ? `<table class="t pyt"><thead><tr><th>STT</th>${PAY_COLS.map(c => `<th class="${c[2] === 'money' ? 'num' : ''}" data-sk="${c[0]}" style="cursor:pointer" title="Bấm để sắp xếp">${c[1]}${s.sort.replace(/^-/, '') === c[0] ? ` ${ico(s.sort.startsWith('-') ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide')}` : ''}</th>`).join('')}</tr></thead><tbody>${rs.map((r, i) => `<tr data-id="${r.id}" class="${dueCls(r)}"><td class="center">${i + 1}</td>${PAY_COLS.map(c => {
      const v = r[c[0]];
      const html = c[2] === 'money' ? (v != null && v !== '' && (+v || ['collected', 'paid_amount', 'remain'].includes(c[0])) ? fm(v) : '') : c[2] === 'date' ? dmy(v) : c[0] === 'pay_due' ? dmy(v) : esc(v ?? '');
      return `<td class="${c[2] === 'money' ? 'num' : ''} ${c[0] === 'pay_due' ? 'due' : ''} ${c[0] === 'note' || c[0] === 'money_plan_l' ? 'wrap' : ''}">${html}${c[0] === 'pay_due' && dueCls(r) ? ` <span class="tag">${r.pay_due < t ? 'quá hạn' : 'còn ' + Math.round((Date.parse(r.pay_due) - Date.parse(t)) / 864e5) + ' ngày'}</span>` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`
      : '<div class="empty">Chưa có đề nghị hủy giao dịch / thanh lý</div>';
    syncTopScroll();
  };
  $('#pyQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  $('#pyP', main).onchange = run(async e => { s.project = e.target.value; await load(); });
  $('#pyS', main).onchange = e => { s.st = e.target.value; draw(); };
  $('#pyX', main).onclick = () => download('/api/export-rows', { title: 'BẢNG THEO DÕI HỦY GIAO DỊCH, THANH LÝ HỢP ĐỒNG VÀ CHI TRẢ TIỀN', cols: PAY_COLS, rows: shown(), sum: ['collected', 'deduct_amount', 'pay_amount', 'paid_amount', 'remain'], file: 'theo_doi_thanh_ly_chi_tra' });
  $('#pyNew', main) && ($('#pyNew', main).onclick = () => openForm('cancel_req', { onSaved: () => load() }));
  $('#pyT', main).onclick = e => {
    const th = e.target.closest('th[data-sk]'); if (th) { const k = th.dataset.sk; s.sort = s.sort === k ? '-' + k : s.sort === '-' + k ? '' : k; return draw(); }   // tăng → giảm → bỏ sắp xếp
    const tr = e.target.closest('tr[data-id]'); if (tr) openDetail('cancel_req', +tr.dataset.id); };
  ST.reload = async () => { if ($('#pyT', main)) await load(); };   // 16/11/2026: sửa / duyệt phiếu ở màn chi tiết → bảng tải lại ngay (không cần tải lại trang)
  wireSegDate(main);
  main.addEventListener('sdchange', e => { if (!['pyLF', 'pyLT'].includes(e.target.id)) return; const v = segVal(e.target); if (v === null) return; if (e.target.id === 'pyLF') s.lf = v; else s.lt = v; draw(); });
  await load();
};

// theo dõi vay vốn: lấy từ hợp đồng căn hộ chung cư + nhà liền kề, sửa / xóa ngay trên dòng, bấm dòng mở hợp đồng
const LOAN_COLS = [['unit', 'Mã căn hộ'], ['customer', 'Tên khách hàng'], ['number', 'Số HĐ'], ['loan_l', 'Tình trạng vay'], ['loan_bank', 'Tên ngân hàng'], ['doc3_l', 'Tình trạng chứng từ 3 bên']];
// CN-08 bảng tổng hợp công nợ — đúng bố cục file Excel «Bảng tổng hợp công nợ - kinh doanh» (2 tầng tiêu đề, nhóm theo dự án → tòa có dòng cộng)
V.debtsum = async main => {
  (ST.ctkind ||= {}).kind = 'tonghop';
  const f = filt(), s = ST.debtsum ||= { q: '', sign: '', to: '', shut: new Set() };
  let d = null;
  // «Điều kiện lọc» (07/11/2026): tick chọn cột / nhóm cột cần xem (nhớ trên máy) + lọc theo tình trạng công nợ; 8 cột đầu luôn hiện
  const FK = 'ctg-kd-ds-an';
  if (!s.hide) { s.hide = new Set(); try { s.hide = new Set(JSON.parse(localStorage.getItem(FK) || '[]')); } catch { } s.cond ||= ''; s.flt ??= false; s.fq ||= ''; }
  const saveHide = () => { try { localStorage.setItem(FK, JSON.stringify([...s.hide])); } catch { } };
  const head2 = () => d.head.map(([g, cs], gi) => [g, cs.filter((c, ci) => (gi === 0 && ci < 8) || !s.hide.has(c[0]))]).filter(([, cs]) => cs.length);
  const fNorm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
  const drawFlt = () => {
    const box = $('#dsF', main); if (!box || !d) return; let i = 0;
    const secs = d.head.map(([g, cs], gi) => ({ h: g || (gi === 0 ? 'Thông tin căn hộ' : 'Thông tin khác'), ks: cs.filter((c, ci) => !(gi === 0 && ci < 8)) })).filter(x => x.ks.length);
    const nAll = secs.reduce((a, x) => a + x.ks.length, 0), nOn = secs.reduce((a, x) => a + x.ks.filter(c => !s.hide.has(c[0])).length, 0);
    box.innerHTML = `<div class="flt-hd"><b>${ico('fa-filter')} Điều kiện lọc</b><button type="button" class="btn ghost sm" data-fx="hide" title="Ẩn">${ico('fa-xmark')}</button></div>
      <div class="flt-f"><label>Tình trạng công nợ</label><select id="dsC"><option value="">Tất cả</option>${(d.conds || []).map(([k, l]) => `<option value="${k}" ${s.cond === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="flt-sec" style="border-top:0;padding-top:0">Cột hiện trên bảng</div>
      <div class="search flt-q"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="dsFq" placeholder="Tra cứu cột…" value="${esc(s.fq)}" autocomplete="off"></div>
      <div class="flt-ft row" style="margin:0 0 6px;gap:6px"><button type="button" class="btn sm" data-fx="all">${ico('fa-square-check')} Chọn tất cả</button><button type="button" class="btn sm ghost" data-fx="none">Bỏ chọn</button><span class="small muted">${nOn}/${nAll}</span></div>
      ${secs.map(x => `<div data-sg><label class="chk flt-sec" style="display:flex;gap:6px"><input type="checkbox" data-fg="${esc(x.ks.map(c => c[0]).join(','))}" ${x.ks.every(c => !s.hide.has(c[0])) ? 'checked' : ''}> ${esc(x.h)}</label>${x.ks.map(c => `<label class="chk flt-v" data-l="${esc(fNorm(c[1] + ' ' + x.h))}"><input type="checkbox" data-fc="${c[0]}" ${s.hide.has(c[0]) ? '' : 'checked'}> <span class="n">${++i}.</span> ${esc(c[1])}</label>`).join('')}</div>`).join('')}
      <div class="small muted flt-none" hidden>Không có cột nào khớp</div>`;
    fltQ();
  };
  const fltQ = () => { const box = $('#dsF', main); if (!box) return; const q = fNorm(s.fq); let any = false;
    $$('[data-sg]', box).forEach(g => { let n = 0; $$('[data-l]', g).forEach(l => { const on = !q || l.dataset.l.includes(q); l.hidden = !on; if (on) n++; }); g.hidden = !n; if (n) any = true; }); const no = $('.flt-none', box); if (no) no.hidden = any; };
  const cell = (r, c) => { const v = r[c[0]]; if (v == null || v === '') return ''; return c[2] === 'money' ? fm(v) : c[2] === 'num' ? fnum(v) : c[2] === 'date' ? dmy(v) : esc(v); };
  const isN = c => ['money', 'num', 'int'].includes(c[2]);
  const shown = () => { const q = s.q.trim().toLowerCase(); return d.rows.filter(r => !q || [r.unit, r.customer, r.cust_code, r.number, r.phone].some(x => String(x || '').toLowerCase().includes(q))); };
  const draw = () => {
    const H = head2(), cols = H.flatMap(([, cs]) => cs), rs = shown(), tot = k => rs.reduce((a, r) => a + (+r[k] || 0), 0);
    const tile = (l, v, sub, red) => `<div class="card kpi ${red && v ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:20px">${fmB(v)}</div><div class="s">${sub}</div></div>`;
    $('#dsK', main).innerHTML = tile('Giá trị hợp đồng', tot('value'), `${rs.length} căn · ${fm(tot('value'))} đ`) + tile('Tổng đã thu', tot('t_paid'), `${fm(tot('t_paid'))} đ`)
      + tile('Còn lại theo tiến độ', tot('t_left_due'), `${fm(tot('t_left_due'))} đ — đến hạn chưa thu`, 1) + tile('Còn lại theo hợp đồng', tot('t_left'), `${fm(tot('t_left'))} đ · 5% theo HĐ ${fm(tot('pct5'))}`);
    $('#dsN', main).textContent = `${rs.length} căn`;
    if (!rs.length) { $('#dsT', main).innerHTML = '<div class="empty">Không có hợp đồng phù hợp</div>'; return; }
    const sumTds = (label, xs, cls, key) => `<tr class="${cls}" ${key ? `data-g="${esc(key)}"` : ''}><td></td><td colspan="7">${key ? `<i class="fa-solid fa-chevron-right tw-chev ${s.shut.has(key) ? '' : 'on'}"></i> ` : ''}<b>${esc(label)}</b></td>${cols.slice(8).map(c => `<td class="${isN(c) ? 'num' : ''}">${d.sum.includes(c[0]) ? (c[2] === 'num' ? fnum(xs.reduce((a, r) => a + (+r[c[0]] || 0), 0)) : fm(xs.reduce((a, r) => a + (+r[c[0]] || 0), 0))) : ''}</td>`).join('')}</tr>`;
    let body = '';
    // mục theo loại hợp đồng (14/11/2026): 1. HĐ mua bán · 2. HĐ vay · 3. HĐ thuê (thuê / vay có bản chất giao dịch = Bán căn hộ), trong mục chia theo tòa
    const many = new Set(rs.map(r => r.project)).size > 1;
    (d.grps || [['mb', 'HỢP ĐỒNG MUA BÁN']]).filter(([g]) => rs.some(r => (r.grp || 'mb') === g)).forEach(([g, gl], gi) => {
      const grs = rs.filter(r => (r.grp || 'mb') === g);
      body += sumTds(`${gi + 1}. ${gl} (${grs.length})`, grs, 'ds-sec');
      for (const pj of [...new Set(grs.map(r => r.project))]) for (const b of [...new Set(grs.filter(r => r.project === pj).map(r => r.building))]) {
        const brs = grs.filter(r => r.project === pj && r.building === b), key = g + '|' + pj + '|' + b;
        body += sumTds('Tòa ' + b + (many ? ' — ' + (brs[0].project_name || pj) : ''), brs, 'ds-bld', key);
        if (!s.shut.has(key)) body += brs.map((r, i) => `<tr data-c="${r.contract_id}">${cols.map(c => `<td class="${isN(c) ? 'num' : ''} ${c[0] === 'address' ? 'ds-addr' : ''}">${c[0] === 'stt' ? i + 1 : c[0] === 'sign_l' ? (r.signed ? pill(r.sign_l, 'g') : pill(r.sign_l, 's')) : cell(r, c)}</td>`).join('')}</tr>`).join('');
      }
    });
    $('#dsT', main).innerHTML = `<div class="tbl-wrap"><table class="t compact hd2 grid-bravo dsum"><thead>
      <tr class="h1">${H.map(([g, cs]) => g ? `<th colspan="${cs.length}">${esc(g)}</th>` : cs.map(c => `<th rowspan="2" class="${isN(c) ? 'num' : ''}">${esc(c[1])}</th>`).join('')).join('')}</tr>
      <tr>${H.filter(([g]) => g).flatMap(([, cs]) => cs).map(c => `<th class="num">${esc(c[1])}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody><tfoot>${sumTds('Tổng cộng:', rs, 'ds-tot')}</tfoot></table></div>`;
  };
  const load = async () => {
    const ok = latest(main), r = await api('GET', '/api/debt-summary?' + qsOf({ project: f.project, building: f.building, to: s.to, cond: s.cond }));
    if (!ok()) return; d = r;
    $('#srcLine', main).innerHTML = `<span>${ico('fa-database')} Thực thu đồng bộ Bravo${d.bravo_sync ? ' — chốt ' + dmyhm(d.bravo_sync) : ''}</span><span>Số liệu đến ${dmy(d.to)}</span>`;
    draw(); drawFlt();
  };
  main.innerHTML = `<div class="page">${head('06', 'Theo dõi công nợ — Bảng tổng hợp', 'fa-table-list', `<button class="btn" id="dsX">${ico('fa-file-excel')} Xuất file</button><a class="btn" href="#/v/ledger">${ico('fa-book-open')} Sổ công nợ chi tiết</a>`, 'CN-08')}${ctKindBar('tonghop')}${filterBar(f, { period: false })}
    <div class="grid g4 mb" id="dsK"></div>
    <div class="card"><div class="toolbar"><button class="btn sm" id="dsFl">${ico('fa-filter')} Điều kiện lọc</button><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="dsQ" placeholder="Mã căn, mã KH, họ tên, SĐT, số HĐ…" value="${esc(s.q)}"></div>
      <span class="small muted">Hợp đồng đã duyệt</span>
      <span class="small muted">Số liệu đến ngày</span>${segDate('dsTo', s.to || today())}
      <span class="grow"></span><span class="small muted" id="dsN"></span></div>
    <div class="flt-wrap ${s.flt ? '' : 'flt-off'}" id="dsW" style="padding:0 12px"><aside class="flt" id="dsF"></aside><div class="flt-main"><div id="dsT"><div class="empty">Đang tính công nợ…</div></div></div></div>
    <div class="small muted mt">Tiền nhà = tiền sau thuế không gồm hệ số góc · Hệ số lô góc tính sau thuế · Hoàn thiện căn hộ = giá trị hoàn thiện (gộp HĐMB + HĐ hoàn thiện riêng) · Bảo trì = phí bảo trì 2%. Thu tiền Bravo không ghi theo khoản → mỗi kỳ thu chia theo cơ cấu của kỳ (đợt thu phí bảo trì gánh trọn phí bảo trì). «Theo tiến độ» = các kỳ đến hạn tới ngày chốt. Bấm 1 căn để mở hợp đồng & lịch thanh toán, bấm dòng tòa để thu gọn.</div></div></div>`;
  wireFilter(main, f, load); wireSegDate(main);
  $('#dsQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 250);
  const pg = $('.page', main);   // 16/11/2026: gắn vào trang của màn này, không gắn vào khung chung — trước gõ ngày ở tab khác vẫn chạy tải lại bảng tổng hợp → lỗi «Cannot set properties of null»
  pg.addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (!v || e.target.id !== 'dsTo') return; s.to = v; await load(); }));
  $('#dsX', main).onclick = () => download('/api/debt-summary.xlsx?' + qsOf({ project: f.project, building: f.building, to: d?.to, q: s.q.trim(), cond: s.cond, hide: [...s.hide].join(',') }));
  // Điều kiện lọc: bật / tắt khung, tick cột / nhóm, chọn tình trạng, tra cứu cột
  pg.addEventListener('change', run(async e => {
    const t = e.target;
    if (t.id === 'dsC') { s.cond = t.value; return load(); }
    if (t.dataset.fc) { t.checked ? s.hide.delete(t.dataset.fc) : s.hide.add(t.dataset.fc); saveHide(); draw(); return drawFlt(); }
    if (t.dataset.fg) { for (const k of t.dataset.fg.split(',')) t.checked ? s.hide.delete(k) : s.hide.add(k); saveHide(); draw(); return drawFlt(); }
  }));
  pg.addEventListener('input', e => { if (e.target.id === 'dsFq') { s.fq = e.target.value; fltQ(); } });
  main.onclick = e => {
    if (ctKindClick(e, main)) return;
    if (e.target.closest('#dsFl') || e.target.closest('#dsF [data-fx=hide]')) { s.flt = !s.flt; return $('#dsW', main).classList.toggle('flt-off', !s.flt); }
    const fx = e.target.closest('#dsF [data-fx]')?.dataset.fx; if (fx === 'all' || fx === 'none') { const ks = d.head.flatMap(([, cs], gi) => cs.filter((c, ci) => !(gi === 0 && ci < 8)).map(c => c[0])); fx === 'all' ? s.hide.clear() : ks.forEach(k => s.hide.add(k)); saveHide(); draw(); return drawFlt(); }
    const g = e.target.closest('tr[data-g]'); if (g) { const k = g.dataset.g; s.shut.has(k) ? s.shut.delete(k) : s.shut.add(k); return draw(); }
    const tr = e.target.closest('tr[data-c]'); if (tr) openDetail('contract', +tr.dataset.c, 'debt');
  };
  ST.reload = async () => { if ($('#dsT', main)) await load(); };
  await load();
};
// CN-06 tình trạng căn hộ theo bản chất giao dịch + công nợ tách theo hợp đồng (tiền vay / tiền thuê không trừ vào giá mua)
// CN-06 Tình trạng công nợ đến hạn (07/11/2026): biểu đồ phân loại nợ, top căn nợ quá hạn, dòng thu – chi 6 tháng; bảng phân loại nợ theo mã căn (nhóm tự động theo số ngày quá hạn, chỉnh tay được)
// Chi tiết công nợ 1 căn (mở từ Tình trạng công nợ đến hạn) — 07/11/2026: tổng quan, hợp đồng, vay vốn, nhắc nợ & nhóm nợ, thao tác
V.debtunit = async (main, params = {}) => {
  const uid = +params.id;
  const tag = (t, k = 'default') => `<span class="ad-tag ad-tag-${k}">${t}</span>`;
  const back = () => history.length > 1 ? history.back() : (location.hash = '#/v/duedebt');
  const draw = async () => {
    const d = await api('GET', '/api/debt-status?' + qsOf({ unit: uid })), r = d.rows[0];
    if (!r) { main.innerHTML = `<div class="page ad"><div class="ad-card ad-card-pad">Căn này không có hợp đồng đã ký còn công nợ. <a href="#/v/duedebt">Quay lại</a></div></div>`; return; }
    const short = k => (d.labels[k] || '').split(' · ')[0], T = today();
    const stat = (t, v, foot, cls = '') => `<div class="ad-stat ${cls}"><div class="ad-stat-t">${t}</div><div class="ad-stat-v">${v}</div><div class="ad-stat-f">${foot}</div></div>`;
    const kv = rows => `<table class="ad-desc du-kv"><tbody>${rows.filter(Boolean).map(([l, v]) => `<tr><th>${l}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
    const pct = r.due ? Math.min(100, Math.round(r.paid / r.due * 100)) : 0, canThu = !!M.ents.receipt?.perm?.c;   // tạo phiếu thu ngay ở màn này (07/11/2026)
    const ctRows = r.contracts.map(c => `<tr data-ct="${c.id}"><td><b>${esc(c.kind_l)}</b><small>${esc(c.number || '')}</small></td><td class="num">${fm(c.total)}</td><td class="num">${fm(c.paid)}</td><td class="num"><b>${fm(c.left)}</b></td>
      <td class="num">${c.overdue ? `<b class="ad-c-error">${fm(c.overdue)}</b><small>${c.days} ngày</small>` : '<span class="ad-muted">—</span>'}</td><td class="num">${c.next_on ? `${fm(c.next_amt)}<small>hạn ${dmy(c.next_on)}</small>` : '<span class="ad-muted">—</span>'}</td><td class="nowrap">${canThu ? `<button class="ad-btn du-thu" data-thu="${c.id}" title="Lập phiếu thu cho hợp đồng này">${ico('fa-plus')} Phiếu thu</button>` : ''} ${ico('fa-chevron-right')}</td></tr>`).join('');
    const bank = r.bank ? kv([['Vay ngân hàng', esc(r.bank.st_l)], r.bank.st === 'co_vay' && ['Ngân hàng', esc(r.bank.bank || '—')], r.bank.st === 'co_vay' && ['Chứng từ 3 bên', esc(r.bank.doc3_l || '—')]]) : '<div class="ad-empty">HĐMB chưa ghi tình trạng vay vốn</div>';
    const vay = r.vay ? kv([['Số HĐ vay', `<a href="#/v/ctdebt?id=${r.vay.id}">${esc(r.vay.number || '')}</a>`], ['Gốc theo hợp đồng', fm(r.vay.goc)], ['Khách đã chuyển', fm(r.vay.goc_nhan)], ['Gốc khách chưa chuyển', fm(r.vay.goc_cho)],
      ['Lãi', esc(r.vay.rate_l)], ['Lãi còn phải trả khách', fm(r.vay.lai_con) + (r.vay.lai_qh ? ` <span class="ad-c-error">(quá hạn ${fm(r.vay.lai_qh)})</span>` : '')], ['Đáo hạn', dmy(r.vay.exp_on) || '—']]) : '';
    const calls = r.calls.length ? `<table class="ad-table"><thead><tr><th>Ngày</th><th>Kết quả</th><th>Nội dung</th><th>Hẹn trả</th></tr></thead><tbody>${r.calls.map(c => `<tr><td class="nowrap">${dmy(c.at)}</td><td>${esc(c.result_l)}</td><td>${esc(c.content)}</td><td class="nowrap">${esc(c.promise || '—')}</td></tr>`).join('')}</tbody></table>${r.calls_n > r.calls.length ? `<div class="du-more">+ ${r.calls_n - r.calls.length} lần trước — xem ở <a href="#/v/unit360?id=${r.unit_id}">Hồ sơ căn 360°</a></div>` : ''}` : '<div class="ad-empty">Chưa ghi lần nhắc nợ nào</div>';
    main.innerHTML = `<div class="page ad du">
      <div class="ad-crumb"><a href="#/v/duedebt">Công nợ &amp; kế hoạch thu</a><i>/</i><a href="#/v/duedebt">Báo cáo công nợ đến hạn</a><i>/</i><span>${esc(r.unit)}</span></div>
      <div class="ad-head"><button class="ad-back" id="duBack" title="Quay lại">${ico('fa-arrow-left')}</button>
        <div class="ad-head-main"><div class="ad-head-title"><h1>${esc(r.unit)}</h1>${tag(esc(short(r.grp)) + (r.grp === 'n5' ? ' · Nợ khó đòi' : ''), { n1: 'success', n2: 'processing', n3: 'warning', n4: 'error', n5: 'error' }[r.grp])}${r.manual ? tag('chỉnh tay', 'default') : ''}</div>
          <div class="ad-head-sub">${[esc(r.customer), r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '', esc(r.project + ' · Tòa ' + r.building), r.owner ? 'NV ' + esc(r.owner) : ''].filter(Boolean).join('<i>·</i>')}</div></div>
        <div class="ad-head-extra">${d.can_class ? `<button class="ad-btn" id="duCall">${ico('fa-phone')} Ghi nhắc nợ</button><button class="ad-btn" id="duCls">${ico('fa-tags')} Cập nhật nhóm nợ</button>` : ''}${d.can_plan && !r.plan_n ? `<button class="ad-btn ad-btn-primary" id="duPlan">${ico('fa-calendar-plus')} Lập kế hoạch thu</button>` : ''}<a class="ad-btn" href="#/v/unit360?id=${r.unit_id}">${ico('fa-cube')} Hồ sơ 360°</a>${canThu ? `<button class="ad-btn ad-btn-primary" id="duThu">${ico('fa-plus')} Phiếu thu</button>` : ''}</div></div>
      ${r.warns.length ? `<div class="du-warn">${r.warns.map(([k, t]) => `<span class="us-w us-w-${k}">${ico(k === 'r' ? 'fa-circle-exclamation' : k === 'a' ? 'fa-triangle-exclamation' : 'fa-circle-info')} ${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="ad-card"><div class="ad-card-head">Tổng quan công nợ<span class="ad-card-extra">tính đến ${dmy(T)}</span></div>
        <div class="ad-stats">${stat('Phải thu đến hạn', fm(r.due), `còn theo hợp đồng ${fm(r.left)}`)}${stat('Đã thu', fm(r.paid), `<div class="ad-progress"><div class="ad-progress-rail"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>`, 'ad-stat-success')}
          ${stat('Còn phải thu đến hạn', fm(r.due_left), r.next_on ? `đợt tới ${fm(r.next_amt)} · hạn ${dmy(r.next_on)}` : 'không còn đợt tới')}${stat('Nợ quá hạn', fm(r.overdue), r.days ? `${r.days} ngày${r.late_int ? ` · lãi ${fm(r.late_int)}` : ''}` : 'không quá hạn', r.overdue ? 'ad-stat-error' : '')}</div></div>
      <div class="ad-card"><div class="ad-card-head">Hợp đồng trên căn<span class="ad-card-extra">bấm 1 dòng để xem công nợ từng đợt</span></div>
        <div class="ad-table-wrap"><table class="ad-table ad-table-click"><thead><tr><th>Hợp đồng</th><th class="num">Phải thu</th><th class="num">Đã thu</th><th class="num">Còn lại</th><th class="num">Quá hạn</th><th class="num">Đợt tới</th><th></th></tr></thead><tbody>${ctRows}</tbody></table></div></div>
      <div class="us-g2"><div class="ad-card"><div class="ad-card-head">Vay vốn</div><div class="us-pad">${bank}${vay ? `<div class="du-sub">HĐ vay (công ty vay của khách)</div>${vay}` : ''}</div></div>
        <div class="ad-card"><div class="ad-card-head">Nhóm nợ &amp; kế hoạch thu</div><div class="us-pad">${kv([['Nhóm nợ', esc(d.labels[r.grp])], r.manual && ['Lý do chỉnh tay', esc(r.manual.reason)], ['Tự động theo số ngày', esc(d.labels[r.auto])], ['Kế hoạch thu tháng này', r.plan_m ? `${fm(r.plan_m)} · dự kiến ${dmy(r.plan_on)}${r.plan_st ? ' · ' + esc(r.plan_st) : ''}` : '<span class="ad-c-error">chưa lập</span>']])}
          ${r.hist.length ? `<div class="du-sub">Lịch sử nhóm nợ</div><div class="us-hist">${r.hist.map(h => `<div>${dmy(String(h.at).slice(0, 10))} · ${esc(h.by_l)}: ${h.from === 'auto' ? 'tự động' : esc(short(h.from))} → ${h.to === 'auto' ? 'tự động' : esc(short(h.to))} — ${esc(h.reason)}</div>`).join('')}</div>` : ''}</div></div></div>
      <div class="ad-card"><div class="ad-card-head">Lịch sử nhắc nợ<span class="ad-card-extra">${r.calls_n} lần</span></div><div class="us-pad">${calls}</div></div></div>`;
    $('#duBack', main).onclick = back;
    main.onclick = run(async e => {
      const cid = r.contract_id;
      const th = e.target.closest('[data-thu]') || (e.target.closest('#duThu') && { dataset: { thu: cid } });
      if (th) { const id = +th.dataset.thu, c = r.contracts.find(x => x.id === id); return openForm('receipt', { preset: { contract_id: id, contract_id__l: c?.number || '', voucher_date: today(), ...(c?.overdue ? { amount: c.overdue } : c?.next_amt ? { amount: c.next_amt } : {}) }, onSaved: draw }); }
      const ct = e.target.closest('tr[data-ct]'); if (ct) { location.hash = `#/v/ctdebt?id=${ct.dataset.ct}`; return; }
      if (e.target.closest('#duCall')) return openForm('debt_call', { preset: { contract_id: cid, contract_id__l: r.contracts.find(c => c.id === cid)?.number || '' }, onSaved: draw });
      if (e.target.closest('#duPlan')) return openForm('collect_plan', { preset: { month: d.month, contract_id: cid, contract_id__l: r.contracts.find(c => c.id === cid)?.number || '', expected: r.due_left || null, expected_on: today(), basis: 'lich_hd', ability: ['n4', 'n5'].includes(r.grp) ? 'thap' : 'vua' }, onSaved: draw });
      if (e.target.closest('#duCls')) {
        const m = modal({ title: `Cập nhật nhóm nợ — căn ${esc(r.unit)}`, narrow: true, body: `<p class="small muted" style="margin:0 0 10px">Tự động theo số ngày quá hạn: <b>${esc(d.labels[r.auto])}</b>${r.days ? ` (quá hạn ${r.days} ngày)` : ''}.</p>
            <div class="fld"><label>Nhóm nợ</label><select id="clG">${['auto', 'n1', 'n2', 'n3', 'n4', 'n5'].map(k => `<option value="${k}" ${(r.manual?.grp || 'auto') === k ? 'selected' : ''}>${k === 'auto' ? 'Theo tự động' : esc(d.labels[k])}</option>`).join('')}</select></div>
            <div class="fld"><label>Lý do<span class="req">*</span></label><textarea id="clR">${esc(r.manual?.reason || '')}</textarea></div>`, foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="clOk">Lưu</button>` });
        $('#clOk', m.el).onclick = run(async () => { await api('PUT', `/api/debt-status/${r.unit_id}/class`, { grp: $('#clG', m.el).value, reason: $('#clR', m.el).value }); m.close(); toast('Đã cập nhật nhóm nợ'); await draw(); });
      }
    });
  };
  ST.reload = draw;
  await draw();
};
const DG_COL = { n1: '#7DBF9B', n2: '#7FA0D6', n3: '#E3A93B', n4: '#E8734A', n5: '#C62828' };
const DG_TAG = { n1: 'success', n2: 'processing', n3: 'warning', n4: 'error', n5: 'error' };
const fmS = n => { n = +n || 0; const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(a >= 1e11 ? 0 : 2).replace('.', ',') + ' tỷ' : a >= 1e6 ? Math.round(n / 1e6).toLocaleString('vi-VN') + ' tr' : fm(n); };
// biểu đồ dòng thu – chi dự kiến 6 tháng (dùng ở Kế hoạch dự kiến dòng thu-chi) — 07/11/2026
const flowChart = F => {
  const fx = Math.max(1, ...F.map(x => Math.max(x.thu + x.thu_kd, x.chi, x.plan)));
  const h = v => Math.max(v ? 2 : 0, v / fx * 100);
  const flow = `<div class="us-flow">${F.map((x, k) => `<div class="us-fm"><div class="us-fb">
      <div class="us-col" title="Thu dự kiến ${fm(x.thu)}${x.thu_kd ? ' + nợ khó đòi ' + fm(x.thu_kd) : ''}"><span class="us-cv">${fmS(x.thu + x.thu_kd)}</span><i class="us-c-kd" style="height:${h(x.thu_kd)}%"></i><i class="us-c-thu" style="height:${h(x.thu)}%"></i>${x.plan ? `<b class="us-plan" style="bottom:${h(x.plan)}%" title="Kế hoạch đã lập ${fm(x.plan)}"></b>` : ''}</div>
      <div class="us-col" title="Chi trả HĐ vay ${fm(x.chi)}"><span class="us-cv">${x.chi ? fmS(x.chi) : ''}</span><i class="us-c-chi" style="height:${h(x.chi)}%"></i></div></div>
      <div class="us-fl">${k ? 'T' + (+x.m.slice(5)) + '/' + x.m.slice(2, 4) : 'Tháng này'}</div><div class="us-fn">ròng <b class="${x.thu - x.chi < 0 ? 'ad-c-error' : ''}">${fmS(x.thu - x.chi)}</b></div></div>`).join('')}</div>
    <div class="us-fleg"><span><i class="us-c-thu"></i>Thu dự kiến theo lịch HĐ</span><span><i class="us-c-kd"></i>Thu từ căn nợ khó đòi (khó về)</span><span><i class="us-c-chi"></i>Chi trả lãi / gốc HĐ vay cho khách</span><span><b class="us-plan us-plan-k"></b>Kế hoạch thu đã lập</span></div>`;
  return flow;
};
// Kế hoạch dự kiến dòng thu-chi: khối «Dòng thu – chi dự kiến 6 tháng» trên đầu danh sách (chuyển từ màn Tình trạng công nợ đến hạn, 07/11/2026)
const planFlow = async (main, params) => {
  let d; try { d = await api('GET', '/api/debt-status'); } catch { return; }   // không có quyền xem công nợ → chỉ hiện danh sách
  const m = d.month || today().slice(0, 7), mL = `${m.slice(5)}/${m.slice(0, 4)}`, ph = $('.page > .ph', main); if (!ph) return;
  const box = document.createElement('div'); box.className = 'ad us pf-box';
  box.innerHTML = `<div class="ad-card"><div class="ad-card-head">Dòng thu – chi dự kiến 6 tháng<span class="ad-card-extra">${d.can_plan ? `<button class="ad-btn ad-btn-primary" id="pfPlan">${ico('fa-wand-magic-sparkles')} Lập kế hoạch thu tháng ${mL}</button>` : ''}<a class="ad-btn" href="#/v/duedebt">${ico('fa-scale-unbalanced')} Tình trạng công nợ đến hạn</a></span></div>
    <div class="us-pad">${flowChart(d.flow)}
      <ol class="us-steps"><li><b>Rà bảng phân loại nợ</b> ở màn <a href="#/v/duedebt">Báo cáo công nợ đến hạn</a>: gọi nhắc từng căn quá hạn, ghi «Ghi nhắc nợ» kèm số tiền và ngày khách cam kết.</li>
        <li>Bấm <b>«Lập kế hoạch thu tháng ${mL}»</b>: app tự tạo dòng kế hoạch cho từng căn còn nợ đến hạn. Căn có cam kết thì lấy theo cam kết, căn khác theo lịch hợp đồng. Căn nhóm 4–5 được đánh khả năng thu «Thấp».</li>
        <li>Sửa số dự kiến từng căn ở bảng bên dưới, rồi trình trưởng phòng duyệt.</li>
        <li>Cuối tháng app tự so thực thu với kế hoạch. Căn chưa thu được thì ghi nguyên nhân, đưa sang kế hoạch tháng sau.</li></ol></div></div>`;
  ph.after(box);
  const b = $('#pfPlan', box); if (b) b.onclick = run(async () => {
    const ok = await ask('Lập kế hoạch thu', `App sẽ tự tạo dòng kế hoạch tháng ${mL} cho các căn còn nợ đến hạn, chưa có kế hoạch. Sau đó anh/chị kiểm tra, sửa và trình duyệt.`, { okLabel: 'Lập kế hoạch' }); if (!ok) return;
    const x = await api('POST', '/api/collect_plan/suggest', { month: m }); toast(`Đã tạo ${x.created} dòng kế hoạch${x.skipped?.length ? ` · bỏ qua ${x.skipped.length}: ${x.skipped.slice(0, 3).join('; ')}${x.skipped.length > 3 ? '…' : ''}` : ''}`);
    await listView(main, 'collect_plan', params); await planFlow(main, params);
  });
};
// 17/11/2026: KẾ HOẠCH THU TUẦN/THÁNG (màn collect_plan, thiết kế lại) — 1 bộ lọc chung (Theo tháng / Theo tuần, năm, tháng, tuần, dự án, tòa, ngày thực hiện);
// dải 3 chỉ tiêu (kế hoạch – thực hiện – tỷ lệ của kỳ đang chọn); biểu đồ thanh ngang theo đúng chế độ (tuần của tháng / 12 tháng của năm), trạng thái kỳ Đã chốt / Đang thực hiện /
// Chưa đến kỳ / Chưa có kế hoạch, bấm kỳ để xem báo cáo; CHI TIẾT THỰC HIỆN KẾ HOẠCH THU 6 cột, Nhóm thu → Tòa → Căn (1 dòng / mã căn), bấm mã căn xem chi tiết + lịch sử, điều chỉnh;
// Xuất Excel, In / PDF (A4 ngang, lặp tiêu đề bảng, ngày lập, ký Người lập – Trưởng bộ phận)
const planWeek = async main => {
  const s = ST.planrep ||= { by: 'thang', ym: today().slice(0, 7), week: '', project: '', building: '', from: '', to: '', shut: {} }; s.shut ||= {};
  main.innerHTML = `<div class="page pw2">${head('06', 'Kế hoạch thu tuần/tháng', 'fa-chart-line', `<button class="btn" id="prX">${ico('fa-file-excel')} Xuất Excel</button><button class="btn" id="prPr">${ico('fa-print')} In / PDF</button>${M.ents.collect_plan?.perm?.c ? `<button class="btn" id="prNew">${ico('fa-plus')} Tạo kế hoạch</button><button class="btn pri" id="prSale">${ico('fa-bullhorn')} Tạo dòng thu bán mới</button>` : ''}`, 'CN-03')}
    <div class="card mb pw-f"></div><div class="pw-k mb"></div><div class="card mb pr-chart"></div><div class="card mb pr-box"></div></div>`;
  const fbox = $('.pw-f', main), kbox = $('.pw-k', main), cbox = $('.pr-chart', main), box = $('.pr-box', main);
  const MW = ym => { const [y, m] = ym.split('-').map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate(), W = [];
    for (let i = 1; i <= last;) { const dow = (new Date(Date.UTC(y, m - 1, i)).getUTCDay() + 6) % 7, e = Math.min(last, i + 6 - dow); W.push({ n: W.length + 1, from: `${ym}-${String(i).padStart(2, '0')}`, to: `${ym}-${String(e).padStart(2, '0')}` }); i = e + 1; }
    return W; };
  const curWk = ym => ym === today().slice(0, 7) ? (MW(ym).find(w => w.from <= today() && today() <= w.to)?.n || 1) : 1;
  const pct = (a, p) => p > 0 ? (Math.round(a / p * 1000) / 10).toLocaleString('vi-VN') + '%' : '—';
  const tr = v => (Math.round(v / 1e5) / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  let d = null, dm = null, yr = null;
  const load = async () => { const q = new URLSearchParams({ by: s.by, ym: s.ym, to: s.to || today() });
    if (s.by === 'tuan') q.set('week', s.week === '' ? curWk(s.ym) : s.week); if (s.from) q.set('from', s.from); if (s.project) q.set('project', s.project); if (s.building) q.set('building', s.building);
    d = await api('GET', '/api/plan-report?' + q); if (s.by === 'tuan' && s.week === '') s.week = String(d.week);
    if (s.by === 'tuan') { q.set('by', 'thang'); q.delete('week'); dm = await api('GET', '/api/plan-report?' + q); }
    else { q.set('yearsum', '1'); yr = (await api('GET', '/api/plan-report?' + q)).yearsum; }   // 12 tháng của năm — cùng dữ liệu kế hoạch thu tuần/tháng
    drawF(); draw(); chart(); };
  // ---- bộ lọc chung
  const drawF = () => { const W = MW(s.ym), y0 = +s.ym.slice(0, 4), ty = +today().slice(0, 4), years = [...new Set([ty - 1, ty, ty + 1, y0])].sort();
    fbox.innerHTML = `<div class="pw-fr"><span class="pw-seg"><button type="button" class="${s.by === 'thang' ? 'on' : ''}" data-prby="thang">Theo tháng</button><button type="button" class="${s.by === 'tuan' ? 'on' : ''}" data-prby="tuan">Theo tuần</button></span>
      <select id="prY" title="Năm">${years.map(y => `<option value="${y}" ${y === y0 ? 'selected' : ''}>Năm ${y}</option>`).join('')}</select>
      <select id="prM" title="Tháng">${Array.from({ length: 12 }, (_, i) => i + 1).map(m => `<option value="${m}" ${m === +s.ym.slice(5) ? 'selected' : ''}>Tháng ${m}</option>`).join('')}</select>
      ${s.by === 'tuan' ? `<select id="prW" title="Tuần trong tháng">${W.map(w => `<option value="${w.n}" ${String(w.n) === String(s.week) ? 'selected' : ''}>Tuần ${w.n} (${dmy(w.from).slice(0, 5)} – ${dmy(w.to).slice(0, 5)})</option>`).join('')}<option value="0" ${String(s.week) === '0' ? 'selected' : ''}>Chưa phân bổ tuần</option></select>` : ''}
      <select id="prP"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+s.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>
      <select id="prB"><option value="">Tất cả tòa</option>${M.buildings.filter(b => !s.project || b.project_id === +s.project).map(b => `<option value="${b.id}" ${+s.building === b.id ? 'selected' : ''}>Tòa ${esc(b.code)}</option>`).join('')}</select>
      <span class="pw-dt"><span class="small muted">Thực hiện từ</span><span id="prDates" style="display:contents">${segDate('prFr', s.from)}<span class="small muted">đến</span>${segDate('prTo', s.to || today())}</span></span></div>`;
    wireSegDate(fbox); };
  // ---- dữ liệu cây Nhóm thu → Tòa → Căn
  // 17/11/2026: 3 nhóm thu — I. Thu nợ khách hàng · II. Thu cho thuê · III. Thu bán mới; dòng thu bán mới chưa có căn: cột Căn hộ = nội dung kế hoạch, Tên khách hàng = «—»
  const keyOf = r => r.unit_id ? 'u' + r.unit_id : 'g' + (r.grp_key || r.id);
  // 17/11/2026: phân cấp Nhóm thu → Dự án → Tòa → căn hộ / dòng kế hoạch (thu bán mới: dòng = nội dung kế hoạch theo dự án / tòa)
  const tree = () => { const G = [['ban', 'Thu nợ khách hàng'], ['thue', 'Thu cho thuê'], ['moi', 'Thu bán mới']].map(([k, l], i) => ({ k, l: `${['I', 'II', 'III'][i]}. ${l}`, plan: 0, act: 0, ps: new Map() }));
    for (const r of d.rows) { const g = G.find(x => x.k === r.scope) || G[0], pl = r.project || 'Chưa chọn dự án', p = g.ps.get(pl) || g.ps.set(pl, { l: pl, plan: 0, act: 0, bs: new Map() }).get(pl);
      const bl = r.building || 'Chưa chọn tòa', b = p.bs.get(bl) || p.bs.set(bl, { l: bl, plan: 0, act: 0, us: new Map() }).get(bl), k = keyOf(r);
      const u = b.us.get(k) || b.us.set(k, { id: k, unit: r.unit || r.title || '—', b: r.building || '', cust: new Set(), plan: 0, act: 0 }).get(k);
      if (r.customer) u.cust.add(r.customer); for (const x of [g, p, b, u]) { x.plan += r.plan_v; x.act += r.actual; } }
    const so = m => [...m.values()].sort((a, b) => String(a.l).localeCompare(String(b.l)));
    return G.map(g => ({ ...g, ps: so(g.ps).map(p => ({ ...p, bs: so(p.bs).map(b => ({ ...b, us: [...b.us.values()].sort((a, c) => a.unit.localeCompare(c.unit)) })) })) })); };
  const flat = () => { const out = []; let P = 0, A = 0;
    for (const g of tree()) { out.push({ lv: 0, key: g.k, anc: [], b: g.l, plan: g.plan, act: g.act }); P += g.plan; A += g.act;
      for (const p of g.ps) { const pk = g.k + '|' + p.l; out.push({ lv: 1, key: pk, anc: [g.k], b: p.l === 'Chưa chọn dự án' ? p.l : 'Dự án ' + p.l, plan: p.plan, act: p.act });
        for (const b of p.bs) { const bk = pk + '|' + b.l; out.push({ lv: 2, key: bk, anc: [g.k, pk], b: b.l === 'Chưa chọn tòa' ? b.l : 'Tòa ' + b.l, plan: b.plan, act: b.act });
          for (const u of b.us) out.push({ lv: 3, anc: [g.k, pk, bk], uid: u.id, scope: g.k, b: u.b, unit: u.unit, cust: [...u.cust].join(', ') || '—', plan: u.plan, act: u.act }); } } }
    out.push({ lv: -1, b: 'Tổng cộng', plan: P, act: A }); return out; };
  const period = () => `${d.title}`, done = () => `Thực hiện: ${d.from ? 'từ ngày ' + dmy(d.from) : 'từ ngày lập kế hoạch'} đến ngày ${dmy(d.to)}`;
  const scope = () => `${s.project ? M.projects.find(p => p.id === +s.project)?.name || '' : 'Tất cả dự án'}${s.building ? ' · Tòa ' + (M.buildings.find(b => b.id === +s.building)?.code || '') : ''}`;
  // ---- dải 3 chỉ tiêu + bảng
  const draw = () => { const F = flat(), T = F[F.length - 1];
    kbox.innerHTML = `<div class="pw-kpi"><div><span>Tiền kế hoạch</span><b>${fm(T.plan)}</b></div><div><span>Tiền thực hiện</span><b>${fm(T.act)}</b></div><div><span>Tỷ lệ hoàn thành</span><b>${pct(T.act, T.plan)}</b></div>
      <div class="pw-kp"><span class="small muted">${esc(period())}${d.closed ? ' · đã chốt' : ''}</span></div></div>`;
    const hid = r => (r.anc || []).some(k => s.shut[k]);
    const tw = r => r.lv >= 0 && r.lv <= 2 ? `<span class="pr-tg" data-prtg="${esc(r.key)}">${ico(s.shut[r.key] ? 'fa-caret-right' : 'fa-caret-down')}</span> ` : '';
    box.innerHTML = `<div class="pr-h"><span class="pr-tt">CHI TIẾT THỰC HIỆN KẾ HOẠCH THU</span><div>${esc(period())}</div><div class="small muted">${esc(done())} · ${esc(scope())} · Đơn vị: đồng</div></div>
      <div style="overflow-x:auto"><table class="pr-t"><colgroup><col style="width:9%"><col style="width:14%"><col><col style="width:16%"><col style="width:16%"><col style="width:13%"></colgroup>
        <thead><tr><th>Tòa</th><th>Căn hộ</th><th>Tên khách hàng</th><th class="n">Tiền kế hoạch</th><th class="n">Tiền thực hiện</th><th class="n">Tỷ lệ hoàn thành</th></tr></thead><tbody>
        ${F.map(r => hid(r) ? '' : r.lv === 3 ? `<tr class="u"><td>${esc(r.b)}</td><td><a href="#" data-pru="${r.uid}" data-prsc="${r.scope}" title="Xem chi tiết khoản thu và lịch sử">${esc(r.unit)}</a></td><td>${esc(r.cust)}</td><td class="n">${fm(r.plan)}</td><td class="n">${fm(r.act)}</td><td class="n">${pct(r.act, r.plan)}</td></tr>`
          : `<tr class="${r.lv === 0 ? 'g' : r.lv === 1 ? 'p' : r.lv === 2 ? 'b' : 't'}"><td colspan="3">${tw(r)}${esc(r.b)}</td><td class="n">${fm(r.plan)}</td><td class="n">${fm(r.act)}</td><td class="n">${pct(r.act, r.plan)}</td></tr>`).join('')}
      </tbody></table></div>
      ${d.rows.length ? '' : '<div class="empty">Chưa có khoản kế hoạch thu trong kỳ — tích «Đưa vào kế hoạch thu» ở <a href="#/v/duedebt">Báo cáo công nợ đến hạn</a></div>'}
      <details class="pw-rule"><summary>Xem nguyên tắc tính và chuyển tiếp</summary><ul>
        <li>Tiền kế hoạch: các căn được tích «Đưa vào kế hoạch thu» ở Báo cáo công nợ đến hạn (và khoản lập tay), theo tháng / tuần đã phân bổ. Kỳ tháng gồm khoản đã chia tuần và khoản chưa phân bổ tuần.</li>
        <li>Tiền thực hiện: phiếu thu hợp lệ của các hợp đồng của căn (HĐMB / thuê / vay / hoàn thiện), trong khoảng ngày thực hiện và từ ngày lập kế hoạch, phân bổ lần lượt cho các khoản kế hoạch — mỗi phiếu chỉ tính 1 lần, không trùng giữa các hợp đồng.</li>
        <li>Hết tuần / tháng, căn chưa thu đủ tự chuyển phần còn thiếu sang kỳ kế tiếp (tuần → tuần sau, sang tháng mới thì cập nhật tháng; chỉ theo tháng → tháng sau), có liên kết với kỳ gốc.</li>
        <li>Kỳ cũ được chốt: giữ nguyên kế hoạch, thực thu và tỷ lệ lúc chốt; tiền thu ở kỳ sau không làm thay đổi báo cáo kỳ trước.</li>
        <li>Kế hoạch tháng = khoản gốc + khoản chuyển tiếp từ tháng trước — không cộng lặp phần chuyển tiếp giữa các tuần trong cùng tháng. Tỷ lệ = thực hiện ÷ kế hoạch; không có kế hoạch hiện «—».</li></ul></details>`; };
  // ---- biểu đồ theo chế độ đang chọn
  const chart = () => { const t0 = today(), sm = (xs, k) => xs.reduce((t, r) => t + (+r[k] || 0), 0);
    const stOf = (from, to, n) => !n ? ['none', 'Chưa có kế hoạch'] : to < t0 ? ['done', 'Đã chốt'] : from > t0 ? ['next', 'Chưa đến kỳ'] : ['run', 'Đang thực hiện'];
    let xs;
    if (s.by === 'tuan') { xs = MW(s.ym).map(w => { const rs = dm.rows.filter(r => r.week === w.n); return { k: String(w.n), l: `Tuần ${w.n}`, sub: `${dmy(w.from).slice(0, 5)}–${dmy(w.to).slice(0, 5)}`, plan: sm(rs, 'expected'), act: sm(rs, 'actual'),
        cin: sm(rs, 'carry_in'), cout: rs.filter(r => r.closed).reduce((t, r) => t + r.carry_amt, 0), st: stOf(w.from, w.to, rs.length) }; });
      const un = dm.rows.filter(r => !r.week); if (un.length) { const W = MW(s.ym); xs.push({ k: '0', l: 'Chưa phân bổ tuần', sub: 'chỉ theo tháng', plan: sm(un, 'expected'), act: sm(un, 'actual'), cin: sm(un, 'carry_in'), cout: 0, st: stOf(W[0].from, W[W.length - 1].to, 1) }); } }
    else xs = yr.map(m => { const W = MW(m.m);
      return { k: m.m, l: `Tháng ${m.m.slice(5)}/${m.m.slice(0, 4)}`, sub: '', plan: m.plan, act: m.act, cin: m.cin, cout: m.cout, st: stOf(`${m.m}-01`, W[W.length - 1].to, m.n) }; });
    const mx = Math.max(1, ...xs.map(x => Math.max(x.plan, x.act))), on = x => s.by === 'tuan' ? x.k === String(s.week) : x.k === s.ym;
    const bar = (v, c) => `<span class="hb-tr"><span class="hb-f" style="width:${(v / mx * 100).toFixed(2)}%;background:${c}"></span></span><span class="hb-v">${tr(v)}</span>`;
    const note = x => [x.cin ? `nhận chuyển tiếp ${tr(x.cin)}` : '', x.cout ? `chuyển tiếp ${tr(x.cout)}` : '', x.plan && x.act >= x.plan ? 'hoàn thành' : ''].filter(Boolean).join(' · ');
    cbox.innerHTML = `<div class="hb-top"><div class="hb-ttl">${ico('fa-chart-bar')} Kế hoạch và thực thu ${s.by === 'tuan' ? `theo tuần · Tháng ${s.ym.slice(5)}/${s.ym.slice(0, 4)}` : `theo tháng · Năm ${s.ym.slice(0, 4)}`}<span class="small muted"> · đơn vị: triệu đồng</span></div>
        <div class="hb-lg"><span><i style="background:#2E66C2"></i>Kế hoạch</span><span><i style="background:#E8833A"></i>Thực thu</span><span class="pw-st done">Đã chốt</span><span class="pw-st run">Đang thực hiện</span><span class="pw-st next">Chưa đến kỳ</span><span class="pw-st none">Chưa có kế hoạch</span></div></div>
      <div class="hb-list">${xs.map(x => x.st[0] === 'none' ? `<div class="hb-k none ${on(x) ? 'on' : ''}" data-hb="${x.k}"><span class="hb-t">${esc(x.l)}${x.sub ? ` <span class="muted">· ${esc(x.sub)}</span>` : ''}</span><span class="pw-st none">Chưa có kế hoạch</span></div>`
        : `<div class="hb-k ${on(x) ? 'on' : ''}" data-hb="${x.k}"><div class="hb-lb"><span class="hb-t">${esc(x.l)}</span>${x.sub ? `<span class="small muted">${esc(x.sub)}</span>` : ''}<span class="pw-st ${x.st[0]}">${x.st[1]}</span></div>
          <div class="hb-bars"><div class="hb-r">${bar(x.plan, '#2E66C2')}</div><div class="hb-r">${bar(x.act, '#E8833A')}</div></div><div class="hb-nt"><b>${pct(x.act, x.plan)}</b><span class="small muted">${esc(note(x))}</span></div></div>`).join('')}</div>
      <div class="hb-tip"></div>`;
    const tip = $('.hb-tip', cbox);
    cbox.onmousemove = e => { const k = e.target.closest('[data-hb]'); if (!k) { tip.style.display = 'none'; return; } const x = xs.find(y => y.k === k.dataset.hb), rc = cbox.getBoundingClientRect();
      tip.innerHTML = `<b>${esc(x.l)}</b>${x.sub ? ` <span class="muted">${esc(x.sub)}</span>` : ''} · ${x.st[1]}<br>Kế hoạch: <b>${fm(x.plan)}</b><br>Thực thu: <b>${fm(x.act)}</b><br>Tỷ lệ hoàn thành: <b>${pct(x.act, x.plan)}</b>${x.cin ? `<br>Nhận chuyển tiếp: ${fm(x.cin)}` : ''}${x.cout ? `<br>Đã chuyển tiếp: ${fm(x.cout)}` : ''}`;
      tip.style.display = 'block'; const tw = tip.offsetWidth; tip.style.left = Math.min(rc.width - tw - 8, Math.max(8, e.clientX - rc.left + 14)) + 'px'; tip.style.top = (e.clientY - rc.top + 14) + 'px'; };
    cbox.onmouseleave = () => { tip.style.display = 'none'; };
    cbox.onclick = run(async e => { const k = e.target.closest('[data-hb]'); if (!k) return; if (s.by === 'tuan') s.week = k.dataset.hb; else s.ym = k.dataset.hb; await load(); }); };
  // ---- chi tiết căn + điều chỉnh
  const detail = (uid, sc) => { const ps = d.rows.filter(r => keyOf(r) === uid && r.scope === sc); if (!ps.length) return;
    const moi = sc === 'moi', live = p => !['dong', 'thay_the', 'da_chot'].includes(p.status);
    const m = modal({ title: `Kế hoạch thu — ${esc(ps[0].unit || ps[0].title)} · ${moi ? 'Thu bán mới' : sc === 'thue' ? 'Thu cho thuê' : 'Thu nợ khách hàng'}`, wide: true, foot: '<button class="btn" data-x>Đóng</button>',
      body: (moi ? `<div class="small mb">${ico('fa-bullhorn')} <b>${esc(ps[0].title)}</b>${ps[0].units_n ? ` · dự kiến bán ${ps[0].units_n} căn` : ''} · ${ps[0].unit ? `đã liên kết căn <b>${esc(ps[0].unit)}</b>${ps[0].number ? ' · HĐ ' + esc(ps[0].number) : ''}` : '<span class="muted">chưa xác định căn / khách hàng</span>'}
          ${d.can_edit && ps.some(live) ? ` <button class="btn sm" data-prlink="${ps.find(live).id}">${ico('fa-link')} ${ps[0].unit ? 'Đổi liên kết' : 'Liên kết giao dịch bán'}</button>` : ''}</div>` : '')
        + ps.map(p => `<div class="card mb" style="padding:10px"><div class="toolbar" style="border:0;padding:0;gap:8px"><b>${esc(p.period_l)}</b><span class="small muted">${p.number ? 'HĐ ' + esc(p.number) + ' · ' : ''}${esc(p.customer || '—')} · phụ trách: ${esc(p.owner || '—')} · ${esc(p.st_l)}</span><span class="grow"></span>
          ${d.can_edit && !['dong', 'thay_the', 'da_chot'].includes(p.status) ? `<button class="btn sm" data-pradj="${p.id}">${ico('fa-pen')} Điều chỉnh kỳ / số tiền / người phụ trách</button><button class="btn sm" data-prsplit="${p.id}" title="Chia số tiền của khoản ra nhiều tuần trong tháng — tổng các tuần = số tiền của khoản">${ico('fa-calendar-week')} Phân bổ tuần</button>` : ''}</div>
        <div>Tiền kế hoạch <b>${fm(p.expected)}</b> · Tiền thực hiện <b>${fm(p.actual)}</b> · Tỷ lệ <b>${pct(p.actual, p.expected)}</b>${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}
          ${p.carry_from ? `<div class="small">${ico('fa-arrow-right-to-bracket')} Chuyển tiếp từ <b>${esc(p.carry_from)}</b></div>` : ''}
          ${p.closed ? `<div class="small">${ico('fa-lock')} Đã chốt kỳ ${dmy(p.closed_on)}: kế hoạch ${fm(p.expected)} · thực thu trong kỳ ${fm(p.act_snap)} · chưa thu ${fm(p.carry_amt)}${p.carry_amt ? ` · đã chuyển tiếp ${fm(p.carry_amt)} sang <b>${esc(p.carry_to)}</b>` : ' · đã thu đủ'}</div>` : ''}</div>
        <div class="sec-title">Phiếu thu thực hiện</div>${p.rc.length ? rowsTable([['on', 'Ngày thu', 'date'], ['no', 'Số phiếu'], ['number', 'Hợp đồng'], ['full', 'Số tiền phiếu', 'money'], ['amt', 'Tính cho khoản này', 'money']], p.rc, ['amt'], { no: 'STT', click: false }) : '<div class="small muted">Chưa có phiếu thu trong khoảng ngày thực hiện</div>'}
        ${p.hist.length ? `<div class="sec-title">Lịch sử lập / điều chỉnh / chuyển tiếp</div><ul class="small" style="margin:0;padding-left:18px">${p.hist.map(h => `<li>${dmyhm(h.at)} · ${esc(h.who || 'Hệ thống')} · ${esc(h.note || ({ tao: 'Lập kế hoạch', sua: 'Sửa kế hoạch', dieu_chinh: 'Điều chỉnh', phan_bo_tuan: 'Phân bổ tuần', sua_ky: 'Sửa kỳ', doi_lich: 'Chuyển lịch', bo_chon: 'Bỏ chọn', chot_ky: 'Chốt kỳ' })[h.action] || h.action)}</li>`).join('')}</ul>` : ''}</div>`).join('') });
    m.el.addEventListener('click', run(async e => { const l = e.target.closest('[data-prlink]'); if (l) { if (await linkDlg(+l.dataset.prlink)) m.close(); return; }
      const sp = e.target.closest('[data-prsplit]'); if (sp) { if (await splitDlg(ps.find(x => x.id === +sp.dataset.prsplit))) m.close(); return; }
      const b = e.target.closest('[data-pradj]'); if (!b) return; const p = ps.find(x => x.id === +b.dataset.pradj); if (await adjust(p)) m.close(); })); };
  // 17/11/2026: PHÂN BỔ TUẦN — chia khoản kế hoạch của tháng ra nhiều tuần (tổng = số tiền khoản; chưa chọn tuần nào = giữ nguyên)
  const splitDlg = p => new Promise(res => { const W = MW(p.month), amt = p.expected;
    const m = modal({ title: `${ico('fa-calendar-week')} Phân bổ tuần — ${esc(p.unit || p.title || '')} · tháng ${p.month.slice(5)}/${p.month.slice(0, 4)}`, narrow: true, onClose: () => res(false),
      body: `<div class="small muted mb">Số tiền kế hoạch của khoản: <b>${fm(amt)}</b> đ · hiện ở ${esc(p.period_l)}. Nhập số tiền từng tuần — tổng phải bằng số tiền của khoản.</div>
        ${W.map(w => `<div class="sp-w" style="display:grid;grid-template-columns:1fr 170px;gap:8px;align-items:center;margin:4px 0"><span>Tuần ${w.n} <span class="small muted">(${dmy(w.from).slice(0, 5)} – ${dmy(w.to).slice(0, 5)})</span></span>
          <input class="inp" data-sw="${w.n}" inputmode="numeric" autocomplete="off" style="text-align:right" value="${w.n === p.week ? moneyStr(amt) : ''}" placeholder="0"></div>`).join('')}
        <div class="small mt" id="swSum"></div>`,
      foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="swOk">${ico('fa-check')} Lưu phân bổ</button>` });
    const sumW = () => { const t = $$('[data-sw]', m.el).reduce((a, i) => a + (num(i.value, true) || 0), 0); $('#swSum', m.el).innerHTML = `Tổng các tuần: <b>${fm(t)}</b> / ${fm(amt)} ${t === amt ? '<span class="pos">✓ khớp</span>' : `<span class="neg">— ${t > amt ? 'thừa' : 'còn thiếu'} ${fm(Math.abs(amt - t))}</span>`}`; };
    $$('[data-sw]', m.el).forEach(i => { i.oninput = e => { const v = num(e.target.value, true); if (v != null && !isNaN(v)) e.target.value = moneyStr(v); sumW(); }; }); sumW();
    $('#swOk', m.el).onclick = run(async () => { const r = await api('POST', `/api/collect-plans/${p.id}/split-weeks`, { weeks: $$('[data-sw]', m.el).map(i => ({ n: +i.dataset.sw, amount: num(i.value, true) || 0 })).filter(x => x.amount > 0) });
      toast(r.msg); m.el.remove(); await load(); res(true); }); });
  // liên kết dòng thu bán mới với giao dịch thực tế (căn bắt buộc, số HĐ không bắt buộc) — thực thu tự cập nhật từ phiếu thu hợp lệ của căn / HĐ
  const linkDlg = id => new Promise(res => { const m = modal({ title: `${ico('fa-link')} Liên kết giao dịch bán mới`, narrow: true, onClose: () => res(false),
      body: `<div class="fld"><label>Mã căn<span class="req">*</span></label><input class="inp" id="lkU" placeholder="VD: CTS-K-105" autocomplete="off"></div>
        <div class="fld"><label>Số hợp đồng <span class="small muted">(không bắt buộc — có thì khách hàng lấy theo HĐ)</span></label><input class="inp" id="lkC" autocomplete="off"></div>
        <div class="small muted">Áp dụng cho mọi tuần còn hiệu lực của dòng kế hoạch. Thực thu = phiếu thu hợp lệ của căn / HĐ, mỗi phiếu chỉ tính 1 lần (không tính trùng sang thu nợ khách hàng).</div>`,
      foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="lkOk">${ico('fa-check')} Liên kết</button>` });
    $('#lkOk', m.el).onclick = run(async () => { const u = $('#lkU', m.el).value.trim(); if (!u) return toast('Nhập mã căn', true);
      const r = await api('POST', `/api/collect-plans/${id}/link`, { unit_code: u, contract_number: $('#lkC', m.el).value.trim() }); toast(r.msg); m.el.remove(); await load(); res(true); }); });
  // 17/11/2026 (bản nhiều dòng): TẠO DÒNG THU BÁN MỚI — bảng Dự án · Tòa · Số căn dự kiến bán · Đơn giá bình quân · Tỷ lệ dự kiến thu (%) · Tổng dự kiến thu
  // (= số căn × đơn giá × tỷ lệ, tự tính, sửa được theo số thực tế); thêm / xóa dòng; tòa lọc theo dự án; cuối bảng cộng tổng số căn + tổng dự kiến thu; phân bổ tuần = tổng tháng
  const saleDlg = () => { const ym0 = s.ym, months = [...new Set([...Array.from({ length: 15 }, (_, i) => { const x = new Date(Date.UTC(+today().slice(0, 4), +today().slice(5, 7) - 3 + i, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; }), ym0])].sort();
    const wk = ym => MW(ym).map(w => `<div class="sp-w"><span>Tuần ${w.n} <span class="small muted">(${dmy(w.from).slice(0, 5)} – ${dmy(w.to).slice(0, 5)})</span><span class="small sp-ty" data-spty="${w.n}"></span></span><input class="inp" data-spw="${w.n}" inputmode="numeric" autocomplete="off" placeholder="0 đồng"></div>`).join('');
    const pOpts = sel => `<option value="">— Chọn dự án —</option>` + M.projects.map(p => `<option value="${p.id}" ${+sel === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('');
    const bOpts = (pid, sel) => `<option value="">— Tất cả / chưa xác định —</option>` + M.buildings.filter(b => b.project_id === +pid).map(b => `<option value="${b.id}" ${+sel === b.id ? 'selected' : ''}>Tòa ${esc(b.code)}</option>`).join('');
    const row = (pid = s.project || '', bid = '') => `<tr class="sp-r"><td><select class="inp" data-k="p">${pOpts(pid)}</select></td><td><select class="inp" data-k="b">${bOpts(pid, bid)}</select></td>
      <td><input class="inp n" data-k="u" inputmode="numeric" autocomplete="off"></td><td><input class="inp n" data-k="price" inputmode="numeric" autocomplete="off"></td><td><input class="inp n" data-k="rate" inputmode="decimal" autocomplete="off" value="100"></td>
      <td><input class="inp n" data-k="amt" inputmode="numeric" autocomplete="off" title="Tự tính = số căn × đơn giá × tỷ lệ; sửa được theo số tiền thực tế dự kiến thu"></td><td><button type="button" class="btn sm ghost" data-del title="Xóa dòng">${ico('fa-trash')}</button></td></tr>`;
    const m = modal({ title: `${ico('fa-bullhorn')} Tạo dòng thu bán mới`, wide: true,
      body: `<style>.sp-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:4px 14px}.sp-w{display:grid;grid-template-columns:1fr 160px;gap:8px;align-items:center;margin:4px 0}.sp-ty{display:block;color:var(--cobalt);font-weight:600}.sp-w .inp,.sp-t .n{text-align:right}
        .sp-t{width:100%;border-collapse:collapse}.sp-t th{font-size:12.5px;text-align:left;padding:4px 6px;white-space:nowrap}.sp-t th.n{text-align:right}.sp-t td{padding:3px 4px}.sp-t .inp{height:34px;width:100%;min-width:0}
        .sp-t tfoot td{font-weight:700;background:#eaf1fb;padding:7px 8px}.sp-t tfoot .n{text-align:right}</style>
        <div class="sp-g"><div class="fld"><label>Tháng / năm kế hoạch<span class="req">*</span></label><select class="inp" id="spM">${months.map(x => `<option value="${x}" ${x === ym0 ? 'selected' : ''}>Tháng ${x.slice(5)}/${x.slice(0, 4)}</option>`).join('')}</select></div>
          <div class="fld"><label>Nội dung kế hoạch</label><input class="inp" id="spT" placeholder="VD: Mở bán đợt 3 — thu cọc + đợt 1" autocomplete="off"></div>
          <div class="fld"><label>Người phụ trách</label><select class="inp" id="spO"><option value="">—</option>${d.users.map(([i, n]) => `<option value="${i}" ${i === M.me?.id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div></div>
        <div class="sec-title">Kế hoạch theo dự án / tòa</div>
        <div style="overflow-x:auto"><table class="sp-t"><colgroup><col style="width:24%"><col style="width:15%"><col style="width:10%"><col style="width:17%"><col style="width:9%"><col style="width:20%"><col style="width:44px"></colgroup>
          <thead><tr><th>Dự án<span class="req">*</span></th><th>Tòa</th><th class="n">Số căn dự kiến bán</th><th class="n">Đơn giá bình quân (đồng/căn)</th><th class="n">Tỷ lệ dự kiến thu (%)</th><th class="n">Tổng dự kiến thu<span class="req">*</span></th><th></th></tr></thead>
          <tbody id="spL">${row()}</tbody><tfoot><tr><td colspan="2">Tổng cộng · <span id="spNL">1</span> dòng</td><td class="n" id="spTU">0</td><td></td><td></td><td class="n" id="spTA">0</td><td></td></tr></tfoot></table></div>
        <button type="button" class="btn sm mt" id="spAdd">${ico('fa-plus')} Thêm dòng</button>
        <div class="small muted mt">Tổng dự kiến thu = Số căn × Đơn giá bình quân × Tỷ lệ dự kiến thu (đơn giá là giá bán cả căn → tỷ lệ là phần dự kiến thu được trong tháng, VD 30% cọc + đợt 1). Có thể sửa trực tiếp theo số tiền thực tế dự kiến thu.</div>
        <div class="sec-title">Phân bổ tuần dự kiến thu <span class="small muted">(nhập số tiền theo <b>đồng</b>, VD 3 tỷ = 3.000.000.000 · không bắt buộc — để trống tất cả = «Chưa phân bổ tuần», không tự chia đều)</span></div>
        <div id="spWs" class="sp-g"></div><div class="small mt" id="spSum"></div>
        <div class="fld mt"><label>Ghi chú</label><textarea id="spR" rows="2"></textarea></div>
        <div class="small muted">Không cần chọn căn / khách hàng khi chưa có giao dịch cụ thể — liên kết sau ở báo cáo (bấm dòng → «Liên kết giao dịch bán»). Phân bổ tuần chia cho từng dòng theo tỷ trọng tổng dự kiến thu.</div>`,
      foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="spOk">${ico('fa-check')} Lưu dòng thu bán mới</button>` });
    const L = () => $$('#spL tr', m.el), V = (tr, k) => $(`[data-k="${k}"]`, tr), nv = (el, money) => num(el.value, money) || 0;
    const total = () => L().reduce((t, tr) => t + nv(V(tr, 'amt'), true), 0);
    const sumAll = () => { $('#spNL', m.el).textContent = L().length; $('#spTU', m.el).textContent = fm(L().reduce((t, tr) => t + nv(V(tr, 'u')), 0)); $('#spTA', m.el).textContent = fm(total());
      const ws = $$('[data-spw]', m.el).map(i => num(i.value, true) || 0), w = ws.reduce((a, b) => a + b, 0), a = total();
      $$('[data-spw]', m.el).forEach(i => { const x = $(`[data-spty="${i.dataset.spw}"]`, m.el); if (x) x.textContent = (num(i.value, true) || 0) ? ' = ' + tyL(num(i.value, true)) : ''; });
      $('#spSum', m.el).innerHTML = w ? `Tổng phân bổ tuần: <b>${fm(w)}</b> đ (${tyL(w)}) / tổng kế hoạch tháng <b>${fm(a)}</b> đ (${tyL(a)}) ${w === a ? '<span class="pos">✓ khớp</span>' : `<span class="neg">— ${w > a ? 'thừa' : 'còn thiếu'} ${fm(Math.abs(a - w))} đ (${tyL(Math.abs(a - w))})</span>`}` : '<span class="muted">Chưa phân bổ tuần</span>'; };
    // định dạng số tiền khi gõ, giữ nguyên vị trí con trỏ (đếm số chữ số trước con trỏ) — sửa giữa số không bị nhảy về cuối
    const mfmt = el => { const pos = el.selectionStart ?? el.value.length, nd = el.value.slice(0, pos).replace(/\D/g, '').length, v = num(el.value, true); if (v == null || isNaN(v)) return;
      el.value = moneyStr(v); let i = 0, c = 0; while (i < el.value.length && c < nd) { if (/\d/.test(el.value[i])) c++; i++; } if (document.activeElement === el) el.setSelectionRange(i, i); };
    const tyL = v => v >= 1e9 ? (Math.round(v / 1e7) / 100).toLocaleString('vi-VN') + ' tỷ' : v >= 1e6 ? (Math.round(v / 1e4) / 100).toLocaleString('vi-VN') + ' triệu' : v ? fm(v) + ' đ' : '';
    const calc = tr => { const u = nv(V(tr, 'u')), p = nv(V(tr, 'price'), true), r = V(tr, 'rate').value === '' ? 100 : nv(V(tr, 'rate')); if (u && p) V(tr, 'amt').value = moneyStr(Math.round(u * p * r / 100)); };
    $('#spL', m.el).addEventListener('input', e => { const tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr) return;
      if (k === 'price' || k === 'amt') mfmt(e.target); if (k === 'u' || k === 'price' || k === 'rate') calc(tr); sumAll(); });
    $('#spL', m.el).addEventListener('change', e => { if (e.target.dataset.k === 'p') { const tr = e.target.closest('tr'); V(tr, 'b').innerHTML = bOpts(e.target.value, ''); } });
    $('#spL', m.el).addEventListener('click', e => { if (!e.target.closest('[data-del]')) return; if (L().length === 1) return toast('Cần ít nhất 1 dòng', true); e.target.closest('tr').remove(); sumAll(); });
    $('#spAdd', m.el).onclick = () => { $('#spL', m.el).insertAdjacentHTML('beforeend', row()); sumAll(); };
    const wDraw = () => { $('#spWs', m.el).innerHTML = wk($('#spM', m.el).value); $$('[data-spw]', m.el).forEach(i => { i.oninput = e => { mfmt(e.target); sumAll(); }; }); sumAll(); };
    wDraw(); $('#spM', m.el).onchange = wDraw;
    $('#spOk', m.el).onclick = run(async () => {
      const lines = L().map(tr => ({ project_id: V(tr, 'p').value, building_id: V(tr, 'b').value || null, units_n: nv(V(tr, 'u')) || null, unit_price: nv(V(tr, 'price'), true) || null, rate: V(tr, 'rate').value === '' ? null : nv(V(tr, 'rate')), amount: nv(V(tr, 'amt'), true) }));
      const r = await api('POST', '/api/sale-plan', { month: $('#spM', m.el).value, title: $('#spT', m.el).value.trim(), owner_id: $('#spO', m.el).value || null, note: $('#spR', m.el).value.trim(), lines,
        weeks: $$('[data-spw]', m.el).map(i => ({ n: +i.dataset.spw, amount: num(i.value, true) || 0 })).filter(x => x.amount > 0) });
      toast(r.msg); s.ym = $('#spM', m.el).value; m.close(); await load(); }); };
  const adjust = p => new Promise(res => { const ym0 = p.month, months = [...new Set([...Array.from({ length: 18 }, (_, i) => { const x = new Date(Date.UTC(+today().slice(0, 4), +today().slice(5, 7) - 4 + i, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; }), ym0])].sort();
    const wo = (ym, sel) => `<option value="0">— Chưa phân bổ tuần —</option>` + MW(ym).map(w => `<option value="${w.n}" ${+sel === w.n ? 'selected' : ''}>Tuần ${w.n} (${dmy(w.from)} – ${dmy(w.to)})</option>`).join('');
    const m = modal({ title: `Điều chỉnh kế hoạch thu — ${esc(p.unit)}`, narrow: true, onClose: () => res(false),
      body: `<div class="fld"><label>Tháng / năm<span class="req">*</span></label><select class="inp" id="paM">${months.map(x => `<option value="${x}" ${x === ym0 ? 'selected' : ''}>Tháng ${x.slice(5)}/${x.slice(0, 4)}</option>`).join('')}</select></div>
        <div class="fld"><label>Tuần trong tháng <span class="small muted">(không bắt buộc)</span></label><select class="inp" id="paW">${wo(ym0, p.week)}</select></div>
        <div class="fld"><label>Tiền kế hoạch<span class="req">*</span></label><input class="inp" id="paA" inputmode="numeric" autocomplete="off" value="${moneyStr(p.expected)}"></div>
        <div class="fld"><label>Người phụ trách</label><select class="inp" id="paO"><option value="">—</option>${d.users.map(([i, n]) => `<option value="${i}" ${i === p.owner_id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="fld"><label>Lý do điều chỉnh</label><textarea id="paR" rows="2"></textarea></div><div class="small muted">Mọi điều chỉnh được lưu lịch sử (giá trị cũ → mới, người sửa, thời điểm, lý do).</div>`,
      foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="paOk">${ico('fa-check')} Lưu điều chỉnh</button>` });
    $('#paM', m.el).onchange = e => { $('#paW', m.el).innerHTML = wo(e.target.value, 0); };
    $('#paA', m.el).oninput = e => { const v = num(e.target.value, true); if (v != null && !isNaN(v)) e.target.value = moneyStr(v); };
    $('#paOk', m.el).onclick = run(async () => { const a = num($('#paA', m.el).value, true); if (!(a > 0)) return toast('Nhập tiền kế hoạch > 0', true);
      const r = await api('POST', `/api/collect-plans/${p.id}/adjust`, { month: $('#paM', m.el).value, week: +$('#paW', m.el).value, amount: a, owner_id: $('#paO', m.el).value || null, reason: $('#paR', m.el).value.trim() });
      toast(r.msg); m.el.remove(); await load(); res(true); }); });
  // ---- xuất Excel / in
  const XC = [['b', 'Tòa', 'text', 14], ['unit', 'Căn hộ', 'text', 16], ['cust', 'Tên khách hàng', 'text', 32], ['plan', 'Tiền kế hoạch', 'money'], ['act', 'Tiền thực hiện', 'money'], ['pct', 'Tỷ lệ hoàn thành', 'text', 16]];
  const xrows = () => flat().map(r => ({ ...r, pct: pct(r.act, r.plan), _b: r.lv !== 3 ? 1 : 0 }));
  const xnote = () => `${period()} · ${done()} · ${scope()} · Đơn vị: đồng`;
  const printIt = () => { const w = window.open('', '_blank'); if (!w) return toast('Trình duyệt chặn cửa sổ in', true); const t = today();
    w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Chi tiết thực hiện kế hoạch thu</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#000}h2{text-align:center;margin:0;font-size:16px}.c{text-align:center;margin:3px 0}
      table{border-collapse:collapse;width:100%;margin-top:8px}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{border:1px solid #777;padding:4px 6px}th{background:#e8eef7}td.n{text-align:right;white-space:nowrap}
      tr.g td{font-weight:bold;background:#eaf1fb}tr.p td{font-weight:bold;background:#f2f6fc}tr.b td{font-weight:bold;background:#f3f4f6}tr.t td{font-weight:bold;background:#1e4e8c;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .sg{display:flex;justify-content:space-around;margin-top:18px;text-align:center;page-break-inside:avoid}.sg div{width:40%}.sg i{display:block;font-style:italic;margin-bottom:60px}.dt{text-align:right;margin-top:14px;font-style:italic}</style></head><body>
      <h2>CHI TIẾT THỰC HIỆN KẾ HOẠCH THU</h2><div class="c">${esc(period())}</div><div class="c">${esc(done())} · ${esc(scope())} · Đơn vị: đồng</div>
      <table><thead><tr>${XC.map(c => `<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>
      ${xrows().map(r => r._b ? `<tr class="${r.lv === 0 ? 'g' : r.lv === 1 ? 'p' : r.lv === 2 ? 'b' : 't'}"><td colspan="3">${esc(r.b)}</td><td class="n">${fm(r.plan)}</td><td class="n">${fm(r.act)}</td><td class="n">${r.pct}</td></tr>` : `<tr><td>${esc(r.b)}</td><td>${esc(r.unit)}</td><td>${esc(r.cust)}</td><td class="n">${fm(r.plan)}</td><td class="n">${fm(r.act)}</td><td class="n">${r.pct}</td></tr>`).join('')}
      </tbody></table><div class="dt">Ngày lập: ngày ${+t.slice(8)} tháng ${+t.slice(5, 7)} năm ${t.slice(0, 4)}</div>
      <div class="sg"><div><b>NGƯỜI LẬP</b><i>(Ký, ghi rõ họ tên)</i></div><div><b>TRƯỞNG BỘ PHẬN</b><i>(Ký, ghi rõ họ tên)</i></div></div><script>setTimeout(() => print(), 300)</` + `script></body></html>`); w.document.close(); };
  // ---- sự kiện
  main.addEventListener('click', run(async e => {
    const by = e.target.closest('[data-prby]'); if (by) { s.by = by.dataset.prby; s.week = ''; return load(); }
    const tg = e.target.closest('[data-prtg]'); if (tg) { const k = tg.dataset.prtg; s.shut[k] = !s.shut[k]; return draw(); }
    const u = e.target.closest('[data-pru]'); if (u) { e.preventDefault(); return detail(u.dataset.pru, u.dataset.prsc); }
    if (e.target.closest('#prNew')) return openForm('collect_plan', { onSaved: () => load() });
    if (e.target.closest('#prSale')) { const m = modal({ title: `${ico('fa-bullhorn')} Tạo dòng thu bán mới`, narrow: true, body: `<div style="display:grid;gap:10px">
        <button type="button" class="btn pri" data-sk="u" style="justify-content:flex-start;padding:12px 14px;height:auto;text-align:left">${ico('fa-door-open')} <span><b>Theo căn hộ</b><br><small>Chọn căn từ danh mục sản phẩm, giá trị dự kiến bán, tháng bán, lịch thu theo % từng tháng</small></span></button>
        <button type="button" class="btn" data-sk="p" style="justify-content:flex-start;padding:12px 14px;height:auto;text-align:left">${ico('fa-building')} <span><b>Theo dự án / tòa (ước tính)</b><br><small>Số căn dự kiến × đơn giá bình quân × tỷ lệ thu, phân bổ tuần trong tháng</small></span></button></div>` });
      m.el.addEventListener('click', ev => { const b = ev.target.closest('[data-sk]'); if (!b) return; m.close(); if (b.dataset.sk === 'u') saleUnitDlg(load, { project: s.project }); else saleDlg(); }); return; }
    if (e.target.closest('#prX')) return download('/api/export-rows', { file: 'Chi_tiet_thuc_hien_ke_hoach_thu', title: 'CHI TIẾT THỰC HIỆN KẾ HOẠCH THU', sheets: [{ name: 'Chi tiết thực hiện KH thu', title: 'CHI TIẾT THỰC HIỆN KẾ HOẠCH THU', note: xnote(), cols: XC, rows: xrows(), noNo: 1 }] });
    if (e.target.closest('#prPr')) return printIt(); }));
  main.addEventListener('change', run(async e => { const t = e.target;
    if (t.id === 'prY' || t.id === 'prM') { s.ym = `${$('#prY', main).value}-${String($('#prM', main).value).padStart(2, '0')}`; s.week = ''; return load(); }
    if (t.id === 'prW') { s.week = t.value; return load(); } if (t.id === 'prP') { s.project = t.value; s.building = ''; return load(); } if (t.id === 'prB') { s.building = t.value; return load(); } }));
  main.addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (v === null) return; if (e.target.id === 'prFr') s.from = v; else s.to = v || today(); await load(); }));
  try { await load(); } catch (er) { box.innerHTML = `<div class="empty">${esc(er.message)}</div>`; }
};
// 18/11/2026 (bản 4 — bảng nhập trực tiếp theo mẫu): TẠO KẾ HOẠCH THU BÁN MỚI — 1 bảng, tiêu đề 2 hàng: Dự án · Tòa · Căn · Diện tích · Đơn giá · Thành tiền · Tháng dự kiến bán · [Phân bổ dòng thu: Đợt 1…n] · Chưa phân bổ kỳ;
// chọn Dự án → Tòa → Căn ngay trên dòng (lọc theo lựa chọn trước, chọn nhiều căn → mỗi căn 1 dòng, chặn trùng); Thành tiền = «Giá trị HĐ» danh mục sản phẩm (không tính lại);
// mỗi ô đợt: Ngày dự kiến thu · Tỷ lệ % · Số tiền (nhập 1 trong 2, tự tính phần kia theo Thành tiền); không tự chia / dồn phần còn lại; tổng ≤ Thành tiền; khoản chưa có ngày / chưa phân bổ → «Chưa phân bổ kỳ»;
// lịch thu riêng từng căn, không theo chính sách bán hàng; lưu → tổng hợp vào tháng / tuần theo ngày thu
const saleUnitDlg = (onDone, preset = {}) => {
  const ymAdd = (ym, k) => { const [y, m] = ym.split('-').map(Number), x = new Date(Date.UTC(y, m - 1 + k, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };
  const T0 = today().slice(0, 7), months = Array.from({ length: 48 }, (_, i) => ymAdd(T0, i - 2));
  const mOpt = sel => months.map(x => `<option value="${x}" ${x === sel ? 'selected' : ''}>${x.slice(5)}/${x.slice(0, 4)}</option>`).join('');
  const moOpt = sel => '<option value="">— Chọn tháng —</option>' + months.map(x => `<option value="${x}" ${x === sel ? 'selected' : ''}>${x.slice(5)}/${x.slice(0, 4)}</option>`).join('');
  const pS = v => String(Math.round(v * 100) / 100).replace('.', ','), p4 = v => Math.round(v * 1e4) / 1e4;
  const AV = {}, getAv = async pid => AV[pid] ||= (await api('GET', '/api/sale-units?project=' + pid)).units;
  let rows = [], seq = 0, NC = 4;
  const newRow = (o = {}) => ({ id: ++seq, project: o.project ?? (preset.project || ''), building: o.building || '', unit: null, sale: o.sale || T0, items: [] });
  rows.push(newRow());
  const m = modal({ title: `${ico('fa-bullhorn')} Tạo kế hoạch thu bán mới`, wide: true,
    body: `<div class="sg"><div class="sg-hint">Chọn nhiều căn theo tòa (hoặc Dự án → Tòa → Căn trên từng dòng), chọn tháng dự kiến bán và nhập phân bổ dòng thu từng đợt; lập lịch cho 1 căn mẫu rồi tích các căn khác để áp dụng nhanh (tháng thu · tỷ lệ hoặc số tiền). Thành tiền lấy theo «Giá trị HĐ» trong Danh mục sản phẩm; lịch thu riêng từng căn, không theo chính sách bán hàng.</div>
      <div class="sg-pick"><b>${ico('fa-list-check')} Chọn căn theo tòa</b><select class="inp" id="pkP"><option value="">— Dự án —</option>${M.projects.map(p => `<option value="${p.id}" ${+preset.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select><select class="inp" id="pkB"><option value="">Tất cả tòa</option></select>
        <button type="button" class="btn sm pri" id="pkOpen">${ico('fa-caret-down')} Danh sách căn đủ điều kiện bán</button><span class="grow"></span><span class="small muted">Hoặc chọn Dự án → Tòa → Căn ngay trên từng dòng</span></div>
      <div class="sg-plist" id="pkPanel" hidden><div class="sg-plh"><input class="inp" id="pkQ" placeholder="Tìm mã căn…" autocomplete="off"><button type="button" class="btn sm" id="pkAll">Chọn tất cả</button><button type="button" class="btn sm" id="pkNone">Bỏ chọn tất cả</button><span class="grow"></span><b id="pkN"></b></div>
        <div class="sg-plb" id="pkL"></div><div class="sg-plf"><button type="button" class="btn sm" id="pkClose">Đóng</button><button type="button" class="btn sm" id="pkGo">${ico('fa-check')} Đưa các căn đã chọn vào bảng</button><button type="button" class="btn sm pri" id="pkGo2">${ico('fa-calendar-days')} Đưa vào bảng & thiết lập tháng bán, lịch thu</button></div></div>
      <div class="sg-apply" id="sgAp" hidden><b id="sgApN"></b><button type="button" class="btn sm pri" id="sgSet">${ico('fa-calendar-days')} Thiết lập tháng bán & lịch thu</button><span class="sg-sep"></span><label>Căn mẫu <select class="inp" id="sgTpl"></select></label><label class="sg-ck"><input type="checkbox" id="sgApS"> Áp dụng kèm tháng dự kiến bán</label>
        <button type="button" class="btn sm pri" id="sgApGo">${ico('fa-copy')} Áp dụng lịch thu cho các căn đã tích chọn</button><button type="button" class="btn sm ghost" id="sgApX">Bỏ chọn</button></div>
      <div class="sg-wrap"><table class="sg-t" id="sgT"></table></div>
      <div class="sg-bar"><button type="button" class="btn sm" id="sgAddR">${ico('fa-plus')} Thêm dòng</button><button type="button" class="btn sm" id="sgAddC">${ico('fa-plus')} Thêm đợt</button><span class="grow"></span><span class="small muted">Khoản chưa chọn tháng thu hoặc chưa lập đợt được theo dõi tại «Chưa phân bổ kỳ», không tự gán tháng.</span></div>
      <div class="sg-sum" id="sgSum"></div>
      <div class="su3-g"><div class="fld"><label>Người phụ trách</label><select class="inp" id="suO"><option value="">—</option></select></div><div class="fld"><label>Ghi chú</label><input class="inp" id="suR" autocomplete="off"></div></div></div>`,
    foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="suSave">${ico('fa-check')} Lưu kế hoạch</button>`, onClose: () => document.querySelector('.sg-pop')?.remove() });
  m.el.querySelector('.modal').classList.add('sg-modal');
  api('GET', '/api/plan-report?by=thang&ym=' + T0).then(r => { $('#suO', m.el).innerHTML = '<option value="">—</option>' + r.users.map(([i, n]) => `<option value="${i}" ${i === M.me?.id ? 'selected' : ''}>${esc(n)}</option>`).join(''); }).catch(() => {});
  const R = id => rows.find(r => r.id === +id), it = (r, k) => r.items[k] ||= { month: '', pct: null, amount: 0, by: 'pct' };
  const val = r => r.unit?.hd_value || 0, tot = r => r.items.reduce((a, z) => a + (z?.amount || 0), 0), dated = r => r.items.reduce((a, z) => a + (z?.month ? z.amount || 0 : 0), 0);   // đã phân bổ theo tháng
  const unal = r => r.unit ? Math.max(0, val(r) - dated(r)) : 0;
  const used = (except) => new Set(rows.filter(r => r.unit && r.id !== except).map(r => r.unit.id));
  const unitOpts = (r) => { const xs = (AV[r.project] || []).filter(u => (u.ok || u.id === r.unit?.id) && (!r.building || u.building_id === +r.building)), us = used(r.id);
    return `<option value="">${AV[r.project] ? `— Chọn căn (${xs.filter(u => !us.has(u.id)).length}) —` : 'Đang tải…'}</option>` + xs.map(u => `<option value="${u.id}" ${u.id === r.unit?.id ? 'selected' : ''} ${us.has(u.id) ? 'disabled' : ''}>${esc(u.code)}${u.rent ? ' · đang cho thuê' : ''}${us.has(u.id) ? ' · đã có dòng' : ''}${!u.hd_value ? ' · chưa có giá trị HĐ' : ''}</option>`).join(''); };
  const cellH = (r, k) => { const z = r.items[k] || {}, dis = r.unit && val(r) ? '' : 'disabled';
    return `<td class="sg-d" data-k="${k}"><div class="sg-dc"><select class="inp" data-f="month" title="Tháng/năm dự kiến thu" ${dis}>${moOpt(z.month)}</select><div class="sg-pa"><input class="inp n" data-f="pct" inputmode="decimal" placeholder="Tỷ lệ" value="${z.pct != null ? pS(z.pct) : ''}" ${dis}><span>%</span></div><input class="inp n" data-f="amt" inputmode="numeric" placeholder="Số tiền" value="${z.amount ? moneyStr(z.amount) : ''}" ${dis}>${z.content ? `<div class="sg-ct" title="${esc(z.content)}">${esc(z.content.split('\n')[0])}</div>` : ''}</div></td>`; };
  const pctT = r => r.items.reduce((a, z) => a + (+z?.pct || 0), 0), isOver = r => !!r.unit && (tot(r) > val(r) || pctT(r) > 100.0001);
  const rowH = r => { const over = isOver(r);
    return `<tr data-r="${r.id}" class="${over ? 'sg-over' : ''} ${r.pick ? 'sg-pk' : ''}"><td class="sg-s s0 c"><input type="checkbox" data-f="pick" ${r.pick ? 'checked' : ''} ${r.unit ? '' : 'disabled'}></td><td class="sg-s s1"><select class="inp" data-f="project"><option value="">— Dự án —</option>${M.projects.map(p => `<option value="${p.id}" ${+r.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select></td>
      <td class="sg-s s2"><select class="inp" data-f="building" ${r.project ? '' : 'disabled'}><option value="">Tất cả tòa</option>${M.buildings.filter(b => b.project_id === +r.project).map(b => `<option value="${b.id}" ${+r.building === b.id ? 'selected' : ''}>Tòa ${esc(b.code)}</option>`).join('')}</select></td>
      <td class="sg-s s3"><div class="sg-u"><select class="inp" data-f="unit" ${r.project ? '' : 'disabled'}>${r.project ? unitOpts(r) : '<option>Chọn dự án trước</option>'}</select><button type="button" class="btn sm ghost" data-f="multi" title="Chọn nhiều căn — mỗi căn 1 dòng" ${r.project ? '' : 'disabled'}>${ico('fa-list-check')}</button></div>${r.unit?.rent ? '<span class="su3-tag">Đang cho thuê</span>' : ''}${r.unit && !val(r) ? '<div class="su3-warn">Chưa có giá trị HĐ trong danh mục</div>' : ''}</td>
      <td class="n">${r.unit?.area != null ? String(r.unit.area).replace('.', ',') : ''}</td><td class="n">${r.unit?.uprice ? fm(r.unit.uprice) : r.unit ? '—' : ''}</td><td class="n"><b>${val(r) ? fm(val(r)) : ''}</b></td>
      <td><select class="inp" data-f="sale" ${r.unit ? '' : 'disabled'}>${mOpt(r.sale)}</select></td>
      ${Array.from({ length: NC }, (_, k) => cellH(r, k)).join('')}
      <td class="n sg-un" data-un>${r.unit ? (over ? overL(r) : fm(unal(r))) : ''}</td><td class="c"><button type="button" class="btn sm ghost" data-f="del" title="Xóa dòng">${ico('fa-trash')}</button></td></tr>`; };
  const footH = () => { const us = rows.filter(r => r.unit), tv = us.reduce((a, r) => a + val(r), 0), col = k => us.reduce((a, r) => a + (r.items[k]?.amount || 0), 0), dd = us.reduce((a, r) => a + dated(r), 0);
    return `<tr><td class="sg-s s0"></td><td class="sg-s s1" colspan="1">Tổng cộng</td><td class="sg-s s2"></td><td class="sg-s s3">${us.length} căn</td><td></td><td></td><td class="n">${fm(tv)}</td><td></td>${Array.from({ length: NC }, (_, k) => `<td class="n sg-d">${fm(col(k))}</td>`).join('')}<td class="n">${fm(us.reduce((a, r) => a + unal(r), 0))}</td><td></td></tr>`; };
  const sumH = () => { const us = rows.filter(r => r.unit), tv = us.reduce((a, r) => a + val(r), 0), dd = us.reduce((a, r) => a + dated(r), 0), ta = us.reduce((a, r) => a + tot(r), 0);
    $('#sgSum', m.el).innerHTML = [['Số căn', us.length], ['Thành tiền', fm(tv)], ['Tổng tiền các đợt', fm(ta)], ['Đã phân bổ theo tháng', fm(dd)], ['Chưa phân bổ kỳ', fm(us.reduce((a, r) => a + unal(r), 0))]].map(([l, v], i) => `<div class="${i === 4 && v !== '0' ? 'w' : ''}"><span>${l}</span><b>${v}</b></div>`).join(''); };
  const draw = () => { $('#sgT', m.el).innerHTML = `<colgroup><col style="width:36px"><col style="width:180px"><col style="width:110px"><col style="width:190px"><col style="width:80px"><col style="width:110px"><col style="width:130px"><col style="width:110px">${'<col style="width:168px">'.repeat(NC)}<col style="width:130px"><col style="width:46px"></colgroup>
      <thead><tr><th rowspan="2" class="sg-s s0 c"><input type="checkbox" id="sgAll" title="Chọn tất cả" ${rows.some(r => r.unit) && rows.filter(r => r.unit).every(r => r.pick) ? 'checked' : ''}></th><th rowspan="2" class="sg-s s1">Dự án</th><th rowspan="2" class="sg-s s2">Tòa</th><th rowspan="2" class="sg-s s3">Căn</th><th rowspan="2" class="n">Diện tích (m²)</th><th rowspan="2" class="n">Đơn giá (đ/m²)</th><th rowspan="2" class="n">Thành tiền</th><th rowspan="2">Tháng dự kiến bán</th>
        <th colspan="${NC}" class="sg-g">Phân bổ dòng thu <small>(Tháng/năm dự kiến thu · Tỷ lệ % · Số tiền)</small></th><th rowspan="2" class="n">Chưa phân bổ kỳ</th><th rowspan="2"></th></tr>
      <tr>${Array.from({ length: NC }, (_, k) => `<th class="sg-g c">Đợt ${k + 1}${k >= 4 && rows.every(r => !r.items[k]?.amount && !r.items[k]?.month) ? ` <a href="#" data-delc="${k}" title="Bỏ cột đợt này">×</a>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(rowH).join('')}</tbody><tfoot>${footH()}</tfoot>`;
    wireSegDate($('#sgT', m.el)); sumH(); apBar(); };
  // thanh áp dụng lịch thu: hiện khi có căn được tích chọn; căn mẫu = căn đã có đợt thu
  const apBar = () => { const ps = rows.filter(r => r.unit && r.pick), tp = rows.filter(r => r.unit && r.items.some(z => z?.amount > 0 || z?.month)), cur = $('#sgTpl', m.el).value;
    $('#sgAp', m.el).hidden = !ps.length; $('#sgApN', m.el).textContent = `Đã tích ${ps.length} căn`;
    $('#sgTpl', m.el).innerHTML = tp.length ? tp.map(r => `<option value="${r.id}" ${String(r.id) === cur ? 'selected' : ''}>${esc(r.unit.code)} · ${r.items.filter(z => z?.amount > 0).length} đợt</option>`).join('') : '<option value="">— Chưa có căn nào lập đợt thu —</option>'; };
  // cập nhật 1 dòng sau khi nhập (giữ con trỏ — không vẽ lại cả bảng)
  const overL = r => `<span class="neg">${tot(r) > val(r) ? `Vượt ${fm(tot(r) - val(r))}` : ''}${pctT(r) > 100.0001 ? `${tot(r) > val(r) ? '<br>' : ''}Tỷ lệ ${pS(pctT(r))}% > 100%` : ''}</span>`;
  const upd = r => { const tr = $(`tr[data-r="${r.id}"]`, m.el), over = isOver(r); tr.classList.toggle('sg-over', over);
    tr.querySelector('[data-un]').innerHTML = over ? overL(r) : fm(unal(r)); $('#sgT tfoot', m.el).innerHTML = footH(); sumH(); };
  const setUnit = (r, u) => { r.unit = u; if (u && val(r)) r.items = r.items.map(z => z && z.pct != null && z.by === 'pct' ? { ...z, amount: Math.round(val(r) * z.pct / 100) } : z && z.by === 'amt' ? { ...z, pct: z.amount ? p4(z.amount / val(r) * 100) : null } : z); };
  // chọn nhiều căn: danh sách thả xuống ngay dưới ô căn, mỗi căn tích chọn = 1 dòng
  const multi = async (r, btn) => { await getAv(r.project); document.querySelector('.sg-pop')?.remove();
    const us = used(r.id), xs = AV[r.project].filter(u => u.ok && (!r.building || u.building_id === +r.building));
    const pop = document.createElement('div'); pop.className = 'sg-pop'; const b = btn.getBoundingClientRect(); pop.style.left = Math.min(b.left, innerWidth - 380) + 'px'; pop.style.top = (b.bottom + 4) + 'px';
    pop.innerHTML = `<div class="sg-ph"><input class="inp" placeholder="Tìm mã căn…" data-q><span class="small muted" data-n></span></div><div class="sg-pl" data-l></div><div class="sg-pf"><button type="button" class="btn sm" data-x2>Đóng</button><button type="button" class="btn sm pri" data-go>${ico('fa-check')} Thêm căn đã chọn</button></div>`;
    document.body.appendChild(pop);
    const dl = () => { const q = $('[data-q]', pop).value.trim().toLowerCase(), ys = xs.filter(u => !q || u.code.toLowerCase().includes(q));
      $('[data-l]', pop).innerHTML = ys.map(u => `<label class="${us.has(u.id) ? 'off' : ''}"><input type="checkbox" value="${u.id}" ${us.has(u.id) ? 'disabled' : ''}><b>${esc(u.code)}</b><span class="muted">Tòa ${esc(u.building)} · ${u.area ?? '—'} m²</span>${u.rent ? '<span class="su3-tag">Đang cho thuê</span>' : ''}<span class="grow"></span><span class="n">${u.hd_value ? fm(u.hd_value) : '<span class="su3-warn">chưa có giá trị HĐ</span>'}</span></label>`).join('') || '<div class="small muted" style="padding:8px">Không có căn đủ điều kiện</div>';
      $('[data-n]', pop).textContent = `${ys.length} căn`; };
    dl(); $('[data-q]', pop).oninput = dl; $('[data-q]', pop).focus();
    $('[data-x2]', pop).onclick = () => pop.remove();
    $('[data-go]', pop).onclick = () => { const ids = $$('[data-l] input:checked', pop).map(c => +c.value); if (!ids.length) return toast('Tích chọn ít nhất 1 căn', true); pop.remove();
      const ix = rows.indexOf(r), add = []; ids.forEach((uid, k) => { const u = xs.find(z => z.id === uid); if (!k && !r.unit) setUnit(r, u); else { const t = newRow({ project: r.project, building: r.building, sale: r.sale }); setUnit(t, u); add.push(t); } });
      rows.splice(ix + 1, 0, ...add); draw(); }; };
  // sự kiện bảng
  const T = $('#sgT', m.el);
  T.addEventListener('change', run(async e => { const tr = e.target.closest('tr[data-r]'); if (!tr) return; const r = R(tr.dataset.r), f = e.target.dataset.f;
    if (f === 'project') { r.project = e.target.value; r.building = ''; r.unit = null; draw(); if (r.project) { await getAv(r.project); draw(); } }
    if (f === 'building') { r.building = e.target.value; if (r.unit && r.building && r.unit.building_id !== +r.building) r.unit = null; draw(); }
    if (f === 'unit') { const u = (AV[r.project] || []).find(z => z.id === +e.target.value) || null; if (u && used(r.id).has(u.id)) { toast(`Căn ${u.code} đã có ở dòng khác`, true); return draw(); } setUnit(r, u); draw(); }
    if (f === 'sale') r.sale = e.target.value;
    if (f === 'pick') { r.pick = e.target.checked; e.target.closest('tr').classList.toggle('sg-pk', r.pick); const a = $('#sgAll', m.el); if (a) a.checked = rows.filter(x => x.unit).every(x => x.pick); apBar(); } }));
  m.el.addEventListener('change', e => { if (e.target.id === 'sgAll') { rows.forEach(r => { r.pick = !!r.unit && e.target.checked; }); draw(); } });
  T.addEventListener('input', e => { const tr = e.target.closest('tr[data-r]'), td = e.target.closest('td[data-k]'); if (!tr || !td) return; const r = R(tr.dataset.r), z = it(r, +td.dataset.k), f = e.target.dataset.f, V = val(r); if (!V) return;
    if (f === 'pct') { const v = e.target.value.trim() === '' ? null : num(e.target.value); z.pct = v == null || isNaN(v) ? null : v; z.amount = z.pct != null ? Math.round(V * z.pct / 100) : 0; z.by = 'pct'; td.querySelector('[data-f=amt]').value = z.amount ? moneyStr(z.amount) : ''; }
    if (f === 'amt') { const v = num(e.target.value, true) || 0; z.amount = v; z.pct = v ? p4(v / V * 100) : null; z.by = 'amt'; e.target.value = v ? moneyStr(v) : ''; td.querySelector('[data-f=pct]').value = z.pct != null ? pS(z.pct) : ''; }
    upd(r); });
  T.addEventListener('change', e => { if (e.target.dataset.f !== 'month') return; const tr = e.target.closest('tr[data-r]'), td = e.target.closest('td[data-k]'); if (!tr || !td) return; const r = R(tr.dataset.r); it(r, +td.dataset.k).month = e.target.value; upd(r); });
  T.addEventListener('click', run(async e => { const dc = e.target.closest('[data-delc]'); if (dc) { e.preventDefault(); const k = +dc.dataset.delc; rows.forEach(r => r.items.splice(k, 1)); NC--; return draw(); }
    const tr = e.target.closest('tr[data-r]'); if (!tr) return; const r = R(tr.dataset.r), f = e.target.closest('[data-f]')?.dataset.f;
    if (f === 'multi') return multi(r, e.target.closest('[data-f]'));
    if (f === 'del') { rows = rows.filter(x => x !== r); if (!rows.length) rows.push(newRow()); draw(); } }));
  m.el.addEventListener('mousedown', e => { const p = document.querySelector('.sg-pop'); if (p && !p.contains(e.target) && !e.target.closest('[data-f=multi]')) p.remove(); });
  // chọn nhiều căn theo tòa: Dự án → Tòa một lần → danh sách căn đủ điều kiện (tích chọn, chọn / bỏ chọn tất cả, tìm mã căn, số đã chọn) → mỗi căn 1 dòng, không trùng
  const pk = { p: String(preset.project || ''), b: '', sel: new Set() };
  const pkBld = () => { $('#pkB', m.el).innerHTML = '<option value="">Tất cả tòa</option>' + M.buildings.filter(b => b.project_id === +pk.p).map(b => `<option value="${b.id}" ${+pk.b === b.id ? 'selected' : ''}>Tòa ${esc(b.code)}</option>`).join(''); $('#pkB', m.el).disabled = !pk.p; $('#pkOpen', m.el).disabled = !pk.p; };
  const pkXs = () => (AV[pk.p] || []).filter(u => u.ok && (!pk.b || u.building_id === +pk.b));
  const pkDraw = () => { const q = $('#pkQ', m.el).value.trim().toLowerCase(), inT = used(-1), xs = pkXs().filter(u => !q || u.code.toLowerCase().includes(q));
    $('#pkL', m.el).innerHTML = xs.map(u => `<label class="${inT.has(u.id) ? 'off' : pk.sel.has(u.id) ? 'on' : ''}"><input type="checkbox" value="${u.id}" ${inT.has(u.id) ? 'disabled checked' : pk.sel.has(u.id) ? 'checked' : ''}><b>${esc(u.code)}</b><span class="muted">Tòa ${esc(u.building)} · ${u.area ?? '—'} m²</span>${u.rent ? '<span class="su3-tag">Đang cho thuê</span>' : ''}${inT.has(u.id) ? '<span class="small muted">đã có trong bảng</span>' : ''}<span class="grow"></span><span class="n">${u.hd_value ? fm(u.hd_value) : '<span class="su3-warn">chưa có giá trị HĐ</span>'}</span></label>`).join('') || '<div class="small muted" style="padding:10px">Không có căn đủ điều kiện bán</div>';
    $('#pkN', m.el).textContent = `Đã chọn ${pk.sel.size} / ${pkXs().filter(u => !inT.has(u.id)).length} căn`; };
  pkBld();
  $('#pkP', m.el).onchange = run(async e => { pk.p = e.target.value; pk.b = ''; pk.sel.clear(); pkBld(); if (pk.p) { await getAv(pk.p); $('#pkPanel', m.el).hidden = false; pkDraw(); } else $('#pkPanel', m.el).hidden = true; });
  $('#pkB', m.el).onchange = e => { pk.b = e.target.value; pk.sel.clear(); $('#pkPanel', m.el).hidden = false; pkDraw(); };
  $('#pkOpen', m.el).onclick = run(async () => { const pn = $('#pkPanel', m.el); if (!pn.hidden) { pn.hidden = true; return; } await getAv(pk.p); pn.hidden = false; pkDraw(); $('#pkQ', m.el).focus(); });
  $('#pkClose', m.el).onclick = () => { $('#pkPanel', m.el).hidden = true; };
  $('#pkQ', m.el).oninput = pkDraw;
  $('#pkL', m.el).addEventListener('change', e => { const c = e.target; if (c.disabled) return; c.checked ? pk.sel.add(+c.value) : pk.sel.delete(+c.value); pkDraw(); });
  $('#pkAll', m.el).onclick = () => { const q = $('#pkQ', m.el).value.trim().toLowerCase(), inT = used(-1); pkXs().filter(u => !inT.has(u.id) && (!q || u.code.toLowerCase().includes(q))).forEach(u => pk.sel.add(u.id)); pkDraw(); };
  $('#pkNone', m.el).onclick = () => { pk.sel.clear(); pkDraw(); };
  const pkAdd = open => { const inT = used(-1), xs = pkXs().filter(u => pk.sel.has(u.id) && !inT.has(u.id)); if (!xs.length) return toast('Tích chọn ít nhất 1 căn', true);
    rows = rows.filter(r => r.unit || r.items.some(z => z?.amount || z?.month)); rows.forEach(r => { r.pick = false; });   // bỏ các dòng trống; chỉ các căn vừa đưa vào được tích chọn
    const s0 = rows[rows.length - 1]?.sale || T0; for (const u of xs) { const r = newRow({ project: String(u.project_id), building: String(u.building_id), sale: s0 }); setUnit(r, u); r.pick = true; rows.push(r); }
    if (!rows.length) rows.push(newRow()); pk.sel.clear(); $('#pkPanel', m.el).hidden = true; draw(); toast(`Đã đưa ${xs.length} căn vào bảng`); if (open) setupDlg(); };
  $('#pkGo', m.el).onclick = () => pkAdd(false); $('#pkGo2', m.el).onclick = () => pkAdd(true);
  $('#sgSet', m.el).onclick = () => setupDlg();
  // áp dụng lịch thu của căn mẫu cho các căn đã tích: số đợt, tháng/năm dự kiến thu, tỷ lệ % (số tiền tính lại theo Thành tiền từng căn); tuỳ chọn kèm tháng dự kiến bán; xác nhận nếu ghi đè
  $('#sgApX', m.el).onclick = () => { rows.forEach(r => { r.pick = false; }); draw(); };
  $('#sgApGo', m.el).onclick = run(async () => { const src = R($('#sgTpl', m.el).value); if (!src) return toast('Lập các đợt thu cho 1 căn làm mẫu trước', true);
    const dst = rows.filter(r => r.unit && r.pick && r !== src); if (!dst.length) return toast('Tích chọn các căn cần áp dụng (khác căn mẫu)', true);
    const sv = val(src), tpl = src.items.map(z => z && (z.amount > 0 || z.month) ? { content: z.content || '', month: z.month || '', pct: z.by === 'amt' && sv ? p4((z.amount || 0) / sv * 100) : z.pct } : null);
    const tp = tpl.reduce((a, z) => a + (+z?.pct || 0), 0); if (tp > 100.0001) return toast(`Căn mẫu có tổng tỷ lệ ${pS(tp)}% vượt 100%`, true);
    const withS = $('#sgApS', m.el).checked, has = dst.filter(r => r.items.some(z => z?.amount > 0 || z?.month)), noV = dst.filter(r => !val(r));
    if (!await ask('Áp dụng lịch thu', `Áp dụng lịch thu của căn ${src.unit.code} (${tpl.filter(Boolean).length} đợt: tháng/năm dự kiến thu + tỷ lệ %${withS ? ' + tháng dự kiến bán ' + src.sale.slice(5) + '/' + src.sale.slice(0, 4) : ''}) cho ${dst.length - noV.length} căn? Số tiền từng đợt tính lại theo Thành tiền của từng căn.${has.length ? `\n\n${has.length} căn đã có lịch thu sẽ bị ghi đè: ${has.map(r => r.unit.code).join(', ')}.` : ''}${noV.length ? `\n\nBỏ qua ${noV.length} căn chưa có giá trị HĐ.` : ''}`)) return;
    for (const r of dst) { if (!val(r)) continue; const v = val(r); r.items = tpl.map(z => z ? { content: z.content, month: z.month, pct: z.pct, amount: z.pct != null ? Math.round(v * z.pct / 100) : 0, by: 'pct' } : null); if (withS) r.sale = src.sale; }
    NC = Math.max(NC, tpl.length); draw(); toast(`Đã áp dụng lịch thu cho ${dst.length - noV.length} căn — vẫn sửa riêng được từng căn`); });
  // 18/11/2026: TAB «THIẾT LẬP THÁNG BÁN & LỊCH THU» cho các căn đã tích — danh sách căn (chuyển qua lại từng căn: mã căn, diện tích, giá trị HĐ danh mục sản phẩm);
  // tháng/năm dự kiến bán riêng từng căn hoặc áp dụng chung cho các căn tích chọn; các đợt thu kiểu đợt thanh toán HĐMB (Đợt · Nội dung · Tháng/năm dự kiến thu (MM/YYYY, không chọn ngày) · Tỷ lệ · Số tiền · Xóa), tỷ lệ ↔ số tiền theo giá trị HĐ từng căn;
  // tổng tỷ lệ / tổng tiền / đã phân bổ theo tháng / chưa phân bổ kỳ (đợt chưa chọn tháng thu + phần chưa lập đợt, không tự gán tháng, không tự chia tuần); lập cho 1 căn → «Áp dụng cho các căn tích chọn» (nội dung, ngày, tỷ lệ — số tiền tính lại, xác nhận ghi đè);
  // «Lưu tháng bán & lịch thu» → cập nhật tháng bán + các đợt trên bảng; lịch thu kế hoạch khai báo độc lập, không theo chính sách bán hàng
  const setupDlg = () => { const L0 = rows.filter(r => r.unit && r.pick); if (!L0.length) return toast('Tích chọn ít nhất 1 căn trong bảng', true);
    const L = L0.filter(r => val(r) > 0), nv = L0.length - L.length; if (!L.length) return toast('Các căn đã chọn chưa có giá trị HĐ trong danh mục sản phẩm', true);
    if (nv) toast(`Bỏ qua ${nv} căn chưa có giá trị HĐ trong danh mục sản phẩm`, true);
    const W = new Map(L.map(r => [r.id, { sale: r.sale, its: r.items.filter(z => z && (z.amount > 0 || z.month || z.content)).map(z => ({ content: z.content || '', month: z.month || '', pct: z.pct != null ? +z.pct : null, amount: Math.round(+z.amount || 0), by: z.by || 'pct' })) }]));
    // gợi ý 04 đợt 30% – 40% – 25% – 5% cho căn chưa lập đợt (tháng thu để trống — người lập tự chọn), sửa / thêm / xóa được
    L.forEach(r => { const x = W.get(r.id); if (!x.its.length) x.its = [30, 40, 25, 5].map(p => ({ content: '', month: '', pct: p, amount: Math.round(val(r) * p / 100), by: 'pct' })); });
    const tk = new Set(L.map(r => r.id)); let cur = L[0].id, dirty = false;
    const m2 = modal({ wide: true, title: `${ico('fa-calendar-days')} Thiết lập tháng bán & lịch thu`,
      body: `<div class="st"><div class="st-l"><div class="st-lh"><label><input type="checkbox" id="stAll" checked> <b>Căn đã chọn (${L.length})</b></label><span class="small muted">Ô tích = căn được áp dụng chung</span></div><div class="st-lb" id="stL"></div></div><div class="st-r" id="stR"></div></div>`,
      foot: `<button class="btn" id="stX">Hủy</button><button class="btn pri" id="stOk">${ico('fa-check')} Lưu tháng bán & lịch thu</button>` });
    m2.el.querySelector('.modal').classList.add('st-modal');
    const w = id => W.get(id), my = ym => `${ym.slice(5)}/${ym.slice(0, 4)}`;
    const tS = x => x.its.reduce((a, z) => a + (z.amount || 0), 0), tP = x => x.its.reduce((a, z) => a + (+z.pct || 0), 0), tD = x => x.its.reduce((a, z) => a + (z.month ? z.amount || 0 : 0), 0);
    const ovr = r => { const x = w(r.id); return tS(x) > val(r) || tP(x) > 100.0001; };
    const lH = () => { $('#stL', m2.el).innerHTML = L.map(r => { const x = w(r.id), n = x.its.filter(z => z.amount > 0).length;
        return `<div class="st-i ${r.id === cur ? 'on' : ''} ${ovr(r) ? 'bad' : ''}" data-u="${r.id}"><input type="checkbox" data-t ${tk.has(r.id) ? 'checked' : ''} title="Tích để áp dụng chung"><div class="st-ib"><b>${esc(r.unit.code)}</b><span class="muted">${r.unit.area != null ? String(r.unit.area).replace('.', ',') : '—'} m² · ${fm(val(r))}</span>
          <span>Bán ${my(x.sale)} · ${n ? `${n} đợt · ${pS(tP(x))}%` : '<span class="muted">chưa lập đợt thu</span>'}${ovr(r) ? ' · <span class="neg">vượt</span>' : ''}</span></div></div>`; }).join('');
      $('#stAll', m2.el).checked = tk.size === L.length; };
    const rH = () => { const r = R(cur), x = w(cur), V = val(r);
      $('#stR', m2.el).innerHTML = `<div class="sc3-hd"><div><span>Mã căn</span><b>${esc(r.unit.code)}</b></div><div><span>Diện tích</span><b>${r.unit.area != null ? String(r.unit.area).replace('.', ',') + ' m²' : '—'}</b></div><div><span>Giá trị HĐ (danh mục sản phẩm)</span><b>${fm(V)}</b></div></div>
        <div class="st-sale"><label>Tháng/năm dự kiến bán <select class="inp" id="stS">${mOpt(x.sale)}</select></label><button type="button" class="btn sm" id="stSA">${ico('fa-copy')} Áp dụng tháng bán cho các căn tích chọn</button></div>
        <div class="su3-tw"><table class="su3-t sc3-t sc4-t"><colgroup><col style="width:80px"><col><col style="width:170px"><col style="width:110px"><col style="width:170px"><col style="width:52px"></colgroup>
          <thead><tr><th>Đợt thu</th><th>Nội dung thanh toán</th><th>Tháng/năm dự kiến thu</th><th class="n">Tỷ lệ (%)</th><th class="n">Số tiền</th><th class="c">Xóa</th></tr></thead><tbody id="stT"></tbody><tfoot id="stF"></tfoot></table></div>
        <div class="sc3-bt"><button type="button" class="btn sm" id="stAdd">${ico('fa-plus')} Thêm đợt</button><span class="small muted">Nhập tỷ lệ → tự tính số tiền theo giá trị HĐ của căn; nhập số tiền → tự tính lại tỷ lệ. Tháng thu độc lập với tháng bán (được chọn sang năm kế tiếp); đợt chưa chọn tháng thu không tự gán vào tháng.</span><span class="grow"></span>
          <button type="button" class="btn sm pri" id="stAp">${ico('fa-copy')} Áp dụng cho các căn tích chọn</button></div><div id="stW"></div>`;
      tH(); };
    const tH = () => { const x = w(cur);
      $('#stT', m2.el).innerHTML = x.its.map((z, i) => `<tr data-i="${i}"><td class="c"><b>Đợt ${i + 1}</b></td><td><textarea class="inp sc4-c" data-f="content" rows="2" placeholder="Nhập nội dung thanh toán">${esc(z.content)}</textarea></td><td><select class="inp" data-f="month">${moOpt(z.month)}</select></td>
        <td><input class="inp n" data-f="pct" inputmode="decimal" placeholder="Nhập tỷ lệ" value="${z.pct != null ? pS(z.pct) : ''}"></td><td><input class="inp n" data-f="amount" inputmode="numeric" placeholder="Tự tính hoặc nhập" value="${z.amount ? moneyStr(z.amount) : ''}"></td>
        <td class="c"><button type="button" class="btn sm ghost" data-f="del" title="Xóa đợt">${ico('fa-trash')}</button></td></tr>`).join('') || '<tr><td colspan="6" class="c muted" style="padding:14px">Chưa có đợt thu — bấm «Thêm đợt»</td></tr>';
      wireSegDate($('#stT', m2.el)); fH(); };
    const fH = () => { const r = R(cur), x = w(cur), V = val(r), t = tS(x), tp = tP(x), d = tD(x), un = (t - d) + Math.max(0, V - t);
      $('#stF', m2.el).innerHTML = `<tr><td colspan="3">Tổng cộng (${x.its.length} đợt)</td><td class="n ${tp > 100.0001 ? 'neg' : ''}">${pS(tp)}%</td><td class="n ${t > V ? 'neg' : ''}">${fm(t)}</td><td></td></tr>
        <tr class="sc3-sub"><td colspan="4">Đã phân bổ theo tháng</td><td class="n">${fm(d)}</td><td></td></tr>
        <tr class="sc3-sub"><td colspan="4">Chưa phân bổ kỳ <span class="muted">= các đợt chưa chọn tháng thu ${fm(t - d)} + phần giá trị HĐ chưa lập đợt ${fm(Math.max(0, V - t))}</span></td><td class="n"><b>${fm(un)}</b></td><td></td></tr>`;
      $('#stW', m2.el).innerHTML = tp > 100.0001 || t > V ? `<div class="yp-msg r">${ico('fa-triangle-exclamation')} ${tp > 100.0001 ? `Tổng tỷ lệ ${pS(tp)}% vượt 100%. ` : ''}${t > V ? `Tổng tiền các đợt ${fm(t)} vượt giá trị HĐ ${fm(V)}.` : ''} Giảm các đợt trước khi lưu.</div>` : '';
      lH(); };
    const go = id => { cur = id; lH(); rH(); };
    lH(); rH();
    const B = m2.el;
    B.addEventListener('click', run(async e => { const t = e.target;
      const u = t.closest('[data-u]'); if (u && !t.matches('[data-t]')) return go(+u.dataset.u);
      const d0 = t.closest('[data-f=del]'); if (d0) { w(cur).its.splice(+d0.closest('tr').dataset.i, 1); dirty = true; return tH(); }
      if (t.closest('#stAdd')) { w(cur).its.push({ content: '', month: '', pct: null, amount: 0, by: 'pct' }); dirty = true; tH(); return $$('#stT tr', B).pop()?.querySelector('textarea')?.focus(); }   // không tự dồn tiền vào đợt mới
      if (t.closest('#stSA')) { const x = w(cur), ds = L.filter(r => tk.has(r.id) && r.id !== cur); if (!ds.length) return toast('Tích chọn các căn cần áp dụng (khác căn đang xem)', true);
        ds.forEach(r => { w(r.id).sale = x.sale; }); dirty = true; lH(); return toast(`Đã áp dụng tháng dự kiến bán ${my(x.sale)} cho ${ds.length} căn`); }
      if (t.closest('#stAp')) { const r0 = R(cur), x0 = w(cur), V0 = val(r0), src = x0.its.filter(z => z.amount > 0 || z.month);
        if (!src.length) return toast('Lập các đợt thu cho căn này trước khi áp dụng', true);
        if (tP(x0) > 100.0001 || tS(x0) > V0) return toast('Lịch thu của căn này đang vượt giá trị HĐ / 100% — sửa trước khi áp dụng', true);
        const ds = L.filter(r => tk.has(r.id) && r.id !== cur); if (!ds.length) return toast('Tích chọn các căn cần áp dụng (khác căn đang xem)', true);
        const tpl = src.map(z => ({ content: z.content, month: z.month, pct: z.by === 'amt' ? (z.amount ? p4(z.amount / V0 * 100) : null) : z.pct })), has = ds.filter(r => w(r.id).its.some(z => z.amount > 0 || z.month));
        if (!await ask('Áp dụng lịch thu', `Áp dụng lịch thu của căn ${r0.unit.code} (${tpl.length} đợt: nội dung, tháng/năm dự kiến thu, tỷ lệ %) cho ${ds.length} căn? Số tiền từng đợt tính lại theo giá trị HĐ của từng căn.${has.length ? `\n\n${has.length} căn đã có lịch thu sẽ bị ghi đè: ${has.map(r => r.unit.code).join(', ')}.` : ''}`)) return;
        ds.forEach(r => { const V = val(r); w(r.id).its = tpl.map(z => ({ ...z, amount: z.pct != null ? Math.round(V * z.pct / 100) : 0, by: 'pct' })); });
        dirty = true; lH(); return toast(`Đã áp dụng lịch thu cho ${ds.length} căn — vẫn sửa riêng được từng căn`); }
      if (t.closest('#stX')) { if (dirty && !await ask('Hủy thiết lập', 'Các thay đổi tháng bán & lịch thu chưa lưu sẽ bị bỏ. Hủy?')) return; return m2.close(); }
      if (t.closest('#stOk')) {
        for (const r of L) { const x = w(r.id), c = r.unit.code, its = x.its.filter(z => z.amount > 0 || z.month);
          if (tP(x) > 100.0001) { go(r.id); return toast(`Căn ${c}: tổng tỷ lệ ${pS(tP(x))}% vượt 100%`, true); }
          if (tS(x) > val(r)) { go(r.id); return toast(`Căn ${c}: tổng tiền các đợt ${fm(tS(x))} vượt giá trị HĐ ${fm(val(r))}`, true); }
          const nz = its.find(z => z.month && !(z.amount > 0)); if (nz) { go(r.id); return toast(`Căn ${c}: đợt thu tháng ${my(nz.month)} chưa nhập tỷ lệ / số tiền`, true); }
          const b0 = its.find(z => z.month && z.month < x.sale); if (b0) { go(r.id); return toast(`Căn ${c}: đợt thu tháng ${my(b0.month)} trước tháng dự kiến bán ${my(x.sale)}`, true); } }
        L.forEach(r => { const x = w(r.id); r.sale = x.sale; r.items = x.its.filter(z => z.amount > 0 || z.month).map(z => ({ content: z.content.trim(), month: z.month, pct: z.pct, amount: z.amount, by: z.by })); });
        NC = Math.max(NC, ...L.map(r => r.items.length)); m2.close(); draw(); toast(`Đã lưu tháng bán & lịch thu cho ${L.length} căn`); } }));
    B.addEventListener('change', e => { const t = e.target;
      if (t.matches('[data-t]')) { const id = +t.closest('[data-u]').dataset.u; t.checked ? tk.add(id) : tk.delete(id); $('#stAll', B).checked = tk.size === L.length; }
      if (t.id === 'stAll') { L.forEach(r => t.checked ? tk.add(r.id) : tk.delete(r.id)); lH(); }
      if (t.id === 'stS') { w(cur).sale = t.value; dirty = true; lH(); }
      if (t.matches('#stT [data-f=month]')) { const z = w(cur).its[+t.closest('tr').dataset.i]; if (z) { z.month = t.value; dirty = true; fH(); } } });
    B.addEventListener('input', e => { const tr = e.target.closest('#stT tr[data-i]'); if (!tr) return; const z = w(cur).its[+tr.dataset.i], f = e.target.dataset.f, V = val(R(cur)); dirty = true;
      if (f === 'content') { z.content = e.target.value; return; }
      if (f === 'pct') { const x = e.target.value.trim() === '' ? null : num(e.target.value); z.pct = x == null || isNaN(x) ? null : x; z.amount = z.pct != null ? Math.round(V * z.pct / 100) : 0; z.by = 'pct'; tr.querySelector('[data-f=amount]').value = z.amount ? moneyStr(z.amount) : ''; }
      if (f === 'amount') { const x = num(e.target.value, true) || 0; z.amount = x; z.pct = x ? p4(x / V * 100) : null; z.by = 'amt'; e.target.value = x ? moneyStr(x) : ''; tr.querySelector('[data-f=pct]').value = z.pct != null ? pS(z.pct) : ''; }
      fH(); });
  };
  $('#sgAddR', m.el).onclick = () => { const l = rows[rows.length - 1]; rows.push(newRow({ project: l?.project, building: l?.building, sale: l?.sale })); draw(); };
  $('#sgAddC', m.el).onclick = () => { NC++; draw(); const w = $('.sg-wrap', m.el); w.scrollLeft = w.scrollWidth; };
  $('#suSave', m.el).onclick = run(async () => { const us = rows.filter(r => r.unit); if (!us.length) return toast('Chọn ít nhất 1 căn', true);
    const ids = us.map(r => r.unit.id); if (new Set(ids).size !== ids.length) return toast('Có căn bị chọn trùng ở 2 dòng', true);
    for (const r of us) { const c = r.unit.code; if (!val(r)) return toast(`Căn ${c}: chưa có giá trị hợp đồng trong danh mục sản phẩm`, true);
      if (pctT(r) > 100.0001) return toast(`Căn ${c}: tổng tỷ lệ ${pS(pctT(r))}% vượt 100%`, true);
      if (tot(r) > val(r)) return toast(`Căn ${c}: tổng tiền các đợt ${fm(tot(r))} vượt Thành tiền ${fm(val(r))}`, true);
      if (!r.items.some(z => z?.amount > 0 && z.month)) return toast(`Căn ${c}: nhập ít nhất 1 đợt có tháng/năm dự kiến thu và tỷ lệ / số tiền`, true);
      const b0 = r.items.find(z => z?.month && z.month < r.sale); if (b0) return toast(`Căn ${c}: đợt thu tháng ${b0.month.slice(5)}/${b0.month.slice(0, 4)} trước tháng dự kiến bán ${r.sale.slice(5)}/${r.sale.slice(0, 4)}`, true); }
    const x = await api('POST', '/api/sale-plan-units', { owner_id: $('#suO', m.el).value || null, note: $('#suR', m.el).value.trim(),
      units: us.map(r => ({ unit_id: r.unit.id, value: val(r), sale_month: r.sale, base: 'value', items: r.items.map((z, k) => z && z.amount > 0 ? { name: `Đợt ${k + 1}${z.content?.trim() ? ' — ' + z.content.trim().split('\n')[0] : ''}`, grp: 'house', date: null, month: z.month || null, pct: z.pct, by: 'amt', amount: z.amount } : null).filter(Boolean) })) });
    toast(x.msg); m.close(); onDone && onDone(); });
  draw(); if (rows[0].project) getAv(rows[0].project).then(draw).catch(() => {});
};
// 17/11/2026 (bản 3 nguồn, giao diện theo mẫu Ke_hoach_dong_thu_nam.html): KẾ HOẠCH DÒNG THU NĂM — Công nợ còn lại · Bán mới · Cho thuê (dữ liệu thật, không hệ số giả lập);
// bộ lọc Năm / Dự án dùng chung cho chỉ tiêu, biểu đồ cột chồng 12 tháng, bảng 4 dòng × 12 tháng (bấm ô → chi tiết đúng nguồn + tháng), Chưa phân bổ kỳ, chi tiết tháng Dự án → Tòa → Căn → Đợt/kỳ
V.planyear = async (main, params = {}) => {
  if (main.id === 'main') { const nm = main.cloneNode(false); main.replaceWith(nm); main = nm; }   // tránh gắn trùng sự kiện khi mở lại màn / chuyển bản kế hoạch
  // 17/11/2026: VER = bản kế hoạch đã lưu (Nháp / Yêu cầu chỉnh sửa → sửa trực tiếp; đã trình / đã duyệt → chỉ xem); EDK = bản mới chưa lưu: new · copy (bản sao) · ver (phiên bản điều chỉnh), SRCID = bản nguồn
  ST.dirtyMsg = null; const VER = +params.ver || 0, EDK = ['new', 'copy', 'ver'].includes(params.edit) ? params.edit : '', SRCID = +params.src || 0;
  let P = null, ACT = null, G = null, SP = null, EDIT = !!EDK, full = !VER && !EDK, dirty = false;
  const s0 = ST.planyear2 ||= { year: +today().slice(0, 4), project: '', month: today().slice(0, 7), src: '' }; s0.shut ||= {}; s0.from ||= `${s0.year}-01-01`; s0.to ||= `${s0.year}-12-31`; s0.asof ||= today();
  const s = VER || EDK ? { year: s0.year, project: s0.project, from: s0.from, to: s0.to, asof: s0.asof, month: '', src: '', shut: {} } : s0;
  const SRC = [['cn', 'Thu công nợ còn lại', '#3568ac', 'Theo từng căn và đợt HĐMB'], ['moi', 'Thu bán mới', '#dba54d', 'Theo căn dự kiến bán và tỷ lệ thu'], ['thue', 'Thu cho thuê', '#14998a', 'Theo kỳ thuê nhà + nội thất']];
  main.innerHTML = `<div class="page ap"><div class="ap-hd"><div><div class="ap-eb">CÁT TƯỜNG · KẾ HOẠCH DÒNG THU</div><h2>Kế hoạch dòng thu năm</h2><div class="ap-sub">Công nợ còn lại · Bán mới · Cho thuê</div></div>
      <div class="ap-act"><span class="ap-dd"><button type="button" id="apX">Xuất báo cáo ${ico('fa-caret-down')}</button><span class="ap-menu" hidden><button type="button" data-apx="xlsx" data-apdet="0">${ico('fa-file-excel')} Excel — bản tổng hợp</button><button type="button" data-apx="xlsx" data-apdet="1">${ico('fa-file-excel')} Excel — bản chi tiết</button><button type="button" data-apx="pdf" data-apdet="0">${ico('fa-print')} In / PDF — bản tổng hợp</button><button type="button" data-apx="pdf" data-apdet="1">${ico('fa-print')} In / PDF — bản chi tiết</button></span></span>
        ${VER || EDK ? `<button type="button" id="apNew" hidden>+ Kế hoạch bán mới</button><button type="button" id="apBack">${ico('fa-arrow-left')} Báo cáo trực tiếp</button><button type="button" id="apList">${ico('fa-folder-open')} Danh sách bản kế hoạch</button>` : `<button type="button" id="apNew">+ Kế hoạch bán mới</button><button type="button" id="apList">${ico('fa-folder-open')} Danh sách bản kế hoạch</button><button type="button" class="ap-pri" id="apSv">${ico('fa-file-circle-plus')} Tạo bản kế hoạch</button>`}</div></div>
    ${VER || EDK ? '<div class="ap-box"><div id="apV"></div></div>' : ''}<div class="ap-box"><div class="ap-flt"><label>Năm kế hoạch<select id="apY"></select></label><label>Dự án<select id="apP"></select></label><label>Từ ngày<span id="apFr"></span></label><label>Đến ngày<span id="apTo"></span></label><label title="Đã thu / còn phải thu tính theo giao dịch hợp lệ đến hết ngày này — độc lập với kỳ kế hoạch">Số dư công nợ chốt ngày<span id="apAs"></span></label><span class="ap-sub" id="apRg"></span></div>${VER || EDK ? '' : `<div class="yp-tip">${ico('fa-circle-info')} Đây là báo cáo tự động theo dữ liệu hiện tại. Để lập kế hoạch chính thức, bấm <a href="#" id="apSv2"><b>Tạo bản kế hoạch</b></a> — mở bản kế hoạch để chỉnh kỳ, ngày chốt công nợ, dự án và từng dòng; lưu nháp hoặc trình duyệt khi xong.</div>`}<div class="ap-st" id="apSt" hidden></div><div class="ap-stats" id="apS"></div></div>
    <div class="ap-box" id="apCmp" hidden></div>
    <div class="ap-box"><div class="ap-row"><h3>Phân bổ dòng thu theo tháng</h3><span class="ap-sub">Tỷ đồng · Tổng từng tháng · bấm cột để xem chi tiết tháng</span></div><div class="ap-chart" id="apC"></div>
      <div class="ap-lg">${SRC.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div><div class="ap-tip" hidden></div></div>
    <div class="ap-box"><div class="ap-row"><h3>Bảng kế hoạch</h3><span class="ap-sub">Bấm số tiền của căn để xem các khoản cấu thành · bấm số tiền dòng tổng hợp để xem chi tiết tháng</span><span class="ap-tga"><button type="button" data-apall="1">${ico('fa-plus')} Mở rộng tất cả</button><button type="button" data-apall="0">${ico('fa-minus')} Thu gọn tất cả</button></span></div>
      <div class="ap-scroll ap-tw"><table class="ap-t"><thead><tr><th class="c1">Nguồn thu / Dự án / Tòa / Căn hộ</th><th class="c2">Tên khách hàng</th><th title="Tổng các tháng trong khoảng">Kế hoạch thu trong kỳ</th><span id="apMH"></span><th title="Công nợ còn lại: = «Còn lại theo hợp đồng» của Bảng tổng hợp công nợ">Tổng công nợ còn lại</th></tr></thead><tbody id="apT"></tbody></table></div>
      <div class="ap-note">Chưa phân bổ kỳ: <a href="#" id="apU"><b></b> tỷ</a> · Theo dõi riêng, chưa cộng vào kế hoạch thu trong kỳ (khoản chưa có ngày đến hạn / chưa có lịch thu, giá trị bán chưa phân bổ tháng). Công nợ quá hạn trước Từ ngày hiển thị riêng ở cột «Công nợ chuyển sang».</div><div class="ap-note" id="apRc"></div>
      <details><summary>Nguyên tắc tổng hợp và lưu lịch sử</summary><p>Công nợ còn lại lấy đúng «Còn lại theo hợp đồng» của Bảng tổng hợp công nợ (cùng ngày chốt): số còn nợ hiện tại của từng đợt (đã trừ tiền thu đúng đợt) xếp theo ngày đến hạn — đến hạn trong năm vào tháng, quá hạn chưa thu là công nợ chuyển sang (chọn kỳ thu để xếp tháng), lấy theo khoảng Từ ngày – Đến ngày (gồm cả 2 đầu; ngày dự kiến thu đã điều chỉnh được ưu tiên): quá hạn trước Từ ngày là «Công nợ chuyển sang», ngày đến hạn ngoài khoảng là «Ngoài kỳ», chưa có ngày / chưa có lịch thu là «Chưa phân bổ kỳ»; Tổng công nợ còn lại = Kế hoạch thu trong kỳ + Công nợ chuyển sang + Ngoài kỳ + Chưa phân bổ kỳ (HĐ mua bán, thuê mua, hoàn thiện; giao dịch bán căn bằng HĐ thuê / HĐ vay lấy tiến độ HĐMB liên kết, chỉ tính một lần). Bán mới lấy theo tháng thu đã phân bổ (giá trị dự kiến bán × tỷ lệ thu). Cho thuê lấy theo kỳ thu tiền nhà và nội thất; tiền cọc và gốc / lãi vay phải trả không cộng vào tiền thuê. Công nợ quá hạn từ năm trước xếp vào kỳ dự kiến thu đã chọn; chưa chọn kỳ, chưa có ngày đến hạn hoặc giá trị bán chưa phân bổ tháng → «Chưa phân bổ kỳ», không cộng vào tổng năm. «Số dư công nợ chốt ngày» (mặc định hôm nay) xác định đã thu / còn phải thu theo giao dịch hợp lệ đến hết ngày đó, độc lập với kỳ kế hoạch — chỉ phục vụ tính toán, tra cứu, không ghi đè kế hoạch đã chốt. «Số dư công nợ chốt ngày» (mặc định hôm nay) xác định đã thu / còn phải thu theo giao dịch hợp lệ đến hết ngày đó, độc lập với kỳ kế hoạch — chỉ phục vụ tính toán, tra cứu, không ghi đè kế hoạch đã chốt. Phần chưa thu tự chuyển kỳ sau ở Kế hoạch thu tuần/tháng, giữ nguyên báo cáo đã chốt và lưu lịch sử; tổng năm không cộng lặp khoản chuyển tiếp. Hợp đồng ký từ kế hoạch bán mới được tính ở nguồn bán mới, không trùng với công nợ.</p></details></div>
    <div class="ap-box" id="apD" aria-live="polite"></div><div class="yp-bar" id="apBar" hidden></div></div>`;
  const ty = v => (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 3 }), sum = (xs, k = 'plan') => xs.reduce((a, r) => a + (+r[k] || 0), 0);
  let d = null;
  const its = () => full ? d.items.filter(i => !s.project || i.project === s.project) : d.items;
  const isCarry = i => i.zone === 'carry', isOut = i => i.zone === 'out', isUn = i => !i.month && !isOut(i) && !isCarry(i);
  const cell = (src, m) => sum(its().filter(i => i.src === src && i.month === m));
  const ml = m => d.months.some(x => x.slice(0, 4) !== d.months[0].slice(0, 4)) ? `${m.slice(5)}/${m.slice(2, 4)}` : `T${+m.slice(5)}`;
  const rgL = () => `Kỳ kế hoạch: ${dmy(d.from)} đến ${dmy(d.to)}`, asL = () => `Số dư công nợ chốt đến hết ngày: ${dmy(d.asof)}`;
  const lockF = () => { const on = EDIT || (!VER && !EDK); const nb = $('#apNew', main); if (nb) nb.hidden = !on; $$('.ap-flt select, .ap-flt input, .ap-flt button', main).forEach(x => { x.disabled = !on; }); };
  const drawF = () => { const t0 = +today().slice(0, 4), ys = [...new Set([t0 - 1, t0, t0 + 1, t0 + 2, s.year])].sort();
    if (!$('#apF', main)) { $('#apFr', main).innerHTML = segDate('apF', s.from); $('#apTo', main).innerHTML = segDate('apT2', s.to); $('#apAs', main).innerHTML = segDate('apA', s.asof); wireSegDate($('.ap-flt', main)); }   /* không đặt lại ô ngày khi vẽ lại (người dùng có thể đang gõ dở) — chỉ đặt lại khi đổi Năm kế hoạch */
    $('#apY', main).innerHTML = ys.map(y => `<option value="${y}" ${y === s.year ? 'selected' : ''}>${y}</option>`).join('');
    // 17/11/2026: danh sách dự án lấy theo Danh mục dự án (mọi dự án, kể cả chưa có kế hoạch — chọn thì hiện trạng thái trống)
    $('#apP', main).innerHTML = `<option value="">Tất cả dự án</option>` + M.projects.map(p => `<option value="${esc(p.code)}" ${s.project === p.code ? 'selected' : ''}>${esc(p.name || p.code)}</option>`).join(''); };
  const draw = () => { $('#apRg', main).innerHTML = `<b>${rgL()}</b> | <b>${asL()}</b> · Đơn vị: tỷ đồng`;
    const tot = Object.fromEntries(SRC.map(([k]) => [k, d.months.reduce((a, m) => a + cell(k, m), 0)])), all = SRC.reduce((a, [k]) => a + tot[k], 0);
    $('#apS', main).innerHTML = [['Tổng kế hoạch trong kỳ', all], ...SRC.map(([k, l]) => [l, tot[k]])].map(([l, v]) => `<div class="ap-stat"><div class="ap-sub">${l}</div><div class="ap-big">${ty(v)} <small>tỷ</small></div></div>`).join('');
    // biểu đồ cột chồng — cùng thang đo, tổng trên đầu cột, rê / chạm xem từng nguồn
    const mt = d.months.map(m => SRC.reduce((a, [k]) => a + cell(k, m), 0)), mx = Math.max(...mt, 0);
    $('#apC', main).innerHTML = mx ? d.months.map((m, i) => `<div class="ap-col ${m === s.month ? 'on' : ''}" data-apm="${m}" data-i="${i}" tabindex="0" style="min-width:0"><span class="ap-val">${mt[i] ? ty(mt[i]) : ''}</span>
        <div class="ap-stack" style="height:${(mt[i] / mx * 150).toFixed(1)}px">${SRC.map(([k, , c]) => { const v = cell(k, m); return v ? `<div style="flex:${v};background:${c}"></div>` : ''; }).join('')}</div><small>${ml(m)}</small></div>`).join('')
      : `<div class="ap-empty">Chưa có kế hoạch thu từ ${dmy(d.from)} đến ${dmy(d.to)}${s.project ? ' của dự án này' : ''}</div>`;
    $('#apC', main).style.gridTemplateColumns = `repeat(${d.months.length}, minmax(0, 1fr))`;
    // bảng 4 dòng
    // bảng phân cấp Nguồn thu → Dự án → Tòa → Căn hộ / khách hàng (+ / − từng cấp); mỗi cấp = tổng dòng con (chỉ khoản đã phân bổ tháng — «Chưa phân bổ kỳ» theo dõi riêng)
    const RM = ['I', 'II', 'III'], H = hier(), shut = r => (r.anc || []).some(k => s.shut[k]);
    { const tr = $('.ap-t thead tr', main), hd = `<th class="c1">Nguồn thu / Dự án / Tòa / Căn hộ</th><th class="c2">Tên khách hàng</th><th title="Tổng các tháng trong khoảng">Kế hoạch thu trong kỳ</th>${d.months.map(m => `<th>${ml(m)}</th>`).join('')}<th title="Quá hạn trước Từ ngày, chưa chọn kỳ dự kiến thu">Công nợ chuyển sang</th><th>Ngoài kỳ</th><th>Chưa phân bổ kỳ</th><th title="= «Còn lại theo hợp đồng» của Bảng tổng hợp công nợ">Tổng công nợ còn lại</th>`; tr.innerHTML = hd; }
    $('#apT', main).innerHTML = H.map(r => shut(r) ? '' : `<tr class="${r.lv === -1 ? 'tot' : 'l' + r.lv}"><td class="c1"><span style="padding-left:${Math.max(0, r.lv) * 16}px">${r.lv >= 0 && r.lv <= 2 ? `<button type="button" class="ap-tg" data-aptg="${esc(r.key)}" aria-label="${s.shut[r.key] ? 'Mở rộng' : 'Thu gọn'}">${s.shut[r.key] ? '+' : '−'}</button>` : r.lv === 3 ? '<i class="ap-dot"></i>' : ''}${esc(r.l)}${r.ed ? ' <span class="yp-ed">đã chỉnh</span>' : ''}</span></td><td class="c2">${esc(r.cust || '')}</td>
      <td><b>${r.leaf ? `<button type="button" data-apleaf="${esc(r.leaf)}" data-apmm="">${r.tot ? ty(r.tot) : '–'}</button>` : ty(r.tot)}</b></td>${r.v.map((v, i) => `<td>${!v ? '<span class="ap-z">–</span>' : r.leaf ? `<button type="button" data-apleaf="${esc(r.leaf)}" data-apmm="${d.months[i]}" title="Các khoản cấu thành tháng ${i + 1}">${ty(v)}</button>` : `<button type="button" data-aps="${r.src || ''}" data-apm="${d.months[i]}" title="Chi tiết tháng ${i + 1}">${ty(v)}</button>`}</td>`).join('')}
      ${[['carry', r.carry], ['out', r.out], ['un', r.un]].map(([z, v]) => `<td class="ap-x">${!v ? '<span class="ap-z">–</span>' : r.leaf ? `<button type="button" data-apleaf="${esc(r.leaf)}" data-apmm="${z}">${ty(v)}</button>` : ty(v)}</td>`).join('')}<td class="ap-x"><b>${r.tl == null ? '<span class="ap-z">—</span>' : ty(r.tl)}</b></td></tr>`).join('');
    $('#apU b', main).textContent = ty(sum(its().filter(isUn)));
    // đối chiếu Bảng tổng hợp công nợ: Tổng công nợ còn lại = trong năm + ngoài năm + chưa phân bổ kỳ (nguồn công nợ còn lại, cùng ngày chốt + bộ lọc)
    { const cn = its().filter(i => i.src === 'cn'), a1 = sum(cn.filter(i => i.month)), a2 = sum(cn.filter(isOut)), a3 = sum(cn.filter(isUn)), a4 = sum(cn.filter(isCarry)), tl = [...new Set(cn.map(i => i.unit_id))].reduce((x, u) => x + (+d.total_left[u] || 0), 0);
      $('#apRc', main).innerHTML = `Đối chiếu Bảng tổng hợp công nợ (${asL().toLowerCase()}): Tổng công nợ còn lại <b>${fm(tl)}</b> = Kế hoạch thu trong kỳ ${fm(a1)} + Công nợ chuyển sang ${fm(a4)} + Ngoài kỳ ${fm(a2)} + Chưa phân bổ kỳ ${fm(a3)} ${Math.round(tl) === Math.round(a1 + a2 + a3 + a4) ? '<span class="ap-ok">✓ khớp</span>' : `<span class="ap-bad">✗ lệch ${fm(tl - a1 - a2 - a3 - a4)}</span>`}`; }
    detail(); };
  // chi tiết tháng (hoặc «Chưa phân bổ kỳ» khi s.month = '') — 3 nguồn; mở rộng Dự án → Tòa → Căn → Đợt/kỳ: kế hoạch, thực thu, còn lại, tình trạng, phân bổ tuần
  const keyU = i => i.src + '|' + (i.unit_id ? 'u' + i.unit_id : 'g' + (i.grp || i.unit));
  const hier = () => { const xs = its(), out = [], mk = (rs, o) => { const src = o.src || ''; const tlU = [...new Set(rs.filter(r => r.src === 'cn').map(r => r.unit_id))].reduce((x, u) => x + (+d.total_left[u] || 0), 0);
      return { ...o, v: d.months.map(m => sum(rs.filter(r => r.month === m))), tot: sum(rs.filter(r => r.month)), carry: sum(rs.filter(isCarry)), out: sum(rs.filter(isOut)), un: sum(rs.filter(isUn)), tl: src === 'moi' ? null : tlU + sum(rs.filter(r => r.src === 'thue')) }; };
    const by = (a, fn) => [...a.reduce((Mp, r) => Mp.set(fn(r), [...(Mp.get(fn(r)) || []), r]), new Map()).entries()].sort((x, y) => String(x[0]).localeCompare(String(y[0]), 'vi', { numeric: true }));
    SRC.forEach(([k, l], n) => { const s1 = xs.filter(i => i.src === k); out.push(mk(s1, { lv: 0, key: k, anc: [], src: k, l: `${['I', 'II', 'III'][n]}. ${l}` }));
      for (const [p, ps] of by(s1, i => i.project || '—')) { const pk = k + '|' + p; out.push(mk(ps, { lv: 1, key: pk, anc: [k], src: k, l: p === '—' ? 'Chưa chọn dự án' : M.projects.find(x => x.code === p)?.name || p }));
        for (const [b, bs] of by(ps, i => i.building || '—')) { const bk = pk + '|' + b; out.push(mk(bs, { lv: 2, key: bk, anc: [k, pk], src: k, l: b === '—' ? 'Chưa chọn tòa' : 'Tòa ' + b }));
          for (const [u, us] of by(bs, keyU)) out.push(mk(us, { lv: 3, anc: [k, pk, bk], src: k, leaf: u, ed: us.some(i => i.edited), l: us[0].unit, cust: us[0].customer || (k === 'moi' ? 'Chưa xác định' : '') })); } } });
    out.push(mk(xs, { lv: -1, l: 'TỔNG CỘNG' })); return out; };
  // các khoản cấu thành của 1 căn (cả năm hoặc 1 tháng): hợp đồng, đợt/kỳ, ngày đến hạn / dự kiến thu, kế hoạch, thực thu, còn lại, nguồn chuyển tiếp (+ bán mới: tháng bán, giá trị, tỷ lệ)
  const leafDlg = (leaf, m) => { const xs = its().filter(i => keyU(i) === leaf && (m === 'out' ? isOut(i) : m === 'un' ? isUn(i) : m === 'carry' ? isCarry(i) : m ? i.month === m : true)), x0 = xs[0]; if (!x0) return; const moi = x0.src === 'moi';
    modal({ wide: true, title: `${esc(x0.unit)} · ${esc(SRC.find(z => z[0] === x0.src)[1])} · ${m === 'out' ? 'ngoài kỳ' : m === 'un' ? 'chưa phân bổ kỳ' : m === 'carry' ? 'công nợ chuyển sang' : m ? `tháng ${+m.slice(5)}/${m.slice(0, 4)}` : 'toàn bộ khoản thu'}`, body: `<div class="small muted mb">${esc(x0.customer || (moi ? 'Khách hàng: chưa xác định' : ''))}${x0.project ? ' · Dự án ' + esc(x0.project) : ''}${x0.building ? ' · Tòa ' + esc(x0.building) : ''}</div>
      <div class="tbl-wrap"><table class="t compact noclick"><thead><tr><th>Hợp đồng</th><th>Đợt / kỳ thu</th><th>${moi ? 'Ngày dự kiến thu' : 'Ngày đến hạn'}</th>${moi ? '<th>Tháng bán</th><th class="num">Giá trị dự kiến bán</th><th class="num">Tỷ lệ thu</th>' : ''}<th>Tháng KH</th><th class="num">Tiền kế hoạch</th><th class="num">Thực thu</th><th class="num">Còn lại</th><th>Nguồn chuyển tiếp</th><th>Tình trạng</th></tr></thead><tbody>
      ${xs.map(i => `<tr><td>${esc(i.contract || (moi ? 'Chưa có HĐ' : ''))}</td><td>${esc(i.label)}${i.week_l ? `<div class="small muted">${esc(i.week_l)}</div>` : ''}</td><td>${i.due_on ? dmy(i.due_on) : '—'}</td>
        ${moi ? `<td>${i.sale_month ? i.sale_month.slice(5) + '/' + i.sale_month.slice(0, 4) : '—'}</td><td class="num">${i.value ? fm(i.value) : '—'}</td><td class="num">${i.rate != null ? String(i.rate).replace('.', ',') + '%' : '—'}</td>` : ''}
        <td>${i.month ? i.month.slice(5) + '/' + i.month.slice(0, 4) : '—'}</td><td class="num">${fm(i.plan)}</td><td class="num">${fm(i.act)}</td><td class="num">${fm(i.rem)}</td><td class="small">${esc(i.carry_src || '—')}</td><td class="small">${esc(i.st)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${moi ? 7 : 4}"><b>Tổng cộng · ${xs.length} khoản</b></td><td class="num"><b>${fm(sum(xs))}</b></td><td class="num"><b>${fm(sum(xs, 'act'))}</b></td><td class="num"><b>${fm(sum(xs, 'rem'))}</b></td><td colspan="2"></td></tr></tfoot></table></div>` }); };
  const detail = () => { const m = s.month, xs = its().filter(i => m ? i.month === m : isUn(i)), lab = m ? `tháng ${+m.slice(5)}/${m.slice(0, 4)}` : 'chưa phân bổ kỳ';
    const tree = (rs) => { const by = (a, k) => [...a.reduce((M, r) => M.set(r[k] || '—', [...(M.get(r[k] || '—') || []), r]), new Map()).entries()].sort((x, y) => String(x[0]).localeCompare(String(y[0]), 'vi', { numeric: true }));
      const nums = a => `<span class="ap-nums"><span>KH <b>${fm(sum(a))}</b></span><span>Thực thu ${fm(sum(a, 'act'))}</span><span>Còn lại ${fm(sum(a, 'rem'))}</span></span>`;
      return by(rs, 'project').map(([p, ps]) => `<details open><summary><b>Dự án ${esc(p)}</b>${nums(ps)}</summary>${by(ps, 'building').map(([b, bs]) => `<details><summary>Tòa ${esc(b)}${nums(bs)}</summary>
        ${by(bs, 'unit').map(([u, us]) => `<details><summary>${esc(u)}${us[0].customer ? ` <span class="ap-sub">${esc(us[0].customer)}</span>` : ''}${nums(us)}</summary><div class="ap-scroll"><table class="ap-it"><thead><tr><th>Đợt / kỳ thu</th><th>Hợp đồng</th><th>Ngày đến hạn</th><th>Phân bổ tuần</th><th>Kế hoạch</th><th>Thực thu</th><th>Còn lại</th><th>Tình trạng</th><th></th></tr></thead><tbody>
          ${us.map(i => `<tr><td>${esc(i.label)}</td><td>${esc(i.contract || '')}</td><td>${i.due_on ? dmy(i.due_on) : '—'}</td><td>${esc(i.week_l || (i.src === 'moi' ? '' : 'Theo ngày đến hạn'))}</td><td>${fm(i.plan)}</td><td>${fm(i.act)}</td><td>${fm(i.rem)}</td><td><span class="ap-pill">${esc(i.st)}</span></td>
            <td>${i.carry && !i.month && d.can_plan ? `<button type="button" class="ap-lnk" data-apsel="${i.unit_id}" data-aptab="${i.src === 'thue' ? 'thue' : 'ban'}" data-apamt="${i.rem}">Chọn kỳ thu</button>` : ''}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}</details>`).join('')}</details>`).join(''); };
    const cur = s.src ? xs.filter(i => i.src === s.src) : xs;
    $('#apD', main).innerHTML = `<div class="ap-row"><h3>Chi tiết ${lab}</h3><span class="ap-sub">${rgL()} | ${asL()}</span><span class="ap-pill">${s.src ? esc(SRC.find(x => x[0] === s.src)[1]) + ' · ' : ''}Kế hoạch thực tế</span></div>
      <div class="ap-dg">${SRC.map(([k, l, , n]) => `<button type="button" class="ap-di ${s.src === k ? 'on' : ''}" data-apsrc="${k}"><div class="ap-sub">${l}</div><div class="ap-big">${ty(sum(xs.filter(i => i.src === k)))} tỷ</div><div class="ap-sub">${n}</div></button>`).join('')}</div>
      <div class="ap-note">Tổng ${lab}: <b>${ty(sum(xs))} tỷ</b> (${fm(sum(xs))} đ) · thực thu ${fm(sum(xs, 'act'))} đ${s.src ? ` · đang xem: ${esc(SRC.find(x => x[0] === s.src)[1])} — <a href="#" data-apsrc="">xem cả 3 nguồn</a>` : ''}${m ? ` · <a href="#" data-apweek="${m}">Mở kế hoạch thu tuần/tháng ${+m.slice(5)}/${m.slice(0, 4)}</a>` : ''}</div>
      ${cur.length ? `<div class="ap-tree">${tree(cur)}</div>` : '<div class="ap-empty">Không có khoản thu trong kỳ này</div>'}`; };
  let seq = 0;
  const busy = (on, msg = '') => { main.querySelector('.ap')?.classList.toggle('ap-ld', on); const st = $('#apSt', main); if (st) { st.hidden = !msg; st.innerHTML = msg; } };
  const fail = msg => { d = null; for (const id of ['#apS', '#apC', '#apT', '#apD']) { const el = $(id, main); if (el) el.innerHTML = id === '#apT' ? '' : `<div class="ap-empty ap-errb">${msg}</div>`; } const u = $('#apU b', main); if (u) u.textContent = '—'; const rc = $('#apRc', main); if (rc) rc.innerHTML = ''; };
  const load = async how => { const my = ++seq, saved = how !== 'src' && (VER || (EDK && SRCID && !d));
    if (!saved && !s.from || !s.to || s.from > s.to) { busy(false, `${ico('fa-triangle-exclamation')} «Từ ngày» phải nhỏ hơn hoặc bằng «Đến ngày» — chưa tính lại báo cáo`); return fail('Khoảng thời gian không hợp lệ: «Từ ngày» phải nhỏ hơn hoặc bằng «Đến ngày».'); }
    busy(true, saved ? `${ico('fa-spinner fa-spin')} Đang tải bản kế hoạch…` : `${ico('fa-spinner fa-spin')} Đang tính lại: kỳ kế hoạch ${dmy(s.from)} đến ${dmy(s.to)} | số dư công nợ chốt đến hết ngày ${dmy(s.asof)}…`);
    try { const q = new URLSearchParams({ year: s.year, from: s.from, to: s.to, asof: s.asof || today() }), r = await api('GET', saved ? '/api/year-plans/' + (VER || SRCID) : '/api/plan-year?' + q);
      if (my !== seq) return;   // đã có lựa chọn mới hơn — bỏ kết quả cũ
      if (saved) { G = r; d = r.data; if (!d) throw new Error('Bản kế hoạch chưa có số liệu'); full = false; const pl = r.plan;
        if (VER) { P = pl; ACT = r.actual; EDIT = !!r.can.edit; } else { SP = pl; d = JSON.parse(JSON.stringify(d)); }
        Object.assign(s, { year: +pl.year, from: pl.from_on, to: pl.to_on, asof: pl.asof, project: pl.project || '' }); }
      else { d = r; d.captured_at = new Date().toISOString(); full = true; }
      if (EDIT) d.can_plan = false; if (!d.months.includes(s.month)) s.month = d.months.includes(today().slice(0, 7)) ? today().slice(0, 7) : d.months[0];
      busy(false); drawF(); lockF(); draw(); if (VER || EDK) drawV(); if (EDK && !dirty) setDirty(true); else drawBar(); if (VER) ypDoIt(); }
    catch (er) { if (my !== seq) return; busy(false, `${ico('fa-circle-exclamation')} Không lấy được dữ liệu: ${esc(er.message)} — <a href="#" data-apre="1">Thử lại</a>`); fail('Không lấy được dữ liệu cho khoảng thời gian đã chọn — số liệu cũ đã được ẩn.'); } };
  // tooltip cột chồng
  const tip = $('.ap-tip', main);
  $('#apC', main).addEventListener('mousemove', e => { const c = e.target.closest('.ap-col'); if (!c) { tip.hidden = true; return; } const m = c.dataset.apm, rc = $('#apC', main).getBoundingClientRect();
    tip.innerHTML = `<b>Tháng ${+m.slice(5)}/${m.slice(0, 4)}</b>${SRC.map(([k, l, col]) => `<div><i style="background:${col}"></i>${l}: <b>${ty(cell(k, m))}</b> tỷ</div>`).join('')}<div>Tổng: <b>${ty(SRC.reduce((a, [k]) => a + cell(k, m), 0))}</b> tỷ</div>`;
    tip.hidden = false; tip.style.left = Math.min(rc.width - 230, Math.max(0, e.clientX - rc.left + 12)) + 'px'; tip.style.top = (e.clientY - rc.top + 70) + 'px'; });
  $('#apC', main).addEventListener('mouseleave', () => { tip.hidden = true; });
  const selDlg = (uid, tab, amt) => { const ms = Array.from({ length: 12 }, (_, i) => `${s.year}-${String(i + 1).padStart(2, '0')}`), u = d.items.find(i => i.unit_id === uid);
    const m = modal({ title: `Chọn kỳ dự kiến thu — ${esc(u?.unit || '')}`, narrow: true, body: `<div class="small muted mb">Công nợ quá hạn từ năm trước (${tab === 'thue' ? 'cho thuê' : 'công nợ còn lại'}) — lưu vào Kế hoạch thu tuần/tháng.</div>
      <div class="fld"><label>Tháng / năm<span class="req">*</span></label><select class="inp" id="csM">${ms.map(x => `<option value="${x}" ${x === s.month ? 'selected' : ''}>Tháng ${x.slice(5)}/${x.slice(0, 4)}</option>`).join('')}</select></div>
      <div class="fld"><label>Số tiền dự kiến thu</label><input class="inp" id="csA" inputmode="numeric" value="${moneyStr(amt)}"></div>`, foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="csOk">${ico('fa-check')} Xác nhận</button>` });
    $('#csA', m.el).oninput = e => { const v = num(e.target.value, true); if (v) e.target.value = moneyStr(v); };
    $('#csOk', m.el).onclick = run(async () => { const x = await api('POST', '/api/due-debt/plan', { unit_id: uid, tab, on: true, to: today(), month: $('#csM', m.el).value, week: 0, amount: num($('#csA', m.el).value, true) }); toast(x.msg); m.close(); await load(); }); };
  const subT = () => VER && P ? `${P.code} · Phiên bản ${P.version} · ${P.status_l} | ${rgL()} | ${asL()} | ${P.project_name}` : `${rgL()} | ${asL()} | ${s.project ? 'Dự án ' + (M.projects.find(x => x.code === s.project)?.name || s.project) : 'Tất cả dự án'}`;
  const exp = (kind, full) => { const rows = [...SRC.map(([k, l], n) => ({ l: `${['I', 'II', 'III'][n]}. ${l}`, ...Object.fromEntries(d.months.map((m, i) => ['m' + i, cell(k, m)])), tot: d.months.reduce((a, m) => a + cell(k, m), 0), _b: 1, _c: 'src' }))];
    rows.push({ l: 'Tổng cộng', ...Object.fromEntries(d.months.map((m, i) => ['m' + i, SRC.reduce((a, [k]) => a + cell(k, m), 0)])), tot: rows.reduce((a, r) => a + r.tot, 0), _b: 1, _c: 'tot' });
    rows.push({ l: 'Chưa phân bổ kỳ (không cộng tổng)', tot: sum(its().filter(isUn)) }, { l: 'Công nợ chuyển sang (không cộng tổng)', tot: sum(its().filter(isCarry)) }, { l: 'Ngoài kỳ (không cộng tổng)', tot: sum(its().filter(isOut)) });
    let C = [['l', 'Nguồn thu', 'text', 34], ['tot', 'Kế hoạch thu trong kỳ', 'money'], ...d.months.map((m, i) => ['m' + i, ml(m), 'money'])];
    if (full) { C = [['l', 'Nguồn thu / Dự án / Tòa / Căn hộ', 'text', 40], ['cust', 'Tên khách hàng', 'text', 26], ...C.slice(1), ['carry', 'Công nợ chuyển sang', 'money'], ['out', 'Ngoài kỳ', 'money'], ['un', 'Chưa phân bổ kỳ', 'money'], ['tl', 'Tổng công nợ còn lại', 'money']];
      rows.splice(0, rows.length, ...hier().map(r => ({ l: ' '.repeat(Math.max(0, r.lv) * 3) + r.l, cust: r.cust || '', tot: r.tot, carry: r.carry, out: r.out, un: r.un, tl: r.tl, ...Object.fromEntries(r.v.map((v, i) => ['m' + i, v])), _b: r.lv !== 3 ? 1 : 0, _c: r.lv === 0 ? 'src' : r.lv === -1 ? 'tot' : r.lv === 3 ? '' : 'grp' })), { l: 'Chưa phân bổ kỳ (không cộng tổng)', tot: sum(its().filter(i => !i.month)) }); }
    const DC = [['src_l', 'Nguồn thu', 'text', 20], ['month_l', 'Tháng', 'text', 12], ['project', 'Dự án', 'text', 10], ['building', 'Tòa', 'text', 8], ['unit', 'Căn hộ', 'text', 18], ['customer', 'Khách hàng', 'text', 24], ['contract', 'Hợp đồng', 'text', 16], ['label', 'Đợt / kỳ thu', 'text', 36], ['due_on', 'Ngày đến hạn', 'date'], ['week_l', 'Phân bổ tuần', 'text', 22], ['plan', 'Kế hoạch', 'money'], ['act', 'Thực thu', 'money'], ['rem', 'Còn lại', 'money'], ['st', 'Tình trạng', 'text', 26]];
    const det = its().map(i => ({ ...i, src_l: SRC.find(x => x[0] === i.src)[1], month_l: i.month ? `${i.month.slice(5)}/${i.month.slice(0, 4)}` : 'Chưa phân bổ kỳ' })).sort((a, b) => String(a.month || '9999').localeCompare(String(b.month || '9999')) || a.src.localeCompare(b.src) || String(a.unit).localeCompare(String(b.unit)));
    if (kind === 'xlsx') return download('/api/export-rows', { file: VER && P ? `${P.code}_v${P.version}` : `Ke_hoach_dong_thu_nam_${d.year}`, title: `KẾ HOẠCH DÒNG THU NĂM ${d.year}`, sheets: [
      { name: `Kế hoạch năm ${d.year}${full ? ' (chi tiết)' : ''}`, title: `KẾ HOẠCH DÒNG THU NĂM ${d.year}${full ? ' — CHI TIẾT' : ''}`, note: subT() + ' · Đơn vị: đồng', cols: C, rows, noNo: 1 },
      { name: 'Chi tiết khoản thu', title: `CHI TIẾT KHOẢN THU NĂM ${d.year}`, note: subT() + ' · Đơn vị: đồng', cols: DC, rows: det, sum: ['plan', 'act', 'rem'] }] });
    const w = ST.ypPw || window.open('', '_blank'); ST.ypPw = null; if (!w) return toast('Trình duyệt chặn cửa sổ in', true); w.document.open(); const t0 = today();
    w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Kế hoạch dòng thu năm ${d.year}</title><style>@page{size:${full ? 'A3' : 'A4'} landscape;margin:10mm}body{font:10.5px Arial,sans-serif;color:#000}h2{text-align:center;margin:0;font-size:16px}.c{text-align:center;margin:3px 0 10px}
      table{border-collapse:collapse;width:100%}thead{display:table-header-group}th,td{border:1px solid #888;padding:4px 5px}th{background:#e8eef7}td.n{text-align:right;white-space:nowrap}tr.src td{font-weight:bold;background:#eef3fa;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr.grp td{font-weight:bold}tr.x td{font-weight:bold;background:#254b80;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sg{display:flex;justify-content:space-around;margin-top:18px;text-align:center}.sg i{display:block;margin-bottom:50px}</style></head><body>
      <h2>KẾ HOẠCH DÒNG THU NĂM ${d.year}${full ? ' — CHI TIẾT' : ''}</h2>${VER && P ? `<div class="c"><b>${esc(P.code)} — Phiên bản ${P.version} — ${esc(P.status_l)}</b><br>${esc(P.name)}</div>` : ''}<div class="c">${esc(subT())} · Đơn vị: đồng</div><table><thead><tr>${C.map(c => `<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(r => `<tr class="${r._c === 'tot' ? 'x' : r._c || ''}">${C.map(c => `<td class="${c[2] === 'money' ? 'n' : ''}">${c[2] === 'money' ? (r[c[0]] ? fm(r[c[0]]) : '') : esc(r[c[0]] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <div style="text-align:right;margin-top:10px;font-style:italic">${VER && P ? (x => `Ngày lập: ngày ${+x.slice(8)} tháng ${+x.slice(5, 7)} năm ${x.slice(0, 4)}`)(ddL(P.created_at)) : `Ngày lập: ngày ${+t0.slice(8)} tháng ${+t0.slice(5, 7)} năm ${t0.slice(0, 4)}`}</div><div class="sg"><div><b>NGƯỜI LẬP</b><i>(Ký, ghi rõ họ tên)</i>${VER && P ? esc(P.created_name) : ''}</div><div><b>TRƯỞNG BỘ PHẬN</b><i>(Ký, ghi rõ họ tên)</i></div><div><b>NGƯỜI PHÊ DUYỆT</b><i>(Ký, ghi rõ họ tên)</i>${VER && P ? esc(P.approver_name) : ''}</div></div><script>setTimeout(() => print(), 300)</` + `script></body></html>`); w.document.close(); };
  // 17/11/2026 (bản 2): BẢN KẾ HOẠCH DÒNG THU NĂM — mở thẳng giao diện kế hoạch để chỉnh (kỳ, ngày chốt công nợ, dự án, từng dòng); tạo mới / bản sao / phiên bản điều chỉnh ở trạng thái «Bản mới – Chưa lưu»;
  // thanh thao tác cố định: Lưu nháp · Lưu và trình duyệt (hộp khai báo chỉ mở ở bước lưu); Nháp vẫn sửa được, trình duyệt mới chốt số liệu + khóa; cảnh báo khi rời trang còn thay đổi chưa lưu
  const YPC = { nhap: '#64748b', cho_duyet: '#b45309', da_duyet: '#15803d', yeu_cau_sua: '#b91c1c', thay_the: '#64748b' };
  const ddL = x => { if (!x) return ''; const t = new Date(x); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  const dtL = x => x ? new Date(x).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const nEd = () => d ? d.items.filter(i => i.edited).length : 0;
  const setDirty = v => { dirty = v; ST.dirtyMsg = v ? 'Bản kế hoạch còn thay đổi chưa lưu — rời trang sẽ mất các thay đổi này. Vẫn rời trang?' : null; ST.dirtyHash = location.hash; drawBar(); };
  const drawBar = () => { const b = $('#apBar', main); if (!b) return; b.hidden = !EDIT; if (!EDIT) return; const n = nEd();
    b.innerHTML = `<div class="yp-bl"><span class="yp-st sm" style="--c:${P ? YPC[P.status] : '#b45309'}">${P ? esc(P.status_l) : 'Bản mới – Chưa lưu'}</span><b>${P ? `${esc(P.code)} · v${P.version}` : EDK === 'copy' ? `Bản sao của ${esc(SP.code)} v${SP.version}` : EDK === 'ver' ? `Phiên bản điều chỉnh của ${esc(SP.code)}` : 'Bản kế hoạch mới'}</b>
      <span class="${dirty ? 'yp-dt' : 'muted'}">${dirty ? '● Có thay đổi chưa lưu' : '✓ Đã lưu'}${n ? ` · ${n} dòng đã chỉnh` : ''}</span></div>
      <div class="yp-br"><button type="button" data-ypb="exit">Thoát</button><button type="button" data-ypb="refresh" title="Lấy lại số liệu từ nguồn theo kỳ / ngày chốt / dự án đang chọn">${ico('fa-rotate')} Cập nhật số liệu nguồn</button>${P && G?.can?.del ? `<button type="button" data-ypb="del">${ico('fa-trash')} Xóa nháp</button>` : ''}
      <button type="button" data-ypb="draft">${ico('fa-floppy-disk')} Lưu nháp</button><button type="button" class="ap-pri" data-ypb="submit">${ico('fa-paper-plane')} Lưu và trình duyệt</button></div>`; };
  const drawV = () => { const box = $('#apV', main); if (!box) return;
    if (!P) { box.innerHTML = `<div class="yp-hd"><div><div class="ap-eb">${EDK === 'ver' ? `${esc(SP.code)} · PHIÊN BẢN ĐIỀU CHỈNH` : EDK === 'copy' ? `BẢN SAO CỦA ${esc(SP.code)} · v${SP.version}` : 'BẢN KẾ HOẠCH MỚI'}</div><h3>${SP ? esc(SP.name) : 'Kế hoạch dòng thu năm'}</h3></div><span class="yp-st" style="--c:#b45309">Bản mới – Chưa lưu</span></div>
        <div class="yp-msg">${ico('fa-pen-to-square')} Chỉnh kỳ, ngày chốt công nợ, dự án ở bộ lọc bên dưới; bấm số tiền của căn để sửa / thêm / xóa dòng kế hoạch; thêm căn dự kiến bán bằng «+ Kế hoạch bán mới». ${SP ? `Nội dung kế thừa từ ${esc(SP.code)} v${SP.version}, chỉnh sửa độc lập — không ảnh hưởng bản gốc. ` : ''}Lưu bằng thanh thao tác cuối màn hình; mã kế hoạch, phiên bản, người lập, ngày lập do hệ thống ghi nhận.</div>`; return; }
    const c = G.can, fx = ['cho_duyet', 'da_duyet', 'thay_the'].includes(P.status), dec = ['da_duyet', 'thay_the'].includes(P.status);
    box.innerHTML = `<div class="yp-hd"><div><div class="ap-eb">${esc(P.code)} · PHIÊN BẢN ${P.version}</div><h3>${esc(P.name)}</h3></div><span class="yp-st" style="--c:${YPC[P.status]}">${esc(P.status_l)}</span><span class="grow"></span>
      <span class="yp-act">${[c.decide && `<button type="button" data-ypa="reject">${ico('fa-reply')} Yêu cầu chỉnh sửa</button>`, c.decide && `<button type="button" class="ap-pri" data-ypa="approve">${ico('fa-check')} Phê duyệt</button>`,
        c.newver && `<button type="button" data-ypa="newver">${ico('fa-code-branch')} Tạo phiên bản điều chỉnh</button>`, c.copy && `<button type="button" data-ypa="copy">${ico('fa-copy')} Tạo bản sao</button>`, `<button type="button" data-ypa="hist">${ico('fa-clock-rotate-left')} Lịch sử (${(P.hist || []).length})</button>`].filter(Boolean).join('')}</span></div>
      <div class="yp-g">${[['Mã kế hoạch', `${P.code} · v${P.version}`], ['Năm / kỳ kế hoạch', `${P.year} · ${dmy(P.from_on)} – ${dmy(P.to_on)}`], ['Dự án áp dụng', P.project_name], ['Ngày chốt công nợ', dmy(P.asof)], ['Người lập', P.created_name], ['Ngày lập', dtL(P.created_at)],
        ['Người duyệt', P.approver_name || '—'], [dec ? 'Ngày duyệt' : 'Ngày trình', dtL(dec ? P.decided_at : P.submitted_at) || '—'], ['Ghi chú', P.note || '—']].map(([l, v]) => `<div><span>${l}</span><b>${esc(v)}</b></div>`).join('')}</div>
      ${P.status === 'yeu_cau_sua' && P.decide_note ? `<div class="yp-msg r">${ico('fa-reply')} Yêu cầu chỉnh sửa — ${esc(P.decided_name)}, ${dtL(P.decided_at)}: <b>${esc(P.decide_note)}</b></div>` : ''}
      ${dec && P.decide_note ? `<div class="yp-msg g">${ico('fa-check')} Ý kiến phê duyệt — ${esc(P.decided_name)}: ${esc(P.decide_note)}</div>` : ''}
      <div class="yp-msg">${fx ? `${ico('fa-lock')} Số liệu cố định, chốt lúc ${dtL(d.frozen_at || d.saved_at || d.captured_at)} — thay đổi công nợ, chính sách, danh mục sản phẩm hoặc kế hoạch bán mới về sau không ghi đè bản này.${P.status === 'da_duyet' ? ' Muốn điều chỉnh: «Tạo phiên bản điều chỉnh» và trình duyệt lại.' : P.status === 'thay_the' ? ' Đã có phiên bản mới hơn được duyệt.' : ''}`
        : EDIT ? `${ico('fa-pen-to-square')} Bản «${esc(P.status_l)}» — sửa trực tiếp (bộ lọc kỳ / ngày chốt / dự án, từng dòng kế hoạch), lưu ở thanh thao tác cuối màn hình. Số liệu lưu lúc ${dtL(d.saved_at || d.captured_at)}. Khi trình duyệt, số liệu được chốt và khóa.` : `Bản «${esc(P.status_l)}» — chỉ người lập / trưởng phòng được sửa.`}</div>
      ${G.versions.length > 1 ? `<div class="yp-vs"><span>Các phiên bản:</span>${G.versions.map(v => `<button type="button" data-ypv="${v.id}" class="${v.id === P.id ? 'on' : ''}">v${v.version} · ${esc(v.status_l)}</button>`).join('')}</div>` : ''}`;
    // so sánh với thực thu — bản đã duyệt / đã thay thế; thực thu cập nhật riêng, không đổi số kế hoạch
    const A = $('#apCmp', main); A.hidden = !ACT; if (!ACT) return;
    const am = (k, m) => +(ACT.m[k]?.[m] || 0), pc = (a, p) => p ? (a / p * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%' : '–', sm = a => a.reduce((x, y) => x + y, 0);
    const rs = SRC.map(([k, l, col]) => ({ l, col, p: d.months.map(m => cell(k, m)), a: d.months.map(m => am(k, m)) }));
    rs.push({ l: 'Tổng cộng', tot: 1, p: d.months.map((_, i) => rs.reduce((x, r) => x + r.p[i], 0)), a: d.months.map((_, i) => rs.reduce((x, r) => x + r.a[i], 0)) });
    const z = v => `<td>${v ? ty(v) : '<span class="ap-z">–</span>'}</td>`;
    A.innerHTML = `<div class="ap-row"><h3>Thực hiện so với kế hoạch được duyệt</h3><span class="ap-sub">Tỷ đồng · Thực thu = phiếu thu hợp lệ của các căn trong kế hoạch, cập nhật đến ${dmy(ACT.to)} · không làm thay đổi số kế hoạch</span></div>
      <div class="ap-scroll"><table class="ap-t yp-cmp"><thead><tr><th class="c1">Nguồn thu</th><th class="c2"></th><th>Cả kỳ</th>${d.months.map(m => `<th>${ml(m)}</th>`).join('')}</tr></thead><tbody>
      ${rs.map(r => `<tr class="${r.tot ? 'tot' : 'yp-a'}"><td class="c1" rowspan="3">${r.col ? `<i class="yp-dot" style="background:${r.col}"></i>` : ''}<b>${esc(r.l)}</b></td><td class="c2">Kế hoạch</td><td><b>${ty(sm(r.p))}</b></td>${r.p.map(z).join('')}</tr>
        <tr class="${r.tot ? 'tot' : ''}"><td class="c2">Thực thu</td><td><b>${ty(sm(r.a))}</b></td>${r.a.map(z).join('')}</tr>
        <tr class="${r.tot ? 'tot' : ''} yp-pc"><td class="c2">% thực hiện</td><td><b>${pc(sm(r.a), sm(r.p))}</b></td>${r.p.map((v, j) => `<td>${v || r.a[j] ? pc(r.a[j], v) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; };
  // hộp khai báo ở bước lưu — Lưu nháp: tên + ghi chú; Lưu và trình duyệt: tên + người duyệt + ghi chú + tóm tắt số liệu; năm / kỳ, dự án, ngày chốt lấy từ bản đang chỉnh; Hủy → quay lại bản đang làm
  const saveDlg = async sub => { if (!d) return toast('Chưa có số liệu kế hoạch', true); if (!s.from || !s.to || s.from > s.to) return toast('Kỳ kế hoạch không hợp lệ: «Từ ngày» phải nhỏ hơn hoặc bằng «Đến ngày»', true);
    const L = await api('GET', '/api/year-plans?year=' + s.year); if (!L.can_c) return toast('Bạn không được lập kế hoạch thu', true);
    const xs = its(), pj = M.projects.find(p => p.code === s.project), sm = k => xs.filter(i => i.month && (!k || i.src === k)).reduce((a, i) => a + (+i.plan || 0), 0), ne = xs.filter(i => i.edited).length;
    const nm0 = P ? P.name : EDK === 'ver' ? SP.name : EDK === 'copy' ? `${SP.name} (bản sao)` : `Kế hoạch dòng thu năm ${s.year}${pj ? ' — ' + pj.name : ''}`, apr0 = String(P?.approver_id || SP?.approver_id || ''), note0 = P?.note || (EDK ? SP?.note || '' : '');
    const code = P ? `${P.code} · phiên bản ${P.version}` : EDK === 'ver' ? `${SP.code} · phiên bản mới (tự cấp)` : 'Tự cấp khi lưu · phiên bản 1';
    const m = modal({ wide: !!sub, title: sub ? `${ico('fa-paper-plane')} Lưu và trình duyệt kế hoạch` : `${ico('fa-floppy-disk')} Lưu nháp kế hoạch`, body: `<div class="yp-f">
      <div class="fld"><label>Mã kế hoạch</label><div class="yp-ro">${esc(code)}</div></div>
      <div class="fld"><label>Người lập · ngày lập</label><div class="yp-ro">${esc(P ? P.created_name : (M.me?.full_name || M.me?.name || ''))} · ${P ? dtL(P.created_at) : dmy(today())}</div></div>
      <div class="fld"><label>Năm / kỳ kế hoạch</label><div class="yp-ro">${s.year} · ${dmy(s.from)} – ${dmy(s.to)}</div></div>
      <div class="fld"><label>Dự án · ngày chốt công nợ</label><div class="yp-ro">${esc(pj?.name || 'Tất cả dự án')} · ${dmy(s.asof)}</div></div>
      <div class="fld yp-w"><label>Tên kế hoạch<span class="req">*</span></label><input class="inp" id="ypN" autocomplete="off" value="${esc(nm0)}"></div>
      ${sub ? `<div class="fld"><label>Người duyệt<span class="req">*</span></label><select class="inp" id="ypR"><option value="">— Chọn người duyệt —</option>${L.approvers.map(([i, n]) => `<option value="${i}" ${apr0 === String(i) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : ''}
      <div class="fld ${sub ? '' : 'yp-w'}"><label>Ghi chú</label><input class="inp" id="ypO" autocomplete="off" value="${esc(note0)}"></div></div>
      ${sub ? `<div class="yp-pv"><div class="yp-pvh">Tóm tắt số liệu trình duyệt</div><div class="yp-pvg">${[['Tổng kế hoạch trong kỳ', fm(sm())], ['Thu công nợ còn lại', fm(sm('cn'))], ['Thu bán mới', fm(sm('moi'))], ['Thu cho thuê', fm(sm('thue'))], ['Chưa phân bổ kỳ', fm(sum(xs.filter(isUn)))], ['Số căn · dòng đã chỉnh', `${new Set(xs.map(i => i.src + '|' + (i.unit_id || i.grp || i.unit))).size} · ${ne}`]].map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join('')}</div></div>
        <div class="yp-msg">${ico('fa-lock')} Sau khi trình: chốt toàn bộ số liệu tại thời điểm trình, chuyển «Chờ duyệt» và khóa chỉnh sửa bản này.</div>` : '<div class="yp-msg">Bản nháp vẫn được sửa và cập nhật lại số liệu nguồn sau khi lưu. Không bắt buộc chọn người duyệt.</div>'}`,
      foot: `<button class="btn" data-x>Hủy — quay lại bản đang làm</button><button class="btn pri" id="ypOk">${sub ? `${ico('fa-paper-plane')} Xác nhận trình duyệt` : `${ico('fa-floppy-disk')} Lưu nháp`}</button>` });
    $('#ypOk', m.el).onclick = run(async () => { const name = $('#ypN', m.el).value.trim(); if (!name) return toast('Nhập tên kế hoạch', true); const apr = sub ? $('#ypR', m.el).value : (P?.approver_id || null); if (sub && !apr) return toast('Chọn người duyệt', true);
      const cu = new Set(xs.filter(i => i.src === 'cn').map(i => String(i.unit_id)));
      const x = await api('POST', '/api/year-plans', { ...(P ? { id: P.id } : { kind: EDK || 'new', base_id: SRCID || null }), name, note: $('#ypO', m.el).value.trim(), approver_id: apr || null, submit: sub,
        year: s.year, from: s.from, to: s.to, project_id: pj?.id || null, asof: s.asof,
        data: { months: d.months, from: s.from, to: s.to, asof: s.asof, items: xs, total_left: Object.fromEntries(Object.entries(d.total_left || {}).filter(([k]) => cu.has(String(k)))), captured_at: d.captured_at || null } });
      setDirty(false); m.close(); toast(`${x.msg}. Đã đưa vào «Danh sách bản kế hoạch».`);
      if (P && +x.id === P.id) return V.planyear(main, { ver: x.id }); location.hash = '#/v/planyear?ver=' + x.id; }); };
  // sửa dòng kế hoạch của 1 căn (chỉ trong bản đang lập — không đổi dữ liệu nguồn): tháng kế hoạch, tiền kế hoạch, xóa / thêm dòng
  const editLeaf = leaf => { const xs = d.items.filter(i => keyU(i) === leaf && (!full || !s.project || i.project === s.project)), x0 = xs[0]; if (!x0) return;
    const rows = xs.map(i => ({ i, month: i.month || '', plan: Math.round(+i.plan || 0), del: false })), add = [];
    const mo = v => `<option value="" ${!v ? 'selected' : ''}>Không xếp tháng</option>` + d.months.map(x => `<option value="${x}" ${x === v ? 'selected' : ''}>${x.slice(5)}/${x.slice(0, 4)}</option>`).join('');
    const zl = i => i.zone === 'out' ? 'Ngoài kỳ' : i.zone === 'carry' ? 'Công nợ chuyển sang' : 'Chưa phân bổ kỳ';
    const m2 = modal({ wide: true, title: `Chỉnh dòng kế hoạch — ${esc(x0.unit)} · ${esc(SRC.find(z => z[0] === x0.src)[1])}`, body: `<div class="small muted mb">${esc(x0.customer || '')}${x0.project ? ' · Dự án ' + esc(x0.project) : ''}${x0.building ? ' · Tòa ' + esc(x0.building) : ''} — sửa tháng / tiền kế hoạch, xóa hoặc thêm dòng; chỉ áp dụng cho bản đang lập, không đổi dữ liệu nguồn.</div>
      <div class="tbl-wrap"><table class="t compact noclick yp-el"><thead><tr><th>Hợp đồng</th><th>Đợt / kỳ thu</th><th>Ngày đến hạn</th><th style="width:150px">Tháng kế hoạch</th><th class="num" style="width:170px">Tiền kế hoạch</th><th class="num">Thực thu</th><th>Ghi chú</th><th></th></tr></thead><tbody id="elT"></tbody></table></div>
      <button type="button" class="btn sm mt" id="elAdd">${ico('fa-plus')} Thêm dòng</button><div class="yp-ss" id="elS"></div>`, foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="elOk">${ico('fa-check')} Áp dụng vào bản kế hoạch</button>` });
    const all = () => [...rows.map((r, k) => ({ r, k, n: 0 })), ...add.map((r, k) => ({ r, k, n: 1 }))];
    const sumS = () => { const lv = [...rows.filter(r => !r.del), ...add]; $('#elS', m2.el).innerHTML = `Trong kỳ: <b>${fm(lv.filter(r => r.month).reduce((a, r) => a + r.plan, 0))}</b> · Không xếp tháng: <b>${fm(lv.filter(r => !r.month).reduce((a, r) => a + r.plan, 0))}</b>`; };
    const dr = () => { $('#elT', m2.el).innerHTML = all().map(({ r, k, n }) => `<tr data-k="${k}" data-n="${n}" class="${r.del ? 'yp-del' : ''}"><td>${n ? '<i class="muted">Dòng mới</i>' : esc(r.i.contract || '')}</td><td>${n ? `<input class="inp" data-f="label" value="${esc(r.label)}" placeholder="Nội dung dòng kế hoạch">` : esc(r.i.label)}</td><td>${!n && r.i.due_on ? dmy(r.i.due_on) : '—'}</td>
        <td><select class="inp" data-f="month" ${r.del ? 'disabled' : ''}>${mo(r.month)}</select></td><td><input class="inp n" data-f="plan" inputmode="numeric" value="${r.plan ? moneyStr(r.plan) : ''}" ${r.del ? 'disabled' : ''}></td><td class="num">${n ? '—' : fm(r.i.act)}</td>
        <td class="small">${!n && r.i.edited ? '<span class="yp-ed">đã chỉnh</span> ' : ''}${!n && !r.month ? zl(r.i) : ''}${r.del ? ' <b class="neg">sẽ xóa</b>' : ''}</td><td><button type="button" class="btn sm ghost" data-f="del" title="${r.del ? 'Khôi phục dòng' : 'Xóa dòng'}">${ico(r.del ? 'fa-rotate-left' : 'fa-trash')}</button></td></tr>`).join(''); sumS(); };
    dr();
    const RR = tr => tr.dataset.n === '1' ? add[+tr.dataset.k] : rows[+tr.dataset.k];
    m2.el.addEventListener('input', e => { const tr = e.target.closest('tr[data-k]'); if (!tr) return; const r = RR(tr), f = e.target.dataset.f;
      if (f === 'plan') { r.plan = num(e.target.value, true) || 0; e.target.value = r.plan ? moneyStr(r.plan) : ''; } if (f === 'label') r.label = e.target.value; sumS(); });
    m2.el.addEventListener('change', e => { const tr = e.target.closest('tr[data-k]'); if (tr && e.target.dataset.f === 'month') { RR(tr).month = e.target.value; sumS(); } });
    m2.el.addEventListener('click', e => { const dl = e.target.closest('[data-f=del]'); if (dl) { const tr = dl.closest('tr'); if (tr.dataset.n === '1') add.splice(+tr.dataset.k, 1); else rows[+tr.dataset.k].del = !rows[+tr.dataset.k].del; return dr(); }
      if (e.target.closest('#elAdd')) { add.push({ label: '', month: d.months.includes(s.month) ? s.month : d.months[0], plan: 0 }); return dr(); }
      if (e.target.closest('#elOk')) { let n = 0;
        for (const r of rows) { const i = r.i; if (r.del) { d.items.splice(d.items.indexOf(i), 1); d.dels = (d.dels || 0) + 1; n++; continue; }
          if (r.month !== (i.month || '') || r.plan !== Math.round(+i.plan || 0)) { i.orig ||= { month: i.month, plan: i.plan, zone: i.zone }; i.month = r.month || null; i.zone = r.month ? 'in' : i.orig.zone && i.orig.zone !== 'in' ? i.orig.zone : 'nodate';
            i.plan = r.plan; i.rem = i.src === 'moi' ? Math.max(0, r.plan - (+i.act || 0)) : r.plan; i.edited = true; n++; } }
        for (const r of add) if (r.plan > 0) { d.items.push({ src: x0.src, project: x0.project, building: x0.building, unit: x0.unit, unit_id: x0.unit_id, customer: x0.customer, grp: x0.grp, contract: x0.contract || '', label: (r.label || '').trim() || 'Dòng kế hoạch bổ sung',
          month: r.month || null, zone: r.month ? 'in' : 'nodate', due_on: null, week_l: '', plan: r.plan, act: 0, rem: r.plan, st: 'Bổ sung khi lập kế hoạch', carry_src: '', edited: true, added: true }); n++; }
        m2.close(); if (n) { setDirty(true); draw(); toast(`Đã áp dụng ${n} thay đổi vào bản kế hoạch (chưa lưu)`); } } }); };
  const ypBar = async a => {
    if (a === 'exit') { location.hash = P ? '#/v/planyear' : '#/v/planyear'; return; }
    if (a === 'refresh') { if (!await ask('Cập nhật số liệu nguồn', `Lấy lại số liệu từ nguồn theo kỳ ${dmy(s.from)} – ${dmy(s.to)}, ngày chốt công nợ ${dmy(s.asof)}${s.project ? ', dự án ' + s.project : ''}?${nEd() ? ` ${nEd()} dòng đã chỉnh sẽ mất.` : ''}`)) return; setDirty(true); return load('src'); }
    if (a === 'del') { if (!await ask('Xóa bản nháp', `Xóa bản nháp ${P.code} v${P.version}?`)) return; const x = await api('DELETE', '/api/year-plans/' + P.id); setDirty(false); toast(x.msg); location.hash = '#/v/planyear'; return; }
    if (a === 'draft' || a === 'submit') return saveDlg(a === 'submit'); };
  const ypAct = async a => {
    if (a === 'newver') { location.hash = '#/v/planyear?edit=ver&src=' + P.id; return; }
    if (a === 'copy') { location.hash = '#/v/planyear?edit=copy&src=' + P.id; return; }
    if (a === 'approve' || a === 'reject') { const ok = a === 'approve';
      const m = modal({ narrow: true, title: `${ok ? 'Phê duyệt' : 'Yêu cầu chỉnh sửa'} — ${esc(P.code)} v${P.version}`, body: `<div class="small muted mb">${ok ? 'Bản kế hoạch trở thành kế hoạch chính thức để theo dõi thực hiện.' : 'Bản kế hoạch trả về người lập để sửa, cập nhật và trình lại.'}</div>
        <div class="fld"><label>Ý kiến xử lý${ok ? '' : '<span class="req">*</span>'}</label><textarea class="inp" id="ypC" rows="3"></textarea></div>`, foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="ypOk">${ok ? `${ico('fa-check')} Phê duyệt` : `${ico('fa-reply')} Gửi yêu cầu chỉnh sửa`}</button>` });
      $('#ypOk', m.el).onclick = run(async () => { const cm = $('#ypC', m.el).value.trim(); if (!ok && !cm) return toast('Nhập ý kiến yêu cầu chỉnh sửa', true); const x = await api('POST', `/api/year-plans/${P.id}/decide`, { ok, comment: cm }); toast(x.msg); m.close(); return V.planyear(main, { ver: P.id }); }); return; }
    if (a === 'hist') modal({ wide: true, title: `Lịch sử xử lý — ${esc(P.code)} · v${P.version}`, body: `<div class="tbl-wrap"><table class="t compact noclick"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Ý kiến / ghi chú</th></tr></thead><tbody>
      ${[...(P.hist || [])].reverse().map(h => `<tr><td>${dtL(h.at)}</td><td>${esc(h.by_name || '')}</td><td><b>${esc(h.act)}</b></td><td>${esc(h.note || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Chưa có</td></tr>'}</tbody></table></div>` }); };
  // danh sách bản kế hoạch: tab Tất cả | Nháp | Chờ duyệt | Đã duyệt | Yêu cầu chỉnh sửa (kèm số lượng), lọc năm;
  // tab Đã duyệt: Mã · Tên · Năm/kỳ · Dự án · Phiên bản · Tổng kế hoạch thu · Người duyệt · Ngày duyệt · Thao tác (Xem · Excel · In/PDF · Tạo phiên bản điều chỉnh)
  const ypListDlg = async (tab0) => { const f = { year: String(VER && P ? P.year : s.year), tab: tab0 || ST.ypTab || '' };
    const TABS = [['', 'Tất cả'], ['nhap', 'Nháp'], ['cho_duyet', 'Chờ duyệt'], ['da_duyet', 'Đã duyệt'], ['yeu_cau_sua', 'Yêu cầu chỉnh sửa']];
    const m = modal({ title: `${ico('fa-folder-open')} Danh sách bản kế hoạch dòng thu năm`, wide: true, body: `<div class="yp-lf"><div class="yp-tabs" id="ylTb"></div><span class="grow"></span><label>Năm<select class="inp" id="ylY"></select></label>
      <button type="button" class="btn pri sm" id="ylNew">${ico('fa-file-circle-plus')} Tạo bản kế hoạch</button></div><div class="tbl-wrap" id="ylT"></div>` });
    m.el.querySelector('.modal').classList.add('yp-lm'); let rows = [];
    const draw = () => { ST.ypTab = f.tab; const t0 = +today().slice(0, 4);
      $('#ylY', m.el).innerHTML = '<option value="">Tất cả năm</option>' + [...new Set([t0 - 1, t0, t0 + 1, t0 + 2, ...rows.map(r => +r.year), ...(f.year ? [+f.year] : [])])].sort().map(y => `<option value="${y}" ${f.year === String(y) ? 'selected' : ''}>${y}</option>`).join('');
      const inY = rows.filter(r => !f.year || String(r.year) === f.year), cnt = k => inY.filter(r => !k || r.status === k).length;
      $('#ylTb', m.el).innerHTML = TABS.map(([k, l]) => `<button type="button" data-yltab="${k}" class="${f.tab === k ? 'on' : ''}">${l} <span>${cnt(k)}</span></button>`).join('');
      const xs = inY.filter(r => !f.tab || r.status === f.tab), ap = f.tab === 'da_duyet';
      const act = x => `<span class="yp-ops"><button type="button" class="btn sm" data-ylv="${x.id}">${ico('fa-eye')} Xem</button>${['da_duyet', 'thay_the'].includes(x.status) ? `<button type="button" class="btn sm ghost" data-ylx="xlsx" data-id="${x.id}" title="Xuất Excel bản đã duyệt">${ico('fa-file-excel')} Excel</button><button type="button" class="btn sm ghost" data-ylx="pdf" data-id="${x.id}" title="In / PDF bản đã duyệt">${ico('fa-print')} In/PDF</button>` : ''}${x.status === 'da_duyet' && x.version === x.last_ver ? `<button type="button" class="btn sm ghost" data-ylnv="${x.id}" title="Tạo phiên bản điều chỉnh từ bản này">${ico('fa-code-branch')} Phiên bản điều chỉnh</button>` : ''}<button type="button" class="btn sm ghost" data-ylcp="${x.id}" title="Tạo bản sao (mã mới, chỉnh sửa độc lập)">${ico('fa-copy')} Bản sao</button></span>`;
      const per = x => `${x.year} · ${dmy(x.from_on)} – ${dmy(x.to_on)}`;
      $('#ylT', m.el).innerHTML = !xs.length ? `<div class="empty">Không có bản kế hoạch${f.tab ? ' «' + TABS.find(t => t[0] === f.tab)[1] + '»' : ''}${f.year ? ' năm ' + f.year : ''}</div>`
        : ap ? `<table class="t compact noclick"><thead><tr><th>Mã kế hoạch</th><th>Tên kế hoạch</th><th>Năm / kỳ</th><th>Dự án</th><th>Phiên bản</th><th class="num">Tổng kế hoạch thu</th><th>Người duyệt</th><th>Ngày duyệt</th><th>Thao tác</th></tr></thead><tbody>
          ${xs.map(x => `<tr><td><b>${esc(x.code)}</b></td><td>${esc(x.name)} <span class="yp-st sm" style="--c:${YPC.da_duyet}">Đã duyệt</span></td><td>${per(x)}</td><td>${esc(x.project_name || 'Tất cả dự án')}</td><td>v${x.version}</td><td class="num"><b>${fm(x.totals?.all || 0)}</b></td><td>${esc(x.approver_name || '—')}</td><td>${dtL(x.decided_at)}</td><td>${act(x)}</td></tr>`).join('')}</tbody></table>`
        : `<table class="t compact noclick"><thead><tr><th>Mã kế hoạch</th><th>Phiên bản</th><th>Tên kế hoạch</th><th>Năm / kỳ</th><th>Dự án</th><th>Chốt công nợ</th><th class="num">Tổng kế hoạch thu</th><th>Trạng thái</th><th>Người lập</th><th>Người duyệt</th><th>Thao tác</th></tr></thead><tbody>
          ${xs.map(x => `<tr><td><b>${esc(x.code)}</b></td><td>v${x.version}${x.last_ver > 1 && x.version === x.last_ver ? ' <span class="small muted">mới nhất</span>' : ''}</td><td>${esc(x.name)}${x.status === 'yeu_cau_sua' && x.decide_note ? `<div class="small neg">Ý kiến: ${esc(x.decide_note)}</div>` : ''}</td><td>${per(x)}</td><td>${esc(x.project_name || 'Tất cả dự án')}</td><td>${dmy(x.asof)}</td>
            <td class="num">${fm(x.totals?.all || 0)}</td><td><span class="yp-st sm" style="--c:${YPC[x.status]}">${esc(x.status_l)}</span></td><td>${esc(x.created_name || '')}<div class="small muted">${dtL(x.created_at)}</div></td><td>${esc(x.approver_name || '—')}${x.decided_at ? `<div class="small muted">${dtL(x.decided_at)}</div>` : ''}</td><td>${act(x)}</td></tr>`).join('')}</tbody></table>`; };
    const dl = async () => { rows = (await api('GET', '/api/year-plans')).rows; draw(); };
    m.el.addEventListener('change', e => { if (e.target.id === 'ylY') { f.year = e.target.value; draw(); } });
    m.el.addEventListener('click', run(async e => { const tb = e.target.closest('[data-yltab]'); if (tb) { f.tab = tb.dataset.yltab; return draw(); }
      if (e.target.closest('#ylNew')) { m.close(); location.hash = '#/v/planyear?edit=new'; return; }
      const cp = e.target.closest('[data-ylcp]'); if (cp) { m.close(); location.hash = '#/v/planyear?edit=copy&src=' + cp.dataset.ylcp; return; }
      const v = e.target.closest('[data-ylv]'); if (v) { m.close(); location.hash = '#/v/planyear?ver=' + v.dataset.ylv; return; }
      const x = e.target.closest('[data-ylx]'); if (x) { if (x.dataset.ylx === 'pdf') { ST.ypPw = window.open('', '_blank'); if (ST.ypPw) ST.ypPw.document.write('<p style="font:14px Arial">Đang chuẩn bị bản in…</p>'); }
        m.close(); ST.ypDo = x.dataset.ylx; if (+x.dataset.id === VER) return ypDoIt(); location.hash = '#/v/planyear?ver=' + x.dataset.id; return; }
      const nv = e.target.closest('[data-ylnv]'); if (nv) { m.close(); location.hash = '#/v/planyear?edit=ver&src=' + nv.dataset.ylnv; } }));
    await dl(); };
  // thao tác chờ từ danh sách (xuất Excel / in PDF bản đã duyệt) — chạy sau khi bản đã tải
  const ypDoIt = () => { const k = ST.ypDo; ST.ypDo = null; if (k && d) exp(k, false); };
  main.addEventListener('click', run(async e => {
    if (e.target.closest('[data-apre]')) { e.preventDefault(); return load(); }
    if (!d && e.target.closest('[data-apx], #apX, [data-apm], [data-apleaf], #apU')) return toast('Chưa có số liệu cho khoảng thời gian đang chọn', true);
    if (e.target.closest('#apX')) { const mn = $('.ap-menu', main); mn.hidden = !mn.hidden; return; }
    const x = e.target.closest('[data-apx]'); if (x) { $('.ap-menu', main).hidden = true; return exp(x.dataset.apx, x.dataset.apdet === '1'); }
    const tg = e.target.closest('[data-aptg]'); if (tg) { s.shut[tg.dataset.aptg] = !s.shut[tg.dataset.aptg]; return draw(); }
    const al = e.target.closest('[data-apall]'); if (al) { s.shut = {}; if (al.dataset.apall === '0') for (const r of hier()) if (r.lv >= 0 && r.lv <= 2) s.shut[r.key] = true; return draw(); }
    const lf = e.target.closest('[data-apleaf]'); if (lf) return EDIT ? editLeaf(lf.dataset.apleaf) : leafDlg(lf.dataset.apleaf, lf.dataset.apmm);
    if (e.target.closest('#apList')) return ypListDlg();
    if (e.target.closest('#apBack')) { location.hash = '#/v/planyear'; return; }
    if (e.target.closest('#apSv, #apSv2')) { e.preventDefault(); location.hash = '#/v/planyear?edit=new'; return; }
    const yb = e.target.closest('[data-ypb]'); if (yb) return ypBar(yb.dataset.ypb);
    const ya = e.target.closest('[data-ypa]'); if (ya) return ypAct(ya.dataset.ypa);
    const yv = e.target.closest('[data-ypv]'); if (yv) { location.hash = '#/v/planyear?ver=' + yv.dataset.ypv; return; }
    if (e.target.closest('#apNew') && EDIT) return saleUnitDlg(async () => { if (!full || nEd()) { if (!await ask('Đưa kế hoạch bán mới vào bản đang lập', `Kế hoạch bán mới đã lưu. Lấy lại số liệu nguồn để đưa vào bản đang lập?${nEd() ? ` ${nEd()} dòng đã chỉnh sẽ mất.` : ''}${!full ? ' Số liệu hiện có của bản sẽ được thay bằng số liệu nguồn.' : ''} (Chọn Hủy: giữ nguyên, có thể bấm «Cập nhật số liệu nguồn» sau.)`)) return; } setDirty(true); await load('src'); }, { project: M.projects.find(p => p.code === s.project)?.id || '' });
    if (e.target.closest('#apNew')) return saleUnitDlg(load, { project: M.projects.find(p => p.code === s.project)?.id || '' });
    if (e.target.closest('#apU')) { e.preventDefault(); s.month = ''; s.src = ''; detail(); return $('#apD', main).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    const sc = e.target.closest('[data-apsrc]'); if (sc) { e.preventDefault(); s.src = s.src === sc.dataset.apsrc ? '' : sc.dataset.apsrc; return detail(); }
    const wk = e.target.closest('[data-apweek]'); if (wk) { e.preventDefault(); const r = ST.planrep ||= { by: 'thang', ym: wk.dataset.apweek, week: '', project: '', building: '', from: '', to: '', shut: {} }; Object.assign(r, { by: 'thang', ym: wk.dataset.apweek, week: '', project: M.projects.find(p => p.code === s.project)?.id || '', building: '' }); location.hash = '#/e/collect_plan'; return; }
    const sl = e.target.closest('[data-apsel]'); if (sl) return selDlg(+sl.dataset.apsel, sl.dataset.aptab, +sl.dataset.apamt);
    const mm = e.target.closest('[data-apm]'); if (mm) { s.month = mm.dataset.apm; s.src = mm.dataset.aps || ''; draw(); return $('#apD', main).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (!e.target.closest('.ap-dd')) $('.ap-menu', main).hidden = true;
  }));
  // đổi kỳ / ngày chốt / năm / dự án — báo cáo trực tiếp: tính lại; bản đang chỉnh: lấy lại số liệu nguồn (hỏi trước nếu đã chỉnh dòng / đang dùng số liệu kế thừa — Hủy thì giữ nguyên)
  const reSrc = async (what, revert) => { if (EDIT && d && (!full || nEd())) { if (!await ask('Lấy lại số liệu nguồn', `Đổi ${what} sẽ lấy lại số liệu từ nguồn theo lựa chọn mới${!full ? ' (thay số liệu đang có của bản này)' : ''}${nEd() ? `; ${nEd()} dòng đã chỉnh sẽ mất` : ''}. Tiếp tục?`)) { revert(); return; } }
    if (EDIT) setDirty(true); await load(EDIT ? 'src' : undefined); };
  main.addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (v === null) return; const k = { apF: 'from', apT2: 'to', apA: 'asof' }[e.target.id]; if (!k) return; const old = s[k];
    s[k] = v || (k === 'from' ? `${s.year}-01-01` : k === 'to' ? `${s.year}-12-31` : today()); if (s[k] === old) return;
    await reSrc(k === 'asof' ? 'ngày chốt công nợ' : 'kỳ kế hoạch', () => { s[k] = old; segSet(e.target, old); }); }));
  main.addEventListener('change', run(async e => { if (e.target.id === 'apY') { const o = { year: s.year, from: s.from, to: s.to }; s.year = +e.target.value; s.from = `${s.year}-01-01`; s.to = `${s.year}-12-31`; segSet($('#apF', main), s.from); segSet($('#apT2', main), s.to);
      return reSrc('năm kế hoạch', () => { Object.assign(s, o); e.target.value = o.year; segSet($('#apF', main), o.from); segSet($('#apT2', main), o.to); }); }
    if (e.target.id === 'apP') { const o = s.project; s.project = e.target.value; if (full) { if (EDIT) setDirty(true); if (d) draw(); return; } return reSrc('dự án', () => { s.project = o; e.target.value = o; }); } }));
  try { await load(); } catch (er) { $('#apD', main).innerHTML = `<div class="ap-empty">${esc(er.message)}</div>`; }
};
V.unitstatus = async main => {
  const f = filt(), s = ST.unitstatus2 ||= { grp: '', q: '', open: null };
  let d = { rows: [], groups: [], flow: [], labels: {} };
  const tag = (t, k = 'default') => `<span class="ad-tag ad-tag-${k}">${t}</span>`;
  const short = k => (d.labels[k] || '').split(' · ')[0];
  const shown = () => { const q = s.q.trim().toLowerCase(); return d.rows.filter(r => (!s.grp || (s.grp === 'warn' ? r.warns.length : r.grp === s.grp)) && (!q || [r.unit, r.customer, r.phone, ...r.contracts.map(c => c.number)].some(x => String(x || '').toLowerCase().includes(q)))); };
  const vayCell = r => { const out = [];
    if (r.bank) out.push(r.bank.st === 'co_vay' ? `<b>${esc(r.bank.bank || 'Vay ngân hàng')}</b><small>${esc(r.bank.doc3_l || 'có vay')}</small>` : '<span class="ad-muted">Không vay NH</span>');
    if (r.vay) out.push(`<b>HĐ vay</b> ${fmS(r.vay.goc_nhan)}/${fmS(r.vay.goc)}<small>đáo hạn ${dmy(r.vay.exp_on)}</small>`);
    return out.join('<div class="us-sep"></div>') || '<span class="ad-muted">chưa ghi</span>'; };
  const grpCell = r => `${tag(esc(short(r.grp)), DG_TAG[r.grp])}${r.manual ? `<small class="us-man" title="${esc(r.manual.reason)} — ${esc(r.manual.by_l)} ${dmy(String(r.manual.at).slice(0, 10))}">${ico('fa-pen')} chỉnh tay (tự động: ${esc(short(r.auto))})</small>` : ''}`;   // 11/11/2026: bỏ «tự động», «Nợ khó đòi» dưới nhãn nhóm (Tâm: rối mắt)
  const warnCell = r => r.warns.filter(w => w[2] !== 'qh').length ? r.warns.filter(w => w[2] !== 'qh').map(([k, t]) => `<div class="us-w us-w-${k}">${ico(k === 'r' ? 'fa-circle-exclamation' : k === 'a' ? 'fa-triangle-exclamation' : 'fa-circle-info')} ${esc(t)}</div>`).join('') : '<span class="ad-muted">—</span>';
  const detail = r => `<tr class="us-det"><td colspan="14"><div class="us-det-in">
      <div class="us-box"><div class="us-box-t">${ico('fa-file-contract')} Hợp đồng trên căn</div>${r.contracts.map(c => `<div class="us-ct"><a href="#/v/ctdebt?id=${c.id}"><b>${esc(c.kind_l)} ${esc(c.number || '')}</b></a>
          <div class="us-kv"><span>Phải thu</span><b>${fm(c.total)}</b><span>Đã thu</span><b>${fm(c.paid)}</b><span>Còn lại</span><b>${fm(c.left)}</b>${c.overdue ? `<span>Quá hạn</span><b class="ad-c-error">${fm(c.overdue)} · ${c.days} ngày</b>` : ''}${c.next_on ? `<span>Đợt tới</span><b>${fm(c.next_amt)} · ${dmy(c.next_on)}</b>` : ''}</div></div>`).join('')}</div>
      <div class="us-box"><div class="us-box-t">${ico('fa-building-columns')} Khách vay vốn thế nào</div>
        ${r.bank ? `<div class="us-kv"><span>Vay ngân hàng</span><b>${esc(r.bank.st_l)}</b>${r.bank.st === 'co_vay' ? `<span>Ngân hàng</span><b>${esc(r.bank.bank || '—')}</b><span>Chứng từ 3 bên</span><b>${esc(r.bank.doc3_l || '—')}</b>` : ''}</div>` : '<div class="ad-muted">HĐMB chưa ghi tình trạng vay vốn</div>'}
        ${r.vay ? `<div class="us-sep"></div><div class="us-kv"><span>HĐ vay (công ty vay của khách)</span><b><a href="#/v/ctdebt?id=${r.vay.id}">${esc(r.vay.number || '')}</a></b><span>Gốc theo HĐ</span><b>${fm(r.vay.goc)}</b><span>Khách đã chuyển</span><b>${fm(r.vay.goc_nhan)}</b><span>Gốc khách chưa chuyển</span><b>${fm(r.vay.goc_cho)}</b><span>Lãi</span><b>${esc(r.vay.rate_l)}</b><span>Lãi còn phải trả khách</span><b>${fm(r.vay.lai_con)}${r.vay.lai_qh ? ` <span class="ad-c-error">(quá hạn ${fm(r.vay.lai_qh)})</span>` : ''}</b><span>Đáo hạn</span><b>${dmy(r.vay.exp_on) || '—'}</b></div>` : ''}</div>
      <div class="us-box"><div class="us-box-t">${ico('fa-phone-volume')} Nhắc nợ &amp; phân loại</div>
        ${r.call ? `<div class="us-kv"><span>Lần gọi gần nhất</span><b>${dmy(r.call.at)} · ${esc(r.call.result_l)}</b>${r.call.promise ? `<span>Cam kết</span><b>${esc(r.call.promise)}${r.call.promise_st ? ` · ${esc(r.call.promise_st)}` : ''}</b>` : ''}</div><div class="us-note">${esc(r.call.content)}</div>` : '<div class="ad-muted">Chưa ghi lần nhắc nợ nào</div>'}
        <div class="us-sep"></div><div class="us-kv"><span>Nhóm nợ</span><b>${esc(d.labels[r.grp])}</b>${r.manual ? `<span>Lý do chỉnh tay</span><b>${esc(r.manual.reason)}</b>` : ''}<span>Kế hoạch thu tháng này</span><b>${r.plan_m ? fm(r.plan_m) : '<span class="ad-c-error">chưa lập</span>'}</b></div>
        ${r.hist.length ? `<div class="us-hist">${r.hist.map(h => `<div>${dmy(String(h.at).slice(0, 10))} · ${esc(h.by_l)}: ${h.from === 'auto' ? 'tự động' : esc(short(h.from))} → ${h.to === 'auto' ? 'tự động' : esc(short(h.to))} — ${esc(h.reason)}</div>`).join('')}</div>` : ''}</div>
    </div><div class="us-acts"><a class="ad-btn" href="#/v/ctdebt?id=${r.contract_id}">${ico('fa-magnifying-glass-dollar')} Công nợ chi tiết</a>
      ${d.can_class ? `<button class="ad-btn" data-call="${r.contract_id}">${ico('fa-phone')} Ghi nhắc nợ</button><button class="ad-btn" data-cls="${r.unit_id}">${ico('fa-tags')} Cập nhật nhóm nợ</button>` : ''}
      ${d.can_plan && !r.plan_n ? `<button class="ad-btn ad-btn-primary" data-plan1="${r.contract_id}">${ico('fa-calendar-plus')} Lập kế hoạch thu căn này</button>` : ''}</div></td></tr>`;
  const charts = () => {
    const G = d.groups, nAll = G.reduce((a, g) => a + g.n, 0) || 1, C = 2 * Math.PI * 54; let off = 0;
    const arcs = G.filter(g => g.n).map(g => { const L = g.n / nAll * C, x = `<circle r="54" cx="70" cy="70" fill="none" stroke="${DG_COL[g.k]}" stroke-width="22" stroke-dasharray="${L} ${C - L}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(g.l)}: ${g.n} căn</title></circle>`; off += L; return x; }).join('');
    const od = G.reduce((a, g) => a + g.overdue, 0);
    const donut = `<div class="us-donut"><svg viewBox="0 0 140 140" width="168" height="168" role="img" aria-label="Phân loại nợ theo số căn">${arcs}<text x="70" y="66" text-anchor="middle" class="us-dn-v">${nAll}</text><text x="70" y="84" text-anchor="middle" class="us-dn-l">căn</text></svg>
      <div class="us-leg">${G.map(g => `<button class="us-leg-i ${s.grp === g.k ? 'on' : ''}" data-grp="${g.k}"><i style="background:${DG_COL[g.k]}"></i><span>${esc(g.l)}</span><b>${g.n} căn</b><em>${g.overdue ? fmS(g.overdue) : '—'}</em></button>`).join('')}
        <div class="us-leg-f">Tổng nợ quá hạn <b>${fm(od)}</b></div></div></div>`;
    const top = d.rows.filter(r => r.overdue > 0).sort((a, b) => b.overdue - a.overdue).slice(0, 8), mx = top[0]?.overdue || 1;
    const bars = top.length ? top.map(r => `<button class="us-bar" data-unit="${r.unit_id}" title="${esc(r.customer)} — ${fm(r.overdue)} · ${r.days} ngày"><span class="us-bar-l"><b>${esc(r.unit)}</b><small>${esc(r.customer)}</small></span><span class="us-bar-t"><i style="width:${Math.max(3, r.overdue / mx * 100)}%;background:${DG_COL[r.grp]}"></i></span><span class="us-bar-v">${fmS(r.overdue)}<small>${r.days} ngày</small></span></button>`).join('') : '<div class="ad-empty">Không có căn nào quá hạn</div>';
    const flow = flowChart(d.flow);
    return { donut, bars, flow };
  };
  const draw = () => {
    const R = d.rows, sum = k => R.reduce((a, r) => a + (+r[k] || 0), 0), due = sum('due'), paid = sum('paid'), od = sum('overdue'), kd = d.groups.find(g => g.k === 'n5') || { n: 0, overdue: 0 };
    const pct = due ? Math.min(100, Math.round(paid / due * 100)) : 0, ch = charts(), m = d.month || today().slice(0, 7), mL = `${m.slice(5)}/${m.slice(0, 4)}`;
    const stat = (t, v, foot, cls = '') => `<div class="ad-stat ${cls}"><div class="ad-stat-t">${t}</div><div class="ad-stat-v">${v}</div><div class="ad-stat-f">${foot}</div></div>`;
    $('#usBody', main).innerHTML = `
      <div class="ad-card"><div class="ad-card-head">Tổng quan công nợ đến hạn<span class="ad-card-extra">${R.length} căn · tính đến ${dmy(today())}</span></div>
        <div class="ad-stats">${stat('Phải thu đến hạn', fm(due), `tổng các đợt đã đến hạn của ${R.length} căn`)}
          ${stat('Đã thu', fm(paid), `<div class="ad-progress"><div class="ad-progress-rail"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>`, 'ad-stat-success')}
          ${stat('Nợ quá hạn', fm(od), `${R.filter(r => r.overdue > 0).length} căn · ${R.filter(r => r.warns.length).length} căn có cảnh báo`, od ? 'ad-stat-error' : '')}
          ${stat('Nợ khó đòi', fm(kd.overdue), `${kd.n} căn quá hạn trên ${d.days?.[2]} ngày`, kd.n ? 'ad-stat-error' : '')}</div></div>
      <div class="us-g2"><div class="ad-card"><div class="ad-card-head">Phân loại nợ<span class="ad-card-extra">bấm 1 nhóm để lọc bảng${d.can_days ? ` · <a href="#" id="usDays">${ico('fa-sliders')} mốc ngày ${d.days.join(' / ')}</a>` : ''}</span></div><div class="us-pad">${ch.donut}</div></div>
        <div class="ad-card"><div class="ad-card-head">Căn nợ quá hạn nhiều nhất<span class="ad-card-extra">bấm để xem chi tiết</span></div><div class="us-pad">${ch.bars}</div></div></div>
      <div class="ad-card"><div class="ad-card-head">Bảng phân loại nợ theo mã căn<span class="ad-card-extra"><span class="ad-muted us-hint">${ico("fa-arrows-left-right")} kéo ngang để xem đủ cột</span><span class="us-search">${ico('fa-magnifying-glass')}<input id="usQ" placeholder="Tìm mã căn, khách, SĐT, số HĐ…" value="${esc(s.q)}"></span></span></div>
        <div class="us-tabs">${[['', 'Tất cả', R.length], ...d.groups.map(g => [g.k, short(g.k) + (g.k === 'n5' ? ' · Nợ khó đòi' : g.k === 'n1' ? ' · Trong hạn' : ''), g.n]), ['warn', 'Có cảnh báo', R.filter(r => r.warns.length).length]].map(([k, l, n]) => `<button data-grp="${k}" class="${s.grp === k ? 'on' : ''}">${k && k !== 'warn' ? `<i style="background:${DG_COL[k]}"></i>` : ''}${esc(l)} <span>${n}</span></button>`).join('')}</div>
        <div class="ad-table-wrap"><table class="ad-table us-t"><thead><tr><th class="num">STT</th><th>Mã căn hộ</th><th>Tên khách hàng</th><th>Số điện thoại</th><th class="num">Số phải thu đến hạn</th><th class="num">Số đã thu</th><th class="num">Số còn phải thu</th><th class="num">Số ngày quá hạn</th><th class="num">Lãi phải trả quá hạn</th><th>Nhóm nợ</th><th>Tình trạng vay vốn</th><th>Kế hoạch thu</th><th>Lịch sử nhắc nợ</th><th></th></tr></thead>
          <tbody id="usTb"></tbody><tfoot id="usTf"></tfoot></table></div>
        <div class="us-src">${ico('fa-database')} Số đã thu theo phiếu thu (phòng KD nhập / nhập từ kế toán${d.bravo_sync ? ' — chốt ' + dmyhm(d.bravo_sync) : ''}); chỉ tính phần vào các đợt đã đến hạn, HĐ vay xem ở cột Vay vốn. Nhóm nợ tự động theo số ngày quá hạn lâu nhất của căn (mốc ${d.days?.join(' / ')} ngày); người ghi nhắc nợ được chỉnh tay kèm lý do, app lưu lịch sử.</div></div>`;
    drawT();
  };
  const drawT = () => {
    const X = shown(), sm = k => X.reduce((a, r) => a + (+r[k] || 0), 0);
    $('#usTb', main).innerHTML = X.map(r => `<tr data-u="${r.unit_id}" class="${r.grp === 'n5' ? 'ad-row-error' : ''} ${s.open === r.unit_id ? 'us-on' : ''}"><td class="num">${r.stt}</td><td class="nowrap"><b>${esc(r.unit)}</b><small>${esc(r.project)} · ${esc(r.building)}</small></td>
      <td class="us-cus"><b>${esc(r.customer)}</b><small>${esc(r.owner)}</small></td><td class="nowrap">${r.phone ? `<a href="tel:${esc(r.phone)}" data-stop>${esc(r.phone)}</a>` : '—'}</td>
      <td class="num">${fm(r.due)}</td><td class="num">${fm(r.paid)}</td>
      <td class="num">${r.due_left ? `<b class="${r.overdue ? 'ad-c-error' : ''}">${fm(r.due_left)}</b>${r.overdue && r.overdue !== r.due_left ? `<small>quá hạn ${fm(r.overdue)}</small>` : ''}` : '<span class="ad-muted">0</span>'}<small>còn theo HĐ ${fmS(r.left)}</small></td>
      <td class="num">${r.days ? `<b>${r.days}</b><small>ngày</small>` : '<span class="ad-muted">—</span>'}</td>
      <td class="num">${r.late_int != null ? (r.late_int ? `<b class="ad-c-error">${fm(r.late_int)}</b>` : '0') : (r.late_rate_set ? '0' : '<span class="ad-muted" title="HĐMB chưa điền lãi suất quá hạn — điền ở màn Công nợ hợp đồng hoặc form HĐMB">chưa có lãi suất</span>')}</td>
      <td class="us-wc">${grpCell(r)}${r.warns.some(w => w[2] !== 'qh') ? `<div class="us-wl">${warnCell(r)}</div>` : ''}</td><td class="us-vay">${vayCell(r)}</td>
      <td class="us-pl">${r.plan_m ? `<b>${fm(r.plan_m)}</b><small>dự kiến ${dmy(r.plan_on)}${r.plan_st ? ' · ' + esc(r.plan_st) : ''}</small>` : r.due_left > 0 || r.due7 > 0 ? '<span class="ad-c-error"><b>Chưa lập</b></span><small>tháng này</small>' : '<span class="ad-muted">—</span>'}</td>
      <td class="us-cl">${r.calls_n ? r.calls.slice(0, 2).map(c => `<div class="us-call" title="${esc(c.content)}"><b>${dmy(c.at)}</b> · ${esc(c.result_l)}${c.promise ? `<small>hẹn ${esc(c.promise)}</small>` : ''}</div>`).join('') + (r.calls_n > 2 ? `<small class="ad-muted">+ ${r.calls_n - 2} lần trước</small>` : '') : '<span class="ad-muted">Chưa nhắc nợ</span>'}</td>
      <td>${ico(s.open === r.unit_id ? 'fa-chevron-up' : 'fa-chevron-down')}</td></tr>${s.open === r.unit_id ? detail(r) : ''}`).join('') || '<tr><td colspan="14" class="ad-empty">Không có căn nào</td></tr>';
    $('#usTf', main).innerHTML = `<tr><td></td><td colspan="3">Cộng ${X.length} căn</td><td class="num">${fm(sm('due'))}</td><td class="num">${fm(sm('paid'))}</td><td class="num">${fm(sm('due_left'))}</td><td></td><td class="num">${fm(sm('late_int'))}</td><td></td><td></td><td class="num">${fm(sm('plan_m'))}</td><td></td><td></td></tr>`;
  };
  const classForm = r => {
    const o = ['auto', 'n1', 'n2', 'n3', 'n4', 'n5'];
    const m = modal({ title: `Cập nhật nhóm nợ — căn ${esc(r.unit)}`, narrow: true, body: `<p class="small muted" style="margin:0 0 10px">Tự động theo số ngày quá hạn: <b>${esc(d.labels[r.auto])}</b>${r.days ? ` (quá hạn ${r.days} ngày)` : ''}.</p>
        <div class="fld"><label>Nhóm nợ</label><select id="clG">${o.map(k => `<option value="${k}" ${(r.manual?.grp || 'auto') === k ? 'selected' : ''}>${k === 'auto' ? 'Theo tự động' : esc(d.labels[k])}</option>`).join('')}</select></div>
        <div class="fld"><label>Lý do<span class="req">*</span></label><textarea id="clR" placeholder="VD: khách chờ ngân hàng giải ngân, đã có thông báo cho vay">${esc(r.manual?.reason || '')}</textarea></div>`,
      foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="clOk">Lưu</button>` });
    $('#clOk', m.el).onclick = run(async () => { await api('PUT', `/api/debt-status/${r.unit_id}/class`, { grp: $('#clG', m.el).value, reason: $('#clR', m.el).value }); m.close(); toast('Đã cập nhật nhóm nợ'); await load(); });
  };
  const daysForm = () => {
    const m = modal({ title: 'Mốc ngày chia nhóm nợ', narrow: true, body: `<p class="small muted" style="margin:0 0 10px">Nhóm 1 = không quá hạn. Nhóm 2 đến mốc 1, nhóm 3 đến mốc 2, nhóm 4 đến mốc 3; quá mốc 3 là <b>nợ khó đòi</b>.</p>
        <div class="grid g3">${d.days.map((x, i) => `<div class="fld"><label>Mốc ${i + 1} (ngày)</label><input class="inp" id="dy${i}" inputmode="numeric" value="${x}"></div>`).join('')}</div>`,
      foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="dyOk">Lưu</button>` });
    $('#dyOk', m.el).onclick = run(async () => { await api('PUT', '/api/debt-status/days', { days: [0, 1, 2].map(i => +$('#dy' + i, m.el).value) }); m.close(); toast('Đã đổi mốc ngày'); await load(); });
  };
  const load = async () => { d = await api('GET', '/api/debt-status?' + qsOf({ project: f.project, building: f.building })); draw(); };
  main.innerHTML = `<div class="page ad us">${head('06', 'Tình trạng công nợ đến hạn', 'fa-scale-unbalanced', `<a class="ad-btn" href="#/e/collect_plan">${ico('fa-chart-line')} Dòng thu – chi dự kiến &amp; kế hoạch thu</a><button class="ad-btn" id="usX">${ico('fa-file-excel')} Xuất file</button>`, 'CN-06')}${filterBar(f, { period: false })}<div id="usBody"><div class="ad-card ad-empty">Đang tải…</div></div></div>`;
  wireFilter(main, f, load);
  $('#usX', main).onclick = () => download('/api/export-rows', { title: 'CN-06 Tình trạng công nợ đến hạn', file: 'Tinh_trang_cong_no_den_han',
    cols: [['stt', 'STT', 'int'], ['unit', 'Mã căn hộ'], ['customer', 'Tên khách hàng'], ['phone', 'Số điện thoại'], ['due', 'Số phải thu đến hạn', 'money'], ['paid', 'Số đã thu', 'money'], ['due_left', 'Số còn phải thu', 'money'], ['days', 'Số ngày quá hạn', 'int'], ['late_int', 'Lãi phải trả quá hạn', 'money'],
      ['grp_x', 'Nhóm nợ'], ['vay_x', 'Tình trạng vay vốn'], ['plan_x', 'Kế hoạch thu'], ['call_x', 'Lịch sử nhắc nợ'], ['warn_x', 'Cảnh báo']],
    rows: shown().map(r => ({ ...r, grp_x: d.labels[r.grp] + (r.manual ? ' (chỉnh tay: ' + r.manual.reason + ')' : ''), vay_x: [r.bank ? (r.bank.st === 'co_vay' ? 'Vay NH ' + (r.bank.bank || '') + (r.bank.doc3_l ? ', ' + r.bank.doc3_l : '') : 'Không vay NH') : '', r.vay ? `HĐ vay ${r.vay.number || ''}: khách đã chuyển ${fm(r.vay.goc_nhan)}/${fm(r.vay.goc)}, đáo hạn ${dmy(r.vay.exp_on)}` : ''].filter(Boolean).join('; '),
      plan_x: r.plan_m ? `${fm(r.plan_m)} · dự kiến ${dmy(r.plan_on)}${r.plan_st ? ' · ' + r.plan_st : ''}` : r.due_left > 0 ? 'Chưa lập kế hoạch tháng này' : '', call_x: r.calls.map(c => `${dmy(c.at)} ${c.result_l}${c.promise ? ' (hẹn ' + c.promise + ')' : ''}${c.content ? ': ' + c.content : ''}`).join('; ') + (r.calls_n > 3 ? `; … và ${r.calls_n - 3} lần trước` : ''), warn_x: r.warns.map(w => w[1]).join('; ') })),
    sum: ['due', 'paid', 'due_left', 'late_int', 'plan_m'], note: `Nhóm nợ theo số ngày quá hạn (mốc ${d.days?.join(' / ')} ngày), tính đến ${dmy(today())}` });
  main.oninput = debounce(e => { if (e.target.id === 'usQ') { s.q = e.target.value; drawT(); } }, 200);
  main.onclick = run(async e => {
    if (e.target.closest('[data-stop]')) return;
    const g = e.target.closest('[data-grp]'); if (g) { s.grp = s.grp === g.dataset.grp && g.dataset.grp ? '' : g.dataset.grp; draw(); return $('.us-tabs', main)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    const b = e.target.closest('[data-unit]'); if (b) { location.hash = `#/v/debtunit?id=${b.dataset.unit}`; return; }
    if (e.target.closest('#usDays')) { e.preventDefault(); return daysForm(); }
    const byU = id => d.rows.find(x => x.unit_id === +id), r = id => d.rows.find(x => x.contracts.some(c => c.id === +id));   // data-cls = mã căn; data-call / data-plan1 = mã hợp đồng
    const cl = e.target.closest('[data-cls]'); if (cl) return classForm(byU(cl.dataset.cls));
    const ca = e.target.closest('[data-call]'); if (ca) { const x = r(ca.dataset.call); return openForm('debt_call', { preset: { contract_id: +ca.dataset.call, contract_id__l: x?.contracts.find(c => c.id === +ca.dataset.call)?.number || '' }, onSaved: load }); }
    const p1 = e.target.closest('[data-plan1]'); if (p1) { const x = r(p1.dataset.plan1); return openForm('collect_plan', { preset: { month: d.month, contract_id: +p1.dataset.plan1, contract_id__l: x?.contracts.find(c => c.id === +p1.dataset.plan1)?.number || '', expected: x?.due_left || null, expected_on: today(), basis: 'lich_hd', ability: ['n4', 'n5'].includes(x?.grp) ? 'thap' : 'vua' }, onSaved: load }); }
    if (e.target.closest('#usPlan')) { const ok = await ask('Lập kế hoạch thu', `App sẽ tự tạo dòng kế hoạch tháng ${d.month.slice(5)}/${d.month.slice(0, 4)} cho các căn còn nợ đến hạn, chưa có kế hoạch. Sau đó anh/chị kiểm tra, sửa và trình duyệt.`, { okLabel: 'Lập kế hoạch' }); if (!ok) return;
      const x = await api('POST', '/api/collect_plan/suggest', { month: d.month, project: f.project, building: f.building }); toast(`Đã tạo ${x.created} dòng kế hoạch${x.skipped?.length ? ` · bỏ qua ${x.skipped.length}: ${x.skipped.slice(0, 3).join('; ')}${x.skipped.length > 3 ? '…' : ''}` : ''}`); return load(); }
    const tr = e.target.closest('tr[data-u]'); if (tr && !e.target.closest('a')) location.hash = `#/v/debtunit?id=${tr.dataset.u}`;   // chi tiết 1 căn ở màn riêng (07/11/2026)
  });
  ST.reload = async () => { if ($('#usBody', main)) await load(); };
  await load();
};
// CN-07 theo dõi hợp đồng: chọn loại HĐ — vay (lãi & gốc trả khách) · thuê · mua bán · hoàn thiện (công nợ khách phải trả)
const CT_KINDS = [['tonghop', 'Bảng tổng hợp', 'fa-table-list'], ['hdmb', 'HĐ mua bán', 'fa-file-signature'], ['hoan_thien', 'HĐ hoàn thiện căn hộ', 'fa-couch'], ['thue', 'HĐ thuê / thuê mua', 'fa-key'], ['vay', 'HĐ vay', 'fa-hand-holding-dollar']];   // 06/11/2026: HĐMB, hoàn thiện lên đầu
const ctKindBar = k => `<div class="card mb"><div class="tabs" style="border-bottom:0">${CT_KINDS.map(([v, l, ic]) => `<button data-kind="${v}" class="${k === v ? 'on' : ''}">${ico(ic)} ${l}</button>`).join('')}</div></div>`;
// 16/11/2026: chỉ vẽ kết quả của lần tải mới nhất trên khung — đổi tab khi bảng cũ đang tính / gõ ngày từng chữ số → kết quả cũ về sau không ghi đè (lỗi «Cannot set properties of null»)
const latest = main => { const n = main._ld = (main._ld || 0) + 1; return () => main._ld === n; };
const ctKindClick = (e, main) => { const b = e.target.closest('[data-kind]'); if (!b) return false; (ST.ctkind ||= {}).kind = b.dataset.kind; V.loantrack(main); return true; };
V.loantrack = async main => { const k = (ST.ctkind ||= { kind: 'tonghop' }).kind; return k === 'tonghop' ? V.debtsum(main) : k === 'vay' ? loanView(main) : ctTrack(main, k); };   // Theo dõi công nợ (06/11/2026): tab Bảng tổng hợp đầu tiên
// HĐ vay: gốc khách đã chuyển, lãi / gốc công ty phải trả khách, ghi nhận đã trả từng kỳ
// bấm 1 dòng hợp đồng: sổ ra phiếu thu / phiếu chi ngay dưới dòng (bấm lại để thu gọn) — 06/11/2026
const vchToggle = async (tr, cid, { onLoan, reload, to } = {}) => {
  const nx = tr.nextElementSibling;
  tr.parentElement.querySelectorAll('tr.vch').forEach(x => { x.previousElementSibling?.classList.remove('vch-on'); x.remove(); });
  if (nx?.classList.contains('vch')) return;
  const row = document.createElement('tr'); row.className = 'vch'; tr.classList.add('vch-on');
  row.innerHTML = `<td colspan="${tr.children.length}"><div class="vch-box"><div class="empty">Đang tải phiếu thu / phiếu chi…</div></div></td>`; tr.after(row);
  const g = await api('GET', `/api/contract-track/${cid}/vouchers${to ? '?to=' + to : ''}`), c = g.contract, box = $('.vch-box', row);
  // công nợ từng đợt: phải thu · đã thu · còn lại · số ngày quá hạn · lãi suất · lãi quá hạn (HĐ vay xem lịch trả lãi & gốc)
  const STC = { da_thu: 'g', qua_han: 'r', den_han: 'a', sap_den_han: 'a', mot_phan: 'b', chua_den_han: 's' }, I = g.inst || [], isum = k => I.reduce((t, x) => t + (+x[k] || 0), 0);
  const inst = !g.inst ? '' : `<div class="vch-t">${ico('fa-list-ol')} Công nợ từng đợt <span class="n">${I.length}</span><span class="small muted">tính đến ${dmy(g.asof)} · lãi suất quá hạn ${g.late_rate != null ? fnum(g.late_rate) + '%/năm' : 'chưa điền'}</span></div>
    ${I.length ? `<div class="tbl-wrap mb"><table class="t compact noclick"><thead><tr><th>Đợt</th><th>Nội dung</th><th>Hạn thanh toán</th><th class="num">Số phải thu</th><th class="num">Đã thu</th><th class="num">Còn lại</th><th class="num">Số ngày quá hạn</th>
        <th class="num">Số tiền quá hạn lũy kế</th><th>Chi tiết tính lãi chậm trả</th><th class="num">Lãi suất (%/năm)</th><th class="num">Lãi quá hạn</th><th>Tình trạng</th></tr></thead>
      <tbody>${I.map(x => `<tr><td>${x.is_maint ? 'Phí bảo trì' : 'Đợt ' + x.no}</td><td class="wrap">${esc(x.name || '')}</td><td>${dmy(x.due_on)}</td><td class="num">${fm(x.amount)}</td><td class="num">${fm(x.paid)}</td><td class="num">${fm(x.rem)}</td>
        <td class="num">${x.days ?? ''}</td><td class="num">${x.od ? fm(x.od) : ''}</td><td class="wrap small">${(x.segs || []).map(y => `${fm(y.amt)} × ${y.days} ngày (${dmy(y.from)} → ${dmy(y.to)}${y.ev ? ' · ' + esc(y.ev) : ''})`).join('<br>')}</td>
        <td class="num">${x.rate != null ? fnum(x.rate) : ''}</td><td class="num">${x.late ? fm(x.late) : ''}</td><td>${pill(x.st_l, STC[x.st] || 's')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td>Cộng</td><td></td><td class="num">${fm(isum('amount'))}</td><td class="num">${fm(isum('paid'))}</td><td class="num">${fm(isum('rem'))}</td><td></td><td class="num">${fm(I.reduce((m, x) => x.od ?? m, 0))}</td><td></td><td></td><td class="num">${fm(isum('late'))}</td><td></td></tr></tfoot></table></div>
      <div class="small muted mb">Số tiền quá hạn lũy kế = cộng dồn phần còn lại chưa thanh toán của các đợt đã quá hạn. Lãi chậm trả tính theo từng khoảng: từ hạn đợt, số tiền quá hạn = phần còn nợ, giảm dần từ mỗi ngày khách trả; mỗi khoảng = số tiền quá hạn × số ngày × lãi suất / 365 (khoảng cuối đến ${dmy(g.asof)}) — tính cả những ngày đã trễ trước khi khách trả.</div>` : '<div class="empty mb">Hợp đồng chưa có lịch thu tiền</div>'}`;
  // 16/11/2026: gọn lại — 3 ô tóm tắt + 1 sổ chứng từ theo ngày (thu vào / chi ra), nút thao tác gom lên đầu
  const vay = c.kind === 'vay', L = vay ? { thu: 'Khách chuyển gốc vay', chi: 'Công ty đã trả khách', net: 'Công ty còn giữ của khách', in: 'Khách chuyển', out: 'Trả khách' }
    : { thu: 'Khách đã nộp', chi: 'Đã trả lại khách', net: 'Thực thu (nộp − trả lại)', in: 'Thu vào', out: 'Chi ra' };
  const all = [...g.thu.map(x => ({ ...x, io: 'in' })), ...g.chi.map(x => ({ ...x, io: 'out' }))].sort((x, y) => String(x.on || '').localeCompare(String(y.on || '')) || (x.io === 'in' ? -1 : 1));
  const kpi = (l, v, cls, sub) => `<div class="vch-k"><div class="l">${l}</div><div class="v ${cls}">${fm(v)}</div><div class="s">${sub}</div></div>`;
  const book = all.length ? `<table class="t compact noclick vch-book"><thead><tr><th>Ngày</th><th>Loại</th><th>Số chứng từ</th><th>Nội dung</th><th class="num">${L.in}</th><th class="num">${L.out}</th></tr></thead><tbody>
      ${all.map(x => `<tr class="${x.ok ? '' : 'muted'}" data-vo="${x.ent}:${x.id}" style="cursor:pointer" title="Bấm để xem chi tiết phiếu"><td class="nowrap">${dmy(x.on)}</td>
        <td>${x.io === 'in' ? `<span class="vk-in">${ico('fa-arrow-down')} Thu</span>` : `<span class="vk-out">${ico('fa-arrow-up')} Chi</span>`}</td>
        <td class="nowrap"><b>${esc(x.no || '')}</b></td>
        <td class="wrap">${esc(x.content || '')}${x.src ? `<div class="small muted">${esc(x.src)}</div>` : ''}${x.ok ? '' : ` ${pill(x.st[0], x.st[1])}`}</td>
        <td class="num">${x.io === 'in' ? (x.ok ? `<b class="pos">${fm(x.amount)}</b>` : `<s>${fm(x.amount)}</s>`) : ''}</td>
        <td class="num">${x.io === 'out' ? (x.ok ? `<b class="neg">${fm(x.amount)}</b>` : `<s>${fm(x.amount)}</s>`) : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Cộng (phiếu hợp lệ)</td><td class="num pos">${fm(g.thu_sum)}</td><td class="num neg">${fm(g.chi_sum)}</td></tr></tfoot></table>`
    : `<div class="empty">${vay ? 'Chưa có phiếu thu gốc / phiếu chi trả lãi, gốc' : 'Chưa có phiếu thu / phiếu chi'}</div>`;
  box.innerHTML = `<div class="vch-head"><div><b>${ico('fa-file-invoice-dollar')} Chứng từ — HĐ ${esc(c.number || '')}</b><div class="muted small">Căn ${esc(c.unit)} · ${esc(c.customer)}</div></div><span class="grow"></span>
      ${g.can_thu ? `<button class="btn sm" data-vnew="receipt">${ico('fa-plus')} Phiếu thu</button>` : ''}${g.can_chi ? `<button class="btn sm" data-vnew="payment">${ico('fa-plus')} Phiếu chi</button>` : ''}
      ${vay ? `<button class="btn sm" data-vloan>${ico('fa-hand-holding-dollar')} Lịch trả lãi & gốc</button>` : ''}<button class="btn ghost sm" data-vopen>${ico('fa-up-right-from-square')} Mở hợp đồng</button></div>
    <div class="vch-ks">${kpi(L.thu, g.thu_sum, 'pos', `${g.thu.filter(x => x.ok).length} phiếu thu`)}${kpi(L.chi, g.chi_sum, 'neg', `${g.chi.filter(x => x.ok).length} phiếu chi${vay ? ' (lãi / gốc)' : ''}`)}${kpi(L.net, g.thu_sum - g.chi_sum, '', 'thu − chi')}</div>
    ${inst}<div class="vch-t">${ico('fa-book')} Sổ chứng từ <span class="n">${all.length}</span><span class="small muted">theo ngày · bấm 1 dòng để xem phiếu</span></div>${book}
    <div class="small muted mt">${vay ? 'Thu = tiền gốc khách chuyển cho công ty vay · Chi = tiền lãi / gốc công ty trả khách (tự trừ vào kỳ trả).' : 'Thu = tiền khách nộp · Chi = tiền công ty trả lại khách (hoàn tiền, hoàn cọc).'}</div>`;
  box.onclick = run(async e => {
    e.stopPropagation();
    const n = e.target.closest('[data-vnew]'), o = e.target.closest('[data-vo]');
    if (e.target.closest('[data-vopen]')) { e.preventDefault?.(); return openDetail('contract', cid, c.kind === 'vay' ? undefined : 'debt'); }
    if (e.target.closest('[data-vloan]')) return onLoan?.(cid);
    if (n) return openForm(n.dataset.vnew, { preset: { contract_id: cid, contract_id__l: c.number, voucher_date: today(), ...(n.dataset.vnew === 'payment' ? { kind: c.kind === 'vay' ? 'tra_lai' : ['thue', 'thue_mua'].includes(c.kind) ? 'hoan_coc' : 'hoan_tien' } : {}) }, onSaved: async () => { await reload?.(); } });
    if (o) { const [ent, id] = o.dataset.vo.split(':'); return openDetail(ent, +id); }
  });
};
const loanView = async main => {
  const f = filt(), s = ST.loantrack ||= { state: '', q: '', from: '', to: '' };
  // cột theo mẫu theo dõi HĐ vay của phòng Kinh doanh (05/11/2026)
  const cols = [['project_name', 'Tên dự án'], ['unit', 'Mã căn hộ'], ['customer', 'Tên khách hàng'], ['phone', 'Số điện thoại'], ['signed_on', 'Ngày ký HĐ', 'date'], ['exp_on', 'Ngày đáo hạn', 'date'], ['term_l', 'Thời hạn vay'], ['rate_l', 'Lãi suất'],
    ['goc_hd', 'Số tiền phải vay', 'money'], ['goc_nhan', 'Số tiền gốc đã nhận', 'money'], ['goc_cho', 'Còn lại gốc phải thu', 'money'], ['lai_tong', 'Lãi phải trả', 'money'], ['lai_den_nay', 'Lãi phải trả đến ngày xem', 'money'], ['goc_nhan_w', 'Gốc nhận trong kỳ', 'money'], ['lai_w', 'Lãi phải trả trong kỳ', 'money'], ['goc_tra', 'Số tiền gốc đã trả', 'money'], ['goc_tra_con', 'Còn lại gốc phải trả', 'money'],
    ['number', 'Số hợp đồng vay'], ['links', 'Số hợp đồng thuê']];
  const SUM = ['goc_hd', 'goc_nhan', 'goc_cho', 'lai_tong', 'lai_den_nay', 'goc_nhan_w', 'lai_w', 'goc_tra', 'goc_tra_con'];
  const TABS = [['', 'Tất cả'], ['qua_han', 'Quá hạn trả lãi'], ['sap_toi', 'Đến hạn trong 7 ngày'], ['dao_han', 'Đáo hạn trong 30 ngày'], ['dang', 'Đang vay'], ['xong', 'Đã trả hết']];
  let d = { rows: [] };
  const shown = () => { const q = s.q.trim().toLowerCase(); return d.rows.filter(r => !q || [r.unit, r.customer, r.number, r.links, r.phone].some(x => String(x || '').toLowerCase().includes(q))); };
  const draw = () => {
    const sum = k => d.rows.reduce((t, r) => t + (+r[k] || 0), 0), n = k => d.rows.filter(r => !k || r.state === k).length, tile = (l, v, sub, red) => `<div class="card kpi ${red ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:18px">${v}</div><div class="s">${sub || '&nbsp;'}</div></div>`;
    if (d.closed) { $('#ltK', main).innerHTML = tile('HĐ vay đã thanh lý', d.rows.length, 'đã đóng theo dõi công nợ') + tile('Gốc vay đã nhận (lịch sử)', fm(sum('goc_nhan'))) + tile('Lãi đã trả khách', fm(sum('lai_tra'))) + tile('Gốc đã trả khách', fm(sum('goc_tra')));
      $('#ltN', main).textContent = `${shown().length} hợp đồng`; $('#ltT', main).innerHTML = rowsTable(cols, shown(), SUM, { no: 'STT' }); $('#ltNote', main).innerHTML = `HĐ đã thanh lý — <b>đã đóng theo dõi công nợ</b>: số liệu chỉ để tra cứu lịch sử thu tiền / công nợ, không tính vào tổng công nợ phải thu, không nhắc thu. Khoản hoàn trả cho khách theo dõi tại <a href="#/v/payouts">Theo dõi thanh lý &amp; chi trả</a>. Các hợp đồng khác cùng căn còn hiệu lực vẫn ở «Đang theo dõi công nợ».`; return; }
    $('#ltNote', main).innerHTML = LT_NOTE;
    $('#ltK', main).innerHTML = tile('Gốc vay đã nhận', fm(sum('goc_nhan')), `${d.rows.length} HĐ vay · theo hợp đồng ${fm(sum('goc_hd'))}`) + tile('Lãi còn phải trả khách', fm(sum('lai_con')), `đã trả ${fm(sum('lai_tra'))}`)
      + tile('Lãi quá hạn chưa trả', fm(sum('lai_qua_han')), `${n('qua_han')} hợp đồng`, sum('lai_qua_han') > 0) + tile('Gốc còn phải trả khách', fm(sum('goc_tra_con')), `${n('dao_han')} HĐ đáo hạn trong 30 ngày`);
    $('#ltN', main).textContent = `${shown().length} hợp đồng`;
    $('#ltT', main).innerHTML = rowsTable(cols, shown(), SUM, { no: 'STT' });
  };
  const load = async () => { const ok = latest(main), r = await api('GET', '/api/loan-track?' + qsOf({ project: f.project, building: f.building, from: s.from, to: s.to, closed: s.closed || '' })); if (ok()) { d = r; draw(); } };
  // bấm 1 HĐ vay: các kỳ trả lãi / gốc, ghi nhận đã trả
  const items = async id => {
    const g = await api('GET', `/api/loan-track/${id}`), T = today(), rem = x => Math.max(0, +x.amount - (+x.paid_amt || 0));
    const st = x => !rem(x) && +x.amount > 0 ? pill('Đã trả', 'g') : x.due_on < T ? pill('Quá hạn trả', 'r') : +x.paid_amt > 0 ? pill('Trả một phần', 'b') : pill('Chưa đến hạn', 's');
    const m = modal({ title: `${ico('fa-hand-holding-dollar')} Lịch trả lãi & gốc — HĐ vay ${esc(g.contract.number || '')}`, wide: true,
      body: `<div class="small muted mb">Căn ${esc(g.contract.unit)} · bên cho vay ${esc(g.contract.customer)} · số tiền vay ${fm(g.contract.value)} đ · lãi ${g.contract.int_mode === 'lai_suat' ? `${fnum(g.contract.loan_rate)}%/năm` : `bằng tiền thuê ${fm(g.contract.rent)} đ/tháng`}</div>
        ${g.items.length ? `<table class="t compact noclick"><thead><tr><th>Kỳ</th><th>Khoản</th><th>Thời gian tính lãi</th><th>Hạn trả</th><th class="num">Phải trả</th><th>Ngày đã trả</th><th class="num">Đã trả</th><th>Phiếu chi</th><th>Tình trạng</th><th></th></tr></thead><tbody>${g.items.map(x => `<tr><td>${x.seq}</td><td>${x.kind === 'lai' ? 'Tiền lãi' : '<b>Trả gốc</b>'}</td><td>${dmy(x.period_from)} – ${dmy(x.period_to)}</td><td>${dmy(x.due_on)}</td><td class="num">${fm(x.amount)}</td><td>${x.paid_on ? dmy(x.paid_on) : ''}</td><td class="num">${+x.paid_amt ? fm(x.paid_amt) : ''}</td><td class="small">${esc(x.vouchers || x.note || '')}</td><td>${st(x)}</td><td>${g.can_pay && rem(x) ? `<button class="btn sm pri" data-pay="${x.id}">${ico('fa-money-bill-wave')} Lập phiếu chi</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Chưa có lịch — mở HĐ vay, nhập ngày bắt đầu tính lãi, thời hạn, kỳ trả lãi rồi lưu</div>'}`,
      foot: `<button class="btn" data-x>Đóng</button><button class="btn" id="ltO">${ico('fa-file-contract')} Mở hợp đồng vay</button>` });
    $('#ltO', m.el).onclick = () => { m.close(); openDetail('contract', id); };
    m.el.addEventListener('click', run(async e => {
      const b = e.target.closest('[data-pay]'); if (!b) return; const x = g.items.find(i => i.id === +b.dataset.pay);
      m.close(); openForm('payment', { preset: { contract_id: id, contract_id__l: g.contract.number, kind: x.kind === 'lai' ? 'tra_lai' : 'tra_goc', loan_pay_id: x.id, loan_pay_id__l: `${x.kind === 'lai' ? 'Lãi kỳ ' + x.seq : 'Trả gốc'} · hạn ${dmy(x.due_on)}`, amount: rem(x), voucher_date: T, receiver: g.contract.customer },
        onSaved: async () => { toast('Đã lập phiếu chi — kỳ trả đã cập nhật'); await load(); items(id); } });
    }));
  };
  main.innerHTML = `<div class="page">${head('06', 'Theo dõi công nợ — HĐ vay (lãi & gốc)', 'fa-hand-holding-dollar', `<button class="btn" id="ltX">${ico('fa-file-excel')} Xuất file</button>`, 'CN-07')}${ctKindBar('vay')}${filterBar(f, { period: false })}<div class="grid g4 mb" id="ltK"></div><div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="ltQ" placeholder="Tìm mã căn, khách hàng, số HĐ vay / thuê…" value="${esc(s.q)}"></div><span id="ltDates" style="display:contents"><span class="small muted">Từ ngày</span>${segDate('ltFr', s.from)}<span class="small muted">Đến ngày</span>${segDate('ltTo', s.to || today())}</span><select class="inp" id="ltCl" style="width:auto;height:30px" title="HĐ đã thanh lý đã đóng theo dõi công nợ — không tính vào tổng công nợ phải thu / nhắc thu; chọn để tra cứu lịch sử thu tiền"><option value="">Đang theo dõi công nợ</option><option value="1" ${s.closed ? 'selected' : ''}>HĐ đã thanh lý (đã đóng công nợ)</option></select><span class="grow"></span><span class="small muted" id="ltN"></span></div><div id="ltT"><div class="empty">Đang tải…</div></div><div class="small muted mt" id="ltNote">Gốc: khách chuyển theo các đợt giải ngân (phiếu thu của HĐ vay). Lãi: công ty trả khách cuối mỗi kỳ — mỗi tháng = 1 tháng tiền thuê căn (hoặc theo lãi suất). Tiền vay không trừ vào giá mua căn hộ. Số đã trả lãi / gốc lấy theo Phiếu chi. Bấm 1 dòng để sổ ra phiếu thu / phiếu chi của hợp đồng.</div></div></div>`;
  wireFilter(main, f, load);
  wireSegDate(main); $('#ltDates', main).addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (v === null) return; if (e.target.id === 'ltFr') s.from = v; else s.to = v; await load(); }));
  $('#ltQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  const LT_NOTE = $('#ltNote', main).innerHTML;
  $('#ltCl', main).onchange = run(async e => { s.closed = e.target.value; await load(); });
  $('#ltX', main).onclick = () => download('/api/export-rows', { title: 'CN-07 Theo dõi HĐ vay — lãi & gốc', cols, rows: shown(), sum: SUM, note: 'Lãi trả khách bằng tiền thuê 1 tháng / tháng hoặc theo lãi suất; tiền vay không trừ vào giá mua', file: 'Theo_doi_HD_vay' });
  main.onclick = run(async e => { if (ctKindClick(e, main)) return; const t = e.target.closest('[data-st]'); if (t) { s.state = t.dataset.st; return draw(); } const tr = e.target.closest('#ltT tr[data-i]'); if (tr) { const r = shown()[+tr.dataset.i]; if (r) await vchToggle(tr, r.contract_id, { onLoan: items, reload: load }); } });
  ST.reload = async () => { if ($('#ltT', main)) await load(); };
  await load();
};
// ===== Phiếu thu – Phiếu chi: 1 màn (06/11/2026) — tab Tất cả (thu + chi chung 1 bảng) · Phiếu thu · Phiếu chi (danh sách đầy đủ: lọc, nhập tệp, hủy phiếu…)
V.vouchers = async (main, params = {}) => {
  const s = ST.vch ||= { tab: '', q: '', type: '', status: '', from: '', to: '' };
  if (params.tab) s.tab = params.tab;
  const E1 = M.ents.receipt, E2 = M.ents.payment, see = { receipt: E1?.perm.r, payment: E2?.perm.r };
  if (s.tab && !see[s.tab]) s.tab = '';
  const TABS = [['', 'Tất cả', 'fa-layer-group'], ...(see.receipt ? [['receipt', 'Phiếu thu', 'fa-arrow-down']] : []), ...(see.payment ? [['payment', 'Phiếu chi', 'fa-arrow-up']] : [])];
  const bar = `<div class="card mb"><div class="tabs" id="vcTabs" style="border-bottom:0">${TABS.map(([k, l, ic]) => `<button data-vt="${k}" class="${s.tab === k ? 'on' : ''}">${ico(ic)} ${l}</button>`).join('')}</div></div>`;
  const goTab = k => { s.tab = k; if (location.hash.startsWith('#/e/')) location.hash = '#/v/vouchers'; else V.vouchers(main); };
  if (s.tab) {   // tab Phiếu thu / Phiếu chi = danh sách cũ, đầy đủ chức năng
    main.innerHTML = `<div class="page">${bar}<div id="vcBody"></div></div>`;
    $('#vcTabs', main).onclick = e => { const b = e.target.closest('[data-vt]'); if (b) goTab(b.dataset.vt); };
    return listView($('#vcBody', main), s.tab, params);
  }
  const f = filt();
  const cols = [['type_l', 'Loại'], ['voucher_no', 'Số phiếu'], ['voucher_date', 'Ngày', 'date'], ['number', 'Mã hợp đồng'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['ct_kind_l', 'Loại HĐ'],
    ['grp_l', 'Nhóm thu / chi'], ['item', 'Đợt thu / kỳ trả'], ['thu', 'Số tiền thu', 'money'], ['chi', 'Số tiền chi', 'money'], ['content', 'Nội dung'], ['receiver', 'Người nhận'], ['src_l', 'Nguồn'], ['status_l', 'Trạng thái']];
  let d = { rows: [] };
  const draw = () => {
    const sum = k => d.rows.reduce((t, r) => t + (+r[k] || 0), 0), n = t => d.rows.filter(r => r.typ === t).length, nh = d.rows.filter(r => !r.ok).length;
    const tile = (l, v, sub, cls) => `<div class="card kpi" style="cursor:default"><div class="l">${l}</div><div class="v ${cls || ''}" style="font-size:18px">${v}</div><div class="s">${sub || '&nbsp;'}</div></div>`;
    $('#vcK', main).innerHTML = tile('Tổng thu', fm(sum('thu')), `${n('thu')} phiếu thu`, 'pos') + tile('Tổng chi', fm(sum('chi')), `${n('chi')} phiếu chi`, 'neg')
      + tile('Thu − chi', fm(sum('thu') - sum('chi')), 'chỉ tính phiếu hợp lệ') + tile('Phiếu đã hủy', String(nh), 'không cộng vào tổng');
    $('#vcN', main).textContent = `${d.rows.length} phiếu${d.more ? ' (hiện 3.000 phiếu mới nhất — lọc ngày để xem thêm)' : ''}`;
    $('#vcT', main).innerHTML = rowsTable(cols, d.rows, ['thu', 'chi'], { no: 'STT' });
    $$('#vcT tbody tr', main).forEach(tr => { const r = d.rows[+tr.dataset.i]; if (r && !r.ok) tr.classList.add('muted'); });
  };
  const load = async () => { d = await api('GET', '/api/vouchers?' + qsOf({ project: f.project, building: f.building, q: s.q, type: s.type, status: s.status, from: s.from, to: s.to })); draw(); };
  const sel = (id, v, o) => `<select id="${id}">${o.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const newBtns = `${E1?.perm.c ? `<button class="btn" data-vn="receipt">${ico('fa-plus')} Phiếu thu</button>` : ''}${E2?.perm.c ? `<button class="btn" data-vn="payment">${ico('fa-plus')} Phiếu chi</button>` : ''}`;
  main.innerHTML = `<div class="page">${head('06', 'Phiếu thu – Phiếu chi', 'fa-file-invoice-dollar', `${newBtns}${M.exportRoles.includes(M.me.role) ? `<button class="btn" id="vcX">${ico('fa-file-excel')} Xuất file</button>` : ''}`, 'CN-09')}${bar}${filterBar(f, { period: false })}
    <div class="grid g4 mb" id="vcK"></div>
    <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="vcQ" placeholder="Tìm số phiếu, mã HĐ, mã căn, khách hàng, nội dung…" value="${esc(s.q)}"></div>
      ${sel('vcTy', s.type, [['', 'Thu và chi'], ['thu', 'Chỉ phiếu thu'], ['chi', 'Chỉ phiếu chi']])}${sel('vcSt', s.status, [['', 'Mọi trạng thái'], ['hop_le', 'Hợp lệ'], ['huy', 'Đã hủy']])}
      <span id="vcDates" style="display:contents"><span class="small muted">Từ ngày</span>${segDate('vcFr', s.from)}<span class="small muted">Đến ngày</span>${segDate('vcTo', s.to)}</span>
      <span class="grow"></span><span class="small muted" id="vcN"></span></div>
      <div id="vcT"><div class="empty">Đang tải…</div></div>
      <div class="small muted mt">Phòng KD tự ghi để theo dõi tiến độ thu / chi theo hợp đồng (không phải chứng từ kế toán). Phiếu thu = tiền khách nộp (HĐ vay: tiền gốc khách chuyển); phiếu chi = tiền công ty trả khách (lãi / gốc HĐ vay, hoàn tiền, hoàn cọc). Tổng chỉ cộng phiếu hợp lệ. Bấm 1 dòng để xem / hủy phiếu; nhập tệp Excel / MISA ở tab Phiếu thu.</div></div></div>`;
  wireFilter(main, f, load); wireSegDate(main);
  $('#vcDates', main).addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (v === null) return; if (e.target.id === 'vcFr') s.from = v; else s.to = v; await load(); }));
  $('#vcQ', main).oninput = debounce(async e => { s.q = e.target.value; await load().catch(er => toast(er.message, true)); }, 300);
  $('#vcTy', main).onchange = run(async e => { s.type = e.target.value; await load(); });
  $('#vcSt', main).onchange = run(async e => { s.status = e.target.value; await load(); });
  $('#vcX', main) && ($('#vcX', main).onclick = () => download('/api/export-rows', { title: 'PHIẾU THU – PHIẾU CHI', cols, rows: d.rows, sum: ['thu', 'chi'], file: 'Phieu_thu_phieu_chi',
    note: `Đơn vị tiền: đồng${s.from || s.to ? ` • Ngày ${s.from ? 'từ ' + dmy(s.from) + ' ' : ''}${s.to ? 'đến ' + dmy(s.to) : ''}` : ''} • Tổng chỉ cộng phiếu hợp lệ` }));
  main.onclick = run(async e => {
    const t = e.target.closest('[data-vt]'); if (t) return goTab(t.dataset.vt);
    const nb = e.target.closest('[data-vn]'); if (nb) return openForm(nb.dataset.vn, { preset: { voucher_date: today() }, onSaved: async () => { await load(); } });
    const tr = e.target.closest('#vcT tr[data-i]'); if (tr) { const r = d.rows[+tr.dataset.i]; if (r) openDetail(r.ent, r.id); }
  });
  ST.reload = async () => { if ($('#vcT', main)) await load(); };
  await load();
};

// ===== Công nợ hợp đồng — màn riêng khi bấm 1 hợp đồng ở Theo dõi công nợ (06/11/2026): to, rõ, dễ hiểu =====
// thông tin HĐ · ô tổng · tiến độ từng đợt (tình trạng viết thành câu) · lịch sử thu – chi (mỗi phiếu ghi rõ đã trừ vào đợt nào) · cách tính
V.ctdebt = async (main, params = {}) => {
  // Công nợ hợp đồng — giao diện theo ngôn ngữ thiết kế Ant Design (PageHeader · Statistic · Descriptions · Steps · Table · Tag · Collapse), 06/11/2026
  const id = +params.id; if (!id) { main.innerHTML = '<div class="page"><div class="errbar">Thiếu mã hợp đồng</div></div>'; return; }
  let to = params.to || '';
  const back = () => history.length > 1 ? history.back() : (location.hash = '#/v/loantrack');
  const dd = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const tag = (t, k = 'default') => `<span class="ad-tag ad-tag-${k}">${t}</span>`;
  const draw = async () => {
    const g = await api('GET', `/api/contract-track/${id}/vouchers${to ? '?to=' + to : ''}`), c = g.contract, I = g.inst || [], T = g.asof, vay = c.kind === 'vay';
    const sum = k => I.reduce((t, x) => t + (+x[k] || 0), 0), total = sum('amount'), paid = sum('paid'), rem = sum('rem'), late = sum('late'), pct = total ? Math.min(100, Math.round(paid / total * 1000) / 10) : 0;
    const CL = g.closed;   // 17/11/2026: HĐ đã thanh lý — đóng theo dõi công nợ: không quá hạn, không đợt tới, không lãi chậm trả
    const overRows = CL ? [] : I.filter(x => x.rem > 0 && x.due_on < T), overdue = overRows.reduce((t, x) => t + x.rem, 0), overDays = overRows.length ? dd(overRows[0].due_on, T) : 0;
    const next = CL ? null : I.find(x => x.rem > 0 && x.due_on >= T);
    // trạng thái từng đợt kiểu Steps: finish / error / process / wait
    const stOf = x => x.rem <= 0 ? 'finish' : CL ? 'wait' : x.due_on < T ? 'error' : x === next ? 'process' : 'wait';
    const tagOf = x => x.rem <= 0 ? (x.late_paid_days ? tag(`Đã thu · trễ ${x.late_paid_days} ngày`, 'warning') : tag('Đã thu đủ', 'success')) : CL ? tag('Đã đóng — HĐ thanh lý', 'default')
      : x.due_on < T ? tag(`Quá hạn ${dd(x.due_on, T)} ngày`, 'error') : x.due_on === T ? tag('Đến hạn hôm nay', 'warning')
      : tag(`${x.paid > 0 ? 'Thu một phần · ' : ''}Còn ${dd(T, x.due_on)} ngày`, x === next ? 'processing' : 'default');
    const ST_TAG = { 'Đã ký': 'success', 'Dự thảo': 'default', 'Chờ duyệt': 'processing', 'Chờ ký': 'processing', 'Thanh lý': 'warning', 'Đã thanh lý': 'warning', 'Đã hủy': 'error' };
    const rateIn = g.can_rate ? `<input class="ad-input cd-rate" id="cdRate" value="${g.late_rate ?? ''}" placeholder="vd 18" inputmode="decimal" title="Lãi suất chậm trả (%/năm) — gõ rồi Enter"> %/năm`
      : g.late_rate != null ? fnum(g.late_rate) + ' %/năm' : '<span class="ad-muted">chưa điền</span>';
    const desc = [['Khách hàng', esc(c.customer || '')], ['Số điện thoại', esc(c.phone || '')],
      ['Căn hộ', esc(c.unit || '')], ['Dự án', esc(c.project || '')], ['Người phụ trách', esc(c.owner || '')],
      c.after_tax != null ? ['Giá trị căn hộ (sau thuế)', fm(c.after_tax + c.finish_value)] : ['Giá trị hợp đồng', fm(c.value)], ['Phí bảo trì', c.maint_fee ? fm(c.maint_fee) : '—'],
      vay ? ['Tiền đặt cọc', c.deposit != null ? fm(c.deposit) : '—'] : ['Lãi suất chậm trả', rateIn]];
    const stat = (title, val, foot = '', cls = '') => `<div class="ad-stat ${cls}"><div class="ad-stat-t">${title}</div><div class="ad-stat-v">${val}</div>${foot ? `<div class="ad-stat-f">${foot}</div>` : ''}</div>`;
    const allV = [...g.thu.map(x => ({ ...x, typ: 'thu' })), ...g.chi.map(x => ({ ...x, typ: 'chi' }))].sort((a, b) => String(a.on).localeCompare(String(b.on)) || (a.typ === b.typ ? a.id - b.id : a.typ === 'thu' ? -1 : 1));
    const where = x => x.typ === 'chi' ? `<span class="ad-muted">${esc(x.src || 'Chi trả khách')}</span>` : !x.ok ? '<span class="ad-muted">phiếu đã hủy</span>' : x.after ? '<span class="ad-muted">sau ngày đang xem</span>'
      : vay ? '<span class="ad-muted">tiền gốc vay</span>' : (x.alloc || []).map(a => `${esc(a.lbl)} <b>${fm(a.amt)}</b>`).join('<br>') || '—';
    // lãi chậm trả theo từng khoảng thời gian: mỗi khoảng 1 dòng (từ – đến, số ngày, số tiền quá hạn trong khoảng, lãi suất, tiền lãi); ≥ 2 khoảng thêm «Cộng đợt»
    const lateCells = x => {
      const S = x.segs || [], R = g.late_rate, dash = '<span class="ad-muted">—</span>';
      if (!S.length) return `<td class="num ad-g1">${dash}</td><td class="num">${dash}</td><td class="num">${dash}</td>`;
      const dm = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';   // ngày gọn dd/mm
      const col = f => S.map(y => `<div class="ad-seg">${f(y)}</div>`).join('') + (S.length > 1 ? `<div class="ad-seg ad-seg-sum">${f(null)}</div>` : '');
      return `<td class="num ad-g1">${col(y => y ? `${y.days} ngày<small title="${esc(y.ev || '')}">${dm(y.from)} → ${dm(y.to)}</small>` : '&nbsp;')}</td>
        <td class="num">${col(y => y ? `${fm(y.amt)}<small>${y.parts.length > 1 ? y.parts.map((q, n) => `${n ? '+ ' : ''}${esc(q.lbl)} ${fm(q.rem)}`).join('<br>') : 'còn nợ ' + esc(y.parts[0]?.lbl || '')}</small>` : '&nbsp;')}</td>
        <td class="num">${col(y => R == null ? (y ? dash + '<small>&nbsp;</small>' : dash) : y ? `${fm(y.late)}<small>&nbsp;</small>` : `<span class="ad-muted">Cộng</span> <b>${fm(x.late)}</b>`)}</td>`;
    };
    main.innerHTML = `<div class="page cd ad">
      <div class="ad-crumb"><a href="#/v/loantrack">Công nợ &amp; kế hoạch thu</a><i>/</i><a href="#/v/loantrack">Theo dõi công nợ</a><i>/</i><span>${esc(c.number || '')}</span></div>
      <div class="ad-head">
        <button class="ad-back" id="cdBack" title="Quay lại">${ico('fa-arrow-left')}</button>
        <div class="ad-head-main"><div class="ad-head-title"><h1>${esc(c.number || '')}</h1>${tag(esc(c.status_l), ST_TAG[c.status_l] || 'default')}${tag(esc(c.kind_l), 'processing')}</div>
          <div class="ad-head-sub">${[c.customer, 'Căn ' + c.unit, c.project, c.signed_on ? 'Ký ngày ' + dmy(c.signed_on) : ''].filter(Boolean).map(esc).join('<i>·</i>')}</div></div>
        <div class="ad-head-extra">${vay ? `<span class="ad-asof">Tính đến ${segDate('cdTo', to || T)}</span>` : ''}
          <button class="ad-btn" id="cdOpen">${ico('fa-file-contract')} Mở hợp đồng</button>${g.can_chi ? `<button class="ad-btn" data-vnew="payment">${ico('fa-plus')} Phiếu chi</button>` : ''}
          ${g.can_thu ? `<button class="ad-btn ad-btn-primary" data-vnew="receipt">${ico('fa-plus')} Phiếu thu</button>` : ''}<button class="ad-btn ad-btn-icon" onclick="print()" title="In">${ico('fa-print')}</button></div></div>
      ${vay ? `<div class="ad-card ad-card-pad">HĐ vay: lịch trả lãi &amp; gốc xem ở <a href="#/v/loantrack">Theo dõi công nợ › HĐ vay</a>. Dưới đây là thông tin và phiếu thu / phiếu chi của hợp đồng.</div>` : `
      ${CL ? `<div class="ad-card ad-card-pad" style="border-left:4px solid var(--amber, #d4a72c)">${ico('fa-box-archive')} <b>Hợp đồng đã thanh lý ngày ${dmy(CL.on)} — đã đóng theo dõi công nợ.</b> Lịch thu, phiếu thu và lịch sử công nợ dưới đây chỉ để tra cứu; không còn phải thu / quá hạn / lãi chậm trả, không tính vào tổng công nợ, không nhắc thu${CL.left ? ` (phần chưa thu lúc thanh lý ${fm(CL.left)} đã đóng)` : ''}. Khoản hoàn trả cho khách theo dõi tại <a href="#/v/payouts">Theo dõi thanh lý &amp; chi trả</a>${CL.slip ? ` — phiếu <a href="#" data-vo="cancel_req:${CL.slip.id}">${esc(CL.slip.code)}</a>` : ''}.</div>` : ''}
      <div class="ad-card"><div class="ad-card-head">Tổng quan công nợ<span class="ad-card-extra ad-asof">Tính đến ${segDate('cdTo', to || T)}</span></div>
        <div class="ad-stats">
          ${stat('Tổng phải thu theo hợp đồng', fm(total), `${I.length} đợt thu${c.maint_fee ? ` · gồm phí bảo trì ${fm(c.maint_fee)}` : ''}`)}
          ${stat('Đã thu', fm(paid), `<div class="ad-progress"><div class="ad-progress-rail"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>${g.extra ? `thu thừa ${fm(g.extra)}` : ''}`, 'ad-stat-success')}
          ${CL ? stat('Còn phải thu', '0', `đã đóng công nợ ngày ${dmy(CL.on)}${rem > 0 ? ` · chưa thu lúc thanh lý ${fm(rem)}` : ''}`) : stat('Còn phải thu', fm(rem), next ? `Đợt tới: <b>${esc(next.lbl)}</b> · ${fm(next.rem)} · hạn ${dmy(next.due_on)}` : rem > 0 ? 'các đợt còn nợ đều đã quá hạn' : 'đã thu đủ hợp đồng')}
          ${stat('Quá hạn chưa thu', overdue ? fm(overdue) : '0', overdue ? `${overRows.length} đợt · lâu nhất ${overDays} ngày${g.late_rate != null ? ` · lãi ${fm(late)}` : ''}` : g.late_rate != null && late ? `lãi chậm trả ${fm(late)}` : 'không có đợt quá hạn', overdue ? 'ad-stat-error' : '')}
        </div>
        ${I.length ? `<div class="ad-steps">${I.map(x => `<div class="ad-step ad-step-${stOf(x)}"><span class="ad-step-dot"></span><div class="ad-step-t">${esc(x.lbl)}</div><div class="ad-step-s">${fm(x.amount)}</div><div class="ad-step-c">hạn ${dmy(x.due_on)}</div></div>`).join('')}</div>` : ''}
      </div>`}
      <div class="ad-card"><div class="ad-card-head">Thông tin hợp đồng</div>
        <table class="ad-desc"><tbody>${[0, 3, 6].map(i => `<tr>${desc.slice(i, i + 3).map(([l, v]) => `<th>${l}</th><td>${v || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${vay ? '' : `<div class="ad-card"><div class="ad-card-head">Tiến độ thanh toán<span class="ad-card-extra">${I.length} đợt</span></div>
        ${I.length ? `<div class="ad-table-wrap"><table class="ad-table"><thead><tr><th rowspan="2">Đợt</th><th rowspan="2">Nội dung</th><th rowspan="2" class="num">Phải thu</th><th rowspan="2" class="num">Đã thu</th><th rowspan="2" class="num">Còn lại</th><th rowspan="2">Tình trạng</th><th colspan="3" class="ad-grp">Lãi chậm trả · ${g.late_rate != null ? fnum(g.late_rate) + ' %/năm' : '<span class="ad-muted">chưa điền lãi suất</span>'}</th></tr>
          <tr><th class="num ad-g1">Số ngày quá hạn</th><th class="num">Số tiền quá hạn lũy kế</th><th class="num">Tiền lãi</th></tr></thead>
        <tbody>${I.map(x => { const txt = x.virt ? `Phí bảo trì (nằm trong Đợt ${x.in_no} của lịch)` : String(x.name || '').replace(/^\s*(đợt|kỳ|lần)\s*\d+\s*[–—:-]?\s*/i, ''); return `<tr class="${stOf(x) === 'error' ? 'ad-row-error' : ''}">
          <td class="nowrap"><b>${esc(x.lbl)}</b><small>hạn ${dmy(x.due_on)}</small></td>
          <td class="ad-cell-txt"><div class="cd-txt" title="${esc(txt)}">${esc(txt) || '<span class="ad-muted">—</span>'}</div>${x.cut ? `<small>đã tách ${fm(x.cut)} phí bảo trì (theo lịch ${fm(x.orig)})</small>` : ''}${x.pcs?.length ? `<small>${x.pcs.map(p => `thu ${fm(p.amt)} ngày ${dmy(p.on)}`).join(' · ')}</small>` : ''}</td>
          <td class="num">${fm(x.amount)}</td><td class="num">${x.paid ? fm(x.paid) : '<span class="ad-muted">—</span>'}</td><td class="num"><b>${x.rem > 0 ? fm(x.rem) : '0'}</b></td><td>${tagOf(x)}</td>${lateCells(x)}</tr>`; }).join('')}</tbody>
        <tfoot><tr><td></td><td>Cộng</td><td class="num">${fm(total)}</td><td class="num">${fm(paid)}</td><td class="num">${fm(rem)}</td><td></td><td class="ad-g1"></td><td></td><td class="num">${g.late_rate != null ? fm(late) : '—'}</td></tr></tfoot></table></div>`
          : '<div class="ad-empty">Hợp đồng chưa có lịch thanh toán — mở hợp đồng để lập lịch</div>'}</div>`}
      <div class="ad-card"><div class="ad-card-head">Lịch sử thu – chi<span class="ad-card-extra">Thu <b class="ad-c-success">${fm(g.thu_asof)}</b> · Chi <b class="ad-c-error">${fm(g.chi_asof)}</b> · đến ${dmy(T)}</span></div>
        ${allV.length ? `<div class="ad-table-wrap"><table class="ad-table ad-table-click"><thead><tr><th>Ngày</th><th>Số phiếu</th><th class="num">Thu</th><th class="num">Chi</th><th>Đã trừ vào</th><th>Nội dung</th></tr></thead>
        <tbody>${allV.map(x => { const amt = x.ok ? fm(x.amount) : `<s>${fm(x.amount)}</s>`; return `<tr class="${!x.ok || x.after ? 'ad-row-off' : ''}" data-vo="${x.ent}:${x.id}"><td class="nowrap">${dmy(x.on)}</td><td class="nowrap"><b>${esc(x.no || '')}</b>${!x.ok ? ' ' + tag('Đã hủy', 'error') : ''}</td>
          <td class="num ad-c-success">${x.typ === 'thu' ? amt : ''}</td><td class="num ad-c-error">${x.typ === 'chi' ? amt : ''}</td><td>${where(x)}</td><td><div class="cd-txt">${esc(x.content || '')}</div></td></tr>`; }).join('')}</tbody></table></div>`
          : '<div class="ad-empty">Chưa có phiếu thu / phiếu chi</div>'}</div>
      <details class="ad-collapse"><summary>${ico('fa-chevron-right')} Cách tính</summary><ul>
        <li>Phiếu thu có chọn «Đợt thu» thì trừ vào đúng đợt đó; tiền dư hoặc phiếu không chọn đợt trừ vào đợt có hạn sớm nhất còn nợ (cột «Đã trừ vào»).</li>
        <li>Còn lại = phải thu − đã thu của đợt. Quá hạn = đợt đã qua hạn mà còn nợ.</li>
        <li>Lãi chậm trả tính trên <b>số tiền quá hạn lũy kế</b> của cả hợp đồng = cộng phần còn nợ của mọi đợt đã quá hạn. Mỗi khi có đợt mới đến hạn hoặc khách trả tiền thì sang khoảng mới; mỗi khoảng = số tiền quá hạn lũy kế × số ngày × lãi suất %/năm ÷ 365, ghi ở dòng của đợt đến hạn gần nhất (khoảng cuối tính đến ${dmy(T)}).</li>
        ${I.some(x => x.virt) ? '<li>Lịch thanh toán của hợp đồng này không có dòng phí bảo trì riêng nên phí bảo trì được tách khỏi đợt chứa nó để theo dõi riêng; tổng phải thu không đổi.</li>' : ''}
        <li>Phiếu chi (hoàn tiền, hoàn cọc, thanh lý…) là tiền công ty trả lại khách, không làm giảm số khách đã nộp theo từng đợt.</li></ul></details></div>`;
    wireSegDate(main);
    $('.ad-asof', main).addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (v === null || !v) return; to = v; await draw(); }));
    $('#cdBack', main).onclick = back;
    $('#cdOpen', main).onclick = () => openDetail('contract', id, vay ? undefined : 'debt');
    $('#cdRate', main) && ($('#cdRate', main).onchange = run(async e => { const r = await api('PUT', `/api/contract-track/${id}/late-rate`, { rate: e.target.value.trim() }); toast(r.late_rate == null ? 'Đã bỏ lãi suất chậm trả' : `Đã lưu lãi suất ${fnum(r.late_rate)} %/năm`); await draw(); }));
    main.onclick = run(async e => {
      const n = e.target.closest('[data-vnew]');
      if (n) return openForm(n.dataset.vnew, { preset: { contract_id: id, contract_id__l: c.number, voucher_date: today(), ...(n.dataset.vnew === 'payment' ? { kind: vay ? 'tra_lai' : ['thue', 'thue_mua'].includes(c.kind) ? 'hoan_coc' : 'hoan_tien' } : {}) }, onSaved: async () => { await draw(); } });
      const o = e.target.closest('[data-vo]'); if (o) { const [ent, vid] = o.dataset.vo.split(':'); return openDetail(ent, +vid); }
    });
  };
  ST.reload = async () => { if ($('.cd', main)) await draw(); };
  await draw();
};

// Theo dõi công nợ đến hạn (CN-11, 17/11/2026): từng đợt thu chưa thu đủ có hạn ≤ hôm nay của HĐ còn hiệu lực — tự tải lại khi lưu phiếu thu / sửa hạn ở bất kỳ đâu
// 17/11/2026: Báo cáo công nợ đến hạn tự động (CN-11) — tại ngày chốt: mỗi dòng 1 khoản đến hạn chưa thanh toán đủ của 1 hợp đồng; phải thu / phải trả (HĐ vay) tách riêng, không bù trừ
// 17/11/2026: lịch sử theo căn — «Lịch sử kế hoạch thu» và «Lịch sử nhắc nợ», mới nhất trước; mỗi lần 1 dòng riêng, thay đổi ghi trước → sau (không ghi đè)
const ddHistHtml = (h, only, act = '') => {
  const chg = xs => xs.map(c => `<div><span class="muted">${esc(c.l)}:</span> <s class="muted">${esc(c.from)}</s> → <b>${esc(c.to)}</b></div>`).join('');
  const P = `<div class="sec-title">${ico('fa-calendar-check')} Lịch sử đưa vào kế hoạch thu <span class="small muted">(${h.plans.length} lần ghi nhận${h.tab ? ' · ' + (h.tab === 'thue' ? 'công nợ cho thuê' : 'công nợ bán hàng') : ''})</span></div>
    ${h.plans.length ? `<div class="tbl-wrap"><table class="t compact noclick"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Kỳ kế hoạch</th><th class="num">Số tiền</th><th>Nội dung thay đổi / ghi chú</th><th>Hợp đồng · khách hàng</th></tr></thead><tbody>
      ${h.plans.map(x => `<tr><td style="white-space:nowrap">${dmyhm(x.at)}</td><td>${esc(x.who)}</td><td><b>${esc(x.act)}</b></td><td>${esc(x.period || '')}</td><td class="num">${x.amount != null ? fm(x.amount) : ''}</td>
        <td class="small" style="white-space:normal;min-width:300px;max-width:420px">${chg(x.changes)}${x.note ? `<div class="muted">${esc(x.note)}</div>` : ''}</td><td class="small">${esc(x.contract)}<div class="muted">${esc(x.customer)}</div></td></tr>`).join('')}</tbody></table></div>` : '<div class="small muted">Chưa có lần đưa vào kế hoạch thu</div>'}`;
  const Cl = `<div style="display:flex;align-items:center;gap:12px"><div class="sec-title" style="flex:1;min-width:0">${ico('fa-phone-volume')} Lịch sử nhắc nợ <span class="small muted">(${h.calls.length} lần)</span></div>${act}</div>
    ${h.calls.length ? `<div class="tbl-wrap"><table class="t compact noclick"><thead><tr><th>Ngày giờ</th><th>Người thực hiện</th><th>Hình thức</th><th>Nội dung nhắc</th><th>Phản hồi khách hàng</th><th>Cam kết thanh toán</th><th>Hẹn nhắc tiếp</th><th>Kết quả</th><th>Hợp đồng</th></tr></thead><tbody>
      ${h.calls.map(x => `<tr><td style="white-space:nowrap">${dmyhm(x.at)}</td><td>${esc(x.who)}</td><td>${esc(x.channel)}${x.contact ? `<div class="small muted">${esc(x.contact)}</div>` : ''}</td><td class="small" style="white-space:pre-wrap">${esc(x.content)}</td>
        <td class="small" style="white-space:pre-wrap">${esc(x.feedback)}</td><td>${x.promise_amount ? fm(x.promise_amount) : ''}${x.promise_on ? `<div class="small">ngày ${dmy(x.promise_on)}</div>` : ''}</td><td>${x.next_on ? dmy(x.next_on) : ''}</td><td>${esc(x.result)}</td>
        <td class="small">${esc(x.contract)}<div class="muted">${esc(x.kind_l)}${x.closed ? ' · đã thanh lý' : ''}</div></td></tr>
        ${x.note || x.edits.length ? `<tr><td></td><td colspan="8" class="small">${x.note ? `<div><span class="muted">Ghi chú:</span> ${esc(x.note)}</div>` : ''}${x.edits.map(e => `<div class="muted">Đã sửa ${dmyhm(e.at)} · ${esc(e.who)}:</div>${chg(e.changes)}`).join('')}</td></tr>` : ''}`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có lần nhắc nợ' + (act ? ' — bấm «Thêm lần nhắc» để ghi lần đầu' : '') + '</div>'}`;
  return only === 'calls' ? Cl : only === 'plans' ? P : Cl + P; };
const ddHistModal = async (q, tab, only, act = '') => { const h = await api('GET', '/api/due-debt/unit-history?' + new URLSearchParams({ ...q, ...(tab ? { tab } : {}) }));
  return modal({ wide: true, title: `${ico('fa-clock-rotate-left')} Lịch sử ${only === 'calls' ? 'nhắc nợ' : only === 'plans' ? 'kế hoạch thu' : 'kế hoạch thu & nhắc nợ'} · căn ${esc(h.unit)}`,
    body: `<div class="small muted mb">Khách hàng: ${esc(h.customers.join(', '))} · lịch sử giữ nguyên cả khi đã thu đủ hoặc hợp đồng đã thanh lý</div>${ddHistHtml(h, only, act)}` }); };
V.duedebt = async main => {
  const f = filt(), s = ST.duedebt ||= { q: '', kind: '', dir: '', grp: '', bank: '', owner: '', from: '', to: '', tab: 'ban' };
  // 17/11/2026: 2 sheet — «Công nợ bán hàng đến hạn» (tiền căn hộ, phí bảo trì, hoàn thiện / nội thất: HĐMB, thuê mua, hoàn thiện, tiến độ HĐMB của HĐ thuê / vay, gốc khách chuyển HĐ vay bán căn)
  // và «Công nợ cho thuê đến hạn» (kỳ tiền thuê nhà + nội thất, khoản thu theo HĐ thuê); gốc / lãi HĐ vay công ty phải trả khách không đưa vào 2 sheet phải thu
  s.tab ||= 'ban';
  const TABS = [['ban', '1. Công nợ bán hàng đến hạn', 'Bảng tổng hợp công nợ'], ['thue', '2. Công nợ cho thuê đến hạn', 'Theo dõi công nợ cho thuê']];
  const tabOf = r => r.dir !== 'thu' ? null : r.kind === 'thue' && r.src === 'lich' ? 'thue' : 'ban';
  const G = (g, cs) => cs.map(c => [c[0], c[1], c[2], g]);
  const cols = [...G('Căn hộ, khách hàng', [['project', 'Dự án'], ['building', 'Tòa'], ['unit', 'Mã căn'], ['kcode', 'Mã khách hàng'], ['customer', 'Họ tên'], ['phone', 'Số điện thoại']]),
    ...G('Hợp đồng', [['kind_l', 'Loại hợp đồng'], ['number', 'Số hợp đồng'], ['status_l', 'Trạng thái HĐ']]),
    ...G('Khoản đến hạn', [['dir_l', 'Chiều công nợ'], ['dot', 'Đợt / kỳ'], ['content', 'Nội dung'], ['due_on', 'Ngày đến hạn', 'date'], ['days', 'Số ngày quá hạn', 'int']]),
    ...G('Số tiền', [['amount', 'Phải thanh toán theo đợt', 'money'], ['paid', 'Đã thanh toán', 'money'], ['rem', 'Còn phải thanh toán', 'money'], ['lai', 'Lãi quá hạn còn phải thu', 'money'], ['total_rem', 'Tổng còn phải thanh toán', 'money']]),
    ...G('Phân loại', [['grp_l', 'Nhóm nợ']]),
    ...G('Vay ngân hàng', [['loan_l', 'Tình trạng vay vốn'], ['bank', 'Ngân hàng'], ['loan_plan', 'Số tiền / ngày dự kiến giải ngân']]),
    ...G('Nhắc nợ', [['call_on', 'Ngày nhắc gần nhất', 'date'], ['call_l', 'Kết quả'], ['call_n', 'Lịch sử nhắc nợ', 'int']]),
    ...G('Kế hoạch thu / chi', [['plan_on', 'Ngày dự kiến', 'date'], ['plan_amt', 'Số tiền', 'money'], ['plan_src', 'Nguồn tiền'], ['plan_owner', 'Người phụ trách'], ['plan_st', 'Trạng thái'], ['plan_note', 'Ghi chú']]),
    ['_act', '', null, '']];
  // 17/11/2026: tổng hợp theo mã căn — mỗi căn 1 dòng (gộp mọi khoản đến hạn của HĐMB, thuê, vay, hoàn thiện); phải trả HĐ vay ở cột riêng, không bù trừ; «Xem chi tiết» = từng HĐ / đợt / thu chi
  const UC = [...G('Căn hộ, khách hàng', [['project', 'Dự án'], ['building', 'Tòa'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['phone', 'Số điện thoại']]),
    ...G('Phải thu khách hàng', [['amount', 'Phải thu đến hạn', 'money'], ['paid', 'Đã thu phân bổ cho khoản đến hạn', 'money'], ['rem', 'Còn phải thu đến hạn', 'money'], ['lai', 'Lãi quá hạn', 'money'], ['total_rem', 'Tổng còn phải thu', 'money']]),

    ...G('Phân loại', [['grp_l', 'Nhóm nợ'], ['days', 'Quá hạn lâu nhất (ngày)', 'int']]),
    ...G('Vay ngân hàng', [['loan_l', 'Tình trạng vay / ngân hàng']]),
    ...G('Nhắc nợ', [['call_l', 'Nhắc nợ gần nhất'], ['call_n', 'Lịch sử nhắc nợ', 'int']]),
    ...G('Kế hoạch thu', [['plan_on', 'Đưa vào kế hoạch thu']]),
    ['_act', '', null, '']];
  const SUM = ['amount', 'paid', 'rem', 'lai', 'total_rem'], groups = UC.map(c => c[3] || '');
  const byUnit = rs => { const M = new Map();
    for (const r of rs) { const u = M.get(r.unit_id) || M.set(r.unit_id, { unit_id: r.unit_id, project: r.project, building: r.building, unit: r.unit, cust: new Set(), ph: new Set(), items: [], amount: 0, paid: 0, rem: 0, lai: 0, noLai: 0, total_rem: 0, tra_goc: 0, tra_lai: 0, days: -1, loans: new Set(), calls: new Map(), plans: new Map(), cts: new Set() }).get(r.unit_id);
      u.items.push(r); u.cts.add(r.contract_id); if (r.customer) u.cust.add(r.customer); if (r.phone) u.ph.add(r.phone);
      if (r.dir === 'thu') { u.amount += +r.amount || 0; u.paid += +r.paid || 0; u.rem += +r.rem || 0; if (r.lai == null) u.noLai++; else u.lai += +r.lai || 0; if (r.lai_na) u.naLai = (u.naLai || 0) + 1; u.total_rem += +r.total_rem || 0; u.days = Math.max(u.days, r.days); }
      else if (r.src === 'lai_vay') u.tra_lai += +r.rem || 0; else u.tra_goc += +r.rem || 0;
      if (r.loan_l || r.bank) u.loans.add([r.loan_l, r.bank].filter(Boolean).join(' · '));
      if (r.call_n) u.calls.set(r.contract_id, { on: r.call_on, l: r.call_l, n: r.call_n }); if (r.plan_amt != null) u.plans.set(r.contract_id, { on: r.plan_on, amt: r.plan_amt, src: r.plan_src, st: r.plan_st }); }
    return [...M.values()].map(u => { const cl = [...u.calls.values()].sort((a, b) => String(b.on).localeCompare(String(a.on))), pl = [...u.plans.values()];
      const g = u.days < 0 ? null : u.days <= 0 ? 'den_han' : u.days <= 30 ? 'qh30' : u.days <= 60 ? 'qh60' : u.days <= 90 ? 'qh90' : 'qh90p';
      return { ...u, customer: [...u.cust].join(', '), phone: [...u.ph].join(', '), n_ct: u.cts.size, days: Math.max(0, u.days), grp: g, grp_l: g ? (d.grps || []).find(x => x[0] === g)?.[1] : 'Chỉ có phải trả HĐ vay',
        loan_l: [...u.loans].join('; '), call_n: cl.reduce((t, c) => t + c.n, 0), call_l: cl[0] ? `${dmy(cl[0].on)} · ${cl[0].l}` : '',
        lai_l: u.noLai ? `${u.noLai} khoản chưa đủ thông tin tính lãi` : '', ...planOf(u.unit_id, u.items) }; }); };
  // kế hoạch thu của căn trong tab đang xem (nhiều lần dự kiến thu / căn); hợp đồng chính để ghi nhắc nợ / kế hoạch = HĐ còn nợ nhiều nhất của căn trong tab
  const planOf = (uid, items) => { const tab = items[0] ? tabOf(items[0]) : s.tab, ps = [];
    const byC = new Map(); for (const r of items) byC.set(r.contract_id, (byC.get(r.contract_id) || 0) + (+r.rem || 0)); const main = [...byC.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { plans: ps, main_ct: main, main_no: items.find(r => r.contract_id === main)?.number || '', plan_amt: ps.reduce((t, p) => t + p.expected, 0), plan_act: ps.reduce((t, p) => t + p.actual, 0), plan_rem: ps.reduce((t, p) => t + p.rem, 0),
      plan_warn: 0, plan_l: '', plan_hist: (d.plan_hist || {})[`${tab}:${uid}`] || 0, planned: (d.planned || {})[`dd:${tab}:${uid}`] || null, plan_on: (d.planned || {})[`dd:${tab}:${uid}`]?.l || '' }; };
  let d = { rows: [] };
  const shown = (tab = s.tab) => { const q = s.q.trim().toLowerCase(); return d.rows.filter(r => tabOf(r) === tab && (!s.kind || r.kind === s.kind) && (!s.grp || r.grp === s.grp) && (!s.bank || r.bank === s.bank)
    && (!s.owner || r.owner === s.owner || r.plan_owner === s.owner) && (!q || [r.unit, r.customer, r.kcode, r.number, r.content, r.phone].some(x => String(x || '').toLowerCase().includes(q)))); };
  const sum = (xs, k) => xs.reduce((t, r) => t + (+r[k] || 0), 0);
  // 17/11/2026: kế hoạch thu tuần / tháng của tab — Kế hoạch – Thực thu – Còn phải thu theo kế hoạch – Tỷ lệ hoàn thành; cảnh báo kế hoạch quá ngày chưa thu đủ; chuyển lịch (giữ kế hoạch cũ)
  s.pgrp ||= 'tuan';
  const plansIn = () => { const q = s.q.trim().toLowerCase(); return (d.plans || []).filter(p => p.tab === s.tab && (!q || [p.unit, p.customer, p.number].some(x => String(x || '').toLowerCase().includes(q)))); };
  const planAgg = (ps, by) => { const M = new Map(); for (const p of ps) { const k = by === 'tuan' ? p.week : p.month, g = M.get(k) || M.set(k, { k, l: by === 'tuan' ? p.week_l : 'Tháng ' + p.month_l, n: 0, expected: 0, actual: 0, rem: 0, warn: 0 }).get(k);
    g.n++; g.expected += p.expected; g.actual += p.actual; g.rem += p.rem; if (p.warn) g.warn++; } return [...M.values()].sort((a, b) => a.k.localeCompare(b.k)).map(g => ({ ...g, pct: g.expected ? Math.round(g.actual / g.expected * 1000) / 10 : 0 })); };
  const PC = [['l', 'Kỳ'], ['n', 'Số lần dự kiến', 'int'], ['expected', 'Kế hoạch', 'money'], ['actual', 'Thực thu', 'money'], ['rem', 'Còn phải thu theo kế hoạch', 'money'], ['pct', 'Tỷ lệ hoàn thành (%)', 'num'], ['warn', 'Quá ngày chưa thu đủ', 'int']];
  const PD = [['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['number', 'Hợp đồng'], ['expected_on', 'Ngày dự kiến thu', 'date'], ['week_l', 'Kỳ kế hoạch'], ['month_l', 'Tháng'], ['expected', 'Kế hoạch', 'money'], ['actual', 'Thực thu', 'money'], ['rem', 'Còn phải thu theo KH', 'money'], ['pct', 'Tỷ lệ (%)', 'num'], ['src_l', 'Nguồn tiền'], ['owner', 'Người phụ trách'], ['st_l', 'Trạng thái'], ['note', 'Ghi chú'], ['warn', 'Cảnh báo'], ['_pa', '']];
  const drawPlan = () => { const box = $('#ddPlan', main); if (!box) return; const ps = plansIn(), ag = planAgg(ps, s.pgrp), T = TABS.find(x => x[0] === s.tab);
    const pcell = (c, p) => c[0] === '_pa' ? `<button class="btn sm ghost" data-resched="${p.id}" title="Chuyển ngày / số tiền — kế hoạch cũ được giữ lại để đối chiếu">${ico('fa-calendar-plus')} Chuyển lịch</button>${p.hist.length ? `<div class="small muted" title="${esc(p.hist.map(h => dmy(h.on) + ' · ' + fm(h.amt)).join(' → '))}">đã chuyển ${p.hist.length} lần${p.resched ? ': ' + esc(p.resched) : ''}</div>` : ''}`
      : c[0] === 'warn' ? (p.warn ? `<span class="neg small">${ico('fa-triangle-exclamation')} ${esc(p.warn)}</span>` : '') : undefined;
    box.innerHTML = `<div class="sec-title st-big">${ico('fa-calendar-week')} Kế hoạch thu ${s.pgrp === 'tuan' ? 'theo tuần' : 'theo tháng'} — ${esc(T[1].replace(/^\d\.\s*/, ''))}
        <span class="grow"></span><span class="seg" style="font-size:12px"><button type="button" class="btn sm ${s.pgrp === 'tuan' ? 'pri' : 'ghost'}" data-pgrp="tuan">Theo tuần</button><button type="button" class="btn sm ${s.pgrp === 'thang' ? 'pri' : 'ghost'}" data-pgrp="thang">Theo tháng</button></span></div>
      ${ps.length ? rowsTable(PC, ag, ['n', 'expected', 'actual', 'rem', 'warn'], { no: 'STT', click: false, cell: (c, g) => c[0] === 'warn' ? (g.warn ? `<span class="neg">${g.warn}</span>` : '0') : undefined })
        + `<div class="sec-title">Chi tiết các lần dự kiến thu</div>` + rowsTable(PD, ps, ['expected', 'actual', 'rem'], { no: 'STT', click: false, cell: pcell })
        : '<div class="empty">Chưa có kế hoạch thu — bấm «Thêm kế hoạch» ở cột Kế hoạch thu của từng căn, hoặc «Đưa vào kế hoạch thu» từ cam kết trong lịch sử nhắc nợ</div>'}
      <div class="small muted mt">Thực thu = phiếu thu hợp lệ của hợp đồng từ ngày lập kế hoạch đến «Đến ngày», phân bổ lần lượt cho các lần dự kiến theo ngày (mỗi phiếu chỉ tính 1 lần); số kế hoạch giữ nguyên để đối chiếu. Chuyển lịch tạo kế hoạch mới, kế hoạch cũ chuyển «Đã thay thế» và ghi lý do.</div>`; };
  const draw = () => {
    const rs = shown(), thu = rs, noLai = thu.filter(r => r.lai == null).length, T = TABS.find(x => x[0] === s.tab);
    $('#ddTabs', main).innerHTML = TABS.map(([k, l, src]) => `<button type="button" class="${s.tab === k ? 'on' : ''}" data-ddtab="${k}" title="Nguồn: ${src}">${l}<span class="c">${byUnit(shown(k)).length}</span></button>`).join('');
    // 17/11/2026 (thiết kế lại): 5 ô tổng hợp nhỏ theo tab + bộ lọc; cảnh báo thiếu căn cứ tính lãi = biểu tượng, bấm xem chi tiết
    const nPlan = byUnit(rs).filter(u => u.planned).length, nUnit = new Set(thu.map(r => r.unit_id)).size;
    const kt = (l, v, sub, cls = '') => `<div class="dd-kt ${cls}"><span class="l">${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    $('#ddK', main).innerHTML = kt('Phải thu đến hạn', fm(sum(thu, 'amount')), `${nUnit} căn · ${thu.length} khoản`)
      + kt('Đã thu phân bổ', fm(sum(thu, 'paid')), 'cho các khoản đến hạn')
      + kt('Còn phải thu', fm(sum(thu, 'rem')), `quá hạn ${fm(sum(thu.filter(r => r.days > 0), 'rem'))}`, thu.some(r => r.days > 0) ? 'red' : '')
      + kt(`Lãi quá hạn${noLai ? ` <a href="#" class="dd-warn" data-nolai="1" title="${noLai} khoản chưa đủ căn cứ tính lãi — bấm xem">${ico('fa-triangle-exclamation')} ${noLai}</a>` : ''}`, fm(sum(thu, 'lai')), noLai ? 'thiếu căn cứ tính lãi ở ' + noLai + ' khoản' : 'theo lãi suất quá hạn của HĐ')
      + kt('Tổng còn phải thu', fm(sum(thu, 'total_rem')), `${nPlan} căn đã đưa vào kế hoạch thu`, 'tot');
    $('#ddAdvN', main).textContent = [s.kind, s.grp, s.bank, s.owner].filter(Boolean).length ? `(${[s.kind, s.grp, s.bank, s.owner].filter(Boolean).length})` : '';
    const opt = (id, cur, list, all) => { const el = $(id, main); if (el) el.innerHTML = `<option value="">${all}</option>${list.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}`; };
    opt('#ddKind', s.kind, d.kinds || [], 'Mọi loại hợp đồng'); opt('#ddGrp', s.grp, d.grps || [], 'Mọi nhóm nợ');
    opt('#ddBank', s.bank, (d.banks || []).map(b => [b, b]), 'Mọi ngân hàng'); opt('#ddOwn', s.owner, (d.owners || []).map(b => [b, b]), 'Mọi người phụ trách');
    const cell = (c, r) => c[0] === '_act' ? (r.dir === 'thu' && r.inst_id && d.can_thu ? `<button class="btn sm" data-rc="${r.inst_id}" title="Lập phiếu thu cho khoản này (số tiền = còn phải thanh toán)">${ico('fa-plus')} Phiếu thu</button>`
        : r.dir === 'tra' && r.loan_pay_id ? `<button class="btn sm" data-pc="${r.loan_pay_id}" title="Lập phiếu chi trả khách">${ico('fa-plus')} Phiếu chi</button>` : '')
      : c[0] === 'grp_l' ? pill(r.grp_l, r.days > 90 ? 'r' : r.days > 30 ? 'r' : r.days > 0 ? 'a' : 'b')
      : c[0] === 'dir_l' ? pill(r.dir === 'thu' ? 'Phải thu' : 'Phải trả', r.dir === 'thu' ? 'b' : 'v')
      : c[0] === 'lai' && r.lai == null ? `<span class="small muted">${esc(r.lai_l)}</span>`
      : c[0] === 'call_n' ? (r.call_n ? `<a href="#" data-calls="${r.contract_id}">${r.call_n} lần</a>` : '<span class="muted">—</span>') : undefined;
    const us = byUnit(rs); d.units = us;
    // 17/11/2026 (thiết kế lại): 1 dòng / mã căn — cố định Mã căn, Khách hàng, Thao tác khi kéo ngang; cố định tiêu đề khi cuộn dọc; dòng gọn; Tổng cộng nổi bật
    const grpPill = u => u.grp ? `<span class="dd-g ${u.days > 90 ? 'g4' : u.days > 30 ? 'g3' : u.days > 0 ? 'g2' : 'g1'}">${esc(u.grp_l)}</span>` : `<span class="small muted">${esc(u.grp_l)}</span>`;
    // 17/11/2026: cột gọn — Nhắc nợ: chỉ lần nhắc gần nhất; Kế hoạch thu: ô tích + kỳ đã chọn (bấm kỳ để sửa kỳ / số tiền). Lịch sử nhắc nợ / kế hoạch xem trong «Xem chi tiết»
    const callC = u => u.call_l ? esc(u.call_l) : '<span class="muted">chưa nhắc</span>';
    const planC = u => `<label class="chk" title="Tích: chọn tháng/năm, tuần và số tiền dự kiến → tạo khoản thu ở Kế hoạch thu tuần/tháng. Bỏ tích: gỡ khoản chưa có thực thu"><input type="checkbox" data-ddplan="${u.unit_id}" ${u.planned ? 'checked' : ''} ${d.can_plan ? '' : 'disabled'}>${u.planned ? '' : ' <span class="muted">Đưa vào kế hoạch thu</span>'}</label>`
      + (u.planned ? ` ${d.can_plan ? `<a href="#" data-ddplanedit="${u.unit_id}" title="Số tiền dự kiến ${fm(u.planned.amt)} — bấm để sửa kỳ / số tiền"><b>${esc(u.planned.l)}</b></a>` : `<b title="Số tiền dự kiến ${fm(u.planned.amt)}">${esc(u.planned.l)}</b>`}` : '');
    $('#ddT', main).innerHTML = us.length ? `<div class="dd-tw"><table class="dd-t"><thead>
        <tr class="h1"><th class="s1" rowspan="2">Mã căn</th><th class="s2" rowspan="2">Khách hàng</th><th colspan="5">Công nợ</th><th colspan="2">Phân loại</th><th rowspan="2">Ngân hàng</th><th rowspan="2">Nhắc nợ</th><th rowspan="2">Kế hoạch thu</th><th class="sr" rowspan="2">Thao tác</th></tr>
        <tr class="h2"><th class="n">Phải thu đến hạn</th><th class="n">Đã thu</th><th class="n">Còn phải thu</th><th class="n">Lãi quá hạn</th><th class="n">Tổng còn phải thu</th><th>Nhóm nợ</th><th class="n">Quá hạn lâu nhất</th></tr></thead><tbody>
        ${us.map((u, i) => `<tr data-i="${i}"><td class="s1"><b>${esc(u.unit)}</b><div class="small muted">${esc(u.project)} · ${esc(u.building)}</div></td><td class="s2">${esc(u.customer)}<div class="small muted">${esc(u.phone || '')}</div></td>
          <td class="n">${fm(u.amount)}</td><td class="n">${fm(u.paid)}</td><td class="n"><b>${fm(u.rem)}</b></td><td class="n">${!u.lai && !u.noLai && u.naLai ? '<span class="small muted">Không áp dụng lãi</span>' : fm(u.lai)}${u.noLai ? ` <a href="#" class="dd-warn" data-nolai="${u.unit_id}" title="${esc(u.lai_l)} — bấm xem">${ico('fa-triangle-exclamation')}</a>` : ''}</td><td class="n"><b>${fm(u.total_rem)}</b></td>
          <td>${grpPill(u)}</td><td class="n">${u.days ? u.days + ' ngày' : '—'}</td><td class="small">${esc(u.loan_l) || '<span class="muted">—</span>'}</td><td class="small">${callC(u)}</td><td class="small">${planC(u)}</td>
          <td class="sr"><button type="button" class="btn xs" data-uview="${u.unit_id}">${ico('fa-list')} Xem chi tiết</button></td></tr>`).join('')}</tbody>
        <tfoot><tr><td class="s1" colspan="2">Tổng cộng · ${us.length} căn</td><td class="n">${fm(sum(us, 'amount'))}</td><td class="n">${fm(sum(us, 'paid'))}</td><td class="n">${fm(sum(us, 'rem'))}</td><td class="n">${fm(sum(us, 'lai'))}</td><td class="n">${fm(sum(us, 'total_rem'))}</td><td colspan="5"></td><td class="sr"></td></tr></tfoot></table></div>`
      : '<div class="empty">Không có căn nào còn công nợ đến hạn theo bộ lọc</div>';
    $('#ddN', main).textContent = `${us.length} căn · ${rs.length} khoản · từ ${d.from ? dmy(d.from) : 'đầu'} đến ${dmy(d.asof)} · đồng bộ ${dmyhm(d.synced_at)}`;
  };
  const load = async () => { const ok = latest(main), r = await api('GET', '/api/due-debt?' + qsOf({ project: f.project, building: f.building, to: s.to, from: s.from })); if (ok()) { d = r; draw(); } };
  const sel = (id, list, cur) => `<select class="inp" id="${id}" style="width:auto;height:30px">${list.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  // 17/11/2026 (thiết kế lại): tiêu đề trái, Xuất Excel / In-PDF phải; bộ lọc gom 1 khu vực (tìm kiếm, dự án, tòa, từ ngày – đến ngày) + «Lọc nâng cao» (loại HĐ, nhóm nợ, ngân hàng, người phụ trách) + tra cứu lịch sử căn
  main.innerHTML = `<div class="page dd2">${head('06', 'Báo cáo công nợ đến hạn', 'fa-calendar-xmark', `<button class="btn" id="ddX">${ico('fa-file-excel')} Xuất Excel</button><button class="btn" id="ddP">${ico('fa-print')} In / PDF</button>`, 'CN-11')}
    <div class="card mb dd-f"><div class="dd-fr"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="ddQ" placeholder="Tìm mã căn, khách hàng, SĐT, số HĐ…" value="${esc(s.q)}"></div>
      <select id="fP"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+f.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>
      <select id="fB"></select>
      <span id="ddDates" class="dd-dt"><span class="small muted" title="Ngày đến hạn thanh toán từ ngày — để trống = mọi khoản còn nợ có hạn đến «Đến ngày»">Từ ngày</span>${segDate('ddFr', s.from)}<span class="small muted" title="Đã thu, còn phải thu, lãi quá hạn tính đến ngày này (mặc định hôm nay)">Đến ngày</span>${segDate('ddTo', s.to || today())}</span>
      <button type="button" class="btn sm ghost" id="ddAdv">${ico('fa-sliders')} Lọc nâng cao <span id="ddAdvN"></span></button>
      <button type="button" class="btn sm ghost" id="ddHist" title="Tra lịch sử kế hoạch thu và nhắc nợ của 1 căn — kể cả căn đã thu đủ / đã đóng theo dõi">${ico('fa-clock-rotate-left')} Tra cứu lịch sử căn</button></div>
      <div class="dd-fr dd-adv" id="ddAdvBox" ${s.adv ? '' : 'hidden'}><select id="ddKind"></select><select id="ddGrp"></select><select id="ddBank"></select><select id="ddOwn"></select><button type="button" class="btn sm ghost" id="ddClr">Bỏ lọc nâng cao</button></div></div>
    <div class="dd-k mb" id="ddK"></div>
    <div class="card dd-c"><div class="tabs" id="ddTabs"></div><div class="dd-top"><span class="small"><b>Đơn vị: đồng</b></span><span class="grow"></span><span class="small muted" id="ddN"></span></div><div id="ddT"><div class="empty">Đang tải…</div></div></div></div>`;
  wireFilter(main, f, load);
  // tòa theo dự án đang chọn; Lọc nâng cao (ẩn / hiện, đếm số điều kiện đang lọc)
  const bOpts = () => { $('#fB', main).innerHTML = '<option value="">Tất cả tòa</option>' + M.buildings.filter(b => !f.project || b.project_id === +f.project).map(b => `<option value="${b.id}" ${+f.building === b.id ? 'selected' : ''}>Tòa ${esc(b.code)}</option>`).join(''); };
  bOpts(); $('#fP', main).onchange = e => { f.project = e.target.value; f.building = ''; bOpts(); load(); };
  $('#ddAdv', main).onclick = () => { s.adv = !s.adv; $('#ddAdvBox', main).hidden = !s.adv; };
  $('#ddClr', main).onclick = () => { s.kind = s.grp = s.bank = s.owner = ''; draw(); };
  $('#ddQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  for (const [id, k] of [['#ddKind', 'kind'], ['#ddGrp', 'grp'], ['#ddBank', 'bank'], ['#ddOwn', 'owner']]) $(id, main).onchange = e => { s[k] = e.target.value; draw(); };
  $('#ddTabs', main).onclick = e => { const b = e.target.closest('[data-ddtab]'); if (b) { s.tab = b.dataset.ddtab; draw(); } };
  // tích / bỏ «Đưa vào kế hoạch thu» — 1 khoản / căn / sheet, không tạo trùng; sửa ngày, số tiền, theo dõi thực thu ở «Kế hoạch dự kiến dòng thu-chi»
  // 17/11/2026: tích → hộp thoại chọn kỳ: tháng / năm (bắt buộc), tuần trong tháng (không bắt buộc — trống = «Chưa phân bổ tuần»), số tiền dự kiến (mặc định = còn phải thu đến hạn); Hủy = không tạo, không đánh dấu
  const MW = ym => { const [y, m] = ym.split('-').map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate(), W = [];
    for (let i = 1; i <= last;) { const dow = (new Date(Date.UTC(y, m - 1, i)).getUTCDay() + 6) % 7, e = Math.min(last, i + 6 - dow); W.push({ n: W.length + 1, from: `${ym}-${String(i).padStart(2, '0')}`, to: `${ym}-${String(e).padStart(2, '0')}` }); i = e + 1; }
    return W; };
  const ymAdd = (ym, k) => { const [y, m] = ym.split('-').map(Number), x = new Date(Date.UTC(y, m - 1 + k, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };
  const planDlg = u => new Promise(res => {
    const cur = u.planned, pr = (d.promises || {})[u.unit_id], base = (s.to || today()).slice(0, 7), ym0 = cur?.month || (pr || s.to || today()).slice(0, 7);
    const wk0 = cur ? cur.week : pr && pr.slice(0, 7) === ym0 ? (MW(ym0).find(w => w.from <= pr && pr <= w.to)?.n || 0) : 0;
    const months = [...new Set([...Array.from({ length: 16 }, (_, i) => ymAdd(today().slice(0, 7), i - 3)), ym0, base])].sort();
    const wOpts = (ym, sel) => `<option value="0">— Không chọn (chưa phân bổ tuần) —</option>` + MW(ym).map(w => `<option value="${w.n}" ${+sel === w.n ? 'selected' : ''}>Tuần ${w.n} (${dmy(w.from)} – ${dmy(w.to)})</option>`).join('');
    const m = modal({ title: `${cur ? 'Sửa kỳ' : 'Đưa vào kế hoạch thu'} — ${esc(u.unit)}`, narrow: true, onClose: () => res(null),
      body: `<div class="small muted" style="margin-bottom:8px">${esc(u.customer)} · ${s.tab === 'thue' ? 'Công nợ cho thuê' : 'Công nợ bán hàng'} · còn phải thu đến hạn <b>${fm(u.rem)}</b>${pr ? ` · khách cam kết ${dmy(pr)}` : ''}</div>
        <div class="fld"><label>Tháng / năm<span class="req">*</span></label><select class="inp" id="kpM">${months.map(x => `<option value="${x}" ${x === ym0 ? 'selected' : ''}>Tháng ${x.slice(5, 7)}/${x.slice(0, 4)}</option>`).join('')}</select></div>
        <div class="fld"><label>Tuần trong tháng <span class="small muted">(không bắt buộc)</span></label><select class="inp" id="kpW">${wOpts(ym0, wk0)}</select></div>
        <div class="fld"><label>Số tiền dự kiến thu<span class="req">*</span></label><input class="inp" id="kpA" inputmode="numeric" autocomplete="off" value="${moneyStr(cur ? cur.amt : u.rem)}"></div>
        <div class="small muted">Chỉ chọn tháng → kế hoạch tháng, «Chưa phân bổ tuần». Chọn cả tuần → vào tuần đó và cộng vào tháng (không tính trùng).</div>`,
      foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="kpOk">${ico('fa-check')} Xác nhận</button>` });
    $('#kpM', m.el).onchange = e => { $('#kpW', m.el).innerHTML = wOpts(e.target.value, 0); };
    $('#kpA', m.el).oninput = e => { const v = num(e.target.value, true); if (v != null && !isNaN(v)) e.target.value = moneyStr(v); };
    $('#kpOk', m.el).onclick = () => { const a = num($('#kpA', m.el).value, true); if (!(a > 0)) return toast('Nhập số tiền dự kiến thu > 0', true);
      m.el.remove(); res({ month: $('#kpM', m.el).value, week: +$('#kpW', m.el).value, amount: a }); };
  });
  const planSet = async (uid, on) => { const u = byUnit(shown()).find(x => x.unit_id === uid); if (!u) return;
    let body = { unit_id: uid, tab: s.tab, on, to: s.to || today() };
    if (on) { const v = await planDlg(u); if (!v) return false; body = { ...body, ...v }; }
    const r = await api('POST', '/api/due-debt/plan', body); toast(r.msg); await load(); return true; };
  $('#ddT', main).addEventListener('change', run(async e => { const c = e.target.closest('[data-ddplan]'); if (!c) return; e.stopPropagation();
    const on = c.checked; c.checked = !on;   /* chỉ đánh dấu sau khi xác nhận + lưu thành công */
    await planSet(+c.dataset.ddplan, on); }));
  $('#ddT', main).addEventListener('click', run(async e => { const a = e.target.closest('[data-ddplanedit]'); if (!a) return; e.preventDefault(); e.stopPropagation(); await planSet(+a.dataset.ddplanedit, true); }));
  wireSegDate(main); $('#ddDates', main).addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (v === null) return; if (e.target.id === 'ddFr') s.from = v; else s.to = v || today(); await load(); }));   // ô ngày dd/mm/yyyy
  const note = (k = s.tab) => `Tổng hợp theo mã căn hộ · ngày chốt báo cáo ${dmy(d.asof)}${d.from ? ` · hạn từ ${dmy(d.from)}` : ''} · đồng bộ dữ liệu lúc ${dmyhm(d.synced_at)} · ${byUnit(shown(k)).length} căn, ${shown(k).length} khoản · phải thu và phải trả tách riêng, không bù trừ`;
  $('#ddX', main).onclick = () => { const tab0 = s.tab, plansOf = k => { s.tab = k; const x = plansIn(); s.tab = tab0; return x; };
    download('/api/export-rows', { file: 'Bao_cao_cong_no_den_han_' + d.asof, title: 'BÁO CÁO CÔNG NỢ ĐẾN HẠN',
      sheets: [...TABS.map(([k, l, src]) => ({ name: l, title: l.replace(/^\d\.\s*/, '').toUpperCase() + ' (THEO CĂN HỘ)', cols: UC.filter(c => c[0] !== '_act').map(c => [c[0], c[1], c[2]]), groups: groups.filter((g, i) => UC[i][0] !== '_act'),
        rows: byUnit(shown(k)), sum: SUM, note: `Nguồn: ${src} · ` + note(k) })),
      ] }); };
  $('#ddP', main).onclick = () => {   // bản in / PDF theo bộ lọc đang chọn
    const pc = UC.filter(c => c[0] !== '_act'), PR = byUnit(shown());
    const v = (c, r) => c[2] === 'money' ? fm(r[c[0]] || 0) + (c[0] === 'lai' && r.noLai ? ` (${r.noLai} khoản chưa đủ thông tin)` : '') : c[2] === 'date' ? dmy(r[c[0]]) : esc(r[c[0]] ?? '');
    const w = window.open('', '_blank'); if (!w) return toast('Trình duyệt chặn cửa sổ in', true);
    w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo công nợ đến hạn ${dmy(d.asof)}</title><style>@page{size:A4 landscape;margin:10mm}body{font:10px Arial,sans-serif}h2{margin:0 0 4px;font-size:15px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:2px 3px;vertical-align:top}th{background:#eee}td.n{text-align:right;white-space:nowrap}</style></head><body>
      <h2>BÁO CÁO CÔNG NỢ ĐẾN HẠN — ${esc((TABS.find(x => x[0] === s.tab) || [])[1] || '')}</h2><div>${esc(note())}</div><br><table><thead><tr><th>STT</th>${pc.map(c => `<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${PR.map((r, i) => `<tr><td>${i + 1}</td>${pc.map(c => `<td class="${c[2] === 'money' || c[2] === 'int' ? 'n' : ''}">${v(c, r)}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><td></td>${pc.map(c => `<td class="n"><b>${SUM.includes(c[0]) ? fm(sum(PR, c[0])) : ''}</b></td>`).join('')}</tr></tfoot></table>
      ${(() => { const ps = []; if (!ps.length) return ''; const tb = (cs, rs, sm) => `<table><thead><tr><th>STT</th>${cs.map(c => `<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${rs.map((r, i) => `<tr><td>${i + 1}</td>${cs.map(c => `<td class="${c[2] === 'money' || c[2] === 'int' || c[2] === 'num' ? 'n' : ''}">${c[2] === 'money' ? fm(r[c[0]] || 0) : c[2] === 'date' ? dmy(r[c[0]]) : esc(r[c[0]] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><td></td>${cs.map(c => `<td class="n"><b>${sm.includes(c[0]) ? fm(sum(rs, c[0])) : ''}</b></td>`).join('')}</tr></tfoot></table>`;
        return `<br><h2>KẾ HOẠCH THU THEO TUẦN</h2>${tb(PC, planAgg(ps, 'tuan'), ['n', 'expected', 'actual', 'rem'])}<br><h2>KẾ HOẠCH THU THEO THÁNG</h2>${tb(PC, planAgg(ps, 'thang'), ['n', 'expected', 'actual', 'rem'])}<br><h2>CHI TIẾT CÁC LẦN DỰ KIẾN THU</h2>${tb(PD.filter(c => !['_pa', 'note'].includes(c[0])), ps, ['expected', 'actual', 'rem'])}`; })()}<script>setTimeout(() => print(), 300)</script></body></html>`); w.document.close();
  };
  main.onclick = run(async e => {
    const b = e.target.closest('[data-rc]');
    if (b) { const r = d.rows.find(x => x.inst_id === +b.dataset.rc); if (!r) return;
      return openForm('receipt', { preset: { contract_id: r.contract_id, contract_id__l: r.number, unit_id: r.unit_id, unit_id__l: r.unit, installment_id: r.inst_id, installment_id__l: r.content, voucher_date: today(), amount: r.rem, content: `Thu tiền ${r.dot}${r.content ? ' — ' + r.content : ''} căn ${r.unit}` }, onSaved: load }); }
    const pb = e.target.closest('[data-pc]');
    if (pb) { const r = d.rows.find(x => x.loan_pay_id === +pb.dataset.pc); if (!r) return;
      return openForm('payment', { preset: { contract_id: r.contract_id, contract_id__l: r.number, kind: r.src === 'lai_vay' ? 'tra_lai' : 'tra_goc', loan_pay_id: r.loan_pay_id, voucher_date: today(), amount: r.rem, content: `${r.content} ${r.dot} — HĐ vay ${r.number}` }, onSaved: load }); }
    const cl = e.target.closest('[data-calls]');
    if (cl) { e.preventDefault(); const x = await api('GET', `/api/e/debt_call?f_contract_id=${cl.dataset.calls}&limit=200`); const RL = Object.fromEntries(M.ents.debt_call.fields.find(z => z.k === 'result').o.map(o => [o[0], o[1]]));
      return modal({ title: `${ico('fa-phone')} Lịch sử nhắc nợ`, body: x.rows.length ? `<table class="t compact noclick"><thead><tr><th>Ngày gọi</th><th>Kết quả</th><th>Nội dung</th><th>Ngày cam kết</th></tr></thead><tbody>${x.rows.map(z => `<tr><td>${dmy(z.at)}</td><td>${esc(RL[z.result] || z.result || '')}</td><td>${esc(z.content || '')}</td><td>${dmy(z.promise_on)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Chưa có lần nhắc nợ</div>' }); }
    const ac = e.target.closest('[data-addcall]'), ap = e.target.closest('[data-addplan]'), upl = e.target.closest('[data-uplans]');
    if (ac || ap) { const u = d.units.find(x => x.unit_id === +(ac || ap).dataset[ac ? 'addcall' : 'addplan']); if (!u?.main_ct) return;
      if (ac) return openForm('debt_call', { preset: { contract_id: u.main_ct, contract_id__l: u.main_no }, onSaved: load });
      return openForm('collect_plan', { preset: { contract_id: u.main_ct, contract_id__l: u.main_no, scope: s.tab, expected_on: today(), expected: Math.max(0, u.rem - u.plan_rem) || u.rem, basis: 'lich_hd' }, onSaved: load }); }
    if (upl) { e.preventDefault(); const u = d.units.find(x => x.unit_id === +upl.dataset.uplans); s.q = u.unit; $('#ddQ', main).value = u.unit; draw(); return $('#ddPlan', main).scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    // cảnh báo thiếu căn cứ tính lãi: danh sách khoản chưa tính được lãi (theo tab + bộ lọc, hoặc của 1 căn)
    const nl = e.target.closest('[data-nolai]'); if (nl) { e.preventDefault(); e.stopPropagation(); const uid = +nl.dataset.nolai, xs = shown().filter(r => r.lai == null && (uid === 1 && nl.dataset.nolai === '1' ? true : r.unit_id === uid));
      return modal({ title: `${ico('fa-triangle-exclamation')} Khoản chưa đủ căn cứ tính lãi quá hạn`, wide: true, body: `<div class="small muted mb">Lãi quá hạn = còn phải thanh toán × lãi suất quá hạn của hợp đồng × số ngày quá hạn / 365. Các khoản dưới đây thuộc hợp đồng chưa ghi lãi suất quá hạn — bổ sung lãi suất ở hợp đồng để tính.</div>
        <div class="tbl-wrap"><table class="t compact noclick"><thead><tr><th>Mã căn</th><th>Khách hàng</th><th>Hợp đồng</th><th>Đợt / kỳ</th><th>Hạn</th><th class="num">Quá hạn (ngày)</th><th class="num">Còn phải thanh toán</th></tr></thead><tbody>
        ${xs.map(r => `<tr><td>${esc(r.unit)}</td><td>${esc(r.customer)}</td><td><a href="#" data-uct2="${r.contract_id}">${esc(r.number)}</a></td><td>${esc(r.dot)}</td><td>${dmy(r.due_on)}</td><td class="num">${r.days}</td><td class="num">${fm(r.rem)}</td></tr>`).join('')}</tbody></table></div>` }).el.addEventListener('click', ev => { const a = ev.target.closest('[data-uct2]'); if (a) { ev.preventDefault(); openDetail('contract', +a.dataset.uct2, 'debt'); } }); }
    const uh = e.target.closest('[data-uhist]'); if (uh) { e.preventDefault(); return ddHistModal({ unit_id: uh.dataset.uhist }, s.tab, 'plans'); }
    if (e.target.closest('#ddHist')) { const m = modal({ title: `${ico('fa-clock-rotate-left')} Tra cứu lịch sử căn`, narrow: true, body: `<div class="fld"><label>Mã căn<span class="req">*</span></label><input class="inp" id="uhC" placeholder="VD: CTS-K-101" autocomplete="off"></div><div class="small muted">Xem lịch sử kế hoạch thu (bán hàng + cho thuê) và nhắc nợ của căn, kể cả khi đã thu đủ hoặc hợp đồng đã thanh lý.</div>`,
        foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="uhOk">${ico('fa-magnifying-glass')} Xem lịch sử</button>` });
      const go = run(async () => { const c = $('#uhC', m.el).value.trim(); if (!c) return toast('Nhập mã căn', true); await ddHistModal({ code: c }); m.close(); });
      $('#uhOk', m.el).onclick = go; $('#uhC', m.el).onkeydown = ev => { if (ev.key === 'Enter') go(); }; return; }
    const uc = e.target.closest('[data-ucalls]');
    if (uc) { e.preventDefault(); const u = d.units.find(x => x.unit_id === +uc.dataset.ucalls); const m = await ddHistModal({ unit_id: uc.dataset.ucalls }, s.tab, 'calls', d.can_call && u?.main_ct ? `<button type="button" class="btn sm pri" data-addcall2="1" style="text-transform:none;letter-spacing:0">${ico('fa-plus')} Thêm lần nhắc</button>` : '');
      if (d.can_call && u?.main_ct) { m.el.addEventListener('click', ev => { if (ev.target.closest('[data-addcall2]')) { m.close(); openForm('debt_call', { preset: { contract_id: u.main_ct, contract_id__l: u.main_no }, onSaved: load }); } }); }
      return; }
    if (uc && false) { e.preventDefault(); const u = d.units.find(x => x.unit_id === +uc.dataset.ucalls); const RL = Object.fromEntries(M.ents.debt_call.fields.find(z => z.k === 'result').o.map(o => [o[0], o[1]]));
      const xs = (await Promise.all([...u.cts].map(id => api('GET', `/api/e/debt_call?f_contract_id=${id}&limit=200`).then(x => x.rows.map(z => ({ ...z, number: u.items.find(i => i.contract_id === id)?.number }))).catch(() => [])))).flat().sort((a, b) => String(b.at).localeCompare(String(a.at)));
      const CH = Object.fromEntries(M.ents.debt_call.fields.find(z => z.k === 'channel').o.map(o => [o[0], o[1]])), planned = new Set((d.plans || []).map(p => p.call_id).filter(Boolean));
      const m = modal({ wide: true, title: `${ico('fa-phone')} Lịch sử nhắc nợ · căn ${esc(u.unit)}`, body: `${xs.length ? `<div class="tbl-wrap"><table class="t compact noclick"><thead><tr><th>Ngày giờ</th><th>Hình thức</th><th>Hợp đồng</th><th>Kết quả</th><th>Nội dung nhắc</th><th>Phản hồi khách</th><th>Cam kết</th><th>Hẹn nhắc tiếp</th><th>Người thực hiện</th><th>Ghi chú</th><th></th></tr></thead><tbody>${xs.map(z => `<tr><td class="nowrap">${dmyhm(z.at)}</td><td>${esc(CH[z.channel] || '')}</td><td>${esc(z.number || '')}</td><td>${esc(RL[z.result] || z.result || '')}</td><td class="small" style="white-space:normal;min-width:160px">${esc(z.content || '')}</td><td class="small" style="white-space:normal">${esc(z.feedback || '')}</td><td>${z.promise_amount ? fm(z.promise_amount) : ''}${z.promise_on ? `<div class="small muted">${dmy(z.promise_on)}</div>` : ''}</td><td>${dmy(z.next_on)}</td><td>${esc(z.owner_id__l || '')}</td><td class="small" style="white-space:normal">${esc(z.note || '')}</td>
        <td>${(z.promise_amount || z.promise_on) && d.can_plan ? '<span class="small muted" title="Tích «Đưa vào kế hoạch thu» ở dòng căn: ngày dự kiến lấy theo cam kết gần nhất">cam kết — dùng làm ngày dự kiến khi tích kế hoạch</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có lần nhắc nợ</div>'}
        ${d.can_call ? `<div class="row mt"><button class="btn" data-addcall2="1">${ico('fa-plus')} Thêm lần nhắc</button></div>` : ''}` });
      m.el.addEventListener('click', run(async ev => {
        if (ev.target.closest('[data-addcall2]')) { m.close(); return openForm('debt_call', { preset: { contract_id: u.main_ct, contract_id__l: u.main_no }, onSaved: load }); }
        const b = ev.target.closest('[data-c2p]'); if (!b) return; const z = xs.find(x => x.id === +b.dataset.c2p); m.close();
        openForm('collect_plan', { preset: { contract_id: z.contract_id, contract_id__l: z.number, scope: s.tab, call_id: z.id, expected_on: z.promise_on || today(), expected: z.promise_amount || u.rem, basis: 'cam_ket', basis_note: `Cam kết khi nhắc nợ ${dmy(z.at)}` }, onSaved: load });
      }));
      return; }
    const trU = !e.target.closest('a,button,input,label') && e.target.closest('#ddT tr[data-i]'), uvId = e.target.closest('[data-uview]')?.dataset.uview || (trU ? d.units[+trU.dataset.i]?.unit_id : null);
    // 17/11/2026: CHI TIẾT CĂN HỘ — cửa sổ chia tab (tiêu đề + nút đóng + thanh tab cố định, chỉ cuộn nội dung; chuyển tab không đóng cửa sổ):
    // Công nợ (chọn hợp đồng → tổng quan, thanh tiến độ, thông tin HĐ, bảng mọi đợt + tổng cộng) · Lịch sử thu – chi · Lịch sử nhắc nợ (n, thêm lần nhắc) · Lịch sử kế hoạch (n) · Hợp đồng & trạng thái
    if (uvId) { const u = d.units.find(x => x.unit_id === +uvId); if (!u) return;
      const q = new URLSearchParams({ unit_id: u.unit_id, tab: s.tab }), [x, h0] = await Promise.all([api('GET', '/api/due-debt/unit-detail?' + new URLSearchParams({ unit_id: u.unit_id, tab: s.tab, to: d.asof })), api('GET', '/api/due-debt/unit-history?' + q)]);
      let h = h0, tabU = 'cn', ctSel = x.blocks.slice().sort((a, b) => b.rem - a.rem)[0]?.id;
      const pct = (a, b) => b > 0 ? (Math.round(a / b * 1000) / 10).toLocaleString('vi-VN') + '%' : '—';
      const stc = st => ({ da_thu: 'g', qua_han: 'r', den_han: 'a', mot_phan: 'b', chua_den_han: 's' })[st] || 's';
      const laiC = r => r.lai_na ? '<span class="small muted">Không áp dụng lãi</span>' : r.lai == null ? `<span class="ud-wn" title="Hợp đồng chưa ghi lãi suất chậm trả">${ico('fa-triangle-exclamation')} Chưa đủ thông tin tính lãi</span>` : r.lai ? fm(r.lai) : '0';
      const bar = b => { const T = b.rows.reduce((t, r) => t + r.amount, 0) || 1;
        return `<div class="ud-bar">${b.rows.map(r => `<span class="ud-seg ${stc(r.st)}" style="flex:${Math.max(r.amount / T, 0.02)}" title="${esc(r.dot)} · hạn ${dmy(r.due_on)} · ${fm(r.amount)} · ${esc(r.st_l)}${r.rem > 0 ? ' · còn ' + fm(r.rem) : ''}"><i style="width:${r.amount ? Math.min(100, r.paid / r.amount * 100) : 0}%"></i></span>`).join('')}</div>
          <div class="ud-barl">${b.rows.map(r => `<span style="flex:${Math.max(r.amount / T, 0.02)}" title="${esc(r.dot)}">${esc(r.dot)}<br><small>${dmy(r.due_on)}</small></span>`).join('')}</div>`; };
      const info = b => [['Khách hàng', b.customer], ['Điện thoại', b.phone], ['Mã căn', b.unit], ['Dự án', `${b.project} · Tòa ${b.building}`], ['Người phụ trách', b.owner || '—'],
        ...(b.kind === 'thue' && b.rent ? [['Tiền thuê / tháng', fm(b.rent)]] : []), ['Giá trị căn hộ', b.apt_value ? fm(b.apt_value) : '—'], ['Phí bảo trì', b.maint_fee ? fm(b.maint_fee) : '—'],
        ['Lãi suất chậm trả', b.lai_na ? 'Không áp dụng lãi chậm trả' : b.late_rate != null ? `${String(b.late_rate).replace('.', ',')}%/năm` : `<span class="ud-wn">${ico('fa-triangle-exclamation')} Chưa có — chưa đủ thông tin tính lãi</span>`]]
        .map(([l, v]) => `<div><span>${l}</span><b>${String(v).startsWith('<') ? v : esc(v)}</b></div>`).join('');
      const blk = b => `<section class="ud-blk"><div class="ud-hd"><a href="#" data-uct="${b.id}" title="Mở hồ sơ hợp đồng">${esc(b.number)}</a><span class="muted">${esc(b.kind_l)}</span>${pill(b.status_l, 'b')}${b.signed_on ? `<span class="small muted">ký ${dmy(b.signed_on)}</span>` : ''}</div>
          <div class="ud-ov"><div><span>Tổng phải thu theo HĐ</span><b>${fm(b.total)}</b></div><div><span>Đã thu</span><b>${fm(b.paid)}</b><small>${pct(b.paid, b.total)} đã thanh toán</small></div><div><span>Còn phải thu</span><b>${fm(b.rem)}</b></div>
            <div class="${b.overdue ? 'red' : ''}"><span>Quá hạn chưa thu</span><b>${fm(b.overdue)}</b></div><div><span>Lãi quá hạn</span><b>${fm(b.lai)}</b>${b.noLai ? `<small class="ud-wn">${ico('fa-triangle-exclamation')} ${b.noLai} đợt chưa đủ thông tin tính lãi</small>` : ''}</div></div>
          ${b.rows.length ? bar(b) : ''}
          <div class="ud-info">${info(b)}</div>${b.src_note ? `<div class="small muted mb">${ico('fa-link')} ${esc(b.src_note)}</div>` : ''}
          <div class="ud-tw"><table class="ud-t"><thead><tr><th>Đợt / kỳ – Ngày đến hạn</th><th>Nội dung thanh toán</th><th class="n">Phải thu</th><th class="n">Đã thu</th><th class="n">Còn lại</th><th>Tình trạng</th><th class="n">Số ngày quá hạn</th><th class="n">Số tiền quá hạn</th><th class="n">Tiền lãi</th><th></th></tr></thead><tbody>
            ${b.rows.map(r => `<tr class="${r.st === 'qua_han' ? 'od' : ''} ${r.maint ? 'mt' : ''}"><td><b>${esc(r.dot)}</b><div class="small muted">${dmy(r.due_on)}</div></td><td class="small">${esc(r.content)}</td><td class="n">${fm(r.amount)}</td><td class="n">${fm(r.paid)}</td><td class="n"><b>${fm(r.rem)}</b></td>
              <td>${pill(r.st_l, stc(r.st))}</td><td class="n">${r.days || ''}</td><td class="n">${r.over ? fm(r.over) : ''}</td><td class="n">${r.st === 'qua_han' ? laiC(r) : ''}</td>
              <td>${r.rem > 0 && r.inst_id && d.can_thu && ['qua_han', 'den_han'].includes(r.st) ? `<button class="btn xs" data-rc="${r.inst_id}">${ico('fa-plus')} Thu</button>` : ''}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="2">Tổng cộng · ${b.rows.length} đợt</td><td class="n">${fm(b.total)}</td><td class="n">${fm(b.paid)}</td><td class="n">${fm(b.rem)}</td><td></td><td></td><td class="n">${fm(b.overdue)}</td><td class="n">${fm(b.lai)}${b.noLai ? ' ⚠' : ''}</td><td></td></tr></tfoot></table></div>
          ${b.pay_rows.length ? `<div class="ud-sub">Khoản công ty phải trả khách theo HĐ vay — theo dõi riêng, không bù trừ với phải thu</div><div class="ud-tw"><table class="ud-t"><thead><tr><th>Kỳ – Ngày đến hạn</th><th>Nội dung</th><th class="n">Phải trả</th><th class="n">Đã trả</th><th class="n">Còn phải trả</th><th>Tình trạng</th><th></th></tr></thead><tbody>
            ${b.pay_rows.map(r => `<tr><td><b>${esc(r.dot)}</b><div class="small muted">${dmy(r.due_on)}</div></td><td class="small">${esc(r.content)}</td><td class="n">${fm(r.amount)}</td><td class="n">${fm(r.paid)}</td><td class="n">${fm(r.rem)}</td><td>${pill(r.st_l, stc(r.st))}</td><td>${r.rem > 0 && r.loan_pay_id ? `<button class="btn xs" data-pc="${r.loan_pay_id}">${ico('fa-plus')} Chi</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>`;
      // ---- nội dung từng tab
      const T = {
        cn: () => x.blocks.length ? `<div class="ud-cts">${x.blocks.map(b => `<button type="button" class="ud-ct ${b.id === ctSel ? 'on' : ''}" data-ctsel="${b.id}"><b>${esc(b.number)}</b><span>${esc(b.kind_l)} · ${esc(b.status_l)}</span><small>còn phải thu ${fm(b.rem)}${b.overdue ? ` · <em>quá hạn ${fm(b.overdue)}</em>` : ''}</small></button>`).join('')}</div>
            ${blk(x.blocks.find(b => b.id === ctSel) || x.blocks[0])}` : '<div class="empty">Căn không còn hợp đồng theo dõi công nợ trong sheet này — xem tab «Hợp đồng & trạng thái»</div>',
        tc: () => x.vouchers.length ? `<div class="ud-tw"><table class="ud-t"><thead><tr><th>Ngày</th><th>Số phiếu</th><th>Hợp đồng</th><th class="n">Thu</th><th class="n">Chi</th><th>Phân bổ vào đợt</th><th>Nội dung</th><th>Trạng thái phiếu</th></tr></thead><tbody>
            ${x.vouchers.map(v => `<tr class="${v.ok ? '' : 'void'}"><td>${dmy(v.on)}</td><td><a href="#" data-vch="${v.ent}:${v.id}" title="Mở phiếu để đối chiếu">${esc(v.no || '(chưa số)')}</a></td><td>${esc(v.contract)}</td><td class="n">${v.thu ? fm(v.thu) : ''}</td><td class="n">${v.chi ? fm(v.chi) : ''}</td>
              <td class="small">${esc(v.alloc)}</td><td class="small">${esc(v.content)}</td><td>${pill(v.st_l, v.ok ? 'g' : 's')}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="3">Tổng phiếu hợp lệ</td><td class="n">${fm(x.vouchers.filter(v => v.ok).reduce((t, v) => t + v.thu, 0))}</td><td class="n">${fm(x.vouchers.filter(v => v.ok).reduce((t, v) => t + v.chi, 0))}</td><td colspan="3"></td></tr></tfoot></table></div>` : '<div class="empty">Chưa có phiếu thu/chi</div>',
        nn: () => ddHistHtml(h, 'calls', d.can_call && u.main_ct ? `<button type="button" class="btn sm pri" data-addcall2="1" style="text-transform:none;letter-spacing:0">${ico('fa-plus')} Thêm lần nhắc</button>` : ''),
        kh: () => ddHistHtml(h, 'plans'),
        hd: () => `<div class="ud-tw"><table class="ud-t"><thead><tr><th>Số hợp đồng</th><th>Loại</th><th>Khách hàng</th><th>Ngày ký</th><th>Trạng thái hiện tại</th><th>Lịch sử chuyển trạng thái</th></tr></thead><tbody>
            ${x.contracts.map(c => `<tr><td><a href="#" data-uct="${c.id}" title="Mở hồ sơ hợp đồng">${esc(c.number)}</a></td><td>${esc(c.kind_l)}</td><td>${esc(c.customer)}</td><td>${c.signed_on ? dmy(c.signed_on) : ''}</td><td>${pill(c.status_l, c.closed ? 's' : 'g')}${c.status === 'thanh_ly' ? `<div class="small muted">Đã đóng theo dõi công nợ${c.liquidated_on ? ' từ ' + dmy(c.liquidated_on) : ''} — không cộng vào phải thu hiện tại</div>` : ''}</td>
              <td class="small">${c.hist.length ? c.hist.map(z => `<div>${dmyhm(z.at)} · ${esc(z.who)}: ${z.from ? esc(z.from) + ' → ' : ''}<b>${esc(z.to)}</b></div>`).join('') : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>` };
      const TL = () => [['cn', 'Công nợ'], ['tc', 'Lịch sử thu – chi'], ['nn', `Lịch sử nhắc nợ (${h.calls.length})`], ['kh', `Lịch sử kế hoạch (${h.plans.length})`], ['hd', 'Hợp đồng & trạng thái']];
      const cust = x.blocks[0] ? `${x.blocks[0].customer}${x.blocks[0].phone ? ' · ' + x.blocks[0].phone : ''}` : u.customer;
      const m = modal({ wide: true, title: `${ico('fa-building')} Chi tiết căn hộ · ${esc(x.unit || u.unit)}`,
        body: `<div class="ud"><div class="ud-top"><div class="ud-cu">${esc(cust)}<span>${s.tab === 'thue' ? 'Công nợ cho thuê' : 'Công nợ bán hàng'} · ngày chốt ${dmy(x.asof)} · đồng bộ ${dmyhm(x.synced_at)}</span></div><div class="ud-tabs" id="udTabs"></div></div><div id="udBody"></div></div>` });
      m.el.querySelector('.modal')?.classList.add('ud-modal');
      const show = () => { $('#udTabs', m.el).innerHTML = TL().map(([k, l]) => `<button type="button" class="${tabU === k ? 'on' : ''}" data-udtab="${k}">${l}</button>`).join(''); $('#udBody', m.el).innerHTML = T[tabU](); $('.mb', m.el).scrollTop = 0; };
      show();
      m.el.addEventListener('click', run(async ev => {
        const tb = ev.target.closest('[data-udtab]'); if (tb) { tabU = tb.dataset.udtab; return show(); }
        const cs = ev.target.closest('[data-ctsel]'); if (cs) { ctSel = +cs.dataset.ctsel; return show(); }
        const a = ev.target.closest('[data-uct]'); if (a) { ev.preventDefault(); return openDetail('contract', +a.dataset.uct, 'debt'); }
        const vc = ev.target.closest('[data-vch]'); if (vc) { ev.preventDefault(); const [en, id] = vc.dataset.vch.split(':'); return openDetail(en, +id); }
        if (ev.target.closest('[data-addcall2]')) return openForm('debt_call', { preset: { contract_id: u.main_ct, contract_id__l: u.main_no }, onSaved: async () => { h = await api('GET', '/api/due-debt/unit-history?' + q); show(); load(); } });
        const b = ev.target.closest('[data-rc]'), p = ev.target.closest('[data-pc]'); if (b || p) m.close();
        if (b) { const r = d.rows.find(z => z.inst_id === +b.dataset.rc); if (r) openForm('receipt', { preset: { contract_id: r.contract_id, contract_id__l: r.number, unit_id: r.unit_id, unit_id__l: r.unit, installment_id: r.inst_id, installment_id__l: r.content, voucher_date: today(), amount: r.rem, content: `Thu tiền ${r.dot}${r.content ? ' — ' + r.content : ''} căn ${r.unit}` }, onSaved: load }); }
        if (p) { const r = d.rows.find(z => z.loan_pay_id === +p.dataset.pc); if (r) openForm('payment', { preset: { contract_id: r.contract_id, contract_id__l: r.number, kind: r.src === 'lai_vay' ? 'tra_lai' : 'tra_goc', loan_pay_id: r.loan_pay_id, voucher_date: today(), amount: r.rem, content: `${r.content} ${r.dot} — HĐ vay ${r.number}` }, onSaved: load }); }
      }));
      return; }
  });
  // tự cập nhật: lưu phiếu thu / chi, sửa hạn, phát hành thông báo bàn giao / GCN… ở form bất kỳ → tải lại; quay lại tab hoặc mỗi 60 giây cũng tải lại (không cần F5)
  ST.reload = async () => { if ($('#ddT', main)) await load(); };
  const vis = () => { if (!$('#ddT', main)) return document.removeEventListener('visibilitychange', vis); if (document.visibilityState === 'visible') load().catch(() => {}); };
  document.addEventListener('visibilitychange', vis);
  const tm = setInterval(() => { if (!$('#ddT', main)) return clearInterval(tm); if (document.visibilityState === 'visible' && !document.querySelector('.modal')) load().catch(() => {}); }, 60000);
  await load();
};

// HĐ thuê / mua bán / hoàn thiện: khách phải trả công ty theo lịch thu, thực thu theo phiếu thu hợp lệ
const ctTrack = async (main, kind) => {
  const f = filt(), s = (ST.cttrack ||= {})[kind] ||= { state: '', q: '', from: '', to: '' }, rent = kind === 'thue', hdmb = kind === 'hdmb', KL = Object.fromEntries(CT_KINDS.map(x => [x[0], x[1]]));
  // HĐ mua bán: cột theo mẫu «Bảng theo dõi hợp đồng mua bán» của phòng KD (05/11/2026) — 2 tầng tiêu đề, c[3] = nhóm cột
  const grp = (g, cs) => cs.map(c => [...c, 'money', g]);
  const HDMB = [['number', 'Số hợp đồng'], ['unit', 'Mã căn hộ'], ['customer', 'Họ và tên'], ['signed_on', 'Ngày ký hợp đồng', 'date'],
    ...grp('Tiền nhà', [['h_value', 'Giá trị hợp đồng'], ['h_due', 'Số phải thu theo tiến độ'], ['h_paid', 'Số đã thu'], ['h_left_due', 'Còn lại theo tiến độ'], ['h_left', 'Còn lại theo hợp đồng']]),
    ...grp('Phí bảo trì', [['m_value', 'Phí bảo trì'], ['m_due', 'Số phải thu theo tiến độ'], ['m_paid', 'Số đã thu'], ['m_left_due', 'Còn lại theo tiến độ'], ['m_left', 'Còn lại theo hợp đồng']]),
    ...grp('Tổng cộng', [['t_value', 'Tổng giá trị HĐ'], ['t_due', 'Số phải thu theo tiến độ'], ['t_paid', 'Số đã thu'], ['t_left_due', 'Còn lại theo tiến độ'], ['t_left', 'Còn lại theo hợp đồng']]),
    ['overdue_days', 'Số ngày quá hạn', 'int'], ['late_rate', 'Lãi suất quá hạn (%/năm)', 'num'], ['overdue', 'Số tiền quá hạn', 'money'], ['late_int', 'Lãi quá hạn', 'money'], ['state_l', 'Tình trạng']];
  // HĐ thuê: cột theo mẫu «Bảng theo dõi hợp đồng thuê căn hộ» của phòng KD (05/11/2026)
  const cols = hdmb ? HDMB : rent ? [['project_name', 'Dự án'], ['building_l', 'Tòa'], ['unit', 'Mã căn hộ'], ['customer', 'Họ tên người thuê'], ['phone', 'Số điện thoại'], ['number', 'Số hợp đồng'], ['signed_on', 'Ngày ký', 'date'],
    ['eff_on', 'Ngày bắt đầu thuê', 'date'], ['exp_on', 'Ngày hết hạn thuê', 'date'], ['term_l', 'Thời hạn thuê'], ['period_l', 'Kỳ thanh toán'], ['rent', 'Giá thuê/tháng (đồng)', 'money'], ['deposit', 'Tiền đặt cọc (đồng)', 'money'],
    ['value', 'Giá trị hợp đồng thuê', 'money'], ['due_sched', 'Số phải thu theo tiến độ', 'money'], ['paid_sched', 'Số đã thu theo tiến độ', 'money'], ['left_sched', 'Còn phải thu', 'money'], ['chi', 'Đã chi (hoàn cọc / hoàn tiền)', 'money'], ['cur_l', 'Kỳ thanh toán hiện tại'], ['han_on', 'Hạn thanh toán', 'date'],
    ['status_l', 'Tình trạng hợp đồng'], ['remind', 'Nhắc nhở'], ['owner', 'Người phụ trách'], ['note', 'Ghi chú']]
    // HĐ hoàn thiện: cột theo mẫu bảng theo dõi công nợ hoàn thiện của phòng KD (08/11/2026)
    : [['project', 'Dự án'], ['building', 'Tòa'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['number', 'Số HĐ'], ['status_l', 'Trạng thái HĐ'], ['signed_on', 'Ngày ký', 'date'],
    ['value', 'Giá trị HĐ', 'money'], ['due_w', 'Phải thu theo tiến độ', 'money'], ['paid_w', 'Đã thu trong kỳ', 'money'], ['left_w', 'Còn lại theo tiến độ', 'money'], ['left_hd', 'Còn phải thu theo hợp đồng', 'money'],
    ['overdue', 'Quá hạn', 'money'], ['overdue_days', 'Số ngày quá hạn', 'int'], ['next_on', 'Hạn kỳ tới', 'date'], ['next_amt', 'Số tiền kỳ tới', 'money'], ['state_l', 'Tình trạng']];
  const SUM = hdmb ? HDMB.filter(c => c[2] === 'money').map(c => c[0]) : rent ? ['deposit', 'value', 'due_sched', 'paid_sched', 'left_sched', 'chi'] : ['value', 'due_w', 'paid_w', 'left_w', 'left_hd', 'overdue', 'next_amt'];
  const groups = cols.map(c => c[3] || ''), period = () => `${d.from ? 'từ ' + dmy(d.from) + ' ' : ''}đến ${dmy(d.to)}`;
  const TABS = [['', 'Tất cả'], ['qua_han', 'Quá hạn thu'], ['sap_toi', 'Đến hạn trong 7 ngày'], ...(rent ? [['het_han', 'Hết hạn trong 30 ngày']] : []), ['dang', 'Đang thu'], ['xong', 'Đã thu đủ'], ['chua_lich', 'Chưa có lịch thu']];
  let d = { rows: [] };
  const shown = () => { const q = s.q.trim().toLowerCase(); return d.rows.filter(r => !q || [r.unit, r.customer, r.number, r.phone].some(x => String(x || '').toLowerCase().includes(q))); };   // bỏ tab trạng thái (07/11/2026)
  const draw = () => {
    const sum = k => d.rows.reduce((t, r) => t + (+r[k] || 0), 0), n = k => d.rows.filter(r => !k || r.state === k).length, tot = sum('total');
    const tile = (l, v, sub, red) => `<div class="card kpi ${red ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:18px">${v}</div><div class="s">${sub || '&nbsp;'}</div></div>`;
    if (d.closed) {   // 17/11/2026: HĐ đã thanh lý — tra cứu lịch sử, không phải công nợ đang theo dõi
      $('#ctK', main).innerHTML = tile('HĐ đã thanh lý', d.rows.length, 'đã đóng theo dõi công nợ') + tile('Đã thu (lịch sử)', fm(sum('paid')), 'tổng phiếu thu hợp lệ của các HĐ') + tile('Đã chi hoàn trả', fm(sum('chi')), 'phiếu chi hoàn tiền / hoàn cọc / thanh lý')
        + `<a class="card kpi" href="#/v/payouts" style="text-decoration:none"><div class="l">Khoản hoàn trả</div><div class="v" style="font-size:16px">${ico('fa-arrow-right')} Theo dõi thanh lý &amp; chi trả</div><div class="s">số phải hoàn trả · đã chi · còn phải trả</div></a>`;
      $('#ctN', main).textContent = `${shown().length} hợp đồng`; $('#ctT', main).innerHTML = rowsTable(cols, shown(), SUM, hdmb ? { no: 'STT', groups } : { no: 'STT' });
      $('#ctNote', main).innerHTML = `HĐ đã thanh lý — <b>đã đóng theo dõi công nợ</b>: số liệu chỉ để tra cứu lịch sử thu tiền / công nợ, không tính vào tổng công nợ phải thu, không nhắc thu. Khoản hoàn trả cho khách theo dõi tại <a href="#/v/payouts">Theo dõi thanh lý &amp; chi trả</a>. Các hợp đồng khác cùng căn còn hiệu lực vẫn ở «Đang theo dõi công nợ».`; return;
    }
    $('#ctK', main).innerHTML = hdmb
      ? tile('Phải thu theo tiến độ', fm(sum('t_due')), `${d.rows.length} hợp đồng · các đợt có hạn ${period()}`) + tile('Số đã thu', fm(sum('t_paid')), `phiếu thu ${d.from ? 'từ ' + dmy(d.from) + ' ' : ''}đến ${dmy(d.asof)}`)
        + tile('Còn lại theo tiến độ', fm(sum('t_left_due')), `còn lại theo hợp đồng ${fm(sum('t_left'))}`) + tile('Quá hạn chưa thu', fm(sum('overdue')), `${n('qua_han')} hợp đồng${sum('late_int') ? ` · lãi quá hạn ${fm(sum('late_int'))}` : ''}`, sum('overdue') > 0)
      : kind === 'hoan_thien' ? tile('Giá trị hợp đồng', fm(sum('value')), `${d.rows.length} hợp đồng`) + tile('Phải thu theo tiến độ', fm(sum('due_w')), `đã thu trong kỳ ${fm(sum('paid_w'))}`)
        + tile('Còn lại theo tiến độ', fm(sum('left_w')), `còn phải thu theo hợp đồng ${fm(sum('left_hd'))}`) + tile('Quá hạn chưa thu', fm(sum('overdue')), `${n('qua_han')} hợp đồng`, sum('overdue') > 0)
      : tile('Giá trị hợp đồng', fm(sum('value')), `${d.rows.length} hợp đồng · phải thu theo lịch ${fm(tot)}`) + tile('Đã thu', fm(sum('paid')), `${tot ? Math.round(sum('paid') / tot * 1000) / 10 : 0}% so với lịch thu`)
        + tile('Còn phải thu', fm(sum('left')), `đến hạn trong 7 ngày ${fm(sum('due7'))}`) + tile('Quá hạn chưa thu', fm(sum('overdue')), `${n('qua_han')} hợp đồng`, sum('overdue') > 0);
    $('#ctN', main).textContent = `${shown().length} hợp đồng`;
    // ô Lãi suất quá hạn: người có quyền gõ thẳng vào bảng (lưu theo từng hợp đồng)
    const rateIn = (c, r) => c[0] === 'late_rate' && d.can_rate ? `<input class="inp" data-lr="${r.contract_id}" value="${r.late_rate ?? ''}" placeholder="%/năm" inputmode="decimal" style="width:76px;text-align:right" title="Lãi suất quá hạn (%/năm) — gõ rồi Enter">` : undefined;
    $('#ctT', main).innerHTML = rowsTable(cols, shown(), SUM, hdmb ? { no: 'STT', groups, cell: rateIn } : { no: 'STT' });
    if (kind === 'hoan_thien') $('#ctNote', main).innerHTML = `<b>Phải thu theo tiến độ</b> = các đợt thu có hạn ${period()} (để trống «Từ ngày» = từ đầu hợp đồng); <b>Đã thu trong kỳ</b> = phiếu thu ${d.from ? 'từ ' + dmy(d.from) + ' ' : ''}đến ${dmy(d.asof)}; còn lại theo tiến độ = phải thu theo tiến độ − đã thu trong kỳ. <b>Còn phải thu theo hợp đồng</b> = giá trị HĐ − tổng đã thu đến ${dmy(d.asof)}. Quá hạn = phần chưa thu của các đợt đã quá hạn; số ngày quá hạn tính từ hạn của đợt nợ sớm nhất. Bấm 1 dòng để xem công nợ chi tiết của hợp đồng.`;
    else if (!hdmb) $('#ctNote', main).innerHTML = `<b>Phải thu theo tiến độ</b> = các kỳ thu có hạn ${period()} (để trống «Từ ngày» = từ đầu hợp đồng); <b>Đã thu trong kỳ</b> = phiếu thu ${d.from ? 'từ ' + dmy(d.from) + ' ' : ''}đến ${dmy(d.asof)}; còn lại theo tiến độ = phải thu − đã thu trong kỳ. Đã thu / còn phải thu / quá hạn tính đến ${dmy(d.asof)}. Đã chi = phiếu chi hoàn tiền / hoàn cọc. Bấm 1 dòng để xem công nợ chi tiết của hợp đồng.`;
    if (hdmb) $('#ctNote', main).innerHTML = `Giá trị hợp đồng = tiền sau thuế; phí bảo trì tính riêng. <b>Số phải thu theo tiến độ</b> = các đợt thu tiền của hợp đồng có hạn ${period()} (để trống «Từ ngày» = từ đầu hợp đồng).
      Số đã thu = phiếu thu đã lập${d.from ? ` từ ${dmy(d.from)}` : ''} đến ${dmy(d.asof)}, chia vào từng đợt (phiếu chọn đợt vào đợt đó, phiếu không chọn đợt vào đợt hạn sớm nhất còn nợ): phần vào dòng phí bảo trì tính vào phí bảo trì (tổng đã thu đến ${dmy(d.asof)}), còn lại vào tiền nhà. Còn lại theo tiến độ = phải thu theo tiến độ − đã thu (âm = khách trả trước);
      còn lại theo hợp đồng = giá trị − tổng đã thu đến ${dmy(d.asof)}. <b>Phí bảo trì</b>: phải thu theo tiến độ = phí bảo trì khi dòng phí bảo trì đã đến hạn (chưa đến hạn = 0); còn lại theo tiến độ = phải thu theo tiến độ − đã thu; còn lại theo hợp đồng = phí bảo trì − đã thu. Tổng cộng = tiền nhà + phí bảo trì (cộng từng cột; tổng giá trị HĐ = giá trị HĐ + phí bảo trì). Số ngày quá hạn = từ hạn của đợt nợ sớm nhất đến ${dmy(d.asof)}.
      Số tiền quá hạn = cộng dồn (lũy kế) phần còn lại chưa thanh toán của các đợt đã quá hạn. Lãi quá hạn (lãi chậm trả) tính theo từng khoảng: từ hạn đợt, số tiền quá hạn = phần còn nợ, giảm dần từ mỗi ngày khách trả; mỗi khoảng = số tiền quá hạn × số ngày × lãi suất (%/năm) / 365 (khoảng cuối đến ${dmy(d.asof)}) — tính cả những ngày đã trễ trước khi khách trả${d.can_rate ? ' — gõ lãi suất vào cột «Lãi suất quá hạn» của từng hợp đồng' : ''}. Bấm 1 dòng để xem công nợ từng đợt, phiếu thu / phiếu chi của hợp đồng.`;
  };
  const load = async () => { const ok = latest(main), r = await api('GET', '/api/contract-track?' + qsOf({ kind, project: f.project, building: f.building, from: s.from, to: s.to, closed: s.closed || '' })); if (ok()) { d = r; draw(); } };
  main.innerHTML = `<div class="page">${head('06', `Theo dõi công nợ — ${KL[kind]}`, CT_KINDS.find(x => x[0] === kind)[2], `<button class="btn" id="ctX">${ico('fa-file-excel')} Xuất file</button>`, 'CN-07')}${ctKindBar(kind)}${filterBar(f, { period: false })}<div class="grid g4 mb" id="ctK"></div><div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="ctQ" placeholder="Tìm mã căn, khách hàng, số HĐ, SĐT…" value="${esc(s.q)}"></div><span id="ctDates" style="display:contents"><span class="small muted">Từ ngày</span>${segDate('ctFr', s.from)}<span class="small muted">Đến ngày</span>${segDate('ctTo', s.to || today())}</span><select class="inp" id="ctCl" style="width:auto;height:30px" title="HĐ đã thanh lý đã đóng theo dõi công nợ — không tính vào tổng công nợ phải thu / nhắc thu; chọn để tra cứu lịch sử thu tiền"><option value="">Đang theo dõi công nợ</option><option value="1" ${s.closed ? 'selected' : ''}>HĐ đã thanh lý (đã đóng công nợ)</option></select><span class="grow"></span><span class="small muted" id="ctN"></span></div><div id="ctT"><div class="empty">Đang tải…</div></div><div class="small muted mt" id="ctNote">Phải thu theo lịch thanh toán của hợp đồng; đã thu theo Phiếu thu, đã chi theo Phiếu chi (hoàn tiền / hoàn cọc). Bấm 1 dòng để sổ ra phiếu thu / phiếu chi của hợp đồng.</div></div></div>`;
  wireFilter(main, f, load);
  { wireSegDate(main); $('#ctDates', main).addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (v === null) return; if (e.target.id === 'ctFr') s.from = v; else s.to = v; await load(); })); }
  $('#ctQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  $('#ctCl', main).onchange = run(async e => { s.closed = e.target.value; await load(); });
  $('#ctX', main).onclick = () => download('/api/export-rows', hdmb ? { title: 'BẢNG THEO DÕI HỢP ĐỒNG MUA BÁN', cols, groups, rows: shown(), sum: SUM, file: 'Bang_theo_doi_hop_dong_mua_ban',
    note: `Đơn vị tiền: đồng • Số phải thu theo tiến độ = các đợt có hạn ${period()} • Số đã thu = phiếu thu ${d.from ? 'từ ' + dmy(d.from) + ' ' : ''}đến ${dmy(d.asof)} • Số tiền quá hạn = cộng dồn phần còn lại chưa thanh toán của các đợt đã quá hạn • Lãi quá hạn = Σ từng khoảng: số tiền quá hạn (giảm từ mỗi ngày khách trả) × số ngày × lãi suất %/năm / 365, khoảng cuối đến ${dmy(d.asof)}` } : rent ? { title: 'BẢNG THEO DÕI HỢP ĐỒNG THUÊ CĂN HỘ', cols, rows: shown(), sum: SUM, note: 'Đơn vị tiền: đồng • Số phải thu theo tiến độ = các kỳ đến hạn tới hôm nay • Tiền đặt cọc theo dõi riêng, chưa tính vào tiền thuê', file: 'Bang_theo_doi_hop_dong_thue_can_ho' } : { title: `CN-07 Theo dõi công nợ — ${KL[kind]}`, cols, rows: shown(), sum: SUM, note: 'Phải thu theo lịch thanh toán; đã thu theo phiếu thu hợp lệ', file: `Theo_doi_${kind}` });
  main.onclick = run(async e => { if (ctKindClick(e, main)) return; const t = e.target.closest('[data-st]'); if (t) { s.state = t.dataset.st; return draw(); } if (e.target.closest('[data-lr]')) return; const tr = e.target.closest('#ctT tr[data-i]'); if (tr) { const r = shown()[+tr.dataset.i]; if (r) location.hash = `#/v/ctdebt?id=${r.contract_id}${s.to ? '&to=' + s.to : ''}`; } });   // màn riêng Công nợ hợp đồng (06/11/2026)
  main.onchange = run(async e => {
    const el = e.target.closest('[data-lr]'); if (!el) return;
    const r = await api('PUT', `/api/contract-track/${el.dataset.lr}/late-rate`, { rate: el.value.trim() });
    toast(r.late_rate == null ? 'Đã bỏ lãi suất quá hạn' : `Đã lưu lãi suất quá hạn ${fnum(r.late_rate)}%/năm`); await load();
  });
  ST.reload = async () => { if ($('#ctT', main)) await load(); };
  await load();
};
V.finishpay = async main => {
  const f = filt(), s = ST.finishpay ||= { state: '', q: '' };
  const cols = [['project', 'Dự án'], ['building', 'Tòa'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['number', 'Số HĐ'], ['basis', 'Căn cứ'], ['value', 'Giá trị hoàn thiện', 'money'], ['paid', 'Đã thu', 'money'], ['paid_pct', '% thu', 'num'], ['left', 'Còn phải thu', 'money'], ['overdue', 'Quá hạn', 'money'], ['next_due', 'Kỳ tới', 'date']];
  let d = { rows: [] };
  const shown = () => { const q = s.q.trim().toLowerCase(); return d.rows.filter(r => (!s.state || r.state === s.state) && (!q || [r.unit, r.customer, r.number].some(x => String(x || '').toLowerCase().includes(q)))); };
  const draw = () => {
    const rs = shown(), sum = k => d.rows.reduce((t, r) => t + (r[k] || 0), 0), n = k => d.rows.filter(r => !k || r.state === k).length;
    $('#fpK', main).innerHTML = [['Giá trị hoàn thiện', sum('value')], ['Đã thu', sum('paid')], ['Còn phải thu', sum('left')], ['Quá hạn (HĐ riêng)', sum('overdue'), 1]].map(([l, v, red]) => `<div class="card kpi ${red && v ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:20px">${fmB(v)}</div><div class="s">${fm(v)} đ</div></div>`).join('');
    $('#fpTabs', main).innerHTML = [['', 'Tất cả'], ['chua', 'Chưa thu'], ['dang', 'Đang thu'], ['du', 'Đã thu đủ']].map(([k, l]) => `<button data-st="${k}" class="${s.state === k ? 'on' : ''}">${l} <span class="n">${n(k)}</span></button>`).join('');
    $('#fpN', main).textContent = `${rs.length} căn`;
    $('#fpT', main).innerHTML = rowsTable(cols, rs, ['value', 'paid', 'left', 'overdue']);
  };
  const load = async () => { d = await api('GET', '/api/finish-pay?' + qsOf({ project: f.project, building: f.building })); $('#srcLine', main).innerHTML = `<span>${ico('fa-database')} Thực thu đồng bộ Bravo${d.bravo_sync ? ' — chốt ' + dmyhm(d.bravo_sync) : ''}</span><span>Gộp HĐMB: tạm tính theo % đã thu của hợp đồng, chưa phải số thu riêng của khoản hoàn thiện</span>`; draw(); };
  main.innerHTML = `<div class="page">${head('06', 'Tiến độ thu tiền hoàn thiện', 'fa-couch', `<button class="btn" id="fpX">${ico('fa-file-excel')} Xuất file</button>`, 'CN-05')}${filterBar(f, { period: false })}<div class="grid g4 mb" id="fpK"></div><div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="fpQ" placeholder="Mã căn, khách hàng, số HĐ…" value="${esc(s.q)}"></div><span class="grow"></span><span class="small muted" id="fpN"></span></div><div class="tabs" id="fpTabs"></div><div id="fpT"></div></div></div>`;
  wireFilter(main, f, load);
  $('#fpQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  $('#fpX', main).onclick = () => download('/api/export-rows', { title: 'CN-05 Tiến độ thu tiền hoàn thiện', cols, rows: shown(), sum: ['value', 'paid', 'left', 'overdue'], note: 'Gộp HĐMB: tạm tính theo % đã thu của hợp đồng', file: 'Tien_do_thu_hoan_thien' });
  main.onclick = e => { const t = e.target.closest('[data-st]'); if (t) { s.state = t.dataset.st; return draw(); } const tr = e.target.closest('tr[data-i]'); if (tr) { const r = shown()[+tr.dataset.i]; if (r) openDetail('contract', r.contract_id, 'debt'); } };
  ST.reload = async () => { if ($('#fpT', main)) await load(); };
  await load();
};
V.loans = async main => {
  const s = ST.loan ||= { project: '', q: '', st: '', pt: '' }, canEdit = M.ents.contract.perm.u;
  const L = (k, v) => M.ents.contract.fields.find(f => f.k === k)?.o?.find(o => o[0] === v)?.[1] || v || '';
  main.innerHTML = `<div class="page">${head('05', 'Theo dõi hợp đồng 3 bên', 'fa-building-columns', `<button class="btn" id="lnX">${ico('fa-file-excel')} Xuất file</button>`, 'HD-05')}
    <div class="grid g4 mb" id="lnK"></div>
    <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="lnQ" placeholder="Tìm mã căn, khách hàng, SĐT, số HĐ, ngân hàng…" value="${esc(s.q)}"></div>
      <select id="lnP"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+s.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>
      <select id="lnL"><option value="">Căn hộ + liền kề</option><option value="can_ho">Căn hộ chung cư</option><option value="lien_ke">Nhà liền kề</option></select>
      <select id="lnS"><option value="">Mọi tình trạng vay</option><option value="co_vay">Có vay</option><option value="khong_vay">Không vay</option><option value="chua">Chưa cập nhật</option></select>
      <span class="grow"></span><span class="small muted" id="lnN"></span></div><div class="tbl-wrap" id="lnT"><div class="empty">Đang tải…</div></div></div></div>`;
  $('#lnS', main).value = s.st; $('#lnL', main).value = s.pt || '';
  let rows = [];
  const load = async () => {
    rows = (await api('GET', '/api/loans' + (s.project ? '?project=' + s.project : ''))).map(r => ({ ...r, loan_l: L('loan_status', r.loan_status) || 'Chưa cập nhật', doc3_l: r.loan_status === 'co_vay' ? L('loan_doc3', r.loan_doc3 || 'chua_co') : '' }));
    draw();
  };
  const shown = () => { const q = s.q.trim().toLowerCase();
    return rows.filter(r => (!s.pt || r.ptype === s.pt) && (!s.st || (s.st === 'chua' ? !r.loan_status : r.loan_status === s.st)) && (!q || [r.number, r.unit, r.customer, r.phone, r.loan_bank].some(x => String(x ?? '').toLowerCase().includes(q)))); };
  const draw = () => {
    const n = k => rows.filter(r => k ? r.loan_status === k : !r.loan_status).length, tile = (l, icon, v) => `<div class="card kpi"><div class="l">${ico(icon)} ${l}</div><div class="v">${v}</div></div>`;
    $('#lnK', main).innerHTML = tile('Tổng hợp đồng', 'fa-file-contract', rows.length) + tile('Có vay', 'fa-building-columns', n('co_vay')) + tile('Không vay', 'fa-wallet', n('khong_vay')) + tile('Chưa cập nhật', 'fa-circle-question', n());
    const rs = shown(); $('#lnN', main).textContent = `${rs.length} hợp đồng`;
    $('#lnT', main).innerHTML = rs.length ? `<table class="t"><thead><tr><th>STT</th>${LOAN_COLS.map(c => `<th>${c[1]}</th>`).join('')}${canEdit ? '<th></th>' : ''}</tr></thead><tbody>${rs.map((r, i) => `<tr data-id="${r.id}"><td class="center">${i + 1}</td>${LOAN_COLS.map(c => {
      const v = r[c[0]];
      return `<td>${c[0] === 'loan_l' ? pill(v, r.loan_status === 'co_vay' ? 'b' : r.loan_status ? 'g' : 's') : c[0] === 'doc3_l' && v ? pill(v, r.loan_doc3 === 'da_co' ? 'g' : 'a') : esc(v ?? '')}</td>`; }).join('')}${canEdit ? `<td class="nowrap"><button class="btn sm" data-ed="${r.id}">${ico('fa-pen')} Sửa</button> <button class="btn sm danger" data-rm="${r.id}" ${r.loan_status ? '' : 'disabled'}>${ico('fa-trash')} Xóa</button></td>` : ''}</tr>`).join('')}</tbody></table>`
      : '<div class="empty">Không có hợp đồng phù hợp</div>';
    syncTopScroll();
  };
  $('#lnQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  $('#lnP', main).onchange = run(async e => { s.project = e.target.value; await load(); });
  $('#lnS', main).onchange = e => { s.st = e.target.value; draw(); };
  $('#lnL', main).onchange = e => { s.pt = e.target.value; draw(); };
  $('#lnX', main).onclick = () => download('/api/export-rows', { title: 'THEO DÕI HỢP ĐỒNG 3 BÊN', cols: LOAN_COLS, rows: shown(), file: 'theo_doi_vay_von' });
  const saveLoan = (id, d) => api('PUT', `/api/e/contract/${id}`, d);
  const editLoan = r => {
    const opt = (o, v) => o.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
    const m = modal({ title: `${ico('fa-building-columns')} Vay vốn · ${esc(r.unit)} · ${esc(r.customer)}`, narrow: true, body: `<div id="lerr"></div><form class="form" style="grid-template-columns:1fr">
      <div class="fld"><label>Tình trạng vay</label><select id="lS"><option value="">— chọn —</option>${opt([['co_vay', 'Có vay'], ['khong_vay', 'Không vay']], r.loan_status)}</select></div>
      <div class="fld" data-co><label>Tên ngân hàng</label><input id="lB" value="${esc(r.loan_bank || '')}" list="dlLn" autocomplete="off">${sugList('dlLn', M.ents.contract.fields.find(f => f.k === 'loan_bank').sug)}</div>
      <div class="fld" data-co><label>Tình trạng chứng từ 3 bên</label><select id="lD">${opt([['chua_co', 'Chưa có'], ['da_co', 'Đã có']], r.loan_doc3 || 'chua_co')}</select></div></form>`,
      foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="lOk">${ico('fa-floppy-disk')} Lưu</button>` });
    const vis = () => $$('[data-co]', m.el).forEach(x => x.classList.toggle('hidden', $('#lS', m.el).value !== 'co_vay'));
    $('#lS', m.el).onchange = vis; vis();
    $('#lOk', m.el).onclick = async () => {
      const st = $('#lS', m.el).value || null;
      try { await saveLoan(r.id, { loan_status: st, loan_bank: st === 'co_vay' ? $('#lB', m.el).value.trim() : null, loan_doc3: st === 'co_vay' ? $('#lD', m.el).value : null }); m.close(); toast('Đã lưu tình trạng vay vốn'); await load(); }
      catch (er) { $('#lerr', m.el).innerHTML = `<div class="errbar">${esc(er.message)}</div>`; }
    };
  };
  $('#lnT', main).onclick = async e => {
    const ed = e.target.closest('[data-ed]'), rm = e.target.closest('[data-rm]'), r = rows.find(x => x.id === +(ed?.dataset.ed || rm?.dataset.rm));
    if (ed) return editLoan(r);
    if (rm) {
      if (await ask('Xóa thông tin vay vốn', `Xóa thông tin vay vốn của căn ${esc(r.unit)}? Hợp đồng vẫn giữ nguyên, dòng này về «Chưa cập nhật».`, { danger: 1, okLabel: 'Xóa' })) { try { await saveLoan(r.id, { loan_status: null, loan_bank: null, loan_doc3: null }); toast('Đã xóa thông tin vay vốn'); await load(); } catch (er) { toast(er.message, true); } }
      return;
    }
    const tr = e.target.closest('tr[data-id]'); if (tr) openDetail('contract', +tr.dataset.id);
  };
  await load();
};

// ---------- khởi động ----------
if (location.hash.startsWith('#/login')) loginView(); else boot();

// ---------- tài khoản cá nhân (04/11/2026): đổi tên, ảnh đại diện, ảnh bìa, trạng thái, cài đặt giao diện riêng ----------
const STATUS = [['lam_viec', 'Đang làm việc', 'g', 'fa-circle-check'], ['ban', 'Bận – không làm phiền', 'r', 'fa-circle-minus'], ['hop', 'Đang họp', 'a', 'fa-people-group'],
  ['cong_tac', 'Đi công tác / công trình', 'b', 'fa-car-side'], ['vang', 'Tạm vắng', 'v', 'fa-mug-hot'], ['nghi', 'Nghỉ phép', 's', 'fa-umbrella-beach']];
const PREF0 = { theme: 'light', accent: 'cobalt', zoom: 1, dense: false, anim: true, deco: true, home: 'myday', badgeApr: true, badgeAl: true, refresh: 2 };
const ACCENTS = { cobalt: ['Xanh navy (mặc định)', '#2A4F8A', '#1F3A68', '#4A6FAE', '#EEF3FA', '#DCE6F4'], ctg: ['Xanh Cát Tường', '#1E4E8C', '#143866', '#2D7DD2', '#EEF4FB', '#DCE8F6'], teal: ['Xanh ngọc', '#0F766E', '#0B5550', '#14A39A', '#E6F6F4', '#C9ECE8'],
  sage: ['Xanh lá', '#2F6B3A', '#1F4D28', '#4E9A5B', '#EDF6EE', '#D4EAD6'], violet: ['Tím', '#5B3FA8', '#412C7C', '#7C5CD6', '#F2EEFC', '#E0D7F7'],
  wine: ['Đỏ rượu', '#9B2C3A', '#6F1E29', '#C2465A', '#FBEFF1', '#F3D6DB'], slate: ['Xám than', '#334155', '#1E293B', '#56657A', '#F1F4F8', '#DFE5EE'] };
const prefs = () => ({ ...PREF0, ...(M?.me?.prefs || {}) });
const homeHash = () => { const h = prefs().home || 'myday'; return h.startsWith('e:') ? '#/e/' + h.slice(2) : '#/v/' + h; };
const initials = n => esc((String(n || '').replace(/\(.*?\)/g, ' ').trim() || '?').split(/\s+/).slice(-1)[0].slice(0, 2).toUpperCase());
const avHtml = (u, cls = 'av') => `<span class="${cls}">${u.avatar ? `<img src="${u.avatar}" alt="">` : initials(u.full_name)}<i class="sdot s-${u.status || 'lam_viec'}" title="${esc(STATUS.find(s => s[0] === (u.status || 'lam_viec'))[1])}"></i></span>`;
const meInner = () => `${avHtml(M.me)}<div><b>${esc(M.me.full_name)}</b><small>${M.me.status_msg ? esc(M.me.status_msg) : esc(roleName(M.me.role))}</small></div>`;
function applyPrefs(p = prefs()) {
  const r = document.documentElement, a = ACCENTS[p.accent] || ACCENTS.cobalt;
  ['--cobalt', '--cobalt-d', '--cobalt-l', '--cobalt-50', '--cobalt-100'].forEach((v, i) => p.accent === 'cobalt' ? r.style.removeProperty(v) : r.style.setProperty(v, a[i + 1]));
  const mq = matchMedia('(prefers-color-scheme: dark)');
  r.dataset.theme = p.theme === 'dark' || (p.theme === 'auto' && mq.matches) ? 'dark' : 'light';
  if (!applyPrefs.mq) { applyPrefs.mq = 1; mq.addEventListener?.('change', () => applyPrefs()); }
  r.style.zoom = +p.zoom && +p.zoom !== 1 ? p.zoom : '';
  document.body.classList.toggle('dense', !!p.dense); document.body.classList.toggle('no-anim', !p.anim); document.body.classList.toggle('no-deco', !p.deco);
}
function badgeTimer() {
  clearInterval(ST.badgeT); updateBadges();
  const m = +prefs().refresh; if (m > 0) ST.badgeT = setInterval(updateBadges, m * 60e3);
}
async function saveProfile(d) {
  const r = await api('PUT', '/api/profile', d);
  Object.assign(M.me, { full_name: r.full_name, title: r.title, status: r.status, status_msg: r.status_msg, prefs: r.prefs, avatar: r.avatar });
  const u = M.users.find(x => x.id === M.me.id); if (u) Object.assign(u, { full_name: r.full_name, title: r.title });
  if ($('#meBtn')) $('#meBtn').innerHTML = meInner();
  return r;
}
// chọn ảnh → khung cắt (kéo để chỉnh vị trí, thanh trượt để phóng to) → data URL JPEG đã thu nhỏ
function pickFile(accept = 'image/png,image/jpeg,image/webp,image/gif') {
  return new Promise(ok => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => ok(i.files[0] || null); i.click(); });
}
function cropImage(file, { w, h, fw, fh, round, title, q = .86 }) {
  return new Promise((done, fail) => {
    if (!/^image\//.test(file.type)) return fail(new Error('Tệp không phải ảnh'));
    if (file.size > 25e6) return fail(new Error('Ảnh quá lớn (tối đa 25MB)'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('Không đọc được tệp ảnh')); };
    img.onload = () => {
      const nw = img.naturalWidth, nh = img.naturalHeight, s0 = Math.max(fw / nw, fh / nh);
      let z = 1, ox = (fw - nw * s0) / 2, oy = (fh - nh * s0) / 2, res = null;
      const m = modal({ title, narrow: fw <= 320, body: `<div class="crop-wrap"><div class="crop ${round ? 'round' : ''}" style="width:${fw}px;height:${fh}px"><img src="${url}" alt="" draggable="false"></div></div>
        <div class="row mt" style="justify-content:center;gap:10px">${ico('fa-image')}<input type="range" id="cz" min="1" max="4" step=".01" value="1" style="width:220px">${ico('fa-magnifying-glass-plus')}</div>
        <div class="small muted center mt">Kéo ảnh để chỉnh vị trí · kéo thanh trượt để phóng to</div>`,
        foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="cOk">${ico('fa-check')} Dùng ảnh này</button>`, onClose: () => { URL.revokeObjectURL(url); done(res); } });
      const im = $('.crop img', m.el), box = $('.crop', m.el);
      const draw = () => { const W = nw * s0 * z, H = nh * s0 * z; ox = Math.min(0, Math.max(fw - W, ox)); oy = Math.min(0, Math.max(fh - H, oy)); im.style.cssText = `width:${W}px;height:${H}px;transform:translate(${ox}px,${oy}px)`; };
      draw();
      $('#cz', m.el).oninput = e => { const z2 = +e.target.value, cx = fw / 2, cy = fh / 2; ox = cx - (cx - ox) * z2 / z; oy = cy - (cy - oy) * z2 / z; z = z2; draw(); };
      box.onpointerdown = e => { box.setPointerCapture(e.pointerId); const x0 = e.clientX - ox, y0 = e.clientY - oy; box.onpointermove = ev => { ox = ev.clientX - x0; oy = ev.clientY - y0; draw(); }; box.onpointerup = () => box.onpointermove = null; };
      box.onwheel = e => { e.preventDefault(); const r = $('#cz', m.el); r.value = Math.min(4, Math.max(1, +r.value - e.deltaY / 600)); r.oninput({ target: r }); };
      $('#cOk', m.el).onclick = () => {
        const c = document.createElement('canvas'), k = w / fw; c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = 'high';
        g.drawImage(img, ox * k, oy * k, nw * s0 * z * k, nh * s0 * z * k);
        res = c.toDataURL('image/jpeg', q); m.close();
      };
    };
    img.src = url;
  });
}

V.profile = async (main, params) => {
  let P = await api('GET', '/api/profile'), tab = ['info', 'status', 'set', 'sec'].includes(params.tab) ? params.tab : 'info';
  const isAdmin = M.me.role === 'admin', sysLinks = (M.menu.find(m => m[0] === '12')?.[3] || []);
  const stOf = k => STATUS.find(s => s[0] === (k || 'lam_viec'));
  const seg = (k, opts, v) => `<div class="segc" data-pref="${k}">${opts.map(([val, l, i]) => `<button type="button" data-v="${val}" class="${String(v) === String(val) ? 'on' : ''}">${i ? ico(i) + ' ' : ''}${l}</button>`).join('')}</div>`;
  const sw = (k, v) => `<label class="sw"><input type="checkbox" data-pref="${k}" ${v ? 'checked' : ''}><span></span></label>`;
  const row = (l, sub, ctl) => `<div class="pf-row"><div><b>${l}</b>${sub ? `<div class="small muted">${sub}</div>` : ''}</div><div class="pf-ctl">${ctl}</div></div>`;
  const homes = M.menu.flatMap(([, t, , items]) => items.map(([id, l]) => [id, `${t} › ${l}`]));

  const hero = () => `<div class="card pf-hero">
    <div class="pf-cover ${P.cover ? '' : 'empty'}" ${P.cover ? `style="background-image:url('${P.cover}')"` : ''}>
      <div class="pf-cbtns"><button class="btn sm glass" id="pfCover">${ico('fa-camera')} ${P.cover ? 'Đổi ảnh bìa' : 'Cập nhật ảnh bìa'}</button>${P.cover ? `<button class="btn sm glass" id="pfCoverX" title="Gỡ ảnh bìa">${ico('fa-trash-can')}</button>` : ''}</div></div>
    <div class="pf-id">
      <div class="pf-avw">${avHtml(P, 'pf-av')}<button class="pf-cam" id="pfAv" title="Đổi ảnh đại diện">${ico('fa-camera')}</button></div>
      <div class="pf-name"><h1>${esc(P.full_name)}${P.is_trial ? ' <span class="tag demo">thử</span>' : ''}</h1>
        <div class="muted">${[P.title, roleName(P.role), P.dept].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="pf-stline">${pill(stOf(P.status)[1], stOf(P.status)[2])}${P.status_msg ? `<span class="small">“${esc(P.status_msg)}”</span>` : ''}</div></div>
      <div class="pf-acts">${P.avatar ? `<button class="btn sm ghost" id="pfAvX">${ico('fa-user-slash')} Gỡ ảnh đại diện</button>` : ''}</div>
    </div>
    <div class="tabs">${[['info', 'Thông tin cá nhân', 'fa-id-card'], ['status', 'Trạng thái', 'fa-signal'], ['set', 'Cài đặt hệ thống', 'fa-sliders'], ['sec', 'Bảo mật & đăng nhập', 'fa-shield-halved']].map(([k, l, i]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${ico(i)} ${l}</button>`).join('')}</div></div>`;

  const body = () => {
    if (tab === 'info') {
      const ro = v => `<div class="ro">${esc(v || '—')}</div>`;
      return `<div class="card mt"><div class="hd"><h3>${ico('fa-id-card')} Thông tin cá nhân</h3></div><div class="bd"><div id="pfErr"></div><form class="form" id="pfForm">
        <div class="fld"><label>Họ và tên<span class="req">*</span></label><input name="full_name" maxlength="80" value="${esc(P.full_name)}"><div class="help">Tên hiển thị trên app, phiếu trình duyệt, nhật ký</div></div>
        <div class="fld"><label>Tên đăng nhập</label>${ro(P.username)}</div>
        <div class="fld"><label>Chức danh</label>${isAdmin ? `<input name="title" maxlength="80" value="${esc(P.title || '')}">` : ro(P.title)}</div>
        <div class="fld"><label>Bộ phận</label>${isAdmin ? `<input name="dept" maxlength="80" value="${esc(P.dept || '')}">` : ro(P.dept)}</div>
        <div class="fld"><label>Điện thoại</label><input name="phone" maxlength="20" inputmode="tel" value="${esc(P.phone || '')}"></div>
        <div class="fld"><label>Email</label><input name="email" maxlength="120" inputmode="email" value="${esc(P.email || '')}"></div>
        <div class="fld"><label>Vai trò</label>${ro(roleName(P.role))}</div>
        <div class="fld"><label>Ngày tạo tài khoản</label>${ro(dmyhm(P.created_at))}</div>
        <div class="fld wide"><label>Giới thiệu ngắn</label><textarea name="bio" maxlength="300" placeholder="VD: Phụ trách khách hàng dự án CTS tòa O, P">${esc(P.bio || '')}</textarea></div>
      </form>${isAdmin ? '' : '<div class="small muted mt">Chức danh, bộ phận và vai trò do Quản trị hệ thống cập nhật.</div>'}
      <div class="row mt" style="justify-content:flex-end"><button class="btn pri" id="pfSave">${ico('fa-floppy-disk')} Lưu thông tin</button></div></div></div>`;
    }
    if (tab === 'status') return `<div class="card mt"><div class="hd"><h3>${ico('fa-signal')} Trạng thái làm việc</h3><span class="grow"></span><span class="small muted">Hiện cạnh ảnh đại diện để đồng nghiệp biết bạn đang ở đâu</span></div><div class="bd">
      <div class="pf-sts">${STATUS.map(([k, l, c, i]) => `<button type="button" class="pf-st ${(P.status || 'lam_viec') === k ? 'on' : ''}" data-st="${k}"><i class="sdot s-${k}"></i>${ico(i)}<b>${esc(l)}</b></button>`).join('')}</div>
      <div class="fld mt"><label>Lời nhắn trạng thái</label><div class="row" style="gap:8px;flex-wrap:nowrap"><input id="stMsg" maxlength="120" style="flex:1" value="${esc(P.status_msg || '')}" placeholder="VD: Đang dẫn khách xem căn mẫu CTS, quay lại lúc 15h"><button class="btn pri" id="stSave">${ico('fa-check')} Lưu</button><button class="btn" id="stClr">${ico('fa-eraser')} Xóa</button></div></div>
      <div class="pf-chips mt">${['Đang dẫn khách xem nhà mẫu', 'Đang ở Sở Xây dựng', 'Đang đi công trình', 'Làm việc tại nhà', 'Nghỉ trưa – quay lại 13h30', 'Liên hệ qua Zalo'].map(t => `<button type="button" class="chip" data-msg="${esc(t)}">${esc(t)}</button>`).join('')}</div></div></div>`;
    if (tab === 'set') {
      const p = prefs();
      return `<div class="grid g2 mt pf-setg"><div class="card"><div class="hd"><h3>${ico('fa-palette')} Giao diện</h3></div><div class="bd">
        ${row('Chế độ hiển thị', 'Giao diện tối dịu mắt khi làm buổi tối', seg('theme', [['light', 'Sáng', 'fa-sun'], ['dark', 'Tối', 'fa-moon'], ['auto', 'Theo máy', 'fa-desktop']], p.theme))}
        ${row('Màu nhấn', esc((ACCENTS[p.accent] || ACCENTS.cobalt)[0]), `<div class="swatches" data-pref="accent">${Object.entries(ACCENTS).map(([k, a]) => `<button type="button" data-v="${k}" class="${p.accent === k ? 'on' : ''}" title="${esc(a[0])}" style="--c:${a[1]};--c2:${a[3]}"></button>`).join('')}</div>`)}
        ${row('Cỡ chữ', 'Phóng to / thu nhỏ toàn bộ app', seg('zoom', [[.9, 'Nhỏ'], [1, 'Vừa'], [1.1, 'Lớn'], [1.2, 'Rất lớn']], p.zoom))}
        ${row('Bảng dữ liệu gọn', 'Hàng thấp hơn, xem được nhiều dòng hơn', sw('dense', p.dense))}
        ${row('Hiệu ứng chuyển động', 'Tắt nếu máy chạy chậm', sw('anim', p.anim))}
        ${row('Hình nền thành phố', 'Lưới và hình tòa nhà mờ phía sau', sw('deco', p.deco))}
      </div></div>
      <div><div class="card"><div class="hd"><h3>${ico('fa-compass')} Điều hướng</h3></div><div class="bd">
        ${row('Trang mở đầu', 'Màn hình hiện ra khi mở app / bấm logo', `<select data-pref="home" class="inp">${homes.map(([id, l]) => `<option value="${esc(id)}" ${p.home === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`)}
      </div></div>
      <div class="card mt"><div class="hd"><h3>${ico('fa-bell')} Thông báo</h3></div><div class="bd">
        ${row('Đếm phiếu chờ duyệt', 'Số đỏ trên nút ' + ico('fa-stamp'), sw('badgeApr', p.badgeApr))}
        ${row('Đếm cảnh báo / nhắc việc', 'Số đỏ trên nút ' + ico('fa-bell'), sw('badgeAl', p.badgeAl))}
        ${row('Tự làm mới thông báo', '', seg('refresh', [[1, '1 phút'], [2, '2 phút'], [5, '5 phút'], [0, 'Tắt']], p.refresh))}
      </div></div></div></div>
      ${sysLinks.length ? `<div class="card mt"><div class="hd"><h3>${ico('fa-gear')} Cấu hình chung của hệ thống</h3><span class="grow"></span><span class="small muted">Áp dụng cho mọi người dùng</span></div><div class="bd"><div class="pf-links">${sysLinks.map(([id, l]) => `<a href="${id.startsWith('e:') ? '#/e/' + id.slice(2) : '#/v/' + id}">${ico('fa-arrow-right')} ${esc(l)}</a>`).join('')}</div></div></div>` : ''}
      <div class="row mt" style="justify-content:space-between"><span class="small muted">${ico('fa-cloud')} Cài đặt tự lưu theo tài khoản — đăng nhập máy khác vẫn giữ nguyên</span><button class="btn" id="pfReset">${ico('fa-rotate-left')} Khôi phục mặc định</button></div>`;
    }
    return `<div class="grid g2 mt"><div class="card"><div class="hd"><h3>${ico('fa-key')} Mật khẩu</h3></div><div class="bd">
        ${M.noLogin ? '<div class="warnbar">Đang chạy thử không đăng nhập — đổi mật khẩu dùng khi vận hành thật.</div>' : `<p class="small muted" style="margin-top:0">Mật khẩu tối thiểu 6 ký tự. Không dùng chung mật khẩu với tài khoản khác.</p><button class="btn pri" id="pfPw">${ico('fa-key')} Đổi mật khẩu</button>`}</div></div>
      <div class="card"><div class="hd"><h3>${ico('fa-clock-rotate-left')} Đăng nhập</h3></div><div class="bd"><dl class="kv"><div><dt>Lần đăng nhập gần nhất</dt><dd>${dmyhm(P.last_login) || '—'}</dd></div><div><dt>Tài khoản tạo lúc</dt><dd>${dmyhm(P.created_at)}</dd></div></dl>
        ${M.noLogin ? '' : `<button class="btn mt" id="pfOut">${ico('fa-right-from-bracket')} Đăng xuất</button>`}</div></div></div>`;
  };
  const draw = () => { main.innerHTML = `<div class="page pf">${hero()}${body()}</div>`; };
  const save = async d => { P = await saveProfile(d); return P; };
  const savePref = debounce(async () => { try { await save({ prefs: M.me.prefs }); toast('Đã lưu cài đặt'); } catch (e) { toast(e.message, true); } }, 500);
  const setPref = (k, v) => { M.me.prefs = { ...(M.me.prefs || {}), [k]: v }; applyPrefs(); if (k === 'refresh' || k.startsWith('badge')) badgeTimer(); draw(); savePref(); };
  draw();
  main.onchange = e => { const t = e.target; if (t.dataset.pref) setPref(t.dataset.pref, t.type === 'checkbox' ? t.checked : t.value); };
  main.onclick = run(async e => {
    const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; history.replaceState(null, '', `#/v/profile?tab=${tab}`); return draw(); }
    const sv = e.target.closest('.segc [data-v], .swatches [data-v]'); if (sv) { const k = sv.parentElement.dataset.pref, v = sv.dataset.v; return setPref(k, ['zoom', 'refresh'].includes(k) ? +v : v); }
    if (e.target.closest('#pfAv')) { const f = await pickFile(); if (!f) return; const d = await cropImage(f, { w: 320, h: 320, fw: 280, fh: 280, round: 1, title: `${ico('fa-user')} Ảnh đại diện`, q: .88 }); if (!d) return; await save({ avatar: d }); toast('Đã cập nhật ảnh đại diện'); return draw(); }
    if (e.target.closest('#pfCover')) { const f = await pickFile(); if (!f) return; const fw = Math.min(640, innerWidth - 80); const d = await cropImage(f, { w: 1600, h: 400, fw, fh: Math.round(fw / 4), title: `${ico('fa-image')} Ảnh bìa`, q: .82 }); if (!d) return; await save({ cover: d }); toast('Đã cập nhật ảnh bìa'); return draw(); }
    if (e.target.closest('#pfAvX')) { if (!await ask('Gỡ ảnh đại diện', 'Gỡ ảnh đại diện và dùng chữ viết tắt tên?', { danger: 1, okLabel: 'Gỡ ảnh' })) return; await save({ avatar: null }); return draw(); }
    if (e.target.closest('#pfCoverX')) { if (!await ask('Gỡ ảnh bìa', 'Gỡ ảnh bìa và dùng nền mặc định?', { danger: 1, okLabel: 'Gỡ ảnh' })) return; await save({ cover: null }); return draw(); }
    if (e.target.closest('#pfSave')) {
      const f = $('#pfForm'), d = {}; for (const k of ['full_name', 'title', 'dept', 'phone', 'email', 'bio']) if (f.elements[k]) d[k] = f.elements[k].value;
      if (!d.full_name.trim()) { $('#pfErr').innerHTML = '<div class="errbar">Họ tên không được để trống</div>'; return; }
      try { await save(d); toast('Đã lưu thông tin cá nhân'); draw(); } catch (x) { $('#pfErr').innerHTML = `<div class="errbar">${esc(x.message)}</div>`; }
      return;
    }
    const st = e.target.closest('[data-st]'); if (st) { await save({ status: st.dataset.st }); toast('Trạng thái: ' + stOf(st.dataset.st)[1]); return draw(); }
    const ch = e.target.closest('[data-msg]'); if (ch) { $('#stMsg').value = ch.dataset.msg; $('#stMsg').focus(); return; }
    if (e.target.closest('#stSave')) { await save({ status_msg: $('#stMsg').value }); toast('Đã lưu lời nhắn'); return draw(); }
    if (e.target.closest('#stClr')) { await save({ status_msg: '' }); return draw(); }
    if (e.target.closest('#pfReset')) { if (!await ask('Khôi phục mặc định', 'Đưa toàn bộ cài đặt giao diện, điều hướng, thông báo về mặc định?')) return; M.me.prefs = {}; applyPrefs(); badgeTimer(); await save({ prefs: {} }); toast('Đã khôi phục mặc định'); return draw(); }
    if (e.target.closest('#pfPw')) return forcePassword();
    if (e.target.closest('#pfOut')) { await api('POST', '/api/logout', {}); await window.__ctgBeforeReload?.(); location.hash = ''; location.reload(); }
  });
  main.onkeydown = e => { if (e.key === 'Enter' && e.target.id === 'stMsg') $('#stSave').click(); };
};

// ---- ai.js
// Trợ lý AI tra cứu: khung trò chuyện (ngăn bên phải trên mọi màn + màn «Trợ lý AI tra cứu»).
'use strict';
const AI = { conv: null, items: [], busy: false };   // items: { who: 'me'|'ai'|'err', text, steps }

// markdown tối giản và an toàn: thoát HTML trước, chỉ cho liên kết nội bộ (#…)
function mdInline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((#[^)\s]*)\)/g, (_, t, h) => `<a href="${h}" class="ai-link${/^#(ai|form)\//.test(h) ? ' ai-btn' + (h === '#ai/ok' ? ' ok' : h === '#form' || h.startsWith('#form/') ? ' ok' : '') : ''}">${t}</a>`)
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
    ? ['Tổng công nợ quá hạn hiện nay là bao nhiêu? Top 10 khách nợ nhiều nhất', 'Tiến độ doanh số so với chỉ tiêu năm nay theo từng dự án', 'Căn nào đủ điều kiện bàn giao mà chưa có lịch hẹn?', 'Duyệt hết hồ sơ đang chờ tôi', 'Hẹn gọi lại khách căn TNS-G-0603 thứ 6']
    : ['Khách nào của tôi sắp đến hạn thanh toán trong 7 ngày tới?', 'Tra cứu căn TNS-G-0603: khách, hợp đồng, công nợ', 'Tòa G còn bao nhiêu căn đang mở bán?', 'Các việc tồn đọng của tôi hôm nay', 'Tạo khách hàng Nguyễn Văn An 0912345678'];
}
function aiBody(full) {
  const list = AI.items.length ? AI.items.map(m => m.who === 'me'
    ? `<div class="ai-msg mine"><div class="bub">${esc(m.text).replace(/\n/g, '<br>')}</div></div>`
    : `<div class="ai-msg ${m.who}"><span class="ai-av">${ico(m.who === 'err' ? 'fa-triangle-exclamation' : 'fa-wand-magic-sparkles')}</span><div class="bub">${m.steps?.length ? `<details class="ai-steps"><summary>${ico('fa-magnifying-glass-chart')} Đã tra cứu ${m.steps.length} nguồn</summary><ul>${m.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}${m.who === 'err' ? esc(m.text) : md(m.text)}</div></div>`).join('')
    : `<div class="ai-hello"><span class="ai-av big">${ico('fa-wand-magic-sparkles')}</span><b>Trợ lý AI tra cứu</b><p class="muted small">Hỏi bằng tiếng Việt về căn hộ, khách hàng, hợp đồng, công nợ, bàn giao, sổ hồng, báo cáo… — hoặc <b>ra lệnh</b>: sửa, giao phụ trách, gia hạn giữ chỗ, trình / duyệt, ghi chú, hẹn gọi lại, tạo hồ sơ. Lệnh luôn hỏi xác nhận trước khi làm, đúng quyền của bạn, có hoàn tác.</p>
      <div class="ai-sug">${aiSuggest().map(s => `<button data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
  const busy = AI.busy ? `<div class="ai-msg ai"><span class="ai-av">${ico('fa-wand-magic-sparkles')}</span><div class="bub ai-typing"><span></span><span></span><span></span> <small class="muted">Đang tra cứu dữ liệu…</small></div></div>` : '';
  return `<div class="ai-list">${list}${busy}</div>
    <form class="ai-in"><textarea rows="1" placeholder="${M.ai ? (M.aiLocal ? 'Hỏi hoặc ra lệnh: «sửa SĐT KH000141 thành …», «gia hạn giữ chỗ căn … thêm 3 ngày»… (Enter để gửi)' : 'Hỏi trợ lý… (Enter để gửi, Shift+Enter xuống dòng)') : 'Trợ lý đang tắt'}" ${M.ai ? '' : 'disabled'}></textarea>
    <button class="btn pri" ${M.ai && !AI.busy ? '' : 'disabled'} title="Gửi">${ico('fa-paper-plane')}</button></form>
    <div class="ai-foot small muted">${full ? '' : `<a href="#/v/ai">${ico('fa-up-right-and-down-left-from-center')} Mở toàn màn hình</a> · `}${M.aiLocal ? 'Trợ lý nội sinh — tra cứu thẳng dữ liệu trong app, không gửi ra ngoài. Bấm liên kết để mở hồ sơ.' : 'AI có thể nhầm — đối chiếu số liệu ở hồ sơ gốc trước khi dùng.'}</div>`;
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
    if (r.changed) window.dispatchEvent(new Event('focus'));   // agent vừa sửa dữ liệu → màn đang mở tự tải lại
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
    // 17/11/2026: chế độ agent — nút Thực hiện / Hủy / Hoàn tác và mở form điền sẵn
    const ag = /^#ai\/(ok|no|undo)$/.exec(a.getAttribute('href'));
    if (ag) { e.preventDefault(); if (a.closest('.ai-msg') !== $$('.ai-msg.ai', box).pop()) return toast('Lệnh này đã cũ — gõ lại lệnh', true); return aiSend({ ok: 'Xác nhận', no: 'Hủy', undo: 'Hoàn tác' }[ag[1]]); }
    const fm = /^#form\/(\w+)\/([\w-]*)$/.exec(a.getAttribute('href'));
    if (fm) { e.preventDefault(); let preset = {}; try { preset = JSON.parse(decodeURIComponent(escape(atob(fm[2].replace(/-/g, '+').replace(/_/g, '/'))))); } catch { }
      if (M.ents[fm[1]]) openForm(fm[1], { preset, onSaved: row => { toast(`Đã lưu ${M.ents[fm[1]].one}`); openDetail(fm[1], row.id); } });
      if (box.dataset.full !== '1' && window.innerWidth < 900) aiClose(); return; }
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
V.ai = async (main, params = {}) => {
  aiClose();
  main.innerHTML = `<div class="page">${head('01', 'Trợ lý AI tra cứu', 'fa-wand-magic-sparkles', `<button class="btn" id="aiNew2">${ico('fa-rotate-right')} Cuộc trò chuyện mới</button>`)}
    <div class="card ai-page"><div class="ai-box" data-full="1"></div></div></div>`;
  $('#aiNew2', main).onclick = aiNew;
  aiWire($('.ai-box', main)); aiRender();
  $('textarea', main).focus();
  if (params.q) { history.replaceState(null, '', '#/v/ai'); aiSend(params.q); }   // 17/11/2026: câu hỏi gõ ở ô tìm trên cùng
};
