# V2 integration and acceptance gates

The review branch boots the V2 compatibility adapter on all 42 existing pages. It reads canonical Key-based V2 datasets and keeps immutable legacy property/category contracts inside the adapter so existing filters and calculations continue to work. The independent `/v2/` preview remains available. Main is switched only after browser and backend acceptance.

## Rollout order

| Step | Pages | Data adapter | Required acceptance |
|---|---|---|---|
| 1 | Ranger detail, list, comparison | rangerCode + structured skill/ability/talent | every child effect; level/grade formulas; stat units; aliases; both skills; four languages |
| 2 | Equipment and ability | equipCode/abilityCode; native Spec+ bindings | normal and random ranges; upgrade increments; logical conditions; percentage vs seconds |
| 3 | Hard/Extreme, Endless Tower, Labyrinth, enemies/artifacts | stageId/enemyCode/artifactCode | spawn order, triggers, reinforcement values, boss waves, gimmick timings, artifact percentages |
| 4 | Rankings/statistics, PvP and Guild War | existing account/API routes + V2 display resolver | enum-based filtering, names/icons, distributions, administrative roles, export, hover values |
| 5 | Home/settings/admin/about/support/update/404 | semantic UI keys from the V2 authored catalog | persisted four-language choice, mobile drawer, dark/light mode, accessible labels, error messages, GMT+8 times |

Keep immutable IDs and enums as filters. Translated labels must not become lookup keys or change arithmetic. The V2 adapter returns an explicit error when canonical data fails; it must not silently read a V1-generated file. Restore the predeployment frontend commit and backed-up V2 source/release for rollback. Existing V1 generation and timers are retained.

## Checks already completed

- Raw official tables compared with V1 generator branching and V2 output; 6,303 child effects restored.
- Full catalog row validation; author-created Thai/Japanese translations; numbered/native placeholders and nested references checked.
- 24 output JSON allowlist and schema contracts; each output count matches the manifest.
- Isolated failure injection for malformed unit data, missing child skill, translation failure and API failure; prior release preserved.
- Local bare-Git push rejection, retry and concurrent V1 commit tests.
- Concurrent copied V1/V2 generation with production paths denied; no V1 output/intermediate required by V2.
- Independent official API download/decode of all 29 required DB/NDB resources.
- Existing production UI static coverage and detail-label tests; preview covers every dataset in each language.

## Checks before production page migration

- Real browser interaction on desktop and mobile, all four languages, both display modes.
- Current live API/admin authentication, protected roles, GA4 charts, player search, PvP/Guild War compatibility.
- Pixel/layout checks for long Thai/Japanese strings; accessibility and keyboard input.
- Source gap policy: official text missing from the current API stays explicitly missing. The preview fallback and manifest must show this state. A key with an empty catalog row is not a completed translation.
- Ranger release dates belong to V2 authored metadata. Existing site dates are migrated once with user approval. New Rangers use the Asia/Taipei calendar date of their first successful V2 recording. Later runs preserve the date; failed validation/promotion preserves both the previous release and date table. Runtime never reads V1 output for dates.

## Source and translation ownership

`official` is regenerated from the V2-owned official DB snapshot. `custom` and `ui` are author-maintained inputs and must never be rewritten by the API fetcher. Catalog fields remain `key`, `zh_TW`, `en`, `th`, `jp`. Author translations are not represented as official translations or as reviewed by an external human.

The supported schema subset fails closed on unsupported schema keywords. This validates the declared contracts, not arbitrary third-party JSON Schema documents. Adding fields or kinds requires an explicit contract update and semantic test.

## Optional raw snapshot sharing

The user permits sharing decrypted official raw JSON. This release keeps the already verified independent raw fetchers. A later small change may introduce immutable, atomically promoted raw snapshots with separate V1/V2 consumer locks; neither consumer may share generated JSON, custom inputs or output paths. It is optional and is not required for the website migration.
