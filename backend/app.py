import base64
import json
import math
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone

import assist
import auth
import insights
import ranking
import review
import store

OPEN_STATUSES = ("PENDING", "ASSIGNED", "ON_THE_WAY")
TANKER_OUT = ("ASSIGNED", "ON_THE_WAY")
ACTION_PATH = re.compile(r"^/requests/([^/]+)/(assign|dispatch|confirm|deliver|release|photo|resolve|cancel)$")
ITEM_PATH = re.compile(r"^/(fills|users|tankers|colonies|complaints|hydrants)/([^/]+)/(review|disable|status|settings|resolve|delete|retest)$")
AUTO_RELEASE_HOURS = float(os.environ.get("AUTO_RELEASE_HOURS", "4"))
# Driver and colony readings further apart than this are publicly marked "disputed".
DISPUTE_TOLERANCE = 0.10
# How long after delivery the other side can still add its reading.
SECOND_READING_HOURS = 72
# A driver's GPS fix further than this from the colony (plus GPS accuracy) is flagged.
FAR_FROM_COLONY_M = 500
# Assigning anyone but the first colony in the queue needs a written reason, shown publicly.
MIN_OVERRIDE_REASON = 10
MAX_PHOTO_BYTES = 800 * 1024
COMPLAINT_TYPES = ("no_show", "short_water", "dirty_water", "bribe", "behaviour", "other")
# Ward's hydrants / filling stations: [{"id", "name", "lat", "lon"}]. Template parameter FillPoints.
FILL_POINTS = json.loads(os.environ.get("FILL_POINTS") or "[]")


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Raw:
    """A non-JSON response body (a photo or a CSV file)."""
    def __init__(self, data, content_type, filename=None):
        self.data, self.content_type, self.filename = data, content_type, filename


def response(status, body):
    headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type,authorization",
        "access-control-allow-methods": "GET,POST,OPTIONS",
    }
    if isinstance(body, Raw):
        headers["content-type"] = body.content_type
        if body.filename:
            headers["content-disposition"] = f'attachment; filename="{body.filename}"'
        if isinstance(body.data, bytes):
            return {"statusCode": status, "headers": headers, "isBase64Encoded": True,
                    "body": base64.b64encode(body.data).decode()}
        return {"statusCode": status, "headers": headers, "body": body.data}
    return {
        "statusCode": status,
        "headers": {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "content-type,authorization",
            "access-control-allow-methods": "GET,POST,OPTIONS",
        },
        "body": "" if body is None else json.dumps(body),
    }


def parse_body(event):
    raw = event.get("body")
    if not raw:
        return {}
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        body = json.loads(raw)
    except json.JSONDecodeError:
        raise ApiError(400, "Body must be valid JSON")
    if not isinstance(body, dict):
        raise ApiError(400, "Body must be a JSON object")
    return body


def colonies_by_id():
    return {c["colonyId"]: c for c in store.list_colonies()}


def require_request(request_id):
    req = store.get_request(request_id)
    if not req:
        raise ApiError(404, "Request not found")
    return req


def capacity_of(tanker_id):
    tanker = store.get_tanker(tanker_id) if tanker_id else None
    return int((tanker or {}).get("capacityLitres") or 50000)


def parse_litres(body, max_litres):
    litres = body.get("litresDelivered")
    if isinstance(litres, str) and litres.strip().isdigit():
        litres = int(litres.strip())
    if not isinstance(litres, int) or isinstance(litres, bool) or not 1 <= litres <= max_litres:
        raise ApiError(400, f"litresDelivered must be a whole number between 1 and {max_litres} (tanker capacity)")
    return litres


def release_due_at(req, hours=None):
    """When the auto-release job will free this request's tanker, or None if it does not apply."""
    started = req.get("dispatchedAt") if req["status"] == "ON_THE_WAY" else req.get("assignedAt")
    if req["status"] not in TANKER_OUT or not started:
        return None
    due = ranking.parse_time(started) + timedelta(hours=AUTO_RELEASE_HOURS if hours is None else float(hours))
    return due.strftime("%Y-%m-%dT%H:%M:%SZ")


def reconcile(driver_litres, colony_litres):
    """Effective litres and verification label from the two independent readings."""
    if driver_litres is not None and colony_litres is not None:
        if abs(driver_litres - colony_litres) <= DISPUTE_TOLERANCE * max(driver_litres, colony_litres):
            return colony_litres, "verified"
        # Neither side is trusted: count the midpoint and show the dispute publicly.
        return round((driver_litres + colony_litres) / 2), "disputed"
    if driver_litres is not None:
        return driver_litres, "driver_only"
    return colony_litres, "colony_only"


def distance_m(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(a)))


# ---------- sign-in ----------

def current_user(headers):
    """The signed-in user for this request, or None. Re-reads the user so removed accounts stop working."""
    header = (headers or {}).get("authorization") or ""
    if not header.lower().startswith("bearer "):
        return None
    payload = auth.read_token(header[7:].strip())
    if not payload:
        return None
    user = store.get_user(payload["sub"])
    if not user or user.get("disabled") or user.get("role") != payload.get("role"):
        return None
    return user


def require_role(user, *roles):
    if not user:
        raise ApiError(401, "Please sign in first")
    if user["role"] not in roles:
        raise ApiError(403, "Your account is not allowed to do this")


def history_event(user, action, detail=""):
    if user is None:
        actor = {"by": "Auto-release", "role": "system"}
    else:
        actor = {"by": user.get("name", ""), "role": user["role"], "ref": auth.mask_phone(user["phone"])}
    event = {"at": now_iso(), "action": action, **actor}
    if detail:
        event["detail"] = detail
    return event


def login(body):
    phone = auth.normalize_phone(body.get("phone"))
    pin = body.get("pin")
    if not phone or not isinstance(pin, str):
        raise ApiError(400, "phone and pin are required")
    user = store.get_user(phone)
    now = int(time.time())
    if user and user.get("lockedUntil", 0) > now:
        minutes = math.ceil((user["lockedUntil"] - now) / 60)
        raise ApiError(429, f"Too many wrong PINs. Try again in {minutes} min")
    if not user or user.get("disabled") or not auth.check_pin(pin, user.get("pinHash", "")):
        if user:
            store.record_login(phone, False, now, auth.LOCK_MINUTES * 60, auth.MAX_FAILED_LOGINS)
        raise ApiError(401, "Wrong phone number or PIN")
    store.record_login(phone, True, now, 0, 0)
    return 200, {"token": auth.make_token(user), "user": auth.public_user(user)}


def me(user):
    require_role(user, *auth.ROLES)
    return 200, auth.public_user(user)


# ---------- route handlers ----------

def create_request(body, user):
    require_role(user, "colony", "dispatcher")
    colony_id = body.get("colonyId")
    if not isinstance(colony_id, str) or not colony_id:
        raise ApiError(400, "colonyId is required")
    if user["role"] == "colony" and user.get("colonyId") != colony_id:
        raise ApiError(403, "You can only request water for your own colony")
    if not store.get_colony(colony_id):
        raise ApiError(404, "Colony not found")
    note = body.get("note") or ""
    if not isinstance(note, str) or len(note) > 500:
        raise ApiError(400, "note must be text of at most 500 characters")
    if any(r["colonyId"] == colony_id and r["status"] in OPEN_STATUSES for r in store.list_requests()):
        raise ApiError(409, "This colony already has an open request")
    on_behalf = user["role"] == "dispatcher"
    litres_needed, loads = request_target(colony_id)
    item = {
        "requestId": str(uuid.uuid4()),
        "colonyId": colony_id,
        "status": "PENDING",
        "createdAt": now_iso(),
        "loadNumber": 1, "loadsTarget": loads, "litresTarget": litres_needed,
        "history": [history_event(user, "requested", ("on behalf of the colony; " if on_behalf else "")
                                  + f"needs about {litres_needed} L ({loads} load{'s' if loads > 1 else ''})")],
    }
    if note.strip():
        # Signals are shown to the dispatcher for context only; they never change the ranking.
        item["note"] = note.strip()
        item["signals"] = assist.find_signals(note)
        days = assist.days_without_water(note)
        if days:
            item["daysWithoutWater"] = days
    store.put_request(item)
    return 201, item


def max_capacity():
    return max([int(t.get("capacityLitres") or 0) for t in store.list_tankers()] or [10000]) or 10000


def request_target(colony_id):
    """Litres the colony still needs to reach the weekly basic level, and tanker loads for this request."""
    colony = store.get_colony(colony_id)
    delivered = [r for r in store.list_requests() if r["status"] == "DELIVERED" and r["colonyId"] == colony_id]
    row = ranking.ledger({colony_id: colony}, delivered)[0]
    return insights.loads_needed(row["people"], row["totalPerPerson7d"], max_capacity())


def follow_up(request_id):
    """After a load is delivered: if this request asked for more loads and the colony is still short,
    queue the next load. It keeps the original request time, and competes in the queue like everyone else."""
    req = store.get_request(request_id)
    if not req or req.get("status") != "DELIVERED":
        return None
    n, total = int(req.get("loadNumber", 1)), int(req.get("loadsTarget", 1))
    if n >= total:
        return None
    reqs = store.list_requests()
    if any(r["colonyId"] == req["colonyId"] and r["status"] in OPEN_STATUSES for r in reqs):
        return None
    still_needed, _ = request_target(req["colonyId"])
    if still_needed <= 0:
        return None
    item = {
        "requestId": str(uuid.uuid4()), "colonyId": req["colonyId"], "status": "PENDING",
        "createdAt": req["createdAt"], "loadNumber": n + 1, "loadsTarget": total,
        "litresTarget": still_needed, "parentRequestId": req.get("parentRequestId") or req["requestId"],
        "history": [history_event(None, "follow_up", f"load {n + 1} of {total}; still needs about {still_needed} L")],
    }
    for k in ("note", "signals", "daysWithoutWater"):
        if k in req:
            item[k] = req[k]
    store.put_request(item)
    return item["requestId"]


def cancel(request_id, body, user):
    """The colony has enough water (or asked by mistake): take a waiting request out of the queue."""
    require_role(user, "colony", "dispatcher")
    req = require_request(request_id)
    if user["role"] == "colony" and user.get("colonyId") != req["colonyId"]:
        raise ApiError(403, "You can only cancel your own colony's request")
    if req["status"] != "PENDING":
        raise ApiError(409, "Only a waiting request can be cancelled")
    reason = (body.get("reason") or "").strip()[:200] or "no longer needed"
    store.update_request(request_id, {"status": "CANCELLED", "cancelledAt": now_iso()},
                         history_event(user, "cancelled", reason), "#s = :p", {":p": "PENDING"})
    return 200, store.get_request(request_id)


def list_requests(query):
    reqs = store.list_requests()
    for field in ("colonyId", "tankerId"):
        if query.get(field):
            reqs = [r for r in reqs if r.get(field) == query[field]]
    status = query.get("status")
    if status:
        wanted = set(status.split(","))
        reqs = [r for r in reqs if r["status"] in wanted]
    colonies = colonies_by_id()
    for r in reqs:
        c = colonies.get(r["colonyId"], {})
        r["colonyName"] = c.get("name", r["colonyId"])
        r["colonyNameHi"] = c.get("nameHi", r["colonyName"])
        due = release_due_at(r)
        if due:
            r["autoReleaseAt"] = due
    reqs.sort(key=lambda r: r["createdAt"], reverse=True)
    return 200, reqs


def queue():
    reqs = store.list_requests()
    colonies = colonies_by_id()
    pending = [r for r in reqs if r["status"] == "PENDING"]
    delivered = [r for r in reqs if r["status"] == "DELIVERED"]
    rows = ranking.ledger(colonies, delivered)
    ward_avg = round(sum(r["totalPerPerson7d"] for r in rows) / len(rows), 1) if rows else 0
    return 200, assist.explain(ranking.rank_requests(pending, colonies, delivered), ward_avg)


def ledger():
    delivered = [r for r in store.list_requests() if r["status"] == "DELIVERED"]
    return 200, ranking.ledger(colonies_by_id(), delivered)


def parse_text(body):
    text = body.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 500:
        raise ApiError(400, "text is required (at most 500 characters)")
    return 200, assist.parse_request(text.strip(), store.list_colonies())


def parse_simulate(query):
    simulate = query.get("simulateMaxC")
    if simulate is None:
        return None
    try:
        simulate = float(simulate)
    except ValueError:
        raise ApiError(400, "simulateMaxC must be a number")
    if not 0 <= simulate <= 60:
        raise ApiError(400, "simulateMaxC must be between 0 and 60")
    return simulate


def heat(query):
    delivered = [r for r in store.list_requests() if r["status"] == "DELIVERED"]
    return 200, assist.heat_outlook(ranking.ledger(colonies_by_id(), delivered), parse_simulate(query))


def forecast(query):
    """Heat early warning: who will run short over the next 3 days at last week's supply rate."""
    reqs = store.list_requests()
    rows = ranking.ledger(colonies_by_id(), [r for r in reqs if r["status"] == "DELIVERED"])
    open_ids = {r["colonyId"] for r in reqs if r["status"] in OPEN_STATUSES}
    capacity = max([int(t.get("capacityLitres") or 0) for t in store.list_tankers()] or [10000]) or 10000
    days = assist.forecast_days(parse_simulate(query))
    return 200, {**insights.early_warning(rows, days, open_ids, capacity), "forecastAvailable": bool(days)}


def assign(request_id, body, user):
    require_role(user, "dispatcher")
    tanker_id = body.get("tankerId")
    eta = body.get("eta")
    if not isinstance(tanker_id, str) or not tanker_id:
        raise ApiError(400, "tankerId is required")
    if not isinstance(eta, str) or not eta.strip() or len(eta) > 40:
        raise ApiError(400, "eta is required (for example 16:00)")
    req = require_request(request_id)
    tanker = store.get_tanker(tanker_id)
    if not tanker:
        raise ApiError(404, "Tanker not found")
    if req["status"] != "PENDING":
        raise ApiError(409, "Only a PENDING request can be assigned")
    if tanker["status"] == "OFF_DUTY":
        raise ApiError(409, "Tanker is off duty")
    if tanker["status"] != "AVAILABLE":
        raise ApiError(409, "Tanker is already busy")
    # Fairness guard: skipping the queue is allowed (fire, hospital...) but only with a public reason.
    ranked = queue()[1]
    position = next((i for i, r in enumerate(ranked) if r["requestId"] == request_id), 0)
    ahead = ranked[:position]
    extra, detail = {}, f"{tanker_id} ({tanker.get('driverName', '')}), ETA {eta.strip()}"
    if ahead:
        reason = (body.get("overrideReason") or "").strip()
        if len(reason) < MIN_OVERRIDE_REASON:
            raise ApiError(400, f"This colony is #{len(ahead) + 1} in the queue. Skipping colonies ahead of it "
                                f"needs a reason of at least {MIN_OVERRIDE_REASON} characters, shown publicly")
        if len(reason) > 300:
            raise ApiError(400, "overrideReason must be at most 300 characters")
        extra["override"] = {"reason": reason, "at": now_iso(), "by": user.get("name", ""),
                             "skipped": [r["colonyName"] for r in ahead]}
        detail += f". QUEUE OVERRIDE, skipped {len(ahead)}: {reason}"
    # Environmental record: this trip's distance vs. an average free tanker, and where the tanker started.
    colony = store.get_colony(req["colonyId"]) or {}
    free = [t for t in store.list_tankers() if t.get("status") == "AVAILABLE"]
    dist = insights.trip_distances(colony, tanker, free)
    if dist:
        extra.update({"tripKm": dist[0], "altKm": dist[1], "startLat": tanker["lastLat"], "startLon": tanker["lastLon"]})
        detail += f", {dist[0]} km away"
    if fill_points_list():
        extra["fillRequired"] = True
    promised = insights.promised_at(eta.strip(), now_iso())
    if promised:
        extra["promisedAt"] = promised
    store.assign(request_id, tanker_id, eta.strip(), now_iso(), history_event(user, "assigned", detail), extra)
    notify_assigned(req, tanker, eta.strip())
    return 200, store.get_request(request_id)


def dispatch(request_id, body, user):
    require_role(user, "dispatcher", "driver")
    req = require_request(request_id)
    if user["role"] == "driver" and user.get("tankerId") != req.get("tankerId"):
        raise ApiError(403, "This trip belongs to another tanker")
    if req["status"] != "ASSIGNED":
        raise ApiError(409, "Only an ASSIGNED request can be marked on the way")
    detail = ""
    if req.get("waterSafe") is False:
        reading = f"{req.get('chlorineMgL')} mg/L"
        if user["role"] != "dispatcher":
            raise ApiError(409, f"The chlorine test ({reading}) is outside the safe range "
                                f"{insights.CHLORINE_MIN}-{insights.CHLORINE_MAX} mg/L. Re-chlorinate or refill, then re-test")
        reason = (body.get("qualityOverride") or "").strip()
        if len(reason) < MIN_OVERRIDE_REASON:
            raise ApiError(400, f"Chlorine {reading} is unsafe. Sending it anyway needs a written reason "
                                f"(at least {MIN_OVERRIDE_REASON} characters), shown publicly")
        store.update_request(request_id, {"qualityOverride": {"reason": reason[:300], "by": user.get("name", ""), "at": now_iso()}},
                             history_event(user, "quality_override", reason[:300]))
        detail = "despite failed chlorine test"
    store.dispatch(request_id, now_iso(), history_event(user, "on_the_way", detail))
    return 200, store.get_request(request_id)


def second_reading_open(req):
    delivered_at = req.get("deliveredAt")
    return bool(delivered_at) and \
        datetime.now(timezone.utc) - ranking.parse_time(delivered_at) <= timedelta(hours=SECOND_READING_HOURS)


def confirm(request_id, body, user):
    """Colony representative reports how much water arrived."""
    require_role(user, "colony")
    req = require_request(request_id)
    if user.get("colonyId") != req["colonyId"]:
        raise ApiError(403, "You can only confirm deliveries for your own colony")
    litres = parse_litres(body, capacity_of(req.get("tankerId")))
    event = history_event(user, "colony_reported", f"{litres} L")
    if req["status"] in TANKER_OUT:
        store.close(request_id, req["tankerId"], now_iso(),
                    {"colonyLitres": litres, "litresDelivered": litres, "verification": "colony_only"}, event)
        follow_up(request_id)
    elif (req["status"] == "DELIVERED" and "colonyLitres" not in req
          and req.get("verification") in ("driver_only", "auto") and second_reading_open(req)):
        if req["verification"] == "driver_only":
            effective, verification = reconcile(req["driverLitres"], litres)
        else:  # auto-closed with an estimate: the colony's own reading replaces it
            effective, verification = litres, "colony_only"
        store.add_reading(request_id, {"colonyLitres": litres, "litresDelivered": effective,
                                       "verification": verification},
                          event, "colonyLitres", req["verification"])
    else:
        raise ApiError(409, "This delivery cannot be confirmed now")
    return 200, store.get_request(request_id)


def parse_location(body):
    loc = body.get("location")
    if not isinstance(loc, dict):
        return None
    try:
        lat, lon = float(loc["lat"]), float(loc["lon"])
        accuracy = max(0, round(float(loc.get("accuracy") or 0)))
    except (KeyError, TypeError, ValueError):
        raise ApiError(400, "location must have numeric lat and lon")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ApiError(400, "location is out of range")
    return {"lat": round(lat, 6), "lon": round(lon, 6), "accuracyM": accuracy}


def deliver(request_id, body, user):
    """Driver reports the delivery, with GPS position when the phone allows it."""
    require_role(user, "driver")
    req = require_request(request_id)
    if user.get("tankerId") != (req.get("tankerId") or req.get("deliveredTankerId")):
        raise ApiError(403, "This trip belongs to another tanker")
    litres = parse_litres(body, capacity_of(user["tankerId"]))
    if req.get("filledLitres") and litres > req["filledLitres"]:
        raise ApiError(400, f"You logged filling {req['filledLitres']} L at the hydrant for this trip; "
                            f"you cannot deliver more than that")
    fields = {"driverLitres": litres}
    detail = f"{litres} L"
    location = parse_location(body)
    if location:
        fields["driverLocation"] = location
        colony = store.get_colony(req["colonyId"]) or {}
        if "lat" in colony and "lon" in colony:
            dist = distance_m(location["lat"], location["lon"], colony["lat"], colony["lon"])
            fields["driverDistanceM"] = dist
            fields["driverFarFromColony"] = dist > FAR_FROM_COLONY_M + location["accuracyM"]
            detail += f", GPS {dist} m from colony"
    else:
        detail += ", no GPS"
    event = history_event(user, "driver_reported", detail)
    if location:  # last known position, used to suggest the nearest tanker for the next trip
        store.set_tanker_position(user["tankerId"], location["lat"], location["lon"], now_iso())
    if req["status"] in TANKER_OUT:
        store.close(request_id, req["tankerId"], now_iso(),
                    {**fields, "litresDelivered": litres, "verification": "driver_only",
                     "deliveredTankerId": req["tankerId"]}, event)
        follow_up(request_id)
    elif (req["status"] == "DELIVERED" and "driverLitres" not in req
          and req.get("verification") == "colony_only" and second_reading_open(req)):
        effective, verification = reconcile(litres, req["colonyLitres"])
        store.add_reading(request_id, {**fields, "litresDelivered": effective, "verification": verification},
                          event, "driverLitres", "colony_only")
    else:
        raise ApiError(409, "This delivery cannot be reported now")
    return 200, store.get_request(request_id)


def release(request_id, body, user):
    """Dispatcher override when nobody can confirm.
    outcome "delivered": close it with the litres the dispatcher reports.
    outcome "not_delivered": free the tanker and put the request back in the queue."""
    require_role(user, "dispatcher")
    outcome = body.get("outcome")
    if outcome not in ("delivered", "not_delivered"):
        raise ApiError(400, 'outcome must be "delivered" or "not_delivered"')
    req = require_request(request_id)
    if req["status"] not in TANKER_OUT:
        raise ApiError(409, "Only an assigned or on-the-way request can be released")
    if outcome == "delivered":
        litres = parse_litres(body, capacity_of(req["tankerId"]))
        store.close(request_id, req["tankerId"], now_iso(),
                    {"litresDelivered": litres, "verification": "dispatcher", "deliveredTankerId": req["tankerId"]},
                    history_event(user, "dispatcher_closed", f"{litres} L"))
        follow_up(request_id)
    else:
        store.requeue(request_id, req["tankerId"], now_iso(), "dispatcher",
                      history_event(user, "requeued", f"{req['tankerId']} did not arrive"))
    return 200, store.get_request(request_id)


def auto_release(hours=None):
    """Scheduled job: free tankers whose delivery nobody reported in time.
    ON_THE_WAY too long -> DELIVERED at the tanker's capacity, verification=auto (the colony can still correct it).
    ASSIGNED too long (tanker never left) -> back to PENDING, so the colony keeps its priority."""
    now = datetime.now(timezone.utc)
    tankers = {t["tankerId"]: t for t in store.list_tankers()}
    done = {"delivered": [], "requeued": [], "skipped": []}
    for req in store.list_requests():
        due = release_due_at(req, hours)
        if not due or ranking.parse_time(due) > now:
            continue
        try:
            if req["status"] == "ON_THE_WAY":
                litres = int(tankers.get(req["tankerId"], {}).get("capacityLitres") or 1)
                store.close(req["requestId"], req["tankerId"], now_iso(),
                            {"litresDelivered": litres, "verification": "auto", "deliveredTankerId": req["tankerId"]},
                            history_event(None, "auto_closed", f"estimated {litres} L, nobody reported"),
                            expect=("ON_THE_WAY",))
                follow_up(req["requestId"])
                done["delivered"].append(req["requestId"])
            else:
                store.requeue(req["requestId"], req["tankerId"], now_iso(), "auto",
                              history_event(None, "requeued", f"{req['tankerId']} never left"), expect=("ASSIGNED",))
                done["requeued"].append(req["requestId"])
        except store.RuleBroken:  # it changed state meanwhile, e.g. the colony just confirmed
            done["skipped"].append(req["requestId"])
    print("Auto-release:", json.dumps(done))
    return done


def notify_assigned(req, tanker, eta):
    if os.environ.get("SMS_ENABLED") != "true":
        return
    colony = store.get_colony(req["colonyId"]) or {}
    phone = colony.get("repPhone", "")
    if not phone.startswith("+") or "x" in phone:
        return
    try:
        import boto3
        boto3.client("sns").publish(
            PhoneNumber=phone,
            Message=f"Water tanker {tanker['tankerId']} ({tanker.get('driverName', '')}) assigned to "
                    f"{colony.get('name', '')}. Expected at {eta}.",
        )
    except Exception as e:  # SMS is best effort, never fail the assign
        print("SMS failed:", e)


# ---------- hydrant fills: the third source of truth ----------

def fill_points_list():
    hydrants = [{"id": h["colonyId"], "name": h["name"], "lat": h["lat"], "lon": h["lon"]} for h in store.list_hydrants()]
    return hydrants or FILL_POINTS


def fill_points():
    return 200, fill_points_list()


def log_fill(body, user):
    """Driver logs filling the tanker at a hydrant. Linked to the tanker's current trip, if any,
    and later compared with the litres delivered, so water that disappears on the way gets flagged."""
    require_role(user, "driver")
    tanker_id = user["tankerId"]
    litres = parse_litres({"litresDelivered": body.get("litres", body.get("litresDelivered"))}, capacity_of(tanker_id))
    location = parse_location(body)
    trip = next((r for r in store.list_requests() if r.get("tankerId") == tanker_id and r["status"] in TANKER_OUT), None)
    fill = {"fillId": f"F-{uuid.uuid4().hex[:10]}", "tankerId": tanker_id, "litres": litres, "at": now_iso(),
            "by": user.get("name", ""), "ref": auth.mask_phone(user["phone"])}
    chlorine = parse_chlorine(body)
    status = insights.chlorine_status(chlorine)
    fill["chlorineStatus"] = status
    if chlorine is not None:
        fill["chlorineMgL"] = chlorine
    trip_fields = {"chlorineMgL": chlorine, "chlorineStatus": status, "waterSafe": status != "unsafe"} \
        if chlorine is not None else {"chlorineStatus": "untested"}
    detail = f"{litres} L" + (f", chlorine {chlorine} mg/L ({status})" if chlorine is not None else ", no chlorine test")
    if location:
        fill["location"] = location
        point, dist = review.nearest(fill_points_list(), location["lat"], location["lon"])
        if point:
            fill.update({"fillPointId": point["id"], "fillPointName": point["name"], "fillPointDistanceM": dist,
                         "farFromFillPoint": dist > review.FILL_POINT_RADIUS_M + location["accuracyM"]})
            detail += f" at {point['name']} ({dist} m)"
        store.set_tanker_position(tanker_id, location["lat"], location["lon"], now_iso())
    else:
        detail += ", no GPS"
    if trip:
        fill["requestId"] = trip["requestId"]
        store.add_fill(fill, trip["requestId"], history_event(user, "filled", detail), trip_fields)
    else:
        store.add_fill(fill)
    return 201, fill


def parse_chlorine(body):
    """Free residual chlorine in mg/L from the driver's test kit, or None if not tested."""
    value = body.get("chlorineMgL")
    if value in (None, ""):
        return None
    try:
        value = round(float(value), 2)
    except (TypeError, ValueError):
        raise ApiError(400, "chlorineMgL must be a number (mg/L)")
    if not 0 <= value <= 20:
        raise ApiError(400, "chlorineMgL must be between 0 and 20 mg/L")
    return value


def retest(fill_id, body, user):
    """Driver re-tests chlorine after re-chlorinating or refilling."""
    require_role(user, "driver")
    fill = store.get_fill(fill_id)
    if not fill:
        raise ApiError(404, "Fill not found")
    if fill["tankerId"] != user.get("tankerId"):
        raise ApiError(403, "Not your tanker's fill")
    chlorine = parse_chlorine(body)
    if chlorine is None:
        raise ApiError(400, "chlorineMgL is required")
    status = insights.chlorine_status(chlorine)
    trip = store.get_request(fill["requestId"]) if fill.get("requestId") else None
    linked = trip if trip and trip.get("status") == "ASSIGNED" and trip.get("fillId") == fill_id else None
    store.retest_fill(fill_id, {"chlorineMgL": chlorine, "chlorineStatus": status, "retestedAt": now_iso(),
                                "previousChlorineMgL": fill.get("chlorineMgL")},
                      linked["requestId"] if linked else None,
                      {"chlorineMgL": chlorine, "chlorineStatus": status, "waterSafe": status != "unsafe"},
                      history_event(user, "retested", f"chlorine {chlorine} mg/L ({status})"))
    return 200, store.get_fill(fill_id)


def expected_schedule():
    """Expected arrival for every waiting colony, counting tankers' current trips, refills and repeat trips."""
    reqs = store.list_requests()
    active = [r for r in reqs if r["status"] in TANKER_OUT]
    return 200, insights.schedule(queue()[1], store.list_tankers(), active, colonies_by_id(), fill_points_list())


def upload_photo(request_id, body, user):
    """Driver's photo at the colony, kept privately as evidence for disputes."""
    require_role(user, "driver")
    req = require_request(request_id)
    if user.get("tankerId") != req.get("tankerId"):
        raise ApiError(403, "This trip belongs to another tanker")
    if req["status"] not in (*TANKER_OUT, "DELIVERED"):
        raise ApiError(409, "This trip is not active")
    try:
        data = base64.b64decode(str(body.get("image") or "").split(",")[-1], validate=True)
    except ValueError:
        raise ApiError(400, "image must be a base64 JPEG")
    if not data.startswith(b"\xff\xd8") or len(data) > MAX_PHOTO_BYTES:
        raise ApiError(400, f"image must be a JPEG of at most {MAX_PHOTO_BYTES // 1024} KB")
    key = f"photos/{request_id}.jpg"
    store.put_photo(key, data)
    store.update_request(request_id, {"photoKey": key, "photoAt": now_iso()},
                         history_event(user, "photo", f"{len(data) // 1024} KB"))
    return 200, {"ok": True}


def get_photo(request_id, user):
    require_role(user, "dispatcher", "officer", "colony", "driver")
    req = require_request(request_id)
    if user["role"] == "colony" and user.get("colonyId") != req["colonyId"]:
        raise ApiError(403, "Not your colony's delivery")
    if user["role"] == "driver" and user.get("tankerId") != req.get("tankerId"):
        raise ApiError(403, "Not your trip")
    data = store.get_photo(req["photoKey"]) if req.get("photoKey") else None
    if not data:
        raise ApiError(404, "No photo for this delivery")
    return 200, Raw(data, "image/jpeg")


# ---------- ward officer ----------

def review_queue(user):
    require_role(user, "officer", "dispatcher")
    return 200, review.review_queue(store.list_requests(), store.list_fills(), complaints=store.list_complaints())


def resolve_request(request_id, body, user):
    """Officer settles a disputed or flagged delivery with the litres they established (site visit, photo, call)."""
    require_role(user, "officer")
    req = require_request(request_id)
    if req["status"] != "DELIVERED":
        raise ApiError(409, "Only a delivered request can be resolved")
    litres = parse_litres(body, capacity_of(req.get("tankerId")))
    note = (body.get("note") or "").strip()
    if not 10 <= len(note) <= 300:
        raise ApiError(400, "note must explain the decision (10-300 characters)")
    resolution = {"note": note, "litres": litres, "by": user.get("name", ""), "at": now_iso(),
                  "previousLitres": req.get("litresDelivered"), "previousVerification": req.get("verification")}
    store.update_request(request_id, {"litresDelivered": litres, "verification": "resolved", "resolution": resolution},
                         history_event(user, "resolved", f"{litres} L: {note}"),
                         "#s = :d AND attribute_not_exists(resolution)", {":d": "DELIVERED"})
    return 200, store.get_request(request_id)


def review_fill(fill_id, body, user):
    require_role(user, "officer")
    note = (body.get("note") or "").strip()[:300]
    store.fills_table.update_item(Key={"fillId": fill_id}, ConditionExpression="attribute_exists(fillId)",
                                  UpdateExpression="SET reviewedAt = :t, reviewNote = :n, reviewedBy = :b",
                                  ExpressionAttributeValues={":t": now_iso(), ":n": note, ":b": user.get("name", "")})
    return 200, {"ok": True}


def list_users(user):
    require_role(user, "officer")
    users = [{**auth.public_user(u), "disabled": bool(u.get("disabled"))} for u in store.list_users()]
    return 200, sorted(users, key=lambda u: (u["role"], u["name"]))


def add_user(body, user):
    require_role(user, "officer")
    if body.get("role") == "officer":
        raise ApiError(403, "Officer accounts are created by the AWS administrator")
    if store.get_user(auth.normalize_phone(body.get("phone")) or "-"):
        raise ApiError(409, "An account with this number already exists")
    result = admin_add_user(body)
    if not result["ok"]:
        raise ApiError(400, result["error"])
    return 201, result["user"]


def disable_user(phone, body, user):
    require_role(user, "officer")
    phone = auth.normalize_phone(phone)
    if not phone or phone == user["phone"]:
        raise ApiError(400, "You cannot disable your own account")
    target = store.get_user(phone)
    if not target:
        raise ApiError(404, "Account not found")
    if target["role"] == "officer":
        raise ApiError(403, "Officer accounts are managed by the AWS administrator")
    store.set_user_disabled(phone, bool(body.get("disabled", True)))
    return 200, {"ok": True}


def set_tanker_status(tanker_id, body, user):
    """Shift change: on duty (AVAILABLE) or off duty / under repair (OFF_DUTY)."""
    require_role(user, "dispatcher", "officer", "driver")
    if user["role"] == "driver" and user.get("tankerId") != tanker_id:
        raise ApiError(403, "Not your tanker")
    status = body.get("status")
    if status not in ("AVAILABLE", "OFF_DUTY"):
        raise ApiError(400, "status must be AVAILABLE or OFF_DUTY")
    store.set_tanker_status(tanker_id, status)
    return 200, store.get_tanker(tanker_id)


def colony_settings(colony_id, body, user):
    """Officer sets the need inputs. Every change is logged on the colony and shown publicly."""
    require_role(user, "officer")
    colony = store.get_colony(colony_id)
    if not colony:
        raise ApiError(404, "Colony not found")
    fields = {}
    try:
        if "households" in body:
            fields["households"] = int(body["households"])
            if not 1 <= fields["households"] <= 100000:
                raise ValueError
        if "pipedLitresPerPerson7d" in body:
            fields["pipedLitresPerPerson7d"] = round(float(body["pipedLitresPerPerson7d"]), 1)
            if not 0 <= fields["pipedLitresPerPerson7d"] <= 2000:
                raise ValueError
        if "priorityWeight" in body:
            fields["priorityWeight"] = round(float(body["priorityWeight"]), 2)
            if not 1 <= fields["priorityWeight"] <= 2:
                raise ValueError
    except (TypeError, ValueError):
        raise ApiError(400, "households 1-100000, pipedLitresPerPerson7d 0-2000, priorityWeight 1-2")
    if "priorityReason" in body:
        fields["priorityReason"] = (body.get("priorityReason") or "").strip()[:120]
    if "name" in body:
        fields["name"] = clean_name(body.get("name"))
    if "nameHi" in body:
        fields["nameHi"] = (body.get("nameHi") or "").strip()[:60] or colony["name"]
    if "lat" in body or "lon" in body:
        fields["lat"], fields["lon"] = parse_point(body)
    weight = fields.get("priorityWeight", colony.get("priorityWeight", 1))
    if weight != 1 and not fields.get("priorityReason", colony.get("priorityReason")):
        raise ApiError(400, "A priority weight above 1 needs a public reason (for example: has a clinic)")
    if not fields:
        raise ApiError(400, "Nothing to change")
    change = {"at": now_iso(), "by": user.get("name", ""), "note": (body.get("note") or "").strip()[:200],
              "before": {k: colony.get(k) for k in fields}, "after": fields}
    store.update_colony(colony_id, fields, change)
    return 200, store.get_colony(colony_id)


def plan(user):
    """Suggested assignment for every free tanker, in queue order, nearest tanker first."""
    require_role(user, "dispatcher")
    return 200, insights.plan_dispatch(queue()[1], store.list_tankers(), colonies_by_id(), fill_points_list())


def parse_point(body):
    try:
        lat, lon = float(body["lat"]), float(body["lon"])
    except (KeyError, TypeError, ValueError):
        raise ApiError(400, "Pick the location on the map (lat and lon)")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ApiError(400, "location is out of range")
    return round(lat, 6), round(lon, 6)


def clean_name(value, field="name"):
    name = (value or "").strip() if isinstance(value, str) else ""
    if not 2 <= len(name) <= 60:
        raise ApiError(400, f"{field} must be 2-60 characters")
    return name


def add_colony(body, user):
    require_role(user, "officer")
    name = clean_name(body.get("name"))
    try:
        households = int(body.get("households"))
    except (TypeError, ValueError):
        raise ApiError(400, "households must be a whole number")
    if not 1 <= households <= 100000:
        raise ApiError(400, "households must be 1-100000")
    lat, lon = parse_point(body)
    if any(c["name"].lower() == name.lower() for c in store.list_colonies()):
        raise ApiError(409, "A colony with this name already exists")
    item = {"colonyId": f"col-{uuid.uuid4().hex[:6]}", "name": name, "nameHi": (body.get("nameHi") or name).strip()[:60],
            "households": households, "lat": lat, "lon": lon, "pipedLitresPerPerson7d": 0, "priorityWeight": 1,
            "priorityReason": "", "changes": [{"at": now_iso(), "by": user.get("name", ""), "note": "colony added"}]}
    store.put_colony(item)
    return 201, item


def add_tanker(body, user):
    require_role(user, "officer")
    tanker_id = (body.get("tankerId") or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,19}", tanker_id):
        raise ApiError(400, "Tanker number: 2-20 letters, digits or dashes (for example dl-1l-4521)")
    try:
        capacity = int(body.get("capacityLitres"))
    except (TypeError, ValueError):
        raise ApiError(400, "capacityLitres must be a whole number")
    if not 1000 <= capacity <= 50000:
        raise ApiError(400, "capacityLitres must be 1000-50000")
    item = {"tankerId": tanker_id, "capacityLitres": capacity, "driverName": clean_name(body.get("driverName"), "driverName"),
            "status": "AVAILABLE"}
    if body.get("lat") is not None:
        item["lastLat"], item["lastLon"] = parse_point(body)
    store.put_tanker(item)
    return 201, item


def tanker_settings(tanker_id, body, user):
    require_role(user, "officer")
    if not store.get_tanker(tanker_id):
        raise ApiError(404, "Tanker not found")
    fields = {}
    if "driverName" in body:
        fields["driverName"] = clean_name(body.get("driverName"), "driverName")
    if "capacityLitres" in body:
        try:
            fields["capacityLitres"] = int(body["capacityLitres"])
        except (TypeError, ValueError):
            raise ApiError(400, "capacityLitres must be a whole number")
        if not 1000 <= fields["capacityLitres"] <= 50000:
            raise ApiError(400, "capacityLitres must be 1000-50000")
    if not fields:
        raise ApiError(400, "Nothing to change")
    store.update_tanker(tanker_id, fields)
    return 200, store.get_tanker(tanker_id)


def add_hydrant(body, user):
    require_role(user, "officer")
    lat, lon = parse_point(body)
    item = {"colonyId": f"hyd-{uuid.uuid4().hex[:6]}", "kind": "hydrant", "name": clean_name(body.get("name")),
            "lat": lat, "lon": lon}
    store.put_colony(item)
    return 201, {"id": item["colonyId"], "name": item["name"], "lat": lat, "lon": lon}


def delete_hydrant(hydrant_id, body, user):
    require_role(user, "officer")
    try:
        store.delete_hydrant(hydrant_id)
    except Exception:
        raise ApiError(404, "Hydrant not found")
    return 200, {"ok": True}


# ---------- complaints ----------

def file_complaint(body, user):
    require_role(user, *auth.ROLES)
    kind = body.get("type")
    text = (body.get("text") or "").strip()
    if kind not in COMPLAINT_TYPES:
        raise ApiError(400, "type must be one of: " + ", ".join(COMPLAINT_TYPES))
    if not 10 <= len(text) <= 1000:
        raise ApiError(400, "Please describe the problem (10-1000 characters)")
    colony_id = user.get("colonyId") or body.get("colonyId") or None
    if colony_id and not store.get_colony(colony_id):
        raise ApiError(404, "Colony not found")
    item = {"complaintId": f"T-{uuid.uuid4().hex[:6].upper()}", "type": kind, "text": text, "status": "OPEN",
            "createdAt": now_iso(), "byRole": user["role"], "byRef": auth.mask_phone(user["phone"]),
            "byPhone": user["phone"]}
    if colony_id:
        item["colonyId"] = colony_id
    if body.get("requestId"):
        item["requestId"] = str(body["requestId"])[:64]
    if kind in ("dirty_water", "short_water") and colony_id and "requestId" not in item:
        # Link to the colony's latest delivery in the last 3 days, so it counts against that tanker.
        recent = [r for r in store.list_requests() if r["colonyId"] == colony_id and r["status"] == "DELIVERED"
                  and r.get("deliveredAt") and datetime.now(timezone.utc) - ranking.parse_time(r["deliveredAt"]) <= timedelta(days=3)]
        if recent:
            last = max(recent, key=lambda r: r["deliveredAt"])
            item["requestId"] = last["requestId"]
            item["tankerId"] = last.get("deliveredTankerId") or last.get("tankerId")
    store.put_complaint(item)
    return 201, public_complaint(item, user)


def public_complaint(c, user):
    """Everyone sees the ticket, type, colony, status and resolution. Only the officer and the person
    who filed it see the text, and only the officer sees who filed it."""
    out = {k: v for k, v in c.items() if k not in ("byPhone", "text", "byRef")}
    if user and (user["role"] == "officer" or user["phone"] == c.get("byPhone")):
        out["text"] = c.get("text", "")
        out["mine"] = user["phone"] == c.get("byPhone")
    if user and user["role"] == "officer":
        out["byRef"] = c.get("byRef")
    return out


def list_complaints(user):
    items = sorted(store.list_complaints(), key=lambda c: c["createdAt"], reverse=True)
    return 200, [public_complaint(c, user) for c in items]


def resolve_complaint(complaint_id, body, user):
    require_role(user, "officer")
    note = (body.get("note") or "").strip()
    if not 10 <= len(note) <= 500:
        raise ApiError(400, "Write what was done (10-500 characters)")
    if not store.get_complaint(complaint_id):
        raise ApiError(404, "Complaint not found")
    store.resolve_complaint(complaint_id, {"status": "RESOLVED", "resolvedAt": now_iso(),
                                           "resolutionNote": note, "resolvedBy": user.get("name", "")})
    return 200, public_complaint(store.get_complaint(complaint_id), user)


# ---------- public dashboard and open data ----------

def stats():
    reqs = store.list_requests()
    fills = store.list_fills()
    return 200, {**review.stats(reqs, colonies_by_id(), store.list_complaints()),
                 "impact": insights.impact(reqs, fills),
                 "tankers": insights.tanker_scorecards(store.list_tankers(), reqs, fills)}


def overrides():
    return 200, review.overrides(store.list_requests(), colonies_by_id())


def export_csv():
    return 200, Raw(review.deliveries_csv(store.list_requests(), colonies_by_id()), "text/csv; charset=utf-8",
                    "tanker-deliveries.csv")


# ---------- admin (only via `aws lambda invoke`, which needs AWS credentials) ----------

def admin_add_user(spec):
    phone = auth.normalize_phone(spec.get("phone"))
    role = spec.get("role")
    if not phone or role not in auth.ROLES or not auth.valid_pin(spec.get("pin")) or not spec.get("name"):
        return {"ok": False, "error": "need phone (10 digits), pin (6-8 digits), name and role (dispatcher|driver|colony|officer)"}
    user = {"phone": phone, "name": spec["name"], "role": role, "pinHash": auth.hash_pin(spec["pin"])}
    if role == "colony":
        if not store.get_colony(spec.get("colonyId") or ""):
            return {"ok": False, "error": "colony role needs an existing colonyId"}
        user["colonyId"] = spec["colonyId"]
    if role == "driver":
        if not store.get_tanker(spec.get("tankerId") or ""):
            return {"ok": False, "error": "driver role needs an existing tankerId"}
        user["tankerId"] = spec["tankerId"]
    store.put_user(user)
    return {"ok": True, "user": auth.public_user(user)}


# ---------- router ----------

def route(method, path, body, query, headers):
    user = lambda: current_user(headers)  # noqa: E731  (only looked up for routes that need it)
    if method == "POST" and path == "/auth/login":
        return login(body)
    if method == "GET" and path == "/auth/me":
        return me(user())
    if method == "GET" and path == "/colonies":
        return 200, sorted(store.list_colonies(), key=lambda c: c["colonyId"])
    if method == "GET" and path == "/tankers":
        return 200, store.list_tankers()
    if method == "GET" and path == "/queue":
        return queue()
    if method == "GET" and path == "/ledger":
        return ledger()
    if method == "GET" and path == "/heat":
        return heat(query)
    if method == "POST" and path == "/assist/parse":
        return parse_text(body)
    if method == "GET" and path == "/forecast":
        return forecast(query)
    if method == "GET" and path == "/stats":
        return stats()
    if method == "GET" and path == "/overrides":
        return overrides()
    if method == "GET" and path == "/export/deliveries.csv":
        return export_csv()
    if method == "GET" and path == "/fillpoints":
        return fill_points()
    if method == "GET" and path == "/schedule":
        return expected_schedule()
    if method == "GET" and path == "/dispatch/plan":
        return plan(user())
    if method == "POST" and path == "/colonies":
        return add_colony(body, user())
    if method == "POST" and path == "/tankers":
        return add_tanker(body, user())
    if method == "POST" and path == "/hydrants":
        return add_hydrant(body, user())
    if method == "POST" and path == "/fills":
        return log_fill(body, user())
    if method == "GET" and path == "/review":
        return review_queue(user())
    if path == "/users":
        return list_users(user()) if method == "GET" else add_user(body, user())
    if path == "/complaints":
        return list_complaints(user()) if method == "GET" else file_complaint(body, user())
    item = ITEM_PATH.match(path)
    if item and method == "POST":
        kind, key, action = item.groups()
        item_handlers = {("fills", "review"): review_fill, ("users", "disable"): disable_user,
                         ("tankers", "status"): set_tanker_status, ("colonies", "settings"): colony_settings,
                         ("complaints", "resolve"): resolve_complaint, ("tankers", "settings"): tanker_settings,
                         ("hydrants", "delete"): delete_hydrant, ("fills", "retest"): retest}
        if (kind, action) in item_handlers:
            return item_handlers[(kind, action)](key, body, user())
    if path == "/requests":
        if method == "POST":
            return create_request(body, user())
        if method == "GET":
            return list_requests(query)
    match = ACTION_PATH.match(path)
    if match and method == "GET" and match.group(2) == "photo":
        return get_photo(match.group(1), user())
    if match and method == "POST":
        request_id, action = match.groups()
        handlers = {"assign": assign, "confirm": confirm, "deliver": deliver, "release": release,
                    "photo": upload_photo, "resolve": resolve_request, "cancel": cancel}
        if action == "dispatch":
            return dispatch(request_id, body, user())
        return handlers[action](request_id, body, user())
    raise ApiError(404, f"No route for {method} {path}")


# ---------- web app served by this function (WebsiteHosting=api: everything on AWS, HTTPS via API Gateway) ----------

STATIC_DIR = os.environ.get("STATIC_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
STATIC_FILES = {  # name -> (content type, cache seconds); the app files change on every deploy, so no long caching
    "index.html": ("text/html; charset=utf-8", 0), "app.js": ("text/javascript; charset=utf-8", 0),
    "styles.css": ("text/css; charset=utf-8", 0), "config.js": ("text/javascript; charset=utf-8", 0),
    "sw.js": ("text/javascript; charset=utf-8", 0), "manifest.webmanifest": ("application/manifest+json", 3600),
    "icon.svg": ("image/svg+xml", 86400),
}


def static_file(path):
    name = "index.html" if path == "/" else path.lstrip("/")
    if name not in STATIC_FILES:
        return None
    try:
        with open(os.path.join(STATIC_DIR, name), encoding="utf-8") as f:
            body = f.read()
    except OSError:
        return None
    content_type, max_age = STATIC_FILES[name]
    return {"statusCode": 200, "body": body, "headers": {
        "content-type": content_type,
        "cache-control": f"public, max-age={max_age}" if max_age else "no-cache",
        "x-content-type-options": "nosniff",
    }}


def handler(event, context):
    if event.get("seed"):
        import seed
        return seed.run()
    if event.get("autoRelease"):  # EventBridge schedule (see template.yaml)
        return auto_release(event.get("hours"))
    if event.get("addUser"):
        return admin_add_user(event["addUser"])
    if event.get("removeUser"):
        store.delete_user(auth.normalize_phone(event["removeUser"].get("phone")) or "-")
        return {"ok": True}

    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = (event.get("rawPath") or "/").rstrip("/") or "/"
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if method == "OPTIONS":
        return response(204, None)
    if method == "GET" and os.environ.get("SITE_FROM_API") == "true":
        page = static_file(path)
        if page:
            return page
    try:
        status, body = route(method, path, parse_body(event), event.get("queryStringParameters") or {}, headers)
        return response(status, body)
    except ApiError as e:
        return response(e.status, {"error": e.message})
    except store.RuleBroken as e:
        return response(409, {"error": str(e)})
    except Exception as e:
        print("Unhandled error:", repr(e))
        return response(500, {"error": "Internal error"})
