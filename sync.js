// Đồng bộ qua GitHub Gist. Dữ liệu được mã hóa ngay trên trình duyệt trước khi gửi đi:
// khóa AES-GCM 256-bit sinh từ mật khẩu đồng bộ bằng PBKDF2-SHA256, gist chỉ nhận chuỗi mã hóa.
// Máy chỉ lưu khóa đã sinh (không lưu mật khẩu) cùng token, trong key riêng không nằm trong file backup.
// File này chạy trước app.js và dùng các hàm/biến của app.js (state, renderAll, confirmAction...) lúc chạy.

const SYNC_KEY = "money-tracker-sync";
const GIST_FILE = "so-tai-san.enc.json";
const GIST_FORMAT = "so-tai-san-sync";
const KDF_ITERATIONS = 600000;
const GITHUB_API = "https://api.github.com";

let sync = loadSync();
let syncKey = null;
let syncBusy = false;
let syncAgain = false;
let pushTimer = null;
let changeSeq = 0;
let syncStatus = { state: "idle", message: "" };

class SyncError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function loadSync() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || null; } catch (e) { return null; }
}

function saveSync() {
  try {
    if (sync) localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
    else localStorage.removeItem(SYNC_KEY);
  } catch (e) { /* không lưu được thì lần sau kết nối lại */ }
}

function syncConnected() {
  return !!(sync && sync.token && sync.gistId && sync.key);
}

// ---------- Mã hóa ----------

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function getSyncKey() {
  if (!syncKey) syncKey = await crypto.subtle.importKey("raw", fromB64(sync.key), "AES-GCM", false, ["encrypt", "decrypt"]);
  return syncKey;
}

async function encryptData(key, kdf, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return JSON.stringify({ format: GIST_FORMAT, version: 1, kdf, iv: toB64(iv), ciphertext: toB64(ct) }, null, 2);
}

async function decryptData(key, envelope) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(envelope.iv) }, key, fromB64(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---------- GitHub Gist API ----------

async function gh(token, path, options = {}) {
  let res;
  try {
    res = await fetch(GITHUB_API + path, {
      ...options,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch (e) {
    throw new SyncError("Không kết nối được tới GitHub.", "offline");
  }
  if (res.status === 401) throw new SyncError("Token không hợp lệ, đã hết hạn hoặc đã bị thu hồi.", "auth");
  if (res.status === 403) throw new SyncError("Token chưa có quyền Gists (Read and write), hoặc đã vượt giới hạn gọi API của GitHub.", "forbidden");
  if (res.status === 404) throw new SyncError("Không tìm thấy gist đồng bộ (có thể đã bị xóa).", "missing");
  if (!res.ok) throw new SyncError("GitHub trả lỗi " + res.status + ".", "http");
  return res.json();
}

function gistVersion(gist) {
  return (gist.history && gist.history[0] && gist.history[0].version) || gist.updated_at;
}

async function findGist(token) {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => g.files && g.files[GIST_FILE]);
    if (hit) return hit.id;
    if (list.length < 100) return null;
  }
  return null;
}

async function readGist(token, id) {
  const gist = await gh(token, "/gists/" + id);
  const file = gist.files && gist.files[GIST_FILE];
  if (!file) throw new SyncError("Gist không còn file dữ liệu đồng bộ.", "missing");
  let content = file.content;
  if (file.truncated) {
    try { content = await (await fetch(file.raw_url, { cache: "no-store" })).text(); }
    catch (e) { throw new SyncError("Không tải được file dữ liệu từ Gist.", "offline"); }
  }
  let envelope;
  try { envelope = JSON.parse(content); } catch (e) { envelope = null; }
  if (!envelope || envelope.format !== GIST_FORMAT || !envelope.kdf || !envelope.iv || !envelope.ciphertext) {
    throw new SyncError("File trên Gist không đúng định dạng đồng bộ.", "format");
  }
  return { envelope, version: gistVersion(gist), url: gist.html_url };
}

async function writeGist(token, id, content) {
  const gist = await gh(token, "/gists/" + id, { method: "PATCH", body: JSON.stringify({ files: { [GIST_FILE]: { content } } }) });
  return gistVersion(gist);
}

async function createGist(token, content) {
  const gist = await gh(token, "/gists", {
    method: "POST",
    body: JSON.stringify({ description: "Sổ tài sản - dữ liệu đồng bộ đã mã hóa", public: false, files: { [GIST_FILE]: { content } } }),
  });
  return { id: gist.id, version: gistVersion(gist), url: gist.html_url };
}

// ---------- Đồng bộ ----------

function localData() {
  return { items: state.items, snapshots: state.snapshots };
}

function sameData(a, b) {
  return JSON.stringify({ items: a.items || [], snapshots: a.snapshots || [] }) === JSON.stringify({ items: b.items || [], snapshots: b.snapshots || [] });
}

function applyRemoteData(data) {
  const changed = !sameData(data, localData());
  state = { items: Array.isArray(data.items) ? data.items : [], snapshots: Array.isArray(data.snapshots) ? data.snapshots : [] };
  writeState();
  renderAll();
  return changed;
}

// Gọi mỗi khi dữ liệu trên máy thay đổi: đánh dấu và đẩy lên sau một nhịp ngắn để gộp nhiều thay đổi liên tiếp.
function markLocalChange() {
  if (!syncConnected()) return;
  changeSeq++;
  sync.dirty = true;
  saveSync();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 1500);
  if (!syncBusy) setSyncStatus("pending");
}

async function pushLocal() {
  const seq = changeSeq;
  const content = await encryptData(await getSyncKey(), sync.kdf, localData());
  sync.version = await writeGist(sync.token, sync.gistId, content);
  // Nếu trong lúc gửi lại có thay đổi mới thì vẫn giữ cờ để lượt sau gửi tiếp.
  if (seq === changeSeq) sync.dirty = false;
}

function summarize(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const total = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  return `${items.length} khoản, tổng ${fmtVnd(total)}`;
}

async function chooseVersion(remoteData, intro) {
  return chooseAction({
    title: "Chọn bản dữ liệu",
    message: `${intro}\n\nTrên Gist: ${summarize(remoteData)}.\nTrên máy này: ${summarize(localData())}.\n\nBản không được chọn sẽ bị thay thế.`,
    confirmText: "Dùng bản trên Gist",
    altText: "Giữ bản trên máy",
  });
}

async function syncNow() {
  if (!syncConnected()) return;
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true;
  clearTimeout(pushTimer);
  setSyncStatus("syncing");
  try {
    const remote = await readGist(sync.token, sync.gistId);
    if (remote.envelope.kdf.salt !== sync.kdf.salt) {
      throw new SyncError("Mật khẩu đồng bộ trên Gist đã bị đổi từ máy khác. Hãy ngắt đồng bộ rồi kết nối lại.", "key");
    }
    if (remote.version !== sync.version) {
      const remoteData = await decryptData(await getSyncKey(), remote.envelope);
      if (sync.dirty && !sameData(remoteData, localData())) {
        const choice = await chooseVersion(remoteData, "Dữ liệu trên máy này và trên Gist đều đã thay đổi kể từ lần đồng bộ trước.");
        if (choice === "ok") {
          applyRemoteData(remoteData);
          sync.version = remote.version;
          sync.dirty = false;
        } else if (choice === "alt") {
          sync.version = remote.version;
          await pushLocal();
        } else {
          setSyncStatus("conflict", "Bấm “Đồng bộ ngay” để chọn bản dữ liệu muốn giữ.");
          return;
        }
      } else {
        if (applyRemoteData(remoteData)) toast("Đã cập nhật dữ liệu mới từ Gist.", { type: "success" });
        sync.version = remote.version;
        sync.dirty = false;
      }
    } else if (sync.dirty) {
      await pushLocal();
    }
    sync.lastSyncAt = new Date().toISOString();
    setSyncStatus(sync.dirty ? "pending" : "ok");
  } catch (e) {
    handleSyncError(e);
  } finally {
    saveSync();
    syncBusy = false;
    if (syncAgain) { syncAgain = false; syncNow(); }
  }
}

function handleSyncError(e) {
  if (!syncConnected()) return;
  if (e.code === "offline") setSyncStatus("offline", "Chưa kết nối được GitHub, sẽ tự thử lại khi có mạng.");
  else if (e.name === "OperationError") setSyncStatus("error", "Không giải mã được dữ liệu trên Gist. Hãy ngắt đồng bộ rồi kết nối lại.");
  else setSyncStatus("error", e.message || "Đồng bộ thất bại.");
}

async function connectSync(token, passphrase) {
  const previous = sync;
  try {
    const gistId = await findGist(token);
    if (gistId) {
      const remote = await readGist(token, gistId);
      const kdf = remote.envelope.kdf;
      const key = await deriveKey(passphrase, fromB64(kdf.salt), kdf.iterations);
      let remoteData;
      try { remoteData = await decryptData(key, remote.envelope); }
      catch (e) { throw new SyncError("Sai mật khẩu đồng bộ: không giải mã được dữ liệu đang có trên Gist.", "passphrase"); }
      let choice = "ok";
      const hasLocal = state.items.length > 0 || state.snapshots.length > 0;
      if (hasLocal && !sameData(remoteData, localData())) {
        choice = await chooseVersion(remoteData, "Đã tìm thấy dữ liệu đồng bộ trên Gist, khác với dữ liệu trên máy này.");
        if (choice !== "ok" && choice !== "alt") return false;
      }
      sync = { token, gistId, url: remote.url, kdf, key: toB64(await crypto.subtle.exportKey("raw", key)), version: remote.version, dirty: false };
      syncKey = null;
      if (choice === "ok") applyRemoteData(remoteData);
      else await pushLocal();
    } else {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const kdf = { name: "PBKDF2", hash: "SHA-256", iterations: KDF_ITERATIONS, salt: toB64(salt) };
      const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
      const created = await createGist(token, await encryptData(key, kdf, localData()));
      sync = { token, gistId: created.id, url: created.url, kdf, key: toB64(await crypto.subtle.exportKey("raw", key)), version: created.version, dirty: false };
      syncKey = null;
    }
    sync.lastSyncAt = new Date().toISOString();
    saveSync();
    setSyncStatus("ok");
    return true;
  } catch (e) {
    sync = previous;
    syncKey = null;
    throw e;
  }
}

async function updateSyncToken(token) {
  await readGist(token, sync.gistId);
  sync.token = token;
  saveSync();
  syncNow();
}

function disconnectSync() {
  clearTimeout(pushTimer);
  sync = null;
  syncKey = null;
  saveSync();
  setSyncStatus("idle");
}

// ---------- Giao diện ----------

const SYNC_LABELS = {
  ok: "Đã đồng bộ",
  pending: "Có thay đổi chờ đồng bộ",
  syncing: "Đang đồng bộ…",
  offline: "Mất kết nối",
  error: "Lỗi đồng bộ",
  conflict: "Cần chọn bản dữ liệu",
};

function setSyncStatus(stateName, message = "") {
  syncStatus = { state: stateName, message };
  renderSync();
}

function renderSync() {
  const on = syncConnected();
  $("syncSetup").hidden = on;
  $("syncConnected").hidden = !on;
  const indicator = $("syncIndicator");
  indicator.hidden = !on;
  $("sideFootText").textContent = on ? "Đồng bộ mã hóa qua GitHub Gist" : "Dữ liệu chỉ lưu trong trình duyệt này";
  if (!on) return;
  const st = syncStatus.state === "idle" ? (sync.dirty ? "pending" : "ok") : syncStatus.state;
  const label = SYNC_LABELS[st];
  indicator.dataset.state = st;
  indicator.title = label;
  $("syncBadge").dataset.state = st;
  $("syncStatusText").textContent = label;
  const last = sync.lastSyncAt
    ? "Lần đồng bộ gần nhất: " + new Date(sync.lastSyncAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) + " " + relativeDay(sync.lastSyncAt) + "."
    : "";
  $("syncStatusMeta").textContent = [syncStatus.message, last].filter(Boolean).join(" ");
  $("syncGistLink").href = sync.url || "https://gist.github.com/";
  $("syncNowBtn").disabled = st === "syncing";
}

function initSync() {
  $("syncForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("syncError");
    err.hidden = true;
    const token = $("syncToken").value.trim();
    const pass = $("syncPass").value;
    const fail = (msg, field) => { err.textContent = msg; err.hidden = false; if (field) $(field).focus(); };
    if (!token) return fail("Dán token GitHub vào.", "syncToken");
    if (pass.length < 8) return fail("Mật khẩu đồng bộ cần ít nhất 8 ký tự.", "syncPass");
    if (pass !== $("syncPass2").value) return fail("Hai lần nhập mật khẩu chưa khớp.", "syncPass2");
    const btn = $("syncConnectBtn");
    btn.disabled = true;
    btn.textContent = "Đang kết nối…";
    try {
      if (await connectSync(token, pass)) {
        $("syncForm").reset();
        toast("Đã bật đồng bộ qua Gist.", { type: "success" });
      }
    } catch (ex) {
      fail(ex.message || "Kết nối thất bại.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Kết nối";
    }
  });

  $("syncTokenForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = $("syncNewToken").value.trim();
    if (!token) return;
    try {
      await updateSyncToken(token);
      $("syncTokenForm").reset();
      $("syncTokenForm").closest("details").open = false;
      toast("Đã cập nhật token.", { type: "success" });
    } catch (ex) {
      toast(ex.message, { type: "error" });
    }
  });

  $("syncNowBtn").addEventListener("click", syncNow);
  $("syncDisconnectBtn").addEventListener("click", async () => {
    const ok = await confirmAction({
      title: "Ngắt đồng bộ trên máy này?",
      message: "Token và khóa mã hóa sẽ bị xóa khỏi máy này. Dữ liệu trên máy và trên Gist vẫn giữ nguyên, có thể kết nối lại bất cứ lúc nào.",
      confirmText: "Ngắt đồng bộ",
      danger: true,
    });
    if (!ok) return;
    disconnectSync();
    toast("Đã ngắt đồng bộ.");
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
  window.addEventListener("online", syncNow);
  renderSync();
  syncNow();
}
