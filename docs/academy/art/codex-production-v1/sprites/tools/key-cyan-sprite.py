#!/usr/bin/env python3
"""Remove a uniform cyan key and recover clean semi-transparent edge colour.

This delivery uses cyan rather than green or magenta because the cast relies on
olive props, warm paper, and plum/rose accents. The matte is restricted to the
cyan channel relationship, so navy clothing and dark hair remain opaque.
"""

from __future__ import annotations

import argparse
from statistics import median

from PIL import Image


def clamp(value: float) -> int:
    return max(0, min(255, int(round(value))))


def border_key(image: Image.Image) -> tuple[int, int, int]:
    width, height = image.size
    pixels = image.load()
    band = max(1, min(width, height) // 128)
    samples: list[tuple[int, int, int]] = []
    for x in range(width):
        for y in range(band):
            samples.append(pixels[x, y][:3])
            samples.append(pixels[x, height - 1 - y][:3])
    for y in range(height):
        for x in range(band):
            samples.append(pixels[x, y][:3])
            samples.append(pixels[width - 1 - x, y][:3])
    return tuple(int(round(median(sample[index] for sample in samples))) for index in range(3))


parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--out", required=True)
args = parser.parse_args()

source = Image.open(args.input).convert("RGBA")
key_red, key_green, key_blue = border_key(source)
if not (key_green > 180 and key_blue > 180 and key_red < 80):
    raise SystemExit(f"Expected a cyan key, got #{key_red:02x}{key_green:02x}{key_blue:02x}.")

green_span = max(1, key_green - key_red)
blue_span = max(1, key_blue - key_red)
pixels = source.load()

for y in range(source.height):
    for x in range(source.width):
        red, green, blue, _ = pixels[x, y]
        cyan_fraction = min(
            max(0.0, (green - red) / green_span),
            max(0.0, (blue - red) / blue_span),
        )

        if cyan_fraction <= 0.08:
            pixels[x, y] = (red, green, blue, 255)
            continue
        if cyan_fraction >= 0.94:
            pixels[x, y] = (0, 0, 0, 0)
            continue

        coverage = 1.0 - cyan_fraction
        recovered = (
            clamp((red - cyan_fraction * key_red) / coverage),
            clamp((green - cyan_fraction * key_green) / coverage),
            clamp((blue - cyan_fraction * key_blue) / coverage),
        )
        pixels[x, y] = (*recovered, clamp(coverage * 255.0))

source.save(args.out)
