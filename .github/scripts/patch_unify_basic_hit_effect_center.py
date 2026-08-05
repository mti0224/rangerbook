from pathlib import Path

path = Path("assets/js/ranger-animation-hit-effect.js")
source = path.read_text(encoding="utf-8")
old = "const centeredOnTarget=!state.plan.hasProjectile;"
new = "const centeredOnTarget=true;"
count = source.count(old)
if count != 1:
    raise RuntimeError(f"expected exactly one centeredOnTarget condition, found {count}")
source = source.replace(old, new, 1)
path.write_text(source, encoding="utf-8")
