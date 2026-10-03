# SPDX-License-Identifier: Apache-2.0
"""Independent exact arithmetic for owned charge-injection readout experiments.

These electronic references do not certify source radiometry or sensor luminance.
No engine imports or seeded runtime output enters the expected values.
"""
from fractions import Fraction as F
from decimal import Decimal, localcontext
import json
from pathlib import Path

cases = []
for name, capacity, pre_adc, gain, levels in (
    ("storage-limit", 64, 2000, F(1, 4), [F(511, 8), 64, F(513, 8), 200]),
    ("pre-adc-limit", 2000, 64, F(1, 4), [F(511, 8), 64, F(513, 8), 200]),
    ("digital-limit", 2000, 2000, F(1, 4), [F(7165, 8), F(3583, 4), F(7167, 8), 1000]),
    ("quantization-without-clipping", 2000, 2000, F(1, 4), [F(1, 16), F(1, 8), F(3, 16), F(3, 8)]),
):
    levels = list(map(F, levels))
    stored = [min(v, F(capacity)) for v in levels]
    analog = [min(v, F(pre_adc)) for v in stored]
    quantized = [(v / gain + 512 + F(1, 2)).numerator // (v / gain + 512 + F(1, 2)).denominator for v in analog]
    codes = [max(0, min(v, 4095)) for v in quantized]
    decoded = [(F(v)-512)*gain for v in codes]
    pairs = []
    for stage, before, after in (("storage", levels, stored), ("pre-adc", stored, analog), ("adc", analog, decoded)):
        differences = [(b-a)/100 for a,b in zip(before,after)]
        mean, square = sum(differences)/4, sum(v*v for v in differences)/4
        with localcontext() as context:
            context.prec = 80
            rms = (Decimal(square.numerator)/Decimal(square.denominator)).sqrt()
        pairs.append(dict(stage=stage, before=[float(v/100) for v in before], after=[float(v/100) for v in after],
            meanDifference=float(mean), rmsDifference=float(rms), maximumDifference=float(max(abs(v) for v in differences))))
    cases.append(dict(name=name, capacityElectrons=capacity, preAdcElectronEquivalent=pre_adc, conversionGainElectronsPerCode=float(gain),
        injectedElectronEquivalents=list(map(float,levels)), expectedStored=list(map(float,stored)), expectedPreAdc=list(map(float,analog)),
        expectedRawCodes=codes, expectedPhysicalClipping=[v>capacity for v in levels], expectedPreAdcClipping=[v>pre_adc for v in stored],
        expectedDigitalClipping=[v>4095 for v in quantized], pairs=pairs))
record=dict(schemaVersion="0.1.0", ownership="photivra-owned", source="generate_readout_reference.py",
    domain=dict(signal="declared deterministic charge injection; conditional neutral scalar diagnostic scaled by 100 electrons per relative unit",
        noise="zero photo/dark expectations and zero read noise for exact stage isolation", adcBitDepth=12, blackLevelCode=512,
        codeTransfer="round-half-up, final unsigned clamp", scientificStatus="owned electronic model conformance, not physical photometric calibration"), cases=cases)
Path(__file__).with_name("readout-backend-reference.json").write_text(json.dumps(record,indent=2)+"\n")
