# SPDX-License-Identifier: Apache-2.0

"""Optional repository-only QA with existing Pillow, lxml and LibRaw installs.
None is added to the engine or its dependency manifest.
Usage: python scripts/verify-photographic-export-fixtures.py OUTPUT_DIRECTORY
"""
import ctypes as c
from ctypes.util import find_library
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
from xml.dom import minidom
from PIL import Image, TiffImagePlugin

try:
    from lxml import etree
except ImportError:
    etree = None


def xmp_attributes(packet):
    description = minidom.parseString(packet).getElementsByTagName("rdf:Description")[0]
    fields = {(a.namespaceURI, a.localName): a.value
              for a in description.attributes.values()
              if a.namespaceURI != "http://www.w3.org/2000/xmlns/"}
    if etree is not None:
        parsed = etree.fromstring(packet)
        node = parsed.find(".//{http://www.w3.org/1999/02/22-rdf-syntax-ns#}Description")
        independent = {}
        for key, value in node.attrib.items():
            namespace, local = key[1:].split("}", 1) if key.startswith("{") else (None, key)
            independent[(namespace, local)] = value
        assert independent == fields
    return fields


def verify_pair(root, name):
    expected = json.loads((root / (name + ".json")).read_text())
    raw = (root / (name + ".dng")).read_bytes()
    width, height = expected["nativeWidth"], expected["nativeHeight"]
    stream = io.BytesIO(raw)
    tags = TiffImagePlugin.ImageFileDirectory_v2(raw[:8])
    stream.seek(8)
    tags.load(stream)
    assert (tags[256], tags[257]) == (width, height)
    assert tags[262] == 32803 and tags[258] == (16,) and tags[259] == 1
    assert list(struct.unpack_from("<" + str(len(expected["codes"])) + "H", raw, tags[273][0])) == expected["codes"]
    assert tags[33422] == bytes([0, 1, 1, 2]) and tags[50706] == bytes([1, 1, 0, 0])
    assert tuple(tags[50714]) == (64, 64, 64, 64) and tags[50717] == 1023
    assert tags[50829] == (0, 0, height, width) and tags[50719] == (0, 0) and tags[50720] == (width, height)
    assert tags[271] == "Photivra" and tags[272] == "Photivra Virtual Camera"
    assert len(tags[50781]) == 16
    raw_xmp = xmp_attributes(tags[700])
    jpg = Image.open(root / (name + ".jpg"))
    jpg.load()
    assert jpg.size == (width, height) and jpg.getexif()[274] == 1
    assert jpg.getexif().get_ifd(34665)[36867] == "2026:10:01 19:00:00"
    jpeg_xmp = xmp_attributes(jpg.info["xmp"])
    ns = "https://photivra.com/ns/simulation/1.0/"
    assert raw_xmp[(ns, "SimulationHash")] == jpeg_xmp[(ns, "SimulationHash")] == expected["hash"]
    assert raw_xmp[(ns, "CaptureID")] == jpeg_xmp[(ns, "CaptureID")]
    assert "digitalCreation" in raw_xmp[("http://iptc.org/std/Iptc4xmpExt/2008-02-29/", "DigitalSourceType")]
    ids = [values[("http://ns.adobe.com/xap/1.0/mm/", key)]
           for values in (raw_xmp, jpeg_xmp) for key in ("DocumentID", "InstanceID")]
    assert len(set(ids)) == 4
    pixels = [component for pixel in jpg.get_flattened_data() for component in pixel]
    assert len(pixels) == len(expected["rgb"])
    assert max(abs(a-b) for a, b in zip(expected["rgb"], pixels)) <= 2
    assert hashlib.sha256(raw).hexdigest() == expected["dngHash"]
    assert hashlib.sha256((root / (name + ".jpg")).read_bytes()).hexdigest() == expected["jpegHash"]
    print(name + ": TIFF/exact strip, JPEG/EXIF, XMP attributes and hashes pass")


def verify_libraw(filename):
    # Documented opaque-handle C API; no version-specific struct/pointer offsets.
    # https://www.libraw.org/docs/API-C.html
    library = find_library("raw")
    if not library:
        print("LibRaw not installed: RAW rendering check pending")
        return
    lib = c.CDLL(library)
    lib.libraw_version.restype = c.c_char_p
    lib.libraw_init.argtypes, lib.libraw_init.restype = [c.c_uint], c.c_void_p
    lib.libraw_close.argtypes = [c.c_void_p]
    lib.libraw_open_file.argtypes, lib.libraw_open_file.restype = [c.c_void_p, c.c_char_p], c.c_int
    for name in ("unpack", "get_raw_width", "get_raw_height", "dcraw_process", "get_color_maximum"):
        function = getattr(lib, "libraw_" + name)
        function.argtypes, function.restype = [c.c_void_p], c.c_int
    handle = lib.libraw_init(0)
    assert handle
    try:
        assert lib.libraw_open_file(handle, str(filename).encode()) == 0
        assert (lib.libraw_get_raw_width(handle), lib.libraw_get_raw_height(handle)) == (64, 64)
        assert lib.libraw_get_color_maximum(handle) == 1023
        assert lib.libraw_unpack(handle) == 0
        assert lib.libraw_dcraw_process(handle) == 0
        print("LibRaw " + lib.libraw_version().decode() + ": 64x64 DNG opens, unpacks and processes")
    finally:
        lib.libraw_close(handle)


root = Path(sys.argv[1])
for name in ("reference", "chart"):
    verify_pair(root, name)
verify_libraw(root / "chart.dng")
print("XMP checked with DOM/Expat" + (" and lxml/libxml2" if etree is not None else "; lxml unavailable"))
print("2x2 is a strip regression fixture; LibRaw rejects that size. Adobe acceptance and production origin remain pending.")
