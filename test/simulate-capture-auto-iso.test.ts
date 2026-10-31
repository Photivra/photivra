// SPDX-License-Identifier: Apache-2.0
/*
 * #516: exposure.iso "auto" in simulateCapture, the display view and the ideal reference. The facade hands "auto" to the
 * exposure-mode resolvers' Auto ISO branches; these tests check the ISO each mode resolves, what the result reports, that a
 * capture, its display view and its region parts resolve the same exposure, and the option validation.
 */
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, SIMULATE_CAPTURE_DEFAULT_ILLUMINANCE_LUX as LUX, prepareDisplayView, resolveGenericEquipmentTierCatalog, simulateCapture,
  simulateDisplayView, simulateIdealReference, type SimulateCaptureOptions } from "../src/index.js";

const small = { scene: { preset: "uniform" as const }, output: { width: 8, height: 8 } };
type AperturePriorityAutoIso = { mode: "aperture-priority"; iso: "auto"; autoIso: { slowestPreferredShutterSeconds: number; afterMaximumIso?: "allow-slower-shutter" | "hold-preferred-shutter" } };
type Resolution = { status: string; axisOwnership: { iso: string }; resolvedSettings: { aperture: number; shutterSeconds: number; iso: number };
  targetResidual: { limitingConstraint: string; residualStops: number } };
const aperturePriority = (slowestPreferredShutterSeconds: number, afterMaximumIso?: "allow-slower-shutter" | "hold-preferred-shutter"): AperturePriorityAutoIso =>
  ({ mode: "aperture-priority" as const, iso: "auto" as const, autoIso: { slowestPreferredShutterSeconds, ...(afterMaximumIso ? { afterMaximumIso } : {}) } });
const resolution = (r: { exposure: { resolution: unknown } }): Resolution => r.exposure.resolution as Resolution;

describe("exposure.iso absent or a number (#516)", () => {
  it("reports manual ISO control and no autoIso", async () => {
    for (const exposure of [undefined, { iso: 400 }, { mode: "program" as const, iso: 200 }]) {
      const r = await simulateCapture({ ...small, ...(exposure ? { exposure } : {}) });
      expect(r.exposure.isoControl).toBe("manual");
      expect(r.exposure).not.toHaveProperty("autoIso");
      expect(r.assumptions.some((a) => a.id === "exposure.autoIso")).toBe(false);
    }
  });
});

describe("manual + Auto ISO (#516)", () => {
  it("the default scene at f/8, 1/125 s gives ISO 100", async () => {
    const r = await simulateCapture({ ...small, exposure: { iso: "auto" } });
    expect(r.exposure.settings).toEqual({ fNumber: 8, shutterSeconds: 1 / 125, iso: 100 });
    expect(r.exposure.isoControl).toBe("automatic");
    expect(r.exposure.autoIso).toMatchObject({ autoIsoMinimum: 100, autoIsoMaximum: 25600 });
    expect(r.exposure.autoIso!.idealIsoBeforeConstraints).toBeCloseTo(100, 2);
    expect(resolution(r).axisOwnership.iso).toBe("automatic");
    expect(r.assumptions.some((a) => a.id === "exposure.autoIso")).toBe(true);
  });
  it("a scene three stops darker raises the ISO three stops, byte-identical to that manual ISO", async () => {
    const options: SimulateCaptureOptions = { ...small, illuminanceLux: LUX / 8, exposure: { iso: "auto" } };
    const auto = await simulateCapture(options), manual = await simulateCapture({ ...options, exposure: { iso: 800 } });
    expect(auto.exposure.settings).toEqual({ fNumber: 8, shutterSeconds: 1 / 125, iso: 800 });
    expect(resolution(auto).resolvedSettings.iso).toBe(800);
    expect(auto.exposure.autoIso!.idealIsoBeforeConstraints).toBeCloseTo(800, 1);
    expect(auto.exposure.autoIso!.clamped).toBe(false);
    expect(Math.abs(auto.exposure.autoIso!.residualStops)).toBeLessThan(1e-3);
    expect(Array.from(auto.image.samples)).toEqual(Array.from(manual.image.samples));
  });
  it("exposure compensation applies to the meter target", async () => {
    const r = await simulateCapture({ ...small, exposure: { iso: "auto", compensationStops: 1 } });
    expect(r.exposure.settings.iso).toBe(200);
  });
  it("at the body maximum the ISO is held and iso-maximum is reported", async () => {
    const r = await simulateCapture({ ...small, illuminanceLux: LUX / 1e4, exposure: { iso: "auto" } });
    expect(r.exposure.settings.iso).toBe(25600);
    expect(r.exposure.autoIso).toMatchObject({ clamped: "maximum", limitingConstraint: "iso-maximum" });
    expect(r.exposure.autoIso!.residualStops).toBeCloseTo(Math.log2(1e4 / 256), 3);
  });
  it("a brighter scene holds the ISO at the Auto ISO minimum", async () => {
    const r = await simulateCapture({ ...small, illuminanceLux: LUX * 8, exposure: { iso: "auto" } });
    expect(r.exposure.settings.iso).toBe(100);
    expect(r.exposure.autoIso).toMatchObject({ clamped: "minimum", limitingConstraint: "iso-minimum" });
    expect(r.exposure.autoIso!.residualStops).toBeCloseTo(-3, 3);
  });
});

describe("aperture priority + Auto ISO (#516)", () => {
  it("the default scene at f/8 gives 1/125 s at ISO 100", async () => {
    const r = await simulateCapture({ ...small, exposure: aperturePriority(1 / 125) });
    expect(r.exposure.settings.fNumber).toBe(8);
    expect(r.exposure.settings.shutterSeconds).toBeCloseTo(1 / 125, 6);
    expect(r.exposure.settings.iso).toBe(100);
    expect(r.exposure.autoIso).toMatchObject({ afterMaximumIso: "allow-slower-shutter", slowestPreferredShutterSeconds: 1 / 125, afterMaximumIsoFallbackUsed: false });
    expect(r.assumptions.find((a) => a.id === "exposure.autoIso.afterMaximumIso")?.kind).toBe("default");
  });
  it("a darker scene keeps the slowest preferred shutter and raises the ISO, byte-identical to that manual exposure", async () => {
    const options: SimulateCaptureOptions = { ...small, illuminanceLux: LUX / 8, exposure: aperturePriority(1 / 125) };
    const auto = await simulateCapture(options), manual = await simulateCapture({ ...options, exposure: { iso: 800, shutterSeconds: 1 / 125 } });
    expect(auto.exposure.settings).toEqual({ fNumber: 8, shutterSeconds: 1 / 125, iso: 800 });
    expect(Array.from(auto.image.samples)).toEqual(Array.from(manual.image.samples));
  });
  it("a slower preferred shutter takes some of the exposure before the ISO rises", async () => {
    const r = await simulateCapture({ ...small, illuminanceLux: LUX / 8, exposure: aperturePriority(1 / 30) });
    expect(r.exposure.settings.shutterSeconds).toBe(1 / 30);
    // Ideal ISO 100 · (8/125) / (1/30) = 192, the nearest selectable ISO in log2 is 200.
    expect(r.exposure.autoIso!.idealIsoBeforeConstraints).toBeCloseTo(192, 1);
    expect(r.exposure.settings.iso).toBe(200);
    expect(r.exposure.autoIso!.limitingConstraint).toBe("iso-grid-quantization");
  });
  it("at the maximum ISO, allow-slower-shutter lengthens the shutter to the target", async () => {
    const r = await simulateCapture({ ...small, illuminanceLux: LUX / 1e4, exposure: aperturePriority(1 / 125, "allow-slower-shutter") });
    expect(r.exposure.settings.iso).toBe(25600);
    expect(r.exposure.settings.shutterSeconds).toBeCloseTo(1e4 / 125 / 256, 4);
    expect(r.exposure.autoIso).toMatchObject({ clamped: "maximum", afterMaximumIsoFallbackUsed: true, limitingConstraint: "none" });
    expect(Math.abs(r.exposure.autoIso!.residualStops)).toBeLessThan(1e-3);
  });
  it("at the maximum ISO, hold-preferred-shutter keeps the shutter and reports iso-maximum", async () => {
    const r = await simulateCapture({ ...small, illuminanceLux: LUX / 1e4, exposure: aperturePriority(1 / 125, "hold-preferred-shutter") });
    expect(r.exposure.settings).toEqual({ fNumber: 8, shutterSeconds: 1 / 125, iso: 25600 });
    expect(r.exposure.autoIso).toMatchObject({ clamped: "maximum", afterMaximumIsoFallbackUsed: false, limitingConstraint: "iso-maximum",
      afterMaximumIso: "hold-preferred-shutter" });
    expect(r.exposure.autoIso!.residualStops).toBeGreaterThan(5);
  });
});

describe("shutter priority and program + Auto ISO (#516)", () => {
  it("shutter priority: the default scene gives f/8 at ISO 100", async () => {
    const r = await simulateCapture({ ...small, exposure: { mode: "shutter-priority", iso: "auto" } });
    expect(r.exposure.settings.fNumber).toBeCloseTo(8, 3);
    expect(r.exposure.settings.iso).toBe(100);
  });
  it("shutter priority: past the widest aperture the ISO rises, then holds at the maximum", async () => {
    const dark = await simulateCapture({ ...small, illuminanceLux: LUX / 64, exposure: { mode: "shutter-priority", iso: "auto" } });
    expect(dark.exposure.settings).toEqual({ fNumber: 4, shutterSeconds: 1 / 125, iso: 1600 });
    const darker = await simulateCapture({ ...small, illuminanceLux: LUX / 1e5, exposure: { mode: "shutter-priority", iso: "auto" } });
    expect(darker.exposure.settings.iso).toBe(25600);
    expect(darker.exposure.autoIso!.limitingConstraint).toBe("iso-maximum");
  });
  it("program: the program line at the lowest ISO, then the ISO beyond the line's end", async () => {
    const day = await simulateCapture({ ...small, exposure: { mode: "program", iso: "auto" } });
    expect(day.exposure.settings.iso).toBe(100);
    // The generic line ends at f/4, 1.024 s, 9 stops below f/8, 1/125 s; 12 stops darker needs 3 more stops of ISO.
    const night = await simulateCapture({ ...small, illuminanceLux: LUX / 4096, exposure: { mode: "program", iso: "auto" } });
    expect(night.exposure.settings).toEqual({ fNumber: 4, shutterSeconds: 1.024, iso: 800 });
    const darker = await simulateCapture({ ...small, illuminanceLux: LUX / 1e7, exposure: { mode: "program", iso: "auto" } });
    expect(darker.exposure.settings.iso).toBe(25600);
    expect(darker.exposure.autoIso).toMatchObject({ clamped: "maximum", limitingConstraint: "iso-maximum" });
  });
  it("every report number is finite", async () => {
    for (const exposure of [{ iso: "auto" as const }, aperturePriority(1 / 60), { mode: "shutter-priority" as const, iso: "auto" as const },
      { mode: "program" as const, iso: "auto" as const }]) {
      const r = await simulateCapture({ ...small, illuminanceLux: LUX / 300, exposure });
      for (const value of [...Object.values(r.exposure.settings), ...Object.values(r.exposure.autoIso!)]) if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
      expect(resolution(r).resolvedSettings.iso).toBe(r.exposure.settings.iso);
    }
  });
});

describe("a capture, its display view, its ideal reference and its region parts resolve the same ISO (#516)", () => {
  const options: SimulateCaptureOptions = { scene: { preset: "siemens-star", cycles: 8 }, output: { width: 16, height: 12 }, illuminanceLux: LUX / 50,
    exposure: aperturePriority(1 / 250, "hold-preferred-shutter") };
  it("same settings and report", async () => {
    const capture = await simulateCapture(options);
    const { mode, settings, ev100, isoControl, autoIso } = capture.exposure, shared = { mode, settings, ev100, isoControl, autoIso };
    expect(shared.isoControl).toBe("automatic");
    const view = { width: 8, height: 6, samplesPerAxis: 1 };
    const direct = await simulateDisplayView(options, view), prepared = await (await prepareDisplayView(options)).render(view);
    const reference = await simulateIdealReference(options);
    expect(direct.exposure).toEqual(shared);
    expect(prepared.exposure).toEqual(shared);
    expect(reference.exposure).toEqual(shared);
    const width = 16, height = 12, samples = new Array<number>(width * height * 3).fill(-1);
    for (const region of [{ x: 0, y: 0, width: 7, height: 5 }, { x: 7, y: 0, width: 9, height: 5 }, { x: 0, y: 5, width: 16, height: 7 }]) {
      const part = await simulateCapture({ ...options, output: { ...options.output, region } });
      expect(part.exposure.settings).toEqual(capture.exposure.settings);
      expect(part.exposure.autoIso).toEqual(capture.exposure.autoIso);
      for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width * 3; x++) samples[((region.y + y) * width + region.x) * 3 + x] = part.image.samples[y * region.width * 3 + x]!;
    }
    expect(samples).toEqual(Array.from(capture.image.samples));
  });
});

describe("Auto ISO option validation (#516)", () => {
  const bad: [string, NonNullable<SimulateCaptureOptions["exposure"]>][] = [
    ["a string other than auto", { iso: "AUTO" as never }],
    ["NaN ISO", { iso: NaN }],
    ["autoIso with a numeric ISO", { mode: "aperture-priority", iso: 400, autoIso: { slowestPreferredShutterSeconds: 1 / 60 } }],
    ["autoIso in manual mode", { iso: "auto", autoIso: { slowestPreferredShutterSeconds: 1 / 60 } }],
    ["autoIso in shutter priority", { mode: "shutter-priority", iso: "auto", autoIso: { slowestPreferredShutterSeconds: 1 / 60 } }],
    ["aperture priority without a slowest preferred shutter", { mode: "aperture-priority", iso: "auto" }],
    ["aperture priority with an empty autoIso", { mode: "aperture-priority", iso: "auto", autoIso: {} as never }],
    ["NaN slowest preferred shutter", aperturePriority(NaN)],
    ["infinite slowest preferred shutter", aperturePriority(Infinity)],
    ["zero slowest preferred shutter", aperturePriority(0)],
    ["slowest preferred shutter beyond the body's 30 s", aperturePriority(60)],
    ["slowest preferred shutter below the body's 1/8000 s", aperturePriority(1 / 16000)],
    ["unknown afterMaximumIso", aperturePriority(1 / 60, "allow" as never)],
    ["unknown autoIso key", { mode: "aperture-priority", iso: "auto", autoIso: { slowestPreferredShutterSeconds: 1 / 60, maximumIso: 3200 } as never }]
  ];
  it("a body without Auto ISO fails with a domain error; its numeric ISO still works", async () => {
    const preset = resolveGenericEquipmentTierCatalog({ presetVersion: "2.0.0" }).find((p) => p.tier === "professional")!;
    const iso = preset.body.exposure.iso;
    const camera = { ...preset, body: { ...preset.body, exposure: { ...preset.body.exposure, iso: { ...iso, autoIso: { ...iso.autoIso, value: "unsupported" as const } } } } };
    await expect(simulateCapture({ ...small, camera, exposure: { iso: "auto" } })).rejects.toThrow(/Auto ISO is unsupported/);
    expect((await simulateCapture({ ...small, camera, exposure: { iso: 200 } })).exposure.settings.iso).toBe(200);
  });
  for (const [name, exposure] of bad) it(name + " fails with a domain error", async () => {
    await expect(simulateCapture({ ...small, exposure })).rejects.toThrow(InvalidConfigurationError);
    await expect(prepareDisplayView({ ...small, exposure })).rejects.toThrow(InvalidConfigurationError);
  });
});
