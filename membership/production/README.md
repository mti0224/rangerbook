# Detached production preparation

This directory prepares a review bundle outside the public checkout. It does
not install units, reload Nginx, migrate/read the production database, send mail,
or merge/publish the frontend. The owner is designing another interface; keep
`INTERFACE_PENDING` present and PR #176 draft until that work is accepted.

## Prepared host state

- Candidate: `/home/ubuntu/rangerbook-member-candidate-20261023`.
- `release/`: current private backend plus membership extension; `venv/` uses
  the accepted versions in `requirements.lock`. Never publish this directory.
- `review/`: rendered API/provider/mail/health units and timers, runtime
  references, provider configuration, Nginx candidates/diffs, and private
  preparation metadata. No unit in this directory is installed.
- `bin/`: independent copied official provider and asm-exec. Runtime paths do
  not depend on the temporary staging directory. Provider SHA-256 is checked
  against the previously verified official 3.1.1 binary; wrapper provenance is
  the official agent-toolkit commit documented in the staging runbook.
- Provider uses loopback 2774; staging uses 2773. API keeps existing port 8765.
- `key.env` contains only the independent Fernet key; `provider.env` contains
  only the SSRF token. API needs both; provider receives only its token; mail
  needs only the encryption key and instance role, with no OAuth resolution.
- The root-owned backup is mode 0400 in
  `/home/ubuntu/rangerbook-private/membership-key-backups/candidate-20261023/member-key.env`.
  Generation and decrypt/restore verification happen on-host without displaying
  key material. Backup and live key remain on the same volume: this protects
  against accidental file loss, **not loss of the EC2 volume**. Before production
  data is encrypted, arrange an owner-controlled encrypted off-host copy and
  restore test. No secret is exported to Git, Pages, CI or a report.

## Reproduce on a new candidate (operator only)

First use `membership.prepare` to copy the inspected private source, create a
new venv and freeze/install the accepted dependencies. `prepare` below requires
a fresh review directory and new backup path; it refuses credential overwrite.

```sh
python -m membership.production.prepare \
  --candidate /path/to/new-private-candidate \
  --provider-source /path/to/verified-private-binaries \
  --key-backup /path/to/separate-private-backup/member-key.env
```

Production paths/origins in these templates intentionally match the inspected
Rangerbook service. Review the current unit and Nginx configuration again if
they have changed. Existing legacy environment files are referenced only; their
values are never copied to the repository or printed. Source/dependency and
configuration hashes in `preparation.json` identify the reviewed snapshot.

## Preflight without cutover

Run as an authorized EC2 operator with the candidate venv:

```sh
python /path/to/checkout/tests/member-production-preflight.py \
  --candidate /home/ubuntu/rangerbook-member-candidate-20261023
```

It requires the interface hold and no approval marker. It verifies units without
installing them, proves the API launcher refuses startup, temporarily starts the
independent provider, and invokes asm-exec to validate resolved configuration
without importing the app or touching its DB. Secret values never enter the
report. It then validates the complete Nginx candidate, starts an independent
loopback Nginx/dummy upstream, checks callback access logging and upstream-error
redaction (including a real 502), other access-log request-data redaction,
proxy IP normalization and the existing body limit, and shuts those
processes down. The production PID/config hashes and health must be unchanged.

Only sanitized check results go to stdout. Per-run logs and JSON are private in
`review/preflight-*/`; `preflight-latest.json` is the last successful snapshot.
Health/secret tests are snapshots, not continuous availability guarantees.

## Holds, mail and monitoring

All candidate services require `CUTOVER_APPROVED` and absence of
`INTERFACE_PENDING`; mail also requires `MAIL_APPROVED` and the runtime mail
flag. No approval markers are created by preparation or preflight. These are
operator error guards, not an application authorization boundary. The existing
backend still enforces Session, role, reauthentication and MFA independently.

The mail flag remains 0. Do not consume the shared feedback queue during these
checks, delete events, reset the staging 4/5 budget, or treat the five-message
test approval as production sending approval. Review consumer ownership again
before activation. SES, SNS and SQS metadata checks do not prove a live
bounce/complaint path; actual simulator sending remains unperformed.

`python -m membership.production.health --database /explicit/path/to/database`
opens SQLite with `mode=ro`, reports only aggregate outbox/suppression counts,
and exits nonzero for final delivery failures or unleased pending work overdue
by ten minutes. Missing paths do not create a DB. The health service/timer is
prepared but inactive; it writes journal status, **not external alert
notifications or an enabled CloudWatch alarm**. No recipient-directed alert
subscription is created without authorization.

## Before owner-approved cutover, after the interface change

Rebuild/fingerprint the candidate if code or dependencies changed, rerun
preflight and CI, and recheck the production baseline. Verify exact Google
callback/pilot audience and production Turnstile hostname. Complete off-host key
backup and keep SSM recovery available. Fresh production backup/migration,
super-admin enrollment and production-host smoke tests belong to the eventual
approved maintenance window; a backup made now would not replace that snapshot.
Backend acceptance precedes frontend merge because main triggers Pages.

See [the cutover review](../../docs/member-production-cutover-20261023.md) for
rollback limits and remaining operator/device checks. Never run the legacy
factor-blind backend after real accounts have enabled 2FA.
