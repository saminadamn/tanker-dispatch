"""Reset all tables and load demo data, including demo sign-in accounts.

Run after deploy with:
  aws lambda invoke --function-name <FunctionName> --payload fileb://seed-event.json out.json

Demo accounts (phone / PIN) -- do NOT seed a real deployment, add real users with addUser instead:
  Dispatcher              9000000001 / 246810
  Ward officer            9000000002 / 135790
  Drivers tnk-01..03      9000000011..13 / 111111
  Colony reps col-01..07  9000000101..107 / 123456
"""
import uuid
from datetime import datetime, timedelta, timezone

import json
import os

import assist
import auth
import insights
import ranking
import store

# The ward's hydrants / filling stations, stored in the Colonies table (kind="hydrant") so the officer can edit them.
DEFAULT_HYDRANTS = [
    {"id": "fp-1", "name": "Rajghat hydrant", "lat": 28.6400, "lon": 77.2490},
    {"id": "fp-2", "name": "ITO filling station", "lat": 28.6290, "lon": 77.2410},
    {"id": "fp-3", "name": "Jhandewalan booster", "lat": 28.6440, "lon": 77.2000},
]

# id, name, Hindi name, households, (lat, lon), piped L/person/week, priority weight, priority reason
COLONIES = [
    ("col-01", "Shanti Nagar", "शांति नगर", 120, (28.6280, 77.2190), 0, 1, ""),
    ("col-02", "Indira Colony", "इंदिरा कॉलोनी", 200, (28.6050, 77.2310), 0, 1, ""),
    ("col-03", "Ambedkar Basti", "अंबेडकर बस्ती", 160, (28.5930, 77.2050), 0, 1.25, "Primary health centre"),
    ("col-04", "Gandhi Vihar", "गांधी विहार", 90, (28.6390, 77.1980), 60, 1, ""),
    ("col-05", "Nehru Enclave", "नेहरू एन्क्लेव", 140, (28.6150, 77.1870), 140, 1, ""),
    ("col-06", "Subhash Mohalla", "सुभाष मोहल्ला", 220, (28.5990, 77.2240), 0, 1.1, "Government girls' school"),
    ("col-07", "Kabir Nagar", "कबीर नगर", 80, (28.6220, 77.2400), 20, 1, ""),
]

TANKERS = [
    ("tnk-01", "Ramesh", (28.6120, 77.2120)),
    ("tnk-02", "Suresh", (28.6200, 77.1990)),
    ("tnk-03", "Farida", (28.6010, 77.2290)),
]

DEMO_PINS = {"dispatcher": "246810", "officer": "135790", "driver": "111111", "colony": "123456"}

# (colonyId, days ago, driver litres, colony litres, filled at hydrant) -- None means not reported.
PAST_DELIVERIES = [
    ("col-04", 1, 10000, 10000, 10000), ("col-04", 3, 10000, 9800, 10000), ("col-04", 5, 10000, 10000, None),
    ("col-05", 2, 10000, 10000, 10000), ("col-05", 4, 10000, None, 10000), ("col-05", 6, 8000, 8000, None),
    ("col-07", 1, 10000, 10000, 10000), ("col-07", 4, 9000, 6000, 10000),   # disputed: 3,000 L apart
    ("col-01", 3, 7000, 7000, 10000),                                      # short: 3,000 L missing since the hydrant
    ("col-02", 6, 9000, 9000, 9000),
    ("col-06", 12, 10000, 10000, None),  # older than 7 days, should not count
]

# (colonyId, hours ago, note) -- open requests so the ranking shows on first load
PENDING = [
    ("col-03", 5, "अंबेडकर बस्ती में 4 दिन से पानी नहीं आया, बच्चे बीमार हैं"),
    ("col-06", 3, ""),
    ("col-02", 4, ""),
    ("col-04", 6, ""),
    ("col-01", 2, "Shanti Nagar, garmi bahut hai, peene ka paani khatam"),
]

# Index into PAST_DELIVERIES: trips that arrived 70 minutes late, and chlorine readings other than the usual 0.5 mg/L.
LATE_TRIPS = {1, 7, 8}
CHLORINE_READINGS = {7: 0.1, 3: 1.4}   # 0.1 is below the BIS minimum (unsafe); 1.4 is safe but strong

COMPLAINTS = [
    ("col-02", "no_show", "Tanker was promised at 4 pm but never came. We waited the whole evening.", 5, None),
    ("col-07", "dirty_water", "Water from yesterday's tanker was brown and smelled bad.", 3,
     "Tanker tnk-02 sent for cleaning; chlorine test now logged before every trip."),
]


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def clear(table, key):
    for item in store.scan_all(table):
        table.delete_item(Key={key: item[key]})


def demo_users():
    users = [("9000000001", "Asha (dispatcher)", "dispatcher", {}),
             ("9000000002", "Meena (ward officer)", "officer", {})]
    users += [(f"90000000{11 + i}", driver, "driver", {"tankerId": tid}) for i, (tid, driver, _) in enumerate(TANKERS)]
    users += [(f"9000000{101 + i}", f"{name} rep", "colony", {"colonyId": cid})
              for i, (cid, name, *_rest) in enumerate(COLONIES)]
    return [{"phone": phone, "name": name, "role": role, "pinHash": auth.hash_pin(DEMO_PINS[role]), **extra}
            for phone, name, role, extra in users]


def run():
    import app  # for reconcile()

    now = datetime.now(timezone.utc)
    for table, key in ((store.colonies_table, "colonyId"), (store.tankers_table, "tankerId"),
                       (store.requests_table, "requestId"), (store.users_table, "phone"),
                       (store.fills_table, "fillId"), (store.complaints_table, "complaintId")):
        clear(table, key)

    with store.colonies_table.batch_writer() as w:
        for colony_id, name, name_hi, households, (lat, lon), piped, weight, reason in COLONIES:
            w.put_item(Item=store.to_ddb({"colonyId": colony_id, "name": name, "nameHi": name_hi,
                                          "households": households, "lat": lat, "lon": lon,
                                          "pipedLitresPerPerson7d": piped, "priorityWeight": weight,
                                          "priorityReason": reason, "repPhone": "+9198xxxxxxxx"}))

        hydrants = json.loads(os.environ.get("FILL_POINTS") or "null") or DEFAULT_HYDRANTS
        for h in hydrants:
            w.put_item(Item=store.to_ddb({"colonyId": h["id"], "kind": "hydrant", "name": h["name"],
                                          "lat": h["lat"], "lon": h["lon"]}))

    with store.tankers_table.batch_writer() as w:
        for tanker_id, driver, (lat, lon) in TANKERS:
            w.put_item(Item=store.to_ddb({"tankerId": tanker_id, "capacityLitres": 10000, "driverName": driver,
                                          "status": "AVAILABLE", "lastLat": lat, "lastLon": lon}))

    users = demo_users()
    with store.users_table.batch_writer() as w:
        for user in users:
            w.put_item(Item=user)

    fills, delivered_items = [], []
    with store.requests_table.batch_writer() as w:
        for i, (colony_id, days, driver_l, colony_l, filled) in enumerate(PAST_DELIVERIES):
            delivered = now - timedelta(days=days, hours=i % 5)
            tanker_id = TANKERS[i % len(TANKERS)][0]
            litres, verification = app.reconcile(driver_l, colony_l)
            item = {
                "requestId": str(uuid.uuid4()), "colonyId": colony_id, "status": "DELIVERED",
                "createdAt": iso(delivered - timedelta(hours=6)), "assignedAt": iso(delivered - timedelta(hours=3)),
                "tankerId": tanker_id, "eta": "--",
                "litresDelivered": litres, "deliveredAt": iso(delivered), "verification": verification,
            }
            # Trip distance vs. the average free tanker at the time, for the environmental impact numbers.
            item["tripKm"] = round(1.1 + (i % 4) * 0.6, 2)
            item["altKm"] = round(item["tripKm"] + 1.2 + (i % 3) * 0.8, 2)
            # Promised arrival: most trips on time, a few late (for the punctuality scorecard).
            late = i in LATE_TRIPS
            item["promisedAt"] = iso(delivered - timedelta(minutes=-70 if late else 10))
            if driver_l is not None:
                item["driverLitres"] = driver_l
            if colony_l is not None:
                item["colonyLitres"] = colony_l
            if filled:
                fill_id = f"F-seed{i:04d}"
                item.update({"fillId": fill_id, "filledLitres": filled})
                chlorine = CHLORINE_READINGS.get(i, 0.5)
                status = insights.chlorine_status(chlorine)
                item.update({"chlorineMgL": chlorine, "chlorineStatus": status, "waterSafe": status != "unsafe"})
                fills.append({"fillId": fill_id, "tankerId": tanker_id, "litres": filled, "requestId": item["requestId"],
                              "at": iso(delivered - timedelta(hours=2)), "by": "demo", "fillPointId": "fp-1",
                              "fillPointName": "Rajghat hydrant", "fillPointDistanceM": 40, "farFromFillPoint": False,
                              "chlorineMgL": chlorine, "chlorineStatus": status})
            if colony_id == "col-07" and days == 1:
                item["override"] = {"reason": "Fire at Kabir Nagar market; fire brigade asked for water support",
                                    "at": iso(delivered - timedelta(hours=3)), "by": "Asha (dispatcher)",
                                    "skipped": ["Ambedkar Basti", "Subhash Mohalla"]}
            w.put_item(Item=store.to_ddb(item))
            delivered_items.append(item)
        colonies_by_id = {cid: {"colonyId": cid, "name": n, "households": hh, "pipedLitresPerPerson7d": piped,
                                "priorityWeight": wgt} for cid, n, _hi, hh, _ll, piped, wgt, _r in COLONIES}
        rows = {r["colonyId"]: r for r in ranking.ledger(colonies_by_id, delivered_items, now)}
        for colony_id, hours, note in PENDING:
            needed, loads = insights.loads_needed(rows[colony_id]["people"], rows[colony_id]["totalPerPerson7d"], 10000)
            item = {"requestId": str(uuid.uuid4()), "colonyId": colony_id, "status": "PENDING",
                    "createdAt": iso(now - timedelta(hours=hours)), "loadNumber": 1, "loadsTarget": loads,
                    "litresTarget": needed}
            if colony_id == "col-02":  # tnk-03 was assigned earlier but never came: a no-show on its scorecard
                item.update({"requeuedAt": iso(now - timedelta(hours=1)), "requeuedBy": "auto", "missedTankerId": "tnk-03"})
            if note:
                item["note"] = note
                item["signals"] = assist.find_signals(note)
                days = assist.days_without_water(note)
                if days:
                    item["daysWithoutWater"] = days
            w.put_item(Item=item)

    # A fill with no trip behind it: 10,000 L that never reached any colony.
    fills.append({"fillId": "F-seed-orphan", "tankerId": "tnk-03", "litres": 10000, "at": iso(now - timedelta(days=2)),
                  "by": "demo", "fillPointId": "fp-2", "fillPointName": "ITO filling station",
                  "fillPointDistanceM": 25, "farFromFillPoint": False, "chlorineMgL": 0.4, "chlorineStatus": "ok"})
    with store.fills_table.batch_writer() as w:
        for f in fills:
            w.put_item(Item=store.to_ddb(f))

    for i, (colony_id, kind, text, days, resolution) in enumerate(COMPLAINTS):
        rep_phone = f"9000000{100 + int(colony_id[-2:])}"
        c = {"complaintId": f"T-DEMO{i + 1}", "type": kind, "text": text, "colonyId": colony_id,
             "status": "RESOLVED" if resolution else "OPEN", "createdAt": iso(now - timedelta(days=days)),
             "byRole": "colony", "byRef": auth.mask_phone(rep_phone), "byPhone": rep_phone}
        if kind == "dirty_water":
            c["tankerId"] = "tnk-02"
        if resolution:
            c.update({"resolvedAt": iso(now - timedelta(days=days - 1)), "resolutionNote": resolution,
                      "resolvedBy": "Meena (ward officer)"})
        store.put_complaint(c)

    return {"seeded": True, "colonies": len(COLONIES), "tankers": len(TANKERS), "users": len(users),
            "deliveries": len(PAST_DELIVERIES), "pending": len(PENDING), "fills": len(fills),
            "complaints": len(COMPLAINTS)}
