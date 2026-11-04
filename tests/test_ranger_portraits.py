import importlib.util
import json
from pathlib import Path
import unittest
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('portraits', ROOT / 'scripts/build-ranger-portraits.py')
portraits = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portraits)


class NativePortraitTests(unittest.TestCase):
    def test_original_star_asset_mapping(self):
        for grade in range(1, 10):
            self.assertEqual(portraits.star_asset_name({'starGrade':grade,'evolution':'NORMAL'}),
                             f'com_level01_star{grade:02}.png')
        self.assertEqual(portraits.star_asset_name({'starGrade':8,'evolution':'HYPER'}), 'com_level04_star08.png')
        for grade in [6, 7, 8]:
            self.assertEqual(portraits.star_asset_name({'starGrade':grade,'evolution':'ULTRA'}),
                             f'com_level02_star{grade:02}.png')
        rows = json.loads((ROOT / 'res/v2/rangers.json').read_text())['rangers']
        for name in {portraits.star_asset_name(row) for row in rows}:
            with Image.open(ROOT / 'assets/star_layer' / name) as badge:
                badge.load()
                self.assertTrue(badge.getbbox(), name)

    def test_star_uses_bottom_gap_without_changing_face_pixels(self):
        portrait = Image.new('RGBA', (114, 118), (5, 10, 15, 128))
        with Image.open(ROOT / 'assets/star_layer/com_level01_star09.png') as badge:
            result = portraits.add_star_layer(portrait, badge.convert('RGBA'))
        self.assertEqual(result.size, portrait.size)
        self.assertEqual(result.crop((0, 0, 114, 96)).tobytes(), portrait.crop((0, 0, 114, 96)).tobytes())
        self.assertNotEqual(result.crop((0, 96, 114, 116)).tobytes(), portrait.crop((0, 96, 114, 116)).tobytes())
        self.assertEqual(result.crop((0, 116, 114, 118)).tobytes(), portrait.crop((0, 116, 114, 118)).tobytes())

    def test_actual_mask_decodes_without_truncated_image_tolerance(self):
        with Image.open(ROOT / 'assets/main_icon/portrait-mask-native.png') as mask:
            mask.load()
            self.assertEqual(mask.size, (114, 118))
            self.assertEqual(mask.mode, 'RGBA')
            self.assertEqual(mask.getchannel('A').getextrema(), (0, 255))

    def test_native_anchor_and_scale_center_the_face(self):
        sprite = Image.new('RGBA', (400, 300))
        # faceCenter.y=.7 is measured upward: face is at 90px from the top.
        ImageDraw.Draw(sprite).rectangle((70, 80, 90, 100), fill='red')
        mask = Image.new('RGBA', (114, 118), 'white')
        result = portraits.compose_portrait(sprite, {'scale': .5, 'faceCenter': {'x': .2, 'y': .7}}, mask)
        self.assertEqual(result.size, (114, 118))
        self.assertEqual(result.getpixel((57, 59)), (255, 0, 0, 255))
        self.assertEqual(result.getpixel((0, 0))[3], 0)

    def test_mask_retains_its_transparent_and_semitransparent_pixels(self):
        sprite = Image.new('RGBA', (200, 200), 'blue')
        mask = Image.new('RGBA', (114, 118), (255, 255, 255, 0))
        mask.putpixel((57, 59), (255, 255, 255, 128))
        result = portraits.compose_portrait(sprite, {'scale': 1, 'faceCenter': {'x': .5, 'y': .5}}, mask)
        self.assertEqual(result.getpixel((57, 59)), (0, 0, 255, 128))
        self.assertEqual(result.getpixel((0, 0))[3], 0)


if __name__ == '__main__':
    unittest.main()
