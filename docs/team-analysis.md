# Search-team analysis

`/pvp/search/` adds a six-axis radar and five equipment tabs below the existing
team/detail area. Native V2 IDs drive all classification and effect matching;
localized labels never determine game logic. Only this page gains the analysis UI.

`team-analysis-model.js` is the shared, pure calculation engine. Slot tabs count
Rangers, with each Ranger included in both their element and role. Surehit uses
`CLN_SKLAVD_PROB_MUL`, not `ANTI_SKLAVD_PROB_MUL` (Skill Hit Rate), and excludes
abilities with native `FLIGHT` aptitude. Elemental Prowess uses `EATK_MUL`, counts
a Ranger once in the bars, sums active values in the radar, and excludes STR.

The Auth equipment serializer adds `normalOptions` (actual rolled and enchanted
values), `attr4OptionKey`, and `attr4Condition` from official V2 raw attributes.
Basic rolls use `min + (max-min) * grade/(divisions-1)` (one division uses min),
then the official item's `attrNProb` times the player's `currentEnchant`. Matching
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
results. Categories support hover, click, touch, and keyboard focus; tab arrow
keys, Home and End are supported. A result card opens the existing Ranger detail.

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
