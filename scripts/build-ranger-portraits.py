"""Publish native 114x118 portraits as ordinary same-origin PNG assets."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://raw.githubusercontent.com/mti0224/rangerbook_res/main/'


def star_asset_name(ranger):
    grade = int(ranger['starGrade'])
    evolution = ranger.get('evolution')
    level = '04' if grade == 8 and evolution == 'HYPER' else (
        '02' if 6 <= grade <= 8 and evolution == 'ULTRA' else '01')
    return f'com_level{level}_star{grade:02}.png'


def add_star_layer(portrait, star):
    # Overlay the original game badge on the body at the bottom of the frame.
    height = 20
    width = round(star.width * height / star.height)
    badge = star.resize((width, height), Image.Resampling.LANCZOS)
    result = portrait.copy()
    result.alpha_composite(badge, ((result.width - width) // 2, result.height - height - 2))
    return result


def frame_mask(mask):
    # The game's mask reserves 22 transparent rows for its separate badge.
    # Extend the middle of the mask so the original sprite continues behind
    # the badge. Keep the rounded corners and the sprite's face anchor intact.
    alpha = mask.getchannel('A')
    bottom = alpha.getbbox()[3]
    gap = mask.height - bottom
    if not gap:
        return mask
    split = bottom // 2
    result = Image.new('RGBA', mask.size)
    result.paste(mask.crop((0, 0, mask.width, split)), (0, 0))
    middle = mask.crop((0, split, mask.width, split + 1))
    result.paste(middle.resize((mask.width, gap)), (0, split))
    result.paste(mask.crop((0, split, mask.width, bottom)), (0, split + gap))
    return result


def compose_portrait(sprite, visual, mask):
    sprite = sprite.convert('RGBA')
    scale = float(visual['scale'])
    face = visual['faceCenter']
    x = mask.width / 2 - float(face['x']) * sprite.width * scale
    y = mask.height / 2 - (1 - float(face['y'])) * sprite.height * scale
    result = sprite.transform(mask.size, Image.Transform.AFFINE,
                              (1 / scale, 0, -x / scale, 0, 1 / scale, -y / scale),
                              resample=Image.Resampling.BICUBIC)
    result.putalpha(ImageChops.multiply(result.getchannel('A'), mask.getchannel('A')))
    return result


def original_sprite(code, cache):
    target = cache / (code + '.png')
    if target.exists():
        with Image.open(target) as img:
            return img.convert('RGBA')
    last_error = None
    for suffix in ['-thum.png', '-thum-140.png']:
        for attempt in range(3):
            try:
                request = Request(SOURCE + code + '/' + code + suffix,
                                  headers={'User-Agent': 'Rangerbook-portrait-builder/1.0'})
                with urlopen(request, timeout=20) as response:
                    data = response.read()
                with Image.open(BytesIO(data)) as img:
                    result = img.convert('RGBA')
                target.write_bytes(data)
                return result
            except Exception as error:
                last_error = error
                if isinstance(error, HTTPError) and error.code == 404:
                    break
                if attempt < 2:
                    time.sleep(attempt + 1)
    raise RuntimeError(f'{code}: {last_error}')


def build(root=ROOT, only=None, workers=16):
    rangers = json.loads((root / 'res/v2/rangers.json').read_text())['rangers']
    units = json.loads((root / 'res/v2/projectiles.json').read_text())['units']
    codes = [row['rangerCode'] for row in rangers if not only or row['rangerCode'] in only]
    if only and set(codes) != set(only):
        raise ValueError('Unknown Ranger code')
    output = root / 'assets/portraits'
    cache = root / '.portrait-source'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'stars').mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    mask = Image.open(root / 'assets/main_icon/portrait-mask-native.png').convert('RGBA')
    assert mask.size == (114, 118)
    mask = frame_mask(mask)
    by_code = {row['rangerCode']: row for row in rangers}
    star_images = {}
    for name in {star_asset_name(by_code[code]) for code in codes}:
        with Image.open(root / 'assets/star_layer' / name) as image:
            star_images[name] = image.convert('RGBA')

    def render(code):
        if not re.fullmatch(r'u\d+[a-z]*(?:-[a-z0-9_-]+)?', code, re.I):
            raise ValueError('Invalid Ranger code')
        sprite = original_sprite(code, cache)
        result = compose_portrait(sprite, units[code]['visual'], mask)
        if not result.getbbox():
            raise ValueError('Empty portrait: ' + code)
        result.save(output / (code + '.png'))
        add_star_layer(result, star_images[star_asset_name(by_code[code])]).save(output / 'stars' / (code + '.png'))
        return code

    errors = []
    completed = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for future in as_completed([pool.submit(render, code) for code in codes]):
            try:
                future.result()
                completed += 1
                if completed % 200 == 0:
                    print(f'Portraits: {completed}/{len(codes)}', flush=True)
            except Exception as error:
                errors.append(str(error))
    if errors:
        # Old units without either source retain their original resource URL
        # through the page's ordinary image fallback. A widespread download
        # failure must not publish an incomplete set of assets.
        print('Missing original sprites:', json.dumps(errors), flush=True)
    if completed < len(codes) * .99:
        raise RuntimeError(f'Portrait build incomplete: {completed}/{len(codes)}')
    print(f'PORTRAITS_OK {completed}/{len(codes)} nonempty native PNGs', flush=True)
    return completed


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', nargs='+')
    parser.add_argument('--workers', type=int, default=16)
    args = parser.parse_args()
    build(only=args.only, workers=args.workers)
