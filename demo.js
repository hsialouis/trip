// 示範模式的範例旅行（只在沒有設定 Firebase 時使用）
const all = ["Louis", "小安", "阿哲"];
export const DEMO = {
  password: "1234",
  trip: {
    code: "demo", demo: true, destination: "京都", name: "京都賞楓 3 日", start: "2026-12-03", end: "2026-12-05",
    members: all, currency: "JPY", home: "TWD", rate: 0.21, createdAt: 1
  },
  cols: {
    stops: [
      { date: "2026-12-03", time: "10:30", title: "抵達關西機場", place: "關西國際機場", lat: 34.4320, lng: 135.2304, note: "領行李、買 ICOCA", mode: "高鐵／火車", mins: 80, moveNote: "JR Haruka 到京都車站", createdAt: 1 },
      { date: "2026-12-03", time: "13:00", title: "京都車站寄放行李", place: "京都駅", lat: 34.9858, lng: 135.7588, mode: "公車", mins: 20, moveNote: "市巴士 206 號，五條坂下車", createdAt: 2 },
      { date: "2026-12-03", time: "14:00", title: "清水寺", place: "清水寺", lat: 34.9949, lng: 135.7850, note: "傍晚光線最好拍", mode: "步行", mins: 10, createdAt: 3 },
      { date: "2026-12-03", time: "16:00", title: "二年坂・三年坂散步", place: "三年坂", lat: 34.9963, lng: 135.7811, mode: "步行", mins: 15, createdAt: 4 },
      { date: "2026-12-03", time: "18:30", title: "晚餐：祇園", place: "祇園", lat: 35.0037, lng: 135.7751, note: "已訂位 18:30，3 人", createdAt: 5 },
      { date: "2026-12-04", time: "08:00", title: "伏見稻荷大社", place: "伏見稲荷大社", lat: 34.9671, lng: 135.7727, note: "早點去人比較少", mode: "地鐵／電車", mins: 45, moveNote: "JR 奈良線轉嵯峨野線", createdAt: 6 },
      { date: "2026-12-04", time: "11:00", title: "嵐山竹林小徑", place: "竹林の小径", lat: 35.0170, lng: 135.6713, mode: "步行", mins: 5, createdAt: 7 },
      { date: "2026-12-04", time: "12:30", title: "天龍寺", place: "天龍寺", lat: 35.0157, lng: 135.6739, mode: "地鐵／電車", mins: 40, moveNote: "嵐電＋地下鐵到四條", createdAt: 8 },
      { date: "2026-12-04", time: "16:30", title: "錦市場", place: "錦市場", lat: 35.0050, lng: 135.7649, note: "多數店家傍晚就收", createdAt: 9 },
      { date: "2026-12-05", time: "09:00", title: "永觀堂賞楓", place: "永観堂 禅林寺", lat: 35.0147, lng: 135.7942, mode: "步行", mins: 15, createdAt: 10 },
      { date: "2026-12-05", time: "11:00", title: "南禪寺・午餐湯豆腐", place: "南禅寺", lat: 35.0113, lng: 135.7943, mode: "地鐵／電車", mins: 25, createdAt: 11 },
      { date: "2026-12-05", time: "15:00", title: "京都車站取行李、回機場", place: "京都駅", lat: 34.9858, lng: 135.7588, mode: "高鐵／火車", mins: 80, moveNote: "JR Haruka 到關西機場", createdAt: 12 }
    ],
    wishes: [
      { kind: "eat", name: "湯豆腐", place: "南禅寺 順正", lat: 35.0108, lng: 135.7895, note: "可以配南禪寺行程", votes: all, done: false, createdAt: 1 },
      { kind: "eat", name: "抹茶聖代", place: "中村藤吉 京都駅店", lat: 34.9853, lng: 135.7588, note: "回程前在車站吃", votes: ["小安", "Louis"], done: false, createdAt: 2 },
      { kind: "eat", name: "錦市場玉子燒", place: "錦市場", lat: 35.0050, lng: 135.7649, votes: ["阿哲"], done: false, createdAt: 3 },
      { kind: "buy", name: "生八橋", place: "京都駅", lat: 34.9858, lng: 135.7588, note: "伴手禮，車站就買得到", votes: ["Louis", "阿哲"], done: false, createdAt: 4 },
      { kind: "buy", name: "御朱印帳", place: "伏見稲荷大社", lat: 34.9671, lng: 135.7727, votes: ["小安"], done: false, createdAt: 5 }
    ],
    expenses: [
      { title: "Haruka 車票（去程）", amount: 10800, date: "2026-12-03", payer: "Louis", cat: "交通", among: all, createdAt: 1 },
      { title: "清水寺門票", amount: 1200, date: "2026-12-03", payer: "小安", cat: "門票", among: all, createdAt: 2 },
      { title: "祇園晚餐", amount: 18000, date: "2026-12-03", payer: "阿哲", cat: "餐飲", among: all, createdAt: 3 }
    ],
    tasks: [
      { text: "訂機票", cat: "預訂", who: "Louis", done: true, createdAt: 1 },
      { text: "訂飯店（京都車站附近）", cat: "預訂", who: "小安", done: true, createdAt: 2 },
      { text: "祇園晚餐訂位", cat: "預訂", who: "阿哲", done: false, createdAt: 3 },
      { text: "確認護照效期", cat: "證件", who: "", note: "每個人自己檢查", done: false, createdAt: 4 },
      { text: "填寫 Visit Japan Web", cat: "證件", who: "", done: false, createdAt: 5 },
      { text: "行動電源、折傘", cat: "打包", who: "", done: false, createdAt: 6 }
    ]
  }
};
