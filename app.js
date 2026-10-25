// Sổ tài sản - web tĩnh, dữ liệu chỉ lưu ở localStorage của trình duyệt.
// Muốn đổi danh mục mặc định thì sửa mảng DEFAULT_CATEGORIES bên dưới.
// Muốn thêm tính năng sau này (đồng bộ cloud, tự lấy giá...) thì sửa file này,
// không cần đụng tới cấu trúc dữ liệu đã lưu, trừ khi bạn đổi hẳn định dạng.

const STORAGE_KEY = "money-tracker-v1";
const DEFAULT_CATEGORIES = ["Tiền mặt", "Tiết kiệm", "Quỹ", "Vàng", "Crypto"];

let state = loadState();
let editingId = null;

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

function fmtVnd(n) {
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

function parseAmount(text) {
  // Chấp nhận "50.000.000", "50,000,000" hay "50000000" đều ra 50000000.
  const cleaned = String(text).replace(/[^\d]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

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

function renderCategories() {
  const list = document.getElementById("categoryList");
  list.innerHTML = allCategories().map((c) => `<option value="${escapeHtml(c)}">`).join("");
}

function renderSummary() {
  const total = totalAmount();
  document.getElementById("totalAmount").textContent = fmtVnd(total);
  document.getElementById("itemCount").textContent = state.items.length;
  document.getElementById("totalMeta").textContent =
    state.items.length === 0
      ? "Chưa có khoản nào"
      : "Cập nhật lần cuối: " + latestUpdateText();
  const totals = categoryTotals();
  if (totals.length > 0) {
    document.getElementById("topCategory").textContent = totals[0][0];
    document.getElementById("topCategoryMeta").textContent =
      fmtVnd(totals[0][1]) + " · " + percent(totals[0][1], total) + "% tổng tài sản";
  } else {
    document.getElementById("topCategory").textContent = "—";
    document.getElementById("topCategoryMeta").textContent = "—";
  }
}

function latestUpdateText() {
  const dates = state.items.map((i) => i.updatedAt).filter(Boolean).sort();
  if (dates.length === 0) return "chưa rõ";
  return new Date(dates[dates.length - 1]).toLocaleDateString("vi-VN");
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function renderBreakdown() {
  const total = totalAmount();
  const el = document.getElementById("breakdown");
  const totals = categoryTotals();
  if (totals.length === 0) {
    el.innerHTML = '<p class="empty">Thêm khoản đầu tiên để xem phân bổ.</p>';
    return;
  }
  el.innerHTML = totals.map(([cat, amount]) => `
    <div class="bar-row">
      <div class="bar-head"><span>${escapeHtml(cat)}</span><span>${fmtVnd(amount)} · ${percent(amount, total)}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${percent(amount, total)}%"></div></div>
    </div>`).join("");
}

function renderItems() {
  const el = document.getElementById("itemList");
  if (state.items.length === 0) {
    el.innerHTML = '<p class="empty">Chưa có khoản nào. Thêm khoản đầu tiên ở form bên trên.</p>';
    return;
  }
  const sorted = [...state.items].sort((a, b) => Number(b.amount) - Number(a.amount));
  el.innerHTML = sorted.map((item) => `
    <div class="item-row">
      <div>
        <b>${escapeHtml(item.name)}</b>
        <span class="tag">${escapeHtml(item.category)}</span>
        ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ""}
        <div class="muted">Cập nhật: ${item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("vi-VN") : "—"}</div>
      </div>
      <div class="item-amount">
        <b>${fmtVnd(Number(item.amount))}</b>
        <div>
          <button type="button" class="mini-btn" data-edit="${item.id}">Sửa</button>
          <button type="button" class="mini-btn danger-text" data-delete="${item.id}">Xóa</button>
        </div>
      </div>
    </div>`).join("");
  el.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startEdit(btn.dataset.edit));
  });
  el.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Xóa khoản này?")) return;
      state.items = state.items.filter((i) => i.id !== btn.dataset.delete);
      saveState();
      renderAll();
    });
  });
}

function renderSnapshots() {
  const el = document.getElementById("snapshotList");
  if (state.snapshots.length === 0) {
    el.innerHTML = '<p class="empty">Chưa có lần chốt nào.</p>';
    return;
  }
  const sorted = [...state.snapshots].sort((a, b) => new Date(b.date) - new Date(a.date));
  el.innerHTML = sorted.map((s) => `
    <div class="item-row">
      <div><b>${new Date(s.date).toLocaleDateString("vi-VN")}</b><div class="muted">${s.itemCount} khoản</div></div>
      <div class="item-amount"><b>${fmtVnd(Number(s.total))}</b>
      <div><button type="button" class="mini-btn danger-text" data-snap-delete="${s.id}">Xóa</button></div></div>
    </div>`).join("");
  el.querySelectorAll("[data-snap-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.snapshots = state.snapshots.filter((s) => s.id !== btn.dataset.snapDelete);
      saveState();
      renderAll();
    });
  });
}

function renderAll() {
  renderCategories();
  renderSummary();
  renderBreakdown();
  renderItems();
  renderSnapshots();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
}

function startEdit(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  editingId = id;
  document.getElementById("itemName").value = item.name;
  document.getElementById("itemCategory").value = item.category;
  document.getElementById("itemAmount").value = item.amount;
  document.getElementById("itemNote").value = item.note || "";
  document.getElementById("submitBtn").textContent = "Lưu thay đổi";
  document.getElementById("cancelEditBtn").hidden = false;
  document.getElementById("itemForm").scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  editingId = null;
  document.getElementById("itemForm").reset();
  document.getElementById("submitBtn").textContent = "Lưu khoản";
  document.getElementById("cancelEditBtn").hidden = true;
}

document.getElementById("itemForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("itemName").value.trim();
  const category = document.getElementById("itemCategory").value.trim();
  const amount = parseAmount(document.getElementById("itemAmount").value);
  const note = document.getElementById("itemNote").value.trim();
  if (!name || !category || Number.isNaN(amount) || amount < 0) {
    alert("Kiểm tra lại tên, danh mục và số tiền.");
    return;
  }
  if (editingId) {
    const item = state.items.find((i) => i.id === editingId);
    if (item) Object.assign(item, { name, category, amount, note, updatedAt: new Date().toISOString() });
  } else {
    state.items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, category, amount, note, updatedAt: new Date().toISOString() });
  }
  saveState();
  resetForm();
  renderAll();
});

document.getElementById("cancelEditBtn").addEventListener("click", resetForm);

document.getElementById("snapshotBtn").addEventListener("click", () => {
  if (state.items.length === 0) { alert("Chưa có khoản nào để chốt."); return; }
  state.snapshots.push({ id: Date.now().toString(36), date: new Date().toISOString(), total: totalAmount(), itemCount: state.items.length });
  saveState();
  renderAll();
  document.getElementById("statusMsg").textContent = "Đã chốt số liệu hôm nay.";
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items: state.items, snapshots: state.snapshots }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "so-tai-san-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.items)) throw new Error("File không đúng định dạng.");
      if (!confirm("Nhập file này sẽ thay toàn bộ dữ liệu hiện tại trên máy này. Bạn chắc chứ?")) return;
      state = { items: data.items, snapshots: Array.isArray(data.snapshots) ? data.snapshots : [] };
      saveState();
      resetForm();
      renderAll();
      document.getElementById("statusMsg").textContent = "Đã nhập file thành công.";
    } catch (err) {
      alert("Không đọc được file: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (!confirm("Xóa hết dữ liệu trên máy này? Hãy xuất file backup trước nếu bạn cần giữ lại.")) return;
  state = { items: [], snapshots: [] };
  saveState();
  resetForm();
  renderAll();
});

renderAll();
