/* ===========================================================
   理化自學評量 — 主程式
   功能：學生登錄 → 作答 → 自動評分 → 錯題與單元分析＋詳解 → 重複練習
   資料全部存在瀏覽器 localStorage（離線可用，換裝置不共用）
   =========================================================== */
"use strict";

const STORE = "wfquiz_v1";
const LETTERS = ["A", "B", "C", "D"];
const app = document.getElementById("app");

/* ---------- localStorage 讀寫 ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || { profiles: {}, last: "" }; }
  catch (e) { return { profiles: {}, last: "" }; }
}
function save(db) { localStorage.setItem(STORE, JSON.stringify(db)); }
function getProfile(name) {
  const db = load();
  if (!db.profiles[name]) { db.profiles[name] = { created: Date.now(), attempts: [] }; save(db); }
  return db.profiles[name];
}

/* ---------- 工具 ---------- */
const esc = s => String(s);
function fmtDate(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDur(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
function qById(id) { return QUESTIONS.find(q => q.id === id); }
function figuresHTML(q) {
  if (!q.img) return "";
  return `<div class="figure">` +
    q.img.map(src => `<img src="${src}" loading="lazy" alt="第${q.id}題附圖" onclick="zoom('${src}')">`).join("") +
    `<div class="figcap">點圖可放大</div></div>`;
}

/* ---------- 燈箱（放大圖） ---------- */
const lb = document.getElementById("lightbox");
const lbimg = document.getElementById("lbimg");
window.zoom = src => { lbimg.src = src; lb.classList.add("on"); };
lb.onclick = () => lb.classList.remove("on");

/* ---------- 全域狀態 ---------- */
let session = null; // 作答中的狀態

/* ========================================================
   1) 登錄畫面
   ======================================================== */
function viewLogin() {
  const db = load();
  const names = Object.keys(db.profiles);
  const list = names.length ? `
    <hr class="sep">
    <label class="lbl">曾經練習過的學生（點選即可繼續）</label>
    <div class="row">
      ${names.map(n => `<button class="btn sm" onclick="enter('${encodeURIComponent(n)}')">👤 ${n}
        <span class="muted small">（${db.profiles[n].attempts.length} 次）</span></button>`).join("")}
    </div>` : "";

  app.innerHTML = `
    <div class="brand"><div class="logo">理</div>
      <div><h1>理化自學評量</h1>
      <div class="sub">${QUIZ_META.grade}・${QUIZ_META.subject}</div></div>
    </div>
    <div class="card">
      <h3>歡迎！先登錄你的名字</h3>
      <p class="muted small">名字用來記錄你的作答與成績（只存在這台裝置的瀏覽器，不會上傳）。</p>
      <label class="lbl" for="nm">你的名字 / 暱稱</label>
      <input type="text" id="nm" placeholder="例如：小明" maxlength="20"
        onkeydown="if(event.key==='Enter')startLogin()">
      <div style="height:12px"></div>
      <button class="btn primary block" onclick="startLogin()">開始練習 →</button>
      ${list}
    </div>
    <div class="card tight">
      <div class="spread">
        <div><b>本卷</b><div class="muted small">${QUIZ_META.school}</div>
          <div class="muted small">${QUIZ_META.title}</div></div>
        <div class="center"><div class="qno">${QUESTIONS.length}</div><div class="muted small">題・滿分 ${QUIZ_META.total}</div></div>
      </div>
    </div>
    <div class="foot">題目來源：學校官方公開歷屆試題庫，僅供自學練習。<br>成績資料儲存在本機瀏覽器，清除瀏覽資料會一併刪除。</div>
  `;
  const inp = document.getElementById("nm");
  if (db.last) inp.value = db.last;
  inp.focus();
}
window.startLogin = function () {
  const name = document.getElementById("nm").value.trim();
  if (!name) { alert("請先輸入名字喔！"); return; }
  const db = load(); db.last = name; save(db);
  getProfile(name);
  viewDashboard(name);
};
window.enter = function (enc) { const name = decodeURIComponent(enc); const db = load(); db.last = name; save(db); viewDashboard(name); };

/* ========================================================
   2) 個人首頁 / 儀表板
   ======================================================== */
function viewDashboard(name) {
  const prof = getProfile(name);
  const atts = prof.attempts;
  const last = atts[atts.length - 1];

  // 練習紀錄
  let history = `<p class="muted">還沒有紀錄，開始第一次練習吧！</p>`;
  if (atts.length) {
    history = atts.map((a, i) => {
      const prev = i > 0 ? atts[i - 1] : null;
      let delta = "";
      if (prev) {
        const d = pct(a) - pct(prev);
        delta = d === 0 ? `<span class="muted small">持平</span>`
          : `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%</span>`;
      }
      return `<div class="att">
        <div class="badge">${a.score}</div>
        <div class="grow">
          <b>第 ${a.n} 次</b> ${a.mode === "wrong" ? '<span class="chip">錯題練習</span>' : '<span class="chip">全卷</span>'} ${delta}
          <div class="muted small">答對 ${a.correct}/${a.total} 題・用時 ${fmtDur(a.durationSec)}・${fmtDate(a.date)}</div>
        </div>
        <button class="btn sm" onclick="viewResult('${encodeURIComponent(name)}',${i})">看解析</button>
      </div>`;
    }).reverse().join("");
  }

  // 弱點單元（依最近一次）
  let weak = "";
  if (last) {
    const bu = byUnit(last);
    const weakUnits = Object.entries(bu).filter(([, v]) => v.correct / v.total < 0.6)
      .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total));
    if (weakUnits.length) {
      weak = `<div class="card"><h3>⚠️ 最近一次的弱點單元</h3>
        <div class="row">${weakUnits.map(([u, v]) =>
          `<span class="chip bad">${u}　${v.correct}/${v.total}</span>`).join("")}</div>
        <p class="muted small" style="margin-top:8px">建議用下方「只練我的錯題」加強，或重做全卷檢驗進步。</p></div>`;
    }
  }

  const wrongCount = last ? last.wrongIds.length : 0;

  app.innerHTML = `
    <div class="spread">
      <div class="brand"><div class="logo">理</div>
        <div><h1>${name} 的練習室</h1><div class="sub">${QUIZ_META.grade}・${QUIZ_META.subject}</div></div>
      </div>
      <button class="btn sm ghost" onclick="viewLogin()">切換 / 登出</button>
    </div>

    <div class="card">
      <h3>開始練習</h3>
      <p class="muted small">${QUIZ_META.school}　${QUIZ_META.title}（${QUESTIONS.length} 題・滿分 ${QUIZ_META.total} 分）</p>
      <div class="row">
        <button class="btn primary" onclick="startQuiz('${encodeURIComponent(name)}','full')">📝 ${atts.length ? "再做一次全卷" : "開始作答（全卷 50 題）"}</button>
        ${wrongCount ? `<button class="btn accent" onclick="startQuiz('${encodeURIComponent(name)}','wrong')">🎯 只練我的錯題（${wrongCount} 題）</button>` : ""}
      </div>
    </div>

    ${weak}

    <div class="card">
      <h3>練習紀錄 ${atts.length ? `<span class="muted small">（共 ${atts.length} 次）</span>` : ""}</h3>
      ${atts.length >= 2 ? trendBars(atts) : ""}
      ${history}
    </div>
    <div class="foot">資料儲存在本機瀏覽器。</div>
  `;
}
function pct(a) { return Math.round(a.correct / a.total * 100); }
function trendBars(atts) {
  const max = 100;
  return `<div class="row" style="align-items:flex-end;gap:8px;height:84px;margin:4px 0 14px">
    ${atts.map(a => {
      const h = Math.max(6, Math.round(pct(a) / max * 72));
      return `<div class="center" style="flex:1;min-width:24px">
        <div class="small" style="color:var(--accent2);font-weight:700">${a.score}</div>
        <div style="height:${h}px;border-radius:6px 6px 0 0;background:linear-gradient(180deg,var(--accent),var(--accent2))"></div>
        <div class="muted small">${a.n}</div></div>`;
    }).join("")}
  </div><div class="muted small center" style="margin-top:-8px">各次得分趨勢</div>`;
}

/* ========================================================
   3) 作答畫面
   ======================================================== */
window.startQuiz = function (enc, mode) {
  const name = decodeURIComponent(enc);
  const prof = getProfile(name);
  let ids;
  if (mode === "wrong") {
    const last = prof.attempts[prof.attempts.length - 1];
    ids = (last ? last.wrongIds : []).slice();
    if (!ids.length) { alert("目前沒有錯題可練，先做一次全卷吧！"); return; }
  } else {
    ids = QUESTIONS.map(q => q.id);
  }
  session = { name, mode, ids, idx: 0, answers: {}, start: Date.now() };
  renderQuestion();
};

function renderQuestion() {
  const s = session;
  const id = s.ids[s.idx];
  const q = qById(id);
  const total = s.ids.length;
  const answered = Object.keys(s.answers).length;

  const opts = q.o.map((txt, i) => {
    const sel = s.answers[id] === i ? " sel" : "";
    return `<button class="opt${sel}" onclick="pick(${i})">
      <span class="k">${LETTERS[i]}</span><span>${q.oi ? "選項 " + LETTERS[i] + "（見上方圖）" : txt}</span></button>`;
  }).join("");

  const nav = s.ids.map((qid, i) => {
    let c = "";
    if (i === s.idx) c += " cur";
    if (s.answers[qid] !== undefined) c += " done";
    return `<button class="${c.trim()}" onclick="goto(${i})">${i + 1}</button>`;
  }).join("");

  app.innerHTML = `
    <div class="spread">
      <div><b>${s.mode === "wrong" ? "錯題練習" : "全卷練習"}</b>
        <span class="muted small">　${s.name}</span></div>
      <button class="btn sm ghost" onclick="quitQuiz()">離開</button>
    </div>
    <div class="card tight">
      <div class="spread" style="margin-bottom:8px">
        <span class="muted small">第 ${s.idx + 1} / ${total} 題</span>
        <span class="muted small">已作答 ${answered} / ${total}</span>
      </div>
      <div class="pbar"><span style="width:${answered / total * 100}%"></span></div>
    </div>

    <div class="card">
      <div class="qhead">
        <span class="qno">${q.id}.</span>
        <span class="chip unit">${q.u}</span>
      </div>
      ${q.oi ? figuresHTML(q) : ""}
      <div class="stem">${q.s}</div>
      ${q.oi ? "" : figuresHTML(q)}
      <div class="opts">${opts}</div>
    </div>

    <div class="card tight">
      <label class="lbl">題號導覽（藍色＝已作答）</label>
      <div class="nav-grid">${nav}</div>
    </div>

    <div class="qbar">
      <div class="row">
        <button class="btn" onclick="prev()" ${s.idx === 0 ? "disabled" : ""}>← 上一題</button>
        ${s.idx < total - 1
          ? `<button class="btn primary grow" style="flex:1" onclick="next()">下一題 →</button>`
          : `<button class="btn accent grow" style="flex:1" onclick="submitQuiz()">✅ 交卷看成績</button>`}
      </div>
      ${s.idx === total - 1 ? "" : `<button class="btn ghost sm block" style="margin-top:8px" onclick="submitQuiz()">提早交卷</button>`}
    </div>
  `;
  window.scrollTo(0, 0);
}
window.pick = function (i) {
  session.answers[session.ids[session.idx]] = i;
  // 自動前往下一題（最後一題則停留）
  if (session.idx < session.ids.length - 1) { session.idx++; renderQuestion(); }
  else renderQuestion();
};
window.next = function () { if (session.idx < session.ids.length - 1) { session.idx++; renderQuestion(); } };
window.prev = function () { if (session.idx > 0) { session.idx--; renderQuestion(); } };
window.goto = function (i) { session.idx = i; renderQuestion(); };
window.quitQuiz = function () {
  if (confirm("離開後這次作答不會被記錄，確定離開？")) { const n = session.name; session = null; viewDashboard(n); }
};
window.submitQuiz = function () {
  const left = session.ids.length - Object.keys(session.answers).length;
  if (left > 0 && !confirm(`還有 ${left} 題沒作答（將以未作答計為錯）。確定交卷？`)) return;
  const s = session;
  let correct = 0; const wrongIds = [];
  s.ids.forEach(id => {
    const q = qById(id);
    if (s.answers[id] === q.a) correct++; else wrongIds.push(id);
  });
  const db = load();
  getProfile(s.name); // 確保 profile 存在
  const list = (db.profiles[s.name] || (db.profiles[s.name] = { created: Date.now(), attempts: [] })).attempts;
  const attempt = {
    n: list.length + 1,
    mode: s.mode,
    date: Date.now(),
    ids: s.ids.slice(),
    answers: Object.assign({}, s.answers),
    correct,
    total: s.ids.length,
    score: correct * QUIZ_META.perScore,
    wrongIds,
    durationSec: Math.max(1, Math.round((Date.now() - s.start) / 1000))
  };
  list.push(attempt);
  save(db);
  const name = s.name, newIndex = list.length - 1;
  session = null;
  viewResult(encodeURIComponent(name), newIndex);
};

/* ========================================================
   4) 成績 / 解析畫面
   ======================================================== */
function byUnit(att) {
  const m = {};
  att.ids.forEach(id => {
    const q = qById(id);
    if (!m[q.u]) m[q.u] = { correct: 0, total: 0, wrong: [] };
    m[q.u].total++;
    if (att.answers[id] === q.a) m[q.u].correct++; else m[q.u].wrong.push(id);
  });
  return m;
}

let reviewFilter = "all";
window.viewResult = function (enc, index) {
  const name = decodeURIComponent(enc);
  const prof = getProfile(name);
  const att = prof.attempts[index];
  if (!att) { viewDashboard(name); return; }
  reviewFilter = "all";
  renderResult(name, index);
};

function renderResult(name, index) {
  const prof = getProfile(name);
  const att = prof.attempts[index];
  const p = pct(att);
  const bu = byUnit(att);

  // 與上一次（同樣是全卷）的比較
  let cmp = "";
  const prevFull = prof.attempts.slice(0, index).reverse().find(a => a.mode === att.mode);
  if (prevFull) {
    const d = p - pct(prevFull);
    cmp = `<div class="kpi"><div class="b">
      <div class="n ${d >= 0 ? "" : ""}" style="color:${d > 0 ? "var(--good)" : d < 0 ? "var(--bad)" : "var(--soft)"}">
        ${d > 0 ? "▲ +" : d < 0 ? "▼ " : ""}${d === 0 ? "持平" : Math.abs(d) + "%"}</div>
      <div class="t">與上一次${att.mode === "wrong" ? "錯題練習" : "全卷"}相比</div></div></div>`;
  }

  const grade = p >= 90 ? "太強了！" : p >= 80 ? "很不錯！" : p >= 60 ? "再加把勁～" : "別灰心，從錯題開始補！";

  // 單元診斷表（正確率低的排前面）
  const rows = Object.entries(bu).sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))
    .map(([u, v]) => {
      const r = Math.round(v.correct / v.total * 100);
      const col = r >= 80 ? "var(--good)" : r >= 60 ? "var(--warn)" : "var(--bad)";
      return `<tr>
        <td>${u} ${r < 60 ? '<span class="chip bad small">弱點</span>' : ""}</td>
        <td class="r">${v.correct}/${v.total}</td>
        <td><div class="minibar"><span style="width:${r}%;background:${col}"></span></div></td>
        <td class="r" style="color:${col};font-weight:700">${r}%</td>
      </tr>`;
    }).join("");

  // 逐題檢討
  const showIds = reviewFilter === "wrong" ? att.wrongIds : att.ids;
  const review = showIds.length ? showIds.map(id => {
    const q = qById(id);
    const my = att.answers[id];
    const ok = my === q.a;
    const opts = q.o.map((txt, i) => {
      let cls = "opt";
      if (i === q.a) cls += " correct";
      else if (i === my) cls += " wrong";
      const mk = i === q.a ? "正解" : (i === my ? "你選的" : "");
      return `<div class="${cls}"><span class="k">${LETTERS[i]}</span>
        <span>${q.oi ? "選項 " + LETTERS[i] : txt}</span>${mk ? `<span class="mk">${mk}</span>` : ""}</div>`;
    }).join("");
    return `<div class="review-item ${ok ? "ok" : "ng"}">
      <div class="qhead">
        <span class="qno">${q.id}.</span>
        <span class="chip ${ok ? "good" : "bad"}">${ok ? "✓ 答對" : "✗ 答錯"}</span>
        <span class="chip unit">${q.u}</span>
        ${my === undefined ? '<span class="chip">未作答</span>' : ""}
      </div>
      <div class="stem">${q.s}</div>
      ${figuresHTML(q)}
      <div class="opts">${opts}</div>
      <div class="expl"><b>💡 詳解：</b>${q.e}</div>
    </div>`;
  }).join("") : `<p class="muted center">這次全部答對，沒有錯題 🎉</p>`;

  app.innerHTML = `
    <div class="spread">
      <div class="brand"><div class="logo">理</div>
        <div><h1>成績與解析</h1><div class="sub">${name}・第 ${att.n} 次・${att.mode === "wrong" ? "錯題練習" : "全卷"}</div></div></div>
      <button class="btn sm ghost" onclick="viewDashboard('${encodeURIComponent(name)}')">回首頁</button>
    </div>

    <div class="card center">
      <div class="muted small">得分</div>
      <div class="score-big">${att.score}<span style="font-size:1.2rem;color:var(--muted)"> / ${att.total * QUIZ_META.perScore}</span></div>
      <div style="margin:6px 0 2px">${grade}</div>
      <div class="kpi">
        <div class="b"><div class="n">${att.correct}/${att.total}</div><div class="t">答對題數</div></div>
        <div class="b"><div class="n">${p}%</div><div class="t">正確率</div></div>
        <div class="b"><div class="n">${att.wrongIds.length}</div><div class="t">錯題數</div></div>
        <div class="b"><div class="n" style="font-size:1.1rem">${fmtDur(att.durationSec)}</div><div class="t">作答用時</div></div>
      </div>
      ${cmp}
    </div>

    <div class="card">
      <h3>📊 單元診斷</h3>
      <table class="diag">
        <tr><th>單元</th><th class="r">答對</th><th>掌握度</th><th class="r">正確率</th></tr>
        ${rows}
      </table>
    </div>

    <div class="card">
      <div class="spread"><h3 style="margin:0">📝 逐題檢討</h3>
        <div class="row">
          <button class="btn sm ${reviewFilter === "all" ? "primary" : "ghost"}" onclick="setFilter('${encodeURIComponent(name)}',${index},'all')">全部</button>
          <button class="btn sm ${reviewFilter === "wrong" ? "primary" : "ghost"}" onclick="setFilter('${encodeURIComponent(name)}',${index},'wrong')">只看錯題（${att.wrongIds.length}）</button>
        </div>
      </div>
      ${review}
    </div>

    <div class="card">
      <h3>接下來</h3>
      <div class="row">
        <button class="btn primary" onclick="startQuiz('${encodeURIComponent(name)}','full')">🔁 再練一次全卷</button>
        ${att.wrongIds.length ? `<button class="btn accent" onclick="startWrongFrom('${encodeURIComponent(name)}',${index})">🎯 只練這次的錯題（${att.wrongIds.length}）</button>` : ""}
        <button class="btn ghost" onclick="viewDashboard('${encodeURIComponent(name)}')">回首頁</button>
      </div>
    </div>
    <div class="foot">第二次、第三次練習都會分別記錄，可在首頁比較進步幅度。</div>
  `;
  window.scrollTo(0, 0);
}
window.setFilter = function (enc, index, f) { reviewFilter = f; renderResult(decodeURIComponent(enc), index); };
window.startWrongFrom = function (enc, index) {
  const name = decodeURIComponent(enc);
  const att = getProfile(name).attempts[index];
  const ids = att.wrongIds.slice();
  if (!ids.length) { alert("沒有錯題！"); return; }
  session = { name, mode: "wrong", ids, idx: 0, answers: {}, start: Date.now() };
  renderQuestion();
};

/* ---------- 啟動 ---------- */
viewLogin();
