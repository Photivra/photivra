// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SIMULATE_CAPTURE_COST_OPTIONS, SIMULATE_CAPTURE_FAST_OPTIONS, simulateCapture, simulateDisplayView, type SimulateCaptureFastOption,
  type SimulateCaptureOptions } from "../src/index.js";
import { cpuExecution, webGpuExecution } from "../src/gpu/image-kernel-execution.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

/*
 * #395: one exact-or-fast convention across the engine. The top-level `fast` sets every listed option; an option's record
 * `fast` overrides it for that option; `diagnostics.fast` reports what was requested and what ran. No option has a fast
 * method yet, so every request here must give the exact result, byte for byte, and report `false` for each option it used.
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

  it("accepts the top-level flag and each option's record flag, runs exact, and reports false for each option used", async () => {
    for (const option of SIMULATE_CAPTURE_FAST_OPTIONS) {
      const form = FORMS[option];
      const exact = await simulateCapture(request(form.shorthand));
      expect(exact.diagnostics.fast).toEqual({ requested: false, applied: { [option]: false }, assurance: "engine-reference" });
      for (const [extra, requested] of [[{ ...form.shorthand, fast: true }, true], [form.record(true), true], [form.record(false), false],
        [{ ...form.record(false), fast: true }, true], [{ ...form.record(true), fast: false }, true]] as [Options, boolean][]) {
        const result = await simulateCapture(request(extra));
        expect(samples(result), option).toEqual(samples(exact));
        expect(result.diagnostics.fast, option).toEqual({ requested, applied: { [option]: false }, assurance: "engine-reference" });
      }
    }
  }, scaledTimeout(300_000));

  it("reports every fast-capable option a request uses, in list order", async () => {
    const all = request({ lens: { diffraction: { kind: "circular-aperture", fast: true } }, sensor: { antiAliasing: { kind: "four-spot" }, pixelAperture: "box" },
      output: { demosaic: { kind: "ahd" } }, fast: true });
    const result = await simulateCapture(all);
    expect(Object.keys(result.diagnostics.fast.applied)).toEqual([...SIMULATE_CAPTURE_FAST_OPTIONS]);
    expect(Object.values(result.diagnostics.fast.applied).every((value) => value === false)).toBe(true);
  }, scaledTimeout(120_000));

  it("keeps lens.diffraction's aperture key as a deprecated alias of kind, and refuses both", async () => {
    const byKind = await simulateCapture(request({ lens: { diffraction: { kind: "circular-aperture", kernelRadiusSamples: 3 } } }));
    const byAlias = await simulateCapture(request({ lens: { diffraction: { aperture: "circular-aperture", kernelRadiusSamples: 3 } } }));
    expect(samples(byAlias)).toEqual(samples(byKind));
    await expect(simulateCapture(request({ lens: { diffraction: { kind: "circular-aperture", aperture: "circular-aperture" } } }))).rejects.toThrow("not both");
  }, scaledTimeout(120_000));

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
    const fast = await simulateDisplayView(request({ ...FORMS["lens.diffraction"].record(true) }), view);
    expect(samples(fast)).toEqual(samples(exact));
    // #481: a display view's report also carries `execution`, where the render ran; the CPU reference here (simulateDisplayView has no GPU option).
    const execution = { gpu: "off", backend: "cpu-reference", requestedBackend: "cpu-reference", fallbackReason: null, assurance: "engine-reference", fast: false };
    expect(exact.diagnostics.fast).toMatchObject({ requested: false, applied: { "lens.diffraction": false }, assurance: "engine-reference", execution });
    expect(fast.diagnostics.fast).toMatchObject({ requested: true, applied: { "lens.diffraction": false }, assurance: "engine-reference", execution });
    expect(Object.keys(exact.diagnostics.fast).sort()).toEqual(["applied", "assurance", "execution", "requested"]);
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
