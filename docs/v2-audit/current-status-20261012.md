# V2 website migration: verified progress and remaining gates

The review branch integrates the existing 42 pages with the independent V2 data adapter and adds Japanese/Thai settings. It is still draft and is not merged or deployed to main.

- Authored catalogs: custom 470 and UI 848 keys; all four language fields filled. Collaboration workbook: 46 sheets, 5,105 page-specific rows, 1,318 unique authored keys; official packages excluded. Reviewer/status columns remain unreviewed for volunteer corrections.
- Official source gaps: 739 referenced absent keys and 8 additional all-language empty API rows. These are accepted source gaps under the user's policy and remain visible in the audit.
- Recorded dates: one-time approved historical seed, then the Asia/Taipei date of first successful V2 recording; existing dates persist. Failed validation/date-file writes restore the previous release and preserve date metadata.
- Isolated official build: 29 compiler/semantic tests and 18 snapshot tests pass; 24 JSON files validate. Four-language adapter contracts pass for all 18 legacy game views. Failure/rollback/publisher matrix: 14 isolated tests passed before the bounded-fetch change.
- Latest local unit checks: 38 tests passed, including bounded shallow fetch, rejected pushes, review-only publication, concurrent V1 Git updates, release/date rollback and compiler regressions. Projectile regression suite: 77 pass.
- Existing browser regressions passed: desktop/mobile four-language settings, sidebar access by role, 10 theme/viewport drawer scenarios, admin workspace role boundaries and 8 role/theme/viewport traffic-chart scenarios. Authentication was mocked; no real admin login was performed.

Full browser acceptance has not passed. The first run found generic semantic templates matching ordinary text and repeated PvP label rewriting in Thai/Japanese. Fixes now use numeric, contextual DOM matching plus explicit Key/args bindings for generic semantics, stable record/stat IDs and four-language PvP catalog keys. Their final browser rerun remains required. Equipment-name search/upgrade interaction is also unresolved in the latest test and must be diagnosed before deployment.

A temporary review publisher clone fetched excessive Git history and exhausted EC2 disk space. AWS Run Command subsequently failed before executing even cleanup commands. The isolated review-data publication nevertheless completed in commit e6fd3b2577686d72f050ca0cc7b814150a062ce4. The pending publisher patch limits fetches to depth 1 and refreshes only the local remote-tracking ref, preserving remote V1 commits; its local Git tests pass. Production source/timer changes have not been applied. Their health must be rechecked after storage recovery.

Next: recover temporary-clone storage, repeat failed browser gates, resolve main's generated-resource conflicts, activate the backed-up and verified V2 backend, rerun timers/publication, then merge and confirm GitHub Pages plus the live four-language site. Optional shared raw snapshot acquisition remains deferred until these gates pass.
