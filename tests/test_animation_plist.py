"""Regression checks for TexturePacker plist data used by RangerBook animation metadata."""
import importlib.util
import plistlib
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build_animation_data.py"
spec = importlib.util.spec_from_file_location("build_animation_data", SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class AnimationPlistTests(unittest.TestCase):
    def parse(self, frames):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.plist"
            path.write_bytes(plistlib.dumps({"frames": frames}))
            return builder.load_plist(path)

    def test_decimal_and_integer_rectangles(self):
        self.assertEqual(builder.plist_rect("{{98.0,322.0},{99.0,99.0}}"), [98,322,99,99])
        self.assertEqual(builder.plist_rect("{{98,322},{99,99}}"), [98,322,99,99])
        self.assertEqual(builder.plist_rect("{{-2.5,1.5},{22.5,20.0}}"), [-2,2,23,20])

    def test_aliases_and_real_sprite_precedence(self):
        atlas = self.parse({
            "primary.png": {
                "textureRect": "{{98.0,322.0},{99.0,99.0}}",
                "textureRotated": True,
                "aliases": ["alias.png", "existing.png", ""],
            },
            "existing.png": {"frame": "{{2,3},{10,11}}"},
        })
        self.assertEqual(atlas["primary.png"]["rect"], [98,322,99,99])
        self.assertTrue(atlas["primary.png"]["rotated"])
        self.assertEqual(atlas["alias.png"], atlas["primary.png"])
        self.assertEqual(atlas["existing.png"]["rect"], [2,3,10,11])

    def test_invalid_sprites_do_not_break_others(self):
        atlas = self.parse({
            "zero.png": {"textureRect": "{{98.0,322.0},{99.0,0.0}}",
                         "aliases": ["zero_alias.png"]},
            "valid.png": {"textureRect": "{{0,0},{20,30}}"},
        })
        self.assertNotIn("zero.png", atlas)
        self.assertNotIn("zero_alias.png", atlas)
        self.assertEqual(atlas["valid.png"]["rect"], [0,0,20,30])


if __name__ == "__main__":
    unittest.main()
