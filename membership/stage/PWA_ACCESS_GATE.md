# Test-site PWA sign-in gate (isolated)

The test host `rangerbook-test.warmycat.com` has a protected Nginx entrance.
iOS Home Screen web apps may show the raw HTTP Basic 401 instead of a native
credential prompt. This gate redirects *document navigation* to a server-side
login form and issues an 8-hour, HMAC-signed, Secure/HttpOnly/SameSite=Lax
`__Host-rb_stage_access` cookie after checking the **same htpasswd**
credentials. Existing HTTP Basic Auth remains enabled as an alternative.

The gateway does not touch member sessions, bypass PWA Service Worker privacy
limits, or change the production virtual host. Background API requests retain
401. Only `/__stage_access/login` is publicly reachable without credentials;
the cookie check URL is Nginx `internal` and the Python service is bound to
`127.0.0.1:18866`.

## Deployment prerequisites

- Python **3.12** with the legacy `crypt` module (required for the existing
  `$6$` SHA-512 htpasswd hashes). Before upgrading Python to 3.13, replace
  that verifier with a maintained libxcrypt/passlib equivalent.
- Nginx compiled with `http_auth_request_module`.
- The existing `/etc/nginx/rangerbook-membership-test.htpasswd` accessible
  to the `www-data` group; do not copy credentials into the webroot.
- The stage-only Nginx host, TLS certificate, and original stage service.

## Installation

1. Copy `pwa_access_gate.py` to
   `/opt/rangerbook-stage-access/gate.py` (owner root; mode 0644).
2. Create a **new random** signing key in
   `/etc/rangerbook-stage-access.secret`, e.g. from 48 bytes of
   `/dev/urandom`; assign owner `root:www-data` and mode 0640.
   Never check this file into Git or emit its contents to logs.
3. Install `rangerbook-stage-access.service` in
   `/etc/systemd/system/`; run `systemctl daemon-reload` and
   `systemctl enable --now rangerbook-stage-access.service`.
4. Carefully merge the changes in `nginx.conf.in` into the **test-only**
   virtual host. Preserve any separately deployed routes (e.g., wiki) and
   back up the active configuration before editing.
5. Run `nginx -t` before `systemctl reload nginx`.

## Behavior to verify

| Request | Expected result |
| --- | --- |
| Unauthenticated `GET /`, `Accept: text/html` | 302 to `/__stage_access/login` |
| `GET /__stage_access/login` | 200, HTML username/password form |
| Invalid form password | HTML error, no `Set-Cookie` |
| Correct form password | 303 to `/`, signed HttpOnly cookie |
| Document request with valid cookie | 200 without Basic challenge |
| Manifest/service worker request with cookie | 200, online-only worker |
| Unauthenticated API `GET /auth/me` | 401, not HTML login |
| Public `GET /__stage_access/check` | 404 |
| `nginx -t` | Success |

On an actual iOS home-screen installation, test a fresh first launch, entry
credentials, a subsequent launch, expired cookie, and Safari Basic Auth
fallback. Standalone Safari/WKWebView behavior cannot be completely
validated with curl.

The test deployment performed on 2026-11-06 retained its Nginx backup at
`/etc/nginx/sites-available/rangerbook-membership-test.pre-stage-pwa-access-20261106`.
If the new gate fails, restore that file, run `nginx -t`, reload Nginx, and
stop/disable the separate gate service.

No secrets or production endpoints should be included in integration test logs.
