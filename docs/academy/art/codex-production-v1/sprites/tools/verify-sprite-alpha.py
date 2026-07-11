#!/usr/bin/env python3
import json
import sys
from pathlib import Path

from PIL import Image


if len(sys.argv) != 2:
    raise SystemExit("Usage: verify-sprite-alpha.py <png>")

path = Path(sys.argv[1])
image = Image.open(path).convert("RGBA")
width, height = image.size
alpha = image.getchannel("A")
alpha_values = list(alpha.getdata())
opaque_pixels = sum(value >= 220 for value in alpha_values)
transparent_pixels = sum(value <= 12 for value in alpha_values)
corners = [alpha.getpixel(point) for point in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]]

magenta_pixels = 0
for red, green, blue, opacity in image.getdata():
    if opacity > 24 and red > 180 and blue > 180 and green < 120:
        magenta_pixels += 1

report = {
    "asset": str(path),
    "dimensions": {"width": width, "height": height},
    "alpha": {
        "mode": "RGBA",
        "cornerAlpha": corners,
        "opaquePixelCount": opaque_pixels,
        "transparentPixelCount": transparent_pixels,
        "coveragePercent": round((opaque_pixels / (width * height)) * 100, 3),
        "residualMagentaPixelCount": magenta_pixels,
        "status": "pass" if width == 1536 and height == 2048 and all(value <= 12 for value in corners) and opaque_pixels > 1000 and magenta_pixels == 0 else "fail",
    },
}

print(json.dumps(report, indent=2))
