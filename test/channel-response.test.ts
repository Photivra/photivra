// SPDX-License-Identifier: Apache-2.0
/**
 * #443: the facade's channel response (electrons per unit spectral radiance per channel and node) comes from one chain
 * execution per channel, and its cache key leaves out the scene bindings. Each computed map equals, entry by entry with
 * Object.is and in the same order, the earlier method (one execution per spectral node with radiance 1 at that node and 0
 * elsewhere), and a chart, illuminant, illuminance or scene change reuses the entry with the maps and bytes of a cold run.
 */
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { InvalidConfigurationError, type SceneRadianceEvaluationRequest, type SceneRadianceEvaluationResult, type SimulateCaptureOptions } from "../src/index.js";
import { executeEnvironmentSensorPhotoSignal, planEnvironmentSensorPhotoSignal } from "../src/sensor/environment-photo-signal.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

type Evaluate = (request: Readonly<SceneRadianceEvaluationRequest>) => SceneRadianceEvaluationResult;
interface Call { environment: Record<string, unknown>; evaluate: Evaluate; caller: string; result: Map<number, number> }
const audit = vi.hoisted(() => ({ calls: [] as Call[] }));
vi.mock("../src/facade/channel-response.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/facade/channel-response.js")>();
  return { ...actual, calculateChannelElectronsPerRadiance: (environment: Record<string, unknown>, evaluate: Evaluate, caller: string): Map<number, number> => {
    const result = actual.calculateChannelElectronsPerRadiance(environment, evaluate, caller);
    audit.calls.push({ environment, evaluate, caller, result: new Map(result) });
    return result;
  } };
});

/** The method before #443, verbatim: plan (copied, full retention), then one execution per spectral node with a delta radiance. */
function perNodeExecutions(environment: Record<string, unknown>, evaluate: Evaluate): Map<number, number> {
  const plan = planEnvironmentSensorPhotoSignal(environment as unknown as Parameters<typeof planEnvironmentSensorPhotoSignal>[0]);
  const electrons = (radiance: (nm: number) => number): number => (executeEnvironmentSensorPhotoSignal(plan,
    (request) => ({ ...evaluate(request), spectralRadianceWattsPerSquareMeterSteradianNanometer: radiance(request.wavelengthNanometers) })
  ).value as unknown as { photo: { value: { photoSignal: { expectedGeneratedElectronCount: number } } } }).photo.value.photoSignal.expectedGeneratedElectronCount;
  const nodes = new Set<number>();
  electrons((nm) => { nodes.add(nm); return 1; });
  return new Map([...nodes].sort((a, b) => a - b).map((node) => [node, electrons((nm) => (nm === node ? 1 : 0))]));
}

function expectSameMap(actual: Map<number, number>, expected: Map<number, number>): void {
  expect([...actual.keys()]).toEqual([...expected.keys()]);
  for (const [node, value] of expected) if (!Object.is(actual.get(node), value)) expect.fail(`node ${node}: ${actual.get(node)} is not ${value}`);
}

/** A fresh module graph: an empty channel-response cache. */
async function freshEngine(): Promise<typeof import("../src/index.js")> {
  vi.resetModules();
  return await import("../src/index.js");
}

/** SHA-256 of a result's samples, diagnostics without timings, assumptions and (for captures) RAW codes and flags. */
function digest(result: { image: { samples: ArrayLike<number> }; diagnostics: Record<string, unknown>; assumptions: unknown; raw?: unknown }): string {
  const diagnostics = { ...result.diagnostics };
  delete diagnostics.timingsMs;
  const plain = (_: string, v: unknown): unknown => (ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v);
  return createHash("sha256").update(JSON.stringify({ samples: Array.from(result.image.samples), diagnostics, assumptions: result.assumptions, raw: result.raw ?? null }, plain)).digest("hex");
}

const rings = (p: { u: number; v: number }): number => { const t = 12 * (p.u * p.u + p.v * p.v), f = t - Math.floor(t); return 0.1 + 0.6 * (f < 0.5 ? 2 * f : 2 - 2 * f); };
const radianceScene = { kind: "radiance-function", sceneId: "test-channel-response-radiance", evaluate: (p: { u: number; v: number }): number => 0.02 * rings(p) } as const;
const materialScene = { kind: "material-function", sceneId: "test-channel-response-materials", materials: [0.2, 0.6, 0.85],
  materialAt: ({ u, v }: { u: number; v: number }): number => (u * u + v * v < 0.2 ? 2 : u > 0 ? 1 : 0) } as const;
const small = { width: 16, height: 12 };
const quality: SimulateCaptureOptions = { scene: { preset: "siemens-star" }, lens: { fNumber: 11, diffraction: "circular-aperture" },
  sensor: { pixelPitchMicrometers: 6, pixelAperture: { kind: "box", samplesPerAxis: 2 }, antiAliasing: { kind: "four-spot" } },
  exposure: { mode: "manual", iso: 100, shutterSeconds: 1 / 125 }, output: { ...small, demosaic: "ahd" } };

/** Camera, sensor sampling and exposure classes; each differs from the others in a field the response depends on. */
const CONFIGURATIONS: [string, SimulateCaptureOptions][] = [
  ["defaults", { scene: { preset: "uniform" }, output: small }],
  ["Quality: box 2 × 2, four-spot, diffraction, f/11", quality],
  ["consumer tier, 1.4 µm, two-spot, box 4, f/4, 1/8000 s", { camera: "consumer", scene: { preset: "dead-leaves" }, lens: { fNumber: 4 },
    sensor: { pixelPitchMicrometers: 1.4, pixelAperture: { kind: "box", samplesPerAxis: 4 }, antiAliasing: { kind: "two-spot", axis: "horizontal" } },
    exposure: { shutterSeconds: 1 / 8000 }, output: small }],
  ["prosumer tier, 3.76 µm, f/1.4, 10 nm, CIE A", { camera: "prosumer", scene: { preset: "zone-plate" }, lens: { prime: 50, fNumber: 1.4 }, illuminant: "cie-a",
    sensor: { pixelPitchMicrometers: 3.76, spectralStepNanometers: 10 }, output: small }],
  ["8.4 µm, f/22, 2 s, 40 nm, planckian 2500 K, radiance function", { scene: radianceScene, lens: { prime: 50, fNumber: 22 }, illuminant: { kind: "planckian", temperatureKelvin: 2500 },
    sensor: { pixelPitchMicrometers: 8.4, spectralStepNanometers: 40, antiAliasing: { kind: "four-spot" } }, exposure: { shutterSeconds: 2 }, output: small }],
  ["85 mm prime at 0.9 m, 2.4 µm", { scene: materialScene, lens: { prime: 85, fNumber: 5.6 }, subjectDistanceM: 0.9, sensor: { pixelPitchMicrometers: 2.4 }, output: small }],
  ["aperture priority", { scene: { preset: "uniform" }, lens: { prime: 50, fNumber: 2.8 }, exposure: { mode: "aperture-priority" }, sensor: { pixelPitchMicrometers: 4.3 }, output: small }],
  ["program", { scene: { preset: "uniform" }, exposure: { mode: "program", iso: 400 }, sensor: { pixelPitchMicrometers: 4.3, pixelAperture: { kind: "box", samplesPerAxis: 2 } }, output: small }]
];

describe("channel response (#443)", () => {
  it("one execution per channel equals one execution per spectral node, entry by entry (Object.is)", async () => {
    const engine = await freshEngine();
    let compared = 0;
    for (const [name, options] of CONFIGURATIONS) {
      const before = audit.calls.length;
      await engine.prepareDisplayView(options);
      const calls = audit.calls.slice(before);
      expect(calls.length, name).toBe(3);
      for (const call of calls) {
        expect(call.caller).toBe("simulateDisplayView");
        expect(call.result.size).toBeGreaterThan(5);
        expectSameMap(call.result, perNodeExecutions(call.environment, call.evaluate));
        compared += call.result.size;
      }
    }
    expect(compared).toBeGreaterThan(400);
  }, scaledTimeout(240_000));

  it("keeps the entry across chart, illuminant, illuminance and scene changes, with the maps and bytes of a cold run", async () => {
    const view = { width: 12, height: 9 };
    const variants: [string, SimulateCaptureOptions][] = [
      ["chart", { ...quality, scene: { preset: "dead-leaves" } }],
      ["illuminant CIE A", { ...quality, illuminant: "cie-a" }],
      ["illuminant planckian 3200 K, kelvin white balance", { ...quality, illuminant: { kind: "planckian", temperatureKelvin: 3200 }, output: { ...quality.output, whiteBalance: { kelvin: 3200 } } }],
      ["illuminance 200 lux", { ...quality, illuminanceLux: 200 }],
      ["radiance function", { ...quality, scene: radianceScene }],
      ["material scene", { ...quality, scene: materialScene }]
    ];
    const engine = await freshEngine();
    let before = audit.calls.length;
    await engine.prepareDisplayView(quality);
    const base = audit.calls.slice(before).map((c) => c.result);
    expect(base.length).toBe(3);
    const warm = new Map<string, string>();
    for (const [name, options] of variants) {
      before = audit.calls.length;
      const prepared = await engine.prepareDisplayView(options);
      expect(audit.calls.length - before, name + " misses").toBe(0);
      warm.set(name, digest(await prepared.render({ ...view, region: { x: 2, y: 1, width: 6, height: 5 } })) + digest(await engine.simulateIdealReference(options)));
    }
    // An exposure change still misses.
    before = audit.calls.length;
    await engine.prepareDisplayView({ ...quality, lens: { ...quality.lens, fNumber: 8 } });
    expect(audit.calls.length - before).toBe(3);
    for (const [name, options] of variants) {
      const cold = await freshEngine();
      before = audit.calls.length;
      const prepared = await cold.prepareDisplayView(options);
      const maps = audit.calls.slice(before).map((c) => c.result);
      expect(maps.length, name + " cold").toBe(3);
      maps.forEach((map, i) => expectSameMap(map, base[i]!));
      expect(digest(await prepared.render({ ...view, region: { x: 2, y: 1, width: 6, height: 5 } })) + digest(await cold.simulateIdealReference(options)), name).toBe(warm.get(name));
    }
  }, scaledTimeout(240_000));

  it("a prepared view and a capture of one request give the same bytes in either order", async () => {
    const options: SimulateCaptureOptions = { ...quality, scene: materialScene, output: { ...quality.output, format: "srgb-16" } };
    const view = { width: 12, height: 9 };
    const captureFirst = await freshEngine();
    const capture1 = digest(await captureFirst.simulateCapture(options));
    const view1 = digest(await (await captureFirst.prepareDisplayView(options)).render(view));
    const viewFirst = await freshEngine();
    const view2 = digest(await (await viewFirst.prepareDisplayView(options)).render(view));
    const capture2 = digest(await viewFirst.simulateCapture(options));
    expect(capture2).toBe(capture1);
    expect(view2).toBe(view1);
  }, scaledTimeout(120_000));

  it("refuses an environment record with more than one temporal sample", async () => {
    const engine = await freshEngine();
    const before = audit.calls.length;
    await engine.prepareDisplayView({ scene: { preset: "uniform" }, output: { width: 8, height: 6 }, sensor: { pixelPitchMicrometers: 5 } });
    const call = audit.calls[before]!;
    const { calculateChannelElectronsPerRadiance } = await vi.importActual<typeof import("../src/facade/channel-response.js")>("../src/facade/channel-response.js");
    expect(() => calculateChannelElectronsPerRadiance({ ...call.environment, temporalSampleCount: 2 }, call.evaluate, "test"))
      .toThrow(new InvalidConfigurationError("test: the channel response expects one temporal sample."));
  }, scaledTimeout(60_000));
});
