# SPDX-License-Identifier: Apache-2.0

"""Optional independent fixture check with an existing Pillow installation.

Repository-only QA; Pillow is not a runtime dependency. This reads TIFF tags
and exact uncompressed strip codes, not rendered DNG camera color. Usage:
python scripts/verify-photographic-export-fixtures.py OUTPUT_DIRECTORY
"""
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
from xml.dom import minidom
from PIL import Image, TiffImagePlugin

root = Path(sys.argv[1])
expected = json.loads((root / "reference.json").read_text())
raw = (root / "reference.dng").read_bytes()
stream = io.BytesIO(raw)
tags = TiffImagePlugin.ImageFileDirectory_v2(raw[:8])
stream.seek(8)
tags.load(stream)
assert (tags[256], tags[257]) == (expected["nativeWidth"], expected["nativeHeight"])
assert tags[262] == 32803 and tags[258] == (16,) and tags[259] == 1
assert list(struct.unpack_from("<" + str(len(expected["codes"])) + "H", raw, tags[273][0])) == expected["codes"]
assert tags[33422] == bytes([0, 1, 1, 2]) and tags[50706] == bytes([1, 1, 0, 0])
assert tuple(tags[50714]) == (64, 64, 64, 64) and tags[50717] == 1023
assert tags[50829] == (0, 0, 2, 2) and tags[50719] == (0, 0) and tags[50720] == (2, 2)
assert tags[271] == "Photivra" and tags[272] == "Photivra Virtual Camera"
assert len(tags[50781]) == 16
description = minidom.parseString(tags[700]).getElementsByTagName("rdf:Description")[0]
assert description.getAttribute("photivra:SimulationHash") == expected["hash"]
assert "digitalCreation" in description.getAttribute("Iptc4xmpExt:DigitalSourceType")
jpg = Image.open(root / "reference.jpg")
jpg.load()
assert jpg.size == (2, 2) and jpg.getexif()[274] == 1
assert jpg.getexif().get_ifd(34665)[36867] == "2026:10:01 19:00:00"
description = minidom.parseString(jpg.info["xmp"]).getElementsByTagName("rdf:Description")[0]
assert description.getAttribute("photivra:SimulationHash") == expected["hash"]
pixels = [component for pixel in jpg.get_flattened_data() for component in pixel]
assert max(abs(a-b) for a, b in zip(expected["rgb"], pixels)) <= 2
assert hashlib.sha256(raw).hexdigest() == expected["dngHash"]
assert hashlib.sha256((root / "reference.jpg").read_bytes()).hexdigest() == expected["jpegHash"]
print("TIFF tags/exact RAW strip, JPEG decoding, EXIF, XMP/XML and byte hashes pass.")
print("CFA rendering, editor acceptance and production/high-resolution support remain unverified.")
