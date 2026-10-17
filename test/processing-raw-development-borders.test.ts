// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { calculateNativeRawPlan, createBuiltInBayerDemosaicProfiles, createNativeRawDevelopmentTask, InvalidConfigurationError,
  type CaptureOrientation, type NativeRawDevelopmentInput, type NativeRawDevelopmentOutput, type NativeRawOutput } from "../src/index.js";
import { developNativeRawReference } from "../src/capture/native-raw-development.js";
import { nativeRawFixture } from "./helpers/native-raw-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { mulberry32 } from "./helpers/processing-fixture.js";

const noYield = { yieldControl: async (): Promise<void> => {} };

function input(width: number, height: number, orientation: CaptureOrientation, kernel: "bilinear" | "malvar-he-cutler-2004", seed: number,
  active?: { x: number; y: number; width: number; height: number }): NativeRawDevelopmentInput {
  const f = nativeRawFixture(width, height), policy = loadPhotographicExportInput(), random = mulberry32(seed), portrait = orientation.startsWith("portrait");
  const aw = active?.width ?? width, ah = active?.height ?? height;
  f.input.exposure.geometry = { ...f.input.exposure.geometry, orientation, ...(active ? { activeCaptureRect: active } : {}),
    outputRaster: portrait ? { pixelWidth: ah, pixelHeight: aw } : { pixelWidth: aw, pixelHeight: ah } };
  const plan = calculateNativeRawPlan(f.input), n = plan.pixelCount;
  const raw: NativeRawOutput = { plan, codes: new Uint16Array(n), blackLevels: new Uint16Array(n).fill(64), digitalSaturationCodes: new Uint16Array(n).fill(1023),
    saturationFlags: new Uint8Array(n), effectiveSaturationCodes: Uint16Array.of(900, 920, 910, 930) };
  for (let i = 0; i < n; i++) { raw.codes[i] = 64 + Math.floor(random() * 900); raw.saturationFlags[i] = random() < 0.03 ? 1 : 0; }
  const phaseProfiles = createBuiltInBayerDemosaicProfiles({ kernel, captureModeId: plan.frame.modeId, colorSamplingProfile: plan.frame.colorSamplingProfile,
    channelRoles: { red: "red", green: "green", blue: "blue" } }).value.phaseProfiles;
  return { raw, phaseProfiles, colorProfile: policy.colorProfile, whiteBalance: "not-required", rendering: policy.rendering, maximumRetainedPayloadBytes: n * 16 };
}
function copy(v: NativeRawDevelopmentInput): NativeRawDevelopmentInput {
  const r = v.raw;
  return { ...v, raw: { plan: r.plan, codes: r.codes.slice(), blackLevels: r.blackLevels.slice(), digitalSaturationCodes: r.digitalSaturationCodes.slice(),
    saturationFlags: r.saturationFlags.slice(), effectiveSaturationCodes: r.effectiveSaturationCodes.slice() } };
}
async function develop(v: NativeRawDevelopmentInput): Promise<NativeRawDevelopmentOutput> {
  const task = createNativeRawDevelopmentTask(v, noYield); await task.run(); return task.takeOutput();
}

describe("native RAW development with built-in kernels and mirror borders", () => {
  it("rejects full-frame edges by default and develops them with mirror borders", async () => {
    const v = input(8, 6, "landscape", "malvar-he-cutler-2004", 1);
    expect(() => createNativeRawDevelopmentTask(copy(v), noYield)).toThrow(InvalidConfigurationError);
    expect(() => createNativeRawDevelopmentTask({ ...copy(v), borderHandling: "wrap" as "mirror" }, noYield)).toThrow(InvalidConfigurationError);
    const out = await develop({ ...copy(v), borderHandling: "mirror" });
    expect(out.borderHandling).toBe("mirror"); expect(out.width).toBe(8); expect(out.integerSamples.length).toBe(8 * 6 * 3);
  });

  it("typed mirrored kernel is byte-identical to the per-object reference for every orientation and kernel", async () => {
    let seed = 10;
    for (const orientation of ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const)
      for (const kernel of ["bilinear", "malvar-he-cutler-2004"] as const) {
        const v = { ...input(6 + 2 * (seed % 2), 6, orientation, kernel, seed++), borderHandling: "mirror" as const };
        const reference = developNativeRawReference(copy(v)), out = await develop(v);
        expect(Array.from(out.integerSamples)).toEqual(reference.integerSamples);
        expect(out.highlight).toEqual(reference.highlight); expect(out.diagnostics).toEqual(reference.diagnostics);
      }
  });

  it("leaves pixels whose neighbourhood is inside the frame byte-identical to reject handling", async () => {
    for (const kernel of ["bilinear", "malvar-he-cutler-2004"] as const) {
      const v = input(12, 10, "landscape", kernel, 3, { x: 2, y: 2, width: 8, height: 6 });
      const rejected = await develop(copy(v)), mirrored = await develop({ ...copy(v), borderHandling: "mirror" });
      expect(rejected.borderHandling).toBe("reject");
      expect(Array.from(mirrored.integerSamples)).toEqual(Array.from(rejected.integerSamples));
      expect(mirrored.highlight).toEqual(rejected.highlight);
    }
  });
});
