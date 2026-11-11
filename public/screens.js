// Khung app, đăng nhập, điều hướng và các màn tổng hợp.
'use strict';
const V = {};
const filt = () => ST.filt ||= { project: '', building: '', from: '', to: '' };

// ---------- đăng nhập ----------
async function loginView() {
  try { const i = await (await fetch('/api/login-info')).json(); if (i.noLogin) { history.replaceState(null, '', location.pathname + location.search); return boot(); } } catch {}
  document.body.innerHTML = `<div class="login"><div class="hero"><img src="/logo.png" alt=""><div class="k">CAT TUONG GROUP</div><h1>Quản lý <span>Phòng Kinh doanh</span></h1><p>Một mã căn — một hồ sơ xuyên suốt: giỏ hàng, khách hàng, giao dịch, hợp đồng, công nợ, bàn giao và cấp sổ hồng.</p></div>
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
  document.body.innerHTML = `<header class="top"><button class="ibtn burger" id="burger" aria-label="Menu">${ico('fa-bars')}</button><a class="brand" href="${homeHash()}"><img src="/logo.png" alt="Cát Tường"><div><b>CAT TUONG GROUP</b><span>Phòng Kinh doanh</span></div></a>
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
  window.onhashchange = route;
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
  closeDetail(); document.body.classList.remove('nav-open'); ST.reload = null; checkVer();
  const tok = ST.nav = (ST.nav || 0) + 1;   // màn cũ còn tải dở mà người dùng đã chuyển màn: bỏ qua lỗi của nó
  const h = location.hash.slice(1) || homeHash().slice(1);
  const [p, qs] = h.split('?'); const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const [, kind, name] = p.split('/');
  const main = $('#main'); if (!main) return;
  main.onclick = main.onchange = main.onkeydown = null; main.innerHTML = '<div class="empty">Đang tải…</div>';
  const navId = kind === 'e' ? ({ project: 'projects', building: 'projects', unit: 'products', cancel_req: 'payouts', receipt: 'vouchers', payment: 'vouchers' }[name] || 'e:' + name + (params.group ? '?group=' + params.group : '')) : name === 'unit360' || name === 'cust360' ? 'lookup' : name === 'pricesheet' ? 'e:price_policy' : name === 'debtsum' || name === 'ctdebt' ? 'loantrack' : name === 'debtunit' ? 'unitstatus' : name;
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navId));
  const on = $(`[data-nav="${navId}"]`); $$('.mod').forEach(m => m.classList.remove('cur'));
  if (on) { on.closest('.mod').classList.add('open', 'cur'); }
  try {
    if (kind === 'e' && name === 'noxh_check' && M.piiRoles.includes(M.me.role)) await V.mau4(main, params);
    else if (kind === 'e' && (name === 'receipt' || name === 'payment')) await V.vouchers(main, { ...params, tab: name });   // gộp 1 màn Phiếu thu – Phiếu chi (06/11/2026)
    else if (kind === 'e' && name === 'cancel_req') await V.payouts(main, params);   // bỏ màn «Hủy giao dịch – đổi căn» 28/10/2026 — đề nghị hủy / đổi căn xem ở Theo dõi thanh lý & chi trả   // Hồ sơ mua NOXH hiện theo bảng tổng hợp Mẫu 4
    else if (kind === 'e' && M.ents[name]) { await listView(main, name, params); if (name === 'collect_plan') await planFlow(main, params); }
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
V.myday = async main => {
  const me = M.me, first = String(me.full_name || '').split(/\s[–-]\s/)[0].trim().split(/\s+/).slice(-1)[0] || '';   // «Nguyễn Thị Thư» → Thư; bỏ phần sau « – »
  const DOW = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const greet = () => { const h = new Date().getHours(); return h < 11 ? ['Chào buổi sáng', 'fa-mug-hot'] : h < 13 ? ['Chào buổi trưa', 'fa-sun'] : h < 18 ? ['Chào buổi chiều', 'fa-cloud-sun'] : ['Chào buổi tối', 'fa-moon']; };
  const clock = () => { const d = new Date(); return `${DOW[d.getDay()]}, ${dmy(today())} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const city = lsGet('ctg-kd-wx-city') || 'bac_ninh';
  const [g, gi] = greet();
  main.innerHTML = `<div class="page">
    <div class="md-hero card mb"><div class="md-hi"><div class="eyebrow">${ico(gi)} <span id="mdClock">${clock()}</span></div><h1 id="mdGreet">${g}${first ? ', ' + esc(first) : ''}!</h1>
        <div class="md-sub" id="mdSub">Đang tổng hợp việc hôm nay…</div></div>
      <div class="md-wx"><div class="wx-head"><b>${ico('fa-cloud-sun')} Thời tiết hôm nay</b><span class="grow"></span>
          <select id="wxCity" class="inp sm">${WX_CITY.map(c => `<option value="${c[0]}" ${city === c[0] ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}<option value="gps" ${city === 'gps' ? 'selected' : ''}>Vị trí hiện tại</option></select></div>
        <div id="wxBox"><div class="empty">Đang lấy thời tiết…</div></div></div></div>
    <div class="grid g4 mb" id="mdK"></div>
    <div class="grid md-cols"><div class="card"><div class="hd"><h3>${ico('fa-list-check')} Việc cần làm</h3><span class="grow"></span><a href="#/v/alerts" class="small">Xem tất cả ›</a></div><div id="mdTodo"><div class="empty">Đang tải…</div></div></div>
      <div><div class="card mb"><div class="hd"><h3>${ico('fa-calendar-check')} Lịch ký 7 ngày tới</h3><span class="grow"></span><a href="#/v/signing" class="small">Lịch ký ›</a></div><div id="mdSign"><div class="empty">Đang tải…</div></div></div>
        <div class="card"><div class="hd"><h3>${ico('fa-bolt')} Mở nhanh</h3></div><div class="md-quick" id="mdQuick"></div></div></div></div></div>`;
  // đồng hồ + lời chào tự đổi theo giờ; dừng khi rời màn
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
  const QUICK = [['vouchers', 'Phiếu thu – Phiếu chi', 'fa-file-invoice-dollar'], ['loantrack', 'Theo dõi công nợ', 'fa-file-contract'], ['board', 'Bảng hàng', 'fa-table-cells'], ['signing', 'Lịch ký', 'fa-calendar-check'],
    ['approvals', 'Hộp phê duyệt', 'fa-inbox'], ['dashboard', 'Dashboard', 'fa-gauge-high'], ['e:customer', 'Khách hàng', 'fa-users']];
  const okNav = new Set(M.menu.flatMap(m => m[3].map(x => x[0])));
  $('#mdQuick', main).innerHTML = QUICK.filter(q => okNav.has(q[0])).map(([id, l, ic]) => `<a href="${id.startsWith('e:') ? '#/e/' + id.slice(2) : '#/v/' + id}">${ico(ic)}<span>${esc(l)}</span></a>`).join('') || '<div class="empty">—</div>';
  let al = [];
  main.onclick = e => {
    if (e.target.closest('#wxRe')) { e.preventDefault(); return wx(true); }
    const r = e.target.closest('[data-ai]'); if (r) { const a = al[+r.dataset.ai]; if (a.ent) openDetail(a.ent, a.id); else if (a.unit_id) location.hash = `#/v/unit360?id=${a.unit_id}`; else if (a.cat === 'ke_hoach') location.hash = '#/e/collect_plan'; return; }
    const s = e.target.closest('[data-sg]'); if (s) openDetail(s.dataset.sg.split(':')[0], +s.dataset.sg.split(':')[1]);
  };
  wx();
  const d = await api('GET', '/api/my-day'); al = d.alerts;
  const n = l => al.filter(a => a.lvl === l).length, todaySign = d.signing.filter(x => x.plan_sign === d.today).length;
  $('#mdSub', main).innerHTML = !al.length && !d.signing.length ? 'Hôm nay chưa có việc tồn đọng nào — chúc một ngày làm việc hiệu quả!'
    : `Hôm nay có <b>${n('r')}</b> việc gấp, <b>${n('a')}</b> việc cần làm${d.approvals ? `, <b>${d.approvals}</b> hồ sơ chờ bạn duyệt` : ''}${todaySign ? `, <b>${todaySign}</b> lịch ký hợp đồng` : ''}.`;
  const tile = (l, v, sub, href, red) => `<a class="card kpi ${red ? 'red' : ''}" href="${href}" style="text-decoration:none;color:inherit"><div class="l">${l}</div><div class="v" style="font-size:22px">${v}</div><div class="s">${sub}</div></a>`;
  $('#mdK', main).innerHTML = tile('Việc gấp', n('r'), 'quá hạn, cần xử lý ngay', '#/v/alerts', n('r') > 0) + tile('Việc cần làm', n('a'), 'sắp đến hạn', '#/v/alerts')
    + tile('Chờ tôi duyệt', d.approvals, 'trong Hộp phê duyệt', '#/v/approvals') + tile('Lịch ký 7 ngày', d.signing.length, todaySign ? `${todaySign} lịch hôm nay` : 'không có lịch hôm nay', '#/v/signing');
  const LV = { r: 'Gấp', a: 'Cần làm', b: 'Theo dõi' };
  $('#mdTodo', main).innerHTML = al.length ? `<div class="md-todo">${al.slice(0, 30).map((a, i) => `<div class="alert-row" data-ai="${i}"><span class="lv ${a.lvl}"></span><div class="tx"><div>${esc(a.text)}</div>
      <div class="small muted">${esc(M.alertCat[a.cat] || '')}${a.due ? ' · ' + dmy(a.due) : ''}${a.who ? ' · ' + esc(a.who) : ''}</div></div><span class="pill ${a.lvl === 'r' ? 'r' : a.lvl === 'a' ? 'a' : 'b'}">${LV[a.lvl]}</span></div>`).join('')}</div>
      ${al.length > 30 ? `<div class="small muted mt">Còn ${al.length - 30} việc nữa — <a href="#/v/alerts">xem tất cả</a></div>` : ''}` : `<div class="empty">${ico('fa-circle-check')} Không có việc tồn đọng</div>`;
  $('#mdSign', main).innerHTML = d.signing.length ? d.signing.map(x => `<div class="alert-row" data-sg="${x.ent}:${x.id}"><span class="lv ${x.plan_sign === d.today ? 'a' : 'b'}"></span><div class="tx">
      <div><b>${x.plan_sign === d.today ? 'Hôm nay' : dmy(x.plan_sign)}</b> · ${esc(x.unit || '')} · ${esc(x.customer || '')}</div><div class="small muted">${esc([x.number, x.kind_l, x.sign_place, x.owner].filter(Boolean).join(' · '))}</div></div></div>`).join('')
    : '<div class="empty">Không có lịch ký trong 7 ngày tới</div>';
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
    const floors = [...new Set(d.units.map(u => u.floor))].sort((a, b) => b - a);
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
  const CC = [['code', 'Mã'], ['full_name', 'Tên'], ['address', 'Địa chỉ'], ['phone', 'Điện thoại'], ['email', 'Email'], ['tax_code', 'Mã số thuế']];   // như lưới Bravo, mã trước tên; bỏ cột Tình trạng (03/11/2026) — vẫn lọc được ở ô «Mọi tình trạng»
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
    main.innerHTML = `<div class="page">${head('02', 'Danh mục khách hàng', 'fa-address-book', `${tplOn('customer') ? `<button class="btn" data-tpls="customer">${ico('fa-file-lines')} Mẫu biểu</button>` : ''}${M.imports.customers ? `<button class="btn" id="kImp">${ico('fa-file-import')} Nhập file</button>` : ''}${ce.x ? `<button class="btn" id="kXls">${ico('fa-file-excel')} Xuất file</button>` : ''}${ce.c ? `<button class="btn pri" id="kNew">${ico('fa-plus')} Tạo khách hàng</button>` : ''}`, 'KH-01')}
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
    if (e.target.closest('#kNew')) return openForm('customer', { skip: ['kind', 'stage', 'noxh_group', 'owner_id'], preset: { stage: 'da_nop_hsmn', ...(s.project ? { interest_project: +s.project } : {}) }, onSaved: row => { draw(); openDetail('customer', row.id); } });
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
      <div class="sec-title">${ico('fa-user')} Khách hàng</div>${d.customers.map(k => `<div class="note" data-cust="${k.id}" style="cursor:pointer"><b>${esc(k.code)} · ${esc(k.full_name)}</b><br><small>${esc(k.phone || '')} ${k.email ? '· ' + esc(k.email) : ''}</small></div>`).join('') || '<div class="muted small">Chưa có</div>'}
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
    <div class="box360"><div class="card unit-card"><div class="small muted">${esc(k.code)}</div><div class="big" style="font-size:21px">${esc(k.full_name)}</div><div class="mb">${show(cf.find(f => f.k === 'kind'), k)} ${show(cf.find(f => f.k === 'stage'), k)}</div>
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
    $('#klX', box) && ($('#klX', box).onclick = () => download('/api/export-rows', { title: `SỔ CHI TIẾT CÔNG NỢ — ${k.code} ${k.full_name}`, file: `So_cong_no_${k.code}`,
      cols: [['on', 'Ngày', 'date'], ['doc', 'Số chứng từ'], ['contract', 'Hợp đồng'], ['unit', 'Căn hộ'], ['what', 'Diễn giải'], ['no_', 'Phát sinh Nợ (phải thu)', 'money'], ['co', 'Phát sinh Có (đã thu)', 'money'], ['bal', 'Số dư', 'money']],
      rows: [{ what: 'Số dư đầu kỳ', bal: L.open, on: L.from }, ...L.rows, { what: `Số dư cuối kỳ (đến ${dmy(L.to)})`, bal: L.close }], sum: ['no_', 'co'],
      note: `Đơn vị tiền: đồng • ${L.from ? 'Từ ' + dmy(L.from) + ' ' : ''}đến ${dmy(L.to)} • Nợ = đợt thu đến hạn + phiếu chi trả khách; Có = phiếu thu; Số dư dương = khách còn nợ${L.not_due ? ` • Chưa đến hạn: ${fm(L.not_due)}` : ''}` }));
    box.onclick = e => { const tr = e.target.closest('tr[data-kl]'); if (!tr) return; const r = L.rows[+tr.dataset.kl]; if (r.ent === 'contract') location.hash = `#/v/ctdebt?id=${r.contract_id}`; else openDetail(r.ent, r.id); };
  };
  led().catch(e => { const b = $('#kLed', main); if (b) b.innerHTML = `<div class="errbar">${esc(e.message)}</div>`; });
  $('#kEdit', main).onclick = () => openDetail('customer', k.id);
  $('#kLog', main).onclick = () => openForm('contact_log', { preset: { customer_id: k.id, customer_id__l: `${k.code} · ${k.full_name}` }, onSaved: () => route() });
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
  const initials = s => String(s || '').trim().split(/\s+/).slice(-2).map(x => x[0]).join('').toUpperCase();
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
        <label class="small muted">Từ ngày<input type="date" id="scF" class="inp" value="${lf}" aria-label="Từ ngày dự kiến ký"></label><label class="small muted">Đến ngày<input type="date" id="scTo" class="inp" value="${lt}" aria-label="Đến ngày dự kiến ký"></label><button class="btn" id="scAll">Toàn bộ thời gian</button></div>
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
    $('#scF', main).onchange = e => { const v = e.target.value; if (v && !okDay(v)) return; if (v && lt && v > lt) return toast('Từ ngày phải trước Đến ngày', true); lf = v; render(); };
    $('#scTo', main).onchange = e => { const v = e.target.value; if (v && !okDay(v)) return; if (v && lf && lf > v) return toast('Từ ngày phải trước Đến ngày', true); lt = v; render(); };
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
const VT_NAV = [['all', 'fa-box-archive', 'Hồ sơ dự án'], ['recent', 'fa-clock', 'Gần đây'], ['star', 'fa-star', 'Có gắn sao'], ['trash', 'fa-trash-can', 'Thùng rác']];
const VT_CSS = `.vt { display: grid; grid-template-columns: 232px minmax(0, 1fr); gap: 22px; align-items: start; } .vt-side { position: sticky; top: 84px; display: flex; flex-direction: column; gap: 4px; } .vt-new { display: inline-flex; align-items: center; gap: 10px; align-self: flex-start; padding: 12px 24px 12px 18px; margin-bottom: 10px; border: 1px solid var(--line2); border-radius: 16px; background: var(--card); box-shadow: var(--soft2); font: inherit; font-size: 14px; font-weight: 700; color: var(--ink); cursor: pointer; } .vt-new:hover { box-shadow: var(--soft); } .vt-new:disabled { opacity: .5; cursor: not-allowed; } .vt-nav button { display: flex; align-items: center; gap: 14px; width: 100%; padding: 9px 16px; border: 0; border-radius: 20px; background: none; font: inherit; font-size: 13.5px; color: var(--muted); text-align: left; cursor: pointer; } .vt-nav button i { width: 16px; text-align: center; } .vt-nav button:hover { background: var(--cobalt-50); } .vt-nav button.on { background: var(--cobalt-100); color: var(--cobalt); font-weight: 700; } .vt-use { padding: 14px 16px 0; font-size: 12px; color: var(--muted); } .vt-main { min-width: 0; min-height: calc(100vh - 210px); padding: 16px 24px 30px; border: 1px solid var(--line2); border-radius: 18px; background: var(--card); transition: background .15s; } .vt-main.drop { outline: 2px dashed var(--cobalt-l); outline-offset: -8px; background: var(--cobalt-50); } .vt-q { position: relative; margin-bottom: 12px; } .vt-q i { position: absolute; left: 20px; top: 50%; transform: translateY(-50%); color: var(--muted); } .vt-q input { width: 100%; padding: 12px 18px 12px 46px; border: 1px solid transparent; border-radius: 24px; outline: none; background: var(--paper); font: inherit; font-size: 14.5px; } .vt-q input:focus { border-color: var(--cobalt-l); background: var(--card); } .vt-top { display: flex; align-items: center; gap: 8px; min-height: 44px; } .vt-crumbs { display: flex; align-items: center; flex: 1 1 0; min-width: 0; overflow: hidden; font-size: 19px; } .vt-crumbs i { font-size: 11px; color: var(--muted2); } .vt-crumbs button { max-width: 300px; padding: 4px 10px; border: 0; border-radius: 10px; background: none; font: inherit; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; } .vt-crumbs button:hover { background: var(--cobalt-50); } .vt-crumbs button:last-child { color: var(--ink); font-weight: 600; } .vt-seg { display: inline-flex; border: 1px solid var(--line2); border-radius: 10px; overflow: hidden; } .vt-seg button { padding: 7px 11px; border: 0; background: var(--card); color: var(--muted); cursor: pointer; } .vt-seg button.on { background: var(--cobalt-100); color: var(--cobalt); } .vt-h { margin: 18px 0 10px; font-size: 13px; font-weight: 600; color: var(--muted); } .vt-fgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; } .vt-dgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; } .vt-f { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 14px; border: 1px solid transparent; border-radius: 12px; background: var(--paper); font: inherit; color: inherit; text-align: left; cursor: pointer; } .vt-f:hover { background: var(--cobalt-50); } .vt-f > i { font-size: 18px; color: var(--amber); } .vt-f > span { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .vt-f small { display: block; font-size: 11px; font-weight: 400; color: var(--muted); overflow: hidden; text-overflow: ellipsis; } .vt-d { min-width: 0; padding: 8px 8px 10px; border: 1px solid transparent; border-radius: 12px; background: var(--paper); cursor: pointer; } .vt-d:hover { background: var(--cobalt-50); } .vt-d:focus-visible, .vt-f:focus-visible { outline: 2px solid var(--cobalt-l); } .vt-th { display: grid; place-items: center; aspect-ratio: 4 / 3; border-radius: 8px; background: var(--card); } .vt-ic { --c: #64748b; display: inline-grid; place-items: center; width: 54px; height: 62px; border: 1px solid color-mix(in srgb, var(--c) 25%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--c) 14%, transparent); font-size: 13px; font-weight: 700; color: var(--c); } .vt-ic.sm { width: 30px; height: 26px; border-radius: 5px; font-size: 9.5px; flex: none; } .vt-nm { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 9px 2px 0; font-size: 13px; font-weight: 600; } .vt-tx { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .vt-mt { padding: 2px 2px 0; font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .vt-st { color: var(--amber); font-size: 12px; flex: none; } .vt-more { flex: none; width: 26px; height: 26px; border: 0; border-radius: 7px; background: none; color: var(--muted); cursor: pointer; opacity: 0; } .vt-more:hover { background: var(--line2); } .vt-more:focus-visible, .vt-d:hover .vt-more, tr:hover .vt-more { opacity: 1; } .vt-rn { display: flex; align-items: center; gap: 10px; min-width: 240px; font-weight: 600; } .vt-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 70px 20px; text-align: center; color: var(--muted); } .vt-empty > i { font-size: 44px; opacity: .45; } .vt-empty b { font-size: 16px; font-weight: 600; color: var(--text); } .vt-ctx { position: fixed; z-index: 250; min-width: 210px; padding: 6px; border: 1px solid var(--line2); border-radius: 12px; background: var(--card); box-shadow: var(--deep); } .vt-ctx button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 12px; border: 0; border-radius: 8px; background: none; font: inherit; font-size: 13.5px; color: var(--text); text-align: left; cursor: pointer; } .vt-ctx button i { width: 16px; text-align: center; color: var(--muted); } .vt-ctx button:hover { background: var(--cobalt-50); } .vt-ctx button.danger, .vt-ctx button.danger i { color: var(--r-c); } .vt-ctx hr { margin: 5px 0; border: 0; border-top: 1px solid var(--line2); } @media (max-width: 900px) { .vt { grid-template-columns: 1fr; gap: 12px; } .vt-side { position: static; flex-direction: row; flex-wrap: wrap; align-items: center; } .vt-new { margin: 0; } .vt-nav { display: flex; flex-wrap: wrap; gap: 2px; } .vt-use { display: none; } } @media (hover: none) { .vt-more { opacity: 1; } } @media (max-width: 640px) { .vt-main { padding: 12px 12px 24px; } .vt-top { flex-wrap: wrap; } .vt-crumbs { flex-basis: 100%; font-size: 16px; } .vt-dgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .vt-fgrid { grid-template-columns: 1fr; } }`;
const vtSize = n => { n = +n || 0; return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`; };
const vtIcon = (name, sm) => { const ext = String(name).split('.').pop().toLowerCase(), [t, c] = Object.hasOwn(VT_TYPES, ext) ? VT_TYPES[ext] : ['TỆP', '#64748b']; return `<span class="vt-ic ${sm ? 'sm' : ''}" style="--c:${c}">${t}</span>`; };
const vtName = (a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true });
const vtSort = (rows, sort) => [...rows].sort(sort === 'date' ? (a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)) : sort === 'size' ? (a, b) => (b.size || 0) - (a.size || 0) : (a, b) => vtName(a.name, b.name));

V.vault = async main => {
  const f = filt(), s = ST.vault ||= { tab: 'all', ent: '', rec: '', sort: 'name', view: 'grid' };
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

  main.innerHTML = `<style>${VT_CSS}</style><div class="page">${head('05', 'Lưu trữ hồ sơ pháp lý', 'fa-folder-tree', `<select id="vtP" aria-label="Dự án"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+f.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>`, '5.6')}
    <div class="vt"><aside class="vt-side"><button class="vt-new" id="vtN">${ico('fa-plus')} Mới</button><nav class="vt-nav" id="vtNav">${VT_NAV.map(n => `<button data-tab="${n[0]}">${ico(n[1])} ${n[2]}</button>`).join('')}</nav><div class="vt-use" id="vtU"></div></aside>
    <section class="vt-main" id="vtM"><div class="vt-q">${ico('fa-magnifying-glass')}<input type="text" id="vtQ" aria-label="Tìm trong Kho hồ sơ" placeholder="Tìm tên tệp, mã căn, khách hàng…"></div>
    <div class="vt-top"><div class="vt-crumbs" id="vtC"></div><button class="btn pri" id="vtUp">${ico('fa-upload')} Tải lên</button><select id="vtS" aria-label="Sắp xếp"><option value="name">Tên</option><option value="date">Mới nhất</option><option value="size">Dung lượng</option></select><div class="vt-seg" id="vtV"><button data-v="grid" title="Dạng lưới" aria-label="Dạng lưới">${ico('fa-table-cells-large')}</button><button data-v="list" title="Dạng danh sách" aria-label="Dạng danh sách">${ico('fa-list')}</button></div></div>
    <div id="vtB"></div></section></div></div>`;
  $('#vtP', main).onchange = run(async e => { f.project = e.target.value; Object.assign(s, { ent: '', rec: '' }); await refresh(); });
  $('#vtQ', main).oninput = debounce(e => { q = e.target.value.trim().toLowerCase(); draw(); }, 200);
  $('#vtS', main).onchange = e => { s.sort = e.target.value; draw(); };
  $('#vtN', main).onclick = $('#vtUp', main).onclick = () => upload();
  main.onclick = run(async e => {
    const nav = e.target.closest('[data-tab]'); if (nav) return go(nav.dataset.tab);
    const v = e.target.closest('[data-v]'); if (v) { s.view = v.dataset.v; return draw(); }
    const c = e.target.closest('[data-c]'); if (c) return c.dataset.c === 'root' ? go('all') : c.dataset.c === 'ent' ? go('all', s.ent) : undefined;
    const fe = e.target.closest('[data-e]'); if (fe) return go('all', fe.dataset.e);
    const fr = e.target.closest('[data-r]'); if (fr) return go('all', s.ent, fr.dataset.r);
    const mo = e.target.closest('[data-m]'); if (mo) { e.stopPropagation(); const b = mo.getBoundingClientRect(); return menu(byId(mo.dataset.m), b.left, b.bottom + 4); }
    const fl = e.target.closest('[data-f]'); if (fl) { if (s.tab === 'trash') return menu(byId(fl.dataset.f), e.clientX, e.clientY); window.open('/api/file/' + fl.dataset.f, '_blank'); }
  });
  main.oncontextmenu = e => { const fl = e.target.closest('[data-f]'); if (!fl) return; e.preventDefault(); menu(byId(fl.dataset.f), e.clientX, e.clientY); };
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
      undo = r.prev; $('#m4UT', main).innerHTML = `Vừa chuyển <b>${r.n}</b> hồ sơ sang <b>${M4_ST[status][0]}</b>.`; $('#m4U', main).hidden = false;
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
const PAY_COLS = [['project', 'Dự án'], ['unit', 'Mã căn hộ'], ['customer', 'Họ tên khách hàng'], ['phone', 'Số điện thoại'], ['kind_l', 'Loại đề nghị'], ['contract_no', 'Mã hợp đồng'],
  ['contract_status_l', 'Tình trạng hợp đồng'], ['liquidate_on', 'Ngày ký thanh lý HĐMB', 'date'], ['wait_days', 'Thời gian chờ chi trả (ngày)', 'int'], ['pay_due', 'Ngày dự kiến chi trả', 'date'],
  ['money_plan_l', 'Phương án xử lý tiền đã nộp'], ['pay_amount', 'Số tiền chi trả (đồng)', 'money'], ['acct_status_l', 'Tình trạng bàn giao hồ sơ cho kế toán'], ['acct_on', 'Ngày bàn giao hồ sơ', 'date'],
  ['pay_status_l', 'Tình trạng chi tiền'], ['paid_on', 'Ngày chi tiền thực tế', 'date'], ['note', 'Ghi chú']];
V.payouts = async (main, params) => {
  const s = ST.pay ||= { project: '', q: '', st: '' };
  if (params.project) s.project = params.project;
  const L = (ent, k, v) => M.ents[ent].fields.find(f => f.k === k)?.o?.find(o => o[0] === v)?.[1] || v || '';
  const canNew = M.ents.cancel_req.perm.c;
  main.innerHTML = `<div class="page">${head('04', 'Theo dõi hủy giao dịch, thanh lý hợp đồng và chi trả tiền', 'fa-money-bill-transfer', `${canNew ? `<button class="btn pri" id="pyNew">${ico('fa-plus')} Tạo đề nghị</button>` : ''}<button class="btn" id="pyX">${ico('fa-file-excel')} Xuất file</button>`, 'GD-04')}
    <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="pyQ" placeholder="Tìm mã căn, khách hàng, SĐT, số HĐ…" value="${esc(s.q)}"></div>
      <select id="pyP"><option value="">Tất cả dự án</option>${M.projects.map(p => `<option value="${p.id}" ${+s.project === p.id ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>
      <select id="pyS"><option value="">Mọi tình trạng chi</option><option value="sap">Đến hạn ≤ 30 ngày / quá hạn</option>${M.ents.cancel_req.fields.find(f => f.k === 'pay_status').o.map(o => `<option value="${o[0]}" ${s.st === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
      <span class="grow"></span><span class="small muted" id="pyN"></span></div><div class="tbl-wrap" id="pyT"><div class="empty">Đang tải…</div></div></div></div>`;
  if (s.st) $('#pyS', main).value = s.st;
  let rows = [];
  const t = today(), t30 = addDays(t, 30);
  const dueCls = r => !r.pay_due || ['da_chi', 'khong_chi'].includes(r.pay_status) ? '' : r.pay_due < t ? 'neg' : r.pay_due <= t30 ? 'warn' : '';
  const load = async () => {
    rows = (await api('GET', '/api/payouts' + (s.project ? '?project=' + s.project : ''))).map(r => ({ ...r, kind_l: L('cancel_req', 'kind', r.kind), contract_status_l: r.contract_status ? L('contract', 'status', r.contract_status) : '',
      money_plan_l: L('cancel_req', 'money_plan', r.money_plan), acct_status_l: L('cancel_req', 'acct_status', r.acct_status), pay_status_l: L('cancel_req', 'pay_status', r.pay_status) }));
    draw();
  };
  const shown = () => { const q = s.q.trim().toLowerCase();
    return rows.filter(r => (!s.st || (s.st === 'sap' ? !!dueCls(r) : r.pay_status === s.st)) && (!q || [r.unit, r.customer, r.phone, r.contract_no, r.code].some(x => String(x ?? '').toLowerCase().includes(q)))); };
  const draw = () => {
    const rs = shown();
    $('#pyN', main).textContent = `${rs.length} đề nghị · cần chi ${fm(rs.filter(r => !['da_chi', 'khong_chi'].includes(r.pay_status)).reduce((a, r) => a + (+r.pay_amount || 0), 0))}đ`;
    $('#pyT', main).innerHTML = rs.length ? `<table class="t pyt"><thead><tr><th>STT</th>${PAY_COLS.map(c => `<th class="${c[2] === 'money' ? 'num' : ''}">${c[1]}</th>`).join('')}</tr></thead><tbody>${rs.map((r, i) => `<tr data-id="${r.id}" class="${dueCls(r)}"><td class="center">${i + 1}</td>${PAY_COLS.map(c => {
      const v = r[c[0]];
      const html = c[2] === 'money' ? (v ? fm(v) : '') : c[2] === 'date' ? dmy(v) : c[0] === 'pay_due' ? dmy(v) : esc(v ?? '');
      return `<td class="${c[2] === 'money' ? 'num' : ''} ${c[0] === 'pay_due' ? 'due' : ''} ${c[0] === 'note' || c[0] === 'money_plan_l' ? 'wrap' : ''}">${html}${c[0] === 'pay_due' && dueCls(r) ? ` <span class="tag">${r.pay_due < t ? 'quá hạn' : 'còn ' + Math.round((Date.parse(r.pay_due) - Date.parse(t)) / 864e5) + ' ngày'}</span>` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`
      : '<div class="empty">Chưa có đề nghị hủy giao dịch / thanh lý</div>';
    syncTopScroll();
  };
  $('#pyQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  $('#pyP', main).onchange = run(async e => { s.project = e.target.value; await load(); });
  $('#pyS', main).onchange = e => { s.st = e.target.value; draw(); };
  $('#pyX', main).onclick = () => download('/api/export-rows', { title: 'BẢNG THEO DÕI HỦY GIAO DỊCH, THANH LÝ HỢP ĐỒNG VÀ CHI TRẢ TIỀN', cols: PAY_COLS, rows: shown(), sum: ['pay_amount'], file: 'theo_doi_thanh_ly_chi_tra' });
  $('#pyNew', main) && ($('#pyNew', main).onclick = () => openForm('cancel_req', { onSaved: () => load() }));
  $('#pyT', main).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) openDetail('cancel_req', +tr.dataset.id); };
  await load();
};

// theo dõi vay vốn: lấy từ hợp đồng căn hộ chung cư + nhà liền kề, sửa / xóa ngay trên dòng, bấm dòng mở hợp đồng
const LOAN_COLS = [['unit', 'Mã căn hộ'], ['customer', 'Tên khách hàng'], ['number', 'Số HĐ'], ['loan_l', 'Tình trạng vay'], ['loan_bank', 'Tên ngân hàng'], ['doc3_l', 'Tình trạng chứng từ 3 bên']];
// CN-08 bảng tổng hợp công nợ — đúng bố cục file Excel «Bảng tổng hợp công nợ - kinh doanh» (2 tầng tiêu đề, nhóm theo dự án → tòa có dòng cộng)
V.debtsum = async main => {
  (ST.ctkind ||= {}).kind = 'tonghop';
  const f = filt(), s = ST.debtsum ||= { q: '', sign: '', to: '', from: '', shut: new Set() };
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
    $('#dsK', main).innerHTML = tile('Giá trị hợp đồng', tot('value'), `${rs.length} căn · ${fm(tot('value'))} đ`) + tile('Tổng đã thu', tot('t_paid'), `${fm(tot('t_paid'))} đ · thu phát sinh ${fm(tot('k_new'))}`)
      + tile('Còn lại theo tiến độ', tot('t_left_due'), `${fm(tot('t_left_due'))} đ — đến hạn chưa thu`, 1) + tile('Còn lại theo hợp đồng', tot('t_left'), `${fm(tot('t_left'))} đ · 5% theo HĐ ${fm(tot('pct5'))}`);
    $('#dsN', main).textContent = `${rs.length} căn`;
    if (!rs.length) { $('#dsT', main).innerHTML = '<div class="empty">Không có hợp đồng phù hợp</div>'; return; }
    const sumTds = (label, xs, cls, key) => `<tr class="${cls}" ${key ? `data-g="${esc(key)}"` : ''}><td></td><td colspan="7">${key ? `<i class="fa-solid fa-chevron-right tw-chev ${s.shut.has(key) ? '' : 'on'}"></i> ` : ''}<b>${esc(label)}</b></td>${cols.slice(8).map(c => `<td class="${isN(c) ? 'num' : ''}">${d.sum.includes(c[0]) ? (c[2] === 'num' ? fnum(xs.reduce((a, r) => a + (+r[c[0]] || 0), 0)) : fm(xs.reduce((a, r) => a + (+r[c[0]] || 0), 0))) : ''}</td>`).join('')}</tr>`;
    let body = '';
    const pjs = [...new Set(rs.map(r => r.project))];
    pjs.forEach((pj, pi) => {
      const prs = rs.filter(r => r.project === pj);
      body += sumTds(`${pi + 1}. HỢP ĐỒNG CĂN HỘ/NHÀ LIỀN KỀ — ${prs[0].project_name || pj} (${prs.length})`, prs, 'ds-sec');
      for (const b of [...new Set(prs.map(r => r.building))]) {
        const brs = prs.filter(r => r.building === b), key = pj + '|' + b;
        body += sumTds('Tòa ' + b, brs, 'ds-bld', key);
        if (!s.shut.has(key)) body += brs.map((r, i) => `<tr data-c="${r.contract_id}">${cols.map(c => `<td class="${isN(c) ? 'num' : ''} ${c[0] === 'address' ? 'ds-addr' : ''}">${c[0] === 'stt' ? i + 1 : c[0] === 'sign_l' ? (r.signed ? pill(r.sign_l, 'g') : pill(r.sign_l, 's')) : cell(r, c)}</td>`).join('')}</tr>`).join('');
      }
    });
    $('#dsT', main).innerHTML = `<div class="tbl-wrap"><table class="t compact hd2 grid-bravo dsum"><thead>
      <tr class="h1">${H.map(([g, cs]) => g ? `<th colspan="${cs.length}">${esc(g)}</th>` : cs.map(c => `<th rowspan="2" class="${isN(c) ? 'num' : ''}">${esc(c[1])}</th>`).join('')).join('')}</tr>
      <tr>${H.filter(([g]) => g).flatMap(([, cs]) => cs).map(c => `<th class="num">${esc(c[1])}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody><tfoot>${sumTds('Tổng cộng:', rs, 'ds-tot')}</tfoot></table></div>`;
  };
  const load = async () => {
    d = await api('GET', '/api/debt-summary?' + qsOf({ project: f.project, building: f.building, sign: s.sign, to: s.to, from: s.from, cond: s.cond }));
    $('#srcLine', main).innerHTML = `<span>${ico('fa-database')} Thực thu đồng bộ Bravo${d.bravo_sync ? ' — chốt ' + dmyhm(d.bravo_sync) : ''}</span><span>Số liệu đến ${dmy(d.to)} · thu phát sinh từ ${dmy(d.from)}</span>`;
    draw(); drawFlt();
  };
  main.innerHTML = `<div class="page">${head('06', 'Theo dõi công nợ — Bảng tổng hợp', 'fa-table-list', `<button class="btn" id="dsX">${ico('fa-file-excel')} Xuất file</button><a class="btn" href="#/v/ledger">${ico('fa-book-open')} Sổ công nợ chi tiết</a>`, 'CN-08')}${ctKindBar('tonghop')}${filterBar(f, { period: false })}
    <div class="grid g4 mb" id="dsK"></div>
    <div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="dsQ" placeholder="Mã căn, mã KH, họ tên, SĐT, số HĐ…" value="${esc(s.q)}"></div>
      <select id="dsS"><option value="">Mọi hợp đồng</option><option value="da_ky">Đã ký hợp đồng</option><option value="chua">Chưa ký (dự thảo / chờ ký)</option></select>
      <span class="small muted">Số liệu đến ngày</span>${segDate('dsTo', s.to || today())}<span class="small muted">Thu phát sinh từ</span>${segDate('dsFr', s.from || today().slice(0, 7) + '-01')}
      <button class="btn sm" id="dsFl">${ico('fa-filter')} Điều kiện lọc</button><span class="grow"></span><span class="small muted" id="dsN"></span></div>
    <div class="flt-wrap ${s.flt ? '' : 'flt-off'}" id="dsW" style="padding:0 12px"><div class="flt-main"><div id="dsT"><div class="empty">Đang tính công nợ…</div></div></div><aside class="flt" id="dsF"></aside></div>
    <div class="small muted mt">Tiền nhà = tiền sau thuế không gồm hệ số góc · Hệ số lô góc tính sau thuế · Phát sinh = giá trị hoàn thiện (gộp HĐMB + HĐ hoàn thiện riêng) · Bảo trì = phí bảo trì 2%. Thu tiền Bravo không ghi theo khoản → mỗi kỳ thu chia theo cơ cấu của kỳ (đợt thu phí bảo trì gánh trọn phí bảo trì). «Theo tiến độ» = các kỳ đến hạn tới ngày chốt. Kế toán: thu quá khứ = thu trước ngày «từ», thu phát sinh = thu trong kỳ, công nợ còn lại = đến hạn chưa thu. Bấm 1 căn để mở hợp đồng & lịch thanh toán, bấm dòng tòa để thu gọn.</div></div></div>`;
  $('#dsS', main).value = s.sign;
  wireFilter(main, f, load); wireSegDate(main);
  $('#dsQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 250);
  $('#dsS', main).onchange = run(async e => { s.sign = e.target.value; await load(); });
  main.addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (!v) return; if (e.target.id === 'dsTo') s.to = v; else s.from = v; await load(); }));
  $('#dsX', main).onclick = () => download('/api/debt-summary.xlsx?' + qsOf({ project: f.project, building: f.building, sign: s.sign, to: d?.to, from: d?.from, q: s.q.trim(), cond: s.cond, hide: [...s.hide].join(',') }));
  // Điều kiện lọc: bật / tắt khung, tick cột / nhóm, chọn tình trạng, tra cứu cột
  main.addEventListener('change', run(async e => {
    const t = e.target;
    if (t.id === 'dsC') { s.cond = t.value; return load(); }
    if (t.dataset.fc) { t.checked ? s.hide.delete(t.dataset.fc) : s.hide.add(t.dataset.fc); saveHide(); draw(); return drawFlt(); }
    if (t.dataset.fg) { for (const k of t.dataset.fg.split(',')) t.checked ? s.hide.delete(k) : s.hide.add(k); saveHide(); draw(); return drawFlt(); }
  }));
  main.addEventListener('input', e => { if (e.target.id === 'dsFq') { s.fq = e.target.value; fltQ(); } });
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
  const back = () => history.length > 1 ? history.back() : (location.hash = '#/v/unitstatus');
  const draw = async () => {
    const d = await api('GET', '/api/debt-status?' + qsOf({ unit: uid })), r = d.rows[0];
    if (!r) { main.innerHTML = `<div class="page ad"><div class="ad-card ad-card-pad">Căn này không có hợp đồng đã ký còn công nợ. <a href="#/v/unitstatus">Quay lại</a></div></div>`; return; }
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
      <div class="ad-crumb"><a href="#/v/unitstatus">Công nợ &amp; kế hoạch thu</a><i>/</i><a href="#/v/unitstatus">Tình trạng công nợ đến hạn</a><i>/</i><span>${esc(r.unit)}</span></div>
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
  box.innerHTML = `<div class="ad-card"><div class="ad-card-head">Dòng thu – chi dự kiến 6 tháng<span class="ad-card-extra">${d.can_plan ? `<button class="ad-btn ad-btn-primary" id="pfPlan">${ico('fa-wand-magic-sparkles')} Lập kế hoạch thu tháng ${mL}</button>` : ''}<a class="ad-btn" href="#/v/unitstatus">${ico('fa-scale-unbalanced')} Tình trạng công nợ đến hạn</a></span></div>
    <div class="us-pad">${flowChart(d.flow)}
      <ol class="us-steps"><li><b>Rà bảng phân loại nợ</b> ở màn <a href="#/v/unitstatus">Tình trạng công nợ đến hạn</a>: gọi nhắc từng căn quá hạn, ghi «Ghi nhắc nợ» kèm số tiền và ngày khách cam kết.</li>
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
  const tb = (list, empty) => list.length ? `<table class="t compact noclick"><thead><tr><th>#</th><th>Số chứng từ</th><th>Ngày</th><th class="num">Số tiền</th><th>Nội dung</th><th>Nguồn</th><th>Trạng thái</th></tr></thead><tbody>${list.map((x, i) => `<tr class="${x.ok ? '' : 'muted'}" data-vo="${x.ent}:${x.id}" style="cursor:pointer"><td>${i + 1}</td><td><b>${esc(x.no || '')}</b></td><td>${dmy(x.on)}</td><td class="num">${x.ok ? fm(x.amount) : `<s>${fm(x.amount)}</s>`}</td><td class="wrap">${esc(x.content || '')}</td><td>${esc(x.src || '')}</td><td>${pill(x.st[0], x.st[1])}</td></tr>`).join('')}</tbody><tfoot><tr><td></td><td>Cộng (hợp lệ)</td><td></td><td class="num">${fm(list.filter(x => x.ok).reduce((t, x) => t + x.amount, 0))}</td><td colspan="3"></td></tr></tfoot></table>` : `<div class="empty">${empty}</div>`;
  box.innerHTML = `<div class="vch-head"><b>${ico('fa-file-invoice-dollar')} Chứng từ — HĐ ${esc(c.number || '')}</b> <span class="muted small">căn ${esc(c.unit)} · ${esc(c.customer)}</span><span class="grow"></span>
      <span class="small">Thu <b class="pos">${fm(g.thu_sum)}</b> · Chi <b class="neg">${fm(g.chi_sum)}</b> · Thu − chi <b>${fm(g.thu_sum - g.chi_sum)}</b></span></div>
    ${inst}<div class="grid g2"><div><div class="vch-t">${ico('fa-arrow-down')} Phiếu thu <span class="n">${g.thu.length}</span>${g.can_thu ? `<button class="btn sm" data-vnew="receipt">${ico('fa-plus')} Phiếu thu</button>` : ''}</div>${tb(g.thu, 'Chưa có phiếu thu')}</div>
      <div><div class="vch-t">${ico('fa-arrow-up')} Phiếu chi <span class="n">${g.chi.length}</span>${g.can_chi ? `<button class="btn sm" data-vnew="payment">${ico('fa-plus')} Phiếu chi</button>` : ''}${c.kind === 'vay' ? `<button class="btn sm" data-vloan>${ico('fa-hand-holding-dollar')} Lịch trả lãi & gốc</button>` : ''}</div>${tb(g.chi, c.kind === 'vay' ? 'Chưa có phiếu chi trả lãi / gốc' : 'Chưa có phiếu chi')}</div></div>
    <div class="small muted mt">${c.kind === 'vay' ? 'Phiếu thu = tiền gốc khách chuyển cho công ty vay; phiếu chi = tiền lãi / gốc công ty đã trả khách (tự trừ vào kỳ trả).' : 'Phiếu thu = tiền khách đã nộp; phiếu chi = tiền công ty trả lại khách (hoàn tiền, hoàn cọc).'} Phòng KD tự ghi để theo dõi tiến độ. Bấm 1 phiếu để xem chi tiết.
      <a href="#" data-vopen>Mở hợp đồng ›</a></div>`;
  box.onclick = run(async e => {
    e.stopPropagation();
    const n = e.target.closest('[data-vnew]'), o = e.target.closest('[data-vo]');
    if (e.target.closest('[data-vopen]')) { e.preventDefault(); return openDetail('contract', cid, c.kind === 'vay' ? undefined : 'debt'); }
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
    $('#ltK', main).innerHTML = tile('Gốc vay đã nhận', fm(sum('goc_nhan')), `${d.rows.length} HĐ vay · theo hợp đồng ${fm(sum('goc_hd'))}`) + tile('Lãi còn phải trả khách', fm(sum('lai_con')), `đã trả ${fm(sum('lai_tra'))}`)
      + tile('Lãi quá hạn chưa trả', fm(sum('lai_qua_han')), `${n('qua_han')} hợp đồng`, sum('lai_qua_han') > 0) + tile('Gốc còn phải trả khách', fm(sum('goc_tra_con')), `${n('dao_han')} HĐ đáo hạn trong 30 ngày`);
    $('#ltN', main).textContent = `${shown().length} hợp đồng`;
    $('#ltT', main).innerHTML = rowsTable(cols, shown(), SUM, { no: 'STT' });
  };
  const load = async () => { d = await api('GET', '/api/loan-track?' + qsOf({ project: f.project, building: f.building, from: s.from, to: s.to })); draw(); };
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
  main.innerHTML = `<div class="page">${head('06', 'Theo dõi công nợ — HĐ vay (lãi & gốc)', 'fa-hand-holding-dollar', `<button class="btn" id="ltX">${ico('fa-file-excel')} Xuất file</button>`, 'CN-07')}${ctKindBar('vay')}${filterBar(f, { period: false })}<div class="grid g4 mb" id="ltK"></div><div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="ltQ" placeholder="Tìm mã căn, khách hàng, số HĐ vay / thuê…" value="${esc(s.q)}"></div><span id="ltDates" style="display:contents"><span class="small muted">Từ ngày</span>${segDate('ltFr', s.from)}<span class="small muted">Đến ngày</span>${segDate('ltTo', s.to || today())}</span><span class="grow"></span><span class="small muted" id="ltN"></span></div><div id="ltT"><div class="empty">Đang tải…</div></div><div class="small muted mt">Gốc: khách chuyển theo các đợt giải ngân (phiếu thu của HĐ vay). Lãi: công ty trả khách cuối mỗi kỳ — mỗi tháng = 1 tháng tiền thuê căn (hoặc theo lãi suất). Tiền vay không trừ vào giá mua căn hộ. Số đã trả lãi / gốc lấy theo Phiếu chi. Bấm 1 dòng để sổ ra phiếu thu / phiếu chi của hợp đồng.</div></div></div>`;
  wireFilter(main, f, load);
  wireSegDate(main); $('#ltDates', main).addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (v === null) return; if (e.target.id === 'ltFr') s.from = v; else s.to = v; await load(); }));
  $('#ltQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
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
    const overRows = I.filter(x => x.rem > 0 && x.due_on < T), overdue = overRows.reduce((t, x) => t + x.rem, 0), overDays = overRows.length ? dd(overRows[0].due_on, T) : 0;
    const next = I.find(x => x.rem > 0 && x.due_on >= T);
    // trạng thái từng đợt kiểu Steps: finish / error / process / wait
    const stOf = x => x.rem <= 0 ? 'finish' : x.due_on < T ? 'error' : x === next ? 'process' : 'wait';
    const tagOf = x => x.rem <= 0 ? (x.late_paid_days ? tag(`Đã thu · trễ ${x.late_paid_days} ngày`, 'warning') : tag('Đã thu đủ', 'success'))
      : x.due_on < T ? tag(`Quá hạn ${dd(x.due_on, T)} ngày`, 'error') : x.due_on === T ? tag('Đến hạn hôm nay', 'warning')
      : tag(`${x.paid > 0 ? 'Thu một phần · ' : ''}Còn ${dd(T, x.due_on)} ngày`, x === next ? 'processing' : 'default');
    const ST_TAG = { 'Đã ký': 'success', 'Dự thảo': 'default', 'Chờ duyệt': 'processing', 'Chờ ký': 'processing', 'Thanh lý': 'warning', 'Đã thanh lý': 'warning', 'Đã hủy': 'error' };
    const rateIn = g.can_rate ? `<input class="ad-input cd-rate" id="cdRate" value="${g.late_rate ?? ''}" placeholder="vd 18" inputmode="decimal" title="Lãi suất chậm trả (%/năm) — gõ rồi Enter"> %/năm`
      : g.late_rate != null ? fnum(g.late_rate) + ' %/năm' : '<span class="ad-muted">chưa điền</span>';
    const desc = [['Khách hàng', esc(c.customer || '')], ['Mã khách hàng', esc(c.cust_code || '')], ['Số điện thoại', esc(c.phone || '')],
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
      <div class="ad-card"><div class="ad-card-head">Tổng quan công nợ<span class="ad-card-extra ad-asof">Tính đến ${segDate('cdTo', to || T)}</span></div>
        <div class="ad-stats">
          ${stat('Tổng phải thu theo hợp đồng', fm(total), `${I.length} đợt thu${c.maint_fee ? ` · gồm phí bảo trì ${fm(c.maint_fee)}` : ''}`)}
          ${stat('Đã thu', fm(paid), `<div class="ad-progress"><div class="ad-progress-rail"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>${g.extra ? `thu thừa ${fm(g.extra)}` : ''}`, 'ad-stat-success')}
          ${stat('Còn phải thu', fm(rem), next ? `Đợt tới: <b>${esc(next.lbl)}</b> · ${fm(next.rem)} · hạn ${dmy(next.due_on)}` : rem > 0 ? 'các đợt còn nợ đều đã quá hạn' : 'đã thu đủ hợp đồng')}
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

// HĐ thuê / mua bán / hoàn thiện: khách phải trả công ty theo lịch thu, thực thu theo phiếu thu hợp lệ
const ctTrack = async (main, kind) => {
  const f = filt(), s = (ST.cttrack ||= {})[kind] ||= { state: '', q: '', from: '', to: '' }, rent = kind === 'thue', hdmb = kind === 'hdmb', KL = Object.fromEntries(CT_KINDS.map(x => [x[0], x[1]]));
  // HĐ mua bán: cột theo mẫu «Bảng theo dõi hợp đồng mua bán» của phòng KD (05/11/2026) — 2 tầng tiêu đề, c[3] = nhóm cột
  const grp = (g, cs) => cs.map(c => [...c, 'money', g]);
  const HDMB = [['number', 'Số hợp đồng'], ['unit', 'Mã căn hộ'], ['customer', 'Họ và tên'], ['signed_on', 'Ngày ký hợp đồng', 'date'],
    ...grp('Tiền nhà', [['h_value', 'Giá trị hợp đồng'], ['h_due', 'Số phải thu theo tiến độ'], ['h_paid', 'Số đã thu'], ['h_left_due', 'Còn lại theo tiến độ'], ['h_left', 'Còn lại theo hợp đồng']]),
    ...grp('Phí bảo trì', [['m_value', 'Phí bảo trì'], ['m_paid', 'Số đã thu'], ['m_left_due', 'Còn lại theo tiến độ']]),
    ...grp('Tổng cộng', [['t_value', 'Tổng giá trị HĐ'], ['t_due', 'Số phải thu theo tiến độ'], ['t_paid', 'Số đã thu'], ['t_left_due', 'Còn lại theo tiến độ'], ['t_left', 'Còn lại theo hợp đồng']]),
    ['overdue_days', 'Số ngày quá hạn', 'int'], ['late_rate', 'Lãi suất quá hạn (%/năm)', 'num'], ['overdue', 'Số tiền quá hạn', 'money'], ['late_int', 'Lãi quá hạn', 'money'], ['state_l', 'Tình trạng']];
  // HĐ thuê: cột theo mẫu «Bảng theo dõi hợp đồng thuê căn hộ» của phòng KD (05/11/2026)
  const cols = hdmb ? HDMB : rent ? [['project_name', 'Dự án'], ['building_l', 'Tòa'], ['unit', 'Mã căn hộ'], ['customer', 'Họ tên người thuê'], ['phone', 'Số điện thoại'], ['number', 'Số hợp đồng'], ['signed_on', 'Ngày ký', 'date'],
    ['eff_on', 'Ngày bắt đầu thuê', 'date'], ['exp_on', 'Ngày hết hạn thuê', 'date'], ['term_l', 'Thời hạn thuê'], ['period_l', 'Kỳ thanh toán'], ['rent', 'Giá thuê/tháng (đồng)', 'money'], ['deposit', 'Tiền đặt cọc (đồng)', 'money'],
    ['value', 'Giá trị hợp đồng thuê', 'money'], ['due_sched', 'Số phải thu theo tiến độ', 'money'], ['paid_sched', 'Số đã thu theo tiến độ', 'money'], ['left_sched', 'Còn phải thu', 'money'], ['chi', 'Đã chi (hoàn cọc / hoàn tiền)', 'money'], ['cur_l', 'Kỳ thanh toán hiện tại'], ['han_on', 'Hạn thanh toán', 'date'],
    ['status_l', 'Tình trạng hợp đồng'], ['remind', 'Nhắc nhở'], ['owner', 'Người phụ trách'], ['note', 'Ghi chú']]
    : [['project', 'Dự án'], ['building', 'Tòa'], ['unit', 'Mã căn'], ['customer', 'Khách hàng'], ['number', 'Số HĐ'], ['status_l', 'Trạng thái HĐ'], ['signed_on', 'Ngày ký', 'date'],
    ['value', 'Giá trị HĐ', 'money'], ['total', 'Phải thu theo lịch', 'money'], ['due_w', 'Phải thu theo tiến độ', 'money'], ['paid_w', 'Đã thu trong kỳ', 'money'], ['left_w', 'Còn lại theo tiến độ', 'money'], ['paid', 'Đã thu', 'money'], ['paid_pct', '% đã thu', 'num'], ['left', 'Còn phải thu', 'money'], ['chi', 'Đã chi (hoàn tiền)', 'money'], ['net', 'Thực thu (thu − chi)', 'money'], ['overdue', 'Quá hạn', 'money'], ['overdue_days', 'Số ngày quá hạn', 'num'],
    ['next_name', 'Kỳ tới'], ['next_on', 'Hạn kỳ tới', 'date'], ['next_amt', 'Số tiền kỳ tới', 'money'], ['state_l', 'Tình trạng']];
  const SUM = hdmb ? HDMB.filter(c => c[2] === 'money').map(c => c[0]) : rent ? ['deposit', 'value', 'due_sched', 'paid_sched', 'left_sched', 'chi'] : ['value', 'total', 'due_w', 'paid_w', 'left_w', 'paid', 'left', 'chi', 'net', 'overdue', 'next_amt'];
  const groups = cols.map(c => c[3] || ''), period = () => `${d.from ? 'từ ' + dmy(d.from) + ' ' : ''}đến ${dmy(d.to)}`;
  const TABS = [['', 'Tất cả'], ['qua_han', 'Quá hạn thu'], ['sap_toi', 'Đến hạn trong 7 ngày'], ...(rent ? [['het_han', 'Hết hạn trong 30 ngày']] : []), ['dang', 'Đang thu'], ['xong', 'Đã thu đủ'], ['chua_lich', 'Chưa có lịch thu']];
  let d = { rows: [] };
  const shown = () => { const q = s.q.trim().toLowerCase(); return d.rows.filter(r => !q || [r.unit, r.customer, r.number, r.phone].some(x => String(x || '').toLowerCase().includes(q))); };   // bỏ tab trạng thái (07/11/2026)
  const draw = () => {
    const sum = k => d.rows.reduce((t, r) => t + (+r[k] || 0), 0), n = k => d.rows.filter(r => !k || r.state === k).length, tot = sum('total');
    const tile = (l, v, sub, red) => `<div class="card kpi ${red ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:18px">${v}</div><div class="s">${sub || '&nbsp;'}</div></div>`;
    $('#ctK', main).innerHTML = hdmb
      ? tile('Phải thu theo tiến độ', fm(sum('t_due')), `${d.rows.length} hợp đồng · các đợt có hạn ${period()}`) + tile('Số đã thu', fm(sum('t_paid')), `phiếu thu ${d.from ? 'từ ' + dmy(d.from) + ' ' : ''}đến ${dmy(d.asof)}`)
        + tile('Còn lại theo tiến độ', fm(sum('t_left_due')), `còn lại theo hợp đồng ${fm(sum('t_left'))}`) + tile('Quá hạn chưa thu', fm(sum('overdue')), `${n('qua_han')} hợp đồng${sum('late_int') ? ` · lãi quá hạn ${fm(sum('late_int'))}` : ''}`, sum('overdue') > 0)
      : tile('Giá trị hợp đồng', fm(sum('value')), `${d.rows.length} hợp đồng · phải thu theo lịch ${fm(tot)}`) + tile('Đã thu', fm(sum('paid')), `${tot ? Math.round(sum('paid') / tot * 1000) / 10 : 0}% so với lịch thu`)
        + tile('Còn phải thu', fm(sum('left')), `đến hạn trong 7 ngày ${fm(sum('due7'))}`) + tile('Quá hạn chưa thu', fm(sum('overdue')), `${n('qua_han')} hợp đồng`, sum('overdue') > 0);
    $('#ctN', main).textContent = `${shown().length} hợp đồng`;
    // ô Lãi suất quá hạn: người có quyền gõ thẳng vào bảng (lưu theo từng hợp đồng)
    const rateIn = (c, r) => c[0] === 'late_rate' && d.can_rate ? `<input class="inp" data-lr="${r.contract_id}" value="${r.late_rate ?? ''}" placeholder="%/năm" inputmode="decimal" style="width:76px;text-align:right" title="Lãi suất quá hạn (%/năm) — gõ rồi Enter">` : undefined;
    $('#ctT', main).innerHTML = rowsTable(cols, shown(), SUM, rent ? { no: 'STT' } : hdmb ? { no: 'STT', groups, cell: rateIn } : undefined);
    if (!hdmb) $('#ctNote', main).innerHTML = `<b>Phải thu theo tiến độ</b> = các kỳ thu có hạn ${period()} (để trống «Từ ngày» = từ đầu hợp đồng); <b>Đã thu trong kỳ</b> = phiếu thu ${d.from ? 'từ ' + dmy(d.from) + ' ' : ''}đến ${dmy(d.asof)}; còn lại theo tiến độ = phải thu − đã thu trong kỳ. Đã thu / còn phải thu / quá hạn tính đến ${dmy(d.asof)}. Đã chi = phiếu chi hoàn tiền / hoàn cọc. Bấm 1 dòng để xem công nợ chi tiết của hợp đồng.`;
    if (hdmb) $('#ctNote', main).innerHTML = `Giá trị hợp đồng = tiền sau thuế; phí bảo trì tính riêng. <b>Số phải thu theo tiến độ</b> = các đợt thu tiền của hợp đồng có hạn ${period()} (để trống «Từ ngày» = từ đầu hợp đồng).
      Số đã thu = phiếu thu đã lập${d.from ? ` từ ${dmy(d.from)}` : ''} đến ${dmy(d.asof)}, chia vào từng đợt (phiếu chọn đợt vào đợt đó, phiếu không chọn đợt vào đợt hạn sớm nhất còn nợ): phần vào dòng phí bảo trì tính vào phí bảo trì (tổng đã thu đến ${dmy(d.asof)}), còn lại vào tiền nhà. Còn lại theo tiến độ = phải thu theo tiến độ − đã thu (âm = khách trả trước);
      còn lại theo hợp đồng = giá trị − tổng đã thu đến ${dmy(d.asof)}. <b>Phí bảo trì</b>: số phải thu = phí bảo trì, còn lại = phí bảo trì − số đã thu. Tổng cộng = tiền nhà + phí bảo trì (cộng từng cột; tổng giá trị HĐ = giá trị HĐ + phí bảo trì). Số ngày quá hạn = từ hạn của đợt nợ sớm nhất đến ${dmy(d.asof)}.
      Số tiền quá hạn = cộng dồn (lũy kế) phần còn lại chưa thanh toán của các đợt đã quá hạn. Lãi quá hạn (lãi chậm trả) tính theo từng khoảng: từ hạn đợt, số tiền quá hạn = phần còn nợ, giảm dần từ mỗi ngày khách trả; mỗi khoảng = số tiền quá hạn × số ngày × lãi suất (%/năm) / 365 (khoảng cuối đến ${dmy(d.asof)}) — tính cả những ngày đã trễ trước khi khách trả${d.can_rate ? ' — gõ lãi suất vào cột «Lãi suất quá hạn» của từng hợp đồng' : ''}. Bấm 1 dòng để xem công nợ từng đợt, phiếu thu / phiếu chi của hợp đồng.`;
  };
  const load = async () => { d = await api('GET', '/api/contract-track?' + qsOf({ kind, project: f.project, building: f.building, from: s.from, to: s.to })); draw(); };
  main.innerHTML = `<div class="page">${head('06', `Theo dõi công nợ — ${KL[kind]}`, CT_KINDS.find(x => x[0] === kind)[2], `<button class="btn" id="ctX">${ico('fa-file-excel')} Xuất file</button>`, 'CN-07')}${ctKindBar(kind)}${filterBar(f, { period: false })}<div class="grid g4 mb" id="ctK"></div><div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="ctQ" placeholder="Tìm mã căn, khách hàng, số HĐ, SĐT…" value="${esc(s.q)}"></div><span id="ctDates" style="display:contents"><span class="small muted">Từ ngày</span>${segDate('ctFr', s.from)}<span class="small muted">Đến ngày</span>${segDate('ctTo', s.to || today())}</span><span class="grow"></span><span class="small muted" id="ctN"></span></div><div id="ctT"><div class="empty">Đang tải…</div></div><div class="small muted mt" id="ctNote">Phải thu theo lịch thanh toán của hợp đồng; đã thu theo Phiếu thu, đã chi theo Phiếu chi (hoàn tiền / hoàn cọc). Bấm 1 dòng để sổ ra phiếu thu / phiếu chi của hợp đồng.</div></div></div>`;
  wireFilter(main, f, load);
  { wireSegDate(main); $('#ctDates', main).addEventListener('sdchange', run(async e => { const v = segVal(e.target); if (v === null) return; if (e.target.id === 'ctFr') s.from = v; else s.to = v; await load(); })); }
  $('#ctQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
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
const initials = n => esc(String(n || '?').trim().split(/\s+/).slice(-1)[0].slice(0, 2).toUpperCase());
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
