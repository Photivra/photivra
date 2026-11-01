// SPDX-License-Identifier: Apache-2.0

/**
 * Computes the reference colorimetry of the built-in Photivra color patches (`getColorPatchSet()`) and checks it
 * against the values published in src/facade/color-patches.ts and docs/COLOR_PATCHES.md.
 *
 * For each patch spectrum R(λ) (the engine's own analytic formula, read from the built package):
 *   X = k Σ S(λ) R(λ) x̄(λ) Δλ (likewise Y, Z), 1 nm nodes over 360–830 nm, Δλ = 1 nm, k = 100 / Σ S(λ) ȳ(λ) Δλ,
 * with S = CIE illuminant D65 and x̄, ȳ, z̄ = the CIE 1931 2° observer (CIE 15:2018 §7, the 1 nm summation). CIELAB uses
 * the perfect diffuser under D65 as white (CSS Color 4 §9 constants). sRGB: the XYZ is scaled by the ratio of the sRGB
 * white (x, y) = (0.3127, 0.3290) to the D65 table white (diagonal XYZ scaling; the two whites differ by about 3e-5 in
 * x and y), converted with the CSS Color 4 `XYZ_to_lin_sRGB` matrix, encoded with the sRGB transfer function and
 * rounded to 8 bits. A patch is in the sRGB gamut when every linear component lies in [0, 1].
 *
 * Data: CIE datasets "CIE standard illuminant D65" (DOI 10.25039/CIE.DS.hjfjmt59) and "CIE 1931 colour-matching
 * functions, 2 degree observer" (DOI 10.25039/CIE.DS.xvudnb9b); their license and attribution are in THIRD_PARTY.md and
 * docs/COLORIMETRY.md, which explain why they are not bundled. Like scripts/fit-cie-1931-cmf.mjs,
 * the script downloads them into a fresh temporary directory outside the repository, checks their SHA-256, uses them
 * and deletes them. It writes no CIE value anywhere: its output is the computed colorimetry of Photivra's spectra.
 *
 * Usage (needs `npm run build` first, and network access; behind an HTTPS proxy run Node with NODE_USE_ENV_PROXY=1):
 *   node scripts/compute-color-patch-reference.mjs            # check the published values; exit 1 on a mismatch
 *   node scripts/compute-color-patch-reference.mjs --print    # also print the values and the docs table
 *   node scripts/compute-color-patch-reference.mjs --render   # also render the chart under D65 and compare (below)
 *   node scripts/compute-color-patch-reference.mjs --csv-dir /path/outside/repo   # use local copies of both CSV files
 *
 * `--render` passes the D65 table to `simulateIdealReference()` as a caller illuminant (`{ kind: "spectrum" }`), renders
 * the `color-patches` chart with 1 nm and 5 nm sensor quadrature, reads the CIELAB of each patch centre (relative to the
 * sRGB white scaled to the white neutral's reflectance) and fails when any patch differs from its published value by more than
 * ΔE00 0.3. The residual is the engine's analytic approximation of the CIE 1931 observer (docs/COLORIMETRY.md).
 */

import console from "node:console";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATASETS = {
  d65: { file: "CIE_std_illum_D65.csv", url: "https://files.cie.co.at/Publications-datasets/CIE_std_illum_D65.csv", doi: "10.25039/CIE.DS.hjfjmt59",
    /** SHA-256 of the CSV as retrieved on 2026-11-01. */
    sha256: "e76f210bffff3d552ef7113025da5f325d5dfec200dd4b878b1a2f3a507032cb", columns: 2 },
  cmf: { file: "CIE_xyz_1931_2deg.csv", url: "https://files.cie.co.at/Publications-datasets/CIE_xyz_1931_2deg.csv", doi: "10.25039/CIE.DS.xvudnb9b",
    /** The same file and digest as scripts/fit-cie-1931-cmf.mjs. */
    sha256: "fa663e3535a7e0763a745993a1f0a192eb0275ac46ad2d1befd7626841e713c1", columns: 4 }
};
/** CSS Color 4 §19 `XYZ_to_lin_sRGB`, the rational matrix written out as decimals. */
const XYZ_TO_LINEAR_SRGB = [[3.2409699419045226, -1.537383177570094, -0.4986107602930034], [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786]];

async function loadTable(dataset) {
  const flag = process.argv.indexOf("--csv-dir");
  let text;
  if (flag !== -1) {
    const directory = path.resolve(process.argv[flag + 1] ?? "");
    if (directory === REPOSITORY_ROOT || directory.startsWith(REPOSITORY_ROOT + path.sep)) throw new Error("Keep the CIE tables outside the repository.");
    text = readFileSync(path.join(directory, dataset.file), "utf8");
  } else {
    const directory = mkdtempSync(path.join(tmpdir(), "photivra-cie-"));
    try {
      const response = await globalThis.fetch(dataset.url);
      if (!response.ok) throw new Error("Download of " + dataset.url + " failed with HTTP " + response.status + ".");
      text = await response.text();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  const digest = createHash("sha256").update(text).digest("hex");
  if (digest !== dataset.sha256) throw new Error("Unexpected CIE table " + dataset.file + " (SHA-256 " + digest + "); check the change before recomputing.");
  const rows = text.trim().split(/\r?\n/).map((line) => line.split(",").map(Number));
  if (rows.some((r) => r.length !== dataset.columns || r.some((v) => !Number.isFinite(v)))) throw new Error("Unexpected shape of " + dataset.file + ".");
  return new Map(rows.map((r) => [r[0], r.slice(1)]));
}

const { getColorPatchSet, evaluateColorPatchReflectance } = await import(path.join(REPOSITORY_ROOT, "dist", "index.js"));
const d65 = await loadTable(DATASETS.d65);
const cmf = await loadTable(DATASETS.cmf);
const set = getColorPatchSet();
const nodes = [];
for (let nm = set.wavelengthRangeNanometers.minimum; nm <= set.wavelengthRangeNanometers.maximum; nm++) {
  const s = d65.get(nm), c = cmf.get(nm);
  if (!s || !c) throw new Error("The CIE tables do not cover " + nm + " nm.");
  nodes.push({ nm, s: s[0], x: c[0], y: c[1], z: c[2] });
}
const k = 100 / nodes.reduce((sum, n) => sum + n.s * n.y, 0);
const tristimulus = (reflectance) => {
  let X = 0, Y = 0, Z = 0;
  for (const n of nodes) { const w = n.s * reflectance(n.nm); X += w * n.x; Y += w * n.y; Z += w * n.z; }
  return [k * X, k * Y, k * Z];
};
const white = tristimulus(() => 1);
const epsilon = (6 / 29) ** 3, kappa = (29 / 3) ** 3;
const f = (t) => (t > epsilon ? Math.cbrt(t) : (kappa * t + 16) / 116);
const lab = ([X, Y, Z]) => { const fx = f(X / white[0]), fy = f(Y / white[1]), fz = f(Z / white[2]); return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]; };
const srgbWhite = [0.3127 / 0.329, 1, (1 - 0.3127 - 0.329) / 0.329];
const linearSrgb = (xyz) => { const a = xyz.map((c, i) => (c / 100) * srgbWhite[i] / (white[i] / 100)); return XYZ_TO_LINEAR_SRGB.map((r) => r[0] * a[0] + r[1] * a[1] + r[2] * a[2]); };
const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hex = (linear) => "#" + linear.map((c) => Math.round(255 * encode(Math.min(1, Math.max(0, c)))).toString(16).padStart(2, "0").toUpperCase()).join("");
const round2 = (v) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; };

const rows = set.patches.map((patch) => {
  const reflectance = (nm) => evaluateColorPatchReflectance({ patchId: patch.patchId, wavelengthNanometers: nm }).value.reflectance;
  const xyz = tristimulus(reflectance), L = lab(xyz).map(round2), linear = linearSrgb(xyz);
  const chroma = Math.hypot(L[1], L[2]), hue = (Math.atan2(L[2], L[1]) * 180 / Math.PI + 360) % 360;
  return { patch, lab: L, hex: hex(linear), inGamut: linear.every((c) => c >= 0 && c <= 1), linear, chroma, hue };
});
let mismatches = 0;
for (const row of rows) {
  const ref = row.patch.reference;
  const same = ref.cielabD65.every((v, i) => v === row.lab[i]) && ref.srgbHex === row.hex && ref.inSrgbGamut === row.inGamut;
  if (!same) { mismatches++; console.error("Mismatch for " + row.patch.patchId + ": published " + JSON.stringify(ref) + ", computed " + JSON.stringify({ cielabD65: row.lab, srgbHex: row.hex, inSrgbGamut: row.inGamut })); }
}
if (process.argv.includes("--print")) {
  for (const row of rows) console.log(JSON.stringify(row.patch.patchId) + ": [" + row.lab.join(", ") + "], " + JSON.stringify(row.hex) + ", in gamut " + row.inGamut +
    ", min linear " + Math.min(...row.linear).toFixed(4) + ", max linear " + Math.max(...row.linear).toFixed(4));
  console.log("\n| Code | Name | Group | sRGB | L* | a* | b* | C*ab | hab (°) | Why it is on the chart |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows) console.log("| " + row.patch.code + " | " + row.patch.name + " | " + row.patch.group + " | `" + row.hex + "`" + (row.inGamut ? "" : " (outside sRGB)") + " | " +
    row.lab.map((v) => v.toFixed(2)).join(" | ") + " | " + row.chroma.toFixed(2) + " | " + (row.chroma < 0.005 ? "—" : row.hue.toFixed(1)) + " | " + row.patch.reason + " |");
}
if (process.argv.includes("--render")) {
  const { simulateIdealReference, calculateCielabFromXyz, calculateColorDifference } = await import(path.join(REPOSITORY_ROOT, "dist", "index.js"));
  const illuminant = { kind: "spectrum", label: "CIE D65 (caller-supplied)", spectrum: { kind: "tabulated", samples: nodes.map((n) => ({ wavelengthNanometers: n.nm, value: n.s })) } };
  const decode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toXyz = [[0.41239079926595934, 0.357584339383878, 0.1804807884018343], [0.21263900587151027, 0.715168678767756, 0.07219231536073371], [0.01933081871559182, 0.11919477979462598, 0.9505321522496607]];
  for (const step of [1, 5]) {
    const cell = 10, width = 6 * cell, height = 5 * cell;
    const { image } = await simulateIdealReference({ scene: { preset: "color-patches" }, illuminant, sensor: { spectralStepNanometers: step }, output: { width, height, format: "srgb-16" } });
    const xyzAt = (index) => {
      const sum = [0, 0, 0];
      for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) for (let c = 0; c < 3; c++) sum[c] += decode(image.samples[((Math.floor(index / 6) * cell + y) * width + (index % 6) * cell + x) * 3 + c] / 65535) / 16;
      return toXyz.map((r) => r[0] * sum[0] + r[1] * sum[1] + r[2] * sum[2]);
    };
    const whiteY = xyzAt(0)[1] / set.patches[0].base;
    let worst = { deltaE: 0, patchId: "" }, total = 0;
    for (const [index, row] of rows.entries()) {
      const xyz = xyzAt(index);
      const lab = calculateCielabFromXyz({ xyz: { x: xyz[0], y: xyz[1], z: xyz[2] }, referenceWhiteXyz: { x: srgbWhite[0] * whiteY, y: whiteY, z: srgbWhite[2] * whiteY } }).value;
      const deltaE = calculateColorDifference({ formula: "ciede2000", reference: { lStar: row.lab[0], aStar: row.lab[1], bStar: row.lab[2] }, sample: lab }).value.deltaE;
      total += deltaE;
      if (deltaE > worst.deltaE) worst = { deltaE, patchId: row.patch.patchId };
    }
    console.log("Render under D65, " + step + " nm quadrature: maximum ΔE00 " + worst.deltaE.toFixed(3) + " (" + worst.patchId + "), mean " + (total / rows.length).toFixed(3) + ".");
    if (worst.deltaE > 0.3) mismatches++;
  }
}
console.log(mismatches === 0 ? "All " + rows.length + " published reference values match." : mismatches + " patches differ from the published values.");
process.exitCode = mismatches === 0 ? 0 : 1;
