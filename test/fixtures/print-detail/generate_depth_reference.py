# SPDX-License-Identifier: Apache-2.0
"""Owned paraxial pupil / constant-visible plane reference; no engine imports.

Finite pupil DFT truth is not a continuum-optics convergence certificate. Lens,
sensor, reconstruction, correction and changing occlusion are not calibrated.
"""
import cmath
import json
import math
from pathlib import Path

cases = []
for depth in (2, 5, 10):
    for aperture in (8, 16, 32):
        n, center, wavelength_mm = 9, 4, .0005
        focus_image_mm = 1 / (1 / 50 - 1 / 5000)
        object_image_mm = 1 / (1 / 50 - 1 / (depth * 1000))
        radius = 50 / (2 * aperture)
        pitch = radius / center
        pupil = []
        for y in range(n):
            for x in range(n):
                r2 = ((x - center) * pitch)**2 + ((y - center) * pitch)**2
                opd_mm = r2 / 2 * (1 / focus_image_mm - 1 / object_image_mm)
                pupil.append(cmath.exp(2j * math.pi * opd_mm / wavelength_mm) if r2 <= radius**2 else 0j)
        intensity = []
        for ky in range(-center, center + 1):
            for kx in range(-center, center + 1):
                amplitude = sum(pupil[y*n+x] * cmath.exp(-2j * math.pi * (kx*(x-center)+ky*(y-center))/n)
                    for y in range(n) for x in range(n))
                intensity.append(abs(amplitude)**2)
        energy = sum(intensity)
        kernel = [v / energy for v in intensity]
        image_pitch_mm = wavelength_mm * focus_image_mm / (n * pitch)
        transfer = sum(w * cmath.exp(-2j * math.pi * 25 * (i % n - center) * image_pitch_mm) for i, w in enumerate(kernel))
        cases.append(dict(subjectDistanceM=depth, apertureFNumber=aperture, expectedKernel=kernel,
            imageSamplePitchMm=image_pitch_mm, expectedModulation=.5 * abs(transfer)))
record = dict(schemaVersion="0.1.0", ownership="photivra-owned", reference="independent finite scalar Fraunhofer pupil DFT",
    domain=dict(focalLengthMm=50, focusDistanceM=5, wavelengthNm=500, pupilGrid=9, frequencyCyclesPerMm=25,
        visibility="nearest frontoparallel plane, interior ROI with whole finite PSF support on one surface",
        optics="paraxial ideal circular pupil with explicit quadratic wavefront; no blur-diameter PSF"),
    qualification="bounded computational source and finite propagation only; no physical device or continuum convergence qualification",
    cases=cases)
Path(__file__).with_name("depth-backend-reference.json").write_text(json.dumps(record, indent=2) + "\n")
