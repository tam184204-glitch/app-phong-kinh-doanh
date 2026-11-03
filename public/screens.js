// Khung app, đăng nhập, điều hướng và các màn tổng hợp.
'use strict';
const V = {};
const filt = () => ST.filt ||= { project: '', building: '', from: '', to: '' };

// ---------- đăng nhập ----------
async function loginView() {
  try { const i = await (await fetch('/api/login-info')).json(); if (i.noLogin) { location.hash = '#/v/dashboard'; return boot(); } } catch {}
  document.body.innerHTML = `<div class="login"><div class="hero"><img src="/logo.png" alt=""><div class="k">CAT TUONG GROUP</div><h1>Quản lý <span>Phòng Kinh doanh</span></h1><p>Một mã căn — một hồ sơ xuyên suốt: giỏ hàng, khách hàng, giao dịch, hợp đồng, công nợ, bàn giao và cấp sổ hồng.</p></div>
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
  document.body.classList.toggle('no-xr', !M.exportRoles.includes(M.me.role));
  document.body.innerHTML = `<header class="top"><button class="ibtn burger" id="burger" aria-label="Menu">${ico('fa-bars')}</button><a class="brand" href="#/v/dashboard"><img src="/logo.png" alt="Cát Tường"><div><b>CAT TUONG GROUP</b><span>Phòng Kinh doanh</span></div></a>
    <div class="gsearch"><i class="fa-solid fa-magnifying-glass"></i><input id="gs" type="search" placeholder="Tìm mã căn, khách hàng, số điện thoại, số hợp đồng…" autocomplete="off"><div class="gres hidden" id="gr"></div></div>
    <div class="topact"><button class="ibtn ai-btn" id="bAi" title="Trợ lý AI tra cứu">${ico('fa-wand-magic-sparkles')}</button><button class="ibtn" id="bApr" title="Hộp phê duyệt">${ico('fa-stamp')}<span class="dot a hidden" id="nApr"></span></button><button class="ibtn" id="bAl" title="Cảnh báo / nhắc việc">${ico('fa-bell')}<span class="dot hidden" id="nAl"></span></button>
    <div class="me" id="meBtn"><span class="av">${esc(M.me.full_name.split(' ').slice(-1)[0].slice(0, 2).toUpperCase())}</span><div><b>${esc(M.me.full_name)}</b><small>${esc(roleName(M.me.role))}</small></div></div></div></header>
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
    const who = `<div style="padding:8px 12px"><b>${esc(M.me.full_name)}</b><div class="small muted">${esc(M.me.username)} · ${esc(roleName(M.me.role))}</div></div>`;
    if (M.noLogin) {   // chạy thử không đăng nhập: đổi vai trò bằng một cú bấm
      p.classList.add('as-pop');
      p.innerHTML = `${who}<div class="small muted" style="padding:6px 12px 4px">${ico('fa-user-gear')} Xem app với vai trò</div>${M.users.filter(u => u.active).map(u => `<button data-as="${u.id}" class="${u.id === M.me.id ? 'on' : ''}">${ico(u.id === M.me.id ? 'fa-circle-check' : 'fa-user')} ${esc(u.full_name)}<small class="muted"> · ${esc(roleName(u.role))}</small></button>`).join('')}`;
      document.body.append(p);
      p.onclick = async ev => { const b = ev.target.closest('[data-as]'); if (!b || +b.dataset.as === M.me.id) return; try { await api('POST', `/api/as/${b.dataset.as}`, {}); location.reload(); } catch (x) { toast(x.message, true); } };
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
  const navId = kind === 'e' ? ({ project: 'projects', building: 'projects', unit: 'products', cancel_req: 'payouts' }[name] || 'e:' + name + (params.group ? '?group=' + params.group : '')) : name === 'unit360' || name === 'cust360' ? 'lookup' : name === 'pricesheet' ? 'e:price_policy' : name;
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navId));
  const on = $(`[data-nav="${navId}"]`); $$('.mod').forEach(m => m.classList.remove('cur'));
  if (on) { on.closest('.mod').classList.add('open', 'cur'); }
  try {
    if (kind === 'e' && name === 'noxh_check' && M.piiRoles.includes(M.me.role)) await V.mau4(main, params);
    else if (kind === 'e' && name === 'cancel_req') await V.payouts(main, params);   // bỏ màn «Hủy giao dịch – đổi căn» 28/10/2026 — đề nghị hủy / đổi căn xem ở Theo dõi thanh lý & chi trả   // Hồ sơ mua NOXH hiện theo bảng tổng hợp Mẫu 4
    else if (kind === 'e' && M.ents[name]) await listView(main, name, params);
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
// Bảng hàng chỉ hiện 3 nhóm màu: Chưa bán (trắng, căn còn trống — gồm căn trả lại sau thanh lý) · Giữ chỗ (cam) · Đã ký HĐMB (xanh)
const BGRP = { chua_mo_ban: 'trong', con_ban: 'trong', giu_cho: 'giu', da_coc: 'giu', da_ky_hd: 'ky', da_ban_giao: 'ky', tam_khoa: 'tam_khoa', ngung_kd: 'ngung_kd' };
const bgOf = u => u.rent ? 'thue' : BGRP[u.status];   // căn có HĐ thuê còn hiệu lực = nhóm Cho thuê
const BGRP_L = { trong: 'Chưa bán', giu: 'Giữ chỗ', ky: 'Đã bán', thue: 'Cho thuê', tam_khoa: 'Tạm khóa', ngung_kd: 'Ngừng KD' };
const USTAT = { con_ban: 'Còn bán', giu_cho: 'Giữ chỗ', da_coc: 'Đã cọc', da_ky_hd: 'Đã ký HĐ', da_ban_giao: 'Đã bàn giao', chua_mo_ban: 'Chưa mở bán', tam_khoa: 'Tạm khóa', ngung_kd: 'Ngừng KD' };
V.board = async (main, params) => {
  const s = ST.board ||= { project: '', building: '', st: '', kind: '' };
  if (params.project) s.project = params.project;
  const draw = async () => {
    const d = await api('GET', `/api/board?${qsOf({ project: s.project, building: s.building })}`);
    s.project = d.project; s.building = d.building;
    const cnt = {}; d.units.forEach(u => cnt[bgOf(u)] = (cnt[bgOf(u)] || 0) + 1);
    const floors = [...new Set(d.units.map(u => u.floor))].sort((a, b) => b - a);
    const kinds = [...new Set(d.units.map(u => u.kind))];
    main.innerHTML = `<div class="page">${head('02', 'Bảng hàng', 'fa-table-cells', M.ents.reservation.perm.c ? `<span class="small muted">Bấm căn còn trống để lập phiếu đăng ký</span>` : '')}
      <div class="card mb"><div class="toolbar" style="border:0"><select id="bp">${d.projects.filter(p => p.n).map(p => `<option value="${p.id}" ${p.id === d.project ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)} (${p.n} căn)</option>`).join('')}</select>
        <select id="bk"><option value="">Mọi loại căn</option>${kinds.map(k => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${esc(M.ents.unit.fields.find(f => f.k === 'kind').o.find(o => o[0] === k)?.[1] || k)}</option>`).join('')}</select>
        <span class="grow"></span>${d.policy ? `<span class="src">${ico('fa-tags')} Chính sách đang áp dụng: <b>${esc(d.policy.code)}</b> (${dmy(d.policy.start_on)} – ${dmy(d.policy.end_on)})${d.policy.src_file ? ' · ' + esc(d.policy.src_file) : ''}</span>` : '<span class="pill a">Chưa có chính sách giá đang phát hành</span>'}</div>
        <div style="padding:0 14px 12px"><div class="towers">${d.buildings.map(b => `<div class="tower ${b.id === d.building ? 'on' : ''}" data-b="${b.id}"><b>${esc(b.name || 'Tòa ' + b.code)}</b><small>${b.n} căn</small></div>`).join('')}</div></div></div>
      <div class="card"><div class="toolbar"><div class="legend">${Object.entries(BGRP_L).filter(([k]) => cnt[k]).map(([k, l]) => `<span data-st="${k}" style="cursor:pointer;${s.st && s.st !== k ? 'opacity:.4' : ''}"><b class="u g-${k}" style="width:12px;height:12px;min-height:0;padding:0;border-radius:3px"></b>${l} <b style="background:none;width:auto;height:auto;color:var(--ink)">${cnt[k]}</b></span>`).join('')}</div>${s.st ? '<button class="btn sm ghost" data-st="">Bỏ lọc</button>' : ''}<span class="grow"></span><span class="small muted">${d.units.length} căn · ${floors.length} tầng</span></div>
      <div class="bd"><div class="floors">${floors.map(fl => `<div class="floor"><div class="fl">Tầng ${fl}</div><div class="us">${d.units.filter(u => u.floor === fl).map(u => `<div class="u g-${bgOf(u)} ${(s.st && s.st !== bgOf(u)) || (s.kind && s.kind !== u.kind) ? 'dim' : ''}" data-u="${u.id}" title="${esc(u.code)} · ${BGRP_L[bgOf(u)]}${u.rent && u.rent_to ? ' đến ' + dmy(u.rent_to) : ''}${!u.rent && u.res_rent ? ' (đăng ký thuê)' : ''}${u.sale_doc ? ` (bán qua ${u.sale_doc === 'vay' ? 'HĐ vay' : 'HĐ thuê'} — chờ HĐMB)` : ''}${!u.rent && u.rent_ended ? ' · đã hết hạn thuê ' + dmy(u.rent_ended) + ' — bán / cho thuê tiếp được' : ''}${u.cancelled ? ' · đã hủy đăng ký' : ''}${u.customer ? ' · ' + esc(u.customer) : ''}">${u.hold_until ? `<span class="hold">${ico('fa-clock')}</span>` : ''}<b class="no">${esc(u.code.split('-').pop())}</b><div class="sp">${u.bedrooms || ''}PN · ${fnum(u.area_tt)}m²</div><div class="pr">${u.rent && u.rent_amt ? `${fmB(u.rent_amt)}/tháng` : u.res_rent ? `${fmB(u.res_rent)}/tháng` : fmB(u.total_price)}</div><div class="cu">${esc(u.customer || u.direction || '')}</div></div>`).join('')}</div></div>`).join('') || '<div class="empty">Tòa chưa có căn</div>'}</div></div></div></div>`;
    $('#bp', main).onchange = e => { s.project = e.target.value; s.building = ''; draw(); };
    $('#bk', main).onchange = e => { s.kind = e.target.value; draw(); };
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
  const SIGN_COLS = [['project', 'Dự án'], ['unit', 'Mã căn hộ'], ['customer', 'Khách hàng'], ['number', 'Số HĐ'], ['plan_d', 'Ngày dự kiến ký', 'date'], ['signed_d', 'Ngày ký', 'date'], ['st_l', 'Tình trạng ký'], ['owner', 'Nhân viên KD']];
  const tracked = () => [...d.rows.map(r => { const day = r.plan_sign ? r.plan_sign.slice(0, 10) : ''; return { ...r, day, plan_d: day, signed_d: '', cls: r.status === 'cho_ky' ? 'g' : day && day < t ? 'r' : 'b' }; }),
    ...d.signed.map(r => ({ ...r, day: String(r.signed_on).slice(0, 10), plan_d: r.plan_sign ? r.plan_sign.slice(0, 10) : '', signed_d: String(r.signed_on).slice(0, 10), cls: 'g' }))]
    .map(r => ({ ...r, stk: capOf(r), st_l: `${stName(r)}${r.cls === 'r' ? ` · quá hạn ${late(r)} ngày` : ''}` }))
    .filter(r => inP(r.plan_d || r.day))
    .sort((a, b) => (a.cls === 'r' ? 0 : 1) - (b.cls === 'r' ? 0 : 1) || (b.day || '').localeCompare(a.day || ''));
  const listed = () => { const q = lq.trim().toLowerCase(); const cq = /^(i{1,3})$/.exec(q)?.[1].toUpperCase();   // gõ I / II / III = tìm theo tình trạng
    return tracked().filter(r => (!ls || r.stk === ls) && (cq ? r.stk === cq : !q || [r.project, r.project_name, r.unit, r.customer, r.number, r.owner].some(x => String(x ?? '').toLowerCase().includes(q)))); };
  const drawList = () => {
    const rs = listed(), all = tracked(); $('#scN', main).textContent = `Hiển thị ${rs.length} bản ghi`; $('#scTotal', main).textContent = `Tổng ${all.length} căn`;
    $('#scTabs', main).innerHTML = `<button data-s="" class="${!ls ? 'on' : ''}">Tất cả<span class="c">${all.length}</span></button>` + ST_TABS.map(([k, l]) => `<button data-s="${k}" class="${ls === k ? 'on' : ''}">${l}<span class="c">${all.filter(r => r.stk === k).length}</span></button>`).join('');
    $('#scT', main).innerHTML = `<table class="t"><thead><tr><th>Căn hộ / Dự án</th><th>Khách hàng</th><th>Ngày dự kiến</th><th>Tình trạng ký</th><th>Ngày ký thực tế</th></tr></thead><tbody>${rs.map(r => `<tr data-id="${r.id}" data-ent="${r.ent || 'contract'}"><td><b>${esc(r.unit)}</b><div class="small muted">${esc(r.project_name || r.project || '')}</div></td><td>${esc(r.customer)}</td><td>${r.plan_d ? dmy(r.plan_d) : '—'}</td><td>${pill(r.st_l, r.cls === 'g' ? 'g' : r.cls === 'r' ? 'r' : r.stk === 'I' ? 'a' : 's')}</td><td>${r.signed_d ? dmy(r.signed_d) : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="center muted">Không có hợp đồng phù hợp</td></tr>'}</tbody></table>`;
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
      <div class="card mt"><div class="hd"><div><h3>${ico('fa-list-check')} Danh sách theo dõi hợp đồng</h3><div class="small muted">Quản lý tình trạng ký kết theo từng căn hộ</div></div><span class="grow"></span><span class="pill b" id="scTotal"></span><button class="btn sm" id="scX">${ico('fa-file-excel')} Xuất Excel</button></div>
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
  const draw = async () => { d = await api('GET', '/api/signing?' + qsOf({ project: f.project })); render(); };
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
  const boss = ['lanh_dao', 'truong_phong', 'admin'].includes(M.me.role);   // vai trò khác chỉ xem được KPI
  const f = filt(); let kind = boss ? params.k || 'sales' : 'kpi', group = 'building';
  const draw = async () => {
    main.innerHTML = `<div class="page">${head('11', 'Báo cáo quản trị', 'fa-chart-pie', `<button class="btn" id="rx">${ico('fa-file-excel')} Xuất Excel</button><button class="btn" onclick="print()">${ico('fa-print')} In / PDF</button>`)}${filterBar(f)}
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
  main.innerHTML = `<div class="page">${head('04', 'Hồ sơ mua / thuê NOXH', 'fa-list-check', `${canNew ? `<button class="btn pri" id="m4New">${ico('fa-plus')} Tạo hồ sơ</button>` : ''}${canImp ? `<button class="btn" id="m4Imp">${ico('fa-file-import')} Nhập file Mẫu 4</button>` : ''}<button class="btn" id="m4X">${ico('fa-file-excel')} Xuất Excel Mẫu 4</button>`, 'GD-02')}
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
        return h.people.map((p, j) => `<tr data-id="${h.id}" class="${j ? 'm4mem' : 'm4head'}">${j ? '' : (canBulk ? td(`<input type="checkbox" data-ck ${sel.has(h.id) ? 'checked' : ''}>`, n, 'center m4ck m4s1') : '') + td(i + 1, n, 'center') + td(dmy(h.received_on), n)}<td>${esc(p.name)}</td>${j && !ownPhone ? '' : td(esc(p.phone || ''), ownPhone ? 1 : n)}
          <td class="center">${p.birth[0]}</td><td class="center">${p.birth[1]}</td><td class="center">${p.birth[2]}</td><td>${esc(p.old_id_no || '')}</td><td>${esc(p.id_no || '')}</td><td class="wrap">${esc(p.job || '')}</td><td class="wrap">${esc(p.doi_tuong || '')}</td><td class="wrap">${esc(p.confirm_org || '')}</td>
          ${j ? '' : td(esc(h.housing || ''), n, 'wrap') + td(esc(h.province || ''), n) + td(esc(h.district || ''), n) + td(esc(h.commune || ''), n) + td(esc(h.income || ''), n, 'wrap')}<td>${esc(p.relation)}</td>
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
  main.innerHTML = `<div class="page">${head('04', 'Theo dõi hủy giao dịch, thanh lý hợp đồng và chi trả tiền', 'fa-money-bill-transfer', `${canNew ? `<button class="btn pri" id="pyNew">${ico('fa-plus')} Tạo đề nghị</button>` : ''}<button class="btn" id="pyX">${ico('fa-file-excel')} Xuất Excel</button>`, 'GD-04')}
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
// CN-06 tình trạng căn hộ theo bản chất giao dịch + công nợ tách theo hợp đồng (tiền vay / tiền thuê không trừ vào giá mua)
V.unitstatus = async main => {
  const f = filt(), s = ST.unitstatus ||= { state: '', q: '' };
  const cols = [['project', 'Dự án'], ['building', 'Tòa'], ['unit', 'Mã căn'], ['state_l', 'Tình trạng'], ['customer', 'Khách hàng'], ['docs', 'Văn bản'], ['sale_price', 'Giá bán', 'money'], ['plan_hdmb', 'Dự kiến ký HĐMB', 'date'],
    ['sale_paid', 'Đã thu HĐMB', 'money'], ['sale_left', 'Còn phải thu HĐMB', 'money'], ['vay_left', 'Gốc vay khách chưa chuyển', 'money'], ['vay_int', 'Lãi vay còn phải trả khách', 'money'], ['rent_amt', 'Tiền thuê/tháng', 'money'], ['rent_to', 'Thuê đến', 'date'],
    ['rent_left', 'Còn phải thu tiền thuê', 'money'], ['fin_left', 'Còn phải thu hoàn thiện', 'money'], ['overdue', 'Quá hạn', 'money']];
  const SUM = ['sale_price', 'sale_paid', 'sale_left', 'vay_left', 'rent_left', 'fin_left', 'overdue'];
  const TABS = [['', 'Tất cả'], ['ban', 'Đã bán'], ['cho_hdmb', 'Chờ ký HĐMB'], ['cho_thue', 'Đang cho thuê'], ['dang_lap', 'Đang lập HĐ'], ['giu_cho', 'Giữ chỗ'], ['trong', 'Còn trống / chưa mở bán']];
  const inTab = (r, k) => !k || (k === 'ban' ? ['da_ban', 'cho_hdmb'].includes(r.state) : k === 'trong' ? ['trong', 'chua_mo_ban'].includes(r.state) : r.state === k);
  let d = { rows: [] };
  const shown = () => { const q = s.q.trim().toLowerCase(); return d.rows.filter(r => inTab(r, s.state) && (!q || [r.unit, r.customer, r.docs].some(x => String(x || '').toLowerCase().includes(q)))); };
  const draw = () => {
    const sum = k => d.rows.reduce((t, r) => t + (+r[k] || 0), 0), n = k => d.rows.filter(r => inTab(r, k)).length, tile = (l, v, sub, red) => `<div class="card kpi ${red ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:18px">${v}</div><div class="s">${sub || '&nbsp;'}</div></div>`;
    $('#usK', main).innerHTML = tile('Căn đã bán', n('ban'), `trong đó ${n('cho_hdmb')} căn chờ ký HĐMB (bán qua HĐ vay / HĐ thuê)`) + tile('Căn đang cho thuê', n('cho_thue'), `${n('trong')} căn còn trống / chưa mở bán`)
      + tile('Còn phải thu HĐMB', fm(sum('sale_left')), `đã thu ${fm(sum('sale_paid'))}`) + tile('Còn phải thu HĐ vay · tiền thuê · hoàn thiện', fm(sum('vay_left') + sum('rent_left') + sum('fin_left')), `quá hạn ${fm(sum('overdue'))}`, sum('overdue') > 0);
    $('#usTabs', main).innerHTML = TABS.map(([k, l]) => `<button data-st="${k}" class="${s.state === k ? 'on' : ''}">${l} <span class="n">${n(k)}</span></button>`).join('');
    $('#usN', main).textContent = `${shown().length} căn`;
    $('#usT', main).innerHTML = rowsTable(cols, shown(), SUM);
  };
  const load = async () => { d = await api('GET', '/api/unit-status?' + qsOf({ project: f.project })); $('#srcLine', main).innerHTML = `<span>${ico('fa-database')} Thực thu đồng bộ Bravo${d.bravo_sync ? ' — chốt ' + dmyhm(d.bravo_sync) : ''}</span><span>Tình trạng theo bản chất giao dịch: căn bán qua HĐ vay / HĐ thuê vẫn tính «đã bán». Công nợ tách từng hợp đồng — tiền vay, tiền thuê không trừ vào giá mua.</span>`; draw(); };
  main.innerHTML = `<div class="page">${head('06', 'Tình trạng căn hộ & công nợ', 'fa-building-circle-check', `<button class="btn" id="usX">${ico('fa-file-excel')} Xuất Excel</button>`, 'CN-06')}${filterBar(f, { period: false })}<div class="grid g4 mb" id="usK"></div><div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="usQ" placeholder="Tìm mã căn, khách hàng, số hợp đồng…" value="${esc(s.q)}"></div><span class="grow"></span><span class="small muted" id="usN"></span></div><div class="tabs" id="usTabs"></div><div id="usT"><div class="empty">Đang tải…</div></div><div class="small muted mt src-line" id="srcLine"></div></div></div>`;
  wireFilter(main, f, load);
  $('#usQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  $('#usX', main).onclick = () => download('/api/export-rows', { title: 'CN-06 Tình trạng căn hộ & công nợ', cols, rows: shown(), sum: SUM, note: 'Tình trạng theo bản chất giao dịch; tiền vay / tiền thuê không trừ vào giá mua', file: 'Tinh_trang_can_ho_cong_no' });
  main.onclick = e => { const t = e.target.closest('[data-st]'); if (t) { s.state = t.dataset.st; return draw(); } const tr = e.target.closest('tr[data-i]'); if (tr) { const r = shown()[+tr.dataset.i]; if (r?.contract_id) openDetail('contract', r.contract_id, 'debt'); else if (r) location.hash = `#/v/unit360?id=${r.unit_id}`; } };
  ST.reload = async () => { if ($('#usT', main)) await load(); };
  await load();
};
// CN-07 theo dõi HĐ vay: gốc khách đã chuyển, lãi / gốc công ty phải trả khách, ghi nhận đã trả từng kỳ
V.loantrack = async main => {
  const f = filt(), s = ST.loantrack ||= { state: '', q: '' };
  const cols = [['project', 'Dự án'], ['unit', 'Mã căn'], ['customer', 'Bên cho vay (khách)'], ['number', 'Số HĐ vay'], ['links', 'HĐ thuê đi kèm'], ['nature_l', 'Bản chất'], ['goc_hd', 'Số tiền vay', 'money'], ['goc_nhan', 'Gốc đã nhận', 'money'],
    ['mode_l', 'Lãi trả bằng'], ['rent', 'Tiền thuê/tháng', 'money'], ['period_l', 'Kỳ trả lãi'], ['eff_on', 'Bắt đầu tính lãi', 'date'], ['exp_on', 'Ngày đáo hạn', 'date'], ['lai_tong', 'Lãi cả kỳ', 'money'], ['lai_tra', 'Đã trả lãi', 'money'],
    ['lai_con', 'Lãi còn phải trả', 'money'], ['lai_qua_han', 'Lãi quá hạn', 'money'], ['goc_tra_con', 'Gốc còn phải trả', 'money'], ['next_l', 'Kỳ tới'], ['next_on', 'Hạn kỳ tới', 'date'], ['next_amt', 'Số tiền kỳ tới', 'money'], ['state_l', 'Tình trạng']];
  const SUM = ['goc_hd', 'goc_nhan', 'lai_tong', 'lai_tra', 'lai_con', 'lai_qua_han', 'goc_tra_con', 'next_amt'];
  const TABS = [['', 'Tất cả'], ['qua_han', 'Quá hạn trả lãi'], ['sap_toi', 'Đến hạn trong 7 ngày'], ['dao_han', 'Đáo hạn trong 30 ngày'], ['dang', 'Đang vay'], ['xong', 'Đã trả hết']];
  let d = { rows: [] };
  const shown = () => { const q = s.q.trim().toLowerCase(); return d.rows.filter(r => (!s.state || r.state === s.state) && (!q || [r.unit, r.customer, r.number, r.links, r.phone].some(x => String(x || '').toLowerCase().includes(q)))); };
  const draw = () => {
    const sum = k => d.rows.reduce((t, r) => t + (+r[k] || 0), 0), n = k => d.rows.filter(r => !k || r.state === k).length, tile = (l, v, sub, red) => `<div class="card kpi ${red ? 'red' : ''}" style="cursor:default"><div class="l">${l}</div><div class="v" style="font-size:18px">${v}</div><div class="s">${sub || '&nbsp;'}</div></div>`;
    $('#ltK', main).innerHTML = tile('Gốc vay đã nhận', fm(sum('goc_nhan')), `${d.rows.length} HĐ vay · theo hợp đồng ${fm(sum('goc_hd'))}`) + tile('Lãi còn phải trả khách', fm(sum('lai_con')), `đã trả ${fm(sum('lai_tra'))}`)
      + tile('Lãi quá hạn chưa trả', fm(sum('lai_qua_han')), `${n('qua_han')} hợp đồng`, sum('lai_qua_han') > 0) + tile('Gốc còn phải trả khách', fm(sum('goc_tra_con')), `${n('dao_han')} HĐ đáo hạn trong 30 ngày`);
    $('#ltTabs', main).innerHTML = TABS.map(([k, l]) => `<button data-st="${k}" class="${s.state === k ? 'on' : ''}">${l} <span class="n">${n(k)}</span></button>`).join('');
    $('#ltN', main).textContent = `${shown().length} hợp đồng`;
    $('#ltT', main).innerHTML = rowsTable(cols, shown(), SUM);
  };
  const load = async () => { d = await api('GET', '/api/loan-track?' + qsOf({ project: f.project })); draw(); };
  // bấm 1 HĐ vay: các kỳ trả lãi / gốc, ghi nhận đã trả
  const items = async id => {
    const g = await api('GET', `/api/loan-track/${id}`), T = today(), rem = x => Math.max(0, +x.amount - (+x.paid_amt || 0));
    const st = x => !rem(x) && +x.amount > 0 ? pill('Đã trả', 'g') : x.due_on < T ? pill('Quá hạn trả', 'r') : +x.paid_amt > 0 ? pill('Trả một phần', 'b') : pill('Chưa đến hạn', 's');
    const m = modal({ title: `${ico('fa-hand-holding-dollar')} Lịch trả lãi & gốc — HĐ vay ${esc(g.contract.number || '')}`, wide: true,
      body: `<div class="small muted mb">Căn ${esc(g.contract.unit)} · bên cho vay ${esc(g.contract.customer)} · số tiền vay ${fm(g.contract.value)} đ · lãi ${g.contract.int_mode === 'lai_suat' ? `${fnum(g.contract.loan_rate)}%/năm` : `bằng tiền thuê ${fm(g.contract.rent)} đ/tháng`}</div>
        ${g.items.length ? `<table class="t compact noclick"><thead><tr><th>Kỳ</th><th>Khoản</th><th>Thời gian tính lãi</th><th>Hạn trả</th><th class="num">Phải trả</th><th>Ngày đã trả</th><th class="num">Đã trả</th><th>Ghi chú</th><th>Tình trạng</th><th></th></tr></thead><tbody>${g.items.map(x => `<tr><td>${x.seq}</td><td>${x.kind === 'lai' ? 'Tiền lãi' : '<b>Trả gốc</b>'}</td><td>${dmy(x.period_from)} – ${dmy(x.period_to)}</td><td>${dmy(x.due_on)}</td><td class="num">${fm(x.amount)}</td><td>${x.paid_on ? dmy(x.paid_on) : ''}</td><td class="num">${+x.paid_amt ? fm(x.paid_amt) : ''}</td><td>${esc(x.note || '')}</td><td>${st(x)}</td><td>${g.can_pay ? `<button class="btn sm ${rem(x) ? 'pri' : ''}" data-pay="${x.id}">${ico(rem(x) ? 'fa-check' : 'fa-pen')} ${rem(x) ? 'Ghi nhận đã trả' : 'Sửa'}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Chưa có lịch — mở HĐ vay, nhập ngày bắt đầu tính lãi, thời hạn, kỳ trả lãi rồi lưu</div>'}`,
      foot: `<button class="btn" data-x>Đóng</button><button class="btn" id="ltO">${ico('fa-file-contract')} Mở hợp đồng vay</button>` });
    $('#ltO', m.el).onclick = () => { m.close(); openDetail('contract', id); };
    m.el.addEventListener('click', run(async e => {
      const b = e.target.closest('[data-pay]'); if (!b) return; const x = g.items.find(i => i.id === +b.dataset.pay);
      const a = modal({ title: `${ico('fa-check')} Ghi nhận đã trả — ${x.kind === 'lai' ? 'tiền lãi kỳ ' + x.seq : 'trả gốc'}`, narrow: true, body: `<div id="lpE"></div><form class="form"><div class="fld wide"><label>Ngày đã trả</label>${segDate('lpD', x.paid_on || T)}</div><div class="fld wide"><label>Số tiền đã trả</label><input name="lpA" class="inp" value="${moneyStr(+x.paid_amt || +x.amount)}"></div><div class="fld wide"><label>Ghi chú</label><input name="lpN" class="inp" value="${esc(x.note || '')}" placeholder="VD: chuyển khoản, cấn trừ…"></div></form>`,
        foot: `<button class="btn" data-x>Hủy</button><button class="btn pri" id="lpOk">${ico('fa-floppy-disk')} Lưu</button>` });
      wireSegDate(a.el);
      $('#lpOk', a.el).onclick = run(async () => {
        try { await api('PUT', `/api/e/loan_pay/${x.id}`, { paid_on: segVal($('#lpD', a.el)) || null, paid_amt: num($('[name=lpA]', a.el).value, true), note: $('[name=lpN]', a.el).value || null }); a.close(); m.close(); toast('Đã ghi nhận'); await load(); items(id); }
        catch (er) { $('#lpE', a.el).innerHTML = `<div class="errbar">${esc(er.message)}</div>`; }
      });
    }));
  };
  main.innerHTML = `<div class="page">${head('06', 'Theo dõi HĐ vay — lãi & gốc', 'fa-hand-holding-dollar', `<button class="btn" id="ltX">${ico('fa-file-excel')} Xuất Excel</button>`, 'CN-07')}${filterBar(f, { period: false })}<div class="grid g4 mb" id="ltK"></div><div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="ltQ" placeholder="Tìm mã căn, khách hàng, số HĐ vay / thuê…" value="${esc(s.q)}"></div><span class="grow"></span><span class="small muted" id="ltN"></span></div><div class="tabs" id="ltTabs"></div><div id="ltT"><div class="empty">Đang tải…</div></div><div class="small muted mt">Gốc: khách chuyển theo các đợt giải ngân (phiếu thu của HĐ vay). Lãi: công ty trả khách cuối mỗi kỳ — mỗi tháng = 1 tháng tiền thuê căn (hoặc theo lãi suất). Tiền vay không trừ vào giá mua căn hộ. Bấm 1 dòng để ghi nhận đã trả.</div></div></div>`;
  wireFilter(main, f, load);
  $('#ltQ', main).oninput = debounce(e => { s.q = e.target.value; draw(); }, 200);
  $('#ltX', main).onclick = () => download('/api/export-rows', { title: 'CN-07 Theo dõi HĐ vay — lãi & gốc', cols, rows: shown(), sum: SUM, note: 'Lãi trả khách bằng tiền thuê 1 tháng / tháng hoặc theo lãi suất; tiền vay không trừ vào giá mua', file: 'Theo_doi_HD_vay' });
  main.onclick = run(async e => { const t = e.target.closest('[data-st]'); if (t) { s.state = t.dataset.st; return draw(); } const tr = e.target.closest('#ltT tr[data-i]'); if (tr) { const r = shown()[+tr.dataset.i]; if (r) await items(r.contract_id); } });
  ST.reload = async () => { if ($('#ltT', main)) await load(); };
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
  const load = async () => { d = await api('GET', '/api/finish-pay?' + qsOf({ project: f.project })); $('#srcLine', main).innerHTML = `<span>${ico('fa-database')} Thực thu đồng bộ Bravo${d.bravo_sync ? ' — chốt ' + dmyhm(d.bravo_sync) : ''}</span><span>Gộp HĐMB: tạm tính theo % đã thu của hợp đồng, chưa phải số thu riêng của khoản hoàn thiện</span>`; draw(); };
  main.innerHTML = `<div class="page">${head('06', 'Tiến độ thu tiền hoàn thiện', 'fa-couch', `<button class="btn" id="fpX">${ico('fa-file-excel')} Xuất Excel</button>`, 'CN-05')}${filterBar(f, { period: false })}<div class="grid g4 mb" id="fpK"></div><div class="card"><div class="toolbar"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="fpQ" placeholder="Mã căn, khách hàng, số HĐ…" value="${esc(s.q)}"></div><span class="grow"></span><span class="small muted" id="fpN"></span></div><div class="tabs" id="fpTabs"></div><div id="fpT"></div></div></div>`;
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
  main.innerHTML = `<div class="page">${head('05', 'Theo dõi tình trạng vay vốn', 'fa-building-columns', `<button class="btn" id="lnX">${ico('fa-file-excel')} Xuất Excel</button>`, 'HD-05')}
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
  $('#lnX', main).onclick = () => download('/api/export-rows', { title: 'THEO DÕI TÌNH TRẠNG VAY VỐN', cols: LOAN_COLS, rows: shown(), file: 'theo_doi_vay_von' });
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
