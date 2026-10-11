"""Local stand-in for API Gateway: turns HTTP requests into HTTP API (v2) Lambda events
and calls backend/app.handler. Creates the DynamoDB Local tables and seeds them on start.
"""
import base64
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, urlsplit

sys.path.insert(0, "/app/backend")

import boto3  # noqa: E402

TABLES = {
    os.environ["COLONIES_TABLE"]: "colonyId",
    os.environ["TANKERS_TABLE"]: "tankerId",
    os.environ["REQUESTS_TABLE"]: "requestId",
    os.environ["USERS_TABLE"]: "phone",
    os.environ["FILLS_TABLE"]: "fillId",
    os.environ["COMPLAINTS_TABLE"]: "complaintId",
}


def prepare_db():
    ddb = boto3.client("dynamodb")
    for attempt in range(30):
        try:
            existing = set(ddb.list_tables()["TableNames"])
            break
        except Exception as e:
            print("Waiting for DynamoDB Local...", repr(e), flush=True)
            time.sleep(1)
    else:
        raise SystemExit("DynamoDB Local did not start")
    for name, key in TABLES.items():
        if name not in existing:
            ddb.create_table(
                TableName=name,
                AttributeDefinitions=[{"AttributeName": key, "AttributeType": "S"}],
                KeySchema=[{"AttributeName": key, "KeyType": "HASH"}],
                ProvisionedThroughput={"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
            )
            print("Created table", name, flush=True)


class Handler(BaseHTTPRequestHandler):
    def _handle(self):
        import app

        url = urlsplit(self.path)
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length).decode("utf-8") if length else None
        event = {
            "requestContext": {"http": {"method": self.command}},
            "rawPath": url.path,
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "queryStringParameters": dict(parse_qsl(url.query)) or None,
            "body": body,
            "isBase64Encoded": False,
        }
        local_job = {"/local/seed": {"seed": True}, "/local/auto-release": {"autoRelease": True}}.get(url.path)
        if local_job and self.command == "POST":
            # /local/auto-release?hours=0 releases everything open right now (handy for demos)
            hours = dict(parse_qsl(url.query)).get("hours")
            job = {**local_job, "hours": hours} if hours is not None else local_job
            result = {"statusCode": 200, "headers": {"content-type": "application/json",
                                                       "access-control-allow-origin": "*"},
                      "body": json.dumps(app.handler(job, None))}
        else:
            result = app.handler(event, None)
        raw = result.get("body") or ""
        payload = base64.b64decode(raw) if result.get("isBase64Encoded") else raw.encode("utf-8")  # photos
        self.send_response(result["statusCode"])
        for k, v in result.get("headers", {}).items():
            self.send_header(k, v)
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    do_GET = do_POST = do_OPTIONS = _handle


if __name__ == "__main__":
    prepare_db()
    import seed
    print("Seeding demo data:", seed.run(), flush=True)

    def auto_release_loop():  # stands in for the EventBridge schedule
        import app
        while True:
            time.sleep(15 * 60)
            try:
                app.handler({"autoRelease": True}, None)
            except Exception as e:
                print("Auto-release failed:", repr(e), flush=True)

    threading.Thread(target=auto_release_loop, daemon=True).start()
    print("API listening on :3001", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 3001), Handler).serve_forever()
