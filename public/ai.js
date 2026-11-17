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
