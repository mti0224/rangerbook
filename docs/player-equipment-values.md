# Player equipment advanced-option values

Player search, every PvP league's team viewer and administrator guild-member
teams use `player-equipment-effects.js`. Clicking equipment shows its selected
effect and the actual value, retaining the existing five-second display.
The original permissions and available team types are unchanged.

The three production serializers previously kept only `itemCode` and `attr4No`.
The shared `backend/rangerbook_auth/equipment_effects.py` also retains
`attr4ValueGrade` and `currentAdvancedEnchant` and emits `attr4Value` plus
`attr4Unit` (`PERCENT` or `FLAT`). Inventory and account identifiers stay private.

Values use independent V2 inputs, never V1 outputs:

- `data/raw/unit_eqip_attr.json`: selected attribute's minimum, maximum,
  `valueDivideGrades`, and reinforce type.
- `data/v2/equipment.json`: matching option's normalized `upgradeStep`.

For a zero-based roll grade `g` and `D` divisions, the base is
`min + (max - min) × g / (D - 1)`; a single-division attribute uses its minimum.
Percentage attributes are scaled by 100, then the player's advanced enchant
level times the normalized upgrade step is added. Decimal arithmetic avoids
floating-point artifacts. Example: HP grade 8/9 yields 145%, plus five upgrades
of 50% gives 395%. Mineral cost grade 9/9 at +5 gives -18%; flat speed at +5
gives 30, with no percent sign.

The resolver reloads definitions when either V2 input changes. Missing,
ambiguous or invalid definitions, roll grades or enchant levels leave the value
absent. Old compact snapshots display the localized “Value pending update”
instead of inventing a roll or substituting the default attribute.

## Production installation

Run the following from the reviewed checkout on the server:

```sh
python3 deploy/aws/install_player_equipment_values.py
python3 deploy/aws/install_player_equipment_values.py --apply
sudo systemctl restart rangerbook-auth.service
```

The installer syntax-checks and backs up all targets before atomically replacing
only `_public_equipment` in Auth and the PvP collector, and `compact_gear` in the
guild collector. It installs the same resolver beside each script, preserving
unrelated production changes. No authentication configuration is replaced.

Copy the single authored `UI:gear.playerValuePending` row into the current
`/home/ubuntu/rangerbook-v2/data/locales/ui.json`, preserving other rows. It is
also committed in `deploy/aws/v2/locales/ui.json` and the initial public catalog.

Player search receives values immediately on a new API query. Existing public
PvP/guild snapshots need a normal successful collector refresh because the old
serializers discarded the roll and enchant fields. Do not backfill them from
default/max rolls or older, different player snapshots. A collector process
already running during installation uses its previously loaded code until its
next invocation.

## Validation

```sh
python -m unittest discover -s tests -p test_player_equipment_values.py -v
node tests/player-equipment-values.cjs
```

The browser test uses real V2 catalogs with synthetic accounts and teams. It
checks four locales, all seven search team types, six teams in three PvP
leagues, guild teams, all three slots, legacy snapshots, and mobile wrapping.
No real administrator session or official game request is used in that test.
