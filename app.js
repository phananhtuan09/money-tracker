// Sổ tài sản - web tĩnh, dữ liệu chỉ lưu ở localStorage của trình duyệt.
// Muốn đổi danh mục mặc định thì sửa mảng DEFAULT_CATEGORIES bên dưới.
// Muốn thêm tính năng sau này (đồng bộ cloud, tự lấy giá...) thì sửa file này,
// không cần đụng tới cấu trúc dữ liệu đã lưu, trừ khi bạn đổi hẳn định dạng.

const STORAGE_KEY = "money-tracker-v1";
// Tùy chọn giao diện để riêng, không nằm trong file backup.
const PREFS_KEY = "money-tracker-prefs";
const DEFAULT_CATEGORIES = ["Tiền mặt", "Tiết kiệm", "Quỹ", "Vàng", "Crypto"];
// Khoản nào quá số ngày này chưa sửa sẽ được nhắc cập nhật.
const STALE_DAYS = 30;

// Tông màu đất, hợp với nền giấy kem và vẫn đọc được trên nền tối.
const CATEGORY_COLORS = {
  "Tiền mặt": "#5b8a5f",
  "Tiết kiệm": "#3b6e8f",
  "Quỹ": "#86609a",
  "Vàng": "#c4912c",
  "Crypto": "#c0582c",
};
const EXTRA_COLORS = ["#4f8a83", "#a14e63", "#8a8f3c", "#a0522d", "#5f7fa8", "#8c7351", "#6d9070", "#9b6a8a"];

const ROUTES = {
  "tong-quan": { title: "Tổng quan", subtitle: "Bức tranh tài sản của bạn hôm nay" },
  "tai-san": { title: "Tài sản", subtitle: "Tất cả các khoản bạn đang theo dõi" },
  "lich-su": { title: "Lịch sử", subtitle: "Tài sản thay đổi thế nào qua thời gian" },
  "cai-dat": { title: "Cài đặt", subtitle: "Giao diện và sao lưu dữ liệu" },
};

let state = loadState();
let prefs = loadPrefs();
let editingId = null;
let filterCategory = "all";
let searchText = "";
let sortMode = "amount-desc";

const $ = (id) => document.getElementById(id);

// ---------- Lưu trữ ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], snapshots: [] };
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    };
  } catch (e) {
    return { items: [], snapshots: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadPrefs() {
  try {
    return { theme: "auto", hidden: false, lastExportAt: null, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch (e) {
    return { theme: "auto", hidden: false, lastExportAt: null };
  }
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* không lưu được thì thôi */ }
}

// ---------- Định dạng ----------

function fmtPlain(n) {
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

function fmtVnd(n) {
  return prefs.hidden ? "••••••• ₫" : fmtPlain(n);
}

function fmtSigned(n) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "±";
  return sign + fmtVnd(Math.abs(n));
}

function fmtCompact(n) {
  if (prefs.hidden) return "•••";
  const abs = Math.abs(n);
  const f = (v) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v);
  if (abs >= 1e9) return f(n / 1e9) + " tỷ";
  if (abs >= 1e6) return f(n / 1e6) + " tr";
  if (abs >= 1e3) return f(n / 1e3) + "k";
  return f(n);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("vi-VN");
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function parseAmount(text) {
  // Chấp nhận "50.000.000", "50,000,000", "50000000", và gõ tắt "500k", "50tr", "1,2ty".
  const raw = String(text).trim().toLowerCase().replace(/\s+/g, "").replace(/[đ₫]$/, "");
  if (raw === "") return NaN;
  const m = raw.match(/^([\d.,]+)(k|nghìn|nghin|ngàn|ngan|tr|triệu|trieu|m|tỷ|tỉ|ty|ti|b)?$/);
  if (!m) return NaN;
  let num = m[1];
  if (!m[2]) {
    const digits = num.replace(/\D/g, "");
    return digits === "" ? NaN : Number(digits);
  }
  const mult = /^(k|ng)/.test(m[2]) ? 1e3 : /^(tr|m)/.test(m[2]) ? 1e6 : 1e9;
  const seps = num.match(/[.,]/g) || [];
  // Một dấu phân cách kèm đúng 3 chữ số phía sau là hàng nghìn, còn lại là số thập phân.
  if (seps.length === 1 && !/[.,]\d{3}$/.test(num)) num = num.replace(",", ".");
  else num = num.replace(/[.,]/g, "");
  const v = Number(num);
  return Number.isFinite(v) ? Math.round(v * mult) : NaN;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
}

function normalize(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

// ---------- Tính toán ----------

function totalAmount() {
  return state.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function categoryTotals() {
  const totals = {};
  for (const item of state.items) {
    totals[item.category] = (totals[item.category] || 0) + Number(item.amount || 0);
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function allCategories() {
  const set = new Set(DEFAULT_CATEGORIES);
  for (const item of state.items) set.add(item.category);
  return [...set];
}

function categoryColor(cat) {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  let h = 0;
  for (const ch of String(cat)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return EXTRA_COLORS[h % EXTRA_COLORS.length];
}

function daysSince(iso) {
  if (!iso) return Infinity;
  const start = new Date(iso); start.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((today - start) / 86400000);
}

function relativeDay(iso) {
  const d = daysSince(iso);
  if (d === Infinity) return "chưa rõ ngày";
  if (d <= 0) return "hôm nay";
  if (d === 1) return "hôm qua";
  if (d < 30) return d + " ngày trước";
  return fmtDate(iso);
}

function isStale(item) {
  return daysSince(item.updatedAt) > STALE_DAYS;
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function sortedSnapshots() {
  return [...state.snapshots].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function latestUpdateText() {
  const dates = state.items.map((i) => i.updatedAt).filter(Boolean).sort();
  if (dates.length === 0) return "chưa rõ";
  return relativeDay(dates[dates.length - 1]);
}

// ---------- Thành phần dùng chung ----------

function icon(name) {
  return `<svg class="icon"><use href="#i-${name}"/></svg>`;
}

function emptyState(iconName, title, text, actionHtml = "") {
  return `<div class="empty">
    <span class="empty-icon">${icon(iconName)}</span>
    <b>${title}</b>
    <p class="muted small">${text}</p>
    ${actionHtml}
  </div>`;
}

function itemRow(item, total) {
  const color = categoryColor(item.category);
  const amount = Number(item.amount);
  const stale = isStale(item);
  return `<div class="row" data-edit="${escapeHtml(item.id)}" tabindex="0" role="button" aria-label="Sửa ${escapeHtml(item.name)}">
    <span class="avatar" style="--c:${color}">${escapeHtml(item.name.trim().charAt(0).toUpperCase() || "?")}</span>
    <div class="row-main">
      <div class="row-title"><span>${escapeHtml(item.name)}</span>${stale ? '<span class="badge badge-warn">Cần cập nhật</span>' : ""}</div>
      <div class="row-sub">
        <span class="cat"><i style="--c:${color}"></i>${escapeHtml(item.category)}</span>
        <span>· ${relativeDay(item.updatedAt)}</span>
        ${item.note ? `<span class="note">· ${escapeHtml(item.note)}</span>` : ""}
      </div>
    </div>
    <div class="row-end">
      <b class="amount">${fmtVnd(amount)}</b>
      <span class="muted small">${percent(amount, total)}%</span>
    </div>
    <div class="row-actions">
      <button type="button" class="icon-btn sm" data-edit="${escapeHtml(item.id)}" title="Sửa">${icon("edit")}</button>
      <button type="button" class="icon-btn sm danger" data-delete="${escapeHtml(item.id)}" title="Xóa">${icon("trash")}</button>
    </div>
  </div>`;
}

function donutSvg(totals, total) {
  const r = 50, c = 2 * Math.PI * r;
  const gap = totals.length > 1 ? 1.5 : 0;
  let offset = 0;
  const segs = total > 0 ? totals.map(([cat, amount]) => {
    const len = (amount / total) * c;
    const seg = `<circle r="${r}" cx="60" cy="60" stroke="${categoryColor(cat)}"
      stroke-dasharray="${Math.max(len - gap, 0.01)} ${c}" stroke-dashoffset="${-offset}"><title>${escapeHtml(cat)}: ${percent(amount, total)}%</title></circle>`;
    offset += len;
    return seg;
  }).join("") : "";
  return `<svg viewBox="0 0 120 120" role="img" aria-label="Biểu đồ phân bổ">
    <circle class="donut-track" r="${r}" cx="60" cy="60"/>
    <g transform="rotate(-90 60 60)">${segs}</g>
  </svg>
  <div class="donut-center"><span class="muted small">${totals.length} danh mục</span><b>${fmtCompact(total)}</b></div>`;
}

// Vẽ biểu đồ đường bằng SVG thuần, không cần thư viện.
function lineChart(el, points, height) {
  if (points.length === 0) return;
  // Lấy đúng chiều rộng thật của khung để chữ trên trục không bị co nhỏ trên điện thoại.
  const W = Math.max(el.clientWidth, 280), H = height, padL = 58, padR = 18, padT = 18, padB = 30;
  const vals = points.map((p) => p.total);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min = min * 0.9; max = max * 1.1 || 1; }
  const span = max - min;
  min = Math.max(0, min - span * 0.15);
  max = max + span * 0.15;
  const x = (i) => padL + (points.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (points.length - 1));
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const ticks = [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3);
  const grid = ticks.map((t) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="axis" x="${padL - 10}" y="${y(t) + 4}" text-anchor="end">${fmtCompact(t)}</text>`).join("");

  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(W / 110))));
  const xLabels = points.map((p, i) => (i % step === 0 || i === points.length - 1)
    ? `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${p.current ? "Hiện tại" : new Date(p.date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</text>` : "").join("");

  const solid = points.filter((p) => !p.current);
  const path = (pts, from = 0) => pts.map((p, i) => `${i ? "L" : "M"}${x(i + from)},${y(p.total)}`).join(" ");
  const solidPath = path(solid);
  const last = points[points.length - 1];
  const dashed = last.current && solid.length
    ? `<path class="line line-dashed" d="M${x(solid.length - 1)},${y(solid[solid.length - 1].total)} L${x(points.length - 1)},${y(last.total)}"/>` : "";
  const area = points.length > 1
    ? `<path class="area" fill="url(#${el.id}-grad)" d="${path(points)} L${x(points.length - 1)},${H - padB} L${x(0)},${H - padB} Z"/>` : "";
  const dots = points.map((p, i) => `<circle class="dot${p.current ? " dot-current" : ""}" cx="${x(i)}" cy="${y(p.total)}" r="4"/>`).join("");

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Biểu đồ tổng tài sản">
    <defs><linearGradient id="${el.id}-grad" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" class="grad-top"/><stop offset="100%" class="grad-bottom"/>
    </linearGradient></defs>
    ${grid}${area}
    ${solid.length > 1 ? `<path class="line" d="${solidPath}"/>` : ""}${dashed}
    <line class="guide" y1="${padT}" y2="${H - padB}" x1="0" x2="0" hidden/>
    ${dots}${xLabels}
  </svg>`;

  const svg = el.querySelector("svg");
  const guide = svg.querySelector(".guide");
  const tip = $("chartTip");
  svg.addEventListener("pointermove", (e) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    let idx = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - vx) < Math.abs(x(idx) - vx)) idx = i; });
    const p = points[idx];
    guide.setAttribute("x1", x(idx)); guide.setAttribute("x2", x(idx)); guide.hidden = false;
    tip.innerHTML = `<span>${p.current ? "Hiện tại" : fmtDate(p.date)}</span><b>${fmtVnd(p.total)}</b>`;
    tip.hidden = false;
    tip.style.left = rect.left + (x(idx) / W) * rect.width + "px";
    tip.style.top = rect.top + (y(p.total) / H) * rect.height + "px";
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; guide.hidden = true; });
}

function trendPoints() {
  const pts = sortedSnapshots().map((s) => ({ date: s.date, total: Number(s.total) }));
  if (state.items.length === 0) return pts;
  const last = pts[pts.length - 1];
  const total = totalAmount();
  if (!last || !(sameDay(last.date, new Date()) && last.total === total)) {
    pts.push({ date: new Date().toISOString(), total, current: true });
  }
  return pts;
}

// ---------- Trang Tổng quan ----------

function renderDashboard() {
  const empty = state.items.length === 0;
  $("onboarding").hidden = !empty;
  $("dashboard").hidden = empty;
  if (empty) return;

  const total = totalAmount();
  $("totalAmount").textContent = fmtVnd(total);
  const snaps = sortedSnapshots();
  const last = snaps[snaps.length - 1];
  const deltaEl = $("totalDelta");
  if (last) {
    const diff = total - Number(last.total);
    deltaEl.hidden = false;
    deltaEl.className = "delta-pill " + (diff > 0 ? "up" : diff < 0 ? "down" : "flat");
    const pct = Number(last.total) ? ` (${diff >= 0 ? "+" : "−"}${Math.abs(percent(diff, Number(last.total)))}%)` : "";
    deltaEl.textContent = fmtSigned(diff) + pct;
    $("totalMeta").textContent = "so với lần chốt " + fmtDate(last.date);
  } else {
    deltaEl.hidden = true;
    $("totalMeta").textContent = "Cập nhật gần nhất: " + latestUpdateText();
  }

  $("itemCount").textContent = state.items.length;
  const totals = categoryTotals();
  $("topCategory").textContent = totals[0][0];
  $("topCategoryMeta").textContent = percent(totals[0][1], total) + "% tổng tài sản";
  const stale = state.items.filter(isStale).length;
  $("staleCount").textContent = stale;
  $("staleCard").classList.toggle("is-alert", stale > 0);

  $("donut").innerHTML = donutSvg(totals, total);
  $("legend").innerHTML = totals.map(([cat, amount]) => `<li>
      <i style="--c:${categoryColor(cat)}"></i>
      <span class="legend-name">${escapeHtml(cat)}</span>
      <span class="legend-leader"></span>
      <span class="legend-amt">${fmtVnd(amount)}</span>
      <span class="legend-pct">${percent(amount, total)}%</span>
    </li>`).join("");

  const trend = $("trendChart");
  if (state.snapshots.length === 0) {
    trend.innerHTML = emptyState("chart", "Chưa có lịch sử",
      "Chốt số liệu mỗi tuần hoặc mỗi tháng để thấy tài sản tăng hay giảm.",
      `<button type="button" class="btn btn-secondary" data-action="snapshot">${icon("flag")}Chốt lần đầu</button>`);
  } else {
    lineChart(trend, trendPoints(), 220);
  }

  const top = [...state.items].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
  $("topItems").innerHTML = top.map((item) => itemRow(item, total)).join("");
}

// ---------- Trang Tài sản ----------

function filteredItems() {
  const q = normalize(searchText.trim());
  const items = state.items.filter((item) =>
    (filterCategory === "all" || item.category === filterCategory) &&
    (!q || normalize(`${item.name} ${item.note || ""} ${item.category}`).includes(q)));
  const by = {
    "amount-desc": (a, b) => Number(b.amount) - Number(a.amount),
    "amount-asc": (a, b) => Number(a.amount) - Number(b.amount),
    "name": (a, b) => a.name.localeCompare(b.name, "vi"),
    "updated": (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    "stale": (a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")),
  }[sortMode];
  return items.sort(by);
}

function renderAssets() {
  const totals = categoryTotals();
  if (filterCategory !== "all" && !totals.some(([cat]) => cat === filterCategory)) filterCategory = "all";
  const chip = (value, label, count, color) => `<button type="button" class="chip${filterCategory === value ? " active" : ""}"
      data-filter="${escapeHtml(value)}" role="tab" aria-selected="${filterCategory === value}">
      ${color ? `<i style="--c:${color}"></i>` : ""}${escapeHtml(label)}<span>${count}</span></button>`;
  $("categoryFilter").innerHTML = state.items.length === 0 ? "" :
    chip("all", "Tất cả", state.items.length) +
    totals.map(([cat]) => chip(cat, cat, state.items.filter((i) => i.category === cat).length, categoryColor(cat))).join("");

  const list = $("itemList");
  const foot = $("itemListFoot");
  if (state.items.length === 0) {
    list.innerHTML = emptyState("wallet", "Chưa có khoản nào",
      "Thêm khoản đầu tiên để bắt đầu theo dõi.",
      `<button type="button" class="btn btn-primary" data-action="add">${icon("plus")}Thêm khoản</button>`);
    foot.hidden = true;
    return;
  }
  const items = filteredItems();
  const total = totalAmount();
  if (items.length === 0) {
    list.innerHTML = emptyState("search", "Không tìm thấy khoản nào", "Thử từ khóa khác hoặc bỏ bộ lọc danh mục.");
    foot.hidden = true;
    return;
  }
  list.innerHTML = items.map((item) => itemRow(item, total)).join("");
  const sub = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  foot.hidden = false;
  foot.innerHTML = `<span>${items.length} khoản</span><span>Tổng: <b>${fmtVnd(sub)}</b>${sub !== total ? ` · ${percent(sub, total)}% tổng tài sản` : ""}</span>`;
}

// ---------- Trang Lịch sử ----------

function renderHistory() {
  const chart = $("historyChart");
  const list = $("snapshotList");
  if (state.snapshots.length === 0) {
    chart.innerHTML = emptyState("chart", "Chưa có lần chốt nào",
      "Bấm “Chốt hôm nay” để lưu lại tổng tài sản ở thời điểm này. Lặp lại mỗi tuần hoặc mỗi tháng.");
    list.innerHTML = '<p class="muted small pad">Danh sách các lần chốt sẽ hiện ở đây.</p>';
    return;
  }
  lineChart(chart, trendPoints(), 260);
  const asc = sortedSnapshots();
  list.innerHTML = asc.map((s, i) => {
    const prev = asc[i - 1];
    const diff = prev ? Number(s.total) - Number(prev.total) : null;
    const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    return `<div class="row row-static">
      <span class="avatar avatar-soft">${icon("flag")}</span>
      <div class="row-main">
        <div class="row-title">${fmtDate(s.date)}</div>
        <div class="row-sub">${s.itemCount} khoản${daysSince(s.date) < 30 ? " · " + relativeDay(s.date) : ""}</div>
      </div>
      <div class="row-end">
        <b class="amount">${fmtVnd(Number(s.total))}</b>
        ${diff === null ? '<span class="muted small">Lần đầu</span>' : `<span class="delta ${cls}">${fmtSigned(diff)}</span>`}
      </div>
      <div class="row-actions show">
        <button type="button" class="icon-btn sm danger" data-snap-delete="${escapeHtml(s.id)}" title="Xóa lần chốt">${icon("trash")}</button>
      </div>
    </div>`;
  }).reverse().join("");
}

// ---------- Trang Cài đặt ----------

function renderSettings() {
  document.querySelectorAll("[data-theme-value]").forEach((b) => {
    const on = b.dataset.themeValue === prefs.theme;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", on);
  });
  $("privacyToggle").checked = prefs.hidden;
  $("backupMeta").textContent = prefs.lastExportAt
    ? "Lần xuất file gần nhất: " + fmtDate(prefs.lastExportAt) + " (" + relativeDay(prefs.lastExportAt) + ")."
    : "Bạn chưa xuất file backup lần nào trên máy này.";
}

function renderAll() {
  document.body.classList.toggle("is-masked", prefs.hidden);
  const btn = $("privacyBtn");
  btn.setAttribute("aria-pressed", prefs.hidden);
  btn.querySelector("use").setAttribute("href", prefs.hidden ? "#i-eye-off" : "#i-eye");
  btn.title = prefs.hidden ? "Hiện số tiền" : "Ẩn số tiền";
  renderDashboard();
  renderAssets();
  renderHistory();
  renderSettings();
}

// ---------- Điều hướng ----------

function currentRoute() {
  const r = location.hash.replace(/^#\/?/, "");
  return ROUTES[r] ? r : "tong-quan";
}

function applyRoute() {
  const route = currentRoute();
  document.querySelectorAll(".view").forEach((v) => { v.hidden = v.dataset.view !== route; });
  document.querySelectorAll("[data-route]").forEach((a) => {
    const on = a.dataset.route === route;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $("pageTitle").textContent = ROUTES[route].title;
  $("pageSubtitle").textContent = ROUTES[route].subtitle;
  document.title = ROUTES[route].title + " · Sổ tài sản";
  $("chartTip").hidden = true;
  window.scrollTo(0, 0);
  renderAll();
}

// ---------- Thông báo & xác nhận ----------

function toast(message, { type = "info", action, onAction } = {}) {
  const el = document.createElement("div");
  el.className = "toast toast-" + type;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = action;
    b.addEventListener("click", () => { onAction(); dismiss(); });
    el.append(b);
  }
  $("toasts").append(el);
  const timer = setTimeout(dismiss, action ? 6000 : 3500);
  function dismiss() {
    clearTimeout(timer);
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 200);
  }
}

function confirmAction({ title, message, confirmText = "Đồng ý", danger = false }) {
  const dlg = $("confirmDialog");
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  const ok = $("confirmOk");
  ok.textContent = confirmText;
  ok.className = "btn " + (danger ? "btn-danger" : "btn-primary");
  dlg.returnValue = "";
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true });
  });
}

// ---------- Thêm / sửa khoản ----------

function renderCategoryPicker() {
  const current = $("itemCategory").value.trim();
  $("categoryPicker").innerHTML = allCategories().map((c) => `<button type="button"
      class="chip${c === current ? " active" : ""}" data-pick="${escapeHtml(c)}"><i style="--c:${categoryColor(c)}"></i>${escapeHtml(c)}</button>`).join("");
}

function updateAmountPreview() {
  const text = $("itemAmount").value;
  const v = parseAmount(text);
  const el = $("amountPreview");
  if (!text.trim()) { el.textContent = "Có thể gõ tắt: 500k, 50tr, 1,2ty"; el.classList.remove("is-error"); return; }
  if (Number.isNaN(v)) { el.textContent = "Số tiền chưa hợp lệ"; el.classList.add("is-error"); return; }
  el.textContent = "= " + fmtPlain(v);
  el.classList.remove("is-error");
}

function showFormError(message, fieldId) {
  const el = $("formError");
  el.textContent = message;
  el.hidden = false;
  if (fieldId) { $(fieldId).setAttribute("aria-invalid", "true"); $(fieldId).focus(); }
}

function clearFormError() {
  $("formError").hidden = true;
  document.querySelectorAll("#itemForm [aria-invalid]").forEach((f) => f.removeAttribute("aria-invalid"));
}

function openItemDialog(id = null) {
  const item = id ? state.items.find((i) => i.id === id) : null;
  editingId = item ? item.id : null;
  $("itemForm").reset();
  clearFormError();
  $("itemName").value = item ? item.name : "";
  $("itemAmount").value = item ? new Intl.NumberFormat("vi-VN").format(Number(item.amount)) : "";
  $("itemCategory").value = item ? item.category : (filterCategory !== "all" && currentRoute() === "tai-san" ? filterCategory : "");
  $("itemNote").value = item ? item.note || "" : "";
  $("itemDialogTitle").textContent = item ? "Sửa khoản" : "Thêm khoản";
  $("submitBtn").textContent = item ? "Lưu thay đổi" : "Lưu khoản";
  $("deleteInDialogBtn").hidden = !item;
  renderCategoryPicker();
  updateAmountPreview();
  $("itemDialog").showModal();
  // Sửa khoản thường là để cập nhật số tiền, nên đặt con trỏ vào ô số tiền.
  const focusEl = item ? $("itemAmount") : $("itemName");
  focusEl.focus();
  if (item) focusEl.select();
}

function closeItemDialog() {
  $("itemDialog").close();
  editingId = null;
}

function deleteItem(id) {
  const idx = state.items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const [removed] = state.items.splice(idx, 1);
  saveState();
  renderAll();
  toast(`Đã xóa “${removed.name}”`, {
    action: "Hoàn tác",
    onAction: () => {
      state.items.splice(Math.min(idx, state.items.length), 0, removed);
      saveState();
      renderAll();
    },
  });
}

function deleteSnapshot(id) {
  const idx = state.snapshots.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const [removed] = state.snapshots.splice(idx, 1);
  saveState();
  renderAll();
  toast("Đã xóa lần chốt " + fmtDate(removed.date), {
    action: "Hoàn tác",
    onAction: () => {
      state.snapshots.splice(Math.min(idx, state.snapshots.length), 0, removed);
      saveState();
      renderAll();
    },
  });
}

async function takeSnapshot() {
  if (state.items.length === 0) { toast("Chưa có khoản nào để chốt.", { type: "warn" }); return; }
  const total = totalAmount();
  const today = state.snapshots.find((s) => sameDay(s.date, new Date()));
  if (today) {
    const ok = await confirmAction({
      title: "Hôm nay đã chốt rồi",
      message: `Lần chốt hôm nay ghi nhận ${fmtVnd(Number(today.total))}. Ghi đè bằng số liệu hiện tại (${fmtVnd(total)})?`,
      confirmText: "Ghi đè",
    });
    if (!ok) return;
    Object.assign(today, { date: new Date().toISOString(), total, itemCount: state.items.length });
  } else {
    state.snapshots.push({ id: Date.now().toString(36), date: new Date().toISOString(), total, itemCount: state.items.length });
  }
  saveState();
  renderAll();
  toast("Đã chốt số liệu: " + fmtVnd(total), { type: "success" });
}

// ---------- Sự kiện ----------

document.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]");
  if (action) {
    if (action.dataset.action === "add") openItemDialog();
    if (action.dataset.action === "snapshot") takeSnapshot();
    return;
  }
  const del = e.target.closest("[data-delete]");
  if (del) { deleteItem(del.dataset.delete); return; }
  const snapDel = e.target.closest("[data-snap-delete]");
  if (snapDel) { deleteSnapshot(snapDel.dataset.snapDelete); return; }
  const edit = e.target.closest("[data-edit]");
  if (edit) { openItemDialog(edit.dataset.edit); return; }
  const filter = e.target.closest("[data-filter]");
  if (filter) { filterCategory = filter.dataset.filter; renderAssets(); return; }
  const pick = e.target.closest("[data-pick]");
  if (pick) { $("itemCategory").value = pick.dataset.pick; renderCategoryPicker(); return; }
  const theme = e.target.closest("[data-theme-value]");
  if (theme) { prefs.theme = theme.dataset.themeValue; savePrefs(); applyTheme(); renderSettings(); return; }
  if (e.target.closest("[data-close]")) closeItemDialog();
});

document.addEventListener("keydown", (e) => {
  const typing = e.target.closest("input, textarea, select, dialog");
  if (e.key === "Enter" && e.target.matches(".row[data-edit]")) { openItemDialog(e.target.dataset.edit); return; }
  if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "n" || e.key === "N")) {
    e.preventDefault();
    openItemDialog();
  }
});

// Bấm ra vùng tối bên ngoài hộp thoại để đóng.
for (const dlg of document.querySelectorAll("dialog")) {
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
}
$("itemDialog").addEventListener("close", () => { editingId = null; });

$("itemAmount").addEventListener("input", () => { clearFormError(); updateAmountPreview(); });
$("itemAmount").addEventListener("blur", () => {
  const input = $("itemAmount");
  // Chỉ tự thêm dấu chấm hàng nghìn khi người dùng gõ số thuần, giữ nguyên kiểu gõ tắt.
  if (/^[\d.,\s]+$/.test(input.value)) {
    const v = parseAmount(input.value);
    if (!Number.isNaN(v)) input.value = new Intl.NumberFormat("vi-VN").format(v);
  }
});
$("itemCategory").addEventListener("input", () => { clearFormError(); renderCategoryPicker(); });
$("itemName").addEventListener("input", clearFormError);

$("itemForm").addEventListener("submit", (e) => {
  e.preventDefault();
  clearFormError();
  const name = $("itemName").value.trim();
  const category = $("itemCategory").value.trim();
  const amount = parseAmount($("itemAmount").value);
  const note = $("itemNote").value.trim();
  if (!name) return showFormError("Nhập tên khoản.", "itemName");
  if (Number.isNaN(amount) || amount < 0) return showFormError("Số tiền chưa hợp lệ.", "itemAmount");
  if (!category) return showFormError("Chọn hoặc gõ một danh mục.", "itemCategory");
  if (editingId) {
    const item = state.items.find((i) => i.id === editingId);
    if (item) Object.assign(item, { name, category, amount, note, updatedAt: new Date().toISOString() });
    toast(`Đã cập nhật “${name}”`, { type: "success" });
  } else {
    state.items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, category, amount, note, updatedAt: new Date().toISOString() });
    toast(`Đã thêm “${name}”`, { type: "success" });
  }
  saveState();
  closeItemDialog();
  renderAll();
});

$("deleteInDialogBtn").addEventListener("click", () => {
  const id = editingId;
  closeItemDialog();
  deleteItem(id);
});

$("searchInput").addEventListener("input", (e) => { searchText = e.target.value; renderAssets(); });
$("sortSelect").addEventListener("change", (e) => { sortMode = e.target.value; renderAssets(); });
$("staleCard").addEventListener("click", () => { sortMode = "stale"; $("sortSelect").value = "stale"; filterCategory = "all"; });

function togglePrivacy(force) {
  prefs.hidden = typeof force === "boolean" ? force : !prefs.hidden;
  savePrefs();
  renderAll();
}
$("privacyBtn").addEventListener("click", () => togglePrivacy());
$("privacyToggle").addEventListener("change", (e) => togglePrivacy(e.target.checked));

function applyTheme() {
  if (prefs.theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", prefs.theme);
}

$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items: state.items, snapshots: state.snapshots }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "so-tai-san-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
  prefs.lastExportAt = new Date().toISOString();
  savePrefs();
  renderSettings();
  toast("Đã xuất file backup.", { type: "success" });
});

$("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try {
      data = JSON.parse(reader.result);
      if (!Array.isArray(data.items)) throw new Error("File không đúng định dạng.");
    } catch (err) {
      toast("Không đọc được file: " + err.message, { type: "error" });
      return;
    }
    const ok = await confirmAction({
      title: "Nhập dữ liệu từ file?",
      message: `File có ${data.items.length} khoản và ${Array.isArray(data.snapshots) ? data.snapshots.length : 0} lần chốt. Dữ liệu hiện tại trên máy này sẽ bị thay thế toàn bộ.`,
      confirmText: "Nhập và thay thế",
      danger: true,
    });
    if (!ok) return;
    state = { items: data.items, snapshots: Array.isArray(data.snapshots) ? data.snapshots : [] };
    saveState();
    renderAll();
    toast("Đã nhập file thành công.", { type: "success" });
  };
  reader.readAsText(file);
  e.target.value = "";
});

$("clearBtn").addEventListener("click", async () => {
  const ok = await confirmAction({
    title: "Xóa hết dữ liệu?",
    message: "Toàn bộ khoản và lịch sử chốt trên máy này sẽ bị xóa, không thể hoàn tác. Hãy xuất file backup trước nếu cần giữ lại.",
    confirmText: "Xóa hết",
    danger: true,
  });
  if (!ok) return;
  state = { items: [], snapshots: [] };
  saveState();
  renderAll();
  toast("Đã xóa hết dữ liệu.");
});

window.addEventListener("hashchange", applyRoute);
let resizeTimer;
let lastWidth = window.innerWidth;
window.addEventListener("resize", () => {
  // Trên điện thoại thanh địa chỉ ẩn/hiện cũng bắn resize, chỉ vẽ lại khi chiều ngang đổi.
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { renderDashboard(); renderHistory(); }, 150);
});
window.addEventListener("scroll", () => { $("chartTip").hidden = true; }, { passive: true });

applyTheme();
applyRoute();
