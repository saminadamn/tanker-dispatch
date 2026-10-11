"""Zero-cost "assist" features: no paid AI services.

- parse_request(): match free text / browser speech-to-text (Hindi or English) to a colony
  with fuzzy matching and pick out urgency signals with keyword rules.
- explain(): plain-language reason for each queue position, built from the real numbers.
- heat_outlook(): 3-day max temperature from Open-Meteo (free, no key) plus a warning.

None of these change the ranking. Fairness comes only from ranking.rank_requests().
"""
import json
import os
import re
import time
import unicodedata
import urllib.request
from datetime import datetime, timezone
from difflib import SequenceMatcher

MATCH_THRESHOLD = 0.75

# code, English label, Hindi label, keywords (lowercase, Hindi or romanised Hindi or English)
SIGNALS = [
    ("illness", "Illness reported", "बीमारी की सूचना",
     ["बीमार", "बिमार", "दस्त", "उल्टी", "अस्पताल", "बुखार", "bimar", "beemar", "sick", "ill",
      "diarrh", "vomit", "hospital", "fever", "bukhar"]),
    ("vulnerable", "Children or elderly affected", "बच्चे या बुज़ुर्ग प्रभावित",
     ["बच्च", "बुजुर्ग", "बुज़ुर्ग", "बूढ़", "गर्भवती", "bachch", "bacch", "buzurg", "bujurg",
      "children", "child", "baby", "infant", "elderly", "old people", "pregnant"]),
    ("no_drinking", "No drinking water", "पीने का पानी नहीं",
     ["पीने", "peene", "pine ka", "drinking"]),
    ("heat", "Heat stress", "गर्मी से परेशानी",
     ["गर्मी", "गरमी", "लू", "garmi", "heat", "loo"]),
]

NUMBER_WORDS = {
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7,
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5, "chhe": 6,
    "che": 6, "saat": 7, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7,
}
DAYS_RE = re.compile(r"(\d+|\S+?)\s*(?:दिन|din|days?)(?=\s|$)")
WEEK_RE = re.compile(r"हफ्त|हफ़्त|hafte|hafta|week", re.IGNORECASE)
PUNCT_RE = re.compile(r"[.,!?;:\"'()\[\]{}\-–—।॥|/]")


def norm(text):
    text = unicodedata.normalize("NFC", text or "").lower()
    text = text.replace("ँ", "ं").replace("़", "")  # chandrabindu -> anusvara, drop nukta
    text = text.replace("्", "")  # drop halant so "शान्ति" ~ "शांति" ~ "शान्ति"
    return " ".join(PUNCT_RE.sub(" ", text).split())


def _similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()


def match_colonies(text, colonies):
    """Return colonies ranked by how well some part of the text matches their name."""
    tokens = norm(text).split()
    results = []
    for c in colonies:
        best = 0.0
        for variant in filter(None, [c.get("name"), c.get("nameHi")]):
            target = norm(variant).replace(" ", "")
            k = len(norm(variant).split())
            for size in range(1, k + 2):
                for i in range(0, max(len(tokens) - size + 1, 0)):
                    window = "".join(tokens[i:i + size])
                    best = max(best, _similarity(window, target))
        results.append({"colonyId": c["colonyId"], "name": c["name"],
                        "nameHi": c.get("nameHi", c["name"]), "score": round(best, 2)})
    results.sort(key=lambda r: r["score"], reverse=True)
    return results


def find_signals(text):
    padded = f" {norm(text)} "
    tokens = padded.split()

    def hit(word):
        kw = norm(word)
        return f" {kw} " in padded if " " in kw else any(t.startswith(kw) for t in tokens)

    found = []
    for code, en, hi, words in SIGNALS:
        if any(hit(w) for w in words):
            found.append({"code": code, "en": en, "hi": hi})
    return found


def days_without_water(text):
    t = norm(text)
    for m in DAYS_RE.finditer(t):
        word = m.group(1)
        if word.isdigit():
            n = int(word)
        else:
            n = NUMBER_WORDS.get(word)
        if n and 0 < n <= 60:
            return n
    if WEEK_RE.search(t):
        return 7
    return None


def parse_request(text, colonies):
    ranked = match_colonies(text, colonies)
    best = ranked[0] if ranked and ranked[0]["score"] >= MATCH_THRESHOLD else None
    return {
        "text": text,
        "match": best,
        "alternatives": [r for r in ranked if r["score"] >= 0.5 and r is not best][:3],
        "signals": find_signals(text),
        "daysWithoutWater": days_without_water(text),
    }


# ---------------- ranking explanation ----------------

def _hours_since(iso):
    created = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return max(0, int((datetime.now(timezone.utc) - created).total_seconds() // 3600))


def explain(ranked, ward_avg):
    """Attach a plain-language reason (English + Hindi) to each ranked request."""
    for i, r in enumerate(ranked):
        name, name_hi = r["colonyName"], r.get("colonyNameHi") or r["colonyName"]
        total, score, hours = r["totalPerPerson7d"], r["needScore"], _hours_since(r["createdAt"])
        tanker, piped, weight = r["litresPerPerson7d"], r.get("pipedPerPerson7d", 0), r.get("priorityWeight", 1)
        en = f"{name} had {total} L per person recently (tanker water counts fully for 3 days, then less each day)"
        hi = f"{name_hi} को हाल में प्रति व्यक्ति {total} लीटर पानी मिला (टैंकर का पानी 3 दिन पूरा, फिर कम गिना जाता है)"
        if r.get("loadsTarget", 1) > 1:
            en += f"; it needs about {r.get('litresTarget', 0)} L, load {r.get('loadNumber', 1)} of {r['loadsTarget']}"
            hi += f"; लगभग {r.get('litresTarget', 0)} लीटर चाहिए, {r['loadsTarget']} में से {r.get('loadNumber', 1)}वाँ टैंकर"
        if piped:
            en += f" ({tanker} L by tanker + {piped} L piped)"
            hi += f" (टैंकर से {tanker} + पाइप से {piped} लीटर)"
        en += f"; ward average {ward_avg} L."
        hi += f"; वार्ड औसत {ward_avg} लीटर।"
        if weight != 1:
            reason = r.get("priorityReason") or "published priority"
            en += f" Priority ×{weight:g} ({reason}), so it counts as {score} L."
            hi += f" प्राथमिकता ×{weight:g} ({reason}), इसलिए {score} लीटर गिना गया।"
        if i == 0:
            en += " That is the greatest need among all waiting colonies."
            hi += " इंतज़ार कर रही कॉलोनियों में सबसे ज़्यादा ज़रूरत।"
        elif score == ranked[i - 1]["needScore"]:
            en += f" Same as #{i}, which asked earlier."
            hi += f" #{i} जितना ही, पर उसने पहले माँगा था।"
        else:
            en += f" #{i} has less ({ranked[i - 1]['needScore']} L), so it goes first."
            hi += f" #{i} के पास कम ({ranked[i - 1]['needScore']} लीटर) है, इसलिए वह पहले है।"
        en += f" Waiting {hours} h."
        hi += f" {hours} घंटे से इंतज़ार।"
        r["reason"] = {"en": en, "hi": hi}
    return ranked


# ---------------- heatwave outlook ----------------

_heat_cache = {"at": 0, "data": None}


def _forecast():
    if _heat_cache["data"] and time.time() - _heat_cache["at"] < 1800:
        return _heat_cache["data"]
    lat, lon = os.environ.get("WARD_LAT", "28.61"), os.environ.get("WARD_LON", "77.21")
    url = ("https://api.open-meteo.com/v1/forecast"
           f"?latitude={lat}&longitude={lon}&daily=temperature_2m_max"
           "&timezone=Asia%2FKolkata&forecast_days=3")
    with urllib.request.urlopen(url, timeout=4) as resp:
        daily = json.loads(resp.read())["daily"]
    days = [{"date": d, "maxC": t} for d, t in zip(daily["time"], daily["temperature_2m_max"])]
    _heat_cache.update(at=time.time(), data=days)
    return days


def forecast_days(simulate_max_c=None):
    """3-day max temperatures; with simulate_max_c, tomorrow is replaced (for demos). [] if unavailable."""
    try:
        days = _forecast()
    except Exception as e:
        print("Forecast failed:", repr(e))
        days = []
    if simulate_max_c is not None:
        today = datetime.now(timezone.utc).date().isoformat()
        days = [{**d, "maxC": simulate_max_c} if i == 1 else d for i, d in enumerate(days)] \
            or [{"date": today, "maxC": simulate_max_c}]
    return days


def heat_outlook(ledger_rows, simulate_max_c=None):
    threshold = float(os.environ.get("HEAT_THRESHOLD_C", "40"))
    place = os.environ.get("WARD_NAME", "Delhi")
    days = forecast_days(simulate_max_c)
    if not days:
        return {"available": False, "place": place}
    simulated = simulate_max_c is not None
    peak = max(days, key=lambda d: d["maxC"] if d["maxC"] is not None else -99)
    peak_c = peak["maxC"] or 0
    level = "severe" if peak_c >= threshold + 5 else "heatwave" if peak_c >= threshold else "none"

    avg = (sum(r["totalPerPerson7d"] for r in ledger_rows) / len(ledger_rows)) if ledger_rows else 0
    low = [r for r in ledger_rows if r["totalPerPerson7d"] < avg][:3]
    names_en = ", ".join(r["colonyName"] for r in low) or "none"
    names_hi = ", ".join(r.get("colonyNameHi") or r["colonyName"] for r in low) or "कोई नहीं"

    if level == "none":
        msg = {"en": f"No heatwave expected in {place} (max {peak_c}°C in the next 3 days).",
               "hi": f"{place} में अगले 3 दिनों में लू की संभावना नहीं (अधिकतम {peak_c}°C)।"}
    else:
        msg = {"en": f"{peak_c}°C expected on {peak['date']}. Already low on water: {names_en}. "
                     f"Plan extra tanker rounds for them.",
               "hi": f"{peak['date']} को {peak_c}°C की संभावना। पहले से कम पानी: {names_hi}। "
                     f"इनके लिए अतिरिक्त टैंकर की योजना बनाएँ।"}
    return {"available": True, "place": place, "thresholdC": threshold, "days": days,
            "level": level, "peakC": peak_c, "peakDate": peak["date"],
            "lowColonies": [r["colonyId"] for r in low], "message": msg, "simulated": simulated}
