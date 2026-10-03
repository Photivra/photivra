# SPDX-License-Identifier: Apache-2.0
# Model coefficients from castleCSF, Copyright (c) 2023 Graphics and Displays
# group - University of Cambridge. MIT terms: docs/licenses/castleCSF-MIT.txt.
"""Independent 80-digit scalar evaluation of the pinned static D65 model equations."""
from decimal import Decimal, localcontext
import hashlib
import json
from pathlib import Path

D = Decimal
PI = D("3.14159265358979323846264338327950288419716939937510582097494459230781640628620899")


def dependency(parameters, luminance):
    p = list(map(D, parameters))
    if len(p) == 2:
        return p[1] * luminance**p[0]
    value = p[0] * (1 + p[1]/luminance)**(-p[2])
    return value if len(p) == 3 else value*(1-(1+p[3]/luminance)**(-p[4]))


def response(frequency, maximum, peak_frequency, bandwidth, floor, a0, f0):
    # Direct decimal powers and rational area term, independently of the engine's
    # binary64 log1p/expm1 evaluation. All input parameters are the pinned decimals.
    parabola = D(10)**(-((frequency/peak_frequency).log10()**2)/(D(2)**D(bandwidth)))
    if frequency < peak_frequency:
        parabola = max(parabola, D(floor))
    critical_area = D(a0)/(1+(frequency/D(f0))**2)
    area = PI*D("1.5")**2
    return maximum*parabola*(critical_area*area/(area+critical_area)).sqrt()*frequency


def sensitivity(luminance, frequency):
    sustained = response(frequency, dependency(["56.4947", "7.54726", ".144532", "5.58341e-7", "9.66862e9"], luminance),
                         dependency(["1.78119", "91.5718", ".256682"], luminance), ".000213047", str(1-D(".100207")), "157.103", ".702338")
    transient = response(frequency, dependency([".193434", "2748.09"], luminance), D(".000316696"), "2.6761", str(1-D(".000241177")), "3.81611", "3.01389")
    temporal_peak = luminance.log10()*D("2.41482")+D("4.7036")
    achromatic = sustained+transient*(-(temporal_peak**D(".1898"))**2/D(".0844836")).exp()
    red_green = response(frequency, dependency(["681.434", "38.0038", ".480386"], luminance), D(".0178364"), "2.42104", "1", "2816.44", ".0711058")
    yellow_violet = response(frequency, dependency(["166.683", "62.8974", ".41193"], luminance), D(".00425753"), "2.68197", "1", "2.82789e7", ".000635093")
    opponent_rg = abs(D(".6991")-D("2.3112")*D(".3009"))
    opponent_yv = abs(-D(".6991")-D(".3009")+D("50.9875")*D(".0198"))
    return (achromatic**2+(opponent_rg*red_green)**2+(opponent_yv*yellow_violet)**2).sqrt()


cases = []
with localcontext() as context:
    context.prec = 80
    for luminance in [1, 10, 50, 100, 1000]:
        for frequency in [.25, .5, 1, 2, 4, 8, 16]:
            result = sensitivity(D(str(luminance)), D(str(frequency)))
            cases.append({"meanLuminanceCdPerSquareMeter": luminance, "spatialFrequencyCyclesPerDegree": frequency,
                          "contrastSensitivity": float(result), "thresholdModulationMichelson": float(1/result)})
record = {"protocolVersion": "0.1.0", "upstreamRevision": "f4b0b722af83001d7af979281e06ca642d36e4e8",
          "referenceBackend": "Python standard-library Decimal, precision 80, independently evaluated scalar model equations",
          "source": "castleCSF numerical model under MIT; original adapter/reference under Apache-2.0",
          "conditions": {"stimulus": "static D65 equal-fraction LMS Gabor", "gaussianEnvelopeSigmaDegrees": 1.5,
                         "temporalFrequencyHz": 0, "eccentricityDegrees": 0},
          "qualification": "numerical model conformance only; no new empirical or individual observer qualification",
          "cases": cases}
text = json.dumps(record, indent=2) + "\n"
Path(__file__).with_name("contrast-reference.json").write_text(text)
print(hashlib.sha256(text.encode()).hexdigest())
