from pathlib import Path
import json
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
EXPECTED={
    "table.effect":("效果","Effect"),
    "table.value":("數值","Value"),
    "table.coefficient":("係數","Multiplier"),
    "table.skillEffect":("技能效果","Skill Effect"),
    "table.duration":("時間","Duration"),
    "table.range":("範圍","Range"),
    "stats.mineralCost":("生產礦物費用","Mineral Cost"),
    "stats.splashRange":("濺射範圍","Splash Range"),
    "stats.skillResistance":("技能抗性","Skill Resistance"),
    "stats.criticalRate":("爆擊機率","Critical Hit Rate"),
    "stats.skillAccuracy":("技能命中率","Skill Accuracy"),
}
TABLES=[
 "assets/js/ranger.js",
 "assets/js/gear-detail.js",
 "assets/js/ability.js",
 "assets/js/hsEnemy.js",
 "assets/js/ranger-compare.js",
]

class DetailI18nContract(unittest.TestCase):
 def test_has_bilingual_keys(self):
  d=json.loads((ROOT/"assets/locales/ui.json").read_text(encoding="utf-8"))
  self.assertEqual(set(d["zh-Hant"]),set(d["en"]))
  for k,(chinese,english) in EXPECTED.items():
   self.assertEqual(d["zh-Hant"].get(k),chinese)
   self.assertEqual(d["en"].get(k),english)

 def test_rendered_detail_headers_are_key_bound(self):
  for file in TABLES:
   code=(ROOT/file).read_text(encoding="utf-8")
   # All plain Chinese <th> table headings in detail renderers must
   # be explicitly key-bound, not reliant on an automatic post-render scan.
   missing=re.findall(r'<th>([\u3400-\u9fff][^<]*)</th>',code)
   self.assertEqual(missing,[],file+": "+repr(missing))
   self.assertIn('data-i18n="table.',code,file)

 def test_ranger_stat_labels_have_semantic_keys(self):
  source=(ROOT/"assets/js/ranger.js").read_text(encoding="utf-8")
  mapping=re.search(r"const statI18nKeys = (\{[\s\S]*?\});",source)
  self.assertIsNotNone(mapping)
  stat_keys=json.loads(mapping.group(1))
  d=json.loads((ROOT/"assets/locales/ui.json").read_text(encoding="utf-8"))
  for key in [
   "體力","物理攻擊力","魔法攻擊力","物理防禦力","魔法防禦力",
   "生產礦物費用","再生產時間","攻擊範圍","濺射範圍",
   "移動速度","攻擊速度","技能抗性","爆擊機率","爆擊傷害",
   "閃避機率","技能閃避機率","命中率","技能命中率"
  ]:
   self.assertIn(key,stat_keys)
   self.assertEqual(d["zh-Hant"][stat_keys[key]],key)
   self.assertTrue(d["en"][stat_keys[key]])
  self.assertIn('data-i18n="detail.basicStats"',source)

if __name__=="__main__":
 unittest.main()
