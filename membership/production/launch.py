"""Explicit cutover hold and production configuration validation; no DB reads."""
import argparse
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

from cryptography.fernet import Fernet

ENDPOINT = 'http://127.0.0.1:2774'
REQUIRED = {
    'RANGERBOOK_STAGE': '0', 'RANGERBOOK_MEMBERS_V2': '1',
    'RANGERBOOK_AUTH_DB': '/home/ubuntu/rangerbook-private/auth/rangerbook_auth.db',
    'RANGERBOOK_PRIVATE_TEAM_DIR': '/home/ubuntu/rangerbook-private/teams',
    'RANGERBOOK_SESSION_COOKIE': '__Host-rangerbook_session',
    'RANGERBOOK_ALLOWED_ORIGINS': 'https://rangerbook.warmycat.com',
    'RANGERBOOK_FRONTEND_URL': 'https://rangerbook.warmycat.com',
    'RANGERBOOK_GOOGLE_REDIRECT_URI': 'https://rangerbook-auth.warmycat.com/auth/google/callback',
    'AWS_SECRETS_MANAGER_AGENT_ENDPOINT': ENDPOINT,
}


def validate(env):
    if any(env.get(key) != value for key, value in REQUIRED.items()):
        raise RuntimeError('Production origin, cookie, data path or provider configuration mismatch')
    for key in ['RANGERBOOK_MEMBER_KEY', 'RANGERBOOK_GOOGLE_CLIENT_ID',
                'RANGERBOOK_GOOGLE_CLIENT_SECRET', 'RANGERBOOK_TURNSTILE_SITE_KEY',
                'RANGERBOOK_TURNSTILE_SECRET']:
        if not env.get(key) or '{{resolve:' in env[key]:
            raise RuntimeError('Production credentials missing or unresolved')
    Fernet(env['RANGERBOOK_MEMBER_KEY'].encode())


def require_approval(env):
    approval = Path(env.get('RANGERBOOK_CUTOVER_APPROVAL', '/nonexistent/CUTOVER_APPROVED'))
    if not approval.is_file() or (approval.parent / 'INTERFACE_PENDING').exists():
        raise RuntimeError('Cutover held pending interface completion and explicit owner approval')


def wait_provider(env, attempts=20):
    if env.get('AWS_SECRETS_MANAGER_AGENT_ENDPOINT') != ENDPOINT:
        raise RuntimeError('Independent loopback provider required')
    # Health only: never request a secret value. Do not follow redirects/proxies.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    for attempt in range(attempts):
        try:
            with opener.open(ENDPOINT + '/ping', timeout=1) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, OSError):
            pass
        if attempt + 1 < attempts:
            time.sleep(0.5)
    raise RuntimeError('Independent secret provider unavailable')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--wait-provider', action='store_true')
    parser.add_argument('--check', action='store_true', help='Validate environment only; no DB or app import')
    args = parser.parse_args()
    if args.check:
        validate(os.environ)
        print('Production configuration valid; application not started.')
        return
    require_approval(os.environ)
    if args.wait_provider:
        wait_provider(os.environ)
        return
    validate(os.environ)
    os.execv(sys.executable, [sys.executable, '-m', 'uvicorn', 'asgi:app',
        '--host', '127.0.0.1', '--port', '8765', '--no-access-log',
        '--proxy-headers', '--forwarded-allow-ips', '127.0.0.1'])


if __name__ == '__main__':
    main()
