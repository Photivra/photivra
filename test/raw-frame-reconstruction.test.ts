// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createSensorRawFrame, createSimulatedCapture, resolveRawFrameReconstruction, parseRawFrameReconstructionInput,
  resolveSensorRawReconstruction } from "../src/index.js";
import { loadSensorRawFrameInput } from "./helpers/sensor-raw-frame-fixture.js";

import { loadRawFrameReconstructionInput as input } from "./helpers/raw-frame-reconstruction-fixture.js";

describe("same-RAW native reconstruction handoff", () => {
  it("derives a signed interleaved plane from exact RAW values with child provenance and unchanged source codes", () => {
    const v = input(), before = JSON.stringify(v), r = resolveRawFrameReconstruction(v);
    expect(r.provenance.kind).toBe("approximation"); expect(r.value.linearPlane.channelIds).toEqual(["red", "green", "blue"]);
    expect(r.value.linearPlane.samples).toEqual(Array(4).fill([-64/959, 224/959, 1]).flat());
    expect(r.value.pixels.map((p) => p.value.centerSite)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
    expect(r.value.rawFrame.samples.map((s) => s.rawCode)).toEqual([0, 64, 512, 1023]);
    expect(r.value.lineage).toBe("engine-reconstructed-from-attached-raw"); expect(r.value.producerOriginVerified).toBe(false);
    expect(r.value.whiteBalanceApplied).toBe(false); expect(r.value.colorTransformApplied).toBe(false);
    expect(JSON.stringify(v)).toBe(before); expect(resolveRawFrameReconstruction(v)).toEqual(r);
    expect(Object.isFrozen(r.value.phaseProfiles[0]!.profile.kernels)).toBe(true);
    expect(Object.isFrozen(v.phaseProfiles[0]!.profile.kernels)).toBe(false);
    for (let i = 0; i < 4; i++) {
      const centerSite = r.value.pixels[i]!.value.centerSite, p = v.phaseProfiles[i]!.profile;
      expect(r.value.pixels[i]).toEqual(resolveSensorRawReconstruction({
        profile: p, colorSamplingProfile: v.rawFrame.colorSamplingProfile, centerSite, samples: v.rawFrame.samples }));
    }
  });
  it("responds only to the supplied RAW codes, not independent captured float planes", () => {
    const baseline = resolveRawFrameReconstruction(input()).value.linearPlane;
    const raw = loadSensorRawFrameInput(), s = raw.samples[2]!;
    s.rawCode = 960; s.blackSubtractedNormalizedCode = (960-64)/959;
    const v = input(), changed = resolveRawFrameReconstruction({ ...v, rawFrame: createSensorRawFrame(raw) });
    expect(changed.value.linearPlane.samples[1]).toBe(448/959);
    const c = raw.capture, captureInput = { captureId: c.captureId, sceneStateId: c.sceneStateId, sceneTimeSeconds: c.sceneTimeSeconds,
      geometry: c.geometry, exposure: c.exposure, focus: c.focus, noise: c.noise, source: c.source, whiteBalanceIntent: c.whiteBalanceIntent,
      adoptedWhiteXyz: c.adoptedWhiteXyz, models: c.models, planes: [{ ...c.planes[0]!, storage: { kind: "inline-float64" as const, samples: Array(12).fill(999) } }] };
    const original = loadSensorRawFrameInput(); original.capture = createSimulatedCapture(captureInput).value;
    expect(resolveRawFrameReconstruction({ ...v, rawFrame: createSensorRawFrame(original) }).value.linearPlane).toEqual(baseline);
  });
  it("retains absolute CFA phase for off-origin regions and ignores physical orientation during reconstruction", () => {
    for (const orientation of ["landscape", "portrait-clockwise", "landscape-inverted", "portrait-counter-clockwise"] as const) {
      const raw = loadSensorRawFrameInput(), c = raw.capture;
      const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _r, equivalentFocalLength35Mm: _f, ...captureInput } = c;
      void _s; void _e; void _r; void _f;
      raw.capture = createSimulatedCapture({ ...captureInput, geometry: { ...c.geometry, orientation } }).value;
      const v = input(), r = resolveRawFrameReconstruction({ ...v, rawFrame: createSensorRawFrame(raw), region: { x: 1, y: 1, width: 1, height: 1 } });
      expect(r.value.pixels[0]!.value.reconstructionProfileId).toBe("phase-3");
      expect(r.value.linearPlane.samples).toEqual([-64/959, 224/959, 1]);
      expect(r.value.physicalOrientationApplied).toBe(false); expect(r.value.outputCropApplied).toBe(false);
    }
    const v = input();
    expect(resolveRawFrameReconstruction({ ...v, phaseProfiles: [...v.phaseProfiles].reverse() })).toEqual(resolveRawFrameReconstruction(v));
  });
  it("rejects incomplete/duplicate/wrong phase, channel and mode dispatch and unsupported kernel policies", () => {
    const v = input(), p = v.phaseProfiles[0]!;
    for (const phaseProfiles of [v.phaseProfiles.slice(1), Array(4), [p, p, ...v.phaseProfiles.slice(2)],
      [{ ...p, phaseX: 2 }, ...v.phaseProfiles.slice(1)],
      [{ ...p, profile: { ...p.profile, captureModeId: "other" } }, ...v.phaseProfiles.slice(1)],
      [{ ...p, profile: { ...p.profile, colorSamplingProfileId: "other" } }, ...v.phaseProfiles.slice(1)],
      [{ ...p, profile: { ...p.profile, kernels: [...p.profile.kernels].reverse() } }, ...v.phaseProfiles.slice(1)],
      [{ ...p, profile: { ...p.profile, kernels: [] } }, ...v.phaseProfiles.slice(1)]]) {
      expect(() => parseRawFrameReconstructionInput({ ...v, phaseProfiles })).toThrow();
    }
    const wrong = input(); wrong.phaseProfiles[0]!.profile.kernels[0]!.contributions[0]!.sourceChannelId = "green";
    expect(() => resolveRawFrameReconstruction(wrong)).toThrow();
  });
  it("fails at missing edges instead of padding, clamping, dropping or renormalizing contributions", () => {
    for (const offsetX of [-1, 2, Number.MAX_SAFE_INTEGER]) {
      const v = input(); v.phaseProfiles[0]!.profile.kernels[0]!.contributions[0]!.offsetX = offsetX;
      expect(() => resolveRawFrameReconstruction(v)).toThrow();
    }
    for (const region of [{ x: -1, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 0, height: 1 },
      { x: 1, y: 0, width: 2, height: 1 }, { x: 0, y: NaN, width: 1, height: 1 }]) {
      expect(() => parseRawFrameReconstructionInput({ ...input(), region })).toThrow();
    }
  });
  it("rejects stale RAW codes/dimensions/flags, private fields and safety-bound overflow", () => {
    const v = input();
    for (const rawFrame of [{ ...v.rawFrame, nativePixelWidth: 3 }, { ...v.rawFrame, renderingApplied: true },
      { ...v.rawFrame, producerBinding: "verified" }, { ...v.rawFrame, samples: Array(4097).fill(v.rawFrame.samples[0]) },
      { ...v.rawFrame, samples: [{ ...v.rawFrame.samples[0], rawCode: 10 }, ...v.rawFrame.samples.slice(1)] }]) {
      expect(() => parseRawFrameReconstructionInput({ ...v, rawFrame })).toThrow();
    }
    expect(() => parseRawFrameReconstructionInput({ ...v, privatePath: "/private" })).toThrow();
    expect(() => parseRawFrameReconstructionInput(null)).toThrow();
    const p = v.phaseProfiles[0]!;
    expect(() => parseRawFrameReconstructionInput({ ...v, phaseProfiles: [{ ...p, profile: { ...p.profile, secret: true } }, ...v.phaseProfiles.slice(1)] })).toThrow();
    expect(() => parseRawFrameReconstructionInput({ ...v, phaseProfiles: [{ ...p, profile: { ...p.profile, kernels: Array(17).fill(p.profile.kernels[0]) } }, ...v.phaseProfiles.slice(1)] })).toThrow();
    const kernel = p.profile.kernels[0]!;
    expect(() => parseRawFrameReconstructionInput({ ...v, phaseProfiles: [{ ...p, profile: { ...p.profile, kernels: [{ ...kernel, contributions: Array(257).fill(kernel.contributions[0]) }] } }, ...v.phaseProfiles.slice(1)] })).toThrow();
  });
});
