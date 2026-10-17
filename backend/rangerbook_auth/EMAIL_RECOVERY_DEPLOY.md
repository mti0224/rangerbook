# Rangerbook email verification and password recovery (rollout checklist)

## Status

This change is intentionally DISABLED on production until Amazon SES is ready.
No plaintext credentials, reset tokens, .env files, or private SQLite data belong
in GitHub or the Pages deployment artifact.

Changes:
- Existing accounts and administrator sessions are migrated without deletion.
- New registrations send a 30-minute verification link if an email is supplied.
- Email binding for existing users requires an authenticated session and current password.
- Password resets require a verified email and single-use SHA-256-hashed bearer tokens.
- Successful reset invalidates all previous sessions; administrators send links only.
- Fixed default password reset has been removed. Email verification is required before
  granting admin access to newly registered accounts once EMAIL_REQUIRED is enabled.
- Action links use a fixed HTTPS host and browser fragment, stripped before analytics loads.

## AWS prerequisites (Mumbai ap-south-1)

1. Verify the SES domain identity for warmycat.com. Retrieve DKIM CNAME records using
   GetEmailIdentity and add them at the existing DNS provider. Route 53 does not host
   this account's zones.
2. SES production access was requested on 2026-10-17. AWS GetAccount currently returns
   ProductionAccessEnabled=false and ReviewDetails.Status=DENIED. The account remains
   sandboxed; **do not enable public registration email delivery**. The owner must inspect
   the AWS Support Center case and request a secondary review, citing the verified
   identity and transactional-only anti-abuse controls. Do not resubmit PutAccountDetails
   while ReviewDetails.Status is DENIED.
3. Grant the EC2 role minimal SES SendEmail permission scoped to the verified SES
   identity. A permissions simulation currently returns implicitDeny. Use deterministic
   IAM policy tooling and review generated permissions. For source-code IAM analysis:

       uvx iam-policy-autopilot@latest generate-policies \
         /absolute/path/to/rangerbook/backend/rangerbook_auth/account_email.py \
         --account 010421869571 --region ap-south-1 --service-hints ses --pretty

   Never create static AWS access keys for this service.
4. Check bounce/complaint monitoring before enabling sending.

## Deployment order

1. Confirm production EC2 via SSM and current Auth health. Back up private SQLite
   with sqlite3.Connection.backup (not a blind copy of a live WAL database).
2. Install new requirements in existing Auth virtualenv. Deploy updated backend files.
   Keep RANGERBOOK_EMAIL_ENABLED=0 and RANGERBOOK_EMAIL_REQUIRED=0 initially.
3. Restart Auth service; check /health, legacy admin sessions and DB schema migration.
4. Once SES identity, IAM and production access are ready, set private .env:

       RANGERBOOK_EMAIL_ENABLED=1
       RANGERBOOK_EMAIL_REQUIRED=1
       RANGERBOOK_SES_REGION=ap-south-1
       RANGERBOOK_SES_FROM=no-reply@warmycat.com
       RANGERBOOK_EMAIL_ACTION_BASE=https://rangerbook.warmycat.com/admin/

5. Restart Auth and test end-to-end real delivery using dedicated test account.
   Verify registration/confirmation, reset expiry, one-time use, logout, rate limits.
6. Deploy GitHub Pages frontend AFTER new backend works to avoid registration downtime.
7. Monitor Auth and SES delivery/bounce logs. Never log tokens.

## Tests

Use a disposable environment with requirements.txt and httpx installed:

    python tests/test_auth_email_recovery.py -v

Tests use a temporary SQLite DB and mocked SES sender.

## Rollback

Revert frontend first. Disable both email feature flags and restart Auth.
Revert backend source if needed and check /health. New nullable SQLite columns and
tables may remain during source rollback; restore the backed-up DB only if needed.
If reverting permanently, remove unneeded SES role permission.

All three DKIM CNAME records resolve to the correct Amazon SES destinations, but
SES identity validation can lag behind public DNS propagation. A live email delivery
cannot be validated for arbitrary recipients before SES identity verification,
production sending approval, and required IAM permission.
