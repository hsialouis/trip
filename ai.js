// AI 匯入：透過 Firebase AI Logic 呼叫 Gemini（免費方案），把文字計畫整理成結構化資料
import { CONFIG } from "./config.js?v=202611161733";

const FB = "https://www.gstatic.com/firebasejs/12.19.0/";
const MODELS = CONFIG.aiModels || ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"];
let ready = null;

export const aiEnabled = () => !!(CONFIG.firebase && CONFIG.firebase.projectId);

function init() {
  if (ready) return ready;
  ready = (async () => {
    const [appMod, aiMod, acMod] = await Promise.all([
      import(FB + "firebase-app.js"),
      import(FB + "firebase-ai.js"),
      import(FB + "firebase-app-check.js")
    ]);
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(CONFIG.firebase);
    if (CONFIG.recaptchaSiteKey) {
      try {
        acMod.initializeAppCheck(app, {
          provider: new acMod.ReCaptchaV3Provider(CONFIG.recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true
        });
      } catch (e) { /* 已初始化 */ }
    }
    const ai = aiMod.getAI(app, { backend: new aiMod.GoogleAIBackend() });
    return { aiMod, ai };
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

function isModelMissing(e) {
  const s = String((e && (e.message || e.code)) || "");
  return /not found|404|is not supported|unsupported model|does not exist/i.test(s);
}

export function aiErrorMessage(e) {
  const s = String((e && (e.message || e.code)) || e || "");
  if (/quota|RESOURCE_EXHAUSTED|429|rate/i.test(s)) return "今天的 AI 額度用完了（或太頻繁），請稍後或明天再試。也可以把計畫貼給 Claude 整理成 JSON 再匯入。";
  if (/app.?check|attestation|unauthenticated|401|403|permission/i.test(s)) return "AI 驗證沒通過。請確認 App Check（reCAPTCHA）已設定好，或稍後再試。";
  if (/JSON|Unexpected token|parse/i.test(s)) return "AI 回傳的格式不完整，請再按一次，或把計畫分段貼上。";
  return "AI 整理失敗：" + s.slice(0, 120);
}

// 回傳 AI 產生的文字（應為 JSON）
export async function generateJSON(prompt) {
  const { aiMod, ai } = await init();
  let saved = null;
  try { saved = localStorage.getItem("tripbook:ai-model"); } catch (e) {}
  const order = saved && MODELS.includes(saved) ? [saved, ...MODELS.filter(m => m !== saved)] : MODELS;
  let lastErr = null;
  for (const name of order) {
    try {
      const model = aiMod.getGenerativeModel(ai, {
        model: name,
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      });
      const res = await model.generateContent(prompt);
      try { localStorage.setItem("tripbook:ai-model", name); } catch (e) {}
      return res.response.text();
    } catch (e) {
      lastErr = e;
      if (!isModelMissing(e)) throw e;
    }
  }
  throw lastErr || new Error("no model");
}
