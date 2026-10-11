"""End-to-end tests against the running local API (docker compose). Each test reseeds the demo data.

Run:  docker compose exec api python -m unittest discover -s tests -v
Skipped automatically when the API is not reachable.
"""
import base64
import json
import os
import unittest
import urllib.error
import urllib.request

API = os.environ.get("TEST_API", "http://127.0.0.1:3001")

# A valid 1x1 JPEG, for the photo upload test.
JPEG = base64.b64encode(bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f"
    "1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000"
    "010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105"
    "122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748"
    "494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5"
    "b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbd3"
    "ffd9")).decode()


def call(method, path, body=None, token=None):
    headers = {"content-type": "application/json"} if body is not None else {}
    if token:
        headers["authorization"] = f"Bearer {token}"
    req = urllib.request.Request(API + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if r.headers.get("content-type", "").startswith("application/json") else raw)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def login(phone, pin):
    status, body = call("POST", "/auth/login", {"phone": phone, "pin": pin})
    assert status == 200, body
    return body["token"]


def api_up():
    try:
        urllib.request.urlopen(API + "/tankers", timeout=3)
        return True
    except Exception:
        return False


@unittest.skipUnless(api_up(), "local API not running")
class Api(unittest.TestCase):
    def setUp(self):
        call("POST", "/local/seed")
        self.disp = login("9000000001", "246810")
        self.officer = login("9000000002", "135790")
        self.d1 = login("9000000011", "111111")
        self.d2 = login("9000000012", "111111")

    def rep(self, colony_id):
        return login(f"9000000{100 + int(colony_id[-2:])}", "123456")

    def colony_coords(self, colony_id):
        return next(c for c in call("GET", "/colonies")[1] if c["colonyId"] == colony_id)

    def test_permissions(self):
        top = call("GET", "/queue")[1][0]
        self.assertEqual(call("POST", f"/requests/{top['requestId']}/assign", {"tankerId": "tnk-01", "eta": "18:00"})[0], 401)
        self.assertEqual(call("POST", f"/requests/{top['requestId']}/assign", {"tankerId": "tnk-01", "eta": "18:00"}, self.d1)[0], 403)
        self.assertEqual(call("GET", "/users", token=self.disp)[0], 403)
        self.assertEqual(call("GET", "/users", token=self.officer)[0], 200)
        self.assertEqual(call("POST", "/requests", {"colonyId": "col-05"}, self.rep("col-04"))[0], 403)

    def test_queue_skip_needs_public_reason(self):
        queue = call("GET", "/queue")[1]
        second = queue[1]
        status, body = call("POST", f"/requests/{second['requestId']}/assign", {"tankerId": "tnk-01", "eta": "18:00"}, self.disp)
        self.assertEqual(status, 400)
        self.assertIn("reason", body["error"])
        status, _ = call("POST", f"/requests/{second['requestId']}/assign",
                         {"tankerId": "tnk-01", "eta": "18:00", "overrideReason": "Fire at the school, urgent"}, self.disp)
        self.assertEqual(status, 200)
        self.assertTrue(any(o["requestId"] == second["requestId"] for o in call("GET", "/overrides")[1]))

    def test_full_trip_with_fill_photo_and_both_readings(self):
        top = call("GET", "/queue")[1][0]
        rid, cid = top["requestId"], top["colonyId"]
        self.assertEqual(call("POST", f"/requests/{rid}/assign", {"tankerId": "tnk-01", "eta": "18:00"}, self.disp)[0], 200)
        status, fill = call("POST", "/fills", {"litres": 10000, "location": {"lat": 28.6402, "lon": 77.2488, "accuracy": 10}}, self.d1)
        self.assertEqual(status, 201)
        self.assertEqual(fill["requestId"], rid)
        self.assertFalse(fill["farFromFillPoint"])
        self.assertEqual(call("POST", f"/requests/{rid}/dispatch", token=self.d1)[0], 200)
        c = self.colony_coords(cid)
        status, req = call("POST", f"/requests/{rid}/deliver",
                           {"litresDelivered": 9800, "location": {"lat": c["lat"], "lon": c["lon"], "accuracy": 10}}, self.d1)
        self.assertEqual((status, req["verification"], req["driverFarFromColony"]), (200, "driver_only", False))
        self.assertEqual(call("POST", f"/requests/{rid}/photo", {"image": JPEG}, self.d1)[0], 200)
        status, photo = call("GET", f"/requests/{rid}/photo", token=self.officer)
        self.assertEqual(status, 200)
        self.assertTrue(photo.startswith(b"\xff\xd8"))
        self.assertEqual(call("GET", f"/requests/{rid}/photo")[0], 401)
        status, req = call("POST", f"/requests/{rid}/confirm", {"litresDelivered": 9600}, self.rep(cid))
        self.assertEqual((status, req["verification"], req["filledLitres"]), (200, "verified", 10000))
        actions = [h["action"] for h in req["history"]]
        self.assertEqual(actions, ["assigned", "filled", "on_the_way", "driver_reported", "photo", "colony_reported"])

    def test_short_delivery_is_flagged_and_officer_resolves(self):
        top = call("GET", "/queue")[1][0]
        rid = top["requestId"]
        call("POST", f"/requests/{rid}/assign", {"tankerId": "tnk-01", "eta": "18:00"}, self.disp)
        call("POST", "/fills", {"litres": 10000}, self.d1)
        call("POST", f"/requests/{rid}/deliver", {"litresDelivered": 6000}, self.d1)
        items = call("GET", "/review", token=self.officer)[1]["items"]
        self.assertTrue(any(i["type"] == "short_delivery" and i["requestId"] == rid for i in items))
        self.assertEqual(call("POST", f"/requests/{rid}/resolve", {"litresDelivered": 6000, "note": "x"}, self.officer)[0], 400)
        status, req = call("POST", f"/requests/{rid}/resolve",
                           {"litresDelivered": 6000, "note": "Driver admits 4,000 L sold on the way; warning issued"}, self.officer)
        self.assertEqual((status, req["verification"]), (200, "resolved"))
        items = call("GET", "/review", token=self.officer)[1]["items"]
        self.assertFalse(any(i.get("requestId") == rid and not i.get("fillId") for i in items))  # fill alerts are reviewed separately

    def test_off_duty_tanker_cannot_be_assigned(self):
        self.assertEqual(call("POST", "/tankers/tnk-02/status", {"status": "OFF_DUTY"}, self.d1)[0], 403)
        self.assertEqual(call("POST", "/tankers/tnk-02/status", {"status": "OFF_DUTY"}, self.d2)[0], 200)
        top = call("GET", "/queue")[1][0]
        status, body = call("POST", f"/requests/{top['requestId']}/assign", {"tankerId": "tnk-02", "eta": "18:00"}, self.disp)
        self.assertEqual(status, 409)

    def test_colony_settings_change_ranking_and_are_logged(self):
        status, body = call("POST", "/colonies/col-05/settings", {"priorityWeight": 1.5}, self.officer)
        self.assertEqual(status, 400)  # needs a public reason
        status, col = call("POST", "/colonies/col-02/settings",
                           {"pipedLitresPerPerson7d": 500, "note": "New pipeline commissioned"}, self.officer)
        self.assertEqual(status, 200)
        self.assertEqual(col["changes"][-1]["after"], {"pipedLitresPerPerson7d": 500})
        queue = call("GET", "/queue")[1]
        self.assertEqual(queue[-1]["colonyId"], "col-02")  # now has the most water

    def test_complaints_privacy(self):
        rep = self.rep("col-03")
        status, c = call("POST", "/complaints", {"type": "bribe", "text": "Driver asked for 200 rupees to deliver"}, rep)
        self.assertEqual(status, 201)
        public = next(x for x in call("GET", "/complaints")[1] if x["complaintId"] == c["complaintId"])
        self.assertNotIn("text", public)
        self.assertNotIn("byRef", public)
        mine = next(x for x in call("GET", "/complaints", token=rep)[1] if x["complaintId"] == c["complaintId"])
        self.assertIn("text", mine)
        status, done = call("POST", f"/complaints/{c['complaintId']}/resolve", {"note": "Driver suspended, FIR filed"}, self.officer)
        self.assertEqual((status, done["status"]), (200, "RESOLVED"))

    def test_officer_manages_accounts(self):
        status, _ = call("POST", "/users", {"phone": "9811111111", "pin": "1234", "name": "New", "role": "driver",
                                            "tankerId": "tnk-03"}, self.officer)
        self.assertEqual(status, 400)  # PIN too short
        status, _ = call("POST", "/users", {"phone": "9811111111", "pin": "556677", "name": "New", "role": "driver",
                                            "tankerId": "tnk-03"}, self.officer)
        self.assertEqual(status, 201)
        self.assertEqual(call("POST", "/users/9000000013/disable", {"disabled": True}, self.officer)[0], 200)
        self.assertEqual(call("POST", "/auth/login", {"phone": "9000000013", "pin": "111111"})[0], 401)

    def test_heat_early_warning(self):
        status, cool = call("GET", "/forecast?simulateMaxC=30")
        self.assertEqual(status, 200)
        status, hot = call("GET", "/forecast?simulateMaxC=46")
        self.assertEqual(status, 200)
        self.assertGreater(hot["totalShortfallLitres"], cool["totalShortfallLitres"])  # heat raises need
        first = hot["colonies"][0]
        self.assertEqual(first["risk"], "high")
        self.assertIn("hasOpenRequest", first)
        self.assertEqual(call("GET", "/forecast?simulateMaxC=abc")[0], 400)

    def test_assign_records_trip_distance_and_impact(self):
        top = call("GET", "/queue")[1][0]
        status, req = call("POST", f"/requests/{top['requestId']}/assign", {"tankerId": "tnk-01", "eta": "18:00"}, self.disp)
        self.assertEqual(status, 200)
        self.assertGreater(req["tripKm"], 0)
        self.assertGreaterEqual(req["altKm"], 0)
        impact = call("GET", "/stats")[1]["impact"]
        self.assertGreater(impact["kmSaved"], 0)
        self.assertGreater(impact["missingWaterFlaggedLitres"], 0)  # demo data: 3,000 L short + an orphan fill

    def test_big_colony_gets_follow_up_loads_and_can_cancel(self):
        queue = call("GET", "/queue")[1]
        big = next(r for r in queue if r["colonyId"] == "col-02")  # 200 households, little water
        self.assertGreater(big["loadsTarget"], 1)
        body = {"tankerId": "tnk-01", "eta": "18:00", "overrideReason": "Testing multi-load delivery"}
        self.assertEqual(call("POST", f"/requests/{big['requestId']}/assign", body, self.disp)[0], 200)
        self.assertEqual(call("POST", f"/requests/{big['requestId']}/deliver", {"litresDelivered": 10000}, self.d1)[0], 200)
        mine = call("GET", "/requests?colonyId=col-02")[1]
        nxt = next(r for r in mine if r["status"] == "PENDING")
        self.assertEqual((nxt["loadNumber"], nxt["loadsTarget"]), (2, big["loadsTarget"]))
        self.assertEqual(nxt["createdAt"], big["createdAt"])  # keeps its original place for ties
        self.assertEqual(call("POST", f"/requests/{nxt['requestId']}/cancel", {"reason": "pipeline repaired"}, self.rep("col-03"))[0], 403)
        status, cancelled = call("POST", f"/requests/{nxt['requestId']}/cancel", {"reason": "pipeline repaired"}, self.rep("col-02"))
        self.assertEqual((status, cancelled["status"]), (200, "CANCELLED"))
        self.assertFalse(any(r["requestId"] == nxt["requestId"] for r in call("GET", "/queue")[1]))

    def test_driver_cannot_deliver_more_than_filled(self):
        top = call("GET", "/queue")[1][0]
        call("POST", f"/requests/{top['requestId']}/assign", {"tankerId": "tnk-01", "eta": "18:00"}, self.disp)
        self.assertTrue(call("GET", f"/requests?colonyId={top['colonyId']}")[1][0].get("fillRequired"))
        call("POST", "/fills", {"litres": 6000}, self.d1)
        status, body = call("POST", f"/requests/{top['requestId']}/deliver", {"litresDelivered": 9000}, self.d1)
        self.assertEqual(status, 400)
        self.assertIn("6000", body["error"])
        self.assertEqual(call("POST", f"/requests/{top['requestId']}/deliver", {"litresDelivered": 6000}, self.d1)[0], 200)

    def test_plan_all_free_tankers(self):
        self.assertEqual(call("GET", "/dispatch/plan", token=self.d1)[0], 403)
        status, plan = call("GET", "/dispatch/plan", token=self.disp)
        self.assertEqual(status, 200)
        queue = call("GET", "/queue")[1]
        self.assertEqual([p["requestId"] for p in plan], [r["requestId"] for r in queue[:len(plan)]])
        self.assertEqual(len({p["tankerId"] for p in plan}), len(plan))
        for p in plan:  # applying in order never needs an override reason
            self.assertEqual(call("POST", f"/requests/{p['requestId']}/assign", {"tankerId": p["tankerId"], "eta": "19:00"}, self.disp)[0], 200)

    def test_officer_sets_up_the_ward(self):
        status, col = call("POST", "/colonies", {"name": "Test Nagar", "households": 75, "lat": 28.61, "lon": 77.22}, self.officer)
        self.assertEqual(status, 201)
        self.assertTrue(any(c["colonyId"] == col["colonyId"] for c in call("GET", "/colonies")[1]))
        self.assertEqual(call("POST", "/colonies", {"name": "Test Nagar", "households": 75, "lat": 28.61, "lon": 77.22}, self.officer)[0], 409)
        self.assertEqual(call("POST", "/colonies", {"name": "X Nagar", "households": 75}, self.officer)[0], 400)  # no location
        self.assertEqual(call("POST", "/tankers", {"tankerId": "DL-1L-4521", "capacityLitres": 12000, "driverName": "Imran"}, self.officer)[0], 201)
        self.assertEqual(call("POST", "/tankers", {"tankerId": "dl-1l-4521", "capacityLitres": 12000, "driverName": "Imran"}, self.officer)[0], 409)
        self.assertEqual(call("POST", "/tankers/dl-1l-4521/settings", {"capacityLitres": 8000}, self.officer)[1]["capacityLitres"], 8000)
        status, hyd = call("POST", "/hydrants", {"name": "Lodhi Road hydrant", "lat": 28.59, "lon": 77.22}, self.officer)
        self.assertEqual(status, 201)
        self.assertTrue(any(h["id"] == hyd["id"] for h in call("GET", "/fillpoints")[1]))
        self.assertEqual(call("POST", f"/hydrants/{hyd['id']}/delete", {}, self.officer)[0], 200)
        self.assertFalse(any(h["id"] == hyd["id"] for h in call("GET", "/fillpoints")[1]))
        self.assertEqual(call("POST", "/hydrants", {"name": "x", "lat": 1, "lon": 1}, self.disp)[0], 403)

    def test_unsafe_water_blocks_the_trip_until_retested(self):
        top = call("GET", "/queue")[1][0]
        rid = top["requestId"]
        call("POST", f"/requests/{rid}/assign", {"tankerId": "tnk-01", "eta": "18:00"}, self.disp)
        self.assertTrue(call("GET", f"/requests?colonyId={top['colonyId']}")[1][0].get("promisedAt"))
        status, fill = call("POST", "/fills", {"litres": 10000, "chlorineMgL": 0.1}, self.d1)
        self.assertEqual((status, fill["chlorineStatus"]), (201, "unsafe"))
        status, body = call("POST", f"/requests/{rid}/dispatch", {}, self.d1)
        self.assertEqual(status, 409)
        self.assertIn("re-test", body["error"])
        self.assertEqual(call("POST", f"/fills/{fill['fillId']}/retest", {"chlorineMgL": 0.5}, self.d2)[0], 403)  # other tanker
        status, retested = call("POST", f"/fills/{fill['fillId']}/retest", {"chlorineMgL": 0.5}, self.d1)
        self.assertEqual((status, retested["chlorineStatus"], retested["previousChlorineMgL"]), (200, "ok", 0.1))
        self.assertEqual(call("POST", f"/requests/{rid}/dispatch", {}, self.d1)[0], 200)

    def test_dispatcher_override_for_unsafe_water_needs_reason(self):
        top = call("GET", "/queue")[1][0]
        rid = top["requestId"]
        call("POST", f"/requests/{rid}/assign", {"tankerId": "tnk-01", "eta": "18:00"}, self.disp)
        call("POST", "/fills", {"litres": 10000, "chlorineMgL": 0.1}, self.d1)
        self.assertEqual(call("POST", f"/requests/{rid}/dispatch", {}, self.disp)[0], 400)
        status, req = call("POST", f"/requests/{rid}/dispatch", {"qualityOverride": "Lab test at hydrant passed; kit faulty"}, self.disp)
        self.assertEqual((status, req["status"]), (200, "ON_THE_WAY"))
        self.assertIn("quality_override", [h["action"] for h in req["history"]])
        items = call("GET", "/review", token=self.officer)[1]["items"]
        self.assertTrue(any(i["type"] == "unsafe_water" for i in items))

    def test_scorecards_schedule_and_dirty_water_link(self):
        cards = {c["tankerId"]: c for c in call("GET", "/stats")[1]["tankers"]}
        self.assertEqual(set(cards), {"tnk-01", "tnk-02", "tnk-03"})
        self.assertIsNotNone(cards["tnk-01"]["onTimePct"])
        self.assertGreaterEqual(cards["tnk-03"]["noShows"], 1)          # demo: tnk-03 never came to Indira Colony
        self.assertGreaterEqual(cards["tnk-02"]["quality"]["unsafe"], 1)  # demo: a 0.1 mg/L reading
        status, sched = call("GET", "/schedule")
        self.assertEqual(status, 200)
        queue = call("GET", "/queue")[1]
        self.assertEqual([s["requestId"] for s in sched], [r["requestId"] for r in queue])  # every waiting colony gets an estimate
        self.assertTrue(any(not s["tankerFreeNow"] for s in sched))      # 5 colonies, 3 tankers: repeat trips
        arrivals = [s["arriveAt"] for s in sched]
        self.assertTrue(all(a for a in arrivals))
        # a dirty-water complaint is linked to the tanker that delivered last
        top = queue[0]
        call("POST", f"/requests/{top['requestId']}/assign", {"tankerId": "tnk-02", "eta": "18:00"}, self.disp)
        call("POST", f"/requests/{top['requestId']}/deliver", {"litresDelivered": 9000}, self.d2)
        status, c = call("POST", "/complaints", {"type": "dirty_water", "text": "Water was yellow and smelled of mud"}, self.rep(top["colonyId"]))
        self.assertEqual(status, 201)
        items = call("GET", "/review", token=self.officer)[1]["items"]
        hit = next(i for i in items if i["type"] == "dirty_water_report" and i["complaintId"] == c["complaintId"])
        self.assertEqual(hit["tankerId"], "tnk-02")

    def test_function_can_serve_the_web_app(self):
        """WebsiteHosting=api: the same Lambda serves the site, so everything runs on AWS over HTTPS."""
        import importlib
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
        app = importlib.import_module("app")
        frontend = os.path.join(os.path.dirname(__file__), "..", "frontend")
        if not os.path.isdir(frontend):
            self.skipTest("frontend not mounted")
        get = lambda path: app.handler({"requestContext": {"http": {"method": "GET"}}, "rawPath": path}, None)  # noqa: E731
        old = (os.environ.get("SITE_FROM_API"), app.STATIC_DIR)
        try:
            os.environ["SITE_FROM_API"], app.STATIC_DIR = "true", frontend
            home = get("/")
            self.assertEqual(home["statusCode"], 200)
            self.assertIn("text/html", home["headers"]["content-type"])
            self.assertIn("JalSetu", home["body"])
            js = get("/app.js")
            self.assertIn("javascript", js["headers"]["content-type"])
            self.assertEqual(js["headers"]["cache-control"], "no-cache")
            self.assertEqual(get("/queue")["statusCode"], 200)             # API routes still work
            self.assertIn("application/json", get("/queue")["headers"]["content-type"])
            self.assertEqual(get("/../backend/app.py")["statusCode"], 404)  # only the listed app files are served
            self.assertEqual(get("/seed.py")["statusCode"], 404)
            os.environ["SITE_FROM_API"] = "false"
            self.assertEqual(get("/")["statusCode"], 404)                   # off unless WebsiteHosting=api
        finally:
            if old[0] is None:
                os.environ.pop("SITE_FROM_API", None)
            else:
                os.environ["SITE_FROM_API"] = old[0]
            app.STATIC_DIR = old[1]

    def test_public_stats_and_open_data(self):
        status, s = call("GET", "/stats")
        self.assertEqual(status, 200)
        self.assertEqual(len(s["weeks"]), 4)
        self.assertGreaterEqual(s["equity"]["gini"], 0)
        status, csv_bytes = call("GET", "/export/deliveries.csv")
        self.assertEqual(status, 200)
        self.assertTrue(csv_bytes.decode().startswith("requestId,"))


if __name__ == "__main__":
    unittest.main()
