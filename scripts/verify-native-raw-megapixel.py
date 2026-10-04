# SPDX-License-Identifier: Apache-2.0
"""Independently decode actual same-RAW SDR → 2x2 area-filtered JPEG output."""
import gzip, hashlib, io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageCms
path = Path(sys.argv[1])
report = json.loads(path.read_text())
samples = gzip.decompress(Path(str(path) + '.rgb.gz').read_bytes())
assert hashlib.sha256(samples).hexdigest() == report['sdrSamplesSha256']
source = np.frombuffer(samples, dtype=np.uint8).reshape(1000, 1000, 3)
v = source.astype(np.float64) / 255
linear = np.where(v <= .04045, v / 12.92, ((v + .055) / 1.055) ** 2.4)
area = linear.reshape(500, 2, 500, 2, 3).mean(axis=(1, 3))
encoded = np.where(area <= .0031308, 12.92 * area, 1.055 * area ** (1 / 2.4) - .055)
expected = np.floor(encoded * 255 + .5).astype(np.int16)
data = Path(str(path) + '.jpg').read_bytes()
assert hashlib.sha256(data).hexdigest() == report['jpegSha256']
with Image.open(io.BytesIO(data)) as image:
    assert image.size == (500, 500)
    assert image.getexif()[274] == 1
    assert image.getexif().get_ifd(34665)[40961] == 1
    profile = ImageCms.ImageCmsProfile(io.BytesIO(image.info['icc_profile']))
    assert ImageCms.getProfileDescription(profile).strip() == 'Photivra sRGB matrix/TRC v4'
    decoded = np.asarray(image.convert('RGB'), dtype=np.int16)
error = int(np.abs(decoded - expected).max())
assert error <= 4, error
result = dict(pass_=True, maximumJpegCodeError=error, outputPixels=250000,
              sourceSamplesSha256=report['sdrSamplesSha256'], jpegSha256=report['jpegSha256'],
              validatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              scope='Independent actual JPEG/EXIF/ICC and linear area filtering of retained same-RAW integer SDR; RAW generation and reconstruction are qualified separately.')
result['pass'] = result.pop('pass_')
Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
