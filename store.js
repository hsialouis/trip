// 資料層：有 Firebase 設定就用 Firestore（多人即時同步），否則用本機示範模式。
import { CONFIG } from "./config.js?v=202611161733";

const FB = "https://www.gstatic.com/firebasejs/12.19.0/";
export const COLS = ["stops", "wishes", "expenses", "tasks"];

export async function createStore() {
  if (CONFIG.firebase && CONFIG.firebase.projectId) return firebaseStore();
  return localStore();
}

async function firebaseStore() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-firestore.js"),
    import(FB + "firebase-auth.js")
  ]);
  const app = initializeApp(CONFIG.firebase);
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
    });
  } catch (e) {
    db = fs.getFirestore(app);
  }
  const auth = au.getAuth(app);
  await new Promise((resolve, reject) => {
    const off = au.onAuthStateChanged(auth, u => { if (u) { off(); resolve(u); } });
    au.signInAnonymously(auth).catch(e => { off(); reject(e); });
  });

  const tripRef = k => fs.doc(db, "trips", k);
  const colRef = (k, n) => fs.collection(db, "trips", k, n);
  const docRef = (k, n, id) => fs.doc(db, "trips", k, n, id);
  const withId = d => Object.assign({ id: d.id }, d.data());

  return {
    mode: "firebase",
    async getTrip(k) {
      const s = await fs.getDoc(tripRef(k));
      return s.exists() ? withId(s) : null;
    },
    watchTrip(k, cb, err) {
      return fs.onSnapshot(tripRef(k), s => cb(s.exists() ? withId(s) : null), err);
    },
    watchCol(k, n, cb, err) {
      return fs.onSnapshot(colRef(k, n), s => cb(s.docs.map(withId)), err);
    },
    setTrip: (k, d) => fs.setDoc(tripRef(k), d),
    updateTrip: (k, d) => fs.updateDoc(tripRef(k), d),
    add: (k, n, d) => fs.addDoc(colRef(k, n), d),
    update: (k, n, id, d) => fs.updateDoc(docRef(k, n, id), d),
    del: (k, n, id) => fs.deleteDoc(docRef(k, n, id)),
    vote: (k, id, name, on) =>
      fs.updateDoc(docRef(k, "wishes", id), { votes: on ? fs.arrayUnion(name) : fs.arrayRemove(name) }),
    async deleteTrip(k) {
      for (const n of COLS) {
        const s = await fs.getDocs(colRef(k, n));
        for (const d of s.docs) await fs.deleteDoc(d.ref);
      }
      await fs.deleteDoc(tripRef(k));
    }
  };
}

// ---------- 示範模式：資料存在這台裝置 ----------
const LS = "tripbook-demo-v1";
function localStore() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) {}
  if (!data || !data.trips) data = { trips: {} };
  const listeners = new Set();
  const save = () => {
    try { localStorage.setItem(LS, JSON.stringify(data)); } catch (e) {}
    listeners.forEach(f => f());
  };
  const T = k => data.trips[k];
  const listen = fn => { listeners.add(fn); setTimeout(fn, 0); return () => listeners.delete(fn); };
  const newId = () => Math.random().toString(36).slice(2, 10);
  const clone = o => JSON.parse(JSON.stringify(o));
  return {
    mode: "local",
    async getTrip(k) { const t = T(k); return t ? Object.assign({ id: k }, clone(t.doc)) : null; },
    watchTrip(k, cb) { return listen(() => { const t = T(k); cb(t ? Object.assign({ id: k }, clone(t.doc)) : null); }); },
    watchCol(k, n, cb) {
      return listen(() => {
        const t = T(k);
        cb(t ? Object.entries(t.cols[n] || {}).map(([id, d]) => Object.assign({ id }, clone(d))) : []);
      });
    },
    async setTrip(k, d) { data.trips[k] = { doc: clone(d), cols: { stops: {}, wishes: {}, expenses: {}, tasks: {} } }; save(); },
    async updateTrip(k, d) { Object.assign(T(k).doc, clone(d)); save(); },
    async add(k, n, d) { const id = newId(); T(k).cols[n][id] = clone(d); save(); return { id }; },
    async update(k, n, id, d) { Object.assign(T(k).cols[n][id], clone(d)); save(); },
    async del(k, n, id) { delete T(k).cols[n][id]; save(); },
    async vote(k, id, name, on) {
      const w = T(k).cols.wishes[id]; const v = new Set(w.votes || []);
      if (on) v.add(name); else v.delete(name);
      w.votes = [...v]; save();
    },
    async deleteTrip(k) { delete data.trips[k]; save(); },
    async seed(k, trip, cols) {
      data.trips[k] = { doc: clone(trip), cols: { stops: {}, wishes: {}, expenses: {}, tasks: {} } };
      for (const n of Object.keys(cols)) cols[n].forEach(d => { data.trips[k].cols[n][newId()] = clone(d); });
      save();
    }
  };
}
