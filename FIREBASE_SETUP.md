# 老師端雲端成績 — Firebase 設定步驟

完成這份設定後，學生每次交卷會自動把成績上傳雲端，老師打開 `teacher.html` 用 Email 登入即可看到全班成績。
**設定前學生網站照常運作**（成績暫存在各自瀏覽器），設定完成後才開始上傳。

整個流程約 10 分鐘，全部在 Firebase 控制台點一點。

---

## 步驟 1：建立 Firebase 專案
1. 到 https://console.firebase.google.com/ ，用你的 Google 帳號登入。
2. 「新增專案」，取個名字（例如 `phy-quiz`），一路下一步建立（可關閉 Google Analytics）。
   - 若你之前已有專案（如 SKILL 筆記裡那個），也可直接沿用，跳到步驟 2。

## 步驟 2：新增「網頁應用程式」並取得設定
1. 專案首頁中央點 **`</>`（Web）** 圖示新增應用程式，取個暱稱，註冊。
2. 會出現一段 `firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ... }`，**整段先留著**，稍後要貼到 `firebase-config.js`。

## 步驟 3：建立 Firestore 資料庫
1. 左側選單 **Build → Firestore Database → 建立資料庫**。
2. 模式選 **Production mode（正式版）**。
3. 位置選 **asia-east1（台灣較近）**，建立。

## 步驟 4：開啟登入方式（給老師用）
1. 左側 **Build → Authentication → 開始使用**。
2. **Sign-in method** 分頁 → 啟用 **電子郵件/密碼（Email/Password）**，儲存。
3. 切到 **Users** 分頁 → **新增使用者**：輸入老師的 Email 與一組密碼（這就是你登入後台的帳密）。
   - 學生端**不需要**任何帳號。

## 步驟 5：設定安全規則（重要！只有老師讀得到）
Firestore → **Rules** 分頁，整段貼上以下內容，把兩處 `teacher@example.com` 換成**你步驟 4 建立的老師 Email**，再「發布」：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /results/{id} {
      allow create: if isValid(request.resource.data);
      allow read:   if request.auth != null && request.auth.token.email == "teacher@example.com";
      allow update, delete: if false;
      function isValid(d) {
        return d.name is string && d.name.size() > 0 && d.name.size() <= 40
          && d.score is int && d.score >= 0 && d.score <= 200
          && d.correct is int && d.total is int && d.total > 0
          && d.ts == request.time;
      }
    }
  }
}
```

> 說明：學生可「新增」成績但不能讀取或竄改；只有老師 Email 登入後能讀全部。
> （`apiKey` 等設定公開在網頁是正常的，安全由上面的規則把關。）

## 步驟 6：把設定填進專案
打開 `firebase-config.js`，依步驟 2 的內容填好，並把 `enabled` 改成 `true`：

```js
window.CLOUD = {
  enabled: true,
  teacherEmail: "teacher@example.com",   // 與步驟 4 / 步驟 5 同一個 Email
  config: {
    apiKey: "貼上你的",
    authDomain: "你的專案.firebaseapp.com",
    projectId: "你的專案ID",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  }
};
```

## 步驟 7：上線
把改好的檔案推上 GitHub（`git add -A && git commit -m "啟用雲端成績" && git push`），
GitHub Pages 約 1 分鐘更新。之後：
- 學生：https://addielu-phy.github.io/physics-quiz/ （照常作答，交卷後會顯示「✓ 已上傳到老師端」）
- 老師：https://addielu-phy.github.io/physics-quiz/teacher.html （用老師 Email 登入看全班）

---

### 常見問題
- **老師後台顯示「讀取失敗 permission-denied」**：規則裡的 Email 與你登入的 Email 沒對上，或 `enabled` 沒設 true。
- **學生交卷顯示「離線，已暫存」**：當下沒網路，系統會在下次開啟網站時自動補傳。
- **想保護學生隱私**：建議讓學生用「座號＋姓名」或暱稱登錄，不要放完整真名。

> 把你的 `firebaseConfig` 和老師 Email 貼給我，我也可以直接幫你填好並推上線。
