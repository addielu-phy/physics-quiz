/* ===========================================================
   外觀切換器：版面（深色/淺色清新）＋ 強調色
   設定存 localStorage，學生/老師各自選擇，重新整理仍保留。
   （首次套用由各 HTML <head> 的內嵌小程式完成，避免閃爍）
   =========================================================== */
(function () {
  const KEY = "wfquiz_theme";
  const ACCENTS = [
    { id: "ocean", name: "海藍", c: "#4c8dff" },
    { id: "forest", name: "森綠", c: "#2bb673" },
    { id: "grape", name: "葡萄", c: "#8b7cf0" },
    { id: "coral", name: "珊瑚", c: "#fc6a86" },
    { id: "sky", name: "天青", c: "#2bb3e6" }
  ];
  function get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function cur() { const t = get(); return { theme: t.theme || "dark", accent: t.accent || "ocean" }; }
  function apply(s) { const d = document.documentElement; d.dataset.theme = s.theme; d.dataset.accent = s.accent; }
  apply(cur());

  function setKV(k, v) { const s = cur(); s[k] = v; localStorage.setItem(KEY, JSON.stringify(s)); apply(s); refresh(); }
  function refresh() {
    const s = cur();
    document.querySelectorAll("#themeFab [data-set-theme]").forEach(b => b.classList.toggle("on", b.dataset.setTheme === s.theme));
    document.querySelectorAll("#themeFab [data-set-accent]").forEach(b => b.classList.toggle("on", b.dataset.setAccent === s.accent));
  }
  function build() {
    if (document.getElementById("themeFab")) return;
    const host = document.createElement("div");
    host.id = "themeFab";
    host.innerHTML = `
      <button class="theme-btn" id="themeToggle" aria-label="外觀設定" title="切換版面與顏色">🎨</button>
      <div class="theme-panel" id="themePanel" hidden>
        <div class="tp-title">版面</div>
        <div class="tp-row">
          <button class="tp-opt" data-set-theme="light">☀️ 淺色清新</button>
          <button class="tp-opt" data-set-theme="dark">🌙 深色</button>
        </div>
        <div class="tp-title">主題顏色</div>
        <div class="tp-swatches">
          ${ACCENTS.map(a => `<button class="tp-sw" data-set-accent="${a.id}" title="${a.name}" style="background:${a.c}"></button>`).join("")}
        </div>
      </div>`;
    document.body.appendChild(host);
    const panel = document.getElementById("themePanel");
    document.getElementById("themeToggle").addEventListener("click", e => { e.stopPropagation(); panel.hidden = !panel.hidden; });
    panel.addEventListener("click", e => e.stopPropagation());
    host.querySelectorAll("[data-set-theme]").forEach(b => b.addEventListener("click", () => setKV("theme", b.dataset.setTheme)));
    host.querySelectorAll("[data-set-accent]").forEach(b => b.addEventListener("click", () => setKV("accent", b.dataset.setAccent)));
    document.addEventListener("click", () => { panel.hidden = true; });
    refresh();
  }
  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
