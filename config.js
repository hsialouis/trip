// 旅行共編手帳 — 設定檔
// 兩個都留空時，網站會以「示範模式」執行：資料只存在這台裝置的瀏覽器，也不會顯示地圖。
// 設定步驟請看 README.md。

export const CONFIG = {
  // Firebase 網頁應用程式設定（Firebase 主控台 → 專案設定 → 你的應用程式 → SDK 設定與配置）
  // 範例：{ apiKey: "...", authDomain: "xxx.firebaseapp.com", projectId: "xxx", appId: "..." }
  firebase: null,

  // Google 地圖 API 金鑰（需啟用 Maps JavaScript API 與 Places API (New)）
  mapsKey: ""
};
