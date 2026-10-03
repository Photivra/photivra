# SPDX-License-Identifier: Apache-2.0
"""Independent finite-PSF transfer and analytic aperture integration; no engine."""
import cmath
import hashlib
import json
import math
from pathlib import Path

kernels = {
    "identity": [(0, 0, 1)],
    "horizontal": [(-1, 0, .25), (0, 0, .5), (1, 0, .25)],
    "isotropic": [(0, -1, .125), (-1, 0, .125), (0, 0, .5), (1, 0, .125), (0, 1, .125)],
    "asymmetric": [(0, 0, .25), (1, 0, .25), (0, 1, .5)]}


def midpoint_transfer(frequency, span, n):
    # Closed geometric-series magnitude, not an image convolution or Fourier fit.
    if frequency == 0:
        return 1
    theta = math.pi * frequency * span
    return math.sin(theta) / (n * math.sin(theta / n))


def sinc(x):
    return math.sin(math.pi*x)/(math.pi*x) if x else 1


cases = []
for kind, taps in kernels.items():
    for fx, fy in [(0.25, 0), (0, .25), (.25, .25)]:
        transfer = abs(sum(w*cmath.exp(2j*math.pi*(-fx*x+fy*y)) for x, y, w in taps))
        for phase in [0, .37]:
            for n in [1, 2, 4, 8]:
                aperture = midpoint_transfer(fx, .8, n)*midpoint_transfer(fy, .6, n)
                cases.append({"kernel": kind, "frequencyCyclesPerMm": {"x": fx, "y": fy}, "phaseRadians": phase,
                              "spatialSampleCount": n, "expectedMean": 1,
                              "expectedModulation": .5*transfer*aperture,
                              "continuousApertureModulation": .5*transfer*sinc(fx*.8)*sinc(fy*.6)})
record = {"protocolVersion": "0.1.0", "rights": "Photivra-owned Apache-2.0 draft kernels/target/reference",
          "sourceDomain": "wavelength-constant nonnegative spectral irradiance over 400..500 vacuum nm; normalized by 100 nm",
          "raster": {"pixelWidth": 8, "pixelHeight": 8}, "imagingAreaMm": {"width": 8, "height": 8},
          "sitePitchMm": 1, "apertureMm": {"width": .8, "height": .6}, "kernelPitchMm": 1,
          "referenceBackend": "Python complex finite-kernel frequency response and closed-form midpoint/continuous aperture transfer",
          "domainLimitation": "known finite local kernels, full analytic source support, no real lens/diffraction/defocus or scene/provider qualification",
          "cases": cases}
text = json.dumps(record, indent=2) + "\n"
Path(__file__).with_name("psf-backend-reference.json").write_text(text)
print(hashlib.sha256(text.encode()).hexdigest())
