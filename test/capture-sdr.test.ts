// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { createSimulatedCapture, calculateCaptureSdr, parseCaptureSdrInput, calculateCaptureColorTransform,
  VIRTUAL_COLOR_CAMERA_PROFILE, type CaptureSdrInput } from "../src/index.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";

function input(): CaptureSdrInput {
  return { capture: createSimulatedCapture(loadLinearCaptureInput()).value, sourcePlaneId: "source",
    color: { kind: "transform", outputPlaneId: "rgb", outputImageStateId: "rgb-state", whiteBalance: { kind: "preserve-intent" } },
    profile: { schemaVersion: "0.1.0", profileId: "neutral", profileVersion: "1", renderingExposureEv: 0,
      toneCurve: "identity", gamutHandling: "clip-components", outputDynamicRange: "sdr", transferFunction: "srgb",
      bitDepth: 16, rounding: "nearest-ties-up", dither: "none" } };
}
describe("capture to SDR adapter", () => {
  it("converts canonical XYZ white/black without mutating capture, and keeps history distinct", () => {
    const v = input(), before = JSON.stringify(v), r = calculateCaptureSdr(v).value;
    expect(r.rendering.value.integerSamples).toEqual([65535, 65535, 65535, 0, 0, 0]);
    expect(r.whiteBalance).toBe("not-required"); expect(r.sourceCaptureSaturation).toEqual({ kind: "not-modeled" });
    expect(r.rendering.value.diagnostics.captureSaturation).toBe("not-consumed");
    expect(r.sourceDynamicRangeHistory).toBe("unknown"); expect(r.rasterBinding).toBe("output");
    expect(r.color?.value.sourceImageStateId).toBe("source-state");
    expect(JSON.stringify(v)).toBe(before); expect(calculateCaptureSdr(v).value).toEqual(r);
  });
  it("accepts exact already-transformed RGB without a second color operation", () => {
    const v = input();
    const plane = calculateCaptureColorTransform({ capture: v.capture, sourcePlaneId: "source", outputPlaneId: "rgb",
      outputImageStateId: "rgb-state", whiteBalance: { kind: "preserve-intent" } }).value.plane;
    v.capture = createSimulatedCapture({ ...loadLinearCaptureInput(), planes: [plane] }).value;
    v.sourcePlaneId = "rgb"; v.color = { kind: "already-transformed" };
    const r = calculateCaptureSdr(v).value; expect(r.color).toBeNull();
    expect(r.rendering.value.integerSamples).toEqual([65535, 65535, 65535, 0, 0, 0]);
    expect(() => calculateCaptureSdr({ ...v, color: input().color })).toThrow();
  });
  it("applies resolved WB exactly once, never relabels pending intent", () => {
    const raw = loadLinearCaptureInput();
    raw.whiteBalanceIntent = { stateId: "wb", source: "manual-gains", locked: true,
      channelGains: { red: 2, green: 1, blue: .5 }, sourceProfile: null };
    raw.planes = [{ ...raw.planes[0]!, imageState: "virtual-sensor-channels", channelIds: ["red", "green", "blue"],
      colorProfile: VIRTUAL_COLOR_CAMERA_PROFILE, encodingReferenceWhiteXyz: null, whiteBalanceApplication: "intent-only",
      storage: { kind: "inline-float64", samples: [.25, .25, .25, 0, 0, 0] } }];
    const v = input(); v.capture = createSimulatedCapture(raw).value;
    expect(() => calculateCaptureSdr(v)).toThrow();
    v.color = { kind: "transform", outputPlaneId: "rgb", outputImageStateId: "rgb-state",
      whiteBalance: { kind: "apply-resolved-rgb-gains", channelBasis: VIRTUAL_COLOR_CAMERA_PROFILE } };
    const r = calculateCaptureSdr(v).value; expect(r.whiteBalance).toBe("applied-here");
    expect(r.rendering.value.toneMappedLinearSamples).toEqual([.5, .25, .125, 0, 0, 0]);
    const derived = { ...raw, planes: [r.color!.value.plane] };
    v.capture = createSimulatedCapture(derived).value; v.sourcePlaneId = "rgb"; v.color = { kind: "already-transformed" };
    expect(calculateCaptureSdr(v).value.whiteBalance).toBe("already-applied-upstream");
  });
  it("preserves adopted-white approximation status and source saturation separately from output clipping", () => {
    const raw = loadLinearCaptureInput(); raw.adoptedWhiteXyz = { x: 1, y: 1, z: 1 };
    raw.planes = [{ ...raw.planes[0]!, captureSaturation: { kind: "declared-virtual-white", whiteLevel: 2,
      upstreamClippedSampleCount: 1 }, storage: { kind: "inline-float64", samples: [3, 3, 3, 0, 0, 0] } }];
    const v = input(); v.capture = createSimulatedCapture(raw).value;
    v.color = { kind: "transform", outputPlaneId: "rgb", outputImageStateId: "rgb-state",
      whiteBalance: { kind: "adopted-white-xyz-scaling" } };
    const r = calculateCaptureSdr(v); expect(r.provenance.kind).toBe("approximation");
    expect(r.value.sourceCaptureSaturation).toEqual(raw.planes[0]!.captureSaturation);
    expect(r.value.rendering.value.diagnostics.gamutClippedHighSampleCount).toBe(3);
  });
  it("rejects unknown/private policy, missing planes and unresolved RGB profile versions", () => {
    const v = input();
    for (const patch of [{ sourcePlaneId: "missing" }, { debug: "private" }, { color: null },
      { color: { kind: "automatic" } }, { color: { kind: "already-transformed", outputPlaneId: "ignored" } }]) {
      expect(() => parseCaptureSdrInput({ ...v, ...patch })).toThrow();
    }
    expect(() => parseCaptureSdrInput(null)).toThrow();
    expect(() => calculateCaptureSdr({ ...v, color: { kind: "already-transformed" } })).toThrow();
    const r = calculateCaptureSdr(v).value;
    const raw = loadLinearCaptureInput(); raw.planes = [{ ...r.color!.value.plane, colorProfile: { id: "linear-srgb-d65", version: "2" } }];
    v.capture = createSimulatedCapture(raw).value; v.sourcePlaneId = "rgb"; v.color = { kind: "already-transformed" };
    expect(() => calculateCaptureSdr(v)).toThrow();
  });
  it("rejects external storage and oversized rasters without loading, truncating or downsampling", () => {
    const raw = loadLinearCaptureInput(); raw.planes = [{ ...raw.planes[0]!, storage: { kind: "external-float32",
      byteOrder: "little-endian", artifactId: "external", sha256: "b".repeat(64), sampleCount: 6 } }];
    expect(() => calculateCaptureSdr({ ...input(), capture: createSimulatedCapture(raw).value })).toThrow();
    const large = loadLinearCaptureInput(); large.geometry.outputRaster = { pixelWidth: 600, pixelHeight: 300 };
    large.planes = [{ ...large.planes[0]!, pixelWidth: 600, pixelHeight: 300,
      storage: { kind: "inline-float64", samples: Array<number>(540000).fill(0) } }];
    expect(() => calculateCaptureSdr({ ...input(), capture: createSimulatedCapture(large).value })).toThrow();
  });
});
