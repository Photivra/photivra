// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { createSimulatedCapture, calculateCaptureColorTransform, resolveCaptureColorModel, parseCaptureColorTransformInput,
  createCaptureWhiteBalanceIntent, resolveManualWhiteBalance, parseSimulatedCapture,
  VIRTUAL_COLOR_CAMERA_PROFILE, type SimulatedCaptureInput, type CaptureColorTransformInput } from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";
const fixture = loadBasicReferenceFixture();
const model = resolveCaptureColorModel();
function captureInput(): SimulatedCaptureInput {
  return { captureId: "color-capture", sceneStateId: "fixture-scene", sceneTimeSeconds: 0,
    geometry: { imagingArea: fixture.sensor.imagingArea, nativeRaster: fixture.sensor.nativeRaster,
      orientation: "landscape", outputRaster: { pixelWidth: 2, pixelHeight: 1 } },
    exposure: { focalLengthMm: fixture.lens.focalLengthMm, aperture: fixture.lens.aperture,
      shutterSeconds: fixture.exposure.shutterSeconds, iso: fixture.exposure.iso },
    focus: { kind: "finite", distanceM: fixture.focus.distanceM },
    noise: { seedUint32: fixture.stochasticSeedUint32, realizationId: "noise", model: { id: "fixture-noise", version: "1" } },
    source: { kind: "scene-linear-master", artifactId: "fixture-master", sha256: "a".repeat(64), dynamicRangeHistory: "unknown" },
    whiteBalanceIntent: null, adoptedWhiteXyz: null,
    models: [{ profile: VIRTUAL_COLOR_CAMERA_PROFILE, scientificStatus: "calculated", publicEvidenceIds: model.publicEvidenceIds }],
    planes: [{ id: "source", imageStateId: "source-state", imageState: "scene-referred-xyz", rasterBinding: "output",
      pixelWidth: 2, pixelHeight: 1, channelIds: ["X", "Y", "Z"], colorProfile: { id: "cie-1931-2-degree-xyz", version: "1.0.0" },
      encodingReferenceWhiteXyz: model.referenceWhiteXyz, referenceWhiteValue: 1, whiteBalanceApplication: "not-applicable",
      captureSaturation: { kind: "not-modeled" }, appliedTransforms: [],
      storage: { kind: "inline-float64", samples: [model.referenceWhiteXyz.x, 1, model.referenceWhiteXyz.z, 0, 0, 0] } }] };
}
function request(value = captureInput()): CaptureColorTransformInput {
  return { capture: createSimulatedCapture(value).value, sourcePlaneId: "source", outputPlaneId: "rgb",
    outputImageStateId: "rgb-state", whiteBalance: { kind: "preserve-intent" } };
}
function samples(r: ReturnType<typeof calculateCaptureColorTransform>): readonly number[] {
  if (r.value.plane.storage.kind !== "inline-float64") throw new Error("fixture");
  return r.value.plane.storage.samples;
}
describe("virtual-camera colorimetry", () => {
  it("derives standard primary chromaticities and D65 white with independent reference coefficients", () => {
    expect(model.cameraRgbToXyz[0][0]).toBeCloseTo(.4123907992659595, 13);
    expect(model.cameraRgbToXyz[1][1]).toBeCloseTo(.7151686787677559, 13);
    expect(model.cameraRgbToXyz[2][2]).toBeCloseTo(.9505321522496607, 13);
    for (const [j, xy] of [[0, [.64, .33]], [1, [.30, .60]], [2, [.15, .06]]] as const) {
      const c = model.cameraRgbToXyz.map((r) => r[j]); const sum = c.reduce((a, b) => a+b, 0);
      expect(c[0]!/sum).toBeCloseTo(xy[0], 14); expect(c[1]!/sum).toBeCloseTo(xy[1], 14);
    }
    const r = calculateCaptureColorTransform(request());
    for (const n of samples(r).slice(0, 3)) expect(n).toBeCloseTo(1, 14);
    expect(samples(r).slice(3)).toEqual([0, 0, 0]); expect(r.provenance.kind).toBe("calculated");
    expect(r.value.colorModel.referenceIlluminant).toBe("D65");
  });
  it("preserves signed/headroom virtual RGB exactly and does not promote arbitrary sensor RGB", () => {
    const value = captureInput(); const p = value.planes[0]!;
    value.planes = [{ ...p, imageState: "virtual-sensor-channels", channelIds: ["red", "green", "blue"],
      colorProfile: VIRTUAL_COLOR_CAMERA_PROFILE, encodingReferenceWhiteXyz: null,
      storage: { kind: "inline-float64", samples: [-.2, 4, 2, 0, .5, 1] } }];
    expect(samples(calculateCaptureColorTransform(request(value)))).toEqual([-.2, 4, 2, 0, .5, 1]);
    value.planes = [{ ...value.planes[0]!, colorProfile: { id: "spectral-camera", version: "1" } }];
    expect(() => calculateCaptureColorTransform(request(value))).toThrow();
  });
  it("retains WB intent or applies gains only on the explicitly bound camera basis", () => {
    const value = captureInput(); value.whiteBalanceIntent = createCaptureWhiteBalanceIntent({
      state: resolveManualWhiteBalance({ stateId: "wb", channelGains: { red: 2, green: 1, blue: .5 } }) });
    const input = request(value); const unchanged = JSON.stringify(input.capture);
    expect(calculateCaptureColorTransform(input).value.plane.whiteBalanceApplication).toBe("intent-only");
    input.whiteBalance = { kind: "apply-resolved-rgb-gains", channelBasis: VIRTUAL_COLOR_CAMERA_PROFILE };
    const transformed = calculateCaptureColorTransform(input);
    samples(transformed).slice(0, 3).forEach((n, i) => expect(n).toBeCloseTo([2, 1, .5][i]!, 14));
    expect(transformed.value.plane.whiteBalanceApplication).toBe("applied-rgb-gains");
    expect(JSON.stringify(input.capture)).toBe(unchanged);
    expect(transformed.value.plane.referenceWhiteValue).toBe(1);
    expect(input.capture.exposure).toEqual(value.exposure); expect(input.capture.noise.seedUint32).toBe(fixture.stochasticSeedUint32);
    input.whiteBalance = { kind: "apply-resolved-rgb-gains", channelBasis: { id: "other", version: "1" } };
    expect(() => calculateCaptureColorTransform(input)).toThrow();
    expect(() => calculateCaptureColorTransform({ ...request(), whiteBalance: { kind: "apply-resolved-rgb-gains", channelBasis: VIRTUAL_COLOR_CAMERA_PROFILE } })).toThrow();
  });
  it("records an approximate adopted-white transform independently of RGB gains and mixed-light truth", () => {
    const value = captureInput(); value.adoptedWhiteXyz = { x: .9, y: 1, z: .7 };
    value.planes = [{ ...value.planes[0]!, encodingReferenceWhiteXyz: { x: .9, y: 1, z: .7 },
      storage: { kind: "inline-float64", samples: [.9, 1, .7, 1.8, 2, 1.4] } }];
    expect(() => calculateCaptureColorTransform(request(value))).toThrow();
    const r = calculateCaptureColorTransform({ ...request(value), whiteBalance: { kind: "adopted-white-xyz-scaling" } });
    samples(r).forEach((n, i) => expect(n).toBeCloseTo(i < 3 ? 1 : 2, 14));
    expect(r.provenance.kind).toBe("approximation"); expect(r.value.claimsUniqueSceneWhite).toBe(false);
    expect(r.value.plane.whiteBalanceApplication).toBe("applied-chromatic-adaptation");
    expect(r.value.plane.appliedTransforms[0]!.kind).toBe("chromatic-adaptation");
    expect(r.value.chromaticAdaptationMatrix[1]).toEqual([0, 1, 0]);
    expect(() => calculateCaptureColorTransform({ ...request(), whiteBalance: { kind: "adopted-white-xyz-scaling" } })).toThrow();
    value.adoptedWhiteXyz.x = Number.MIN_VALUE;
    expect(() => calculateCaptureColorTransform({ ...request(value), whiteBalance: { kind: "adopted-white-xyz-scaling" } })).toThrow();
  });
  it("rejects repeated application, external samples, malformed policies, private IDs and non-finite arithmetic", () => {
    const input = request(); const r = calculateCaptureColorTransform(input);
    const recaptured = parseSimulatedCapture({ ...input.capture, planes: [r.value.plane] });
    expect(() => calculateCaptureColorTransform({ ...input, capture: recaptured, sourcePlaneId: "rgb", outputPlaneId: "rgb2", outputImageStateId: "rgb2-state" })).toThrow();
    for (const bad of [{ ...input, outputPlaneId: "source" }, { ...input, outputImageStateId: "source-state" },
      { ...input, outputPlaneId: "/private/output" }, { ...input, sourcePlaneId: "absent" },
      { ...input, whiteBalance: { kind: "unknown" } }, { ...input, whiteBalance: { kind: "preserve-intent", channelBasis: VIRTUAL_COLOR_CAMERA_PROFILE } },
      { ...input, debug: "private" }]) expect(() => calculateCaptureColorTransform(parseCaptureColorTransformInput(bad))).toThrow();
    const value = captureInput(); const p = value.planes[0]!;
    value.planes = [{ ...p, storage: { kind: "external-float64", artifactId: "external", sha256: "b".repeat(64), byteOrder: "little-endian", sampleCount: 6 } }];
    expect(() => calculateCaptureColorTransform(request(value))).toThrow();
    value.planes = [{ ...p, storage: { kind: "inline-float64", samples: [Number.MAX_VALUE, 0, 0, 0, 0, 0] } }];
    expect(() => calculateCaptureColorTransform(request(value))).toThrow();
  });
  it("upgrades 0.1 archives and requires truthful new adaptation metadata", () => {
    const c = request().capture;
    expect(parseSimulatedCapture({ ...c, schemaVersion: "0.1.0" }).schemaVersion).toBe("0.2.0");
    const p = { ...c.planes[0]!, whiteBalanceApplication: "applied-chromatic-adaptation" };
    expect(() => parseSimulatedCapture({ ...c, planes: [p] })).toThrow();
    expect(() => parseSimulatedCapture({ ...c, schemaVersion: "0.1.0", planes: [p] })).toThrow();
    const m = resolveCaptureColorModel(); (m.cameraRgbToXyz[0] as unknown as number[])[0] = 99;
    expect(resolveCaptureColorModel().cameraRgbToXyz[0][0]).toBeCloseTo(.4123907992659595, 13);
  });
});
