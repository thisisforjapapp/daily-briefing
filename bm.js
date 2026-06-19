/* =====================================================================
   Daily Learning — Bookmarks (local-first, with optional cross-device sync)
   ---------------------------------------------------------------------
   - Stores bookmarks in this browser (localStorage).
   - If a "sync code" is set, also syncs through the Cloudflare Worker so
     the same bookmarks appear on every device that uses the same code.
   - Add/remove merge is conflict-safe across devices (per-item timestamps
     + delete tombstones), so saving on your phone and laptop both stick
     and removals propagate.
   Loaded by every briefing page and by bookmarks.html.
   ===================================================================== */
(function () {
  "use strict";

  var WORKER_URL = "https://daily-bookmarks.mankin1024.workers.dev"; // sync backend
  var KEY = "dl_bookmarks";        // main store (v2 object shape)
  var CODE_KEY = "dl_sync_code";   // the user's secret sync code
  var listeners = [];

  // ---- storage (with migration from the old plain-array format) ----
  function now() { return Date.now(); }
  function blank() { return { items: [], deleted: {}, updatedAt: 0 }; }
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(raw)) {                     // migrate old array → object
        var items = raw.map(function (b) { b.ts = b.ts || now(); return b; });
        var st = { items: items, deleted: {}, updatedAt: now() };
        save(st); return st;
      }
      if (raw && Array.isArray(raw.items)) return raw;
    } catch (e) {}
    return blank();
  }
  function save(st) {
    localStorage.setItem(KEY, JSON.stringify(st));
    listeners.forEach(function (cb) { try { cb(); } catch (e) {} });
  }
  function k(b) { return b.file + "#" + b.id; }

  // ---- public read helpers ----
  function items() {
    return load().items.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }
  function isSaved(file, id) {
    return load().items.some(function (b) { return b.file === file && b.id === id; });
  }

  // ---- add / remove (with tombstones for clean cross-device removal) ----
  function toggle(meta) {
    var st = load();
    var key = meta.file + "#" + meta.id;
    var idx = st.items.findIndex(function (b) { return k(b) === key; });
    var added;
    if (idx >= 0) { st.items.splice(idx, 1); st.deleted[key] = now(); added = false; }
    else {
      meta.ts = now(); st.items.unshift(meta); delete st.deleted[key]; added = true;
    }
    st.updatedAt = now();
    save(st);
    scheduleSync();
    return added;
  }
  function remove(file, id) {
    var st = load(); var key = file + "#" + id;
    st.items = st.items.filter(function (b) { return k(b) !== key; });
    st.deleted[key] = now(); st.updatedAt = now();
    save(st); scheduleSync();
  }
  function clear() {
    var st = load(); var t = now();
    st.items.forEach(function (b) { st.deleted[k(b)] = t; });
    st.items = []; st.updatedAt = t; save(st); scheduleSync();
  }

  // ---- merge two states (conflict-safe) ----
  function merge(a, b) {
    var addTs = {}, item = {}, delTs = {};
    [a, b].forEach(function (st) {
      (st.items || []).forEach(function (it) {
        var key = k(it);
        if (!(key in addTs) || (it.ts || 0) > addTs[key]) { addTs[key] = it.ts || 0; item[key] = it; }
      });
      Object.keys(st.deleted || {}).forEach(function (key) {
        if (!(key in delTs) || st.deleted[key] > delTs[key]) delTs[key] = st.deleted[key];
      });
    });
    var outItems = [], outDel = {};
    Object.keys(item).forEach(function (key) {
      if ((delTs[key] || 0) > (addTs[key] || 0)) outDel[key] = delTs[key];   // deleted later → gone
      else outItems.push(item[key]);
    });
    Object.keys(delTs).forEach(function (key) {
      if (!(key in item) || (delTs[key] || 0) >= (addTs[key] || 0)) outDel[key] = delTs[key];
    });
    outItems.sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
    return { items: outItems, deleted: outDel, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0, now()) };
  }

  // ---- sync code ----
  function getCode() { return localStorage.getItem(CODE_KEY) || ""; }
  function setCode(c) {
    c = (c || "").trim();
    if (c && !/^[A-Za-z0-9_-]{6,64}$/.test(c)) throw new Error("Code must be 6–64 letters, numbers, - or _");
    if (c) localStorage.setItem(CODE_KEY, c); else localStorage.removeItem(CODE_KEY);
  }
  function syncEnabled() { return !!getCode() && /^https?:\/\//.test(WORKER_URL); }

  // ---- network sync ----
  var syncing = false, pending = false, timer = null;
  function scheduleSync() {
    if (!syncEnabled()) return;
    clearTimeout(timer);
    timer = setTimeout(function () { syncNow(); }, 800);
  }
  function syncNow() {
    if (!syncEnabled()) return Promise.resolve({ ok: false, reason: "no-code" });
    if (syncing) { pending = true; return Promise.resolve({ ok: false, reason: "busy" }); }
    syncing = true;
    var url = WORKER_URL + "/?code=" + encodeURIComponent(getCode());
    return fetch(url, { method: "GET" })
      .then(function (r) { return r.json(); })
      .then(function (remote) {
        if (!remote || !Array.isArray(remote.items)) remote = blank();
        var merged = merge(load(), remote);
        save(merged);
        return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(merged) });
      })
      .then(function () { return { ok: true }; })
      .catch(function (e) { return { ok: false, reason: String(e) }; })
      .then(function (res) {
        syncing = false;
        if (pending) { pending = false; scheduleSync(); }
        return res;
      });
  }

  // ---- export / import (manual transfer fallback) ----
  function exportData() { return JSON.stringify(load().items, null, 2); }
  function importData(text) {
    var incoming = JSON.parse(text);
    if (!Array.isArray(incoming)) throw new Error("not a bookmark file");
    var st = load(); var seen = {};
    st.items.forEach(function (b) { seen[k(b)] = 1; });
    incoming.forEach(function (b) { if (b && b.file && b.id && !seen[k(b)]) { b.ts = b.ts || now(); st.items.push(b); delete st.deleted[k(b)]; } });
    st.updatedAt = now(); save(st); scheduleSync();
  }

  // ---- per-card button handler (used by briefing pages) ----
  function flash(msg) {
    var f = document.createElement("div"); f.className = "bm-flash"; f.textContent = msg;
    document.body.appendChild(f); requestAnimationFrame(function () { f.classList.add("show"); });
    setTimeout(function () { f.classList.remove("show"); setTimeout(function () { f.remove(); }, 300); }, 1400);
  }
  function fileName() { return location.pathname.split("/").pop() || "index.html"; }
  window.toggleBookmark = function (btn) {
    var card = btn.closest(".card"); if (!card) return;
    var h2 = card.querySelector("h2"), lbl = card.querySelector(".card-label");
    var meta = document.querySelector(".sticky-top .meta");
    var added = toggle({
      file: fileName(), id: card.id,
      title: h2 ? h2.textContent.trim() : "Untitled",
      label: lbl ? lbl.textContent.trim() : "",
      date: meta ? meta.textContent.trim() : ""
    });
    if (added) btn.classList.add("on"); else btn.classList.remove("on");
    flash(added ? "Saved to bookmarks" : "Removed from bookmarks");
  };

  // ---- toolbar Save / Send (kept here so every page shares one copy) ----
  window.briefingSave = function () {
    var fn = fileName();
    var url = location.href.indexOf("github.io") > -1 ? location.href
      : "https://thisisforjapapp.github.io/daily-briefing/" + fn;
    window.open(url, "_blank");
  };
  window.briefingShare = function () {
    var fn = fileName();
    var url = location.href.indexOf("github.io") > -1 ? location.href
      : "https://thisisforjapapp.github.io/daily-briefing/" + fn;
    if (navigator.share) navigator.share({ title: document.title, url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { alert("Link copied!"); });
  };

  // ---- mark already-saved buttons on load, then sync ----
  function markButtons() {
    var f = fileName();
    document.querySelectorAll(".card").forEach(function (c) {
      var b = c.querySelector(".bm-btn"); if (b && isSaved(f, c.id)) b.classList.add("on");
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    markButtons();
    if (syncEnabled()) syncNow().then(function () { markButtons(); });
  });

  // ---- public API for bookmarks.html ----
  window.BM = {
    items: items, remove: remove, clear: clear,
    exportData: exportData, importData: importData,
    getCode: getCode, setCode: setCode, syncNow: syncNow, syncEnabled: syncEnabled,
    onChange: function (cb) { listeners.push(cb); }
  };
})();
