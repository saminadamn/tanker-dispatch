"""Fairness rule.

Need is measured as recent water per person:
  tanker litres delivered (from this app) + piped supply (estimated by the ward officer, per colony).
Tanker water counts fully for 3 days and then less each day until it stops counting after 10 days,
so a colony's priority changes smoothly instead of jumping when a delivery turns exactly 7 days old.
A colony can carry a published priority weight (for example 1.25 for a clinic or a school);
its need score is total water per person divided by that weight. The queue is ordered by need score,
lowest first, then by who asked first. Every number is shown publicly.
"""
from datetime import datetime, timedelta, timezone

PEOPLE_PER_HOUSEHOLD = 5


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


FULL_WEIGHT_DAYS = 3     # tanker water counts fully for this many days...
ZERO_WEIGHT_DAYS = 10    # ...then a little less each day, and not at all after this many


def recency_weight(age_days):
    if age_days <= FULL_WEIGHT_DAYS:
        return 1.0
    if age_days >= ZERO_WEIGHT_DAYS:
        return 0.0
    return (ZERO_WEIGHT_DAYS - age_days) / (ZERO_WEIGHT_DAYS - FULL_WEIGHT_DAYS)


def litres_by_colony(delivered, now=None):
    """Per colony: (recency-weighted tanker litres used for fairness, plain litres of the last 7 days for totals)."""
    now = now or datetime.now(timezone.utc)
    weighted, last7 = {}, {}
    for d in delivered:
        if not d.get("deliveredAt"):
            continue
        age = (now - parse_time(d["deliveredAt"])).total_seconds() / 86400
        if age < 0:
            continue
        litres = d.get("litresDelivered", 0)
        weighted[d["colonyId"]] = weighted.get(d["colonyId"], 0) + litres * recency_weight(age)
        if age <= 7:
            last7[d["colonyId"]] = last7.get(d["colonyId"], 0) + litres
    return weighted, last7


def colony_need(colony, tanker_litres, litres_7d=None):
    """All the per-person numbers for one colony, given its recency-weighted tanker litres."""
    people = max(colony["households"] * PEOPLE_PER_HOUSEHOLD, 1)
    tanker_pp = tanker_litres / people
    piped_pp = float(colony.get("pipedLitresPerPerson7d") or 0)
    weight = float(colony.get("priorityWeight") or 1) or 1
    total_pp = tanker_pp + piped_pp
    return {
        "households": colony["households"],
        "people": people,
        "litres7d": round(tanker_litres if litres_7d is None else litres_7d),  # plain litres delivered in 7 days
        "litresRecent": round(tanker_litres),              # recency-weighted litres used for fairness
        "litresPerPerson7d": round(tanker_pp, 1),          # tanker water per person (recency-weighted)
        "pipedPerPerson7d": round(piped_pp, 1),            # estimated piped supply
        "totalPerPerson7d": round(total_pp, 1),            # what the colony actually had
        "priorityWeight": weight,
        "priorityReason": colony.get("priorityReason", ""),
        "needScore": round(total_pp / weight, 1),          # what the queue is sorted by
    }


def rank_requests(pending, colonies, delivered, now=None):
    litres, last7 = litres_by_colony(delivered, now)
    ranked = []
    for r in pending:
        colony = colonies.get(r["colonyId"])
        if not colony:
            continue
        ranked.append({
            **r,
            "colonyName": colony["name"],
            "colonyNameHi": colony.get("nameHi", colony["name"]),
            **colony_need(colony, litres.get(r["colonyId"], 0), last7.get(r["colonyId"], 0)),
        })
    ranked.sort(key=lambda r: (r["needScore"], r["createdAt"]))
    return ranked


UNVERIFIED = ("driver_only", "colony_only", "dispatcher", "auto")


def verification_counts(delivered, now=None):
    """Per colony, last 7 days: how many deliveries were disputed or confirmed by one side only."""
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=7)
    counts = {}
    for d in delivered:
        if d.get("deliveredAt") and parse_time(d["deliveredAt"]) >= cutoff:
            c = counts.setdefault(d["colonyId"], {"deliveries": 0, "disputed": 0, "unverified": 0})
            c["deliveries"] += 1
            if d.get("verification") == "disputed":
                c["disputed"] += 1
            elif d.get("verification") in UNVERIFIED:
                c["unverified"] += 1
    return counts


def ledger(colonies, delivered, now=None):
    litres, last7 = litres_by_colony(delivered, now)
    checks = verification_counts(delivered, now)
    rows = []
    for c in colonies.values():
        rows.append({
            "colonyId": c["colonyId"],
            "colonyName": c["name"],
            "colonyNameHi": c.get("nameHi", c["name"]),
            **colony_need(c, litres.get(c["colonyId"], 0), last7.get(c["colonyId"], 0)),
            **{f"{k}7d": v for k, v in checks.get(c["colonyId"], {"deliveries": 0, "disputed": 0,
                                                                   "unverified": 0}).items()},
        })
    rows.sort(key=lambda r: r["needScore"])
    return rows
