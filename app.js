import { createStore, COLS } from "./store.js?v=202611161733";
import { TripMap, mapsEnabled, newSession, suggest, resolvePlace } from "./map.js?v=202611161733";
import { DEMO } from "./demo.js?v=202611161733";
import { aiEnabled, generateJSON, aiErrorMessage } from "./ai.js?v=202611161733";

const TABS = [["plan", "行程"], ["food", "候選清單"], ["money", "分帳"], ["prep", "行前清單"]];
const KINDS = [["play", "景點", "var(--accent)", "去過了"], ["eat", "美食", "var(--warn)", "吃過了"], ["buy", "購物", "var(--buy)", "買到了"], ["stay", "住宿", "var(--good)", "已訂"]];
const kindOf = k => KINDS.find(x => x[0] === k) || KINDS[1];
const MODES = ["步行", "地鐵／電車", "公車", "計程車", "開車", "高鐵／火車", "飛機", "船", "其他"];
const TASKCATS = ["預訂", "證件", "打包", "其他"];
const EXPCATS = ["交通", "住宿", "餐飲", "門票", "購物", "其他"];
const ZERO = ["JPY", "KRW", "TWD", "VND", "IDR", "HUF", "CLP", "ISK"];
const WD = "日一二三四五六";
const THEMES = [
  ["", "車票（預設）", ["#edf1f4", "#132030", "#d4442a"]],
  ["onsen", "溫泉", ["#f4eee7", "#2b1d14", "#b5651d"]],
  ["sea", "海島", ["#e8f2f5", "#0f2a36", "#0e86a8"]],
  ["forest", "森林", ["#ecf1ea", "#16261a", "#2f7d4a"]],
  ["sakura", "櫻花", ["#fbf0f3", "#3a1e28", "#d14d7a"]],
  ["maple", "楓紅", ["#f6eee8", "#2d1810", "#c8501a"]],
  ["snow", "雪國", ["#eef3f9", "#18243a", "#3d6fd6"]],
  ["night", "夜景", ["#12122a", "#ecebff", "#ff5fa2"]]
];
let curTheme = null;
function applyTheme(name) {
  name = THEMES.some(t => t[0] === name) ? name : "";
  if (name === curTheme) return;
  curTheme = name;
  if (name) document.documentElement.setAttribute("data-trip-theme", name);
  else document.documentElement.removeAttribute("data-trip-theme");
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#edf1f4");
  if (tmap) tmap.sig = "";
}

const S = {
  store: null, fatal: "", trip: null, key: null, stops: [], wishes: [], expenses: [], tasks: [],
  day: null, wishKind: "play", tab: "plan", screen: "loading", joinCode: "", mapErr: ""
};
let subs = [];
let sheetState = null;
let tmap = null;

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
function lsGet(k) { try { return localStorage.getItem("tripbook:" + k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem("tripbook:" + k, v); } catch (e) {} }
function joined() { try { return JSON.parse(lsGet("joined") || "[]"); } catch (e) { return []; } }
function setJoined(list) { lsSet("joined", JSON.stringify(list)); }
function remember(code, key, name) {
  const l = joined().filter(x => x.code !== code);
  l.unshift({ code, key, name }); setJoined(l);
}
function forget(code) { setJoined(joined().filter(x => x.code !== code)); }
function parseD(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function md(s) { const d = parseD(s); return d ? (d.getMonth() + 1) + "/" + d.getDate() + "（" + WD[d.getDay()] + "）" : "未定日期"; }
const todayISO = () => iso(new Date());
function fmtMoney(n, cur) {
  cur = (cur || "TWD").toUpperCase();
  if (cur === "TWD") return (n < 0 ? "-" : "") + "NT$" + Math.abs(n).toLocaleString("zh-TW", { maximumFractionDigits: 0 });
  const d = ZERO.includes(cur) ? 0 : 2;
  try { return new Intl.NumberFormat("zh-TW", { style: "currency", currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(n); }
  catch (e) { return cur + " " + Number(n).toFixed(d); }
}
function splitNames(s) { return String(s || "").split(/[,，、;；\n]+/).map(x => x.trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i); }
const hasPos = x => typeof x.lat === "number" && typeof x.lng === "number";
const me = () => { const t = S.trip; if (!t) return ""; const v = lsGet("me:" + t.code) || ""; return (t.members || []).includes(v) ? v : ""; };
async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
const tripKey = (code, pw) => sha("tripbook|" + code.trim().toLowerCase() + "|" + pw);
function newCode() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789"; let s = "";
  const r = crypto.getRandomValues(new Uint8Array(6)); r.forEach(x => s += a[x % a.length]); return s;
}
function shareURL(code) { const u = new URL(location.href); u.search = "?t=" + code; u.hash = ""; return u.toString(); }

/* map links */
const gPlace = x => hasPos(x)
  ? "https://www.google.com/maps/search/?api=1&query=" + x.lat + "," + x.lng + (x.placeId ? "&query_place_id=" + enc(x.placeId) : "")
  : "https://www.google.com/maps/search/?api=1&query=" + enc(x.place || x.name || x.title || "");
const aPlace = x => "https://maps.apple.com/?q=" + enc(x.place || x.name || x.title || "") + (hasPos(x) ? "&ll=" + x.lat + "," + x.lng : "");
const locOf = x => hasPos(x) ? x.lat + "," + x.lng : (x.place || x.title || "");
const GMODE = { "步行": "walking", "地鐵／電車": "transit", "公車": "transit", "高鐵／火車": "transit", "船": "transit", "計程車": "driving", "開車": "driving" };
const AMODE = { "步行": "w", "地鐵／電車": "r", "公車": "r", "高鐵／火車": "r", "船": "r", "計程車": "d", "開車": "d" };
function gDir(a, b, mode) { return "https://www.google.com/maps/dir/?api=1&origin=" + enc(locOf(a)) + "&destination=" + enc(locOf(b)) + (GMODE[mode] ? "&travelmode=" + GMODE[mode] : ""); }
function aDir(a, b, mode) { return "https://maps.apple.com/?saddr=" + enc(locOf(a)) + "&daddr=" + enc(locOf(b)) + (AMODE[mode] ? "&dirflg=" + AMODE[mode] : ""); }
const ext = (href, label) => '<a class="maplink" href="' + esc(href) + '" target="_blank" rel="noopener">' + label + "</a>";

function toast(msg) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3800); }

async function write(fn) {
  try { await fn(); return true; }
  catch (e) {
    console.error(e);
    const c = e && e.code || "";
    if (c.includes("permission-denied")) toast("沒有寫入權限：請確認 Firebase 規則與匿名登入已設定。");
    else if (c.includes("unavailable")) toast("目前離線，恢復連線後會自動同步。");
    else toast("儲存失敗，請稍後再試。");
    return false;
  }
}

/* ---------- boot ---------- */
async function boot() {
  S.tab = (location.hash || "").slice(1); if (!TABS.some(t => t[0] === S.tab)) S.tab = "plan";
  render();
  try { S.store = await createStore(); }
  catch (e) {
    console.error(e);
    S.fatal = (e && e.code || "").includes("operation-not-allowed")
      ? "Firebase 的「匿名登入」還沒開啟。請到 Firebase 主控台 → Authentication → 登入方式，啟用「匿名」。"
      : "連不上資料庫。請檢查網路，或確認 config.js 的 Firebase 設定正確。";
    S.screen = "fatal"; render(); return;
  }
  if (S.store.mode === "local") await seedDemo();
  const code = new URLSearchParams(location.search).get("t");
  const j = joined();
  if (code) {
    const hit = j.find(x => x.code === code.toLowerCase());
    if (hit) return openTrip(hit.code, hit.key);
    S.joinCode = code.toLowerCase(); S.screen = "home"; render(); return;
  }
  const last = lsGet("last"); const hit = j.find(x => x.code === last) || j[0];
  if (hit) return openTrip(hit.code, hit.key);
  S.screen = "home"; render();
}
async function seedDemo() {
  const key = await tripKey(DEMO.trip.code, DEMO.password);
  if (!(await S.store.getTrip(key)) && !lsGet("demo-seeded")) {
    await S.store.seed(key, DEMO.trip, DEMO.cols);
    lsSet("demo-seeded", "1");
    remember(DEMO.trip.code, key, DEMO.trip.name);
  }
}

function openTrip(code, key) {
  subs.forEach(u => { try { u(); } catch (e) {} }); subs = [];
  Object.assign(S, { key, trip: null, stops: [], wishes: [], expenses: [], tasks: [], day: null, screen: "loading" });
  lsSet("last", code);
  const u = new URL(location.href); if (u.searchParams.get("t") !== code) { u.search = "?t=" + code; history.replaceState(null, "", u); }
  render();
  const err = e => { console.error(e); toast("有些資料讀取失敗，請重新整理。"); };
  subs.push(S.store.watchTrip(key, t => {
    if (S.key !== key) return;
    if (!t) { forget(code); S.trip = null; S.screen = "home"; toast("這趟旅行已不存在。"); render(); return; }
    S.trip = t; S.screen = "trip"; remember(code, key, t.name || t.destination); render();
  }, err));
  COLS.forEach(n => subs.push(S.store.watchCol(key, n, list => { if (S.key !== key) return; S[n] = list; render(); }, err)));
}
function goHome() {
  subs.forEach(u => { try { u(); } catch (e) {} }); subs = [];
  Object.assign(S, { key: null, trip: null, screen: "home" });
  const u = new URL(location.href); u.search = ""; history.replaceState(null, "", u);
  render();
}

/* ---------- derived ---------- */
function tripDays(t) {
  const out = []; const s = parseD(t.start), e = parseD(t.end || t.start);
  if (s && e) { const d = new Date(s); let n = 0; while (d <= e && n < 60) { out.push(iso(d)); d.setDate(d.getDate() + 1); n++; } }
  S.stops.forEach(x => { if (x.date && !out.includes(x.date)) out.push(x.date); });
  out.sort();
  if (S.stops.some(x => !x.date)) out.push("");
  return out;
}
function dayStops() {
  return S.stops.filter(x => (x.date || "") === S.day)
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99") || (a.createdAt || 0) - (b.createdAt || 0));
}
function wishList() {
  return S.wishes.filter(w => kindOf(w.kind)[0] === S.wishKind)
    .sort((a, b) => (!!a.done - !!b.done) || ((b.votes || []).length - (a.votes || []).length) || (a.createdAt || 0) - (b.createdAt || 0));
}
function settle(t) {
  const cur = (t.currency || "TWD").toUpperCase(); const eps = ZERO.includes(cur) ? 0.5 : 0.005;
  const bal = {}; (t.members || []).forEach(m => bal[m] = { paid: 0, share: 0 });
  let total = 0;
  S.expenses.forEach(e => {
    const amt = Number(e.amount) || 0; total += amt;
    if (e.payer) { bal[e.payer] = bal[e.payer] || { paid: 0, share: 0 }; bal[e.payer].paid += amt; }
    const among = Array.isArray(e.among) && e.among.length ? e.among : (t.members || []);
    if (!among.length) return; const per = amt / among.length;
    among.forEach(m => { bal[m] = bal[m] || { paid: 0, share: 0 }; bal[m].share += per; });
  });
  const people = Object.keys(bal).map(n => ({ n, paid: bal[n].paid, share: bal[n].share, net: bal[n].paid - bal[n].share }));
  const cr = people.filter(p => p.net > eps).map(p => ({ n: p.n, v: p.net })).sort((a, b) => b.v - a.v);
  const de = people.filter(p => p.net < -eps).map(p => ({ n: p.n, v: -p.net })).sort((a, b) => b.v - a.v);
  const tx = []; let i = 0, j = 0;
  while (i < de.length && j < cr.length) {
    const v = Math.min(de[i].v, cr[j].v); if (v > eps) tx.push({ from: de[i].n, to: cr[j].n, v });
    de[i].v -= v; cr[j].v -= v; if (de[i].v <= eps) i++; if (cr[j].v <= eps) j++;
  }
  return { total, people, tx, cur };
}

/* ---------- render ---------- */
function render() {
  const top = $("#top"), view = $("#view"), mapcard = $("#mapcard");
  applyTheme(S.screen === "trip" && S.trip ? (S.trip.theme || "") : "");
  let banner = "";
  if (S.store && S.store.mode === "local") banner = '<div class="banner">示範模式：資料只存在這台裝置，別人看不到。完成 README 的設定後就能多人共用。</div>';
  if (S.screen === "fatal") { top.innerHTML = '<div class="card empty" style="margin-top:40px"><p><b>無法開啟</b></p><p>' + esc(S.fatal) + "</p></div>"; view.innerHTML = ""; mapcard.hidden = true; return; }
  if (S.screen === "loading") { top.innerHTML = '<div class="loading">正在打開旅行手帳…</div>'; view.innerHTML = ""; mapcard.hidden = true; return; }
  if (S.screen === "home") { top.innerHTML = banner + viewHome(); view.innerHTML = ""; mapcard.hidden = true; return; }
  const t = S.trip;
  top.innerHTML = banner + topbar() + stub(t) +
    '<nav class="tabs" aria-label="分頁">' + TABS.map(([k, l]) => '<a href="#' + k + '"' + (S.tab === k ? ' aria-current="page"' : "") + ">" + l + "</a>").join("") + "</nav>";
  if (S.tab === "plan") { const days = tripDays(t); if (S.day === null || !days.includes(S.day)) { const td = todayISO(); S.day = days.includes(td) ? td : (days[0] !== undefined ? days[0] : ""); } }
  const showMap = S.tab === "plan" || S.tab === "food";
  mapcard.hidden = !showMap;
  view.innerHTML = ({ plan: viewPlan, food: viewFood, money: viewMoney, prep: viewPrep })[S.tab](t);
  if (showMap) updateMap();
  const dsel = view.querySelector('.day[aria-pressed="true"]');
  if (dsel && !render.scrolled) { render.scrolled = true; dsel.scrollIntoView({ block: "nearest", inline: "center" }); }
}

function viewHome() {
  const j = joined();
  let h = '<div class="hero"><h1>旅行<br>共編手帳</h1><p>大家一起排行程、投票選餐廳、記帳分帳。不用註冊帳號，只要網址和旅行密碼。</p></div>';
  if (j.length) {
    h += '<div class="section-head"><h2>我的旅行</h2></div><div class="tripcards">' + j.map(x =>
      '<button class="card tripcard" data-act="open" data-id="' + esc(x.code) + '"><span><span class="n">' + esc(x.name || x.code) + '</span><br><span class="s">代碼 ' + esc(x.code) + '</span></span><span class="maplink">打開 →</span></button>').join("") + "</div>";
  }
  h += '<div class="section-head"><h2>加入旅行</h2></div><form class="card formcard" id="joinform" autocomplete="off">' +
    field("j_code", "旅行代碼", inp("j_code", S.joinCode, 'required maxlength="12" autocapitalize="off" placeholder="例如 k7m2qa"'), "在朋友傳來的網址最後面，?t= 後面那串。") +
    field("j_pw", "旅行密碼", inp("j_pw", "", 'type="password" required autocomplete="off"')) +
    '<button class="btn primary block" type="submit">加入</button></form>';
  h += '<div class="section-head"><h2>開一趟新旅行</h2></div><div class="card formcard"><p style="margin:0;color:var(--muted);font-size:14px">建立後會得到一個分享網址，把網址和密碼傳給同行的人就能一起編輯。</p><button class="btn block" data-act="trip-new">建立新旅行</button></div>';
  return h;
}
function topbar() {
  const j = joined();
  return '<div class="topbar"><label for="tripsel" class="sr">切換旅行</label><select id="tripsel" data-change="trip">' +
    j.map(x => '<option value="' + esc(x.code) + '"' + (x.key === S.key ? " selected" : "") + ">" + esc(x.name || x.code) + "</option>").join("") +
    '<option value="__home">＋ 建立或加入其他旅行</option></select><button class="btn" data-act="import">匯入計畫</button><button class="btn" data-act="share">分享</button></div>';
}
function stub(t) {
  const s = parseD(t.start), e = parseD(t.end || t.start), now = parseD(todayISO());
  const days = s && e ? Math.round((e - s) / 864e5) + 1 : 0;
  let cd = "";
  if (s) {
    const diff = Math.round((s - now) / 864e5);
    if (diff > 0) cd = '<div class="countdown"><div class="n num">' + diff + '</div><div class="l">天後出發</div></div>';
    else if (e && now <= e) cd = '<div class="countdown"><div class="n num">DAY ' + (Math.round((now - s) / 864e5) + 1) + '</div><div class="l">旅行中</div></div>';
  }
  const m = me();
  return '<section class="stub" aria-label="旅行資訊"><div class="stub-main">' + cd +
    '<h1 class="dest">' + esc(t.destination || t.name || "未命名旅行") + "</h1>" +
    '<p class="tripname">' + esc(t.name || "") + (t.demo ? ' <span class="pill warn">範例</span>' : "") + "</p>" +
    '<div class="meta"><span><b class="num">' + (s ? md(t.start) + " – " + md(t.end || t.start) : "日期未定") + "</b></span>" + (days ? '<span class="num">' + days + " 天</span>" : "") +
    '<span class="num">' + (t.members || []).length + " 人</span>" + (t.currency ? "<span>記帳：" + esc(t.currency) + "</span>" : "") + "</div>" +
    '</div><div class="stub-perf"></div><div class="stub-foot">' +
    '<div class="members">' + (t.members || []).map(x => '<span class="pill' + (x === m ? " on" : "") + '">' + esc(x) + "</span>").join("") + "</div>" +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label class="me" for="mesel">我是</label><select id="mesel" data-change="me" style="width:auto"><option value="">選擇…</option>' +
    (t.members || []).map(x => "<option" + (x === m ? " selected" : "") + ">" + esc(x) + "</option>").join("") + "</select>" +
    '<button class="btn small" data-act="trip-edit">編輯旅行</button></div></div></section>';
}

function viewPlan(t) {
  const days = tripDays(t);
  let h = '<div class="days" role="group" aria-label="選擇日期">' + days.map((d, i) => {
    const s = parseD(t.start), x = parseD(d); const n = s && x ? Math.round((x - s) / 864e5) + 1 : i + 1;
    return '<button class="day" data-act="day" data-id="' + esc(d) + '" aria-pressed="' + (d === S.day) + '"><div class="d1 num">' + (d ? "DAY " + n : "未定") + '</div><div class="d2">' + (d ? md(d) : "還沒排日期") + "</div></button>";
  }).join("") + "</div>";
  const list = dayStops();
  let route = "";
  if (list.length >= 2) {
    const locs = list.map(locOf).filter(Boolean);
    const w = locs.slice(1, -1).slice(0, 8);
    route = "https://www.google.com/maps/dir/?api=1&origin=" + enc(locs[0]) + "&destination=" + enc(locs[locs.length - 1]) + (w.length ? "&waypoints=" + enc(w.join("|")) : "");
  }
  h += '<div class="dayhead"><span class="ttl">' + (S.day ? md(S.day) : "未排日期") + " · " + list.length + " 個行程</span>" +
    '<span style="display:flex;gap:8px;flex-wrap:wrap">' + (route ? '<a class="btn small" href="' + esc(route) + '" target="_blank" rel="noopener">在 Google 地圖看整天路線 ↗</a>' : "") +
    '<button class="btn small primary" data-act="stop-new">＋ 新增行程</button></span></div>';
  if (!list.length) return h + '<div class="card empty" style="margin-top:10px"><p>這天還沒有行程。</p><button class="btn" data-act="stop-new">新增第一個地點</button></div>';
  h += '<ol class="rail">';
  list.forEach((x, i) => {
    const next = list[i + 1];
    const last = i === list.length - 1 && !x.mode;
    const label = x.place || x.title;
    h += '<li class="stop' + (last ? " last" : "") + '"><div class="t' + (x.time ? "" : " none") + '">' + (x.time ? esc(x.time) : "未定") + '</div><div class="track" data-n="' + (i + 1) + '"></div>' +
      '<div class="body" id="item-' + esc(x.id) + '"><h3><span>' + esc(x.title || "未命名") + '</span><button class="btn ghost small" data-act="stop-edit" data-id="' + esc(x.id) + '">編輯</button></h3>' +
      (x.place ? '<p class="place">' + esc(x.place) + "</p>" : "") +
      (x.note ? '<p class="note">' + esc(x.note) + "</p>" : "") +
      (label ? '<div class="acts links">' + (hasPos(x) && mapsEnabled() ? '<button class="linkbtn" data-act="focus" data-id="' + esc(x.id) + '">在地圖上看</button>' : "") + ext(gPlace(x), "Google 地圖 ↗") + ext(aPlace(x), "Apple 地圖 ↗") + "</div>" : "") +
      "</div></li>";
    if (x.mode || next) {
      if (x.mode || (next && hasPos(x) && hasPos(next))) {
        h += '<li class="move' + (i === list.length - 1 ? " last" : "") + '"><div></div><div class="track"></div><div class="info">' +
          (x.mode ? '<span class="mode">' + esc(x.mode) + "</span>" : "") + (x.mins ? '<span class="num">約 ' + esc(x.mins) + " 分鐘</span>" : "") + (x.moveNote ? "<span>· " + esc(x.moveNote) + "</span>" : "") +
          (next ? '<span class="links">' + ext(gDir(x, next, x.mode), "Google 導航") + ext(aDir(x, next, x.mode), "Apple 導航") + "</span>" : "") + "</div></li>";
      }
    }
  });
  return h + "</ol>";
}

function viewFood() {
  const m = me(); const list = wishList(); const K = kindOf(S.wishKind);
  const count = k => S.wishes.filter(w => kindOf(w.kind)[0] === k).length;
  let h = '<div class="section-head"><div class="seg" role="group" aria-label="類別">' +
    KINDS.map(([k, l]) => '<button data-act="wishkind" data-id="' + k + '" aria-pressed="' + (S.wishKind === k) + '">' + l + ' <span class="num">' + count(k) + "</span></button>").join("") +
    '</div><button class="btn primary small" data-act="wish-new">＋ 新增</button></div>';
  h += '<p style="color:var(--muted);font-size:13px;margin:-4px 0 10px">想去的地方先放這裡，大家 +1 投票，決定後按「排進行程」放到某一天。' + (m ? "" : "先在上方選「我是」才能 +1。") + "</p>";
  if (!list.length) return h + '<div class="card empty"><p>還沒有' + K[1] + '候選。</p><button class="btn" data-act="wish-new">新增一個</button></div>';
  h += '<ul class="rows card">' + list.map((w, i) => {
    const v = w.votes || []; const mine = m && v.includes(m); const k = kindOf(w.kind);
    return '<li class="row' + (w.done ? " done" : "") + '" id="item-' + esc(w.id) + '">' +
      '<button class="vote" data-act="vote" data-id="' + esc(w.id) + '" aria-pressed="' + (!!mine) + '" aria-label="' + (mine ? "取消 +1" : "+1") + "，目前 " + v.length + ' 票"><span class="c num">' + v.length + '</span><span class="l">' + (mine ? "已 +1" : "+1") + "</span></button>" +
      '<div class="main"><div class="title">' + (hasPos(w) && mapsEnabled() ? '<span class="num" style="color:' + k[2] + '">' + (i + 1) + ". </span>" : "") + esc(w.name) +
      (w.plannedDate ? ' <span class="pill" style="font-weight:500">已排 ' + md(w.plannedDate) + "</span>" : "") + "</div>" +
      '<div class="sub">' + (w.place && w.place !== w.name ? esc(w.place) + "<br>" : "") + (w.note ? esc(w.note) + "<br>" : "") +
      '<span class="links">' + (hasPos(w) && mapsEnabled() ? '<button class="linkbtn" data-act="focus" data-id="' + esc(w.id) + '">在地圖上看</button>' : "") + ext(gPlace(w), "Google 地圖 ↗") + ext(aPlace(w), "Apple 地圖 ↗") +
      (/^https?:\/\//.test(w.url || "") ? ext(w.url, "來源 ↗") : "") + "</span></div>" +
      (v.length ? '<div class="voters">' + v.map(x => '<span class="pill">' + esc(x) + "</span>").join("") + "</div>" : "") +
      '<div style="margin-top:8px"><button class="btn small" data-act="wish-plan" data-id="' + esc(w.id) + '">' + (w.plannedDate ? "再排一次" : "排進行程") + "</button></div></div>" +
      '<div class="rowacts"><button class="check" data-act="wish-done" data-id="' + esc(w.id) + '" aria-pressed="' + (!!w.done) + '" aria-label="' + k[3] + '" title="' + k[3] + '"><svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7"/></svg></button>' +
      '<button class="btn ghost small" data-act="wish-edit" data-id="' + esc(w.id) + '">編輯</button></div></li>';
  }).join("") + "</ul>";
  return h;
}

function viewMoney(t) {
  const r = settle(t); const rate = Number(t.rate) || 0; const home = (t.home || "").toUpperCase();
  const showConv = rate && home && home !== r.cur;
  const conv = v => showConv ? '<div class="s num">≈ ' + fmtMoney(v * rate, home) + "</div>" : "";
  const n = (t.members || []).length || 1;
  let h = '<div class="section-head"><h2>分帳</h2><button class="btn primary small" data-act="exp-new">＋ 記一筆</button></div>';
  h += '<div class="totals"><div class="card tot"><div class="k">總支出</div><div class="v">' + fmtMoney(r.total, r.cur) + "</div>" + conv(r.total) + "</div>" +
    '<div class="card tot"><div class="k">平均每人</div><div class="v">' + fmtMoney(r.total / n, r.cur) + "</div>" + conv(r.total / n) + "</div></div>";
  if (r.people.length) {
    h += '<div class="section-head"><h2>每人收支</h2></div><div class="card tablewrap"><table><thead><tr><th>成員</th><th>已付</th><th>應分攤</th><th>差額</th></tr></thead><tbody>' +
      r.people.map(p => "<tr><td>" + esc(p.n) + "</td><td>" + fmtMoney(p.paid, r.cur) + "</td><td>" + fmtMoney(p.share, r.cur) + '</td><td class="' + (p.net > 0.004 ? "pos" : p.net < -0.004 ? "neg" : "") + '">' + (p.net > 0.004 ? "+" : "") + fmtMoney(p.net, r.cur) + "</td></tr>").join("") + "</tbody></table></div>";
    h += '<div class="section-head"><h2>結算建議</h2><span style="font-size:13px;color:var(--muted)">最少轉帳次數</span></div><div class="card">' +
      (r.tx.length ? '<ul class="settle">' + r.tx.map(x => "<li><b>" + esc(x.from) + '</b><span class="arrow">→</span><b>' + esc(x.to) + '</b><span class="amt">' + fmtMoney(x.v, r.cur) + (showConv ? ' <span style="color:var(--muted);font-weight:400">≈ ' + fmtMoney(x.v * rate, home) + "</span>" : "") + "</span></li>").join("") + "</ul>" : '<div class="empty">目前大家都打平了。</div>') + "</div>";
  }
  const list = S.expenses.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
  h += '<div class="section-head"><h2>明細</h2><span style="font-size:13px;color:var(--muted)">' + list.length + " 筆</span></div>";
  if (!list.length) return h + '<div class="card empty"><p>還沒有記帳。誰先付了錢就記一筆，網站會算好誰該給誰多少。</p></div>';
  h += '<ul class="rows card">' + list.map(e => {
    const among = Array.isArray(e.among) && e.among.length ? e.among : (t.members || []);
    const all = among.length === (t.members || []).length;
    return '<li class="row"><div class="main"><div class="title">' + esc(e.title || "未命名") + '</div><div class="sub">' + (e.date ? md(e.date) + " · " : "") + (e.cat ? esc(e.cat) + " · " : "") + esc(e.payer || "?") + " 先付 · " + (all ? "全員分攤" : esc(among.join("、")) + " 分攤") + "</div></div>" +
      '<div style="text-align:right"><div class="num" style="font-weight:700">' + fmtMoney(Number(e.amount) || 0, r.cur) + '</div><button class="btn ghost small" data-act="exp-edit" data-id="' + esc(e.id) + '">編輯</button></div></li>';
  }).join("") + "</ul>";
  return h;
}

function viewPrep() {
  const done = S.tasks.filter(x => x.done).length, total = S.tasks.length;
  let h = '<div class="section-head"><h2>行前清單</h2><button class="btn primary small" data-act="task-new">＋ 新增</button></div>';
  if (!total) return h + '<div class="card empty"><p>把要訂的、要帶的、要辦的都列出來，並指定誰負責。</p><button class="btn" data-act="task-new">新增第一項</button></div>';
  const pct = Math.round(done / total * 100);
  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px"><b>完成 <span class="num">' + done + " / " + total + '</span></b><span class="num" style="color:var(--muted)">' + pct + '%</span></div><div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + pct + '%"></span></div></div>';
  const cats = TASKCATS.concat(S.tasks.map(x => x.cat).filter(c => c && !TASKCATS.includes(c)));
  h += '<div class="card">';
  cats.forEach(c => {
    const items = S.tasks.filter(x => (x.cat || "其他") === c).sort((a, b) => (!!a.done - !!b.done) || (a.createdAt || 0) - (b.createdAt || 0));
    if (!items.length) return;
    h += '<div class="grouphead">' + esc(c) + ' <span class="num">' + items.filter(x => x.done).length + "/" + items.length + '</span></div><ul class="rows">' + items.map(x =>
      '<li class="row' + (x.done ? " done" : "") + '"><button class="check" data-act="task-done" data-id="' + esc(x.id) + '" aria-pressed="' + (!!x.done) + '" aria-label="完成：' + esc(x.text) + '"><svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7"/></svg></button>' +
      '<div class="main"><div class="title">' + esc(x.text) + "</div>" + (x.who || x.note ? '<div class="sub">' + (x.who ? "負責：" + esc(x.who) : "") + (x.who && x.note ? " · " : "") + (x.note ? esc(x.note) : "") + "</div>" : "") + "</div>" +
      '<button class="btn ghost small" data-act="task-edit" data-id="' + esc(x.id) + '">編輯</button></li>').join("") + "</ul>";
  });
  return h + "</div>";
}

/* ---------- map ---------- */
function mapPoints() {
  if (S.tab === "plan") {
    return dayStops().map((x, i) => ({ x, i })).filter(o => hasPos(o.x))
      .map(o => ({ id: o.x.id, lat: o.x.lat, lng: o.x.lng, label: String(o.i + 1), title: o.x.title, color: "var(--accent)" }));
  }
  return wishList().map((w, i) => ({ w, i })).filter(o => hasPos(o.w))
    .map(o => ({ id: o.w.id, lat: o.w.lat, lng: o.w.lng, label: String(o.i + 1), title: o.w.name, faded: !!o.w.done, color: kindOf(o.w.kind)[2] }));
}
function updateMap() {
  const bar = $("#mapbar"), box = $("#map"), note = $("#mapnote");
  const pts = mapPoints();
  const total = S.tab === "plan" ? dayStops().length : wishList().length;
  if (!mapsEnabled()) {
    box.hidden = true; note.hidden = false;
    note.textContent = "設定 Google 地圖金鑰後，這裡會顯示互動地圖，並用編號標出每個地點。";
    bar.hidden = true; return;
  }
  if (S.mapErr) { box.hidden = true; note.hidden = false; note.textContent = S.mapErr; bar.hidden = true; return; }
  box.hidden = false; note.hidden = true; bar.hidden = false;
  if (!tmap) {
    tmap = new TripMap(box, pt => {
      tmap.highlight(pt.id);
      const el = document.getElementById("item-" + pt.id);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); const b = el.classList.contains("row") ? el : el; b.classList.add("flash"); setTimeout(() => b.classList.remove("flash"), 1400); }
    });
    tmap.ready.catch(e => { console.error(e); S.mapErr = "地圖載入失敗，請確認 Google 地圖金鑰設定。"; updateMap(); });
  }
  let route = false;
  if (S.tab === "plan") { const modes = dayStops().map(x => x.mode).filter(Boolean); route = modes.length && modes.every(m => m === "步行") ? "WALKING" : "DRIVING"; }
  tmap.show(pts, route).catch(() => {});
  const missing = total - pts.length;
  $("#mapinfo").innerHTML = esc(pts.length ? "地圖上 " + pts.length + " 個地點" : "這裡還沒有已定位的地點") + (missing > 0 ? "，" + missing + ' 個未定位 <button class="linkbtn" data-act="geo-missing">自動定位</button>' : "");
}
document.addEventListener("maps-auth-failed", () => { S.mapErr = "Google 地圖金鑰無效，或沒有允許這個網址使用。請檢查金鑰的網站限制。"; if (S.screen === "trip") updateMap(); });

/* ---------- sheet forms ---------- */
function opt(list, val, blank) { return (blank != null ? '<option value="">' + esc(blank) + "</option>" : "") + list.map(x => "<option" + (x === val ? " selected" : "") + ">" + esc(x) + "</option>").join(""); }
function field(id, label, input, hint) { return '<div class="field"><label for="' + id + '">' + label + "</label>" + input + (hint ? '<div class="hint">' + hint + "</div>" : "") + "</div>"; }
function inp(id, val, attrs) { return '<input id="' + id + '" name="' + id + '" value="' + esc(val == null ? "" : val) + '" ' + (attrs || "") + ">"; }
function memberChecks(name, members, sel) { return '<div class="checks">' + members.map((m, i) => '<label><input type="checkbox" id="' + name + i + '" name="' + name + '" value="' + esc(m) + '"' + (sel.includes(m) ? " checked" : "") + ">" + esc(m) + "</label>").join("") + "</div>"; }

function openSheet(title, body, onSave, onDelete, opts) {
  opts = opts || {};
  sheetState = { onSave, onDelete, armed: false, place: null };
  const f = $("#sheetform");
  f.innerHTML = "<h2>" + esc(title) + '</h2><div class="fields">' + body + '</div><div class="panel-acts">' +
    (onDelete ? '<button type="button" class="btn danger" data-act="sheet-del">' + esc(opts.delLabel || "刪除") + "</button>" : "") +
    '<span class="spacer"></span><button type="button" class="btn" data-act="close">' + (onSave ? "取消" : "關閉") + "</button>" + (onSave ? '<button type="submit" class="btn primary">' + esc(opts.saveLabel || "儲存") + "</button>" : "") + "</div>";
  $("#sheet").hidden = false;
  const first = f.querySelector("input:not([type=hidden]):not([readonly]),select,textarea"); if (first && !opts.noFocus) setTimeout(() => first.focus(), 30);
}
function closeSheet() { $("#sheet").hidden = true; sheetState = null; }

// 地點欄位：有地圖金鑰時提供自動完成
function placeField(item, label, ph) {
  const located = hasPos(item);
  return '<div class="field"><label for="f_place">' + label + "</label>" + inp("f_place", item.place || "", 'maxlength="200" autocomplete="off" placeholder="' + esc(ph) + '"') +
    '<ul class="suggest" id="suggest" hidden></ul>' +
    (mapsEnabled() ? '<div class="located ' + (located ? "ok" : "no") + '" id="located">' + (located ? "✓ 已定位，會顯示在地圖上" : "輸入後從清單選一個，就會標在地圖上") + "</div>" : "") + "</div>";
}
function bindPlace(item) {
  sheetState.place = hasPos(item) ? { lat: item.lat, lng: item.lng, placeId: item.placeId || "", text: item.place || "" } : null;
  if (!mapsEnabled()) return;
  const input = $("#f_place"), list = $("#suggest"), loc = $("#located");
  let token = null, timer = null, seq = 0, items = [];
  const center = (() => { const p = [...S.stops, ...S.wishes].filter(hasPos); if (!p.length) return null; return { lat: p.reduce((a, b) => a + b.lat, 0) / p.length, lng: p.reduce((a, b) => a + b.lng, 0) / p.length }; })();
  input.addEventListener("input", () => {
    if (sheetState && sheetState.place && input.value !== sheetState.place.text) { sheetState.place = null; loc.className = "located no"; loc.textContent = "輸入後從清單選一個，就會標在地圖上"; }
    clearTimeout(timer);
    const q = input.value.trim(); if (q.length < 2) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      try {
        if (!token) token = await newSession();
        items = await suggest(q, token, center);
        if (my !== seq) return;
        list.innerHTML = items.map((s, i) => '<li><button type="button" data-i="' + i + '"><span class="m">' + esc(s.main) + '</span><span class="s">' + esc(s.sub) + "</span></button></li>").join("");
        list.hidden = !items.length;
      } catch (e) { console.error(e); list.hidden = true; }
    }, 300);
  });
  list.addEventListener("click", async e => {
    const b = e.target.closest("button[data-i]"); if (!b) return;
    const s = items[+b.dataset.i]; list.hidden = true;
    loc.className = "located no"; loc.textContent = "定位中…";
    try {
      const p = await resolvePlace(s.pred); token = null;
      const text = p.name + (p.address ? "（" + p.address + "）" : "");
      input.value = text;
      if (sheetState) sheetState.place = { lat: p.lat, lng: p.lng, placeId: p.placeId, text, name: p.name };
      const t = $("#f_title") || $("#f_wname"); if (t && !t.value.trim()) t.value = p.name;
      loc.className = "located ok"; loc.textContent = "✓ 已定位，會顯示在地圖上";
    } catch (err) { console.error(err); loc.textContent = "定位失敗，可以再選一次"; }
  });
}
function placeData(fd) {
  const text = (fd.get("f_place") || "").trim();
  const p = sheetState && sheetState.place;
  if (p && p.text === text) return { place: text, lat: p.lat, lng: p.lng, placeId: p.placeId || "" };
  return { place: text, lat: null, lng: null, placeId: "" };
}

function tripForm(t) {
  t = t || {}; const isNew = !t.code;
  openSheet(isNew ? "建立新旅行" : "編輯旅行",
    field("f_dest", "目的地", inp("f_dest", t.destination, 'required maxlength="40" placeholder="例如：京都"')) +
    field("f_name", "旅行名稱", inp("f_name", t.name, 'maxlength="60" placeholder="例如：京都賞楓 3 日"')) +
    '<div class="two">' + field("f_start", "出發日", inp("f_start", t.start, 'type="date" required')) + field("f_end", "回程日", inp("f_end", t.end, 'type="date" required')) + "</div>" +
    field("f_members", "同行成員", inp("f_members", (t.members || []).join("、"), 'required placeholder="例如：Louis、小安、阿哲"'), "用頓號或逗號分隔。分帳和投票都用這份名單。") +
    '<div class="two">' + field("f_cur", "記帳幣別", inp("f_cur", t.currency || "TWD", 'maxlength="3" placeholder="JPY" style="text-transform:uppercase"'), "三碼代號，例如 JPY、KRW") +
    field("f_home", "換算成", inp("f_home", t.home || "TWD", 'maxlength="3" placeholder="TWD" style="text-transform:uppercase"')) + "</div>" +
    field("f_rate", "匯率（1 記帳幣 = ? 換算幣）", inp("f_rate", t.rate || "", 'type="number" step="any" min="0" placeholder="例如 0.21，可留空"'), "留空就不顯示換算金額。") +
    '<div class="field"><label>主題</label><div class="theme-swatches" role="radiogroup" aria-label="主題">' + THEMES.map(([k, l, c], i) =>
      '<label><input type="radio" id="f_theme' + i + '" name="f_theme" value="' + k + '"' + ((t.theme || "") === k ? " checked" : "") + '><span class="sw">' + c.map(x => '<i style="background:' + x + '"></i>').join("") + "</span>" + l + "</label>").join("") + "</div></div>" +
    (isNew ? field("f_pw", "旅行密碼", inp("f_pw", "", 'required minlength="4" maxlength="40" autocomplete="new-password"'), "至少 4 個字。同行的人要用這組密碼加入，建立後無法更改，請記下來。") : ""),
    async fd => {
      const start = fd.get("f_start"), end = fd.get("f_end") || start;
      if (end < start) { toast("回程日不能早於出發日。"); return false; }
      const members = splitNames(fd.get("f_members")); if (!members.length) { toast("請至少填一位成員。"); return false; }
      const data = {
        destination: fd.get("f_dest").trim(), name: fd.get("f_name").trim(), start, end, members,
        currency: (fd.get("f_cur") || "TWD").trim().toUpperCase(), home: (fd.get("f_home") || "").trim().toUpperCase(), rate: Number(fd.get("f_rate")) || 0,
        theme: String(fd.get("f_theme") || "")
      };
      if (isNew) {
        const pw = fd.get("f_pw"); if (pw.length < 4) { toast("密碼至少 4 個字。"); return false; }
        const code = newCode(); const key = await tripKey(code, pw);
        data.code = code; data.createdAt = Date.now();
        const ok = await write(() => S.store.setTrip(key, data));
        if (ok) { remember(code, key, data.name || data.destination); S.tab = "plan"; history.replaceState(null, "", "#plan"); openTrip(code, key); setTimeout(() => shareSheet(code, pw), 400); }
        return ok;
      }
      return write(() => S.store.updateTrip(S.key, data));
    },
    isNew ? null : async () => {
      const ok = await write(() => S.store.deleteTrip(S.key));
      if (ok) { forget(t.code); goHome(); }
      return ok;
    }, { delLabel: "刪除這趟旅行" });
  if (!isNew) {
    const acts = $("#sheetform .panel-acts");
    const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.dataset.act = "leave"; b.textContent = "從這台裝置移除";
    acts.insertBefore(b, acts.querySelector(".spacer"));
  }
}
function shareSheet(code, pw) {
  const url = shareURL(code);
  openSheet("分享給同行的人",
    field("s_url", "分享網址", '<div class="copyrow">' + inp("s_url", url, "readonly") + '<button type="button" class="btn" data-act="copy">複製</button></div>') +
    (pw ? field("s_pw", "旅行密碼", inp("s_pw", pw, "readonly"), "建議網址和密碼分開傳。") : '<p style="margin:0;font-size:14px;color:var(--muted)">密碼請另外告訴對方。忘記密碼的話，只能請已加入的人看自己當初記下的密碼。</p>') +
    (navigator.share ? '<button type="button" class="btn block" data-act="native-share">用其他 App 分享網址…</button>' : ""),
    null, null, { noFocus: true });
}
function stopForm(x) {
  const t = S.trip; x = x || { date: S.day || "", time: "" }; const isNew = !x.id;
  const days = tripDays(t).filter(Boolean);
  openSheet(isNew ? (x.fromWish ? "排進行程" : "新增行程") : "編輯行程",
    '<div class="two">' + field("f_date", "日期", '<select id="f_date" name="f_date"><option value="">未定</option>' + days.map(d => '<option value="' + d + '"' + (d === x.date ? " selected" : "") + ">" + md(d) + "</option>").join("") + "</select>") +
    field("f_time", "時間", inp("f_time", x.time, 'type="time"')) + "</div>" +
    placeField(x, "地點", mapsEnabled() ? "搜尋景點、餐廳或地址" : "店名或地址（用來開地圖）") +
    field("f_title", "要做什麼", inp("f_title", x.title, 'required maxlength="80" placeholder="例如：清水寺"')) +
    field("f_note", "備註", '<textarea id="f_note" name="f_note" maxlength="1000" placeholder="門票、營業時間、訂位編號…">' + esc(x.note || "") + "</textarea>") +
    '<div class="two">' + field("f_mode", "前往下一站", '<select id="f_mode" name="f_mode">' + opt(MODES, x.mode, "不填") + "</select>") +
    field("f_mins", "約幾分鐘", inp("f_mins", x.mins, 'type="number" min="0" step="1"')) + "</div>" +
    field("f_mnote", "交通備註", inp("f_mnote", x.moveNote, 'maxlength="100" placeholder="例如：JR 奈良線，稻荷站下車"')),
    async fd => {
      const data = Object.assign({
        date: fd.get("f_date") || "", time: fd.get("f_time") || "", title: fd.get("f_title").trim(), note: fd.get("f_note").trim(),
        mode: fd.get("f_mode") || "", mins: fd.get("f_mins") ? Number(fd.get("f_mins")) : null, moveNote: fd.get("f_mnote").trim()
      }, placeData(fd));
      let ok;
      if (isNew) {
        data.createdAt = Date.now(); data.by = me(); ok = await write(() => S.store.add(S.key, "stops", data));
        if (ok && x.fromWish) await write(() => S.store.update(S.key, "wishes", x.fromWish, { plannedDate: data.date || "未定" }));
      }
      else ok = await write(() => S.store.update(S.key, "stops", x.id, data));
      if (ok) S.day = data.date;
      return ok;
    },
    isNew ? null : () => write(() => S.store.del(S.key, "stops", x.id)));
  bindPlace(x);
}
function wishForm(w) {
  w = w || { kind: S.wishKind }; const isNew = !w.id; const k = kindOf(w.kind);
  openSheet(isNew ? "新增" + k[1] + "候選" : "編輯候選",
    field("f_kind", "類別", '<select id="f_kind" name="f_kind">' + KINDS.map(([v, l]) => '<option value="' + v + '"' + (k[0] === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select>") +
    placeField(w, "在哪裡", mapsEnabled() ? "搜尋景點、店家或地址" : "店家、景點或地址") +
    field("f_wname", "名稱", inp("f_wname", w.name, 'required maxlength="80" placeholder="景點、店名或商品"')) +
    field("f_wnote", "備註", '<textarea id="f_wnote" name="f_wnote" maxlength="600" placeholder="推薦原因、營業時間、價位…">' + esc(w.note || "") + "</textarea>") +
    field("f_wurl", "來源連結", inp("f_wurl", w.url, 'type="url" maxlength="500" placeholder="IG、部落格或 Notion 連結（可留空）"')),
    async fd => {
      const url = String(fd.get("f_wurl") || "").trim();
      const data = Object.assign({ kind: fd.get("f_kind"), name: fd.get("f_wname").trim(), note: fd.get("f_wnote").trim(), url: /^https?:\/\//.test(url) ? url : "" }, placeData(fd));
      if (isNew) { const m = me(); Object.assign(data, { votes: m ? [m] : [], done: false, by: m, createdAt: Date.now() }); return write(() => S.store.add(S.key, "wishes", data)); }
      return write(() => S.store.update(S.key, "wishes", w.id, data));
    },
    isNew ? null : () => write(() => S.store.del(S.key, "wishes", w.id)));
  bindPlace(w);
}
function expForm(e) {
  const t = S.trip; const ms = t.members || [];
  e = e || { payer: me() || ms[0] || "", among: ms.slice(), date: (tripDays(t).includes(todayISO()) ? todayISO() : (S.day || t.start || "")) };
  const isNew = !e.id; const among = Array.isArray(e.among) && e.among.length ? e.among : ms;
  openSheet(isNew ? "記一筆" : "編輯支出",
    field("f_etitle", "項目", inp("f_etitle", e.title, 'required maxlength="80" placeholder="例如：晚餐、車票"')) +
    '<div class="two">' + field("f_amt", "金額（" + esc(t.currency || "TWD") + "）", inp("f_amt", e.amount, 'type="number" inputmode="decimal" step="any" min="0" required')) +
    field("f_edate", "日期", inp("f_edate", e.date, 'type="date"')) + "</div>" +
    '<div class="two">' + field("f_payer", "誰先付", '<select id="f_payer" name="f_payer" required>' + opt(ms, e.payer) + "</select>") +
    field("f_ecat", "分類", '<select id="f_ecat" name="f_ecat">' + opt(EXPCATS, e.cat, "不分類") + "</select>") + "</div>" +
    field("f_among0", "哪些人分攤（平均）", memberChecks("f_among", ms, among)),
    async fd => {
      const amt = Number(fd.get("f_amt")); if (!(amt > 0)) { toast("請輸入大於 0 的金額。"); return false; }
      const sel = fd.getAll("f_among"); if (!sel.length) { toast("至少要有一個人分攤。"); return false; }
      const data = { title: fd.get("f_etitle").trim(), amount: amt, date: fd.get("f_edate") || "", payer: fd.get("f_payer"), cat: fd.get("f_ecat") || "", among: sel };
      if (isNew) { data.createdAt = Date.now(); return write(() => S.store.add(S.key, "expenses", data)); }
      return write(() => S.store.update(S.key, "expenses", e.id, data));
    },
    isNew ? null : () => write(() => S.store.del(S.key, "expenses", e.id)));
}
function taskForm(x) {
  const t = S.trip; x = x || { cat: "預訂" }; const isNew = !x.id;
  openSheet(isNew ? "新增待辦" : "編輯待辦",
    field("f_text", "要做什麼", inp("f_text", x.text, 'required maxlength="100" placeholder="例如：訂飯店、帶行動電源"')) +
    '<div class="two">' + field("f_tcat", "分類", '<select id="f_tcat" name="f_tcat">' + opt(TASKCATS, x.cat || "其他") + "</select>") +
    field("f_who", "負責人", '<select id="f_who" name="f_who">' + opt(t.members || [], x.who, "大家") + "</select>") + "</div>" +
    field("f_tnote", "備註", inp("f_tnote", x.note, 'maxlength="200" placeholder="訂位編號、截止日…"')),
    async fd => {
      const data = { text: fd.get("f_text").trim(), cat: fd.get("f_tcat"), who: fd.get("f_who") || "", note: fd.get("f_tnote").trim() };
      if (isNew) { Object.assign(data, { done: false, createdAt: Date.now() }); return write(() => S.store.add(S.key, "tasks", data)); }
      return write(() => S.store.update(S.key, "tasks", x.id, data));
    },
    isNew ? null : () => write(() => S.store.del(S.key, "tasks", x.id)));
}

/* ---------- 匯入計畫（AI 整理或 JSON） ---------- */
function buildPrompt(text) {
  const t = S.trip;
  return [
    "你是旅行行程整理助手。把使用者貼上的旅行計畫整理成 JSON，只輸出 JSON，不要任何說明文字。",
    "",
    "這趟旅行的資訊：",
    "- 目的地：" + (t.destination || ""),
    "- 日期：" + (t.start || "未定") + " 到 " + (t.end || t.start || "未定"),
    "- 成員：" + (t.members || []).join("、"),
    "- 記帳幣別：" + (t.currency || "TWD"),
    "",
    "輸出格式（沒有的類別給空陣列）：",
    "{",
    '  "stops": [{"date":"YYYY-MM-DD","time":"HH:MM","title":"要做什麼","place":"地點名稱或地址","note":"備註","mode":"前往下一站的交通方式","mins":分鐘數或null,"moveNote":"交通備註"}],',
    '  "wishes": [{"kind":"play/eat/buy/stay","name":"名稱","place":"在哪裡","note":"備註","url":"來源連結"}],',
    '  "tasks": [{"text":"待辦事項","cat":"預訂/證件/打包/其他","who":"負責人","note":"備註"}],',
    '  "expenses": [{"title":"項目","amount":數字,"payer":"誰付的","date":"YYYY-MM-DD","cat":"交通/住宿/餐飲/門票/購物/其他"}]',
    "}",
    "",
    "規則：",
    "1. 「第一天／Day 1」對應出發日 " + (t.start || "") + "，依序往後推；原文有具體日期就用原文日期。真的無法判斷日期就給空字串。",
    "2. time 用 24 小時制 HH:MM；只寫「上午／下午／晚上」時估一個合理時間（09:00／14:00／19:00）；沒寫就給空字串。",
    "3. mode 只能是以下其中之一，或空字串：" + MODES.join("、") + "。",
    "4. place 寫可以在 Google 地圖搜尋到的名稱（景點、店名或地址），盡量保留當地原文名稱。",
    "5. 還沒排進某天的候選地點放 wishes：景點 play、餐廳 eat、伴手禮或購物 buy、住宿候選 stay。已排進某天的放 stops。",
    "6. 訂票、訂房、證件、要帶的東西放 tasks；who 只能是成員名單中的名字，否則給空字串。",
    "7. 只有原文明確寫出金額和付款人的花費才放 expenses，否則給空陣列。不要自己編造花費。",
    "8. 不要捏造原文沒有的地點或行程；可以把原文的補充說明放進 note。",
    "",
    "使用者的計畫：",
    "<<<",
    text,
    ">>>"
  ].join("\n");
}

function parseImport(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("JSON 格式不正確");
  return JSON.parse(s.slice(a, b + 1));
}
function normImport(d) {
  const t = S.trip; const ms = t.members || [];
  const str = v => (v == null ? "" : String(v)).trim();
  const date = v => /^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : "";
  const time = v => { const m = /^(\d{1,2}):(\d{2})/.exec(str(v)); return m ? m[1].padStart(2, "0") + ":" + m[2] : ""; };
  const arr = v => Array.isArray(v) ? v : [];
  const stops = arr(d.stops).map(x => ({
    date: date(x.date), time: time(x.time), title: str(x.title || x.place).slice(0, 80), place: str(x.place).slice(0, 200),
    note: str(x.note).slice(0, 1000), mode: MODES.includes(str(x.mode)) ? str(x.mode) : "",
    mins: Number(x.mins) > 0 ? Math.round(Number(x.mins)) : null, moveNote: str(x.moveNote).slice(0, 100)
  })).filter(x => x.title);
  const wishes = arr(d.wishes).map(x => ({
    kind: kindOf(str(x.kind))[0], name: str(x.name).slice(0, 80), place: str(x.place).slice(0, 200), note: str(x.note).slice(0, 600),
    url: /^https?:\/\//.test(str(x.url)) ? str(x.url).slice(0, 500) : ""
  })).filter(x => x.name);
  const tasks = arr(d.tasks).map(x => ({
    text: str(x.text).slice(0, 100), cat: TASKCATS.includes(str(x.cat)) ? str(x.cat) : "其他",
    who: ms.includes(str(x.who)) ? str(x.who) : "", note: str(x.note).slice(0, 200)
  })).filter(x => x.text);
  const expenses = arr(d.expenses).map(x => ({
    title: str(x.title).slice(0, 80), amount: Number(x.amount), date: date(x.date),
    payer: ms.includes(str(x.payer)) ? str(x.payer) : "", cat: EXPCATS.includes(str(x.cat)) ? str(x.cat) : "",
    among: Array.isArray(x.among) && x.among.filter(m => ms.includes(m)).length ? x.among.filter(m => ms.includes(m)) : ms.slice()
  })).filter(x => x.title && x.amount > 0 && x.payer);
  return { stops, wishes, tasks, expenses };
}

function importSheet() {
  const ai = aiEnabled();
  openSheet("匯入計畫",
    '<p style="margin:0;font-size:14px;color:var(--muted)">' +
    (ai ? "把行程、想去的店、待辦事項直接貼上（任何格式都可以），AI 會幫你拆成每日行程、候選清單和行前清單，確認後才會加入。" : "示範模式沒有 AI，只能貼上 JSON。") +
    "<br>Claude 整理好的 JSON 也貼在這裡。</p>" +
    field("f_plan", "計畫內容", '<textarea id="f_plan" name="f_plan" rows="10" maxlength="20000" required placeholder="例如：&#10;Day1 10:30 到關西機場，搭 Haruka 到京都&#10;下午清水寺、二年坂&#10;晚上祇園吃飯（已訂 18:30）&#10;Day2 早上伏見稻荷…&#10;想吃：湯豆腐、抹茶聖代&#10;要訂：飯店、Haruka 車票" style="min-height:200px"></textarea>') +
    '<div id="importStatus" class="hint" style="font-size:13px;color:var(--muted)"></div>',
    async fd => {
      const text = String(fd.get("f_plan") || "").trim();
      if (!text) { toast("請先貼上計畫內容。"); return false; }
      const status = $("#importStatus");
      let data;
      try {
        if (/^\s*(```(json)?\s*)?\{/.test(text)) {
          data = normImport(parseImport(text));
        } else {
          if (!ai) { toast("示範模式沒有 AI，請貼上 JSON。"); return false; }
          status.textContent = "AI 整理中，大約 5～20 秒…";
          const raw = await generateJSON(buildPrompt(text));
          data = normImport(parseImport(raw));
        }
      } catch (e) {
        console.error(e);
        status.textContent = "";
        toast(/^\s*\{/.test(text) ? "JSON 格式不正確，請確認是完整的內容。" : aiErrorMessage(e));
        return false;
      }
      const n = data.stops.length + data.wishes.length + data.tasks.length + data.expenses.length;
      if (!n) { status.textContent = ""; toast("沒有整理出任何項目，請確認內容後再試。"); return false; }
      setTimeout(() => previewSheet(data), 60);
      return true;
    }, null, { saveLabel: ai ? "整理" : "讀取" });
}

function previewSheet(data) {
  const sec = (title, items, fmt) => items.length ? '<div class="field"><label>' + title + "（" + items.length + "）</label>" +
    '<ul class="rows card" style="max-height:220px;overflow:auto">' + items.map(x => '<li class="row" style="padding:8px 12px"><div class="main"><div class="sub" style="color:var(--ink)">' + fmt(x) + "</div></div></li>").join("") + "</ul></div>" : "";
  const counts = [["stops", "行程"], ["wishes", "候選"], ["tasks", "清單"], ["expenses", "支出"]].filter(([k]) => data[k].length);
  openSheet("確認匯入內容",
    sec("每日行程", data.stops, x => "<b>" + (x.date ? md(x.date) : "未定日期") + " " + esc(x.time) + "</b> " + esc(x.title) + (x.place && x.place !== x.title ? ' <span style="color:var(--muted)">· ' + esc(x.place) + "</span>" : "") + (x.mode ? ' <span style="color:var(--muted)">→ ' + esc(x.mode) + "</span>" : "")) +
    sec("候選清單", data.wishes, x => "【" + kindOf(x.kind)[1] + "】" + esc(x.name) + (x.place ? ' <span style="color:var(--muted)">· ' + esc(x.place) + "</span>" : "")) +
    sec("行前清單", data.tasks, x => "【" + esc(x.cat) + "】" + esc(x.text) + (x.who ? ' <span style="color:var(--muted)">· ' + esc(x.who) + "</span>" : "")) +
    sec("支出", data.expenses, x => esc(x.title) + " " + fmtMoney(x.amount, S.trip.currency) + ' <span style="color:var(--muted)">· ' + esc(x.payer) + " 付</span>") +
    field("f_imode", "加入方式", '<select id="f_imode" name="f_imode"><option value="add">加到現有內容後面</option><option value="replace">取代現有內容（會先刪除：' + counts.map(c => c[1]).join("、") + "）</option></select>") +
    (mapsEnabled() ? '<div class="checks"><label><input type="checkbox" id="f_geo" name="f_geo" value="1" checked>自動在地圖上定位地點</label></div>' : "") +
    '<div id="importStatus" class="hint" style="font-size:13px;color:var(--muted)"></div>',
    async fd => {
      const replace = fd.get("f_imode") === "replace";
      const geo = !!fd.get("f_geo");
      const status = $("#importStatus");
      const ok = await runImport(data, replace, geo, msg => { if (status) status.textContent = msg; });
      if (ok) { toast("已匯入 " + counts.map(([k, l]) => l + " " + data[k].length).join("、")); if (data.stops.length) { const d = data.stops.find(x => x.date); if (d) S.day = d.date; S.tab = "plan"; history.replaceState(null, "", "#plan"); } }
      return ok;
    }, null, { saveLabel: "確認匯入", noFocus: true });
}

// 地址或已含行政區的文字不加目的地；找不到時改用原文、再不加位置偏好重試
async function geocode(text, dest, token) {
  const isAddr = /[縣市區鄉鎮村里路街巷弄號]|\d/.test(text);
  const center = (() => { const p = [...S.stops, ...S.wishes].filter(hasPos); if (!p.length) return null; return { lat: p.reduce((a, b) => a + b.lat, 0) / p.length, lng: p.reduce((a, b) => a + b.lng, 0) / p.length }; })();
  const tries = [];
  if (dest && !isAddr && !text.includes(dest)) tries.push([text + " " + dest, center]);
  tries.push([text, isAddr ? null : center]);
  tries.push([text, null]);
  for (const [q, c] of tries) {
    const list = await suggest(q, token, c);
    if (list.length) {
      const p = await resolvePlace(list[0].pred);
      return { lat: p.lat, lng: p.lng, placeId: p.placeId, place: p.name + (p.address ? "（" + p.address + "）" : "") };
    }
  }
  return null;
}

// 地圖下方「自動定位」：把目前畫面上還沒定位的地點補上座標
async function geoMissing() {
  const isPlan = S.tab === "plan";
  const items = (isPlan ? dayStops() : wishList()).filter(x => !hasPos(x) && (x.place || x.title || x.name));
  if (!items.length) return;
  const dest = (S.trip && S.trip.destination) || "", col = isPlan ? "stops" : "wishes";
  let ok = 0; const cache = new Map();
  toast("定位中…");
  for (const x of items) {
    const text = x.place || x.title || x.name;
    try {
      let g = cache.get(text);
      if (g === undefined) { g = await geocode(text, dest, await newSession()); cache.set(text, g); }
      if (g) { await S.store.update(S.key, col, x.id, { lat: g.lat, lng: g.lng, placeId: g.placeId }); ok++; }
    } catch (e) { console.warn("geocode", text, e); }
  }
  toast(ok === items.length ? "已定位 " + ok + " 個地點" : "定位 " + ok + " 個；" + (items.length - ok) + " 個找不到，請點「編輯」從搜尋清單選。");
}

async function runImport(data, replace, geo, progress) {
  const key = S.key, me0 = me(), now = Date.now(), dest = S.trip.destination || "";
  try {
    if (replace) {
      const map = { stops: S.stops, wishes: S.wishes, tasks: S.tasks, expenses: S.expenses };
      for (const k of Object.keys(map)) {
        if (!data[k].length) continue;
        progress("刪除舊的" + k + "…");
        for (const x of map[k].slice()) await S.store.del(key, k, x.id);
      }
    }
    const cache = new Map();
    const locate = async x => {
      const text = x.place || x.title || x.name;
      if (!geo || !text) return {};
      if (cache.has(text)) return cache.get(text);
      let r = {};
      try { const g = await geocode(text, dest, await newSession()); if (g) r = { lat: g.lat, lng: g.lng, placeId: g.placeId, place: x.place ? x.place : g.place }; } catch (e) { console.warn("geocode", text, e); }
      cache.set(text, r); return r;
    };
    let i = 0; const total = data.stops.length + data.wishes.length + data.tasks.length + data.expenses.length;
    for (const x of data.stops) {
      progress("加入中 " + (++i) + "/" + total + "：" + x.title);
      const pos = await locate(x);
      await S.store.add(key, "stops", Object.assign({ lat: null, lng: null, placeId: "" }, x, pos, { createdAt: now + i, by: me0 }));
    }
    for (const x of data.wishes) {
      progress("加入中 " + (++i) + "/" + total + "：" + x.name);
      const pos = await locate(x);
      await S.store.add(key, "wishes", Object.assign({ lat: null, lng: null, placeId: "" }, x, pos, { votes: me0 ? [me0] : [], done: false, by: me0, createdAt: now + i }));
    }
    for (const x of data.tasks) { progress("加入中 " + (++i) + "/" + total); await S.store.add(key, "tasks", Object.assign({}, x, { done: false, createdAt: now + i })); }
    for (const x of data.expenses) { progress("加入中 " + (++i) + "/" + total); await S.store.add(key, "expenses", Object.assign({}, x, { createdAt: now + i })); }
    return true;
  } catch (e) {
    console.error(e); progress("");
    toast("匯入中途失敗，已加入的項目會保留。請檢查後再試。");
    return false;
  }
}

/* ---------- events ---------- */
const busy = new Set();
async function once(key, fn) { if (busy.has(key)) return; busy.add(key); try { await fn(); } finally { busy.delete(key); } }

document.addEventListener("click", async ev => {
  const el = ev.target.closest("[data-act]"); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  const find = arr => arr.find(x => x.id === id);
  switch (act) {
    case "close": closeSheet(); render(); break;
    case "sheet-del":
      if (!sheetState) return;
      if (!sheetState.armed) { sheetState.armed = true; el.textContent = "再按一次確認刪除"; return; }
      el.disabled = true; if (await sheetState.onDelete()) closeSheet(); else el.disabled = false; break;
    case "leave": { const c = S.trip && S.trip.code; closeSheet(); if (c) { forget(c); goHome(); toast("已從這台裝置移除，旅行資料仍保留給其他人。"); } break; }
    case "open": { const j = joined().find(x => x.code === id); if (j) { render.scrolled = false; openTrip(j.code, j.key); } break; }
    case "trip-new": tripForm(null); break;
    case "trip-edit": tripForm(S.trip); break;
    case "share": shareSheet(S.trip.code, ""); break;
    case "import": importSheet(); break;
    case "copy": { const u = $("#s_url"); try { await navigator.clipboard.writeText(u.value); toast("已複製網址"); } catch (e) { u.select(); toast("請長按選取後複製"); } break; }
    case "native-share": try { await navigator.share({ title: (S.trip && S.trip.name) || "旅行共編手帳", url: $("#s_url").value }); } catch (e) {} break;
    case "day": S.day = id; render(); break;
    case "focus": { const ok = tmap && await tmap.focus(id); if (ok) $("#mapcard").scrollIntoView({ behavior: "smooth", block: "start" }); break; }
    case "locate":
      if (!navigator.geolocation) { toast("這個瀏覽器不支援定位。"); return; }
      navigator.geolocation.getCurrentPosition(p => tmap && tmap.showMe({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast("無法取得位置，請允許瀏覽器使用定位。"), { enableHighAccuracy: true, timeout: 10000 });
      break;
    case "fit": tmap && tmap.show(mapPoints(), S.tab === "plan" ? "DRIVING" : false, true); break;
    case "geo-missing": el.disabled = true; once("geo", geoMissing); break;
    case "stop-new": stopForm(null); break;
    case "stop-edit": { const x = find(S.stops); if (x) stopForm(x); break; }
    case "wishkind": S.wishKind = id; render(); break;
    case "wish-plan": {
      const w = find(S.wishes); if (!w) return;
      const days = tripDays(S.trip).filter(Boolean);
      stopForm({ date: days.includes(S.day) ? S.day : (days[0] || ""), time: "", title: w.name, place: w.place || w.name, note: w.note || "",
        lat: w.lat, lng: w.lng, placeId: w.placeId || "", fromWish: w.id });
      break;
    }
    case "wish-new": wishForm(null); break;
    case "wish-edit": { const x = find(S.wishes); if (x) wishForm(x); break; }
    case "vote": {
      const w = find(S.wishes); if (!w) return; const m = me();
      if (!m) { toast("請先在上方「我是」選擇你的名字。"); const s = $("#mesel"); if (s) s.focus(); return; }
      const on = !(w.votes || []).includes(m);
      once("v" + id, () => write(() => S.store.vote(S.key, id, m, on))); break;
    }
    case "wish-done": { const w = find(S.wishes); if (w) once("wd" + id, () => write(() => S.store.update(S.key, "wishes", id, { done: !w.done }))); break; }
    case "exp-new": if (!(S.trip.members || []).length) { toast("請先在「編輯旅行」加入成員。"); return; } expForm(null); break;
    case "exp-edit": { const x = find(S.expenses); if (x) expForm(x); break; }
    case "task-new": taskForm(null); break;
    case "task-edit": { const x = find(S.tasks); if (x) taskForm(x); break; }
    case "task-done": { const x = find(S.tasks); if (x) once("t" + id, () => write(() => S.store.update(S.key, "tasks", id, { done: !x.done }))); break; }
  }
});
document.addEventListener("change", ev => {
  const el = ev.target; const k = el.dataset && el.dataset.change; if (!k) return;
  if (k === "trip") {
    if (el.value === "__home") { goHome(); return; }
    const j = joined().find(x => x.code === el.value); if (j) { render.scrolled = false; openTrip(j.code, j.key); }
  }
  if (k === "me" && S.trip) { lsSet("me:" + S.trip.code, el.value); render(); }
});
document.addEventListener("change", ev => {
  if (ev.target.name === "f_theme") applyTheme(ev.target.value);
});
document.addEventListener("submit", async ev => {
  if (ev.target.id === "joinform") {
    ev.preventDefault();
    const fd = new FormData(ev.target); const code = String(fd.get("j_code") || "").trim().toLowerCase(); const pw = String(fd.get("j_pw") || "");
    const btn = ev.target.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      const key = await tripKey(code, pw);
      const t = await S.store.getTrip(key);
      if (!t) { toast("旅行代碼或密碼不對，請再確認一次。"); btn.disabled = false; return; }
      remember(code, key, t.name || t.destination); S.joinCode = ""; openTrip(code, key);
    } catch (e) { console.error(e); toast("暫時連不上，請稍後再試。"); btn.disabled = false; }
    return;
  }
  if (ev.target.id !== "sheetform") return;
  ev.preventDefault(); if (!sheetState || !sheetState.onSave) return;
  const btn = ev.target.querySelector('button[type="submit"]'); btn.disabled = true;
  const ok = await sheetState.onSave(new FormData(ev.target));
  if (ok) closeSheet(); else if (btn) btn.disabled = false;
  render();
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
window.addEventListener("hashchange", () => {
  const h = (location.hash || "").slice(1);
  if (TABS.some(t => t[0] === h)) { S.tab = h; render(); }
});

boot();
