# SPDX-License-Identifier: Apache-2.0
"""Independent processing difference reference for the preserved exact JPEG family."""
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path

folder = Path(__file__).parent
manifest_bytes = (folder / "jpeg/export-manifest.json").read_bytes()
decoder_bytes = (folder / "jpeg/independent-reference.json").read_bytes()
manifest = json.loads(manifest_bytes)
decoder = json.loads(decoder_bytes)
assert hashlib.sha256(manifest_bytes).hexdigest() == decoder["manifestSha256"]


def inverse(code):
    value = code / 255
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055)**2.4


cases = []
for record in manifest["cases"]:
    decoded = next(r for r in decoder["cases"] if r["name"] == record["name"])
    roi = record["roi"]
    indices = [(roi["y"] + y) * record["raster"]["pixelWidth"] + roi["x"] + x
               for y in range(roi["height"]) for x in range(roi["width"])]
    before = [inverse(record["preEncodeRgb"][i * 3]) for i in indices]
    after = [inverse(decoded["decodedRgb"][i * 3]) for i in indices]
    delta = [Fraction.from_float(a) - Fraction.from_float(b) for a, b in zip(after, before)]
    cases.append({"name": record["name"], "jpegSha256": record["jpegSha256"], "sampleCount": len(delta),
                  "meanSignedDifferenceRelativeLuminance": float(sum(delta) / len(delta)),
                  "rmsDifferenceRelativeLuminance": math.sqrt(float(sum(d*d for d in delta) / len(delta))),
                  "maximumAbsoluteDifferenceRelativeLuminance": float(max(abs(d) for d in delta))})
report = {"protocolVersion": "0.1.0", "referenceBackend": "Python exact rational paired differences on independently decoded neutral linear samples",
          "sourceManifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
          "sourceDecoderRecordSha256": hashlib.sha256(decoder_bytes).hexdigest(), "cases": cases}
text = json.dumps(report, indent=2) + "\n"
(folder / "processing-reference.json").write_text(text)
print(hashlib.sha256(text.encode()).hexdigest())
