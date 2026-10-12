# V2 integration and acceptance gates

The production site keeps its V1 data readers. The independent `/v2/` page covers all 19 datasets and four languages for verification, without switching the site's existing 42 pages.

## Rollout order

| Step | Pages | Data adapter | Required acceptance |
|---|---|---|---|
| 1 | Ranger detail, list, comparison | rangerCode + structured skill/ability/talent | every child effect; level/grade formulas; stat units; aliases; both skills; four languages |
| 2 | Equipment and ability | equipCode/abilityCode; native Spec+ bindings | normal and random ranges; upgrade increments; logical conditions; percentage vs seconds |
| 3 | Hard/Extreme, Endless Tower, Labyrinth, enemies/artifacts | stageId/enemyCode/artifactCode | spawn order, triggers, reinforcement values, boss waves, gimmick timings, artifact percentages |
| 4 | Rankings/statistics, PvP and Guild War | existing account/API routes + V2 display resolver | enum-based filtering, names/icons, distributions, administrative roles, export, hover values |
| 5 | Home/settings/admin/about/support/update/404 | semantic UI keys from the V2 authored catalog | persisted four-language choice, mobile drawer, dark/light mode, accessible labels, error messages, GMT+8 times |

Keep immutable IDs and enums as filters. Translated labels must not become lookup keys or change arithmetic. Each page needs a feature flag and a V1 fallback adapter until its acceptance gate passes. Do not route production pages to the experimental preview.

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
- Ranger release dates remain unknown when the official snapshot provides no release-date field. Do not copy V1's third-party dates or infer a release date from an asset modification timestamp.

## Source and translation ownership

`official` is regenerated from the V2-owned official DB snapshot. `custom` and `ui` are author-maintained inputs and must never be rewritten by the API fetcher. Catalog fields remain `key`, `zh_TW`, `en`, `th`, `jp`. Author translations are not represented as official translations or as reviewed by an external human.

The supported schema subset fails closed on unsupported schema keywords. This validates the declared contracts, not arbitrary third-party JSON Schema documents. Adding fields or kinds requires an explicit contract update and semantic test.
