# SPDX-License-Identifier: Apache-2.0
"""Owned finite-signal oracle. Exact rational statistics; no engine imports."""
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path


def rational(v):
    # The reference qualifies the actual binary64 inputs, not their decimal spellings.
    return Fraction.from_float(float(v))


def difference(name, before, after, bounds=None):
    delta = [rational(a) - rational(b) for a, b in zip(after, before)]
    rms_squared = sum(d*d for d in delta) / len(delta)
    expected = {"meanSignedDifferenceRelativeLuminance": float(sum(delta) / len(delta)),
                "rmsDifferenceRelativeLuminance": math.sqrt(float(rms_squared)) if rms_squared else 0,
                "maximumAbsoluteDifferenceRelativeLuminance": float(max(abs(d) for d in delta))}
    # A tiny RMS can be representable even when its square cannot be: take the
    # rational square root with decimal arithmetic rather than rounding variance to float.
    if rms_squared:
        from decimal import Decimal, localcontext
        with localcontext() as context:
            context.prec = 100
            expected["rmsDifferenceRelativeLuminance"] = float((Decimal(rms_squared.numerator) / Decimal(rms_squared.denominator)).sqrt())
    excursions = None
    if bounds:
        lo, hi = map(rational, bounds)
        excursions = {}
        for prefix, samples in [("before", before), ("after", after)]:
            values = list(map(rational, samples))
            excursions[prefix+"BelowRangeCount"] = sum(v < lo for v in values)
            excursions[prefix+"AboveRangeCount"] = sum(v > hi for v in values)
            excursions[prefix+"MaximumUndershootRelativeLuminance"] = float(max([lo-v for v in values if v < lo] or [0]))
            excursions[prefix+"MaximumOvershootRelativeLuminance"] = float(max([v-hi for v in values if v > hi] or [0]))
    expected["rangeExcursions"] = excursions
    return {"name": name, "before": before, "after": after, "bounds": bounds, "expected": expected}


def noise(name, frames):
    columns = list(zip(*frames))
    means = [sum(map(rational, site))/len(site) for site in columns]
    variances = [sum((rational(v)-mean)**2 for v in site)/(len(site)-1) for site, mean in zip(columns, means)]
    pooled = sum(variances)/len(columns)
    return {"name": name, "frames": frames, "expected": {
        "frameCount": len(frames), "siteCount": len(columns),
        "meanRelativeLuminance": float(sum(means)/len(means)),
        "meanTemporalSampleVarianceRelativeLuminanceSquared": float(pooled),
        "temporalRmsRelativeLuminance": math.sqrt(float(pooled)),
        "perSiteMeansRelativeLuminance": list(map(float, means)),
        "perSiteSampleVariancesRelativeLuminanceSquared": list(map(float, variances))}}


record = {"protocolVersion": "0.1.0", "referenceBackend": "Python standard-library exact Fraction arithmetic and 100-digit Decimal square root",
          "rights": "Photivra-owned Apache-2.0 draft finite signals and reference",
          "difference": [
              difference("identity", [0, .2, .8, 1], [0, .2, .8, 1], [0, 1]),
              difference("step-overshoot", [.2, .2, .8, .8], [.2, .1, .9, .8], [.2, .8]),
              difference("existing-source-excursions", [-.2, .1, 1.2, .8], [-.1, .1, 1.1, .8], [0, 1]),
              difference("signed-cancellation", [0, 0, 0, 0], [1e16, 1, -1e16, 1]),
              difference("tiny-rms", [0, 0, 0, 0], [1e-300, -1e-300, 1e-300, -1e-300]),
              difference("small-change-large-dc", [1e16, 1e16, 1e16, 1e16], [1e16+2, 1e16+4, 1e16-2, 1e16-4])],
          "noise": [
              noise("zero", [[0, 0, 0, 0]]*3),
              noise("spatial-texture-is-not-temporal-noise", [[.1, .2, .8, .9]]*3),
              noise("signed-independent-repeats", [[-2, 2, 5, 0], [-1, 3, 3, 2], [0, 4, 4, 1], [1, 5, 2, -1]]),
              noise("large-dc-nonrepresentable-mean", [[1e16+2]*4, [1e16+4]*4]),
              noise("signed-large-cancellation-mean", [[1e16]*4, [1]*4, [-1e16]*4, [1]*4]),
              noise("tiny-variance", [[1e-150]*4, [-1e-150]*4]),
              noise("asymmetric-site-variances", [[1, 0, 0, 0], [1, 1, 2, 4], [1, 2, 4, 8]])]}
text = json.dumps(record, indent=2, allow_nan=False) + "\n"
Path(__file__).with_name("statistics-reference.json").write_text(text)
print(hashlib.sha256(text.encode()).hexdigest())
