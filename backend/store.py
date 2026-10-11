import os
from decimal import Decimal

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

COLONIES = os.environ.get("COLONIES_TABLE", "Colonies")
TANKERS = os.environ.get("TANKERS_TABLE", "Tankers")
REQUESTS = os.environ.get("REQUESTS_TABLE", "Requests")
USERS = os.environ.get("USERS_TABLE", "Users")
FILLS = os.environ.get("FILLS_TABLE", "Fills")
COMPLAINTS = os.environ.get("COMPLAINTS_TABLE", "Complaints")
PHOTO_BUCKET = os.environ.get("PHOTO_BUCKET")  # AWS: private S3 bucket
PHOTO_DIR = os.environ.get("PHOTO_DIR")        # local docker: a folder instead of S3

_ddb = boto3.resource("dynamodb")
_client = boto3.client("dynamodb")
_serializer = TypeSerializer()
colonies_table = _ddb.Table(COLONIES)
tankers_table = _ddb.Table(TANKERS)
requests_table = _ddb.Table(REQUESTS)
users_table = _ddb.Table(USERS)
fills_table = _ddb.Table(FILLS)
complaints_table = _ddb.Table(COMPLAINTS)


class RuleBroken(Exception):
    """A conditional write failed: the record changed state under us."""


def clean(value):
    if isinstance(value, list):
        return [clean(v) for v in value]
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    return value


def to_ddb(value):
    """DynamoDB rejects Python floats; store them as Decimal."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, list):
        return [to_ddb(v) for v in value]
    if isinstance(value, dict):
        return {k: to_ddb(v) for k, v in value.items()}
    return value


def _av(value):
    return _serializer.serialize(to_ddb(value))


def scan_all(table):
    items, kwargs = [], {}
    while True:
        page = table.scan(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            return clean(items)
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def get(table, key):
    return clean(table.get_item(Key=key).get("Item"))


# Hydrants live in the Colonies table as kind="hydrant" items, so the app stays at 6 tables (DynamoDB free tier).
def list_colonies():
    return [c for c in scan_all(colonies_table) if c.get("kind") != "hydrant"]


def list_hydrants():
    return [c for c in scan_all(colonies_table) if c.get("kind") == "hydrant"]


def put_colony(item):
    colonies_table.put_item(Item=to_ddb(item), ConditionExpression="attribute_not_exists(colonyId)")


def delete_hydrant(hydrant_id):
    colonies_table.delete_item(Key={"colonyId": hydrant_id}, ConditionExpression="kind = :h",
                               ExpressionAttributeValues={":h": "hydrant"})


def get_colony(colony_id):
    return get(colonies_table, {"colonyId": colony_id})


def list_tankers():
    return sorted(scan_all(tankers_table), key=lambda t: t["tankerId"])


def get_tanker(tanker_id):
    return get(tankers_table, {"tankerId": tanker_id})


def put_tanker(item):
    try:
        tankers_table.put_item(Item=to_ddb(item), ConditionExpression="attribute_not_exists(tankerId)")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise RuleBroken("A tanker with this number already exists")
        raise


def update_tanker(tanker_id, fields):
    tankers_table.update_item(
        Key={"tankerId": tanker_id}, ConditionExpression="attribute_exists(tankerId)",
        UpdateExpression="SET " + ", ".join(f"#f{i} = :v{i}" for i in range(len(fields))),
        ExpressionAttributeNames={f"#f{i}": k for i, k in enumerate(fields)},
        ExpressionAttributeValues=to_ddb({f":v{i}": v for i, v in enumerate(fields.values())}))


def list_requests():
    return scan_all(requests_table)


def get_request(request_id):
    return get(requests_table, {"requestId": request_id})


def put_request(item):
    requests_table.put_item(Item=to_ddb(item))


# ---------- users ----------

def get_user(phone):
    return get(users_table, {"phone": phone})


def put_user(item):
    users_table.put_item(Item=to_ddb(item))


def delete_user(phone):
    users_table.delete_item(Key={"phone": phone})


def record_login(phone, ok, now_epoch, lock_seconds, max_failed):
    if ok:
        users_table.update_item(Key={"phone": phone}, UpdateExpression="SET failedLogins = :z REMOVE lockedUntil",
                                ExpressionAttributeValues={":z": 0})
        return
    fails = clean(users_table.update_item(
        Key={"phone": phone}, UpdateExpression="ADD failedLogins :one",
        ExpressionAttributeValues={":one": 1}, ReturnValues="UPDATED_NEW")["Attributes"]["failedLogins"])
    if fails >= max_failed:
        users_table.update_item(Key={"phone": phone}, UpdateExpression="SET lockedUntil = :t, failedLogins = :z",
                                ExpressionAttributeValues={":t": now_epoch + lock_seconds, ":z": 0})


# ---------- request state changes (each one appends to the request's history) ----------

def _transact(items):
    try:
        _client.transact_write_items(TransactItems=items)
    except ClientError as e:
        if e.response["Error"]["Code"] == "TransactionCanceledException":
            raise RuleBroken("Request or tanker changed state, refresh and try again")
        raise


def _request_update(request_id, set_fields, event, condition, condition_values, remove=()):
    """One Update for a transaction: SET fields, append `event` to history, optional REMOVE."""
    names = {"#s": "status"}
    values = {f":v{i}": _av(v) for i, v in enumerate(set_fields.values())}
    sets = []
    for i, field in enumerate(set_fields):
        names[f"#f{i}"] = field
        sets.append(f"#f{i} = :v{i}")
    sets.append("history = list_append(if_not_exists(history, :empty), :h)")
    values.update({":empty": {"L": []}, ":h": {"L": [_av(event)]}})
    values.update({k: _av(v) for k, v in condition_values.items()})
    expr = "SET " + ", ".join(sets) + (" REMOVE " + ", ".join(remove) if remove else "")
    return {"Update": {
        "TableName": REQUESTS, "Key": {"requestId": {"S": request_id}},
        "UpdateExpression": expr, "ConditionExpression": condition,
        "ExpressionAttributeNames": names, "ExpressionAttributeValues": values,
    }}


def _status_in(expect):
    values = {f":e{i}": s for i, s in enumerate(expect)}
    return f"#s IN ({', '.join(values)})", values


def _free_tanker(tanker_id):
    return {"Update": {
        "TableName": TANKERS,
        "Key": {"tankerId": {"S": tanker_id}},
        "UpdateExpression": "SET #s = :avail REMOVE requestId",
        "ExpressionAttributeNames": {"#s": "status"},
        "ExpressionAttributeValues": {":avail": {"S": "AVAILABLE"}},
    }}


def assign(request_id, tanker_id, eta, now, event, extra=None):
    _transact([
        {"Update": {
            "TableName": TANKERS,
            "Key": {"tankerId": {"S": tanker_id}},
            "UpdateExpression": "SET #s = :busy, requestId = :r",
            "ConditionExpression": "#s = :avail",
            "ExpressionAttributeNames": {"#s": "status"},
            "ExpressionAttributeValues": {":busy": {"S": "BUSY"}, ":avail": {"S": "AVAILABLE"},
                                          ":r": {"S": request_id}},
        }},
        _request_update(request_id, {"status": "ASSIGNED", "tankerId": tanker_id, "eta": eta, "assignedAt": now,
                                     **(extra or {})},
                        event, "#s = :pending", {":pending": "PENDING"}),
    ])


def dispatch(request_id, now, event):
    _transact([_request_update(request_id, {"status": "ON_THE_WAY", "dispatchedAt": now},
                               event, "#s = :assigned", {":assigned": "ASSIGNED"})])


def close(request_id, tanker_id, now, fields, event, expect=("ASSIGNED", "ON_THE_WAY")):
    """Mark the request DELIVERED with `fields` (litres, verification, readings) and free the tanker."""
    condition, values = _status_in(expect)
    _transact([
        _request_update(request_id, {"status": "DELIVERED", "deliveredAt": now, **fields}, event, condition, values),
        _free_tanker(tanker_id),
    ])


def add_reading(request_id, fields, event, missing_field, expect_verification):
    """Second side's reading on an already DELIVERED request (driver after colony, or the reverse).
    Fails if that side already reported or the record changed meanwhile."""
    _transact([_request_update(
        request_id, fields, event,
        f"#s = :delivered AND attribute_not_exists({missing_field}) AND verification = :ver",
        {":delivered": "DELIVERED", ":ver": expect_verification})])


def requeue(request_id, tanker_id, now, by, event, expect=("ASSIGNED", "ON_THE_WAY")):
    """The tanker never reached the colony: free it and put the request back in the queue.
    createdAt is kept, so the colony does not lose its place."""
    condition, values = _status_in(expect)
    _transact([
        _request_update(request_id, {"status": "PENDING", "requeuedAt": now, "requeuedBy": by,
                                     "missedTankerId": tanker_id},
                        event, condition, values, remove=("tankerId", "eta", "assignedAt", "dispatchedAt", "fillId", "filledLitres")),
        _free_tanker(tanker_id),
    ])


def update_request(request_id, fields, event, condition="attribute_exists(#s)", values=None):
    """Set fields on a request and log `event` in its history, if `condition` holds."""
    _transact([_request_update(request_id, fields, event, condition, values or {})])


# ---------- users (ward officer screens) ----------

def list_users():
    return scan_all(users_table)


def set_user_disabled(phone, disabled):
    users_table.update_item(Key={"phone": phone}, UpdateExpression="SET disabled = :d",
                            ConditionExpression="attribute_exists(phone)", ExpressionAttributeValues={":d": disabled})


# ---------- tankers: shifts and last known position ----------

def set_tanker_status(tanker_id, status):
    """Go on or off duty. A tanker on a trip (BUSY) cannot change; it frees itself when the trip ends."""
    try:
        tankers_table.update_item(
            Key={"tankerId": tanker_id}, UpdateExpression="SET #s = :new",
            ConditionExpression="attribute_exists(tankerId) AND #s <> :busy",
            ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":new": status, ":busy": "BUSY"})
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise RuleBroken("Tanker is on a trip; it can change shift after the trip ends")
        raise


def set_tanker_position(tanker_id, lat, lon, at):
    tankers_table.update_item(Key={"tankerId": tanker_id}, UpdateExpression="SET lastLat = :a, lastLon = :o, lastSeenAt = :t",
                              ExpressionAttributeValues=to_ddb({":a": lat, ":o": lon, ":t": at}))


# ---------- colonies: need settings set by the ward officer ----------

def update_colony(colony_id, fields, change):
    """Change need settings and append `change` to the colony's public change log."""
    names = {f"#f{i}": k for i, k in enumerate(fields)}
    values = {f":v{i}": v for i, v in enumerate(fields.values())}
    values.update({":empty": [], ":c": [change]})
    sets = [f"#f{i} = :v{i}" for i in range(len(fields))] + ["changes = list_append(if_not_exists(changes, :empty), :c)"]
    colonies_table.update_item(
        Key={"colonyId": colony_id}, ConditionExpression="attribute_exists(colonyId)",
        UpdateExpression="SET " + ", ".join(sets),
        ExpressionAttributeNames=names, ExpressionAttributeValues=to_ddb(values))


# ---------- fills at the hydrant ----------

def list_fills():
    return scan_all(fills_table)


def add_fill(fill, request_id=None, event=None):
    """Store a fill. If it belongs to a trip, link it to that request in the same transaction
    (one fill per trip; a second fill for the same trip is refused)."""
    items = [{"Put": {"TableName": FILLS, "Item": {k: _av(v) for k, v in fill.items()},
                      "ConditionExpression": "attribute_not_exists(fillId)"}}]
    if request_id:
        items.append(_request_update(
            request_id, {"fillId": fill["fillId"], "filledLitres": fill["litres"]}, event,
            "attribute_not_exists(fillId) AND #s IN (:a, :o)", {":a": "ASSIGNED", ":o": "ON_THE_WAY"}))
    _transact(items)


# ---------- delivery photos ----------

def put_photo(key, data):
    if PHOTO_BUCKET:
        import boto3
        boto3.client("s3").put_object(Bucket=PHOTO_BUCKET, Key=key, Body=data, ContentType="image/jpeg")
    else:
        path = os.path.join(PHOTO_DIR or "/tmp/photos", key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)


def get_photo(key):
    if PHOTO_BUCKET:
        import boto3
        try:
            return boto3.client("s3").get_object(Bucket=PHOTO_BUCKET, Key=key)["Body"].read()
        except ClientError:
            return None
    path = os.path.join(PHOTO_DIR or "/tmp/photos", key)
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return f.read()


# ---------- complaints ----------

def list_complaints():
    return scan_all(complaints_table)


def get_complaint(complaint_id):
    return get(complaints_table, {"complaintId": complaint_id})


def put_complaint(item):
    complaints_table.put_item(Item=to_ddb(item), ConditionExpression="attribute_not_exists(complaintId)")


def resolve_complaint(complaint_id, fields):
    try:
        complaints_table.update_item(
            Key={"complaintId": complaint_id}, ConditionExpression="#s = :open",
            UpdateExpression="SET " + ", ".join(f"#f{i} = :v{i}" for i in range(len(fields))),
            ExpressionAttributeNames={"#s": "status", **{f"#f{i}": k for i, k in enumerate(fields)}},
            ExpressionAttributeValues=to_ddb({":open": "OPEN", **{f":v{i}": v for i, v in enumerate(fields.values())}}))
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise RuleBroken("Complaint is already resolved")
        raise
