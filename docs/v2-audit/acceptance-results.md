# V2 correction and isolation results — 2026-10-12

This document records the final correction snapshot; the original baseline remains in `2026-10-12-audit.md`.

The first audit identified 5,386 missing Ranger child effects and 917 missing enemy child effects. They are now expanded from the independent official skill index in source order. Official sub-skill references are checked before output is accepted.

## Corrections

- Restored all 6,303 child effect occurrences; preserved skill icons.
- Fixed three backspace-corrupted ability references; reused official Berserk naming and its verified +100% attack-speed rule.
- Preserved major talent secondary conditions and enemy speed/awakening/talent metadata.
- Corrected Spec+ effect aliases, condition percentage scaling/ranges and native slot bindings ($3 effect, $4 duration).
- Bound 55 artifact percentage descriptions and active gimmicks to their actual official child references.
- Corrected Skill+ ADD upgrade increments to use the official upgrade table.
- Added independent candidate output, recoverable promotion, shared V2 locks, schema/record identity checks and safe Git retries.
- Completed authored custom 470 and UI 737 keys in Traditional Chinese, English, Thai and Japanese. Official source text is kept separate and is not invented.
- Expanded the standalone preview to all 19 datasets and four languages; fixed numbered/repeated placeholders, missing arguments, nested fallbacks and native markup.

## Actual verification

| Check | Result |
|---|---|
| Fresh official API fetch/decode in isolated V2 | 29 downloads, 29 conversions, 0 failures |
| Candidate generation tests | 27 regression tests + 18 official-snapshot tests pass |
| All public JSON schema/allowlist | 24 JSON files pass; nested magnitude/duration contracts checked |
| Missing display Key / template binding errors | 0 |
| Failure injection, rollback and process locks | malformed unit, malformed ability number, missing child, bad locale and API failure preserve previous release |
| Bare-Git publisher | refused push preserves remote; retry succeeds; concurrent V1 commit retained; review branch leaves main unchanged |
| V1/V2 concurrent copied generation | both exit 0; 19.02 seconds; production paths denied |
| Production V1 source | unchanged during parallel test |
| Production V2 source | 46 original source hashes unchanged |
| Production timers | both active/waiting; latest services exit 0 |
| Public UI/auditor tests | 5 auditor + 2 UI coverage tests pass |
| Preview | all 19 datasets, four languages, numbered/native bindings and explicit fallback pass |

## Official gaps remain visible

The current API provides no rows for 739 referenced keys: UNIT 403, SKILL 295, ABILITY 34, EQUIP 7. Three malformed generated references were recovered; adding enemy talent metadata exposed one more legitimate missing description. Eight additional official rows are empty in every language. Those eight are not just missing English.

`allPublicDisplayKeysArePresent=true` means every reference is represented. `allReferencedTranslationsComplete=false` is the actual translation coverage state. Empty official rows are retained, classified and shown as missing. Custom/UI gaps are zero. Three newline-containing keys originate in the official language source and are preserved.

## Scope and remaining gates

These changes are prepared on `audit/v2-semantics-20261012` / PR #132. Production updater source, timers and the existing V1 website have not been replaced. The independent compiler corrections and their source hashes are retained in the complete private correction package.

The formal site migration plan is in `rollout-and-acceptance.md`. Real browser/mobile/admin API acceptance must precede any production page switching. Official release dates remain unknown when no official source field supplies them. This work does not claim the full production website has migrated to V2.

## Reproduction commands

In the independent compiler test copy, after applying the complete patch and providing the V2-owned raw and authored language inputs:

```sh
python3 update_all_v2.py --skip-fetch
python3 -m unittest scripts.v2.test_semantic scripts.v2_preview.test_normalize scripts.v2.test_semantic_audit -q
python3 -m unittest scripts.v2.test_standalone -q
python3 -m scripts.v2.validate --root data/v2
python3 -m unittest scripts.v2.test_release scripts.v2.test_publisher -v
python3 -m unittest scripts.v2.test_failure_isolation -v
```

The publisher tests require an existing validated `data/v2` fixture. Failure injection requires the isolated marker described in the deployment README. The copied V1/V2 concurrency test uses an open/list guard against production source and output directories.

In this website checkout:

```sh
python3 -m unittest discover -s tests -p 'test_v2_audit.py' -v
python3 -m unittest discover -s tests -p 'test_ui_locale_coverage.py' -v
node --check v2/preview.js
node v2/test-preview.cjs
python3 scripts/audit_v2_data.py --output /tmp/v2-findings.json
```

The audit CLI returns structured findings. Running `--strict` still returns nonzero for the official gaps and three source control-character keys; this is expected and must not be described as complete translation coverage. The corrective schema/publisher validation separately rejects structural or binding failures while reporting the known official gaps.

The zero-context deployment patch was dry-run and then applied to a copy of the original V2 source. All 22 resulting file hashes match the verified correction sources. Local release/publisher tests (6) and full JSON validation passed with the validated snapshot as the fixture.
