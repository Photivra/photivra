# SPDX-License-Identifier: Apache-2.0
"""Independent finite DFT and continuous complex-pupil autocorrelation pilot.

No engine imports. Analytic ideal circular pupil with quadratic defocus only.
This tests one declared spatial frequency, not all frequencies or real lenses.
"""
import cmath
import json
import math
from pathlib import Path

cases = []
z = 1 / (1 / 50 - 1 / 5000)
wavelength_mm, frequency = .0005, 25
for depth in (2, 5, 10):
    for aperture in (8, 16, 32):
        radius = 50 / (2 * aperture)
        object_z = 1 / (1 / 50 - 1 / (depth * 1000))
        alpha = math.pi * (1 / z - 1 / object_z) / wavelength_mm
        displacement = wavelength_mm * z * frequency
        nu = displacement / (2 * radius)

        # OTF = normalized overlap integral of shifted complex pupils. The
        # quadratic phase difference is linear in x. Substitution u=cos(theta)
        # removes the circular-boundary square-root endpoint for Simpson.
        def continuous(intervals):
            end = math.acos(nu)
            h = end / intervals
            def integrand(theta):
                return math.sin(theta)**2 * math.cos(2 * alpha * displacement * radius * (math.cos(theta) - nu))
            return 4 / math.pi * h / 3 * (integrand(0) + integrand(end) + sum(
                (4 if i % 2 else 2) * integrand(i * h) for i in range(1, intervals)))

        coarse, fine = continuous(4096), continuous(16384)
        analytic_focus = 2 / math.pi * (math.acos(nu) - nu * math.sqrt(1 - nu * nu))
        grids = [(9, 4, "unpadded-historical-finite-reference")] + [
            (4 * r + 1, r, "padded-pupil-pilot") for r in (2, 4, 8, 15)]
        for n, radius_samples, role in grids:
            center = (n - 1) // 2
            pitch = radius / radius_samples
            pupil = [[cmath.exp(1j * alpha * ((x - center)**2 + (y - center)**2) * pitch**2)
                if (x - center)**2 + (y - center)**2 <= radius_samples**2 else 0j
                for x in range(n)] for y in range(n)]
            # Factored two-dimensional complex DFT, independently arranged from
            # the backend's direct two-dimensional sums.
            roots = [[cmath.exp(-2j * math.pi * k * (x - center) / n) for x in range(n)] for k in range(-center, center + 1)]
            horizontal = [[sum(a * b for a, b in zip(row, root)) for root in roots] for row in pupil]
            column_energy = [sum(abs(sum(horizontal[y][kx] * roots[ky][y] for y in range(n)))**2
                for ky in range(n)) for kx in range(n)]
            image_pitch = wavelength_mm * z / (n * pitch)
            transfer = abs(sum(w * cmath.exp(-2j * math.pi * frequency * (i - center) * image_pitch)
                for i, w in enumerate(column_energy)) / sum(column_energy))
            cases.append(dict(subjectDistanceM=depth, apertureFNumber=aperture, gridSamples=n,
                pupilRadiusSamples=radius_samples, role=role, expectedFiniteTransfer=transfer,
                expectedContinuousTransfer=abs(fine), continuousReferenceDelta=abs(coarse - fine),
                analyticFocusedTransfer=analytic_focus if depth == 5 else None))

record = dict(schemaVersion="0.1.0", ownership="photivra-owned",
    reference="independent factored finite DFT and continuous shifted-pupil overlap integral",
    domain=dict(focalLengthMm=50, focusDistanceM=5, wavelengthNm=500, frequencyCyclesPerMm=25,
        subjectDistancesM=[2, 5, 10], apertureFNumbers=[8, 16, 32],
        optics="ideal paraxial circular field-invariant pupil, explicit quadratic wavefront",
        continuousQuadratureIntervals=[4096, 16384]),
    protocol="Pilot exposes pupil-phase and intensity sampling errors; convergence need not be monotonic. Final padded 61x61/15-radius-sample transfer error below 0.01 at this frequency is a candidate computational criterion, not optical calibration or a print verdict.",
    cases=cases)
Path(__file__).with_name("pupil-convergence-reference.json").write_text(json.dumps(record, indent=2) + "\n")
