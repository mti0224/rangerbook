# Search-team analysis

`/pvp/search/` provides the shared PvP and admin private-team analysis renderer.
It preserves the six-axis radar and five equipment tabs, arranged with a new
team-distribution overview and INT/AGI/STR Ranger averages in four panels.
The top-right overview matches the radar panel's measured height on desktop,
scrolls internally if needed, and expands normally on mobile. The bottom panels
size independently. Native V2 IDs drive classification and effect matching;
localized labels never determine game logic.

`team-analysis-model.js` is the shared, pure calculation engine. Slot tabs count
Rangers, with each Ranger included in both their element and role. Surehit uses
`CLN_SKLAVD_PROB_MUL`, not `ANTI_SKLAVD_PROB_MUL` (Skill Hit Rate), and excludes
abilities with native `FLIGHT` aptitude. Both the radar and equipment tabs exclude
FLIGHT Rangers from Surehit and Elemental Prowess, including their denominators
and result cards. Native and awakened abilities use the same eligibility rule.
Elemental Prowess uses `EATK_MUL`, counts a Ranger once in the bars, sums active
values in the radar, and also excludes STR and any Ranger whose V2 skill effects
lack exact `SKILLEFF_DMG` (single-hit damage). Those Rangers do not enter the
numerator, denominator, or radar average. INT/AGI Rangers without single-hit
may use `HP_MUL` instead of their usual attack stat on Surehit weapons; both
`PRD_SPE_MUL` and `CLN_SKLAVD_PROB_MUL` remain mandatory.

The Auth equipment serializer adds `normalOptions` (actual rolled and enchanted
values), `attr4OptionKey`, and `attr4Condition` from official V2 raw attributes.
Basic rolls use `min + (max-min) * grade/(divisions-1)` (one division uses min),
then multiply by `(currentEnchant + 1)`, matching the existing equipment-detail
page's basic-option enhancement rule. `attrNProb` is not a stat multiplier. Matching
by attribute ID handles reordered player slots. Selected advanced-option values
continue to use the existing resolver. No inventory/account IDs are added.

Only 7+ Star equipment with a valid selected advanced option can activate it.
Both charts share this rule and the selected attribute's actual condition.
Unknown conditions fail closed with a distinct pending-data reason. Basic
options remain effective even when the advanced option fails or gear is 6 Stars.

Radar values include innate skill evade/resistance and unlocked enhancement
talents at stages 2–4. The current official unit table has no innate surehit
field; Skill Hit Rate is a different stat and is not substituted. Dynamic battle
skill buffs and triggered major talents are not treated as permanent stats.
Each Ranger's evade/resistance is capped at 100 before averaging. Other metrics
remain unclamped, with only SVG geometry clamped to its axis range. Missing
actual rolls are shown as pending rather than being replaced by catalog maxima
or silently excluded from the denominator. Empty eligible groups show no data.

Every team change refreshes both views; every new player query clears them.
Request sequence tokens prevent older player/data requests from restoring stale
results. Categories switch only on click, touch tap, or keyboard activation (Enter/Space), never on hover or focus; tab arrow
keys, Home and End are supported. A result card opens the existing Ranger detail.

## Four-panel overview and role averages

Six distributions count Rangers by star/evolution, role, element and unlocked talent
stage, and **equipped items** by star and selected high-level trigger condition.
Unverified equipment conditions remain unknown; unequipped slots are not counted.

The role breakdown calculates each Ranger at their **own recorded level** using
`rankUpStatIncrease` up to the regular level cap and `rankUpStatIncreaseMax`
afterward, matching the Ranger detail page. Attack is the sum of physical
and magical attacks after their own relevant gear/talent percentages.
Percentage contributions from basic rolls, activated high-level effects and
unlocked enhancement talents are **added before multiplying once**.

Mean effective mineral and respawn values use the same additive gear/talent
semantics. The per-level respawn reduction and 1.3-second minimum match the
Ranger detail page. Missing actual rolls, unknown Ranger definitions or invalid
recorded levels remain unavailable: catalog maximums are never substituted.

The official V2 equipment-option table does not currently expose separately
confirmed persistent codes for **skill attack nullification** or **skill
penetration**. Both start at zero; speculative mappings to unrelated effects
are forbidden. Skill sure-hit also starts at zero using its existing native code.

Both public PvP and admin personal teams embed this same analysis renderer.
## Validation

```sh
python -m unittest discover -s tests -p test_player_equipment_values.py -v
node tests/team-analysis-model.cjs
node tests/team-analysis-browser.cjs
node tests/player-equipment-values.cjs
node tests/i18n-contract.cjs
```

Browser tests use the exact synthetic A–F example and actual localization system,
without a production login. They cover every category and result card in all five
tabs, seven team choices, four languages, both themes, 320/390px mobile widths,
equal desktop panels, empty teams, tooltips, existing details, and player changes.
The model tests add star gates, missing gear/options, flight, STR exclusion,
talent unlocks, over-limit radar values, zero-valued members, duplicate elemental
effects and unknown conditions. Python tests verify exact rolls, enhancement,
condition metadata, missing data and private-field exclusion.

## Production installation

From the reviewed checkout on the Mumbai server:

```sh
python3 deploy/aws/install_team_analysis.py
python3 deploy/aws/install_team_analysis.py --apply
sudo systemctl restart rangerbook-auth.service
```

This backs up and replaces only Auth's shared equipment resolver and merges
`UI:analysis.*` into `/home/ubuntu/rangerbook-v2/data/locales/ui.json`. It preserves
other production translations and public collector behavior. Normal V2 updates
then publish these authored rows. GitHub Pages publishes the frontend on main.
Previously cached query payloads need a fresh player query for actual basic values.
