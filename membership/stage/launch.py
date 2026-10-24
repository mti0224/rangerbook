"""Fail-closed entry point for the isolated operator acceptance service."""
import os
from pathlib import Path
import sys

ROOT = Path('/home/ubuntu/rangerbook-member-stage-20261023/acceptance')
ORIGIN = 'https://rangerbook-test.warmycat.com'


def validate(env):
    required = {
        'RANGERBOOK_STAGE': '1', 'RANGERBOOK_MEMBERS_V2': '1',
        'RANGERBOOK_SESSION_COOKIE': '__Host-rangerbook_stage_session',
        'RANGERBOOK_ALLOWED_ORIGINS': ORIGIN, 'RANGERBOOK_FRONTEND_URL': ORIGIN,
        'RANGERBOOK_GOOGLE_REDIRECT_URI': ORIGIN + '/auth/google/callback',
    }
    if any(env.get(key) != value for key, value in required.items()):
        raise RuntimeError('Incorrect isolated origin, cookie or feature configuration')
    for key in ['RANGERBOOK_AUTH_DB', 'RANGERBOOK_PRIVATE_TEAM_DIR', 'RANGERBOOK_PLAYER_INDEX',
                'RANGERBOOK_PLAYER_QUERY_CACHE', 'RANGERBOOK_GUILDWAR_CORE',
                'RANGERBOOK_TRAFFIC_CACHE_DIR', 'RANGERBOOK_RESOURCE_UPDATES_INDEX']:
        path = Path(env.get(key, '')).resolve()
        if not path.is_relative_to(ROOT) or path == ROOT:
            raise RuntimeError('Acceptance paths must stay inside the isolated directory')
    for key in ['RANGERBOOK_MEMBER_KEY', 'RANGERBOOK_GOOGLE_CLIENT_ID',
                'RANGERBOOK_GOOGLE_CLIENT_SECRET', 'RANGERBOOK_TURNSTILE_SITE_KEY',
                'RANGERBOOK_TURNSTILE_SECRET']:
        if not env.get(key) or '{{resolve:' in env[key]:
            raise RuntimeError('Acceptance credentials are missing or unresolved')
    if env.get('RANGERBOOK_MAIL_ENABLED') != '0':
        if env.get('RANGERBOOK_MAIL_ENABLED') != '1' or not env.get('RANGERBOOK_MAIL_RECIPIENT_ALLOWLIST', '').strip():
            raise RuntimeError('Acceptance mail requires an explicit recipient allowlist')


def main():
    validate(os.environ)
    os.execv(sys.executable, [sys.executable, '-m', 'uvicorn', 'membership.stage.http_transport:create_app', '--factory',
        '--host', '127.0.0.1', '--port', '18765', '--no-access-log',
        '--proxy-headers', '--forwarded-allow-ips', '127.0.0.1',
        '--timeout-graceful-shutdown', '5'])


if __name__ == '__main__':
    main()
