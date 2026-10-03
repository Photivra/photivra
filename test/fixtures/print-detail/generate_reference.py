# SPDX-License-Identifier: Apache-2.0
"""Owned discrete target and independent SDR reference; no engine imports."""
import hashlib
import json
import math
from pathlib import Path
import struct

folder = Path(__file__).parent
target = {
    "version": "owned-quarter-grating-0.1.0",
    "rights": "Photivra-owned Apache-2.0 draft target",
    "domain": "relative-linear-srgb-d65-neutral",
    "pixelWidth": 16, "pixelHeight": 12,
    "samples": [[.6, .4, .2, .4][x % 4] for y in range(12) for x in range(16)],
}
source = (json.dumps(target, indent=2) + "\n").encode()
(folder / "quarter-grating.json").write_bytes(source)


def digest(values, format_string):
    return hashlib.sha256(b"".join(struct.pack(format_string, v) for v in values)).hexdigest()


cases = []
for orientation in ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"]:
    width, height = (12, 16) if orientation.startswith("portrait") else (16, 12)
    rgb = []
    for y in range(height):
        for x in range(width):
            nx, ny = {"landscape": (x, y), "portrait-clockwise": (y, 11 - x),
                      "landscape-inverted": (15 - x, 11 - y), "portrait-counter-clockwise": (15 - y, x)}[orientation]
            rgb.extend([target["samples"][ny * 16 + nx]] * 3)
    for bits in [8, 16]:
        maximum = 2**bits - 1

        def encode(value):
            s = 12.92 * value if value <= .0031308 else 1.055 * value**(1 / 2.4) - .055
            return math.floor(s * maximum + .5)

        def decode(code):
            s = code / maximum
            return s / 12.92 if s <= .04045 else ((s + .055) / 1.055)**2.4

        codes = [encode(v) for v in rgb]
        levels = [decode(encode(v)) for v in [.6, .4, .2]]
        mean = (levels[0] + 2 * levels[1] + levels[2]) / 4
        modulation = abs(levels[0] - levels[2]) / (2 * mean)
        cases.append({"orientation": orientation, "bitDepth": bits,
                      "raster": {"pixelWidth": width, "pixelHeight": height},
                      "rgbFloat64LeSha256": digest(rgb, "<d"), "codesUint16LeSha256": digest(codes, "<H"),
                      "levelCodes": [encode(v) for v in [.6, .4, .2]], "decodedLevels": levels,
                      "expectedMean": mean, "expectedModulation": modulation})

reference = {"evidenceVersion": "0.1.0",
             "referenceBackend": "Python standard-library binary64 independent transfer and discrete-level identities",
             "sourceArtifactSha256": hashlib.sha256(source).hexdigest(), "cases": cases}
(folder / "sdr-reference.json").write_text(json.dumps(reference, indent=2) + "\n")
