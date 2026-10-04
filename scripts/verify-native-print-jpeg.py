# SPDX-License-Identifier: Apache-2.0
"""Independent NumPy area integral, Pillow JPEG decode and LittleCMS ICC conversion."""
import hashlib, io, json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageCms

folder = Path(sys.argv[1])
manifest = json.loads((folder / 'manifest.json').read_text())
icc = (folder / 'srgb.icc').read_bytes()
assert hashlib.sha256(icc).hexdigest() == manifest['iccSha256']
profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
assert ImageCms.getProfileDescription(profile).strip() == 'Photivra sRGB matrix/TRC v4'
results = []
for case in manifest['cases']:
    spec = case['spec']; w, h = spec['width'], spec['height']
    yy, xx = np.indices((h, w))
    if spec['pattern'] == 'checker':
        source = np.repeat(((xx + yy) % 2 * 255)[..., None], 3, axis=2).astype(np.uint8)
    elif spec['pattern'] == 'gray':
        source = np.repeat(xx[..., None], 3, axis=2).astype(np.uint8)
    else:
        source = np.stack([np.floor(xx / (w - 1) * 255 + .5), np.floor(yy / (h - 1) * 255 + .5), (xx + yy) % 2 * 255], axis=2).astype(np.uint8)
    assert hashlib.sha256(source.tobytes()).hexdigest() == case['input']['source']['sha256']
    crop = spec['crop']; ow, oh = spec['outputWidth'], spec['outputHeight']
    if (ow, oh) == (crop['width'], crop['height']):
        expected = source[crop['y']:crop['y'] + oh, crop['x']:crop['x'] + ow].astype(np.int16)
    else:
        v = source.astype(np.float64) / 255
        linear = np.where(v <= .04045, v / 12.92, ((v + .055) / 1.055) ** 2.4)
        output = np.zeros((oh, ow, 3))
        dx, dy = crop['width'] / ow, crop['height'] / oh
        for y in range(oh):
            top, bottom = crop['y'] + y * dy, crop['y'] + (y + 1) * dy
            for x in range(ow):
                left, right = crop['x'] + x * dx, crop['x'] + (x + 1) * dx
                for sy in range(math.floor(top), min(h, math.ceil(bottom))):
                    for sx in range(math.floor(left), min(w, math.ceil(right))):
                        weight = max(0, min(right, sx + 1) - max(left, sx)) * max(0, min(bottom, sy + 1) - max(top, sy)) / (dx * dy)
                        output[y, x] += linear[sy, sx] * weight
        encoded = np.where(output <= .0031308, 12.92 * output, 1.055 * output ** (1 / 2.4) - .055)
        expected = np.floor(np.clip(encoded, 0, 1) * 255 + .5).astype(np.int16)
    path = folder / (spec['id'] + '.jpg'); data = path.read_bytes()
    assert hashlib.sha256(data).hexdigest() == case['jpegSha256']
    with Image.open(path) as image:
        assert image.format == 'JPEG' and image.size == (ow, oh)
        assert image.info['icc_profile'] == icc
        assert image.getexif()[274] == 1
        exif = image.getexif().get_ifd(34665)
        assert (exif[40962], exif[40963], exif[40961]) == (ow, oh, 1)
        decoded = np.asarray(image.convert('RGB'), dtype=np.int16)
    error = np.abs(decoded - expected)
    assert int(error.max()) <= 4, (spec['id'], int(error.max()))
    if spec['id'] == 'linear-area-checker':
        assert np.all(expected == 188), 'Linear area filtering must not average encoded values to 128'
    results.append(dict(id=spec['id'], maximumCodeError=int(error.max()), meanCodeError=float(error.mean()), jpegSha256=case['jpegSha256']))

# Independent color manager compares a 17^3 color cube, including saturated endpoints.
codes = np.floor(np.linspace(0, 255, 17) + .5).astype(np.uint8)
cube = np.stack(np.meshgrid(codes, codes, codes, indexing='ij'), axis=-1).reshape(1, -1, 3)
image = Image.fromarray(cube)
converted = ImageCms.profileToProfile(image, profile, ImageCms.createProfile('sRGB'), outputMode='RGB', renderingIntent=1)
icc_error = int(np.abs(np.asarray(converted, dtype=np.int16) - cube.astype(np.int16)).max())
assert icc_error <= 1, icc_error
report = dict(results=results, jpegCodeTolerance=4, iccCubeSamples=17 ** 3, maximumIccCodeError=icc_error,
              manifestSha256=hashlib.sha256((folder / 'manifest.json').read_bytes()).hexdigest(),
              validatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), scope=manifest['scope'])
report['pass'] = True
Path(sys.argv[2]).write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'pass': True, 'cases': len(results), 'maximumJpegCodeError': max(r['maximumCodeError'] for r in results), 'maximumIccCodeError': icc_error}))
