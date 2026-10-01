// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  createSimulatedCapture, parseSimulatedCapture, serializeSimulatedCapture, resolveSimulatedCapturePlane,
  createCaptureWhiteBalanceIntent, resolveManualWhiteBalance, type SimulatedCaptureInput, type CaptureLinearPlane
} from "../src/index.js";
import { loadBasicReferenceFixture } from "./helpers/basic-reference-fixture.js";
const fixture = loadBasicReferenceFixture();
const plane: CaptureLinearPlane = {
  id: "xyz", imageStateId: "linear-xyz-1", imageState: "scene-referred-xyz", rasterBinding: "output",
  pixelWidth: 3, pixelHeight: 2, channelIds: ["X", "Y", "Z"], colorProfile: { id: "cie-1931-2-degree-xyz", version: "1.0.0" },
  encodingReferenceWhiteXyz: { x: 1, y: 1, z: 1 }, referenceWhiteValue: 1, whiteBalanceApplication: "not-applicable",
  captureSaturation: { kind: "not-modeled" }, appliedTransforms: [],
  storage: { kind: "inline-float64", samples: [-.01, 0, 4, .1, .2, .3, 0, 0, 0, 2, 3, 4, .5, .6, .7, 1, 1, 1] }
};
function input(): SimulatedCaptureInput {
  return { captureId: "capture-1", sceneStateId: "scene-1", sceneTimeSeconds: 0,
    geometry: { imagingArea: fixture.sensor.imagingArea, nativeRaster: fixture.sensor.nativeRaster, orientation: "landscape",
      outputRaster: { pixelWidth: 3, pixelHeight: 2 } },
    exposure: { focalLengthMm: fixture.lens.focalLengthMm, aperture: fixture.lens.aperture,
      shutterSeconds: fixture.exposure.shutterSeconds, iso: fixture.exposure.iso },
    focus: { kind: "finite", distanceM: fixture.focus.distanceM },
    noise: { seedUint32: fixture.stochasticSeedUint32, realizationId: "noise-1", model: { id: "poisson-read", version: "1" } },
    source: { kind: "scene-linear-master", artifactId: "master-1", sha256: "a".repeat(64), dynamicRangeHistory: "unknown" },
    whiteBalanceIntent: null, adoptedWhiteXyz: null,
    models: [{ profile: { id: "test-master", version: "1" }, scientificStatus: "approximation", publicEvidenceIds: ["test:owned-master"] }],
    planes: [structuredClone(plane)] };
}
describe("authoritative simulated capture container", () => {
  it("preserves float headroom, negative values, canonical fixture geometry and upstream status", () => {
    const result = createSimulatedCapture(input());
    expect(result.value.equivalentFocalLength35Mm).toBe(fixture.lens.focalLengthMm);
    expect(result.value.resolvedGeometry.native.raster).toEqual(fixture.sensor.nativeRaster);
    expect(result.value.planes[0]!.storage).toEqual(plane.storage);
    expect(result.value.models[0]!.scientificStatus).toBe("approximation");
    expect(result.value.noise.seedUint32).toBe(fixture.stochasticSeedUint32);
    expect(result.value.source.dynamicRangeHistory).toBe("unknown");
  });
  it("commits deep immutable copies and reproduces canonical JSON", () => {
    const original = input(), committed = createSimulatedCapture(original).value;
    expect(Object.isFrozen(committed)).toBe(true); expect(Object.isFrozen(committed.planes[0]!.storage)).toBe(true);
    const before = serializeSimulatedCapture({ capture: committed });
    if (original.planes[0]!.storage.kind !== "inline-float64") throw new Error("fixture");
    (original.planes[0]!.storage.samples as number[])[0] = 999;
    expect(serializeSimulatedCapture({ capture: committed })).toBe(before);
    expect(serializeSimulatedCapture({ capture: createSimulatedCapture(input()).value })).toBe(before);
    expect(parseSimulatedCapture(JSON.parse(before))).toEqual(committed);
    const reordered = JSON.parse(before);
    reordered.resolvedGeometry.native = { raster: reordered.resolvedGeometry.native.raster, imagingArea: reordered.resolvedGeometry.native.imagingArea };
    expect(serializeSimulatedCapture({ capture: parseSimulatedCapture(reordered) })).toBe(before);
  });
  it("keeps physical active capture, off-center output and all four orientations distinct", () => {
    for (const orientation of ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const) {
      const portrait = orientation.startsWith("portrait");
      const value = input();
      value.geometry = { imagingArea: { widthMm: 36, heightMm: 24 }, nativeRaster: { pixelWidth: 6, pixelHeight: 4 },
        orientation, activeCaptureRect: { x: 1, y: 1, width: 4, height: 2 },
        outputCropRect: { x: 0, y: 0, width: portrait ? 1 : 2, height: portrait ? 2 : 1 } };
      value.planes = [{ ...plane, pixelWidth: portrait ? 1 : 2, pixelHeight: portrait ? 2 : 1,
        storage: { kind: "inline-float64", samples: [0, 0, 0, 1, 1, 1] } }];
      const capture = createSimulatedCapture(value).value;
      expect(capture.resolvedGeometry.activeCapture.imagingArea).toEqual({ widthMm: 24, heightMm: 12 });
      expect(capture.resolvedGeometry.orientedCapture.orientation).toBe(orientation);
      expect(capture.resolvedGeometry.output.centerOffsetFromOpticalAxisMm.x).not.toBe(0);
      const expected = fixture.lens.focalLengthMm*Math.hypot(36, 24)/Math.hypot(24, 12);
      expect(capture.equivalentFocalLength35Mm).toBeCloseTo(expected, 12);
    }
  });
  it("records resolved WB intent without altering samples and separates adopted/encoding white", () => {
    const state = resolveManualWhiteBalance({ stateId: "wb-1", channelGains: { red: 2, green: 1, blue: .5 } });
    const value = input(); value.whiteBalanceIntent = createCaptureWhiteBalanceIntent({ state });
    value.adoptedWhiteXyz = { x: .9, y: 1, z: .7 };
    const captured = createSimulatedCapture(value).value;
    expect(captured.planes[0]!.storage).toEqual(plane.storage);
    expect(captured.whiteBalanceIntent!.channelGains).toEqual(state.channelGains);
    expect(captured.adoptedWhiteXyz).not.toBe(captured.planes[0]!.encodingReferenceWhiteXyz);
    const withPrivateExtras = { ...state, privatePath: "/private/secret", limitations: ["private narrative"] };
    expect(JSON.stringify(createCaptureWhiteBalanceIntent({ state: withPrivateExtras }))).not.toContain("private");
    expect(() => createCaptureWhiteBalanceIntent({ state: { ...state, stateId: "/private/id" } })).toThrow();
  });
  it("rejects state substitution and distinguishes applied RGB gains from untouched channels", () => {
    const value = input(); value.whiteBalanceIntent = createCaptureWhiteBalanceIntent({
      state: resolveManualWhiteBalance({ stateId: "wb-1", channelGains: { red: 2, green: 1, blue: .5 } }) });
    value.planes = [{ ...plane, id: "sensor", imageStateId: "sensor-1", imageState: "virtual-sensor-channels",
      channelIds: ["red", "green", "blue"], colorProfile: { id: "virtual-channels", version: "1" },
      encodingReferenceWhiteXyz: null, whiteBalanceApplication: "intent-only" }];
    const capture = createSimulatedCapture(value).value;
    expect(resolveSimulatedCapturePlane({ capture, planeId: "sensor", requiredImageState: "virtual-sensor-channels" }).whiteBalanceApplication).toBe("intent-only");
    expect(() => resolveSimulatedCapturePlane({ capture, planeId: "sensor", requiredImageState: "scene-referred-xyz" })).toThrow();
    value.planes = [{ ...value.planes[0]!, whiteBalanceApplication: "applied-rgb-gains" }];
    expect(createSimulatedCapture(value).value.planes[0]!.whiteBalanceApplication).toBe("applied-rgb-gains");
    expect(() => createSimulatedCapture({ ...value, whiteBalanceIntent: null })).toThrow();
  });
  it("carries transformed RGB history without inferring a measured commercial sensor profile", () => {
    const value = input();
    value.planes = [{ ...plane, imageState: "color-transformed-linear-rgb", channelIds: ["red", "green", "blue"],
      colorProfile: { id: "declared-linear-rgb", version: "1" }, appliedTransforms: [{ profile: { id: "linear-transform", version: "1" }, kind: "linear-color" }] }];
    expect(createSimulatedCapture(value).value.planes[0]!.imageState).toBe("color-transformed-linear-rgb");
    expect(() => createSimulatedCapture({ ...value, planes: [{ ...value.planes[0]!, appliedTransforms: [] }] })).toThrow();
  });
  it("carries native-size external float planes with exact layout/digest/count and no allocation", () => {
    const value = input(), count = fixture.sensor.nativeRaster.pixelWidth*fixture.sensor.nativeRaster.pixelHeight*3;
    value.planes = [{ ...plane, rasterBinding: "oriented-active-capture", ...fixture.sensor.nativeRaster,
      storage: { kind: "external-float32", byteOrder: "little-endian", artifactId: "master-plane", sha256: "b".repeat(64), sampleCount: count } }];
    const capture = createSimulatedCapture(value).value;
    expect(capture.planes[0]!.storage.kind).toBe("external-float32");
    expect(parseSimulatedCapture(JSON.parse(serializeSimulatedCapture({ capture })))).toEqual(capture);
    value.planes = [{ ...value.planes[0]!, storage: { kind: "external-float64", byteOrder: "little-endian", artifactId: "master-plane64", sha256: "c".repeat(64), sampleCount: count } }];
    expect(createSimulatedCapture(value).value.planes[0]!.storage.kind).toBe("external-float64");
  });
  it("preserves upstream saturation separately from reference white without clamping", () => {
    const value = input(); value.source.dynamicRangeHistory = "upstream-clipped";
    value.planes = [{ ...plane, referenceWhiteValue: .5, captureSaturation: { kind: "declared-virtual-white", whiteLevel: 4, upstreamClippedSampleCount: 2 } }];
    const result = createSimulatedCapture(value).value;
    expect(result.planes[0]!.captureSaturation).toEqual(value.planes[0]!.captureSaturation);
    expect(result.planes[0]!.referenceWhiteValue).toBe(.5); expect(result.planes[0]!.storage).toEqual(plane.storage);
    expect(result.source.dynamicRangeHistory).toBe("upstream-clipped");
  });
  it("rejects LDR/tonemapped provenance and private/nonallowlisted metadata at each boundary", () => {
    const value = input();
    for (const extra of [
      { ...value, email: "private@example.test" },
      { ...value, source: { ...value.source, kind: "ldr-preview" } },
      { ...value, source: { ...value.source, artifactId: "/private/source.blend" } },
      { ...value, source: { ...value.source, artifactId: "https://internal.test" } },
      { ...value, geometry: { ...value.geometry, privatePath: "secret" } },
      { ...value, models: [{ ...value.models[0], prompt: "secret" }] },
      { ...value, planes: [{ ...plane, debug: {} }] },
      { ...value, planes: [{ ...plane, appliedTransforms: [{ profile: { id: "x", version: "1" }, kind: "tone-map" }] }] }
    ]) expect(() => createSimulatedCapture(extra as SimulatedCaptureInput)).toThrow();
  });
  it("rejects invalid sample counts, finite values, sparse/duplicate states and archive tampering", () => {
    const value = input();
    for (const p of [
      { ...plane, pixelWidth: 4 }, { ...plane, channelIds: ["X", "X", "Z"] },
      { ...plane, encodingReferenceWhiteXyz: { x: 1, y: 2, z: 1 } },
      { ...plane, colorProfile: null }, { ...plane, colorProfile: { id: "cie-1964", version: "1" } },
      { ...plane, whiteBalanceApplication: "applied-rgb-gains" },
      { ...plane, storage: { kind: "inline-float64", samples: [0] } },
      { ...plane, storage: { kind: "inline-float64", samples: Array(18) } },
      { ...plane, storage: { kind: "inline-float64", samples: Array<number>(18).fill(NaN) } },
      { ...plane, storage: { kind: "inline-float64", samples: Array<number>(18).fill(Infinity) } },
      { ...plane, storage: { kind: "external-float32", byteOrder: "big-endian", artifactId: "x", sha256: "b".repeat(64), sampleCount: 18 } },
      { ...plane, storage: { kind: "external-float32", byteOrder: "little-endian", artifactId: "x", sha256: "invalid", sampleCount: 18 } },
      { ...plane, captureSaturation: { kind: "declared-virtual-white", whiteLevel: 4, upstreamClippedSampleCount: 19 } }
    ]) expect(() => createSimulatedCapture({ ...value, planes: [p] } as SimulatedCaptureInput)).toThrow();
    expect(() => createSimulatedCapture({ ...value, planes: [plane, plane] })).toThrow();
    expect(() => createSimulatedCapture({ ...value, noise: { ...value.noise, seedUint32: 2**32 } })).toThrow();
    expect(() => createSimulatedCapture({ ...value, sceneTimeSeconds: -1 })).toThrow();
    const capture = createSimulatedCapture(value).value;
    expect(() => parseSimulatedCapture({ ...capture, equivalentFocalLength35Mm: 999 })).toThrow();
    expect(() => parseSimulatedCapture({ ...capture, schemaVersion: "2" })).toThrow();
    expect(() => parseSimulatedCapture({ ...capture, resolvedGeometry: { hidden: "secret" } })).toThrow();
  });
  it("supports explicit infinity and retains historical creator API identity on archive read", () => {
    const value = input(); value.focus = { kind: "infinity" };
    const capture = createSimulatedCapture(value).value;
    expect(capture.focus).toEqual({ kind: "infinity" });
    expect(parseSimulatedCapture({ ...capture, engineApiVersion: "0.93.0" }).engineApiVersion).toBe("0.93.0");
    if (value.planes[0]!.storage.kind !== "inline-float64") throw new Error("fixture");
    const samples = [...value.planes[0]!.storage.samples]; samples[0] = -0;
    value.planes = [{ ...plane, storage: { kind: "inline-float64", samples } }];
    const committed = createSimulatedCapture(value).value.planes[0]!.storage;
    if (committed.kind !== "inline-float64") throw new Error("fixture");
    expect(Object.is(committed.samples[0], -0)).toBe(false);
  });
});
