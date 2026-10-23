"""Render a detached review bundle. Never install, reload or migrate anything."""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil

from cryptography.fernet import Fernet

PROVIDER_SHA256 = '471c1978f8bf63a0aeefb425e974ac3c816c7e04feb302236512eea375160de4'
HERE = Path(__file__).parent


def private_write(path, data):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        handle.write(data)


def nginx_candidate(original):
    needle = '    location / {'
    if original.count(needle) != 1 or 'location = /auth/google/callback' in original:
        raise ValueError('Review changed production Nginx structure before rendering')
    if re.search(r'^\s*access_log\s', original, re.MULTILINE):
        raise ValueError('Review existing custom access logs before rendering')
    start = original.index(needle)
    end = original.index('\n    }', start) + len('\n    }')
    proxy = original[start:end]
    if 'proxy_pass http://127.0.0.1:8765;' not in proxy:
        raise ValueError('Unexpected production proxy destination')
    callback = proxy.replace('location / {', 'location = /auth/google/callback {', 1)
    # Nginx upstream error messages can include the full callback query too.
    callback = callback.replace('{\n', '{\n        access_log off;\n        error_log /dev/null crit;\n', 1)
    # No query, URI, body, Referer, cookie or authorization data in the format.
    candidate = original[:start] + callback + '\n\n' + original[start:]
    # Cover both HTTPS and HTTP redirect vhosts: neither may log query strings.
    return re.sub(r'(?m)^server \{', 'server {\n    access_log /var/log/nginx/access.log rangerbook_membership_safe;', candidate)


def prepare(root, provider_source, key_backup, nginx_path, unit_path):
    root, provider_source, key_backup = (path.resolve() for path in (root, provider_source, key_backup))
    if not (root / 'release/source-manifest.json').is_file():
        raise ValueError('Prepare a private release first')
    if not (root / 'requirements.lock').is_file():
        raise ValueError('Freeze and validate candidate dependencies first')
    if key_backup.is_relative_to(root) or key_backup.exists():
        raise ValueError('Key backup must be a new path outside the candidate')
    for path in (root, key_backup):
        in_git = any((ancestor / '.git').exists() for ancestor in (path, *path.parents))
        if in_git or any(part in {'www', 'public_html', '.git'} for part in path.parts):
            raise ValueError('Private preparation cannot use public or Git paths')
    provider = (provider_source / 'aws-workload-credentials-provider').read_bytes()
    if hashlib.sha256(provider).hexdigest() != PROVIDER_SHA256:
        raise ValueError('Official provider checksum mismatch')
    original_nginx = nginx_path.read_text()
    original_unit = unit_path.read_text()
    for preserved in ['EnvironmentFile=/home/ubuntu/rangerbook-auth/.env',
                      'EnvironmentFile=/etc/rangerbook-auth-paths.env',
                      'ReadWritePaths=/home/ubuntu/rangerbook-private']:
        if preserved not in original_unit:
            raise ValueError('Review changed production service before rendering')
    proposed_nginx = nginx_candidate(original_nginx)
    review = root / 'review'
    review.mkdir(mode=0o700)  # Exclusive: never overwrite prepared credentials.
    binaries = root / 'bin'
    binaries.mkdir(mode=0o700)
    for name in ['aws-workload-credentials-provider', 'asm-exec']:
        shutil.copyfile(provider_source / name, binaries / name)
        (binaries / name).chmod(0o700)
    key = Fernet.generate_key()
    private_write(review / 'key.env', 'RANGERBOOK_MEMBER_KEY=' + key.decode() + '\n')
    private_write(review / 'provider.env', 'AWS_TOKEN=' + secrets.token_urlsafe(48) + '\n')
    key_backup.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if key_backup.parent.stat().st_mode & 0o077:
        raise ValueError('Key backup directory must be private')
    private_write(key_backup, 'RANGERBOOK_MEMBER_KEY=' + key.decode() + '\n')
    restored = key_backup.read_text().strip().split('=', 1)[1].encode()
    probe = secrets.token_bytes(32)
    if Fernet(restored).decrypt(Fernet(key).encrypt(probe)) != probe:
        raise RuntimeError('Key backup restore validation failed')
    for source in HERE.glob('*.in'):
        private_write(review / source.name.removesuffix('.in'), source.read_text().replace('@ROOT@', str(root)))
    private_write(review / 'secrets.toml', (HERE / 'secrets.toml').read_text())
    private_write(review / 'INTERFACE_PENDING', 'Owner is designing the interface; do not merge or cut over.\n')
    private_write(review / 'nginx-auth.conf', proposed_nginx)
    private_write(review / 'nginx-http.conf', "log_format rangerbook_membership_safe '$remote_addr [$time_iso8601] $request_method $status $body_bytes_sent $request_time';\n")
    for label, original, proposed in [
        ('nginx', original_nginx, proposed_nginx),
        ('systemd', original_unit, (review / 'rangerbook-auth.service').read_text()),
    ]:
        private_write(review / (label + '.diff'), ''.join(difflib.unified_diff(original.splitlines(True), proposed.splitlines(True), fromfile='current-' + label, tofile='candidate-' + label)))
    private_write(review / 'preparation.json', json.dumps({
        'interface_pending': True, 'cutover_approved': False, 'mail_approved': False,
        'key_backup': str(key_backup), 'key_restore_verified': True,
        'backup_storage': 'separate restricted directory on the same EC2 volume; not off-host recovery',
        'source_manifest': json.loads((root / 'release/source-manifest.json').read_text()),
        'membership_sha256': {str(path.relative_to(root / 'release')): hashlib.sha256(path.read_bytes()).hexdigest()
                              for path in (root / 'release/membership').rglob('*')
                              if path.is_file() and path.suffix in {'.py', '.in', '.toml'}},
        'requirements_lock_sha256': hashlib.sha256((root / 'requirements.lock').read_bytes()).hexdigest(),
        'production_baselines': {str(nginx_path): hashlib.sha256(original_nginx.encode()).hexdigest(),
                                 str(unit_path): hashlib.sha256(original_unit.encode()).hexdigest()},
        'binary_sha256': {name: hashlib.sha256((binaries / name).read_bytes()).hexdigest()
                          for name in ['aws-workload-credentials-provider', 'asm-exec']},
    }, indent=2) + '\n')
    return {'review_bundle_prepared': True, 'key_restore_verified': True,
            'interface_pending': True, 'cutover_approved': False, 'mail_enabled': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--provider-source', type=Path, required=True)
    parser.add_argument('--key-backup', type=Path, required=True)
    parser.add_argument('--nginx', type=Path, default=Path('/etc/nginx/sites-available/rangerbook-auth'))
    parser.add_argument('--unit', type=Path, default=Path('/etc/systemd/system/rangerbook-auth.service'))
    args = parser.parse_args()
    print(json.dumps(prepare(args.candidate, args.provider_source, args.key_backup, args.nginx, args.unit)))


if __name__ == '__main__':
    main()
