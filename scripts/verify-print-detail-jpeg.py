# SPDX-License-Identifier: Apache-2.0
"""Independent installed Pillow JPEG readback and Python coefficient reference.
Usage: python scripts/verify-print-detail-jpeg.py DIRECTORY [--record]
No engine import. Pillow is optional repository QA, not an engine dependency.
"""
import hashlib
import json
import math
from pathlib import Path
import platform
import re
import struct
import sys
import PIL
from PIL import Image, features


def digest(samples, fmt):
    return hashlib.sha256(b"".join(struct.pack(fmt, v) for v in samples)).hexdigest()


def linear(code):
    value = code / 255
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055)**2.4


def coefficients(samples, width, kx, ky):
    count = len(samples)
    height = count // width
    mean = math.fsum(samples) / count
    phases = [2 * math.pi * (kx * (i % width) / width + ky * (i // width) / height) for i in range(count)]
    cosine = 2 * math.fsum(v * math.cos(p) for v, p in zip(samples, phases)) / count
    sine = 2 * math.fsum(v * math.sin(p) for v, p in zip(samples, phases)) / count
    amplitude = math.hypot(cosine, sine)
    residual = math.sqrt(math.fsum((v - mean - cosine * math.cos(p) - sine * math.sin(p))**2
                                  for v, p in zip(samples, phases)) / count) / mean
    return {"mean": mean, "amplitude": amplitude, "modulation": amplitude / mean, "residual": residual}


root = Path(sys.argv[1])
manifest_bytes = (root / "export-manifest.json").read_bytes()
manifest = json.loads(manifest_bytes)
assert len({identity for item in manifest["cases"] for identity in item["documentIds"]}) == 32
assert len({item["captureId"] for item in manifest["cases"]}) == 4
cases = []
for item in manifest["cases"]:
    data = (root / (item["name"] + ".jpg")).read_bytes()
    assert hashlib.sha256(data).hexdigest() == item["jpegSha256"]
    w, h = item["raster"]["pixelWidth"], item["raster"]["pixelHeight"]
    assert item["nativeRawCodes"] == [64 + [576, 384, 192, 384][(i % 20 // 2) % 4] for i in range(320)]
    assert abs(item["referenceModulation"] - .5 * math.cos(math.pi / 8)) < 1e-15
    expected_rgb = []
    native_linear_oriented = []
    for y in range(h):
        for x in range(w):
            nx, ny = {"landscape": (x, y), "portrait-clockwise": (y, 15 - x),
                      "landscape-inverted": (19 - x, 15 - y), "portrait-counter-clockwise": (19 - y, x)}[item["orientation"]]
            value = (item["nativeRawCodes"][ny * 20 + nx] - 64) / 959
            native_linear_oriented.append(value)
            expected_rgb.extend([math.floor((1.055 * value**(1 / 2.4) - .055) * 255 + .5)] * 3)
    assert item["preEncodeRgb"] == expected_rgb
    with Image.open(root / (item["name"] + ".jpg")) as image:
        image.load()
        assert image.format == "JPEG" and image.mode == "RGB" and image.size == (w, h)
        assert image.getexif()[274] == 1
        pixels = list(image.get_flattened_data())
    assert all(r == g == b for r, g, b in pixels), "This protocol requires neutral RGB."
    decoded_rgb = [v for pixel in pixels for v in pixel]
    roi = item["roi"]
    assert roi == ({"x": 2, "y": 2, "width": 8, "height": 16} if item["orientation"].startswith("portrait")
                   else {"x": 2, "y": 2, "width": 16, "height": 8})
    sample_indices = [(roi["y"] + y) * w + roi["x"] + x for y in range(roi["height"]) for x in range(roi["width"])]
    samples = [linear(pixels[i][0]) for i in sample_indices]
    before = [linear(expected_rgb[i * 3]) for i in sample_indices]
    frequency = item["cyclesAcrossRegion"]
    assert frequency == ({"x": 0, "y": 2} if item["orientation"].startswith("portrait") else {"x": 2, "y": 0})
    source_reference = coefficients([native_linear_oriented[i] for i in sample_indices], roi["width"], frequency["x"], frequency["y"])
    assert abs(source_reference["mean"] - 384 / 959) < 1e-12
    assert abs(source_reference["modulation"] - .5 * math.cos(math.pi / 8)) < 1e-12
    cases.append({"name": item["name"], "jpegSha256": item["jpegSha256"],
                  "decodedRgbUint8Sha256": hashlib.sha256(bytes(decoded_rgb)).hexdigest(),
                  "decodedRgb": decoded_rgb, "roiSamples": samples, "roiFloat64LeSha256": digest(samples, "<d"),
                  "preEncode": coefficients(before, roi["width"], frequency["x"], frequency["y"]),
                  "decoded": coefficients(samples, roi["width"], frequency["x"], frequency["y"])})
report = {"evidenceVersion": "0.1.0", "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
          "decoder": {"Pillow": PIL.__version__, "libjpegApiVersion": features.version("jpg"),
                      "libjpegTurboVersion": features.version("libjpeg_turbo"), "Python": platform.python_version()},
          "humanReview": "pending", "cases": cases}
destination = root / "independent-reference.json"
if "--record" in sys.argv[2:]:
    text = re.sub(r"\[\s*([\d.eE+,\-\s]+)\]", lambda match: "[" + ", ".join(v.strip() for v in match[1].split(",")) + "]",
                  json.dumps(report, indent=2))
    destination.write_text(text + "\n")
else:
    existing = json.loads(destination.read_text())
    assert report["manifestSha256"] == existing["manifestSha256"]
    # Decoder-version changes require a new reviewed record even when pixels agree.
    assert report["decoder"] == existing["decoder"]
    assert report["cases"] == existing["cases"]
print("Eight exact JPEGs decoded; owned RAW/registration/neutral code truth and independent ROI coefficients verified.")
