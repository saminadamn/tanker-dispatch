"""Unit tests for the rules that decide who gets water and what gets flagged. No network or database.

Run:  docker compose exec api python -m unittest discover -s tests -v
"""
import os
import sys
import time
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-south-1")

import app  # noqa: E402
import auth  # noqa: E402
import insights  # noqa: E402
import ranking  # noqa: E402
import review  # noqa: E402

NOW = datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def colony(cid, households=100, piped=0, weight=1, reason=""):
    return {"colonyId": cid, "name": cid, "households": households, "pipedLitresPerPerson7d": piped,
            "priorityWeight": weight, "priorityReason": reason}


def delivered(cid, litres, days_ago, **extra):
    return {"requestId": f"r-{cid}-{days_ago}-{litres}", "colonyId": cid, "status": "DELIVERED",
            "litresDelivered": litres, "deliveredAt": iso(NOW - timedelta(days=days_ago)),
            "createdAt": iso(NOW - timedelta(days=days_ago, hours=5)), **extra}


def pending(cid, hours_ago):
    return {"requestId": f"p-{cid}", "colonyId": cid, "status": "PENDING", "createdAt": iso(NOW - timedelta(hours=hours_ago))}


class Fairness(unittest.TestCase):
    def test_least_water_per_person_goes_first(self):
        cols = {c["colonyId"]: c for c in (colony("a"), colony("b"), colony("c"))}
        done = [delivered("a", 10000, 1), delivered("b", 2000, 1)]  # c got nothing
        order = [r["colonyId"] for r in ranking.rank_requests([pending("a", 1), pending("b", 1), pending("c", 1)], cols, done, NOW)]
        self.assertEqual(order, ["c", "b", "a"])

    def test_bigger_colony_needs_more_litres_for_same_share(self):
        cols = {"small": colony("small", households=50), "big": colony("big", households=500)}
        done = [delivered("small", 5000, 1), delivered("big", 5000, 1)]
        order = [r["colonyId"] for r in ranking.rank_requests([pending("small", 1), pending("big", 1)], cols, done, NOW)]
        self.assertEqual(order[0], "big")

    def test_old_deliveries_fade_out_instead_of_dropping_off_a_cliff(self):
        self.assertEqual(ranking.recency_weight(2), 1.0)
        self.assertAlmostEqual(ranking.recency_weight(6.5), 0.5)
        self.assertEqual(ranking.recency_weight(10), 0.0)
        # one hour either side of the old 7-day line now changes the weight only slightly
        self.assertLess(abs(ranking.recency_weight(7 - 1 / 24) - ranking.recency_weight(7 + 1 / 24)), 0.02)
        cols = {"a": colony("a"), "b": colony("b")}
        done = [delivered("a", 10000, 11), delivered("b", 1000, 2)]  # 11 days old: no longer counts
        self.assertEqual(ranking.rank_requests([pending("a", 1), pending("b", 1)], cols, done, NOW)[0]["colonyId"], "a")
        weighted, last7 = ranking.litres_by_colony([delivered("a", 7000, 6.5)], NOW)
        self.assertAlmostEqual(weighted["a"], 3500)
        self.assertEqual(last7["a"], 7000)

    def test_tie_goes_to_whoever_asked_first(self):
        cols = {"a": colony("a"), "b": colony("b")}
        order = [r["colonyId"] for r in ranking.rank_requests([pending("a", 1), pending("b", 5)], cols, [], NOW)]
        self.assertEqual(order, ["b", "a"])

    def test_piped_supply_counts_as_water_received(self):
        cols = {"piped": colony("piped", piped=100), "dry": colony("dry")}
        done = [delivered("dry", 20000, 1)]  # 40 L/person by tanker, but the other colony has 100 L piped
        order = [r["colonyId"] for r in ranking.rank_requests([pending("piped", 1), pending("dry", 1)], cols, done, NOW)]
        self.assertEqual(order[0], "dry")

    def test_priority_weight_is_applied_and_published(self):
        cols = {"clinic": colony("clinic", weight=2, reason="clinic"), "plain": colony("plain")}
        done = [delivered("clinic", 15000, 1), delivered("plain", 10000, 1)]  # 30 vs 20 L/person
        ranked = ranking.rank_requests([pending("clinic", 1), pending("plain", 1)], cols, done, NOW)
        self.assertEqual(ranked[0]["colonyId"], "clinic")  # 30 / 2 = 15 < 20
        self.assertEqual(ranked[0]["needScore"], 15.0)
        self.assertEqual(ranked[0]["priorityReason"], "clinic")


class DeliveryCheck(unittest.TestCase):
    def test_close_readings_are_verified(self):
        self.assertEqual(app.reconcile(10000, 9500), (9500, "verified"))

    def test_far_apart_readings_are_disputed_and_averaged(self):
        self.assertEqual(app.reconcile(10000, 4000), (7000, "disputed"))

    def test_one_sided(self):
        self.assertEqual(app.reconcile(8000, None), (8000, "driver_only"))
        self.assertEqual(app.reconcile(None, 6000), (6000, "colony_only"))

    def test_litres_capped_at_tanker_capacity(self):
        with self.assertRaises(app.ApiError):
            app.parse_litres({"litresDelivered": 12000}, 10000)
        self.assertEqual(app.parse_litres({"litresDelivered": "9000"}, 10000), 9000)


class Review(unittest.TestCase):
    def test_short_delivery_against_hydrant_fill(self):
        r = delivered("a", 7000, 1, driverLitres=7000, filledLitres=10000)
        self.assertEqual(review.short_delivery(r), 3000)
        self.assertEqual(review.short_delivery({**r, "driverLitres": 9500}), 0)  # within 10%

    def test_review_queue_flags_and_patterns(self):
        reqs = [
            delivered("a", 7000, 1, tankerId="t1", driverLitres=10000, colonyLitres=4000, verification="disputed"),
            delivered("b", 7000, 2, tankerId="t1", driverLitres=7000, filledLitres=10000),
            delivered("c", 9000, 2, tankerId="t2", driverFarFromColony=True, driverDistanceM=3000),
            delivered("d", 9000, 1, tankerId="t2", verification="disputed", resolution={"note": "settled"}),
        ]
        fills = [{"fillId": "f1", "tankerId": "t3", "litres": 10000, "at": iso(NOW - timedelta(days=1))}]
        out = review.review_queue(reqs, fills, NOW)
        types = sorted(i["type"] for i in out["items"])
        self.assertEqual(types, ["disputed", "fill_without_trip", "gps_far", "short_delivery"])
        self.assertEqual([(p["type"], p.get("tankerId")) for p in out["patterns"]], [("pattern_tanker", "t1")])

    def test_cancelled_trip_fill_is_flagged(self):
        reqs = [pending("a", 2)]  # requeued: fill link removed from the request
        fills = [{"fillId": "f1", "tankerId": "t1", "litres": 10000, "requestId": "p-a", "at": iso(NOW - timedelta(hours=3))}]
        self.assertEqual([i["type"] for i in review.review_queue(reqs, fills, NOW)["items"]], ["fill_not_delivered"])

    def test_gini(self):
        self.assertEqual(review.gini([10, 10, 10]), 0.0)
        self.assertGreater(review.gini([0, 0, 30]), 0.6)

    def test_nearest_fill_point(self):
        pts = [{"id": "x", "name": "x", "lat": 28.60, "lon": 77.20}, {"id": "y", "name": "y", "lat": 28.70, "lon": 77.20}]
        point, dist = review.nearest(pts, 28.601, 77.20)
        self.assertEqual(point["id"], "x")
        self.assertLess(dist, 200)

    def test_csv_has_no_phone_numbers(self):
        reqs = [delivered("a", 5000, 1, history=[{"ref": "xxxxxx1234"}], byPhone="9876543210")]
        text = review.deliveries_csv(reqs, {"a": colony("a")})
        self.assertIn("requestId", text.splitlines()[0])
        self.assertNotIn("9876543210", text)
        self.assertNotIn("1234", text)


class HeatAndImpact(unittest.TestCase):
    def test_heat_raises_need(self):
        self.assertEqual(insights.heat_factor(30), 1.0)
        self.assertEqual(insights.heat_factor(45), 1.4)
        self.assertEqual(insights.heat_factor(60), insights.HEAT_FACTOR_CAP)

    def test_early_warning_ranks_driest_first(self):
        rows = [{"colonyId": "wet", "colonyName": "wet", "people": 500, "totalPerPerson7d": 210},
                {"colonyId": "dry", "colonyName": "dry", "people": 500, "totalPerPerson7d": 14}]
        days = [{"date": "d1", "maxC": 44}, {"date": "d2", "maxC": 44}, {"date": "d3", "maxC": 38}]
        out = insights.early_warning(rows, days, {"dry"}, 10000)
        dry = out["colonies"][0]
        self.assertEqual(dry["colonyId"], "dry")
        self.assertEqual(dry["risk"], "high")
        self.assertTrue(dry["hasOpenRequest"])
        self.assertGreater(dry["shortfallLitres"], 0)
        self.assertEqual(dry["tankerLoads"], -(-dry["shortfallLitres"] // 10000))
        self.assertEqual(out["colonies"][1]["risk"], "low")

    def test_trip_distance_and_savings(self):
        colony = {"lat": 28.60, "lon": 77.20}
        near = {"tankerId": "a", "lastLat": 28.601, "lastLon": 77.20}
        far = {"tankerId": "b", "lastLat": 28.65, "lastLon": 77.20}
        trip, avg = insights.trip_distances(colony, near, [near, far])
        self.assertLess(trip, 0.2)
        self.assertGreater(avg, 2.5)
        self.assertIsNone(insights.trip_distances({}, near, [near]))
        reqs = [delivered("a", 9000, 1, tripKm=1.0, altKm=3.0, assignedAt=iso(NOW - timedelta(days=1)),
                          driverLitres=7000, filledLitres=10000)]
        out = insights.impact(reqs, [{"fillId": "f9", "tankerId": "t", "litres": 5000, "at": iso(NOW - timedelta(days=2))}], now=NOW)
        self.assertEqual(out["kmSaved"], 4.0)  # round trip: 2 x (3 - 1)
        self.assertAlmostEqual(out["co2SavedKg"], round(4.0 / insights.KM_PER_LITRE_DIESEL * 2.68, 1))
        self.assertEqual(out["missingWaterFlaggedLitres"], 3000 + 5000)


class VolumeAndPlanning(unittest.TestCase):
    def test_big_colonies_get_more_loads(self):
        small = insights.loads_needed(people=250, total_pp=0, capacity=10000)
        big = insights.loads_needed(people=1100, total_pp=0, capacity=10000)
        self.assertEqual(small, (35000, 3))
        self.assertEqual(big[1], insights.MAX_LOADS_PER_REQUEST)
        self.assertEqual(insights.loads_needed(500, 200, 10000), (0, 1))  # already above target: one load at most

    def test_plan_follows_queue_order_and_picks_nearest(self):
        cols = {"c1": {"lat": 28.60, "lon": 77.20}, "c2": {"lat": 28.70, "lon": 77.20}}
        queue = [{"requestId": "r1", "colonyId": "c1"}, {"requestId": "r2", "colonyId": "c2"}, {"requestId": "r3", "colonyId": "c1"}]
        tankers = [{"tankerId": "far", "status": "AVAILABLE", "lastLat": 28.70, "lastLon": 77.20},
                   {"tankerId": "near", "status": "AVAILABLE", "lastLat": 28.601, "lastLon": 77.20},
                   {"tankerId": "busy", "status": "BUSY", "lastLat": 28.60, "lastLon": 77.20}]
        plan = insights.plan_dispatch(queue, tankers, cols)
        self.assertEqual([(p["requestId"], p["tankerId"]) for p in plan], [("r1", "near"), ("r2", "far")])
        self.assertGreaterEqual(plan[0]["travelMinutes"], insights.TRIP_OVERHEAD_MIN)

    def test_escalations_and_impossible_readings(self):
        reqs = [pending("waiting", 30),
                delivered("over", 9000, 1, colonyLitres=12000, filledLitres=9000, driverLitres=9000),
                delivered("nofill", 9000, 1, fillRequired=True, driverLitres=9000)]
        complaints = [{"complaintId": "T-1", "status": "OPEN", "createdAt": iso(NOW - timedelta(hours=60))},
                      {"complaintId": "T-2", "status": "OPEN", "createdAt": iso(NOW - timedelta(hours=5))}]
        types = sorted(i["type"] for i in review.review_queue(reqs, [], NOW, complaints)["items"])
        self.assertEqual(types, ["complaint_overdue", "no_fill", "over_report", "waiting_too_long"])


class PunctualityQualitySchedule(unittest.TestCase):
    def test_promised_time_in_local_time(self):
        # Assigned 12:00 UTC = 17:30 IST; "18:30" means 13:00 UTC the same day
        self.assertEqual(insights.promised_at("18:30", iso(NOW)), "2026-10-11T13:00:00Z")
        # "08:00" when it is already 17:30 locally means tomorrow morning
        self.assertEqual(insights.promised_at("08:00", iso(NOW)), "2026-10-12T02:30:00Z")
        self.assertIsNone(insights.promised_at("soon", iso(NOW)))

    def test_on_time_percentage_and_no_shows(self):
        reqs = [delivered("a", 9000, 1, tankerId="t1", promisedAt=iso(NOW - timedelta(days=1, minutes=10))),  # 10 min late: on time
                delivered("b", 9000, 2, tankerId="t1", promisedAt=iso(NOW - timedelta(days=2, minutes=60))),  # 60 min late
                {**pending("c", 3), "missedTankerId": "t1", "requeuedAt": iso(NOW - timedelta(hours=2))}]
        p = insights.punctuality(reqs, now=NOW)["t1"]
        self.assertEqual((p["trips"], p["onTime"], p["onTimePct"], p["avgLateMin"], p["noShows"]), (2, 1, 50, 60, 1))

    def test_chlorine_bands(self):
        self.assertEqual([insights.chlorine_status(v) for v in (None, 0.1, 0.2, 0.8, 1.5, 6)],
                         ["untested", "unsafe", "ok", "ok", "high", "unsafe"])
        fills = [{"tankerId": "t1", "at": iso(NOW - timedelta(days=1)), "chlorineMgL": 0.5},
                 {"tankerId": "t1", "at": iso(NOW - timedelta(hours=5)), "chlorineMgL": 0.1},
                 {"tankerId": "t1", "at": iso(NOW - timedelta(hours=1))}]
        q = insights.quality_summary(fills, now=NOW)["t1"]
        self.assertEqual((q["fills"], q["tested"], q["safe"], q["unsafe"], q["safePct"], q["lastChlorine"]), (3, 2, 1, 1, 50, 0.1))

    def test_schedule_counts_repeat_trips(self):
        cols = {"c1": {"lat": 28.60, "lon": 77.20}, "c2": {"lat": 28.61, "lon": 77.20}}
        hyd = [{"id": "h", "name": "Hydrant", "lat": 28.605, "lon": 77.20}]
        queue = [{"requestId": "r1", "colonyId": "c1"}, {"requestId": "r2", "colonyId": "c2"}]
        tankers = [{"tankerId": "only", "status": "AVAILABLE", "lastLat": 28.605, "lastLon": 77.20}]
        plan = insights.schedule(queue, tankers, [], cols, hyd, NOW)
        self.assertEqual([p["tankerId"] for p in plan], ["only", "only"])   # one tanker does both, one after another
        self.assertTrue(plan[0]["tankerFreeNow"])
        self.assertFalse(plan[1]["tankerFreeNow"])
        second_leg = (ranking.parse_time(plan[1]["arriveAt"]) - ranking.parse_time(plan[0]["arriveAt"])).total_seconds() / 60
        self.assertGreaterEqual(second_leg, insights.UNLOAD_MIN + insights.FILL_MIN)  # unload, refill, drive
        busy = [{"tankerId": "b", "status": "BUSY", "lastLat": 28.6, "lastLon": 77.2}]
        trip = [{"tankerId": "b", "colonyId": "c1", "promisedAt": iso(NOW + timedelta(hours=1))}]
        first = insights.schedule(queue[:1], busy, trip, cols, hyd, NOW)[0]
        self.assertGreater(ranking.parse_time(first["arriveAt"]), NOW + timedelta(hours=1, minutes=insights.UNLOAD_MIN))


class SignIn(unittest.TestCase):
    def test_pin_hash_roundtrip(self):
        h = auth.hash_pin("482613")
        self.assertTrue(auth.check_pin("482613", h))
        self.assertFalse(auth.check_pin("482614", h))

    def test_token_cannot_be_forged_or_reused_after_expiry(self):
        token = auth.make_token({"phone": "9000000001", "role": "dispatcher"})
        self.assertEqual(auth.read_token(token)["role"], "dispatcher")
        body, sig = token.split(".")
        forged = auth._b64(b'{"sub":"9000000001","role":"officer","exp":9999999999}')
        self.assertIsNone(auth.read_token(f"{forged}.{sig}"))
        old = auth.TOKEN_DAYS
        try:
            auth.TOKEN_DAYS = -1
            self.assertIsNone(auth.read_token(auth.make_token({"phone": "9000000001", "role": "driver"})))
        finally:
            auth.TOKEN_DAYS = old

    def test_phone_normalisation_and_pin_rules(self):
        self.assertEqual(auth.normalize_phone("+91 98765-43210"), "9876543210")
        self.assertIsNone(auth.normalize_phone("12345"))
        self.assertFalse(auth.valid_pin("1234"))
        self.assertTrue(auth.valid_pin("123456"))


if __name__ == "__main__":
    unittest.main()
