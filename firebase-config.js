/* ===========================================================
   雲端設定（Firebase）— 老師端集中收集全班成績用
   -----------------------------------------------------------
   還沒設定前，enabled 維持 false：學生網站照常運作（成績只存本機），
   老師後台會顯示「尚未設定雲端」。
   設定步驟見 FIREBASE_SETUP.md。完成後把下面填好、並將 enabled 改成 true。
   =========================================================== */
window.CLOUD = {
  enabled: false,                 // ← 設定完成後改成 true
  teacherEmail: "",               // ← 老師登入用的 Email（也要寫進 Firestore 安全規則）
  config: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  }
};
