# Rangerbook PWA implementation and release notes

## Scope and audited base

Audited `main` at `1638419e272b191f7e8635532f203999ba5d9046` (2026-10-19). Development branch: `feat/pwa-install-offline`. This change is a static, optional enhancement to the existing HTML/CSS/JavaScript site. It does not change AWS, databases, APIs, Discord Bot, V1/V2 publishers, game schemas, calculations or authorization rules. No production merge or deployment has been performed. PR: https://github.com/mti0224/rangerbook/pull/165.

The repository has 43 existing HTML entry points, a shared `site.js`, `i18n.js` and V2 compatibility adapter. GitHub Actions uploads the repository to Pages on pushes to `main`. `CNAME` selects `rangerbook.warmycat.com`; existing `/rangerbook/` path detection is also retained. The old V2 manifest's source fingerprint is not a complete identity for every translated/output file, so it is not used as the offline consistency boundary.

## Files and behavior

| File(s) | Purpose |
| --- | --- |
| `manifest.webmanifest` | LINE Rangers Database / Rangerbook, standalone display, relative root scope/start URL, theme colors and any/maskable icons. |
| `assets/pwa/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `maskable-512.png` | Exact original `assets/main_icon/icon.png`, scaled onto a square background. Maskable content has extra safe space; no redrawing. |
| All existing HTML entries | One shared PWA head entry plus `viewport-fit=cover`. |
| `404.html` | Root-aware PWA head; preserves gear/stage routing and adds the canonical Ranger redirect already defined by `ranger.js` for uncontrolled first visits. |
| `assets/js/pwa-head.js` | Manifest, touch icon, Apple metadata, theme color, optional UI and integrity guard for every entry, including deep links. |
| `assets/js/pwa-data.js` | Page-level release pinning and SHA-256 checks, including the first visit before SW control; no eager dataset downloads. |
| `assets/js/pwa.js` | Optional registration, foreground/start checks, consent-based updates, connection messages, native Android prompt and iOS instructions in settings. Top-level UI only; personal-team iframe shares it. |
| `assets/css/pwa.css` | Existing theme variables, unobtrusive status area and standalone safe areas; existing modal/dvh behavior retained. |
| `assets/locales/pwa.json`, `assets/js/i18n.js` | Additional four-language catalog loaded by the existing i18n system and existing language preference. |
| `assets/js/v2-data.js` | Lazy initialization of the large official catalog; existing transforms and calculations unchanged. UI catalog remains independent. |
| `settings/index.html` | Small install section; native button only after an actual `beforeinstallprompt`; iOS help only in supported browser context; installed mode hides install actions. |
| `assets/pwa/service-worker.js` | Human-maintained worker source. |
| `scripts/build-pwa.mjs`, `sw.js`, `pwa-data.json` | Dependency-free Pages packaging and generated runtime release files. |
| `assets/pwa/disabled-worker.js` | Consent/normal-lifecycle rollback worker, never used during ordinary operation. |
| `.github/workflows/deploy-pages.yml` | Regenerates release metadata and worker from the exact checkout before Pages upload. Does not run a deployment from this PR branch. |
| `.github/workflows/validate-pwa.yml` | Contract, worker, real-browser and existing UI/model regression checks. |
| `tests/pwa-contract.cjs`, `pwa-worker.cjs`, `pwa-browser.cjs` | Manifest/icons, release integrity, lifecycle, version upgrades, offline, privacy, route and storage tests. |
| `tests/team-analysis-browser.cjs` | Fixture metadata now hashes synthetic datasets, keeping the real integrity guard enabled. |
| `tests/v2-pvp-guild-browser.cjs` | Disables SW for its API-routing fixture only; Playwright routing does not intercept SW-owned network. Real SW privacy/network tests are separate. |
| `.github/workflows/audit-game-tech-visuals.yml`, `validate-thai-review.yml` | Rebuild integrity metadata after those CI jobs substitute their authored translation fixture. |
| `tests/home-popular-ui.cjs`, `thai-review-ui.cjs`, `v2-oct13-interface.cjs`, `visitor-region-ui.cjs` | Keep their mocked API routing isolated from SW-owned network; integrity checks remain enabled. |
| `tests/test_ui_locale_coverage.py` | Checks the same authored overlays/PWA catalog as the runtime, including scheduled publisher snapshots. |

## Cache and consistency policy

`node scripts/build-pwa.mjs` hashes the exact bytes of all `res/v2/**/*.json`, including official/custom/UI translations, and emits a data version plus per-file hashes. Application files and worker policy have a separate application hash. No producer or generated game file is modified. Every main deployment rebuilds these artifacts, so scheduled data publications do not leave stale release metadata in the deployed site. Checked-in generated files also allow local static serving after a build.

| Resource | Strategy |
| --- | --- |
| Public HTML, local JS/CSS, authored UI catalogs and selected small site/PWA icons | Network first, bypass HTTP cache, verify against the running release; fall back only to a verified matching snapshot. On-demand, except the small offline/bootstrap and 404 router shell. |
| `res/v2/**/*.json` | On-demand, network first, SHA-256 verification, fallback to the running data release only. No cross-release lookup and no partial translation substitution. |
| Newer incompatible bytes on server | Keep a verified current snapshot if present; otherwise return 503/connection explanation and check for a waiting update. Never return mixed releases. |
| Login/session/personal/admin/PvP/guild/live/payment APIs, credentials or token-bearing requests | Network only, `cache: no-store`. Never stored in Cache Storage. Private navigation failure can display the public offline page, without retaining a private response. |
| External public images, animations, fonts, scripts and existing image fallbacks | No Cache Storage and no predownload; preserve ordinary browser HTTP-cache and original fallback behavior. |
| Other resources | Not added to Cache Storage. |

All navigations use static public shell bytes; query-string private responses are never treated as public shells. Authorization headers, non-GET requests and sensitive query names always bypass persistent caches. `admin/` and `sponsor/` HTML are excluded too.

The application cache namespace includes both version identifiers because `pwa-data.json` belongs to that release. Data cache identity is independent of application identity, allowing reuse when only program code changes. Approximate declared-byte budgets: 8 MiB application + 32 MiB game data per active release, with a maximum 8 MiB per cached file. Writes/eviction are serialized; oldest non-bootstrap entries are evicted first. The bootstrap is protected. Data quota failures drop the optional data cache, preserving the offline shell and successful network responses. Failed installs remove their partial shell cache. Activation removes obsolete Rangerbook caches for this scope; a waiting release can temporarily coexist with the active release. The browser/OS can still evict storage, and offline availability is never guaranteed forever.

There is no first-install full database download. Opening settings/home no longer initiates `official.json`, `rangers.json` or `projectiles.json`. Entering a game-data feature still needs the existing monolithic official catalog and that feature's necessary datasets. Splitting the game's published JSON is outside this task.

## Updates and routes

Registration uses `updateViaCache: none`; updates are checked on launch, pageshow, return to foreground and reconnection. A new worker installs only its verified bootstrap. There is no routine `skipWaiting()` or `clients.claim()`. The active screen is not automatically reloaded. A waiting release activates after the user clicks Update and reload, or after all older windows close under the browser's normal lifecycle. Explicit activation refuses while another top-level Rangerbook window is open; nested personal-team frames are part of their parent. The controller listener is installed before sending the activation message to avoid a fast-activation race. The consenting window reloads once.

Known Pages stage/gear detail URLs reuse the original 404 router shell rather than a generic missing-page result. Ranger pretty URLs redirect to the same canonical query URL as the existing Ranger page. Root and `/rangerbook/` installations are tested. Unknown online routes retain the real 404 response; unknown/unsaved offline navigations get the localized reconnection page. Reconnection and update do not reset language/theme storage or require reinstalling.

## Installation

- Android: use the supported browser's Install/Add to Home screen command, or Settings → Install Rangerbook when the browser provides a native install event. Dismissal never produces a fake installed state.
- iPhone/iPad: open in Safari → Share → Add to Home Screen. If Open as Web App is available, enable it, then Add. Other browser support depends on the OS/browser version; instructions point to Safari as the reliable route.
- Installed standalone mode hides installation actions. Settings is the only install entry; no repeated or blocking installation popups are scheduled.

Apple reference: https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios
Service worker lifecycle reference: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers

## Validation

Executed locally with real headless Chromium 141 via Playwright, plus Node/Python tests:

- Existing `node --test tests/*.test.js`: 108 passed.
- Existing V2 adapter: four locales, all 18 view contracts passed.
- Existing team-analysis and overview models: passed; personal viewer layout contracts: 7 passed.
- Existing localization contract and Python UI/detail/review suites: passed (2 + 3 + 3 tests).
- New PWA contracts and worker tests: passed, including first-visit hash mismatch, corruption, offline/recovery, private exclusions, 32 MiB eviction, quota errors, failed installs, cleanup and nested/multiple windows.
- Real SW browser tests: root and `/rangerbook/`, install/activation, cold settings without the large database, public navigation, cached/uncached data, Pages stage routes, reconnection, private API exclusion, user-driven app upgrade and independent data-only upgrade, old/new data consistency and preferences.
- Offline browser screens: four languages × two themes passed.
- iOS UA and installed flag simulations: install/help visibility passed. These are simulations, not physical device verification.
- Existing settings UI: desktop/mobile and language/theme changes passed.
- Existing sidebar tests: 390/760/900/1120/1180 widths × two themes, plus navigation at 360/760/1120/1440 in four languages passed.
- Existing team-analysis browser: four languages passed, including seven team selections, modal/details, radar and equipment bars; touch selection/contrast at 320/390 widths in both themes passed.
- Existing Ranger/equipment interactions: four languages passed (localized search, Ranger level and equipment upgrades).
- Existing Ranger comparison search: all 2,306 indexed Rangers and four locales passed.
- Existing public PvP/guild-war browser fixtures: four languages passed (usage, equipment, player teams, guild identity and permission gates).
- Regional defaults/cookie fallback, homepage popular cards (four languages/two themes), Thai review and October 13 interface fixtures passed after CI preview metadata was regenerated.
- GitHub Actions initial PWA workflow run 39243280080 passed, as did localization, Ranger, comparison, Game-Tech and PvP/guild checks. Follow-up changes fix isolated mocked-network/catalog-preview CI integration. The separate visual audit still has the documented pre-existing admin-tab expectation to resolve outside this scope.

Reproduce after checkout:

```sh
node scripts/build-pwa.mjs
node tests/pwa-contract.cjs
node tests/pwa-worker.cjs
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install --with-deps chromium
node tests/pwa-browser.cjs
```

No real iPhone/iPad/Android hardware or actual installed app shell was available. Physical home-screen installation, mask shape, notch/home-indicator insets, virtual keyboard, gesture/history behavior, cross-browser external-link handling and OS storage eviction must be checked on devices before declaring full cross-platform acceptance. Actual native Android prompt acceptance was not performed; event-to-native-prompt dispatch was exercised. No real user credentials, live personal teams or production administrator mutations were used. Public API tests use fixtures; private Cache Storage exclusion is verified at worker and browser levels.

## Existing issues recorded without unrelated application changes

- `404.html` already contains a malformed sidebar stylesheet href with a literal `'+ root +'` fragment. It is unchanged; PWA metadata uses its own correct root-aware head entry.
- `tests/admin-workspace-ui.cjs` expects `password` as the initial admin tab, but current main intentionally opens `personal`. Guest/user checks pass; the admin expectation fails before its remaining assertions. No admin behavior or stale expectation was changed in this PWA work.

## Deployment gate

This branch/PR is review-only until the owner explicitly approves merging and publishing. Merging into main automatically triggers the existing Pages deployment, so approval must cover both. Before release: review PR checks, update the branch from current main if needed (scheduled data publishers can advance it), rebuild from that checkout, and complete the device checklist above. After approval, merge through GitHub and watch Deploy GitHub Pages complete. Verify `/manifest.webmanifest`, `/sw.js`, `/pwa-data.json`, `/offline.html`, settings/install availability, direct stage/Ranger/gear URLs, one offline/reconnect cycle and an update using an already-open client. AWS requires no operation.

## Rollback

For an ordinary bad program release, revert the offending program change while keeping the PWA builder, regenerate, and deploy through the same reviewed main workflow. Returning to older application bytes creates a different worker from the currently installed release; the same consent/normal-close update lifecycle applies.

To remove the PWA feature completely, **do not just delete `sw.js`**: installed workers could otherwise retain old shells. Prepare a separate approved rollback PR that reverts this feature's page/runtime changes but retains `scripts/build-pwa.mjs`, `assets/pwa/disabled-worker.js` and the build step in `.github/workflows/deploy-pages.yml`. Add an empty `.pwa-disabled` marker and run the builder; it then emits the rollback worker at the original `/sw.js`. Keep that endpoint and marker deployed while old clients migrate. The rollback worker waits for the normal lifecycle or the existing consent message, clears only Rangerbook caches for its scope and unregisters itself without forcing navigation or clearing language/theme/login storage. Do not redeploy an old Pages artifact that omits this endpoint. The online website then runs normally, and old installed launch icons can still open it. Removing those OS icons is the device user's choice.
