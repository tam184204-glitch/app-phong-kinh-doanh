// Cầu nối cho bản sao trang công khai (gioi-thieu.html): chạy trước portal.js của trang gốc.
// portal.js gọi /api/public/… của cattuonggroup.ai.vn — trang gốc không cho gọi từ tên miền khác. Có máy chủ app: máy chủ chuyển tiếp
// sang trang gốc (dữ liệu, lượt truy cập, trợ lý AI thật); trang tĩnh (bản demo): trả lời từ dữ liệu đã chụp (cong-khai/data/,
// sinh bởi node demo/cong-khai.mjs). Form đăng ký → /api/public/lead của app → Phân hệ 03 «Khách hàng tiềm năng»;
// bản demo tĩnh (không có máy chủ) thì xếp hàng ở localStorage «ctg-public-leads», app nội bộ tự nhận khi mở.
(() => {
  'use strict';
  const DATA = 'cong-khai/data/';
  const LEAD_KEY = 'ctg-public-leads';
  const HOTLINE = 'Vui lòng gọi Hotline 082.937.6666 để được hỗ trợ.';
  const realFetch = window.fetch.bind(window);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  const ok = data => json(200, { success: true, data });
  const fail = (status, error) => json(status, { success: false, error });
  const file = async f => { const r = await realFetch(DATA + f, { cache: 'no-cache' }); return r.ok ? json(200, await r.json()) : fail(404, 'Không có dữ liệu'); };

  // lượt truy cập: số liệu lúc chụp + lượt mở trên trình duyệt này
  let visits = null;
  const visitSnap = async () => {
    if (!visits) {
      visits = await realFetch(DATA + 'luot-truy-cap.json').then(r => r.json()).then(j => j.data).catch(() => ({ total: 0 }));
      let n = 1; try { n = +(localStorage.getItem('ctg-public-visits') || 0) + 1; localStorage.setItem('ctg-public-visits', n); } catch { }
      visits = { ...visits, total: (+visits.total || 0) + n, totalText: undefined, online: 1, updatedAt: new Date().toISOString() };
    }
    return visits;
  };

  // khách để lại số điện thoại (đăng ký quan tâm, yêu cầu tài liệu…) → hồ sơ khách tiềm năng
  async function lead(kind, b) {
    const content = [kind, b.toaQuanTam && `tòa ${b.toaQuanTam}`, b.canQuanTam && `căn ${b.canQuanTam}`, b.ghiChu || b.noiDung].filter(Boolean).join(' — ');
    const body = { full_name: b.hoTen || b.ten || '', phone: b.soDienThoai || b.dienThoai || '', email: b.email || '', project: b.duAnQuanTam || '', content };
    let r = null, j = null;
    try { r = await realFetch('api/public/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); j = await r.json(); } catch { }
    if (j && j.error) return fail(400, j.error);
    if (!(r && r.ok && j && j.ok)) {   // trang tĩnh: chưa có máy chủ nhận → xếp hàng cho app nội bộ
      try { const q = JSON.parse(localStorage.getItem(LEAD_KEY) || '[]'); q.push({ ...body, at: new Date().toISOString() }); localStorage.setItem(LEAD_KEY, JSON.stringify(q)); }
      catch { return fail(500, 'Chưa gửi được. ' + HOTLINE); }
    }
    return ok({ message: `Cảm ơn ${body.full_name || 'Quý khách'}! Chuyên viên Cát Tường Group sẽ liên hệ lại trong thời gian sớm nhất.` });
  }
  const LEADS = { 'dang-ky-quan-tam': 'Đăng ký quan tâm', 'yeu-cau-tai-lieu': 'Yêu cầu tài liệu', 'blog-lead': 'Để lại thông tin từ bài viết' };

  // có máy chủ app (npm start): /api/public/… chuyển tiếp sang trang gốc, phản hồi gắn «X-Cong-Khai: live» → dùng nguyên
  let live = null;   // null = chưa biết, false = trang tĩnh (bản demo) → dữ liệu đã chụp
  async function tryLive(input, init) {
    if (live === false) return null;
    try {
      const r = await realFetch(input, init);
      live = r.headers.get('X-Cong-Khai') === 'live';
      return live ? r : null;
    } catch { live = false; return null; }
  }

  async function handle(method, p, init, input) {
    let b = {}; try { b = typeof init.body === 'string' ? JSON.parse(init.body) : {}; } catch { }
    if (method === 'POST' && LEADS[p] && (b.soDienThoai || b.dienThoai)) return lead(LEADS[p], b);
    const r = await tryLive(input, init);
    if (r) return r;
    if (method === 'GET') {
      if (p === 'du-an' || p === 'bieu-mau' || p === 'bang-hang' || p === 'phap-ly') return file(p + '.json');
      let m;
      if ((m = /^du-an\/([^/]+)$/.exec(p))) return file('du-an__' + decodeURIComponent(m[1]) + '.json');
      if ((m = /^blog\/([^/]+)$/.exec(p))) return file('blog__' + decodeURIComponent(m[1]) + '.json');
      if (p === 'luot-truy-cap') return ok(await visitSnap());
      if (p === 'ai/status') return ok({ enabled: false });
      return fail(404, 'Chức năng này chỉ có trên trang chính thức. ' + HOTLINE);
    }
    if (p === 'luot-truy-cap/track') return ok(await visitSnap());
    return fail(503, 'Chức năng này chỉ có trên trang chính thức. ' + HOTLINE);
  }

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, location.href);
    if (u.origin === location.origin && u.pathname === '/api/auth/me') return Promise.resolve(fail(401, 'Chưa đăng nhập'));
    const m = u.origin === location.origin && /^\/api\/public\/(.+)$/.exec(u.pathname);
    if (!m || m[1] === 'lead') return realFetch(input, init);
    return handle(String(init.method || 'GET').toUpperCase(), m[1], init, input).catch(() => fail(500, 'Lỗi tải dữ liệu. ' + HOTLINE));
  };

  // bộ đếm realtime (EventSource): có máy chủ → hỏi số thật mỗi 15 giây qua chuyển tiếp; trang tĩnh → phát một lần số đã chụp
  const RealES = window.EventSource;
  if (RealES) window.EventSource = function (url, opt) {
    if (!String(url).includes('/api/public/')) return new RealES(url, opt);
    const t = new EventTarget(); let timer = null; t.close = () => clearInterval(timer);
    const emit = v => { const e = new Event('visits'); e.data = JSON.stringify(v); t.dispatchEvent(e); };
    const tick = async () => {
      const j = await window.fetch('/api/public/luot-truy-cap?path=%2Fgioi-thieu').then(r => r.json()).catch(() => null);
      if (j && j.success) emit(j.data);
      if (live === false) clearInterval(timer);
    };
    timer = setInterval(tick, 15e3); tick();
    return t;
  };
})();
