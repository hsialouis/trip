// 旅行共編手帳 — 設定檔
// 兩個都留空時，網站會以「示範模式」執行：資料只存在這台裝置的瀏覽器，也不會顯示地圖。
// 設定步驟請看 README.md。

export const CONFIG = {
  // Firebase 網頁應用程式設定（Firebase 主控台 → 專案設定 → 你的應用程式 → SDK 設定與配置）
  // 範例：{ apiKey: "...", authDomain: "xxx.firebaseapp.com", projectId: "xxx", appId: "..." }
  firebase: {
    apiKey: "AIzaSyAPmen21vrYMtd7T0bAoe4YxD3cvVHl6po",
    authDomain: "trip-book-9109f.firebaseapp.com",
    projectId: "trip-book-9109f",
    storageBucket: "trip-book-9109f.firebasestorage.app",
    messagingSenderId: "451252657752",
    appId: "1:451252657752:web:f9f07cb1b53d6850ecf42d"
  },

  // Google 地圖 API 金鑰（需啟用 Maps JavaScript API 與 Places API (New)）
  mapsKey: "AIzaSyB1v7o9jcZo4U5_ngxE6cx_TPHnqwszF_0",

  // reCAPTCHA v3 網站金鑰（Firebase App Check 用，保護 AI 匯入的 Gemini 額度不被盜用）
  recaptchaSiteKey: ""
};
