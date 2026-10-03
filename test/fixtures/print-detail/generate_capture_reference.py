# SPDX-License-Identifier: Apache-2.0
"""Independent SI source-to-photo truth for an owned flat-band scene variant.

No engine imports. Ideal thin lens, unity pupil magnification, constant spectral
radiance/transmission/QE, fixed geometric rectangle, midpoint wavelength 550nm.
This certifies arithmetic on the declared model, not real optical calibration.
"""
from decimal import Decimal as D, localcontext
import json
from pathlib import Path

with localcontext() as context:
    context.prec = 80
    pi = D("3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986")
    focal, distance, aperture, transmission = D(50), D(5000), D(4), D(".85")
    image = 1 / (1 / focal - 1 / distance)
    working = aperture * (1 + image / distance)
    radiance = D("1e-8")
    duration, area, band, wavelength, qe = D(".008"), D(800) * D(600) * D("1e-12"), D(20), D("550e-9"), D(".4")
    electrons = radiance * pi * transmission / (4 * working * working) * area * duration * band * wavelength * qe / (D("6.62607015e-34") * D(299792458))
    cases = [dict(radianceScale=float(scale), expectedPhotoElectrons=float(electrons * scale),
        expectedDarkElectrons=float(D(4) * duration)) for scale in (D(".5"), D(1), D(2), D(4))]
record = dict(schemaVersion="0.1.0", ownership="photivra-owned", source="generate_capture_reference.py",
    stimulus="bounded flat-band uniform-radiance variant of the existing basic reference; no additional chart family",
    domain=dict(sourceRadianceWattsPerSquareMeterSteradianNanometer=1e-8, wavelengthRangeNanometers=[540,560], midpointWavelengthNanometers=550,
        sensorApertureMicrometers=[800,600], qe=.4, exposureSeconds=.008, focalLengthMm=50, focusDistanceM=5, apertureFNumber=4,
        opticalTransmission=.85, darkCurrentElectronsPerSecond=4, nativeRaster=[2,2], psf="explicitly omitted",
        visibility="uniform environment with no occlusion", backend="public production environment-capture and processed-output path",
        qualification="bounded computational SI conformance, no real scene/device calibration"), cases=cases)
Path(__file__).with_name("capture-backend-reference.json").write_text(json.dumps(record,indent=2)+"\n")
