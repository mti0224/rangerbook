#!/usr/bin/env python3
"""Isolated test-site entrance: form sign-in for standalone iOS PWAs.

Keeps the existing htpasswd credential database and Nginx Basic Auth fallback.
Only a signed, Secure HttpOnly cookie can bypass Basic Auth. Never caches site data.
"""
import base64
import collections
import crypt
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
import urllib.parse
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CREDENTIALS = "/etc/nginx/rangerbook-membership-test.htpasswd"
COOKIE_NAME = "__Host-rb_stage_access"
TTL = 8 * 3600
WINDOW = 15 * 60
MAX_FAILURES = 8
KEY = open("/etc/rangerbook-stage-access.secret", "rb").read()
if len(KEY) < 32:
    raise RuntimeError("stage access signing key is too short")
lock = threading.Lock()
failures = collections.defaultdict(list)
DUMMY_HASH = crypt.crypt("not-a-password", "$6$rbstageunmatched$")

LOGIN_HTML = """<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Rangerbook TEST — 登入</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif;color-scheme:light}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;
background:linear-gradient(145deg,#fff7f0,#eef6f6);padding:24px}
main{width:100%;max-width:400px;background:white;padding:30px 26px;border-radius:20px;
box-shadow:0 15px 50px #182e3630}
.tag{display:inline-block;background:#fdf0e8;color:#9a4309;font-size:12px;font-weight:700;
border-radius:7px;padding:5px 9px;letter-spacing:.08em}
h1{font-size:25px;margin:19px 0 8px}p{color:#52616b;line-height:1.65;font-size:14px}
label{display:block;font-size:14px;font-weight:600;margin:19px 0 8px}
input{width:100%;font-size:16px;border:1px solid #becdd3;border-radius:11px;
padding:13px;background:#fff;color:#142a33}
input:focus{outline:2px solid #087e78;outline-offset:1px}
button{width:100%;font-size:16px;font-weight:700;background:#087e78;color:white;
border:0;border-radius:11px;padding:14px;margin-top:23px;cursor:pointer}
.error{color:#ac2b25;background:#fff1ef;border-radius:9px;padding:11px;margin-top:18px}
footer{margin-top:20px;color:#71818c;font-size:12px;line-height:1.5}
</style></head><body><main>
<span class="tag">RANGERBOOK · TEST</span>
<h1>登入測試站</h1>
<p>請輸入測試站的存取帳號與密碼。登入後即可從主畫面直接開啟 PWA。</p>
{{ERROR}}
<form method="post" action="/__stage_access/login" autocomplete="on">
<label for="username">測試站帳號</label>
<input id="username" name="username" type="text" autocomplete="username" required maxlength="128">
<label for="password">測試站密碼</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">登入並開啟資料站</button>
</form>
<footer>僅限授權測試人員。這是測試站入口驗證，與資料站會員帳號分開。</footer>
</main></body></html>"""


def encode(raw):
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(username):
    payload = json.dumps({"u": username, "e": int(time.time()) + TTL, "n": secrets.token_hex(12)},
                         separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    mac = hmac.new(KEY, payload, hashlib.sha256).digest()
    return encode(payload) + "." + encode(mac)


def username_from_cookie(cookie_header):
    try:
        cookie = SimpleCookie()
        cookie.load(cookie_header or "")
        item = cookie.get(COOKIE_NAME)
        if not item:
            return None
        token = item.value
        parts = token.split(".")
        if len(parts) != 2 or len(token) > 2048:
            return None
        payload, signature = decode(parts[0]), decode(parts[1])
        if not hmac.compare_digest(hmac.new(KEY, payload, hashlib.sha256).digest(), signature):
            return None
        data = json.loads(payload)
        exp = data.get("e")
        if not isinstance(exp, int) or not int(time.time()) < exp <= int(time.time()) + TTL:
            return None
        name = data.get("u")
        if not isinstance(name, str) or not name:
            return None
        return name
    except (ValueError, UnicodeError, KeyError, TypeError, OverflowError):
        return None


def password_matches(username, password):
    stored = None
    with open(CREDENTIALS, "r", encoding="utf-8") as f:
        for line in f:
            name, _, hashed = line.rstrip("\r\n").partition(":")
            if hmac.compare_digest(name.encode("utf-8"), username.encode("utf-8")):
                stored = hashed
    target = stored or DUMMY_HASH
    calculated = crypt.crypt(password, target)
    return bool(stored and calculated and hmac.compare_digest(calculated, stored))


def allow_attempt(ip):
    now = time.monotonic()
    with lock:
        failures[ip] = [t for t in failures[ip] if now - t < WINDOW]
        return len(failures[ip]) < MAX_FAILURES


def mark_failure(ip):
    with lock:
        failures[ip].append(time.monotonic())


def clear_failures(ip):
    with lock:
        failures.pop(ip, None)


class Handler(BaseHTTPRequestHandler):
    server_version = "RBStageAccess"
    sys_version = ""

    def log_message(self, format, *args):
        pass  # Never log usernames, credentials, cookies or callback URLs.

    def send_common(self, status, content_type=None, cookie=None, location=None):
        self.send_response(status)
        self.send_header("Cache-Control", "no-store, private")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        if content_type:
            self.send_header("Content-Type", content_type)
        if cookie:
            self.send_header("Set-Cookie", cookie)
        if location:
            self.send_header("Location", location)
        self.end_headers()

    def redirect(self, cookie=None):
        self.send_common(303, cookie=cookie, location="/")

    def login_page(self, error=""):
        body = LOGIN_HTML.replace("{{ERROR}}", '<p role="alert" class="error">' + error + '</p>' if error else "")
        out = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Cache-Control", "no-store, private")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Robots-Tag", "noindex, nofollow,noarchive")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/check":
            self.send_common(204 if username_from_cookie(self.headers.get("Cookie")) else 401)
        elif path == "/login":
            if username_from_cookie(self.headers.get("Cookie")):
                self.redirect()
            else:
                self.login_page()
        else:
            self.send_common(404)

    def do_POST(self):
        if urllib.parse.urlsplit(self.path).path != "/login":
            self.send_common(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_common(400)
            return
        if size < 1 or size > 4096:
            self.send_common(413)
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/x-www-form-urlencoded":
            self.send_common(415)
            return
        ip = self.headers.get("X-Real-IP") or "unknown"
        if len(ip) > 64 or not allow_attempt(ip):
            self.send_common(429)
            return
        try:
            data = urllib.parse.parse_qs(self.rfile.read(size).decode("utf-8"), keep_blank_values=True)
            usernames, passwords = data.get("username", []), data.get("password", [])
            if len(usernames) != 1 or len(passwords) != 1:
                raise ValueError("invalid form")
            username, password = usernames[0], passwords[0]
            if not (0 < len(username) <= 128 and 0 < len(password) <= 512):
                raise ValueError("invalid credential")
            valid = password_matches(username, password)
        except (ValueError, UnicodeError):
            valid = False
        if not valid:
            mark_failure(ip)
            self.login_page("帳號或密碼有誤，請重新輸入。")
            return
        clear_failures(ip)
        token = make_token(username)
        cookie = f"{COOKIE_NAME}={token}; Path=/; Max-Age={TTL}; Secure; HttpOnly; SameSite=Lax"
        self.redirect(cookie=cookie)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 18866), Handler).serve_forever()
