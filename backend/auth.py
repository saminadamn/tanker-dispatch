"""Phone + PIN sign-in with signed, stateless tokens. No paid services.

Roles:
  dispatcher - assigns, dispatches and releases tankers; can request on behalf of any colony
  driver     - linked to one tanker; starts trips and reports deliveries (with GPS)
  colony     - colony representative; requests water and confirms deliveries for one colony
  officer    - ward officer; settles disputes, reviews alerts, manages accounts and colony need settings

PINs are stored as PBKDF2-SHA256 hashes. Tokens are HMAC-SHA256 signed with a secret read from
the AUTH_SECRET env var (local) or the SSM SecureString named by AUTH_SECRET_PARAM (AWS).
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

ROLES = ("dispatcher", "driver", "colony", "officer")
TOKEN_DAYS = 7
MAX_FAILED_LOGINS = 5
LOCK_MINUTES = 15
ITERATIONS = 100_000

_secret = None


def secret():
    global _secret
    if _secret is None:
        value = os.environ.get("AUTH_SECRET")
        if not value:
            import boto3
            value = boto3.client("ssm").get_parameter(
                Name=os.environ["AUTH_SECRET_PARAM"], WithDecryption=True)["Parameter"]["Value"]
        _secret = value.encode()
    return _secret


def normalize_phone(phone):
    """Keep the last 10 digits, so +91 98..., 098... and 98... are the same account."""
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else None


def mask_phone(phone):
    return f"xxxxxx{phone[-4:]}"


def valid_pin(pin):
    return isinstance(pin, str) and pin.isdigit() and 6 <= len(pin) <= 8


def hash_pin(pin):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, ITERATIONS)
    return f"pbkdf2${ITERATIONS}${salt.hex()}${digest.hex()}"


def check_pin(pin, stored):
    try:
        _, iterations, salt, digest = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(calc.hex(), digest)
    except (ValueError, AttributeError):
        return False


def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text):
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(body):
    return _b64(hmac.new(secret(), body.encode(), hashlib.sha256).digest())


def make_token(user):
    payload = {"sub": user["phone"], "role": user["role"], "exp": int(time.time()) + TOKEN_DAYS * 86400}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{body}.{_sign(body)}"


def read_token(token):
    """Return the token payload, or None if it is malformed, forged or expired."""
    try:
        body, sig = token.split(".")
        if not hmac.compare_digest(sig, _sign(body)):
            return None
        payload = json.loads(_unb64(body))
        return payload if payload.get("exp", 0) > time.time() else None
    except (ValueError, json.JSONDecodeError):
        return None


def public_user(user):
    return {k: user[k] for k in ("phone", "name", "role", "colonyId", "tankerId") if k in user}
