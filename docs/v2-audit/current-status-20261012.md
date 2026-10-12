# V2 website migration: verified progress and remaining gates

The complete backend is deployed and its unchanged timer has successfully updated/published from the official API. The existing 42 pages use the V2 adapter, with Japanese/Thai settings. Core launch acceptance passes; the final merge and Pages deployment are tracked in PR #132.

- Deployment source: `ca50d6048997a35a1f70d3c30ed4fcec52e37bc7`; all 23 corrected source/schema files match `deploy/aws/v2/deployment-plan.json`. The complete patch is included in the PR.
- Backup: `/home/ubuntu/rangerbook-v2/backups/v2-launch-20261012-215805/original.tar.gz`, 16,861,452 bytes. The first package omitted schema and rolled back successfully; the corrected package fetched official data, compiled, validated and published. Production generation passed 29 semantic/compiler and 18 snapshot tests; the separate release/publisher suite passed 9 tests. The 24 output files validated with zero binding errors.
- V1 independence: all 56 recorded V1 file hashes remain unchanged. V1's 22:02 update and V2's 22:04:22 update exited 0. V2's scheduled publish commit is `7b7c0b52b733dcd3d351cc261c50a14c550cd379`; both original timers are active with separate locks/publication paths.
- Disk: only the old task-created temporary browser/test directory was removed. Approximately 3.64 GiB remains free after deployment and scheduled update. No production browser installation, large clone or test-data download was added.

- Authored catalogs: custom 470 and UI 848 keys; all four language fields filled. Collaboration workbook: 46 sheets, 5,105 page-specific rows, 1,318 unique authored keys; official packages excluded. Reviewer/status columns remain unreviewed for volunteer corrections.
- Official source gaps: 739 referenced absent keys and 8 additional all-language empty API rows. These are accepted source gaps under the user's policy and remain visible in the audit.
- Recorded dates: one-time approved historical seed, then the Asia/Taipei date of first successful V2 recording; existing dates persist. Failed validation/date-file writes restore the previous release and preserve date metadata.
- Isolated official build: 29 compiler/semantic tests and 18 snapshot tests pass; 24 JSON files validate. Four-language adapter contracts pass for all 18 legacy game views. Failure/rollback/publisher matrix: 14 isolated tests passed before the bounded-fetch change.
- Latest local unit checks: 38 tests passed, including bounded shallow fetch, rejected pushes, review-only publication, concurrent V1 Git updates, release/date rollback and compiler regressions. Projectile regression suite: 77 pass.
- Existing browser regressions passed: desktop/mobile four-language settings, sidebar access by role, 10 theme/viewport drawer scenarios, admin workspace role boundaries and 8 role/theme/viewport traffic-chart scenarios. Authentication was mocked; no real admin login was performed.

Four-language equipment search, Ranger level adjustment and equipment upgrade pass. Localized searches normalize whitespace and literal newlines; valid V2 equipment remains available when CDN icons fail. Official names containing newlines exposed a document-title observer loop; the title comparison now normalizes whitespace. Updated scripts have versioned URLs to avoid old-client caches. Browser tests run in Work Mode with deterministic image fixtures and real canonical game JSON/page scripts.

Final core checks: 72 page-language bootstrap/navigation cases pass with zero V1 game network requests or page script errors; 4 role-boundary cases pass; all 8 admin/super-admin × theme × viewport traffic-chart scenarios pass. Settings passes four-language persistence and theme changes at 1400px and 390px. Separate four-language PvP/Guild tests pass usage/equipment details, player teams, identity-based guild member matching across rank changes and guest team-access restrictions. Protected Guild usage pages redirect guests by existing policy and are separately exercised with an admin fixture. Real public statistics endpoints respond 200; synthetic browser statistics fixtures preserve their shapes and use actual V2 entity catalogs. No real account login was performed.

The deployed publisher fetches depth 1 and only refreshes the local remote-tracking ref; remote V1 commits are preserved and remote pushes are never forced. Live read-only checks confirm trusted-origin CORS and unauthenticated 401 responses from protected admin endpoints. Authentication source/deployment is unchanged; browser fixtures verify role boundaries, without real administrator credentials.

Remaining release operations: preserve the latest main V1/V2 generated data in the PR merge, confirm Pages deployment and the live four-language site. Volunteer translation review, exhaustive visual/accessibility review and optional shared raw snapshots are deferred under the user's launch priorities.

## Reproduction commands

```sh
python3 update_all_v2.py
python3 -m unittest scripts.v2.test_release scripts.v2.test_publisher -q
python3 -m scripts.v2.validate --root data/v2
node tests/v2-site-adapter.cjs
node tests/gear-detail-loading.cjs
node --test tests/game-tech-contract.test.js
node tests/i18n-contract.cjs
AUDIT_BASE_URL=http://127.0.0.1:4187 node tests/v2-browser-interactions.cjs
V2_CORE_ONLY=1 AUDIT_BASE_URL=http://127.0.0.1:4187 node tests/v2-browser-acceptance.cjs
AUDIT_BASE_URL=http://127.0.0.1:4187 node tests/v2-pvp-guild-browser.cjs
AUDIT_BASE_URL=http://127.0.0.1:4187 node tests/admin-workspace-ui.cjs
AUDIT_BASE_URL=http://127.0.0.1:4187 node tests/admin-traffic-ui.cjs
AUDIT_BASE_URL=http://127.0.0.1:4187 node tests/settings-ui.cjs
```

Serve the checkout in an isolated local test environment and install Playwright/Chromium there, never on the space-constrained production EC2. The Work Mode fixture driver replaces only image downloads. Core matrix bootstrap and separate interaction tests have different scopes; neither represents an exhaustive visual/manual-translation audit.
