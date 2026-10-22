#!/usr/bin/env python3
"""Format JSON with four spaces without changing strings or numeric literals."""
from __future__ import annotations

import argparse
import json
import re
from decimal import Decimal
from pathlib import Path

TOKEN = re.compile(r'"(?:[^"\\]|\\.)*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[{}\[\],:]')


def format_json(text: str) -> str:
    def invalid_constant(value):
        raise ValueError(f'Invalid JSON constant: {value}')

    json.loads(text, parse_float=Decimal, parse_constant=invalid_constant)
    tokens = TOKEN.findall(text)
    output = []
    depth = 0
    previous = ''
    for index, token in enumerate(tokens):
        if token in ('{', '['):
            output.append(token)
            depth += 1
            if tokens[index + 1] not in ('}', ']'):
                output.extend(('\n', ' ' * (depth * 4)))
        elif token in ('}', ']'):
            depth -= 1
            if previous not in ('{', '['):
                output.extend(('\n', ' ' * (depth * 4)))
            output.append(token)
        elif token == ',':
            output.extend((',', '\n', ' ' * (depth * 4)))
        elif token == ':':
            output.append(': ')
        else:
            output.append(token)
        previous = token
    return ''.join(output) + '\n'


def format_files(paths):
    files = sorted({file for path in paths for file in
                    (path.rglob('*.json') if path.is_dir() else [path])})
    changed = 0
    for file in files:
        before = file.read_text(encoding='utf-8')
        after = format_json(before)
        if before != after:
            file.write_text(after, encoding='utf-8')
            changed += 1
    return {'files': len(files), 'changed': changed}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('paths', nargs='*', type=Path, default=[Path('res')])
    args = parser.parse_args()
    print(json.dumps(format_files(args.paths)))


if __name__ == '__main__':
    main()
