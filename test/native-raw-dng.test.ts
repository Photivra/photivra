// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, parseDngRawImage, serializeNativeRawDng, simulateCapture, type SimulateCaptureResult } from "../src/index.js";

const noise = { red: { conversionGainElectronsPerCode: 4, readNoiseRmsElectrons: 3 }, green: { conversionGainElectronsPerCode: 4, readNoiseRmsElectrons: 3 },
  blue: { conversionGainElectronsPerCode: 2, readNoiseRmsElectrons: 5 } };
function profileOf(r: SimulateCaptureResult): SimulateCaptureResult["request"]["development"]["colorProfile"] { return r.request.development.colorProfile; }

describe("serializeNativeRawDng", { timeout: 120_000 }, () => {
  it.each([
    ["one-site margin (odd ActiveArea origin)", {}, { x: 1, y: 1 }, [2, 1, 1, 0]],
    ["mirror border (no margin)", { borderHandling: "mirror" as const }, { x: 0, y: 0 }, [0, 1, 1, 2]]
  ])("round-trips codes and every written tag through parseDngRawImage: %s", async (_name, output, origin, pattern) => {
    const r = await simulateCapture({ scene: { preset: "checkerboard" }, output: { width: 6, height: 4, whiteBalance: { kelvin: 5000 }, ...output } });
    const before = Array.from(r.raw.codes);
    const dng = await serializeNativeRawDng({ raw: r.raw, colorProfile: profileOf(r), noise, baselineExposureEv: 0.5, capturedAtUtc: "2026-10-17T08:30:00.250Z" });
    expect(Array.from(r.raw.codes)).toEqual(before); // read, not consumed
    const parsed = parseDngRawImage({ bytes: dng.bytes }), native = r.plan.exposure.geometry.nativeRaster;
    expect([parsed.width, parsed.height]).toEqual([native.pixelWidth, native.pixelHeight]);
    expect(parsed).toMatchObject({ dngVersion: [1, 4, 0, 0], make: "Photivra", model: "Photivra Virtual Camera", uniqueCameraModel: dng.uniqueCameraModel,
      orientation: 1, samplesPerPixel: 1, bitsPerSample: 16, compression: "uncompressed", photometricInterpretation: "cfa", calibrationIlluminant1: 21,
      rawDataUniqueId: dng.rawDataUniqueId, linearizationTable: null });
    expect(Array.from(parsed.codes)).toEqual(before);
    expect(parsed.activeArea).toEqual({ ...origin, width: 6, height: 4 });
    expect(dng.activeArea).toEqual(parsed.activeArea);
    expect(parsed.defaultCrop).toEqual({ x: 0, y: 0, width: 6, height: 4 });
    expect(parsed.cfa).toEqual({ repeatRows: 2, repeatColumns: 2, pattern, planeColors: [0, 1, 2] });
    expect(dng.cfaPattern).toEqual(pattern);
    expect(parsed.blackLevel).toEqual({ repeatRows: 2, repeatColumns: 2, values: dng.blackLevels, deltaH: null, deltaV: null });
    expect(parsed.whiteLevel).toEqual([dng.whiteLevel]);
    expect(dng.whiteLevel).toBe(Math.min(...r.raw.effectiveSaturationCodes));
    expect(parsed.colorMatrix1).toEqual(dng.colorMatrix1);
    expect(parsed.asShotNeutral).toEqual(dng.asShotNeutral);
    // The facade's camera->XYZ is diagonal, so ColorMatrix1 is its diagonal inverse (rational precision 1e-9).
    const m = profileOf(r).normalizedCameraChannelsToXyz;
    dng.colorMatrix1.forEach((v, i) => expect(v).toBeCloseTo(i % 4 === 0 ? 1 / m[i / 4]![i / 4]! : 0, 8));
    // AsShotNeutral is the camera neutral of the WB intent: green gain / channel gain.
    const gains = r.plan.exposure.whiteBalanceIntent!.channelGains;
    expect(dng.asShotNeutral[0]!).toBeCloseTo(gains.green / gains.red, 8);
    expect(dng.asShotNeutral[2]!).toBeCloseTo(gains.green / gains.blue, 8);
    expect(dng).toMatchObject({ source: "packed-native-raw", linearMasterDeclared: false, unrepresentedSaturationFlagCount: 0 });
    expect(new TextDecoder("latin1").decode(dng.bytes)).toContain("no linear master image or developed rendering is stored");
  });

  it("writes NoiseProfile from the declared output-referred gain and read noise, and is deterministic", async () => {
    const r = await simulateCapture({ scene: { preset: "uniform" }, output: { width: 4, height: 4 } });
    const dng = await serializeNativeRawDng({ raw: r.raw, colorProfile: profileOf(r), noise });
    const span = (c: number): number => dng.whiteLevel - dng.blackLevels[dng.cfaPattern.indexOf(c)]!;
    const expected = [noise.red, noise.green, noise.blue].flatMap((n, c) => [1 / (n.conversionGainElectronsPerCode * span(c)),
      (n.readNoiseRmsElectrons ** 2 / n.conversionGainElectronsPerCode ** 2 + 1 / 12) / span(c) ** 2]);
    dng.noiseProfile!.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 15));
    expect((await serializeNativeRawDng({ raw: r.raw, colorProfile: profileOf(r), noise })).bytes).toEqual(dng.bytes);
    expect((await serializeNativeRawDng({ raw: r.raw, colorProfile: profileOf(r) })).noiseProfile).toBeNull();
  });

  it("counts saturation flags DNG cannot carry and rejects inconsistent input", async () => {
    const r = await simulateCapture({ scene: { preset: "uniform" }, output: { width: 4, height: 4 } }), color = profileOf(r);
    const flagged = { ...r.raw, saturationFlags: r.raw.saturationFlags.slice() };
    flagged.saturationFlags[7] = 1;
    expect((await serializeNativeRawDng({ raw: flagged, colorProfile: color })).unrepresentedSaturationFlagCount).toBe(1);
    const blacks = { ...r.raw, blackLevels: r.raw.blackLevels.slice() };
    blacks.blackLevels[14]! -= 1;
    for (const bad of [
      { raw: blacks, colorProfile: color },
      { raw: r.raw, colorProfile: { ...color, colorSamplingProfileId: "other-cfa" } },
      { raw: r.raw, colorProfile: color, capturedAtUtc: "2026-10-17 08:30" },
      { raw: r.raw, colorProfile: color, baselineExposureEv: Number.NaN },
      { raw: r.raw, colorProfile: color, noise: { red: noise.red, green: noise.green } },
      { raw: r.raw, colorProfile: color, extra: 1 },
      { raw: { ...r.raw, codes: new Uint16Array(3) }, colorProfile: color }
    ]) await expect(serializeNativeRawDng(bad as never)).rejects.toThrow(InvalidConfigurationError);
  });
});
