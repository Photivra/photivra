// SPDX-License-Identifier: Apache-2.0
/**
 * 2.14 (owner's round 5, item 8): third-stop exposure grids.
 * - The generic tier presets 2.1.0 list third-stop ISO settings; 2.0.0 stays resolvable and unchanged (its manifest pin).
 * - Auto ISO keeps whole stops unless `exposure.autoIso.isoSteps: "third-stop"`, so its default choices are 2.13's.
 * - `GENERIC_THIRD_STOP_SHUTTER_SECONDS` is the standard third-stop shutter series.
 * Independent expectations: the exact series 100·2^(k/3) and 2^(k/3) s, written here; whole-stop requests compared byte
 * for byte against the 2.0.0 record of the same tier.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENERIC_EQUIPMENT_TIER_PRESET_VERSION, GENERIC_EQUIPMENT_TIER_PRESET_VERSIONS, GENERIC_THIRD_STOP_ISO_SETTINGS, GENERIC_THIRD_STOP_SHUTTER_SECONDS,
  GENERIC_WHOLE_STOP_ISO_SETTINGS, InvalidConfigurationError, InvalidScientificInputError, createGenericEquipmentTierSelection, parseGenericEquipmentTierSelection,
  resolveGenericEquipmentTierCatalog, simulateCapture, simulateIdealReference, type SimulateCaptureOptions, type SimulateCaptureResult } from "../src/index.js";

const small = { output: { width: 8, height: 8 } } as const;
const v200 = resolveGenericEquipmentTierCatalog({ presetVersion: "2.0.0" }), v210 = resolveGenericEquipmentTierCatalog({ presetVersion: "2.1.0" });
const isoGrid = (preset: (typeof v210)[number]): readonly number[] => {
  const grid = preset.body.exposure.iso.settingGrid;
  return grid.kind === "discrete-values" ? grid.values.value : [];
};
const bytes = (samples: Uint8Array | Uint16Array): string => createHash("sha256").update(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)).digest("hex");

describe("third-stop ISO settings (preset 2.1.0)", () => {
  it("lists the conventional third-stop markings, within 2 % of 100·2^(k/3), up to each body's maximum", () => {
    expect(GENERIC_THIRD_STOP_ISO_SETTINGS).toHaveLength(25);
    GENERIC_THIRD_STOP_ISO_SETTINGS.forEach((iso, k) => expect(Math.abs(iso / (100 * 2 ** (k / 3)) - 1), "ISO " + iso).toBeLessThan(0.02));
    expect(GENERIC_THIRD_STOP_ISO_SETTINGS.filter((_, k) => k % 3 === 0)).toEqual([...GENERIC_WHOLE_STOP_ISO_SETTINGS]);
    expect(v210.map((p) => [p.tier, isoGrid(p).length, isoGrid(p).at(-1)])).toEqual([["consumer", 19, 6400], ["prosumer", 22, 12800], ["professional", 25, 25600]]);
    for (const preset of v210) expect(preset.body.iso.standard.settingGrid).toEqual({ kind: "discrete-values", values: isoGrid(preset) });
    for (const preset of v200) expect(isoGrid(preset).every((iso) => (GENERIC_WHOLE_STOP_ISO_SETTINGS as readonly number[]).includes(iso))).toBe(true);
  });

  it("is a new exact version: 2.0.0 still resolves unchanged, 2.1.0 is pinned and current", () => {
    expect(GENERIC_EQUIPMENT_TIER_PRESET_VERSIONS).toEqual(["2.0.0", "2.1.0"]);
    expect(GENERIC_EQUIPMENT_TIER_PRESET_VERSION).toBe("2.1.0");
    const pin = (path: string): string => (JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as { catalogSha256: string }).catalogSha256;
    expect(createHash("sha256").update(JSON.stringify(v200)).digest("hex")).toBe(pin("./fixtures/generic-tier-assets-v1.json"));
    expect(createHash("sha256").update(JSON.stringify(v210)).digest("hex")).toBe(pin("./fixtures/generic-tier-assets-v2.1.0.json"));
    expect(() => resolveGenericEquipmentTierCatalog({ presetVersion: "2.2.0" })).toThrow(InvalidConfigurationError);
    for (const presetVersion of GENERIC_EQUIPMENT_TIER_PRESET_VERSIONS) {
      const selection = createGenericEquipmentTierSelection({ presetVersion, bodyTier: "professional" });
      expect(selection.presetVersion).toBe(presetVersion);
      expect(parseGenericEquipmentTierSelection(JSON.parse(JSON.stringify(selection)))).toEqual(selection);
    }
    // A saved 2.0.0 selection does not parse as 2.1.0: the profile versions differ.
    const old = JSON.parse(JSON.stringify(createGenericEquipmentTierSelection({ presetVersion: "2.0.0", bodyTier: "consumer" })));
    expect(() => parseGenericEquipmentTierSelection({ ...old, presetVersion: "2.1.0" })).toThrow(InvalidConfigurationError);
  });

  it("takes third-stop ISOs on the tier bodies, with exposure in proportion, and refuses them on a 2.0.0 record", async () => {
    const at = async (iso: number, camera: SimulateCaptureOptions["camera"] = "professional"): Promise<number> =>
      (await simulateIdealReference({ camera, scene: { preset: "uniform" }, exposure: { iso }, output: { width: 4, height: 4, format: "srgb-16" } })).image.samples[0]!;
    const decode = (code: number): number => { const c = code / 65535; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const base = decode(await at(100));
    for (const iso of [125, 160, 250, 320]) expect(decode(await at(iso)) / base, "ISO " + iso).toBeCloseTo(iso / 100, 3);
    const capture = await simulateCapture({ camera: "professional", scene: { preset: "uniform" }, exposure: { iso: 160 }, ...small });
    expect(capture.exposure.settings.iso).toBe(160);
    expect(capture.provenance.cameraPresetVersion).toBe("2.1.0");
    await expect(simulateCapture({ camera: structuredClone(v200[2]!), scene: { preset: "uniform" }, exposure: { iso: 160 }, ...small })).rejects.toThrow(InvalidScientificInputError);
    // Above a body's maximum, still refused.
    await expect(simulateCapture({ camera: "consumer", scene: { preset: "uniform" }, exposure: { iso: 8000 }, ...small })).rejects.toThrow(InvalidScientificInputError);
  });

  it("whole-stop requests are byte-identical to the 2.0.0 presets", async () => {
    const requests: Partial<SimulateCaptureOptions>[] = [
      { exposure: { iso: 400 } },
      { exposure: { mode: "aperture-priority" }, illuminanceLux: 700 },
      { exposure: { mode: "program", iso: "auto" }, illuminanceLux: 300 },
      { exposure: { mode: "shutter-priority", iso: "auto" }, illuminanceLux: 40 },
      { exposure: { mode: "aperture-priority", iso: "auto", autoIso: { slowestPreferredShutterSeconds: 1 / 60, limits: { maximum: 3200 } } }, illuminanceLux: 100 }
    ];
    for (const [index, tier] of (["consumer", "prosumer", "professional"] as const).entries()) for (const request of requests) {
      const options = { scene: { preset: "siemens-star" }, ...small, ...request } as SimulateCaptureOptions;
      const current = await simulateCapture({ ...options, camera: tier }), historical = await simulateCapture({ ...options, camera: structuredClone(v200[index]!) });
      expect(bytes(current.image.samples), tier + " " + JSON.stringify(request)).toBe(bytes(historical.image.samples));
      expect(bytes(current.raw.codes)).toBe(bytes(historical.raw.codes));
      expect(current.exposure.settings).toEqual(historical.exposure.settings);
      expect(current.exposure.autoIso).toEqual(historical.exposure.autoIso);
      expect(current.assumptions).toEqual(historical.assumptions);
    }
  });
});

describe("Auto ISO steps", () => {
  const scene = { preset: "uniform" } as const;
  const auto = (autoIso: Record<string, unknown> | undefined, illuminanceLux: number): Promise<SimulateCaptureResult> =>
    simulateCapture({ camera: "professional", scene, exposure: { mode: "manual", iso: "auto", ...(autoIso ? { autoIso } : {}) }, illuminanceLux, ...small } as SimulateCaptureOptions);

  it("keeps whole stops by default and takes thirds on request, with the residual within half a step", async () => {
    for (const lux of [300, 450, 1000, 3000]) {
      const whole = await auto(undefined, lux), explicit = await auto({ isoSteps: "whole-stop" }, lux), thirds = await auto({ isoSteps: "third-stop" }, lux);
      expect(Number.isInteger(Math.log2(whole.exposure.settings.iso / 100))).toBe(true);
      expect(explicit.exposure.settings).toEqual(whole.exposure.settings);
      expect(whole.exposure.autoIso).not.toHaveProperty("isoSteps");
      expect(explicit.exposure.autoIso?.isoSteps).toBe("whole-stop");
      expect(thirds.exposure.autoIso?.isoSteps).toBe("third-stop");
      expect((GENERIC_THIRD_STOP_ISO_SETTINGS as readonly number[]).includes(thirds.exposure.settings.iso)).toBe(true);
      expect(Math.abs(whole.exposure.autoIso!.residualStops)).toBeLessThanOrEqual(0.5 + 1e-9);
      // The markings are rounded, so a third-stop residual can exceed 1/6 stop by the rounding (at most log2(1.02)).
      expect(Math.abs(thirds.exposure.autoIso!.residualStops)).toBeLessThanOrEqual(1 / 6 + Math.log2(1.02));
      expect(Math.abs(thirds.exposure.autoIso!.residualStops)).toBeLessThanOrEqual(Math.abs(whole.exposure.autoIso!.residualStops) + 1e-12);
    }
    // 300 lx asks for about ISO 7160: whole stops give 6400, thirds 8000 (log2 nearer).
    expect((await auto(undefined, 300)).exposure.settings.iso).toBe(6400);
    expect((await auto({ isoSteps: "third-stop" }, 300)).exposure.settings.iso).toBe(8000);
  });

  it("validates isoSteps, and Auto ISO limits lie on the grid Auto ISO uses", async () => {
    await expect(auto({ isoSteps: "half-stop" }, 300)).rejects.toThrow(InvalidConfigurationError);
    await expect(auto({ isoSteps: 3 }, 300)).rejects.toThrow(InvalidConfigurationError);
    await expect(auto({ limits: { maximum: 5000 } }, 300)).rejects.toThrow();
    const limited = await auto({ isoSteps: "third-stop", limits: { maximum: 5000 } }, 300);
    expect(limited.exposure.settings.iso).toBe(5000);
    expect(limited.exposure.autoIso?.limitingConstraint).toBe("user-iso-maximum");
  });
});

describe("GENERIC_THIRD_STOP_SHUTTER_SECONDS", () => {
  it("is the third-stop series from 1/8000 s to 30 s, within 7 % of 2^(k/3) s", () => {
    const series = GENERIC_THIRD_STOP_SHUTTER_SECONDS;
    expect(series).toHaveLength(55);
    expect(series[0]).toBe(1 / 8000);
    expect(series.at(-1)).toBe(30);
    expect(series.indexOf(1)).toBe(39);
    series.forEach((t, i) => {
      if (i > 0) expect(t).toBeGreaterThan(series[i - 1]!);
      expect(Math.abs(t / 2 ** ((i - 39) / 3) - 1), "t = " + t).toBeLessThan(0.07);
    });
    for (const marked of [1 / 125, 1 / 60, 1 / 13, 0.3, 1.3, 13, 15]) expect(series).toContain(marked);
    expect(Object.isFrozen(series)).toBe(true);
  });

  it("every time is accepted by a manual capture on every tier, as given", async () => {
    for (const shutterSeconds of [GENERIC_THIRD_STOP_SHUTTER_SECONDS[0]!, 1 / 6400, 1 / 13, 0.3, 1.3, 30]) {
      const r = await simulateCapture({ camera: "consumer", scene: { preset: "uniform" }, exposure: { shutterSeconds }, illuminanceLux: 1000, ...small });
      expect(r.exposure.settings.shutterSeconds).toBe(shutterSeconds);
    }
  });
});
