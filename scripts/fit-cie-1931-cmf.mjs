// SPDX-License-Identifier: Apache-2.0

/**
 * Fits the engine's own analytic approximation of the CIE 1931 2° colour-matching functions.
 *
 * Model: each of x̄, ȳ, z̄ is a sum of "split" Gaussian lobes. A lobe has an amplitude a, a centre
 * μ (nm) and two standard deviations (nm), one used below the centre and one above it:
 *   lobe(λ) = a · exp(−½ ((λ − μ) / σ)²), σ = σ_below for λ < μ, σ = σ_above otherwise.
 * x̄ uses three lobes (one negative), ȳ and z̄ use two. The fit is an ordinary least-squares fit of
 * all lobe parameters to the CIE 1931 2° table at 1 nm from 360 nm to 830 nm, solved with a
 * Levenberg–Marquardt iteration from deterministic pseudo-random starting points. A colour-matching
 * function cannot be negative, so the fit adds an exterior penalty on negative values over a 0.25 nm
 * grid with a rising weight, and the final rounded coefficients must be non-negative on a 0.01 nm
 * grid.
 *
 * Data: the CIE dataset "CIE 1931 colour-matching functions, 2 degree observer",
 * DOI 10.25039/CIE.DS.xvudnb9b, licensed CC BY-SA 4.0. The table is used at fit time only. This
 * script downloads it into a fresh temporary directory outside the repository, checks its SHA-256,
 * uses it, and deletes it. It never writes CIE values to the repository or to its output: the output
 * is the fitted coefficients and the fit errors this script measured.
 *
 * Usage (network access needed; behind an HTTPS proxy run Node with NODE_USE_ENV_PROXY=1):
 *   node scripts/fit-cie-1931-cmf.mjs
 *   node scripts/fit-cie-1931-cmf.mjs --csv /path/outside/repo/CIE_xyz_1931_2deg.csv
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DATA_URL = "https://files.cie.co.at/Publications-datasets/CIE_xyz_1931_2deg.csv";
const DATA_DOI = "10.25039/CIE.DS.xvudnb9b";
/** SHA-256 of the CSV as retrieved on 2026-10-17; a different file fails closed. */
const DATA_SHA256 = "fa663e3535a7e0763a745993a1f0a192eb0275ac46ad2d1befd7626841e713c1";
const LOBE_COUNTS = { x: 3, y: 2, z: 2 };
const STARTS = 400;
const SIGNIFICANT_DIGITS = 6;
/** Non-negativity penalty: grid (0.25 nm over the domain) and the rising weight schedule. */
const PENALTY_GRID = Array.from({ length: 1881 }, (_, i) => 360 + i * 0.25);
const PENALTY_WEIGHTS = [1e2, 1e4, 1e6, 1e8];
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadTable() {
  const flag = process.argv.indexOf("--csv");
  let text;
  if (flag !== -1) {
    const file = path.resolve(process.argv[flag + 1] ?? "");
    if (file.startsWith(REPOSITORY_ROOT + path.sep)) throw new Error("Keep the CIE table outside the repository.");
    text = readFileSync(file, "utf8");
  } else {
    const directory = mkdtempSync(path.join(tmpdir(), "photivra-cie-cmf-"));
    try {
      const response = await globalThis.fetch(DATA_URL);
      if (!response.ok) throw new Error("Download failed with HTTP " + response.status + ".");
      text = await response.text();
      writeFileSync(path.join(directory, "data.csv"), text);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  const digest = createHash("sha256").update(text).digest("hex");
  if (digest !== DATA_SHA256) throw new Error("Unexpected CIE table (SHA-256 " + digest + "); refit deliberately after checking the change.");
  const rows = text.trim().split(/\r?\n/).map((line) => line.split(",").map(Number));
  if (rows.length !== 471 || rows.some((r) => r.length !== 4 || r.some((v) => !Number.isFinite(v)))) throw new Error("Unexpected CIE table shape.");
  return {
    wavelengths: rows.map((r) => r[0]),
    x: rows.map((r) => r[1]),
    y: rows.map((r) => r[2]),
    z: rows.map((r) => r[3])
  };
}

/** Deterministic PRNG (mulberry32). */
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parameters are packed as [a, μ, σ_below, σ_above] per lobe. */
function evaluate(params, lambda) {
  let sum = 0;
  for (let k = 0; k < params.length; k += 4) {
    const t = (lambda - params[k + 1]) / (lambda < params[k + 1] ? params[k + 2] : params[k + 3]);
    sum += params[k] * Math.exp(-0.5 * t * t);
  }
  return sum;
}

function minimumOnGrid(params, step) {
  let minimum = Infinity;
  const count = Math.round((830 - 360) / step);
  for (let i = 0; i <= count; i++) minimum = Math.min(minimum, evaluate(params, 360 + i * step));
  return minimum;
}

/**
 * Residual rows: one per table sample (fit − data), then one penalty row per grid wavelength,
 * √w · min(0, fit), which is zero wherever the fit is non-negative.
 */
function residualsAndJacobian(params, problem) {
  const { wavelengths, data, penaltyWavelengths, penaltyWeight } = problem;
  const rows = wavelengths.length + penaltyWavelengths.length, m = params.length;
  const r = new Float64Array(rows), j = new Float64Array(rows * m);
  const scale = Math.sqrt(penaltyWeight);
  for (let i = 0; i < rows; i++) {
    const isData = i < wavelengths.length;
    const lambda = isData ? wavelengths[i] : penaltyWavelengths[i - wavelengths.length];
    let sum = 0;
    for (let k = 0; k < m; k += 4) {
      const below = lambda < params[k + 1];
      const sigma = below ? params[k + 2] : params[k + 3];
      const t = (lambda - params[k + 1]) / sigma;
      const g = Math.exp(-0.5 * t * t);
      sum += params[k] * g;
      j[i * m + k] = g;
      j[i * m + k + 1] = (params[k] * g * t) / sigma;
      j[i * m + k + (below ? 2 : 3)] = (params[k] * g * t * t) / sigma;
      j[i * m + k + (below ? 3 : 2)] = 0;
    }
    if (isData) {
      r[i] = sum - data[i];
    } else if (sum < 0) {
      r[i] = scale * sum;
      for (let k = 0; k < m; k++) j[i * m + k] *= scale;
    } else {
      r[i] = 0;
      for (let k = 0; k < m; k++) j[i * m + k] = 0;
    }
  }
  return { r, j };
}

function sumSquares(r) {
  let s = 0;
  for (const v of r) s += v * v;
  return s;
}

function solve(a, b) {
  const n = b.length, m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(m[i][c]) > Math.abs(m[p][c])) p = i;
    [m[c], m[p]] = [m[p], m[c]];
    if (Math.abs(m[c][c]) < 1e-300) return null;
    for (let i = c + 1; i < n; i++) {
      const f = m[i][c] / m[c][c];
      for (let k = c; k <= n; k++) m[i][k] -= f * m[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = m[i][n];
    for (let k = i + 1; k < n; k++) s -= m[i][k] * x[k];
    x[i] = s / m[i][i];
  }
  return x;
}

function levenbergMarquardt(start, problem, iterations = 2000) {
  let params = [...start];
  let { r, j } = residualsAndJacobian(params, problem);
  let cost = sumSquares(r);
  let damping = 1e-3;
  const m = params.length, n = r.length;
  for (let it = 0; it < iterations; it++) {
    const jtj = Array.from({ length: m }, () => new Array(m).fill(0));
    const jtr = new Array(m).fill(0);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < m; a++) {
        const ja = j[i * m + a];
        if (ja === 0) continue;
        jtr[a] += ja * r[i];
        for (let b = a; b < m; b++) jtj[a][b] += ja * j[i * m + b];
      }
    }
    for (let a = 0; a < m; a++) for (let b = 0; b < a; b++) jtj[a][b] = jtj[b][a];
    let improved = false;
    while (damping < 1e12) {
      const lhs = jtj.map((row, a) => row.map((v, b) => (a === b ? v * (1 + damping) + 1e-18 : v)));
      const step = solve(lhs, jtr.map((v) => -v));
      if (step !== null) {
        const trial = params.map((p, a) => p + step[a]);
        const valid = trial.every((p, a) => (a % 4 < 2 ? true : p > 0.5 && p < 400)) && trial.every(Number.isFinite);
        if (valid) {
          const next = residualsAndJacobian(trial, problem);
          const nextCost = sumSquares(next.r);
          if (nextCost < cost) {
            const relative = (cost - nextCost) / cost;
            params = trial; r = next.r; j = next.j; cost = nextCost;
            damping = Math.max(damping / 3, 1e-15);
            improved = true;
            if (relative < 1e-15) return { params, cost };
            break;
          }
        }
      }
      damping *= 4;
    }
    if (!improved) break;
  }
  return { params, cost };
}

function fitComponent(name, wavelengths, data, lobeCount, seed) {
  const next = random(seed);
  const peak = Math.max(...data);
  let best = null;
  for (let s = 0; s < STARTS; s++) {
    const start = [];
    for (let k = 0; k < lobeCount; k++) {
      start.push(
        (next() * 1.4 - 0.2) * peak,
        400 + next() * 260,
        5 + next() * 50,
        5 + next() * 50
      );
    }
    // Exterior penalty with a rising weight drives the fit to be non-negative on the grid.
    let result = { params: start };
    for (const penaltyWeight of PENALTY_WEIGHTS) {
      result = levenbergMarquardt(result.params, { wavelengths, data, penaltyWavelengths: PENALTY_GRID, penaltyWeight });
    }
    if (best === null || result.cost < best.cost) best = result;
  }
  // Order lobes by centre so the output is canonical.
  const lobes = [];
  for (let k = 0; k < best.params.length; k += 4) lobes.push(best.params.slice(k, k + 4));
  lobes.sort((a, b) => a[1] - b[1]);
  const rounded = lobes.map((lobe) => lobe.map((v) => Number(v.toPrecision(SIGNIFICANT_DIGITS))));
  // Rounding can push a fit that touches zero slightly below it. Moving a negative lobe's amplitude
  // toward zero by one unit in the last kept digit raises the sum everywhere, so repeat that until
  // the rounded fit is non-negative again.
  for (let guard = 0; guard < 10000 && minimumOnGrid(rounded.flat(), 0.01) < 0; guard++) {
    for (const lobe of rounded) {
      if (lobe[0] < 0) {
        const unit = 10 ** (Math.floor(Math.log10(-lobe[0])) - SIGNIFICANT_DIGITS + 1);
        lobe[0] = Number((lobe[0] + unit).toPrecision(SIGNIFICANT_DIGITS));
      }
    }
  }
  const minimum = minimumOnGrid(rounded.flat(), 0.01);
  if (!(minimum >= 0)) throw new Error(name + " fit is negative somewhere in the domain (" + minimum + ").");
  return { name, lobes: rounded, minimumOnDomain: Number(minimum.toPrecision(3)) };
}

function errors(lobes, wavelengths, data) {
  const params = lobes.flat();
  let max = 0, maxAt = 0, sq = 0;
  for (let i = 0; i < wavelengths.length; i++) {
    const e = Math.abs(evaluate(params, wavelengths[i]) - data[i]);
    if (e > max) { max = e; maxAt = wavelengths[i]; }
    sq += e * e;
  }
  return {
    maximumAbsoluteError: Number(max.toPrecision(3)),
    maximumAt: maxAt,
    rmsError: Number(Math.sqrt(sq / wavelengths.length).toPrecision(3))
  };
}

const table = await loadTable();
const output = { dataset: "CIE 1931 2° CMFs, DOI " + DATA_DOI + " (CC BY-SA 4.0), used at fit time only", dataSha256: DATA_SHA256, domainNanometers: [360, 830], stepNanometers: 1, components: {} };
for (const [index, name] of ["x", "y", "z"].entries()) {
  const fit = fitComponent(name, table.wavelengths, table[name], LOBE_COUNTS[name], 0x5eed + index);
  output.components[name] = { lobes: fit.lobes, minimumOnDomain: fit.minimumOnDomain, ...errors(fit.lobes, table.wavelengths, table[name]) };
}
process.stdout.write(JSON.stringify(output, null, 2) + "\n");
