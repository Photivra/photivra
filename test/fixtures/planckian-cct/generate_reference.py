# SPDX-License-Identifier: Apache-2.0
"""50-digit reference CCT/Duv for the engine's default Planckian locus (owned, standard library only).

The default locus is a discrete sum: X(T) = sum_i wx_i / (exp(a_i / T) - 1), likewise Y and Z, with
a_i = c2 / lambda_i and wx_i = (1 nm) * xbar(lambda_i) * lambda_i^-5 from the engine's analytic CMF
fit on 1 nm nodes, 360-830 nm. This script reads those per-node constants from the built package
(exact doubles, via node), so the reference is for exactly the engine's model, and then, in 50-digit
decimal arithmetic:

1. evaluates the squared CIE 1960 uv distance F densely (41 points, +/-2e-6 of T) around a coarse
   candidate and checks that the smallest value is inside the window (the minimum is bracketed);
2. solves dF/dx = 0 (x = 1/T) by Newton's method with analytic derivatives of Planck's law,
   dr/dx = -a(r + r^2), d2r/dx2 = a^2(r + 3r^2 + 2r^3) for r = 1/(exp(ax) - 1);
3. reports T = 1/x and the signed distance along the above-locus normal (Duv).

Usage: npm run build && python3 -I test/fixtures/planckian-cct/generate_reference.py
Writes reference.json next to this file.
"""
import json
import subprocess
from decimal import Decimal as D, getcontext
from pathlib import Path

getcontext().prec = 50
folder = Path(__file__).parent
root = folder.parents[2]

EXPORT = r"""
import { pathToFileURL } from "node:url";
const dist = pathToFileURL(process.argv[1] + "/dist/").href;
const cmfMod = await import(dist + "color/color-matching-functions.js");
const ill = await import(dist + "color/illuminants.js");
const cmf = cmfMod.prepareColorMatchingFunctions({ kind: "analytic-cie-1931-multi-lobe-fit" });
const unit = cmfMod.prepareColorimetricSpectrum({ kind: "function", wavelengthRangeNanometers: cmf.wavelengthRangeNanometers, evaluate: () => 1 });
const nodes = Array.from({ length: 471 }, (_, i) => ({ wavelengthNanometers: 360 + i, wavelengthMeasureNanometers: 1 }));
const b = cmfMod.sampleColorimetricBasis(nodes, unit, cmf);
const rows = [];
for (let i = 0; i < 471; i++) {
  const lambda = b.nodes[i].wavelengthNanometers * 1e-9;
  const w = b.weights[i] * (1 / lambda ** 5);
  rows.push([ill.SECOND_RADIATION_CONSTANT_METER_KELVIN / lambda, w * b.xBar[i], w * b.yBar[i], w * b.zBar[i]].map(String));
}
const candidates = JSON.parse(process.argv[2]).map(([x, y]) =>
  String(ill.calculateCorrelatedColorTemperature({ chromaticity: { x, y }, locus: { kind: "planck-analytic-cmf" } }).value.correlatedColorTemperatureKelvin));
process.stdout.write(JSON.stringify({ rows, candidates }));
"""

# Owned test chromaticities (rounded CIE 1931 xy), on and off the locus, 1100 K to 95000 K.
CHROMATICITIES = [
    ["0.6200", "0.3550"], ["0.5850", "0.3930"], ["0.5270", "0.4130"], ["0.4400", "0.3900"],
    ["0.4520", "0.4250"], ["0.3800", "0.3770"], ["0.3450", "0.3300"], ["0.3130", "0.3290"],
    ["0.3100", "0.3000"], ["0.2800", "0.2900"], ["0.2650", "0.2700"], ["0.2550", "0.2500"],
    ["0.2500", "0.2600"], ["0.2480", "0.2440"], ["0.2446", "0.2410"], ["0.2435", "0.2400"],
    ["0.2428", "0.2384"], ["0.2427", "0.2382"], ["0.6380", "0.3480"],
]

exported = json.loads(subprocess.run(
    ["node", "--input-type=module", "-e", EXPORT, str(root), json.dumps([[float(x), float(y)] for x, y in CHROMATICITIES])],
    check=True, capture_output=True, text=True).stdout)
consts = [[D(v) for v in row] for row in exported["rows"]]


def sample(x):
    sx = sy = sz = sx1 = sy1 = sz1 = sx2 = sy2 = sz2 = D(0)
    for a, wx, wy, wz in consts:
        r = 1 / ((a * x).exp() - 1)
        r2 = r * r
        q1 = r + r2
        k1 = -a * q1
        k2 = a * a * (q1 + 2 * r2 * (1 + r))
        sx += wx * r; sy += wy * r; sz += wz * r
        sx1 += wx * k1; sy1 += wy * k1; sz1 += wz * k1
        sx2 += wx * k2; sy2 += wy * k2; sz2 += wz * k2
    den = sx + 15 * sy + 3 * sz
    d1 = sx1 + 15 * sy1 + 3 * sz1
    d2 = sx2 + 15 * sy2 + 3 * sz2
    u = 4 * sx / den
    v = 6 * sy / den
    du = (4 * sx1 - u * d1) / den
    dv = (6 * sy1 - v * d1) / den
    return u, v, du, dv, (4 * sx2 - 2 * du * d1 - u * d2) / den, (6 * sy2 - 2 * dv * d1 - v * d2) / den


cases = []
for (xs, ys), candidate in zip(CHROMATICITIES, exported["candidates"]):
    x0, y0 = D(xs), D(ys)
    den0 = -2 * x0 + 12 * y0 + 3
    tu, tv = 4 * x0 / den0, 6 * y0 / den0
    xc = 1 / D(candidate)
    window = []
    for i in range(-20, 21):
        xi = xc * (1 + D(i) * D("1e-7"))
        u, v, *_ = sample(xi)
        window.append(((u - tu) ** 2 + (v - tv) ** 2, i, xi))
    best = min(window)
    assert -20 < best[1] < 20, "minimum not bracketed"
    x = best[2]
    for _ in range(30):
        u, v, du, dv, d2u, d2v = sample(x)
        eu, ev = u - tu, v - tv
        step = (eu * du + ev * dv) / (du * du + dv * dv + eu * d2u + ev * d2v)
        x -= step
        if abs(step) < x * D("1e-40"):
            break
    u, v, du, dv, *_ = sample(x)
    length = (du * du + dv * dv).sqrt()
    duv = (tu - u) * (-dv / length) + (tv - v) * (du / length)
    cases.append({"chromaticity": {"x": float(xs), "y": float(ys)},
                  "correlatedColorTemperatureKelvin": format(1 / x, ".20g"), "duv": format(duv, ".20g")})

(folder / "reference.json").write_text(json.dumps({
    "version": "planckian-cct-reference-1",
    "model": "engine default locus: Planck's law x analytic CIE 1931 CMF fit, 1 nm nodes 360-830 nm",
    "method": "50-digit decimal: dense evaluation of the squared uv distance, then the exact root of its derivative",
    "cases": cases,
}, indent=2) + "\n")
