// Google 地圖：互動地圖（自訂編號標記）與地點搜尋自動完成（Places API New）
import { CONFIG } from "./config.js?v=202611161620";

let loading = null;
export const mapsEnabled = () => !!CONFIG.mapsKey;

export function loadMaps() {
  if (!mapsEnabled()) return Promise.reject(new Error("no-key"));
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    window.__tripbookMapsReady = () => resolve(window.google.maps);
    window.gm_authFailure = () => document.dispatchEvent(new CustomEvent("maps-auth-failed"));
    const s = document.createElement("script");
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(CONFIG.mapsKey) +
      "&v=weekly&language=zh-TW&region=TW&loading=async&callback=__tripbookMapsReady";
    s.async = true;
    s.onerror = () => reject(new Error("load-failed"));
    document.head.appendChild(s);
  });
  return loading;
}

function makePinClass(gm) {
  return class Pin extends gm.OverlayView {
    constructor(pt, onClick) {
      super();
      this.pt = pt;
      const d = document.createElement("button");
      d.type = "button";
      d.className = "pin" + (pt.faded ? " faded" : "");
      d.style.setProperty("--pin", pt.color || "var(--accent)");
      d.setAttribute("aria-label", pt.title || "");
      d.innerHTML = '<i class="b"></i><span class="t"></span>';
      d.querySelector(".t").textContent = pt.label || "";
      d.addEventListener("click", e => { e.stopPropagation(); onClick && onClick(pt); });
      gm.OverlayView.preventMapHitsAndGesturesFrom(d);
      this.div = d;
    }
    onAdd() { this.getPanes().overlayMouseTarget.appendChild(this.div); }
    draw() {
      const p = this.getProjection().fromLatLngToDivPixel(new gm.LatLng(this.pt.lat, this.pt.lng));
      if (p) { this.div.style.left = p.x + "px"; this.div.style.top = p.y + "px"; }
    }
    onRemove() { this.div.remove(); }
    setActive(on) { this.div.classList.toggle("active", on); this.div.style.zIndex = on ? 5 : ""; }
  };
}

export class TripMap {
  constructor(el, onPinClick) {
    this.el = el; this.onPinClick = onPinClick;
    this.pins = new Map(); this.line = null; this.meDot = null; this.sig = "";
    this.ready = this.init();
  }
  async init() {
    const gm = await loadMaps();
    const { Map: GMap, Polyline } = await gm.importLibrary("maps");
    this.gm = gm; this.Polyline = Polyline;
    this.Pin = makePinClass(gm);
    this.map = new GMap(this.el, {
      center: { lat: 25.0478, lng: 121.5170 }, zoom: 12,
      disableDefaultUI: true, zoomControl: true, fullscreenControl: true,
      clickableIcons: false, gestureHandling: "cooperative"
    });
  }
  async show(points, route, force) {
    await this.ready;
    const sig = JSON.stringify([points, route]);
    if (sig === this.sig && !force) return;
    const refit = force || sig !== this.sig;
    this.sig = sig;
    this.pins.forEach(p => p.setMap(null)); this.pins.clear();
    (this.lines || []).forEach(l => l.setMap(null)); this.lines = [];
    this.routeSeq = (this.routeSeq || 0) + 1;
    points.forEach(pt => { const p = new this.Pin(pt, this.onPinClick); p.setMap(this.map); this.pins.set(pt.id, p); });
    if (route && points.length > 1) {
      const my = ++this.routeSeq;
      this.drawRoute(points, route).then(lines => {
        if (my !== this.routeSeq) { lines.forEach(l => l.setMap(null)); return; }
        this.lines = lines;
      });
    }
    if (refit) this.fit(points);
  }
  // 先用 Google 路線（Routes）畫實際道路；失敗時退回虛線直線
  async drawRoute(points, mode) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#d4442a";
    const pts = points.slice(0, 27).map(p => ({ lat: p.lat, lng: p.lng }));
    const travelMode = mode === "WALKING" ? "WALKING" : "DRIVING";
    const key = "tripbook:route:" + travelMode + ":" + pts.map(p => p.lat.toFixed(5) + "," + p.lng.toFixed(5)).join("|");
    try {
      let path = null;
      try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && c.t > Date.now() - 7 * 864e5) path = c.p; } catch (e) {}
      if (!path) {
        const { Route } = await this.gm.importLibrary("routes");
        const { routes } = await Route.computeRoutes({
          origin: pts[0], destination: pts[pts.length - 1], intermediates: pts.slice(1, -1),
          travelMode, fields: ["path"]
        });
        if (!routes || !routes[0] || !routes[0].path) throw new Error("no route");
        path = routes[0].path.map(p => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lng * 1e5) / 1e5]);
        try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), p: path })); } catch (e) {}
      }
      return [new this.Polyline({
        path: path.map(([lat, lng]) => ({ lat, lng })), map: this.map,
        strokeColor: accent, strokeOpacity: .85, strokeWeight: 5
      })];
    } catch (e) {
      console.warn("route fallback", e);
      return [new this.Polyline({
        path: pts, map: this.map, strokeOpacity: 0,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: .9, strokeColor: accent, scale: 3 }, offset: "0", repeat: "14px" }]
      })];
    }
  }
  fit(points) {
    if (!this.map) return;
    if (!points.length) return;
    if (points.length === 1) { this.map.setCenter(points[0]); this.map.setZoom(15); return; }
    const b = new this.gm.LatLngBounds();
    points.forEach(p => b.extend(p));
    this.map.fitBounds(b, 48);
  }
  async focus(id) {
    await this.ready;
    const p = this.pins.get(id); if (!p) return false;
    this.pins.forEach(x => x.setActive(false));
    p.setActive(true);
    this.map.panTo({ lat: p.pt.lat, lng: p.pt.lng });
    if (this.map.getZoom() < 15) this.map.setZoom(15);
    return true;
  }
  highlight(id) { this.pins.forEach((x, k) => x.setActive(k === id)); }
  async showMe(pos) {
    await this.ready;
    if (!this.meDot) {
      const Me = makePinClass(this.gm);
      this.meDot = new Me({ lat: pos.lat, lng: pos.lng, label: "", title: "我的位置" });
      this.meDot.div.className = "medot";
      this.meDot.setMap(this.map);
    } else {
      this.meDot.pt.lat = pos.lat; this.meDot.pt.lng = pos.lng; this.meDot.draw();
    }
    this.map.panTo(pos);
  }
}

// ---------- 地點搜尋 ----------
export async function newSession() {
  const gm = await loadMaps();
  const { AutocompleteSessionToken } = await gm.importLibrary("places");
  return new AutocompleteSessionToken();
}
export async function suggest(input, token, center) {
  const gm = await loadMaps();
  const { AutocompleteSuggestion } = await gm.importLibrary("places");
  const req = { input, sessionToken: token, language: "zh-TW" };
  if (center) req.locationBias = { center, radius: 50000 };
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
  return suggestions.filter(s => s.placePrediction).slice(0, 6).map(s => {
    const p = s.placePrediction;
    return {
      pred: p,
      main: (p.mainText && p.mainText.text) || (p.text && p.text.text) || "",
      sub: (p.secondaryText && p.secondaryText.text) || ""
    };
  });
}
export async function resolvePlace(pred) {
  const place = pred.toPlace();
  await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
  return {
    placeId: place.id, name: place.displayName || "", address: place.formattedAddress || "",
    lat: place.location.lat(), lng: place.location.lng()
  };
}
