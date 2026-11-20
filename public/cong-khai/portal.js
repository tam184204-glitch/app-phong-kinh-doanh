// ============================================================
// M17 — Public Marketing Portal (frontend logic)
// ============================================================
const API = '/api/public';
const VISIT_COUNTER_PATH = '/gioi-thieu';
const LOCKED_SUPPORT_IDS = new Set([
  'kiem-tra-ho-so-khach-hang',
  'tra-cuu-tien-trinh-phe-duyet-ho-so',
]);
const SMART_CITY_PROJECT_360_URL = 'https://cattuong.panoee.net/cattuong/68f89412a308267c3b1e6ad6';
const PROJECT_OVERVIEW_BANNERS = {
  'CT-TNT': 'marketing/images/projects/ai-outpaint/cat-tuong-tnt.jpg',
  'CT-ECO': 'marketing/images/projects/ai-outpaint/cat-tuong-eco-wide-ai-20260707.jpg',
  'CT-TN': 'marketing/images/projects/ai-outpaint/cat-tuong-thong-nhat.jpg',
  'CT-NEW': 'marketing/images/projects/ai-outpaint/cat-tuong-new.jpg',
  'CT-SMART': 'marketing/images/projects/ai-outpaint/cat-tuong-smart-city.jpg',
  'TNS-SMART': 'marketing/images/projects/ai-outpaint/thong-nhat-smart-city-day-ai-20260707.jpg',
  DHP: 'marketing/images/projects/ai-outpaint/dai-hung-phat.jpg',
  'VDL-CT': 'marketing/images/projects/ai-outpaint/vien-duong-lao-cat-tuong.jpg',
};

const TNT_APARTMENT_TOUR_BASE = 'marketing/images/projects/cat-tuong-tnt/apartment-tour';
const TNT_APARTMENT_TOUR = [
  {
    id: 'tnt-overview-720',
    ten: 'Toàn cảnh căn hộ TNT',
    anh: `${TNT_APARTMENT_TOUR_BASE}/tnt-overview-720-ai.png`,
    hfov: 98,
    pitch: -8,
    yaw: 0,
  },
];

const ECO_APARTMENT_TOUR_BASE = 'marketing/images/projects/cat-tuong-eco/apartment-tour';
const ECO_APARTMENT_TOUR_VERSION = '20260709-eco-ai-overview-panorama-v1';
const ECO_APARTMENT_TOUR = [
  {
    id: 'eco-single-wide-panorama',
    ten: 'To\u00e0n c\u1ea3nh c\u0103n h\u1ed9 C\u00e1t T\u01b0\u1eddng Eco',
    anh: `${ECO_APARTMENT_TOUR_BASE}/eco-single-wide-panorama.jpg?v=${ECO_APARTMENT_TOUR_VERSION}`,
    haov: 360,
    vaov: 180,
    hfov: 84,
    pitch: -2,
    yaw: -150,
    minHfov: 84,
    maxHfov: 84,
    minPitch: -80,
    maxPitch: 80,
    disableAutoHotspots: true,
    rotateOnly: true,
  },
];

const TNS_SMART_APARTMENT_TOUR_BASE = 'marketing/images/projects/thong-nhat-smart-city';
const TNS_SMART_APARTMENT_TOUR_VERSION = '20260709-tns-smart-look-up-down-v1';
const TNS_SMART_APARTMENT_TOUR = [
  {
    id: 'tns-smart-overview-720',
    ten: 'To\u00e0n c\u1ea3nh c\u0103n h\u1ed9 Th\u1ed1ng Nh\u1ea5t Smart City',
    anh: `${TNS_SMART_APARTMENT_TOUR_BASE}/virtual-720.jpg?v=${TNS_SMART_APARTMENT_TOUR_VERSION}`,
    haov: 360,
    vaov: 180,
    hfov: 88,
    pitch: -2,
    yaw: 46,
    minHfov: 78,
    maxHfov: 110,
    minPitch: -80,
    maxPitch: 80,
    disableAutoHotspots: true,
  },
];

const DHP_APARTMENT_TOUR_BASE = 'marketing/images/projects/dai-hung-phat/apartment-tour';
const DHP_APARTMENT_TOUR = [
  {
    id: 'dhp-overview-720',
    ten: 'To\u00e0n c\u1ea3nh c\u0103n h\u1ed9 \u0110\u1ea1i H\u01b0ng Ph\u00e1t',
    anh: `${DHP_APARTMENT_TOUR_BASE}/dhp-overview-720-ai-20260707.png?v=20260707-dhp-single-panorama-no-hotspots`,
    hfov: 110,
    pitch: -8,
    yaw: -18,
  },
];

function fmtGia(trieu) {
  if (trieu >= 1000) return (trieu / 1000).toFixed(trieu % 1000 === 0 ? 0 : 2).replace('.', ',') + ' tỷ';
  return trieu.toLocaleString('vi-VN') + ' triệu';
}
function fmtNgay(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function jsStr(s) { return JSON.stringify(String(s == null ? '' : s)); }
function linkAttrs(href) { return /^https?:\/\//.test(String(href || '')) ? ' target="_blank" rel="noopener"' : ''; }
async function apiGet(path) {
  const r = await fetch(API + path);
  const text = await r.text();
  let j = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    const plain = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    throw new Error(plain || `Máy chủ trả về lỗi HTTP ${r.status || ''}`.trim());
  }
  if (!j?.success) throw new Error(j?.error || 'Lỗi');
  return j.data;
}
async function apiPost(path, body) { const r = await fetch(API + path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); const j = await r.json(); if (!j.success) throw new Error(j.error || 'Lỗi'); return j.data; }

async function apiPostForm(path, formData) {
  const r = await fetch(API + path, { method: 'POST', body: formData });
  const text = await r.text();
  let j = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    const plain = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    let message = plain || `Máy chủ trả về lỗi HTTP ${r.status || ''}`.trim();
    const isDocOcr = path.includes('/doc-ocr');
    if (r.status === 413) {
      message = isDocOcr
        ? 'File scan/ảnh quá lớn, máy chủ đang chặn trước khi OCR đọc được. Vui lòng nén file hoặc chia nhỏ file PDF.'
        : 'File PDF scan tổng quá lớn, proxy/máy chủ đang chặn trước khi AI đọc được. Vui lòng nén file hoặc chia nhỏ file PDF.';
    } else if ([502, 503, 504].includes(r.status)) {
      message = isDocOcr
        ? 'AI/OCR đọc file scan quá lâu hoặc máy chủ tạm thời quá tải. Hệ thống đọc ở nền, vui lòng thử lại với file rõ hơn hoặc ít trang hơn.'
        : 'AI/OCR đọc PDF scan tổng quá lâu hoặc máy chủ tạm thời quá tải. Hệ thống đã có cơ chế đọc lại, vui lòng thử lại với file rõ hơn hoặc ít trang hơn.';
    }
    throw new Error(message);
  }
  if (!j?.success) throw new Error(j?.error || 'Lỗi');
  return j.data;
}

function blogHref(id) {
  const slug = encodeURIComponent(id);
  return `gioi-thieu.html?blog=${slug}`;
}
function trangGioiThieuHref() {
  return 'gioi-thieu.html';
}
function layBlogIdTuUrl() {
  const queryId = new URLSearchParams(location.search).get('blog');
  if (queryId) return queryId;
  const m = location.pathname.match(/\/blog\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

let INTERNAL_SUPPORT_ACCESS_PROMISE = null;
function laMucHoTroTamKhoa(id) {
  return LOCKED_SUPPORT_IDS.has(String(id || ''));
}
async function coQuyenXemHoTroNoiBo() {
  if (location.protocol === 'file:') return false;
  if (!INTERNAL_SUPPORT_ACCESS_PROMISE) {
    INTERNAL_SUPPORT_ACCESS_PROMISE = fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(r => r.ok)
      .catch(() => false)
      .then(granted => {
        if (!granted) INTERNAL_SUPPORT_ACCESS_PROMISE = null;
        return granted;
      });
  }
  return INTERNAL_SUPPORT_ACCESS_PROMISE;
}
function hienCanhBaoMucHoTroTamKhoa(id) {
  const item = HO_TRO_KHACH_HANG_ITEMS.find(entry => entry.id === id);
  const tenPhan = item?.tieuDe || 'Nội dung này';
  showBangHangAlert(`Phần “${tenPhan}” đang tạm khóa công khai, chỉ tài khoản nội bộ xem được.`);
}
async function moMucHoTroKhachHang(event, id) {
  if (!laMucHoTroTamKhoa(id)) return true;
  event?.preventDefault();
  const link = event?.currentTarget;
  link?.setAttribute('aria-busy', 'true');
  try {
    if (await coQuyenXemHoTroNoiBo()) {
      location.href = link?.href || blogHref(id);
      return false;
    }
    hienCanhBaoMucHoTroTamKhoa(id);
  } finally {
    link?.removeAttribute('aria-busy');
  }
  return false;
}

let CHECKLIST = [];
let TW_ANIMATE_OBSERVER = null;
let DU_AN_PUBLIC_CACHE = [];
let DU_AN_CAROUSEL_INDEX = 0;
let DU_AN_CAROUSEL_TIMER = null;
let DU_AN_CAROUSEL_RESIZE_BOUND = false;
const DU_AN_SELECT_FALLBACK = [
  { ma: 'CT-TNT', ten: 'Nhà ở xã hội Cát Tường TNT' },
  { ma: 'CT-ECO', ten: 'Nhà ở xã hội Cát Tường Eco' },
  { ma: 'CT-TN', ten: 'Nhà ở xã hội Thống Nhất' },
  { ma: 'CT-NEW', ten: 'Chung cư Cát Tường New' },
  { ma: 'CT-SMART', ten: 'Cát Tường Smart City' },
  { ma: 'TNS-SMART', ten: 'Thống Nhất Smart City' },
  { ma: 'DHP', ten: 'Đại Hưng Phát' },
  { ma: 'VDL-CT', ten: 'Viện dưỡng lão Cát Tường' },
];
let QUY_CAN_072026_CACHE = null;
let BANG_HANG_ALERT_CLOSE_ACTION = null;
const TIN_TUC_COLLAPSED_COUNT = 6;
const TIN_TUC_SCROLL_STEP = 5;
let NEWS_PANEL_HEIGHT_SYNC_BOUND = false;
let NEWS_RAIL_SCROLL_RAF = 0;
let MOTION_PRESS_BOUND = false;
let MOTION_GRAPHICS_OBSERVER = null;
let MOTION_GRAPHICS_RAF = 0;
let MOTION_NODES_BOUND = false;
let SCROLL_PROGRESS_BOUND = false;
let HERO_MOTION_BOUND = false;

const LEAD_TOWER_PROJECTS = [
  { ten: 'Khu nhà ở xã hội cho người thu nhập thấp Cát Tường', towers: ['TNT-CT1', 'TNT-CT2', 'TNT-CT3', 'TNT-CT4', 'TNT-CT5'] },
  { ten: 'Khu nhà ở xã hội Cát Tường ECO', towers: ['ECO-CT1', 'ECO-CT2', 'ECO-CT3', 'ECO-CT4'] },
  { ten: 'Khu nhà ở xã hội Thống Nhất', towers: ['TN-N1', 'TN-N2', 'TN-N3', 'TN-N4'] },
  { ten: 'Khu nhà ở xã hội Cát Tường Smart City', towers: ['Nhà Liền kề CTS', 'M1', 'M2', 'K', 'L', 'P', 'Q', 'R', 'S', 'T', 'O', 'G'] },
  { ten: 'Khu nhà ở xã hội Thống Nhất Smart City', towers: ['Nhà Liền kề TNS', 'A', 'B', 'C', 'D', 'E', 'F', 'H', 'I', 'J'] },
];

const TOWER_OPEN_PROJECTS = {
  'Khu nhà ở xã hội Cát Tường Smart City': new Set(['O', 'G']),
  'Khu nhà ở xã hội Thống Nhất Smart City': new Set(),
};
const OPEN_TOWER_CODES_072026 = ['O', 'G'];

// [App PKD] Tòa G thuộc Cát Tường Smart City — bảng hàng trang gốc ghi nhầm Thống Nhất Smart City (TNS)
function suaToaGThuocCTS(data) {
  (data?.toa || []).forEach(t => {
    if (t.maDuAn !== 'TNS' || String(t.maToa).toUpperCase() !== 'G') return;
    t.maDuAn = 'CTS'; t.tenDuAn = 'CTS';
    (t.canHo || []).forEach(c => { c.maCan = String(c.maCan || '').replace(/^TNS-G-/, 'CTS-G-'); });
  });
  return data;
}
function syncOpenTowersFromInventory(data) {
  suaToaGThuocCTS(data);
  const projectNames = { CTS: 'Khu nhà ở xã hội Cát Tường Smart City', TNS: 'Khu nhà ở xã hội Thống Nhất Smart City' };
  Object.values(projectNames).forEach(name => TOWER_OPEN_PROJECTS[name]?.clear());
  (data?.toa || []).forEach(tower => {
    const projectName = projectNames[tower.maDuAn];
    if (projectName && Number(tower.soCan || tower.canHo?.length || 0) > 0) TOWER_OPEN_PROJECTS[projectName].add(String(tower.maToa).toUpperCase());
  });
}

function leadTowerValue(projectName, tower) {
  return `${LEAD_TOWER_PROJECTS.findIndex(p => p.ten === projectName)}::${tower}`;
}
function parseLeadTowerValue(value) {
  const [indexRaw, ...towerParts] = String(value || '').split('::');
  const project = LEAD_TOWER_PROJECTS[Number(indexRaw)];
  const tower = towerParts.join('::');
  return project && tower ? { projectName: project.ten, tower } : null;
}
function isLeadTowerOpen(projectName, tower) {
  return !!TOWER_OPEN_PROJECTS[projectName]?.has(tower);
}
function openTowerLabel(tower) {
  return tower;
}
function towerCodeForInventory(tower) {
  return String(tower || '').replace(/^Tòa\s+/i, '').trim();
}
function projectForOpenTowerCode(code) {
  return Object.keys(TOWER_OPEN_PROJECTS).find(name => TOWER_OPEN_PROJECTS[name].has(code)) || '';
}
function resolveLeadProjectName(name) {
  const text = String(name || '').toLowerCase();
  if (text.includes('thống nhất smart')) return 'Khu nhà ở xã hội Thống Nhất Smart City';
  if (text.includes('smart city')) return 'Khu nhà ở xã hội Cát Tường Smart City';
  if (text.includes('eco')) return 'Khu nhà ở xã hội Cát Tường ECO';
  if (text.includes('thống nhất') || text.includes('thong nhat')) return 'Khu nhà ở xã hội Thống Nhất';
  if (text.includes('tnt') || text.includes('thu nhập thấp')) return 'Khu nhà ở xã hội cho người thu nhập thấp Cát Tường';
  return LEAD_TOWER_PROJECTS.some(p => p.ten === name) ? name : '';
}
function leadProjectByName(projectName) {
  const resolved = resolveLeadProjectName(projectName);
  return LEAD_TOWER_PROJECTS.find(p => p.ten === resolved || p.ten === projectName);
}
function leadTowerListText(projectName) {
  return leadProjectByName(projectName)?.towers.join(', ') || '';
}
function fixEcoTowerText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/4 khối nhà A, B, C, D/g, '4 khối nhà ECO-CT1, ECO-CT2, ECO-CT3, ECO-CT4')
    .replace(/A, B, C, D/g, 'ECO-CT1, ECO-CT2, ECO-CT3, ECO-CT4')
    .replace(/4 khối nhà CT1, CT2, CT3, CT4/g, '4 khối nhà ECO-CT1, ECO-CT2, ECO-CT3, ECO-CT4')
    .replace(/CT1, CT2, CT3 và CT4/g, 'ECO-CT1, ECO-CT2, ECO-CT3 và ECO-CT4')
    .replace(/CT1, CT2, CT3, CT4/g, 'ECO-CT1, ECO-CT2, ECO-CT3, ECO-CT4');
}
function normalizeProjectTowerNames(d) {
  if (resolveLeadProjectName(d?.ten) !== 'Khu nhà ở xã hội Cát Tường ECO') return d;
  return {
    ...d,
    quyMo: fixEcoTowerText(d.quyMo),
    diemNoiBat: Array.isArray(d.diemNoiBat) ? d.diemNoiBat.map(fixEcoTowerText) : d.diemNoiBat,
    chiTietDuAn: Array.isArray(d.chiTietDuAn)
      ? d.chiTietDuAn.map(section => ({
          ...section,
          moTa: Array.isArray(section.moTa) ? section.moTa.map(fixEcoTowerText) : section.moTa,
          hangMuc: Array.isArray(section.hangMuc) ? section.hangMuc.map(fixEcoTowerText) : section.hangMuc,
        }))
      : d.chiTietDuAn,
  };
}
function leadProjectOptionsHtml() {
  return '<option value="">-- Dự án quan tâm --</option>' + LEAD_TOWER_PROJECTS
    .map(project => `<option value="${esc(project.ten)}">${esc(project.ten)}</option>`)
    .join('');
}
function leadTowerOptionsHtml(projectName) {
  const project = LEAD_TOWER_PROJECTS.find(p => p.ten === projectName);
  if (!project) return '<option value="">-- Chọn dự án trước --</option>';
  return '<option value="">-- Tòa quan tâm --</option>' + project.towers.map(tower => {
    const label = isLeadTowerOpen(project.ten, tower) ? openTowerLabel(tower) : tower;
    return `<option value="${esc(leadTowerValue(project.ten, tower))}">${esc(label)}</option>`;
  }).join('');
}
function leadApartmentEmptyOption(text = '-- Căn quan tâm (không bắt buộc) --') {
  return `<option value="">${esc(text)}</option>`;
}
function leadApartmentOptionLabel(can) {
  const parts = [can.maCan];
  if (can.dienTich) parts.push(`${can.dienTich} m²`);
  if (can.huong) parts.push(`Hướng ${can.huong}`);
  if (giaCanHoDisplay(can)) parts.push(`${giaCanHoDisplay(can)} đ`);
  return parts.filter(Boolean).join(' - ');
}
async function updateLeadApartmentOptions(preferredValue = '') {
  const towerSelect = document.getElementById('leadToa');
  const apartmentSelect = document.getElementById('leadCan');
  if (!towerSelect || !apartmentSelect) return;
  const selected = parseLeadTowerValue(towerSelect.value);
  if (!selected) {
    apartmentSelect.innerHTML = leadApartmentEmptyOption('-- Chọn tòa trước, căn không bắt buộc --');
    apartmentSelect.disabled = true;
    return;
  }
  if (!isLeadTowerOpen(selected.projectName, selected.tower)) {
    apartmentSelect.innerHTML = leadApartmentEmptyOption('-- Tòa này chưa có căn đang mở bán --');
    apartmentSelect.disabled = true;
    return;
  }
  const requestValue = towerSelect.value;
  apartmentSelect.disabled = true;
  apartmentSelect.innerHTML = leadApartmentEmptyOption('Đang tải căn đang mở bán...');
  try {
    const data = await loadQuyCan072026();
    if (towerSelect.value !== requestValue) return;
    const tower = getInventoryTower(data, towerCodeForInventory(selected.tower), selected.projectName);
    const canHo = Array.isArray(tower?.canHo) ? tower.canHo : [];
    if (!canHo.length) {
      apartmentSelect.innerHTML = leadApartmentEmptyOption('-- Chưa có căn trống trong bảng hàng --');
      apartmentSelect.disabled = true;
      return;
    }
    apartmentSelect.innerHTML = leadApartmentEmptyOption() + canHo.map(can => (
      `<option value="${esc(can.maCan)}">${esc(leadApartmentOptionLabel(can))}</option>`
    )).join('');
    apartmentSelect.disabled = false;
    if (preferredValue && [...apartmentSelect.options].some(opt => opt.value === preferredValue)) {
      apartmentSelect.value = preferredValue;
    }
  } catch (_) {
    apartmentSelect.innerHTML = leadApartmentEmptyOption('-- Chưa tải được danh sách căn --');
    apartmentSelect.disabled = true;
  }
}
function updateLeadTowerWarning() {
  const towerSelect = document.getElementById('leadToa');
  const msg = document.getElementById('leadTowerMsg');
  if (!towerSelect || !msg) return true;
  const selected = parseLeadTowerValue(towerSelect.value);
  if (!selected || !selected.tower) {
    msg.textContent = '';
    msg.className = 'col-span-full text-xs text-slate-200';
    return true;
  }
  if (isLeadTowerOpen(selected.projectName, selected.tower)) {
    msg.textContent = `${selected.tower} đang mở bán.`;
    msg.className = 'col-span-full text-xs text-emerald-200';
    return true;
  }
  msg.textContent = `${selected.tower} hiện chưa mở bán. Vui lòng chọn tòa đang mở bán: D, E, H, I, J hoặc O.`;
  msg.className = 'col-span-full text-xs text-amber';
  return false;
}
function updateLeadTowerOptions(preferredValue = '') {
  const projectSelect = document.getElementById('leadDuAn');
  const towerSelect = document.getElementById('leadToa');
  if (!projectSelect || !towerSelect) return;
  towerSelect.innerHTML = leadTowerOptionsHtml(projectSelect.value);
  if (preferredValue && [...towerSelect.options].some(opt => opt.value === preferredValue)) {
    towerSelect.value = preferredValue;
  }
  updateLeadTowerWarning();
  updateLeadApartmentOptions();
}
function initLeadProjectTowerOptions() {
  const projectSelect = document.getElementById('leadDuAn');
  const towerSelect = document.getElementById('leadToa');
  if (!projectSelect || !towerSelect) return;
  const currentProject = projectSelect.value;
  projectSelect.innerHTML = leadProjectOptionsHtml();
  if (currentProject && [...projectSelect.options].some(opt => opt.value === currentProject)) projectSelect.value = currentProject;
  projectSelect.onchange = () => updateLeadTowerOptions();
  towerSelect.onchange = () => {
    updateLeadTowerWarning();
    updateLeadApartmentOptions();
  };
  updateLeadTowerOptions(towerSelect.value);
}
function setLeadProjectTower(projectName, tower = '') {
  initLeadProjectTowerOptions();
  const projectSelect = document.getElementById('leadDuAn');
  if (!projectSelect) return;
  const resolved = resolveLeadProjectName(projectName) || projectName;
  if (resolved && ![...projectSelect.options].some(opt => opt.value === resolved)) {
    projectSelect.appendChild(new Option(resolved, resolved));
  }
  if (resolved) projectSelect.value = resolved;
  const towerValue = tower ? leadTowerValue(resolved, tower) : '';
  updateLeadTowerOptions(towerValue);
}

function applyLeadTowerPrefill() {
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem('leadTowerPrefill') || 'null');
    sessionStorage.removeItem('leadTowerPrefill');
  } catch (_) {
    sessionStorage.removeItem('leadTowerPrefill');
  }
  if (!saved?.projectName) return;
  setLeadProjectTower(saved.projectName, saved.tower || '');
  setTimeout(() => document.querySelector('#leadForm input[name="hoTen"]')?.focus({ preventScroll: true }), 450);
}

const SMART_EDGE_SELECTORS = [
  '.news-panel',
  '.news-hot-card',
  '.news-mini-card',
  '.news-modal-card',
  '.project-showcase-card',
  '.support-tool-card',
  '.lead-card',
  '.modal-shell',
  '.modal-body section.rounded-2xl',
  '.modal-body .rounded-2xl',
  '.modal-body details',
  '.blog-hero-modern',
  '.blog-card-modern',
  '.bang-hang-tower-tile',
  '.project-gallery-tile',
  '.project-gallery-hero',
  '#blogPage details',
  '#blogPage section.rounded-2xl',
  '#blogPage .rounded-2xl.bg-white',
  '#blogPage .rounded-xl.bg-white',
  '#blogPage .rounded-xl.bg-slate-50',
  '#bangHangCdtDetail .rounded-2xl',
  '#bangHangCdtDetail .rounded-xl',
].join(',');

const MOTION_TILT_SELECTORS = [
  '.bang-hang-tower-tile',
].join(',');

const MOTION_PRESS_SELECTORS = [
  'button',
  'a',
  '[onclick]',
  '[role="button"]',
  '[data-gallery-src]',
  '[data-bang-hang-tower-button]',
  '.project-showcase-card',
  '.support-tool-card',
  '.news-hot-card',
  '.news-mini-card',
].join(',');

const SMART_EDGE_DECORATION_DISABLED = true;
const POINTER_HOVER_MOTION_DISABLED = false;
const POINTER_PRESS_RIPPLE_DISABLED = true;
const POINTER_TILT_X_DEG = 1.1;
const POINTER_TILT_Y_DEG = 1.25;

function motionReduced() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function selectMotionTargets(root, selector) {
  const base = root?.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : [];
  if (root?.nodeType === 1 && root.matches?.(selector)) base.unshift(root);
  return [...new Set(base)];
}

function ensureMotionChild(el, className, marker) {
  if (el.querySelector(`:scope > [${marker}]`)) return;
  const span = document.createElement('span');
  span.className = className;
  span.setAttribute(marker, '');
  span.setAttribute('aria-hidden', 'true');
  el.appendChild(span);
}

function resetSafeCardGlow(el) {
  el.classList.remove('is-motion-hot');
  el.style.setProperty('--safe-x', '50%');
  el.style.setProperty('--safe-y', '50%');
}

function bindSafeCardGlow(el) {
  if (!el || el.dataset.motionSafeGlowBound || motionReduced()) return;
  el.dataset.motionSafeGlowBound = '1';
  resetSafeCardGlow(el);
  el.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    el.classList.add('is-motion-hot');
    el.style.setProperty('--safe-x', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
    el.style.setProperty('--safe-y', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
  }, { passive: true });
  el.addEventListener('pointerleave', () => resetSafeCardGlow(el), { passive: true });
}

function decorateSmartEdge(el) {
  if (!el || el.dataset.motionDecorated) return;
  el.dataset.motionDecorated = '1';
  el.classList.add('motion-safe-card');
  bindSafeCardGlow(el);
  if (SMART_EDGE_DECORATION_DISABLED) return;
  el.classList.add('smart-edge-card');
  ensureMotionChild(el, 'smart-corner-fold', 'data-smart-corner-fold');
  ensureMotionChild(el, 'smart-vector-scan', 'data-smart-vector-scan');
}

function resetTilt(el) {
  el.style.setProperty('--tilt-x', '0deg');
  el.style.setProperty('--tilt-y', '0deg');
  el.style.setProperty('--motion-x', '50%');
  el.style.setProperty('--motion-y', '50%');
}

function bindTilt(el) {
  if (!el || el.dataset.motionTiltBound || POINTER_HOVER_MOTION_DISABLED || motionReduced()) return;
  el.dataset.motionTiltBound = '1';
  el.classList.add('motion-tilt');
  el.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--tilt-x', `${(-y * POINTER_TILT_X_DEG).toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${(x * POINTER_TILT_Y_DEG).toFixed(2)}deg`);
    el.style.setProperty('--motion-x', `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--motion-y', `${((y + 0.5) * 100).toFixed(1)}%`);
  }, { passive: true });
  el.addEventListener('pointerleave', () => resetTilt(el), { passive: true });
}

function addClickRipple(event) {
  if (POINTER_PRESS_RIPPLE_DISABLED || motionReduced()) return;
  const target = event.target?.closest?.(MOTION_PRESS_SELECTORS);
  if (!target || !document.body.contains(target)) return;
  if (target.disabled || target.getAttribute('aria-disabled') === 'true') return;
  target.classList.add('motion-press');
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height, 48) * 1.55;
  const ripple = document.createElement('span');
  ripple.className = 'click-ripple';
  ripple.style.setProperty('--ripple-size', `${size}px`);
  ripple.style.setProperty('--ripple-x', `${event.clientX - rect.left}px`);
  ripple.style.setProperty('--ripple-y', `${event.clientY - rect.top}px`);
  target.classList.add('is-motion-pressing');
  target.appendChild(ripple);
  setTimeout(() => {
    ripple.remove();
    target.classList.remove('is-motion-pressing');
  }, 720);
}

function ensureMotionPress() {
  if (MOTION_PRESS_BOUND || motionReduced()) return;
  MOTION_PRESS_BOUND = true;
  document.addEventListener('pointerdown', addClickRipple, true);
}

function ensureMotionNodeField() {
  if (MOTION_NODES_BOUND || motionReduced() || !document.body) return;
  MOTION_NODES_BOUND = true;
  const field = document.createElement('div');
  field.className = 'motion-node-field';
  field.setAttribute('aria-hidden', 'true');
  field.innerHTML = Array.from({ length: 9 }, () => '<span></span>').join('');
  document.body.insertBefore(field, document.body.firstChild);
}

function ensureScrollProgress() {
  if (SCROLL_PROGRESS_BOUND || motionReduced()) return;
  SCROLL_PROGRESS_BOUND = true;
  let raf = 0;
  const update = () => {
    raf = 0;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    doc.style.setProperty('--scroll-progress', String(Math.min(1, Math.max(0, window.scrollY / max))));
  };
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  update();
}

function ensureHeroMotion() {
  if (HERO_MOTION_BOUND || motionReduced()) return;
  const hero = document.querySelector('.hero-section');
  if (!hero) return;
  HERO_MOTION_BOUND = true;
  let raf = 0;
  const update = () => {
    raf = 0;
    const height = Math.max(1, hero.offsetHeight || window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / height));
    hero.style.setProperty('--hero-content-y', `${(progress * 26).toFixed(2)}px`);
    hero.style.setProperty('--hero-haze-y', `${(progress * 18).toFixed(2)}px`);
  };
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  update();
}

function scheduleMotionEnhance() {
  if (MOTION_GRAPHICS_RAF) return;
  MOTION_GRAPHICS_RAF = requestAnimationFrame(() => {
    MOTION_GRAPHICS_RAF = 0;
    enhanceMotionGraphics(document);
  });
}

function ensureMotionObserver() {
  if (MOTION_GRAPHICS_OBSERVER || !('MutationObserver' in window) || !document.body) return;
  MOTION_GRAPHICS_OBSERVER = new MutationObserver((mutations) => {
    if (!mutations.some(m => Array.from(m.addedNodes).some(node => node.nodeType === 1))) return;
    scheduleMotionEnhance();
  });
  MOTION_GRAPHICS_OBSERVER.observe(document.body, { childList: true, subtree: true });
}

function enhanceMotionGraphics(root = document) {
  if (!root?.querySelectorAll && root?.nodeType !== 1) return;
  selectMotionTargets(root, SMART_EDGE_SELECTORS).forEach(decorateSmartEdge);
  if (!motionReduced()) {
    selectMotionTargets(root, MOTION_TILT_SELECTORS).forEach(bindTilt);
    if (!POINTER_PRESS_RIPPLE_DISABLED) ensureMotionPress();
    ensureMotionNodeField();
    ensureScrollProgress();
    ensureHeroMotion();
  }
  ensureMotionObserver();
}

function initTwAnimate(root = document) {
  if (!root) return;
  enhanceMotionGraphics(root);
  if (motionReduced()) {
    root.querySelectorAll('[data-tw-animate]').forEach(el => el.classList.add('tw-in'));
    return;
  }
  document.body.classList.add('tw-animate-ready');
  if (!('IntersectionObserver' in window)) {
    root.querySelectorAll('[data-tw-animate]').forEach(el => el.classList.add('tw-in'));
    return;
  }
  if (!TW_ANIMATE_OBSERVER) {
    TW_ANIMATE_OBSERVER = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('tw-in');
        TW_ANIMATE_OBSERVER.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
  }
  root.querySelectorAll('[data-tw-animate]').forEach((el) => {
    if (el.dataset.twObserved) return;
    el.dataset.twObserved = '1';
    TW_ANIMATE_OBSERVER.observe(el);
  });
}

const BLOG_TAI_LIEU_MAC_DINH = [
  {
    id: 'don-dang-ky-mua',
    ten: 'Đơn đăng ký mua nhà ở xã hội',
    moTa: 'Biểu mẫu kê khai nhu cầu mua nhà ở xã hội, dùng để chuẩn bị hồ sơ đăng ký ban đầu.',
    loai: 'Đơn mẫu',
    dinhDang: 'PDF/HTML',
    file: 'marketing/forms/phieu-dang-ky-mua.html',
  },
  {
    id: 'to-khai-khach-hang',
    ten: 'Tờ khai thông tin khách hàng',
    moTa: 'Mẫu kê khai thông tin cá nhân, thông tin liên hệ và dự án/căn hộ quan tâm.',
    loai: 'Biểu mẫu kê khai',
    dinhDang: 'Word/HTML',
    file: 'marketing/forms/to-khai-khach-hang.html',
  },
  {
    id: 'danh-sach-ho-so',
    ten: 'Danh sách hồ sơ cần chuẩn bị',
    moTa: 'Checklist giấy tờ theo từng nhóm đối tượng, dùng để rà soát trước khi nộp hồ sơ.',
    loai: 'Tài liệu hướng dẫn',
    dinhDang: 'PDF/HTML',
    file: 'marketing/forms/danh-sach-ho-so.html',
  },
];

const BLOG_VAN_BAN_MAC_DINH = [
  { id: 'luat', nhom: 'Luật', tieuDe: 'Nhóm luật áp dụng cho nhà ở xã hội', moTa: 'Khung quy định nền tảng về nhà ở, kinh doanh bất động sản và quyền lợi của người mua.', ngayCapNhat: '2026-07-11' },
  { id: 'nghi-dinh', nhom: 'Nghị định', tieuDe: 'Nghị định hướng dẫn về điều kiện, đối tượng và thủ tục', moTa: 'Nhóm văn bản hướng dẫn chi tiết cách xác định đối tượng, điều kiện và trình tự xử lý hồ sơ.', ngayCapNhat: '2026-07-11' },
  { id: 'thong-tu', nhom: 'Thông tư', tieuDe: 'Thông tư và biểu mẫu hướng dẫn', moTa: 'Nhóm biểu mẫu, hướng dẫn kê khai và chuẩn hóa hồ sơ theo yêu cầu từng thời điểm.', ngayCapNhat: '2026-07-11' },
  { id: 'quyet-dinh', nhom: 'Quyết định', tieuDe: 'Quyết định phê duyệt, công bố hoặc hướng dẫn tại địa phương', moTa: 'Nhóm quyết định, công bố và hướng dẫn triển khai có thể thay đổi theo từng dự án/địa phương.', ngayCapNhat: '2026-07-11' },
  { id: 'huong-dan-moi', nhom: 'Văn bản hướng dẫn mới nhất', tieuDe: 'Văn bản hướng dẫn mới nhất', moTa: 'Cập nhật các văn bản, biểu mẫu và ghi chú áp dụng để khách hàng dễ theo dõi trước khi chuẩn bị hồ sơ.', ngayCapNhat: '2026-07-11' },
];

const NOXH_POLICY_LINKS = {
  luatNhaO2023: 'https://vanban.chinhphu.vn/?docid=209627&pageid=27160',
  nd100: 'https://vanban.chinhphu.vn/?docid=210760&pageid=27160',
  nd261: 'https://vanban.chinhphu.vn/?docid=215594&pageid=27160',
  nd54: 'https://vanban.chinhphu.vn/?docid=216924&pageid=27160',
  nd136: 'https://vanban.chinhphu.vn/?classid=1&docid=217605&orggroupid=2&pageid=27160',
  tt05: 'https://vanban.chinhphu.vn/?docid=210819&pageid=27160',
  tt32: 'https://vanban.chinhphu.vn/?classid=1&docid=215947&pageid=27160',
  tt08: 'https://vanban.chinhphu.vn/?docid=216996&pageid=27160',
};

const NOXH_NGUON_THAM_KHAO_CHINH_THONG = [
  { ten: 'Bộ Xây dựng - Hồ sơ chính sách mua nhà ở xã hội', href: 'https://moc.gov.vn/vn/pages/ChiTietHoiDap.aspx?chID=10337' },
  { ten: 'Bộ Xây dựng - QĐ 651/QĐ-BXD thủ tục hành chính lĩnh vực nhà ở', href: 'https://moc.gov.vn/Images/FileVanBan/BXD_651-QD-BXD_05052026.pdf' },
  { ten: 'NĐ 136/2026/NĐ-CP', href: NOXH_POLICY_LINKS.nd136 },
  { ten: 'NĐ 54/2026/NĐ-CP', href: NOXH_POLICY_LINKS.nd54 },
  { ten: 'NĐ 261/2025/NĐ-CP', href: NOXH_POLICY_LINKS.nd261 },
  { ten: 'NĐ 100/2024/NĐ-CP', href: NOXH_POLICY_LINKS.nd100 },
  { ten: 'TT 08/2026/TT-BXD', href: NOXH_POLICY_LINKS.tt08 },
];

const NOXH_FILE_BASE = 'marketing/forms/noxh/';
const NOXH_FORMS_RELEASE = '2026-09-22/';
const NOXH_DOWNLOAD_FILES = {
  zipGroup01: { ten: 'Tải bộ hồ sơ nhóm 01', moTa: 'Đã kết hôn, 2 vợ chồng làm doanh nghiệp', file: NOXH_FORMS_RELEASE + 'Nhom_01_Da_ket_hon_2_vo_chong_lam_doanh_nghiep.zip', zip: true },
  zipGroup02: { ten: 'Tải bộ hồ sơ nhóm 02', moTa: 'Độc thân, làm doanh nghiệp', file: NOXH_FORMS_RELEASE + 'Nhom_02_Doc_than_lam_doanh_nghiep.zip', zip: true },
  zipGroup03: { ten: 'Tải bộ hồ sơ nhóm 03', moTa: 'Đã kết hôn, 2 vợ chồng lao động tự do', file: NOXH_FORMS_RELEASE + 'Nhom_03_Da_ket_hon_2_vo_chong_lao_dong_tu_do.zip', zip: true },
  zipGroup04: { ten: 'Tải bộ hồ sơ nhóm 04', moTa: 'Độc thân, lao động tự do', file: NOXH_FORMS_RELEASE + 'Nhom_04_Doc_than_lao_dong_tu_do.zip', zip: true },
  zipGroup05: { ten: 'Tải bộ hồ sơ nhóm 05', moTa: 'Đã kết hôn, 1 người doanh nghiệp, 1 người tự do', file: NOXH_FORMS_RELEASE + 'Nhom_05_Da_ket_hon_1_doanh_nghiep_1_tu_do.zip', zip: true },
  zipFull: { ten: 'Tải trọn bộ mẫu NOXH', moTa: 'Bộ mẫu Word và Excel, cập nhật ngày 22/09/2026', file: NOXH_FORMS_RELEASE + 'Bo_mau_bieu_NOXH_day_du_theo_doi_tuong.zip', zip: true },
  donNd136: { ten: 'Mẫu số 01 - Đơn đăng ký mua nhà (DOCX)', moTa: 'Đơn đăng ký mua/thuê mua/thuê NOXH', file: NOXH_FORMS_RELEASE + 'Don_dang_ky_mua_thue_mua_thue_NOXH_ND136_2026.docx' },
  mau01a: { ten: 'Mẫu 01a - Xác nhận đối tượng & thu nhập', moTa: 'Dành cho người có đơn vị công tác/doanh nghiệp xác nhận', file: NOXH_FORMS_RELEASE + 'Mau_01a_Giay_xac_nhan_doi_tuong_thu_nhap_NOXH.docx' },
  mau02: { ten: 'Mẫu 02 - Chưa có nhà ở', moTa: 'Xác nhận điều kiện nhà ở khi chưa có nhà', file: NOXH_FORMS_RELEASE + 'Mau_02_Giay_xac_nhan_dieu_kien_nha_o_chua_co_nha.docx' },
  mau03: { ten: 'Mẫu 03 - Nhà ở dưới 15m2/người', moTa: 'Xác nhận điều kiện nhà ở khi diện tích bình quân thấp', file: 'Mau_03_Giay_xac_nhan_dieu_kien_nha_o_duoi_15m2.docx' },
  mau05: { ten: 'Mẫu 05 - Thu nhập lao động tự do', moTa: 'Đơn đề nghị xác nhận thu nhập cho lao động tự do', file: NOXH_FORMS_RELEASE + 'Mau_05_Don_de_nghi_xac_nhan_thu_nhap_lao_dong_tu_do.docx' },
  salary12: { ten: 'Bảng lương 12 tháng (Excel, tham khảo)', moTa: 'Mẫu tham khảo để cơ quan/công ty xác nhận, định dạng XLSX', file: NOXH_FORMS_RELEASE + 'Bang_luong_mau_tham_khao.xlsx' },
  commitment: { ten: 'Bản cam kết hồ sơ NOXH', moTa: 'Mẫu cam kết thông tin hồ sơ', file: NOXH_FORMS_RELEASE + 'Ban_cam_ket_ho_so_NOXH.docx' },
};

const NOXH_PROFILE_GROUPS = [
  {
    id: 'dn-married',
    stt: '01',
    title: 'Đã kết hôn, 2 vợ chồng làm doanh nghiệp',
    badge: 'Đã kết hôn - 2 người có đơn vị công tác',
    roles: ['Người đứng đơn: có đơn vị công tác/doanh nghiệp', 'Vợ/chồng: có đơn vị công tác/doanh nghiệp'],
    downloads: ['zipGroup01', 'donNd136', 'mau01a', 'mau02', 'mau03', 'salary12', 'commitment'],
    items: [
      ['Đơn đăng ký mua nhà ở xã hội', '01 bản', 'Người đứng tên HĐ', 'Không xác nhận', 'Mẫu số 01 - Phụ lục Nghị định 136/2026/NĐ-CP', 'Kiểm tra người đứng đơn kê khai đầy đủ thông tin vợ/chồng, nơi làm việc của từng người, thông tin cư trú, CCCD, tình trạng hôn nhân. Đối chiếu với toàn bộ hồ sơ.'],
      ['Xác nhận đối tượng, thu nhập mua nhà', '02 bản', 'Hai vợ chồng', 'Công ty/cơ quan/đơn vị đang làm việc của từng người', 'Mẫu số 01a - Thông tư 32/2025/TT-BXD, được sửa đổi bởi Thông tư 08/2026/TT-BXD', 'Kiểm tra mỗi người có 01 mẫu xác nhận riêng do đúng đơn vị đang làm việc xác nhận. Mẫu phải có đủ thông tin đối tượng, thu nhập bình quân tháng, chữ ký, chức danh và dấu đơn vị.'],
      ['Xác nhận điều kiện nhà ở', '02 bản hoặc 01 bản ghi đủ cả hai vợ chồng', 'Hai vợ chồng', 'Cơ quan có thẩm quyền cấp Giấy chứng nhận/VPĐKĐĐ tại tỉnh, thành phố nơi có dự án', 'Mẫu số 02 nếu chưa có nhà ở; Mẫu số 03 nếu có nhà nhưng diện tích bình quân thấp hơn quy định', 'Kiểm tra điều kiện nhà ở của cả vợ và chồng. Nếu xác nhận chung thì phải ghi đủ thông tin cả hai; nếu xác nhận riêng thì mỗi người phải có 01 giấy hợp lệ.'],
      ['Bảng xác nhận tiền lương 12 tháng liền kề', '02 bản', 'Hai vợ chồng', 'Công ty/cơ quan/đơn vị đang làm việc của từng người', 'Không có mẫu pháp luật riêng; dùng bảng xác nhận lương nội bộ của từng đơn vị hoặc mẫu chủ đầu tư ban hành', 'Kiểm tra mỗi người đủ bảng lương 12 tháng liền kề. Cộng bình quân thu nhập tháng của hai vợ chồng để đối chiếu trần thu nhập. Nếu tổng vượt mức trần thì hồ sơ không đủ điều kiện thu nhập.'],
      ['CCCD công chứng/chứng thực', 'Theo số người có tên trong CT07 đã có CCCD', 'Hai vợ chồng và người liên quan nếu có', 'Cơ quan chứng thực hoặc đối chiếu bản gốc', 'Không có mẫu riêng', 'Kiểm tra CCCD của cả vợ và chồng. Đối chiếu số CCCD với giấy đăng ký kết hôn, CT07, xác nhận công ty, bảng lương, xác nhận nhà ở.'],
      ['Xác nhận thông tin cư trú CT07', '01-02 bản', 'Hai vợ chồng', 'Công an cấp xã/cơ quan đăng ký cư trú', 'Mẫu CT07 theo quy định cư trú', 'Nếu cùng cư trú, kiểm tra CT07 có thể hiện đủ hai vợ chồng. Nếu khác nơi cư trú, phải có CT07 riêng của từng người. Địa chỉ phải thống nhất với các giấy xác nhận liên quan.'],
      ['Giấy đăng ký kết hôn', '01 bản', 'Hai vợ chồng', 'UBND cấp xã/phường nơi đăng ký hộ tịch', 'Bản sao chứng thực hoặc bản photo kèm bản gốc đối chiếu', 'Kiểm tra thông tin vợ chồng khớp CCCD. Không nên thu bản gốc, chỉ thu bản sao chứng thực hoặc photo kèm bản gốc đối chiếu.'],
      ['Bản cam kết', '01 bản', 'Người đứng tên HĐ; khuyến nghị vợ/chồng cùng ký', 'Không xác nhận', 'Mẫu cam kết nội bộ của chủ đầu tư/sàn', 'Kiểm tra cam kết đầy đủ về điều kiện nhà ở, thu nhập, chưa được mua/thuê mua nhà ở xã hội, chưa hưởng chính sách hỗ trợ nhà ở và chịu trách nhiệm pháp lý nếu kê khai sai.'],
    ],
  },
  {
    id: 'dn-single',
    stt: '02',
    title: 'Độc thân, làm doanh nghiệp',
    badge: 'Độc thân - có đơn vị công tác',
    roles: ['Người đứng đơn: độc thân, có đơn vị công tác/doanh nghiệp'],
    downloads: ['zipGroup02', 'donNd136', 'mau01a', 'mau02', 'mau03', 'salary12', 'commitment'],
    items: [
      ['Đơn đăng ký mua nhà ở xã hội', '01 bản', 'Người đứng tên HĐ', 'Không xác nhận', 'Mẫu số 01 - Phụ lục Nghị định 136/2026/NĐ-CP', 'Kiểm tra đúng mẫu, đầy đủ thông tin người đứng đơn, nơi làm việc, địa chỉ cư trú, CCCD, tình trạng hôn nhân. Đối chiếu với CCCD, CT07, xác nhận công ty và giấy xác nhận tình trạng hôn nhân.'],
      ['Xác nhận đối tượng, thu nhập mua nhà', '01 bản', 'Người đứng tên HĐ', 'Công ty/cơ quan/đơn vị đang làm việc', 'Mẫu số 01a - Phụ lục I Thông tư 32/2025/TT-BXD, được sửa đổi bởi Thông tư 08/2026/TT-BXD', 'Kiểm tra mẫu có đủ phần xác nhận đối tượng và thu nhập. Đơn vị xác nhận phải là nơi khách hàng đang làm việc, có chữ ký người đại diện có thẩm quyền, chức danh, dấu doanh nghiệp/cơ quan. Mức thu nhập bình quân tháng phải không vượt trần theo quy định.'],
      ['Xác nhận điều kiện nhà ở', '01 bản', 'Người đứng tên HĐ', 'Cơ quan có thẩm quyền cấp Giấy chứng nhận/VPĐKĐĐ tại tỉnh, thành phố nơi có dự án', 'Mẫu số 02 nếu chưa có nhà ở; Mẫu số 03 nếu có nhà nhưng diện tích bình quân thấp hơn quy định', 'Kiểm tra xác nhận đúng người đứng đơn, đúng tỉnh/thành phố nơi có dự án. Nội dung phải kết luận rõ chưa có nhà ở hoặc đủ điều kiện diện tích nhà ở. Không chấp nhận giấy ghi chung chung, thiếu kết luận hoặc thiếu dấu xác nhận.'],
      ['Bảng xác nhận tiền lương 12 tháng liền kề trước tháng nộp hồ sơ', '01 bản', 'Người đứng tên HĐ', 'Công ty/cơ quan/đơn vị đang làm việc', 'Không có mẫu pháp luật riêng; dùng bảng xác nhận lương nội bộ của đơn vị hoặc mẫu chủ đầu tư ban hành kèm hồ sơ', 'Kiểm tra đủ 12 tháng liền kề, có thu nhập từng tháng, tổng thu nhập và bình quân tháng. Số liệu phải thống nhất với Mẫu số 01a. Nếu Mẫu số 01a đã xác nhận rõ thu nhập bình quân thì bảng lương là tài liệu đối chiếu/tăng tính thuyết phục, không được mâu thuẫn với mẫu xác nhận chính.'],
      ['CCCD công chứng/chứng thực', 'Theo số người có tên trong CT07 đã có CCCD', 'Người đứng tên và người có liên quan trong CT07 nếu có', 'Cơ quan chứng thực hoặc đối chiếu bản gốc', 'Không có mẫu riêng', 'Đối chiếu họ tên, số CCCD, ngày sinh với đơn đăng ký, CT07, xác nhận công ty, bảng lương và giấy tình trạng hôn nhân.'],
      ['Xác nhận thông tin cư trú CT07', '01 bản', 'Người đứng tên HĐ', 'Công an cấp xã/cơ quan đăng ký cư trú', 'Mẫu CT07 theo quy định cư trú', 'Kiểm tra bản gốc/bản điện tử hợp lệ, còn giá trị, thể hiện đúng nơi thường trú/tạm trú/nơi ở hiện tại. Địa chỉ phải thống nhất với các giấy xác nhận khác.'],
      ['Giấy xác nhận tình trạng hôn nhân', '01 bản gốc', 'Người đứng tên HĐ', 'UBND cấp xã/phường', 'Mẫu giấy xác nhận tình trạng hôn nhân theo quy định hộ tịch', 'Kiểm tra giấy còn thời hạn, đúng tình trạng độc thân/chưa kết hôn, đúng thông tin CCCD và mục đích sử dụng.'],
      ['Bản cam kết', '01 bản', 'Người đứng tên HĐ', 'Không xác nhận', 'Mẫu cam kết nội bộ của chủ đầu tư/sàn', 'Kiểm tra chữ ký, họ tên, ngày tháng. Nội dung cam kết đầy đủ về đối tượng, điều kiện nhà ở, thu nhập, chưa hưởng chính sách nhà ở xã hội và chịu trách nhiệm pháp lý nếu kê khai sai.'],
    ],
  },
  {
    id: 'free-married',
    stt: '03',
    title: 'Đã kết hôn, 2 vợ chồng làm lao động tự do',
    badge: 'Đã kết hôn - 2 người lao động tự do',
    roles: ['Người đứng đơn: lao động tự do', 'Vợ/chồng: lao động tự do'],
    downloads: ['zipGroup03', 'donNd136', 'mau05', 'mau02', 'mau03', 'commitment'],
    items: [
      ['Đơn đăng ký mua nhà ở xã hội', '01 bản', 'Người đứng tên HĐ', 'Không xác nhận', 'Mẫu số 01 - Phụ lục Nghị định 136/2026/NĐ-CP', 'Kiểm tra thông tin người đứng đơn và thông tin vợ/chồng phải được kê khai đầy đủ. Đối chiếu với CCCD hai vợ chồng, giấy đăng ký kết hôn, CT07 và các giấy xác nhận nhà ở, thu nhập.'],
      ['Xác nhận điều kiện nhà ở', '02 bản hoặc 01 bản ghi đủ cả hai vợ chồng', 'Hai vợ chồng', 'Cơ quan có thẩm quyền cấp Giấy chứng nhận/VPĐKĐĐ tại tỉnh, thành phố nơi có dự án', 'Mẫu số 02 nếu chưa có nhà ở; Mẫu số 03 nếu có nhà nhưng diện tích bình quân thấp hơn quy định', 'Bắt buộc kiểm tra điều kiện nhà ở của cả vợ và chồng. Nếu giấy xác nhận chỉ có người đứng đơn mà không có vợ/chồng thì chưa đủ hồ sơ. Nội dung phải kết luận rõ cả hai vợ chồng chưa có nhà ở hoặc đủ điều kiện diện tích.'],
      ['Xác nhận đối tượng và điều kiện thu nhập', '02 bản', 'Hai vợ chồng', 'Công an cấp xã nơi thường trú/tạm trú/nơi ở hiện tại của từng người', 'Mẫu số 05 - Thông tư 08/2026/TT-BXD', 'Kiểm tra từng người thuộc nhóm lao động tự do/thu nhập thấp đô thị, không có HĐLĐ, không hưởng lương hưu và kê khai thu nhập bình quân tháng thực nhận. Cộng thu nhập bình quân tháng của cả hai vợ chồng để đối chiếu mức trần thu nhập của người đã kết hôn.'],
      ['CCCD công chứng/chứng thực', 'Theo số người có tên trong CT07 của vợ/chồng đã có CCCD', 'Hai vợ chồng và người liên quan trong CT07 nếu có', 'Cơ quan chứng thực hoặc đối chiếu bản gốc', 'Không có mẫu riêng', 'Kiểm tra CCCD của cả vợ và chồng. Đối chiếu với giấy đăng ký kết hôn, CT07, xác nhận nhà ở và xác nhận thu nhập.'],
      ['Xác nhận thông tin cư trú CT07', '01-02 bản', 'Hai vợ chồng', 'Công an cấp xã/cơ quan đăng ký cư trú', 'Mẫu CT07 theo quy định cư trú', 'Nếu vợ chồng cùng cư trú và thể hiện trong một CT07 thì có thể dùng 01 bản. Nếu khác nơi cư trú thì phải có CT07 riêng của từng người. Kiểm tra địa chỉ, số CCCD, tình trạng cư trú thống nhất với hồ sơ.'],
      ['Giấy đăng ký kết hôn', '01 bản', 'Hai vợ chồng', 'UBND cấp xã/phường nơi đăng ký hộ tịch', 'Bản sao chứng thực hoặc bản photo kèm bản gốc đối chiếu', 'Kiểm tra họ tên, ngày sinh, số giấy tờ của hai vợ chồng khớp CCCD. Không nên thu bản gốc của khách hàng, chỉ đối chiếu hoặc thu bản sao chứng thực.'],
      ['Bản cam kết', '01 bản', 'Người đứng tên HĐ; khuyến nghị cả vợ/chồng cùng ký', 'Không xác nhận', 'Mẫu cam kết nội bộ của chủ đầu tư/sàn', 'Kiểm tra nội dung cam kết bao gồm cả hai vợ chồng về việc chưa có nhà ở/đủ điều kiện nhà ở, thu nhập không vượt trần, chưa mua/thuê mua nhà ở xã hội, chưa hưởng chính sách hỗ trợ nhà ở.'],
    ],
  },
  {
    id: 'free-single',
    stt: '04',
    title: 'Độc thân, lao động tự do',
    badge: 'Độc thân - lao động tự do',
    roles: ['Người đứng đơn: độc thân, lao động tự do'],
    downloads: ['zipGroup04', 'donNd136', 'mau05', 'mau02', 'mau03', 'commitment'],
    items: [
      ['Đơn đăng ký mua nhà ở xã hội', '01 bản', 'Người đứng tên HĐ', 'Không xác nhận', 'Mẫu số 01 - Phụ lục Nghị định 136/2026/NĐ-CP', 'Kiểm tra đơn đúng mẫu, tích đúng nhu cầu “mua nhà ở xã hội”, ghi đầy đủ thông tin cá nhân, CCCD, địa chỉ cư trú, nghề nghiệp, tình trạng hôn nhân, thông tin dự án/căn hộ đăng ký. Đối chiếu họ tên, ngày sinh, CCCD, địa chỉ với CCCD, CT07, giấy xác nhận tình trạng hôn nhân và các giấy xác nhận khác. Đơn phải có chữ ký, ghi rõ họ tên, không tẩy xóa, không bỏ trống mục bắt buộc.'],
      ['Xác nhận điều kiện nhà ở', '01 bản', 'Người đứng tên HĐ', 'Cơ quan có thẩm quyền cấp Giấy chứng nhận/VPĐKĐĐ tại tỉnh, thành phố nơi có dự án', 'Mẫu số 02 - Thông tư 08/2026/TT-BXD nếu chưa có nhà ở; Mẫu số 03 - Thông tư 05/2024/TT-BXD nếu có nhà nhưng diện tích bình quân thấp hơn quy định', 'Kiểm tra giấy xác nhận đúng mẫu, đúng cơ quan xác nhận, có chữ ký và dấu. Nội dung phải thể hiện người đứng đơn chưa có nhà ở thuộc sở hữu tại tỉnh/thành phố nơi có dự án, hoặc có nhà nhưng diện tích bình quân đầu người thấp hơn mức quy định. Thông tin người kê khai phải trùng CCCD và CT07.'],
      ['Xác nhận đối tượng và điều kiện thu nhập', '01 bản', 'Người đứng tên HĐ', 'Công an cấp xã nơi thường trú/tạm trú/nơi ở hiện tại', 'Mẫu số 05 - Thông tư 08/2026/TT-BXD', 'Kiểm tra người mua thuộc nhóm người thu nhập thấp tại khu vực đô thị, không có HĐLĐ, không hưởng lương hưu; có phần tự cam kết thu nhập bình quân hàng tháng thực nhận và xác nhận của Công an cấp xã. Đối với người độc thân, thu nhập bình quân tháng không vượt quá mức trần theo quy định hiện hành.'],
      ['CCCD công chứng/chứng thực', 'Theo số người có tên trong CT07 đã có CCCD', 'Người đứng tên và người có liên quan trong CT07 nếu có', 'Cơ quan chứng thực hoặc đối chiếu bản gốc', 'Không có mẫu riêng; dùng bản sao chứng thực CCCD/căn cước', 'Kiểm tra CCCD rõ ảnh, rõ số định danh, ngày sinh, giới tính, địa chỉ. Đối chiếu số CCCD trên toàn bộ hồ sơ. Nếu CCCD mờ, sai số, sai ngày sinh hoặc không thống nhất với giấy xác nhận khác thì yêu cầu bổ sung.'],
      ['Xác nhận thông tin cư trú CT07', '01 bản', 'Người đứng tên HĐ', 'Công an cấp xã/cơ quan đăng ký cư trú', 'Mẫu CT07 theo quy định cư trú', 'Kiểm tra CT07 là bản gốc hoặc bản điện tử hợp lệ, còn giá trị sử dụng. Nội dung phải thể hiện nơi thường trú, tạm trú hoặc nơi ở hiện tại. Địa chỉ trên CT07 phải thống nhất với đơn đăng ký, giấy xác nhận thu nhập và giấy xác nhận tình trạng hôn nhân.'],
      ['Giấy xác nhận tình trạng hôn nhân', '01 bản gốc', 'Người đứng tên HĐ', 'UBND cấp xã/phường', 'Mẫu giấy xác nhận tình trạng hôn nhân theo quy định hộ tịch', 'Kiểm tra giấy còn thời hạn, ghi đúng tình trạng độc thân/chưa đăng ký kết hôn, đúng họ tên, CCCD, ngày sinh. Mục đích sử dụng nên ghi để đăng ký mua nhà ở xã hội hoặc mục đích phù hợp. Nếu từng ly hôn hoặc vợ/chồng đã mất thì yêu cầu bổ sung quyết định ly hôn/giấy chứng tử. Thời hạn xác nhận không quá 6 tháng.'],
      ['Bản cam kết', '01 bản', 'Người đứng tên HĐ', 'Không xác nhận', 'Mẫu cam kết nội bộ của chủ đầu tư/sàn', 'Kiểm tra người đứng đơn ký, ghi rõ họ tên. Nội dung phải cam kết kê khai trung thực, chưa mua/thuê mua nhà ở xã hội, chưa hưởng chính sách hỗ trợ nhà ở, đáp ứng điều kiện nhà ở và thu nhập, chịu trách nhiệm nếu kê khai sai.'],
    ],
  },
  {
    id: 'mix-married',
    stt: '05',
    title: 'Đã kết hôn, 1 người làm doanh nghiệp, 1 người lao động tự do',
    badge: 'Đã kết hôn - 1 người DN + 1 người tự do',
    mixed: true,
    downloads: ['zipGroup05', 'donNd136', 'mau01a', 'mau05', 'mau02', 'mau03', 'salary12', 'commitment'],
    items: [
      ['Đơn đăng ký mua nhà ở xã hội', '01 bản', 'Người đứng tên HĐ', 'Không xác nhận', 'Mẫu số 01 - Phụ lục Nghị định 136/2026/NĐ-CP', 'Kiểm tra đầy đủ thông tin người đứng đơn và vợ/chồng. Xác định rõ ai là người làm doanh nghiệp, ai là lao động tự do để kiểm đúng mẫu thu nhập.'],
      ['Xác nhận đối tượng, thu nhập của người làm doanh nghiệp', '01 bản', 'Người làm doanh nghiệp/cơ quan/đơn vị', 'Công ty/cơ quan/đơn vị đang làm việc', 'Mẫu số 01a - Thông tư 32/2025/TT-BXD, được sửa đổi bởi Thông tư 08/2026/TT-BXD', 'Kiểm tra đơn vị xác nhận đúng nơi làm việc, có dấu, chữ ký, chức danh người xác nhận. Mẫu phải thể hiện người lao động thuộc đối tượng được hưởng chính sách và có thu nhập bình quân tháng thực nhận.'],
      ['Xác nhận điều kiện nhà ở', '02 bản hoặc 01 bản ghi đủ cả hai vợ chồng', 'Hai vợ chồng', 'Cơ quan có thẩm quyền cấp Giấy chứng nhận/VPĐKĐĐ tại tỉnh, thành phố nơi có dự án', 'Mẫu số 02 nếu chưa có nhà ở; Mẫu số 03 nếu có nhà nhưng diện tích bình quân thấp hơn quy định', 'Kiểm tra cả vợ và chồng. Nếu thiếu xác nhận của một trong hai người thì hồ sơ chưa đủ điều kiện. Nội dung xác nhận phải rõ ràng, đúng tỉnh/thành phố nơi có dự án.'],
      ['Xác nhận điều kiện thu nhập của người lao động tự do', '01 bản', 'Người lao động tự do', 'Công an cấp xã nơi thường trú/tạm trú/nơi ở hiện tại', 'Mẫu số 05 - Thông tư 08/2026/TT-BXD', 'Kiểm tra người lao động tự do kê khai thu nhập bình quân tháng thực nhận, có xác nhận Công an cấp xã. Cộng với thu nhập của người làm doanh nghiệp để kiểm mức trần của vợ chồng.'],
      ['Bảng xác nhận tiền lương 12 tháng liền kề của người làm doanh nghiệp', '01 bản', 'Người làm doanh nghiệp/cơ quan/đơn vị', 'Công ty/cơ quan/đơn vị đang làm việc', 'Không có mẫu pháp luật riêng; dùng bảng xác nhận lương nội bộ của đơn vị hoặc mẫu chủ đầu tư ban hành', 'Kiểm tra đủ 12 tháng liền kề, có thu nhập từng tháng và bình quân tháng. Số liệu phải khớp với Mẫu số 01a. Nếu có tháng nghỉ việc, nghỉ không lương, nghỉ thai sản hoặc chuyển công ty thì yêu cầu xác nhận/giải trình rõ.'],
      ['CCCD công chứng/chứng thực', 'Theo số người có tên trong CT07 của vợ/chồng đã có CCCD', 'Hai vợ chồng và người liên quan nếu có', 'Cơ quan chứng thực hoặc đối chiếu bản gốc', 'Không có mẫu riêng', 'Đối chiếu CCCD của cả hai vợ chồng với giấy đăng ký kết hôn, CT07, xác nhận nhà ở, xác nhận thu nhập và bảng lương.'],
      ['Xác nhận thông tin cư trú CT07', '01-02 bản', 'Hai vợ chồng', 'Công an cấp xã/cơ quan đăng ký cư trú', 'Mẫu CT07 theo quy định cư trú', 'Nếu hai vợ chồng cùng cư trú thì có thể dùng 01 CT07 thể hiện cả hai. Nếu khác nơi cư trú thì cần CT07 riêng. Đối chiếu địa chỉ với nơi xin xác nhận thu nhập của người lao động tự do.'],
      ['Giấy đăng ký kết hôn', '01 bản', 'Hai vợ chồng', 'UBND cấp xã/phường nơi đăng ký hộ tịch', 'Bản sao chứng thực hoặc bản photo kèm bản gốc đối chiếu', 'Kiểm tra thông tin vợ chồng khớp CCCD và đơn đăng ký. Nếu giấy mờ, sai thông tin hoặc không rõ cơ quan cấp thì yêu cầu trích lục/bản sao chứng thực mới.'],
      ['Bản cam kết', '01 bản', 'Người đứng tên HĐ; khuyến nghị vợ/chồng cùng ký', 'Không xác nhận', 'Mẫu cam kết nội bộ của chủ đầu tư/sàn', 'Kiểm tra nội dung cam kết áp dụng cho cả hai vợ chồng, bao gồm điều kiện nhà ở, thu nhập, chưa hưởng chính sách nhà ở xã hội và chịu trách nhiệm nếu kê khai sai.'],
    ],
  },
];

const BLOG_BAI_VIET_MAC_DINH = [
  {
    id: 'cap-nhat-quy-can-072026',
    tieuDe: 'Cập nhật Quỹ căn và chính sách bán hàng tháng 07/2026',
    tomTat: 'Cập nhật quỹ căn Thống Nhất Smart City đang mở bán tại các tòa D, E, H, I, J, O, kèm giá công bố và lưu ý chuẩn bị hồ sơ.',
    ngay: '2026-07-06',
    nhan: 'Bán hàng',
    href: 'gioi-thieu.html?blog=cap-nhat-quy-can-072026',
    noiBat: true,
    sections: [
      {
        kind: 'sales-update',
        badge: 'Đang mở bán',
        tieuDe: 'Điểm mới cần biết trong tháng 07/2026',
        moTa: 'Thống Nhất Smart City đang cập nhật quỹ căn mở bán tại các tòa D, E, H, I, J, O. Khách hàng nên chọn tòa/căn quan tâm, đối chiếu diện tích, tầng, hướng và chuẩn bị đúng bộ hồ sơ nhà ở xã hội theo nhóm đối tượng.',
        links: [],
        stats: [
          { icon: 'fa-building-circle-check', value: '296 căn', label: 'Quỹ căn đang cập nhật', desc: 'Tổng hợp từ bảng hàng các tòa D, E, H, I, J, O.' },
          { icon: 'fa-city', value: '06 tòa', label: 'D, E, H, I, J, O', desc: 'Các tòa đang mở bán/cập nhật bảng hàng trong tháng 07/2026.' },
          { icon: 'fa-house-circle-check', value: '1.029 căn', label: 'Quy mô từng được công bố', desc: 'Theo thông tin công khai về đợt mở bán Thống Nhất Smart City.' },
          { icon: 'fa-calendar-check', value: '12/2026', label: 'Dự kiến hoàn thành tổng thể', desc: 'Mốc tiến độ được công bố cho toàn dự án.' },
        ],
        timeline: [
          { date: 'Đang mở bán', title: 'Tòa D, E, H, I, J, O', desc: 'Các tòa có quỹ căn đang được cập nhật theo bảng hàng 2026.' },
          { date: 'Bước 1', title: 'Chọn tòa và mã căn quan tâm', desc: 'Đối chiếu diện tích, tầng, hướng, loại căn và trạng thái còn trống.' },
          { date: 'Bước 2', title: 'Chuẩn bị đúng bộ hồ sơ', desc: 'Xác định nhóm đối tượng trong Tin tức 2 để tải bộ hồ sơ phù hợp.' },
          { date: 'Bước 3', title: 'Kiểm tra trước khi nộp', desc: 'Dùng công cụ ở Tin tức 3 để rà soát giấy tờ còn thiếu hoặc cần chỉnh sửa.' },
        ],
      },
      {
        kind: 'sales-pricing',
        tieuDe: 'Giá bán và quỹ căn theo tòa',
        moTa: 'Giá công bố của Thống Nhất Smart City dao động khoảng 16,1-16,7 triệu đồng/m2 tùy loại căn và vị trí. Giá thực tế từng căn cần đối chiếu theo mã căn, diện tích, tầng, hướng và bảng hàng từng tòa.',
        links: [],
        groups: [
          {
            icon: 'fa-tags',
            title: 'Giá bán công bố Thống Nhất Smart City',
            desc: 'Mức giá tham khảo công khai, đã gồm VAT 5% và phí bảo trì 2% theo thông tin báo chí/nguồn công bố.',
            rows: [
              ['Căn thường', '16.442.701 đồng/m2', 'Theo giá công bố'],
              ['Căn góc', '16.771.555 đồng/m2', 'Theo giá công bố'],
              ['Căn cạnh cầu thang', '16.113.847 đồng/m2', 'Theo giá công bố'],
            ],
          },
          {
            icon: 'fa-building',
            title: 'Quỹ căn theo tòa đang mở bán',
            desc: 'Tổng hợp từ bảng hàng 2026 hiện có trên hệ thống.',
            rows: [
              ['Tòa D', '39 căn', 'Đang cập nhật bảng hàng'],
              ['Tòa E', '27 căn', 'Đang cập nhật bảng hàng'],
              ['Tòa H', '48 căn', 'Đang cập nhật bảng hàng'],
              ['Tòa I', '53 căn', 'Đang cập nhật bảng hàng'],
              ['Tòa J', '41 căn', 'Đang cập nhật bảng hàng'],
              ['Tòa O', '88 căn', 'Đang cập nhật bảng hàng'],
            ],
          },
        ],
        notes: [
          { icon: 'fa-map-location-dot', title: 'Chọn đúng tòa đang mở bán', desc: 'Quỹ căn hiện tập trung tại các tòa D, E, H, I, J và O.' },
          { icon: 'fa-ruler-combined', title: 'Giá theo từng mã căn', desc: 'Cùng một tòa vẫn có thể khác nhau theo diện tích, tầng, hướng và vị trí căn.' },
          { icon: 'fa-file-circle-check', title: 'Hồ sơ nên chuẩn bị', desc: 'Sau khi chọn căn, hãy dùng Tin tức 2 và Tin tức 3 để tải và kiểm tra bộ hồ sơ phù hợp.' },
        ],
      },
    ],
    nguonThamKhao: NOXH_NGUON_THAM_KHAO_CHINH_THONG,
  },
  {
    id: 'huong-dan-ho-so-nha-o-xa-hoi',
    tieuDe: 'Hướng dẫn hồ sơ mua nhà ở xã hội mới nhất',
    tomTat: 'Tổng hợp đầy đủ điều kiện, quy trình, biểu mẫu và các văn bản pháp lý mới nhất dành cho người mua nhà ở xã hội.',
    ngay: '2026-07-11',
    nhan: 'Hồ sơ',
    href: 'gioi-thieu.html?blog=huong-dan-ho-so-nha-o-xa-hoi',
    sections: [
      {
        kind: 'noxh-audience',
        tieuDe: 'Các đối tượng được hưởng chính sách hỗ trợ về nhà ở xã hội',
        moTa: 'Theo Điều 76 Luật Nhà ở 2023, người mua cần thuộc một trong các nhóm đối tượng dưới đây, sau đó tiếp tục đối chiếu điều kiện về nhà ở và thu nhập.',
        links: [],
        cards: [
          { stt: '01', icon: 'fa-award', title: 'Người có công, thân nhân liệt sĩ', desc: 'Nhóm được hỗ trợ cải thiện nhà ở theo chính sách ưu đãi người có công.' },
          { stt: '02', icon: 'fa-house-chimney-user', title: 'Hộ nghèo, cận nghèo nông thôn', desc: 'Hộ gia đình thuộc diện nghèo hoặc cận nghèo tại khu vực nông thôn.' },
          { stt: '03', icon: 'fa-cloud-showers-heavy', title: 'Hộ nông thôn vùng thiên tai', desc: 'Hộ nghèo, cận nghèo ở khu vực thường xuyên chịu ảnh hưởng thiên tai, biến đổi khí hậu.' },
          { stt: '04', icon: 'fa-city', title: 'Hộ nghèo, cận nghèo đô thị', desc: 'Hộ gia đình thuộc diện nghèo hoặc cận nghèo tại khu vực đô thị.' },
          { stt: '05', icon: 'fa-wallet', title: 'Người thu nhập thấp đô thị', desc: 'Cá nhân, hộ gia đình có thu nhập trong ngưỡng chính sách tại khu vực đô thị.' },
          { stt: '06', icon: 'fa-helmet-safety', title: 'Công nhân, người lao động', desc: 'Người làm việc tại doanh nghiệp, hợp tác xã, liên hiệp hợp tác xã trong hoặc ngoài khu công nghiệp.' },
          { stt: '07', icon: 'fa-shield-halved', title: 'Lực lượng vũ trang, cơ yếu', desc: 'Sĩ quan, quân nhân chuyên nghiệp, công an, công chức/viên chức quốc phòng và người làm công tác cơ yếu.' },
          { stt: '08', icon: 'fa-briefcase', title: 'Cán bộ, công chức, viên chức', desc: 'Người đang làm việc theo quy định pháp luật về cán bộ, công chức, viên chức.' },
          { stt: '09', icon: 'fa-key', title: 'Người đã trả lại nhà công vụ', desc: 'Trường hợp đã hoàn trả nhà ở công vụ theo quy định, không thuộc diện bị thu hồi do vi phạm.' },
          { stt: '10', icon: 'fa-map-location-dot', title: 'Hộ bị thu hồi đất, giải tỏa', desc: 'Hộ gia đình, cá nhân bị thu hồi đất, giải tỏa, phá dỡ nhà mà chưa được bồi thường bằng nhà hoặc đất ở.' },
          { stt: '11', icon: 'fa-graduation-cap', title: 'Học sinh, sinh viên', desc: 'Học sinh, sinh viên đại học, cao đẳng, dạy nghề, trường chuyên biệt và trường dân tộc nội trú công lập.' },
          { stt: '12', icon: 'fa-industry', title: 'Doanh nghiệp, hợp tác xã trong KCN', desc: 'Đơn vị trong khu công nghiệp thuộc nhóm được hưởng chính sách hỗ trợ theo quy định.' },
        ],
      },
      {
        kind: 'noxh-condition',
        tieuDe: 'Điều kiện mua nhà ở xã hội',
        moTa: 'Có thể tự kiểm tra theo ba lớp điều kiện: đúng nhóm đối tượng, phù hợp điều kiện nhà ở và nằm trong ngưỡng thu nhập áp dụng.',
        links: [],
        steps: [
          { icon: 'fa-id-card-clip', title: '1. Đúng nhóm đối tượng', desc: 'Người mua thuộc một trong 12 nhóm được hưởng chính sách hỗ trợ về nhà ở xã hội.', points: ['Xác định theo tình trạng thực tế tại thời điểm nộp hồ sơ.', 'Giấy xác nhận đối tượng sẽ khác nhau theo nhóm làm doanh nghiệp, lao động tự do hoặc nhóm chính sách.'] },
          { icon: 'fa-house-circle-check', title: '2. Điều kiện về nhà ở', desc: 'Chưa có nhà ở tại tỉnh/thành phố nơi có dự án, hoặc có nhà nhưng không đáp ứng diện tích/khoảng cách theo quy định.', points: ['Đối chiếu theo thông tin sở hữu nhà, đất và giấy chứng nhận.', 'Khoảng cách được tính theo thực tế di chuyển bằng đường bộ khi áp dụng.'] },
          { icon: 'fa-coins', title: '3. Điều kiện về thu nhập', desc: 'Thu nhập bình quân tháng phải nằm trong ngưỡng chính sách đang áp dụng.', points: ['Người có hợp đồng lao động dùng xác nhận thu nhập từ đơn vị công tác.', 'Lao động tự do kê khai theo mẫu và xin xác nhận theo hướng dẫn mới.'] },
        ],
        incomes: [
          { icon: 'fa-user', title: 'Cá nhân độc thân', amount: 'Không quá 25 triệu đồng/tháng' },
          { icon: 'fa-child-reaching', title: 'Độc thân nuôi con dưới 18 tuổi', amount: 'Không quá 35 triệu đồng/tháng' },
          { icon: 'fa-people-roof', title: 'Vợ chồng', amount: 'Tổng thu nhập không quá 50 triệu đồng/tháng' },
        ],
        notes: [
          'Cập nhật nội dung hướng dẫn đến ngày 11/07/2026 theo Luật Nhà ở 2023, Nghị định 100/2024/NĐ-CP và các văn bản sửa đổi hiện hành.',
          'Bộ Xây dựng hướng dẫn giấy tờ chứng minh đối tượng, điều kiện hưởng chính sách theo Điều 6, Điều 7, Điều 8 và Phụ lục I của Thông tư 05/2024/TT-BXD, đã được sửa đổi bổ sung bởi Thông tư 32/2025/TT-BXD và Thông tư 08/2026/TT-BXD.',
          'Mức thu nhập nêu trên áp dụng theo Nghị định 136/2026/NĐ-CP, có hiệu lực từ 07/04/2026.',
          'Trường hợp lực lượng vũ trang được xác định theo quy định riêng của Bộ Quốc phòng hoặc Bộ Công an.',
          'Nếu là lao động tự do, nên chuẩn bị trước mẫu xác nhận thu nhập để tránh bổ sung nhiều lần.',
          'Thông tin dự án, thời gian nhận hồ sơ và số lượng căn được công bố theo từng đợt tiếp nhận.',
        ],
      },
    ],
    vanBanPhapLy: BLOG_VAN_BAN_MAC_DINH,
    taiLieu: BLOG_TAI_LIEU_MAC_DINH,
    tool: 'noxh-profile-selector',
    nguonThamKhao: NOXH_NGUON_THAM_KHAO_CHINH_THONG,
  },
  {
    id: 'kiem-tra-ho-so-khach-hang',
    tieuDe: 'Kiểm tra hồ sơ khách hàng',
    tomTat: 'Kiểm tra nhanh hồ sơ hiện có, xác định các giấy tờ còn thiếu và chuẩn bị đầy đủ trước khi nộp hồ sơ mua nhà.',
    ngay: '2026-07-04',
    nhan: 'Kiểm tra',
    href: 'gioi-thieu.html?blog=kiem-tra-ho-so-khach-hang',
    sections: [
      {
        kind: 'visual-cards',
        label: 'Quy trình kiểm tra',
        tieuDe: 'Kiểm tra hồ sơ theo đúng nhóm đối tượng',
        moTa: 'Khách hàng chọn một trong 5 nhóm hồ sơ, hệ thống tự hiển thị đúng danh mục giấy tờ cần upload và đối chiếu từng mục trước khi nộp.',
        badge: '5 nhóm hồ sơ',
        cards: [
          { icon: 'fa-user-pen', title: '1. Nhập thông tin người đứng đơn', desc: 'Họ tên, số điện thoại và dự án quan tâm được dùng để tạo phiếu kiểm tra hồ sơ.' },
          { icon: 'fa-users-gear', title: '2. Chọn nhóm đối tượng', desc: 'Chọn đúng nhóm: doanh nghiệp, lao động tự do, độc thân hoặc đã kết hôn.' },
          { icon: 'fa-file-arrow-up', title: '3. Upload từng hồ sơ', desc: 'Mỗi loại giấy tờ có một ô upload riêng để tránh nhầm lẫn hoặc thiếu bản xác nhận.' },
          { icon: 'fa-clipboard-check', title: '4. Nhận báo cáo cần bổ sung', desc: 'Kết quả tách rõ hồ sơ đạt, hồ sơ thiếu, sai định dạng và mục cần kiểm tra lại.' },
        ],
      },
    ],
    tool: 'profile-check',
    nguonThamKhao: NOXH_NGUON_THAM_KHAO_CHINH_THONG,
  },
  {
    id: 'tra-cuu-tien-trinh-phe-duyet-ho-so',
    tieuDe: 'Tra cứu tiến trình phê duyệt hồ sơ mua nhà',
    tomTat: 'Theo dõi trạng thái xử lý hồ sơ theo thời gian thực từ khi tiếp nhận đến khi bàn giao căn hộ.',
    ngay: '2026-07-03',
    nhan: 'Tiến trình',
    href: 'gioi-thieu.html?blog=tra-cuu-tien-trinh-phe-duyet-ho-so',
    sections: [
      {
        kind: 'process-steps',
        label: 'Trình tự tra cứu',
        tieuDe: 'Theo dõi hồ sơ bằng timeline trực quan',
        moTa: 'Khách hàng nhập thông tin tra cứu, sau đó hệ thống hiển thị từng mốc xử lý theo trạng thái rõ ràng để biết hồ sơ đang ở bước nào.',
        steps: [
          { icon: 'fa-inbox', title: 'Tiếp nhận hồ sơ', desc: 'Ghi nhận bộ hồ sơ, biểu mẫu và thông tin căn hộ khách hàng quan tâm.' },
          { icon: 'fa-clipboard-check', title: 'Phê duyệt hồ sơ', desc: 'Theo dõi dữ liệu phê duyệt tương ứng với thông tin tra cứu của khách hàng.' },
          { icon: 'fa-file-signature', title: 'Ký hợp đồng mua bán', desc: 'Thực hiện sau khi hồ sơ đủ điều kiện và căn hộ đủ cơ sở giao dịch.' },
          { icon: 'fa-key', title: 'Bàn giao căn hộ', desc: 'Cập nhật theo tiến độ nghiệm thu, hoàn thiện và kế hoạch bàn giao từng tòa.' },
        ],
      },
    ],
    tool: 'approval-tracker',
    nguonThamKhao: NOXH_NGUON_THAM_KHAO_CHINH_THONG,
  },
];

const SUPPORT_CARD_IMAGES = {
  'tra-cuu-bang-hang-cdt': 'marketing/images/support/bang-hang-cdt-ai-20260707.jpg',
  'huong-dan-ho-so-nha-o-xa-hoi': 'marketing/images/support/ho-so-noxh-ai-20260707.jpg',
  'kiem-tra-ho-so-khach-hang': 'marketing/images/support/kiem-tra-ho-so-ai-20260707.jpg',
  'tra-cuu-tien-trinh-phe-duyet-ho-so': 'marketing/images/support/tien-trinh-ho-so-ai-20260707.jpg',
};

const BANG_HANG_CDT_ITEM = {
  id: 'tra-cuu-bang-hang-cdt',
  tieuDe: 'Tra cứu bảng hàng CĐT',
  tomTat: 'Chọn dự án và tòa đang mở bán để xem mã căn và giá từng căn từ bảng hàng chủ đầu tư.',
  ngay: '2026-07-06',
  nhan: 'Bảng hàng',
  icon: 'fa-table-list',
  anh: SUPPORT_CARD_IMAGES['tra-cuu-bang-hang-cdt'],
};

const HO_TRO_KHACH_HANG_ITEMS = [
  BANG_HANG_CDT_ITEM,
  ...BLOG_BAI_VIET_MAC_DINH.slice(1).map(({ sections, vanBanPhapLy, taiLieu, tool, nguonThamKhao, ...summary }) => ({
    ...summary,
    icon: summary.id === 'huong-dan-ho-so-nha-o-xa-hoi' ? 'fa-folder-open'
      : summary.id === 'kiem-tra-ho-so-khach-hang' ? 'fa-file-circle-check'
        : 'fa-timeline',
    anh: SUPPORT_CARD_IMAGES[summary.id],
  })),
];

const TIN_TUC_NOI_BAT_MAC_DINH = [
  {
    id: 'mo-ban-smart-city-dot-2',
    tieuDe: 'Mở bán nhà ở xã hội Cát Tường Smart City đợt 2 năm 2026',
    tomTat: 'Thông báo mở bán nhà ở xã hội tại dự án Cát Tường Smart City, khu vực Yên Trung và Tam Đa, Bắc Ninh.',
    ngay: '2026-03-18',
    nhan: 'Mở bán',
    anh: 'marketing/images/projects/ai-outpaint/cat-tuong-smart-city.jpg',
    href: 'https://cattuonggroup.vn/thong-bao-mo-ban-nha-o-xa-hoi-tai-du-an-dtxd-khu-nha-o-xa-hoi-cat-tuong-smart-city-tai-xa-yen-trung-va-xa-tam-da-tinh-bac-ninh-dot-2-nam-2026/',
  },
  {
    id: 'thong-nhat-dot-3-2026',
    tieuDe: 'Công bố công khai việc bán, cho thuê, cho thuê mua NOXH Thống Nhất Smart City',
    tomTat: 'Cập nhật đợt 3 năm 2026 với thông tin công bố nhà ở xã hội Thống Nhất Smart City.',
    ngay: '2026-05-30',
    nhan: 'Công bố',
    anh: 'marketing/images/projects/ai-outpaint/thong-nhat-smart-city.jpg',
    href: 'https://cattuonggroup.vn/cong-bo-cong-khai-viec-ban-cho-thue-cho-thue-mua-nha-o-xa-hoi-thong-nhat-smart-city-dot-3-nam-2026/',
  },
  {
    id: 'gia-ban-noxh-smart-city',
    tieuDe: 'Thông báo công khai việc bán NOXH Cát Tường Smart City đợt 3/2026',
    tomTat: 'Thông tin bảng giá, điều kiện và dữ liệu công bố cho dự án nhà ở xã hội Cát Tường Smart City.',
    ngay: '2026-05-30',
    nhan: 'Bảng giá',
    anh: 'marketing/images/projects/cat-tuong-smart-city/anh-06.jpg',
    href: 'https://cattuonggroup.vn/giabannoxhcattuongsmartcity/',
  },
  {
    id: 'cau-hoi-noxh-2026',
    tieuDe: '10 câu hỏi khi mua nhà ở xã hội được khách hàng hỏi nhiều nhất 2026',
    tomTat: 'Tổng hợp các câu hỏi phổ biến về điều kiện, hồ sơ, quy trình và quyền lợi khi mua nhà ở xã hội.',
    ngay: '2026-05-16',
    nhan: 'Hỏi đáp',
    anh: 'marketing/images/projects/cat-tuong-smart-city/anh-15.jpg',
    href: 'https://cattuonggroup.vn/cau-hoi-khi-mua-nha-o-xa-hoi/',
  },
  {
    id: 'tien-do-ban-giao-noxh-2026',
    tieuDe: '7 giải pháp Cát Tường đẩy nhanh tiến độ bàn giao nhà ở xã hội 2026',
    tomTat: 'Các giải pháp điều phối thi công, nghiệm thu và hoàn thiện để tăng tốc bàn giao nhà ở xã hội.',
    ngay: '2026-05-16',
    nhan: 'Tiến độ',
    anh: 'marketing/images/projects/ai-outpaint/thong-nhat-smart-city-day-ai-20260707.jpg',
    href: 'https://cattuonggroup.vn/tien-do-ban-giao-nha-o-xa-hoi-cat-tuong-2026/',
  },
  {
    id: 'noxh-3000-ty-bac-ninh',
    tieuDe: 'Dự án nhà ở xã hội 3.000 tỷ lớn nhất Bắc Ninh sắp bàn giao',
    tomTat: 'Thông tin tiến độ dự án nhà ở xã hội quy mô lớn tại Bắc Ninh, liên quan nguồn cung an cư của khách hàng.',
    ngay: '2026-04-14',
    nhan: 'Tiến độ',
    anh: 'marketing/images/projects/thong-nhat-smart-city/can-ho-thuc-te-02.jpg',
    href: 'https://cattuonggroup.vn/du-an-nha-o-xa-hoi-3-000-ty-lon-nhat-bac-ninh-sap-ban-giao/',
  },
  {
    id: 'danh-sach-hop-dong-thong-nhat-4',
    tieuDe: 'Danh sách đối tượng đã ký hợp đồng tại nhà ở xã hội Thống Nhất SmartCity',
    tomTat: 'Công bố danh sách đối tượng đã ký hợp đồng mua bán, cho thuê, cho thuê mua tại các khu nhà A-J.',
    ngay: '2026-04-03',
    nhan: 'Danh sách',
    anh: 'marketing/images/projects/ai-outpaint/thong-nhat-smart-city.jpg',
    href: 'https://cattuonggroup.vn/danh-sach-doi-tuong-da-duoc-ky-hop-dong-mua-ban-cho-thue-cho-thue-mua-nha-o-xa-hoi-tai-khu-nha-abcdefghij-du-an-nha-o-xa-hoi-thong-nhat-smartcity-4/',
  },
  {
    id: 'thong-nhat-dot-2-2026',
    tieuDe: 'Công bố công khai việc bán nhà ở xã hội Thống Nhất Smart City đợt 2 năm 2026',
    tomTat: 'Thông tin công bố đợt 2 cho dự án nhà ở xã hội Thống Nhất Smart City tại Yên Trung và Tam Đa.',
    ngay: '2026-03-20',
    nhan: 'Công bố',
    anh: 'marketing/images/projects/thong-nhat-smart-city/can-ho-thuc-te-03.jpg',
    href: 'https://cattuonggroup.vn/cong-bo-cong-khai-viec-ban-nha-o-xa-hoi-tai-du-an-dau-tu-xay-dung-khu-nha-o-xa-hoi-thong-nhat-smart-city-tai-xa-yen-trung-va-xa-tam-da-tinh-bac-ninh-dot-2-nam-2026/',
  },
  {
    id: 'to-trinh-thong-nhat-9',
    tieuDe: 'Đề xuất danh sách đối tượng dự kiến được giải quyết mua, thuê mua NOXH',
    tomTat: 'Tờ trình danh sách đối tượng dự kiến được giải quyết mua, thuê, thuê mua nhà ở xã hội Thống Nhất SmartCity.',
    ngay: '2026-03-10',
    nhan: 'Hồ sơ',
    anh: 'marketing/images/projects/ai-outpaint/thong-nhat-smart-city.jpg',
    href: 'https://cattuonggroup.vn/to-trinh-v-v-de-xuat-danh-sach-cac-doi-tuong-du-kien-duoc-giai-quyet-mua-thue-thue-mua-nha-o-xa-hoi-tai-cac-du-an-dau-tu-xay-dung-nha-o-xa-hoi-thong-nhat-smartcity-9/',
  },
  {
    id: 'chi-tieu-noxh-2025-2030',
    tieuDe: 'Chỉ tiêu nhà ở xã hội của các địa phương giai đoạn 2025-2030',
    tomTat: 'Bức tranh chỉ tiêu phát triển nhà ở xã hội, giúp khách hàng theo dõi nguồn cung trong các năm tới.',
    ngay: '2026-01-29',
    nhan: 'Chính sách',
    anh: 'marketing/images/projects/cat-tuong-smart-city/anh-07.jpg',
    href: 'https://cattuonggroup.vn/chi-tieu-nha-o-xa-hoi-cua-cac-dia-phuong-giai-doan-2025-2030/',
  },
  {
    id: 'dieu-can-biet-mua-noxh',
    tieuDe: 'Những điều cần biết khi mua nhà ở xã hội: điều kiện, mức vay, cơ hội an cư',
    tomTat: 'Tóm lược các điều kiện và điểm cần biết để khách hàng chủ động chuẩn bị hồ sơ mua nhà ở xã hội.',
    ngay: '2026-01-28',
    nhan: 'Hướng dẫn',
    anh: 'marketing/images/projects/cat-tuong-tnt.jpg',
    href: 'https://cattuonggroup.vn/nhung-dieu-can-biet-khi-mua-nha-o-xa-hoi-dieu-kien-muc-vay-co-hoi-an-cu/',
  },
  {
    id: 'to-trinh-thong-nhat-10',
    tieuDe: 'Cập nhật tờ trình danh sách đối tượng dự kiến mua, thuê mua Thống Nhất SmartCity',
    tomTat: 'Tờ trình cập nhật danh sách khách hàng dự kiến được giải quyết mua, thuê, thuê mua nhà ở xã hội.',
    ngay: '2026-01-26',
    nhan: 'Hồ sơ',
    anh: 'marketing/images/projects/ai-outpaint/thong-nhat-smart-city.jpg',
    href: 'https://cattuonggroup.vn/to-trinh-v-v-de-xuat-danh-sach-cac-doi-tuong-du-kien-duoc-giai-quyet-mua-thue-thue-mua-nha-o-xa-hoi-tai-cac-du-an-dau-tu-xay-dung-nha-o-xa-hoi-thong-nhat-smartcity-10/',
  },
  {
    id: 'du-an-du-dieu-kien-bac-ninh-012026',
    tieuDe: 'Cập nhật danh sách dự án nhà ở xã hội đủ điều kiện kinh doanh tại Bắc Ninh',
    tomTat: 'Cập nhật nguồn cung nhà ở xã hội đủ điều kiện kinh doanh tại Bắc Ninh trong tháng 01/2026.',
    ngay: '2026-01-23',
    nhan: 'Bắc Ninh',
    anh: 'marketing/images/projects/cat-tuong-smart-city/anh-08.jpg',
    href: 'https://cattuonggroup.vn/cap-nhat-danh-sach-du-an-nha-o-xa-hoi-du-dieu-kien-kinh-doanh-tai-bac-ninh-thang-1-2026/',
  },
  {
    id: 'bac-ninh-20-phan-tram-noxh',
    tieuDe: 'Nhà ở xã hội của tỉnh Bắc Ninh chiếm 20% quỹ nhà ở xã hội cả nước',
    tomTat: 'Tin thị trường về vai trò của Bắc Ninh trong phát triển nguồn cung nhà ở xã hội.',
    ngay: '2026-01-22',
    nhan: 'Thị trường',
    anh: 'marketing/images/projects/ai-outpaint/cat-tuong-smart-city.jpg',
    href: 'https://cattuonggroup.vn/nha-o-xa-hoi-cua-tinh-bac-ninh-chiem-20-quy-nha-o-xa-hoi-cua-ca-nuoc/',
  },
  {
    id: 'thai-nguyen-tham-smart-city',
    tieuDe: 'UBND tỉnh Thái Nguyên thăm và làm việc tại dự án nhà ở xã hội Cát Tường SmartCity',
    tomTat: 'Đoàn công tác thăm dự án Cát Tường SmartCity, ghi nhận mô hình phát triển nhà ở xã hội tại Bắc Ninh.',
    ngay: '2026-01-10',
    nhan: 'Dự án',
    anh: 'marketing/images/projects/cat-tuong-smart-city/anh-16.jpg',
    href: 'https://cattuonggroup.vn/ubnd-tinh-thai-nguyen-tham-va-lam-viec-tai-du-an-nha-o-xa-hoi-cat-tuong-smart-city/',
  },
  {
    id: 'thong-tin-noxh-thong-nhat',
    tieuDe: 'Thông tin nhà ở xã hội đối với dự án Khu nhà ở xã hội Thống Nhất',
    tomTat: 'Thông tin tổng quan về sản phẩm, dự án và dữ liệu khách hàng cần biết trước khi tìm hiểu hồ sơ.',
    ngay: '2026-01-05',
    nhan: 'Dự án',
    anh: 'marketing/images/projects/cat-tuong-thong-nhat/anh-02.jpg',
    href: 'https://cattuonggroup.vn/thong-tin-nha-o-xa-hoi-doi-voi-du-an-dtxd-khu-nha-o-xa-hoi-thong-nhat/',
  },
  {
    id: 'thong-tin-noxh-smart-city',
    tieuDe: 'Thông tin nhà ở xã hội đối với dự án Khu nhà ở xã hội Cát Tường Smart City',
    tomTat: 'Thông tin dự án Cát Tường Smart City, vị trí, quy mô và định hướng phục vụ nhu cầu an cư.',
    ngay: '2026-01-05',
    nhan: 'Dự án',
    anh: 'marketing/images/projects/cat-tuong-smart-city/anh-01.jpg',
    href: 'https://cattuonggroup.vn/thong-tin-nha-o-xa-hoi-doi-voi-du-an-dtxd-khu-nha-o-xa-hoi-cat-tuong-smart-city/',
  },
  {
    id: 'thong-tin-noxh-thong-nhat-smart-city',
    tieuDe: 'Thông tin nhà ở xã hội đối với dự án Khu nhà ở xã hội Thống Nhất Smart City',
    tomTat: 'Thông tin dự án Thống Nhất Smart City, giúp khách hàng nắm tổng quan trước khi chọn căn và nộp hồ sơ.',
    ngay: '2025-12-20',
    nhan: 'Dự án',
    anh: 'marketing/images/projects/ai-outpaint/thong-nhat-smart-city-day-ai-20260707.jpg',
    href: 'https://cattuonggroup.vn/thong-tin-nha-o-xa-hoi-doi-voi-du-an-dtxd-khu-nha-o-xa-hoi-thong-nhat-smart-city/',
  },
  {
    id: 'giay-to-lao-dong-tu-do',
    tieuDe: 'Làm rõ quy trình xin giấy tờ với người lao động tự do khi mua nhà ở xã hội',
    tomTat: 'Hướng dẫn nhóm lao động tự do chuẩn bị giấy tờ, xác nhận và hồ sơ liên quan khi mua nhà ở xã hội.',
    ngay: '2025-11-28',
    nhan: 'Hồ sơ',
    anh: 'marketing/images/projects/cat-tuong-eco/anh-03.jpg',
    href: 'https://cattuonggroup.vn/lam-ro-quy-trinh-cach-thuc-xin-giay-to-voi-nguoi-lao-dong-tu-do-khi-mua-nha-o-xa-hoi/',
  },
  {
    id: 'cac-buoc-dang-ky-noxh',
    tieuDe: 'Cập nhật các bước đăng ký mua nhà ở xã hội theo quy định hiện tại',
    tomTat: 'Tóm tắt trình tự đăng ký mua nhà ở xã hội, từ xác định đối tượng đến chuẩn bị giấy tờ và nộp hồ sơ.',
    ngay: '2025-11-20',
    nhan: 'Quy trình',
    anh: 'marketing/images/projects/cat-tuong-new.jpg',
    href: 'https://cattuonggroup.vn/cap-nhat-cac-buoc-dang-ky-mua-nha-o-xa-hoi-theo-quy-dinh-hien-tai/',
  },
];

const PHAP_LY_MAC_DINH = {
  hoSo: [
    {
      ma: 'phap-ly-du-an',
      ten: 'Hồ sơ pháp lý dự án',
      moTa: 'Dành cho khách muốn kiểm tra tính minh bạch của dự án trước khi đặt cọc hoặc ký hợp đồng.',
      hangMuc: [
        'Chấp thuận/chủ trương đầu tư hoặc quyết định phê duyệt dự án',
        'Quy hoạch chi tiết 1/500 và hồ sơ thiết kế được duyệt',
        'Giấy phép xây dựng hoặc văn bản miễn giấy phép theo quy định',
        'Thông báo đủ điều kiện bán, cho thuê mua nhà ở hình thành trong tương lai',
        'Văn bản nghiệm thu, PCCC, hạ tầng và bảo lãnh ngân hàng nếu phát sinh',
      ],
    },
    {
      ma: 'ho-so-khach-hang',
      ten: 'Hồ sơ khách hàng cần chuẩn bị',
      moTa: 'Dùng cùng khu kiểm tra hồ sơ để khách biết mình còn thiếu gì trước khi nộp cho kinh doanh/pháp lý.',
      hangMuc: [
        'Phiếu đăng ký mua hoặc tờ khai thông tin khách hàng',
        'CCCD/hộ chiếu, giấy tờ cư trú, giấy đăng ký kết hôn hoặc xác nhận độc thân',
        'Hồ sơ doanh nghiệp và ủy quyền nếu khách hàng là tổ chức',
        'Chứng minh thu nhập và bộ hồ sơ vay nếu có vay ngân hàng',
      ],
    },
    {
      ma: 'hop-dong-ban-giao',
      ten: 'Hợp đồng và bàn giao',
      moTa: 'Nhóm tài liệu khách nên đọc trước khi chuyển bước từ đặt cọc sang ký kết và nhận bàn giao.',
      hangMuc: [
        'Mẫu hợp đồng mua bán, phụ lục tiến độ thanh toán và chính sách ưu đãi',
        'Biên bản đặt cọc, phiếu thu và xác nhận công nợ từng đợt',
        'Biên bản bàn giao căn hộ, checklist hiện trạng và hướng dẫn bảo hành',
        'Hồ sơ phục vụ cấp giấy chứng nhận quyền sở hữu sau bàn giao',
      ],
    },
  ],
  vanBan: [
    {
      ma: '08-2026-tt-bxd',
      tieuDe: 'Thông tư 08/2026/TT-BXD',
      tomTat: 'Sửa đổi, bổ sung một số điều của các Thông tư trong lĩnh vực nhà ở; khách hàng quan tâm nhà ở xã hội nên cập nhật khi chuẩn bị hồ sơ.',
      loai: 'Thông tư',
      linhVuc: 'Nhà ở, hồ sơ NOXH',
      ngayBanHanh: '2026-02-15',
      ngayHieuLuc: '2026-02-15',
      nguon: 'Hệ thống văn bản Chính phủ',
      href: 'https://vanban.chinhphu.vn/?docid=216996&pageid=27160',
      moi: true,
    },
    {
      ma: '54-2026-nd-cp',
      tieuDe: 'Nghị định 54/2026/NĐ-CP',
      tomTat: 'Sửa đổi, bổ sung một số nghị định trong lĩnh vực nhà ở và kinh doanh bất động sản; có nhiều điểm mới liên quan nhà ở xã hội.',
      loai: 'Nghị định',
      linhVuc: 'Nhà ở, kinh doanh BĐS',
      ngayBanHanh: '2026-02-09',
      ngayHieuLuc: '2026-02-09',
      nguon: 'Hệ thống văn bản Chính phủ',
      href: 'https://vanban.chinhphu.vn/?docid=216924&pageid=27160',
      moi: true,
    },
    {
      ma: '66-15-2026-nq-cp',
      tieuDe: 'Nghị quyết 66.15/2026/NĐ-CP',
      tomTat: 'Cơ chế xử lý khó khăn, vướng mắc trong phát triển nhà ở xã hội; phù hợp nhóm khách quan tâm chính sách nhà ở.',
      loai: 'Nghị quyết',
      linhVuc: 'Nhà ở xã hội',
      ngayBanHanh: '2026-02-13',
      ngayHieuLuc: '2026-02-13',
      nguon: 'Xây dựng Chính sách, Pháp luật',
      href: 'https://xaydungchinhsach.chinhphu.vn/nghi-quyet-6615-2026-nd-cp-co-che-xu-ly-kho-khan-vuong-mac-ve-phat-trien-nha-o-xa-hoi-119260224103133945.htm',
      moi: true,
    },
    {
      ma: '357-2025-nd-cp',
      tieuDe: 'Nghị định 357/2025/NĐ-CP',
      tomTat: 'Quy định về xây dựng và quản lý hệ thống thông tin, cơ sở dữ liệu về nhà ở và thị trường bất động sản.',
      loai: 'Nghị định',
      linhVuc: 'Dữ liệu nhà ở, thị trường BĐS',
      ngayBanHanh: '2025-12-31',
      ngayHieuLuc: '2026-03-01',
      nguon: 'Hệ thống văn bản Chính phủ',
      href: 'https://vanban.chinhphu.vn/?docid=216395&pageid=27160',
      moi: true,
    },
    {
      ma: '32-2025-tt-bxd',
      tieuDe: 'Thông tư 32/2025/TT-BXD',
      tomTat: 'Sửa đổi, bổ sung một số điều của Thông tư 05/2024/TT-BXD quy định chi tiết một số điều của Luật Nhà ở.',
      loai: 'Thông tư',
      linhVuc: 'Nhà ở',
      ngayBanHanh: '2025-11-10',
      ngayHieuLuc: '2025-11-10',
      nguon: 'Hệ thống văn bản Chính phủ',
      href: 'https://vanban.chinhphu.vn/?docid=215947&pageid=27160',
      moi: true,
    },
    {
      ma: '96-2024-nd-cp',
      tieuDe: 'Nghị định 96/2024/NĐ-CP',
      tomTat: 'Quy định chi tiết một số điều của Luật Kinh doanh bất động sản.',
      loai: 'Nghị định',
      linhVuc: 'Kinh doanh bất động sản',
      ngayBanHanh: '2024-07-24',
      ngayHieuLuc: '2024-08-01',
      nguon: 'Hệ thống văn bản Chính phủ',
      href: 'https://vanban.chinhphu.vn/?classid=1&docid=210798&pageid=27160',
    },
    {
      ma: '95-2024-nd-cp',
      tieuDe: 'Nghị định 95/2024/NĐ-CP',
      tomTat: 'Quy định chi tiết một số điều của Luật Nhà ở.',
      loai: 'Nghị định',
      linhVuc: 'Nhà ở',
      ngayBanHanh: '2024-07-24',
      ngayHieuLuc: '2024-08-01',
      nguon: 'Hệ thống văn bản Chính phủ',
      href: 'https://vanban.chinhphu.vn/?docid=210761&pageid=27160',
    },
  ],
};

function danhSachTinTucMacDinh() {
  return TIN_TUC_NOI_BAT_MAC_DINH.slice(0, 20);
}

function duAnCarouselVisibleCount() {
  if (window.matchMedia('(min-width: 1024px)').matches) return 3;
  if (window.matchMedia('(min-width: 640px)').matches) return 2;
  return 1;
}

function duAnCarouselMaxIndex() {
  const total = document.querySelectorAll('#danhSachDuAn .project-carousel-card').length;
  return Math.max(0, total - Math.min(total, duAnCarouselVisibleCount()));
}

function capNhatDuAnCarousel() {
  const track = document.getElementById('danhSachDuAn');
  const dots = document.getElementById('duAnCarouselDots');
  if (!track) return;
  const cards = Array.from(track.querySelectorAll('.project-carousel-card'));
  if (!cards.length) {
    track.style.transform = 'translateX(0)';
    if (dots) dots.innerHTML = '';
    return;
  }
  const max = duAnCarouselMaxIndex();
  DU_AN_CAROUSEL_INDEX = Math.min(Math.max(DU_AN_CAROUSEL_INDEX, 0), max);
  const current = cards[DU_AN_CAROUSEL_INDEX];
  track.style.transform = `translateX(-${current ? current.offsetLeft : 0}px)`;
  if (dots) {
    dots.innerHTML = Array.from({ length: max + 1 }, (_, i) => `
      <button type="button" class="project-carousel-dot ${i === DU_AN_CAROUSEL_INDEX ? 'is-active' : ''}" aria-label="Xem nhóm dự án ${i + 1}" onclick="duAnCarouselGo(${i})"></button>
    `).join('');
  }
}

function dungDuAnCarousel() {
  if (DU_AN_CAROUSEL_TIMER) clearInterval(DU_AN_CAROUSEL_TIMER);
  DU_AN_CAROUSEL_TIMER = null;
}

function chayDuAnCarousel() {
  dungDuAnCarousel();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (duAnCarouselMaxIndex() <= 0) return;
  DU_AN_CAROUSEL_TIMER = setInterval(() => duAnCarouselNext(false), 3600);
}

function duAnCarouselGo(index, restart = true) {
  const max = duAnCarouselMaxIndex();
  DU_AN_CAROUSEL_INDEX = Math.min(Math.max(index, 0), max);
  capNhatDuAnCarousel();
  if (restart) chayDuAnCarousel();
}

function duAnCarouselNext(restart = true) {
  const max = duAnCarouselMaxIndex();
  DU_AN_CAROUSEL_INDEX = DU_AN_CAROUSEL_INDEX >= max ? 0 : DU_AN_CAROUSEL_INDEX + 1;
  capNhatDuAnCarousel();
  if (restart) chayDuAnCarousel();
}

function duAnCarouselPrev(restart = true) {
  const max = duAnCarouselMaxIndex();
  DU_AN_CAROUSEL_INDEX = DU_AN_CAROUSEL_INDEX <= 0 ? max : DU_AN_CAROUSEL_INDEX - 1;
  capNhatDuAnCarousel();
  if (restart) chayDuAnCarousel();
}

function initDuAnCarousel() {
  DU_AN_CAROUSEL_INDEX = 0;
  capNhatDuAnCarousel();
  chayDuAnCarousel();
  const carousel = document.getElementById('duAnCarousel');
  if (carousel) {
    carousel.onmouseenter = dungDuAnCarousel;
    carousel.onmouseleave = chayDuAnCarousel;
  }
  if (!DU_AN_CAROUSEL_RESIZE_BOUND) {
    DU_AN_CAROUSEL_RESIZE_BOUND = true;
    window.addEventListener('resize', () => {
      capNhatDuAnCarousel();
      chayDuAnCarousel();
    });
  }
}

function anhTongQuanDuAn(d) {
  return PROJECT_OVERVIEW_BANNERS[d?.ma] || d?.banner || '';
}

// ---------- DANH SÁCH DỰ ÁN ----------
async function loadDuAn() {
  const box = document.getElementById('danhSachDuAn');
  const sel = document.getElementById('leadDuAn');
  try {
    const list = await apiGet('/du-an');
    DU_AN_PUBLIC_CACHE = Array.isArray(list) ? list : [];
    box.innerHTML = list.map((d, i) => {
      const bannerNgoai = anhTongQuanDuAn(d);
      return `
      <article data-tw-animate="zoom" style="--tw-animate-delay:${(i % 4) * 70}ms" class="project-carousel-card project-showcase-card rounded-none cursor-pointer" onclick="xemDuAn('${d.ma}')">
        <img src="${esc(bannerNgoai)}" alt="" aria-hidden="true" class="project-showcase-bg-fill">
        <img src="${esc(bannerNgoai)}" alt="${esc(d.ten)}" class="project-showcase-bg">
        <div class="relative z-[1] h-full min-h-[inherit] p-4 flex flex-col">
          <div class="flex items-start justify-between gap-3">
            <div class="project-showcase-namechip min-w-0">
              <p class="line-clamp-2">${esc(d.ten)}</p>
            </div>
            <span class="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full text-white" style="background:${esc(d.logoMau)}">${esc(d.trangThai)}</span>
          </div>

          <div class="mt-auto"></div>

          <div class="pt-4">
            <div class="project-showcase-cta flex items-center justify-end gap-3">
              <span class="text-sm font-extrabold text-white drop-shadow">Xem chi tiết <i class="fas fa-arrow-right ml-1"></i></span>
            </div>
          </div>
          <div class="project-showcase-index">${String(i + 1).padStart(2, '0')}.</div>
        </div>
      </article>`;
    }).join('');
    if (sel) initLeadProjectTowerOptions();
    initTwAnimate(box);
    initDuAnCarousel();
    queueNewsPanelHeightSync();
  } catch (e) {
    box.innerHTML = `<div class="w-full text-center text-red-500 py-8 bg-white rounded-2xl border border-slate-200 shadow-sm">Không tải được dự án: ${esc(e.message)}</div>`;
  }
}

// ---------- BIỂU MẪU ----------
async function loadBieuMau() {
  const box = document.getElementById('danhSachBieuMau');
  if (!box) return;
  try {
    const list = await apiGet('/bieu-mau');
    box.innerHTML = list.map((b, i) => `
      <div data-tw-animate="zoom" style="--tw-animate-delay:${i * 90}ms" class="bg-slate-50 rounded-2xl border border-slate-200 p-5 flex flex-col">
        <div class="w-12 h-12 rounded-xl bg-cobalt/10 text-cobalt grid place-items-center text-xl mb-3"><i class="fas fa-file-lines"></i></div>
        <h3 class="font-bold text-cobalt-dark">${esc(b.ten)}</h3>
        <p class="text-sm text-slate-500 mt-1 flex-1">${esc(b.moTa)}</p>
        <div class="flex items-center justify-between mt-4">
          <span class="text-xs text-slate-400">${esc(b.dinhDang)}</span>
          <a href="${esc(b.file)}" target="_blank" class="tw-animate-shine text-sm font-semibold text-white bg-cobalt px-3 py-1.5 rounded-lg hover:bg-cobalt-dark"><i class="fas fa-download mr-1"></i>Tải / In</a>
        </div>
      </div>`).join('');
    initTwAnimate(box);
  } catch (e) {
    box.innerHTML = `<div class="col-span-full text-center text-red-500 py-8">${esc(e.message)}</div>`;
  }
}

// ---------- CÔNG CỤ HỖ TRỢ KHÁCH HÀNG ----------
async function loadQuyCan072026() {
  if (location.protocol === 'file:') {
    if (QUY_CAN_072026_CACHE) return QUY_CAN_072026_CACHE;
    const r = await fetch('marketing/data/quy-can-072026.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Không tải được bảng hàng CĐT');
    QUY_CAN_072026_CACHE = await r.json();
    syncOpenTowersFromInventory(QUY_CAN_072026_CACHE);
    return QUY_CAN_072026_CACHE;
  }
  QUY_CAN_072026_CACHE = await apiGet('/bang-hang');
  syncOpenTowersFromInventory(QUY_CAN_072026_CACHE);
  return QUY_CAN_072026_CACHE;
}

function bangHangProjectOptionsHtml() {
  return '<option value="">-- Chọn dự án muốn xem --</option>' + LEAD_TOWER_PROJECTS
    .map(project => `<option value="${esc(project.ten)}">${esc(project.ten)}</option>`)
    .join('');
}

function isBangHangProjectOpen(projectName) {
  return !!TOWER_OPEN_PROJECTS[projectName]?.size;
}

function renderBangHangEmpty(projectName = '') {
  const text = projectName ? 'Chọn một tòa bên trên để xem bảng hàng.' : 'Chọn dự án muốn xem bảng hàng.';
  return `
    <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
      <p class="font-semibold text-cobalt-dark">${esc(text)}</p>
    </div>`;
}

const BANG_HANG_TOWER_PALETTE = [
  { bg: 'linear-gradient(120deg, #ffffff 0%, #ffffff 55%, #fff7ec 74%, #feedd5 90%, #fde5c2 100%)', hover: 'linear-gradient(120deg, #ffffff 0%, #ffffff 55%, #fff4e4 74%, #fee7c8 90%, #fddcae 100%)', border: '#bccbdc', borderHover: '#9fb6d0', text: '#1e4e8c', icon: '#1e4e8c', pill: '#1e4e8c' },
];

function bangHangTowerDisplayName(tower) {
  const raw = String(tower || '').trim();
  return raw && !/\s/.test(raw) ? `Tòa ${raw}` : raw;
}

function renderBangHangTowerGrid(projectName, selectedValue = '') {
  const project = LEAD_TOWER_PROJECTS.find(p => p.ten === projectName);
  if (!project) return '';
  const openTowers = project.towers.filter(tower => isLeadTowerOpen(project.ten, tower));
  const buttons = openTowers.map((tower, index) => {
    const value = leadTowerValue(project.ten, tower);
    const active = value === selectedValue;
    const open = isLeadTowerOpen(project.ten, tower);
    const displayName = bangHangTowerDisplayName(tower);
    const color = BANG_HANG_TOWER_PALETTE[index % BANG_HANG_TOWER_PALETTE.length];
    const styleVars = `--tower-bg:${color.bg};--tower-hover:${color.hover};--tower-border:${color.border};--tower-border-hover:${color.borderHover};--tower-text:${color.text};--tower-icon:${color.icon};--tower-pill:${color.pill};`;
    return `
      <button type="button" aria-pressed="${active ? 'true' : 'false'}" data-bang-hang-tower-button data-value="${esc(value)}" style="${styleVars}" onclick='chonToaBangHang(${jsStr(value)})' class="bang-hang-tower-tile ${active ? 'is-active' : ''} focus:outline-none focus:ring-2 focus:ring-cobalt focus:ring-offset-2">
        <span class="flex flex-col items-center justify-center gap-1">
          <span class="bang-hang-tower-icon">
            <i class="fas fa-house-chimney text-sm"></i>
          </span>
          <span class="min-w-0">
            <span class="bang-hang-tower-name">${esc(displayName)}</span>
            ${open ? '<span class="bang-hang-tower-status">(đang mở bán)</span>' : ''}
          </span>
        </span>
      </button>`;
  }).join('');
  return `
    <div class="rounded-xl border border-slate-200 bg-white p-3">
      <div class="bang-hang-tower-grid">${buttons}</div>
    </div>`;
}

function setBangHangTowerArea(projectName, selectedValue = '') {
  const area = document.getElementById('bangHangTowerArea');
  if (area) area.innerHTML = projectName ? renderBangHangTowerGrid(projectName, selectedValue) : '';
}

function setBangHangControlsLocked(locked) {
  const projectSelect = document.getElementById('bangHangDuAnSelect');
  const towerButtons = document.querySelectorAll('[data-bang-hang-tower-button]');
  if (projectSelect) projectSelect.disabled = locked;
  towerButtons.forEach(button => { button.disabled = locked; });
}

function showBangHangAlert(message, onClose) {
  document.getElementById('bangHangAlert')?.remove();
  BANG_HANG_ALERT_CLOSE_ACTION = typeof onClose === 'function' ? onClose : null;
  setBangHangControlsLocked(true);
  document.body.insertAdjacentHTML('beforeend', `
    <div id="bangHangAlert" class="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/45 px-4" style="position:fixed!important;inset:0!important;z-index:2147483647!important;display:grid!important;place-items:center!important;padding:1rem;" role="alertdialog" aria-modal="true" aria-labelledby="bangHangAlertTitle">
      <div class="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 text-center shadow-2xl">
        <div class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-100 text-xl text-red-600">
          <i class="fas fa-triangle-exclamation"></i>
        </div>
        <h3 id="bangHangAlertTitle" class="mt-3 text-lg font-extrabold text-red-600">Cảnh báo</h3>
        <p class="mt-2 text-sm font-semibold leading-relaxed text-slate-700">${esc(message)}</p>
        <button type="button" onclick="dongCanhBaoBangHang()" class="mt-5 w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
          Tắt
        </button>
      </div>
    </div>`);
  setTimeout(() => document.querySelector('#bangHangAlert button')?.focus({ preventScroll: true }), 0);
}

function dongCanhBaoBangHang() {
  const action = BANG_HANG_ALERT_CLOSE_ACTION;
  BANG_HANG_ALERT_CLOSE_ACTION = null;
  document.getElementById('bangHangAlert')?.remove();
  setBangHangControlsLocked(false);
  if (action) action();
}

function getInventoryTower(data, code, projectName) {
  const projectCode = {
    'Khu nhà ở xã hội Cát Tường Smart City': 'CTS',
    'Khu nhà ở xã hội Thống Nhất Smart City': 'TNS',
  }[projectName];
  return (data?.toa || []).find(item => item.maDuAn === projectCode && String(item.maToa).toUpperCase() === String(code).toUpperCase());
}

function giaCanHoDisplay(can) {
  return can?.tongCong || can?.tongGiaCanHo || can?.giaCanHoSauThue || 'Liên hệ';
}

function renderBangHangSummary(data) {
  return renderBangHangEmpty();
}

function renderBangHangSoldOut(selected) {
  const tower = bangHangTowerDisplayName(selected?.tower || 'Tòa đã chọn');
  return `
    <div class="rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm text-cobalt-dark">
      <div class="font-bold"><i class="fas fa-circle-check mr-2 text-amber"></i>${esc(tower)} đã bán hết.</div>
      <p class="mt-1 text-slate-600">Hiện không còn căn trống trong bảng hàng công khai. Vui lòng chọn tòa khác.</p>
    </div>`;
}

function renderBangHangTable(data, selected) {
  const code = towerCodeForInventory(selected.tower);
  const tower = getInventoryTower(data, code, selected.projectName);
  if (!tower) return renderBangHangSoldOut(selected);
  const canHo = Array.isArray(tower.canHo) ? tower.canHo : [];
  if (!canHo.length) return renderBangHangSoldOut(selected);
  const rows = canHo.map(can => `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="px-3 py-2 font-semibold text-cobalt-dark">${esc(can.maCan)}</td>
      <td class="px-3 py-2">${esc(can.tang)}</td>
      <td class="px-3 py-2">${esc(can.dienTich)} m²</td>
      <td class="px-3 py-2">${esc(can.soPhongNgu)}</td>
      <td class="px-3 py-2">${esc(can.huong)}</td>
      <td class="px-3 py-2">${esc(can.viTri)}</td>
      <td class="px-3 py-2 whitespace-nowrap">${esc(can.donGia)} đ/m²</td>
      <td class="px-3 py-2 whitespace-nowrap font-semibold text-cobalt">${esc(giaCanHoDisplay(can))} đ</td>
    </tr>`).join('');
  return `
    <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div class="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-amber">Tra cứu bảng hàng CĐT</p>
          <h4 class="text-xl font-extrabold text-cobalt-dark">Danh sách căn trống ${esc(tower.tenToa)}</h4>
          <p class="text-xs text-slate-500">${esc(tower.tenDuAn)} · ${canHo.length} căn · Cập nhật ${esc(fmtNgay(data.capNhat))}</p>
          <p class="mt-1 text-xs text-slate-500">Giá căn gồm giá sau thuế, phí bảo trì và hoàn thiện theo bảng hàng chủ đầu tư.</p>
        </div>
        <button type="button" onclick='dangKyNhanTuVanBangHang(${jsStr(leadTowerValue(selected.projectName, selected.tower))})' class="tw-animate-shine rounded-xl bg-amber px-4 py-2.5 text-sm font-bold text-cobalt-dark hover:brightness-95">
          <i class="fas fa-headset mr-2"></i>Đăng ký nhận tư vấn
        </button>
      </div>
      <div class="max-h-[360px] overflow-auto">
        <table class="min-w-[880px] w-full text-left text-xs text-slate-600">
          <thead class="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-slate-400 shadow-sm">
            <tr>
              <th class="px-3 py-2">Mã căn</th>
              <th class="px-3 py-2">Tầng</th>
              <th class="px-3 py-2">Diện tích</th>
              <th class="px-3 py-2">Loại</th>
              <th class="px-3 py-2">Hướng</th>
              <th class="px-3 py-2">Vị trí</th>
              <th class="px-3 py-2">Đơn giá</th>
              <th class="px-3 py-2">Giá căn</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderBangHangSupport(data) {
  return `
    <section data-tw-animate="zoom" class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-widest text-amber">Bảng hàng CĐT</p>
          <h3 class="mt-1 text-xl font-extrabold text-cobalt-dark">Tra cứu bảng hàng CĐT</h3>
          <p class="mt-1 text-sm text-slate-500">Chỉ các tòa đang có căn trống mới hiển thị. Chọn dự án và tòa để xem giá từng căn.</p>
        </div>
        <div class="grid w-full gap-2 sm:w-[22rem]">
          <select id="bangHangDuAnSelect" onchange="chonDuAnBangHang(this.value)" class="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-cobalt focus:outline-none">
            ${bangHangProjectOptionsHtml()}
          </select>
        </div>
      </div>
      <div id="bangHangTowerArea" class="mt-4"></div>
      <div id="bangHangResult" class="mt-4">${renderBangHangEmpty()}</div>
    </section>`;
}

function chonDuAnBangHang(projectName) {
  const result = document.getElementById('bangHangResult');
  const projectSelect = document.getElementById('bangHangDuAnSelect');
  if (projectSelect) projectSelect.value = projectName || '';
  if (!projectName) {
    setBangHangTowerArea('');
    if (result) result.innerHTML = renderBangHangEmpty();
    return;
  }
  setBangHangTowerArea(projectName);
  if (result) result.innerHTML = renderBangHangEmpty(projectName);
}

async function chonToaBangHang(value) {
  const result = document.getElementById('bangHangResult');
  const projectSelect = document.getElementById('bangHangDuAnSelect');
  if (!result) return;
  const selected = parseLeadTowerValue(value);
  if (!selected) {
    result.innerHTML = renderBangHangEmpty(projectSelect?.value || '');
    return;
  }
  if (projectSelect && projectSelect.value !== selected.projectName) {
    projectSelect.value = selected.projectName;
    setBangHangTowerArea(selected.projectName);
  }
  if (!isLeadTowerOpen(selected.projectName, selected.tower)) {
    showBangHangAlert('Tòa này hiện đang không mở bán. Vui lòng chọn tòa khác', () => {
      setBangHangTowerArea(selected.projectName);
      result.innerHTML = renderBangHangEmpty(selected.projectName);
    });
    return;
  }
  setBangHangTowerArea(selected.projectName, value);
  result.innerHTML = '<div class="rounded-xl border border-slate-200 bg-white p-5 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải bảng hàng...</div>';
  try {
    const data = await loadQuyCan072026();
    result.innerHTML = renderBangHangTable(data, selected);
  } catch (e) {
    result.innerHTML = `<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">${esc(e.message)}</div>`;
  }
}

function dangKyNhanTuVanBangHang(value) {
  const selected = parseLeadTowerValue(value);
  if (selected) setLeadProjectTower(selected.projectName, selected.tower);
  const section = document.getElementById('lien-he');
  if (section && !section.classList.contains('hidden')) {
    const top = Math.max(0, section.getBoundingClientRect().top + window.scrollY - 12);
    window.scrollTo({ top, behavior: 'smooth' });
  } else {
    if (selected) {
      try { sessionStorage.setItem('leadTowerPrefill', JSON.stringify(selected)); } catch (_) {}
    }
    location.href = `${trangGioiThieuHref()}#lien-he`;
    return;
  }
  setTimeout(() => document.querySelector('#leadForm input[name="hoTen"]')?.focus({ preventScroll: true }), 650);
}

async function loadHoTroKhachHang() {
  const box = document.getElementById('danhSachHoTroKhachHang');
  if (!box) return;
  const toolCards = HO_TRO_KHACH_HANG_ITEMS.map((item, i) => {
    const href = blogHref(item.id);
    const tamKhoaCongKhai = laMucHoTroTamKhoa(item.id);
    return `
      <a href="${esc(href)}"${linkAttrs(href)}
        ${tamKhoaCongKhai ? `onclick="return moMucHoTroKhachHang(event, ${esc(jsStr(item.id))})"` : ''}
        data-tw-animate="${i % 2 ? 'right' : 'left'}"
        style="--tw-animate-delay:${i * 80}ms"
        class="support-tool-card group flex flex-col gap-4 rounded-2xl border p-3.5 sm:flex-row sm:items-center sm:gap-4">
        <div class="support-tool-media h-20 w-full shrink-0 rounded-xl bg-cobalt/10 ring-1 ring-white/80 sm:h-20 sm:w-24">
          ${item.anh ? `<img src="${esc(item.anh)}" alt="${esc(item.tieuDe)}" loading="lazy" class="h-full w-full object-cover transition duration-300 group-hover:scale-105">` : `<div class="grid h-full w-full place-items-center text-cobalt"><i class="fas ${esc(item.icon)}"></i></div>`}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-cobalt/10 px-2.5 py-1 text-[11px] font-bold text-cobalt">${esc(item.nhan)}</span>
            <span class="text-xs text-slate-400">${fmtNgay(item.ngay)}</span>
            ${tamKhoaCongKhai ? '<span class="rounded-full bg-amber/20 px-2.5 py-1 text-[11px] font-bold text-amber-700"><i class="fas fa-lock mr-1"></i>Tạm khóa công khai</span>' : ''}
          </div>
          <h3 class="mt-2 text-lg font-extrabold leading-snug text-cobalt-dark">${esc(item.tieuDe)}</h3>
          <p class="mt-1 text-sm text-slate-500 line-clamp-2">${esc(item.tomTat)}</p>
        </div>
        <span class="support-tool-arrow inline-flex shrink-0 items-center justify-center rounded-full bg-cobalt/10 px-3 py-2 text-sm font-bold text-cobalt group-hover:bg-cobalt group-hover:text-white">${tamKhoaCongKhai ? '<i class="fas fa-lock mr-2"></i>Chỉ nội bộ' : 'Mở công cụ <i class="fas fa-arrow-right ml-2"></i>'}</span>
      </a>`;
  }).join('');
  box.innerHTML = toolCards;
  initTwAnimate(box);
  queueNewsPanelHeightSync();
}

// ---------- TIN TỨC NỔI BẬT ----------
function syncNewsPanelHeight() {
  const panel = document.getElementById('tin-tuc');
  if (!panel) return;
  panel.style.removeProperty('height');
  panel.style.removeProperty('max-height');
  panel.style.removeProperty('--news-panel-height');
  syncNewsRailVisibleHeight();
}

function queueNewsPanelHeightSync() {
  syncNewsPanelHeight();
  [120, 420, 900].forEach(delay => setTimeout(syncNewsPanelHeight, delay));
}

function bindNewsPanelHeightSync() {
  if (NEWS_PANEL_HEIGHT_SYNC_BOUND) return;
  NEWS_PANEL_HEIGHT_SYNC_BOUND = true;
  window.addEventListener('resize', queueNewsPanelHeightSync);
  window.addEventListener('load', queueNewsPanelHeightSync);
}

function getNewsCards() {
  return Array.from(document.querySelectorAll('#danhSachTinTuc [data-news-index]'));
}

function getNewsCardScrollTop(box, card) {
  if (!box || !card) return 0;
  return box.scrollTop + card.getBoundingClientRect().top - box.getBoundingClientRect().top;
}

function getNewsRailStartIndex(box) {
  const cards = getNewsCards();
  if (!box || !cards.length) return 0;
  const maxStart = Math.max(0, cards.length - TIN_TUC_COLLAPSED_COUNT);
  const scrollTop = box.scrollTop + 2;
  const current = cards.findIndex(card => getNewsCardScrollTop(box, card) + card.getBoundingClientRect().height > scrollTop);
  return Math.min(Math.max(current, 0), maxStart);
}

function syncNewsRailVisibleHeight(startIndex) {
  const box = document.getElementById('danhSachTinTuc');
  const cards = getNewsCards();
  if (!box || !cards.length) return;
  const maxStart = Math.max(0, cards.length - TIN_TUC_COLLAPSED_COUNT);
  const safeStart = Math.min(Math.max(Number.isFinite(startIndex) ? startIndex : getNewsRailStartIndex(box), 0), maxStart);
  const endIndex = Math.min(cards.length - 1, safeStart + TIN_TUC_COLLAPSED_COUNT - 1);
  const first = cards[safeStart];
  const last = cards[endIndex];
  if (!first || !last) return;
  const height = Math.ceil(last.getBoundingClientRect().bottom - first.getBoundingClientRect().top);
  box.style.setProperty('--news-rail-visible-height', `${height}px`);
}

function updateNewsMoreButtonState() {
  const btn = document.getElementById('tinTucXemThem');
  const box = document.getElementById('danhSachTinTuc');
  const cards = getNewsCards();
  if (!btn || !box) return;
  const canScroll = cards.length > TIN_TUC_COLLAPSED_COUNT;
  btn.classList.toggle('hidden', !canScroll);
  btn.setAttribute('aria-hidden', canScroll ? 'false' : 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.disabled = !canScroll;
  if (!canScroll) return;
  const atEnd = box.scrollTop >= box.scrollHeight - box.clientHeight - 4;
  btn.dataset.newsAction = atEnd ? 'top' : 'more';
  btn.setAttribute('aria-label', atEnd ? 'Xem lại tin tức từ đầu' : 'Xem thêm tin tức');
  btn.innerHTML = atEnd
    ? 'Về đầu tin tức <i class="fas fa-chevron-up ml-2 text-xs"></i>'
    : 'Xem thêm tin tức <i class="fas fa-chevron-down ml-2 text-xs"></i>';
}

function scheduleNewsRailUiSync() {
  if (NEWS_RAIL_SCROLL_RAF) cancelAnimationFrame(NEWS_RAIL_SCROLL_RAF);
  NEWS_RAIL_SCROLL_RAF = requestAnimationFrame(() => {
    NEWS_RAIL_SCROLL_RAF = 0;
    syncNewsRailVisibleHeight();
    updateNewsMoreButtonState();
  });
}

function bindNewsRailScroll() {
  const box = document.getElementById('danhSachTinTuc');
  if (!box || box.dataset.newsScrollBound === 'true') return;
  box.dataset.newsScrollBound = 'true';
  box.addEventListener('scroll', scheduleNewsRailUiSync, { passive: true });
}

function renderTinTucItems(list) {
  const visible = list;
  return visible.map((t, i) => {
    const anh = esc(t.anh || 'marketing/images/projects/ai-outpaint/cat-tuong-smart-city.jpg');
    if (i === 0) {
      return `
        <a href="${esc(t.href)}"${linkAttrs(t.href)}
          data-tw-animate="zoom"
          data-news-index="${i}"
          class="news-hot-card group flex h-[124px] overflow-hidden rounded-2xl border border-amber/60 bg-cobalt-dark text-white shadow-[0_14px_30px_rgba(20,56,102,.22)] hover:border-amber hover:bg-cobalt">
            <img src="${anh}" alt="${esc(t.tieuDe)}" loading="lazy" class="h-full w-24 shrink-0 object-cover">
            <div class="min-w-0 flex-1 p-3">
              <div class="flex items-center justify-between gap-2 text-[10px] text-slate-200">
                <span class="rounded-full bg-amber px-2 py-0.5 font-bold text-cobalt-dark">Tin nóng</span>
                <span>${fmtNgay(t.ngay)}</span>
              </div>
              <h3 class="mt-1.5 text-sm font-extrabold leading-snug text-white line-clamp-2">${esc(t.tieuDe)}</h3>
              <span class="inline-flex items-center pt-2 text-xs font-bold text-amber">Đọc nhanh <i class="fas fa-arrow-up-right-from-square ml-1.5 text-[10px]"></i></span>
            </div>
        </a>`;
    }
    return `
      <a href="${esc(t.href)}"${linkAttrs(t.href)}
        data-tw-animate="left"
        data-news-index="${i}"
        style="--tw-animate-delay:${Math.min(i, 8) * 35}ms"
        class="news-mini-card group rounded-xl border border-cobalt/20 bg-cobalt/5 px-3 py-2.5 pl-4 text-slate-700 shadow-sm hover:border-amber/50 hover:bg-amber/10">
          <div class="flex items-center justify-between gap-2 text-[11px] leading-none">
            <span class="truncate font-bold text-cobalt/80">${esc(t.nhan)}</span>
            <span class="shrink-0 text-slate-400">${fmtNgay(t.ngay)}</span>
          </div>
          <h3 class="mt-1 text-sm font-normal leading-snug text-cobalt-dark line-clamp-1 group-hover:text-cobalt">${esc(t.tieuDe)}</h3>
          <p class="mt-1 text-xs font-normal leading-snug text-slate-500 line-clamp-1">${esc(t.tomTat)}</p>
      </a>`;
  }).join('');
}

function capNhatNutXemThemTinTuc(total) {
  const btn = document.getElementById('tinTucXemThem');
  const panel = document.getElementById('tin-tuc');
  if (panel) panel.classList.remove('is-expanded');
  if (!btn) return;
  bindNewsRailScroll();
  syncNewsRailVisibleHeight(0);
  updateNewsMoreButtonState();
  requestAnimationFrame(() => {
    syncNewsRailVisibleHeight(0);
    updateNewsMoreButtonState();
  });
}

async function loadTinTuc() {
  const box = document.getElementById('danhSachTinTuc');
  if (!box) return;
  try {
    const list = danhSachTinTucMacDinh();
    if (!list.length) {
      box.innerHTML = '<div class="p-5 text-sm text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-sm">Chưa có tin tức mới.</div>';
      return;
    }
    box.innerHTML = renderTinTucItems(list);
    capNhatNutXemThemTinTuc(list.length);
    initTwAnimate(box);
    queueNewsPanelHeightSync();
  } catch (e) {
    box.innerHTML = `<div class="p-5 text-sm text-red-500 bg-white rounded-2xl border border-slate-200 shadow-sm">Không tải được tin tức: ${esc(e.message)}</div>`;
  }
}

function toggleTinTuc() {
  const box = document.getElementById('danhSachTinTuc');
  if (!box) return;
  const cards = getNewsCards();
  if (!cards.length) return;
  const current = getNewsRailStartIndex(box);
  const maxStart = Math.max(0, cards.length - TIN_TUC_COLLAPSED_COUNT);
  const targetIndex = box.scrollTop >= box.scrollHeight - box.clientHeight - 4
    ? 0
    : Math.min(current + TIN_TUC_SCROLL_STEP, maxStart);
  const target = cards[targetIndex];
  if (!target) return;
  syncNewsRailVisibleHeight(targetIndex);
  const targetTop = Math.max(0, getNewsCardScrollTop(box, target));
  box.scrollTo({ top: targetTop, behavior: 'smooth' });
  setTimeout(updateNewsMoreButtonState, 280);
}

function renderTinTucModalItems(list) {
  return list.map((t, i) => {
    const anh = esc(t.anh || 'marketing/images/projects/ai-outpaint/cat-tuong-smart-city.jpg');
    const hot = i === 0;
    return `
      <a href="${esc(t.href)}"${linkAttrs(t.href)}
        class="news-modal-card group grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-cobalt/30 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div class="relative ${hot ? 'bg-cobalt-dark' : 'bg-slate-100'}">
          <img src="${anh}" alt="${esc(t.tieuDe)}" loading="lazy" class="h-32 w-full object-cover sm:h-full">
          ${hot ? '<span class="absolute left-3 top-3 rounded-full bg-amber px-2.5 py-1 text-[11px] font-bold text-cobalt-dark">Tin nóng</span>' : ''}
        </div>
        <div class="min-w-0 p-4">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="rounded-full bg-cobalt/10 px-2.5 py-1 font-bold text-cobalt">${esc(t.nhan)}</span>
            <span class="text-slate-400">${fmtNgay(t.ngay)}</span>
          </div>
          <h4 class="mt-2 text-base font-bold leading-snug text-cobalt-dark group-hover:text-cobalt">${esc(t.tieuDe)}</h4>
          <p class="mt-1 text-sm leading-relaxed text-slate-500 line-clamp-2">${esc(t.tomTat)}</p>
          <span class="mt-3 inline-flex items-center text-sm font-bold text-cobalt">Đọc nhanh <i class="fas fa-arrow-right ml-2 text-xs"></i></span>
        </div>
      </a>`;
  }).join('');
}

function moDanhSachTinTuc() {
  const list = danhSachTinTucMacDinh();
  const modal = document.getElementById('modalDuAn');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  if (!modal || !title || !body) return;
  title.textContent = 'Tin tức nổi bật';
  body.innerHTML = `
    <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-slate-500">Danh sách tin nổi bật về Cát Tường Group và nhà ở xã hội.</p>
      <span class="inline-flex w-max items-center rounded-full bg-cobalt/10 px-3 py-1 text-sm font-bold text-cobalt">${list.length} tin</span>
    </div>
    <div class="max-h-[68vh] overflow-y-auto pr-1">
      <div class="grid gap-3 md:grid-cols-2">
        ${renderTinTucModalItems(list)}
      </div>
    </div>`;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  initTwAnimate(body);
}

// ---------- BLOG CHI TIẾT ----------
let DOC_REQUEST = null;
let BLOG_CHECK_RESULT = null;
let BLOG_CHECK_CONTEXT = null;
let BLOG_CHECK_FILES = new Map();
const BLOG_TIEN_TRINH_MAC_DINH = [
  { id: 'tiep-nhan-ho-so', ten: 'Tiếp nhận hồ sơ', trangThai: 'done', ngayCapNhat: '2026-07-06', ghiChu: 'Hồ sơ đã được ghi nhận trên hệ thống.' },
  { id: 'phe-duyet-ho-so', ten: 'Phê duyệt hồ sơ', trangThai: 'doing', ngayCapNhat: '2026-07-06', ghiChu: 'Đang cập nhật dữ liệu phê duyệt tương ứng với thông tin tra cứu.' },
  { id: 'ky-hop-dong-mua-ban', ten: 'Ký hợp đồng mua bán', trangThai: 'todo', ngayCapNhat: '2026-07-06', ghiChu: 'Thực hiện sau khi hồ sơ được phê duyệt.' },
  { id: 'ban-giao-can-ho', ten: 'Bàn giao căn hộ', trangThai: 'todo', ngayCapNhat: '2026-07-06', ghiChu: 'Cập nhật theo tiến độ bàn giao từng căn hộ.' },
];

async function apiPostBlog(path, body) {
  try {
    return await apiPost(path, body);
  } catch (e) {
    if (location.protocol === 'file:') return {};
    throw e;
  }
}

function tronNguonThamKhao(...lists) {
  const seen = new Set();
  return lists.flat().filter((item) => {
    if (!item?.href) return false;
    const key = `${item.href}|${item.ten || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function layBaiVietBlog(id) {
  const fallback = BLOG_BAI_VIET_MAC_DINH.find(b => b.id === id);
  try {
    const data = await apiGet('/blog/' + encodeURIComponent(id));
    if (id === 'cap-nhat-quy-can-072026') {
      const hiddenTerms = ['nguồn cung', 'khuyến nghị'];
      const visibleSections = (fallback?.sections || data.sections || []).filter((s) => {
        const title = String(s.tieuDe || '').toLowerCase();
        return !hiddenTerms.some(term => title.includes(term));
      });
      return { ...data, ...fallback, sections: visibleSections, nguonThamKhao: fallback?.nguonThamKhao || [] };
    }
    if (id === 'huong-dan-ho-so-nha-o-xa-hoi') {
      return {
        ...fallback,
        ...data,
        sections: fallback?.sections || data.sections || [],
        vanBanPhapLy: data.vanBanPhapLy || fallback?.vanBanPhapLy,
        taiLieu: data.taiLieu || fallback?.taiLieu,
        nguonThamKhao: fallback?.nguonThamKhao || [],
        tool: 'noxh-profile-selector',
      };
    }
    if (id === 'kiem-tra-ho-so-khach-hang' || id === 'tra-cuu-tien-trinh-phe-duyet-ho-so') {
      return {
        ...fallback,
        ...data,
        sections: fallback?.sections || data.sections || [],
        nguonThamKhao: fallback?.nguonThamKhao || [],
        tool: fallback?.tool || data.tool,
      };
    }
    return fallback ? { ...fallback, ...data, nguonThamKhao: tronNguonThamKhao(data.nguonThamKhao || [], fallback.nguonThamKhao || []) } : data;
  } catch (_) {
    return fallback;
  }
}

function anPortalDeHienBlog() {
  ['top', 'du-an', 'lien-he'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  document.querySelectorAll('header a[href^="#"]').forEach(a => {
    const hash = a.getAttribute('href');
    a.setAttribute('href', trangGioiThieuHref() + hash);
  });
}

function renderBlogInlineLinks(list = []) {
  if (!list.length) return '';
  return `
    <div class="mt-4 flex flex-wrap gap-2">
      ${list.map(link => `
        <a href="${esc(link.href)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 rounded-full border border-cobalt/15 bg-cobalt/5 px-3 py-1.5 text-xs font-bold text-cobalt hover:bg-cobalt/10">
          <i class="fas fa-scale-balanced text-amber"></i>
          <span>${esc(link.ten)}</span>
        </a>`).join('')}
    </div>`;
}

function renderBlogSectionHeader(label, title, desc, badge = '') {
  return `
    <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <div class="min-w-0">
        <p class="uppercase tracking-widest text-amber font-bold text-[11px]">${esc(label)}</p>
        <h2 class="mt-1 text-xl md:text-2xl font-extrabold leading-tight text-cobalt-dark">${esc(title)}</h2>
        ${desc ? `<p class="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 line-clamp-2">${esc(desc)}</p>` : ''}
      </div>
      ${badge ? `<span class="w-max shrink-0 rounded-full bg-cobalt/10 px-3 py-1 text-xs font-bold text-cobalt">${esc(badge)}</span>` : ''}
    </div>`;
}

function stripStepNumber(title = '') {
  return String(title).replace(/^\s*\d+[\.)]\s*/, '');
}

function renderNoxhAudienceSection(s) {
  return `
    <details class="group bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <summary class="list-none cursor-pointer">
        ${renderBlogSectionHeader('Nhóm đối tượng', s.tieuDe, s.moTa, '12 nhóm')}
      </summary>
      <div class="mt-4">
      ${renderBlogInlineLinks(s.links)}
      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        ${(s.cards || []).map(card => `
          <article class="flex min-h-[72px] items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cobalt/10 text-cobalt">
              <i class="fas ${esc(card.icon || 'fa-circle-info')} text-sm"></i>
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-extrabold leading-snug text-cobalt-dark line-clamp-1">${esc(card.title)}</h3>
              <p class="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-2">${esc(card.desc)}</p>
            </div>
          </article>`).join('')}
      </div>
      </div>
    </details>`;
}

function renderNoxhConditionSection(s) {
  return `
    <details class="group bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <summary class="list-none cursor-pointer">
        ${renderBlogSectionHeader('Điều kiện áp dụng', s.tieuDe, s.moTa, 'Mở chi tiết')}
      </summary>
      <div class="mt-4">
      ${renderBlogInlineLinks(s.links)}
      <div class="mt-4 grid gap-2">
        ${(s.steps || []).map(step => `
          <article class="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cobalt/10 text-cobalt">
              <i class="fas ${esc(step.icon || 'fa-check')} text-sm"></i>
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-extrabold text-cobalt-dark">${esc(stripStepNumber(step.title))}</h3>
              <p class="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-2">${esc(step.desc)}</p>
              ${step.points?.length ? `<div class="mt-2 flex flex-wrap gap-1.5">${step.points.slice(0, 2).map(point => `<span class="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">${esc(point)}</span>`).join('')}</div>` : ''}
            </div>
          </article>`).join('')}
      </div>
      ${s.incomes?.length ? `
        <div class="mt-3 rounded-lg border border-amber/25 bg-amber/5 p-3">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 class="text-sm font-extrabold text-cobalt-dark">Ngưỡng thu nhập đang áp dụng</h3>
            <span class="text-[11px] font-bold uppercase tracking-widest text-amber">NĐ 136/2026/NĐ-CP</span>
          </div>
          <div class="mt-2 grid gap-2 sm:grid-cols-3">
            ${s.incomes.map(income => `
              <div class="rounded-md bg-white px-3 py-2 shadow-sm">
                <p class="text-xs font-bold text-slate-500"><i class="fas ${esc(income.icon || 'fa-user')} mr-1 text-cobalt"></i>${esc(income.title)}</p>
                <p class="mt-1 text-sm font-extrabold text-cobalt-dark">${esc(income.amount)}</p>
              </div>`).join('')}
          </div>
        </div>` : ''}
      ${s.notes?.length ? `<details class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"><summary class="cursor-pointer font-bold text-cobalt-dark">Lưu ý thêm</summary><div class="mt-2 grid gap-2 sm:grid-cols-2">${s.notes.map(note => `<p class="flex gap-2 text-xs leading-relaxed"><i class="fas fa-circle-info mt-0.5 text-amber"></i><span>${esc(note)}</span></p>`).join('')}</div></details>` : ''}
      </div>
    </details>`;
}

function renderSalesUpdateSection(s) {
  return `
    <details class="group bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <summary class="list-none cursor-pointer">
        ${renderBlogSectionHeader('Tổng quan đợt công bố', s.tieuDe, s.moTa, s.badge || 'Đợt 3/2026')}
      </summary>
      <div class="mt-4">
      ${renderBlogInlineLinks(s.links)}
      <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        ${(s.stats || []).map((item, index) => `
          <article class="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cobalt/10 text-cobalt">
              <i class="fas ${esc(item.icon || 'fa-chart-simple')} text-sm"></i>
            </span>
            <div class="min-w-0">
              <p class="font-black leading-tight text-cobalt-dark">${esc(item.value)}</p>
              <h3 class="text-xs font-extrabold text-slate-700 line-clamp-1">${esc(item.label)}</h3>
              <p class="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-2">${esc(item.desc)}</p>
            </div>
          </article>`).join('')}
      </div>
      ${s.timeline?.length ? `
        <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 class="text-sm font-extrabold text-cobalt-dark">Các bước cần nhớ</h3>
          <div class="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            ${s.timeline.map(step => `
              <div class="flex gap-2 rounded-md bg-white px-3 py-2 shadow-sm">
                <span class="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-cobalt/10 text-cobalt">
                  <i class="fas ${esc(step.icon || 'fa-circle-check')} text-xs"></i>
                </span>
                <div class="min-w-0">
                <h4 class="text-sm font-extrabold leading-snug text-cobalt-dark line-clamp-1">${esc(stripStepNumber(step.title))}</h4>
                <p class="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-2">${esc(step.desc)}</p>
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
    </details>`;
}

function renderSalesPricingSection(s) {
  return `
    <details class="group bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <summary class="list-none cursor-pointer">
        ${renderBlogSectionHeader('Giá bán', s.tieuDe, s.moTa, 'Mở bảng')}
      </summary>
      <div class="mt-4">
      ${renderBlogInlineLinks(s.links)}
      <div class="mt-4 grid gap-3 md:grid-cols-2">
        ${(s.groups || []).map(group => `
          <article class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div class="flex items-start gap-3">
              <div class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-cobalt shadow-sm">
                <i class="fas ${esc(group.icon || 'fa-building')} text-sm"></i>
              </div>
              <div class="min-w-0">
                <h3 class="text-sm font-extrabold text-cobalt-dark">${esc(group.title)}</h3>
                <p class="mt-1 text-xs text-slate-600 line-clamp-2">${esc(group.desc)}</p>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              ${(group.rows || []).map(row => `
                <div class="min-w-[138px] flex-1 rounded-md border border-slate-100 bg-white px-3 py-2">
                  <span class="block text-xs font-bold text-cobalt-dark">${esc(row[0])}</span>
                  <span class="mt-0.5 block text-xs font-extrabold text-slate-700">${esc(row[1])}</span>
                  <span class="mt-0.5 block text-[11px] text-slate-500 line-clamp-1">${esc(row[2])}</span>
                </div>`).join('')}
            </div>
          </article>`).join('')}
      </div>
      ${s.notes?.length ? `
        <div class="mt-3 grid gap-2 md:grid-cols-3">
          ${s.notes.map(note => `
            <div class="flex gap-2 rounded-lg border border-amber/20 bg-amber/5 px-3 py-2">
              <i class="fas ${esc(note.icon || 'fa-circle-info')} mt-1 text-sm text-cobalt"></i>
              <div>
                <h3 class="text-sm font-extrabold text-cobalt-dark">${esc(note.title)}</h3>
                <p class="mt-0.5 text-xs leading-relaxed text-slate-600 line-clamp-2">${esc(note.desc)}</p>
              </div>
            </div>`).join('')}
        </div>` : ''}
      </div>
    </details>`;
}

function renderVisualCardsSection(s) {
  return `
    <details class="group bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <summary class="list-none cursor-pointer">
        ${renderBlogSectionHeader(s.label || 'Hướng dẫn', s.tieuDe, s.moTa, s.badge || 'Mở chi tiết')}
      </summary>
      <div class="mt-4">
      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        ${(s.cards || []).map((card, index) => `
          <article class="flex min-h-[76px] items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cobalt/10 text-cobalt">
              <i class="fas ${esc(card.icon || 'fa-circle-info')} text-sm"></i>
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-extrabold leading-snug text-cobalt-dark line-clamp-1">${esc(stripStepNumber(card.title))}</h3>
              <p class="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-2">${esc(card.desc)}</p>
            </div>
          </article>`).join('')}
      </div>
      </div>
    </details>`;
}

function renderProcessStepsSection(s) {
  return `
    <details class="group bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <summary class="list-none cursor-pointer">
        ${renderBlogSectionHeader(s.label || 'Quy trình', s.tieuDe, s.moTa, 'Mở các bước')}
      </summary>
      <div class="mt-4">
      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        ${(s.steps || []).map((step, index) => `
          <article class="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-cobalt shadow-sm">
              <i class="fas ${esc(step.icon || 'fa-check')} text-sm"></i>
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-extrabold leading-snug text-cobalt-dark line-clamp-1">${esc(stripStepNumber(step.title))}</h3>
              <p class="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-2">${esc(step.desc)}</p>
            </div>
          </article>`).join('')}
      </div>
      </div>
    </details>`;
}

function renderBlogSections(article) {
  return (article.sections || []).map((s) => {
    if (s.kind === 'sales-update') return renderSalesUpdateSection(s);
    if (s.kind === 'sales-pricing') return renderSalesPricingSection(s);
    if (s.kind === 'visual-cards') return renderVisualCardsSection(s);
    if (s.kind === 'process-steps') return renderProcessStepsSection(s);
    if (s.kind === 'noxh-audience') return renderNoxhAudienceSection(s);
    if (s.kind === 'noxh-condition') return renderNoxhConditionSection(s);
    return `
      <section class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h2 class="text-xl font-extrabold text-cobalt-dark">${esc(s.tieuDe)}</h2>
        ${s.moTa ? `<p class="mt-2 text-sm text-slate-600 leading-relaxed line-clamp-2">${esc(s.moTa)}</p>` : ''}
        ${s.items?.length ? `<ul class="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">${s.items.map(item => `<li class="flex gap-2 rounded-lg bg-slate-50 px-3 py-2"><i class="fas fa-check text-amber mt-1"></i><span class="line-clamp-2">${esc(item)}</span></li>`).join('')}</ul>` : ''}
      </section>`;
  }).join('');
}

function renderBlogVanBan(article) {
  const list = article.vanBanPhapLy || [];
  if (!list.length) return '';
  return `
    <section class="bg-slate-50 rounded-2xl border border-slate-200 p-6 shadow-sm">
      <p class="uppercase tracking-widest text-amber font-bold text-xs">Tổng hợp văn bản pháp lý</p>
      <h2 class="text-2xl font-extrabold text-cobalt-dark mt-1">Văn bản pháp lý</h2>
      <div class="mt-5 grid md:grid-cols-2 gap-4">
        ${list.map(v => `
          <article class="bg-white rounded-xl border border-slate-200 p-4">
            <div class="flex items-center justify-between gap-3 text-xs">
              <span class="font-bold text-cobalt">${esc(v.nhom)}</span>
              <span class="text-slate-400">${fmtNgay(v.ngayCapNhat)}</span>
            </div>
            <h3 class="mt-2 font-extrabold text-cobalt-dark">${esc(v.tieuDe)}</h3>
            <p class="mt-1 text-sm text-slate-600">${esc(v.moTa)}</p>
          </article>`).join('')}
      </div>
    </section>`;
}

function renderKhoTaiLieu(article) {
  const list = article.taiLieu || [];
  if (!list.length) return '';
  return `
    <section class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <p class="uppercase tracking-widest text-amber font-bold text-xs">Kho biểu mẫu</p>
      <h2 class="text-2xl font-extrabold text-cobalt-dark mt-1">Biểu mẫu và tài liệu hướng dẫn</h2>
      <div class="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${list.map(t => `
          <article class="bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-lg bg-cobalt/10 text-cobalt grid place-items-center"><i class="fas fa-file-lines"></i></div>
              <div>
                <span class="text-xs font-semibold text-amber">${esc(t.loai)} · ${esc(t.dinhDang)}</span>
                <h3 class="font-bold text-cobalt-dark leading-snug">${esc(t.ten)}</h3>
              </div>
            </div>
            <p class="mt-3 text-sm text-slate-600 flex-1">${esc(t.moTa)}</p>
            <div class="mt-4 flex gap-2">
              <button onclick="moYeuCauTaiLieu('${esc(t.id)}','xem')" class="flex-1 text-sm font-semibold text-cobalt border border-cobalt/30 px-3 py-2 rounded-lg hover:bg-cobalt/5">Xem mẫu</button>
              <button onclick="moYeuCauTaiLieu('${esc(t.id)}','tai')" class="flex-1 text-sm font-semibold text-white bg-cobalt px-3 py-2 rounded-lg hover:bg-cobalt-dark">Tải xuống</button>
            </div>
          </article>`).join('')}
      </div>
    </section>`;
}

function layNhomHoSoNoxh(id) {
  return NOXH_PROFILE_GROUPS.find(g => g.id === id);
}

function vaiTroNoxh(group, mixedRole = 'dn') {
  if (!group?.mixed) return group?.roles || [];
  return mixedRole === 'free'
    ? ['Người đứng đơn: lao động tự do', 'Vợ/chồng: có đơn vị công tác/doanh nghiệp']
    : ['Người đứng đơn: có đơn vị công tác/doanh nghiệp', 'Vợ/chồng: lao động tự do'];
}

function danhSachDuAnChoSelect() {
  const source = DU_AN_PUBLIC_CACHE.length ? DU_AN_PUBLIC_CACHE : DU_AN_SELECT_FALLBACK;
  const seen = new Set();
  return source.filter((d) => {
    const key = d?.ten || d?.ma;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderDuAnQuanTamSelect(className = '') {
  return `
    <select name="duAnQuanTam" required class="${esc(className || 'w-full min-w-0 px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800 bg-white')}">
      <option value="">Chọn dự án quan tâm *</option>
      ${danhSachDuAnChoSelect().map(d => `<option value="${esc(d.ten)}">${esc(d.ten)}</option>`).join('')}
    </select>`;
}

async function napDanhSachDuAnCongKhai() {
  if (DU_AN_PUBLIC_CACHE.length) return;
  try {
    const list = await apiGet('/du-an');
    DU_AN_PUBLIC_CACHE = Array.isArray(list) ? list : [];
  } catch (e) {
    DU_AN_PUBLIC_CACHE = [];
  }
}

function renderNoxhDownloadButton(key, primary = false) {
  const f = NOXH_DOWNLOAD_FILES[key];
  if (!f) return '';
  const cls = primary
    ? 'bg-cobalt text-white hover:bg-cobalt-dark border-cobalt'
    : 'bg-white text-cobalt hover:bg-cobalt/5 border-cobalt/20';
  return `
    <a href="${esc(NOXH_FILE_BASE + f.file)}" download class="group flex items-start gap-3 rounded-xl border p-3 transition ${cls}">
      <span class="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${primary ? 'bg-white/15' : 'bg-cobalt/10'}">
        <i class="fas ${f.zip ? 'fa-file-archive' : f.file.endsWith('.xlsx') ? 'fa-file-excel' : 'fa-file-word'}"></i>
      </span>
      <span class="min-w-0">
        <span class="block text-sm font-extrabold leading-snug">${esc(f.ten)}</span>
        <span class="mt-1 block text-xs ${primary ? 'text-white/80' : 'text-slate-500'}">${esc(f.moTa)}</span>
      </span>
    </a>`;
}

function noxhTextKey(value) {
  return String(value || '')
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function noxhFileKeysTheoDong(group, row) {
  const title = noxhTextKey(row?.[0]);
  if (title.includes('don dang ky')) return ['donNd136'];
  if (title.includes('doi tuong') && title.includes('doanh nghiep')) return ['mau01a'];
  if (title.includes('doi tuong') && title.includes('thu nhap mua nha')) return ['mau01a'];
  if (title.includes('dieu kien nha o')) return ['mau02', 'mau03'];
  if (title.includes('dieu kien thu nhap')) return ['mau05'];
  if (title.includes('lao dong tu do')) return ['mau05'];
  if (title.includes('tien luong')) return ['salary12'];
  if (title.includes('cam ket')) return ['commitment'];
  return [];
}

function noxhNoFileLabel(row) {
  const title = noxhTextKey(row?.[0]);
  if (title.includes('cccd')) return 'Không cần tải mẫu';
  if (title.includes('ct07') || title.includes('cu tru') || title.includes('ket hon') || title.includes('hon nhan')) return 'Xin trực tiếp';
  if (title.includes('doi tuong mua nha')) return 'Xin xác nhận';
  return 'Theo hồ sơ thực tế';
}

function renderNoxhInlineDownloadButton(key) {
  const f = NOXH_DOWNLOAD_FILES[key];
  if (!f) return '';
  const label = f.ten.replace(/^Mẫu số\s*/i, 'Mẫu ').replace(/^Mẫu\s*/i, 'Mẫu ');
  return `
    <a href="${esc(NOXH_FILE_BASE + f.file)}" download title="${esc(f.ten)}" class="inline-flex items-center gap-1.5 rounded-full border border-cobalt/20 bg-cobalt/5 px-2.5 py-1 text-[11px] font-bold text-cobalt hover:border-cobalt/40 hover:bg-cobalt/10">
      <i class="fas ${f.zip ? 'fa-file-archive' : 'fa-download'} text-[10px]"></i>
      <span>${esc(label)}</span>
    </a>`;
}

function renderNoxhInlineDownloads(group, row) {
  const keys = noxhFileKeysTheoDong(group, row);
  if (!keys.length) {
    return `<span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">${esc(noxhNoFileLabel(row))}</span>`;
  }
  return `<div class="flex flex-wrap gap-1.5">${keys.map(renderNoxhInlineDownloadButton).join('')}</div>`;
}

function renderCongCuHoSoNoxh(article) {
  return `
    <section class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p class="uppercase tracking-widest text-amber font-bold text-[11px]">Lọc hồ sơ theo đối tượng</p>
      <h2 class="mt-1 text-xl md:text-2xl font-extrabold leading-tight text-cobalt-dark">Chọn nhóm để tải đúng bộ hồ sơ NOXH</h2>
      <p class="mt-2 text-sm leading-relaxed text-slate-600 line-clamp-2">Nhập thông tin liên hệ, chọn nhóm phù hợp; hệ thống sẽ hiển thị đúng danh mục giấy tờ và bộ mẫu tải về.</p>
      <p class="mt-2 text-sm font-semibold text-cobalt">Bộ mẫu hồ sơ cập nhật ngày 22/09/2026, gồm mẫu Word và bảng lương Excel.</p>
      <form id="noxhProfileForm" onsubmit="locHoSoNoxh(event)" class="mt-4 grid w-full min-w-0 gap-2 sm:grid-cols-2">
        <input name="hoTen" required placeholder="Họ và tên *" class="w-full min-w-0 px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
        <input name="soDienThoai" required placeholder="Số điện thoại *" class="w-full min-w-0 px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
        <select name="nhomDoiTuong" required onchange="capNhatLuaChonNoxh()" class="w-full min-w-0 sm:col-span-2 px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800 bg-white">
          <option value="">Chọn nhóm đối tượng của bạn *</option>
          ${NOXH_PROFILE_GROUPS.map(g => `<option value="${esc(g.id)}">${esc(g.stt)}. ${esc(g.title)}</option>`).join('')}
        </select>
        <div id="noxhMixedRole" class="hidden sm:col-span-2 rounded-lg border border-amber/30 bg-amber/5 p-3">
          <label class="block text-sm font-bold text-cobalt-dark mb-2">Trong trường hợp một người làm doanh nghiệp, một người lao động tự do</label>
          <select name="mixNguoiDungDon" onchange="capNhatLuaChonNoxh()" class="w-full min-w-0 px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800 bg-white">
            <option value="dn">Người đứng đơn làm doanh nghiệp/có đơn vị công tác</option>
            <option value="free">Người đứng đơn là lao động tự do</option>
          </select>
          <p id="noxhSpouseRole" class="mt-2 text-sm text-slate-600"></p>
        </div>
        <div id="noxhSelectedHint" class="min-w-0 sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Chọn nhóm hồ sơ để xem vai trò người đứng đơn và vợ/chồng nếu có.</div>
        <button class="w-full min-w-0 sm:col-span-2 bg-amber text-cobalt-dark font-bold py-2.5 rounded-lg hover:brightness-105"><i class="fas fa-filter mr-2"></i>Lọc hồ sơ và hiển thị file tải về</button>
        <p class="sm:col-span-2 text-sm text-slate-500" data-form-msg></p>
      </form>
      <div id="noxhProfileResult" class="mt-4"></div>
    </section>`;
}

function capNhatLuaChonNoxh() {
  const form = document.getElementById('noxhProfileForm');
  if (!form) return;
  const group = layNhomHoSoNoxh(form.nhomDoiTuong?.value);
  const mixedBox = document.getElementById('noxhMixedRole');
  const spouse = document.getElementById('noxhSpouseRole');
  const hint = document.getElementById('noxhSelectedHint');
  if (mixedBox) mixedBox.classList.toggle('hidden', !group?.mixed);
  if (!group) {
    if (hint) hint.textContent = 'Chọn nhóm hồ sơ để xem vai trò người đứng đơn và vợ/chồng nếu có.';
    if (spouse) spouse.textContent = '';
    return;
  }
  const mixedRole = form.mixNguoiDungDon?.value || 'dn';
  const roles = vaiTroNoxh(group, mixedRole);
  if (spouse && group.mixed) spouse.textContent = roles[1] || '';
  if (hint) {
    hint.innerHTML = `
      <div class="font-bold text-cobalt-dark">${esc(group.stt)}. ${esc(group.title)}</div>
      <div class="mt-2 grid gap-1">${roles.map(role => `<span><i class="fas fa-check text-amber mr-2"></i>${esc(role)}</span>`).join('')}</div>`;
  }
}

async function locHoSoNoxh(event) {
  event.preventDefault();
  const form = event.target;
  const msg = form.querySelector('[data-form-msg]');
  const data = Object.fromEntries(new FormData(form).entries());
  const group = layNhomHoSoNoxh(data.nhomDoiTuong);
  const hoTen = String(data.hoTen || '').trim();
  const soDienThoai = String(data.soDienThoai || '').trim();
  const phoneDigits = soDienThoai.replace(/\D/g, '');
  if (!hoTen || phoneDigits.length < 8 || !group) {
    msg.textContent = 'Vui lòng nhập họ tên, số điện thoại hợp lệ và chọn nhóm hồ sơ.';
    return;
  }
  const roles = vaiTroNoxh(group, data.mixNguoiDungDon || 'dn');
  msg.textContent = 'Đang lọc hồ sơ phù hợp...';
  try {
    await apiPostBlog('/dang-ky-quan-tam', {
      hoTen,
      soDienThoai,
      duAnQuanTam: 'Hồ sơ mua nhà ở xã hội',
      nguon: 'blog-noxh-ho-so',
      ghiChu: `Tin tức 2 - Hướng dẫn hồ sơ NOXH. Nhóm ${group.stt}: ${group.title}. ${roles.join('; ')}`,
    });
  } catch (e) {
    console.warn('Không lưu được lead NOXH:', e);
  }
  renderKetQuaNoxh(group, { hoTen, soDienThoai, roles });
  msg.textContent = 'Đã hiển thị bộ hồ sơ phù hợp bên dưới.';
}

function renderKetQuaNoxh(group, data) {
  const out = document.getElementById('noxhProfileResult');
  if (!out) return;
  out.innerHTML = `
    <div class="rounded-2xl border border-cobalt/15 bg-slate-50 p-4 sm:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="uppercase tracking-widest text-amber font-bold text-xs">Kết quả lọc hồ sơ</p>
          <h3 class="mt-1 text-xl font-extrabold text-cobalt-dark">Bạn thuộc nhóm ${esc(group.stt)}: ${esc(group.title)}</h3>
          <p class="mt-1 text-sm text-slate-500">Thông tin đã nhập: ${esc(data.hoTen)} - ${esc(data.soDienThoai)}</p>
        </div>
        <span class="w-max rounded-full bg-cobalt/10 px-3 py-1 text-sm font-bold text-cobalt">${esc(group.badge)}</span>
      </div>
      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        ${data.roles.map(role => `<div class="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"><i class="fas fa-user-check text-amber mr-2"></i>${esc(role)}</div>`).join('')}
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        ${renderNoxhInlineDownloadButton(group.downloads[0])}
        ${renderNoxhInlineDownloadButton('zipFull')}
      </div>
      <p class="mt-2 text-xs leading-relaxed text-slate-500">Các tệp tải riêng và bộ ZIP dùng cùng bộ mẫu cập nhật ngày 22/09/2026. Mẫu 02 dùng khi chưa có nhà ở; Mẫu 03 được giữ lại cho trường hợp có nhà ở nhưng diện tích bình quân thấp hơn quy định.</p>
      <div class="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-cobalt-dark text-white">
            <tr>
              <th class="w-12 px-4 py-3 font-bold">STT</th>
              <th class="min-w-[170px] px-4 py-3 font-bold">Danh mục hồ sơ</th>
              <th class="min-w-[190px] px-4 py-3 font-bold">Biểu mẫu tải về</th>
              <th class="px-4 py-3 font-bold">Số lượng</th>
              <th class="min-w-[150px] px-4 py-3 font-bold">Người kê khai</th>
              <th class="min-w-[170px] px-4 py-3 font-bold">Nơi xác nhận</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${group.items.map((row, index) => `
              <tr>
                <td class="px-4 py-3 text-slate-500 font-semibold">${index + 1}</td>
                <td class="px-4 py-3 font-semibold text-cobalt-dark">${esc(row[0])}</td>
                <td class="px-4 py-3">${renderNoxhInlineDownloads(group, row)}</td>
                <td class="px-4 py-3 text-slate-600">${esc(row[1])}</td>
                <td class="px-4 py-3 text-slate-600">${esc(row[2])}</td>
                <td class="px-4 py-3 text-slate-600">${esc(row[3] || 'Theo hồ sơ thực tế')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formThongTinKhachHtml(id, submitName, buttonLabel) {
  return `
    <form id="${esc(id)}" onsubmit="${submitName}(event)" class="grid gap-2 sm:grid-cols-2">
      <input name="hoTen" required placeholder="Họ và tên *" class="px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
      <input name="soDienThoai" required placeholder="Số điện thoại *" class="px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
      <input name="duAnQuanTam" required placeholder="Dự án muốn mua *" class="px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
      <input name="maCanQuanTam" required placeholder="Căn hộ/Mã căn quan tâm *" class="px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
      <button class="sm:col-span-2 bg-amber text-cobalt-dark font-bold py-2.5 rounded-lg hover:brightness-105">${esc(buttonLabel)}</button>
      <p class="sm:col-span-2 text-sm text-slate-500" data-form-msg></p>
    </form>`;
}

function formTraCuuTienTrinhHtml() {
  return `
    <form id="blogTrackerForm" onsubmit="traCuuTienTrinhBlog(event)" class="grid gap-2 lg:grid-cols-3">
      <input name="hoTen" required placeholder="Họ và tên *" autocomplete="name" class="px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
      <input name="soDienThoai" required placeholder="Số điện thoại *" inputmode="tel" autocomplete="tel" class="px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
      <input name="maCanQuanTam" required placeholder="Mã căn cần tra cứu *" class="px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
      <button class="lg:col-span-3 bg-amber text-cobalt-dark font-bold py-2.5 rounded-lg hover:brightness-105"><i class="fas fa-magnifying-glass mr-2"></i>Tra cứu tình trạng</button>
      <p class="lg:col-span-3 text-sm text-slate-500" data-form-msg></p>
    </form>`;
}

function renderCongCuKiemTraHoSoAi() {
  return `
    <section class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p class="uppercase tracking-widest text-amber font-bold text-[11px]">Trợ lý Cát Tường kiểm tra hồ sơ</p>
      <h2 class="mt-1 text-xl md:text-2xl font-extrabold leading-tight text-cobalt-dark">Upload hồ sơ theo đúng nhóm đối tượng</h2>
      <p class="mt-2 text-sm leading-relaxed text-slate-600 line-clamp-2">Nhập thông tin người đứng đơn, chọn nhóm đối tượng; hệ thống mở đúng danh mục hồ sơ để kiểm tra thiếu, sai mẫu và tách riêng hồ sơ vợ/chồng.</p>
      <form id="blogProfileLeadForm" onsubmit="moCongCuKiemTraBlog(event)" class="mt-4 grid w-full min-w-0 gap-2 sm:grid-cols-2">
        <input name="hoTen" required placeholder="Họ và tên người đứng đơn *" class="w-full min-w-0 px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
        <input name="soDienThoai" required placeholder="Số điện thoại *" class="w-full min-w-0 px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800">
        ${renderDuAnQuanTamSelect()}
        <select name="nhomDoiTuong" required onchange="capNhatLuaChonKiemTraHoSo()" class="w-full min-w-0 px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800 bg-white">
          <option value="">Chọn nhóm đối tượng mua nhà *</option>
          ${NOXH_PROFILE_GROUPS.map(g => `<option value="${esc(g.id)}">${esc(g.stt)}. ${esc(g.title)}</option>`).join('')}
        </select>
        <div id="blogMixedRole" class="hidden sm:col-span-2 rounded-lg border border-amber/30 bg-amber/5 p-3">
          <label class="block text-sm font-bold text-cobalt-dark mb-2">Người đứng đơn thuộc nhóm nào?</label>
          <select name="mixNguoiDungDon" onchange="capNhatLuaChonKiemTraHoSo()" class="w-full min-w-0 px-3 py-2.5 rounded-lg border border-slate-300 text-slate-800 bg-white">
            <option value="dn">Người đứng đơn làm doanh nghiệp/có đơn vị công tác</option>
            <option value="free">Người đứng đơn là lao động tự do</option>
          </select>
          <p id="blogSpouseRole" class="mt-2 text-sm text-slate-600"></p>
        </div>
        <div id="blogProfileHint" class="min-w-0 sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Chọn nhóm đối tượng để xem đúng vai trò người đứng đơn và danh mục hồ sơ cần upload.</div>
        <button class="w-full min-w-0 sm:col-span-2 bg-amber text-cobalt-dark font-bold py-2.5 rounded-lg hover:brightness-105"><i class="fas fa-file-arrow-up mr-2"></i>Hiển thị danh mục upload hồ sơ</button>
        <p class="sm:col-span-2 text-sm text-slate-500" data-form-msg></p>
      </form>
      <div id="blogUploadTool" class="mt-4"></div>
    </section>`;
}

function renderCongCuBlog(article) {
  if (article.tool === 'noxh-profile-selector') return renderCongCuHoSoNoxh(article);
  if (article.tool === 'document-library') return renderBlogVanBan(article) + renderKhoTaiLieu(article);
  if (article.tool === 'profile-check') {
    return renderCongCuKiemTraHoSoAi();
  }
  if (article.tool === 'approval-tracker') {
    return `
      <section class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <p class="uppercase tracking-widest text-amber font-bold text-[11px]">Tra cứu tiến trình</p>
        <h2 class="mt-1 text-xl md:text-2xl font-extrabold leading-tight text-cobalt-dark">Nhập họ tên, số điện thoại và mã căn</h2>
        <div class="mt-4">${formTraCuuTienTrinhHtml()}</div>
        <div id="blogTimelineResult" class="mt-4"></div>
      </section>`;
  }
  return '';
}

function renderNguonThamKhao(article) {
  const list = article.nguonThamKhao || [];
  if (!list.length) return '';
  return `
    <section class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p class="uppercase tracking-widest text-amber font-bold text-[11px]">Nguồn tham khảo</p>
        <div class="flex flex-wrap gap-2 text-xs">
        ${list.map(n => `
          <a href="${esc(n.href)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 rounded-full border border-cobalt/15 bg-cobalt/5 px-3 py-1.5 font-bold text-cobalt hover:bg-cobalt/10">
            <span>${esc(n.ten)}</span>
            <i class="fas fa-arrow-up-right-from-square text-[10px] text-amber"></i>
          </a>`).join('')}
        </div>
      </div>
    </section>`;
}

async function renderBangHangCdtPage() {
  anPortalDeHienBlog();
  document.title = 'Tra cứu bảng hàng CĐT — Cát Tường Group';
  document.querySelector('header').insertAdjacentHTML('afterend', `
    <main id="blogPage" class="bg-slate-50">
      <section class="max-w-5xl mx-auto px-4 py-8 md:py-10">
        <a href="${trangGioiThieuHref()}#ho-tro-khach-hang" class="inline-flex items-center text-sm font-semibold text-cobalt hover:text-cobalt-dark"><i class="fas fa-arrow-left mr-2"></i>Quay lại Hỗ trợ khách hàng</a>
        <div data-tw-animate="zoom" class="blog-hero-modern mt-5 bg-cobalt-dark text-white rounded-xl p-5 md:p-6 shadow-sm">
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-200">
            <span class="bg-amber text-cobalt-dark font-bold px-2 py-0.5 rounded-full">Bảng hàng</span>
          </div>
          <h1 class="mt-3 text-2xl md:text-3xl font-extrabold leading-tight">Tra cứu bảng hàng CĐT</h1>
          <p class="mt-2 max-w-3xl text-sm leading-relaxed text-slate-200 md:text-base">Chọn dự án, sau đó chọn tòa đang mở bán để xem mã căn và giá từng căn theo bảng hàng chủ đầu tư.</p>
        </div>
        <div id="bangHangCdtDetail" class="mt-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 shadow-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải bảng hàng...</div>
        </div>
      </section>
    </main>`);
  window.scrollTo({ top: 0, behavior: 'auto' });
  initTwAnimate(document.getElementById('blogPage'));
  const detail = document.getElementById('bangHangCdtDetail');
  try {
    const data = await loadQuyCan072026();
    if (detail) {
      detail.innerHTML = renderBangHangSupport(data);
      initTwAnimate(detail);
    }
  } catch (e) {
    if (detail) detail.innerHTML = `<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">${esc(e.message)}</div>`;
  }
}

async function renderBlogPage(id) {
  if (id === BANG_HANG_CDT_ITEM.id) {
    await renderBangHangCdtPage();
    return;
  }
  const article = await layBaiVietBlog(id);
  anPortalDeHienBlog();
  if (!article) {
    document.querySelector('header').insertAdjacentHTML('afterend', `<main id="blogPage" class="max-w-4xl mx-auto px-4 py-16"><div class="bg-white rounded-2xl border border-slate-200 p-8 text-center"><h1 class="text-2xl font-extrabold text-cobalt-dark">Không tìm thấy bài viết</h1><a class="inline-flex mt-4 text-cobalt font-semibold" href="${trangGioiThieuHref()}">Quay lại trang giới thiệu</a></div></main>`);
    return;
  }
  if (article.tool === 'profile-check') await napDanhSachDuAnCongKhai();
  document.title = `${article.tieuDe} — Cát Tường Group`;
  document.querySelector('header').insertAdjacentHTML('afterend', `
    <main id="blogPage" class="bg-slate-50">
      <section class="max-w-5xl mx-auto px-4 py-8 md:py-10">
        <a href="${trangGioiThieuHref()}#tin-tuc" class="inline-flex items-center text-sm font-semibold text-cobalt hover:text-cobalt-dark"><i class="fas fa-arrow-left mr-2"></i>Quay lại Tin tức</a>
        <div data-tw-animate="zoom" class="blog-hero-modern mt-5 bg-cobalt-dark text-white rounded-xl p-5 md:p-6 shadow-sm">
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-200">
            <span class="bg-amber text-cobalt-dark font-bold px-2 py-0.5 rounded-full">${esc(article.nhan)}</span>
            <span>${fmtNgay(article.ngay)}</span>
          </div>
          <h1 class="mt-3 text-2xl md:text-3xl font-extrabold leading-tight">${esc(article.tieuDe)}</h1>
          <p class="mt-2 max-w-3xl text-sm leading-relaxed text-slate-200 md:text-base">${esc(article.tomTat)}</p>
        </div>
        <div class="mt-4 space-y-3">
          ${renderBlogSections(article)}
          ${renderCongCuBlog(article)}
          ${renderNguonThamKhao(article)}
        </div>
      </section>
    </main>`);
  window.scrollTo({ top: 0, behavior: 'auto' });
  initTwAnimate(document.getElementById('blogPage'));
}

function timTaiLieuBlog(id) {
  const blogId = layBlogIdTuUrl();
  const article = BLOG_BAI_VIET_MAC_DINH.find(b => b.id === blogId);
  return (article?.taiLieu || BLOG_TAI_LIEU_MAC_DINH).find(t => t.id === id);
}

function moYeuCauTaiLieu(taiLieuId, hanhDong) {
  DOC_REQUEST = { taiLieuId, hanhDong };
  const modal = document.getElementById('modalDuAn');
  document.getElementById('modalTitle').textContent = hanhDong === 'xem' ? 'Xem mẫu tài liệu' : 'Tải tài liệu';
  document.getElementById('modalBody').innerHTML = `
    <p class="text-sm text-slate-600 mb-4">Vui lòng nhập đầy đủ thông tin để tiếp tục.</p>
    ${formThongTinKhachHtml('docGateForm', 'guiYeuCauTaiLieu', hanhDong === 'xem' ? 'Xem mẫu' : 'Tải xuống')}`;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

async function guiYeuCauTaiLieu(event) {
  event.preventDefault();
  const form = event.target;
  const msg = form.querySelector('[data-form-msg]');
  const data = Object.fromEntries(new FormData(form).entries());
  msg.textContent = 'Đang xử lý...';
  try {
    const result = await apiPostBlog('/yeu-cau-tai-lieu', { ...data, baiVietId: layBlogIdTuUrl(), taiLieuId: DOC_REQUEST.taiLieuId, hanhDong: DOC_REQUEST.hanhDong });
    const fallback = timTaiLieuBlog(DOC_REQUEST.taiLieuId);
    const file = result.file || fallback?.file;
    dongModal();
    if (!file) return;
    if (DOC_REQUEST.hanhDong === 'tai') {
      const a = document.createElement('a');
      a.href = file;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      window.open(file, '_blank', 'noopener');
    }
  } catch (e) {
    msg.textContent = e.message;
  }
}

function capNhatLuaChonKiemTraHoSo() {
  const form = document.getElementById('blogProfileLeadForm');
  if (!form) return;
  const group = layNhomHoSoNoxh(form.nhomDoiTuong?.value);
  const mixedBox = document.getElementById('blogMixedRole');
  const spouse = document.getElementById('blogSpouseRole');
  const hint = document.getElementById('blogProfileHint');
  if (mixedBox) mixedBox.classList.toggle('hidden', !group?.mixed);
  if (!group) {
    if (hint) hint.textContent = 'Chọn nhóm đối tượng để xem đúng vai trò người đứng đơn và danh mục hồ sơ cần upload.';
    if (spouse) spouse.textContent = '';
    return;
  }
  const roles = vaiTroNoxh(group, form.mixNguoiDungDon?.value || 'dn');
  if (spouse && group.mixed) spouse.textContent = roles[1] || '';
  if (hint) {
    hint.innerHTML = `
      <div class="font-bold text-cobalt-dark">${esc(group.stt)}. ${esc(group.title)}</div>
      <div class="mt-2 grid gap-1">${roles.map(role => `<span><i class="fas fa-user-check text-amber mr-2"></i>${esc(role)}</span>`).join('')}</div>`;
  }
}

function normalizeHoSoText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

const NOXH_MAU_UPLOAD_HELP = {
  donNd136: { label: 'Mẫu 01', desc: 'Đơn đăng ký mua/thuê mua/thuê nhà ở xã hội.' },
  mau01a: { label: 'Mẫu 01a', desc: 'Xác nhận đối tượng và thu nhập cho người có đơn vị công tác/doanh nghiệp.' },
  mau02: { label: 'Mẫu 02', desc: 'Xác nhận chưa có nhà ở tại tỉnh/thành phố nơi có dự án.' },
  mau03: { label: 'Mẫu 03', desc: 'Xác nhận có nhà nhưng diện tích bình quân thấp hơn quy định.' },
  mau05: { label: 'Mẫu 05', desc: 'Xác nhận đối tượng/thu nhập cho lao động tự do.' },
  salary12: { label: 'Bảng lương 12 tháng', desc: 'Bảng xác nhận tiền lương 12 tháng liền kề để đối chiếu thu nhập.' },
  cccd: { label: 'CCCD/Căn cước', desc: 'Bản sao chứng thực hoặc bản scan rõ ảnh, số định danh, ngày sinh, địa chỉ.' },
  ct07: { label: 'CT07', desc: 'Xác nhận thông tin cư trú do Công an/cơ quan đăng ký cư trú cấp.' },
  honNhan: { label: 'Tình trạng hôn nhân', desc: 'Giấy xác nhận độc thân/ly hôn/góa còn thời hạn.' },
  ketHon: { label: 'Đăng ký kết hôn', desc: 'Bản sao chứng thực hoặc bản photo kèm bản gốc đối chiếu.' },
  commitment: { label: 'Bản cam kết', desc: 'Cam kết nội bộ về tính trung thực, điều kiện nhà ở, thu nhập và chính sách NOXH.' },
  thucTe: { label: 'Hồ sơ thực tế', desc: 'Không có mẫu riêng, upload đúng giấy tờ tương ứng.' },
};

function hoSoTemplateKeys(row) {
  const title = normalizeHoSoText(row?.[0]);
  const mau = normalizeHoSoText(row?.[4]);
  const text = `${title} ${mau}`;
  const keys = [];
  if (title.includes('don dang ky') || text.includes('mau so 01 - phu luc')) keys.push('donNd136');
  if (text.includes('01a')) keys.push('mau01a');
  if (text.includes('mau so 02') || text.includes('mau 02')) keys.push('mau02');
  if (text.includes('mau so 03') || text.includes('mau 03')) keys.push('mau03');
  if (text.includes('mau so 05') || text.includes('mau 05')) keys.push('mau05');
  if (title.includes('luong')) keys.push('salary12');
  if (title.includes('cccd') || title.includes('cmnd') || title.includes('can cuoc')) keys.push('cccd');
  if (title.includes('ct07') || title.includes('cu tru')) keys.push('ct07');
  if (title.includes('tinh trang hon nhan')) keys.push('honNhan');
  if (title.includes('dang ky ket hon')) keys.push('ketHon');
  if (title.includes('cam ket')) keys.push('commitment');
  return keys.length ? [...new Set(keys)] : ['thucTe'];
}

function soLuongToiThieuHoSo(value) {
  const m = String(value || '').match(/\d+/);
  return m ? Math.max(1, Number(m[0])) : 1;
}

function nguongThuNhapTheoNhom(group) {
  const title = normalizeHoSoText(group?.title || '');
  return title.includes('doc than') ? 25000000 : 50000000;
}

function parseTienVnd(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return n > 0 && n < 1000 ? n * 1000000 : n;
}

function fmtTienVnd(value) {
  return Number(value || 0).toLocaleString('vi-VN') + ' đồng';
}

function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

function tomTatHuongDanKiemTra(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const first = clean.split(/(?<=\.)\s+/)[0] || clean;
  return first.length > 170 ? first.slice(0, 167) + '...' : first;
}

function renderMauUpload(doc) {
  const keys = doc.templateKeys?.length ? doc.templateKeys : ['thucTe'];
  const labels = keys.map(key => NOXH_MAU_UPLOAD_HELP[key]?.label || key);
  const desc = keys.map(key => NOXH_MAU_UPLOAD_HELP[key]?.desc).filter(Boolean).join(' ');
  return `
    <div class="font-extrabold text-cobalt-dark">${esc(labels.join(' / '))}</div>
    <div class="mt-1 text-[11px] leading-snug text-slate-500">${esc(desc || doc.mauSuDung || 'Upload đúng file hồ sơ tương ứng.')}</div>`;
}

function hoSoKeywords(doc) {
  const text = normalizeHoSoText(`${doc.ten || ''} ${doc.mauSuDung || ''} ${(doc.templateKeys || []).join(' ')}`);
  const keys = new Set(text.split(/\s+/).filter(x => x.length > 2));
  const add = (...items) => items.forEach(item => keys.add(item));
  (doc.templateKeys || []).forEach((key) => {
    if (key === 'donNd136') add('don', 'dang', 'ky', 'mua', 'mau01', 'mau 01');
    if (key === 'mau01a') add('01a', 'mau01a', 'doi', 'tuong', 'thu', 'nhap');
    if (key === 'mau02') add('02', 'mau02', 'nha', 'o');
    if (key === 'mau03') add('03', 'mau03', 'nha', 'o');
    if (key === 'mau05') add('05', 'mau05', 'thu', 'nhap', 'tu', 'do');
    if (key === 'salary12') add('luong', 'bang', 'salary', '12');
    if (key === 'cccd') add('cccd', 'cmnd', 'can', 'cuoc');
    if (key === 'ct07') add('ct07', 'cu', 'tru');
    if (key === 'honNhan') add('hon', 'nhan', 'doc', 'than');
    if (key === 'ketHon') add('ket', 'hon');
    if (key === 'commitment') add('cam', 'ket');
  });
  return [...keys];
}

function canTachVoChong(group, row) {
  const title = normalizeHoSoText(row?.[0]);
  const person = normalizeHoSoText(row?.[2]);
  const qty = normalizeHoSoText(row?.[1]);
  const married = normalizeHoSoText(group?.title).includes('ket hon');
  if (!married) return false;
  if (title.includes('dang ky ket hon') || title.includes('ban cam ket') || title.includes('don dang ky')) return false;
  if (person.includes('hai vo chong') || qty.includes('02') || qty.includes('01-02')) return true;
  return title.includes('cccd') || title.includes('ct07');
}

function taoDocUpload(group, row, index, subIndex = 0, doiTuong = '') {
  const templateKeys = hoSoTemplateKeys(row);
  const suffix = doiTuong ? ` - ${doiTuong}` : '';
  const doc = {
    id: `hoso-${index}${subIndex ? `-${subIndex}` : ''}`,
    index,
    stt: subIndex ? `${index + 1}.${subIndex}` : `${index + 1}`,
    baseTen: row[0],
    ten: `${row[0]}${suffix}`,
    soLuong: subIndex ? '01 bản' : row[1],
    nguoiKeKhai: doiTuong || row[2],
    mauSuDung: row[4] || 'Theo hồ sơ thực tế',
    huongDanKiemTra: row[5] || '',
    templateKeys,
    toiThieu: 1,
    doiTuong,
  };
  doc.keywords = hoSoKeywords(doc);
  return doc;
}

function taoDanhMucUploadHoSo(group) {
  return (group?.items || []).flatMap((row, index) => {
    if (!canTachVoChong(group, row)) return [taoDocUpload(group, row, index)];
    return [
      taoDocUpload(group, row, index, 1, 'Chồng'),
      taoDocUpload(group, row, index, 2, 'Vợ'),
    ];
  });
}

async function moCongCuKiemTraBlog(event) {
  event.preventDefault();
  const form = event.target;
  const msg = form.querySelector('[data-form-msg]');
  const data = Object.fromEntries(new FormData(form).entries());
  const group = layNhomHoSoNoxh(data.nhomDoiTuong);
  const hoTen = String(data.hoTen || '').trim();
  const soDienThoai = String(data.soDienThoai || '').trim();
  const phoneDigits = soDienThoai.replace(/\D/g, '');
  if (!hoTen || phoneDigits.length < 8 || !data.duAnQuanTam || !group) {
    msg.textContent = 'Vui lòng nhập họ tên, số điện thoại, dự án quan tâm và chọn nhóm đối tượng.';
    return;
  }
  const roles = vaiTroNoxh(group, data.mixNguoiDungDon || 'dn');
  BLOG_CHECK_CONTEXT = {
    lead: { ...data, hoTen, soDienThoai, nhomTitle: group.title },
    group,
    roles,
    docs: taoDanhMucUploadHoSo(group),
  };
  BLOG_CHECK_FILES = new Map();
  BLOG_CHECK_RESULT = null;
  msg.textContent = 'Đang mở danh mục hồ sơ cần upload...';
  try {
    await apiPostBlog('/blog-lead', {
      ...BLOG_CHECK_CONTEXT.lead,
      baiVietId: layBlogIdTuUrl(),
      loaiTuongTac: 'upload-tro-ly-cat-tuong-kiem-tra-ho-so',
      ghiChu: `Tin tức 3 - Trợ lý Cát Tường kiểm tra hồ sơ. Nhóm ${group.stt}: ${group.title}. ${roles.join('; ')}`,
    });
  } catch (e) {
    console.warn('Không lưu được lead kiểm tra hồ sơ:', e);
  }
  renderUploadKiemTraHoSoAi();
  msg.textContent = 'Đã hiển thị danh mục hồ sơ cần upload bên dưới.';
}

function layFilesCuaDoc(docId) {
  return BLOG_CHECK_FILES.get(docId) || [];
}

function ganFilesChoDoc(docId, files, append = false) {
  const current = append ? layFilesCuaDoc(docId) : [];
  const next = [...current, ...files].filter((file, index, arr) => (
    arr.findIndex(x => x.name === file.name && x.size === file.size && x.lastModified === file.lastModified) === index
  ));
  if (next.length) BLOG_CHECK_FILES.set(docId, next);
  else BLOG_CHECK_FILES.delete(docId);
}

function taoFileAoTuPdfScan(file, pageNumber, totalPages) {
  return {
    name: `${file.name} - trang ${pageNumber}`,
    size: Math.max(1, Math.round((file.size || totalPages || 1) / Math.max(1, totalPages || 1))),
    lastModified: `${file.lastModified || Date.now()}-p${pageNumber}`,
    type: 'application/pdf',
    sourcePdfName: file.name,
    pageNumber,
    totalPages,
    isPdfScanPage: true,
  };
}

function moTaTrangPdfScan(pages) {
  const list = [...new Set((pages || []).map(Number).filter(Boolean))].sort((a, b) => a - b);
  if (!list.length) return 'trang chưa rõ';
  const ranges = [];
  let start = list[0];
  let prev = list[0];
  for (let i = 1; i <= list.length; i += 1) {
    const page = list[i];
    if (page === prev + 1) {
      prev = page;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = page;
    prev = page;
  }
  return `trang ${ranges.join(', ')}`;
}

function taoFileAoTuPdfScanAi(file, assignment) {
  const pages = [...new Set((assignment.pages || []).map(Number).filter(Boolean))].sort((a, b) => a - b);
  const pageText = moTaTrangPdfScan(pages);
  const title = assignment.detectedTitle || assignment.summary || 'AI đã đọc';
  return {
    name: `${file.name} - ${pageText} (${String(title).slice(0, 90)})`,
    size: Math.max(1, Math.round((file.size || pages.length || 1) * Math.max(1, pages.length) / Math.max(1, assignment.totalPages || pages.length || 1))),
    lastModified: `${file.lastModified || Date.now()}-${pages.join('_')}-${assignment.docId || 'unknown'}`,
    type: 'application/pdf',
    sourcePdfName: file.name,
    pageNumber: pages[0] || 1,
    pages,
    totalPages: assignment.totalPages || pages.length,
    isPdfScanPage: true,
    aiClassified: true,
    aiDocId: assignment.docId,
    aiConfidence: Number(assignment.confidence) || 0,
    aiDetectedTitle: assignment.detectedTitle || '',
    aiDetectedPerson: assignment.detectedPerson || '',
    aiStatus: assignment.status || 'unknown',
    aiSummary: assignment.summary || '',
    aiIssues: Array.isArray(assignment.issues) ? assignment.issues : [],
    aiOcrText: assignment.ocrText || '',
    aiOcrPages: Array.isArray(assignment.ocrPages) ? assignment.ocrPages : [],
    aiReadMethod: assignment.readMethod || assignment.provider || 'ai-read',
    aiGuessUsed: !!assignment.aiGuessUsed,
    aiProvider: assignment.provider || '',
  };
}

function renderChiTietAiDocFile(file) {
  const pages = Array.isArray(file.aiOcrPages) ? file.aiOcrPages : [];
  const text = file.aiOcrText || pages.map(page => `Trang ${page.page}: ${page.text || ''}`).join('\n\n');
  const confidence = Math.round((Number(file.aiConfidence) || 0) * 100);
  const targetLabel = file.isPdfScanPage ? moTaTrangPdfScan(file.pages || [file.pageNumber]) : 'file này';
  const passText = pages
    .flatMap(page => Array.isArray(page.passes) ? page.passes : [])
    .filter(Boolean)
    .slice(0, 10)
    .join(', ');
  return `
    <div class="mt-2 rounded-lg border border-cobalt/15 bg-white p-2.5 text-[11px] leading-relaxed text-slate-700">
      <div class="font-extrabold text-cobalt-dark"><i class="fas fa-eye mr-1.5"></i>AI/OCR đã đọc ${esc(targetLabel)}</div>
      <div class="mt-1 grid gap-1">
        <div><b>Loại AI/OCR:</b> ${esc(file.aiReadMethod || file.aiProvider || 'ai-read')} ${file.aiGuessUsed ? '<span class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">đã đọc lại/suy luận chữ mờ</span>' : ''}</div>
        <div><b>Độ tin cậy:</b> ${confidence ? `${confidence}%` : 'chưa rõ'}${passText ? ` · <b>Pass OCR:</b> ${esc(passText)}` : ''}</div>
        ${file.aiDetectedTitle ? `<div><b>Tiêu đề nhận diện:</b> ${esc(file.aiDetectedTitle)}</div>` : ''}
        ${file.aiSummary ? `<div><b>Kết luận:</b> ${esc(file.aiSummary)}</div>` : ''}
        ${file.aiIssues?.length ? `<div class="text-amber-800"><b>Cần rà soát:</b> ${esc(file.aiIssues.join(' '))}</div>` : ''}
      </div>
      <pre class="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-700">${esc(text || 'AI/OCR chưa trả nội dung chữ đọc được cho file này.')}</pre>
    </div>`;
}

function moNoiDungAiDocHoSo(docId, fileIndex) {
  const el = document.getElementById(`blogAiRead-${docId}-${fileIndex}`);
  if (!el) return;
  el.classList.toggle('hidden');
}

function danhMucHoSoChoAi(docs) {
  return (docs || []).map(doc => ({
    id: doc.id,
    stt: doc.stt,
    ten: doc.ten,
    mauSuDung: doc.mauSuDung,
    nguoiKeKhai: doc.nguoiKeKhai,
    doiTuong: doc.doiTuong,
    moTa: doc.moTa,
    keywords: doc.keywords || [],
    templateKeys: doc.templateKeys || [],
  }));
}

function nhanDungSaiFileHoSo(file) {
  if (file.aiOcrStatus === 'processing') {
    return { text: 'Đang kiểm tra', cls: 'font-extrabold text-amber-800' };
  }
  if (file.aiOcrStatus === 'error' || ['error', 'warning', 'unknown'].includes(file.aiStatus)) {
    return { text: 'Sai', cls: 'font-extrabold text-red-700' };
  }
  return { text: 'Đúng', cls: 'font-extrabold text-green-700' };
}

function renderFileListHoSo(doc) {
  const files = layFilesCuaDoc(doc.id);
  if (!files.length) {
    return `
      <label class="inline-flex cursor-pointer items-center justify-center rounded-lg border border-cobalt/20 bg-cobalt/5 px-3 py-2 text-xs font-bold text-cobalt hover:bg-cobalt/10">
        <i class="fas fa-upload mr-2"></i>Upload file
        <input type="file" multiple class="blog-ai-file hidden" data-doc-id="${esc(doc.id)}" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" onchange="capNhatTrangThaiUploadHoSo(this)">
      </label>`;
  }
  return `
    <div class="space-y-1">
      ${files.map((file, index) => {
        const isProcessing = file.aiOcrStatus === 'processing';
        const isOcrError = file.aiOcrStatus === 'error';
        const canRead = file.aiClassified || !!file.aiOcrText;
        const shortStatus = nhanDungSaiFileHoSo(file);
        const tone = isProcessing
          ? 'border-amber-100 bg-amber-50 text-amber-800'
          : isOcrError
            ? 'border-red-100 bg-red-50 text-red-800'
            : 'border-green-100 bg-green-50 text-green-800';
        const icon = isProcessing ? 'fa-spinner fa-spin' : isOcrError ? 'fa-file-circle-xmark' : 'fa-file-circle-check';
        return `
        <div class="rounded-lg border ${tone} px-2.5 py-1.5 text-xs">
          <div class="flex items-center justify-between gap-2">
            ${canRead ? `
              <button type="button" class="min-w-0 truncate text-left font-bold hover:underline" title="Bấm để xem AI/OCR đã đọc gì trong file này" onclick="moNoiDungAiDocHoSo('${esc(doc.id)}', ${index})">
                <i class="fas ${icon} mr-1.5"></i>${esc(file.name)}
              </button>` : `
              <span class="min-w-0 truncate" title="${esc(file.name)}"><i class="fas ${icon} mr-1.5"></i>${esc(file.name)}</span>`}
            <div class="flex shrink-0 items-center gap-1">
              ${canRead ? `
                <button type="button" class="grid h-6 w-6 place-items-center rounded-full bg-white text-cobalt hover:bg-cobalt/5" title="Xem AI/OCR đã đọc gì" onclick="moNoiDungAiDocHoSo('${esc(doc.id)}', ${index})">
                  <i class="fas fa-eye"></i>
                </button>` : ''}
              <button type="button" class="grid h-6 w-6 place-items-center rounded-full bg-white text-red-600 hover:bg-red-50" title="Xóa file này" onclick="xoaFileHoSo('${esc(doc.id)}', ${index})">
                <i class="fas fa-xmark"></i>
              </button>
            </div>
          </div>
          ${isProcessing ? `
            <div class="mt-1 text-[11px] leading-snug text-amber-800">
              Trợ lý Cát Tường đang đọc OCR file scan/ảnh ở nền...
            </div>` : ''}
          ${isOcrError ? `
            <div class="mt-1 text-[11px] leading-snug text-red-800">
              Sai
            </div>` : ''}
          ${canRead ? `
            <div class="mt-1 text-[11px] leading-snug ${shortStatus.cls}">
              ${esc(shortStatus.text)}
            </div>
            <div id="blogAiRead-${esc(doc.id)}-${index}" class="hidden">${renderChiTietAiDocFile(file)}</div>` : ''}
        </div>`; }).join('')}
      <label class="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-cobalt hover:bg-cobalt/5">
        <i class="fas fa-rotate mr-1.5"></i>Đổi file
        <input type="file" multiple class="blog-ai-file hidden" data-doc-id="${esc(doc.id)}" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" onchange="capNhatTrangThaiUploadHoSo(this)">
      </label>
    </div>`;
}

function capNhatMotDongUpload(docId) {
  const doc = BLOG_CHECK_CONTEXT?.docs?.find(item => item.id === docId);
  if (!doc) return;
  const cell = document.getElementById(`blogFileCell-${docId}`);
  if (cell) cell.innerHTML = renderFileListHoSo(doc);
  capNhatTrangThaiNhomUpload(doc);
  const status = document.getElementById(`blogDocStatus-${docId}`);
  const count = layFilesCuaDoc(docId).length;
  if (status) {
    status.className = count
      ? 'rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700'
      : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500';
    status.textContent = count ? `${count} file` : 'Chưa upload';
  }
}

function laFileCoTheDocOcr(file) {
  const name = String(file?.name || '');
  const type = String(file?.type || '').toLowerCase();
  return /\.(pdf|jpe?g|png|webp)$/i.test(name) || ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(type);
}

function fileVanConTrongDoc(docId, file) {
  return layFilesCuaDoc(docId).includes(file);
}

function diemTinCayOcr(result) {
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  if (Number.isFinite(Number(result?.confidence))) return Math.max(0, Math.min(1, Number(result.confidence)));
  return pages.reduce((sum, page) => sum + (Number(page?.confidence) || 0), 0) / Math.max(1, pages.length);
}

function ganKetQuaOcrChoFile(file, result, docId) {
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  const ocrText = String(result?.text || pages.map(page => `Trang ${page.page}: ${page.text || ''}`).join('\n\n')).trim();
  const confidence = diemTinCayOcr(result);
  file.aiOcrStatus = 'done';
  file.aiClassified = true;
  file.aiDocId = docId;
  file.aiConfidence = confidence;
  file.aiDetectedTitle = pages.map(page => String(page.text || '').replace(/\s+/g, ' ').trim()).find(text => text.length > 12)?.slice(0, 180) || '';
  file.aiDetectedPerson = '';
  file.aiStatus = ocrText ? (confidence < 0.45 ? 'warning' : 'ok') : 'unknown';
  file.aiSummary = ocrText
    ? `OCR đã đọc được ${pages.length || 1} trang/ảnh trong file này.`
    : 'OCR chưa đọc được chữ rõ ràng trong file này.';
  file.aiIssues = Array.isArray(result?.warnings) ? result.warnings : [];
  file.aiOcrText = ocrText;
  file.aiOcrPages = pages.map(page => ({
    page: Number(page.page) || 1,
    text: String(page.text || '').slice(0, 2500),
    confidence: Math.max(0, Math.min(1, Number(page.confidence) || 0)),
    source: String(page.source || 'ocr'),
    passes: Array.isArray(page.passes) ? page.passes : [],
  }));
  file.aiReadMethod = result?.readMethod || result?.provider || 'ocr-local';
  file.aiGuessUsed = !!result?.aiGuessUsed || pages.some(page => page.guessed || (Number(page.confidence) > 0 && Number(page.confidence) < 0.68));
  file.aiProvider = result?.provider || 'ocr-local';
  file.pages = pages.length ? pages.map(page => Number(page.page) || 1) : [1];
  file.pageNumber = file.pages[0] || 1;
}

async function doiKetQuaDocOcr(jobId, docId, file) {
  const started = Date.now();
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await sleep(attempt ? 1800 : 700);
    if (!fileVanConTrongDoc(docId, file)) return null;
    const state = await apiGet(`/ho-so/doc-ocr/${encodeURIComponent(jobId)}`);
    if (state.status === 'done' && state.result) return state.result;
    if (state.status === 'error') throw new Error(state.error || 'OCR chưa đọc được file scan/ảnh này.');
    file.aiSummary = `Trợ lý Cát Tường đang đọc OCR (${Math.max(1, Math.round((Date.now() - started) / 1000))}s)...`;
    capNhatMotDongUpload(docId);
  }
  throw new Error('OCR vẫn đang đọc file này quá lâu. Vui lòng thử lại với file rõ hơn hoặc ít trang hơn.');
}

async function docOcrFileHoSo(docId, file) {
  if (!BLOG_CHECK_CONTEXT || !laFileCoTheDocOcr(file) || file.aiOcrStatus === 'done') return;
  file.aiOcrStatus = 'processing';
  file.aiSummary = 'Trợ lý Cát Tường đang đọc OCR file scan/ảnh ở nền...';
  capNhatMotDongUpload(docId);
  try {
    const formData = new FormData();
    formData.append('file', file);
    const accepted = await apiPostForm('/ho-so/doc-ocr', formData);
    const result = accepted?.jobId ? await doiKetQuaDocOcr(accepted.jobId, docId, file) : accepted;
    if (!result || !fileVanConTrongDoc(docId, file)) return;
    ganKetQuaOcrChoFile(file, result, docId);
  } catch (error) {
    if (!fileVanConTrongDoc(docId, file)) return;
    file.aiOcrStatus = 'error';
    file.aiClassified = false;
    file.aiStatus = 'error';
    file.aiSummary = `OCR chưa đọc được file này: ${error.message || error}`;
    file.aiIssues = [file.aiSummary];
  } finally {
    if (fileVanConTrongDoc(docId, file)) {
      capNhatMotDongUpload(docId);
      if (BLOG_CHECK_RESULT) {
        BLOG_CHECK_RESULT = tinhKiemTraAiHoSo();
        capNhatKetQuaTungDongHoSo(BLOG_CHECK_RESULT);
        renderKetQuaKiemTraAiHoSo(BLOG_CHECK_RESULT);
      }
    }
  }
}

function capNhatTrangThaiUploadHoSo(input) {
  const docId = input.dataset.docId;
  if (!docId) return;
  const files = Array.from(input.files || []);
  files.forEach((file) => {
    if (laFileCoTheDocOcr(file)) {
      file.aiOcrStatus = 'processing';
      file.aiSummary = 'Trợ lý Cát Tường đang đọc OCR file scan/ảnh ở nền...';
    }
  });
  ganFilesChoDoc(docId, files);
  input.value = '';
  capNhatMotDongUpload(docId);
  files.filter(laFileCoTheDocOcr).forEach(file => docOcrFileHoSo(docId, file));
}

function xoaFileHoSo(docId, fileIndex) {
  const files = layFilesCuaDoc(docId).filter((_, index) => index !== fileIndex);
  ganFilesChoDoc(docId, files);
  capNhatMotDongUpload(docId);
  const resultCell = document.getElementById(`blogDocResult-${docId}`);
  if (resultCell) resultCell.innerHTML = renderTrangThaiDongHoSo({ status: 'pending', note: 'File đã thay đổi, vui lòng kiểm tra lại.' });
}

function diemKhopTextVoiDoc(rawText, doc) {
  const name = normalizeHoSoText(rawText);
  let score = 0;
  const has = (...terms) => terms.some(term => name.includes(term));
  (doc.templateKeys || []).forEach((key) => {
    if (key === 'donNd136' && has('mau 01', 'mau_01', 'mau01', 'don dang ky')) score += 8;
    if (key === 'mau01a' && has('01a', 'mau01a', 'mau 01a', 'doi tuong thu nhap')) score += 10;
    if (key === 'mau02' && has('mau 02', 'mau_02', 'mau02', 'chua co nha')) score += 9;
    if (key === 'mau03' && has('mau 03', 'mau_03', 'mau03', 'duoi 15', 'dien tich')) score += 9;
    if (key === 'mau05' && has('mau 05', 'mau_05', 'mau05', 'lao dong tu do', 'thu nhap')) score += 8;
    if (key === 'salary12' && has('luong', 'bang luong', 'salary', '12 thang')) score += 10;
    if (key === 'cccd' && has('cccd', 'cmnd', 'can cuoc')) score += 10;
    if (key === 'ct07' && has('ct07', 'cu tru', 'thuong tru', 'tam tru')) score += 10;
    if (key === 'honNhan' && has('hon nhan', 'doc than', 'tinh trang')) score += 10;
    if (key === 'ketHon' && has('ket hon', 'dang ky ket hon')) score += 10;
    if (key === 'commitment' && has('cam ket')) score += 10;
  });
  score += (doc.keywords || []).filter(keyword => keyword.length > 2 && name.includes(keyword)).length;
  const target = normalizeHoSoText(doc.doiTuong);
  if (target.includes('chong') && has('chong', 'ong ')) score += 3;
  if (target.includes('vo') && has(' vo', '_vo', '-vo', 'ba ')) score += 3;
  return score;
}

function diemKhopFileVoiDoc(file, doc) {
  let score = diemKhopTextVoiDoc(`${file.name || ''} ${file.sourcePdfName || ''}`, doc);
  if (file.aiOcrText || file.aiDetectedTitle) {
    score += Math.min(24, diemKhopTextVoiDoc(`${file.aiDetectedTitle || ''} ${file.aiOcrText || ''}`, doc) * 1.2);
  }
  if (layFilesCuaDoc(doc.id).length === 0) score += 0.5;
  return score;
}

function timDocPhuHopChoFile(file) {
  const docs = BLOG_CHECK_CONTEXT?.docs || [];
  const ranked = docs
    .map(doc => ({ doc, score: diemKhopFileVoiDoc(file, doc) }))
    .filter(item => item.score >= 3)
    .sort((a, b) => b.score - a.score || layFilesCuaDoc(a.doc.id).length - layFilesCuaDoc(b.doc.id).length);
  return ranked[0]?.doc || null;
}

function phanLoaiThuMucHoSo(input) {
  if (!BLOG_CHECK_CONTEXT) return;
  const files = Array.from(input.files || []);
  const unclassified = [];
  const ocrQueue = [];
  files.forEach((file) => {
    const doc = timDocPhuHopChoFile(file);
    if (doc) {
      if (laFileCoTheDocOcr(file)) {
        file.aiOcrStatus = 'processing';
        file.aiSummary = 'Trợ lý Cát Tường đang đọc OCR file scan/ảnh ở nền...';
        ocrQueue.push({ docId: doc.id, file });
      }
      ganFilesChoDoc(doc.id, [file], true);
    } else {
      unclassified.push(file.name);
    }
  });
  input.value = '';
  renderUploadKiemTraHoSoAi();
  ocrQueue.forEach(item => docOcrFileHoSo(item.docId, item.file));
  const notice = document.getElementById('blogFolderNotice');
  if (notice) {
    const classified = files.length - unclassified.length;
    const ocrText = ocrQueue.length ? ` Trợ lý Cát Tường đang đọc OCR ${ocrQueue.length} file scan/ảnh ở nền.` : '';
    notice.innerHTML = unclassified.length
      ? `<span class="text-amber-700">Đã phân loại ${classified}/${files.length} file. Chưa nhận diện: ${esc(unclassified.slice(0, 5).join(', '))}${unclassified.length > 5 ? '...' : ''}.${ocrText}</span>`
      : `<span class="text-green-700">Đã phân loại ${classified}/${files.length} file vào các dòng hồ sơ.${ocrText}</span>`;
  }
}

async function demSoTrangPdf(file) {
  try {
    let text = '';
    if (typeof file.text === 'function') {
      text = await file.text();
    }
    if (!text && typeof file.arrayBuffer === 'function' && typeof TextDecoder !== 'undefined') {
      const buffer = await file.arrayBuffer();
      text = new TextDecoder('latin1').decode(buffer);
    }
    if (!text) return 1;
    const pageMatches = text.match(/\/Type\s*\/Page(?!s)\b/g) || [];
    if (pageMatches.length) return pageMatches.length;
    const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map(match => Number(match[1])).filter(Boolean);
    return counts.length ? Math.max(...counts) : 1;
  } catch {
    return 1;
  }
}

async function phanLoaiPdfScanChung(input) {
  if (!BLOG_CHECK_CONTEXT) return;
  const file = input.files?.[0];
  input.value = '';
  const notice = document.getElementById('blogFolderNotice');
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    if (notice) notice.innerHTML = '<span class="text-red-700">Vui lòng chọn đúng file PDF scan chung.</span>';
    return;
  }
  if (notice) notice.innerHTML = '<span class="text-amber-700"><i class="fas fa-spinner fa-spin mr-1"></i>Đang đọc từng trang PDF scan chung...</span>';
  const docs = BLOG_CHECK_CONTEXT.docs || [];
  const pageCount = await demSoTrangPdf(file);
  const pages = Array.from({ length: Math.max(1, pageCount) }, (_, i) => taoFileAoTuPdfScan(file, i + 1, pageCount));
  pages.forEach((pageFile, index) => {
    const doc = docs[Math.min(index, docs.length - 1)];
    if (doc) ganFilesChoDoc(doc.id, [pageFile], true);
  });
  renderUploadKiemTraHoSoAi();
  const refreshedNotice = document.getElementById('blogFolderNotice');
  if (refreshedNotice) {
    const assigned = Math.min(pages.length, docs.length);
    refreshedNotice.innerHTML = pages.length > docs.length
      ? `<span class="text-amber-700">Đã tách ${pages.length} trang từ PDF scan chung và xếp vào ${assigned} dòng hồ sơ. Các trang dư đang gắn vào dòng cuối để rà soát lại khi kiểm tra.</span>`
      : `<span class="text-green-700">Đã tách ${pages.length} trang từ PDF scan chung và xếp theo từng dòng hồ sơ.</span>`;
  }
}

function renderTrangThaiDongHoSo(result) {
  const map = {
    pending: ['border-slate-200 bg-slate-50 text-slate-500', 'fa-clock', 'Chưa kiểm tra'],
    ok: ['border-green-100 bg-green-50 text-green-800', 'fa-circle-check', 'Hồ sơ đúng đủ'],
    warn: ['border-amber-100 bg-amber-50 text-amber-800', 'fa-triangle-exclamation', 'Cần rà soát'],
    error: ['border-red-100 bg-red-50 text-red-800', 'fa-file-circle-xmark', 'Cần bổ sung'],
  };
  const [cls, icon, label] = map[result?.status || 'pending'];
  return `
    <div class="rounded-lg border px-3 py-2 text-xs leading-snug ${cls}">
      <div class="font-extrabold"><i class="fas ${icon} mr-1.5"></i>${esc(result?.label || label)}</div>
      <div class="mt-1">${esc(result?.note || 'Chưa có kết quả kiểm tra.')}</div>
    </div>`;
}

function nhomDongUploadHoSo(docs) {
  const groups = [];
  (docs || []).forEach((doc) => {
    const key = Number.isFinite(Number(doc.index)) ? String(doc.index) : String(doc.baseTen || doc.ten || doc.id);
    let group = groups.find(item => item.key === key);
    if (!group) {
      group = { key, docs: [] };
      groups.push(group);
    }
    group.docs.push(doc);
  });
  return groups;
}

function idTrangThaiNhomUpload(groupDocs) {
  const first = groupDocs?.[0] || {};
  const key = Number.isFinite(Number(first.index)) ? first.index : String(first.id || '').replace(/[^a-z0-9_-]/gi, '');
  return `blogDocGroupStatus-${key}`;
}

function sttNhomUpload(groupDocs) {
  const first = groupDocs?.[0] || {};
  if (Number.isFinite(Number(first.index))) return String(Number(first.index) + 1);
  return String(first.stt || '').split('.')[0] || '';
}

function renderTrangThaiUploadNhom(groupDocs) {
  const total = groupDocs.length || 1;
  const uploaded = groupDocs.filter(doc => layFilesCuaDoc(doc.id).length).length;
  const totalFiles = groupDocs.reduce((sum, doc) => sum + layFilesCuaDoc(doc.id).length, 0);
  const done = uploaded === total;
  const partial = uploaded > 0 && uploaded < total;
  const cls = done
    ? 'bg-green-50 text-green-700'
    : partial
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-500';
  const text = done
    ? `${totalFiles} file`
    : partial
      ? `${uploaded}/${total} đã upload`
      : 'Chưa upload';
  return `<span id="${esc(idTrangThaiNhomUpload(groupDocs))}" class="rounded-full px-2.5 py-1 text-xs font-bold ${cls}">${esc(text)}</span>`;
}

function capNhatTrangThaiNhomUpload(doc) {
  if (!BLOG_CHECK_CONTEXT || !doc) return;
  const groupDocs = (BLOG_CHECK_CONTEXT.docs || []).filter(item => item.index === doc.index);
  const docs = groupDocs.length ? groupDocs : [doc];
  const status = document.getElementById(idTrangThaiNhomUpload(docs));
  if (status) status.outerHTML = renderTrangThaiUploadNhom(docs);
}

function renderSoLuongNhomUpload(groupDocs) {
  if (groupDocs.length <= 1) return `Số lượng: ${esc(groupDocs[0]?.soLuong || '')}`;
  const parts = groupDocs.map(doc => `${doc.nguoiKeKhai}: ${doc.soLuong || '01 bản'}`);
  return `Số lượng: ${esc(parts.join(' · '))}`;
}

function renderDongUploadHoSo(doc, groupDocs, rowIndex) {
  const first = rowIndex === 0;
  const rowspan = groupDocs.length;
  return `
    <tr class="align-top">
      ${first ? `
        <td rowspan="${rowspan}" class="px-3 py-3 text-slate-500 font-semibold align-top">${esc(sttNhomUpload(groupDocs))}</td>
        <td rowspan="${rowspan}" class="px-3 py-3 align-top">
          <div class="flex flex-wrap items-start gap-2">
            <div class="min-w-0 flex-1">${renderMauUpload(groupDocs[0])}</div>
            ${renderTrangThaiUploadNhom(groupDocs)}
          </div>
          <div class="mt-1 text-xs text-slate-500">${renderSoLuongNhomUpload(groupDocs)}</div>
        </td>` : ''}
      <td class="px-3 py-3 text-slate-600">${esc(doc.nguoiKeKhai)}</td>
      <td id="blogFileCell-${esc(doc.id)}" class="px-3 py-3">${renderFileListHoSo(doc)}</td>
      <td id="blogDocResult-${esc(doc.id)}" class="px-3 py-3">${renderTrangThaiDongHoSo({ status: 'pending' })}</td>
    </tr>`;
}

function renderCacDongUploadHoSo(docs) {
  return nhomDongUploadHoSo(docs)
    .map(group => group.docs.map((doc, index) => renderDongUploadHoSo(doc, group.docs, index)).join(''))
    .join('');
}

function renderUploadKiemTraHoSoAi() {
  const out = document.getElementById('blogUploadTool');
  if (!out || !BLOG_CHECK_CONTEXT) return;
  const { group, docs, roles } = BLOG_CHECK_CONTEXT;
  out.innerHTML = `
    <div class="rounded-2xl border border-cobalt/15 bg-slate-50 p-4 sm:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="uppercase tracking-widest text-amber font-bold text-xs">Danh mục upload hồ sơ</p>
          <h3 class="mt-1 text-xl font-extrabold text-cobalt-dark">Nhóm ${esc(group.stt)}: ${esc(group.title)}</h3>
          <div class="mt-2 grid gap-1 text-sm text-slate-600">${roles.map(role => `<span><i class="fas fa-user-check text-amber mr-2"></i>${esc(role)}</span>`).join('')}</div>
        </div>
        <span class="w-max rounded-full bg-cobalt/10 px-3 py-1 text-sm font-bold text-cobalt">${docs.length} dòng upload</span>
      </div>
      <div class="mt-5 rounded-xl border border-amber/25 bg-white p-3">
        <div class="grid gap-3">
          <div>
            <div class="text-sm font-extrabold text-cobalt-dark"><i class="fas fa-folder-open text-amber mr-2"></i>Upload cả bộ hồ sơ</div>
            <div id="blogFolderNotice" class="mt-1 text-xs text-slate-500">Có thể chọn thư mục nhiều file hoặc chọn 01 PDF scan chung nhiều loại giấy tờ.</div>
          </div>
          <div class="grid gap-2" data-blog-total-upload-actions>
            <label class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg bg-amber px-4 py-3 text-sm font-extrabold text-cobalt-dark hover:brightness-105">
              <span><i class="fas fa-folder-tree mr-2"></i>Chọn thư mục</span>
              <span class="text-[11px] font-bold text-cobalt-dark/70">Nhiều file hồ sơ</span>
              <input type="file" class="hidden" multiple webkitdirectory directory onchange="phanLoaiThuMucHoSo(this)">
            </label>
            <label class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg bg-cobalt px-4 py-3 text-sm font-extrabold text-white hover:bg-cobalt-dark" data-blog-pdf-scan-total>
              <span><i class="fas fa-file-pdf mr-2"></i>Upload file PDF scan tổng</span>
              <span class="text-[11px] font-bold text-white/80">1 file PDF nhiều trang</span>
              <input type="file" class="hidden" accept="application/pdf,.pdf" onchange="phanLoaiPdfScanChungAi(this)">
            </label>
          </div>
        </div>
      </div>
      <div class="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table class="min-w-[930px] w-full text-left text-sm">
          <thead class="bg-cobalt-dark text-white">
            <tr>
              <th class="w-16 px-3 py-3 font-bold">STT</th>
              <th class="min-w-[260px] px-3 py-3 font-bold">Danh mục hồ sơ</th>
              <th class="min-w-[120px] px-3 py-3 font-bold">Người kê khai</th>
              <th class="min-w-[250px] px-3 py-3 font-bold">File hồ sơ</th>
              <th class="min-w-[250px] px-3 py-3 font-bold">Kết quả kiểm tra</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${renderCacDongUploadHoSo(docs)}
            ${'' && docs.map(doc => `
              <tr class="align-top">
                <td class="px-3 py-3 text-slate-500 font-semibold">${esc(doc.stt)}</td>
                <td class="px-3 py-3">
                  <div class="flex flex-wrap items-start gap-2">
                    <div class="min-w-0 flex-1">${renderMauUpload(doc)}</div>
                    <span id="blogDocStatus-${esc(doc.id)}" class="rounded-full px-2.5 py-1 text-xs font-bold ${layFilesCuaDoc(doc.id).length ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}">${layFilesCuaDoc(doc.id).length ? `${layFilesCuaDoc(doc.id).length} file` : 'Chưa upload'}</span>
                  </div>
                  <div class="mt-1 text-xs text-slate-500">Số lượng: ${esc(doc.soLuong)}</div>
                </td>
                <td class="px-3 py-3 text-slate-600">${esc(doc.nguoiKeKhai)}</td>
                <td id="blogFileCell-${esc(doc.id)}" class="px-3 py-3">${renderFileListHoSo(doc)}</td>
                <td id="blogDocResult-${esc(doc.id)}" class="px-3 py-3">${renderTrangThaiDongHoSo({ status: 'pending' })}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="mt-5 flex flex-col gap-3 sm:flex-row">
        <button onclick="chayKiemTraAiHoSo()" class="flex-1 rounded-xl bg-cobalt px-5 py-3 font-bold text-white hover:bg-cobalt-dark"><i class="fas fa-wand-magic-sparkles mr-2"></i>Trợ lý Cát Tường kiểm tra hồ sơ</button>
        <button onclick="taiBaoCaoKiemTraHoSoPDF()" class="rounded-xl border border-cobalt/20 px-5 py-3 font-bold text-cobalt hover:bg-cobalt/5"><i class="fas fa-file-pdf mr-2"></i>Tải báo cáo</button>
      </div>
      <div id="blogKetQuaKiemTra" class="mt-5"></div>
    </div>`;
  damBaoNutPdfScanTong();
}

function renderNutPdfScanTong() {
  return `
    <label class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg bg-cobalt px-4 py-3 text-sm font-extrabold text-white hover:bg-cobalt-dark" data-blog-pdf-scan-total>
      <span><i class="fas fa-file-pdf mr-2"></i>Upload file PDF scan tổng</span>
      <span class="text-[11px] font-bold text-white/80">1 file PDF nhiều trang</span>
      <input type="file" class="hidden" accept="application/pdf,.pdf" onchange="phanLoaiPdfScanChungAi(this)">
    </label>`;
}

function damBaoNutPdfScanTong() {
  const tool = document.getElementById('blogUploadTool');
  if (!tool || tool.querySelector('input[onchange="phanLoaiPdfScanChungAi(this)"]') || tool.querySelector('input[onchange="phanLoaiPdfScanChung(this)"]')) return;
  const folderInput = tool.querySelector('input[onchange="phanLoaiThuMucHoSo(this)"]');
  const folderLabel = folderInput?.closest('label');
  if (!folderLabel) return;

  const title = Array.from(tool.querySelectorAll('div')).find(el => el.textContent.trim() === 'Upload thư mục cả bộ hồ sơ');
  if (title) title.innerHTML = '<i class="fas fa-folder-open text-amber mr-2"></i>Upload cả bộ hồ sơ';
  const notice = document.getElementById('blogFolderNotice') || title?.parentElement?.querySelector('.text-xs');
  if (notice) notice.textContent = 'Có thể chọn thư mục nhiều file hoặc upload 01 file PDF scan tổng nhiều trang.';

  const container = folderLabel.parentElement;
  if (container) {
    container.className = 'grid gap-2';
    container.setAttribute('data-blog-total-upload-actions', '');
  }
  folderLabel.className = 'flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg bg-amber px-4 py-3 text-sm font-extrabold text-cobalt-dark hover:brightness-105';
  if (!folderLabel.querySelector('.text-\\[11px\\]')) {
    const hint = document.createElement('span');
    hint.className = 'text-[11px] font-bold text-cobalt-dark/70';
    hint.textContent = 'Nhiều file hồ sơ';
    folderLabel.insertBefore(hint, folderInput);
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderNutPdfScanTong().trim();
  folderLabel.insertAdjacentElement('afterend', wrapper.firstElementChild);
}

function khoiDongTheoDoiNutPdfScanTong() {
  damBaoNutPdfScanTong();
  if (window.__blogPdfScanTotalObserver || typeof MutationObserver === 'undefined' || !document.body) return;
  window.__blogPdfScanTotalObserver = new MutationObserver(() => damBaoNutPdfScanTong());
  window.__blogPdfScanTotalObserver.observe(document.body, { childList: true, subtree: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function doiKetQuaPhanLoaiPdfScan(jobId, notice) {
  const started = Date.now();
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await sleep(attempt ? 2500 : 1200);
    const state = await apiGet(`/ho-so/phan-loai-pdf-scan/${encodeURIComponent(jobId)}`);
    const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
    if (state.status === 'done' && state.result) return state.result;
    if (state.status === 'error') throw new Error(state.error || 'AI/OCR chưa đọc được PDF scan tổng.');
    if (notice) {
      notice.innerHTML = `<span class="text-amber-700"><i class="fas fa-spinner fa-spin mr-1"></i>Trợ lý Cát Tường đang đọc OCR PDF scan tổng ở nền (${seconds}s). Có thể mất vài phút với file scan nhiều trang; bảng sẽ tự cập nhật khi đọc xong.</span>`;
    }
  }
  throw new Error('Trợ lý Cát Tường vẫn đang đọc PDF scan tổng. Vui lòng giữ trang này mở thêm một lúc rồi thử lại nếu chưa thấy kết quả.');
}

async function phanLoaiPdfScanChungAi(input) {
  if (!BLOG_CHECK_CONTEXT) return;
  const file = input.files?.[0];
  input.value = '';
  const notice = document.getElementById('blogFolderNotice');
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    if (notice) notice.innerHTML = '<span class="text-red-700">Vui lòng chọn đúng file PDF scan tổng.</span>';
    return;
  }

  const docs = BLOG_CHECK_CONTEXT.docs || [];
  if (notice) notice.innerHTML = '<span class="text-amber-700"><i class="fas fa-spinner fa-spin mr-1"></i>Đang gửi PDF scan tổng để Trợ lý Cát Tường đọc từng trang và tự xếp đúng loại hồ sơ...</span>';
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('docs', JSON.stringify(danhMucHoSoChoAi(docs)));
    let result = await apiPostForm('/ho-so/phan-loai-pdf-scan', formData);
    if (result?.jobId) {
      if (notice) notice.innerHTML = '<span class="text-amber-700"><i class="fas fa-spinner fa-spin mr-1"></i>Đã nhận PDF scan tổng. Trợ lý Cát Tường đang đọc từng trang ở nền, vui lòng không upload lại file này trong lúc chờ.</span>';
      result = await doiKetQuaPhanLoaiPdfScan(result.jobId, notice);
    }
    const classifications = Array.isArray(result.classifications) ? result.classifications : [];
    const totalPages = Math.max(
      0,
      ...classifications.flatMap(item => (item.pages || []).map(page => Number(page) || 0)),
      ...(Array.isArray(result.unclassifiedPages) ? result.unclassifiedPages.map(page => Number(page) || 0) : [])
    );
    let assigned = 0;
    const unclassified = [];
    classifications.forEach((item) => {
      const doc = docs.find(row => row.id === item.docId);
      if (!doc) {
        unclassified.push(...(item.pages || []));
        return;
      }
      ganFilesChoDoc(doc.id, [taoFileAoTuPdfScanAi(file, { ...item, totalPages, provider: result.provider })], true);
      assigned += 1;
    });
    if (Array.isArray(result.unclassifiedPages)) unclassified.push(...result.unclassifiedPages);

    renderUploadKiemTraHoSoAi();
    BLOG_CHECK_RESULT = tinhKiemTraAiHoSo();
    renderKetQuaKiemTraHoSoAi(BLOG_CHECK_RESULT);
    const refreshedNotice = document.getElementById('blogFolderNotice');
    if (refreshedNotice) {
      const warnings = Array.isArray(result.warnings) && result.warnings.length ? ` ${esc(result.warnings.join(' '))}` : '';
      refreshedNotice.innerHTML = unclassified.length
        ? `<span class="text-amber-700">AI đã đọc PDF scan tổng và xếp ${assigned} cụm trang vào đúng dòng hồ sơ. Chưa chắc/không nhận diện được: ${esc(moTaTrangPdfScan(unclassified))}.${warnings}</span>`
        : `<span class="text-green-700">AI đã đọc PDF scan tổng, tự xếp ${assigned} cụm trang vào đúng dòng hồ sơ và đã chạy kiểm tra sơ bộ.${warnings}</span>`;
    }
  } catch (error) {
    if (notice) {
      notice.innerHTML = `<span class="text-amber-700">Trợ lý Cát Tường đang cần đọc lại PDF scan tổng: ${esc(error.message || error)} Vui lòng thử upload lại file PDF scan tổng; hệ thống sẽ đọc ở nền và không tự xếp trang theo thứ tự nếu chưa có kết quả OCR chắc chắn.</span>`;
    }
  }
}

function kiemTraFileTheoHoSoAi(file, doc, seenNames) {
  const issues = [];
  const warnings = [];
  const fileNameForType = file.sourcePdfName || file.name;
  const normalizedName = normalizeHoSoText(`${file.name} ${file.sourcePdfName || ''}`);
  const extOk = /\.(pdf|doc|docx|jpg|jpeg|png|webp)$/i.test(fileNameForType) || ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!extOk) issues.push('Định dạng file chưa đúng. Nên dùng PDF, Word hoặc ảnh rõ nét.');
  if (file.size > 20 * 1024 * 1024) issues.push('Dung lượng file vượt 20MB.');
  if (seenNames.has(normalizedName)) warnings.push('Tên file bị trùng với file đã upload ở mục khác.');
  seenNames.add(normalizedName);
  if (file.isPdfScanPage) {
    warnings.push(`Trang ${file.pageNumber} từ PDF scan chung đã được xếp vào dòng này; cần OCR/AI đọc nội dung để xác nhận đúng loại giấy tờ.`);
    return { issues, warnings };
  }
  if (file.aiOcrStatus === 'processing') {
    warnings.push('Trợ lý Cát Tường đang đọc OCR file này; kết quả kiểm tra nội dung sẽ tự cập nhật khi đọc xong.');
  } else if (file.aiOcrStatus === 'error') {
    issues.push(file.aiSummary || 'OCR chưa đọc được file scan/ảnh này, cần upload lại bản rõ hơn.');
  }

  const nameMatched = doc.keywords.some(keyword => normalizedName.includes(keyword));
  const ocrText = normalizeHoSoText(`${file.aiDetectedTitle || ''} ${file.aiOcrText || ''}`);
  const ocrScore = ocrText ? diemKhopTextVoiDoc(ocrText, doc) : 0;
  const ocrMatched = ocrScore >= 6 || doc.keywords.some(keyword => keyword.length > 2 && ocrText.includes(keyword));
  if (ocrText && !ocrMatched && (Number(file.aiConfidence) || 0) >= 0.25) {
    issues.push('Nội dung OCR đọc được chưa khớp với mẫu hồ sơ của dòng này, vui lòng kiểm tra có upload nhầm file không.');
  }
  if (file.aiGuessUsed) {
    warnings.push('Scan mờ hoặc chữ khó đọc: AI/OCR đã đọc lại nhiều lần và suy luận theo nội dung nhận diện được. Bấm biểu tượng mắt để đối chiếu.');
  }
  if ((Number(file.aiConfidence) || 0) > 0 && (Number(file.aiConfidence) || 0) < 0.55) {
    warnings.push(`Độ tin cậy OCR thấp (${Math.round(Number(file.aiConfidence) * 100)}%), nên upload bản rõ hơn nếu nội dung đọc sai.`);
  }
  if (!nameMatched && !ocrMatched && file.aiOcrStatus !== 'processing') {
    issues.push('Tên file và nội dung OCR chưa thể hiện đúng loại hồ sơ, vui lòng kiểm tra có upload nhầm mẫu không.');
  }
  return { issues, warnings };
}

function kiemTraFileTheoHoSo(file, doc, seenNames) {
  const issues = [];
  const warnings = [];
  const fileNameForType = file.sourcePdfName || file.name;
  const normalizedName = normalizeHoSoText(`${file.name} ${file.sourcePdfName || ''}`);
  const extOk = /\.(pdf|doc|docx|jpg|jpeg|png|webp)$/i.test(fileNameForType) || ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!extOk) issues.push('Định dạng file chưa đúng. Nên dùng PDF, Word hoặc ảnh rõ nét.');
  if (file.size > 20 * 1024 * 1024) issues.push('Dung lượng file vượt 20MB.');
  if (seenNames.has(normalizedName)) warnings.push('Tên file bị trùng với file đã upload ở mục khác.');
  seenNames.add(normalizedName);

  if (file.isPdfScanPage) {
    if (file.aiClassified) {
      if (file.aiDocId && file.aiDocId !== doc.id) {
        issues.push(`AI đọc ${moTaTrangPdfScan(file.pages)} thuộc dòng hồ sơ khác, cần upload lại đúng dòng.`);
      }
      if (file.aiGuessUsed) {
        warnings.push('Scan mờ hoặc chữ khó đọc: AI/OCR đã đọc lại nhiều lần và suy luận theo mẫu hồ sơ. Bấm biểu tượng mắt để kiểm tra nội dung AI đã đọc.');
      }
      if (file.aiStatus === 'error') {
        issues.push(file.aiIssues?.length ? file.aiIssues.join(' ') : (file.aiSummary || 'AI đọc thấy hồ sơ scan này chưa đạt.'));
      } else if (file.aiStatus === 'warning' || file.aiStatus === 'unknown') {
        warnings.push(file.aiIssues?.length ? file.aiIssues.join(' ') : (file.aiSummary || 'AI chưa đủ chắc chắn khi đọc trang scan này.'));
      }
      if ((Number(file.aiConfidence) || 0) > 0 && (Number(file.aiConfidence) || 0) < 0.65) {
        warnings.push(`AI nhận diện với độ chắc chắn thấp (${Math.round(Number(file.aiConfidence) * 100)}%), cần rà soát lại.`);
      }
      return { issues, warnings };
    }
    warnings.push(`Trang ${file.pageNumber} từ PDF scan tổng chưa được AI đọc nội dung, cần upload lại hoặc bật AI/OCR để phân loại chính xác.`);
    return { issues, warnings };
  }

  const matched = doc.keywords.some(keyword => normalizedName.includes(keyword));
  if (!matched) issues.push('Tên file chưa thể hiện đúng loại hồ sơ, vui lòng kiểm tra có upload nhầm mẫu không.');
  return { issues, warnings };
}

function tinhKiemTraAiHoSo() {
  if (!BLOG_CHECK_CONTEXT) throw new Error('Vui lòng nhập thông tin và chọn nhóm hồ sơ trước.');
  const missing = [];
  const invalid = [];
  const warnings = [];
  const passed = [];
  const docResults = {};
  const seenNames = new Set();
  BLOG_CHECK_CONTEXT.docs.forEach((doc) => {
    const files = layFilesCuaDoc(doc.id);
    if (files.length < doc.toiThieu) {
      const note = `Chưa upload file cho ${doc.nguoiKeKhai}. Cần bổ sung ${doc.soLuong || '01 bản'} theo danh mục.`;
      missing.push({ ten: doc.ten, note });
      docResults[doc.id] = { status: 'error', label: 'Thiếu hồ sơ', note };
      return;
    }
    const rowInvalid = [];
    const rowWarnings = [];
    files.forEach((file) => {
      const check = kiemTraFileTheoHoSo(file, doc, seenNames);
      if (check.issues.length) {
        const item = { ten: doc.ten, file: file.name, note: check.issues.join(' ') };
        invalid.push(item);
        rowInvalid.push(item);
      }
      if (check.warnings.length) {
        const item = { ten: doc.ten, file: file.name, note: check.warnings.join(' ') };
        warnings.push(item);
        rowWarnings.push(item);
      }
    });
    if (rowInvalid.length) {
      docResults[doc.id] = {
        status: 'error',
        label: 'Sai/cần upload lại',
        note: rowInvalid.map(item => `${item.file}: ${item.note}`).join(' '),
      };
      return;
    }
    if (rowWarnings.length) {
      docResults[doc.id] = {
        status: 'warn',
        label: 'Cần rà soát',
        note: rowWarnings.map(item => `${item.file}: ${item.note}`).join(' '),
      };
    } else {
      const huongDan = tomTatHuongDanKiemTra(doc.huongDanKiemTra);
      const note = `Hồ sơ đúng đủ theo bước sơ kiểm: ${files.length} file, tổng dung lượng ${formatFileSize(files.reduce((sum, file) => sum + file.size, 0))}.${huongDan ? ` Cần đối chiếu nội dung: ${huongDan}` : ''}`;
      docResults[doc.id] = { status: 'ok', label: 'Hồ sơ đúng đủ', note };
      passed.push({ ten: doc.ten, note });
    }
  });

  const coFileDangDocOcr = BLOG_CHECK_CONTEXT.docs.some(doc => layFilesCuaDoc(doc.id).some(file => file.aiOcrStatus === 'processing'));
  if (coFileDangDocOcr) {
    warnings.push({
      ten: 'OCR/AI đang đọc nội dung',
      file: '',
      note: 'Một số file scan/ảnh vẫn đang được Trợ lý Cát Tường đọc ở nền; kết quả từng dòng sẽ tự cập nhật khi đọc xong.',
    });
  }
  const hopLe = missing.length === 0 && invalid.length === 0;
  const tomTat = hopLe
    ? `Hồ sơ đã đủ số lượng bắt buộc theo nhóm ${BLOG_CHECK_CONTEXT.group.stt}. Còn ${warnings.length} cảnh báo cần rà soát trước khi nộp.`
    : `Hồ sơ chưa đạt: thiếu ${missing.length} mục và có ${invalid.length} lỗi cần xử lý.`;
  return { ...BLOG_CHECK_CONTEXT, missing, invalid, warnings, passed, docResults, hopLe, tomTat };
}

function capNhatKetQuaTungDongHoSo(result) {
  (result.docs || []).forEach((doc) => {
    const cell = document.getElementById(`blogDocResult-${doc.id}`);
    if (cell) cell.innerHTML = renderTrangThaiDongHoSo(result.docResults?.[doc.id] || { status: 'pending' });
  });
}

async function chayKiemTraAiHoSo() {
  const out = document.getElementById('blogKetQuaKiemTra');
  if (!out) return;
  out.innerHTML = '<div class="text-center text-slate-400 py-5"><i class="fas fa-spinner fa-spin"></i> Đang kiểm tra hồ sơ...</div>';
  try {
    const result = tinhKiemTraAiHoSo();
    BLOG_CHECK_RESULT = result;
    try {
      await apiPostBlog('/blog-lead', {
        ...result.lead,
        baiVietId: layBlogIdTuUrl(),
        loaiTuongTac: 'ket-qua-tro-ly-cat-tuong-kiem-tra-ho-so',
        ghiChu: `${result.tomTat} Thiếu: ${result.missing.map(x => x.ten).join('; ') || 'không'}. Lỗi: ${result.invalid.map(x => x.ten).join('; ') || 'không'}.`,
      });
    } catch (e) {
      console.warn('Không lưu được kết quả kiểm tra hồ sơ:', e);
    }
    capNhatKetQuaTungDongHoSo(result);
    renderKetQuaKiemTraAiHoSo(result);
  } catch (e) {
    out.innerHTML = `<div class="rounded-xl bg-red-50 p-4 text-red-700">${esc(e.message)}</div>`;
  }
}

function renderResultList(title, items, tone, icon) {
  if (!items.length) return '';
  const toneCls = {
    red: 'border-red-100 bg-red-50 text-red-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    green: 'border-green-100 bg-green-50 text-green-800',
  }[tone] || 'border-slate-100 bg-slate-50 text-slate-700';
  return `
    <div class="rounded-xl border p-4 ${toneCls}">
      <h4 class="font-extrabold"><i class="fas ${icon} mr-2"></i>${esc(title)}</h4>
      <ul class="mt-3 space-y-2 text-sm">
        ${items.map(item => `<li><b>${esc(item.ten)}</b>${item.file ? ` - ${esc(item.file)}` : ''}<br><span>${esc(item.note)}</span></li>`).join('')}
      </ul>
    </div>`;
}

function renderKetQuaKiemTraAiHoSo(result) {
  const out = document.getElementById('blogKetQuaKiemTra');
  if (!out) return;
  out.innerHTML = `
    <div class="rounded-2xl border border-slate-200 bg-white p-4">
      <div class="rounded-xl p-4 ${result.hopLe ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}">
        <b>${esc(result.tomTat)}</b>
      </div>
      <div class="mt-4 grid gap-3 lg:grid-cols-2">
        ${renderResultList('Hồ sơ còn thiếu', result.missing, 'red', 'fa-triangle-exclamation')}
        ${renderResultList('Hồ sơ sai/cần sửa ngay', result.invalid, 'red', 'fa-file-circle-xmark')}
        ${renderResultList('Cảnh báo cần kiểm tra lại', result.warnings, 'amber', 'fa-circle-info')}
        ${renderResultList('Hồ sơ đã upload đúng bước sơ kiểm', result.passed, 'green', 'fa-circle-check')}
      </div>
    </div>`;
}

function taiBaoCaoKiemTraHoSoPDF() {
  if (!BLOG_CHECK_RESULT) {
    chayKiemTraAiHoSo();
    return;
  }
  const list = (items) => items.length ? items.map(x => `<li><b>${esc(x.ten)}</b>${x.file ? ` - ${esc(x.file)}` : ''}: ${esc(x.note)}</li>`).join('') : '<li>Không có</li>';
  const r = BLOG_CHECK_RESULT;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Báo cáo kiểm tra hồ sơ</title><style>body{font-family:Arial,sans-serif;padding:28px;line-height:1.5;color:#0f172a}h1{color:#143866}h2{margin-top:22px;color:#1E4E8C}li{margin:6px 0}</style></head><body><h1>Báo cáo kiểm tra hồ sơ NOXH</h1><p><b>Khách hàng:</b> ${esc(r.lead.hoTen)} - ${esc(r.lead.soDienThoai)}</p><p><b>Dự án quan tâm:</b> ${esc(r.lead.duAnQuanTam)}</p><p><b>Nhóm hồ sơ:</b> ${esc(r.group.stt)}. ${esc(r.group.title)}</p><p>${esc(r.tomTat)}</p><h2>Hồ sơ còn thiếu</h2><ul>${list(r.missing)}</ul><h2>Hồ sơ sai/cần sửa</h2><ul>${list(r.invalid)}</ul><h2>Cảnh báo cần kiểm tra lại</h2><ul>${list(r.warnings)}</ul><h2>Hồ sơ đã upload đúng bước sơ kiểm</h2><ul>${list(r.passed)}</ul></body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 250);
}

async function traCuuTienTrinhBlog(event) {
  event.preventDefault();
  const form = event.target;
  const msg = form.querySelector('[data-form-msg]');
  const data = Object.fromEntries(new FormData(form).entries());
  msg.textContent = 'Đang tra cứu...';
  try {
    const r = await apiPostBlog('/tra-cuu-tien-trinh', { ...data, baiVietId: layBlogIdTuUrl() });
    if (!r.steps) throw new Error('Chưa kết nối được dữ liệu tiến trình nội bộ. Vui lòng thử lại sau.');
    msg.textContent = '';
    document.getElementById('blogTimelineResult').innerHTML = renderTimelineBlog(r);
  } catch (e) {
    msg.textContent = e.message;
  }
}

function renderTimelineBlog(result) {
  const cls = {
    done: ['bg-green-100 text-green-700 border-green-200', 'Đã hoàn thành', 'fa-circle-check'],
    doing: ['bg-amber-100 text-amber-700 border-amber-200', 'Đang xử lý', 'fa-clock'],
    todo: ['bg-slate-100 text-slate-500 border-slate-200', 'Chưa thực hiện', 'fa-circle'],
  };
  const steps = result.steps || [];
  const statusCls = result.found === false ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-green-100 text-green-700 border-green-200';
  const info = [
    result.maCan ? ['Mã căn', result.maCan] : result.maCanQuanTam ? ['Mã căn', result.maCanQuanTam] : null,
    result.tenDuAn ? ['Dự án', result.tenDuAn] : null,
    result.toa ? ['Tòa', result.toa] : null,
    result.tang ? ['Tầng', result.tang] : null,
    result.soCan ? ['Số căn', result.soCan] : null,
    result.trangThaiCan ? ['Trạng thái căn', result.trangThaiCan] : null,
  ].filter(Boolean);
  return `
    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div class="text-sm text-slate-500">Cập nhật gần nhất: <b>${new Date(result.lastUpdated).toLocaleString('vi-VN')}</b></div>
          <div class="mt-2 flex flex-wrap gap-2">
            ${info.map(([label, value]) => `<span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">${esc(label)}: <b class="text-cobalt-dark">${esc(value)}</b></span>`).join('')}
          </div>
        </div>
        ${result.currentStatus ? `<span class="inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-extrabold ${statusCls}">${esc(result.currentStatus)}</span>` : ''}
      </div>
      ${result.notice ? `<div class="mt-4 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-slate-700">${esc(result.notice)}</div>` : ''}
      <div class="mt-4 space-y-4">
        ${steps.map((s, i) => {
          const m = cls[s.trangThai] || cls.todo;
          return `<div class="flex gap-3">
            <div class="flex flex-col items-center">
              <div class="w-9 h-9 rounded-full border grid place-items-center ${m[0]}"><i class="fas ${m[2]} text-sm"></i></div>
              ${i < steps.length - 1 ? '<div class="w-px flex-1 bg-slate-200"></div>' : ''}
            </div>
            <div class="pb-4 flex-1">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="font-extrabold text-cobalt-dark">${esc(s.ten)}</h3>
                <span class="text-xs font-semibold px-2.5 py-1 rounded-full ${m[0]}">${m[1]}</span>
              </div>
              <p class="text-xs text-slate-400 mt-1">Ngày cập nhật: ${fmtNgay(s.ngayCapNhat)}</p>
              ${s.ghiChu ? `<p class="text-sm text-slate-600 mt-1">${esc(s.ghiChu)}</p>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ---------- HỒ SƠ PHÁP LÝ & VĂN BẢN MỚI ----------
async function loadPhapLy() {
  const hoSoBox = document.getElementById('danhMucHoSoPhapLy');
  const vanBanBox = document.getElementById('danhSachVanBanPhapLy');
  if (!hoSoBox || !vanBanBox) return;
  try {
    let data = PHAP_LY_MAC_DINH;
    try {
      data = await apiGet('/phap-ly');
    } catch (_) {
      // Cho phép cập nhật nhanh trên production khi backend chưa có API pháp lý.
    }
    hoSoBox.innerHTML = data.hoSo.map((n, index) => `
      <details data-tw-animate="left" style="--tw-animate-delay:${index * 80}ms" class="group py-4" ${index === 0 ? 'open' : ''}>
        <summary class="flex cursor-pointer list-none items-start justify-between gap-4">
          <span>
            <span class="block font-bold">${esc(n.ten)}</span>
            <span class="mt-1 block text-sm text-slate-200">${esc(n.moTa)}</span>
          </span>
          <i class="fas fa-chevron-down mt-1 text-amber transition group-open:rotate-180"></i>
        </summary>
        <ul class="mt-3 space-y-2 text-sm text-slate-100">
          ${n.hangMuc.map(item => `<li class="flex gap-2"><i class="fas fa-check text-amber mt-1"></i><span>${esc(item)}</span></li>`).join('')}
        </ul>
      </details>`).join('');

    vanBanBox.innerHTML = data.vanBan.map((v, i) => `
      <article data-tw-animate="right" style="--tw-animate-delay:${i * 80}ms" class="py-4 first:pt-0 last:pb-0">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          ${v.moi ? '<span class="bg-amber text-cobalt-dark font-bold px-2 py-0.5 rounded-full">Mới</span>' : ''}
          <span class="text-cobalt font-semibold">${esc(v.loai)}</span>
          <span class="text-slate-400">${esc(v.linhVuc)}</span>
        </div>
        <h4 class="mt-2 font-extrabold text-cobalt-dark">${esc(v.tieuDe)}</h4>
        <p class="mt-1 text-sm text-slate-600">${esc(v.tomTat)}</p>
        <div class="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500">
          <span>Ban hành: <b>${fmtNgay(v.ngayBanHanh)}</b> · Hiệu lực: <b>${fmtNgay(v.ngayHieuLuc)}</b></span>
          <a href="${esc(v.href)}" target="_blank" rel="noopener" class="font-semibold text-cobalt hover:text-cobalt-dark">${esc(v.nguon)} <i class="fas fa-arrow-up-right-from-square ml-1"></i></a>
        </div>
      </article>`).join('');
    initTwAnimate(hoSoBox);
    initTwAnimate(vanBanBox);
  } catch (e) {
    hoSoBox.innerHTML = `<div class="py-6 text-sm text-red-100">Không tải được hồ sơ pháp lý: ${esc(e.message)}</div>`;
    vanBanBox.innerHTML = `<div class="py-6 text-sm text-red-500">Không tải được văn bản pháp lý: ${esc(e.message)}</div>`;
  }
}

// ---------- CHI TIẾT DỰ ÁN + 720 ----------
let PANO_VIEWER = null;
let PANO_SCENES = [];

function renderChiTietDuAn(sections) {
  if (!Array.isArray(sections) || !sections.length) return '';
  return `
    <div class="mt-6 grid gap-4">
      ${sections.map((section, index) => `
        <section data-tw-animate="zoom" style="--tw-animate-delay:${index * 70}ms" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-xl bg-cobalt/10 text-cobalt grid place-items-center font-bold text-sm">${index + 1}</div>
            <div class="min-w-0 flex-1">
              <h4 class="font-extrabold text-cobalt-dark">${esc(section.tieuDe)}</h4>
              ${Array.isArray(section.moTa) && section.moTa.length ? `<div class="mt-2 space-y-2 text-sm leading-6 text-slate-600">${section.moTa.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
              ${Array.isArray(section.hangMuc) && section.hangMuc.length ? `<ul class="mt-3 grid gap-2 text-sm leading-6 text-slate-600">${section.hangMuc.map(item => `<li class="flex gap-2"><i class="fas fa-check text-amber mt-1.5"></i><span>${esc(item)}</span></li>`).join('')}</ul>` : ''}
            </div>
          </div>
        </section>`).join('')}
    </div>`;
}

function renderGalleryTile(src, tenDuAn, index, total, featured = false) {
  const delay = Math.min(index * 45, 520);
  return `
    <button type="button"
      data-tw-animate="zoom"
      style="--tw-animate-delay:${delay}ms"
      data-gallery-src="${esc(src)}"
      data-gallery-title="${esc(tenDuAn)}"
      data-gallery-index="${index + 1}"
      data-gallery-total="${total}"
      class="group relative block w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm ${featured ? 'project-gallery-hero' : 'project-gallery-tile'}">
      <img src="${esc(src)}" alt="${esc(tenDuAn)} - ảnh ${index + 1}" loading="${index < 5 ? 'eager' : 'lazy'}" decoding="async" class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105">
      <span class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-3 py-3 text-left text-white">
        <span class="text-xs font-semibold">Ảnh ${index + 1}/${total}</span>
        <span class="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur"><i class="fas fa-up-right-and-down-left-from-center mr-1"></i>Phóng to</span>
      </span>
    </button>`;
}

function renderThuVienAnh(d) {
  const gallery = Array.isArray(d.thuVienAnh) && d.thuVienAnh.length ? d.thuVienAnh : (d.banner ? [d.banner] : []);
  if (!gallery.length) return '';
  const top = gallery.slice(1, 5);
  const rest = gallery.slice(5);
  return `
    <section data-tw-animate="zoom" class="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 shadow-sm">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-widest text-amber">Hình ảnh dự án</p>
          <h4 class="text-xl font-extrabold text-cobalt-dark">Thư viện ảnh thực tế</h4>
          <p class="mt-1 text-sm text-slate-500">Ảnh lấy từ hồ sơ dự án, phối cảnh, mặt bằng và tư liệu thực tế có sẵn.</p>
        </div>
        <span class="inline-flex w-max items-center gap-2 rounded-full bg-cobalt/10 px-3 py-1 text-sm font-bold text-cobalt"><i class="fas fa-images"></i>${gallery.length} ảnh</span>
      </div>
      <div class="mt-4 grid gap-3 lg:grid-cols-[1.35fr_.9fr]">
        ${renderGalleryTile(gallery[0], d.ten, 0, gallery.length, true)}
        <div class="grid grid-cols-2 gap-3">
          ${top.map((src, i) => renderGalleryTile(src, d.ten, i + 1, gallery.length)).join('')}
        </div>
      </div>
      ${rest.length ? `<div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">${rest.map((src, i) => renderGalleryTile(src, d.ten, i + 5, gallery.length)).join('')}</div>` : ''}
    </section>`;
}

function anhThucTeDuAn(d) {
  const explicit = Array.isArray(d.hinhAnhThucTe) ? d.hinhAnhThucTe : [];
  const gallery = Array.isArray(d.thuVienAnh) ? d.thuVienAnh : [];
  if (d?.ma === 'CT-TNT') {
    const overview = explicit[0] || gallery[0] || d.banner;
    return [
      overview,
      `${TNT_APARTMENT_TOUR_BASE}/khach-sofa-ban-an.jpg?v=20260708-tnt-watermark-clean`,
      `${TNT_APARTMENT_TOUR_BASE}/bep.jpg?v=20260708-tnt-watermark-clean`,
    ].filter(Boolean);
  }
  if (d?.ma === 'CT-SMART') {
    return [
      'marketing/images/projects/cat-tuong-smart-city/anh-01.jpg?v=20260708-smart-city-real-gallery-v6',
      'marketing/images/projects/cat-tuong-smart-city/anh-02.jpg?v=20260708-smart-city-real-gallery-v6',
      'marketing/images/projects/cat-tuong-smart-city/anh-03.jpg?v=20260708-smart-city-real-gallery-v6',
    ];
  }
  if (d?.ma === 'CT-ECO') {
    const overview = explicit[0] || gallery[0] || d.banner;
    return [
      overview,
      `${ECO_APARTMENT_TOUR_BASE}/eco-real-interior-02.jpg?v=${ECO_APARTMENT_TOUR_VERSION}`,
      `${ECO_APARTMENT_TOUR_BASE}/eco-real-interior-03.jpg?v=${ECO_APARTMENT_TOUR_VERSION}`,
    ].filter(Boolean);
  }
  if (d?.ma === 'TNS-SMART') {
    const overview = 'marketing/images/projects/ai-outpaint/thong-nhat-smart-city-day-ai-20260707.jpg?v=20260707-tns-smart-real-overview';
    return [
      overview,
      `marketing/images/projects/thong-nhat-smart-city/can-ho-thuc-te-02.jpg?v=${TNS_SMART_APARTMENT_TOUR_VERSION}`,
      `marketing/images/projects/thong-nhat-smart-city/can-ho-thuc-te-03.jpg?v=${TNS_SMART_APARTMENT_TOUR_VERSION}`,
    ].filter(Boolean);
  }
  if (d?.ma === 'DHP') {
    return [
      'marketing/images/projects/dai-hung-phat/anh-01.jpg?v=20260707-dhp-v720-gallery',
      `${DHP_APARTMENT_TOUR_BASE}/dhp-apartment-virtual-living-20260707.jpg?v=20260707-dhp-v720-gallery`,
      `${DHP_APARTMENT_TOUR_BASE}/dhp-apartment-virtual-kitchen-bedroom-20260707.jpg?v=20260707-dhp-v720-gallery`,
    ];
  }
  if (d?.ma === 'CT-NEW') {
    const overview = explicit[0] || gallery[0] || d.banner;
    return [
      overview,
      'marketing/images/projects/cat-tuong-new/can-ho-thuc-te-02.jpg?v=20260707-cat-tuong-new-real-apartment',
      'marketing/images/projects/cat-tuong-new/can-ho-thuc-te-03.jpg?v=20260707-cat-tuong-new-real-apartment',
    ].filter(Boolean);
  }
  const merged = [...explicit, ...gallery, d.banner].filter(Boolean);
  return [...new Set(merged)].slice(0, 3);
}

function renderHinhAnhThucTe(d) {
  const images = anhThucTeDuAn(d);
  if (!images.length) return '';
  return `
    <section data-tw-animate="zoom" style="--tw-animate-delay:90ms" class="mt-5">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h4 class="font-bold text-cobalt-dark"><i class="fas fa-images mr-2"></i>Hình ảnh thực tế dự án</h4>
        <span class="text-xs font-semibold text-slate-400">03 ảnh</span>
      </div>
      <div class="grid grid-cols-3 gap-2 sm:gap-3">
        ${images.map((src, i) => renderGalleryTile(src, d.ten, i, images.length)).join('')}
      </div>
    </section>`;
}

let GALLERY_VIEWER = { items: [], index: 0 };

function dongAnhDuAn() {
  const lightbox = document.getElementById('lightboxDuAn');
  if (lightbox) lightbox.remove();
  GALLERY_VIEWER = { items: [], index: 0 };
}

function capNhatAnhDuAn() {
  const item = GALLERY_VIEWER.items[GALLERY_VIEWER.index];
  if (!item) return;
  const img = document.getElementById('lightboxDuAnImg');
  const title = document.getElementById('lightboxDuAnTitle');
  const counter = document.getElementById('lightboxDuAnCounter');
  const total = GALLERY_VIEWER.items.length;
  if (img) {
    img.src = item.src;
    img.alt = `${item.title} - ảnh ${GALLERY_VIEWER.index + 1}`;
  }
  if (title) title.textContent = item.title;
  if (counter) counter.textContent = `Ảnh ${GALLERY_VIEWER.index + 1}/${total}`;
}

function chuyenAnhDuAn(delta) {
  if (!GALLERY_VIEWER.items.length) return;
  const total = GALLERY_VIEWER.items.length;
  GALLERY_VIEWER.index = (GALLERY_VIEWER.index + delta + total) % total;
  capNhatAnhDuAn();
}

function moAnhDuAn(items, startIndex = 0) {
  dongAnhDuAn();
  GALLERY_VIEWER = {
    items: Array.isArray(items) ? items : [],
    index: Math.max(0, Math.min(Number(startIndex) || 0, (Array.isArray(items) ? items.length : 1) - 1)),
  };
  const current = GALLERY_VIEWER.items[GALLERY_VIEWER.index];
  if (!current) return;
  const lightbox = document.createElement('div');
  lightbox.id = 'lightboxDuAn';
  lightbox.className = 'fixed inset-0 z-[70] bg-black/90 p-3 sm:p-6';
  lightbox.innerHTML = `
    <div class="mx-auto flex h-full max-w-6xl flex-col">
      <div class="mb-3 flex items-center justify-between gap-3 text-white">
        <div class="min-w-0">
          <div id="lightboxDuAnTitle" class="truncate text-sm font-semibold text-slate-200">${esc(current.title)}</div>
          <div id="lightboxDuAnCounter" class="text-xs text-slate-400">Ảnh ${GALLERY_VIEWER.index + 1}/${GALLERY_VIEWER.items.length}</div>
        </div>
        <button type="button" data-gallery-close class="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl hover:bg-white/20" aria-label="Đóng ảnh"><i class="fas fa-times"></i></button>
      </div>
      <div class="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/40">
        <img id="lightboxDuAnImg" src="${esc(current.src)}" alt="${esc(current.title)} - ảnh ${GALLERY_VIEWER.index + 1}" class="h-full w-full object-contain">
        <button type="button" data-gallery-nav="prev" class="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/65" aria-label="Ảnh trước"><i class="fas fa-chevron-left"></i></button>
        <button type="button" data-gallery-nav="next" class="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/65" aria-label="Ảnh sau"><i class="fas fa-chevron-right"></i></button>
      </div>
    </div>`;
  document.body.appendChild(lightbox);
}

document.addEventListener('click', (e) => {
  const closeGallery = e.target.closest('[data-gallery-close]');
  if (closeGallery) {
    dongAnhDuAn();
    return;
  }
  const galleryNav = e.target.closest('[data-gallery-nav]');
  if (galleryNav) {
    chuyenAnhDuAn(galleryNav.dataset.galleryNav === 'next' ? 1 : -1);
    return;
  }
  const btn = e.target.closest('[data-gallery-src]');
  if (!btn) return;
  const section = btn.closest('section');
  const buttons = Array.from((section || document).querySelectorAll('[data-gallery-src]'));
  const items = buttons.map((item) => ({
    src: item.dataset.gallerySrc,
    title: item.dataset.galleryTitle,
  }));
  const startIndex = Math.max(0, buttons.indexOf(btn));
  moAnhDuAn(items, startIndex);
});

function layTourScenes(d) {
  if (d?.ma === 'CT-TNT') return TNT_APARTMENT_TOUR;
  if (d?.ma === 'CT-ECO') return ECO_APARTMENT_TOUR;
  if (d?.ma === 'TNS-SMART') return TNS_SMART_APARTMENT_TOUR;
  if (d?.ma === 'DHP') return DHP_APARTMENT_TOUR;
  if (Array.isArray(d.tour720) && d.tour720.length) return d.tour720;
  const firstCan = Array.isArray(d.canHoMau) ? d.canHoMau[0] : null;
  if (firstCan && Array.isArray(firstCan.panorama) && firstCan.panorama.length) return firstCan.panorama;
  return (Array.isArray(d.thuVienAnh) ? d.thuVienAnh : []).map((anh, index) => ({
    id: `anh-${index + 1}`,
    ten: 'Virtual 720 căn hộ',
    anh,
  })).slice(0, 1);
}

function giaDuAnText(d) {
  if (d.giaHienThi) return d.giaHienThi;
  const prices = (d.canHoMau || []).map(c => Number(c.giaTuTrieu) || 0).filter(v => v > 0);
  return prices.length ? `Từ ${fmtGia(Math.min(...prices))}` : 'Liên hệ tư vấn';
}

function renderTourDuAn(d) {
  const scenes = layTourScenes(d);
  const isTntApartmentTour = d?.ma === 'CT-TNT' || d?.ma === 'CT-ECO' || d?.ma === 'TNS-SMART' || d?.ma === 'DHP';
  const sceneLabel = scenes.length
    ? (isTntApartmentTour ? '01 ảnh tour 720°' : `${String(scenes.length).padStart(2, '0')} ảnh 720°`)
    : 'Đang cập nhật';
  return `
    <section data-tw-animate="zoom">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h4 class="font-bold text-cobalt-dark"><i class="fas fa-vr-cardboard mr-2"></i>Virtual 720° căn hộ</h4>
        <span class="text-xs font-semibold text-slate-400">${sceneLabel}</span>
      </div>
      <div id="pano"></div>
      ${scenes.length > 1 ? '<div id="panoTabs" class="mt-3 flex flex-wrap gap-2"></div>' : ''}
    </section>`;
}

function duAnTour360Url(d) {
  if (d?.tour360Url) return d.tour360Url;
  return d?.ma === 'CT-SMART' || d?.ma === 'TNS-SMART' ? SMART_CITY_PROJECT_360_URL : '';
}

function renderTour360DuAn(d) {
  const url = duAnTour360Url(d);
  if (!url) return '';
  return `
    <section data-tw-animate="zoom" style="--tw-animate-delay:60ms" class="mt-5 rounded-2xl border border-cobalt/15 bg-cobalt/5 p-4 sm:p-5">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-widest text-amber">Xem 360</p>
          <h4 class="mt-1 font-bold text-cobalt-dark"><i class="fas fa-street-view mr-2"></i>Tour 360 toàn dự án</h4>
          <p class="mt-1 text-sm leading-6 text-slate-600">Trải nghiệm không gian tổng thể của ${esc(d.ten)} trên Panoee.</p>
        </div>
        <a href="${esc(url)}" target="_blank" rel="noopener" class="inline-flex shrink-0 items-center justify-center rounded-xl bg-cobalt px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-cobalt-dark">
          Mở tour 360 <i class="fas fa-arrow-up-right-from-square ml-2"></i>
        </a>
      </div>
    </section>`;
}

function renderGioiThieuTongQuan(d) {
  const lines = (Array.isArray(d.gioiThieuNgan) && d.gioiThieuNgan.length ? d.gioiThieuNgan : [d.moTa])
    .filter(Boolean)
    .slice(0, 2);
  if (!lines.length) return '';
  return `
    <section data-tw-animate="zoom" class="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <h4 class="mb-2 font-bold text-cobalt-dark">Giới thiệu tổng quan dự án</h4>
      <div class="space-y-1.5 text-sm leading-relaxed text-slate-600">
        ${lines.map(line => `<p>${esc(line)}</p>`).join('')}
      </div>
    </section>`;
}

function renderThongTinDuAn(d) {
  const towerText = leadTowerListText(d.ten);
  const timGiaTriChiTiet = (labels) => {
    const wanted = labels.map(label => label.toLowerCase());
    for (const section of d.chiTietDuAn || []) {
      for (const item of section.hangMuc || []) {
        const text = String(item || '');
        const lower = text.toLowerCase();
        const hit = wanted.find(label => lower.startsWith(label + ':') || lower.startsWith(label + '：'));
        if (hit) return text.replace(/^[^:：]+[:：]\s*/, '').replace(/[.]$/, '');
      }
    }
    return '';
  };
  const rows = [
    ['Vị trí', d.viTri],
    ['Quy mô', d.quyMo],
    ['Loại hình', d.loaiHinh || (d.canHoMau?.[0]?.loai || 'Đang cập nhật')],
    ['Giá căn hộ', giaDuAnText(d)],
    ['Chủ đầu tư', d.chuDauTu || timGiaTriChiTiet(['Chủ đầu tư', 'Chủ Đầu tư'])],
  ];
  const rowsHienThi = rows;
  const diemNoiBatGoc = Array.isArray(d.diemNoiBat) && d.diemNoiBat.length ? d.diemNoiBat : ['Vị trí thuận lợi', 'Hạ tầng đồng bộ', 'Tiện ích', 'Pháp lý', 'Tiềm năng phát triển'];
  const diemNoiBat = towerText ? [`Tòa: ${towerText}`, ...diemNoiBatGoc] : diemNoiBatGoc;
  return `
    <aside data-tw-animate="zoom" style="--tw-animate-delay:80ms">
      <h4 class="font-bold text-cobalt-dark mb-3">Thông tin dự án</h4>
      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm">
        ${rowsHienThi.map(([label, value]) => `
          <div class="grid grid-cols-[.9fr_1.25fr] border-b border-slate-100 last:border-b-0">
            <div class="px-4 py-3 text-slate-500">${esc(label)}</div>
            <div class="px-4 py-3 text-right font-bold text-slate-800">${esc(value || 'Đang cập nhật')}</div>
          </div>`).join('')}
      </div>
      <h4 class="mt-6 font-bold text-cobalt-dark">Điểm nổi bật</h4>
      <ul class="mt-3 space-y-2 text-sm text-slate-600">
        ${diemNoiBat.map(item => `<li class="flex gap-2"><i class="fas fa-check text-emerald-500 mt-1"></i><span>${esc(item)}</span></li>`).join('')}
      </ul>
      <button type="button" onclick='dangKyNhanTuVanDuAn(${jsStr(d.ten)})' class="mt-6 w-full rounded-xl bg-amber px-5 py-3 font-bold text-cobalt-dark shadow-sm hover:brightness-95"><i class="fas fa-headset mr-2"></i>Đăng ký nhận tư vấn</button>
    </aside>`;
}

function dangKyNhanTuVanDuAn(tenDuAn) {
  setLeadProjectTower(tenDuAn);
  dongModal();
  setTimeout(() => {
    const section = document.getElementById('lien-he');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => document.querySelector('#leadForm input[name="hoTen"]')?.focus({ preventScroll: true }), 450);
  }, 80);
}

function renderCanHoMau(d) {
  return `
    <h4 class="mt-6 mb-3 font-bold text-cobalt-dark"><i class="fas fa-door-open mr-2"></i>Các loại căn hộ</h4>
    <div class="grid sm:grid-cols-2 gap-4">
      ${d.canHoMau.map((c, i) => `
        <div data-tw-animate="zoom" style="--tw-animate-delay:${i * 80}ms" class="border border-slate-200 rounded-xl overflow-hidden">
          <img src="${esc(c.gallery[0] || d.banner)}" class="w-full h-36 object-cover">
          <div class="p-4">
            <div class="flex items-center justify-between">
              <h5 class="font-bold text-cobalt-dark">${esc(c.ten)}</h5>
              <span class="text-xs px-2 py-0.5 rounded-full ${c.trangThai==='Đang mở bán'?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}">${esc(c.trangThai)}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 mt-3 text-center text-xs text-slate-600">
              <div><div class="font-bold text-cobalt">${c.dienTich}m²</div>Diện tích</div>
              <div><div class="font-bold text-cobalt">${c.soPhongNgu}</div>Phòng ngủ</div>
              <div><div class="font-bold text-cobalt">${c.soPhongTam}</div>Phòng tắm</div>
            </div>
            <p class="text-sm text-slate-500 mt-2">${esc(c.moTa)}</p>
            <div class="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <div><span class="text-xs text-slate-400">${c.giaTuTrieu > 0 ? 'Giá từ' : 'Thông tin'}</span><div class="font-bold text-amber">${c.giaTuTrieu > 0 ? fmtGia(c.giaTuTrieu) : esc(d.giaHienThi || 'Liên hệ tư vấn')}</div></div>
              <button onclick='xemPanoCan(${JSON.stringify(c.panorama)})' class="text-sm text-cobalt font-semibold hover:underline"><i class="fas fa-vr-cardboard mr-1"></i>Xem 720°</button>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
}

async function xemDuAn(ma) {
  const modal = document.getElementById('modalDuAn');
  const body = document.getElementById('modalBody');
  document.getElementById('modalTitle').textContent = 'Đang tải...';
  body.innerHTML = '<div class="text-center py-16 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  try {
    const d = normalizeProjectTowerNames(await apiGet('/du-an/' + ma));
    const scenes = layTourScenes(d);
    document.getElementById('modalTitle').textContent = d.ten;
    body.innerHTML = `
      ${renderGioiThieuTongQuan(d)}
      <div class="grid gap-6 lg:grid-cols-[1.55fr_.95fr]">
        <div>
          ${renderTourDuAn(d)}
          ${renderTour360DuAn(d)}
          ${renderHinhAnhThucTe(d)}
        </div>
        ${renderThongTinDuAn(d)}
      </div>`;
    initTwAnimate(body);

    khoiTaoPano(scenes);
  } catch (e) {
    body.innerHTML = `<div class="text-center py-12 text-red-500">${esc(e.message)}</div>`;
  }
}

function panoSceneId(scene, index) {
  return String(scene?.id || `scene-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function capNhatPanoTabs(sceneId) {
  document.querySelectorAll('.pano-tab').forEach((btn) => {
    const active = btn.dataset.sceneId === sceneId;
    btn.className = `pano-tab text-sm px-3 py-1.5 rounded-lg border ${active ? 'bg-cobalt text-white border-cobalt' : 'border-slate-300 text-slate-600 hover:border-cobalt hover:text-cobalt'}`;
  });
}

function resolvePanoSceneId(ref, scenes) {
  const key = String(ref || '');
  const index = scenes.findIndex((scene, i) => scene?.id === key || panoSceneId(scene, i) === key);
  return index >= 0 ? panoSceneId(scenes[index], index) : key;
}

function focusPanoHotspot(_event, args = {}) {
  if (!PANO_VIEWER) return;
  const pitch = Number.isFinite(Number(args.targetPitch)) ? Number(args.targetPitch) : -8;
  const yaw = Number.isFinite(Number(args.targetYaw)) ? Number(args.targetYaw) : 0;
  const hfov = Number(args.targetHfov) || 70;
  try {
    if (typeof PANO_VIEWER.lookAt === 'function') {
      PANO_VIEWER.lookAt(pitch, yaw, hfov, 900);
    } else {
      PANO_VIEWER.setPitch?.(pitch);
      PANO_VIEWER.setYaw?.(yaw);
      PANO_VIEWER.setHfov?.(hfov);
    }
    PANO_VIEWER.stopAutoRotate?.();
  } catch (_) {}
}

function createPanoArrowHotspot(hotSpotDiv, args = {}) {
  hotSpotDiv.classList.add('pano-arrow-hotspot-anchor');
  hotSpotDiv.innerHTML = `
    <span class="pano-arrow-hotspot-icon"><i class="fas fa-location-arrow"></i></span>
    <span class="pano-arrow-hotspot-label">${esc(args.text || 'Xem khu vuc')}</span>`;
}

function normalizePanoHotspots(scene, scenes, index) {
  if (Array.isArray(scene.hotSpots) && scene.hotSpots.length) {
    return scene.hotSpots
      .map((spot) => {
        if (spot.action === 'focus') {
          return {
            pitch: Number.isFinite(Number(spot.pitch)) ? Number(spot.pitch) : -8,
            yaw: Number.isFinite(Number(spot.yaw)) ? Number(spot.yaw) : 0,
            type: 'info',
            text: spot.text || 'Xem khu v\u1ef1c',
            cssClass: 'pano-arrow-hotspot-anchor',
            createTooltipFunc: createPanoArrowHotspot,
            createTooltipArgs: { text: spot.text || 'Xem khu v\u1ef1c' },
            clickHandlerFunc: focusPanoHotspot,
            clickHandlerArgs: {
              targetYaw: Number.isFinite(Number(spot.targetYaw)) ? Number(spot.targetYaw) : 0,
              targetPitch: Number.isFinite(Number(spot.targetPitch)) ? Number(spot.targetPitch) : -8,
              targetHfov: Number(spot.targetHfov) || 70,
            },
          };
        }
        const sceneId = resolvePanoSceneId(spot.sceneId, scenes);
        if (!sceneId) return null;
        return {
          pitch: Number.isFinite(Number(spot.pitch)) ? Number(spot.pitch) : -8,
          yaw: Number.isFinite(Number(spot.yaw)) ? Number(spot.yaw) : 0,
          type: 'scene',
          text: spot.text || 'Chuyển khu vực',
          sceneId,
          targetYaw: Number.isFinite(Number(spot.targetYaw)) ? Number(spot.targetYaw) : 0,
          targetPitch: Number.isFinite(Number(spot.targetPitch)) ? Number(spot.targetPitch) : -8,
        };
      })
      .filter(Boolean);
  }
  if (scene.disableAutoHotspots) return [];
  if (scenes.length <= 1) return [];
  const prevIndex = (index - 1 + scenes.length) % scenes.length;
  const nextIndex = (index + 1) % scenes.length;
  return [
    { pitch: -8, yaw: 25, type: 'scene', text: scenes[nextIndex].ten || 'Khu vực tiếp theo', sceneId: panoSceneId(scenes[nextIndex], nextIndex), targetYaw: 0, targetPitch: -8 },
    { pitch: 4, yaw: 180, type: 'scene', text: scenes[prevIndex].ten || 'Khu vực trước đó', sceneId: panoSceneId(scenes[prevIndex], prevIndex), targetYaw: 0, targetPitch: -8 },
  ];
}

function taoPanoScenesConfig(scenes) {
  const result = {};
  scenes.forEach((scene, index) => {
    const id = panoSceneId(scene, index);
    result[id] = {
      type: scene.type || 'equirectangular',
      panorama: scene.anh,
      haov: Number(scene.haov) || 360,
      vaov: Number(scene.vaov) || 180,
      vOffset: Number(scene.vOffset) || 0,
      pitch: Number.isFinite(Number(scene.pitch)) ? Number(scene.pitch) : -8,
      yaw: Number.isFinite(Number(scene.yaw)) ? Number(scene.yaw) : 0,
      hfov: Number(scene.hfov) || 95,
      minHfov: Number(scene.minHfov) || 45,
      maxHfov: Number(scene.maxHfov) || 120,
      minPitch: Number.isFinite(Number(scene.minPitch)) ? Number(scene.minPitch) : -90,
      maxPitch: Number.isFinite(Number(scene.maxPitch)) ? Number(scene.maxPitch) : 90,
      hotSpots: normalizePanoHotspots(scene, scenes, index),
    };
  });
  return result;
}

function khoiTaoPano(scenes) {
  const el = document.getElementById('pano');
  const tabs = document.getElementById('panoTabs');
  PANO_SCENES = Array.isArray(scenes) ? scenes.filter((scene) => scene?.anh) : [];
  if (!el) return;
  if (PANO_VIEWER) { try { PANO_VIEWER.destroy(); } catch(_){} PANO_VIEWER = null; }
  if (!PANO_SCENES.length) {
    el.innerHTML = '<div class="grid place-items-center h-full text-slate-400">Chưa có ảnh 720°</div>';
    if (tabs) tabs.innerHTML = '';
    return;
  }
  if (tabs) {
    tabs.innerHTML = PANO_SCENES.map((s, i) => {
      const id = panoSceneId(s, i);
      return `<button type="button" data-scene-id="${esc(id)}" onclick="chonPanoTab(this,this.dataset.sceneId)" class="pano-tab text-sm px-3 py-1.5 rounded-lg border">${esc(s.ten || `Góc nhìn ${i + 1}`)}</button>`;
    }).join('');
  }
  napPano(panoSceneId(PANO_SCENES[0], 0));
}

function chonPanoTab(btn, sceneId) {
  if (!PANO_VIEWER) return;
  const view = panoSceneInitialView(sceneId);
  try {
    PANO_VIEWER.loadScene(sceneId, view.pitch, view.yaw, view.hfov);
    capNhatPanoTabs(sceneId);
  } catch (_) {
    const scene = PANO_SCENES.find((s, i) => panoSceneId(s, i) === sceneId);
    if (scene) napPano(sceneId);
  }
}

function panoSceneInitialView(sceneId) {
  const scene = PANO_SCENES.find((s, i) => panoSceneId(s, i) === sceneId) || {};
  return {
    pitch: Number.isFinite(Number(scene.pitch)) ? Number(scene.pitch) : -8,
    yaw: Number.isFinite(Number(scene.yaw)) ? Number(scene.yaw) : 0,
    hfov: Number(scene.hfov) || 95,
  };
}

function napPano(firstSceneId) {
  const el = document.getElementById('pano');
  if (!el) return;
  el.innerHTML = '';
  if (PANO_VIEWER) { try { PANO_VIEWER.destroy(); } catch(_){} PANO_VIEWER = null; }
  if (!window.pannellum) {
    el.innerHTML = '<div class="grid place-items-center h-full text-slate-300">Tour 720° đang tải.</div>';
    return;
  }
  const rotateOnly = PANO_SCENES.some((scene, index) => scene?.rotateOnly || panoSceneId(scene, index) === 'eco-overview-720');
  PANO_VIEWER = pannellum.viewer('pano', {
    autoLoad: true,
    default: {
      firstScene: firstSceneId,
      sceneFadeDuration: 850,
      autoLoad: true,
      autoRotate: -1.2,
      autoRotateInactivityDelay: 3500,
      showControls: !rotateOnly,
      showZoomCtrl: !rotateOnly,
      showFullscreenCtrl: !rotateOnly,
      keyboardZoom: !rotateOnly,
      mouseZoom: !rotateOnly,
      draggable: true,
      compass: false,
      hfov: 95,
      minHfov: 45,
      maxHfov: 120,
      minPitch: -90,
      maxPitch: 90,
      friction: 0.15,
    },
    scenes: taoPanoScenesConfig(PANO_SCENES),
  });
  capNhatPanoTabs(firstSceneId);
  setTimeout(() => {
    try {
      const view = panoSceneInitialView(firstSceneId);
      PANO_VIEWER?.loadScene(firstSceneId, view.pitch, view.yaw, view.hfov);
      PANO_VIEWER?.startAutoRotate?.(-1.2);
    } catch (_) {}
  }, 150);
  try {
    PANO_VIEWER.on('scenechange', (sceneId) => capNhatPanoTabs(sceneId));
  } catch (_) {}
}
function xemPanoCan(scenes) { khoiTaoPano(scenes); document.getElementById('pano').scrollIntoView({ behavior:'smooth', block:'center' }); }

function dongModal() {
  dongAnhDuAn();
  document.getElementById('modalDuAn').classList.add('hidden');
  document.body.style.overflow = '';
  if (PANO_VIEWER) { try { PANO_VIEWER.destroy(); } catch(_){} PANO_VIEWER = null; }
}

document.addEventListener('keydown', (e) => {
  if (!document.getElementById('lightboxDuAn')) return;
  if (e.key === 'Escape') {
    dongAnhDuAn();
  } else if (e.key === 'ArrowLeft') {
    chuyenAnhDuAn(-1);
  } else if (e.key === 'ArrowRight') {
    chuyenAnhDuAn(1);
  }
});

// ---------- KIỂM TRA HỒ SƠ ----------
async function loadChecklist() {
  const box = document.getElementById('checklistBox');
  if (!box) return;
  try { CHECKLIST = await apiGet('/checklist-ho-so'); renderChecklist(); } catch(e){ console.error(e); }
}
function renderChecklist() {
  const selected = document.querySelector('input[name=doiTuong]:checked');
  const vayInput = document.getElementById('chkVay');
  const box = document.getElementById('checklistBox');
  if (!selected || !vayInput || !box) return;
  const doiTuong = selected.value;
  const vay = vayInput.checked;
  const apDung = CHECKLIST.filter(h => h.apDung==='chung' || (h.apDung==='vay'?vay:h.apDung===doiTuong));
  box.innerHTML = apDung.map(h => `
    <label class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" value="${esc(h.ma)}" class="mt-1 hs-item">
      <span class="text-sm">${esc(h.ten)} ${h.batBuoc?'<span class="text-red-500 font-bold">*</span>':'<span class="text-slate-400">(khuyến nghị)</span>'}</span>
    </label>`).join('');
}
async function chayKiemTra() {
  const selected = document.querySelector('input[name=doiTuong]:checked');
  const vayInput = document.getElementById('chkVay');
  const out = document.getElementById('ketQuaKiemTra');
  if (!selected || !vayInput || !out) return;
  const doiTuong = selected.value;
  const vayNganHang = vayInput.checked;
  const giayToDaCo = [...document.querySelectorAll('.hs-item:checked')].map(x => x.value);
  out.innerHTML = '<div class="w-full text-center text-slate-400"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    const r = await apiPost('/kiem-tra-ho-so', { doiTuong, vayNganHang, giayToDaCo });
    out.className = 'bg-white rounded-2xl border border-slate-200 p-6 shadow-sm';
    out.innerHTML = `
      <div class="rounded-xl p-4 mb-4 ${r.hopLe?'bg-green-50 text-green-800':'bg-red-50 text-red-800'}">
        <i class="fas ${r.hopLe?'fa-circle-check':'fa-triangle-exclamation'} mr-2"></i><b>${esc(r.tomTat)}</b>
      </div>
      ${r.conThieuBatBuoc.length?`<div class="mb-4"><p class="font-semibold text-red-600 mb-2"><i class="fas fa-xmark mr-1"></i>Còn thiếu (bắt buộc):</p><ul class="space-y-1 text-sm">${r.conThieuBatBuoc.map(x=>`<li class="flex gap-2"><i class="fas fa-circle text-[6px] mt-2 text-red-400"></i>${esc(x.ten)}</li>`).join('')}</ul></div>`:''}
      ${r.goiYBoSung.length?`<div class="mb-4"><p class="font-semibold text-amber-600 mb-2"><i class="fas fa-lightbulb mr-1"></i>Nên bổ sung:</p><ul class="space-y-1 text-sm">${r.goiYBoSung.map(x=>`<li class="flex gap-2"><i class="fas fa-circle text-[6px] mt-2 text-amber-400"></i>${esc(x.ten)}</li>`).join('')}</ul></div>`:''}
      ${r.daCo.length?`<div><p class="font-semibold text-green-600 mb-2"><i class="fas fa-check mr-1"></i>Đã có:</p><ul class="space-y-1 text-sm">${r.daCo.map(x=>`<li class="flex gap-2"><i class="fas fa-circle-check text-green-400 mt-0.5"></i>${esc(x.ten)}</li>`).join('')}</ul></div>`:''}
      <p class="text-xs text-slate-400 mt-4 italic">Kết quả mang tính tham khảo theo danh mục mẫu. Vui lòng liên hệ đội ngũ tư vấn để được hỗ trợ chính thức.</p>`;
  } catch(e) {
    out.innerHTML = `<div class="w-full text-center text-red-500">${esc(e.message)}</div>`;
  }
}

// ---------- LEAD ----------
document.getElementById('leadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('leadMsg');
  const data = Object.fromEntries(new FormData(e.target).entries());
  const selectedTower = parseLeadTowerValue(data.toaQuanTam);
  if (!selectedTower) {
    msg.textContent = '✗ Vui lòng chọn tòa quan tâm.';
    return;
  }
  if (!isLeadTowerOpen(selectedTower.projectName, selectedTower.tower)) {
    msg.textContent = `✗ ${selectedTower.tower} hiện chưa mở bán. Vui lòng chọn tòa D, E, H, I, J hoặc O.`;
    updateLeadTowerWarning();
    return;
  }
  data.duAnQuanTam = selectedTower.projectName;
  data.toaQuanTam = selectedTower.tower;
  msg.textContent = 'Đang gửi...';
  try {
    const r = await apiPost('/dang-ky-quan-tam', data);
    msg.textContent = '✓ ' + r.message;
    e.target.reset();
    initLeadProjectTowerOptions();
  } catch(err) {
    msg.textContent = '✗ ' + err.message;
  }
});

// ---------- CHAT AI ----------
let chatHistory = [];
let aiEnabled = false;
let chatSession = null;
let chatSessionReady = false;
function capNhatChatInput(enabled) {
  const input = document.getElementById('chatInput');
  const button = document.getElementById('chatSendBtn');
  if (input) {
    input.disabled = !enabled;
    input.placeholder = enabled ? 'Hỏi về dự án, hồ sơ, pháp lý...' : 'Nhập thông tin trước khi trò chuyện';
  }
  if (button) button.disabled = !enabled;
}
function renderChatLeadGate() {
  const box = document.getElementById('chatMsgs');
  if (!box || chatSession) return;
  capNhatChatInput(false);
  const projectOptions = DU_AN_PUBLIC_CACHE.map(d => `<option value="${esc(d.ten)}"></option>`).join('');
  box.innerHTML = `
    <form onsubmit="batDauChatAI(event)" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div>
        <p class="font-bold text-cobalt-dark">Nhập thông tin để bắt đầu trò chuyện</p>
        <p class="mt-1 text-xs text-slate-500">Chia sẻ vài thông tin cơ bản để trợ lý tư vấn đúng dự án bạn quan tâm.</p>
      </div>
      <input name="hoTen" required placeholder="Họ và tên *" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-cobalt">
      <input name="soDienThoai" required placeholder="Số điện thoại *" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-cobalt">
      <input name="duAnQuanTam" required list="chatProjectOptions" placeholder="Dự án muốn tìm hiểu *" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-cobalt">
      <datalist id="chatProjectOptions">${projectOptions}</datalist>
      <button class="w-full bg-cobalt text-white font-bold py-2.5 rounded-lg hover:bg-cobalt-dark"><i class="fas fa-comments mr-2"></i>Bắt đầu trò chuyện</button>
      <p class="text-xs text-slate-500" data-chat-gate-msg></p>
    </form>`;
}
async function batDauChatAI(event) {
  event.preventDefault();
  const form = event.target;
  const msg = form.querySelector('[data-chat-gate-msg]');
  const data = Object.fromEntries(new FormData(form).entries());
  msg.textContent = 'Đang ghi nhận thông tin...';
  try {
    const r = await apiPost('/ai/session', data);
    chatSession = { id: r.sessionId, ...data };
    chatSessionReady = aiEnabled;
    chatHistory = [];
    document.getElementById('chatMsgs').innerHTML = '';
    if (!chatSessionReady) {
      capNhatChatInput(false);
      themTinNhan('assistant', `Cảm ơn ${data.hoTen}! Tôi đã ghi nhận dự án bạn quan tâm: ${data.duAnQuanTam}.\nTrợ lý AI đang tạm bảo trì. Đội ngũ tư vấn sẽ sử dụng thông tin này để hỗ trợ bạn, và khi AI được bật lại bạn có thể tiếp tục trò chuyện tại đây.`);
      return;
    }
    capNhatChatInput(true);
    themTinNhan('assistant', `Xin chào ${data.hoTen}! Tôi là trợ lý tư vấn Cát Tường. Tôi đã ghi nhận dự án bạn quan tâm: ${data.duAnQuanTam}.\nBạn có thể hỏi tôi về thông tin dự án, chính sách bán hàng, hồ sơ, pháp lý, tiến độ hoặc bất kỳ nội dung nào cần hỗ trợ.`);
    document.getElementById('chatInput')?.focus();
  } catch (e) {
    msg.textContent = e.message;
  }
}
function moChat() {
  document.getElementById('chatPanel').classList.remove('hidden');
  document.getElementById('chatFab').classList.add('hidden');
  if (!chatSession) {
    renderChatLeadGate();
  } else if (!chatSessionReady) {
    capNhatChatInput(false);
  } else if (!chatHistory.length) {
    themTinNhan('assistant', 'Bạn cần hỗ trợ thêm nội dung gì ạ?');
  }
}
function dongChat() {
  document.getElementById('chatPanel').classList.add('hidden');
  document.getElementById('chatFab').classList.remove('hidden');
}
function themTinNhan(role, text) {
  const box = document.getElementById('chatMsgs');
  const isUser = role === 'user';
  const div = document.createElement('div');
  div.className = 'flex ' + (isUser ? 'justify-end' : 'justify-start');
  div.innerHTML = `<div class="max-w-[85%] rounded-2xl px-3.5 py-2.5 ${isUser?'bg-cobalt text-white rounded-br-sm':'bg-white border border-slate-200 rounded-bl-sm'}" style="white-space:pre-wrap">${esc(text)}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
async function guiChat() {
  if (!chatSession) {
    moChat();
    return;
  }
  if (!chatSessionReady) {
    themTinNhan('assistant', 'Trợ lý AI đang tạm bảo trì. Thông tin của bạn đã được ghi nhận để đội ngũ tư vấn hỗ trợ.');
    return;
  }
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  themTinNhan('user', text);
  chatHistory.push({ role:'user', content:text });
  const box = document.getElementById('chatMsgs');
  const loading = document.createElement('div');
  loading.className = 'flex justify-start';
  loading.innerHTML = '<div class="bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-400"><i class="fas fa-spinner fa-spin"></i></div>';
  box.appendChild(loading); box.scrollTop = box.scrollHeight;
  try {
    const r = await apiPost('/ai/chat', { sessionId: chatSession.id, messages: chatHistory });
    loading.remove();
    themTinNhan('assistant', r.reply);
    chatHistory.push({ role:'assistant', content:r.reply });
  } catch(e) {
    loading.remove();
    themTinNhan('assistant', 'Xin lỗi, hiện chưa thể trả lời (' + e.message + '). Vui lòng để lại thông tin ở mục "Đăng ký nhận tư vấn" để được hỗ trợ.');
  }
}
async function kiemTraAI() {
  try { const s = await apiGet('/ai/status'); aiEnabled = s.enabled; } catch(_){ aiEnabled = false; }
  // Nếu AI chưa sẵn sàng, ẩn nút chat robot để tránh gây nhầm lẫn (vẫn giữ mục kiểm tra hồ sơ)
  const fab = document.getElementById('chatFab');
  if (!aiEnabled && fab) fab.title = 'Trợ lý AI đang tạm bảo trì — vui lòng dùng mục Kiểm tra hồ sơ hoặc để lại thông tin';
}

let visitEventSource = null;
let visitPollTimer = null;
let visitTrackedThisLoad = false;

function dinhDangLuotTruyCap(value) {
  const n = Number(value);
  if (Number.isFinite(n)) return n.toLocaleString('vi-VN');
  const text = String(value || '0');
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function setVisitCounterState(snapshot, state = 'live') {
  const box = document.getElementById('visitCounter');
  if (!box) return;
  const total = document.getElementById('visitTotal');
  const online = document.getElementById('visitOnline');
  const status = document.getElementById('visitStatus');
  if (total) total.textContent = dinhDangLuotTruyCap(snapshot?.total ?? snapshot?.totalText ?? 0);
  if (online) online.textContent = `${Math.max(0, Number(snapshot?.online) || 0).toLocaleString('vi-VN')} đang xem`;
  if (status) status.title = state === 'live' ? 'Đang cập nhật realtime' : state === 'error' ? 'Đang thử kết nối lại' : 'Đang tải số liệu';
  box.classList.toggle('is-live', state === 'live');
  box.classList.toggle('is-error', state === 'error');
  box.classList.toggle('is-loading', state === 'loading');
}

function khoiTaoVisitRealtime() {
  if (!document.getElementById('visitCounter')) return;
  if (visitEventSource || !window.EventSource) return;
  visitEventSource = new EventSource(`${API}/luot-truy-cap/events?path=${encodeURIComponent(VISIT_COUNTER_PATH)}`);
  visitEventSource.addEventListener('visits', (event) => {
    try {
      setVisitCounterState(JSON.parse(event.data), 'live');
    } catch (_) {}
  });
  visitEventSource.onerror = () => {
    setVisitCounterState({}, 'error');
  };
}

function khoiTaoVisitPollingFallback() {
  if (visitPollTimer || window.EventSource) return;
  visitPollTimer = setInterval(async () => {
    try {
      setVisitCounterState(await apiGet(`/luot-truy-cap?path=${encodeURIComponent(VISIT_COUNTER_PATH)}`), 'live');
    } catch (_) {
      setVisitCounterState({}, 'error');
    }
  }, 15000);
}

async function khoiDongBoDemLuotTruyCap() {
  if (!document.getElementById('visitCounter')) return;
  setVisitCounterState({}, 'loading');
  khoiTaoVisitRealtime();
  khoiTaoVisitPollingFallback();
  try {
    const snapshot = visitTrackedThisLoad
      ? await apiGet(`/luot-truy-cap?path=${encodeURIComponent(VISIT_COUNTER_PATH)}`)
      : await apiPost('/luot-truy-cap/track', { path: VISIT_COUNTER_PATH });
    visitTrackedThisLoad = true;
    setVisitCounterState(snapshot, 'live');
  } catch (_) {
    try {
      setVisitCounterState(await apiGet(`/luot-truy-cap?path=${encodeURIComponent(VISIT_COUNTER_PATH)}`), 'error');
    } catch (e) {
      setVisitCounterState({}, 'error');
    }
  }
}

Object.assign(window, {
  batDauChatAI,
  chayKiemTraAiHoSo,
  chonPanoTab,
  chuyenAnhDuAn,
  damBaoNutPdfScanTong,
  dangKyNhanTuVanBangHang,
  dangKyNhanTuVanDuAn,
  dongAnhDuAn,
  dongCanhBaoBangHang,
  dongChat,
  dongModal,
  duAnCarouselGo,
  duAnCarouselNext,
  duAnCarouselPrev,
  guiChat,
  locHoSoNoxh,
  moChat,
  moCongCuKiemTraBlog,
  moMucHoTroKhachHang,
  moYeuCauTaiLieu,
  taiBaoCaoKiemTraHoSoPDF,
  toggleTinTuc,
  traCuuTienTrinhBlog,
  xemDuAn,
  xemPanoCan,
});

// ---------- INIT ----------
(async function init() {
  initTwAnimate();
  khoiDongTheoDoiNutPdfScanTong();
  const blogId = layBlogIdTuUrl();
  let mucHoTroBiChan = '';
  if (blogId) {
    if (laMucHoTroTamKhoa(blogId) && !(await coQuyenXemHoTroNoiBo())) {
      mucHoTroBiChan = blogId;
      history.replaceState(null, '', `${trangGioiThieuHref()}#ho-tro-khach-hang`);
    } else {
      await renderBlogPage(blogId);
      khoiDongBoDemLuotTruyCap();
      kiemTraAI();
      return;
    }
  }
  initLeadProjectTowerOptions();
  applyLeadTowerPrefill();
  khoiDongBoDemLuotTruyCap();
  bindNewsPanelHeightSync();
  loadTinTuc();
  loadHoTroKhachHang();
  if (mucHoTroBiChan) hienCanhBaoMucHoTroTamKhoa(mucHoTroBiChan);
  await loadDuAn();
  queueNewsPanelHeightSync();
  kiemTraAI();
  // Deep-link: /gioi-thieu?duan=CTS mở thẳng chi tiết dự án
  const ma = new URLSearchParams(location.search).get('duan');
  if (ma) xemDuAn(ma);
})();
