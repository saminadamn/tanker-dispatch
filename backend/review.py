"""Checks, alerts and public statistics. Pure functions over lists of records, so they are easy to test.

review_queue(): things a ward officer should look at, from three independent sources of truth:
  the driver's report (litres + GPS + photo), the colony's report, and the fill logged at the hydrant.
stats(): numbers for the public dashboard.
deliveries_csv(): open data.
"""
import csv
import io
import math
from datetime import datetime, timedelta, timezone

import ranking

SHORT_TOLERANCE = 0.10      # delivered more than 10% below what was filled -> flag
FILL_POINT_RADIUS_M = 300   # a fill logged further than this from every fill point -> flag
PATTERN_DAYS = 14
PATTERN_MIN = 2             # this many flags for one tanker or colony in PATTERN_DAYS -> pattern alert
ESCALATE_WAIT_HOURS = 24    # a request waiting longer than this is escalated to the ward officer
ESCALATE_COMPLAINT_HOURS = 48


def distance_m(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(a)))


def nearest(points, lat, lon):
    """(point, distance in m) of the closest point that has coordinates, or (None, None)."""
    best = None
    for p in points:
        if p.get("lat") is None or p.get("lon") is None:
            continue
        d = distance_m(lat, lon, p["lat"], p["lon"])
        if best is None or d < best[1]:
            best = (p, d)
    return best or (None, None)


def _now(now):
    return now or datetime.now(timezone.utc)


def _recent(iso, days, now=None):
    return bool(iso) and ranking.parse_time(iso) >= _now(now) - timedelta(days=days)


def short_delivery(req):
    """Litres missing between the hydrant fill and what the driver reported delivering, or 0."""
    filled, delivered = req.get("filledLitres"), req.get("driverLitres", req.get("litresDelivered"))
    if req.get("status") != "DELIVERED" or not filled or delivered is None:
        return 0
    missing = filled - delivered
    return missing if missing > SHORT_TOLERANCE * filled else 0


def hours_since(iso, now=None):
    return (_now(now) - ranking.parse_time(iso)).total_seconds() / 3600


def review_queue(requests, fills, now=None, complaints=()):
    """Open items for the ward officer, newest first, plus repeat patterns per tanker and colony."""
    items = []
    by_id = {r["requestId"]: r for r in requests}
    # Escalations: nobody may be left waiting quietly.
    for r in requests:
        if r["status"] == "PENDING" and hours_since(r["createdAt"], now) > ESCALATE_WAIT_HOURS:
            items.append({"requestId": r["requestId"], "colonyId": r["colonyId"], "at": r["createdAt"],
                          "type": "waiting_too_long", "severity": 2,
                          "detail": f"waiting {int(hours_since(r['createdAt'], now))} h for a tanker"})
    for c in complaints:
        if c.get("status") == "OPEN" and hours_since(c["createdAt"], now) > ESCALATE_COMPLAINT_HOURS:
            items.append({"complaintId": c["complaintId"], "colonyId": c.get("colonyId"), "at": c["createdAt"],
                          "type": "complaint_overdue", "severity": 2,
                          "detail": f"{c['complaintId']} open for {int(hours_since(c['createdAt'], now) // 24)} days"})
    for r in requests:
        if r.get("resolution") or not _recent(r.get("deliveredAt") or r.get("createdAt"), 30, now):
            continue
        base = {"requestId": r["requestId"], "colonyId": r["colonyId"], "tankerId": r.get("tankerId"),
                "at": r.get("deliveredAt") or r.get("createdAt")}
        if r.get("verification") == "disputed":
            items.append({**base, "type": "disputed", "severity": 2,
                          "detail": f"driver {r.get('driverLitres')} L vs colony {r.get('colonyLitres')} L"})
        if r.get("driverFarFromColony"):
            items.append({**base, "type": "gps_far", "severity": 2,
                          "detail": f"driver GPS {r.get('driverDistanceM')} m from colony"})
        missing = short_delivery(r)
        if missing:
            items.append({**base, "type": "short_delivery", "severity": 3,
                          "detail": f"filled {r['filledLitres']} L, delivered {r.get('driverLitres', r.get('litresDelivered'))} L "
                                    f"({missing} L missing)"})
        if r.get("colonyLitres") and r.get("filledLitres") and r["colonyLitres"] > r["filledLitres"] * (1 + SHORT_TOLERANCE):
            items.append({**base, "type": "over_report", "severity": 2,
                          "detail": f"colony reported {r['colonyLitres']} L but only {r['filledLitres']} L was filled"})
        if r.get("status") == "DELIVERED" and r.get("fillRequired") and not r.get("fillId"):
            items.append({**base, "type": "no_fill", "severity": 2,
                          "detail": "delivered without a fill logged at any hydrant"})
        if r.get("verification") == "auto":
            items.append({**base, "type": "auto_closed", "severity": 1, "detail": "nobody reported this delivery"})
    for f in fills:
        if f.get("reviewedAt") or not _recent(f.get("at"), 30, now):
            continue
        base = {"fillId": f["fillId"], "tankerId": f["tankerId"], "at": f["at"], "requestId": f.get("requestId")}
        linked = by_id.get(f.get("requestId") or "")
        if not f.get("requestId"):
            items.append({**base, "type": "fill_without_trip", "severity": 3,
                          "detail": f"{f['litres']} L filled with no trip assigned"})
        elif linked and linked.get("fillId") != f["fillId"]:
            items.append({**base, "colonyId": linked["colonyId"], "type": "fill_not_delivered", "severity": 3,
                          "detail": f"{f['litres']} L filled for a trip that was cancelled"})
        if f.get("farFromFillPoint"):
            items.append({**base, "type": "fill_far", "severity": 2,
                          "detail": f"fill logged {f.get('fillPointDistanceM')} m from the nearest fill point"})

    # Repeat patterns: one flag can be an accident, several in two weeks deserve a closer look.
    patterns = []
    for key, label in (("tankerId", "tanker"), ("colonyId", "colony")):
        counts = {}
        for it in items:
            if it.get(key) and it["type"] not in ("auto_closed", "waiting_too_long", "complaint_overdue")                     and _recent(it["at"], PATTERN_DAYS, now):
                counts[it[key]] = counts.get(it[key], 0) + 1
        for who, n in counts.items():
            if n >= PATTERN_MIN:
                patterns.append({"type": f"pattern_{label}", key: who, "count": n, "days": PATTERN_DAYS, "severity": 3})
    items.sort(key=lambda it: it["at"], reverse=True)
    patterns.sort(key=lambda p: -p["count"])
    return {"items": items, "patterns": patterns}


def gini(values):
    """0 = everyone got the same, 1 = one colony got everything."""
    vals = sorted(v for v in values if v is not None)
    n, total = len(vals), sum(vals)
    if n == 0 or total == 0:
        return 0.0
    return round(sum((2 * i - n + 1) * v for i, v in enumerate(vals)) / (n * total), 3)


def _hours(a, b):
    return (ranking.parse_time(b) - ranking.parse_time(a)).total_seconds() / 3600


def _median(xs):
    xs = sorted(xs)
    if not xs:
        return None
    mid = len(xs) // 2
    return round(xs[mid] if len(xs) % 2 else (xs[mid - 1] + xs[mid]) / 2, 1)


def stats(requests, colonies, complaints, now=None):
    now = _now(now)
    delivered = [r for r in requests if r["status"] == "DELIVERED"]
    rows = ranking.ledger(colonies, delivered, now)
    totals = [r["totalPerPerson7d"] for r in rows]

    # Litres per person per colony for each of the last 4 weeks (oldest first).
    weeks = []
    for w in range(3, -1, -1):
        end = now - timedelta(days=7 * w)
        week_rows = ranking.ledger(colonies, [d for d in delivered if ranking.parse_time(d["deliveredAt"]) < end], end)
        weeks.append({"weekEnding": end.strftime("%Y-%m-%d"),
                      "colonies": {r["colonyId"]: r["totalPerPerson7d"] for r in week_rows},
                      "gini": gini([r["totalPerPerson7d"] for r in week_rows])})

    month = [r for r in requests if _recent(r.get("createdAt"), 30, now)]
    wait_assign = [_hours(r["createdAt"], r["assignedAt"]) for r in month if r.get("assignedAt")]
    wait_deliver = [_hours(r["createdAt"], r["deliveredAt"]) for r in month if r.get("deliveredAt")]
    verif = {}
    for r in month:
        if r["status"] == "DELIVERED":
            v = r.get("verification") or "unknown"
            verif[v] = verif.get(v, 0) + 1
    return {
        "equity": {"gini": gini(totals), "min": min(totals) if totals else 0, "max": max(totals) if totals else 0,
                   "minColony": rows[0]["colonyId"] if rows else None, "maxColony": rows[-1]["colonyId"] if rows else None},
        "medianHoursToAssign30d": _median(wait_assign),
        "medianHoursToDeliver30d": _median(wait_deliver),
        "deliveries30d": sum(verif.values()),
        "verification30d": verif,
        "overrides30d": sum(1 for r in month if r.get("override")),
        "openRequests": sum(1 for r in requests if r["status"] != "DELIVERED"),
        "complaints": {"open": sum(1 for c in complaints if c["status"] == "OPEN"),
                       "resolved": sum(1 for c in complaints if c["status"] == "RESOLVED")},
        "weeks": weeks,
    }


def overrides(requests, colonies, now=None, days=30):
    out = []
    for r in requests:
        o = r.get("override")
        if o and _recent(o.get("at"), days, now):
            c = colonies.get(r["colonyId"], {})
            out.append({"requestId": r["requestId"], "colonyId": r["colonyId"], "colonyName": c.get("name", r["colonyId"]),
                        "colonyNameHi": c.get("nameHi", c.get("name", "")), **o})
    return sorted(out, key=lambda o: o["at"], reverse=True)


CSV_FIELDS = ["requestId", "colonyId", "colonyName", "status", "createdAt", "assignedAt", "deliveredAt", "tankerId",
              "litresDelivered", "verification", "driverLitres", "colonyLitres", "filledLitres", "driverDistanceM",
              "overrideReason", "resolution"]


def deliveries_csv(requests, colonies):
    """Open data: every request, no phone numbers or names of people."""
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_FIELDS, extrasaction="ignore")
    w.writeheader()
    for r in sorted(requests, key=lambda r: r["createdAt"]):
        w.writerow({**r, "colonyName": colonies.get(r["colonyId"], {}).get("name", ""),
                    "overrideReason": (r.get("override") or {}).get("reason", ""),
                    "resolution": (r.get("resolution") or {}).get("note", "")})
    return buf.getvalue()
