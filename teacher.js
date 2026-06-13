/* ===========================================================
   老師後台 — 查看全班成績（讀取 Firestore results 集合）
   只有以「老師 Email」登入者能讀取（由 Firestore 安全規則把關）。
   =========================================================== */
"use strict";
const app = document.getElementById("app");
const LETTERS = ["A", "B", "C", "D"];

/* 題目索引：題號 → 題目資料 */
const QMAP = {};
QUESTIONS.forEach(q => QMAP[q.id] = q);
const UNITS = [...new Set(QUESTIONS.map(q => q.u))];

function cloudOn() { return !!(window.CLOUD && CLOUD.enabled && typeof firebase !== "undefined" && CLOUD.config && CLOUD.config.projectId); }
function fmtDate(d) {
  if (!d) return "—";
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function tsToDate(r) { return r.ts && r.ts.toDate ? r.ts.toDate() : (r.clientTime ? new Date(r.clientTime) : null); }
function fmtDur(s) { const m = Math.floor(s / 60); return m ? `${m}分${s % 60}秒` : `${s}秒`; }
function modeLabel(m) { return m === "practice" ? "隨手練習" : m === "wrong" ? "錯題練習" : "全卷測驗"; }

/* ---------- 啟動 ---------- */
let DB = null;
if (!cloudOn()) {
  app.innerHTML = `
    <div class="brand"><div class="logo">師</div><div><h1>老師後台</h1><div class="sub">全班成績總覽</div></div></div>
    <div class="card">
      <h3>⚠️ 尚未設定雲端</h3>
      <p class="muted">這個後台需要 Firebase 才能集中收集全班成績。請依 <code>FIREBASE_SETUP.md</code> 完成設定，並把 <code>firebase-config.js</code> 的 <code>enabled</code> 改成 <code>true</code>。</p>
      <p class="muted small">設定完成前，學生端仍可正常作答（成績暫存在各自的瀏覽器）。</p>
    </div>`;
} else {
  firebase.initializeApp(CLOUD.config);
  DB = firebase.firestore();
  firebase.auth().onAuthStateChanged(user => {
    if (user && (!CLOUD.teacherEmail || user.email === CLOUD.teacherEmail)) loadData(user);
    else if (user) { renderLogin(`此帳號（${user.email}）不是老師帳號。`); firebase.auth().signOut(); }
    else renderLogin("");
  });
}

/* ---------- 登入 ---------- */
function renderLogin(msg) {
  app.innerHTML = `
    <div class="brand"><div class="logo">師</div><div><h1>老師後台登入</h1><div class="sub">全班成績總覽</div></div></div>
    <div class="card">
      ${msg ? `<p class="chip bad">${msg}</p>` : ""}
      <label class="lbl">老師 Email</label>
      <input type="text" id="em" placeholder="teacher@example.com" autocomplete="username">
      <div style="height:10px"></div>
      <label class="lbl">密碼</label>
      <input type="text" id="pw" placeholder="••••••••" style="-webkit-text-security:disc" autocomplete="current-password"
        onkeydown="if(event.key==='Enter')doLogin()">
      <div style="height:14px"></div>
      <button class="btn primary block" onclick="doLogin()">登入</button>
      <p class="muted small" style="margin-top:10px">帳號由你在 Firebase 控制台建立（Authentication → Users）。學生端不需要登入。</p>
    </div>`;
}
window.doLogin = function () {
  const em = document.getElementById("em").value.trim();
  const pw = document.getElementById("pw").value;
  if (!em || !pw) { alert("請輸入 Email 與密碼"); return; }
  firebase.auth().signInWithEmailAndPassword(em, pw)
    .catch(e => renderLogin("登入失敗：" + (e.code || e.message)));
};
window.doLogout = function () { firebase.auth().signOut(); };

/* ---------- 讀取資料 ---------- */
let ROWS = [];
function loadData(user) {
  app.innerHTML = `<div class="card center"><p>讀取全班成績中…</p></div>`;
  DB.collection("results").orderBy("ts", "desc").get()
    .then(snap => { ROWS = snap.docs.map(d => d.data()); renderDash(user); })
    .catch(e => {
      app.innerHTML = `<div class="card"><h3>讀取失敗</h3>
        <p class="chip bad">${e.code || e.message}</p>
        <p class="muted small">可能是安全規則未開放此帳號讀取，或索引尚未建立。請確認 Firestore 規則中的老師 Email 與登入帳號一致。</p>
        <button class="btn" onclick="location.reload()">重試</button>
        <button class="btn ghost" onclick="doLogout()">登出</button></div>`;
    });
}

/* ---------- 統計 ---------- */
function computeStats(rows) {
  const full = rows.filter(r => r.mode === "full");
  const practice = rows.filter(r => r.mode === "practice");
  // 正式測驗與隨手練習都是「先作答、才看答案」，所選即第一次作答，能反映真實程度 → 一起納入錯題分析
  const assessable = rows.filter(r => r.mode === "full" || r.mode === "practice");
  const students = {};
  rows.forEach(r => {
    const k = r.name || "(未命名)";
    if (!students[k]) students[k] = { name: k, all: [], full: [], practice: [] };
    students[k].all.push(r);
    if (r.mode === "full") students[k].full.push(r);
    if (r.mode === "practice") students[k].practice.push(r);
  });
  Object.values(students).forEach(s => {
    s.bestFull = s.full.length ? Math.max(...s.full.map(a => a.score)) : null;
    s.bestPractice = s.practice.length ? Math.max(...s.practice.map(a => a.score)) : null;
    s.latest = s.all.slice().sort((a, b) => (tsToDate(b) || 0) - (tsToDate(a) || 0))[0];
    s.latestFull = s.full.slice().sort((a, b) => (tsToDate(b) || 0) - (tsToDate(a) || 0))[0];
  });
  // 每題錯誤率：依「正式測驗＋隨手練習」的第一次作答；用 ids 判斷該題是否被作答
  const qAtt = {}, qWrong = {};
  QUESTIONS.forEach(q => { qAtt[q.id] = 0; qWrong[q.id] = 0; });
  assessable.forEach(r => {
    (r.ids || []).forEach(id => { if (qAtt[id] !== undefined) qAtt[id]++; });
    (r.wrongIds || []).forEach(id => { if (qWrong[id] !== undefined) qWrong[id]++; });
  });
  const qStats = QUESTIONS.map(q => ({
    id: q.id, u: q.u, ans: LETTERS[q.a],
    wrong: qWrong[q.id], n: qAtt[q.id], rate: qAtt[q.id] ? qWrong[q.id] / qAtt[q.id] : 0
  }));
  // 單元錯誤率
  const uStats = UNITS.map(u => {
    const qs = QUESTIONS.filter(q => q.u === u);
    const wrong = qs.reduce((s, q) => s + qWrong[q.id], 0);
    const totalAns = qs.reduce((s, q) => s + qAtt[q.id], 0);
    return { u, qn: qs.length, wrong, totalAns, rate: totalAns ? wrong / totalAns : 0 };
  });
  const scores = full.map(a => a.score);
  return {
    students, full, fullN: full.length, practiceN: practice.length, assessableN: assessable.length,
    avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    max: scores.length ? Math.max(...scores) : null,
    min: scores.length ? Math.min(...scores) : null,
    qStats, uStats
  };
}
function rateColor(r) { return r >= 0.4 ? "var(--bad)" : r >= 0.2 ? "var(--warn)" : "var(--good)"; }

/* ---------- 主畫面 ---------- */
let studentSort = "latest";
function renderDash(user) {
  const st = computeStats(ROWS);
  const nStudents = Object.keys(st.students).length;

  // 最常錯的題目（取前 12，依錯誤率）
  const topWrong = st.qStats.filter(q => q.n > 0).sort((a, b) => b.rate - a.rate).slice(0, 12);
  const wrongRows = topWrong.map(q => `
    <tr>
      <td><b>${q.id}</b></td>
      <td><span class="chip unit">${q.u}</span></td>
      <td>${q.ans}</td>
      <td class="r">${q.wrong}/${q.n}</td>
      <td><div class="minibar"><span style="width:${Math.round(q.rate * 100)}%;background:${rateColor(q.rate)}"></span></div></td>
      <td class="r" style="color:${rateColor(q.rate)};font-weight:700">${Math.round(q.rate * 100)}%</td>
    </tr>`).join("") || `<tr><td colspan="6" class="muted">尚無作答資料</td></tr>`;

  // 單元弱點
  const uRows = st.uStats.slice().sort((a, b) => b.rate - a.rate).map(u => `
    <tr><td>${u.u}</td><td class="r">${u.wrong}/${u.totalAns || 0}</td>
      <td><div class="minibar"><span style="width:${Math.round(u.rate * 100)}%;background:${rateColor(u.rate)}"></span></div></td>
      <td class="r" style="color:${rateColor(u.rate)};font-weight:700">${Math.round(u.rate * 100)}%</td></tr>`).join("");

  // 學生表
  let studs = Object.values(st.students);
  if (studentSort === "name") studs.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  else if (studentSort === "best") studs.sort((a, b) => (b.bestFull ?? -1) - (a.bestFull ?? -1));
  else if (studentSort === "low") studs.sort((a, b) => (a.bestFull ?? 999) - (b.bestFull ?? 999));
  else studs.sort((a, b) => (tsToDate(b.latest) || 0) - (tsToDate(a.latest) || 0));

  const studRows = studs.map((s, i) => {
    const fullCol = s.bestFull == null ? "var(--muted)" : s.bestFull >= 60 ? "var(--good)" : "var(--bad)";
    const fullCell = s.full.length
      ? `<span style="color:${fullCol};font-weight:700">最佳 ${s.bestFull}</span> <span class="muted small">／${s.full.length} 次</span>`
      : `<span class="muted">—</span>`;
    const pracCell = s.practice.length
      ? `<span style="font-weight:700">最佳 ${s.bestPractice}</span> <span class="muted small">／${s.practice.length} 次</span>`
      : `<span class="muted">—</span>`;
    const lastChip = s.latest ? `<span class="chip">${modeLabel(s.latest.mode)}</span> ` : "";
    return `<tr style="cursor:pointer" onclick="toggleStu(${i})">
        <td>▸ ${s.name}</td>
        <td class="r">${fullCell}</td>
        <td class="r">${pracCell}</td>
        <td class="r small muted">${lastChip}${fmtDate(tsToDate(s.latest))}</td>
      </tr>
      <tr id="stu${i}" style="display:none"><td colspan="4">${stuDetail(s)}</td></tr>`;
  }).join("") || `<tr><td colspan="4" class="muted">還沒有學生上傳成績</td></tr>`;

  app.innerHTML = `
    <div class="spread">
      <div class="brand"><div class="logo">師</div><div><h1>全班成績總覽</h1>
        <div class="sub">${QUIZ_META.school}・${QUIZ_META.grade}</div></div></div>
      <div class="row">
        <button class="btn sm" onclick="location.reload()">🔄 重新整理</button>
        <button class="btn sm ghost" onclick="doLogout()">登出</button>
      </div>
    </div>
    <p class="muted small">登入：${user.email}</p>

    <div class="card">
      <h3>📊 班級概況</h3>
      <div class="kpi">
        <div class="b"><div class="n">${nStudents}</div><div class="t">學生人數</div></div>
        <div class="b"><div class="n">${ROWS.length}</div><div class="t">總作答次數</div></div>
        <div class="b"><div class="n">${st.fullN}</div><div class="t">全卷完成數</div></div>
        <div class="b"><div class="n">${st.practiceN}</div><div class="t">隨手練習數</div></div>
        <div class="b"><div class="n">${st.avg ?? "—"}</div><div class="t">全卷平均分</div></div>
        <div class="b"><div class="n">${st.max ?? "—"}</div><div class="t">最高分</div></div>
        <div class="b"><div class="n">${st.min ?? "—"}</div><div class="t">最低分</div></div>
      </div>
      <div style="margin-top:12px"><button class="btn sm accent" onclick="exportCSV()">⬇️ 匯出 CSV（Excel）</button></div>
    </div>

    <div class="card">
      <h3>❌ 全班最常答錯的題目</h3>
      <table class="diag">
        <tr><th>題</th><th>單元</th><th>正解</th><th class="r">答錯</th><th>錯誤率</th><th class="r">%</th></tr>
        ${wrongRows}
      </table>
      <p class="muted small" style="margin-top:8px">依「正式測驗＋隨手練習」的第一次作答統計，可作為講解優先順序。</p>
    </div>

    <div class="card">
      <h3>📚 全班單元弱點</h3>
      <table class="diag">
        <tr><th>單元</th><th class="r">答錯/作答</th><th>錯誤率</th><th class="r">%</th></tr>
        ${uRows}
      </table>
    </div>

    <div class="card">
      <div class="spread"><h3 style="margin:0">👩‍🎓 學生成績（點列可展開）</h3>
        <select id="sortSel" class="sortsel" onchange="setSort(this.value)">
          <option value="latest">最近作答</option>
          <option value="best">最佳分（高→低）</option>
          <option value="low">最佳分（低→高）</option>
          <option value="name">姓名</option>
        </select>
      </div>
      <table class="diag">
        <tr><th>學生</th><th class="r">全卷測驗</th><th class="r">隨手練習</th><th class="r">最近作答</th></tr>
        ${studRows}
      </table>
    </div>
    <div class="foot">資料來源：Firestore「results」集合。學生每次交卷自動上傳。</div>
  `;
  document.getElementById("sortSel") && (document.getElementById("sortSel").value = studentSort);
}

function stuDetail(s) {
  const list = s.all.slice().sort((a, b) => (tsToDate(b) || 0) - (tsToDate(a) || 0)).map(a => {
    const wrongTxt = (a.wrongIds && a.wrongIds.length) ? a.wrongIds.join("、") : "（全對）";
    return `<div class="att">
      <div class="badge">${a.score}</div>
      <div class="grow">
        <span class="chip">${modeLabel(a.mode)}</span>
        答對 ${a.correct}/${a.total}・用時 ${fmtDur(a.durationSec || 0)}
        <div class="muted small">${fmtDate(tsToDate(a))}</div>
        <div class="small" style="margin-top:4px">錯題：${wrongTxt}</div>
      </div>
    </div>`;
  }).join("");
  return `<div style="padding:6px 2px">${list}</div>`;
}
window.toggleStu = function (i) {
  const el = document.getElementById("stu" + i);
  if (el) el.style.display = el.style.display === "none" ? "table-row" : "none";
};
window.setSort = function (v) { studentSort = v; renderDash(firebase.auth().currentUser); };

/* ---------- CSV 匯出 ---------- */
window.exportCSV = function () {
  const head = ["姓名", "第幾次", "模式", "分數", "答對", "總題", "錯題數", "用時(秒)", "作答時間", "錯題題號"];
  const lines = [head.join(",")];
  ROWS.slice().sort((a, b) => (tsToDate(a) || 0) - (tsToDate(b) || 0)).forEach(r => {
    const row = [
      `"${(r.name || "").replace(/"/g, '""')}"`,
      r.attemptNo || "", modeLabel(r.mode),
      r.score, r.correct, r.total, (r.wrongIds || []).length,
      r.durationSec || "", `"${fmtDate(tsToDate(r))}"`,
      `"${(r.wrongIds || []).join(" ")}"`
    ];
    lines.push(row.join(","));
  });
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `全班成績_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};
