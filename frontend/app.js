const API = (window.API_URL || "").replace(/\/$/, "");

// ---------------- Language ----------------
let lang = "en";
try { lang = localStorage.getItem("lang") || ((navigator.language || "").startsWith("hi") ? "hi" : "en"); } catch {}
lang = new URLSearchParams(location.search).get("lang") || lang; // e.g. ?lang=hi
if (lang !== "hi") lang = "en";
const L = (en, hi) => (lang === "hi" ? hi : en);
const pick = (obj) => (obj ? (lang === "hi" ? obj.hi || obj.en : obj.en) : "");
const cname = (r) => (lang === "hi" && (r.colonyNameHi || r.nameHi)) || r.colonyName || r.name;

// Labels in index.html marked with data-i18n / data-i18n-html.
const STRINGS = {
  docTitle: ["Fair Tanker Dispatch", "निष्पक्ष टैंकर वितरण"],
  title1: ["Fair Tanker", "निष्पक्ष टैंकर"],
  title2: ["Dispatch", "वितरण"],
  subtitle: ["Fair Water Dispatch", "निष्पक्ष जल वितरण"],
  tabOverview: ["Overview", "सारांश"],
  mapTitle: ["Live ward map", "वार्ड का लाइव नक्शा"],
  listen: ["Listen", "सुनें"],
  simpleMode: ["Simple mode", "आसान मोड"],
  sideTitle: ["Cleaner Cities Stronger Communities", "स्वच्छ शहर, मज़बूत समुदाय"],
  sideText: ["Fair water for a cooler tomorrow.", "बेहतर कल के लिए सबको बराबर पानी।"],
  footer: ["Runs on AWS Lambda, API Gateway and DynamoDB", "AWS Lambda, API Gateway और DynamoDB पर चलता है"],
  resetDemo: ["Reset demo data", "डेमो डेटा रीसेट करें"],
  hero: ['The next tanker goes to the colony that got the <span class="grad-text">least water</span> this week.',
    'अगला टैंकर उस कॉलोनी को जाएगा जिसे इस हफ़्ते <span class="grad-text">सबसे कम पानी</span> मिला।'],
  live: ["Live System", "लाइव सिस्टम"],
  tabColony: ["Colony Requests", "कॉलोनी अनुरोध"],
  tabDispatcher: ["Dispatch Queue", "प्राथमिकता सूची"],
  tabDriver: ["Tanker Fleet", "टैंकर बेड़ा"],
  tabOfficer: ["Ward Officer", "वार्ड अधिकारी"],
  tabLedger: ["Public Ledger", "सार्वजनिक रिकॉर्ड"],
  signIn: ["Sign in", "साइन इन"],
  signInHelp: ["For colony representatives, tanker drivers and dispatchers. Anyone can view without signing in.",
    "कॉलोनी प्रतिनिधि, टैंकर ड्राइवर और डिस्पैचर के लिए। देखने के लिए साइन इन ज़रूरी नहीं।"],
  phone: ["Mobile number", "मोबाइल नंबर"],
  pin: ["PIN", "पिन"],
  yourColony: ["Your colony", "आपकी कॉलोनी"],
  pastDeliveries: ["Past deliveries", "पिछली डिलीवरी"],
  fleet: ["Fleet", "टैंकर बेड़ा"],
  queue: ["Priority queue", "प्राथमिकता सूची"],
  queueHelp: ["Greatest need first: recent water per person (tanker + piped; tanker water counts fully for 3 days, then less each day until day 10), divided by any published priority weight; then who asked first.",
    "सबसे ज़्यादा ज़रूरत पहले: हाल का प्रति व्यक्ति पानी (टैंकर + पाइप; टैंकर का पानी 3 दिन पूरा, फिर 10वें दिन तक धीरे-धीरे कम गिना जाता है), प्रकाशित प्राथमिकता से भाग; फिर जिसने पहले माँगा।"],
  inProgress: ["In progress", "चल रहे"],
  ledgerTitle: ["Recent water received", "हाल में मिला पानी"],
  ledgerHelp: ["Litres per person (5 people per household). Tanker water counts fully for 3 days, then less each day until day 10. Each delivery is reported separately by the driver and the colony.",
    "प्रति व्यक्ति लीटर (हर घर में 5 लोग)। टैंकर का पानी 3 दिन पूरा, फिर 10वें दिन तक कम गिना जाता है। हर डिलीवरी ड्राइवर और कॉलोनी दोनों अलग-अलग दर्ज करते हैं।"],
  ledgerLine: ["20 L/person line", "20 लीटर/व्यक्ति रेखा"],
};
// Hero heading for each section of the app.
const PAGES = {
  overview: [['Every litre. <span class="accent">Fairly delivered.</span>', 'हर बूँद। <span class="accent">निष्पक्ष वितरण।</span>'],
    ["Prioritising the colonies that need water most.", "सबसे ज़रूरतमंद बस्तियों को पहले पानी।"]],
  dispatcher: [['Dispatch <span class="accent">queue</span>', 'प्राथमिकता <span class="accent">सूची</span>'],
    ["Greatest need first. Every skip of the queue is published.", "सबसे ज़्यादा ज़रूरत पहले। सूची से हटकर भेजना सार्वजनिक होता है।"]],
  colony: [['Colony <span class="accent">requests</span>', 'कॉलोनी <span class="accent">अनुरोध</span>'],
    ["Ask for water in your own words, track the tanker, confirm what arrived.", "अपनी भाषा में पानी माँगें, टैंकर देखें, जो पहुँचा उसकी पुष्टि करें।"]],
  driver: [['Tanker <span class="accent">fleet</span>', 'टैंकर <span class="accent">बेड़ा</span>'],
    ["Fill, deliver, prove it: litres, GPS and photo on every trip.", "भरें, पहुँचाएँ, साबित करें: हर ट्रिप पर लीटर, GPS और फ़ोटो।"]],
  officer: [['Ward <span class="accent">officer</span>', 'वार्ड <span class="accent">अधिकारी</span>'],
    ["Alerts, disputes, complaints and colony settings, all on the record.", "अलर्ट, विवाद, शिकायतें और कॉलोनी सेटिंग, सब रिकॉर्ड में।"]],
  ledger: [['Public <span class="accent">ledger</span>', 'सार्वजनिक <span class="accent">रिकॉर्ड</span>'],
    ["Who got how much water, how fair it was, and every decision behind it.", "किसे कितना पानी मिला, कितना निष्पक्ष था, और हर फ़ैसला।"]],
};
function setHero() {
  const [title, lead] = PAGES[currentView] || PAGES.overview;
  $("hero-title").innerHTML = L(...title);
  $("hero-lead").textContent = L(...lead);
}

function applyStatic() {
  document.documentElement.lang = lang;
  document.title = L(...STRINGS.docTitle);
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = L(...STRINGS[el.dataset.i18n])));
  document.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = L(...STRINGS[el.dataset.i18nHtml])));
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  if (typeof currentView !== "undefined") setHero();
}
document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.lang === lang) return;
  lang = b.dataset.lang;
  try { localStorage.setItem("lang", lang); } catch {}
  applyStatic();
  renderAccount();
  renderColonyOptions();
  moveIndicator();
  document.body.classList.remove("quiet");
  refresh();
}));

const STATUS_LABEL = {
  PENDING: ["Waiting for tanker", "टैंकर का इंतज़ार"],
  ASSIGNED: ["Tanker assigned", "टैंकर तय"],
  ON_THE_WAY: ["On the way", "रास्ते में"],
  DELIVERED: ["Delivered", "पहुँच गया"],
};
const STEPS = ["PENDING", "ASSIGNED", "ON_THE_WAY", "DELIVERED"];
const LOW_LPP = 20; // recent litres per person considered critically low
const OPEN = ["PENDING", "ASSIGNED", "ON_THE_WAY"];
const hoursSince = (iso) => (Date.now() - new Date(iso)) / 3600000;
// "Load 2 of 3": big colonies get several tankers, one request at a time.
const loadChip = (r) => (r.loadsTarget > 1 ? `<span class="chip chip-violet">${ic("truck", "w-3 h-3")} ${L(
  `Load ${r.loadNumber || 1} of ${r.loadsTarget}${r.litresTarget ? ` · needs ~${fmtL(r.litresTarget)} L` : ""}`,
  `${r.loadsTarget} में से ${r.loadNumber || 1}वाँ टैंकर${r.litresTarget ? ` · ~${fmtL(r.litresTarget)} लीटर चाहिए` : ""}`)}</span>` : "");
const waitChip = (r) => (r.status === "PENDING" && hoursSince(r.createdAt) > 24 ? `<span class="chip chip-red">${ic("alert", "w-3 h-3")} ${L(
  "Waiting over 24 h · escalated to ward officer", "24 घंटे से ज़्यादा इंतज़ार · वार्ड अधिकारी को भेजा")}</span>` : "");

const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-3 3 0-2-1-4-3-6 0 4-4 6-4 12 0 4 3 7 7 7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  drop: '<path d="M12 2.5s-7 7.8-7 12.5a7 7 0 0 0 14 0c0-4.7-7-12.5-7-12.5z"/>',
  truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  party: '<path d="M4 20 9 7l8 8-13 5z"/><path d="M14 4v2M20 10h-2M18 4l-2 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  leaf: '<path d="M20 4C10 4 4 9 4 16c0 1.5.3 2.8.9 4C7 14 11 11 16 9c-4 3-7 6.5-8.6 11 .9.3 1.8.4 2.6.4C17 20.4 20 13 20 4z"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M7 8h5M15 10h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const ic = (name, cls = "w-4 h-4") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const locale = () => L("en-IN", "hi-IN");
const fmtL = (n) => (n || 0).toLocaleString(locale());
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }) : "");
const ago = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (mins < 1) return L("just now", "अभी");
  if (mins < 60) return L(`${mins} min`, `${mins} मिनट`);
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 48) return L(`${h} h${m ? ` ${m} min` : ""}`, `${h} घंटे${m ? ` ${m} मिनट` : ""}`);
  return L(`${Math.floor(h / 24)} days`, `${Math.floor(h / 24)} दिन`);
};
const until = (iso) => {
  const mins = Math.round((new Date(iso) - Date.now()) / 60000);
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? L(`${h} h ${m} min`, `${h} घंटे ${m} मिनट`) : L(`${m} min`, `${m} मिनट`);
};
const distanceKm = (lat1, lon1, lat2, lon2) => {
  const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};
const fmtKm = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

// How trustworthy a delivery figure is: both sides agree, they disagree, or only one side reported.
const VERIFICATION = {
  verified: ["chip-green", "check", "Verified by driver and colony", "ड्राइवर और कॉलोनी दोनों ने पुष्टि की"],
  disputed: ["chip-red", "alert", "Disputed: driver and colony differ", "विवादित: ड्राइवर और कॉलोनी अलग"],
  driver_only: ["chip-amber", "truck", "Driver reported only", "सिर्फ़ ड्राइवर ने बताया"],
  colony_only: ["chip-amber", "users", "Colony reported only", "सिर्फ़ कॉलोनी ने बताया"],
  dispatcher: ["chip-violet", "info", "Recorded by dispatcher", "डिस्पैचर ने दर्ज किया"],
  auto: ["chip-amber", "clock", "Auto-closed · nobody reported", "अपने आप बंद · किसी ने नहीं बताया"],
  resolved: ["chip-violet", "shield", "Settled by ward officer", "वार्ड अधिकारी ने निपटाया"],
};
const verificationTag = (r) => {
  const v = VERIFICATION[r.verification];
  return v ? `<span class="chip ${v[0]}">${ic(v[1], "w-3 h-3")} ${L(v[2], v[3])}</span>` : "";
};
const readings = (r) => {
  const parts = [];
  if (r.driverLitres != null) parts.push(L(`Driver ${fmtL(r.driverLitres)} L`, `ड्राइवर ${fmtL(r.driverLitres)} लीटर`));
  if (r.colonyLitres != null) parts.push(L(`Colony ${fmtL(r.colonyLitres)} L`, `कॉलोनी ${fmtL(r.colonyLitres)} लीटर`));
  if (r.verification === "disputed") parts.push(L(`counted ${fmtL(r.litresDelivered)} L (average)`, `गिना ${fmtL(r.litresDelivered)} लीटर (औसत)`));
  let gps = "";
  if (r.driverDistanceM != null) {
    gps = r.driverFarFromColony
      ? `<span class="chip chip-red">${ic("alert", "w-3 h-3")} ${L(`GPS ${fmtKm(r.driverDistanceM)} from colony`, `GPS कॉलोनी से ${fmtKm(r.driverDistanceM)} दूर`)}</span>`
      : `<span class="chip chip-green">${ic("pin", "w-3 h-3")} ${L("GPS at colony", "GPS कॉलोनी पर")}</span>`;
  } else if ((r.history || []).some((h) => h.action === "driver_reported")) { // reported from the app without a GPS fix
    gps = `<span class="chip chip-amber">${L("No GPS", "GPS नहीं")}</span>`;
  }
  return `${parts.length ? `<div class="text-xs muted mt-1">${parts.join(" · ")}</div>` : ""}${gps ? `<div class="mt-1">${gps}</div>` : ""}`;
};

// Every state change is logged with who did it (name, role, last 4 digits of their phone).
const ACTIONS = {
  requested: ["Requested", "अनुरोध किया"], assigned: ["Tanker assigned", "टैंकर तय"],
  on_the_way: ["Left for colony", "कॉलोनी के लिए निकला"], driver_reported: ["Driver reported delivery", "ड्राइवर ने डिलीवरी दर्ज की"],
  colony_reported: ["Colony reported", "कॉलोनी ने दर्ज किया"], dispatcher_closed: ["Closed by dispatcher", "डिस्पैचर ने बंद किया"],
  auto_closed: ["Auto-closed", "अपने आप बंद"], requeued: ["Back in queue", "फिर सूची में"],
  cancelled: ["Cancelled", "रद्द किया"], follow_up: ["Next load queued", "अगला टैंकर सूची में"],
  filled: ["Filled at hydrant", "हाइड्रेंट पर भरा"], photo: ["Photo added", "फ़ोटो जोड़ी"], resolved: ["Settled by ward officer", "वार्ड अधिकारी ने निपटाया"],
};
const ROLE = { dispatcher: ["Dispatcher", "डिस्पैचर"], driver: ["Driver", "ड्राइवर"], colony: ["Colony rep", "कॉलोनी प्रतिनिधि"], officer: ["Ward officer", "वार्ड अधिकारी"], system: ["System", "सिस्टम"] };
const timeline = (r) => (r.history && r.history.length ? `
  <details class="why mt-3" data-why="h-${esc(r.requestId)}" ${openWhy.has(`h-${r.requestId}`) ? "open" : ""}>
    <summary>${ic("clock", "w-3.5 h-3.5")} ${L("History", "इतिहास")} (${r.history.length}) <span class="chev">${ic("chev", "w-3.5 h-3.5")}</span></summary>
    <ol class="timeline why-body">${r.history.map((h) => `<li>
      <div><b>${ACTIONS[h.action] ? L(...ACTIONS[h.action]) : esc(h.action)}</b>${h.detail ? ` · <span class="muted">${esc(h.detail)}</span>` : ""}</div>
      <div class="t-when">${fmtTime(h.at)} · ${esc(h.by)} (${ROLE[h.role] ? L(...ROLE[h.role]) : esc(h.role)}${h.ref ? `, ${esc(h.ref)}` : ""})</div>
    </li>`).join("")}</ol>
  </details>` : "");
const requeuedNote = (r) => (r.requeuedBy ? L(
  `Tanker ${esc(r.missedTankerId || "")} didn't arrive. Back in the queue, original place kept.`,
  `टैंकर ${esc(r.missedTankerId || "")} नहीं पहुँचा। फिर से सूची में, पुरानी जगह बरकरार।`) : "");
const badge = (status) => {
  const label = STATUS_LABEL[status];
  return `<span class="badge ${esc(status)}">${label ? L(...label) : esc(status)}</span>`;
};

// ---------------- Sign-in session ----------------
let session = null; // { token, user: { phone, name, role, colonyId?, tankerId? } }
try { session = JSON.parse(localStorage.getItem("session") || "null"); } catch {}
const me = () => (session && session.user) || null;
const isRole = (...roles) => !!me() && roles.includes(me().role);
function setSession(s) {
  session = s;
  try { s ? localStorage.setItem("session", JSON.stringify(s)) : localStorage.removeItem("session"); } catch {}
  renderAccount();
}

async function api(path, options = {}) {
  const headers = {};
  if (options.body) headers["content-type"] = "application/json";
  if (session) headers.authorization = `Bearer ${session.token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && session && path !== "/auth/login") {
    setSession(null); // expired or removed account
    refresh();
  }
  if (!res.ok) throw new Error((data && data.error) || L(`Request failed (${res.status})`, `अनुरोध विफल (${res.status})`));
  return data;
}
const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body || {}) });

function toast(msg, ok = true) {
  const t = $("toast");
  t.innerHTML = `<span class="t-icon">${ic(ok ? "check" : "x", "w-3.5 h-3.5")}</span><span>${esc(msg)}</span>`;
  t.className = `show ${ok ? "ok" : "err"}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 3500);
}

// Set when someone types in a form; the live refresh waits until they finish (an action succeeds or they leave).
let formDirty = false;
document.addEventListener("input", (e) => { if (e.target.closest && e.target.closest("form, .panel, #plan-box")) formDirty = true; });

async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    await fn();
    formDirty = false;
  } catch (e) {
    toast(e.message, false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------------- Animated numbers and bars ----------------
// Remembers the last shown value per key so auto-refresh animates from old to new, not from zero.
const lastValues = new Map();
function animateCounts(root) {
  root.querySelectorAll("[data-count]").forEach((el) => {
    const to = parseFloat(el.dataset.count) || 0;
    const dec = parseInt(el.dataset.dec || "0", 10);
    const key = el.dataset.key;
    const from = key && lastValues.has(key) ? lastValues.get(key) : 0;
    if (key) lastValues.set(key, to);
    const fmt = (v) => v.toLocaleString(locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (from === to) { el.textContent = fmt(to); return; }
    const start = performance.now(), dur = 900;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  root.querySelectorAll("[data-w]").forEach((el) => {
    const key = el.dataset.key;
    if (key && lastValues.has(key)) el.style.width = `${lastValues.get(key)}%`;
    if (key) lastValues.set(key, parseFloat(el.dataset.w));
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.width = `${el.dataset.w}%`)));
  });
}
const num = (value, key, dec = 0) => `<span data-count="${value}" data-dec="${dec}" data-key="${esc(key)}">0</span>`;

// ---------------- Tabs ----------------
let currentView = "overview";
function moveIndicator() {
  const active = document.querySelector(".tab.active");
  const ind = $("seg-indicator");
  if (!active || !ind) return;
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
}
function showView(view) {
  currentView = view;
  formDirty = false;
  document.body.classList.remove("quiet");
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${view}`));
  document.querySelectorAll(".tab").forEach((b) => { const on = b.dataset.view === view; b.classList.toggle("active", on); on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"); });
  moveIndicator();
  setHero();
  window.scrollTo({ top: 0, behavior: "smooth" });
  try { localStorage.setItem("view", view); } catch {}
  refresh();
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
window.addEventListener("resize", moveIndicator);
document.fonts && document.fonts.ready.then(moveIndicator);

// ---------------- Account button and sign-in dialog ----------------
const HOME_VIEW = { colony: "colony", driver: "driver", dispatcher: "dispatcher", officer: "officer" };
function renderAccount() {
  const u = me();
  $("account").innerHTML = u
    ? `<button id="btn-account" class="account-btn" title="${L("Sign out", "साइन आउट")}">
        <span class="role-dot role-${esc(u.role)}"></span><span class="who">${esc(u.name)}</span>${ic("logout", "w-3.5 h-3.5 flex-none")}</button>`
    : `<button id="btn-account" class="account-btn">${ic("lock", "w-3.5 h-3.5")}<span>${L("Sign in", "साइन इन")}</span></button>`;
  $("btn-account").onclick = () => {
    if (!me()) return openLogin();
    setSession(null);
    toast(L("Signed out", "साइन आउट हो गया"));
    refresh();
  };
}
const signInPrompt = (en, hi) => `<div class="view-only"><span class="inline-flex items-center gap-2">${ic("lock")} ${L(en, hi)}</span>
  <button class="btn btn-ghost py-2" data-open-login>${L("Sign in", "साइन इन")}</button></div>`;
document.addEventListener("click", (e) => { if (e.target.closest("[data-open-login]")) openLogin(); });

const DEMO_ACCOUNTS = [
  ["9000000001", "246810", "Dispatcher", "डिस्पैचर"],
  ["9000000002", "135790", "Ward officer", "वार्ड अधिकारी"],
  ["9000000011", "111111", "Driver, tanker tnk-01", "ड्राइवर, टैंकर tnk-01"],
  ["9000000101", "123456", "Rep, Shanti Nagar (…107 for others)", "प्रतिनिधि, शांति नगर (बाकी …107 तक)"],
];
function openLogin() {
  $("login-modal").hidden = false;
  const demo = $("demo-accounts");
  demo.hidden = !window.DEMO;
  if (window.DEMO) {
    demo.innerHTML = `<div class="text-xs muted font-semibold">${L("Demo accounts (tap to fill)", "डेमो खाते (भरने के लिए दबाएँ)")}</div>` +
      DEMO_ACCOUNTS.map(([phone, pin, en, hi]) => `<button type="button" class="demo-row" data-phone="${phone}" data-pin="${pin}">
        <span>${L(en, hi)}</span><span class="muted">${phone} · ${pin}</span></button>`).join("");
    demo.querySelectorAll("[data-phone]").forEach((b) => (b.onclick = () => {
      $("login-phone").value = b.dataset.phone; $("login-pin").value = b.dataset.pin;
    }));
  }
  setTimeout(() => $("login-phone").focus(), 50);
}
const closeLogin = () => ($("login-modal").hidden = true);
$("login-close").onclick = closeLogin;
$("login-modal").addEventListener("click", (e) => { if (e.target.id === "login-modal") closeLogin(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLogin(); });
$("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run($("login-submit"), async () => {
    const res = await post("/auth/login", { phone: $("login-phone").value, pin: $("login-pin").value });
    setSession(res);
    $("login-pin").value = "";
    closeLogin();
    toast(L(`Signed in as ${res.user.name}`, `${res.user.name} के रूप में साइन इन`));
    if (res.user.colonyId) { try { localStorage.setItem("colonyId", res.user.colonyId); } catch {} }
    showView(HOME_VIEW[res.user.role] || currentView);
  });
});

let lastUpdated = 0;
function refresh() {
  const loaders = { overview: loadOverview, colony: loadColony, dispatcher: loadDispatcher, driver: loadDriver, officer: loadOfficer, ledger: loadLedger };
  run(null, async () => { await loaders[currentView](); lastUpdated = Date.now(); tickUpdated(); });
  loadHeat().catch(() => ($("heat-banner").hidden = true));
}

// Live mode: refresh the current view quietly unless the user is typing or choosing something.
function tickUpdated() {
  if (!lastUpdated) return;
  const s = Math.round((Date.now() - lastUpdated) / 1000);
  $("updated").textContent = s < 5 ? `· ${L("just now", "अभी")}` : `· ${L(`${s}s ago`, `${s} से. पहले`)}`;
}
setInterval(tickUpdated, 1000);
setInterval(() => {
  if (document.hidden) return;
  const a = document.activeElement;
  if (a && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName)) return;
  if (listening || formDirty || planPreview) return;
  document.body.classList.add("quiet");
  refresh();
}, 20000);

// ---------------- Colony view ----------------
let colonies = [];
function renderColonyOptions() {
  const sel = $("colony-select");
  if (!colonies.length) return;
  const keep = sel.value;
  sel.innerHTML = colonies.map((c) => `<option value="${esc(c.colonyId)}">${esc(cname(c))} (${c.households} ${L("households", "घर")})</option>`).join("");
  if (keep) sel.value = keep;
}
async function loadColonies() {
  colonies = await api("/colonies");
  let saved = null;
  try { saved = localStorage.getItem("colonyId"); } catch {}
  renderColonyOptions();
  if (saved && colonies.some((c) => c.colonyId === saved)) $("colony-select").value = saved;
}
$("colony-select").addEventListener("change", (e) => {
  try { localStorage.setItem("colonyId", e.target.value); } catch {}
  document.body.classList.remove("quiet");
  refresh();
});

function stepper(status) {
  const idx = Math.max(0, STEPS.indexOf(status));
  return `<div class="stepper" style="--p:${idx / (STEPS.length - 1)}">
    <div class="stepper-track"><div class="stepper-fill"></div></div>
    ${STEPS.map((s, i) => {
      const cls = i < idx ? "done" : i === idx ? "current" : "";
      return `<div class="step ${cls}"><div class="step-dot">${i < idx ? ic("check", "w-4 h-4") : i + 1}</div>
        <div class="step-label">${L(...STATUS_LABEL[s])}</div></div>`;
    }).join("")}
  </div>`;
}

// The other side can still add its reading for this long after a delivery (matches the API).
const SECOND_READING_MS = 72 * 3600 * 1000;
const needsColonyReading = (r) => r.status === "DELIVERED" && r.colonyLitres == null &&
  ["driver_only", "auto"].includes(r.verification) && Date.now() - new Date(r.deliveredAt) < SECOND_READING_MS;
const needsDriverReading = (r) => r.status === "DELIVERED" && r.driverLitres == null &&
  r.verification === "colony_only" && Date.now() - new Date(r.deliveredAt) < SECOND_READING_MS;

async function loadColony() {
  if (!colonies.length) await loadColonies();
  const sel = $("colony-select");
  const myColony = isRole("colony") ? me().colonyId : null;
  if (myColony) sel.value = myColony;
  sel.disabled = !!myColony; // a colony rep only sees and acts for their own colony
  const colonyId = sel.value;
  if (!colonyId) return;
  const reqs = await api(`/requests?colonyId=${encodeURIComponent(colonyId)}`);
  const open = reqs.find((r) => OPEN.includes(r.status));
  const box = $("colony-status");
  const isRep = myColony === colonyId;
  const toCheck = isRep ? reqs.find(needsColonyReading) : null;

  // The driver (or auto-release) closed a delivery: ask the colony for its own reading. Shown in its own card,
  // so it still appears when the next load for a big colony is already waiting.
  const check = $("colony-check");
  check.hidden = !toCheck;
  if (toCheck) {
    check.innerHTML = `
      <h2 class="card-title"><span class="icon-box">${ic("drop")}</span>${L("Did the water arrive?", "क्या पानी पहुँचा?")}</h2>
      <p class="text-sm muted mt-1">${toCheck.verification === "auto"
        ? L(`Tanker ${esc(toCheck.tankerId)} was closed automatically. Tell us how much really arrived.`, `टैंकर ${esc(toCheck.tankerId)} अपने आप बंद हुआ। बताइए असल में कितना पानी आया।`)
        : L(`The driver of ${esc(toCheck.tankerId)} reported a delivery at ${fmtTime(toCheck.deliveredAt)}. Your reading is checked against theirs.`,
          `${esc(toCheck.tankerId)} के ड्राइवर ने ${fmtTime(toCheck.deliveredAt)} पर डिलीवरी दर्ज की। आपकी संख्या उनसे मिलाई जाएगी।`)}</p>
      <label class="block font-semibold mt-4" for="reading-litres">${L("Litres received", "कितना पानी मिला (लीटर)")}</label>
      <input id="reading-litres" type="number" inputmode="numeric" min="1" max="10000" class="field text-lg mt-2" placeholder="10000">
      <button id="btn-reading" class="btn btn-success btn-lg w-full mt-3">${ic("check", "w-5 h-5")} ${L("Submit reading", "दर्ज करें")}</button>`;
    $("btn-reading").onclick = (e) => run(e.currentTarget, async () => {
      const r = await post(`/requests/${toCheck.requestId}/confirm`, { litresDelivered: parseInt($("reading-litres").value, 10) });
      toast(r.verification === "disputed" ? L("Recorded. Your number differs from the driver's, so it is marked disputed.", "दर्ज हुआ। आपकी संख्या ड्राइवर से अलग है, इसलिए विवादित।")
        : L("Thank you, recorded", "धन्यवाद, दर्ज हो गया"), r.verification !== "disputed");
      loadColony();
    });
  }
  if (!open) {
    renderRequestForm(box, colonyId);
  } else {
    const canConfirm = isRep && (open.status === "ASSIGNED" || open.status === "ON_THE_WAY");
    box.innerHTML = `
      <div class="flex items-center justify-between gap-2 flex-wrap"><span class="inline-flex flex-wrap gap-2 items-center">${badge(open.status)}${loadChip(open)}</span>
        <span class="text-xs muted inline-flex items-center gap-1" title="${fmtTime(open.createdAt)}">${ic("clock", "w-3.5 h-3.5")} ${L(`Requested ${ago(open.createdAt)} ago`, `${ago(open.createdAt)} पहले माँगा`)}</span></div>
      ${stepper(open.status)}
      ${open.note ? `<div class="note mt-5">${ic("chat")}<span>“${esc(open.note)}”</span></div>` : ""}
      ${open.tankerId ? `
        <div class="eta reveal">
          <div class="icon-box green" style="width:48px;height:48px;border-radius:14px">${ic("truck", "w-6 h-6")}</div>
          <div class="flex-1 min-w-0">
            <div class="text-xs muted font-semibold uppercase tracking-wider">${L(`Tanker ${esc(open.tankerId)} · expected at`, `टैंकर ${esc(open.tankerId)} · अनुमानित समय`)}</div>
            <div class="eta-time grad-text">${esc(open.eta)}</div>
          </div>
        </div>` : `
        ${open.requeuedBy ? `<div class="note mt-5" style="border-color:#f5d48a"><span class="text-amber-600">${ic("info")}</span><span>${requeuedNote(open)}</span></div>` : ""}
        <div class="panel mt-5 flex items-center gap-3"><span class="pulse-dot" style="background:var(--amber)"></span>
          <span>${L("The dispatcher will assign a tanker soon.", "जल्द ही टैंकर भेजा जाएगा।")}</span></div>
        ${isRep ? `<button id="btn-cancel" class="btn btn-danger w-full mt-3">${ic("x")} ${L("We have enough water now — cancel request", "अब पानी काफ़ी है — अनुरोध रद्द करें")}</button>` : ""}`}
      ${canConfirm ? `
        <div class="mt-5 space-y-3">
          <label class="block font-semibold" for="litres">${L("Litres received", "कितना पानी मिला (लीटर)")}</label>
          <input id="litres" type="number" inputmode="numeric" min="1" max="10000" value="10000" class="field text-lg">
          <button id="btn-confirm" class="btn btn-success btn-lg w-full">${ic("check", "w-5 h-5")} ${L("Confirm delivery", "पानी मिल गया")}</button>
        </div>` : ""}
      ${!isRep && open.tankerId ? `<div class="mt-5">${signInPrompt("Only this colony's representative can confirm the delivery.", "डिलीवरी की पुष्टि सिर्फ़ इस कॉलोनी के प्रतिनिधि कर सकते हैं।")}</div>` : ""}
      ${timeline(open)}`;
    if ($("btn-cancel")) $("btn-cancel").onclick = (e) => run(e.currentTarget, async () => {
      await post(`/requests/${open.requestId}/cancel`, { reason: "colony has enough water" });
      toast(L("Request cancelled. The tanker can go to someone who needs it more.", "अनुरोध रद्द। टैंकर अब किसी ज़्यादा ज़रूरतमंद को जा सकता है।"));
      loadColony();
    });
    if (canConfirm) {
      $("btn-confirm").onclick = (e) => run(e.currentTarget, async () => {
        const litres = parseInt($("litres").value, 10);
        await post(`/requests/${open.requestId}/confirm`, { litresDelivered: litres });
        toast(L("Delivery confirmed. The driver's report will be checked against yours.", "पुष्टि हो गई। ड्राइवर की रिपोर्ट से मिलाई जाएगी।"));
        loadColony();
      });
    }
  }

  const past = reqs.filter((r) => r.status === "DELIVERED");
  const hist = $("colony-history");
  hist.innerHTML = past.length
    ? past.map((r, i) => `<li class="panel reveal" style="--i:${i}">
        <div class="flex justify-between items-start gap-3">
          <div class="min-w-0">
            <div class="inline-flex items-center gap-2"><span class="text-emerald-700">${ic("drop")}</span>${fmtTime(r.deliveredAt)}</div>
            <div class="mt-1.5">${verificationTag(r)}</div>${readings(r)}
          </div>
          <b class="text-base whitespace-nowrap">${num(r.litresDelivered || 0, `hist-${r.requestId}`)} ${L("L", "लीटर")}</b>
        </div>${timeline(r)}</li>`).join("")
    : `<li class="empty">${ic("drop", "w-7 h-7")}${L("No deliveries yet.", "अभी तक कोई डिलीवरी नहीं।")}</li>`;
  animateCounts(hist);
  renderComplaints(colonyId, isRep);
}

const COMPLAINT_OPTIONS = [["no_show", "Tanker did not come", "टैंकर नहीं आया"], ["short_water", "Less water than recorded", "दर्ज से कम पानी"],
  ["dirty_water", "Dirty water", "गंदा पानी"], ["bribe", "Asked for money", "पैसे माँगे"], ["behaviour", "Bad behaviour", "बुरा बर्ताव"], ["other", "Other", "अन्य"]];
async function renderComplaints(colonyId, isRep) {
  const box = $("colony-complaints");
  const head = `<h2 class="card-title"><span class="icon-box violet">${ic("chat")}</span>${L("Complaints", "शिकायत")}</h2>`;
  if (!isRep) {
    box.innerHTML = `${head}<p class="text-sm muted mt-1 mb-4">${L("The colony representative can report a missed tanker, short or dirty water, or a demand for money. Every complaint gets a ticket and its outcome is public.",
      "कॉलोनी प्रतिनिधि टैंकर न आने, कम या गंदे पानी, या पैसे माँगने की शिकायत कर सकते हैं। हर शिकायत को टिकट मिलता है और नतीजा सार्वजनिक होता है।")}</p>
      ${signInPrompt("Sign in as this colony's representative to complain.", "शिकायत के लिए इस कॉलोनी के प्रतिनिधि के रूप में साइन इन करें।")}`;
    return;
  }
  const mine = (await api("/complaints")).filter((c) => c.mine);
  box.innerHTML = `${head}
    <form id="complaint-form" class="mt-4 space-y-2">
      <select name="type" class="field" aria-label="${esc(L("Type of problem", "समस्या का प्रकार"))}">${COMPLAINT_OPTIONS.map(([v, en, hi]) => `<option value="${v}">${L(en, hi)}</option>`).join("")}</select>
      <textarea name="text" rows="3" maxlength="1000" aria-label="${esc(L("Describe the problem", "समस्या बताइए"))}" class="field resize-none" placeholder="${esc(L("What happened? When? Which tanker?", "क्या हुआ? कब? कौन सा टैंकर?"))}" required></textarea>
      <button class="btn btn-ghost w-full" type="submit">${ic("send")} ${L("Submit complaint", "शिकायत भेजें")}</button>
    </form>
    ${mine.length ? `<ul class="space-y-2 mt-4 text-sm">${mine.map((c) => `<li class="panel">
      <div class="flex justify-between gap-2 flex-wrap"><b>${esc(c.complaintId)}</b>${c.status === "RESOLVED"
        ? `<span class="chip chip-green">${ic("check", "w-3 h-3")} ${L("Resolved", "निपटा")}</span>` : `<span class="chip chip-amber">${L("Open", "खुला")}</span>`}</div>
      <div class="muted text-xs">${fmtTime(c.createdAt)}</div><div class="mt-1">${esc(c.text || "")}</div>
      ${c.resolutionNote ? `<div class="mt-1 text-emerald-700">${esc(c.resolutionNote)}</div>` : ""}</li>`).join("")}</ul>` : ""}`;
  $("complaint-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    run(f.querySelector("button"), async () => {
      const c = await post("/complaints", { type: f.type.value, text: f.text.value });
      toast(L(`Complaint registered. Ticket ${c.complaintId}`, `शिकायत दर्ज। टिकट ${c.complaintId}`));
      renderComplaints(colonyId, isRep);
    });
  };
}

// Voice / free-text request. Speech-to-text runs in the browser (free); the Lambda
// matches the colony name and picks out urgency words. The ranking is never changed by this.
const draft = { text: "", parse: null };
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let listening = false;

const signalChips = (signals) => (signals || []).map((s) =>
  `<span class="chip chip-red">${ic("alert", "w-3 h-3")} ${esc(pick(s))}</span>`).join("");

function renderRequestForm(box, colonyId) {
  const isRep = isRole("colony") && me().colonyId === colonyId;
  if (!isRep && !isRole("dispatcher")) {
    box.innerHTML = `
      <h2 class="card-title"><span class="icon-box">${ic("drop")}</span>${L("No open request", "कोई खुला अनुरोध नहीं")}</h2>
      <p class="text-sm muted mt-1 mb-4">${L("Water is requested by the colony's registered representative, or by the dispatcher on the colony's behalf (for example after a phone call).",
        "पानी का अनुरोध कॉलोनी के पंजीकृत प्रतिनिधि करते हैं, या डिस्पैचर कॉलोनी की ओर से (जैसे फ़ोन आने पर)।")}</p>
      ${signInPrompt("Sign in to request water.", "पानी मँगाने के लिए साइन इन करें।")}`;
    return;
  }
  const p = draft.parse;
  box.innerHTML = `
    <h2 class="card-title"><span class="icon-box">${ic("drop")}</span>${L("Need water?", "पानी चाहिए?")}</h2>
    ${isRep ? "" : `<p class="chip chip-violet mt-2">${ic("info", "w-3 h-3")} ${L("Requesting on behalf of this colony", "इस कॉलोनी की ओर से अनुरोध")}</p>`}
    <p class="text-sm muted mt-1">${L("Type or speak in your own words. Hindi or English both work.", "अपनी भाषा में लिखें या बोलें। हिंदी या अंग्रेज़ी, दोनों चलेंगी।")}</p>
    <div class="flex gap-3 mt-4">
      <textarea id="req-text" rows="3" maxlength="500" aria-label="${esc(L("Your request", "आपका अनुरोध"))}" class="field flex-1 resize-none"
        placeholder="${esc(L("e.g. No water in Shanti Nagar for 3 days, children are sick", "जैसे: शांति नगर में 3 दिन से पानी नहीं आया, बच्चे बीमार हैं"))}">${esc(draft.text)}</textarea>
      ${SpeechRec ? `<button id="btn-mic" title="${L("Speak", "बोलें")}" aria-label="${L("Speak", "बोलें")}" class="mic">${ic("mic", "w-7 h-7")}</button>` : ""}
    </div>
    <button id="btn-parse" class="btn btn-ghost w-full mt-3">${ic("sparkle")} ${L("Check", "जाँचें")}</button>
    <div id="parse-result" class="mt-3 text-sm">${p ? parseSummary(p, colonyId) : ""}</div>
    <button id="btn-request" class="btn btn-primary btn-lg w-full mt-3">${ic("send", "w-5 h-5")} ${L("Request water", "पानी मँगाएँ")}</button>
    <p class="text-xs muted mt-3 flex gap-2">${ic("info", "w-4 h-4 flex-none")}<span>${L(
      "Your message is shown to the dispatcher. The order of the queue depends only on water received per person.",
      "आपका संदेश डिस्पैचर को दिखेगा। सूची का क्रम सिर्फ़ प्रति व्यक्ति मिले पानी पर निर्भर करता है।")}</span></p>`;

  $("req-text").oninput = (e) => { draft.text = e.target.value; };
  $("btn-parse").onclick = (e) => run(e.currentTarget, () => parseDraft());
  if (SpeechRec) $("btn-mic").onclick = (e) => listen(e.currentTarget);
  $("btn-request").onclick = (e) => run(e.currentTarget, async () => {
    await post("/requests", { colonyId: $("colony-select").value, note: draft.text.trim() });
    draft.text = ""; draft.parse = null;
    toast(L("Request sent", "अनुरोध भेजा गया"));
    loadColony();
  });
}

function parseSummary(p, colonyId) {
  let html = "";
  if (p.match) {
    html += `<p class="flex items-center gap-2"><span class="text-emerald-700">${ic("check")}</span> ${L("Colony", "कॉलोनी")}: <b>${esc(cname(p.match))}</b></p>`;
  } else {
    const alts = p.alternatives.map((a) => esc(cname(a))).join(", ");
    html += `<p class="flex gap-2"><span class="text-amber-600">${ic("info")}</span><span>${L("Colony not recognised. Please pick it above.", "कॉलोनी पहचानी नहीं गई। ऊपर से चुनें।")}${alts ? ` ${L("Did you mean", "क्या आपका मतलब")}: <b>${alts}</b>?` : ""}</span></p>`;
  }
  if (p.daysWithoutWater) html += `<p class="flex items-center gap-2"><span class="text-amber-600">${ic("calendar")}</span> ${L(`No water for <b>${p.daysWithoutWater} days</b>`, `<b>${p.daysWithoutWater} दिन</b> से पानी नहीं`)}</p>`;
  if (p.signals.length) html += `<div class="pt-1">${signalChips(p.signals)}</div>`;
  return `<div class="panel reveal space-y-2">${html}</div>`;
}

async function parseDraft() {
  if (!draft.text.trim()) throw new Error(L("Type or speak your request first", "पहले लिखें या बोलें"));
  draft.parse = await post("/assist/parse", { text: draft.text.trim() });
  const sel = $("colony-select");
  if (draft.parse.match && sel.value !== draft.parse.match.colonyId && !sel.disabled) {
    sel.value = draft.parse.match.colonyId;
    try { localStorage.setItem("colonyId", sel.value); } catch {}
    await loadColony(); // re-render for the recognised colony (keeps the draft)
  } else {
    $("parse-result").innerHTML = parseSummary(draft.parse, sel.value);
  }
}

function listen(btn) {
  const rec = new SpeechRec();
  rec.lang = L("en-IN", "hi-IN");
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  btn.disabled = true;
  listening = true;
  btn.classList.add("listening");
  btn.innerHTML = ic("stop", "w-6 h-6");
  rec.onresult = (e) => {
    draft.text = e.results[0][0].transcript;
    $("req-text").value = draft.text;
    run(null, () => parseDraft());
  };
  rec.onerror = (e) => toast(e.error === "not-allowed"
    ? L("Microphone blocked. Allow it in the browser (needs HTTPS).", "माइक्रोफ़ोन बंद है। ब्राउज़र में अनुमति दें (HTTPS ज़रूरी)।")
    : L(`Could not hear: ${e.error}`, `सुनाई नहीं दिया: ${e.error}`), false);
  rec.onend = () => {
    listening = false;
    btn.disabled = false;
    btn.classList.remove("listening");
    btn.innerHTML = ic("mic", "w-7 h-7");
  };
  rec.start();
}

// ---------------- Heat banner ----------------
async function loadHeat() {
  const simulate = new URLSearchParams(location.search).get("heat");
  const h = await api(`/heat${simulate ? `?simulateMaxC=${encodeURIComponent(simulate)}` : ""}`);
  const b = $("heat-banner");
  if (h.place) $("ward-name").textContent = h.place;
  if (!h.available) { b.hidden = true; return; }
  const calm = h.level === "none";
  const days = h.days.map((d) => `<span>${esc(d.date.slice(5))} · ${Math.round(d.maxC)}°C</span>`).join("");
  b.className = `heat heat-${esc(h.level)}`;
  b.innerHTML = `<div class="heat-icon">${ic(calm ? "sun" : "flame", "w-5 h-5")}</div>
    <div class="min-w-0">
      <div class="font-bold">${calm ? L("Heat outlook", "गर्मी का पूर्वानुमान") : L("Heatwave warning", "लू की चेतावनी")} · ${esc(h.place)}${h.simulated ? ` <span class="text-xs font-semibold opacity-70">(${L("simulated", "नमूना")})</span>` : ""}</div>
      <div class="mt-1 opacity-90">${esc(pick(h.message))}</div>
      <div class="heat-days">${days}</div>
      <div class="mt-2 text-[11px] opacity-60">${L("Forecast", "पूर्वानुमान")}: Open-Meteo</div>
    </div>`;
  b.hidden = false;
}

// ---------------- Dispatcher view ----------------
function defaultEta() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const openWhy = new Set(); // keeps "Why this position?" panels open across refreshes
const openRelease = new Set(); // same for the dispatcher's release panels
// <details> "toggle" does not bubble, so listen in the capture phase for every panel on the page.
document.addEventListener("toggle", (e) => {
  const d = e.target;
  if (d.dataset && d.dataset.why) d.open ? openWhy.add(d.dataset.why) : openWhy.delete(d.dataset.why);
}, true);

// One click: every free tanker gets a colony, strictly in queue order, nearest tanker first.
let planPreview = null;
const etaIn = (minutes) => { const d = new Date(Date.now() + minutes * 60000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
function renderPlan(show) {
  const box = $("plan-box");
  if (!show) { box.innerHTML = ""; planPreview = null; return; }
  if (!planPreview) {
    box.innerHTML = `<div class="view-only"><span class="inline-flex items-center gap-2">${ic("sparkle")} ${L(
      "Fill every free tanker in queue order, nearest tanker first.", "हर खाली टैंकर सूची के क्रम में भेजें, सबसे पास वाला पहले।")}</span>
      <button id="btn-plan" class="btn btn-primary py-2">${ic("route")} ${L("Plan all free tankers", "सभी खाली टैंकर की योजना")}</button></div>`;
    $("btn-plan").onclick = (e) => run(e.currentTarget, async () => { planPreview = await api("/dispatch/plan"); renderPlan(true); });
    return;
  }
  box.innerHTML = `<div class="panel">
    <div class="font-bold mb-2">${L(`Plan: ${planPreview.length} trip${planPreview.length === 1 ? "" : "s"}`, `योजना: ${planPreview.length} ट्रिप`)}</div>
    <div class="table-wrap" tabindex="0"><table class="data"><thead><tr><th>#</th><th>${L("Colony", "कॉलोनी")}</th><th>${L("Tanker", "टैंकर")}</th><th>${L("Distance", "दूरी")}</th><th>ETA</th></tr></thead>
    <tbody>${planPreview.map((p, i) => `<tr><td>${i + 1}</td><td class="font-bold">${esc(cname(p))}</td><td>${esc(p.tankerId.toUpperCase())} · ${esc(p.driverName)}</td>
      <td>${p.km != null ? `${p.km} km` : "—"}</td>
      <td><input type="time" class="field py-1.5" style="width:auto" data-plan-eta="${i}" value="${etaIn(p.travelMinutes)}" aria-label="${esc(L(`Expected arrival at ${cname(p)}`, `${cname(p)} पहुँचने का समय`))}"></td></tr>`).join("")}</tbody></table></div>
    <div class="flex gap-2 flex-wrap mt-3">
      <button id="btn-plan-go" class="btn btn-success">${ic("send")} ${L("Assign all", "सभी भेजें")}</button>
      <button id="btn-plan-cancel" class="btn btn-ghost">${L("Cancel", "रद्द")}</button></div></div>`;
  $("btn-plan-cancel").onclick = () => { planPreview = null; renderPlan(true); };
  $("btn-plan-go").onclick = (e) => run(e.currentTarget, async () => {
    let done = 0;
    for (const [i, p] of planPreview.entries()) {
      await post(`/requests/${p.requestId}/assign`, { tankerId: p.tankerId, eta: document.querySelector(`[data-plan-eta="${i}"]`).value });
      done++;
    }
    planPreview = null;
    toast(L(`${done} tanker${done === 1 ? "" : "s"} sent, in queue order`, `${done} टैंकर सूची के क्रम में भेजे गए`));
    document.body.classList.remove("quiet");
    loadDispatcher();
  });
}

async function loadDispatcher() {
  const [queue, tankers, active] = await Promise.all([
    api("/queue"),
    api("/tankers"),
    api("/requests?status=ASSIGNED,ON_THE_WAY"),
  ]);
  const available = tankers.filter((t) => t.status === "AVAILABLE");
  const canDispatch = isRole("dispatcher");
  if (!colonies.length) await loadColonies();
  const colonyById = Object.fromEntries(colonies.map((c) => [c.colonyId, c]));
  const maxCap = Math.max(1, ...tankers.map((t) => t.capacityLitres || 0));

  $("fleet-count").innerHTML = L(
    `<span class="text-emerald-700">${available.length}</span> of ${tankers.length} available`,
    `${tankers.length} में से <span class="text-emerald-700">${available.length}</span> उपलब्ध`);
  $("tanker-list").innerHTML = tankers.map((t, i) => {
    const avail = t.status === "AVAILABLE", off = t.status === "OFF_DUTY";
    return `<div class="tanker reveal ${avail ? "avail" : "busy"} ${off ? "off" : ""}" style="--i:${i}">
      <div class="flex items-center justify-between">
        <div class="tanker-icon">${ic("truck", "w-5 h-5")}</div>
        <span class="tanker-status">${avail ? `<span class="pulse-dot"></span>${L("Available", "उपलब्ध")}` : off ? L("Off duty", "ड्यूटी पर नहीं") : L("On a trip", "ट्रिप पर")}</span>
      </div>
      <div class="font-extrabold text-lg mt-3">${esc(t.tankerId)}</div>
      <div class="text-sm muted">${esc(t.driverName)}</div>
      <div class="cap"><div style="width:${((t.capacityLitres || 0) / maxCap) * 100}%"></div></div>
      <div class="text-xs muted">${L(`${fmtL(t.capacityLitres)} L capacity`, `क्षमता ${fmtL(t.capacityLitres)} लीटर`)}</div>
      ${canDispatch && t.status !== "BUSY" ? `<button class="btn btn-ghost py-1.5 mt-3 w-full text-xs" data-shift="${esc(t.tankerId)}" data-to="${off ? "AVAILABLE" : "OFF_DUTY"}">
        ${off ? L("Put on duty", "ड्यूटी पर लगाएँ") : L("Mark off duty / repair", "ड्यूटी से हटाएँ / मरम्मत")}</button>` : ""}
    </div>`;
  }).join("");
  document.querySelectorAll("[data-shift]").forEach((b) => (b.onclick = () => run(b, async () => {
    await post(`/tankers/${b.dataset.shift}/status`, { status: b.dataset.to });
    loadDispatcher();
  })));

  // Suggest the nearest free tanker (last GPS fix from its previous fill or delivery) for each colony.
  const optionsFor = (colonyId) => {
    const c = colonyById[colonyId] || {};
    return available.map((t) => ({ t, d: t.lastLat != null && c.lat != null ? distanceKm(t.lastLat, t.lastLon, c.lat, c.lon) : null }))
      .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9))
      .map(({ t, d }, k) => `<option value="${esc(t.tankerId)}">${esc(t.tankerId)} (${esc(t.driverName)})${d != null ? ` · ${d.toFixed(1)} km` : ""}${k === 0 && d != null ? ` · ${L("nearest", "सबसे पास")}` : ""}</option>`).join("");
  };
  const queueEl = $("queue-list");
  renderPlan(canDispatch && available.length && queue.length);
  const viewOnly = canDispatch ? "" : `<li>${signInPrompt("View only. Sign in as dispatcher to assign tankers.", "सिर्फ़ देखने के लिए। टैंकर भेजने के लिए डिस्पैचर के रूप में साइन इन करें।")}</li>`;
  queueEl.innerHTML = viewOnly + (queue.length ? queue.map((r, i) => {
    const crit = r.totalPerPerson7d < LOW_LPP;
    return `
    <li class="q-item reveal ${i === 0 ? "q-first" : ""}" style="--i:${i}">
      <div class="flex items-start gap-3">
        <div class="rank">${i + 1}</div>
        <div class="flex-1 min-w-0">
          ${i === 0 ? `<div class="next-up">${ic("sparkle", "w-3 h-3")} ${L("Next up", "अगला")}</div>` : ""}
          <div class="font-bold text-lg leading-tight">${esc(cname(r))}</div>
          <div class="meta">
            <span>${ic("users", "w-3.5 h-3.5")} ${r.households} ${L("households", "घर")}</span>
            <span title="${fmtTime(r.createdAt)}">${ic("clock", "w-3.5 h-3.5")} ${L(`waiting ${ago(r.createdAt)}`, `${ago(r.createdAt)} से इंतज़ार`)}</span>
          </div>
          <div class="mt-1.5">${loadChip(r)}${waitChip(r)}
            ${r.pipedPerPerson7d ? `<span>${ic("drop", "w-3.5 h-3.5")} ${L(`incl. ${r.pipedPerPerson7d} L piped`, `${r.pipedPerPerson7d} लीटर पाइप सहित`)}</span>` : ""}
          </div>
          ${r.priorityWeight && r.priorityWeight !== 1 ? `<span class="chip chip-violet mt-2">×${r.priorityWeight} ${esc(r.priorityReason || "")} · ${L(`counted as ${r.needScore} L`, `${r.needScore} लीटर गिना`)}</span>` : ""}
        </div>
        <div class="lpp ${crit ? "crit" : ""}">
          <div class="lpp-num">${num(r.totalPerPerson7d, `q-${r.colonyId || r.requestId}`, 1)}</div>
          <div class="lpp-unit">${L("L / person · recent", "लीटर / व्यक्ति · हाल का")}</div>
          ${crit ? `<div class="crit-tag">${L("Critical", "गंभीर")}</div>` : ""}
        </div>
      </div>
      ${r.reason ? `<details class="why mt-3" data-why="${esc(r.requestId)}" ${openWhy.has(r.requestId) ? "open" : ""}>
        <summary>${ic("info", "w-3.5 h-3.5")} ${L("Why this position?", "यह क्रम क्यों?")} <span class="chev">${ic("chev", "w-3.5 h-3.5")}</span></summary>
        <div class="why-body panel mt-2 text-sm">${esc(pick(r.reason))}</div></details>` : ""}
      ${r.requeuedBy ? `<div class="mt-3"><span class="chip chip-amber">${ic("info", "w-3 h-3")} ${requeuedNote(r)}</span></div>` : ""}
      ${r.note ? `<div class="note mt-3">${ic("chat")}<span>“${esc(r.note)}”</span></div>` : ""}
      ${(r.signals && r.signals.length) || r.daysWithoutWater ? `<div class="mt-3">${signalChips(r.signals)}${r.daysWithoutWater ? `<span class="chip chip-amber">${ic("calendar", "w-3 h-3")} ${L(`${r.daysWithoutWater} days without water`, `${r.daysWithoutWater} दिन से पानी नहीं`)}</span>` : ""}
        <p class="text-[11px] muted opacity-75">${L("Reported by the colony, for context. Does not change the order.", "कॉलोनी द्वारा बताया गया, सिर्फ़ जानकारी के लिए। इससे क्रम नहीं बदलता।")}</p></div>` : ""}
      ${timeline(r)}
      ${!canDispatch ? "" : available.length ? `
        <div class="mt-4 flex flex-wrap gap-2">
          <select data-tanker="${esc(r.requestId)}" aria-label="${esc(L(`Tanker for ${cname(r)}`, `${cname(r)} के लिए टैंकर`))}" class="field flex-1 min-w-0 py-2.5" style="min-width:10rem">${optionsFor(r.colonyId)}</select>
          <input data-eta="${esc(r.requestId)}" aria-label="${esc(L(`Expected arrival at ${cname(r)}`, `${cname(r)} पहुँचने का समय`))}" type="time" value="${defaultEta()}" class="field py-2.5" style="width:auto">
          <button data-assign="${esc(r.requestId)}" class="btn ${i === 0 ? "btn-primary" : "btn-ghost"}">${ic("truck")} ${L("Assign", "भेजें")}</button>
          ${i > 0 ? `<input data-override="${esc(r.requestId)}" aria-label="${esc(L("Reason for skipping the queue", "सूची से हटकर भेजने का कारण"))}" class="field py-2.5 w-full" maxlength="300"
            placeholder="${esc(L(`Skipping ${i} colon${i > 1 ? "ies" : "y"} ahead needs a reason (published), e.g. fire, hospital`, `आगे की ${i} कॉलोनी छोड़ने के लिए कारण ज़रूरी (सार्वजनिक), जैसे आग, अस्पताल`))}">` : ""}
        </div>` : `<p class="mt-3 text-xs muted flex items-center gap-2">${ic("clock", "w-3.5 h-3.5")} ${L("No tanker available right now.", "अभी कोई टैंकर उपलब्ध नहीं।")}</p>`}
    </li>`;
  }).join("") : `<li class="empty">${ic("party", "w-8 h-8")}<b class="text-slate-800">${L("All caught up", "सब निपट गया")}</b>${L("No pending requests.", "कोई अनुरोध बाकी नहीं।")}</li>`);
  animateCounts(queueEl);

  document.querySelectorAll("[data-assign]").forEach((btn) => {
    btn.onclick = () => run(btn, async () => {
      const id = btn.dataset.assign;
      const tankerId = document.querySelector(`[data-tanker="${id}"]`).value;
      const eta = document.querySelector(`[data-eta="${id}"]`).value;
      if (!eta) throw new Error(L("Pick an expected time", "अनुमानित समय चुनें"));
      const reasonInput = document.querySelector(`[data-override="${id}"]`);
      await post(`/requests/${id}/assign`, { tankerId, eta, ...(reasonInput && reasonInput.value.trim() ? { overrideReason: reasonInput.value.trim() } : {}) });
      toast(L(`Tanker ${tankerId} assigned`, `टैंकर ${tankerId} भेजा गया`));
      document.body.classList.remove("quiet");
      loadDispatcher();
    });
  });

  const capacity = Object.fromEntries(tankers.map((t) => [t.tankerId, t.capacityLitres || 10000]));
  $("active-list").innerHTML = active.length ? active.map((r, i) => {
    const left = r.autoReleaseAt && until(r.autoReleaseAt);
    const id = esc(r.requestId);
    return `
    <li class="q-item reveal" style="--i:${i}">
      <div class="flex flex-wrap justify-between items-center gap-3">
        <div class="min-w-0">
          <div class="font-bold">${esc(cname(r))}</div>
          <div class="text-sm muted flex items-center gap-2 mt-0.5">${ic("truck", "w-3.5 h-3.5")} ${esc(r.tankerId)} · ${L("ETA", "समय")} <b class="text-slate-800">${esc(r.eta)}</b></div>
          <div class="mt-2 flex flex-wrap items-center gap-2">${badge(r.status)}
            ${r.autoReleaseAt ? `<span class="text-[11px] muted inline-flex items-center gap-1" title="${L(
              r.status === "ON_THE_WAY" ? "If nobody confirms, it is closed as delivered (unconfirmed) and the tanker is freed" : "If it never leaves, the tanker is freed and the colony goes back to the queue",
              r.status === "ON_THE_WAY" ? "पुष्टि न होने पर डिलीवरी (बिना पुष्टि) मानकर टैंकर खाली होगा" : "टैंकर न निकला तो खाली होगा और कॉलोनी फिर सूची में")}">${ic("clock", "w-3 h-3")} ${left
              ? L(`auto-release in ${left}`, `${left} में अपने आप खाली`) : L("auto-release due", "अपने आप खाली होने वाला")}</span>` : ""}
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          ${r.status === "ASSIGNED" && canDispatch
            ? `<button data-dispatch="${id}" class="btn btn-violet">${ic("send")} ${L("Mark on the way", "रास्ते में है")}</button>`
            : `<span class="text-xs muted inline-flex items-center gap-2"><span class="pulse-dot" style="background:#a5b4fc"></span>${r.status === "ASSIGNED"
              ? L("Waiting for the driver to leave", "ड्राइवर के निकलने का इंतज़ार") : L("Waiting for driver or colony to report", "ड्राइवर या कॉलोनी की रिपोर्ट का इंतज़ार")}</span>`}
          ${canDispatch ? `<button data-release-toggle="${id}" class="btn btn-ghost py-2" aria-expanded="${openRelease.has(r.requestId)}">${L("Release", "खाली करें")} ${ic("chev", "w-3.5 h-3.5")}</button>` : ""}
        </div>
      </div>
      ${timeline(r)}
      ${!canDispatch ? "" : `<div class="release-panel panel mt-3" data-release-panel="${id}" ${openRelease.has(r.requestId) ? "" : "hidden"}>
        <p class="text-sm font-semibold">${L("Colony can't confirm? Close it yourself.", "कॉलोनी पुष्टि नहीं कर पा रही? आप खुद बंद करें।")}</p>
        <div class="mt-3 flex flex-wrap gap-2 items-center">
          <input data-release-litres="${id}" type="number" inputmode="numeric" min="1" max="${capacity[r.tankerId] || 10000}" value="${capacity[r.tankerId] || 10000}" class="field py-2.5" style="width:9rem" aria-label="${L("Litres delivered", "लीटर पहुँचाए")}">
          <button data-release="${id}" data-outcome="delivered" class="btn btn-success py-2.5">${ic("check")} ${L("Delivered", "पहुँच गया")}</button>
          <button data-release="${id}" data-outcome="not_delivered" class="btn btn-danger py-2.5">${ic("x")} ${L("Didn't arrive, back to queue", "नहीं पहुँचा, फिर सूची में")}</button>
        </div>
        <p class="text-[11px] muted mt-2">${L("Either way the tanker becomes available again. The record shows it was closed by the dispatcher.", "दोनों में टैंकर फिर उपलब्ध होगा। रिकॉर्ड में डिस्पैचर द्वारा बंद दिखेगा।")}</p>
      </div>`}
    </li>`;
  }).join("") : `<li class="empty">${ic("truck", "w-7 h-7")}${L("Nothing in progress.", "अभी कुछ नहीं चल रहा।")}</li>`;

  document.querySelectorAll("[data-release-toggle]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.releaseToggle;
      const panel = document.querySelector(`[data-release-panel="${id}"]`);
      panel.hidden = !panel.hidden;
      panel.hidden ? openRelease.delete(id) : openRelease.add(id);
      btn.setAttribute("aria-expanded", String(!panel.hidden));
    };
  });
  document.querySelectorAll("[data-release]").forEach((btn) => {
    btn.onclick = () => run(btn, async () => {
      const id = btn.dataset.release;
      const delivered = btn.dataset.outcome === "delivered";
      const body = { outcome: btn.dataset.outcome };
      if (delivered) body.litresDelivered = parseInt(document.querySelector(`[data-release-litres="${id}"]`).value, 10);
      await post(`/requests/${id}/release`, body);
      openRelease.delete(id);
      toast(delivered ? L("Delivery recorded, tanker free", "डिलीवरी दर्ज, टैंकर खाली")
        : L("Tanker free, colony back in queue", "टैंकर खाली, कॉलोनी फिर सूची में"));
      document.body.classList.remove("quiet");
      loadDispatcher();
    });
  });

  document.querySelectorAll("[data-dispatch]").forEach((btn) => {
    btn.onclick = () => run(btn, async () => {
      await post(`/requests/${btn.dataset.dispatch}/dispatch`);
      toast(L("Marked on the way", "रास्ते में दर्ज किया"));
      document.body.classList.remove("quiet");
      loadDispatcher();
    });
  });
}

// ---------------- Overview (dashboard home) ----------------
const CHART_BLUE = "#3b82c4"; // validated against the white card surface (dataviz validator)

// Small skyline used as the colony's thumbnail in "Next dispatch".
const THUMB = `<svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true"><rect width="72" height="72" fill="#dcebf8"/>
  <circle cx="54" cy="18" r="9" fill="#f6e7a8"/><g fill="#b4cfec"><rect x="6" y="30" width="9" height="42"/><rect x="17" y="38" width="10" height="34"/>
  <rect x="29" y="24" width="10" height="48"/><rect x="41" y="34" width="9" height="38"/><rect x="52" y="40" width="12" height="32"/></g>
  <g fill="#9fcfae"><circle cx="8" cy="66" r="9"/><circle cx="26" cy="64" r="10"/><circle cx="46" cy="66" r="9"/><circle cx="64" cy="64" r="10"/></g></svg>`;

function fleetTable(tankers, active) {
  const trip = Object.fromEntries(active.map((r) => [r.tankerId, r]));
  const status = (t) => t.status === "AVAILABLE" ? ["green", L("Available", "उपलब्ध")]
    : t.status === "OFF_DUTY" ? ["grey", L("Off duty", "ड्यूटी पर नहीं")] : ["orange", L("On delivery", "डिलीवरी पर")];
  return `<div class="table-wrap" tabindex="0"><table class="data">
    <thead><tr><th>${L("Tanker ID", "टैंकर")}</th><th>${L("Capacity", "क्षमता")}</th><th>${L("Status", "स्थिति")}</th><th>${L("Current assignment", "मौजूदा काम")}</th><th>ETA</th></tr></thead>
    <tbody>${tankers.map((t) => {
      const [dot, label] = status(t), r = trip[t.tankerId];
      return `<tr><td class="font-bold whitespace-nowrap">${esc(t.tankerId.toUpperCase())}<div class="text-xs muted font-normal">${esc(t.driverName)}</div></td>
        <td class="whitespace-nowrap">${fmtL(t.capacityLitres)} ${L("L", "लीटर")}</td>
        <td><span class="inline-flex items-center gap-2 whitespace-nowrap"><span class="dot ${dot}"></span>${label}</span></td>
        <td>${r ? esc(cname(r)) : "—"}</td><td class="whitespace-nowrap">${r ? esc(r.eta) : "—"}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

function litresChart(rows) {
  const sorted = [...rows].sort((a, b) => a.totalPerPerson7d - b.totalPerPerson7d);
  const top = Math.max(25, Math.ceil(Math.max(...sorted.map((r) => r.totalPerPerson7d), 0) / 25) * 25);
  const ticks = [0, 1, 2, 3, 4].map((k) => Math.round((top / 4) * k));
  const anyZero = sorted.some((r) => !r.totalPerPerson7d);
  return `<div class="vchart"><div class="vchart-inner" style="min-width:${Math.max(520, sorted.length * 70)}px">
      <div class="vchart-body">
        <div class="vchart-axis">${ticks.map((t) => `<span style="bottom:${(t / top) * 100}%">${t}</span>`).join("")}</div>
        <div class="vchart-plot">
          ${ticks.slice(1).map((t) => `<div class="vchart-grid" style="bottom:${(t / top) * 100}%"></div>`).join("")}
          ${sorted.map((r, i) => {
            const v = r.totalPerPerson7d;
            const tip = L(`${cname(r)}: ${v} L/person (${r.litresPerPerson7d} tanker + ${r.pipedPerPerson7d} piped)`,
              `${cname(r)}: ${v} लीटर/व्यक्ति (टैंकर ${r.litresPerPerson7d} + पाइप ${r.pipedPerPerson7d})`);
            return `<div class="vbar" data-tip="${esc(tip)}" tabindex="0" aria-label="${esc(tip)}">
              <div class="v">${v.toFixed(1)}</div>
              ${v ? `<div class="b" style="height:${(v / top) * 100}%;background:${CHART_BLUE};animation-delay:${i * 60}ms"></div>` : `<div class="zero"></div>`}
            </div>`;
          }).join("")}
        </div>
      </div>
      <div class="vchart-labels">${sorted.map((r) => `<div>${esc(cname(r))}</div>`).join("")}</div>
    </div></div>
    ${anyZero ? `<div class="flex items-center gap-2 text-sm muted mt-3"><span class="legend-line"></span>${L("No confirmed deliveries this week", "इस हफ़्ते कोई पुष्ट डिलीवरी नहीं")}</div>` : ""}`;
}

// Hover/focus tooltip for chart bars.
function wireTips(root) {
  root.querySelectorAll("[data-tip]").forEach((el) => {
    const show = () => {
      const tip = document.createElement("div");
      tip.className = "vtip";
      tip.textContent = el.dataset.tip;
      const host = el.closest(".vchart");
      const a = el.getBoundingClientRect(), h = host.getBoundingClientRect();
      tip.style.left = `${a.left - h.left + host.scrollLeft + a.width / 2}px`;
      tip.style.top = `${Math.max(14, a.bottom - h.top - (el.querySelector(".b,.zero").getBoundingClientRect().height) - 18)}px`;
      host.appendChild(tip);
      el._tip = tip;
    };
    const hide = () => { if (el._tip) { el._tip.remove(); el._tip = null; } };
    el.addEventListener("mouseenter", show); el.addEventListener("focus", show);
    el.addEventListener("mouseleave", hide); el.addEventListener("blur", hide);
  });
}

async function loadOverview() {
  if (!colonies.length) await loadColonies();
  const heat = simulatedHeat();
  const [queue, tankers, ledgerRows, active, warning, fillPoints, st] = await Promise.all([
    api("/queue"), api("/tankers"), api("/ledger"), api("/requests?status=ASSIGNED,ON_THE_WAY"),
    api(`/forecast${heat ? `?simulateMaxC=${encodeURIComponent(heat)}` : ""}`), api("/fillpoints"), api("/stats")]);
  renderWarning(warning);
  renderImpact($("ov-impact"), st.impact);
  updateMap({ ledgerRows, warning, tankers, active, fillPoints });
  const available = tankers.filter((t) => t.status === "AVAILABLE");
  const delivered = ledgerRows.reduce((s, r) => s + (r.litres7d || 0), 0);
  const served = ledgerRows.filter((r) => r.litres7d > 0).length;

  // ---- KPI cards ----
  const kpi = (i, tone, icon, label, value, sub) => `<div class="card kpi reveal" style="--i:${i}">
    <div class="kpi-icon" style="background:var(--${tone}-soft);color:var(--${tone})">${ic(icon, "w-7 h-7")}</div>
    <div class="min-w-0"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div></div>`;
  const k = $("ov-kpis");
  k.innerHTML =
    kpi(0, "orange", "clipboard", L("Pending requests", "बाकी अनुरोध"), String(queue.length).padStart(2, "0"), L("colonies waiting", "कॉलोनियाँ इंतज़ार में")) +
    kpi(1, "blue", "truck", L("Tankers available", "उपलब्ध टैंकर"), `${available.length} / ${tankers.length}`, L("in fleet", "बेड़े में")) +
    kpi(2, "green", "drop", L("Water delivered this week", "इस हफ़्ते पहुँचा पानी"), `${num(delivered, "ov-delivered")} ${L("L", "ली.")}`, L(`across ${served} colonies`, `${served} कॉलोनियों में`)) +
    kpi(3, "blue", "users", L("Colonies served", "जिन्हें पानी मिला"), `${served} / ${ledgerRows.length}`, L("this week", "इस हफ़्ते"));
  animateCounts(k);

  // ---- Dispatch queue table ----
  const q = $("ov-queue");
  q.innerHTML = `
    <div class="card-head"><h2 class="card-title">${L("Dispatch Queue", "प्राथमिकता सूची")}</h2>
      <span class="text-sm muted flex-1 min-w-[12rem]">${L("Ranked by recent water per person (lowest first).", "हाल के प्रति व्यक्ति पानी के क्रम में (सबसे कम पहले)।")}</span></div>
    <div class="mt-3 mb-4"><span class="pill" style="box-shadow:none">${ic("calendar")} ${L("Recent water · fades over 10 days", "हाल का पानी · 10 दिन में घटता")}</span></div>
    <div class="table-wrap" tabindex="0"><table class="data">
      <thead><tr><th>#</th><th>${L("Colony", "कॉलोनी")}</th><th>${L("Households", "घर")}</th><th>${L("Litres / person (recent)", "लीटर / व्यक्ति (हाल का)")}</th><th>${L("Waiting time", "इंतज़ार")}</th><th>${L("Status", "स्थिति")}</th><th><span class="sr-only">${L("Actions", "कार्य")}</span></th></tr></thead>
      <tbody>${queue.length ? queue.slice(0, 6).map((r, i) => `<tr class="clickable ${i === 0 ? "top" : ""}" data-go="dispatcher">
        <td>${i + 1}</td>
        <td class="font-bold">${esc(cname(r))}${r.loadsTarget > 1 ? `<div class="text-xs font-normal muted">${L(`load ${r.loadNumber || 1} of ${r.loadsTarget}`, `${r.loadsTarget} में से ${r.loadNumber || 1}`)}</div>` : ""}</td>
        <td>${r.households}</td>
        <td class="${i === 0 ? "font-bold" : ""}" style="${i === 0 ? "color:var(--orange)" : ""}">${r.totalPerPerson7d.toFixed(1)} ${L("L", "ली.")}</td>
        <td class="whitespace-nowrap ${i === 0 ? "font-bold" : ""}" style="${i === 0 ? "color:var(--orange)" : ""}">${ago(r.createdAt)}</td>
        <td>${i === 0 ? `<span class="status-pill high">${L("Highest need", "सबसे ज़रूरी")}</span>` : `<span class="status-pill pending">${L("Pending", "बाकी")}</span>`}</td>
        <td class="muted">${ic("chevR")}</td></tr>`).join("")
      : `<tr><td colspan="7"><div class="empty">${ic("party", "w-8 h-8")}${L("No pending requests.", "कोई अनुरोध बाकी नहीं।")}</div></td></tr>`}</tbody></table></div>`;
  q.querySelectorAll("[data-go]").forEach((tr) => (tr.onclick = () => showView(tr.dataset.go)));

  // ---- Next dispatch ----
  const next = queue[0];
  const n = $("ov-next");
  if (!next) {
    n.innerHTML = `<h2 class="card-title">${ic("send", "w-5 h-5")} ${L("Next dispatch", "अगला टैंकर")}</h2><div class="empty">${ic("check", "w-8 h-8")}${L("Nothing waiting. Every request is served.", "कुछ बाकी नहीं। हर अनुरोध पूरा।")}</div>`;
  } else {
    const colony = colonies.find((c) => c.colonyId === next.colonyId) || {};
    const opts = available.map((t) => ({ t, d: t.lastLat != null && colony.lat != null ? distanceKm(t.lastLat, t.lastLon, colony.lat, colony.lon) : null }))
      .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
    n.innerHTML = `
      <div class="card-head"><h2 class="card-title"><span style="color:var(--orange)">${ic("send", "w-5 h-5")}</span>${L("Next dispatch", "अगला टैंकर")}</h2>
        <span class="badge-priority">${L("Priority 1", "प्राथमिकता 1")}</span></div>
      <div class="next-box mt-4">
        <div class="flex items-center gap-4"><div class="thumb">${THUMB}</div><div class="text-2xl font-extrabold tracking-tight">${esc(cname(next))}</div></div>
        <div class="flex items-center gap-2 mt-3" style="color:var(--ink-2)">${ic("users")} ${next.households} ${L("households", "घर")} · ~${fmtL(next.households * 5)} ${L("people", "लोग")}</div>
        <div class="info-box mt-3">${ic("info", "w-5 h-5 flex-none")}<span>${L(
          `${next.totalPerPerson7d} L per person recently (${fmtL(next.litres7d)} L by tanker in the last 7 days).${next.loadsTarget > 1 ? ` Needs about ${fmtL(next.litresTarget)} L: load ${next.loadNumber} of ${next.loadsTarget}.` : ""}`,
          `हाल में प्रति व्यक्ति ${next.totalPerPerson7d} लीटर (पिछले 7 दिनों में टैंकर से ${fmtL(next.litres7d)} लीटर)।${next.loadsTarget > 1 ? ` लगभग ${fmtL(next.litresTarget)} लीटर चाहिए: ${next.loadsTarget} में से ${next.loadNumber}वाँ टैंकर।` : ""}`)}</span></div>
      </div>
      ${isRole("dispatcher") ? (opts.length ? `
        <label class="block font-semibold mt-5 mb-2" for="ov-tanker">${L("Assign tanker", "टैंकर चुनें")}</label>
        <select id="ov-tanker" class="field text-lg">${opts.map(({ t, d }) => `<option value="${esc(t.tankerId)}">${esc(t.tankerId.toUpperCase())} · ${fmtL(t.capacityLitres)} ${L("L", "ली.")} · ${esc(t.driverName)}${d != null ? ` · ${d.toFixed(1)} km` : ""}</option>`).join("")}</select>
        <label class="block font-semibold mt-4 mb-2" for="ov-eta">${L("Expected arrival time", "पहुँचने का अनुमानित समय")}</label>
        <input id="ov-eta" type="time" class="field text-lg" value="${defaultEta()}">
        <button id="ov-assign" class="btn btn-success btn-lg w-full mt-5">${ic("send", "w-5 h-5")} ${L("Assign tanker", "टैंकर भेजें")}</button>`
        : `<div class="mt-5">${signInPrompt("No tanker is free right now.", "अभी कोई टैंकर खाली नहीं।").replace(/<button[\s\S]*<\/button>/, "")}</div>`)
      : `<div class="mt-5">${signInPrompt("Sign in as dispatcher to assign a tanker.", "टैंकर भेजने के लिए डिस्पैचर के रूप में साइन इन करें।")}</div>`}`;
    if ($("ov-assign")) $("ov-assign").onclick = (e) => run(e.currentTarget, async () => {
      if (!$("ov-eta").value) throw new Error(L("Pick an expected time", "अनुमानित समय चुनें"));
      await post(`/requests/${next.requestId}/assign`, { tankerId: $("ov-tanker").value, eta: $("ov-eta").value });
      toast(L(`Tanker ${$("ov-tanker").value} assigned to ${cname(next)}`, `टैंकर ${$("ov-tanker").value} ${cname(next)} भेजा गया`));
      document.body.classList.remove("quiet");
      loadOverview();
    });
  }

  // ---- Fleet and chart ----
  $("ov-fleet").innerHTML = `<div class="card-head mb-4"><h2 class="card-title">${L("Tanker Fleet Status", "टैंकर बेड़े की स्थिति")}</h2>
    <button class="link-btn" data-go="dispatcher">${L("View fleet", "बेड़ा देखें")} ${ic("arrowR")}</button></div>${fleetTable(tankers, active)}`;
  const chart = $("ov-chart");
  chart.innerHTML = `<div class="card-head mb-4"><h2 class="card-title">${L("Litres per person", "प्रति व्यक्ति लीटर")} <span class="text-base font-normal muted">· ${L("recent", "हाल का")}</span></h2>
    <button class="link-btn" data-go="ledger">${L("View public ledger", "सार्वजनिक रिकॉर्ड")} ${ic("arrowR")}</button></div>${litresChart(ledgerRows)}`;
  wireTips(chart);
  document.querySelectorAll("#ov-fleet [data-go], #ov-chart [data-go]").forEach((b) => (b.onclick = () => showView(b.dataset.go)));
}

// ---------------- Live ward map (Leaflet + OpenStreetMap, free) ----------------
// Leaflet calls itself window.L; this file already uses L() for English/Hindi text.
const Leaf = () => window.L;
const MAP_COLORS = { critical: "#e8541c", heat: "#b45309", ok: "#1f9d55", hydrant: "#1f6fd1" };
let wardMap = null, mapLayers = null, mapFitted = false, movingTankers = [];

function ensureMap() {
  if (wardMap || !window.L || !$("map")) return;
  wardMap = Leaf().map("map", { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
  Leaf().tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(wardMap);
  mapLayers = { trips: Leaf().layerGroup().addTo(wardMap), hydrants: Leaf().layerGroup().addTo(wardMap),
    colonies: Leaf().layerGroup().addTo(wardMap), tankers: Leaf().layerGroup().addTo(wardMap) };
  wardMap.setView([28.615, 77.215], 13);
}

// Where a tanker on a trip probably is now: along the line from where it started to the colony,
// by the share of time elapsed between leaving and the promised arrival time.
function tripProgress(r) {
  if (r.status !== "ON_THE_WAY" || !r.dispatchedAt) return 0;
  const left = new Date(r.dispatchedAt).getTime();
  let due = left + 30 * 60000;
  const m = /^(\d{1,2}):(\d{2})$/.exec(r.eta || "");
  if (m) { const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); if (d.getTime() > left) due = d.getTime(); }
  return Math.max(0.05, Math.min(0.95, (Date.now() - left) / (due - left)));
}
const lerp = (a, b, t) => a + (b - a) * t;

function updateMap({ ledgerRows, warning, tankers, active, fillPoints }) {
  ensureMap();
  if (!wardMap) return;
  const risk = Object.fromEntries((warning ? warning.colonies : []).map((c) => [c.colonyId, c]));
  const rowBy = Object.fromEntries(ledgerRows.map((r) => [r.colonyId, r]));
  Object.values(mapLayers).forEach((g) => g.clearLayers());
  movingTankers = [];
  const pts = [];

  fillPoints.forEach((f) => {
    if (f.lat == null) return;
    pts.push([f.lat, f.lon]);
    Leaf().marker([f.lat, f.lon], { icon: Leaf().divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div class="map-hydrant" title="${esc(f.name)}">${ic("drop", "w-3.5 h-3.5")}</div>` }) })
      .bindTooltip(`${L("Hydrant", "हाइड्रेंट")}: ${esc(f.name)}`).addTo(mapLayers.hydrants);
  });

  colonies.forEach((c) => {
    if (c.lat == null) return;
    pts.push([c.lat, c.lon]);
    const row = rowBy[c.colonyId] || {}, w = risk[c.colonyId];
    const total = row.totalPerPerson7d ?? 0;
    const state = total < LOW_LPP ? "critical" : w && w.risk === "high" ? "heat" : "ok";
    const label = { critical: L("Critical: under 20 L/person this week", "गंभीर: इस हफ़्ते 20 लीटर/व्यक्ति से कम"),
      heat: L("At risk in the coming heat", "आने वाली गर्मी में ख़तरा"), ok: L("Enough water", "पर्याप्त पानी") }[state];
    Leaf().circleMarker([c.lat, c.lon], { radius: 9 + Math.sqrt(c.households) / 2.2, color: "#fff", weight: 3,
      fillColor: MAP_COLORS[state], fillOpacity: 0.9 })
      .bindTooltip(`<b>${esc(cname(c))}</b> · ${total.toFixed(1)} ${L("L/person", "लीटर/व्यक्ति")}`, { permanent: true, direction: "top", offset: [0, -10], className: "map-label" })
      .bindPopup(`<b>${esc(cname(c))}</b><br>${label}<br>${total.toFixed(1)} ${L("L per person, recent", "लीटर प्रति व्यक्ति, हाल का")}${w ? `<br>${L(`Next 3 days: ${Math.round(w.coverage * 100)}% of need covered`, `अगले 3 दिन: ज़रूरत का ${Math.round(w.coverage * 100)}%`)}` : ""}`)
      .addTo(mapLayers.colonies);
  });

  const trip = Object.fromEntries(active.map((r) => [r.tankerId, r]));
  tankers.forEach((t) => {
    if (t.lastLat == null) return;
    const r = trip[t.tankerId], c = r && colonies.find((x) => x.colonyId === r.colonyId);
    let pos = [t.lastLat, t.lastLon];
    if (r && c && c.lat != null) {
      const start = [r.startLat ?? t.lastLat, r.startLon ?? t.lastLon];
      Leaf().polyline([start, [c.lat, c.lon]], { color: MAP_COLORS.critical, weight: 3, dashArray: "6 8", opacity: 0.8 }).addTo(mapLayers.trips);
      const p = tripProgress(r);
      pos = [lerp(start[0], c.lat, p), lerp(start[1], c.lon, p)];
    }
    pts.push(pos);
    const cls = t.status === "AVAILABLE" ? "free" : t.status === "OFF_DUTY" ? "off" : "busy";
    const marker = Leaf().marker(pos, { zIndexOffset: 500, icon: Leaf().divIcon({ className: "", iconSize: [84, 30], iconAnchor: [42, 15],
      html: `<div class="map-tanker ${cls}">${ic("truck", "w-4 h-4")}<span>${esc(t.tankerId.toUpperCase())}</span></div>` }) })
      .bindTooltip(r ? L(`${t.tankerId} → ${cname(r)}, ETA ${r.eta}${r.status === "ON_THE_WAY" ? " (estimated position)" : ""}`,
        `${t.tankerId} → ${cname(r)}, समय ${r.eta}`) : `${t.tankerId} · ${t.status === "AVAILABLE" ? L("free", "खाली") : L("off duty", "ड्यूटी पर नहीं")}`)
      .addTo(mapLayers.tankers);
    if (r && c && r.status === "ON_THE_WAY") movingTankers.push({ marker, r, c, t });
  });

  if (!mapFitted && pts.length) { wardMap.fitBounds(pts, { padding: [30, 30] }); mapFitted = true; }
  setTimeout(() => wardMap.invalidateSize(), 50);
  $("map-legend").innerHTML = [["critical", L("Critical", "गंभीर")], ["heat", L("Heat risk", "गर्मी का ख़तरा")], ["ok", L("Enough water", "पर्याप्त")]]
    .map(([k, label]) => `<span class="inline-flex items-center gap-1.5"><span class="dot" style="background:${MAP_COLORS[k]}"></span>${label}</span>`).join("") +
    `<span class="inline-flex items-center gap-1.5"><span class="map-tanker busy mini">${ic("truck", "w-3 h-3")}</span>${L("Tanker", "टैंकर")}</span>
     <span class="inline-flex items-center gap-1.5"><span class="map-hydrant mini">${ic("drop", "w-2.5 h-2.5")}</span>${L("Hydrant", "हाइड्रेंट")}</span>`;
}
// Tankers on the way glide along their route between refreshes.
setInterval(() => movingTankers.forEach(({ marker, r, c, t }) => {
  const p = tripProgress(r), s = [r.startLat ?? t.lastLat, r.startLon ?? t.lastLon];
  marker.setLatLng([lerp(s[0], c.lat, p), lerp(s[1], c.lon, p)]);
}), 3000);

// ---------------- Heat early warning ----------------
const simulatedHeat = () => new URLSearchParams(location.search).get("heat");
const RISK = { high: ["chip-red", "High risk", "ज़्यादा ख़तरा"], medium: ["chip-amber", "Watch", "नज़र रखें"], low: ["chip-green", "OK", "ठीक"] };

function renderWarning(w) {
  const box = $("ov-warn");
  const top = w.colonies.filter((c) => c.risk !== "low").slice(0, 5);
  const hot = w.days.some((d) => d.factor > 1);
  box.innerHTML = `
    <div class="card-head"><h2 class="card-title"><span class="icon-box orange">${ic("flame")}</span>${L("Heat early warning", "गर्मी की पूर्व चेतावनी")}</h2>
      <span class="text-sm muted">${L("next 3 days", "अगले 3 दिन")}</span></div>
    <div class="flex flex-wrap gap-2 mt-3">${w.days.map((d) => `<span class="day-chip ${d.factor > 1 ? "hot" : ""}">
      <b>${d.date ? esc(d.date.slice(5)) : "–"}</b> ${d.maxC != null ? `${Math.round(d.maxC)}°C` : ""}${d.factor > 1 ? ` · ${L("need", "ज़रूरत")} ×${d.factor}` : ""}</span>`).join("")}</div>
    <p class="text-sm mt-3" style="color:var(--ink-2)">${top.length
      ? L(`At last week's supply rate, <b>${top.length} colon${top.length > 1 ? "ies" : "y"}</b> will fall short by <b>${fmtL(w.totalShortfallLitres)} L</b>${hot ? " as the heat raises how much water people need" : ""}.`,
        `पिछले हफ़्ते की सप्लाई पर <b>${top.length} कॉलोनी</b> में <b>${fmtL(w.totalShortfallLitres)} लीटर</b> की कमी होगी${hot ? ", क्योंकि गर्मी में पानी की ज़रूरत बढ़ती है" : ""}।`)
      : L("Every colony is covered for the next 3 days.", "अगले 3 दिनों के लिए हर कॉलोनी में पर्याप्त पानी।")}</p>
    <ul class="space-y-2.5 mt-4">${top.map((c) => {
      const [cls, en, hi] = RISK[c.risk];
      const pct = Math.round(c.coverage * 100);
      return `<li class="warn-row">
        <div class="flex justify-between items-center gap-2 flex-wrap">
          <b>${esc(cname(c))}</b>
          <span class="chip ${cls} !m-0">${ic(c.risk === "high" ? "alert" : "info", "w-3 h-3")} ${L(en, hi)}</span>
        </div>
        <div class="cover-bar mt-2" role="img" aria-label="${pct}%"><div style="width:${pct}%;background:${c.risk === "high" ? "var(--orange)" : "#d97706"}"></div></div>
        <div class="flex justify-between items-center gap-2 flex-wrap mt-1.5 text-xs muted">
          <span>${L(`${pct}% of need covered · short ${fmtL(c.shortfallLitres)} L (${c.tankerLoads} tanker load${c.tankerLoads === 1 ? "" : "s"})`,
            `ज़रूरत का ${pct}% · कमी ${fmtL(c.shortfallLitres)} लीटर (${c.tankerLoads} टैंकर)`)}</span>
          ${c.hasOpenRequest ? `<span class="chip chip-violet !m-0">${L("In queue", "सूची में")}</span>`
            : isRole("dispatcher") ? `<button class="btn btn-ghost py-1 px-2.5 text-xs" data-preempt="${esc(c.colonyId)}" data-short="${c.shortfallLitres}">${ic("send", "w-3.5 h-3.5")} ${L("Request now", "अभी अनुरोध")}</button>` : ""}
        </div></li>`;
    }).join("")}</ul>
    <p class="text-[11px] muted mt-4">${L(`Need: ${w.assumptions.basicNeedLpcd} L/person/day (WHO basic access), +${Math.round(w.assumptions.heatPctPerC * 100)}% per °C above ${w.assumptions.heatBaseC}°C. Supply: last 7 days' rate. Forecast: Open-Meteo.`,
      `ज़रूरत: ${w.assumptions.basicNeedLpcd} लीटर/व्यक्ति/दिन (WHO), ${w.assumptions.heatBaseC}°C के ऊपर हर °C पर +${Math.round(w.assumptions.heatPctPerC * 100)}%। सप्लाई: पिछले 7 दिनों की दर।`)}${simulatedHeat() ? ` <b>${L("(simulated heat)", "(नमूना गर्मी)")}</b>` : ""}</p>`;
  box.querySelectorAll("[data-preempt]").forEach((b) => (b.onclick = () => run(b, async () => {
    const c = w.colonies.find((x) => x.colonyId === b.dataset.preempt);
    await post("/requests", { colonyId: c.colonyId,
      note: `Pre-emptive (heat early warning): ${Math.round(c.coverage * 100)}% of need covered over the next 3 days, short ${c.shortfallLitres} L.` });
    toast(L(`${cname(c)} added to the queue before it runs dry`, `${cname(c)} पानी ख़त्म होने से पहले सूची में जोड़ी गई`));
    document.body.classList.remove("quiet");
    loadOverview();
  })));
}

// ---------------- Environmental impact ----------------
function renderImpact(box, im) {
  const tile = (i, icon, tone, value, label) => `<div class="card kpi reveal" style="--i:${i}">
    <div class="kpi-icon" style="background:var(--${tone}-soft);color:var(--${tone})">${ic(icon, "w-7 h-7")}</div>
    <div class="min-w-0"><div class="kpi-value">${value}</div><div class="kpi-sub">${label}</div></div></div>`;
  box.innerHTML = `
    <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
      <h2 class="card-title"><span class="icon-box green">${ic("leaf")}</span>${L("Environmental impact", "पर्यावरण पर असर")} <span class="text-base font-normal muted">· ${L(`last ${im.days} days`, `पिछले ${im.days} दिन`)}</span></h2>
    </div>
    <div class="kpis">
      ${tile(0, "route", "blue", `${num(im.kmSaved, "im-km", 1)} km`, L("driving saved by sending the nearest tanker", "सबसे पास का टैंकर भेजकर बची दूरी"))}
      ${tile(1, "fuel", "orange", `${num(im.dieselSavedLitres, "im-diesel", 1)} L`, L("diesel saved", "डीज़ल की बचत"))}
      ${tile(2, "leaf", "green", `${num(im.co2SavedKg, "im-co2", 1)} kg`, L("CO₂ emissions avoided", "CO₂ उत्सर्जन से बचाव"))}
      ${tile(3, "drop", "red", `${num(im.missingWaterFlaggedLitres, "im-water")} L`, L("missing water caught by the checks", "जाँच में पकड़ा गया गायब पानी"))}
    </div>
    <p class="text-[11px] muted mt-2">${L(`Compared with sending an average free tanker. ${im.tripsMeasured} trips measured; round trips; ${im.assumptions.kmPerLitreDiesel} km per litre of diesel; ${im.assumptions.co2KgPerLitreDiesel} kg CO₂ per litre.`,
      `औसत खाली टैंकर भेजने की तुलना में। ${im.tripsMeasured} ट्रिप; आना-जाना; ${im.assumptions.kmPerLitreDiesel} किमी प्रति लीटर डीज़ल; ${im.assumptions.co2KgPerLitreDiesel} किग्रा CO₂ प्रति लीटर।`)}</p>`;
  animateCounts(box);
}

// ---------------- Voice and simple mode (for people who find reading hard) ----------------
function speak(text) {
  if (!("speechSynthesis" in window)) throw new Error(L("This browser cannot read aloud", "यह ब्राउज़र पढ़कर नहीं सुना सकता"));
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = L("en-IN", "hi-IN");
  const voice = speechSynthesis.getVoices().find((v) => v.lang === u.lang) || speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang));
  if (voice) u.voice = voice;
  u.rate = 0.92;
  speechSynthesis.speak(u);
}

async function colonySpeech() {
  const colonyId = $("colony-select").value;
  const c = colonies.find((x) => x.colonyId === colonyId);
  if (!c) return "";
  const name = cname(c);
  const [reqs, queue] = await Promise.all([api(`/requests?colonyId=${encodeURIComponent(colonyId)}`), api("/queue")]);
  const open = reqs.find((r) => OPEN.includes(r.status));
  if (open && open.status === "PENDING") {
    const pos = queue.findIndex((r) => r.requestId === open.requestId) + 1;
    return L(`${name}. Your request is number ${pos} in the queue. The dispatcher will send a tanker soon.`,
      `${name}। आपका अनुरोध सूची में ${pos} नंबर पर है। जल्द ही टैंकर भेजा जाएगा।`);
  }
  if (open) {
    return open.status === "ON_THE_WAY"
      ? L(`${name}. Tanker ${open.tankerId} is on the way. It should arrive at ${open.eta}.`, `${name}। टैंकर ${open.tankerId} रास्ते में है। ${open.eta} बजे तक पहुँचेगा।`)
      : L(`${name}. Tanker ${open.tankerId} has been assigned. It should arrive at ${open.eta}.`, `${name}। टैंकर ${open.tankerId} तय हो गया है। ${open.eta} बजे तक पहुँचेगा।`);
  }
  const last = reqs.find((r) => r.status === "DELIVERED");
  return last
    ? L(`${name}. No open request. The last tanker brought ${fmtL(last.litresDelivered)} litres on ${new Date(last.deliveredAt).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}.`,
      `${name}। कोई खुला अनुरोध नहीं। पिछला टैंकर ${new Date(last.deliveredAt).toLocaleDateString("hi-IN", { day: "numeric", month: "long" })} को ${fmtL(last.litresDelivered)} लीटर लाया।`)
    : L(`${name}. No open request and no deliveries yet.`, `${name}। कोई अनुरोध या डिलीवरी नहीं।`);
}
$("btn-listen").onclick = (e) => run(e.currentTarget, async () => speak(await colonySpeech()));

function setSimple(on) {
  document.body.classList.toggle("simple", on);
  $("btn-simple").setAttribute("aria-pressed", String(on));
  try { localStorage.setItem("simple", on ? "1" : "0"); } catch {}
}
$("btn-simple").onclick = () => setSimple(!document.body.classList.contains("simple"));
try { if (localStorage.getItem("simple") === "1") setSimple(true); } catch {}

// ---------------- Offline outbox (drivers often lose signal inside colonies) ----------------
// Driver actions that fail because there is no network are saved on the phone and sent later, in order.
const OUTBOX_KEY = "outbox";
const readOutbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); } catch { return []; } };
const writeOutbox = (items) => { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(items)); } catch {} };
async function sendOrQueue(path, body, label) {
  try {
    return await post(path, body);
  } catch (e) {
    if (!(e instanceof TypeError)) throw e; // a real error from the server, not a lost connection
    writeOutbox([...readOutbox(), { path, body, label, at: new Date().toISOString() }]);
    toast(L(`No network. "${label}" saved on this phone and will be sent automatically.`, `नेटवर्क नहीं। "${label}" फ़ोन में सहेजा, नेटवर्क आने पर अपने आप भेजा जाएगा।`));
    return null;
  }
}
let flushing = false;
async function flushOutbox() {
  if (flushing || !navigator.onLine || !session) return;
  flushing = true;
  try {
    let items = readOutbox();
    while (items.length) {
      try {
        await post(items[0].path, items[0].body);
        toast(L(`Sent: ${items[0].label}`, `भेजा गया: ${items[0].label}`));
      } catch (e) {
        if (e instanceof TypeError) break; // still offline
        toast(L(`Could not send "${items[0].label}": ${e.message}`, `"${items[0].label}" नहीं भेजा जा सका: ${e.message}`), false);
      }
      items = items.slice(1);
      writeOutbox(items);
    }
  } finally {
    flushing = false;
  }
}
window.addEventListener("online", () => flushOutbox().then(() => currentView === "driver" && loadDriver()));

// Phone photos are several MB; shrink to ~1024 px JPEG (~100-200 KB) before sending.
async function compressPhoto(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

// ---------------- Driver view ----------------
// The driver's own report (litres, GPS, photo) and the hydrant fill are independent records,
// checked against the colony's report.
const getPosition = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  // The browser's own timeout only starts after the permission prompt is answered, so a driver who ignores
  // the prompt would wait forever. Give up after 12 s: the report is still sent, marked "No GPS".
  const giveUp = setTimeout(() => resolve(null), 12000);
  navigator.geolocation.getCurrentPosition(
    (p) => { clearTimeout(giveUp); resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }); },
    () => { clearTimeout(giveUp); resolve(null); }, // denied or unavailable: still recorded, marked "No GPS"
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
});

async function reportDelivery(btn, requestId, litresInput, photoInput) {
  await run(btn, async () => {
    const litres = parseInt(litresInput.value, 10);
    btn.innerHTML = `${ic("pin")} ${L("Getting location…", "लोकेशन ले रहे हैं…")}`;
    const location = await getPosition();
    const photo = photoInput && photoInput.files[0] ? await compressPhoto(photoInput.files[0]) : null;
    const r = await sendOrQueue(`/requests/${requestId}/deliver`, { litresDelivered: litres, ...(location ? { location } : {}) },
      L("Delivery report", "डिलीवरी रिपोर्ट"));
    if (photo) await sendOrQueue(`/requests/${requestId}/photo`, { image: photo }, L("Delivery photo", "डिलीवरी फ़ोटो"));
    if (!r) return;
    toast(r.driverFarFromColony
      ? L("Recorded, but your location is far from the colony. It is flagged for review.", "दर्ज हुआ, पर आपकी लोकेशन कॉलोनी से दूर है। जाँच के लिए चिह्नित।")
      : r.verification === "disputed" ? L("Recorded. Your number differs from the colony's, so it is marked disputed.", "दर्ज हुआ। आपकी संख्या कॉलोनी से अलग है, इसलिए विवादित।")
        : L("Delivery recorded. Tanker is free for the next trip.", "डिलीवरी दर्ज। टैंकर अगली ट्रिप के लिए खाली।"),
      !r.driverFarFromColony && r.verification !== "disputed");
  });
  loadDriver();
}

async function loadDriver() {
  const box = $("driver-main");
  if (!isRole("driver")) {
    box.innerHTML = `<div class="card">
      <h2 class="card-title"><span class="icon-box green">${ic("truck")}</span>${L("Driver app", "ड्राइवर ऐप")}</h2>
      <p class="text-sm muted mt-1 mb-4">${L("Drivers log the fill at the hydrant, start the trip, and record each delivery with litres, GPS and a photo. Works without signal: actions are sent when the phone is back online. Add it to your home screen from the browser menu.",
        "ड्राइवर हाइड्रेंट पर भराई दर्ज करते हैं, ट्रिप शुरू करते हैं, और हर डिलीवरी लीटर, GPS और फ़ोटो के साथ दर्ज करते हैं। बिना नेटवर्क भी चलता है। ब्राउज़र मेन्यू से होम स्क्रीन पर जोड़ें।")}</p>
      ${signInPrompt("Sign in with your driver account.", "अपने ड्राइवर खाते से साइन इन करें।")}</div>`;
    const [tankers, active] = await Promise.all([api("/tankers"), api("/requests?status=ASSIGNED,ON_THE_WAY")]);
    box.insertAdjacentHTML("afterbegin", `<div class="card reveal"><h2 class="card-title mb-4">${L("Tanker Fleet Status", "टैंकर बेड़े की स्थिति")}</h2>${fleetTable(tankers, active)}</div>`);
    return;
  }
  await flushOutbox();
  if (!colonies.length) await loadColonies();
  const driver = me();
  if (!driver) return;
  const tankerId = driver.tankerId;
  const [tankers, trips] = await Promise.all([api("/tankers"), api(`/requests?tankerId=${encodeURIComponent(tankerId)}`)]);
  if (me() !== driver) return; // signed out (or switched account) while loading
  const tanker = tankers.find((t) => t.tankerId === tankerId) || {};
  const cap = tanker.capacityLitres || 10000;
  const colonyOf = (r) => colonies.find((c) => c.colonyId === r.colonyId) || {};
  const current = trips.find((r) => r.status === "ASSIGNED" || r.status === "ON_THE_WAY");
  const toCheck = trips.filter(needsDriverReading);
  const done = trips.filter((r) => r.status === "DELIVERED")
    .sort((a, b) => (b.deliveredAt || "").localeCompare(a.deliveredAt || "")).slice(0, 8);
  const queued = readOutbox();
  const offDuty = tanker.status === "OFF_DUTY";

  const head = `<div class="card reveal flex items-center gap-3 flex-wrap">
    <div class="tanker-icon" style="background:var(--green-soft);color:var(--green)">${ic("truck", "w-5 h-5")}</div>
    <div class="flex-1 min-w-0"><div class="font-extrabold text-lg">${esc(tankerId)} · ${esc(driver.name)}</div>
      <div class="text-xs muted">${L(`${fmtL(cap)} L capacity`, `क्षमता ${fmtL(cap)} लीटर`)}</div></div>
    ${tanker.status === "BUSY" ? `<span class="badge ON_THE_WAY">${L("On a trip", "ट्रिप पर")}</span>`
      : `<button id="btn-shift" class="btn ${offDuty ? "btn-success" : "btn-ghost"} py-2">${offDuty ? L("Go on duty", "ड्यूटी शुरू") : L("Go off duty", "ड्यूटी ख़त्म")}</button>`}
  </div>
  ${queued.length ? `<div class="view-only"><span class="inline-flex items-center gap-2">${ic("clock")} ${L(`${queued.length} action(s) waiting for network`, `${queued.length} काम नेटवर्क का इंतज़ार कर रहे हैं`)}</span>
    <button id="btn-flush" class="btn btn-ghost py-2">${L("Send now", "अभी भेजें")}</button></div>` : ""}`;

  const fillCard = (!current || !current.fillId) ? `<div class="card reveal" style="--i:1">
    <h2 class="card-title"><span class="icon-box">${ic("drop")}</span>${L("Log fill at hydrant", "हाइड्रेंट पर भराई दर्ज करें")}</h2>
    <p class="text-xs muted mt-1">${current
      ? L("Record how much you filled for this trip. It is compared with what you deliver.", "इस ट्रिप के लिए कितना भरा, दर्ज करें। इसे डिलीवरी से मिलाया जाता है।")
      : L("You have no trip assigned. A fill without a trip is flagged for the ward officer.", "आपकी कोई ट्रिप तय नहीं है। बिना ट्रिप भराई वार्ड अधिकारी को दिखाई जाएगी।")}</p>
    <div class="flex flex-wrap gap-2 mt-3">
      <input id="fill-litres" aria-label="${esc(L("Litres filled", "कितना भरा (लीटर)"))}" type="number" inputmode="numeric" min="1" max="${cap}" value="${cap}" class="field py-2.5" style="width:9rem">
      <button id="btn-fill" class="btn btn-primary py-2.5">${ic("drop")} ${L("Log fill", "भराई दर्ज करें")}</button>
    </div></div>` : "";

  let trip;
  if (current) {
    const c = colonyOf(current);
    const map = c.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}` : "";
    trip = `<div class="card reveal" style="--i:2">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h2 class="card-title"><span class="icon-box">${ic("send")}</span>${L("Current trip", "मौजूदा ट्रिप")}</h2>
        <div class="flex items-center gap-2"><button id="btn-trip-listen" class="btn btn-ghost py-1.5 px-3 text-sm">${ic("speaker")} ${L("Listen", "सुनें")}</button>${badge(current.status)}</div></div>
      <div class="trip-colony mt-4">${esc(cname(current))}</div>
      <div class="meta">
        <span>${ic("clock", "w-3.5 h-3.5")} ETA <b class="text-slate-800">${esc(current.eta)}</b></span>
        ${c.households ? `<span>${ic("users", "w-3.5 h-3.5")} ${c.households} ${L("households", "घर")}</span>` : ""}
        ${current.filledLitres ? `<span class="text-emerald-700">${ic("drop", "w-3.5 h-3.5")} ${L(`filled ${fmtL(current.filledLitres)} L`, `${fmtL(current.filledLitres)} लीटर भरा`)}</span>` : ""}
        ${map ? `<a class="text-sky-700 font-semibold inline-flex items-center gap-1" href="${map}" target="_blank" rel="noopener">${ic("pin", "w-3.5 h-3.5")} ${L("Directions", "रास्ता देखें")}</a>` : ""}
      </div>
      ${current.note ? `<div class="note mt-4">${ic("chat")}<span>“${esc(current.note)}”</span></div>` : ""}
      ${current.status === "ASSIGNED" ? `<button id="btn-start" class="btn btn-violet btn-lg w-full mt-5">${ic("play", "w-5 h-5")} ${L("Start trip", "ट्रिप शुरू करें")}</button>` : ""}
      <div class="mt-5">
        <label class="block font-semibold" for="drv-litres">${L("Litres delivered", "कितना पानी दिया (लीटर)")}</label>
        <input id="drv-litres" type="number" inputmode="numeric" min="1" max="${cap}" value="${current.filledLitres || cap}" class="field text-lg mt-2">
        <label class="photo-pick mt-3" for="drv-photo">${ic("camera", "w-5 h-5")}<span id="drv-photo-label">${L("Add photo at the colony (recommended)", "कॉलोनी पर फ़ोटो जोड़ें (ज़रूरी सलाह)")}</span></label>
        <input id="drv-photo" type="file" accept="image/*" capture="environment" hidden>
        <button id="btn-delivered" class="btn btn-success btn-lg w-full mt-3">${ic("check", "w-5 h-5")} ${L("Water delivered", "पानी दे दिया")}</button>
        <p class="text-xs muted mt-2 flex gap-2">${ic("pin", "w-4 h-4 flex-none")}<span>${L("Location and photo are saved with the delivery and checked against the hydrant fill and the colony's own report.",
          "लोकेशन और फ़ोटो डिलीवरी के साथ सहेजे जाते हैं और भराई व कॉलोनी की रिपोर्ट से मिलाए जाते हैं।")}</span></p>
      </div>
      ${timeline(current)}
    </div>`;
  } else {
    trip = `<div class="card reveal" style="--i:2"><div class="empty">${ic("truck", "w-8 h-8")}<b class="text-slate-800">${L("No trip right now", "अभी कोई ट्रिप नहीं")}</b>
      ${offDuty ? L("You are off duty.", "आप ड्यूटी पर नहीं हैं।") : L("The dispatcher will assign your next trip. This page updates by itself.", "डिस्पैचर आपकी अगली ट्रिप तय करेंगे। यह पेज अपने आप अपडेट होता है।")}</div></div>`;
  }

  const pending = toCheck.length ? `<div class="card reveal" style="--i:3">
    <h2 class="card-title"><span class="icon-box">${ic("info")}</span>${L("Add your reading", "अपनी रिपोर्ट जोड़ें")}</h2>
    <p class="text-xs muted mt-1">${L("The colony reported these before you did.", "कॉलोनी ने ये आपसे पहले दर्ज किए।")}</p>
    <ul class="space-y-3 mt-4">${toCheck.map((r) => `<li class="panel">
      <div class="font-semibold">${esc(cname(r))} · <span class="muted text-sm">${fmtTime(r.deliveredAt)}</span></div>
      <div class="flex flex-wrap gap-2 mt-2">
        <input data-late-litres="${esc(r.requestId)}" aria-label="${esc(L("Litres delivered", "कितना पानी दिया"))}" type="number" inputmode="numeric" min="1" max="${cap}" value="${cap}" class="field py-2.5" style="width:9rem">
        <button data-late="${esc(r.requestId)}" class="btn btn-success py-2.5">${ic("check")} ${L("Record", "दर्ज करें")}</button>
      </div></li>`).join("")}</ul></div>` : "";

  const recent = `<div class="card reveal" style="--i:4">
    <h2 class="card-title mb-3"><span class="icon-box violet">${ic("clock")}</span>${L("Recent trips", "हाल की ट्रिप")}</h2>
    <ul class="space-y-2 text-sm">${done.length ? done.map((r) => `<li class="panel">
      <div class="flex justify-between gap-3"><span class="font-semibold">${esc(cname(r))}</span><b>${fmtL(r.litresDelivered)} ${L("L", "लीटर")}</b></div>
      <div class="text-xs muted">${fmtTime(r.deliveredAt)}</div>
      <div class="mt-1.5">${verificationTag(r)}</div>${readings(r)}</li>`).join("")
      : `<li class="empty">${L("No trips yet.", "अभी कोई ट्रिप नहीं।")}</li>`}</ul></div>`;

  box.innerHTML = head + fillCard + trip + pending + recent;

  const shift = $("btn-shift");
  if (shift) shift.onclick = (e) => run(e.currentTarget, async () => {
    await post(`/tankers/${encodeURIComponent(tankerId)}/status`, { status: offDuty ? "AVAILABLE" : "OFF_DUTY" });
    toast(offDuty ? L("You are on duty", "आप ड्यूटी पर हैं") : L("You are off duty", "आपकी ड्यूटी ख़त्म"));
    loadDriver();
  });
  if ($("btn-flush")) $("btn-flush").onclick = () => flushOutbox().then(loadDriver);
  if ($("btn-fill")) $("btn-fill").onclick = (e) => run(e.currentTarget, async () => {
    e.currentTarget.innerHTML = `${ic("pin")} ${L("Getting location…", "लोकेशन ले रहे हैं…")}`;
    const location = await getPosition();
    const f = await sendOrQueue("/fills", { litres: parseInt($("fill-litres").value, 10), ...(location ? { location } : {}) },
      L("Hydrant fill", "हाइड्रेंट भराई"));
    if (f) toast(f.farFromFillPoint
      ? L(`Recorded, but ${f.fillPointDistanceM} m from the nearest hydrant. Flagged for review.`, `दर्ज हुआ, पर नज़दीकी हाइड्रेंट से ${f.fillPointDistanceM} मीटर दूर। जाँच के लिए चिह्नित।`)
      : L(`Fill recorded${f.fillPointName ? ` at ${f.fillPointName}` : ""}`, `भराई दर्ज${f.fillPointName ? ` (${f.fillPointName})` : ""}`), !f.farFromFillPoint);
    loadDriver();
  });
  if (current && current.status === "ASSIGNED") {
    $("btn-start").onclick = (e) => run(e.currentTarget, async () => {
      if (await sendOrQueue(`/requests/${current.requestId}/dispatch`, {}, L("Trip start", "ट्रिप शुरू")))
        toast(L("Trip started. Drive safe!", "ट्रिप शुरू। सुरक्षित चलाएँ!"));
      loadDriver();
    });
  }
  if (current) {
    $("btn-trip-listen").onclick = (e) => run(e.currentTarget, async () => speak(L(
      `Next trip: ${cname(current)}. Expected at ${current.eta}. ${current.note ? `Message from the colony: ${current.note}` : ""}`,
      `अगली ट्रिप: ${cname(current)}। ${current.eta} बजे तक पहुँचना है। ${current.note ? `कॉलोनी का संदेश: ${current.note}` : ""}`)));
    $("drv-photo").onchange = () => {
      const f = $("drv-photo").files[0];
      $("drv-photo-label").textContent = f ? L(`Photo ready: ${f.name}`, `फ़ोटो तैयार: ${f.name}`) : L("Add photo at the colony (recommended)", "कॉलोनी पर फ़ोटो जोड़ें");
    };
    $("btn-delivered").onclick = (e) => reportDelivery(e.currentTarget, current.requestId, $("drv-litres"), $("drv-photo"));
  }
  box.querySelectorAll("[data-late]").forEach((btn) => {
    btn.onclick = () => reportDelivery(btn, btn.dataset.late, box.querySelector(`[data-late-litres="${btn.dataset.late}"]`));
  });
}

// ---------------- Ward officer view ----------------
const REVIEW_TYPES = {
  disputed: ["Driver and colony disagree", "ड्राइवर और कॉलोनी की संख्या अलग"],
  waiting_too_long: ["Colony waiting over 24 hours", "कॉलोनी 24 घंटे से ज़्यादा इंतज़ार में"],
  complaint_overdue: ["Complaint unanswered for 2 days", "शिकायत 2 दिन से बिना जवाब"],
  over_report: ["Colony reported more than was filled", "कॉलोनी ने भरे से ज़्यादा बताया"],
  no_fill: ["Delivered without a hydrant fill", "बिना हाइड्रेंट भराई के डिलीवरी"],
  gps_far: ["Driver GPS far from colony", "ड्राइवर GPS कॉलोनी से दूर"],
  short_delivery: ["Water missing between hydrant and colony", "हाइड्रेंट और कॉलोनी के बीच पानी गायब"],
  auto_closed: ["Nobody reported the delivery", "किसी ने डिलीवरी दर्ज नहीं की"],
  fill_without_trip: ["Tanker filled with no trip", "बिना ट्रिप टैंकर भरा"],
  fill_not_delivered: ["Filled, but the trip was cancelled", "भरा, पर ट्रिप रद्द हुई"],
  fill_far: ["Fill logged far from any hydrant", "हाइड्रेंट से दूर भराई दर्ज"],
};
const COMPLAINT_LABELS = {
  no_show: ["Tanker did not come", "टैंकर नहीं आया"], short_water: ["Less water than recorded", "दर्ज से कम पानी"],
  dirty_water: ["Dirty water", "गंदा पानी"], bribe: ["Asked for money", "पैसे माँगे"],
  behaviour: ["Bad behaviour", "बुरा बर्ताव"], other: ["Other", "अन्य"],
};
const openPanels = new Set(); // officer panels kept open across auto-refresh

async function showPhoto(requestId, holder) {
  const res = await fetch(`${API}/requests/${encodeURIComponent(requestId)}/photo`, { headers: { authorization: `Bearer ${session.token}` } });
  if (!res.ok) throw new Error(L("No photo for this delivery", "इस डिलीवरी की फ़ोटो नहीं"));
  holder.innerHTML = `<img class="evidence" alt="${L("Delivery photo", "डिलीवरी फ़ोटो")}" src="${URL.createObjectURL(await res.blob())}">`;
}

// Ward setup: a small map to pick where a new colony or hydrant is.
let setupMap = null, setupPick = null, setupPickMarker = null;
function wireSetup(cols, hydrants) {
  if (window.L && $("setup-map")) {
    setupMap = Leaf().map("setup-map", { scrollWheelZoom: false });
    Leaf().tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(setupMap);
    const pts = [];
    cols.forEach((c) => { if (c.lat != null) { pts.push([c.lat, c.lon]); Leaf().circleMarker([c.lat, c.lon], { radius: 7, color: "#fff", weight: 2, fillColor: "#1f9d55", fillOpacity: .9 }).bindTooltip(esc(cname(c))).addTo(setupMap); } });
    hydrants.forEach((h) => { if (h.lat != null) { pts.push([h.lat, h.lon]); Leaf().circleMarker([h.lat, h.lon], { radius: 6, color: "#fff", weight: 2, fillColor: "#1f6fd1", fillOpacity: .9 }).bindTooltip(esc(h.name)).addTo(setupMap); } });
    if (pts.length) setupMap.fitBounds(pts, { padding: [20, 20] }); else setupMap.setView([28.615, 77.215], 12);
    const mark = () => {
      if (setupPickMarker) setupPickMarker.remove();
      if (setupPick) setupPickMarker = Leaf().marker(setupPick).addTo(setupMap);
      $("setup-picked").textContent = setupPick ? L(`Picked: ${setupPick[0].toFixed(5)}, ${setupPick[1].toFixed(5)}`, `चुना: ${setupPick[0].toFixed(5)}, ${setupPick[1].toFixed(5)}`) : "";
    };
    setupMap.on("click", (e) => { setupPick = [e.latlng.lat, e.latlng.lng]; formDirty = true; mark(); });
    mark();
    setTimeout(() => setupMap && setupMap.invalidateSize(), 60);
  }
  const needPick = () => { if (!setupPick) throw new Error(L("Tap the map to pick the location first", "पहले नक्शे पर जगह चुनें")); return { lat: setupPick[0], lon: setupPick[1] }; };
  $("add-colony").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    run(f.querySelector("button[type=submit]"), async () => {
      const c = await post("/colonies", { name: f.name.value, nameHi: f.nameHi.value, households: Number(f.households.value), ...needPick() });
      setupPick = null; colonies = [];
      toast(L(`${c.name} added. Its representative can now be given an account.`, `${c.name} जोड़ी गई। अब इसके प्रतिनिधि का खाता बनाएँ।`));
      loadOfficer();
    });
  };
  $("add-hydrant").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    run(f.querySelector("button[type=submit]"), async () => {
      await post("/hydrants", { name: f.name.value, ...needPick() });
      setupPick = null;
      toast(L("Hydrant added. Fills are now checked against it.", "हाइड्रेंट जोड़ा गया। भराई अब इससे मिलाई जाएगी।"));
      loadOfficer();
    });
  };
  document.querySelectorAll("[data-del-hydrant]").forEach((b) => (b.onclick = () => run(b, async () => {
    await post(`/hydrants/${b.dataset.delHydrant}/delete`, {});
    toast(L("Hydrant removed", "हाइड्रेंट हटाया गया"));
    loadOfficer();
  })));
  $("add-tanker").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    run(f.querySelector("button[type=submit]"), async () => {
      const t = await post("/tankers", { tankerId: f.tankerId.value, driverName: f.driverName.value, capacityLitres: Number(f.capacityLitres.value) });
      toast(L(`Tanker ${t.tankerId.toUpperCase()} added. Create a driver account for it below.`, `टैंकर ${t.tankerId.toUpperCase()} जुड़ा। नीचे इसके ड्राइवर का खाता बनाएँ।`));
      loadOfficer();
    });
  };
  document.querySelectorAll("[data-save-cap]").forEach((b) => (b.onclick = () => run(b, async () => {
    await post(`/tankers/${b.dataset.saveCap}/settings`, { capacityLitres: Number(document.querySelector(`[data-cap="${b.dataset.saveCap}"]`).value) });
    toast(L("Capacity saved", "क्षमता सहेजी गई"));
    loadOfficer();
  })));
}

async function loadOfficer() {
  const box = $("officer-main");
  if (!isRole("officer")) {
    box.innerHTML = `<div class="card">
      <h2 class="card-title"><span class="icon-box violet">${ic("shield")}</span>${L("Ward officer", "वार्ड अधिकारी")}</h2>
      <p class="text-sm muted mt-1 mb-4">${L("The ward officer reviews alerts (water missing between hydrant and colony, GPS far away, disputes), settles them, answers complaints, sets each colony's piped supply and priority, and manages accounts. Every decision is logged publicly.",
        "वार्ड अधिकारी अलर्ट देखते हैं (हाइड्रेंट और कॉलोनी के बीच गायब पानी, दूर GPS, विवाद), निपटाते हैं, शिकायतों का जवाब देते हैं, हर कॉलोनी की पाइप सप्लाई और प्राथमिकता तय करते हैं, और खाते संभालते हैं। हर फ़ैसला सार्वजनिक रूप से दर्ज होता है।")}</p>
      ${signInPrompt("Sign in with the ward officer account.", "वार्ड अधिकारी खाते से साइन इन करें।")}</div>`;
    return;
  }
  if (!colonies.length) await loadColonies();
  const [rev, requests, complaints, users, tankers, hydrants] = await Promise.all([
    api("/review"), api("/requests"), api("/complaints"), api("/users"), api("/tankers"), api("/fillpoints")]);
  const cols = await api("/colonies");
  const reqById = Object.fromEntries(requests.map((r) => [r.requestId, r]));
  const colName = (id) => { const c = cols.find((x) => x.colonyId === id); return c ? cname(c) : id || ""; };
  const openComplaints = complaints.filter((c) => c.status === "OPEN");
  const panel = (id) => (openPanels.has(id) ? "" : "hidden");

  const summary = `<div class="grid grid-cols-3 gap-2 sm:gap-3">
    ${[[rev.items.length, L("alerts to review", "जाँच के अलर्ट"), rev.items.length ? "text-rose-600" : ""],
       [rev.patterns.length, L("repeat patterns", "बार-बार के पैटर्न"), rev.patterns.length ? "text-rose-600" : ""],
       [openComplaints.length, L("open complaints", "खुली शिकायतें"), openComplaints.length ? "text-amber-600" : ""]]
      .map(([n, label, cls], i) => `<div class="stat card reveal" style="--i:${i}"><div class="stat-num ${cls}">${n}</div><div class="stat-label">${label}</div></div>`).join("")}
  </div>`;

  const patterns = rev.patterns.length ? `<div class="card reveal alarm-card">
    <h2 class="card-title"><span class="icon-box" style="background:var(--red-soft);color:var(--red)">${ic("alert")}</span>${L("Repeat patterns", "बार-बार के पैटर्न")}</h2>
    <ul class="mt-3 space-y-2 text-sm">${rev.patterns.map((p) => `<li class="panel">${p.tankerId
      ? L(`Tanker <b>${esc(p.tankerId)}</b> has ${p.count} alerts in ${p.days} days. Check this driver's trips and photos.`, `टैंकर <b>${esc(p.tankerId)}</b> पर ${p.days} दिनों में ${p.count} अलर्ट। इस ड्राइवर की ट्रिप और फ़ोटो जाँचें।`)
      : L(`<b>${esc(colName(p.colonyId))}</b> has ${p.count} alerts in ${p.days} days. Consider a site visit.`, `<b>${esc(colName(p.colonyId))}</b> पर ${p.days} दिनों में ${p.count} अलर्ट। मौके पर जाँच करें।`)}</li>`).join("")}</ul></div>` : "";

  const items = `<div class="card reveal">
    <h2 class="card-title"><span class="icon-box">${ic("shield")}</span>${L("Alerts to review", "जाँच के अलर्ट")}</h2>
    <p class="text-xs muted mt-1">${L("From three independent records: the hydrant fill, the driver's report (GPS, photo) and the colony's report. Last 30 days.",
      "तीन अलग रिकॉर्ड से: हाइड्रेंट भराई, ड्राइवर की रिपोर्ट (GPS, फ़ोटो) और कॉलोनी की रिपोर्ट। पिछले 30 दिन।")}</p>
    <ul class="space-y-3 mt-4">${rev.items.length ? rev.items.map((it, i) => {
      const r = it.requestId ? reqById[it.requestId] : null;
      const key = it.fillId ? `fill-${it.fillId}` : `req-${it.requestId}-${it.type}`;
      const canResolve = r && r.status === "DELIVERED" && !it.fillId;
      const escalation = it.type === "waiting_too_long" || it.type === "complaint_overdue";
      return `<li class="q-item reveal" style="--i:${i}">
        <div class="flex justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <div class="font-bold flex items-center gap-2">${ic(it.severity >= 3 ? "alert" : "info", "w-4 h-4 " + (it.severity >= 3 ? "text-rose-600" : "text-amber-600"))}${L(...(REVIEW_TYPES[it.type] || [it.type, it.type]))}</div>
            <div class="text-sm muted mt-0.5">${[it.colonyId && esc(colName(it.colonyId)), it.tankerId && esc(it.tankerId), fmtTime(it.at)].filter(Boolean).join(" · ")}</div>
            <div class="text-sm mt-1">${esc(it.detail)}</div>
          </div>
          <div class="flex gap-2 flex-wrap items-start">
            ${r && r.photoKey ? `<button class="btn btn-ghost py-2" data-photo="${esc(r.requestId)}" data-holder="${esc(key)}">${ic("camera")} ${L("Photo", "फ़ोटो")}</button>` : ""}
            ${escalation ? (it.type === "waiting_too_long"
              ? `<button class="btn btn-ghost py-2" data-goview="dispatcher">${L("Open queue", "सूची खोलें")} ${ic("arrowR")}</button>`
              : `<button class="btn btn-ghost py-2" data-goto="officer-complaints">${L("Answer it", "जवाब दें")} ${ic("arrowR")}</button>`)
            : `<button class="btn btn-ghost py-2" data-toggle="${esc(key)}">${canResolve ? L("Resolve", "निपटाएँ") : L("Mark reviewed", "जाँच हो गई")}</button>`}
          </div>
        </div>
        <div data-photo-holder="${esc(key)}"></div>
        ${r ? timeline(r) : ""}
        ${escalation ? "" : `<div class="panel mt-3" data-panel="${esc(key)}" ${panel(key)}>
          ${canResolve ? `<div class="text-xs muted mb-2">${readings(r) || ""}</div>
            <div class="flex flex-wrap gap-2">
              <input data-resolve-litres="${esc(key)}" type="number" inputmode="numeric" min="1" max="10000" value="${r.litresDelivered}" class="field py-2.5" style="width:9rem" aria-label="${L("Litres to count", "गिनने वाले लीटर")}">
              <input data-resolve-note="${esc(key)}" aria-label="${esc(L("What you found", "आपको क्या मिला"))}" class="field py-2.5 flex-1" style="min-width:12rem" placeholder="${L("What you found (shown publicly)", "आपको क्या मिला (सार्वजनिक)")}">
              <button class="btn btn-success py-2.5" data-resolve="${esc(r.requestId)}" data-key="${esc(key)}">${ic("check")} ${L("Settle", "निपटाएँ")}</button>
            </div>`
          : `<div class="flex flex-wrap gap-2">
              <input data-review-note="${esc(key)}" aria-label="${esc(L("Note", "टिप्पणी"))}" class="field py-2.5 flex-1" style="min-width:12rem" placeholder="${L("Note (optional)", "टिप्पणी (वैकल्पिक)")}">
              <button class="btn btn-success py-2.5" ${it.fillId ? `data-review-fill="${esc(it.fillId)}"` : `data-ack="${esc(it.requestId)}"`} data-key="${esc(key)}">${ic("check")} ${L("Done", "हो गया")}</button>
            </div>`}
        </div>`}
      </li>`;
    }).join("") : `<li class="empty">${ic("check", "w-8 h-8")}<b class="text-slate-800">${L("Nothing to review", "जाँच के लिए कुछ नहीं")}</b></li>`}</ul></div>`;

  const complaintsCard = `<div class="card reveal" id="officer-complaints">
    <h2 class="card-title"><span class="icon-box violet">${ic("chat")}</span>${L("Complaints", "शिकायतें")}</h2>
    <ul class="space-y-3 mt-4">${openComplaints.length ? openComplaints.map((c) => `<li class="q-item">
      <div class="flex justify-between gap-2 flex-wrap"><b>${esc(c.complaintId)} · ${L(...(COMPLAINT_LABELS[c.type] || [c.type, c.type]))}</b>
        <span class="text-xs muted">${esc(colName(c.colonyId))} · ${fmtTime(c.createdAt)} · ${esc(c.byRef || "")}</span></div>
      <p class="text-sm mt-2">${esc(c.text || "")}</p>
      <div class="flex flex-wrap gap-2 mt-3">
        <input data-complaint-note="${esc(c.complaintId)}" aria-label="${esc(L("What was done", "क्या किया गया"))}" class="field py-2.5 flex-1" style="min-width:12rem" placeholder="${L("What was done (shown publicly)", "क्या किया गया (सार्वजनिक)")}">
        <button class="btn btn-success py-2.5" data-complaint="${esc(c.complaintId)}">${ic("check")} ${L("Resolve", "निपटाएँ")}</button>
      </div></li>`).join("") : `<li class="empty">${L("No open complaints.", "कोई खुली शिकायत नहीं।")}</li>`}</ul>
    <p class="text-xs muted mt-3">${L(`${complaints.length - openComplaints.length} resolved, listed on the Public tab.`, `${complaints.length - openComplaints.length} निपटाई गईं, सार्वजनिक टैब पर।`)}</p></div>`;

  const settings = `<div class="card reveal">
    <h2 class="card-title"><span class="icon-box">${ic("users")}</span>${L("Colony need settings", "कॉलोनी ज़रूरत सेटिंग")}</h2>
    <p class="text-xs muted mt-1">${L("Piped supply counts towards water received. A priority weight above 1 (for a clinic, school…) lowers the colony's need score. Every change is published.",
      "पाइप सप्लाई मिले पानी में जुड़ती है। 1 से ऊपर प्राथमिकता (क्लिनिक, स्कूल…) ज़रूरत स्कोर घटाती है। हर बदलाव सार्वजनिक होता है।")}</p>
    <div class="table-wrap mt-4" tabindex="0"><table class="data">
      <thead><tr><th>${L("Colony", "कॉलोनी")}</th><th>${L("Households", "घर")}</th><th>${L("Piped L/person/week", "पाइप लीटर/व्यक्ति/हफ़्ता")}</th><th>${L("Priority ×", "प्राथमिकता ×")}</th><th>${L("Public reason", "सार्वजनिक कारण")}</th><th><span class="sr-only">${L("Actions", "कार्य")}</span></th></tr></thead>
      <tbody>${cols.map((c) => `<tr>
        <td class="font-semibold">${esc(cname(c))}${c.changes && c.changes.length ? `<div class="text-[11px] muted">${L(`${c.changes.length} change(s), last ${fmtTime(c.changes[c.changes.length - 1].at)}`, `${c.changes.length} बदलाव`)}</div>` : ""}</td>
        <td><input class="field py-1.5" style="width:6rem" type="number" min="1" data-set="households" data-colony="${esc(c.colonyId)}" aria-label="${esc(cname(c))}: ${L("households", "घर")}" value="${c.households}"></td>
        <td><input class="field py-1.5" style="width:6rem" type="number" min="0" step="1" data-set="pipedLitresPerPerson7d" data-colony="${esc(c.colonyId)}" aria-label="${esc(cname(c))}: ${L("piped litres per person per week", "पाइप लीटर/व्यक्ति/हफ़्ता")}" value="${c.pipedLitresPerPerson7d || 0}"></td>
        <td><input class="field py-1.5" style="width:5rem" type="number" min="1" max="2" step="0.05" data-set="priorityWeight" data-colony="${esc(c.colonyId)}" aria-label="${esc(cname(c))}: ${L("priority weight", "प्राथमिकता")}" value="${c.priorityWeight || 1}"></td>
        <td><input class="field py-1.5" style="min-width:10rem" data-set="priorityReason" data-colony="${esc(c.colonyId)}" aria-label="${esc(cname(c))}: ${L("public reason", "सार्वजनिक कारण")}" value="${esc(c.priorityReason || "")}"></td>
        <td><button class="btn btn-ghost py-1.5" data-save-colony="${esc(c.colonyId)}">${L("Save", "सहेजें")}</button></td>
      </tr>`).join("")}</tbody></table></div></div>`;

  const setup = `<div class="card reveal" id="ward-setup">
    <h2 class="card-title"><span class="icon-box green">${ic("pin")}</span>${L("Ward setup", "वार्ड सेटअप")}</h2>
    <p class="text-sm muted mt-1">${L("Tap the map to pick a location, then add a colony or hydrant there. Add tankers and change their capacity below.",
      "नक्शे पर जगह चुनें, फिर वहाँ कॉलोनी या हाइड्रेंट जोड़ें। नीचे टैंकर जोड़ें और क्षमता बदलें।")}</p>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      <div>
        <div id="setup-map" class="map" style="min-height:300px" role="region" aria-label="${esc(L("Map for picking a location", "जगह चुनने का नक्शा"))}"></div>
        <p class="text-sm mt-2" id="setup-picked">${setupPick ? L(`Picked: ${setupPick[0].toFixed(5)}, ${setupPick[1].toFixed(5)}`, `चुना: ${setupPick[0].toFixed(5)}, ${setupPick[1].toFixed(5)}`) : L("No location picked yet.", "अभी कोई जगह नहीं चुनी।")}</p>
      </div>
      <div class="space-y-4">
        <form id="add-colony" class="panel space-y-2">
          <b>${L("Add colony", "कॉलोनी जोड़ें")}</b>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input class="field py-2" name="name" required placeholder="${L("Name", "नाम")}" aria-label="${L("Colony name", "कॉलोनी का नाम")}">
            <input class="field py-2" name="nameHi" placeholder="${L("Name in Hindi", "हिंदी में नाम")}" aria-label="${L("Colony name in Hindi", "हिंदी में नाम")}">
            <input class="field py-2" name="households" type="number" min="1" required placeholder="${L("Households", "घर")}" aria-label="${L("Households", "घर")}">
          </div>
          <button class="btn btn-primary py-2" type="submit">${ic("pin")} ${L("Add at picked location", "चुनी जगह पर जोड़ें")}</button>
        </form>
        <form id="add-hydrant" class="panel space-y-2">
          <b>${L("Hydrants", "हाइड्रेंट")}</b>
          <ul class="text-sm space-y-1">${hydrants.map((h) => `<li class="flex justify-between items-center gap-2"><span class="inline-flex items-center gap-2"><span class="map-hydrant mini">${ic("drop", "w-2.5 h-2.5")}</span>${esc(h.name)}</span>
            <button type="button" class="btn btn-danger py-1 px-2.5 text-xs" data-del-hydrant="${esc(h.id)}" aria-label="${esc(L(`Remove ${h.name}`, `${h.name} हटाएँ`))}">${ic("x", "w-3.5 h-3.5")}</button></li>`).join("")}</ul>
          <div class="flex gap-2 flex-wrap">
            <input class="field py-2 flex-1" style="min-width:10rem" name="name" required placeholder="${L("New hydrant name", "नए हाइड्रेंट का नाम")}" aria-label="${L("Hydrant name", "हाइड्रेंट का नाम")}">
            <button class="btn btn-primary py-2" type="submit">${ic("drop")} ${L("Add at picked location", "चुनी जगह पर जोड़ें")}</button>
          </div>
        </form>
      </div>
    </div>
    <form id="add-tanker" class="panel mt-4 space-y-3">
      <b>${L("Tankers", "टैंकर")}</b>
      <div class="table-wrap" tabindex="0"><table class="data"><thead><tr><th>${L("Number", "नंबर")}</th><th>${L("Driver", "ड्राइवर")}</th><th>${L("Capacity (L)", "क्षमता (लीटर)")}</th><th><span class="sr-only">${L("Actions", "कार्य")}</span></th></tr></thead>
        <tbody>${tankers.map((t) => `<tr><td class="font-bold">${esc(t.tankerId.toUpperCase())}</td><td>${esc(t.driverName)}</td>
          <td><input class="field py-1.5" style="width:7rem" type="number" min="1000" max="50000" step="500" value="${t.capacityLitres}" data-cap="${esc(t.tankerId)}" aria-label="${esc(L(`Capacity of ${t.tankerId}`, `${t.tankerId} की क्षमता`))}"></td>
          <td><button type="button" class="btn btn-ghost py-1.5" data-save-cap="${esc(t.tankerId)}">${L("Save", "सहेजें")}</button></td></tr>`).join("")}</tbody></table></div>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input class="field py-2" name="tankerId" required placeholder="${L("Number, e.g. DL-1L-4521", "नंबर, जैसे DL-1L-4521")}" aria-label="${L("Tanker number", "टैंकर नंबर")}">
        <input class="field py-2" name="driverName" required placeholder="${L("Driver name", "ड्राइवर का नाम")}" aria-label="${L("Driver name", "ड्राइवर का नाम")}">
        <input class="field py-2" name="capacityLitres" type="number" min="1000" max="50000" step="500" value="10000" aria-label="${L("Capacity in litres", "क्षमता (लीटर)")}">
        <button class="btn btn-primary py-2" type="submit">${ic("truck")} ${L("Add tanker", "टैंकर जोड़ें")}</button>
      </div>
    </form>
  </div>`;
  const roleLabel = (r) => (ROLE[r] ? L(...ROLE[r]) : r);
  const accounts = `<div class="card reveal">
    <h2 class="card-title"><span class="icon-box green">${ic("lock")}</span>${L("Accounts", "खाते")}</h2>
    <form id="add-user" class="grid grid-cols-1 sm:grid-cols-6 gap-2 mt-4">
      <input class="field py-2.5 sm:col-span-2" name="phone" aria-label="${L("Mobile number", "मोबाइल नंबर")}" type="tel" inputmode="numeric" placeholder="${L("Mobile number", "मोबाइल नंबर")}" required>
      <input class="field py-2.5 sm:col-span-2" name="name" aria-label="${L("Name", "नाम")}" placeholder="${L("Name", "नाम")}" required>
      <select class="field py-2.5 sm:col-span-2" name="role" aria-label="${L("Role", "भूमिका")}">
        <option value="colony">${roleLabel("colony")}</option><option value="driver">${roleLabel("driver")}</option><option value="dispatcher">${roleLabel("dispatcher")}</option>
      </select>
      <select class="field py-2.5 sm:col-span-3" name="colonyId" aria-label="${L("Colony", "कॉलोनी")}">${cols.map((c) => `<option value="${esc(c.colonyId)}">${esc(cname(c))}</option>`).join("")}</select>
      <select class="field py-2.5 sm:col-span-3" name="tankerId" aria-label="${L("Tanker", "टैंकर")}" hidden>${tankers.map((t) => `<option value="${esc(t.tankerId)}">${esc(t.tankerId)} (${esc(t.driverName)})</option>`).join("")}</select>
      <input class="field py-2.5 sm:col-span-2" name="pin" aria-label="${L("PIN", "पिन")}" type="password" inputmode="numeric" minlength="6" maxlength="8" placeholder="${L("PIN (6-8 digits)", "पिन (6-8 अंक)")}" required>
      <button class="btn btn-primary py-2.5 sm:col-span-1" type="submit">${L("Add", "जोड़ें")}</button>
    </form>
    <div class="table-wrap mt-4" tabindex="0"><table class="data">
      <thead><tr><th>${L("Name", "नाम")}</th><th>${L("Role", "भूमिका")}</th><th>${L("Mobile", "मोबाइल")}</th><th><span class="sr-only">${L("Actions", "कार्य")}</span></th></tr></thead>
      <tbody>${users.map((u) => `<tr class="${u.disabled ? "opacity-50" : ""}">
        <td>${esc(u.name)}<div class="text-[11px] muted">${esc(u.colonyId ? colName(u.colonyId) : u.tankerId || "")}</div></td>
        <td><span class="role-dot role-${esc(u.role)} inline-block mr-1"></span>${roleLabel(u.role)}</td>
        <td class="muted">${esc(u.phone)}</td>
        <td>${u.role === "officer" ? "" : `<button class="btn btn-ghost py-1.5" data-disable="${esc(u.phone)}" data-to="${u.disabled ? "false" : "true"}">${u.disabled ? L("Enable", "चालू करें") : L("Disable", "बंद करें")}</button>`}</td>
      </tr>`).join("")}</tbody></table></div></div>`;

  if (setupMap) { setupMap.remove(); setupMap = null; }
  box.innerHTML = summary + patterns + items + complaintsCard + settings + setup + accounts;
  wireSetup(cols, hydrants);
  box.querySelectorAll("[data-goview]").forEach((b) => (b.onclick = () => showView(b.dataset.goview)));
  box.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => $(b.dataset.goto).scrollIntoView({ behavior: "smooth" })));

  box.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = () => {
    const k = b.dataset.toggle, p = box.querySelector(`[data-panel="${k}"]`);
    p.hidden = !p.hidden;
    p.hidden ? openPanels.delete(k) : openPanels.add(k);
  }));
  box.querySelectorAll("[data-photo]").forEach((b) => (b.onclick = () =>
    run(b, () => showPhoto(b.dataset.photo, box.querySelector(`[data-photo-holder="${b.dataset.holder}"]`)))));
  box.querySelectorAll("[data-resolve]").forEach((b) => (b.onclick = () => run(b, async () => {
    const k = b.dataset.key;
    await post(`/requests/${b.dataset.resolve}/resolve`, {
      litresDelivered: parseInt(box.querySelector(`[data-resolve-litres="${k}"]`).value, 10),
      note: box.querySelector(`[data-resolve-note="${k}"]`).value });
    openPanels.delete(k);
    toast(L("Settled. The decision is in the public record.", "निपट गया। फ़ैसला सार्वजनिक रिकॉर्ड में है।"));
    loadOfficer();
  })));
  box.querySelectorAll("[data-review-fill]").forEach((b) => (b.onclick = () => run(b, async () => {
    await post(`/fills/${b.dataset.reviewFill}/review`, { note: box.querySelector(`[data-review-note="${b.dataset.key}"]`).value });
    openPanels.delete(b.dataset.key);
    toast(L("Marked reviewed", "जाँच दर्ज"));
    loadOfficer();
  })));
  box.querySelectorAll("[data-ack]").forEach((b) => (b.onclick = () => run(b, async () => {
    // Auto-closed or GPS alerts on a delivery: settle at the recorded litres with the officer's note.
    const r = reqById[b.dataset.ack];
    await post(`/requests/${b.dataset.ack}/resolve`, { litresDelivered: r.litresDelivered,
      note: box.querySelector(`[data-review-note="${b.dataset.key}"]`).value || "Reviewed by ward officer; figure confirmed" });
    openPanels.delete(b.dataset.key);
    toast(L("Marked reviewed", "जाँच दर्ज"));
    loadOfficer();
  })));
  box.querySelectorAll("[data-complaint]").forEach((b) => (b.onclick = () => run(b, async () => {
    await post(`/complaints/${b.dataset.complaint}/resolve`, { note: box.querySelector(`[data-complaint-note="${b.dataset.complaint}"]`).value });
    toast(L("Complaint resolved", "शिकायत निपटाई गई"));
    loadOfficer();
  })));
  box.querySelectorAll("[data-save-colony]").forEach((b) => (b.onclick = () => run(b, async () => {
    const id = b.dataset.saveColony, body = {};
    box.querySelectorAll(`[data-colony="${id}"]`).forEach((inp) => {
      body[inp.dataset.set] = inp.dataset.set === "priorityReason" ? inp.value : Number(inp.value);
    });
    await post(`/colonies/${id}/settings`, body);
    toast(L("Saved. The queue now uses the new numbers.", "सहेजा गया। सूची अब नए आँकड़ों से चलेगी।"));
    loadOfficer();
  })));
  box.querySelectorAll("[data-disable]").forEach((b) => (b.onclick = () => run(b, async () => {
    await post(`/users/${b.dataset.disable}/disable`, { disabled: b.dataset.to === "true" });
    loadOfficer();
  })));
  const form = $("add-user");
  const syncRole = () => {
    form.colonyId.hidden = form.role.value !== "colony";
    form.tankerId.hidden = form.role.value !== "driver";
  };
  form.role.onchange = syncRole;
  syncRole();
  form.onsubmit = (e) => {
    e.preventDefault();
    run(form.querySelector("button[type=submit]"), async () => {
      const body = { phone: form.phone.value, name: form.name.value, role: form.role.value, pin: form.pin.value };
      if (body.role === "colony") body.colonyId = form.colonyId.value;
      if (body.role === "driver") body.tankerId = form.tankerId.value;
      await post("/users", body);
      toast(L(`Account added. Give the PIN to ${body.name} in person.`, `खाता जुड़ गया। पिन ${body.name} को ख़ुद दें।`));
      loadOfficer();
    });
  };
}

// ---------------- Public view: ledger, fairness dashboard, overrides, complaints, open data ----------------
const SERIES = { tanker: "#3b82c4", piped: "#0f9d76" }; // validated for the white surface (dataviz validator)

async function loadLedger() {
  const [rows, st, ovr, complaints] = await Promise.all([api("/ledger"), api("/stats"), api("/overrides"), api("/complaints")]);
  if (!colonies.length) await loadColonies();
  const colName = (id) => { const c = colonies.find((x) => x.colonyId === id); return c ? cname(c) : id || ""; };
  const max = Math.max(1, ...rows.map((r) => r.totalPerPerson7d));
  const total = rows.reduce((s, r) => s + (r.litres7d || 0), 0);
  const avg = rows.length ? rows.reduce((s, r) => s + r.totalPerPerson7d, 0) / rows.length : 0;
  const low = rows.filter((r) => r.totalPerPerson7d < LOW_LPP).length;

  const stats = $("ledger-stats");
  stats.innerHTML = [
    ["drop", num(total, "stat-total"), L("tanker litres, 7 days", "टैंकर पानी (लीटर), 7 दिन"), ""],
    ["users", num(avg, "stat-avg", 1), L("avg L / person (tanker + piped)", "औसत लीटर / व्यक्ति (टैंकर + पाइप)"), "violet"],
    ["alert", num(low, "stat-low"), L(`colonies under ${LOW_LPP} L`, `${LOW_LPP} लीटर से कम वाली कॉलोनी`), low ? "red" : "green"],
  ].map(([icon, value, label, tone], i) => `
    <div class="stat card reveal" style="--i:${i}">
      <span class="icon-box ${tone === "red" ? "" : tone}" ${tone === "red" ? 'style="background:var(--red-soft);color:var(--red)"' : ""}>${ic(icon)}</span>
      <div class="stat-num mt-3 ${tone === "red" ? "text-rose-600" : ""}">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`).join("");
  animateCounts(stats);

  // Fairness dashboard: one headline number each, so a councillor can read it in five seconds.
  const fairness = Math.round((1 - st.equity.gini) * 100);
  const verifiedShare = st.deliveries30d ? Math.round(100 * ((st.verification30d.verified || 0) + (st.verification30d.resolved || 0)) / st.deliveries30d) : 0;
  const hrs = (h) => (h == null ? "–" : L(`${h} h`, `${h} घंटे`));
  const dash = $("ledger-dash");
  dash.innerHTML = [
    [num(fairness, "dash-fair"), L("fairness score (100 = everyone got the same)", "निष्पक्षता स्कोर (100 = सबको बराबर)")],
    [hrs(st.medianHoursToAssign30d), L("median wait for a tanker", "टैंकर के लिए औसत इंतज़ार")],
    [hrs(st.medianHoursToDeliver30d), L("median request to water", "अनुरोध से पानी तक औसत समय")],
    [`${num(verifiedShare, "dash-ver")}%`, L("deliveries verified by both sides (30 days)", "दोनों तरफ़ से पुष्ट डिलीवरी (30 दिन)")],
  ].map(([value, label], i) => `<div class="stat card reveal" style="--i:${i}"><div class="stat-num">${value}</div><div class="stat-label">${label}</div></div>`).join("");
  animateCounts(dash);
  renderImpact($("ledger-impact"), st.impact);

  const deliveries = rows.reduce((s, r) => s + (r.deliveries7d || 0), 0);
  const disputed = rows.reduce((s, r) => s + (r.disputed7d || 0), 0);
  const oneSide = rows.reduce((s, r) => s + (r.unverified7d || 0), 0);
  $("ledger-trust").innerHTML = deliveries ? `
    <span class="chip chip-green">${ic("check", "w-3 h-3")} ${L(`${deliveries - disputed - oneSide} of ${deliveries} deliveries verified by both sides`,
      `${deliveries} में से ${deliveries - disputed - oneSide} डिलीवरी दोनों तरफ़ से पुष्ट`)}</span>
    ${disputed ? `<span class="chip chip-red">${ic("alert", "w-3 h-3")} ${L(`${disputed} disputed`, `${disputed} विवादित`)}</span>` : ""}
    ${oneSide ? `<span class="chip chip-amber">${ic("info", "w-3 h-3")} ${L(`${oneSide} reported by one side only`, `${oneSide} सिर्फ़ एक तरफ़ से`)}</span>` : ""}` : "";

  $("ledger-legend").innerHTML = `
    <span class="inline-flex items-center gap-1.5"><span class="swatch" style="background:${SERIES.tanker}"></span>${L("By tanker", "टैंकर से")}</span>
    <span class="inline-flex items-center gap-1.5"><span class="swatch" style="background:${SERIES.piped}"></span>${L("Piped supply (estimate)", "पाइप सप्लाई (अनुमान)")}</span>`;

  const thresholdPct = (LOW_LPP / max) * 100;
  const bars = $("ledger-bars");
  bars.innerHTML = rows.map((r, i) => {
    const crit = r.totalPerPerson7d < LOW_LPP;
    const key = r.colonyId || r.colonyName;
    const tip = L(`${cname(r)}: ${r.litresPerPerson7d} L by tanker + ${r.pipedPerPerson7d} L piped = ${r.totalPerPerson7d} L per person; ${fmtL(r.litres7d)} L delivered`,
      `${cname(r)}: टैंकर ${r.litresPerPerson7d} + पाइप ${r.pipedPerPerson7d} = ${r.totalPerPerson7d} लीटर प्रति व्यक्ति`);
    return `
    <div class="reveal" style="--i:${i}" title="${esc(tip)}">
      <div class="flex justify-between items-baseline gap-3 text-sm">
        <span class="font-semibold truncate">${esc(cname(r))}</span>
        <span class="whitespace-nowrap"><b class="text-base text-slate-900">${num(r.totalPerPerson7d, `l-${key}`, 1)}</b>
          <span class="muted text-xs">${L("L/person", "लीटर/व्यक्ति")}</span></span>
      </div>
      <div class="bar bar-stack">
        <div class="seg" style="background:${SERIES.tanker}" data-w="${(r.litresPerPerson7d / max) * 100}" data-key="wt-${esc(key)}"></div>
        ${r.pipedPerPerson7d ? `<div class="seg" style="background:${SERIES.piped}" data-w="${(r.pipedPerPerson7d / max) * 100}" data-key="wp-${esc(key)}"></div>` : ""}
        ${max > LOW_LPP ? `<span class="threshold" style="left:${thresholdPct}%"></span>` : ""}
      </div>
      <div class="mt-1.5">
        ${crit ? `<span class="chip chip-red">${ic("alert", "w-3 h-3")} ${L("Critical", "गंभीर")}</span>` : ""}
        ${r.priorityWeight && r.priorityWeight !== 1 ? `<span class="chip chip-violet">×${r.priorityWeight} ${esc(r.priorityReason || "")}</span>` : ""}
        ${r.disputed7d ? `<span class="chip chip-red">${ic("alert", "w-3 h-3")} ${L(`${r.disputed7d} disputed`, `${r.disputed7d} विवादित`)}</span>` : ""}
        ${r.unverified7d ? `<span class="chip chip-amber">${L(`${r.unverified7d} one-sided`, `${r.unverified7d} एकतरफ़ा`)}</span>` : ""}
      </div>
    </div>`;
  }).join("") || `<div class="empty">${ic("drop", "w-7 h-7")}${L("No deliveries recorded yet.", "अभी तक कोई डिलीवरी दर्ज नहीं।")}</div>`;
  animateCounts(bars);

  // Fairness over time: a single series, so the title names it and each of the 4 bars carries its value.
  const weeks = st.weeks.map((w) => ({ label: w.weekEnding.slice(5), score: Math.round((1 - w.gini) * 100) }));
  $("ledger-trend").innerHTML = `
    <h2 class="card-title"><span class="icon-box">${ic("chart")}</span>${L("Fairness score, last 4 weeks", "निष्पक्षता स्कोर, पिछले 4 हफ़्ते")}</h2>
    <p class="text-xs muted mt-1">${L("100 means every colony got the same water per person. Based on the Gini index of the week's water per person.",
      "100 का मतलब हर कॉलोनी को प्रति व्यक्ति बराबर पानी मिला। हफ़्ते के प्रति व्यक्ति पानी के गिनी इंडेक्स पर आधारित।")}</p>
    <div class="trend mt-4" role="img" aria-label="${esc(weeks.map((w) => `${w.label}: ${w.score}`).join(", "))}">
      ${weeks.map((w) => `<div class="trend-col" title="${L(`Week ending ${w.label}: ${w.score}`, `${w.label} तक का हफ़्ता: ${w.score}`)}">
        <div class="trend-val">${w.score}</div>
        <div class="trend-bar"><div style="height:${Math.max(2, w.score)}%;background:${SERIES.tanker}"></div></div>
        <div class="trend-label">${esc(w.label)}</div></div>`).join("")}
    </div>`;

  $("ledger-overrides").innerHTML = `
    <h2 class="card-title"><span class="icon-box violet">${ic("alert")}</span>${L("Queue overrides, last 30 days", "सूची से हटकर भेजे गए टैंकर, 30 दिन")}</h2>
    <p class="text-xs muted mt-1">${L("Emergencies can jump the queue, but only with a written reason, published here.", "आपात स्थिति में सूची से हटकर भेजा जा सकता है, पर सिर्फ़ लिखित कारण के साथ, जो यहाँ दिखता है।")}</p>
    <ul class="space-y-2 mt-4 text-sm">${ovr.length ? ovr.map((o) => `<li class="panel">
      <div class="flex justify-between gap-2 flex-wrap"><b>${esc(cname(o))}</b><span class="text-xs muted">${fmtTime(o.at)} · ${esc(o.by)}</span></div>
      <div class="mt-1">“${esc(o.reason)}”</div>
      <div class="text-xs muted mt-1">${L(`Skipped: ${esc((o.skipped || []).join(", "))}`, `पीछे छोड़े: ${esc((o.skipped || []).join(", "))}`)}</div></li>`).join("")
      : `<li class="empty">${L("No overrides. Every tanker went by the queue.", "कोई नहीं। हर टैंकर सूची के क्रम से गया।")}</li>`}</ul>`;

  $("ledger-complaints").innerHTML = `
    <h2 class="card-title"><span class="icon-box">${ic("chat")}</span>${L("Complaints board", "शिकायत बोर्ड")}</h2>
    <p class="text-xs muted mt-1">${L("Every complaint gets a ticket. Names and details stay private; the outcome is public.", "हर शिकायत को टिकट मिलता है। नाम और विवरण निजी रहते हैं, नतीजा सार्वजनिक।")}</p>
    <div class="table-wrap mt-4" tabindex="0"><table class="data">
      <thead><tr><th>${L("Ticket", "टिकट")}</th><th>${L("Problem", "समस्या")}</th><th>${L("Colony", "कॉलोनी")}</th><th>${L("Status", "स्थिति")}</th></tr></thead>
      <tbody>${complaints.length ? complaints.map((c) => `<tr>
        <td class="font-semibold whitespace-nowrap">${esc(c.complaintId)}<div class="text-[11px] muted">${fmtTime(c.createdAt)}</div></td>
        <td>${L(...(COMPLAINT_LABELS[c.type] || [c.type, c.type]))}</td>
        <td>${esc(colName(c.colonyId))}</td>
        <td>${c.status === "RESOLVED" ? `<span class="chip chip-green">${ic("check", "w-3 h-3")} ${L("Resolved", "निपटा")}</span><div class="text-xs muted">${esc(c.resolutionNote || "")}</div>`
          : `<span class="chip ${hoursSince(c.createdAt) > 48 ? "chip-red" : "chip-amber"}">${ic("clock", "w-3 h-3")} ${hoursSince(c.createdAt) > 48
            ? L(`Overdue · open ${ago(c.createdAt)}`, `देर · ${ago(c.createdAt)} से खुला`) : L(`Open ${ago(c.createdAt)}`, `${ago(c.createdAt)} से खुला`)}</span>`}</td>
      </tr>`).join("") : `<tr><td colspan="4" class="muted">${L("No complaints.", "कोई शिकायत नहीं।")}</td></tr>`}</tbody></table></div>`;

  $("ledger-open").innerHTML = `
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div><h2 class="card-title"><span class="icon-box green">${ic("download")}</span>${L("Open data", "खुला डेटा")}</h2>
        <p class="text-xs muted mt-1">${L("Every request and delivery as a spreadsheet, for journalists, NGOs and researchers. No names or phone numbers.",
          "हर अनुरोध और डिलीवरी स्प्रेडशीट में, पत्रकारों, संस्थाओं और शोधकर्ताओं के लिए। कोई नाम या फ़ोन नंबर नहीं।")}</p></div>
      <a class="btn btn-ghost" href="${API}/export/deliveries.csv" download>${ic("download")} CSV</a>
    </div>`;
}

// ---------------- Start ----------------
applyStatic();
if (!API) {
  toast(L("API_URL is not set in config.js", "config.js में API_URL सेट नहीं है"), false);
}
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
let startView = "overview";
try { startView = localStorage.getItem("view") || "overview"; } catch {}
if (location.hash) startView = location.hash.slice(1); // e.g. /#dispatcher for demos
renderAccount();
showView(["overview", "colony", "dispatcher", "driver", "officer", "ledger"].includes(startView) ? startView : "overview");

// Local docker only: one-click reset of the demo data.
if (/localhost|127\.0\.0\.1/.test(API)) {
  const reset = $("reset-demo");
  reset.hidden = false;
  reset.onclick = (e) => {
    e.preventDefault();
    run(null, async () => {
      await post("/local/seed");
      toast(L("Demo data reset", "डेमो डेटा रीसेट"));
      refresh();
    });
  };
}
flushOutbox();
