// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SIMULATE_CAPTURE_COST_OPTIONS, SIMULATE_CAPTURE_FAST_OPTIONS, simulateCapture, simulateDisplayView, type SimulateCaptureFastOption,
  type SimulateCaptureFastReport, type SimulateCaptureOptions } from "../src/index.js";
import { cpuExecution, webGpuExecution } from "../src/gpu/image-kernel-execution.js";
import { simulateDisplayViewWithInternals } from "../src/facade/simulate-display-view.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

/*
 * #395: one exact-or-fast convention across the engine. The top-level `fast` sets every listed option; an option's record
 * `fast` overrides it for that option; `diagnostics.fast` reports what was requested and what ran. An option without a fast
 * method must give the exact result, byte for byte, and report `false`; one with a fast method (HAS_FAST) reports `true`
 * exactly when its fast method was asked for, and gives the exact result otherwise.
 */
type Options = Record<string, Record<string, unknown> | unknown>;
const base: Options = { scene: { preset: "siemens-star" }, output: { width: 32, height: 24 } };
/** Two-level merge: `extra`'s groups (lens, sensor, output) are merged into the base's. */
const request = (extra: Options): SimulateCaptureOptions => {
  const out: Options = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    out[key] = typeof value === "object" && value !== null && typeof out[key] === "object" ? { ...(out[key] as object), ...(value as object) } : value;
  }
  return out as unknown as SimulateCaptureOptions;
};
/** Each fast-capable option: the shorthand that turns it on, and its record form with `fast`. */
const FORMS: Record<SimulateCaptureFastOption, { shorthand: Options; record: (fast: boolean) => Options }> = {
  "lens.diffraction": { shorthand: { lens: { diffraction: "circular-aperture" } }, record: (fast) => ({ lens: { diffraction: { kind: "circular-aperture", fast } } }) },
  "sensor.antiAliasing": { shorthand: { sensor: { antiAliasing: { kind: "four-spot" } } }, record: (fast) => ({ sensor: { antiAliasing: { kind: "four-spot", fast } } }) },
  "sensor.pixelAperture.box": { shorthand: { sensor: { pixelAperture: "box" } }, record: (fast) => ({ sensor: { pixelAperture: { kind: "box", fast } } }) },
  "output.demosaic.ahd": { shorthand: { output: { demosaic: "ahd" } }, record: (fast) => ({ output: { demosaic: { kind: "ahd", fast } } }) }
};
const samples = (r: { image: { samples: Uint8Array | Uint16Array } }): number[] => Array.from(r.image.samples);
/**
 * Options whose fast method applies on the base request, with its assurance (#397: lens.diffraction's second-dark-ring
 * window; #396: sensor.antiAliasing's spots on the shared lattice, without diffraction).
 */
const HAS_FAST: ReadonlyMap<SimulateCaptureFastOption, SimulateCaptureFastReport["assurance"]> = new Map([["lens.diffraction", "approximation-with-a-priori-bound"],
  ["sensor.antiAliasing", "approximation-with-measured-bound"]]);
/** A request on which the fast diffraction window is smaller than the exact one (1.4 µm sites at f/8: radius 15 → 10). */
const SMALL_SITES: Options = { sensor: { pixelPitchMicrometers: 1.4 } };

describe("exact-or-fast flag convention (#395)", () => {
  it("lists every fast-capable option once, as a cost option, with a test case here", () => {
    expect(new Set(SIMULATE_CAPTURE_FAST_OPTIONS).size).toBe(SIMULATE_CAPTURE_FAST_OPTIONS.length);
    for (const option of SIMULATE_CAPTURE_FAST_OPTIONS) expect(SIMULATE_CAPTURE_COST_OPTIONS as readonly string[]).toContain(option);
    // A new fast-capable option must add its forms above, so the checks below cover it.
    expect(Object.keys(FORMS).sort()).toEqual([...SIMULATE_CAPTURE_FAST_OPTIONS].sort());
  });

  it("reports exact and nothing requested by default", async () => {
    const result = await simulateCapture(request({}));
    expect(result.diagnostics.fast).toEqual({ requested: false, applied: {}, assurance: "engine-reference" });
  });

  it("accepts the top-level flag and each option's record flag, and reports and runs each option's fast method exactly when asked", async () => {
    for (const option of SIMULATE_CAPTURE_FAST_OPTIONS) {
      const form = FORMS[option], hasFast = HAS_FAST.has(option);
      const exact = await simulateCapture(request(form.shorthand));
      expect(exact.diagnostics.fast).toEqual({ requested: false, applied: { [option]: false }, assurance: "engine-reference" });
      // [extra options, requested, whether this option's fast method was asked for]
      for (const [extra, requested, asked] of [[{ ...form.shorthand, fast: true }, true, true], [form.record(true), true, true], [form.record(false), false, false],
        [{ ...form.record(false), fast: true }, true, false], [{ ...form.record(true), fast: false }, true, true]] as [Options, boolean, boolean][]) {
        const result = await simulateCapture(request(extra)), applied = hasFast && asked;
        if (!applied) expect(samples(result), option).toEqual(samples(exact));
        expect(result.diagnostics.fast, option).toEqual({ requested, applied: { [option]: applied },
          assurance: applied ? HAS_FAST.get(option) : "engine-reference" });
        expect(result.assumptions.some((a) => a.id === "fast." + option), option).toBe(applied);
      }
    }
  }, scaledTimeout(300_000));

  it("lens.diffraction fast: the second dark ring, a caller's window kept, and a bound that holds site by site", async () => {
    const exact = await simulateDisplayViewWithInternals(request({ ...SMALL_SITES, lens: { diffraction: "circular-aperture" } }), { width: 32, height: 24 });
    const fast = await simulateDisplayViewWithInternals(request({ ...SMALL_SITES, lens: { diffraction: "circular-aperture" }, fast: true }), { width: 32, height: 24 });
    const model = (r: typeof exact): { kernelRadiusSamples: number } => r.result.assumptions.find((a) => a.id === "lens.diffraction")!.value as { kernelRadiusSamples: number };
    const note = fast.result.assumptions.find((a) => a.id === "fast.lens.diffraction")!.value as { kernelRadiusSamples: number; exactKernelRadiusSamples: number;
      bound: { kind: string; maximumFraction: number } };
    // 1.4 µm at f/8, longest node 770 nm: the second dark ring needs 10 sites, the third 15.
    expect([model(exact).kernelRadiusSamples, model(fast).kernelRadiusSamples]).toEqual([15, 10]);
    expect([note.exactKernelRadiusSamples, note.kernelRadiusSamples, note.bound.kind]).toEqual([15, 10, "expected-signal-fraction-of-scene-contrast"]);
    expect(note.bound.maximumFraction).toBeGreaterThan(0);
    expect(note.bound.maximumFraction).toBeLessThan(0.05);
    // Every native site's expected electrons stay within the bound times the scene contrast seen in the frame, per CFA colour.
    const W = 32, H = 24, values: [number, number, number][] = [];
    exact.signal.window(0, 0, W, H); fast.signal.window(0, 0, W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) values.push([exact.signal.site(x, y), fast.signal.site(x, y), (y & 1) * 2 + (x & 1)]);
    for (let k = 0; k < 4; k++) {
      const own = values.filter((v) => v[2] === k), lo = Math.min(...own.map((v) => v[0])), hi = Math.max(...own.map((v) => v[0]));
      for (const [e, f] of own) expect(Math.abs(f - e)).toBeLessThanOrEqual(note.bound.maximumFraction * (hi - lo) + 1e-9 * hi);
    }
    // An explicit kernelRadiusSamples is the caller's choice: kept, with the fast method not applied.
    const chosen = await simulateCapture(request({ ...SMALL_SITES, lens: { diffraction: { kind: "circular-aperture", kernelRadiusSamples: 12 } }, fast: true }));
    const chosenExact = await simulateCapture(request({ ...SMALL_SITES, lens: { diffraction: { kind: "circular-aperture", kernelRadiusSamples: 12 } } }));
    expect(samples(chosen)).toEqual(samples(chosenExact));
    expect(chosen.diagnostics.fast.applied["lens.diffraction"]).toBe(false);
  }, scaledTimeout(300_000));

  it("reports every fast-capable option a request uses, in list order", async () => {
    const all = request({ lens: { diffraction: { kind: "circular-aperture", fast: true } }, sensor: { antiAliasing: { kind: "four-spot" }, pixelAperture: "box" },
      output: { demosaic: { kind: "ahd" } }, fast: true });
    const result = await simulateCapture(all);
    expect(Object.keys(result.diagnostics.fast.applied)).toEqual([...SIMULATE_CAPTURE_FAST_OPTIONS]);
    // With diffraction the spots already read the lattice (#396 does not apply); 6 µm sites are below the box fold's threshold.
    expect(result.diagnostics.fast.applied).toEqual({ "lens.diffraction": true, "sensor.antiAliasing": false, "sensor.pixelAperture.box": false, "output.demosaic.ahd": false });
  }, scaledTimeout(120_000));

  it("keeps lens.diffraction's aperture key as a deprecated alias of kind, and refuses both", async () => {
    const byKind = await simulateCapture(request({ lens: { diffraction: { kind: "circular-aperture", kernelRadiusSamples: 3 } } }));
    const byAlias = await simulateCapture(request({ lens: { diffraction: { aperture: "circular-aperture", kernelRadiusSamples: 3 } } }));
    expect(samples(byAlias)).toEqual(samples(byKind));
    await expect(simulateCapture(request({ lens: { diffraction: { kind: "circular-aperture", aperture: "circular-aperture" } } }))).rejects.toThrow("not both");
  }, scaledTimeout(120_000));

  it("sensor.pixelAperture.box fast: folded into the diffraction kernels only where the Airy pattern spans enough sites", async () => {
    const box = (fast: boolean): Options => ({ sensor: { pixelPitchMicrometers: 1.4, pixelAperture: { kind: "box", samplesPerAxis: 2, fast } }, lens: { diffraction: "circular-aperture" } });
    const exact = await simulateCapture(request(box(false))), folded = await simulateCapture(request(box(true)));
    // 1.4 µm sites at f/8: the first dark ring at 550 nm reaches about 3.8 sites, above the 3.5-site threshold.
    expect(folded.diagnostics.fast).toEqual({ requested: true, applied: { "lens.diffraction": false, "sensor.pixelAperture.box": true }, assurance: "approximation-with-measured-bound" });
    const note = folded.assumptions.find((a) => a.id === "fast.sensor.pixelAperture.box")!.value as { firstZeroSites: number; minimumFirstZeroSites: number; bound: { kind: string } };
    expect(note.firstZeroSites).toBeGreaterThanOrEqual(note.minimumFirstZeroSites);
    expect(note.bound.kind).toBe("measured");
    // The fold keeps the capture on its tabulated path (the verification sites check the exact signal against the chain).
    expect(folded.assumptions.find((a) => a.id === "raw.expectedSignal")).toBeDefined();
    expect(samples(folded)).not.toEqual(samples(exact));
    // 6 µm sites at f/8 (about 0.9 sites): below the threshold, so the box stays exact and the result is unchanged.
    const large = (fast: boolean): Options => ({ sensor: { pixelAperture: { kind: "box", samplesPerAxis: 2, fast } }, lens: { diffraction: "circular-aperture" } });
    const largeFast = await simulateCapture(request(large(true)));
    expect(samples(largeFast)).toEqual(samples(await simulateCapture(request(large(false)))));
    expect(largeFast.diagnostics.fast.applied["sensor.pixelAperture.box"]).toBe(false);
    expect(largeFast.assumptions.some((a) => a.id === "fast.sensor.pixelAperture.box")).toBe(false);
    // Without diffraction there is no kernel to fold into.
    const plain = await simulateCapture(request({ sensor: { pixelPitchMicrometers: 1.4, pixelAperture: { kind: "box", samplesPerAxis: 2, fast: true } } }));
    expect(plain.diagnostics.fast.applied["sensor.pixelAperture.box"]).toBe(false);
    // The display view folds the same way, and its expected signal stays near the exact box's.
    const view = { width: 32, height: 24 };
    const viewExact = await simulateDisplayViewWithInternals(request(box(false)), view), viewFolded = await simulateDisplayViewWithInternals(request(box(true)), view);
    expect(viewFolded.result.diagnostics.fast.applied["sensor.pixelAperture.box"]).toBe(true);
    viewExact.signal.window(0, 0, 32, 24); viewFolded.signal.window(0, 0, 32, 24);
    let lo = Infinity, hi = -Infinity, worst = 0;
    const pairs: [number, number][] = [];
    for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) { const e = viewExact.signal.site(x, y); pairs.push([e, viewFolded.signal.site(x, y)]); lo = Math.min(lo, e); hi = Math.max(hi, e); }
    for (const [e, f] of pairs) worst = Math.max(worst, Math.abs(f - e) / (hi - lo));
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.25);
  }, scaledTimeout(300_000));

  it("sensor.antiAliasing fast: the spots on the shared lattice without diffraction, changing only sites with a spot on a boundary", async () => {
    const spots = (extra: Options = {}): Options => ({ sensor: { antiAliasing: { kind: "four-spot" }, ...extra } });
    const exact = await simulateCapture(request(spots())), lattice = await simulateCapture(request({ ...spots(), fast: true }));
    expect(lattice.diagnostics.fast).toEqual({ requested: true, applied: { "sensor.antiAliasing": true }, assurance: "approximation-with-measured-bound" });
    const note = lattice.assumptions.find((a) => a.id === "fast.sensor.antiAliasing")!.value as { method: string; pixelApertureNodes: boolean; bound: { kind: string } };
    expect([note.method, note.pixelApertureNodes, note.bound.kind]).toEqual(["spots-on-shared-site-lattice", false, "measured"]);
    // The capture stays on its tabulated path: its verification sites check the exact signal against the chain.
    expect(lattice.assumptions.find((a) => a.id === "raw.expectedSignal")).toBeDefined();
    expect(exact.assumptions.find((a) => a.id === "raw.expectedSignal")).toBeDefined();
    // With diffraction the spots already read the lattice: the fast flag changes nothing.
    const diffracted = (fast: boolean): Options => ({ ...spots(), lens: { diffraction: { kind: "circular-aperture", kernelRadiusSamples: 3 } }, fast });
    const diffractedFast = await simulateCapture(request(diffracted(true)));
    expect(samples(diffractedFast)).toEqual(samples(await simulateCapture(request(diffracted(false)))));
    expect(diffractedFast.diagnostics.fast.applied["sensor.antiAliasing"]).toBe(false);
    // Box nodes ride on the lattice only when the box asks for its fast method too; otherwise the spots stay exact.
    const boxed = await simulateCapture(request({ ...spots({ pixelAperture: { kind: "box", samplesPerAxis: 2 } }), fast: true }));
    expect(boxed.diagnostics.fast.applied).toEqual({ "sensor.antiAliasing": true, "sensor.pixelAperture.box": true });
    const boxExact = spots({ pixelAperture: { kind: "box", samplesPerAxis: 2, fast: false } });
    const boxKept = await simulateCapture(request({ ...boxExact, fast: true }));
    expect(boxKept.diagnostics.fast.applied).toEqual({ "sensor.antiAliasing": false, "sensor.pixelAperture.box": false });
    expect(samples(boxKept)).toEqual(samples(await simulateCapture(request(boxExact))));
    // Site by site in the display view: a dead-leaves chart (no spot exactly on a boundary) agrees to rounding; on the Siemens
    // star only a few sites change, each by at most the spot weights on its boundaries (all four: the scene contrast).
    const view = { width: 32, height: 24 };
    for (const [preset, maximumShare] of [["dead-leaves", 0], ["siemens-star", 0.05]] as const) {
      const options = (fast: boolean): SimulateCaptureOptions => request({ ...spots(), scene: { preset }, fast });
      const e = await simulateDisplayViewWithInternals(options(false), view), f = await simulateDisplayViewWithInternals(options(true), view);
      expect(f.result.diagnostics.fast.applied["sensor.antiAliasing"], preset).toBe(true);
      e.signal.window(0, 0, 32, 24); f.signal.window(0, 0, 32, 24);
      const pairs: [number, number][] = [];
      for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) pairs.push([e.signal.site(x, y), f.signal.site(x, y)]);
      const lo = Math.min(...pairs.map((p) => p[0])), hi = Math.max(...pairs.map((p) => p[0]));
      const changed = pairs.filter(([a, b]) => Math.abs(b - a) > 1e-9 * hi);
      expect(changed.length / pairs.length, preset).toBeLessThanOrEqual(maximumShare);
      for (const [a, b] of changed) expect(Math.abs(b - a), preset).toBeLessThanOrEqual(hi - lo + 1e-9 * hi);
    }
  }, scaledTimeout(300_000));

  it("refuses a fast value that is not a Boolean", async () => {
    await expect(simulateCapture(request({ fast: "yes" }))).rejects.toThrow("fast must be true or false");
    for (const option of SIMULATE_CAPTURE_FAST_OPTIONS) {
      const record = FORMS[option].record(true);
      const [group, values] = Object.entries(record)[0] as [string, Record<string, Record<string, unknown>>];
      const [key, value] = Object.entries(values)[0]!;
      await expect(simulateCapture(request({ [group]: { [key]: { ...value, fast: 1 } } })), option).rejects.toThrow(".fast must be true or false");
    }
  });

  it("gives the display view the same report", async () => {
    const view = { width: 16, height: 12 };
    const exact = await simulateDisplayView(request(FORMS["lens.diffraction"].shorthand), view);
    const fast = await simulateDisplayView(request({ ...FORMS["sensor.pixelAperture.box"].record(true) }), view);
    const fastExact = await simulateDisplayView(request(FORMS["sensor.pixelAperture.box"].shorthand), view);
    expect(samples(fast)).toEqual(samples(fastExact));
    expect(exact.diagnostics.fast).toEqual({ requested: false, applied: { "lens.diffraction": false }, assurance: "engine-reference" });
    expect(fast.diagnostics.fast).toEqual({ requested: true, applied: { "sensor.pixelAperture.box": false }, assurance: "engine-reference" });
    const diffracted = await simulateDisplayView(request({ ...SMALL_SITES, ...FORMS["lens.diffraction"].record(true) }), view);
    expect(diffracted.diagnostics.fast).toEqual({ requested: true, applied: { "lens.diffraction": true }, assurance: "approximation-with-a-priori-bound" });
  }, scaledTimeout(120_000));

  it("names every fast-capable option in docs/API_STYLE.md", () => {
    const style = readFileSync(new URL("../docs/API_STYLE.md", import.meta.url), "utf8");
    for (const option of SIMULATE_CAPTURE_FAST_OPTIONS) expect(style, option).toContain("`" + option + "`");
  });

  it("uses the same word on the WebGPU execution record", () => {
    expect(cpuExecution("cpu-reference", null).fast).toBe(false);
    expect(webGpuExecution(null, 0).fast).toBe(true);
  });
});
