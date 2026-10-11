"""Heat early warning and environmental impact. Pure functions, every assumption named and published.

early_warning(): which colonies will not have enough water over the next 3 days if last week's supply
  rate continues, given that hot days raise how much water people need.
trip_distances() / impact(): distance, diesel and CO2 saved by sending the nearest free tanker instead of
  an average free one, and how much water the checks flagged as missing.
"""
import math
import os
from datetime import datetime, timedelta, timezone

import ranking
import review

# Need per person per day on a normal day. 20 L is the WHO basic-access level (drinking, cooking, basic hygiene).
BASIC_NEED_LPCD = float(os.environ.get("BASIC_NEED_LPCD", "20"))
# Hot days raise need: +4% per °C above 35°C, capped at +60%.
HEAT_BASE_C = 35.0
HEAT_PCT_PER_C = 0.04
HEAT_FACTOR_CAP = 1.6
# A loaded 10,000 L water tanker truck does roughly 3.5 km per litre of diesel; burning 1 L of diesel emits ~2.68 kg CO2.
KM_PER_LITRE_DIESEL = float(os.environ.get("TANKER_KM_PER_LITRE", "3.5"))
CO2_KG_PER_LITRE_DIESEL = 2.68


def heat_factor(max_c):
    if max_c is None:
        return 1.0
    return round(min(HEAT_FACTOR_CAP, 1 + max(0.0, max_c - HEAT_BASE_C) * HEAT_PCT_PER_C), 2)


def early_warning(ledger_rows, days, open_colony_ids, tanker_capacity=10000):
    """Per colony: share of the next 3 days' need that last week's supply rate would cover,
    the litres short, and how many tanker loads close the gap."""
    horizon = [{"date": d["date"], "maxC": d.get("maxC"), "factor": heat_factor(d.get("maxC"))} for d in days] \
        or [{"date": None, "maxC": None, "factor": 1.0}] * 3
    need_pp = [BASIC_NEED_LPCD * d["factor"] for d in horizon]
    colonies = []
    for r in ledger_rows:
        supply_pp_day = r["totalPerPerson7d"] / 7
        short_pp = sum(max(0.0, n - supply_pp_day) for n in need_pp)
        short_l = round(short_pp * r["people"])
        coverage = min(1.0, supply_pp_day * len(need_pp) / sum(need_pp)) if need_pp else 1.0
        risk = "high" if coverage < 0.5 else "medium" if coverage < 0.9 else "low"
        colonies.append({
            "colonyId": r["colonyId"], "colonyName": r["colonyName"], "colonyNameHi": r.get("colonyNameHi"),
            "people": r["people"], "supplyPerPersonDay": round(supply_pp_day, 1),
            "needPerPersonDay": [round(n, 1) for n in need_pp], "coverage": round(coverage, 2),
            "shortfallLitres": short_l, "tankerLoads": math.ceil(short_l / tanker_capacity) if short_l else 0,
            "risk": risk, "hasOpenRequest": r["colonyId"] in open_colony_ids,
        })
    colonies.sort(key=lambda c: (c["coverage"], -c["shortfallLitres"]))
    return {
        "days": horizon,
        "assumptions": {"basicNeedLpcd": BASIC_NEED_LPCD, "heatBaseC": HEAT_BASE_C,
                        "heatPctPerC": HEAT_PCT_PER_C, "heatFactorCap": HEAT_FACTOR_CAP},
        "totalShortfallLitres": sum(c["shortfallLitres"] for c in colonies),
        "colonies": colonies,
    }


def trip_distances(colony, chosen, available):
    """(trip km for the chosen tanker, average km over all free tankers) to the colony, or None without GPS."""
    if colony.get("lat") is None:
        return None

    def km(t):
        if t.get("lastLat") is None:
            return None
        return review.distance_m(t["lastLat"], t["lastLon"], colony["lat"], colony["lon"]) / 1000

    trip = km(chosen)
    others = [d for d in (km(t) for t in available) if d is not None]
    if trip is None or not others:
        return None
    return round(trip, 2), round(sum(others) / len(others), 2)


def impact(requests, fills, days=30, now=None):
    """Last `days` days: km driven and saved (round trips), diesel and CO2 saved, water flagged as missing."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    recent = lambda iso: bool(iso) and ranking.parse_time(iso) >= cutoff  # noqa: E731
    trips = [r for r in requests if r.get("tripKm") is not None and recent(r.get("assignedAt") or r.get("createdAt"))]
    km_driven = sum(2 * r["tripKm"] for r in trips)
    km_saved = sum(2 * max(0.0, r.get("altKm", r["tripKm"]) - r["tripKm"]) for r in trips)
    diesel = km_saved / KM_PER_LITRE_DIESEL
    by_id = {r["requestId"]: r for r in requests}
    missing = sum(review.short_delivery(r) for r in requests if recent(r.get("deliveredAt")))
    for f in fills:  # water filled at a hydrant that never reached a colony
        linked = by_id.get(f.get("requestId") or "")
        if recent(f.get("at")) and (not f.get("requestId") or (linked and linked.get("fillId") != f["fillId"])):
            missing += f.get("litres", 0)
    return {
        "days": days, "tripsMeasured": len(trips),
        "kmDriven": round(km_driven, 1), "kmSaved": round(km_saved, 1),
        "dieselSavedLitres": round(diesel, 1), "co2SavedKg": round(diesel * CO2_KG_PER_LITRE_DIESEL, 1),
        "missingWaterFlaggedLitres": round(missing),
        "assumptions": {"kmPerLitreDiesel": KM_PER_LITRE_DIESEL, "co2KgPerLitreDiesel": CO2_KG_PER_LITRE_DIESEL,
                        "baseline": "average distance of all free tankers at the time of assignment"},
    }


# ---------- Volume needed per request, and planning every free tanker at once ----------

# A request aims to bring the colony up to the WHO basic level for a week (20 L x 7 days per person).
TARGET_WEEKLY_LPP = BASIC_NEED_LPCD * 7
# One request asks for at most this many loads; if the colony is still short afterwards it simply asks again
# and competes in the queue like everyone else, so one big colony cannot take every tanker for a day.
MAX_LOADS_PER_REQUEST = int(os.environ.get("MAX_LOADS_PER_REQUEST", "3"))
CITY_SPEED_KMH = 18.0        # loaded tanker in city traffic
TRIP_OVERHEAD_MIN = 10       # parking, hose, paperwork


def loads_needed(people, total_pp, capacity):
    """(litres still needed to reach the weekly target, tanker loads for this request)."""
    short = max(0.0, TARGET_WEEKLY_LPP - total_pp) * people
    loads = min(MAX_LOADS_PER_REQUEST, max(1, math.ceil(short / max(capacity, 1))))
    return round(short), loads


def travel_minutes(km):
    minutes = km / CITY_SPEED_KMH * 60 + TRIP_OVERHEAD_MIN
    return int(math.ceil(minutes / 5) * 5)


def plan_dispatch(queue, tankers, colonies, hydrants=None):
    """Give every free tanker a colony, strictly in queue order; each colony gets the nearest free tanker left.
    Never skips the queue, so no override reason is needed."""
    free = [t for t in tankers if t.get("status") == "AVAILABLE"]
    plan = []
    for r in queue:
        if not free:
            break
        c = colonies.get(r["colonyId"], {})

        def km(t):
            if t.get("lastLat") is None or c.get("lat") is None:
                return None
            return review.distance_m(t["lastLat"], t["lastLon"], c["lat"], c["lon"]) / 1000

        best = min(free, key=lambda t: (km(t) is None, km(t) or 0))
        free.remove(best)
        d = km(best)
        plan.append({"requestId": r["requestId"], "colonyId": r["colonyId"], "colonyName": r.get("colonyName"),
                     "colonyNameHi": r.get("colonyNameHi"), "tankerId": best["tankerId"],
                     "driverName": best.get("driverName", ""), "km": round(d, 1) if d is not None else None,
                     "travelMinutes": trip_minutes(best, c, hydrants) if d is not None else 45})
    return plan


def trip_minutes(tanker, colony, hydrants):
    """Minutes until a free tanker arrives full: via the nearest hydrant when hydrants are set up."""
    if hydrants:
        minutes, _ = next_trip_minutes(tanker.get("lastLat"), tanker.get("lastLon"), colony, hydrants)
        return int(math.ceil(minutes / 5) * 5)
    d = _dist_km(tanker.get("lastLat"), tanker.get("lastLon"), colony.get("lat"), colony.get("lon"))
    return travel_minutes(d) if d is not None else 45


# ---------- Promised arrival times and punctuality ----------

# Arrival times are typed in the ward's local time (India: UTC+5:30).
LOCAL_OFFSET = timedelta(minutes=int(os.environ.get("WARD_UTC_OFFSET_MINUTES", "330")))
ON_TIME_GRACE_MIN = 15


def promised_at(eta, assigned_iso):
    """The promised arrival (UTC ISO) for an "HH:MM" local time given when the tanker was assigned.
    A time earlier than the assignment (by more than 30 minutes) means tomorrow. None if eta isn't HH:MM."""
    try:
        hh, mm = (int(x) for x in eta.strip().split(":"))
        if not (0 <= hh < 24 and 0 <= mm < 60):
            return None
    except (ValueError, AttributeError):
        return None
    assigned_local = ranking.parse_time(assigned_iso) + LOCAL_OFFSET
    promised_local = assigned_local.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if promised_local < assigned_local - timedelta(minutes=30):
        promised_local += timedelta(days=1)
    return (promised_local - LOCAL_OFFSET).strftime("%Y-%m-%dT%H:%M:%SZ")


def _minutes_between(a_iso, b_iso):
    return (ranking.parse_time(b_iso) - ranking.parse_time(a_iso)).total_seconds() / 60


def punctuality(requests, days=30, now=None):
    """Per tanker, last `days` days: trips with a promised time, how many arrived on time (15 min grace),
    average lateness of the late ones, and no-shows (trips taken back because the tanker never came)."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    recent = lambda iso: bool(iso) and ranking.parse_time(iso) >= cutoff  # noqa: E731
    per = {}

    def entry(tid):
        return per.setdefault(tid, {"trips": 0, "onTime": 0, "lateMinutes": [], "noShows": 0})

    for r in requests:
        tid = r.get("deliveredTankerId") or r.get("tankerId")
        if r.get("status") == "DELIVERED" and tid and r.get("promisedAt") and recent(r.get("deliveredAt")):
            e = entry(tid)
            delay = _minutes_between(r["promisedAt"], r["deliveredAt"])
            e["trips"] += 1
            if delay <= ON_TIME_GRACE_MIN:
                e["onTime"] += 1
            else:
                e["lateMinutes"].append(delay)
        if r.get("missedTankerId") and recent(r.get("requeuedAt")):
            entry(r["missedTankerId"])["noShows"] += 1
    out = {}
    for tid, e in per.items():
        late = e.pop("lateMinutes")
        out[tid] = {**e, "onTimePct": round(100 * e["onTime"] / e["trips"]) if e["trips"] else None,
                    "avgLateMin": round(sum(late) / len(late)) if late else 0}
    return out


# ---------- Water quality: free residual chlorine tested by the driver at the fill ----------

# BIS IS 10500 (Indian drinking water standard): residual free chlorine at least 0.2 mg/L.
# WHO guideline maximum is 5 mg/L; above 1 mg/L the water is safe but tastes strongly, so dosing should be checked.
CHLORINE_MIN = 0.2
CHLORINE_HIGH = 1.0
CHLORINE_MAX = 5.0


def chlorine_status(mg_l):
    if mg_l is None:
        return "untested"
    if mg_l < CHLORINE_MIN or mg_l > CHLORINE_MAX:
        return "unsafe"
    return "high" if mg_l > CHLORINE_HIGH else "ok"


def quality_summary(fills, days=30, now=None):
    """Per tanker, last `days` days: chlorine tests logged at fills, how many were safe, untested fills, last reading."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    per = {}
    for f in sorted(fills, key=lambda f: f.get("at") or ""):
        if not f.get("at") or ranking.parse_time(f["at"]) < cutoff:
            continue
        e = per.setdefault(f["tankerId"], {"fills": 0, "tested": 0, "safe": 0, "unsafe": 0,
                                           "lastChlorine": None, "lastTestAt": None})
        e["fills"] += 1
        status = chlorine_status(f.get("chlorineMgL"))
        if status != "untested":
            e["tested"] += 1
            e["lastChlorine"], e["lastTestAt"] = f["chlorineMgL"], f.get("retestedAt") or f["at"]
            if status == "unsafe":
                e["unsafe"] += 1
            else:
                e["safe"] += 1
    for e in per.values():
        e["safePct"] = round(100 * e["safe"] / e["tested"]) if e["tested"] else None
    return per


def tanker_scorecards(tankers, requests, fills, now=None):
    punct, quality = punctuality(requests, now=now), quality_summary(fills, now=now)
    empty_q = {"fills": 0, "tested": 0, "safe": 0, "unsafe": 0, "lastChlorine": None, "lastTestAt": None, "safePct": None}
    return [{"tankerId": t["tankerId"], "driverName": t.get("driverName", ""), "status": t.get("status"),
             **(punct.get(t["tankerId"]) or {"trips": 0, "onTime": 0, "onTimePct": None, "avgLateMin": 0, "noShows": 0}),
             "quality": quality.get(t["tankerId"]) or empty_q}
            for t in tankers]


# ---------- Expected arrival for every waiting colony, including tankers' repeat trips ----------

UNLOAD_MIN = 20   # emptying 10,000 L at a colony
FILL_MIN = 20     # queue + filling at the hydrant


def drive_minutes(km):
    return km / CITY_SPEED_KMH * 60


def _dist_km(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2):
        return None
    return review.distance_m(lat1, lon1, lat2, lon2) / 1000


def next_trip_minutes(lat, lon, colony, hydrants):
    """Minutes from a tanker's position to arriving full at the colony: to the nearest hydrant, fill, then drive."""
    if hydrants and lat is not None:
        hyd, dist_m = review.nearest(hydrants, lat, lon)
        if hyd:
            to_colony = _dist_km(hyd["lat"], hyd["lon"], colony.get("lat"), colony.get("lon"))
            if to_colony is not None:
                return drive_minutes(dist_m / 1000) + FILL_MIN + drive_minutes(to_colony), hyd["name"]
    direct = _dist_km(lat, lon, colony.get("lat"), colony.get("lon"))
    return (drive_minutes(direct) + TRIP_OVERHEAD_MIN if direct is not None else 45), None


def schedule(queue, tankers, active, colonies, hydrants, now=None):
    """Simulate the day forward, strictly in queue order: each waiting colony gets the tanker that can reach it
    earliest, counting busy tankers from when they finish their current trip (plus unloading), and every trip's
    drive to a hydrant and fill. Gives a realistic expected arrival for every colony in the queue."""
    now = now or datetime.now(timezone.utc)
    trip_of = {r["tankerId"]: r for r in active if r.get("tankerId")}
    state = {}
    for t in tankers:
        if t.get("status") == "OFF_DUTY":
            continue
        if t.get("status") == "AVAILABLE":
            state[t["tankerId"]] = (now, t.get("lastLat"), t.get("lastLon"), t)
            continue
        r = trip_of.get(t["tankerId"])
        c = colonies.get(r["colonyId"], {}) if r else {}
        due = ranking.parse_time(r["promisedAt"]) if r and r.get("promisedAt") else now + timedelta(minutes=30)
        state[t["tankerId"]] = (max(now, due) + timedelta(minutes=UNLOAD_MIN),
                                c.get("lat", t.get("lastLat")), c.get("lon", t.get("lastLon")), t)
    out = []
    for r in queue:
        if not state:
            break
        colony = colonies.get(r["colonyId"], {})
        best = None
        for tid, (free_at, lat, lon, t) in state.items():
            minutes, via = next_trip_minutes(lat, lon, colony, hydrants)
            arrive = free_at + timedelta(minutes=minutes)
            if best is None or arrive < best[0]:
                best = (arrive, tid, free_at, via, t)
        arrive, tid, free_at, via, t = best
        out.append({"requestId": r["requestId"], "colonyId": r["colonyId"], "tankerId": tid,
                    "driverName": t.get("driverName", ""), "tankerFreeNow": free_at <= now,
                    "startsAt": free_at.strftime("%Y-%m-%dT%H:%M:%SZ"), "arriveAt": arrive.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "viaHydrant": via})
        state[tid] = (arrive + timedelta(minutes=UNLOAD_MIN), colony.get("lat"), colony.get("lon"), t)
    return out
