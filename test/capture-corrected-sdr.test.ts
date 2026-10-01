// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { createSimulatedCapture, calculateCaptureColorTransform, calculateCaptureCorrectedSdr, parseCaptureCorrectedSdrInput,
  VIRTUAL_COLOR_CAMERA_PROFILE, type CaptureCorrectedSdrInput, type CaptureOrientation } from "../src/index.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";
import { correctionProfile, state, resampler } from "./optics-group-fixtures.js";

function input(orientation: CaptureOrientation = "landscape"): CaptureCorrectedSdrInput {
  const raw = loadLinearCaptureInput();
  raw.sceneTimeSeconds = 123;
  raw.geometry = { imagingArea: { widthMm: 5, heightMm: 5 }, nativeRaster: { pixelWidth: 5, pixelHeight: 5 }, orientation };
  raw.exposure = { ...raw.exposure, focalLengthMm: 50, aperture: 4 };
  raw.focus = { kind: "finite", distanceM: 3 };
  raw.planes = [{ ...raw.planes[0]!, rasterBinding: "oriented-active-capture", pixelWidth: 5, pixelHeight: 5,
    imageState: "virtual-sensor-channels", channelIds: ["red", "green", "blue"], colorProfile: VIRTUAL_COLOR_CAMERA_PROFILE,
    encodingReferenceWhiteXyz: null,
    storage: { kind: "inline-float64", samples: Array.from({ length: 75 }, (_, i) => (i+1)/100) } }];
  return { capture: createSimulatedCapture(raw).value, sourcePlaneId: "source",
    color: { kind: "transform", outputPlaneId: "rgb", outputImageStateId: "rgb-state", whiteBalance: { kind: "preserve-intent" } },
    profile: { schemaVersion: "0.1.0", profileId: "neutral", profileVersion: "1", renderingExposureEv: 0,
      toneCurve: "identity", gamutHandling: "clip-components", outputDynamicRange: "sdr", transferFunction: "srgb",
      bitDepth: 16, rounding: "nearest-ties-up", dither: "none" },
    correction: { profile: correctionProfile, state, coordinateFrame: "native-optical-linear-srgb-d65",
      selections: { geometry: "off", gain: "off" }, selectionKind: "camera-selectable", frameTimeSeconds: 0,
      resampler, clippingLevel: 10, invalidSupport: "reject", outputImageStateId: "corrected-state" } };
}
function shifted(v: CaptureCorrectedSdrInput, x = 1): CaptureCorrectedSdrInput {
  const geometry = v.correction.profile.components[0]!;
  if (geometry.kind !== "geometry" || geometry.transform.kind !== "affine") throw new Error("Fixture requires affine geometry.");
  return { ...v, correction: { ...v.correction, selections: { geometry: "on", gain: "off" }, profile: {
    ...v.correction.profile, components: [{ ...geometry, transform: { ...geometry.transform, offsetMm: { x, y: 0 } } },
      ...v.correction.profile.components.slice(1)] } } };
}
describe("capture-bound corrected SDR", () => {
  it("preserves signed headroom, source history, scene clock and the same capture/noise realization", () => {
    const v = input(), raw = loadLinearCaptureInput();
    const source = v.capture.planes[0]!;
    raw.geometry = v.capture.geometry; raw.exposure = v.capture.exposure; raw.focus = v.capture.focus; raw.sceneTimeSeconds = 123;
    if (source.storage.kind !== "inline-float64") throw new Error("Inline fixture required.");
    raw.source.dynamicRangeHistory = "upstream-clipped";
    raw.planes = [{ ...source, captureSaturation: { kind: "declared-virtual-white", whiteLevel: 2, upstreamClippedSampleCount: 1 },
      storage: { kind: "inline-float64", samples: [-.1, 2, .3, ...source.storage.samples.slice(3)] } }];
    v.capture = createSimulatedCapture(raw).value;
    const before = JSON.stringify(v), r = calculateCaptureCorrectedSdr(v);
    expect(r.value.outputView.samples.slice(0, 3)).toEqual([-.1, 2, .3]);
    expect(r.value.sourceDynamicRangeHistory).toBe("upstream-clipped");
    expect(r.value.sourceCaptureSaturation).toEqual(raw.planes[0]!.captureSaturation);
    expect(r.value.correction.value.illuminationClippingEventCount).toBe(0);
    expect(r.value.rendering.value.diagnostics.gamutClippedHighSampleCount).toBe(1);
    expect(r.value.correction.value.timeSeconds).toBe(0); expect(r.value.sceneTimeSeconds).toBe(123);
    expect(r.value.captureId).toBe(v.capture.captureId); expect(r.value.noiseRealizationId).toBe(v.capture.noise.realizationId);
    expect(r.provenance.kind).toBe("approximation"); expect(JSON.stringify(v)).toBe(before);
    expect(calculateCaptureCorrectedSdr(v)).toEqual(r);
  });
  it("uses exact native/oriented permutations for all orientations and applies native +X shifts consistently", () => {
    const expectedRects = [{ x: 0, y: 0, width: 4, height: 5 }, { x: 0, y: 0, width: 5, height: 4 },
      { x: 1, y: 0, width: 4, height: 5 }, { x: 0, y: 1, width: 5, height: 4 }];
    (["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const).forEach((o, i) => {
      const v = input(o), neutral = calculateCaptureCorrectedSdr(v).value;
      expect(neutral.outputView.samples).toEqual(v.capture.planes[0]!.storage.kind === "inline-float64" ? v.capture.planes[0]!.storage.samples : []);
      const s = shifted(v); expect(() => calculateCaptureCorrectedSdr(s)).toThrow();
      s.correction.invalidSupport = "joint-valid-crop";
      const r = calculateCaptureCorrectedSdr(s).value;
      expect(r.outputView.rect).toEqual(expectedRects[i]); expect(r.validSourceMask.filter(Boolean).length).toBe(20);
      expect(r.outputView.samples.length).toBe(60); expect(r.rendering.value.integerSamples.length).toBe(60);
      expect(r.correction.value.samplingPlans.red!.mapping.transforms.length).toBe(1);
    });
  });
  it("honors off-center declared output crop even with corrections Off, without changing physical geometry", () => {
    const v = input(), raw = loadLinearCaptureInput();
    raw.geometry = { ...v.capture.geometry, outputCropRect: { x: 2, y: 1, width: 3, height: 3 } };
    raw.exposure = v.capture.exposure; raw.focus = v.capture.focus; raw.planes = [...v.capture.planes];
    v.capture = createSimulatedCapture(raw).value;
    v.correction.state = { ...state, outputWidth: 3, outputHeight: 3 };
    v.correction.profile = { ...correctionProfile, state: v.correction.state };
    const r = calculateCaptureCorrectedSdr(v).value;
    expect(r.correction.value.samplingPlans.red!.destinationRaster.centerMm).toEqual({ x: 1, y: 0 });
    expect(r.outputView.samples.slice(0, 3)).toEqual([.22, .23, .24]);
    expect(r.outputView.pixelWidth).toBe(3); expect(v.capture.resolvedGeometry.activeCapture.raster.pixelWidth).toBe(5);
  });
  it("keeps illumination clipping events separate from SDR clipping and honors reference bypass", () => {
    const v = input(); v.correction.selections = { geometry: "on", gain: "on" }; v.correction.clippingLevel = .1;
    const r = calculateCaptureCorrectedSdr(v).value;
    expect(r.correction.value.illuminationClippingEventCount).toBeGreaterThan(0);
    expect(r.rendering.value.diagnostics.gamutClippedHighSampleCount).toBe(0);
    v.correction.selectionKind = "reference-bypass";
    expect(calculateCaptureCorrectedSdr(v).value.correction.value.illuminationClippingEventCount).toBe(0);
  });
  it("rejects mismatched optics/native state, wrong clock, unsupported pitch, unavailable support and private fields", () => {
    const v = input();
    for (const patch of [{ state: { ...state, aperture: 8 } }, { frameTimeSeconds: 123 }, { frameTimeSeconds: NaN },
      { clippingLevel: 0 }, { coordinateFrame: "oriented" }, { invalidSupport: "pad-black" },
      { outputImageStateId: "source-state" }, { outputImageStateId: "rgb-state" }, { outputImageStateId: "/private" },
      { resampler: { ...resampler, filter: "unknown" } }, { selections: { missing: "off" } }, { debug: "private" }]) {
      expect(() => calculateCaptureCorrectedSdr({ ...v, correction: { ...v.correction, ...patch } } as CaptureCorrectedSdrInput)).toThrow();
    }
    expect(() => parseCaptureCorrectedSdrInput(null)).toThrow();
    expect(() => parseCaptureCorrectedSdrInput({ ...v, debug: "private" })).toThrow();
    const raw = loadLinearCaptureInput(); raw.geometry = { ...v.capture.geometry, imagingArea: { widthMm: 6, heightMm: 5 } };
    raw.exposure = v.capture.exposure; raw.focus = v.capture.focus; raw.planes = [...v.capture.planes];
    expect(() => calculateCaptureCorrectedSdr({ ...v, capture: createSimulatedCapture(raw).value })).toThrow();
    const empty = shifted(v, 100); empty.correction.invalidSupport = "joint-valid-crop";
    expect(() => calculateCaptureCorrectedSdr(empty)).toThrow();
  });
  it("reuses completed color/WB, refuses intent-only, double corrections and external storage", () => {
    const v = input(), plane = calculateCaptureColorTransform({ capture: v.capture, sourcePlaneId: "source",
      outputPlaneId: "rgb", outputImageStateId: "rgb-state", whiteBalance: { kind: "preserve-intent" } }).value.plane;
    const raw = loadLinearCaptureInput(); raw.geometry = v.capture.geometry; raw.exposure = v.capture.exposure; raw.focus = v.capture.focus;
    raw.planes = [plane]; v.capture = createSimulatedCapture(raw).value; v.sourcePlaneId = "rgb"; v.color = { kind: "already-transformed" };
    expect(calculateCaptureCorrectedSdr(v).value.color).toBeNull();
    raw.planes = [{ ...plane, appliedTransforms: [...plane.appliedTransforms,
      { kind: "digital-lens-correction", profile: { id: "earlier", version: "1" } }] }];
    expect(() => calculateCaptureCorrectedSdr({ ...v, capture: createSimulatedCapture(raw).value })).toThrow();
    raw.planes = [{ ...plane, storage: { kind: "external-float32", byteOrder: "little-endian", artifactId: "external",
      sha256: "b".repeat(64), sampleCount: 75 } }];
    expect(() => calculateCaptureCorrectedSdr({ ...v, capture: createSimulatedCapture(raw).value })).toThrow();
    const pending = input(), pendingRaw = loadLinearCaptureInput(); pendingRaw.geometry = pending.capture.geometry;
    pendingRaw.exposure = pending.capture.exposure; pendingRaw.focus = pending.capture.focus;
    pendingRaw.whiteBalanceIntent = { stateId: "wb", source: "manual-gains", locked: true,
      channelGains: { red: 2, green: 1, blue: .5 }, sourceProfile: null };
    pendingRaw.planes = [{ ...pending.capture.planes[0]!, whiteBalanceApplication: "intent-only" }];
    expect(() => calculateCaptureCorrectedSdr({ ...pending, capture: createSimulatedCapture(pendingRaw).value })).toThrow();
  });
});
