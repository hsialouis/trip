# 旅行共編手帳

大家一起排行程、投票選餐廳、記帳分帳的旅行網站。同行的人不用註冊帳號，只要有**分享網址**和**旅行密碼**就能一起編輯。

- 網址：https://hsialouis.github.io/trip/
- 沒有完成下面的設定前，網站會以「示範模式」執行：資料只存在自己的瀏覽器，也不會顯示地圖。

## 設定總覽

| 步驟 | 要做什麼 | 費用 |
|---|---|---|
| 1 | 開啟 GitHub Pages | 免費 |
| 2 | 建立 Firebase（存放共用資料） | 免費方案，不用綁卡 |
| 3 | 申請 Google 地圖金鑰 | 要綁信用卡，一般用量在每月免費額度內 |
| 4 | 把設定填進 `config.js` | — |

---

## 1. 開啟 GitHub Pages

1. 打開這個 repo → **Settings** → 左側 **Pages**。
2. **Source** 選「Deploy from a branch」，Branch 選 `main`、資料夾選 `/ (root)` → **Save**。
3. 等 1～2 分鐘，網站就會出現在 https://hsialouis.github.io/trip/

## 2. 建立 Firebase

Firebase 用免費的 Spark 方案就好，不需要綁信用卡。用量超過免費額度只會暫停服務，不會扣款。

1. 到 https://console.firebase.google.com → **建立專案**，名稱例如 `trip-book`。Google Analytics 可以關掉。
2. 左側 **建構 → Firestore Database → 建立資料庫**
   - 位置選 `asia-east1`（台灣）
   - 選「以正式版模式啟動」
3. 進到 Firestore 的 **規則** 分頁，把整份內容換成本 repo 的 [`firestore.rules`](firestore.rules) → **發布**。
4. 左側 **建構 → Authentication → 開始使用 → 登入方式**，把「**匿名**」設為啟用。
5. **Authentication → 設定 → 授權網域**，新增 `hsialouis.github.io`。
6. 左上齒輪 **專案設定 → 一般**，往下到「你的應用程式」，按網頁圖示 `</>` 註冊一個應用程式（名稱隨意，不用勾 Hosting）。
7. 複製畫面上 `firebaseConfig = { ... }` 大括號裡的內容，第 4 步會用到。

## 3. 申請 Google 地圖金鑰

建議**開一個獨立的 Google Cloud 專案**給地圖用，不要和 Firebase 共用。這樣 Firebase 可以維持免費方案，不會因為綁卡而有被收費的風險。

1. 到 https://console.cloud.google.com → 上方專案選單 → **新增專案**，名稱例如 `trip-maps`。
2. 左側 **帳單** → 連結帳單帳戶（綁信用卡）。
3. **API 和服務 → 程式庫**，搜尋並啟用這兩個：
   - **Maps JavaScript API**
   - **Places API (New)**
4. **API 和服務 → 憑證 → 建立憑證 → API 金鑰**，建立後按「編輯 API 金鑰」：
   - **應用程式限制**：選「網站」，新增 `https://hsialouis.github.io/*`
   - **API 限制**：選「限制金鑰」，只勾 Maps JavaScript API 和 Places API (New)
   - 儲存，複製金鑰
5. **設定每日上限**（確保不會產生費用）：**API 和服務 → 已啟用的 API**，分別點進兩個 API → **配額與系統限制**，把「每日」相關的上限調低，例如地圖載入每天 300 次、地點搜尋每天 500 次。
6. **帳單 → 預算與快訊 → 建立預算**，金額設 US$1，有任何費用就會寄信通知你。

## 4. 填入設定

打開 `config.js`，把第 2、3 步拿到的內容填進去：

```js
export const CONFIG = {
  firebase: {
    apiKey: "AIza...",
    authDomain: "trip-book-xxxx.firebaseapp.com",
    projectId: "trip-book-xxxx",
    storageBucket: "trip-book-xxxx.firebasestorage.app",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef"
  },
  mapsKey: "AIza..."
};
```

存檔後約 1 分鐘，網站就會切換成多人共用模式。

> 這兩組資料會出現在公開網頁的原始碼裡，這是正常的。Firebase 靠「規則」保護資料，地圖金鑰則靠第 3 步設定的網址限制和每日上限保護。

---

## 使用方式

1. 打開網站 →「建立新旅行」→ 填目的地、日期、成員、**旅行密碼**。
2. 建立後會跳出分享網址，把**網址**和**密碼**分開傳給同行的人。
3. 每個人第一次打開時輸入密碼，之後這台裝置就會記住。
4. 進入後在上方「我是」選自己的名字，投票和分帳才會算到正確的人。

### 安全性說明

- 每趟旅行的資料位置是由「旅行代碼＋密碼」算出來的，不知道密碼就找不到資料。資料庫也禁止列出所有旅行。
- 這可以擋掉誤打開或亂猜的人，但不算嚴格的資安保護。請不要放護照號碼、信用卡號這類敏感資料。
- 旅行密碼建立後無法更改。如果需要換密碼，請開一趟新旅行。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `index.html`、`style.css` | 頁面與樣式 |
| `app.js` | 畫面與操作邏輯 |
| `store.js` | 資料存取（Firebase，或示範模式的本機儲存） |
| `map.js` | Google 地圖與地點搜尋 |
| `demo.js` | 示範模式的京都範例資料 |
| `config.js` | Firebase 與地圖金鑰設定 |
| `firestore.rules` | Firestore 安全規則，要貼到 Firebase 主控台 |
