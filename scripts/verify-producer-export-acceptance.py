# SPDX-License-Identifier: Apache-2.0

"""Optional independent QA with installed Pillow, Expat, libxml2 and LibRaw.
Uses documented LibRaw opaque-handle C functions, never private struct offsets.
https://www.libraw.org/docs/API-C.html
Usage: python scripts/verify-producer-export-acceptance.py OUTPUT_DIRECTORY
"""
import ctypes as c
from ctypes.util import find_library
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
from xml.dom import minidom
from PIL import Image, TiffImagePlugin
from lxml import etree

NS = "https://photivra.com/ns/simulation/1.0/"

def xmp(packet):
    node = minidom.parseString(packet).getElementsByTagName("rdf:Description")[0]
    first = {(a.namespaceURI, a.localName): a.value for a in node.attributes.values()
             if a.namespaceURI != "http://www.w3.org/2000/xmlns/"}
    node = etree.fromstring(packet).find(".//{http://www.w3.org/1999/02/22-rdf-syntax-ns#}Description")
    second = {tuple(key[1:].split("}", 1)): value for key, value in node.attrib.items()}
    assert first == second
    return first

def directory(data, offset):
    tags = TiffImagePlugin.ImageFileDirectory_v2(data[:8])
    stream = io.BytesIO(data)
    stream.seek(offset)
    tags.load(stream)
    return tags

library = find_library("raw")
if not library:
    raise SystemExit("LibRaw unavailable: independent RAW acceptance must not silently pass.")
lib = c.CDLL(library)
lib.libraw_version.restype = c.c_char_p
lib.libraw_init.argtypes, lib.libraw_init.restype = [c.c_uint], c.c_void_p
lib.libraw_close.argtypes = [c.c_void_p]
for name in ("open_file", "dcraw_ppm_tiff_writer"):
    fn = getattr(lib, "libraw_" + name)
    fn.argtypes, fn.restype = [c.c_void_p, c.c_char_p], c.c_int
for name in ("unpack", "dcraw_process", "get_raw_width", "get_raw_height", "get_color_maximum"):
    fn = getattr(lib, "libraw_" + name)
    fn.argtypes, fn.restype = [c.c_void_p], c.c_int
lib.libraw_get_cam_mul.argtypes, lib.libraw_get_cam_mul.restype = [c.c_void_p, c.c_int], c.c_float

root = Path(sys.argv[1])
report = {"LibRaw": lib.libraw_version().decode(), "checks": [], "adobe": "pending-external-review",
          "browser": "pending-external-review", "editorPixelEqualityRequired": False}
all_ids = []
raw_ids = []
with tempfile.TemporaryDirectory(prefix="photivra-independent-reader-") as scratch:
    for item in json.loads((root / "manifest.json").read_text()):
        name = item["fixture"]
        expected = json.loads((root / (name + ".json")).read_text())
        raw = (root / (name + ".dng")).read_bytes()
        tags = directory(raw, 8)
        assert (tags[256], tags[257]) == (72, 48)
        assert tags[262] == 32803 and tags[258] == (16,) and tags[259] == 1
        codes = list(struct.unpack_from("<3456H", raw, tags[273][0]))
        assert codes == expected["codes"] and min(codes) < 64 and max(codes) == 1023
        assert tuple(tags[50714]) == (64, 64, 64, 64) and tags[50717] == 1023
        assert tags[33422] == bytes([0, 1, 1, 2]) and tags[33421] == (2, 2)
        assert tags[50829] == (0, 0, 48, 72) and tags[50719] == (0, 0) and tags[50720] == (72, 48)
        assert tags[274] == {"landscape": 1, "portrait-clockwise": 6, "landscape-inverted": 3, "portrait-counter-clockwise": 8}[name if name != "manual-wb" else "landscape"]
        assert tags[271] == "Photivra" and tags[272] == "Photivra Virtual Camera"
        raw_ids.append(tags[50781])
        raw_exif = directory(raw, tags[34665])
        jpg = Image.open(root / (name + ".jpg"))
        jpg.load()
        assert jpg.size == (expected["outputWidth"], expected["outputHeight"]) and jpg.getexif()[274] == 1
        jpeg_exif = jpg.getexif().get_ifd(34665)
        for tag in (33434, 33437, 34855, 34864, 34866, 36867, 36881, 37521, 37386, 41989):
            assert raw_exif[tag] == jpeg_exif[tag]
        a, b = xmp(tags[700]), xmp(jpg.info["xmp"])
        assert a[(NS, "CaptureID")] == b[(NS, "CaptureID")]
        assert a[(NS, "SimulationHash")] == b[(NS, "SimulationHash")] == expected["hash"]
        for fields in (a, b):
            assert fields[(NS, "SimulatedCapture")] == "True"
            assert fields[("http://iptc.org/std/Iptc4xmpExt/2008-02-29/", "DigitalSourceType")].endswith("digitalCreation")
            all_ids.extend(fields[("http://ns.adobe.com/xap/1.0/mm/", key)] for key in ("DocumentID", "InstanceID"))
        assert 34853 not in tags and 37500 not in raw_exif and 41728 not in raw_exif and 41729 not in raw_exif
        assert hashlib.sha256(raw).hexdigest() == expected["dngHash"]
        assert hashlib.sha256((root / (name + ".jpg")).read_bytes()).hexdigest() == expected["jpegHash"]
        handle = lib.libraw_init(0)
        assert handle
        try:
            assert lib.libraw_open_file(handle, str(root / (name + ".dng")).encode()) == 0
            assert (lib.libraw_get_raw_width(handle), lib.libraw_get_raw_height(handle)) == (72, 48)
            assert lib.libraw_get_color_maximum(handle) == 1023
            assert lib.libraw_unpack(handle) == 0 and lib.libraw_dcraw_process(handle) == 0
            rendered = str(Path(scratch) / (name + ".ppm"))
            assert lib.libraw_dcraw_ppm_tiff_writer(handle, rendered.encode()) == 0
            with Image.open(rendered) as image:
                image.load()
                assert image.size == jpg.size
            gains = [lib.libraw_get_cam_mul(handle, i) for i in range(3)]
            intended = expected["asShotGains"] or {"red": 1, "green": 1, "blue": 1}
            assert abs(gains[0] / gains[1] - intended["red"] / intended["green"]) < 1e-4
            assert abs(gains[2] / gains[1] - intended["blue"] / intended["green"]) < 1e-4
        finally:
            lib.libraw_close(handle)
        report["checks"].append({"fixture": name, "exactRawCodes": True, "metadataAndTwoXmlReaders": True,
                                "jpegDecode": True, "librawUnpackAndRender": True, "librawOrientationAndWb": True})
        print(name + ": exact CFA codes/metadata, JPEG, two XML readers, LibRaw orientation/WB/render pass")
assert len(set(all_ids)) == len(all_ids)
assert len(set(raw_ids)) == 1  # Same physical/noise realization across controlled orientation/WB variants.
(root / "independent-validation.json").write_text(json.dumps(report, indent=2) + "\n")
print("Adobe and browser checks remain pending; independent checks do not substitute for them.")
