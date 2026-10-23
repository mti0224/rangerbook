# Membership V2 deployment gate

This extension is source-only. Pages packaging and the PWA build exclude this directory. It contains no private game API implementation. The existing production `app.py`, `asgi.py`, `security.py` and `game_binding.py` remain on the private server. `prepare.py` builds a **new release directory**, copies an explicit source allowlist and appends the extension import after the legacy routes have been registered. It does not change the running service.

## Release procedure (requires owner authorization)

1. Keep the current release, service configuration and key material in restricted operator storage. Record the approved maintenance ticket and confirm SSM recovery access. Do not run an old authentication release after users enroll in 2FA: it does not enforce the factor.
2. Prepare an isolated release from the currently deployed source:

   ```sh
   python -m membership.prepare /path/to/current-auth /path/to/new-release
   ```

   Compare `source-manifest.json` against the inspected source. The development integration tests used the deployed source snapshot, but unrelated game/traffic collectors were replaced with synthetic fixtures. No production database or accounts were copied.
3. Create a private virtual environment in the release, install the legacy requirements plus `membership/requirements.txt`, and configure environment variables using `config.example`. The Fernet key must be generated on the server, written directly to a restricted environment/credential file, and backed up separately. Do not print it in a terminal transcript. There is no development fallback key. Enabling V2 without a valid key fails startup.
4. Copy a database **backup** into an isolated test location using SQLite's backup API. Use synthetic accounts or an approved restricted copy; do not put it in the web directory, repository or CI artifacts. Set `RANGERBOOK_AUTH_DB` and the private team directory explicitly to isolated locations.
5. Run the explicit migration before starting the new release:

   ```sh
   python -m membership.manage migrate /path/to/isolated.db --backup /path/to/private-backups/pre-v2.db
   ```

   This uses an exclusive new backup filename, mode 0600 and SQLite backup/integrity checks. The migration is additive and repeatable. It checks that password hashes, roles, sessions and game bindings are unchanged. Startup refuses V2 until migration version 2 exists. Retain a tested copy of the encryption key independently from database backups.
6. Run the full integration suite against the current private source, with **no real SES or game calls**:

   ```sh
   PYTHONPATH=/path/to/checkout RANGERBOOK_LEGACY_SOURCE=/path/to/current-auth \
     python -m pytest -q /path/to/checkout/tests/test_membership_v2.py
   ```

   Public CI runs `tests/test_membership_core.py`; it cannot prove compatibility with unpublished server code. The private-source suite must be repeated before each server release.
7. Set `RANGERBOOK_MEMBERS_V2=1` only in the isolated environment. Start on loopback on a separate port. Keep `RANGERBOOK_MAIL_ENABLED=0` until SES, the feedback queue and configuration set are ready. Do not expose an unreviewed stage directly to the internet. Verify existing admin login, mandatory super-admin enrollment, recovery codes and operator recovery on synthetic accounts.
8. Before **authorized** production cutover: stop writes/mail workers briefly, make a fresh verified backup, run the same migration, and configure the new service release. Preserve all existing environment paths and cookie/origin settings. Add `--no-access-log` to Uvicorn. For Nginx, turn off access logging on the exact `/auth/google/callback` location and avoid query strings/body content in all other security logs. Preserve the existing proxy IP normalization, request size and rate limits. Run `nginx -t` before any reload.
9. After the backend passes acceptance, merge/publish the frontend. New frontend registration and member routes require V2. Keep `RANGERBOOK_MEMBER_NAVIGATION=0` during the administrator pilot: APIs still authorize members independently of navigation. Changing this backend setting later exposes the two member links to ordinary users; the admin link remains role-restricted.
10. Keep the migration backup and current encryption key under restricted access; monitor anonymized auth rate events, `member_audit`, outbox failures and SES bounce/complaint events. No email contents, links, passwords, TOTP secrets or OAuth tokens belong in logs. A brief server/operator outage is safer than silently disabling mandatory 2FA.

## Backout and restore

A synthetic database backup/restore and repeated migration were tested. Additive columns/tables preserve the old data layout, but **schema compatibility is not authentication safety**: an old backend can bypass newly enabled 2FA. Prefer reverting the frontend while leaving V2 enforcement running, or disable login/management routes while fixing the new backend. Do not turn off V2 as a routine rollback after enrollment.

If database restore is necessary, stop the API and mail worker, preserve a fresh copy of the failed database, verify the pre-migration backup, and restore it to a new file via SQLite backup, with mode 0600 and the correct owner. Check integrity/foreign keys, restore the matching encryption key and reopen only after operator verification. A pre-cutover restore discards post-cutover writes; obtain explicit approval for that data loss. Retest the super-admin factor policy before opening traffic.

## Audited manual factor recovery

The operator verifies ownership out of band, records a ticket and approves a fresh backup. Execute from restricted server access:

```sh
python -m membership.manage recover-totp /path/to/auth.db \
  --backup /path/to/private-backups/pre-recovery.db --account ACCOUNT --ticket APPROVED-TICKET
```

This preserves password/role, clears the broken factor and recovery hashes, revokes every session and writes an operator audit event. A super administrator must still use the existing password and enroll a new factor before receiving privileges. No public reset-factor endpoint exists. Password recovery never clears 2FA.

## Google setup

1. In Google Cloud Console, select/create the Rangerbook project. Open Google Auth Platform, configure branding, support contact and external audience. For a pilot, keep Testing and add only the operator's Google test accounts. Add `warmycat.com` as the authorized domain and provide the actual site's home/privacy links.
2. Create an OAuth client with application type **Web application**. Authorized redirect URI must be exactly `https://rangerbook-auth.warmycat.com/auth/google/callback`, with no trailing slash. This is a backend code exchange; do not create a public JavaScript secret or use an implicit flow. A separate staging client must have its own exact staging callback.
3. Set the client ID, client secret and callback URI in the server environment. This implementation requests only `openid email`; it does not request offline access or store provider access/refresh tokens. Scope expansion is unnecessary.
4. With a synthetic member, verify normal linking, account switching, invalid/replayed state, nonce, signature/audience validation, duplicate Google identity/Gmail aliases and unlink. An unconfigured provider is disabled. OAuth start requires a complete session and password/factor reauthentication within five minutes; state is single-use and tied to that exact cookie session.

References: [Google web server authorization](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect).

## Turnstile setup

Create a Managed Turnstile widget restricted to the intended frontend hostname. Put the public site key and private verification secret in the backend environment. The public site key is exposed through `/auth/features`; the secret is never sent to the client. Server verification checks success, hostname and action `register`, with timeout and fail-closed handling. Tokens are single-use through Cloudflare Siteverify. Run a real browser acceptance test before enabling registration. Registration remains on the existing hidden admin/login entry; it does not add a public main navigation link.

Reference: [Cloudflare server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## SES, feedback and IAM preparation

The Mumbai SES identity is verified and production sending is enabled, with account suppression for BOUNCE and COMPLAINT. On 2026-10-23 the dedicated Configuration Set and SNS/SQS feedback path were created. The owner-approved `RangerbookMembershipRuntimeV2` inline policy was added to `EC2-SSM-Role`, read back exactly and verified with 10/10 effective-principal simulations; SSM permissions remain intact. See [AWS permission review](aws/README.md). Four owner-approved test messages were sent during isolated acceptance. Current evidence is recorded in [the acceptance report](../docs/member-acceptance-20261023.md).

Before enabling mail, an authorized operator must create a dedicated Configuration Set, a feedback SNS topic and SQS queue, and enable delivery/failure/bounce/complaint event destinations. Restrict the SQS queue policy to that exact SNS topic and account; do not expose a public webhook. Use SSE-SQS unless a separately reviewed KMS requirement exists. Set the queue URL, topic ARN and configuration set in the private environment. The worker validates the expected topic envelope, records suppressions and deletes processed queue messages. SES account-level suppression remains the additional sending safeguard.

Run one bounded batch periodically using `python -m membership.mail_worker` in the release virtual environment, under the same restricted database/key environment. A systemd oneshot/timer should run every minute with `User` set to the auth service user, `UMask=0077`, `NoNewPrivileges=true`, `PrivateTmp=true` and a write allowlist for the private auth database only. Do not run the worker as root. It leases messages for overlapping invocation protection, retries failures with backoff up to five attempts and drops expired links. Crash-after-send may duplicate an email because SES has no send idempotency token; the link remains single use. Alert on failed outbox messages and missing feedback delivery. Verify a bounce/complaint using the SES mailbox simulator only after authorized mail testing is enabled.

IAM Policy Autopilot was executed against the real worker code. Reproduce the baseline with:

```sh
uvx iam-policy-autopilot@latest generate-policies \
  /absolute/path/to/checkout/membership/mail_worker.py \
  --region ap-south-1 --account YOUR_VERIFIED_ACCOUNT_ID --service-hints sesv2 sqs --pretty
```

The generated baseline contains wildcard identities/configuration sets/queues and a potential KMS permission. **It was not attached and is not an approved least-privilege policy.** Before approval, scope the generator result to the dedicated SES identity/configuration set and feedback queue, constrain the sender to `noreply@warmycat.com`, and remove permissions for unused encryption/template paths after validation. The runtime needs SES sending and feedback queue receive/delete, with no IAM administration or long-term access keys. Verify with policy simulation and a controlled staged send. A separate authenticated EC2 role/profile is preferred if other applications share the instance role.

The existing root-domain SPF and Gandi MX were inspected and left unchanged. Root SPF covers Gandi; there was no DMARC TXT answer at inspection. SES DKIM is verified. Plan a DMARC monitoring record first, using an operator-controlled reporting address, and inspect alignment before enforcement. If a custom SES MAIL FROM is desired, use a dedicated subdomain and publish its SES MX/SPF there. Do not replace Gandi's root MX or publish a second root SPF record. Test both existing inbound Gandi mail and SES outbound authentication before DNS approval.

## Release blockers

- Google linking and consent passed on the protected staging hostname. Verify the exact production callback and approved pilot audience before cutover.
- Real Turnstile registration passed in staging; production-host browser acceptance remains part of cutover.
- Production worker activation after controlled feedback/suppression acceptance. The bounded staging timer delivered four approved messages; the production worker remains inactive. IAM, Configuration Set and SNS/SQS are provisioned.
- Controlled SES/suppression feedback acceptance and Gandi mail regression.
- Real game-account and private-team end-to-end acceptance. The complete prepared private ASGI release has passed synthetic loopback TLS login/migration/restore tests on Mumbai; game calls remain blocked in that rehearsal.
- Existing production super administrator's supervised enrollment and operator recovery readiness. Synthetic super-admin enrollment, TOTP login and recovery-code single use passed staging acceptance; production accounts remain untouched.
- Owner approval for production backup/migration, backend release, frontend merge and deployment.

None of these are implied by public CI passing. The PR remains draft until they are resolved.
